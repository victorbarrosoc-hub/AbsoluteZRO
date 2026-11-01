/**
 * O TPeasy no Safari do iPhone (WebKit do Playwright, revisão do titular de 01/11/2026): o site, Roteiros, Teleprompter, Mais
 * ajustes, Ajustes, o editor, a leitura (em pé e deitado) e o controle remoto (remote.html), em 375, 393 e 430 px.
 * Confere que a página nunca fica mais larga que a tela, que todo campo tem 16 px ou mais (o Safari amplia abaixo
 * disso) e que todo botão à vista tem 44 × 44 px de toque (Apple HIG; a área pode crescer além do desenho por um
 * ::after, como em app.css). Só o que está por cima conta (a tela de baixo de uma folha fica de fora).
 *
 * Usa o Playwright da raiz do repositório; sem ele (ou sem o WebKit), pula.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
let pw = null
try {
  pw = createRequire(new URL('../../../package.json', import.meta.url))('playwright')
} catch {}
let navegador = null
try {
  navegador = pw ? await pw.webkit.launch() : null
} catch {}
const pular = !navegador && 'sem o Playwright/WebKit da raiz'

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }
let servidor
let base

before(async () => {
  servidor = createServer(async (q, r) => {
    let f = normalize(join(RAIZ, decodeURIComponent(q.url.split('?')[0])))
    if (!f.startsWith(RAIZ)) return r.writeHead(403).end()
    try {
      if ((await stat(f)).isDirectory()) f = join(f, 'index.html')
      r.writeHead(200, { 'content-type': TIPOS[extname(f)] ?? 'application/octet-stream' }).end(await readFile(f))
    } catch {
      r.writeHead(404).end()
    }
  })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${servidor.address().port}`
})
after(async () => {
  await navegador?.close()
  servidor?.close()
})

/** Os achados da tela: página larga, campo pequeno e alvo de toque pequeno (só o que está por cima). */
function achados() {
  const a = []
  const vw = document.documentElement.clientWidth
  if (document.documentElement.scrollWidth > vw + 1) a.push(`página rola de lado (${document.documentElement.scrollWidth} > ${vw})`)
  const visivel = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width <= 2 || r.height <= 2 || r.bottom <= 0 || r.top >= innerHeight) return false
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false
    if (el.closest("[aria-hidden='true'], [inert], [hidden]")) return false
    // só o que está por cima: o centro do botão é dele (ou de quem está dentro dele)
    const no = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, r.top + r.height / 2))
    return !!no && (el.contains(no) || no.contains(el))
  }
  const nome = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''} "${(el.getAttribute('aria-label') || el.textContent || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 30)}"`
  for (const c of document.querySelectorAll('input, select, textarea')) {
    if (['hidden', 'checkbox', 'radio', 'range', 'file', 'color', 'submit', 'button'].includes(c.type) || !visivel(c)) continue
    const px = parseFloat(getComputedStyle(c).fontSize)
    if (px < 16) a.push(`campo com ${px}px: ${nome(c)}`)
  }
  for (const el of document.querySelectorAll("button, a[href], select, summary, [role='button'], [role='tab']")) {
    if (!visivel(el)) continue
    // o interruptor do iOS (51 × 31) mora numa linha de 44 px ou mais: a linha é o alvo
    if (el.matches('.switch, [role="switch"]') && el.closest('.row')?.getBoundingClientRect().height >= 44) continue
    // link no meio de uma frase (o texto em volta é dele)
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && [...(el.parentElement?.childNodes ?? [])].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
    const r = el.getBoundingClientRect()
    let [t, d, b, e] = [0, 0, 0, 0]
    for (const p of ['::after', '::before']) {
      const cs = getComputedStyle(el, p)
      if (cs.content === 'none' || cs.position !== 'absolute') continue
      t = Math.max(t, -parseFloat(cs.top) || 0)
      b = Math.max(b, -parseFloat(cs.bottom) || 0)
      e = Math.max(e, -parseFloat(cs.left) || 0)
      d = Math.max(d, -parseFloat(cs.right) || 0)
    }
    const w = r.width + e + d
    const h = r.height + t + b
    if (w < 43.5 || h < 43.5) a.push(`alvo de ${Math.round(w)}×${Math.round(h)} px: ${nome(el)}`)
  }
  return a
}

const aba = (go) => async (p) => {
  await p.goto(`${base}/app/`)
  await p.locator(`.tabbar [data-go="${go}"]`).click()
  await p.waitForTimeout(450)
}
const TELAS = [
  ['site', async (p) => void (await p.goto(`${base}/`))],
  ['roteiros', aba('roteiros')],
  ['teleprompter', aba('tp')],
  [
    'mais-ajustes',
    async (p) => {
      await p.locator('#moreSettings').click()
      await p.waitForTimeout(600)
    },
  ],
  ['ajustes', aba('ajustes')],
  [
    'editor',
    async (p) => {
      await aba('roteiros')(p)
      await p.locator('#newScript').click()
      await p.getByRole('button', { name: 'Escrever' }).click()
      await p.locator('#bodyInput').fill('# Abertura\nUm texto de teste para ler.\n[pausa]\nMais uma linha.')
      await p.waitForTimeout(600)
    },
  ],
  [
    'leitura',
    async (p) => {
      await p.locator('#readBtn').click()
      await p.locator('#prompter').waitFor({ state: 'visible' })
      await p.waitForTimeout(600)
    },
  ],
  ['controle-remoto', async (p) => void (await p.goto(`${base}/app/remote.html`))],
]

for (const [w, h] of [
  [375, 667],
  [393, 852],
  [430, 932],
  [852, 393],
]) {
  test(`iPhone ${w}×${h}: nada mais largo que a tela, campos de 16 px e toque de 44 px`, { skip: pular }, async () => {
    const ctx = await navegador.newContext({ ...pw.devices['iPhone 15 Pro'], viewport: { width: w, height: h }, screen: { width: w, height: h }, serviceWorkers: 'block' })
    const p = await ctx.newPage()
    const erros = []
    p.on('pageerror', (e) => erros.push(e.message))
    const todos = []
    try {
      for (const [nome, ir] of TELAS) {
        // deitado só o que se usa deitado: a leitura e o controle
        if (w > h && !['editor', 'leitura', 'controle-remoto'].includes(nome)) continue
        await ir(p)
        for (const x of await p.evaluate(achados)) todos.push(`${nome}: ${x}`)
      }
    } finally {
      await ctx.close()
    }
    assert.deepEqual(todos, [])
    assert.deepEqual(erros, [])
  })
}
