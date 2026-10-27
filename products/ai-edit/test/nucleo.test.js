// Núcleo do editor: tempo, linha do tempo, desfazer, silêncio, propostas, legenda e projeto.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fpsDe, paraQuadros, racional, timecode } from '../src/tempo.js'
import { aparar, dividir, duracao, fonteParaLinha, Historico, juntarContinuos, linhaInicial, localizar, mover, remover, removerTrechos } from '../src/linha.js'
import { envelope, niveis, silencios } from '../src/analise/silencio.js'
import { foraDasPalavras, frases, proporCortes, proporZooms, resumo } from '../src/propostas.js'
import { prepararPreset } from '../src/preset.js'
import { abrir, aprovar, editarPalavra, comPropostas, comTranscricao, novoProjeto, numeros, removerMidia, palavrasNaLinha, recusar, salvar } from '../src/projeto.js'
import { agrupar, blocoEm, srt, vtt } from '../src/legenda.js'
import { recorte, transformCss, zoomEm } from '../src/quadro.js'
import { readFileSync } from 'node:fs'
import { pendencias, rotuloBalao } from '../src/pendencias.js'
import { fala, PRESET } from './apoio.js'

test('fps racional, quadros, timecode e tempo do FCPXML', () => {
  assert.deepEqual(fpsDe(29.97), { n: 30000, d: 1001 })
  assert.deepEqual(fpsDe(25), { n: 25, d: 1 })
  assert.deepEqual(fpsDe(23.976), { n: 24000, d: 1001 })
  const f = fpsDe(29.97)
  assert.equal(paraQuadros(10, f), 300)
  assert.equal(timecode(30 * 61 + 5, f), '00:01:01:05')
  assert.equal(racional(1, f), '1001/30000s')
  assert.equal(racional(0, f), '0s')
  assert.equal(racional(50, { n: 25, d: 1 }), '2/1s')
})

test('linha: dividir, remover, mover, aparar e mapear tempo', () => {
  let l = linhaInicial([{ id: 'm1', quadros: 300 }])
  l = dividir(l, 100)
  assert.equal(l.clipes.length, 2)
  assert.equal(dividir(l, 100), l, 'dividir em cima do corte não muda nada')
  l = dividir(l, 200)
  assert.deepEqual(
    l.clipes.map((c) => [c.ini, c.fim]),
    [
      [0, 100],
      [100, 200],
      [200, 300],
    ],
  )
  const meio = l.clipes[1].id
  const semMeio = remover(l, meio)
  assert.equal(duracao(semMeio), 200)
  assert.equal(fonteParaLinha(semMeio, 'm1', 250), 150)
  assert.equal(fonteParaLinha(semMeio, 'm1', 150), null)
  assert.deepEqual(localizar(semMeio, 120).fonte, 220)
  const movido = mover(l, l.clipes[2].id, 0)
  assert.deepEqual(
    movido.clipes.map((c) => c.ini),
    [200, 0, 100],
  )
  const ap = aparar(l, meio, 'ini', 30, 300)
  assert.deepEqual([ap.clipes[1].ini, ap.clipes[1].fim], [130, 200])
  // não passa do fim do clipe nem da mídia
  assert.deepEqual([aparar(l, meio, 'ini', 999).clipes[1].ini], [199])
  assert.equal(aparar(l, l.clipes[2].id, 'fim', 50, 300).clipes[2].fim, 300)
  assert.equal(juntarContinuos(l).clipes.length, 1)
})

test('removerTrechos corta a mídia de origem em vários clipes', () => {
  let l = linhaInicial([
    { id: 'a', quadros: 100 },
    { id: 'b', quadros: 50 },
  ])
  l = removerTrechos(l, 'a', [
    { ini: 10, fim: 20 },
    { ini: 50, fim: 60 },
    { ini: 95, fim: 120 },
  ])
  assert.deepEqual(
    l.clipes.map((c) => [c.midia, c.ini, c.fim]),
    [
      ['a', 0, 10],
      ['a', 20, 50],
      ['a', 60, 95],
      ['b', 0, 50],
    ],
  )
  assert.equal(duracao(l), 125)
})

test('desfazer e refazer guardam as versões com rótulo', () => {
  const h = new Historico({ v: 1 }, 3)
  h.fazer({ v: 2 }, 'corte')
  h.fazer({ v: 3 }, 'zoom')
  assert.equal(h.proximoDesfazer, 'zoom')
  assert.equal(h.desfazer(), 'zoom')
  assert.deepEqual(h.atual, { v: 2 })
  assert.equal(h.refazer(), 'zoom')
  assert.deepEqual(h.atual, { v: 3 })
  h.desfazer()
  h.fazer({ v: 9 }, 'outro')
  assert.equal(h.podeRefazer, false, 'ação nova apaga o refazer')
  for (let i = 0; i < 10; i++) h.fazer({ v: 10 + i })
  assert.equal(h.passado.length, 3, 'limite do histórico')
})

