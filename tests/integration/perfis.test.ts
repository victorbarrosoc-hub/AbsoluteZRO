// Perfil profissional com @ (migração 0029, ADR 0029): regras do @ (iguais no TypeScript e no banco), cadastro com o @
// escolhido, sugestão para quem já tinha conta, troca com histórico e limite, RLS (cada um lê só a própria linha),
// busca só de perfis visíveis e sem e-mail em nenhuma resposta, convite por @ que nunca devolve o e-mail, convites para
// a pessoa, perfil escondido convidado só pelo e-mail exato, selos de verdade, preferred_username no login único,
// a API dos apps (escopo zro.pessoas, auditoria sem o texto buscado) e a exclusão da conta.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ARROBAS_RESERVADAS,
  authenticateAccessToken,
  exchangeToken,
  FAMILY_SCOPES,
  FUNCOES_PERFIL,
  grantConsent,
  issueCode,
  normalizarArroba,
  parseAuthorizeRequest,
  parseTokenRequest,
  registerClient,
  setIssuer,
  signUp,
  sugerirArroba,
  userInfo,
  validarArroba,
  validarPortfolio,
  type AuthorizeRequest,
} from '@zro/auth'
import {
  acceptInvitation,
  buscarPerfis,
  convidarPorArroba,
  definirVisibilidade,
  emailDoConvidado,
  excluirConta,
  inviteMember,
  listMembers,
  loadOidcClaims,
  meuPerfil,
  meusConvites,
  pendencias,
  perfilPorArroba,
  perfilPorArrobaParaApp,
  respondInvitation,
  salvarPerfil,
  listarComunidade,
  trocarArroba,
  avisoDoPerfilPendente,
  marcarAvisoDoPerfil,
} from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { admin, allowRelease, expectCode, newOrgWithOwner, newUser, refresh } from './helpers'

let db: Database
const ISS = 'https://hub.teste.absolutezro.local'
const rid = (p: string) => `${p}-${randomBytes(4).toString('hex')}`
const unico = () => randomBytes(3).toString('hex')

beforeAll(() => {
  db = testDatabase()
  setIssuer(ISS)
})
afterAll(async () => {
  await db.close()
})

const arrobaDe = async (userId: string) => (await db.sql`select arroba from zro.perfis where user_id = ${userId}`)[0]?.arroba as string

/** Pessoa com @ escolhido (e nome), e-mail confirmado. */
async function pessoa(nome: string, arroba?: string) {
  const u = await newUser(db, nome.toLowerCase().replace(/\W+/g, '-'))
  await db.sql`update zro.users set display_name = ${nome} where id = ${u.userId}`
  if (arroba) await trocarArroba(db, u.auth, arroba)
  return { ...u, arroba: await arrobaDe(u.userId), nome }
}

