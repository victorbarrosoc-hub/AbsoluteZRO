// A página inicial: as contas da vitrine (app/vitrine.js) iguais às do conversor e, no Chromium, as telas de verdade
// nos dois temas, o "Experimente", as abas pelo teclado, o "Cabe no limite", a conta, o celular sem rolar de lado e
// nenhum "grátis" no texto.

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { GRUPOS, PRESETS, preset } from '../src/presets.js'
import { planejar } from '../src/plano.js'
import { caber, DEMO, demonstrar, ficha, LIMITES_MB, MASTER } from '../app/vitrine.js'
import { servir } from '../scripts/servir.mjs'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

describe('vitrine (sem navegador)', () => {
  test('o Experimente usa o plano do conversor: faixas, preencher, só áudio e limite', () => {
    const reels = demonstrar('reels')
    assert.deepEqual(
      reels.linhas.find(([k]) => k === 'Tamanho'),
      ['Tamanho', '1080×1920 (com faixas)'],
    )
    assert.equal(reels.encaixe, 'contain')
    assert.equal(reels.proporcao, 1080 / 1920)
    assert.deepEqual(
      demonstrar('reels', true).linhas.find(([k]) => k === 'Tamanho'),
      ['Tamanho', '1080×1920 (preenchendo)'],
    )
    const mp3 = demonstrar('mp3')
    assert.equal(mp3.proporcao, null)
    assert.ok(!mp3.linhas.some(([k]) => k === 'Tamanho'))
    assert.deepEqual(
      demonstrar('discord').linhas.find(([k]) => k === 'Limite'),
      ['Limite', '20 MB'],
    )
    for (const id of DEMO) {
      assert.ok(preset(id), id)
      assert.match(demonstrar(id).linhas.at(-1)[1], /^~[\d,]+ (MB|GB)$/)
    }
  })

  test('Cabe no limite: a resolução é a do "Tamanho exato" e cresce com os MB', () => {
    let antes = 0
    for (const mb of LIMITES_MB) {
      const r = caber(mb)
      const p = planejar(MASTER, 'tamanho', { tamanhoMB: mb })
      assert.equal(r.largura, p.video.largura)
      assert.ok(r.largura >= antes, `${mb} MB`)
      antes = r.largura
    }
    assert.equal(caber(20).largura, 960)
    assert.equal(caber(500).largura, 3840)
  })

  test('o resumo de cada destino é curto e sem "grátis"', () => {
    for (const p of PRESETS) {
      const f = ficha(p)
      assert.ok(f.length > 3 && f.length < 48, `${p.id}: ${f}`)
      assert.doesNotMatch(f, /gr[aá]tis/i)
    }
  })

  test('cada tela da página existe nos dois temas e é leve', () => {
    const telas = [...html.matchAll(/data-tela="([^"]+)"/g)].map((m) => m[1])
    assert.ok(telas.length >= 5)
    for (const t of new Set(telas))
      for (const tema of ['claro', 'escuro']) {
        const f = new URL(`../app/inicio/telas/${t}-${tema}.webp`, import.meta.url)
        assert.ok(existsSync(f), `${t}-${tema}`)
        assert.ok(readFileSync(f).length < 200_000, `${t}-${tema} passa de 200 KB`)
      }
    assert.ok(readFileSync(new URL('../app/inicio/praia.webp', import.meta.url)).length < 200_000)
  })

  test('SEO e a página: título, descrição, OG, canonical e o topo com <nav> (o Set e a conta entram nele)', () => {
    assert.match(html, /<title>Relay · [^<]+<\/title>/)
    for (const m of ['name="description"', 'property="og:title"', 'property="og:image"', 'name="twitter:card"', 'rel="canonical"'])
      assert.ok(html.includes(m), m)
    assert.match(html, /<header class="topo">[\s\S]*<nav [^>]*>[\s\S]*<\/nav>[\s\S]*<\/header>/)
    assert.match(html, /data-heroi-segunda/)
    assert.doesNotMatch(html, /gr[aá]tis/i)
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1)
  })
})

