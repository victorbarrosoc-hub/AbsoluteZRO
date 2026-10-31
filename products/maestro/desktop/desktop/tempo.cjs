// O cronômetro do Maestro na barra de menus (Mac) e na bandeja (Windows): as contas, o estado lido do servidor, os
// ajustes do app e o menu, sem Electron (o teste roda em Node puro; cronometro.cjs e main.cjs ligam no sistema).
//
// A verdade é o servidor (`GET /api/tempo`, a mesma rota do site): o app guarda o `inicio` gravado pelo banco e o
// desvio entre o relógio do servidor e o do computador, e desenha `agora + desvio - inicio`, como a pílula do site
// (src/components/tempo/loja.ts). Nada aqui conta tempo por conta própria.

const MIN = 60_000
const DIA = 24 * 60 * MIN
const ID_CARD = /^[A-Za-z0-9_-]{4,64}$/
const ISO = (v) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v))
const D2 = (n) => String(n).padStart(2, '0')

/** "01:11:07" (o menu). */
function relogio(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${D2(Math.floor(s / 3600))}:${D2(Math.floor((s % 3600) / 60))}:${D2(s % 60)}`
}

/** "01:11" (ao lado do ícone na barra: horas e minutos, como o título da aba do site, "▶ 01:11 · tarefa"). */
function relogioCurto(ms) {
  const m = Math.floor(Math.max(0, ms) / MIN)
  return `${D2(Math.floor(m / 60))}:${D2(m % 60)}`
}

/** "24:59" (contagem do Pomodoro; arredonda para cima, como o site e o Relógio da Apple). */
function contagem(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${D2(Math.floor(s / 60))}:${D2(s % 60)}`
}

/** "1h 22min", "38min", "<1min" (o mesmo `duracaoCurta` do site). */
function duracaoCurta(ms) {
  const m = Math.floor(Math.max(0, ms) / MIN)
  if (m < 1) return ms > 0 ? '<1min' : '0min'
  const h = Math.floor(m / 60)
  const r = m % 60
  if (!h) return `${r}min`
  return r ? `${h}h ${r}min` : `${h}h`
}

/** Quanto a sessão durou (rodando: até `agora`), entre 0 e 24 h (o check do banco). */
function duracaoMs(r, agora) {
  const fim = r.fim ? Date.parse(r.fim) : agora
  return Math.min(DIA, Math.max(0, fim - Date.parse(r.inicio)))
}

const texto = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

function lerRegistro(r) {
  if (!r || typeof r !== 'object') return null
  if (typeof r.id !== 'string' || r.id.length > 64 || typeof r.card !== 'string' || !ID_CARD.test(r.card) || !ISO(r.inicio)) return null
  if (r.fim !== null && r.fim !== undefined && !ISO(r.fim)) return null
  return { id: r.id, card: r.card, inicio: r.inicio, fim: r.fim || null, modo: r.modo === 'pomodoro' ? 'pomodoro' : 'livre' }
}

/**
 * A resposta do `GET /api/tempo` (ou o `estado` de um POST) → o que o app usa, conferido. Fora da forma, null.
 * `ida`/`volta` (ms do computador) dão o desvio: relógio do servidor − o do computador no meio do caminho.
 */
function lerEstado(json, ida, volta) {
  if (!json || typeof json !== 'object' || !ISO(json.agora)) return null
  const hoje = (Array.isArray(json.hoje) ? json.hoje.slice(0, 500) : []).map(lerRegistro).filter(Boolean)
  const rodando = json.rodando ? lerRegistro(json.rodando) : null
  if (rodando && rodando.fim) return null
  const cards = {}
  for (const [id, c] of Object.entries(json.cards && typeof json.cards === 'object' ? json.cards : {}).slice(0, 500)) {
    if (!ID_CARD.test(id) || !c || typeof c !== 'object') continue
    cards[id] = { tema: texto(c.tema, 120), cliente: typeof c.cliente === 'string' ? c.cliente.slice(0, 64) : null, coluna: texto(c.coluna, 40) }
  }
  const clientes = {}
  for (const [id, nome] of Object.entries(json.clientes && typeof json.clientes === 'object' ? json.clientes : {}).slice(0, 500)) {
    if (typeof id === 'string' && id.length <= 64 && typeof nome === 'string') clientes[id] = texto(nome, 80)
  }
  const meio = Number.isFinite(ida) && Number.isFinite(volta) ? (ida + volta) / 2 : Number.isFinite(volta) ? volta : Date.now()
  return {
    pode: json.pode !== false,
    desvio: Date.parse(json.agora) - meio,
    rodando,
    hoje: rodando && !hoje.some((r) => r.id === rodando.id) ? [...hoje, rodando] : hoje,
    cards,
    clientes,
  }
}

