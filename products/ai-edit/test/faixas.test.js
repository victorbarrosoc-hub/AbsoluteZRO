// Voz e instrumental pela NOSSOM (src/faixas.js): o trecho que sobe, a separação que cobre o clipe, o mix no clipe (que
// corta e anda junto), o pacote que volta, o WAV e a mistura.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dividir, aparar, juntarContinuos } from '../src/linha.js'
import { novoProjeto } from '../src/projeto.js'
import { segmentos } from '../src/exportar/comum.js'
import {
  adicionarSeparacao,
  ajustarFaixas,
  desligarFaixas,
  duasFaixas,
  faixasDoClipe,
  faixasForaDoTrecho,
  ganhoDaFaixa,
  LIMITE_S,
  minutosDoPedido,
  misturarTrecho,
  partesDoPacote,
  presetDoMix,
  relatorioValido,
  separacaoDoClipe,
  separacoesSoltas,
  trechoParaSeparar,
  wav16,
} from '../src/faixas.js'

function projeto(segundos = 60) {
  return novoProjeto({ id: 'p', nome: 'Clipe', fps: 25, midias: [{ id: 'm1', nome: 'show.mov', duracao: segundos, fps: 25, largura: 1920, altura: 1080, temVideo: true, temAudio: true }] })
}

test('trecho que sobe: o do clipe com folga, sem passar da mídia nem do limite; minutos da franquia', () => {
  let p = projeto(60)
  p = { ...p, linha: dividir(dividir(p.linha, 250), 750) }
  const c = p.linha.clipes[1] // 10 s a 30 s
  assert.deepEqual(trechoParaSeparar(p, c), { ini: 8, fim: 32 })
  assert.deepEqual(trechoParaSeparar(p, p.linha.clipes[0]), { ini: 0, fim: 12 })
  const longo = projeto(1200)
  assert.match(trechoParaSeparar(longo, longo.linha.clipes[0]).erro, /até 9 min/)
  const mudo = { ...p, midias: [{ ...p.midias[0], temAudio: false }] }
  assert.match(trechoParaSeparar(mudo, c).erro, /não tem som/)
  assert.equal(minutosDoPedido(24), 1)
  assert.equal(minutosDoPedido(LIMITE_S), 10)
})

test('separação liga no clipe, corta e anda junto; aparar para fora volta ao original e avisa', () => {
  let p = projeto(60)
  const c = p.linha.clipes[0]
  const r = adicionarSeparacao(p, { midia: 'm1', ini: 0, fim: 60, ganhoDb: -1.5, pedido: 'job-1' }, [c.id], { voz: 0, instrumental: null })
  p = r.projeto
  assert.equal(p.separacoes[0].ganhoDb, -1.5)
  assert.deepEqual(p.linha.clipes[0].faixas, { sep: r.id, voz: 0, instrumental: null })
  assert.equal(separacaoDoClipe(p, p.linha.clipes[0]).id, r.id)
  // cortar: as duas metades levam as faixas; juntar de volta só quando o mix é igual
  p = { ...p, linha: dividir(p.linha, 500) }
  const [a, b] = p.linha.clipes
  assert.deepEqual(a.faixas, b.faixas)
  assert.equal(faixasDoClipe(p, b).desloc, 20)
  assert.equal(juntarContinuos(p.linha).clipes.length, 1)
  p = { ...p, linha: ajustarFaixas(p.linha, b.id, { instrumental: -6 }) }
  assert.equal(juntarContinuos(p.linha).clipes.length, 2, 'mix diferente não junta')
  assert.equal(presetDoMix(p.linha.clipes[0].faixas), 'voz')
  assert.equal(presetDoMix(p.linha.clipes[1].faixas), null)
  // tudo em 0 dB: as faixas somam o original, então toca o original
  p = { ...p, linha: ajustarFaixas(p.linha, a.id, { instrumental: 0 }) }
  assert.equal(faixasDoClipe(p, p.linha.clipes[0]), null)
  // separação só de um trecho: aparar o clipe para fora dele volta ao original
  let q = projeto(60)
  q = adicionarSeparacao(q, { midia: 'm1', ini: 0, fim: 20 }, [], undefined).projeto
  q = { ...q, linha: dividir(q.linha, 250) }
  const [c1] = q.linha.clipes
  q = { ...q, linha: { ...q.linha, clipes: q.linha.clipes.map((x) => (x.id === c1.id ? { ...x, faixas: { sep: q.separacoes[0].id, voz: null, instrumental: 0 } } : x)) } }
  assert.ok(faixasDoClipe(q, q.linha.clipes[0]))
  q = { ...q, linha: aparar(q.linha, c1.id, 'fim', 400, 1500) }
  assert.equal(faixasDoClipe(q, q.linha.clipes[0]), null)
  assert.equal(faixasForaDoTrecho(q, q.linha.clipes[0]), true)
  // desligar volta ao som original; a separação fica solta até alguém usar de novo
  const d = { ...p, linha: desligarFaixas(p.linha, p.linha.clipes.map((x) => x.id)) }
  assert.ok(d.linha.clipes.every((x) => !x.faixas))
  assert.equal(separacoesSoltas(d).length, 1)
})

