// "Atualizar" pelo próprio app (Mac e Windows, só no app empacotado), no molde do SOBEDESCE (products/sobedesce/src/
// updater.js). Sem assinatura da Apple/Microsoft (custo zero), o que trava a instalação é a marca de "veio da internet"
// que o navegador põe no arquivo; o que o próprio app baixa não ganha essa marca. Então:
//
//   1. confere o versao.json do Release (o mesmo que o instalar.sh e o instalar.ps1 leem): ao abrir (~10 s depois) e a
//      cada 4 h. Build maior que o deste app (desktop/build-info.json, gravado no CI) = versão nova, e a tela mostra o
//      aviso com "Atualizar". Build 0 (desenvolvimento, `npm run desktop`) não pergunta nada;
//   2. "Atualizar": baixa o instalador do Release, com progresso medido (bytes recebidos / content-length);
//   3. confere o SHA-256 com o do versao.json (sem hash ou hash diferente = não troca nada);
//   4. prepara a troca:
//        Mac: monta o .dmg (hdiutil), copia o app novo para o lado do atual (ditto), desmonta e tira a quarentena
//        (xattr -cr);
//        Windows: o próprio instalador NSIS, em silêncio (/S);
//   5. grava um script pequeno e entrega ao processo principal (desktop/main.cjs), que o roda solto e fecha o app.
//      O script espera o app fechar, troca (Mac: o antigo sai, o novo entra; se falhar, o antigo volta) ou roda o
//      instalador (Windows) e abre o app de novo. Se a troca falhar, o script deixa atualizacao-falhou.json na pasta de
//      dados: na próxima abertura o aviso diz o que houve e oferece o Baixar (a página de instalação no site).
//
// Tudo que toca o sistema (rede, comandos, permissão, entrega do script, relógio) é injetável: test/atualizador.test.js
// troca por peças falsas.

'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { execFile } = require('node:child_process')
const { PRODUTO } = require('../src/produto.js')

/** O Release do app (o mesmo endereço do instalar.sh e do instalar.ps1). */
const RELEASE_URL = `https://github.com/${PRODUTO.repositorio}/releases/download/${PRODUTO.release}`
/** Onde a pessoa baixa à mão quando o app não consegue se trocar sozinho. */
const BAIXAR_URL = `${PRODUTO.site}/#baixar`
const MARCA = 'atualizacao-falhou.json'
const PREFIXO = `${PRODUTO.esquema}-atualizacao-`
const PRIMEIRA_MS = 10_000
const A_CADA_MS = 4 * 60 * 60_000
const ESPERA_MS = 15_000
const PARADO_MS = 60_000
const PROGRESSO_MS = 200
const MAX_BYTES = 2 * 1024 ** 3
const SHA256 = /^[0-9a-f]{64}$/
const PLATAFORMAS = { darwin: 'mac', win32: 'windows' }

function limparInfo(raw) {
  const build = Number(raw?.build)
  if (!Number.isSafeInteger(build) || build < 0) return null
  const commit = typeof raw?.commit === 'string' && /^[0-9a-f]{4,40}$/i.test(raw.commit) ? raw.commit.slice(0, 12).toLowerCase() : ''
  const ms = typeof raw?.data === 'string' ? Date.parse(raw.data) : NaN
  return { build, commit, data: Number.isFinite(ms) ? new Date(ms).toISOString() : null }
}

/** O build deste app (desktop/build-info.json). Sem arquivo ou estragado = desenvolvimento (build 0). */
function lerBuildInfo(arquivo = path.join(__dirname, 'build-info.json')) {
  try {
    return limparInfo(JSON.parse(fs.readFileSync(arquivo, 'utf8'))) || { build: 0, commit: '', data: null }
  } catch {
    return { build: 0, commit: '', data: null }
  }
}

const hex64 = (v) => (typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v) ? v.toLowerCase() : null)
const nomeArquivo = (v, ext) => (typeof v === 'string' && /^[A-Za-z0-9._-]+$/.test(v) && v.endsWith(ext) ? v : null)

