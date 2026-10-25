// /baixar/* (api/baixar.js) com um GitHub falso: escolhe o instalador conferido pelo versao.json, respeita ?build=N
// e cai em /#baixar quando ainda não há instalador.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const ASSETS = [
  { id: 1, name: 'Synquei-1.0.0-b7-mac-universal.dmg', url: 'https://api/a/1', browser_download_url: 'https://gh/b7.dmg' },
  { id: 2, name: 'Synquei-1.0.0-b8-mac-universal.dmg', url: 'https://api/a/2', browser_download_url: 'https://gh/b8.dmg' },
  { id: 3, name: 'Synquei-1.0.0-b8-windows-setup.exe', url: 'https://api/a/3', browser_download_url: 'https://gh/b8.exe' },
  { id: 4, name: 'versao.json', url: 'https://api/a/4', browser_download_url: 'https://gh/versao.json' },
]
const VERSAO = { build: 8, versao: '1.0.0', arquivoMac: 'Synquei-1.0.0-b8-mac-universal.dmg', sha256Mac: 'a'.repeat(64), arquivoWindows: 'Synquei-1.0.0-b8-windows-setup.exe', sha256Windows: 'b'.repeat(64) }

function fakeRes() {
  const r = { code: 200, headers: {}, body: null, loc: null }
  r.status = (c) => ((r.code = c), r)
  r.setHeader = (k, v) => (r.headers[k] = v)
  r.json = (b) => ((r.body = b), r)
  r.send = (b) => ((r.body = b), r)
  r.redirect = (c, l) => ((r.code = c), (r.loc = l), r)
  return r
}

async function load(assets) {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/releases/tags/')) return new Response(JSON.stringify({ assets }), { status: 200 })
    if (String(url).endsWith('versao.json')) return new Response(JSON.stringify(VERSAO), { status: 200 })
    return new Response('?', { status: 404 })
  }
  delete process.env.GITHUB_TOKEN
  return (await import(`../api/baixar.js?${Math.random()}`)).default
}

test('mac sem build vai para o instalador do versao.json', async () => {
  const h = await load(ASSETS)
  const res = fakeRes()
  await h({ query: { p: 'mac' } }, res)
  assert.equal(res.code, 302)
  assert.equal(res.loc, 'https://gh/b8.dmg')
})

test('?build=7 entrega exatamente o build 7; build que sumiu dá 404', async () => {
  const h = await load(ASSETS)
  const r1 = fakeRes()
  await h({ query: { p: 'mac', build: '7' } }, r1)
  assert.equal(r1.loc, 'https://gh/b7.dmg')
  const r2 = fakeRes()
  await h({ query: { p: 'windows', build: '3' } }, r2)
  assert.equal(r2.code, 404)
})

test('versao devolve os SHA-256', async () => {
  const h = await load(ASSETS)
  const res = fakeRes()
  await h({ query: { p: 'versao' } }, res)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.build, 8)
  assert.equal(res.body.sha256Windows, 'b'.repeat(64))
})

test('sem instalador ainda: volta para a seção Baixar do site', async () => {
  const h = await load([])
  const res = fakeRes()
  await h({ query: { p: 'windows' } }, res)
  assert.equal(res.loc, '/?baixar=indisponivel#baixar')
})

test('diag diz o motivo sem mostrar o token', async () => {
  const h = await load(ASSETS)
  const ok = fakeRes()
  await h({ query: { p: 'diag' } }, ok)
  assert.equal(ok.body.token, false)
  assert.equal(ok.body.githubRelease, 200)
  assert.equal(ok.body.mac, 2)
  globalThis.fetch = async () => new Response('{}', { status: 401 })
  process.env.GITHUB_TOKEN = 'github_pat_SEGREDO\n'
  const ruim = fakeRes()
  await h({ query: { p: 'diag' } }, ruim)
  assert.equal(ruim.body.tipoToken, 'fino')
  assert.equal(ruim.body.espacoNasPontas, true)
  assert.match(ruim.body.motivo, /recusado/)
  assert.ok(!JSON.stringify(ruim.body).includes('SEGREDO'))
  delete process.env.GITHUB_TOKEN
})

// Virada para o repositório AbsoluteZRO: o Release novo (synquei-app-desktop) vale quando tem instalador; antes disso,
// o Release antigo (victorbarrosoc-hub/synquei, app-desktop) continua entregando. O download não quebra.
async function loadDuas(novo, antigo) {
  const pedidos = []
  globalThis.fetch = async (url) => {
    const u = String(url)
    pedidos.push(u)
    if (u.includes('/repos/victorbarrosoc-hub/AbsoluteZRO/releases/tags/synquei-app-desktop')) return novo ? new Response(JSON.stringify({ assets: novo }), { status: 200 }) : new Response('{}', { status: 404 })
    if (u.includes('/repos/victorbarrosoc-hub/synquei/releases/tags/app-desktop')) return new Response(JSON.stringify({ assets: antigo }), { status: 200 })
    if (u === 'https://novo/versao.json') return new Response(JSON.stringify({ ...VERSAO, build: 1001, arquivoMac: 'Synquei-1.0.0-b1001-mac-universal.dmg' }), { status: 200 })
    if (u.endsWith('versao.json')) return new Response(JSON.stringify(VERSAO), { status: 200 })
    return new Response('?', { status: 404 })
  }
  delete process.env.GITHUB_TOKEN
  delete process.env.SYNQUEI_REPO
  delete process.env.SYNQUEI_TAG
  return { h: (await import(`../api/baixar.js?${Math.random()}`)).default, pedidos }
}
const NOVO = [
  { id: 11, name: 'Synquei-1.0.0-b1001-mac-universal.dmg', url: 'https://api/a/11', browser_download_url: 'https://novo/b1001.dmg' },
  { id: 12, name: 'versao.json', url: 'https://api/a/12', browser_download_url: 'https://novo/versao.json' },
]

test('sem Release no AbsoluteZRO ainda: entrega o do repositório antigo', async () => {
  const { h } = await loadDuas(null, ASSETS)
  const mac = fakeRes()
  await h({ query: { p: 'mac' } }, mac)
  assert.equal(mac.loc, 'https://gh/b8.dmg')
  const v = fakeRes()
  await h({ query: { p: 'versao' } }, v)
  assert.equal(v.body.build, 8)
})

test('com Release no AbsoluteZRO: ele vale; build antigo pedido ainda sai do repositório antigo', async () => {
  const { h, pedidos } = await loadDuas(NOVO, ASSETS)
  const mac = fakeRes()
  await h({ query: { p: 'mac' } }, mac)
  assert.equal(mac.loc, 'https://novo/b1001.dmg')
  assert.ok(!pedidos.some((u) => u.includes('/victorbarrosoc-hub/synquei/')), 'não consulta o antigo sem precisar')
  const v = fakeRes()
  await h({ query: { p: 'versao' } }, v)
  assert.equal(v.body.build, 1001)
  const velho = fakeRes()
  await h({ query: { p: 'mac', build: '7' } }, velho)
  assert.equal(velho.loc, 'https://gh/b7.dmg')
})
