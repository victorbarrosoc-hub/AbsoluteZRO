// RADION · marca (aprovada pelo titular em 06/11/2026: "leque em frente"). Uma fonte só para a geometria: este arquivo
// gera app/marca/*.svg e os PNG dos ícones. Rode `node scripts/marca.mjs` depois de mexer aqui.
//
// Construção, tudo em múltiplos da largura da lâmina (w): seis lâminas girando no mesmo rebite, uma a cada 18°, de
// 90° (em pé) a 0° (deitada), cada uma deitada sobre a anterior com um respiro de 0,22w (recortado, não pintado: a
// marca funciona sobre qualquer fundo). Pontas sobre R(t) = 6w + 1,5w·sen(πt). Rebite com raio 1,25w e o mesmo respiro.
// O sinal (titular, 07/11/2026: "um sinal de Wi-Fi, é um detalhe"): três arcos no quadrante oposto ao leque, centrados
// no rebite e na diagonal de baixo à esquerda, 78° cada, traço 0,38w, raios 1,97w · 2,78w · 3,59w, na cor do rebite.
// No ícone do app o rebite fica no centro exato (512, 512), na escala 3,55 (o desenho preenche mais o quadrado).
// Regra do titular (07/11/2026): o rebite, o círculo, é o centro da logo. Onde o símbolo aparece sozinho (ícone, favicon,
// imagem de compartilhamento) o círculo fica no centro exato do quadro.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

/** Favicon: o símbolo sozinho, com o rebite no centro do quadro (o círculo é o centro da logo) e a cor do tema. */
export function favicon() {
  const c = caixa()
  const m = 2
  const r = Math.max(-c.x0, c.x0 + c.w, -c.y0, c.y0 + c.h) + m
  const { defs, corpo } = leque(0, 0, 1, 'var(--rebite)', 'v')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(-r)} ${n(-r)} ${n(2 * r)} ${n(2 * r)}"><style>:root{--rebite:${GRAFITE}}@media (prefers-color-scheme:dark){:root{--rebite:${BRANCO}}}</style><defs>${defs}</defs>${corpo}</svg>\n`
}

/**
 * A imagem de compartilhamento (1200 × 630), "Ondas" (escolhida pelo titular, 07/11/2026). O rebite (o círculo) é o
 * centro da logo e fica no centro exato da imagem: no recorte quadrado do iPhone e do WhatsApp o símbolo continua no
 * meio. Em volta, anéis nas cores dos setores se espalham como o sinal do rádio e somem em cima e embaixo, onde ficam o
 * nome, a frase em Light × ExtraBold e uma linha do que é; a Absolute ZRO assina pequena no canto.
 */
export function og(fontes, zro) {
  const { defs, corpo } = leque(600, 315, 1.05, GRAFITE, 'o')
  const aneis = [150, 215, 290, 375, 470, 575, 690]
    .map((r, i) => `<circle cx="600" cy="315" r="${r}" fill="none" stroke="${CORES[i % 6]}" stroke-opacity="${n(0.6 - i * 0.065)}" stroke-width="${n(2.4 - i * 0.22)}"/>`)
    .join('')
  const some = `<linearGradient id="oa" x1="0" y1="0" x2="0" y2="630" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".22" stop-color="#fff"/><stop offset=".6" stop-color="#fff"/><stop offset=".78" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="om" maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="630"><rect width="1200" height="630" fill="url(#oa)"/></mask>`
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Figtree;font-weight:300 900;src:url('${fontes}/figtree-latin-wght-normal.woff2') format('woff2-variations')}
@font-face{font-family:Nunito;font-weight:200 1000;src:url('${fontes}/nunito-latin-wght-normal.woff2') format('woff2-variations')}
html,body{margin:0}
body{position:relative;width:1200px;height:630px;overflow:hidden;background:#fbfbfd;font-family:Figtree;color:#1d1d1f;-webkit-font-smoothing:antialiased}
svg{position:absolute;inset:0}
.nome{position:absolute;left:0;right:0;top:50px;text-align:center;font-family:Nunito;font-weight:850;font-size:42px;letter-spacing:-0.045em;line-height:1}
.zro{position:absolute;right:56px;top:58px;height:16px;opacity:.8}
.baixo{position:absolute;left:0;right:0;bottom:52px;display:flex;flex-direction:column;align-items:center}
h1{margin:0;font-size:66px;letter-spacing:-0.05em;line-height:.95;font-weight:300} h1 b{font-weight:800}
p{margin:12px 0 0;font-size:25px;color:#6e6e73}
</style></head><body>
<svg width="1200" height="630" viewBox="0 0 1200 630"><defs>${some}${defs}</defs><g mask="url(#om)">${aneis}</g>${corpo}</svg>
<div class="nome">radion</div>
<img class="zro" src="data:image/svg+xml;base64,${Buffer.from(zro).toString('base64')}" alt="Absolute ZRO">
<div class="baixo"><h1>stay <b>connected.</b></h1><p>O rádio do set no celular de cada equipe.</p></div>
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
    const zro = readFileSync(join(pasta, '../../../../apps/hub-web/public/brand/absolute-zro-grafite.svg'), 'utf8')
    writeFileSync(arq, og(pathToFileURL(join(pasta, '../../fontes')).href, zro))
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
