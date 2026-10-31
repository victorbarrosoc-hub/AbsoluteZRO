// O Pomodoro e o parado do app (pomodoro.cjs, ocioso.cjs): as mesmas regras do site, medidas no relógio do servidor.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const P = require('../desktop/pomodoro.cjs')
const O = require('../desktop/ocioso.cjs')
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'lib', 'tempo', 'calculo.ts')

const MIN = 60_000
const T0 = Date.parse('2026-10-31T13:00:00.000Z')
const iso = (ms) => new Date(ms).toISOString()
const rod = (id, inicio, modo = 'pomodoro') => ({ id, card: 'card-a', inicio: iso(inicio), fim: null, modo })

test('os padrões e os limites são os do site (src/lib/tempo/calculo.ts)', () => {
  const site = fs.readFileSync(SITE, 'utf8')
  assert.match(site, /POMODORO_PADRAO: ConfigPomodoro = \{ focoMin: 25, pausaMin: 5, longaMin: 15, ciclos: 4 \}/)
  assert.match(site, /OCIOSO_PADRAO_MIN = 10;/)
  assert.match(site, /focoMin: n\("focoMin", 5, 120\), pausaMin: n\("pausaMin", 1, 30\), longaMin: n\("longaMin", 5, 60\), ciclos: n\("ciclos", 2, 8\)/)
  assert.deepEqual(P.PADRAO, { focoMin: 25, pausaMin: 5, longaMin: 15, ciclos: 4 })
  assert.equal(P.OCIOSO_PADRAO_MIN, 10)
  assert.deepEqual(P.lerConfig({ focoMin: 4, pausaMin: 31, longaMin: 60, ciclos: 2.5 }), { focoMin: 25, pausaMin: 5, longaMin: 60, ciclos: 4 })
  assert.deepEqual(P.lerPomodoro({ fase: 'dormindo', feitos: -1 }).fase, 'pronto')
})

test('foco: termina no tempo, pausa o cronômetro e começa a pausa; a quarta é a longa', () => {
  let p = P.observar(P.lerPomodoro({}), null, { rodando: rod('a', T0), hoje: [] }, T0)
  assert.equal(p.fase, 'foco')
  assert.deepEqual(P.passo(p, rod('a', T0), T0 + 24 * MIN).efeitos, [])
  let r = P.passo(p, rod('a', T0), T0 + 25 * MIN)
  assert.equal(r.p.fase, 'pausa')
  assert.equal(r.p.feitos, 1)
  assert.equal(r.p.pausaMs, 5 * MIN)
  assert.deepEqual(r.efeitos[0], { tipo: 'pausar' })
  assert.deepEqual(r.efeitos[1], { tipo: 'notificar', titulo: 'Foco feito.', corpo: 'Pausa de 5 min.' })
  p = { ...r.p, feitos: 3, fase: 'foco' }
  r = P.passo(p, rod('b', T0), T0 + 25 * MIN)
  assert.equal(r.p.fase, 'longa')
  assert.equal(r.p.pausaMs, 15 * MIN)
  assert.equal(r.efeitos[1].corpo, 'Pausa longa de 15 min.')
})

test('pausa: acaba no tempo e avisa; "Encerrar a pausa" e o site pulando a pausa voltam ao pronto', () => {
  const p = P.iniciarPausa(P.lerPomodoro({}), T0)
  assert.equal(p.fase, 'pausa')
  assert.deepEqual(P.passo(p, null, T0 + 4 * MIN).efeitos, [])
  const r = P.passo(p, null, T0 + 5 * MIN)
  assert.equal(r.p.fase, 'pronto')
  assert.deepEqual(r.efeitos, [{ tipo: 'notificar', titulo: 'Pausa acabou.', corpo: 'Pronto para focar.' }])
  assert.equal(P.encerrarPausa(p).fase, 'pronto')
  assert.equal(P.doSite(p, { fase: 'pronto' }).fase, 'pronto')
  assert.equal(P.doSite(p, { fase: 'foco' }).fase, 'pausa') // a fase é do app; o site só encerra a pausa
})

