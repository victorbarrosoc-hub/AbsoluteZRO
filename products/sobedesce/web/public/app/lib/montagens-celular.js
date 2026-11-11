// Montagens no celular (aba Criar › Montagens): as contas que só o celular precisa, em cima do desenho do computador
// (lib/montagens.js, cópia idêntica de public/lib/montagens.js). Sem rede e sem DOM: dá para testar no Node.
//
// O iPhone tem limites que o computador não tem, e aqui eles viram regra:
//  - um <canvas> passa de 16,7 milhões de pixels e o Safari recusa (a grade 3×5 em 3:4 tem 23 milhões): cada parte do
//    carrossel e da grade é desenhada sozinha, no tamanho dela (desenharFatia);
//  - a foto de 12 MP aberta inteira são 48 MB: cada foto é reduzida ao que o quadro precisa (tamanhoNecessario);
//  - o vídeo sai com no máximo 1920 px no lado maior e até 4 takes (LIMITES), para caber na memória e terminar logo.
import { caixasDe, desenharMontagem } from './montagens.js'
import { cobrir, enquadreDe } from './frames-posts.js'

export const LIMITES = {
  midias: 30, // fotos e takes na bandeja
  fotoBytes: 80 * 1024 * 1024, // foto do Drive que desce para a montagem
  ladoFoto: 4096, // lado maior de uma foto aberta (o Safari não desenha canvas maior)
  ladoVideo: 1920, // lado maior do vídeo pronto
  takesVideo: 4, // takes tocando ao mesmo tempo no vídeo
  fps: 30,
}

export const FPS = LIMITES.fps
export const DURACOES = [3, 5, 8, 15]

const par = (n) => Math.max(2, Math.round(n / 2) * 2)
const dois = (n) => String(n).padStart(2, '0')

/** Nome do arquivo, como o do computador (src/server/montagens.js › nomeMontagem): sem o que o Windows recusa. */
export function nomeDoArquivo(nome, sufixo, ext) {
  const base =
    String(nome || '')
      .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'Montagem'
  const s = String(sufixo || '').replace(/[^0-9a-z._-]/gi, '')
  return `${base}${s ? `_${s}` : ''}.${ext}`
}

/**
 * As imagens que saem de uma tela (lib/montagens.js › telaDe), na ordem de postar, cada uma com o nome do arquivo:
 * "Viagem_4x5.jpg" no post; "Viagem_4x5_01.jpg", "_02"… no carrossel (da esquerda para a direita) e na grade (o 01 é
 * o primeiro a postar, embaixo à direita).
 */
export function partesDe(tela, nome) {
  const fatias = [...tela.fatias].sort((a, b) => a.n - b.n)
  if (fatias.length === 1) return [{ fatia: fatias[0], nome: nomeDoArquivo(nome, tela.id, 'jpg') }]
  return fatias.map((f) => ({ fatia: f, nome: nomeDoArquivo(nome, `${tela.id}_${dois(f.n)}`, 'jpg') }))
}

/**
 * Desenha só um pedaço da montagem (uma fatia do carrossel ou da grade) num canvas do tamanho dele. O desenho é o do
 * computador (desenharMontagem), com o pincel deslocado: o resultado é o mesmo pedaço que sairia cortando a imagem
 * inteira, sem nunca criar a imagem inteira.
 */
export function desenharFatia(canvas, opcoes, fatia, escala = 1) {
  const W = Math.round(fatia.w * escala)
  const H = Math.round(fatia.h * escala)
  if (canvas.width !== W) canvas.width = W
  if (canvas.height !== H) canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, -Math.round(fatia.x * escala), -Math.round(fatia.y * escala))
  // O desenho mede a tela inteira; o canvas de verdade fica do tamanho da fatia.
  const tela = { width: 0, height: 0, getContext: () => ctx }
  const r = desenharMontagem(tela, { ...opcoes, escala })
  ctx.restore()
  return { w: W, h: H, caixas: r.caixas }
}

/**
 * Quanto de uma foto `iw`×`ih` o quadro `caixa` (px da montagem pronta) usa, com o zoom do enquadre: abrir maior que
 * isso só gasta memória. Devolve { w, h } (nunca maior que a foto nem que `max` no lado maior).
 */
