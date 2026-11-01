// Aviso "Atualização disponível" do Maestro: confere o versao.json pela Absolute ZRO (gate), mostra o aviso discreto,
// notifica uma vez por build e aponta para a central (absolutezro://apps/maestro?acao=atualizar). O app não baixa nem
// instala nada sozinho: quem atualiza é a central Absolute ZRO (01/11/2026).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { AvisoDeVersao, lerRemoto, temNova, lerBuildInfo, PREFS, PRODUTO } = require('../desktop/versao.cjs')
const central = require('../desktop/central.cjs')

const ID = 'maestro'
const HUB = 'https://absolutezro.com'
const LINK = `absolutezro://apps/${ID}?acao=atualizar`
const VERSAO = { build: 7, versao: '0.1.1', arquivoMac: 'x.dmg', sha256Mac: 'a'.repeat(64) }
const DESKTOP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'desktop')
const pasta = () => fs.mkdtempSync(path.join(os.tmpdir(), `${ID}-versao-`))

function aviso(o = {}) {
  const pedidos = []
  const mostrados = []
  const notificados = []
  const a = new AvisoDeVersao({
    hub: HUB,
    build: 5,
    pasta: pasta(),
    fetch: async (url, init) => {
      pedidos.push({ url, init })
      if (o.falhar) throw new Error('sem rede')
      if (o.status) return new Response('{}', { status: o.status })
      return Response.json(o.corpo ?? VERSAO)
    },
    mostrar: (n) => mostrados.push(n),
    notificar: (n) => notificados.push(n),
    ...o.extra,
  })
  return { a, pedidos, mostrados, notificados }
}

test('versao.json: só confia em build e versão (endereço de arquivo não interessa mais)', () => {
  assert.equal(PRODUTO, ID)
  assert.deepEqual(lerRemoto(VERSAO), { build: 7, versao: '0.1.1' })
  assert.equal(lerRemoto({ ok: false }), null)
  assert.equal(lerRemoto({ build: 0 }), null)
  assert.equal(lerRemoto({ build: 'x' }), null)
  assert.equal(lerRemoto(null), null)
  assert.deepEqual(lerRemoto({ build: 7, versao: '<script>' }), { build: 7, versao: null })
  assert.equal(temNova(5, { build: 7 }), true)
  assert.equal(temNova(7, { build: 7 }), false)
  assert.equal(temNova(0, { build: 7 }), false) // desenvolvimento nunca avisa
})

test('versão nova: aviso discreto e notificação apontando para a central, pela rota do gate', async () => {
  const { a, pedidos, mostrados, notificados } = aviso()
  const r = await a.conferir()
  assert.equal(r.estado, 'nova')
  assert.equal(r.notificou, true)
  assert.equal(pedidos[0].url, `${HUB}/baixar/app/${ID}/versao.json`)
  assert.equal(pedidos[0].init.redirect, 'follow')
  assert.deepEqual(mostrados, [{ build: 7, versao: '0.1.1', link: LINK }])
  assert.deepEqual(notificados, [{ build: 7, versao: '0.1.1', link: LINK }])
})

test('a notificação sai uma vez por build; o aviso discreto fica; build mais novo notifica de novo', async () => {
  const { a, mostrados, notificados } = aviso()
  await a.conferir()
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(a.o.pasta, PREFS), 'utf8')), { avisadoDoBuild: 7 })
  const de_novo = await a.conferir()
  assert.equal(de_novo.estado, 'nova')
  assert.equal(de_novo.notificou, false)
  assert.equal(notificados.length, 1)
  assert.equal(mostrados.length, 2)
  a.fetch = async () => Response.json({ build: 8, versao: '0.1.2' })
  assert.equal((await a.conferir()).notificou, true)
  assert.equal(notificados.length, 2)
  // já em dia (instalou pela central): o aviso some
  a.o.build = 8
  assert.equal((await a.conferir()).estado, 'em-dia')
  assert.equal(mostrados.at(-1), null)
})

