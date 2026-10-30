/**
 * Vista Técnico (captação e direção): a tabela Cena · Imagem/Plano · Lettering · Áudio · Observações · Tempo, o roteiro
 * de duas colunas com a decupagem. A fala entra em Áudio, marcada OFF/sonora/passagem. Puro.
 *
 * Linhas: cada cena se divide em linhas na ordem dos blocos. Começa linha nova quando chega imagem (plano/ação) e a
 * linha já tem outra coisa, quando chega um plano e a linha já tem ação (plano novo), ou quando chega uma fala e a
 * linha já tem fala. Lettering, áudio e observação ficam na linha em que aparecem. O tempo da linha vem da linha do
 * tempo (`tempo.ts`): do começo do primeiro bloco ao fim do último.
 */
import { type Bloco, cabecalhoDaCena, NOME_MODO_FALA, nomeDeQuemFala, type Roteiro, type TipoBloco } from "../modelo";
import { type Deixa, linhaDoTempo } from "../tempo";
import { aparar, entra, type OpcoesVista, partesDoPlano, rotuloAudio, rotuloLettering } from "./comum";

export const COLUNAS_TECNICO = ["cena", "imagem", "lettering", "audio", "observacoes", "tempo"] as const;
export type ColunaTecnico = (typeof COLUNAS_TECNICO)[number];
export const NOME_COLUNA_TECNICO: Record<ColunaTecnico, string> = {
  cena: "Cena",
  imagem: "Imagem/Plano",
  lettering: "Lettering",
  audio: "Áudio",
  observacoes: "Observações",
  tempo: "Tempo",
};

export type CelulaTecnico = {
  blocoId: string;
  tipo: Exclude<TipoBloco, "nota">;
  /** "PM", "GC", "Ana · OFF", "Trilha · entra em fade"; null na ação e na observação. */
  rotulo: string | null;
  texto: string;
  /** A indicação da fala ("sorrindo"). */
  obs?: string;
  /** Só com `incluirVazios`, no bloco vazio. */
  dica?: string;
};

export type LinhaTecnico = {
  imagem: CelulaTecnico[];
  lettering: CelulaTecnico[];
  audio: CelulaTecnico[];
  observacoes: CelulaTecnico[];
  inicioSeg: number;
  fimSeg: number;
  duracaoSeg: number;
};

export type CenaTecnico = {
  id: string;
  numero: number;
  cabecalho: string;
  titulo: string;
  inicioSeg: number;
  duracaoSeg: number;
  excede: boolean;
  linhas: LinhaTecnico[];
};

export type VistaTecnico = { colunas: ColunaTecnico[]; cenas: CenaTecnico[]; totalSeg: number };

export type OpcoesTecnico = OpcoesVista & {
  /** Colunas escondidas pela pessoa (Cena nunca sai). */
  ocultar?: readonly ColunaTecnico[];
};

type Coluna = "imagem" | "lettering" | "audio" | "observacoes";
const COLUNA_DO_TIPO: Record<Exclude<TipoBloco, "nota">, Coluna> = {
  plano: "imagem",
  acao: "imagem",
  lettering: "lettering",
  fala: "audio",
  audio: "audio",
  observacao: "observacoes",
};

function celula(r: Roteiro, b: Exclude<Bloco, { tipo: "nota" }>, o: OpcoesVista): CelulaTecnico {
  let c: CelulaTecnico;
  switch (b.tipo) {
    case "plano": {
      const p = partesDoPlano(b);
      c = { blocoId: b.id, tipo: b.tipo, rotulo: p.sigla, texto: p.detalhe };
      break;
    }
    case "acao":
    case "observacao":
      c = { blocoId: b.id, tipo: b.tipo, rotulo: null, texto: aparar(b.texto) };
      break;
    case "lettering":
      c = { blocoId: b.id, tipo: b.tipo, rotulo: rotuloLettering(b), texto: aparar(b.texto) };
      break;
    case "audio":
      c = { blocoId: b.id, tipo: b.tipo, rotulo: rotuloAudio(b), texto: aparar(b.texto) };
      break;
    case "fala": {
      const nome = nomeDeQuemFala(r, b.quem);
      c = { blocoId: b.id, tipo: b.tipo, rotulo: b.modo === "on" ? nome : `${nome} · ${NOME_MODO_FALA[b.modo]}`, texto: aparar(b.texto) };
      if (b.obs?.trim()) c.obs = b.obs.trim();
      break;
    }
  }
  if (o.incluirVazios && b.dica) c.dica = b.dica;
  return c;
}

const linhaVazia = (): LinhaTecnico => ({ imagem: [], lettering: [], audio: [], observacoes: [], inicioSeg: 0, fimSeg: 0, duracaoSeg: 0 });
const temAlgo = (l: LinhaTecnico) => l.imagem.length + l.lettering.length + l.audio.length + l.observacoes.length > 0;

export function vistaTecnico(r: Roteiro, o: OpcoesTecnico = {}): VistaTecnico {
  const tempo = linhaDoTempo(r);
  const deixa = new Map<string, Deixa>(tempo.deixas.map((d) => [d.blocoId, d]));
  const ocultas = new Set(o.ocultar ?? []);
  const colunas = COLUNAS_TECNICO.filter((c) => c === "cena" || !ocultas.has(c));

  const cenas = r.cenas.map((c, i): CenaTecnico => {
    const tc = tempo.cenas[i];
    const linhas: LinhaTecnico[] = [];
    let atual = linhaVazia();
    const ids: string[][] = [];
    let idsAtual: string[] = [];
    const fechar = () => {
      if (temAlgo(atual)) {
        linhas.push(atual);
        ids.push(idsAtual);
      }
      atual = linhaVazia();
      idsAtual = [];
    };
    for (const b of c.blocos) {
      if (b.tipo === "nota" || !entra(b, o)) continue;
      const col = COLUNA_DO_TIPO[b.tipo];
      const novaImagem = col === "imagem" && (atual.lettering.length || atual.audio.length || atual.observacoes.length);
      const novoPlano = b.tipo === "plano" && atual.imagem.some((x) => x.tipo === "acao");
      const novaFala = b.tipo === "fala" && atual.audio.some((x) => x.tipo === "fala");
      if (novaImagem || novoPlano || novaFala) fechar();
      atual[col].push(celula(r, b, o));
      idsAtual.push(b.id);
    }
    fechar();
    linhas.forEach((l, j) => {
      const ds = ids[j].map((id) => deixa.get(id)).filter((d): d is Deixa => !!d);
      l.inicioSeg = ds.length ? Math.min(...ds.map((d) => d.inicioSeg)) : tc.inicioSeg;
      l.fimSeg = ds.length ? Math.max(...ds.map((d) => d.fimSeg)) : tc.inicioSeg;
      l.duracaoSeg = Math.round((l.fimSeg - l.inicioSeg) * 10) / 10;
    });
    return {
      id: c.id,
      numero: tc.numero,
      cabecalho: cabecalhoDaCena(c, tc.numero),
      titulo: c.titulo.trim(),
      inicioSeg: tc.inicioSeg,
      duracaoSeg: tc.duracaoSeg,
      excede: tc.excede,
      linhas,
    };
  });
  return { colunas, cenas, totalSeg: tempo.totalSeg };
}
