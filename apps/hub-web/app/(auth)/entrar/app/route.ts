import { redirect } from 'next/navigation'
import { parseDesktopLoginRequest } from '@zro/auth'
import { desktopLoginQuery } from '@/lib/desktop-login'

export const dynamic = 'force-dynamic'

/**
 * GET /entrar/app?app=relay&state=…&challenge=…&next=/… — o app de computador abre este endereço no navegador do
 * sistema (ADR 0041). Confere o pedido (app na lista fechada, state e desafio PKCE no formato, `next` só caminho do HUB)
 * e segue para a tela de confirmação, que pede a entrada se a pessoa ainda não entrou. Pedido inválido não vai a lugar
 * nenhum: volta para a tela de entrar com um aviso.
 */
export async function GET(req: Request) {
  const parsed = parseDesktopLoginRequest(new URL(req.url).searchParams)
  if (!parsed.ok) redirect('/entrar?erro=app')
  redirect(`/entrar/app/confirmar?${desktopLoginQuery(parsed.req)}`)
}
