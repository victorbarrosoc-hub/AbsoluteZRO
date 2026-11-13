// Worker do rosto (módulo), usado pelos dois lados, com o protocolo de app/trabalho/servir.js:
//
//   preparar  {}                                  → { ms }   carrega o runtime e os modelos; progresso { feito, total }
//   foto      { blob, orientacao, doNavegador }   → { largura, altura, rostos: [{ largura, nota, colado, perfil, v }] }
//             a prévia da foto do evento: girada pelo EXIF aqui (a prévia embutida do RAW não vem girada; sem girar,
//             a pesquisa achou 8 rostos onde havia 38), reduzida a 1616 px no lado maior, YuNet global + ladrilhos,
//             nota ≥ 0,75, largura ≥ 20 px, alinhar → SFace p8 → int8. `v` é Int8Array(128).
//   quadro    { bitmap, etapa, guinadaDoGiro }    → { avaliacao, rostos, vetor? }
//             um quadro da câmera do visitante: detecta (320 px), avalia a qualidade (luz, nitidez, distância) e só
//             assina quando o quadro serve para a etapa da captura (src/rosto/quadros.js). `vetor` é Float32Array.
//
// Nenhuma imagem sai daqui: só números. No celular do visitante, nem os números saem da página sem a pessoa pedir.

import { comTransferencia, servir } from '../trabalho/servir.js'
import { girarEReduzir, LADO_DA_FOTO, preparar, quadro, rostosDaFoto } from './motor.js'
import { avaliarQuadro } from '../../src/rosto/qualidade.js'
import { serveParaEtapa } from '../../src/rosto/quadros.js'

servir({
  async preparar(_, { progresso }) {
    return preparar({ aoProgredir: progresso })
  },

  async foto({ blob, orientacao = 1, doNavegador = false }, { cancelado }) {
    // a prévia embutida do RAW não vem girada: a orientação do RAW é aplicada à mão; o JPEG o navegador gira sozinho
    const bmp = await createImageBitmap(blob, { imageOrientation: doNavegador ? 'from-image' : 'none' })
    if (cancelado()) {
      bmp.close()
      return null
    }
    const fonte = girarEReduzir(bmp, doNavegador ? 1 : orientacao)
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
