// GET /api/app?caminho=app/editor.js — o editor no navegador (app/, src/, presets/), só para a conta que o HUB liberou
// enquanto o AEON está fechado ao público (api/_release.js). Esses arquivos ficam fora do site estático
// (scripts/publicar-site.mjs) e vêm no pacote desta função (includeFiles no vercel.json); o vercel.json reescreve
// /app/*, /src/* e /presets/* para cá quando o caminho não existe no estático (os módulos da marca em src/ existem).
// Sem sessão liberada: a página "Em desenvolvimento" (200) no lugar de um HTML e 403 para qualquer outro arquivo.
// Nada é listado; caminho fora dessas pastas ou com ".." é 404. Com RELEASE=released os arquivos vão para o estático e
// esta função só os repete.

import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { liberado } from './_release.js'
import { abrir, configurado, COOKIE_CONTA, lerCookie } from './_zro.js'

const RAIZ = new URL('..', import.meta.url)
/** Só o editor: nada de desktop/, scripts/, test/ ou api/. */
export const PASTAS = ['app', 'src', 'presets']
const PAGINA = 'em-desenvolvimento.html'
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}
/** Se a página neutra não veio no pacote, uma mínima igual (sem marca nem nome do app). */
const PAGINA_MINIMA =
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Absolute ZRO</title><body style="margin:0;min-height:100vh;display:grid;place-content:center;text-align:center;font:17px -apple-system,system-ui,sans-serif;color:#1d1d1f;background:#f5f5f7"><h1 style="font-weight:300;margin:0 0 10px">Página <b style="font-weight:800">indisponível.</b></h1><p style="color:#6e6e73;margin:0 0 24px">O que você procura não está aqui.</p><a href="https://absolutezro.com" style="color:inherit">Ir para a Absolute ZRO</a></body></html>'

/** Caminho relativo seguro dentro das pastas do editor ("app/" vira "app/index.html"), ou null. */
export function caminhoSeguro(v) {
  if (typeof v !== 'string' || !v || v.length > 300 || /[\0\\%]/.test(v)) return null
  const partes = v.split('/').filter((p) => p !== '' && p !== '.')
  if (!partes.length || partes.some((p) => p === '..' || p.startsWith('.'))) return null
  if (!PASTAS.includes(partes[0])) return null
  if (partes.length === 1 || v.endsWith('/')) partes.push('index.html')
  return partes.join('/')
}

function negar(res, status) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({ ok: false, message: status === 403 ? 'Indisponível.' : status === 405 ? 'Método não permitido.' : 'Não encontrado.' }))
}

async function pagina(req, res) {
  const corpo = await readFile(new URL(PAGINA, RAIZ), 'utf8').catch(() => PAGINA_MINIMA)
  res.statusCode = 200
  res.setHeader('Content-Type', TIPOS['.html'])
  res.setHeader('Cache-Control', 'no-store')
  res.end(req.method === 'HEAD' ? undefined : corpo)
}

export default async function app(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return negar(res, 405)
  }
  const caminho = caminhoSeguro(new URL(req.url || '/', 'https://aeon.invalid').searchParams.get('caminho'))
  if (!caminho) return negar(res, 404)
  const ext = extname(caminho).toLowerCase()
  const conta = configurado() ? abrir(COOKIE_CONTA, lerCookie(req, COOKIE_CONTA)) : null
  if (!liberado(conta && typeof conta.sub === 'string' ? conta : null)) return ext === '.html' ? pagina(req, res) : negar(res, 403)
  let corpo
  try {
    corpo = await readFile(new URL(caminho, RAIZ))
  } catch {
    return negar(res, 404)
  }
  res.statusCode = 200
  res.setHeader('Content-Type', TIPOS[ext] || 'application/octet-stream')
  // é da conta liberada: nada de cache compartilhado
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Length', String(corpo.length))
  res.end(req.method === 'HEAD' ? undefined : corpo)
}
