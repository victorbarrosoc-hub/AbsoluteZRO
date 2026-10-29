// Conexões (ADR 0026): o Google Agenda conectado uma vez na conta e usado pelos apps pelo HUB. Contra um Google falso
// (tests/fixtures/google-falso.ts): cifra e chave, state/nonce/PKCE, volta do Google (cancelar, escopo faltando),
// guardar e renovar (invalid_grant vira "reconectar"), RLS entre pessoas, a API para apps (escopo, outra pessoa, app
// desligado, sem conexão, outro app, gate) e a auditoria sem conteúdo de evento.
import { createHash, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  authenticateAccessToken,
  exchangeToken,
  grantConsent,
  issueCode,
  parseAuthorizeRequest,
  parseTokenRequest,
  registerClient,
  setIssuer,
  type AuthorizeRequest,
  type Authenticated,
} from '@zro/auth'
import {
  abrir,
  abrirPendente,
  acessoGoogle,
  alternarAppDaConexao,
  apagarEvento,
  calendariosGoogle,
  chaveDasConexoes,
  desconectarGoogle,
  escolherCalendarios,
  estadoDaAgenda,
  eventosDaAgenda,
  googleUrls,
  gravarEvento,
  idDoEvento,
  inicioConexaoGoogle,
  juntarIntervalos,
  LIMITE_AGENDA_LEITURA,
  livreOcupado,
  loadOidcClaims,
  meiaNoite,
  minhasConexoes,
  selar,
  selarPendente,
  trocarCodigoGoogle,
  guardarConexaoGoogle,
  type AmbienteAgenda,
  type GoogleAgendaConfig,
} from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { iniciarGoogleFalso, type GoogleFalso } from '../fixtures/google-falso'
import { admin, allowRelease, expectCode, newOrgWithOwner } from './helpers'

let db: Database
let g: GoogleFalso
let cfg: GoogleAgendaConfig
let amb: AmbienteAgenda
const ISS = 'https://hub.teste.absolutezro.local'
const chave = chaveDasConexoes({ ZRO_CONEXOES_KEY: randomBytes(32).toString('base64') })!
const rid = (p: string) => `${p}-${randomBytes(4).toString('hex')}`

beforeAll(async () => {
  db = testDatabase()
  setIssuer(ISS)
  g = await iniciarGoogleFalso()
  cfg = {
    clientId: g.clientId,
    clientSecret: 'segredo-google-teste',
    redirectUri: `${ISS}/conexoes/google/retorno`,
    conexoesUrl: `${ISS}/conexoes`,
    ...googleUrls(g.url),
  }
  amb = { cfg, chave }
})
afterAll(async () => {
  await g.fechar()
  await db.close()
})

/** Faz a ida e volta ao Google falso como o navegador faria e guarda a conexão. */
async function conectar(auth: Authenticated) {
  const { url, pendente } = inicioConexaoGoogle(cfg, auth.user.id)
  const res = await fetch(url, { redirect: 'manual' })
  const volta = new URL(res.headers.get('location')!)
  const t = await trocarCodigoGoogle(cfg, pendente, {
    code: volta.searchParams.get('code'),
    state: volta.searchParams.get('state'),
    error: volta.searchParams.get('error'),
  })
  await guardarConexaoGoogle(db, chave, auth, t)
  return t
}

async function cliente(productId = 'maestro') {
  const by = await admin(db)
  return db.asSystem('teste', (tx) =>
    registerClient(tx, {
      id: rid('app'),
      name: 'App',
      productId,
      kind: 'confidential',
      redirectUris: ['https://app.teste/cb'],
      allowLoopback: false,
      createdBy: by,
    }),
  )
}

