// Worker das medidas clássicas da decupagem (sem modelo): nitidez em várias escalas, tremido pelo cepstro, exposição,
// ruído, impressões digitais e horizonte (src/decupagem/medidas.js). Roda num pool (app/trabalho/pool.js): várias
// fotos ao mesmo tempo, uma por worker, e a tela segue livre.
//
// Tarefa (protocolo de app/trabalho/servir.js):
//   medir { blob: Blob (a prévia de 1024 px) | previa: { largura, altura, rgba }, devolver?: boolean }
//     → { medidas (enxutas: app/decupagem/compacto.js), quadro: { largura, altura }, pixels?, tempos: { abrir, medir } }
//   `devolver: true` manda os pixels de volta, sem cópia (o worker de visão usa os mesmos, sem decodificar de novo).

import { comTransferencia, servir } from '../trabalho/servir.js'
import { medir } from '../../src/decupagem/medidas.js'
import { compactarMedidas } from './compacto.js'

const agora = () => performance.now()
const ms = (v) => Math.round(v * 10) / 10

/** Os pixels de uma prévia (Blob), do tamanho em que ela foi guardada. */
async function pixelsDe(blob) {
  const bitmap = await createImageBitmap(blob)
  try {
    const tela = new OffscreenCanvas(bitmap.width, bitmap.height)
    const c = tela.getContext('2d', { willReadFrequently: true })
    c.drawImage(bitmap, 0, 0)
    const { data } = c.getImageData(0, 0, bitmap.width, bitmap.height)
    return { largura: bitmap.width, altura: bitmap.height, rgba: data }
  } finally {
    bitmap.close()
  }
}

servir({
  async medir({ blob, previa, devolver = false }, { cancelado }) {
    let t = agora()
    const pixels = previa ?? (blob ? await pixelsDe(blob) : null)
    if (!pixels) throw new Error('medir: falta a prévia')
    const abrir = ms(agora() - t)
    if (cancelado()) return null
    t = agora()
    const medidas = compactarMedidas(medir(pixels))
    const saida = { medidas, quadro: { largura: pixels.largura, altura: pixels.altura }, tempos: { abrir, medir: ms(agora() - t) } }
    if (!devolver) return saida
    saida.pixels = pixels
    return comTransferencia(saida, [pixels.rgba.buffer])
  },
})
