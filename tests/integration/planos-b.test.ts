// Planos Zero/Órbita/Absoluto, nível por app, catálogo de limites, Z por nível com recarga, campanha do teste do
// Absoluto e contas antigas (migração 0055, ADR 0039).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { authenticate, signUp, verifyEmailFor } from '@zro/auth'
import {
  campanhaAtual,
  catalogoLimites,
  concederRecarga,
  consumeQuota,
  desligarCampanha,
  emailDescartavel,
  encerrarTeste,
  estenderTeste,
  iniciarTeste,
  launchSales,
  ligarCampanha,
  ligarMigracaoLegado,
  limitesDaPessoa,
  migrarParaZero,
  niveisEfetivos,
  normalizarEmailTeste,
  peekQuota,
  planoAtual,
  recomputeEntitlements,
  resumoTestes,
  testeAtivoAte,
  zCatalogo,
} from '@zro/billing'
import { atualizarLimite, createOrganization, loadOidcClaims, meusLimites, talvezIniciarTeste } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { admin, expectCode, givePlan, newOrgWithOwner, newUser, planId, refresh } from './helpers'

let db: Database
const sys = <T>(fn: Parameters<Database['asSystem']>[1]) => db.asSystem('teste', fn) as Promise<T>
const NO_AR = ['carro-do-freela', 'tpeasy', 'sobedesce', 'synquei', 'maestro', 'relay']
const FECHADOS = ['ai-edit', 'finishing', 'nossom', 'rift-motion']
const ip = () => randomUUID().replace(/-/g, '')

beforeAll(() => {
  db = testDatabase()
})
afterAll(async () => {
  // Nunca deixar campanha ligada para os outros arquivos de teste.
  await sys((tx) => tx`update zro.teste_campanhas set desligada_em = now() where desligada_em is null`)
  await db.close()
})

/** Conta antiga (de antes da 0055): o grátis antigo "Conta Absolute ZRO", que hoje libera todos os apps. */
async function contaAntiga(label: string) {
  const o = await newOrgWithOwner(db, label)
  const free = await planId(db, 'conta-absolute-zro', 2)
  await sys(async (tx) => {
    await tx`update zro.users set created_at = '2026-10-01' where id = ${o.userId}`
    await tx`insert into zro.subscriptions (org_id, plan_id, status, current_period_start, provider, provider_subscription_id, provider_updated_at)
             values (${o.orgId}, ${free}, 'active', '2026-10-01', 'free', ${'free-' + o.orgId}, now())`
    await recomputeEntitlements(tx, o.orgId)
  })
  return o
}