test('silêncio: acha as pausas de uma fala sintética com limiar automático', () => {
  const { pcm, taxa, pausas } = fala()
  const db = envelope(pcm, taxa)
  const n = niveis(db)
  assert.ok(n.voz - n.piso > 20)
  const s = silencios(db, { minS: 0.45 })
  assert.equal(s.length, pausas.length)
  s.forEach((x, i) => {
    assert.ok(Math.abs(x.ini - pausas[i].ini) < 0.03, `início da pausa ${i}`)
    assert.ok(Math.abs(x.fim - pausas[i].fim) < 0.03, `fim da pausa ${i}`)
  })
})

test('propostas de corte: silêncio com folga, respiro entre palavras e nada dentro de palavra', () => {
  const { pcm, taxa, pausas, palavras, respiro } = fala()
  const db = envelope(pcm, taxa)
  const props = proporCortes({ midia: 'm1', db, palavras, preset: PRESET.cortes, duracao: pcm.length / taxa })
  const sil = props.filter((p) => p.tipo === 'silencio')
  const resp = props.filter((p) => p.tipo === 'respiro')
  assert.equal(sil.length, pausas.length)
  for (const [i, p] of sil.entries()) {
    assert.ok(Math.abs(p.ini - (pausas[i].ini + PRESET.cortes.folga_s)) < 0.04)
    assert.match(p.motivo, /sem fala/)
    assert.equal(p.estado, 'pendente')
  }
  assert.equal(resp.length, 1, 'um respiro (ruído entre palavras, acima do limiar)')
  assert.ok(resp[0].ini >= respiro.ini && resp[0].fim <= respiro.fim)
  for (const p of props) for (const w of palavras) assert.ok(p.fim <= w.ini || p.ini >= w.fim, `corte ${p.ini}-${p.fim} pega "${w.texto}"`)
  const r = resumo(props)
  assert.equal(r.pendentes, props.length)
  assert.ok(r.tempoPendente > 1)
})

test('foraDasPalavras encolhe o trecho em volta das palavras', () => {
  const ps = foraDasPalavras(0, 10, [{ ini: 2, fim: 3 }, { ini: 6, fim: 7 }], 0.1)
  assert.deepEqual(ps, [
    { ini: 0, fim: 1.9 },
    { ini: 3.1, fim: 5.9 },
    { ini: 7.1, fim: 10 },
  ])
})

test('zoom: uma frase sim, outra não; exclamação aproxima mais', () => {
  const w = (t, ini, fim) => ({ texto: t, ini, fim })
  const palavras = [w('Primeira', 0, 0.6), w('frase', 0.6, 1.5), w('aqui.', 1.5, 2), w('Segunda', 2.2, 2.8), w('frase', 2.8, 3.5), w('longa.', 3.5, 4.2), w('Que', 4.4, 4.8), w('demais!', 4.8, 6)]
  assert.equal(frases(palavras).length, 3)
  const z = proporZooms({ midia: 'm1', palavras, preset: PRESET.zoom })
  assert.equal(z.length, 2)
  assert.equal(z[0].escala, PRESET.zoom.escala)
  assert.equal(z[1].escala, PRESET.zoom.enfase)
  assert.match(z[1].motivo, /ênfase/)
})

test('quadro: recorte do zoom não sai da imagem e o CSS bate com ele', () => {
  const r = recorte(1920, 1080, { escala: 1.2, foco: { x: 0.95, y: 0.1 } })
  assert.equal(r.sx, 1920 - 1600)
  assert.equal(r.sy, 0)
  assert.equal(transformCss(1920, 1080, { escala: 1, foco: { x: 0.5, y: 0.5 } }), 'none')
  assert.match(transformCss(1920, 1080, { escala: 2, foco: { x: 0.5, y: 0.5 } }), /translate\(-50%, -50%\) scale\(2\)/)
  assert.equal(zoomEm([{ midia: 'a', qIni: 10, qFim: 20, escala: 1.3, foco: { x: 0.5, y: 0.5 } }], 'a', 15).escala, 1.3)
  assert.equal(zoomEm([], 'a', 15).escala, 1)
})

