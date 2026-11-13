// "Entrar com Absolute ZRO" de ponta a ponta contra a Absolute ZRO falsa (test/zro-falso.js): entrar → callback → eu →
// sair, com o gate de lançamento pela claim zro_release.foto (allowed ou released). Confere também o que NÃO pode
// passar: state trocado, id_token ruim, cookie adulterado, host errado, acesso tirado no HUB.

import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { NOME } from '../app/nome.js'
import { ESCOPOS_ESPERADOS, ESCOPOS_SEM_SET, iniciarZroFalsa } from './zro-falso.js'

const CLIENTE = { clientId: 'foto-web', clientSecret: 'segredo-de-teste-da-foto' }
const LIA = { sub: 'zro-511', email: 'Lia@Produtora.com', nome: 'Lia Fotógrafa', org: 'Estúdio Lia', produtos: [], foto: '3f2c1a9e-aaaa-4bbb-8ccc-1234567890ab', release: { foto: 'allowed', maestro: 'released' } }
const RUI = { sub: 'zro-777', email: 'rui@exemplo.com', nome: 'Rui', release: { maestro: 'released', radio: 'released' } }
const NEUTRA = readFileSync(new URL('../app/indisponivel.html', import.meta.url), 'utf8')
let zro, app, SITE, z
const rotas = {}

before(async () => {
  zro = await iniciarZroFalsa(CLIENTE)
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret })
  delete process.env.FOTO_SITE
  delete process.env.FOTO_LOCAL
  z = await import('../api/_zro.js')
  for (const r of ['entrar', 'callback', 'eu', 'sair', 'set']) rotas[r] = (await import(`../api/zro/${r}.js`)).default
  rotas.pagina = (await import('../api/pagina.js')).default
  rotas.recurso = (await import('../api/recurso.js')).default
  app = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    const r = /^\/api\/zro\/(\w+)/.exec(u.pathname)
    if (r && rotas[r[1]]) return rotas[r[1]](req, res)
    if (u.pathname === '/') return rotas.pagina(req, res)
    if (u.pathname === '/api/recurso') return rotas.recurso(req, res)
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
beforeEach(() => Object.assign(zro.estado, { pessoa: null, negar: false, adulterar: null, semSet: false, recusarSet: false, setPedidos: [], atTtl: 600, fora: false }))

const cookiesDe = (res) => new Map(res.headers.getSetCookie().map((c) => [c.split('=')[0], c.slice(c.indexOf('=') + 1).split(';')[0]]))
const comCookies = (c) =>
  Object.entries(c)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
const pedir = (caminho, { cookies = {}, ...init } = {}) => fetch(new URL(caminho, SITE), { redirect: 'manual', ...init, headers: { cookie: comCookies(cookies), ...(init.headers || {}) } })

/** O fluxo inteiro: /entrar → Absolute ZRO → /callback. Devolve a resposta do callback e os cookies da sessão. */
async function entrar(pessoa, volta = '/') {
  zro.estado.pessoa = pessoa
  let ida = await pedir(`/api/zro/entrar?volta=${encodeURIComponent(volta)}`)
  for (let i = 0; i < 3; i++) {
    const naZro = await fetch(new URL(ida.headers.get('location')), { redirect: 'manual' })
    const callback = await pedir(naZro.headers.get('location').replace(SITE, ''), { cookies: { foto_zro: cookiesDe(ida).get('foto_zro') } })
    const c = cookiesDe(callback)
    if (c.get('foto_conta') || !/sem_set=1/.test(callback.headers.get('location'))) return { ida, callback, cookies: { foto_conta: c.get('foto_conta'), foto_hub: c.get('foto_hub') } }
    ida = await pedir(callback.headers.get('location'))
  }
  throw new Error('não entrou')
}
/** A sessão com a última leitura do perfil no passado: o próximo /eu pergunta de novo à Absolute ZRO. */
const envelhecer = (conta, segundos = 120) => {
  const d = z.abrir(z.COOKIE_CONTA, conta)
  return z.selar(z.COOKIE_CONTA, { ...d, exp: undefined, lido: d.lido - segundos }, 3600)
}