/** Título e cliente de um card (o que o servidor mandou); sem título, "Tarefa". */
function nomeDoCard(e, card) {
  const c = e && e.cards[card]
  return { tema: (c && c.tema) || 'Tarefa', cliente: (c && c.cliente && e.clientes[c.cliente]) || '' }
}

/** O tempo de hoje no card (sessões fechadas + a que roda), no relógio do servidor. */
function hojeNoCard(e, card, agora) {
  return e.hoje.filter((r) => r.card === card).reduce((a, r) => a + duracaoMs(r, agora), 0)
}

/** Os últimos cards do dia (início rápido): o mais recente primeiro, sem repetir, até `n`. */
function ultimosCards(e, agora, n = 5) {
  if (!e) return []
  const vistos = new Set()
  const lista = []
  for (const r of [...e.hoje].sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio))) {
    if (vistos.has(r.card)) continue
    vistos.add(r.card)
    lista.push({ card: r.card, ...nomeDoCard(e, r.card), ms: hojeNoCard(e, r.card, agora), rodando: !!e.rodando && e.rodando.card === r.card })
    if (lista.length >= n) break
  }
  return lista
}

/** O card para "Retomar" com nada rodando: o último do dia. */
const ultimoCard = (e) => (e && e.rodando ? e.rodando.card : (ultimosCards(e, 0, 1)[0] || {}).card || null)

/* ───────────── ajustes do app (mostrar o tempo na barra, atalho) ───────────── */

/**
 * Os atalhos que o app oferece (globais: valem com o Maestro em segundo plano). Nenhum é o ⌥T/Alt+T do site (abre o
 * painel dentro da janela) nem um atalho do menu do app. Lista fechada: nada digitado vira atalho do sistema.
 */
const ATALHOS = [
  { id: 'Alt+Shift+T', mac: '⌥⇧T', windows: 'Alt+Shift+T' },
  { id: 'Control+Alt+T', mac: '⌃⌥T', windows: 'Ctrl+Alt+T' },
  { id: 'Alt+Shift+Space', mac: '⌥⇧Espaço', windows: 'Alt+Shift+Espaço' },
]
const ATALHO_PADRAO = 'Alt+Shift+T'
const AJUSTES_PADRAO = { mostrarTempo: true, atalho: ATALHO_PADRAO }

function lerAjustes(v) {
  const o = v && typeof v === 'object' ? v : {}
  const atalho = o.atalho === null ? null : ATALHOS.some((a) => a.id === o.atalho) ? o.atalho : ATALHO_PADRAO
  return { mostrarTempo: typeof o.mostrarTempo === 'boolean' ? o.mostrarTempo : true, atalho }
}

const nomeDoAtalho = (id, plataforma) => {
  const a = ATALHOS.find((x) => x.id === id)
  return a ? (plataforma === 'mac' ? a.mac : a.windows) : ''
}

/* ───────────── o que aparece na barra e no menu ───────────── */

/**
 * O texto ao lado do ícone (Mac): rodando, o tempo de hoje no card ("01:11"); no foco do Pomodoro, quanto falta
 * ("18:42"); na pausa do Pomodoro, a contagem da pausa. Sem nada, vazio (só o ícone).
 */
function textoDaBarra({ estado: e, pomodoro: p, agora, mostrar }) {
  if (!mostrar || !e) return ''
  if (e.rodando) {
    if (e.rodando.modo === 'pomodoro' && p && p.fase === 'foco')
      return contagem(p.config.focoMin * MIN - (p.acumulado + (agora - Date.parse(e.rodando.inicio))))
    return relogioCurto(hojeNoCard(e, e.rodando.card, agora))
  }
  if (p && (p.fase === 'pausa' || p.fase === 'longa') && p.pausaDe !== null) return contagem(p.pausaMs - (agora - p.pausaDe))
  return ''
}

