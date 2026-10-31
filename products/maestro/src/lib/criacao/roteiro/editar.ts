/**
 * Operações do editor do Roteiro (plano da Criação §4.3, fase F2): tudo o que o teclado, o "+" e o arrastar fazem com
 * o documento, sem mutar o que veio (cada operação devolve um roteiro novo e mantém os objetos que não mudaram, para a
 * tela redesenhar só o bloco tocado). Ids estáveis: trocar o tipo de um bloco mantém o id e o texto. Puro.
 */
import { type Bloco, blocoVazio, type Cena, novoId, type PapelPessoa, type Pessoa, type Roteiro, type TipoBloco, TIPOS_BLOCO, textoDoBloco } from "./modelo";

type Gerar = () => string;
export type Onde = { cena: number; bloco: number };

/** Onde está o bloco (índices da cena e do bloco), ou null. */
export function acharBloco(r: Roteiro, id: string): Onde | null {
  for (let c = 0; c < r.cenas.length; c++) {
    const b = r.cenas[c].blocos.findIndex((x) => x.id === id);
    if (b >= 0) return { cena: c, bloco: b };
  }
  return null;
}

export function blocoPorId(r: Roteiro, id: string): Bloco | null {
  const o = acharBloco(r, id);
  return o ? r.cenas[o.cena].blocos[o.bloco] : null;
}

const comCena = (r: Roteiro, i: number, cena: Cena): Roteiro => ({ ...r, cenas: r.cenas.map((c, j) => (j === i ? cena : c)) });
const comBlocos = (r: Roteiro, i: number, blocos: Bloco[]): Roteiro => comCena(r, i, { ...r.cenas[i], blocos });

/** Muda campos de um bloco (o tipo não muda por aqui: use `trocarTipo`). */
export function mudarBloco(r: Roteiro, id: string, campos: Record<string, unknown>): Roteiro {
  const o = acharBloco(r, id);
  if (!o) return r;
  const atual = r.cenas[o.cena].blocos[o.bloco];
  const novo = { ...atual, ...campos, id: atual.id, tipo: atual.tipo } as Bloco;
  for (const k of Object.keys(novo) as (keyof Bloco)[]) if (novo[k] === undefined) delete novo[k];
  return comBlocos(
    r,
    o.cena,
    r.cenas[o.cena].blocos.map((b, j) => (j === o.bloco ? novo : b)),
  );
}

/** Quem falou por último antes deste ponto (para a fala nova já vir com a pessoa). */
function ultimaPessoa(r: Roteiro, o: Onde | null): string | null {
  if (!o) return null;
  for (let c = o.cena; c >= 0; c--) {
    const blocos = r.cenas[c].blocos;
    for (let b = c === o.cena ? o.bloco : blocos.length - 1; b >= 0; b--) {
      const x = blocos[b];
      if (x.tipo === "fala" && x.quem) return x.quem;
    }
  }
  return null;
}

/** A pessoa seguinte da lista (fala depois de fala troca de pessoa, como no Final Draft); com uma só, ela mesma. */
export function proximaPessoa(r: Roteiro, atual: string | null): string | null {
  if (!r.pessoas.length) return null;
  const i = r.pessoas.findIndex((p) => p.id === atual);
  return r.pessoas[(i + 1) % r.pessoas.length].id;
}

/** O tipo seguinte (Tab) ou anterior (⇧Tab), na ordem de `TIPOS_BLOCO`. */
export function tipoVizinho(tipo: TipoBloco, passo: 1 | -1): TipoBloco {
  const i = TIPOS_BLOCO.indexOf(tipo);
  return TIPOS_BLOCO[(i + passo + TIPOS_BLOCO.length) % TIPOS_BLOCO.length];
}

/** Troca o tipo do bloco mantendo o id, o texto, a duração e a dica. */
export function trocarTipo(r: Roteiro, id: string, tipo: TipoBloco): Roteiro {
  const o = acharBloco(r, id);
  if (!o) return r;
  const atual = r.cenas[o.cena].blocos[o.bloco];
  if (atual.tipo === tipo) return r;
  const texto = textoDoBloco(atual);
  const quem = tipo === "fala" ? (ultimaPessoa(r, o) ?? r.pessoas[0]?.id ?? null) : null;
  const vazio = blocoVazio(tipo, () => atual.id, quem);
  const novo = { ...vazio } as Bloco & { texto?: string };
  if (texto || novo.tipo !== "plano") novo.texto = texto;
  if (atual.duracao) novo.duracao = atual.duracao;
  if (atual.dica) novo.dica = atual.dica;
  return comBlocos(
    r,
    o.cena,
    r.cenas[o.cena].blocos.map((b, j) => (j === o.bloco ? (novo as Bloco) : b)),
  );
}

