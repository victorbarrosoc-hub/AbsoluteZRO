// Web Worker da conferência (lib/conferir.js): calcula o MD5 do arquivo do aparelho em pedaços, fora da tela.
// Recebe { id, blob } e devolve { id, progresso } de vez em quando e, no fim, { id, md5 } ou { id, erro }.
// { cancelar: id } interrompe no próximo pedaço. O arquivo nunca sai do aparelho: só a soma volta para a página.
import { md5DoBlob } from './md5.js'

const cancelados = new Set()

self.onmessage = async (e) => {
  const m = e.data || {}
  if (m.cancelar != null) {
    cancelados.add(m.cancelar)
    return
  }
  const { id, blob } = m
  let ultimo = 0
  const signal = {
    get aborted() {
      return cancelados.has(id)
    },
  }
  try {
    const md5 = await md5DoBlob(blob, {
      signal,
      onProgress: (feito, total) => {
        const agora = Date.now()
        if (agora - ultimo < 200 && feito < total) return
        ultimo = agora
        self.postMessage({ id, progresso: total ? feito / total : 1 })
      },
    })
    self.postMessage({ id, md5 })
  } catch (err) {
    self.postMessage({ id, erro: String(err?.message || err), cancelado: Boolean(err?.aborted) })
  } finally {
    cancelados.delete(id)
  }
}
