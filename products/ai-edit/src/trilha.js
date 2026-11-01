// A trilha do projeto: uma música que toca debaixo da linha inteira, presa ao começo da linha (não à imagem, como os
// efeitos sonoros): no clipe musical e no aftermovie é a música que manda, e trocar, aparar ou mover um plano não
// mexe nela. A música é uma mídia do projeto (o arquivo continua onde está); `desde` é o instante da música (s) que
// toca no quadro 0 da linha. Prévia, render e exportadores leem daqui. Puro e imutável.

import { duracao } from './linha.js'
import { paraSegundos } from './tempo.js'

export const VOLUME_MIN = -60
export const VOLUME_MAX = 12
const volume = (v) => Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, Math.round(Number(v) * 10) / 10 || 0))

/** Põe (ou troca) a trilha: a mídia (com som) e de onde ela começa. */
export function definirTrilha(p, midia, { desde = 0, volume: v = 0 } = {}) {
  const m = p.midias.find((x) => x.id === midia)
  if (!m?.temAudio) throw new Error('A trilha precisa de uma mídia com som.')
  const d = Math.max(0, Math.min(m.duracao, Math.round(Number(desde) * 1000) / 1000 || 0))
  const t = { midia, desde: d, volume: volume(v) }
  return p.trilha && p.trilha.midia === t.midia && p.trilha.desde === t.desde && p.trilha.volume === t.volume ? p : { ...p, trilha: t }
}

export function tirarTrilha(p) {
  if (!p.trilha) return p
  const { trilha, ...resto } = p
  return resto
}

export function ajustarTrilha(p, { volume: v }) {
  if (!p.trilha) return p
  const n = volume(v)
  return n === p.trilha.volume ? p : { ...p, trilha: { ...p.trilha, volume: n } }
}

/**
 * A trilha como ela toca: { midia (a mídia inteira), desde (s da música), dur (s da linha em que toca), volume } ou
 * null (sem trilha, mídia que saiu do projeto ou linha vazia). Acaba no fim da música ou no fim da linha.
 */
export function trilhaNaLinha(p) {
  const t = p.trilha
  if (!t) return null
  const m = p.midias.find((x) => x.id === t.midia)
  const linha = paraSegundos(duracao(p.linha), p.fps)
  if (!m || !linha) return null
  const dur = Math.min(linha, m.duracao - t.desde)
  return dur > 0 ? { midia: m, desde: t.desde, dur, volume: t.volume } : null
}

/** O instante da música (s) que toca no quadro q da linha. */
export const musicaNoQuadro = (p, q) => (p.trilha ? p.trilha.desde + paraSegundos(q, p.fps) : null)
