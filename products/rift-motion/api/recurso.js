// GET /<arquivo> com a porta de prévia ligada: os scripts, o three.js e a marca do site, só para quem tem a chave (fora
// dela, a página neutra com 404: nada diz que o arquivo existe). Lista fechada; nada de caminho vindo do pedido. Sem a
// porta (projeto oficial), o estático responde antes; se esta função for chamada, serve o mesmo arquivo.
import { readFileSync, readdirSync } from 'node:fs'
import { montarSite } from '../publicar.mjs'
import { emPrevia, previaLigada, responderNeutra } from './_previa.js'

const JS = 'text/javascript; charset=utf-8'
const RAIZ = new URL('../', import.meta.url)
const MARCA = new URL('../marca/', import.meta.url)
let site = null
const doSite = (k) => () => (site ??= montarSite())[k]
const arquivo = (caminho) => () => readFileSync(new URL(caminho, RAIZ))

/** O que pode sair: caminho público → [tipo, conteúdo]. */
export const ARQUIVOS = {
  'tema.js': [JS, doSite('tema')],
  'app.js': [JS, doSite('js')],
  'vendor/three-r128.min.js': [JS, arquivo('vendor/three-r128.min.js')],
  'favicon.svg': ['image/svg+xml', arquivo('marca/favicon.svg')],
  'apple-touch-icon.png': ['image/png', arquivo('marca/rift-icone-180.png')],
  'og.png': ['image/png', arquivo('marca/og.png')],
}
for (const f of readdirSync(MARCA)) {
  if (f.endsWith('.svg')) ARQUIVOS[`marca/${f}`] = ['image/svg+xml', arquivo(`marca/${f}`)]
  else if (f.endsWith('.png')) ARQUIVOS[`marca/${f}`] = ['image/png', arquivo(`marca/${f}`)]
}

export default function recurso(req, res) {
  const f = String(new URL(req.url || '/', 'https://rift.invalid').searchParams.get('f') || '')
  if ((previaLigada() && !emPrevia(req)) || !Object.hasOwn(ARQUIVOS, f)) return responderNeutra(res, 404)
  const [tipo, conteudo] = ARQUIVOS[f]
  res.statusCode = 200
  res.setHeader('Content-Type', tipo)
  res.setHeader('Cache-Control', previaLigada() ? 'private, no-cache' : 'public, max-age=3600')
  res.end(conteudo())
}
