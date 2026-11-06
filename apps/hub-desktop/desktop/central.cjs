// Central de apps (modelo Creative Cloud, pedido do titular em 26/10/2026): instala, abre, atualiza e remove as
// ferramentas da Absolute ZRO a partir dos apps da conta no HUB (/api/v1/desktop/meus-apps, ADR 0036). Sem Electron: o sistema
// (comandos, arquivos, download) entra por `deps`, e os testes em test/central.test.mjs usam versões falsas.
//
// Regras:
// - Só instala arquivo que o catálogo traz com SHA-256, e só depois de conferir o arquivo baixado.
// - Sem senha de administrador: no Mac copia o .app para /Applications quando a conta pode escrever lá, senão para
//   ~/Applications; no Windows roda o instalador NSIS em silêncio, para o usuário atual.
// - Sem certificado (decisão do titular, por enquanto): o arquivo vem pelo próprio app (sem a marca de "baixado da
//   internet"), então o Mac e o Windows não mostram o aviso de app não identificado. A garantia é o SHA-256.
// - Atualizar ou remover com a ferramenta aberta: pede para fechar antes, nunca mata o processo. "Reiniciar e
//   atualizar" (agenda.cjs) só pede para a ferramenta sair, do jeito educado (como o ⌘Q ou o X da janela).
// - Download (baixador.cjs, ADR 0043): o espelho em São Paulo primeiro e o GitHub de reserva; pedaços em paralelo
//   quando o servidor aceita Range.
// - Atualização em segundo plano (agenda.cjs): `prebaixar` baixa e confere sem avisar a página; `instalar` reaproveita
//   o arquivo já conferido (confere o SHA-256 de novo antes de usar).

const path = require('node:path')
const { createHash } = require('node:crypto')
const { pathToFileURL, fileURLToPath } = require('node:url')
const { baixarComReserva, comOrigem } = require('./baixador.cjs')

const ID = /^[a-z0-9-]{2,40}$/
const NOME_ARQUIVO = /^[A-Za-z0-9._-]{1,120}$/
const SHA = /^[0-9a-f]{64}$/
const BUNDLE = /^[A-Za-z0-9 ._-]{1,60}\.app$/
const EXE = /^[A-Za-z0-9 ._-]{1,60}\.exe$/

class ErroCentral extends Error {
  constructor(codigo, mensagem) {
    super(mensagem)
    this.codigo = codigo
  }
}

/** Confere o catálogo vindo do HUB: descarta o que não tiver forma esperada (nada de caminho ou nome livre). */
function validarCatalogo(json) {
  const apps = Array.isArray(json && json.apps) ? json.apps : []
  const arquivoOk = (a) =>
    a && NOME_ARQUIVO.test(a.arquivo) && SHA.test(a.sha256) && /^\d+\.\d+\.\d+$/.test(a.versao) && ['universal', 'arm64', 'x64'].includes(a.arch)
  return apps
    .filter((a) => a && ID.test(a.id) && typeof a.nome === 'string' && a.nome.length < 60)
    .map((a) => ({
      id: a.id,
      nome: a.nome,
      mac: a.mac && BUNDLE.test(a.mac.bundle) && Array.isArray(a.mac.arquivos) ? { bundle: a.mac.bundle, arquivos: a.mac.arquivos.filter(arquivoOk) } : null,
      windows:
        a.windows && EXE.test(a.windows.exe) && typeof a.windows.nomeNoSistema === 'string' && arquivoOk(a.windows.arquivo)
          ? { exe: a.windows.exe, nomeNoSistema: a.windows.nomeNoSistema, arquivo: a.windows.arquivo }
          : null,
    }))
}

/**
 * Apps que o plano da conta não inclui (`bloqueados` de /api/v1/desktop/meus-apps): só nome, plano e o que a central
 * precisa para saber se estão neste computador. Nada de arquivo: bloqueado não instala nem atualiza (e nada é apagado).
 */
function validarBloqueados(json) {
  const lista = Array.isArray(json && json.bloqueados) ? json.bloqueados : []
  return lista
    .filter((a) => a && ID.test(a.id) && typeof a.nome === 'string' && a.nome.length < 60)
    .map((a) => ({
      id: a.id,
      nome: a.nome,
      plano: typeof a.plano === 'string' && a.plano.length < 80 ? a.plano : null,
      mac: a.mac && BUNDLE.test(a.mac.bundle) ? { bundle: a.mac.bundle, arquivos: [] } : null,
      windows:
        a.windows && EXE.test(a.windows.exe) && typeof a.windows.nomeNoSistema === 'string'
          ? { exe: a.windows.exe, nomeNoSistema: a.windows.nomeNoSistema, arquivo: null }
          : null,
      bloqueado: true,
    }))
}

/** O arquivo certo para este computador: no Mac, o da arquitetura (arm64/x64) ou o universal. */
function arquivoPara(app, plataforma, arch) {
  if (app.bloqueado) return null
  if (plataforma === 'windows') return app.windows ? app.windows.arquivo : null
  if (plataforma !== 'mac' || !app.mac) return null
  const lista = app.mac.arquivos
  return lista.find((a) => a.arch === arch) || lista.find((a) => a.arch === 'universal') || null
}

