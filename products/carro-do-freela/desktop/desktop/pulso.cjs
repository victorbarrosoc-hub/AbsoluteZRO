// O que o app de computador faz a mais que o site (titular, 31/10/2026: "um app no nível mais alto que o site, que instigue a
// baixar"): avisa proposta nova na hora (notificação do sistema e o número no ícone), mostra a semana na barra do
// computador e marca o dia sem abrir a janela. Tudo pelas MESMAS rotas do site (/api/zro/propostas e /api/zro/agenda),
// chamadas de dentro da página do Carro (mesma origem e a sessão de quem entrou): o app não guarda token nem senha.
// Este arquivo é só a lógica (sem Electron), para o teste; main.cjs liga na bandeja, nas notificações e no Dock.

const ESTADOS = ['livre', 'negociando', 'fechado']
const NOME_ESTADO = { livre: 'Livre', negociando: 'Negociando', fechado: 'Fechado' }
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const pad = (n) => String(n).padStart(2, '0')
const chave = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Os sete dias a partir de hoje, com o estado de cada um na agenda ({ "YYYY-MM-DD": {e,p} }). */
function semana(agenda, hoje = new Date()) {
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    const k = chave(d)
    const v = agenda && agenda[k]
    const e = v && (v.e === 'fechado' || v.e === 'negociando') ? v.e : 'livre'
    const meia = !!(v && v.p && v.p !== 'dia')
    return { dia: k, rotulo: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : `${DIAS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, estado: e, meia }
  })
}

/** Propostas recebidas e ainda pendentes que não estavam em `vistas` (ids). */
function novas(recebidas, vistas) {
  return (Array.isArray(recebidas) ? recebidas : []).filter((p) => p && p.estado === 'pendente' && !vistas.has(p.id))
}

/** Pendentes, para o número no ícone. */
const pendentes = (recebidas) => (Array.isArray(recebidas) ? recebidas : []).filter((p) => p && p.estado === 'pendente').length

/** O texto da notificação de uma proposta (sem telefone: o servidor nunca manda). */
function aviso(p) {
  const partes = [p.funcao, p.dia ? p.dia.split('-').reverse().slice(0, 2).join('/') : null, p.ini && p.fim ? `${p.ini}–${p.fim}` : p.ini, p.local].filter(Boolean)
  return { titulo: p.tipo === 'brecho' ? 'Alguém quer o seu anúncio do brechó' : 'Proposta nova no Carro', corpo: [p.de_nome || 'Alguém', partes.join(' · ')].filter(Boolean).join(' — ') }
}

/** O pedido que marca um dia (PUT para negociando/fechado, DELETE para livre), no formato das rotas do site. */
function pedidoDoDia(dia, estado) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dia)) || !ESTADOS.includes(estado)) throw new Error('dia ou estado inválido')
  if (estado === 'livre') return { metodo: 'DELETE', caminho: `/api/zro/agenda?dia=${dia}` }
  return { metodo: 'PUT', caminho: '/api/zro/agenda', corpo: { dia, estado, parte: 'dia', hora: null } }
}

/**
 * O pulso: de tempos em tempos lê as propostas e a agenda. `buscar(metodo, caminho, corpo)` devolve { status, dados }
 * (main.cjs faz o pedido de dentro da página). Na primeira leitura não avisa nada: só aprende o que já existia.
 */
class Pulso {
  constructor({ buscar, aoMudar, notificar, intervalo = 60_000, agora = () => new Date() }) {
    Object.assign(this, { buscar, aoMudar, notificar, intervalo, agora })
    this.vistas = new Set()
    this.primeira = true
    this.estado = { entrou: false, semana: semana({}, agora()), pendentes: 0 }
    this.timer = null
  }
  start() {
    this.stop()
    this.timer = setInterval(() => this.ler().catch(() => {}), this.intervalo)
    return this.ler().catch(() => {})
  }
  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
  async ler() {
    const hoje = this.agora()
    const ate = new Date(hoje)
    ate.setDate(ate.getDate() + 7)
    const [pr, ag] = await Promise.all([
      this.buscar('GET', '/api/zro/propostas'),
      this.buscar('GET', `/api/zro/agenda?de=${chave(hoje)}&ate=${chave(ate)}`),
    ])
    if (!pr || pr.status !== 200) {
      this.estado = { entrou: false, semana: semana({}, hoje), pendentes: 0 }
      this.aoMudar(this.estado)
      return this.estado
    }
    const recebidas = (pr.dados && pr.dados.recebidas) || []
    if (!this.primeira) for (const p of novas(recebidas, this.vistas)) this.notificar(aviso(p), p)
    for (const p of recebidas) if (p && p.id) this.vistas.add(p.id)
    this.primeira = false
    const agenda = ag && ag.status === 200 && ag.dados ? ag.dados.agenda : {}
    this.estado = { entrou: true, semana: semana(agenda, hoje), pendentes: pendentes(recebidas) }
    this.aoMudar(this.estado)
    return this.estado
  }
  async marcar(dia, estado) {
    const p = pedidoDoDia(dia, estado)
    const r = await this.buscar(p.metodo, p.caminho, p.corpo)
    if (!r || (r.status !== 200 && r.status !== 204)) throw new Error('A agenda não foi salva')
    return this.ler()
  }
}

module.exports = { ESTADOS, NOME_ESTADO, semana, novas, pendentes, aviso, pedidoDoDia, Pulso }
