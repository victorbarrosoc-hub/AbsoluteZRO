import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { authenticate, signUp, type Authenticated } from '@zro/auth'
import { assignPlan, grantEntitlement } from '@zro/billing'
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

export async function newOrgWithOwner(db: Database, label = 'org') {
  const u = await newUser(db, `${label}-dono`)
  const org = await createOrganization(db, u.auth, { name: `Produtora ${label}` })
  return { ...u, orgId: org.id, auth: await refresh(db, u.token) }
}

export async function planId(db: Database, code: string, version = 1): Promise<string> {
  const [p] = await db.sql`select id from zro.plans where code = ${code} and version = ${version}`
  return p!.id as string
}

export async function admin(db: Database): Promise<string> {
  const u = await newUser(db, 'admin-plataforma')
  await db.asSystem('teste', (tx) => tx`update zro.users set platform_role = 'admin' where id = ${u.userId}`)
  return u.userId
}

export async function givePlan(db: Database, orgId: string, code: string, periodEnd: Date | null = new Date(Date.now() + 30 * 86_400_000)) {
  const adminId = await admin(db)
  const pid = await planId(db, code)
  return db.asSystem('teste: conceder plano', (tx) => assignPlan(tx, { userId: adminId, reason: 'teste' }, { orgId, planId: pid, periodEnd }))
}

/** Limites explícitos por concessão administrativa (o catálogo neutro não traz limite). */
export async function giveLimits(db: Database, orgId: string, productId: string, limits: Record<string, number>) {
  const adminId = await admin(db)
  return db.asSystem('teste: limites', (tx) => grantEntitlement(tx, { userId: adminId, reason: 'limites de teste' }, { orgId, productId, features: null, limits, endsAt: null }))
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
