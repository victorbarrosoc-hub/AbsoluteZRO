// Editor da Absolute ZRO · app de desktop (Mac e Windows), no mesmo molde do Synquei: o app é a mesma página de app/,
// servida de dentro do pacote por um protocolo próprio (<esquema>://app/…). Vantagens sobre o navegador: a mídia é
// lida no lugar, pelo caminho (vídeos de vários GB sem copiar para a memória); a exportação leva o caminho completo
// (o editor acha a mídia sem revincular); o Chromium do Electron traz H.264/AAC; e os modelos de transcrição ficam
// guardados no disco (funciona sem internet depois do primeiro download).
//
// `--smoke` (CI, depois do build): abre o app, faz um vídeo de teste, analisa o som, aprova, exporta para os editores
// e renderiza; escreve "SMOKE OK" ou "SMOKE FALHOU".

const { app, BrowserWindow, Menu, protocol, shell, session, dialog, ipcMain, net } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const { Readable } = require('node:stream')
const { lerProjeto } = require('./sobedesce.cjs')
const { PRODUTO } = require('../src/produto.js')
const CABECALHOS = require('./cabecalhos.json')

const ESQUEMA = PRODUTO.esquema
const ROOT = path.join(__dirname, '..')
const SMOKE = process.argv.includes('--smoke')
const SMOKE_OUT = process.env.AIEDIT_SMOKE_SAIDA || null
// --medir=<vídeo> [--modelo=rapido|preciso]: a demo medida no app de verdade (app/medir.js), resultado em JSON na saída
const MEDIR = (process.argv.find((a) => a.startsWith('--medir=')) || '').slice('--medir='.length) || null
const MODELO = (process.argv.find((a) => a.startsWith('--modelo=')) || '').slice('--modelo='.length) || 'rapido'
const HF = 'https://huggingface.co/'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}
const MIME_MIDIA = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mxf': 'application/mxf', '.mts': 'video/mp2t', '.m2ts': 'video/mp2t', '.avi': 'video/x-msvideo', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.aif': 'audio/aiff', '.aiff': 'audio/aiff', '.flac': 'audio/flac' }

protocol.registerSchemesAsPrivileged([{ scheme: ESQUEMA, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }])

if (!SMOKE && !app.requestSingleInstanceLock()) app.quit()

let win = null
// a página só lê arquivos que a pessoa escolheu (ou que vieram do projeto do SOBEDESCE que ela abriu)
const permitidos = new Set()
// pastas e arquivos escolhidos nos diálogos de salvar: só neles o app grava
const pastasDeSaida = new Set()
const arquivosDeSaida = new Set()
const abertos = new Map()
let proxId = 1

const cabecalhos = (extra) => ({ ...CABECALHOS, ...extra })

