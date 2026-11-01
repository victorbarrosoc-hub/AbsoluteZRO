// Aviso de versão nova: descobre que saiu um build mais novo e a interface mostra "Atualização disponível ·
// Atualizar na Absolute ZRO". Desde 01/11/2026 quem instala e atualiza os apps de computador é a central Absolute ZRO
// (apps/hub-desktop): o SOBEDESCE não baixa nem instala nada sozinho (o antigo src/updater.js saiu).
//
//  - O build deste app vem de src/build-info.json, gravado pelo GitHub Actions (scripts/build-info.mjs).
//    build 0 = versão de desenvolvimento (npm start, demo, testes): nunca pergunta nada ao site.
//  - O site responde GET <site>/baixar/versao com o build mais novo do Release de teste (o versao.json). Confere ~10 s
//    depois de abrir e a cada 1 h; sem internet ou resposta estranha, fica quieto e tenta na próxima.
//  - Build novo: `status().disponivel`; o aviso discreto (a pílula da barra lateral) usa `nova`, que some com "Depois"
//    (versaoDispensada nos ajustes) até sair um build ainda mais novo. Ajustes mostra sempre.
//  - Notificação do sistema: o evento 'avisar' sai uma vez por build (versaoAvisada nos ajustes); o app de computador
//    (desktop/engine.js → main.js) mostra "Atualização disponível · Atualizar na Absolute ZRO".
//  - Para onde o aviso leva: `link` (absolutezro://apps/sobedesce?acao=atualizar, src/central.js) e, sem a central no
//    computador, `pagina` (https://absolutezro.com/baixar).
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import { cloudUrl } from './config.js'
import { requestJSON } from './net/http.js'
import { linkDaCentral, PAGINA_DA_CENTRAL } from './central.js'

const BUILD_INFO_FILE = new URL('./build-info.json', import.meta.url)
const FIRST_DELAY_MS = 10_000
const EVERY_MS = 60 * 60_000
const TIMEOUT_MS = 15_000

const PLATAFORMAS = { darwin: 'mac', win32: 'windows' }

function cleanInfo(raw) {
  const build = Number(raw?.build)
  if (!Number.isSafeInteger(build) || build < 0) return null
  const commit = typeof raw?.commit === 'string' && /^[0-9a-f]{4,40}$/i.test(raw.commit) ? raw.commit.slice(0, 12).toLowerCase() : ''
  const ms = typeof raw?.data === 'string' ? Date.parse(raw.data) : NaN
  return { build, commit, data: Number.isFinite(ms) ? new Date(ms).toISOString() : null }
}

/** O build deste app. Arquivo ausente ou estragado = versão de desenvolvimento (build 0). */
export function readBuildInfo(file = BUILD_INFO_FILE) {
  try {
    return cleanInfo(JSON.parse(fs.readFileSync(file, 'utf8'))) || { build: 0, commit: '', data: null }
  } catch {
    return { build: 0, commit: '', data: null }
  }
}

/** Resposta do site → { build, commit, data }, ou null se não for uma versão de verdade. Hash e endereço de instalador não interessam mais. */
export function parseRemote(body) {
  const info = cleanInfo(body)
  return info && info.build > 0 ? info : null
}

/**
 * @fires VersionChecker#status  VersionStatus a cada mudança (vira o evento SSE 'versao')
 * @fires VersionChecker#avisar  { build, link } uma vez por build novo (a notificação do sistema)
 *
 * VersionStatus = { atual: { build, commit, data }, ultima: { build, commit, data } | null,
 *   disponivel (tem build mais novo, mesmo dispensado), nova (disponível e não dispensado: mostra a pílula),
 *   dispensada (build dispensado com "Depois"), plataforma: 'mac'|'windows'|null, site, link, pagina,
 *   verificando, verificadaEm (ISO da última resposta boa), falhou (a última tentativa não deu certo) }
 */
