// Relay · app para computador (Mac e Windows). Abre o Relay (https://relay.absolutezro.com) numa janela própria, com a
// sessão guardada (continua logado), menu em português, tela "Sem conexão" local e aviso de versão nova. O login é o
// login único da Absolute ZRO, pelo próprio site, dentro da janela (regras.cjs diz o que fica nela). É o mesmo site
// do navegador, numa janela: nada é processado aqui fora do que o site já faz.
//
// Como a janela é montada (o mesmo do Absolute ZRO para computador, apps/hub-desktop): a BrowserWindow é a moldura.
// No Mac ela mostra a barra de título própria (paginas/barra.html, com os três botões do sistema integrados); no
// Windows a moldura é a do sistema. O Relay roda numa WebContentsView por cima, na partição persist:relay, sem Node,
// com sandbox e isolamento de contexto.
//
// `--smoke` (CI, depois do build): abre a janela com a tela "Sem conexão" local (sem rede), confere a ponte e as
// regras e escreve "SMOKE OK" (também em RELAY_SMOKE_SAIDA, se definido).

const { app, BrowserWindow, WebContentsView, Menu, shell, session, ipcMain, dialog, screen, nativeTheme, clipboard, systemPreferences } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { spawn } = require('node:child_process')
const regras = require('./regras.cjs')
const janela = require('./janela.cjs')
const { AvisoDeVersao, lerBuildInfo } = require('./versao.cjs')
const { Atualizador, baixarPara, comandoDaTroca, ehScriptDaTroca } = require('./atualizador.cjs')
const { arquivoDaCentral, lerGerenciado } = require('./gerenciado.cjs')

const NOME = 'Relay'
const SMOKE = process.argv.includes('--smoke')
const SMOKE_SAIDA = process.env.RELAY_SMOKE_SAIDA || null
const MAC = process.platform === 'darwin'
const PLATAFORMA = MAC ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux'
const PAGINAS = path.join(__dirname, 'paginas')
const PARTICAO = 'persist:relay'
// fundo do tema claro do Relay (o padrão; o escuro é escolha dele): a janela já nasce nessa cor, sem flash
const FUNDO = '#f5f5f7'
const ALTURA_BARRA = MAC ? 38 : 0
const O = regras.origens({ empacotado: app.isPackaged })
const BUILD = lerBuildInfo(path.join(__dirname, 'build-info.json'))
// O app abre direto no Relay (o painel); sem sessão, o próprio site leva para "Entrar".
const INICIO = O.relay + '/converter'

// O teste de fumaça usa uma pasta de dados descartável: não mexe na sessão de quem roda.
if (SMOKE) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'relay-smoke-')))

// Um app só: abrir de novo (ou clicar num link relay://) traz a janela que já existe para a frente.
if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win = null
let view = null
let aviso = null
let atualizador = null
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
  }
  if (MAC) win.webContents.send('barra:estado', estado)
  win.setTitle(estado.titulo)
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
  // janelas novas (target=_blank, window.open): o Relay e o login ficam na janela; o resto vai para o navegador
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
  // na tela "Sem conexão", recarregar = tentar o Relay de novo
  if (ehPaginaLocal(wc.getURL())) return wc.loadURL(regras.ehDoApp(ultimaUrl, O) ? ultimaUrl : INICIO).catch(() => {})
  if (semCache) wc.reloadIgnoringCache()
  else wc.reload()
}

// ───────── ponte (só a página certa fala com o processo principal) ─────────
const daView = (e) => !!view && e.sender === view.webContents && e.senderFrame === view.webContents.mainFrame
const daBarra = (e) => !!win && e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame && ehPaginaLocal(e.senderFrame.url)

