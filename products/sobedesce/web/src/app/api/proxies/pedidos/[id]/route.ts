import type { SaidaRelay, StatusPedidoProxy } from "@/lib/db/schema";
import { lerJson } from "@/lib/http";
import { exigirProxies, falha, ID_DRIVE, MSG, ok } from "@/lib/proxies/api";
import { mudarPedido, removerPedido, STATUS } from "@/lib/proxies/pedidos";

/** O arquivo novo de um pedido do Relay, como o computador manda (`saida`), ou null se faltar algo. */
function lerSaida(v: unknown): SaidaRelay | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const nome = typeof o.nome === "string" ? o.nome.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
  if (typeof o.arquivoId !== "string" || !ID_DRIVE.test(o.arquivoId) || typeof o.pastaId !== "string" || !ID_DRIVE.test(o.pastaId)) return null;
  if (!nome || nome.length > 300 || typeof o.md5 !== "string" || !/^[0-9a-f]{32}$/.test(o.md5)) return null;
  if (typeof o.tamanho !== "number" || !Number.isSafeInteger(o.tamanho) || o.tamanho < 0) return null;
  return { arquivoId: o.arquivoId, nome, tamanho: o.tamanho, md5: o.md5, pastaId: o.pastaId };
}

/**
 * `{ status, erro?, resultado?, proxyFileId?, frac?, saida? }`. O computador que pegou muda tudo ('gerando' = sinal
 * de vida; no Relay, com `frac`); o dono pelo celular só devolve para 'pendente' (tentar de novo), menos no Relay.
 * Relay "pronto" exige `saida` `{ arquivoId, nome, tamanho, md5, pastaId }` (o MD5 do Drive que bateu).
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/proxies/pedidos/[id]">) {
  const atual = await exigirProxies(req, { mutacao: true });
  if (atual instanceof Response) return atual;
  const { id } = await ctx.params;
  const corpo = await lerJson(req);
  const status = corpo?.status as StatusPedidoProxy | undefined;
  if (!corpo || !status || !STATUS.includes(status)) return falha(400, "entrada", MSG.entrada);
  const proxyFileId = typeof corpo.proxyFileId === "string" && ID_DRIVE.test(corpo.proxyFileId) ? corpo.proxyFileId : null;
  if (corpo.proxyFileId != null && !proxyFileId) return falha(400, "entrada", MSG.entrada);
  const erro = typeof corpo.erro === "string" ? corpo.erro : null;
  const resultado = typeof corpo.resultado === "string" ? corpo.resultado : null;
  const frac = typeof corpo.frac === "number" && Number.isFinite(corpo.frac) ? corpo.frac : null;
  const saida = corpo.saida == null ? null : lerSaida(corpo.saida);
  if (corpo.saida != null && !saida) return falha(400, "entrada", MSG.entrada);
  const r = await mudarPedido(atual.usuario.id, id, { via: atual.via, sessaoId: atual.sessao.id }, { status, erro, resultado, proxyFileId, frac, saida });
  if (!r.ok) return falha(r.status, r.erro, r.mensagem);
  return ok({ pedido: r.pedido });
}

/** Cancela o pedido. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/proxies/pedidos/[id]">) {
  const atual = await exigirProxies(req, { mutacao: true });
  if (atual instanceof Response) return atual;
  const { id } = await ctx.params;
  if (!(await removerPedido(atual.usuario.id, id))) return falha(404, "nao_encontrado", MSG.pedido);
  return ok();
}