/**
 * Enter: um bloco novo logo depois, do mesmo tipo (ou do tipo pedido). Fala depois de fala troca de pessoa. Devolve o
 * roteiro e o id do bloco novo.
 */
export function inserirDepois(r: Roteiro, id: string, tipo?: TipoBloco, gerar: Gerar = novoId): { roteiro: Roteiro; id: string } {
  const o = acharBloco(r, id);
  if (!o) return { roteiro: r, id };
  const atual = r.cenas[o.cena].blocos[o.bloco];
  const t = tipo ?? atual.tipo;
  const quem = t === "fala" ? (atual.tipo === "fala" ? proximaPessoa(r, atual.quem) : (ultimaPessoa(r, o) ?? r.pessoas[0]?.id ?? null)) : null;
  const novo = blocoVazio(t, gerar, quem);
  const blocos = [...r.cenas[o.cena].blocos];
  blocos.splice(o.bloco + 1, 0, novo);
  return { roteiro: comBlocos(r, o.cena, blocos), id: novo.id };
}

/** Um bloco novo no fim da cena (o "+" do iPhone e o botão da cena vazia). */
export function inserirNoFim(r: Roteiro, cenaId: string, tipo: TipoBloco, gerar: Gerar = novoId): { roteiro: Roteiro; id: string } {
  const i = r.cenas.findIndex((c) => c.id === cenaId);
  if (i < 0) return { roteiro: r, id: "" };
  const blocos = r.cenas[i].blocos;
  const onde: Onde = blocos.length ? { cena: i, bloco: blocos.length - 1 } : { cena: Math.max(0, i - 1), bloco: Number.MAX_SAFE_INTEGER };
  const ultimo = blocos[blocos.length - 1];
  const quem =
    tipo === "fala"
      ? ultimo?.tipo === "fala"
        ? proximaPessoa(r, ultimo.quem)
        : (ultimaPessoa(r, i > 0 || blocos.length ? onde : null) ?? r.pessoas[0]?.id ?? null)
      : null;
  const novo = blocoVazio(tipo, gerar, quem);
  return { roteiro: comBlocos(r, i, [...blocos, novo]), id: novo.id };
}

/** Apaga o bloco; devolve o id para onde o foco vai (o anterior, senão o seguinte, senão null). */
export function apagarBloco(r: Roteiro, id: string): { roteiro: Roteiro; foco: string | null } {
  const o = acharBloco(r, id);
  if (!o) return { roteiro: r, foco: null };
  const blocos = r.cenas[o.cena].blocos;
  const foco = blocos[o.bloco - 1]?.id ?? blocos[o.bloco + 1]?.id ?? null;
  return {
    roteiro: comBlocos(
      r,
      o.cena,
      blocos.filter((_, j) => j !== o.bloco),
    ),
    foco,
  };
}

/** ⌥↑/⌥↓: move o bloco uma posição; na ponta da cena, passa para a cena vizinha. */
export function moverBloco(r: Roteiro, id: string, passo: 1 | -1): Roteiro {
  const o = acharBloco(r, id);
  if (!o) return r;
  const blocos = [...r.cenas[o.cena].blocos];
  const destino = o.bloco + passo;
  if (destino >= 0 && destino < blocos.length) {
    [blocos[o.bloco], blocos[destino]] = [blocos[destino], blocos[o.bloco]];
    return comBlocos(r, o.cena, blocos);
  }
  const vizinha = o.cena + passo;
  if (vizinha < 0 || vizinha >= r.cenas.length) return r;
  const [b] = blocos.splice(o.bloco, 1);
  const outros = [...r.cenas[vizinha].blocos];
  if (passo < 0) outros.push(b);
  else outros.unshift(b);
  return comBlocos(comBlocos(r, o.cena, blocos), vizinha, outros);
}

/** Arrastar (iPhone): leva o bloco da posição `de` para `para` dentro da mesma cena. */
export function reordenarBloco(r: Roteiro, cenaId: string, de: number, para: number): Roteiro {
  const i = r.cenas.findIndex((c) => c.id === cenaId);
  if (i < 0) return r;
  const blocos = [...r.cenas[i].blocos];
  if (de < 0 || de >= blocos.length || de === para) return r;
  const [b] = blocos.splice(de, 1);
  blocos.splice(Math.max(0, Math.min(blocos.length, para)), 0, b);
  return comBlocos(r, i, blocos);
}