describe('catálogo dos planos', () => {
  it('Zero, Órbita, Absoluto e Avulso à venda com os preços novos; os antigos fora da venda, como legado', async () => {
    const rows = await db.sql`select code, kind, nivel, price_cents, billing_interval from zro.plans where status = 'active' and version = 1 order by code`
    const by = Object.fromEntries(rows.map((r) => [r.code as string, r]))
    expect(by.zero).toMatchObject({ kind: 'free', nivel: 'zero', price_cents: null })
    expect(by.orbita).toMatchObject({ nivel: 'orbita', price_cents: 10990, billing_interval: 'month' })
    expect(by['orbita-anual']).toMatchObject({ price_cents: 109900, billing_interval: 'year' })
    expect(by.absoluto).toMatchObject({ nivel: 'absoluto', price_cents: 29990 })
    expect(by['absoluto-anual']).toMatchObject({ price_cents: 299900 })
    for (const app of ['maestro', 'sobedesce', 'synquei', 'relay', 'carro-do-freela']) {
      expect(by[`avulso-${app}`]).toMatchObject({ kind: 'individual', nivel: 'absoluto', price_cents: 7990 })
      expect(by[`avulso-${app}-anual`]).toMatchObject({ price_cents: 79900, billing_interval: 'year' })
    }
    expect(by['avulso-tpeasy']).toBeUndefined()
    const [velhos] = await db.sql`
      select count(*) filter (where status = 'active')::int as ativos, count(*) filter (where not legado)::int as nao_legado
      from zro.plans where code in ('conta-absolute-zro', 'ciclo-do-o', 'ciclo-do-o-anual', 'absolute-zro-pro', 'absolute-zro-pro-anual') or code like 'individual-%'`
    expect(velhos).toMatchObject({ ativos: 0, nao_legado: 0 })
    // Os fechados ficam como no grátis antigo: listados no Zero, Órbita e Absoluto (o gate decide quem usa), sem avulso.
    const fech = await db.sql`select distinct p.code from zro.plan_products pp join zro.plans p on p.id = pp.plan_id
                              where not p.legado and pp.product_id = any(${FECHADOS}::text[]) order by 1`
    expect(fech.map((r) => r.code)).toEqual(['absoluto', 'absoluto-anual', 'orbita', 'orbita-anual', 'zero'])
  })

  it('limites por nível num catálogo só (null = sem limite), público sem apps fechados', async () => {
    const cat = await sys<Awaited<ReturnType<typeof catalogoLimites>>>((tx) => catalogoLimites(tx, null))
    expect(Object.keys(cat).sort()).toEqual(['carro-do-freela', 'maestro', 'relay', 'sobedesce', 'synquei'])
    expect(cat.maestro!.clientes_ativos!.valores).toEqual({ zero: 3, orbita: 25, absoluto: null })
    expect(cat.maestro!.marca_propria).toMatchObject({ tipo: 'recurso', valores: { zero: 0, orbita: 0, absoluto: 1 } })
    expect(cat.sobedesce!.google_drives!.valores).toEqual({ zero: 1, orbita: 1, absoluto: 2 })
    expect(cat.sobedesce!.frames).toMatchObject({ periodo: 'mes', valores: { zero: 20, orbita: 500, absoluto: null } })
    expect(cat.relay!.resolucao_maxima).toMatchObject({ unidade: 'p', valores: { zero: 1080, orbita: 2160, absoluto: null } })
    expect(cat['carro-do-freela']!.guilda_lugares!.valores).toEqual({ zero: 15, orbita: 30, absoluto: 50 })
    expect(cat.synquei!.davinci_direto!.valores).toEqual({ zero: 0, orbita: 0, absoluto: 1 })
    const z = await sys<Awaited<ReturnType<typeof zCatalogo>>>((tx) => zCatalogo(tx))
    expect(z.mensagens_por_mes).toEqual({ zero: 10, orbita: 100, absoluto: 300, avulso: 50 })
    expect(z.recargas.map((r) => `${r.mensagens}:${r.preco_centavos}:${r.validade_meses}`)).toEqual(['100:1490:12', '500:4990:12'])
  })

  it('ligar vendas (fluxo antigo) recusa', async () => {
    const adm = await admin(db)
    await expectCode(
      sys((tx) => launchSales(tx, { userId: adm, reason: 'x' }, { cutoff: new Date(Date.now() + 86_400_000), trialDays: 7 })),
      'conflict',
    )
  })
})

