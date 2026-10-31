// Faixa de efeitos: sons do projeto, efeitos presos à imagem, momentos de corte e créditos de licença.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acelerar, aparar, dividir, mover, remover } from '../src/linha.js'
import { abrir, novoProjeto, removerMidia, salvar } from '../src/projeto.js'
import { adicionarSom, ajustarEfeito, colocarEfeito, creditos, efeitosNaLinha, faixas, foraDaLinha, misturarEfeitos, momentos, moverEfeito, removerEfeitos, removerSons } from '../src/efeitos.js'

// duas mídias de 10 s a 30 fps: linha de 600 quadros
const base = () =>
  novoProjeto({
    id: 'p1',
    fps: 30,
    midias: [
      { id: 'm1', nome: 'a.mp4', duracao: 10, fps: 30, temVideo: true, temAudio: true },
      { id: 'm2', nome: 'b.mp4', duracao: 10, fps: 30, temVideo: true, temAudio: true },
    ],
  })
const WHOOSH = { id: 'whoosh', nome: 'whoosh.wav', duracao: 1, origem: { tipo: 'openverse', titulo: 'Whoosh rápido', autor: 'Ana', licenca: 'CC BY 4.0', url: 'https://openverse.org/audio/x' } }
const MEU = { id: 'meu', nome: 'impacto.wav', duracao: 0.5, caminho: '/sons/impacto.wav' }

test('projeto novo e projeto antigo abrem com a faixa de efeitos vazia', () => {
  const p = base()
  assert.deepEqual(p.sons, [])
  assert.deepEqual(p.efeitos, [])
  const antigo = JSON.parse(salvar(p))
  delete antigo.sons
  delete antigo.efeitos
  const a = abrir(JSON.stringify(antigo))
  assert.deepEqual([a.sons, a.efeitos], [[], []])
})

test('som entra uma vez, com origem; sem duração ou longo demais é recusado', () => {
  let { projeto: p, id } = adicionarSom(base(), MEU)
  assert.equal(id, 'meu')
  assert.equal(p.sons[0].origem.tipo, 'arquivo')
  assert.equal(adicionarSom(p, MEU).projeto, p)
  assert.throws(() => adicionarSom(p, { nome: 'x.wav' }), /duração/)
  assert.throws(() => adicionarSom(p, { nome: 'x.wav', duracao: 601 }), /trilha/)
  assert.throws(() => adicionarSom(p, { nome: 'x.wav', duracao: 1, origem: { tipo: 'desconhecida' } }), /Origem/)
})

test('o efeito se prende à imagem: corte antes dele, mover e aparar levam o efeito junto', () => {
  let p = adicionarSom(base(), WHOOSH).projeto
  // no começo da segunda mídia (quadro 300 da linha)
  const r = colocarEfeito(p, 'whoosh', 300)
  p = r.projeto
  assert.deepEqual(efeitosNaLinha(p).map((x) => [x.inicio, x.quadros]), [[300, 30]])
  assert.equal(p.efeitos[0].midia, 'm2')
  assert.equal(p.efeitos[0].fonte, 0)
  // corta 1 s da primeira mídia: o efeito anda junto
  p = { ...p, linha: aparar(p.linha, p.linha.clipes[0].id, 'fim', -30) }
  assert.equal(efeitosNaLinha(p)[0].inicio, 270)
  // a segunda mídia vai para o começo
  p = { ...p, linha: mover(p.linha, p.linha.clipes[1].id, 0) }
  assert.equal(efeitosNaLinha(p)[0].inicio, 0)
  // dividir não solta o efeito
  p = { ...p, linha: dividir(p.linha, 150) }
  assert.equal(efeitosNaLinha(p)[0].inicio, 0)
})

