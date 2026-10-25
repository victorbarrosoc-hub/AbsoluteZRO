// Conversor da Revela (o "Handbrake" do navegador): decide como converter um arquivo para um destino.
//
// Fluxo recomendado: o Resolve exporta UM master (ProRes, preset "Master de arquivo") e o conversor gera cada
// versão de entrega a partir dele, no celular ou no computador, com o codificador de hardware do aparelho quando o
// navegador permite. Aqui fica só a decisão (pura, testável); quem executa é app/converter.js com o Mediabunny.

import { DESTINOS, bitratePara } from '../entrega/destinos.js'

/** Destinos que o navegador consegue gerar: MP4 com H.264/H.265 em 8 bits (HDR fica para o Resolve). */
export const DESTINOS_CONVERSAO = DESTINOS.filter((d) => d.video.formato === 'mp4' && d.video.bits === 8)

export const RESOLUCOES = [
  { id: 'original', nome: 'A do arquivo' },
  { id: 2160, nome: '4K (2160p)' },
  { id: 1080, nome: '1080p' },
  { id: 720, nome: '720p' },
]

const CODEC = { 'H.264': 'avc', 'H.265': 'hevc' }
const par = (n) => Math.max(2, Math.round(n / 2) * 2) // codificadores pedem dimensões pares

/**
 * `origem`: { largura, altura, fps, duracao, temAudio, cor: { primaries, transfer, matrix } | null, codec }
 * `opcoes`: { resolucao: 'original' | 2160 | 1080 | 720 }
 */
export function planejar(origem, d, opcoes = {}) {
  const avisos = []
  const vertical = Boolean(d.video.largura && d.video.altura && d.video.altura > d.video.largura)
  let largura = origem.largura
  let altura = origem.altura

  if (vertical) {
    // 9:16: o lado curto vai a 1080, sem cortar nada e sem ampliar
    const curto = Math.min(largura, altura)
    const escala = Math.min(1, d.video.largura / curto)
    largura = par(largura * escala)
    altura = par(altura * escala)
    if (origem.largura > origem.altura)
      avisos.push('O arquivo é horizontal: no feed vertical ele aparece pequeno, com faixas. Para ocupar a tela, exporte em 9:16 no Resolve.')
  } else if (opcoes.resolucao && opcoes.resolucao !== 'original') {
    const alvo = Number(opcoes.resolucao)
    if (alvo < altura) {
      largura = par((largura * alvo) / altura)
      altura = alvo
    } else if (alvo > altura) avisos.push(`O arquivo tem ${altura}p; não amplio para ${alvo}p (só perderia qualidade e aumentaria o arquivo).`)
  }
  largura = par(largura)
  altura = par(altura)

  const alturaRef = vertical ? Math.max(largura, altura) : altura
  const kbps = bitratePara(d, alturaRef, origem.fps)
  const audioKbps = d.audio.kbps ?? 320

  const cor = origem.cor
  if (cor && (cor.transfer === 'pq' || cor.transfer === 'hlg')) {
    avisos.push('O arquivo é HDR. Aqui ele sai marcado como SDR (Rec.709) sem conversão de tom: faça a versão SDR no Resolve.')
  } else if (cor && cor.primaries && cor.primaries !== 'bt709') {
    avisos.push(`O arquivo está em ${cor.primaries}, não em Rec.709. A conversão mantém os valores e marca como Rec.709: confira a cor.`)
  }
  if (origem.fps > 60) avisos.push(`${origem.fps} fps: as plataformas reduzem para 60. Converta a cadência no Resolve se precisar.`)

  const bytes = Math.round(((kbps + (origem.temAudio ? audioKbps : 0)) * 1000 * (origem.duracao || 0)) / 8)
  return {
    destino: d.id,
    video: { codec: CODEC[d.video.codec] ?? 'avc', largura, altura, bitrate: kbps * 1000 },
    audio: origem.temAudio ? { codecs: d.audio.codec === 'aac' ? ['aac', 'opus'] : [d.audio.codec], bitrate: audioKbps * 1000, taxa: d.audio.taxa } : null,
    cor: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
    tamanhoEstimado: bytes,
    avisos,
  }
}

/** Nome do arquivo convertido: "filme-master.mov" + YouTube → "filme-master-youtube.mp4". */
export function nomeSaida(nome, d) {
  const base = String(nome).replace(/\.[^./]+$/, '') || 'video'
  return `${base}-${d.id}.mp4`
}

/** "1,2 GB", "350 MB". */
export function tamanhoLegivel(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`
}

/** Acima disso, sem gravar direto no disco, o celular pode não ter memória para montar o arquivo. */
export const LIMITE_MEMORIA = 1.5e9
