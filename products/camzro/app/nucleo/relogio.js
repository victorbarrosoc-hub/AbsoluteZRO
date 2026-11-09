// CAMZRO · relógio do set. Conta pura.
//
// Para o timecode da hora do dia bater entre vários aparelhos (câmera A, B, C, o gravador de som), todos acertam o
// relógio pelo mesmo servidor, como o "jam sync" de um gerador de timecode, só que pela rede:
// - cada amostra: o aparelho marca t0, pede a hora, o servidor responde com a hora dele (ts) e o aparelho marca t1;
// - atraso de ida e volta = t1 − t0; diferença do relógio = ts − (t0 + t1) / 2 (algoritmo de Cristian);
// - fica a amostra com o menor atraso (a mais confiável) e a incerteza é metade dele.
// Com o Wi-Fi do set, a incerteza fica em poucos milissegundos: bem menos que um quadro (41,7 ms a 24 fps).

/** Uma amostra: { t0, t1, servidor } (ms) → { diferenca, atraso }. */
export function amostra({ t0, t1, servidor }) {
  const atraso = t1 - t0
  return { diferenca: servidor - (t0 + t1) / 2, atraso }
}

/**
 * Junta as amostras: usa as de menor atraso (o terço melhor, no mínimo uma) e tira a mediana da diferença delas.
 * Devolve { diferenca, incerteza, amostras } ou null se nenhuma presta (atraso negativo ou acima de `maxAtraso`).
 */
export function combinar(amostras, { maxAtraso = 2000 } = {}) {
  const boas = amostras
    .map((a) => ('diferenca' in a ? a : amostra(a)))
    .filter((a) => Number.isFinite(a.diferenca) && a.atraso >= 0 && a.atraso <= maxAtraso)
    .sort((a, b) => a.atraso - b.atraso)
  if (!boas.length) return null
  const melhores = boas.slice(0, Math.max(1, Math.ceil(boas.length / 3)))
  const difs = melhores.map((a) => a.diferenca).sort((a, b) => a - b)
  const meio = Math.floor(difs.length / 2)
  const diferenca = difs.length % 2 ? difs[meio] : (difs[meio - 1] + difs[meio]) / 2
  return { diferenca, incerteza: melhores[0].atraso / 2, amostras: boas.length }
}

/** A incerteza em quadros, para dizer na tela se dá para confiar no timecode entre aparelhos. */
export const incertezaEmQuadros = (incertezaMs, fps) => (incertezaMs / 1000) * fps

/** Qualidade da sincronia: 'quadro' (< ½ quadro), 'boa' (< 1 quadro), 'fraca' (pior) ou 'sem' (não acertou). */
export function qualidade(resultado, fps) {
  if (!resultado) return 'sem'
  const q = incertezaEmQuadros(resultado.incerteza, fps)
  return q < 0.5 ? 'quadro' : q < 1 ? 'boa' : 'fraca'
}
