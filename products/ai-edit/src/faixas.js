// Voz e instrumental separados pela NOSSOM, dentro do AEON (titular, 01/11/2026: "fácil pela AEON, como na
// demonstração"). Um clique no clipe: o trecho de áudio dele vai para a NOSSOM (o motor dela, stems-v1, na nuvem, com
// a franquia da pessoa), as faixas voltam e ficam alinhadas ao clipe; Voz e Instrumental com Solo, Mudo e volume, como
// duas trilhas debaixo do clipe. As cinco faixas da NOSSOM (voz, bateria, baixo, guitarra, outros) somam exatamente o
// original; aqui viram duas: a voz e o instrumental (a soma das outras quatro). O remix fino das cinco fica na NOSSOM.
//
// Onde mora cada coisa: a separação (o trecho da mídia separado) fica no projeto (p.separacoes); os arquivos das
// faixas, no disco do navegador (app/faixas-disco.js), nunca no projeto; o volume de cada faixa, no clipe (c.faixas),
// então cortar ou mover o clipe leva junto. Tudo puro e imutável, como a linha; prévia, render e exportadores leem daqui.

import { paraSegundos } from './tempo.js'

/** As faixas que a NOSSOM devolve (stems-v1), na ordem dela. */
export const STEMS = Object.freeze(['voz', 'bateria', 'baixo', 'guitarra', 'outros'])
/** As duas do AEON. */
export const FAIXAS = Object.freeze(['voz', 'instrumental'])
export const ROTULOS = Object.freeze({ voz: 'Voz', instrumental: 'Instrumental' })
export const PRESET_NOSSOM = 'stems-v1'
export const TAXA = 44100
/** Volume de cada faixa em dB; null = muda. */
export const VOLUME_MIN = -60
export const VOLUME_MAX = 12
export const MIX_TUDO = Object.freeze({ voz: 0, instrumental: 0 })
export const PRESETS_MIX = Object.freeze([
  { id: 'tudo', nome: 'Tudo', mix: { voz: 0, instrumental: 0 } },
  { id: 'voz', nome: 'Só voz', mix: { voz: 0, instrumental: null } },
  { id: 'instrumental', nome: 'Só instrumental', mix: { voz: null, instrumental: 0 } },
])
/** Maior trecho por pedido: 16-bit estéreo a 44,1 kHz cabe nos 100 MB da NOSSOM, abaixo dos 10 min dela. */
export const LIMITE_S = 590
/** Um pouco antes e depois do clipe, para aparar sem separar de novo. */
export const FOLGA_S = 2

