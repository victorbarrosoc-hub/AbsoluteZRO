// O Set (presença e conversas da Absolute ZRO, ADR 0032 de lá): o repasse /api/zro/set (api/_set.js) contra a Absolute
// ZRO falsa, o login que pede zro.set (e volta sem ele quando a Absolute ZRO ainda não o conhece) e a entrada "Set" no
// fim do dock, que só aparece quando o Set responde e abre a folha. Fechado ao público: sessão que o HUB não liberou
// recebe 403 antes de qualquer pedido. Este arquivo é o mesmo no AEON e na Revela (muda só o cabeçalho de constantes).

import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { iniciarZroFalsa } from './zro-falso.js'
import { selar } from '../api/_zro.js'

const PREFIXO = 'ae'
const PRODUTO = 'ai-edit'
const CLIENTE = { clientId: 'aeon-web', clientSecret: 'segredo-de-teste-do-aeon-set' }
const ARQUIVOS = { html: '../app/index.html', css: '../app/editor.css', js: '../app/set.js', principal: '../app/editor.js' }

const LIA = { sub: 'zro-411', email: 'lia@produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: [PRODUTO], release: { [PRODUTO]: 'allowed' } }
const ID = '3f2b8c1e-7d4a-4b9e-9c21-5a6f7e8d9c0b'
const ESCOPOS = 'openid email profile org offline_access zro.ia zro.set zro.sons'
let zro, app, SITE
const f = {}

before(async () => {
  zro = await iniciarZroFalsa(CLIENTE)
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret })
  for (const r of ['entrar', 'callback', 'set']) f[r] = (await import(`../api/zro/${r}.js`)).default
  // como a Vercel: /api/zro/set e a reescrita /api/zro/set/<caminho> → ?c=<caminho>
  app = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    const p = u.pathname
    if (p === '/api/zro/entrar') return f.entrar(req, res)
    if (p === '/api/zro/callback') return f.callback(req, res)
    if (p === '/api/zro/set') return f.set(req, res)
    if (p.startsWith('/api/zro/set/')) {
      u.searchParams.set('c', p.slice('/api/zro/set/'.length))
      req.url = `/api/zro/set?${u.searchParams}`
      return f.set(req, res)
    }
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

beforeEach(() => Object.assign(zro.estado, { set: [], expiraEm: 600, recusarEscopoSet: false, recusarEscopoIa: false, gate: null }))

const cookiesDe = (res) => new Map(res.headers.getSetCookie().map((c) => [c.split('=')[0], c.slice(c.indexOf('=') + 1).split(';')[0]]))
const pedir = (caminho, { cookies = {}, ...init } = {}) =>
  fetch(new URL(caminho, SITE), {
    redirect: 'manual',
    ...init,
    headers: {
      cookie: Object.entries(cookies)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
      ...(init.headers || {}),
    },
  })
const json = (method, corpo, extra = {}) => ({ method, headers: { 'content-type': 'application/json', origin: SITE, ...extra }, body: JSON.stringify(corpo) })

/** Uma ida e volta pela Absolute ZRO falsa a partir de um /api/zro/entrar…; devolve a resposta do callback. */
async function idaEVolta(entrar) {
  const ida = await pedir(entrar)
  const z = await fetch(new URL(ida.headers.get('location')), { redirect: 'manual' })
  return pedir(z.headers.get('location').replace(SITE, ''), { cookies: { [`${PREFIXO}_zro`]: cookiesDe(ida).get(`${PREFIXO}_zro`) } })
}
async function entrar() {
  zro.estado.pessoa = LIA
  const c = cookiesDe(await idaEVolta('/api/zro/entrar'))
  return { [`${PREFIXO}_conta`]: c.get(`${PREFIXO}_conta`), [`${PREFIXO}_tokens`]: c.get(`${PREFIXO}_tokens`) }
}

describe('login', () => {
  test('pede zro.set junto com a Z', async () => {
    const ida = await pedir('/api/zro/entrar')
    assert.equal(new URL(ida.headers.get('location')).searchParams.get('scope'), ESCOPOS)
  })

  test('Absolute ZRO de antes do Set (invalid_scope): entra de novo sem zro.set, com a Z', async () => {
    zro.estado.pessoa = LIA
    zro.estado.recusarEscopoSet = true
    // primeiro sem os sons (o mais novo); ainda recusa por causa do Set: sem o Set também
    const volta = await idaEVolta('/api/zro/entrar?volta=/x')
    assert.equal(volta.headers.get('location'), '/api/zro/entrar?volta=%2Fx&sem_sons=1')
    const volta2 = await idaEVolta(volta.headers.get('location'))
    assert.equal(volta2.headers.get('location'), '/api/zro/entrar?volta=%2Fx&sem_set=1')
    const fim = await idaEVolta(volta2.headers.get('location'))
    assert.equal(zro.estado.escopo, 'openid email profile org offline_access zro.ia')
    assert.equal(fim.headers.get('location'), '/x?zro=ok')
  })
})

describe('repasse do Set', () => {
  test('sem sessão: 401, e nada chega à Absolute ZRO', async () => {
    const r = await pedir('/api/zro/set')
    assert.equal(r.status, 401)
    assert.equal(zro.estado.set.length, 0)
  })

  test('leva o Bearer da sessão (sem cookie do site); a ETag vai e o 304 volta sem corpo', async () => {
    const cookies = await entrar()
    const r = await pedir('/api/zro/set', { cookies })
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('cache-control'), 'no-store')
    assert.equal(r.headers.get('etag'), 'W/"v1"')
    const texto = await r.text()
    const ult = zro.estado.set.at(-1)
    assert.match(ult.autorizacao, /^Bearer at_[0-9a-f]{32}$/)
    assert.equal(ult.cookie, null)
    assert.ok(!texto.includes(ult.autorizacao.slice(7)))
    const r2 = await pedir('/api/zro/set', { cookies, headers: { 'if-none-match': 'W/"v1"' } })
    assert.equal(r2.status, 304)
    assert.equal(await r2.text(), '')
    await pedir(`/api/zro/set/conversas/${ID}?depois=12&limite=x`, { cookies })
    assert.equal(zro.estado.set.at(-1).caminho, `/conversas/${ID}`)
    assert.equal(zro.estado.set.at(-1).busca, '?depois=12')
  })

  test('envio e preferências passam com JSON; outra origem, outro caminho e outro método não', async () => {
    const cookies = await entrar()
    assert.equal((await pedir(`/api/zro/set/conversas/${ID}/mensagens`, { cookies, ...json('POST', { texto: 'Oi', chave: 'abcdefgh12' }) })).status, 200)
    assert.deepEqual(JSON.parse(zro.estado.set.at(-1).corpo), { texto: 'Oi', chave: 'abcdefgh12' })
    assert.equal((await pedir('/api/zro/set/preferencias', { cookies, ...json('PUT', { invisivel: true }) })).status, 200)
    const n = zro.estado.set.length
    assert.equal((await pedir('/api/zro/set', { cookies, ...json('POST', { estado: 'ativo' }, { origin: 'https://malicioso.exemplo' }) })).status, 403)
    assert.equal((await pedir('/api/zro/set', { cookies, method: 'POST', headers: { origin: SITE, 'content-type': 'text/plain' }, body: 'x' })).status, 415)
    for (const c of ['admin', 'conversas/nao-e-id', 'ia/estado', `conversas/${ID}/x`]) assert.equal((await pedir(`/api/zro/set/${c}`, { cookies })).status, 404, c)
    assert.equal((await pedir('/api/zro/set/preferencias', { cookies })).status, 405)
    assert.equal(zro.estado.set.length, n)
  })

  test('login de antes do Set (token sem zro.set): 401, sem apagar os tokens (valem para a Z)', async () => {
    zro.estado.pessoa = LIA
    zro.estado.recusarEscopoSet = true
    const fim = await idaEVolta((await idaEVolta('/api/zro/entrar')).headers.get('location'))
    const c = cookiesDe(fim)
    const r = await pedir('/api/zro/set', { cookies: { [`${PREFIXO}_conta`]: c.get(`${PREFIXO}_conta`), [`${PREFIXO}_tokens`]: c.get(`${PREFIXO}_tokens`) } })
    assert.equal(r.status, 401)
    assert.ok(!r.headers.getSetCookie().some((x) => x.startsWith(`${PREFIXO}_tokens=;`)), 'os tokens ficam')
  })

  test('token vencido: renova e grava o cookie novo; "saiu" com o token vencido não renova', async () => {
    zro.estado.expiraEm = 1
    const cookies = await entrar()
    const antes = zro.estado.renovacoes
    const saiu = await pedir('/api/zro/set', { cookies, ...json('POST', { estado: 'saiu' }) })
    assert.equal(saiu.status, 204)
    assert.equal(zro.estado.renovacoes, antes)
    const r = await pedir('/api/zro/set', { cookies })
    assert.equal(r.status, 200)
    assert.equal(zro.estado.renovacoes, antes + 1)
    assert.ok(cookiesDe(r).get(`${PREFIXO}_tokens`))
  })

  test('fechado ao público: sessão que o HUB não liberou recebe 403 sem falar com a Absolute ZRO', async () => {
    const cookies = await entrar()
    const fechada = selar(`${PREFIXO}_conta`, { sub: LIA.sub, nome: LIA.nome, email: LIA.email, produtos: [PRODUTO], release: 'closed' }, 3600)
    const r = await pedir('/api/zro/set', { cookies: { ...cookies, [`${PREFIXO}_conta`]: fechada } })
    assert.equal(r.status, 403)
    assert.equal(zro.estado.set.length, 0)
  })
})

