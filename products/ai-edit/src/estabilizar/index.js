// Estabilização por imagem (sem DOM): quadro a quadro, os cantos do quadro anterior são rastreados no atual
// (src/estabilizar/rastreio.js) e o movimento da câmera sai de uma similaridade (src/estabilizar/movimento.js). A análise
// guarda só esse movimento (4 números por quadro, na mídia); a correção sai dele na hora, pelos ajustes do clipe
// (src/estabilizar/trajetoria.js), igual na prévia e no render.
//
// Por imagem (sem giroscópio): funciona com qualquer arquivo. Giroscópio (GoPro, Sony, DJI, Insta360) é o próximo passo
// (docs/roadmap.md): lê o sensor do arquivo e corrige o giro com a lente; aqui ainda não.

import { cantos, gradientesDa, pares, piramide } from './rastreio.js'
import { similaridade } from './movimento.js'
import { corrigir } from './trajetoria.js'

/** Versão da análise: muda quando a conta muda (análise velha é refeita). */
export const VERSAO = 1
/** Lado maior do quadro analisado (o movimento é o mesmo em qualquer resolução: vai em frações da largura). */
export const LADO_ANALISE = 640

/** Analisa quadro a quadro: adicionar(cinza) devolve o movimento desse quadro em relação ao anterior. */
export class Analisador {
  constructor() {
    this.ant = null
  }

  /** img: { w, h, d } em cinza. Devolve { dx, dy (frações da largura), da, ds, pontos } ou null (sem medida). */
  adicionar(img) {
    const p = piramide(img, 3)
    const g = gradientesDa(p)
    const ant = this.ant
    this.ant = { p, g }
    if (!ant) return { dx: 0, dy: 0, da: 0, ds: 0, pontos: 0 }
    const pts = cantos(ant.p[0])
    const { de, para } = pares(ant.p, p, pts, { grads: ant.g, gradsB: g })
    const m = similaridade(de, para, [img.w / 2, img.h / 2])
    if (!m) return null
    return { dx: m.dx / img.w, dy: m.dy / img.w, da: m.da, ds: m.ds, pontos: m.inliers }
  }
}

/**
 * Ajustes de estabilização de um clipe: { suavidade (s), recorte (zoom máximo) }. Padrão: 1 s e até 20% de recorte.
 * null/undefined = sem estabilização.
 */
export const PADRAO = Object.freeze({ suavidade: 1, recorte: 1.2 })

/**
 * As correções de um trecho [ini, fim) dos movimentos da mídia (índices de quadro da mídia), com os ajustes do clipe.
 * Devolve { zoom, forca, correcoes } (correcoes[i] vale para o quadro ini + i).
 */
export function correcoesDoTrecho(analise, ini, fim, ajustes, aspecto) {
  const a = Math.max(0, Math.min(analise.n - 1, Math.floor(ini)))
  const b = Math.max(a + 1, Math.min(analise.n, Math.ceil(fim)))
  const movs = []
  for (let i = a; i < b; i++) movs.push(i === a ? null : { dx: analise.mov[4 * i], dy: analise.mov[4 * i + 1], da: analise.mov[4 * i + 2], ds: analise.mov[4 * i + 3] })
  const r = corrigir(movs, { fps: analise.fps, suavidade: ajustes?.suavidade ?? PADRAO.suavidade, recorteMax: ajustes?.recorte ?? PADRAO.recorte, aspecto })
  return { ...r, ini: a }
}
