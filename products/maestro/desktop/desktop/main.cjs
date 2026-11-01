// Maestro · app para computador (Mac e Windows). Abre o Maestro (https://maestro.absolutezro.com/app) numa janela
// própria, com a sessão guardada (continua logado), menu em português, tela "Sem conexão" local e aviso de versão nova.
// O login é o login único da Absolute ZRO, pelo próprio site, dentro da janela (regras.cjs diz o que fica nela).
//
// Como a janela é montada (o mesmo do Absolute ZRO para computador, apps/hub-desktop): a BrowserWindow é a moldura.
// No Mac ela mostra a barra de título própria (paginas/barra.html, com os três botões do sistema integrados); no
// Windows a moldura é a do sistema. O Maestro roda numa WebContentsView por cima, na partição persist:maestro, sem
// Node, com sandbox e isolamento de contexto.
//
// `--smoke` (CI, depois do build): abre a janela com a tela "Sem conexão" local (sem rede), confere a ponte e as
// regras e escreve "SMOKE OK" (também em MAESTRO_SMOKE_SAIDA, se definido).

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
  globalShortcut,
  powerMonitor,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const regras = require('./regras.cjs')
const janela = require('./janela.cjs')
const { AvisoDeVersao, lerBuildInfo, PRODUTO } = require('./versao.cjs')
const central = require('./central.cjs')
const tempo = require('./tempo.cjs')
const { Cronometro } = require('./cronometro.cjs')
const { Atalho } = require('./atalho.cjs')

const NOME = 'Maestro'
const SMOKE = process.argv.includes('--smoke')
const SMOKE_SAIDA = process.env.MAESTRO_SMOKE_SAIDA || null
const MAC = process.platform === 'darwin'
const PLATAFORMA = MAC ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux'
const PAGINAS = path.join(__dirname, 'paginas')
const PARTICAO = 'persist:maestro'
// papel do tema claro do Maestro (o padrão): a janela já nasce nessa cor, sem flash branco nem preto
const FUNDO = '#f7f3ee'
const ALTURA_BARRA = MAC ? 38 : 0
const O = regras.origens({ empacotado: app.isPackaged })
const BUILD = lerBuildInfo(path.join(__dirname, 'build-info.json'))
// O app abre direto no Maestro (o painel); sem sessão, o próprio site leva para "Entrar".
const INICIO = O.maestro + '/app'

// O teste de fumaça usa uma pasta de dados descartável: não mexe na sessão de quem roda.
if (SMOKE) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-smoke-')))

// Aberto sozinho ao ligar o computador ("Abrir ao ligar o computador", no menu do cronômetro): só a barra/bandeja.
const abertoAoLigar = () => {
  if (SMOKE) return false
  if (process.argv.includes('--ao-ligar')) return true
  try {
    return MAC && !!app.getLoginItemSettings().wasOpenedAtLogin
  } catch {
    return false
  }
}

// Um app só: abrir de novo (ou clicar num link maestro://) traz a janela que já existe para a frente.
if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win = null
let view = null
let aviso = null
let novaVersao = null
let notificacaoDeVersao = null
let ultimaUrl = INICIO
let deepLinkPendente = regras.deepLinkDosArgs(process.argv, O)
let zoom = 0

const estadoBarra = () => {
  if (!win || win.isDestroyed() || !view) return
  const wc = view.webContents
  const nav = wc.navigationHistory
  const estado = {
    titulo: wc.getTitle() || NOME,
    voltar: nav.canGoBack(),
    avancar: nav.canGoForward(),
    carregando: wc.isLoading(),
    focada: win.isFocused(),
    telaCheia: win.isFullScreen(),
    atualizacao: !!novaVersao,
  }
  if (MAC) win.webContents.send('barra:estado', estado)
  win.setTitle(!MAC && novaVersao ? `${estado.titulo} · Atualização disponível` : estado.titulo)
}

function posicionarView() {
  if (!win || !view) return
  const [w, h] = win.getContentSize()
  const topo = win.isFullScreen() && !MAC ? 0 : ALTURA_BARRA
  view.setBounds({ x: 0, y: topo, width: w, height: Math.max(0, h - topo) })
}

function aplicarZoom(nivel) {
  zoom = Math.min(janela.ZOOM.max, Math.max(janela.ZOOM.min, nivel))
  if (view) view.webContents.setZoomLevel(zoom)
}

