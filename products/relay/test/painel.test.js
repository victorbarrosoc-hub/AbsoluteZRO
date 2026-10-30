// O painel da conta (/painel): a conta pura de src/painel.js no Node e, no Chromium, o topo com a conta (foto, menu,
// Sair), o histórico que o conversor grava, os projetos e quem está fora da conta.

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { duracaoCurta, numeros, porProjeto, projeto, quando, registro } from '../src/painel.js'
import { servir } from '../scripts/servir.mjs'
import { ff, pasta, temFfmpeg } from './apoio.js'
import { readFileSync } from 'node:fs'

describe('conta do painel', () => {
  test('registro: só nomes e números do que entrou e saiu', () => {
    const r = registro({
      arquivo: { name: 'master.mov', size: 2e9 },
      info: { duracao: 120, temVideo: true },
      preset: { id: 'reels', nome: 'Reels · No Compress', icone: 'instagram' },
      resultado: { bytes: 5e7, segundos: 30, codecVideo: 'avc', plano: { video: { largura: 1080, altura: 1920 } }, blob: {} },
      nome: 'master-reels.mp4',
      projeto: 'pj-1',
      quando: 1000,
    })
    assert.deepEqual(r.entrada, { nome: 'master.mov', bytes: 2e9, duracao: 120, video: true })
    assert.deepEqual(r.saida, { nome: 'master-reels.mp4', bytes: 5e7, largura: 1080, altura: 1920, codec: 'avc', pasta: false })
    assert.equal(r.preset.meu, false)
    assert.equal(r.projeto, 'pj-1')
    assert.equal(registro({ preset: { id: 'meu-1', nome: 'Meu' } }).preset.meu, true)
  })

  test('números: conversões, duração e o que ficou a menos no disco', () => {
    const r = (e, s, d) => ({ entrada: { nome: 'a', bytes: e, duracao: d }, saida: { bytes: s } })
    assert.deepEqual(numeros([r(100, 30, 60), r(100, 120, 30)]), { conversoes: 2, entrada: 200, saida: 150, poupado: 50, duracao: 90, arquivos: 1 })
    assert.equal(numeros([]).poupado, 0)
  })

  test('quando e duração, curtos', () => {
    const agora = new Date(2026, 9, 30, 15, 0).getTime()
    assert.equal(quando(agora - 20_000, agora), 'agora')
    assert.equal(quando(agora - 5 * 60_000, agora), 'há 5 min')
    assert.equal(quando(new Date(2026, 9, 30, 9, 5).getTime(), agora), 'hoje, 09:05')
    assert.equal(quando(new Date(2026, 9, 29, 22, 10).getTime(), agora), 'ontem, 22:10')
    assert.equal(quando(new Date(2026, 9, 12).getTime(), agora), '12/10')
    assert.equal(quando(new Date(2025, 1, 3).getTime(), agora), '03/02/2025')
    assert.equal(duracaoCurta(45), '45 s')
    assert.equal(duracaoCurta(720), '12 min')
    assert.equal(duracaoCurta(3 * 3600 + 300), '3 h 05')
  })

  test('projeto: nome obrigatório, destinos válidos e sem repetir', () => {
    assert.throws(() => projeto({ nome: '  ' }), /Dê um nome/)
    const p = projeto({ nome: ' Verão ', destinos: ['reels', 'reels', 'nao-existe', 'mp3'] })
    assert.equal(p.nome, 'Verão')
    assert.deepEqual(p.destinos, ['reels', 'mp3'])
    assert.deepEqual(porProjeto([{ projeto: 'a', quando: 5 }, { projeto: 'a', quando: 9 }, { projeto: null, quando: 1 }]), { a: { conversoes: 2, ultima: 9 } })
  })

  test('as páginas do site levam o painel; o topo monta a conta com Sair', () => {
    const pub = readFileSync(new URL('../scripts/publicar-site.mjs', import.meta.url), 'utf8')
    assert.match(pub, /PUBLICO = \[[^\]]*'painel\.html'/)
    assert.match(pub, /ROTAS_DO_SITE = \[[^\]]*'painel\.html'/)
    const conta = readFileSync(new URL('../app/conta.js', import.meta.url), 'utf8')
    assert.match(conta, /fetch\('\/api\/zro\/sair', \{ method: 'POST'/)
  })
})

describe('painel no Chromium', () => {
  const pular = !temFfmpeg && 'sem ffmpeg'
  const EU = { ok: true, acesso: true, pessoa: { id: 'c0ffee', nome: 'Lia Produtora', email: 'lia@produtora.com', foto: null, conta: 'https://absolutezro.com/perfil', organizacao: null, produtos: ['relay'] } }
  let srv, navegador, base
  let logado = true
  const erros = []

  before(async () => {
    if (pular) return
    ff('-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=1', '-f', 'lavfi', '-i', 'sine=f=440:d=1:sample_rate=48000', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(pasta, 'painel.mp4'))
    srv = await servir({
      porta: 0,
      extra: async (req, res) => {
        const json = (o) => (res.writeHead(200, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(o)), true)
        if (req.url === '/api/zro/eu') return json(logado ? EU : { ok: false, configurado: true })
        if (req.url === '/api/zro/sair' && req.method === 'POST') return ((logado = false), json({ ok: true }))
        if (req.url.startsWith('/api/zro/set')) return (res.writeHead(401), res.end(), true)
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

  const nova = async (ctx, caminho) => {
    const p = await ctx.newPage()
    p.on('pageerror', (e) => erros.push(e.message))
    await p.goto(base + caminho)
    return p
  }

  test('fora da conta: o painel pede para entrar e volta para ele', { skip: pular }, async () => {
    logado = false
    const ctx = await navegador.newContext()
    const p = await nova(ctx, '/painel')
    await p.waitForSelector('#fora:not([hidden])')
    assert.equal(await p.getAttribute('#fora-entrar', 'href'), '/api/zro/entrar?volta=%2Fpainel')
    const inicio = await nova(ctx, '/')
    await inicio.waitForSelector('[data-entrar]')
    assert.equal(await inicio.getAttribute('[data-entrar]', 'href'), '/api/zro/entrar?volta=%2Fpainel', 'da página inicial, entrar leva ao painel')
    await ctx.close()
    logado = true
  })

  test('com a conta: converte, a saída aparece no painel, entra no projeto, e Sair encerra', { skip: pular }, async () => {
    const ctx = await navegador.newContext()
    const p = await nova(ctx, '/painel')
    await p.waitForFunction(() => window.painelPronto)
    assert.equal(await p.textContent('#ola'), 'Lia.')
    assert.equal(await p.isVisible('#recentes-vazio'), true)
    // topo: a foto da conta (iniciais sem foto) e o menu
    assert.equal(await p.textContent('[data-conta]'), 'LP')
    await p.click('[data-conta]')
    const menu = await p.$$eval('.conta-menu [role="menuitem"]', (as) => as.map((a) => a.textContent))
    assert.deepEqual(menu, ['Converter', 'Sua conta Absolute ZRO', 'Sair'])
    await p.keyboard.press('Escape')

    // projeto novo com dois destinos
    await p.click('.projeto--novo')
    await p.fill('#projeto-nome', 'Campanha')
    await p.click('.chip-destino:has-text("WhatsApp")')
    await p.click('.chip-destino:has-text("MP3 320")')
    await p.click('#projeto-guardar')
    await p.waitForSelector('.projeto:not(.projeto--novo)')
    await p.click('.projeto:not(.projeto--novo)')
    const link = await p.getAttribute('#projeto-converter', 'href')
    assert.match(link, /^converter\?projeto=pj-/)

    // o conversor abre com os destinos do projeto e grava no histórico
    const c = await nova(ctx, `/${link}`)
    await c.waitForSelector('[data-projeto]')
    assert.match(await c.textContent('[data-projeto]'), /Campanha/)
    await c.setInputFiles('#arquivos', join(pasta, 'painel.mp4'))
    await c.waitForSelector('.item[data-estado="pronto"]')
    assert.equal(await c.locator('.saida').count(), 2)
    await c.click('#converter')
    await c.waitForFunction(() => document.querySelectorAll('.saida--feito').length === 2, null, { timeout: 120_000 })
    await c.waitForTimeout(300)

    await p.reload()
    await p.waitForFunction(() => window.painelPronto)
    assert.equal(await p.locator('#recentes .conversao').count(), 2)
    assert.match(await p.textContent('#numeros'), /2conversões/)
    assert.match(await p.textContent('.projeto:not(.projeto--novo)'), /2 conversões/)
    assert.match(await p.textContent('#recentes'), /painel \(WhatsApp\)\.mp4/)

    // outra conta no mesmo aparelho não vê este histórico
    EU.pessoa.id = 'outra'
    await p.reload()
    await p.waitForFunction(() => window.painelPronto)
    assert.equal(await p.locator('#recentes .conversao').count(), 0)
    EU.pessoa.id = 'c0ffee'

    // Sair: volta à página inicial, que mostra "Entrar"
    await p.click('[data-conta]')
    await p.click('.conta-sair')
    await p.waitForURL(`${base}/`)
    await p.waitForSelector('[data-entrar]')
    assert.equal(await p.locator('[data-conta]').count(), 0)
    await ctx.close()
    logado = true
    assert.deepEqual(erros, [])
  })

  test('celular (375 px): o painel não rola para o lado', { skip: pular }, async () => {
    const ctx = await navegador.newContext({ viewport: { width: 375, height: 800 } })
    const p = await nova(ctx, '/painel')
    await p.waitForFunction(() => window.painelPronto)
    const [largura, tela] = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
    assert.equal(largura, tela)
    await ctx.close()
  })
})
