// Edição automática (src/musica e src/auto): a sincronia das tomadas pelo som, a batida, as partes da música, a nota
// de cada plano, onde cortar e quem entra em cada corte, e a montagem dentro do projeto (linha, trilha, marcadores,
// troca de plano, zoom na batida). Com música sintética (test/musica-sintetica.js): nada vem de arquivo.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { medir } from '../src/musica/sinal.js'
import { alinhar, refinar, tipoDaTomada } from '../src/musica/sincronia.js'
import { batidaDa } from '../src/musica/ritmo.js'
import { energiaDosCompassos, partesDa, renomearPartes } from '../src/musica/estrutura.js'
import { bytesParaBase64, medirQuadro, notaDe, notasEmBytes, referenciaDeNitidez } from '../src/musica/nota.js'
import { alternativasEm, cortesNaMusica, escolherPlanos, sorteio } from '../src/musica/montagem.js'
import { MODOS, prepararModo } from '../src/auto/modos.js'
import { alternativasDoClipe, CAMERA_CALADA, comAnalise, empurrarSincronia, marcarTomada, montar, trechoDoClipe, trocarPlano, zoomsNaBatida } from '../src/auto/montar.js'
import { ajustarTrilha, definirTrilha, tirarTrilha, trilhaNaLinha } from '../src/trilha.js'
import { duracao, posicoes, tamanho } from '../src/linha.js'
import { novoProjeto, removerMidia } from '../src/projeto.js'
import { paraQuadros, paraSegundos, racional } from '../src/tempo.js'
import { paraFcpxml } from '../src/exportar/fcpxml.js'
import { paraXmeml } from '../src/exportar/xmeml.js'
import { paraOtio } from '../src/exportar/otio.js'
import { paraEdl } from '../src/exportar/edl.js'
import { pacote } from '../src/exportar/index.js'
import { PRESET } from './apoio.js'
import { CANCAO, musica, sorteio as sorteioTeste, tomada } from './musica-sintetica.js'

const preset = (nome) => prepararModo(JSON.parse(readFileSync(new URL(`../presets/${nome}.v1.json`, import.meta.url), 'utf8')))
const CLIPE = preset('clipe')
const AFTER = preset('aftermovie')

const M = musica({ bpm: 120, partes: CANCAO, inicioS: 0.25, semente: 3 })
const MED = medir(M.pcm, M.taxa)

test('sincronia: a tomada com a música cai no ponto exato (abaixo de 2 ms), mesmo começando antes da música', () => {
  for (const [de, dur, antes] of [
    [17.337, 20, 0],
    [0.25, 30, 2.5],
    [52.1, 12, 0.8],
  ]) {
    const pcm = tomada(M, { de, dur, antes, semente: Math.round(de * 10) })
    const r = alinhar(MED, medir(pcm, M.taxa), { sobreposicaoMinS: CLIPE.sincronia.sobreposicao_min_s })
    assert.equal(tipoDaTomada(r, CLIPE.sincronia), 'performance', `tomada em ${de}`)
    const fino = refinar(M.pcm, pcm, M.taxa, r.inicio, { buscaMs: CLIPE.sincronia.busca_fina_ms })
    assert.ok(Math.abs(fino - (de - antes)) < 0.002, `início ${fino} ≠ ${de - antes}`)
  }
})

test('sincronia: tomada sem a música no áudio (outra música, ruído, silêncio) fica como B-roll', () => {
  const r = sorteioTeste(5)
  const outra = musica({ bpm: 97, partes: [{ tipo: 'verso', compassos: 12, acordes: ['D', 'Bm'], forca: 0.7 }], semente: 77 })
  const ruido = Float32Array.from({ length: M.taxa * 15 }, () => (r() * 2 - 1) * 0.1)
  const silencio = new Float32Array(M.taxa * 10)
  for (const pcm of [outra.pcm, ruido, silencio]) assert.equal(tipoDaTomada(alinhar(MED, medir(pcm, M.taxa)), CLIPE.sincronia), 'broll')
})