function compararVersao(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  return 0
}

/**
 * Tem versão nova? Versão maior, ou mesma versão com build maior que o instalado. O build instalado vem do próprio app
 * (build-info.json dentro dele, `instalado.build`); sem ele, o que a central instalou (`registro.build`). As
 * ferramentas mudam de build sem mudar de versão (0.1.0 b1034 → b1042): sem saber o build, não dá para comparar.
 */
function temAtualizacao(instalado, registro, disponivel) {
  if (!instalado || !disponivel) return false
  if (instalado.versao && compararVersao(disponivel.versao, instalado.versao) > 0) return true
  if (instalado.versao && compararVersao(disponivel.versao, instalado.versao) < 0) return false
  const atual = instalado.build != null ? instalado.build : registro && registro.build != null ? registro.build : null
  return atual != null && disponivel.build != null && disponivel.build > atual
}

// Onde cada ferramenta grava o build dentro do pacote: SOBEDESCE (scripts/build-info.mjs) e Synquei
// (scripts/release.mjs build-info).
const BUILD_INFO = [
  ['src', 'build-info.json'],
  ['desktop', 'build-info.json'],
]

const CABECALHO_MAX = 64 * 1024 * 1024

/**
 * Lê um arquivo de dentro de um .asar SEM o suporte a .asar do Electron (com o `original-fs`): abre, lê o cabeçalho e o
 * trecho do arquivo e fecha, toda vez. Formato do @electron/asar: UInt32 4 · UInt32 tamanho do cabeçalho · pickle do
 * cabeçalho (UInt32 tamanho · UInt32 tamanho do texto · JSON); o conteúdo começa em 8 + tamanho do cabeçalho.
 * Arquivo "unpacked" fica ao lado, em app.asar.unpacked. Devolve o texto ou lança.
 */
function lerDoAsar(fs, asar, partes, p = path) {
  const fd = fs.openSync(asar, 'r')
  try {
    const ler = (tamanho, posicao) => {
      const buf = Buffer.alloc(tamanho)
      if (fs.readSync(fd, buf, 0, tamanho, posicao) !== tamanho) throw new Error('asar curto')
      return buf
    }
    const topo = ler(8, 0)
    const tamanhoCabecalho = topo.readUInt32LE(4)
    if (topo.readUInt32LE(0) !== 4 || tamanhoCabecalho < 8 || tamanhoCabecalho > CABECALHO_MAX) throw new Error('asar inválido')
    const cab = ler(tamanhoCabecalho, 8)
    const texto = cab.readUInt32LE(4)
    if (8 + texto > tamanhoCabecalho) throw new Error('asar inválido')
    let no = JSON.parse(cab.toString('utf8', 8, 8 + texto))
    for (const parte of partes) no = no && no.files && Object.prototype.hasOwnProperty.call(no.files, parte) ? no.files[parte] : null
    if (!no || no.files || !Number.isInteger(no.size) || no.size < 0 || no.size > 1024 * 1024) throw new Error('fora do asar')
    if (no.unpacked) return fs.readFileSync(p.join(asar + '.unpacked', ...partes), 'utf8')
    const offset = Number(no.offset)
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('asar inválido')
    return ler(no.size, 8 + tamanhoCabecalho + offset).toString('utf8')
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * O build gravado dentro do app instalado (o build-info.json no app.asar). Sem arquivo ou sem build (versão de
 * desenvolvimento): null.
 *
 * `fs` tem de ser o SEM suporte a .asar (o `original-fs` no Electron). O `fs` comum do Electron guarda cada .asar
 * aberto num cache por caminho, para sempre: depois que a central troca o pacote (ou o app se atualiza), ele continua
 * lendo o app.asar antigo (o arquivo apagado segue aberto) e o cartão oferecia "Atualizar" para o build que acabou de
 * ser instalado, até a central reiniciar (1.4.5; conferido no Electron 44.5.1). Aqui o arquivo é aberto e fechado a cada
 * leitura. Pasta no lugar do .asar (app em desenvolvimento, testes): lê o arquivo dentro dela.
 */
function lerBuildInstalado(fs, asar, p = path) {
  let pasta = false
  try {
    pasta = fs.statSync(asar).isDirectory()
  } catch {
    return null
  }
  for (const partes of BUILD_INFO) {
    try {
      const texto = pasta ? fs.readFileSync(p.join(asar, ...partes), 'utf8') : lerDoAsar(fs, asar, partes, p)
      const b = Number(JSON.parse(texto).build)
      if (Number.isInteger(b) && b > 0) return b
    } catch {
      // tenta o próximo
    }
  }
  return null
}

/**
 * Saída do `reg query … /s /f <nome>` → entradas de desinstalação (DisplayName, DisplayVersion, InstallLocation,
 * DisplayIcon, UninstallString). O electron-builder grava DisplayName como "<Produto> <versão>".
 */
function lerRegistro(saida, nome) {
  const blocos = String(saida || '').split(/\r?\n(?=HKEY_)/)
  const out = []
  for (const bloco of blocos) {
    const v = {}
    for (const linha of bloco.split(/\r?\n/)) {
      const m = /^\s{2,}(\S+)\s+REG_(?:SZ|EXPAND_SZ)\s+(.*)$/.exec(linha)
      if (m) v[m[1]] = m[2].trim()
    }
    const dn = v.DisplayName || ''
    if (dn === nome || dn.startsWith(nome + ' ')) out.push(v)
  }
  return out
}

/** "C:\…\Uninstall X.exe" /currentuser → C:\…\Uninstall X.exe */
function caminhoDoComando(cmd) {
  const s = String(cmd || '').trim()
  if (s.startsWith('"')) return s.slice(1, s.indexOf('"', 1))
  const m = /^(.+?\.exe)\b/i.exec(s)
  return m ? m[1] : null
}

// ───── "Manter no Dock" (Mac) e "Criar atalho" (Windows): opcional, só com o toque da pessoa ─────

/** Como o Dock guarda o endereço do app ("_CFURLString"): file:///Applications/Carro%20do%20Freela.app/ */
function urlDoDock(caminho) {
  return pathToFileURL(caminho).href.replace(/\/?$/, '/')
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** O item que `defaults write com.apple.dock persistent-apps -array-add` acrescenta (um app no Dock). */
function itemDoDock(caminho) {
  return (
    '<dict><key>tile-data</key><dict><key>file-data</key><dict>' +
    `<key>_CFURLString</key><string>${xml(urlDoDock(caminho))}</string><key>_CFURLStringType</key><integer>15</integer>` +
    '</dict></dict><key>tile-type</key><string>file-tile</string></dict>'
  )
}

/** Endereço do Dock (file://…) ou caminho solto → caminho decodificado, sem barra final. null se não for um arquivo local. */
function caminhoDoDock(valor) {
  let v = String(valor || '').trim()
  if (!v) return null
  if (/^file:/i.test(v)) {
    try {
      v = fileURLToPath(v)
    } catch {
      return null
    }
  }
  if (!path.isAbsolute(v)) return null
  v = path.normalize(v)
  return v.length > 1 ? v.replace(/[\\/]+$/, '') || '/' : v
}

/** Os caminhos de todos os itens da saída de `defaults read com.apple.dock persistent-apps` (decodificados). */
function caminhosDoDock(saida) {
  const out = []
  const re = /"?_CFURLString"?\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;\s]+))\s*;/g
  let m
  while ((m = re.exec(String(saida || '')))) {
    const c = caminhoDoDock((m[1] ?? m[2]).replace(/\\(.)/g, '$1'))
    if (c) out.push(c)
  }
  return out
}

