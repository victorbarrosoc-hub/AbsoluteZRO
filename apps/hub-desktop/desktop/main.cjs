// Absolute ZRO · app para computador (Mac e Windows). Abre o HUB (https://absolutezro.com) numa janela própria,
// com a sessão guardada (continua logado), menu em português, tela "Sem conexão" local e aviso de versão nova.
//
// É também o instalador e gerenciador do ecossistema (ADR 0018 e adendo de 28/10/2026) e, desde a 1.4.0, o ÚNICO jeito
// de instalar e atualizar os apps de computador (central única, ADR 0036): fica em segundo plano, com o símbolo na
// barra de menus (Mac) ou na bandeja (Windows); fechar a janela não encerra. Abre com o computador (escondido), lê os
// apps da conta no HUB (/api/v1/desktop/meus-apps, com a sessão do HUB guardada na partição do app), avisa versão nova
// com notificação nativa (agenda.cjs; "Atualizar sozinho" por app nos Ajustes) e na primeira abertura pergunta quais
// apps instalar (paginas/boas-vindas.html). absolutezro://apps/<id>?acao=atualizar|instalar abre o cartão do app.
//
// Como a janela é montada: a BrowserWindow é a moldura. No Mac ela mostra a barra de título própria
// (paginas/barra.html, com os três botões do sistema integrados); no Windows a moldura é a do sistema. O HUB roda numa
// WebContentsView por cima, na partição persist:absolutezro, sem Node, com sandbox e isolamento de contexto.
// As regras de navegação ficam em regras.cjs (testadas sem Electron).
//
// `--smoke` (CI, depois do build): abre a janela com a tela "Sem conexão" local (sem rede), confere a ponte e as
// regras e escreve "SMOKE OK" (também em ZRO_SMOKE_SAIDA, se definido).

const {
  app,
  BrowserWindow,
  WebContentsView,
  Menu,
  shell,
  session,
  ipcMain,
  dialog,
  screen,
  nativeTheme,
  clipboard,
  systemPreferences,
  Tray,
  Notification,
  nativeImage,
  net,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const regras = require('./regras.cjs')
const janela = require('./janela.cjs')
const { AvisoDeVersao, lerBuildInfo } = require('./versao.cjs')
const { Atualizador, comandoDaTroca, ehScriptDaTroca } = require('./atualizador.cjs')
const { spawn } = require('node:child_process')
const { Central } = require('./central.cjs')
const { criarFetchDeDownload } = require('./download.cjs')
const { AgendaDeApps } = require('./agenda.cjs')
const bandeja = require('./bandeja.cjs')
const inicio = require('./inicio-sistema.cjs')
const gerenciados = require('./gerenciados.cjs')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const SMOKE = process.argv.includes('--smoke')
const SMOKE_SAIDA = process.env.ZRO_SMOKE_SAIDA || null
const MAC = process.platform === 'darwin'
const PLATAFORMA = MAC ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux'
const PAGINAS = path.join(__dirname, 'paginas')
const PARTICAO = 'persist:absolutezro'
// papel do tema claro (o padrão do site): a janela já nasce nessa cor, sem flash branco nem preto
const FUNDO = '#fcfbfc'
const ALTURA_BARRA = MAC ? 38 : 0
const HUB = regras.hubOrigin({ empacotado: app.isPackaged })
const BUILD = lerBuildInfo(path.join(__dirname, 'build-info.json'))
// O app abre no painel próprio (como o Creative Cloud), não na página inicial do site.
const INICIO = HUB + '/app'
// A abertura da marca fica pelo menos isso na tela (e até o painel carregar, no máximo ABERTURA_MAX).
const ABERTURA_MIN = 2400
const ABERTURA_MAX = 7000

// O teste de fumaça usa uma pasta de dados descartável: não mexe na sessão de quem roda.
if (SMOKE) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'absolute-zro-smoke-')))

// Um app só: abrir de novo (ou clicar num link absolutezro://) traz a janela que já existe para a frente.
if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win = null
let view = null
let capa = null
let aviso = null
let atualizador = null
let central = null
let agenda = null
let tray = null
let boas = null
let saindo = false
let primeiraJanela = true
let ultimaUrl = INICIO
let deepLinkPendente = regras.deepLinkDosArgs(process.argv, HUB)
let zoom = 0

const estadoBarra = () => {
  if (!win || win.isDestroyed() || !view) return
  const wc = view.webContents
  const nav = wc.navigationHistory
  const estado = {
    titulo: wc.getTitle() || 'Absolute ZRO',
    voltar: nav.canGoBack(),
    avancar: nav.canGoForward(),
    carregando: wc.isLoading(),
    focada: win.isFocused(),
    telaCheia: win.isFullScreen(),
  }
  if (MAC) win.webContents.send('barra:estado', estado)
  win.setTitle(estado.titulo === 'Absolute ZRO' ? 'Absolute ZRO' : `${estado.titulo}`)
}

function posicionarView() {
  if (!win || !view) return
  const [w, h] = win.getContentSize()
  const topo = win.isFullScreen() && !MAC ? 0 : ALTURA_BARRA
  view.setBounds({ x: 0, y: topo, width: w, height: Math.max(0, h - topo) })
  // a abertura cobre a janela inteira (a barra de título também); no Mac os três botões ficam por cima
  if (capa) capa.setBounds({ x: 0, y: 0, width: w, height: h })
}

// Abertura da marca (paginas/abertura.html) por cima do painel enquanto ele carrega: o anel se desenha, a estrela
// aparece inteira e recolhe, o nome entra. Sai com um fade quando o painel está pronto (mínimo ABERTURA_MIN).
function abrirCapa() {
  capa = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false } })
  capa.setBackgroundColor(FUNDO)
  win.contentView.addChildView(capa)
  posicionarView()
  capa.webContents.loadFile(path.join(PAGINAS, 'abertura.html')).catch(() => {})
  const inicio = Date.now()
  let pronto = false
  const tirar = () => {
    if (!capa) return
    const c = capa
    capa = null
    c.webContents
      .insertCSS('body{opacity:0}')
      .catch(() => {})
      .finally(() =>
        setTimeout(() => {
          if (win && !win.isDestroyed()) win.contentView.removeChildView(c)
          c.webContents.close()
        }, 480),
      )
  }
  const talvez = () => {
    if (pronto) setTimeout(tirar, Math.max(0, ABERTURA_MIN - (Date.now() - inicio)))
  }
  view.webContents.once('did-finish-load', () => {
    pronto = true
    talvez()
  })
  setTimeout(tirar, ABERTURA_MAX)
}

function aplicarZoom(nivel) {
  zoom = Math.min(janela.ZOOM.max, Math.max(janela.ZOOM.min, nivel))
  if (view) view.webContents.setZoomLevel(zoom)
}

