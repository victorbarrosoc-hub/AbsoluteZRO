import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { abrirPendenteHiggsfield, concluirConexaoHiggsfield } from '@zro/core'
import { createLogger, DomainError } from '@zro/observability'
import { ambienteHiggsfield, CONEXAO_HF_COOKIE } from '@/lib/conexoes'
import { db, getAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'
const log = createLogger('conexoes')

/**
 * GET /conexoes/higgsfield/retorno — a Higgsfield volta aqui. Confere o cookie (cifrado, desta conta, no prazo) e o
 * state, troca o código com o PKCE e guarda os tokens cifrados. Cancelar ou negar voltam para /conexoes com a mensagem
 * certa. Nenhum token vai para log ou URL.
 */
export async function GET(req: Request) {
  const jar = await cookies()
  const bruto = jar.get(CONEXAO_HF_COOKIE)?.value
  jar.delete({ name: CONEXAO_HF_COOKIE, path: '/conexoes/higgsfield' })
  const auth = await getAuth()
  if (!auth) redirect('/entrar?next=%2Fconexoes')
  const amb = ambienteHiggsfield()
  const sp = new URL(req.url).searchParams
  let destino = '/conexoes?ok=higgsfield'
  try {
    if (!amb) throw new DomainError('external_resource_denied', 'indisponível', { motivo: 'indisponivel' })
    const pendente = abrirPendenteHiggsfield(amb.chave, bruto)
    if (!pendente) throw new DomainError('external_resource_denied', 'expirou', { motivo: sp.get('error') === 'access_denied' ? 'cancelado' : 'expirou' })
    if (pendente.uid !== auth.user.id) throw new DomainError('external_resource_denied', 'outra conta', { motivo: 'outra_conta' })
    await concluirConexaoHiggsfield(db(), amb, auth, pendente, { code: sp.get('code'), state: sp.get('state'), error: sp.get('error') })
  } catch (e) {
    if (!(e instanceof DomainError)) log.error('conexoes.higgsfield.retorno', { error: e })
    const motivo = e instanceof DomainError && typeof e.details?.motivo === 'string' ? e.details.motivo : 'higgsfield'
    destino = `/conexoes?erro=${encodeURIComponent(motivo)}`
  }
  redirect(destino)
}
