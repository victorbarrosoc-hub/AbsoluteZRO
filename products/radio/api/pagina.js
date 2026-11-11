// GET / — o RADION. Não lançado (raiz CLAUDE.md): sem sessão liberada pelo gate, a página neutra ("Página
// indisponível.", sem nome nem marca). Com acesso, o app. O app e os scripts dele moram em app/ e saem só por aqui e
// por /api/recurso (nada do app fica público no site estático).
// GET /sobre — a página inicial: prévia só para quem tem acesso. No lançamento (RADION_SITE_ABERTO=1, com a migration
// que abre o gate), ela vira o / de quem não entrou.
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

/** O RADION na Tela de Início (Safari › Compartilhar › Adicionar à Tela de Início) e o ícone do compartilhar. */
export const TOQUE = [
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
  '<link rel="manifest" href="/app/manifest.webmanifest" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-title" content="RADION" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
].join('\n    ')

/** Os marcadores do app.html no app separado (no HUB, apps/hub-web/app/radio/route.ts põe os dele). */
export const paraOAppSeparado = (html) =>
  html
    .replaceAll('%BASE%', '')
    .replaceAll('%API%', '/api/radio')
    .replaceAll('%SET_API%', '/api/zro/set')
    .replaceAll('%SET%', 'https://absolutezro.com/set/v1/zro-set.js')
    .replaceAll('%FOTO%', 'https://absolutezro.com/api/v1/foto/')
    .replaceAll('%SAIR%', '/api/zro/sair')
    .replaceAll('%TOQUE%', TOQUE)

/** A página inicial abre para todos só no lançamento (o gate do HUB abre junto; raiz CLAUDE.md). */
export const siteAberto = () => process.env.RADION_SITE_ABERTO === '1'
const site = async (entrar, texto, curto) => (await readFile(`${APP}site.html`, 'utf8')).replaceAll('%ENTRAR_TEXTO%', texto).replaceAll('%ENTRAR_CURTO%', curto).replaceAll('%ENTRAR%', entrar)

export default async function pagina(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    return res.end()
  }
  const sobre = /[?&]v=sobre(&|$)/.test(req.url || '') || /^\/sobre\/?(\?|$)/.test(req.url || '')
  const pessoa = pessoaDe(req)
  if (pessoa && sobre) return html(res, await site('/', 'Abrir o rádio', 'Abrir'))
  if (pessoa) return html(res, paraOAppSeparado(await readFile(`${APP}app.html`, 'utf8')))
  if (modoLocal(req)) return html(res, await readFile(`${APP}local.html`, 'utf8'))
  if (siteAberto()) return html(res, await site('/entrar', 'Entrar com a Absolute ZRO', 'Entrar'))
  return html(res, await readFile(`${APP}indisponivel.html`, 'utf8'))
}