test('batida: andamento certo de 80 a 160 BPM e o compasso no primeiro tempo (até 20 ms)', () => {
  for (const bpm of [80, 96, 120, 128, 140, 160]) {
    const m = musica({ bpm, partes: CANCAO, inicioS: 0.4, semente: bpm })
    const b = batidaDa(medir(m.pcm, m.taxa))
    assert.ok(Math.abs(b.bpm - bpm) / bpm < 0.015, `${bpm} → ${b.bpm}`)
    for (const c of m.compassos.slice(0, 8)) assert.ok(b.compassos.some((x) => Math.abs(x - c) < 0.02), `compasso ${c} em ${bpm} BPM (achou ${b.compassos.slice(0, 4)})`)
  }
})

test('partes: intro, verso, refrão, verso, refrão e final nos lugares certos; o refrão é o mais forte', () => {
  const b = batidaDa(MED)
  const ps = partesDa(MED, b.compassos, M.duracao, CLIPE.secoes)
  assert.deepEqual(
    ps.map((p) => p.tipo),
    M.partes.map((p) => p.tipo),
  )
  ps.slice(1).forEach((p, i) => assert.ok(Math.abs(p.ini - M.partes[i + 1].ini) < 0.03, `${p.nome} começa em ${p.ini}, não ${M.partes[i + 1].ini}`))
  assert.deepEqual(
    ps.map((p) => p.nome),
    ['Intro', 'Verso 1', 'Refrão 1', 'Verso 2', 'Refrão 2', 'Final'],
  )
  assert.equal(ps[1].grupo, ps[3].grupo)
  assert.equal(ps[2].grupo, ps[4].grupo)
  assert.ok(ps[2].energia > ps[1].energia + 2)
  assert.equal(ps[0].ini, 0)
  assert.equal(ps.at(-1).fim, Math.round(M.duracao * 1000) / 1000)
  // a pessoa corrige um nome
  const r = renomearPartes(ps, 1, 'pre')
  assert.equal(r[1].nome, 'Pré-refrão')
  assert.equal(r[3].nome, 'Verso')
  assert.equal(energiaDosCompassos(MED, b.compassos, M.duracao).length, b.compassos.length)
})

// imagem de teste: tabuleiro nítido, o mesmo borrado, escuro e um quadro mexido
function imagem(w, h, f) {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = f(x, y)
      d.set([v, v, v, 255], 4 * (y * w + x))
    }
  return d
}
test('nota: nítido ganha do borrado, exposto ganha do escuro, firme ganha do tremido (e o aftermovie quer movimento)', () => {
  const W = 96
  const H = 54
  const tab = (x, y) => (((x >> 2) + (y >> 2)) % 2 ? 200 : 60)
  const borrado = (x, y) => 130 + 70 * Math.sin(x / 9) * Math.sin(y / 9)
  const nitido = medirQuadro(imagem(W, H, tab), W, H)
  const borr = medirQuadro(imagem(W, H, borrado), W, H)
  const escuro = medirQuadro(imagem(W, H, (x, y) => tab(x, y) * 0.15), W, H)
  const ref = referenciaDeNitidez([[nitido, borr, escuro]])
  assert.ok(notaDe(nitido, ref, CLIPE.nota) > notaDe(borr, ref, CLIPE.nota) + 0.2)
  assert.ok(notaDe(nitido, ref, CLIPE.nota) > notaDe(escuro, ref, CLIPE.nota) + 0.1)
  const mexido = medirQuadro(imagem(W, H, (x, y) => tab(x + 3, y + 2)), W, H, nitido.cinza)
  const parado = medirQuadro(imagem(W, H, tab), W, H, nitido.cinza)
  assert.ok(mexido.movimento > 0.1 && parado.movimento === 0)
  assert.ok(notaDe(parado, ref, CLIPE.nota) > notaDe(mexido, ref, CLIPE.nota))
  const pouco = { ...parado, movimento: 0.06 }
  assert.ok(notaDe(pouco, ref, AFTER.nota) > notaDe(parado, ref, AFTER.nota), 'o aftermovie prefere movimento')
  assert.equal(notasEmBytes([nitido, borr], ref, CLIPE.nota).length, 2)
})

