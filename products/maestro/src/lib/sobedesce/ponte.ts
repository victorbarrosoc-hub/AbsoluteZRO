/**
 * A ponte com o SOBEDESCE (plano v2 §5, fases 7–10; contrato em docs/integration-contracts/maestro-sobedesce.md):
 * 1. O servidor do Maestro pede ao HUB um pedido assinado (`POST <HUB>/api/v1/apps/pedidos`, com o access token da
 *    sessão, escopo `maestro.projects`). O HUB confere a pessoa, a organização e o SOBEDESCE no plano (403 sem ele).
 * 2. O próprio Maestro chama o SOBEDESCE na `url` devolvida, com `Authorization: Bearer <zro-pedido+jwt>`. O HUB não vê
 *    a resposta; nenhum byte de arquivo passa por aqui (só metadados, links curtos e o token curto do Drive).
 * Desfazer o compartilhamento de revisão também anda sem a pessoa (agendamento): credencial do próprio Maestro (Basic)
 * e o `sub` de quem compartilhou (`recolherSemPessoa`).
 *
 * Nada daqui fica guardado, exceto o que a revisão precisa para desfazer (`versoes.compartilhamento`). O token do Drive
 * (`drive.token`) só passa para a aba que pediu e nunca vai para banco ou log.
 */
import { temProduto } from "@/lib/auth/acesso";
import type { Sessao } from "@/lib/auth/sessao";
import { acessoIa } from "@/lib/zro/ia";
import { credenciaisZro, emissor, ESCOPO_PROJETOS, zroConfigurado } from "@/lib/zro/config";

export const PRODUTO_SOBEDESCE = "sobedesce";
export const GOOGLE_API = "https://www.googleapis.com/drive/v3";

/**
 * As ações que o Maestro pede ao SOBEDESCE e a rota de cada uma (a mesma lista de `PONTES` do HUB). As `relay.*` são
 * as versões de entrega pelo Relay (contrato "Maestro → Relay" em docs/integration-contracts/relay.md): o SOBEDESCE
 * guarda o pedido na fila e o computador da conta converte.
 */
export const CAMINHOS = {
  "drive.listar": "/api/zro/drive/listar",
  "drive.miniatura": "/api/zro/drive/miniatura",
  "drive.pasta.criar": "/api/zro/drive/pasta/criar",
  "drive.compartilhar_revisao": "/api/zro/drive/revisao/compartilhar",
  "drive.recolher_revisao": "/api/zro/drive/revisao/recolher",
  "drive.token": "/api/zro/drive/token",
  "relay.converter": "/api/zro/relay/converter",
  "relay.pedido": "/api/zro/relay/pedido",
  "relay.cancelar": "/api/zro/relay/cancelar",
} as const;
export type AcaoPonte = keyof typeof CAMINHOS;
export const PRODUTO_RELAY = "relay";

/**
 * `ambiguo`: o pedido saiu para o SOBEDESCE e a resposta não voltou inteira (rede, tempo, 5xx, corpo estranho). Ninguém
 * sabe se ele fez: quem chama manda para revisão e nunca tenta de novo sozinho (regra da raiz). Recusa do HUB nunca é
 * ambígua (nada saiu).
 */
export type Falha = { ok: false; status: number; erro: string; mensagem: string; ambiguo?: true };
export type Resultado<T> = { ok: true; dados: T } | Falha;

const falha = (status: number, erro: string, mensagem: string): Falha => ({ ok: false, status, erro, mensagem });
export const SEM_SOBEDESCE = () => falha(403, "sem_sobedesce", "Arquivos faz parte dos planos com SOBEDESCE.");
export const SEM_RELAY = () => falha(403, "sem_relay", "O Relay ainda não está liberado para a sua conta.");

/** Onde fica a ponte (o HUB). Padrão: o emissor do login único; `MAESTRO_PONTE_URL` só para o teste com HUB falso. */
export function basePonte(): string {
  return (process.env.MAESTRO_PONTE_URL?.trim() || emissor()).replace(/\/$/, "");
}

const loopback = (u: URL) => u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");

/**
 * A `url` que o HUB devolveu: https sempre; http só em loopback e só quando a própria ponte está em loopback (teste).
 * Caminho só os de /api/zro/drive/ e /api/zro/relay/; com a ação, exatamente a rota dela.
 */
export function urlConfere(bruta: unknown, acao?: AcaoPonte): URL | null {
  if (typeof bruta !== "string") return null;
  try {
    const u = new URL(bruta);
    const ok = u.protocol === "https:" || (loopback(u) && loopback(new URL(basePonte())));
    if (!ok || u.username || u.password || u.search || u.hash || !/^\/api\/zro\/(drive|relay)\/[a-z/]+$/.test(u.pathname)) return null;
    if (acao && u.pathname !== CAMINHOS[acao]) return null;
    return u;
  } catch {
    return null;
  }
}

/** A API do Google que o navegador chama (listagem e stream). Sempre o Google; o e2e intercepta no navegador. */
export function apiDoGoogle(): string {
  return GOOGLE_API;
}

type Pedido = { token: string; url: URL };

