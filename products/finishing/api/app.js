// GET /api/app?caminho=lut.html — as ferramentas da Revela (as páginas inicio, lut, cst, entrega e converter, com app/,
// src/ e exemplos/), só para a conta que o HUB liberou enquanto a Revela está fechada ao público (api/_release.js).
// Esses arquivos ficam fora do site estático (scripts/publicar-site.mjs) e vêm no pacote desta função (includeFiles
// no vercel.json); o vercel.json reescreve /lut, /cst, /entrega, /converter, /inicio, /app/*, /src/* e /exemplos/*
// para cá quando o caminho não existe no estático (o que a página inicial usa de app/ existe). Sem sessão liberada: a
// página "Em desenvolvimento" (200) no lugar de um HTML e 403 para qualquer outro arquivo. Nada é listado; caminho
// fora dessa lista ou com ".." é 404. Com RELEASE=released os arquivos vão para o estático e esta função só os repete.

import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { liberado } from './_release.js'
import { abrir, configurado, COOKIE_CONTA, lerCookie } from './_zro.js'

const RAIZ = new URL('..', import.meta.url)
/** As páginas das ferramentas (na raiz) e as pastas que elas carregam. vendor/ é só biblioteca e fica no estático. */
export const PAGINAS = ['inicio.html', 'lut.html', 'cst.html', 'entrega.html', 'converter.html']
export const PASTAS = ['app', 'src', 'exemplos']
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
  '.py': 'text/x-python; charset=utf-8',
}
/** Se a página não veio no pacote, uma mínima com o mesmo recado (sem dado interno). */
const PAGINA_MINIMA =
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Revela · Em desenvolvimento</title><body style="margin:0;min-height:100vh;display:grid;place-content:center;text-align:center;font:17px -apple-system,system-ui,sans-serif;color:#1d1d1f;background:#f5f5f7"><h1 style="font-weight:300;margin:0 0 10px">Em <b style="font-weight:800">desenvolvimento.</b></h1><p style="color:#6e6e73;margin:0 0 24px">A Revela chega com a sua conta Absolute ZRO.</p><a href="https://absolutezro.com/inicio" style="color:inherit">Voltar ao HUB</a></body></html>'

/** Caminho relativo seguro: uma das páginas das ferramentas ou um arquivo dentro de app/, src/ ou exemplos/; senão null. */
export function caminhoSeguro(v) {
  if (typeof v !== 'string' || !v || v.length > 300 || /[\0\\%]/.test(v)) return null
  const partes = v.split('/').filter((p) => p !== '' && p !== '.')
  if (!partes.length || partes.some((p) => p === '..' || p.startsWith('.'))) return null
  if (partes.length === 1) return PAGINAS.includes(partes[0]) ? partes[0] : null
  if (!PASTAS.includes(partes[0]) || v.endsWith('/')) return null
  return partes.join('/')
}

function negar(res, status) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({ ok: false, message: status === 403 ? 'Em desenvolvimento.' : status === 405 ? 'Método não permitido.' : 'Não encontrado.' }))
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
  const caminho = caminhoSeguro(new URL(req.url || '/', 'https://revela.invalid').searchParams.get('caminho'))
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
