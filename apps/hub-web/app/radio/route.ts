/**
 * GET /radio — o rádio do set dentro do HUB (ADR 0042). Não lançado: só para quem passa no gate (admin da plataforma ou
 * a lista de acesso); qualquer outro pedido, com ou sem sessão, é 404 sem dizer se o app existe. A página e os scripts
 * vêm de lib/radio/arquivos.ts (cópia gerada de products/radio/app), nunca de public/.
 */
import { RADIO_ARQUIVOS } from '@/lib/radio/arquivos'
import { acessoAoRadio } from '@/lib/radio'
import { db, getAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'

const nada = () => new Response('Não encontrado', { status: 404, headers: { 'cache-control': 'no-store' } })

export async function GET() {
  if (!(await acessoAoRadio(db(), await getAuth()))) return nada()
  const html = RADIO_ARQUIVOS['app.html']!.corpo.replaceAll('%BASE%', '/radio').replaceAll('%API%', '/api/v1/radio')
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' },
  })
}
