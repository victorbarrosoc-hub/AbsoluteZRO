// O cronômetro na barra/bandeja: o formatador de tempo, o estado lido do servidor, o menu, os ajustes, o atalho e o
// controlador inteiro contra um /api/tempo falso (sem Electron).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const tempo = require('../desktop/tempo.cjs')
const { Cronometro } = require('../desktop/cronometro.cjs')
const { Atalho } = require('../desktop/atalho.cjs')
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const MIN = 60_000
const T0 = Date.parse('2026-10-31T13:00:00.000Z')
const iso = (ms) => new Date(ms).toISOString()
const reg = (id, card, inicio, fim, modo = 'livre') => ({
  id,
  sub: 's',
  card,
  inicio: iso(inicio),
  fim: fim === null ? null : iso(fim),
  origem: 'cronometro',
  modo,
  motivo: null,
})
const resposta = (o = {}) => ({
  agora: iso(T0),
  rodando: null,
  hoje: [],
  totais: {},
  cards: {
    'card-a': { id: 'card-a', tema: 'Editar Monstro', cliente: 'c1', coluna: 'producao' },
    'card-b': { id: 'card-b', tema: 'Roteiro do institucional', cliente: null, coluna: 'pauta' },
  },
  clientes: { c1: 'Café Filmes' },
  time: false,
  pode: true,
  ...o,
})

test('formatador: relógio do menu, o curto da barra, a contagem do Pomodoro e a duração curta', () => {
  assert.equal(tempo.relogio(0), '00:00:00')
  assert.equal(tempo.relogio(71 * MIN + 7_900), '01:11:07')
  assert.equal(tempo.relogio(-5), '00:00:00')
  assert.equal(tempo.relogioCurto(71 * MIN + 59_999), '01:11')
  assert.equal(tempo.relogioCurto(25 * 60 * MIN), '25:00')
  assert.equal(tempo.contagem(25 * MIN), '25:00')
  assert.equal(tempo.contagem(24 * MIN + 59_001), '25:00') // arredonda para cima, como o site
  assert.equal(tempo.contagem(-1), '00:00')
  assert.equal(tempo.duracaoCurta(0), '0min')
  assert.equal(tempo.duracaoCurta(20_000), '<1min')
  assert.equal(tempo.duracaoCurta(82 * MIN), '1h 22min')
  assert.equal(tempo.duracaoCurta(120 * MIN), '2h')
})

test('estado: conta do `inicio` do servidor com o desvio do relógio, nunca do relógio do computador', () => {
  const r = reg('r1', 'card-a', T0 - 30 * MIN, null)
  // o computador está 2 min atrasado: o servidor diz T0 quando o computador marca T0 - 2 min
  const e = tempo.lerEstado(resposta({ rodando: r, hoje: [reg('r0', 'card-a', T0 - 120 * MIN, T0 - 100 * MIN), r] }), T0 - 2 * MIN - 100, T0 - 2 * MIN + 100)
  assert.equal(e.desvio, 2 * MIN)
  const agoraServidor = T0 - 2 * MIN + e.desvio // o que o app calcula
  assert.equal(tempo.hojeNoCard(e, 'card-a', agoraServidor), 50 * MIN) // 20 fechados + 30 rodando
  assert.equal(tempo.textoDaBarra({ estado: e, pomodoro: null, agora: agoraServidor, mostrar: true }), '00:50')
  assert.equal(tempo.textoDaBarra({ estado: e, pomodoro: null, agora: agoraServidor, mostrar: false }), '')
  assert.equal(tempo.iconeDaBandeja(e), 'rodando')
  assert.match(tempo.dicaDaBandeja({ estado: e, agora: agoraServidor, situacao: 'ok' }), /^Maestro · 00:50 · Editar Monstro$/)
})

test('estado: o que não tem a forma certa não entra (id de card, hora, rodando com fim)', () => {
  assert.equal(tempo.lerEstado(null), null)
  assert.equal(tempo.lerEstado({ agora: 'ontem' }), null)
  assert.equal(tempo.lerEstado(resposta({ rodando: reg('r1', 'card-a', T0 - MIN, T0) })), null)
  const e = tempo.lerEstado(
    resposta({ hoje: [reg('x', '../etc', T0 - MIN, T0), { id: 'y', card: 'card-a', inicio: 'nada' }, reg('ok', 'card-b', T0 - MIN, T0)] }),
    T0,
    T0,
  )
  assert.deepEqual(
    e.hoje.map((r) => r.id),
    ['ok'],
  )
  assert.equal(tempo.lerEstado(resposta({ pode: false }), T0, T0).pode, false)
})