/** A dica do ícone (Windows não tem texto ao lado do ícone: a dica diz o tempo). */
function dicaDaBandeja({ estado: e, pomodoro: p, agora, situacao }) {
  if (situacao === 'sem-sessao') return 'Maestro · entre para usar o cronômetro'
  if (!e || !e.rodando) {
    if (p && (p.fase === 'pausa' || p.fase === 'longa') && p.pausaDe !== null) return `Maestro · pausa, faltam ${contagem(p.pausaMs - (agora - p.pausaDe))}`
    return 'Maestro'
  }
  const { tema } = nomeDoCard(e, e.rodando.card)
  return `Maestro · ${relogioCurto(hojeNoCard(e, e.rodando.card, agora))} · ${tema}`.slice(0, 120)
}

/** Qual ícone: rodando (com o ponto) ou parado. */
const iconeDaBandeja = (e) => (e && e.rodando ? 'rodando' : 'parado')

const SITUACOES = {
  'sem-sessao': 'Entre no Maestro para usar o cronômetro',
  'sem-acesso': 'Sua conta ainda não tem o Maestro',
  leitura: 'Seu papel aqui só lê: o cronômetro é de quem edita',
  'sem-conexao': 'Sem conexão: o tempo segue no servidor',
}

/**
 * O menu (modelo puro: `acao` em vez de função; main.cjs liga cada uma). `situacao`: ok, sem-sessao, sem-acesso,
 * leitura, sem-conexao ou carregando. Uma ação principal (Pausar/Retomar), o início rápido, o Pomodoro e o painel.
 */
function montarMenu({ estado: e, pomodoro: p, agora, situacao, ajustes, plataforma, parado, atalhoOcupado, abrirAoLigar }) {
  const itens = []
  const sep = () => itens.length && itens[itens.length - 1].type !== 'separator' && itens.push({ type: 'separator' })
  const atalho = ajustes.atalho
  const nomeAtalho = atalho ? nomeDoAtalho(atalho, plataforma) : ''

  if (situacao === 'ok' && e) {
    if (e.rodando) {
      const { tema, cliente } = nomeDoCard(e, e.rodando.card)
      itens.push({ label: tema, enabled: false })
      const tempo = relogio(hojeNoCard(e, e.rodando.card, agora))
      const pomo =
        e.rodando.modo === 'pomodoro' && p && p.fase === 'foco'
          ? ` · foco, faltam ${contagem(p.config.focoMin * MIN - (p.acumulado + (agora - Date.parse(e.rodando.inicio))))}`
          : ''
      itens.push({ label: [cliente, tempo].filter(Boolean).join(' · ') + pomo, enabled: false })
      itens.push({ label: 'Pausar', accelerator: atalho || undefined, acao: { tipo: 'pausar' } })
    } else {
      const ultimo = ultimoCard(e)
      if (ultimo) {
        const { tema } = nomeDoCard(e, ultimo)
        itens.push({ label: 'Nada rodando', enabled: false })
        itens.push({ label: `Retomar · ${tema}`.slice(0, 80), accelerator: atalho || undefined, acao: { tipo: 'iniciar', card: ultimo } })
      } else {
        itens.push({ label: 'Nada rodando hoje', enabled: false })
        itens.push({ label: 'Escolha um card no Quadro', acao: { tipo: 'abrir', caminho: '/app/quadro' } })
      }
    }
    if (parado) {
      sep()
      itens.push({ label: `Parado ${duracaoCurta(parado.ate - parado.desde)}. Manter ou descartar?`, enabled: false })
      itens.push({ label: 'Manter', acao: { tipo: 'parado', descartar: false } })
      itens.push({ label: `Descartar ${duracaoCurta(parado.ate - parado.desde)}`, acao: { tipo: 'parado', descartar: true } })
    }
    const ultimos = ultimosCards(e, agora, 5).filter((c) => !c.rodando)
    if (ultimos.length) {
      sep()
      itens.push({ label: 'Hoje', enabled: false })
      for (const c of ultimos)
        itens.push({ label: `${c.tema}${c.cliente ? ` · ${c.cliente}` : ''} · ${duracaoCurta(c.ms)}`.slice(0, 90), acao: { tipo: 'iniciar', card: c.card } })
    }
    sep()
    itens.push({ label: 'Pomodoro', submenu: menuPomodoro({ estado: e, pomodoro: p, agora }) })
  } else {
    itens.push({ label: SITUACOES[situacao] || 'Carregando o cronômetro…', enabled: false })
    if (situacao === 'sem-sessao') itens.push({ label: 'Entrar', acao: { tipo: 'abrir', caminho: '/app' } })
  }
  sep()
  itens.push({ label: 'Abrir painel', enabled: situacao === 'ok', acao: { tipo: 'painel' } })
  itens.push({ label: 'Abrir o Maestro', acao: { tipo: 'abrir', caminho: null } })
  sep()
  itens.push({
    label: 'Ajustes',
    submenu: [
      ...(plataforma === 'mac'
        ? [{ label: 'Mostrar o tempo na barra', type: 'checkbox', checked: ajustes.mostrarTempo, acao: { tipo: 'mostrar-tempo' } }]
        : []),
      {
        label: atalhoOcupado ? `Atalho para pausar e retomar (${nomeAtalho} está em uso)` : 'Atalho para pausar e retomar',
        submenu: [
          ...ATALHOS.map((a) => ({
            label: plataforma === 'mac' ? a.mac : a.windows,
            type: 'radio',
            checked: atalho === a.id,
            acao: { tipo: 'atalho', id: a.id },
          })),
          { label: 'Sem atalho', type: 'radio', checked: !atalho, acao: { tipo: 'atalho', id: null } },
        ],
      },
      { label: 'Abrir ao ligar o computador', type: 'checkbox', checked: !!abrirAoLigar, acao: { tipo: 'abrir-ao-ligar' } },
    ],
  })
  itens.push({ label: 'Sair do Maestro', acao: { tipo: 'sair' } })
  return itens
}

