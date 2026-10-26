'use server'
import { redirect } from 'next/navigation'
import { grantConsent, parseAuthorizeRequest, revokeAppAccess } from '@zro/auth'
import '../oidc'
import { db, getAuth } from '../session'

/**
 * "Permitir": revalida o pedido inteiro (nada vem confiado do formulário), grava o consentimento e volta para
 * /oauth/authorize, que emite o código. Voltar para a mesma origem mantém o CSP form-action 'self'.
 */
export async function approveAppAction(fd: FormData) {
  const query = String(fd.get('query') ?? '')
  const auth = await getAuth()
  if (!auth) redirect('/entrar')
  const q = new URLSearchParams(query)
  const parsed = await db().asSystem('oidc: consentimento', async (tx) => {
    const p = await parseAuthorizeRequest(tx, q)
    if (p.ok) await grantConsent(tx, auth.user.id, p.req.client.id, p.req.scopes)
    return p
  })
  if (!parsed.ok) redirect('/inicio')
  q.delete('prompt')
  redirect(`/oauth/authorize?${q.toString()}`)
}

/** Perfil › Apps com acesso. */
export async function revokeAppAction(fd: FormData) {
  const auth = await getAuth()
  if (!auth) redirect('/entrar')
  await revokeAppAccess(db(), auth.user.id, String(fd.get('clientId') ?? ''))
  redirect('/perfil/acessos#apps')
}