test('nomes do app: cliente foto-web, cookies foto_*, endereço oficial e escopos', () => {
  assert.equal(z.PRODUTO, 'foto')
  assert.deepEqual([z.COOKIE_IDA, z.COOKIE_CONTA, z.COOKIE_HUB], ['foto_zro', 'foto_conta', 'foto_hub'])
  assert.equal(z.SITE_PADRAO, 'https://foto.absolutezro.com')
  assert.equal(z.site(), 'https://foto.absolutezro.com')
  assert.equal(z.retorno(z.site()), 'https://foto.absolutezro.com/api/zro/callback')
  assert.equal(z.ESCOPOS, ESCOPOS_ESPERADOS)
  assert.equal(z.clientId(), 'foto-web')
  // o gate: só a claim do próprio app
  assert.equal(z.temAcesso(['foto']), true)
  assert.equal(z.temAcesso(['radio', 'fotos']), false)
  assert.equal(z.temAcesso(null), false)
  assert.equal(z.temAcesso('foto'), false)
  const p = z.perfilDeClaims({ sub: 'a', zro_release: { foto: 'allowed', relay: 'released', 'ai-edit': 'closed', 'X y': 'released', nossom: 'development' } })
  assert.deepEqual(p.apps, ['foto', 'relay'])
  assert.equal(z.perfilDeClaims({ sub: 'a' }).apps, null)
  assert.equal(z.temAcesso(z.perfilDeClaims({ sub: 'a', zro_release: { foto: 'released' } }).apps), true)
  assert.equal(z.temAcesso(z.perfilDeClaims({ sub: 'a', zro_release: { foto: 'closed' } }).apps), false)
  assert.equal(z.temAcesso(z.perfilDeClaims({ sub: 'a', zro_release: { foto: true } }).apps), false)
  // as chaves dos cookies saem do segredo com o sal do app: o selo de outro app (outro sal) não abre aqui
  assert.equal(z.abrir(z.COOKIE_CONTA, z.selar(z.COOKIE_CONTA, { sub: 'a' }, 60)).sub, 'a')
})

test('FOTO_SITE troca o endereço oficial; valor torto cai no padrão', () => {
  const pedido = (host) => ({ headers: { host, 'x-forwarded-proto': 'https' } })
  try {
    process.env.FOTO_SITE = 'https://luz.absolutezro.com/'
    assert.equal(z.site(), 'https://luz.absolutezro.com')
    assert.equal(z.origemPermitida(pedido('luz.absolutezro.com')), 'https://luz.absolutezro.com')
    assert.equal(z.origemPermitida(pedido('foto.absolutezro.com')), 'https://luz.absolutezro.com')
    for (const torto of ['http://luz.absolutezro.com', 'https://luz.absolutezro.com/caminho', 'javascript:alert(1)', 'luz.absolutezro.com', 'https://a b.com', 'https://golpe.com?x=1']) {
      process.env.FOTO_SITE = torto
      assert.equal(z.site(), 'https://foto.absolutezro.com', torto)
    }
  } finally {
    delete process.env.FOTO_SITE
  }
})

test('host errado: o login só acontece no endereço oficial (ou em localhost)', async () => {
  const pedido = (host, proto = 'https') => ({ url: '/api/zro/entrar?volta=%2F%23biblioteca', method: 'GET', headers: { host, 'x-forwarded-proto': proto } })
  const resposta = () => {
    const r = { statusCode: 0, headers: {} }
    r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v)
    r.end = () => {}
    return r
  }
  for (const host of ['foto-abc123.vercel.app', 'golpe.com', 'foto.absolutezro.com.golpe.com', 'localhost.golpe.com', 'absolutezro.com']) {
    assert.equal(z.origemPermitida(pedido(host)), 'https://foto.absolutezro.com', host)
    const r = resposta()
    await rotas.entrar(pedido(host), r)
    assert.equal(r.statusCode, 307, host)
    assert.equal(r.headers.location, 'https://foto.absolutezro.com/api/zro/entrar?volta=%2F%23biblioteca', host)
    // nada de cookie de ida fora do endereço oficial
    assert.equal(r.headers['set-cookie'], undefined, host)
  }
  // o oficial em http (sem TLS) também troca para https
  const semTls = resposta()
  await rotas.entrar(pedido('foto.absolutezro.com', 'http'), semTls)
  assert.equal(semTls.statusCode, 307)
  // no oficial: vai para a Absolute ZRO com a volta cadastrada
  const r = resposta()
  await rotas.entrar(pedido('foto.absolutezro.com'), r)
  assert.equal(r.statusCode, 302)
  const destino = new URL(r.headers.location)
  assert.equal(destino.origin, zro.url)
  assert.equal(destino.searchParams.get('redirect_uri'), 'https://foto.absolutezro.com/api/zro/callback')
  assert.equal(destino.searchParams.get('client_id'), 'foto-web')
  // x-forwarded-host (a Vercel) manda mais que o host
  assert.equal(z.origemPermitida({ headers: { host: 'foto.absolutezro.com', 'x-forwarded-host': 'golpe.com' } }), 'https://foto.absolutezro.com')
  assert.equal(z.origemDoPedido({ headers: { host: 'foto.absolutezro.com', 'x-forwarded-host': 'golpe.com', 'x-forwarded-proto': 'https' } }), 'https://golpe.com')
  // a volta fica sempre dentro do site
  assert.equal(z.voltaSegura('/#biblioteca'), '/#biblioteca')
  for (const ruim of ['https://golpe.com/', '//golpe.com', '/\\golpe.com', 'javascript:alert(1)', '', null, `/${'a'.repeat(600)}`, '/a\nb']) assert.equal(z.voltaSegura(ruim), '/', String(ruim))
})

