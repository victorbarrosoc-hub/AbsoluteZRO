// O visual do app de computador (0.3.6 a 0.3.9) no celular: as abas Início · Drive · Transferências · Estúdio, o
// Estúdio com Frames · Montagens · Referências no topo e o resumo ao vivo de Transferências (falta, "termina ~hh:mm" e o
// gráfico), com as contas de web/public/app/lib/transferencias.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const T = await import('../web/public/app/lib/transferencias.js')
const ler = (p) => fs.readFile(new URL(`../web/public/app/${p}`, import.meta.url), 'utf8')

test('ao vivo: quanto falta em número grande e unidade pequena, sem cortar', () => {
  assert.deepEqual(T.faltaPartes(30), [['<1', 'min']])
  assert.deepEqual(T.faltaPartes(12 * 60), [['~12', 'min']])
  assert.deepEqual(T.faltaPartes(72 * 60), [['~1', 'h'], ['12', 'min']])
  assert.deepEqual(T.faltaPartes(120 * 60), [['~2', 'h']])
  assert.equal(T.faltaPartes(null), null)
  assert.equal(T.faltaPartes(Infinity), null)
})

test('ao vivo: a hora que termina (e "amanhã" quando passa da meia-noite)', () => {
  const agora = new Date(2026, 10, 6, 18, 40, 0).getTime()
  assert.equal(T.terminaAs(26 * 60, agora), 'termina ~19:06')
  assert.equal(T.terminaAs(30, agora), null)
  assert.equal(T.terminaAs(6 * 3600, agora), 'termina amanhã ~00:40')
})

test('ao vivo: o gráfico de velocidade cabe na caixa e o pico encosta em cima', () => {
  const c = T.caminhoVelocidade([0, 10, 40, 20], 320, 56)
  const ys = [...c.linha.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])])
  assert.equal(ys.length, 4)
  assert.equal(ys[0][0], 0)
  assert.equal(ys[3][0], 320)
  assert.ok(ys.every(([, y]) => y >= 0 && y <= 56))
  assert.equal(Math.min(...ys.map(([, y]) => y)), ys[2][1], 'o pico é o mais alto')
  assert.match(c.area, /Z$/)
  assert.equal(T.caminhoVelocidade([], 320, 56), null)
})

test('abas: Início, Drive, Transferências e Estúdio (Frames · Montagens · Referências), como no computador', async () => {
  const tabs = await ler('components/tabs.js')
  const rotulos = [...tabs.matchAll(/aba\('(\w+)', '\w+', [^,]+, '[\w-]+', '([^']+)'/g)].map((m) => m[2])
  assert.deepEqual(rotulos, ['Início', 'Drive', 'Transferências'])
  assert.match(tabs, /<span class="tab-label">Estúdio<\/span>/)
  assert.doesNotMatch(tabs, /tab-label">(Criar|Referências)</)
  const estudio = await ler('components/estudio.js')
  for (const s of ['Frames', 'Montagens', 'Referências']) assert.match(estudio, new RegExp(`label: '${s}'`))
  // Cartões: no celular, a Calculadora (o backup do cartão é do computador, onde está o leitor)
  const inicio = await ler('components/inicio.js')
  assert.match(inicio, /nome: 'Cartões', sub: 'Calculadora'/)
  // Transferências: o resumo ao vivo no topo, como o "Agora" do computador
  const tr = await ler('components/transferencias.js')
  assert.match(tr, /<\$\{AoVivo\} fila=\$\{fila\} \/>/)
  for (const r of ['Subindo', 'Já passou', 'Falta']) assert.match(tr, new RegExp(`num\\('${r}'`))
})
