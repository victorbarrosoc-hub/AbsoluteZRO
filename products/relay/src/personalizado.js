// Presets da pessoa ("Meus"): a ficha técnica que ela monta vira um preset igual aos do Relay, validado aqui (puro e
// testável). Guardados no aparelho (localStorage) e levados entre aparelhos e para a equipe como arquivo `.relay.json`.
//
// Um preset próprio parte de um do Relay (a base) e muda o que a pessoa quiser: contêiner e codec, tamanho (lado menor
// ou tela fixa), cadência máxima, bitrate médio OU tamanho máximo, quadro-chave e áudio. Bitrate aqui é literal: no
// navegador vira o alvo do codificador; no computador, duas passadas no x264 (bitrate médio).

import { preset as presetDoRelay } from './presets.js'

export const VERSAO = 1

export const OPCOES = {
  formato: [
    { id: 'mp4', nome: 'MP4' },
    { id: 'm4a', nome: 'M4A (só áudio)' },
    { id: 'mp3', nome: 'MP3 (só áudio)' },
    { id: 'wav', nome: 'WAV (só áudio)' },
  ],
  codec: [
    { id: 'avc', nome: 'H.264' },
    { id: 'hevc', nome: 'HEVC (H.265)' },
  ],
  lado: [null, 2160, 1440, 1080, 720, 540, 480, 360],
  fps: [null, 60, 50, 30, 25, 24],
  gop: [0.5, 1, 2, 5],
  audioVideo: [
    { id: 'aac', nome: 'AAC' },
    { id: 'nenhum', nome: 'Sem áudio' },
  ],
  kbpsAac: [96, 128, 160, 192, 256, 320, 384],
  kbpsMp3: [128, 192, 256, 320],
  taxa: [null, 44100, 48000],
  canais: [null, 2, 1],
}

export const LIMITES = { kbps: [200, 200_000], mb: [1, 4000], tela: [16, 8192], nome: 40 }

const entre = (n, [a, b]) => Math.min(b, Math.max(a, n))
const par = (n) => Math.max(2, Math.round(n / 2) * 2)
/** Número do campo, ou o padrão se veio vazio ou inválido (zero vale: vai para o limite). */
const num = (x, padrao) => (x === '' || x == null || !Number.isFinite(Number(x)) ? padrao : Number(x))

/** Ficha técnica editável a partir de um preset (do Relay ou da pessoa). */
export function especificacaoDe(p) {
  const v = p.video
  const faixa = v?.kbps ? (v.kbps[1080] ?? Object.values(v.kbps)[0]) : null
  return {
    v: VERSAO,
    nome: p.personalizado ? p.nome : `${p.nome} · meu`,
    base: p.base ?? p.id,
    formato: p.formato,
    codec: v?.codec ?? 'avc',
    tamanho: v?.quadro ? 'tela' : 'lado',
    lado: v?.ladoMenor ?? null,
    largura: v?.quadro?.largura ?? 1080,
    altura: v?.quadro?.altura ?? 1920,
    fps: v?.fpsMax && v.fpsMax <= 60 ? v.fpsMax : null,
    qualidade: p.tamanhoMax ? 'tamanho' : 'bitrate',
    kbps: v?.bitrateFixo ?? faixa?.[0] ?? 8000,
    mb: p.tamanhoMax ? Math.round(p.tamanhoMax / 1e6) : 50,
    gop: v?.gop ?? 2,
    audio: p.audio?.codec === 'mp3' || p.audio?.codec?.startsWith('pcm') ? p.audio.codec : p.semAudio ? 'nenhum' : 'aac',
    audioKbps: p.audio?.kbps ?? 256,
    taxa: p.audio?.taxa ?? null,
    canais: p.audio?.canais ?? null,
  }
}

/**
 * Valida e monta o preset. Lança Error (com `campo`) no que não dá para consertar; ajusta para o limite o que
 * passou dele. `id` mantém o do preset que está sendo editado.
 */
