// Bandeja/barra de menus: o menu como lista de itens, a dica, o ícone de cada sistema e os arquivos do ícone.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { lerPng } from '../scripts/png.mjs'
import { achatar, rasterizar } from '../scripts/bandeja.mjs'

const require = createRequire(import.meta.url)
const { modeloDoMenu, dica, iconeDaBandeja, barraClaraDoWindows } = require('../desktop/bandeja.cjs')
const BUILD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'bandeja')

const acoes = (itens) => itens.filter((i) => i.tipo !== 'separador').map((i) => i.acao)
const apps = [
  { id: 'sobedesce', nome: 'SOBEDESCE' },
  { id: 'synquei', nome: 'Synquei' },
]

test('menu curto: abrir, apps instalados, procurar, abrir com o computador e sair', () => {
  const itens = modeloDoMenu({ apps, pendentes: [], abrirComSistema: true })
  assert.deepEqual(acoes(itens), ['abrir', 'abrir-app', 'abrir-app', 'procurar', 'abrir-com-sistema', 'sair'])
  assert.equal(itens[0].rotulo, 'Abrir Absolute ZRO')
  assert.deepEqual(
    itens.filter((i) => i.acao === 'abrir-app').map((i) => [i.id, i.rotulo]),
    [
      ['sobedesce', 'SOBEDESCE'],
      ['synquei', 'Synquei'],
    ],
  )
  const sistema = itens.find((i) => i.acao === 'abrir-com-sistema')
  assert.deepEqual([sistema.tipo, sistema.marcado], ['checkbox', true])
  assert.equal(itens.at(-1).rotulo, 'Sair do Absolute ZRO')
  // sem separador sobrando quando não há app instalado
  const vazio = modeloDoMenu({ apps: [], abrirComSistema: null })
  assert.deepEqual(acoes(vazio), ['abrir', 'procurar', 'sair'])
  assert.equal(vazio.filter((i) => i.tipo === 'separador').length, 2)
})

test('menu: app aberto com versão nova mostra "atualiza ao fechar" e "Reiniciar e atualizar"', () => {
  const itens = modeloDoMenu({ apps, pendentes: [{ id: 'sobedesce', nome: 'SOBEDESCE', fase: 'ao-fechar' }], abrirComSistema: false })
  assert.equal(itens.find((i) => i.id === 'sobedesce' && i.acao === 'abrir-app').rotulo, 'SOBEDESCE · atualiza ao fechar')
  const r = itens.find((i) => i.acao === 'reiniciar-e-atualizar')
  assert.deepEqual([r.id, r.rotulo], ['sobedesce', 'Reiniciar e atualizar SOBEDESCE'])
  assert.equal(
    itens.some((i) => i.acao === 'atualizar-tudo'),
    false,
    'com uma só, sem "Atualizar tudo"',
  )
  assert.equal(itens.find((i) => i.acao === 'abrir-com-sistema').marcado, false)
})

test('menu: "Atualizar tudo" quando há mais de uma (ou uma com erro); ocupado desliga as ações', () => {
  const duas = modeloDoMenu({
    apps,
    pendentes: [
      { id: 'sobedesce', nome: 'SOBEDESCE', fase: 'ao-fechar' },
      { id: 'synquei', nome: 'Synquei', fase: 'ao-fechar' },
    ],
  })
  assert.equal(duas.filter((i) => i.acao === 'reiniciar-e-atualizar').length, 2)
  assert.ok(duas.some((i) => i.acao === 'atualizar-tudo' && i.rotulo === 'Atualizar tudo'))
  assert.ok(modeloDoMenu({ apps, pendentes: [{ id: 'synquei', nome: 'Synquei', fase: 'erro' }] }).some((i) => i.acao === 'atualizar-tudo'))
  const ocupado = modeloDoMenu({ apps, pendentes: [{ id: 'synquei', nome: 'Synquei', fase: 'instalando' }] })
  assert.equal(ocupado.find((i) => i.acao === 'procurar').ativo, false)
  const item = ocupado.find((i) => i.id === 'synquei')
  assert.deepEqual([item.rotulo, item.ativo], ['Synquei · atualizando…', false])
  const procurando = modeloDoMenu({ apps: [], procurando: true })
  assert.deepEqual(
    [procurando.find((i) => i.acao === 'procurar').rotulo, procurando.find((i) => i.acao === 'procurar').ativo],
    ['Procurando atualizações…', false],
  )
  // baixando em segundo plano não muda o nome do app (não incomoda)
  assert.equal(modeloDoMenu({ apps, pendentes: [{ id: 'synquei', nome: 'Synquei', fase: 'baixando' }] }).find((i) => i.id === 'synquei').rotulo, 'Synquei')
})