/**
 * O app já está no Dock? `saida` = `defaults read com.apple.dock persistent-apps`. Compara o caminho exato, decodificado
 * e normalizado (nunca por pedaço de texto): um item antigo com o mesmo nome em outro lugar não conta.
 * `insensivel`: o disco ignora maiúsculas (o padrão do Mac).
 */
function estaNoDock(saida, caminho, insensivel = false) {
  const alvo = caminhoDoDock(caminho)
  if (!alvo) return false
  const f = (c) => (insensivel ? c.toLowerCase() : c)
  return caminhosDoDock(saida).some((c) => f(c) === f(alvo))
}

/**
 * Baixa para `destino`, conferindo tamanho e SHA-256. `urls`: os endereços em ordem (o espelho primeiro, o GitHub de
 * reserva; ADR 0043); arquivo que não confere num endereço tenta o próximo. Se nenhum bater, apaga e falha.
 */
async function baixar({ url, urls, destino, sha256, tamanho, onProgresso, signal, deps }) {
  const lista = Array.isArray(urls) && urls.length ? urls : [url]
  const parcial = destino + '.parte'
  await deps.fs.promises.mkdir(path.dirname(destino), { recursive: true })
  let r
  try {
    r = await baixarComReserva(lista, parcial, {
      // no app, `fetchDeDownload` (download.cjs) confere cada redirecionamento; o fetch comum fica para os testes
      abrir: deps.fetchDeDownload || deps.fetch,
      // os pedaços do download paralelo: direto ao endereço final, IPv4 primeiro (download.cjs)
      direto: deps.fetchDireto || null,
      fs: deps.fs,
      tamanho,
      sha256,
      signal,
      aoProgresso: onProgresso,
      permitirHttp: deps.permitirHttp,
      log: deps.log,
      ...(deps.download || {}),
    })
  } catch (e) {
    // cancelado, rede caiu, grande demais ou recusado: o pedaço baixado não fica para trás
    await deps.fs.promises.rm(parcial, { force: true }).catch(() => {})
    if (e instanceof ErroCentral) throw e
    if (e && e.conferencia) throw new ErroCentral('conferencia', 'O arquivo baixado não confere com o original. Nada foi instalado.')
    if (e && e.recusado) throw new ErroCentral('download', e.message)
    throw new ErroCentral('download', (signal && signal.aborted) || (e && e.cancelado) ? 'Download cancelado.' : 'Não deu para baixar agora. Tente de novo.')
  }
  if (!r.confere || (tamanho && r.tamanho !== tamanho)) {
    await deps.fs.promises.rm(parcial, { force: true })
    throw new ErroCentral('conferencia', 'O arquivo baixado não confere com o original. Nada foi instalado.')
  }
  await deps.fs.promises.rename(parcial, destino)
  return destino
}