function abrirFora(url) {
  const ok = regras.linkExterno(url, O)
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
    title: NOME,
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
  posicionarView()
  for (const ev of ['resize', 'enter-full-screen', 'leave-full-screen', 'maximize', 'unmaximize']) win.on(ev, posicionarView)
  for (const ev of ['focus', 'blur', 'enter-full-screen', 'leave-full-screen']) win.on(ev, estadoBarra)

  // mostra a janela assim que houver algo pintado (papel claro desde o primeiro quadro, sem flash)
  let mostrada = false
  const mostrar = () => {
    if (mostrada || SMOKE || win.isDestroyed()) return
    mostrada = true
    if (salvo.maximizada) win.maximize()
    win.show()
    if (salvo.telaCheia) win.setFullScreen(true)
  }
  view.webContents.once('dom-ready', mostrar)
  setTimeout(mostrar, 2500)

  const wc = view.webContents
  // janelas novas (target=_blank, window.open): o Maestro e o login ficam na janela; o resto vai para o navegador
  wc.setWindowOpenHandler(({ url }) => {
    const d = regras.destino(url, O)
    if (d === 'app') setImmediate(() => wc.loadURL(url))
    else if (d === 'fora') abrirFora(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    if (regras.destino(url, O) === 'app') return
    e.preventDefault()
    abrirFora(url)
  })
  // redirecionamento do servidor para fora (ex.: o HUB depois do login sem volta): cancela aqui e abre no navegador
  wc.on('will-redirect', (e) => {
    if (!e.isMainFrame || regras.destino(e.url, O) === 'app') return
    e.preventDefault()
    abrirFora(e.url)
  })
  wc.on('did-navigate', (_e, url) => {
    if (regras.ehDoMaestro(url, O)) ultimaUrl = url
    wc.setZoomLevel(zoom)
    estadoBarra()
  })
  wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
    if (isMainFrame && regras.ehDoMaestro(url, O)) ultimaUrl = url
    estadoBarra()
  })
  wc.on('did-fail-load', (_e, codigo, _descricao, url, isMainFrame) => {
    // -3 = navegação cancelada (por nós, em will-redirect, ou por outra navegação): não é falta de rede
    if (!isMainFrame || codigo === -3 || ehPaginaLocal(url)) return
    if (regras.ehDoMaestro(url, O)) ultimaUrl = url
    mostrarSemConexao(regras.ehErroDeRede(codigo) ? 'rede' : 'servidor')
  })
  wc.on('render-process-gone', (_e, d) => {
    if (d.reason !== 'clean-exit') mostrarSemConexao('servidor')
  })
  wc.on('zoom-changed', (_e, direcao) => aplicarZoom(zoom + (direcao === 'in' ? 0.5 : -0.5)))
  for (const ev of ['page-title-updated', 'did-start-loading', 'did-stop-loading']) wc.on(ev, estadoBarra)

  if (MAC) win.loadFile(path.join(PAGINAS, 'barra.html')).catch(() => {})
  win.on('close', salvarJanela)
  win.on('closed', () => {
    win = null
    view = null
  })

  if (SMOKE) mostrarSemConexao('rede')
  else wc.loadURL(deepLinkPendente || INICIO).catch(() => {})
  deepLinkPendente = null
  return win
}

