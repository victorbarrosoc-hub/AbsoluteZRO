// Peças (src/pecas.js): uma edição longa vira várias curtas, em vários formatos, com nome pelo modelo e margem; e as
// seções voltam juntas em outra ordem. A edição original nunca muda.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { duracao, dividir } from '../src/linha.js'
import { novoProjeto, palavrasNaLinha, comTranscricao } from '../src/projeto.js'
import { marcar } from '../src/marcadores.js'
import { adicionarSom, colocarEfeito, efeitosNaLinha } from '../src/efeitos.js'
import { FORMATOS_PECA, juntarSecoes, MODELO_PADRAO, nomeDaPeca, nomeSeguro, planoDePecas, projetoDaPeca, relatorio } from '../src/pecas.js'
import { secoes } from '../src/marcadores.js'
import { pacote } from '../src/exportar/index.js'
import { PRESET } from './apoio.js'

// 1500 quadros (60 s a 25 qps) com seções Cold open (0–225), Unboxing (225–900) e Veredito (900–1500)
function review() {
  let p = novoProjeto({ id: 'rev', nome: 'Product Review', fps: 25, midias: [{ id: 'm1', nome: 'review.mov', duracao: 60, fps: 25, largura: 1920, altura: 1080, temVideo: true, temAudio: true }] })
  for (const [q, nome] of [
    [0, 'Cold open'],
    [225, 'Unboxing'],
    [900, 'Veredito'],
  ])
    p = marcar(p, q, { nome, cor: 'amarelo' }).projeto
  return p
}

test('nome pelo modelo: número, seção, formato e duração; sempre seguro para arquivo', () => {
  assert.equal(nomeDaPeca(MODELO_PADRAO, { n: 1, nome: 'Cold open', formato: '9x16', segundos: 9 }), '01_Cold open_9x16')
  assert.equal(nomeDaPeca(MODELO_PADRAO, { n: 2, nome: 'Unboxing', formato: 'original' }), '02_Unboxing', 'formato original não deixa sobra')
  assert.equal(nomeDaPeca('{projeto} - {nome} ({duracao})', { n: 3, nome: 'Veredito', projeto: 'Review', segundos: 75 }), 'Review - Veredito (1m15s)')
  assert.equal(nomeDaPeca('corte', { n: 4, nome: 'x' }), '04_corte', 'sem {n} nem {nome}, o número entra na frente')
  assert.equal(nomeSeguro('a/b:c*?"<>|d'), 'a b c d')
  assert.equal(nomeSeguro(''), 'peca')
})

test('projeto da peça: só a seção, marcadores trazidos para o começo e a edição original intacta', () => {
  const p = review()
  const antes = JSON.stringify(p)
  const s = secoes(p)[1]
  const { projeto: q, ini, fim } = projetoDaPeca(p, s)
  assert.equal(duracao(q.linha), 675)
  assert.deepEqual([ini, fim], [225, 900])
  assert.deepEqual(
    q.linha.clipes.map((c) => [c.ini, c.fim]),
    [[225, 900]],
  )
  assert.deepEqual(
    q.marcadores.map((m) => [m.nome, m.q]),
    [['Unboxing', 0]],
  )
  assert.equal(q.nome, 'Unboxing')
  assert.equal(JSON.stringify(p), antes, 'o projeto original não muda')
  // margem dos dois lados, sem passar da linha
  const m = projetoDaPeca(p, s, { margem: 50 })
  assert.deepEqual([m.ini, m.fim], [175, 950])
  assert.deepEqual(
    m.projeto.marcadores.map((k) => [k.nome, k.q]),
    [['Unboxing', 50]],
  )
  const ultima = projetoDaPeca(p, secoes(p)[2], { margem: 9999 })
  assert.deepEqual([ultima.ini, ultima.fim], [0, 1500])
})

