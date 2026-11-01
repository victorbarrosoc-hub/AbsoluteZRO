// Aviso "Atualização disponível" do Relay. Desde 01/11/2026 quem instala e atualiza os apps de computador é a central
// Absolute ZRO (apps/hub-desktop): este app não baixa nem instala nada. Ele só confere, pelo mesmo versao.json de
// sempre (GET <HUB>/baixar/app/relay/versao.json, com os cookies do login: a rota confere o gate de lançamento e
// redireciona para o arquivo do Release "Relay · versão de teste"), se saiu um build maior que o dele.
//
// Saiu: `mostrar(nova)` (o aviso discreto: botão na barra do Mac, item no menu, título da janela no Windows) e, uma vez
// por build, `notificar(nova)` (a notificação do sistema "Atualização disponível · Atualizar na Absolute ZRO"). Os dois
// levam a absolutezro://apps/relay?acao=atualizar (central.cjs; sem a central, a página de baixar).
//
// Uns segundos depois de abrir e a cada 6 horas. O build deste app vem de desktop/build-info.json, gravado pelo GitHub
// Actions (scripts/release.mjs build-info). Sem ele (npm run desktop, testes) o build é 0 e nada é conferido. Sem
// Electron aqui: o main.cjs injeta o fetch (da partição do app, com os cookies), o aviso e a pasta de dados.

const fs = require('node:fs')
const path = require('node:path')
const { linkDaCentral } = require('./central.cjs')

const PRODUTO = 'relay'
const PREFS = 'aviso-de-versao.json'
const PRIMEIRA_CONFERENCIA_MS = 15_000
const INTERVALO_MS = 6 * 60 * 60_000

function lerBuildInfo(arquivo) {
  try {
    const j = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
    const build = Number(j.build)
    return {
      build: Number.isInteger(build) && build > 0 ? build : 0,
      commit: typeof j.commit === 'string' ? j.commit : '',
      data: typeof j.data === 'string' ? j.data : '',
    }
  } catch {
    return { build: 0, commit: '', data: '' }
  }
}

/** versao.json do Release → { build, versao } ou null quando não dá para confiar nele. Endereço de arquivo não interessa. */
function lerRemoto(json) {
  if (!json || typeof json !== 'object' || json.ok === false) return null
  const build = Number(json.build)
  if (!Number.isInteger(build) || build <= 0 || build > 1e9) return null
  const versao = typeof json.versao === 'string' && /^\d+\.\d+\.\d+([-.][\w.]+)?$/.test(json.versao) ? json.versao : null
  return { build, versao }
}

/** Tem versão nova para avisar? Build local 0 (desenvolvimento) nunca avisa. */
function temNova(local, remoto) {
  return !!remoto && Number(local) > 0 && remoto.build > Number(local)
}

class AvisoDeVersao {
  /**
   * @param {{ hub: string, build: number, pasta: string, fetch?: typeof fetch,
   *           mostrar?: (nova: {build:number, versao:string|null, link:string} | null) => void,
   *           notificar?: (nova: {build:number, versao:string|null, link:string}) => void,
   *           log?: (...a: unknown[]) => void }} o
   */
  constructor(o) {
    this.o = o
    this.fetch = o.fetch || globalThis.fetch
    this.timers = []
    this.nova = null
  }

  get versaoUrl() {
    return `${this.o.hub}/baixar/app/${PRODUTO}/versao.json`
  }

  /** Para onde o aviso leva: a central, já na ficha deste app. */
  get link() {
    return linkDaCentral(PRODUTO, 'atualizar')
  }

  async #lerRemoto() {
    const r = await this.fetch(this.versaoUrl, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    })
    return r.ok ? lerRemoto(await r.json()) : null
  }

  prefs() {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.o.pasta, PREFS), 'utf8')) || {}
    } catch {
      return {}
    }
  }

  lembrarAvisado(build) {
    try {
      fs.mkdirSync(this.o.pasta, { recursive: true })
      fs.writeFileSync(path.join(this.o.pasta, PREFS), JSON.stringify({ avisadoDoBuild: build }))
    } catch {
      // sem disco: a notificação pode voltar na próxima conferência
    }
  }

  /** Confere. A notificação sai uma vez por build; o aviso discreto fica enquanto houver versão nova. */
  async conferir() {
    if (!(this.o.build > 0)) return { estado: 'desenvolvimento' }
    let remoto = null
    try {
      remoto = await this.#lerRemoto()
    } catch (e) {
      this.o.log?.('[versão] sem resposta:', e && e.message)
      return { estado: 'sem-resposta' }
    }
    if (!remoto) return { estado: 'sem-resposta' }
    if (!temNova(this.o.build, remoto)) {
      if (this.nova) this.o.mostrar?.(null)
      this.nova = null
      return { estado: 'em-dia', remoto }
    }
    const nova = { ...remoto, link: this.link }
    this.nova = nova
    this.o.mostrar?.(nova)
    let notificou = false
    if (remoto.build > (Number(this.prefs().avisadoDoBuild) || 0)) {
      this.lembrarAvisado(remoto.build)
      this.o.notificar?.(nova)
      notificou = true
    }
    return { estado: 'nova', remoto: nova, notificou }
  }

  start() {
    if (!(this.o.build > 0)) return
    const vez = () => this.conferir().catch((e) => this.o.log?.('[versão]', e && e.message))
    this.timers.push(setTimeout(vez, PRIMEIRA_CONFERENCIA_MS))
    this.timers.push(setInterval(vez, INTERVALO_MS))
  }

  stop() {
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
  }
}

module.exports = { AvisoDeVersao, lerBuildInfo, lerRemoto, temNova, PREFS, PRODUTO }
