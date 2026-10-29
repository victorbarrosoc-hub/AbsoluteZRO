/**
 * Excluir a conta (pedido do titular, 28/10/2026). A pessoa exclui a própria conta Absolute ZRO em Sua conta ›
 * Segurança, confirmando com a senha atual (ou, sem senha, com o próprio e-mail).
 *
 * O que acontece, numa transação só:
 * - a linha de zro.users fica (auditoria e dados financeiros apontam para ela), mas sem nada pessoal: e-mail trocado
 *   por um endereço único e inválido, nome trocado, foto, senha e vínculo com o Google apagados, status 'deleted';
 * - todas as sessões do HUB encerradas, refresh tokens e consentimentos do login único revogados em todos os apps
 *   (SOBEDESCE, Synquei, TPeasy...), códigos pendentes e links de e-mail descartados;
 * - organizações só dela encerradas (assinaturas sem provedor canceladas, acessos revogados, convites e pedidos
 *   cancelados); nas outras, ela sai;
 * - pedidos de plano abertos cancelados, conversas com a Z apagadas, acesso a produto fechado revogado;
 * - um registro de auditoria sem dado pessoal. Auditoria, uso e cobrança não são apagados.
 * O e-mail original fica livre para uma conta nova.
 *
 * Bloqueia: administração da plataforma (não tranca o console), dona de organização com outras pessoas e sem outro
 * dono (transferir a posse ou remover antes) e assinatura paga ativa numa organização que seria encerrada.
 *
 * Mexe em senha, sessões e tokens do login único, que o papel zro_app não alcança: roda como sistema (autenticação),
 * sempre para a pessoa da sessão. O cliente nunca informa de quem é a conta.
 */
import { normalizeEmail, registerAttempt, RULES, LIMIT_MESSAGE, verifyPassword, withinLimit, type Authenticated } from '@zro/auth'
import type { Database, Queryable } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { requireUser } from './authz'

/** Provedores que não são pagamento da pessoa: grátis, concessão do console e teste de conta nova. */
const SEM_COBRANCA = ['free', 'manual', 'trial']

export type ExclusaoBloqueio = 'admin_plataforma' | 'organizacao_com_membros' | 'assinatura_paga'

export type ExclusaoPrevia = {
  /** null = pode excluir. */
  bloqueio: ExclusaoBloqueio | null
  /** Organizações em que ela é a única dona e há outras pessoas. */
  comMembros: { id: string; name: string; members: number }[]
  /** Organizações só dela com assinatura paga ativa (cancelar antes). */
  comAssinatura: { id: string; name: string }[]
  /** Organizações só dela, que serão encerradas junto. */
  encerradas: { id: string; name: string }[]
  /** Como a pessoa confirma: senha atual ou, sem senha (entra pelo Google), o próprio e-mail. */
  confirmarCom: 'senha' | 'email'
}

type Situacao = ExclusaoPrevia & { saidas: { id: string; transferirPara: string | null }[] }

async function situacao(tx: Queryable, userId: string, platformRole: string | null, comSenha: boolean): Promise<Situacao> {
  const orgs = await tx`
    select o.id, o.name, o.owner_id, m.role,
      (select count(*) from zro.memberships x join zro.users xu on xu.id = x.user_id
        where x.org_id = o.id and x.user_id <> ${userId} and x.status = 'active' and xu.status <> 'deleted')::int as outros,
      (select x.user_id from zro.memberships x join zro.users xu on xu.id = x.user_id
        where x.org_id = o.id and x.user_id <> ${userId} and x.status = 'active' and x.role = 'owner' and xu.status = 'active'
        order by x.created_at limit 1) as outro_dono,
      exists (select 1 from zro.subscriptions s
        where s.org_id = o.id and s.provider <> all (${SEM_COBRANCA}::text[]) and s.status in ('active', 'trialing', 'past_due')
          and not coalesce(s.cancel_at_period_end, false)) as paga
    from zro.memberships m join zro.organizations o on o.id = m.org_id
    where m.user_id = ${userId} and m.status = 'active' and o.status <> 'closed'
    order by o.name`
  const out: Situacao = { bloqueio: null, comMembros: [], comAssinatura: [], encerradas: [], saidas: [], confirmarCom: comSenha ? 'senha' : 'email' }
  for (const o of orgs) {
    const id = o.id as string
    const name = o.name as string
    const outroDono = (o.outro_dono as string) ?? null
    if (o.role !== 'owner' || outroDono) {
      // Sai da organização; se o registro de dono apontava para ela, passa para quem continua dono.
      out.saidas.push({ id, transferirPara: o.owner_id === userId ? outroDono : null })
    } else if ((o.outros as number) > 0) {
      out.comMembros.push({ id, name, members: o.outros as number })
    } else {
      out.encerradas.push({ id, name })
      if (o.paga) out.comAssinatura.push({ id, name })
    }
  }
  out.bloqueio = platformRole ? 'admin_plataforma' : out.comMembros.length ? 'organizacao_com_membros' : out.comAssinatura.length ? 'assinatura_paga' : null
  return out
}

