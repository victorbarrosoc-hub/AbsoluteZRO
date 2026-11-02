import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { authenticate, signUp, type Authenticated } from '@zro/auth'
import { assignPlan, grantEntitlement, grantReleaseAccess, recomputeEntitlements } from '@zro/billing'
import { createOrganization } from '@zro/core'
import type { Database } from '@zro/db'

export const FIXTURES = path.resolve(import.meta.dirname, '../fixtures')
export const fixture = (rel: string) => fs.readFileSync(path.join(FIXTURES, rel), 'utf8')

export async function newUser(db: Database, label = 'pessoa', opts: { verified?: boolean } = { verified: true }) {
  const email = `${label}-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
  const r = await signUp(db, { email, password: 'senha-de-teste-123', displayName: label })
  if (opts.verified !== false) await db.asSystem('teste', (tx) => tx`update zro.users set email_verified_at = now() where id = ${r.userId}`)
  const auth = (await authenticate(db, r.session.token))!
  return { userId: r.userId, email, token: r.session.token, auth }
}

/** Sessão relida do banco (organização ativa atualizada). */
export async function refresh(db: Database, token: string): Promise<Authenticated> {
  return (await authenticate(db, token))!
}

/**
 * Organização com dono. Toda organização nova entra no plano grátis (0007); os testes de acesso partem do zero,
 * então o padrão aqui tira esse plano. `freePlan: true` mantém o que a pessoa recebe de verdade ao criar conta.
 */
export async function newOrgWithOwner(db: Database, label = 'org', opts: { freePlan?: boolean } = {}) {
  const u = await newUser(db, `${label}-dono`)
  const org = await createOrganization(db, u.auth, { name: `Produtora ${label}` })
  if (!opts.freePlan) {
    await db.asSystem('teste: sem plano grátis', async (tx) => {
      await tx`delete from zro.entitlements where org_id = ${org.id} and source_id in (select id from zro.subscriptions where org_id = ${org.id} and provider = 'free')`
      await tx`delete from zro.subscriptions where org_id = ${org.id} and provider = 'free'`
    })
  }
  return { ...u, orgId: org.id, auth: await refresh(db, u.token) }
}

/** Sem versão: a versão ativa mais nova (a que está à venda). */
export async function planId(db: Database, code: string, version?: number): Promise<string> {
  const [p] = version
    ? await db.sql`select id from zro.plans where code = ${code} and version = ${version}`
    : await db.sql`select id from zro.plans where code = ${code} order by (status = 'active') desc, version desc limit 1`
  return p!.id as string
}

export async function admin(db: Database): Promise<string> {
  const u = await newUser(db, 'admin-plataforma')
  await db.asSystem('teste', (tx) => tx`update zro.users set platform_role = 'admin' where id = ${u.userId}`)
  return u.userId
}

/**
 * Plano à venda: pela concessão do console (assignPlan). Plano antigo, fora da venda desde a 0055 (Completo, avulsos de
 * R$ 59,90...): como quem já o tinha antes, uma assinatura manual direta (assignPlan só aceita planos ativos).
 */
export async function givePlan(db: Database, orgId: string, code: string, periodEnd: Date | null = new Date(Date.now() + 30 * 86_400_000)) {
  const adminId = await admin(db)
  const pid = await planId(db, code)
  const [p] = await db.sql`select status from zro.plans where id = ${pid}`
  if (p!.status === 'active') {
    return db.asSystem('teste: conceder plano', (tx) => assignPlan(tx, { userId: adminId, reason: 'teste' }, { orgId, planId: pid, periodEnd }))
  }
  return db.asSystem('teste: plano antigo', async (tx) => {
    const [sub] = await tx`
      insert into zro.subscriptions (org_id, plan_id, status, current_period_start, current_period_end, provider, provider_subscription_id, provider_updated_at)
      values (${orgId}, ${pid}, 'active', now(), ${periodEnd}, 'manual', ${'manual-' + randomUUID()}, now()) returning id`
    await recomputeEntitlements(tx, orgId)
    return sub!.id as string
  })
}

/** Limites explícitos por concessão administrativa (o catálogo neutro não traz limite). */
export async function giveLimits(db: Database, orgId: string, productId: string, limits: Record<string, number>) {
  const adminId = await admin(db)
  return db.asSystem('teste: limites', (tx) =>
    grantEntitlement(tx, { userId: adminId, reason: 'limites de teste' }, { orgId, productId, features: null, limits, endsAt: null }),
  )
}

/**
 * Gate de lançamento (ADR 0023): põe a conta na lista de um produto fechado (NOSSOM, AEON, Revela, Carro). Nos testes,
 * é como a conta do proprietário (Carro) ou um tester entram; sem isto, produto fechado nega qualquer pessoa.
 */
export async function allowRelease(
  db: Database,
  productId: string,
  userId: string,
  opts: { kind?: 'owner' | 'internal' | 'tester'; channels?: ('web' | 'desktop' | 'api' | 'download' | 'sso')[]; endsAt?: Date | null } = {},
) {
  const adminId = await admin(db)
  return db.asSystem('teste: acesso a produto fechado', (tx) =>
    grantReleaseAccess(
      tx,
      { userId: adminId, reason: 'teste' },
      { productId, userId, kind: opts.kind ?? 'tester', channels: opts.channels ?? ['web', 'desktop', 'api', 'download', 'sso'], endsAt: opts.endsAt ?? null },
    ),
  )
}

export async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e) => e,
  )
  if (!err) throw new Error(`esperava erro ${code}, mas deu certo`)
  if ((err as { code?: string }).code !== code) throw new Error(`esperava ${code}, veio ${(err as { code?: string }).code ?? err}`)
  return err as { code: string; status: number }
}

/**
 * Conta de antes dos planos Zero/Órbita/Absoluto (0055): o grátis antigo "Conta Absolute ZRO" (v2), que libera todos
 * os apps. Continua igual para quem já tinha; é com ela que os testes das migrations antigas simulam "conta de antes".
 */
export async function legacyFreeOrg(db: Database, label = 'antiga') {
  const o = await newOrgWithOwner(db, label)
  const free = await planId(db, 'conta-absolute-zro', 2)
  await db.asSystem('teste: grátis antigo', async (tx) => {
    await tx`insert into zro.subscriptions (org_id, plan_id, status, current_period_start, provider, provider_subscription_id, provider_updated_at)
             values (${o.orgId}, ${free}, 'active', now(), 'free', ${'free-' + o.orgId}, now())`
    await recomputeEntitlements(tx, o.orgId)
  })
  return o
}
