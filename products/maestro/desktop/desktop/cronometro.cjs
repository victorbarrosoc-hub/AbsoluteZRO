// O cronômetro do app de computador: lê e muda o tempo pelas MESMAS rotas do site (`GET`/`POST /api/tempo`), com a
// sessão que o app já tem (os cookies da partição persist:maestro, pelo fetch da sessão no processo principal: nenhum
// token passa pela página), e funciona com a janela fechada enquanto o app estiver aberto (bandeja/barra de menus).
//
// - Relógio local a cada segundo (o texto da barra e o Pomodoro), contando do `inicio` gravado pelo banco + o desvio do
//   relógio do servidor; revalida no servidor a cada 30 s, na volta do sistema (acordar, desbloquear) e logo depois de
//   a janela mudar o tempo (main.cjs vê o POST da página e chama `atualizar`).
// - O Pomodoro e o parado moram aqui (pomodoro.cjs, ocioso.cjs) e o site no app só mostra o que vem por `avisarSite`.
//
// Sem Electron: o main.cjs injeta o fetch, a ociosidade do sistema, as notificações e a ponte com a página.

const fs = require('node:fs')
const path = require('node:path')
const tempo = require('./tempo.cjs')
const pomodoro = require('./pomodoro.cjs')
const ocioso = require('./ocioso.cjs')

const ARQUIVO = 'cronometro.json'
const INTERVALO_MS = 30_000
const OCIOSO_MS = 5_000

class Cronometro {
  /**
   * @param {{ base: string, fetch: (url: string, init?: object) => Promise<Response>, pasta?: string,
   *           agoraLocal?: () => number, ociosoMs?: () => number, aoMudar?: () => void,
   *           notificar?: (n: {titulo: string, corpo: string, motivo: string, acoes?: string[]}) => void,
   *           avisarSite?: (canal: string, dados: unknown) => void, log?: (...a: unknown[]) => void }} o
   */
  constructor(o) {
    this.o = o
    this.agoraLocal = o.agoraLocal || (() => Date.now())
    this.estado = null
    this.situacao = 'carregando'
    this.parado = null
    this.ocioso = ocioso.novo()
    this.timers = []
    this.pedindo = null
    const salvo = this.ler()
    this.pomodoro = pomodoro.lerPomodoro(salvo.pomodoro)
    this.ajustes = tempo.lerAjustes(salvo.ajustes)
  }

  /* ───── guardado (userData/cronometro.json: o Pomodoro e os ajustes deste computador) ───── */
  ler() {
    if (!this.o.pasta) return {}
    try {
      return JSON.parse(fs.readFileSync(path.join(this.o.pasta, ARQUIVO), 'utf8')) || {}
    } catch {
      return {}
    }
  }
  gravar() {
    if (!this.o.pasta) return
    try {
      fs.writeFileSync(path.join(this.o.pasta, ARQUIVO), JSON.stringify({ pomodoro: this.pomodoro, ajustes: this.ajustes }))
    } catch (e) {
      this.log('[cronometro] não gravou', e && e.message)
    }
  }
  log(...a) {
    if (this.o.log) this.o.log(...a)
  }

  /** O agora no relógio do servidor. */
  agora() {
    return this.agoraLocal() + (this.estado ? this.estado.desvio : 0)
  }

  mudou() {
    if (this.o.aoMudar) this.o.aoMudar()
  }
  site(canal, dados) {
    if (this.o.avisarSite) this.o.avisarSite(canal, dados)
  }

  start() {
    this.stop()
    this.timers.push(setInterval(() => this.tick(), 1000))
    this.timers.push(setInterval(() => this.conferirOcioso(), OCIOSO_MS))
    this.timers.push(setInterval(() => this.atualizar().catch(() => {}), INTERVALO_MS))
    return this.atualizar().catch(() => {})
  }
  stop() {
    for (const t of this.timers) clearInterval(t)
    this.timers = []
  }

  /* ───── o servidor ───── */

  async pedir(init) {
    const ida = this.agoraLocal()
    const r = await this.o.fetch(`${this.o.base}/api/tempo`, {
      cache: 'no-store',
      credentials: 'include',
      ...init,
      headers: { accept: 'application/json', ...(init && init.body ? { 'content-type': 'application/json', origin: this.o.base } : {}) },
    })
    const corpo = await r.json().catch(() => null)
    return { status: r.status, corpo, ida, volta: this.agoraLocal() }
  }

