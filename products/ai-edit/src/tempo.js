// Tempo em quadros inteiros: a linha do tempo nunca guarda segundos soltos (sem erro acumulado de ponto flutuante).
// fps é racional { n, d } (30000/1001 = 29,97), como os editores guardam.

const COMUNS = [
  [23.976, 24000, 1001],
  [29.97, 30000, 1001],
  [47.952, 48000, 1001],
  [59.94, 60000, 1001],
  [119.88, 120000, 1001],
]

/** 29.97 → { n: 30000, d: 1001 }; 25 → { n: 25, d: 1 }. */
export function fpsDe(valor) {
  const v = Number(valor)
  if (!Number.isFinite(v) || v <= 0) throw new Error('fps inválido')
  for (const [f, n, d] of COMUNS) if (Math.abs(v - f) < 0.006) return { n, d }
  const r = Math.round(v)
  if (Math.abs(v - r) < 0.006) return { n: r, d: 1 }
  return { n: Math.round(v * 1000), d: 1000 }
}

export const fpsNumero = (fps) => fps.n / fps.d
/** quadros por segundo "de contagem" do timecode (30 para 29,97) */
export const fpsNominal = (fps) => Math.round(fps.n / fps.d)

export const paraQuadros = (s, fps) => Math.round((s * fps.n) / fps.d)
export const paraSegundos = (q, fps) => (q * fps.d) / fps.n

/** Timecode sem drop-frame (HH:MM:SS:FF), como a EDL e o xmeml pedem com <ntsc>. */
export function timecode(q, fps) {
  const base = fpsNominal(fps)
  const total = Math.max(0, Math.round(q))
  const ff = total % base
  const s = Math.floor(total / base)
  const p = (x) => String(x).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(ff)}`
}

/** Tempo racional do FCPXML: 1001/30000s. Zero vira "0s". */
export function racional(q, fps) {
  if (!q) return '0s'
  const num = q * fps.d
  const g = mdc(Math.abs(num), fps.n)
  return `${num / g}/${fps.n / g}s`
}

/** "1:05" ou "1:02:05" para a interface. */
export function relogio(s) {
  const t = Math.max(0, Math.round(s))
  const h = Math.floor(t / 3600)
  const m = Math.floor(t / 60) % 60
  const ss = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

function mdc(a, b) {
  while (b) [a, b] = [b, a % b]
  return a || 1
}
