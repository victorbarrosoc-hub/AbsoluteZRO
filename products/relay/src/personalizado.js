// Presets da pessoa ("Meus"): a ficha técnica que ela monta vira um preset igual aos do Relay, validado aqui (puro e
// testável). Guardados no aparelho (localStorage) e levados entre aparelhos e para a equipe como arquivo `.relay.json`.
//
// Um preset próprio parte de um do Relay (a base) e muda o que a pessoa quiser:
//  - vídeo: codec, tamanho (lado menor ou tela fixa com faixas, preencher ou esticar), recorte, giro e espelho,
//    cadência (até um teto, que divide por inteiro, ou exata: 23,976 repete e descarta quadros), qualidade (bitrate
//    médio, constante, qualidade constante RF ou tamanho máximo) e quadro-chave;
//  - trecho (início e fim);
//  - áudio: codec, bitrate, taxa, canais e volume;
//  - computador (só na Máxima qualidade, com o x264): velocidade, ajuste, perfil, desentrelaçar, ruído, nitidez e
//    volume normalizado. No navegador a ficha diz que ficaram de fora;
//  - cor (receita da Revela: log da câmera → Rec.709 e um look), aplicada por src/cor.js.
// Bitrate aqui é literal: no navegador vira o alvo do codificador; no computador, duas passadas no x264 (médio) ou CBR.

import { preset as presetDoRelay } from './presets.js'

export const VERSAO = 2

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
  encaixe: [
    { id: 'contain', nome: 'Faixas' },
    { id: 'cover', nome: 'Preencher' },
    { id: 'fill', nome: 'Esticar' },
  ],
  fps: [null, 120, 60, 59.94, 50, 48, 30, 29.97, 25, 24, 23.976],
  fpsModo: [
    { id: 'pico', nome: 'No máximo' },
    { id: 'constante', nome: 'Exata' },
    { id: 'conformar', nome: 'Interpretar' }, // todos os quadros, só a velocidade muda (como o "Interpret Footage")
  ],
  qualidade: [
    { id: 'bitrate', nome: 'Bitrate médio' },
    { id: 'cbr', nome: 'Bitrate constante' },
    { id: 'rf', nome: 'Qualidade constante' },
    { id: 'tamanho', nome: 'Tamanho máximo' },
  ],
  gop: [0.5, 1, 2, 5, 10],
  giro: [0, 90, 180, 270],
  audioVideo: [
    { id: 'aac', nome: 'AAC' },
    { id: 'nenhum', nome: 'Sem áudio' },
  ],
  kbpsAac: [96, 128, 160, 192, 256, 320, 384],
  kbpsMp3: [128, 192, 256, 320],
  taxa: [null, 44100, 48000],
  canais: [null, 2, 1],
  // só no computador (x264/x265 do app da família)
  velocidade: [
    { id: 'veryslow', nome: 'Muito lenta' },
    { id: 'slower', nome: 'Mais lenta' },
    { id: 'slow', nome: 'Lenta' },
    { id: 'medium', nome: 'Média' },
    { id: 'fast', nome: 'Rápida' },
    { id: 'veryfast', nome: 'Muito rápida' },
  ],
  ajuste: [
    { id: null, nome: 'Nenhum' },
    { id: 'film', nome: 'Filme' },
    { id: 'grain', nome: 'Granulação' },
    { id: 'animation', nome: 'Animação' },
  ],
  perfil: [
    { id: null, nome: 'Automático' },
    { id: 'high', nome: 'High' },
    { id: 'main', nome: 'Main' },
    { id: 'baseline', nome: 'Baseline' },
  ],
  ruido: [
    { id: 0, nome: 'Nenhum' },
    { id: 1, nome: 'Leve' },
    { id: 2, nome: 'Médio' },
    { id: 3, nome: 'Forte' },
  ],
  nitidez: [
    { id: 0, nome: 'Nenhuma' },
    { id: 1, nome: 'Leve' },
    { id: 2, nome: 'Média' },
  ],
  loudness: [
    { id: null, nome: 'Como está' },
    { id: -14, nome: '-14 LUFS · streaming' },
    { id: -16, nome: '-16 LUFS · podcast' },
    { id: -23, nome: '-23 LUFS · TV' },
  ],
  tom: ['suave', 'nenhum'],
}

export const LIMITES = { kbps: [200, 200_000], mb: [1, 4000], tela: [16, 8192], nome: 40, rf: [0, 51], recorte: [0, 4000], ganho: [-20, 20], trecho: [0, 86_400] }