let seq = 0
const novoId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`
const separacoesDe = (p) => p.separacoes || []
export const separacaoPorId = (p, id) => separacoesDe(p).find((s) => s.id === id) || null

/** Folga para comparar o clipe (em quadros) com a separação (em s): um quadro, que o arredondamento pode passar. */
const folga = (p) => paraSegundos(1, p.fps) + 1e-3

const volume = (v) => (v === null || v === undefined || v === 'mudo' ? null : Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, Math.round(Number(v) * 10) / 10 || 0)))

/**
 * O trecho da mídia que um pedido manda separar para este clipe (s de origem): o do clipe com a folga dos lados, sem
 * passar da mídia. { ini, fim } ou { erro } quando passa do limite.
 */
export function trechoParaSeparar(p, c) {
  const m = p.midias.find((x) => x.id === c.midia)
  if (!m?.temAudio) return { erro: 'Este clipe não tem som.' }
  const ini = Math.max(0, paraSegundos(c.ini, p.fps) - FOLGA_S)
  const fim = Math.min(m.duracao || paraSegundos(c.fim, p.fps), paraSegundos(c.fim, p.fps) + FOLGA_S)
  if (fim - ini > LIMITE_S + 2 * FOLGA_S) return { erro: `Separe trechos de até ${Math.floor(LIMITE_S / 60)} min: corte o clipe antes.` }
  return { ini: Math.round(ini * 1000) / 1000, fim: Math.round(Math.min(fim, ini + LIMITE_S) * 1000) / 1000 }
}

/** Minutos da franquia da NOSSOM que o pedido usa (ela reserva pelo menos 1 min por pedido). */
export const minutosDoPedido = (segundos) => Math.max(1, Math.ceil(segundos / 60))

/**
 * A separação do clipe: a mais nova da mesma mídia que cobre o trecho inteiro dele (s de origem). null se nenhuma.
 */
export function separacaoDoClipe(p, c) {
  const a = paraSegundos(c.ini, p.fps) + folga(p)
  const b = paraSegundos(c.fim, p.fps) - folga(p)
  const ss = separacoesDe(p).filter((s) => s.midia === c.midia && s.ini <= a && s.fim >= b)
  return ss.length ? ss.reduce((x, y) => ((y.criado || 0) >= (x.criado || 0) ? y : x)) : null
}

/**
 * Guarda no projeto uma separação que chegou (o trecho e o ganho que a NOSSOM aplicou nas faixas) e liga as faixas
 * nos clipes dados, com o mix pedido. { projeto, id }
 */
export function adicionarSeparacao(p, { midia, ini, fim, ganhoDb = 0, pedido = null, criado = Date.now() }, ids = [], mix = MIX_TUDO) {
  const id = novoId()
  const sep = { id, midia, ini, fim, taxa: TAXA, ganhoDb: Math.min(0, Number(ganhoDb) || 0), criado, ...(pedido ? { pedido } : {}) }
  const projeto = { ...p, separacoes: [...separacoesDe(p), sep] }
  return { projeto: ids.length ? { ...projeto, linha: ligarFaixas(projeto.linha, ids, id, mix) } : projeto, id }
}

/** Liga as faixas de uma separação nos clipes (Voz e Instrumental no volume dado). */
export function ligarFaixas(linha, ids, sep, mix = MIX_TUDO) {
  const alvo = new Set(Array.isArray(ids) ? ids : [ids])
  const faixas = { sep, voz: volume(mix.voz), instrumental: volume(mix.instrumental) }
  let mudou = false
  const clipes = linha.clipes.map((c) => {
    if (!alvo.has(c.id) || JSON.stringify(c.faixas || null) === JSON.stringify(faixas)) return c
    mudou = true
    return { ...c, faixas }
  })
  return mudou ? { ...linha, clipes } : linha
}

/** Muda o volume de Voz e/ou Instrumental nos clipes (só as chaves dadas; null = muda). */
export function ajustarFaixas(linha, ids, mix) {
  const alvo = new Set(Array.isArray(ids) ? ids : [ids])
  let mudou = false
  const clipes = linha.clipes.map((c) => {
    if (!alvo.has(c.id) || !c.faixas) return c
    const novo = { ...c.faixas }
    for (const k of FAIXAS) if (k in mix) novo[k] = volume(mix[k])
    if (JSON.stringify(novo) === JSON.stringify(c.faixas)) return c
    mudou = true
    return { ...c, faixas: novo }
  })
  return mudou ? { ...linha, clipes } : linha
}

/** Volta os clipes ao som original (a separação fica no projeto para ligar de novo). */
export function desligarFaixas(linha, ids) {
  const alvo = new Set(Array.isArray(ids) ? ids : [ids])
  let mudou = false
  const clipes = linha.clipes.map((c) => {
    if (!alvo.has(c.id) || !c.faixas) return c
    mudou = true
    const { faixas, ...resto } = c
    return resto
  })
  return mudou ? { ...linha, clipes } : linha
}

/**
 * As faixas que valem para o clipe agora: { sep, voz, instrumental, desloc } (desloc = s do começo da separação até o
 * começo do clipe), ou null quando o clipe toca o som original: sem faixas, separação sumida ou que não cobre mais o
 * clipe (foi aparado para fora), ou tudo em 0 dB (as faixas somam o original: toca o original, sem gastar nada).
 */
export function faixasDoClipe(p, c) {
  if (!c.faixas) return null
  const sep = separacaoPorId(p, c.faixas.sep)
  if (!sep || sep.midia !== c.midia) return null
  const ini = paraSegundos(c.ini, p.fps)
  if (ini < sep.ini - folga(p) || paraSegundos(c.fim, p.fps) > sep.fim + folga(p)) return null
  if (c.faixas.voz === 0 && c.faixas.instrumental === 0) return null
  return { sep, voz: c.faixas.voz, instrumental: c.faixas.instrumental, desloc: ini - sep.ini }
}

/** O clipe tem faixas ligadas, mas a separação não cobre mais o trecho dele (aparado para fora)? */
export function faixasForaDoTrecho(p, c) {
  if (!c.faixas) return false
  const sep = separacaoPorId(p, c.faixas.sep)
  return !sep || paraSegundos(c.ini, p.fps) < sep.ini - folga(p) || paraSegundos(c.fim, p.fps) > sep.fim + folga(p)
}

/** O preset que o mix é (para o botão aceso), ou null. */
export function presetDoMix(mix) {
  const v = mix?.voz === undefined ? 0 : mix.voz
  const i = mix?.instrumental === undefined ? 0 : mix.instrumental
  return PRESETS_MIX.find((x) => x.mix.voz === v && x.mix.instrumental === i)?.id || null
}

/** Separações que nenhum clipe usa mais (para tirar do projeto e liberar o disco). */
export function separacoesSoltas(p) {
  const usadas = new Set(p.linha.clipes.map((c) => c.faixas?.sep).filter(Boolean))
  return separacoesDe(p).filter((s) => !usadas.has(s.id))
}

// ───────── a NOSSOM: o pacote que volta ─────────

/**
 * O relatório da NOSSOM para stems-v1 é válido? (a mesma checagem do estúdio dela, lib/restoration.ts › validStemsReport)
 */
export function relatorioValido(r) {
  return Boolean(
    r &&
      r.preset === PRESET_NOSSOM &&
      r.sampleRate === TAXA &&
      r.channels === 2 &&
      Number.isFinite(r.gainDb) &&
      r.gainDb <= 0 &&
      Array.isArray(r.stems) &&
      r.stems.length === STEMS.length &&
      r.stems.every((s, i) => s?.name === STEMS[i] && Number.isInteger(s.bytes) && s.bytes > 0) &&
      Number.isInteger(r.totalBytes) &&
      r.stems.reduce((n, s) => n + s.bytes, 0) === r.totalBytes &&
      Array.isArray(r.chunks) &&
      r.chunks.length >= 1 &&
      r.chunks.reduce((n, c) => n + (Number(c?.bytes) || 0), 0) === r.totalBytes,
  )
}

/** Onde cada faixa começa e termina no pacote que volta (as cinco, coladas uma depois da outra). [{ nome, ini, fim }] */
export function partesDoPacote(r) {
  let i = 0
  return r.stems.map((s) => {
    const x = { nome: s.name, ini: i, fim: i + s.bytes }
    i += s.bytes
    return x
  })
}

// ───────── som ─────────

/** WAV PCM de 16 bits (o que sobe para a NOSSOM e o que vai para os editores). canais: [Float32Array, ...] */
export function wav16(canais, taxa) {
  const nc = canais.length
  const n = canais[0]?.length || 0
  const dados = n * nc * 2
  const b = new Uint8Array(44 + dados)
  const v = new DataView(b.buffer)
  const txt = (o, s) => [...s].forEach((ch, i) => (b[o + i] = ch.charCodeAt(0)))
  txt(0, 'RIFF')
  v.setUint32(4, 36 + dados, true)
  txt(8, 'WAVE')
  txt(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, nc, true)
  v.setUint32(24, taxa, true)
  v.setUint32(28, taxa * nc * 2, true)
  v.setUint16(32, nc * 2, true)
  v.setUint16(34, 16, true)
  txt(36, 'data')
  v.setUint32(40, dados, true)
  let o = 44
  for (let i = 0; i < n; i++)
    for (let c = 0; c < nc; c++) {
      const s = Math.max(-1, Math.min(1, canais[c][i]))
      v.setInt16(o, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true)
      o += 2
    }
  return b
}

/**
 * A voz e o instrumental de uma separação a partir das cinco faixas decodificadas (cada uma [L, R] em Float32Array, na
 * ordem de STEMS), desfazendo o ganho que a NOSSOM aplicou (as cinco somam de volta o original). { voz, instrumental }
 */
export function duasFaixas(stems, ganhoDb = 0) {
  const k = 10 ** (-ganhoDb / 20)
  const n = Math.min(...stems.map((s) => s[0].length))
  const voz = [0, 1].map((c) => Float32Array.from(stems[0][c].subarray(0, n), (x) => x * k))
  const instrumental = [0, 1].map((c) => {
    const out = new Float32Array(n)
    for (const s of stems.slice(1)) {
      const d = s[c]
      for (let i = 0; i < n; i++) out[i] += d[i]
    }
    for (let i = 0; i < n; i++) out[i] *= k
    return out
  })
  return { voz, instrumental }
}

/** Ganho linear do volume da faixa (null = muda). */
export const ganhoDaFaixa = (db) => (db === null || db === undefined || db <= VOLUME_MIN ? 0 : 10 ** (db / 20))

/**
 * O som do trecho com o mix do clipe: voz × ganho + instrumental × ganho, das amostras ini a ini + n (na taxa das
 * faixas). [L, R] Float32Array. O que passa do fim da separação é silêncio.
 */
export function misturarTrecho({ voz, instrumental }, mix, ini, n) {
  const gv = ganhoDaFaixa(mix.voz)
  const gi = ganhoDaFaixa(mix.instrumental)
  return [0, 1].map((c) => {
    const out = new Float32Array(n)
    const v = voz[c]
    const it = instrumental[c]
    for (let i = 0; i < n; i++) {
      const k = ini + i
      if (k < 0 || k >= v.length) continue
      out[i] = v[k] * gv + it[k] * gi
    }
    return out
  })
}
