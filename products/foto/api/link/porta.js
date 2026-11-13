// As rotas do link do cliente (públicas, sem conta), todas por aqui: o vercel.json reescreve
//   /api/link/<acao>          → /api/link/porta?acao=<acao>
//   /g/<token>/i/<foto>       → /api/link/porta?acao=imagem&t=<token>&f=<foto>   (o endereço que a página usa)
//
//   abrir     POST { token, contar? } ou GET ?t=   a ficha da galeria, as fotos e a seleção atual
//   pin       POST { token, pin }                  confere o PIN e grava a prova (cookie HttpOnly, 12 h)
//   escolher  POST { token, foto, escolhida }      escolhe ou desfaz
//   comentar  POST { token, foto, comentario, etiquetas }
//   enviar    POST { token, nome }                 o envio final; trava a seleção
//   imagem    GET ?t=&f=&v=mini&s=<12 do sha256>   os bytes de uma foto; cache privado; nada é listado
//
// Quem responde é a porta estreita do banco (api/_link.js): link desconhecido, revogado ou vencido dá sempre 404
// { erro: 'link' }. Escrita confere a origem (só a própria página). Limites por link e por IP: 429 { erro: 'limite' }.
// Sem armazenamento configurado: 503 { erro: 'sem_armazenamento' }. Formatos em docs/API.md.

import { armazenamento } from '../_arquivos.js'
import { abrirLink, comentarFoto, conferirPin, enviarSelecao, escolherFoto, imagemDoLink, linkLigado } from '../_link.js'
import { lerJson } from '../_sessao.js'
import { consulta, json, origemDoPedido } from '../_zro.js'

const STATUS = { link: 404, limite: 429, pin: 401, formato: 400, foto: 400, texto: 400, etiquetas: 400, nome: 400, travada: 409, cheia: 409, vazia: 409 }
const ACOES = { abrir: ['GET', 'POST'], pin: ['POST'], escolher: ['POST'], comentar: ['POST'], enviar: ['POST'], imagem: ['GET', 'HEAD'] }

const morto = (res) => json(res, 404, { ok: false, erro: 'link' })
const responder = (res, r) => (r.ok ? json(res, 200, r) : json(res, STATUS[r.erro] ?? 400, r))

/** Só a própria página escreve: outra origem (ou outro site, pelo Sec-Fetch-Site) é recusada. */
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
  const r = await imagemDoLink(req, q.get('t'), q.get('f'), q.get('v') === 'mini')
  if (r === 'limite') return vazio(429)
  if (!r) return vazio(404)
  const etag = `"${r.sha256.slice(0, 32)}"`
  const versao = q.get('s')
  res.setHeader('ETag', etag)
  // com a versão certa no endereço (o começo do sha256), o navegador do cliente guarda; sem ela, sempre revalida
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

export default async function porta(req, res) {
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

  let corpo = {}
  if (req.method === 'POST') {
    if (!origemBoa(req)) return json(res, 403, { ok: false, erro: 'origem' })
    try {
      corpo = await lerJson(req, 16384)
    } catch {
      return json(res, 400, { ok: false, erro: 'formato' })
    }
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return json(res, 400, { ok: false, erro: 'formato' })
  }
  const token = req.method === 'POST' ? corpo.token : q.get('t')

  if (acao === 'abrir') {
    const r = await abrirLink(req, token, { contar: req.method === 'POST' && corpo.contar === true })
    if (r.estado === 'morto') return morto(res)
    if (r.estado === 'limite') return json(res, 429, { ok: false, erro: 'limite' })
    if (r.estado === 'pin') return json(res, 200, { ok: true, estado: 'pin' })
    return json(res, 200, { ok: true, estado: 'ok', ...r.dados })
  }
  if (acao === 'pin') {
    const r = await conferirPin(req, token, corpo.pin)
    if (!r.ok) return json(res, STATUS[r.erro === 'morto' ? 'link' : r.erro], { ok: false, erro: r.erro === 'morto' ? 'link' : r.erro })
    const seguro = origemDoPedido(req).startsWith('https://') ? '; Secure' : ''
    return json(res, 200, { ok: true }, [`${r.cookie.nome}=${r.cookie.valor}; Path=/; Max-Age=${r.cookie.maxAge}; HttpOnly${seguro}; SameSite=Lax`])
  }
  if (acao === 'escolher') return responder(res, await escolherFoto(req, token, corpo.foto, corpo.escolhida))
  if (acao === 'comentar') return responder(res, await comentarFoto(req, token, corpo.foto, corpo.comentario, corpo.etiquetas))
  return responder(res, await enviarSelecao(req, token, corpo.nome))
}
