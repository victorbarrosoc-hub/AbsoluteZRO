// Looks numa pasta do computador (app/pasta-looks.js), para o SOBEDESCE levar ao Drive: leva o que só está no aparelho,
// traz o que só está na pasta, nunca grava por cima nem apaga, e recusa o que não é look.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arquivoDoLook, resumo, sincronizar } from '../app/pasta-looks.js'

const cube = (n = 2, tom = 0) => {
  const linhas = ['TITLE "teste"', `LUT_3D_SIZE ${n}`]
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) linhas.push([r, g, b].map((v) => Math.min(1, v / (n - 1) + tom).toFixed(4)).join(' '))
  return linhas.join('\n')
}

/** Uma pasta de mentira com a mesma forma do FileSystemDirectoryHandle. */
function pastaFalsa(arquivos = {}) {
  const f = new Map(Object.entries(arquivos))
  return {
    arquivos: f,
    async *values() {
      for (const [name, texto] of f) yield { kind: 'file', name, getFile: async () => ({ size: texto.length, text: async () => texto }) }
      yield { kind: 'directory', name: 'sub' }
    },
    async getFileHandle(name, { create } = {}) {
      if (!create && !f.has(name)) throw new Error('não existe')
      return { createWritable: async () => ({ write: async (t) => f.set(name, t), close: async () => {} }) }
    },
  }
}

function looksFalsos(itens = []) {
  const m = new Map(itens.map((x, i) => [`look-${i}`, { id: `look-${i}`, ...x }]))
  return {
    m,
    listar: async () => [...m.values()].map(({ id, nome }) => ({ id, nome, pontos: 2 })),
    ler: async (id) => m.get(id).texto,
    guardar: async (nome, texto) => {
      if (!/LUT_3D_SIZE/.test(texto)) throw new Error('não é .cube')
      const id = `look-${m.size}`
      m.set(id, { id, nome: nome.replace(/\.cube$/i, ''), texto })
      return { id }
    },
  }
}

test('leva o que só está aqui, traz o que só está na pasta, deixa o igual e não grava por cima', async () => {
  const Looks = looksFalsos([
    { nome: 'Verão quente', texto: cube() },
    { nome: 'Igual', texto: cube(2, 0.1) },
    { nome: 'Conflito', texto: cube(2, 0.2) },
  ])
  const pasta = pastaFalsa({ 'Igual.cube': cube(2, 0.1), 'conflito.cube': cube(2, 0.3), 'Da pasta.cube': cube(2, 0.4), 'lixo.cube': 'não sou look', 'nota.txt': 'x' })
  const r = await sincronizar(Looks, pasta)
  assert.deepEqual({ ...r }, { levados: 1, trazidos: 1, iguais: 1, conflitos: ['Conflito.cube'], recusados: ['lixo.cube'] })
  assert.equal(pasta.arquivos.get('Verão quente.cube'), cube())
  assert.equal(pasta.arquivos.get('conflito.cube'), cube(2, 0.3), 'o da pasta ficou como estava')
  assert.ok([...Looks.m.values()].some((l) => l.nome === 'Da pasta'))
  assert.equal(pasta.arquivos.size, 6, 'nada apagado')
  assert.match(resumo(r), /^1 levado para a pasta · 1 trazido da pasta · 1 com o mesmo nome/)
  // de novo: nada muda
  const r2 = await sincronizar(Looks, pasta)
  assert.equal(r2.levados + r2.trazidos, 0)
})

test('nome de arquivo: sem caracteres que o sistema recusa', () => {
  assert.equal(arquivoDoLook('A/B: "C"?'), 'A B C .cube'.replace(' .cube', '.cube'))
  assert.equal(arquivoDoLook('   '), 'Look.cube')
})
