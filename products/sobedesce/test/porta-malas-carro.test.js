// O Sobedesce no porta-malas do Carro do Freela (web/public/app/lib/embutido.js), num Chromium de verdade: uma página
// em outra origem (o Carro) põe o /app/ num quadro. Com ?no=carro e a CSP do Carro (web/next.config.ts) o app entra,
// só com Transferências e Drive, sem a Z e sem o Set, e o link que sai do /app/ abre em outra aba. Sem ?no=carro, a
// CSP de sempre (frame-ancestors 'none') não deixa embutir. Sem Playwright neste computador, fica de fora.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
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
const pular = !chromium && 'sem Playwright neste computador'

/** A CSP do /app/ em produção, lida do next.config.ts; `ancestrais` troca o frame-ancestors (o do Carro). */
function cspDoApp(ancestrais = null) {
  const cfg = fs.readFileSync(fileURLToPath(new URL('../web/next.config.ts', import.meta.url)), 'utf8')
  const bloco = /const appCsp = \[([\s\S]*?)\]\.join\("; "\)/.exec(cfg)[1]
  const connect = JSON.parse(/const appConnect = (\[[^\]]*\])/.exec(cfg)[1])
  const img = JSON.parse(/const appImg = (\[[^\]]*\])/.exec(cfg)[1].replace('ZRO', '"https://absolutezro.com"'))
  const csp = [...bloco.matchAll(/^\s*(?:"([^"]+)"|`([^`]+)`),?$/gm)]
    .map(m => m[1] ?? m[2])
    .map(d => d.replace('${appConnect.join(" ")}', connect.join(' ')).replace('${appImg.join(" ")}', img.join(' ')))
    .join('; ')
  assert.match(cfg, /appCsp\.replace\("frame-ancestors 'none'"/, 'o anfitrião troca só o frame-ancestors')
  return ancestrais ? csp.replace("frame-ancestors 'none'", `frame-ancestors ${ancestrais}`) : csp
}

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' }
const servidores = []
let nav
after(async () => {
  await nav?.close()
  for (const s of servidores) s.close()
})
async function ouvir(fn) {
  const s = http.createServer(fn)
  servidores.push(s)
  await new Promise(ok => s.listen(0, '127.0.0.1', ok))
  return `http://127.0.0.1:${s.address().port}`
}

test('porta-malas do Carro: o app embutido mostra só Transferências e Drive; sem ?no=carro, não embute', { skip: pular, timeout: 90_000 }, async () => {
  const normal = cspDoApp()
  const doCarro = cspDoApp('http://127.0.0.1:*')
  const sobedesce = await ouvir((req, res) => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/api/eu') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ usuario: { id: 'u1', nome: 'Lia Montadora', email: 'lia@exemplo.com' }, contas: [], recursos: {}, zro: { ligada: true } }))
    }
    if (url.pathname.startsWith('/api/')) return res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"erro":"nao_encontrado"}')
    let rel = decodeURIComponent(url.pathname.replace(/^\/app\/?/, ''))
    if (!rel) rel = 'index.html'
    const arquivo = path.join(APP, rel)
    if (!arquivo.startsWith(APP) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) return res.writeHead(404).end()
    const csp = rel === 'index.html' && url.searchParams.get('no') === 'carro' ? doCarro : normal
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'Content-Security-Policy': csp }).end(fs.readFileSync(arquivo))
  })
  const carro = await ouvir((req, res) => {
    const url = new URL(req.url, 'http://x')
    const src = `${sobedesce}/app/${url.searchParams.get('q') || ''}`
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><title>Carro</title><script>window.recados=[];addEventListener('message',e=>recados.push({origem:e.origin,...e.data}))</script><iframe id="sd" src="${src}" style="width:393px;height:760px;border:0"></iframe>`)
  })
  nav = await chromium.launch()
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 860 } })
  const pagina = await ctx.newPage()
  const erros = []
  pagina.on('pageerror', e => erros.push(e.message))

  // com ?no=carro: entra, e só com a tarefa de mover arquivo
  await pagina.goto(`${carro}/?q=${encodeURIComponent('?no=carro&tema=escuro')}`)
  const quadro = pagina.frameLocator('#sd')
  const barra = quadro.getByRole('navigation', { name: 'Seções' })
  await barra.waitFor({ timeout: 40_000 })
  assert.deepEqual(await barra.locator('.tab-label').allTextContents(), ['Transferências', 'Drive'])
  const sd = pagina.frames().find(f => f.url().includes('/app/'))
  assert.equal(await sd.evaluate(() => document.documentElement.classList.contains('is-embutido')), true)
  assert.equal(await quadro.locator('.z-botao, [data-set]').count(), 0, 'sem a Z e sem o Set (o Carro tem os dele)')
  // o tema é o do anfitrião (escuro pelo endereço) e muda na hora por mensagem dele
  assert.equal(await sd.evaluate(() => document.documentElement.dataset.theme), 'dark')
  await pagina.evaluate(() => document.getElementById('sd').contentWindow.postMessage({ tipo: 'tema', tema: 'claro' }, '*'))
  await pagina.waitForTimeout(200)
  assert.equal(await sd.evaluate(() => document.documentElement.dataset.theme), 'light')
  // o app avisa o anfitrião (só a origem dele): pronto
  const recados = await pagina.evaluate(() => window.recados)
  assert.ok(recados.some((r) => r.fonte === 'sobedesce' && r.tipo === 'pronto' && r.origem === new URL(sd.url()).origin), JSON.stringify(recados))
  // Drive abre; e uma aba que não existe aqui (link #aparelhos) cai em Transferências
  await barra.getByRole('button', { name: 'Drive' }).click()
  assert.match(await barra.locator('[aria-current="page"]').textContent(), /Drive/)
  // link que sai do /app/ (a conta, entrar, conectar o Drive) abre em outra aba, não dentro do quadro
  const link = quadro.locator('a[href]:not([href^="#"])').first()
  if (await link.count()) {
    const [aba] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), link.click()])
    assert.ok(aba, 'abriu em outra aba')
    assert.equal(await link.getAttribute('target'), '_blank')
    assert.ok(sd.url().includes('/app/'), 'o quadro continua no app')
    await aba?.close()
  }
  assert.deepEqual(erros, [])

  // sem ?no=carro: a CSP de sempre não deixa o app entrar no quadro
  await pagina.goto(`${carro}/`)
  await pagina.waitForTimeout(1500)
  const bloqueado = pagina.frames().find(f => f !== pagina.mainFrame())
  const temApp = bloqueado ? await bloqueado.evaluate(() => !!document.getElementById('app')).catch(() => false) : false
  assert.equal(temApp, false, 'sem ?no=carro, nada embute')
})
