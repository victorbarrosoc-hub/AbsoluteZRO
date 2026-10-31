// Aviso "Nova versão do TPeasy": versao.json pela Absolute ZRO (gate), uma vez por build, "Depois" lembrado, quieto
// quando a central do Absolute ZRO cuida do app; e o motor do "Atualizar" compartilhado com o nome do TPeasy.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { AvisoDeVersao, lerRemoto, temNova, lerBuildInfo, PREFS } = require('../desktop/versao.cjs')
const { eGerenciado, lerGerenciado, arquivoDaCentral } = require('../desktop/gerenciado.cjs')
const { scriptWin, Atualizador } = require('../desktop/atualizador.cjs')

const HUB = 'https://absolutezro.com'
const sha = (c) => c.repeat(64)
const VERSAO = {
  build: 7,
  versao: '0.1.0',
  arquivoMac: 'TPeasy-0.1.0-b7-mac-universal.dmg',
  sha256Mac: sha('a'),
  arquivoWindows: 'TPeasy-0.1.0-b7-windows-setup.exe',
  sha256Windows: sha('b'),
}
const pasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tpeasy-versao-'))

function aviso(o = {}) {
  const pedidos = []
  const abertos = []
  const instalados = []
  const avisos = []
  const a = new AvisoDeVersao({
    hub: HUB,
    plataforma: 'mac',
    build: 5,
    pasta: pasta(),
    fetch: async (url, init) => {
      pedidos.push({ url, init })
      if (o.falhar) throw new Error('sem rede')
      if (o.status) return new Response('{}', { status: o.status })
      return Response.json(o.corpo ?? VERSAO)
    },
    avisar: async (nova) => {
      avisos.push(nova)
      return o.escolha ?? 'depois'
    },
    abrir: (u) => abertos.push(u),
    atualizar: (n) => instalados.push(n),
    ...o.extra,
  })
  return { a, pedidos, abertos, instalados, avisos }
}

test('versao.json: só confia em build, versão, SHA-256 e nomes do nosso padrão e do mesmo build', () => {
  assert.deepEqual(lerRemoto(VERSAO), { ...VERSAO })
  assert.equal(lerRemoto({ ok: false }), null)
  assert.equal(lerRemoto({ build: 0 }), null)
  assert.equal(lerRemoto({ build: 'x' }), null)
  assert.equal(lerRemoto(null), null)
  const estranho = lerRemoto({
    build: 7,
    versao: '<script>',
    sha256Mac: 'curto',
    arquivoMac: '../../etc/passwd',
    arquivoWindows: 'TPeasy-0.1.0-b6-windows-setup.exe', // build diferente
  })
  assert.deepEqual(estranho, { build: 7, versao: null, sha256Mac: null, sha256Windows: null, arquivoMac: null, arquivoWindows: null })
  assert.equal(temNova(5, { build: 7 }), true)
  assert.equal(temNova(7, { build: 7 }), false)
  assert.equal(temNova(0, { build: 7 }), false) // desenvolvimento nunca avisa
})

test('confere pela Absolute ZRO (rota do gate), avisa e "Atualizar" leva o arquivo exato do build com o SHA-256', async () => {
  const { a, pedidos, instalados, avisos } = aviso({ escolha: 'atualizar' })
  const r = await a.conferir()
  assert.equal(r.estado, 'nova')
  assert.equal(pedidos[0].url, `${HUB}/baixar/app/tpeasy/versao.json`)
  assert.equal(pedidos[0].init.redirect, 'follow')
  assert.equal(avisos.length, 1)
  assert.equal(avisos[0].baixarUrl, `${HUB}/baixar#tpeasy`)
  assert.deepEqual(instalados, [{ build: 7, versao: '0.1.0', url: `${HUB}/baixar/app/tpeasy/${VERSAO.arquivoMac}`, sha256: sha('a') }])
})

test('Windows recebe o .exe; sistema sem instalador publicado não tem url', async () => {
  const { a } = aviso({ extra: { plataforma: 'windows' } })
  assert.deepEqual(a.paraInstalar(lerRemoto(VERSAO)), {
    build: 7,
    versao: '0.1.0',
    url: `${HUB}/baixar/app/tpeasy/${VERSAO.arquivoWindows}`,
    sha256: sha('b'),
  })
  assert.equal(a.paraInstalar(lerRemoto({ build: 7 })).url, null)
})