test('projeto: aprovar corta, recusar devolve, desfazer pelo histórico, legenda acompanha a linha', () => {
  const midias = [{ id: 'm1', nome: 'fala.mp4', duracao: 10, fps: 25, largura: 1920, altura: 1080, temVideo: true, temAudio: true }]
  let p = novoProjeto({ id: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b', midias, preset: PRESET })
  assert.equal(p.linha.clipes.length, 1)
  p = comTranscricao(p, 'm1', {
    modelo: 'teste',
    palavras: [
      { texto: 'Olá', ini: 0.5, fim: 1 },
      { texto: 'mundo.', ini: 4, fim: 4.6 },
      { texto: 'Fim', ini: 8, fim: 8.5 },
    ],
  })
  const corte = { id: 'k1', tipo: 'silencio', midia: 'm1', ini: 1.2, fim: 3.8, estado: 'pendente', motivo: 'x' }
  const zoom = { id: 'z1', tipo: 'zoom', midia: 'm1', ini: 3.9, fim: 5, escala: 1.2, foco: { x: 0.5, y: 0.4 }, estado: 'pendente', motivo: 'x' }
  p = comPropostas(p, [corte, zoom], ['silencio', 'zoom'])
  const h = new Historico(p)
  h.fazer(aprovar(h.atual, ['k1', 'z1']), 'aprovar')
  let a = h.atual
  assert.equal(a.linha.clipes.length, 2)
  assert.ok(Math.abs(numeros(a).final - 7.4) < 0.05)
  const ws = palavrasNaLinha(a)
  assert.equal(ws.length, 3)
  assert.ok(Math.abs(ws[1].ini - 1.4) < 0.05, 'mundo sobe 2,6 s depois do corte')
  // corrigir uma palavra e apagar outra
  a = editarPalavra(a, 'm1', 0, 'Oi')
  a = editarPalavra(a, 'm1', 2, '')
  assert.deepEqual(
    palavrasNaLinha(a).map((w) => w.texto),
    ['Oi', 'mundo.'],
  )
  assert.equal(editarPalavra(a, 'm1', 0, 'Oi'), a, 'mesmo texto não muda o projeto')
  // recusar depois de aprovar devolve o trecho
  const r = recusar(a, 'k1')
  assert.equal(r.linha.clipes.length, 1)
  assert.equal(numeros(r).final, 10)
  h.desfazer()
  assert.equal(h.atual.linha.clipes.length, 1)
  // salvar e abrir
  assert.deepEqual(abrir(salvar(a)), a)
  assert.throws(() => abrir('{"formato":"outro"}'), /não é um projeto/)
})

test('legenda: blocos curtos, sem piscar, SRT e VTT', () => {
  const ws = 'Este é um teste de legenda com várias palavras. E outra frase'.split(' ').map((t, i) => ({ texto: t, ini: i * 0.4, fim: i * 0.4 + 0.35 }))
  const b = agrupar(ws, PRESET.legenda)
  assert.ok(b.every((x) => x.palavras.length <= PRESET.legenda.max_palavras))
  assert.ok(b.some((x) => x.palavras.at(-1).texto === 'palavras.'), 'quebra no fim da frase')
  for (let i = 0; i < b.length - 1; i++) assert.ok(b[i].fim <= b[i + 1].ini + 1e-9)
  assert.equal(blocoEm(b, 0.1), b[0])
  assert.equal(blocoEm(b, 999), null)
  const s = srt(b)
  assert.match(s, /^1\n00:00:00,000 --> 00:00:0\d,\d{3}\nEste é um teste\n/)
  assert.match(vtt(b), /^WEBVTT\n\n00:00:00\.000 --> /)
  const alta = agrupar(ws, { ...PRESET.legenda, caixa_alta: true })
  assert.equal(alta[0].palavras[0].texto, 'ESTE')
})

test('preset fala v1 do repositório é válido e completo', () => {
  const bruto = JSON.parse(readFileSync(new URL('../presets/fala.v1.json', import.meta.url), 'utf8'))
  const p = prepararPreset(bruto)
  assert.deepEqual(p.cortes, bruto.cortes)
  assert.deepEqual(p.zoom, bruto.zoom)
  assert.deepEqual(p.legenda, bruto.legenda)
  // valores fora dos limites voltam para o padrão
  assert.equal(prepararPreset({ zoom: { escala: 9 } }).zoom.escala, 1.12)
})

test('cores e etiquetas: etiquetar clipes, listar para o filtro e manter ao dividir', async () => {
  const { etiquetar } = await import('../src/linha.js')
  const { CORES, corDaMidia, corDoClipe, etiquetasDa } = await import('../src/cores.js')
  let l = linhaInicial([{ id: 'm1', quadros: 300 }])
  l = dividir(l, 100)
  l = dividir(l, 200)
  const [a, b, c] = l.clipes.map((x) => x.id)
  l = etiquetar(l, [a, c], { cor: 'laranja', etiqueta: '  Gancho  ' })
  assert.equal(l.clipes[0].etiqueta, 'Gancho')
  assert.equal(etiquetar(l, a, { cor: 'laranja' }), l, 'mesma cor não muda nada')
  l = etiquetar(l, b, { cor: 'verde', etiqueta: 'B-roll' })
  assert.deepEqual(etiquetasDa(l), [
    { etiqueta: 'B-roll', cor: 'verde', n: 1 },
    { etiqueta: 'Gancho', cor: 'laranja', n: 2 },
  ])
  const d = dividir(l, 50)
  assert.equal(d.clipes[1].etiqueta, 'Gancho', 'o pedaço novo herda a etiqueta')
  l = etiquetar(l, a, { cor: null, etiqueta: '' })
  assert.equal(l.clipes[0].cor, undefined)
  assert.equal(l.clipes[0].etiqueta, undefined)
  // mídias diferentes nascem com cores diferentes; o clipe sem cor usa a da mídia
  const cs = new Set(Array.from({ length: CORES.length }, (_, i) => corDaMidia(i)))
  assert.equal(cs.size, CORES.length)
  const p = { midias: [{ id: 'm1', cor: 'azul' }] }
  assert.equal(corDoClipe(p, l.clipes[0]), 'azul')
  assert.equal(corDoClipe(p, l.clipes[1]), 'verde')
})

test('tirar mídia do projeto leva junto clipes, transcrição, propostas e correções; desfazer volta', () => {
  const a = { id: 'a', nome: 'a.mov', duracao: 4, fps: 30, largura: 1920, altura: 1080, temVideo: true, temAudio: true }
  const b = { id: 'b', nome: 'b.mov', duracao: 2, fps: 30, largura: 1920, altura: 1080, temVideo: true, temAudio: true }
  let p = novoProjeto({ midias: [a, b] })
  p = comTranscricao(p, 'a', { palavras: [{ texto: 'oi', ini: 0, fim: 0.5 }] })
  p = comPropostas(p, [{ id: 'x', tipo: 'silencio', midia: 'a', ini: 1, fim: 2, estado: 'pendente' }, { id: 'y', tipo: 'silencio', midia: 'b', ini: 0.5, fim: 1, estado: 'pendente' }], ['silencio'])
  p = editarPalavra(p, 'a', 0, 'olá')
  const h = new Historico(p)
  h.fazer(removerMidia(p, 'a'), 'tirar mídia')
  const q = h.atual
  assert.deepEqual(q.midias.map((m) => m.id), ['b'])
  assert.ok(q.linha.clipes.every((c) => c.midia === 'b'))
  assert.equal(duracao(q.linha), paraQuadros(2, q.fps))
  assert.equal(q.transcricoes.a, undefined)
  assert.deepEqual(q.propostas.map((x) => x.id), ['y'])
  assert.equal(q.legenda.textos.a, undefined)
  assert.equal(removerMidia(q, 'nao-existe'), q)
  assert.deepEqual(removerMidia(p, ['a', 'b']).midias, [])
  assert.deepEqual(removerMidia(p, ['a', 'b']).linha.clipes, [])
  h.desfazer()
  assert.deepEqual(h.atual.midias.map((m) => m.id), ['a', 'b'])
})

test('balões do dock: mídia sem arquivo e propostas pendentes; o resto não espera a pessoa', () => {
  const vazio = pendencias(null)
  assert.deepEqual(Object.values(vazio).map((x) => x.n), [0, 0, 0, 0])
  const projeto = {
    midias: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    propostas: [
      { id: '1', tipo: 'silencio', ini: 0, fim: 1, estado: 'pendente' },
      { id: '2', tipo: 'zoom', ini: 2, fim: 3, estado: 'pendente' },
      { id: '3', tipo: 'respiro', ini: 4, fim: 5, estado: 'aprovada' },
      { id: '4', tipo: 'silencio', ini: 6, fim: 7, estado: 'recusada' },
    ],
  }
  const p = pendencias(projeto, { temArquivo: (id) => id === 'a' })
  assert.deepEqual(p.midia, { n: 2, dica: '2 mídias sem o arquivo: escolha de novo' })
  assert.deepEqual(p.revisar, { n: 2, dica: '2 propostas para aprovar ou recusar' })
  assert.equal(p.edicao.n + p.entrega.n, 0)
  const tudoCerto = pendencias({ ...projeto, propostas: projeto.propostas.map((x) => ({ ...x, estado: 'aprovada' })) })
  assert.equal(tudoCerto.midia.n + tudoCerto.revisar.n, 0)
  assert.equal(pendencias({ midias: [{ id: 'a' }], propostas: [] }, { temArquivo: () => false }).midia.dica, '1 mídia sem o arquivo: escolha de novo')
  assert.equal(rotuloBalao(7), '7')
  assert.equal(rotuloBalao(99), '99')
  assert.equal(rotuloBalao(100), '99+')
})