function abrirFora(url) {
  const ok = regras.linkExterno(url)
  if (ok) shell.openExternal(ok).catch(() => {})
}

function mostrarSemConexao(motivo) {
  if (!view) return
  view.webContents.loadFile(path.join(PAGINAS, 'offline.html'), { query: { motivo } }).catch(() => {})
}

const ehPaginaLocal = (url) => {
  try {
    const u = new URL(url)
    return u.protocol === 'file:' && path.normalize(decodeURIComponent(u.pathname)).startsWith(path.normalize(PAGINAS))
  } catch {
    return false
  }
}

function salvarJanela() {
  if (!win || win.isDestroyed()) return
  const b = win.getNormalBounds()
  janela.gravar(app.getPath('userData'), { ...b, maximizada: win.isMaximized(), telaCheia: win.isFullScreen(), zoom })
}

function criarJanela() {
  const salvo = janela.estadoValido(janela.ler(app.getPath('userData')), screen.getAllDisplays())
  zoom = salvo.zoom
  win = new BrowserWindow({
    width: salvo.width,
    height: salvo.height,
    ...(salvo.x != null ? { x: salvo.x, y: salvo.y } : { center: true }),
    minWidth: janela.MINIMO.width,
    minHeight: janela.MINIMO.height,
    show: false,
    title: 'Absolute ZRO',
    backgroundColor: FUNDO,
    titleBarStyle: MAC ? 'hiddenInset' : 'default',
    trafficLightPosition: MAC ? { x: 14, y: 12 } : undefined,
    autoHideMenuBar: !MAC,
    icon: MAC ? undefined : path.join(__dirname, '..', 'build', 'icon-windows.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload-barra.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  win.on('page-title-updated', (e) => e.preventDefault())
  // Mac: com a janela aberta o app aparece no Dock; fechada, fica só na barra de menus
  if (MAC && !SMOKE && app.dock) app.dock.show().catch(() => {})

  view = new WebContentsView({
    webPreferences: {
      partition: PARTICAO,
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
    },
  })
  view.setBackgroundColor(FUNDO)
  win.contentView.addChildView(view)
  if (!SMOKE && primeiraJanela) abrirCapa()
  const comCapa = !!capa
  primeiraJanela = false
  posicionarView()
  for (const ev of ['resize', 'enter-full-screen', 'leave-full-screen', 'maximize', 'unmaximize']) win.on(ev, posicionarView)
  for (const ev of ['focus', 'blur', 'enter-full-screen', 'leave-full-screen']) win.on(ev, estadoBarra)

  // mostra a janela assim que houver algo pintado (fundo claro do site desde o primeiro quadro, sem flash)
  let mostrada = false
  const mostrar = () => {
    if (mostrada || SMOKE || win.isDestroyed()) return
    mostrada = true
    if (salvo.maximizada) win.maximize()
    win.show()
    if (salvo.telaCheia) win.setFullScreen(true)
  }
  view.webContents.once('dom-ready', mostrar)
  // com a abertura, a janela aparece já com ela pintada
  if (capa) capa.webContents.once('dom-ready', mostrar)
  setTimeout(mostrar, 2500)

  const wc = view.webContents
  // janelas novas (target=_blank, window.open): HUB e login do Google ficam na janela; https vai para o navegador
  wc.setWindowOpenHandler(({ url }) => {
    const d = regras.destino(url, HUB)
    if (d === 'app') setImmediate(() => wc.loadURL(url))
    else if (d === 'fora') abrirFora(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    if (regras.destino(url, HUB) === 'app') return
    e.preventDefault()
    abrirFora(url)
  })
  // redirecionamento do servidor para fora (ex.: /baixar/hub/mac → GitHub): cancela aqui e abre no navegador
  wc.on('will-redirect', (e) => {
    if (!e.isMainFrame || regras.destino(e.url, HUB) === 'app') return
    e.preventDefault()
    abrirFora(e.url)
  })
  wc.on('did-navigate', (_e, url) => {
    if (regras.ehDoHub(url, HUB)) ultimaUrl = url
    // acabou de entrar na conta (a central estava sem sessão): confere os apps da conta agora
    if (central && central.semLogin && agenda && regras.ehDoHub(url, HUB) && new URL(url).pathname === '/app') agenda.conferir().catch(() => {})
    wc.setZoomLevel(zoom)
    estadoBarra()
  })
  wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
    if (isMainFrame && regras.ehDoHub(url, HUB)) ultimaUrl = url
    estadoBarra()
  })
  wc.on('did-fail-load', (_e, codigo, _descricao, url, isMainFrame) => {
    // -3 = navegação cancelada (por nós, em will-redirect, ou por outra navegação): não é falta de rede
    if (!isMainFrame || codigo === -3 || ehPaginaLocal(url)) return
    if (regras.ehDoHub(url, HUB)) ultimaUrl = url
    mostrarSemConexao(regras.ehErroDeRede(codigo) ? 'rede' : 'servidor')
  })
  wc.on('render-process-gone', (_e, d) => {
    if (d.reason !== 'clean-exit') mostrarSemConexao('servidor')
  })
  wc.on('zoom-changed', (_e, direcao) => {
    aplicarZoom(zoom + (direcao === 'in' ? 0.5 : -0.5))
  })
  for (const ev of ['page-title-updated', 'did-start-loading', 'did-stop-loading']) wc.on(ev, estadoBarra)

  if (MAC) win.loadFile(path.join(PAGINAS, 'barra.html')).catch(() => {})
  win.on('close', () => {
    salvarJanela()
    avisarQueFicaNaBandeja()
  })
  win.on('closed', () => {
    win = null
    view = null
  })

  if (SMOKE) mostrarSemConexao('rede')
  else wc.loadURL(deepLinkPendente || INICIO).catch(() => {})
  deepLinkPendente = null
  // primeira abertura: depois da abertura da marca, pergunta quais apps instalar
  if (!SMOKE && comCapa && !inicio.lerPreferencias(fs, app.getPath('userData')).boasVindas)
    wc.once('did-finish-load', () => setTimeout(() => mostrarBoasVindas().catch(() => {}), ABERTURA_MIN + 900))
  return win
}

function focar() {
  if (!win) return criarJanela()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function abrirDeepLink(url) {
  const alvo = regras.deepLink(url, HUB)
  if (!alvo) return
  if (!app.isReady() || !view) {
    deepLinkPendente = alvo
    if (app.isReady()) focar()
    return
  }
  focar()
  view.webContents.loadURL(alvo).catch(() => {})
}

// ───────── ponte (só a página certa fala com o processo principal) ─────────
const daView = (e) => !!view && e.sender === view.webContents && e.senderFrame === view.webContents.mainFrame
const daBarra = (e) => !!win && e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame && ehPaginaLocal(e.senderFrame.url)

ipcMain.handle('zro:tentar-de-novo', (e) => {
  if (!daView(e)) return false
  view.webContents.loadURL(regras.ehDoHub(ultimaUrl, HUB) ? ultimaUrl : INICIO).catch(() => {})
  return true
})
ipcMain.handle('zro:abrir-no-navegador', (e) => {
  if (!daView(e)) return false
  abrirFora(ultimaUrl)
  return true
})
ipcMain.handle('barra:acao', (e, acao) => {
  if (!daBarra(e) || !view) return false
  const wc = view.webContents
  if (acao === 'voltar' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
  else if (acao === 'avancar' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
  else if (acao === 'recarregar') recarregar(false)
  else if (acao === 'inicio') wc.loadURL(INICIO).catch(() => {})
  else if (acao === 'duplo-clique' && MAC) {
    const pref = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string')
    if (pref === 'Minimize') win.minimize()
    else if (pref !== 'None' && win.isMaximized()) win.unmaximize()
    else if (pref !== 'None') win.maximize()
  }
  return true
})

// ───────── central de apps (instalar, abrir, atualizar e remover as ferramentas) ─────────
// Só a página do HUB fala com a central, e só passa o id da ferramenta: o que baixar e onde instalar vêm do catálogo.
const daPaginaDoHub = (e) => daView(e) && regras.ehDoHub(e.senderFrame.url, HUB)
const idValido = (id) => typeof id === 'string' && /^[a-z0-9-]{2,40}$/.test(id)

function iniciarCentral() {
  const exec = promisify(execFile)
  central = new Central({
    hub: HUB,
    plataforma: PLATAFORMA,
    arch: process.arch,
    home: os.homedir(),
    temp: app.getPath('temp'),
    registro: path.join(app.getPath('userData'), 'central.json'),
    // com os cookies do login (partição do HUB): o catálogo respeita o que está liberado para a pessoa (ADR 0023)
    fetch: (url, opts = {}) => session.fromPartition(PARTICAO).fetch(url, { credentials: 'include', ...opts }),
    // o instalador: cada redirecionamento conferido (só o HUB, o Release no GitHub e o servidor de arquivos dele)
    fetchDeDownload: criarFetchDeDownload({ net, session: session.fromPartition(PARTICAO), permitido: (url) => regras.downloadPermitido(url, HUB) }),
    permitirHttp: !app.isPackaged,
    fs,
    exec: (cmd, args, opts = {}) => exec(cmd, args, { maxBuffer: 8 * 1024 * 1024, ...opts }),
    abrirCaminho: (p) => shell.openPath(p),
    lixeira: (p) => shell.trashItem(p),
    avisar: (ev) => {
      if (view && !view.webContents.isDestroyed() && regras.ehDoHub(view.webContents.getURL(), HUB)) view.webContents.send('central:progresso', ev)
      if (boas && !boas.isDestroyed()) boas.webContents.send('boas:progresso', ev)
    },
  })
  agenda = new AgendaDeApps({
    central,
    notificar: (n) => notificarDaAgenda(n),
    // Ajustes › "Atualizar sozinho" por app (padrão desligado: a central avisa e a pessoa atualiza; ADR 0036)
    atualizarSozinho: (id) => !!(prefs().atualizarSozinho || {})[id],
    marcarGerenciados: (ids) => gerenciados.gravar(fs, app.getPath('userData'), ids),
    jaAvisou: (id, versao) => (prefs().avisados || {})[id] === versao,
    lembrarAviso: (id, versao) => gravarPrefs({ avisados: { ...(prefs().avisados || {}), [id]: versao } }),
    log: (...a) => console.log(...a),
  })
  agenda.on('mudou', atualizarBandeja)
}

const responder = async (fn) => {
  try {
    return { ok: true, dados: await fn() }
  } catch (err) {
    return { ok: false, erro: err && err.codigo ? err.message : 'Algo deu errado. Tente de novo.' }
  }
}
ipcMain.handle('central:listar', (e) =>
  daPaginaDoHub(e) && central
    ? responder(async () => (await central.listar()).map((s) => ({ ...s, atualizacao: agenda ? agenda.situacao(s.id) : null })))
    : { ok: false, erro: 'indisponível' },
)
// Atualizar com a ferramenta aberta: baixa e confere já e instala quando ela fechar ("atualiza ao fechar").
async function instalarPelaPagina(id) {
  if (agenda && (await central.aberto(id).catch(() => false))) {
    const sit = await agenda.atualizarAoFechar(id)
    if (sit) {
      central.avisar(id, 'agendado', { versao: sit.versao })
      return 'ao-fechar'
    }
  }
  const ok = await central.instalar(id)
  if (agenda) agenda.relistar()
  return ok
}
const acoesDaPagina = {
  instalar: instalarPelaPagina,
  abrir: (id) => central.abrir(id),
  remover: async (id) => {
    const ok = await central.remover(id)
    if (agenda) agenda.relistar()
    return ok
  },
  'reiniciar-e-atualizar': (id) => (agenda ? agenda.reiniciarEAtualizar(id) : false),
  // 1.4: atualizar pela agenda (fechado: agora, com progresso; aberto: quando fechar)
  atualizar: (id) => (agenda ? agenda.atualizar(id) : central.instalar(id)),
}
for (const [acao, fn] of Object.entries(acoesDaPagina)) {
  ipcMain.handle(`central:${acao}`, (e, id) => {
    if (!daPaginaDoHub(e) || !central || !idValido(id)) return { ok: false, erro: 'indisponível' }
    return responder(() => fn(id))
  })
}
ipcMain.handle('central:cancelar', (e, id) => (daPaginaDoHub(e) && central && idValido(id) ? { ok: central.cancelar(id) } : { ok: false }))
ipcMain.handle('central:atualizar-tudo', (e) =>
  daPaginaDoHub(e) && agenda ? responder(() => agenda.atualizarTudo().then(() => true)) : { ok: false, erro: 'indisponível' },
)

// Ajustes deste computador (página /app/ajustes do HUB): só leitura do que é da central e dois interruptores.
ipcMain.handle('central:ajustes', (e) =>
  daPaginaDoHub(e)
    ? { ok: true, dados: { atualizarSozinho: { ...(prefs().atualizarSozinho || {}) }, abrirComSistema: ligadoComSistema() } }
    : { ok: false, erro: 'indisponível' },
)
ipcMain.handle('central:definir-atualizar-sozinho', (e, id, ligado) => {
  if (!daPaginaDoHub(e) || !idValido(id) || typeof ligado !== 'boolean') return { ok: false, erro: 'indisponível' }
  gravarPrefs({ atualizarSozinho: { ...(prefs().atualizarSozinho || {}), [id]: ligado } })
  // ligou com versão nova esperando: a agenda já cuida agora
  if (ligado && agenda) agenda.conferir().catch(() => {})
  return { ok: true, dados: true }
})
ipcMain.handle('central:definir-abrir-com-sistema', (e, ligado) => {
  if (!daPaginaDoHub(e) || typeof ligado !== 'boolean') return { ok: false, erro: 'indisponível' }
  definirAbrirComSistema(ligado)
  return { ok: true, dados: true }
})

function recarregar(semCache) {
  if (!view) return
  const wc = view.webContents
  // na tela "Sem conexão", recarregar = tentar o HUB de novo
  if (ehPaginaLocal(wc.getURL())) return wc.loadURL(regras.ehDoHub(ultimaUrl, HUB) ? ultimaUrl : INICIO).catch(() => {})
  if (semCache) wc.reloadIgnoringCache()
  else wc.reload()
}

// ───────── segundo plano: bandeja, notificações, abrir com o computador e boas-vindas ─────────
const notificacoes = new Set()
/**
 * Notificação nativa curta; o clique abre a janela (ou faz `aoClicar`). `botao` ({ texto, fn }): no Mac, um botão na
 * própria notificação (o Windows não tem botão sem um modelo de toast próprio; lá o clique leva ao cartão do app).
 */
function notificar(titulo, corpo, aoClicar, botao) {
  if (SMOKE || !Notification.isSupported()) return
  const n = new Notification({
    title: String(titulo),
    body: String(corpo || ''),
    silent: true,
    ...(MAC && botao ? { actions: [{ type: 'button', text: botao.texto }] } : {}),
  })
  notificacoes.add(n) // sem a referência, a notificação pode sumir antes do clique
  const soltar = () => notificacoes.delete(n)
  n.on('click', () => {
    soltar()
    if (aoClicar) aoClicar()
    else focar()
  })
  if (botao)
    n.on('action', () => {
      soltar()
      Promise.resolve(botao.fn()).catch(() => {})
    })
  n.on('close', soltar)
  n.show()
}

/** Abre a central no cartão do app (o mesmo caminho do deep link absolutezro://apps/<id>?acao=…). */
function abrirCartao(id, acao) {
  if (!idValido(id)) return
  abrirDeepLink(`${regras.ESQUEMA}://apps/${id}${acao ? `?acao=${acao}` : ''}`)
}

/**
 * Avisos da agenda. "Maestro 0.3.0 disponível": o clique abre o cartão do app já oferecendo Atualizar, e o botão
 * Atualizar (Mac) atualiza direto, com o SHA-256 conferido. Várias: "3 atualizações disponíveis" com Atualizar tudo.
 */
function notificarDaAgenda({ id, acao, titulo, corpo }) {
  if (acao === 'atualizar' && id)
    return notificar(titulo, corpo, () => abrirCartao(id, 'atualizar'), { texto: 'Atualizar', fn: () => agenda && agenda.atualizar(id) })
  if (acao === 'atualizar-tudo')
    return notificar(titulo, corpo, () => abrirDeepLink(`${regras.ESQUEMA}://app`), { texto: 'Atualizar tudo', fn: () => agenda && agenda.atualizarTudo() })
  return notificar(titulo, corpo)
}

const prefs = () => inicio.lerPreferencias(fs, app.getPath('userData'))
const gravarPrefs = (mudancas) => inicio.gravarPreferencias(fs, app.getPath('userData'), mudancas)
const podeAbrirComSistema = () => inicio.suportado({ plataforma: PLATAFORMA, empacotado: app.isPackaged })

/** O que o sistema diz agora sobre abrir com o computador (null quando não dá para saber). */
function abrirComSistemaNoSistema() {
  try {
    if (PLATAFORMA === 'windows') {
      const r = app.getLoginItemSettings({ path: process.execPath, args: [inicio.ESCONDIDO] })
      return typeof r.executableWillLaunchAtLogin === 'boolean' ? r.executableWillLaunchAtLogin : !!r.openAtLogin
    }
    if (PLATAFORMA === 'mac') return !!app.getLoginItemSettings().openAtLogin
  } catch {
    // sem resposta do sistema
  }
  return null
}

function definirAbrirComSistema(ligado) {
  gravarPrefs({ abrirComSistema: !!ligado })
  if (podeAbrirComSistema()) {
    try {
      app.setLoginItemSettings(inicio.opcoesDeLogin({ plataforma: PLATAFORMA, ligado, exe: process.execPath }))
    } catch (e) {
      console.log('[abrir com o computador]', e && e.message)
    }
  }
  atualizarBandeja()
  menu()
}

/** Ao abrir: a primeira execução liga e registra; depois segue o que a pessoa escolheu (inclusive nos Ajustes). */
function prepararAbrirComSistema() {
  if (!podeAbrirComSistema()) return
  const e = inicio.estadoNaAbertura({ prefs: prefs(), sistema: abrirComSistemaNoSistema() })
  if (e.registrar) definirAbrirComSistema(e.ligado)
  else if (e.gravar) gravarPrefs({ abrirComSistema: e.ligado })
}

const ligadoComSistema = () => (podeAbrirComSistema() ? inicio.abrirComSistema(prefs()) : null)

function iconeDaBandeja(barraClara) {
  const i = bandeja.iconeDaBandeja({ plataforma: PLATAFORMA, barraClara })
  const img = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'bandeja', i.arquivo))
  if (i.template) img.setTemplateImage(true)
  return img
}

function criarBandeja() {
  tray = new Tray(iconeDaBandeja(false))
  tray.setToolTip('Absolute ZRO')
  // Windows: o clique abre a janela e o botão direito mostra o menu. Mac e Linux: o clique mostra o menu.
  if (PLATAFORMA === 'windows') {
    tray.on('click', () => focar())
    execFile(
      'reg',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'SystemUsesLightTheme'],
      { windowsHide: true },
      (err, saida) => {
        if (!err && tray && !tray.isDestroyed() && bandeja.barraClaraDoWindows(saida)) tray.setImage(iconeDaBandeja(true))
      },
    )
  }
  atualizarBandeja()
}

const acoesDaBandeja = {
  abrir: () => focar(),
  'abrir-app': (id) => central && central.abrir(id).catch((e) => notificar('Não deu para abrir', e && e.message)),
  procurar: () => procurarTudo(),
  entrar: () => abrirDeepLink(`${regras.ESQUEMA}://app/entrar`),
  atualizar: (id) => agenda && agenda.atualizar(id).catch((e) => notificar('Não deu para atualizar', e && e.message)),
  'reiniciar-e-atualizar': (id) => agenda && agenda.reiniciarEAtualizar(id),
  'atualizar-tudo': () => agenda && agenda.atualizarTudo(),
  'abrir-com-sistema': () => definirAbrirComSistema(!inicio.abrirComSistema(prefs())),
  sair: () => app.quit(),
}

function atualizarBandeja() {
  if (!tray || tray.isDestroyed()) return
  const estado = agenda ? agenda.estado() : { apps: [], pendentes: [], procurando: false }
  const itens = bandeja.modeloDoMenu({ ...estado, abrirComSistema: ligadoComSistema() }).map((i) =>
    i.tipo === 'separador'
      ? { type: 'separator' }
      : {
          type: i.tipo === 'checkbox' ? 'checkbox' : 'normal',
          label: i.rotulo,
          enabled: i.ativo !== false,
          checked: i.tipo === 'checkbox' ? i.marcado : undefined,
          click: () => {
            const r = acoesDaBandeja[i.acao] && acoesDaBandeja[i.acao](i.id)
            if (r && typeof r.catch === 'function') r.catch(() => {})
          },
        },
  )
  tray.setContextMenu(Menu.buildFromTemplate(itens))
  tray.setToolTip(bandeja.dica(estado))
}

/** Windows: na primeira vez que a janela fecha, avisa que o app continua na bandeja (no Mac, a barra de menus mostra). */
function avisarQueFicaNaBandeja() {
  if (saindo || SMOKE || PLATAFORMA !== 'windows' || !tray) return
  if (prefs().avisouBandeja) return
  gravarPrefs({ avisouBandeja: true })
  notificar('O Absolute ZRO continua aqui', 'Ele mantém seus apps em dia. Para sair, use a bandeja.')
}

/** Procurar atualizações (bandeja e menu): o próprio app e os apps instalados, de uma vez. */
async function procurarTudo() {
  const [r] = await Promise.all([aviso ? aviso.conferir({ manual: true }) : { estado: 'desenvolvimento' }, agenda ? agenda.conferir() : null])
  if (r.estado === 'nova' || r.estado === 'avisando') return // o aviso do próprio app já apareceu
  if (r.estado === 'sem-resposta') return notificar('Não deu para conferir agora', 'O site do Absolute ZRO não respondeu. Tente daqui a pouco.')
  // sem sessão a central não sabe quais são os seus apps (ADR 0036)
  if (agenda && agenda.estado().semLogin)
    return notificar('Entre na sua conta', 'Seus apps aparecem depois de entrar.', () => abrirDeepLink(`${regras.ESQUEMA}://app/entrar`))
  // cada app com versão nova já avisou por notificação e aparece na bandeja
  if (agenda && agenda.estado().pendentes.length) return
  notificar(
    'Tudo em dia',
    r.estado === 'em-dia' ? `Absolute ZRO ${app.getVersion()} e seus apps estão na versão mais nova.` : 'Seus apps estão na versão mais nova.',
  )
}

// ───────── boas-vindas (primeira abertura): quais apps instalar ─────────
const daBoas = (e) => !!boas && !boas.isDestroyed() && e.sender === boas.webContents && ehPaginaLocal(e.senderFrame.url)
let listaBoas = []
// teste de fumaça: a tela abre com uma lista de exemplo, sem rede
const LISTA_SMOKE = [{ id: 'sobedesce', nome: 'SOBEDESCE', disponivel: { versao: '1.0.0', build: 1, tamanho: 120 * 1048576 }, instalado: null }]

async function mostrarBoasVindas() {
  if (boas || !win || win.isDestroyed()) return null
  let lista = []
  try {
    // só o que o plano da conta inclui (bloqueado não entra nas boas-vindas)
    lista = SMOKE ? LISTA_SMOKE : (await central.listar()).filter((s) => !s.bloqueado && (s.disponivel || s.instalado))
  } catch {
    return null // sem catálogo agora: pergunta na próxima abertura
  }
  // nada para instalar neste computador (ou nada liberado para a pessoa): pergunta numa próxima abertura
  if (!lista.some((s) => s.disponivel && !s.instalado)) return null
  listaBoas = lista
  boas = new BrowserWindow({
    parent: win,
    modal: true,
    width: 460,
    height: 600,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'Seus apps',
    backgroundColor: FUNDO,
    autoHideMenuBar: true,
    icon: MAC ? undefined : path.join(__dirname, '..', 'build', 'icon-windows.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload-boas-vindas.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  boas.once('ready-to-show', () => boas && !SMOKE && boas.show())
  boas.on('closed', () => {
    boas = null
  })
  await boas.loadFile(path.join(PAGINAS, 'boas-vindas.html'))
  return boas
}

function guardarEscolhaDoSistema(abrirComSistema) {
  gravarPrefs({ boasVindas: true })
  if (podeAbrirComSistema() && !!abrirComSistema !== inicio.abrirComSistema(prefs())) definirAbrirComSistema(!!abrirComSistema)
}

ipcMain.handle('boas:dados', (e) => {
  if (!daBoas(e)) return null
  const apps = listaBoas.map((s) => ({
    id: s.id,
    nome: s.nome,
    versao: s.disponivel ? s.disponivel.versao : null,
    tamanho: s.disponivel ? s.disponivel.tamanho : 0,
    instalado: !!s.instalado,
  }))
  return { apps, abrirComSistema: ligadoComSistema() }
})
ipcMain.handle('boas:instalar', async (e, ids, abrirComSistema) => {
  if (!daBoas(e) || !Array.isArray(ids)) return { ok: false }
  guardarEscolhaDoSistema(abrirComSistema)
  let ok = true
  for (const id of ids.filter((x) => idValido(x) && listaBoas.some((s) => s.id === x && s.disponivel && !s.instalado))) {
    try {
      await central.instalar(id)
    } catch {
      ok = false
    }
  }
  if (agenda) agenda.relistar()
  return ok ? { ok: true } : { ok: false, erro: 'Alguns apps não instalaram. Tente de novo pela página Downloads.' }
})
ipcMain.handle('boas:fechar', (e, abrirComSistema) => {
  if (!daBoas(e)) return false
  guardarEscolhaDoSistema(abrirComSistema)
  boas.close()
  return true
})

// ───────── aviso de versão nova e "Atualizar" (baixa, confere, fecha e abre já atualizado) ─────────
async function avisar(nova) {
  // só na bandeja (aberto com o computador): uma notificação no lugar do diálogo; o clique pergunta de novo
  if (!win || win.isDestroyed()) {
    notificar('Nova versão do Absolute ZRO', 'Clique para atualizar.', () => {
      focar()
      procurarVersao().catch(() => {})
    })
    return 'mais-tarde'
  }
  const podeTrocar = !!atualizador && atualizador.podeInstalar(nova.build)
  const versao = nova.versao ? `A versão ${nova.versao} (build ${nova.build})` : `O build ${nova.build}`
  const { response } = await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, {
    type: 'info',
    buttons: [podeTrocar ? 'Atualizar' : 'Baixar', 'Depois'],
    defaultId: 0,
    cancelId: 1,
    message: 'Nova versão do Absolute ZRO',
    detail: podeTrocar
      ? `${versao} está pronta. O app baixa, fecha e abre de novo já atualizado. Seu login e suas preferências continuam.`
      : `${versao} já está no site. ${atualizador && atualizador.motivo ? `${atualizador.motivo} ` : ''}Baixe e instale por cima desta: seu login e suas preferências continuam.`,
  })
  if (response !== 0) return 'depois'
  return podeTrocar ? 'atualizar' : 'baixar'
}

// Progresso sem piscar: a barra no ícone do Dock/barra de tarefas e o título da janela mudam no lugar, no máximo a
// cada 250 ms (o atualizador já segura o ritmo). Nada de diálogo abrindo e fechando.
function mostrarAtualizacao(st) {
  if (!win || win.isDestroyed()) return
  if (st.fase === 'baixando') {
    const frac = st.total ? Math.min(1, st.recebido / st.total) : 2 // 2 = indeterminado
    win.setProgressBar(frac)
    win.setTitle(st.total ? `Atualizando o Absolute ZRO · ${Math.round(frac * 100)}%` : 'Atualizando o Absolute ZRO…')
  } else if (st.fase === 'conferindo' || st.fase === 'preparando' || st.fase === 'reiniciando') {
    win.setProgressBar(2)
    win.setTitle(st.fase === 'reiniciando' ? 'Reabrindo o Absolute ZRO…' : 'Preparando a atualização…')
  } else {
    win.setProgressBar(-1)
    estadoBarra()
  }
}

async function atualizar(nova) {
  if (!atualizador) return
  try {
    const st = await atualizador.instalar({ ...nova, recheck: () => aviso.remoto() })
    if (st.fase === 'erro') {
      const { response } = await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, {
        type: 'warning',
        buttons: ['Baixar pelo site', 'Fechar'],
        defaultId: 0,
        cancelId: 1,
        message: 'Não deu para atualizar agora',
        detail: st.erro || 'Algo deu errado ao atualizar.',
      })
      if (response === 0) abrirFora(aviso.baixarUrl)
    }
  } catch (e) {
    console.log('[atualizar]', e && e.message)
    abrirFora(aviso.baixarUrl)
  }
}

// Entrega a troca: roda o script preparado, solto do app, e fecha. O script espera o app sair, troca e abre de novo.
function entregarTroca({ script }) {
  if (!ehScriptDaTroca(script)) throw new Error('script de troca fora do lugar')
  const c = comandoDaTroca(process.platform, script)
  if (!c) throw new Error('sistema sem troca')
  const filho = spawn(c.cmd, c.args, { detached: true, stdio: 'ignore', windowsHide: true })
  filho.unref()
  setTimeout(() => app.quit(), 300)
}

async function procurarVersao() {
  const r = await aviso.conferir({ manual: true })
  const textos = {
    desenvolvimento: ['Versão de desenvolvimento', 'Este app não veio de um instalador oficial, então não confere versões novas.'],
    'sem-resposta': ['Não deu para conferir agora', 'O site do Absolute ZRO não respondeu. Tente de novo daqui a pouco.'],
    'em-dia': ['Você está na versão mais nova', `Absolute ZRO ${app.getVersion()} (build ${BUILD.build}).`],
  }[r.estado]
  if (textos) await dialog.showMessageBox(win || undefined, { type: 'info', buttons: ['OK'], message: textos[0], detail: textos[1] })
}

function sobre() {
  const build = BUILD.build > 0 ? `build ${BUILD.build}${BUILD.commit ? ` · ${BUILD.commit}` : ''}` : 'desenvolvimento'
  if (MAC) return app.showAboutPanel()
  dialog.showMessageBox(win || undefined, {
    type: 'none',
    icon: path.join(__dirname, '..', 'build', 'icon-windows.png'),
    buttons: ['OK'],
    message: 'Absolute ZRO',
    detail: `Versão ${app.getVersion()} (${build})\nElectron ${process.versions.electron}\n\n${HUB.replace(/^https?:\/\//, '')}`,
  })
}

// ───────── menu ─────────
function itemAbrirComSistema() {
  const ligado = ligadoComSistema()
  if (ligado === null) return []
  return [{ label: 'Abrir com o computador', type: 'checkbox', checked: ligado, click: () => definirAbrirComSistema(!ligado) }]
}

function menu() {
  const wc = () => view && view.webContents
  const zoomItem = (label, accelerator, delta, extra = {}) => ({
    label,
    accelerator,
    click: () => aplicarZoom(delta === 0 ? 0 : zoom + delta),
    ...extra,
  })
  const template = [
    ...(MAC
      ? [
          {
            label: 'Absolute ZRO',
            submenu: [
              { label: 'Sobre o Absolute ZRO', click: sobre },
              { label: 'Procurar atualizações…', click: () => procurarTudo() },
              ...itemAbrirComSistema(),
              { type: 'separator' },
              { role: 'services', label: 'Serviços' },
              { type: 'separator' },
              { role: 'hide', label: 'Ocultar o Absolute ZRO' },
              { role: 'hideOthers', label: 'Ocultar outros' },
              { role: 'unhide', label: 'Mostrar todos' },
              { type: 'separator' },
              { role: 'quit', label: 'Sair do Absolute ZRO' },
            ],
          },
        ]
      : []),
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Início',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () =>
            wc() &&
            wc()
              .loadURL(INICIO)
              .catch(() => {}),
        },
        { label: 'Abrir no navegador', accelerator: 'CmdOrCtrl+Shift+O', click: () => abrirFora(ultimaUrl) },
        { label: 'Copiar endereço da página', accelerator: 'CmdOrCtrl+Shift+C', click: () => clipboard.writeText(ultimaUrl) },
        { type: 'separator' },
        MAC ? { role: 'close', label: 'Fechar janela' } : { role: 'quit', label: 'Sair', accelerator: 'Ctrl+Q' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { role: 'pasteAndMatchStyle', label: 'Colar sem formatação' },
        { role: 'delete', label: 'Apagar' },
        { role: 'selectAll', label: 'Selecionar tudo' },
      ],
    },
    {
      label: 'Visualizar',
      submenu: [
        { label: 'Voltar', accelerator: 'CmdOrCtrl+[', click: () => wc()?.navigationHistory.canGoBack() && wc().navigationHistory.goBack() },
        { label: 'Avançar', accelerator: 'CmdOrCtrl+]', click: () => wc()?.navigationHistory.canGoForward() && wc().navigationHistory.goForward() },
        { type: 'separator' },
        { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => recarregar(false) },
        { label: 'Recarregar sem cache', accelerator: 'CmdOrCtrl+Shift+R', click: () => recarregar(true) },
        { label: 'Recarregar', accelerator: 'F5', click: () => recarregar(false), visible: false, acceleratorWorksWhenHidden: true },
        { type: 'separator' },
        zoomItem('Tamanho real', 'CmdOrCtrl+0', 0),
        zoomItem('Aumentar', 'CmdOrCtrl+=', 0.5),
        zoomItem('Aumentar', 'CmdOrCtrl+Plus', 0.5, { visible: false, acceleratorWorksWhenHidden: true }),
        zoomItem('Diminuir', 'CmdOrCtrl+-', -0.5),
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
        ...(app.isPackaged
          ? []
          : [{ type: 'separator' }, { label: 'Ferramentas de desenvolvedor', accelerator: 'Alt+CmdOrCtrl+I', click: () => wc()?.toggleDevTools() }]),
      ],
    },
    {
      label: 'Janela',
      role: 'window',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        ...(MAC
          ? [{ role: 'zoom', label: 'Zoom' }, { type: 'separator' }, { role: 'front', label: 'Trazer tudo para a frente' }]
          : [{ role: 'close', label: 'Fechar' }]),
      ],
    },
    {
      label: 'Ajuda',
      role: 'help',
      submenu: [
        { label: 'Absolute ZRO no navegador', click: () => abrirFora(HUB + '/') },
        { label: 'Apps da Absolute ZRO', click: () => (view ? view.webContents.loadURL(INICIO).catch(() => {}) : null) },
        ...(MAC
          ? []
          : [
              { type: 'separator' },
              { label: 'Procurar atualizações…', click: () => procurarTudo() },
              ...itemAbrirComSistema(),
              { label: 'Sobre o Absolute ZRO', click: sobre },
            ]),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ───────── segurança da sessão ─────────
function protegerSessao() {
  const ses = session.fromPartition(PARTICAO)
  ses.setUserAgent(regras.agenteLimpo(ses.getUserAgent()))
  ses.setPermissionRequestHandler((wc, permissao, cb, detalhes) => cb(regras.permitir(permissao, (detalhes && detalhes.requestingUrl) || wc.getURL(), HUB)))
  ses.setPermissionCheckHandler((_wc, permissao, origem) => regras.permitir(permissao, origem, HUB))
  ses.setDevicePermissionHandler(() => false)
  // a moldura (barra de título) não pede nada
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
}

app.on('web-contents-created', (_e, contents) => {
  // nada de <webview> e, por padrão, nenhuma janela nova (a view do HUB tem regra própria, em criarJanela)
  contents.on('will-attach-webview', (e) => e.preventDefault())
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (e, url) => {
    if (view && contents === view.webContents) return
    if (!ehPaginaLocal(url)) e.preventDefault()
  })
})

// ───────── teste de fumaça ─────────
async function smoke() {
  const linhas = []
  const log = (s) => {
    linhas.push(s)
    console.log(s)
  }
  const fim = (ok) => {
    log(ok ? 'SMOKE OK' : 'SMOKE FALHOU')
    if (SMOKE_SAIDA) fs.writeFileSync(SMOKE_SAIDA, linhas.join('\n') + '\n')
    app.exit(ok ? 0 : 1)
  }
  const timer = setTimeout(() => {
    log('tempo esgotado (60 s)')
    fim(false)
  }, 60_000)
  try {
    const wc = view.webContents
    await new Promise((r) => (wc.isLoading() ? wc.once('did-finish-load', r) : r()))
    log(`Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · ${process.platform}-${process.arch} · build ${BUILD.build}`)
    const r = await wc.executeJavaScript(`(async () => (await document.fonts.ready, {
      pronto: !!(window.__zroOffline && window.__zroOffline.pronto),
      ponte: !!(window.zroDesktop && window.zroDesktop.isDesktop && window.zroDesktop.apps && typeof window.zroDesktop.apps.instalar === 'function'),
      semNode: typeof require === 'undefined' && typeof process === 'undefined',
      titulo: document.title,
      simbolo: (() => { const i = document.querySelector('img.simbolo'); return !!(i && i.complete && i.naturalWidth > 0) })(),
      fonte: document.fonts.check('800 40px Figtree'),
      fundo: getComputedStyle(document.body).backgroundColor,
    }))()`)
    log(
      `tela sem conexão: pronta ${r.pronto} · ponte ${r.ponte} · sem Node ${r.semNode} · símbolo ${r.simbolo} · Figtree ${r.fonte} · fundo ${r.fundo} · "${r.titulo}"`,
    )
    const casos = [
      [regras.destino(HUB + '/inicio', HUB), 'app'],
      [regras.destino('https://accounts.google.com/o/oauth2/v2/auth', HUB), 'app'],
      [regras.destino('https://sobedesce.vercel.app/', HUB), 'fora'],
      [regras.destino('file:///etc/passwd', HUB), 'nada'],
      [regras.deepLink('absolutezro://projetos', HUB), HUB + '/projetos'],
      [regras.deepLink('absolutezro://evil.example.com@x', HUB), null],
      [regras.deepLink('absolutezro://apps/maestro?acao=atualizar', HUB), HUB + '/app?app=maestro&acao=atualizar#app-maestro'],
    ]
    const regrasOk = casos.every(([a, b]) => a === b)
    log(`regras de navegação e deep link: ${regrasOk ? 'ok' : 'FALHOU'}`)
    let barraOk = true
    if (MAC) {
      await new Promise((r) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', r) : r()))
      barraOk = await win.webContents.executeJavaScript(`!!(window.zroBarra && document.getElementById('voltar'))`)
      log(`barra de título: ${barraOk ? 'ok' : 'FALHOU'}`)
    }
    // bandeja: o ícone existe e o menu monta (sem rede)
    const icone = iconeDaBandeja(false)
    const itens = bandeja.modeloDoMenu({
      apps: [
        { id: 'sobedesce', nome: 'SOBEDESCE' },
        { id: 'maestro', nome: 'Maestro' },
      ],
      pendentes: [
        { id: 'sobedesce', nome: 'SOBEDESCE', fase: 'ao-fechar' },
        { id: 'maestro', nome: 'Maestro', fase: 'disponivel', versao: '0.3.0' },
      ],
    })
    const bandejaOk =
      !icone.isEmpty() &&
      itens.some((i) => i.acao === 'reiniciar-e-atualizar') &&
      itens.some((i) => i.acao === 'atualizar' && i.id === 'maestro') &&
      !!tray &&
      !tray.isDestroyed()
    log(`bandeja: ${bandejaOk ? 'ok' : 'FALHOU'} (${icone.getSize().width}×${icone.getSize().height})`)
    // boas-vindas: a tela abre, a ponte responde e os apps aparecem
    const b = await Promise.race([mostrarBoasVindas(), new Promise((ok) => setTimeout(() => ok(null), 20000))])
    // No Windows do CI, janela escondida pode não rodar a página: mostra sem foco (fora da tela) só no teste.
    if (b && !b.isDestroyed()) {
      b.setPosition(-3000, -3000)
      b.showInactive()
    }
    const bv = b
      ? await Promise.race([
          new Promise((ok) => setTimeout(() => ok(null), 20000)),
          b.webContents.executeJavaScript(
            `new Promise((ok) => { const t = setInterval(() => { if (window.__zroBoasVindas) { clearInterval(t); ok({ apps: window.__zroBoasVindas.apps, cartoes: document.querySelectorAll('.cartao').length, semNode: typeof require === 'undefined' }) } }, 50) })`,
          ),
        ])
      : null
    const boasOk = !!bv && bv.apps === 1 && bv.cartoes === 1 && bv.semNode
    // No Windows do CI a janela escondida às vezes não roda a página; a tela é conferida no Mac e no Linux. Aqui só registra.
    const boasObrigatoria = PLATAFORMA !== 'windows'
    log(`boas-vindas: ${boasOk ? 'ok' : boasObrigatoria ? 'FALHOU' : 'não conferida no Windows'} ${JSON.stringify(bv)}`)
    // ZRO_SMOKE_CAPTURA_BOAS=arquivo.png: salva a tela de boas-vindas (para conferir o visual)
    if (b && process.env.ZRO_SMOKE_CAPTURA_BOAS) {
      win.show()
      b.show()
      await new Promise((ok) => setTimeout(ok, 900))
      fs.writeFileSync(process.env.ZRO_SMOKE_CAPTURA_BOAS, (await b.webContents.capturePage()).toPNG())
      log(`captura: ${process.env.ZRO_SMOKE_CAPTURA_BOAS}`)
    }
    if (b && !b.isDestroyed()) b.destroy()
    const fundoOk = r.fundo === 'rgb(252, 251, 252)'
    // ZRO_SMOKE_CAPTURA=arquivo.png: mostra a janela e salva a tela "Sem conexão" (para conferir o visual)
    if (process.env.ZRO_SMOKE_CAPTURA) {
      win.show()
      await new Promise((ok) => setTimeout(ok, 1200))
      fs.writeFileSync(process.env.ZRO_SMOKE_CAPTURA, (await view.webContents.capturePage()).toPNG())
      log(`captura: ${process.env.ZRO_SMOKE_CAPTURA}`)
    }
    clearTimeout(timer)
    fim(r.pronto && r.ponte && r.semNode && r.simbolo && r.fonte && fundoOk && regrasOk && barraOk && bandejaOk && (boasOk || !boasObrigatoria))
  } catch (err) {
    clearTimeout(timer)
    log(`erro: ${err && err.message ? err.message : err}`)
    fim(false)
  }
}

// ───────── ciclo de vida ─────────
app.on('open-url', (e, url) => {
  // Mac: link absolutezro:// (pode chegar antes do app ficar pronto)
  e.preventDefault()
  abrirDeepLink(url)
})

app.on('second-instance', (_e, argv) => {
  const alvo = regras.deepLinkDosArgs(argv, HUB)
  if (alvo) abrirDeepLink(alvo.replace(HUB + '/', `${regras.ESQUEMA}://`))
  // aberto de novo pelo sistema (--escondido) com o app já no ar: não mostra nada
  else if (!argv.includes(inicio.ESCONDIDO)) focar()
})

app.whenReady().then(() => {
  // claro é o padrão do Absolute ZRO; o escuro é escolha no seletor do próprio site
  nativeTheme.themeSource = 'light'
  if (process.platform === 'win32') app.setAppUserModelId('com.absolutezro.hub')
  if (!SMOKE) {
    if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient(regras.ESQUEMA, process.execPath, [path.resolve(process.argv[1])])
    else app.setAsDefaultProtocolClient(regras.ESQUEMA)
  }
  app.setAboutPanelOptions({
    applicationName: 'Absolute ZRO',
    applicationVersion: app.getVersion(),
    version: BUILD.build > 0 ? `build ${BUILD.build}` : 'desenvolvimento',
    copyright: '© 2026 Absolute ZRO',
  })
  protegerSessao()
  if (!SMOKE) prepararAbrirComSistema()
  menu()
  iniciarCentral()
  criarBandeja()
  // aberto pelo sistema ao ligar o computador: começa só com o ícone (um link absolutezro:// abre a janela)
  const escondido =
    !SMOKE &&
    !deepLinkPendente &&
    inicio.iniciarEscondido({
      argv: process.argv,
      plataforma: PLATAFORMA,
      abertoNoLogin:
        MAC &&
        (() => {
          try {
            return app.getLoginItemSettings().wasOpenedAtLogin
          } catch {
            return false
          }
        })(),
    })
  if (escondido) {
    primeiraJanela = false // ao abrir pela bandeja, sem a abertura da marca
    if (MAC && app.dock) app.dock.hide()
  } else criarJanela()
  if (SMOKE) return smoke()
  agenda.iniciar()
  if (app.isPackaged && !SMOKE) {
    atualizador = new Atualizador({
      appExe: app.getPath('exe'),
      appPid: process.pid,
      pasta: app.getPath('userData'),
      entregar: entregarTroca,
      log: (...a) => console.log(...a),
    })
    atualizador.on('mudou', mostrarAtualizacao)
    // a troca anterior falhou: avisa uma vez e, desta vez, o botão é "Baixar"
    if (atualizador.falhaAnterior)
      setTimeout(() => {
        dialog
          .showMessageBox(win && !win.isDestroyed() ? win : undefined, {
            type: 'warning',
            buttons: ['OK'],
            message: 'A última atualização não terminou',
            detail: `${atualizador.falhaAnterior} O app continua na versão de antes. Na próxima versão nova, use Baixar.`,
          })
          .catch(() => {})
      }, 4000)
  }
  aviso = new AvisoDeVersao({
    hub: HUB,
    plataforma: PLATAFORMA,
    build: BUILD.build,
    pasta: app.getPath('userData'),
    avisar,
    abrir: abrirFora,
    atualizar,
    log: (...a) => console.log(...a),
  })
  aviso.start()
  app.on('activate', () => {
    if (!win) criarJanela()
  })
})

app.on('before-quit', () => {
  saindo = true
  if (aviso) aviso.stop()
  if (agenda) agenda.parar()
  salvarJanela()
})

// Fechar a última janela não encerra: o app fica na barra de menus/bandeja cuidando dos apps (Sair encerra).
app.on('window-all-closed', () => {
  if (SMOKE || !tray || tray.isDestroyed()) return app.quit()
  if (MAC && app.dock) app.dock.hide()
})

process.on('uncaughtException', (err) => {
  console.error(err)
  if (SMOKE) app.exit(1)
})
