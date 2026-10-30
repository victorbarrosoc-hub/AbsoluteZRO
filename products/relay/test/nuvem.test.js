// O painel na conta (schema `relay`) num Postgres de verdade: o migrador, o isolamento entre pessoas pelo RLS (papel
// relay_app), a equipe (só o que quem criou liberou, só na mesma organização, sem poder mudar) e a rota
// /api/relay/painel com a sessão do Relay.

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { semPostgres, subirPostgres } from './banco-apoio.js'
import { migrar, PASTA } from '../scripts/migrar.mjs'

const pular = semPostgres
let pg, comoPessoa, fecharBanco, painel, selar, COOKIE_CONTA, CONTA_S
let app, SITE

const A = { sub: 'pessoa-a', org: 'org-1' }
const B = { sub: 'pessoa-b', org: 'org-1' }
const C = { sub: 'pessoa-c', org: 'org-2' }

const conv = (id, extra = {}) => ({ id, quando: Date.now() - 1000, projeto: null, entrada: { nome: 'master.mov', bytes: 2e9, duracao: 120, video: true }, preset: { id: 'reels', nome: 'Reels', icone: 'instagram' }, saida: { nome: 'master (Reels).mp4', bytes: 5e7, largura: 1080, altura: 1920, codec: 'avc' }, segundos: 30, ...extra })

before(async () => {
  if (pular) return
  pg = await subirPostgres()
  Object.assign(process.env, { RELAY_DATABASE_URL: pg.url, ZRO_CLIENT_ID: 'relay-web', ZRO_CLIENT_SECRET: 'segredo-de-teste-da-nuvem', ZRO_ISSUER: 'https://zro.invalid' })
  ;({ comoPessoa, fecharBanco } = await import('../api/_banco.js'))
  ;({ selar, COOKIE_CONTA, CONTA_S } = await import('../api/_zro.js'))
  painel = (await import('../api/relay/painel.js')).default
  app = http.createServer((req, res) => (req.url.startsWith('/api/relay/painel') ? painel(req, res) : ((res.statusCode = 404), res.end())))
  await new Promise((ok) => app.listen(0, '127.0.0.1', ok))
  SITE = `http://127.0.0.1:${app.address().port}`
})
after(async () => {
  await fecharBanco?.()
  await new Promise((ok) => (app ? app.close(() => ok()) : ok()))
  await pg?.fechar()
})

describe('migrador', () => {
  test('aplica uma vez, não repete e recusa arquivo aplicado que mudou', { skip: pular }, async () => {
    assert.deepEqual(await migrar(pg.url), ['0000_fundacao.sql'])
    assert.deepEqual(await migrar(pg.url), [])
    const outra = mkdtempSync(join(tmpdir(), 'relay-mig-'))
    try {
      cpSync(PASTA, outra, { recursive: true })
      writeFileSync(join(outra, '0000_fundacao.sql'), readFileSync(join(outra, '0000_fundacao.sql'), 'utf8') + '\n-- mudou\n')
      await assert.rejects(migrar(pg.url, { pasta: outra }), /já foi aplicada e mudou/)
    } finally {
      rmSync(outra, { recursive: true, force: true })
    }
  })
})

