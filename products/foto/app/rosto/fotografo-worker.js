// Worker do fotógrafo (pool de app/trabalho/pool.js, um por núcleo até 4): numa leitura só de cada foto do evento,
// os rostos (app/rosto/motor.js) e as prévias que sobem (com a marca-d'água gravada nos pixels e sem metadados).
//
//   preparar  {}                                              → { ms }
//   evento    { blob, orientacao, doNavegador, mascara?, opacidade? }
//             → { largura, altura, rostos: [{ largura, nota, colado, perfil, v: Int8Array }],
//                 previa: { bytes, largura, altura, sha256, tipo }, mini: { … } }
//
// `blob` é a maior JPEG que o aparelho tem da foto (a embutida do RAW, ou o próprio JPEG): o original não é revelado nem
// sai daqui. Rostos na prévia de 1616 px girada pelo EXIF; a prévia que sobe tem 2048 px (até 4 MB) e a miniatura 480
// (até 512 KB), em JPEG sRGB sem EXIF, XMP nem GPS (docs/API.md). A marca-d'água vem como máscara alfa desenhada pela
// tela (o texto, na fonte da casa) e é gravada por src/exportar/marca-dagua.js, repetida na diagonal.

import { comTransferencia, servir } from '../trabalho/servir.js'
import { girarEReduzir, LADO_DA_FOTO, preparar, rostosDaFoto } from './motor.js'
import { aplicarMarcaDagua } from '../../src/exportar/marca-dagua.js'
import { limparJpeg } from '../../src/exportar/jpeg.js'

export const PREVIA = { lado: 2048, qualidade: 0.82, maximo: 4 * 1024 * 1024 }
export const MINI = { lado: 480, qualidade: 0.72, maximo: 512 * 1024 }

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function jpeg(tela, qualidade, maximo) {
  // a qualidade desce até caber no teto do servidor
  for (let q = qualidade; q >= 0.4; q -= 0.08) {
    const blob = await tela.convertToBlob({ type: 'image/jpeg', quality: q })
    const bytes = limparJpeg(new Uint8Array(await blob.arrayBuffer()), { manterIcc: false, manterOrientacao: false })
    if (bytes.length <= maximo)
      return { bytes, largura: tela.width, altura: tela.height, sha256: hex(await crypto.subtle.digest('SHA-256', bytes)), tipo: 'image/jpeg' }
  }
  throw new Error('A prévia ficou grande demais.')
}

function comMarca(tela, mascara, opacidade) {
  if (!mascara) return tela
  const c = tela.getContext('2d', { willReadFrequently: true })
  const { width: L, height: A } = tela
  const px = c.getImageData(0, 0, L, A)
  const d = px.data
  const f = new Float32Array(L * A * 3)
  for (let p = 0, i = 0, j = 0; p < L * A; p++, i += 3, j += 4) {
    f[i] = d[j] / 255
    f[i + 1] = d[j + 1] / 255
    f[i + 2] = d[j + 2] / 255
  }
  const r = aplicarMarcaDagua({ largura: L, altura: A, dados: f }, mascara, { posicao: 'diagonal', tamanho: 0.3, opacidade, espaco: 0.6 })
  for (let p = 0, i = 0, j = 0; p < L * A; p++, i += 3, j += 4) {
    d[j] = r.dados[i] * 255 + 0.5
    d[j + 1] = r.dados[i + 1] * 255 + 0.5
    d[j + 2] = r.dados[i + 2] * 255 + 0.5
  }
  c.putImageData(px, 0, 0)
  return tela
}

servir({
  async preparar(_, { progresso }) {
    return preparar({ aoProgredir: progresso })
  },

  async evento({ blob, orientacao = 1, doNavegador = false, mascara = null, opacidade = 0.35 }, { cancelado }) {
    const bmp = await createImageBitmap(blob, { imageOrientation: doNavegador ? 'from-image' : 'none' })
    const o = doNavegador ? 1 : orientacao
    try {
      if (cancelado()) return null
      const fonte = girarEReduzir(bmp, o, LADO_DA_FOTO)
      const rostos = await rostosDaFoto(fonte, { lado: LADO_DA_FOTO })
      if (cancelado()) return null
      const grande = comMarca(girarEReduzir(bmp, o, PREVIA.lado), mascara, opacidade)
      const previa = await jpeg(grande, PREVIA.qualidade, PREVIA.maximo)
      const pequena = girarEReduzir(grande, 1, MINI.lado)
      const mini = await jpeg(pequena, MINI.qualidade, MINI.maximo)
      return comTransferencia({ largura: fonte.width, altura: fonte.height, rostos, previa, mini }, [
        previa.bytes.buffer,
        mini.bytes.buffer,
        ...rostos.map((r) => r.v.buffer),
      ])
    } finally {
      bmp.close()
    }
  },
})
