// RADION · marca (aprovada pelo titular em 06/11/2026: "leque em frente"). Uma fonte só para a geometria: este arquivo
// gera app/marca/*.svg e os PNG dos ícones. Rode `node scripts/marca.mjs` depois de mexer aqui.
//
// Construção, tudo em múltiplos da largura da lâmina (w): seis lâminas girando no mesmo rebite, uma a cada 18°, de
// 90° (em pé) a 0° (deitada), cada uma deitada sobre a anterior com um respiro de 0,22w (recortado, não pintado: a
// marca funciona sobre qualquer fundo). Pontas sobre R(t) = 6w + 1,5w·sen(πt). Rebite com raio 1,25w e o mesmo respiro.
// No ícone do app o rebite fica no centro exato (512, 512).

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CORES = ['#FFB300', '#FF6B1A', '#E6195C', '#6C4DF5', '#0A8CFF', '#12B76A']
export const GRAFITE = '#1d1d1f'
export const BRANCO = '#f5f5f7'
const W = 16
const G = 0.22 * W
const REB = 1.25 * W
const INI = 1.2 * W
const R = (i) => 6 * W + 1.5 * W * Math.sin((Math.PI * i) / 5)
const rad = (g) => (g * Math.PI) / 180
const n = (v) => Math.round(v * 100) / 100

/** As lâminas e o rebite em volta de (cx, cy), escala k. `id` separa as máscaras quando há mais de um no mesmo SVG. */
export function leque(cx, cy, k, rebite, id = 'r') {
  const linha = (i, larg, cor) => {
    const a = rad(-90 + i * 18)
    const r0 = INI * k
    const r1 = R(i) * k - (W * k) / 2
    return `<line x1="${n(cx + r0 * Math.cos(a))}" y1="${n(cy + r0 * Math.sin(a))}" x2="${n(cx + r1 * Math.cos(a))}" y2="${n(cy + r1 * Math.sin(a))}" stroke="${cor}" stroke-width="${n(larg)}" stroke-linecap="round"/>`
  }
  const furo = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n((REB + G) * k)}" fill="#000"/>`
  let defs = ''
  let corpo = ''
  for (let i = 0; i < 6; i++) {
    // a lâmina i perde o que as seguintes (e o rebite) cobrem, com o respiro
    const cortes = Array.from({ length: 5 - i }, (_, j) => linha(i + 1 + j, W * k + 2 * G * k, '#000')).join('')
    defs += `<mask id="${id}${i}" maskUnits="userSpaceOnUse" x="${n(cx - 20 * W * k)}" y="${n(cy - 20 * W * k)}" width="${n(40 * W * k)}" height="${n(40 * W * k)}"><rect x="${n(cx - 20 * W * k)}" y="${n(cy - 20 * W * k)}" width="${n(40 * W * k)}" height="${n(40 * W * k)}" fill="#fff"/>${cortes}${furo}</mask>`
    corpo += `<g mask="url(#${id}${i})">${linha(i, W * k, CORES[i])}</g>`
  }
  return { defs, corpo: corpo + `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(REB * k)}" fill="${rebite}"/>` }
}

/** Caixa justa do símbolo com o rebite na origem. */
function caixa() {
  const e = REB + G
  let x1 = 0
  let y0 = 0
  for (let i = 0; i < 6; i++) {
    const a = rad(-90 + i * 18)
    const r = R(i) - W / 2
    x1 = Math.max(x1, r * Math.cos(a) + W / 2)
    y0 = Math.min(y0, r * Math.sin(a) - W / 2)
  }
  return { x0: -e, y0, w: x1 + e, h: e - y0 }
}

export function simbolo(rebite = GRAFITE) {
  const c = caixa()
  const { defs, corpo } = leque(0, 0, 1, rebite, 's')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(c.x0)} ${n(c.y0)} ${n(c.w)} ${n(c.h)}" role="img" aria-label="RADION"><defs>${defs}</defs>${corpo}</svg>\n`
}

/** Ícone do app (1024): fundo claro ou escuro, rebite no centro. */
export function icone(escuro = false) {
  const fundo = escuro ? ['#232326', '#0b0b0c'] : ['#ffffff', '#f0f0f4']
  const { defs, corpo } = leque(512, 512, 3.25, escuro ? BRANCO : GRAFITE, 'i')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="RADION"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fundo[0]}"/><stop offset="1" stop-color="${fundo[1]}"/></linearGradient>${defs}</defs><rect width="1024" height="1024" rx="228" fill="url(#f)"/>${corpo}</svg>\n`
}

/** Favicon: o símbolo sozinho, com o rebite que acompanha o tema do sistema. */
export function favicon() {
  const c = caixa()
  const m = 2
  const { defs, corpo } = leque(0, 0, 1, 'var(--rebite)', 'v')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(c.x0 - m)} ${n(c.y0 - m)} ${n(c.w + 2 * m)} ${n(c.h + 2 * m)}"><style>:root{--rebite:${GRAFITE}}@media (prefers-color-scheme:dark){:root{--rebite:${BRANCO}}}</style><defs>${defs}</defs>${corpo}</svg>\n`
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const pasta = join(dirname(fileURLToPath(import.meta.url)), '../app/marca')
  mkdirSync(pasta, { recursive: true })
  const svgs = {
    'radion-simbolo.svg': simbolo(GRAFITE),
    'radion-simbolo-branco.svg': simbolo(BRANCO),
    'radion-icone.svg': icone(false),
    'radion-icone-escuro.svg': icone(true),
    'favicon.svg': favicon(),
  }
  for (const [f, s] of Object.entries(svgs)) writeFileSync(join(pasta, f), s)
  // PNG para a Tela de Início do iPhone e o manifesto (o SVG não serve ali)
  const { chromium } = await import('playwright')
  const b = await chromium.launch()
  const p = await b.newPage()
  for (const [tam, nome] of [[180, 'radion-180.png'], [192, 'radion-192.png'], [512, 'radion-512.png']]) {
    await p.setViewportSize({ width: tam, height: tam })
    // o ícone do iPhone e do Android é quadrado: o sistema arredonda
    await p.setContent(`<html><body style="margin:0;background:transparent">${icone(false).replace('rx="228"', 'rx="0"').replace('<svg ', `<svg width="${tam}" height="${tam}" `)}</body></html>`)
    await p.screenshot({ path: join(pasta, nome), omitBackground: true })
  }
  await b.close()
  console.log('app/marca pronta')
}