export function presetPersonalizado(e, id = null) {
  if (!e || typeof e !== 'object') throw Object.assign(new Error('Ficha vazia.'), { campo: 'nome' })
  const nome = String(e.nome ?? '').trim().slice(0, LIMITES.nome)
  if (!nome) throw Object.assign(new Error('Dê um nome ao preset.'), { campo: 'nome' })
  const formato = OPCOES.formato.some((f) => f.id === e.formato) ? e.formato : 'mp4'
  const base = presetDoRelay(e.base) ? e.base : null
  const p = {
    id: id ?? `meu-${Math.random().toString(36).slice(2, 10)}`,
    nome,
    grupo: 'Meus',
    icone: 'estrela',
    personalizado: true,
    base,
    formato,
    resumo: '',
    fontes: [],
  }

  // áudio
  const taxa = OPCOES.taxa.includes(e.taxa) ? e.taxa : null
  const canais = OPCOES.canais.includes(e.canais) ? e.canais : null
  if (formato === 'mp3') p.audio = { codec: 'mp3', kbps: OPCOES.kbpsMp3.includes(e.audioKbps) ? e.audioKbps : 320, taxa, canais }
  else if (formato === 'wav') p.audio = { codec: e.audio === 'pcm-s16' ? 'pcm-s16' : 'pcm-s24', kbps: null, taxa: taxa ?? 48000, canais }
  else if (formato === 'm4a' || e.audio !== 'nenhum') p.audio = { codec: 'aac', kbps: OPCOES.kbpsAac.includes(e.audioKbps) ? e.audioKbps : 256, taxa: taxa ?? (formato === 'mp4' ? 48000 : null), canais: canais ?? (formato === 'mp4' ? 2 : null) }
  else {
    p.audio = { codec: 'aac', kbps: 128, taxa: 48000, canais: 2 }
    p.semAudio = true
  }

  if (formato !== 'mp4') {
    p.video = null
    p.resumo = resumo(p)
    return p
  }

  // vídeo
  const v = {
    codec: OPCOES.codec.some((c) => c.id === e.codec) ? e.codec : 'avc',
    ladoMenor: null,
    fpsMax: OPCOES.fps.includes(e.fps) && e.fps ? e.fps : 120,
    gop: OPCOES.gop.includes(Number(e.gop)) ? Number(e.gop) : 2,
    kbps: null,
    crf: 18,
  }
  if (e.tamanho === 'tela') v.quadro = { largura: par(entre(num(e.largura, 1080), LIMITES.tela)), altura: par(entre(num(e.altura, 1920), LIMITES.tela)) }
  else v.ladoMenor = OPCOES.lado.includes(e.lado) ? e.lado : null
  if (e.qualidade === 'tamanho') {
    p.tamanhoMax = entre(num(e.mb, 50), LIMITES.mb) * 1e6
    if (!v.quadro && !v.ladoMenor) v.ladoMenor = 2160 // a escada do tamanho máximo começa no teto
  } else v.bitrateFixo = Math.round(entre(num(e.kbps, 8000), LIMITES.kbps))
  p.video = v
  p.resumo = resumo(p)
  return p
}

function resumo(p) {
  if (!p.video) return p.audio.codec.startsWith('pcm') ? `WAV ${p.audio.codec.slice(-2)} bits` : `${p.audio.codec.toUpperCase()} ${p.audio.kbps}k`
  const v = p.video
  const tam = v.quadro ? `${v.quadro.largura}×${v.quadro.altura}` : v.ladoMenor ? `${v.ladoMenor}p` : 'Original'
  const q = p.tamanhoMax ? `até ${Math.round(p.tamanhoMax / 1e6)} MB` : `${(v.bitrateFixo / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Mbit/s`
  return `${v.codec === 'hevc' ? 'HEVC' : 'H.264'} · ${tam} · ${q}${p.semAudio ? ' · sem áudio' : ''}`
}

// ─────────── guardar e levar ───────────

/** O que vai para o localStorage e para o `.relay.json`: só as fichas (o preset se monta de novo ao ler). */
export function exportar(presets) {
  return { relay: 'presets', v: VERSAO, presets: presets.map((p) => ({ id: p.id, ...especificacaoDe(p) })) }
}

/** Lê fichas guardadas ou importadas; pula as que não validam. Devolve { presets, recusados }. */
export function importar(dados) {
  const lista = Array.isArray(dados) ? dados : dados?.relay === 'presets' && Array.isArray(dados.presets) ? dados.presets : null
  if (!lista) throw new Error('Este arquivo não é uma lista de presets do Relay.')
  const presets = []
  let recusados = 0
  for (const e of lista.slice(0, 100)) {
    try {
      presets.push(presetPersonalizado(e, typeof e.id === 'string' && /^meu-[a-z0-9-]{4,40}$/.test(e.id) ? e.id : null))
    } catch {
      recusados++
    }
  }
  return { presets, recusados }
}