function focar() {
  if (!win) return criarJanela()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function abrirDeepLink(url) {
  const alvo = regras.deepLink(url, O)
  if (!alvo) return
  // link do cliente (maestro://a/…): no navegador, como o cliente vê
  if (regras.ehDoCliente(alvo, O)) return abrirFora(alvo)
  if (!app.isReady() || !view) {
    deepLinkPendente = alvo
    if (app.isReady()) focar()
    return
  }
  focar()
  view.webContents.loadURL(alvo).catch(() => {})
}

function recarregar(semCache) {
  if (!view) return
  const wc = view.webContents
  // na tela "Sem conexão", recarregar = tentar o Maestro de novo
  if (ehPaginaLocal(wc.getURL())) return wc.loadURL(regras.ehDoMaestro(ultimaUrl, O) ? ultimaUrl : INICIO).catch(() => {})
  if (semCache) wc.reloadIgnoringCache()
  else wc.reload()
}

// ───────── ponte (só a página certa fala com o processo principal) ─────────
const daView = (e) => !!view && e.sender === view.webContents && e.senderFrame === view.webContents.mainFrame
const daBarra = (e) => !!win && e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame && ehPaginaLocal(e.senderFrame.url)

ipcMain.handle('maestro:tentar-de-novo', (e) => {
  if (!daView(e)) return false
  view.webContents.loadURL(regras.ehDoMaestro(ultimaUrl, O) ? ultimaUrl : INICIO).catch(() => {})
  return true
})
ipcMain.handle('maestro:abrir-no-navegador', (e) => {
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
  else if (acao === 'atualizar') atualizarNaCentral().catch(() => {})
  else if (acao === 'duplo-clique' && MAC) {
    const pref = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string')
    if (pref === 'Minimize') win.minimize()
    else if (pref !== 'None' && win.isMaximized()) win.unmaximize()
    else if (pref !== 'None') win.maximize()
  }
  return true
})

// ───────── aviso de versão nova: quem atualiza é a Absolute ZRO (central.cjs) ─────────
// Desde 01/11/2026 os apps de computador são instalados e atualizados só pela central Absolute ZRO: este app não baixa
// nem instala nada. Pela partição do app: os cookies do login vão junto e a Absolute ZRO confere o gate de lançamento.
const fetchDoApp = (url, opts = {}) => session.fromPartition(PARTICAO).fetch(url, { credentials: 'include', ...opts })

// A central atende absolutezro://? Sem ela, o aviso leva para a página de baixar a central.
const temCentral = () => {
  try {
    return !!app.getApplicationNameForProtocol(`${central.ESQUEMA_DA_CENTRAL}://`)
  } catch {
    return false
  }
}
const atualizarNaCentral = () => central.abrirNaCentral(PRODUTO, { temCentral, abrir: (url) => shell.openExternal(url) })

// O aviso discreto: o botão na barra do Mac, o item no menu e, no Windows, o título da janela.
function mostrarNovaVersao(nova) {
  novaVersao = nova
  estadoBarra()
  menu()
}

// Uma vez por build (versao.cjs lembra): a notificação do sistema; o clique abre a central.
function notificarNovaVersao() {
  if (!Notification.isSupported()) return
  notificacaoDeVersao = new Notification({ title: 'Atualização disponível', body: 'Atualizar na Absolute ZRO' })
  notificacaoDeVersao.on('click', () => atualizarNaCentral().catch(() => {}))
  notificacaoDeVersao.show()
}

// "Atualizações…" no menu: confere agora e diz que as atualizações chegam pela Absolute ZRO.
async function verAtualizacoes() {
  const r = aviso ? await aviso.conferir() : { estado: 'desenvolvimento' }
  const qual = r.remoto && r.remoto.versao ? `A versão ${r.remoto.versao}` : `O build ${r.remoto && r.remoto.build}`
  const detail =
    {
      nova: `${qual} já está disponível.`,
      'em-dia': `Você está na versão mais nova: ${NOME} ${app.getVersion()} (build ${BUILD.build}).`,
      desenvolvimento: 'Esta é uma versão de desenvolvimento.',
    }[r.estado] || 'A Absolute ZRO mostra quando houver versão nova.'
  const { response } = await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, {
    type: 'info',
    buttons: ['Atualizar na Absolute ZRO', 'OK'],
    defaultId: r.estado === 'nova' ? 0 : 1,
    cancelId: 1,
    message: 'As atualizações chegam pela Absolute ZRO',
    detail,
  })
  if (response === 0) await atualizarNaCentral()
}

const itemDeAtualizacao = () =>
  novaVersao
    ? { label: 'Atualização disponível · Atualizar na Absolute ZRO', click: () => atualizarNaCentral().catch(() => {}) }
    : { label: 'Atualizações…', click: () => verAtualizacoes().catch(() => {}) }

function sobre() {
  const build = BUILD.build > 0 ? `build ${BUILD.build}${BUILD.commit ? ` · ${BUILD.commit}` : ''}` : 'desenvolvimento'
  if (MAC) return app.showAboutPanel()
  dialog.showMessageBox(win || undefined, {
    type: 'none',
    icon: path.join(__dirname, '..', 'build', 'icon-windows.png'),
    buttons: ['OK'],
    message: NOME,
    detail: `Versão ${app.getVersion()} (${build})\nElectron ${process.versions.electron}\n\n${O.maestro.replace(/^https?:\/\//, '')}`,
  })
}

