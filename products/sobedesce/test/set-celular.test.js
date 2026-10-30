// O Set da Absolute ZRO no app do celular (web/public/app/components/set.js), num Chromium de verdade com a CSP do /app/
// (web/next.config.ts): com a conta neste aparelho e o Set respondendo, "Set" é a última aba da barra, com o balão das
// novidades; o toque abre a folha do <zro-set modo="folha"> (tela cheia no iPhone) com a cara do app, sem trocar de
// aba; sem o escopo (401), nada aparece. O widget é a cópia do repositório (apps/hub-web/public/set/v1) e o repasse
// /api/zro/set responde como o do site (web/src/lib/zro/set.ts, testado em web/tests/zro-set.test.mts).
// Sem Playwright neste computador, fica de fora. SET_FOTOS=<pasta> grava as telas.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const APP = fileURLToPath(new URL('../web/public/app/', import.meta.url))
const WIDGET = fileURLToPath(new URL('../../../apps/hub-web/public/set/v1/zro-set.js', import.meta.url))
let chromium = null
try {
  chromium = createRequire(import.meta.url)('playwright').chromium
} catch {
  try {
    chromium = createRequire(path.join(process.env.NODE_PATH || '/nada', 'x.js'))('playwright').chromium
  } catch {}
}
const pular = (!chromium || !fs.existsSync(WIDGET)) && 'sem Playwright (ou sem o widget do HUB) neste computador'

/** A CSP do /app/ em produção, lida do next.config.ts (a página tem que funcionar com ela). */
function cspDoApp() {
  const cfg = fs.readFileSync(fileURLToPath(new URL('../web/next.config.ts', import.meta.url)), 'utf8')
  const bloco = /const appCsp = \[([\s\S]*?)\]\.join\("; "\)/.exec(cfg)[1]
  const connect = JSON.parse(/const appConnect = (\[[^\]]*\])/.exec(cfg)[1])
  const img = JSON.parse(/const appImg = (\[[^\]]*\])/.exec(cfg)[1].replace('ZRO', '"https://absolutezro.com"'))
  return [...bloco.matchAll(/^\s*(?:"([^"]+)"|`([^`]+)`),?$/gm)]
    .map(m => m[1] ?? m[2])
    .map(d => d.replace('${appConnect.join(" ")}', connect.join(' ')).replace('${appImg.join(" ")}', img.join(' ')))
    .join('; ')
}

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' }
const P = n => `00000000-0000-4000-8000-00000000000${n}`
const ESTADO = {
  eu: { id: P(1), arroba: 'lia', nome: 'Lia Montadora', foto: null, preferencias: { invisivel: false, quemVe: 'equipe_contatos', mostrarVisto: true } },
  pessoas: [
    { id: P(2), arroba: 'rui', nome: 'Rui Tavares', foto: null, estado: 'online', app: { id: 'maestro', nome: 'Maestro' } },
    { id: P(3), arroba: 'bia', nome: 'Bia Lemos', foto: null, estado: 'ausente', app: { id: 'synquei', nome: 'Synquei' } },
  ],
  naoLidas: 2,
  pedidos: 0,
  porConversa: {},
  ultima: 0,
}

let servidor, nav
after(async () => {
  await nav?.close()
  servidor?.close()
})

async function abrir(base, { setLogado = true, tema = null } = {}) {
  const ctx = await nav.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: tema || 'light' })
  const pagina = await ctx.newPage()
  const erros = []
  pagina.on('pageerror', e => erros.push(e.message))
  pagina.on('console', m => m.type() === 'error' && !/status of 40[134]/.test(m.text()) && erros.push(m.text()))
  await pagina.route('https://absolutezro.com/**', r => {
    const u = new URL(r.request().url())
    const corpo = u.pathname === '/set/v1/zro-set.js' ? fs.readFileSync(WIDGET) : 'export {}\n'
    return r.fulfill({ status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8', 'access-control-allow-origin': '*' }, body: corpo })
  })
  const pedidosSet = []
  await pagina.route(/\/api\//, async r => {
    const req = r.request()
    const u = new URL(req.url())
    const json = (status, corpo) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) })
    if (u.pathname === '/api/eu') return json(200, { usuario: { id: 'u1', nome: 'Lia Montadora', email: 'lia@exemplo.com' }, contas: [], recursos: {}, zro: null })
    if (u.pathname === '/api/zro/set' || u.pathname.startsWith('/api/zro/set/')) {
      pedidosSet.push({ caminho: u.pathname, autorizacao: (await req.allHeaders()).authorization || null })
      if (!setLogado) return json(401, { erro: 'reconectar_zro' })
      const c = u.pathname.slice('/api/zro/set'.length)
      if (c === '' || c === '/') return json(200, ESTADO)
      if (c === '/conversas') return json(200, { conversas: [], projetos: [] })
      if (c === '/contatos') return json(200, { contatos: [], recebidos: [], enviados: [], bloqueados: [] })
      return json(200, { ok: true })
    }
    return json(404, { erro: 'nao_encontrado' })
  })
  await pagina.goto(`${base}/app/`)
  return { ctx, pagina, erros, pedidosSet }
}