/** ⌘⇧Enter: cena nova depois da cena dada (ou no fim), com um bloco de ação vazio. */
export function novaCena(r: Roteiro, depoisDe: string | null, gerar: Gerar = novoId): { roteiro: Roteiro; cenaId: string; blocoId: string } {
  const cena: Cena = { id: gerar(), titulo: "", blocos: [{ id: gerar(), tipo: "acao", texto: "" }] };
  const i = depoisDe ? r.cenas.findIndex((c) => c.id === depoisDe) : -1;
  const cenas = [...r.cenas];
  cenas.splice(i < 0 ? cenas.length : i + 1, 0, cena);
  return { roteiro: { ...r, cenas }, cenaId: cena.id, blocoId: cena.blocos[0].id };
}

/** A cena de um bloco (para o ⌘⇧Enter dentro dele). */
export function cenaDoBloco(r: Roteiro, id: string): Cena | null {
  const o = acharBloco(r, id);
  return o ? r.cenas[o.cena] : null;
}

export function mudarCena(r: Roteiro, id: string, campos: Partial<Omit<Cena, "id" | "blocos">>): Roteiro {
  const i = r.cenas.findIndex((c) => c.id === id);
  if (i < 0) return r;
  const nova = { ...r.cenas[i], ...campos } as Cena;
  for (const k of Object.keys(nova) as (keyof Cena)[]) if (nova[k] === undefined || nova[k] === "") if (k !== "titulo") delete nova[k];
  return comCena(r, i, nova);
}

/** Apaga a cena (o roteiro fica sempre com ao menos uma). */
export function apagarCena(r: Roteiro, id: string): Roteiro {
  if (r.cenas.length <= 1) return r;
  return { ...r, cenas: r.cenas.filter((c) => c.id !== id) };
}

export function moverCena(r: Roteiro, id: string, passo: 1 | -1): Roteiro {
  const i = r.cenas.findIndex((c) => c.id === id);
  const j = i + passo;
  if (i < 0 || j < 0 || j >= r.cenas.length) return r;
  const cenas = [...r.cenas];
  [cenas[i], cenas[j]] = [cenas[j], cenas[i]];
  return { ...r, cenas };
}

/* ───────────── pessoas ───────────── */

export function novaPessoa(r: Roteiro, nome: string, papel: PapelPessoa = "outro", gerar: Gerar = novoId): { roteiro: Roteiro; id: string } {
  const p: Pessoa = { id: gerar(), nome: nome.replace(/\s+/g, " ").slice(0, 80), papel };
  return { roteiro: { ...r, pessoas: [...r.pessoas, p] }, id: p.id };
}

export function mudarPessoa(r: Roteiro, id: string, campos: Partial<Omit<Pessoa, "id">>): Roteiro {
  return { ...r, pessoas: r.pessoas.map((p) => (p.id === id ? { ...p, ...campos } : p)) };
}

/** Tira a pessoa do elenco; as falas dela ficam sem pessoa ("Voz"), nada do texto se perde. */
export function apagarPessoa(r: Roteiro, id: string): Roteiro {
  return {
    ...r,
    pessoas: r.pessoas.filter((p) => p.id !== id),
    cenas: r.cenas.map((c) =>
      c.blocos.some((b) => b.tipo === "fala" && b.quem === id)
        ? { ...c, blocos: c.blocos.map((b) => (b.tipo === "fala" && b.quem === id ? { ...b, quem: null } : b)) }
        : c,
    ),
  };
}

/* ───────────── tempo digitado ───────────── */

/** "1:30", "90", "1m30" ou "" → segundos (null = vazio ou inválido). */
export function lerTempo(t: string): number | null {
  const s = t.trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  const mmss = /^(\d{1,3}):([0-5]?\d(?:\.\d)?)$/.exec(s);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const ms = /^(?:(\d{1,3})\s*m(?:in)?)?\s*(?:(\d{1,4}(?:\.\d)?)\s*s?)?$/.exec(s);
  if (ms && (ms[1] || ms[2])) {
    const n = Number(ms[1] ?? 0) * 60 + Number(ms[2] ?? 0);
    return n > 0 ? n : null;
  }
  return null;
}
