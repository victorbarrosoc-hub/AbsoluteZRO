/**
 * Dados da impressão/PDF: a mesma página com CSS `.imprimivel` (A4, papel branco, timbrado da produtora como nos
 * orçamentos) em Literário, Técnico, Teleprompter ou Edição (o "PDF para a edição": cenas com tempo e as deixas). O PDF é o "salvar como PDF" do navegador. Esta função só junta o que
 * a página desenha (cabeçalho, medidor e a vista escolhida); a marca da produtora vem de `lerEmpresa`/`org_marca` na
 * página. Nunca leva bloco vazio, dica de modelo nem nota interna. Puro.
 */
import { cabecalhoDaCena, NOME_PAPEL_PESSOA, type Roteiro } from "../modelo";
import { formatarTempo, linhaDoTempo, medidor, type Medidor } from "../tempo";
import { vistaEdicao, type VistaEdicao } from "./edicao";
import { vistaLiterario, type VistaLiterario } from "./literario";
import { type ColunaTecnico, vistaTecnico, type VistaTecnico } from "./tecnico";
import { vistaTeleprompter, type VistaTeleprompter } from "./teleprompter";

export const VISTAS_IMPRESSAO = ["literario", "tecnico", "teleprompter", "edicao"] as const;
export type VistaImpressao = (typeof VISTAS_IMPRESSAO)[number];

export type DadosImpressao = {
  titulo: string;
  /** "v3" quando é uma versão salva; null = rascunho. */
  versao: string | null;
  formato: Roteiro["formato"];
  duracao: string;
  medidor: Medidor;
  cenas: number;
  /** Quem fala, com o papel ("Ana · Locutor"). */
  elenco: string[];
} & (
  | { vista: "literario"; literario: VistaLiterario }
  | { vista: "tecnico"; tecnico: VistaTecnico }
  | { vista: "teleprompter"; teleprompter: VistaTeleprompter; pessoa: string | null }
  | { vista: "edicao"; edicao: VistaEdicao; cenasEdicao: { numero: number; cabecalho: string; inicioSeg: number; fimSeg: number }[] }
);

export function dadosImpressao(
  r: Roteiro,
  e: { titulo: string; vista: VistaImpressao; versao?: number | null; ocultar?: readonly ColunaTecnico[]; pessoa?: string | null },
): DadosImpressao {
  const tempo = linhaDoTempo(r);
  const total = tempo.totalSeg;
  const base = {
    titulo: e.titulo.replace(/\s+/g, " ").trim() || "Roteiro",
    versao: e.versao ? `v${e.versao}` : null,
    formato: r.formato,
    duracao: formatarTempo(total),
    medidor: medidor(total, r.alvo),
    cenas: r.cenas.length,
    elenco: r.pessoas.map((p) => [p.nome.trim(), NOME_PAPEL_PESSOA[p.papel]].filter(Boolean).join(" · ")),
  };
  switch (e.vista) {
    case "literario":
      return { ...base, vista: "literario", literario: vistaLiterario(r) };
    case "tecnico":
      return { ...base, vista: "tecnico", tecnico: vistaTecnico(r, { ocultar: e.ocultar }) };
    case "teleprompter":
      return { ...base, vista: "teleprompter", teleprompter: vistaTeleprompter(r, { pessoa: e.pessoa }), pessoa: e.pessoa || null };
    case "edicao":
      return {
        ...base,
        vista: "edicao",
        edicao: vistaEdicao(r),
        cenasEdicao: r.cenas.map((c, i) => ({
          numero: i + 1,
          cabecalho: cabecalhoDaCena(c, i + 1),
          inicioSeg: tempo.cenas[i].inicioSeg,
          fimSeg: Math.round((tempo.cenas[i].inicioSeg + tempo.cenas[i].duracaoSeg) * 10) / 10,
        })),
      };
  }
}