test('a exportação sabe o mix de cada segmento', () => {
  let p = projeto(10)
  const c = p.linha.clipes[0]
  p = adicionarSeparacao(p, { midia: 'm1', ini: 0, fim: 10 }, [c.id], { voz: null, instrumental: -3 }).projeto
  const [s] = segmentos(p)
  assert.deepEqual({ voz: s.faixas.voz, instrumental: s.faixas.instrumental, desloc: s.faixas.desloc }, { voz: null, instrumental: -3, desloc: 0 })
})

test('pacote da NOSSOM: o relatório de stems-v1 confere e as cinco partes se separam pelo tamanho', () => {
  const r = {
    preset: 'stems-v1',
    sampleRate: 44100,
    channels: 2,
    gainDb: -0.4,
    stems: ['voz', 'bateria', 'baixo', 'guitarra', 'outros'].map((name, i) => ({ name, bytes: 100 + i })),
    totalBytes: 510,
    chunks: [{ index: 0, bytes: 510 }],
  }
  assert.equal(relatorioValido(r), true)
  assert.deepEqual(
    partesDoPacote(r).map((x) => [x.nome, x.ini, x.fim]),
    [
      ['voz', 0, 100],
      ['bateria', 100, 201],
      ['baixo', 201, 303],
      ['guitarra', 303, 406],
      ['outros', 406, 510],
    ],
  )
  for (const ruim of [{ ...r, preset: 'roformer-vocals-v1' }, { ...r, gainDb: 1 }, { ...r, totalBytes: 9 }, { ...r, stems: r.stems.slice(1) }, { ...r, chunks: [{ bytes: 1 }] }]) assert.equal(relatorioValido(ruim), false)
})

test('voz e instrumental: as cinco somam o original (desfeito o ganho) e a mistura segue o mix', () => {
  const n = 1000
  const original = [Float32Array.from({ length: n }, (_, i) => Math.sin(i / 7) * 0.5), Float32Array.from({ length: n }, (_, i) => Math.cos(i / 9) * 0.5)]
  // cinco faixas que somam o original, com -2 dB aplicados pela NOSSOM
  const k = 10 ** (-2 / 20)
  const pesos = [0.4, 0.25, 0.15, 0.12, 0.08]
  const stems = pesos.map((w) => original.map((ch) => Float32Array.from(ch, (x) => x * w * k)))
  const { voz, instrumental } = duasFaixas(stems, -2)
  for (let i = 0; i < n; i += 97) for (let c = 0; c < 2; c++) assert.ok(Math.abs(voz[c][i] + instrumental[c][i] - original[c][i]) < 1e-6)
  const so = misturarTrecho({ voz, instrumental }, { voz: 0, instrumental: null }, 10, 5)
  for (let i = 0; i < 5; i++) assert.ok(Math.abs(so[0][i] - voz[0][10 + i]) < 1e-7)
  const meio = misturarTrecho({ voz, instrumental }, { voz: -6, instrumental: 0 }, n - 2, 4)
  assert.equal(meio[1][3], 0, 'depois do fim da separação, silêncio')
  assert.ok(Math.abs(ganhoDaFaixa(-6) - 0.501) < 1e-3)
  assert.equal(ganhoDaFaixa(null), 0)
})