function menuPomodoro({ estado: e, pomodoro: p, agora }) {
  if (!p) return [{ label: 'Carregando…', enabled: false }]
  const c = p.config
  const card = ultimoCard(e)
  if (p.fase === 'pausa' || p.fase === 'longa') {
    return [
      { label: `${p.fase === 'longa' ? 'Pausa longa' : 'Pausa'} · faltam ${contagem(p.pausaMs - (agora - (p.pausaDe || agora)))}`, enabled: false },
      { label: 'Encerrar a pausa', acao: { tipo: 'pomodoro', passo: 'encerrar-pausa' } },
      { label: `Focar ${c.focoMin} min`, enabled: !!card, acao: { tipo: 'pomodoro', passo: 'focar', card } },
    ]
  }
  const focando = !!(e && e.rodando && e.rodando.modo === 'pomodoro' && p.fase === 'foco')
  return [
    focando
      ? { label: `Foco · faltam ${contagem(c.focoMin * MIN - (p.acumulado + (agora - Date.parse(e.rodando.inicio))))}`, enabled: false }
      : {
          label: card ? `Focar ${c.focoMin} min` : `Focar ${c.focoMin} min (escolha um card)`,
          enabled: !!card,
          acao: { tipo: 'pomodoro', passo: 'focar', card },
        },
    { label: `Pausa de ${c.pausaMin} min`, acao: { tipo: 'pomodoro', passo: 'pausa' } },
    { type: 'separator' },
    { label: `${p.feitos % c.ciclos} de ${c.ciclos} focos no ciclo`, enabled: false },
  ]
}

module.exports = {
  MIN,
  ID_CARD,
  relogio,
  relogioCurto,
  contagem,
  duracaoCurta,
  duracaoMs,
  lerEstado,
  nomeDoCard,
  hojeNoCard,
  ultimosCards,
  ultimoCard,
  ATALHOS,
  ATALHO_PADRAO,
  AJUSTES_PADRAO,
  lerAjustes,
  nomeDoAtalho,
  textoDaBarra,
  dicaDaBandeja,
  iconeDaBandeja,
  montarMenu,
  menuPomodoro,
}
