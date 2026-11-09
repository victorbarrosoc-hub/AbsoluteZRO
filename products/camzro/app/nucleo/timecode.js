// CAMZRO · timecode SMPTE (ST 12-1). Contas puras.
//
// - Non-drop (NDF): o rótulo conta quadros inteiros na cadência nominal (23,976 conta como 24, 29,97 como 30).
// - Drop-frame (DF), só em 29,97 e 59,94: pula os rótulos ;00 e ;01 (;00 a ;03 em 59,94) no começo de cada minuto,
//   menos nos minutos múltiplos de 10. Assim o rótulo acompanha o relógio: 17.982 quadros a cada 10 minutos em 29,97.
// - Separador ":" no NDF e ";" no DF (antes dos quadros), como nas câmeras e no DaVinci.
// - Hora do dia: o timecode começa no relógio (ajustado pela hora do set, nucleo/relogio.js) e corre livre.

const DIA_S = 24 * 3600

/** Cadência nominal (a que o rótulo conta) e quantos rótulos o DF pula por minuto. */
export function base(fps) {
  const nominal = Math.round(fps)
  const fracionaria = Math.abs(fps - nominal) > 1e-6
  const pula = nominal === 30 ? 2 : nominal === 60 ? 4 : 0
  return { nominal, fracionaria, podeDF: fracionaria && pula > 0, pula }
}

/** Quadros por dia (para dar a volta às 24 h) na contagem do rótulo. */
export function quadrosPorDia(fps, df) {
  const { nominal, pula } = base(fps)
  const total = nominal * DIA_S
  return df ? total - pula * (24 * 60 - 24 * 6) : total
}

/** Número do quadro → { h, m, s, q } no rótulo. */
export function quadroParaPartes(quadro, fps, df = false) {
  const { nominal, podeDF, pula } = base(fps)
  if (df && !podeDF) throw new RangeError('drop-frame só existe em 29,97 e 59,94')
  let n = ((Math.floor(quadro) % quadrosPorDia(fps, df)) + quadrosPorDia(fps, df)) % quadrosPorDia(fps, df)
  if (df) {
    const por10 = nominal * 600 - pula * 9 // 17982 em 29,97
    const porMin = nominal * 60 - pula // 1798
    const d = Math.floor(n / por10)
    const m = n % por10
    n += pula * 9 * d + (m > pula ? pula * Math.floor((m - pula) / porMin) : 0)
  }
  return { h: Math.floor(n / (nominal * 3600)) % 24, m: Math.floor(n / (nominal * 60)) % 60, s: Math.floor(n / nominal) % 60, q: n % nominal }
}

/** { h, m, s, q } → número do quadro. No DF, um rótulo pulado (00:01:00;00) vira o primeiro que existe (;02). */
export function partesParaQuadro({ h, m, s, q }, fps, df = false) {
  const { nominal, podeDF, pula } = base(fps)
  if (df && !podeDF) throw new RangeError('drop-frame só existe em 29,97 e 59,94')
  if (df && s === 0 && m % 10 !== 0 && q < pula) q = pula
  const minutos = 60 * h + m
  const bruto = nominal * 3600 * h + nominal * 60 * m + nominal * s + q
  return df ? bruto - pula * (minutos - Math.floor(minutos / 10)) : bruto
}

const dois = (v) => String(v).padStart(2, '0')

/** Texto do timecode: 01:02:03:04 (NDF) ou 01:02:03;04 (DF). */
export function formatar(quadro, fps, df = false) {
  const p = quadroParaPartes(quadro, fps, df)
  return `${dois(p.h)}:${dois(p.m)}:${dois(p.s)}${df ? ';' : ':'}${dois(p.q)}`
}

/** Lê "01:02:03:04", "01:02:03;04" ou "01.02.03.04". Devolve { quadro, df } ou null. */
export function ler(texto, fps) {
  const r = /^(\d{1,2})[:.](\d{2})[:.](\d{2})([:;.,])(\d{2})$/.exec(String(texto || '').trim())
  if (!r) return null
  const [h, m, s, q] = [r[1], r[2], r[3], r[5]].map(Number)
  const df = r[4] === ';' || r[4] === ','
  const { nominal, podeDF } = base(fps)
  if (h > 23 || m > 59 || s > 59 || q >= nominal || (df && !podeDF)) return null
  return { quadro: partesParaQuadro({ h, m, s, q }, fps, df), df }
}

/**
 * Timecode da hora do dia para o instante `ms` (epoch, já com a correção do relógio do set) no fuso `fusoMin`
 * (minutos a somar ao UTC; o do aparelho por padrão). O rótulo é o relógio; os quadros saem da fração do segundo.
 */
export function horaDoDia(ms, fps, df = false, fusoMin = -new Date(ms).getTimezoneOffset()) {
  const { nominal } = base(fps)
  const local = ms + fusoMin * 60_000
  const doDia = ((local % (DIA_S * 1000)) + DIA_S * 1000) % (DIA_S * 1000)
  const seg = Math.floor(doDia / 1000)
  const q = Math.min(nominal - 1, Math.floor(((doDia % 1000) / 1000) * nominal))
  return partesParaQuadro({ h: Math.floor(seg / 3600), m: Math.floor(seg / 60) % 60, s: seg % 60, q }, fps, df)
}

/** Duração em quadros de `segundos` gravados na cadência real (23,976 → 24000/1001 por segundo). */
export const quadrosDe = (segundos, fps) => Math.round(segundos * fps)

/** O timecode de saída (exclusivo, como no EDL e no ALE): início + duração. */
export const fim = (inicio, duracaoQuadros, fps, df = false) => (inicio + duracaoQuadros) % quadrosPorDia(fps, df)

/** Duração legível de um clipe: 1:02:03 ou 2:03 (sem quadros). */
export function duracaoTexto(segundos) {
  const t = Math.max(0, Math.floor(segundos))
  const h = Math.floor(t / 3600)
  const m = Math.floor(t / 60) % 60
  const s = t % 60
  return h ? `${h}:${dois(m)}:${dois(s)}` : `${m}:${dois(s)}`
}
