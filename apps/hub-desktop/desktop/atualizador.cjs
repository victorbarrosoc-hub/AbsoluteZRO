// "Atualizar" pelo próprio app, como no SOBEDESCE (products/sobedesce/src/updater.js): baixa, confere, fecha e abre
// já na versão nova. Sem assinatura da Apple/Microsoft, o que trava a instalação é a marca de "veio da internet" que
// o navegador põe no arquivo; arquivo baixado pelo próprio app não ganha essa marca. O caminho:
//
//   1. baixa o instalador de <hub>/baixar/hub/<plataforma>?build=N (segue o redirecionamento para o GitHub), com
//      progresso;
//   2. confere o SHA-256 com o que /baixar/hub/versao publicou (sem hash ou hash diferente = não instala);
//   3. prepara a troca. Mac: monta o .dmg (hdiutil), copia o app novo para o lado do atual (ditto), desmonta e tira a
//      quarentena (xattr -cr). Windows: o próprio instalador NSIS, em silêncio (/S);
//   4. grava um script pequeno e entrega ao main.cjs (handoff), que o roda solto e fecha o app. O script espera o app
//      fechar, troca o app (Mac) ou roda o instalador (Windows) e abre de novo. Se a troca falhar, o app antigo volta
//      e fica a marca atualizacao-falhou.json na pasta de dados: na próxima abertura o aviso volta a ser "Baixar".
//
// Sem Electron aqui: baixar, rodar comandos, conferir permissão e entregar o script são injetáveis (os testes trocam
// por funções falsas).

const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { execFile } = require('node:child_process')

const MARCA = 'atualizacao-falhou.json'
const PREFIXO_TMP = 'absolutezro-atualizacao-'
const MAX_BYTES = 2 * 1024 ** 3
const PARADO_MS = 60_000
const PROGRESSO_MS = 250
const SHA256 = /^[0-9a-f]{64}$/
const PLATAFORMAS = { darwin: 'mac', win32: 'windows' }
const NOME_APP = 'Absolute ZRO'

/** Erro que desliga o Atualizar desta versão (o aviso volta para o Baixar). */
const definitivo = (message) => Object.assign(new Error(message), { definitivo: true })

/** Texto entre aspas simples para sh: 'a'\''b'. */
const shQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`

/** Texto entre aspas simples para PowerShell: 'a''b'. */
const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`

/** /Applications/Absolute ZRO.app/Contents/MacOS/Absolute ZRO → /Applications/Absolute ZRO.app (null se não for .app). */
function macBundle(appExe) {
  if (!appExe) return null
  let p = path.posix.normalize(String(appExe))
  for (let i = 0; i < 4 && p !== '/'; i++) {
    if (p.endsWith('.app')) return p
    p = path.posix.dirname(p)
  }
  return null
}

/** Comando que o main.cjs roda, solto, para entregar a troca. */
function comandoDaTroca(platform, script) {
  if (platform === 'darwin') return { cmd: '/bin/sh', args: [script] }
  if (platform === 'win32')
    return { cmd: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script] }
  return null
}

/** O script veio deste motor, numa pasta de atualização dentro da pasta temporária do sistema? (o main confere) */
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
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel) && rel.split(path.sep)[0].startsWith(PREFIXO_TMP)
}