// a análise de uma música de 81 s com 3 tomadas de performance (inteira, só o meio, só o fim) e 2 de B-roll
const BATIDA = batidaDa(MED)
const ANALISE = { duracao: M.duracao, bpm: BATIDA.bpm, batidas: BATIDA.batidas, compassos: BATIDA.compassos, partes: partesDa(MED, BATIDA.compassos, M.duracao, CLIPE.secoes), energias: energiaDosCompassos(MED, BATIDA.compassos, M.duracao) }
const ondas = (n, f) => Float32Array.from({ length: n }, (_, i) => f(i))
const TOMADAS = [
  { midia: 'A', tipo: 'performance', inicio: -1.5, duracao: M.duracao + 3, notas: ondas(200, (i) => 0.6 + 0.3 * Math.sin(i / 7)), hz: 2 },
  { midia: 'B', tipo: 'performance', inicio: 20, duracao: 40, notas: ondas(80, (i) => 0.6 + 0.3 * Math.cos(i / 5)), hz: 2 },
  { midia: 'C', tipo: 'performance', inicio: 50, duracao: 32, notas: ondas(64, () => 0.7), hz: 2 },
  { midia: 'R1', tipo: 'broll', duracao: 30, notas: ondas(60, (i) => (i > 30 ? 0.9 : 0.4)), hz: 2 },
  { midia: 'R2', tipo: 'broll', duracao: 12, notas: ondas(24, () => 0.5), hz: 2 },
]

test('onde cortar: sempre na batida, toda troca de parte é corte e o refrão corta mais rápido que o verso', () => {
  const t = cortesNaMusica(ANALISE, { ritmo: 'normal' }, CLIPE, sorteio(1))
  assert.equal(t[0][0], 0)
  assert.equal(t.at(-1)[1], ANALISE.duracao)
  t.slice(1).forEach(([a], i) => assert.equal(a, t[i][1], 'trechos colados'))
  const naBatida = (x) => ANALISE.batidas.some((b) => Math.abs(b - x) < 1e-6) || ANALISE.partes.some((p) => Math.abs(p.ini - x) < 1e-6)
  for (const [a] of t.slice(1)) assert.ok(naBatida(a), `corte fora da batida em ${a}`)
  for (const p of ANALISE.partes.slice(1)) assert.ok(t.some(([a]) => Math.abs(a - p.ini) < 1e-6), `sem corte na troca para ${p.nome}`)
  const media = (tipo) => {
    const ds = t.filter(([a]) => ANALISE.partes.find((p) => a >= p.ini && a < p.fim)?.tipo === tipo).map(([a, b]) => b - a)
    return ds.reduce((s, v) => s + v, 0) / ds.length
  }
  assert.ok(media('refrao') < media('verso') * 0.8, `refrão ${media('refrao')} × verso ${media('verso')}`)
  assert.ok(cortesNaMusica(ANALISE, { ritmo: 'rapido' }, CLIPE, sorteio(1)).length > cortesNaMusica(ANALISE, { ritmo: 'calmo' }, CLIPE, sorteio(1)).length * 2)
})

test('quem entra: performance só onde cobre, nunca a mesma tomada seguida, B-roll nunca seguido e cada trecho de B-roll uma vez', () => {
  for (const [broll, semente] of [
    ['pouco', 1],
    ['muito', 2],
    ['nenhum', 3],
  ]) {
    const t = cortesNaMusica(ANALISE, { ritmo: 'normal' }, CLIPE, sorteio(semente))
    const ps = escolherPlanos(t, TOMADAS, ANALISE, { broll, semente }, CLIPE)
    assert.equal(ps[0].ini, 0)
    assert.equal(ps.at(-1).fim, ANALISE.duracao)
    ps.slice(1).forEach((x, i) => assert.equal(x.ini, ps[i].fim, 'sem buraco'))
    for (const x of ps) {
      const tm = TOMADAS.find((y) => y.midia === x.midia)
      if (x.tipo === 'performance') {
        assert.ok(tm.inicio <= x.ini + 1e-3 && tm.inicio + tm.duracao >= x.fim - 1e-3, 'a performance cobre o trecho')
        assert.ok(Math.abs(x.de - (x.ini - tm.inicio)) < 1e-3, 'em sincronia')
      } else assert.ok(x.de >= 0 && x.de + (x.fim - x.ini) <= tm.duracao + 1e-3)
    }
    ps.slice(1).forEach((x, i) => {
      assert.ok(!(x.midia === ps[i].midia && x.tipo === 'performance' && ps[i].tipo === 'performance'), `mesma tomada seguida em ${x.ini}`)
      assert.ok(!(x.tipo === 'broll' && ps[i].tipo === 'broll'), `B-roll seguido em ${x.ini}`)
    })
    const brs = ps.filter((x) => x.tipo === 'broll')
    if (broll === 'nenhum') assert.equal(brs.length, 0)
    if (broll === 'muito') assert.ok(brs.length >= 3)
    for (const a of brs) for (const b of brs) if (a !== b && a.midia === b.midia) assert.ok(a.de + (a.fim - a.ini) <= b.de + 1e-3 || b.de + (b.fim - b.ini) <= a.de + 1e-3, 'B-roll repetido')
    // determinado pela semente
    assert.deepEqual(escolherPlanos(t, TOMADAS, ANALISE, { broll, semente }, CLIPE), ps)
  }
})

