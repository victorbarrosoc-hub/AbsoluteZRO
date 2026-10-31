// A estabilização aplicada (sem DOM): a análise guardada na mídia (4 números por quadro, em base64 no projeto) e os
// ajustes do clipe viram a correção do quadro que está na tela. A prévia (app/player.js, transform CSS) e o render
// (app/render.js, canvas) usam a mesma conta daqui: o que se vê é o que sai.
//
// Correção de um quadro: a imagem gira e escala em volta do próprio centro, anda (dx, dy em frações da largura dela) e
// ganha o zoom fixo do clipe, que esconde a borda. Vem antes dos ajustes do clipe (escala, posição, zoom na fala).

import { VERSAO, correcoesDoTrecho } from './index.js'
import { tremor } from './trajetoria.js'
import { paraSegundos } from '../tempo.js'

/** Float32Array → base64 (a análise no projeto). */
export function paraBase64(f32) {
  const b = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength)
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

const cacheMov = new WeakMap()
/** A análise da mídia pronta para conta: { n, fps, t0, mov: Float32Array } ou null (sem análise, ou de outra versão). */
export function analiseDe(midia) {
  const e = midia?.estabilidade
  if (!e || e.versao !== VERSAO) return null
  let a = cacheMov.get(e)
  if (!a) {
    const bin = atob(e.mov)
    const u = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
    a = { n: e.n, fps: e.fps, t0: e.t0 || 0, mov: new Float32Array(u.buffer) }
    cacheMov.set(e, a)
  }
  return a
}

const cacheClipe = new WeakMap()
/** As correções do clipe inteiro (guardadas por clipe e análise; clipes e mídias são imutáveis). */
export function correcoesDoClipe(p, c, midia) {
  if (!c?.estabilizar) return null
  const an = analiseDe(midia)
  if (!an) return null
  const porClipe = cacheClipe.get(c) || new WeakMap()
  cacheClipe.set(c, porClipe)
  let r = porClipe.get(an)
  if (!r) {
    const ini = (paraSegundos(c.ini, p.fps) - an.t0) * an.fps
    const fim = (paraSegundos(c.fim, p.fps) - an.t0) * an.fps
    const aspecto = midia.altura && midia.largura ? midia.altura / midia.largura : 9 / 16
    r = correcoesDoTrecho(an, ini, fim, c.estabilizar, aspecto)
    porClipe.set(an, r)
  }
  return r
}

/** A correção no instante t (s, tempo da mídia): { dx, dy, da, ds, zoom } ou null. */
export function correcaoEm(p, c, midia, t) {
  const r = correcoesDoClipe(p, c, midia)
  if (!r) return null
  const an = analiseDe(midia)
  const i = Math.max(0, Math.min(r.correcoes.length - 1, Math.round((t - an.t0) * an.fps) - r.ini))
  return { ...r.correcoes[i], zoom: r.zoom }
}

/** O resumo do clipe: tremor antes e depois (px num quadro de 1920) e o recorte (fração da área perdida em cada lado). */
export function resumoDoClipe(p, c, midia) {
  const r = correcoesDoClipe(p, c, midia)
  if (!r) return null
  const an = analiseDe(midia)
  const movs = r.correcoes.map((_, i) => (i === 0 ? null : { dx: an.mov[4 * (r.ini + i)], dy: an.mov[4 * (r.ini + i) + 1], da: 0, ds: 0 }))
  const antes = tremor(movs, an.fps)
  const depois = tremor(movs, an.fps, r.correcoes)
  return { antes, depois, recorte: 1 - 1 / r.zoom, forca: r.forca }
}

/**
 * A correção como transform CSS de um <video> que ocupa a tela L × A com object-fit: contain e origem 0 0 (como em
 * src/quadro.js › transformCssClipe): a imagem (cw × ch) fica no retângulo base; a correção gira em volta do centro dela.
 */
export function cssDaCorrecao(L, A, cw, ch, e) {
  if (!e) return ''
  const fit = Math.min(L / cw, A / ch)
  const w = cw * fit
  const cx = L / 2
  const cy = A / 2
  const pct = (px, total) => `${(px / total) * 100}%`
  return `translate(${pct(cx, L)}, ${pct(cy, A)}) scale(${e.zoom}) translate(${pct(e.dx * w, L)}, ${pct(e.dy * w, A)}) rotate(${e.da}rad) scale(${Math.exp(e.ds)}) translate(${pct(-cx, L)}, ${pct(-cy, A)})`
}

/** A mesma correção no canvas do render, para a imagem que vai ser desenhada no retângulo ret ({ x, y, w, h }). */
export function corrigirNoCanvas(ctx, ret, e) {
  if (!e) return
  const cx = ret.x + ret.w / 2
  const cy = ret.y + ret.h / 2
  ctx.translate(cx, cy)
  ctx.scale(e.zoom, e.zoom)
  ctx.translate(e.dx * ret.w, e.dy * ret.w)
  ctx.rotate(e.da)
  ctx.scale(Math.exp(e.ds), Math.exp(e.ds))
  ctx.translate(-cx, -cy)
}
