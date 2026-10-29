/**
 * O Set da Absolute ZRO (ADR 0031 do HUB) dentro do Maestro: quem da equipe e dos contatos está online e as conversas.
 * O widget é o `<zro-set>` (absolutezro.com/set/v1/zro-set.js) com `api="/api/zro/set"`: o navegador fala só com o
 * Maestro, e este repasse acrescenta no servidor o token da sessão com o escopo `zro.set` (o mesmo cofre da Z,
 * `acessoIa`). Token nunca vai ao navegador nem a log; o conteúdo das mensagens também não vai a log.
 * - Só os caminhos e métodos da API do Set passam (`caminhoSet`); o resto é 404.
 * - Sem token com o escopo (login antigo): 401 `reconectar_zro` e o widget some sem alarde. Diferente da Z, um 401 da
 *   Absolute ZRO aqui NÃO apaga os tokens (eles continuam valendo para a Z e o resto).
 * - Sem acesso ao Maestro: 403, como toda rota de dados.
 */
import { exigirAcesso } from "@/lib/auth/requisicao";
import { erro, origemConfere } from "@/lib/http";
import { origensDoSite } from "@/lib/site";
import { emissor, ESCOPO_SET } from "./config";
import { acessoIa } from "./ia";

const MAX_CORPO = 20_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O caminho da API do Set (sem a barra do começo), se ele existe com este método; senão null. */
export function caminhoSet(partes: string[], metodo: string): string | null {
  const [a, b, c, ...resto] = partes;
  if (resto.length) return null;
  const id = b && UUID.test(b) ? b : null;
  const ok = (m: string[], caminho: string) => (m.includes(metodo) ? caminho : null);
  if (!a) return ok(["GET", "POST"], "");
  if (a === "preferencias" && !b) return ok(["PUT"], a);
  if (a === "contatos" && !b) return ok(["GET", "POST"], a);
  if (a === "contatos" && id && !c) return ok(["PUT", "DELETE"], `${a}/${id}`);
  if (a === "bloqueios" && !b) return ok(["POST"], a);
  if (a === "bloqueios" && id && !c) return ok(["DELETE"], `${a}/${id}`);
  if (a === "conversas" && !b) return ok(["GET", "POST"], a);
  if (a === "conversas" && id && !c) return ok(["GET", "PATCH"], `${a}/${id}`);
  if (a === "conversas" && id && c === "mensagens") return ok(["POST"], `${a}/${id}/mensagens`);
  if (a === "mensagens" && id && !c) return ok(["PATCH", "DELETE"], `${a}/${id}`);
  if (a === "denuncias" && !b) return ok(["POST"], a);
  return null;
}

/** Só os parâmetros de leitura da conversa seguem (números). */
function busca(req: Request, caminho: string): string {
  if (!/^conversas\/[^/]+$/.test(caminho) || req.method !== "GET") return "";
  const q = new URL(req.url).searchParams;
  const out = new URLSearchParams();
  for (const k of ["antes", "depois", "limite"]) {
    const v = q.get(k);
    if (v && /^\d{1,15}$/.test(v)) out.set(k, v);
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

/** /api/zro/set/<caminho> → Absolute ZRO /api/v1/set/<caminho>, com o Bearer da sessão. */
export async function repassarSet(req: Request, partes: string[]): Promise<Response> {
  const caminho = caminhoSet(partes, req.method);
  if (caminho === null) return erro(404, "nao_encontrado", "Não encontrado.");
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  if (req.method !== "GET" && !origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outra origem recusado.");
  let corpo: string | undefined;
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) return erro(415, "formato", "Mande JSON.");
    corpo = await req.text();
    if (corpo.length > MAX_CORPO) return erro(413, "grande", "Mensagem grande demais.");
  }
  const acesso = await acessoIa(s.id, Date.now(), ESCOPO_SET);
  if ("erro" in acesso)
    return acesso.erro === "reconectar"
      ? erro(401, "reconectar_zro", "Entre de novo com a Absolute ZRO para ver o Set.")
      : erro(502, "rede", "A Absolute ZRO não respondeu agora. Tente de novo.");
  let resposta: Response;
  try {
    resposta = await fetch(`${emissor()}/api/v1/set${caminho ? `/${caminho}` : ""}${busca(req, caminho)}`, {
      method: req.method,
      headers: { Authorization: `Bearer ${acesso.at}`, Accept: "application/json", ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: corpo,
      cache: "no-store",
      redirect: "error",
      signal: req.signal,
    });
  } catch {
    return erro(502, "rede", "A Absolute ZRO não respondeu agora. Tente de novo.");
  }
  const headers = new Headers({ "Cache-Control": "no-store" });
  const tipo = resposta.headers.get("content-type");
  if (tipo) headers.set("Content-Type", tipo);
  return new Response(resposta.status === 204 ? null : resposta.body, { status: resposta.status, headers });
}
