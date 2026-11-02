import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const le = require('../desktop/login-externo.cjs')
const HUB = 'https://absolutezro.com'
const CODIGO = 'zd_' + 'A'.repeat(43)

test('o que abriria o login do Google sai da janela; o resto do HUB, não', () => {
  for (const url of [
    'https://accounts.google.com/o/oauth2/v2/auth?client_id=x',
    'https://accounts.google.com/',
    `${HUB}/entrar/google`,
    `${HUB}/entrar/google?next=%2Foauth%2Fauthorize`,
    `${HUB}/entrar/google/`,
  ])
    assert.equal(le.ehEntradaGoogle(url, HUB), true, url)
  for (const url of [
    `${HUB}/entrar`,
    `${HUB}/entrar/google/retorno?code=x`,
    `${HUB}/oauth/authorize?client_id=relay`,
    `${HUB}/app`,
    'https://accounts.google.com.evil.com/',
    'https://accounts.google.com:444/',
    'http://accounts.google.com/',
    'https://evil.com/entrar/google',
    'lixo',
  ])
    assert.equal(le.ehEntradaGoogle(url, HUB), false, url)
})

test('pedido: state e verifier aleatórios, desafio S256, URL de início só com campos conhecidos', () => {
  const p = le.novoPedido({ app: 'relay', next: '/oauth/authorize?client_id=relay', agora: 1000 })
  assert.match(p.state, /^[A-Za-z0-9_-]{32}$/)
  assert.match(p.verifier, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(p.challenge, crypto.createHash('sha256').update(p.verifier).digest('base64url'))
  assert.notEqual(le.novoPedido({ app: 'relay' }).state, p.state)
  const u = new URL(le.urlDeInicio(HUB, p))
  assert.equal(u.origin + u.pathname, `${HUB}/entrar/app`)
  assert.deepEqual([...u.searchParams.keys()].sort(), ['app', 'challenge', 'next', 'state'])
  assert.equal(u.searchParams.get('next'), '/oauth/authorize?client_id=relay')
  assert.ok(!le.urlDeInicio(HUB, p).includes(p.verifier), 'o verifier nunca sai do app')
})

test('next: só caminho do HUB (open redirect)', () => {
  for (const ruim of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '/a\nb', '', null, undefined, '/' + 'a'.repeat(2100)])
    assert.equal(le.caminhoSeguro(ruim), null, String(ruim))
  assert.equal(le.caminhoSeguro('/oauth/authorize?a=1'), '/oauth/authorize?a=1')
  assert.equal(le.novoPedido({ app: 'x', next: '//evil.com' }).next, null)
})

test('de onde a pessoa estava: next do botão, next da tela de entrar ou a última página do HUB', () => {
  const d = (a, b) => le.destinoDepoisDeEntrar(a, b, HUB)
  assert.equal(d(`${HUB}/entrar/google?next=%2Foauth%2Fauthorize%3Fclient_id%3Drelay`, null), '/oauth/authorize?client_id=relay')
  assert.equal(d('https://accounts.google.com/o/oauth2/v2/auth', `${HUB}/entrar?next=%2Fapp`), '/app')
  assert.equal(d('https://accounts.google.com/', `${HUB}/projetos/1?aba=x`), '/projetos/1?aba=x')
  assert.equal(d(`${HUB}/entrar/google?next=%2F%2Fevil.com`, `${HUB}/entrar`), null)
  assert.equal(d('https://accounts.google.com/', 'https://evil.com/projetos'), null)
})

test('retorno: só <esquema>://entrar-app com código e state no formato', () => {
  const ok = `relay://entrar-app?code=${CODIGO}&state=${'s'.repeat(32)}`
  assert.deepEqual(le.lerRetorno(ok, 'relay'), { code: CODIGO, state: 's'.repeat(32) })
  assert.deepEqual(le.lerRetorno(ok.replace('entrar-app', 'entrar-app/'), 'relay')?.code, CODIGO)
  assert.equal(le.lerRetorno(ok, 'maestro'), null)
  for (const ruim of [
    `relay://entrar-app?code=${CODIGO}`,
    `relay://entrar-app?code=zd_curto&state=${'s'.repeat(32)}`,
    `relay://entrar-app?code=${CODIGO}&state=curto`,
    `relay://entrar-app/outro?code=${CODIGO}&state=${'s'.repeat(32)}`,
    `relay://user@entrar-app?code=${CODIGO}&state=${'s'.repeat(32)}`,
    `relay://outro?code=${CODIGO}&state=${'s'.repeat(32)}`,
    `https://entrar-app/?code=${CODIGO}&state=${'s'.repeat(32)}`,
  ])
    assert.equal(le.lerRetorno(ruim, 'relay'), null, ruim)
  assert.equal(le.ehRetorno('relay://entrar-app?lixo', 'relay'), true)
  assert.equal(le.retornoDosArgs(['app.exe', '--x', ok], 'relay'), ok)
  assert.equal(le.retornoDosArgs(['app.exe', 'relay://app/quadro'], 'relay'), null)
})

