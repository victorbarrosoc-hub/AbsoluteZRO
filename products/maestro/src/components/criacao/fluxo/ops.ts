/**
 * O lado da tela das operações do Fluxo (fase F5), puro: aplicar uma operação no estado local (a tela é otimista: o
 * que a pessoa faz aparece na hora e vai para o servidor em lote), juntar a fila antes de mandar (o mesmo item mexido
 * várias vezes vira uma operação só) e pôr o `rev` que a tela conhece nas mudanças de conteúdo.
 *
 * Regras (as mesmas do servidor, `aplicarOps` em src/lib/criacao/fluxo/servidor.ts):
 *   * mover/redimensionar vão sem `rev` (quem grava por último leva);
 *   * mudar o conteúdo (texto, legenda, título, nome, cor, rótulo) vai com o `rev` visto: se outra pessoa mudou antes,
 *     volta `conflito` só naquele item e a tela fica com a versão dela;
 *   * apagar é lápide: o item fica no estado com `apagado` (Desfazer devolve).
 */
import { lerDados, type DadosNo, type ImagemNo, type LigacaoFluxo, type NoFluxo, type Op, type OpCriarNo, type OpMudarNo } from "@/lib/criacao/fluxo/modelo";

export type Estado = { nos: Record<string, NoFluxo>; ligacoes: Record<string, LigacaoFluxo> };

/** Uma operação na fila, com a marca "manda o rev visto" (mudança de conteúdo). */
export type ItemFila = { op: Op; comRev?: boolean };

/** O id que a operação toca (nó ou ligação). */
export const alvoDe = (op: Op): string => ("id" in op && op.id ? op.id : "");

function novoNo(op: OpCriarNo, imagem: ImagemNo | null): NoFluxo {
  return {
    id: op.id!,
    tipo: op.tipo,
    x: op.x,
    y: op.y,
    w: op.w,
    h: op.h,
    z: op.z,
    secaoId: op.secaoId,
    dados: op.dados,
    imagemId: op.imagemId,
    roteiroId: op.roteiroId,
    cardId: op.cardId,
    imagem,
    rev: 0,
    apagado: false,
    atualizado: "",
    atualizadoPor: null,
  };
}

/**
 * Aplica a operação no estado (devolve um estado novo; o de entrada não muda). `imagens` = metadados das imagens que
 * acabaram de subir (o nó de imagem nasce já mostrando a foto).
 */
export function aplicarLocal(e: Estado, op: Op, imagens?: ReadonlyMap<string, ImagemNo>): Estado {
  switch (op.op) {
    case "criar_no": {
      if (!op.id) return e;
      const imagem = op.imagemId ? (imagens?.get(op.imagemId) ?? e.nos[op.id]?.imagem ?? null) : null;
      return { ...e, nos: { ...e.nos, [op.id]: novoNo(op, imagem) } };
    }
    case "mudar_no": {
      const n = e.nos[op.id];
      if (!n) return e;
      const m: NoFluxo = { ...n };
      for (const k of ["x", "y", "w", "h", "z"] as const) if (op[k] !== undefined) m[k] = op[k]!;
      if (op.secaoId !== undefined) m.secaoId = op.secaoId;
      if (op.dados) m.dados = { ...(n.dados as Record<string, unknown>), ...op.dados } as DadosNo;
      return { ...e, nos: { ...e.nos, [op.id]: m } };
    }
    case "apagar_no":
    case "restaurar_no": {
      const n = e.nos[op.id];
      if (!n) return e;
      return { ...e, nos: { ...e.nos, [op.id]: { ...n, apagado: op.op === "apagar_no" } } };
    }
    case "criar_ligacao": {
      if (!op.id) return e;
      const l: LigacaoFluxo = { id: op.id, de: op.de, para: op.para, rotulo: op.rotulo, rev: 0, apagado: false, atualizado: "" };
      return { ...e, ligacoes: { ...e.ligacoes, [op.id]: l } };
    }
    case "mudar_ligacao": {
      const l = e.ligacoes[op.id];
      return l ? { ...e, ligacoes: { ...e.ligacoes, [op.id]: { ...l, rotulo: op.rotulo } } } : e;
    }
    case "apagar_ligacao":
    case "restaurar_ligacao": {
      const l = e.ligacoes[op.id];
      return l ? { ...e, ligacoes: { ...e.ligacoes, [op.id]: { ...l, apagado: op.op === "apagar_ligacao" } } } : e;
    }
  }
}

export const aplicarTodas = (e: Estado, ops: readonly Op[], imagens?: ReadonlyMap<string, ImagemNo>) => ops.reduce((s, op) => aplicarLocal(s, op, imagens), e);

/**
 * Junta a fila: `mudar_no` seguidos do mesmo nó viram um (o último valor de cada campo vale; os dados se somam), e
 * `mudar_no` de um nó que nasce na mesma fila entra no `criar_no` (o servidor ainda não conhece o nó). O mesmo para o
 * rótulo de uma ligação criada na fila. A ordem do resto não muda (apagar e restaurar seguem onde estão).
 */