test('aftermovie: só B-roll, nenhum trecho repetido, acelera onde a música é mais forte', () => {
  const t = cortesNaMusica(ANALISE, { ritmo: 'normal' }, AFTER, sorteio(4))
  const brs = TOMADAS.map((x) => ({ ...x, tipo: 'broll', duracao: 120, notas: ondas(240, (i) => 0.5 + 0.4 * Math.sin(i / 3)) }))
  const ps = escolherPlanos(t, brs, ANALISE, { semente: 4 }, AFTER)
  assert.ok(ps.every((x) => x.tipo === 'broll'))
  for (const a of ps) for (const b of ps) if (a !== b && a.midia === b.midia) assert.ok(a.de + (a.fim - a.ini) <= b.de + 1e-3 || b.de + (b.fim - b.ini) <= a.de + 1e-3)
  const media = (tipo) => {
    const ds = t.filter(([a]) => ANALISE.partes.find((p) => a >= p.ini && a < p.fim)?.tipo === tipo).map(([a, b]) => b - a)
    return ds.reduce((s, v) => s + v, 0) / ds.length
  }
  assert.ok(media('refrao') < media('intro') / 2)
})

test('alternativas: as performances que cobrem e o melhor trecho de cada B-roll, sem a atual', () => {
  const alts = alternativasEm(TOMADAS, 52, 54, { atual: { midia: 'A', de: 53.5 } })
  assert.ok(alts.some((x) => x.midia === 'B' && Math.abs(x.de - 32) < 1e-6))
  assert.ok(alts.some((x) => x.midia === 'C' && Math.abs(x.de - 2) < 1e-6))
  assert.ok(!alts.some((x) => x.midia === 'A'))
  assert.ok(alts.some((x) => x.tipo === 'broll'))
  assert.ok(alts.every((x, i) => i === 0 || alts[i - 1].nota >= x.nota))
})

// projeto: a música (só som) e as tomadas
function projetoClipe() {
  const midias = [
    { id: 'mus', nome: 'musica.wav', duracao: M.duracao, temVideo: false, temAudio: true, taxa: 48000 },
    ...TOMADAS.map((t) => ({ id: t.midia, nome: `${t.midia}.mov`, duracao: t.duracao, fps: 25, largura: 1920, altura: 1080, temVideo: true, temAudio: true })),
  ]
  let p = novoProjeto({ id: 'clipe', nome: 'Clipe', fps: 25, midias })
  const tomadas = Object.fromEntries(TOMADAS.map((t) => [t.midia, { tipo: t.tipo, ...(t.tipo === 'performance' ? { inicio: t.inicio, ncc: 0.8, destaque: 9 } : {}), hz: 2, b64: bytesParaBase64(Uint8Array.from(t.notas, (v) => Math.round(v * 255))) }]))
  p = comAnalise(p, { modo: 'clipe', preset: { nome: 'clipe', versao: 1 }, musica: 'mus', ...ANALISE, tomadas })
  return p
}