test('sem ZRO_CLIENT_ID e ZRO_CLIENT_SECRET: login desligado', async () => {
  const { ZRO_CLIENT_ID: id, ZRO_CLIENT_SECRET: segredo } = process.env
  delete process.env.ZRO_CLIENT_ID
  delete process.env.ZRO_CLIENT_SECRET
  try {
    assert.deepEqual(await (await pedir('/api/zro/eu')).json(), { ok: false, configurado: false })
    const r = await pedir('/api/zro/entrar?volta=%2F%23biblioteca')
    assert.equal(r.status, 303)
    assert.equal(r.headers.get('location'), '/?zro=config#biblioteca')
    assert.equal((await pedir('/api/zro/set')).status, 401)
  } finally {
    Object.assign(process.env, { ZRO_CLIENT_ID: id, ZRO_CLIENT_SECRET: segredo })
  }
})

test('login completo com a claim: entrar → callback → eu → a casca → sair', async () => {
  // 1. /entrar: código + PKCE S256, state e nonce; o cookie da ida só vale em /api/zro
  zro.estado.pessoa = LIA
  const ida = await pedir('/api/zro/entrar?volta=%2F%23biblioteca')
  assert.equal(ida.status, 302)
  const destino = new URL(ida.headers.get('location'))
  assert.equal(destino.origin + destino.pathname, `${zro.url}/oauth/authorize`)
  assert.equal(destino.searchParams.get('response_type'), 'code')
  assert.equal(destino.searchParams.get('client_id'), 'foto-web')
  assert.equal(destino.searchParams.get('redirect_uri'), `${SITE}/api/zro/callback`)
  assert.equal(destino.searchParams.get('scope'), ESCOPOS_ESPERADOS)
  assert.equal(destino.searchParams.get('code_challenge_method'), 'S256')
  assert.match(destino.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/)
  assert.match(destino.searchParams.get('state'), /^[A-Za-z0-9_-]{43}$/)
  assert.match(destino.searchParams.get('nonce'), /^[A-Za-z0-9_-]{43}$/)
  const cookieIda = ida.headers.getSetCookie().find((c) => c.startsWith('foto_zro='))
  assert.match(cookieIda, /; Path=\/api\/zro; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/)
  // o verificador PKCE não vai para a Absolute ZRO, só o desafio
  const idaAberta = z.abrir(z.COOKIE_IDA, cookiesDe(ida).get('foto_zro'))
  assert.equal(z.desafioPkce(idaAberta.verificador), destino.searchParams.get('code_challenge'))
  assert.ok(!ida.headers.get('location').includes(idaAberta.verificador))

  // 2. a Absolute ZRO devolve o código; o callback troca e cria a sessão
  const trocas = zro.estado.trocas
  const naZro = await fetch(destino, { redirect: 'manual' })
  const callback = await pedir(naZro.headers.get('location').replace(SITE, ''), { cookies: { foto_zro: cookiesDe(ida).get('foto_zro') } })
  assert.equal(callback.status, 303)
  assert.equal(callback.headers.get('location'), '/?zro=ok#biblioteca')
  assert.equal(zro.estado.trocas, trocas + 1)
  const postos = callback.headers.getSetCookie()
  assert.match(
    postos.find((c) => c.startsWith('foto_zro=')),
    /^foto_zro=; Path=\/api\/zro; Max-Age=0;/,
  )
  assert.match(
    postos.find((c) => c.startsWith('foto_conta=')),
    /; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/,
  )
  assert.match(
    postos.find((c) => c.startsWith('foto_hub=')),
    /; Path=\/api\/zro; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/,
  )
  const cookies = { foto_conta: cookiesDe(callback).get('foto_conta'), foto_hub: cookiesDe(callback).get('foto_hub') }
  // a sessão guarda a cópia do perfil e os apps liberados; nenhum token
  const conta = z.abrir(z.COOKIE_CONTA, cookies.foto_conta)
  assert.equal(conta.sub, LIA.sub)
  assert.equal(conta.email, 'lia@produtora.com')
  assert.deepEqual(conta.apps, ['foto', 'maestro'])
  assert.equal(conta.org.nome, 'Estúdio Lia')
  const legivel = Buffer.from(cookies.foto_conta.split('.')[0], 'base64url').toString('utf8')
  assert.doesNotMatch(legivel, /at_|zt_|access|refresh/)
  // os tokens ficam cifrados: o cookie não abre como texto, só com a chave do app
  assert.doesNotMatch(Buffer.from(cookies.foto_hub, 'base64url').toString('latin1'), /at_[0-9a-f]{8}|zt_/)
  const cofre = z.decifrar(z.COOKIE_HUB, cookies.foto_hub)
  assert.equal(cofre.sub, LIA.sub)
  assert.match(cofre.at, /^at_/)
  assert.match(cofre.rt, /^zt_/)
  // o código é de uso único: repetir o callback não entra de novo
  const repetido = await pedir(naZro.headers.get('location').replace(SITE, ''), { cookies: { foto_zro: cookiesDe(ida).get('foto_zro') } })
  assert.equal(repetido.headers.get('location'), '/?zro=erro#biblioteca')
  assert.equal(cookiesDe(repetido).get('foto_conta'), undefined)

  // 3. /eu: a pessoa e o acesso; nada de sub nem de token na resposta
  const eu = await pedir('/api/zro/eu', { cookies })
  assert.equal(eu.headers.get('cache-control'), 'no-store')
  const corpo = await eu.json()
  assert.equal(corpo.ok, true)
  assert.equal(corpo.acesso, true)
  assert.equal(corpo.pessoa.nome, 'Lia Fotógrafa')
  assert.equal(corpo.pessoa.email, 'lia@produtora.com')
  assert.equal(corpo.pessoa.foto, `${zro.url}/api/v1/foto/${LIA.foto}`)
  assert.equal(corpo.pessoa.conta, `${zro.url}/perfil`)
  assert.deepEqual(corpo.pessoa.organizacao, { nome: 'Estúdio Lia', papel: 'owner' })
  assert.match(corpo.pessoa.id, /^[0-9a-f]{24}$/)
  assert.ok(!JSON.stringify(corpo).includes(LIA.sub))
  assert.equal((await pedir('/api/zro/eu', { cookies, method: 'POST' })).status, 405)

  // 4. a casca e os arquivos do app saem para esta sessão
  const casca = await (await pedir('/', { cookies })).text()
  assert.ok(casca.includes(`<title>${NOME}</title>`))
  assert.equal((await pedir('/api/recurso?pasta=app&f=principal.js', { cookies })).status, 200)

  // 5. sair: só POST e só do próprio site; apaga os dois cookies e revoga o refresh token na Absolute ZRO
  assert.equal((await pedir('/api/zro/sair', { cookies })).status, 405)
  assert.equal((await pedir('/api/zro/sair', { cookies, method: 'POST', headers: { origin: 'https://outro.site' } })).status, 403)
  const revogados = zro.estado.revogados
  const sair = await pedir('/api/zro/sair', { cookies, method: 'POST', headers: { origin: SITE } })
  assert.equal(sair.status, 200)
  assert.deepEqual(await sair.json(), { ok: true })
  assert.equal(zro.estado.revogados, revogados + 1)
  const apagados = sair.headers.getSetCookie()
  assert.ok(apagados.some((c) => /^foto_conta=; Path=\/; Max-Age=0;/.test(c)))
  assert.ok(apagados.some((c) => /^foto_hub=; Path=\/api\/zro; Max-Age=0;/.test(c)))
  // sem os cookies, fechado de novo
  assert.deepEqual(await (await pedir('/api/zro/eu')).json(), { ok: false, configurado: true, entrar: '/api/zro/entrar' })
  assert.equal(await (await pedir('/')).text(), NEUTRA)
})

