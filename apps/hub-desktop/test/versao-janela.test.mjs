import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { AvisoDeVersao, lerBuildInfo, lerRemoto, temNova, compararVersao } = require('../desktop/versao.cjs')
const janela = require('../desktop/janela.cjs')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zro-desk-'))
const resposta =
  (json, ok = true) =>
  async () => ({ ok, json: async () => json })

test('comparação de versão e build', () => {
  assert.equal(compararVersao('1.2.3', '1.10.0'), -1)
  assert.equal(compararVersao('2.0.0', '1.99.99'), 1)
  assert.equal(compararVersao('1.0', '1.0.0'), 0)
  assert.equal(temNova(5, { build: 6 }), true)
  assert.equal(temNova(6, { build: 6 }), false)
  assert.equal(temNova(0, { build: 99 }), false, 'build de desenvolvimento nunca avisa')
  assert.equal(temNova(5, null), false)
  assert.deepEqual(lerRemoto({ ok: true, build: 12, versao: '1.0.1' }), { build: 12, versao: '1.0.1', sha256Mac: null, sha256Windows: null })
  assert.equal(lerRemoto({ build: 12, sha256Mac: 'A'.repeat(64) }).sha256Mac, 'a'.repeat(64))
  assert.equal(lerRemoto({ build: 12, sha256Mac: 'nao-e-hash' }).sha256Mac, null)
  assert.equal(lerRemoto({ ok: false, build: 12 }), null)
  assert.equal(lerRemoto({ build: '12abc' }), null)
  assert.equal(lerRemoto({ build: -1 }), null)
  assert.deepEqual(lerRemoto({ build: 3, versao: '<script>' }), { build: 3, versao: null, sha256Mac: null, sha256Windows: null })
})

test('build-info: ausente ou inválido = 0', () => {
  const d = tmp()
  assert.equal(lerBuildInfo(path.join(d, 'nada.json')).build, 0)
  fs.writeFileSync(path.join(d, 'b.json'), '{"build":"x"}')
  assert.equal(lerBuildInfo(path.join(d, 'b.json')).build, 0)
  fs.writeFileSync(path.join(d, 'b.json'), '{"build":42,"commit":"abc1234"}')
  assert.deepEqual(lerBuildInfo(path.join(d, 'b.json')), { build: 42, commit: 'abc1234', data: '' })
})

test('aviso: confere /baixar/hub/versao, avisa uma vez por build e respeita "Depois"', async () => {
  const pasta = tmp()
  const pedidos = []
  const avisos = []
  const abertos = []
  let escolha = 'depois'
  const a = new AvisoDeVersao({
    hub: 'https://absolutezro.com',
    plataforma: 'mac',
    build: 10,
    pasta,
    fetch: async (url) => {
      pedidos.push(url)
      return { ok: true, json: async () => ({ ok: true, build: 11, versao: '1.0.1' }) }
    },
    avisar: async (n) => (avisos.push(n), escolha),
    abrir: (u) => abertos.push(u),
  })
  assert.equal((await a.conferir()).estado, 'nova')
  assert.equal(pedidos[0], 'https://absolutezro.com/baixar/hub/versao')
  assert.equal(avisos[0].baixarUrl, 'https://absolutezro.com/baixar/hub/mac')
  assert.equal((await a.conferir()).estado, 'adiada', '"Depois" vale para este build')
  assert.equal(avisos.length, 1)
  escolha = 'baixar'
  assert.equal((await a.conferir({ manual: true })).estado, 'nova', 'pelo menu avisa de novo')
  assert.deepEqual(abertos, ['https://absolutezro.com/baixar/hub/mac'])
})

test('aviso: em dia, sem resposta, desenvolvimento e Windows', async () => {
  const base = { hub: 'https://h.example', pasta: tmp(), avisar: async () => 'baixar', abrir: () => {} }
  assert.equal((await new AvisoDeVersao({ ...base, plataforma: 'windows', build: 11, fetch: resposta({ build: 11 }) }).conferir()).estado, 'em-dia')
  assert.equal(
    (await new AvisoDeVersao({ ...base, plataforma: 'windows', build: 11, fetch: resposta({ ok: false }, false) }).conferir()).estado,
    'sem-resposta',
  )
  const quebra = async () => {
    throw new Error('offline')
  }
  assert.equal((await new AvisoDeVersao({ ...base, plataforma: 'windows', build: 11, fetch: quebra }).conferir()).estado, 'sem-resposta')
  let chamou = false
  const dev = new AvisoDeVersao({ ...base, plataforma: 'mac', build: 0, fetch: async () => ((chamou = true), resposta({ build: 99 })()) })
  assert.equal((await dev.conferir()).estado, 'desenvolvimento')
  assert.equal(chamou, false)
  assert.equal(new AvisoDeVersao({ ...base, plataforma: 'windows', build: 1 }).baixarUrl, 'https://h.example/baixar/hub/windows')
})

test('janela: lembra tamanho e posição só se ainda couber numa tela', () => {
  const telas = [{ workArea: { x: 0, y: 25, width: 1440, height: 875 } }]
  assert.deepEqual(janela.estadoValido(null, telas), { width: 1360, height: 875, maximizada: false, telaCheia: false, zoom: 0 })
  const ok = janela.estadoValido({ x: 100, y: 80, width: 1200, height: 800, maximizada: true, zoom: 1 }, telas)
  assert.deepEqual(ok, { x: 100, y: 80, width: 1200, height: 800, maximizada: true, telaCheia: false, zoom: 1 })
  // monitor externo (à direita) desligado: centraliza
  const fora = janela.estadoValido({ x: 2000, y: 100, width: 1200, height: 800 }, telas)
  assert.equal(fora.x, undefined)
  // menor que o mínimo, maior que a tela, zoom absurdo
  const torto = janela.estadoValido({ width: 100, height: 99999, zoom: 40 }, telas)
  assert.deepEqual([torto.width, torto.height, torto.zoom], [janela.MINIMO.width, 875, janela.ZOOM.max])
  const d = tmp()
  janela.gravar(d, { width: 1000, height: 700 })
  assert.deepEqual(janela.ler(d), { width: 1000, height: 700 })
  fs.writeFileSync(path.join(d, janela.ARQUIVO), '{quebrado')
  assert.equal(janela.ler(d), null)
})

test('aviso: "Atualizar" entrega ao atualizador o build, o endereço com ?build= e o SHA-256 da plataforma', async () => {
  const pedidos = []
  const a = new AvisoDeVersao({
    hub: 'https://h.example',
    plataforma: 'mac',
    build: 10,
    pasta: tmp(),
    fetch: resposta({ ok: true, build: 12, versao: '1.2.0', sha256Mac: 'b'.repeat(64), sha256Windows: 'c'.repeat(64) }),
    avisar: async () => 'atualizar',
    abrir: () => assert.fail('não abre o navegador'),
    atualizar: (n) => pedidos.push(n),
  })
  const r = await a.conferir()
  assert.equal(r.escolha, 'atualizar')
  assert.deepEqual(pedidos, [{ build: 12, versao: '1.2.0', url: 'https://h.example/baixar/hub/mac?build=12', sha256: 'b'.repeat(64) }])
})
