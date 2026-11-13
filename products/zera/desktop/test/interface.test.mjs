// ZERA · a interface no Chromium de verdade, com o window.zera de mentira (test/falso.js): o caminho inteiro de quem
// usa (disco → varredura → mapa → limpar → cesta → revisão → Lixo), teclado, tema e "reduzir movimento".
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const PAGINA = pathToFileURL(path.join(aqui, '..', 'desktop', 'interface', 'index.html')).href
const FALSO = path.join(aqui, 'falso.js')

let navegador
before(async () => {
  navegador = await chromium.launch()
})
after(async () => {
  await navegador.close()
})

async function abrir(opcoes = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 1180, height: 760 }, ...opcoes })
  await ctx.addInitScript({ path: FALSO })
  const p = await ctx.newPage()
  const erros = []
  p.on('pageerror', (e) => erros.push(e.message))
  p.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
  await p.goto(PAGINA)
  await p.waitForSelector('[data-pronto="1"]')
  return { p, ctx, erros }
}

test('do disco ao Lixo: varrer, explorar, separar, revisar e mover', async () => {
  const { p, ctx, erros } = await abrir()
  // discos
  await p.waitForSelector('.disco')
  assert.equal(await p.locator('.disco').count(), 2)
  assert.match(await p.locator('.disco').first().innerText(), /Macintosh HD[\s\S]*74 GB livres de 1 TB[\s\S]*Varrer/)
  assert.match(await p.locator('.disco').nth(1).innerText(), /Visto há 3 horas[\s\S]*Abrir/)

  // varredura → mapa
  await p.locator('.disco').first().click()
  await p.waitForSelector('#tela-mapa:not([hidden])')
  assert.equal(await p.locator('#lista-titulo').innerText(), 'Macintosh HD')
  const nomes = await p.locator('.item .item-nome em').allInnerTexts()
  assert.deepEqual(nomes, ['Users', 'Applications', 'System', 'Library'])
  assert.ok((await p.locator('#anel .fatia').count()) > 10, 'o anel tem fatias')

  // entrar em pastas pela lista e voltar pelo teclado
  await p.locator('.item', { hasText: 'Users' }).click()
  await p.locator('.item', { hasText: 'ana' }).click()
  await p.waitForFunction(() => document.querySelector('#lista-titulo').textContent === 'ana')
  assert.deepEqual(await p.locator('#trilha button').allInnerTexts(), ['Macintosh HD', 'Users', 'ana'])
  await p.keyboard.press('Escape')
  await p.waitForFunction(() => document.querySelector('#lista-titulo').textContent === 'Users')
  await p.locator('.item', { hasText: 'ana' }).click()
  await p.waitForFunction(() => document.querySelector('#lista-titulo').textContent === 'ana')

  // pôr uma pasta na cesta pela lista
  await p.locator('.item', { hasText: 'Downloads' }).locator('.marca').click()
  await p.waitForSelector('#cesta:not([hidden])')
  assert.match(await p.locator('#cesta').innerText(), /4,6 GB\s+em 1 item/)

  // limpar: grupos, do que volta sozinho para o que pede conferência
  await p.click('[data-aba="limpar"]')
  await p.waitForSelector('.cartao')
  const titulos = await p.locator('.cartao h3').allInnerTexts()
  assert.equal(titulos[0], 'Caches de edição')
  assert.ok(titulos.indexOf('Caches de apps') < titulos.indexOf('Instaladores'))
  assert.equal(titulos.at(-1), 'No Lixo')
  assert.match(await p.locator('#limpar-titulo').innerText(), /Dá para liberar/)

  // grupo "volta sozinho" já vem marcado
  await p.locator('.cartao', { hasText: 'Caches de edição' }).click()
  await p.waitForSelector('.folha[open] .linha')
  assert.equal(await p.locator('.folha .marca:checked').count(), 2)
  await p.locator('.folha-pe .vidro--tinta').click()
  await p.waitForFunction(() => !document.querySelector('#folha').open)
  assert.match(await p.locator('#cesta').innerText(), /em 3 itens/)

  // repetidos: fica o original, a cópia vai marcada
  await p.locator('.cartao', { hasText: 'Repetidos' }).click()
  await p.waitForSelector('.grupo-dup')
  assert.equal(await p.locator('.folha .fica').count(), 1)
  await p.locator('.folha-pe .vidro', { hasText: 'Fechar' }).click()

  // revisão: o app confere e mostra o total; nada de "null" solto
  await p.click('#btn-revisar')
  await p.waitForSelector('.folha-topo h2')
  assert.match(await p.locator('.folha-topo h2').innerText(), /Tirar 60,6 GB\?/)
  assert.doesNotMatch(await p.locator('#folha').innerText(), /null|undefined|NaN/)
  await p.locator('.folha-pe .vidro--tinta', { hasText: 'Mover para o Lixo' }).click()
  await p.waitForSelector('.resultado')
  await p.waitForFunction(() => document.querySelector('.resultado strong').textContent === '60,6 GB')
  assert.match(await p.locator('.resultado').innerText(), /3 itens foram para o Lixo/)
  assert.equal(await p.evaluate(() => window.__lixo), 3)
  await p.locator('.resultado .vidro', { hasText: 'Abrir o Lixo' }).click()
  assert.equal(await p.evaluate(() => window.__abriuLixo), true)
  await p.locator('.resultado .vidro--tinta').click()
  await p.waitForFunction(() => !document.querySelector('#folha').open)
  assert.ok(await p.locator('#cesta').isHidden(), 'a cesta esvazia')

  // o que saiu some do mapa
  await p.click('[data-aba="mapa"]')
  assert.equal(await p.locator('.item', { hasText: 'Downloads' }).count(), 0)
  assert.deepEqual(erros, [])
  await ctx.close()
})

test('tema escuro, teclado na lista e mostrar no Finder', async () => {
  const { p, ctx, erros } = await abrir()
  assert.equal(await p.getAttribute('html', 'data-tema'), 'claro', 'claro é o padrão')
  await p.click('#btn-tema')
  assert.equal(await p.getAttribute('html', 'data-tema'), 'escuro')
  await p.locator('.disco').first().click()
  await p.waitForSelector('#tela-mapa:not([hidden])')
  await p.keyboard.press('ArrowDown')
  assert.equal(await p.locator('.item.selecionado .item-nome em').innerText(), 'Users')
  await p.keyboard.press('ArrowDown')
  assert.equal(await p.locator('.item.selecionado .item-nome em').innerText(), 'Applications')
  await p.keyboard.press(' ')
  await p.waitForSelector('#cesta:not([hidden])')
  await p.locator('.item.selecionado .mostrar').click()
  assert.equal(typeof (await p.evaluate(() => window.__mostrado)), 'number')
  await p.keyboard.press('Enter')
  await p.waitForFunction(() => document.querySelector('#lista-titulo').textContent === 'Applications')
  assert.deepEqual(erros, [])
  await ctx.close()
})

test('com "reduzir movimento" tudo funciona sem esperar animação', async () => {
  const { p, ctx, erros } = await abrir({ reducedMotion: 'reduce' })
  await p.locator('.disco').first().click()
  await p.waitForSelector('#tela-mapa:not([hidden])')
  // o anel já nasce desenhado (sem o "0" inicial da animação)
  const dash = await p.locator('#anel .fatia').first().evaluate((el) => el.style.strokeDasharray)
  assert.doesNotMatch(dash, /^0 /)
  await p.click('[data-aba="limpar"]')
  await p.waitForSelector('.cartao')
  assert.deepEqual(erros, [])
  await ctx.close()
})
