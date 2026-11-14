// Os avisos ao fotógrafo (docs/API.md, "Avisos"): o cliente enviou a escolha da galeria, um visitante pediu fotos. Uma
// loja pequena que a casca liga (o ponto na aba Entregar) e a tela Entregar lê (a lista com "Abrir").
//
// Consulta GET /api/foto/avisos ao ligar, ao voltar o foco ou a aba (no máximo uma vez a cada 10 s) e a cada 60 s. Com
// a aba escondida, só consulta se a pessoa deu permissão de notificação (senão ninguém veria). Servidor sem banco ou
// sessão que acabou: para de consultar e o ponto some, sem erro.
//
// Notificação do navegador: só com a página aberta, só com a permissão que a pessoa deu num gesto dela
// (`pedirNotificacao`, nunca ao abrir), só do que chegou com a página aberta, e com texto neutro: "Absolute ZRO" e o
// nome do trabalho. Nada de nome do produto, ícone ou nome de quem enviou.

import { useEffect, useState } from '../preact.js'

const ENDERECO = '/api/foto/avisos'
export const ESPERA = 60000
const FOLGA = 10000

let estado = { ligado: null, avisos: [], naoLidos: 0, permissao: permissao() }
const ouvintes = new Set()
let vistos = null
let ultimo = 0
let correndo = null
let ligacoes = 0
let desligar = null

function permissao() {
  try {
    return typeof Notification === 'undefined' || !globalThis.isSecureContext ? 'nao' : Notification.permission
  } catch {
    return 'nao'
  }
}

function publicar(mais) {
  estado = { ...estado, ...mais, permissao: permissao() }
  for (const f of ouvintes) f(estado)
}

export const atual = () => estado

/** Recebe o estado agora e a cada mudança. Devolve a função de sair. */
export function assinar(f) {
  ouvintes.add(f)
  f(estado)
  return () => ouvintes.delete(f)
}

/** O texto de um aviso, curto e sem nome de quem enviou (vale para a notificação). */
export const textoDoAviso = (a) => `${a.tipo === 'escolha' ? 'Escolha recebida' : 'Pedido de fotos'} · ${a.nome}`

function notificar(novos) {
  if (!novos.length || permissao() !== 'granted') return
  if (document.visibilityState === 'visible' && document.hasFocus()) return
  for (const a of novos.slice(0, 3)) {
    try {
      const n = new Notification('Absolute ZRO', { body: textoDoAviso(a), tag: `aviso-${a.id}` })
      n.onclick = () => {
        n.close()
        globalThis.focus?.()
        if (location.hash !== '#/entregar') location.hash = '#/entregar'
      }
    } catch {
      // celular sem service worker não cria notificação daqui: fica o ponto na aba
    }
  }
}

/** Consulta o servidor. `forcar`: ignora a folga de 10 s e, com uma consulta no meio do caminho, faz outra depois dela. */
export function atualizar({ forcar = false } = {}) {
  if (correndo) return forcar ? correndo.then(() => atualizar({ forcar: true })) : correndo
  if (estado.ligado === false || (!forcar && Date.now() - ultimo < FOLGA)) return Promise.resolve(estado)
  ultimo = Date.now()
  correndo = (async () => {
    try {
      const r = await fetch(ENDERECO, { credentials: 'same-origin', headers: { accept: 'application/json' } })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.ok) {
        // sem banco ou sem sessão: não adianta insistir
        if (d?.erro === 'sem_banco' || r.status === 401) publicar({ ligado: false, avisos: [], naoLidos: 0 })
        return estado
      }
      const ids = d.avisos.map((a) => a.id)
      const novos = vistos ? d.avisos.filter((a) => !vistos.has(a.id)) : []
      vistos = new Set([...(vistos ?? []), ...ids])
      publicar({ ligado: true, avisos: d.avisos, naoLidos: d.naoLidos })
      notificar(novos)
    } catch {
      // sem rede: tenta na próxima
    } finally {
      correndo = null
    }
    return estado
  })()
  return correndo
}

/** Marca como lido ({ ids } | { galeria } | { evento } | { todos: true }) e relê. */
export async function marcar(corpo) {
  const tirar = (a) => (corpo.todos ? true : corpo.ids ? corpo.ids.includes(a.id) : corpo.galeria ? a.galeria === corpo.galeria : a.evento === corpo.evento)
  const ficam = estado.avisos.filter((a) => !tirar(a))
  if (ficam.length === estado.avisos.length && !corpo.todos) return estado
  publicar({ avisos: ficam, naoLidos: Math.max(0, estado.naoLidos - (estado.avisos.length - ficam.length)) })
  try {
    await fetch(ENDERECO, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
  } catch {
    // sem rede: o próximo GET devolve o aviso, que aparece de novo
  }
  return atualizar({ forcar: true })
}

/** Pede a permissão de notificação. Só num gesto da pessoa (clique). Devolve a permissão. */
export async function pedirNotificacao() {
  if (permissao() !== 'default') return permissao()
  try {
    await Notification.requestPermission()
  } catch {
    // navegador antigo ou recusou
  }
  publicar({})
  return permissao()
}

/** Liga as consultas (quem chama desliga com o que volta). Várias ligações dividem o mesmo relógio. */
export function ligar() {
  ligacoes += 1
  if (ligacoes === 1) {
    const tique = () => {
      if (document.visibilityState !== 'visible' && permissao() !== 'granted') return
      void atualizar({ forcar: true })
    }
    const voltou = () => document.visibilityState === 'visible' && void atualizar()
    const t = setInterval(tique, ESPERA)
    addEventListener('focus', voltou)
    document.addEventListener('visibilitychange', voltou)
    desligar = () => {
      clearInterval(t)
      removeEventListener('focus', voltou)
      document.removeEventListener('visibilitychange', voltou)
    }
    void atualizar({ forcar: true })
  }
  let feito = false
  return () => {
    if (feito) return
    feito = true
    ligacoes -= 1
    if (!ligacoes) desligar?.()
  }
}

/** Hook: o estado dos avisos ({ ligado, avisos, naoLidos, permissao }). */
export function usarAvisos() {
  const [e, definir] = useState(estado)
  useEffect(() => assinar(definir), [])
  return e
}
