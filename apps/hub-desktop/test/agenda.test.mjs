// Agenda de atualização dos apps: confere ao abrir e a cada poucas horas, baixa e confere em segundo plano, instala
// quando o app está fechado, "atualiza ao fechar" quando está aberto e "Reiniciar e atualizar".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { AgendaDeApps, decidir, proximaConferencia, INTERVALO_MS } = require('../desktop/agenda.cjs')
const { ErroCentral } = require('../desktop/central.cjs')

function relogioFalso(inicio = 0) {
  let agora = inicio
  let timers = []
  const r = {
    agora: () => agora,
    depois: (ms, fn) => {
      const t = { em: agora + ms, fn }
      timers.push(t)
      return t
    },
    cancelar: (t) => {
      timers = timers.filter((x) => x !== t)
    },
    esperar: async (ms) => {
      agora += ms
    },
    /** Avança o relógio rodando o que vencer (e esperando cada um terminar). */
    async avancar(ms) {
      const fim = agora + ms
      for (;;) {
        timers.sort((a, b) => a.em - b.em)
        const t = timers[0]
        if (!t || t.em > fim) break
        timers.shift()
        agora = Math.max(agora, t.em)
        await t.fn()
      }
      agora = fim
    },
    pendentes: () => timers.length,
  }
  return r
}

function centralFalsa(apps) {
  const chamadas = []
  const c = {
    chamadas,
    apps,
    async carregarCatalogo() {
      chamadas.push(['catalogo'])
    },
    async listar() {
      return Object.entries(apps).map(([id, a]) => ({
        id,
        nome: a.nome,
        disponivel: { versao: a.nova, build: 1, tamanho: 10 },
        instalado: a.instalada ? { versao: a.instalada } : null,
        atualizar: !!a.instalada && a.instalada !== a.nova,
        gerenciavel: a.gerenciavel !== false,
      }))
    },
    async prebaixar(id) {
      chamadas.push(['prebaixar', id])
      if (apps[id].falhaDownload) throw new ErroCentral('download', 'Não deu para baixar agora. Tente de novo.')
      return { versao: apps[id].nova }
    },
    async aberto(id) {
      return !!apps[id].aberto
    },
    async instalar(id) {
      chamadas.push(['instalar', id])
      if (apps[id].aberto) throw new ErroCentral('aberto', `Feche o ${apps[id].nome} para atualizar.`)
      apps[id].instalada = apps[id].nova
      return true
    },
    async fechar(id) {
      chamadas.push(['fechar', id])
      if (apps[id].fechaQuandoPede) apps[id].aberto = false
      return true
    },
    async abrir(id) {
      chamadas.push(['abrir', id])
      apps[id].aberto = true
      return true
    },
  }
  return c
}

function montar(apps, extra = {}) {
  const relogio = relogioFalso(Date.parse('2026-10-28T12:00:00Z'))
  const central = centralFalsa(apps)
  const avisos = []
  const marcados = []
  const agenda = new AgendaDeApps({
    central,
    relogio,
    notificar: (n) => avisos.push(n),
    // os testes de antes cobrem o "Atualizar sozinho" ligado; o padrão (desligado) tem testes próprios no fim
    atualizarSozinho: () => true,
    marcarGerenciados: (ids) => marcados.push(ids),
    primeiraMs: 20_000,
    intervaloMs: INTERVALO_MS,
    esperaMs: 120_000,
    fecharMs: 60_000,
    ...extra,
  })
  return { agenda, central, relogio, avisos, marcados }
}

test('decidir: instala fechado, espera aberto, ignora o que não precisa ou que a central não pode trocar', () => {
  const s = { instalado: { versao: '1.0.0' }, atualizar: true, gerenciavel: true, disponivel: { versao: '1.1.0' } }
  assert.equal(decidir(s, false), 'instalar')
  assert.equal(decidir(s, true), 'esperar')
  assert.equal(decidir({ ...s, atualizar: false }, false), 'nada')
  assert.equal(decidir({ ...s, gerenciavel: false }, false), 'nada')
  assert.equal(decidir({ ...s, instalado: null }, false), 'nada')
  assert.equal(decidir(undefined, false), 'nada')
})