/** Token de app da pessoa com os escopos pedidos (o login único de verdade, sem o navegador). */
async function tokenDoApp(c: { clientId: string; clientSecret: string | null }, userId: string, orgId: string, escopos = 'zro.agenda', productId = 'maestro') {
  await allowRelease(db, productId, userId)
  const verifier = randomBytes(32).toString('base64url')
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: c.clientId,
    redirect_uri: 'https://app.teste/cb',
    scope: `openid org offline_access ${escopos}`,
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
  const t = await exchangeToken(
    db,
    parseTokenRequest(
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'https://app.teste/cb', code_verifier: verifier }),
      `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`,
    ),
    loadOidcClaims,
  )
  return t.access_token
}

async function pessoaComApp(label: string) {
  const o = await newOrgWithOwner(db, label)
  const at = await tokenDoApp(await cliente(), o.userId, o.orgId)
  const app = (await authenticateAccessToken(db, `Bearer ${at}`, 'zro.agenda'))!
  return { ...o, app }
}

describe('cifra e chave', () => {
  it('deriva duas chaves distintas de ZRO_CONEXOES_KEY e recusa sem ela ou curta', () => {
    expect(chaveDasConexoes({})).toBeNull()
    expect(chaveDasConexoes({ ZRO_CONEXOES_KEY: 'curta' })).toBeNull()
    const hex = chaveDasConexoes({ ZRO_CONEXOES_KEY: 'ab'.repeat(32) })!
    expect(hex.tokens.length).toBe(32)
    expect(hex.tokens.equals(hex.cookie)).toBe(false)
    // A mesma entrada dá a mesma chave (sobrevive a deploy).
    expect(chaveDasConexoes({ ZRO_CONEXOES_KEY: 'ab'.repeat(32) })!.tokens.equals(hex.tokens)).toBe(true)
  })

  it('AES-256-GCM com contexto: outro contexto, outra chave ou um byte trocado não abrem', () => {
    const s = selar(chave.tokens, 'segredo', 'conexao:a:google:refresh')
    expect(s).toMatch(/^v1\./)
    expect(s).not.toContain('segredo')
    expect(abrir(chave.tokens, s, 'conexao:a:google:refresh')).toBe('segredo')
    expect(abrir(chave.tokens, s, 'conexao:b:google:refresh')).toBeNull()
    expect(abrir(chave.cookie, s, 'conexao:a:google:refresh')).toBeNull()
    const partes = s.split('.')
    partes[2] = Buffer.from('outra coisa').toString('base64url')
    expect(abrir(chave.tokens, partes.join('.'), 'conexao:a:google:refresh')).toBeNull()
    expect(abrir(chave.tokens, 'lixo', 'x')).toBeNull()
  })
})

