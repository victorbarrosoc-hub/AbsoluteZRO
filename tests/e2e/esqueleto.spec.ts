/**
 * Início sem piscar cinza (titular, 29/10/2026, vídeo no Mac: ao recarregar, o esqueleto aparecia por ~200 ms com
 * outro formato e a tela pulava por cima). Com o banco rápido, nenhum quadro mostra esqueleto, nem na carga inteira
 * nem vindo de outra aba (menu com a troca animada, logo sem ela), no Chromium e no WebKit; a tela não se mexe depois
 * de pintada (layout-shift < 0,05 no Chromium; no WebKit, o palco e os atalhos nascem no lugar final). O esqueleto
 * tem a forma da tela real (mesmas classes) e só aparece depois de 320 ms; com "reduzir movimento", nada anima.
 * components/esqueleto.tsx, lib/esqueleto-script.ts e o bloco "esqueleto" de app/globals.css.
 */
import { randomUUID } from 'node:crypto'
import { chromium, expect, test, webkit, type Browser, type BrowserType, type Page } from '@playwright/test'
import postgres from 'postgres'
import { criarConta } from './conversa'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'

type Amostra = { esqMax: number; quadros: number; cls: number; hero: number[]; quick: number[] }

/**
 * Amostra cada quadro (e a cada 10 ms: o WebKit headless do CI chega a dar só 3 quadros por segundo) a maior opacidade
 * de esqueleto pintado e onde o palco e os atalhos de verdade estão.
 */
function sonda() {
  const w = window as unknown as { __a: Amostra }
  w.__a = { esqMax: 0, quadros: 0, cls: 0, hero: [], quick: [] }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) w.__a.cls += e.value
    }).observe({ type: 'layout-shift', buffered: true })
  } catch {
    // WebKit não mede layout-shift: vale a posição do palco e dos atalhos
  }
  const t0 = performance.now()
  const topo = (sel: string) => {
    // fora do esqueleto e já na tela (o HTML em streaming chega antes num <div hidden>, sem caixa)
    const el = [...document.querySelectorAll(sel)].find((e) => !e.closest('[data-esqueleto]') && e.getClientRects().length)
    return el ? Math.round(el.getBoundingClientRect().top + scrollY) : null
  }
  const amostrar = () => {
    const a = w.__a
    a.quadros++
    for (const e of document.querySelectorAll<HTMLElement>('[data-esqueleto]')) {
      const r = e.getBoundingClientRect()
      if (r.width && r.height) a.esqMax = Math.max(a.esqMax, Number(getComputedStyle(e).opacity))
    }
    for (const [k, sel] of [
      ['hero', '.home-hero'],
      ['quick', '.quick'],
    ] as const) {
      const y = topo(sel)
      if (y != null && a[k].at(-1) !== y) a[k].push(y)
    }
  }
  const passo = () => {
    amostrar()
    if (performance.now() - t0 < 3000) requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
  const relogio = setInterval(() => (performance.now() - t0 < 3000 ? amostrar() : clearInterval(relogio)), 10)
}

async function lerAmostra(page: Page): Promise<Amostra> {
  await page.waitForFunction(() => (window as unknown as { __a?: Amostra }).__a?.hero.length, null, { timeout: 15_000 })
  await page.waitForTimeout(700)
  return page.evaluate(() => (window as unknown as { __a: Amostra }).__a)
}

function conferir(a: Amostra, onde: string) {
  expect(a.quadros, `${onde}: amostrou quadros`).toBeGreaterThan(3)
  expect(a.esqMax, `${onde}: nenhum quadro com esqueleto à vista`).toBeLessThan(0.05)
  expect(a.hero, `${onde}: o palco nasce no lugar final`).toHaveLength(1)
  expect(a.quick, `${onde}: os atalhos nascem no lugar final`).toHaveLength(1)
  expect(a.cls, `${onde}: layout-shift`).toBeLessThan(0.05)
}

let estado: Awaited<ReturnType<ReturnType<Page['context']>['storageState']>>

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage()
  await page.goto('/criar-conta')
  await criarConta(page, { nome: 'Pessoa Esqueleto', email: `e2e-${randomUUID().slice(0, 8)}@teste.absolutezro.local`, senha: 'senha-e2e-segura-1' })
  await page.waitForURL('**/boas-vindas')
  await page.getByLabel('Nome').fill('Org esqueleto')
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
  estado = await page.context().storageState()
  await page.close()
})

for (const [nome, tipo] of [
  ['Chromium', chromium],
  ['WebKit', webkit],
] as [string, BrowserType][]) {
  test(`Início sem piscar cinza nem pular (${nome}): recarregar, menu e logo`, async ({ baseURL }) => {
    const b: Browser = await tipo.launch()
    try {
      const ctx = await b.newContext({ baseURL, viewport: { width: 1440, height: 900 }, storageState: estado })
      await ctx.addInitScript(sonda)
      const page = await ctx.newPage()
      await page.goto('/inicio')
      await page.waitForLoadState('networkidle')
      // a tela do Início leva o esqueleto com a forma dela (aparece só se o banco demorar)
      await page.reload()
      conferir(await lerAmostra(page), `${nome}, recarregar`)

      const menu = page.locator('.sidebar')
      for (const [como, clicar] of [
        ['menu', () => menu.getByRole('link', { name: 'Início', exact: true }).click()],
        ['logo', () => menu.locator('.sidebar__brand a').click()],
      ] as const) {
        await menu.getByRole('link', { name: 'Meus projetos', exact: true }).click()
        await page.waitForURL('**/projetos')
        await expect(page.locator('#conteudo > .z-pagina')).toHaveCount(1)
        await page.evaluate(sonda)
        await clicar()
        await page.waitForURL('**/inicio')
        conferir(await lerAmostra(page), `${nome}, ${como}`)
        await expect(page.locator('#conteudo [data-esqueleto]')).toHaveCount(0)
      }
      await ctx.close()
    } finally {
      await b.close()
    }
  })
}