test('conta sem a claim do app: entra na conta, mas o app continua fechado', async () => {
  const { callback, cookies } = await entrar(RUI)
  assert.equal(callback.headers.get('location'), '/?zro=ok')
  assert.ok(cookies.foto_conta)
  const eu = await (await pedir('/api/zro/eu', { cookies })).json()
  assert.equal(eu.ok, true)
  assert.equal(eu.acesso, false)
  assert.equal(await (await pedir('/', { cookies })).text(), NEUTRA)
  const r = await pedir('/api/recurso?pasta=app&f=principal.js', { cookies })
  assert.equal(r.status, 404)
  assert.equal(await r.text(), NEUTRA)
  // released (o dia em que o titular lançar) passa, como allowed
  const aberto = await entrar({ ...RUI, sub: 'zro-778', release: { foto: 'released' } })
  assert.equal((await (await pedir('/api/zro/eu', { cookies: aberto.cookies })).json()).acesso, true)
  assert.ok((await (await pedir('/', { cookies: aberto.cookies })).text()).includes(`<title>${NOME}</title>`))
  // sem claim nenhuma (Absolute ZRO antiga) ou com valor desconhecido: fechado
  for (const release of [undefined, { foto: 'development' }, { foto: 'closed' }, { Foto: 'allowed' }]) {
    const s = await entrar({ ...RUI, sub: `zro-${Math.random().toString(16).slice(2, 8)}`, release })
    assert.equal((await (await pedir('/api/zro/eu', { cookies: s.cookies })).json()).acesso, false, JSON.stringify(release))
    assert.equal(await (await pedir('/', { cookies: s.cookies })).text(), NEUTRA)
  }
})

