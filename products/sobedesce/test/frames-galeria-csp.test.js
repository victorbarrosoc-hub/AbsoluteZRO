// Frames "Da galeria" no celular com a CSP do /app/ de produção (web/next.config.ts): o vídeo escolhido na galeria
// abre por um endereço blob: num <video> (web/public/app/lib/frames/celular.js › abrirVideo). Com `media-src 'self'`
// sozinho, o blob: é recusado (a CSP não conta blob: como 'self') e os Frames da galeria nunca abriam. A CSP deixa
// `blob:` (só a própria página cria esses endereços); o resto do media-src continua 'self'. Sem Playwright ou ffmpeg,
// fica de fora.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const APP = fileURLToPath(new URL('../web/public/app/', import.meta.url))
let chromium = null
try {
  chromium = createRequire(import.meta.url)('playwright').chromium
} catch {
  try {
    chromium = createRequire(path.join(process.env.NODE_PATH || '/nada', 'x.js'))('playwright').chromium
  } catch {}
}
const temFfmpeg = (() => {
  try {
    return spawnSync('ffmpeg', ['-version']).status === 0
  } catch {
    return false
  }
})()

/** A CSP do /app/ em produção, lida do next.config.ts (a página tem que funcionar com ela). */
function cspDoApp() {
  const cfg = fs.readFileSync(fileURLToPath(new URL('../web/next.config.ts', import.meta.url)), 'utf8')
  const bloco = /const appCsp = \[([\s\S]*?)\]\.join\("; "\)/.exec(cfg)[1]
  const connect = JSON.parse(/const appConnect = (\[[^\]]*\])/.exec(cfg)[1])
  const img = JSON.parse(/const appImg = (\[[^\]]*\])/.exec(cfg)[1].replace('ZRO', '"https://absolutezro.com"'))
  return [...bloco.matchAll(/^\s*(?:"([^"]+)"|`([^`]+)`),?$/gm)]
    .map((m) => m[1] ?? m[2])
    .map((d) => d.replace('${appConnect.join(" ")}', connect.join(' ')).replace('${appImg.join(" ")}', img.join(' ')))
    .join('; ')
}

test('a CSP do app deixa o <video> abrir blob: (galeria) e mais nenhuma origem de mídia', () => {
  const media = cspDoApp()
    .split('; ')
    .find((d) => d.startsWith('media-src '))
  assert.equal(media, "media-src 'self' blob:")
})

let servidor
after(() => servidor?.close())

test('Frames da galeria: o vídeo do aparelho abre com a CSP do app', { skip: (!chromium || !temFfmpeg) && 'sem Playwright ou ffmpeg', timeout: 60_000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sobedesce-galeria-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  // VP9 em WebM: o Chromium do Playwright não toca H.264 no <video> (o iPhone toca os dois)
  const arquivo = path.join(dir, 'galeria.webm')
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-t', '2', '-c:v', 'libvpx-vp9', '-b:v', '300k', arquivo])
  assert.equal(r.status, 0, String(r.stderr))
  const video = fs.readFileSync(arquivo)
  const csp = cspDoApp()
  servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/app/teste.html')
      return res
        .writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': csp })
        .end(`<!doctype html><meta charset="utf-8"><body><script type="module" src="./teste.js"></script></body>`)
    if (url.pathname === '/app/teste.js')
      return res.writeHead(200, { 'Content-Type': 'text/javascript', 'Content-Security-Policy': csp }).end(`
        import { abrirVideo } from './lib/frames/celular.js'
        window.resultado = fetch('./galeria.webm').then((r) => r.blob()).then((b) => abrirVideo(URL.createObjectURL(new File([b], 'IMG_0001.webm', { type: 'video/webm' })), { prazoMs: 15000 }))
          .then((v) => ({ largura: v.videoWidth, duracao: v.duration }), (e) => ({ erro: String(e && e.message || e) }))
      `)
    if (url.pathname === '/app/galeria.webm') return res.writeHead(200, { 'Content-Type': 'video/webm' }).end(video)
    const f = path.join(APP, decodeURIComponent(url.pathname.replace(/^\/app\//, '')))
    if (!f.startsWith(APP) || !fs.existsSync(f)) return res.writeHead(404).end()
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Content-Security-Policy': csp }).end(fs.readFileSync(f))
  })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const nav = await chromium.launch()
  t.after(() => nav.close())
  const p = await nav.newPage()
  const violacoes = []
  p.on('console', (m) => /Content Security Policy/i.test(m.text()) && violacoes.push(m.text()))
  await p.goto(`http://127.0.0.1:${servidor.address().port}/app/teste.html`)
  const res = await p.evaluate(() => window.resultado)
  assert.equal(res.erro, undefined, `${res.erro} ${violacoes.join(' | ')}`)
  assert.equal(res.largura, 320)
  assert.ok(res.duracao > 1.5)
  assert.deepEqual(violacoes, [])
})
