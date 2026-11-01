// Marcadores que fazem coisas (src/marcadores.js): cor e nota, deslocar, seções, notas coladas, SRT, CSV, capítulos do
// YouTube, conferência e tirar a seção da linha.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fpsDe } from '../src/tempo.js'
import { linhaInicial, duracao, dividir, acelerar } from '../src/linha.js'
import { novoProjeto } from '../src/projeto.js'
import {
  capitulosYoutube,
  conferir,
  cortarEm,
  deslocarMarcadores,
  editarMarcadores,
  importar,
  lerCsv,
  lerEntrada,
  lerNotas,
  lerSrt,
  lerTempo,
  marcar,
  marcarClipes,
  paraCsv,
  removerMarcadores,
  secaoEm,
  secoes,
  tirarSecoes,
} from '../src/marcadores.js'

const F25 = fpsDe(25)
const F2997 = fpsDe(29.97)

function projeto(segundos = 120, fps = 25) {
  const p = novoProjeto({ id: 'p', nome: 'Review', fps, midias: [{ id: 'm1', nome: 'entrevista.mov', duracao: segundos, fps, largura: 1920, altura: 1080, temVideo: true, temAudio: true }] })
  return p
}

test('marcar: cor e nota limpas, um por quadro, editar e remover', () => {
  let p = projeto()
  const a = marcar(p, 250, { nome: '  Intro  ', nota: 'Cold\nopen', cor: 'azul' })
  p = a.projeto
  assert.deepEqual(p.marcadores[0], { id: a.id, q: 250, nome: 'Intro', nota: 'Cold open', cor: 'azul' })
  // o mesmo quadro: nada muda e devolve o id que já estava
  const b = marcar(p, 250.2, { nome: 'outro' })
  assert.equal(b.projeto, p)
  assert.equal(b.id, a.id)
  // cor inventada não entra
  p = marcar(p, 100, { nome: 'B', cor: 'magenta' }).projeto
  assert.equal(p.marcadores[0].q, 100)
  assert.equal(p.marcadores[0].cor, undefined)
  p = editarMarcadores(p, a.id, { cor: 'rosa', nota: '' })
  assert.equal(p.marcadores[1].cor, 'rosa')
  assert.equal('nota' in p.marcadores[1], false)
  assert.equal(editarMarcadores(p, a.id, { cor: 'rosa' }), p, 'sem mudança, o mesmo projeto')
  p = removerMarcadores(p, [a.id])
  assert.deepEqual(
    p.marcadores.map((m) => m.q),
    [100],
  )
})

test('deslocar: anda junto, não passa da linha e não cai em cima de outro', () => {
  let p = projeto(10)
  const ids = []
  for (const q of [10, 20, 30]) {
    const r = marcar(p, q)
    p = r.projeto
    ids.push(r.id)
  }
  let r = deslocarMarcadores(p, [ids[0], ids[1]], 10)
  assert.equal(r.movidos, 0, 'o de 20 iria para 30 (ocupado pelo que não anda); o de 10 também fica, porque 20 não sai')
  assert.deepEqual(
    r.projeto.marcadores.map((m) => m.q),
    [10, 20, 30],
  )
  r = deslocarMarcadores(p, ids, 5)
  assert.deepEqual(
    r.projeto.marcadores.map((m) => m.q),
    [15, 25, 35],
  )
  r = deslocarMarcadores(p, ids, -100)
  assert.equal(r.movidos, 1, 'só o primeiro cabe no 0; os outros não cairiam em cima dele')
  r = deslocarMarcadores(p, [ids[2]], 10_000)
  assert.equal(r.projeto.marcadores.at(-1).q, duracao(p.linha) - 1)
})

test('seções: cada marcador até o próximo; fora da linha não abre seção', () => {
  let p = projeto(60)
  for (const [q, nome] of [
    [0, 'Cold open'],
    [225, 'Unboxing'],
    [900, 'Teste'],
  ])
    p = marcar(p, q, { nome }).projeto
  p = { ...p, marcadores: [...p.marcadores, { id: 'x', q: 99_999, nome: 'Perdido' }] }
  const ss = secoes(p)
  assert.deepEqual(
    ss.map((s) => [s.marcador.nome, s.ini, s.fim, s.n]),
    [
      ['Cold open', 0, 225, 1],
      ['Unboxing', 225, 900, 2],
      ['Teste', 900, 1500, 3],
    ],
  )
  assert.equal(secaoEm(p, 300).marcador.nome, 'Unboxing')
  assert.equal(conferir(p).find((c) => c.tipo === 'fora').ids[0], 'x')
})

