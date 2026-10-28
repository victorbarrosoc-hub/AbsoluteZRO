// Atualização das ferramentas em segundo plano (pedido do titular, 28/10/2026): o Absolute ZRO confere o catálogo do
// HUB ao abrir e a cada INTERVALO_MS. Ferramenta instalada com versão nova:
//
//   1. baixa e confere o SHA-256 sem incomodar (central.prebaixar);
//   2. fechada: instala na hora e avisa com uma notificação curta ("SOBEDESCE atualizado");
//   3. aberta: fica "atualiza ao fechar" (notificação uma vez, item "Reiniciar e atualizar" na bandeja). A agenda
//      espiona a cada ESPERA_MS e instala assim que a ferramenta fechar. "Reiniciar e atualizar" pede para ela sair
//      (do jeito educado; ela pode perguntar antes), instala e abre de novo. Nunca força o fechamento.
//
// Só mexe no que a central pode trocar sozinha (central.gerenciavel) e grava essa lista para as ferramentas não se
// atualizarem por conta própria ao mesmo tempo (gerenciados.cjs). O catálogo já vem com o gate de lançamento do HUB:
// produto fechado não aparece, então nunca entra aqui.
//
// Sem Electron: relógio, notificação e a central entram por parâmetro (test/agenda.test.mjs).

const { EventEmitter } = require('node:events')

const PRIMEIRA_MS = 20_000
const INTERVALO_MS = 4 * 60 * 60_000
const ESPERA_MS = 2 * 60_000
const FECHAR_MS = 60_000
const PASSO_FECHAR_MS = 1_000

/** O que fazer com uma ferramenta agora: 'nada', 'instalar' (está fechada) ou 'esperar' (está aberta). */
function decidir(situacao, aberta) {
  if (!situacao || !situacao.instalado || !situacao.atualizar || !situacao.gerenciavel || !situacao.disponivel) return 'nada'
  return aberta ? 'esperar' : 'instalar'
}

/** Quando conferir de novo: INTERVALO_MS depois da última, nunca antes de `minimoMs` a partir de agora. */
function proximaConferencia(ultima, agora, intervalo = INTERVALO_MS, minimoMs = 60_000) {
  if (!Number.isFinite(ultima)) return minimoMs
  return Math.max(minimoMs, ultima + intervalo - agora)
}

const relogioDoSistema = {
  agora: () => Date.now(),
  depois: (ms, fn) => {
    const t = setTimeout(fn, ms)
    if (t.unref) t.unref()
    return t
  },
  cancelar: (t) => clearTimeout(t),
  esperar: (ms) => new Promise((ok) => setTimeout(ok, ms)),
}

/**
 * Evento 'mudou' com estado() a cada mudança. estado() = { apps: [{ id, nome, versao }] (instaladas),
 * pendentes: [{ id, nome, versao, fase: 'baixando'|'ao-fechar'|'fechando'|'instalando'|'erro', erro? }],
 * procurando, conferidaEm }
 */
class AgendaDeApps extends EventEmitter {
  constructor({
    central,
    notificar = () => {},
    marcarGerenciados = () => {},
    relogio = relogioDoSistema,
    log = () => {},
    primeiraMs = PRIMEIRA_MS,
    intervaloMs = INTERVALO_MS,
    esperaMs = ESPERA_MS,
    fecharMs = FECHAR_MS,
  }) {
    super()
    this.central = central
    this.notificar = notificar
    this.marcarGerenciados = marcarGerenciados
    this.relogio = relogio
    this.log = log
    this.primeiraMs = primeiraMs
    this.intervaloMs = intervaloMs
    this.esperaMs = esperaMs
    this.fecharMs = fecharMs
    this.apps = []
    this.pendentes = new Map()
    this.procurando = null
    this.conferidaEm = null
    this.timer = null
    this.vigia = null
    this.parada = false
  }

  estado() {
    return {
      apps: this.apps.map((a) => ({ ...a })),
      pendentes: [...this.pendentes.values()].map((p) => ({ ...p })),
      procurando: !!this.procurando,
      conferidaEm: this.conferidaEm,
    }
  }