function conta(auth: Authenticated | null) {
  const { userId } = requireUser(auth)
  // Token de app (login único) não exclui a conta: só a sessão do próprio HUB.
  if (auth!.session.app) throw new DomainError('forbidden_role', 'Exclua a conta pelo HUB, em Sua conta › Segurança.')
  return userId
}

/** O que impediria a exclusão e o que acontece com cada organização. Só leitura, para a tela de Segurança. */
export async function exclusaoPrevia(db: Database, auth: Authenticated | null): Promise<ExclusaoPrevia> {
  const userId = conta(auth)
  return db.asSystem('auth: prévia da exclusão da conta', async (tx) => {
    const [u] = await tx`
      select u.platform_role, exists (select 1 from zro.auth_credentials c where c.user_id = u.id) as senha
      from zro.users u where u.id = ${userId} and u.status = 'active'`
    if (!u) throw new DomainError('unauthenticated', 'Entre na sua conta.')
    const s = await situacao(tx, userId, (u.platform_role as string) ?? null, u.senha as boolean)
    return { bloqueio: s.bloqueio, comMembros: s.comMembros, comAssinatura: s.comAssinatura, encerradas: s.encerradas, confirmarCom: s.confirmarCom }
  })
}

const MENSAGEM: Record<ExclusaoBloqueio, string> = {
  admin_plataforma: 'Contas da administração da plataforma não são excluídas por aqui.',
  organizacao_com_membros: 'Transfira a posse ou remova as pessoas das suas organizações antes.',
  assinatura_paga: 'Cancele a assinatura paga antes de excluir a conta.',
}

export type ContaExcluida = {
  /** Endereço e nome de antes da exclusão, só para o e-mail de confirmação (não ficam guardados). */
  email: string
  nome: string
  encerradas: number
}

/** E-mail que ocupa o lugar do original: único, inválido de propósito (domínio .invalid) e sem nada da pessoa. */
export const emailDeContaExcluida = (userId: string) => `excluida-${userId}@conta-excluida.invalid`

/** Confere quem está pedindo (senha ou, sem senha, o e-mail), com limite de tentativas. */
async function conferirCredencial(db: Database, userId: string, confirmacao: string) {
  const chave = `account-delete:${userId}`
  const atual = await db.asSystem('auth: excluir conta (limite e credencial)', async (tx) => {
    if (!(await withinLimit(tx, chave, RULES.accountDelete))) throw new DomainError('rate_limited', LIMIT_MESSAGE)
    const [u] = await tx`
      select u.email, u.display_name, u.platform_role, c.password_hash
      from zro.users u left join zro.auth_credentials c on c.user_id = u.id
      where u.id = ${userId} and u.status = 'active'`
    return u ?? null
  })
  if (!atual) throw new DomainError('unauthenticated', 'Entre na sua conta.')
  if (atual.platform_role) throw new DomainError('conflict', MENSAGEM.admin_plataforma, { bloqueio: 'admin_plataforma' })
  const confere = atual.password_hash
    ? await verifyPassword(confirmacao, atual.password_hash as string)
    : normalizeEmail(confirmacao) === (atual.email as string)
  if (!confere) {
    await db.asSystem('auth: excluir conta recusado', (tx) => registerAttempt(tx, chave))
    if (atual.password_hash) throw new DomainError('unauthenticated', 'Senha incorreta.')
    throw new DomainError('invalid_input', 'Digite o e-mail da sua conta.')
  }
  return atual
}

/**
 * Primeira etapa da tela: confere a senha (ou o e-mail) e os bloqueios, sem excluir nada. A segunda etapa
 * (excluirConta) confere tudo de novo: esta resposta não vale como autorização.
 */
export async function conferirExclusao(db: Database, auth: Authenticated | null, confirmacao: string): Promise<void> {
  const userId = conta(auth)
  await conferirCredencial(db, userId, confirmacao)
  const p = await exclusaoPrevia(db, auth)
  if (p.bloqueio) throw new DomainError('conflict', MENSAGEM[p.bloqueio], { bloqueio: p.bloqueio })
}

/**
 * Exclui a conta da pessoa da sessão. `confirmacao` é a senha atual; sem senha (conta do Google), o e-mail da conta.
 * Erros: unauthenticated (senha errada), invalid_input (e-mail não confere), rate_limited, conflict (bloqueio, com
 * `details.bloqueio` e as organizações envolvidas).
 */