describe('regras do @ (TypeScript e banco iguais)', () => {
  it('a lista de reservados e a de funções são as mesmas do banco', () => {
    const sql = fs.readFileSync(path.resolve(import.meta.dirname, '../../infra/migrations/0029_perfil_profissional.sql'), 'utf8')
    const reservadas = sql.match(/translate\(coalesce\(p, ''\), '\._', ''\) = any \(array\[([\s\S]*?)\]::text\[\]\)/)![1]!
    expect([...reservadas.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort()).toEqual([...ARROBAS_RESERVADAS].sort())
    const funcoes = sql.match(/funcoes <@ array\[([^\]]*)\]/)![1]!
    expect([...funcoes.matchAll(/'([a-z]+)'/g)].map((m) => m[1])).toEqual(FUNCOES_PERFIL.map((f) => f.chave))
  })

  it('valida formato, tamanho, ponto, letra e reservados', () => {
    for (const ok of ['ana', 'joao.silva', 'cam_era_01', 'a'.repeat(30), 'x1y']) expect(validarArroba(ok), ok).toBeNull()
    for (const ruim of ['ab', 'a'.repeat(31), 'joão', 'ana silva', '.ana', 'ana.', 'an..a', '1234', 'admin', 'absolute.zro', 'absolute_zro', 'Maestro'])
      expect(validarArroba(ruim), ruim).not.toBeNull()
    expect(normalizarArroba('  @Fulano.De.Tal ')).toBe('fulano.de.tal')
    expect(validarPortfolio('https://vimeo.com/fulano')).toBeNull()
    for (const ruim of ['http://site.com', 'javascript:alert(1)', 'https://localhost', 'ftp://x.com']) expect(validarPortfolio(ruim), ruim).not.toBeNull()
  })

  it('a sugestão sai do nome, sem acento, e cai no e-mail ou em "pessoa"', () => {
    expect(sugerirArroba('João da Silva')).toBe('joao.da.silva')
    expect(sugerirArroba('  Ânia Côrrea! ')).toBe('ania.correa')
    expect(sugerirArroba('Jo', 'mariana.f@x.com')).toBe('mariana.f')
    expect(sugerirArroba('', '')).toBe('pessoa')
    expect(sugerirArroba('Admin')).toBe('admin.pro')
  })

  it('o banco recusa @ inválido e reservado', async () => {
    const u = await pessoa('Regras')
    for (const ruim of ['ab', 'admin', 'a..b', '_maestro_']) {
      await expect(db.asSystem('teste', (tx) => tx`update zro.perfis set arroba = ${ruim} where user_id = ${u.userId}`)).rejects.toThrow()
    }
  })
})

describe('cadastro e sugestão', () => {
  it('cadastro com o @ escolhido; ocupado (sem diferença de maiúsculas) não cria a conta', async () => {
    const a = `cad.${unico()}`
    const r = await signUp(db, { email: `cad-${unico()}@teste.absolutezro.local`, password: 'senha-de-teste-123', displayName: 'Cadastro', arroba: `@${a}` })
    const [p] = await db.sql`select arroba, arroba_sugerida from zro.perfis where user_id = ${r.userId}`
    expect(p).toMatchObject({ arroba: a, arroba_sugerida: false })
    const email = `cad2-${unico()}@teste.absolutezro.local`
    const e = await expectCode(signUp(db, { email, password: 'senha-de-teste-123', displayName: 'Outra', arroba: a.toUpperCase() }), 'conflict')
    expect((e as unknown as { message: string }).message).toContain('@')
    expect(await db.sql`select 1 from zro.users where email = ${email}`).toHaveLength(0)
    await expectCode(signUp(db, { email, password: 'senha-de-teste-123', displayName: 'Outra', arroba: 'suporte' }), 'invalid_input')
  })

  it('conta sem @ escolhido ganha a sugestão do nome (marcada como sugestão) e o aviso único fica pendente', async () => {
    const nome = `Beatriz ${unico()}`
    const u = await newUser(db, 'sug')
    await db.sql`update zro.users set display_name = ${nome} where id = ${u.userId}`
    const outra = await signUp(db, { email: `sug-${unico()}@teste.absolutezro.local`, password: 'senha-de-teste-123', displayName: nome })
    const [p] = await db.sql`select arroba, arroba_sugerida from zro.perfis where user_id = ${outra.userId}`
    expect(p!.arroba).toBe(sugerirArroba(nome))
    expect(p!.arroba_sugerida).toBe(true)
    const segunda = await signUp(db, { email: `sug2-${unico()}@teste.absolutezro.local`, password: 'senha-de-teste-123', displayName: nome })
    expect(await arrobaDe(segunda.userId)).toBe(`${sugerirArroba(nome)}2`)
    expect(await avisoDoPerfilPendente(db, u.auth)).toMatchObject({ visivel: true })
    await marcarAvisoDoPerfil(db, u.auth)
    expect(await avisoDoPerfilPendente(db, u.auth)).toBeNull()
  })
})