export class VersionChecker extends EventEmitter {
  /**
   * @param {{ settings: import('./config.js').Settings, buildInfo?: object, baseUrl?: string, platform?: string,
   *   fetchJSON?: (url: string, opts: { signal: AbortSignal }) => Promise<any>, firstDelayMs?: number,
   *   everyMs?: number, timeoutMs?: number, log?: Function }} opts
   */
  constructor({ settings, buildInfo, baseUrl, platform = process.platform, fetchJSON, firstDelayMs = FIRST_DELAY_MS, everyMs = EVERY_MS, timeoutMs = TIMEOUT_MS, log = () => {} } = {}) {
    super()
    this.settings = settings
    this.atual = cleanInfo(buildInfo) || readBuildInfo()
    this.baseUrl = String(baseUrl || cloudUrl()).replace(/\/+$/, '')
    this.plataforma = PLATAFORMAS[platform] || null
    this.fetchJSON = fetchJSON || ((url, opts) => requestJSON(url, { ...opts, headers: { 'cache-control': 'no-cache' } }))
    this.firstDelayMs = firstDelayMs
    this.everyMs = everyMs
    this.timeoutMs = timeoutMs
    this.log = log
    this.ultima = null
    this.verificadaEm = null
    this.falhou = false
    this.inflight = null
    this.timer = null
    this.stopped = false
    this.onSettings = (_s, changed) => {
      if (changed?.includes('versaoDispensada')) this.#emit()
    }
    settings?.on?.('change', this.onSettings)
  }

  /** Versão de desenvolvimento não confere nada. */
  get enabled() {
    return this.atual.build > 0
  }

  start() {
    if (!this.enabled || this.stopped || this.timer) return
    this.#schedule(this.firstDelayMs)
  }

  stop() {
    this.stopped = true
    clearTimeout(this.timer)
    this.timer = null
    this.settings?.off?.('change', this.onSettings)
  }

  #schedule(ms) {
    clearTimeout(this.timer)
    if (this.stopped) return
    this.timer = setTimeout(async () => {
      this.timer = null
      await this.check().catch(() => {})
      if (!this.stopped && !this.timer) this.#schedule(this.everyMs)
    }, ms)
    this.timer.unref?.()
  }

  /** Pergunta ao site agora. Nunca lança: falha vira `falhou: true` e fica o que já se sabia. */
  check() {
    if (!this.enabled) return Promise.resolve(this.status())
    if (this.inflight) return this.inflight
    this.inflight = this.#run()
    this.#emit() // verificando: true
    return this.inflight
  }

  async #run() {
    try {
      const body = await this.fetchJSON(`${this.baseUrl}/baixar/versao`, { signal: AbortSignal.timeout(this.timeoutMs) })
      const remote = parseRemote(body)
      if (!remote) throw new Error('resposta sem versão')
      this.ultima = remote
      this.verificadaEm = new Date().toISOString()
      this.falhou = false
    } catch (err) {
      this.falhou = true
      this.log('não consegui ver se há versão nova:', err?.code || err?.message || err)
    } finally {
      this.inflight = null
    }
    const st = this.#emit()
    await this.#avisarUmaVez(st)
    return st
  }

  /** A notificação do sistema: uma vez por build (mesmo com "Depois", que só esconde a pílula). */
  async #avisarUmaVez(st) {
    if (!st.disponivel) return
    const avisada = Number(this.settings?.get?.().versaoAvisada) || 0
    if (st.ultima.build <= avisada) return
    try {
      await this.settings?.update?.({ versaoAvisada: st.ultima.build })
    } catch {
      // sem gravar: pode avisar de novo na próxima conferência
    }
    this.emit('avisar', { build: st.ultima.build, link: st.link })
  }

  /** "Depois": esconde a pílula deste build (o padrão é o mais novo conhecido). Lança Error com `status` se não fizer sentido. */
  async dismiss(build = this.ultima?.build) {
    const b = Number(build)
    if (!this.ultima) throw Object.assign(new Error('Não há versão nova para deixar para depois.'), { status: 409 })
    if (!Number.isSafeInteger(b) || b <= 0 || b > this.ultima.build) throw Object.assign(new Error('Versão inválida.'), { status: 400 })
    const atual = Number(this.settings.get().versaoDispensada) || 0
    if (b > atual) await this.settings.update({ versaoDispensada: b })
    return this.#emit()
  }

  status() {
    const dispensada = Number(this.settings?.get?.().versaoDispensada) || 0
    const disponivel = this.enabled && !!this.ultima && this.ultima.build > this.atual.build
    return {
      atual: { ...this.atual },
      ultima: this.ultima ? { ...this.ultima } : null,
      disponivel,
      nova: disponivel && this.ultima.build > dispensada,
      dispensada,
      plataforma: this.plataforma,
      site: this.baseUrl,
      link: linkDaCentral('sobedesce', 'atualizar'),
      pagina: PAGINA_DA_CENTRAL,
      verificando: !!this.inflight,
      verificadaEm: this.verificadaEm,
      falhou: this.falhou,
    }
  }

  #emit() {
    const st = this.status()
    this.emit('status', st)
    return st
  }
}
