// Excluir a conta (28/10/2026): anonimiza, encerra acesso em todos os apps, encerra organizações só dela, bloqueia
// dona de equipe e assinatura paga, libera o e-mail para conta nova e não toca auditoria.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  authenticate,
  exchangeToken,
  grantConsent,
  issueCode,
  parseAuthorizeRequest,
  parseTokenRequest,
  registerClient,
  setIssuer,
  signIn,
  signInWithGoogle,
  signUp,
  userInfo,
  type AuthorizeRequest,
} from '@zro/auth'
import { conferirExclusao, createOrganization, emailDeContaExcluida, exclusaoPrevia, excluirConta, inviteMember, loadOidcClaims, setAvatar } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { emailContaExcluida } from '../../apps/hub-web/lib/email/modelos'
import { admin, expectCode, givePlan, newOrgWithOwner, newUser, planId, refresh } from './helpers'

let db: Database
const ISS = 'https://hub.teste.absolutezro.local'
const SENHA = 'senha-de-teste-123'
beforeAll(() => {
  db = testDatabase()
  setIssuer(ISS)
})
afterAll(() => db.close())

const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 0x0d, 0, 0, 0, 0x2f, 0, 0, 0, 0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88,
  0xfe, 0x07, 0,
])

/** Entra num app da família pelo login único e devolve os tokens (com refresh). */
async function entrarNoApp(userId: string, orgId: string | null) {
  const by = await admin(db)
  const c = await db.asSystem('teste', (tx) =>
    registerClient(tx, {
      id: `app-${randomBytes(4).toString('hex')}`,
      name: 'App de teste',
      productId: 'sobedesce',
      kind: 'confidential',
      redirectUris: ['https://app.teste/callback'],
      allowLoopback: false,
      createdBy: by,
    }),
  )
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const code = await db.asSystem('teste', async (tx) => {
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: c.clientId,
      redirect_uri: 'https://app.teste/callback',
      scope: 'openid email profile org offline_access',
      state: 'st',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })
    const p = await parseAuthorizeRequest(tx, q)
    if (!p.ok) throw new Error('pedido inválido')
    await grantConsent(tx, userId, c.clientId, p.req.scopes)
    return new URL(await issueCode(tx, p.req as AuthorizeRequest, { userId, orgId, authTime: new Date() })).searchParams.get('code')!
  })
  const basic = `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`
  const t = await exchangeToken(
    db,
    parseTokenRequest(
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'https://app.teste/callback', code_verifier: verifier }),
      basic,
    ),
    loadOidcClaims,
  )
  return { ...t, basic }
}