describe('trocar o @', () => {
  it('troca, guarda o antigo 90 dias (leva ao perfil e ninguém pega) e limita a 2 por mês', async () => {
    const u = await pessoa('Troca')
    const de = u.arroba
    // a saída da sugestão não conta
    const a1 = `tr.${unico()}`
    expect(await trocarArroba(db, u.auth, a1)).toBe(a1)
    const outro = await pessoa('Outro')
    await expectCode(trocarArroba(db, outro.auth, de), 'conflict')
    await expectCode(trocarArroba(db, outro.auth, a1.toUpperCase()), 'conflict')
    const velho = await perfilPorArroba(db, outro.auth, `@${de}`)
    expect(velho).toMatchObject({ antiga: true, perfil: { arroba: a1 } })
    const a2 = `tr.${unico()}`
    await trocarArroba(db, u.auth, a2)
    await trocarArroba(db, u.auth, `tr.${unico()}`)
    await expectCode(trocarArroba(db, u.auth, `tr.${unico()}`), 'rate_limited')
    // a própria pessoa volta para um @ antigo dela sem esperar
    await db.sql`delete from zro.perfil_arrobas_antigas where user_id = ${u.userId} and arroba <> ${a1}`
    await db.sql`update zro.perfil_arrobas_antigas set troca = false where user_id = ${u.userId}`
    expect(await trocarArroba(db, u.auth, a1)).toBe(a1)
    // passou o prazo: o @ velho não leva mais a lugar nenhum e fica livre
    await db.sql`update zro.perfil_arrobas_antigas set ate = now() - interval '1 day' where arroba = ${de}`
    expect(await perfilPorArroba(db, outro.auth, de)).toBeNull()
    expect(await trocarArroba(db, outro.auth, de)).toBe(de)
  })

  it('reservado e inválido não passam', async () => {
    const u = await pessoa('Inval')
    await expectCode(trocarArroba(db, u.auth, 'absolutezro'), 'invalid_input')
    await expectCode(trocarArroba(db, u.auth, 'a b'), 'invalid_input')
  })
})

describe('RLS: o perfil de cada um', () => {
  it('zro_app lê e muda só a própria linha, não muda o @ direto e não lê o histórico', async () => {
    const a = await pessoa('RlsA', `rls.a.${unico()}`)
    const b = await pessoa('RlsB', `rls.b.${unico()}`)
    const ctxA = { userId: a.userId, orgId: null }
    const linhas = await db.asUser(ctxA, (tx) => tx`select user_id from zro.perfis`)
    expect(linhas.map((r) => r.user_id)).toEqual([a.userId])
    const mudou = await db.asUser(ctxA, (tx) => tx`update zro.perfis set bio = 'invadi' where user_id = ${b.userId} returning 1`)
    expect(mudou).toHaveLength(0)
    await expect(db.asUser(ctxA, (tx) => tx`update zro.perfis set arroba = 'qualquer.um' where user_id = ${a.userId}`)).rejects.toThrow(/permission/)
    await expect(db.asUser(ctxA, (tx) => tx`update zro.perfis set arroba_sugerida = true where user_id = ${a.userId}`)).rejects.toThrow(/permission/)
    await expect(db.asUser(ctxA, (tx) => tx`select * from zro.perfil_arrobas_antigas`)).rejects.toThrow(/permission/)
    await expect(db.asUser(ctxA, (tx) => tx`insert into zro.perfis (user_id, arroba) values (${randomUUID()}, 'nova.conta')`)).rejects.toThrow(/permission/)
    // sem sessão, as funções de leitura não devolvem nada
    expect(await db.sql`select * from zro.buscar_perfis('rls', 10)`).toHaveLength(0)
  })
})

