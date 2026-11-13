// GET /app/<arquivo> e /src/<arquivo> → as telas (app/) e o núcleo ESM (src/, que o navegador importa direto), só para
// a sessão liberada pelo gate. Fora dela, ou para qualquer caminho que não exista, 404 com a página neutra: o app não
// lançado não aparece nem pelo código. A Vercel reescreve /app/:f* e /src/:f* para /api/recurso?pasta=…&f=… e os
// arquivos vêm no pacote desta função (includeFiles no vercel.json). Nada é listado; só arquivo dentro de app/ ou src/.
//
// Cache: privado e sempre revalidado (ETag fraca): quem perde o acesso para de receber no pedido seguinte.

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { pessoaDe } from './_sessao.js'
import { consulta } from './_zro.js'
import { casca, comNome, neutra } from './pagina.js'

const RAIZ = new URL('../', import.meta.url)
export const PASTAS = ['app', 'src']
const JS = 'text/javascript; charset=utf-8'
export const TIPOS = {
  '.js': JS,
  '.mjs': JS,
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

/** Caminho relativo seguro: um arquivo dentro de app/ ou src/; senão null. Sem `..`, sem oculto, sem barra invertida. */
export function caminhoSeguro(v) {
  if (typeof v !== 'string' || !v || v.length > 300 || /[\0\\%]/.test(v)) return null
  if (v.endsWith('/')) return null
  const partes = v.split('/').filter((p) => p !== '' && p !== '.')
  if (partes.length < 2 || partes.some((p) => p === '..' || p.startsWith('.'))) return null
  if (!PASTAS.includes(partes[0])) return null
  return partes.join('/')
}

/** O caminho pedido: ?pasta=app&f=tela.js (reescrita da Vercel) ou ?f=app/tela.js. */
export function caminhoDoPedido(req) {
  const q = consulta(req)
  const pasta = q.get('pasta')
  const f = q.get('f')
  if (typeof f !== 'string') return null
  return caminhoSeguro(pasta ? `${pasta}/${f}` : f)
}

export default async function recurso(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, HEAD')
    res.setHeader('Cache-Control', 'no-store')
    return res.end()
  }
  const caminho = caminhoDoPedido(req)
  if (!caminho || !pessoaDe(req)) return neutra(req, res, 404)
  let corpo
  try {
    corpo = await readFile(new URL(caminho, RAIZ))
  } catch {
    return neutra(req, res, 404)
  }
  const ext = extname(caminho).toLowerCase()
  // o nome do produto só existe em app/nome.js: a casca e o manifesto levam os marcadores
  if (caminho === 'app/index.html') corpo = Buffer.from(await casca(req))
  else if (ext === '.webmanifest') corpo = Buffer.from(comNome(corpo.toString('utf8'), 'json'))
  const etag = `W/"${createHash('sha256').update(corpo).digest('base64url').slice(0, 27)}"`
  res.setHeader('Cache-Control', 'private, no-cache')
  res.setHeader('ETag', etag)
  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304
    return res.end()
  }
  res.statusCode = 200
  res.setHeader('Content-Type', TIPOS[ext] || 'application/octet-stream')
  res.setHeader('Content-Length', String(corpo.length))
  res.end(req.method === 'HEAD' ? undefined : corpo)
}