test('agenda: confere 20 s depois de abrir e de novo a cada 4 horas', async () => {
  const { agenda, central, relogio } = montar({ synquei: { nome: 'Synquei', instalada: '1.2.0', nova: '1.2.0' } })
  agenda.iniciar()
  await relogio.avancar(19_000)
  assert.equal(central.chamadas.filter((c) => c[0] === 'catalogo').length, 0)
  await relogio.avancar(2_000)
  assert.equal(central.chamadas.filter((c) => c[0] === 'catalogo').length, 1)
  await relogio.avancar(INTERVALO_MS - 10_000)
  assert.equal(central.chamadas.filter((c) => c[0] === 'catalogo').length, 1)
  await relogio.avancar(20_000)
  assert.equal(central.chamadas.filter((c) => c[0] === 'catalogo').length, 2)
  agenda.parar()
  assert.equal(relogio.pendentes(), 0)
  assert.equal(proximaConferencia(NaN, 0), 60_000)
  assert.equal(proximaConferencia(0, 1000, 10_000, 0), 9_000)
})

test('app fechado com versão nova: baixa, confere, instala e avisa; a lista de gerenciados é gravada', async () => {
  const { agenda, central, avisos, marcados } = montar({
    sobedesce: { nome: 'SOBEDESCE', instalada: '1.0.0', nova: '1.1.0' },
    synquei: { nome: 'Synquei', instalada: null, nova: '1.2.0' },
    nossom: { nome: 'NOSSOM', instalada: '0.2.0', nova: '0.3.0', gerenciavel: false },
  })
  const fases = []
  agenda.on('mudou', (e) => fases.push(e.pendentes.map((p) => `${p.id}:${p.fase}`).join(',')))
  const e = await agenda.conferir()
  assert.deepEqual(
    central.chamadas.filter((c) => c[0] !== 'catalogo'),
    [
      ['prebaixar', 'sobedesce'],
      ['instalar', 'sobedesce'],
    ],
    'nada para o que não está instalado nem para o que a central não pode trocar',
  )
  assert.ok(fases.includes('sobedesce:baixando') && fases.includes('sobedesce:instalando'))
  assert.deepEqual(e.pendentes, [])
  assert.deepEqual(avisos, [{ id: 'sobedesce', titulo: 'SOBEDESCE atualizado', corpo: 'Versão 1.1.0.' }])
  assert.deepEqual(marcados.at(-1), ['sobedesce'])
  assert.deepEqual(
    e.apps.map((a) => [a.id, a.versao]),
    [
      ['sobedesce', '1.1.0'],
      ['nossom', '0.2.0'],
    ],
  )
})

test('app aberto: fica "atualiza ao fechar" (avisa uma vez) e instala sozinho quando a pessoa fecha', async () => {
  const apps = { sobedesce: { nome: 'SOBEDESCE', instalada: '1.0.0', nova: '1.1.0', aberto: true } }
  const { agenda, central, relogio, avisos } = montar(apps)
  await agenda.conferir()
  assert.deepEqual(
    agenda.estado().pendentes.map((p) => [p.id, p.fase]),
    [['sobedesce', 'ao-fechar']],
  )
  assert.deepEqual(avisos, [{ id: 'sobedesce', titulo: 'SOBEDESCE 1.1.0 está pronto', corpo: 'Atualiza quando você fechar o app.' }])
  assert.equal(
    central.chamadas.some((c) => c[0] === 'instalar'),
    false,
    'não instala com o app aberto',
  )
  assert.equal(agenda.situacao('sobedesce').fase, 'ao-fechar')
  // a próxima conferência não avisa de novo nem baixa outra vez à toa
  await agenda.conferir()
  assert.equal(avisos.length, 1)
  await relogio.avancar(120_000)
  assert.equal(agenda.estado().pendentes[0].fase, 'ao-fechar', 'ainda aberto: continua esperando')
  apps.sobedesce.aberto = false
  await relogio.avancar(120_000)
  assert.deepEqual(agenda.estado().pendentes, [])
  assert.equal(apps.sobedesce.instalada, '1.1.0')
  assert.equal(avisos.at(-1).titulo, 'SOBEDESCE atualizado')
  assert.equal(relogio.pendentes(), 0, 'sem nada esperando, a vigia para')
  assert.equal(
    central.chamadas.some((c) => c[0] === 'fechar'),
    false,
    'nunca fecha o app sozinho',
  )
})

