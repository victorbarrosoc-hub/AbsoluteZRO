// Criar com IA (a Higgsfield das Conexões, pelo HUB): as contas puras da folha (src/criar.js) e o repasse
// /api/zro/higgsfield* (api/_higgsfield.js) contra a Absolute ZRO falsa. Só os caminhos, métodos e parâmetros do
// contrato; o token da sessão vai no Authorization e nunca o cookie; gerar só do próprio site e só JSON; sem sessão é
// 401; produto fechado é 403 antes de qualquer pedido; sem a Higgsfield conectada, o 409 passa com o endereço de
// /conexoes; e o login que pede zro.higgsfield volta sem ele quando a Absolute ZRO ainda não o conhece.

import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { iniciarZroFalsa } from './zro-falso.js'
import { selar } from '../api/_zro.js'
import { cabe, creditos, estadoLegivel, inserirNaLinha, leituraDoErro, medidor, nomeDaCriacao, precoDe, proporcaoDo, urlPermitida } from '../src/criar.js'
import { duracao, posicoes } from '../src/linha.js'

const PREFIXO = 'ae'
const PRODUTO = 'ai-edit'
const CLIENTE = { clientId: 'aeon-web', clientSecret: 'segredo-de-teste-do-aeon-criar' }
const LIA = { sub: 'zro-411', email: 'lia@produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: [PRODUTO], release: { [PRODUTO]: 'allowed' } }
const PRECOS = { imagem: 1.5, rapido: 4, equilibrado: 10, maximo: 22 }
let zro, app, SITE
const f = {}

describe('as contas da folha', () => {
  test('o formato da Higgsfield mais perto do projeto', () => {
    assert.equal(proporcaoDo({ largura: 1920, altura: 1080 }), '16:9')
    assert.equal(proporcaoDo({ largura: 1080, altura: 1920 }), '9:16')
    assert.equal(proporcaoDo({ largura: 1080, altura: 1080 }), '1:1')
    assert.equal(proporcaoDo({ largura: 1080, altura: 1350 }), '4:5')
    assert.equal(proporcaoDo({ largura: 3840, altura: 1600 }), '16:9')
    assert.equal(proporcaoDo(null), '16:9')
  })

  test('o medidor: saldo de agora e o que o AEON usou no mês, como fração do que havia', () => {
    const m = medidor({ saldo: 90, plano: 'creator', usoMes: 40, usoApp: { mes: 30, pedidos: 3, total: 55 } })
    assert.deepEqual(m, { saldo: 90, usado: 30, pedidos: 3, usoMes: 40, frac: 0.25, plano: 'creator' })
    assert.equal(medidor(null).frac, 0)
    assert.equal(medidor({ saldo: null, usoApp: { mes: 0 } }).saldo, null)
    assert.equal(creditos(1234.5), '1.234,5')
    assert.equal(creditos(null), '—')
  })

  test('sem preço ou sem saldo informados, não cabe; o preço de cada escolha vem do painel', () => {
    assert.equal(cabe(10, 10), true)
    assert.equal(cabe(10.5, 10), false)
    assert.equal(cabe(null, 100), false)
    assert.equal(cabe(1, null), false)
    const painel = { imagens: [{ quantidade: 2, creditos: 3 }], opcoes: [{ id: 'maximo', creditos: 22 }] }
    assert.equal(precoDe(painel, { quantidade: 2 }), 3)
    assert.equal(precoDe(painel, { quantidade: 4 }), null)
    assert.equal(precoDe(painel, { opcao: 'maximo' }), 22)
    assert.equal(precoDe(null, { opcao: 'maximo' }), null)
  })

  test('o nome na Mídia, as URLs aceitas e a frase de cada estado', () => {
    assert.equal(nomeDaCriacao('Rua de neon: à noite / chuva', 'mp4'), 'IA · Rua de neon à noite chuva.mp4')
    assert.equal(nomeDaCriacao('', 'mp4', 3), 'IA · criação (3).mp4')
    assert.ok(nomeDaCriacao('x'.repeat(300), 'mp4').length < 60)
    assert.equal(urlPermitida('https://d8j0ntlcm91z4.cloudfront.net/u/a.png'), true)
    assert.equal(urlPermitida('https://cdn.higgsfield.ai/x/b.mp4'), true)
    assert.equal(urlPermitida('https://upload.higgsfield.ai/u/a.png?x=1'), true)
    assert.equal(urlPermitida('http://cdn.higgsfield.ai/x/b.mp4'), false)
    assert.equal(urlPermitida('https://higgsfield.ai.evil.com/x.png'), false)
    assert.equal(urlPermitida('https://exemplo.com/x.png'), false)
    assert.equal(urlPermitida('nada'), false)
    assert.equal(estadoLegivel('na_fila'), 'Na fila da Higgsfield')
    assert.match(estadoLegivel('recusado', 'conteúdo'), /recusou.*\(conteúdo\)/)
  })

  test('o erro da Absolute ZRO vira o estado da folha', () => {
    assert.equal(leituraDoErro(401).estado, 'entrar')
    const c = leituraDoErro(409, { error: 'sem_conexao', details: { motivo: 'reconectar', conectar: 'https://absolutezro.com/conexoes' } })
    assert.deepEqual([c.estado, c.reconectar, c.conectar], ['conectar', true, 'https://absolutezro.com/conexoes'])
    assert.equal(leituraDoErro(403, { error: 'app_desligado' }).estado, 'desligado')
    assert.equal(leituraDoErro(429, { error: 'quota_exceeded', message: 'Faltam créditos: custa 22 e você tem 5.' }).texto, 'Faltam créditos: custa 22 e você tem 5.')
    assert.equal(leituraDoErro(502, {}).estado, 'erro')
  })

  test('pôr na linha no cursor: divide o clipe ali e entra no meio; no fim, entra no fim', () => {
    const linha = { clipes: [{ id: 'a', midia: 'v', ini: 0, fim: 100 }] }
    const m = { id: 'ia', quadros: 150 }
    const meio = inserirNaLinha(linha, m, 40)
    assert.deepEqual(
      posicoes(meio).map((x) => [x.clipe.midia, x.inicio]),
      [
        ['v', 0],
        ['ia', 40],
        ['v', 190],
      ],
    )
    assert.equal(duracao(meio), 250)
    const fim = inserirNaLinha(linha, m, 999)
    assert.deepEqual(
      fim.clipes.map((c) => c.midia),
      ['v', 'ia'],
    )
    const corte = inserirNaLinha(meio, { id: 'b', quadros: 10 }, 40)
    assert.deepEqual(
      corte.clipes.map((c) => c.midia),
      ['v', 'b', 'ia', 'v'],
    )
    assert.equal(linha.clipes.length, 1, 'a linha antiga fica intacta')
  })
})

before(async () => {
  zro = await iniciarZroFalsa(CLIENTE)
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret })
  for (const r of ['entrar', 'callback']) f[r] = (await import(`../api/zro/${r}.js`)).default
  f.painel = (await import('../api/zro/higgsfield/index.js')).default
  f.gerar = (await import('../api/zro/higgsfield/gerar.js')).default
  app = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname
    if (p === '/api/zro/entrar') return f.entrar(req, res)
    if (p === '/api/zro/callback') return f.callback(req, res)
    if (p === '/api/zro/higgsfield') return f.painel(req, res)
    if (p.startsWith('/api/zro/higgsfield/')) return f.gerar(req, res)
    res.statusCode = 404
    res.end()
  })
  await new Promise((ok) => app.listen(0, '127.0.0.1', ok))
  SITE = `http://127.0.0.1:${app.address().port}`
})
after(async () => {
  await zro?.fechar()
  await new Promise((ok) => app?.close(() => ok()))
})
beforeEach(() => Object.assign(zro.estado, { pessoa: LIA, higgsfield: [], hf: { saldo: 50, precos: { ...PRECOS }, pedidos: [] }, recusarEscopoHf: false, recusarEscopoSons: false, gate: null }))

