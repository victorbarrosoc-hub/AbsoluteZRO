// GET /previa?chave=<ZRO_CHAVE_PREVIA> — a porta da prévia (api/_previa.js): confere a chave em tempo constante, grava o
// cookie rv_previa (o HMAC da chave, nunca a chave) e leva para /inicio. Chave errada ou porta desligada: a mesma página
// neutra de quem não tem acesso (200, como as ferramentas negadas), sem dizer o que faltou.
import { readFile } from 'node:fs/promises'
import { consulta, cookie, redirecionar } from './_zro.js'
import { chaveConfere, chavePrevia, COOKIE_PREVIA, DESTINO_PREVIA, PREVIA_S, selo } from './_previa.js'

const NEUTRA = new URL('../em-desenvolvimento.html', import.meta.url)

export default async function previa(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, HEAD')
    return res.end()
  }
  if (chaveConfere(consulta(req).get('chave'))) return redirecionar(res, 303, DESTINO_PREVIA, [cookie(COOKIE_PREVIA, selo(chavePrevia()), { maxAge: PREVIA_S, path: '/' })])
  const corpo = await readFile(NEUTRA, 'utf8').catch(() => 'Página indisponível.')
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(req.method === 'HEAD' ? undefined : corpo)
}