describe('nível efetivo por app', () => {
  it('conta nova cai no Zero: os seis apps no ar, Z de 10 por mês, nada de app fechado', async () => {
    const o = await newOrgWithOwner(db, 'nivel-zero', { freePlan: true })
    const [sub] = await sys<Record<string, unknown>[]>(
      (tx) => tx`select p.code from zro.subscriptions s join zro.plans p on p.id = s.plan_id where s.org_id = ${o.orgId}`,
    )
    expect(sub!.code).toBe('zero')
    const n = await sys<Awaited<ReturnType<typeof niveisEfetivos>>>((tx) => niveisEfetivos(tx, o.userId, o.orgId))
    expect(n.map((x) => x.productId).sort()).toEqual([...NO_AR].sort())
    expect(n.every((x) => x.nivel === 'zero' && x.origem === 'zero')).toBe(true)
    const q = await sys<Awaited<ReturnType<typeof peekQuota>>>((tx) => peekQuota(tx, o.orgId, 'zro.ai_credits', 1))
    expect(q).toMatchObject({ ok: true, limit: 10 })
    const lim = await sys<Awaited<ReturnType<typeof limitesDaPessoa>>>((tx) => limitesDaPessoa(tx, o.userId, o.orgId))
    expect(lim.produtos.maestro!.limites).toMatchObject({ clientes_ativos: 3, financeiro: 0 })
    expect(lim.teste_ate).toBeNull()
    expect(lim.z).toMatchObject({ franquia: 10, usadas: 0, recarga: 0 })
    expect(await sys((tx) => planoAtual(tx, o.userId, o.orgId))).toEqual({ nome: 'Zero', testeAte: null })
  })

  it('conta antiga não perde nada: Absoluto (legado) nos apps que já tinha, sem os limites novos, Z como antes', async () => {
    const o = await contaAntiga('nivel-legado')
    const n = await sys<Awaited<ReturnType<typeof niveisEfetivos>>>((tx) => niveisEfetivos(tx, o.userId, o.orgId))
    // Os apps no ar; os fechados seguem fora pelo gate, mesmo com o entitlement antigo.
    expect(n.map((x) => x.productId).sort()).toEqual([...NO_AR].sort())
    expect(n.every((x) => x.nivel === 'absoluto' && x.origem === 'legado')).toBe(true)
    const lim = await sys<Awaited<ReturnType<typeof limitesDaPessoa>>>((tx) => limitesDaPessoa(tx, o.userId, o.orgId))
    expect(lim.produtos.maestro!.limites.clientes_ativos).toBeNull()
    expect(lim.produtos.sobedesce!.limites.google_drives).toBeNull()
    expect(lim.produtos['carro-do-freela']!.limites.guilda_lugares).toBeNull()
    expect(lim.produtos.maestro!.limites.marca_propria).toBe(1)
    expect(lim.z.franquia).toBe(50)
    // O acesso (entitlements) é o mesmo de antes: os 9 apps do grátis antigo, inclusive os fechados (o gate é que fecha).
    const [e] = await sys<Record<string, unknown>[]>(
      (tx) => tx`select count(*)::int as n, bool_and(legado) as legado from zro.entitlements where org_id = ${o.orgId} and status = 'active'`,
    )
    expect(e).toMatchObject({ n: 9, legado: true })
  })

  it('avulso: Absoluto só no app dele, Z de 50', async () => {
    const o = await newOrgWithOwner(db, 'nivel-avulso', { freePlan: true })
    await givePlan(db, o.orgId, 'avulso-synquei')
    const n = await sys<Awaited<ReturnType<typeof niveisEfetivos>>>((tx) => niveisEfetivos(tx, o.userId, o.orgId))
    const by = Object.fromEntries(n.map((x) => [x.productId, x]))
    expect(by.synquei).toMatchObject({ nivel: 'absoluto', origem: 'avulso' })
    expect(by.maestro).toMatchObject({ nivel: 'zero', origem: 'zero' })
    expect(await sys((tx) => peekQuota(tx, o.orgId, 'zro.ai_credits', 1))).toMatchObject({ limit: 50 })
    expect(await sys((tx) => planoAtual(tx, o.userId, o.orgId))).toMatchObject({ nome: 'Zero + Synquei' })
  })

  it('Órbita: o nível do meio em todos os apps, com os números do Órbita', async () => {
    const o = await newOrgWithOwner(db, 'nivel-orbita', { freePlan: true })
    await givePlan(db, o.orgId, 'orbita')
    const lim = await sys<Awaited<ReturnType<typeof limitesDaPessoa>>>((tx) => limitesDaPessoa(tx, o.userId, o.orgId))
    expect(Object.values(lim.nivel).every((v) => v === 'orbita')).toBe(true)
    expect(lim.produtos.maestro).toMatchObject({
      origem: 'assinatura',
      limites: { clientes_ativos: 25, roteiros_ativos: null, financeiro: 1, marca_propria: 0 },
    })
    expect(lim.z.franquia).toBe(100)
  })

  it('admin da plataforma: Absoluto em tudo, inclusive os apps fechados', async () => {
    const o = await newOrgWithOwner(db, 'nivel-admin', { freePlan: true })
    await sys((tx) => tx`update zro.users set platform_role = 'admin' where id = ${o.userId}`)
    const n = await sys<Awaited<ReturnType<typeof niveisEfetivos>>>((tx) => niveisEfetivos(tx, o.userId, o.orgId))
    for (const id of [...NO_AR, 'ai-edit', 'finishing', 'nossom'])
      expect(
        n.find((x) => x.productId === id),
        id,
      ).toMatchObject({ nivel: 'absoluto', origem: 'admin' })
  })

  it('fora da organização: tudo Zero (o nível não vaza de outra organização)', async () => {
    const a = await newOrgWithOwner(db, 'nivel-a', { freePlan: true })
    await givePlan(db, a.orgId, 'absoluto')
    const b = await newUser(db, 'nivel-b')
    const n = await sys<Awaited<ReturnType<typeof niveisEfetivos>>>((tx) => niveisEfetivos(tx, b.userId, a.orgId))
    expect(n.every((x) => x.nivel === 'zero')).toBe(true)
  })

  it('claims do login único: zro_nivel por app e zro_teste_ate só com teste', async () => {
    const o = await newOrgWithOwner(db, 'nivel-claims', { freePlan: true })
    await givePlan(db, o.orgId, 'absoluto')
    const c = await sys<Awaited<ReturnType<typeof loadOidcClaims>>>((tx) => loadOidcClaims(tx, o.userId, o.orgId))
    expect(c.nivel).toMatchObject({ maestro: 'absoluto', relay: 'absoluto', tpeasy: 'absoluto' })
    expect(c.nivel?.['ai-edit']).toBeUndefined()
    expect(c.testeAte).toBeNull()
    const me = await meusLimites(db, o.auth)
    expect(me.nivel.maestro).toBe('absoluto')
  })
})

