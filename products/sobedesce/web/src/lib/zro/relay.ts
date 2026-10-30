/**
 * "Gerar versões com o Relay" (docs/integration-contracts/relay.md, "Maestro → Relay"; 30/10/2026): o Maestro pede,
 * pela ponte do HUB, as versões de entrega de um master que está no Drive da pessoa. Aqui só entra na fila: quem
 * converte é o app de computador da conta (src/engine/pedidos-relay.js), com os presets do Relay e o ffmpeg dele, e
 * sobe o arquivo novo na pasta pedida. Nenhum byte de mídia passa pelo site.
 *
 * - Fila: a mesma `pedidos_proxy`, tipo "relay", ajustes `{ preset, pastaId, ref }` e a chave `ref:preset`
 *   (índice único parcial na 0016): pedir de novo a mesma chave pendente, convertendo ou pronta devolve o pedido que
 *   existe, nunca um segundo arquivo. Erro e cancelado são finais; pedir de novo cria outro.
 * - O original nunca muda: a versão é um arquivo novo, `<original> (<preset>).<ext>`, na pasta pedida (ou na do
 *   original). A pasta é conferida aqui (existe, é pasta, está no mesmo Drive) antes de entrar na fila.
 * - "pronto" só com o resultado e o MD5 do Drive igual ao do convertido (o computador confere; a rota PATCH exige).
 * - Estados do contrato: pendente, convertendo (o "gerando" da fila), pronto, erro, cancelado.
 * - Só entra na fila se algum computador da conta sabe converter (o app manda `x-sobedesce-capacidades: relay`, desde
 *   a 0.2.0). Sem ele, 409 `sem_computador_relay`: o pedido nunca andaria. `relay.pedido` diz o mesmo ao Maestro
 *   (`computador.relay` e `computador.desatualizado`), que só mostra "Gerar versões" com `relay`. "Desatualizado" (o
 *   Maestro pede para atualizar) só depois que o app que converte está para baixar (o instalador do /baixar é 0.2.0+):
 *   ninguém é mandado atualizar para uma versão que ainda não saiu.
 */
import { and, eq, inArray } from "drizzle-orm";
import { novoId } from "@/lib/auth/tokens";
import { db, schema } from "@/lib/db";
import type { AjustesRelay, SaidaRelay, StatusPedidoProxy } from "@/lib/db/schema";
import type { Conta } from "@/lib/google/contas";
import { chamarDrive, ErroDrive, PASTA_MIME } from "@/lib/google/drive";
import { ID_DRIVE } from "@/lib/proxies/api";
import { arrumar } from "@/lib/proxies/pedidos";
import { versaoPublicada } from "@/lib/release";
import { PRESETS } from "../../../public/app/relay/src/presets.js";
import { acharOriginal, computadoresComCapacidades, type ComputadorComCapacidades, type Original } from "./computador-da-z";
import { contasProntas, falhaDe, type FalhaDrive } from "./drive-da-z";

export const ACAO_RELAY_CONVERTER = "relay.converter";
export const ACAO_RELAY_PEDIDO = "relay.pedido";
export const ACAO_RELAY_CANCELAR = "relay.cancelar";

export const MAX_PRESETS = 8;
export const MAX_IDS = 50;
export const REF_MAX = 120;
/** Versões esperando (pendentes ou convertendo) por pessoa: além disso, a fila recusa (429). */
export const MAX_NA_FILA = 100;

const { pedidosProxy: pedidos } = schema;

type PresetRelay = { id: string; nome: string; video: unknown; ajustavel?: boolean; cor?: unknown };
/**
 * Os destinos que o computador converte: os presets do Relay menos "Tamanho exato" (pede o MB na hora) e os com a cor
 * da Revela (o computador ainda não aplica a cor igual ao navegador; products/relay/src/link.js deixa de fora igual).
 */
export const PRESETS_DA_FILA: ReadonlyMap<string, PresetRelay> = new Map(
  (PRESETS as PresetRelay[]).filter((p) => !p.ajustavel && !p.cor && p.id !== "tamanho").map((p) => [p.id, p]),
);

export type StatusRelay = "pendente" | "convertendo" | "pronto" | "erro" | "cancelado";
const DO_STATUS: Record<StatusPedidoProxy, StatusRelay> = { pendente: "pendente", gerando: "convertendo", pronto: "pronto", erro: "erro", cancelado: "cancelado" };

export type PedidoRelay = {
  id: string;
  preset: string;
  ref: string;
  status: StatusRelay;
  frac?: number;
  resultado?: SaidaRelay;
  erro?: string;
  criado_em: string;
  atualizado_em: string;
};

