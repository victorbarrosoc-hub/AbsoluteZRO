// RADION · marca (aprovada pelo titular em 06/11/2026: "leque em frente"). Uma fonte só para a geometria: este arquivo
// gera app/marca/*.svg e os PNG dos ícones. Rode `node scripts/marca.mjs` depois de mexer aqui.
//
// Construção, tudo em múltiplos da largura da lâmina (w): seis lâminas girando no mesmo rebite, uma a cada 18°, de
// 90° (em pé) a 0° (deitada), cada uma deitada sobre a anterior com um respiro de 0,22w (recortado, não pintado: a
// marca funciona sobre qualquer fundo). Pontas sobre R(t) = 6w + 1,5w·sen(πt). Rebite com raio 1,25w e o mesmo respiro.
// O sinal (titular, 07/11/2026: "um sinal de Wi-Fi, é um detalhe"): três arcos no quadrante oposto ao leque, centrados
// no rebite e na diagonal de baixo à esquerda, 78° cada, traço 0,38w, raios 1,97w · 2,78w · 3,59w, na cor do rebite.
// No ícone do app o rebite fica no centro exato (512, 512), na escala 3,55 (o desenho preenche mais o quadrado).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
// o sinal: a base 2,1 · 3,05 · 4,0w encolhida a 85% a partir da borda do rebite (1,25w)
const SINAL_RAIOS = [2.1, 3.05, 4.0].map((x) => 1.25 + (x - 1.25) * 0.85)
const SINAL_TRACO = 0.38 * W
const SINAL_DE = 135 - 39
const SINAL_ATE = 135 + 39
const ICONE_K = 3.55

/** Os três arcos do sinal em volta de (cx, cy), escala k. */
function sinal(cx, cy, k, cor) {
  return SINAL_RAIOS.map((x) => {
    const r = x * W * k
    const p = (g) => `${n(cx + r * Math.cos(rad(g)))} ${n(cy + r * Math.sin(rad(g)))}`
    return `<path d="M${p(SINAL_DE)} A${n(r)} ${n(r)} 0 0 1 ${p(SINAL_ATE)}" fill="none" stroke="${cor}" stroke-width="${n(SINAL_TRACO * k)}" stroke-linecap="round"/>`
  }).join('')
}

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
  return { defs, corpo: sinal(cx, cy, k, rebite) + corpo + `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(REB * k)}" fill="${rebite}"/>` }
}

/** Caixa justa do símbolo com o rebite na origem (o leque em cima à direita, o sinal embaixo à esquerda). */
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
  let x0 = -e
  let y1 = e
  for (let g = SINAL_DE; g <= SINAL_ATE; g += 1) {
    const r = SINAL_RAIOS[2] * W + SINAL_TRACO / 2
    x0 = Math.min(x0, r * Math.cos(rad(g)))
    y1 = Math.max(y1, r * Math.sin(rad(g)))
  }
  return { x0, y0, w: x1 - x0, h: y1 - y0 }
}

export function simbolo(rebite = GRAFITE) {
  const c = caixa()
  const { defs, corpo } = leque(0, 0, 1, rebite, 's')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(c.x0)} ${n(c.y0)} ${n(c.w)} ${n(c.h)}" role="img" aria-label="RADION"><defs>${defs}</defs>${corpo}</svg>\n`
}

/** Ícone do app (1024): fundo claro ou escuro, rebite no centro. */
export function icone(escuro = false) {
  const fundo = escuro ? ['#232326', '#0b0b0c'] : ['#ffffff', '#f0f0f4']
  const { defs, corpo } = leque(512, 512, ICONE_K, escuro ? BRANCO : GRAFITE, 'i')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="RADION"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fundo[0]}"/><stop offset="1" stop-color="${fundo[1]}"/></linearGradient>${defs}</defs><rect width="1024" height="1024" rx="228" fill="url(#f)"/>${corpo}</svg>\n`
}

/** Favicon: o símbolo sozinho, com o rebite que acompanha o tema do sistema. */
export function favicon() {
  const c = caixa()
  const m = 2
  const { defs, corpo } = leque(0, 0, 1, 'var(--rebite)', 'v')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(c.x0 - m)} ${n(c.y0 - m)} ${n(c.w + 2 * m)} ${n(c.h + 2 * m)}"><style>:root{--rebite:${GRAFITE}}@media (prefers-color-scheme:dark){:root{--rebite:${BRANCO}}}</style><defs>${defs}</defs>${corpo}</svg>\n`
}

/**
 * A imagem de compartilhamento (1200 × 630), no padrão dos apps da Absolute ZRO (Relay, Maestro): fundo claro, o
 * símbolo grande, a frase em Light × ExtraBold e o ícone com o nome embaixo. A luz atrás vem das cores dos setores.
 */
export function og(fontes) {
  const c = caixa()
  const alt = 210
  const larg = (c.w * alt) / c.h
  const { defs, corpo } = leque(0, 0, 1, GRAFITE, 'o')
  const luz = CORES.map((cor, i) => `radial-gradient(circle at ${18 + i * 13}% ${i % 2 ? 30 : 44}%, ${cor}1f, transparent 34%)`).join(',')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Figtree;font-weight:300 900;src:url('${fontes}/figtree-latin-wght-normal.woff2') format('woff2-variations')}
@font-face{font-family:Nunito;font-weight:200 1000;src:url('${fontes}/nunito-latin-wght-normal.woff2') format('woff2-variations')}
html,body{margin:0}
body{width:1200px;height:630px;background:${luz},#f5f5f7;font-family:Figtree;color:#1d1d1f;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;-webkit-font-smoothing:antialiased}
h1{margin:0;font-size:92px;letter-spacing:-0.05em;line-height:1}
h1 span{font-weight:300} h1 b{font-weight:800} h1 i{font-style:normal;font-weight:800;color:#0a8cff}
.assina{display:flex;align-items:center;gap:12px;font-family:Nunito;font-weight:850;font-size:30px;letter-spacing:-0.04em}
.assina img{width:46px;height:46px;border-radius:11px;box-shadow:0 6px 14px -8px rgba(0,0,0,.35)}
</style></head><body>
<svg width="${larg}" height="${alt}" viewBox="${n(c.x0)} ${n(c.y0)} ${n(c.w)} ${n(c.h)}"><defs>${defs}</defs>${corpo}</svg>
<h1><span>stay</span> <b>connected</b><i>.</i></h1>
<div class="assina"><img src="data:image/svg+xml;base64,${Buffer.from(icone(false)).toString('base64')}" alt="">radion</div>
</body></html>`
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
  // a imagem de compartilhamento (precisa das fontes de verdade: abre de um arquivo)
  const tmp = mkdtempSync(join(tmpdir(), 'radion-og-'))
  try {
    const arq = join(tmp, 'og.html')
    writeFileSync(arq, og(pathToFileURL(join(pasta, '../../fontes')).href))
    await p.setViewportSize({ width: 1200, height: 630 })
    await p.goto(pathToFileURL(arq).href)
    await p.evaluate(() => document.fonts.ready)
    await p.screenshot({ path: join(pasta, 'og.png') })
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  await b.close()
  console.log('app/marca pronta')
}
