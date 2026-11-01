// Rift Motion · app para computador (Mac e Windows). Abre o Rift Motion (https://rift.absolutezro.com) numa janela própria, com a
// sessão guardada (continua logado), menu em português, tela "Sem conexão" local e aviso de versão nova. O login é o
// login único da Absolute ZRO, pelo próprio site, dentro da janela (regras.cjs diz o que fica nela). É o mesmo site
// do navegador, numa janela: nada é processado aqui fora do que o site já faz.
//
// Como a janela é montada (o mesmo do Absolute ZRO para computador, apps/hub-desktop): a BrowserWindow é a moldura.
// No Mac ela mostra a barra de título própria (paginas/barra.html, com os três botões do sistema integrados); no
// Windows a moldura é a do sistema. O Rift Motion roda numa WebContentsView por cima, na partição persist:rift, sem Node,
// com sandbox e isolamento de contexto.
//
// `--smoke` (CI, depois do build): abre a janela com a tela "Sem conexão" local (sem rede), confere a ponte e as
// regras e escreve "SMOKE OK" (também em RIFT_SMOKE_SAIDA, se definido).

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
  Notification,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const regras = require('./regras.cjs')
const janela = require('./janela.cjs')
const { AvisoDeVersao, lerBuildInfo, PRODUTO } = require('./versao.cjs')
const central = require('./central.cjs')

const NOME = 'Rift Motion'
const SMOKE = process.argv.includes('--smoke')
const SMOKE_SAIDA = process.env.RIFT_SMOKE_SAIDA || null
const MAC = process.platform === 'darwin'
const PAGINAS = path.join(__dirname, 'paginas')
const PARTICAO = 'persist:rift'
// fundo do tema claro do Rift Motion (o padrão; o escuro é escolha dele): a janela já nasce nessa cor, sem flash
const FUNDO = '#f5f5f7'
const ALTURA_BARRA = MAC ? 38 : 0
const O = regras.origens({ empacotado: app.isPackaged })
const BUILD = lerBuildInfo(path.join(__dirname, 'build-info.json'))
// O app abre direto no painel do Rift Motion (#app); sem sessão, o próprio site leva para "Entrar".
const INICIO = O.rift + '/#app'

// O teste de fumaça usa uma pasta de dados descartável: não mexe na sessão de quem roda.
if (SMOKE) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'rift-smoke-')))

// Um app só: abrir de novo (ou clicar num link rift://) traz a janela que já existe para a frente.
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

  // mostra a janela assim que houver algo pintado (a cor do site desde o primeiro quadro, sem flash)
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
  // janelas novas (target=_blank, window.open): o Rift Motion e o login ficam na janela; o resto vai para o navegador
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
    if (regras.ehDoApp(url, O)) ultimaUrl = url
    wc.setZoomLevel(zoom)
    estadoBarra()
  })
  wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
    if (isMainFrame && regras.ehDoApp(url, O)) ultimaUrl = url
    estadoBarra()
  })
  wc.on('did-fail-load', (_e, codigo, _descricao, url, isMainFrame) => {
    // -3 = navegação cancelada (por nós, em will-redirect, ou por outra navegação): não é falta de rede
    if (!isMainFrame || codigo === -3 || ehPaginaLocal(url)) return
    if (regras.ehDoApp(url, O)) ultimaUrl = url
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
  // na tela "Sem conexão", recarregar = tentar o Rift Motion de novo
  if (ehPaginaLocal(wc.getURL())) return wc.loadURL(regras.ehDoApp(ultimaUrl, O) ? ultimaUrl : INICIO).catch(() => {})
  if (semCache) wc.reloadIgnoringCache()
  else wc.reload()
}

// ───────── ponte (só a página certa fala com o processo principal) ─────────
const daView = (e) => !!view && e.sender === view.webContents && e.senderFrame === view.webContents.mainFrame
const daBarra = (e) => !!win && e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame && ehPaginaLocal(e.senderFrame.url)

ipcMain.handle('rift:tentar-de-novo', (e) => {
  if (!daView(e)) return false
  view.webContents.loadURL(regras.ehDoApp(ultimaUrl, O) ? ultimaUrl : INICIO).catch(() => {})
  return true
})
ipcMain.handle('rift:abrir-no-navegador', (e) => {
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
    detail: `Versão ${app.getVersion()} (${build})\nElectron ${process.versions.electron}\n\n${O.rift.replace(/^https?:\/\//, '')}`,
  })
}