test('trecho cortado tira o efeito da linha (fica guardado); volta com o trecho', () => {
  let p = adicionarSom(base(), WHOOSH).projeto
  p = colocarEfeito(p, 'whoosh', 450).projeto
  const antes = p
  p = { ...p, linha: remover(p.linha, p.linha.clipes[1].id) }
  assert.deepEqual(efeitosNaLinha(p), [])
  assert.equal(foraDaLinha(p).length, 1)
  assert.equal(efeitosNaLinha(antes)[0].inicio, 450)
})

test('o efeito acaba junto com o vídeo, não estica a linha', () => {
  let p = adicionarSom(base(), { ...WHOOSH, duracao: 5 }).projeto
  p = colocarEfeito(p, 'whoosh', 590).projeto
  assert.deepEqual(efeitosNaLinha(p).map((x) => [x.inicio, x.quadros]), [[590, 10]])
  // depois do fim da linha: preso ao último quadro
  p = colocarEfeito(p, 'whoosh', 5000).projeto
  assert.equal(efeitosNaLinha(p).at(-1).inicio, 599)
})

test('mover, volume com limite, remover efeito e remover som levam os efeitos', () => {
  let p = adicionarSom(adicionarSom(base(), WHOOSH).projeto, MEU).projeto
  let r = colocarEfeito(p, 'whoosh', 30, { volume: -6 })
  p = r.projeto
  const id = r.id
  p = colocarEfeito(p, 'meu', 60).projeto
  p = moverEfeito(p, id, 330)
  assert.deepEqual(efeitosNaLinha(p).map((x) => [x.som.id, x.inicio, x.efeito.volume]), [['meu', 60, 0], ['whoosh', 330, -6]])
  assert.equal(ajustarEfeito(p, id, { volume: 40 }).efeitos.find((e) => e.id === id).volume, 12)
  assert.equal(ajustarEfeito(p, id, { volume: -6 }), p)
  assert.deepEqual(efeitosNaLinha(removerEfeitos(p, id)).map((x) => x.som.id), ['meu'])
  const sem = removerSons(p, 'whoosh')
  assert.deepEqual([sem.sons.map((s) => s.id), sem.efeitos.map((e) => e.som)], [['meu'], ['meu']])
  // som que não existe ou linha vazia: nada a prender
  assert.equal(colocarEfeito(p, 'nada', 10).id, null)
})

test('tirar a mídia tira os efeitos presos a ela', () => {
  let p = adicionarSom(base(), WHOOSH).projeto
  p = colocarEfeito(p, 'whoosh', 10).projeto
  p = colocarEfeito(p, 'whoosh', 310).projeto
  p = removerMidia(p, 'm1')
  assert.deepEqual(p.efeitos.map((e) => e.midia), ['m2'])
})

test('faixas: efeitos que se sobrepõem vão para faixas diferentes, o resto divide a mesma', () => {
  let p = adicionarSom(base(), WHOOSH).projeto
  for (const q of [0, 10, 40, 45]) p = colocarEfeito(p, 'whoosh', q).projeto
  assert.deepEqual(faixas(p).map((f) => f.map((x) => x.inicio)), [[0, 40], [10, 45]])
})

test('momentos: cortes entre clipes e marcadores, sem repetir quadro', () => {
  let p = base()
  p = { ...p, linha: dividir(p.linha, 120), marcadores: [{ id: 'k1', q: 300, nome: 'Logo' }, { id: 'k2', q: 500, nome: '' }] }
  assert.deepEqual(momentos(p), [
    { q: 120, tipo: 'corte', nome: 'Corte 1' },
    { q: 300, tipo: 'marcador', nome: 'Logo' },
    { q: 500, tipo: 'marcador', nome: 'Marcador' },
  ])
})

