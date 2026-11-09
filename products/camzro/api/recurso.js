// GET /app/<arquivo> (e /sw.js) → os scripts, o estilo e a marca do app, só para quem passou por uma das portas de
// api/_sessao.js (fora delas, 404: o app não lançado não aparece nem pelo código). Lista fechada de arquivos, montada
// da pasta app/ na hora de carregar; nada de caminho vindo do pedido. Os arquivos da página inicial (site.css, site.js,
// site/*, marca/*, manifest) saem para todos só no lançamento (CAMZRO_SITE_ABERTO=1); o resto do app, nunca sem porta.
import { readFile } from 'node:fs/promises'
import { readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { consulta } from './_zro.js'
import { pessoaDe } from './_sessao.js'
import { siteAberto } from './pagina.js'

const APP = fileURLToPath(new URL('../app/', import.meta.url))
const TIPOS = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
}
const FORA = new Set(['app.html', 'indisponivel.html', 'site.html'])

function listar(dir) {
  const r = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) r.push(...listar(p))
    else r.push(p)
  }
  return r
}

/** { 'app.js': tipo, 'motor/camera.js': tipo, … } — só as extensões conhecidas, nunca as páginas. */
export const ARQUIVOS = Object.fromEntries(
  listar(APP)
    .map((p) => relative(APP, p).split('\\').join('/'))
    .filter((f) => TIPOS[extname(f)] && !FORA.has(f))
    .map((f) => [f, TIPOS[extname(f)]]),
)
/** O que a página inicial usa: sai para todos só no lançamento (CAMZRO_SITE_ABERTO=1). */
export const DO_SITE = Object.fromEntries(Object.entries(ARQUIVOS).filter(([f]) => f.startsWith('marca/') || f.startsWith('site') || f === 'manifest.webmanifest'))

export default async function recurso(req, res) {
  const f = String(consulta(req).get('f') || '')
  const liberado = pessoaDe(req) ? ARQUIVOS : siteAberto() ? DO_SITE : {}
  const tipo = Object.hasOwn(liberado, f) ? liberado[f] : null
  if (!tipo) {
    res.statusCode = 404
    res.setHeader('Cache-Control', 'no-store')
    return res.end('Não encontrado')
  }
  res.statusCode = 200
  res.setHeader('Content-Type', tipo)
  res.setHeader('Cache-Control', 'private, no-cache')
  if (f === 'sw.js') res.setHeader('Service-Worker-Allowed', '/')
  res.end(await readFile(`${APP}${f}`))
}
