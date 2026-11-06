// GET /app/<arquivo> → os scripts e o estilo do app, só para a sessão liberada pelo gate (fora dela, 404: o app não
// lançado não aparece nem pelo código). Lista fechada de arquivos; nada de caminho vindo do pedido.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { consulta } from './_zro.js'
import { modoLocal, pessoaDe } from './_sessao.js'

const APP = fileURLToPath(new URL('../app/', import.meta.url))
const JS = 'text/javascript; charset=utf-8'
export const ARQUIVOS = { 'app.js': JS, 'rtc.js': JS, 'icones.js': JS, 'som.js': JS, 'qr.js': JS, 'vendor/qrcode.mjs': JS, 'app.css': 'text/css; charset=utf-8' }
const DO_LOCAL = { 'local.js': JS, 'app.css': 'text/css; charset=utf-8' }

export default async function recurso(req, res) {
  const f = String(consulta(req).get('f') || '')
  const liberado = pessoaDe(req) ? ARQUIVOS : modoLocal(req) ? DO_LOCAL : {}
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
