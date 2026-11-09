// A porta de prévia (api/_previa.js e api/previa.js; titular, 09/11/2026): a Revela abre num projeto Vercel grátis à
// parte (team ZROFREE) só para quem tem a chave ZRO_CHAVE_PREVIA, sem o login do HUB. Sem a variável, nada muda.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import http from 'node:http'
import { selo } from '../api/_previa.js'

const RAIZ = new URL('..', import.meta.url)
const ler = (p) => readFileSync(new URL(p, RAIZ), 'utf8')
const CHAVE = 'chave-de-previa-da-revela-com-folga-1234'

describe('porta de prévia da Revela', () => {
  let srv
  let SITE
  const f = {}

  before(async () => {
    for (const k of ['ZRO_CHAVE_PREVIA', 'ZRO_CLIENT_ID', 'ZRO_CLIENT_SECRET', 'RELEASE']) delete process.env[k]
    f.app = (await import('../api/app.js')).default
    f.previa = (await import('../api/previa.js')).default
    // como na Vercel: /previa vai para a função da porta e as ferramentas e pastas para api/app.js (vercel.json)
    srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x')
      if (u.pathname === '/previa') return f.previa(req, res)
      const ferramenta = /^\/(inicio|lut|lab|looks|cst|entrega|converter)$/.exec(u.pathname)
      if (ferramenta) {
        req.url = `/api/app?caminho=${ferramenta[1]}.html`
        return f.app(req, res)
      }
      if (/^\/(app|src|exemplos|marca)\//.test(u.pathname)) {
        req.url = `/api/app?caminho=${encodeURIComponent(u.pathname.slice(1))}`
        return f.app(req, res)
      }
      res.statusCode = 404
      res.end()
    })
    await new Promise((ok) => srv.listen(0, '127.0.0.1', ok))
    SITE = `http://127.0.0.1:${srv.address().port}`
  })
  after(async () => {
    delete process.env.ZRO_CHAVE_PREVIA
    await new Promise((ok) => srv?.close(() => ok()))
  })

  const pedir = (caminho, cookie) => fetch(new URL(caminho, SITE), { redirect: 'manual', headers: cookie ? { cookie } : {} })
  async function fechada(cookie, rotulo) {
    const r = await pedir('/lut', cookie)
    assert.equal(r.status, 200, rotulo)
    const html = await r.text()
    assert.match(html, /indisponível\./, rotulo)
    assert.doesNotMatch(html, /Revela/, rotulo)
    assert.equal((await pedir('/app/revela.js', cookie)).status, 404, rotulo)
  }
  async function neutraSemCookie(caminho, rotulo) {
    const r = await pedir(caminho)
    assert.equal(r.status, 200, rotulo)
    assert.equal(r.headers.get('set-cookie'), null, rotulo)
    assert.equal(r.headers.get('location'), null, rotulo)
    const html = await r.text()
    assert.match(html, /indisponível\./, rotulo)
    assert.doesNotMatch(html, /Revela/, rotulo)
  }

  test('sem a variável: /previa é a página neutra e as ferramentas seguem fechadas', async () => {
    await neutraSemCookie(`/previa?chave=${CHAVE}`, 'sem variável')
    await fechada(undefined, 'anônimo')
    await fechada(`rv_previa=${selo(CHAVE)}`, 'cookie certo, mas porta desligada')
  })

  test('chave curta (menos de 24 caracteres): a porta não existe', async () => {
    process.env.ZRO_CHAVE_PREVIA = 'curta-demais'
    try {
      await neutraSemCookie('/previa?chave=curta-demais', 'chave curta')
      await fechada(`rv_previa=${selo('curta-demais')}`, 'cookie da chave curta')
    } finally {
      delete process.env.ZRO_CHAVE_PREVIA
    }
  })

  test('chave errada: a página neutra, sem cookie e sem dizer o que faltou', async () => {
    process.env.ZRO_CHAVE_PREVIA = CHAVE
    try {
      await neutraSemCookie('/previa?chave=errada', 'chave errada')
      await neutraSemCookie(`/previa?chave=${CHAVE}x`, 'chave quase certa')
      await neutraSemCookie('/previa', 'sem chave')
      assert.equal((await fetch(new URL(`/previa?chave=${CHAVE}`, SITE), { method: 'POST', redirect: 'manual' })).status, 405)
    } finally {
      delete process.env.ZRO_CHAVE_PREVIA
    }
  })

  test('chave certa: 303 para /inicio com o cookie (HMAC, nunca a chave); com ele, as ferramentas abrem', async () => {
    process.env.ZRO_CHAVE_PREVIA = CHAVE
    try {
      const r = await pedir(`/previa?chave=${encodeURIComponent(CHAVE)}`)
      assert.equal(r.status, 303)
      assert.equal(r.headers.get('location'), '/inicio')
      const c = r.headers.get('set-cookie')
      assert.match(c, /^rv_previa=[A-Za-z0-9_-]+; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/)
      assert.ok(!c.includes(CHAVE))
      const cookie = c.split(';')[0]
      for (const ferramenta of ['inicio', 'lut', 'cst', 'entrega', 'converter']) {
        const a = await pedir(`/${ferramenta}`, cookie)
        assert.equal(a.status, 200, ferramenta)
        assert.equal(await a.text(), ler(`${ferramenta}.html`), ferramenta)
      }
      const js = await pedir('/app/revela.js', cookie)
      assert.equal(js.status, 200)
      assert.match(js.headers.get('content-type'), /^text\/javascript/)
      assert.equal(js.headers.get('cache-control'), 'no-store')
      // trocou a chave na Vercel: o cookie antigo deixa de valer
      process.env.ZRO_CHAVE_PREVIA = `${CHAVE}-nova`
      await fechada(cookie, 'chave trocada')
    } finally {
      delete process.env.ZRO_CHAVE_PREVIA
    }
  })

  test('cookie forjado ou adulterado: fechada', async () => {
    process.env.ZRO_CHAVE_PREVIA = CHAVE
    try {
      await fechada('rv_previa=abc', 'forjado')
      await fechada(`rv_previa=${selo(CHAVE)}x`, 'adulterado')
      await fechada(`rv_previa=${CHAVE}`, 'a chave no lugar do HMAC')
      await fechada(`rv_conta=${selo(CHAVE)}`, 'HMAC no cookie errado')
    } finally {
      delete process.env.ZRO_CHAVE_PREVIA
    }
  })

  test('vercel.json: /previa vai para a função da porta, que leva a página neutra no pacote', () => {
    const v = JSON.parse(ler('vercel.json'))
    assert.ok(v.rewrites.some((r) => r.source === '/previa' && r.destination === '/api/previa'))
    assert.equal(v.functions['api/previa.js'].includeFiles, 'em-desenvolvimento.html')
  })
})
