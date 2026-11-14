// Worker do rosto (módulo), usado pelos dois lados, com o protocolo de app/trabalho/servir.js:
//
//   preparar  {}                                  → { ms }   carrega o runtime e os modelos; progresso { feito, total }
//   foto      { blob, orientacao, doNavegador }   → { largura, altura, rostos: [{ largura, nota, colado, perfil, v }] }
//             a prévia da foto do evento: girada pelo EXIF aqui (a prévia embutida do RAW não vem girada; sem girar,
//             a pesquisa achou 8 rostos onde havia 38), reduzida a 1616 px no lado maior, YuNet global + ladrilhos,
//             nota ≥ 0,75, largura ≥ 20 px, alinhar → SFace p8 → int8. `v` é Int8Array(128).
//   quadro    { bitmap, querer }                  → { avaliacao, rostos, pontos?, tela?, vetor?, tipo? }
//             um quadro da câmera do visitante: detecta (320 px), avalia a qualidade (luz, nitidez, distância), devolve
//             os 5 pontos (com um rosto só) e os sinais de tela, e só assina quando a pose serve para um dos vetores
//             que faltam (`querer`: 'frente' | 'esquerda' | 'direita', src/rosto/vida.js). `vetor` é Float32Array.
//             (Compatível: { etapa, guinadaDoGiro } segue a captura antiga de src/rosto/quadros.js.)
//
// Nenhuma imagem sai daqui: só números. No celular do visitante, nem os números saem da página sem a pessoa pedir.

import { comTransferencia, servir } from '../trabalho/servir.js'
import { girarEReduzir, LADO_DA_FOTO, preparar, quadro, rostosDaFoto } from './motor.js'
import { avaliarQuadro } from '../../src/rosto/qualidade.js'
import { serveParaEtapa } from '../../src/rosto/quadros.js'
import { serveParaVetor } from '../../src/rosto/vida.js'

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

  async quadro({ bitmap, etapa = 0, guinadaDoGiro = null, querer = null }) {
    let avaliacao = null
    let tipo = null
    const r = await quadro(bitmap, {
      assinarSe: (rostos, recorte, ladoDoQuadro) => {
        avaliacao = avaliarQuadro({ rostos, ladoDoQuadro, recorte })
        if (!avaliacao.ok) return false
        if (!querer) return serveParaEtapa(etapa, avaliacao.pose, guinadaDoGiro)
        tipo = rostos.length === 1 ? (querer.find((t) => serveParaVetor(t, rostos[0].pontos)) ?? null) : null
        return tipo != null
      },
    })
    bitmap.close?.()
    avaliacao ??= avaliarQuadro({ rostos: r.rostos, ladoDoQuadro: r.ladoDoQuadro })
    const vetor = r.vetor ? Float32Array.from(r.vetor) : null
    const saida = {
      avaliacao: { ok: avaliacao.ok, dica: avaliacao.dica, pose: avaliacao.pose ?? null, medidas: avaliacao.medidas ?? null },
      rostos: r.rostos.length,
      pontos: r.rostos.length === 1 ? r.rostos[0].pontos.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]) : null,
      tela: r.tela,
      vetor,
      tipo: vetor ? tipo : null,
    }
    return vetor ? comTransferencia(saida, [vetor.buffer]) : saida
  },
})