/** <esquema>://app/__midia?c=<caminho>: o arquivo escolhido, com Range (o <video> e o Mediabunny pedem pedaços). */
async function midia(req, u) {
  const abs = path.resolve(u.searchParams.get('c') || '')
  if (!permitidos.has(abs)) return new Response('Arquivo não escolhido', { status: 403 })
  let st
  try {
    st = await fsp.stat(abs)
    if (!st.isFile()) throw new Error('não é arquivo')
  } catch {
    return new Response('Não encontrado', { status: 404 })
  }
  const base = cabecalhos({ 'content-type': MIME_MIDIA[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': 'no-store' })
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '')
  if (!m) return new Response(st.size ? Readable.toWeb(fs.createReadStream(abs)) : null, { status: 200, headers: { ...base, 'content-length': String(st.size) } })
  const a = m[1] === '' ? Math.max(0, st.size - Number(m[2] || 0)) : Number(m[1])
  const b = m[1] === '' || m[2] === '' ? st.size - 1 : Math.min(Number(m[2]), st.size - 1)
  if (a >= st.size || b < a) return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${st.size}` } })
  return new Response(Readable.toWeb(fs.createReadStream(abs, { start: a, end: b })), { status: 206, headers: { ...base, 'content-length': String(b - a + 1), 'content-range': `bytes ${a}-${b}/${st.size}` } })
}

/**
 * <esquema>://app/__hf/<repo>/resolve/<rev>/<arquivo>: os arquivos do modelo de transcrição. Da pasta de dados do app
 * quando já foram baixados; senão do Hugging Face, guardando uma cópia (só depois de chegar inteiro).
 */
async function modelo(req, u) {
  const rel = decodeURIComponent(u.pathname.slice('/__hf/'.length))
  if (!/^[\w.-]+\/[\w.-]+\/resolve\/[\w.-]+\/[\w./-]+$/.test(rel) || rel.split('/').includes('..')) return new Response('Caminho inválido', { status: 400 })
  const local = path.join(app.getPath('userData'), 'modelos', ...rel.split('/'))
  const tipo = { 'content-type': rel.endsWith('.json') ? 'application/json' : 'application/octet-stream' }
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.get('range') || '')
  let st = null
  try {
    st = await fsp.stat(local)
  } catch {}
  if (st) {
    if (!range) return new Response(Readable.toWeb(fs.createReadStream(local)), { headers: cabecalhos({ ...tipo, 'content-length': String(st.size) }) })
    const a = Number(range[1])
    const b = range[2] === '' ? st.size - 1 : Math.min(Number(range[2]), st.size - 1)
    return new Response(Readable.toWeb(fs.createReadStream(local, { start: a, end: b })), { status: 206, headers: cabecalhos({ ...tipo, 'content-length': String(b - a + 1), 'content-range': `bytes ${a}-${b}/${st.size}` }) })
  }
  let r
  try {
    // net.fetch: a rede do Chromium (respeita o proxy do sistema, como o navegador)
    r = await net.fetch(HF + rel, range ? { headers: { range: range[0] } } : undefined)
  } catch (err) {
    console.error('[modelo]', rel, err && err.message)
    return new Response('Sem internet para baixar o modelo', { status: 503 })
  }
  const passar = {}
  for (const h of ['content-length', 'content-range']) if (r.headers.get(h)) passar[h] = r.headers.get(h)
  // pedaço (o Transformers.js pergunta o tamanho com bytes=0-0): passa direto, sem guardar
  if (range || !r.ok || !r.body) return new Response(r.body, { status: r.status, headers: cabecalhos({ ...tipo, ...passar }) })
  await fsp.mkdir(path.dirname(local), { recursive: true })
  const tmp = `${local}.baixando-${process.pid}-${Date.now()}`
  const arquivo = fs.createWriteStream(tmp)
  const [paraPagina, paraDisco] = r.body.tee()
  ;(async () => {
    try {
      for await (const pedaco of paraDisco) if (!arquivo.write(pedaco)) await new Promise((ok) => arquivo.once('drain', ok))
      await new Promise((ok, falha) => arquivo.end((e) => (e ? falha(e) : ok())))
      await fsp.rename(tmp, local)
    } catch {
      arquivo.destroy()
      await fsp.rm(tmp, { force: true }).catch(() => {})
    }
  })()
  return new Response(paraPagina, { headers: cabecalhos({ ...tipo, ...passar }) })
}

function servir() {
  protocol.handle(ESQUEMA, async (req) => {
    const u = new URL(req.url)
    if (u.pathname === '/__midia') return midia(req, u)
    if (u.pathname.startsWith('/__hf/')) return modelo(req, u)
    let rel = decodeURIComponent(u.pathname)
    if (rel.endsWith('/')) rel += 'index.html'
    const file = path.normalize(path.join(ROOT, rel))
    if (!file.startsWith(ROOT + path.sep)) return new Response('Fora do app', { status: 403 })
    try {
      const body = await fsp.readFile(file)
      return new Response(body, { headers: cabecalhos({ 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' }) })
    } catch {
      return new Response('Não encontrado', { status: 404 })
    }
  })
}

function criarJanela() {
  const mac = process.platform === 'darwin'
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    title: PRODUTO.nome,
    backgroundColor: '#0e0e10',
    titleBarStyle: mac ? 'hiddenInset' : 'default',
    trafficLightPosition: mac ? { x: 18, y: 18 } : undefined,
    autoHideMenuBar: !mac,
    icon: path.join(ROOT, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  })
  win.once('ready-to-show', () => !SMOKE && !MEDIR && win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${ESQUEMA}://`)) {
      e.preventDefault()
      if (/^https?:/i.test(url)) shell.openExternal(url)
    }
  })
  win.loadURL(`${ESQUEMA}://app/app/index.html`)
}

const rodar = (js) => win && win.webContents.executeJavaScript(js, true)
const tecla = (key, extra = '') => () => rodar(`dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', metaKey: true, ctrlKey: true ${extra} }))`)

