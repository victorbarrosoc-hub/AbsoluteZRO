/** Peças das vistas: rótulos de lettering, áudio e plano, e o filtro do que é conteúdo. Puro. */
import {
  type Bloco,
  type BlocoAudio,
  type BlocoLettering,
  type BlocoPlano,
  blocoVazioDeConteudo,
  NOME_ESTILO_LETTERING,
  NOME_TIPO_AUDIO,
  SIGLA_TAMANHO_PLANO,
} from "../modelo";

export type OpcoesVista = {
  /**
   * Inclui os blocos ainda vazios (com a `dica` do modelo num campo à parte) para a tela desenhar o campo a preencher.
   * Padrão: não (impressão, cópia, envio). A dica nunca vira `texto`.
   */
  incluirVazios?: boolean;
};

/** O bloco entra na vista? (nota nunca; vazio só com `incluirVazios`). */
export const entra = (b: Bloco, o: OpcoesVista = {}) => b.tipo !== "nota" && (o.incluirVazios || !blocoVazioDeConteudo(b));

/** Texto aparado, com espaços repetidos de cada linha juntados. */
export const aparar = (t: string) =>
  t
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const rotuloLettering = (b: BlocoLettering) => NOME_ESTILO_LETTERING[b.estilo];

const TRANSICAO = { corte: "corte", fade: "fade" } as const;
/** "Trilha · entra em fade · sai em corte". */
export function rotuloAudio(b: BlocoAudio): string {
  return [NOME_TIPO_AUDIO[b.audio], b.entra ? `entra em ${TRANSICAO[b.entra]}` : "", b.sai ? `sai em ${TRANSICAO[b.sai]}` : ""].filter(Boolean).join(" · ");
}

/** Sigla do plano ("PM") e o detalhe ("plongée · travelling · 35mm · 60 fps · plano sequência"). */
export function partesDoPlano(b: BlocoPlano): { sigla: string; detalhe: string } {
  const detalhe = [b.angulo, b.movimento, b.lente, b.fps ? `${b.fps} fps` : "", b.texto]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(" · ");
  return { sigla: SIGLA_TAMANHO_PLANO[b.tamanho], detalhe };
}
