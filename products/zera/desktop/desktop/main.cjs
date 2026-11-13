// ZERA · app para computador (Mac e Windows; Linux para desenvolver).
//
// Mostra o que ocupa o disco e ajuda a liberar espaço com segurança:
//   - o motor em Rust (../motor) varre em paralelo e guarda a árvore na memória; a tela só pede o que mostra;
//   - a última varredura fica guardada: ao abrir de novo, o mapa aparece na hora e uma varredura nova confere por trás;
//   - o vigia do sistema (FSEvents no Mac, ReadDirectoryChanges no Windows) avisa o que mudou e o motor revarre só o
//     trecho;
//   - nada é apagado: os itens vão para o Lixo do sistema, depois de uma prévia e da confirmação da pessoa. A lista que
//     vai para o Lixo é a que o app conferiu (regras.cjs), nunca um caminho vindo da tela.
//
// Sem rede: a janela só carrega a interface local (desktop/interface). Sem login (nada sai do computador).
// `--smoke` (CI): varre uma pasta temporária, abre a interface e escreve "SMOKE OK" (também em ZERA_SMOKE_SAIDA).

'use strict'

const { app, BrowserWindow, Menu, shell, ipcMain, dialog, nativeTheme, session } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const regras = require('./regras.cjs')
const { Motor, acharMotor } = require('./motor.cjs')

const SMOKE = process.argv.includes('--smoke')
const SMOKE_SAIDA = process.env.ZERA_SMOKE_SAIDA || null
const MAC = process.platform === 'darwin'
const PLATAFORMA = process.platform
const HOME = os.homedir()
const INTERFACE = path.join(__dirname, 'interface', 'index.html')

if (SMOKE) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'zera-smoke-')))

if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

const motor = new Motor(acharMotor({ empacotado: app.isPackaged, resources: process.resourcesPath }))
let win = null
const estado = { raiz: null, vigia: null, mudados: new Set(), timerVigia: null, timerSalvar: null, previas: new Map() }

// ---------- preferências e varreduras guardadas ----------

const DADOS = () => app.getPath('userData')
const PREFS = () => path.join(DADOS(), 'preferencias.json')

function lerPrefs() {
  try {
    return JSON.parse(fs.readFileSync(PREFS(), 'utf8'))
  } catch {
    return {}
  }
}

function gravarPrefs(p) {
  try {
    fs.mkdirSync(DADOS(), { recursive: true })
    fs.writeFileSync(PREFS(), JSON.stringify(p))
  } catch {
    /* sem preferências: segue com o padrão */
  }
}

function arquivoDeCache(raiz) {
  const dir = path.join(DADOS(), 'varreduras')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, crypto.createHash('sha1').update(raiz).digest('hex') + '.bin')
}

function quandoDoCache(raiz) {
  try {
    return Math.floor(fs.statSync(arquivoDeCache(raiz)).mtimeMs / 1000)
  } catch {
    return null
  }
}

function aplicarTema(tema) {
  nativeTheme.themeSource = tema === 'escuro' ? 'dark' : 'light'
}

// ---------- discos ----------

const ler = {
  listar(dir) {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).map((d) => {
        const symlink = d.isSymbolicLink()
        let alvo = null
        if (symlink) {
          try {
            alvo = fs.readlinkSync(path.join(dir, d.name))
          } catch {
            /* sem alvo */
          }
        }
        return { nome: d.name, symlink, alvo }
      })
    } catch {
      return []
    }
  },
  espaco(c) {
    try {
      const s = fs.statfsSync(c)
      return { total: s.blocks * s.bsize, livre: s.bavail * s.bsize }
    } catch {
      return null
    }
  },
  dispositivo(c) {
    try {
      return fs.statSync(c).dev
    } catch {
      return null
    }
  },
  existe(c) {
    try {
      return fs.statSync(c).isDirectory()
    } catch {
      return false
    }
  },
}

// ---------- vigia: revarre só o que mudou ----------

function pararVigia() {
  if (estado.vigia) estado.vigia.close()
  estado.vigia = null
  clearTimeout(estado.timerVigia)
  estado.mudados.clear()
}