  /** Lê o estado (GET). Sem sessão, sem acesso, só leitura e sem conexão viram a situação que o menu mostra. */
  atualizar() {
    if (this.pedindo) return this.pedindo
    this.pedindo = (async () => {
      try {
        const r = await this.pedir({ method: 'GET' })
        if (r.status === 401) return this.adotarSituacao('sem-sessao')
        if (r.status === 403) return this.adotarSituacao('sem-acesso')
        if (r.status !== 200) return this.adotarSituacao('sem-conexao')
        const e = tempo.lerEstado(r.corpo, r.ida, r.volta)
        if (!e) return this.adotarSituacao('sem-conexao')
        this.adotar(e, e.pode ? 'ok' : 'leitura')
      } catch {
        this.adotarSituacao('sem-conexao')
      } finally {
        this.pedindo = null
      }
    })()
    return this.pedindo
  }

  adotarSituacao(s) {
    if (s !== 'sem-conexao') this.estado = null
    if (this.situacao !== s) {
      this.situacao = s
      this.mudou()
    }
  }

  adotar(e, situacao = 'ok') {
    const antes = this.estado
    this.estado = e
    this.situacao = situacao
    const p = pomodoro.observar(this.pomodoro, antes, e, this.agora())
    this.trocarPomodoro(p)
    // o parado pendente vale para a sessão de quando ficou parado; mudou a sessão, a pergunta perdeu o sentido
    if (this.parado && (!e.rodando || e.rodando.id !== this.parado.registro)) this.trocarParado(null)
    this.mudou()
  }

  /** Uma operação da rota (iniciar, pausar, parado), como o site: a resposta traz o estado inteiro. */
  async operar(corpo) {
    try {
      const r = await this.pedir({ method: 'POST', body: JSON.stringify(corpo) })
      if (r.status === 401) {
        this.adotarSituacao('sem-sessao')
        return false
      }
      if (r.status >= 200 && r.status < 300 && r.corpo && r.corpo.estado) {
        const e = tempo.lerEstado({ ...r.corpo.estado, pode: true }, r.ida, r.volta)
        if (e) this.adotar(e)
        this.site('mudou', null)
        return true
      }
      const msg = r.corpo && typeof r.corpo.mensagem === 'string' ? r.corpo.mensagem.slice(0, 160) : 'Não deu agora. Tente de novo.'
      this.notificar('O tempo não mudou', msg, 'erro')
      await this.atualizar()
      return false
    } catch {
      this.notificar('Sem conexão', 'O tempo não foi gravado.', 'erro')
      await this.atualizar()
      return false
    }
  }

  notificar(titulo, corpo, motivo, acoes) {
    if (this.o.notificar) this.o.notificar({ titulo, corpo, motivo, acoes })
  }

  /* ───── o relógio, o Pomodoro e o parado ───── */

  /** Um segundo: o Pomodoro anda e a barra redesenha. Devolve a gravação pendente (o teste espera por ela). */
  tick() {
    if (this.situacao !== 'ok' || !this.estado) {
      this.mudou()
      return Promise.resolve()
    }
    const { p, efeitos } = pomodoro.passo(this.pomodoro, this.estado.rodando, this.agora())
    this.trocarPomodoro(p)
    const pendentes = []
    for (const ef of efeitos) {
      if (ef.tipo === 'pausar' && this.estado.rodando) pendentes.push(this.operar({ op: 'pausar' }))
      else if (ef.tipo === 'notificar') this.notificar(ef.titulo, ef.corpo, 'pomodoro')
    }
    this.mudou()
    return Promise.all(pendentes)
  }

  trocarPomodoro(p) {
    if (JSON.stringify(p) === JSON.stringify(this.pomodoro)) return
    this.pomodoro = p
    this.gravar()
    this.site('pomodoro', p)
  }

  trocarParado(p) {
    this.parado = p
    this.site('parado', p)
    this.mudou()
  }

  /** A ociosidade do sistema (powerMonitor), a cada poucos segundos e na volta do sistema. */
  conferirOcioso() {
    if (!this.o.ociosoMs || this.situacao !== 'ok' || !this.estado) return
    let ms = 0
    try {
      ms = Math.max(0, Number(this.o.ociosoMs()) || 0)
    } catch {
      return
    }
    const r = ocioso.conferir(this.ocioso, { agora: this.agora(), ociosoMs: ms, rodando: this.estado.rodando, limiteMin: this.pomodoro.ociosoMin })
    this.ocioso = r.o
    if (r.pergunta && !this.parado) {
      this.trocarParado(r.pergunta)
      const dur = tempo.duracaoCurta(r.pergunta.ate - r.pergunta.desde)
      this.notificar(`Parado ${dur}.`, 'Manter ou descartar esse tempo?', 'parado', ['Descartar', 'Manter'])
    }
  }

