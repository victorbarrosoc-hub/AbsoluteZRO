// Atualização sozinha, no jeito do Creative Cloud: o app olha o versao.json do Release (o mesmo que os instaladores
// do Terminal leem), baixa a versão nova em segundo plano, confere o SHA-256 e deixa a troca pronta. A página mostra
// "Reiniciar para atualizar"; se a pessoa não clicar, a troca acontece quando ela fechar o app (sem reabrir).
//
// Sem certificado da Apple ou da Microsoft (custo zero, decisão do titular): o que trava um app novo é a marca de
// "veio da internet" que o navegador põe no arquivo. O que o próprio app baixa não ganha essa marca, e mesmo assim o
// Mac ainda tira os atributos (xattr -cr) do app novo.
//
//   Mac: monta o .dmg, copia o app para /Applications/.AEON-atualizacao.app (ao lado do atual), desmonta. Na troca,
//        um script pequeno espera o app fechar, põe o novo no lugar (o antigo volta se algo falhar) e abre.
//   Windows: guarda o instalador; na troca, o script espera o app fechar e roda o instalador em silêncio (/S).
//
// Só no app empacotado com número de build (desktop/build-info.json, gravado pelo CI). Tudo que toca o sistema
// (baixar, rodar comandos, permissão de escrita, soltar o script) é injetável: os testes trocam por funções falsas.

const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { execFile, spawn } = require('node:child_process')
const { EventEmitter } = require('node:events')
const { PRODUTO } = require('../src/produto.js')

const RELEASE = `https://github.com/${PRODUTO.repositorio}/releases/download/${PRODUTO.release}`
const MARCA_FALHA = 'atualizacao-falhou.json'
const PREFIXO_TMP = 'aeon-atualizacao-'
const SHA = /^[0-9a-f]{64}$/
const MAX_BYTES = 2 * 1024 ** 3
const PLATAFORMAS = { darwin: 'mac', win32: 'windows' }

const sh = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`
const ps = (s) => `'${String(s).replace(/'/g, "''")}'`

/** /Applications/AEON.app/Contents/MacOS/AEON → /Applications/AEON.app (null se não estiver num .app). */
function pacoteMac(exe) {
  let p = path.posix.normalize(String(exe || ''))
  for (let i = 0; i < 4 && p !== '/' && p !== '.'; i++) {
    if (p.endsWith('.app')) return p
    p = path.posix.dirname(p)
  }
  return null
}

/** Script do Mac: espera o app fechar, troca o .app e (se pediu) abre de novo. */
function scriptMac({ pid, app, novo, velho, marca, tmp, build, reabrir }) {
  const falha = (motivo) => `printf '%s' ${sh(JSON.stringify({ build, motivo }))} > "$MARCA"`
  return `#!/bin/sh
# AEON: troca o app pela versão nova depois que ele fechar (gerado por desktop/atualizacao.cjs).
PID=${Number(pid)}
APP=${sh(app)}
NOVO=${sh(novo)}
VELHO=${sh(velho)}
MARCA=${sh(marca)}
TMP=${sh(tmp)}
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
${reabrir ? 'open "$APP"\n' : ''}rm -rf "$TMP"
`
}

