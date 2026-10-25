/**
 * Dados de DEMONSTRAÇÃO para desenvolvimento local (PRD §15: "dados de demonstração identificados como demo").
 *   DATABASE_URL=... npm run db:seed:demo
 * Bloqueado quando ZRO_ENV=production. Tudo que nasce aqui leva "[DEMO]" no nome ou e-mail @demo.absolutezro.local.
 * Usa os fixtures gerados pelo código real do SOBEDESCE (tests/fixtures/sobedesce).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authenticate, signIn, signUp } from '@zro/auth'
import { assignPlan, grantEntitlement } from '@zro/billing'
import { createOrganization, runOnce } from '@zro/core'
import { createDatabase } from '@zro/db'
import { HANDLERS, importCarroJob, importScriptFromTpeasy, importSobedesceManifest, ROUTES, toTpeasyBackup } from '@zro/integrations'
import { createLogger } from '@zro/observability'

if (process.env.ZRO_ENV === 'production') {
  console.error('seed-demo é bloqueado em produção.')
  process.exit(2)
}
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL não configurada.')
  process.exit(2)
}
const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/sobedesce')
const fx = (f: string) => fs.readFileSync(path.join(FIX, f), 'utf8')
const PASSWORD = process.env.ZRO_DEMO_PASSWORD || 'demo-absolute-zro'
const db = createDatabase(url, { max: 2 })

async function user(email: string, name: string) {
  const [exists] = await db.sql`select id from zro.users where email = ${email}`
  if (!exists) await signUp(db, { email, password: PASSWORD, displayName: name })
  await db.sql`update zro.users set email_verified_at = coalesce(email_verified_at, now()) where email = ${email}`
  const s = await signIn(db, { email, password: PASSWORD })
  return (await authenticate(db, s.token))!
}

try {
  const admin = await user('admin@demo.absolutezro.local', '[DEMO] Admin da plataforma')
  await db.sql`update zro.users set platform_role = 'admin' where id = ${admin.user.id}`
  const owner = await user('dono@demo.absolutezro.local', '[DEMO] Dona da produtora')
  const [hasOrg] = await db.sql`select o.id from zro.organizations o where o.owner_id = ${owner.user.id} and o.name like '[DEMO]%'`
  let auth = owner
  if (!hasOrg) {
    await createOrganization(db, auth, { name: '[DEMO] Produtora Exemplo' })
    auth = (await authenticate(db, (await signIn(db, { email: 'dono@demo.absolutezro.local', password: PASSWORD })).token))!
    const orgId = auth.session.activeOrgId!
    const [plan] = await db.sql`select id from zro.plans where code = 'ciclo-do-o' and version = 1`
    const actor = { userId: admin.user.id, reason: '[DEMO] demonstração local' }
    await db.asSystem('demo', (tx) => assignPlan(tx, actor, { orgId, planId: plan!.id as string, periodEnd: new Date(Date.now() + 30 * 86_400_000) }))
    await db.asSystem('demo', (tx) =>
      grantEntitlement(tx, actor, { orgId, productId: 'sobedesce', features: null, limits: { 'sobedesce.manifest_imports': 20 }, endsAt: null }),
    )
    await db.asSystem('demo', (tx) =>
      grantEntitlement(tx, actor, { orgId, productId: 'synquei', features: null, limits: { 'synquei.organization_plans': 20 }, endsAt: null }),
    )
    const { projectId } = await importCarroJob(db, auth, {
      contract: 'carro-do-freela.job/1',
      job_id: 'demo-job-001',
      title: '[DEMO] Show de lançamento',
      production_type: 'show',
      briefing: 'Dois palcos, três câmeras, entrega em 10 dias.',
      dates: [{ date: '2026-11-21', label: 'Diária 01' }],
      crew_roles: [
        { role: 'Câmera', count: 3 },
        { role: 'Som direto', count: 1 },
      ],
    })
    await importScriptFromTpeasy(db, auth, {
      projectId,
      backup: toTpeasyBackup({
        projectId,
        title: 'Abertura do show',
        body: '# Abertura\nBoa noite! [pausa]\n**Bem-vindos** ao lançamento.\n((olhar para a câmera A))',
        updatedAt: new Date(),
      }),
    })
    await importSobedesceManifest(db, auth, {
      projectId,
      descargas: fx('unica-descargas.jsonl'),
      destinations: [
        { id: 'hd-principal', label: 'HD principal', reports: [{ name: 'SOBEDESCE_copia.xxh64', text: fx('unica-principal.xxh64') }] },
        { id: 'hd-backup', label: 'HD backup', reports: [{ name: 'SOBEDESCE_copia.xxh64', text: fx('unica-backup.xxh64') }] },
      ],
    })
    await runOnce(db, { handlers: HANDLERS, routes: ROUTES, log: createLogger('demo', () => {}) })
  }
  console.log(
    `Demo pronta. Entre com dono@demo.absolutezro.local ou admin@demo.absolutezro.local (senha: ${PASSWORD === 'demo-absolute-zro' ? 'demo-absolute-zro' : 'ZRO_DEMO_PASSWORD'}).`,
  )
} finally {
  await db.close()
}