describe('a aba em comum', () => {
  const ler = (k) => readFileSync(new URL(ARQUIVOS[k], import.meta.url), 'utf8')

  test('"Set" no fim do dock, escondido até o Set responder, com o ícone e o balão', () => {
    const dock = /<nav class="(?:dock|abas)"[^>]*>([\s\S]*?)<\/nav>/.exec(ler('html'))?.[1] ?? ''
    assert.match(dock, /<button data-set hidden[^>]*><svg><use href="#i-set" \/><\/svg><span>Set<\/span><span class="balao" data-set-balao hidden><\/span><\/button>\s*$/)
    assert.match(ler('html'), /<symbol id="i-set"/)
    assert.match(ler('principal'), /montarSet\(\)/)
  })

  test('a folha é o <zro-set modo="folha"> da Absolute ZRO (no app de computador, a cópia de vendor/), pelo repasse', () => {
    const js = ler('js')
    assert.match(js, /https:\/\/absolutezro\.com\/set\/v1\/zro-set\.js/)
    assert.match(js, /vendor\/set\/v1\/zro-set\.js/)
    assert.match(js, /setAttribute\('modo', 'folha'\)/)
    assert.match(js, /setAttribute\('api', '\/api\/zro\/set'\)/)
    assert.ok(!/\.token\s*=/.test(js), 'a página não recebe token')
    assert.match(readFileSync(new URL('../scripts/vendor.mjs', import.meta.url), 'utf8'), /set\/v1\/zro-set\.js/)
  })

  test('a identidade do app veste a folha (cores, raio e fonte)', () => {
    const css = ler('css')
    for (const v of ['tinta', 'apoio', 'superficie', 'fundo', 'acento', 'acento-tinta', 'raio', 'fonte']) assert.match(css, new RegExp(`--zro-set-${v}: `), v)
  })

  test('a entrada aparece com o primeiro estado, leva o balão e abre e fecha a folha', async () => {
    globalThis.location ??= { protocol: 'https:', search: '', hash: '', pathname: '/app/' }
    const { ligarSet } = await import(ARQUIVOS.js)
    const el = new EventTarget()
    el.abrirSet = () => {
      el.aberto = true
      el.dispatchEvent(new Event('zro-set:aberto'))
    }
    el.fecharSet = () => {
      el.aberto = false
      el.dispatchEvent(new Event('zro-set:fechado'))
    }
    const attrs = {}
    const b = Object.assign(new EventTarget(), { balao: { hidden: true, textContent: '' }, setAttribute: (k, v) => (attrs[k] = v) })
    b.querySelector = () => b.balao
    ligarSet(el, [b])
    assert.equal(b.hidden, true)
    el.dispatchEvent(Object.assign(new Event('zro-set:estado'), { detail: { online: 3, naoLidas: 1, pedidos: 1 } }))
    assert.equal(b.hidden, false)
    assert.equal(b.balao.textContent, '2')
    assert.match(attrs['aria-label'], /3 online, 2 novidades/)
    b.dispatchEvent(new Event('click'))
    assert.equal(attrs['aria-expanded'], 'true')
    b.dispatchEvent(new Event('click'))
    assert.equal(attrs['aria-expanded'], 'false')
    el.dispatchEvent(new Event('zro-set:sem-login'))
    assert.equal(b.hidden, true)
  })
})
