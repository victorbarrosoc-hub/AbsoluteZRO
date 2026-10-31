// Worker da análise de estabilização: decodifica a mídia inteira numa resolução pequena (lado maior 640) e mede o
// movimento da câmera em cada quadro (src/estabilizar). Fica fora da tela; a barra anda pelos quadros analisados.
// Devolve 4 números por quadro (em base64, para guardar na mídia do projeto), o qps e o tempo do primeiro quadro.

import { MB, abrirInput } from './midia.js'
import { Analisador, LADO_ANALISE, VERSAO } from '../src/estabilizar/index.js'
import { cinza } from '../src/estabilizar/rastreio.js'
import { paraBase64 } from '../src/estabilizar/aplicar.js'

let cancelado = false

self.onmessage = async ({ data }) => {
  if (data.tipo === 'cancelar') {
    cancelado = true
    return
  }
  if (data.tipo !== 'analisar') return
  cancelado = false
  const input = abrirInput(data.entrada)
  try {
    const v = await input.getPrimaryVideoTrack()
    if (!v || !(await v.canDecode())) throw new Error('Este vídeo não decodifica aqui.')
    const [lw, lh, estat, dur] = await Promise.all([v.getDisplayWidth(), v.getDisplayHeight(), v.computePacketStats(240), input.computeDuration()])
    const fps = estat.averagePacketRate || 30
    const e = Math.min(1, LADO_ANALISE / Math.max(lw, lh))
    const w = Math.max(16, Math.round(lw * e))
    const h = Math.max(16, Math.round(lh * e))
    const total = Math.max(1, Math.round(dur * fps))
    const sink = new MB.CanvasSink(v, { width: w, height: h, fit: 'fill', poolSize: 2 })
    const an = new Analisador()
    const movs = []
    let t0 = null
    let semMedida = 0
    for await (const { canvas, timestamp } of sink.canvases()) {
      if (cancelado) throw new DOMException('cancelado', 'AbortError')
      if (t0 === null) t0 = timestamp
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const m = an.adicionar(cinza(ctx.getImageData(0, 0, w, h).data, w, h))
      if (!m) semMedida++
      movs.push(m || { dx: 0, dy: 0, da: 0, ds: 0 })
      if (movs.length % 8 === 0) self.postMessage({ tipo: 'andamento', feitos: movs.length, total })
    }
    const mov = new Float32Array(4 * movs.length)
    movs.forEach((m, i) => mov.set([m.dx, m.dy, m.da, m.ds], 4 * i))
    self.postMessage({ tipo: 'pronto', estabilidade: { versao: VERSAO, fps, t0: t0 || 0, n: movs.length, mov: paraBase64(mov), semMedida } })
  } catch (err) {
    self.postMessage({ tipo: 'erro', mensagem: err?.name === 'AbortError' ? 'cancelado' : err?.message || String(err) })
  } finally {
    input.dispose?.()
  }
}
