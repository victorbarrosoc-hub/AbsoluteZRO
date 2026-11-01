// Criar com IA no AEON: a Higgsfield das Conexões da Absolute ZRO, pelo próprio site (/api/zro/higgsfield*, que repassa
// ao HUB com o token da pessoa; api/_higgsfield.js). A conta da Higgsfield, os créditos e o registro do que foi usado
// ficam no HUB. O arquivo de referência vai do navegador direto para o envio da Higgsfield (endereço pré-assinado) e o
// resultado volta da CDN dela, também direto: nada passa pelos servidores da Absolute ZRO. Nada gera sem a pessoa
// tocar em gerar; o andamento é o que a Higgsfield diz.

import { estadoLegivel, leituraDoErro, urlPermitida } from '../src/criar.js'

export class ErroCriar extends Error {
  constructor(leitura, status = 0) {
    super(leitura.texto)
    this.leitura = leitura
    this.status = status
  }
}
export class Cancelado extends Error {
  constructor() {
    super('Cancelado. Nada novo entrou na Mídia.')
    this.name = 'AbortError'
  }
}

const fora = () => new ErroCriar({ estado: 'erro', texto: 'Sem conexão agora. Confira a internet e tente de novo.' })

async function pedir(caminho, { metodo = 'GET', corpo, sinal } = {}) {
  let r
  try {
    r = await fetch(caminho, {
      method: metodo,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: sinal,
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
  } catch (e) {
    if (e?.name === 'AbortError') throw new Cancelado()
    throw fora()
  }
  const dados = await r.json().catch(() => ({}))
  if (!r.ok) throw new ErroCriar(leituraDoErro(r.status, dados), r.status)
  return dados
}

/** O painel: { conta, plano, saldo, usoMes, usoApp, imagens: [{ quantidade, creditos }], opcoes: [...] }. */
export const painel = ({ duracao = 'curto', proporcao = '16:9' } = {}, sinal) =>
  pedir(`/api/zro/higgsfield?${new URLSearchParams({ duracao, proporcao })}`, { sinal })

/** Manda uma imagem (o quadro do vídeo ou uma tela escolhida) para a Higgsfield; devolve a referência dela. */
export async function enviarReferencia(blob, sinal) {
  const e = await pedir('/api/zro/higgsfield/gerar', { metodo: 'POST', corpo: { acao: 'envio', tipo: blob.type }, sinal })
  if (!urlPermitida(e.upload_url)) throw new ErroCriar({ estado: 'erro', texto: 'A Higgsfield mandou um endereço de envio estranho. Nada foi enviado.' })
  let r
  try {
    r = await fetch(e.upload_url, { method: 'PUT', headers: e.headers || { 'Content-Type': blob.type }, body: blob, signal: sinal })
  } catch (err) {
    if (err?.name === 'AbortError') throw new Cancelado()
    throw fora()
  }
  if (!r.ok) throw new ErroCriar({ estado: 'erro', texto: 'O envio da imagem falhou. Tente de novo.' })
  return e.ref
}

/** As telas antes do vídeo: { id, estado, creditos }. */
export const telas = ({ prompt, quantidade, proporcao, ref }, sinal) =>
  pedir('/api/zro/higgsfield/gerar', { metodo: 'POST', corpo: { acao: 'telas', prompt, quantidade, proporcao, ...(ref ? { ref } : {}) }, sinal })
/** Anima uma imagem numa das três opções: { id, estado, creditos }. */
export const animar = ({ prompt, opcao, duracao, ref }, sinal) =>
  pedir('/api/zro/higgsfield/gerar', { metodo: 'POST', corpo: { acao: 'animar', prompt, opcao, duracao, ref }, sinal })
export const andamento = (id, sinal) => pedir(`/api/zro/higgsfield/gerar?${new URLSearchParams({ id })}`, { sinal })

const dormir = (ms, sinal) =>
  new Promise((ok, erro) => {
    const t = setTimeout(ok, ms)
    sinal?.addEventListener('abort', () => (clearTimeout(t), erro(new Cancelado())), { once: true })
  })

/** O pedido acabou de vez (não adianta retomar)? Pronto, estado final da Higgsfield ou pedido que não existe. */
export const encerrado = (e) => e instanceof ErroCriar && (['falhou', 'recusado', 'cancelado'].includes(e.leitura.estado) || e.status === 404 || e.status === 422)

/**
 * Acompanha um pedido até terminar: aoEstado(estado) a cada leitura. { estado: 'pronto', urls } ou ErroCriar com a
 * frase do estado final. Cancelar aqui só para de acompanhar (o pedido já saiu e a Higgsfield já cobrou). Limite ou
 * rede fora no meio: espera e tenta ler de novo (ler não gera nada).
 */
export async function esperar(id, { sinal, aoEstado = () => {}, intervaloMs = 3000, prazoMs = 20 * 60_000 } = {}) {
  const desde = Date.now()
  while (Date.now() - desde < prazoMs) {
    let a
    try {
      a = await andamento(id, sinal)
    } catch (e) {
      // muitos pedidos seguidos ou a rede piscou: o pedido segue na Higgsfield; espera e lê de novo
      if (e instanceof ErroCriar && (e.status === 429 || e.status === 0 || e.status >= 502)) {
        await dormir(30_000, sinal)
        continue
      }
      throw e
    }
    aoEstado(a.estado)
    if (a.estado === 'pronto') return a
    if (['falhou', 'recusado', 'cancelado'].includes(a.estado)) throw new ErroCriar({ estado: a.estado, texto: estadoLegivel(a.estado, a.erro) })
    await dormir(intervaloMs, sinal)
  }
  throw new ErroCriar({ estado: 'erro', texto: 'A Higgsfield está demorando. O pedido segue lá; tente abrir de novo daqui a pouco.' })
}

/** O arquivo de um resultado (direto da CDN da Higgsfield). */
export async function baixar(url, sinal) {
  if (!urlPermitida(url)) throw new ErroCriar({ estado: 'erro', texto: 'Endereço de resultado fora da Higgsfield.' })
  let r
  try {
    r = await fetch(url, { signal: sinal, cache: 'no-store' })
  } catch (e) {
    if (e?.name === 'AbortError') throw new Cancelado()
    throw fora()
  }
  if (!r.ok) throw new ErroCriar({ estado: 'erro', texto: 'Não deu para receber o resultado. Tente de novo.' })
  return r.blob()
}