test('montar: a linha dura a música, a música vira trilha, as câmeras calam, as partes viram marcadores e a performance fica em sincronia', () => {
  const p0 = projetoClipe()
  const { projeto: p, planos } = montar(p0, CLIPE, { ritmo: 'normal', broll: 'pouco', semente: 7 })
  assert.ok(planos.length > 10)
  assert.equal(duracao(p.linha), paraQuadros(M.duracao, p.fps))
  assert.deepEqual(p.trilha, { midia: 'mus', desde: 0, volume: 0 })
  const tl = trilhaNaLinha(p)
  assert.equal(tl.midia.id, 'mus')
  assert.ok(Math.abs(tl.dur - M.duracao) < 0.05)
  assert.ok(p.linha.clipes.every((c) => c.ajustes.volume === CAMERA_CALADA && c.midia !== 'mus'))
  assert.deepEqual(
    p.marcadores.map((k) => k.nome),
    ANALISE.partes.map((x) => x.nome),
  )
  assert.ok(p.marcadores.every((k) => k.id.startsWith('kauto') && k.cor))
  // cada performance: o quadro da linha + deslocamento da tomada = o quadro da tomada (erro < 1 quadro)
  for (const { clipe, inicio } of posicoes(p.linha)) {
    const t = TOMADAS.find((x) => x.midia === clipe.midia)
    if (clipe.etiqueta === 'B-roll') continue
    const musicaT = paraSegundos(inicio, p.fps)
    assert.ok(Math.abs(paraSegundos(clipe.ini, p.fps) - (musicaT - t.inicio)) <= paraSegundos(1, p.fps) / 2 + 1e-9, `fora de sincronia: ${clipe.midia} em ${musicaT}`)
  }
  // montar de novo troca os marcadores da montagem, não os da pessoa
  const comMeu = { ...p, marcadores: [...p.marcadores, { id: 'kmeu', q: 10, nome: 'Meu' }] }
  const de2 = montar(comMeu, CLIPE, { ritmo: 'rapido', semente: 2 }).projeto
  assert.equal(de2.marcadores.filter((k) => k.id === 'kmeu').length, 1)
  assert.equal(de2.marcadores.length, ANALISE.partes.length + 1)
  assert.ok(de2.linha.clipes.length > p.linha.clipes.length)
  assert.deepEqual(de2.auto.ajustes, { ritmo: 'rapido', broll: 'pouco', semente: 2, desde: 0, ate: M.duracao })
})

test('trocar plano: outra tomada no mesmo trecho, do mesmo tamanho e ainda em sincronia', () => {
  const { projeto: p } = montar(projetoClipe(), CLIPE, { semente: 7, broll: 'nenhum' })
  // um plano no meio, onde A, B e C cobrem
  const alvo = posicoes(p.linha).find(({ inicio }) => paraSegundos(inicio, p.fps) > 52 && paraSegundos(inicio, p.fps) < 58)
  const tr = trechoDoClipe(p, alvo.clipe.id)
  const alts = alternativasDoClipe(p, alvo.clipe.id)
  assert.ok(alts.length >= 2)
  assert.ok(alts.every((x) => x.nome))
  const perf = alts.find((x) => x.tipo === 'performance')
  const q = trocarPlano(p, alvo.clipe.id, perf)
  const novo = q.linha.clipes.find((c) => c.id === alvo.clipe.id)
  assert.equal(novo.midia, perf.midia)
  assert.equal(tamanho(novo), tamanho(alvo.clipe))
  assert.equal(duracao(q.linha), duracao(p.linha))
  const t = TOMADAS.find((x) => x.midia === perf.midia)
  assert.ok(Math.abs(paraSegundos(novo.ini, p.fps) - (tr.a - t.inicio)) <= paraSegundos(1, p.fps))
  const br = trocarPlano(p, alvo.clipe.id, { midia: 'R1', de: 16, tipo: 'broll' })
  assert.equal(br.linha.clipes.find((c) => c.id === alvo.clipe.id).etiqueta, 'B-roll')
})

test('zoom na batida: propostas pendentes nos compassos do refrão, dentro de um plano', () => {
  const { projeto: p } = montar(projetoClipe(), CLIPE, { semente: 7 })
  const zs = zoomsNaBatida(p, CLIPE)
  assert.ok(zs.length > 0)
  const refroes = ANALISE.partes.filter((x) => x.tipo === 'refrao')
  for (const z of zs) {
    assert.equal(z.tipo, 'zoom')
    assert.equal(z.estado, 'pendente')
    assert.equal(z.escala, CLIPE.zoom_na_batida.escala)
    assert.match(z.motivo, /Refrão/)
    assert.ok(z.fim > z.ini)
  }
  assert.ok(refroes.length === 2)
})

test('correções antes de montar: virar B-roll, voltar a performance e empurrar a sincronia em quadros', () => {
  const p = projetoClipe()
  const q = marcarTomada(p, 'B', 'broll')
  assert.equal(q.auto.tomadas.B.tipo, 'broll')
  assert.equal(marcarTomada(q, 'B', 'performance').auto.tomadas.B.tipo, 'performance')
  assert.equal(marcarTomada(p, 'R1', 'performance'), p, 'B-roll sem sincronia medida não vira performance')
  assert.equal(empurrarSincronia(p, 'C', 2).auto.tomadas.C.inicio, 50.08)
})

