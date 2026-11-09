// Carrossel por slide (titular, 09/11/2026): cada slide tem o próprio modelo e as próprias fotos; slides emendados
// viram um grupo só (a foto passa de um para o outro, o "panorama"). Até 20 slides, como o Instagram deixa.
// Só no app de computador por enquanto: public/lib/montagens.js (cópia idêntica no celular) não muda; aqui fica o
// que o carrossel precisa por cima dele. O desenho de cada grupo é o desenharMontagem de sempre, colado no lugar.
import { caixasDe, desenharMontagem, formatoPorId, modeloPorId } from './montagens.js'

export const MAX_SLIDES = 20
export const MIN_SLIDES = 2

const nDe = (n) => Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Math.round(Number(n)) || MIN_SLIDES))

/** A tela do carrossel: os slides lado a lado, numerados. */
export function telaCarrossel(formato, slides) {
  const f = typeof formato === 'string' ? formatoPorId(formato) : formato
  const n = nDe(slides)
  const fatias = Array.from({ length: n }, (_, i) => ({ x: i * f.w, y: 0, w: f.w, h: f.h, n: i + 1 }))
  return { id: f.id, nome: `Carrossel ${f.proporcao}`, proporcao: f.proporcao, w: f.w * n, h: f.h, fatias }
}

/**
 * Os slides de uma montagem: `{ modelo, emenda }` por slide (emenda = continua do slide anterior). Montagem de antes
 * (sem `paginas`) era uma imagem só passando por todos: vira um grupo só com o modelo dela, igual ao que saía.
 */
export function paginasDe(d) {
  const n = nDe(d?.slides)
  const base = Array.isArray(d?.paginas) ? d.paginas : Array.from({ length: n }, (_, i) => (i === 0 ? { modelo: d?.modelo } : { emenda: true }))
  return Array.from({ length: n }, (_, i) => {
    const p = base[i] || {}
    return { modelo: modeloPorId(p.modelo).id, emenda: i > 0 && p.emenda === true }
  })
}

/** Slides emendados formam um grupo; o modelo do grupo é o do primeiro slide dele. */
export function gruposDe(paginas) {
  const out = []
  paginas.forEach((p, i) => {
    if (i > 0 && p.emenda) out[out.length - 1].ate = i
    else out.push({ de: i, ate: i, modelo: modeloPorId(p.modelo).id })
  })
  return out.map((g, k) => ({ ...g, slides: g.ate - g.de + 1, inicio: out.slice(0, k).reduce((s, x) => s + modeloPorId(x.modelo).caixas.length, 0) }))
}

/** Quantos quadros (fotos) o carrossel tem ao todo. */
export const quadrosDe = (grupos) => grupos.reduce((s, g) => s + modeloPorId(g.modelo).caixas.length, 0)

/** As caixas em px de todo o carrossel (`w` × `h` é a tela inteira; cada slide tem a própria borda). */
export function caixasCarrossel(grupos, { w, h, espaco = 0, slides }) {
  const sw = w / slides
  return grupos.flatMap((g) => caixasDe(g.modelo, { w: sw * g.slides, h, espaco }).map((c) => ({ ...c, x: c.x + g.de * sw, slide: g.de })))
}

/** Qual quadro está no ponto (px da tela)? -1 se nenhum. */
export function quadroNoCarrossel(grupos, opts, px, py) {
  return caixasCarrossel(grupos, opts).findIndex((c) => px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h)
}

/** Em que slide (0…) cada quadro aparece primeiro: o número que a pessoa vê na tela. */
export function slideDosQuadros(grupos, opts) {
  const sw = opts.w / opts.slides
  return caixasCarrossel(grupos, opts).map((c) => Math.min(opts.slides - 1, Math.floor((c.x + 0.5) / sw)))
}

/**
 * Leva as fotos (ou enquadres) de um jeito de slides para outro: cada grupo que começa no mesmo slide fica com as
 * fotos dele (as que cabem); grupo novo fica vazio (null) e recebe sozinho as fotos que sobram.
 */
export function remapear(antes, depois, lista) {
  const out = []
  for (const g of depois) {
    const a = antes.find((x) => x.de === g.de)
    const quantos = modeloPorId(g.modelo).caixas.length
    for (let i = 0; i < quantos; i++) out.push(a && i < modeloPorId(a.modelo).caixas.length ? (lista[a.inicio + i] ?? null) : null)
  }
  return out
}

/** Um nome curto para o cabeçalho. */
export function nomeCarrossel(grupos) {
  if (grupos.length === 1) return grupos[0].modelo === 'uma' ? 'Panorama' : `Panorama · ${modeloPorId(grupos[0].modelo).nome}`
  const modelos = new Set(grupos.map((g) => g.modelo))
  return modelos.size === 1 ? `${modeloPorId(grupos[0].modelo).nome} em cada slide` : 'Um modelo por slide'
}

/**
 * Desenha o carrossel: cada grupo com o desenharMontagem de sempre, num canvas à parte, colado no lugar.
 * `destaque` é o índice do quadro no carrossel todo.
 */
export function desenharCarrossel(canvas, { tela, grupos, imagens = [], enquadres = [], espaco = 0, cantos = 0, fundo = '#ffffff', escala = 1, destaque = -1, vazio }) {
  const W = Math.round(tela.w * escala)
  const H = Math.round(tela.h * escala)
  if (canvas.width !== W) canvas.width = W
  if (canvas.height !== H) canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = fundo
  ctx.fillRect(0, 0, W, H)
  const sw = tela.w / tela.fatias.length
  const doc = canvas.ownerDocument || globalThis.document
  for (const g of grupos) {
    const n = modeloPorId(g.modelo).caixas.length
    const parte = doc.createElement('canvas')
    desenharMontagem(parte, {
      formato: { id: tela.id, w: sw * g.slides, h: tela.h },
      modelo: g.modelo,
      imagens: imagens.slice(g.inicio, g.inicio + n),
      enquadres: enquadres.slice(g.inicio, g.inicio + n),
      espaco,
      cantos,
      fundo,
      escala,
      destaque: destaque >= g.inicio && destaque < g.inicio + n ? destaque - g.inicio : -1,
      ...(vazio ? { vazio } : {}),
    })
    ctx.drawImage(parte, Math.round(g.de * sw * escala), 0)
  }
  return { w: W, h: H, caixas: caixasCarrossel(grupos, { w: W, h: H, espaco: espaco * escala, slides: tela.fatias.length }) }
}
