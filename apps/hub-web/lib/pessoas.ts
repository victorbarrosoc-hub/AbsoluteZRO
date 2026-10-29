import 'server-only'
/**
 * Perfil profissional com @ (ADR 0029) do lado do HUB: o formato que a API devolve aos apps (foto com endereço
 * inteiro) e o aviso do convite por @, mandado direto à pessoa. Quem convidou nunca recebe o e-mail dela.
 */
import { defaultSender, type Authenticated } from '@zro/auth'
import { emailDoConvidado, type PerfilPublico } from '@zro/core'
import { DomainError } from '@zro/observability'
import { appOrigin, showDevLinks } from './env'
import { db } from './session'
import { emailConvite } from './email/modelos'

const mail = defaultSender()

/** Para a API: a foto vira endereço inteiro (o app mostra sem cookie do HUB). */
export function perfilParaApp(p: PerfilPublico) {
  return { ...p, foto: p.foto ? `${appOrigin}${p.foto}` : null, perfil: `${appOrigin}/pessoas/@${p.arroba}` }
}

/** Só um app da família usa a API de pessoas (a central usa as telas). */
export function exigirApp(auth: Authenticated | null): Authenticated {
  if (!auth?.session.app) throw new DomainError('action_not_allowed', 'Só um app da família usa a busca de pessoas pela API.', { erro: 'so_app' })
  return auth
}

/**
 * Manda o aviso do convite por @ ao e-mail da conta convidada. Sem provedor de e-mail, devolve o link para a tela de
 * quem convidou só fora de produção (o mesmo do convite por e-mail); a pessoa também vê o convite em Equipe.
 */
export async function avisarConvitePorArroba(invitationId: string, token: string): Promise<{ enviado: boolean; devLink?: string }> {
  const link = `${appOrigin}/convite?token=${encodeURIComponent(token)}`
  const email = await emailDoConvidado(db(), invitationId)
  if (email && mail.deliveryAvailable) {
    const enviado = await mail
      .send(emailConvite(email, link))
      .then(() => true)
      .catch(() => false)
    return { enviado, devLink: showDevLinks ? link : undefined }
  }
  return { enviado: false, devLink: showDevLinks ? link : undefined }
}
