// Marca do AEON (aprovada pelo titular em 26/10/2026, prancha "Convergência"): a estrela de quatro pontas que afinam
// até virar fio, com um fio solto em cada quarto, e o nome ΛEON em traço geométrico fino (o A sem barra). Geometria só aqui: o app,
// o site e os ícones (scripts/marca.mjs) saem destas funções. Uma cor só na forma plana (currentColor); o brilho
// prateado é só para o palco (site, abertura).

import { PRODUTO } from './produto.js'

export const FONTE_MARCA = "'Figtree', -apple-system, 'SF Pro Display', system-ui, sans-serif"
const n = (v) => Math.round(v * 100) / 100

// Pontos → curva suave (Catmull-Rom em Bézier cúbica). fechar = volta ao primeiro ponto.
function suave(pts, fechar) {
  const N = pts.length
  const p = (i) => pts[fechar ? (i + N) % N : Math.max(0, Math.min(N - 1, i))]
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`
  for (let i = 0; i < (fechar ? N : N - 1); i++) {
    const [a, b, c, e] = [p(i - 1), p(i), p(i + 1), p(i + 2)]
    d += `C${n(b[0] + (c[0] - a[0]) / 6)} ${n(b[1] + (c[1] - a[1]) / 6)} ${n(c[0] - (e[0] - b[0]) / 6)} ${n(c[1] - (e[1] - b[1]) / 6)} ${n(c[0])} ${n(c[1])}`
  }
  return d + (fechar ? 'Z' : '')
}

/** (x + p)(y + q) = c passando por (0, V) e (H, 0) e pela diagonal em (t, t): acha c, p e q (bissecção). */
function hiperbole(H, V, t) {
  const bis = (f, a, b) => {
    for (let k = 0; k < 80; k++) {
      const m = (a + b) / 2
      if (f(a) * f(m) <= 0) b = m
      else a = m
    }
    return (a + b) / 2
  }
  const pq = (c) => {
    const q = bis((q) => c / (c / q - H) - q - V, 1e-9, c / H - 1e-12)
    return [c / q - H, q]
  }
  const diag = (c) => {
    const [p, q] = pq(c)
    return (-(p + q) + Math.sqrt((p + q) ** 2 - 4 * (p * q - c))) / 2
  }
  const c = bis((c) => diag(c) - t, 1e-9, H * V)
  return [c, ...pq(c)]
}

/**
 * O miolo da Convergência, centrado em (cx, cy): em cada quarto uma hipérbole que liga a ponta vertical à horizontal e
 * passa pela diagonal em (miolo, miolo); o centro vira um losango macio e as pontas afinam devagar até virar fio.
 * r = ponta de cima; largura = ponta horizontal / r; baixo = ponta de baixo / r.
 */
export function estrelaPath({ cx = 0, cy = 0, r = 1, largura = 1, baixo = 1, miolo = 0.1 } = {}) {
  const pts = []
  const N = 70
  for (const [sx, sy, ida] of [
    [1, 1, true],
    [1, -1, false],
    [-1, -1, true],
    [-1, 1, false],
  ]) {
    const V = sy > 0 ? 1 : baixo
    const [c, p, q] = hiperbole(largura, V, miolo)
    const quarto = []
    for (let k = 0; k < N; k++) {
      const x = Math.exp(Math.log(p) + ((Math.log(largura + p) - Math.log(p)) * k) / N) - p
      quarto.push([cx + sx * x * r, cy - sy * (c / (x + p) - q) * r])
    }
    pts.push(...(ida ? quarto : quarto.reverse()))
  }
  return suave(pts, true)
}

/**
 * Os fios, um por quarto: hipérboles (x − gx)(y − gy) = c que correm paralelas às pontas e dobram na diagonal em (m, m).
 * Cada fio é uma lente fina (duas hipérboles vizinhas) que afina sozinha nas pontas.
 */
export function fiosPath({ cx = 0, cy = 0, r = 1, largura = 1, baixo = 1, fio = { gx: 0.05, gy: 0.035, m: 0.28, w: 0.06, alcance: 0.97 } } = {}) {
  const { gx, gy, m, w, alcance } = fio
  let d = ''
  for (const [sx, sy] of [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ]) {
    const V = (sy > 0 ? 1 : baixo) * alcance
    const H = largura * alcance
    const curva = (c) => {
      const a = Math.log(c / (V - gy))
      const b = Math.log(H - gx)
      const pts = []
      for (let k = 0; k <= 60; k++) {
        const x = gx + Math.exp(a + ((b - a) * k) / 60)
        pts.push([cx + sx * x * r, cy - sy * (gy + c / (x - gx)) * r])
      }
      return pts
    }
    const c = (m - gx) * (m - gy)
    const pts = [...curva(c), ...curva(c * (1 + w)).reverse()]
    d += suave(pts, true)
  }
  return d
}

// proporções da prancha: compacta (ícones, favicon, barra do app) e larga (assinatura com o nome, palco)
export const FORMAS = Object.freeze({
  compacta: { largura: 0.93, baixo: 1, miolo: 0.145, fio: { gx: 0.085, gy: 0.075, m: 0.32, w: 0.14, alcance: 0.95 } },
  larga: { largura: 1.52, baixo: 0.95, miolo: 0.12, fio: { gx: 0.05, gy: 0.035, m: 0.28, w: 0.1, alcance: 0.97 } },
})

/**
 * A estrela no palco (ícone, site, abertura), como na prancha: o miolo acende do centro, um brilho leve em volta e
 * pontas e fios que somem aos poucos. Devolve defs + desenho para entrar num <svg>; id separa os gradientes.
 */
export function estrelaComBrilho({ cx, cy, r, forma = 'compacta', claro = false, id = 'aeon', ...ajuste }) {
  const g = { cx, cy, r, ...FORMAS[forma], ...ajuste }
  const H = r * g.largura
  const tinta = claro ? ['#000000', '#3a3a3f'] : ['#ffffff', '#c7c7cd']
  const fio = claro ? '#2c2c30' : '#e4e4e9'
  return `<defs>
<radialGradient id="${id}-miolo" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${n(r * 0.32)}"><stop offset="0" stop-color="${tinta[0]}"/><stop offset="0.3" stop-color="${tinta[0]}"/><stop offset="1" stop-color="${tinta[1]}"/></radialGradient>
<radialGradient id="${id}-some" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${n(H)}" gradientTransform="translate(${cx} ${cy}) scale(1 ${n(r / H)}) translate(${-cx} ${-cy})"><stop offset="0.45" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="${id}-mascara" maskUnits="userSpaceOnUse" x="${n(cx - H * 1.1)}" y="${n(cy - r * 1.1)}" width="${n(H * 2.2)}" height="${n(r * 2.2)}"><rect x="${n(cx - H * 1.1)}" y="${n(cy - r * 1.1)}" width="${n(H * 2.2)}" height="${n(r * 2.2)}" fill="url(#${id}-some)"/></mask>
<filter id="${id}-brilho" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n(r * 0.035)}"/></filter>
</defs>
<g mask="url(#${id}-mascara)">
<path d="${estrelaPath(g)}" fill="${tinta[0]}" opacity="${claro ? 0.25 : 0.55}" filter="url(#${id}-brilho)"/>
<path d="${fiosPath(g)}" fill="${fio}"/>
<path d="${estrelaPath(g)}" fill="url(#${id}-miolo)"/>
</g>`
}

/**
 * O símbolo sozinho (viewBox 0 0 100 100 na compacta; 200×100 na larga). Plano (uma cor) por padrão; brilho = a versão
 * de palco. Sem os fios fica só o miolo (favicon).
 */
export function simbolo({ cor = 'currentColor', forma = 'compacta', fios = true, titulo = true, brilho = false, claro = false } = {}) {
  const larga = forma === 'larga'
  const w = larga ? 200 : 100
  const g = { cx: w / 2, cy: larga ? 51 : 50, r: larga ? 47 : 47, ...FORMAS[forma] }
  const rotulo = titulo ? ` role="img" aria-label="${PRODUTO.nome}"` : ' aria-hidden="true"'
  const corpo = brilho
    ? estrelaComBrilho({ ...g, forma, claro, id: `aeon-${forma}-${claro ? 'claro' : 'escuro'}` })
    : `<g fill="${cor}"><path d="${estrelaPath(g)}"/>${fios ? `<path opacity="0.9" d="${fiosPath(g)}"/>` : ''}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 100"${rotulo}>${corpo}</svg>`
}