test('Reiniciar e atualizar: pede para o app sair, instala e abre de novo', async () => {
  const apps = { synquei: { nome: 'Synquei', instalada: '1.1.0', nova: '1.2.0', aberto: true, fechaQuandoPede: true } }
  const { agenda, central } = montar(apps)
  await agenda.conferir()
  assert.equal(await agenda.reiniciarEAtualizar('synquei'), true)
  assert.deepEqual(
    central.chamadas.filter((c) => ['fechar', 'instalar', 'abrir'].includes(c[0])),
    [
      ['fechar', 'synquei'],
      ['instalar', 'synquei'],
      ['abrir', 'synquei'],
    ],
  )
  assert.equal(apps.synquei.instalada, '1.2.0')
  assert.deepEqual(agenda.estado().pendentes, [])
})

test('Reiniciar e atualizar: se o app não fechar (a pessoa cancelou), volta para "ao fechar" sem forçar', async () => {
  const apps = { synquei: { nome: 'Synquei', instalada: '1.1.0', nova: '1.2.0', aberto: true } }
  const { agenda, central } = montar(apps)
  await agenda.conferir()
  assert.equal(await agenda.reiniciarEAtualizar('synquei'), false)
  assert.equal(agenda.estado().pendentes[0].fase, 'ao-fechar')
  assert.equal(
    central.chamadas.some((c) => c[0] === 'instalar'),
    false,
  )
  assert.equal(await agenda.reiniciarEAtualizar('outro'), false)
})

test('Atualizar tudo: reinicia o que está aberto e tenta de novo o que deu erro no download', async () => {
  const apps = {
    sobedesce: { nome: 'SOBEDESCE', instalada: '1.0.0', nova: '1.1.0', falhaDownload: true },
    synquei: { nome: 'Synquei', instalada: '1.1.0', nova: '1.2.0', aberto: true, fechaQuandoPede: true },
  }
  const { agenda } = montar(apps)
  await agenda.conferir()
  assert.deepEqual(
    agenda.estado().pendentes.map((p) => [p.id, p.fase]),
    [
      ['sobedesce', 'erro'],
      ['synquei', 'ao-fechar'],
    ],
  )
  assert.match(agenda.estado().pendentes[0].erro, /baixar/)
  apps.sobedesce.falhaDownload = false
  await agenda.atualizarTudo()
  assert.deepEqual(agenda.estado().pendentes, [])
  assert.deepEqual([apps.sobedesce.instalada, apps.synquei.instalada], ['1.1.0', '1.2.0'])
})

test('Atualizar pela página com o app aberto: agenda para quando fechar', async () => {
  const apps = { sobedesce: { nome: 'SOBEDESCE', instalada: '1.0.0', nova: '1.1.0', aberto: true } }
  const { agenda, central } = montar(apps)
  assert.deepEqual(await agenda.atualizarAoFechar('sobedesce'), { fase: 'ao-fechar', versao: '1.1.0' })
  assert.ok(central.chamadas.some((c) => c[0] === 'prebaixar'))
  apps.sobedesce.gerenciavel = false
  const outra = montar({ synquei: { nome: 'Synquei', instalada: '1.0.0', nova: '1.1.0', aberto: true, gerenciavel: false } })
  assert.equal(await outra.agenda.atualizarAoFechar('synquei'), null)
})

test('conferir duas vezes ao mesmo tempo faz uma conferência só; erro do catálogo não derruba', async () => {
  const { agenda, central } = montar({ synquei: { nome: 'Synquei', instalada: '1.2.0', nova: '1.2.0' } })
  await Promise.all([agenda.conferir(), agenda.conferir()])
  assert.equal(central.chamadas.filter((c) => c[0] === 'catalogo').length, 1)
  central.carregarCatalogo = async () => {
    throw new Error('sem rede')
  }
  const e = await agenda.conferir()
  assert.equal(e.procurando, false)
})

