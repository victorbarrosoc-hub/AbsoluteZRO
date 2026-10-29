// Página inicial no iPhone (relato do titular, 29/10/2026, Safari do iPhone no tema claro): a cápsula do topo fica
// sempre por cima e nada da página aparece entre a barra de status e ela, nem atravessa o vidro, enquanto rola por
// todas as seções; a grade de ícones fica alinhada e sem selo cortado; nada passa da tela nem fica cortado na própria
// caixa; e "Ferramentas que se conectam" não deixa um buraco até a seção seguinte. WebKit e Chromium, 375/393/430 px.
import { expect, test, type Browser, type Page } from '@playwright/test'

const TAMANHOS = [
  { width: 375, height: 812 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
] as const
const NAVEGADORES = ['webkit', 'chromium'] as const

/** Quantos pixels mudam (algum canal > limite) entre duas capturas PNG do mesmo tamanho, decodificadas no navegador. */
async function diferenca(page: Page, a: Buffer, b: Buffer, limite: number) {
  return page.evaluate(
    async ([a64, b64, limite]) => {
      const ler = async (b64: string) => {
        const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
        const c = new OffscreenCanvas(img.width, img.height)
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        return ctx.getImageData(0, 0, img.width, img.height).data
      }
      const [pa, pb] = await Promise.all([ler(a64 as string), ler(b64 as string)])
      let mudou = 0
      let maior = 0
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.max(Math.abs(pa[i]! - pb[i]!), Math.abs(pa[i + 1]! - pb[i + 1]!), Math.abs(pa[i + 2]! - pb[i + 2]!))
        maior = Math.max(maior, d)
        if (d > (limite as number)) mudou++
      }
      return { fracao: mudou / (pa.length / 4), maior }
    },
    [a.toString('base64'), b.toString('base64'), limite] as const,
  )
}

/** Texto que passa da tela ou cortado na própria caixa (com ou sem reticências), fora das faixas que rolam de lado. */
async function achadosDeCorte(page: Page) {
  return page.evaluate(() => {
    const achados: string[] = []
    const vw = document.documentElement.clientWidth
    if (document.documentElement.scrollWidth > vw + 1) achados.push(`página rola de lado (${document.documentElement.scrollWidth} > ${vw})`)
    const textoProprio = (el: Element) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0)
    for (const el of Array.from(document.querySelectorAll('main *'))) {
      if (!textoProprio(el) || el.closest('[aria-hidden="true"], .zro-sr-only')) continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      let faixa = false
      for (let a = el.parentElement; a; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX
        if (ox === 'auto' || ox === 'scroll') faixa = true
      }
      if (faixa) continue
      const cs = getComputedStyle(el)
      const nome = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent ?? '').trim().slice(0, 30)}"`
      if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1) achados.push(`texto cortado: ${nome}`)
      if (r.left < -1 || r.right > vw + 1) achados.push(`fora da tela: ${nome} (${Math.round(r.left)}–${Math.round(r.right)} de ${vw})`)
    }
    return achados
  })
}

async function abrir(browser: Browser, baseURL: string, tamanho: { width: number; height: number }, navegador: string) {
  const context = await browser.newContext({ viewport: tamanho, hasTouch: true, isMobile: navegador === 'chromium', baseURL })
  const page = await context.newPage()
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  return { context, page }
}