test('trilha: pôr, ajustar, tirar; sai junto com a mídia; acaba no fim da música ou da linha', () => {
  const { projeto: p } = montar(projetoClipe(), CLIPE, { semente: 1 })
  assert.equal(ajustarTrilha(p, { volume: -6 }).trilha.volume, -6)
  assert.equal(tirarTrilha(p).trilha, undefined)
  assert.equal(removerMidia(p, 'mus').trilha, undefined)
  assert.equal(trilhaNaLinha(removerMidia(p, 'R1')).midia.id, 'mus')
  assert.throws(() => definirTrilha(p, 'nada'))
  const meio = definirTrilha(p, 'mus', { desde: 70 })
  assert.ok(Math.abs(trilhaNaLinha(meio).dur - (M.duracao - 70)) < 1e-6)
})

test('modos: só os que funcionam, e o preset completa o que faltar dentro dos limites', () => {
  assert.deepEqual(
    MODOS.map((m) => m.id),
    ['clipe', 'aftermovie', 'conteudo'],
  )
  const vazio = prepararModo({})
  assert.equal(vazio.ritmo.batidas_por_plano.refrao, 4)
  assert.equal(vazio.ritmo.batidas_por_plano.verso, 8)
  assert.equal(prepararModo({ ritmo: { min_batidas: 999 } }).ritmo.min_batidas, 2)
  assert.equal(AFTER.so_broll, true)
  assert.equal(AFTER.nota.movimento_bom, 0.06)
  assert.equal(CLIPE.so_broll, false)
})

function bemFormado(xml) {
  const dir = mkdtempSync(join(tmpdir(), 'aeon-auto-'))
  try {
    writeFileSync(join(dir, 'x.xml'), xml)
    execFileSync('xmllint', ['--noout', join(dir, 'x.xml')], { stdio: 'pipe' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('exportar: a música vai numa faixa própria do começo ao fim (Final Cut, Premiere, OTIO, EDL) e as câmeras caladas', () => {
  const { projeto } = montar(projetoClipe(), CLIPE, { semente: 7 })
  const p = definirTrilha(projeto, 'mus', { desde: 2, volume: -3 })
  const total = duracao(p.linha)
  const desde = paraQuadros(2, p.fps)
  const quadros = Math.min(total, paraQuadros(M.duracao - 2, p.fps))
  const fcp = paraFcpxml(p)
  bemFormado(fcp)
  const musicas = fcp.match(/<asset-clip [^>]*audioRole="music"[^>]*>/g)
  assert.equal(musicas.length, 1)
  assert.match(musicas[0], new RegExp(`start="${racional(desde, p.fps)}" duration="${racional(quadros, p.fps)}"`))
  assert.match(fcp, /adjust-volume amount="-3dB"/)
  assert.match(fcp, /adjust-volume amount="-60dB"/)
  const xml = paraXmeml(p)
  bemFormado(xml)
  for (const lado of ['L', 'R']) {
    const item = xml.match(new RegExp(`<clipitem id="clipitem-t${lado}-1">[\\s\\S]*?</clipitem>`))[0]
    assert.match(item, new RegExp(`<start>0</start>\\s*<end>${quadros}</end>\\s*<in>${desde}</in>\\s*<out>${desde + quadros}</out>`))
  }
  const otio = JSON.parse(paraOtio(p))
  const faixa = otio.tracks.children.find((t) => t.name === 'Música')
  assert.equal(faixa.children[0].source_range.start_time.value, desde)
  assert.equal(faixa.children[0].source_range.duration.value, quadros)
  assert.match(paraEdl(p), /\* MUSICA 00:00:00:00: musica\.wav DESDE 00:00:02:00 -3 DB/)
  const ref = JSON.parse(pacote(p, PRESET.legenda).find((a) => a.name === 'zro-timeline-ref.json').data)
  assert.ok(ref[0].notes.some((n) => /música/.test(n)))
  // sem trilha, nada disso
  const sem = tirarTrilha(p)
  assert.doesNotMatch(paraFcpxml(sem), /audioRole="music"/)
  assert.doesNotMatch(paraXmeml(sem), /clipitem-t/)
})