describe('Z: franquia do mês, depois a recarga', () => {
  it('gasta a franquia; acabou, gasta a recarga (que vence antes); recarga vencida não conta; repetido não conta de novo', async () => {
    const o = await newOrgWithOwner(db, 'z-recarga', { freePlan: true })
    const adm = await admin(db)
    for (let i = 0; i < 10; i++) {
      const r = await sys<Awaited<ReturnType<typeof consumeQuota>>>((tx) =>
        consumeQuota(tx, { orgId: o.orgId, metric: 'zro.ai_credits', idempotencyKey: `z:${o.orgId}:${i}` }),
      )
      expect(r).toMatchObject({ ok: true, fonte: 'franquia' })
    }
    expect(await sys((tx) => consumeQuota(tx, { orgId: o.orgId, metric: 'zro.ai_credits', idempotencyKey: `z:${o.orgId}:10` }))).toMatchObject({
      ok: false,
      code: 'quota_exceeded',
      recarga: 0,
    })
    // Recarga vencida não salva ninguém.
    await sys(
      (tx) =>
        tx`insert into zro.z_recargas (org_id, pacote, mensagens, expira_em, origem) values (${o.orgId}, 'z-100', 100, now() - interval '1 day', 'concessao')`,
    )
    expect(await sys((tx) => peekQuota(tx, o.orgId, 'zro.ai_credits', 1))).toMatchObject({ ok: false, recarga: 0 })
    await sys((tx) => concederRecarga(tx, { userId: adm, reason: 'teste' }, { orgId: o.orgId, pacote: 'z-100' }))
    expect(await sys((tx) => peekQuota(tx, o.orgId, 'zro.ai_credits', 1))).toMatchObject({ ok: true, fonte: 'recarga', recarga: 100 })
    const r = await sys<Awaited<ReturnType<typeof consumeQuota>>>((tx) =>
      consumeQuota(tx, { orgId: o.orgId, metric: 'zro.ai_credits', idempotencyKey: `z:${o.orgId}:10` }),
    )
    expect(r).toMatchObject({ ok: true, fonte: 'recarga', recarga: 99, used: 10, limit: 10 })
    const dup = await sys<Awaited<ReturnType<typeof consumeQuota>>>((tx) =>
      consumeQuota(tx, { orgId: o.orgId, metric: 'zro.ai_credits', idempotencyKey: `z:${o.orgId}:10` }),
    )
    expect(dup).toMatchObject({ ok: true, duplicate: true, fonte: 'recarga' })
    const [q] = await sys<Record<string, unknown>[]>(
      (tx) => tx`select (select used::int from zro.quotas where org_id = ${o.orgId} and metric = 'zro.ai_credits') as franquia,
                        (select sum(usadas)::int from zro.z_recargas where org_id = ${o.orgId}) as recarga`,
    )
    expect(q).toMatchObject({ franquia: 10, recarga: 1 })
    // O mesmo pagamento nunca vira duas recargas.
    const a1 = await sys<{ id: string; duplicate: boolean }>((tx) =>
      concederRecarga(tx, { userId: adm, reason: 'compra' }, { orgId: o.orgId, pacote: 'z-500', origem: 'compra', providerRef: `pi_${o.orgId}` }),
    )
    const a2 = await sys<{ id: string; duplicate: boolean }>((tx) =>
      concederRecarga(tx, { userId: adm, reason: 'compra' }, { orgId: o.orgId, pacote: 'z-500', origem: 'compra', providerRef: `pi_${o.orgId}` }),
    )
    expect(a2).toEqual({ id: a1.id, duplicate: true })
  })
})