for (const navegador of NAVEGADORES) {
  test(`página inicial no iPhone (${navegador}): topo por cima de tudo, ícones alinhados, nada cortado`, async ({ playwright, baseURL }) => {
    test.setTimeout(240_000)
    const browser = await playwright[navegador].launch()
    try {
      for (const tamanho of TAMANHOS) {
        const onde = `${navegador} ${tamanho.width}px`
        const { context, page } = await abrir(browser, baseURL!, tamanho, navegador)

        // Grade de ícones: nome logo abaixo do ícone na mesma altura em cada linha; selo curto e inteiro.
        await page.locator('#ecossistema').scrollIntoViewIfNeeded()
        await page.evaluate(() => {
          for (const a of document.getAnimations()) if (Number.isFinite(a.effect?.getComputedTiming().endTime)) a.finish()
        })
        const grade = await page.locator('.pstrip__list li').evaluateAll((lis) =>
          lis.map((li) => {
            const icone = li.querySelector('.zro-mark')!.getBoundingClientRect()
            const nome = li.querySelector('.pstrip__name')!
            const selo = li.querySelector('.selo-dev')
            const caixa = li.getBoundingClientRect()
            return {
              nome: nome.textContent,
              iconeTopo: Math.round(icone.top),
              nomeTopo: Math.round(nome.getBoundingClientRect().top),
              nomeCabe: nome.scrollWidth <= nome.clientWidth + 1 && nome.getBoundingClientRect().right <= caixa.right + 1,
              selo: selo?.textContent ?? null,
              seloCabe:
                !selo ||
                (selo.scrollWidth <= selo.clientWidth + 1 &&
                  selo.getBoundingClientRect().right <= caixa.right + 1 &&
                  selo.getBoundingClientRect().left >= caixa.left - 1),
            }
          }),
        )
        expect(grade.length, onde).toBeGreaterThan(0)
        const linhas = new Map<number, typeof grade>()
        for (const g of grade) linhas.set(g.iconeTopo, [...(linhas.get(g.iconeTopo) ?? []), g])
        for (const [, linha] of linhas) expect(new Set(linha.map((g) => g.nomeTopo)).size, `${onde}: nomes desalinhados ${JSON.stringify(linha)}`).toBe(1)
        expect(
          grade.filter((g) => !g.nomeCabe || !g.seloCabe),
          `${onde}: nome ou selo cortado`,
        ).toEqual([])
        for (const g of grade) if (g.selo) expect(g.selo, onde).toBe('Em breve')

        // "Ferramentas que se conectam" fica perto da grade e da seção seguinte: nada de tela vazia no meio.
        const buraco = await page.evaluate(() => {
          const regua = document.querySelector('.pstrip__rule')!.getBoundingClientRect()
          const titulo = document.querySelector('#numeros-title')!.getBoundingClientRect()
          return titulo.top - regua.bottom
        })
        expect(buraco, `${onde}: espaço entre a régua e "Em números"`).toBeLessThan(tamanho.height * 0.2)

        // Rola a página inteira: em cada parada, a faixa acima da cápsula e o meio da cápsula ficam iguais com e sem o
        // conteúdo da página (nada aparece por cima nem atravessa o vidro), e nada fica cortado ou fora da tela.
        const altura = await page.evaluate(() => document.documentElement.scrollHeight)
        const cortes = new Set<string>()
        for (let y = 0; y < altura; y += Math.round(tamanho.height * 0.5)) {
          await page.evaluate((y) => window.scrollTo(0, y), y)
          await page.waitForTimeout(150)
          const capsula = (await page.locator('.capsule').boundingBox())!
          expect(capsula.y, `${onde} y=${y}: cápsula no topo`).toBeGreaterThanOrEqual(0)
          expect(capsula.y, `${onde} y=${y}: cápsula no topo`).toBeLessThan(40)
          const faixa = { x: 0, y: 0, width: tamanho.width, height: Math.floor(capsula.y) }
          const meio = { x: capsula.x + 30, y: capsula.y + 6, width: capsula.width - 60, height: capsula.height - 12 }
          const capturar = () => Promise.all([page.screenshot({ clip: faixa }), page.screenshot({ clip: meio })])
          const [faixaCom, meioCom] = await capturar()
          const semPagina = await page.addStyleTag({ content: '.public-main, .public-footer { visibility: hidden !important }' })
          const [faixaSem, meioSem] = await capturar()
          await semPagina.evaluate((s) => (s as Element).remove())
          const f = await diferenca(page, faixaCom, faixaSem, 12)
          expect(f.fracao, `${onde} y=${y}: a página aparece acima da cápsula (maior diferença ${f.maior})`).toBe(0)
          const m = await diferenca(page, meioCom, meioSem, 28)
          expect(m.fracao, `${onde} y=${y}: a página atravessa a cápsula (maior diferença ${m.maior})`).toBeLessThan(0.002)
          for (const c of await achadosDeCorte(page)) cortes.add(c)
        }
        expect([...cortes], `${onde}: corte ou rolagem de lado`).toEqual([])
        await context.close()
      }
    } finally {
      await browser.close()
    }
  })
}
