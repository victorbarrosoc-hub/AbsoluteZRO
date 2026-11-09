// /api/zro/* — o login único, o Set, a Z, a Higgsfield e os sons numa função só. O plano grátis da Vercel (Hobby, o team
// ZROFREE do titular) aceita no máximo 12 funções por deploy, e cada arquivo de api/zro/ era uma. Os handlers moram em
// api/_zro_rotas/ (pasta com "_": a Vercel não transforma em função) com o mesmo código de antes; o vercel.json reescreve
// /api/zro/<caminho> para /api/conta?c=<caminho> e esta função devolve ao handler o endereço original
// (/api/zro/<caminho>?<consulta>), exatamente o que ele recebia quando era uma função própria. Os [id] dos nomes de
// arquivo viram req.query.id, como a Vercel fazia. Caminho que não é de nenhum handler: o 404 do site (a página neutra).

import { readFile } from 'node:fs/promises'
import callback from './_zro_rotas/callback.js'
import entrar from './_zro_rotas/entrar.js'
import eu from './_zro_rotas/eu.js'
import sair from './_zro_rotas/sair.js'
import set from './_zro_rotas/set.js'
import higgsfield from './_zro_rotas/higgsfield/index.js'
import higgsfieldGerar from './_zro_rotas/higgsfield/gerar.js'
import iaEstado from './_zro_rotas/ia/estado.js'
import iaMensagens from './_zro_rotas/ia/mensagens.js'
import iaConversas from './_zro_rotas/ia/conversas/index.js'
import iaConversa from './_zro_rotas/ia/conversas/[id].js'
import sonsBuscar from './_zro_rotas/sons/buscar.js'
import sonsBanco from './_zro_rotas/sons/banco/index.js'
import sonsBancoId from './_zro_rotas/sons/banco/[id].js'
import sonsOpenverseId from './_zro_rotas/sons/openverse/[id].js'
import sonsZro from './_zro_rotas/sons/zro/index.js'
import sonsZroId from './_zro_rotas/sons/zro/[id].js'

/** [padrão do caminho depois de /api/zro/, handler]. `:id` casa um segmento (o [id] do arquivo); `*` o resto. */
export const ROTAS = [
  ['callback', callback],
  ['entrar', entrar],
  ['eu', eu],
  ['sair', sair],
  ['set', set],
  ['set/*', set],
  ['higgsfield', higgsfield],
  ['higgsfield/gerar', higgsfieldGerar],
  ['ia/estado', iaEstado],
  ['ia/mensagens', iaMensagens],
  ['ia/conversas', iaConversas],
  ['ia/conversas/:id', iaConversa],
  ['sons/buscar', sonsBuscar],
  ['sons/banco', sonsBanco],
  ['sons/banco/:id', sonsBancoId],
  ['sons/openverse/:id', sonsOpenverseId],
  ['sons/zro', sonsZro],
  ['sons/zro/:id', sonsZroId],
]

/** O handler e os parâmetros de um caminho ("ia/conversas/abc" → { handler, params: { id: 'abc' } }), ou null. */
export function rota(caminho) {
  const partes = String(caminho || '')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
  if (partes.some((p) => p === '' || p === '.' || p === '..')) return null
  for (const [padrao, handler] of ROTAS) {
    const molde = padrao.split('/')
    const params = {}
    let ok = true
    for (let i = 0; i < molde.length; i++) {
      if (molde[i] === '*') {
        ok = partes.length > i
        break
      }
      if (i >= partes.length) {
        ok = false
        break
      }
      if (molde[i] === ':id') params.id = partes[i]
      else if (molde[i] !== partes[i]) {
        ok = false
        break
      }
    }
    if (ok && (molde.includes('*') || molde.length === partes.length)) return { handler, params }
  }
  return null
}

/**
 * O endereço que o handler recebia antes do rewrite: /api/zro/<c>?<a consulta sem o c>. Sem `c` (chamada direta, o
 * servidor de testes), o próprio endereço.
 */
export function enderecoOriginal(url) {
  const u = new URL(url || '/', 'https://site.invalid')
  if (!u.searchParams.has('c')) return { caminho: u.pathname.replace(/^\/api\/zro\/?/, ''), url: u.pathname + u.search }
  const caminho = u.searchParams.get('c') || ''
  u.searchParams.delete('c')
  const segmentos = caminho
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')
  const resto = u.searchParams.toString()
  return { caminho, url: `/api/zro/${segmentos}${resto ? `?${resto}` : ''}` }
}

const NEUTRA = new URL('../em-desenvolvimento.html', import.meta.url)
const NEUTRA_MINIMA =
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Absolute ZRO</title><h1>Página indisponível.</h1>'

export default async function conta(req, res) {
  const { caminho, url } = enderecoOriginal(req.url)
  const r = rota(caminho)
  if (!r) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    return res.end(await readFile(NEUTRA, 'utf8').catch(() => NEUTRA_MINIMA))
  }
  req.url = url
  const q = Object.fromEntries(new URL(url, 'https://site.invalid').searchParams)
  req.query = { ...q, ...r.params }
  return r.handler(req, res)
}
