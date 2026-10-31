/**
 * Vista Edição (quem edita, no AEON ou em outro editor): as deixas em ordem de tempo, com começo e fim ESTIMADOS (a
 * regra está em `tempo.ts`), a cena e o tipo, cada tipo com a sua cor (`cor` é o nome do token; a tela escolhe o tom).
 * Fala com o texto; lettering com texto e estilo; áudio (trilha, efeito, BG, silêncio) com entra/sai; plano e ação como
 * a imagem necessária. Observação é de captação e nota é interna: nenhuma das duas entra. Puro.
 *
 * É a base do arquivo `maestro.roteiro/1` da F3 (contrato em packages/media-contracts, ainda não existe).
 */
import { type Bloco, NOME_MODO_FALA, nomeDeQuemFala, type Roteiro } from "../modelo";
import { linhaDoTempo } from "../tempo";
import { aparar, entra, partesDoPlano, rotuloAudio, rotuloLettering } from "./comum";

export type CorDeixa = "fala" | "lettering" | "audio" | "imagem";
export type DeixaEdicao = {
  blocoId: string;
  cenaId: string;
  cenaNumero: number;
  cenaTitulo: string;
  tipo: "fala" | "lettering" | "audio" | "plano" | "acao";
  cor: CorDeixa;
  inicioSeg: number;
  fimSeg: number;
  /** "Ana · OFF", "GC", "Trilha · entra em fade", "PM". */
  rotulo: string;
  texto: string;
};

export type VistaEdicao = { deixas: DeixaEdicao[]; totalSeg: number };

const COR: Record<DeixaEdicao["tipo"], CorDeixa> = { fala: "fala", lettering: "lettering", audio: "audio", plano: "imagem", acao: "imagem" };

function rotuloETexto(r: Roteiro, b: Bloco): { rotulo: string; texto: string } | null {
  switch (b.tipo) {
    case "fala": {
      const nome = nomeDeQuemFala(r, b.quem);
      return { rotulo: b.modo === "on" ? nome : `${nome} · ${NOME_MODO_FALA[b.modo]}`, texto: aparar(b.texto) };
    }
    case "lettering":
      return { rotulo: rotuloLettering(b), texto: aparar(b.texto) };
    case "audio":
      return { rotulo: rotuloAudio(b), texto: aparar(b.texto) };
    case "plano": {
      const p = partesDoPlano(b);
      return { rotulo: p.sigla, texto: p.detalhe };
    }
    case "acao":
      return { rotulo: "Imagem", texto: aparar(b.texto) };
    default:
      return null;
  }
}

export function vistaEdicao(r: Roteiro): VistaEdicao {
  const tempo = linhaDoTempo(r);
  const blocos = new Map<string, { b: Bloco; ordem: number; titulo: string }>();
  let ordem = 0;
  for (const c of r.cenas) for (const b of c.blocos) blocos.set(b.id, { b, ordem: ordem++, titulo: c.titulo.trim() });
  const deixas: (DeixaEdicao & { ordem: number })[] = [];
  for (const d of tempo.deixas) {
    const x = blocos.get(d.blocoId);
    if (!x || x.b.tipo === "observacao" || x.b.tipo === "nota" || !entra(x.b)) continue;
    const rt = rotuloETexto(r, x.b);
    if (!rt) continue;
    const tipo = x.b.tipo as DeixaEdicao["tipo"];
    deixas.push({
      blocoId: d.blocoId,
      cenaId: d.cenaId,
      cenaNumero: d.cenaNumero,
      cenaTitulo: x.titulo,
      tipo,
      cor: COR[tipo],
      inicioSeg: d.inicioSeg,
      fimSeg: d.fimSeg,
      ...rt,
      ordem: x.ordem,
    });
  }
  deixas.sort((a, b) => a.inicioSeg - b.inicioSeg || a.ordem - b.ordem);
  return { deixas: deixas.map(({ ordem: _o, ...d }) => d), totalSeg: tempo.totalSeg };
}
