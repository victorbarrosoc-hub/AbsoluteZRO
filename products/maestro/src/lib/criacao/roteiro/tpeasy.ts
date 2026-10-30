/**
 * "Para o TPeasy" direto (plano da Criação, fase F8; contrato em docs/integration-contracts/maestro-tpeasy.md na raiz):
 * a versão salva vai pela Absolute ZRO para a caixa de entrada do TPeasy da pessoa (ou de alguém da organização que usa
 * o TPeasy), sem copiar e colar. O TPeasy não tem banco: o HUB guarda (30 dias) e cada aparelho busca ao abrir.
 *
 * - O texto é montado AQUI, no servidor, da versão salva lida como a pessoa (RLS): a vista Teleprompter na marcação do
 *   TPeasy (`saidaTpeasy`, a mesma do Compartilhar/.txt/backup), o título, a meta de duração e o link de volta.
 * - `POST <HUB>/api/v1/apps/entregas` com o access token da sessão (escopo `maestro.projects`). O HUB confere a pessoa,
 *   o papel, o TPeasy no plano e o gate, e guarda uma entrega por destinatário e versão: mandar a mesma versão de novo
 *   não duplica ("reenviada"); versão nova atualiza o mesmo roteiro no TPeasy (ou vira cópia se a pessoa mexeu lá).
 * - Fica na auditoria (`roteiro.enviado`, destino `tpeasy`, formato `direto`, com o id da entrega).
 * - O estado ("Enviado ao TPeasy · v3 · agora · Recebido") e para quem dá para mandar vêm do HUB (`estadoTpeasy`).
 *
 * Gate na tela e aqui: `podeMandarParaTpeasy` (admin e gestão + TPeasy no plano e aberto). Sem ele, nada é pedido ao HUB.
 */
import { createHash } from "node:crypto";
import type { Sessao } from "@/lib/auth/sessao";
import { podeMandarParaTpeasy, PRODUTO_TPEASY } from "@/lib/criacao/permissoes";
import { basePonte } from "@/lib/sobedesce/ponte";
import { origemDoSite } from "@/lib/site";
import { ESCOPO_PROJETOS } from "@/lib/zro/config";
import { acessoIa } from "@/lib/zro/ia";
import { saidaTpeasy } from "./saidas";
import { obterVersao, registrarEnvio } from "./servidor";

export type Destinatario = { id: string; nome: string; foto: string | null; eu: boolean };
export type EnvioTpeasy = {
  id: string;
  item: string;
  versao: number;
  para: { id: string; nome: string; eu: boolean };
  criada_em: string;
  atualizada_em: string;
  recebida_em: string | null;
};
export type EstadoTpeasy = {
  /** Dá para mandar direto (o gate). Sem ele, `motivo` diz por quê, em poucas palavras. */
  pode: boolean;
  motivo: string | null;
  destinatarios: Destinatario[];
  /** O que esta pessoa mandou deste roteiro (mais novo primeiro). */
  enviados: EnvioTpeasy[];
};
type Falha = { ok: false; status: number; erro: string; mensagem: string };
const falha = (status: number, erro: string, mensagem: string): Falha => ({ ok: false, status, erro, mensagem });

export const SEM_TPEASY = "O plano da produtora não tem o TPeasy.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PESSOA = /^[A-Za-z0-9_-]{1,40}$/;

const MENSAGENS: Record<string, string> = {
  entitlement_required: SEM_TPEASY,
  product_unavailable: SEM_TPEASY,
  product_closed: "O TPeasy ainda não está aberto para essa conta.",
  forbidden_role: "Seu papel na organização não manda roteiros.",
  not_found: "Essa pessoa não usa o TPeasy na sua organização.",
  rate_limited: "Muitos envios seguidos. Espere alguns minutos.",
  invalid_input: "O roteiro não saiu no formato do TPeasy.",
};

async function noHub(
  sessao: Sessao,
  caminho: string,
  init: { method?: "GET" | "POST"; corpo?: unknown } = {},
): Promise<{ ok: true; dados: Record<string, unknown> } | Falha> {
  const at = await acessoIa(sessao.id, Date.now(), ESCOPO_PROJETOS);
  if ("erro" in at)
    return at.erro === "reconectar"
      ? falha(401, "reconectar_zro", "Entre de novo com a Absolute ZRO.")
      : falha(502, "hub_indisponivel", "A Absolute ZRO não respondeu agora. Tente de novo.");
  let res: Response;
  try {
    res = await fetch(`${basePonte()}${caminho}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${at.at}`, Accept: "application/json", ...(init.corpo ? { "Content-Type": "application/json" } : {}) },
      body: init.corpo ? JSON.stringify(init.corpo) : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return falha(502, "hub_indisponivel", "A Absolute ZRO não respondeu agora. Tente de novo.");
  }
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.status === 401) return falha(401, "reconectar_zro", "Entre de novo com a Absolute ZRO.");
  if (!res.ok || !j) {
    const codigo = typeof j?.error === "string" ? j.error : "hub";
    return falha(res.status >= 500 || !res.status ? 502 : res.status, codigo, MENSAGENS[codigo] ?? "A Absolute ZRO recusou o envio agora.");
  }
  return { ok: true, dados: j };
}