/** Script do Windows: espera o app fechar, roda o instalador em silêncio e (se pediu) abre o app. */
function scriptWin({ pid, setup, exe, marca, tmp, build, reabrir, nome }) {
  const falha = (motivo) => `Set-Content -LiteralPath $marca -Value ${ps(JSON.stringify({ build, motivo }))} -Encoding UTF8`
  return `# AEON: instala a versão nova depois que o app fechar (gerado por desktop/atualizacao.cjs).
$ErrorActionPreference = 'Continue'
$appPid = ${Number(pid)}
$setup = ${ps(setup)}
$exe = ${ps(exe)}
$marca = ${ps(marca)}
$tmp = ${ps(tmp)}
try { Wait-Process -Id $appPid -Timeout 120 -ErrorAction Stop } catch {}
if (Get-Process -Id $appPid -ErrorAction SilentlyContinue) {
  ${falha('O app não fechou a tempo para atualizar.')}
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  exit 1
}
Unblock-File -LiteralPath $setup -ErrorAction SilentlyContinue
$ok = $false
try {
  $p = Start-Process -FilePath $setup -ArgumentList '/S', '--updated' -PassThru -ErrorAction Stop
  $null = $p.Handle
  $p.WaitForExit()
  $ok = ($p.ExitCode -eq 0)
} catch {}
if (-not $ok) { ${falha('O instalador do Windows não terminou.')} }
${
  reabrir
    ? `Start-Sleep -Seconds 2
if (-not (Get-Process -Name ${ps(nome)} -ErrorAction SilentlyContinue)) {
  if (Test-Path -LiteralPath $exe) { Start-Process -FilePath $exe }
}
`
    : ''
}Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
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
  return new Promise((ok, falha) =>
    execFile(cmd, args, { timeout: 10 * 60_000, windowsHide: true }, (err, stdout, stderr) => (err ? falha(Object.assign(err, { stderr: String(stderr || '') })) : ok(String(stdout || '')))),
  )
}

/** Baixa `url` para `arquivo` calculando o SHA-256 no caminho. Devolve o SHA-256. */
async function baixar(url, arquivo, aoAndar = () => {}) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30 * 60_000) })
  if (!r.ok || !r.body) throw new Error(`o GitHub respondeu ${r.status}`)
  const total = Number(r.headers.get('content-length')) || 0
  if (total > MAX_BYTES) throw new Error('instalador grande demais')
  const hash = crypto.createHash('sha256')
  const out = fs.createWriteStream(arquivo, { mode: 0o600 })
  let recebido = 0
  try {
    for await (const pedaco of r.body) {
      recebido += pedaco.length
      if (recebido > MAX_BYTES) throw new Error('instalador grande demais')
      hash.update(pedaco)
      if (!out.write(pedaco)) await new Promise((ok) => out.once('drain', ok))
      aoAndar(recebido, total)
    }
  } finally {
    await new Promise((ok) => out.end(ok))
  }
  if (total && recebido !== total) throw new Error('o download veio incompleto')
  return hash.digest('hex')
}

async function lerVersao(release) {
  const r = await fetch(`${release}/versao.json`, { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  if (!r.ok) throw new Error(`versao.json: ${r.status}`)
  return r.json()
}

/**
 * status(): { ativo, motivo, fase: null|'baixando'|'pronto'|'reiniciando'|'erro', build, recebido, total, erro }
 * Evento 'mudou' a cada mudança (o progresso no máximo a cada 500 ms).
 */
class Atualizador extends EventEmitter {
  constructor({ nome = PRODUTO.nome, buildAtual, plataforma = process.platform, exe = process.execPath, pid = process.pid, pastaDados, tmpRaiz = os.tmpdir(), release = RELEASE, buscarVersao, baixar: baixarFn, rodar: rodarFn, podeGravar: podeGravarFn, soltar } = {}) {
    super()
    this.nome = nome
    this.buildAtual = Number(buildAtual) || 0
    this.plataforma = PLATAFORMAS[plataforma] || null
    this.exe = String(exe || '')
    this.pid = Number(pid) || 0
    this.pastaDados = pastaDados || null
    this.tmpRaiz = tmpRaiz
    this.release = release
    this.buscarVersao = buscarVersao || (() => lerVersao(this.release))
    this.baixar = baixarFn || baixar
    this.rodar = rodarFn || rodar
    this.podeGravar = podeGravarFn || podeGravar
    this.soltar = soltar || soltarScript
    this.fase = null
    this.build = null
    this.recebido = 0
    this.total = 0
    this.erro = null
    this.bloqueado = 0
    this.pronto = null // { build, script, tmp, novo }
    this.trabalho = null
    this.ultimoAndar = 0
    this.motivo = this.#conferir()
    this.#lerMarca()
  }

  get ativo() {
    return !this.motivo
  }

  status() {
    return { ativo: this.ativo, motivo: this.motivo, fase: this.fase, build: this.build, atual: this.buildAtual, recebido: this.recebido, total: this.total, erro: this.erro }
  }

  #mudar(patch, andando = false) {
    Object.assign(this, patch)
    if (andando) {
      const agora = Date.now()
      if (agora - this.ultimoAndar < 500) return
      this.ultimoAndar = agora
    }
    this.emit('mudou', this.status())
  }

  /** Por que este app não se atualiza sozinho (null = atualiza). */
  #conferir() {
    if (!this.plataforma) return 'Neste sistema o app não se atualiza sozinho.'
    if (!this.buildAtual) return 'Versão de desenvolvimento: sem atualização automática.'
    if (!this.exe || !this.pid) return 'Só o app instalado se atualiza sozinho.'
    if (this.plataforma === 'mac') {
      const app = pacoteMac(this.exe)
      if (!app) return 'Não encontrei o app para trocar.'
      if (app.includes('/AppTranslocation/') || app.startsWith('/Volumes/')) return `Arraste o ${this.nome} para Aplicativos e abra de lá para ele se atualizar sozinho.`
      if (!this.podeGravar(path.posix.dirname(app)) || !this.podeGravar(app)) return 'Sem permissão para trocar o app nesta pasta.'
      this.app = app
    } else if (!this.podeGravar(path.win32.dirname(this.exe))) {
      return 'Sem permissão para trocar o app nesta pasta.'
    }
    return null
  }

  /** A troca anterior falhou (o script deixou a marca): não tenta de novo a mesma versão. */
  #lerMarca() {
    if (!this.pastaDados) return
    const arquivo = path.join(this.pastaDados, MARCA_FALHA)
    let bruto
    try {
      bruto = fs.readFileSync(arquivo, 'utf8')
      fs.rmSync(arquivo, { force: true })
    } catch {
      return
    }
    try {
      const m = JSON.parse(bruto.replace(/^﻿/, ''))
      this.bloqueado = Number(m.build) || 0
      this.fase = 'erro'
      this.build = this.bloqueado || null
      this.erro = `A última atualização não terminou: ${String(m.motivo || 'algo deu errado.').slice(0, 200)} Rode o comando de instalar de novo.`
    } catch {}
  }

  /** Olha o Release e, se tem versão nova, baixa e prepara. Volta o status (não lança: erro vira fase 'erro'). */
  verificar() {
    if (!this.ativo || this.trabalho || this.fase === 'reiniciando') return Promise.resolve(this.status())
    this.trabalho = this.#verificar().finally(() => (this.trabalho = null))
    return this.trabalho
  }

  async #verificar() {
    let v
    try {
      v = await this.buscarVersao()
    } catch {
      return this.status() // sem internet ou GitHub fora: tenta na próxima volta, sem aviso
    }
    const build = Number(v && v.build) || 0
    const arquivo = v && v[this.plataforma]
    const sha = String((v && v[this.plataforma === 'mac' ? 'sha256Mac' : 'sha256Windows']) || '').toLowerCase()
    if (build <= this.buildAtual || (this.bloqueado && build <= this.bloqueado)) return this.status()
    if (!arquivo || !SHA.test(sha) || !/^[A-Za-z0-9._-]+$/.test(arquivo)) return this.status() // essa plataforma ainda não saiu
    if (this.pronto && this.pronto.build >= build) return this.status()
    await this.#descartar()
    const tmp = await fsp.mkdtemp(path.join(this.tmpRaiz, PREFIXO_TMP))
    let guardado = false
    try {
      this.#mudar({ fase: 'baixando', build, recebido: 0, total: 0, erro: null })
      const local = path.join(tmp, this.plataforma === 'mac' ? 'instalador.dmg' : 'instalador.exe')
      const obtido = String(await this.baixar(`${this.release}/${arquivo}`, local, (recebido, total) => this.#mudar({ recebido, total }, true))).toLowerCase()
      // não bateu: o Release ainda está publicando (instaladores sobem antes do versao.json). Tenta na próxima volta.
      if (obtido !== sha) throw Object.assign(new Error('A versão nova ainda está sendo publicada.'), { silencioso: true })
      const pronto = this.plataforma === 'mac' ? await this.#prepararMac(local, tmp, build) : { setup: local }
      this.pronto = { build, tmp, ...pronto }
      guardado = true
      this.#mudar({ fase: 'pronto' })
    } catch (err) {
      // download que falhou ou ainda publicando: volta ao normal e tenta depois; erro de preparo trava esta versão
      if (err && err.silencioso) this.#mudar({ fase: null, build: null })
      else if (err && err.travar) {
        this.bloqueado = build
        this.#mudar({ fase: 'erro', erro: err.message })
      } else this.#mudar({ fase: null, build: null })
    } finally {
      if (!guardado) await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {})
    }
    return this.status()
  }

  async #prepararMac(dmg, tmp, build) {
    const pasta = path.posix.dirname(this.app)
    const base = path.posix.basename(this.app, '.app')
    const novo = path.posix.join(pasta, `.${base}-atualizacao.app`)
    const montagem = path.join(tmp, 'montagem')
    await fsp.mkdir(montagem)
    const travar = (msg) => Object.assign(new Error(msg), { travar: true })
    try {
      await this.rodar('hdiutil', ['attach', dmg, '-nobrowse', '-noautoopen', '-readonly', '-mountpoint', montagem, '-quiet'])
    } catch {
      throw travar('Não consegui abrir a versão nova baixada.')
    }
    try {
      const apps = (await fsp.readdir(montagem)).filter((n) => n.endsWith('.app'))
      const fonte = apps.includes(`${base}.app`) ? `${base}.app` : apps[0]
      if (!fonte) throw travar('A versão nova veio sem o app dentro.')
      await this.rodar('/bin/rm', ['-rf', novo]).catch(() => {})
      try {
        await this.rodar('ditto', [path.join(montagem, fonte), novo])
      } catch {
        await this.rodar('/bin/rm', ['-rf', novo]).catch(() => {})
        throw travar('Não consegui copiar a versão nova para Aplicativos.')
      }
    } finally {
      await this.rodar('hdiutil', ['detach', montagem, '-quiet']).catch(() => this.rodar('hdiutil', ['detach', montagem, '-force', '-quiet']).catch(() => {}))
    }
    await this.rodar('xattr', ['-cr', novo]).catch(() => {})
    return { novo }
  }

  async #descartar() {
    const p = this.pronto
    this.pronto = null
    if (p && p.tmp) await fsp.rm(p.tmp, { recursive: true, force: true }).catch(() => {})
    if (p && p.novo) await this.rodar('/bin/rm', ['-rf', p.novo]).catch(() => {})
  }

  /**
   * Entrega a troca: grava o script e solta (ele espera este processo fechar). reabrir = "Reiniciar para atualizar";
   * sem reabrir = a troca de quando a pessoa fecha o app. Depois disso o processo principal fecha o app.
   */
  trocar({ reabrir }) {
    const p = this.pronto
    if (!p || this.fase === 'reiniciando') return false
    const marca = path.join(this.pastaDados || p.tmp, MARCA_FALHA)
    let script
    try {
      if (this.plataforma === 'mac') {
        const pasta = path.posix.dirname(this.app)
        const velho = path.posix.join(pasta, `.${path.posix.basename(this.app, '.app')}-antigo.app`)
        script = path.join(p.tmp, 'trocar.sh')
        fs.writeFileSync(script, scriptMac({ pid: this.pid, app: this.app, novo: p.novo, velho, marca, tmp: p.tmp, build: p.build, reabrir }), { mode: 0o700 })
      } else {
        script = path.join(p.tmp, 'trocar.ps1')
        fs.writeFileSync(script, '﻿' + scriptWin({ pid: this.pid, setup: p.setup, exe: this.exe, marca, tmp: p.tmp, build: p.build, reabrir, nome: this.nome }), { mode: 0o700 })
      }
      this.soltar(this.plataforma, script)
    } catch {
      this.#mudar({ fase: 'erro', erro: 'Não consegui preparar a troca. Rode o comando de instalar de novo.' })
      return false
    }
    this.pronto = null
    this.#mudar({ fase: 'reiniciando' })
    return true
  }
}

/** Roda o script solto do app (continua depois que o app fecha). */
function soltarScript(plataforma, script) {
  const [cmd, args] = plataforma === 'mac' ? ['/bin/sh', [script]] : ['powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script]]
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref()
}

module.exports = { Atualizador, pacoteMac, scriptMac, scriptWin, RELEASE }
