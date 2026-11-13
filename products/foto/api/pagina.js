// GET / — a plataforma de fotos. Não lançada (raiz CLAUDE.md): sem sessão liberada pelo gate (claim zro_release.foto),
// a página neutra ("Página indisponível.", sem nome nem marca). Com acesso, a casca do app (app/index.html). O app e o
// núcleo moram em app/ e src/ e saem só por aqui e por /api/recurso: nada deles fica no site estático.
//
// O nome do produto mora só em app/nome.js: a casca e o manifesto levam %NOME% e %ASSINATURA%, trocados aqui.
// Tema sem piscar e sem script inline (a CSP não deixa): o cookie foto_tema (claro | escuro, gravado pela tela) vira o
// data-tema do <html> já na resposta. Claro é o padrão.
//
// Modo local (api/_sessao.js): a primeira visita cria a pessoa deste navegador e já abre a casca.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { ASSINATURA, NOME } from '../app/nome.js'
import { cookieLocal } from './local.js'
import { modoLocal, pessoaDe } from './_sessao.js'
import { lerCookie } from './_zro.js'

const APP = fileURLToPath(new URL('../app/', import.meta.url))
export const COOKIE_TEMA = 'foto_tema'
const HTML = 'text/html; charset=utf-8'
/** Se a página neutra não veio no pacote, uma mínima igual (sem marca nem nome do app). */
const NEUTRA_MINIMA =
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Absolute ZRO</title><body style="margin:0;min-height:100vh;display:grid;place-content:center;text-align:center;font:17px -apple-system,system-ui,sans-serif;color:#1d1d1f;background:#f5f5f7"><h1 style="font-weight:300;margin:0 0 10px">Página <b style="font-weight:800">indisponível.</b></h1><p style="color:#6e6e73;margin:0 0 24px">O que você procura não está aqui.</p><a href="https://absolutezro.com" style="color:inherit">Ir para a Absolute ZRO</a></body></html>'

const escaparHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const escaparJson = (t) => JSON.stringify(String(t)).slice(1, -1)

/** Troca %NOME% e %ASSINATURA% pelo que está em app/nome.js. `como`: 'html' (padrão) ou 'json' (o manifesto). */
export function comNome(texto, como = 'html') {
  const e = como === 'json' ? escaparJson : escaparHtml
  return String(texto).replaceAll('%NOME%', e(NOME)).replaceAll('%ASSINATURA%', e(ASSINATURA))
}

/** O tema escolhido na tela (cookie foto_tema). Qualquer outra coisa é claro. */
export const temaDe = (req) => (lerCookie(req, COOKIE_TEMA) === 'escuro' ? 'escuro' : 'claro')

/** A casca do app para quem passou pelo gate: nome, assinatura e tema já no HTML. */
export async function casca(req) {
  const tema = temaDe(req)
  return comNome(await readFile(`${APP}index.html`, 'utf8'))
    .replaceAll('%TEMA%', tema)
    .replaceAll('%COR_TEMA%', tema === 'escuro' ? '#0e0e10' : '#f5f5f7')
}

function html(req, res, status, corpo, cookies = []) {
  res.statusCode = status
  res.setHeader('Content-Type', HTML)
  res.setHeader('Cache-Control', 'no-store')
  if (cookies.length) res.setHeader('Set-Cookie', cookies)
  res.end(req.method === 'HEAD' ? undefined : corpo)
}

/** A página neutra: 200 no lugar do app, 404 no lugar de qualquer arquivo (nada diz que ele existe). */
export async function neutra(req, res, status = 200) {
  return html(req, res, status, await readFile(`${APP}indisponivel.html`, 'utf8').catch(() => NEUTRA_MINIMA))
}

export default async function pagina(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, HEAD')
    res.setHeader('Cache-Control', 'no-store')
    return res.end()
  }
  if (pessoaDe(req)) return html(req, res, 200, await casca(req))
  if (modoLocal(req)) return html(req, res, 200, await casca(req), [cookieLocal('Você')])
  return neutra(req, res)
}
