/**
 * A Z, a IA do ecossistema Absolute ZRO, dentro do SOBEDESCE (27/10/2026).
 *
 * O painel é o <zro-ia> (absolutezro.com/ia/v1/zro-ia.js) com `api="/api/zro/ia"`: o navegador (site, app do celular)
 * e o app de computador (pelo motor local, com o Bearer do dispositivo) falam só com o SOBEDESCE, e este repasse
 * acrescenta no servidor o token da Absolute ZRO com o escopo `zro.ia`. Token nunca vai ao navegador nem a log.
 *
 * - Os tokens são da CONTA (contas_zro.ia, cifrados com SOBEDESCE_KEY), não da sessão: entrou uma vez pela Absolute
 *   ZRO, a Z abre no site, no celular e no computador.
 * - O refresh token RODA: cada troca devolve um novo e o velho, reapresentado, derruba a família na Absolute ZRO. A
 *   troca acontece com a linha travada (select … for update), então dois pedidos ao mesmo tempo esperam um pelo outro
 *   e o segundo já usa o access token novo.
 * - Sem token, token recusado ou escopo faltando: 401 `reconectar_zro`. O <zro-ia> dispara `zro-ia:sem-login` e a tela
 *   oferece "Reconectar com Absolute ZRO" (/api/zro/entrar?modo=vincular).
 * - Só os caminhos da API da IA que o painel usa passam; a resposta de /mensagens (NDJSON) é repassada sem buffer.
 */
import { eq } from "drizzle-orm";
import { SEM_SESSAO, semAcesso, usuarioDaRequisicao } from "@/lib/auth/requisicao";
import { db, schema } from "@/lib/db";
import { abrir, selar } from "@/lib/google/cripto";
import { erro, origemConfere } from "@/lib/http";
import { origensDoSite } from "@/lib/site";
import { emissor, ESCOPO_IA } from "./config";
import { renovarTokensIa, type TokensIa } from "./oidc";

const { contasZro } = schema;
const contexto = (usuarioId: string) => `contas_zro.ia:${usuarioId}`;
const MAX_CORPO = 64_000;
const ID = /^[A-Za-z0-9_-]{1,80}$/;

export const MENSAGEM_RECONECTAR = "Entre de novo com a Absolute ZRO para conversar com a Z.";
const RECONECTAR = () => erro(401, "reconectar_zro", MENSAGEM_RECONECTAR);

/** Guarda os tokens da Z vindos de um login pela Absolute ZRO. Sem tokens (login sem zro.ia), não mexe no que já há. */
export async function guardarTokensIa(usuarioId: string, ia: TokensIa | null): Promise<void> {
  if (!ia) return;
  await db
    .update(contasZro)
    .set({ ia: selar(JSON.stringify(ia), contexto(usuarioId)) })
    .where(eq(contasZro.usuarioId, usuarioId));
}

export async function apagarTokensIa(usuarioId: string): Promise<void> {
  await db.update(contasZro).set({ ia: null }).where(eq(contasZro.usuarioId, usuarioId));
}

function lerTokens(usuarioId: string, selado: string | null): TokensIa | null {
  if (!selado) return null;
  try {
    const t = JSON.parse(abrir(selado, contexto(usuarioId))) as TokensIa;
    return typeof t.at === "string" && typeof t.rt === "string" && typeof t.atExp === "number" ? t : null;
  } catch {
    return null;
  }
}

/** Os tokens cobrem o escopo? Os de antes do Set não guardam o escopo: só valem para a Z. */
const cobre = (tokens: TokensIa, escopo: string) => (tokens.escopo ?? ESCOPO_IA).split(" ").includes(escopo);

/**
 * O access token da Absolute ZRO para esta conta (escopo da Z por padrão; o Set pede `zro.set`): o guardado, se ainda
 * vale um minuto; senão troca o refresh (com a linha travada) e guarda o novo. `reconectar`: não há token, falta o
 * escopo ou a Absolute ZRO recusou. `rede`: a Absolute ZRO não respondeu.
 */