// ───────── menu ─────────
function menu() {
  const wc = () => view && view.webContents
  const ir = (caminho) => () =>
    wc()
      ? wc()
          .loadURL(O.maestro + caminho)
          .catch(() => {})
      : focar()
  const zoomItem = (label, accelerator, delta, extra = {}) => ({ label, accelerator, click: () => aplicarZoom(delta === 0 ? 0 : zoom + delta), ...extra })
  const template = [
    ...(MAC
      ? [
          {
            label: NOME,
            submenu: [
              { label: 'Sobre o Maestro', click: sobre },
              itemDeAtualizacao(),
              { type: 'separator' },
              { label: 'Ajustes…', accelerator: 'Cmd+,', click: ir('/app/ajustes') },
              { type: 'separator' },
              { role: 'services', label: 'Serviços' },
              { type: 'separator' },
              { role: 'hide', label: 'Ocultar o Maestro' },
              { role: 'hideOthers', label: 'Ocultar outros' },
              { role: 'unhide', label: 'Mostrar todos' },
              { type: 'separator' },
              { role: 'quit', label: 'Sair do Maestro' },
            ],
          },
        ]
      : []),
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Início', accelerator: 'CmdOrCtrl+Shift+H', click: ir('/app') },
        { label: 'Hoje', accelerator: 'CmdOrCtrl+1', click: ir('/app/hoje') },
        { label: 'Quadro', accelerator: 'CmdOrCtrl+2', click: ir('/app/quadro') },
        { type: 'separator' },
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
        { label: 'Maestro no navegador', click: () => abrirFora(O.maestro + '/') },
        { label: 'Sua conta Absolute ZRO', click: () => abrirFora(O.hub + '/perfil') },
        ...(MAC
          ? []
          : [
              { type: 'separator' },
              { label: 'Ajustes', accelerator: 'Ctrl+,', click: ir('/app/ajustes') },
              itemDeAtualizacao(),
              { label: 'Sobre o Maestro', click: sobre },
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
  ses.setPermissionRequestHandler((wc, permissao, cb, detalhes) => cb(regras.permitir(permissao, (detalhes && detalhes.requestingUrl) || wc.getURL(), O)))
  ses.setPermissionCheckHandler((_wc, permissao, origem) => regras.permitir(permissao, origem, O))
  ses.setDevicePermissionHandler(() => false)
  // a moldura (barra de título) não pede nada
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
}

app.on('web-contents-created', (_e, contents) => {
  // nada de <webview> e, por padrão, nenhuma janela nova (a view do Maestro tem regra própria, em criarJanela)
  contents.on('will-attach-webview', (e) => e.preventDefault())
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (e, url) => {
    if (view && contents === view.webContents) return
    if (!ehPaginaLocal(url)) e.preventDefault()
  })
})

// ───────── o cronômetro na barra de menus (Mac) e na bandeja (Windows) ─────────
// Lógica em cronometro.cjs (rotas do site, Pomodoro, parado), contas e menu em tempo.cjs, atalho em atalho.cjs. Aqui só
// o que é do sistema: o ícone, o texto ao lado dele, o menu, as notificações, o atalho global e a ponte com a página.
const BANDEJA = path.join(__dirname, 'bandeja')
let bandeja = null
let cronometro = null
let atalho = null
let atalhoOcupado = false
const notificacoes = new Set()
const pintado = { titulo: null, icone: null, dica: null, tema: null }

function imagemDaBandeja(tipo) {
  if (MAC) {
    const img = nativeImage.createFromPath(path.join(BANDEJA, tipo === 'rodando' ? 'bandejaRodandoTemplate.png' : 'bandejaTemplate.png'))
    img.setTemplateImage(true)
    return img
  }
  // a cor da barra de tarefas do Windows (não a do app); no Linux os painéis costumam ser escuros
  const escuro = process.platform === 'win32' ? nativeTheme.shouldUseDarkColorsForSystemIntegratedUI : true
  return nativeImage.createFromPath(path.join(BANDEJA, `bandeja-windows-${escuro ? 'escuro' : 'claro'}${tipo === 'rodando' ? '-rodando' : ''}.png`))
}

const doMaestroNaJanela = () => !!view && !view.webContents.isDestroyed() && regras.ehDoMaestro(view.webContents.getURL(), O)

/** Manda à página do Maestro (na janela) o que o cronômetro do app mudou. */
function avisarSite(canal, dados) {
  if (doMaestroNaJanela()) view.webContents.send(`tempo:${canal}`, dados)
}

/** Abre (ou traz) a janela com o painel do cronômetro aberto. */
function abrirPainel() {
  focar()
  const wc = view && view.webContents
  if (!wc) return
  const mandar = () => doMaestroNaJanela() && wc.send('tempo:abrir-painel')
  if (wc.isLoading()) wc.once('did-finish-load', mandar)
  else if (doMaestroNaJanela()) mandar()
  else wc.loadURL(regras.ehDoMaestro(ultimaUrl, O) ? ultimaUrl : INICIO).then(mandar, () => {})
}

function abrirNoMaestro(caminho) {
  focar()
  if (caminho && view) view.webContents.loadURL(O.maestro + caminho).catch(() => {})
}

function notificar({ titulo, corpo, motivo, acoes }) {
  if (SMOKE || !Notification.isSupported()) return
  const n = new Notification({
    title: titulo,
    body: corpo,
    silent: motivo === 'info',
    icon: MAC ? undefined : path.join(__dirname, '..', 'build', 'icon-windows.png'),
    // Mac: "Descartar" direto na notificação; "Manter" é fechar (no Windows, tocar abre o painel com a pergunta)
    ...(MAC && motivo === 'parado' && acoes ? { actions: [{ type: 'button', text: acoes[0] }], closeButtonText: acoes[1] } : {}),
  })
  notificacoes.add(n)
  const solta = () => notificacoes.delete(n)
  n.on('click', () => {
    solta()
    if (motivo !== 'erro') abrirPainel()
  })
  n.on('action', (_e, i) => {
    solta()
    if (motivo === 'parado' && i === 0 && cronometro) cronometro.resolverParado(true).catch(() => {})
  })
  n.on('close', solta)
  n.on('failed', solta)
  n.show()
}

/** Ícone, texto e dica: só o que mudou (o relógio chama a cada segundo). */
function pintarBandeja() {
  if (!bandeja || bandeja.isDestroyed() || !cronometro) return
  const r = cronometro.retrato()
  const tipo = tempo.iconeDaBandeja(r.estado)
  const tema = MAC ? 'mac' : String(nativeTheme.shouldUseDarkColorsForSystemIntegratedUI)
  if (pintado.icone !== tipo || pintado.tema !== tema) {
    bandeja.setImage(imagemDaBandeja(tipo))
    pintado.icone = tipo
    pintado.tema = tema
  }
  if (MAC) {
    const titulo = tempo.textoDaBarra({ ...r, mostrar: r.ajustes.mostrarTempo })
    if (pintado.titulo !== titulo) {
      bandeja.setTitle(titulo ? ` ${titulo}` : '', { fontType: 'monospacedDigit' })
      pintado.titulo = titulo
    }
  }
  const dica = tempo.dicaDaBandeja(r)
  if (pintado.dica !== dica) {
    bandeja.setToolTip(dica)
    pintado.dica = dica
  }
}

/** O modelo puro do menu (tempo.cjs) → o menu do Electron, com cada ação ligada. */
function menuDoCronometro() {
  const r = cronometro.retrato({ plataforma: PLATAFORMA, atalhoOcupado, abrirAoLigar: abrirAoLigarAtivo() })
  const fazer = (a) => () => {
    const c = cronometro
    if (a.tipo === 'pausar') c.pausar()
    else if (a.tipo === 'iniciar') c.iniciar(a.card)
    else if (a.tipo === 'parado') c.resolverParado(a.descartar)
    else if (a.tipo === 'pomodoro') c.passoDoPomodoro(a.passo, a.card)
    else if (a.tipo === 'painel') abrirPainel()
    else if (a.tipo === 'abrir') abrirNoMaestro(a.caminho)
    else if (a.tipo === 'mostrar-tempo') c.trocarAjustes({ mostrarTempo: !c.ajustes.mostrarTempo })
    else if (a.tipo === 'atalho') trocarAtalho(a.id)
    else if (a.tipo === 'abrir-ao-ligar') trocarAbrirAoLigar()
    else if (a.tipo === 'sair') app.quit()
  }
  const mapear = (itens) =>
    itens.map((i) => {
      if (i.type === 'separator') return { type: 'separator' }
      const m = { label: i.label, enabled: i.enabled !== false }
      if (i.type) m.type = i.type
      if (i.type === 'checkbox' || i.type === 'radio') m.checked = !!i.checked
      if (i.accelerator) Object.assign(m, { accelerator: i.accelerator, registerAccelerator: false })
      if (i.submenu) m.submenu = mapear(i.submenu)
      if (i.acao) m.click = fazer(i.acao)
      return m
    })
  return Menu.buildFromTemplate(mapear(tempo.montarMenu(r)))
}

function abrirMenuDaBandeja() {
  if (!bandeja || bandeja.isDestroyed()) return
  // o menu é montado na hora do clique: o tempo, o card e o Pomodoro de agora
  bandeja.popUpContextMenu(menuDoCronometro())
  cronometro.atualizar().catch(() => {})
}

function trocarAtalho(id) {
  const r = atalho.aplicar(id)
  atalhoOcupado = r.ocupado
  cronometro.trocarAjustes({ atalho: id })
}

const abrirAoLigarAtivo = () => {
  try {
    return !!app.getLoginItemSettings(MAC ? undefined : { args: ['--ao-ligar'] }).openAtLogin
  } catch {
    return false
  }
}
function trocarAbrirAoLigar() {
  try {
    app.setLoginItemSettings({ openAtLogin: !abrirAoLigarAtivo(), ...(MAC ? {} : { args: ['--ao-ligar'] }) })
  } catch (e) {
    console.log('[abrir ao ligar]', e && e.message)
  }
}

function ligarCronometro() {
  cronometro = new Cronometro({
    base: O.maestro,
    // pela partição do app: os cookies do login vão junto; o Origin do Maestro, como a página (a rota confere)
    fetch: (url, init) => session.fromPartition(PARTICAO).fetch(url, init),
    pasta: app.getPath('userData'),
    ociosoMs: () => powerMonitor.getSystemIdleTime() * 1000,
    aoMudar: pintarBandeja,
    notificar,
    avisarSite,
    log: (...a) => console.log(...a),
  })
  bandeja = new Tray(imagemDaBandeja('parado'))
  bandeja.setToolTip(NOME)
  if (process.platform === 'linux') {
    // Linux (só desenvolvimento): o painel não abre menu por clique; o menu fica preso ao ícone
    bandeja.setContextMenu(menuDoCronometro())
    setInterval(() => bandeja && !bandeja.isDestroyed() && bandeja.setContextMenu(menuDoCronometro()), 5000)
  } else {
    bandeja.on('click', abrirMenuDaBandeja)
    bandeja.on('right-click', abrirMenuDaBandeja)
    if (!MAC) bandeja.on('double-click', () => focar())
  }
  nativeTheme.on('updated', pintarBandeja)
  atalho = new Atalho({ globalShortcut, aoTocar: () => cronometro.alternar().catch(() => {}) })
  atalhoOcupado = atalho.aplicar(cronometro.ajustes.atalho).ocupado
  for (const ev of ['suspend', 'lock-screen']) powerMonitor.on(ev, () => cronometro.suspendeu())
  for (const ev of ['resume', 'unlock-screen']) powerMonitor.on(ev, () => cronometro.voltou())
  // a janela mudou o tempo (o painel, o play do card): relê já, sem esperar os 30 s
  let relendo = null
  session.fromPartition(PARTICAO).webRequest.onCompleted({ urls: [`${O.maestro}/api/tempo*`] }, (d) => {
    if (d.method !== 'POST' || !view || d.webContentsId !== view.webContents.id) return
    clearTimeout(relendo)
    relendo = setTimeout(() => cronometro.atualizar().catch(() => {}), 250)
  })
  cronometro.start()
}

// Novidades da versão: uma vez por versão instalada (no app de verdade), uma notificação curta dizendo o que chegou.
const NOVIDADES = {
  '0.2.0': MAC
    ? ['O cronômetro na barra de menus', 'O tempo ao lado do ícone, pausar e retomar com ⌥⇧T e o Pomodoro, mesmo com a janela fechada.']
    : ['O cronômetro na bandeja', 'Pausar e retomar com Alt+Shift+T e o Pomodoro, mesmo com a janela fechada.'],
  '0.2.1': ['Atualizações pela Absolute ZRO', 'Quando sair versão nova, o Maestro avisa e a Absolute ZRO atualiza.'],
}
function mostrarNovidades() {
  const v = app.getVersion()
  const marca = path.join(app.getPath('userData'), 'versao-vista')
  let vista = ''
  try {
    vista = fs.readFileSync(marca, 'utf8').trim()
  } catch {
    // primeira vez neste computador
  }
  if (vista === v) return
  try {
    fs.writeFileSync(marca, v)
  } catch {
    // sem gravar, mostra de novo da próxima vez
  }
  const n = NOVIDADES[v]
  if (n) setTimeout(() => notificar({ titulo: n[0], corpo: n[1], motivo: 'info' }), 3000)
}

// a página do Maestro (só ela, no quadro principal) conta ao app o que a pessoa fez no painel
ipcMain.on('tempo:do-site', (e, canal, dados) => {
  if (!cronometro || !daView(e) || !regras.ehDoMaestro(e.senderFrame.url, O)) return
  if (!['pronto', 'pomodoro', 'parado-resolvido'].includes(canal)) return
  cronometro.doSite(canal, canal === 'pomodoro' && dados && typeof dados === 'object' ? dados : null)
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
      pronto: !!(window.__maestroOffline && window.__maestroOffline.pronto),
      ponte: !!(window.maestroDesktop && window.maestroDesktop.isDesktop && typeof window.maestroDesktop.tentarDeNovo === 'function'
        && window.maestroDesktop.cronometro && typeof window.maestroDesktop.cronometro.aoMudar === 'function'
        && typeof window.maestroDesktop.cronometro.aoAbrirPainel === 'function'),
      semNode: typeof require === 'undefined' && typeof process === 'undefined',
      titulo: document.title,
      simbolo: (() => { const i = document.querySelector('img.simbolo'); return !!(i && i.complete && i.naturalWidth > 0) })(),
      fonte: document.fonts.check('800 40px Figtree'),
      fundo: getComputedStyle(document.body).backgroundColor,
    }))()`)
    log(
      `tela sem conexão: pronta ${r.pronto} · ponte ${r.ponte} · sem Node ${r.semNode} · símbolo ${r.simbolo} · Figtree ${r.fonte} · fundo ${r.fundo} · "${r.titulo}"`,
    )
    const M = O.maestro
    const casos = [
      [regras.destino(M + '/app/quadro', O), 'app'],
      [regras.destino(O.hub + '/oauth/authorize?client_id=maestro-web', O), 'app'],
      [regras.destino('https://accounts.google.com/o/oauth2/v2/auth', O), 'app'],
      [regras.destino(O.hub + '/inicio', O), 'fora'],
      [regras.destino(M + '/a/abc', O), 'fora'],
      [regras.destino('file:///etc/passwd', O), 'nada'],
      [regras.deepLink('maestro://app/quadro', O), M + '/app/quadro'],
      [regras.deepLink('maestro://evil.example.com@x', O), null],
    ]
    // atualização só pela Absolute ZRO: o aviso abre a central (sem ela, a página de baixar); nada de atualizador aqui
    casos.push([central.linkDaCentral(PRODUTO), `absolutezro://apps/${PRODUTO}?acao=atualizar`])
    casos.push([fs.existsSync(path.join(__dirname, 'atualizador.cjs')), false])
    const regrasOk = casos.every(([a, b]) => a === b)
    log(`regras de navegação e deep link: ${regrasOk ? 'ok' : 'FALHOU'}`)
    let barraOk = true
    if (MAC) {
      await new Promise((ok) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', ok) : ok()))
      barraOk = await win.webContents.executeJavaScript(
        `!!(window.zroBarra && document.getElementById('voltar') && document.getElementById('atualizar') && document.getElementById('atualizar').hidden)`,
      )
      log(`barra de título: ${barraOk ? 'ok' : 'FALHOU'}`)
    }
    const fundoOk = r.fundo === 'rgb(247, 243, 238)'
    const cronometroOk = await smokeCronometro(log)
    // MAESTRO_SMOKE_CAPTURA=arquivo.png: mostra a janela e salva a tela "Sem conexão" (para conferir o visual)
    if (process.env.MAESTRO_SMOKE_CAPTURA) {
      win.show()
      await new Promise((ok) => setTimeout(ok, 1200))
      fs.writeFileSync(process.env.MAESTRO_SMOKE_CAPTURA, (await view.webContents.capturePage()).toPNG())
      log(`captura: ${process.env.MAESTRO_SMOKE_CAPTURA}`)
    }
    clearTimeout(timer)
    fim(r.pronto && r.ponte && r.semNode && r.simbolo && r.fonte && fundoOk && regrasOk && barraOk && cronometroOk)
  } catch (err) {
    clearTimeout(timer)
    log(`erro: ${err && err.message ? err.message : err}`)
    fim(false)
  }
}

