// Entregas entre apps (Criação F8): o roteiro do Maestro direto na caixa de entrada do TPeasy pelo HUB. Confere o
// contrato (entrada e respostas), a idempotência (a mesma versão de novo não duplica; versão nova = outra entrega no
// mesmo item), o gate (TPeasy no plano, papel de quem edita, só o app de origem manda e só o de destino lê), o
// isolamento entre organizações e pessoas (RLS), a equipe que usa o TPeasy, o "Recebido", o evento com
// idempotency_key, a auditoria sem o texto e o escopo novo do cliente do TPeasy.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  authenticateAccessToken,
  exchangeToken,
  grantConsent,
  issueCode,
  parseAuthorizeRequest,
  parseTokenRequest,
  PRODUCT_SCOPES,
  registerClient,
  setIssuer,
  type Authenticated,
  type AuthorizeRequest,
} from '@zro/auth'
import { grantEntitlement } from '@zro/billing'
import { findEventCycle, loadOidcClaims } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import {
  DISABLED_ROUTES,
  destinatariosDeEntrega,
  ENTREGA_ACAO,
  enviarEntrega,
  entregasEnviadas,
  entregasRecebidas,
  HANDLER_EMITS,
  LIMITE_ENTREGAS,
  marcarRecebidas,
  ROUTES,
} from '@zro/integrations'
import {
  AppEntregaDestinatariosSchema,
  AppEntregaEntradaSchema,
  AppEntregaEstadoSchema,
  AppEntregasEnviadasSchema,
  AppEntregasRecebidasSchema,
  chaveDaEntrega,
  EVENT_PRODUCER,
  itemNoTpeasy,
  validateEventPayload,
} from '@zro/media-contracts'
import { admin, allowRelease, expectCode, newOrgWithOwner, newUser } from './helpers'

let db: Database
const ISS = 'https://hub.teste.absolutezro.local'
const rid = (p: string) => `${p}-${randomBytes(4).toString('hex')}`

beforeAll(() => {
  db = testDatabase()
  setIssuer(ISS)
})
afterAll(() => db.close())

async function cliente(productId: 'maestro' | 'tpeasy') {
  const by = await admin(db)
  const c = await db.asSystem('teste', (tx) =>
    registerClient(tx, {
      id: rid(productId),
      name: productId,
      productId,
      kind: 'confidential',
      redirectUris: [`https://${productId}.teste/cb`],
      allowLoopback: false,
      createdBy: by,
    }),
  )
  return { ...c, productId }
}

/** O access token do app (Maestro com maestro.projects, TPeasy com tpeasy.roteiros) para a pessoa na organização. */
async function tokenDoApp(c: { clientId: string; clientSecret: string | null; productId: string }, userId: string, orgId: string): Promise<Authenticated> {
  const escopo = c.productId === 'maestro' ? 'maestro.projects' : 'tpeasy.roteiros'
  if (c.productId === 'maestro') await allowRelease(db, 'maestro', userId)
  const verifier = randomBytes(32).toString('base64url')
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: c.clientId,
    redirect_uri: `https://${c.productId}.teste/cb`,
    scope: `openid org offline_access ${escopo}`,
    state: 'st',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  })
  const code = await db.asSystem('teste', async (tx) => {
    const p = await parseAuthorizeRequest(tx, q)
    if (!p.ok) throw new Error('pedido recusado')
    await grantConsent(tx, userId, c.clientId, p.req.scopes)
    return new URL(await issueCode(tx, p.req as AuthorizeRequest, { userId, orgId, authTime: new Date() })).searchParams.get('code')!
  })
  const basic = `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`
  const t = await exchangeToken(
    db,
    parseTokenRequest(
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `https://${c.productId}.teste/cb`, code_verifier: verifier }),
      basic,
    ),
    loadOidcClaims,
  )
  const auth = await authenticateAccessToken(db, `Bearer ${t.access_token}`, escopo)
  if (!auth) throw new Error('token recusado')
  return auth
}

async function darProduto(orgId: string, productId: string) {
  const by = await admin(db)
  await db.asSystem('teste', (tx) => grantEntitlement(tx, { userId: by, reason: 'teste' }, { orgId, productId, features: null, limits: {}, endsAt: null }))
}

