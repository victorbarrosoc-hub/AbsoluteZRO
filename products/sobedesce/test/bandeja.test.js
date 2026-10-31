// Bandeja do app de desktop (desktop/bandeja.js): minimizar e fechar a janela, o menu e o ajuste gravado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  acaoAoFechar,
  acaoAoMinimizar,
  deveAvisar,
  dicaBandeja,
  gravarPrefs,
  iconeBandeja,
  lerPrefs,
  minimizarLigado,
  modeloMenuBandeja,
  padraoMinimizar,
  textoTransferencias,
} from '../desktop/bandeja.js'

test('minimizar para a bandeja vem ligado só no Windows', () => {
  assert.equal(padraoMinimizar('win32'), true)
  assert.equal(padraoMinimizar('darwin'), false)
  assert.equal(padraoMinimizar('linux'), false)
  assert.equal(minimizarLigado({}, 'win32'), true)
  assert.equal(minimizarLigado({ minimizar: false }, 'win32'), false)
  assert.equal(minimizarLigado({ minimizar: true }, 'darwin'), true)
  assert.equal(minimizarLigado(null, 'darwin'), false)
})

test('minimizar: vai para a bandeja com o ajuste ligado e o ícone existindo', () => {
  assert.equal(acaoAoMinimizar({ plataforma: 'win32', minimizar: true, temBandeja: true }), 'bandeja')
  assert.equal(acaoAoMinimizar({ plataforma: 'win32', minimizar: undefined, temBandeja: true }), 'bandeja', 'padrão do Windows')
  assert.equal(acaoAoMinimizar({ plataforma: 'win32', minimizar: false, temBandeja: true }), 'normal')
  assert.equal(acaoAoMinimizar({ plataforma: 'win32', minimizar: true, temBandeja: false }), 'normal', 'sem bandeja não some')
  assert.equal(acaoAoMinimizar({ plataforma: 'darwin', minimizar: undefined, temBandeja: true }), 'normal', 'Mac fica no Dock')
  assert.equal(acaoAoMinimizar({ plataforma: 'darwin', minimizar: true, temBandeja: true }), 'bandeja')
})

test('fechar: sem transferência fecha como antes; com transferência vai para a bandeja ou pergunta', () => {
  const base = { plataforma: 'win32', minimizar: true, temBandeja: true }
  assert.equal(acaoAoFechar({ ...base, transferencias: 0 }), 'fechar')
  assert.equal(acaoAoFechar({ ...base, transferencias: 2 }), 'bandeja')
  assert.equal(acaoAoFechar({ ...base, minimizar: false, transferencias: 2 }), 'perguntar', 'bandeja desligada: a pergunta de antes')
  assert.equal(acaoAoFechar({ ...base, temBandeja: false, transferencias: 2 }), 'perguntar', 'sem ícone nunca esconde')
  assert.equal(acaoAoFechar({ ...base, minimizar: false, transferencias: 2, confirmado: true }), 'fechar')
  assert.equal(acaoAoFechar({ ...base, transferencias: 2, saindo: true }), 'fechar', 'Sair da bandeja ou do menu')
  assert.equal(acaoAoFechar({ ...base, plataforma: 'darwin', transferencias: 2 }), 'fechar', 'Mac: só a janela fecha')
  assert.equal(acaoAoFechar({ plataforma: 'linux', minimizar: undefined, temBandeja: true, transferencias: 1 }), 'perguntar')
})

test('menu da bandeja: abrir, o estado das transferências e sair', () => {
  assert.equal(textoTransferencias(0), 'Nenhuma transferência agora')
  assert.equal(textoTransferencias(1), '1 transferência em andamento')
  assert.equal(textoTransferencias(2), '2 transferências em andamento')
  assert.equal(textoTransferencias('x'), 'Nenhuma transferência agora')
  assert.equal(dicaBandeja(0), 'SOBEDESCE')
  assert.equal(dicaBandeja(3), 'SOBEDESCE · 3 transferências em andamento')
  const itens = modeloMenuBandeja(2)
  assert.deepEqual(itens.filter(i => i.acao).map(i => [i.acao, i.rotulo]), [['abrir', 'Abrir SOBEDESCE'], ['sair', 'Sair']])
  const estado = itens.find(i => !i.acao && i.tipo === 'item')
  assert.equal(estado.rotulo, '2 transferências em andamento')
  assert.equal(estado.ativo, false)
})

test('ícone certo para cada sistema, e os arquivos existem', () => {
  assert.deepEqual(iconeBandeja('darwin'), { arquivo: 'bandejaTemplate.png', template: true })
  assert.equal(iconeBandeja('win32').arquivo, 'bandeja.ico')
  assert.equal(iconeBandeja('linux').arquivo, 'bandeja.png')
  const pasta = new URL('../desktop/bandeja/', import.meta.url)
  for (const f of ['bandeja.ico', 'bandeja.png', 'bandeja@2x.png', 'bandejaTemplate.png', 'bandejaTemplate@2x.png']) {
    assert.ok(fs.statSync(new URL(f, pasta)).size > 100, f)
  }
  const ico = fs.readFileSync(new URL('bandeja.ico', pasta))
  assert.equal(ico.readUInt16LE(2), 1, 'ICO')
  assert.ok(ico.readUInt16LE(4) >= 4, 'vários tamanhos para as escalas do Windows')
})

test('ajuste gravado em bandeja.json; o aviso sai uma vez só', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-bandeja-'))
  try {
    assert.deepEqual(lerPrefs(dir), {})
    assert.equal(deveAvisar(lerPrefs(dir)), true)
    gravarPrefs(dir, { avisou: true })
    assert.equal(deveAvisar(lerPrefs(dir)), false)
    gravarPrefs(dir, { minimizar: false })
    assert.deepEqual(lerPrefs(dir), { avisou: true, minimizar: false })
    assert.equal(minimizarLigado(lerPrefs(dir), 'win32'), false)
    fs.writeFileSync(path.join(dir, 'bandeja.json'), '{quebrado')
    assert.deepEqual(lerPrefs(dir), {})
    fs.writeFileSync(path.join(dir, 'bandeja.json'), JSON.stringify({ minimizar: 'sim', avisou: 1 }))
    assert.deepEqual(lerPrefs(dir), {}, 'tipo errado é ignorado')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('main.js: bandeja fora do teste de fumaça e volta pela segunda abertura', () => {
  const main = fs.readFileSync(new URL('../desktop/main.js', import.meta.url), 'utf8')
  assert.match(main, /function criarBandeja\(\) \{\n\s+if \(SMOKE/)
  // a segunda abertura volta a janela; com um link sobedesce:// (desktop/links.js), entrega o link (que também mostra a janela)
  assert.match(main, /app\.on\('second-instance', \(_event, argv\) => \{[\s\S]*?if \(link\) receberLink\(link\)\n\s+else showWindow\(\)/)
  assert.match(main, /function entregarLink\(\) \{[\s\S]*?showWindow\(\)/)
  assert.match(main, /setSkipTaskbar\(false\)/)
  assert.match(main, /win\.on\('minimize'/)
})