/**
 * O cronômetro no app empacotado: os ícones da barra carregam (e o do Mac é de modelo), e o caminho inteiro até a rota
 * funciona com um Maestro falso local (127.0.0.1): o fetch da sessão leva o cookie e o Origin, o estado é lido, o menu
 * monta e "Pausar" chega ao servidor. O atalho global só é registrado e liberado (informativo: a máquina de CI pode não
 * deixar).
 */
async function smokeCronometro(log) {
  const http = require('node:http')
  const icones = ['parado', 'rodando'].every((t) => {
    const img = imagemDaBandeja(t)
    return !img.isEmpty() && (!MAC || img.isTemplateImage())
  })
  const inicio = new Date(Date.now() - 65 * 60_000).toISOString()
  const rodando = { id: 'r1', sub: 's', card: 'card-smoke', inicio, fim: null, origem: 'cronometro', modo: 'livre', motivo: null }
  let estadoFalso = {
    agora: new Date().toISOString(),
    rodando,
    hoje: [rodando],
    totais: {},
    cards: { 'card-smoke': { id: 'card-smoke', tema: 'Teste de fumaça', cliente: 'c1' } },
    clientes: { c1: 'Cliente' },
    time: false,
    pode: true,
  }
  const vistos = []
  const srv = http.createServer((req, res) => {
    let corpo = ''
    req.on('data', (c) => (corpo += c))
    req.on('end', () => {
      vistos.push({ metodo: req.method, origem: req.headers.origin || null, cookie: /mae_sessao=fumaca/.test(req.headers.cookie || ''), corpo })
      res.setHeader('content-type', 'application/json')
      if (!/mae_sessao=fumaca/.test(req.headers.cookie || '')) return res.writeHead(401).end('{"erro":"sem_sessao"}')
      if (req.method === 'POST') {
        estadoFalso = { ...estadoFalso, agora: new Date().toISOString(), rodando: null, hoje: [{ ...rodando, fim: new Date().toISOString() }] }
        return res.end(JSON.stringify({ parado: rodando, estado: estadoFalso }))
      }
      res.end(JSON.stringify({ ...estadoFalso, agora: new Date().toISOString() }))
    })
  })
  try {
    await new Promise((ok) => srv.listen(0, '127.0.0.1', ok))
    const base = `http://127.0.0.1:${srv.address().port}`
    const ses = session.fromPartition(PARTICAO)
    await ses.cookies.set({ url: base, name: 'mae_sessao', value: 'fumaca' })
    const c = new Cronometro({ base, fetch: (url, init) => ses.fetch(url, init) })
    cronometro = c
    await c.atualizar()
    const leu = c.situacao === 'ok' && !!c.estado.rodando && tempo.textoDaBarra({ ...c.retrato(), mostrar: true }).startsWith('01:0')
    const menu = menuDoCronometro()
    const menuOk = menu.items.length >= 6 && menu.items.some((i) => i.label === 'Pausar') && menu.items.some((i) => i.label === 'Abrir painel')
    await c.pausar()
    const post = vistos.find((v) => v.metodo === 'POST')
    const pausou = !!post && post.origem === base && post.cookie && JSON.parse(post.corpo).op === 'pausar' && !c.estado.rodando
    let atalhoTxt = 'não registrou (a máquina não deixou)'
    const a = new Atalho({ globalShortcut, aoTocar: () => {} })
    if (a.aplicar(tempo.ATALHO_PADRAO).ok) {
      a.liberar()
      atalhoTxt = globalShortcut.isRegistered(tempo.ATALHO_PADRAO) ? 'FICOU PRESO' : 'registrou e liberou'
    }
    log(`cronômetro: ícones ${icones} · leu o estado ${leu} · menu ${menuOk} · pausar com cookie e Origin ${pausou} · atalho ${atalhoTxt}`)
    return icones && leu && menuOk && pausou && atalhoTxt !== 'FICOU PRESO'
  } catch (e) {
    log(`cronômetro: erro ${e && e.message}`)
    return false
  } finally {
    cronometro = null
    srv.close()
  }
}