class Central {
  /**
   * deps: { hub, plataforma ('mac'|'windows'), arch, home, temp, registro (arquivo .json), fetch, fs, fsApps? (fs sem
   * a leitura de .asar, para apagar e trocar pacotes .app: o `original-fs` no Electron), log?, criarAtalho?(lnk,
   * opções) e pastasAtalho? ({ areaDeTrabalho, menuIniciar }, Windows), exec(cmd, args,
   * opts) → Promise<{ stdout }>, abrirCaminho(p), lixeira(p), avisar(evento), pastasMac? (testes) }
   */
  constructor(deps) {
    this.d = deps
    this.catalogo = null
    this.bloqueados = []
    /** true quando o HUB respondeu que não há sessão (a central pede para entrar e não atualiza nada). */
    this.semLogin = false
    this.emAndamento = new Map()
    /** Fila única do Dock (um app por vez) e o reinício agrupado do Dock. */
    this.filaDock = Promise.resolve()
    this.timerDock = null
  }

  /**
   * Os apps desta conta (ADR 0036): /api/v1/desktop/meus-apps, com a sessão do HUB (cookie da partição do app). Só vem
   * o que a conta pode instalar, com versão e SHA-256, e o que o plano não inclui (bloqueados). Sem sessão (401):
   * catálogo vazio e `semLogin`. HUB antigo, sem a rota (404): o catálogo público de antes.
   */
  async carregarCatalogo() {
    let r = await this.d.fetch(this.d.hub + '/api/v1/desktop/meus-apps', { signal: AbortSignal.timeout(15_000) })
    if (r.status === 401) {
      this.semLogin = true
      this.catalogo = []
      this.bloqueados = []
      throw new ErroCentral('login', 'Entre na sua conta Absolute ZRO para ver seus apps.')
    }
    if (r.status === 404) r = await this.d.fetch(this.d.hub + '/api/v1/desktop/apps', { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) throw new ErroCentral('catalogo', 'O catálogo de apps não respondeu. Tente de novo.')
    const json = await r.json()
    this.semLogin = false
    this.catalogo = validarCatalogo(json)
    this.bloqueados = validarBloqueados(json).filter((b) => !this.catalogo.some((a) => a.id === b.id))
    return this.catalogo
  }

  /** O app (do plano ou bloqueado) para detectar, abrir, fechar e remover. */
  app(id) {
    const a = (this.catalogo && this.catalogo.find((x) => x.id === id)) || this.bloqueados.find((x) => x.id === id)
    if (!a) throw new ErroCentral('app', 'Ferramenta não encontrada no catálogo.')
    return a
  }

  /** O app que a conta pode instalar ou atualizar agora (bloqueado pelo plano não passa). */
  appDoPlano(id) {
    const a = this.app(id)
    if (a.bloqueado) throw new ErroCentral('plano', `O ${a.nome} não está no seu plano. Veja os planos em absolutezro.com/planos.`)
    return a
  }

  lerRegistros() {
    try {
      return JSON.parse(this.d.fs.readFileSync(this.d.registro, 'utf8')) || {}
    } catch {
      return {}
    }
  }

  gravarRegistro(id, valor) {
    const todos = this.lerRegistros()
    if (valor) todos[id] = valor
    else delete todos[id]
    this.d.fs.mkdirSync(path.dirname(this.d.registro), { recursive: true })
    this.d.fs.writeFileSync(this.d.registro, JSON.stringify(todos, null, 2))
  }

  /** Pasta de apps do Mac onde a conta pode escrever sem pedir senha. */
  pastasMac() {
    return this.d.pastasMac || ['/Applications', path.join(this.d.home, 'Applications')]
  }

  pastaDeAppsMac() {
    const [sistema, usuario] = this.pastasMac()
    try {
      this.d.fs.accessSync(sistema, this.d.fs.constants.W_OK)
      return sistema
    } catch {
      return usuario
    }
  }

  /** Onde a ferramenta está instalada (ou null) e com que versão. */
  async detectar(app) {
    if (this.d.plataforma === 'mac' && app.mac) {
      for (const pasta of this.pastasMac()) {
        const caminho = path.join(pasta, app.mac.bundle)
        const plist = path.join(caminho, 'Contents', 'Info.plist')
        if (!this.d.fs.existsSync(plist)) continue
        let versao = null
        try {
          versao = (await this.d.exec('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', plist])).stdout.trim() || null
        } catch {
          versao = null
        }
        return { caminho, versao, build: lerBuildInstalado(this.fsApps(), path.join(caminho, 'Contents', 'Resources', 'app.asar')) }
      }
      return null
    }
    if (this.d.plataforma === 'windows' && app.windows) {
      for (const raiz of ['HKCU', 'HKLM']) {
        let saida = ''
        try {
          saida = (
            await this.d.exec('reg', ['query', `${raiz}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall`, '/s', '/f', app.windows.nomeNoSistema, '/d'])
          ).stdout
        } catch {
          continue
        }
        const e = lerRegistro(saida, app.windows.nomeNoSistema)[0]
        if (!e) continue
        const icone = e.DisplayIcon ? e.DisplayIcon.replace(/,\d+$/, '').replace(/^"|"$/g, '') : null
        const exe = e.InstallLocation ? path.win32.join(e.InstallLocation, app.windows.exe) : icone
        const build = exe ? lerBuildInstalado(this.fsApps(), path.win32.join(path.win32.dirname(exe), 'resources', 'app.asar'), path.win32) : null
        return { caminho: exe, versao: e.DisplayVersion || null, build, desinstalador: caminhoDoComando(e.UninstallString), escopo: raiz }
      }
    }
    return null
  }

