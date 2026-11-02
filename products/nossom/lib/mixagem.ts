// A mixagem (voz + trilha + efeitos com a Z, titular 02/11/2026): monta o filtro do FFmpeg. A trilha entra em loop e
// abaixa sozinha quando a voz fala (sidechain); cada efeito entra no seu ponto, uma vez. A voz manda na duração.
export type EfeitoNaMix = { em: number; ganho?: number };

const ganhoSeguro = (g: number | undefined, padrao: number) =>
  Number.isFinite(g) ? Math.min(2, Math.max(0, g!)) : padrao;

/**
 * Entradas esperadas: 0 = voz; 1 = trilha (se houver, com `-stream_loop -1`); depois, um arquivo por efeito.
 * `fim` é o trecho final (limitador e duração) aplicado à soma; devolve o grafo com a saída em [out].
 */
export function filtroMixagem(opcoes: {
  trilha: boolean;
  ganhoTrilha?: number;
  /** 0 a 100: o quanto a trilha abaixa quando a voz fala. */
  forca: number;
  efeitos: EfeitoNaMix[];
  fim: string;
}) {
  if (!opcoes.trilha && !opcoes.efeitos.length)
    throw new Error('Adicione uma trilha ou um efeito para fazer a mixagem.');
  const partes: string[] = [];
  const somar = ['[voz]'];
  if (opcoes.trilha) {
    const razao = (1 + (Math.min(100, Math.max(0, opcoes.forca)) / 100) * 15).toFixed(2);
    partes.push(
      `[0:a]asplit=2[voz][lado]`,
      `[1:a]volume=${ganhoSeguro(opcoes.ganhoTrilha, 0.25)}[trilha]`,
      `[trilha][lado]sidechaincompress=threshold=0.02:ratio=${razao}:attack=15:release=400[abaixada]`,
    );
    somar.push('[abaixada]');
  } else partes.push('[0:a]anull[voz]');
  const primeiro = opcoes.trilha ? 2 : 1;
  opcoes.efeitos.forEach((e, i) => {
    const ms = Math.round(Math.max(0, Number.isFinite(e.em) ? e.em : 0) * 1000);
    partes.push(
      `[${primeiro + i}:a]adelay=delays=${ms}:all=1,volume=${ganhoSeguro(e.ganho, 0.8)}[efeito${i}]`,
    );
    somar.push(`[efeito${i}]`);
  });
  partes.push(
    `${somar.join('')}amix=inputs=${somar.length}:duration=first:normalize=0,${opcoes.fim}[out]`,
  );
  return partes.join(';');
}