describe('busca e página do @', () => {
  it('só perfis visíveis, sem a própria pessoa, sem e-mail em nenhum campo; escondido só pela dona', async () => {
    const marca = unico()
    const o = await newOrgWithOwner(db, `busca-${marca}`)
    const visivel = await pessoa(`Carla Busca${marca}`, `carla.${marca}`)
    const escondida = await pessoa(`Dora Busca${marca}`, `dora.${marca}`)
    await salvarPerfil(db, visivel.auth, {
      funcoes: ['camera', 'drone'],
      funcaoOutra: 'Steadicam',
      cidade: 'Natal',
      portfolio: 'https://vimeo.com/carla',
      bio: 'Câmera e drone.',
    })
    await definirVisibilidade(db, escondida.auth, false)
    const r = await buscarPerfis(db, o.auth, `busca${marca}`)
    expect(r.map((p) => p.arroba)).toEqual([visivel.arroba])
    expect(r[0]).toMatchObject({
      id: visivel.userId,
      nome: visivel.nome,
      cidade: 'Natal',
      funcoes: [
        { chave: 'camera', nome: 'Câmera' },
        { chave: 'drone', nome: 'Drone' },
        { chave: 'outra', nome: 'Steadicam' },
      ],
    })
    const tudo = JSON.stringify(r)
    for (const e of [visivel.email, escondida.email, o.email]) expect(tudo).not.toContain(e)
    expect(Object.keys(r[0]!).sort()).toEqual(['arroba', 'bio', 'cidade', 'foto', 'funcoes', 'id', 'nome', 'portfolio', 'selos'])
    // por @ (começo), sem acento e sem a própria pessoa
    expect((await buscarPerfis(db, o.auth, `@carla.${marca.slice(0, 3)}`)).map((p) => p.arroba)).toContain(visivel.arroba)
    expect(await buscarPerfis(db, o.auth, `@dora.${marca}`)).toEqual([])
    const comVisivel = await newOrgWithOwner(db, `busca2-${marca}`)
    await db.sql`update zro.users set display_name = ${`Carla Busca${marca} Dona`} where id = ${comVisivel.userId}`
    expect((await buscarPerfis(db, comVisivel.auth, `busca${marca}`)).some((p) => p.id === comVisivel.userId)).toBe(false)
    // página do @: escondido = null para os outros, a dona vê
    expect(await perfilPorArroba(db, o.auth, `dora.${marca}`)).toBeNull()
    expect(await perfilPorArroba(db, escondida.auth, `dora.${marca}`)).toMatchObject({ minha: true, visivel: false })
    expect(JSON.stringify(await perfilPorArroba(db, o.auth, visivel.arroba))).not.toContain(visivel.email)
  })

  it('busca exige e-mail confirmado e respeita o limite', async () => {
    const o = await newOrgWithOwner(db, 'busca-lim')
    const naoConf = await newUser(db, 'naoconf', { verified: false })
    await expectCode(buscarPerfis(db, naoConf.auth, 'qualquer'), 'email_not_verified')
    expect(await buscarPerfis(db, o.auth, 'a')).toEqual([])
    await db.sql`insert into zro.rate_limit_attempts (key) select ${`busca-perfis:${o.userId}`} from generate_series(1, 60)`
    await expectCode(buscarPerfis(db, o.auth, 'qualquer'), 'rate_limited')
  })

  it('selo aparece só se a pessoa ligou E usa o app', async () => {
    const o = await newOrgWithOwner(db, 'selos')
    const p = await pessoa('Selo', `selo.${unico()}`)
    await salvarPerfil(db, p.auth, { funcoes: [], selos: ['carro-do-freela', 'sobedesce'] })
    expect((await perfilPorArroba(db, o.auth, p.arroba))!.perfil.selos).toEqual([])
    const by = await admin(db)
    const c = await db.asSystem('teste', (tx) =>
      registerClient(tx, {
        id: rid('carro'),
        name: 'Carro',
        productId: 'carro-do-freela',
        kind: 'confidential',
        redirectUris: ['https://app.teste/cb'],
        allowLoopback: false,
        createdBy: by,
      }),
    )
    await db.sql`insert into zro.app_accounts (user_id, client_id, product_id) values (${p.userId}, ${c.clientId}, 'carro-do-freela')`
    expect((await perfilPorArroba(db, o.auth, p.arroba))!.perfil.selos).toEqual([{ produto: 'carro-do-freela', texto: 'Freela no Carro do Freela' }])
    const meu = await meuPerfil(db, p.auth)
    expect(meu.apps.map((a) => a.produto)).toEqual(['carro-do-freela'])
    expect(meu.selosLigados).toEqual(['carro-do-freela', 'sobedesce'])
  })

  it('perfil sem telefone nem e-mail e com campos limitados', async () => {
    const p = await pessoa('Campos')
    await expectCode(salvarPerfil(db, p.auth, { funcoes: [], bio: 'me chama no 84 99999-1234' }), 'invalid_input')
    await expectCode(salvarPerfil(db, p.auth, { funcoes: [], bio: 'fulano@mail.com' }), 'invalid_input')
    await expectCode(salvarPerfil(db, p.auth, { funcoes: ['astronauta'] }), 'invalid_input')
    await expectCode(salvarPerfil(db, p.auth, { funcoes: [], portfolio: 'http://inseguro.com' }), 'invalid_input')
    await expectCode(salvarPerfil(db, p.auth, { funcoes: [], bio: 'x'.repeat(281) }), 'invalid_input')
  })
})

