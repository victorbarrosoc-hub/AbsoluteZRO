/**
 * Pessoas da Absolute ZRO (ADR 0029 do HUB; contrato em docs/integration-contracts/pessoas.md): a busca por @ ou nome,
 * o perfil de um @ e o convite pelo @, sempre pela API do HUB com o access token da sessão e o escopo `zro.pessoas`
 * (pedido no login; HUB antigo cai em `nivel=sem_pessoas`). Nada aqui recebe e-mail ou telefone de ninguém: o HUB não
 * manda. Sem "server-only": os testes chamam direto (HUB falso em tests/ponte-falsa.mts).
 */
import { acessoIa } from "@/lib/zro/ia";
import { ESCOPO_PESSOAS, emissor } from "@/lib/zro/config";
import { basePonte } from "@/lib/sobedesce/ponte";

export type PessoaZro = {
  /** O sub do login único (é por ele que o freela fica ligado). */
  id: string;
  arroba: string;
  nome: string;
  foto: string | null;
  funcoes: { chave: string; nome: string }[];
  cidade: string | null;
  portfolio: string | null;
  bio: string | null;
  selos: { produto: string; texto: string }[];
};

export type FalhaPessoas = { ok: false; estado: "reconectar_zro" | "nao_achou" | "conflito" | "sem_permissao" | "limite" | "erro"; mensagem: string };
export type RespostaPessoas<T> = ({ ok: true } & T) | FalhaPessoas;

const ARROBA = /^[a-z0-9._]{3,30}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** O que veio do HUB, conferido no formato (o resto é jogado fora). */
export function pessoaDoHub(v: unknown): PessoaZro | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (typeof p.id !== "string" || !UUID.test(p.id) || typeof p.arroba !== "string" || !ARROBA.test(p.arroba)) return null;
  const foto = typeof p.foto === "string" && /^https?:\/\//.test(p.foto) ? p.foto : null;
  const portfolio = typeof p.portfolio === "string" && /^https:\/\//.test(p.portfolio) ? p.portfolio.slice(0, 300) : null;
  const funcoes = Array.isArray(p.funcoes)
    ? p.funcoes
        .map((f) =>
          f && typeof f === "object" ? { chave: txt((f as Record<string, unknown>).chave, 20), nome: txt((f as Record<string, unknown>).nome, 40) } : null,
        )
        .filter((f): f is { chave: string; nome: string } => !!f?.chave && !!f.nome)
        .slice(0, 12)
    : [];
  const selos = Array.isArray(p.selos)
    ? p.selos
        .map((s) =>
          s && typeof s === "object"
            ? { produto: txt((s as Record<string, unknown>).produto, 40), texto: txt((s as Record<string, unknown>).texto, 60) }
            : null,
        )
        .filter((s): s is { produto: string; texto: string } => !!s?.produto && !!s.texto)
        .slice(0, 12)
    : [];
  return {
    id: p.id.toLowerCase(),
    arroba: p.arroba,
    nome: txt(p.nome, 120) ?? `@${p.arroba}`,
    foto,
    funcoes,
    cidade: txt(p.cidade, 80),
    portfolio,
    bio: txt(p.bio, 280),
    selos,
  };
}

const MENSAGENS: Record<FalhaPessoas["estado"], string> = {
  reconectar_zro: "Entre de novo com a Absolute ZRO para buscar pessoas.",
  nao_achou: "Não achamos esse @.",
  conflito: "Essa pessoa já está na equipe ou já tem convite aberto.",
  sem_permissao: "Só quem administra a organização na Absolute ZRO convida.",
  limite: "Muitas buscas seguidas. Espere alguns minutos.",
  erro: "A Absolute ZRO não respondeu agora. Tente de novo.",
};
const falhou = (estado: FalhaPessoas["estado"]): FalhaPessoas => ({ ok: false, estado, mensagem: MENSAGENS[estado] });

