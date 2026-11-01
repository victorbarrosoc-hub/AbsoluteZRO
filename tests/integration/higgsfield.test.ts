// Higgsfield nas Conexões (migration 0052): a conta conectada uma vez no HUB e usada pelos apps da família (AEON, Rift
// Motion) pelo HUB. Contra uma Higgsfield falsa (tests/fixtures/higgsfield-falsa.ts): registro dinâmico, ida e volta com
// PKCE, tokens cifrados e renovação (invalid_grant vira "reconectar"), o painel de créditos (saldo, uso do mês, preço das
// telas e das três opções), telas antes de animar, animar, andamento, sem saldo que cubra, app desligado, sem conexão,
// gate de lançamento e o isolamento por pessoa (RLS) de zro.ia_geracoes e zro.apps_oauth_externos.
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
  abrirPendenteHiggsfield,
  alternarAppHiggsfield,
  andamentoHiggsfield,
  animarHiggsfield,
  chaveDasConexoes,
  clienteHiggsfield,
  concluirConexaoHiggsfield,
  desconectarHiggsfield,
  envioHiggsfield,
  ESCOPO_HIGGSFIELD,
  higgsfieldUrls,
  inicioConexaoHiggsfield,
  inicioDoMes,
  loadOidcClaims,
  minhaHiggsfield,
  painelHiggsfield,
  saldoHiggsfield,
  selarPendenteHiggsfield,
  telasHiggsfield,
  type AmbienteHiggsfield,
  type HiggsfieldConfig,
} from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { iniciarHiggsfieldFalsa, type HiggsfieldFalsa } from '../fixtures/higgsfield-falsa'
import { admin, allowRelease, expectCode, newOrgWithOwner } from './helpers'

let db: Database
let hf: HiggsfieldFalsa
let cfg: HiggsfieldConfig
let amb: AmbienteHiggsfield
const ISS = 'https://hub.teste.absolutezro.local'
const chave = chaveDasConexoes({ ZRO_CONEXOES_KEY: randomBytes(32).toString('base64') })!
const rid = (p: string) => `${p}-${randomBytes(4).toString('hex')}`

beforeAll(async () => {
  db = testDatabase()
  setIssuer(ISS)
  hf = await iniciarHiggsfieldFalsa()
  // um endereço de volta por rodada: o registro dinâmico é por endereço
  cfg = { redirectUri: `${ISS}/conexoes/higgsfield/retorno?r=${randomBytes(3).toString('hex')}`, conexoesUrl: `${ISS}/conexoes`, ...higgsfieldUrls(hf.url) }
  amb = { cfg, chave }
})
afterAll(async () => {
  await hf.fechar()
  await db.close()
})

/** A ida e volta como o navegador faria, e a conexão guardada. */
async function conectar(auth: Authenticated) {
  const clientId = await clienteHiggsfield(db, cfg)
  const { url, pendente } = inicioConexaoHiggsfield(cfg, clientId, auth.user.id)
  const volta = new URL((await fetch(url, { redirect: 'manual' })).headers.get('location')!)
  await concluirConexaoHiggsfield(db, amb, auth, pendente, {
    code: volta.searchParams.get('code'),
    state: volta.searchParams.get('state'),
    error: volta.searchParams.get('error'),
  })
}

