// Montagens no app do celular (web/public/app/components/montagens.js), num navegador de verdade com cara de iPhone
// (Chromium e, se tiver, o WebKit do Playwright): Criar › Montagens, três fotos da galeria, o carrossel contínuo e a
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

/** Três fotos de tamanhos diferentes (paisagem, retrato e quadrada), com degradês para enxergar o enquadre. */
const FOTOS_TESTE = [
  { name: 'praia.png', mimeType: 'image/png', buffer: makePng(1200, 800, (x, y) => [30 + ((x * 200) / 1200) | 0, 120, 200 - ((y * 120) / 800) | 0]) },
  { name: 'retrato.png', mimeType: 'image/png', buffer: makePng(600, 900, (x, y) => [220, 80 + ((y * 150) / 900) | 0, 60 + ((x * 100) / 600) | 0]) },
  { name: 'quadrada.png', mimeType: 'image/png', buffer: makePng(700, 700, (x, y) => [60 + ((((x / 50) | 0) + ((y / 50) | 0)) % 2) * 150, 160, 90]) },
]

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

/** Tamanho de PNG/JPEG pelos bytes. */
function tamanhoDaImagem(b) {
  if (b[0] === 0x89) return [b.readUInt32BE(16), b.readUInt32BE(20)]
  let i = 2
  while (i < b.length) {
    if (b[i] !== 0xff) return null
    const m = b[i + 1]
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]
    i += 2 + b.readUInt16BE(i + 2)
  }
  return null
}

async function foto(p, motor, nome) {
  if (!FOTOS) return
  fs.mkdirSync(FOTOS, { recursive: true })
  await p.waitForTimeout(400)
  await p.screenshot({ path: path.join(FOTOS, `${motor}-${nome}.png`) })
}

/** Faz a montagem e devolve os arquivos que foram para a folha de compartilhar. */
async function fazerESalvar(p, motor, nome) {
  await p.evaluate(() => (window.__compartilhados = []))
  await p.getByRole('button', { name: 'Fazer a montagem' }).click()
  await p.locator('.mtc-pronta').waitFor({ timeout: 120_000 })
  await foto(p, motor, `${nome}-pronta`)
  await p.getByRole('button', { name: 'Salvar no celular' }).click()
  await p.waitForFunction(() => window.__compartilhados.length > 0, null, { timeout: 30_000 })
  const arquivos = await p.evaluate(() => window.__compartilhados)
  await p.getByRole('button', { name: 'Fechar' }).click()
  return arquivos.map((a) => ({ ...a, buf: Buffer.from(a.bytes) }))
}