test('dica do ícone', () => {
  assert.equal(dica({ pendentes: [] }), 'Absolute ZRO')
  assert.equal(dica({ pendentes: [{ fase: 'ao-fechar' }] }), 'Absolute ZRO · 1 atualização pronta')
  assert.equal(dica({ pendentes: [{ fase: 'ao-fechar' }, { fase: 'ao-fechar' }] }), 'Absolute ZRO · 2 atualizações prontas')
  assert.equal(dica({ pendentes: [{ fase: 'instalando' }] }), 'Absolute ZRO · atualizando apps')
})

test('ícone: template no Mac, branco ou grafite no Windows conforme a barra', () => {
  assert.deepEqual(iconeDaBandeja({ plataforma: 'mac' }), { arquivo: 'bandejaTemplate.png', template: true })
  assert.equal(iconeDaBandeja({ plataforma: 'windows', barraClara: false }).arquivo, 'bandeja-branco.png')
  assert.equal(iconeDaBandeja({ plataforma: 'windows', barraClara: true }).arquivo, 'bandeja-grafite.png')
  assert.equal(iconeDaBandeja({ plataforma: 'linux' }).arquivo, 'bandeja-branco.png')
  assert.equal(barraClaraDoWindows('    SystemUsesLightTheme    REG_DWORD    0x1'), true)
  assert.equal(barraClaraDoWindows('    SystemUsesLightTheme    REG_DWORD    0x0'), false)
  assert.equal(barraClaraDoWindows(''), false)
})

test('arquivos do ícone: tamanhos certos, uma cor só e transparência', () => {
  const esperado = {
    'bandejaTemplate.png': [20, 16, [0, 0, 0]],
    'bandejaTemplate@2x.png': [40, 32, [0, 0, 0]],
    'bandeja-branco.png': [16, 16, [255, 255, 255]],
    'bandeja-branco@2x.png': [32, 32, [255, 255, 255]],
    'bandeja-grafite.png': [16, 16, [29, 29, 31]],
    'bandeja-grafite@2x.png': [32, 32, [29, 29, 31]],
  }
  for (const [nome, [w, h, cor]] of Object.entries(esperado)) {
    const img = lerPng(fs.readFileSync(path.join(BUILD, nome)))
    assert.deepEqual([img.width, img.height], [w, h], nome)
    let visiveis = 0
    let transparentes = 0
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] === 0) transparentes++
      else {
        visiveis++
        assert.deepEqual([img.data[i], img.data[i + 1], img.data[i + 2]], cor, `${nome}: monocromático`)
      }
    }
    assert.ok(visiveis > w && transparentes > w, `${nome}: símbolo com fundo transparente`)
  }
})

test('rasterização: anel par-ímpar (furo no meio) a partir do caminho do SVG', () => {
  const anel = achatar('M10 50a40 40 0 1 0 80 0a40 40 0 1 0 -80 0ZM30 50a20 20 0 1 0 40 0a20 20 0 1 0 -40 0Z')
  assert.equal(anel.length, 2)
  const img = rasterizar([anel], 20, 20, [0, 0, 0], 0)
  const alfa = (x, y) => img.data[(y * 20 + x) * 4 + 3]
  assert.equal(alfa(10, 10), 0, 'o centro fica vazado')
  assert.equal(alfa(1, 10), 255, 'o traço do anel fica cheio')
  assert.equal(alfa(0, 0), 0, 'o canto fica vazio')
})