describe('ida ao Google', () => {
  it('pede offline, consentimento, escopos da Agenda e PKCE S256; o cookie é cifrado, curto e preso à pessoa', () => {
    const { url, pendente } = inicioConexaoGoogle(cfg, 'pessoa-1', 1_000)
    const q = new URL(url).searchParams
    expect(q.get('access_type')).toBe('offline')
    expect(q.get('prompt')).toBe('consent')
    expect(q.get('include_granted_scopes')).toBe('true')
    expect(q.get('code_challenge_method')).toBe('S256')
    expect(q.get('code_challenge')).toBe(createHash('sha256').update(pendente.verifier).digest('base64url'))
    expect(q.get('scope')!.split(' ')).toEqual(
      expect.arrayContaining([
        'openid',
        'email',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      ]),
    )
    expect(q.get('state')).toBe(pendente.state)
    const cookie = selarPendente(chave, pendente)
    expect(cookie).not.toContain(pendente.verifier)
    expect(abrirPendente(chave, cookie, 2_000)).toEqual(pendente)
    expect(abrirPendente(chave, cookie, pendente.exp + 1)).toBeNull()
    expect(abrirPendente(chaveDasConexoes({ ZRO_CONEXOES_KEY: 'cd'.repeat(32) })!, cookie, 2_000)).toBeNull()
  })

  it('cancelar, state trocado e permissão da Agenda desmarcada viram motivos claros', async () => {
    const { pendente } = inicioConexaoGoogle(cfg, 'x')
    const motivo = (p: Promise<unknown>) =>
      p.then(
        () => null,
        (e: { details?: { motivo?: string } }) => e.details?.motivo,
      )
    expect(await motivo(trocarCodigoGoogle(cfg, pendente, { code: null, state: pendente.state, error: 'access_denied' }))).toBe('cancelado')
    expect(await motivo(trocarCodigoGoogle(cfg, pendente, { code: 'c', state: 'outro', error: null }))).toBe('expirou')
    g.estado.decisao = 'sem_agenda'
    try {
      const i = inicioConexaoGoogle(cfg, 'x')
      const volta = new URL((await fetch(i.url, { redirect: 'manual' })).headers.get('location')!)
      expect(
        await motivo(trocarCodigoGoogle(cfg, i.pendente, { code: volta.searchParams.get('code'), state: volta.searchParams.get('state'), error: null })),
      ).toBe('escopo')
    } finally {
      g.estado.decisao = 'aceitar'
    }
    // nonce diferente (id_token de outro pedido): recusa.
    const i = inicioConexaoGoogle(cfg, 'x')
    const volta = new URL((await fetch(i.url, { redirect: 'manual' })).headers.get('location')!)
    expect(
      await motivo(trocarCodigoGoogle(cfg, { ...i.pendente, nonce: 'outro' }, { code: volta.searchParams.get('code'), state: i.pendente.state, error: null })),
    ).toBe('google')
  })
})