  async emUso(app, instalado) {
    try {
      if (this.d.plataforma === 'mac') {
        await this.d.exec('pgrep', ['-f', path.join(instalado.caminho, 'Contents', 'MacOS') + '/'])
        return true // pgrep sai com 0 quando acha
      }
      const r = await this.d.exec('tasklist', ['/FI', `IMAGENAME eq ${app.windows.exe}`, '/NH', '/FO', 'CSV'])
      return r.stdout.toLowerCase().includes(`"${app.windows.exe.toLowerCase()}"`)
    } catch {
      return false
    }
  }

  /**
   * A central pode atualizar sozinha esta instalação? Mac: o app está numa pasta em que a conta escreve (fora do disco
   * de instalação e da "translocação" do macOS). Windows: instalado para o usuário atual (HKCU); o NSIS com
   * /currentuser não troca uma instalação feita para todos os usuários.
   */
  gerenciavel(instalado) {
    if (!instalado || !instalado.caminho) return false
    if (this.d.plataforma === 'windows') return instalado.escopo === 'HKCU'
    if (this.d.plataforma !== 'mac') return false
    const c = instalado.caminho
    if (c.startsWith('/Volumes/') || c.includes('/AppTranslocation/')) return false
    try {
      this.d.fs.accessSync(path.dirname(c), this.d.fs.constants.W_OK)
      return true
    } catch {
      return false
    }
  }

  /** A ferramenta está aberta agora? (false se não está instalada) */
  async aberto(id) {
    if (!this.catalogo) await this.carregarCatalogo()
    const app = this.app(id)
    const instalado = await this.detectar(app).catch(() => null)
    return !!instalado && (await this.emUso(app, instalado))
  }

  /**
   * Pede para a ferramenta sair, do jeito educado: Mac, "quit app" (como o ⌘Q: o app pode perguntar antes de fechar);
   * Windows, taskkill sem /F (manda fechar a janela). Nunca força.
   */
  async fechar(id) {
    if (!this.catalogo) await this.carregarCatalogo()
    const app = this.app(id)
    if (this.d.plataforma === 'mac' && app.mac) {
      // o nome passou pelo BUNDLE (só letras, números, espaço, ponto, _ e -): não fecha aspas no AppleScript
      await this.d.exec('osascript', ['-e', `quit app "${app.mac.bundle.slice(0, -4)}"`], { timeout: 30_000 }).catch(() => {})
    } else if (this.d.plataforma === 'windows' && app.windows) {
      await this.d.exec('taskkill', ['/IM', app.windows.exe], { timeout: 30_000, windowsHide: true }).catch(() => {})
    }
    return true
  }

  /** Situação de cada ferramenta neste computador. */
  async listar() {
    if (!this.catalogo) await this.carregarCatalogo()
    const registros = this.lerRegistros()
    const out = []
    let dock = null
    for (const app of [...this.catalogo, ...this.bloqueados]) {
      const disponivel = arquivoPara(app, this.d.plataforma, this.d.arch)
      const instalado = await this.detectar(app).catch(() => null)
      if (instalado && this.d.plataforma === 'mac' && dock === null) dock = await this.lerDock()
      out.push({
        id: app.id,
        nome: app.nome,
        disponivel: disponivel ? { versao: disponivel.versao, build: disponivel.build, tamanho: disponivel.tamanho } : null,
        instalado: instalado ? { versao: instalado.versao, build: instalado.build ?? null } : null,
        atualizar: temAtualizacao(instalado, registros[app.id], disponivel),
        gerenciavel: this.gerenciavel(instalado),
        ocupado: this.emAndamento.has(app.id),
        // fora do plano: a central mostra bloqueado e não atualiza; o que está no computador fica
        bloqueado: app.bloqueado ? { plano: app.plano } : null,
        // "Manter no Dock" (Mac) ou "Criar atalho" (Windows): { tipo, feito } com o app instalado; null sem suporte
        atalho: instalado ? this.situacaoDoAtalho(app, instalado, dock) : null,
      })
    }
    return out
  }

  /** 'dock' no Mac; 'atalho' no Windows (fixar na barra de tarefas não tem API pública: só atalho). */
  tipoDeAtalho() {
    if (this.d.plataforma === 'mac') return 'dock'
    if (this.d.plataforma === 'windows' && this.d.criarAtalho && this.d.pastasAtalho) return 'atalho'
    return null
  }

  async lerDock() {
    try {
      return (await this.d.exec('defaults', ['read', 'com.apple.dock', 'persistent-apps'], { timeout: 15_000 })).stdout || ''
    } catch {
      return ''
    }
  }