async function cliente(productId: string) {
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

/** Token de app da pessoa (o login único de verdade, sem o navegador). */
async function tokenDoApp(productId: string, userId: string, orgId: string, escopos = ESCOPO_HIGGSFIELD) {
  const c = await cliente(productId)
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

async function pessoaComApp(label: string, productId = 'ai-edit') {
  const o = await newOrgWithOwner(db, label)
  const at = await tokenDoApp(productId, o.userId, o.orgId)
  const app = (await authenticateAccessToken(db, `Bearer ${at}`, ESCOPO_HIGGSFIELD))!
  return { ...o, app }
}

const jobsDe = async (id: string) => {
  const [g] = await db.sql`select pedido from zro.ia_geracoes where id = ${id}`
  return String(g!.pedido).split(',')
}

describe('ida e volta', () => {
  it('registra o HUB uma vez por endereço, pede PKCE S256 e o recurso do MCP; o cookie é cifrado e preso à pessoa', async () => {
    const antes = hf.estado.registros.length
    const id1 = await clienteHiggsfield(db, cfg)
    const id2 = await clienteHiggsfield(db, cfg)
    expect(id1).toBe(id2)
    expect(hf.estado.registros.length).toBe(antes + 1)
    expect(hf.estado.registros.at(-1)!.redirect_uris).toEqual([cfg.redirectUri])
    // o registro é só do sistema: o papel do app não lê nem grava
    const o = await newOrgWithOwner(db, 'hf-reg')
    await expect(db.asUser({ userId: o.userId, orgId: o.orgId }, (tx) => tx`select * from zro.apps_oauth_externos`)).rejects.toThrow()

    const { url, pendente } = inicioConexaoHiggsfield(cfg, id1, 'pessoa-1', 1_000)
    const q = new URL(url).searchParams
    expect(q.get('code_challenge_method')).toBe('S256')
    expect(q.get('code_challenge')).toBe(createHash('sha256').update(pendente.verifier).digest('base64url'))
    expect(q.get('resource')).toBe(cfg.mcp)
    expect(q.get('scope')).toContain('offline_access')
    const cookie = selarPendenteHiggsfield(chave, pendente)
    expect(cookie).not.toContain(pendente.verifier)
    expect(abrirPendenteHiggsfield(chave, cookie, 2_000)).toEqual(pendente)
    expect(abrirPendenteHiggsfield(chave, cookie, pendente.exp + 1)).toBeNull()
  })

  it('cancelar, state trocado e outra pessoa viram motivos claros; conectado, guarda só cifrado e cada um vê o seu', async () => {
    const a = await newOrgWithOwner(db, 'hf-a')
    const b = await newOrgWithOwner(db, 'hf-b')
    const clientId = await clienteHiggsfield(db, cfg)
    const motivo = (p: Promise<unknown>) =>
      p.then(
        () => null,
        (e: { details?: { motivo?: string } }) => e.details?.motivo,
      )
    const i = inicioConexaoHiggsfield(cfg, clientId, a.userId)
    expect(await motivo(concluirConexaoHiggsfield(db, amb, a.auth, i.pendente, { code: null, state: i.pendente.state, error: 'access_denied' }))).toBe(
      'cancelado',
    )
    expect(await motivo(concluirConexaoHiggsfield(db, amb, a.auth, i.pendente, { code: 'x', state: 'outro', error: null }))).toBe('expirou')
    expect(await motivo(concluirConexaoHiggsfield(db, amb, b.auth, i.pendente, { code: 'x', state: i.pendente.state, error: null }))).toBe('expirou')
    // código de outro pedido (PKCE não bate): a Higgsfield recusa
    const volta = new URL((await fetch(i.url, { redirect: 'manual' })).headers.get('location')!)
    expect(
      await motivo(
        concluirConexaoHiggsfield(
          db,
          amb,
          a.auth,
          { ...i.pendente, verifier: 'outro' },
          { code: volta.searchParams.get('code'), state: i.pendente.state, error: null },
        ),
      ),
    ).toBe('higgsfield')

    await conectar(a.auth)
    const [l] = await db.sql`select * from zro.conexoes where user_id = ${a.userId} and provedor = 'higgsfield'`
    expect(l).toMatchObject({ estado: 'ativa', conta_email: 'pessoa@higgsfield.test', cliente: clientId })
    expect(l!.refresh_token_enc).toMatch(/^v1\./)
    expect(String(l!.refresh_token_enc)).not.toContain('hf-rt-')
    expect(String(l!.access_token_enc)).not.toContain('hf-at-')
    const vistas = await db.asUser({ userId: b.userId, orgId: b.orgId }, (tx) => tx`select id from zro.conexoes where provedor = 'higgsfield'`)
    expect(vistas).toHaveLength(0)
    expect((await minhaHiggsfield(db, b.auth)).conexao).toBeNull()
  })
})

describe('o cartão em /conexoes', () => {
  it('só aparece quando um app que usa a Higgsfield existe para a pessoa (gate de lançamento)', async () => {
    const o = await newOrgWithOwner(db, 'hf-gate')
    expect((await minhaHiggsfield(db, o.auth)).visivel).toBe(false)
    await allowRelease(db, 'ai-edit', o.userId)
    const m = await minhaHiggsfield(db, o.auth)
    expect(m.visivel).toBe(true)
    expect(m.conexao).toBeNull()
  })

  it('saldo e plano da conta; desligar um app; desconectar apaga a conexão', async () => {
    const p = await pessoaComApp('hf-cartao')
    await conectar(p.auth)
    expect(await saldoHiggsfield(db, amb, p.auth)).toEqual({ creditos: hf.estado.creditos, plano: 'creator' })
    await alternarAppHiggsfield(db, p.auth, 'ai-edit', false)
    const m = await minhaHiggsfield(db, p.auth)
    expect(m.apps.find((x) => x.app === 'ai-edit')).toMatchObject({ ativo: false })
    await expectCode(painelHiggsfield(db, amb, p.app), 'app_desligado')
    await alternarAppHiggsfield(db, p.auth, 'ai-edit', true)
    await desconectarHiggsfield(db, p.auth)
    expect((await minhaHiggsfield(db, p.auth)).conexao).toBeNull()
    const e = await expectCode(painelHiggsfield(db, amb, p.app), 'sem_conexao')
    expect((e as unknown as { details: { motivo: string; conectar: string } }).details).toMatchObject({ motivo: 'nenhuma', conectar: cfg.conexoesUrl })
  })
})

describe('a API dos apps', () => {
  it('o painel traz saldo, uso do mês e o preço de cada coisa, sem gerar nada', async () => {
    hf.estado.creditos = 120
    const p = await pessoaComApp('hf-painel')
    await conectar(p.auth)
    const geradas = hf.estado.geracoes.length
    const painel = await painelHiggsfield(db, amb, p.app)
    expect(painel).toMatchObject({ conectada: true, conta: 'pessoa@higgsfield.test', plano: 'creator', saldo: 120 })
    expect(painel.imagens).toEqual([
      { quantidade: 1, creditos: 1.5 },
      { quantidade: 2, creditos: 3 },
      { quantidade: 4, creditos: 6 },
    ])
    expect(painel.opcoes.map((o) => [o.id, o.segundos, o.creditos])).toEqual([
      ['rapido', 5, 4],
      ['equilibrado', 5, 10],
      ['maximo', 5, 22],
    ])
    expect((await painelHiggsfield(db, amb, p.app, { duracao: 'longo' })).opcoes.map((o) => o.creditos)).toEqual([8, 20, 44])
    expect(hf.estado.geracoes.length).toBe(geradas)
  })

  it('telas antes de animar: confere o preço, guarda o pedido e o andamento até o resultado', async () => {
    hf.estado.creditos = 120
    const p = await pessoaComApp('hf-telas')
    await conectar(p.auth)
    const env = await envioHiggsfield(db, amb, p.app, 'image/jpeg')
    expect(env.upload_url).toMatch(/^https:\/\//)
    expect(env.headers['Content-Type']).toBe('image/jpeg')
    await expectCode(envioHiggsfield(db, amb, p.app, 'text/html'), 'invalid_input')

    const r = await telasHiggsfield(db, amb, p.app, { prompt: 'Rua de neon à noite, chuva fina', quantidade: 2, proporcao: '9:16', ref: env.ref })
    expect(r).toMatchObject({ estado: 'na_fila', creditos: 3 })
    expect(hf.estado.confirmados).toContain(env.ref)
    expect(hf.estado.geracoes.at(-1)!.params).toMatchObject({
      model: 'gpt_image_2_5',
      count: 2,
      aspect_ratio: '9:16',
      medias: [{ role: 'image_references', value: env.ref }],
    })
    expect(hf.estado.creditos).toBe(117)

    expect((await andamentoHiggsfield(db, amb, p.app, r.id)).estado).toBe('na_fila')
    const jobs = await jobsDe(r.id)
    expect(jobs).toHaveLength(2)
    hf.terminar(jobs)
    const pronto = await andamentoHiggsfield(db, amb, p.app, r.id)
    expect(pronto).toMatchObject({ estado: 'pronto', saida: 'imagem' })
    expect(pronto.urls).toHaveLength(2)
    expect(pronto.urls[0]).toMatch(/^https:\/\/cdn\.higgsfield\.test\/.+\.png$/)
    // terminado fica guardado: não pergunta de novo à Higgsfield
    const chamadas = hf.estado.chamadas.length
    expect(await andamentoHiggsfield(db, amb, p.app, r.id)).toEqual(pronto)
    expect(hf.estado.chamadas.length).toBe(chamadas)

    // o uso aparece no painel deste app
    const painel = await painelHiggsfield(db, amb, p.app)
    expect(painel.usoApp).toEqual({ mes: 3, pedidos: 1, total: 3 })
    expect(painel.usoMes).toBeGreaterThanOrEqual(3)
  })

  it('animar pede uma das três opções e a imagem; sem saldo que cubra, não gera', async () => {
    hf.estado.creditos = 30
    const p = await pessoaComApp('hf-animar')
    await conectar(p.auth)
    const env = await envioHiggsfield(db, amb, p.app, 'image/png')
    await expectCode(animarHiggsfield(db, amb, p.app, { opcao: 'outra', prompt: 'x', ref: env.ref }), 'invalid_input')
    await expectCode(animarHiggsfield(db, amb, p.app, { opcao: 'rapido', prompt: 'x' }), 'invalid_input')
    await expectCode(animarHiggsfield(db, amb, p.app, { opcao: 'rapido', prompt: 'x', ref: 'nao-e-uuid' }), 'invalid_input')
    const geradas = hf.estado.geracoes.length
    const e = await expectCode(
      animarHiggsfield(db, amb, p.app, { opcao: 'maximo', duracao: 'longo', prompt: 'Câmera sobe devagar', ref: env.ref }),
      'quota_exceeded',
    )
    expect((e as unknown as { message: string }).message).toBe('Faltam créditos: custa 44 e você tem 30.')
    expect(hf.estado.geracoes.length).toBe(geradas)

    // sem preço informado (a Higgsfield não mandou), não gera: nunca vira "0 crédito"
    const preco = hf.estado.precos.equilibrado
    delete hf.estado.precos.equilibrado
    try {
      await expectCode(animarHiggsfield(db, amb, p.app, { opcao: 'equilibrado', prompt: 'Câmera sobe devagar', ref: env.ref }), 'upstream_unavailable')
      expect((await painelHiggsfield(db, amb, p.app)).opcoes.find((o) => o.id === 'equilibrado')!.creditos).toBeNull()
    } finally {
      hf.estado.precos.equilibrado = preco!
    }
    expect(hf.estado.geracoes.length).toBe(geradas)

    const r = await animarHiggsfield(db, amb, p.app, { opcao: 'equilibrado', duracao: 'curto', prompt: 'Câmera sobe devagar', ref: env.ref })
    expect(r).toMatchObject({ estado: 'na_fila', creditos: 10 })
    expect(hf.estado.geracoes.at(-1)!.params).toMatchObject({ model: 'kling2_6', duration: 5, sound: false, medias: [{ role: 'start_image', value: env.ref }] })
    const [job] = await jobsDe(r.id)
    hf.estado.jobs.get(job!)!.status = 'in_progress'
    expect((await andamentoHiggsfield(db, amb, p.app, r.id)).estado).toBe('gerando')
    hf.terminar([job!])
    const pronto = await andamentoHiggsfield(db, amb, p.app, r.id)
    expect(pronto).toMatchObject({ estado: 'pronto', saida: 'video' })
    expect(pronto.urls[0]).toMatch(/\.mp4$/)

    // recusado pela Higgsfield: estado e motivo, sem resultado
    const r2 = await animarHiggsfield(db, amb, p.app, { opcao: 'rapido', prompt: 'outra cena', ref: env.ref })
    hf.terminar(await jobsDe(r2.id), 'nsfw')
    expect(await andamentoHiggsfield(db, amb, p.app, r2.id)).toMatchObject({ estado: 'recusado', urls: [], erro: 'Conteúdo recusado.' })
  })

  it('o token vencido renova; a Higgsfield recusando o refresh vira "reconectar"', async () => {
    const p = await pessoaComApp('hf-renova')
    await conectar(p.auth)
    // o access guardado "venceu"
    await db.sql`update zro.conexoes set access_expira_em = now() - interval '1 minute' where user_id = ${p.userId} and provedor = 'higgsfield'`
    expect((await painelHiggsfield(db, amb, p.app)).saldo).not.toBeNull()
    hf.estado.recusarTokens = true
    hf.estado.invalidarRefresh = true
    try {
      const e = await expectCode(painelHiggsfield(db, amb, p.app), 'sem_conexao')
      expect((e as unknown as { details: { motivo: string } }).details.motivo).toBe('reconectar')
    } finally {
      hf.estado.recusarTokens = false
      hf.estado.invalidarRefresh = false
    }
    const [l] = await db.sql`select estado, refresh_token_enc from zro.conexoes where user_id = ${p.userId} and provedor = 'higgsfield'`
    expect(l).toMatchObject({ estado: 'reconectar', refresh_token_enc: null })
    expect((await minhaHiggsfield(db, p.auth)).conexao?.estado).toBe('reconectar')
  })

  it('só os apps que usam a Higgsfield, com o escopo; a sessão do HUB e outro app da família não gastam', async () => {
    const p = await pessoaComApp('hf-escopo')
    await conectar(p.auth)
    // token sem o escopo não autentica para a Higgsfield
    const sem = await tokenDoApp('ai-edit', p.userId, p.orgId, 'zro.ia')
    expect(await authenticateAccessToken(db, `Bearer ${sem}`, ESCOPO_HIGGSFIELD)).toBeNull()
    // a sessão do navegador no HUB (sem app) não usa a API
    await expectCode(painelHiggsfield(db, amb, p.auth), 'action_not_allowed')
    // o Maestro tem o escopo (todo cliente da família tem), mas não está entre os apps que geram
    const atMaestro = await tokenDoApp('maestro', p.userId, p.orgId)
    const maestro = (await authenticateAccessToken(db, `Bearer ${atMaestro}`, ESCOPO_HIGGSFIELD))!
    expect(maestro).not.toBeNull()
    await expectCode(painelHiggsfield(db, amb, maestro), 'action_not_allowed')
    await expectCode(telasHiggsfield(db, amb, maestro, { prompt: 'x', quantidade: 1 }), 'action_not_allowed')
    await expectCode(andamentoHiggsfield(db, amb, p.app, 'curto'), 'invalid_input')
    await expectCode(andamentoHiggsfield(db, amb, p.app, 'abcdefabcdef'), 'not_found')
  })

  it('zro.ia_geracoes é da pessoa: outra não lê, não muda e não grava em nome dela (RLS)', async () => {
    const a = await pessoaComApp('hf-rls-a')
    const b = await newOrgWithOwner(db, 'hf-rls-b')
    await conectar(a.auth)
    const env = await envioHiggsfield(db, amb, a.app, 'image/png')
    const r = await telasHiggsfield(db, amb, a.app, { prompt: 'Só da pessoa A', quantidade: 1, ref: env.ref })
    const ctxB = { userId: b.userId, orgId: b.orgId }
    expect(await db.asUser(ctxB, (tx) => tx`select id from zro.ia_geracoes where id = ${r.id}`)).toHaveLength(0)
    expect(await db.asUser(ctxB, (tx) => tx`update zro.ia_geracoes set estado = 'cancelado' where id = ${r.id} returning id`)).toHaveLength(0)
    await expect(
      db.asUser(
        ctxB,
        (tx) =>
          tx`insert into zro.ia_geracoes (id, user_id, app, saida, modelo, prompt, pedido, estado) values ('abcdefabcdef', ${a.userId}, 'ai-edit', 'imagem', 'm', 'p', 'x', 'na_fila')`,
      ),
    ).rejects.toThrow()
    // apagar não é permitido nem para a dona (o histórico de gasto fica)
    await expect(db.asUser({ userId: a.userId, orgId: a.orgId }, (tx) => tx`delete from zro.ia_geracoes where id = ${r.id}`)).rejects.toThrow()
    expect(await db.asUser({ userId: a.userId, orgId: a.orgId }, (tx) => tx`select id from zro.ia_geracoes where id = ${r.id}`)).toHaveLength(1)
  })

  it('o mês começa no fuso de Fortaleza', () => {
    expect(inicioDoMes(new Date('2026-11-01T02:59:00Z')).toISOString()).toBe('2026-10-01T03:00:00.000Z')
    expect(inicioDoMes(new Date('2026-11-01T03:00:00Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z')
  })
})
