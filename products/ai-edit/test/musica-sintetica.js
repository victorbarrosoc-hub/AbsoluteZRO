// Música de mentira para os testes do clipe musical: bateria (bumbo no 1 e no 3, caixa no 2 e no 4, chimbal no
// refrão), acordes em senoides e partes com energia diferente. Gerada por semente, nada vem de arquivo.

export const TAXA = 16000

export function sorteio(semente) {
  let s = semente | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NOTA = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const freq = (n, oitava = 4) => 440 * 2 ** ((n - 9) / 12 + (oitava - 4))
/** Acorde maior ou menor ("Am", "F") → frequências de três notas. */
function acorde(nome) {
  const raiz = NOTA[nome[0]]
  const terca = nome.endsWith('m') ? 3 : 4
  return [freq(raiz, 3), freq((raiz + terca) % 12, 4), freq((raiz + 7) % 12, 4)]
}

/**
 * Uma música em partes: [{ tipo, compassos, acordes: ['C','G',...] (um por compasso, em ciclo), forca (0–1), chimbal }].
 * { pcm, taxa, bpm, duracao, partes: [{ tipo, ini, fim }], compassos: [s] }
 */
export function musica({ bpm = 120, partes, semente = 1, inicioS = 0 } = {}) {
  const r = sorteio(semente)
  const batida = 60 / bpm
  const total = inicioS + partes.reduce((s, p) => s + p.compassos * 4 * batida, 0) + 1
  const pcm = new Float32Array(Math.ceil(total * TAXA))
  const marcas = []
  const compassos = []
  let t = inicioS
  for (const p of partes) {
    const ini = t
    for (let c = 0; c < p.compassos; c++) {
      compassos.push(Math.round(t * 1000) / 1000)
      const fs = acorde(p.acordes[c % p.acordes.length])
      const a0 = Math.round(t * TAXA)
      const n = Math.round(4 * batida * TAXA)
      for (let i = 0; i < n && a0 + i < pcm.length; i++) {
        let v = 0
        for (const f of fs) v += Math.sin((2 * Math.PI * f * i) / TAXA)
        pcm[a0 + i] += 0.08 * p.forca * v
      }
      for (let b = 0; b < 4; b++) {
        const tb = t + b * batida
        const bumbo = b === 0 || b === 2
        golpe(pcm, tb, bumbo ? 0.9 * p.forca : 0.6 * p.forca, bumbo ? 60 : 0, r)
        if (p.chimbal) golpe(pcm, tb + batida / 2, 0.25 * p.forca, 0, r, 0.02)
      }
      t += 4 * batida
    }
    marcas.push({ tipo: p.tipo, ini: Math.round(ini * 1000) / 1000, fim: Math.round(t * 1000) / 1000 })
  }
  return { pcm, taxa: TAXA, bpm, duracao: pcm.length / TAXA, partes: marcas, compassos }
}

function golpe(pcm, t, amp, f, r, decai = 0.06) {
  const a0 = Math.round(t * TAXA)
  for (let i = 0; i < TAXA * 0.2 && a0 + i < pcm.length; i++) {
    const env = Math.exp(-i / (TAXA * decai))
    pcm[a0 + i] += amp * env * (f ? Math.sin((2 * Math.PI * f * i) / TAXA) : r() * 2 - 1)
  }
}

/** A canção padrão dos testes: intro, verso, refrão, verso, refrão, final. */
export const CANCAO = [
  { tipo: 'intro', compassos: 4, acordes: ['Am'], forca: 0.35 },
  { tipo: 'verso', compassos: 8, acordes: ['C', 'G', 'Am', 'F'], forca: 0.6 },
  { tipo: 'refrao', compassos: 8, acordes: ['F', 'G', 'E', 'Am'], forca: 1, chimbal: true },
  { tipo: 'verso', compassos: 8, acordes: ['C', 'G', 'Am', 'F'], forca: 0.6 },
  { tipo: 'refrao', compassos: 8, acordes: ['F', 'G', 'E', 'Am'], forca: 1, chimbal: true },
  { tipo: 'final', compassos: 4, acordes: ['Am'], forca: 0.3 },
]

/**
 * Uma tomada de performance: o trecho [de, de + dur) da música como um celular grava (mais baixo, abafado e com
 * ruído), começando `antes` segundos antes (silêncio da sala).
 */
export function tomada(m, { de, dur, antes = 0, semente = 9 }) {
  const r = sorteio(semente)
  const out = new Float32Array(Math.round((dur + antes) * TAXA))
  let lp = 0
  for (let i = 0; i < out.length; i++) {
    const k = Math.round((de - antes) * TAXA) + i
    const s = k >= 0 && k < m.pcm.length ? m.pcm[k] : 0
    lp = lp * 0.6 + s * 0.4
    out[i] = 0.5 * lp + (r() * 2 - 1) * 0.04
  }
  return out
}