  /** Situação de uma ferramenta para a página Downloads: { fase, versao } ou null. */
  situacao(id) {
    const p = this.pendentes.get(id)
    return p ? { fase: p.fase, versao: p.versao } : null
  }

  #mudou() {
    this.emit('mudou', this.estado())
  }

  iniciar() {
    if (this.timer || this.parada) return
    this.#agendar(this.primeiraMs)
  }

  parar() {
    this.parada = true
    if (this.timer) this.relogio.cancelar(this.timer)
    if (this.vigia) this.relogio.cancelar(this.vigia)
    this.timer = this.vigia = null
  }

  #agendar(ms) {
    if (this.parada) return
    if (this.timer) this.relogio.cancelar(this.timer)
    this.timer = this.relogio.depois(ms, async () => {
      this.timer = null
      await this.conferir().catch(() => {})
      this.#agendar(proximaConferencia(this.ultimaMs, this.relogio.agora(), this.intervaloMs))
    })
  }

  /** Confere o catálogo agora e cuida de cada ferramenta com versão nova. Nunca lança. Devolve o estado. */
  conferir() {
    if (this.procurando) return this.procurando
    this.procurando = (async () => {
      this.#mudou()
      try {
        await this.central.carregarCatalogo()
        const lista = await this.central.listar()
        this.ultimaMs = this.relogio.agora()
        this.conferidaEm = new Date(this.ultimaMs).toISOString()
        this.#lerLista(lista)
        for (const s of lista) await this.#cuidar(s)
      } catch (e) {
        this.log('[apps] não deu para conferir:', e && e.message)
      } finally {
        this.procurando = null
        this.#mudou()
      }
      return this.estado()
    })()
    return this.procurando
  }

  /** Lê de novo só o que está instalado (depois de instalar ou remover pela página). Nunca lança. */
  async relistar() {
    try {
      this.#lerLista(await this.central.listar())
    } catch (e) {
      this.log('[apps] não deu para ler os apps:', e && e.message)
    }
    this.#mudou()
  }

  #lerLista(lista) {
    this.apps = lista.filter((s) => s.instalado).map((s) => ({ id: s.id, nome: s.nome, versao: s.instalado.versao || null }))
    this.marcarGerenciados(lista.filter((s) => s.instalado && s.gerenciavel).map((s) => s.id))
    // o que já não precisa (atualizou por outro caminho ou foi removido) sai da lista de pendentes
    for (const id of [...this.pendentes.keys()]) {
      const s = lista.find((x) => x.id === id)
      const p = this.pendentes.get(id)
      if ((!s || !s.atualizar || !s.instalado) && p.fase !== 'instalando' && p.fase !== 'fechando') this.pendentes.delete(id)
    }
  }

  async #cuidar(s) {
    if (decidir(s, false) === 'nada') return
    const atual = this.pendentes.get(s.id)
    if (atual && ['baixando', 'instalando', 'fechando'].includes(atual.fase)) return
    // já baixada e esperando o app fechar: só confere de novo se ele fechou (sem baixar outra vez)
    if (atual && atual.fase === 'ao-fechar' && atual.versao === s.disponivel.versao) {
      await this.#tentarInstalar(s.id)
      return
    }
    const p = {
      id: s.id,
      nome: s.nome,
      versao: s.disponivel.versao,
      fase: 'baixando',
      avisado: !!(atual && atual.avisado && atual.versao === s.disponivel.versao),
    }
    this.pendentes.set(s.id, p)
    this.#mudou()
    try {
      await this.central.prebaixar(s.id)
    } catch (e) {
      // 'ocupado': a pessoa está instalando pela página agora; fica para a próxima conferência
      if (e && e.codigo === 'ocupado') this.pendentes.delete(s.id)
      else Object.assign(p, { fase: 'erro', erro: (e && e.message) || 'Não deu para baixar agora.' })
      this.#mudou()
      return
    }
    await this.#tentarInstalar(s.id)
  }

  /** Instala se a ferramenta estiver fechada; senão deixa "ao fechar" e vigia. Devolve true se instalou. */
  async #tentarInstalar(id) {
    const p = this.pendentes.get(id)
    if (!p) return false
    const aberta = await this.central.aberto(id).catch(() => false)
    if (aberta) {
      p.fase = 'ao-fechar'
      if (!p.avisado) {
        p.avisado = true
        this.notificar({ id, titulo: `${p.nome} ${p.versao} está pronto`, corpo: 'Atualiza quando você fechar o app.' })
      }
      this.#mudou()
      this.#vigiar()
      return false
    }
    p.fase = 'instalando'
    this.#mudou()
    try {
      await this.central.instalar(id)
    } catch (e) {
      if (e && e.codigo === 'aberto') {
        p.fase = 'ao-fechar'
        this.#vigiar()
      } else Object.assign(p, { fase: 'erro', erro: (e && e.message) || 'Não deu para instalar agora.' })
      this.#mudou()
      return false
    }
    this.pendentes.delete(id)
    this.notificar({ id, titulo: `${p.nome} atualizado`, corpo: `Versão ${p.versao}.` })
    await this.relistar()
    return true
  }

  /** Enquanto houver ferramenta "ao fechar", confere a cada esperaMs se ela fechou. */
  #vigiar() {
    if (this.vigia || this.parada) return
    this.vigia = this.relogio.depois(this.esperaMs, async () => {
      this.vigia = null
      for (const p of [...this.pendentes.values()]) if (p.fase === 'ao-fechar') await this.#tentarInstalar(p.id)
      if ([...this.pendentes.values()].some((p) => p.fase === 'ao-fechar')) this.#vigiar()
    })
  }

  /**
   * "Reiniciar e atualizar": pede para a ferramenta sair, espera até fecharMs, instala e abre de novo. Se ela não
   * fechar (a pessoa cancelou, por exemplo), volta para "ao fechar". Devolve true se atualizou.
   */
  async reiniciarEAtualizar(id) {
    const p = this.pendentes.get(id)
    if (!p || p.fase !== 'ao-fechar') return false
    p.fase = 'fechando'
    this.#mudou()
    await this.central.fechar(id).catch(() => {})
    const limite = this.relogio.agora() + this.fecharMs
    let aberta = true
    while (this.relogio.agora() < limite) {
      aberta = await this.central.aberto(id).catch(() => false)
      if (!aberta) break
      await this.relogio.esperar(PASSO_FECHAR_MS)
    }
    if (aberta) {
      p.fase = 'ao-fechar'
      this.#mudou()
      this.#vigiar()
      return false
    }
    p.fase = 'ao-fechar' // #tentarInstalar decide de novo, já com a ferramenta fechada
    const ok = await this.#tentarInstalar(id)
    if (ok) await this.central.abrir(id).catch(() => {})
    return ok
  }

  /**
   * "Atualizar" pedido pela página com a ferramenta aberta: baixa e confere já, e instala quando ela fechar.
   * Devolve a situação ({ fase, versao }) ou null se a central não pode atualizar esta instalação.
   */
  async atualizarAoFechar(id) {
    const s = (await this.central.listar()).find((x) => x.id === id)
    if (decidir(s, false) === 'nada') return null
    if (!this.pendentes.has(id) || this.pendentes.get(id).fase === 'erro') await this.#cuidar(s)
    return this.situacao(id)
  }

  /** "Atualizar tudo": instala o que estiver fechado, reinicia o que estiver aberto e tenta de novo o que deu erro. */
  async atualizarTudo() {
    for (const p of [...this.pendentes.values()]) {
      if (p.fase === 'ao-fechar') await this.reiniciarEAtualizar(p.id)
      else if (p.fase === 'erro') {
        p.fase = 'baixando'
        this.#mudou()
        try {
          await this.central.prebaixar(p.id)
          await this.#tentarInstalar(p.id)
        } catch (e) {
          Object.assign(p, { fase: 'erro', erro: (e && e.message) || 'Não deu para baixar agora.' })
          this.#mudou()
        }
      }
    }
    return this.estado()
  }
}

module.exports = { AgendaDeApps, decidir, proximaConferencia, PRIMEIRA_MS, INTERVALO_MS, ESPERA_MS, FECHAR_MS }
