// Faixa de efeitos sonoros (sonoplastia): sons do projeto e efeitos presos à imagem. Como o clipe conectado do Final
// Cut, o efeito se prende ao quadro de origem da mídia que está tocando quando ele começa (midia + fonte), não a um
// segundo solto da linha: cortar, aparar ou mover o trecho leva o efeito junto; se o trecho sai da linha, o efeito
// fica fora até ele voltar (Desfazer). Tudo imutável, como a linha. Com velocidade (speed ramp), o quadro de origem e a
// posição na linha seguem a curva CONTÍNUA do clipe (src/velocidade.js), a mesma da prévia e do render: o som cai no
// quadro exato em que a imagem aparece (os degraus inteiros ficam só para os exportadores). Em câmera lenta a origem é
// fracionária, para o efeito não pular para o começo do quadro de origem.

import { duracao, localizar, posicoes, tamanho } from './linha.js'
import { paraQuadros, paraSegundos } from './tempo.js'
import { ganho } from './quadro.js'
import { origemContinua, saidaContinua } from './velocidade.js'

/** Um efeito pode durar no máximo isto (s): mais que isso é trilha, não efeito. */
export const SOM_MAX_S = 600
/** Volume do efeito em dB, o mesmo intervalo dos ajustes do clipe. */
export const VOLUME_MIN = -60
export const VOLUME_MAX = 12

/**
 * De onde o som veio. 'arquivo' = do computador da pessoa e 'banco' = da pasta dela no Drive (a licença é dela); 'zro' =
 * os sons originais da Absolute ZRO (licença da plataforma). Nos três, nada vai para os créditos.
 */
export const ORIGENS = ['arquivo', 'banco', 'zro', 'openverse', 'elevenlabs']

let seq = 0
const novoId = (pre) => `${pre}${Date.now().toString(36)}${(seq++).toString(36)}`
const limitarVolume = (v) => Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, Math.round(Number(v) * 10) / 10 || 0))

const sonsDe = (p) => p.sons || []
const efeitosDe = (p) => p.efeitos || []
export const somPorId = (p, id) => sonsDe(p).find((s) => s.id === id)

/**
 * Som no projeto (o arquivo continua onde está; o app nunca move nem apaga). som: { id?, nome, caminho?, duracao (s),
 * taxa?, canais?, origem: { tipo, titulo?, autor?, licenca?, licencaUrl?, url? } }. Já existe com o mesmo id: nada muda.
 */
export function adicionarSom(p, som) {
  const dur = Number(som?.duracao)
  if (!som?.nome || !Number.isFinite(dur) || dur <= 0) throw new Error('Som sem nome ou sem duração.')
  if (dur > SOM_MAX_S) throw new Error('Esse som passa de 10 minutos: use como trilha, não como efeito.')
  const tipo = som.origem?.tipo || 'arquivo'
  if (!ORIGENS.includes(tipo)) throw new Error('Origem do som desconhecida.')
  const id = som.id || novoId('s')
  if (somPorId(p, id)) return { projeto: p, id }
  const novo = { ...som, id, duracao: dur, origem: { ...som.origem, tipo } }
  return { projeto: { ...p, sons: [...sonsDe(p), novo] }, id }
}

/** Tira sons do projeto e os efeitos que os usam (um passo só no Desfazer). */
export function removerSons(p, ids) {
  const fora = new Set(Array.isArray(ids) ? ids : [ids])
  if (!sonsDe(p).some((s) => fora.has(s.id))) return p
  return { ...p, sons: sonsDe(p).filter((s) => !fora.has(s.id)), efeitos: efeitosDe(p).filter((e) => !fora.has(e.som)) }
}

/** O ponto de origem que toca no quadro q da linha (no fim da linha, o último quadro). null em linha vazia. */
function ancora(p, q) {
  const total = duracao(p.linha)
  if (!total) return null
  const l = localizar(p.linha, Math.max(0, Math.min(Math.round(q), total - 1)))
  if (!l) return null
  const c = l.clipe
  const k = Math.max(0, Math.min(Math.round(q), total - 1)) - l.inicio
  const fonte = c.velocidade ? Math.min(c.fim - 1e-4, Math.round(origemContinua(c, k) * 1e4) / 1e4) : c.ini + k
  return { midia: c.midia, fonte }
}

/** Quadro de origem → quadro na linha pela curva contínua (null se aquele trecho foi cortado). Primeira ocorrência. */
function naLinha(linha, midia, fonte) {
  let t = 0
  for (const c of linha.clipes) {
    const n = tamanho(c)
    if (c.midia === midia && fonte >= c.ini && fonte < c.fim) return t + Math.min(n - 1, Math.max(0, Math.round(c.velocidade ? saidaContinua(c, fonte) : fonte - c.ini)))
    t += n
  }
  return null
}

/** Coloca o som no quadro q da linha. { projeto, id } (id null se não há onde prender: linha vazia ou som desconhecido). */
export function colocarEfeito(p, som, q, { volume = 0, momento } = {}) {
  const a = somPorId(p, som) && ancora(p, q)
  if (!a) return { projeto: p, id: null }
  const id = novoId('e')
  const e = { id, som, ...a, volume: limitarVolume(volume), ...(momento ? { momento } : {}) }
  return { projeto: { ...p, efeitos: [...efeitosDe(p), e] }, id }
}

const trocar = (p, id, fn) => {
  let mudou = false
  const efeitos = efeitosDe(p).map((e) => {
    if (e.id !== id) return e
    const n = fn(e)
    if (n !== e) mudou = true
    return n
  })
  return mudou ? { ...p, efeitos } : p
}

