// Análise da sequência montada (app/js/montagem-sfx.js) e biblioteca de SFX (desktop/sfx-biblioteca.cjs).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tc, pontosDaSequencia, picosDoSinal, picosNaSequencia, palavras, indexar, sugerir, sugerirTodos, pedidoSfx } from '../app/js/montagem-sfx.js'
import { wav } from '../app/js/sync/synth.js'

const require = createRequire(import.meta.url)
const { Biblioteca, duracaoWav } = require('../desktop/sfx-biblioteca.cjs')

const LINHA = {
  nome: 'Clipe · montagem final',
  fps: 24,
  quadros: 24 * 30,
  video: [
    [
      { nome: 'A001.mov', inicio: 0, fim: 120 },
      { nome: 'A002.mov', inicio: 120, fim: 300 },
      { nome: 'A003.mov', inicio: 300, fim: 720 },
    ],
    [{ nome: 'Drone.mp4', inicio: 480, fim: 600 }],
  ],
  audio: [[{ nome: 'Musica.wav', inicio: 0, fim: 720, entrada: 48, arquivo: '/hd/Musica.wav' }]],
}

test('timecode a partir do começo da sequência', () => {
  assert.equal(tc(0, 24), '00:00:00:00')
  assert.equal(tc(24 * 61 + 5, 24), '00:01:01:05')
  assert.equal(tc(30 * 3600, 29.97), '01:00:00:00')
})

test('pontos: começo, cada corte (em qualquer faixa), picos e fim; colados viram um', () => {
  const p = pontosDaSequencia(LINHA, [
    { quadro: 200, forca: 6, nome: 'Musica.wav' },
    { quadro: 302, forca: 9, nome: 'Musica.wav' }, // colado no corte do A003
    { quadro: 9999, forca: 9 }, // fora da sequência
  ])
  assert.deepEqual(
    p.map((x) => [x.quadro, x.tipo]),
    [[0, 'abertura'], [120, 'corte'], [200, 'impacto'], [300, 'impacto'], [480, 'corte'], [708, 'final']],
  )
  assert.equal(p[3].motivo, 'Corte para A003.mov, com pico de som')
  assert.equal(p[4].motivo, 'Corte para Drone.mp4')
  assert.equal(p[1].tc, '00:00:05:00')
  // pico no quadro exato do corte: o motivo continua dizendo para onde corta
  assert.equal(pontosDaSequencia(LINHA, [{ quadro: 120, forca: 5, nome: 'Musica.wav' }])[1].motivo, 'Corte para A002.mov, com pico de som')
  assert.deepEqual(pontosDaSequencia({ fps: 24, video: [[]] }), [])
})

test('picos de som: salto de energia depois de silêncio, com distância mínima', () => {
  const sr = 4000
  const sig = new Float32Array(sr * 10).fill(0)
  for (let i = 0; i < sig.length; i++) sig[i] = 0.01 * Math.sin(i * 0.3)
  const bate = (seg) => {
    for (let i = 0; i < sr * 0.15; i++) sig[Math.round(seg * sr) + i] = 0.8 * Math.sin(i * 0.9)
  }
  bate(3)
  bate(3.4) // perto demais do anterior: não conta
  bate(7)
  const pk = picosDoSinal(sig, sr)
  assert.deepEqual(pk.map((x) => Math.round(x.t * 10) / 10), [3, 7])
  // levados para a sequência: o clipe começa no quadro 100 e usa o arquivo a partir de 2 s
  const naSeq = picosNaSequencia({ nome: 'X.wav', inicio: 100, fim: 100 + 24 * 3, entrada: 48 }, pk, 24)
  assert.deepEqual(naSeq.map((x) => x.quadro), [124])
})