test('tempo escrito: timecode, h:m:s, m:s, decimal e segundos', () => {
  assert.equal(lerTempo('00:00:12:05', F25), 12 * 25 + 5)
  assert.equal(lerTempo('01:00:00;00', F2997), 3600 * 30)
  assert.equal(lerTempo('1:02:03', F25), (3600 + 120 + 3) * 25)
  assert.equal(lerTempo('2:03', F25), 123 * 25)
  assert.equal(lerTempo('0:12.5', F25), Math.round(12.5 * 25))
  assert.equal(lerTempo('75,5', F25), Math.round(75.5 * 25))
  for (const ruim of ['', 'abc', '1:75', '00:00:12:30', '12:60']) assert.equal(lerTempo(ruim, F25), null, ruim)
})

test('notas coladas: revisão do cliente, capítulos e comentários com várias linhas', () => {
  const texto = `Notas do cliente
00:12 Logo pequeno demais
[0:26] Corrigir a cor neste plano
  e checar o branco
(0:57) - Música alta aqui
1:30 – Pôr a lower third
01:00:12:05 | Ana: trocar a trilha
sem tempo nenhum`
  const n = lerNotas(texto, F25)
  assert.deepEqual(
    n.map((x) => x.q),
    [12 * 25, 26 * 25, 57 * 25, 90 * 25, 3612 * 25 + 5],
  )
  assert.equal(n[1].texto, 'Corrigir a cor neste plano e checar o branco')
  assert.equal(n[2].texto, 'Música alta aqui')
  assert.equal(n[4].texto, 'Ana: trocar a trilha sem tempo nenhum', 'linha sem tempo continua a nota anterior')
  // capítulos do YouTube voltam como marcadores
  const caps = lerEntrada('0:00 Intro\n0:09 Unboxing\n1:41 Veredito', F25)
  assert.equal(caps.tipo, 'notas')
  assert.deepEqual(
    caps.itens.map((i) => [i.q, i.nome]),
    [
      [0, 'Intro'],
      [225, 'Unboxing'],
      [101 * 25, 'Veredito'],
    ],
  )
  // texto longo: nome curto e a nota inteira
  const longo = lerEntrada('0:05 Este plano está escuro demais e o logo da marca aparece cortado no canto', F25).itens[0]
  assert.match(longo.nome, /…$/)
  assert.ok(longo.nome.length <= 41)
  assert.match(longo.nota, /cortado no canto$/)
})

test('SRT e CSV (com e sem cabeçalho, ponto e vírgula, aspas e cor do Premiere)', () => {
  const s = lerSrt('1\n00:00:01,500 --> 00:00:03,000\n<i>Olá</i>\nmundo\n\n2\n00:01:00,000 --> 00:01:02,000\nTchau\n', F25)
  assert.deepEqual(s, [
    { q: Math.round(1.5 * 25), texto: 'Olá mundo' },
    { q: 1500, texto: 'Tchau' },
  ])
  assert.equal(lerEntrada('1\n00:00:01,500 --> 00:00:03,000\nOi\n', F25).tipo, 'srt')
  const c = lerCsv('Tempo;Nome;Comentário;Cor\n00:00:02:00;Intro;"Frio; ""seco""";Cerulean\n0:09;Unboxing;;roxo\nxx;ruim;;\n', F25)
  assert.deepEqual(c, [
    { q: 50, nome: 'Intro', nota: 'Frio; "seco"', cor: 'azul' },
    { q: 225, nome: 'Unboxing', nota: '', cor: 'roxo' },
  ])
  const semCab = lerCsv('0:01,A,nota a\n0:02,B,', F25)
  assert.deepEqual(
    semCab.map((x) => [x.q, x.nome, x.nota]),
    [
      [25, 'A', 'nota a'],
      [50, 'B', ''],
    ],
  )
})

test('importar: cor única, junta a nota no mesmo quadro e conta o que ficou fora', () => {
  let p = projeto(30)
  p = marcar(p, 300, { nome: 'Já tinha' }).projeto
  const r = importar(
    p,
    [
      { q: 25, nome: 'Logo', nota: '', cor: null },
      { q: 300, nome: 'Música alta', nota: '', cor: null },
      { q: 10_000, nome: 'Depois do fim', nota: '', cor: null },
    ],
    { cor: 'rosa' },
  )
  assert.deepEqual([r.novos, r.juntos, r.fora], [1, 1, 1])
  assert.equal(r.projeto.marcadores[0].cor, 'rosa')
  assert.equal(r.projeto.marcadores[1].nota, 'Música alta')
  assert.equal(r.projeto.marcadores[1].nome, 'Já tinha')
  // importar de novo não duplica a nota
  assert.equal(importar(r.projeto, [{ q: 300, nome: 'Música alta', nota: '', cor: null }]).juntos, 0)
})

