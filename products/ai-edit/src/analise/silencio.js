// Energia do áudio e trechos sem fala. Só matemática de sinal (nada de IA): RMS em janelas de 10 ms, em dBFS.
// O limiar é automático: fica entre o ruído de fundo (percentil 10) e a voz (percentil 90) da própria gravação,
// então funciona com microfone de lapela, de câmera ou celular sem ajuste.

export const JANELA_S = 0.01
const PISO_DB = -100

/** PCM mono (Float32Array) → dBFS por janela de 10 ms. */
export function envelope(pcm, taxa) {
  const n = Math.max(1, Math.round(taxa * JANELA_S))
  const total = Math.floor(pcm.length / n)
  const db = new Float32Array(total)
  for (let j = 0; j < total; j++) {
    let s = 0
    const a = j * n
    for (let i = a; i < a + n; i++) s += pcm[i] * pcm[i]
    const rms = Math.sqrt(s / n)
    db[j] = rms > 0 ? Math.max(PISO_DB, 20 * Math.log10(rms)) : PISO_DB
  }
  return db
}

function percentil(db, p) {
  const ord = Float32Array.from(db).sort()
  return ord[Math.min(ord.length - 1, Math.max(0, Math.floor((p / 100) * ord.length)))]
}

/** Níveis da gravação: piso (ruído), voz e o limiar de silêncio entre os dois. */
export function niveis(db) {
  if (!db.length) return { piso: PISO_DB, voz: PISO_DB, limiar: PISO_DB }
  const piso = percentil(db, 10)
  const voz = percentil(db, 90)
  // gravação sem pausa nenhuma (ou só ruído): diferença pequena demais, limiar fica perto do piso
  const limiar = voz - piso < 6 ? piso + 1 : piso + (voz - piso) * 0.28
  return { piso, voz, limiar }
}

/** Trechos abaixo do limiar por pelo menos `minS` segundos: [{ ini, fim }] em segundos. */
export function silencios(db, { limiar, minS = 0.45 } = {}) {
  const lim = limiar ?? niveis(db).limiar
  const min = Math.max(1, Math.round(minS / JANELA_S))
  const out = []
  let comeco = -1
  for (let j = 0; j <= db.length; j++) {
    const baixo = j < db.length && db[j] < lim
    if (baixo && comeco < 0) comeco = j
    else if (!baixo && comeco >= 0) {
      if (j - comeco >= min) out.push({ ini: comeco * JANELA_S, fim: j * JANELA_S })
      comeco = -1
    }
  }
  return out
}

/** Média de energia (dB) entre dois instantes. */
export function mediaDb(db, ini, fim) {
  const a = Math.max(0, Math.floor(ini / JANELA_S))
  const b = Math.min(db.length, Math.ceil(fim / JANELA_S))
  if (b <= a) return PISO_DB
  let s = 0
  for (let j = a; j < b; j++) s += db[j]
  return s / (b - a)
}

/** Picos para desenhar a forma de onda: `colunas` valores de 0 a 1. */
export function picos(db, colunas, piso = -60) {
  const out = new Float32Array(colunas)
  if (!db.length) return out
  for (let c = 0; c < colunas; c++) {
    const a = Math.floor((c / colunas) * db.length)
    const b = Math.max(a + 1, Math.floor(((c + 1) / colunas) * db.length))
    let m = PISO_DB
    for (let j = a; j < b && j < db.length; j++) if (db[j] > m) m = db[j]
    out[c] = Math.max(0, Math.min(1, (m - piso) / -piso))
  }
  return out
}
