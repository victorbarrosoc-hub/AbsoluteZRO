// GET /previa?chave=<ZRO_CHAVE_PREVIA> — a porta da prévia do titular (api/_previa.js): confere a chave em tempo
// constante, grava o cookie ae_previa (o HMAC da chave, nunca a chave) e manda para o editor. Chave errada ou porta
// desligada: a mesma página neutra (404) de qualquer caminho fechado, sem dizer o que faltou.
import { readFile } from 'node:fs/promises'
import { consulta, cookie, redirecionar } from './_zro.js'
import { chaveConfere, chavePrevia, COOKIE_PREVIA, DESTINO_PREVIA, PREVIA_S, selo } from './_previa.js'

const PAGINA = new URL('../em-desenvolvimento.html', import.meta.url)
const PAGINA_MINIMA =
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Absolute ZRO</title><h1>Página indisponível.</h1>'

export default async function previa(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    return res.end()
  }
  if (chaveConfere(consulta(req).get('chave'))) return redirecionar(res, 303, DESTINO_PREVIA, [cookie(COOKIE_PREVIA, selo(chavePrevia()), { maxAge: PREVIA_S, path: '/' })])
  const corpo = await readFile(PAGINA, 'utf8').catch(() => PAGINA_MINIMA)
  res.statusCode = 404
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(req.method === 'HEAD' ? undefined : corpo)
}