export function juntarFila(fila: readonly ItemFila[]): ItemFila[] {
  const out: ItemFila[] = [];
  const criado = new Map<string, number>(); // id → índice do criar_no em out
  const ultimoMudar = new Map<string, number>(); // id → índice do mudar_no em out (até uma lápide no meio)
  for (const it of fila) {
    const op = it.op;
    const id = alvoDe(op);
    if (op.op === "mudar_no") {
      const ic = criado.get(id);
      if (ic !== undefined) {
        const c = out[ic].op as OpCriarNo;
        const dados = op.dados ? (lerDados(c.tipo, { ...(c.dados as Record<string, unknown>), ...op.dados }) ?? c.dados) : c.dados;
        out[ic] = {
          op: {
            ...c,
            ...(op.x !== undefined ? { x: op.x } : {}),
            ...(op.y !== undefined ? { y: op.y } : {}),
            ...(op.w !== undefined ? { w: op.w } : {}),
            ...(op.h !== undefined ? { h: op.h } : {}),
            ...(op.z !== undefined ? { z: op.z } : {}),
            ...(op.secaoId !== undefined ? { secaoId: op.secaoId } : {}),
            dados,
          },
        };
        continue;
      }
      const im = ultimoMudar.get(id);
      if (im !== undefined) {
        const a = out[im].op as OpMudarNo;
        const junto: OpMudarNo = { ...a, ...op, dados: a.dados || op.dados ? { ...(a.dados ?? {}), ...(op.dados ?? {}) } : undefined };
        if (!junto.dados) delete junto.dados;
        out[im] = { op: junto, comRev: Boolean(out[im].comRev || it.comRev) };
        continue;
      }
      ultimoMudar.set(id, out.length);
      out.push({ ...it });
      continue;
    }
    if (op.op === "mudar_ligacao") {
      const ic = criado.get(id);
      if (ic !== undefined && out[ic].op.op === "criar_ligacao") {
        out[ic] = { op: { ...out[ic].op, rotulo: op.rotulo } as Op };
        continue;
      }
      const im = ultimoMudar.get(id);
      if (im !== undefined && out[im].op.op === "mudar_ligacao") {
        out[im] = { op: { ...op }, comRev: Boolean(out[im].comRev || it.comRev) };
        continue;
      }
      ultimoMudar.set(id, out.length);
      out.push({ ...it });
      continue;
    }
    // criar, apagar, restaurar: quebram a junção (depois de uma lápide, o mudar seguinte é outro)
    ultimoMudar.delete(id);
    if (op.op === "criar_no" || op.op === "criar_ligacao") criado.set(id, out.length);
    else criado.delete(id);
    out.push({ ...it });
  }
  return out;
}

/** Põe o `rev` conhecido nas mudanças de conteúdo (e tira das outras). `revs` = o último rev que o servidor deu. */
export function comRevs(fila: readonly ItemFila[], revs: ReadonlyMap<string, number>): Op[] {
  return fila.map(({ op, comRev }) => {
    if (op.op !== "mudar_no" && op.op !== "mudar_ligacao") return op;
    const { rev: _r, ...sem } = op;
    const rev = comRev ? revs.get(op.id) : undefined;
    return (rev && rev >= 1 ? { ...sem, rev } : sem) as Op;
  });
}

/** Os ids que a fila toca (o poll não passa por cima deles). */
export const idsDaFila = (fila: readonly ItemFila[]) => new Set(fila.map((i) => alvoDe(i.op)).filter(Boolean));

/** Um id novo (o navegador gera; o servidor aceita o que vier no `criar_*`). */
export function novoId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Junta o que o poll trouxe: o item da tela fica como está se ainda tem mudança na fila (ou no ar), se está sendo
 * editado, ou se a tela já tem uma versão mais nova (rev maior). O resto vem do servidor.
 */
export function juntarDoServidor(
  e: Estado,
  vindo: { nos: readonly NoFluxo[]; ligacoes: readonly LigacaoFluxo[] },
  o: { pendentes: ReadonlySet<string>; revs: Map<string, number>; editando?: string | null },
): Estado {
  let nos = e.nos;
  let ligacoes = e.ligacoes;
  for (const n of vindo.nos) {
    if (o.pendentes.has(n.id) || o.editando === n.id) continue;
    if ((o.revs.get(n.id) ?? 0) > n.rev) continue;
    o.revs.set(n.id, n.rev);
    if (nos === e.nos) nos = { ...e.nos };
    nos[n.id] = n;
  }
  for (const l of vindo.ligacoes) {
    if (o.pendentes.has(l.id) || o.editando === l.id) continue;
    if ((o.revs.get(l.id) ?? 0) > l.rev) continue;
    o.revs.set(l.id, l.rev);
    if (ligacoes === e.ligacoes) ligacoes = { ...e.ligacoes };
    ligacoes[l.id] = l;
  }
  return nos === e.nos && ligacoes === e.ligacoes ? e : { nos, ligacoes };
}