const cookiesDe = (res) => new Map(res.headers.getSetCookie().map((c) => [c.split('=')[0], c.slice(c.indexOf('=') + 1).split(';')[0]]))
const pedir = (caminho, { cookies = {}, ...init } = {}) =>
  fetch(new URL(caminho, SITE), {
    redirect: 'manual',
    ...init,
    headers: {
      cookie: Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
      ...(init.headers || {}),
    },
  })
async function idaEVolta(entrar) {
  const ida = await pedir(entrar)
  const z = await fetch(new URL(ida.headers.get('location')), { redirect: 'manual' })
  return pedir(z.headers.get('location').replace(SITE, ''), { cookies: { [`${PREFIXO}_zro`]: cookiesDe(ida).get(`${PREFIXO}_zro`) } })
}
async function entrar() {
  const c = cookiesDe(await idaEVolta('/api/zro/entrar'))
  return { [`${PREFIXO}_conta`]: c.get(`${PREFIXO}_conta`), [`${PREFIXO}_tokens`]: c.get(`${PREFIXO}_tokens`) }
}
const gerar = (c, corpo, headers = {}) => pedir('/api/zro/higgsfield/gerar', { cookies: c, method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(corpo) })

describe('repasse da Higgsfield', () => {
  test('sem sessão: 401, e nada chega à Absolute ZRO', async () => {
    const r = await pedir('/api/zro/higgsfield')
    assert.equal(r.status, 401)
    assert.equal(zro.estado.higgsfield.length, 0)
  })

  test('o painel: só duracao e proporcao seguem, com o token no Authorization e sem o cookie', async () => {
    const c = await entrar()
    const r = await pedir('/api/zro/higgsfield?duracao=longo&proporcao=9:16&extra=roubar', { cookies: c })
    assert.equal(r.status, 200)
    const d = await r.json()
    assert.equal(d.saldo, 50)
    assert.deepEqual(
      d.opcoes.map((o) => o.creditos),
      [8, 20, 44],
    )
    const ida = zro.estado.higgsfield.at(-1)
    assert.equal(ida.caminho, '')
    assert.equal(new URLSearchParams(ida.busca).get('duracao'), 'longo')
    assert.equal(new URLSearchParams(ida.busca).get('proporcao'), '9:16')
    assert.equal(new URLSearchParams(ida.busca).get('extra'), null)
    assert.match(ida.autorizacao, /^Bearer /)
    assert.equal(ida.cookie, null)
  })

  test('telas, andamento e animar passam como JSON; sem saldo que cubra, o 429 passa com a frase', async () => {
    const c = await entrar()
    const env = await (await gerar(c, { acao: 'envio', tipo: 'image/jpeg' })).json()
    assert.match(env.upload_url, /^https:\/\/upload\.higgsfield\.ai\//)
    const t = await gerar(c, { acao: 'telas', prompt: 'Rua de neon', quantidade: 2, proporcao: '16:9', ref: env.ref })
    assert.equal(t.status, 200)
    const { id, creditos: custo } = await t.json()
    assert.equal(custo, 3)
    assert.deepEqual(JSON.parse(zro.estado.higgsfield.at(-1).corpo), { acao: 'telas', prompt: 'Rua de neon', quantidade: 2, proporcao: '16:9', ref: env.ref })
    assert.equal((await (await pedir(`/api/zro/higgsfield/gerar?id=${id}`, { cookies: c })).json()).estado, 'na_fila')
    const pronto = await (await pedir(`/api/zro/higgsfield/gerar?id=${id}&x=1`, { cookies: c })).json()
    assert.equal(pronto.estado, 'pronto')
    assert.equal(pronto.urls.length, 2)
    assert.equal(new URLSearchParams(zro.estado.higgsfield.at(-1).busca).get('x'), null)
    // id fora do formato não vira caminho nem consulta livre
    await pedir('/api/zro/higgsfield/gerar?id=../../ia', { cookies: c })
    assert.equal(new URLSearchParams(zro.estado.higgsfield.at(-1).busca).get('id'), 'x')
    zro.estado.hf.saldo = 20
    const caro = await gerar(c, { acao: 'animar', opcao: 'maximo', duracao: 'longo', prompt: 'Câmera sobe', ref: env.ref })
    assert.equal(caro.status, 429)
    assert.equal((await caro.json()).message, 'Faltam créditos: custa 44 e você tem 20.')
  })

  test('gerar só do próprio site, só JSON, só os caminhos e métodos do contrato', async () => {
    const c = await entrar()
    const n = zro.estado.higgsfield.length
    assert.equal((await gerar(c, { acao: 'telas', prompt: 'x' }, { origin: 'https://outro.exemplo' })).status, 403)
    assert.equal((await pedir('/api/zro/higgsfield/gerar', { cookies: c, method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415)
    assert.equal((await pedir('/api/zro/higgsfield', { cookies: c, method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 405)
    assert.equal((await pedir('/api/zro/higgsfield/outra', { cookies: c })).status, 404)
    assert.equal((await gerar(c, { acao: 'telas', prompt: 'x'.repeat(30_000) })).status, 413)
    assert.equal(zro.estado.higgsfield.length, n, 'nada disso chegou à Absolute ZRO')
  })

  test('sem a Higgsfield nas Conexões: o 409 passa com o endereço de /conexoes', async () => {
    const c = await entrar()
    zro.estado.hf = null
    const r = await pedir('/api/zro/higgsfield', { cookies: c })
    assert.equal(r.status, 409)
    const d = await r.json()
    assert.equal(d.error, 'sem_conexao')
    assert.equal(d.details.conectar, `${zro.url}/conexoes`)
    assert.equal(leituraDoErro(r.status, d).estado, 'conectar')
  })

  test('fechado ao público: sessão que o HUB não liberou recebe 403 sem falar com a Absolute ZRO', async () => {
    const c = await entrar()
    const fechada = selar(`${PREFIXO}_conta`, { sub: LIA.sub, nome: LIA.nome, email: LIA.email, produtos: [PRODUTO], release: 'closed' }, 3600)
    const n = zro.estado.higgsfield.length
    assert.equal((await pedir('/api/zro/higgsfield', { cookies: { ...c, [`${PREFIXO}_conta`]: fechada } })).status, 403)
    assert.equal((await gerar({ ...c, [`${PREFIXO}_conta`]: fechada }, { acao: 'telas', prompt: 'x', quantidade: 1 })).status, 403)
    assert.equal(zro.estado.higgsfield.length, n)
  })
})

describe('login com zro.higgsfield', () => {
  test('pede zro.higgsfield junto com o resto', async () => {
    const ida = await pedir('/api/zro/entrar')
    assert.match(new URL(ida.headers.get('location')).searchParams.get('scope'), / zro\.higgsfield$/)
  })

  test('Absolute ZRO de antes da Higgsfield (invalid_scope): entra de novo sem zro.higgsfield, com os sons', async () => {
    zro.estado.recusarEscopoHf = true
    const volta = await idaEVolta('/api/zro/entrar?volta=/x')
    assert.equal(volta.headers.get('location'), '/api/zro/entrar?volta=%2Fx&sem_hf=1')
    const fim = await idaEVolta(volta.headers.get('location'))
    assert.equal(zro.estado.escopo, 'openid email profile org offline_access zro.ia zro.set zro.sons')
    assert.equal(fim.headers.get('location'), '/x?zro=ok')
    // sem o escopo, o painel volta 401 da Absolute ZRO (a folha diz para entrar de novo)
    const c = cookiesDe(fim)
    const r = await pedir('/api/zro/higgsfield', { cookies: { [`${PREFIXO}_conta`]: c.get(`${PREFIXO}_conta`), [`${PREFIXO}_tokens`]: c.get(`${PREFIXO}_tokens`) } })
    assert.equal(r.status, 401)
  })
})
