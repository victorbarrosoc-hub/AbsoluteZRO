// GET /e/<token> → a página do visitante (evento/evento.html), só para link vivo; link desconhecido, revogado, vencido
// ou de evento encerrado recebe a página neutra (app/indisponivel.html), a mesma de qualquer endereço que não existe.
// Molde: api/galeria.js. A página não leva o nome nem o ícone do produto (ele não está lançado): assina Absolute ZRO.
//
// Os arquivos da página saem por /e/<token>/<arquivo> (evento/*.css|js) e o worker do rosto com o núcleo que ele
// importa, por /e/<token>/app/rosto/*, /e/<token>/app/trabalho/servir.js e /e/<token>/src/rosto/* (lista fechada,
// só para link vivo): os imports relativos funcionam igual aqui e no app do fotógrafo (/app/rosto/, pelo gate). O
// runtime e os modelos vêm de /vendor e /modelos (site estático, sem marca, cache imutável).
//
// Só aqui a câmera é permitida (Permissions-Policy camera=(self) no vercel.json, para /e/*): a selfie é ao vivo.
// A página já sai com o cookie do aparelho (`foto_ap`, HttpOnly, assinado): o limite fino de buscas é por aparelho, não
// por rede (num evento todo mundo sai pelo mesmo Wi-Fi). Ele não diz quem a pessoa é; só conta buscas.

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { aparelhoDe, cookieDoAparelho, eventoVivo, novoAparelho } from './_evento.js'
import { ehToken, linkLigado } from './_link.js'
import { consulta, origemDoPedido } from './_zro.js'
import { neutra, temaDe } from './pagina.js'

const RAIZ = new URL('../', import.meta.url)
/** O que a página pode pedir além de evento/: pasta → arquivos. */
export const PERMITIDOS = {
  '': /^[a-z0-9-]{1,40}\.(css|js)$/,
  'app-rosto': /^(worker|motor)\.js$/,
  'app-trabalho': /^servir\.js$/,
  'src-rosto': /^(alinhar|assinatura|decidir|detectar|qualidade|quadros|textos|vida)\.js$/,
}
const PASTAS = { '': 'evento/', 'app-rosto': 'app/rosto/', 'app-trabalho': 'app/trabalho/', 'src-rosto': 'src/rosto/' }
const TIPOS = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }

export default async function pagina(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, HEAD')
    res.setHeader('Cache-Control', 'no-store')
    return res.end()
  }
  const q = consulta(req)
  const token = q.get('t')
  const arquivo = q.get('f')
  const pasta = q.get('d') ?? ''
  const regra = PERMITIDOS[pasta]
  if (!linkLigado(req) || !ehToken(token) || !regra || (arquivo != null && !regra.test(arquivo)) || (arquivo == null && pasta)) return neutra(req, res, 404)
  const estado = await eventoVivo(req, token)
  if (estado !== 'ok') return neutra(req, res, estado === 'limite' ? 429 : 404)

  let corpo
  try {
    corpo = await readFile(new URL(`${PASTAS[pasta]}${arquivo ?? 'evento.html'}`, RAIZ))
  } catch {
    return neutra(req, res, 404)
  }
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (!arquivo) {
    const tema = temaDe(req)
    const html = corpo
      .toString('utf8')
      .replaceAll('%BASE%', `/e/${token}`)
      .replaceAll('%TEMA%', tema)
      .replaceAll('%COR_TEMA%', tema === 'escuro' ? '#0e0e10' : '#f5f5f7')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    if (!aparelhoDe(req)) res.setHeader('Set-Cookie', [cookieDoAparelho(novoAparelho(), origemDoPedido(req).startsWith('https://'))])
    return res.end(req.method === 'HEAD' ? undefined : html)
  }
  const etag = `W/"${createHash('sha256').update(corpo).digest('base64url').slice(0, 27)}"`
  res.setHeader('Cache-Control', 'private, no-cache')
  res.setHeader('ETag', etag)
  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304
    return res.end()
  }
  res.statusCode = 200
  res.setHeader('Content-Type', TIPOS[extname(arquivo)])
  res.setHeader('Content-Length', String(corpo.length))
  res.end(req.method === 'HEAD' ? undefined : corpo)
}