/** Move o efeito para o quadro q da linha (prende de novo na imagem que está lá). */
export function moverEfeito(p, id, q) {
  const a = ancora(p, q)
  if (!a) return p
  return trocar(p, id, (e) => (e.midia === a.midia && e.fonte === a.fonte ? e : { ...e, ...a }))
}

/** Volume do efeito em dB. */
export function ajustarEfeito(p, id, { volume }) {
  return trocar(p, id, (e) => {
    const v = limitarVolume(volume)
    return v === e.volume ? e : { ...e, volume: v }
  })
}

export function removerEfeitos(p, ids) {
  const fora = new Set(Array.isArray(ids) ? ids : [ids])
  const efeitos = efeitosDe(p).filter((e) => !fora.has(e.id))
  return efeitos.length === efeitosDe(p).length ? p : { ...p, efeitos }
}

/**
 * Os efeitos que tocam, em quadros da linha: [{ efeito, som, inicio, quadros }] em ordem. O som acaba no fim do vídeo
 * (o efeito não estica a linha). Efeito cujo trecho foi cortado não entra (veja foraDaLinha).
 */
export function efeitosNaLinha(p) {
  const total = duracao(p.linha)
  const out = []
  for (const e of efeitosDe(p)) {
    const som = somPorId(p, e.som)
    const inicio = som ? naLinha(p.linha, e.midia, e.fonte) : null
    if (inicio === null || inicio >= total) continue
    const quadros = Math.min(Math.max(1, paraQuadros(som.duracao, p.fps)), total - inicio)
    out.push({ efeito: e, som, inicio, quadros })
  }
  return out.sort((a, b) => a.inicio - b.inicio || a.efeito.id.localeCompare(b.efeito.id))
}

/** Efeitos presos a um trecho que saiu da linha. */
export function foraDaLinha(p) {
  const dentro = new Set(efeitosNaLinha(p).map((x) => x.efeito.id))
  return efeitosDe(p).filter((e) => !dentro.has(e.id))
}

/**
 * Faixas para quem não aceita sobreposição na mesma trilha (Premiere, OTIO): o menor número de faixas em que nenhum
 * efeito encosta no outro. [[x, ...], ...] com x de efeitosNaLinha.
 */
export function faixas(p) {
  const out = []
  for (const x of efeitosNaLinha(p)) {
    const f = out.find((fx) => fx.at(-1).inicio + fx.at(-1).quadros <= x.inicio)
    if (f) f.push(x)
    else out.push([x])
  }
  return out
}

/**
 * Onde um efeito costuma cair, em quadros da linha: cada corte entre clipes e cada marcador. [{ q, tipo, nome }],
 * sem repetir quadro (o marcador ganha do corte no mesmo quadro).
 */
export function momentos(p) {
  const por = new Map()
  for (const { inicio, indice } of posicoes(p.linha)) if (indice > 0) por.set(inicio, { q: inicio, tipo: 'corte', nome: `Corte ${indice}` })
  for (const k of p.marcadores || []) por.set(k.q, { q: k.q, tipo: 'marcador', nome: k.nome || 'Marcador' })
  return [...por.values()].sort((a, b) => a.q - b.q)
}

/**
 * Créditos dos sons que estão na linha e pedem atribuição (licença com BY, ou origem que o termo manda citar): uma linha
 * por som, na ordem em que aparecem. Som do computador ou do banco da pessoa no Drive não entra (a licença é dela).
 */
export function creditos(p) {
  const vistos = new Set()
  const out = []
  for (const { som } of efeitosNaLinha(p)) {
    if (vistos.has(som.id) || ['arquivo', 'banco', 'zro'].includes(som.origem?.tipo)) continue
    vistos.add(som.id)
    const o = som.origem || {}
    const titulo = o.titulo || som.nome.replace(/\.[^.]+$/, '')
    const partes = [`"${titulo}"`]
    if (o.autor) partes.push(`por ${o.autor}`)
    if (o.licenca) partes.push(`· ${o.licenca}`)
    if (o.tipo === 'elevenlabs') partes.push('· gerado com ElevenLabs')
    if (o.url) partes.push(`· ${o.url}`)
    out.push(partes.join(' '))
  }
  return out
}

/**
 * Soma os efeitos que tocam no trecho [t, t + duração do buffer) da linha (s), cada um no seu ganho, e limita em ±1.
 * buf e os sons em somFx (id → AudioBuffer ou { sampleRate, length, numberOfChannels, getChannelData }) na mesma taxa.
 * O render usa no arquivo final; a conta é pura para ser testada fora do navegador.
 */
export function misturarEfeitos(buf, efeitos, somFx, t, fps) {
  const taxa = buf.sampleRate
  const ini = Math.round(t * taxa)
  const fim = ini + buf.length
  let mexeu = false
  for (const x of efeitos) {
    const fx = somFx.get(x.som.id)
    if (!fx) continue
    const a = Math.round(paraSegundos(x.inicio, fps) * taxa)
    const b = Math.min(a + fx.length, Math.round(paraSegundos(x.inicio + x.quadros, fps) * taxa))
    if (b <= ini || a >= fim) continue
    const g = ganho(x.efeito.volume)
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      const f = fx.getChannelData(Math.min(c, fx.numberOfChannels - 1))
      for (let k = Math.max(a, ini); k < Math.min(b, fim); k++) d[k - ini] += f[k - a] * g
    }
    mexeu = true
  }
  if (mexeu)
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      for (let i = 0; i < d.length; i++) d[i] = Math.max(-1, Math.min(1, d[i]))
    }
}
