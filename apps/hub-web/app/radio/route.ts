/**
 * GET /radio — o rádio do set dentro do HUB (ADR 0042). Não lançado: só para quem passa no gate (admin da plataforma ou
 * a lista de acesso). Sem sessão (o link aberto num navegador que não está na conta, como o de dentro do WhatsApp ou do
 * Instagram), vai para o entrar da Absolute ZRO e volta para cá, com o código da diária; nada do app aparece no caminho.
 * Com sessão e sem acesso, 404 sem dizer se o app existe. A página e os scripts vêm de lib/radio/arquivos.ts (cópia
 * gerada de products/radio/app), nunca de public/.
 */
import { RADIO_ARQUIVOS } from '@/lib/radio/arquivos'
import { acessoAoRadio } from '@/lib/radio'
import { db, getAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'

const nada = () => new Response('Não encontrado', { status: 404, headers: { 'cache-control': 'no-store' } })

/** /radio e, se veio, o código da diária (6 letras): o resto do endereço não volta. */
function voltaDoRadio(url: string): string {
  const d = new URL(url).searchParams.get('d')
  return d && /^[A-Za-z0-9]{6}$/.test(d) ? `/radio?d=${d}` : '/radio'
}

export async function GET(req: Request) {
  const auth = await getAuth()
  if (!auth) {
    const destino = new URL(`/entrar?next=${encodeURIComponent(voltaDoRadio(req.url))}`, req.url)
    return new Response(null, { status: 303, headers: { location: destino.pathname + destino.search, 'cache-control': 'no-store' } })
  }
  if (!(await acessoAoRadio(db(), auth))) return nada()
  const html = RADIO_ARQUIVOS['app.html']!.corpo.replaceAll('%BASE%', '/radio').replaceAll('%API%', '/api/v1/radio')
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' },
  })
}