describe('RLS (papel relay_app)', () => {
  test('cada pessoa só vê e mexe nas próprias conversões', { skip: pular }, async () => {
    await comoPessoa(A, (tx) => tx`insert into relay.conversoes (user_sub, id, quando, entrada, preset, saida) values ('pessoa-a', 'cv-rls-a1', now(), '{}', '{}', '{}')`)
    assert.equal((await comoPessoa(B, (tx) => tx`select id from relay.conversoes`)).length, 0)
    assert.equal((await comoPessoa(A, (tx) => tx`select id from relay.conversoes`)).length, 1)
    // B não grava em nome de A, nem apaga o de A
    await assert.rejects(comoPessoa(B, (tx) => tx`insert into relay.conversoes (user_sub, id, quando, entrada, preset, saida) values ('pessoa-a', 'cv-rls-b1', now(), '{}', '{}', '{}')`), { code: '42501' })
    assert.equal((await comoPessoa(B, (tx) => tx`delete from relay.conversoes where id = 'cv-rls-a1' returning id`)).length, 0)
    // sem pessoa na transação, nada passa; relay_app não é dono nem passa por cima do RLS
    const { banco } = await import('../api/_banco.js')
    const vazio = await banco().begin(async (tx) => (await tx.unsafe('set local role relay_app'), tx`select id from relay.conversoes`))
    assert.equal(vazio.length, 0)
  })

  test('equipe: vê e usa o projeto liberado, só na mesma organização, sem poder mudar', { skip: pular }, async () => {
    await comoPessoa(A, (tx) => tx`insert into relay.projetos (id, user_sub, org_id, nome, destinos, equipe) values ('pj-equipe', 'pessoa-a', 'org-1', 'Verão', '{reels}', true), ('pj-so-meu', 'pessoa-a', 'org-1', 'Meu', '{}', false)`)
    const deB = await comoPessoa(B, (tx) => tx`select id from relay.projetos order by id`)
    assert.deepEqual(deB.map((r) => r.id), ['pj-equipe'], 'B vê só o liberado')
    assert.equal((await comoPessoa(C, (tx) => tx`select id from relay.projetos`)).length, 0, 'outra organização não vê')
    assert.equal((await comoPessoa(B, (tx) => tx`update relay.projetos set nome = 'mudei' where id = 'pj-equipe' returning id`)).length, 0, 'B não muda')
    assert.equal((await comoPessoa(B, (tx) => tx`delete from relay.projetos where id = 'pj-equipe' returning id`)).length, 0, 'B não apaga')
    // B converte no projeto da equipe; C não consegue apontar para ele
    await comoPessoa(B, (tx) => tx`insert into relay.conversoes (user_sub, id, quando, projeto_id, entrada, preset, saida) values ('pessoa-b', 'cv-rls-b2', now(), 'pj-equipe', '{}', '{}', '{}')`)
    await assert.rejects(comoPessoa(C, (tx) => tx`insert into relay.conversoes (user_sub, id, quando, projeto_id, entrada, preset, saida) values ('pessoa-c', 'cv-rls-c1', now(), 'pj-equipe', '{}', '{}', '{}')`), { code: '42501' })
    // A apaga o projeto: a conversão de B fica, sem projeto
    await comoPessoa(A, (tx) => tx`delete from relay.projetos where id = 'pj-equipe'`)
    const [c] = await comoPessoa(B, (tx) => tx`select projeto_id from relay.conversoes where id = 'cv-rls-b2'`)
    assert.equal(c.projeto_id, null)
  })

  test('preset da equipe: só com org e liberado; quem não criou não muda', { skip: pular }, async () => {
    await assert.rejects(comoPessoa({ sub: 'sem-org' }, (tx) => tx`insert into relay.presets (user_sub, id, ficha, equipe) values ('sem-org', 'meu-x', '{}', true)`), { code: '23514' })
    await comoPessoa(A, (tx) => tx`insert into relay.presets (user_sub, id, org_id, ficha, equipe) values ('pessoa-a', 'meu-eq1', 'org-1', '{"nome":"Equipe"}', true)`)
    assert.equal((await comoPessoa(B, (tx) => tx`select id from relay.presets`)).length, 1)
    assert.equal((await comoPessoa(C, (tx) => tx`select id from relay.presets`)).length, 0)
    assert.equal((await comoPessoa(B, (tx) => tx`update relay.presets set equipe = false returning id`)).length, 0)
  })
})