/** Segura a tabela de cotas (só os painéis do Início a leem): o topo chega, os painéis esperam até `soltar`. */
async function comPaineisPresos(fn: (soltar: () => void) => Promise<void>) {
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  let soltar!: () => void
  const solto = new Promise<void>((r) => (soltar = r))
  let preso!: () => void
  const travado = new Promise<void>((r) => (preso = r))
  const tx = sql.begin(async (t) => {
    await t`lock table zro.quotas in access exclusive mode`
    preso()
    await solto
  })
  await travado
  try {
    await fn(soltar)
  } finally {
    soltar()
    await tx
    await sql.end()
  }
}

type Lento = { linha: [number, number][]; copias: number; meio: number }

/**
 * Idade e opacidade do esqueleto a cada quadro (e a cada 10 ms, como em `sonda`), e as cópias que fazem a dissolvência
 * (fim do body), contadas quando entram: vivem 260 ms, menos que o intervalo entre quadros do WebKit headless do CI.
 */
function sondaLenta() {
  const w = window as unknown as { __l: Lento }
  w.__l = { linha: [], copias: 0, meio: 0 }
  let nasceu = 0
  const amostrar = () => {
    const e = document.querySelector<HTMLElement>('#conteudo [data-esqueleto]')
    if (e) {
      nasceu ||= performance.now()
      const op = Number(getComputedStyle(e).opacity)
      w.__l.linha.push([Math.round(performance.now() - nasceu), op])
      if (op > 0.05 && op < 0.95) w.__l.meio++
    }
  }
  const passo = () => {
    amostrar()
    requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
  setInterval(amostrar, 10)
  new MutationObserver((ms) => {
    for (const m of ms)
      for (const n of m.addedNodes)
        if (n instanceof HTMLElement && n.parentNode === document.body && n.matches('[aria-hidden="true"].inicio-paineis')) w.__l.copias++
  }).observe(document, { childList: true, subtree: true })
}

const caixas = (page: Page, raiz: string) =>
  page.evaluate((raiz) => {
    const r = document.querySelector(raiz)!
    const c = (sel: string) => {
      const b = r.querySelector(sel)!.getBoundingClientRect()
      return [Math.round(b.top + scrollY), Math.round(b.height)]
    }
    return { stats: c('.stats'), paineis: c('.grid--2'), apps: c('.app-grid')[0] }
  }, raiz)

for (const [nome, tipo, reduzir] of [
  ['Chromium', chromium, false],
  ['WebKit', webkit, false],
  ['Chromium, reduzir movimento', chromium, true],
] as [string, BrowserType, boolean][]) {
  test(`banco lento (${nome}): esqueleto só depois de 320 ms, com a forma real, e o conteúdo ${reduzir ? 'troca seco' : 'dissolve por cima'}`, async ({
    baseURL,
  }) => {
    const b = await tipo.launch()
    try {
      const ctx = await b.newContext({
        baseURL,
        viewport: { width: 1440, height: 900 },
        storageState: estado,
        reducedMotion: reduzir ? 'reduce' : 'no-preference',
      })
      await ctx.addInitScript(sondaLenta)
      const page = await ctx.newPage()
      await comPaineisPresos(async (soltar) => {
        await page.goto('/inicio', { waitUntil: 'commit' })
        // o topo (saudação, palco, atalhos) chega sem esperar os painéis
        await expect(page.locator('#conteudo .greet h1', { hasText: 'Olá' })).toBeVisible()
        const esq = page.locator('#conteudo [data-esqueleto]')
        await expect(esq).toHaveCount(1)
        await expect.poll(() => esq.evaluate((e) => getComputedStyle(e).opacity), { timeout: 5000 }).toBe('1')
        const antes = await caixas(page, '#conteudo [data-esqueleto]')
        soltar()
        await expect(esq).toHaveCount(0)
        await expect(page.locator('#conteudo .inicio-paineis .zro-stat').first()).toBeVisible()
        const depois = await caixas(page, '#conteudo .inicio-paineis')
        expect(depois.stats, 'os números ficam onde o esqueleto estava').toEqual(antes.stats)
        // conta nova (painéis vazios): a grade dos painéis tem a altura do esqueleto e os apps começam no mesmo lugar
        expect(depois.paineis, 'os painéis ocupam o lugar do esqueleto').toEqual(antes.paineis)
        expect(depois.apps, 'os apps começam onde o esqueleto deles estava').toBe(antes.apps)
      })
      await page.waitForTimeout(500)
      const l = await page.evaluate(() => (window as unknown as { __l: Lento }).__l)
      const cedo = l.linha.filter(([idade]) => idade < 300)
      expect(cedo.length, 'amostrou o começo').toBeGreaterThan(0)
      expect(Math.max(...cedo.map(([, op]) => op)), 'invisível antes de 300 ms').toBeLessThan(0.05)
      if (reduzir) {
        expect(l.meio, 'aparece seco, sem meio-termo').toBe(0)
        expect(l.copias, 'sem dissolvência').toBe(0)
      } else {
        expect(l.copias, 'a cópia do esqueleto dissolve por cima do conteúdo').toBeGreaterThan(0)
      }
      await expect(page.locator('body > [aria-hidden="true"].inicio-paineis')).toHaveCount(0)
      await ctx.close()
    } finally {
      await b.close()
    }
  })
}