/** Script do Mac: espera o app fechar, troca o .app (o antigo volta se algo falhar) e abre de novo. */
function scriptMac({ pid, app, novo, velho, marca, tmp, build }) {
  const falha = (motivo) => `printf '%s' ${shQuote(JSON.stringify({ build, motivo }))} > "$MARCA"`
  return `#!/bin/sh
# Absolute ZRO: troca o app pela versão nova depois que ele fechar (gerado por desktop/atualizador.cjs).
PID=${Number(pid)}
APP=${shQuote(app)}
NOVO=${shQuote(novo)}
VELHO=${shQuote(velho)}
MARCA=${shQuote(marca)}
TMP=${shQuote(tmp)}
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
  const falha = (motivo) => `Set-Content -LiteralPath $marca -Value ${psQuote(JSON.stringify({ build, motivo }))} -Encoding UTF8`
  return `# Absolute ZRO: instala a versão nova depois que o app fechar (gerado por desktop/atualizador.cjs).
$ErrorActionPreference = 'Continue'
$appPid = ${Number(pid)}
$setup = ${psQuote(setup)}
$exe = ${psQuote(exe)}
$marca = ${psQuote(marca)}
$tmp = ${psQuote(tmp)}
try { Wait-Process -Id $appPid -Timeout 120 -ErrorAction Stop } catch {}
if (Get-Process -Id $appPid -ErrorAction SilentlyContinue) {
  ${falha('O app não fechou a tempo para atualizar.')}
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  exit 1
}
Unblock-File -LiteralPath $setup -ErrorAction SilentlyContinue
$ok = $false
try {
  $p = Start-Process -FilePath $setup -ArgumentList '/S', '--updated', '--force-run' -PassThru -ErrorAction Stop
  $null = $p.Handle
  $p.WaitForExit()
  $ok = ($p.ExitCode -eq 0)
} catch {}
if (-not $ok) { ${falha('O instalador do Windows não terminou.')} }
Start-Sleep -Seconds 3
if (-not (Get-Process -Name ${psQuote(NOME_APP)} -ErrorAction SilentlyContinue)) {
  if (Test-Path -LiteralPath $exe) { Start-Process -FilePath $exe }
}
Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
`
}

function podeGravar(p) {
  try {
    fs.accessSync(p, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

function rodar(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 10 * 60_000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stderr: String(stderr || '').trim() }))
      resolve(String(stdout || ''))
    })
  })
}

/** Baixa `url` para `arquivo`, calculando o SHA-256 no caminho. Devolve o SHA-256 em hexadecimal. */
async function baixarPara(url, arquivo, { fetch = globalThis.fetch, aoProgresso = () => {}, paradoMs = PARADO_MS, maxBytes = MAX_BYTES } = {}) {
  const ac = new AbortController()
  const parou = () => ac.abort(new Error('o download parou de andar'))
  let relogio = setTimeout(parou, paradoMs)
  const cutucar = () => {
    clearTimeout(relogio)
    relogio = setTimeout(parou, paradoMs)
  }
  const out = fs.createWriteStream(arquivo, { mode: 0o600 })
  const fechado = new Promise((resolve, reject) => {
    out.on('close', resolve)
    out.on('error', reject)
  })
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ac.signal, headers: { accept: 'application/octet-stream' } })
    if (!res.ok || !res.body) throw new Error(`o site respondeu ${res.status}`)
    const total = Number(res.headers.get('content-length')) || 0
    if (total > maxBytes) throw new Error('o instalador é grande demais')
    const hash = crypto.createHash('sha256')
    let recebido = 0
    aoProgresso(0, total)
    for await (const pedaco of res.body) {
      cutucar()
      recebido += pedaco.length
      if (recebido > maxBytes) throw new Error('o instalador é grande demais')
      hash.update(pedaco)
      if (!out.write(pedaco))
        await new Promise((r, j) => {
          out.once('drain', r)
          out.once('error', j)
        })
      aoProgresso(recebido, total)
    }
    if (total && recebido !== total) throw new Error('o download veio incompleto')
    out.end()
    await fechado
    return hash.digest('hex')
  } catch (err) {
    out.destroy()
    await fechado.catch(() => {})
    throw ac.signal.aborted && ac.signal.reason instanceof Error ? ac.signal.reason : err
  } finally {
    clearTimeout(relogio)
  }
}

/**
 * Evento 'mudou' a cada fase e no progresso (no máximo a cada 250 ms). status() = { disponivel, motivo, fase:
 * null|'baixando'|'conferindo'|'preparando'|'pronto'|'reiniciando'|'erro', build, recebido, total, erro, bloqueado }
 */
class Atualizador extends EventEmitter {
  constructor({
    platform = process.platform,
    appExe,
    appPid,
    pasta,
    entregar,
    baixar,
    run,
    canWrite,
    tmpRoot,
    log = () => {},
    progressoMs = PROGRESSO_MS,
  } = {}) {
    super()
    this.platform = platform
    this.plataforma = PLATAFORMAS[platform] || null
    this.appExe = appExe ? String(appExe) : ''
    this.appPid = Number(appPid) || 0
    this.pasta = pasta || null
    this.entregar = entregar || null
    this.baixar = baixar || ((url, arquivo, aoProgresso) => baixarPara(url, arquivo, { aoProgresso }))
    this.run = run || rodar
    this.canWrite = canWrite || podeGravar
    this.tmpRoot = tmpRoot || os.tmpdir()
    this.log = log
    this.progressoMs = progressoMs
    this.fase = null
    this.build = null
    this.recebido = 0
    this.total = 0
    this.erro = null
    this.bloqueado = 0
    this.ultimoProgresso = 0
    this.trabalho = null
    this.motivo = this.#conferirLugar()
    this.#lerMarca()
  }

  get disponivel() {
    return !this.motivo
  }

  /** Por que este app não consegue se atualizar sozinho (null = consegue). */
  #conferirLugar() {
    if (!this.plataforma) return 'Neste sistema o app não se atualiza sozinho.'
    if (!this.entregar || !this.appExe || !this.appPid) return 'Só o app instalado se atualiza sozinho.'
    if (this.plataforma === 'mac') {
      const bundle = macBundle(this.appExe)
      if (!bundle) return 'Não encontrei o app para trocar.'
      if (bundle.includes('/AppTranslocation/')) return 'Mova o Absolute ZRO para Aplicativos e abra de novo para ele se atualizar sozinho.'
      if (bundle.startsWith('/Volumes/')) return 'O Absolute ZRO está aberto direto do disco de instalação. Arraste para Aplicativos e abra de lá.'
      if (!this.canWrite(path.posix.dirname(bundle)) || !this.canWrite(bundle)) return 'Sem permissão para trocar o app nesta pasta.'
      this.bundle = bundle
    } else if (!this.canWrite(path.win32.dirname(this.appExe))) {
      return 'Sem permissão para trocar o app nesta pasta.'
    }
    return null
  }

  /** A troca anterior falhou (o script deixou a marca): desliga o Atualizar daquela versão e guarda o motivo. */
  #lerMarca() {
    if (!this.pasta) return
    const arquivo = path.join(this.pasta, MARCA)
    let bruto
    try {
      bruto = fs.readFileSync(arquivo, 'utf8')
    } catch {
      return
    }
    try {
      fs.rmSync(arquivo, { force: true })
    } catch {
      // sem disco: a marca fica e é lida de novo, sem mal
    }
    try {
      const m = JSON.parse(bruto.replace(/^﻿/, ''))
      const build = Number(m && m.build)
      this.bloqueado = Number.isSafeInteger(build) && build > 0 ? build : 0
      this.falhaAnterior = typeof (m && m.motivo) === 'string' ? m.motivo.slice(0, 200) : 'algo deu errado.'
    } catch {
      // marca ilegível: ignora
    }
  }

  /** Esta versão pode ser instalada pelo app? */
  podeInstalar(build) {
    return this.disponivel && !(this.bloqueado && build <= this.bloqueado)
  }

  get ocupado() {
    return !!this.trabalho
  }

  status() {
    return {
      disponivel: this.disponivel,
      motivo: this.motivo,
      fase: this.fase,
      build: this.build,
      recebido: this.recebido,
      total: this.total,
      erro: this.erro,
      bloqueado: this.bloqueado,
    }
  }

  #mudar(patch, { progresso = false } = {}) {
    Object.assign(this, patch)
    if (progresso) {
      const agora = Date.now()
      if (agora - this.ultimoProgresso < this.progressoMs) return
      this.ultimoProgresso = agora
    }
    this.emit('mudou', this.status())
  }

  /**
   * Baixa, confere, prepara e já troca (fecha e abre o app). Volta quando a troca foi entregue ou deu erro; acompanhe
   * pelo evento 'mudou'. `recheck` (opcional) pergunta ao site de novo se o arquivo não bater.
   */
  instalar({ build, url, sha256, recheck } = {}) {
    if (this.trabalho) return this.trabalho
    if (!this.disponivel) throw Object.assign(new Error(this.motivo), { status: 409 })
    if (!this.podeInstalar(build)) throw Object.assign(new Error('Esta versão não dá para instalar pelo app.'), { status: 409 })
    const hash = String(sha256 || '').toLowerCase()
    if (!SHA256.test(hash)) {
      this.#mudar({ fase: 'erro', build, erro: 'O site ainda não publicou a conferência (SHA-256) desta versão.' })
      return Promise.resolve(this.status())
    }
    this.#mudar({ fase: 'baixando', build, recebido: 0, total: 0, erro: null })
    this.trabalho = this.#instalar({ build, url, sha256: hash, recheck }).finally(() => {
      this.trabalho = null
    })
    return this.trabalho
  }

  async #instalar({ build, url, sha256, recheck }) {
    await this.#limparSobras()
    const tmp = await fsp.mkdtemp(path.join(this.tmpRoot, PREFIXO_TMP))
    let entregue = false
    try {
      const arquivo = path.join(tmp, this.plataforma === 'mac' ? 'AbsoluteZRO.dmg' : 'AbsoluteZRO-setup.exe')
      let got
      try {
        got = await this.baixar(url, arquivo, (recebido, total) => this.#mudar({ recebido, total }, { progresso: true }))
      } catch (err) {
        this.log('[atualizar] não consegui baixar:', err && err.message)
        throw new Error('Não consegui baixar a versão nova. Confira a internet e tente de novo.')
      }
      this.#mudar({ fase: 'conferindo', recebido: this.total || this.recebido })
      got = String(got).toLowerCase()
      if (got !== sha256) {
        // O mais comum: saiu um build mais novo depois da conferência. Se a nova bate com o arquivo, instala ele.
        const novo = recheck ? await recheck().catch(() => null) : null
        if (!(novo && novo.build >= build && String(novo.sha256 || '').toLowerCase() === got && this.podeInstalar(novo.build)))
          throw new Error('A versão nova ainda está sendo publicada. Tente de novo em alguns minutos.')
        build = novo.build
        this.#mudar({ build })
      }
      this.#mudar({ fase: 'preparando' })
      const script = this.plataforma === 'mac' ? await this.#prepararMac({ arquivo, tmp, build }) : await this.#prepararWin({ arquivo, tmp, build })
      this.#mudar({ fase: 'reiniciando' })
      try {
        await this.entregar({ script })
        entregue = true
      } catch (err) {
        this.log('[atualizar] não consegui entregar a troca:', err && err.message)
        if (this.novoApp) await this.run('/bin/rm', ['-rf', this.novoApp]).catch(() => {})
        throw new Error('Não consegui reiniciar o app para atualizar.')
      }
      return this.status()
    } catch (err) {
      if (err && err.definitivo) this.bloqueado = Math.max(this.bloqueado, build)
      this.#mudar({ fase: 'erro', erro: (err && err.message) || 'Algo deu errado ao atualizar.' })
      return this.status()
    } finally {
      if (!entregue) await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {})
    }
  }

  /** Pastas de atualizações antigas que ficaram para trás. */
  async #limparSobras() {
    let nomes = []
    try {
      nomes = await fsp.readdir(this.tmpRoot)
    } catch {
      return
    }
    const limite = Date.now() - 60 * 60_000
    for (const n of nomes) {
      if (!n.startsWith(PREFIXO_TMP)) continue
      const p = path.join(this.tmpRoot, n)
      try {
        if ((await fsp.stat(p)).mtimeMs < limite) await fsp.rm(p, { recursive: true, force: true })
      } catch {
        // em uso ou sem permissão: fica para a próxima
      }
    }
  }

  async #prepararMac({ arquivo, tmp, build }) {
    const bundle = this.bundle
    const pai = path.posix.dirname(bundle)
    const base = path.posix.basename(bundle, '.app')
    const novo = path.posix.join(pai, `.${base}-atualizacao.app`)
    const velho = path.posix.join(pai, `.${base}-antigo.app`)
    this.novoApp = novo
    const montagem = path.join(tmp, 'montagem')
    await fsp.mkdir(montagem)
    try {
      await this.run('hdiutil', ['attach', arquivo, '-nobrowse', '-noautoopen', '-readonly', '-mountpoint', montagem, '-quiet'])
    } catch (err) {
      this.log('[atualizar] hdiutil attach falhou:', (err && err.stderr) || (err && err.message))
      throw definitivo('Não consegui abrir o instalador baixado.')
    }
    try {
      const apps = (await fsp.readdir(montagem)).filter((n) => n.endsWith('.app'))
      const origem = apps.includes(`${base}.app`) ? `${base}.app` : apps.find((n) => n === `${NOME_APP}.app`)
      if (!origem) throw definitivo('O instalador baixado não tem o app dentro.')
      await this.run('/bin/rm', ['-rf', novo]).catch(() => {
        throw definitivo('Uma atualização antiga ficou presa na pasta de Aplicativos.')
      })
      try {
        await this.run('ditto', [path.join(montagem, origem), novo])
      } catch (err) {
        this.log('[atualizar] ditto falhou:', (err && err.stderr) || (err && err.message))
        await this.run('/bin/rm', ['-rf', novo]).catch(() => {})
        throw definitivo('Não consegui copiar o app novo para a pasta de Aplicativos.')
      }
    } finally {
      await this.run('hdiutil', ['detach', montagem, '-quiet']).catch(() => this.run('hdiutil', ['detach', montagem, '-force', '-quiet']).catch(() => {}))
    }
    await this.run('xattr', ['-cr', novo]).catch((err) => this.log('[atualizar] xattr falhou (segue):', err && err.message))
    const script = path.join(tmp, 'trocar.sh')
    const marca = path.join(this.pasta || tmp, MARCA)
    await fsp.writeFile(script, scriptMac({ pid: this.appPid, app: bundle, novo, velho, marca, tmp, build }), { mode: 0o700 })
    return script
  }

  async #prepararWin({ arquivo, tmp, build }) {
    const script = path.join(tmp, 'trocar.ps1')
    const marca = path.join(this.pasta || tmp, MARCA)
    // BOM: o PowerShell 5 lê o script como UTF-8 (acentos nos caminhos e nas mensagens).
    await fsp.writeFile(script, '﻿' + scriptWin({ pid: this.appPid, setup: arquivo, exe: this.appExe, marca, tmp, build }), { mode: 0o700 })
    return script
  }
}

module.exports = { Atualizador, baixarPara, comandoDaTroca, ehScriptDaTroca, macBundle, scriptMac, scriptWin, shQuote, psQuote, MARCA }
