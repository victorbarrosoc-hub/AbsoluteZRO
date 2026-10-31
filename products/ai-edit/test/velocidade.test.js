// Velocidade (speed ramp): a curva monótona, os degraus que a prévia, o render e os exportadores usam, a curva que
// acompanha a mídia ao dividir/aparar/cortar, o som só em 100% e cada exportador recebendo a mesma rampa.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { acelerar, aparar, dividir, duracao, fonteParaLinha, juntarContinuos, localizar, removerTrechos, tamanho } from '../src/linha.js'
import { CURVAS, avaliar, degraus, fatorDuracao, limparPontos, manterDuracao, origemNoClipe, pedacos, reancorar, saidaDoClipe, saidaNoClipe, V_MAX, V_MIN } from '../src/velocidade.js'
import { novoProjeto } from '../src/projeto.js'
import { segmentos } from '../src/exportar/comum.js'
import { paraFcpxml } from '../src/exportar/fcpxml.js'
import { paraXmeml } from '../src/exportar/xmeml.js'
import { paraEdl } from '../src/exportar/edl.js'
import { paraOtio } from '../src/exportar/otio.js'

const curva = (id) => CURVAS.find((c) => c.id === id).pontos
const clipe = (pontos, ini = 0, fim = 300) => ({ id: 'c1', midia: 'm', ini, fim, ...(pontos ? { velocidade: { pontos: limparPontos(pontos) } } : {}) })