type Linha = typeof pedidos.$inferSelect;
const ajustesDe = (l: Linha) => (l.ajustes ?? {}) as Partial<AjustesRelay>;

/** A linha da fila no formato do contrato (`PedidoRelaySchema`): sem conta, arquivo de origem nem computador. */
export function paraContrato(l: Linha): PedidoRelay {
  const a = ajustesDe(l);
  let status = DO_STATUS[l.status] ?? "erro";
  // "pronto" sem o arquivo conferido não existe (a rota PATCH já exige; aqui é a última guarda)
  if (status === "pronto" && !l.saida) status = "convertendo";
  const p: PedidoRelay = { id: l.id, preset: String(a.preset ?? ""), ref: String(a.ref ?? ""), status, criado_em: l.criadoEm.toISOString(), atualizado_em: l.atualizadoEm.toISOString() };
  if (status === "convertendo" && typeof l.frac === "number") p.frac = Math.min(1, Math.max(0, l.frac));
  if (status === "pronto" && l.saida) p.resultado = l.saida;
  if (status === "erro") p.erro = (l.erro || "Não deu para converter.").slice(0, 300);
  return p;
}

export type EntradaConverter = { arquivoId: string; presets: string[]; pastaId: string | null; ref: string; conta: string | null };

/** Confere o corpo de `relay.converter` (o contrato é estrito: campo a mais é recusado). */
export function lerConverter(c: Record<string, unknown>): EntradaConverter | { erro: string } {
  const sobra = Object.keys(c).filter((k) => !["arquivoId", "presets", "pastaId", "ref", "conta"].includes(k));
  if (sobra.length) return { erro: `Campo desconhecido: ${sobra[0].slice(0, 40)}.` };
  if (typeof c.arquivoId !== "string" || !ID_DRIVE.test(c.arquivoId)) return { erro: "Mande o arquivoId do Drive." };
  if (c.pastaId != null && (typeof c.pastaId !== "string" || !ID_DRIVE.test(c.pastaId))) return { erro: "pastaId inválido." };
  if (c.conta != null && (typeof c.conta !== "string" || !ID_DRIVE.test(c.conta))) return { erro: "conta inválida." };
  if (typeof c.ref !== "string" || !c.ref.length || c.ref.length > REF_MAX || /[\u0000-\u001f\u007f]/.test(c.ref)) return { erro: `ref de 1 a ${REF_MAX} caracteres.` };
  if (!Array.isArray(c.presets) || c.presets.length < 1 || c.presets.length > MAX_PRESETS) return { erro: `De 1 a ${MAX_PRESETS} presets.` };
  const presets = [...new Set(c.presets)];
  const fora = presets.find((p) => typeof p !== "string" || !PRESETS_DA_FILA.has(p));
  if (fora !== undefined) return { erro: `Preset que o computador não converte: ${String(fora).slice(0, 40)}.` };
  return { arquivoId: c.arquivoId, presets: presets as string[], pastaId: (c.pastaId as string | undefined) ?? null, ref: c.ref, conta: (c.conta as string | undefined) ?? null };
}

export type ResultadoConverter =
  | { ok: true; pedidos: { id: string; preset: string; ref: string; status: StatusRelay }[]; novos: number }
  | { ok: false; erro: "nao_achou" | "pasta" | "formato_incompativel" | "fila_cheia" | "sem_computador_relay"; mensagem: string }
  | FalhaDrive;

export const CAPACIDADE_RELAY = "relay";
export const MSG_ATUALIZAR = "Atualize o SOBEDESCE no computador para gerar versões.";
export const MSG_SEM_COMPUTADOR = "Instale o SOBEDESCE no computador para gerar versões.";

/** A primeira versão do app de computador que converte as versões do Relay. */
export const VERSAO_COM_RELAY = [0, 2, 0] as const;