/** versao.json do Release → { build, commit, data, arquivo: { mac, windows }, sha256: { mac, windows } } ou null. */
function lerVersao(corpo) {
  const info = limparInfo(corpo)
  if (!info || info.build <= 0) return null
  return {
    ...info,
    arquivo: { mac: nomeArquivo(corpo.mac, '.dmg'), windows: nomeArquivo(corpo.windows, '.exe') },
    sha256: { mac: hex64(corpo.sha256Mac), windows: hex64(corpo.sha256Windows) },
  }
}

/** Texto entre aspas simples para sh: 'a'\''b'. */
const shAspas = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`
/** Texto entre aspas simples para PowerShell: 'a''b'. */
const psAspas = (s) => `'${String(s).replace(/'/g, "''")}'`

/** /Applications/AEON.app/Contents/MacOS/AEON → /Applications/AEON.app (null se não for um .app). */
function pacoteMac(exe) {
  if (!exe) return null
  let p = path.posix.normalize(String(exe))
  for (let i = 0; i < 4 && p !== '/'; i++) {
    if (p.endsWith('.app')) return p
    p = path.posix.dirname(p)
  }
  return null
}

/** Comando que o processo principal roda para entregar a troca. */
function comandoDaTroca(plataforma, script) {
  if (plataforma === 'darwin') return { cmd: '/bin/sh', args: [script] }
  if (plataforma === 'win32') return { cmd: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script] }
  return null
}

/** O script veio daqui: trocar.sh/trocar.ps1 numa pasta de atualização dentro da pasta temporária (main.cjs confere). */
function ehScriptDaTroca(script, tmpRoot = os.tmpdir()) {
  if (typeof script !== 'string' || !path.isAbsolute(script) || script.includes('\0')) return false
  const nome = path.basename(script)
  if (nome !== 'trocar.sh' && nome !== 'trocar.ps1') return false
  let real, raiz
  try {
    real = fs.realpathSync(script)
    raiz = fs.realpathSync(tmpRoot)
  } catch {
    return false
  }
  const rel = path.relative(raiz, real)
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel) && rel.split(path.sep)[0].startsWith(PREFIXO)
}

/** Script do Mac: espera o app fechar, troca o .app (o antigo volta se algo falhar) e abre de novo. */
function scriptMac({ pid, app, novo, velho, marca, tmp, build }) {
  const falha = (motivo) => `printf '%s' ${shAspas(JSON.stringify({ build, motivo }))} > "$MARCA"`
  return `#!/bin/sh
# ${PRODUTO.nome}: troca o app pela versão nova depois que ele fechar (gerado por desktop/atualizador.cjs).
PID=${Number(pid)}
APP=${shAspas(app)}
NOVO=${shAspas(novo)}
VELHO=${shAspas(velho)}
MARCA=${shAspas(marca)}
TMP=${shAspas(tmp)}
i=0
while kill -0 "$PID" 2>/dev/null; do
  i=$((i + 1))
  [ "$i" -gt 240 ] && break
  sleep 0.5
done
if kill -0 "$PID" 2>/dev/null; then
  ${falha('O app não fechou a tempo para trocar.')}
  rm -rf "$NOVO" "$TMP"
  exit 1
fi
rm -rf "$VELHO"
if mv "$APP" "$VELHO"; then
  if mv "$NOVO" "$APP"; then
    xattr -cr "$APP" 2>/dev/null
    rm -rf "$VELHO"
  else
    mv "$VELHO" "$APP"
    rm -rf "$NOVO"
    ${falha('O macOS não deixou pôr o app novo no lugar.')}
  fi
else
  rm -rf "$NOVO"
  ${falha('O macOS não deixou trocar o app.')}
fi
open "$APP"
rm -rf "$TMP"
`
}