// ───────── o nome: ΛEON em traço geométrico (altura da maiúscula 100) ─────────

const TRACO = 6.5
const LETRAS = {
  Λ: { w: 86, d: (t) => `M0 100L43 ${t * 0.3}L86 100` },
  E: { w: 60, d: (t) => `M${t / 2} 0V100M0 ${t / 2}H60M0 50H54M0 ${100 - t / 2}H60` },
  O: { w: 104, d: (t) => `M52 ${-2 + t / 2}a${52 - t / 2} ${52 - t / 2} 0 1 0 0.01 0Z` },
  N: { w: 82, d: (t) => `M${t / 2} 100V0L${82 - t / 2} 100V0` },
}
const ESPACO = 58

/** O nome (ΛEON) como SVG de traço; tracking largo como na prancha. */
export function wordmark({ cor = 'currentColor', traco = TRACO } = {}) {
  let x = 0
  const ds = []
  for (const l of ['Λ', 'E', 'O', 'N']) {
    ds.push(`<path transform="translate(${x} 0)" d="${LETRAS[l].d(traco)}"/>`)
    x += LETRAS[l].w + ESPACO
  }
  const largura = x - ESPACO
  const m = 6
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-m} ${-m} ${largura + 2 * m} ${100 + 2 * m}" role="img" aria-label="${PRODUTO.nome}"><title>${PRODUTO.nome}</title><g fill="none" stroke="${cor}" stroke-width="${traco}" stroke-linejoin="miter" stroke-miterlimit="8">${ds.join('')}</g></svg>`
}

