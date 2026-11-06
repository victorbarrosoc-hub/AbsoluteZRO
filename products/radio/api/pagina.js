// GET / — a página do rádio. Não lançado (raiz CLAUDE.md): sem sessão liberada pelo gate, a página neutra
// ("Página indisponível.", sem nome nem marca). Com acesso, o app. O app e os scripts dele moram em app/ e saem só por
// aqui e por /api/recurso (nada do app fica público no site estático).
//
// Modo local (api/_sessao.js): sem a pessoa escolhida ainda, a tela de "Seu nome" para testar em dois aparelhos.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { modoLocal, pessoaDe } from './_sessao.js'

const APP = fileURLToPath(new URL('../app/', import.meta.url))

function html(res, corpo) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(corpo)
}

export default async function pagina(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    return res.end()
  }
  if (pessoaDe(req)) return html(res, (await readFile(`${APP}app.html`, 'utf8')).replaceAll('%BASE%', '').replaceAll('%API%', '/api/radio'))
  if (modoLocal(req)) return html(res, await readFile(`${APP}local.html`, 'utf8'))
  return html(res, await readFile(`${APP}indisponivel.html`, 'utf8'))
}