/** Script do Windows: espera o app fechar, roda o instalador em silêncio e abre o app (se o instalador não abriu). */
function scriptWin({ pid, setup, exe, marca, tmp, build }) {
  const falha = (motivo) => `Set-Content -LiteralPath $marca -Value ${psAspas(JSON.stringify({ build, motivo }))} -Encoding UTF8`
  return `# ${PRODUTO.nome}: instala a versão nova depois que o app fechar (gerado por desktop/atualizador.cjs).
$ErrorActionPreference = 'Continue'
$appPid = ${Number(pid)}
$setup = ${psAspas(setup)}
$exe = ${psAspas(exe)}
$marca = ${psAspas(marca)}
$tmp = ${psAspas(tmp)}
try { Wait-Process -Id $appPid -Timeout 120 -ErrorAction Stop } catch {}
if (Get-Process -Id $appPid -ErrorAction SilentlyContinue) {
  ${falha('O app não fechou a tempo para atualizar.')}
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  exit 1
}
Unblock-File -LiteralPath $setup -ErrorAction SilentlyContinue
$ok = $false
try {
  # Espera só o instalador (Start-Process -Wait esperaria também o app que ele abre com --force-run).
  $p = Start-Process -FilePath $setup -ArgumentList '/S', '--updated', '--force-run' -PassThru -ErrorAction Stop
  $null = $p.Handle
  $p.WaitForExit()
  $ok = ($p.ExitCode -eq 0)
} catch {}
if (-not $ok) { ${falha('O instalador do Windows não terminou.')} }
Start-Sleep -Seconds 3
if (-not (Get-Process -Name ${psAspas(PRODUTO.nome)} -ErrorAction SilentlyContinue)) {
  if (Test-Path -LiteralPath $exe) { Start-Process -FilePath $exe }
}
Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
`
}

function podeGravarSync(p) {
  try {
    fs.accessSync(p, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

function execFileP(cmd, args) {
  return new Promise((ok, falha) => {
    execFile(cmd, args, { timeout: 10 * 60_000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return falha(Object.assign(err, { stderr: String(stderr || '').trim() }))
      ok(String(stdout || ''))
    })
  })
}

/**
 * Baixa `url` para `arquivo`, calculando o SHA-256 no caminho (segue o redirecionamento do GitHub).
 * @returns {Promise<string>} SHA-256 em hexadecimal
 */
async function baixarPara(url, arquivo, { fetch = globalThis.fetch, aoAndar = () => {}, paradoMs = PARADO_MS, maxBytes = MAX_BYTES } = {}) {
  const ac = new AbortController()
  const parou = () => ac.abort(new Error('o download parou de andar'))
  let relogio = setTimeout(parou, paradoMs)
  const cutucar = () => {
    clearTimeout(relogio)
    relogio = setTimeout(parou, paradoMs)
  }
  const saida = fs.createWriteStream(arquivo, { mode: 0o600 })
  const fechou = new Promise((ok, falha) => {
    saida.on('close', ok)
    saida.on('error', falha)
  })
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ac.signal, headers: { accept: 'application/octet-stream' } })
    if (!r.ok || !r.body) throw new Error(`o GitHub respondeu ${r.status}`)
    const total = Number(r.headers.get('content-length')) || 0
    if (total > maxBytes) throw new Error('o instalador é grande demais')
    const hash = crypto.createHash('sha256')
    let recebido = 0
    aoAndar(0, total)
    const leitor = r.body.getReader()
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break
      cutucar()
      recebido += value.length
      if (recebido > maxBytes) throw new Error('o instalador é grande demais')
      hash.update(value)
      if (!saida.write(value)) await new Promise((ok, falha) => (saida.once('drain', ok), saida.once('error', falha)))
      aoAndar(recebido, total)
    }
    if (total && recebido !== total) throw new Error('o download veio incompleto')
    saida.end()
    await fechou
    return hash.digest('hex')
  } catch (err) {
    saida.destroy()
    await fechou.catch(() => {})
    throw ac.signal.aborted && ac.signal.reason instanceof Error ? ac.signal.reason : err
  } finally {
    clearTimeout(relogio)
  }
}

/**
 * @fires Atualizador#mudou a cada mudança (o progresso no máximo a cada 200 ms): o estado vai para a tela.
 *
 * estado() = { atual, ultima: { build, data } | null, nova (aviso visível), podeAtualizar (o app se troca sozinho;
 *   senão o aviso oferece o Baixar), motivo (por que não se troca sozinho), fase: null|'baixando'|'conferindo'|
 *   'preparando'|'reiniciando'|'erro', recebido, total, erro, baixarUrl }
 */
