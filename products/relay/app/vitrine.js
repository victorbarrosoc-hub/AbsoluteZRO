// Relay · as contas da página inicial, puras (sem DOM) e testadas (test/inicio.test.js): o resumo de cada destino e
// as duas demonstrações, sempre pelo mesmo plano do conversor (src/plano.js). Nada aqui é número inventado.

import { fichaTecnica, planejar, tamanhoLegivel } from '../src/plano.js'

/** O master das demonstrações: 4K, 23,976 fps, 2 minutos, com som. */
export const MASTER = { largura: 3840, altura: 2160, fps: 23.976, duracao: 120, temVideo: true, temAudio: true, canais: 2, taxa: 48000, cor: null }

/** "1080×1920 · 30 fps · 14 Mbit/s": o que o preset entrega, curto. */
export function ficha(p) {
  if (!p.video) {
    const a = p.audio
    if (a.codec.startsWith('pcm')) return `PCM ${a.codec.slice(-2)} bits · ${a.taxa / 1000} kHz`
    return `${a.codec.toUpperCase()} · ${a.kbps} kbit/s`
  }
  const v = p.video
  if (p.ajustavel) return 'Você diz os MB'
  const tam = v.quadro ? `${v.quadro.largura}×${v.quadro.altura}` : v.ladoMenor ? `${v.ladoMenor}p` : 'Original'
  if (p.tamanhoMax) return `Até ${Math.round(p.tamanhoMax / 1e6)} MB`
  const faixa = v.kbps[1080] ?? Object.values(v.kbps)[0]
  const mbps = `${Math.round(faixa[0] / 1000)} Mbit/s${!v.quadro && !v.ladoMenor ? ' em 1080p' : ''}`
  return `${tam} · ${v.fpsMax <= 30 ? '30 fps' : `até ${v.fpsMax} fps`} · ${mbps}`
}

/** Os destinos do "Experimente". */
export const DEMO = ['youtube-4k', 'reels', 'feed', 'whatsapp', 'discord', 'mp3']
const LINHAS_DEMO = ['Tamanho', 'Vídeo', 'Bitrate', 'Áudio', 'Limite']

/** O plano do conversor para o master, em linhas curtas: { linhas, proporcao (null = só áudio), encaixe }. */
export function demonstrar(id, preencher = false) {
  const plano = planejar(MASTER, id, { preencher })
  const linhas = fichaTecnica(plano).filter(([k]) => LINHAS_DEMO.includes(k))
  linhas.push(['Arquivo', `~${tamanhoLegivel(plano.tamanhoEstimado)}`])
  return { linhas, proporcao: plano.video ? plano.video.largura / plano.video.altura : null, encaixe: plano.video?.encaixe ?? null }
}

/** Os degraus do "Cabe no limite", em MB. */
export const LIMITES_MB = [5, 10, 20, 25, 50, 100, 250, 500]

/** O "Tamanho exato" para o master: { mb, largura, altura, mbps, tamanho }. */
export function caber(mb) {
  const p = planejar(MASTER, 'tamanho', { tamanhoMB: mb })
  return { mb, largura: p.video.largura, altura: p.video.altura, mbps: p.video.bitrate / 1e6, tamanho: tamanhoLegivel(p.tamanhoEstimado) }
}
