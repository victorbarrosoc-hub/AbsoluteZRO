// O leitor de rosto do visitante: um worker de módulo (app/rosto/worker.js, servido em /e/<token>/app/rosto/ só para
// link vivo) com o ONNX Runtime e os dois modelos, e a câmera AO VIVO (getUserMedia). Não há como mandar uma foto da
// galeria: a busca só aceita o que a câmera vê agora (docs/estudo/rosto-em-evento.md, B.5).
//
// A selfie fica aqui: cada quadro vai para o worker como ImageBitmap (transferido, sem cópia), volta só a avaliação, os
// 5 pontos do rosto e, quando a pose serve, o vetor. A captura segue o desafio que o servidor sorteou (src/rosto/vida.js):
// de frente, depois a ordem pedida de "vire para a sua esquerda", "para a sua direita" e "chegue mais perto". Saem os
// vetores (de frente e dos dois giros, int8 em base64) e os pontos quadro a quadro, para o servidor conferir a prova.

import { juntar } from './src/rosto/quadros.js'
import { quantizar, vetorParaTexto } from './src/rosto/assinatura.js'
import { andamento, conferirVida, VIDA } from './src/rosto/vida.js'

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

/** Falha da prova de vida no próprio celular (antes de gastar a prova no servidor). */
const falhaDeVida = (motivo) => Object.assign(new Error('vida'), { codigo: 'vida', motivo })

/**
 * Segue o desafio `{ passos, recebidoEm }` até o fim. `aoMudar({ etapa, total, passo, boa })` a cada quadro (passo:
 * 'frente' ou o passo do desafio; etapa: quantos já foram). Devolve { vetores (2 ou 3, base64), quadros }.
 * Erros: codigo 'vida' com motivo ('prazo', 'passos', 'plano', 'tela', 'salto', 'lacuna', 'outra'). `sinal` para parar.
 */
export async function capturar(video, { desafio, aoMudar = () => {}, sinal } = {}) {
  const { passos } = desafio
  const t0 = desafio.recebidoEm ?? performance.now()
  const quadros = []
  const vetores = { frente: null, esquerda: null, direita: null }
  const total = passos.length + 1
  while (!sinal?.aborted) {
    const agora = performance.now() - t0
    if (agora > VIDA.prazoMs - 1500) throw falhaDeVida('prazo')
    if (video.readyState < 2 || !video.videoWidth) {
      await esperar(80)
      continue
    }
    const antes = andamento(passos, quadros)
    const querer = Object.keys(vetores).filter((k) => !vetores[k])
    const bitmap = await createImageBitmap(video)
    const t = Math.round(performance.now() - t0)
    const r = await pedirAoWorker('quadro', { bitmap, querer }, { transferir: [bitmap] })
    if (sinal?.aborted) break
    if (r.pontos && quadros.length < VIDA.quadros) quadros.push({ t, p: r.pontos, ...(r.tela ? { m: r.tela.m, l: r.tela.l } : {}) })
    if (r.vetor && r.tipo && !vetores[r.tipo]) vetores[r.tipo] = r.vetor
    const a = andamento(passos, quadros)
    // o passo que a tela mostra: o do desafio; terminado, o giro que ainda não deu vetor (a qualidade não deixou)
    const falta = !vetores.frente ? 'frente' : ['esquerda', 'direita'].find((k) => !vetores[k])
    const passo = a.pronto ? (falta ?? null) : a.feitos === 0 && a.ref < 0 ? 'frente' : a.atual
    aoMudar({ etapa: a.ref < 0 ? 0 : 1 + a.feitos, total, passo, boa: Boolean(r.avaliacao.ok && r.pontos), dica: r.avaliacao.dica, mudou: a.feitos > antes.feitos })
    if (a.pronto && vetores.frente && vetores.esquerda && vetores.direita) {
      const v = conferirVida({ passos, quadros, decorridoMs: performance.now() - t0 })
      if (!v.ok) throw falhaDeVida(v.motivo)
      const j = juntar([vetores.frente, vetores.esquerda, vetores.direita])
      if (!j.ok) throw falhaDeVida('outra')
      return { vetores: j.vetores.map((x) => vetorParaTexto(quantizar(x))), quadros }
    }
    // um respiro para a tela (e para a bateria): no máximo ~12 quadros por segundo
    await esperar(r.vetor ? 120 : 40)
  }
  throw Object.assign(new Error('cancelado'), { name: 'AbortError' })
}

export function encerrar() {
  worker?.terminate()
  worker = null
  for (const p of pendentes.values()) p.falha(new Error('cancelado'))
  pendentes.clear()
}
