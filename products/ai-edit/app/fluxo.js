// O motor de fluxo óptico do lado da tela: abre o worker (app/fluxo-worker.js), baixa o modelo uma vez e entrega ao
// render uma função interpolar(a, b, f) que devolve o quadro novo num canvas. Um worker só, reaproveitado.

import * as ponte from './ponte.js'

let aberto = null

/**
 * Carrega o motor (o primeiro uso baixa ~23 MB). aoBaixar(feito, total) mostra o andamento. Devolve { interpolar,
 * fechar } ou lança erro com uma frase para a pessoa (sem internet, arquivo diferente do esperado).
 */
export function carregarFluxo({ aoBaixar } = {}) {
  if (aberto) return aberto
  aberto = new Promise((ok, falha) => {
    const w = new Worker(new URL('./fluxo-worker.js', import.meta.url), { type: 'module' })
    const pendentes = new Map()
    let prox = 1
    w.onmessage = ({ data }) => {
      if (data.tipo === 'baixando') aoBaixar?.(data.feito, data.total)
      else if (data.tipo === 'pronto') ok(motor)
      else if (data.tipo === 'quadro') {
        pendentes.get(data.id)?.ok(data)
        pendentes.delete(data.id)
      } else if (data.tipo === 'erro') {
        if (data.id && pendentes.has(data.id)) {
          pendentes.get(data.id).falha(new Error(data.mensagem))
          pendentes.delete(data.id)
        } else {
          aberto = null
          w.terminate()
          falha(new Error(data.mensagem))
        }
      }
    }
    w.onerror = (e) => {
      aberto = null
      falha(new Error(e.message || 'O motor de fluxo óptico não abriu.'))
    }
    const tela = new OffscreenCanvas(1, 1)
    const ctx = tela.getContext('2d')
    const pixels = (c) => {
      const x = c.getContext('2d', { willReadFrequently: true })
      return x.getImageData(0, 0, c.width, c.height).data
    }
    const motor = {
      medidas: { quadros: 0, ms: 0, mistura: 0, confianca: 0 },
      /** O quadro entre a e b (canvases do mesmo tamanho) na fração f. */
      async interpolar(a, b, f) {
        const id = prox++
        const pa = pixels(a)
        const pb = pixels(b)
        const r = await new Promise((ok2, falha2) => {
          pendentes.set(id, { ok: ok2, falha: falha2 })
          w.postMessage({ tipo: 'interpolar', id, a: pa.buffer, b: pb.buffer, w: a.width, h: a.height, f }, [pa.buffer, pb.buffer])
        })
        motor.medidas.quadros++
        motor.medidas.ms += r.ms
        motor.medidas.confianca += r.confianca
        if (r.mistura) motor.medidas.mistura++
        tela.width = a.width
        tela.height = a.height
        ctx.putImageData(new ImageData(new Uint8ClampedArray(r.rgba), a.width, a.height), 0, 0)
        return tela
      },
      fechar() {
        w.terminate()
        aberto = null
      },
    }
    w.postMessage({ tipo: 'carregar', remoto: ponte.remotoModelos?.() || null })
  })
  return aberto
}
