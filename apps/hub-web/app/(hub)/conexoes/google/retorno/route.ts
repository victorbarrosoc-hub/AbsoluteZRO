import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { abrirPendente, guardarConexaoGoogle, trocarCodigoGoogle } from '@zro/core'
import { createLogger, DomainError } from '@zro/observability'
import { ambienteAgenda, CONEXAO_COOKIE } from '@/lib/conexoes'
import { db, getAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'
const log = createLogger('conexoes')

/**
 * GET /conexoes/google/retorno — o Google volta aqui. Confere o cookie (cifrado, desta conta, no prazo) e o state,
 * troca o código com o PKCE, confere o id_token e as permissões, e guarda os tokens cifrados. Cancelar, negar ou
 * desmarcar a Agenda voltam para /conexoes com a mensagem certa. Nenhum token vai para log ou URL.
 */
export async function GET(req: Request) {
  const jar = await cookies()
  const bruto = jar.get(CONEXAO_COOKIE)?.value
  jar.delete({ name: CONEXAO_COOKIE, path: '/conexoes/google' })
  const auth = await getAuth()
  if (!auth) redirect('/entrar?next=%2Fconexoes')
  const amb = ambienteAgenda()
  const sp = new URL(req.url).searchParams
  let destino = '/conexoes?ok=google'
  try {
    if (!amb) throw new DomainError('external_resource_denied', 'indisponível', { motivo: 'indisponivel' })
    const pendente = abrirPendente(amb.chave, bruto)
    if (!pendente) throw new DomainError('external_resource_denied', 'expirou', { motivo: sp.get('error') === 'access_denied' ? 'cancelado' : 'expirou' })
    if (pendente.uid !== auth.user.id) throw new DomainError('external_resource_denied', 'outra conta', { motivo: 'outra_conta' })
    const t = await trocarCodigoGoogle(amb.cfg, pendente, { code: sp.get('code'), state: sp.get('state'), error: sp.get('error') })
    await guardarConexaoGoogle(db(), amb.chave, auth, t)
  } catch (e) {
    if (!(e instanceof DomainError)) log.error('conexoes.google.retorno', { error: e })
    const motivo = e instanceof DomainError && typeof e.details?.motivo === 'string' ? e.details.motivo : 'google'
    destino = `/conexoes?erro=${encodeURIComponent(motivo)}`
  }
  redirect(destino)
}
