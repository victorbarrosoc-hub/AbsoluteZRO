// Rift Motion · monta o site de rift.absolutezro.com em publico/ (o buildCommand da Vercel). A fonte da página é
// prototipo.html (o mesmo arquivo publicado como Artifact): aqui ganha o <head> de verdade (título, descrição, ícones,
// OG), os scripts viram arquivos (a CSP não aceita script inline), o three.js e a Figtree saem do próprio site (nada de
// CDN de terceiros) e a marca vem de marca/.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(fileURLToPath(import.meta.url))
const saida = join(raiz, 'publico')
let html = readFileSync(join(raiz, 'prototipo.html'), 'utf8')

const tirar = (re, nome) => {
  const m = re.exec(html)
  if (!m) throw new Error(`publicar: não achei ${nome} no prototipo.html`)
  html = html.replace(m[0], '')
  return m
}

// <title> e <meta> do Artifact saem; o <head> é montado abaixo
tirar(/<title>[^<]*<\/title>\n/, 'o título')
tirar(/<meta name="claude:viewport-fit-sides"[^>]*>\n/, 'o meta do Artifact')
// Google Fonts sai: a Figtree vem de /fontes (as outras famílias caem nas do sistema)
tirar(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\n/, 'o preconnect das fontes')
const fonteGoogle = tirar(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\n/, 'o link das fontes')
void fonteGoogle
// scripts inline viram arquivos
const tema = tirar(/<script>\n(\/\/ antes de pintar[\s\S]*?)<\/script>\n/, 'o script do tema')[1]
const app = tirar(/<script>\n(\(\(\) => \{[\s\S]*?)<\/script>\s*$/, 'o script do app')[1]
html = html.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>', '<script src="/vendor/three-r128.min.js"></script>\n<script src="/app.js"></script>')
if (html.includes('cdnjs.cloudflare.com')) throw new Error('publicar: sobrou script de CDN')

const FONTES = `@font-face { font-family: 'Figtree Variable'; font-style: normal; font-display: swap; font-weight: 300 900; src: url('/fontes/figtree-latin-wght-normal.woff2') format('woff2-variations'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: 'Figtree Variable'; font-style: normal; font-display: swap; font-weight: 300 900; src: url('/fontes/figtree-latin-ext-wght-normal.woff2') format('woff2-variations'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
`
html = html.replace('<style>\n', `<style>\n${FONTES}`)
html = html.replaceAll("'Figtree', 'Inter', system-ui, sans-serif", "'Figtree Variable', system-ui, sans-serif")
html = html.replaceAll("'Inter', -apple-system", '-apple-system')
html = html.replaceAll("'Geist Mono', ui-monospace", 'ui-monospace')
// dentro de strings com aspas simples do JS: o nome da fonte vai entre aspas duplas
const js = app.replaceAll('Figtree, system-ui, sans-serif', '"Figtree Variable", system-ui, sans-serif')

const DESCRICAO = 'Motion design 2D e 3D na mesma timeline. Som com o NOSSOM, exportação com o Relay. Da Absolute ZRO.'
const head = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Rift Motion · Do plano ao espaço.</title>
<meta name="description" content="${DESCRICAO}">
<meta name="theme-color" content="#0b0b0c">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fontes/figtree-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Rift Motion">
<meta property="og:title" content="Rift Motion · Do plano ao espaço.">
<meta property="og:description" content="${DESCRICAO}">
<meta property="og:url" content="https://rift.absolutezro.com/">
<meta property="og:image" content="https://rift.absolutezro.com/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<script src="/tema.js"></script>
<style>html, body { margin: 0; } :root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); } img { max-width: 100%; } [hidden] { display: none !important; }</style>
`
rmSync(saida, { recursive: true, force: true })
mkdirSync(join(saida, 'vendor'), { recursive: true })
writeFileSync(join(saida, 'index.html'), head + html.replace(/^\s+/, '') + '\n</html>\n')
writeFileSync(join(saida, 'tema.js'), tema)
writeFileSync(join(saida, 'app.js'), js)
cpSync(join(raiz, 'vendor/three-r128.min.js'), join(saida, 'vendor/three-r128.min.js'))
cpSync(join(raiz, 'fontes'), join(saida, 'fontes'), { recursive: true })
cpSync(join(raiz, 'marca/favicon.svg'), join(saida, 'favicon.svg'))
cpSync(join(raiz, 'marca/rift-icone-180.png'), join(saida, 'apple-touch-icon.png'))
cpSync(join(raiz, 'marca/og.png'), join(saida, 'og.png'))
cpSync(join(raiz, 'marca'), join(saida, 'marca'), { recursive: true, filter: (f) => !f.endsWith('.py') && !f.includes('__pycache__') })
console.log('publico/ pronto')