// Central única (ADR 0035): o padrão é avisar e esperar a pessoa; "Atualizar sozinho" é por app, nos Ajustes.
test('padrão: versão nova não instala sozinha; avisa uma vez por versão ("Maestro 0.3.0 disponível") e espera', async () => {
  const apps = { maestro: { nome: 'Maestro', instalada: '0.2.0', nova: '0.3.0' } }
  const { agenda, central, avisos } = montar(apps, { atualizarSozinho: () => false })
  await agenda.conferir()
  assert.deepEqual(
    agenda.estado().pendentes.map((p) => [p.id, p.fase, p.versao]),
    [['maestro', 'disponivel', '0.3.0']],
  )
  assert.equal(central.chamadas.filter((c) => c[0] === 'prebaixar' || c[0] === 'instalar').length, 0, 'nada baixa nem instala sozinho')
  assert.deepEqual(avisos, [{ id: 'maestro', acao: 'atualizar', titulo: 'Maestro 0.3.0 disponível', corpo: 'Clique para atualizar.' }])
  await agenda.conferir()
  assert.equal(avisos.length, 1, 'a mesma versão não avisa de novo')
  apps.maestro.nova = '0.3.1'
  await agenda.conferir()
  assert.equal(avisos.at(-1).titulo, 'Maestro 0.3.1 disponível')
})

test('padrão: várias versões novas viram uma notificação só, com Atualizar tudo', async () => {
  const apps = {
    maestro: { nome: 'Maestro', instalada: '0.2.0', nova: '0.3.0' },
    relay: { nome: 'Relay', instalada: '1.0.0', nova: '1.1.0' },
  }
  const { agenda, avisos } = montar(apps, { atualizarSozinho: () => false })
  await agenda.conferir()
  assert.deepEqual(avisos, [{ acao: 'atualizar-tudo', titulo: '2 atualizações disponíveis', corpo: 'Maestro 0.3.0 · Relay 1.1.0' }])
  await agenda.atualizarTudo()
  assert.deepEqual([apps.maestro.instalada, apps.relay.instalada], ['0.3.0', '1.1.0'])
  assert.deepEqual(agenda.estado().pendentes, [])
})

test('Atualizar (um app): fechado instala agora com progresso pela central; aberto fica para quando fechar', async () => {
  const apps = {
    maestro: { nome: 'Maestro', instalada: '0.2.0', nova: '0.3.0' },
    relay: { nome: 'Relay', instalada: '1.0.0', nova: '1.1.0', aberto: true },
  }
  const { agenda, central, avisos } = montar(apps, { atualizarSozinho: () => false })
  await agenda.conferir()
  assert.deepEqual(await agenda.atualizar('maestro'), { fase: 'pronto', versao: '0.3.0' })
  assert.equal(apps.maestro.instalada, '0.3.0')
  assert.ok(central.chamadas.some((c) => c[0] === 'instalar' && c[1] === 'maestro'))
  assert.equal(avisos.at(-1).titulo, 'Maestro atualizado')
  assert.deepEqual(await agenda.atualizar('relay'), { fase: 'ao-fechar', versao: '1.1.0' })
  assert.equal(apps.relay.instalada, '1.0.0', 'aberto não é trocado')
})

test('"Atualizar sozinho" por app: só o que está ligado se atualiza sem perguntar; bloqueado pelo plano nunca', async () => {
  const apps = {
    maestro: { nome: 'Maestro', instalada: '0.2.0', nova: '0.3.0' },
    relay: { nome: 'Relay', instalada: '1.0.0', nova: '1.1.0' },
  }
  const { agenda, central } = montar(apps, { atualizarSozinho: (id) => id === 'relay' })
  await agenda.conferir()
  assert.equal(apps.relay.instalada, '1.1.0')
  assert.equal(apps.maestro.instalada, '0.2.0')
  assert.deepEqual(
    agenda.estado().pendentes.map((p) => [p.id, p.fase]),
    [['maestro', 'disponivel']],
  )
  assert.equal(
    decidir({ instalado: { versao: '1' }, atualizar: true, gerenciavel: true, disponivel: { versao: '2' }, bloqueado: { plano: 'X' } }, false),
    'nada',
  )
  const listar = central.listar
  central.listar = async () => (await listar()).map((s) => ({ ...s, bloqueado: { plano: 'Absolute ZRO Completo' } }))
  assert.equal(await agenda.atualizar('maestro'), null)
})

test('sem sessão: o estado diz semLogin (a bandeja oferece Entrar)', async () => {
  const { agenda, central } = montar({})
  central.semLogin = true
  assert.equal(agenda.estado().semLogin, true)
})
