// Plataforma de fotos (id `foto`) · marca, PROPOSTA (ADR 0044; o titular ainda não aprovou nome nem símbolo). Uma fonte
// só para a geometria: este arquivo gera app/marca/*.svg, os PNG dos ícones e a imagem de compartilhamento.
// Rode `node scripts/marca.mjs` (ou `npm run marca`) depois de mexer aqui; precisa do Chromium do Playwright.
//
// A ideia: o anel é o O da Absolute ZRO; um único raio horizontal atravessa o anel inteiro e sai um pouco para fora do
// traço dos dois lados, com as pontas afiladas como as pontas horizontais da centelha da marca-mãe. Lente e luz.
// Uma cor só (grafite no claro, branco no escuro), sem degradê, sem brilho, sem sombra (docs/marca/README.md).
//
// Construção, na mesma régua do símbolo da Absolute ZRO (packages/ui/src/marca.ts, caixa de 100), com w = traço do anel:
// - anel: raio médio 30, traço w = 8,6 (o mesmo O: 34,3 por fora, 25,7 por dentro);
// - raio: meia-largura 48 (sobra 13,7 = 1,6w para fora do traço), espessura 3,6 (0,42w), constante por dentro do anel;
//   a ponta é côncava e começa em 33,6, escondida no traço: por fora só aparece a ponta afilando até o fim;
// - o centro do anel é o centro da marca: no ícone, no favicon e na imagem de compartilhamento ele fica no centro exato.
// Abaixo de 20 px (favicon) vale a forma reforçada: traço do anel 11, raio 6,8 com ponta redonda, sem afilar.
// Os arquivos não levam o nome (icone.svg, simbolo.svg, og.png): ele é provisório e mora só em app/nome.js, de onde
// vem para a imagem de compartilhamento. Trocou o nome? Rode de novo. O ícone do HUB (fechado, fora de public/) é cópia
// de app/marca/icone.svg em apps/hub-web/marca-fechada/foto.svg, com a linha igual em apps/hub-web/lib/marca-fechada.ts.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ASSINATURA, NOME } from '../app/nome.js'

export const GRAFITE = '#1d1d1f'
export const BRANCO = '#f5f5f7'
const W = 8.6
const R = 30
const RAIO_L = 48
const RAIO_T = 3.6
const RAIO_A = 33.6
const REFORCO = { r: 29, w: 11, l: 48, t: 6.8 }
const ICONE_K = 7.4
const n = (v) => Math.round(v * 100) / 100

/** Um círculo fechado em volta de (cx, cy); `horario` decide o sentido (o furo do anel vai ao contrário). */
function circulo(cx, cy, r, horario) {
  const s = horario ? 1 : 0
  return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 ${s} ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 ${s} ${n(-2 * r)} 0Z`
}

/**
 * O raio: espessura constante por dentro do anel e, de cada lado, uma ponta côncava como as da centelha. A quina onde a
 * ponta começa fica escondida dentro do traço: por fora só se vê a ponta saindo do anel.
 */
function raio(cx, cy, k) {
  const l = RAIO_L * k
  const h = (RAIO_T * k) / 2
  const a = RAIO_A * k
  const p = l - a
  const x = (v) => n(cx + v)
  const y = (v) => n(cy + v)
  // do miolo até a ponta (s = 1 à direita, -1 à esquerda) e de volta pelo outro lado (v = -1 em cima, 1 embaixo)
  const ida = (s, v) => `C${x(s * (a + p * 0.4))} ${y(v * h * 0.45)} ${x(s * (l - p * 0.4))} ${y(v * h * 0.05)} ${x(s * l)} ${y(0)}`
  const volta = (s, v) => `C${x(s * (l - p * 0.4))} ${y(v * h * 0.05)} ${x(s * (a + p * 0.4))} ${y(v * h * 0.45)} ${x(s * a)} ${y(v * h)}`
  return `M${x(a)} ${y(-h)}${ida(1, -1)}${volta(1, 1)}L${x(-a)} ${y(h)}${ida(-1, 1)}${volta(-1, -1)}Z`
}

/** O desenho inteiro num caminho só (anel + raio), em volta de (cx, cy), escala k. Preenchimento comum (nonzero). */
export function desenho(cx = 0, cy = 0, k = 1) {
  return circulo(cx, cy, (R + W / 2) * k, true) + circulo(cx, cy, (R - W / 2) * k, false) + raio(cx, cy, k)
}

/** A forma reforçada, para menos de 20 px: anel mais grosso e raio reto de ponta redonda. */
export function desenhoReforcado(cor) {
  const { r, w, l, t } = REFORCO
  return `<circle r="${r}" fill="none" stroke="${cor}" stroke-width="${w}"/><rect x="${-l}" y="${n(-t / 2)}" width="${2 * l}" height="${t}" rx="${n(t / 2)}" fill="${cor}"/>`
}

/** O símbolo sozinho, na caixa justa (o anel no centro). */
export function simbolo(cor = GRAFITE) {
  const h = R + W / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-RAIO_L} ${n(-h)} ${2 * RAIO_L} ${n(2 * h)}"><path fill="${cor}" d="${desenho()}"/></svg>\n`
}