/** O que a ficha do computador traz quando a pessoa não mexe (= o que os presets do Relay usam). */
export const COMPUTADOR_PADRAO = { velocidade: 'slow', ajuste: null, perfil: null, desentrelacar: false, ruido: 0, nitidez: 0, loudness: null }

const entre = (n, [a, b]) => Math.min(b, Math.max(a, n))
const par = (n) => Math.max(2, Math.round(n / 2) * 2)
const parOuZero = (n) => Math.max(0, Math.round(n / 2) * 2)
/** Número do campo, ou o padrão se veio vazio ou inválido (zero vale: vai para o limite). */
const num = (x, padrao) => (x === '' || x == null || !Number.isFinite(Number(x)) ? padrao : Number(x))
const ids = (lista) => lista.map((o) => o.id)

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
    encaixe: v?.encaixe ?? 'contain',
    recorte: { cima: 0, baixo: 0, esquerda: 0, direita: 0, ...v?.recorte },
    giro: v?.giro ?? 0,
    espelhar: Boolean(v?.espelhar),
    fps: v?.fpsExato ?? v?.fpsConforme ?? (v?.fpsMax && v.fpsMax <= 60 ? v.fpsMax : null),
    fpsModo: v?.fpsExato ? 'constante' : v?.fpsConforme ? 'conformar' : 'pico',
    qualidade: p.tamanhoMax ? 'tamanho' : v?.cbr ? 'cbr' : v?.rf ? 'rf' : 'bitrate',
    kbps: v?.bitrateFixo ?? faixa?.[0] ?? 8000,
    rf: v?.crf ?? 18,
    mb: p.tamanhoMax ? Math.round(p.tamanhoMax / 1e6) : 50,
    gop: v?.gop ?? 2,
    inicio: p.trecho?.inicio ?? null,
    fim: p.trecho?.fim ?? null,
    audio: p.audio?.codec === 'mp3' || p.audio?.codec?.startsWith('pcm') ? p.audio.codec : p.semAudio ? 'nenhum' : 'aac',
    audioKbps: p.audio?.kbps ?? 256,
    taxa: p.audio?.taxa ?? null,
    canais: p.audio?.canais ?? null,
    ganho: p.audio?.ganho ?? 0,
    computador: { ...COMPUTADOR_PADRAO, ...p.computador },
    cor: p.cor ?? null,
  }
}

/** Receita de cor (formato de src/cor.js), conferida só na forma: a lista de câmeras é da Revela. */
function receita(r) {
  if (!r || typeof r !== 'object') return null
  const entrada = typeof r.entrada === 'string' && /^[a-z0-9-]{2,40}$/.test(r.entrada) ? r.entrada : null
  const look = r.look && typeof r.look.id === 'string' && /^[a-z0-9-]{4,60}$/.test(r.look.id) ? { id: r.look.id, nome: String(r.look.nome ?? 'Look').slice(0, 60) } : null
  if (!entrada && !look) return null
  // sem CST, o look pode ser de log (LUT de câmera, look feito para o log): ele lê o código, como a CST
  if (look && !entrada && r.look.sobre === 'log') look.sobre = 'log'
  return { entrada, entradaNome: entrada ? String(r.entradaNome ?? entrada).slice(0, 80) : null, tom: r.tom === 'nenhum' ? 'nenhum' : 'suave', look }
}

