// Entrar com o Google pelo navegador do sistema (ADR 0041): a janela nunca abre accounts.google.com (o Google recusa OAuth
// em janela embutida, disallowed_useragent). A lógica compartilhada está em desktop/login-externo.cjs (cópia idêntica à de
// apps/hub-desktop, que tem a bateria completa); aqui fica o que depende deste app: o esquema e as regras.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const r = require('../desktop/regras.cjs')
const le = require('../desktop/login-externo.cjs')
const O = r.origens({ empacotado: true })
const HUB = O.hub
const ESQUEMA = r.ESQUEMA
const CODIGO = 'zd_' + 'A'.repeat(43)

test('o Google não fica na janela: vai para fora, e quem decide abrir o HUB no navegador é o login externo', () => {
  assert.equal(r.destino('https://accounts.google.com/o/oauth2/v2/auth?client_id=x', O), 'fora')
  assert.equal(r.podeNavegar('https://accounts.google.com/signin/v2/challenge', O), false)
  assert.equal(le.ehEntradaGoogle('https://accounts.google.com/o/oauth2/v2/auth', HUB), true)
  assert.equal(le.ehEntradaGoogle(`${HUB}/entrar/google?next=%2Foauth%2Fauthorize`, HUB), true)
  assert.equal(le.ehEntradaGoogle(`${HUB}/entrar`, HUB), false) // e-mail e senha continuam na janela
  assert.equal(r.destino(`${HUB}/entrar`, O), 'app')
})

test(`o retorno ${ESQUEMA}://entrar-app não vira página do app`, () => {
  const link = `${ESQUEMA}://entrar-app?code=${CODIGO}&state=${'s'.repeat(32)}`
  assert.equal(r.deepLink(link, O), null)
  assert.equal(r.deepLinkDosArgs(['app', link], O), null)
  assert.deepEqual(le.lerRetorno(link, ESQUEMA), { code: CODIGO, state: 's'.repeat(32) })
  assert.equal(le.retornoDosArgs(['app', link], ESQUEMA), link)
})

test('fluxo: abre o HUB no navegador, confere o state e troca o código com o verifier (uso único)', async () => {
  const aberto = []
  const chamadas = []
  const carregado = []
  const l = le.criarLoginExterno({
    hub: HUB,
    esquema: ESQUEMA,
    inicio: 'https://app.exemplo/inicio',
    ultimaUrl: () => `${HUB}/entrar?next=%2Foauth%2Fauthorize%3Fclient_id%3Dx`,
    abrirNoNavegador: (u) => aberto.push(u),
    fetch: async (url, init) => {
      chamadas.push({ url, init })
      return { ok: true, status: 200, json: async () => ({ ok: true, next: '/oauth/authorize?client_id=x' }) }
    },
    carregar: (u) => carregado.push(u),
  })
  const p = l.iniciar('https://accounts.google.com/o/oauth2/v2/auth')
  assert.ok(aberto[0].startsWith(`${HUB}/entrar/app?`))
  assert.equal(new URL(aberto[0]).searchParams.get('app'), ESQUEMA)
  assert.equal(await l.tratarLink(`${ESQUEMA}://entrar-app?code=${CODIGO}&state=${'x'.repeat(32)}`), 'invalido') // state errado
  assert.equal(chamadas.length, 0)
  const volta = `${ESQUEMA}://entrar-app?code=${CODIGO}&state=${p.state}`
  assert.equal(await l.tratarLink(volta), 'entrou')
  assert.equal(chamadas[0].url, `${HUB}/entrar/app/trocar`)
  assert.equal(JSON.parse(chamadas[0].init.body).verifier, p.verifier)
  assert.deepEqual(carregado, [`${HUB}/oauth/authorize?client_id=x`])
  assert.equal(await l.tratarLink(volta), 'invalido') // segundo uso
  assert.equal(chamadas.length, 1)
})