function iniciarVigia(raiz) {
  pararVigia()
  // No Linux o fs.watch recursivo abre um vigia por pasta: caro demais para um disco inteiro.
  if (PLATAFORMA === 'linux' || SMOKE) return
  try {
    estado.vigia = fs.watch(raiz, { recursive: true, persistent: false }, (_tipo, nome) => {
      if (!nome) return
      estado.mudados.add(String(nome))
      clearTimeout(estado.timerVigia)
      estado.timerVigia = setTimeout(revarrerMudados, 2500)
    })
    estado.vigia.on('error', () => pararVigia())
  } catch {
    estado.vigia = null
  }
}

async function revarrerMudados() {
  if (!estado.raiz || !estado.mudados.size) return
  const pastas = regras.pastasParaRevarrer([...estado.mudados], { raiz: estado.raiz, plataforma: PLATAFORMA, ignorar: [DADOS()] })
  estado.mudados.clear()
  if (!pastas.length) return
  const op = regras.opcoesDeVarredura(estado.raiz, PLATAFORMA)
  const r = await motor.pedir('revarrer', { pastas, ...op })
  if (!r.ok) {
    // motor ocupado (varrendo ou procurando repetidos): tenta de novo daqui a pouco
    if (r.erro === 'ocupado') {
      for (const p of pastas) estado.mudados.add(p)
      estado.timerVigia = setTimeout(revarrerMudados, 4000)
    }
    return
  }
  if (r.mudou.length) {
    enviar({ t: 'atualizado', raiz: r.raiz })
    salvarDepois()
  }
}

function salvarDepois() {
  clearTimeout(estado.timerSalvar)
  estado.timerSalvar = setTimeout(() => {
    if (estado.raiz) motor.pedir('salvar', { arquivo: arquivoDeCache(estado.raiz) })
  }, 20000)
}

// ---------- ponte com a interface ----------

function enviar(m) {
  if (win && !win.isDestroyed()) win.webContents.send('zera:evento', m)
}

motor.on('evento', (m) => enviar(m))
motor.on('parou', () => enviar({ t: 'motor-parou' }))

function noValido(v) {
  return Number.isInteger(v) && v >= 0 && v < 2 ** 32 ? v : 0
}

function pastaValida(c) {
  return typeof c === 'string' && path.isAbsolute(c) && ler.existe(c)
}

async function caminhosConferidos(lista) {
  const r = await motor.pedir('caminhos', { nos: regras.ids(lista) })
  if (!r.ok) return []
  return r.caminhos
}

