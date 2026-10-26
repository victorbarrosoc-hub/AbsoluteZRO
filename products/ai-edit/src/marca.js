// Marca AEON (by Absolute ZRO), aprovada pelo titular em 26/10/2026 a partir da proposta "Orbital Monolith": o
// wordmark ΛEON em traço fino geométrico (Λ sem travessa, E de três barras, O redondo, N) e o símbolo da órbita — um
// anel com uma interrupção precisa no alto à direita, onde a luz escapa. Geometria só aqui: o app, o site, o ícone e
// o OG desenham a partir destas funções (scripts/marca.mjs grava os arquivos de marca/).

const TRACO = 5.2

/** ΛEON em traço, cor única (currentColor por padrão). viewBox 0 0 520 104. */
export function wordmark({ cor = 'currentColor', traco = TRACO, titulo = 'AEON' } = {}) {
  const t = traco
  const h = t / 2
  const y0 = h
  const y1 = 104 - h
  const d = [
    // Λ
    `M${h} ${y1}L42 ${y0}L${84 - h} ${y1}`,
    // E: três barras iguais
    `M140 ${y0}H214M140 52H214M140 ${y1}H214`,
    // N
    `M${432 + h} ${y1}V${y0}L${510 - h} ${y1}V${y0}`,
  ].join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 104" role="img" aria-label="${titulo}"><title>${titulo}</title><g fill="none" stroke="${cor}" stroke-width="${t}" stroke-linejoin="miter" stroke-linecap="butt"><path d="${d}"/><circle cx="322" cy="52" r="${52 - h}"/></g></svg>`
}

/** Arco de círculo de `a0` a `a1` graus (0 = direita, sentido horário na tela). */
function arco(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)].map((v) => v.toFixed(2))
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  const grande = (a1 - a0 + 360) % 360 > 180 ? 1 : 0
  return `M${x0} ${y0}A${r} ${r} 0 ${grande} 1 ${x1} ${y1}`
}

/**
 * A órbita: anel cheio com uma interrupção em corte diagonal no alto à direita (uma faixa inclinada tirada do anel,
 * não um corte radial: as pontas ficam paralelas, como uma lâmina). viewBox 0 0 100 100.
 */
export function simbolo({ cor = 'currentColor', traco = 10, id = 'aeon-corte' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="AEON"><title>AEON</title><defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/>${CORTE}</mask></defs><circle cx="50" cy="50" r="${(40 - traco / 2).toFixed(2)}" fill="none" stroke="${cor}" stroke-width="${traco}" mask="url(#${id})"/></svg>`
}

// a faixa do corte: atravessa o anel no alto à direita, inclinada 20° em relação ao raio
const CORTE = '<rect x="-3.2" y="-30" width="6.4" height="60" fill="#000" transform="translate(73.5 26.5) rotate(25)"/>'

/**
 * Ícone do app (1024): grafite profundo com a órbita em metal líquido e a luz escapando pelo corte. É o único lugar com
 * degradê: metal pede reflexo; texto e interface seguem sem degradê.
 */
export function icone() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs>
<linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26262b"/><stop offset="1" stop-color="#0b0b0d"/></linearGradient>
<linearGradient id="metal" x1="0.1" y1="0.05" x2="0.9" y2="0.95"><stop offset="0" stop-color="#ffffff"/><stop offset="0.2" stop-color="#a3a4ac"/><stop offset="0.42" stop-color="#f6f6f8"/><stop offset="0.6" stop-color="#55565e"/><stop offset="0.8" stop-color="#dcdde2"/><stop offset="1" stop-color="#6a6b73"/></linearGradient>
<radialGradient id="luz" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset="0.18" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
<filter id="sombra" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter>
<mask id="corte" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/><g transform="translate(150 150) scale(7.24)">${CORTE}</g></mask>
</defs>
<rect x="100" y="100" width="824" height="824" rx="190" fill="url(#fundo)"/>
<rect x="100.5" y="100.5" width="823" height="823" rx="189.5" fill="none" stroke="#ffffff" stroke-opacity="0.12"/>
<g mask="url(#corte)">
<circle cx="512" cy="530" r="253" fill="none" stroke="#000" stroke-opacity="0.65" stroke-width="72" filter="url(#sombra)"/>
<circle cx="512" cy="512" r="253" fill="none" stroke="url(#metal)" stroke-width="72"/>
<circle cx="506" cy="506" r="283" fill="none" stroke="#ffffff" stroke-opacity="0.32" stroke-width="3"/>
</g>
<ellipse cx="682" cy="342" rx="150" ry="150" fill="url(#luz)" opacity="0.9"/>
</svg>`
}

/** Wordmark empilhado "ΛEON / BY ABSOLUTE ZRO" (assinatura do site e do OG). */
export function assinatura({ cor = 'currentColor' } = {}) {
  return wordmark({ cor })
}
