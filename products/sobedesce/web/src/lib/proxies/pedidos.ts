/**
 * Pedidos ao computador (docs/CONTAS.md §11): o celular marca vídeos e pede; o app do computador pega um por vez e
 * faz. Tipo "proxy": o proxy 720p e a tira de quadros (o hover scrub). Tipo "frames": frames, takes e posts do vídeo
 * final, numa pasta ao lado dele (docs/FRAMES.md). Tipo "formato": a referência em outro formato (MP3 320, WAV,
 * MP4 720p…), salva ao lado dela (docs/REFERENCIAS.md §7). Tipo "relay": uma versão de entrega do Maestro com um
 * preset do Relay (lib/zro/relay.ts), que só anda para a frente. Quem não diz o tipo fala de proxy (os apps antigos).
 * Mesmo esquema da fila das Referências: pegar de uma vez só (dois computadores, só um leva), sinal de vida e
 * "gerando" sem notícia por 30 min volta para a fila; no Relay, vira erro (o computador pode ter subido a versão
 * antes de sumir: converter de novo sozinho seria um segundo arquivo, então a pessoa confere e pede de novo).
 */
import { and, desc, eq, inArray, lt, ne, or } from "drizzle-orm";
import { novoId } from "@/lib/auth/tokens";
import { db, schema } from "@/lib/db";
import type { AjustesPedido, SaidaRelay, StatusPedidoProxy, TipoPedido } from "@/lib/db/schema";

const { pedidosProxy: pedidos, contasGoogle } = schema;

export const STATUS: StatusPedidoProxy[] = ["pendente", "gerando", "pronto", "erro", "cancelado"];
/** Estados finais de um pedido do Relay: nada os muda depois (pedir de novo cria outro pedido). */
export const FINAIS_RELAY: StatusPedidoProxy[] = ["pronto", "erro", "cancelado"];
/** O computador sumiu no meio de um pedido do Relay (sem notícia por PRAZO_GERANDO_MS). */
export const MSG_RELAY_PAROU = "O computador parou no meio da conversão. Veja na pasta se a versão chegou antes de pedir de novo.";
/** Pedido "gerando" sem notícia do computador há mais que isso volta a ficar livre. */
export const PRAZO_GERANDO_MS = 30 * 60_000;
/** Pedidos terminados somem depois disso (o proxy continua no Drive). */
const GUARDAR_FEITOS_MS = 14 * 24 * 60 * 60_000;
/** Por pedido do celular. */
export const MAX_POR_PEDIDO = 200;

export const TIPOS: TipoPedido[] = ["proxy", "frames", "formato", "relay"];

export type PedidoProxy = {
  id: string;
  tipo: TipoPedido;
  ajustes: AjustesPedido | null;
  contaGoogleId: string;
  fileId: string;
  nome: string;
  tamanho: number | null;
  status: StatusPedidoProxy;
  erro: string | null;
  resultado: string | null;
  proxyFileId: string | null;
  dispositivoId: string | null;
  /** Relay: `ref:preset`, o andamento (0 a 1) e o arquivo novo com o MD5. */
  chave: string | null;
  frac: number | null;
  saida: SaidaRelay | null;
  criadoEm: string;
  atualizadoEm: string;
};

type Linha = typeof pedidos.$inferSelect;

function publico(l: Linha): PedidoProxy {
  return {
    id: l.id,
    tipo: l.tipo,
    ajustes: l.ajustes ?? null,
    contaGoogleId: l.contaGoogleId,
    fileId: l.fileId,
    nome: l.nome,
    tamanho: l.tamanho,
    status: l.status,
    erro: l.erro,
    resultado: l.resultado,
    proxyFileId: l.proxyFileId,
    dispositivoId: l.dispositivoId,
    chave: l.chave ?? null,
    frac: l.frac ?? null,
    saida: l.saida ?? null,
    criadoEm: l.criadoEm.toISOString(),
    atualizadoEm: l.atualizadoEm.toISOString(),
  };
}

async function umPedido(usuarioId: string, id: string): Promise<PedidoProxy | null> {
  const [l] = await db.select().from(pedidos).where(and(eq(pedidos.id, id), eq(pedidos.usuarioId, usuarioId))).limit(1);
  return l ? publico(l) : null;
}

/** A conta Google é desta pessoa? */
export async function contaDaPessoa(usuarioId: string, contaGoogleId: string): Promise<boolean> {
  const [c] = await db
    .select({ id: contasGoogle.id })
    .from(contasGoogle)
    .where(and(eq(contasGoogle.id, contaGoogleId), eq(contasGoogle.usuarioId, usuarioId)))
    .limit(1);
  return Boolean(c);
}

