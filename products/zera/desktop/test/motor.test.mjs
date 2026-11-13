// ZERA · a ponte com o motor de verdade (Rust), numa pasta temporária: varrer, abrir, anel, sugestões, revarrer só o
// trecho que mudou, guardar e carregar. Precisa do motor compilado (`npm run motor`); sem ele, o teste é pulado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Motor, acharMotor } = require('../desktop/motor.cjs')
const binario = acharMotor({ empacotado: false })

test('motor: varre, mostra, sugere, revarre o trecho e guarda', { skip: !fs.existsSync(binario) && 'motor não compilado' }, async () => {
  const raiz = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'zera-motor-')))
  const escrever = (rel, bytes) => {
    fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true })
    fs.writeFileSync(path.join(raiz, rel), Buffer.alloc(bytes, 7))
  }
  escrever('Filmes/bruto.mov', 400_000)
  escrever('Filmes/Media Cache Files/a.cfa', 2_000_000)
  escrever('Filmes/copia/bruto copia.mov', 400_000)
  escrever('notas.txt', 100)
  const m = new Motor(binario)
  const eventos = []
  m.on('evento', (e) => eventos.push(e.t))
  try {
    const v = await m.pedir('varrer', { raiz, cache: path.join(raiz, '..', path.basename(raiz) + '.bin') })
    assert.equal(v.ok, true)
    assert.equal(v.raiz.a, 4)
    assert.ok(eventos.includes('parcial'), 'manda as pastas do topo assim que terminam')

    const a = await m.pedir('abrir', { no: 0, max: 10 })
    assert.deepEqual(
      a.pasta.filhos.map((f) => f.n),
      ['Filmes', 'notas.txt'],
    )
    const filmes = a.pasta.filhos[0]
    assert.equal(filmes.k, 5, 'Filmes: o cache (outros) ocupa mais que o vídeo')
    assert.ok(filmes.pt[0] >= 800_000, 'os dois .mov contam como vídeo')

    const anel = await m.pedir('anel', { no: 0, niveis: 3, min: 0 })
    assert.equal(anel.anel.f[0].n, 'Filmes')

    const s = await m.pedir('sugestoes')
    const edicao = s.grupos.find((g) => g.id === 'cache-edicao')
    assert.equal(edicao.qtd, 1)
    assert.equal(edicao.itens[0].c, path.join('Filmes', 'Media Cache Files'))

    const d = await m.pedir('duplicados', { min: 100_000 })
    assert.equal(d.grupos.length, 1)
    assert.equal(d.grupos[0].itens[0].n, 'bruto.mov', 'fica o que não tem cara de cópia')

    // o disco muda: revarre só "Filmes"
    escrever('Filmes/novo.mov', 1_000_000)
    const r = await m.pedir('revarrer', { pastas: [path.join(raiz, 'Filmes')] })
    assert.equal(r.ok, true)
    assert.equal(r.raiz.a, 5)

    // caminhos e remover (depois que o app mandou para o Lixo)
    const achado = await m.pedir('achar', { caminho: path.join(raiz, 'Filmes', 'novo.mov') })
    const c = await m.pedir('caminhos', { nos: [achado.no] })
    assert.equal(c.caminhos[0].c, path.join(raiz, 'Filmes', 'novo.mov'))
    const rm = await m.pedir('remover', { nos: [achado.no, 0] })
    assert.deepEqual(rm.tirados, [achado.no], 'a raiz nunca sai')

    // guardar e carregar
    const arq = path.join(os.tmpdir(), 'zera-teste-' + process.pid + '.bin')
    assert.equal((await m.pedir('salvar', { arquivo: arq })).ok, true)
    const l = await m.pedir('carregar', { arquivo: arq })
    assert.equal(l.raiz.a, 4)
    assert.equal(l.caminho, raiz)
    fs.rmSync(arq)

    assert.equal((await m.pedir('nada')).erro, 'comando_desconhecido')
  } finally {
    m.parar()
    fs.rmSync(raiz, { recursive: true, force: true })
    fs.rmSync(path.join(raiz, '..', path.basename(raiz) + '.bin'), { force: true })
  }
})