describe('convite por @', () => {
  it('admin convida pelo @ sem ver o e-mail; a pessoa aceita na central; escondido só pelo e-mail exato', async () => {
    const o = await newOrgWithOwner(db, 'conv-arroba')
    const alvo = await pessoa('Alvo', `alvo.${unico()}`)
    const r = await convidarPorArroba(db, o.auth, { arroba: `@${alvo.arroba}`, role: 'editor' })
    expect(JSON.stringify(r)).not.toContain(alvo.email)
    expect(r).toMatchObject({ arroba: alvo.arroba, convidado: alvo.userId })
    expect(await emailDoConvidado(db, r.invitationId)).toBe(alvo.email)
    const { invitations } = await listMembers(db, o.auth)
    expect(invitations.find((i) => i.id === r.invitationId)).toMatchObject({ email: `@${alvo.arroba}`, por_arroba: true })
    expect(JSON.stringify(invitations)).not.toContain(alvo.email)
    await expectCode(convidarPorArroba(db, o.auth, { arroba: alvo.arroba, role: 'viewer' }), 'conflict')
    // a pessoa vê e aceita
    const meus = await meusConvites(db, alvo.auth)
    expect(meus).toEqual([expect.objectContaining({ id: r.invitationId, organizacao: 'Produtora conv-arroba', papel: 'editor' })])
    expect((await pendencias(db, alvo.auth))['/equipe']).toBe(1)
    const outro = await pessoa('Intruso')
    await expectCode(respondInvitation(db, outro.auth, r.invitationId, 'aceitar'), 'not_found')
    await respondInvitation(db, alvo.auth, r.invitationId, 'aceitar')
    const [m] = await db.sql`select role from zro.memberships where org_id = ${o.orgId} and user_id = ${alvo.userId} and status = 'active'`
    expect(m!.role).toBe('editor')
    await expectCode(convidarPorArroba(db, o.auth, { arroba: alvo.arroba, role: 'viewer' }), 'conflict')
    // escondido: o @ não acha (igual a não existir); o convite pelo e-mail exato funciona
    const esc = await pessoa('Escondida', `esc.${unico()}`)
    await definirVisibilidade(db, esc.auth, false)
    await expectCode(convidarPorArroba(db, o.auth, { arroba: esc.arroba, role: 'editor' }), 'not_found')
    await expectCode(convidarPorArroba(db, o.auth, { arroba: `nao.existe.${unico()}`, role: 'editor' }), 'not_found')
    const porEmail = await inviteMember(db, o.auth, { email: esc.email, role: 'viewer' })
    await acceptInvitation(db, await refresh(db, esc.token), porEmail.token)
    expect(await db.sql`select 1 from zro.memberships where org_id = ${o.orgId} and user_id = ${esc.userId} and status = 'active'`).toHaveLength(1)
  })

  it('recusar fecha o convite; só dono e administração convidam; administrador só pelo dono', async () => {
    const o = await newOrgWithOwner(db, 'conv-rec')
    const alvo = await pessoa('Recusa', `rec.${unico()}`)
    const r = await convidarPorArroba(db, o.auth, { arroba: alvo.arroba, role: 'viewer' })
    await respondInvitation(db, alvo.auth, r.invitationId, 'recusar')
    expect(await meusConvites(db, alvo.auth)).toEqual([])
    const [i] = await db.sql`select revoked_at from zro.invitations where id = ${r.invitationId}`
    expect(i!.revoked_at).not.toBeNull()
    // editor não convida; admin não convida admin
    const ed = await pessoa('Editor', `ed.${unico()}`)
    const ad = await pessoa('Admin da org', `adm.org.${unico()}`)
    for (const [p, role] of [
      [ed, 'editor'],
      [ad, 'admin'],
    ] as const) {
      const c = await convidarPorArroba(db, o.auth, { arroba: p.arroba, role })
      await respondInvitation(db, p.auth, c.invitationId, 'aceitar')
    }
    const edAuth = await refresh(db, ed.token)
    await expectCode(convidarPorArroba(db, edAuth, { arroba: alvo.arroba, role: 'viewer' }), 'forbidden_role')
    const adAuth = await refresh(db, ad.token)
    await expectCode(convidarPorArroba(db, adAuth, { arroba: alvo.arroba, role: 'admin' }), 'forbidden_role')
    // direto no banco, o papel também é conferido
    await expect(
      db.asUser(
        { userId: ed.userId, orgId: o.orgId },
        (tx) => tx`select * from zro.convidar_por_arroba(${alvo.arroba}, 'viewer', ${'h' + unico()}, now() + interval '1 day')`,
      ),
    ).rejects.toThrow(/sem_papel/)
  })
})

