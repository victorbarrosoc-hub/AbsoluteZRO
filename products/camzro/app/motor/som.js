// CAMZRO · som: liga o microfone ao medidor (AudioWorklet) e toca o bip de sincronia.
// O som gravado é o da faixa do microfone, intocado: o medidor só escuta.

import { bip, BIP } from '../nucleo/audio.js'

let contexto = null
const ctx = () => (contexto ||= new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' }))

/** Liga o medidor na faixa de áudio. aoLer(leitura) ~20 vezes por segundo. Devolve parar(). */
export async function medir(faixaAudio, aoLer) {
  if (!faixaAudio || typeof AudioWorkletNode === 'undefined') return () => {}
  const c = ctx()
  if (!c.medidorPronto) {
    c.medidorPronto = c.audioWorklet.addModule(new URL('./medidor.worklet.js', import.meta.url))
  }
  await c.medidorPronto
  const fonte = c.createMediaStreamSource(new MediaStream([faixaAudio]))
  const no = new AudioWorkletNode(c, 'camzro-medidor', { numberOfInputs: 1, numberOfOutputs: 0, channelCountMode: 'max' })
  no.port.onmessage = ({ data }) => aoLer(data)
  fonte.connect(no)
  if (c.state === 'suspended') c.resume().catch(() => {})
  return () => {
    try {
      fonte.disconnect()
      no.port.onmessage = null
    } catch {}
  }
}

/** Retoma o áudio depois de um toque (o navegador só deixa tocar som depois de um gesto). */
export const acordar = () => ctx().resume().catch(() => {})

/**
 * Toca o bip de sincronia no alto-falante (o microfone da câmera e o gravador de som ouvem o mesmo bip). Devolve o
 * instante (performance.now) em que o som sai, para marcar no sidecar.
 */
export async function tocarBip() {
  const c = ctx()
  await c.resume().catch(() => {})
  const amostras = bip({ fs: c.sampleRate, ...BIP })
  const b = c.createBuffer(1, amostras.length, c.sampleRate)
  b.copyToChannel(amostras, 0)
  const s = c.createBufferSource()
  s.buffer = b
  s.connect(c.destination)
  const quando = c.currentTime + 0.05
  s.start(quando)
  const ts = c.getOutputTimestamp?.()
  const agora = ts?.performanceTime ?? performance.now()
  return agora + (quando - (ts?.contextTime ?? c.currentTime)) * 1000 + (c.outputLatency || 0) * 1000
}
