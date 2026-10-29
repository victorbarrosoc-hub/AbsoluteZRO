// "Converter com o Relay" no celular (web/public/app/lib/relay.js, o motor do Relay), num Chromium de verdade: a página
// com a mesma CSP do /app/ (web/next.config.ts) lê um ProRes de um "Drive" que só responde com o token e por pedaços
// (Range), converte no navegador e devolve o MP4 do YouTube 1080p, conferido pelo ffprobe (H.264, BT.709, AAC). Sem Playwright,
// ffmpeg ou ffprobe neste computador, fica de fora (o CI do app de computador não tem navegador).
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
const tem = cmd => {
  try {
    return spawnSync(cmd, ['-version'], { encoding: 'utf8' }).status === 0
  } catch {
    return false
  }
}
let chromium = null
try {
  chromium = createRequire(import.meta.url)('playwright').chromium
} catch {
  try {
    chromium = createRequire(path.join(process.env.NODE_PATH || '/nada', 'x.js'))('playwright').chromium
  } catch {}
}
const pular = (!chromium || !tem('ffmpeg') || !tem('ffprobe')) && 'sem Playwright, ffmpeg ou ffprobe neste computador'

/** A CSP do /app/ em produção, lida do next.config.ts (a página tem que funcionar com ela). */
function cspDoApp() {
  const cfg = fs.readFileSync(fileURLToPath(new URL('../web/next.config.ts', import.meta.url)), 'utf8')
  const bloco = /const appCsp = \[([\s\S]*?)\]\.join\("; "\)/.exec(cfg)[1]
  const connect = JSON.parse(/const appConnect = (\[[^\]]*\])/.exec(cfg)[1])
  return [...bloco.matchAll(/^\s*(?:"([^"]+)"|`([^`]+)`),?$/gm)]
    .map(m => m[1] ?? m[2])
    .map(d => d.replace('${appConnect.join(" ")}', connect.join(' ')).replace(/\$\{appImg\.join\(" "\)\}/, "'self' data: blob:"))
    .join('; ')
}

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' }
let servidor
after(() => servidor?.close())

test('o celular converte um ProRes do Drive em MP4 do YouTube (H.264, BT.709) com a CSP do app', { skip: pular, timeout: 150_000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sobedesce-relay-cel-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const master = path.join(dir, 'master.mov')
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2', '-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-c:a', 'pcm_s24le', master])
  assert.equal(r.status, 0, String(r.stderr))
  const video = fs.readFileSync(master)
  const pedidos = []
  const csp = cspDoApp().replace('https://www.googleapis.com', 'https://www.googleapis.com http://127.0.0.1:*')
  servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname.startsWith('/drive/files/')) {
      // "Drive": sem o token, 401; com ele, só por pedaços (Range), como o alt=media
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Range')
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')
      if (req.method === 'OPTIONS') return res.writeHead(204).end()
      pedidos.push({ auth: req.headers.authorization, range: req.headers.range })
      if (req.headers.authorization !== 'Bearer token-certo') return res.writeHead(401).end()
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '')
      if (!m) return res.writeHead(200, { 'Content-Length': video.length, 'Accept-Ranges': 'bytes' }).end(video)
      const ini = Number(m[1])
      const fim = Math.min(m[2] ? Number(m[2]) : video.length - 1, video.length - 1)
      return res.writeHead(206, { 'Content-Range': `bytes ${ini}-${fim}/${video.length}`, 'Content-Length': fim - ini + 1, 'Accept-Ranges': 'bytes' }).end(video.subarray(ini, fim + 1))
    }
    if (url.pathname === '/app/teste.html') {
      return res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': csp }).end(`<!doctype html><meta charset="utf-8"><script type="module" src="./teste.js"></script>`)
    }
    if (url.pathname === '/app/teste.js') {
      // o mesmo que a folha faz: primeiro um token velho (o Drive recusa), depois o certo
      return res.writeHead(200, { 'Content-Type': 'text/javascript', 'Content-Security-Policy': csp }).end(`
        import { converterNoAparelho } from './lib/relay.js'
        let token = 'token-velho'
        window.resultado = converterNoAparelho({
          url: location.origin + '/drive/files/abc?alt=media', nome: 'Clipe Master.mov', destino: 'youtube-1080',
          token: async () => token, invalidar: () => (token = 'token-certo'), onFase: (f) => (window.fase = f),
        }).then(async (r) => ({ nome: r.file.name, codecs: r.codecs, bytes: Array.from(new Uint8Array(await r.file.arrayBuffer())) }), (e) => ({ erro: String(e && e.message || e) }))
      `)
    }
    const arquivo = path.join(APP, decodeURIComponent(url.pathname.replace(/^\/app\//, '')))
    if (!arquivo.startsWith(APP) || !fs.existsSync(arquivo)) return res.writeHead(404).end()
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'Content-Security-Policy': csp }).end(fs.readFileSync(arquivo))
  })
  await new Promise(ok => servidor.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${servidor.address().port}`

  const nav = await chromium.launch()
  t.after(() => nav.close())
  const pagina = await nav.newPage()
  const erros = []
  pagina.on('pageerror', e => erros.push(e.message))
  pagina.on('console', m => m.type() === 'error' && erros.push(m.text()))
  await pagina.goto(`${base}/app/teste.html`)
  const res = await Promise.race([
    pagina.evaluate(() => window.resultado),
    new Promise(ok => setTimeout(ok, 120_000)).then(async () => ({ erro: `parou em ${await pagina.evaluate(() => window.fase)}: ${erros.join(' | ')}` })),
  ])
  assert.equal(res.erro, undefined, res.erro)
  assert.deepEqual(erros.filter(e => !/401/.test(e)), [], 'sem erro de CSP')
  assert.equal(res.nome, 'Clipe Master (YouTube 1080p).mp4')
  assert.equal(res.codecs, 'H.264 + AAC') // nunca Opus num MP4: o AAC em WASM entra onde o aparelho não tem
  assert.ok(pedidos.some(p => p.auth === 'Bearer token-velho'), 'tentou o token velho')
  assert.ok(pedidos.filter(p => p.auth === 'Bearer token-certo').every(p => /^bytes=/.test(p.range || '')), 'leu por pedaços')

  const saida = path.join(dir, 'saida.mp4')
  fs.writeFileSync(saida, Buffer.from(res.bytes))
  const sonda = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,color_primaries,color_transfer,color_space', '-of', 'json', saida], { encoding: 'utf8' }).stdout)
  const v = sonda.streams.find(s => s.codec_type === 'video')
  assert.deepEqual([v.codec_name, v.width, v.height, v.color_primaries, v.color_transfer, v.color_space], ['h264', 1280, 720, 'bt709', 'bt709', 'bt709'])
  assert.ok(sonda.streams.some(s => s.codec_type === 'audio'), 'com áudio')
})
