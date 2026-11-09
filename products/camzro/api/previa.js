// GET /previa?chave=<ZRO_CHAVE_PREVIA> — a porta da prévia do titular (api/_sessao.js): confere a chave em tempo
// constante, grava o cookie cz_previa (o HMAC da chave, nunca a chave) e manda para /. Chave errada ou porta
// desligada: a mesma página neutra de quem não tem acesso, sem dizer o que faltou.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { consulta, cookie, redirecionar } from './_zro.js'
import { chaveConfere, chavePrevia, COOKIE_PREVIA, PREVIA_S, selo } from './_sessao.js'

const NEUTRA = fileURLToPath(new URL('../app/indisponivel.html', import.meta.url))

export default async function previa(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    return res.end()
  }
  const chave = consulta(req).get('chave')
  if (chaveConfere(chave)) return redirecionar(res, 303, '/', [cookie(COOKIE_PREVIA, selo(chavePrevia()), { maxAge: PREVIA_S, path: '/' })])
  res.statusCode = 404
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(await readFile(NEUTRA, 'utf8'))
}