  /** Onde fica o atalho do app no Windows: Área de Trabalho e Menu Iniciar (pastas do usuário). */
  lugaresDoAtalho(app) {
    const { areaDeTrabalho, menuIniciar } = this.d.pastasAtalho || {}
    const nome = `${app.windows.nomeNoSistema}.lnk`
    return {
      areaDeTrabalho: areaDeTrabalho ? path.join(areaDeTrabalho, nome) : null,
      menuIniciar: menuIniciar ? path.join(menuIniciar, nome) : null,
    }
  }

  situacaoDoAtalho(app, instalado, dock) {
    const tipo = this.tipoDeAtalho()
    if (!tipo || !instalado || !instalado.caminho) return null
    if (tipo === 'dock') return { tipo, feito: estaNoDock(dock, instalado.caminho, this.dockInsensivel(instalado.caminho)) }
    if (!app.windows) return null
    const { areaDeTrabalho } = this.lugaresDoAtalho(app)
    return { tipo, feito: !!areaDeTrabalho && this.d.fs.existsSync(areaDeTrabalho) }
  }

  /** O disco ignora maiúsculas? (padrão do Mac): confere trocando a caixa do caminho do próprio app. */
  dockInsensivel(caminho) {
    try {
      const base = path.basename(caminho)
      const outra = path.join(path.dirname(caminho), base === base.toUpperCase() ? base.toLowerCase() : base.toUpperCase())
      return outra !== caminho && this.d.fs.existsSync(outra)
    } catch {
      return false
    }
  }

  esperar(ms) {
    return this.d.esperar ? this.d.esperar(ms) : new Promise((r) => setTimeout(r, ms))
  }

  /**
   * Põe o app no Dock e só diz que deu certo depois de reler o Dock e ver o caminho exato. Se a gravação sumir (o
   * cfprefsd ou o próprio Dock regravam a lista), tenta de novo, até 3 vezes. Reinício do Dock: uma vez, agrupado.
   */
  async porNoDock(app, instalado) {
    const insensivel = this.dockInsensivel(instalado.caminho)
    const confere = async () => estaNoDock(await this.lerDock(), instalado.caminho, insensivel)
    const TENTATIVAS = 3
    for (let i = 0; i <= TENTATIVAS; i++) {
      if (await confere()) {
        if (i > 0) this.agendarReinicioDoDock()
        return { tipo: 'dock', feito: true }
      }
      if (i === TENTATIVAS) break
      try {
        await this.d.exec('defaults', ['write', 'com.apple.dock', 'persistent-apps', '-array-add', itemDoDock(instalado.caminho)], { timeout: 15_000 })
      } catch (e) {
        this.log('[central] Dock:', e && e.message)
      }
      await this.esperar(this.d.dockEsperaMs ?? 400)
    }
    this.log('[central] Dock: o item não apareceu depois de', TENTATIVAS, 'gravações:', instalado.caminho)
    throw new ErroCentral('atalho', `Não deu para pôr o ${app.nome} no Dock.`)
  }

  /** O Dock só relê as preferências ao reiniciar: um `killall Dock` só, ~1,5 s depois da última gravação confirmada. */
  agendarReinicioDoDock() {
    if (this.timerDock) clearTimeout(this.timerDock)
    this.timerDock = setTimeout(() => this.reiniciarDock(), this.d.dockReinicioMs ?? 1500)
  }

  async reiniciarDock() {
    if (this.timerDock) clearTimeout(this.timerDock)
    this.timerDock = null
    await this.d.exec('killall', ['Dock'], { timeout: 15_000 }).catch(() => {})
  }

  /**
   * "Manter no Dock" (Mac): acrescenta o app às preferências do Dock e reinicia o Dock (como arrastar o ícone para lá).
   * "Criar atalho" (Windows): atalho na Área de Trabalho e, se o instalador não criou, no Menu Iniciar. Só com o toque
   * da pessoa; já feito, não repete. Devolve { tipo, feito: true }.
   */
  async criarAtalho(id) {
    if (!this.catalogo) await this.carregarCatalogo()
    const app = this.app(id)
    const tipo = this.tipoDeAtalho()
    if (!tipo) throw new ErroCentral('atalho', 'Atalho indisponível neste computador.')
    const instalado = await this.detectar(app).catch(() => null)
    if (!instalado || !instalado.caminho) throw new ErroCentral('ausente', `O ${app.nome} não está instalado.`)
    if (tipo === 'dock') {
      // um app por vez: o `defaults write -array-add` lê, acrescenta e grava a lista inteira (duas ao mesmo tempo se pisam)
      const vez = this.filaDock.then(() => this.porNoDock(app, instalado))
      this.filaDock = vez.catch(() => {})
      return vez
    }
    const lugares = this.lugaresDoAtalho(app)
    const opcoes = { target: instalado.caminho, description: app.nome, icon: instalado.caminho, iconIndex: 0 }
    let algum = false
    for (const lnk of [lugares.areaDeTrabalho, lugares.menuIniciar]) {
      if (!lnk) continue
      if (this.d.fs.existsSync(lnk)) {
        algum = true
        continue
      }
      if (this.d.criarAtalho(lnk, opcoes)) algum = true
      else this.log('[central] atalho não criado:', lnk)
    }
    if (!algum) throw new ErroCentral('atalho', `Não deu para criar o atalho do ${app.nome}.`)
    return { tipo, feito: true }
  }

