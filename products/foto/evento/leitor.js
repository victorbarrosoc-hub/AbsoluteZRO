// O leitor de rosto do visitante: um worker de módulo (app/rosto/worker.js, servido em /e/<token>/app/rosto/ só para
// link vivo) com o ONNX Runtime e os dois modelos, e a câmera AO VIVO (getUserMedia). Não há como mandar uma foto da
// galeria: a busca só aceita o que a câmera vê agora (docs/estudo/rosto-em-evento.md, B.5).
//
// A selfie fica aqui: cada quadro vai para o worker como ImageBitmap (transferido, sem cópia), volta só a avaliação e,
// quando o quadro serve para a etapa, o vetor. Três quadros (de frente, girado, o outro lado) viram 2 ou 3 vetores int8
// em base64: é só isso que a página manda.

import { criarCaptura, juntar } from './src/rosto/quadros.js'
import { quantizar, vetorParaTexto } from './src/rosto/assinatura.js'

let worker = null
let seq = 0
const pendentes = new Map()

function trabalhador() {
  if (worker) return worker
  worker = new Worker(new URL('./app/rosto/worker.js', import.meta.url), { type: 'module', name: 'rosto' })
  worker.onmessage = (e) => {
    const m = e.data
    const p = pendentes.get(m?.id)
    if (!p) return
    if (m.progresso !== undefined) return p.aoProgredir?.(m.progresso)
    pendentes.delete(m.id)
    if (m.ok) p.ok(m.resultado)
    else p.falha(Object.assign(new Error(m.erro?.mensagem || 'falhou'), { name: m.erro?.nome || 'Error' }))
  }
  worker.onerror = (e) => {
    e.preventDefault?.()
    for (const p of pendentes.values()) p.falha(new Error('indisponivel'))
    pendentes.clear()
    worker = null
  }
  return worker
}

function pedirAoWorker(tipo, dados, { transferir = [], aoProgredir } = {}) {
  const id = ++seq
  return new Promise((ok, falha) => {
    pendentes.set(id, { ok, falha, aoProgredir })
    trabalhador().postMessage({ id, tipo, dados }, transferir)
  })
}

/** Baixa o runtime e os modelos (uma vez: depois vem do cache). `aoProgredir(0..1)`. */
export async function preparar(aoProgredir = () => {}) {
  try {
    return await pedirAoWorker('preparar', {}, { aoProgredir: (p) => aoProgredir(p.total ? p.feito / p.total : 0) })
  } catch (e) {
    throw Object.assign(new Error('indisponivel'), { codigo: 'indisponivel', causa: e })
  }
}

/** Liga a câmera da frente no <video>. Devolve a função que desliga. Erros: 'camera-negada', 'sem-camera', 'camera'. */
export async function ligarCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('sem-camera'), { codigo: 'sem-camera' })
  let fluxo
  try {
    fluxo = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
  } catch (e) {
    const codigo = e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'camera-negada' : e?.name === 'NotFoundError' ? 'sem-camera' : 'camera'
    throw Object.assign(new Error(codigo), { codigo })
  }
  video.srcObject = fluxo
  video.muted = true
  video.playsInline = true
  await video.play().catch(() => {})
  return () => {
    for (const t of fluxo.getTracks()) t.stop()
    video.srcObject = null
  }
}

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms))

/**
 * Lê quadros até juntar os três. `aoMudar({ etapa, dica, boa })` a cada quadro. Devolve os vetores em base64 (2 ou 3).
 * `sinal` (AbortSignal) para parar.
 */
export async function capturar(video, { aoMudar = () => {}, sinal } = {}) {
  const captura = criarCaptura()
  while (!sinal?.aborted) {
    if (video.readyState < 2 || !video.videoWidth) {
      await esperar(80)
      continue
    }
    const bitmap = await createImageBitmap(video)
    const r = await pedirAoWorker('quadro', { bitmap, etapa: captura.etapa(), guinadaDoGiro: captura.guinadaDoGiro() }, { transferir: [bitmap] })
    if (sinal?.aborted) break
    const a = r.avaliacao
    const p = captura.passo({ ok: a.ok, dica: a.dica, pose: a.pose, vetor: r.vetor, agora: performance.now() })
    aoMudar({ etapa: p.etapa, dica: p.dica, boa: a.ok, pegou: p.pegou })
    if (p.pronto) {
      const j = juntar(p.vetores)
      if (j.ok) return j.vetores.map((v) => vetorParaTexto(quantizar(v)))
      captura.recomecar()
      aoMudar({ etapa: 0, dica: 'denovo', boa: false })
      await esperar(900)
    }
    // um respiro para a tela (e para a bateria): no máximo ~12 quadros por segundo
    await esperar(p.pegou ? 350 : 60)
  }
  throw Object.assign(new Error('cancelado'), { name: 'AbortError' })
}

export function encerrar() {
  worker?.terminate()
  worker = null
  for (const p of pendentes.values()) p.falha(new Error('cancelado'))
  pendentes.clear()
}