async function membro(orgId: string, label: string, role = 'editor') {
  const u = await newUser(db, label)
  await db.asSystem('teste', (tx) => tx`insert into zro.memberships (org_id, user_id, role, status) values (${orgId}, ${u.userId}, ${role}, 'active')`)
  return u
}

const texto = '# Cena 1 · O começo\nO café chega antes do sol. [pausa]\n\n**Todo dia**, na mesma xícara. ((sorrir))'
const entrada = (roteiro = randomUUID(), versao = 1, extra: Record<string, unknown> = {}) => ({
  destino: 'tpeasy',
  tipo: 'roteiro',
  roteiro: { id: roteiro, versao, pessoa: 'demo-ant', sha256: 'a'.repeat(64) },
  titulo: 'Café Aurora · Antônio',
  corpo: texto,
  link: `https://maestro.absolutezro.com/app/criacao/roteiros/${roteiro}`,
  alvo_seg: 60,
  ...extra,
})

async function cenario(label: string) {
  const o = await newOrgWithOwner(db, label)
  await darProduto(o.orgId, 'maestro')
  await darProduto(o.orgId, 'tpeasy')
  const mae = await cliente('maestro')
  const tp = await cliente('tpeasy')
  return { o, mae, tp, maestro: await tokenDoApp(mae, o.userId, o.orgId), tpeasy: await tokenDoApp(tp, o.userId, o.orgId) }
}