const handlers = {
  async info() {
    return { plataforma: PLATAFORMA, versao: app.getVersion(), tema: lerPrefs().tema === 'escuro' ? 'escuro' : 'claro', motor: motor.existe() }
  },
  async tema(_e, tema) {
    const p = lerPrefs()
    p.tema = tema === 'escuro' ? 'escuro' : 'claro'
    gravarPrefs(p)
    aplicarTema(p.tema)
    montarMenu()
    return p.tema
  },
  async discos() {
    const lista = regras.discos(PLATAFORMA, ler)
    const prefs = lerPrefs()
    const extras = Array.isArray(prefs.pastas) ? prefs.pastas.filter(pastaValida) : []
    for (const c of extras) {
      if (!lista.some((d) => d.caminho === c)) lista.push({ caminho: c, nome: path.basename(c) || c, principal: false, pasta: true })
    }
    return lista.map((d) => ({ ...d, cache: quandoDoCache(d.caminho) }))
  },
  async escolherPasta() {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], buttonLabel: 'Varrer' })
    if (r.canceled || !r.filePaths[0]) return null
    const c = r.filePaths[0]
    const p = lerPrefs()
    p.pastas = [c, ...(Array.isArray(p.pastas) ? p.pastas.filter((x) => x !== c) : [])].slice(0, 5)
    gravarPrefs(p)
    return c
  },
  async varrer(_e, raiz) {
    if (!pastaValida(raiz)) return { ok: false, erro: 'raiz_inexistente' }
    pararVigia()
    const espaco = ler.espaco(raiz)
    const r = await motor.pedir('varrer', { raiz, ...regras.opcoesDeVarredura(raiz, PLATAFORMA), cache: arquivoDeCache(raiz) })
    if (r.ok) {
      estado.raiz = raiz
      iniciarVigia(raiz)
    }
    return { ...r, espaco }
  },
  async carregar(_e, raiz) {
    if (!pastaValida(raiz)) return { ok: false, erro: 'raiz_inexistente' }
    const r = await motor.pedir('carregar', { arquivo: arquivoDeCache(raiz) })
    if (r.ok && r.caminho === raiz) estado.raiz = raiz
    return r.ok && r.caminho === raiz ? r : { ok: false, erro: 'sem_cache' }
  },
  async parar() {
    return motor.pedir('cancelar')
  },
  async abrir(_e, no) {
    return motor.pedir('abrir', { no: noValido(no), max: 400 })
  },
  async anel(_e, no, niveis) {
    return motor.pedir('anel', { no: noValido(no), niveis: Math.min(5, Math.max(1, niveis | 0)), min: 0.006 })
  },
  async achar(_e, caminho) {
    if (typeof caminho !== 'string') return { ok: false }
    return motor.pedir('achar', { caminho })
  },
  async sugestoes() {
    return motor.pedir('sugestoes')
  },
  async duplicados() {
    return motor.pedir('duplicados', { min: 1_000_000 })
  },
  // Prévia: confere cada item (regras.cjs) e guarda a lista conferida com um código de uso único.
  async previa(_e, lista) {
    if (!estado.raiz) return { ok: false }
    const itens = []
    const bloqueados = []
    for (const it of await caminhosConferidos(lista)) {
      const motivo = regras.motivoParaNaoTirar(it.c, { plataforma: PLATAFORMA, home: HOME, raiz: estado.raiz })
      if (motivo) bloqueados.push({ ...it, motivo })
      else if (!fs.existsSync(it.c)) bloqueados.push({ ...it, motivo: 'Já não existe' })
      else itens.push({ ...it, nuvem: regras.naNuvem(it.c) })
    }
    const finais = regras.semAninhados(itens, PLATAFORMA)
    const token = crypto.randomUUID()
    estado.previas.clear()
    estado.previas.set(token, { itens: finais, criada: Date.now() })
    return { ok: true, token, itens: finais, bloqueados, total: finais.reduce((s, i) => s + i.b, 0) }
  },
  async moverParaLixo(_e, token) {
    const previa = estado.previas.get(token)
    estado.previas.delete(token)
    if (!previa || Date.now() - previa.criada > 10 * 60 * 1000) return { ok: false, erro: 'previa_vencida' }
    const movidos = []
    const falhas = []
    for (const it of previa.itens) {
      try {
        await shell.trashItem(it.c)
        movidos.push(it)
      } catch (e) {
        falhas.push({ c: it.c, erro: String((e && e.message) || e).slice(0, 120) })
      }
    }
    const r = await motor.pedir('remover', { nos: movidos.map((m) => m.id) })
    salvarDepois()
    return { ok: true, movidos: movidos.length, liberado: movidos.reduce((s, i) => s + i.b, 0), falhas, raiz: r.raiz }
  },
  async mostrar(_e, no) {
    const [it] = await caminhosConferidos([noValido(no)])
    if (it && estado.raiz && regras.dentro(it.c, estado.raiz, PLATAFORMA)) shell.showItemInFolder(it.c)
  },
  async abrirLixo() {
    if (PLATAFORMA === 'win32') spawn('explorer.exe', ['shell:RecycleBinFolder'], { detached: true, stdio: 'ignore' }).unref()
    else if (MAC) shell.openPath(path.join(HOME, '.Trash'))
    else shell.openPath(path.join(HOME, '.local', 'share', 'Trash', 'files'))
  },
  async abrirPermissoes() {
    if (MAC) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')
  },
  async pronto() {
    if (SMOKE) smokeTerminar()
  },
}

for (const [nome, fn] of Object.entries(handlers)) ipcMain.handle('zera:' + nome, fn)

// ---------- janela e menu ----------

function comando(c) {
  enviar({ t: 'menu', c })
}