describe('página inicial no Chromium', () => {
  let srv, navegador, base
  let conta = 'fora'
  const erros = []
  const EU = { ok: true, acesso: true, pessoa: { id: 'c0ffee', nome: 'Lia Produtora', email: 'lia@produtora.com', foto: null } }

  before(async () => {
    srv = await servir({
      porta: 0,
      extra: async (req, res) => {
        const json = (o, s = 200) => (res.writeHead(s, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(o)), true)
        if (req.url === '/api/zro/eu') return json(conta === 'dentro' ? EU : { ok: false, configurado: conta === 'fora' })
        if (req.url.startsWith('/api/zro/set')) return json({ ok: false }, 401)
        return false
      },
    })
    base = `http://127.0.0.1:${srv.address().port}`
    navegador = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
  })
  after(async () => {
    await navegador?.close()
    srv?.close()
  })

  const abrir = async (opcoes = {}, antes = null) => {
    const ctx = await navegador.newContext({ reducedMotion: 'reduce', ...opcoes })
    if (antes) await ctx.addInitScript(antes)
    const p = await ctx.newPage()
    p.on('pageerror', (e) => erros.push(e.message))
    p.on('console', (m) => m.type() === 'error' && !/absolutezro\.com\/set/.test(m.text()) && erros.push(m.text()))
    await p.goto(`${base}/`)
    await p.waitForSelector('.destino')
    return { ctx, p }
  }

  test('monta tudo dos dados, sem erro e sem "grátis" (nem em title ou aria)', async () => {
    const { ctx, p } = await abrir()
    assert.equal(await p.locator('.destino').count(), PRESETS.length)
    assert.equal(await p.locator('[data-destinos-abas] [role="tab"]').count(), GRUPOS.length)
    assert.equal(await p.textContent('.numeros [data-contar="destinos"]'), String(PRESETS.length))
    assert.equal(await p.locator('.orbita-app').count(), 7)
    const tudo = await p.evaluate(
      () => document.body.innerText + [...document.querySelectorAll('*')].flatMap((n) => [...n.attributes].map((a) => a.value)).join(' '),
    )
    assert.doesNotMatch(tudo, /gr[aá]tis/i)
    // todas as imagens visíveis carregaram e todo botão/link tem nome
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) (scrollTo(0, y), await new Promise((r) => setTimeout(r, 20)))
    })
    await p.waitForFunction(() => [...document.images].filter((i) => i.offsetParent).every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15_000 })
    const semNome = await p.evaluate(
      () =>
        [...document.querySelectorAll('a, button, input')].filter(
          (n) => n.offsetParent && !(n.getAttribute('aria-label') || n.textContent.trim() || n.labels?.length || n.title),
        ).length,
    )
    assert.equal(semNome, 0)
    // com "reduzir movimento", nada fica escondido esperando a rolagem
    assert.equal(await p.locator('[data-revelar]:not(.visivel)').evaluateAll((ns) => ns.filter((n) => getComputedStyle(n).opacity !== '1').length), 0)
    await ctx.close()
    assert.deepEqual(erros, [])
  })

  test('Experimente: o destino muda a tela e a ficha; preencher corta; MP3 vira só áudio; setas trocam', async () => {
    const { ctx, p } = await abrir()
    const tamanho = () => p.locator('[data-demo-ficha] dt:text-is("Tamanho") + dd').textContent()
    assert.equal(await p.getAttribute('.demo-destino[aria-checked="true"]', 'data-id'), 'reels')
    assert.equal(await tamanho(), '1080×1920 (com faixas)')
    await p.click('.demo-preencher')
    assert.equal(await tamanho(), '1080×1920 (preenchendo)')
    assert.equal(await p.getAttribute('[data-demo-tela]', 'data-encaixe'), 'cover')
    await p.click('.demo-destino[data-id="feed"]')
    assert.equal(await tamanho(), '1080×1350 (preenchendo)')
    const [w, h] = await p.$eval('[data-demo-tela]', (n) => [parseFloat(n.style.width), parseFloat(n.style.height)])
    assert.ok(Math.abs(w / h - 1080 / 1350) < 0.02, `${w}×${h}`)
    await p.click('.demo-destino[data-id="youtube-4k"]')
    assert.equal(await p.isVisible('[data-demo-preencher-linha]'), false, 'sem tela fixa, sem a chave')
    await p.focus('.demo-destino[aria-checked="true"]')
    await p.keyboard.press('ArrowUp')
    assert.equal(await p.evaluate(() => document.activeElement.dataset.id), 'mp3')
    assert.equal(await p.getAttribute('[data-demo-link]', 'href'), 'converter?preset=mp3')
    assert.equal(await p.locator('[data-demo-tela].demo-tela--audio').count(), 1)
    assert.equal(await p.locator('[data-demo-ficha] dt:text-is("Tamanho")').count(), 0)
    await ctx.close()
  })

  test('abas pelo teclado (Ferramentas e grupos) e Cabe no limite', async () => {
    const { ctx, p } = await abrir()
    await p.focus('#aba-converter')
    await p.keyboard.press('ArrowRight')
    assert.equal(await p.getAttribute('#aba-fila', 'aria-selected'), 'true')
    assert.equal(await p.isVisible('#painel-fila'), true)
    assert.equal(await p.isVisible('#painel-converter'), false)
    await p.keyboard.press('End')
    assert.equal(await p.evaluate(() => document.activeElement.id), 'aba-painel')
    await p.click('[data-destinos-abas] [role="tab"]:has-text("Áudio")')
    const visiveis = await p.locator('.grupo:not([hidden]) .destino').allTextContents()
    assert.equal(visiveis.length, PRESETS.filter((x) => x.grupo === 'Áudio').length)
    assert.ok(visiveis.some((t) => t.includes('MP3 320')))
    await p.locator('[data-limite]').fill(String(LIMITES_MB.indexOf(100)))
    assert.equal(await p.textContent('[data-limite-tamanho]'), `${caber(100).largura}×${caber(100).altura}`)
    assert.equal(await p.textContent('[data-limite-mb]'), '100 MB')
    assert.match(await p.getAttribute('[data-limite]', 'aria-valuetext'), /^100 MB: 1920×1080/)
    await ctx.close()
  })

  test('tema escuro: as telas trocam pelas escuras', async () => {
    const { ctx, p } = await abrir()
    assert.match(await p.getAttribute('.palco .macbook img', 'src'), /converter-mac-claro\.webp$/)
    await p.click('[data-tema-botao]')
    assert.match(await p.getAttribute('.palco .macbook img', 'src'), /converter-mac-escuro\.webp$/)
    assert.ok((await p.$$eval('img[data-tela]', (is) => is.map((i) => i.getAttribute('src')))).every((s) => s.endsWith('-escuro.webp')))
    await ctx.close()
  })

  test('a conta: fora chama para entrar; dentro abre o painel; sem login no endereço, sem botão', async () => {
    conta = 'fora'
    let { ctx, p } = await abrir()
    await p.waitForSelector('[data-conta-acao]:not([hidden])')
    assert.equal(await p.getAttribute('[data-conta-acao]', 'href'), '/api/zro/entrar?volta=%2Fpainel')
    assert.equal(await p.textContent('[data-heroi-segunda]'), 'Ver as ferramentas')
    await ctx.close()

    conta = 'dentro'
    ;({ ctx, p } = await abrir())
    await p.waitForSelector('[data-conta-acao]:not([hidden])')
    assert.equal(await p.getAttribute('[data-conta-acao]', 'href'), '/painel')
    await p.waitForFunction(() => document.querySelector('[data-heroi-segunda]').textContent === 'Seu painel')
    assert.equal(await p.getAttribute('[data-heroi-segunda]', 'href'), '/painel')
    await p.waitForSelector('[data-conta]')
    await ctx.close()

    conta = 'desligado'
    ;({ ctx, p } = await abrir())
    await p.waitForTimeout(300)
    assert.equal(await p.isVisible('[data-conta-acao]'), false)
    await ctx.close()
    conta = 'fora'
  })

  test('iPhone (390 px) e 1440 px: nada rola para o lado, com e sem movimento', async () => {
    for (const [largura, movimento] of [
      [390, 'reduce'],
      [390, 'no-preference'],
      [1440, 'no-preference'],
    ]) {
      const { ctx, p } = await abrir({ viewport: { width: largura, height: 844 }, reducedMotion: movimento, isMobile: largura < 500, hasTouch: largura < 500 })
      await p.waitForTimeout(400)
      for (const y of [0, 2000, 6000, 99_999]) {
        await p.evaluate((y) => scrollTo(0, y), y)
        const [doc, tela] = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
        assert.equal(doc, tela, `${largura}px, ${movimento}, y=${y}: rola para o lado`)
      }
      await ctx.close()
    }
    assert.deepEqual(erros, [])
  })
})
