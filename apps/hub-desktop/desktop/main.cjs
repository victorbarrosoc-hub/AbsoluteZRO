// Absolute ZRO · app para computador (Mac e Windows). Abre o HUB (https://absolutezro.vercel.app) numa janela própria,
// com a sessão guardada (continua logado), menu em português, tela "Sem conexão" local e aviso de versão nova.
//
// Como a janela é montada: a BrowserWindow é a moldura. No Mac ela mostra a barra de título própria
// (paginas/barra.html, com os três botões do sistema integrados); no Windows a moldura é a do sistema. O HUB roda numa
// WebContentsView por cima, na partição persist:absolutezro, sem Node, com sandbox e isolamento de contexto.
// As regras de navegação ficam em regras.cjs (testadas sem Electron).
//
// `--smoke` (CI, depois do build): abre a janela com a tela "Sem conexão" local (sem rede), confere a ponte e as
// regras e escreve "SMOKE OK" (também em ZRO_SMOKE_SAIDA, se definido).

const { app, BrowserWindow, WebContentsView, Menu, shell, session, ipcMain, dialog, screen, nativeTheme, clipboard, systemPreferences } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const regras = require('./regras.cjs')
const janela = require('./janela.cjs')
const { AvisoDeVersao, lerBuildInfo } = require('./versao.cjs')

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

// O teste de fumaça usa uma pasta de dados descartável: não mexe na sessão de quem roda.
if (SMOKE) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'absolute-zro-smoke-')))

// Um app só: abrir de novo (ou clicar num link absolutezro://) traz a janela que já existe para a frente.
if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win = null
let view = null
let aviso = null
let ultimaUrl = HUB + '/'
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
  win.on('close', salvarJanela)
  win.on('closed', () => {
    win = null
    view = null
  })

  if (SMOKE) mostrarSemConexao('rede')
  else wc.loadURL(deepLinkPendente || HUB + '/').catch(() => {})
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
  view.webContents.loadURL(regras.ehDoHub(ultimaUrl, HUB) ? ultimaUrl : HUB + '/').catch(() => {})
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
  else if (acao === 'inicio') wc.loadURL(HUB + '/').catch(() => {})
  else if (acao === 'duplo-clique' && MAC) {
    const pref = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string')
    if (pref === 'Minimize') win.minimize()
    else if (pref !== 'None' && win.isMaximized()) win.unmaximize()
    else if (pref !== 'None') win.maximize()
  }
  return true
})

function recarregar(semCache) {
  if (!view) return
  const wc = view.webContents
  // na tela "Sem conexão", recarregar = tentar o HUB de novo
  if (ehPaginaLocal(wc.getURL())) return wc.loadURL(regras.ehDoHub(ultimaUrl, HUB) ? ultimaUrl : HUB + '/').catch(() => {})
  if (semCache) wc.reloadIgnoringCache()
  else wc.reload()
}

// ───────── aviso de versão nova ─────────
async function avisar(nova) {
  const { response } = await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, {
    type: 'info',
    buttons: ['Baixar', 'Depois'],
    defaultId: 0,
    cancelId: 1,
    message: 'Nova versão do Absolute ZRO',
    detail: `${nova.versao ? `A versão ${nova.versao} (build ${nova.build})` : `O build ${nova.build}`} já está no site. Baixe e instale por cima desta: seu login e suas preferências continuam.`,
  })
  return response === 0 ? 'baixar' : 'depois'
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
              { label: 'Procurar nova versão…', click: () => procurarVersao() },
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
              .loadURL(HUB + '/')
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
        { label: 'Baixar as ferramentas', click: () => (view ? view.webContents.loadURL(HUB + '/baixar').catch(() => {}) : null) },
        ...(MAC
          ? []
          : [{ type: 'separator' }, { label: 'Procurar nova versão…', click: () => procurarVersao() }, { label: 'Sobre o Absolute ZRO', click: sobre }]),
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
      ponte: !!(window.zroDesktop && window.zroDesktop.isDesktop),
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
    ]
    const regrasOk = casos.every(([a, b]) => a === b)
    log(`regras de navegação e deep link: ${regrasOk ? 'ok' : 'FALHOU'}`)
    let barraOk = true
    if (MAC) {
      await new Promise((r) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', r) : r()))
      barraOk = await win.webContents.executeJavaScript(`!!(window.zroBarra && document.getElementById('voltar'))`)
      log(`barra de título: ${barraOk ? 'ok' : 'FALHOU'}`)
    }
    const fundoOk = r.fundo === 'rgb(252, 251, 252)'
    // ZRO_SMOKE_CAPTURA=arquivo.png: mostra a janela e salva a tela "Sem conexão" (para conferir o visual)
    if (process.env.ZRO_SMOKE_CAPTURA) {
      win.show()
      await new Promise((ok) => setTimeout(ok, 1200))
      fs.writeFileSync(process.env.ZRO_SMOKE_CAPTURA, (await view.webContents.capturePage()).toPNG())
      log(`captura: ${process.env.ZRO_SMOKE_CAPTURA}`)
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
  // Mac: link absolutezro:// (pode chegar antes do app ficar pronto)
  e.preventDefault()
  abrirDeepLink(url)
})

app.on('second-instance', (_e, argv) => {
  const alvo = regras.deepLinkDosArgs(argv, HUB)
  if (alvo) abrirDeepLink(alvo.replace(HUB + '/', `${regras.ESQUEMA}://`))
  else focar()
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
  menu()
  criarJanela()
  if (SMOKE) return smoke()
  aviso = new AvisoDeVersao({
    hub: HUB,
    plataforma: PLATAFORMA,
    build: BUILD.build,
    pasta: app.getPath('userData'),
    avisar,
    abrir: abrirFora,
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

app.on('window-all-closed', () => {
  if (!MAC || SMOKE) app.quit()
})

process.on('uncaughtException', (err) => {
  console.error(err)
  if (SMOKE) app.exit(1)
})