test('"Depois" vale para aquele build; manual avisa de novo; build novo avisa de novo', async () => {
  const { a, avisos } = aviso()
  assert.equal((await a.conferir()).estado, 'nova')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(a.o.pasta, PREFS), 'utf8')), { depoisDoBuild: 7 })
  assert.equal((await a.conferir()).estado, 'adiada')
  assert.equal((await a.conferir({ manual: true })).estado, 'nova')
  a.fetch = async () => Response.json({ ...VERSAO, build: 8, arquivoMac: null, arquivoWindows: null })
  assert.equal((await a.conferir()).estado, 'nova')
  assert.equal(avisos.length, 3)
})

test('"Baixar" abre a página de downloads da Absolute ZRO', async () => {
  const { a, abertos } = aviso({ escolha: 'baixar' })
  await a.conferir()
  assert.deepEqual(abertos, [`${HUB}/baixar#tpeasy`])
})

test('em dia, sem resposta, fechado pelo gate (404) e desenvolvimento não avisam', async () => {
  assert.equal((await aviso({ corpo: { ...VERSAO, build: 5 } }).a.conferir()).estado, 'em-dia')
  assert.equal((await aviso({ falhar: true }).a.conferir()).estado, 'sem-resposta')
  // TPeasy fechado e a pessoa fora da lista de acesso: a rota responde 404 e nada aparece
  const fechado = aviso({ status: 404 })
  assert.equal((await fechado.a.conferir()).estado, 'sem-resposta')
  assert.equal(fechado.avisos.length, 0)
  const dev = aviso({ extra: { build: 0 } })
  assert.equal((await dev.a.conferir()).estado, 'desenvolvimento')
  assert.equal(dev.pedidos.length, 0)
})

test('instalado pela central do Absolute ZRO: quem atualiza é ela, o aviso fica quieto', async () => {
  const { a, pedidos } = aviso({ extra: { gerenciado: () => true } })
  assert.equal((await a.conferir()).estado, 'gerenciado')
  assert.equal(pedidos.length, 0)

  const agora = Date.parse('2026-10-29T12:00:00Z')
  const json = { versao: 1, visto: '2026-10-28T12:00:00Z', apps: { tpeasy: { desde: '2026-10-01T00:00:00Z' } } }
  assert.equal(eGerenciado(json, 'tpeasy', agora), true)
  assert.equal(eGerenciado({ ...json, apps: { synquei: {} } }, 'tpeasy', agora), false)
  assert.equal(eGerenciado({ ...json, visto: '2026-10-01T00:00:00Z' }, 'tpeasy', agora), false) // central sumiu (>14 dias)
  assert.equal(eGerenciado(null, 'tpeasy', agora), false)
  const dados = pasta()
  const arq = arquivoDaCentral(dados)
  assert.ok(arq.endsWith(path.join('Absolute ZRO', 'apps-gerenciados.json')))
  assert.equal(lerGerenciado(arq, 'tpeasy', agora), false)
  fs.mkdirSync(path.dirname(arq), { recursive: true })
  fs.writeFileSync(arq, JSON.stringify(json))
  assert.equal(lerGerenciado(arq, 'tpeasy', agora), true)
})

test('build-info: sem arquivo é 0 (desenvolvimento)', () => {
  assert.deepEqual(lerBuildInfo('/nao/existe.json'), { build: 0, commit: '', data: '' })
  const p = path.join(pasta(), 'b.json')
  fs.writeFileSync(p, JSON.stringify({ build: 12, commit: 'abc1234', data: '2026-10-29T00:00:00Z' }))
  assert.deepEqual(lerBuildInfo(p), { build: 12, commit: 'abc1234', data: '2026-10-29T00:00:00Z' })
})

test('"Atualizar" compartilhado com o Absolute ZRO usa o nome do TPeasy', () => {
  const s = scriptWin({ pid: 1, setup: 'C:\\t\\s.exe', exe: 'C:\\TPeasy\\TPeasy.exe', marca: 'C:\\m.json', tmp: 'C:\\t', build: 7, nome: 'TPeasy' })
  assert.match(s, /Get-Process -Name 'TPeasy'/)
  assert.doesNotMatch(s, /Absolute ZRO'/)
  const at = new Atualizador({
    nome: 'TPeasy',
    platform: 'darwin',
    appExe: '/Volumes/TPeasy/TPeasy.app/Contents/MacOS/TPeasy',
    appPid: 1,
    entregar: () => {},
    canWrite: () => true,
  })
  assert.equal(at.disponivel, false)
  assert.match(at.motivo, /O TPeasy está aberto direto do disco de instalação/)
})
