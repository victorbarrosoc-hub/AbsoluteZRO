// Balão das abas: estado → número e dica por ferramenta (src/pendencias.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pendenciasConverter, pendenciasCst, rotuloBalao } from '../src/pendencias.js'

test('CST: câmera sem log que a pessoa não conferiu; escolher (até "Sem log") resolve', () => {
  assert.deepEqual(pendenciasCst([]), { n: 0, dica: '' })
  const aparelhos = [{ entrada: 'sony-slog3-cine' }, { entrada: '' }, { entrada: '' }, { entrada: '', decidido: true }]
  assert.deepEqual(pendenciasCst(aparelhos), { n: 2, dica: '2 câmeras sem log escolhido' })
  assert.equal(pendenciasCst([{ entrada: '' }]).dica, '1 câmera sem log escolhido')
})

test('Converter: na fila esperando o botão e prontos na memória sem baixar; pasta, erro e baixado não contam', () => {
  assert.deepEqual(pendenciasConverter([]), { n: 0, dica: '' })
  const fila = [
    { estado: 'lendo' },
    { estado: 'pronto' },
    { estado: 'pronto' },
    { estado: 'convertendo' },
    { estado: 'feito', url: 'blob:1' },
    { estado: 'feito', url: 'blob:2', baixado: true },
    { estado: 'feito' }, // salvo direto na pasta
    { estado: 'erro' },
    { estado: 'cancelado' },
  ]
  assert.deepEqual(pendenciasConverter(fila), { n: 3, dica: '2 vídeos esperando Converter · 1 vídeo pronto para baixar' })
  // durante a conversão a fila não espera a pessoa
  assert.deepEqual(pendenciasConverter(fila, { rodando: true }), { n: 1, dica: '1 vídeo pronto para baixar' })
  assert.equal(pendenciasConverter([{ estado: 'feito', url: 'a' }, { estado: 'feito', url: 'b' }]).dica, '2 vídeos prontos para baixar')
})

test('número do balão: até 99, depois 99+', () => {
  assert.equal(rotuloBalao(1), '1')
  assert.equal(rotuloBalao(99), '99')
  assert.equal(rotuloBalao(120), '99+')
})