test('início rápido: os últimos cards do dia, o mais recente primeiro, sem repetir', () => {
  const e = tempo.lerEstado(
    resposta({
      hoje: [
        reg('1', 'card-a', T0 - 300 * MIN, T0 - 280 * MIN),
        reg('2', 'card-b', T0 - 200 * MIN, T0 - 190 * MIN),
        reg('3', 'card-a', T0 - 100 * MIN, T0 - 90 * MIN),
      ],
    }),
    T0,
    T0,
  )
  const u = tempo.ultimosCards(e, T0)
  assert.deepEqual(
    u.map((c) => [c.card, c.tema, c.cliente, c.ms]),
    [
      ['card-a', 'Editar Monstro', 'Café Filmes', 30 * MIN],
      ['card-b', 'Roteiro do institucional', '', 10 * MIN],
    ],
  )
  assert.equal(tempo.ultimoCard(e), 'card-a')
})

const ajustes = tempo.lerAjustes({})
const menuDe = (o) => tempo.montarMenu({ agora: T0, situacao: 'ok', ajustes, plataforma: 'mac', parado: null, atalhoOcupado: false, pomodoro: null, ...o })
const rotulos = (itens) => itens.filter((i) => i.type !== 'separator').map((i) => i.label)

test('menu rodando: tarefa, cliente e tempo, Pausar com o atalho, os outros cards do dia, Pomodoro, Abrir painel', () => {
  const r = reg('r', 'card-a', T0 - 71 * MIN - 7_000, null)
  const e = tempo.lerEstado(resposta({ rodando: r, hoje: [reg('b', 'card-b', T0 - 200 * MIN, T0 - 190 * MIN), r] }), T0, T0)
  const m = menuDe({ estado: e })
  const l = rotulos(m)
  assert.equal(l[0], 'Editar Monstro')
  assert.equal(l[1], 'Café Filmes · 01:11:07')
  const pausar = m.find((i) => i.label === 'Pausar')
  assert.deepEqual(pausar.acao, { tipo: 'pausar' })
  assert.equal(pausar.accelerator, 'Alt+Shift+T')
  const outro = m.find((i) => i.acao && i.acao.tipo === 'iniciar')
  assert.deepEqual(outro.acao, { tipo: 'iniciar', card: 'card-b' })
  assert.match(outro.label, /^Roteiro do institucional · 10min$/)
  assert.ok(!m.some((i) => i.acao && i.acao.card === 'card-a' && i.acao.tipo === 'iniciar')) // o que roda não repete
  assert.ok(l.includes('Pomodoro') && l.includes('Abrir painel') && l.includes('Abrir o Maestro') && l.includes('Sair do Maestro'))
  assert.ok(m.find((i) => i.label === 'Abrir painel').enabled !== false)
})

test('menu parado: Retomar o último card; sem nada no dia, leva ao Quadro', () => {
  const e = tempo.lerEstado(resposta({ hoje: [reg('b', 'card-b', T0 - 200 * MIN, T0 - 190 * MIN)] }), T0, T0)
  const retomar = menuDe({ estado: e }).find((i) => /^Retomar/.test(i.label))
  assert.deepEqual(retomar.acao, { tipo: 'iniciar', card: 'card-b' })
  const vazio = menuDe({ estado: tempo.lerEstado(resposta(), T0, T0) })
  assert.deepEqual(vazio.find((i) => i.acao && i.acao.tipo === 'abrir' && i.acao.caminho).acao, { tipo: 'abrir', caminho: '/app/quadro' })
})

test('menu sem sessão, sem acesso, leitura e sem conexão: diz o porquê, sem ação de tempo', () => {
  for (const [situacao, texto] of [
    ['sem-sessao', /Entre no Maestro/],
    ['sem-acesso', /ainda não tem o Maestro/],
    ['leitura', /só lê/],
    ['sem-conexao', /Sem conexão/],
  ]) {
    const m = menuDe({ estado: null, situacao })
    assert.match(m[0].label, texto)
    assert.ok(!JSON.stringify(m).includes('"pausar"') && !JSON.stringify(m).includes('"iniciar"'))
    assert.equal(m.find((i) => i.label === 'Abrir painel').enabled, false)
  }
})