/** Ícone do app (1024): azulejo grafite da família, chapado, com o símbolo em branco e o anel no centro. */
export function icone() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="228" fill="${GRAFITE}"/><path fill="${BRANCO}" d="${desenho(512, 512, ICONE_K)}"/></svg>\n`
}

/** Favicon: a forma reforçada, com a cor do tema. */
export function favicon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100"><style>:root{--cor:${GRAFITE}}@media (prefers-color-scheme:dark){:root{--cor:${BRANCO}}}</style>${desenhoReforcado('var(--cor)')}</svg>\n`
}

/**
 * A imagem de compartilhamento (1200 × 630): o símbolo no centro exato (no recorte quadrado do iPhone e do WhatsApp ele
 * continua no meio), o raio seguindo como um fio que some perto do símbolo e chega às bordas, o nome em cima, a assinatura em Light × ExtraBold e uma
 * linha do que é; a Absolute ZRO assina pequena no canto. Só sai pelo gate: app fechado não tem OG público.
 */
export function og(fontes, zro) {
  const palavras = ASSINATURA.split(' ')
  const corte = Math.max(1, palavras.length - 2)
  const fina = palavras.slice(0, corte).join(' ')
  const forte = palavras.slice(corte).join(' ')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Figtree;font-weight:300 900;src:url('${fontes}/figtree-latin-wght-normal.woff2') format('woff2-variations')}
html,body{margin:0}
body{position:relative;width:1200px;height:630px;overflow:hidden;background:#fbfbfd;font-family:Figtree;color:${GRAFITE};-webkit-font-smoothing:antialiased}
svg{position:absolute;inset:0}
.nome{position:absolute;left:0;right:0;top:56px;text-align:center;font-weight:800;font-size:30px;letter-spacing:.3em;text-indent:.3em;line-height:1}
.zro{position:absolute;right:56px;top:62px;height:16px;opacity:.8}
.baixo{position:absolute;left:0;right:0;bottom:54px;display:flex;flex-direction:column;align-items:center}
h1{margin:0;font-size:64px;letter-spacing:-0.045em;line-height:1;font-weight:300} h1 b{font-weight:800}
p{margin:14px 0 0;font-size:25px;color:#6e6e73}
</style></head><body>
<svg width="1200" height="630" viewBox="0 0 1200 630"><defs><linearGradient id="fio" x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c7c7cc"/><stop offset=".34" stop-color="#c7c7cc" stop-opacity="0"/><stop offset=".66" stop-color="#c7c7cc" stop-opacity="0"/><stop offset="1" stop-color="#c7c7cc"/></linearGradient></defs><rect x="0" y="314.25" width="1200" height="1.5" fill="url(#fio)"/><path fill="${GRAFITE}" d="${desenho(600, 315, 2.5)}"/></svg>
<div class="nome">${NOME}</div>
<img class="zro" src="data:image/svg+xml;base64,${Buffer.from(zro).toString('base64')}" alt="Absolute ZRO">
<div class="baixo"><h1>${fina} <b>${forte}</b></h1><p>Decupagem, revelação RAW e predefinições, no aparelho.</p></div>
</body></html>`
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const pasta = join(dirname(fileURLToPath(import.meta.url)), '../app/marca')
  mkdirSync(pasta, { recursive: true })
  const svgs = {
    'simbolo.svg': simbolo(GRAFITE),
    'simbolo-branco.svg': simbolo(BRANCO),
    'icone.svg': icone(),
    'favicon.svg': favicon(),
  }
  for (const [f, s] of Object.entries(svgs)) writeFileSync(join(pasta, f), s)
  // PNG para a Tela de Início do iPhone e o manifesto (o SVG não serve ali)
  const { chromium } = await import('playwright')
  const b = await chromium.launch()
  const p = await b.newPage()
  for (const [tam, arq] of [[180, 'icone-180.png'], [192, 'icone-192.png'], [512, 'icone-512.png']]) {
    await p.setViewportSize({ width: tam, height: tam })
    // o ícone do iPhone e do Android é quadrado: o sistema arredonda
    await p.setContent(`<html><body style="margin:0;background:transparent">${icone().replace('rx="228"', 'rx="0"').replace('<svg ', `<svg style="display:block" width="${tam}" height="${tam}" `)}</body></html>`)
    await p.screenshot({ path: join(pasta, arq), omitBackground: true })
  }
  // a imagem de compartilhamento (precisa da fonte de verdade: abre de um arquivo)
  const tmp = mkdtempSync(join(tmpdir(), 'foto-og-'))
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
