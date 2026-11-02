// TPeasy → Synquei (app/js/tpeasy.js): o registro de leituras vem do código real do TPeasy
// (products/tpeasy/app/js/leituras.js) e o bip é igual ao dele (seno de 1000 Hz que some em 160 ms), por cima de fala e
// palmas sintéticas do próprio Synquei.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scene, mic, cut } from '../app/js/sync/synth.js'
import { SR } from '../app/js/sync/engine.js'
import { acharBips, casar, ehArquivoDeLeituras, juntarLeituras, lerLeituras, resumoLeituras } from '../app/js/tpeasy.js'
import * as TP from '../../tpeasy/app/js/leituras.js'

/** O bip do TPeasy: beep(1000, 160, 0.25), oscilador seno com rampa exponencial até 0,0001 em 160 ms. */
function comBip(sig, t, vol = 0.25) {
  const out = Float32Array.from(sig)
  const n = Math.round(0.16 * SR)
  const k = Math.log(vol / 0.0001) / 0.16
  const i0 = Math.round(t * SR)
  for (let j = 0; j < n && i0 + j < out.length; j++) {
    const s = j / SR
    out[i0 + j] += vol * Math.exp(-k * s) * Math.sin(2 * Math.PI * 1000 * s)
  }
  return out
}

const fala = mic(scene(240, SR, 21), SR, { gain: 0.8, noise: 0.01, seed: 5 })

/** Uma leitura como o TPeasy grava: bip em `t0` (hora do celular), blocos em ms desde o bip. */
function lerNoTpeasy(t0, blocos, { bip = true, durMs = 30_000, titulo = 'Café Aurora' } = {}) {
  const l = TP.comecar({ roteiro: { id: 'maestro-r1-todas', title: titulo, origem: { app: 'maestro', versao: 3 } }, agora: t0, fusoMin: -180, bip, contagem: 3, bloco: blocos[0] })
  for (const [ms, b] of blocos.slice(1).map((b, k) => [b.em, b])) TP.passarBloco(l, { i: b.i, nome: b.nome }, t0 + ms)
  return TP.terminar(l, { agora: t0 + durMs, completo: true })
}
const B = (i, nome, em = 0) => ({ i, nome, em })

test('reconhece o arquivo do TPeasy pelo nome', () => {
  assert.equal(ehArquivoDeLeituras('Cartões/TPeasy-leituras-2026-11-02.jsonl'), true)
  for (const n of ['leituras.jsonl', 'TPeasy-leituras-2026-11-02.json', 'C0001.MP4']) assert.equal(ehArquivoDeLeituras(n), false, n)
})

test('lê o .jsonl do TPeasy: linha ruim fica de fora, repetida conta uma vez', () => {
  const l1 = lerNoTpeasy(Date.UTC(2026, 10, 2, 17, 0, 0), [B(0, 'Cena 1 · Abertura'), B(1, 'Cena 2 · Produto', 12_000)])
  const l2 = lerNoTpeasy(Date.UTC(2026, 10, 2, 17, 5, 0), [B(0, 'Cena 1 · Abertura')])
  const texto = TP.paraJsonl([l2, l1, l1]) + 'não é json\n{"contrato":"tpeasy.leituras/1"}\n' + JSON.stringify({ ...l1, id: 'l' + '0'.repeat(18), duracao_ms: 1 }) + '\n'
  const r = lerLeituras(texto)
  assert.deepEqual(r.invalidas, [4, 5, 6])
  assert.equal(r.leituras.length, 2)
  assert.deepEqual(r.leituras.map((l) => l.id), [l1.id, l2.id], 'em ordem de hora')
  assert.deepEqual(r.leituras[0].blocos.map((b) => [b.nome, b.em_ms]), [['Cena 1 · Abertura', 0], ['Cena 2 · Produto', 12_000]])
  assert.deepEqual(r.leituras[0].roteiro, { id: 'maestro-r1-todas', titulo: 'Café Aurora', versao: 3 })
  assert.equal(juntarLeituras(r.leituras, lerLeituras(TP.paraJsonl([l1])).leituras).length, 2)
})

test('acha o bip do TPeasy (forte, e baixinho na pausa da contagem), com 2 ms de precisão', () => {
  let sig = cut(fala, SR, 10, 60)
  sig = comBip(sig, 4.2)
  // o bip toca no fim da contagem, com a pessoa calada: aqui, na pausa entre duas falas e 18 dB mais baixo
  sig = comBip(sig, 19.95, 0.03)
  const bips = acharBips(sig, SR)
  assert.equal(bips.length, 2, JSON.stringify(bips))
  assert.ok(Math.abs(bips[0].t - 4.2) <= 0.002, String(bips[0].t))
  assert.ok(Math.abs(bips[1].t - 19.95) <= 0.002, String(bips[1].t))
})

