// Aviso "Atualização disponível" do Synquei para computador. Desde 01/11/2026 quem instala e atualiza os apps de
// computador é a central Absolute ZRO (apps/hub-desktop): este app não baixa nem instala nada (o antigo
// desktop/atualizador.cjs saiu). Ele só confere o site, como antes:
//
//  - GET <site>/baixar/versao (~10 s depois de abrir e a cada 1 h) devolve o build mais novo; o build deste app vem de
//    desktop/build-info.json, gravado pelo GitHub Actions. Sem ele (npm run desktop, testes) o build é 0 e nada é
//    conferido.
//  - Saiu um build mais novo: `status().nova` liga o aviso discreto na barra lateral e em Ajustes, e o evento 'avisar'
//    sai uma vez por build (a notificação do sistema, no main.cjs). Os dois levam a
//    absolutezro://apps/synquei?acao=atualizar (central.cjs; sem a central, a página de baixar).
//
// Nada aqui importa o Electron: o processo principal passa a pasta de dados e o fetch; os testes trocam o site.

const fs = require('node:fs')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { linkDaCentral, PAGINA_DA_CENTRAL } = require('./central.cjs')

const PRODUTO = 'synquei'
const SITE = (process.env.SYNQUEI_SITE || 'https://synquei.vercel.app').replace(/\/+$/, '')
const PREFS_FILE = 'atualizacao.json'
const PRIMEIRA_MS = 10_000
const INTERVALO_MS = 60 * 60_000
const TEMPO_MS = 15_000

function cleanInfo(raw) {
  const build = Number(raw && raw.build)
  if (!Number.isSafeInteger(build) || build < 0) return null
  const commit = raw && typeof raw.commit === 'string' && /^[0-9a-f]{4,40}$/i.test(raw.commit) ? raw.commit.slice(0, 12).toLowerCase() : ''
  const ms = raw && typeof raw.data === 'string' ? Date.parse(raw.data) : NaN
  return { build, commit, data: Number.isFinite(ms) ? new Date(ms).toISOString() : null }
}

/** O build deste app. Arquivo ausente ou estragado = versão de desenvolvimento (build 0). */
function readBuildInfo(file) {
  try {
    return cleanInfo(JSON.parse(fs.readFileSync(file, 'utf8'))) || { build: 0, commit: '', data: null }
  } catch {
    return { build: 0, commit: '', data: null }
  }
}

/** Resposta de /baixar/versao → { build, commit, data }, ou null. Endereço e hash de instalador não interessam mais. */
function parseRemote(body) {
  const info = cleanInfo(body)
  return info && info.build > 0 ? info : null
}

/**
 * @fires AvisoDeVersao#change  status() a cada mudança (vai para a página)
 * @fires AvisoDeVersao#avisar  { build, link } uma vez por build novo (a notificação do sistema)
 */
class AvisoDeVersao extends EventEmitter {
  /**
   * @param {{ stateDir: string, buildInfo?: object, site?: string, fetchJSON?: (url: string, o: { signal: AbortSignal }) => Promise<any>,
   *   firstDelayMs?: number, everyMs?: number, timeoutMs?: number, log?: Function }} o
   */
  constructor({ stateDir, buildInfo, site = SITE, fetchJSON, firstDelayMs = PRIMEIRA_MS, everyMs = INTERVALO_MS, timeoutMs = TEMPO_MS, log = () => {} } = {}) {
    super()
    this.stateDir = stateDir
    this.atual = cleanInfo(buildInfo) || { build: 0, commit: '', data: null }
    this.site = String(site).replace(/\/+$/, '')
    this.fetchJSON =
      fetchJSON ||
      (async (url, o) => {
        const r = await fetch(url, { ...o, headers: { accept: 'application/json', 'cache-control': 'no-cache' } })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
    this.firstDelayMs = firstDelayMs
    this.everyMs = everyMs
    this.timeoutMs = timeoutMs
    this.log = log
    this.ultima = null
    this.verificadaEm = null
    this.falhou = false
    this.inflight = null
    this.timers = []
  }

  get enabled() {
    return this.atual.build > 0
  }

  start() {
    if (!this.enabled || this.timers.length) return
    const vez = () => this.check().catch(() => {})
    const t1 = setTimeout(vez, this.firstDelayMs)
    const t2 = setInterval(vez, this.everyMs)
    t1.unref?.()
    t2.unref?.()
    this.timers.push(t1, t2)
  }

  stop() {
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
  }

  #prefs() {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.stateDir, PREFS_FILE), 'utf8')) || {}
    } catch {
      return {}
    }
  }

  #lembrarAvisado(build) {
    try {
      fs.mkdirSync(this.stateDir, { recursive: true })
      fs.writeFileSync(path.join(this.stateDir, PREFS_FILE), JSON.stringify({ avisadoDoBuild: build }))
    } catch {
      // sem disco: a notificação pode voltar na próxima conferência
    }
  }

  /** Pergunta ao site agora. Nunca lança: falha vira `falhou: true` e fica o que já se sabia. */
  check() {
    if (!this.enabled) return Promise.resolve(this.status())
    if (this.inflight) return this.inflight
    this.inflight = this.#run()
    this.emit('change', this.status())
    return this.inflight
  }

  async #run() {
    try {
      const remoto = parseRemote(await this.fetchJSON(`${this.site}/baixar/versao`, { signal: AbortSignal.timeout(this.timeoutMs) }))
      if (!remoto) throw new Error('resposta sem versão')
      this.ultima = remoto
      this.verificadaEm = new Date().toISOString()
      this.falhou = false
    } catch (err) {
      this.falhou = true
      this.log('não consegui ver se há versão nova:', (err && (err.code || err.message)) || err)
    } finally {
      this.inflight = null
    }
    const st = this.status()
    this.emit('change', st)
    if (st.nova && st.ultima.build > (Number(this.#prefs().avisadoDoBuild) || 0)) {
      this.#lembrarAvisado(st.ultima.build)
      this.emit('avisar', { build: st.ultima.build, link: st.link })
    }
    return st
  }

  status() {
    return {
      atual: { ...this.atual },
      ultima: this.ultima ? { ...this.ultima } : null,
      nova: this.enabled && !!this.ultima && this.ultima.build > this.atual.build,
      link: linkDaCentral(PRODUTO, 'atualizar'),
      pagina: PAGINA_DA_CENTRAL,
      verificando: !!this.inflight,
      verificadaEm: this.verificadaEm,
      falhou: this.falhou,
    }
  }
}

module.exports = { AvisoDeVersao, readBuildInfo, parseRemote, PRODUTO, PREFS_FILE }