test('biblioteca: palavras do nome e das pastas, sugestões por tipo e variedade', () => {
  assert.deepEqual(palavras('Whoosh_FastSwipe 03.wav'), ['whoosh', 'fast', 'swipe', 'wav'])
  assert.deepEqual(palavras('Transição/Impacto Grave'), ['transicao', 'impacto', 'grave'])
  const ind = indexar([
    { caminho: '/sfx/Whooshes/Whoosh Fast 01.wav', rel: 'Whooshes/Whoosh Fast 01.wav', duracao: 1.1 },
    { caminho: '/sfx/Whooshes/Whoosh Slow 02.wav', rel: 'Whooshes/Whoosh Slow 02.wav', duracao: 4 },
    { caminho: '/sfx/Transicoes/Air 01.wav', rel: 'Transicoes/Air 01.wav', duracao: 1 },
    { caminho: '/sfx/Impacts/Hit Cinematic.wav', rel: 'Impacts/Hit Cinematic.wav', duracao: 2 },
    { caminho: '/sfx/Risers/Riser Long.wav', rel: 'Risers/Riser Long.wav', duracao: 6 },
    { caminho: '/sfx/Amb/Chuva.wav', rel: 'Amb/Chuva.wav', duracao: 30 },
  ])
  const corte = sugerir({ tipo: 'corte' }, ind)
  assert.equal(corte[0].nome, 'Whoosh Fast 01', 'nome com a palavra e duração certa ganha')
  assert.ok(!corte.some((s) => s.nome === 'Chuva'))
  assert.equal(sugerir({ tipo: 'abertura' }, ind)[0].nome, 'Riser Long')
  assert.equal(sugerir({ tipo: 'impacto' }, ind)[0].nome, 'Hit Cinematic')
  // três cortes seguidos: o mesmo whoosh não se repete em todos
  const todos = sugerirTodos([{ tipo: 'corte' }, { tipo: 'corte' }, { tipo: 'corte' }], ind)
  assert.ok(new Set(todos.map((x) => x.escolhido)).size >= 2)
  // pasta no plural conta como a palavra no singular
  assert.equal(sugerir({ tipo: 'corte' }, indexar([{ caminho: '/s/Whooshes/Air 01.wav', rel: 'Whooshes/Air 01.wav' }]))[0].nome, 'Air 01')
  assert.deepEqual(sugerir({ tipo: 'corte' }, []), [])
})

test('pedido para o DaVinci: marcadores em todos os pontos e os sons escolhidos', () => {
  const pontos = sugerirTodos(pontosDaSequencia(LINHA), indexar([{ caminho: '/sfx/Whoosh.wav', rel: 'Whoosh.wav', duracao: 1.5 }]))
  const so = pedidoSfx(LINHA.nome, pontos, { sons: false })
  assert.equal(so.marcadores.length, pontos.length)
  assert.equal(so.sons.length, 0)
  assert.equal(so.marcadores[1].cor, 'Purple')
  const com = pedidoSfx(LINHA.nome, pontos, { fps: 24 })
  assert.equal(com.linha, 'Clipe · montagem final')
  assert.ok(com.sons.length >= 2)
  assert.deepEqual(com.sons[0], { caminho: '/sfx/Whoosh.wav', quadro: pontos.find((p) => p.escolhido).quadro, quadros: 36 })
})

test('biblioteca no disco: indexa sons das subpastas, ignora o resto e lê a duração dos WAV', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sfx-'))
  const raiz = join(dir, 'Meus SFX')
  mkdirSync(join(raiz, 'Whooshes'), { recursive: true })
  writeFileSync(join(raiz, 'Whooshes', 'Whoosh 01.wav'), wav(new Float32Array(48000 * 1.5), 48000))
  writeFileSync(join(raiz, 'Hit.mp3'), 'x')
  writeFileSync(join(raiz, 'leia-me.txt'), 'x')
  writeFileSync(join(raiz, '.escondido.wav'), 'x')
  assert.equal(await duracaoWav(join(raiz, 'Whooshes', 'Whoosh 01.wav')), 1.5)
  assert.equal(await duracaoWav(join(raiz, 'Hit.mp3')), null)
  const b = new Biblioteca({ stateDir: join(dir, 'dados') })
  const st = await b.indexar(raiz)
  assert.equal(st.total, 2)
  assert.deepEqual(st.arquivos.map((a) => a.rel).sort(), ['Hit.mp3', 'Whooshes/Whoosh 01.wav'])
  assert.ok(b.permitido(join(raiz, 'Hit.mp3')))
  assert.ok(!b.permitido(join(dir, 'outro.wav')))
  // o índice fica guardado
  assert.equal(new Biblioteca({ stateDir: join(dir, 'dados') }).estado().total, 2)
  await assert.rejects(b.indexar(join(dir, 'nao-existe')), /não existe/)
})
