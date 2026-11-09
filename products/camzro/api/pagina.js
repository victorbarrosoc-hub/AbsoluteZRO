// GET / — o CAMZRO. Não lançado (raiz CLAUDE.md): sem passar por uma das portas de api/_sessao.js (conta com o gate,
// prévia do titular ou modo local), a página neutra ("Página indisponível.", sem nome nem marca). Com acesso, o app.
// GET /sobre (ou ?v=sobre) — a página inicial: prévia só para quem passou por uma porta. No lançamento
// (CAMZRO_SITE_ABERTO=1, junto com a migration que abre o gate), ela vira o / de quem não entrou, com o botão de entrar.
// O app, a página e os scripts moram em app/ e saem só por aqui e por /api/recurso (nada fica no site estático).
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pessoaDe } from './_sessao.js'

const APP = fileURLToPath(new URL('../app/', import.meta.url))

function html(res, status, corpo) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(corpo)
}

/** Os marcadores do app.html: quem é (para a tela) e o que do ecossistema está ligado. */
export function montar(modelo, pessoa) {
  const conta = pessoa.tipo === 'conta'
  return modelo
    .replaceAll('%MODO%', pessoa.tipo)
    .replaceAll('%NOME%', String(pessoa.nome).replace(/[<>"&']/g, ''))
    .replaceAll('%SET%', conta ? 'https://absolutezro.com/set/v1/zro-set.js' : '')
    .replaceAll('%SET_API%', conta ? '/api/zro/set' : '')
    .replaceAll('%SAIR%', conta ? '/api/zro/sair' : '')
}

/** A página inicial abre para todos só no lançamento (o gate do HUB abre junto; raiz CLAUDE.md). */
export const siteAberto = () => process.env.CAMZRO_SITE_ABERTO === '1'

/** A página inicial com a ação principal: "Abrir a câmera" (/) para quem passou; "Entrar" (/entrar) no lançamento. */
export const site = async (entrar, texto, curto) => (await readFile(`${APP}site.html`, 'utf8')).replaceAll('%ENTRAR_TEXTO%', texto).replaceAll('%ENTRAR_CURTO%', curto).replaceAll('%ENTRAR%', entrar)

export const pedeSobre = (req) => /[?&]v=sobre(&|$)/.test(req.url || '') || /^\/sobre\/?(\?|$)/.test(req.url || '')

export default async function pagina(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    return res.end()
  }
  const pessoa = pessoaDe(req)
  if (pessoa && pedeSobre(req)) return html(res, 200, await site('/', 'Abrir a câmera', 'Abrir'))
  if (pessoa) {
    res.setHeader('X-Camzro', 'app') // o service worker só guarda a página com este carimbo (nunca a neutra)
    return html(res, 200, montar(await readFile(`${APP}app.html`, 'utf8'), pessoa))
  }
  if (siteAberto()) return html(res, 200, await site('/entrar', 'Entrar com a Absolute ZRO', 'Entrar'))
  return html(res, 200, await readFile(`${APP}indisponivel.html`, 'utf8'))
}