test('pausou no meio do foco: guarda o feito pela hora de fim gravada; retomar continua de onde parou', () => {
  const a = rod('a', T0)
  let p = P.observar(P.lerPomodoro({}), null, { rodando: a, hoje: [a] }, T0)
  // pausou em outro aparelho às T0+10; o app só soube às T0+12: vale a hora gravada
  p = P.observar(p, { rodando: a, hoje: [a] }, { rodando: null, hoje: [{ ...a, fim: iso(T0 + 10 * MIN) }] }, T0 + 12 * MIN)
  assert.equal(p.fase, 'pronto')
  assert.equal(p.acumulado, 10 * MIN)
  const b = rod('b', T0 + 20 * MIN)
  p = P.observar(p, { rodando: null, hoje: [] }, { rodando: b, hoje: [b] }, T0 + 20 * MIN)
  assert.equal(p.fase, 'foco')
  assert.deepEqual(P.passo(p, b, T0 + 34 * MIN).efeitos, [])
  assert.equal(P.passo(p, b, T0 + 35 * MIN).p.fase, 'pausa')
})

test('modo livre não é foco', () => {
  const p = P.observar(P.lerPomodoro({}), null, { rodando: rod('a', T0, 'livre'), hoje: [] }, T0)
  assert.equal(p.fase, 'pronto')
  assert.deepEqual(P.passo(p, rod('a', T0, 'livre'), T0 + 90 * MIN).efeitos, [])
})

test('parado: só pergunta na volta, com o cronômetro rodando desde antes, e a partir do limite', () => {
  const r = { id: 'r', inicio: iso(T0) }
  let o = O.novo()
  // 12 min longe: guarda; ainda não pergunta
  let x = O.conferir(o, { agora: T0 + 20 * MIN, ociosoMs: 12 * MIN, rodando: r, limiteMin: 10 })
  assert.equal(x.pergunta, null)
  assert.equal(x.o.ausenteDesde, T0 + 8 * MIN)
  x = O.conferir(x.o, { agora: T0 + 21 * MIN, ociosoMs: 500, rodando: r, limiteMin: 10 })
  assert.deepEqual(x.pergunta, { desde: T0 + 8 * MIN, ate: T0 + 21 * MIN - 500, registro: 'r' })
  // abaixo do limite: nada
  o = O.conferir(O.novo(), { agora: T0 + 20 * MIN, ociosoMs: 8 * MIN, rodando: r, limiteMin: 10 }).o
  assert.equal(O.conferir(o, { agora: T0 + 21 * MIN, ociosoMs: 0, rodando: r, limiteMin: 10 }).pergunta, null)
  // começou a rodar depois de a pessoa sair: conta do início da sessão
  o = O.conferir(O.novo(), { agora: T0 + 30 * MIN, ociosoMs: 40 * MIN, rodando: r, limiteMin: 10 }).o
  assert.equal(O.conferir(o, { agora: T0 + 31 * MIN, ociosoMs: 0, rodando: r, limiteMin: 10 }).pergunta.desde, T0)
  // sem rodar, ou "perguntar parado após" = 0: nunca
  assert.equal(O.conferir(o, { agora: T0 + 31 * MIN, ociosoMs: 0, rodando: null, limiteMin: 10 }).pergunta, null)
  assert.equal(O.conferir(o, { agora: T0 + 31 * MIN, ociosoMs: 0, rodando: r, limiteMin: 0 }).pergunta, null)
})

test('parado: o computador dormiu (suspensão) conta desde a hora em que dormiu', () => {
  const r = { id: 'r', inicio: iso(T0) }
  const o = O.suspender(O.novo(), T0 + 5 * MIN)
  assert.equal(O.suspender(o, T0 + 6 * MIN).ausenteDesde, T0 + 5 * MIN)
  const x = O.conferir(o, { agora: T0 + 65 * MIN, ociosoMs: 0, rodando: r, limiteMin: 10 })
  assert.deepEqual(x.pergunta, { desde: T0 + 5 * MIN, ate: T0 + 65 * MIN, registro: 'r' })
})
