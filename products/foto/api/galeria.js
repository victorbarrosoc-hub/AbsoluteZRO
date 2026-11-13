// GET /g/<token> → a página do cliente (galeria/galeria.html), só para link vivo. Link desconhecido, revogado, vencido
// ou de galeria encerrada recebe a página neutra (app/indisponivel.html), a mesma de qualquer endereço que não existe.
// Os arquivos da página (galeria.css, galeria.js, …) saem por /g/<token>/<arquivo>, também só para link vivo: nada da
// galeria fica no site estático. O vercel.json reescreve /g/:token → /api/galeria?t= e /g/:token/:arquivo → &f=.
//
// A página não leva o nome nem o ícone do produto (ele não está lançado): assina "Absolute ZRO". O tema vem do cookie
// foto_tema (claro é o padrão), escrito no <html> já na resposta, sem script inline.

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { ehToken, linkLigado, linkVivo } from './_link.js'
import { consulta } from './_zro.js'
import { neutra, temaDe } from './pagina.js'

const PASTA = new URL('../galeria/', import.meta.url)
const ARQUIVO = /^[a-z0-9-]{1,40}\.(css|js)$/
const TIPOS = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }

export default async function galeria(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, HEAD')
    res.setHeader('Cache-Control', 'no-store')
    return res.end()
  }
  const q = consulta(req)
  const token = q.get('t')
  const arquivo = q.get('f')
  if (!linkLigado(req) || !ehToken(token) || (arquivo != null && !ARQUIVO.test(arquivo))) return neutra(req, res, 404)
  const estado = await linkVivo(req, token)
  if (estado !== 'ok') return neutra(req, res, estado === 'limite' ? 429 : 404)

  let corpo
  try {
    corpo = await readFile(new URL(arquivo ?? 'galeria.html', PASTA))
  } catch {
    return neutra(req, res, 404)
  }
  // o endereço não sai daqui nem como referência para outro site
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (!arquivo) {
    const tema = temaDe(req)
    const html = corpo
      .toString('utf8')
      .replaceAll('%BASE%', `/g/${token}`)
      .replaceAll('%TEMA%', tema)
      .replaceAll('%COR_TEMA%', tema === 'escuro' ? '#0e0e10' : '#f5f5f7')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    return res.end(req.method === 'HEAD' ? undefined : html)
  }
  const etag = `W/"${createHash('sha256').update(corpo).digest('base64url').slice(0, 27)}"`
  res.setHeader('Cache-Control', 'private, no-cache')
  res.setHeader('ETag', etag)
  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304
    return res.end()
  }
  res.statusCode = 200
  res.setHeader('Content-Type', TIPOS[extname(arquivo)])
  res.setHeader('Content-Length', String(corpo.length))
  res.end(req.method === 'HEAD' ? undefined : corpo)
}
