// Worker das assinaturas de rosto da decupagem ("agrupar por pessoa", desligado por padrão; só roda depois do aviso e
// do consentimento). Não tem motor próprio: usa o da busca em evento (app/rosto/motor.js: ONNX Runtime Web só WASM,
// YuNet e SFace p8, do próprio domínio). Para cada rosto que a análise achou na prévia, recorta a região em volta,
// deixa a linha dos olhos de pé, acha o rosto de novo com o YuNet (os 5 pontos que o alinhamento do SFace pede) e
// assina. Nada de imagem sai daqui: só os 128 números de cada rosto, em int8.
//
// Tarefas (protocolo de app/trabalho/servir.js):
//   preparar {}                                        → { ms }   carrega o runtime e os modelos; progresso { feito, total }
//   assinar  { blob, rostos: [{ i, caixa, pontos? }], giro? }
//            → { rostos: [{ i, v: Int8Array(128) | null, nota?, motivo?: 'sem-rosto' | 'outro-rosto' }] }
//     caixa e pontos em px da prévia (a de 1024 px, a mesma que a análise leu); `giro` é o da análise (rosto deitado).

import { comTransferencia, servir } from '../trabalho/servir.js'
import { preparar, quadro } from '../rosto/motor.js'
import { quantizar } from '../../src/rosto/assinatura.js'

export const RECORTE = Object.freeze({
  folga: 1.6, // o recorte tem 1,6× o lado da caixa: o YuNet precisa de um pouco de contexto
  miolo: 1.15, // na segunda tentativa, tudo fora de 1,15× a caixa fica preto (o vizinho some)
  desvio: 0.2, // o rosto achado tem de estar a menos de 20% do lado do recorte do centro
  lado: 320, // a detecção roda reduzida a isto (o recorte para o SFace sai do tamanho cheio)
})

/** A inclinação da linha dos olhos (radianos), com a ordem dos olhos que vier; sem pontos, o giro da análise. */
function anguloDe(pontos, giro = 0) {
  const [a, b] = Array.isArray(pontos) ? pontos : []
  if (a && b && Math.hypot(b.x - a.x, b.y - a.y) > 1) {
    let t = Math.atan2(b.y - a.y, b.x - a.x)
    if (t > Math.PI / 2) t -= Math.PI
    else if (t < -Math.PI / 2) t += Math.PI
    return t
  }
  return (-(giro || 0) * Math.PI) / 180
}

/** O recorte quadrado em volta do rosto, girado para a linha dos olhos ficar de pé. */
function recortar(bmp, caixa, angulo, { tapar = false } = {}) {
  const lado = Math.max(caixa.largura, caixa.altura)
  const L = Math.max(32, Math.round(lado * RECORTE.folga))
  const t = new OffscreenCanvas(L, L)
  const c = t.getContext('2d', { willReadFrequently: true })
  c.fillStyle = '#000'
  c.fillRect(0, 0, L, L)
  c.imageSmoothingEnabled = true
  c.imageSmoothingQuality = 'high'
  c.translate(L / 2, L / 2)
  c.rotate(-angulo)
  c.drawImage(bmp, -(caixa.x + caixa.largura / 2), -(caixa.y + caixa.altura / 2))
  c.setTransform(1, 0, 0, 1, 0, 0)
  if (tapar) {
    const m = Math.round((L - lado * RECORTE.miolo) / 2)
    if (m > 0) {
      c.fillRect(0, 0, L, m)
      c.fillRect(0, L - m, L, m)
      c.fillRect(0, 0, m, L)
      c.fillRect(L - m, 0, m, L)
    }
  }
  return t
}

/** Assina o rosto do meio do recorte, se o YuNet o achar ali. */
async function assinarRecorte(fonte) {
  let motivo = 'sem-rosto'
  const r = await quadro(fonte, {
    lado: RECORTE.lado,
    assinarSe: (rostos, _recorte, ladoDoQuadro) => {
      const p = rostos[0]?.pontos
      if (!p?.length) return false
      const cx = p.reduce((s, q) => s + q[0], 0) / p.length
      const cy = p.reduce((s, q) => s + q[1], 0) / p.length
      const longe = Math.hypot(cx - ladoDoQuadro / 2, cy - ladoDoQuadro / 2) / ladoDoQuadro
      if (longe > RECORTE.desvio) {
        motivo = 'outro-rosto'
        return false
      }
      return true
    },
  })
  return r.vetor ? { v: quantizar(r.vetor), nota: Math.round(r.rostos[0].nota * 100) / 100 } : { v: null, motivo }
}

servir({
  preparar: (_, { progresso }) => preparar({ aoProgredir: progresso }),

  async assinar({ blob, rostos = [], giro = 0 }, { cancelado }) {
    const bmp = await createImageBitmap(blob)
    const saida = []
    try {
      for (const x of rostos) {
        if (cancelado()) return null
        const angulo = anguloDe(x.pontos, giro)
        let r = await assinarRecorte(recortar(bmp, x.caixa, angulo))
        if (!r.v) r = await assinarRecorte(recortar(bmp, x.caixa, angulo, { tapar: true }))
        saida.push({ i: x.i, ...r })
      }
    } finally {
      bmp.close()
    }
    return comTransferencia(
      { rostos: saida },
      saida.filter((x) => x.v).map((x) => x.v.buffer),
    )
  },
})
