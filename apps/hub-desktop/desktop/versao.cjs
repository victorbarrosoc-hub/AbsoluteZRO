// Aviso de versão nova (no espírito do Synquei, sem a troca automática): o app confere o site do HUB
// (GET <hub>/baixar/hub/versao) uns segundos depois de abrir e a cada 6 horas. Saiu um build maior que o deste app:
// avisa uma vez por build, com "Baixar" (abre o instalador no navegador) e "Depois". A pessoa instala por cima;
// o login e os dados continuam. Não há atualização automática: os instaladores não têm assinatura da Apple nem da
// Microsoft, e trocar o app sozinho sem isso não é seguro.
//
// O build deste app vem de desktop/build-info.json, gravado pelo GitHub Actions (scripts/release.mjs build-info).
// Sem ele (npm run desktop, testes) o build é 0 e nada é conferido. Sem Electron aqui: o main.cjs injeta fetch,
// o aviso e a pasta de dados.

const fs = require('node:fs')
const path = require('node:path')

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

/** Resposta do site → { build, versao } ou null quando não dá para confiar nela. */
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

/** Compara "1.2.3" com "1.10.0" (só para mostrar; quem decide é o número do build). */
function compararVersao(a, b) {
  const pa = String(a || '0')
    .split(/[.-]/)
    .map((x) => parseInt(x, 10) || 0)
  const pb = String(b || '0')
    .split(/[.-]/)
    .map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}

class AvisoDeVersao {
  /**
   * @param {{ hub: string, plataforma: 'mac'|'windows'|'linux', build: number, pasta: string,
   *           fetch?: typeof fetch, avisar: (nova: {build:number, versao:string|null, baixarUrl:string}) => Promise<'baixar'|'depois'>,
   *           abrir: (url: string) => void, log?: (...a: unknown[]) => void }} o
   */
  constructor(o) {
    this.o = o
    this.fetch = o.fetch || globalThis.fetch
    this.timers = []
    this.ultima = null
    this.avisando = false
  }

  get baixarUrl() {
    const p = this.o.plataforma === 'mac' ? 'mac' : 'windows'
    return `${this.o.hub}/baixar/hub/${p}`
  }

  prefs() {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.o.pasta, PREFS), 'utf8')) || {}
    } catch {
      return {}
    }
  }

  lembrarDepois(build) {
    try {
      fs.mkdirSync(this.o.pasta, { recursive: true })
      fs.writeFileSync(path.join(this.o.pasta, PREFS), JSON.stringify({ depoisDoBuild: build }))
    } catch {
      // sem disco: só avisa de novo na próxima conferência
    }
  }

  /** Confere o site. manual = a pessoa pediu pelo menu (avisa mesmo se ela tinha dito "Depois"). */
  async conferir({ manual = false } = {}) {
    if (!(this.o.build > 0)) return { estado: 'desenvolvimento' }
    let remoto = null
    try {
      const r = await this.fetch(`${this.o.hub}/baixar/hub/versao`, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      })
      remoto = r.ok ? lerRemoto(await r.json()) : null
    } catch (e) {
      this.o.log?.('[versão] sem resposta do site:', e && e.message)
      return { estado: 'sem-resposta' }
    }
    if (!remoto) return { estado: 'sem-resposta' }
    this.ultima = remoto
    if (!temNova(this.o.build, remoto)) return { estado: 'em-dia', remoto }
    if (!manual && this.prefs().depoisDoBuild === remoto.build) return { estado: 'adiada', remoto }
    if (this.avisando) return { estado: 'avisando', remoto }
    this.avisando = true
    let escolha
    try {
      escolha = await this.o.avisar({ ...remoto, baixarUrl: this.baixarUrl })
    } finally {
      this.avisando = false
    }
    if (escolha === 'baixar') this.o.abrir(this.baixarUrl)
    else this.lembrarDepois(remoto.build)
    return { estado: 'nova', remoto, escolha }
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

module.exports = { AvisoDeVersao, lerBuildInfo, lerRemoto, temNova, compararVersao, PREFS }