describe('entregas entre apps (Maestro → TPeasy)', () => {
  it('o cliente do TPeasy ganha o escopo tpeasy.roteiros (cadastro novo e a migração 0040)', async () => {
    expect(PRODUCT_SCOPES.tpeasy).toEqual(['tpeasy.roteiros'])
    const c = await cliente('tpeasy')
    const [r] = await db.sql`select scopes from zro.oauth_clients where id = ${c.clientId}`
    expect(r!.scopes).toContain('tpeasy.roteiros')
    expect(r!.scopes).not.toContain('maestro.projects')
    const [mae] = await db.sql`select scopes from zro.oauth_clients where product_id = 'maestro' limit 1`
    expect(mae?.scopes ?? []).not.toContain('tpeasy.roteiros')
  })

  it('manda para o próprio TPeasy: o aparelho lê na caixa, grava e conta; o Maestro vê "Recebido"', async () => {
    const { o, maestro, tpeasy } = await cenario('tp-eu')
    const e = entrada()
    expect(AppEntregaEntradaSchema.safeParse(e).success).toBe(true)
    const r = await enviarEntrega(db, maestro, e)
    expect(AppEntregaEstadoSchema.safeParse(r).success).toBe(true)
    expect(r).toMatchObject({ situacao: 'nova', item: itemNoTpeasy(e.roteiro), versao: 1, para: { id: o.userId, eu: true }, recebida_em: null })

    const caixa = await entregasRecebidas(db, tpeasy, { destino: 'tpeasy' })
    expect(AppEntregasRecebidasSchema.safeParse(caixa).success).toBe(true)
    expect(caixa.entregas).toHaveLength(1)
    expect(caixa.entregas[0]).toMatchObject({
      id: r.id,
      origem: 'maestro',
      tipo: 'roteiro',
      item: itemNoTpeasy(e.roteiro),
      versao: 1,
      titulo: e.titulo,
      corpo: texto,
      link: e.link,
      alvo_seg: 60,
      sha256: createHash('sha256').update(texto).digest('hex'),
    })
    expect(caixa.entregas[0]!.item).toBe(`maestro-${e.roteiro.id}-demo-ant`)
    // `desde` = o `agora` da última leitura: nada novo
    expect((await entregasRecebidas(db, tpeasy, { destino: 'tpeasy', desde: caixa.agora })).entregas).toHaveLength(0)

    expect(await marcarRecebidas(db, tpeasy, { ids: [r.id] })).toEqual({ marcadas: 1 })
    expect(await marcarRecebidas(db, tpeasy, { ids: [r.id] })).toEqual({ marcadas: 0 })
    const enviadas = await entregasEnviadas(db, maestro, { roteiro: e.roteiro.id })
    expect(AppEntregasEnviadasSchema.safeParse(enviadas).success).toBe(true)
    expect(enviadas.entregas).toHaveLength(1)
    expect(enviadas.entregas[0]!.recebida_em).not.toBeNull()
  })

  it('idempotência: a mesma versão de novo não duplica (reenviada, volta para a caixa); versão nova = outra entrega, o mesmo item', async () => {
    const { o, maestro, tpeasy } = await cenario('tp-idem')
    const roteiro = randomUUID()
    const v1 = await enviarEntrega(db, maestro, entrada(roteiro, 1))
    const caixa = await entregasRecebidas(db, tpeasy, { destino: 'tpeasy' })
    await marcarRecebidas(db, tpeasy, { ids: [v1.id] })

    const de = await enviarEntrega(db, maestro, entrada(roteiro, 1))
    expect(de).toMatchObject({ id: v1.id, situacao: 'reenviada', recebida_em: null })
    const [{ n }] = (await db.sql`select count(*)::int as n from zro.app_entregas where destinatario_id = ${o.userId}`) as unknown as [{ n: number }]
    expect(n).toBe(1)
    // o aparelho vê de novo (o reenvio muda atualizada_em) e o TPeasy junta pelo item
    const outra = await entregasRecebidas(db, tpeasy, { destino: 'tpeasy', desde: caixa.agora })
    expect(outra.entregas.map((x) => x.id)).toEqual([v1.id])

    const v2 = await enviarEntrega(db, maestro, entrada(roteiro, 2, { corpo: `${texto}\n\nUma fala nova.` }))
    expect(v2.situacao).toBe('nova')
    expect(v2.id).not.toBe(v1.id)
    const todas = await entregasRecebidas(db, tpeasy, { destino: 'tpeasy' })
    expect(new Set(todas.entregas.map((x) => x.item))).toEqual(new Set([itemNoTpeasy({ id: roteiro, pessoa: 'demo-ant' })]))
    expect(todas.entregas.map((x) => x.versao).sort()).toEqual([1, 2])
    expect((await entregasEnviadas(db, maestro, { roteiro })).entregas.map((x) => x.versao)).toEqual([2, 1])

    // um evento por entrega (idempotency_key app.entrega:<id>): o reenvio não gera outro; payload dentro do contrato
    const ev =
      await db.sql`select event_type, producer, idempotency_key, payload from zro.workflow_events where org_id = ${o.orgId} and event_type = 'script.version.sent' order by created_at`
    expect(ev.map((x) => x.idempotency_key)).toEqual([`app.entrega:${v1.id}`, `app.entrega:${v2.id}`])
    expect(ev[0]!.producer).toBe('maestro')
    expect(validateEventPayload('script.version.sent', 1, ev[0]!.payload)).toEqual({ ok: true })
    expect(JSON.stringify(ev[0]!.payload)).not.toContain('café')
    const runs = await db.sql`select 1 from zro.workflow_runs r join zro.workflow_events e on e.id = r.event_id where e.org_id = ${o.orgId}`
    expect(runs).toHaveLength(0)

    // auditoria sem o texto: nova, reenviada, nova
    const log = await db.sql`select metadata from zro.audit_logs where action = ${ENTREGA_ACAO} and actor_user_id = ${o.userId} order by created_at`
    expect(log.map((l) => (l.metadata as { situacao: string }).situacao)).toEqual(['nova', 'reenviada', 'nova'])
    expect(JSON.stringify(log)).not.toContain('xícara')
    expect(chaveDaEntrega({ id: roteiro, versao: 2, pessoa: null })).toBe(`maestro:roteiro:${roteiro}:todas:v2`)
  })

  it('gate: sem o TPeasy no plano, 403 e nada guardado; leitura não manda; só o Maestro manda e só o TPeasy lê', async () => {
    const o = await newOrgWithOwner(db, 'tp-gate')
    await darProduto(o.orgId, 'maestro')
    const mae = await cliente('maestro')
    const tp = await cliente('tpeasy')
    const maestro = await tokenDoApp(mae, o.userId, o.orgId)
    const tpeasy = await tokenDoApp(tp, o.userId, o.orgId)
    const e = await expectCode(enviarEntrega(db, maestro, entrada()), 'entitlement_required')
    expect(e.status).toBe(403)
    await expectCode(destinatariosDeEntrega(db, maestro, 'tpeasy'), 'entitlement_required')
    expect(await db.sql`select 1 from zro.app_entregas where remetente_id = ${o.userId}`).toHaveLength(0)

    await darProduto(o.orgId, 'tpeasy')
    // o TPeasy não manda; o Maestro não lê a caixa; sessão do navegador do HUB (sem app) não faz nenhum dos dois
    await expectCode(enviarEntrega(db, tpeasy, entrada()), 'action_not_allowed')
    await expectCode(entregasRecebidas(db, maestro, { destino: 'tpeasy' }), 'action_not_allowed')
    await expectCode(entregasRecebidas(db, tpeasy, { destino: 'maestro' }), 'action_not_allowed')
    await expectCode(enviarEntrega(db, o.auth, entrada()), 'action_not_allowed')
    // destino ou tipo fora da lista, entrada fora do formato
    await expectCode(enviarEntrega(db, maestro, entrada(undefined, 1, { destino: 'synquei' })), 'action_not_allowed')
    await expectCode(enviarEntrega(db, maestro, entrada(undefined, 1, { tipo: 'fluxo' })), 'action_not_allowed')
    await expectCode(enviarEntrega(db, maestro, entrada(undefined, 1, { corpo: '' })), 'invalid_input')
    await expectCode(enviarEntrega(db, maestro, entrada(undefined, 1, { corpo: '   \n  ' })), 'invalid_input')
    await expectCode(enviarEntrega(db, maestro, entrada(undefined, 1, { link: 'http://maestro.exemplo.com/x' })), 'invalid_input')
    await expectCode(enviarEntrega(db, maestro, entrada(undefined, 1, { extra: 1 })), 'invalid_input')

    // papel de leitura (viewer) não manda
    const leitor = await membro(o.orgId, 'tp-leitor', 'viewer')
    const maestroLeitor = await tokenDoApp(mae, leitor.userId, o.orgId)
    await expectCode(enviarEntrega(db, maestroLeitor, entrada()), 'forbidden_role')
  })

  it('para alguém da equipe que usa o TPeasy: aparece na lista e recebe; quem não usa, ou é de fora, não', async () => {
    const { o, mae, tp, maestro } = await cenario('tp-equipe')
    const ana = await membro(o.orgId, 'tp-ana')
    const beto = await membro(o.orgId, 'tp-beto')
    const tpeasyAna = await tokenDoApp(tp, ana.userId, o.orgId) // Ana já entrou no TPeasy (consentimento ativo)
    void mae
    const lista = await destinatariosDeEntrega(db, maestro, 'tpeasy')
    expect(AppEntregaDestinatariosSchema.safeParse(lista).success).toBe(true)
    expect(lista.destinatarios.map((d) => [d.id, d.eu])).toEqual([
      [o.userId, true],
      [ana.userId, false],
    ])
    expect(JSON.stringify(lista)).not.toContain('@teste.absolutezro.local')

    const r = await enviarEntrega(db, maestro, entrada(undefined, 1, { para: ana.userId }))
    expect(r.para).toMatchObject({ id: ana.userId, eu: false })
    expect((await entregasRecebidas(db, tpeasyAna, { destino: 'tpeasy' })).entregas.map((x) => x.id)).toEqual([r.id])
    expect((await entregasRecebidas(db, tpeasyAna, { destino: 'tpeasy' })).entregas[0]!.de).toContain('tp-equipe')
    // Beto é da equipe mas nunca abriu o TPeasy; a pessoa de outra organização nunca
    await expectCode(enviarEntrega(db, maestro, entrada(undefined, 1, { para: beto.userId })), 'not_found')
    const fora = await newOrgWithOwner(db, 'tp-fora')
    await expectCode(enviarEntrega(db, maestro, entrada(undefined, 1, { para: fora.userId })), 'not_found')
    await expectCode(enviarEntrega(db, maestro, entrada(undefined, 1, { para: randomUUID() })), 'not_found')
  })

  it('isolamento: cada pessoa lê só a própria caixa e só o que mandou; outra organização não vê nada', async () => {
    const a = await cenario('tp-iso-a')
    const b = await cenario('tp-iso-b')
    const roteiro = randomUUID()
    const ra = await enviarEntrega(db, a.maestro, entrada(roteiro, 1))
    await enviarEntrega(db, b.maestro, entrada(randomUUID(), 1))
    expect((await entregasRecebidas(db, a.tpeasy, {})).entregas.map((x) => x.id)).toEqual([ra.id])
    expect((await entregasRecebidas(db, b.tpeasy, {})).entregas.map((x) => x.id)).not.toContain(ra.id)
    expect((await entregasEnviadas(db, b.maestro, { roteiro })).entregas).toHaveLength(0)
    // B não marca a entrega de A
    expect(await marcarRecebidas(db, b.tpeasy, { ids: [ra.id] })).toEqual({ marcadas: 0 })
    // pelo RLS: zro_app de B não lê a linha de A; e não escreve na tabela direto
    const linhas = await db.asUser({ userId: b.o.userId, orgId: b.o.orgId }, (tx) => tx`select id from zro.app_entregas where id = ${ra.id}`)
    expect(linhas).toHaveLength(0)
    await expect(
      db.asUser(
        { userId: b.o.userId, orgId: b.o.orgId },
        (tx) =>
          tx`insert into zro.app_entregas (org_id, origem, destino, tipo, remetente_id, destinatario_id, chave, item, versao, titulo, corpo, sha256)
             values (${b.o.orgId}, 'maestro', 'tpeasy', 'roteiro', ${b.o.userId}, ${a.o.userId}, 'maestro:roteiro:x:todas:v1', 'maestro-x', 1, 't', 'c', ${'b'.repeat(64)})`,
      ),
    ).rejects.toThrow()
    // a função também recusa mandar para quem não é da organização ativa
    await expect(
      db.asUser(
        { userId: b.o.userId, orgId: b.o.orgId },
        (tx) =>
          tx`select * from zro.app_entrega_enviar(${a.o.userId}, 'maestro', 'tpeasy', 'roteiro', 'maestro:roteiro:y:todas:v1', 'maestro-y', 1, 't', 'c', ${'c'.repeat(64)}, null, 0)`,
      ),
    ).rejects.toThrow(/destinatario/)
  })

  it('limite por pessoa e a vida de 30 dias na caixa', async () => {
    const { o, maestro, tpeasy } = await cenario('tp-limite')
    const roteiro = randomUUID()
    const primeira = await enviarEntrega(db, maestro, entrada(roteiro, 1))
    await db.asSystem('teste: envelhecer', (tx) => tx`update zro.app_entregas set atualizada_em = now() - interval '31 days' where id = ${primeira.id}`)
    expect((await entregasRecebidas(db, tpeasy, {})).entregas).toHaveLength(0)
    // o próximo envio para a mesma pessoa limpa o que passou de 30 dias
    await enviarEntrega(db, maestro, entrada(roteiro, 2))
    expect(await db.sql`select 1 from zro.app_entregas where id = ${primeira.id}`).toHaveLength(0)
    for (let i = 2; i < LIMITE_ENTREGAS.max; i++) await enviarEntrega(db, maestro, entrada(roteiro, 2))
    await expectCode(enviarEntrega(db, maestro, entrada(roteiro, 3)), 'rate_limited')
    void o
  })

  it('o evento novo entra no contrato e na conferência de ciclo (sem rota: o TPeasy lê a caixa)', () => {
    expect(EVENT_PRODUCER['script.version.sent']).toBe('maestro')
    expect(ROUTES['script.version.sent']).toBeUndefined()
    expect(findEventCycle({ ...ROUTES, ...DISABLED_ROUTES }, HANDLER_EMITS)).toBeNull()
    expect(
      validateEventPayload('script.version.sent', 1, {
        origem: 'maestro',
        roteiro_id: randomUUID(),
        versao: 1,
        sha256: 'a'.repeat(64),
        titulo: 'x',
        destino: 'tpeasy',
        entrega_id: randomUUID(),
      }),
    ).toEqual({ ok: true })
    expect(validateEventPayload('script.version.sent', 1, { origem: 'maestro', corpo: 'texto' }).ok).toBe(false)
  })
})
