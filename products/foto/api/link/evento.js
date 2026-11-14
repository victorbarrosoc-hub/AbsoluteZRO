// As rotas do visitante de um evento (públicas, sem conta), todas por aqui. O vercel.json reescreve
//   /api/evento/<acao>     → /api/link/evento?acao=<acao>
//   /e/<token>/i/<foto>    → /api/link/evento?acao=imagem&t=<token>&f=<foto>   (o endereço que a página usa)
//
//   abrir      POST { token, contar? }                      a ficha do evento (sem fotos: cada um só vê as suas)
//   pin        POST { token, pin }                          confere o PIN e grava a prova (cookie HttpOnly, 12 h)
//   recusar    POST { token, tipo, versao }                 "Agora não": registra a recusa (sem nada da pessoa)
//   desafio    POST { token }                               o desafio de vida (ordem sorteada, prazo curto); emite o
//                                                           cookie do aparelho (`foto_ap`) se ainda não houver
//   prova      POST { token, desafio, quadros, vetores, para }   confere a captura ao vivo; { prova } de uso único
//   achar      POST { token, vetores, versao, prova | lembranca }   busca aberta: { eu, talvez, lembranca? } (até 200)
//   cadastrar  POST { token, vetores, chave, versao, prova }   com consentimento: guarda o pedido; { eu, talvez, processado }
//   minhas     POST { token, chave }                        volta pelo mesmo link: as fotos ligadas a quem pediu
//   desistir   POST { token, chave }                        apaga o pedido e as ligações
//   remover    POST { token, vetores, fotos?, versao, prova }   "não quero aparecer": sem fotos, as parecidas; com fotos, apaga
//   pedir      POST { token, nome, contato, fotos }         "quero estas fotos" (sem pagamento)
//   imagem     GET ?t=&f=&v=mini&s=<12 do sha256>           os bytes de uma prévia com marca-d'água; cache privado
//
// `vetores`: 1 a 3 strings base64 de 128 bytes (int8, src/rosto/assinatura.js). A selfie nunca vem: não há rota que
// aceite imagem. O corpo não vai para log. Link desconhecido, revogado ou vencido: sempre 404 { erro: 'link' }.
// Escrita confere a origem. Limites: 429 { erro: 'limite', escopo: 'aparelho' | 'rede' | 'evento' }. Sem prova de
// captura ao vivo (ou com prova já usada, de outro aparelho ou de outros vetores): 403 { erro: 'prova' }. Prova de vida
// que não passou: 422 { erro: 'vida', motivo }. Formatos em docs/API.md.

import { armazenamento } from '../_arquivos.js'
import {
  abrirEvento,
  achar,
  aparelhoDe,
  cadastrar,
  conferirPinDoEvento,
  cookieDoAparelho,
  desistir,
  emitirDesafio,
  idDoAparelho,
  imagemDoEvento,
  minhas,
  novoAparelho,
  pedir,
  provarVida,
  recusar,
  remover,
} from '../_evento.js'
import { linkLigado } from '../_link.js'
import { lerJson } from '../_sessao.js'
import { consulta, json, origemDoPedido } from '../_zro.js'

const STATUS = {
  link: 404,
  limite: 429,
  pin: 401,
  formato: 400,
  vetor: 400,
  fotos: 400,
  nome: 400,
  contato: 400,
  chave: 404,
  modo: 409,
  cheio: 409,
  prova: 403,
  desafio: 403,
  vida: 422,
}
const ACOES = {
  abrir: ['POST'],
  pin: ['POST'],
  recusar: ['POST'],
  desafio: ['POST'],
  prova: ['POST'],
  achar: ['POST'],
  cadastrar: ['POST'],
  minhas: ['POST'],
  desistir: ['POST'],
  remover: ['POST'],
  pedir: ['POST'],
  imagem: ['GET', 'HEAD'],
}

const morto = (res) => json(res, 404, { ok: false, erro: 'link' })
const responder = (res, r, cookies = []) => (r.ok ? json(res, 200, r, cookies) : json(res, STATUS[r.erro] ?? 400, r, cookies))

function origemBoa(req) {
  const origem = req.headers.origin
  if (origem && origem !== origemDoPedido(req)) return false
  const sitio = req.headers['sec-fetch-site']
  return !sitio || sitio === 'same-origin'
}

