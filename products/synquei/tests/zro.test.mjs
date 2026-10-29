// "Entrar com Absolute ZRO" (api/zro/*) contra uma Absolute ZRO falsa local: entra e mostra a pessoa, sai, e recusa
// state errado, nonce errado, emissor e público errados, assinatura inválida, token vencido, cookie adulterado e volta
// para fora do site. As funções rodam num servidor http de verdade, como na Vercel.
// Perfil único: o /eu relê nome, e-mail e foto na Absolute ZRO (userinfo + refresh token cifrado) a cada abertura.

import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { ESCOPOS_ESPERADOS, iniciarZroFalsa } from './zro-falso.mjs'

const CLIENTE = { clientId: 'synquei-web', clientSecret: 'segredo-de-teste-do-synquei' }
const LIA = { sub: 'zro-111', email: 'Lia@Produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: ['synquei', 'sobedesce'] }
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
  assert.equal(u.searchParams.get('scope'), ESCOPOS_ESPERADOS)
  assert.ok(u.searchParams.get('nonce'))
  const setCookie = ida.headers.getSetCookie()[0]
  for (const a of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api/zro', 'Max-Age=600']) assert.ok(setCookie.includes(a), `cookie da ida com ${a}`)
  let sqZro = cookiesDe(ida).get('sq_zro')
  if (mexerNaIda) sqZro = mexerNaIda(sqZro)
  const z = await fetch(u, { redirect: 'manual' })
  let vem = z.headers.get('location')
  if (trocarState) vem = vem.replace(/state=[^&]+/, 'state=outro')
  const res = await pedir(vem.replace(SITE, ''), { cookies: { sq_zro: sqZro } })
  assert.equal(res.status, 303)
  const c = cookiesDe(res)
  assert.equal(c.get('sq_zro'), '', 'o cookie da ida é apagado na volta')
  return { res, destino: res.headers.get('location'), conta: c.get('sq_conta'), hub: c.get('sq_hub') }
}

describe('entrar', () => {
  test('entra, volta para o app e /eu mostra a pessoa (sem token da Absolute ZRO)', async () => {
    const r = await fluxo({ volta: '/app/#/ajustes' })
    assert.equal(r.destino, '/app/?zro=ok#/ajustes')
    assert.ok(r.conta)
    const cab = r.res.headers.getSetCookie().find((c) => c.startsWith('sq_conta='))
    for (const a of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', `Max-Age=${30 * 24 * 3600}`]) assert.ok(cab.includes(a), `sessão com ${a}`)
    const eu = await pedir('/api/zro/eu', { cookies: { sq_conta: r.conta } })
    assert.equal(eu.status, 200)
    assert.equal(eu.headers.get('cache-control'), 'no-store')
    const j = await eu.json()
    assert.equal(j.acesso, true, 'synquei está em zro_products')
    assert.equal(zro.estado.prompt, null, 'entrar não pede cadastro')
    assert.deepEqual(j.pessoa, { nome: 'Lia Produtora', email: 'lia@produtora.com', foto: null, conta: `${zro.url}/perfil`, organizacao: { nome: 'Produtora Lia', papel: 'owner' }, produtos: ['synquei', 'sobedesce'] })
    const bruto = Buffer.from(r.conta.split('.')[0], 'base64url').toString()
    assert.ok(!/id_token|access_token|"at"/.test(bruto), 'nenhum token da Absolute ZRO no cookie')
  })

  test('sem volta: cai em /app/ (o HUB abre o app por aqui)', async () => {
    const r = await fluxo()
    assert.equal(r.destino, '/app/?zro=ok')
  })

  test('volta para fora do site é recusada', async () => {
    for (const v of ['https://mal.exemplo/roubo', '//mal.exemplo/x', '/\\mal.exemplo', 'javascript:alert(1)']) {
      const r = await fluxo({ volta: v })
      assert.equal(r.destino, '/app/?zro=ok', v)
    }
  })

  test('pessoa recusou na Absolute ZRO: volta sem sessão', async () => {
    const r = await fluxo({ negar: true })
    assert.equal(r.destino, '/app/?zro=recusado')
    assert.equal(r.conta, undefined)
  })
})

describe('conta única e direito de uso', () => {
  test('criar conta: o mesmo fluxo com prompt=create e volta já logado', async () => {
    const r = await fluxo({ criar: true, volta: '/app/#/ajustes' })
    assert.equal(zro.estado.prompt, 'create')
    assert.equal(r.destino, '/app/?zro=ok#/ajustes')
    const j = await (await pedir('/api/zro/eu', { cookies: { sq_conta: r.conta } })).json()
    assert.equal(j.ok, true)
    assert.equal(j.acesso, true)
  })

  test('criar conta fora do endereço oficial leva o criar=1 junto', async () => {
    const r = await pedir('/api/zro/entrar?volta=/app/&criar=1', { headers: { 'x-forwarded-host': 'synquei-git-teste.vercel.app', 'x-forwarded-proto': 'https' } })
    assert.equal(r.status, 307)
    assert.equal(r.headers.get('location'), 'https://synquei.absolutezro.com/api/zro/entrar?volta=%2Fapp%2F&criar=1')
  })

  test('synquei fora de zro_products: entra, mas /eu diz sem acesso e aponta a Absolute ZRO', async () => {
    const r = await fluxo({ pessoa: { ...LIA, sub: 'zro-222', produtos: ['sobedesce'] } })
    assert.equal(r.destino, '/app/?zro=ok')
    const j = await (await pedir('/api/zro/eu', { cookies: { sq_conta: r.conta } })).json()
    assert.equal(j.ok, true)
    assert.equal(j.acesso, false)
    assert.equal(j.ferramentas, 'https://absolutezro.com/ferramentas')
    assert.deepEqual(j.pessoa.produtos, ['sobedesce'])
  })

  test('liberado depois: o novo login reavalia zro_products', async () => {
    const antes = await fluxo({ pessoa: { ...LIA, produtos: [] } })
    assert.equal((await (await pedir('/api/zro/eu', { cookies: { sq_conta: antes.conta } })).json()).acesso, false)
    const depois = await fluxo({ pessoa: { ...LIA, produtos: ['synquei'] } })
    assert.equal((await (await pedir('/api/zro/eu', { cookies: { sq_conta: depois.conta } })).json()).acesso, true)
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
      assert.equal(r.destino, o.trocarState ? '/app/?zro=expirou' : '/app/?zro=erro')
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
    assert.equal(r.destino, '/app/?zro=expirou')
    assert.equal(r.conta, undefined)
  })

  test('cookie de sessão adulterado, de outro tipo ou vencido: /eu responde 401', async () => {
    const { conta } = await fluxo()
    const [corpo, ass] = conta.split('.')
    const d = JSON.parse(Buffer.from(corpo, 'base64url').toString())
    const trocado = `${Buffer.from(JSON.stringify({ ...d, email: 'outra@pessoa.com' })).toString('base64url')}.${ass}`
    for (const v of [trocado, `${corpo}.${'A'.repeat(43)}`, 'lixo', `${corpo}.${ass}.x`]) {
      const r = await pedir('/api/zro/eu', { cookies: { sq_conta: v } })
      assert.equal(r.status, 401, v)
    }
    // o cookie da ida é assinado com outra chave (HKDF por cookie): não serve de sessão
    const ida = await pedir('/api/zro/entrar')
    const r = await pedir('/api/zro/eu', { cookies: { sq_conta: cookiesDe(ida).get('sq_zro') } })
    assert.equal(r.status, 401)
    // segredo trocado no painel: as sessões antigas caem
    process.env.ZRO_CLIENT_SECRET = 'outro-segredo'
    const r2 = await pedir('/api/zro/eu', { cookies: { sq_conta: conta } })
    process.env.ZRO_CLIENT_SECRET = CLIENTE.clientSecret
    assert.equal(r2.status, 401)
  })

  test('callback sem cookie da ida', async () => {
    const r = await pedir('/api/zro/callback?code=x&state=y')
    assert.equal(r.status, 303)
    assert.equal(r.headers.get('location'), '/app/?zro=expirou')
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
    assert.match(r.headers.getSetCookie()[0], /^sq_conta=; Path=\/; Max-Age=0/)
  })

  test('sem ZRO_CLIENT_ID/SECRET: /eu 503 e entrar volta ao app com aviso', async () => {
    const { ZRO_CLIENT_ID } = process.env
    delete process.env.ZRO_CLIENT_ID
    try {
      assert.equal((await pedir('/api/zro/eu')).status, 503)
      const r = await pedir('/api/zro/entrar?volta=/app/')
      assert.equal(r.headers.get('location'), '/app/?zro=config')
    } finally {
      process.env.ZRO_CLIENT_ID = ZRO_CLIENT_ID
    }
  })

  test('endereço fora da lista: entrar manda para o site oficial antes de começar', async () => {
    const r = await pedir('/api/zro/entrar?volta=/app/', { headers: { 'x-forwarded-host': 'synquei-git-teste.vercel.app', 'x-forwarded-proto': 'https' } })
    assert.equal(r.status, 307)
    assert.equal(r.headers.get('location'), 'https://synquei.absolutezro.com/api/zro/entrar?volta=%2Fapp%2F')
  })

  test('endereço antigo (synquei.vercel.app): o login começa já no synquei.absolutezro.com', async () => {
    const r = await pedir('/api/zro/entrar?volta=/app/', { headers: { 'x-forwarded-host': 'synquei.vercel.app', 'x-forwarded-proto': 'https' } })
    assert.equal(r.status, 307)
    assert.equal(r.headers.get('location'), 'https://synquei.absolutezro.com/api/zro/entrar?volta=%2Fapp%2F')
  })
})

describe('perfil único (nome, e-mail e foto da conta Absolute ZRO)', () => {
  const FOTO = '3f1c2a9e-0000-4000-8000-000000000001'
  const FOTO_NOVA = '3f1c2a9e-0000-4000-8000-000000000002'
  const abrirApp = (r) => pedir('/api/zro/eu', { cookies: { sq_conta: r.conta, sq_hub: r.hub } })
  /** O navegador guarda o que o /eu devolveu (a sessão e o cofre rodam a cada leitura). */
  const guardar = (r, res) => {
    const c = cookiesDe(res)
    if (c.has('sq_conta')) r.conta = c.get('sq_conta')
    if (c.has('sq_hub')) r.hub = c.get('sq_hub')
    return res
  }
  const passar = (s) => mock.timers.tick(s * 1000)

  beforeEach(() => {
    Object.assign(zro.estado, { atTtl: 600, fora: false, renovacoes: 0, userinfos: 0, revogados: 0 })
    mock.timers.enable({ apis: ['Date'], now: Date.now() })
  })
  afterEach(() => mock.timers.reset())

  test('o login traz a foto e onde editar; os tokens vão cifrados, só para /api/zro', async () => {
    const r = await fluxo({ pessoa: { ...LIA, foto: FOTO } })
    const cab = r.res.headers.getSetCookie().find((c) => c.startsWith('sq_hub='))
    for (const a of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api/zro', `Max-Age=${30 * 24 * 3600}`]) assert.ok(cab.includes(a), `cofre com ${a}`)
    assert.ok(!/zt_|at_|refresh|access/.test(Buffer.from(r.hub, 'base64url').toString('latin1')), 'token cifrado, não só assinado')
    const j = await (await abrirApp(r)).json()
    assert.equal(j.pessoa.foto, `${zro.url}/api/v1/foto/${FOTO}`)
    assert.equal(j.pessoa.conta, `${zro.url}/perfil`)
  })

  test('mudou na conta Absolute ZRO: muda no Synquei na próxima abertura, sem fazer nada', async () => {
    const r = await fluxo({ pessoa: { ...LIA, foto: FOTO } })
    Object.assign(zro.contas.get(LIA.sub), { nome: 'Lia Nova', email: 'lia@nova.com', foto: FOTO_NOVA, produtos: ['synquei'] })
    // recarregar logo em seguida não pergunta de novo (no máximo uma vez por minuto)
    let j = await (await abrirApp(r)).json()
    assert.equal(j.pessoa.nome, 'Lia Produtora')
    assert.equal(zro.estado.userinfos, 0)
    passar(61)
    const res = guardar(r, await abrirApp(r))
    j = await res.json()
    assert.equal(zro.estado.userinfos, 1, 'releu em /oauth/userinfo')
    assert.equal(zro.estado.renovacoes, 0, 'o access token ainda valia: sem refresh')
    assert.equal(j.pessoa.nome, 'Lia Nova')
    assert.equal(j.pessoa.email, 'lia@nova.com')
    assert.equal(j.pessoa.foto, `${zro.url}/api/v1/foto/${FOTO_NOVA}`)
    assert.deepEqual(j.pessoa.produtos, ['synquei'], 'organização e produtos também se atualizam')
    // a cópia nova ficou na sessão: sem a Absolute ZRO, segue a nova
    zro.estado.fora = true
    j = await (await abrirApp(r)).json()
    assert.equal(j.pessoa.nome, 'Lia Nova')
    // tirou a foto: volta às iniciais
    zro.estado.fora = false
    zro.contas.get(LIA.sub).foto = null
    passar(61)
    j = await guardar(r, await abrirApp(r)).json()
    assert.equal(j.pessoa.foto, null)
  })

  test('access token vencido: troca o refresh token (que roda) e relê', async () => {
    zro.estado.atTtl = 10
    const r = await fluxo({ pessoa: { ...LIA } })
    const hubAntes = r.hub
    zro.contas.get(LIA.sub).nome = 'Lia Renovada'
    passar(61)
    const j = await guardar(r, await abrirApp(r)).json()
    assert.equal(zro.estado.renovacoes, 1)
    assert.equal(j.pessoa.nome, 'Lia Renovada')
    assert.notEqual(r.hub, hubAntes, 'o cofre guarda o refresh token novo')
    passar(61)
    assert.equal((await guardar(r, await abrirApp(r))).status, 200)
    assert.equal(zro.estado.renovacoes, 2, 'o token novo serve para a próxima troca')
  })

  test('Absolute ZRO fora do ar: vale a última cópia e nada muda', async () => {
    const r = await fluxo({ pessoa: { ...LIA, foto: FOTO } })
    zro.estado.fora = true
    passar(61)
    const res = await abrirApp(r)
    assert.equal(res.status, 200)
    assert.deepEqual(res.headers.getSetCookie(), [])
    assert.equal((await res.json()).pessoa.foto, `${zro.url}/api/v1/foto/${FOTO}`)
  })

  test('acesso do app removido na Absolute ZRO: a sessão acaba', async () => {
    zro.estado.atTtl = 10
    const r = await fluxo({ pessoa: { ...LIA } })
    zro.removerAcesso(LIA.sub)
    passar(61)
    const res = await abrirApp(r)
    assert.equal(res.status, 401)
    const c = cookiesDe(res)
    assert.equal(c.get('sq_conta'), '')
    assert.equal(c.get('sq_hub'), '')
  })

  test('sessão antiga (sem cofre) continua valendo com a cópia do login', async () => {
    const r = await fluxo({ pessoa: { ...LIA } })
    passar(61)
    const res = await pedir('/api/zro/eu', { cookies: { sq_conta: r.conta } })
    assert.equal(res.status, 200)
    assert.equal(zro.estado.userinfos, 0)
  })

  test('cofre de outra pessoa ou adulterado é ignorado', async () => {
    const a = await fluxo({ pessoa: { ...LIA } })
    const b = await fluxo({ pessoa: { ...LIA, sub: 'zro-999', nome: 'Outra' } })
    passar(61)
    const j = await (await pedir('/api/zro/eu', { cookies: { sq_conta: a.conta, sq_hub: b.hub } })).json()
    assert.equal(j.pessoa.nome, 'Lia Produtora')
    const x = await pedir('/api/zro/eu', { cookies: { sq_conta: a.conta, sq_hub: `${a.hub.slice(0, -4)}AAAA` } })
    assert.equal(x.status, 200)
    assert.equal(zro.estado.userinfos, 0)
  })

  test('foto ou conta fora da Absolute ZRO não passam', async () => {
    const { perfilDeClaims } = await import('../api/_zro.js')
    const p = perfilDeClaims({ sub: 's', email: 'a@b.c', picture: 'https://mal.exemplo/x.png', zro_conta: 'javascript:alert(1)' })
    assert.equal(p.foto, null)
    assert.equal(p.conta, `${zro.url}/perfil`)
    assert.equal(perfilDeClaims({ sub: 's', email: 'a@b.c', picture: `${zro.url}/api/v1/foto/x" onerror="y` }).foto, null)
  })

  test('sair revoga o refresh token na Absolute ZRO e apaga o cofre', async () => {
    const r = await fluxo({ pessoa: { ...LIA } })
    const res = await pedir('/api/zro/sair', { method: 'POST', headers: { origin: SITE }, cookies: { sq_conta: r.conta, sq_hub: r.hub } })
    assert.equal(res.status, 200)
    assert.equal(zro.estado.revogados, 1)
    assert.equal(cookiesDe(res).get('sq_hub'), '')
  })
})
