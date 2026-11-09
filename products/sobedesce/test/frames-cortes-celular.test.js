// (base copiada de test/montagens-celular-navegador.test.js) Montagens no app do celular (web/public/app/components/montagens.js), num navegador de verdade com cara de iPhone
// (Chromium e, se tiver, o WebKit do Playwright): Estúdio › Montagens, três fotos da galeria, o carrossel contínuo e a
// grade do perfil saem nas imagens certas (tamanho e quantidade, pela folha de compartilhar do iPhone) e, com um take,
// o vídeo sai em MP4 H.264 no tamanho do formato (conferido pelo ffprobe). A conta e o Drive são de mentira, nada sai
// para a internet. Sem Playwright (ou sem ffmpeg para o take), fica de fora. MONTAGENS_FOTOS=<pasta> grava as telas.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { makePng } from './mock-drive.js'

const APP = fileURLToPath(new URL('../web/public/app/', import.meta.url))
let pw = null
try {
  pw = createRequire(import.meta.url)('playwright')
} catch {
  try {
    pw = createRequire(path.join(process.env.NODE_PATH || '/nada', 'x.js'))('playwright')
  } catch {}
}
const tem = (cmd) => {
  try {
    return spawnSync(cmd, ['-version'], { encoding: 'utf8' }).status === 0
  } catch {
    return false
  }
}
const comFfmpeg = tem('ffmpeg') && tem('ffprobe')
const FOTOS = process.env.MONTAGENS_FOTOS || null

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
let servidor = null
let base = ''
after(() => servidor?.close())
async function servir() {
  if (servidor) return
  servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    let f = path.join(APP, decodeURIComponent(url.pathname.replace(/^\/app\//, '')))
    if (!f.startsWith(APP)) return res.writeHead(403).end()
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html')
    if (!fs.existsSync(f)) return res.writeHead(404).end()
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }).end(fs.readFileSync(f))
  })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${servidor.address().port}`
}

async function contexto(nav, motor) {
  const ctx = await nav.newContext({
    ...(motor === 'webkit' ? pw.devices['iPhone 15 Pro'] : { userAgent: pw.devices['iPhone 15 Pro'].userAgent, isMobile: true, hasTouch: true }),
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    serviceWorkers: 'block',
  })
  // a folha de compartilhar do iPhone: guarda os arquivos para o teste conferir
  await ctx.addInitScript(() => {
    window.__compartilhados = []
    navigator.canShare = () => true
    navigator.share = async ({ files }) => {
      const lidos = []
      for (const f of files) lidos.push({ nome: f.name, tipo: f.type, bytes: Array.from(new Uint8Array(await f.arrayBuffer())) })
      window.__compartilhados = lidos
    }
  })
  await ctx.route(`${base}/api/**`, (r) => {
    const u = new URL(r.request().url()).pathname
    if (u.endsWith('/api/eu'))
      return r.fulfill({ json: { usuario: { id: 'u1', nome: 'Lia', email: 'lia@exemplo.com' }, contas: [{ id: 'g1', email: 'lia@exemplo.com', nome: 'Lia', fotoUrl: null, estado: 'ok' }], recursos: {}, zro: { ligada: true, pedir: false } } })
    if (u.endsWith('/api/drive/token')) return r.fulfill({ json: { accessToken: 'ya29.teste', expiraEm: Date.now() + 3600e3, email: 'lia@exemplo.com' } })
    return r.fulfill({ status: 404, json: {} })
  })
  // o Drive: uma foto na raiz, que desce inteira (alt=media) quando entra na montagem
  const fotoDrive = makePng(900, 900, (x, y) => [((x / 90) | 0) * 25, 90, ((y / 90) | 0) * 25])
  await ctx.route('https://www.googleapis.com/**', (r) => {
    if (new URL(r.request().url()).searchParams.get('alt') === 'media') return r.fulfill({ status: 200, contentType: 'image/png', body: fotoDrive })
    return r.fulfill({
      json: {
        storageQuota: { limit: '2199023255552', usage: '612000000000' },
        files: [{ id: 'd1', name: 'capa-drive.png', mimeType: 'image/png', size: String(fotoDrive.length), modifiedTime: '2026-11-05T12:00:00Z', parents: ['root'] }],
        user: { emailAddress: 'lia@exemplo.com', displayName: 'Lia' },
      },
    })
  })
  await ctx.route(/^https:\/\/(?!www\.googleapis\.com)/, (r) => r.fulfill({ status: 404, body: '' }))
  return ctx
}

async function foto(p, motor, nome) {
  if (!FOTOS) return
  fs.mkdirSync(FOTOS, { recursive: true })
  await p.waitForTimeout(400)
  await p.screenshot({ path: path.join(FOTOS, `${motor}-${nome}.png`) })
}

for (const motor of ['chromium', 'webkit']) {
  test(`frames no celular (${motor}): cortes de cena tocam aqui e vão com os frames para a Montagem`, { skip: (!pw && 'sem Playwright neste computador') || (!comFfmpeg && 'sem ffmpeg'), timeout: 300_000 }, async (t) => {
    let nav
    try {
      nav = await pw[motor].launch()
    } catch {
      return t.skip(`sem o ${motor} do Playwright`)
    }
    t.after(() => nav.close())
    // um vídeo de 3 cenas bem diferentes (4 s cada), em WebM: o Chromium do Playwright não toca H.264
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sobedesce-cortes-'))
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
    const video = path.join(dir, 'filme.webm')
    const cena = (f) => ['-f', 'lavfi', '-i', `${f}=size=480x270:rate=24:duration=4`]
    const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...cena('testsrc2'), ...cena('rgbtestsrc'), ...cena('smptebars'), '-filter_complex', '[0][1][2]concat=n=3:v=1:a=0', '-c:v', 'libvpx', '-b:v', '1M', '-g', '24', video])
    assert.equal(r.status, 0, String(r.stderr))
    await servir()
    const ctx = await contexto(nav, motor)
    const p = await ctx.newPage()
    const erros = []
    p.on('pageerror', (e) => erros.push(e.message))
    await p.goto(`${base}/app/`)
    await p.locator('.tabbar').waitFor({ timeout: 60_000 })
    await p.locator('.tabbar .tab', { hasText: 'Estúdio' }).click()
    await p.locator('.est-secao', { hasText: 'Frames' }).click()
    await p.locator('.cr-origens input[type=file]').setInputFiles(video)
    await p.locator('.cr-quant .k-pilula', { hasText: /^6$/ }).click()
    await p.getByRole('button', { name: /Fazer os frames/ }).click()
    await p.locator('.cr-res').waitFor({ timeout: 180_000 })
    await foto(p, motor, 'cortes-1-frames')

    // os cortes: um por cena, cada um com capa e de onde a onde
    await p.locator('.cr-res .k-pilula', { hasText: /^Cortes/ }).click()
    const cortes = p.locator('.cr-corte')
    const n = await cortes.count()
    assert.ok(n >= 2, `esperava pelo menos 2 cortes, vieram ${n}`)
    assert.match(await cortes.first().locator('.cr-frame-tc').innerText(), /\d:\d\d → \d:\d\d/)
    // ▶ toca só o trecho, aqui mesmo
    await cortes.nth(1).getByRole('button', { name: /Tocar o corte/ }).click()
    const v = cortes.nth(1).locator('video')
    await v.waitFor()
    if (motor === 'chromium') await p.waitForFunction(() => (document.querySelector('.cr-corte video')?.currentTime || 0) > 0.2, null, { timeout: 20_000 })
    await foto(p, motor, 'cortes-2-tocando')
    await cortes.nth(1).getByRole('button', { name: 'Parar' }).click()

    // escolhe dois cortes e um frame e manda para a Montagem
    await cortes.nth(0).locator('.cr-corte-capa').click()
    await cortes.nth(1).locator('.cr-corte-capa').click()
    await p.locator('.cr-res .k-pilula', { hasText: /^Frames/ }).click()
    await p.locator('.cr-frame').first().click()
    await foto(p, motor, 'cortes-3-escolhidos')
    await p.getByRole('button', { name: 'Montagem' }).click()
    await p.locator('.mtc').waitFor({ timeout: 20_000 })
    await p.waitForFunction(() => document.querySelectorAll('.mtc-midia-img img').length === 3, null, { timeout: 60_000 })
    await foto(p, motor, 'cortes-4-montagem')
    const nomes = await p.locator('span.mtc-midia .mtc-midia-img').evaluateAll((els) => els.map((e) => e.getAttribute('title')))
    assert.equal(nomes.length, 3)
    assert.equal(nomes.filter((x) => /^Corte \d\d · \d:\d\d$/.test(x)).length, 2, nomes.join(' | '))
    // os cortes entram como take, cada um começando no ponto dele (dois takes do mesmo vídeo)
    const takes = await p.locator('span.mtc-midia .mtc-midia-play').count()
    assert.equal(takes, 2)
    // mandar de novo não repete
    await p.locator('.est-secao', { hasText: 'Frames' }).click()
    await p.getByRole('button', { name: 'Montagem' }).click()
    await p.waitForTimeout(800)
    assert.equal(await p.locator('.mtc-midia-img img').count(), 3)
    assert.deepEqual(erros, [])
  })
}