function montar(extra = {}) {
  const log = { aberto: [], chamadas: [], carregado: [], avisos: [], focou: 0 }
  let t = 1_000_000
  const dep = {
    hub: HUB,
    esquema: 'relay',
    inicio: 'https://relay.absolutezro.com/app',
    ultimaUrl: () => `${HUB}/entrar?next=%2Fapp`,
    abrirNoNavegador: (u) => log.aberto.push(u),
    fetch: async (url, init) => {
      log.chamadas.push({ url, init })
      return { ok: true, status: 200, json: async () => ({ ok: true, next: '/oauth/authorize?client_id=relay' }) }
    },
    carregar: (u) => log.carregado.push(u),
    focar: () => log.focou++,
    avisar: (m) => log.avisos.push(m),
    agora: () => t,
    ...extra,
  }
  return { l: le.criarLoginExterno(dep), log, avancar: (ms) => (t += ms) }
}

const retornoDe = (p, code = CODIGO) => `relay://entrar-app?code=${code}&state=${p.state}`

test('fluxo: abre o HUB no navegador, troca o código com o verifier e carrega o destino na janela', async () => {
  const { l, log } = montar()
  const p = l.iniciar('https://accounts.google.com/o/oauth2/v2/auth')
  assert.equal(log.aberto.length, 1)
  assert.ok(log.aberto[0].startsWith(`${HUB}/entrar/app?`))
  assert.equal(await l.tratarLink(retornoDe(p)), 'entrou')
  const [c] = log.chamadas
  assert.equal(c.url, `${HUB}/entrar/app/trocar`)
  assert.equal(c.init.method, 'POST')
  assert.equal(c.init.credentials, 'include')
  assert.deepEqual(JSON.parse(c.init.body), { app: 'relay', code: CODIGO, state: p.state, verifier: p.verifier })
  assert.deepEqual(log.carregado, [`${HUB}/oauth/authorize?client_id=relay`])
  assert.equal(log.focou, 1)
  // uso único: o mesmo link de novo não troca nada
  assert.equal(await l.tratarLink(retornoDe(p)), 'invalido')
  assert.equal(log.chamadas.length, 1)
})

test('state errado, sem pedido ou pedido velho: nada é trocado', async () => {
  const { l, log, avancar } = montar()
  assert.equal(await l.tratarLink(retornoDe({ state: 'x'.repeat(32) })), 'invalido') // sem pedido
  const p = l.iniciar(`${HUB}/entrar/google`)
  assert.equal(await l.tratarLink(retornoDe({ state: 'x'.repeat(32) })), 'invalido')
  assert.ok(l.pedidoAtual(), 'state errado não cancela o pedido de verdade')
  avancar(le.VALIDADE_DO_PEDIDO_MS + 1)
  assert.equal(await l.tratarLink(retornoDe(p)), 'invalido')
  assert.equal(l.pedidoAtual(), null)
  assert.equal(log.chamadas.length, 0)
})

test('link que não é do login passa direto; link do login mal formado é descartado', async () => {
  const { l } = montar()
  assert.equal(await l.tratarLink('relay://app/quadro'), 'ignorado')
  assert.equal(await l.tratarLink('relay://entrar-app?code=lixo&state=lixo'), 'invalido')
})

test('troca recusada pelo HUB: avisa e não carrega nada', async () => {
  const { l, log } = montar({ fetch: async () => ({ ok: false, status: 401, json: async () => ({ error: 'unauthenticated' }) }) })
  const p = l.iniciar(`${HUB}/entrar/google`)
  assert.equal(await l.tratarLink(retornoDe(p)), 'falhou')
  assert.equal(log.carregado.length, 0)
  assert.equal(log.avisos.length, 1)
})

test('destino devolvido pelo HUB fora do HUB (open redirect): cai no destino guardado pelo app', async () => {
  for (const next of ['//evil.com/x', 'https://evil.com', '/\\evil.com']) {
    const { l, log } = montar({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, next }) }) })
    const p = l.iniciar('https://accounts.google.com/')
    assert.equal(await l.tratarLink(retornoDe(p)), 'entrou')
    assert.equal(log.carregado[0], `${HUB}/app`, next) // cai no destino que o app guardou (o next da tela de entrar)
    assert.ok(!log.carregado[0].includes('evil.com'), next)
  }
})
