// Conferência honesta ao fim do envio: o MD5 que o Drive diz ter recebido contra o MD5 do arquivo do aparelho.
// O cálculo roda num Web Worker (lib/md5-worker.js), lendo o arquivo em pedaços de 8 MiB: a tela não trava e a memória
// não sobe com o tamanho do arquivo. Sem Worker, roda aqui mesmo, um pedaço por vez, devolvendo a vez à página.
//
// Regra do projeto: "Conferido" só com MD5 igual. Estados guardados em `verify.state`:
//   'ok'        MD5 do aparelho igual ao do Drive            → "Conferido"
//   'mismatch'  MD5 diferente                                → "Não conferiu" (erro)
//   'pending' / 'running'  esperando a vez / calculando
//   'big'       acima do limite automático; "Conferir agora" → "Tamanho confere · sem conferência"
//   'unchecked' sem MD5 do Drive, sem o arquivo (página recarregada), modo Wi-Fi, erro de leitura
import { md5DoBlob } from './md5.js'

/** No celular, conferir sozinho até 2 GB (~20 s num iPhone recente). Acima disso, só quando a pessoa pede. */
export const CONFERIR_AUTO_MAX = 2 * 1024 ** 3

let worker = null
let semWorker = false
let seq = 0
const pedidos = new Map() // id → { resolve, reject, onProgress }

function abrirWorker() {
  if (worker || semWorker) return worker
  try {
    if (typeof Worker !== 'function') throw new Error('sem Worker')
    worker = new Worker(new URL('./md5-worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const m = e.data || {}
      const p = pedidos.get(m.id)
      if (!p) return
      if (m.progresso != null) return p.onProgress?.(m.progresso)
      pedidos.delete(m.id)
      if (m.md5) p.resolve(m.md5)
      else p.reject(Object.assign(new Error(m.erro || 'Não consegui ler o arquivo.'), { aborted: Boolean(m.cancelado) }))
    }
    worker.onerror = () => {
      // Worker que não sobe (navegador sem módulo em Worker): tudo o que esperava vai para o caminho da página.
      semWorker = true
      worker = null
      for (const [id, p] of pedidos) {
        pedidos.delete(id)
        md5NaPagina(p.blob, p).then(p.resolve, p.reject)
      }
    }
  } catch {
    semWorker = true
    worker = null
  }
  return worker
}

function md5NaPagina(blob, { onProgress, signal }) {
  return md5DoBlob(blob, {
    signal,
    onProgress: (feito, total) => onProgress?.(total ? feito / total : 1),
    pausa: () => new Promise((r) => setTimeout(r, 0)),
  })
}

/**
 * MD5 (hex) de um File/Blob do aparelho. onProgress(0..1). `signal` (AbortSignal) interrompe.
 * Rejeita com { aborted: true } quando interrompido.
 */
export function md5DoArquivo(blob, { onProgress, signal } = {}) {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error('Conferência interrompida.'), { aborted: true }))
  const w = abrirWorker()
  if (!w) return md5NaPagina(blob, { onProgress, signal })
  return new Promise((resolve, reject) => {
    const id = ++seq
    pedidos.set(id, { resolve, reject, onProgress, signal, blob })
    signal?.addEventListener('abort', () => worker?.postMessage({ cancelar: id }), { once: true })
    w.postMessage({ id, blob })
  })
}

/** O MD5 do Drive bate com o do aparelho? (o Drive manda hex minúsculo; aceitamos maiúsculo também). */
export function mesmoMd5(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length === 32 && a.toLowerCase() === b.toLowerCase()
}

/**
 * Selo de conferência de um envio terminado: { tom, texto, dica }. Nunca diz "Conferido" sem MD5 igual.
 * `t` é o item do motor ou a entrada do histórico ({ result, verify, sizeOk }).
 */
export function seloConferencia(t) {
  if (t.result === 'canceled' || t.status === 'canceled') return { tom: 'muted', texto: 'Cancelado', dica: 'Você cancelou este envio.' }
  const v = t.verify || {}
  if (v.state === 'ok') return { tom: 'ok', texto: 'Conferido', dica: 'O MD5 do arquivo no Drive é igual ao do seu aparelho.' }
  if (v.state === 'mismatch') return { tom: 'erro', texto: 'Não conferiu', dica: 'O MD5 no Drive é diferente do arquivo do seu aparelho. Envie de novo.' }
  if (v.state === 'running') return { tom: 'vivo', texto: `Conferindo ${Math.round((v.progress || 0) * 100)}%`, dica: 'Calculando o MD5 do arquivo do aparelho.' }
  if (v.state === 'pending') return { tom: 'vivo', texto: 'Conferência na fila', dica: 'Confere assim que o anterior terminar.' }
  if (t.sizeOk) return { tom: 'neutro', texto: 'Tamanho confere · sem conferência', dica: 'O Drive recebeu o tamanho exato, mas o MD5 não foi comparado.' }
  return { tom: 'neutro', texto: 'Sem conferência', dica: 'O MD5 não foi comparado.' }
}