class Atualizador extends EventEmitter {
  /**
   * @param {{ plataforma?: string, exe?: string, pid?: number, pastaDados?: string, tmpRoot?: string, build?: number,
   *   release?: string, fetch?: Function, baixar?: Function, rodar?: Function, podeGravar?: Function,
   *   entregar?: (job: { script: string }) => Promise<void>, log?: Function, primeiraMs?: number, aCadaMs?: number,
   *   progressoMs?: number, agora?: () => number }} op
   */
  constructor({ plataforma = process.platform, exe = '', pid = 0, pastaDados = null, tmpRoot = os.tmpdir(), build = 0, release = RELEASE_URL, fetch = globalThis.fetch, baixar, rodar = execFileP, podeGravar = podeGravarSync, entregar = null, log = () => {}, primeiraMs = PRIMEIRA_MS, aCadaMs = A_CADA_MS, progressoMs = PROGRESSO_MS, agora = Date.now } = {}) {
    super()
    this.plataforma = PLATAFORMAS[plataforma] || null
    this.exe = String(exe || '')
    this.pid = Number(pid) || 0
    this.pastaDados = pastaDados
    this.tmpRoot = tmpRoot
    this.atual = Number(build) > 0 ? Number(build) : 0
    this.release = String(release).replace(/\/+$/, '')
    this.fetch = fetch
    this.baixar = baixar || ((url, arquivo, aoAndar) => baixarPara(url, arquivo, { fetch: this.fetch, aoAndar }))
    this.rodar = rodar
    this.podeGravar = podeGravar
    this.entregar = entregar
    this.log = log
    this.primeiraMs = primeiraMs
    this.aCadaMs = aCadaMs
    this.progressoMs = progressoMs
    this.agora = agora
    this.ultima = null
    this.dispensada = 0
    this.bloqueado = 0
    this.fase = null
    this.recebido = 0
    this.total = 0
    this.erro = null
    this.trabalho = null
    this.relogio = null
    this.ultimoProgresso = 0
    this.motivo = this.#conferir()
    this.#lerMarca()
  }

  /** Só o app empacotado com build do CI confere versão (desenvolvimento = build 0). */
  get ligado() {
    return this.atual > 0 && !!this.plataforma
  }

