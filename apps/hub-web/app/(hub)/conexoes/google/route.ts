import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { inicioConexaoGoogle, selarPendente } from '@zro/core'
import { ambienteAgenda, CONEXAO_COOKIE, conexaoCookieOptions } from '@/lib/conexoes'
import { getAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * GET /conexoes/google — começa a conexão do Google Agenda (ADR 0026): state, nonce e PKCE S256 num cookie cifrado de
 * 10 min, só em /conexoes/google, preso à conta que começou. Sem sessão, entra antes e volta para /conexoes.
 */
export async function GET() {
  const auth = await getAuth()
  if (!auth) redirect('/entrar?next=%2Fconexoes')
  const amb = ambienteAgenda()
  if (!amb) redirect('/conexoes?erro=indisponivel')
  const { url, pendente } = inicioConexaoGoogle(amb.cfg, auth.user.id)
  ;(await cookies()).set(CONEXAO_COOKIE, selarPendente(amb.chave, pendente), conexaoCookieOptions)
  redirect(url)
}