async function naApiDePessoas(sessaoId: string, metodo: "GET" | "POST", caminho: string, corpo?: unknown, token?: string) {
  let at = token;
  if (!at) {
    const a = await acessoIa(sessaoId, Date.now(), ESCOPO_PESSOAS);
    if ("erro" in a) return { falha: falhou(a.erro === "reconectar" ? "reconectar_zro" : "erro") };
    at = a.at;
  }
  let res: Response;
  try {
    res = await fetch(`${basePonte()}/api/v1/pessoas/${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${at}`, Accept: "application/json", ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { falha: falhou("erro") };
  }
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok) return { dados: j ?? {} };
  if (res.status === 401) return { falha: falhou("reconectar_zro") };
  if (res.status === 404) return { falha: falhou("nao_achou") };
  if (res.status === 409) return { falha: { ...falhou("conflito"), mensagem: typeof j?.message === "string" ? j.message : MENSAGENS.conflito } };
  if (res.status === 403) return { falha: falhou("sem_permissao") };
  if (res.status === 429) return { falha: falhou("limite") };
  return { falha: falhou("erro") };
}

/** Busca por @ (começo) ou nome. Menos de 2 letras: lista vazia, sem chamar o HUB. */
export async function buscarPessoas(sessaoId: string, q: string, o: { token?: string } = {}): Promise<RespostaPessoas<{ pessoas: PessoaZro[] }>> {
  const t = String(q ?? "")
    .trim()
    .slice(0, 60);
  if (t.replace(/^@/, "").length < 2) return { ok: true, pessoas: [] };
  const r = await naApiDePessoas(sessaoId, "GET", `busca?q=${encodeURIComponent(t)}&limite=12`, undefined, o.token);
  if ("falha" in r) return r.falha!;
  const lista = Array.isArray((r.dados as { pessoas?: unknown }).pessoas)
    ? ((r.dados as { pessoas: unknown[] }).pessoas.map(pessoaDoHub).filter(Boolean) as PessoaZro[])
    : [];
  return { ok: true, pessoas: lista };
}

/** O perfil atual de um @ (um @ antigo leva ao atual). */
export async function pessoaPorArroba(sessaoId: string, arroba: string, o: { token?: string } = {}): Promise<RespostaPessoas<{ pessoa: PessoaZro }>> {
  const a = arroba.trim().replace(/^@/, "").toLowerCase();
  if (!ARROBA.test(a)) return falhou("nao_achou");
  const r = await naApiDePessoas(sessaoId, "GET", `@${a}`, undefined, o.token);
  if ("falha" in r) return r.falha!;
  const pessoa = pessoaDoHub((r.dados as { pessoa?: unknown }).pessoa);
  return pessoa ? { ok: true, pessoa } : falhou("erro");
}

/** Papel do Maestro → papel do convite na Absolute ZRO (a tabela de src/lib/papeis.ts ao contrário). */
export const PAPEL_DO_CONVITE = { gestor: "manager", equipe: "editor", leitura: "viewer" } as const;
export type PapelConvite = keyof typeof PAPEL_DO_CONVITE;

/** Convida o @ para a organização na Absolute ZRO. A pessoa aceita lá antes de entrar. */
export async function convidarPessoa(
  sessaoId: string,
  arroba: string,
  papel: PapelConvite,
  o: { token?: string } = {},
): Promise<RespostaPessoas<{ arroba: string }>> {
  const a = arroba.trim().replace(/^@/, "").toLowerCase();
  if (!ARROBA.test(a) || !(papel in PAPEL_DO_CONVITE)) return falhou("nao_achou");
  const r = await naApiDePessoas(sessaoId, "POST", "convites", { arroba: a, papel: PAPEL_DO_CONVITE[papel] }, o.token);
  if ("falha" in r) return r.falha!;
  return { ok: true, arroba: a };
}

/** O perfil da pessoa na Absolute ZRO (página do @, só para quem entrou). */
export const linkDoPerfil = (arroba: string) => `${emissor()}/pessoas/@${arroba}`;