/** Assinatura completa: estrela larga em cima, ΛEON e a frase embaixo. */
export function assinatura({ cor = 'currentColor', frase = true } = {}) {
  const sim = simbolo({ cor, forma: 'larga', titulo: false }).replace('<svg ', '<svg x="60" y="0" width="400" height="200" ')
  const nome = wordmark({ cor }).replace('<svg ', '<svg x="110" y="230" width="300" height="60" ')
  const f = frase
    ? `<text x="260" y="336" text-anchor="middle" font-family="${FONTE_MARCA.replace(/"/g, "'")}" font-size="17" font-weight="400" letter-spacing="7" fill="${cor}" opacity="0.75">${PRODUTO.frase.toUpperCase()}</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 ${frase ? 350 : 300}" role="img" aria-label="${PRODUTO.nome} · ${PRODUTO.frase}">${sim}${nome}${f}</svg>`
}

/** Ícone do app (1024): a estrela de palco sobre grafite (ou papel); as quatro pontas vão até a borda do quadrado. */
export function icone({ claro = false } = {}) {
  const fundo = claro ? ['#ffffff', '#e9e9ee'] : ['#232327', '#08080a']
  const halo = claro ? '#000000' : '#ffffff'
  const id = claro ? 'aeon-claro' : 'aeon-escuro'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs><linearGradient id="${id}-fundo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fundo[0]}"/><stop offset="1" stop-color="${fundo[1]}"/></linearGradient>
<radialGradient id="${id}-halo"><stop offset="0" stop-color="${halo}" stop-opacity="${claro ? 0.06 : 0.16}"/><stop offset="1" stop-color="${halo}" stop-opacity="0"/></radialGradient></defs>
<rect x="100" y="100" width="824" height="824" rx="190" fill="url(#${id}-fundo)"/>
<rect x="100.5" y="100.5" width="823" height="823" rx="189.5" fill="none" stroke="${claro ? '#000' : '#fff'}" stroke-opacity="${claro ? 0.08 : 0.12}"/>
<circle cx="512" cy="512" r="250" fill="url(#${id}-halo)"/>
<clipPath id="${id}-caixa"><rect x="100" y="100" width="824" height="824" rx="190"/></clipPath>
<g clip-path="url(#${id}-caixa)">${estrelaComBrilho({ cx: 512, cy: 512, r: 412, largura: 1, claro, id })}</g>
</svg>`
}

/** Favicon: a estrela compacta, clara sobre grafite. */
export const favicon = ({ cor = '#f5f5f7', fundo = '#121214' } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${fundo}"/><path fill="${cor}" d="${estrelaPath({ cx: 32, cy: 32, r: 26, ...FORMAS.compacta, miolo: 0.17 })}"/></svg>`