test('em dia, sem resposta, fechado pelo gate (404) e desenvolvimento não avisam', async () => {
  for (const o of [{ corpo: { ...VERSAO, build: 5 } }, { falhar: true }, { status: 404 }]) {
    const { a, mostrados, notificados } = aviso(o)
    assert.notEqual((await a.conferir()).estado, 'nova')
    assert.equal(mostrados.length + notificados.length, 0)
  }
  const dev = aviso({ extra: { build: 0 } })
  assert.equal((await dev.a.conferir()).estado, 'desenvolvimento')
  assert.equal(dev.pedidos.length, 0)
})

test('o app não baixa instalador sozinho: sem atualizador, sem gerenciado, sem baixar do Release', () => {
  assert.equal(fs.existsSync(path.join(DESKTOP, 'atualizador.cjs')), false)
  assert.equal(fs.existsSync(path.join(DESKTOP, 'gerenciado.cjs')), false)
  const main = fs.readFileSync(path.join(DESKTOP, 'main.cjs'), 'utf8')
  assert.doesNotMatch(main, /require\('\.\/atualizador\.cjs'\)|baixarPara|entregarTroca|child_process/)
  assert.doesNotMatch(main, /Procurar atualizações/)
  assert.match(main, /As atualizações chegam pela Absolute ZRO/)
  assert.match(main, /'Atualização disponível'/)
  assert.match(main, /'Atualizar na Absolute ZRO'/)
  const versao = fs.readFileSync(path.join(DESKTOP, 'versao.cjs'), 'utf8')
  assert.doesNotMatch(versao, /\.dmg|\.exe|sha256/i)
})

test('a central: deep link do contrato; sem a central (ou o sistema recusa), a página de baixar', async () => {
  assert.equal(central.linkDaCentral(ID), LINK)
  assert.equal(central.linkDaCentral(ID, 'instalar'), `absolutezro://apps/${ID}?acao=instalar`)
  assert.throws(() => central.linkDaCentral('outro'))
  assert.throws(() => central.linkDaCentral(ID, 'apagar'))
  assert.equal(central.PAGINA_DA_CENTRAL, 'https://absolutezro.com/baixar')

  const abertos = []
  const abrir = async (u) => abertos.push(u)
  assert.equal(await central.abrirNaCentral(ID, { temCentral: () => true, abrir }), 'central')
  assert.deepEqual(abertos, [LINK])

  abertos.length = 0
  assert.equal(await central.abrirNaCentral(ID, { temCentral: () => false, abrir }), 'pagina')
  assert.deepEqual(abertos, ['https://absolutezro.com/baixar'])

  abertos.length = 0
  const recusa = async (u) => {
    abertos.push(u)
    if (u.startsWith('absolutezro:')) throw new Error('sem app para o protocolo')
  }
  assert.equal(await central.abrirNaCentral(ID, { temCentral: () => true, abrir: recusa }), 'pagina')
  assert.deepEqual(abertos, [LINK, 'https://absolutezro.com/baixar'])

  abertos.length = 0
  const quebra = () => {
    throw new Error('x')
  }
  assert.equal(await central.abrirNaCentral(ID, { temCentral: quebra, abrir }), 'pagina')
  assert.deepEqual(abertos, ['https://absolutezro.com/baixar'])
})

test('build-info: sem arquivo é 0 (desenvolvimento)', () => {
  assert.deepEqual(lerBuildInfo('/nao/existe.json'), { build: 0, commit: '', data: '' })
  const p = path.join(pasta(), 'b.json')
  fs.writeFileSync(p, JSON.stringify({ build: 12, commit: 'abc1234', data: '2026-10-29T00:00:00Z' }))
  assert.deepEqual(lerBuildInfo(p), { build: 12, commit: 'abc1234', data: '2026-10-29T00:00:00Z' })
})

test('barra do Mac: a pílula "Atualização disponível" escondida até haver versão nova', () => {
  const html = fs.readFileSync(path.join(DESKTOP, 'paginas', 'barra.html'), 'utf8')
  assert.match(html, /id="atualizar"[^>]*hidden>Atualização disponível</)
  const js = fs.readFileSync(path.join(DESKTOP, 'paginas', 'barra.js'), 'utf8')
  assert.match(js, /el\('atualizar'\)\.hidden = !s\.atualizacao/)
})