export function tamanhoNecessario(iw, ih, caixa, zoom = 1, max = LIMITES.ladoFoto) {
  if (!(iw > 0 && ih > 0)) return { w: 0, h: 0 }
  const z = Math.max(1, Number(zoom) || 1)
  const k = Math.min(1, caixa ? Math.max(caixa.w / iw, caixa.h / ih) * z : 1, max / Math.max(iw, ih))
  return { w: Math.max(1, Math.round(iw * k)), h: Math.max(1, Math.round(ih * k)) }
}

/** O tamanho do vídeo pronto: o do formato, até 1920 px no lado maior, sempre par (o H.264 pede). */
export function tamanhoDoVideo(tela, max = LIMITES.ladoVideo) {
  const k = Math.min(1, max / Math.max(tela.w, tela.h))
  return { w: par(tela.w * k), h: par(tela.h * k), escala: k }
}

/**
 * O tempo do take no quadro `k` do vídeo: começa no trecho, anda na metade da velocidade em câmera lenta e, se o take
 * acabar antes da montagem, volta para o começo do trecho (como o -stream_loop do computador).
 */
export function tempoNoTake(k, fps, trecho, total) {
  const passo = (trecho?.lento ? 0.5 : 1) / fps
  const inicio = Math.max(0, trecho?.inicio || 0)
  const resto = Math.max(1 / fps, (total || Infinity) - inicio - 1 / fps)
  return inicio + ((k * passo) % resto)
}

/** Quantos quadros tem o vídeo da montagem. */
export const quadrosDoVideo = (duracao, fps = FPS) => Math.max(1, Math.round(duracao * fps))

/**
 * Onde cada take entra no vídeo: o recorte no take (px do take) e a caixa no vídeo (px do vídeo), com o enquadre da
 * tela. `caixas` são as do vídeo (desenharMontagem na escala do vídeo); `info` { largura, altura } é do take.
 */
export function encaixeDoTake(info, caixa, enquadre) {
  const q = enquadreDe(enquadre)
  const s = cobrir(info.largura, info.altura, caixa.w, caixa.h, q.x, q.y, q.zoom)
  return { sx: s.sx, sy: s.sy, sw: s.sw, sh: s.sh, x: caixa.x, y: caixa.y, w: caixa.w, h: caixa.h }
}

/** O tamanho em que o take é lido para o quadro dele: o que a caixa mostra, nunca maior que o take. */
export function leituraDoTake(info, encaixe) {
  const k = Math.min(1, Math.max(encaixe.w / encaixe.sw, encaixe.h / encaixe.sh))
  return { w: par(info.largura * k), h: par(info.altura * k), k }
}

/** A escala da prévia na tela do celular: cabe na largura e não passa da altura. */
export function escalaDaPrevia(tela, largura, alturaMax) {
  return Math.min(largura / tela.w, alturaMax / tela.h)
}

/** Caixas da montagem num tamanho (a mesma conta do desenho, para tocar e arrastar na prévia). */
export const caixasDaTela = (modelo, tela, espaco, escala = 1) => caixasDe(modelo, { w: Math.round(tela.w * escala), h: Math.round(tela.h * escala), espaco: espaco * escala })

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|3gp|mkv)$/i
const FOTO_EXT = /\.(jpe?g|png|webp|heic|heif|gif|avif|tiff?)$/i
/** Foto ou vídeo pelo tipo (ou pelo nome, quando o tipo vem vazio, como no Drive às vezes). */
export function tipoDaMidia({ type = '', mimeType = '', name = '' } = {}) {
  const t = type || mimeType
  if (/^video\//.test(t) || (!t && VIDEO_EXT.test(name))) return 'video'
  if (/^image\//.test(t) || (!t && FOTO_EXT.test(name))) return 'foto'
  if (VIDEO_EXT.test(name)) return 'video'
  if (FOTO_EXT.test(name)) return 'foto'
  return null
}

/** "Sai assim": o que a montagem vira, em poucas palavras. */
export function saidaDe(tela, { takes = 0, video = false } = {}) {
  if (tela.fatias.length > 1) return `${tela.fatias.length} imagens ${tela.fatias[0].w} × ${tela.fatias[0].h}`
  if (takes && video) {
    const v = tamanhoDoVideo(tela)
    return `${v.w} × ${v.h} · MP4`
  }
  return `${tela.w} × ${tela.h} · JPG`
}
