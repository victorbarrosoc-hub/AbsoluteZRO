/**
 * A Z, a IA do ecossistema Absolute ZRO, dentro do Maestro (molde: products/sobedesce/web/src/lib/zro/ia.ts).
 *
 * O painel é o <zro-ia> (absolutezro.com/ia/v1/zro-ia.js) com `api="/api/zro/ia"`: o navegador fala só com o Maestro,
 * e este repasse acrescenta no servidor o token da Absolute ZRO com o escopo `zro.ia`. Token nunca vai ao navegador
 * nem a log.
 * - Os tokens são da SESSÃO (sessions.zro_tokens_enc). O refresh token RODA: a troca acontece com a linha travada.
 * - Sem token, token recusado ou escopo faltando: 401 `reconectar_zro`. O <zro-ia> dispara `zro-ia:sem-login` e a
 *   tela oferece "Entrar de novo com Absolute ZRO".
 * - Só os caminhos da API da IA que o painel usa passam; a resposta de /mensagens (NDJSON) é repassada sem buffer.
 * - Sem acesso ao Maestro (temAcesso): 403, como toda rota de dados.
 */
import { exigirAcesso } from "@/lib/auth/requisicao";
import { comTokensDaSessao } from "@/lib/auth/sessao";
import { erro, origemConfere } from "@/lib/http";
import { origensDoSite } from "@/lib/site";
import { emissor, ESCOPO_IA } from "./config";
import { renovarTokens } from "./oidc";

const MAX_CORPO = 64_000;
const ID = /^[A-Za-z0-9_-]{1,80}$/;

export const MENSAGEM_RECONECTAR = "Entre de novo com a Absolute ZRO para conversar com a Z.";
const RECONECTAR = () => erro(401, "reconectar_zro", MENSAGEM_RECONECTAR);

/**
 * O access token da Absolute ZRO para esta sessão (escopo da Z por padrão; a ponte do Drive usa `maestro.projects`): o guardado, se ainda vale um minuto; senão troca o refresh (com a linha
 * travada) e guarda o novo. `reconectar`: não há token, falta o escopo ou a Absolute ZRO recusou. `rede`: não respondeu.
 */
export async function acessoIa(sessaoId: string, agora = Date.now(), escopo: string = ESCOPO_IA): Promise<{ at: string } | { erro: "reconectar" | "rede" }> {
  return comTokensDaSessao(sessaoId, async (tokens, guardar) => {
    if (!tokens || !tokens.escopo.split(" ").includes(escopo)) return { erro: "reconectar" as const };
    if (tokens.atExp - 60 > Math.floor(agora / 1000)) return { at: tokens.at };
    let r: Awaited<ReturnType<typeof renovarTokens>>;
    try {
      r = await renovarTokens(tokens.rt);
    } catch {
      return { erro: "rede" as const };
    }
    if (!r.tokens) {
      if (r.recusado) await guardar(null);
      return { erro: r.recusado ? ("reconectar" as const) : ("rede" as const) };
    }
    await guardar(r.tokens);
    return { at: r.tokens.at };
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

/** GET/POST/DELETE /api/zro/ia/<caminho> → Absolute ZRO /api/v1/ia/<caminho>, com o Bearer da sessão. */
export async function repassarIa(req: Request, partes: string[]): Promise<Response> {
  const caminho = caminhoIa(partes, req.method);
  if (!caminho) return erro(404, "nao_encontrado", "Não encontrado.");
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  if (req.method !== "GET" && !origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outra origem recusado.");
  let corpo: string | undefined;
  if (req.method === "POST") {
    if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) return erro(415, "formato", "Mande JSON.");
    corpo = await req.text();
    if (corpo.length > MAX_CORPO) return erro(413, "grande", "Mensagem grande demais.");
  }

  const acesso = await acessoIa(s.id);
  if ("erro" in acesso) return acesso.erro === "reconectar" ? RECONECTAR() : erro(502, "rede", "A Absolute ZRO não respondeu agora. Tente de novo.");

  let resposta: Response;
  try {
    resposta = await fetch(`${emissor()}/api/v1/ia/${caminho}`, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${acesso.at}`,
        Accept: "application/json, application/x-ndjson",
        ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}),
      },
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
    await resposta.body?.cancel().catch(() => undefined);
    await comTokensDaSessao(s.id, (_, guardar) => guardar(null));
    return RECONECTAR();
  }
  const headers = new Headers({ "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
  const tipo = resposta.headers.get("content-type");
  if (tipo) headers.set("Content-Type", tipo);
  return new Response(resposta.body, { status: resposta.status, headers });
}
