// CAMZRO · medidor de áudio no AudioWorklet: roda na linha de áudio, amostra por amostra, sem perder bloco.
// Usa o mesmo medidor do núcleo (pico com balística, RMS, loudness momentânea BS.1770) e manda a leitura para a
// página ~20 vezes por segundo.

import { criarMedidor } from '../nucleo/audio.js'

class Medidor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.m = null
    this.canais = 0
    this.desde = 0
  }
  process(entradas) {
    const entrada = entradas[0]
    if (!entrada || !entrada.length) return true
    if (!this.m || this.canais !== entrada.length) {
      this.canais = entrada.length
      this.m = criarMedidor({ fs: sampleRate, canais: entrada.length })
    }
    this.m.processar(entrada)
    this.desde += entrada[0].length
    if (this.desde >= sampleRate / 20) {
      this.desde = 0
      this.port.postMessage({ ...this.m.leitura(), canais: this.canais, taxa: sampleRate })
    }
    return true
  }
}

registerProcessor('camzro-medidor', Medidor)
