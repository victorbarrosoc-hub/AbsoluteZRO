// Aviso "Nova versão do Relay": o mesmo do Absolute ZRO para computador (apps/hub-desktop/desktop/versao.cjs), com
// o versao.json do Release "Relay · versão de teste" (tag relay-versao-de-teste). O app pede pela Absolute ZRO,
// GET <HUB>/baixar/app/relay/versao.json, com os cookies do login: a rota confere o gate de lançamento (canal
// download) e redireciona para o arquivo do Release. Enquanto o Relay está fechado, só quem está na lista de acesso
// recebe o aviso; para os outros a rota responde 404 e nada aparece.
//
// Uns segundos depois de abrir e a cada 6 horas. Saiu um build maior que o deste app: avisa uma vez por build, com
// "Atualizar" (baixa por <HUB>/baixar/app/relay/<arquivo>, confere o SHA-256, fecha e abre já na versão nova, pelo
// atualizador.cjs compartilhado) e "Depois". Instalado e mantido pela central do Absolute ZRO (gerenciado.cjs): o
// aviso fica quieto, quem atualiza é a central.
//
// O build deste app vem de desktop/build-info.json, gravado pelo GitHub Actions (scripts/release.mjs build-info). Sem
// ele (npm run desktop, testes) o build é 0 e nada é conferido. Sem Electron aqui: o main.cjs injeta o fetch (da
// partição do app, com os cookies), o aviso e a pasta de dados.

const fs = require('node:fs')
const path = require('node:path')

const PRODUTO = 'relay'
const PREFS = 'aviso-de-versao.json'
const PRIMEIRA_CONFERENCIA_MS = 15_000
const INTERVALO_MS = 6 * 60 * 60_000
const NOME_ARQUIVO = /^Relay-\d+\.\d+\.\d+-b\d+-(mac-universal\.dmg|windows-setup\.exe)$/

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

/** versao.json do Release → { build, versao, sha256*, arquivo* } ou null quando não dá para confiar nele. */
function lerRemoto(json) {
  if (!json || typeof json !== 'object' || json.ok === false) return null
  const build = Number(json.build)
  if (!Number.isInteger(build) || build <= 0 || build > 1e9) return null
  const versao = typeof json.versao === 'string' && /^\d+\.\d+\.\d+([-.][\w.]+)?$/.test(json.versao) ? json.versao : null
  const sha = (v) => (typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v) ? v.toLowerCase() : null)
  // só nomes do nosso padrão e do mesmo build: nada de caminho ou endereço vindo de fora
  const arquivo = (v) => (typeof v === 'string' && NOME_ARQUIVO.test(v) && v.includes(`-b${build}-`) ? v : null)
  return {
    build,
    versao,
    sha256Mac: sha(json.sha256Mac),
    sha256Windows: sha(json.sha256Windows),
    arquivoMac: arquivo(json.arquivoMac),
    arquivoWindows: arquivo(json.arquivoWindows),
  }
}

/** Tem versão nova para avisar? Build local 0 (desenvolvimento) nunca avisa. */
function temNova(local, remoto) {
  return !!remoto && Number(local) > 0 && remoto.build > Number(local)
}

class AvisoDeVersao {
  /**
   * @param {{ hub: string, plataforma: 'mac'|'windows'|'linux', build: number, pasta: string,
   *           fetch?: typeof fetch, gerenciado?: () => boolean,
   *           avisar: (nova: {build:number, versao:string|null, baixarUrl:string}) => Promise<'atualizar'|'baixar'|'depois'>,
   *           abrir: (url: string) => void, atualizar?: (nova: {build:number, versao:string|null, url:string, sha256:string|null}) => void,
   *           log?: (...a: unknown[]) => void }} o
   */
  constructor(o) {
    this.o = o
    this.fetch = o.fetch || globalThis.fetch
    this.timers = []
    this.ultima = null
    this.avisando = false
  }

  get base() {
    return `${this.o.hub}/baixar/app/${PRODUTO}`
  }

  get versaoUrl() {
    return `${this.base}/versao.json`
  }

  /** Página de downloads da Absolute ZRO (o "Baixar" abre no navegador; lá a pessoa vê o instalador do sistema dela). */
  get baixarUrl() {
    return `${this.o.hub}/baixar#${PRODUTO}`
  }

  /** O que o atualizador precisa: o arquivo exato deste build e o SHA-256 da plataforma. */
  paraInstalar(remoto) {
    const mac = this.o.plataforma === 'mac'
    const arquivo = mac ? remoto.arquivoMac : remoto.arquivoWindows
    const sha256 = mac ? remoto.sha256Mac : remoto.sha256Windows
    return { build: remoto.build, versao: remoto.versao, url: arquivo ? `${this.base}/${arquivo}` : null, sha256: sha256 || null }
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

  /** Pergunta de novo (o atualizador usa quando o arquivo baixado não bate: pode ter saído um build novo). */
  async remoto() {
    const remoto = await this.#lerRemoto()
    return remoto ? this.paraInstalar(remoto) : null
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

  /** Confere. manual = a pessoa pediu pelo menu (avisa mesmo se ela tinha dito "Depois"). */
  async conferir({ manual = false } = {}) {
    if (!(this.o.build > 0)) return { estado: 'desenvolvimento' }
    if (this.o.gerenciado && this.o.gerenciado()) return { estado: 'gerenciado' }
    let remoto = null
    try {
      remoto = await this.#lerRemoto()
    } catch (e) {
      this.o.log?.('[versão] sem resposta:', e && e.message)
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
    if (escolha === 'atualizar' && this.o.atualizar) this.o.atualizar(this.paraInstalar(remoto))
    else if (escolha === 'baixar') this.o.abrir(this.baixarUrl)
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

module.exports = { AvisoDeVersao, lerBuildInfo, lerRemoto, temNova, PREFS, PRODUTO }
