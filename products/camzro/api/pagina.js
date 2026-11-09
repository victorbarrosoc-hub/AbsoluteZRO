// GET / — o CAMZRO. Não lançado (raiz CLAUDE.md): sem passar por uma das portas de api/_sessao.js (conta com o gate,
// prévia do titular ou modo local), a página neutra ("Página indisponível.", sem nome nem marca). Com acesso, o app.
// O app e os scripts dele moram em app/ e saem só por aqui e por /api/recurso (nada fica no site estático).
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

export default async function pagina(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    return res.end()
  }
  const pessoa = pessoaDe(req)
  if (pessoa) {
    res.setHeader('X-Camzro', 'app') // o service worker só guarda a página com este carimbo (nunca a neutra)
    return html(res, 200, montar(await readFile(`${APP}app.html`, 'utf8'), pessoa))
  }
  return html(res, 200, await readFile(`${APP}indisponivel.html`, 'utf8'))
}