ipcMain.handle('relay:tentar-de-novo', (e) => {
  if (!daView(e)) return false
  view.webContents.loadURL(regras.ehDoApp(ultimaUrl, O) ? ultimaUrl : INICIO).catch(() => {})
  return true
})
ipcMain.handle('relay:abrir-no-navegador', (e) => {
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

// ───────── aviso de versão nova e "Atualizar" (baixa, confere, fecha e abre já atualizado) ─────────
// Pela partição do app: os cookies do login vão junto e a Absolute ZRO confere o gate de lançamento.
const fetchDoApp = (url, opts = {}) => session.fromPartition(PARTICAO).fetch(url, { credentials: 'include', ...opts })

async function avisar(nova) {
  const podeTrocar = !!atualizador && atualizador.podeInstalar(nova.build)
  const versao = nova.versao ? `A versão ${nova.versao} (build ${nova.build})` : `O build ${nova.build}`
  const { response } = await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, {
    type: 'info',
    buttons: [podeTrocar ? 'Atualizar' : 'Baixar', 'Depois'],
    defaultId: 0,
    cancelId: 1,
    message: 'Nova versão do Relay',
    detail: podeTrocar
      ? `${versao} está pronta. O app baixa, fecha e abre de novo já atualizado. Seu login continua.`
      : `${versao} já está disponível. ${atualizador && atualizador.motivo ? `${atualizador.motivo} ` : ''}Baixe e instale por cima desta: seu login continua.`,
  })
  if (response !== 0) return 'depois'
  return podeTrocar ? 'atualizar' : 'baixar'
}

// Progresso sem piscar: a barra no ícone do Dock/barra de tarefas e o título da janela mudam no lugar.
function mostrarAtualizacao(st) {
  if (!win || win.isDestroyed()) return
  if (st.fase === 'baixando') {
    const frac = st.total ? Math.min(1, st.recebido / st.total) : 2 // 2 = indeterminado
    win.setProgressBar(frac)
    win.setTitle(st.total ? `Atualizando o Relay · ${Math.round(frac * 100)}%` : 'Atualizando o Relay…')
  } else if (st.fase === 'conferindo' || st.fase === 'preparando' || st.fase === 'reiniciando') {
    win.setProgressBar(2)
    win.setTitle(st.fase === 'reiniciando' ? 'Reabrindo o Relay…' : 'Preparando a atualização…')
  } else {
    win.setProgressBar(-1)
    estadoBarra()
  }
}

async function atualizar(nova) {
  if (!atualizador) return
  try {
    const st = nova.url
      ? await atualizador.instalar({ ...nova, recheck: () => aviso.remoto() })
      : { fase: 'erro', erro: 'O instalador deste sistema ainda não foi publicado.' }
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
  if (!aviso) return
  const r = await aviso.conferir({ manual: true })
  const textos = {
    desenvolvimento: ['Versão de desenvolvimento', 'Este app não veio de um instalador oficial, então não confere versões novas.'],
    gerenciado: ['O Absolute ZRO cuida disto', 'O app Absolute ZRO para computador mantém o Relay em dia neste computador.'],
    'sem-resposta': ['Não deu para conferir agora', 'Sem resposta da Absolute ZRO. Tente de novo daqui a pouco.'],
    'em-dia': ['Você está na versão mais nova', `Relay ${app.getVersion()} (build ${BUILD.build}).`],
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
    message: NOME,
    detail: `Versão ${app.getVersion()} (${build})\nElectron ${process.versions.electron}\n\n${O.relay.replace(/^https?:\/\//, '')}`,
  })
}

// ───────── menu ─────────
function menu() {
  const wc = () => view && view.webContents
  const ir = (caminho) => () =>
    wc()
      ? wc()
          .loadURL(O.relay + caminho)
          .catch(() => {})
      : focar()
  const zoomItem = (label, accelerator, delta, extra = {}) => ({ label, accelerator, click: () => aplicarZoom(delta === 0 ? 0 : zoom + delta), ...extra })
  const template = [
    ...(MAC
      ? [
          {
            label: NOME,
            submenu: [
              { label: 'Sobre o Relay', click: sobre },
              { label: 'Procurar atualizações…', click: () => procurarVersao().catch(() => {}) },
              { type: 'separator' },
              { role: 'services', label: 'Serviços' },
              { type: 'separator' },
              { role: 'hide', label: 'Ocultar o Relay' },
              { role: 'hideOthers', label: 'Ocultar outros' },
              { role: 'unhide', label: 'Mostrar todos' },
              { type: 'separator' },
              { role: 'quit', label: 'Sair do Relay' },
            ],
          },
        ]
      : []),
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Início', accelerator: 'CmdOrCtrl+Shift+H', click: ir('/') },
        { label: 'Converter', accelerator: 'CmdOrCtrl+1', click: ir('/converter') },
        { label: 'Painel', accelerator: 'CmdOrCtrl+2', click: ir('/painel') },
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
        { label: 'Relay no navegador', click: () => abrirFora(O.relay + '/') },
        { label: 'Sua conta Absolute ZRO', click: () => abrirFora(O.hub + '/perfil') },
        ...(MAC
          ? []
          : [
              { type: 'separator' },
              { label: 'Procurar atualizações…', click: () => procurarVersao().catch(() => {}) },
              { label: 'Sobre o Relay', click: sobre },
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
  // nada de <webview> e, por padrão, nenhuma janela nova (a view do Relay tem regra própria, em criarJanela)
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
      pronto: !!(window.__relayOffline && window.__relayOffline.pronto),
      ponte: !!(window.relayDesktop && window.relayDesktop.isDesktop && typeof window.relayDesktop.tentarDeNovo === 'function'),
      semNode: typeof require === 'undefined' && typeof process === 'undefined',
      titulo: document.title,
      simbolo: (() => { const i = document.querySelector('img.simbolo'); return !!(i && i.complete && i.naturalWidth > 0) })(),
      fonte: document.fonts.check('800 40px Figtree'),
      fundo: getComputedStyle(document.body).backgroundColor,
    }))()`)
    log(
      `tela sem conexão: pronta ${r.pronto} · ponte ${r.ponte} · sem Node ${r.semNode} · símbolo ${r.simbolo} · Figtree ${r.fonte} · fundo ${r.fundo} · "${r.titulo}"`,
    )
    const M = O.relay
    const casos = [
      [regras.destino(M + '/', O), 'app'],
      [regras.destino(O.hub + '/oauth/authorize?client_id=relay-web', O), 'app'],
      [regras.destino('https://accounts.google.com/o/oauth2/v2/auth', O), 'app'],
      [regras.destino(O.hub + '/inicio', O), 'fora'],
      [regras.destino('file:///etc/passwd', O), 'nada'],
      [regras.deepLink('relay://painel', O), M + '/painel'],
      [regras.deepLink('relay://evil.example.com@x', O), null],
    ]
    const regrasOk = casos.every(([a, b]) => a === b)
    log(`regras de navegação e deep link: ${regrasOk ? 'ok' : 'FALHOU'}`)
    let barraOk = true
    if (MAC) {
      await new Promise((ok) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', ok) : ok()))
      barraOk = await win.webContents.executeJavaScript(`!!(window.zroBarra && document.getElementById('voltar'))`)
      log(`barra de título: ${barraOk ? 'ok' : 'FALHOU'}`)
    }
    const fundoOk = r.fundo === 'rgb(245, 245, 247)'
    // RELAY_SMOKE_CAPTURA=arquivo.png: mostra a janela e salva a tela "Sem conexão" (para conferir o visual)
    if (process.env.RELAY_SMOKE_CAPTURA) {
      win.show()
      await new Promise((ok) => setTimeout(ok, 1200))
      fs.writeFileSync(process.env.RELAY_SMOKE_CAPTURA, (await view.webContents.capturePage()).toPNG())
      log(`captura: ${process.env.RELAY_SMOKE_CAPTURA}`)
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
  // Mac: link relay:// (pode chegar antes do app ficar pronto)
  e.preventDefault()
  abrirDeepLink(url)
})

app.on('second-instance', (_e, argv) => {
  const alvo = regras.deepLinkDosArgs(argv, O)
  if (alvo) abrirDeepLink(alvo.replace(O.relay + '/', `${regras.ESQUEMA}://`))
  else focar()
})

app.whenReady().then(() => {
  // o tema vem do próprio site (a janela só segue a cor padrão dele)
  nativeTheme.themeSource = 'light'
  if (process.platform === 'win32') app.setAppUserModelId('com.absolutezro.relay')
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
  if (app.isPackaged) {
    atualizador = new Atualizador({
      nome: NOME,
      appExe: app.getPath('exe'),
      appPid: process.pid,
      pasta: app.getPath('userData'),
      entregar: entregarTroca,
      // o instalador vem pela Absolute ZRO (gate de lançamento), com os cookies do login
      baixar: (url, arquivo, aoProgresso) => baixarPara(url, arquivo, { fetch: fetchDoApp, aoProgresso }),
      log: (...a) => console.log(...a),
    })
    atualizador.on('mudou', mostrarAtualizacao)
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
    hub: O.hub,
    plataforma: PLATAFORMA,
    build: BUILD.build,
    pasta: app.getPath('userData'),
    fetch: fetchDoApp,
    // instalado pela central do Absolute ZRO: quem atualiza é ela (gerenciado.cjs, ADR 0018)
    gerenciado: app.isPackaged ? () => lerGerenciado(arquivoDaCentral(app.getPath('appData'))) : () => false,
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