export async function acessoIa(usuarioId: string, agora = Date.now(), escopo: string = ESCOPO_IA): Promise<{ at: string } | { erro: "reconectar" | "rede" }> {
  return db.transaction(async (t) => {
    const [linha] = await t.select({ ia: contasZro.ia }).from(contasZro).where(eq(contasZro.usuarioId, usuarioId)).for("update");
    const tokens = lerTokens(usuarioId, linha?.ia ?? null);
    if (!tokens || !cobre(tokens, escopo)) return { erro: "reconectar" as const };
    if (tokens.atExp - 60 > Math.floor(agora / 1000)) return { at: tokens.at };
    let r: Awaited<ReturnType<typeof renovarTokensIa>>;
    try {
      r = await renovarTokensIa(tokens.rt);
    } catch {
      return { erro: "rede" as const };
    }
    if (!r.ia) {
      if (r.recusado) await t.update(contasZro).set({ ia: null }).where(eq(contasZro.usuarioId, usuarioId));
      return { erro: r.recusado ? ("reconectar" as const) : ("rede" as const) };
    }
    await t
      .update(contasZro)
      .set({ ia: selar(JSON.stringify(r.ia), contexto(usuarioId)) })
      .where(eq(contasZro.usuarioId, usuarioId));
    return cobre(r.ia, escopo) ? { at: r.ia.at } : { erro: "reconectar" as const };
  });
}

/** O caminho pedido, se é um que o painel da Z usa com este método; senão null. */
export function caminhoIa(partes: string[], metodo: string): string | null {
  const [a, b, ...resto] = partes;
  if (resto.length) return null;
  if (a === "estado" && !b && metodo === "GET") return "estado";
  if (a === "conversas" && !b && metodo === "GET") return "conversas";
  if (a === "conversas" && b && ID.test(b) && (metodo === "GET" || metodo === "DELETE")) return `conversas/${b}`;
  if (a === "mensagens" && !b && metodo === "POST") return "mensagens";
  return null;
}

/** GET/POST/DELETE /api/zro/ia/<caminho> → Absolute ZRO /api/v1/ia/<caminho>, com o Bearer da conta. */
export async function repassarIa(req: Request, partes: string[]): Promise<Response> {
  const caminho = caminhoIa(partes, req.method);
  if (!caminho) return erro(404, "nao_encontrado", "Não encontrado.");
  const atual = await usuarioDaRequisicao(req);
  if (!atual) return SEM_SESSAO();
  const bloqueio = semAcesso(atual);
  if (bloqueio) return bloqueio;
  const mutacao = req.method !== "GET";
  if (mutacao && atual.via === "cookie" && !origemConfere(req.headers, req.url, origensDoSite())) {
    return erro(403, "origem", "Pedido de outra origem recusado.");
  }
  let corpo: string | undefined;
  if (req.method === "POST") {
    if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) return erro(415, "formato", "Mande JSON.");
    corpo = await req.text();
    if (corpo.length > MAX_CORPO) return erro(413, "grande", "Mensagem grande demais.");
  }

  const acesso = await acessoIa(atual.usuario.id);
  if ("erro" in acesso) return acesso.erro === "reconectar" ? RECONECTAR() : erro(502, "rede", "A Absolute ZRO não respondeu agora. Tente de novo.");

  let resposta: Response;
  try {
    resposta = await fetch(`${emissor()}/api/v1/ia/${caminho}`, {
      method: req.method,
      headers: { Authorization: `Bearer ${acesso.at}`, Accept: "application/json, application/x-ndjson", ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: corpo,
      cache: "no-store",
      redirect: "error",
      signal: req.signal,
    });
  } catch {
    return erro(502, "rede", "A Absolute ZRO não respondeu agora. Tente de novo.");
  }
  // Token recusado lá (acesso do app removido, escopo faltando): esquece e pede para entrar de novo.
  if (resposta.status === 401) {
    await resposta.body?.cancel().catch(() => {});
    await apagarTokensIa(atual.usuario.id);
    return RECONECTAR();
  }
  const headers = new Headers({ "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
  const tipo = resposta.headers.get("content-type");
  if (tipo) headers.set("Content-Type", tipo);
  return new Response(resposta.body, { status: resposta.status, headers });
}
