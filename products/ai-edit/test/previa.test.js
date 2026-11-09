// A prévia do titular no team grátis ZROFREE (api/_previa.js, api/previa.js): sem ZRO_CHAVE_PREVIA a porta não existe;
// com ela, só quem abre /previa com a chave certa ganha o cookie (o HMAC, nunca a chave) e usa o editor sem conta,
// como a conta `allowed`. O projeto oficial (sem a variável) não muda nada.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import http from 'node:http'

const RAIZ = new URL('..', import.meta.url)
const ler = (p) => readFileSync(new URL(p, RAIZ), 'utf8')
const CHAVE = 'chave-da-previa-do-titular-para-teste-1234'

describe('prévia por chave (ZRO_CHAVE_PREVIA)', () => {
  let srv, SITE
  const f = {}

  before(async () => {
    // o team grátis: login único desligado (sem cliente da Absolute ZRO)
    for (const k of ['ZRO_CLIENT_ID', 'ZRO_CLIENT_SECRET', 'ZRO_ISSUER', 'ZRO_CHAVE_PREVIA', 'RELEASE']) delete process.env[k]
    f.app = (await import('../api/app.js')).default
    f.previa = (await import('../api/previa.js')).default
    f.eu = (await import('../api/zro/eu.js')).default
    srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x')
      if (u.pathname === '/previa') return f.previa(req, res)
      if (u.pathname === '/api/zro/eu') return f.eu(req, res)
      if (/^\/(app|src|presets|site|marca)(\/|$)/.test(u.pathname)) {
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

  const pedir = (caminho, cookie = '') => fetch(new URL(caminho, SITE), { redirect: 'manual', headers: cookie ? { cookie } : {} })
  async function neutra(r, status, rotulo) {
    assert.equal(r.status, status, rotulo)
    const html = await r.text()
    assert.match(html, /indisponível\./, rotulo)
    assert.doesNotMatch(html, /AEON|previa|chave/i, rotulo)
  }
  async function fechado(cookie, rotulo) {
    await neutra(await pedir('/app/', cookie), 200, `${rotulo}: /app/`)
    await neutra(await pedir('/app/editor.js', cookie), 404, `${rotulo}: editor.js`)
    // sem login configurado e sem prévia: o editor manda para entrar.html (503 = login desligado)
    assert.equal((await pedir('/api/zro/eu', cookie)).status, 503, `${rotulo}: eu`)
  }

  test('sem a variável: /previa é a página neutra (404) e o editor fica fechado', async () => {
    await neutra(await pedir(`/previa?chave=${encodeURIComponent(CHAVE)}`), 404, 'sem variável')
    await fechado('', 'anônimo')
  })

  test('chave curta (menos de 24): a porta não existe', async () => {
    process.env.ZRO_CHAVE_PREVIA = 'curta-demais'
    const r = await pedir('/previa?chave=curta-demais')
    await neutra(r, 404, 'chave curta')
    assert.equal(r.headers.getSetCookie().length, 0)
    await fechado('', 'chave curta')
  })

  test('chave errada: a página neutra, sem cookie', async () => {
    process.env.ZRO_CHAVE_PREVIA = CHAVE
    for (const errada of ['', 'errada', `${CHAVE}x`, CHAVE.slice(0, -1), 'x'.repeat(300)]) {
      const r = await pedir(`/previa?chave=${encodeURIComponent(errada)}`)
      await neutra(r, 404, `errada: ${errada.slice(0, 10)}`)
      assert.equal(r.headers.getSetCookie().length, 0)
    }
    assert.equal((await pedir('/previa?chave=x', '')).status, 404)
  })

  test('chave certa: 303 para o editor e o cookie com o HMAC (nunca a chave); com ele, o editor inteiro e a prévia no /eu', async () => {
    process.env.ZRO_CHAVE_PREVIA = CHAVE
    const r = await pedir(`/previa?chave=${encodeURIComponent(CHAVE)}`)
    assert.equal(r.status, 303)
    assert.equal(r.headers.get('location'), '/app/')
    const [c] = r.headers.getSetCookie()
    assert.match(c, /^ae_previa=[A-Za-z0-9_-]+; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/)
    assert.ok(!c.includes(CHAVE))
    const cookie = c.split(';')[0]
    const app = await pedir('/app/', cookie)
    assert.equal(app.status, 200)
    assert.equal(app.headers.get('cache-control'), 'no-store')
    assert.equal(await app.text(), ler('app/index.html'))
    const js = await pedir('/app/editor.js', cookie)
    assert.equal(js.status, 200)
    assert.equal(await js.text(), ler('app/editor.js'))
    // o que não é do editor continua 404
    assert.equal((await pedir('/api/app?caminho=api/_zro.js', cookie)).status, 404)
    // o editor abre: o /eu responde a prévia (sem conta, sem NOSSOM)
    const eu = await pedir('/api/zro/eu', cookie)
    assert.equal(eu.status, 200)
    const d = await eu.json()
    assert.equal(d.previa, true)
    assert.equal(d.acesso, true)
    assert.equal(d.irmaos.nossom, false)
    assert.equal(d.pessoa.email, null)
  })

  test('cookie forjado, de outra chave ou com a chave trocada: fechado', async () => {
    process.env.ZRO_CHAVE_PREVIA = CHAVE
    await fechado('ae_previa=abc', 'forjado')
    await fechado(`ae_previa=${encodeURIComponent(CHAVE)}`, 'a própria chave no cookie')
    const r = await pedir(`/previa?chave=${encodeURIComponent(CHAVE)}`)
    const cookie = r.headers.getSetCookie()[0].split(';')[0]
    process.env.ZRO_CHAVE_PREVIA = 'outra-chave-depois-de-trocar-1234567'
    await fechado(cookie, 'chave trocada')
    delete process.env.ZRO_CHAVE_PREVIA
    await fechado(cookie, 'variável removida')
  })
})