function bemFormado(xml) {
  const dir = mkdtempSync(join(tmpdir(), 'aeon-vel-'))
  try {
    writeFileSync(join(dir, 'x.xml'), xml)
    execFileSync('xmllint', ['--noout', join(dir, 'x.xml')], { stdio: 'pipe' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('curva: passa pelos pontos, nunca sai dos limites nem passa do desenho (monótona entre pontos)', () => {
  for (const { pontos } of CURVAS) {
    const ps = limparPontos(pontos)
    for (const [x, v] of ps) assert.ok(Math.abs(avaliar(ps, x) - v) < 1e-6, `passa por ${x}`)
    for (let i = 0; i < ps.length - 1; i++) {
      const [a, b] = [ps[i][1], ps[i + 1][1]]
      for (let k = 1; k < 20; k++) {
        const v = avaliar(ps, ps[i][0] + ((ps[i + 1][0] - ps[i][0]) * k) / 20)
        assert.ok(v >= Math.min(a, b) - 1e-9 && v <= Math.max(a, b) + 1e-9, 'sem pulo fora do desenho')
        assert.ok(v >= V_MIN && v <= V_MAX)
      }
    }
  }
  // 100% em tudo é "sem curva"; pontos fora do lugar são arrumados
  assert.equal(limparPontos([[0, 1], [1, 1]]), null)
  assert.deepEqual(limparPontos([[0.5, 20], [0.2, 0.01]]), [[0, 0.1], [0.2, 0.1], [0.5, 8], [1, 8]])
})

test('degraus: cobrem a origem e a saída sem buraco; 200% constante ocupa metade; Manter duração ocupa o mesmo', () => {
  const r = clipe([[0, 2], [1, 2]])
  assert.equal(saidaDoClipe(r), 150)
  assert.deepEqual(degraus(r), [{ s0: 0, s1: 300, o0: 0, o1: 150, v: 2 }])
  for (const { pontos } of CURVAS) {
    const c = clipe(pontos)
    const ds = degraus(c)
    assert.equal(ds[0].s0, 0)
    assert.equal(ds[0].o0, 0)
    assert.equal(ds.at(-1).s1, 300)
    for (let i = 1; i < ds.length; i++) {
      assert.equal(ds[i].s0, ds[i - 1].s1)
      assert.equal(ds[i].o0, ds[i - 1].o1)
    }
    // a saída é a integral da curva (com o arredondamento de um quadro)
    assert.ok(Math.abs(saidaDoClipe(c) - 300 * fatorDuracao(limparPontos(pontos))) <= 1.5)
    // Manter duração: a mesma forma no mesmo tempo (quando a escala não bate nos limites)
    // (as constantes, 50% e 200%, viram 100%: sem curva)
    const mp = manterDuracao(limparPontos(pontos))
    const m = clipe(mp)
    if (!mp) assert.equal(saidaDoClipe(m), 300)
    else if (mp.every(([, v]) => v > V_MIN && v < V_MAX)) assert.ok(Math.abs(saidaDoClipe(m) - 300) <= 3, `${pontos} mantém`)
  }
  // ida e volta: origem → saída → origem
  const c = clipe(curva('vale'))
  for (const q of [0, 37, 150, 299]) assert.ok(Math.abs(origemNoClipe(c, saidaNoClipe(c, q)) - q) < 1e-6)
})

test('linha: tamanho, localizar e fonteParaLinha seguem a curva; dividir, aparar e cortar mantêm a rampa na mídia', () => {
  let linha = { clipes: [{ id: 'a', midia: 'm', ini: 0, fim: 300 }, { id: 'b', midia: 'n', ini: 0, fim: 60 }] }
  linha = acelerar(linha, 'a', [[0, 1], [0.5, 1], [0.51, 4], [1, 4]])
  const a = linha.clipes[0]
  assert.ok(tamanho(a) < 300 && tamanho(a) > 150)
  assert.equal(duracao(linha), tamanho(a) + 60)
  // no começo (100%) é um para um; no fim (400%) cada quadro da linha anda 4 na origem
  assert.equal(localizar(linha, 10).fonte, 10)
  const fimA = tamanho(a)
  assert.ok(localizar(linha, fimA - 1).fonte >= 296)
  assert.equal(localizar(linha, fimA).clipe.id, 'b')
  assert.equal(fonteParaLinha(linha, 'm', 10), 10)
  // dividir no meio da parte rápida: os dois lados continuam a 400% ali
  const d = dividir(linha, fimA - 20)
  assert.equal(d.clipes.length, 3)
  assert.equal(d.clipes[0].fim, d.clipes[1].ini)
  assert.ok(Math.abs(avaliar(d.clipes[1].velocidade.pontos, 0.5) - 4) < 0.01)
  assert.equal(duracao(d), duracao(linha), 'dividir não muda o tempo')
  // aparar a entrada para dentro da parte rápida: o pedaço que fica continua a 400%
  const ap = aparar(linha, 'a', 'ini', 200)
  assert.ok(Math.abs(avaliar(ap.clipes[0].velocidade.pontos, 0.2) - 4) < 0.01)
  // cortar um silêncio dentro da parte lenta: os pedaços guardam cada um a sua parte da curva
  const cr = removerTrechos(linha, 'm', [{ ini: 100, fim: 120 }])
  assert.equal(cr.clipes[0].velocidade, undefined, 'só 100% sobrou no primeiro pedaço')
  assert.ok(cr.clipes[1].velocidade)
  // acelerado não se junta com o vizinho; voltar a 100% tira a curva
  assert.equal(juntarContinuos(d).clipes.length, 3)
  assert.equal(acelerar(linha, 'a', null).clipes[0].velocidade, undefined)
  assert.equal(acelerar(linha, 'b', null), linha, 'sem mudança, mesma linha (sem passo no desfazer)')
  // reancorar fora do trecho antigo usa a velocidade da ponta
  assert.ok(reancorar([[0, 2], [1, 2]], 0, 100, 50, 200).every(([, v]) => v === 2))
})

test('som só em 100%: os pedaços marcam onde toca; 98% conta como 100%', () => {
  const c = clipe(curva('pico'))
  const ps = pedacos(c, c.ini, c.fim)
  assert.ok(ps.some((p) => p.som) && ps.some((p) => !p.som))
  for (const p of ps) {
    assert.equal(p.som, Math.abs(p.v - 1) <= 0.02)
    assert.ok(p.saida > 0 && p.fim > p.ini)
  }
  assert.equal(ps.reduce((s, p) => s + p.saida, 0), saidaDoClipe(c))
})

function projetoComRampa() {
  let p = novoProjeto({ id: '0b6f3c2a-6d4e-4c1b-9a8f-2e7d5c4b3a21', nome: 'Rampa', midias: [{ id: 'cam', nome: 'Carro.mp4', caminho: '/Volumes/Cartão/Carro.mp4', duracao: 10, fps: 30, largura: 1920, altura: 1080, temVideo: true, temAudio: true, taxa: 48000 }] })
  p = { ...p, linha: acelerar(p.linha, p.linha.clipes[0].id, curva('heroi')) }
  return p
}

test('exportadores: a mesma rampa em degraus no Final Cut (timeMap), no Premiere (Time Remap), no OTIO e no EDL (M2)', () => {
  const p = projetoComRampa()
  const segs = segmentos(p)
  const total = duracao(p.linha)
  assert.ok(segs.length > 3, 'a rampa vira degraus')
  assert.equal(segs.reduce((s, x) => s + x.saida, 0), total, 'os degraus cobrem a linha inteira')
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].linha, segs[i - 1].linha + segs[i - 1].saida)
  const rapidos = segs.filter((s) => s.v !== 1)
  // Final Cut: timeMap linear ancorado no começo da mídia, e −96 dB fora de 100%
  const fcp = paraFcpxml(p)
  bemFormado(fcp)
  assert.equal((fcp.match(/<timeMap>/g) || []).length, rapidos.length)
  assert.match(fcp, /<timept time="0s" value="0s" interp="linear"\/>/)
  assert.equal((fcp.match(/amount="-96dB"/g) || []).length, segs.filter((s) => !s.som).length)
  // Premiere: Time Remap constante; sem clipitem de som onde a velocidade não é 100%
  const xml = paraXmeml(p)
  bemFormado(xml)
  assert.equal((xml.match(/<effectid>timeremap<\/effectid>/g) || []).length, rapidos.length + 2 * segs.filter((s) => s.v !== 1 && s.som).length)
  assert.equal((xml.match(/<sourcetrack>/g) || []).length, 2 * segs.filter((s) => s.som).length)
  // OTIO: LinearTimeWarp e Gap na trilha de som, com as duas trilhas do mesmo tamanho
  const otio = JSON.parse(paraOtio(p))
  const [v1, a1] = otio.tracks.children
  const soma = (t) => t.children.reduce((s, c) => s + c.source_range.duration.value, 0)
  assert.equal(soma(v1), total)
  assert.equal(soma(a1), total)
  assert.equal(v1.children.filter((c) => c.effects.some((e) => e.OTIO_SCHEMA === 'LinearTimeWarp.1')).length, rapidos.length)
  assert.equal(a1.children.filter((c) => c.OTIO_SCHEMA === 'Gap.1').length, segs.filter((s) => !s.som).length)
  // EDL: uma linha M2 por degrau fora de 100%, com a velocidade em quadros por segundo
  const edl = paraEdl(p)
  const m2 = edl.split('\r\n').filter((l) => l.startsWith('M2 '))
  assert.equal(m2.length, rapidos.length)
  assert.match(m2[0], /^M2 {3}CARRO {10}\d{3}\.\d {16}\d\d:\d\d:\d\d:\d\d$/)
})
