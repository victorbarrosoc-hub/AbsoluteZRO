// Roteador das rotas da API (plano grátis da Vercel: no máximo 12 funções por deploy). Cada grupo de rotas vira UMA
// função (api/conta.js para /api/zro/*, api/dados.js para /api/rift/*); os handlers moram em api/_rotas/ (pasta com
// "_": a Vercel não transforma em função, mas leva no pacote pelo import estático).
//
// O caminho chega de dois jeitos: na Vercel, o vercel.json reescreve /api/zro/<c> para /api/conta?c=<c>; no teste e no
// servidor local, o caminho vem direto (/api/zro/<c>). Antes de chamar o handler, o pedido volta a ter o endereço
// público de antes (/api/zro/<c>?<a consulta original, sem o c>): o handler vê exatamente o que via quando era uma função
// só dele. Caminho que não existe = a página neutra com 404 (nada diz que a rota existiria).

import { responderNeutra } from './_previa.js'

/** O caminho pedido (sem barras nas pontas), de ?c= ou do próprio endereço. */
export function caminhoDe(url, prefixo) {
  const u = new URL(url || '/', 'https://rift.invalid')
  const c = u.searchParams.get('c') ?? (u.pathname.startsWith(`${prefixo}/`) ? decodeURIComponent(u.pathname.slice(prefixo.length + 1)) : '')
  return String(c).replace(/^\/+|\/+$/g, '')
}

/** A consulta original, crua (sem reencodar), sem o parâmetro c da reescrita. */
export function consultaSemC(url) {
  const i = String(url || '').indexOf('?')
  if (i < 0) return ''
  const partes = String(url)
    .slice(i + 1)
    .split('&')
    .filter((p) => p && p.split('=')[0] !== 'c')
  return partes.length ? `?${partes.join('&')}` : ''
}

/** rotas = { 'eu': handler, 'higgsfield/gerar': handler, … } sob o prefixo público (ex.: '/api/zro'). */
export function roteador(prefixo, rotas) {
  return async function rotear(req, res) {
    const c = caminhoDe(req.url, prefixo)
    const f = Object.hasOwn(rotas, c) ? rotas[c] : null
    if (!f) return responderNeutra(res, 404)
    req.url = `${prefixo}/${c}${consultaSemC(req.url)}`
    return f(req, res)
  }
}
