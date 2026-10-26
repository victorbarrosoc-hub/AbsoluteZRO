// Marca do AEON (aprovada pelo titular em 26/10/2026, prancha "Convergência"): a estrela de quatro pontas côncava, os
// braços horizontais longos e finos, e o nome ΛEON em traço geométrico fino (o A sem barra). Geometria só aqui: o app,
// o site e os ícones (scripts/marca.mjs) saem destas funções. Uma cor só na forma plana (currentColor); o brilho
// prateado é só para o palco (site, abertura).

import { PRODUTO } from './produto.js'

export const FONTE_MARCA = "'Figtree', -apple-system, 'SF Pro Display', system-ui, sans-serif"
const n = (v) => Math.round(v * 100) / 100

/**
 * A estrela, centrada em (cx, cy). r = braço vertical; largura = braço horizontal / vertical; cintura = quão perto do
 * centro passam as curvas (controle de Bézier em fração de r). Cada quarto é uma curva de ponta a ponta.
 */
export function estrelaPath({ cx = 0, cy = 0, r = 1, largura = 1, baixo = 1, cintura = 0.2 } = {}) {
  const v = r
  const h = r * largura
  const b = r * baixo
  const k = r * cintura
  const P = (x, y) => `${n(cx + x)} ${n(cy + y)}`
  return [
    `M${P(0, -v)}`,
    `C${P(0, -k)} ${P(k, 0)} ${P(h, 0)}`,
    `C${P(k, 0)} ${P(0, k)} ${P(0, b)}`,
    `C${P(0, k)} ${P(-k, 0)} ${P(-h, 0)}`,
    `C${P(-k, 0)} ${P(0, -k)} ${P(0, -v)}Z`,
  ].join('')
}

/** Os véus da convergência: lentes finas por fora do corpo, que nascem perto das pontas e abrem no meio. */
export function veusPath({ cx = 0, cy = 0, r = 1, largura = 1, baixo = 1, de = 0.21, ate = 0.27, alcance = 0.97 } = {}) {
  const P = (x, y) => `${n(cx + x)} ${n(cy + y)}`
  const partes = []
  for (const [sx, sy] of [
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ]) {
    const ex = sx * r * largura * alcance
    const ey = sy * r * (sy > 0 ? baixo : 1) * alcance
    const a = r * de
    const c = r * ate
    partes.push(`M${P(ex, 0)}C${P(sx * a, 0)} ${P(0, sy * a)} ${P(0, ey)}C${P(0, sy * c)} ${P(sx * c, 0)} ${P(ex, 0)}Z`)
  }
  return partes.join('')
}

// proporções da prancha: compacta (ícones, favicon, barra do app) e larga (assinatura com o nome, palco)
export const FORMAS = Object.freeze({
  compacta: { largura: 0.84, baixo: 1, cintura: 0.17 },
  larga: { largura: 1.7, baixo: 0.88, cintura: 0.12 },
})

/** O símbolo sozinho, num quadrado (viewBox 0 0 100 100 na compacta; 200×100 na larga). */
export function simbolo({ cor = 'currentColor', forma = 'compacta', veus = forma === 'larga', titulo = true } = {}) {
  const f = FORMAS[forma]
  const larga = forma === 'larga'
  const w = larga ? 200 : 100
  const r = larga ? 46 : 46
  const g = { cx: w / 2, cy: 50, r, ...f }
  const rotulo = titulo ? ` role="img" aria-label="${PRODUTO.nome}"` : ' aria-hidden="true"'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 100"${rotulo}><path fill="${cor}" d="${estrelaPath(g)}"/>${veus ? `<path fill="${cor}" opacity="0.5" d="${veusPath(g)}"/>` : ''}</svg>`
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

/** Ícone do app (1024): estrela compacta sobre grafite (ou papel), com um halo bem leve atrás do centro. */
export function icone({ claro = false } = {}) {
  const fundo = claro ? ['#ffffff', '#e9e9ee'] : ['#232327', '#08080a']
  const tinta = claro ? '#1d1d1f' : '#f5f5f7'
  const halo = claro ? '#000000' : '#ffffff'
  const id = claro ? 'aeon-claro' : 'aeon-escuro'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs><linearGradient id="${id}-fundo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fundo[0]}"/><stop offset="1" stop-color="${fundo[1]}"/></linearGradient>
<radialGradient id="${id}-halo"><stop offset="0" stop-color="${halo}" stop-opacity="${claro ? 0.06 : 0.16}"/><stop offset="1" stop-color="${halo}" stop-opacity="0"/></radialGradient></defs>
<rect x="100" y="100" width="824" height="824" rx="190" fill="url(#${id}-fundo)"/>
<rect x="100.5" y="100.5" width="823" height="823" rx="189.5" fill="none" stroke="${claro ? '#000' : '#fff'}" stroke-opacity="${claro ? 0.08 : 0.12}"/>
<circle cx="512" cy="512" r="250" fill="url(#${id}-halo)"/>
<path fill="${tinta}" d="${estrelaPath({ cx: 512, cy: 512, r: 300, ...FORMAS.compacta })}"/>
</svg>`
}

/** Favicon: a estrela compacta, clara sobre grafite. */
export const favicon = ({ cor = '#f5f5f7', fundo = '#121214' } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${fundo}"/><path fill="${cor}" d="${estrelaPath({ cx: 32, cy: 32, r: 24, ...FORMAS.compacta })}"/></svg>`
