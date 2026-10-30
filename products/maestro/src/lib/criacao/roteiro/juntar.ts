/**
 * Junta duas edições do mesmo roteiro (plano da Criação §4.3, conflito por `rev`): o servidor recusa a gravação com
 * 409 e devolve o atual ("deles"); a tela junta com o que a pessoa tinha ("meu"), a partir do que as duas viram por
 * último ("base"), e grava de novo com o `rev` novo. Por id, em três vias:
 *
 *   - mudou só de um lado → fica a mudança; mudou dos dois lados igual → fica;
 *   - mudou dos dois lados diferente → fica a DELES e sai um conflito com as duas versões ("Fulano mudou este trecho");
 *   - incluído por mim → entra depois do vizinho de antes (na minha ordem) que ainda existe; senão no começo;
 *   - apagado por mim e intocado por eles → sai; apagado por mim e mudado por eles → fica o deles, com conflito;
 *   - apagado por eles e mudado por mim → volta o meu, com conflito (nada do que a pessoa escreveu se perde);
 *   - a ORDEM é a deles (mover bloco ou cena de um lado só não briga com o texto).
 * Cenas comparam os campos sem os blocos; os blocos são juntados dentro da cena em que estão do lado deles. Puro.
 */
import type { Bloco, Cena, Pessoa, Roteiro } from "./modelo";

export type Conflito =
  | { tipo: "roteiro"; campo: "formato" | "alvo" | "wpm"; meu: unknown; deles: unknown }
  | { tipo: "pessoa"; id: string; meu: Pessoa | null; deles: Pessoa | null }
  | { tipo: "cena"; id: string; meu: Omit<Cena, "blocos"> | null; deles: Omit<Cena, "blocos"> | null }
  | { tipo: "bloco"; id: string; meu: Bloco | null; deles: Bloco | null };

/** JSON com as chaves em ordem (comparação estável, venha de onde vier). */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}
const igual = (a: unknown, b: unknown) => canon(a) === canon(b);
const semBlocos = ({ blocos: _b, ...c }: Cena) => c;

type Escolha<T> = { valor: T | null; conflito: boolean };
/** A regra de três vias para um item (null = não existe daquele lado). */
function escolher<T>(base: T | null, meu: T | null, deles: T | null): Escolha<T> {
  if (igual(meu, deles)) return { valor: deles, conflito: false };
  if (igual(meu, base)) return { valor: deles, conflito: false };
  if (igual(deles, base)) return { valor: meu, conflito: false };
  // os dois mudaram, de jeitos diferentes
  if (deles === null) return { valor: meu, conflito: true };
  return { valor: deles, conflito: true };
}

/** Insere `item` depois do vizinho de antes (na ordem de `minha`) que existe em `lista`; senão no começo. */
function inserirPelaVizinhanca<T extends { id: string }>(lista: T[], item: T, minha: { id: string }[]) {
  const i = minha.findIndex((x) => x.id === item.id);
  for (let j = i - 1; j >= 0; j--) {
    const k = lista.findIndex((x) => x.id === minha[j].id);
    if (k >= 0) {
      lista.splice(k + 1, 0, item);
      return;
    }
  }
  lista.unshift(item);
}