  /** O computador dormiu ou bloqueou a tela. */
  suspendeu() {
    if (this.estado && this.estado.rodando) this.ocioso = ocioso.suspender(this.ocioso, this.agora())
  }

  /** Voltou (acordou, desbloqueou): confere o parado e lê o servidor. */
  async voltou() {
    await this.atualizar().catch(() => {})
    this.conferirOcioso()
  }

  /* ───── as ações (menu, atalho, notificação e a página) ───── */

  /** O atalho: rodando, pausa; senão retoma o último card do dia. Devolve o que fez. */
  async alternar() {
    if (this.situacao !== 'ok' || !this.estado) {
      await this.atualizar()
      if (this.situacao !== 'ok') return 'nada'
    }
    if (this.estado.rodando) return (await this.operar({ op: 'pausar' })) ? 'pausou' : 'falhou'
    const card = tempo.ultimoCard(this.estado)
    if (!card) {
      this.notificar('Nada para retomar hoje', 'Escolha um card no Quadro do Maestro.', 'info')
      return 'nada'
    }
    return (await this.iniciar(card)) ? 'retomou' : 'falhou'
  }

  /** Começa (ou troca para) o card. Pausado no meio de um foco, retoma o foco (o Pomodoro guardou o feito). */
  iniciar(card, modo) {
    if (typeof card !== 'string' || !tempo.ID_CARD.test(card)) return Promise.resolve(false)
    const m = modo === 'pomodoro' || modo === 'livre' ? modo : this.pomodoro.fase === 'pronto' && this.pomodoro.acumulado > 0 ? 'pomodoro' : 'livre'
    return this.operar({ op: 'iniciar', card, modo: m })
  }

  pausar() {
    return this.estado && this.estado.rodando ? this.operar({ op: 'pausar' }) : Promise.resolve(false)
  }

  /** "Manter" (nada muda) ou "Descartar" (fecha em `desde` e começa outra agora no mesmo card). */
  async resolverParado(descartar) {
    const p = this.parado
    this.trocarParado(null)
    if (!p || !descartar) return true
    return this.operar({ op: 'parado', desde: new Date(p.desde).toISOString(), continuar: true })
  }

  async passoDoPomodoro(passo, card) {
    if (passo === 'focar') {
      if (pomodoro.emPausa(this.pomodoro)) this.trocarPomodoro(pomodoro.encerrarPausa(this.pomodoro))
      return this.iniciar(card || tempo.ultimoCard(this.estado), 'pomodoro')
    }
    if (passo === 'pausa') {
      this.trocarPomodoro(pomodoro.iniciarPausa(this.pomodoro, this.agora()))
      this.mudou()
      return this.pausar()
    }
    if (passo === 'encerrar-pausa') {
      this.trocarPomodoro(pomodoro.encerrarPausa(this.pomodoro))
      this.mudou()
      return true
    }
    return false
  }

  /** O que a página do Maestro (no app) contou pela ponte. `dados` já veio conferido pelo main.cjs. */
  doSite(canal, dados) {
    if (canal === 'pronto') {
      this.site('pomodoro', this.pomodoro)
      this.site('parado', this.parado)
    } else if (canal === 'pomodoro') {
      const antes = this.pomodoro.fase
      this.trocarPomodoro(pomodoro.doSite(this.pomodoro, dados))
      if (this.pomodoro.fase !== antes) this.site('pomodoro', this.pomodoro)
      this.mudou()
    } else if (canal === 'parado-resolvido') {
      if (this.parado) this.trocarParado(null)
      this.atualizar().catch(() => {})
    }
  }

  trocarAjustes(m) {
    this.ajustes = tempo.lerAjustes({ ...this.ajustes, ...m })
    this.gravar()
    this.mudou()
  }

  /** O que a barra e o menu desenham agora. */
  retrato(extra = {}) {
    return { estado: this.estado, pomodoro: this.pomodoro, agora: this.agora(), situacao: this.situacao, ajustes: this.ajustes, parado: this.parado, ...extra }
  }
}

module.exports = { Cronometro, INTERVALO_MS }