test('menu com parado pendente: Manter e Descartar, coerente com o site', () => {
  const r = reg('r', 'card-a', T0 - 60 * MIN, null)
  const e = tempo.lerEstado(resposta({ rodando: r, hoje: [r] }), T0, T0)
  const m = menuDe({ estado: e, parado: { desde: T0 - 30 * MIN, ate: T0 - 18 * MIN, registro: 'r' } })
  assert.ok(m.some((i) => i.label === 'Parado 12min. Manter ou descartar?'))
  assert.deepEqual(m.find((i) => i.label === 'Manter').acao, { tipo: 'parado', descartar: false })
  assert.deepEqual(m.find((i) => i.label === 'Descartar 12min').acao, { tipo: 'parado', descartar: true })
})

test('ajustes: padrão mostra o tempo e ⌥⇧T; atalho só da lista fechada; Windows sem "mostrar o tempo"', () => {
  assert.deepEqual(tempo.lerAjustes(undefined), { mostrarTempo: true, atalho: 'Alt+Shift+T' })
  assert.deepEqual(tempo.lerAjustes({ mostrarTempo: false, atalho: null }), { mostrarTempo: false, atalho: null })
  assert.equal(tempo.lerAjustes({ atalho: 'CommandOrControl+Q' }).atalho, 'Alt+Shift+T')
  assert.equal(tempo.nomeDoAtalho('Alt+Shift+T', 'mac'), '⌥⇧T')
  assert.equal(tempo.nomeDoAtalho('Alt+Shift+T', 'windows'), 'Alt+Shift+T')
  const aj = (pl) => menuDe({ estado: null, situacao: 'sem-sessao', plataforma: pl }).find((i) => i.label === 'Ajustes').submenu
  assert.ok(aj('mac').some((i) => i.label === 'Mostrar o tempo na barra' && i.checked === true))
  assert.ok(!aj('windows').some((i) => i.label === 'Mostrar o tempo na barra'))
  const radios = aj('windows').find((i) => /^Atalho/.test(i.label)).submenu
  assert.deepEqual(
    radios.map((i) => [i.label, i.checked]),
    [
      ['Alt+Shift+T', true],
      ['Ctrl+Alt+T', false],
      ['Alt+Shift+Espaço', false],
      ['Sem atalho', false],
    ],
  )
})

test('atalho: nenhum colide com o ⌥T do site nem com os atalhos do menu do app', () => {
  const norm = (a) =>
    a
      .replace(/CmdOrCtrl|CommandOrControl/g, 'Ctrl')
      .split('+')
      .map((s) => s.toLowerCase())
      .sort()
      .join('+')
  const doMenu = [...fs.readFileSync(path.join(RAIZ, 'desktop', 'main.cjs'), 'utf8').matchAll(/accelerator: '([^']+)'/g)].map((m) => norm(m[1]))
  assert.ok(doMenu.length > 5)
  for (const a of tempo.ATALHOS) {
    assert.notEqual(norm(a.id), norm('Alt+T'), `${a.id} é o ⌥T do site`)
    assert.ok(!doMenu.includes(norm(a.id)), `${a.id} já é do menu do app`)
  }
})

function shortcutFalso(ocupados = []) {
  const reg = new Map()
  return {
    reg,
    register: (id, f) => (ocupados.includes(id) || reg.has(id) ? false : (reg.set(id, f), true)),
    unregister: (id) => reg.delete(id),
    isRegistered: (id) => reg.has(id),
  }
}

test('atalho: registra, troca liberando o anterior, desliga e libera ao sair', () => {
  const g = shortcutFalso()
  let toques = 0
  const a = new Atalho({ globalShortcut: g, aoTocar: () => toques++ })
  assert.deepEqual(a.aplicar('Alt+Shift+T'), { ok: true, atual: 'Alt+Shift+T', ocupado: false })
  g.reg.get('Alt+Shift+T')()
  assert.equal(toques, 1)
  a.aplicar('Control+Alt+T')
  assert.deepEqual([...g.reg.keys()], ['Control+Alt+T'])
  assert.deepEqual(a.aplicar(null), { ok: true, atual: null, ocupado: false })
  assert.equal(g.reg.size, 0)
  assert.equal(a.aplicar('Alt+T').ok, false) // fora da lista: nunca vira atalho do sistema
  assert.equal(g.reg.size, 0)
  a.aplicar('Alt+Shift+T')
  a.liberar()
  assert.equal(g.reg.size, 0)
})

