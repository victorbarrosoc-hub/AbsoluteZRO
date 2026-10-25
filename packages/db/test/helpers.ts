import { randomUUID } from 'node:crypto'
import type { Database, Tx } from '../src/index'

/** Usuário de teste criado como sistema (sem senha). */
export async function createUser(db: Database, label = 'pessoa'): Promise<string> {
  const email = `${label}-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
  return db.asSystem('teste: criar usuário', async (tx) => {
    const [u] = await tx`insert into zro.users (email, display_name, email_verified_at) values (${email}, ${label}, now()) returning id`
    return u!.id as string
  })
}

/** Organização criada pela própria pessoa (função create_organization, como no produto). */
export async function createOrg(db: Database, userId: string, name = 'Org'): Promise<string> {
  const slug = `org-${randomUUID().slice(0, 8)}`
  return db.asUser({ userId, orgId: null }, async (tx) => {
    const [r] = await tx`select zro.create_organization(${name}, ${slug}, 'team') as id`
    return r!.id as string
  })
}

export async function addMember(db: Database, orgId: string, userId: string, role: string): Promise<void> {
  await db.asSystem('teste: vínculo', (tx) => tx`insert into zro.memberships (org_id, user_id, role) values (${orgId}, ${userId}, ${role})`)
}

export async function createProject(db: Database, userId: string, orgId: string, title = 'Projeto', visibility = 'organization'): Promise<string> {
  return db.asUser({ userId, orgId }, async (tx: Tx) => {
    const [p] = await tx`insert into zro.projects (org_id, title, created_by, visibility) values (${orgId}, ${title}, ${userId}, ${visibility}) returning id`
    return p!.id as string
  })
}