test('créditos: só sons de fora (nem do computador nem do banco da pessoa) que estão na linha, um por som, na ordem', () => {
  let p = adicionarSom(adicionarSom(base(), WHOOSH).projeto, MEU).projeto
  p = adicionarSom(p, { id: 'gerado', nome: 'riser.mp3', duracao: 2, origem: { tipo: 'elevenlabs', titulo: 'Riser para abertura' } }).projeto
  p = adicionarSom(p, { id: 'drive', nome: 'clique.wav', duracao: 0.2, origem: { tipo: 'banco', id: '1Clique', titulo: 'clique' } }).projeto
  p = colocarEfeito(p, 'meu', 0).projeto
  p = colocarEfeito(p, 'drive', 50).projeto
  p = colocarEfeito(p, 'whoosh', 100).projeto
  p = colocarEfeito(p, 'whoosh', 200).projeto
  p = colocarEfeito(p, 'gerado', 300).projeto
  assert.deepEqual(creditos(p), ['"Whoosh rápido" por Ana · CC BY 4.0 · https://openverse.org/audio/x', '"Riser para abertura" · gerado com ElevenLabs'])
})

test('mistura do render: o efeito entra na amostra exata, com o volume, atravessa trechos e não passa de ±1', () => {
  const buffer = (n, taxa = 1000, v = 0) => {
    const c = [new Float32Array(n).fill(v), new Float32Array(n).fill(v)]
    return { sampleRate: taxa, length: n, numberOfChannels: 2, getChannelData: (i) => c[i] }
  }
  let p = adicionarSom(base(), { ...WHOOSH, duracao: 0.5 }).projeto
  // efeito no quadro 15 (0,5 s) a -6 dB, som de 0,5 s com valor 1 (mono: o canal único vai nos dois lados)
  p = colocarEfeito(p, 'whoosh', 15, { volume: -6 }).projeto
  const som = { sampleRate: 1000, length: 500, numberOfChannels: 1, getChannelData: () => new Float32Array(500).fill(1) }
  const fx = new Map([['whoosh', som]])
  const x = efeitosNaLinha(p)
  // trecho [0, 0,6 s): o efeito começa em 500 e vai até o fim (100 amostras)
  const a = buffer(600)
  misturarEfeitos(a, x, fx, 0, p.fps)
  assert.equal(a.getChannelData(0)[499], 0)
  assert.ok(Math.abs(a.getChannelData(1)[500] - 0.501) < 0.001)
  // trecho seguinte [0,6 s, 1,2 s): continua de onde parou e acaba em 1,0 s
  const b = buffer(600, 1000, 0.8)
  misturarEfeitos(b, x, fx, 0.6, p.fps)
  assert.equal(b.getChannelData(0)[0], 1, 'limitado em 1')
  assert.ok(Math.abs(b.getChannelData(0)[400] - 0.8) < 1e-6, 'acabou no fim do som')
})

test('com speed ramp o efeito segue a curva contínua da prévia: colocar em q cai em q, e acelerar depois leva o efeito com a imagem', () => {
  let p = adicionarSom(base(), WHOOSH).projeto
  // rampa: rápido no começo, câmera lenta no meio, rápido no fim (a "Herói")
  const heroi = [[0, 2], [0.3, 2], [0.44, 0.25], [0.6, 0.25], [0.74, 2], [1, 2]]
  p = { ...p, linha: acelerar(p.linha, p.linha.clipes[0].id, heroi) }
  for (const q of [0, 17, 60, 95, 140, 200]) {
    const r = colocarEfeito(p, 'whoosh', q).projeto
    assert.equal(efeitosNaLinha(r)[0].inicio, q, `q ${q}`)
  }
  // em câmera lenta a origem fica fracionária (vários quadros da linha no mesmo quadro de origem)
  const lento = colocarEfeito(p, 'whoosh', 95).projeto.efeitos[0]
  assert.ok(!Number.isInteger(lento.fonte))
  // efeito posto sem velocidade; depois o clipe acelera a 200%: o efeito anda junto com a imagem
  let q = adicionarSom(base(), WHOOSH).projeto
  q = colocarEfeito(q, 'whoosh', 100).projeto
  q = { ...q, linha: acelerar(q.linha, q.linha.clipes[0].id, [[0, 2], [1, 2]]) }
  assert.equal(efeitosNaLinha(q)[0].inicio, 50)
})