test('o acesso acompanha o HUB: tirado lá, fecha aqui na próxima leitura do perfil', async () => {
  const { cookies } = await entrar({ ...LIA, sub: 'zro-600' })
  // dentro de um minuto o /eu não pergunta de novo (recarregar a página não martela o HUB)
  const antes = zro.estado.userinfos
  assert.equal((await (await pedir('/api/zro/eu', { cookies })).json()).acesso, true)
  assert.equal(zro.estado.userinfos, antes)
  // o titular tira a pessoa da lista de acesso; a leitura seguinte (sessão com mais de um minuto) traz a claim nova
  zro.contas.get('zro-600').release = { maestro: 'released' }
  zro.contas.get('zro-600').nome = 'Lia Nova'
  const velha = { ...cookies, foto_conta: envelhecer(cookies.foto_conta) }
  const eu = await pedir('/api/zro/eu', { cookies: velha })
  const corpo = await eu.json()
  assert.equal(zro.estado.userinfos, antes + 1)
  assert.equal(corpo.acesso, false)
  assert.equal(corpo.pessoa.nome, 'Lia Nova')
  const novos = { foto_conta: cookiesDe(eu).get('foto_conta'), foto_hub: cookiesDe(eu).get('foto_hub') ?? cookies.foto_hub }
  assert.ok(novos.foto_conta)
  assert.equal(await (await pedir('/', { cookies: novos })).text(), NEUTRA)
  assert.equal((await pedir('/api/recurso?pasta=app&f=principal.js', { cookies: novos })).status, 404)
  // e volta quando o HUB libera de novo
  zro.contas.get('zro-600').release = { foto: 'allowed' }
  const eu2 = await pedir('/api/zro/eu', { cookies: { ...novos, foto_conta: envelhecer(novos.foto_conta) } })
  assert.equal((await eu2.json()).acesso, true)
})