test('uma hora de fala e palmas sintéticas, com microfones diferentes: no máximo 1 bip falso', () => {
  let falsos = 0
  for (let s = 1; s <= 12; s++) falsos += acharBips(mic(scene(300, SR, s), SR, { gain: 0.5 + s * 0.1, lowpass: (s % 3) * 0.3, echoMs: s * 3, echo: 0.3, noise: 0.003 * s, seed: s }), SR).length
  // e um bip falso só vira leitura se cair a 1,5 s da hora prevista de uma, com o relógio confirmado por outros takes
  assert.ok(falsos <= 1, String(falsos))
})

test('fala, palmas e a contagem do TPeasy (660 Hz) não viram bip', () => {
  let sig = cut(fala, SR, 0, 200)
  // as batidas da contagem: beep(660, 70, 0.08)
  for (const t of [20, 21, 22]) {
    for (let j = 0; j < 0.07 * SR; j++) sig[Math.round(t * SR) + j] += 0.08 * Math.exp(-(Math.log(0.08 / 0.0001) / 0.07) * (j / SR)) * Math.sin(2 * Math.PI * 660 * (j / SR))
  }
  assert.deepEqual(acharBips(sig, SR), [])
  assert.deepEqual(acharBips(new Float32Array(SR * 5), SR), [], 'silêncio')
})

// Gravação de verdade: o celular lê 3 takes; a câmera A está 2 h à frente (gravou hora local como UTC) + 7,4 s de
// relógio; a câmera B está 41 s atrás e pegou só os dois primeiros.
const T0 = Date.UTC(2026, 10, 2, 17, 0, 0)
const takes = [
  lerNoTpeasy(T0, [B(0, 'Cena 1 · Abertura'), B(1, 'Cena 2 · Produto', 12_000)]),
  lerNoTpeasy(T0 + 3 * 60_000, [B(1, 'Cena 2 · Produto')], { durMs: 20_000 }),
  lerNoTpeasy(T0 + 7 * 60_000, [B(2, 'Cena 3 · Chamada')], { durMs: 15_000 }),
]
const { leituras } = lerLeituras(TP.paraJsonl(takes))
const clipe = (id, device, inicioCelular, relogio, bipNoClipe, dur = 40) => ({ id, device, created: inicioCelular - bipNoClipe * 1000 + relogio, dur, bips: bipNoClipe == null ? [] : [{ t: bipNoClipe }] })
const A = 2 * 3_600_000 + 7_400
const Bc = -41_000

test('casa cada take com a leitura e põe os blocos no ponto certo do clipe', () => {
  const clipes = [
    clipe('A1', 'A', T0, A, 3.1),
    clipe('A2', 'A', T0 + 3 * 60_000, A, 2.4),
    clipe('A3', 'A', T0 + 7 * 60_000, A, 5.0),
    clipe('B1', 'B', T0, Bc, 1.2),
    clipe('B2', 'B', T0 + 3 * 60_000, Bc, 0.9),
  ]
  const r = casar(clipes, leituras)
  assert.equal(r.size, 5)
  for (const c of clipes) assert.equal(r.get(c.id).estado, 'confirmado', c.id)
  assert.deepEqual(r.get('A1').marcadores.map((m) => [m.t, m.nome]), [[3.1, 'Cena 1 · Abertura'], [15.1, 'Cena 2 · Produto']])
  assert.deepEqual(r.get('B2').marcadores.map((m) => [m.t, m.nome]), [[0.9, 'Cena 2 · Produto']])
  assert.equal(r.get('A3').leituras[0].id, takes[2].id)
  assert.equal(r.get('A1').leituras[0].titulo, 'Café Aurora')
  const p = { tpeasy: { leituras }, clips: clipes.map((c) => ({ id: c.id, tpeasy: { ...r.get(c.id), aceito: c.id === 'A1' } })) }
  assert.deepEqual(resumoLeituras(p), { leituras: 3, confirmados: 5, revisar: 0, aceitos: 1 })
})

test('marcador depois do fim do clipe fica de fora', () => {
  const r = casar([clipe('A1', 'A', T0, A, 3.1, 10), clipe('A2', 'A', T0 + 3 * 60_000, A, 2.4)], leituras)
  assert.deepEqual(r.get('A1').marcadores.map((m) => m.nome), ['Cena 1 · Abertura'])
})

