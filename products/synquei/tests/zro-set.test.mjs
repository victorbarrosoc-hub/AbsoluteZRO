// O Set no Synquei (ADR 0032 da Absolute ZRO): o repasse /api/zro/set (api/zro/set.js) e o do app de desktop
// (desktop/conta.cjs) contra a Absolute ZRO falsa. Encaminha com o Bearer da sessão (e nada mais), só os caminhos do
// Set, a ETag vai e o 304 volta sem corpo, um 401 de lá não apaga a sessão (vale para a Z), "saiu" não disputa o
// refresh token, e o login pede zro.set (com a volta sem ele quando a Absolute ZRO ainda não conhece o escopo).
// E a entrada do app: "Set" no menu e na barra do celular, escondida até o Set responder, que abre a folha.

import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ESCOPOS_ESPERADOS, ESCOPOS_SEM_SET, iniciarZroFalsa } from './zro-falso.mjs'

const CLIENTE = { clientId: 'synquei-web', clientSecret: 'segredo-de-teste-do-synquei' }
const LIA = { sub: 'zro-111', email: 'lia@produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: ['synquei'] }
const CONVERSA = '3f2b8c1e-7d4a-4b9e-9c21-5a6f7e8d9c0b'
let zro, app, SITE
const rotas = {}

before(async () => {
  zro = await iniciarZroFalsa(CLIENTE)
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret })
  for (const r of ['entrar', 'callback', 'set']) rotas[r] = (await import(`../api/zro/${r}.js`)).default
  app = http.createServer((req, res) => {
    const r = /^\/api\/zro\/(\w+)/.exec(req.url)
    if (r && rotas[r[1]]) return rotas[r[1]](req, res)
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

beforeEach(() => Object.assign(zro.estado, { semSet: false, recusarSet: false, setPedidos: [], setVersao: 1, fora: false }))

const cookiesDe = (res) => new Map(res.headers.getSetCookie().map((c) => [c.split('=')[0], c.slice(c.indexOf('=') + 1).split(';')[0]]))
const comCookies = (c) =>
  Object.entries(c)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
const pedir = (caminho, { cookies = {}, ...init } = {}) => fetch(new URL(caminho, SITE), { redirect: 'manual', ...init, headers: { cookie: comCookies(cookies), ...(init.headers || {}) } })
const json = (metodo, corpo, extra = {}) => ({ method: metodo, headers: { 'content-type': 'application/json', origin: SITE, ...extra }, body: JSON.stringify(corpo) })

/** Entra com a Absolute ZRO falsa e devolve os cookies da sessão; segue as idas e voltas (inclusive a sem zro.set). */
async function entrar() {
  zro.estado.pessoa = LIA
  let ida = await pedir('/api/zro/entrar')
  let sqZro = cookiesDe(ida).get('sq_zro')
  for (let i = 0; i < 3; i++) {
    const z = await fetch(new URL(ida.headers.get('location')), { redirect: 'manual' })
    const volta = await pedir(z.headers.get('location').replace(SITE, ''), { cookies: { sq_zro: sqZro } })
    const c = cookiesDe(volta)
    if (c.get('sq_conta')) return { sq_conta: c.get('sq_conta'), sq_hub: c.get('sq_hub') }
    // a volta mandou pedir de novo (sem o Set)
    assert.match(volta.headers.get('location'), /^\/api\/zro\/entrar\?/)
    ida = await pedir(volta.headers.get('location'))
    sqZro = cookiesDe(ida).get('sq_zro')
  }
  throw new Error('não entrou')
}

describe('login', () => {
  test('pede zro.set junto com a Z', async () => {
    const ida = await pedir('/api/zro/entrar')
    assert.equal(new URL(ida.headers.get('location')).searchParams.get('scope'), ESCOPOS_ESPERADOS)
  })
  test('Absolute ZRO de antes do Set (invalid_scope): pede de novo sem zro.set e entra', async () => {
    zro.estado.recusarSet = true
    const s = await entrar()
    assert.ok(s.sq_conta && s.sq_hub)
    assert.equal(zro.estado.escopos, ESCOPOS_SEM_SET)
  })
})

describe('repasse do Set', () => {
  test('sem sessão: 401 com reconectar, e nada chega à Absolute ZRO', async () => {
    const r = await pedir('/api/zro/set')
    assert.equal(r.status, 401)
    assert.equal((await r.json()).reconectar, true)
    assert.equal(zro.estado.setPedidos.length, 0)
  })

  test('encaminha com o Bearer da sessão, sem cookie do site; ETag vai e o 304 volta sem corpo', async () => {
    const s = await entrar()
    const r = await pedir('/api/zro/set', { cookies: s })
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('cache-control'), 'no-store')
    const etag = r.headers.get('etag')
    assert.equal(etag, 'W/"v1"')
    const texto = await r.text()
    assert.equal(JSON.parse(texto).naoLidas, 2)
    const p = zro.estado.setPedidos.at(-1)
    assert.equal(p.caminho, '')
    assert.match(p.auth, /^Bearer at_[0-9a-f]{32}$/)
    assert.equal(p.cookie, null, 'os cookies do Synquei não vão para a Absolute ZRO')
    assert.ok(!texto.includes(p.auth.slice(7)), 'o token não aparece na resposta')
    const r2 = await pedir('/api/zro/set', { cookies: s, headers: { 'if-none-match': etag } })
    assert.equal(r2.status, 304)
    assert.equal(await r2.text(), '')
    assert.equal(zro.estado.setPedidos.at(-1).inm, etag)
    // ETag que não é a da API não segue
    await pedir('/api/zro/set', { cookies: s, headers: { 'if-none-match': '"outra", W/"x"' } })
    assert.equal(zro.estado.setPedidos.at(-1).inm, null)
  })

  test('a Vercel reescreve para ?c=: o mesmo caminho, e só antes/depois/limite seguem na conversa', async () => {
    const s = await entrar()
    assert.equal((await pedir('/api/zro/set?c=conversas', { cookies: s })).status, 200)
    await pedir(`/api/zro/set?c=conversas/${CONVERSA}&depois=12&x=1&limite=abc`, { cookies: s })
    const p = zro.estado.setPedidos.at(-1)
    assert.equal(p.caminho, `conversas/${CONVERSA}`)
    assert.equal(p.busca, '?depois=12')
  })

  test('batida, envio e preferências passam com o corpo; outra origem e corpo que não é JSON não', async () => {
    const s = await entrar()
    assert.equal((await pedir('/api/zro/set', { cookies: s, ...json('POST', { estado: 'ativo' }) })).status, 200)
    assert.equal(JSON.parse(zro.estado.setPedidos.at(-1).corpo).estado, 'ativo')
    assert.equal((await pedir(`/api/zro/set/conversas/${CONVERSA}/mensagens`, { cookies: s, ...json('POST', { texto: 'Oi', chave: 'abcdefgh12' }) })).status, 200)
    assert.equal((await pedir('/api/zro/set/preferencias', { cookies: s, ...json('PUT', { invisivel: true }) })).status, 200)
    const n = zro.estado.setPedidos.length
    assert.equal((await pedir('/api/zro/set', { cookies: s, ...json('POST', { estado: 'ativo' }, { origin: 'https://malicioso.exemplo' }) })).status, 403)
    assert.equal((await pedir('/api/zro/set', { cookies: s, method: 'POST', headers: { origin: SITE, 'content-type': 'text/plain' }, body: 'oi' })).status, 415)
    assert.equal(zro.estado.setPedidos.length, n)
  })

  test('só os caminhos e métodos do Set passam', async () => {
    const s = await entrar()
    for (const c of ['../oauth/token', 'admin', 'conversas/nao-e-uuid', `conversas/${CONVERSA}/x`, 'conversas/a%2Fb', 'ia/estado']) assert.equal((await pedir(`/api/zro/set/${c}`, { cookies: s })).status, 404, c)
    assert.equal((await pedir('/api/zro/set/preferencias', { cookies: s })).status, 405)
    assert.equal((await pedir('/api/zro/set/denuncias', { cookies: s })).status, 405)
    assert.equal(zro.estado.setPedidos.length, 0)
  })

  test('login de antes do Set (token sem zro.set): 401, e a sessão continua (sem apagar o cofre)', async () => {
    const s = await entrar()
    zro.estado.semSet = true
    const r = await pedir('/api/zro/set', { cookies: s })
    assert.equal(r.status, 401)
    assert.equal((await r.json()).reconectar, true)
    assert.ok(!r.headers.getSetCookie().some((c) => c.startsWith('sq_hub=') && /Max-Age=0/.test(c)), 'o cofre da Z fica')
  })

  test('token vencido: renova e grava o cofre novo; "saiu" com o token vencido não renova', async () => {
    // o access token já nasce quase vencido (o cofre sabe a validade)
    zro.estado.atTtl = 1
    const s = await entrar()
    zro.estado.atTtl = 600
    const antes = zro.estado.renovacoes
    const saiu = await pedir('/api/zro/set', { cookies: s, ...json('POST', { estado: 'saiu' }) })
    assert.equal(saiu.status, 204)
    assert.equal(zro.estado.renovacoes, antes, 'saiu não gasta o refresh token')
    const r = await pedir('/api/zro/set', { cookies: s })
    assert.equal(r.status, 200)
    assert.equal(zro.estado.renovacoes, antes + 1)
    assert.ok(cookiesDe(r).get('sq_hub') !== s.sq_hub)
  })
})

describe('desktop', () => {
  test('o app de computador repassa o Set com o token da sessão, a ETag e os mesmos caminhos', async () => {
    const z = await iniciarZroFalsa({ clientId: 'synquei-desktop', publico: true })
    const issuer = process.env.ZRO_ISSUER
    process.env.ZRO_ISSUER = z.url
    const caminhoConta = new URL('../desktop/conta.cjs', import.meta.url).pathname
    const req = createRequire(import.meta.url)
    delete req.cache[caminhoConta]
    const { criarConta } = req(caminhoConta)
    const dir = mkdtempSync(join(tmpdir(), 'synquei-set-'))
    const navegador = async (url) => {
      const r = await fetch(url, { redirect: 'manual' })
      await (await fetch(new URL(r.headers.get('location')))).text()
    }
    try {
      z.estado.pessoa = LIA
      const c = criarConta({ pasta: dir, abrirNavegador: navegador })
      const pedido = (metodo = 'GET', corpo, h = {}) => new Request('http://app.invalid/api/zro/set', { method: metodo, headers: { ...(corpo ? { 'content-type': 'application/json' } : {}), ...h }, ...(corpo ? { body: corpo } : {}) })
      assert.equal((await c.repassarSet(pedido(), '')).status, 401)
      assert.equal(z.estado.setPedidos.length, 0)
      assert.equal(await c.entrar(), 'ok')
      assert.equal(z.estado.escopos, ESCOPOS_ESPERADOS)
      let r = await c.repassarSet(pedido(), '')
      assert.equal(r.status, 200)
      assert.equal(r.headers.get('etag'), 'W/"v1"')
      r = await c.repassarSet(pedido('GET', null, { 'if-none-match': 'W/"v1"' }), '')
      assert.equal(r.status, 304)
      await c.repassarSet(pedido(), `conversas/${CONVERSA}`, '?antes=4&x=1')
      assert.equal(z.estado.setPedidos.at(-1).busca, '?antes=4')
      assert.equal((await c.repassarSet(pedido(), '../oauth/token')).status, 404)
      assert.equal((await c.repassarSet(pedido('POST', 'oi', { 'content-type': 'text/plain' }), '')).status, 415)
      z.estado.semSet = true
      assert.equal((await c.repassarSet(pedido(), '')).status, 401)
      assert.ok(c.eu(), 'a sessão continua')
      c.sair()
      // Absolute ZRO de antes do Set: o login refaz sem zro.set
      Object.assign(z.estado, { semSet: false, recusarSet: true })
      assert.equal(await criarConta({ pasta: dir, abrirNavegador: navegador }).entrar(), 'ok')
      assert.equal(z.estado.escopos, ESCOPOS_SEM_SET)
    } finally {
      process.env.ZRO_ISSUER = issuer
      delete req.cache[caminhoConta]
      rmSync(dir, { recursive: true, force: true })
      await z.fechar()
    }
  })
})

describe('a aba em comum no app', () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8')
  const setJs = readFileSync(new URL('../app/js/set.js', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../app/js/main.js', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../app/app.css', import.meta.url), 'utf8')

  test('"Set" no menu (depois do Início) e, no celular, no canto do Início ao lado da Z (depois da conta), escondido até o Set responder', () => {
    assert.match(html, /data-r="inicio"><svg class="icon"><use href="#i-home" \/><\/svg><span>Início<\/span><\/a>\s*<!--[^>]*-->\s*<button class="nav-item" type="button" data-set hidden/)
    // a barra de baixo fica com as cinco abas da tarefa: nem Set nem Z
    const abas = /<nav class="tabbar"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1]
    assert.doesNotMatch(abas, /data-set|#\/z/)
    assert.equal((abas.match(/<a /g) || []).length, 5)
    const inicio = readFileSync(new URL('../app/js/views/inicio.js', import.meta.url), 'utf8')
    assert.match(inicio, /<span class="eco-atalhos"><span class="conta-atalho" data-conta-atalho>\$\{atalhoConta\(\)\}<\/span><button class="icon-btn set-atalho" type="button" data-set hidden[^>]*>\$\{icon\('set'\)\}<span class="balao" data-set-balao hidden><\/span><\/button><a class="icon-btn z-atalho"/)
    assert.match(main, /pintarSet\(\)/)
    assert.match(html, /<symbol id="i-set"/)
    assert.match(main, /contaPronta\.then\(iniciarSet\)/)
  })

  test('a folha é o <zro-set modo="folha"> da Absolute ZRO, pelo repasse do app (sem token na página)', () => {
    assert.match(setJs, /https:\/\/absolutezro\.com\/set\/v1\/zro-set\.js/)
    assert.match(setJs, /setAttribute\('modo', 'folha'\)/)
    assert.match(setJs, /setAttribute\('api', '\/api\/zro\/set'\)/)
    assert.ok(!/\.token\s*=/.test(setJs), 'a página não recebe token')
  })

  test('a identidade do Synquei veste a folha (cores, raio e fonte do app)', () => {
    for (const v of ['tinta', 'apoio', 'superficie', 'fundo', 'acento', 'acento-tinta', 'raio', 'fonte']) assert.match(css, new RegExp(`--zro-set-${v}: [^;]*var\\(--`), v)
  })

  test('a entrada aparece com o primeiro estado, leva o balão e abre (e fecha) a folha', async () => {
    const { ligarSet } = await import('../app/js/set.js')
    const el = new EventTarget()
    el.aberto = false
    el.abrirSet = () => {
      el.aberto = true
      el.dispatchEvent(new Event('zro-set:aberto'))
    }
    el.fecharSet = () => {
      el.aberto = false
      el.dispatchEvent(new Event('zro-set:fechado'))
    }
    const entrada = () => {
      const e = new EventTarget()
      const attrs = {}
      e.balao = { hidden: true, textContent: '' }
      e.hidden = false
      e.setAttribute = (k, v) => (attrs[k] = v)
      e.getAttribute = (k) => attrs[k]
      e.querySelector = (s) => (s === '[data-set-balao]' ? e.balao : null)
      return e
    }
    const menu = entrada()
    const aba = entrada()
    ligarSet(el, [menu, aba])
    assert.equal(menu.hidden, true, 'escondida até o Set responder')
    el.dispatchEvent(Object.assign(new Event('zro-set:estado'), { detail: { online: 1, naoLidas: 2, pedidos: 1 } }))
    assert.equal(menu.hidden, false)
    assert.equal(aba.balao.textContent, '3')
    assert.equal(aba.balao.hidden, false)
    assert.match(menu.getAttribute('aria-label'), /1 online, 3 novidades/)
    menu.dispatchEvent(new Event('click'))
    assert.equal(el.aberto, true)
    assert.equal(aba.getAttribute('aria-expanded'), 'true')
    aba.dispatchEvent(new Event('click'))
    assert.equal(el.aberto, false)
    assert.equal(menu.getAttribute('aria-expanded'), 'false')
    el.dispatchEvent(new Event('zro-set:sem-login'))
    assert.equal(menu.hidden, true)
  })

  test('a entrada que nasce depois (o canto do Início redesenhado) ganha o estado de agora e o clique', async () => {
    const { ligarSet } = await import('../app/js/set.js')
    const el = new EventTarget()
    el.aberto = false
    el.abrirSet = () => {
      el.aberto = true
      el.dispatchEvent(new Event('zro-set:aberto'))
    }
    el.fecharSet = () => {
      el.aberto = false
      el.dispatchEvent(new Event('zro-set:fechado'))
    }
    const entrada = () => {
      const e = new EventTarget()
      const attrs = {}
      e.balao = { hidden: true, textContent: '' }
      e.hidden = true
      e.setAttribute = (k, v) => (attrs[k] = v)
      e.getAttribute = (k) => attrs[k]
      e.querySelector = (s) => (s === '[data-set-balao]' ? e.balao : null)
      return e
    }
    let agora = [entrada()]
    const pintar = ligarSet(el, () => agora)
    el.dispatchEvent(Object.assign(new Event('zro-set:estado'), { detail: { online: 2, naoLidas: 1 } }))
    const nova = entrada()
    agora = [agora[0], nova]
    pintar()
    pintar()
    assert.equal(nova.hidden, false)
    assert.equal(nova.balao.textContent, '1')
    assert.match(nova.getAttribute('aria-label'), /2 online, 1 novidade/)
    nova.dispatchEvent(new Event('click'))
    assert.equal(el.aberto, true, 'um clique, uma abertura (o clique não foi ligado duas vezes)')
    assert.equal(agora[0].getAttribute('aria-expanded'), 'true')
  })
})
