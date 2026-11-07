// GET /app/<arquivo> → os scripts e o estilo do app, só para a sessão liberada pelo gate (fora dela, 404: o app não
// lançado não aparece nem pelo código). Lista fechada de arquivos; nada de caminho vindo do pedido.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { consulta } from './_zro.js'
import { modoLocal, pessoaDe } from './_sessao.js'
import { siteAberto } from './pagina.js'

const APP = fileURLToPath(new URL('../app/', import.meta.url))
const JS = 'text/javascript; charset=utf-8'
const SVG = 'image/svg+xml'
const PNG = 'image/png'
export const ARQUIVOS = {
  'app.js': JS,
  'rtc.js': JS,
  'icones.js': JS,
  'som.js': JS,
  'qr.js': JS,
  'vendor/qrcode.mjs': JS,
  'app.css': 'text/css; charset=utf-8',
  'marca/radion-simbolo.svg': SVG,
  'marca/radion-simbolo-branco.svg': SVG,
  'marca/favicon.svg': SVG,
  'marca/radion-180.png': PNG,
  'marca/radion-192.png': PNG,
  'marca/radion-512.png': PNG,
  'marca/radion-icone.svg': SVG,
  'marca/radion-icone-escuro.svg': SVG,
  'site.css': 'text/css; charset=utf-8',
  'site/computador-claro.webp': 'image/webp',
  'site/computador-escuro.webp': 'image/webp',
  'site/celular-claro.webp': 'image/webp',
  'site/celular-escuro.webp': 'image/webp',
}
/** O que a página inicial usa: sai para todos só no lançamento (RADION_SITE_ABERTO=1). */
const DO_SITE = Object.fromEntries(Object.entries(ARQUIVOS).filter(([f]) => f.startsWith('marca/') || f.startsWith('site')))
const DO_LOCAL = { 'local.js': JS, 'app.css': 'text/css; charset=utf-8' }

export default async function recurso(req, res) {
  const f = String(consulta(req).get('f') || '')
  const liberado = pessoaDe(req) ? ARQUIVOS : modoLocal(req) ? DO_LOCAL : siteAberto() ? DO_SITE : {}
  const tipo = Object.hasOwn(liberado, f) ? liberado[f] : null
  if (!tipo) {
    res.statusCode = 404
    res.setHeader('Cache-Control', 'no-store')
    return res.end('Não encontrado')
  }
  res.statusCode = 200
  res.setHeader('Content-Type', tipo)
  res.setHeader('Cache-Control', 'private, no-cache')
  res.end(await readFile(`${APP}${f}`))
}