test('um take só, leitura sem bip, bip fora de hora e bip ambíguo vão para revisar', () => {
  // um take só: a hora bate dentro de 15 min, mas não há outro take para conferir o relógio
  const so = casar([clipe('X', 'X', T0, 30_000, 2)], leituras)
  assert.equal(so.get('X').estado, 'revisar')
  assert.match(so.get('X').motivo, /Um take só/)
  // um take só com o relógio muito longe: nada
  assert.equal(casar([clipe('X', 'X', T0, 5 * 3_600_000, 2)], leituras).size, 0)
  // leitura sem bip: casada pela hora só porque os outros takes do aparelho confirmaram o relógio
  const semBip = lerLeituras(TP.paraJsonl([...takes, lerNoTpeasy(T0 + 10 * 60_000, [B(0, 'Cena 4 · Extra')], { bip: false })])).leituras
  const r = casar([clipe('A1', 'A', T0, A, 3.1), clipe('A2', 'A', T0 + 3 * 60_000, A, 2.4), { id: 'A4', device: 'A', created: T0 + 10 * 60_000 - 5000 + A, dur: 30, bips: [] }], semBip)
  assert.equal(r.get('A4').estado, 'revisar')
  assert.match(r.get('A4').motivo, /sem bip/)
  assert.deepEqual(r.get('A4').marcadores.map((m) => [m.t, m.nome]), [[5, 'Cena 4 · Extra']])
  // duas leituras com 1 s de diferença: o mesmo bip serve para as duas
  const perto = lerLeituras(TP.paraJsonl([...takes, lerNoTpeasy(T0 + 1000, [B(0, 'Outra')])])).leituras
  const amb = casar([clipe('A1', 'A', T0, A, 3.1), clipe('A2', 'A', T0 + 3 * 60_000, A, 2.4)], perto)
  assert.equal(amb.get('A1').estado, 'revisar')
  assert.match(amb.get('A1').motivo, /Mais de uma leitura/)
  assert.equal(amb.get('A2').estado, 'confirmado')
})

test('sem hora da câmera ou sem leitura: nada é inventado', () => {
  assert.equal(casar([{ id: 'A1', device: 'A', created: null, dur: 40, bips: [{ t: 2 }] }], leituras).size, 0)
  assert.equal(casar([clipe('A1', 'A', T0, A, 3.1)], []).size, 0)
})

// ───────── dentro do Synquei: o arquivo solto com as pastas e os marcadores na exportação ─────────
import { scanEntries } from '../app/js/media/scan.js'
import { newProject } from '../app/js/project.js'
import { buildTimelines } from '../app/js/export/model.js'
import { toXmeml } from '../app/js/export/xmeml.js'

test('o .jsonl do TPeasy solto com os cartões vai para as leituras, não vira clipe', () => {
  const f = (name) => ({ file: new File(['x'], name.split('/').pop()), path: name })
  const r = scanEntries([f('CAM A/C0001.MP4'), f('CAM A/TPeasy-leituras-2026-11-02.jsonl'), f('CAM A/Synquei/preparos.jsonl')])
  assert.deepEqual(r.media.map((m) => m.relPath), ['CAM A/C0001.MP4'])
  assert.deepEqual(r.leituras.map((l) => l.relPath), ['CAM A/TPeasy-leituras-2026-11-02.jsonl'])
  assert.deepEqual(r.ignored.map((i) => i.relPath).sort(), ['CAM A/Synquei/preparos.jsonl', 'CAM A/TPeasy-leituras-2026-11-02.jsonl'])
})

test('os blocos aceitos viram marcadores na exportação; os não aceitos, não', () => {
  const p = newProject('Café Aurora')
  p.devices = [{ id: 'd1', label: 'CAM A', kind: 'camera', color: 0 }]
  const base = { kind: 'video', deviceId: 'd1', status: 'ready', audioStatus: 'ok', duration: 40, video: { codec: 'H.264', width: 1920, height: 1080, rate: { num: 25, den: 1 } }, audio: { codec: 'AAC', sampleRate: 48000, channels: 2 }, relPath: 'CAM A/x.MP4', size: 1 }
  const r = casar([clipe('A1', 'A', T0, A, 3.1), clipe('A2', 'A', T0 + 3 * 60_000, A, 2.4)], leituras)
  p.clips = [
    { ...base, id: 'A1', name: 'C0001.MP4', sync: { pos: 0, conf: 1, method: 'audio' }, tpeasy: { ...r.get('A1'), aceito: true } },
    { ...base, id: 'A2', name: 'C0002.MP4', sync: { pos: 60, conf: 1, method: 'audio' }, tpeasy: { ...r.get('A2'), aceito: false } },
  ]
  p.sessions = [{ id: 's1', group: 0, start: 0, end: 100, clipIds: ['A1', 'A2'], name: 'Sessão 1' }]
  const [tl] = buildTimelines(p)
  assert.deepEqual(tl.markers.map((m) => [m.start, m.name]), [[3.1, 'Cena 1 · Abertura'], [15.1, 'Cena 2 · Produto']])
  const xml = toXmeml([tl], p)
  assert.match(xml, /<comment>TPeasy · C0001\.MP4<\/comment>\s*<name>Cena 2 · Produto<\/name>\s*<in>378<\/in>/, '15,1 s a 25 qps')
})