describe('/api/relay/painel', () => {
  const cookieDe = (p) => `${COOKIE_CONTA}=${selar(COOKIE_CONTA, { sub: p.sub, nome: 'X', org: p.org ? { id: p.org, nome: 'Org' } : null }, CONTA_S)}`
  const pedir = (p, metodo = 'GET', corpo, caminho = '/api/relay/painel', extra = {}) =>
    fetch(SITE + caminho, { method: metodo, headers: { ...(p ? { cookie: cookieDe(p) } : {}), ...(corpo ? { 'content-type': 'application/json' } : {}), ...extra }, body: corpo ? JSON.stringify(corpo) : undefined })

  test('sem sessão: 401; outra origem não escreve', { skip: pular }, async () => {
    assert.equal((await pedir(null)).status, 401)
    assert.equal((await pedir(A, 'POST', { conversoes: [] }, undefined, { origin: 'https://outro.site' })).status, 403)
  })

  test('guarda o lote sem repetir, lê de volta e corta além de 500', { skip: pular }, async () => {
    const D = { sub: 'pessoa-d', org: null }
    let r = await (await pedir(D, 'POST', { conversoes: [conv('cv-api-1'), conv('cv-api-1'), { id: 'lixo' }] })).json()
    assert.deepEqual(r.guardadas, ['cv-api-1', 'cv-api-1'])
    assert.equal(r.recusadas, 1)
    r = await (await pedir(D)).json()
    assert.equal(r.ok, true)
    assert.equal(r.equipe, false)
    assert.equal(r.conversoes.length, 1)
    assert.equal(r.conversoes[0].saida.nome, 'master (Reels).mp4')
    const base = Date.now() - 10_000_000
    for (let lote = 0; lote < 6; lote++)
      await pedir(D, 'POST', { conversoes: Array.from({ length: 100 }, (_, i) => conv(`cv-lote-${lote}-${i}`, { quando: base + lote * 1000 + i })) })
    r = await (await pedir(D)).json()
    assert.equal(r.conversoes.length, 500)
    assert.ok(r.conversoes.some((c) => c.id === 'cv-api-1'), 'a mais nova fica')
    assert.ok(!r.conversoes.some((c) => c.id === 'cv-lote-0-0'), 'as mais antigas saem')
    await pedir(D, 'DELETE', null, '/api/relay/painel?tipo=historico')
    assert.equal((await (await pedir(D)).json()).conversoes.length, 0)
  })

  test('projeto e preset: só o dono muda; a equipe vê o que foi liberado', { skip: pular }, async () => {
    let r = await (await pedir(A, 'PUT', { projeto: { id: 'pj-api-1', nome: ' Campanha ', destinos: ['reels', 'reels', 'X!'], equipe: true } })).json()
    assert.deepEqual(r.projeto.destinos, ['reels'])
    assert.equal(r.projeto.nome, 'Campanha')
    assert.equal(r.projeto.equipe, true)
    // B (mesma organização) vê, mas não muda; o id de outra pessoa não vira dele
    const deB = await (await pedir(B)).json()
    assert.deepEqual(deB.projetos.filter((p) => p.id === 'pj-api-1').map((p) => [p.meu, p.equipe]), [[false, true]])
    assert.equal((await pedir(B, 'PUT', { projeto: { id: 'pj-api-1', nome: 'Roubado' } })).status, 403)
    assert.equal((await (await pedir(B, 'DELETE', null, '/api/relay/painel?tipo=projeto&id=pj-api-1')).json()).apagado, false)
    // C (outra organização) não vê
    assert.ok(!(await (await pedir(C)).json()).projetos.some((p) => p.id === 'pj-api-1'))
    // preset: a ficha passa pela validação do conversor
    assert.equal((await pedir(A, 'PUT', { preset: { id: 'meu-api-1', ficha: { nome: '' } } })).status, 400)
    r = await (await pedir(A, 'PUT', { preset: { id: 'meu-api-1', ficha: { nome: 'Cliente X', base: 'reels' }, equipe: true } })).json()
    assert.equal(r.preset.ficha.nome, 'Cliente X')
    assert.ok((await (await pedir(B)).json()).presets.some((p) => p.id === 'meu-api-1' && !p.meu))
    // sem organização, "equipe" não vale
    r = await (await pedir({ sub: 'pessoa-e' }, 'PUT', { projeto: { id: 'pj-api-2', nome: 'Solo', equipe: true } })).json()
    assert.equal(r.projeto.equipe, false)
  })

  test('sem RELAY_DATABASE_URL: o painel segue só no aparelho', { skip: pular }, async () => {
    const url = process.env.RELAY_DATABASE_URL
    delete process.env.RELAY_DATABASE_URL
    try {
      assert.deepEqual(await (await pedir(A)).json(), { ok: false, nuvem: false })
    } finally {
      process.env.RELAY_DATABASE_URL = url
    }
  })
})