test('formatos: 9:16 e 1:1 preenchem o quadro (escala de cobrir), 16:9 fica como está', () => {
  const p = review()
  const s = secoes(p)[0]
  const v = projetoDaPeca(p, s, { formato: '9x16' }).projeto
  assert.deepEqual([v.largura, v.altura], [1080, 1920])
  const k = (1920 / 1080) ** 2
  assert.ok(Math.abs(v.linha.clipes[0].ajustes.escala - k) < 1e-3, `escala ${v.linha.clipes[0].ajustes.escala} ≈ ${k}`)
  const q = projetoDaPeca(p, s, { formato: '1x1' }).projeto
  assert.ok(Math.abs(q.linha.clipes[0].ajustes.escala - 1920 / 1080) < 1e-3)
  const h = projetoDaPeca(p, s, { formato: '16x9' }).projeto
  assert.equal(h.linha.clipes[0].ajustes, undefined)
  // zoom já maior que o de cobrir fica
  const zoom = { ...p, linha: { ...p.linha, clipes: p.linha.clipes.map((c) => ({ ...c, ajustes: { escala: 5 } })) } }
  assert.equal(projetoDaPeca(zoom, s, { formato: '9x16' }).projeto.linha.clipes[0].ajustes.escala, 5)
  assert.deepEqual(
    FORMATOS_PECA.map((f) => f.id),
    ['original', '16x9', '9x16', '1x1', '4x5'],
  )
})

test('plano: seções × formatos, nomes únicos mesmo com seções de nome igual', () => {
  let p = review()
  p = marcar(p, 1200, { nome: 'Veredito' }).projeto
  const plano = planoDePecas(p, { formatos: ['original', '9x16'], modelo: '{nome}' })
  assert.equal(plano.length, 8)
  assert.deepEqual(
    plano.map((x) => x.nome),
    ['Cold open', 'Cold open (2)', 'Unboxing', 'Unboxing (2)', 'Veredito', 'Veredito (2)', 'Veredito (3)', 'Veredito (4)'],
  )
  const so = planoDePecas(p, { ids: [p.marcadores[1].id] })
  assert.equal(so.length, 1)
  assert.equal(so[0].nome, '02_Unboxing')
  const csv = relatorio(p, [
    { peca: so[0], arquivos: ['02_Unboxing.mp4'], ok: true },
    { peca: plano[0], arquivos: [], ok: false, erro: 'cancelado' },
  ])
  assert.match(csv, /^Peça,Seção,Formato,Entrada,Saída,Duração,Arquivos,Situação\n02_Unboxing,Unboxing,Original,00:00:09:00,00:00:36:00,00:00:27:00,02_Unboxing.mp4,pronto\n/)
  assert.match(csv, /falhou: cancelado/)
})

test('a peça leva a legenda, o efeito sonoro e exporta para os editores', () => {
  let p = review()
  // uma palavra no Unboxing (10 s) e outra no Veredito (40 s)
  p = comTranscricao(p, 'm1', {
    idioma: 'pt',
    palavras: [
      { texto: ' caixa', ini: 10, fim: 10.5 },
      { texto: ' nota', ini: 40, fim: 40.5 },
    ],
  })
  const som = adicionarSom(p, { nome: 'whoosh.wav', duracao: 1, origem: { tipo: 'arquivo' } })
  p = colocarEfeito(som.projeto, som.id, 300).projeto
  const peca = planoDePecas(p, { ids: [p.marcadores[1].id] })[0].projeto
  assert.deepEqual(
    palavrasNaLinha(peca).map((w) => [w.texto.trim(), Math.round(w.ini * 100) / 100]),
    [['caixa', 1]],
  )
  assert.deepEqual(
    efeitosNaLinha(peca).map((x) => x.inicio),
    [75],
  )
  const arquivos = pacote(peca, PRESET.legenda, new Date('2026-11-01T12:00:00Z'), ['xmeml', 'fcpxml'])
  assert.ok(arquivos.some((a) => a.name.endsWith('.xml')))
  assert.ok(arquivos.some((a) => a.name.endsWith('.srt')))
})

test('juntar: as seções em outra ordem numa linha nova, com os marcadores junto', () => {
  const p = review()
  const [a, b, c] = p.marcadores.map((m) => m.id)
  const j = juntarSecoes(p, [c, a, b, a])
  assert.equal(duracao(j.linha), 1500)
  assert.deepEqual(
    j.linha.clipes.map((x) => [x.ini, x.fim]),
    [
      [900, 1500],
      [0, 225],
      [225, 900],
    ],
  )
  assert.deepEqual(
    j.marcadores.map((m) => [m.nome, m.q]),
    [
      ['Veredito', 0],
      ['Cold open', 600],
      ['Unboxing', 825],
    ],
  )
  assert.equal(new Set(j.linha.clipes.map((x) => x.id)).size, 3, 'ids únicos')
  // seção que passa por dois clipes
  const dois = { ...p, linha: dividir(p.linha, 500) }
  const k = juntarSecoes(dois, [b])
  assert.deepEqual(
    k.linha.clipes.map((x) => [x.ini, x.fim]),
    [
      [225, 500],
      [500, 900],
    ],
  )
})