describe('teste do Absoluto (campanha)', () => {
  let publicado: unknown
  let adm: string
  beforeAll(async () => {
    adm = await admin(db)
    const [r] = await db.sql`select value from zro.platform_settings where key = 'planos_b'`
    publicado = r!.value
    // Só as contas deste arquivo contam como "depois da publicação" (as dos outros arquivos viram antigas aqui).
    await db.sql`update zro.platform_settings set value = jsonb_build_object('publicado_em', now()) where key = 'planos_b'`
    await db.sql`update zro.teste_campanhas set desligada_em = now() where desligada_em is null`
  })
  afterAll(async () => {
    await db.sql`update zro.teste_campanhas set desligada_em = now() where desligada_em is null`
    await db.sql`update zro.platform_settings set value = ${db.sql.json(publicado as never)} where key = 'planos_b'`
  })

  it('desligado por padrão: conta nova fica no Zero e ninguém fala em teste', async () => {
    expect((await sys<Awaited<ReturnType<typeof campanhaAtual>>>((tx) => campanhaAtual(tx)))?.ativa ?? false).toBe(false)
    const o = await newOrgWithOwner(db, 'teste-desligado', { freePlan: true })
    expect(await sys((tx) => testeAtivoAte(tx, o.userId, o.orgId))).toBeNull()
    expect(await sys((tx) => iniciarTeste(tx, { userId: o.userId, origem: 'conta_nova' }))).toEqual({ ok: false, motivo: 'campanha_desligada' })
    const n = await sys<Awaited<ReturnType<typeof niveisEfetivos>>>((tx) => niveisEfetivos(tx, o.userId, o.orgId))
    expect(n.every((x) => x.nivel === 'zero')).toBe(true)
  })

  it('ligar: conta do Zero que já existia ganha agora; antiga e sem e-mail confirmado não; tudo na auditoria', async () => {
    const zeroAntes = await newOrgWithOwner(db, 'teste-existente', { freePlan: true })
    const semEmail = await newUser(db, 'teste-sem-email', { verified: false })
    await createOrganization(db, semEmail.auth, { name: 'Sem e-mail' })
    const antiga = await contaAntiga('teste-antiga')
    await expectCode(
      sys((tx) => ligarCampanha(tx, { userId: adm, reason: '' }, { fim: new Date(Date.now() + 86_400_000) })),
      'invalid_input',
    )
    const r = await sys<Awaited<ReturnType<typeof ligarCampanha>>>((tx) =>
      ligarCampanha(tx, { userId: adm, reason: 'lançamento' }, { fim: new Date(Date.now() + 20 * 86_400_000) }),
    )
    expect(r.iniciados).toBeGreaterThanOrEqual(1)
    const ate = await sys<Date | null>((tx) => testeAtivoAte(tx, zeroAntes.userId, zeroAntes.orgId))
    expect(ate).not.toBeNull()
    expect(Math.round((ate!.getTime() - Date.now()) / 86_400_000)).toBe(15)
    const n = await sys<Awaited<ReturnType<typeof niveisEfetivos>>>((tx) => niveisEfetivos(tx, zeroAntes.userId, zeroAntes.orgId))
    expect(n.every((x) => x.nivel === 'absoluto' && x.origem === 'teste')).toBe(true)
    const [t] = await sys<Record<string, unknown>[]>((tx) => tx`select origem, z_mensagens from zro.testes where user_id = ${zeroAntes.userId}`)
    expect(t).toMatchObject({ origem: 'inicio_campanha', z_mensagens: 50 })
    // Z do teste: 50 no período inteiro.
    expect(await sys((tx) => peekQuota(tx, zeroAntes.orgId, 'zro.ai_credits', 1))).toMatchObject({ limit: 50 })
    expect(await sys((tx) => planoAtual(tx, zeroAntes.userId, zeroAntes.orgId))).toMatchObject({ nome: 'Absoluto' })
    const c = await sys<Awaited<ReturnType<typeof loadOidcClaims>>>((tx) => loadOidcClaims(tx, zeroAntes.userId, zeroAntes.orgId))
    expect(c.testeAte).toBe(ate!.toISOString())
    for (const p of [semEmail, antiga]) {
      const [x] = await sys<Record<string, unknown>[]>((tx) => tx`select 1 from zro.testes where user_id = ${p.userId}`)
      expect(x).toBeUndefined()
    }
    expect(await sys((tx) => iniciarTeste(tx, { userId: antiga.userId, origem: 'conta_nova' }))).toEqual({ ok: false, motivo: 'conta_antiga' })
    const [a] = await db.sql`select count(*)::int as n from zro.audit_logs where action = 'billing.teste_campanha_ligada' and target_id = ${r.campanhaId}`
    expect(a!.n).toBe(1)
  })

  it('conta nova na campanha: com e-mail confirmado ganha ao criar a organização; sem, ganha ao confirmar', async () => {
    const nova = await newOrgWithOwner(db, 'teste-nova', { freePlan: true })
    expect(await sys((tx) => testeAtivoAte(tx, nova.userId, nova.orgId))).not.toBeNull()
    const [t] = await sys<Record<string, unknown>[]>((tx) => tx`select origem from zro.testes where user_id = ${nova.userId}`)
    expect(t!.origem).toBe('conta_nova')

    const email = `confirma-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
    const s = await signUp(db, { email, password: 'senha-de-teste-123', displayName: 'Confirma' })
    const auth = (await authenticate(db, s.session.token))!
    const org = await createOrganization(db, auth, { name: 'Confirma depois' })
    expect(await sys((tx) => testeAtivoAte(tx, s.userId, org.id))).toBeNull()
    expect(await verifyEmailFor(db, s.verifyToken)).toBe(s.userId)
    expect(await talvezIniciarTeste(db, { userId: s.userId })).toMatchObject({ ok: true, orgId: org.id })
    // Uma vez só.
    expect(await talvezIniciarTeste(db, { userId: s.userId })).toEqual({ ok: false, motivo: 'ja_teve' })
  })

  it('várias contas: e-mail normalizado repetido, e-mail descartável e mais de 3 por IP no dia são recusados e contados', async () => {
    expect(normalizarEmailTeste(' Fu.Lano+x@GoogleMail.com ')).toBe('fulano@gmail.com')
    expect(normalizarEmailTeste('fu.lano+x@outlook.com')).toBe('fu.lano@outlook.com')
    expect(emailDescartavel('alguem@mailinator.com')).toBe(true)
    expect(emailDescartavel('alguem@gmail.com')).toBe(false)
    const antes = await sys<Awaited<ReturnType<typeof resumoTestes>>>((tx) => resumoTestes(tx))

    const r = randomUUID().slice(0, 6)
    const cria = async (email: string) => {
      const s = await signUp(db, { email, password: 'senha-de-teste-123', displayName: 'Abuso' })
      await db.sql`update zro.users set email_verified_at = now() where id = ${s.userId}`
      await createOrganization(db, (await authenticate(db, s.session.token))!, { name: 'Abuso' })
      return s.userId
    }
    const g1 = await cria(`ab.c${r}@gmail.com`)
    const g2 = await cria(`abc${r}+outra@gmail.com`)
    expect(await sys((tx) => tx`select 1 from zro.testes where user_id = ${g1}`)).toHaveLength(1)
    expect(await sys((tx) => iniciarTeste(tx, { userId: g2, origem: 'conta_nova' }))).toEqual({ ok: false, motivo: 'email_repetido' })
    const d = await cria(`x${r}@yopmail.com`)
    expect(await sys((tx) => iniciarTeste(tx, { userId: d, origem: 'conta_nova' }))).toEqual({ ok: false, motivo: 'email_descartavel' })

    const mesmoIp = ip()
    const resultados = []
    for (let i = 0; i < 4; i++) {
      const u = await newUser(db, `teste-ip-${i}`)
      // Organização sem passar pelo gatilho (o teste aqui é chamado à mão, com o mesmo IP).
      await sys(async (tx) => {
        const [o] = await tx`insert into zro.organizations (name, slug, owner_id) values ('IP', ${'ip-' + randomUUID().slice(0, 8)}, ${u.userId}) returning id`
        await tx`insert into zro.memberships (org_id, user_id, role) values (${o!.id as string}, ${u.userId}, 'owner')`
      })
      resultados.push(
        await sys<Awaited<ReturnType<typeof iniciarTeste>>>((tx) => iniciarTeste(tx, { userId: u.userId, ipHash: mesmoIp, origem: 'conta_nova' })),
      )
    }
    expect(resultados.map((x) => (x.ok ? 'ok' : x.motivo))).toEqual(['ok', 'ok', 'ok', 'limite_ip'])
    // O IP só fica em hash.
    const [sinal] = await db.sql`select count(*)::int as n from zro.teste_sinais where tipo = 'ip' and valor_hash = ${mesmoIp}`
    expect(sinal!.n).toBe(3)

    const depois = await sys<Awaited<ReturnType<typeof resumoTestes>>>((tx) => resumoTestes(tx))
    expect(depois.recusados - antes.recusados).toBe(3)
    expect(depois.porMotivo.limite_ip).toBeGreaterThanOrEqual(1)
    expect(depois.ativos).toBeGreaterThan(antes.ativos)
  })

  it('estender e encerrar o teste de uma pessoa (admin, na auditoria)', async () => {
    const o = await newOrgWithOwner(db, 'teste-estender', { freePlan: true })
    const ate = (await sys<Date>((tx) => testeAtivoAte(tx, o.userId, o.orgId)))!
    const novo = await sys<Date>((tx) => estenderTeste(tx, { userId: adm, reason: 'cortesia' }, o.userId, 5))
    expect(Math.round((novo.getTime() - ate.getTime()) / 86_400_000)).toBe(5)
    expect((await sys<Date>((tx) => testeAtivoAte(tx, o.userId, o.orgId)))!.toISOString()).toBe(novo.toISOString())
    await sys((tx) => encerrarTeste(tx, { userId: adm, reason: 'pedido' }, o.userId))
    expect(await sys((tx) => testeAtivoAte(tx, o.userId, o.orgId))).toBeNull()
    const n = await sys<Awaited<ReturnType<typeof niveisEfetivos>>>((tx) => niveisEfetivos(tx, o.userId, o.orgId))
    expect(n.every((x) => x.nivel === 'zero')).toBe(true)
    await expectCode(
      sys((tx) => encerrarTeste(tx, { userId: adm, reason: 'de novo' }, o.userId)),
      'not_found',
    )
    const [a] =
      await db.sql`select count(*)::int as n from zro.audit_logs where target_id = ${o.userId} and action in ('billing.teste_estendido', 'billing.teste_encerrado')`
    expect(a!.n).toBe(2)
  })

  it('Z do teste vale para o período inteiro: o gasto de um mês anterior do teste sai do limite', async () => {
    const o = await newOrgWithOwner(db, 'teste-periodo', { freePlan: true })
    expect(await sys((tx) => peekQuota(tx, o.orgId, 'zro.ai_credits', 1))).toMatchObject({ limit: 50 })
    await sys(
      (tx) => tx`insert into zro.usage_events (org_id, metric, amount, idempotency_key, period_start)
                 values (${o.orgId}, 'zro.ai_credits', 45, ${'mes-passado-' + o.orgId}, date_trunc('month', now() at time zone 'utc') - interval '1 month')`,
    )
    // 50 do teste − 45 do mês anterior = 5; o Zero dá 10 por mês: vale o maior.
    expect(await sys((tx) => peekQuota(tx, o.orgId, 'zro.ai_credits', 1))).toMatchObject({ limit: 10 })
  })

  it('desligar: conta nova volta a nascer no Zero; quem está em teste mantém até o fim', async () => {
    const emTeste = await newOrgWithOwner(db, 'teste-mantem', { freePlan: true })
    expect(await sys((tx) => desligarCampanha(tx, { userId: adm, reason: 'fim da campanha' }))).toBe(true)
    const depois = await newOrgWithOwner(db, 'teste-depois', { freePlan: true })
    expect(await sys((tx) => testeAtivoAte(tx, depois.userId, depois.orgId))).toBeNull()
    expect(await sys((tx) => testeAtivoAte(tx, emTeste.userId, emTeste.orgId))).not.toBeNull()
  })

  it('campanha vencida (passou do fim): conta nova sem teste', async () => {
    await sys((tx) => ligarCampanha(tx, { userId: adm, reason: 'curta' }, { fim: new Date(Date.now() + 60_000), incluirExistentes: false }))
    const o = await newOrgWithOwner(db, 'teste-vencida', { freePlan: true })
    await db.sql`delete from zro.testes where user_id = ${o.userId}`
    const depoisDoFim = new Date(Date.now() + 120_000)
    expect(await sys((tx) => iniciarTeste(tx, { userId: o.userId, origem: 'conta_nova' }, depoisDoFim))).toEqual({ ok: false, motivo: 'campanha_desligada' })
    await sys((tx) => desligarCampanha(tx, { userId: adm, reason: 'fim' }))
  })
})

describe('contas antigas para o Zero (desligado por padrão)', () => {
  it('desligado recusa; ligado migra uma conta, com auditoria; a conta fica no Zero sem teste', async () => {
    const o = await contaAntiga('migra-legado')
    const adm = await admin(db)
    await expectCode(
      sys((tx) => migrarParaZero(tx, { userId: adm, reason: 'x' }, o.orgId)),
      'conflict',
    )
    await sys((tx) => ligarMigracaoLegado(tx, { userId: adm, reason: 'titular pediu' }, true))
    try {
      expect(await sys((tx) => migrarParaZero(tx, { userId: adm, reason: 'titular pediu' }, o.orgId))).toBe(true)
      const n = await sys<Awaited<ReturnType<typeof niveisEfetivos>>>((tx) => niveisEfetivos(tx, o.userId, o.orgId))
      expect(n.every((x) => x.nivel === 'zero' && x.origem === 'zero')).toBe(true)
      expect(await sys((tx) => peekQuota(tx, o.orgId, 'zro.ai_credits', 1))).toMatchObject({ limit: 10 })
      const [a] = await db.sql`select count(*)::int as n from zro.audit_logs where action = 'billing.migrado_para_zero' and target_id = ${o.orgId}`
      expect(a!.n).toBe(1)
      expect(await sys((tx) => migrarParaZero(tx, { userId: adm, reason: 'de novo' }, o.orgId))).toBe(false)
    } finally {
      await sys((tx) => ligarMigracaoLegado(tx, { userId: adm, reason: 'volta' }, false))
    }
  })
})

describe('isolamento (RLS)', () => {
  it('catálogo de limites: todos leem; só admin muda, em nome próprio e com auditoria', async () => {
    const u = await newUser(db, 'rls-limites')
    const [l] = await db.asUser(
      { userId: u.userId, orgId: null },
      (tx) => tx`select valor from zro.plan_limits where nivel = 'zero' and product_id = 'maestro' and chave = 'clientes_ativos'`,
    )
    expect(Number(l!.valor)).toBe(3)
    const mudou = await db.asUser(
      { userId: u.userId, orgId: null },
      (tx) =>
        tx`update zro.plan_limits set valor = 999, atualizado_por = ${u.userId} where nivel = 'zero' and product_id = 'maestro' and chave = 'clientes_ativos' returning 1`,
    )
    expect(mudou).toHaveLength(0)
    await expectCode(
      atualizarLimite(db, u.auth, { nivel: 'zero', productId: 'maestro', chave: 'clientes_ativos', valor: 999, reason: 'x' }),
      'platform_role_required',
    )
    const a = await newUser(db, 'rls-limites-admin')
    await db.sql`update zro.users set platform_role = 'financeiro' where id = ${a.userId}`
    await expectCode(
      atualizarLimite(db, await refresh(db, a.token), { nivel: 'zero', productId: 'maestro', chave: 'clientes_ativos', valor: 4, reason: 'x' }),
      'platform_role_required',
    )
    await db.sql`update zro.users set platform_role = 'admin' where id = ${a.userId}`
    await atualizarLimite(db, await refresh(db, a.token), { nivel: 'zero', productId: 'maestro', chave: 'clientes_ativos', valor: 4, reason: 'ajuste' })
    const [depois] =
      await db.sql`select valor, atualizado_por from zro.plan_limits where nivel = 'zero' and product_id = 'maestro' and chave = 'clientes_ativos'`
    expect(depois).toMatchObject({ atualizado_por: a.userId })
    expect(Number(depois!.valor)).toBe(4)
    await atualizarLimite(db, await refresh(db, a.token), { nivel: 'zero', productId: 'maestro', chave: 'clientes_ativos', valor: 3, reason: 'volta' })
    const [aud] = await db.sql`select count(*)::int as n from zro.audit_logs where action = 'catalog.plan_limit_updated' and actor_user_id = ${a.userId}`
    expect(aud!.n).toBe(2)
  })

  it('teste, recarga, campanha e sinais: cada um vê só o seu', async () => {
    const a = await newOrgWithOwner(db, 'rls-a', { freePlan: true })
    const b = await newOrgWithOwner(db, 'rls-b', { freePlan: true })
    const adm = await admin(db)
    await sys(async (tx) => {
      const [c] =
        await tx`insert into zro.teste_campanhas (inicio, fim, desligada_em, motivo) values (now() - interval '2 days', now() - interval '1 day', now(), 'rls') returning id`
      for (const p of [a, b]) {
        await tx`insert into zro.testes (user_id, org_id, campanha_id, origem, inicio, fim, z_mensagens)
                 values (${p.userId}, ${p.orgId}, ${c!.id as string}, 'conta_nova', now(), now() + interval '1 day', 50) on conflict do nothing`
      }
    })
    await sys((tx) => concederRecarga(tx, { userId: adm, reason: 'rls' }, { orgId: b.orgId, pacote: 'z-100' }))
    const asA = <T>(fn: Parameters<Database['asUser']>[1]) => db.asUser({ userId: a.userId, orgId: a.orgId }, fn) as Promise<T>
    const testes = await asA<Record<string, unknown>[]>((tx) => tx`select user_id from zro.testes`)
    expect(testes.map((t) => t.user_id)).toEqual([a.userId])
    expect(await asA((tx) => tx`select id from zro.z_recargas`)).toHaveLength(0)
    expect(await asA((tx) => tx`select id from zro.teste_campanhas`)).toHaveLength(0)
    await expect(asA((tx) => tx`select id from zro.teste_sinais`)).rejects.toThrow(/permission denied/)
    await expect(asA((tx) => tx`select id from zro.teste_recusas`)).rejects.toThrow(/permission denied/)
    const asB = await db.asUser({ userId: b.userId, orgId: b.orgId }, (tx) => tx`select mensagens from zro.z_recargas`)
    expect(asB).toHaveLength(1)
    // A organização B não aparece trocando a organização ativa para ela sem vínculo.
    expect(await db.asUser({ userId: a.userId, orgId: b.orgId }, (tx) => tx`select id from zro.z_recargas`)).toHaveLength(0)
  })
})
