// Worker do fluxo óptico (câmera lenta além dos quadros da câmera): o RIFE 4.25 (Practical-RIFE, MIT, hzwer) em ONNX
// "em campos" roda aqui, no processador (ONNX Runtime Web, WASM com várias linhas), fora da tela. Recebe os dois quadros
// reais (RGBA, resolução cheia) e a fração; devolve o quadro novo montado em resolução cheia (src/fluxo.js).
//
// Por que no processador e não na placa de vídeo: a versão do ONNX Runtime que o app leva tem um erro conhecido na
// convolução de 15 canais na WebGPU (onnxruntime #32928, corrigido depois), e o RIFE tem essa convolução: na placa ele
// sairia errado sem avisar. Na CPU dá o mesmo resultado medido no teste (docs/validation.md).
//
// O modelo baixa uma vez: no app de desktop pelo protocolo do app, que guarda no disco (funciona sem internet depois);
// no navegador direto do Hugging Face, com o cache do navegador. O arquivo é conferido pelo SHA-256 antes de usar.

import * as ort from '../vendor/ort/ort.min.mjs'
import { MODELO_FLUXO } from '../src/modelos.js'
import { montarQuadro, paraTensor, tamanhoDoModelo } from '../src/fluxo.js'

ort.env.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href
ort.env.wasm.numThreads = Math.max(1, Math.min(8, (self.navigator.hardwareConcurrency || 4) - 1))

let sessao = null

async function sha256(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Os bytes do modelo: do cache (navegador) ou do protocolo do app (desktop), senão da rede; sempre conferidos. */
async function baixar(remoto) {
  const url = remoto ? remoto + MODELO_FLUXO.caminho : `https://huggingface.co/${MODELO_FLUXO.caminho}`
  let cache = null
  try {
    if (!remoto && self.caches) cache = await caches.open('aeon-modelos-v1')
  } catch {}
  const guardado = cache ? await cache.match(url) : null
  if (guardado) {
    const buf = await guardado.arrayBuffer()
    if ((await sha256(buf)) === MODELO_FLUXO.sha256) return buf
    await cache.delete(url)
  }
  const r = await fetch(url)
  if (!r.ok || !r.body) throw new Error(r.status === 503 ? 'Sem internet para baixar o motor de fluxo óptico.' : `O motor de fluxo óptico não baixou (${r.status}).`)
  const total = Number(r.headers.get('content-length')) || MODELO_FLUXO.bytes
  const leitor = r.body.getReader()
  const partes = []
  let feito = 0
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    partes.push(value)
    feito += value.length
    self.postMessage({ tipo: 'baixando', feito, total })
  }
  const buf = new Uint8Array(feito)
  let o = 0
  for (const p of partes) {
    buf.set(p, o)
    o += p.length
  }
  if ((await sha256(buf)) !== MODELO_FLUXO.sha256) throw new Error('O arquivo do motor de fluxo óptico chegou diferente do esperado.')
  try {
    await cache?.put(url, new Response(buf))
  } catch {}
  return buf.buffer
}

self.onmessage = async ({ data }) => {
  try {
    if (data.tipo === 'carregar') {
      if (!sessao) {
        const bytes = await baixar(data.remoto || null)
        sessao = await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
      }
      self.postMessage({ tipo: 'pronto', linhas: ort.env.wasm.numThreads })
    } else if (data.tipo === 'interpolar') {
      const { id, w, h, f } = data
      const a = new Uint8ClampedArray(data.a)
      const b = new Uint8ClampedArray(data.b)
      const tam = tamanhoDoModelo(w, h)
      const t0 = performance.now()
      const r = await sessao.run({
        img0: new ort.Tensor('float32', paraTensor(a, w, h, tam), [1, 3, tam.ph, tam.pw]),
        img1: new ort.Tensor('float32', paraTensor(b, w, h, tam), [1, 3, tam.ph, tam.pw]),
        timestep: new ort.Tensor('float32', new Float32Array([f]), [1, 1, 1, 1]),
      })
      const q = montarQuadro(a, b, w, h, r.flow.data, r.mask.data, tam, f)
      self.postMessage({ tipo: 'quadro', id, rgba: q.rgba.buffer, confianca: q.confianca, mistura: q.mistura, ms: performance.now() - t0 }, [q.rgba.buffer])
    }
  } catch (err) {
    self.postMessage({ tipo: 'erro', id: data.id, mensagem: err?.message || String(err) })
  }
}
