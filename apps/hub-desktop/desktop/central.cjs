// Central de apps (modelo Creative Cloud, pedido do titular em 26/10/2026): instala, abre, atualiza e remove as
// ferramentas da Absolute ZRO a partir dos apps da conta no HUB (/api/v1/desktop/meus-apps, ADR 0035). Sem Electron: o sistema
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
// - Atualização em segundo plano (agenda.cjs): `prebaixar` baixa e confere sem avisar a página; `instalar` reaproveita
//   o arquivo já conferido (confere o SHA-256 de novo antes de usar).

const path = require('node:path')
const { createHash } = require('node:crypto')

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

/**
 * O build gravado dentro do app instalado (o build-info.json no app.asar; no processo do Electron, o fs lê o .asar
 * como uma pasta). Sem arquivo ou sem build (versão de desenvolvimento): null.
 */
function lerBuildInstalado(fs, asar, p = path) {
  for (const partes of BUILD_INFO) {
    try {
      const b = Number(JSON.parse(fs.readFileSync(p.join(asar, ...partes), 'utf8')).build)
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

/** Baixa para `destino`, conferindo tamanho e SHA-256. Se não bater, apaga e falha. */
async function baixar({ url, destino, sha256, tamanho, onProgresso, signal, deps }) {
  const r = await deps.fetch(url, { redirect: 'follow', signal })
  if (!r.ok || !r.body) throw new ErroCentral('download', 'Não deu para baixar agora. Tente de novo.')
  if (r.url && !/^https:\/\//.test(r.url) && !deps.permitirHttp) throw new ErroCentral('download', 'Endereço de download recusado.')
  const total = Number(r.headers.get('content-length')) || tamanho || 0
  const parcial = destino + '.parte'
  await deps.fs.promises.mkdir(path.dirname(destino), { recursive: true })
  const arquivo = await deps.fs.promises.open(parcial, 'w')
  const hash = createHash('sha256')
  let recebido = 0
  try {
    const leitor = r.body.getReader()
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break
      hash.update(value)
      await arquivo.write(value)
      recebido += value.length
      if (onProgresso) onProgresso(recebido, total)
    }
  } finally {
    await arquivo.close()
  }
  const obtido = hash.digest('hex')
  if (obtido !== sha256 || (tamanho && recebido !== tamanho)) {
    await deps.fs.promises.rm(parcial, { force: true })
    throw new ErroCentral('conferencia', 'O arquivo baixado não confere com o original. Nada foi instalado.')
  }
  await deps.fs.promises.rename(parcial, destino)
  return destino
}

class Central {
  /**
   * deps: { hub, plataforma ('mac'|'windows'), arch, home, temp, registro (arquivo .json), fetch, fs, exec(cmd, args,
   * opts) → Promise<{ stdout }>, abrirCaminho(p), lixeira(p), avisar(evento), pastasMac? (testes) }
   */
  constructor(deps) {
    this.d = deps
    this.catalogo = null
    this.bloqueados = []
    /** true quando o HUB respondeu que não há sessão (a central pede para entrar e não atualiza nada). */
    this.semLogin = false
    this.emAndamento = new Map()
  }

  /**
   * Os apps desta conta (ADR 0035): /api/v1/desktop/meus-apps, com a sessão do HUB (cookie da partição do app). Só vem
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
        return { caminho, versao, build: lerBuildInstalado(this.d.fs, path.join(caminho, 'Contents', 'Resources', 'app.asar')) }
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
        const build = exe ? lerBuildInstalado(this.d.fs, path.win32.join(path.win32.dirname(exe), 'resources', 'app.asar'), path.win32) : null
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
    for (const app of [...this.catalogo, ...this.bloqueados]) {
      const disponivel = arquivoPara(app, this.d.plataforma, this.d.arch)
      const instalado = await this.detectar(app).catch(() => null)
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
      })
    }
    return out
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
    await baixar({
      url: `${this.d.hub}/baixar/app/${id}/${encodeURIComponent(arquivo.arquivo)}`,
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
   * Segundo plano: baixa e confere a versão nova sem instalar e sem avisar a página (a agenda instala quando a
   * ferramenta estiver fechada). Devolve { versao, build }.
   */
  async prebaixar(id) {
    if (!this.catalogo) await this.carregarCatalogo()
    const app = this.appDoPlano(id)
    const arquivo = arquivoPara(app, this.d.plataforma, this.d.arch)
    if (!arquivo) throw new ErroCentral('sistema', `O ${app.nome} ainda não tem instalador para este computador.`)
    if (this.emAndamento.has(id)) throw new ErroCentral('ocupado', 'Já estou cuidando dessa ferramenta.')
    const controle = new globalThis.AbortController()
    this.emAndamento.set(id, controle)
    try {
      await this.garantirArquivo(app, arquivo, controle, false)
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

  async instalarMac(app, dmg) {
    const ponto = await this.d.fs.promises.mkdtemp(path.join(this.d.temp, 'zro-dmg-'))
    await this.d.exec('hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', ponto])
    try {
      const origem = path.join(ponto, app.mac.bundle)
      if (!this.d.fs.existsSync(origem)) throw new ErroCentral('instalar', `O instalador do ${app.nome} não tem o app esperado.`)
      const pasta = this.pastaDeAppsMac()
      await this.d.fs.promises.mkdir(pasta, { recursive: true })
      const final = path.join(pasta, app.mac.bundle)
      const novo = path.join(pasta, `.${app.mac.bundle}.zro-novo`)
      const antigo = path.join(pasta, `.${app.mac.bundle}.zro-antigo`)
      await this.d.fs.promises.rm(novo, { recursive: true, force: true })
      // ditto preserva assinatura, links e atributos do bundle
      await this.d.exec('ditto', [origem, novo])
      if (this.d.fs.existsSync(final)) await this.d.fs.promises.rename(final, antigo)
      await this.d.fs.promises.rename(novo, final)
      await this.d.fs.promises.rm(antigo, { recursive: true, force: true })
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
}