describe('login único e API dos apps', () => {
  async function cliente() {
    const by = await admin(db)
    return db.asSystem('teste', (tx) =>
      registerClient(tx, {
        id: rid('app'),
        name: 'App',
        productId: 'maestro',
        kind: 'confidential',
        redirectUris: ['https://app.teste/cb'],
        allowLoopback: false,
        createdBy: by,
      }),
    )
  }
  async function tokens(c: { clientId: string; clientSecret: string | null }, userId: string, orgId: string, escopos: string) {
    await allowRelease(db, 'maestro', userId)
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
    return exchangeToken(
      db,
      parseTokenRequest(
        new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'https://app.teste/cb', code_verifier: verifier }),
        `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`,
      ),
      loadOidcClaims,
    )
  }

  it('zro.pessoas é escopo de família e o @ sai como preferred_username', async () => {
    expect(FAMILY_SCOPES).toContain('zro.pessoas')
    const o = await newOrgWithOwner(db, 'oidc-arroba')
    const a = `oidc.${unico()}`
    await trocarArroba(db, o.auth, a)
    const t = await tokens(await cliente(), o.userId, o.orgId, 'profile zro.pessoas')
    expect(await userInfo(db, `Bearer ${t.access_token}`, loadOidcClaims)).toMatchObject({ preferred_username: a })
    const [, corpo] = t.id_token.split('.')
    expect(JSON.parse(Buffer.from(corpo!, 'base64url').toString('utf8'))).toMatchObject({ preferred_username: a })
  })

  it('a API busca com o token do app (escopo certo), audita sem o texto e não acha escondido nem pelo @', async () => {
    const o = await newOrgWithOwner(db, 'api-pessoas')
    const c = await cliente()
    const t = await tokens(c, o.userId, o.orgId, 'zro.pessoas')
    expect(await authenticateAccessToken(db, `Bearer ${t.access_token}`, 'zro.agenda')).toBeNull()
    const app = (await authenticateAccessToken(db, `Bearer ${t.access_token}`, 'zro.pessoas'))!
    expect(app.session.app?.productId).toBe('maestro')
    const marca = unico()
    const alvo = await pessoa(`Elisa Api${marca}`, `elisa.${marca}`)
    const esc = await pessoa(`Fabio Api${marca}`, `fabio.${marca}`)
    await definirVisibilidade(db, esc.auth, false)
    const r = await buscarPerfis(db, app, `api${marca}`)
    expect(r.map((p) => p.arroba)).toEqual([alvo.arroba])
    const [log] = await db.sql`select metadata from zro.audit_logs where actor_user_id = ${o.userId} and action = 'perfil.busca' order by id desc limit 1`
    expect(log!.metadata).toEqual({ app: c.clientId, resultados: 1 })
    expect(JSON.stringify(log)).not.toContain(marca)
    expect(await perfilPorArrobaParaApp(db, app, `@${alvo.arroba}`)).toMatchObject({ perfil: { arroba: alvo.arroba } })
    expect(await perfilPorArrobaParaApp(db, app, esc.arroba)).toBeNull()
    // o app convida pelo @ em nome de quem administra
    const conv = await convidarPorArroba(db, app, { arroba: alvo.arroba, role: 'editor' })
    expect(conv.arroba).toBe(alvo.arroba)
  })
})