async function pedirAoHub(autorizacao: string, corpo: { destino: string; acao: AcaoPonte; sub?: string }): Promise<Resultado<Pedido>> {
  let res: Response;
  try {
    res = await fetch(`${basePonte()}/api/v1/apps/pedidos`, {
      method: "POST",
      headers: { Authorization: autorizacao, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(corpo),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return falha(502, "hub_indisponivel", "A Absolute ZRO não respondeu agora. Tente de novo.");
  }
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.status === 401) return falha(401, "reconectar_zro", "Entre de novo com a Absolute ZRO.");
  if (res.status === 403) {
    // O HUB diz qual produto falta (`details.product`): o Relay ou o SOBEDESCE. Ação fora da lista dele (ainda sem as
    // `relay.*` na PONTES) também é 403, e a pessoa não tem o que fazer: "ainda não está liberado".
    const det = (j?.details ?? null) as Record<string, unknown> | null;
    if (det?.product === PRODUTO_RELAY || (corpo.acao.startsWith("relay.") && j?.error === "action_not_allowed")) return SEM_RELAY();
    return SEM_SOBEDESCE();
  }
  if (!res.ok || !j) return falha(502, typeof j?.error === "string" ? j.error : "hub", "A Absolute ZRO recusou o pedido agora.");
  const url = urlConfere(j.url, corpo.acao);
  if (typeof j.token !== "string" || !url) return falha(502, "hub", "Resposta inesperada da Absolute ZRO.");
  return { ok: true, dados: { token: j.token, url } };
}

const MENSAGENS: Record<string, string> = {
  sem_vinculo: "Entre uma vez no SOBEDESCE com a sua conta Absolute ZRO e conecte o Google Drive.",
  sem_drive: "Conecte o Google Drive no SOBEDESCE para ver seus arquivos aqui.",
  reconectar_drive: "O Google pediu para reconectar o Drive no SOBEDESCE.",
  sem_acesso_zro: "Arquivos faz parte dos planos com SOBEDESCE.",
  sem_relay: "O Relay ainda não está liberado para a sua conta.",
};

async function chamarDestino<T>(p: Pedido, corpo: Record<string, unknown>): Promise<Resultado<T>> {
  let res: Response;
  try {
    res = await fetch(p.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(corpo),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ...falha(502, "sobedesce_indisponivel", "O SOBEDESCE não respondeu agora. Tente de novo."), ambiguo: true };
  }
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !j) {
    const erro = typeof j?.erro === "string" ? j.erro : "sobedesce";
    const mensagem = MENSAGENS[erro] ?? (typeof j?.mensagem === "string" ? j.mensagem.slice(0, 300) : "O SOBEDESCE não conseguiu agora.");
    const f = falha(res.status === 403 ? 403 : res.status >= 500 ? 502 : res.status, erro, mensagem);
    return res.status >= 500 || res.ok ? { ...f, ambiguo: true } : f;
  }
  return { ok: true, dados: j as T };
}

/**
 * Uma ação no SOBEDESCE em nome da pessoa da sessão. Sem o SOBEDESCE no plano: 403 sem nem pedir ao HUB; as `relay.*`
 * pedem também o Relay (o HUB confere de novo).
 */
export async function noSobedesce<T = Record<string, unknown>>(sessao: Sessao, acao: AcaoPonte, corpo: Record<string, unknown> = {}): Promise<Resultado<T>> {
  if (acao !== "drive.recolher_revisao" && !temProduto(sessao, PRODUTO_SOBEDESCE)) return SEM_SOBEDESCE();
  if (acao.startsWith("relay.") && !temProduto(sessao, PRODUTO_RELAY)) return SEM_RELAY();
  const at = await acessoIa(sessao.id, Date.now(), ESCOPO_PROJETOS);
  if ("erro" in at)
    return at.erro === "reconectar"
      ? falha(401, "reconectar_zro", "Entre de novo com a Absolute ZRO.")
      : falha(502, "hub_indisponivel", "A Absolute ZRO não respondeu agora. Tente de novo.");
  const p = await pedirAoHub(`Bearer ${at.at}`, { destino: PRODUTO_SOBEDESCE, acao });
  return p.ok ? chamarDestino<T>(p.dados, corpo) : p;
}

/** Recolher o "qualquer pessoa com o link" sem a pessoa (agendamento): credencial do Maestro + o `sub` de quem ligou. */
export async function recolherSemPessoa(sub: string, arquivoId: string, permissaoId: string): Promise<Resultado<{ recolhido: true; ja_nao_havia: boolean }>> {
  if (!zroConfigurado()) return falha(503, "sem_config", "Login único não configurado.");
  const { clientId, clientSecret } = credenciaisZro();
  const basic = `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64")}`;
  const p = await pedirAoHub(basic, { destino: PRODUTO_SOBEDESCE, acao: "drive.recolher_revisao", sub });
  return p.ok ? chamarDestino(p.dados, { arquivoId, permissaoId }) : p;
}

/** Link do app do SOBEDESCE (só os formatos que ele entende: #drive/<pasta> e #arquivo/<id>). */
export function linkNoSobedesce(id: string, tipo: "pasta" | "arquivo"): string | null {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) return null;
  const base = (process.env.MAESTRO_SOBEDESCE_URL?.trim() || "https://sobedesce.com").replace(/\/$/, "");
  return `${base}/app/#${tipo === "pasta" ? "drive" : "arquivo"}/${id}`;
}
