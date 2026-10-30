// Relay · "Escolher no Drive": o SOBEDESCE embutido numa folha (protocolo em src/drive.js). O quadro nasce no primeiro
// toque e fica vivo enquanto a página estiver aberta: é por ele que o motor lê o arquivo aos pedaços durante a
// conversão (Mediabunny StreamSource) e que o resultado volta para o Drive. Sem login no SOBEDESCE, o próprio quadro
// oferece entrar (em outra aba).

import { arquivosEscolhidos, enderecoDoQuadro, LER_MAX, ORIGEM_SOBEDESCE } from '../src/drive.js'

const local = ['localhost', '127.0.0.1'].includes(location.hostname)
/** A origem do SOBEDESCE. No servidor local (testes, desenvolvimento) dá para apontar para um SOBEDESCE local. */
export const ORIGEM = (() => {
  try {
    return (local && sessionStorage.getItem('relay-sobedesce')) || ORIGEM_SOBEDESCE
  } catch {
    return ORIGEM_SOBEDESCE
  }
})()

const ESPERA_MS = 90_000
let folha = null
let quadro = null
let porta = null
let pronto = null
let avisarPronto = null
let aoEscolher = null
let pedidos = 0
const esperando = new Map()
const envios = new Map()

const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props)
  n.append(...filhos.filter((f) => f != null && f !== false))
  return n
}

function receber(e) {
  if (e.origin !== ORIGEM || !quadro || e.source !== quadro.contentWindow) return
  const d = e.data
  if (!d || typeof d !== 'object' || d.fonte !== 'sobedesce') return
  if (d.tipo === 'pronto') {
    // um canal novo a cada "pronto" (o quadro recarregou: entrou na conta, trocou de Drive)
    const c = new MessageChannel()
    porta?.close()
    porta = c.port1
    porta.onmessage = resposta
    quadro.contentWindow.postMessage({ fonte: 'relay', tipo: 'canal' }, ORIGEM, [c.port2])
    avisarPronto?.()
    return
  }
  if (d.tipo === 'escolhido') {
    const lista = arquivosEscolhidos(d)
    if (!lista.length) return
    folha.close()
    aoEscolher?.(lista.map(arquivoDoDrive))
  }
}

function resposta(e) {
  const d = e.data
  if (!d || typeof d !== 'object') return
  if (d.tipo === 'envio') return envios.get(d.envio)?.(d)
  const p = esperando.get(d.pedido)
  if (!p) return
  esperando.delete(d.pedido)
  clearTimeout(p.relogio)
  if (d.ok) p.ok(d)
  else p.falha(new Error(d.erro || 'O SOBEDESCE não respondeu.'))
}

async function pedir(msg, transfer = []) {
  await pronto
  return new Promise((ok, falha) => {
    const pedido = ++pedidos
    const relogio = setTimeout(() => {
      esperando.delete(pedido)
      falha(new Error('O Drive demorou demais para responder.'))
    }, ESPERA_MS)
    esperando.set(pedido, { ok, falha, relogio })
    porta.postMessage({ ...msg, pedido }, transfer)
  })
}

/** Lê [de, ate) do arquivo do Drive, em pedidos de até LER_MAX. */
async function ler(id, de, ate) {
  if (ate - de <= LER_MAX) return new Uint8Array((await pedir({ tipo: 'ler', id, de, ate })).dados)
  const saida = new Uint8Array(ate - de)
  for (let i = de; i < ate; i += LER_MAX) saida.set(new Uint8Array((await pedir({ tipo: 'ler', id, de: i, ate: Math.min(ate, i + LER_MAX) })).dados), i - de)
  return saida
}

/** O arquivo do Drive como o motor espera ({ nome, fonte }), com name/size para a fila do conversor. */
export function arquivoDoDrive(a) {
  return {
    name: a.nome,
    nome: a.nome,
    size: a.tamanho,
    type: a.mime,
    drive: a,
    fonte: (MB) => new MB.StreamSource({ getSize: async () => a.tamanho, read: (de, ate) => ler(a.id, de, ate), prefetchProfile: 'network' }),
  }
}

function montar(tema) {
  pronto = new Promise((ok) => (avisarPronto = ok))
  quadro = el('iframe', { className: 'drive-quadro', title: 'SOBEDESCE · Drive', src: enderecoDoQuadro(ORIGEM, tema) })
  const fechar = el('button', { type: 'button', className: 'vidro vidro--icone', ariaLabel: 'Fechar' })
  fechar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>'
  fechar.onclick = () => folha.close()
  folha = el('dialog', { className: 'folha folha--drive', ariaLabel: 'Escolher no Drive' }, el('div', { className: 'drive-topo' }, el('strong', { textContent: 'Escolher no Drive' }), fechar), quadro)
  document.body.append(folha)
  window.addEventListener('message', receber)
}

/** Abre a folha do Drive. `escolheu(arquivos)` recebe os arquivos escolhidos, já prontos para a fila. */
export function escolherNoDrive({ tema = 'claro', escolheu }) {
  aoEscolher = escolheu
  if (!folha) montar(tema)
  folha.showModal()
}

/** O tema mudou no Relay: o quadro acompanha. */
export function mudarTema(tema) {
  quadro?.contentWindow?.postMessage({ fonte: 'relay', tipo: 'tema', tema }, ORIGEM)
}

/**
 * Manda o resultado para o Drive (a fila do SOBEDESCE, com o MD5 conferido lá). `pasta`: a pasta do arquivo de origem.
 * `aoEstado({ estado, erro })` acompanha: 'enviando' → 'conferido' (ou 'erro').
 */
export async function enviarAoDrive({ nome, blob, pasta }, aoEstado = () => {}) {
  const r = await pedir({ tipo: 'enviar', nome, mime: blob.type || 'application/octet-stream', dados: blob, pasta })
  envios.set(r.envio, (d) => {
    aoEstado(d)
    if (d.estado === 'conferido' || d.estado === 'erro') envios.delete(r.envio)
  })
  return r.envio
}