export async function arrumar(usuarioId: string) {
  const preso = and(eq(pedidos.usuarioId, usuarioId), eq(pedidos.status, "gerando"), lt(pedidos.atualizadoEm, new Date(Date.now() - PRAZO_GERANDO_MS)));
  await db
    .update(pedidos)
    .set({ status: "pendente", dispositivoId: null, atualizadoEm: new Date() })
    .where(and(preso, ne(pedidos.tipo, "relay")));
  // Relay: nunca volta para a fila sozinho (o estado só anda para a frente e uma segunda conversão seria outro arquivo).
  await db
    .update(pedidos)
    .set({ status: "erro", erro: MSG_RELAY_PAROU, frac: null, atualizadoEm: new Date() })
    .where(and(preso, eq(pedidos.tipo, "relay")));
  if (Math.random() < 0.05) {
    await db
      .delete(pedidos)
      .where(and(eq(pedidos.usuarioId, usuarioId), inArray(pedidos.status, ["pronto", "erro", "cancelado"]), lt(pedidos.atualizadoEm, new Date(Date.now() - GUARDAR_FEITOS_MS))));
  }
}

export async function listarPedidos(
  usuarioId: string,
  filtro: { status?: StatusPedidoProxy[]; fileIds?: string[]; tipo?: TipoPedido | null } = {},
): Promise<PedidoProxy[]> {
  await arrumar(usuarioId);
  const conds = [eq(pedidos.usuarioId, usuarioId)];
  if (filtro.tipo !== null) conds.push(eq(pedidos.tipo, filtro.tipo ?? "proxy"));
  if (filtro.status?.length) conds.push(inArray(pedidos.status, filtro.status));
  if (filtro.fileIds?.length) conds.push(inArray(pedidos.fileId, filtro.fileIds));
  const linhas = await db
    .select()
    .from(pedidos)
    .where(and(...conds))
    .orderBy(desc(pedidos.criadoEm))
    .limit(500);
  return linhas.map(publico);
}

export type ItemNovo = { fileId: string; nome: string; tamanho: number | null };

/** Formato pedido (só nos pedidos de formato): dois formatos do mesmo arquivo são dois pedidos. */
const formatoDe = (a: AjustesPedido | null | undefined) => (a && "formato" in a && typeof a.formato === "string" ? a.formato : null);

/**
 * Guarda os pedidos. O mesmo arquivo já esperando (pendente ou gerando) com o mesmo tipo (e, nos de formato, o mesmo
 * formato) não entra de novo: volta o que existe. Devolve todos (novos e os que já estavam) na ordem pedida.
 */
export async function pedirProxies(
  usuarioId: string,
  contaGoogleId: string,
  itens: ItemNovo[],
  { tipo = "proxy", ajustes = null }: { tipo?: TipoPedido; ajustes?: AjustesPedido | null } = {},
): Promise<{ pedidos: PedidoProxy[]; novos: number }> {
  const ids = [...new Set(itens.map((i) => i.fileId))];
  const encontrados = await db
    .select()
    .from(pedidos)
    .where(
      and(
        eq(pedidos.usuarioId, usuarioId),
        eq(pedidos.contaGoogleId, contaGoogleId),
        eq(pedidos.tipo, tipo),
        inArray(pedidos.fileId, ids),
        inArray(pedidos.status, ["pendente", "gerando"]),
      ),
    );
  const existentes = tipo === "formato" ? encontrados.filter((l) => formatoDe(l.ajustes) === formatoDe(ajustes)) : encontrados;
  const porArquivo = new Map(existentes.map((l) => [l.fileId, l]));
  const novas: (typeof pedidos.$inferInsert)[] = [];
  const vistos = new Set<string>();
  for (const i of itens) {
    if (porArquivo.has(i.fileId) || vistos.has(i.fileId)) continue;
    vistos.add(i.fileId);
    novas.push({ id: novoId(), usuarioId, contaGoogleId, tipo, ajustes: tipo === "proxy" ? null : ajustes, fileId: i.fileId, nome: i.nome, tamanho: i.tamanho });
  }
  if (novas.length) {
    const criadas = await db.insert(pedidos).values(novas).returning();
    for (const l of criadas) porArquivo.set(l.fileId, l);
  }
  return { pedidos: ids.map((id) => porArquivo.get(id)).filter((l): l is Linha => Boolean(l)).map(publico), novos: novas.length };
}

/** O computador pega o pedido (pendente → gerando) de uma vez só. O mesmo computador pedindo de novo recebe outra vez. */
export async function pegarPedido(
  usuarioId: string,
  id: string,
  dispositivoId: string,
): Promise<{ ok: true; pedido: PedidoProxy } | { ok: false; motivo: "nao_encontrado" | "ocupado" }> {
  const limite = new Date(Date.now() - PRAZO_GERANDO_MS);
  const r = await db
    .update(pedidos)
    .set({ status: "gerando", dispositivoId, erro: null, atualizadoEm: new Date() })
    .where(
      and(
        eq(pedidos.id, id),
        eq(pedidos.usuarioId, usuarioId),
        // preso há muito, outro computador leva; no Relay, não (vira erro em `arrumar`: nunca uma segunda conversão sozinha)
        or(
          eq(pedidos.status, "pendente"),
          and(eq(pedidos.status, "gerando"), or(eq(pedidos.dispositivoId, dispositivoId), and(lt(pedidos.atualizadoEm, limite), ne(pedidos.tipo, "relay")))),
        ),
      ),
    )
    .returning({ id: pedidos.id });
  if (r.length) return { ok: true, pedido: (await umPedido(usuarioId, id))! };
  return { ok: false, motivo: (await umPedido(usuarioId, id)) ? "ocupado" : "nao_encontrado" };
}