export async function excluirConta(db: Database, auth: Authenticated | null, confirmacao: string): Promise<ContaExcluida> {
  const userId = conta(auth)
  const atual = await conferirCredencial(db, userId, confirmacao)

  // 2. Exclui. A situação é relida com a conta travada: nada muda entre a prévia e a exclusão.
  return db.asSystem('auth: excluir conta', async (tx) => {
    const [u] = await tx`select email, display_name, platform_role from zro.users where id = ${userId} and status = 'active' for update`
    if (!u) throw new DomainError('unauthenticated', 'Entre na sua conta.')
    const s = await situacao(tx, userId, (u.platform_role as string) ?? null, Boolean(atual.password_hash))
    if (s.bloqueio) {
      throw new DomainError('conflict', MENSAGEM[s.bloqueio], {
        bloqueio: s.bloqueio,
        organizacoes: (s.bloqueio === 'organizacao_com_membros' ? s.comMembros : s.comAssinatura).map((o) => o.name),
      })
    }

    // Organizações só dela: encerradas, com o que estava aberto nelas.
    for (const o of s.encerradas) {
      await tx`update zro.organizations set status = 'closed', closed_at = now() where id = ${o.id}`
      await tx`update zro.subscriptions set status = 'canceled', cancel_at_period_end = false, canceled_at = now(),
                 current_period_end = least(coalesce(current_period_end, now()), now())
               where org_id = ${o.id} and provider = any (${SEM_COBRANCA}::text[]) and status in ('active', 'trialing', 'past_due', 'incomplete')`
      await tx`update zro.entitlements set status = 'revoked', reason = coalesce(reason, 'conta excluída') where org_id = ${o.id} and status = 'active'`
      await tx`update zro.invitations set revoked_at = now() where org_id = ${o.id} and accepted_at is null and revoked_at is null`
      await tx`update zro.plan_requests set status = 'canceled' where org_id = ${o.id} and status = 'open'`
      await tx`update zro.memberships set status = 'removed' where org_id = ${o.id} and user_id = ${userId}`
      await audit(tx, {
        orgId: o.id,
        actorUserId: userId,
        action: 'organization.closed',
        targetType: 'organization',
        targetId: o.id,
        metadata: { motivo: 'conta_excluida' },
      })
    }
    // Nas outras, ela sai (a posse fica com quem continua dono).
    for (const o of s.saidas) {
      if (o.transferirPara) await tx`update zro.organizations set owner_id = ${o.transferirPara} where id = ${o.id}`
      await tx`update zro.memberships set status = 'removed' where org_id = ${o.id} and user_id = ${userId}`
      await audit(tx, {
        orgId: o.id,
        actorUserId: userId,
        action: 'member.removed',
        targetType: 'user',
        targetId: userId,
        metadata: { motivo: 'conta_excluida' },
      })
    }

    // Pedidos abertos e convites para ela.
    await tx`update zro.plan_requests set status = 'canceled' where requested_by = ${userId} and status = 'open'`
    await tx`update zro.invitations set revoked_at = now()
             where (email = ${u.email as string} or invitee_user_id = ${userId}) and accepted_at is null and revoked_at is null`

    // Acesso: sessões do HUB, login único em todos os apps, links por e-mail.
    const sessoes = await tx`update zro.sessions set revoked_at = coalesce(revoked_at, now()), user_agent = null, ip_hash = null
                             where user_id = ${userId} returning revoked_at`
    const refresh = await tx`update zro.oauth_refresh_tokens set revoked_at = now() where user_id = ${userId} and revoked_at is null returning id`
    const apps = await tx`update zro.oauth_consents set revoked_at = now() where user_id = ${userId} and revoked_at is null returning client_id`
    await tx`delete from zro.oauth_codes where user_id = ${userId}`
    await tx`delete from zro.auth_tokens where user_id = ${userId}`
    await tx`update zro.product_release_access set revoked_at = now(), revoke_reason = 'conta excluída' where user_id = ${userId} and revoked_at is null`

    // Dados pessoais: senha, Google (login e Conexões, com os tokens cifrados), foto, conversas com a Z e tentativas de login guardadas pelo e-mail.
    const email = u.email as string
    await tx`delete from zro.auth_credentials where user_id = ${userId}`
    await tx`delete from zro.external_identities where user_id = ${userId}`
    await tx`delete from zro.conexoes where user_id = ${userId}`
    await tx`delete from zro.user_avatars where user_id = ${userId}`
    await tx`delete from zro.ia_conversas where user_id = ${userId}`
    await tx`delete from zro.rate_limit_attempts
             where key in (${'login-account:' + email}, ${'reset:' + email}) or left(key, ${('login:' + email + ':').length}) = ${'login:' + email + ':'}`
    await tx`update zro.users set email = ${emailDeContaExcluida(userId)}, display_name = 'Conta excluída', email_verified_at = null,
               platform_role = null, status = 'deleted', deleted_at = now()
             where id = ${userId}`

    await audit(tx, {
      actorUserId: userId,
      action: 'account.deleted',
      targetType: 'user',
      targetId: userId,
      metadata: {
        orgsEncerradas: s.encerradas.length,
        orgsDeixadas: s.saidas.length,
        sessoes: sessoes.length,
        refreshTokens: refresh.length,
        apps: apps.length,
      },
    })
    return { email, nome: u.display_name as string, encerradas: s.encerradas.length }
  })
}