/** Opções do computador que fogem do padrão, ou null. */
function computador(c) {
  if (!c || typeof c !== 'object') return null
  const o = {
    velocidade: ids(OPCOES.velocidade).includes(c.velocidade) ? c.velocidade : 'slow',
    ajuste: ids(OPCOES.ajuste).includes(c.ajuste) ? c.ajuste : null,
    perfil: ids(OPCOES.perfil).includes(c.perfil) ? c.perfil : null,
    desentrelacar: Boolean(c.desentrelacar),
    ruido: ids(OPCOES.ruido).includes(c.ruido) ? c.ruido : 0,
    nitidez: ids(OPCOES.nitidez).includes(c.nitidez) ? c.nitidez : 0,
    loudness: ids(OPCOES.loudness).includes(c.loudness) ? c.loudness : null,
  }
  return Object.keys(o).some((k) => o[k] !== COMPUTADOR_PADRAO[k]) ? o : null
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

  // trecho
  const inicio = e.inicio == null || e.inicio === '' ? null : entre(num(e.inicio, 0), LIMITES.trecho)
  const fim = e.fim == null || e.fim === '' ? null : entre(num(e.fim, 0), LIMITES.trecho)
  if (inicio != null && fim != null && fim <= inicio) throw Object.assign(new Error('O fim do trecho vem antes do início.'), { campo: 'trecho' })
  if (inicio || fim != null) p.trecho = { inicio: inicio || null, fim }

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
  const ganho = Math.round(entre(num(e.ganho, 0), LIMITES.ganho) * 2) / 2
  if (ganho && !p.semAudio) p.audio.ganho = ganho

  const comp = computador(e.computador)
  if (comp) p.computador = comp

  if (formato !== 'mp4') {
    p.video = null
    p.resumo = resumo(p)
    return p
  }

  // vídeo
  const fps = OPCOES.fps.includes(e.fps) ? e.fps : null
  const v = {
    codec: OPCOES.codec.some((c) => c.id === e.codec) ? e.codec : 'avc',
    ladoMenor: null,
    fpsMax: fps ?? 120,
    gop: OPCOES.gop.includes(Number(e.gop)) ? Number(e.gop) : 2,
    kbps: null,
    crf: 18,
  }
  if (fps && e.fpsModo === 'constante') v.fpsExato = fps
  if (fps && e.fpsModo === 'conformar') v.fpsConforme = fps
  if (e.tamanho === 'tela') {
    v.quadro = { largura: par(entre(num(e.largura, 1080), LIMITES.tela)), altura: par(entre(num(e.altura, 1920), LIMITES.tela)) }
    v.encaixe = ids(OPCOES.encaixe).includes(e.encaixe) ? e.encaixe : 'contain'
  } else v.ladoMenor = OPCOES.lado.includes(e.lado) ? e.lado : null

  const r = e.recorte ?? {}
  const recorte = Object.fromEntries(['cima', 'baixo', 'esquerda', 'direita'].map((k) => [k, parOuZero(entre(num(r[k], 0), LIMITES.recorte))]))
  if (Object.values(recorte).some(Boolean)) v.recorte = recorte
  const giro = OPCOES.giro.includes(Number(e.giro)) ? Number(e.giro) : 0
  if (giro) v.giro = giro
  if (e.espelhar) v.espelhar = true

  if (e.qualidade === 'tamanho') {
    p.tamanhoMax = entre(num(e.mb, 50), LIMITES.mb) * 1e6
    if (!v.quadro && !v.ladoMenor) v.ladoMenor = 2160 // a escada do tamanho máximo começa no teto
  } else if (e.qualidade === 'rf') {
    // qualidade constante: o RF no x264; no navegador, que não tem RF, o bitrate da tabela do preset de partida
    v.rf = true
    v.crf = Math.round(entre(num(e.rf, 18), LIMITES.rf))
    v.kbps = presetDoRelay(base)?.video?.kbps ?? { 720: [8000, 12000], 1080: [16000, 24000], 1440: [24000, 36000], 2160: [50000, 75000] }
  } else {
    v.bitrateFixo = Math.round(entre(num(e.kbps, 8000), LIMITES.kbps))
    if (e.qualidade === 'cbr') v.cbr = true
  }
  p.video = v

  const cor = receita(e.cor)
  if (cor) p.cor = cor
  p.resumo = resumo(p)
  return p
}

const virgula = (n) => String(n).replace('.', ',')

function resumo(p) {
  if (!p.video) return p.audio.codec.startsWith('pcm') ? `WAV ${p.audio.codec.slice(-2)} bits` : `${p.audio.codec.toUpperCase()} ${p.audio.kbps}k`
  const v = p.video
  const tam = v.quadro ? `${v.quadro.largura}×${v.quadro.altura}` : v.ladoMenor ? `${v.ladoMenor}p` : 'Original'
  const q = p.tamanhoMax ? `até ${Math.round(p.tamanhoMax / 1e6)} MB` : v.rf ? `RF ${v.crf}` : `${(v.bitrateFixo / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Mbit/s${v.cbr ? ' CBR' : ''}`
  return [v.codec === 'hevc' ? 'HEVC' : 'H.264', tam, v.fpsExato ? `${virgula(v.fpsExato)} fps` : v.fpsConforme ? `interpretado a ${virgula(v.fpsConforme)} fps` : null, q, p.cor ? 'cor' : null, p.semAudio ? 'sem áudio' : null].filter(Boolean).join(' · ')
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