describe('guardar, ler e renovar', () => {
  it('guarda cifrado, mostra a conta e as agendas, e cada pessoa só vê a própria (RLS)', async () => {
    const a = await newOrgWithOwner(db, 'cx-a')
    const b = await newOrgWithOwner(db, 'cx-b')
    const t = await conectar(a.auth)
    const [l] = await db.sql`select * from zro.conexoes where user_id = ${a.userId}`
    expect(l!.refresh_token_enc).toMatch(/^v1\./)
    expect(String(l!.refresh_token_enc)).not.toContain(t.refreshToken!)
    expect(String(l!.access_token_enc)).not.toContain(t.accessToken)
    const minhas = await minhasConexoes(db, a.auth)
    expect(minhas.google).toMatchObject({ contaEmail: 'pessoa@gmail.test', estado: 'ativa', calendarios: ['primary'] })
    const cals = await calendariosGoogle(db, cfg, chave, a.auth)
    expect(cals[0]).toMatchObject({ id: 'primary', principal: true, escolhido: true })
    expect(cals.map((c) => c.nome)).toContain('Trabalho')
    // Outra pessoa: não vê, não muda, não apaga.
    expect((await minhasConexoes(db, b.auth)).google).toBeNull()
    const vistas = await db.asUser({ userId: b.userId, orgId: b.orgId }, (tx) => tx`select id from zro.conexoes`)
    expect(vistas).toHaveLength(0)
    const mudou = await db.asUser({ userId: b.userId, orgId: b.orgId }, (tx) => tx`update zro.conexoes set estado = 'reconectar' returning id`)
    expect(mudou).toHaveLength(0)
    await expect(
      db.asUser({ userId: b.userId, orgId: b.orgId }, (tx) => tx`insert into zro.conexao_apps (conexao_id, app) values (${l!.id as string}, 'maestro')`),
    ).rejects.toThrow()
    await expect(
      db.asUser(
        { userId: b.userId, orgId: b.orgId },
        (tx) =>
          tx`insert into zro.conexoes (user_id, provedor, conta_email, conta_sub, refresh_token_enc) values (${a.userId}, 'google', 'x@y.z', 's', 'v1.x')`,
      ),
    ).rejects.toThrow()
    // Escolher agendas: só as que a conta tem.
    expect(await escolherCalendarios(db, cfg, chave, a.auth, ['primary', 'trabalho@group.calendar.google.com', 'inventada'])).toEqual([
      'primary',
      'trabalho@group.calendar.google.com',
    ])
    await expectCode(escolherCalendarios(db, cfg, chave, a.auth, ['inventada']), 'invalid_input')
  })

  it('renova o access token vencido e, com invalid_grant, pede para conectar de novo (sem tokens guardados)', async () => {
    const a = await newOrgWithOwner(db, 'cx-renova')
    await conectar(a.auth)
    const ctx = { userId: a.userId, orgId: a.orgId }
    const primeiro = await acessoGoogle(db, cfg, chave, ctx)
    // Vence: o próximo pedido renova sozinho.
    await db.sql`update zro.conexoes set access_expira_em = now() - interval '1 minute' where user_id = ${a.userId}`
    const segundo = await acessoGoogle(db, cfg, chave, ctx)
    expect(segundo.token).not.toBe(primeiro.token)
    // O Google não aceita mais o refresh: vira "reconectar" e o erro é 409 sem_conexao.
    g.estado.invalidarRefresh = true
    try {
      const e = (await expectCode(acessoGoogle(db, cfg, chave, ctx, { forcar: true }), 'sem_conexao')) as unknown as {
        status: number
        details: Record<string, unknown>
      }
      expect(e.status).toBe(409)
      expect(e.details).toMatchObject({ motivo: 'reconectar', conectar: `${ISS}/conexoes` })
    } finally {
      g.estado.invalidarRefresh = false
    }
    const [l] = await db.sql`select estado, refresh_token_enc, access_token_enc from zro.conexoes where user_id = ${a.userId}`
    expect(l).toMatchObject({ estado: 'reconectar', refresh_token_enc: null, access_token_enc: null })
    // Conectar de novo volta a ativa.
    await conectar(a.auth)
    expect((await minhasConexoes(db, a.auth)).google?.estado).toBe('ativa')
  })

  it('desconectar revoga no Google e apaga a conexão', async () => {
    const a = await newOrgWithOwner(db, 'cx-sai')
    const t = await conectar(a.auth)
    expect(await desconectarGoogle(db, cfg, chave, a.auth)).toEqual({ revogadaNoGoogle: true })
    expect(g.estado.revogados).toContain(t.refreshToken)
    expect((await minhasConexoes(db, a.auth)).google).toBeNull()
    const log = await db.sql`select action from zro.audit_logs where actor_user_id = ${a.userId} and action like 'conexao.%' order by id`
    expect(log.map((r) => r.action)).toEqual(['conexao.ligada', 'conexao.desligada'])
  })
})