describe('exclusão da conta', () => {
  it('exclui, anonimiza, encerra a organização só dela e registra auditoria sem dado pessoal', async () => {
    const o = await newOrgWithOwner(db, 'excluir', { freePlan: true })
    await setAvatar(db, o.auth, WEBP)
    const outra = await newUser(db, 'excluir-segunda-sessao')
    const segunda = await signIn(db, { email: o.email, password: SENHA })

    const previa = await exclusaoPrevia(db, o.auth)
    expect(previa).toMatchObject({ bloqueio: null, confirmarCom: 'senha', comMembros: [], comAssinatura: [] })
    expect(previa.encerradas.map((x) => x.id)).toEqual([o.orgId])

    await expectCode(excluirConta(db, o.auth, 'senha-errada-123'), 'unauthenticated')
    // Primeira etapa da tela: confere a senha sem excluir nada.
    await expectCode(conferirExclusao(db, o.auth, 'senha-errada-123'), 'unauthenticated')
    await conferirExclusao(db, o.auth, SENHA)
    expect(await authenticate(db, o.token)).not.toBeNull()
    const r = await excluirConta(db, o.auth, SENHA)
    expect(r).toEqual({ email: o.email, nome: 'excluir-dono', encerradas: 1 })

    // Todas as sessões caem, inclusive a do outro aparelho; a senha não entra mais.
    expect(await authenticate(db, o.token)).toBeNull()
    expect(await authenticate(db, segunda.token)).toBeNull()
    await expectCode(signIn(db, { email: o.email, password: SENHA }), 'unauthenticated')

    const [u] = await db.sql`select email, display_name, email_verified_at, status, deleted_at from zro.users where id = ${o.userId}`
    expect(u).toMatchObject({ email: emailDeContaExcluida(o.userId), display_name: 'Conta excluída', email_verified_at: null, status: 'deleted' })
    expect(u!.deleted_at).toBeInstanceOf(Date)
    const [resto] = await db.sql`
      select (select count(*) from zro.auth_credentials where user_id = ${o.userId})::int as senha,
             (select count(*) from zro.user_avatars where user_id = ${o.userId})::int as foto,
             (select count(*) from zro.sessions where user_id = ${o.userId} and (revoked_at is null or user_agent is not null))::int as sessoes,
             (select count(*) from zro.memberships where user_id = ${o.userId} and status = 'active')::int as vinculos`
    expect(resto).toEqual({ senha: 0, foto: 0, sessoes: 0, vinculos: 0 })

    const [org] = await db.sql`select status, closed_at from zro.organizations where id = ${o.orgId}`
    expect(org!.status).toBe('closed')
    const [ativo] = await db.sql`
      select (select count(*) from zro.subscriptions where org_id = ${o.orgId} and status in ('active', 'trialing'))::int as assinaturas,
             (select count(*) from zro.entitlements where org_id = ${o.orgId} and status = 'active')::int as acessos`
    expect(ativo).toEqual({ assinaturas: 0, acessos: 0 })

    // Auditoria: a exclusão fica registrada sem e-mail nem nome; o histórico anterior continua lá.
    const logs = await db.sql`select action, metadata::text as m from zro.audit_logs where actor_user_id = ${o.userId} order by id`
    const acoes = logs.map((l) => l.action)
    expect(acoes).toContain('account.created')
    expect(acoes).toContain('organization.closed')
    expect(acoes.at(-1)).toBe('account.deleted')
    for (const l of logs.filter((x) => x.action === 'account.deleted' || x.action === 'organization.closed')) {
      expect(l.m).not.toContain(o.email)
      expect(l.m).not.toContain('excluir-dono')
    }
    // Conta excluída não volta e não é excluída duas vezes.
    await expect(db.asSystem('t', (tx) => tx`update zro.users set status = 'active' where id = ${o.userId}`)).rejects.toThrow(/reativada/)
    await expect(db.asSystem('t', (tx) => tx`update zro.organizations set status = 'active' where id = ${o.orgId}`)).rejects.toThrow(/reaberta/)
    // A outra pessoa segue normal.
    expect(await authenticate(db, outra.token)).not.toBeNull()
  })

  it('libera o e-mail para uma conta nova, que nasce do zero', async () => {
    const u = await newUser(db, 'recadastro')
    await excluirConta(db, u.auth, SENHA)
    const nova = await signUp(db, { email: u.email, password: 'outra-senha-forte-1', displayName: 'De novo' })
    expect(nova.userId).not.toBe(u.userId)
    const s = await signIn(db, { email: u.email, password: 'outra-senha-forte-1' })
    expect(s.userId).toBe(nova.userId)
    const [n] = await db.sql`select count(*)::int as n from zro.memberships where user_id = ${nova.userId}`
    expect(n!.n).toBe(0)
  })

  it('conta só do Google confirma com o e-mail; o Google depois cria uma conta nova', async () => {
    const email = `google-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
    const subject = `g-${randomUUID()}`
    const g = await signInWithGoogle(db, { subject, email, name: 'Pessoa Google' })
    const auth = (await authenticate(db, g.token))!
    expect((await exclusaoPrevia(db, auth)).confirmarCom).toBe('email')
    await expectCode(excluirConta(db, auth, 'outro@teste.absolutezro.local'), 'invalid_input')
    await excluirConta(db, auth, email.toUpperCase())
    const [ids] = await db.sql`select count(*)::int as n from zro.external_identities where user_id = ${g.userId}`
    expect(ids!.n).toBe(0)
    const de_novo = await signInWithGoogle(db, { subject, email, name: 'Pessoa Google' })
    expect(de_novo.created).toBe(true)
    expect(de_novo.userId).not.toBe(g.userId)
  })

  it('revoga refresh tokens e consentimentos do login único: o app perde o acesso', async () => {
    const o = await newOrgWithOwner(db, 'excluir-sso')
    await givePlan(db, o.orgId, 'individual-sobedesce')
    const t = await entrarNoApp(o.userId, o.orgId)
    expect(await userInfo(db, `Bearer ${t.access_token}`, loadOidcClaims)).toMatchObject({ sub: o.userId })
    // A assinatura concedida pelo console não é pagamento da pessoa: não bloqueia, é encerrada com a organização.
    await excluirConta(db, (await refresh(db, o.token))!, SENHA)
    await expect(
      exchangeToken(db, parseTokenRequest(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token! }), t.basic), loadOidcClaims),
    ).rejects.toMatchObject({ error: 'invalid_grant' })
    await expect(userInfo(db, `Bearer ${t.access_token}`, loadOidcClaims)).rejects.toMatchObject({ error: 'invalid_token' })
    const [r] = await db.sql`
      select (select count(*) from zro.oauth_refresh_tokens where user_id = ${o.userId} and revoked_at is null)::int as refresh,
             (select count(*) from zro.oauth_consents where user_id = ${o.userId} and revoked_at is null)::int as consents`
    expect(r).toEqual({ refresh: 0, consents: 0 })
  })
})

describe('bloqueios', () => {
  it('dona de organização com outras pessoas: mostra quais e não exclui', async () => {
    const o = await newOrgWithOwner(db, 'excluir-equipe')
    const membro = await newUser(db, 'excluir-membro')
    await db.asSystem('t', (tx) => tx`insert into zro.memberships (org_id, user_id, role) values (${o.orgId}, ${membro.userId}, 'editor')`)
    const previa = await exclusaoPrevia(db, o.auth)
    expect(previa.bloqueio).toBe('organizacao_com_membros')
    expect(previa.comMembros).toEqual([{ id: o.orgId, name: 'Produtora excluir-equipe', members: 1 }])
    await expectCode(conferirExclusao(db, o.auth, SENHA), 'conflict')
    const err = (await expectCode(excluirConta(db, o.auth, SENHA), 'conflict')) as { details?: Record<string, unknown> }
    expect(err.details).toMatchObject({ bloqueio: 'organizacao_com_membros', organizacoes: ['Produtora excluir-equipe'] })
    expect(await authenticate(db, o.token)).not.toBeNull()

    // Com outro dono, ela só sai: a organização continua e a posse fica com quem ficou.
    await db.asSystem('t', (tx) => tx`update zro.memberships set role = 'owner' where org_id = ${o.orgId} and user_id = ${membro.userId}`)
    expect((await exclusaoPrevia(db, o.auth)).bloqueio).toBeNull()
    await excluirConta(db, o.auth, SENHA)
    const [org] = await db.sql`select status, owner_id from zro.organizations where id = ${o.orgId}`
    expect(org).toEqual({ status: 'active', owner_id: membro.userId })
  })

  it('membro (não dono) sai da organização da equipe sem encerrá-la', async () => {
    const o = await newOrgWithOwner(db, 'excluir-time')
    const editor = await newUser(db, 'excluir-editor')
    await db.asSystem('t', (tx) => tx`insert into zro.memberships (org_id, user_id, role) values (${o.orgId}, ${editor.userId}, 'editor')`)
    const r = await excluirConta(db, editor.auth, SENHA)
    expect(r.encerradas).toBe(0)
    const [m] = await db.sql`select status from zro.memberships where org_id = ${o.orgId} and user_id = ${editor.userId}`
    expect(m!.status).toBe('removed')
    // Sem a ex-integrante, a dona pode excluir de novo (a conta excluída não conta como pessoa da equipe).
    expect((await exclusaoPrevia(db, o.auth)).bloqueio).toBeNull()
  })

  it('assinatura paga ativa bloqueia até ser cancelada', async () => {
    const o = await newOrgWithOwner(db, 'excluir-paga')
    const pid = await planId(db, 'individual-sobedesce')
    const subId = await db.asSystem('t', async (tx) => {
      const [s] = await tx`
        insert into zro.subscriptions (org_id, plan_id, status, current_period_start, current_period_end, provider, provider_subscription_id, provider_updated_at)
        values (${o.orgId}, ${pid}, 'active', now(), now() + interval '30 days', 'stripe', ${'sub_' + randomUUID()}, now()) returning id`
      return s!.id as string
    })
    const previa = await exclusaoPrevia(db, o.auth)
    expect(previa.bloqueio).toBe('assinatura_paga')
    expect(previa.comAssinatura.map((x) => x.id)).toEqual([o.orgId])
    await expectCode(excluirConta(db, o.auth, SENHA), 'conflict')
    // Cancelada no fim do período: pode excluir; a assinatura do provedor não é mexida aqui.
    await db.asSystem('t', (tx) => tx`update zro.subscriptions set cancel_at_period_end = true where id = ${subId}`)
    await excluirConta(db, o.auth, SENHA)
    const [s] = await db.sql`select status from zro.subscriptions where id = ${subId}`
    expect(s!.status).toBe('active')
  })

  it('administração da plataforma não exclui a própria conta por aqui', async () => {
    const u = await newUser(db, 'excluir-admin')
    await db.asSystem('t', (tx) => tx`update zro.users set platform_role = 'admin' where id = ${u.userId}`)
    const a = await refresh(db, u.token)
    expect((await exclusaoPrevia(db, a)).bloqueio).toBe('admin_plataforma')
    await expectCode(excluirConta(db, a, SENHA), 'conflict')
    expect(await authenticate(db, u.token)).not.toBeNull()
  })

  it('sem sessão não exclui; token de app também não', async () => {
    await expectCode(excluirConta(db, null, SENHA), 'unauthenticated')
    const u = await newUser(db, 'excluir-app')
    const viaApp = { ...u.auth, session: { ...u.auth.session, app: { clientId: 'app-x', productId: null } } }
    await expectCode(excluirConta(db, viaApp, SENHA), 'forbidden_role')
    await expectCode(exclusaoPrevia(db, viaApp), 'forbidden_role')
  })

  it('limita tentativas de senha', async () => {
    const u = await newUser(db, 'excluir-limite')
    for (let i = 0; i < 5; i++) await expectCode(excluirConta(db, u.auth, `errada-${i}-123456`), 'unauthenticated')
    await expectCode(excluirConta(db, u.auth, SENHA), 'rate_limited')
  })
})

describe('isolamento', () => {
  it('cada um só exclui a própria conta; zro_app não anonimiza nem muda status de ninguém', async () => {
    const a = await newOrgWithOwner(db, 'iso-excluir-a')
    const b = await newUser(db, 'iso-excluir-b')
    await db.asSystem('t', (tx) => tx`insert into zro.memberships (org_id, user_id, role) values (${a.orgId}, ${b.userId}, 'viewer')`)
    // A senha de B na sessão de A não exclui B: a conta é sempre a da sessão.
    await expectCode(excluirConta(db, a.auth, SENHA), 'conflict') // A é dona com B na equipe
    await expect(
      db.asUser({ userId: a.userId, orgId: a.orgId }, (tx) => tx`update zro.users set status = 'deleted', deleted_at = now() where id = ${a.userId}`),
    ).rejects.toThrow(/permission denied/)
    await expect(
      db.asUser({ userId: a.userId, orgId: a.orgId }, (tx) => tx`update zro.users set email = ${'x-' + a.email} where id = ${a.userId}`),
    ).rejects.toThrow(/permission denied/)
    await expect(
      db.asUser({ userId: a.userId, orgId: a.orgId }, (tx) => tx`update zro.organizations set status = 'closed' where id = ${a.orgId}`),
    ).rejects.toThrow(/permission denied/)

    // B exclui a própria conta: some da equipe de A, que não vê mais nada pessoal dela.
    await excluirConta(db, (await refresh(db, b.token))!, SENHA)
    const vistos = await db.asUser({ userId: a.userId, orgId: a.orgId }, (tx) => tx`select id, email from zro.users where id = ${b.userId}`)
    expect(vistos).toEqual([])
    expect(await authenticate(db, a.token)).not.toBeNull()
    const convite = await inviteMember(db, a.auth, { email: b.email, role: 'viewer' })
    expect(convite.token).toBeTruthy()
    // A organização de A continua ativa; outra organização qualquer também.
    const c = await newUser(db, 'iso-excluir-c')
    const oc = await createOrganization(db, c.auth, { name: 'Outra' })
    const [st] = await db.sql`select status from zro.organizations where id in (${a.orgId}, ${oc.id}) and status <> 'active'`
    expect(st).toBeUndefined()
  })
})

describe('e-mail de confirmação', () => {
  it('no padrão dos modelos, sem link para nada além da marca e do contato', () => {
    const m = emailContaExcluida('pessoa@teste.absolutezro.local', 'Victor Barroso')
    expect(m.subject).toBe('Sua conta foi excluída')
    expect(m.text).toContain('contato@absolutezro.com')
    const links = [...m.html!.matchAll(/href="([^"]+)"/g)].map((x) => x[1])
    expect(links.every((l) => l === 'https://absolutezro.com' || l === 'mailto:contato@absolutezro.com')).toBe(true)
    expect(m.html).toContain('Victor, sua conta foi')
  })
})
