// GET / com a porta de prévia ligada (o estático não tem index.html; publicar.mjs): o site para quem tem a chave e a
// página neutra para o resto. Sem a porta (projeto oficial) o estático responde antes e esta função não é chamada; se
// for, serve o mesmo site, sem diferença.
import { montarSite } from '../publicar.mjs'
import { emPrevia, previaLigada, responderNeutra } from './_previa.js'

let site = null

export default function pagina(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    return res.end()
  }
  if (previaLigada() && !emPrevia(req)) return responderNeutra(res, 200)
  site ??= montarSite()
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (previaLigada()) res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  res.end(req.method === 'HEAD' ? undefined : site.html)
}