// ───────── ciclo de vida ─────────
app.on('open-url', (e, url) => {
  // Mac: link maestro:// (pode chegar antes do app ficar pronto)
  e.preventDefault()
  abrirDeepLink(url)
})

app.on('second-instance', (_e, argv) => {
  const alvo = regras.deepLinkDosArgs(argv, O)
  if (alvo) abrirDeepLink(alvo.replace(O.maestro + '/', `${regras.ESQUEMA}://`))
  else focar()
})

app.whenReady().then(() => {
  // claro é o padrão; o escuro é escolha no seletor do próprio Maestro
  nativeTheme.themeSource = 'light'
  if (process.platform === 'win32') app.setAppUserModelId('com.absolutezro.maestro')
  if (!SMOKE) {
    if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient(regras.ESQUEMA, process.execPath, [path.resolve(process.argv[1])])
    else app.setAsDefaultProtocolClient(regras.ESQUEMA)
  }
  app.setAboutPanelOptions({
    applicationName: NOME,
    applicationVersion: app.getVersion(),
    version: BUILD.build > 0 ? `build ${BUILD.build}` : 'desenvolvimento',
    copyright: '© 2026 Absolute ZRO',
  })
  protegerSessao()
  menu()
  // aberto sozinho ao ligar o computador: só o cronômetro na barra/bandeja; a janela abre quando a pessoa pedir
  if (!abertoAoLigar()) criarJanela()
  if (SMOKE) return smoke()
  ligarCronometro()
  if (app.isPackaged) mostrarNovidades()
  aviso = new AvisoDeVersao({
    hub: O.hub,
    build: BUILD.build,
    pasta: app.getPath('userData'),
    fetch: fetchDoApp,
    mostrar: mostrarNovaVersao,
    notificar: notificarNovaVersao,
    log: (...a) => console.log(...a),
  })
  aviso.start()
  app.on('activate', () => {
    if (!win) criarJanela()
  })
})

app.on('before-quit', () => {
  if (aviso) aviso.stop()
  if (cronometro) cronometro.stop()
  if (atalho) atalho.liberar()
  globalShortcut.unregisterAll()
  salvarJanela()
})

// Fechar a janela não encerra: o cronômetro segue na barra de menus (Mac, como todo app do Mac) e na bandeja (Windows),
// até "Sair do Maestro". No Windows, a primeira vez avisa onde o app ficou.
app.on('window-all-closed', () => {
  if (SMOKE || !bandeja) return app.quit()
  if (MAC) return
  const marca = path.join(app.getPath('userData'), 'bandeja-avisada')
  if (fs.existsSync(marca)) return
  try {
    fs.writeFileSync(marca, '1')
  } catch {
    // sem gravar, avisa de novo da próxima vez
  }
  notificar({ titulo: 'O Maestro continua na bandeja', corpo: 'O cronômetro segue aqui. Para fechar de vez: Sair do Maestro, no ícone.', motivo: 'info' })
})

process.on('uncaughtException', (err) => {
  console.error(err)
  if (SMOKE) app.exit(1)
})