const destinatariosDe = (d: Record<string, unknown>): Destinatario[] =>
  (Array.isArray(d.destinatarios) ? d.destinatarios : [])
    .filter((x): x is Destinatario => !!x && typeof x === "object" && typeof (x as Destinatario).id === "string" && UUID.test((x as Destinatario).id))
    .map((x) => ({
      id: x.id,
      nome: String(x.nome ?? "").slice(0, 120) || "Pessoa",
      foto: typeof x.foto === "string" && /^https:\/\//.test(x.foto) ? x.foto : null,
      eu: !!x.eu,
    }));

const enviadosDe = (d: Record<string, unknown>): EnvioTpeasy[] =>
  (Array.isArray(d.entregas) ? d.entregas : [])
    .filter((x): x is EnvioTpeasy => !!x && typeof x === "object" && typeof (x as EnvioTpeasy).id === "string" && Number.isInteger((x as EnvioTpeasy).versao))
    .map((x) => ({
      id: x.id,
      item: typeof x.item === "string" ? x.item : "",
      versao: x.versao,
      para: { id: String(x.para?.id ?? ""), nome: String(x.para?.nome ?? "").slice(0, 120), eu: !!x.para?.eu },
      criada_em: String(x.criada_em),
      atualizada_em: String(x.atualizada_em),
      recebida_em: typeof x.recebida_em === "string" ? x.recebida_em : null,
    }));

/** Para a folha: dá para mandar? Para quem? O que já foi (com "Recebido")? Sem o gate, nada é pedido ao HUB. */
export async function estadoTpeasy(sessao: Sessao, roteiroId: string): Promise<EstadoTpeasy> {
  if (!podeMandarParaTpeasy(sessao)) return { pode: false, motivo: SEM_TPEASY, destinatarios: [], enviados: [] };
  if (!UUID.test(roteiroId)) return { pode: false, motivo: "Esse roteiro não existe mais.", destinatarios: [], enviados: [] };
  const [d, e] = await Promise.all([
    noHub(sessao, `/api/v1/apps/entregas/destinatarios?destino=${PRODUTO_TPEASY}`),
    noHub(sessao, `/api/v1/apps/entregas?roteiro=${roteiroId}`),
  ]);
  if (!d.ok) return { pode: false, motivo: d.mensagem, destinatarios: [], enviados: [] };
  return { pode: true, motivo: null, destinatarios: destinatariosDe(d.dados), enviados: e.ok ? enviadosDe(e.dados) : [] };
}

/**
 * Manda a versão n (só as falas de `pessoa`, ou todas) para o TPeasy de `para` (sem ele: a própria pessoa). Devolve o
 * estado do envio que o HUB guardou (nova ou reenviada) e anota na auditoria.
 */
export async function enviarAoTpeasy(
  sessao: Sessao,
  roteiroId: string,
  e: { n: number; pessoa: string | null; para: string | null; origem?: string | null },
): Promise<{ ok: true; envio: EnvioTpeasy & { situacao: "nova" | "reenviada" } } | Falha> {
  if (!podeMandarParaTpeasy(sessao)) return falha(403, "sem_tpeasy", SEM_TPEASY);
  if (!UUID.test(roteiroId) || !Number.isInteger(e.n) || e.n < 1) return falha(404, "nao_existe", "Essa versão não existe.");
  if (e.para !== null && !UUID.test(e.para)) return falha(400, "formato", "Escolha para quem mandar.");
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const v = await obterVersao(ctx, roteiroId, e.n);
  if (!v) return falha(404, "nao_existe", "Essa versão não existe.");
  const pessoa = e.pessoa && PESSOA.test(e.pessoa) && v.conteudo.pessoas.some((p) => p.id === e.pessoa) ? e.pessoa : null;
  const s = saidaTpeasy({ roteiroId, titulo: v.titulo, n: v.n, sha256: v.sha256, criadoEm: v.criadoEm, conteudo: v.conteudo }, pessoa);
  if (!s.texto.trim()) return falha(409, "vazio", pessoa ? "Essa pessoa não tem fala nesta versão." : "Esta versão ainda não tem fala.");
  const corpo = {
    destino: PRODUTO_TPEASY,
    tipo: "roteiro",
    ...(e.para && e.para !== sessao.sub ? { para: e.para } : {}),
    roteiro: { id: roteiroId, versao: v.n, pessoa, sha256: v.sha256 },
    titulo: s.titulo.slice(0, 300),
    corpo: s.texto.slice(0, 200_000),
    link: `${origemDoSite(e.origem)}/app/criacao/roteiros/${roteiroId}`,
    alvo_seg: Math.max(0, Math.min(3600, Math.round(v.conteudo.alvo?.max ?? 0))),
  };
  const r = await noHub(sessao, "/api/v1/apps/entregas", { method: "POST", corpo });
  if (!r.ok) return r;
  const [envio] = enviadosDe({ entregas: [r.dados] });
  if (!envio || (r.dados.situacao !== "nova" && r.dados.situacao !== "reenviada")) return falha(502, "hub", "Resposta inesperada da Absolute ZRO.");
  // auditoria do Maestro: o que saiu, de qual versão (sha256 do banco), para quem e qual entrega (nunca o texto)
  await registrarEnvio(ctx, roteiroId, {
    n: v.n,
    destino: "tpeasy",
    formato: "direto",
    pessoa,
    extra: {
      entrega: envio.id,
      para_eu: envio.para.eu,
      situacao: r.dados.situacao as string,
      texto_sha256: createHash("sha256").update(corpo.corpo).digest("hex"),
    },
  });
  return { ok: true, envio: { ...envio, situacao: r.dados.situacao as "nova" | "reenviada" } };
}