  avisar(id, fase, extra = {}) {
    if (this.d.avisar) this.d.avisar({ id, fase, ...extra })
  }

  /** O arquivo já baixado ainda confere com o catálogo? (tamanho e SHA-256 lidos de novo do disco) */
  async jaConferido(destino, arquivo) {
    const fsx = this.d.fs
    try {
      const st = await fsx.promises.stat(destino)
      if (arquivo.tamanho && st.size !== arquivo.tamanho) return false
      const hash = createHash('sha256')
      await new Promise((ok, falha) => {
        const s = fsx.createReadStream(destino)
        s.on('data', (p) => hash.update(p))
        s.on('end', ok)
        s.on('error', falha)
      })
      return hash.digest('hex') === arquivo.sha256
    } catch {
      return false
    }
  }

  /** Baixa (ou reaproveita) o instalador conferido. `progresso`: avisa a página (false no segundo plano). */
  async garantirArquivo(app, arquivo, controle, progresso) {
    const id = app.id
    const pasta = path.join(this.d.temp, 'absolute-zro-central', id)
    const destino = path.join(pasta, arquivo.arquivo)
    if (await this.jaConferido(destino, arquivo)) return destino
    // versões antigas baixadas antes ficam para trás: só o arquivo atual fica na pasta
    await this.d.fs.promises.rm(pasta, { recursive: true, force: true }).catch(() => {})
    if (progresso) this.avisar(id, 'baixando', { recebido: 0, total: arquivo.tamanho })
    let ultimo = 0
    const url = `${this.d.hub}/baixar/app/${id}/${encodeURIComponent(arquivo.arquivo)}`
    await baixar({
      // o espelho em São Paulo primeiro (o HUB só manda para lá quando o arquivo está nele); o GitHub de reserva
      urls: [comOrigem(url, 'espelho'), url],
      destino,
      sha256: arquivo.sha256,
      tamanho: arquivo.tamanho,
      signal: controle.signal,
      deps: this.d,
      onProgresso: progresso
        ? (recebido, total) => {
            const agora = Date.now()
            if (agora - ultimo > 250 || recebido === total) {
              ultimo = agora
              this.avisar(id, 'baixando', { recebido, total })
            }
          }
        : null,
    })
    return destino
  }

  /**
   * Segundo plano: baixa e confere a versão nova sem instalar (a agenda instala quando a ferramenta estiver fechada).
   * `progresso`: a pessoa pediu (Atualizar com o app aberto): a página mostra o download, como no instalar.
   * Devolve { versao, build }.
   */
  async prebaixar(id, { progresso = false } = {}) {
    if (!this.catalogo) await this.carregarCatalogo()
    const app = this.appDoPlano(id)
    const arquivo = arquivoPara(app, this.d.plataforma, this.d.arch)
    if (!arquivo) throw new ErroCentral('sistema', `O ${app.nome} ainda não tem instalador para este computador.`)
    if (this.emAndamento.has(id)) throw new ErroCentral('ocupado', 'Já estou cuidando dessa ferramenta.')
    const controle = new globalThis.AbortController()
    this.emAndamento.set(id, controle)
    try {
      await this.garantirArquivo(app, arquivo, controle, progresso)
      return { versao: arquivo.versao, build: arquivo.build }
    } catch (e) {
      if (e instanceof ErroCentral) throw e
      throw new ErroCentral('download', controle.signal.aborted ? 'Download cancelado.' : 'Não deu para baixar agora. Tente de novo.')
    } finally {
      this.emAndamento.delete(id)
    }
  }

  /** Instala ou atualiza. Uma operação por ferramenta de cada vez. */
  async instalar(id) {
    if (!this.catalogo) await this.carregarCatalogo()
    const app = this.appDoPlano(id)
    const arquivo = arquivoPara(app, this.d.plataforma, this.d.arch)
    if (!arquivo) throw new ErroCentral('sistema', `O ${app.nome} ainda não tem instalador para este computador.`)
    if (this.emAndamento.has(id)) throw new ErroCentral('ocupado', 'Já estou cuidando dessa ferramenta.')
    const controle = new globalThis.AbortController()
    this.emAndamento.set(id, controle)
    try {
      const antes = await this.detectar(app).catch(() => null)
      if (antes && (await this.emUso(app, antes))) throw new ErroCentral('aberto', `Feche o ${app.nome} para atualizar.`)
      const destino = await this.garantirArquivo(app, arquivo, controle, true)
      this.avisar(id, 'instalando')
      if (this.d.plataforma === 'mac') await this.instalarMac(app, destino)
      else await this.instalarWindows(destino)
      await this.d.fs.promises.rm(destino, { force: true })
      this.gravarRegistro(id, { arquivo: arquivo.arquivo, versao: arquivo.versao, build: arquivo.build, sha256: arquivo.sha256, em: new Date().toISOString() })
      this.avisar(id, 'pronto')
      return true
    } catch (e) {
      if (!(e instanceof ErroCentral)) this.log(`[central] ${id}: não instalou:`, e && (e.code || ''), e && e.message)
      const msg = controle.signal.aborted ? 'Download cancelado.' : e instanceof ErroCentral ? e.message : 'Não deu para instalar. Tente de novo.'
      this.avisar(id, 'erro', { mensagem: msg })
      throw e instanceof ErroCentral ? e : new ErroCentral('instalar', msg)
    } finally {
      this.emAndamento.delete(id)
    }
  }