function menu() {
  const mac = process.platform === 'darwin'
  const ir = (n) => tecla(String(n))
  const template = [
    ...(mac ? [{ label: PRODUTO.nome, submenu: [{ role: 'about', label: `Sobre o ${PRODUTO.nome}` }, { type: 'separator' }, { role: 'hide', label: `Ocultar o ${PRODUTO.nome}` }, { role: 'hideOthers', label: 'Ocultar outros' }, { role: 'unhide', label: 'Mostrar todos' }, { type: 'separator' }, { role: 'quit', label: `Sair do ${PRODUTO.nome}` }] }] : []),
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Adicionar vídeo…', accelerator: 'CmdOrCtrl+I', click: () => rodar(`document.getElementById('arquivo').click()`) },
        { label: 'Abrir do SOBEDESCE…', accelerator: 'CmdOrCtrl+Shift+I', click: () => rodar(`document.getElementById('abrirSobedesce').click()`) },
        { type: 'separator' },
        { label: 'Abrir projeto…', accelerator: 'CmdOrCtrl+O', click: tecla('o') },
        { label: 'Salvar projeto', accelerator: 'CmdOrCtrl+S', click: tecla('s') },
        { type: 'separator' },
        mac ? { role: 'close', label: 'Fechar janela' } : { role: 'quit', label: 'Sair' },
      ],
    },
    { label: 'Editar', submenu: [{ label: 'Desfazer', accelerator: 'CmdOrCtrl+Z', click: tecla('z') }, { label: 'Refazer', accelerator: 'Shift+CmdOrCtrl+Z', click: tecla('z', ', shiftKey: true') }, { type: 'separator' }, { role: 'cut', label: 'Recortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' }] },
    { label: 'Ir', submenu: [{ label: 'Mídia', accelerator: 'CmdOrCtrl+1', click: ir(1) }, { label: 'Revisar', accelerator: 'CmdOrCtrl+2', click: ir(2) }, { label: 'Edição', accelerator: 'CmdOrCtrl+3', click: ir(3) }, { label: 'Entrega', accelerator: 'CmdOrCtrl+4', click: ir(4) }] },
    { label: 'Visualizar', submenu: [{ role: 'reload', label: 'Recarregar' }, { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' }, { type: 'separator' }, { role: 'resetZoom', label: 'Tamanho real' }, { role: 'zoomIn', label: 'Aumentar' }, { role: 'zoomOut', label: 'Diminuir' }, { type: 'separator' }, { role: 'togglefullscreen', label: 'Tela cheia' }] },
    { label: 'Janela', role: 'window', submenu: [{ role: 'minimize', label: 'Minimizar' }, { role: 'zoom', label: 'Zoom' }, ...(mac ? [{ role: 'front', label: 'Trazer tudo para a frente' }] : [])] },
    { label: 'Ajuda', role: 'help', submenu: [{ label: 'Absolute ZRO', click: () => shell.openExternal('https://absolutezro.com') }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// só a página do app fala com o processo principal
const daPagina = (e) => {
  try {
    return new URL(e.senderFrame.url).protocol === `${ESQUEMA}:`
  } catch {
    return false
  }
}
const handle = (canal, fn) =>
  ipcMain.handle(canal, async (e, ...a) => {
    if (!daPagina(e)) throw new Error('não permitido')
    return fn(...a)
  })

const ehMidia = (abs) => Object.hasOwn(MIME_MIDIA, path.extname(abs).toLowerCase())
const nomeSeguro = (nome) => path.basename(String(nome || '')).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-') || 'arquivo'

function ipc() {
  // arquivo escolhido ou arrastado pela pessoa (o caminho vem do webUtils, no preload): só mídia
  handle('midia:permitir', async (lista) => {
    const ok = []
    for (const c of Array.isArray(lista) ? lista.slice(0, 500) : []) {
      if (typeof c !== 'string' || !path.isAbsolute(c) || !ehMidia(c)) continue
      try {
        if ((await fsp.stat(c)).isFile()) {
          permitidos.add(path.resolve(c))
          ok.push(c)
        }
      } catch {}
    }
    return ok
  })
  handle('sobedesce:abrir', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Pasta do projeto no SOBEDESCE', buttonLabel: 'Abrir este projeto', properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    const p = await lerProjeto(r.filePaths[0])
    for (const c of p.cartoes) for (const m of c.midias) permitidos.add(path.resolve(m.abs))
    return p
  })
  handle('saida:pasta', async (nome) => {
    const r = await dialog.showOpenDialog(win, { title: 'Onde gravar a linha do tempo', buttonLabel: 'Gravar aqui', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    const pasta = path.join(r.filePaths[0], nomeSeguro(nome))
    await fsp.mkdir(pasta, { recursive: true })
    pastasDeSaida.add(pasta)
    return pasta
  })
  handle('saida:gravar', async (pasta, nome, dados) => {
    if (!pastasDeSaida.has(pasta)) throw new Error('pasta não escolhida')
    const alvo = path.join(pasta, nomeSeguro(nome))
    await fsp.writeFile(alvo + '.tmp', Buffer.from(dados))
    await fsp.rename(alvo + '.tmp', alvo)
    return alvo
  })
  handle('saida:arquivo', async (nome) => {
    const r = await dialog.showSaveDialog(win, { title: 'Salvar o vídeo', defaultPath: nomeSeguro(nome), filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }] })
    if (r.canceled || !r.filePath) return null
    arquivosDeSaida.add(r.filePath)
    return r.filePath
  })
  handle('arquivo:abrir', async (caminho) => {
    if (!arquivosDeSaida.has(caminho)) throw new Error('arquivo não escolhido')
    const fh = await fsp.open(caminho, 'w')
    const id = proxId++
    abertos.set(id, fh)
    return id
  })
  handle('arquivo:escrever', async (id, pos, dados) => {
    const fh = abertos.get(id)
    if (!fh) throw new Error('arquivo fechado')
    const b = Buffer.from(dados)
    await fh.write(b, 0, b.length, Number(pos))
  })
  handle('arquivo:fechar', async (id) => {
    const fh = abertos.get(id)
    abertos.delete(id)
    await fh?.close()
  })
  handle('projeto:salvar', async (texto, nome) => {
    const r = await dialog.showSaveDialog(win, { title: 'Salvar projeto', defaultPath: nomeSeguro(nome), filters: [{ name: 'Projeto', extensions: [PRODUTO.extensao.slice(1)] }] })
    if (r.canceled || !r.filePath) return null
    await fsp.writeFile(r.filePath, String(texto))
    return path.basename(r.filePath)
  })
  handle('mostrar', (caminho) => (pastasDeSaida.has(caminho) ? shell.openPath(caminho) : null))
}

// ───────── teste de fumaça ─────────
async function smoke() {
  const linhas = []
  const log = (s) => {
    linhas.push(s)
    console.log(s)
  }
  const fim = (ok) => {
    log(ok ? 'SMOKE OK' : 'SMOKE FALHOU')
    if (SMOKE_OUT) fs.writeFileSync(SMOKE_OUT, linhas.join('\n') + '\n')
    app.exit(ok ? 0 : 1)
  }
  const relogio = setTimeout(() => {
    log('tempo esgotado (4 min)')
    fim(false)
  }, 240_000)
  try {
    await new Promise((r) => win.webContents.once('did-finish-load', r))
    log(`Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · ${process.platform}-${process.arch}`)
    const r = await rodar(`import('./autoteste.js').then((m) => m.autoteste())`)
    log(JSON.stringify(r))
    clearTimeout(relogio)
    fim(Boolean(r && r.ok && r.desktop && r.isolado))
  } catch (err) {
    clearTimeout(relogio)
    log(`erro: ${err && err.message ? err.message : err}`)
    fim(false)
  }
}

async function medir() {
  win.webContents.on('console-message', (e) => console.log(`[página] ${e.message}`))
  try {
    await new Promise((r) => win.webContents.once('did-finish-load', r))
    const abs = path.resolve(MEDIR)
    permitidos.add(abs)
    const r = await rodar(`(async () => {
      while (document.documentElement.dataset.pronto !== '1') await new Promise((r) => setTimeout(r, 50))
      const { medir } = await import('./medir.js')
      const ponte = await import('./ponte.js')
      return medir(await ponte.entradaDoCaminho(${JSON.stringify(abs)}, ${JSON.stringify(path.basename(abs))}), { modelo: ${JSON.stringify(MODELO)} })
    })()`)
    console.log('MEDIDA ' + JSON.stringify({ electron: process.versions.electron, plataforma: `${process.platform}-${process.arch}`, ...r }))
    app.exit(0)
  } catch (err) {
    console.error('MEDIDA FALHOU', err && err.message ? err.message : err)
    app.exit(1)
  }
}

app.whenReady().then(() => {
  servir()
  // nada de câmera, microfone ou localização: o app só lê os arquivos que você escolhe
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'clipboard-sanitized-write'))
  ipc()
  menu()
  criarJanela()
  if (SMOKE) smoke()
  else if (MEDIR) medir()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela()
  })
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || SMOKE || MEDIR) app.quit()
})

process.on('uncaughtException', (err) => {
  if (SMOKE) {
    console.error(err)
    app.exit(1)
  } else dialog.showErrorBox(PRODUTO.nome, String(err && err.stack ? err.stack : err))
})
