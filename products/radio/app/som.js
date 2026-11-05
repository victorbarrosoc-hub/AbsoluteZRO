// Sons curtos do rádio, gerados na hora (Web Audio, nenhum arquivo de áudio): o "câmbio" de quem começa e termina de
// falar e o toque de cada aviso de set. O contexto só nasce num toque (regra do iPhone).

let ctx = null

export function destravarSom() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext
    if (C) ctx = new C()
  }
  ctx?.resume?.().catch(() => {})
}

function bip(freq, inicio, dur, volume = 0.12) {
  if (!ctx) return
  const t = ctx.currentTime + inicio
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.value = freq
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(volume, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

export const somComeca = () => bip(1320, 0, 0.06, 0.06)
export const somTermina = () => {
  bip(990, 0, 0.05, 0.06)
  bip(660, 0.06, 0.07, 0.06)
}

const TOQUES = {
  silencio: [[660, 0, 0.18], [660, 0.24, 0.18]],
  acao: [[880, 0, 0.12], [1175, 0.14, 0.22]],
  corta: [[1175, 0, 0.12], [784, 0.14, 0.24]],
  intervalo: [[523, 0, 0.3]],
}
const VIBRAR = { silencio: [80, 60, 80], acao: [200], corta: [60, 40, 60, 40, 60], intervalo: [300] }

export function somAviso(tipo) {
  for (const [f, i, d] of TOQUES[tipo] || []) bip(f, i, d, 0.18)
  try {
    navigator.vibrate?.(VIBRAR[tipo] || 100)
  } catch {
    // sem vibração neste aparelho
  }
}