describe('API da Agenda para os apps', () => {
  it('sem token de app (sessão do HUB), sem escopo ou com app fechado: recusa', async () => {
    const o = await newOrgWithOwner(db, 'api-authz')
    await expectCode(livreOcupado(db, amb, o.auth, { de: '2026-11-01T00:00:00-03:00', ate: '2026-11-02T00:00:00-03:00' }), 'action_not_allowed')
    await expectCode(livreOcupado(db, amb, null, { de: '2026-11-01T00:00:00-03:00', ate: '2026-11-02T00:00:00-03:00' }), 'action_not_allowed')
    // Token sem o escopo zro.agenda não autentica para a Agenda.
    const semEscopo = await tokenDoApp(await cliente(), o.userId, o.orgId, 'zro.ia')
    expect(await authenticateAccessToken(db, `Bearer ${semEscopo}`, 'zro.agenda')).toBeNull()
    // Gate de lançamento: o Maestro fechado para a pessoa (acesso revogado) → o token deixa de valer.
    const p = await pessoaComApp('api-gate')
    await db.sql`update zro.product_release_access set revoked_at = now() where user_id = ${p.userId} and product_id = 'maestro'`
    const de = '2026-11-01T00:00:00-03:00'
    const ate = '2026-11-02T00:00:00-03:00'
    await expect(livreOcupado(db, amb, p.app, { de, ate })).rejects.toMatchObject({ code: 'product_closed' })
  })

  it('sem conexão: 409 sem_conexao com o link; app desligado: 403; outro app no caminho: 403', async () => {
    const p = await pessoaComApp('api-sem')
    const de = '2026-11-01T00:00:00-03:00'
    const ate = '2026-11-02T00:00:00-03:00'
    const e = (await expectCode(livreOcupado(db, amb, p.app, { de, ate }), 'sem_conexao')) as unknown as { status: number; details: Record<string, unknown> }
    expect(e.status).toBe(409)
    expect(e.details).toMatchObject({ motivo: 'nenhuma', conectar: `${ISS}/conexoes` })
    expect(await estadoDaAgenda(db, amb, p.app)).toMatchObject({ conectada: false, estado: null, app_ligado: true, conectar: `${ISS}/conexoes` })
    await conectar(p.auth)
    expect(await estadoDaAgenda(db, amb, p.app)).toMatchObject({ conectada: true, conta_email: 'pessoa@gmail.test', calendarios: 1 })
    await alternarAppDaConexao(db, p.auth, 'maestro', false)
    expect((await expectCode(livreOcupado(db, amb, p.app, { de, ate }), 'app_desligado')).status).toBe(403)
    expect(await estadoDaAgenda(db, amb, p.app)).toMatchObject({ app_ligado: false })
    await alternarAppDaConexao(db, p.auth, 'maestro', true)
    await expectCode(gravarEvento(db, amb, p.app, { app: 'carro-do-freela', ref: 'x' }, { titulo: 't', dia: '2026-11-01' }), 'action_not_allowed')
    await expectCode(gravarEvento(db, amb, p.app, { app: 'maestro', ref: 'com espaço' }, { titulo: 't', dia: '2026-11-01' }), 'invalid_input')
    await expectCode(livreOcupado(db, amb, p.app, { de: '2026-11-01', ate }), 'invalid_input')
    await expectCode(livreOcupado(db, amb, p.app, { de, ate: '2027-03-01T00:00:00-03:00' }), 'invalid_input')
    // Sem a chave ou sem o Google configurado: indisponível, nunca em claro.
    await expectCode(livreOcupado(db, null, p.app, { de, ate }), 'upstream_unavailable')
  })

  it('a conexão de uma pessoa não vale para outra: cada token lê só a agenda do próprio dono', async () => {
    const a = await pessoaComApp('api-a')
    const b = await pessoaComApp('api-b')
    await conectar(a.auth)
    await expectCode(eventosDaAgenda(db, amb, b.app, { de: '2026-11-01T00:00:00-03:00', ate: '2026-11-02T00:00:00-03:00' }), 'sem_conexao')
  })

  it('grava idempotente por (app, ref), atualiza, apaga e não toca no que não é dele', async () => {
    const p = await pessoaComApp('api-grava')
    await conectar(p.auth)
    const corpo = {
      titulo: 'Diária: Campanha',
      inicio: '2026-11-03T08:00:00-03:00',
      fim: '2026-11-03T18:00:00-03:00',
      local: 'Estúdio',
      link: 'https://maestro.teste/app/agenda/1',
    }
    const r1 = await gravarEvento(db, amb, p.app, { app: 'maestro', ref: 'evento-1' }, corpo)
    expect(r1).toMatchObject({ id: idDoEvento(p.userId, 'maestro', 'evento-1'), criado: true })
    const r2 = await gravarEvento(db, amb, p.app, { app: 'maestro', ref: 'evento-1' }, { ...corpo, titulo: 'Diária: Campanha (nova hora)' })
    expect(r2).toMatchObject({ id: r1.id, criado: false })
    const doApp = g.estado.eventos.get('primary')!.filter((e) => e.extendedProperties?.private?.zro_ref === 'evento-1')
    expect(doApp).toHaveLength(1)
    expect(doApp[0]).toMatchObject({
      summary: 'Diária: Campanha (nova hora)',
      location: 'Estúdio',
      extendedProperties: { private: { zro_app: 'maestro', zro_ref: 'evento-1' } },
    })
    // Dia inteiro: fim exclusivo no Google.
    await gravarEvento(db, amb, p.app, { app: 'maestro', ref: 'card-9' }, { titulo: 'Prazo: Reels', dia: '2026-11-05', ocupa: false })
    const prazo = g.estado.eventos.get('primary')!.find((e) => e.extendedProperties?.private?.zro_ref === 'card-9')!
    expect(prazo).toMatchObject({ start: { date: '2026-11-05' }, end: { date: '2026-11-06' }, transparency: 'transparent' })
    // Evento de outro app com o mesmo id (forjado): conflito, nada muda.
    g.criarNoGoogle('primary', {
      id: idDoEvento(p.userId, 'maestro', 'evento-forjado'),
      start: { dateTime: '2026-11-04T10:00:00-03:00' },
      end: { dateTime: '2026-11-04T11:00:00-03:00' },
      summary: 'Do Carro',
      extendedProperties: { private: { zro_app: 'carro-do-freela', zro_ref: 'evento-forjado' } },
    })
    await expectCode(gravarEvento(db, amb, p.app, { app: 'maestro', ref: 'evento-forjado' }, corpo), 'conflict')
    // Apagar: idempotente.
    expect(await apagarEvento(db, amb, p.app, { app: 'maestro', ref: 'evento-1' })).toEqual({ apagado: true })
    expect(await apagarEvento(db, amb, p.app, { app: 'maestro', ref: 'evento-1' })).toEqual({ apagado: false })
    // Gravar de novo o apagado: o mesmo id volta.
    expect(await gravarEvento(db, amb, p.app, { app: 'maestro', ref: 'evento-1' }, corpo)).toMatchObject({ id: r1.id, criado: true })
    // Corpo inválido.
    await expectCode(gravarEvento(db, amb, p.app, { app: 'maestro', ref: 'x' }, { titulo: '', dia: '2026-11-05' }), 'invalid_input')
    await expectCode(
      gravarEvento(db, amb, p.app, { app: 'maestro', ref: 'x' }, { titulo: 't', inicio: '2026-11-05T10:00:00-03:00', fim: '2026-11-05T09:00:00-03:00' }),
      'invalid_input',
    )
    await expectCode(
      gravarEvento(db, amb, p.app, { app: 'maestro', ref: 'x' }, { titulo: 't', dia: '2026-11-05', link: 'http://inseguro.test' }),
      'invalid_input',
    )
    // Auditoria sem conteúdo do evento.
    const log = await db.sql`select action, metadata::text as m from zro.audit_logs where actor_user_id = ${p.userId} and action like 'agenda.%'`
    expect(log.length).toBeGreaterThanOrEqual(5)
    for (const l of log) {
      expect(l.m).not.toContain('Campanha')
      expect(l.m).not.toContain('Estúdio')
    }
    // "Usado por": o app marcou uso.
    expect((await minhasConexoes(db, p.auth)).apps.find((a) => a.app === 'maestro')?.usadoEm).toBeInstanceOf(Date)
  })

  it('livre/ocupado: junta intervalos das agendas escolhidas, ignora livre, recusado e os do próprio app', async () => {
    const p = await pessoaComApp('api-livre')
    await conectar(p.auth)
    await escolherCalendarios(db, cfg, chave, p.auth, ['primary', 'trabalho@group.calendar.google.com'])
    const pr = (id: string, ini: string, fim: string, extra: Record<string, unknown> = {}) =>
      g.criarNoGoogle('primary', { id, start: { dateTime: ini }, end: { dateTime: fim }, summary: id, ...extra })
    pr(`l1${p.userId.slice(0, 6)}`, '2026-12-01T09:00:00-03:00', '2026-12-01T10:00:00-03:00')
    pr(`l2${p.userId.slice(0, 6)}`, '2026-12-01T09:30:00-03:00', '2026-12-01T11:00:00-03:00')
    pr(`l3${p.userId.slice(0, 6)}`, '2026-12-01T13:00:00-03:00', '2026-12-01T14:00:00-03:00', { transparency: 'transparent' })
    pr(`l4${p.userId.slice(0, 6)}`, '2026-12-01T15:00:00-03:00', '2026-12-01T16:00:00-03:00', { attendees: [{ self: true, responseStatus: 'declined' }] })
    g.criarNoGoogle('trabalho@group.calendar.google.com', {
      id: `l5${p.userId.slice(0, 6)}`,
      start: { dateTime: '2026-12-01T17:00:00-03:00' },
      end: { dateTime: '2026-12-01T18:00:00-03:00' },
    })
    await gravarEvento(
      db,
      amb,
      p.app,
      { app: 'maestro', ref: 'proprio' },
      { titulo: 'Do Maestro', inicio: '2026-12-01T19:00:00-03:00', fim: '2026-12-01T20:00:00-03:00' },
    )
    const de = '2026-12-01T00:00:00-03:00'
    const ate = '2026-12-02T00:00:00-03:00'
    const r = await livreOcupado(db, amb, p.app, { de, ate })
    expect(r.ocupado).toEqual([
      { inicio: '2026-12-01T12:00:00.000Z', fim: '2026-12-01T14:00:00.000Z' },
      { inicio: '2026-12-01T20:00:00.000Z', fim: '2026-12-01T21:00:00.000Z' },
    ])
    expect(r.calendarios).toBe(2)
    const comProprios = await livreOcupado(db, amb, p.app, { de, ate, incluirProprios: true })
    expect(comProprios.ocupado).toHaveLength(3)
    const ev = await eventosDaAgenda(db, amb, p.app, { de, ate })
    const meu = ev.eventos.find((e) => e.titulo === 'Do Maestro')!
    expect(meu).toMatchObject({ app: 'maestro', ref: 'proprio', dia_inteiro: false, ocupa: true })
    expect(Object.keys(meu).sort()).toEqual(['app', 'calendario', 'dia_inteiro', 'fim', 'id', 'inicio', 'ocupa', 'ref', 'titulo'])
    expect(ev.eventos.find((e) => e.id.startsWith('l3'))?.ocupa).toBe(false)
    // Access token recusado pelo Google: renova uma vez e segue.
    g.vencerAcessos()
    expect((await livreOcupado(db, amb, p.app, { de, ate })).ocupado).toHaveLength(2)
  })

  it('limite por pessoa e app', async () => {
    const p = await pessoaComApp('api-limite')
    await conectar(p.auth)
    const k = `agenda:leitura:maestro:${p.userId}`
    await db.sql`insert into zro.rate_limit_attempts ${db.sql(Array.from({ length: LIMITE_AGENDA_LEITURA.max }, () => ({ key: k })))}`
    await expectCode(livreOcupado(db, amb, p.app, { de: '2026-11-01T00:00:00-03:00', ate: '2026-11-02T00:00:00-03:00' }), 'rate_limited')
  })
})

describe('datas', () => {
  it('meia-noite num fuso e junção de intervalos', () => {
    expect(new Date(meiaNoite('2026-11-03', 'America/Sao_Paulo')).toISOString()).toBe('2026-11-03T03:00:00.000Z')
    expect(new Date(meiaNoite('2026-07-01', 'Europe/Lisbon')).toISOString()).toBe('2026-06-30T23:00:00.000Z')
    expect(
      juntarIntervalos([
        { ini: 5, fim: 7 },
        { ini: 1, fim: 3 },
        { ini: 3, fim: 4 },
        { ini: 6, fim: 9 },
      ]),
    ).toEqual([
      { ini: 1, fim: 4 },
      { ini: 5, fim: 9 },
    ])
  })
})