function montarMenu() {
  const tema = lerPrefs().tema === 'escuro' ? 'escuro' : 'claro'
  const modelo = [
    ...(MAC ? [{ role: 'appMenu', label: 'ZERA' }] : []),
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Varrer de novo', accelerator: 'CmdOrCtrl+R', click: () => comando('varrer') },
        { label: 'Escolher pasta…', accelerator: 'CmdOrCtrl+O', click: () => comando('pasta') },
        { label: 'Discos', accelerator: 'CmdOrCtrl+Shift+D', click: () => comando('discos') },
        { type: 'separator' },
        MAC ? { role: 'close', label: 'Fechar janela' } : { role: 'quit', label: 'Sair' },
      ],
    },
    { role: 'editMenu', label: 'Editar' },
    {
      label: 'Visualizar',
      submenu: [
        { label: 'Mapa', accelerator: 'CmdOrCtrl+1', click: () => comando('mapa') },
        { label: 'Limpar', accelerator: 'CmdOrCtrl+2', click: () => comando('limpar') },
        { label: 'Cesta', accelerator: 'CmdOrCtrl+3', click: () => comando('cesta') },
        { type: 'separator' },
        { label: 'Tema claro', type: 'radio', checked: tema === 'claro', click: () => handlers.tema(null, 'claro').then(() => comando('tema')) },
        { label: 'Tema escuro', type: 'radio', checked: tema === 'escuro', click: () => handlers.tema(null, 'escuro').then(() => comando('tema')) },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    { role: 'windowMenu', label: 'Janela' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(modelo))
}

function criarJanela() {
  const escuro = lerPrefs().tema === 'escuro'
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    show: false,
    title: 'ZERA',
    backgroundColor: escuro ? '#131316' : '#f5f5f7',
    ...(MAC ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 20 } } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      webviewTag: false,
    },
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.once('ready-to-show', () => {
    if (!SMOKE) win.show()
  })
  win.on('closed', () => {
    win = null
  })
  win.loadFile(INTERFACE)
}

// ---------- teste de fumaça ----------

let smokeRaiz = null
async function smokeComecar() {
  // na pasta da pessoa: no Mac o temporário fica em /var, que o ZERA nunca deixa ir para o Lixo
  smokeRaiz = fs.realpathSync(fs.mkdtempSync(path.join(HOME, '.zera-smoke-disco-')))
  fs.mkdirSync(path.join(smokeRaiz, 'Filmes', 'Media Cache Files'), { recursive: true })
  fs.writeFileSync(path.join(smokeRaiz, 'Filmes', 'bruto.mov'), Buffer.alloc(300_000, 1))
  fs.writeFileSync(path.join(smokeRaiz, 'Filmes', 'Media Cache Files', 'a.cfa'), Buffer.alloc(200_000, 2))
}

async function smokeTerminar() {
  const linhas = []
  try {
    const r = await handlers.varrer(null, smokeRaiz)
    if (!r.ok || r.raiz.a !== 2) throw new Error('varredura: ' + JSON.stringify(r))
    const s = await handlers.sugestoes()
    const g = s.grupos.find((x) => x.id === 'cache-edicao')
    if (!g || g.qtd !== 1) throw new Error('sugestões')
    const p = await handlers.previa(null, [g.itens[0].id])
    if (!p.ok || p.itens.length !== 1) throw new Error('prévia')
    const fora = await handlers.previa(null, [0])
    if (fora.itens.length !== 0 || fora.bloqueados[0].motivo !== 'É a pasta varrida inteira') throw new Error('regras')
    const tela = await win.webContents.executeJavaScript('document.documentElement.dataset.pronto === "1" && typeof window.zera === "object"')
    if (!tela) throw new Error('interface')
    linhas.push('SMOKE OK')
  } catch (e) {
    linhas.push('SMOKE FALHOU: ' + e.message)
  }
  const saida = linhas.join('\n') + '\n'
  process.stdout.write(saida)
  if (SMOKE_SAIDA) fs.writeFileSync(SMOKE_SAIDA, saida)
  motor.parar()
  fs.rmSync(smokeRaiz, { recursive: true, force: true })
  app.exit(linhas[0] === 'SMOKE OK' ? 0 : 1)
}

// ---------- ciclo de vida ----------

app.whenReady().then(async () => {
  aplicarTema(lerPrefs().tema)
  // Nenhuma permissão do navegador (câmera, microfone, notificações…): o ZERA não precisa.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  montarMenu()
  if (SMOKE) await smokeComecar()
  criarJanela()
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  if (!win) criarJanela()
})

app.on('window-all-closed', () => {
  if (!MAC || SMOKE) app.quit()
})

let saindo = false
app.on('before-quit', (e) => {
  if (saindo || !estado.raiz || SMOKE) {
    motor.parar()
    return
  }
  // guarda a árvore atual (com o que o vigia corrigiu) antes de sair, sem segurar mais de 1,5 s
  e.preventDefault()
  saindo = true
  pararVigia()
  Promise.race([motor.pedir('salvar', { arquivo: arquivoDeCache(estado.raiz) }), new Promise((r) => setTimeout(r, 1500))]).finally(() => {
    motor.parar()
    app.quit()
  })
})