describe('excluir a conta', () => {
  it('o perfil sai da busca e o @ fica guardado 90 dias', async () => {
    const o = await newOrgWithOwner(db, 'excl-perfil')
    const marca = unico()
    const p = await pessoa(`Gil Excl${marca}`, `gil.${marca}`)
    await excluirConta(db, p.auth, 'senha-de-teste-123')
    expect(await buscarPerfis(db, o.auth, `excl${marca}`)).toEqual([])
    expect(await perfilPorArroba(db, o.auth, p.arroba)).toBeNull()
    const outro = await pessoa('Imitador')
    await expectCode(trocarArroba(db, outro.auth, p.arroba), 'conflict')
  })
})

describe('a comunidade (0037)', () => {
  it('lista só visíveis com o @ confirmado, sem e-mail, por ordem de @, com cursor e filtro de função', async () => {
    const marca = unico()
    const quem = await newOrgWithOwner(db, `comunidade-${marca}`)
    const conf = await pessoa(`Gabi Com${marca}`, `zz${marca}.gabi`)
    const outra = await pessoa(`Hugo Com${marca}`, `zz${marca}.hugo`)
    await salvarPerfil(db, outra.auth, { funcoes: ['camera'], cidade: 'Natal', bio: null, portfolio: null, funcaoOutra: null })
    const escondida = await pessoa(`Iara Com${marca}`, `zz${marca}.iara`)
    await definirVisibilidade(db, escondida.auth, false)
    // conta sem @ escolhido: fica com a sugestão automática e não entra
    const sugerida = await pessoa(`Joao Com${marca}`)
    expect((await db.sql`select arroba_sugerida from zro.perfis where user_id = ${sugerida.userId}`)[0]!.arroba_sugerida).toBe(true)
    const prefixo = `zz${marca}`
    const todas: string[] = []
    let depois: string | null = null
    for (let i = 0; i < 50; i++) {
      const r = await listarComunidade(db, quem.auth, { depois, limite: 200 })
      todas.push(...r.pessoas.map((p) => p.arroba))
      expect(JSON.stringify(r)).not.toMatch(/@(example|teste)\.|email/i)
      if (!r.proximo) break
      depois = r.proximo
    }
    const minhas = todas.filter((a) => a.startsWith(prefixo))
    expect(minhas).toEqual([conf.arroba, outra.arroba].sort())
    expect([...todas].sort()).toEqual(todas)
    expect(todas).not.toContain(sugerida.arroba)
    // cursor de verdade: uma por página
    const p1 = await listarComunidade(db, quem.auth, { depois: `${prefixo}.`, limite: 1 })
    expect(p1.pessoas.map((p) => p.arroba)).toEqual([conf.arroba])
    expect(p1.proximo).toBe(conf.arroba)
    const p2 = await listarComunidade(db, quem.auth, { depois: p1.proximo, limite: 1 })
    expect(p2.pessoas[0]!.arroba).toBe(outra.arroba)
    // filtro por função
    const cam = await listarComunidade(db, quem.auth, { funcao: 'camera', depois: `${prefixo}.`, limite: 200 })
    expect(cam.pessoas.filter((p) => p.arroba.startsWith(prefixo)).map((p) => p.arroba)).toEqual([outra.arroba])
    await expectCode(listarComunidade(db, quem.auth, { funcao: 'astronauta' }), 'invalid_input')
  })
})