export type Mudanca = {
  status: StatusPedidoProxy;
  erro?: string | null;
  resultado?: string | null;
  proxyFileId?: string | null;
  /** Relay: o andamento (com "gerando") e o arquivo novo conferido (obrigatório com "pronto"). */
  frac?: number | null;
  saida?: SaidaRelay | null;
};

/**
 * Muda o estado. O computador que pegou: pronto, erro, pendente (devolver) ou gerando (sinal de vida). O dono pelo
 * celular/site: só pendente (tentar de novo um erro, soltar um preso).
 */
export async function mudarPedido(
  usuarioId: string,
  id: string,
  quem: { via: "cookie" | "bearer"; sessaoId: string },
  m: Mudanca,
): Promise<{ ok: true; pedido: PedidoProxy } | { ok: false; status: number; erro: string; mensagem: string }> {
  const atual = await umPedido(usuarioId, id);
  if (!atual) return { ok: false, status: 404, erro: "nao_encontrado", mensagem: "Este pedido não existe mais." };
  const doComputador = quem.via === "bearer" && atual.status === "gerando" && atual.dispositivoId === quem.sessaoId;
  if (m.status === "cancelado") return { ok: false, status: 400, erro: "entrada", mensagem: "Cancelar é pelo app que pediu." };
  if (atual.tipo === "relay") {
    // Só o computador que pegou muda um pedido do Relay; "erro", "pronto" e "cancelado" são finais.
    if (!doComputador) {
      if (FINAIS_RELAY.includes(atual.status)) return { ok: false, status: 409, erro: "terminado", mensagem: "Este pedido já terminou. Peça de novo pelo app que pediu." };
      return { ok: false, status: 409, erro: "ocupado", mensagem: "Só o computador que está convertendo muda este pedido." };
    }
    if (m.status === "pronto" && !m.saida) return { ok: false, status: 400, erro: "entrada", mensagem: "Pronto precisa do arquivo novo com o MD5." };
  }
  if (!doComputador) {
    if (m.status !== "pendente") {
      return quem.via === "bearer"
        ? { ok: false, status: 409, erro: "ocupado", mensagem: "Outro computador pegou este pedido." }
        : { ok: false, status: 403, erro: "so_computador", mensagem: "Só o computador que está gerando muda este estado." };
    }
    if (atual.status === "pronto") {
      const mensagem = atual.tipo === "frames" ? "Estes frames já foram feitos." : atual.tipo === "formato" ? "Este arquivo já foi convertido." : "Este proxy já foi gerado.";
      return { ok: false, status: 409, erro: "pronto", mensagem };
    }
    if (quem.via === "bearer" && atual.status === "gerando") return { ok: false, status: 409, erro: "ocupado", mensagem: "Outro computador pegou este pedido." };
  }
  const set: Partial<typeof pedidos.$inferInsert> = { status: m.status, atualizadoEm: new Date() };
  if (m.status === "pronto") Object.assign(set, { erro: null, resultado: (m.resultado ?? "").slice(0, 200) || null, proxyFileId: m.proxyFileId ?? null });
  if (m.status === "pronto" && atual.tipo === "relay") Object.assign(set, { saida: m.saida, proxyFileId: m.saida!.arquivoId, frac: 1 });
  if (m.status === "gerando" && atual.tipo === "relay" && typeof m.frac === "number") set.frac = Math.max(atual.frac ?? 0, Math.min(1, Math.max(0, m.frac)));
  if (m.status === "erro") {
    const padrao = atual.tipo === "frames" ? "Não deu para fazer os frames." : atual.tipo === "formato" || atual.tipo === "relay" ? "Não deu para converter." : "Não deu para gerar o proxy.";
    set.erro = (m.erro ?? "").slice(0, atual.tipo === "relay" ? 300 : 500) || padrao;
    if (atual.tipo === "relay") set.frac = null;
  }
  if (m.status === "pendente") Object.assign(set, { dispositivoId: null, erro: null, frac: null });
  const conds = [eq(pedidos.id, id), eq(pedidos.usuarioId, usuarioId), eq(pedidos.status, atual.status)];
  if (doComputador) conds.push(eq(pedidos.dispositivoId, quem.sessaoId));
  const r = await db.update(pedidos).set(set).where(and(...conds)).returning({ id: pedidos.id });
  if (!r.length) return { ok: false, status: 409, erro: "mudou", mensagem: "O estado deste pedido mudou. Atualize a lista." };
  return { ok: true, pedido: (await umPedido(usuarioId, id))! };
}

export async function removerPedido(usuarioId: string, id: string): Promise<boolean> {
  const r = await db.delete(pedidos).where(and(eq(pedidos.id, id), eq(pedidos.usuarioId, usuarioId))).returning({ id: pedidos.id });
  return r.length > 0;
}