test('app do celular: "Set" no topo, ao lado da Z (não é aba), abre a folha com a cara do app e não troca de aba', { skip: pular, timeout: 90_000 }, async () => {
  const csp = cspDoApp()
  servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    let rel = decodeURIComponent(url.pathname.replace(/^\/app\/?/, ''))
    if (!rel) rel = 'index.html'
    const arquivo = path.join(APP, rel)
    if (!arquivo.startsWith(APP) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) return res.writeHead(404).end()
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'Content-Security-Policy': csp }).end(fs.readFileSync(arquivo))
  })
  await new Promise(ok => servidor.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${servidor.address().port}`
  nav = await chromium.launch()
  const fotos = process.env.SET_FOTOS

  for (const tema of ['light', 'dark']) {
    const { ctx, pagina, erros, pedidosSet } = await abrir(base, { tema })
    const barra = pagina.getByRole('navigation', { name: 'Seções' })
    const set = pagina.locator('.topbar-acoes [data-set]:visible')
    await set.waitFor({ timeout: 20_000 })
    // o Set fica no topo, junto da Z; a barra de baixo é só a tarefa (no máximo cinco abas no iPhone) e abre no Início
    assert.equal(await barra.locator('[data-set]').count(), 0, 'o Set não é aba')
    assert.ok((await barra.locator('button').count()) <= 5, 'no máximo cinco abas')
    assert.match(await barra.locator('[aria-current="page"]').textContent(), /Início/)
    assert.equal(await pagina.locator('.topbar-acoes:visible > *').evaluateAll(es => es.map(e => e.matches('[data-set]') ? 'set' : e.matches('.z-botao') ? 'z' : 'conta')).then(l => l.join(' ')), 'set z conta')
    assert.equal(await set.locator('.tab-balao').textContent(), '2')
    assert.match(await set.getAttribute('aria-label'), /Set, 1 online, 2 novidades/)
    // o app segue o tema do aparelho (sem data-theme): o widget também
    assert.equal(await pagina.evaluate(() => document.querySelector('zro-set').getAttribute('tema')), 'auto')
    const antes = await barra.locator('[aria-current="page"]').textContent()
    await set.click()
    const painel = pagina.locator('zro-set-folha .folha[data-on] .painel')
    await painel.waitFor()
    await pagina.locator('zro-set-folha .linha', { hasText: 'Rui Tavares' }).waitFor()
    await pagina.waitForTimeout(600)
    assert.equal(await set.getAttribute('aria-expanded'), 'true')
    assert.equal(await barra.locator('[aria-current="page"]').textContent(), antes, 'a aba aberta continua a mesma')
    const [cor, tinta, largura] = await pagina.evaluate(() => {
      const p = document.querySelector('zro-set-folha').shadowRoot.querySelector('.painel')
      const d = document.createElement('div')
      d.style.color = 'var(--text)'
      document.body.append(d)
      const t = getComputedStyle(d).color
      d.remove()
      return [getComputedStyle(p).color, t, p.getBoundingClientRect().width]
    })
    assert.equal(cor, tinta, 'a tinta da folha é a do app')
    assert.ok(largura >= 390, `tela cheia no iPhone (${largura}px)`)
    assert.ok(pedidosSet.length > 0 && pedidosSet.every(p => p.autorizacao === null), 'a página nunca manda token')
    if (fotos) await pagina.screenshot({ path: path.join(fotos, `sobedesce-celular-393-${tema === 'light' ? 'claro' : 'escuro'}.png`) })
    await pagina.keyboard.press('Escape')
    await pagina.waitForTimeout(300)
    assert.equal(await set.getAttribute('aria-expanded'), 'false')
    if (fotos && tema === 'light') await pagina.screenshot({ path: path.join(fotos, 'sobedesce-celular-393-entrada.png') })
    assert.deepEqual(erros, [])
    await ctx.close()
  }

  // login de antes do Set (401): nenhuma aba nova
  const { ctx, pagina } = await abrir(base, { setLogado: false })
  await pagina.getByRole('navigation', { name: 'Seções' }).waitFor()
  await pagina.waitForTimeout(1500)
  assert.equal(await pagina.locator('[data-set]').count(), 0)
  await ctx.close()
})