test('acesso removido no Perfil da Absolute ZRO: a sessão acaba; HUB fora do ar: vale a última cópia', async () => {
  const { cookies } = await entrar({ ...LIA, sub: 'zro-601' })
  // HUB fora: segue com o que tinha (sem derrubar ninguém)
  zro.estado.fora = true
  const fora = await pedir('/api/zro/eu', { cookies: { ...cookies, foto_conta: envelhecer(cookies.foto_conta) } })
  assert.equal((await fora.json()).acesso, true)
  assert.equal(cookiesDe(fora).get('foto_conta'), undefined)
  zro.estado.fora = false
  // "Apps com acesso › Remover": o refresh token morre; com o access token vencido, a renovação é recusada
  zro.removerAcesso('zro-601')
  const eu = await pedir('/api/zro/eu', { cookies: { ...cookies, foto_conta: envelhecer(cookies.foto_conta) } })
  assert.deepEqual(await eu.json(), { ok: false, configurado: true, entrar: '/api/zro/entrar' })
  const apagados = eu.headers.getSetCookie()
  assert.ok(apagados.some((c) => /^foto_conta=; Path=\/; Max-Age=0;/.test(c)))
  assert.ok(apagados.some((c) => /^foto_hub=; Path=\/api\/zro; Max-Age=0;/.test(c)))
})

test('access token vencido: o /eu renova pelo refresh token, que roda', async () => {
  const { cookies } = await entrar({ ...LIA, sub: 'zro-602' })
  const antes = z.decifrar(z.COOKIE_HUB, cookies.foto_hub)
  zro.vencer()
  const renovacoes = zro.estado.renovacoes
  const eu = await pedir('/api/zro/eu', { cookies: { ...cookies, foto_conta: envelhecer(cookies.foto_conta) } })
  assert.equal((await eu.json()).acesso, true)
  assert.equal(zro.estado.renovacoes, renovacoes + 1)
  const depois = z.decifrar(z.COOKIE_HUB, cookiesDe(eu).get('foto_hub'))
  assert.notEqual(depois.rt, antes.rt)
  assert.notEqual(depois.at, antes.at)
})

test('cookie adulterado, de outro segredo ou de outra pessoa: sem sessão', async () => {
  const { cookies } = await entrar({ ...LIA, sub: 'zro-603' })
  const [corpo, ass] = cookies.foto_conta.split('.')
  const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'))
  const semSessao = { ok: false, configurado: true, entrar: '/api/zro/entrar' }
  const ruins = {
    // quem não tem a claim tenta se dar o acesso
    'apps trocados': `${Buffer.from(JSON.stringify({ ...dados, apps: ['foto', 'radio'] })).toString('base64url')}.${ass}`,
    'sub trocado': `${Buffer.from(JSON.stringify({ ...dados, sub: 'zro-admin' })).toString('base64url')}.${ass}`,
    'validade esticada': `${Buffer.from(JSON.stringify({ ...dados, exp: dados.exp + 999999 })).toString('base64url')}.${ass}`,
    'assinatura cortada': `${corpo}.${ass.slice(0, -2)}`,
    'sem assinatura': corpo,
    'três partes': `${corpo}.${ass}.x`,
    'assinado sem chave': `${corpo}.${Buffer.from('nada').toString('base64url')}`,
    'grande demais': `${'a'.repeat(5000)}.${ass}`,
  }
  for (const [nome, valor] of Object.entries(ruins)) {
    assert.deepEqual(await (await pedir('/api/zro/eu', { cookies: { ...cookies, foto_conta: valor } })).json(), semSessao, nome)
    assert.equal(await (await pedir('/', { cookies: { ...cookies, foto_conta: valor } })).text(), NEUTRA, nome)
    assert.equal((await pedir('/api/recurso?pasta=app&f=principal.js', { cookies: { foto_conta: valor } })).status, 404, nome)
  }
  // assinado com outro segredo (outro app, outro ambiente): não abre
  const segredo = process.env.ZRO_CLIENT_SECRET
  process.env.ZRO_CLIENT_SECRET = 'outro-segredo-qualquer'
  const deOutro = z.selar(z.COOKIE_CONTA, { ...dados, exp: undefined }, 3600)
  process.env.ZRO_CLIENT_SECRET = segredo
  assert.deepEqual(await (await pedir('/api/zro/eu', { cookies: { foto_conta: deOutro } })).json(), semSessao)
  assert.equal(await (await pedir('/', { cookies: { foto_conta: deOutro } })).text(), NEUTRA)
  // cofre de outra pessoa junto da sessão desta: o perfil não é relido com token alheio
  const outra = await entrar({ ...RUI, sub: 'zro-604', release: { foto: 'allowed' } })
  const antes = zro.estado.userinfos
  const misto = await pedir('/api/zro/eu', { cookies: { foto_conta: envelhecer(cookies.foto_conta), foto_hub: outra.cookies.foto_hub } })
  assert.equal((await misto.json()).pessoa.nome, 'Lia Fotógrafa')
  assert.equal(zro.estado.userinfos, antes)
  // cofre adulterado não abre (AES-GCM confere a integridade)
  const hub = cookies.foto_hub
  assert.equal(z.decifrar(z.COOKIE_HUB, `${hub.slice(0, 40)}${hub[40] === 'A' ? 'B' : 'A'}${hub.slice(41)}`), null)
  assert.equal(z.decifrar(z.COOKIE_HUB, 'lixo'), null)
  // a sessão boa continua valendo depois de tudo isso
  assert.equal((await (await pedir('/api/zro/eu', { cookies })).json()).acesso, true)
})

