// "Entrar com Absolute ZRO" (api/zro/*) contra uma Absolute ZRO falsa local: entra e mostra a pessoa, sai, e recusa
// state errado, nonce errado, emissor e público errados, assinatura inválida, token vencido, cookie adulterado e volta
// para fora do site. As funções rodam num servidor http de verdade, como na Vercel.

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { iniciarZroFalsa } from './zro-falso.js'

const CLIENTE = { clientId: 'revela-web', clientSecret: 'segredo-de-teste-da-revela' }
const LIA = { sub: 'zro-111', email: 'Lia@Produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: ['finishing', 'sobedesce'] }
let zro, app, SITE
const rotas = {}

before(async () => {
  zro = await iniciarZroFalsa(CLIENTE)
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret })
  for (const r of ['entrar', 'callback', 'eu', 'sair']) rotas[r] = (await import(`../api/zro/${r}.js`)).default
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

/** Navegador: /api/zro/entrar → Absolute ZRO falsa → /api/zro/callback. */
async function fluxo({ pessoa = LIA, volta, criar = false, adulterar = null, negar = false, trocarState = false, mexerNaIda = null } = {}) {
  Object.assign(zro.estado, { pessoa, adulterar, negar })
  const q = new URLSearchParams()
  if (volta !== undefined) q.set('volta', volta)
  if (criar) q.set('criar', '1')
  const ida = await pedir(`/api/zro/entrar${q.size ? `?${q}` : ''}`)
  assert.equal(ida.status, 302)
  const u = new URL(ida.headers.get('location'))
  assert.equal(u.origin, zro.url)
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(u.searchParams.get('redirect_uri'), `${SITE}/api/zro/callback`)
  assert.equal(u.searchParams.get('scope'), 'openid email profile org')
  assert.ok(u.searchParams.get('nonce'))
  const setCookie = ida.headers.getSetCookie()[0]
  for (const a of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api/zro', 'Max-Age=600']) assert.ok(setCookie.includes(a), `cookie da ida com ${a}`)
  let sqZro = cookiesDe(ida).get('rv_zro')
  if (mexerNaIda) sqZro = mexerNaIda(sqZro)
  const z = await fetch(u, { redirect: 'manual' })
  let vem = z.headers.get('location')
  if (trocarState) vem = vem.replace(/state=[^&]+/, 'state=outro')
  const res = await pedir(vem.replace(SITE, ''), { cookies: { rv_zro: sqZro } })
  assert.equal(res.status, 303)
  const c = cookiesDe(res)
  assert.equal(c.get('rv_zro'), '', 'o cookie da ida é apagado na volta')
  return { res, destino: res.headers.get('location'), conta: c.get('rv_conta') }
}

describe('entrar', () => {
  test('entra, volta para o app e /eu mostra a pessoa (sem token da Absolute ZRO)', async () => {
    const r = await fluxo({ volta: '/entrega#youtube' })
    assert.equal(r.destino, '/entrega?zro=ok#youtube')
    assert.ok(r.conta)
    const cab = r.res.headers.getSetCookie().find((c) => c.startsWith('rv_conta='))
    for (const a of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', `Max-Age=${30 * 24 * 3600}`]) assert.ok(cab.includes(a), `sessão com ${a}`)
    const eu = await pedir('/api/zro/eu', { cookies: { rv_conta: r.conta } })
    assert.equal(eu.status, 200)
    assert.equal(eu.headers.get('cache-control'), 'no-store')
    const j = await eu.json()
    assert.equal(j.acesso, true, 'finishing está em zro_products')
    assert.equal(zro.estado.prompt, null, 'entrar não pede cadastro')
    assert.deepEqual(j.pessoa, { nome: 'Lia Produtora', email: 'lia@produtora.com', organizacao: { nome: 'Produtora Lia', papel: 'owner' }, produtos: ['finishing', 'sobedesce'] })
    const bruto = Buffer.from(r.conta.split('.')[0], 'base64url').toString()
    assert.ok(!/id_token|access_token|"at"/.test(bruto), 'nenhum token da Absolute ZRO no cookie')
  })

  test('sem volta: cai em /lut (o HUB abre o app por aqui)', async () => {
    const r = await fluxo()
    assert.equal(r.destino, '/lut?zro=ok')
  })

  test('volta para fora do site é recusada', async () => {
    for (const v of ['https://mal.exemplo/roubo', '//mal.exemplo/x', '/\\mal.exemplo', 'javascript:alert(1)']) {
      const r = await fluxo({ volta: v })
      assert.equal(r.destino, '/lut?zro=ok', v)
    }
  })

  test('pessoa recusou na Absolute ZRO: volta sem sessão', async () => {
    const r = await fluxo({ negar: true })
    assert.equal(r.destino, '/lut?zro=recusado')
    assert.equal(r.conta, undefined)
  })
})

describe('conta única e direito de uso', () => {
  test('criar conta: o mesmo fluxo com prompt=create e volta já logado', async () => {
    const r = await fluxo({ criar: true, volta: '/entrega#youtube' })
    assert.equal(zro.estado.prompt, 'create')
    assert.equal(r.destino, '/entrega?zro=ok#youtube')
    const j = await (await pedir('/api/zro/eu', { cookies: { rv_conta: r.conta } })).json()
    assert.equal(j.ok, true)
    assert.equal(j.acesso, true)
  })

  test('criar conta fora do endereço oficial leva o criar=1 junto', async () => {
    const r = await pedir('/api/zro/entrar?volta=/lut&criar=1', { headers: { 'x-forwarded-host': 'revela-git-teste.vercel.app', 'x-forwarded-proto': 'https' } })
    assert.equal(r.status, 307)
    assert.equal(r.headers.get('location'), 'https://revela-zro.vercel.app/api/zro/entrar?volta=%2Flut&criar=1')
  })

  test('finishing fora de zro_products: entra, mas /eu diz sem acesso e aponta a Absolute ZRO', async () => {
    const r = await fluxo({ pessoa: { ...LIA, sub: 'zro-222', produtos: ['sobedesce'] } })
    assert.equal(r.destino, '/lut?zro=ok')
    const j = await (await pedir('/api/zro/eu', { cookies: { rv_conta: r.conta } })).json()
    assert.equal(j.ok, true)
    assert.equal(j.acesso, false)
    assert.equal(j.ferramentas, 'https://absolutezro.vercel.app/ferramentas')
    assert.deepEqual(j.pessoa.produtos, ['sobedesce'])
  })

  test('liberado depois: o novo login reavalia zro_products', async () => {
    const antes = await fluxo({ pessoa: { ...LIA, produtos: [] } })
    assert.equal((await (await pedir('/api/zro/eu', { cookies: { rv_conta: antes.conta } })).json()).acesso, false)
    const depois = await fluxo({ pessoa: { ...LIA, produtos: ['finishing'] } })
    assert.equal((await (await pedir('/api/zro/eu', { cookies: { rv_conta: depois.conta } })).json()).acesso, true)
  })
})

describe('recusa', () => {
  for (const [nome, o] of [
    ['state errado', { trocarState: true }],
    ['nonce errado', { adulterar: 'nonce' }],
    ['emissor errado', { adulterar: 'emissor' }],
    ['público errado', { adulterar: 'aud' }],
    ['assinatura inválida', { adulterar: 'assinatura' }],
    ['token vencido', { adulterar: 'expirado' }],
  ]) {
    test(nome, async () => {
      const r = await fluxo(o)
      assert.equal(r.conta, undefined, 'sem sessão')
      assert.equal(r.destino, o.trocarState ? '/lut?zro=expirou' : '/lut?zro=erro')
    })
  }

  test('cookie da ida adulterado (outra volta) não vale', async () => {
    const mexer = (v) => {
      const [corpo, ass] = v.split('.')
      const d = JSON.parse(Buffer.from(corpo, 'base64url').toString())
      d.volta = 'https://mal.exemplo'
      return `${Buffer.from(JSON.stringify(d)).toString('base64url')}.${ass}`
    }
    const r = await fluxo({ mexerNaIda: mexer })
    assert.equal(r.destino, '/lut?zro=expirou')
    assert.equal(r.conta, undefined)
  })

  test('cookie de sessão adulterado, de outro tipo ou vencido: /eu responde 401', async () => {
    const { conta } = await fluxo()
    const [corpo, ass] = conta.split('.')
    const d = JSON.parse(Buffer.from(corpo, 'base64url').toString())
    const trocado = `${Buffer.from(JSON.stringify({ ...d, email: 'outra@pessoa.com' })).toString('base64url')}.${ass}`
    for (const v of [trocado, `${corpo}.${'A'.repeat(43)}`, 'lixo', `${corpo}.${ass}.x`]) {
      const r = await pedir('/api/zro/eu', { cookies: { rv_conta: v } })
      assert.equal(r.status, 401, v)
    }
    // o cookie da ida é assinado com outra chave (HKDF por cookie): não serve de sessão
    const ida = await pedir('/api/zro/entrar')
    const r = await pedir('/api/zro/eu', { cookies: { rv_conta: cookiesDe(ida).get('rv_zro') } })
    assert.equal(r.status, 401)
    // segredo trocado no painel: as sessões antigas caem
    process.env.ZRO_CLIENT_SECRET = 'outro-segredo'
    const r2 = await pedir('/api/zro/eu', { cookies: { rv_conta: conta } })
    process.env.ZRO_CLIENT_SECRET = CLIENTE.clientSecret
    assert.equal(r2.status, 401)
  })

  test('callback sem cookie da ida', async () => {
    const r = await pedir('/api/zro/callback?code=x&state=y')
    assert.equal(r.status, 303)
    assert.equal(r.headers.get('location'), '/lut?zro=expirou')
  })
})

describe('sessão', () => {
  test('/eu sem sessão: 401 com o caminho para entrar', async () => {
    const r = await pedir('/api/zro/eu')
    assert.equal(r.status, 401)
    assert.equal(r.headers.get('cache-control'), 'no-store')
    const j = await r.json()
    assert.equal(j.entrar, '/api/zro/entrar')
    assert.equal(j.criar, '/api/zro/entrar?criar=1')
  })

  test('sair apaga a sessão; GET não sai; outra origem não derruba', async () => {
    assert.equal((await pedir('/api/zro/sair')).status, 405)
    const fora = await pedir('/api/zro/sair', { method: 'POST', headers: { origin: 'https://mal.exemplo' } })
    assert.equal(fora.status, 403)
    const r = await pedir('/api/zro/sair', { method: 'POST', headers: { origin: SITE } })
    assert.equal(r.status, 200)
    assert.match(r.headers.getSetCookie()[0], /^rv_conta=; Path=\/; Max-Age=0/)
  })

  test('sem ZRO_CLIENT_ID/SECRET: /eu 503 e entrar volta ao app com aviso', async () => {
    const { ZRO_CLIENT_ID } = process.env
    delete process.env.ZRO_CLIENT_ID
    try {
      assert.equal((await pedir('/api/zro/eu')).status, 503)
      const r = await pedir('/api/zro/entrar?volta=/lut')
      assert.equal(r.headers.get('location'), '/lut?zro=config')
    } finally {
      process.env.ZRO_CLIENT_ID = ZRO_CLIENT_ID
    }
  })

  test('endereço fora da lista: entrar manda para o site oficial antes de começar', async () => {
    const r = await pedir('/api/zro/entrar?volta=/lut', { headers: { 'x-forwarded-host': 'revela-git-teste.vercel.app', 'x-forwarded-proto': 'https' } })
    assert.equal(r.status, 307)
    assert.equal(r.headers.get('location'), 'https://revela-zro.vercel.app/api/zro/entrar?volta=%2Flut')
  })
})