test('atalho ocupado por outro app: avisa e volta ao que estava', () => {
  const g = shortcutFalso(['Control+Alt+T'])
  const a = new Atalho({ globalShortcut: g, aoTocar: () => {} })
  a.aplicar('Alt+Shift+T')
  assert.deepEqual(a.aplicar('Control+Alt+T'), { ok: false, atual: 'Alt+Shift+T', ocupado: true })
  assert.deepEqual([...g.reg.keys()], ['Alt+Shift+T'])
})

/* ───── o controlador contra uma rota falsa ───── */

function servidorFalso({ status = 200 } = {}) {
  let agora = T0
  let rodando = reg('r1', 'card-a', T0 - 10 * MIN, null)
  let hoje = [reg('r0', 'card-b', T0 - 120 * MIN, T0 - 100 * MIN), rodando]
  const pedidos = []
  const estado = () => resposta({ agora: iso(agora), rodando, hoje })
  const fetch = async (url, init = {}) => {
    pedidos.push({ url, metodo: init.method, headers: init.headers, corpo: init.body ? JSON.parse(init.body) : null })
    const json = (s, c) => ({ status: s, json: async () => c })
    if (status !== 200) return json(status, { erro: 'x' })
    if (init.method !== 'POST') return json(200, estado())
    const c = JSON.parse(init.body)
    if (c.op === 'pausar' || c.op === 'parado') {
      const fim = c.op === 'parado' ? Date.parse(c.desde) : agora
      hoje = hoje.map((r) => (r.id === rodando?.id ? { ...r, fim: iso(fim) } : r))
      rodando = c.op === 'parado' && c.continuar ? reg('r-novo', rodando.card, agora, null, rodando.modo) : null
      if (rodando) hoje = [...hoje, rodando]
    } else if (c.op === 'iniciar') {
      hoje = hoje.map((r) => (r.id === rodando?.id ? { ...r, fim: iso(agora) } : r))
      rodando = reg(`r-${hoje.length}`, c.card, agora, null, c.modo)
      hoje = [...hoje, rodando]
    }
    const { pode: _p, ...e } = estado()
    void _p
    return json(200, { estado: e })
  }
  return {
    fetch,
    pedidos,
    avancar: (ms) => (agora += ms),
    get agora() {
      return agora
    },
  }
}

function controlador(srv, extra = {}) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-cron-'))
  const site = []
  const avisos = []
  let local = T0
  const c = new Cronometro({
    base: 'https://maestro.absolutezro.com',
    fetch: srv.fetch,
    pasta,
    agoraLocal: () => local,
    avisarSite: (canal, dados) => site.push([canal, dados]),
    notificar: (n) => avisos.push(n),
    ...extra,
  })
  return { c, pasta, site, avisos, andar: (ms) => ((local += ms), srv.avancar(ms)) }
}

test('controlador: lê o estado com credenciais e manda o Origin do Maestro só nas gravações', async () => {
  const srv = servidorFalso()
  const { c, site } = controlador(srv)
  await c.atualizar()
  assert.equal(c.situacao, 'ok')
  assert.equal(c.estado.rodando.card, 'card-a')
  assert.equal(srv.pedidos[0].url, 'https://maestro.absolutezro.com/api/tempo')
  assert.equal(srv.pedidos[0].headers.origin, undefined)
  await c.alternar() // rodando → pausa
  const post = srv.pedidos.find((p) => p.metodo === 'POST')
  assert.deepEqual(post.corpo, { op: 'pausar' })
  assert.equal(post.headers.origin, 'https://maestro.absolutezro.com')
  assert.equal(c.estado.rodando, null)
  assert.ok(site.some(([canal]) => canal === 'mudou'))
  await c.alternar() // parado → retoma o último card do dia
  assert.deepEqual(srv.pedidos.at(-1).corpo, { op: 'iniciar', card: 'card-a', modo: 'livre' })
  assert.equal(c.estado.rodando.card, 'card-a')
})

