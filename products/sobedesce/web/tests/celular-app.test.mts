/**
 * O app do celular (public/app) no Safari do iPhone (WebKit do Playwright; revisão do titular de 01/11/2026): Início,
 * Drive, a ficha de um arquivo do Drive, "Trocar" o destino, Aparelhos e Criar, em 375, 393 e 430 px e deitado
 * (852 × 393). Confere que a página nunca fica mais larga que a tela, que todo campo tem 16 px ou mais e que todo botão
 * à vista (só o que está por cima) tem 44 × 44 px de toque. A conta e o Drive são de mentira (rotas), nada sai para a
 * internet. Usa o Playwright da raiz do repositório; sem ele (ou sem o WebKit), pula.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

const PUBLICO = fileURLToPath(new URL('../public/', import.meta.url))
let pw: any = null
try {
  pw = createRequire(new URL('../../../../package.json', import.meta.url))('playwright')
} catch {}
let navegador: any = null
try {
  navegador = pw ? await pw.webkit.launch() : null
} catch {}
const pular = !navegador && 'sem o Playwright/WebKit da raiz'

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
}
let servidor: Server
let base = ''

before(async () => {
  servidor = createServer(async (q, r) => {
    let f = normalize(join(PUBLICO, decodeURIComponent((q.url ?? '/').split('?')[0])))
    if (!f.startsWith(PUBLICO)) return void r.writeHead(403).end()
    try {
      if ((await stat(f)).isDirectory()) f = join(f, 'index.html')
      r.writeHead(200, { 'content-type': TIPOS[extname(f)] ?? 'application/octet-stream' }).end(await readFile(f))
    } catch {
      r.writeHead(404).end()
    }
  })
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`
})
after(async () => {
  await navegador?.close()
  servidor?.close()
})

const ARQUIVOS = [
  { id: 'p1', name: 'Clientes', mimeType: 'application/vnd.google-apps.folder', modifiedTime: '2026-10-30T12:00:00Z' },
  {
    id: 'f1',
    name: 'A001C003_241030_R1AB_entrevista.mov',
    mimeType: 'video/quicktime',
    size: '8123456789',
    md5Checksum: 'a'.repeat(32),
    modifiedTime: '2026-10-28T12:00:00Z',
  },
  { id: 'f2', name: 'trilha.wav', mimeType: 'audio/wav', size: '45678901', md5Checksum: 'b'.repeat(32), modifiedTime: '2026-10-27T12:00:00Z' },
]

async function contexto(w: number, h: number) {
  const ctx = await navegador.newContext({
    ...pw.devices['iPhone 15 Pro'],
    viewport: { width: w, height: h },
    screen: { width: w, height: h },
    serviceWorkers: 'block',
  })
  // o tsx (esbuild) põe `__name(...)` nas funções; a que vai para a página (achados) precisa dele lá também
  await ctx.addInitScript('globalThis.__name = (f) => f')
  await ctx.route(`${base}/api/**`, (r: any) => {
    const u = r.request().url()
    if (u.endsWith('/api/eu'))
      return r.fulfill({
        json: {
          usuario: { id: 'u1', nome: 'Pessoa Teste', email: 'pessoa@exemplo.com' },
          contas: [{ id: 'g1', email: 'pessoa@exemplo.com', nome: 'Pessoa', fotoUrl: null, estado: 'ok' }],
          recursos: {},
        },
      })
    if (u.endsWith('/api/drive/token')) return r.fulfill({ json: { accessToken: 'ya29.teste', expiraEm: Date.now() + 3600e3, email: 'pessoa@exemplo.com' } })
    return r.fulfill({ status: 404, json: {} })
  })
  await ctx.route('https://www.googleapis.com/**', (r: any) =>
    r.fulfill({
      json: {
        storageQuota: { limit: '2199023255552', usage: '612000000000' },
        files: ARQUIVOS,
        user: { emailAddress: 'pessoa@exemplo.com', displayName: 'Pessoa' },
      },
    }),
  )
  await ctx.route(/^https:\/\/(?!www\.googleapis\.com)/, (r: any) => r.fulfill({ status: 404, body: '' }))
  return ctx
}

/** Página larga, campo abaixo de 16 px e alvo de toque abaixo de 44 × 44 (conta a área estendida por ::after). */
function achados() {
  const a: string[] = []
  const vw = document.documentElement.clientWidth
  if (document.documentElement.scrollWidth > vw + 1) a.push(`página rola de lado (${document.documentElement.scrollWidth} > ${vw})`)
  const porCima = (el: Element) => {
    const r = el.getBoundingClientRect()
    if (r.width <= 2 || r.height <= 2 || r.bottom <= 0 || r.top >= innerHeight) return false
    if (!(el as any).checkVisibility({ opacityProperty: true, visibilityProperty: true }) || el.closest("[aria-hidden='true'], [inert]")) return false
    const no = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, r.top + r.height / 2))
    return !!no && (el.contains(no) || no.contains(el))
  }
  const nome = (el: Element) =>
    `${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className.split(' ')[0] : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`
  for (const c of Array.from(document.querySelectorAll('input, select, textarea'))) {
    if (['hidden', 'checkbox', 'radio', 'range', 'file', 'color', 'submit', 'button'].includes((c as HTMLInputElement).type) || !porCima(c)) continue
    const px = parseFloat(getComputedStyle(c).fontSize)
    if (px < 16) a.push(`campo com ${px}px: ${nome(c)}`)
  }
  for (const el of Array.from(document.querySelectorAll("button, a[href], select, summary, [role='button'], [role='tab']"))) {
    if (!porCima(el)) continue
    if (
      el.tagName === 'A' &&
      getComputedStyle(el).display === 'inline' &&
      Array.from(el.parentElement?.childNodes ?? []).some((n) => n.nodeType === 3 && n.textContent?.trim())
    )
      continue
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

for (const [w, h] of [
  [375, 667],
  [393, 852],
  [430, 932],
  [852, 393],
]) {
  test(`app do celular a ${w}×${h}: nada mais largo que a tela, campos de 16 px e toque de 44 px`, { skip: pular }, async () => {
    const ctx = await contexto(w, h)
    const p = await ctx.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))
    const todos: string[] = []
    const ver = async (nome: string) => {
      await p.waitForTimeout(900)
      for (const x of await p.evaluate(achados)) todos.push(`${nome}: ${x}`)
    }
    const aba = async (rotulo: string) => {
      await p.locator('.tabbar .tab', { hasText: rotulo }).first().click()
      await ver(rotulo)
    }
    try {
      await p.goto(`${base}/app/`)
      await p.locator('.tabbar').waitFor({ timeout: 60_000 })
      await ver('Início')
      await p.getByText('Trocar').first().click()
      await ver('Trocar o destino')
      await p.goto(`${base}/app/`)
      await p.locator('.tabbar').waitFor({ timeout: 60_000 })
      await aba('Drive')
      await p.getByText('trilha.wav').first().click()
      await ver('arquivo do Drive')
      await p.goto(`${base}/app/`)
      await p.locator('.tabbar').waitFor({ timeout: 60_000 })
      await aba('Aparelhos')
      await aba('Criar')
    } finally {
      await ctx.close()
    }
    assert.deepEqual(todos, [])
    assert.deepEqual(erros, [])
  })
}