  cancelar(id) {
    const c = this.emAndamento.get(id)
    if (c) c.abort()
    return !!c
  }

  /**
   * fs para mexer em pacotes .app inteiros (apagar, renomear). No Electron, o `fs` comum lê o app.asar como uma pasta:
   * o `rm` recursivo de um .app entra no app.asar, não consegue apagar o que "está dentro" e falha com ENOTEMPTY (ou o
   * pacote fica pela metade). Por isso o main.cjs passa o `original-fs` aqui. Nos testes, o fs do Node.
   */
  fsApps() {
    return this.d.fsApps || this.d.fs
  }

  log(...a) {
    if (this.d.log) this.d.log(...a)
  }

  async instalarMac(app, dmg) {
    const fsa = this.fsApps()
    const ponto = await this.d.fs.promises.mkdtemp(path.join(this.d.temp, 'zro-dmg-'))
    await this.d.exec('hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', ponto])
    try {
      const origem = path.join(ponto, app.mac.bundle)
      if (!this.d.fs.existsSync(origem)) throw new ErroCentral('instalar', `O instalador do ${app.nome} não tem o app esperado.`)
      const pasta = this.pastaDeAppsMac()
      await fsa.promises.mkdir(pasta, { recursive: true })
      const final = path.join(pasta, app.mac.bundle)
      const novo = path.join(pasta, `.${app.mac.bundle}.zro-novo`)
      const antigo = path.join(pasta, `.${app.mac.bundle}.zro-antigo`)
      // sobras de uma tentativa que parou no meio (antes da 1.4.1, o .zro-antigo ficava e travava a próxima troca)
      await fsa.promises.rm(novo, { recursive: true, force: true })
      await fsa.promises.rm(antigo, { recursive: true, force: true })
      // ditto preserva assinatura, links e atributos do bundle
      await this.d.exec('ditto', [origem, novo])
      const tinha = fsa.existsSync(final)
      if (tinha) await fsa.promises.rename(final, antigo)
      try {
        await fsa.promises.rename(novo, final)
      } catch (e) {
        // não deu para pôr o novo no lugar: o antigo volta, nada se perde
        if (tinha) await fsa.promises.rename(antigo, final).catch(() => {})
        await fsa.promises.rm(novo, { recursive: true, force: true }).catch(() => {})
        throw e
      }
      // o app novo já está no lugar: apagar o antigo é limpeza (se falhar, a próxima instalação apaga)
      await fsa.promises.rm(antigo, { recursive: true, force: true }).catch((e) => this.log('[central] não apaguei o app antigo:', e && e.message))
      await this.d.exec('xattr', ['-dr', 'com.apple.quarantine', final]).catch(() => {})
    } finally {
      await this.d.exec('hdiutil', ['detach', ponto, '-force']).catch(() => {})
      await this.d.fs.promises.rm(ponto, { recursive: true, force: true }).catch(() => {})
    }
  }

  async instalarWindows(exe) {
    // NSIS do electron-builder: /S silencioso, /currentuser sem pedir administrador.
    await this.d.exec(exe, ['/S', '/currentuser'], { timeout: 15 * 60_000, windowsHide: true })
  }

  async abrir(id) {
    if (!this.catalogo) await this.carregarCatalogo()
    const app = this.app(id)
    const instalado = await this.detectar(app)
    if (!instalado || !instalado.caminho) throw new ErroCentral('ausente', `O ${app.nome} não está instalado.`)
    const erro = await this.d.abrirCaminho(instalado.caminho)
    if (erro) throw new ErroCentral('abrir', `Não deu para abrir o ${app.nome}.`)
    return true
  }

  async remover(id) {
    if (!this.catalogo) await this.carregarCatalogo()
    const app = this.app(id)
    const instalado = await this.detectar(app)
    if (!instalado) return true
    if (await this.emUso(app, instalado)) throw new ErroCentral('aberto', `Feche o ${app.nome} para remover.`)
    this.avisar(id, 'removendo')
    if (this.d.plataforma === 'mac') await this.d.lixeira(instalado.caminho)
    else if (instalado.desinstalador) await this.d.exec(instalado.desinstalador, ['/S', '/currentuser'], { timeout: 10 * 60_000, windowsHide: true })
    else throw new ErroCentral('remover', `Remova o ${app.nome} pelas Configurações do Windows.`)
    this.gravarRegistro(id, null)
    this.avisar(id, 'removido')
    return true
  }
}

module.exports = {
  Central,
  ErroCentral,
  validarCatalogo,
  validarBloqueados,
  arquivoPara,
  temAtualizacao,
  lerBuildInstalado,
  compararVersao,
  lerRegistro,
  caminhoDoComando,
  baixar,
  urlDoDock,
  caminhoDoDock,
  caminhosDoDock,
  itemDoDock,
  estaNoDock,
}