for (const motor of ['chromium', 'webkit']) {
  test(`montagens no celular (${motor}): carrossel e grade em imagens, e o vídeo com um take`, { skip: !pw && 'sem Playwright neste computador', timeout: 300_000 }, async (t) => {
    let nav
    try {
      nav = await pw[motor].launch()
    } catch {
      return t.skip(`sem o ${motor} do Playwright`)
    }
    t.after(() => nav.close())
    await servir()
    const ctx = await contexto(nav, motor)
    const p = await ctx.newPage()
    const erros = []
    p.on('pageerror', (e) => erros.push(e.message))
    await p.goto(`${base}/app/`)
    await p.locator('.tabbar').waitFor({ timeout: 60_000 })
    await p.locator('.tabbar .tab', { hasText: 'Criar' }).click()
    await foto(p, motor, '1-criar')
    await p.locator('.cr-ferr', { hasText: 'Montagens' }).click()
    await p.locator('.mtc-vazio').waitFor()
    await foto(p, motor, '2-montagens-vazia')

    // três fotos da galeria
    await p.locator('.mtc-vazio input[type=file]').setInputFiles(FOTOS_TESTE)
    await p.waitForFunction(() => document.querySelectorAll('.mtc-midia-img img').length === 3, null, { timeout: 30_000 })
    await foto(p, motor, '3-post')

    // do Drive: a faixa de escolher, um toque na foto junta, "Pronto" volta para a montagem
    await p.getByRole('button', { name: 'Juntar do Drive' }).click()
    await p.locator('.escolher-faixa', { hasText: 'montagem' }).waitFor()
    await p.getByText('capa-drive.png').first().click()
    await foto(p, motor, '3b-drive-escolher')
    await p.locator('.escolher-faixa').getByRole('button', { name: 'Pronto' }).click()
    await p.waitForFunction(() => document.querySelectorAll('.mtc-midia-img img').length === 4, null, { timeout: 30_000 })
    await p.getByRole('button', { name: 'Tirar capa-drive.png' }).click()

    // carrossel contínuo, 3 slides 4:5
    await p.getByRole('radio', { name: 'Carrossel' }).click()
    await p.locator('.mtc .k-pilulas[aria-label="Slides"] .k-pilula', { hasText: /^3$/ }).click()
    await p.locator('.mtc-modelo[aria-label="Três colunas"]').click()
    await foto(p, motor, '4-carrossel')
    const car = await fazerESalvar(p, motor, '4-carrossel')
    assert.deepEqual(car.map((a) => a.nome), ['Montagem_4x5_01.jpg', 'Montagem_4x5_02.jpg', 'Montagem_4x5_03.jpg'])
    for (const a of car) assert.deepEqual(tamanhoDaImagem(a.buf), [1080, 1350], a.nome)

    // grade do perfil 3×2 em 3:4
    await p.getByRole('radio', { name: 'Grade' }).click()
    await p.locator('.mtc .k-pilula', { hasText: '3×2' }).click()
    await foto(p, motor, '5-grade')
    const grade = await fazerESalvar(p, motor, '5-grade')
    assert.equal(grade.length, 6)
    assert.equal(grade[0].nome, 'Montagem_3x4_01.jpg')
    for (const a of grade) assert.deepEqual(tamanhoDaImagem(a.buf), [1080, 1440], a.nome)

    // o vídeo: um take ao lado de uma foto, 3 s, em 4:5
    if (comFfmpeg) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sobedesce-mtc-'))
      t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
      const take = path.join(dir, 'take.mp4')
      const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', take])
      assert.equal(r.status, 0, String(r.stderr))
      await p.getByRole('radio', { name: 'Post' }).click()
      await p.locator('.mtc-bandeja input[type=file]').setInputFiles(take)
      await p.waitForFunction(() => document.querySelectorAll('.mtc-midia-img img').length === 4, null, { timeout: 60_000 })
      await p.locator('.mtc-modelo[aria-label="Dois lado a lado"]').click()
      // o take no segundo quadro: tocar no quadro e depois no take da bandeja
      const box = await p.locator('.mtc-canvas').boundingBox()
      await p.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.5)
      await p.locator('.mtc-midia-img').nth(3).click()
      await p.getByRole('radio', { name: 'Vídeo' }).waitFor({ timeout: 30_000 })
      await p.getByRole('radio', { name: 'Vídeo' }).click()
      await p.locator('.mtc .k-pilula', { hasText: '3 s' }).click()
      await p.locator('.mtc .k-pilula', { hasText: 'Take 1' }).click()
      await foto(p, motor, '6-video')
      await p.getByRole('button', { name: 'Trecho do take' }).click()
      await p.locator('.mtc-trecho').waitFor()
      await p.waitForFunction(() => document.querySelectorAll('.mtc-faixa-quadros img').length === 8, null, { timeout: 30_000 })
      await foto(p, motor, '7-trecho')
      await p.getByRole('button', { name: 'Usar' }).click()
      const [mp4] = await fazerESalvar(p, motor, '6-video')
      assert.equal(mp4.nome, 'Montagem_4x5.mp4')
      assert.equal(mp4.tipo, 'video/mp4')
      const saida = path.join(dir, 'saida.mp4')
      fs.writeFileSync(saida, mp4.buf)
      const sonda = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', saida], { encoding: 'utf8' }).stdout)
      const v = sonda.streams.find((s) => s.codec_type === 'video')
      assert.deepEqual([v.codec_name, v.width, v.height], ['h264', 1080, 1350])
      assert.ok(Math.abs(Number(sonda.format.duration) - 3) < 0.25, `duração ${sonda.format.duration}`)
      assert.ok(sonda.streams.some((s) => s.codec_type === 'audio' && s.codec_name === 'aac'), 'com o som do take')
    }
    await ctx.close()
    assert.deepEqual(erros, [])
  })
}