test('controlador: sem sessão (401), sem acesso (403) e sem rede viram a situação do menu', async () => {
  for (const [status, s] of [
    [401, 'sem-sessao'],
    [403, 'sem-acesso'],
    [500, 'sem-conexao'],
  ]) {
    const { c } = controlador(servidorFalso({ status }))
    await c.atualizar()
    assert.equal(c.situacao, s)
  }
  const { c } = controlador({ fetch: async () => Promise.reject(new Error('offline')) })
  await c.atualizar()
  assert.equal(c.situacao, 'sem-conexao')
})

test('controlador: o Pomodoro termina o foco com a janela fechada (pausa no servidor e notifica) e a pausa avisa no fim', async () => {
  const srv = servidorFalso()
  const { c, site, avisos, andar, pasta } = controlador(srv)
  await c.atualizar()
  await c.passoDoPomodoro('focar', 'card-a')
  assert.deepEqual(srv.pedidos.at(-1).corpo, { op: 'iniciar', card: 'card-a', modo: 'pomodoro' })
  assert.equal(c.pomodoro.fase, 'foco')
  assert.equal(tempo.textoDaBarra({ ...c.retrato(), mostrar: true }), '25:00')
  andar(25 * MIN)
  await c.tick()
  assert.equal(c.pomodoro.fase, 'pausa')
  assert.deepEqual(srv.pedidos.at(-1).corpo, { op: 'pausar' })
  assert.deepEqual(
    avisos.map((a) => a.titulo),
    ['Foco feito.'],
  )
  assert.ok(site.some(([canal, p]) => canal === 'pomodoro' && p.fase === 'pausa'))
  assert.equal(JSON.parse(fs.readFileSync(path.join(pasta, 'cronometro.json'), 'utf8')).pomodoro.fase, 'pausa')
  andar(5 * MIN)
  c.tick()
  assert.equal(c.pomodoro.fase, 'pronto')
  assert.equal(avisos.at(-1).titulo, 'Pausa acabou.')
})

test('controlador: parado pelo sistema pergunta na volta; Descartar fecha em `desde` e recomeça (op parado do site)', async () => {
  const srv = servidorFalso()
  let ocioso = 0
  const { c, avisos, andar, site } = controlador(srv, { ociosoMs: () => ocioso })
  await c.atualizar()
  andar(2 * MIN)
  ocioso = 14 * MIN // longe há 14 min (o padrão pergunta com 10)
  c.conferirOcioso()
  assert.equal(c.parado, null) // ainda longe: não pergunta
  andar(MIN)
  ocioso = 1_000 // voltou
  c.conferirOcioso()
  assert.ok(c.parado)
  assert.equal(c.parado.registro, 'r1')
  assert.equal(avisos.at(-1).motivo, 'parado')
  assert.ok(site.some(([canal, p]) => canal === 'parado' && p && p.registro === 'r1'))
  const desde = c.parado.desde
  await c.resolverParado(true)
  assert.deepEqual(srv.pedidos.at(-1).corpo, { op: 'parado', desde: iso(desde), continuar: true })
  assert.equal(c.parado, null)
  assert.equal(c.estado.rodando.id, 'r-novo')
})

test('controlador: a página no app manda as preferências; "perguntar parado" em 0 não pergunta', async () => {
  const srv = servidorFalso()
  let ocioso = 0
  const { c } = controlador(srv, { ociosoMs: () => ocioso })
  await c.atualizar()
  c.doSite('pomodoro', { config: { focoMin: 50, pausaMin: 10, longaMin: 20, ciclos: 3 }, ociosoMin: 0, fase: 'foco' })
  assert.deepEqual(c.pomodoro.config, { focoMin: 50, pausaMin: 10, longaMin: 20, ciclos: 3 })
  assert.equal(c.pomodoro.fase, 'pronto') // a fase é do app
  ocioso = 60 * MIN
  c.conferirOcioso()
  ocioso = 0
  c.conferirOcioso()
  assert.equal(c.parado, null)
  c.doSite('pomodoro', { config: { focoMin: 999 } })
  assert.equal(c.pomodoro.config.focoMin, 25) // fora dos limites: o padrão
})
