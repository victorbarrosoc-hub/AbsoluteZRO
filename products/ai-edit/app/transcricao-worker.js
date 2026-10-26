// Worker da transcrição: o Whisper (Transformers.js + ONNX Runtime) roda aqui, fora da tela, na placa de vídeo
// (WebGPU) quando dá e no processador quando não. Recebe o áudio em 16 kHz mono e os pedaços já escolhidos (cortados
// no silêncio); devolve as palavras com o tempo de cada uma, pedaço a pedaço, para a barra andar de verdade.

import { env, pipeline } from '../vendor/transformers.min.js'
import { dtypes, IDIOMAS, MODELOS } from '../src/modelos.js'
import { juntarPalavras } from '../src/analise/trechos.js'

env.allowLocalModels = false
env.backends.onnx.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href
env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(8, (self.navigator.hardwareConcurrency || 4) - 1))

let atual = null

async function dispositivo(pedido) {
  if (pedido === 'wasm') return 'wasm'
  try {
    if (self.navigator.gpu && (await self.navigator.gpu.requestAdapter())) return 'webgpu'
  } catch {}
  return 'wasm'
}

async function carregar(modelo, disp, remoto) {
  const chave = `${modelo}|${disp}`
  if (atual?.chave === chave) return atual.asr
  // app de desktop: os arquivos do modelo vêm pelo protocolo do app, que guarda uma cópia no disco (funciona sem
  // internet depois da primeira vez); no navegador, direto do Hugging Face com o cache do navegador. O Transformers.js
  // só aceita http(s) como origem, então o pedido continua "para o Hugging Face" e o fetch troca o endereço.
  if (remoto) {
    const hf = 'https://huggingface.co/'
    env.fetch = (url, init) => fetch(String(url).startsWith(hf) ? remoto + String(url).slice(hf.length) : url, init)
    env.useBrowserCache = false
  }
  const vistos = new Map()
  const asr = await pipeline('automatic-speech-recognition', MODELOS[modelo].id, {
    device: disp,
    dtype: dtypes(disp),
    progress_callback: (p) => {
      if (p.status === 'progress' && p.total) {
        vistos.set(p.file, { feito: p.loaded, total: p.total })
        let f = 0
        let t = 0
        for (const v of vistos.values()) {
          f += v.feito
          t += v.total
        }
        self.postMessage({ tipo: 'baixando', feito: f, total: t })
      }
    },
  })
  atual = { chave, asr }
  return asr
}

self.onmessage = async ({ data }) => {
  if (data.tipo !== 'transcrever') return
  const t0 = performance.now()
  try {
    const disp = await dispositivo(data.dispositivo)
    self.postMessage({ tipo: 'dispositivo', dispositivo: disp })
    const asr = await carregar(data.modelo, disp, data.remoto)
    const carregou = (performance.now() - t0) / 1000
    const { pcm, taxa, trechos } = data
    const total = trechos.reduce((s, t) => s + t.fim - t.ini, 0)
    let feito = 0
    const pedacos = []
    for (const t of trechos) {
      const r = await asr(pcm.subarray(Math.floor(t.ini * taxa), Math.ceil(t.fim * taxa)), { language: IDIOMAS[data.idioma] || 'portuguese', task: 'transcribe', return_timestamps: 'word' })
      pedacos.push({ ...t, chunks: r.chunks })
      feito += t.fim - t.ini
      self.postMessage({ tipo: 'parcial', feito, total, palavras: juntarPalavras([{ ...t, chunks: r.chunks }]) })
    }
    self.postMessage({ tipo: 'pronto', palavras: juntarPalavras(pedacos), dispositivo: disp, segundos: (performance.now() - t0) / 1000, carregou })
  } catch (err) {
    self.postMessage({ tipo: 'erro', mensagem: String(err?.message || err) })
  }
}