describe('painel entre aparelhos e com a equipe (Chromium + banco)', () => {
  let srv, navegador, base
  let quem = null // quem está "logado" no pedido (o servidor de teste põe a sessão dessa pessoa)
  const pessoas = {
    lia: { sub: 'sub-lia', org: 'org-x', id: 'lia0001', nome: 'Lia Produtora' },
    rui: { sub: 'sub-rui', org: 'org-x', id: 'rui0001', nome: 'Rui Editor' },
  }

  before(async () => {
    if (pular) return
    const { servir } = await import('../scripts/servir.mjs')
    const { chromium } = await import('playwright')
    srv = await servir({
      porta: 0,
      extra: async (req, res) => {
        const p = pessoas[quem]
        if (req.url === '/api/zro/eu') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(p ? { ok: true, pessoa: { id: p.id, nome: p.nome, email: `${quem}@x.com` } } : { ok: false, configurado: true }))
          return true
        }
        if (req.url.startsWith('/api/relay/painel')) {
          req.headers.cookie = p ? `${COOKIE_CONTA}=${selar(COOKIE_CONTA, { sub: p.sub, nome: p.nome, org: { id: p.org, nome: 'X' } }, CONTA_S)}` : ''
          await painel(req, res)
          return true
        }
        if (req.url.startsWith('/api/zro/set')) return (res.writeHead(401), res.end(), true)
        return false
      },
    })
    base = `http://127.0.0.1:${srv.address().port}`
    navegador = await chromium.launch()
  })
  after(async () => {
    await navegador?.close()
    srv?.close()
  })

  const abrirPainel = async (ctx) => {
    const p = await ctx.newPage()
    await p.goto(`${base}/painel`)
    await p.waitForFunction(() => window.painelPronto, null, { timeout: 30_000 })
    return p
  }

  test('o histórico de antes sobe; o outro aparelho vê; a equipe vê só o que foi liberado', { skip: pular }, async () => {
    quem = 'lia'
    // aparelho 1: histórico e um preset de antes da nuvem
    const mac = await navegador.newContext()
    const p1 = await mac.newPage()
    await p1.goto(`${base}/painel`)
    await p1.waitForFunction(() => window.painelPronto)
    await p1.evaluate(async () => {
      const H = await import('/app/historico.js')
      const { registro } = await import('/src/painel.js')
      await H.registrar('lia0001', registro({ arquivo: { name: 'antes.mov', size: 1e9 }, info: { duracao: 60, temVideo: true }, preset: { id: 'whatsapp', nome: 'WhatsApp', icone: 'whatsapp' }, resultado: { bytes: 1e7, segundos: 10, plano: { video: { largura: 1280, altura: 720 } } }, nome: 'antes (WhatsApp).mp4' }))
      localStorage.setItem('relay-meus-presets', JSON.stringify({ relay: 'presets', v: 2, presets: [{ id: 'meu-cliente1', nome: 'Cliente X', base: 'reels' }] }))
    })
    await p1.reload()
    await p1.waitForFunction(() => window.painelPronto)
    assert.equal(await p1.textContent('#onde'), 'Na sua conta, em todo aparelho.')
    // projeto liberado para a equipe e o preset liberado
    await p1.click('.projeto--novo')
    await p1.fill('#projeto-nome', 'Campanha da equipe')
    await p1.click('.chip-destino:has-text("Reels")')
    await p1.check('#projeto-equipe', { force: true })
    await p1.click('#projeto-guardar')
    await p1.waitForSelector('.projeto:has-text("Com a equipe")')
    await p1.click('.chip-equipe')
    await p1.waitForFunction(() => document.querySelector('.chip-equipe')?.getAttribute('aria-pressed') === 'true')
    await p1.waitForTimeout(300)

    // aparelho 2 da Lia: vazio no começo, a conta traz tudo
    const iphone = await navegador.newContext()
    const p2 = await abrirPainel(iphone)
    assert.match(await p2.textContent('#recentes'), /antes \(WhatsApp\)\.mp4/)
    assert.match(await p2.textContent('#projetos'), /Campanha da equipe/)
    assert.match(await p2.textContent('#meus'), /Cliente X/)

    // Rui (mesma organização): vê o projeto e o preset como "Da equipe", não o histórico da Lia, e não muda
    quem = 'rui'
    const rui = await navegador.newContext()
    const p3 = await abrirPainel(rui)
    assert.equal(await p3.locator('#recentes .conversao').count(), 0)
    assert.match(await p3.textContent('.projeto:not(.projeto--novo)'), /Da equipe/)
    assert.match(await p3.textContent('#meus-equipe'), /Cliente X/)
    await p3.click('.projeto:not(.projeto--novo)')
    assert.equal(await p3.isVisible('#projeto-guardar'), false)
    assert.equal(await p3.isDisabled('#projeto-nome'), true)
    assert.equal(await p3.isVisible('#projeto-converter'), true)

    // Lia apaga o projeto no aparelho 2: some do aparelho 1 e do Rui
    quem = 'lia'
    await p2.reload()
    await p2.waitForFunction(() => window.painelPronto)
    p2.on('dialog', (d) => d.accept())
    await p2.click('.projeto:not(.projeto--novo)')
    await p2.click('#projeto-apagar')
    await p2.waitForFunction(() => !document.querySelector('.projeto:not(.projeto--novo)'))
    await p1.reload()
    await p1.waitForFunction(() => window.painelPronto)
    assert.equal(await p1.locator('.projeto:not(.projeto--novo)').count(), 0)
    for (const c of [mac, iphone, rui]) await c.close()
  })
})