async function imagem(req, res, q) {
  const arm = armazenamento()
  const vazio = (status) => {
    res.statusCode = status
    res.setHeader('Cache-Control', 'no-store')
    res.end()
  }
  const r = await imagemDoEvento(req, q.get('t'), q.get('f'), q.get('v') === 'mini')
  if (r === 'limite') return vazio(429)
  if (!r) return vazio(404)
  const etag = `"${r.sha256.slice(0, 32)}"`
  const versao = q.get('s')
  res.setHeader('ETag', etag)
  res.setHeader('Cache-Control', versao && r.sha256.startsWith(versao) && versao.length >= 12 ? 'private, max-age=86400, immutable' : 'private, no-cache')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304
    return res.end()
  }
  const bytes = await arm.ler(r.chave)
  if (!bytes) return vazio(404)
  res.statusCode = 200
  res.setHeader('Content-Type', r.tipo)
  res.setHeader('Content-Length', String(bytes.length))
  res.setHeader('Content-Disposition', 'inline')
  res.end(req.method === 'HEAD' ? undefined : bytes)
}

export default async function evento(req, res) {
  const q = consulta(req)
  const acao = q.get('acao')
  const metodos = ACOES[acao]
  if (!metodos || !linkLigado(req)) return morto(res)
  if (!metodos.includes(req.method)) {
    res.setHeader('Allow', metodos.join(', '))
    return json(res, 405, { ok: false })
  }
  if (!armazenamento()) return json(res, 503, { ok: false, erro: 'sem_armazenamento' })
  if (acao === 'imagem') return imagem(req, res, q)

  if (!origemBoa(req)) return json(res, 403, { ok: false, erro: 'origem' })
  let corpo
  try {
    // a prova leva os pontos do detector quadro a quadro (até 360 quadros): 64 KB; o resto cabe em 16 KB
    corpo = await lerJson(req, acao === 'prova' ? 65536 : 16384)
  } catch {
    return json(res, 400, { ok: false, erro: 'formato' })
  }
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return json(res, 400, { ok: false, erro: 'formato' })
  const { token } = corpo

  if (acao === 'abrir') {
    const r = await abrirEvento(req, token, { contar: corpo.contar === true })
    if (r.estado === 'morto') return morto(res)
    if (r.estado === 'limite') return json(res, 429, { ok: false, erro: 'limite' })
    if (r.estado === 'pin') return json(res, 200, { ok: true, estado: 'pin' })
    return json(res, 200, { ok: true, estado: 'ok', evento: r.evento })
  }
  if (acao === 'pin') {
    const r = await conferirPinDoEvento(req, token, corpo.pin)
    if (!r.ok) {
      const erro = r.erro === 'morto' ? 'link' : r.erro
      return json(res, STATUS[erro], { ok: false, erro })
    }
    const seguro = origemDoPedido(req).startsWith('https://') ? '; Secure' : ''
    return json(res, 200, { ok: true }, [`${r.cookie.nome}=${r.cookie.valor}; Path=/; Max-Age=${r.cookie.maxAge}; HttpOnly${seguro}; SameSite=Lax`])
  }
  if (acao === 'recusar') return responder(res, await recusar(req, token, corpo.tipo, corpo.versao))
  const aparelho = aparelhoDe(req)
  if (acao === 'desafio') {
    // sem cookie do aparelho (ou adulterado): nasce um aqui, e o desafio já fica preso a ele
    const novo = aparelho ? null : novoAparelho()
    const r = await emitirDesafio(req, token, aparelho ?? idDoAparelho(novo))
    return responder(res, r, novo && r.erro !== 'link' ? [cookieDoAparelho(novo, origemDoPedido(req).startsWith('https://'))] : [])
  }
  if (acao === 'prova') return responder(res, await provarVida(req, token, aparelho, corpo))
  const prova = { aparelho, prova: corpo.prova ?? null, lembranca: corpo.lembranca ?? null }
  if (acao === 'achar') return responder(res, await achar(req, token, corpo.vetores, corpo.versao, prova))
  if (acao === 'cadastrar') return responder(res, await cadastrar(req, token, corpo.vetores, corpo.chave, corpo.versao, prova))
  if (acao === 'minhas') return responder(res, await minhas(req, token, corpo.chave))
  if (acao === 'desistir') return responder(res, await desistir(req, token, corpo.chave))
  if (acao === 'remover') return responder(res, await remover(req, token, corpo.vetores, corpo.fotos ?? null, corpo.versao, prova))
  return responder(res, await pedir(req, token, corpo.nome, corpo.contato, corpo.fotos))
}