/** A versão no nome do instalador do Release ("SOBEDESCE-0.2.0-b1057-mac-universal.dmg" → [0, 2, 0]); senão null. */
export function versaoDoInstalador(nome: string | null | undefined): [number, number, number] | null {
  const m = /^SOBEDESCE-(\d{1,4})\.(\d{1,4})\.(\d{1,4})-/.exec(nome ?? "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

const peloMenos = (v: readonly number[], min: readonly number[]) => {
  for (let i = 0; i < 3; i++) if (v[i] !== min[i]) return v[i] > min[i];
  return true;
};

/**
 * O app que converte já está para baixar? (o instalador que o /baixar entrega, pelo versao.json do Release, é 0.2.0+).
 * Sem resposta do GitHub: não (melhor não pedir para atualizar do que mandar atrás de uma versão que não existe).
 */
export async function appComRelayParaBaixar(): Promise<boolean> {
  try {
    const v = await versaoPublicada();
    return [v.arquivoMac, v.arquivoWindows].some((n) => {
      const x = versaoDoInstalador(n);
      return !!x && peloMenos(x, VERSAO_COM_RELAY);
    });
  } catch {
    return false;
  }
}

/**
 * Os computadores da conta para o Maestro: um aberto agora ou usado há pouco; `relay` = algum sabe converter as versões
 * (app 0.2.0 ou mais novo); `desatualizado` = há computador, nenhum sabe e o app novo já está para baixar (o Maestro
 * pede para atualizar).
 */
export function resumoDosComputadores(cs: ComputadorComCapacidades[], paraBaixar: boolean) {
  const relay = cs.some((c) => c.capacidades.includes(CAPACIDADE_RELAY));
  return {
    aberto_agora: cs.some((c) => c.aberto_agora),
    usado_ha_pouco: cs.some((c) => c.usado_ha_pouco),
    relay,
    desatualizado: cs.length > 0 && !relay && paraBaixar,
  };
}

/** Só pergunta ao GitHub quando importa (há computador e nenhum converte). */
async function resumoDaConta(usuarioId: string) {
  const cs = await computadoresComCapacidades(usuarioId);
  const precisa = cs.length > 0 && !cs.some((c) => c.capacidades.includes(CAPACIDADE_RELAY));
  return resumoDosComputadores(cs, precisa && (await appComRelayParaBaixar()));
}

/** A pasta de destino, no mesmo Drive do original: existe, é pasta e não está na lixeira. */
async function conferirPasta(usuarioId: string, conta: Conta, pastaId: string): Promise<boolean> {
  try {
    const f = await chamarDrive<{ mimeType?: string; trashed?: boolean }>(usuarioId, conta.id, `/files/${encodeURIComponent(pastaId)}`, { query: { fields: "id,mimeType,trashed" } });
    return Boolean(f && f.mimeType === PASTA_MIME && f.trashed !== true);
  } catch (e) {
    if (e instanceof ErroDrive && (e.status === 404 || e.status === 400)) return false;
    throw e;
  }
}

/**
 * Entra na fila (uma linha por preset), idempotente pela chave `ref:preset`. Só chamado pela ponte do HUB, que
 * confere quem pede (o Maestro, com a sessão da pessoa, o SOBEDESCE e o Relay no plano).
 */
export async function pedirVersoes(usuarioId: string, e: EntradaConverter): Promise<ResultadoConverter> {
  const cs = await computadoresComCapacidades(usuarioId);
  if (!cs.some((c) => c.capacidades.includes(CAPACIDADE_RELAY)))
    return { ok: false, erro: "sem_computador_relay", mensagem: cs.length ? MSG_ATUALIZAR : MSG_SEM_COMPUTADOR };
  const prontas = await contasProntas(usuarioId);
  if (!Array.isArray(prontas)) return prontas;
  const contas = e.conta ? prontas.filter((c) => c.id === e.conta) : prontas;
  if (!contas.length) return { ok: false, erro: "nao_achou", mensagem: "Essa conta Google não está conectada no SOBEDESCE." };
  let o: Original | null;
  try {
    o = await acharOriginal(usuarioId, contas, e.arquivoId);
  } catch (err) {
    return falhaDe([err]);
  }
  if (!o) return { ok: false, erro: "nao_achou", mensagem: "O SOBEDESCE não acha este arquivo no Drive (ou a conta conectada não tem acesso)." };
  const video = /^video\//.test(o.arquivo.tipo);
  if (!video && !/^audio\//.test(o.arquivo.tipo)) return { ok: false, erro: "formato_incompativel", mensagem: "O Relay converte vídeo e áudio; este arquivo não é nenhum dos dois." };
  if (!video) {
    const deVideo = e.presets.find((p) => PRESETS_DA_FILA.get(p)?.video);
    if (deVideo) return { ok: false, erro: "formato_incompativel", mensagem: `Este arquivo é só áudio; ${PRESETS_DA_FILA.get(deVideo)!.nome} pede vídeo.` };
  }
  const pastaId = e.pastaId ?? o.pais[0] ?? null;
  if (!pastaId) return { ok: false, erro: "pasta", mensagem: "O original não está numa pasta do Drive; mande a pasta de destino." };
  if (e.pastaId) {
    try {
      if (!(await conferirPasta(usuarioId, o.conta, e.pastaId))) return { ok: false, erro: "pasta", mensagem: "A pasta de destino não existe no mesmo Drive do original." };
    } catch (err) {
      return falhaDe([err]);
    }
  }

  const chaves = e.presets.map((p) => `${e.ref}:${p}`);
  const vivos = (ls: Linha[]) => new Map(ls.filter((l) => l.status === "pendente" || l.status === "gerando" || l.status === "pronto").map((l) => [l.chave!, l]));
  const buscar = () =>
    db
      .select()
      .from(pedidos)
      .where(and(eq(pedidos.usuarioId, usuarioId), eq(pedidos.tipo, "relay"), inArray(pedidos.chave, chaves), inArray(pedidos.status, ["pendente", "gerando", "pronto"])));
  await arrumar(usuarioId);
  const porChave = vivos(await buscar());
  const faltam = e.presets.filter((p) => !porChave.has(`${e.ref}:${p}`));
  if (faltam.length) {
    const naFila = await db
      .select({ id: pedidos.id })
      .from(pedidos)
      .where(and(eq(pedidos.usuarioId, usuarioId), eq(pedidos.tipo, "relay"), inArray(pedidos.status, ["pendente", "gerando"])))
      .limit(MAX_NA_FILA);
    if (naFila.length + faltam.length > MAX_NA_FILA) return { ok: false, erro: "fila_cheia", mensagem: `Já há ${naFila.length} versões esperando o computador. Espere algumas terminarem.` };
    const novas = faltam.map((preset) => ({
      id: novoId(),
      usuarioId,
      contaGoogleId: o.conta.id,
      tipo: "relay" as const,
      ajustes: { preset, pastaId, ref: e.ref } satisfies AjustesRelay,
      chave: `${e.ref}:${preset}`,
      fileId: o.arquivo.id,
      nome: o.arquivo.nome.slice(0, 300),
      tamanho: o.arquivo.tamanho,
    }));
    // Dois pedidos iguais ao mesmo tempo: o índice único deixa um só entrar; o outro lê o que entrou.
    await db.insert(pedidos).values(novas).onConflictDoNothing();
  }
  const finais = faltam.length ? vivos(await buscar()) : porChave;
  const lista = e.presets.map((p) => finais.get(`${e.ref}:${p}`)).filter((l): l is Linha => Boolean(l));
  return { ok: true, pedidos: lista.map((l) => ({ id: l.id, preset: String(ajustesDe(l).preset), ref: e.ref, status: paraContrato(l).status })), novos: faltam.length };
}

/**
 * `relay.pedido`: os pedidos desta pessoa (os de outra, ou que sumiram, não vêm) e os computadores (por perto, e se
 * algum converte). Sem ids, só os computadores: o Maestro pergunta ao abrir o card se pode mostrar "Gerar versões".
 */
export async function lerVersoes(usuarioId: string, ids: string[]) {
  if (ids.length) await arrumar(usuarioId);
  const linhas = ids.length ? await db.select().from(pedidos).where(and(eq(pedidos.usuarioId, usuarioId), eq(pedidos.tipo, "relay"), inArray(pedidos.id, ids))) : [];
  const porId = new Map(linhas.map((l) => [l.id, l]));
  return {
    pedidos: ids.map((i) => porId.get(i)).filter((l): l is Linha => Boolean(l)).map(paraContrato),
    computador: await resumoDaConta(usuarioId),
  };
}

/**
 * `relay.cancelar`: pendente ou convertendo → cancelado (de uma vez só). O computador que estava convertendo vê no
 * próximo sinal de vida (409) e para antes de subir; o que já subiu fica no Drive (o SOBEDESCE nunca apaga mídia).
 */
export async function cancelarVersao(usuarioId: string, id: string): Promise<{ ok: true; cancelado: boolean; ja_terminado: boolean } | { ok: false }> {
  const r = await db
    .update(pedidos)
    .set({ status: "cancelado", frac: null, atualizadoEm: new Date() })
    .where(and(eq(pedidos.id, id), eq(pedidos.usuarioId, usuarioId), eq(pedidos.tipo, "relay"), inArray(pedidos.status, ["pendente", "gerando"])))
    .returning({ id: pedidos.id });
  if (r.length) return { ok: true, cancelado: true, ja_terminado: false };
  const [l] = await db
    .select({ id: pedidos.id })
    .from(pedidos)
    .where(and(eq(pedidos.id, id), eq(pedidos.usuarioId, usuarioId), eq(pedidos.tipo, "relay")))
    .limit(1);
  return l ? { ok: true, cancelado: false, ja_terminado: true } : { ok: false };
}
