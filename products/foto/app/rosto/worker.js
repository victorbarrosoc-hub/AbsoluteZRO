// Worker do rosto (módulo), usado pelos dois lados, com o protocolo de app/trabalho/servir.js:
//
//   preparar  {}                                  → { ms }   carrega o runtime e os modelos; progresso { feito, total }
//   foto      { blob, orientacao }                → { largura, altura, rostos: [{ largura, nota, colado, perfil, v }] }
//             a prévia da foto do evento: girada pelo EXIF aqui (a prévia embutida do RAW não vem girada; sem girar,
//             a pesquisa achou 8 rostos onde havia 38), reduzida a 1616 px no lado maior, YuNet global + ladrilhos,
//             nota ≥ 0,75, largura ≥ 20 px, alinhar → SFace p8 → int8. `v` é Int8Array(128).
//   quadro    { bitmap, etapa, guinadaDoGiro }    → { avaliacao, rostos, vetor? }
//             um quadro da câmera do visitante: detecta (320 px), avalia a qualidade (luz, nitidez, distância) e só
//             assina quando o quadro serve para a etapa da captura (src/rosto/quadros.js). `vetor` é Float32Array.
//
// Nenhuma imagem sai daqui: só números. No celular do visitante, nem os números saem da página sem a pessoa pedir.

import { comTransferencia, servir } from '../trabalho/servir.js'
import { preparar, quadro, rostosDaFoto } from './motor.js'
import { avaliarQuadro } from '../../src/rosto/qualidade.js'
import { serveParaEtapa } from '../../src/rosto/quadros.js'

export const LADO_DA_FOTO = 1616

/** A imagem girada pela orientação do EXIF (1, 3, 6, 8; os espelhados 2, 4, 5, 7 também) e reduzida a `lado`. */
function girarEReduzir(bmp, orientacao = 1, lado = LADO_DA_FOTO) {
  const o = Number(orientacao) || 1
  const deitada = o >= 5 && o <= 8
  const k = Math.min(1, lado / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * k)
  const h = Math.round(bmp.height * k)
  const W = deitada ? h : w
  const H = deitada ? w : h
  const t = new OffscreenCanvas(W, H)
  const c = t.getContext('2d')
  c.imageSmoothingEnabled = true
  c.imageSmoothingQuality = 'high'
  // as 8 orientações do EXIF (TIFF 6.0): a matriz que leva a foto gravada à foto vista
  const m = {
    1: [1, 0, 0, 1, 0, 0],
    2: [-1, 0, 0, 1, W, 0],
    3: [-1, 0, 0, -1, W, H],
    4: [1, 0, 0, -1, 0, H],
    5: [0, 1, 1, 0, 0, 0],
    6: [0, 1, -1, 0, W, 0],
    7: [0, -1, -1, 0, W, H],
    8: [0, -1, 1, 0, 0, H],
  }[o] ?? [1, 0, 0, 1, 0, 0]
  c.setTransform(...m)
  c.drawImage(bmp, 0, 0, w, h)
  return t
}

servir({
  async preparar(_, { progresso }) {
    return preparar({ aoProgredir: progresso })
  },

  async foto({ blob, orientacao = 1 }, { cancelado }) {
    // a orientação do arquivo JPEG é aplicada à mão: o navegador não gira a prévia embutida do RAW
    const bmp = await createImageBitmap(blob, { imageOrientation: 'none' })
    if (cancelado()) {
      bmp.close()
      return null
    }
    const fonte = girarEReduzir(bmp, orientacao)
    bmp.close()
    const rostos = await rostosDaFoto(fonte, { lado: LADO_DA_FOTO })
    return comTransferencia(
      { largura: fonte.width, altura: fonte.height, rostos },
      rostos.map((r) => r.v.buffer),
    )
  },

  async quadro({ bitmap, etapa = 0, guinadaDoGiro = null }) {
    let avaliacao = null
    const r = await quadro(bitmap, {
      assinarSe: (rostos, recorte, ladoDoQuadro) => {
        avaliacao = avaliarQuadro({ rostos, ladoDoQuadro, recorte })
        return avaliacao.ok && serveParaEtapa(etapa, avaliacao.pose, guinadaDoGiro)
      },
    })
    bitmap.close?.()
    avaliacao ??= avaliarQuadro({ rostos: r.rostos, ladoDoQuadro: r.ladoDoQuadro })
    const vetor = r.vetor ? Float32Array.from(r.vetor) : null
    const saida = {
      avaliacao: { ok: avaliacao.ok, dica: avaliacao.dica, pose: avaliacao.pose ?? null, medidas: avaliacao.medidas ?? null },
      rostos: r.rostos.length,
      vetor,
    }
    return vetor ? comTransferencia(saida, [vetor.buffer]) : saida
  },
})