test('callback: state trocado, ida de outro navegador, recusa e id_token ruim não criam sessão', async () => {
  zro.estado.pessoa = { ...LIA, sub: 'zro-605' }
  const ida = await pedir('/api/zro/entrar?volta=%2F')
  const naZro = await fetch(new URL(ida.headers.get('location')), { redirect: 'manual' })
  const volta = new URL(naZro.headers.get('location'))
  const cookieIda = cookiesDe(ida).get('foto_zro')
  const semSessao = (r, destino) => {
    assert.equal(r.status, 303)
    assert.equal(r.headers.get('location'), destino)
    assert.equal(cookiesDe(r).get('foto_conta'), undefined)
    assert.equal(cookiesDe(r).get('foto_hub'), undefined)
  }
  // sem o cookie da ida (outro navegador, link colado): expirou
  semSessao(await pedir(volta.pathname + volta.search), '/?zro=expirou')
  // state que não é o da ida (CSRF de login)
  const trocado = new URL(volta)
  trocado.searchParams.set('state', 'x'.repeat(43))
  semSessao(await pedir(trocado.pathname + trocado.search, { cookies: { foto_zro: cookieIda } }), '/?zro=expirou')
  // resposta dizendo que veio de outro emissor (RFC 9207)
  const outroEmissor = new URL(volta)
  outroEmissor.searchParams.set('iss', 'https://outro.exemplo')
  semSessao(await pedir(outroEmissor.pathname + outroEmissor.search, { cookies: { foto_zro: cookieIda } }), '/?zro=erro')
  // cookie da ida adulterado
  semSessao(await pedir(volta.pathname + volta.search, { cookies: { foto_zro: `${cookieIda.slice(0, -2)}xx` } }), '/?zro=expirou')
  // a pessoa recusou na Absolute ZRO
  zro.estado.negar = true
  const recusa = await entrar({ ...LIA, sub: 'zro-606' })
  semSessao(recusa.callback, '/?zro=recusado')
  zro.estado.negar = false
  // id_token ruim: assinatura de outra chave, outro público, outro emissor, vencido, nonce de outro pedido
  const trocas = zro.estado.trocas
  for (const defeito of ['assinatura', 'aud', 'emissor', 'expirado', 'nonce']) {
    zro.estado.adulterar = defeito
    const r = await entrar({ ...LIA, sub: `zro-ruim-${defeito}` })
    semSessao(r.callback, '/?zro=erro')
  }
  assert.equal(zro.estado.trocas, trocas + 5)
  zro.estado.adulterar = null
  // e o login bom continua funcionando depois
  assert.ok((await entrar({ ...LIA, sub: 'zro-607' })).cookies.foto_conta)
})

test('Absolute ZRO de antes do Set (invalid_scope): entra sem zro.set; o repasse do Set pede sessão', async () => {
  zro.estado.recusarSet = true
  const { cookies } = await entrar({ ...LIA, sub: 'zro-608' })
  assert.ok(cookies.foto_conta)
  assert.equal(zro.estado.escopos, ESCOPOS_SEM_SET)
  zro.estado.recusarSet = false
  assert.equal((await pedir('/api/zro/set')).status, 401)
  assert.equal(zro.estado.setPedidos.length, 0)
  const r = await pedir('/api/zro/set', { cookies })
  assert.equal(r.status, 200)
  assert.match(zro.estado.setPedidos.at(-1).auth, /^Bearer at_/)
  assert.equal(zro.estado.setPedidos.at(-1).cookie, null)
  assert.equal((await pedir('/api/zro/set/../../oauth/token', { cookies })).status, 404)
})