export function juntarRoteiros(base: Roteiro, meu: Roteiro, deles: Roteiro): { roteiro: Roteiro; conflitos: Conflito[] } {
  const conflitos: Conflito[] = [];

  const topo = { formato: deles.formato, alvo: deles.alvo, wpm: deles.wpm };
  for (const campo of ["formato", "alvo", "wpm"] as const) {
    const e = escolher(base[campo], meu[campo], deles[campo]);
    (topo as Record<string, unknown>)[campo] = e.valor;
    if (e.conflito) conflitos.push({ tipo: "roteiro", campo, meu: meu[campo], deles: deles[campo] });
  }

  // pessoas
  const pBase = new Map(base.pessoas.map((p) => [p.id, p]));
  const pMeu = new Map(meu.pessoas.map((p) => [p.id, p]));
  const pDeles = new Map(deles.pessoas.map((p) => [p.id, p]));
  const pessoas: Pessoa[] = [];
  for (const id of new Set([...deles.pessoas.map((p) => p.id), ...meu.pessoas.map((p) => p.id), ...base.pessoas.map((p) => p.id)])) {
    const e = escolher(pBase.get(id) ?? null, pMeu.get(id) ?? null, pDeles.get(id) ?? null);
    if (e.conflito) conflitos.push({ tipo: "pessoa", id, meu: pMeu.get(id) ?? null, deles: pDeles.get(id) ?? null });
    if (!e.valor) continue;
    if (pDeles.has(id)) pessoas.push(e.valor);
    else inserirPelaVizinhanca(pessoas, e.valor, meu.pessoas);
  }

  // blocos de cada lado, por id, com a cena em que estão
  const blocosDe = (r: Roteiro) => {
    const m = new Map<string, { b: Bloco; cena: string }>();
    for (const c of r.cenas) for (const b of c.blocos) m.set(b.id, { b, cena: c.id });
    return m;
  };
  const bBase = blocosDe(base);
  const bMeu = blocosDe(meu);
  const bDeles = blocosDe(deles);

  // cenas: campos sem os blocos
  const cBase = new Map(base.cenas.map((c) => [c.id, c]));
  const cMeu = new Map(meu.cenas.map((c) => [c.id, c]));
  const cDeles = new Map(deles.cenas.map((c) => [c.id, c]));
  const cenas: Cena[] = [];
  /** Cenas que eles apagaram e eu mexi: voltam com todos os meus blocos. */
  const restauradas = new Set<string>();
  for (const id of new Set([...deles.cenas.map((c) => c.id), ...meu.cenas.map((c) => c.id), ...base.cenas.map((c) => c.id)])) {
    const b = cBase.get(id);
    const m = cMeu.get(id);
    const d = cDeles.get(id);
    const e = escolher(b ? semBlocos(b) : null, m ? semBlocos(m) : null, d ? semBlocos(d) : null);
    let campos = e.valor;
    // Apagar a cena só vale se o outro lado não mexeu nela nem nos blocos dela.
    if (b && !m && d) {
      campos = igual(d, b) ? null : semBlocos(d);
      if (campos) conflitos.push({ tipo: "cena", id, meu: null, deles: campos });
    } else if (b && m && !d) {
      campos = igual(m, b) ? null : semBlocos(m);
      if (campos) {
        restauradas.add(id);
        conflitos.push({ tipo: "cena", id, meu: campos, deles: null });
      }
    } else if (e.conflito && m && d) conflitos.push({ tipo: "cena", id, meu: semBlocos(m), deles: semBlocos(d) });
    if (!campos) continue;
    const cena: Cena = { ...campos, blocos: [] };
    if (d) cenas.push(cena);
    else inserirPelaVizinhanca(cenas, cena, meu.cenas);
  }
  const cenaPorId = new Map(cenas.map((c) => [c.id, c]));

  // blocos: a lista de cada cena é a deles; depois entram os meus
  for (const c of deles.cenas) {
    const alvo = cenaPorId.get(c.id);
    if (!alvo) continue;
    for (const d of c.blocos) {
      const e = escolher(bBase.get(d.id)?.b ?? null, bMeu.get(d.id)?.b ?? null, d);
      if (e.conflito) conflitos.push({ tipo: "bloco", id: d.id, meu: bMeu.get(d.id)?.b ?? null, deles: d });
      if (e.valor) alvo.blocos.push(e.valor);
    }
  }
  const presentes = new Set(cenas.flatMap((c) => c.blocos.map((b) => b.id)));
  for (const mc of meu.cenas) {
    for (const m of mc.blocos) {
      if (presentes.has(m.id) || bDeles.has(m.id)) continue;
      const b = bBase.get(m.id)?.b ?? null;
      const intocado = !!b && igual(b, m);
      if (intocado && !restauradas.has(mc.id)) continue; // apagado por eles, intocado por mim
      if (b && !intocado) conflitos.push({ tipo: "bloco", id: m.id, meu: m, deles: null });
      const destino = cenaPorId.get(mc.id) ?? cenas[cenas.length - 1];
      if (!destino) continue;
      inserirPelaVizinhanca(destino.blocos, m, mc.blocos);
      presentes.add(m.id);
    }
  }

  return { roteiro: { v: 1, formato: topo.formato, alvo: topo.alvo, wpm: topo.wpm, pessoas, cenas }, conflitos };
}
