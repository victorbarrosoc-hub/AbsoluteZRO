import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { clienteHiggsfield, inicioConexaoHiggsfield, minhaHiggsfield, selarPendenteHiggsfield } from '@zro/core'
import { createLogger } from '@zro/observability'
import { ambienteHiggsfield, CONEXAO_HF_COOKIE, conexaoHfCookieOptions } from '@/lib/conexoes'
import { db, getAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'
const log = createLogger('conexoes')

/**
 * GET /conexoes/higgsfield — começa a conexão da Higgsfield (migration 0052): o HUB se registra na Higgsfield na
 * primeira vez, e o state e o PKCE S256 vão num cookie cifrado de 10 min, só em /conexoes/higgsfield, preso à conta
 * que começou. Sem app que use a Higgsfield visível para a pessoa, volta para /conexoes.
 */
export async function GET() {
  const auth = await getAuth()
  if (!auth) redirect('/entrar?next=%2Fconexoes')
  const amb = ambienteHiggsfield()
  if (!amb) redirect('/conexoes?erro=indisponivel')
  const { visivel } = await minhaHiggsfield(db(), auth)
  if (!visivel) redirect('/conexoes')
  let url: string
  try {
    const clientId = await clienteHiggsfield(db(), amb.cfg)
    const ida = inicioConexaoHiggsfield(amb.cfg, clientId, auth.user.id)
    ;(await cookies()).set(CONEXAO_HF_COOKIE, selarPendenteHiggsfield(amb.chave, ida.pendente), conexaoHfCookieOptions)
    url = ida.url
  } catch (e) {
    log.warn('conexoes.higgsfield.inicio', { error: e })
    redirect('/conexoes?erro=higgsfield')
  }
  redirect(url)
}
