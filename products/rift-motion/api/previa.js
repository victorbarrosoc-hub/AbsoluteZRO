// GET /previa?chave=<ZRO_CHAVE_PREVIA> — a porta da prévia (api/_previa.js): confere a chave em tempo constante, grava o
// cookie rf_previa (o HMAC da chave, nunca a chave) e manda para o site. Chave errada ou porta desligada: a página
// neutra (404), sem dizer o que faltou.
import { chaveConfere, cookiePrevia, responderNeutra } from './_previa.js'

export default function previa(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    return res.end()
  }
  const chave = new URL(req.url || '/', 'https://rift.invalid').searchParams.get('chave')
  if (!chaveConfere(chave)) return responderNeutra(res, 404)
  res.statusCode = 303
  res.setHeader('Location', '/')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Set-Cookie', [cookiePrevia()])
  res.end()
}
