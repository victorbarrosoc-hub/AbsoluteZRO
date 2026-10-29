/**
 * "Comparar com v2" (plano da Criação §4.4): a diferença entre duas formas do roteiro, por id (a ordem não conta como
 * mudança de texto): blocos incluídos, removidos e mudados, e cenas incluídas e removidas. Cada item vem com um resumo
 * de uma linha para a tela. Nota interna entra (quem escreve quer ver), dica de modelo não. Puro.
 */
import { type Bloco, NOME_MODO_FALA, NOME_TIPO_BLOCO, nomeDeQuemFala, type Roteiro } from "./modelo";
import { partesDoPlano, rotuloAudio, rotuloLettering } from "./vistas/comum";

export type ItemDiferenca = { id: string; cena: number; tipo: Bloco["tipo"]; rotulo: string; antes: string | null; depois: string | null };
export type Diferenca = {
  incluidos: ItemDiferenca[];
  removidos: ItemDiferenca[];
  mudados: ItemDiferenca[];
  cenasIncluidas: string[];
  cenasRemovidas: string[];
  /** Nada mudou nos blocos nem nas cenas. */
  igual: boolean;
};

const umaLinha = (t: string) => t.replace(/\s+/g, " ").trim();

/** "Fala · Ana (OFF)", "Plano · PM", "Lettering · GC"… e o texto do bloco numa linha. */
export function resumoDoBloco(r: Roteiro, b: Bloco): { rotulo: string; texto: string } {
  switch (b.tipo) {
    case "fala":
      return { rotulo: `Fala · ${nomeDeQuemFala(r, b.quem)}${b.modo === "on" ? "" : ` (${NOME_MODO_FALA[b.modo]})`}`, texto: umaLinha(b.texto) };
    case "plano": {
      const p = partesDoPlano(b);
      return { rotulo: `Plano · ${p.sigla}`, texto: umaLinha(p.detalhe) };
    }
    case "lettering":
      return { rotulo: `Lettering · ${rotuloLettering(b)}`, texto: umaLinha(b.texto) };
    case "audio":
      return { rotulo: rotuloAudio(b), texto: umaLinha(b.texto) };
    default:
      return { rotulo: NOME_TIPO_BLOCO[b.tipo], texto: umaLinha(b.texto) };
  }
}

/** Forma comparável do bloco (sem a dica, que não é conteúdo). */
const chave = (r: Roteiro, b: Bloco) => {
  const { dica: _d, ...resto } = b;
  const s = resumoDoBloco(r, b);
  return JSON.stringify([resto, s.rotulo]);
};

function porId(r: Roteiro) {
  const m = new Map<string, { b: Bloco; cena: number }>();
  r.cenas.forEach((c, i) => c.blocos.forEach((b) => m.set(b.id, { b, cena: i + 1 })));
  return m;
}

const tituloCena = (r: Roteiro, id: string) => {
  const i = r.cenas.findIndex((c) => c.id === id);
  const t = r.cenas[i]?.titulo.trim();
  return t ? `Cena ${i + 1} · ${t}` : `Cena ${i + 1}`;
};

/** O que mudou de `antes` (uma versão) para `depois` (o rascunho). */
export function compararRoteiros(antes: Roteiro, depois: Roteiro): Diferenca {
  const a = porId(antes);
  const d = porId(depois);
  const incluidos: ItemDiferenca[] = [];
  const removidos: ItemDiferenca[] = [];
  const mudados: ItemDiferenca[] = [];
  for (const [id, x] of d) {
    const s = resumoDoBloco(depois, x.b);
    const velho = a.get(id);
    if (!velho) incluidos.push({ id, cena: x.cena, tipo: x.b.tipo, rotulo: s.rotulo, antes: null, depois: s.texto });
    else if (chave(antes, velho.b) !== chave(depois, x.b)) {
      const v = resumoDoBloco(antes, velho.b);
      mudados.push({ id, cena: x.cena, tipo: x.b.tipo, rotulo: s.rotulo, antes: v.texto, depois: s.texto });
    }
  }
  for (const [id, x] of a) {
    if (d.has(id)) continue;
    const s = resumoDoBloco(antes, x.b);
    removidos.push({ id, cena: x.cena, tipo: x.b.tipo, rotulo: s.rotulo, antes: s.texto, depois: null });
  }
  const idsA = new Set(antes.cenas.map((c) => c.id));
  const idsD = new Set(depois.cenas.map((c) => c.id));
  const cenasIncluidas = depois.cenas.filter((c) => !idsA.has(c.id)).map((c) => tituloCena(depois, c.id));
  const cenasRemovidas = antes.cenas.filter((c) => !idsD.has(c.id)).map((c) => tituloCena(antes, c.id));
  const igual = !incluidos.length && !removidos.length && !mudados.length && !cenasIncluidas.length && !cenasRemovidas.length;
  return { incluidos, removidos, mudados, cenasIncluidas, cenasRemovidas, igual };
}