  /** Por que este app não consegue se trocar sozinho (null = consegue). */
  #conferir() {
    if (!this.plataforma) return 'Neste sistema o app não se atualiza sozinho.'
    if (!this.entregar || !this.exe || !this.pid) return 'Só o app instalado se atualiza sozinho.'
    if (this.plataforma === 'mac') {
      const app = pacoteMac(this.exe)
      if (!app) return 'Não encontrei o app para trocar.'
      if (app.includes('/AppTranslocation/')) return `Mova o ${PRODUTO.nome} para Aplicativos para ele se atualizar sozinho.`
      if (app.startsWith('/Volumes/')) return `O ${PRODUTO.nome} está aberto direto do instalador. Instale em Aplicativos.`
      if (!this.podeGravar(path.posix.dirname(app)) || !this.podeGravar(app)) return 'Sem permissão para trocar o app nesta pasta.'
      this.app = app
    } else if (!this.podeGravar(path.win32.dirname(this.exe))) {
      return 'Sem permissão para trocar o app nesta pasta.'
    }
    return null
  }

  /** A troca anterior falhou (o script deixou a marca): aquele build não se instala pelo app; o aviso oferece o Baixar. */
  #lerMarca() {
    if (!this.pastaDados) return
    const arq = path.join(this.pastaDados, MARCA)
    let raw
    try {
      raw = fs.readFileSync(arq, 'utf8')
    } catch {
      return
    }
    try {
      fs.rmSync(arq, { force: true })
    } catch {}
    try {
      const m = JSON.parse(raw.replace(/^﻿/, ''))
      const b = Number(m?.build)
      this.bloqueado = Number.isSafeInteger(b) && b > 0 ? b : 0
      this.fase = 'erro'
      this.erro = `A atualização anterior não terminou. ${typeof m?.motivo === 'string' ? m.motivo.slice(0, 200) : ''}`.trim()
    } catch {}
  }

  estado() {
    const u = this.ultima
    const p = this.plataforma
    const nova = this.ligado && !!u && u.build > this.atual
    const podeAtualizar = nova && !this.motivo && !!u.sha256[p] && !!u.arquivo[p] && !(this.bloqueado && u.build <= this.bloqueado)
    return {
      atual: this.atual,
      ultima: u ? { build: u.build, data: u.data } : null,
      // o aviso aparece com versão nova não dispensada, ou enquanto uma atualização anda ou falhou
      nova: (nova && u.build > this.dispensada) || !!this.fase,
      podeAtualizar,
      motivo: this.motivo,
      fase: this.fase,
      recebido: this.recebido,
      total: this.total,
      erro: this.erro,
      baixarUrl: BAIXAR_URL,
    }
  }

  #mudar(patch, { progresso = false } = {}) {
    Object.assign(this, patch)
    if (progresso) {
      const t = this.agora()
      if (t - this.ultimoProgresso < this.progressoMs) return
      this.ultimoProgresso = t
    }
    this.emit('mudou', this.estado())
  }

  iniciar() {
    if (!this.ligado || this.relogio) return
    const agendar = (ms) => {
      this.relogio = setTimeout(async () => {
        await this.verificar()
        agendar(this.aCadaMs)
      }, ms)
      this.relogio.unref?.()
    }
    agendar(this.primeiraMs)
  }

  parar() {
    clearTimeout(this.relogio)
    this.relogio = null
  }

  /** Lê o versao.json do Release. Nunca lança: sem internet, fica o que já se sabia e tenta na próxima. */
  async verificar() {
    if (!this.ligado) return this.estado()
    try {
      const r = await this.fetch(`${this.release}/versao.json`, { signal: AbortSignal.timeout(ESPERA_MS), headers: { 'cache-control': 'no-cache' } })
      if (!r.ok) throw new Error(`o GitHub respondeu ${r.status}`)
      const v = lerVersao(await r.json())
      if (!v) throw new Error('versao.json sem versão')
      this.ultima = v
    } catch (err) {
      this.log('[atualizar] não consegui ver se há versão nova:', err?.message || err)
    }
    this.emit('mudou', this.estado())
    return this.estado()
  }

  /** "Depois": esconde o aviso deste build (volta com um build mais novo ou na próxima abertura). */
  depois() {
    if (this.trabalho) return this.estado()
    this.dispensada = Math.max(this.dispensada, this.ultima?.build || 0)
    this.#mudar({ fase: null, erro: null })
    return this.estado()
  }

  /**
   * "Atualizar": baixa, confere, prepara e entrega a troca (o app fecha e abre na versão nova). Volta quando acaba ou
   * falha; o andamento vai pelo 'mudou'. Nunca lança: falha vira fase 'erro' com o motivo.
   */
  atualizar() {
    if (this.trabalho) return this.trabalho
    this.trabalho = this.#atualizar().finally(() => {
      this.trabalho = null
    })
    return this.trabalho
  }

  async #atualizar() {
    this.#mudar({ fase: 'baixando', recebido: 0, total: 0, erro: null })
    await this.verificar() // a conferência pode ter até 4 h: pergunta de novo antes de baixar
    const st = this.estado()
    if (!st.podeAtualizar) {
      const erro = !this.ultima || this.ultima.build <= this.atual ? 'Não achei versão nova agora. Tente daqui a pouco.' : this.motivo || 'Esta versão não dá para instalar pelo app. Use Baixar.'
      this.#mudar({ fase: 'erro', erro })
      return this.estado()
    }
    const { build } = this.ultima
    const p = this.plataforma
    const sha = this.ultima.sha256[p]
    let tmp = null
    let guardado = false
    try {
      await this.#limparSobras()
      tmp = await fsp.mkdtemp(path.join(this.tmpRoot, PREFIXO))
      const arquivo = path.join(tmp, p === 'mac' ? 'instalador.dmg' : 'instalador.exe')
      let got
      try {
        got = await this.baixar(`${this.release}/${this.ultima.arquivo[p]}`, arquivo, (recebido, total) => this.#mudar({ recebido, total }, { progresso: true }))
      } catch (err) {
        this.log('[atualizar] download falhou:', err?.message || err)
        throw new Error('O download não terminou. Confira a internet e tente de novo.')
      }
      this.#mudar({ fase: 'conferindo', recebido: this.total || this.recebido })
      if (String(got).toLowerCase() !== sha) throw new Error('O arquivo baixado não bate com a conferência (SHA-256). Nada foi trocado. Tente de novo em alguns minutos.')
      this.#mudar({ fase: 'preparando' })
      const script = p === 'mac' ? await this.#prepararMac({ arquivo, tmp, build }) : await this.#prepararWin({ arquivo, tmp, build })
      this.#mudar({ fase: 'reiniciando' })
      await this.entregar({ script })
      guardado = true
      return this.estado()
    } catch (err) {
      this.#mudar({ fase: 'erro', erro: err?.message || 'Algo deu errado ao atualizar. Use Baixar.' })
      return this.estado()
    } finally {
      if (!guardado && tmp) await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {})
      if (!guardado && this.novoApp) await this.rodar('/bin/rm', ['-rf', this.novoApp]).catch(() => {})
    }
  }

  /** Pastas de atualizações antigas que ficaram para trás (mais de 1 h). */
  async #limparSobras() {
    let nomes = []
    try {
      nomes = await fsp.readdir(this.tmpRoot)
    } catch {
      return
    }
    const limite = this.agora() - 60 * 60_000
    for (const n of nomes) {
      if (!n.startsWith(PREFIXO)) continue
      const p = path.join(this.tmpRoot, n)
      try {
        if ((await fsp.stat(p)).mtimeMs < limite) await fsp.rm(p, { recursive: true, force: true })
      } catch {}
    }
  }

  async #prepararMac({ arquivo, tmp, build }) {
    const app = this.app
    const pasta = path.posix.dirname(app)
    const base = path.posix.basename(app, '.app')
    const novo = path.posix.join(pasta, `.${base}-atualizacao.app`)
    const velho = path.posix.join(pasta, `.${base}-antigo.app`)
    const montagem = path.join(tmp, 'montagem')
    await fsp.mkdir(montagem)
    try {
      await this.rodar('hdiutil', ['attach', arquivo, '-nobrowse', '-noautoopen', '-readonly', '-mountpoint', montagem, '-quiet'])
    } catch (err) {
      this.log('[atualizar] hdiutil attach falhou:', err?.stderr || err?.message)
      throw new Error('Não consegui abrir o instalador baixado. Use Baixar.')
    }
    try {
      const apps = (await fsp.readdir(montagem)).filter((n) => n.endsWith('.app'))
      const origem = apps.includes(`${base}.app`) ? `${base}.app` : apps.includes(`${PRODUTO.nome}.app`) ? `${PRODUTO.nome}.app` : null
      if (!origem) throw new Error('O instalador baixado não tem o app dentro. Use Baixar.')
      // rm do sistema: o fs do Electron enxerga o app.asar como pasta e o rm recursivo para no meio
      await this.rodar('/bin/rm', ['-rf', novo])
      this.novoApp = novo
      try {
        await this.rodar('ditto', [path.join(montagem, origem), novo])
      } catch (err) {
        this.log('[atualizar] ditto falhou:', err?.stderr || err?.message)
        throw new Error('Não consegui copiar o app novo para a pasta de Aplicativos. Use Baixar.')
      }
    } finally {
      await this.rodar('hdiutil', ['detach', montagem, '-quiet']).catch(() => this.rodar('hdiutil', ['detach', montagem, '-force', '-quiet']).catch(() => {}))
    }
    await this.rodar('xattr', ['-cr', novo]).catch((err) => this.log('[atualizar] xattr falhou (segue):', err?.stderr || err?.message))
    const script = path.join(tmp, 'trocar.sh')
    const marca = path.join(this.pastaDados || tmp, MARCA)
    await fsp.writeFile(script, scriptMac({ pid: this.pid, app, novo, velho, marca, tmp, build }), { mode: 0o700 })
    return script
  }

  async #prepararWin({ arquivo, tmp, build }) {
    const script = path.join(tmp, 'trocar.ps1')
    const marca = path.join(this.pastaDados || tmp, MARCA)
    // BOM: o PowerShell 5 lê o script como UTF-8 (acentos nos caminhos e nas mensagens)
    await fsp.writeFile(script, '﻿' + scriptWin({ pid: this.pid, setup: arquivo, exe: this.exe, marca, tmp, build }), { mode: 0o700 })
    return script
  }
}

module.exports = { Atualizador, RELEASE_URL, BAIXAR_URL, MARCA, PREFIXO, lerBuildInfo, lerVersao, baixarPara, pacoteMac, comandoDaTroca, ehScriptDaTroca, scriptMac, scriptWin, shAspas, psAspas }