test('WAV de 16 bits: cabeçalho certo, estéreo intercalado e saturação', () => {
  const b = wav16([Float32Array.of(0, 1, -1, 2), Float32Array.of(0.5, -0.5, 0, -2)], 44100)
  const v = new DataView(b.buffer)
  assert.equal(String.fromCharCode(...b.slice(0, 4)), 'RIFF')
  assert.equal(String.fromCharCode(...b.slice(8, 12)), 'WAVE')
  assert.equal(v.getUint16(22, true), 2)
  assert.equal(v.getUint32(24, true), 44100)
  assert.equal(v.getUint32(40, true), 16)
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7].map((i) => v.getInt16(44 + i * 2, true)),
    [0, 16384, 32767, -16384, -32768, 0, 32767, -32768],
  )
})

test('exportadores: voz e instrumental em trilhas próprias, com o WAV ao lado e o som original calado', async () => {
  const { pacote } = await import('../src/exportar/index.js')
  const { PRESET } = await import('./apoio.js')
  const { arquivosDeFaixas, faixasExportadas } = await import('../src/exportar/comum.js')
  let p = projeto(30)
  p = { ...p, linha: dividir(p.linha, 250) } // 0–10 s e 10–30 s
  const [a, b] = p.linha.clipes
  p = adicionarSeparacao(p, { midia: 'm1', ini: 0, fim: 30 }, [b.id], { voz: null, instrumental: -3 }).projeto
  const pecas = faixasExportadas(p)
  assert.deepEqual(
    pecas.map((x) => [x.parte, x.desde, x.volume, x.seg.linha]),
    [['instrumental', 250, -3, 250]],
  )
  assert.deepEqual(
    arquivosDeFaixas(p).map((x) => [x.arquivo, x.quadros]),
    [['show - Instrumental 0s.wav', 750]],
  )
  const arquivos = pacote(p, PRESET.legenda, new Date('2026-11-01T12:00:00Z'), ['xmeml', 'fcpxml'])
  const xml = arquivos.find((x) => x.name.endsWith('.xml')).data
  // o clipe com faixas não leva o som original no A1/A2; o instrumental vai num par de faixas próprio, do quadro 250
  assert.equal((xml.match(/<clipitem id="clipitem-a1-/g) || []).length, 1, 'só o primeiro clipe com o som original')
  assert.match(xml, /<clipitem id="clipitem-f2L-1">[\s\S]*?<start>250<\/start>[\s\S]*?<in>250<\/in>[\s\S]*?<out>750<\/out>[\s\S]*?show - Instrumental 0s\.wav/)
  assert.match(xml, /<value>0\.7079<\/value>/, '−3 dB nos Níveis de áudio')
  const fcp = arquivos.find((x) => x.name.endsWith('.fcpxml')).data
  assert.match(fcp, /<asset id="f1" name="show - Instrumental 0s"[^>]*audioRate="44100"/)
  assert.match(fcp, /<asset-clip ref="f1" lane="-2" offset="10\/1s" name="show - Instrumental 0s" start="10\/1s" duration="20\/1s" audioRole="music">\s*<adjust-volume amount="-3dB"\/>/)
  assert.match(fcp, /<asset-clip ref="a1" offset="10\/1s"[^>]*>\s*<adjust-volume amount="-96dB"\/>/)
  // bem formados (xmllint), como os outros exportadores
  const { execFileSync } = await import('node:child_process')
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const dir = mkdtempSync(join(tmpdir(), 'faixas-'))
  try {
    for (const [n, d] of [
      ['x.xml', xml],
      ['x.fcpxml', fcp],
    ]) {
      writeFileSync(join(dir, n), d)
      execFileSync('xmllint', ['--noout', join(dir, n)], { stdio: 'pipe' })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  void a
})