test('capítulos do YouTube: 0:00 obrigatório, pelo menos 3, cada um com 10 s', () => {
  let p = projeto(120)
  for (const [q, nome] of [
    [5 * 25, 'Unboxing'],
    [60 * 25, 'Teste'],
    [65 * 25, 'Veredito'],
  ])
    p = marcar(p, q, { nome }).projeto
  const c = capitulosYoutube(p)
  assert.equal(c.texto, '0:00 Início\n0:05 Unboxing\n1:00 Teste\n1:05 Veredito')
  assert.equal(c.problemas.length, 1)
  assert.match(c.problemas[0], /menos de 10 s: Início, Teste/)
  const poucos = capitulosYoutube(marcar(projeto(120), 0, { nome: 'Tudo' }).projeto)
  assert.match(poucos.problemas[0], /pelo menos 3/)
  // passa de uma hora: h:mm:ss
  let longo = projeto(4000)
  for (const [q, nome] of [
    [0, 'A'],
    [1800 * 25, 'B'],
    [3700 * 25, 'C'],
  ])
    longo = marcar(longo, q, { nome }).projeto
  assert.equal(capitulosYoutube(longo).texto, '0:00 A\n30:00 B\n1:01:40 C')
})

test('CSV de saída volta pelo leitor', () => {
  let p = projeto(60)
  p = marcar(p, 50, { nome: 'Intro, "frio"', nota: 'linha; com separador', cor: 'verde' }).projeto
  p = marcar(p, 500, { nome: 'Fim' }).projeto
  const csv = paraCsv(p)
  assert.match(csv, /^Tempo,Nome,Nota,Cor,Duração\n00:00:02:00,"Intro, ""frio""","linha; com separador",verde,00:00:18:00\n/)
  const volta = lerCsv(csv, p.fps)
  assert.deepEqual(
    volta.map((x) => [x.q, x.nome, x.nota, x.cor]),
    [
      [50, 'Intro, "frio"', 'linha; com separador', 'verde'],
      [500, 'Fim', '', null],
    ],
  )
})

test('marcar pelos clipes: etiqueta ou nome da mídia, com a cor do clipe (ou a da mídia)', () => {
  let p = projeto(60)
  let linha = dividir(dividir(p.linha, 250), 900)
  linha = { ...linha, clipes: linha.clipes.map((c, i) => (i === 1 ? { ...c, etiqueta: 'B-roll', cor: 'menta' } : c)) }
  p = { ...p, linha }
  const r = marcarClipes(p)
  assert.equal(r.novos, 3)
  assert.deepEqual(
    r.projeto.marcadores.map((m) => [m.q, m.nome, m.cor ?? null]),
    [
      [0, 'entrevista', 'azul'],
      [250, 'B-roll', 'menta'],
      [900, 'entrevista', 'azul'],
    ],
  )
  assert.equal(marcarClipes(p, { soEtiquetados: true }).novos, 1)
})

test('tirar a seção: fecha o buraco, leva os marcadores de depois e some com os de dentro', () => {
  let p = projeto(60) // 1500 quadros
  const ids = {}
  for (const [q, nome] of [
    [0, 'Intro'],
    [250, 'Erro'],
    [400, 'Teste'],
    [1000, 'Erro'],
    [1100, 'Fim'],
  ]) {
    const r = marcar(p, q, { nome })
    p = r.projeto
    ids[`${nome}${q}`] = r.id
  }
  const r = tirarSecoes(p, [ids.Erro250, ids.Erro1000])
  assert.equal(r.tirados, 150 + 100)
  assert.equal(duracao(r.projeto.linha), 1500 - 250)
  assert.deepEqual(
    r.projeto.marcadores.map((m) => [m.nome, m.q]),
    [
      ['Intro', 0],
      ['Teste', 250],
      ['Fim', 850],
    ],
  )
  // a imagem depois do corte é a mesma: o quadro 250 da nova linha é o 400 da mídia
  const c = r.projeto.linha.clipes
  assert.deepEqual(
    c.map((x) => [x.ini, x.fim]),
    [
      [0, 250],
      [400, 1000],
      [1100, 1500],
    ],
  )
})

test('cortar em câmera lenta: o trecho fecha no quadro de origem mais perto', () => {
  // metade da velocidade no clipe inteiro: 500 quadros de origem viram 1000 na linha
  const base = linhaInicial([{ id: 'm1', quadros: 500 }])
  const lenta = acelerar(base, base.clipes[0].id, [
    [0, 0.5],
    [1, 0.5],
  ])
  const n = duracao(lenta)
  assert.ok(Math.abs(n - 1000) <= 4, `tamanho ${n}`)
  const c = cortarEm(lenta, Math.round(n / 4), Math.round(n / 2))
  assert.equal(c.ids.length, 1)
  assert.ok(Math.abs(c.ini - n / 4) <= 2 && Math.abs(c.fim - n / 2) <= 2, `${c.ini}–${c.fim} perto de ${n / 4}–${n / 2}`)
})