// ───────── menu ─────────
function menu() {
  const wc = () => view && view.webContents
  const ir = (caminho) => () =>
    wc()
      ? wc()
          .loadURL(O.rift + caminho)
          .catch(() => {})
      : focar()
  const zoomItem = (label, accelerator, delta, extra = {}) => ({ label, accelerator, click: () => aplicarZoom(delta === 0 ? 0 : zoom + delta), ...extra })
  const template = [
    ...(MAC
      ? [
          {
            label: NOME,
            submenu: [
              { label: 'Sobre o Rift Motion', click: sobre },
              itemDeAtualizacao(),
              { type: 'separator' },
              { role: 'services', label: 'Serviços' },
              { type: 'separator' },
              { role: 'hide', label: 'Ocultar o Rift Motion' },
              { role: 'hideOthers', label: 'Ocultar outros' },
              { role: 'unhide', label: 'Mostrar todos' },
              { type: 'separator' },
              { role: 'quit', label: 'Sair do Rift Motion' },
            ],
          },
        ]
      : []),
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Início', accelerator: 'CmdOrCtrl+Shift+H', click: ir('/') },
        { label: 'Painel', accelerator: 'CmdOrCtrl+1', click: ir('/#app') },
        { label: 'Estúdio', accelerator: 'CmdOrCtrl+2', click: ir('/#estudio') },
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
        { label: 'Rift Motion no navegador', click: () => abrirFora(O.rift + '/') },
        { label: 'Sua conta Absolute ZRO', click: () => abrirFora(O.hub + '/perfil') },
        ...(MAC ? [] : [{ type: 'separator' }, itemDeAtualizacao(), { label: 'Sobre o Rift Motion', click: sobre }]),
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
  // nada de <webview> e, por padrão, nenhuma janela nova (a view do Rift Motion tem regra própria, em criarJanela)
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
      pronto: !!(window.__riftOffline && window.__riftOffline.pronto),
      ponte: !!(window.riftDesktop && window.riftDesktop.isDesktop && typeof window.riftDesktop.tentarDeNovo === 'function'),
      semNode: typeof require === 'undefined' && typeof process === 'undefined',
      titulo: document.title,
      simbolo: (() => { const i = document.querySelector('img.simbolo'); return !!(i && i.complete && i.naturalWidth > 0) })(),
      fonte: document.fonts.check('800 40px Figtree'),
      fundo: getComputedStyle(document.body).backgroundColor,
    }))()`)
    log(
      `tela sem conexão: pronta ${r.pronto} · ponte ${r.ponte} · sem Node ${r.semNode} · símbolo ${r.simbolo} · Figtree ${r.fonte} · fundo ${r.fundo} · "${r.titulo}"`,
    )
    const M = O.rift
    const casos = [
      [regras.destino(M + '/', O), 'app'],
      [regras.destino(O.hub + '/oauth/authorize?client_id=rift-web', O), 'app'],
      [regras.destino('https://accounts.google.com/o/oauth2/v2/auth', O), 'app'],
      [regras.destino(O.hub + '/inicio', O), 'fora'],
      [regras.destino('file:///etc/passwd', O), 'nada'],
      [regras.deepLink('rift://painel', O), M + '/painel'],
      [regras.deepLink('rift://evil.example.com@x', O), null],
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
    const fundoOk = r.fundo === 'rgb(245, 245, 247)'
    // RIFT_SMOKE_CAPTURA=arquivo.png: mostra a janela e salva a tela "Sem conexão" (para conferir o visual)
    if (process.env.RIFT_SMOKE_CAPTURA) {
      win.show()
      await new Promise((ok) => setTimeout(ok, 1200))
      fs.writeFileSync(process.env.RIFT_SMOKE_CAPTURA, (await view.webContents.capturePage()).toPNG())
      log(`captura: ${process.env.RIFT_SMOKE_CAPTURA}`)
    }
    clearTimeout(timer)
    fim(r.pronto && r.ponte && r.semNode && r.simbolo && r.fonte && fundoOk && regrasOk && barraOk)
  } catch (err) {
    clearTimeout(timer)
    log(`erro: ${err && err.message ? err.message : err}`)
    fim(false)
  }
}

// ───────── ciclo de vida ─────────
app.on('open-url', (e, url) => {
  // Mac: link rift:// (pode chegar antes do app ficar pronto)
  e.preventDefault()
  abrirDeepLink(url)
})

app.on('second-instance', (_e, argv) => {
  const alvo = regras.deepLinkDosArgs(argv, O)
  if (alvo) abrirDeepLink(alvo.replace(O.rift + '/', `${regras.ESQUEMA}://`))
  else focar()
})

app.whenReady().then(() => {
  // o tema vem do próprio site (a janela só segue a cor padrão dele)
  nativeTheme.themeSource = 'light'
  if (process.platform === 'win32') app.setAppUserModelId('com.absolutezro.riftmotion')
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
  criarJanela()
  if (SMOKE) return smoke()
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
  salvarJanela()
})

// Windows e Linux: fechar a última janela encerra. Mac: o app fica no Dock até Sair (como todo app do Mac).
app.on('window-all-closed', () => {
  if (SMOKE || !MAC) app.quit()
})

process.on('uncaughtException', (err) => {
  console.error(err)
  if (SMOKE) app.exit(1)
})
