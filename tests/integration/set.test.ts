// Set (migração 0035, ADR 0032): presença da equipe e dos contatos (com o app), invisível e "quem vê", contatos por
// pedido aceito, conversa direta só com quem trabalha junto ou é contato, conversa do projeto pelo acesso ao projeto,
// bloqueio nos dois sentidos, silêncio, não lidas, editar e apagar com versão para a moderação, denúncia, limites, a
// API dos apps (escopo zro.set, app vindo do token), RLS das tabelas e a exclusão da conta.
import { createHash, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  authenticateAccessToken,
  exchangeToken,
  FAMILY_SCOPES,
  grantConsent,
  issueCode,
  parseAuthorizeRequest,
  parseTokenRequest,
  registerClient,
  setIssuer,
  type AuthorizeRequest,
} from '@zro/auth'
import {
  abrirConversaSet,
  apagarMensagemSet,
  atualizarConversaSet,
  bloquearSet,
  createProject,
  definirVisibilidade,
  denunciarSet,
  denunciasSet,
  desbloquearSet,
  editarMensagemSet,
  enviarMensagemSet,
  estadoSet,
  excluirConta,
  LIMITE_MENSAGENS,
  lerConversaSet,
  limparTexto,
  loadOidcClaims,
  meusContatosSet,
  minhasConversasSet,
  pedirContatoSet,
  removerContatoSet,
  resolverDenunciaSet,
  responderContatoSet,
  salvarPreferenciasSet,
  trocarArroba,
} from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { admin, allowRelease, expectCode, newOrgWithOwner, newUser, refresh } from './helpers'

let db: Database
const ISS = 'https://hub.teste.absolutezro.local'
const unico = () => randomBytes(3).toString('hex')

beforeAll(() => {
  db = testDatabase()
  setIssuer(ISS)
})
afterAll(async () => {
  await db.close()
})

type Pessoa = Awaited<ReturnType<typeof newOrgWithOwner>> & { arroba: string; nome: string }

/** Pessoa com organização própria, nome e @. */
async function pessoa(nome: string): Promise<Pessoa> {
  const o = await newOrgWithOwner(db, nome.toLowerCase())
  const arroba = `${nome.toLowerCase()}.${unico()}`
  await db.sql`update zro.users set display_name = ${nome} where id = ${o.userId}`
  await trocarArroba(db, o.auth, arroba)
  return { ...o, auth: await refresh(db, o.token), arroba, nome }
}

/** Põe a pessoa na organização de outra (papel editor por padrão) e deixa essa organização ativa na sessão dela. */
async function entrarNaEquipe(p: Pessoa, orgId: string, role = 'editor') {
  await db.sql`insert into zro.memberships (org_id, user_id, role) values (${orgId}, ${p.userId}, ${role})
               on conflict (org_id, user_id) do update set status = 'active', role = excluded.role`
  await db.sql`update zro.sessions set active_org_id = ${orgId} where user_id = ${p.userId}`
  p.auth = await refresh(db, p.token)
}

const naLista = async (quem: Pessoa, alvo: Pessoa) => (await estadoSet(db, quem.auth)).pessoas.find((x) => x.id === alvo.userId)

/** Um cliente OAuth do Maestro e um access token da pessoa com os escopos pedidos. */
async function tokenDoApp(userId: string, orgId: string, escopos: string) {
  const by = await admin(db)
  const c = await db.asSystem('teste', (tx) =>
    registerClient(tx, {
      id: `app-${unico()}`,
      name: 'Maestro teste',
      productId: 'maestro',
      kind: 'confidential',
      redirectUris: ['https://app.teste/cb'],
      allowLoopback: false,
      createdBy: by,
    }),
  )
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

describe('presença: equipe, app e privacidade', () => {
  it('duas pessoas da mesma equipe se veem online e em qual app; outra organização não aparece', async () => {
    const a = await pessoa('Victor')
    const b = await pessoa('Bia')
    const fora = await pessoa('Fora')
    await entrarNaEquipe(b, a.orgId)
    await estadoSet(db, a.auth, { batida: 'ativo' })
    await estadoSet(db, b.auth, { batida: 'ativo' })
    await estadoSet(db, fora.auth, { batida: 'ativo' })

    const vista = await naLista(b, a)
    expect(vista).toMatchObject({ estado: 'online', equipe: true, contato: false, app: { id: 'hub', nome: 'Absolute ZRO' }, arroba: a.arroba, nome: 'Victor' })
    expect(vista!.vistoEm).toBeTruthy()
    expect(JSON.stringify(await estadoSet(db, b.auth))).not.toContain('@teste.absolutezro.local')
    expect(await naLista(a, fora)).toBeUndefined()
    expect(await naLista(fora, a)).toBeUndefined()

    // aba escondida: ausente; batida velha: offline com "visto há"
    await estadoSet(db, a.auth, { batida: 'ausente' })
    expect((await naLista(b, a))!.estado).toBe('ausente')
    await db.sql`update zro.set_presenca set visto_em = now() - interval '20 minutes' where user_id = ${a.userId}`
    expect(await naLista(b, a)).toMatchObject({ estado: 'offline', app: null })
    expect((await naLista(b, a))!.vistoEm).toBeTruthy()
    // saiu: a linha do app some
    await estadoSet(db, a.auth, { batida: 'saiu' })
    expect(await db.sql`select 1 from zro.set_presenca where user_id = ${a.userId}`).toHaveLength(0)
  })

  it('o app da presença vem do token (escopo zro.set); token sem o escopo não vale', async () => {
    expect(FAMILY_SCOPES).toContain('zro.set')
    const a = await pessoa('Token')
    const b = await pessoa('Colega')
    await entrarNaEquipe(b, a.orgId)
    const at = await tokenDoApp(a.userId, a.orgId, 'zro.set')
    const auth = await authenticateAccessToken(db, `Bearer ${at}`, 'zro.set')
    expect(auth?.session.app?.productId).toBe('maestro')
    await estadoSet(db, auth, { batida: 'ativo' })
    expect((await naLista(b, a))!.app).toEqual({ id: 'maestro', nome: 'Maestro' })
    const semEscopo = await tokenDoApp(a.userId, a.orgId, 'zro.ia')
    expect(await authenticateAccessToken(db, `Bearer ${semEscopo}`, 'zro.set')).toBeNull()
    await expectCode(estadoSet(db, null), 'unauthenticated')
  })

  it('invisível não grava presença e aparece offline; "quem vê" e "visto há" valem', async () => {
    const a = await pessoa('Discreta')
    const b = await pessoa('Equipe')
    const c = await pessoa('Contato')
    await entrarNaEquipe(b, a.orgId)
    await pedirContatoSet(db, c.auth, { arroba: a.arroba })
    await responderContatoSet(db, a.auth, c.userId, true)
    await estadoSet(db, a.auth, { batida: 'ativo' })
    expect((await naLista(b, a))!.estado).toBe('online')
    expect(await naLista(c, a)).toMatchObject({ estado: 'online', contato: true })

    await salvarPreferenciasSet(db, a.auth, { invisivel: true })
    expect(await db.sql`select 1 from zro.set_presenca where user_id = ${a.userId}`).toHaveLength(0)
    await estadoSet(db, a.auth, { batida: 'ativo' })
    expect(await db.sql`select 1 from zro.set_presenca where user_id = ${a.userId}`).toHaveLength(0)
    expect(await naLista(b, a)).toMatchObject({ estado: 'offline', app: null, vistoEm: null })

    await salvarPreferenciasSet(db, a.auth, { invisivel: false, quemVe: 'contatos' })
    await estadoSet(db, a.auth, { batida: 'ativo' })
    expect(await naLista(b, a)).toMatchObject({ estado: 'offline', vistoEm: null })
    expect((await naLista(c, a))!.estado).toBe('online')

    await salvarPreferenciasSet(db, a.auth, { quemVe: 'equipe', mostrarVisto: false })
    expect((await naLista(b, a))!.estado).toBe('online')
    expect((await naLista(c, a))!.estado).toBe('offline')
    await db.sql`update zro.set_presenca set visto_em = now() - interval '1 hour' where user_id = ${a.userId}`
    expect(await naLista(b, a)).toMatchObject({ estado: 'offline', vistoEm: null })

    expect((await estadoSet(db, a.auth)).eu.preferencias).toEqual({ invisivel: false, quemVe: 'equipe', mostrarVisto: false })
    await expectCode(salvarPreferenciasSet(db, a.auth, { quemVe: 'todo-mundo' as never }), 'invalid_input')
  })
})

describe('contatos e conversa direta', () => {
  it('sem trabalhar junto nem ser contato não dá para conversar; depois do aceite, dá', async () => {
    const a = await pessoa('Ana')
    const b = await pessoa('Bruno')
    await expectCode(abrirConversaSet(db, a.auth, { pessoa: b.userId }), 'action_not_allowed')

    expect((await pedirContatoSet(db, a.auth, { arroba: `@${b.arroba.toUpperCase()}` })).estado).toBe('pendente')
    expect((await estadoSet(db, b.auth)).pedidos).toBe(1)
    expect((await meusContatosSet(db, b.auth)).recebidos.map((p) => p.id)).toEqual([a.userId])
    expect((await meusContatosSet(db, a.auth)).enviados.map((p) => p.id)).toEqual([b.userId])
    await expectCode(abrirConversaSet(db, a.auth, { pessoa: b.userId }), 'action_not_allowed')

    expect(await responderContatoSet(db, b.auth, a.userId, true)).toBe('aceito')
    const c = await abrirConversaSet(db, a.auth, { pessoa: b.userId })
    expect(c).toMatchObject({ tipo: 'direta', titulo: 'Bruno', podeEscrever: true, pessoa: { arroba: b.arroba } })
    const m = await enviarMensagemSet(db, a.auth, c.id, { texto: 'Oi, Bruno! https://absolutezro.com', chave: 'chave-0001-abc' })
    const de = await enviarMensagemSet(db, a.auth, c.id, { texto: 'Oi, Bruno! https://absolutezro.com', chave: 'chave-0001-abc' })
    expect(de).toMatchObject({ id: m.id, repetida: true })

    const eb = await estadoSet(db, b.auth)
    expect(eb.naoLidas).toBe(1)
    expect(eb.porConversa[c.id]).toBe(1)
    const lida = await lerConversaSet(db, b.auth, c.id)
    expect(lida.mensagens.map((x) => x.texto)).toEqual(['Oi, Bruno! https://absolutezro.com'])
    expect(lida.mensagens[0]).toMatchObject({ minha: false, autor: { id: a.userId, nome: 'Ana' } })
    await atualizarConversaSet(db, b.auth, c.id, { lidaAte: m.seq })
    expect((await estadoSet(db, b.auth)).naoLidas).toBe(0)

    // a mesma conversa nos dois lados, e mensagem nova pelo cursor
    expect((await abrirConversaSet(db, b.auth, { pessoa: a.userId })).id).toBe(c.id)
    const r = await enviarMensagemSet(db, b.auth, c.id, { texto: 'Oi!' })
    expect((await lerConversaSet(db, a.auth, c.id, { depois: m.seq })).mensagens.map((x) => x.seq)).toEqual([r.seq])
  })

  it('pedido mútuo vira contato; recusa não avisa e segura novo pedido por 30 dias; perfil escondido não é achado', async () => {
    const a = await pessoa('Caio')
    const b = await pessoa('Duda')
    await pedirContatoSet(db, a.auth, { id: b.userId })
    expect((await pedirContatoSet(db, b.auth, { arroba: a.arroba })).estado).toBe('aceito')
    expect((await meusContatosSet(db, a.auth)).contatos.map((p) => p.id)).toEqual([b.userId])
    await removerContatoSet(db, a.auth, b.userId)
    expect((await meusContatosSet(db, b.auth)).contatos).toEqual([])

    await pedirContatoSet(db, a.auth, { id: b.userId })
    expect(await responderContatoSet(db, b.auth, a.userId, false)).toBe('recusado')
    // quem pediu continua vendo "enviado" e não consegue pedir de novo (sem descobrir a recusa)
    expect((await meusContatosSet(db, a.auth)).enviados.map((p) => p.id)).toEqual([b.userId])
    expect((await pedirContatoSet(db, a.auth, { id: b.userId })).estado).toBe('pendente')
    expect((await meusContatosSet(db, b.auth)).recebidos).toEqual([])
    await expectCode(responderContatoSet(db, b.auth, a.userId, true), 'not_found')

    const escondida = await pessoa('Escondida')
    await definirVisibilidade(db, escondida.auth, false)
    await expectCode(pedirContatoSet(db, a.auth, { arroba: escondida.arroba }), 'not_found')
    await expectCode(pedirContatoSet(db, a.auth, { arroba: a.arroba }), 'invalid_input')
  })

  it('e-mail não confirmado não pede contato nem escreve', async () => {
    const o = await newOrgWithOwner(db, 'sem-email')
    await db.sql`update zro.users set email_verified_at = null where id = ${o.userId}`
    const auth = await refresh(db, o.token)
    const b = await pessoa('Alvo')
    await expectCode(pedirContatoSet(db, auth, { id: b.userId }), 'email_not_verified')
    await expectCode(abrirConversaSet(db, auth, { pessoa: b.userId }), 'email_not_verified')
  })

  it('editar e apagar são marcas, com a versão anterior só para a moderação', async () => {
    const a = await pessoa('Edita')
    const b = await pessoa('Le')
    await entrarNaEquipe(b, a.orgId)
    const c = await abrirConversaSet(db, a.auth, { pessoa: b.userId })
    const m = await enviarMensagemSet(db, a.auth, c.id, { texto: 'versão um' })
    await editarMensagemSet(db, a.auth, m.id, 'versão dois')
    await expectCode(editarMensagemSet(db, b.auth, m.id, 'não é minha'), 'not_found')
    let ms = (await lerConversaSet(db, b.auth, c.id)).mensagens
    expect(ms[0]).toMatchObject({ texto: 'versão dois', apagada: false })
    expect(ms[0]!.editadaEm).toBeTruthy()
    await expectCode(apagarMensagemSet(db, b.auth, m.id), 'not_found')
    await apagarMensagemSet(db, a.auth, m.id)
    ms = (await lerConversaSet(db, b.auth, c.id)).mensagens
    expect(ms[0]).toMatchObject({ texto: null, apagada: true })
    expect((await db.sql`select texto, tipo from zro.set_mensagem_versoes where mensagem_id = ${m.id} order by id`).map((r) => r.texto)).toEqual([
      'versão um',
      'versão dois',
    ])
    // a versão guardada não aparece para o papel do app
    await expect(db.asUser({ userId: a.userId, orgId: a.orgId }, (tx) => tx`select * from zro.set_mensagem_versoes`)).rejects.toThrow()
    // prazo da edição: 24 h
    const velha = await enviarMensagemSet(db, a.auth, c.id, { texto: 'antiga' })
    await db.sql`update zro.set_mensagens set criada_em = now() - interval '2 days' where id = ${velha.id}`
    await expectCode(editarMensagemSet(db, a.auth, velha.id, 'nova'), 'invalid_input')
    // a auditoria nunca guarda o texto
    const logs = await db.sql`select metadata::text as m from zro.audit_logs where actor_user_id = ${a.userId} and action like 'set.%'`
    expect(logs.map((l) => l.m).join(' ')).not.toContain('versão')
  })

  it('texto limpo, vazio e grande demais recusados; limite de mensagens por minuto', async () => {
    expect(limparTexto('  oi\u0000\u202E  \r\n tudo bem?  ')).toBe('oi  \n tudo bem?')
    expect(() => limparTexto('   ')).toThrow()
    expect(() => limparTexto('x'.repeat(4001))).toThrow()
    const a = await pessoa('Rapida')
    const b = await pessoa('Recebe')
    await entrarNaEquipe(b, a.orgId)
    const c = await abrirConversaSet(db, a.auth, { pessoa: b.userId })
    for (let i = 0; i < LIMITE_MENSAGENS.max; i++) await enviarMensagemSet(db, a.auth, c.id, { texto: `msg ${i}` })
    await expectCode(enviarMensagemSet(db, a.auth, c.id, { texto: 'uma a mais' }), 'rate_limited')
    const pagina = await lerConversaSet(db, b.auth, c.id, { limite: 10 })
    expect(pagina.mais).toBe(true)
    expect(pagina.mensagens.at(-1)!.texto).toBe(`msg ${LIMITE_MENSAGENS.max - 1}`)
    const antes = await lerConversaSet(db, b.auth, c.id, { antes: pagina.mensagens[0]!.seq, limite: 10 })
    expect(antes.mensagens.at(-1)!.seq).toBeLessThan(pagina.mensagens[0]!.seq)
  })
})

describe('conversa do projeto', () => {
  it('quem vê o projeto vê a mesma conversa, do HUB e do app; projeto restrito e outra organização não', async () => {
    const dono = await pessoa('Dona')
    const editor = await pessoa('Editor')
    const restrito = await pessoa('Viewer')
    const fora = await pessoa('Intrusa')
    await entrarNaEquipe(editor, dono.orgId, 'editor')
    await entrarNaEquipe(restrito, dono.orgId, 'viewer')
    const projeto = await createProject(db, dono.auth, { title: 'Filme Safra', visibility: 'organization' })
    const fechado = await createProject(db, dono.auth, { title: 'Segredo', visibility: 'restricted' })

    expect((await minhasConversasSet(db, editor.auth)).projetos.map((p) => p.titulo)).toContain('Filme Safra')
    const c = await abrirConversaSet(db, dono.auth, { projeto })
    expect(c).toMatchObject({ tipo: 'projeto', titulo: 'Filme Safra', projeto: { id: projeto } })
    await enviarMensagemSet(db, dono.auth, c.id, { texto: 'Diária confirmada para sexta.' })

    // pelo app (Maestro): mesma conversa, mesmas mensagens
    const at = await tokenDoApp(editor.userId, dono.orgId, 'zro.set')
    const pelaApi = (await authenticateAccessToken(db, `Bearer ${at}`, 'zro.set'))!
    const lista = await minhasConversasSet(db, pelaApi)
    expect(lista.conversas.find((x) => x.id === c.id)).toMatchObject({ naoLidas: 1, titulo: 'Filme Safra' })
    expect(lista.projetos.map((p) => p.id)).not.toContain(projeto)
    expect((await lerConversaSet(db, pelaApi, c.id)).mensagens.map((m) => m.texto)).toEqual(['Diária confirmada para sexta.'])
    await enviarMensagemSet(db, pelaApi, c.id, { texto: 'Fechado!' })
    expect((await estadoSet(db, dono.auth)).porConversa[c.id]).toBe(1)

    // silenciada: some do balão, continua na lista
    await atualizarConversaSet(db, dono.auth, c.id, { silenciada: true })
    const e = await estadoSet(db, dono.auth)
    expect(e.naoLidas).toBe(0)
    expect(e.porConversa[c.id]).toBe(1)

    // o viewer vê projeto da organização, não o restrito
    expect((await lerConversaSet(db, restrito.auth, c.id)).mensagens).toHaveLength(2)
    await expectCode(abrirConversaSet(db, restrito.auth, { projeto: fechado }), 'project_not_found')
    // outra organização: nada
    await expectCode(lerConversaSet(db, fora.auth, c.id), 'not_found')
    await expectCode(enviarMensagemSet(db, fora.auth, c.id, { texto: 'oi' }), 'action_not_allowed')
    await expectCode(abrirConversaSet(db, fora.auth, { projeto }), 'project_not_found')
    expect((await minhasConversasSet(db, fora.auth)).conversas.map((x) => x.id)).not.toContain(c.id)
    // quem sai da equipe deixa de ver
    await db.sql`update zro.memberships set status = 'removed' where org_id = ${dono.orgId} and user_id = ${editor.userId}`
    await expectCode(lerConversaSet(db, pelaApi, c.id), 'forbidden_role')
  })
})

describe('bloquear e denunciar', () => {
  it('bloquear esconde presença, conversa e mensagens nos dois sentidos, sem avisar', async () => {
    const a = await pessoa('Bloqueia')
    const b = await pessoa('Chato')
    const c = await pessoa('Terceira')
    await entrarNaEquipe(b, a.orgId)
    await entrarNaEquipe(c, a.orgId)
    const projeto = await createProject(db, a.auth, { title: 'Projeto do bloqueio' })
    const pc = await abrirConversaSet(db, a.auth, { projeto })
    const direta = await abrirConversaSet(db, b.auth, { pessoa: a.userId })
    await enviarMensagemSet(db, b.auth, direta.id, { texto: 'mensagem chata' })
    await enviarMensagemSet(db, b.auth, pc.id, { texto: 'no projeto, do chato' })
    await enviarMensagemSet(db, a.auth, pc.id, { texto: 'no projeto, de quem bloqueou' })
    await estadoSet(db, a.auth, { batida: 'ativo' })
    await estadoSet(db, b.auth, { batida: 'ativo' })

    await bloquearSet(db, a.auth, b.userId)
    expect(await naLista(a, b)).toBeUndefined()
    expect(await naLista(b, a)).toBeUndefined()
    expect((await naLista(c, a))!.estado).toBe('online')
    await expectCode(enviarMensagemSet(db, b.auth, direta.id, { texto: 'de novo' }), 'action_not_allowed')
    await expectCode(abrirConversaSet(db, b.auth, { pessoa: a.userId }), 'action_not_allowed')
    await expectCode(lerConversaSet(db, b.auth, direta.id), 'not_found')
    expect((await minhasConversasSet(db, a.auth)).conversas.map((x) => x.id)).not.toContain(direta.id)
    expect((await lerConversaSet(db, a.auth, pc.id)).mensagens.map((m) => m.texto)).toEqual(['no projeto, de quem bloqueou'])
    expect((await lerConversaSet(db, b.auth, pc.id)).mensagens.map((m) => m.texto)).toEqual(['no projeto, do chato'])
    expect((await lerConversaSet(db, c.auth, pc.id)).mensagens).toHaveLength(2)
    expect((await estadoSet(db, a.auth)).porConversa[pc.id]).toBeUndefined()
    // pedido de quem foi bloqueado: "pendente", sem chegar a ninguém
    expect((await pedirContatoSet(db, b.auth, { id: a.userId })).estado).toBe('pendente')
    expect((await meusContatosSet(db, a.auth)).recebidos).toEqual([])
    expect((await meusContatosSet(db, a.auth)).bloqueados.map((p) => p.id)).toEqual([b.userId])
    await expectCode(pedirContatoSet(db, a.auth, { id: b.userId }), 'action_not_allowed')

    // denúncia da mensagem direta, mesmo depois de bloquear; a moderação vê o mínimo
    const [msg] = await db.sql`select id from zro.set_mensagens where conversa_id = ${direta.id}`
    const d = await denunciarSet(db, a.auth, { pessoa: b.userId, mensagem: msg!.id as string, motivo: 'assedio', detalhe: 'Insiste depois do não.' })
    await expectCode(denunciarSet(db, c.auth, { pessoa: b.userId, mensagem: msg!.id as string, motivo: 'spam' }), 'not_found')
    await expectCode(denunciarSet(db, a.auth, { pessoa: b.userId, motivo: 'qualquer' }), 'invalid_input')
    await expect(db.asUser({ userId: a.userId, orgId: a.orgId }, (tx) => tx`select * from zro.set_denuncias`)).rejects.toThrow()
    const abertas = await db.asSystem('teste', (tx) => denunciasSet(tx))
    const minha = abertas.find((x) => x.id === d.id)!
    expect(minha).toMatchObject({ motivo: 'assedio', mensagem: 'mensagem chata', denunciado: { id: b.userId }, contra: 1 })
    expect(JSON.stringify(minha)).not.toContain('@teste.absolutezro.local')
    const adm = await admin(db)
    await db.asSystem('teste', (tx) => resolverDenunciaSet(tx, adm, d.id))
    expect((await db.asSystem('teste', (tx) => denunciasSet(tx))).map((x) => x.id)).not.toContain(d.id)

    // desbloquear devolve a presença (o contato não volta sozinho)
    await desbloquearSet(db, a.auth, b.userId)
    expect((await naLista(a, b))!.estado).toBe('online')
  })
})

describe('RLS e exclusão da conta', () => {
  it('as tabelas só mostram as linhas da própria pessoa e não aceitam escrita direta', async () => {
    const a = await pessoa('Rls')
    const b = await pessoa('Par')
    const x = await pessoa('Xereta')
    await entrarNaEquipe(b, a.orgId)
    const c = await abrirConversaSet(db, a.auth, { pessoa: b.userId })
    await enviarMensagemSet(db, a.auth, c.id, { texto: 'segredo' })
    await salvarPreferenciasSet(db, a.auth, { quemVe: 'equipe' })
    await estadoSet(db, a.auth, { batida: 'ativo' })
    await bloquearSet(db, b.auth, x.userId)

    const comoX = <T>(fn: Parameters<Database['asUser']>[1]) => db.asUser({ userId: x.userId, orgId: x.orgId }, fn) as Promise<T>
    for (const t of ['set_mensagens', 'set_conversas', 'set_presenca', 'set_preferencias', 'set_leituras', 'set_contatos', 'set_bloqueios']) {
      const rows = await comoX<unknown[]>((tx) => tx.unsafe(`select * from zro.${t}`))
      expect(rows, t).toHaveLength(0)
    }
    await expect(comoX((tx) => tx`insert into zro.set_mensagens (conversa_id, autor_id, texto) values (${c.id}, ${x.userId}, 'invasão')`)).rejects.toThrow()
    await expect(comoX((tx) => tx`insert into zro.set_conversas (tipo, a, b) values ('direta', ${a.userId}, ${b.userId})`)).rejects.toThrow()
    await expect(comoX((tx) => tx`update zro.set_mensagens set texto = 'x'`)).rejects.toThrow()
    await expect(comoX((tx) => tx`delete from zro.set_mensagens`)).rejects.toThrow()
    await expect(comoX((tx) => tx`insert into zro.set_preferencias (user_id) values (${a.userId})`)).rejects.toThrow()
    // a própria pessoa vê as dela
    const deA = await db.asUser({ userId: a.userId, orgId: a.orgId }, (tx) => tx`select count(*)::int as n from zro.set_mensagens`)
    expect(deA[0]!.n).toBe(1)
    // quem foi bloqueado não vê o bloqueio
    expect(await comoX<unknown[]>((tx) => tx`select * from zro.set_bloqueios`)).toHaveLength(0)
  })

  it('excluir a conta apaga mensagens, conversas diretas, presença, contatos e bloqueios', async () => {
    const a = await pessoa('Sai')
    const b = await pessoa('Fica')
    await entrarNaEquipe(b, a.orgId)
    const projeto = await createProject(db, a.auth, { title: 'Projeto que fica' })
    const pc = await abrirConversaSet(db, b.auth, { projeto: projeto })
    const direta = await abrirConversaSet(db, a.auth, { pessoa: b.userId })
    await enviarMensagemSet(db, a.auth, direta.id, { texto: 'tchau' })
    await enviarMensagemSet(db, b.auth, pc.id, { texto: 'fica no projeto' })
    await enviarMensagemSet(db, a.auth, pc.id, { texto: 'sai do projeto' })
    await pedirContatoSet(db, a.auth, { id: (await pessoa('Outro')).userId })
    await bloquearSet(db, b.auth, a.userId)
    await salvarPreferenciasSet(db, a.auth, { mostrarVisto: false })
    await estadoSet(db, a.auth, { batida: 'ativo' })
    // a dona da organização sai: a organização fica com a outra pessoa? Aqui ela é dona só da dela; b fica como membro.
    await db.sql`update zro.memberships set role = 'owner' where org_id = ${a.orgId} and user_id = ${b.userId}`
    await db.sql`update zro.organizations set owner_id = ${b.userId} where id = ${a.orgId}`
    await db.sql`update zro.memberships set role = 'admin' where org_id = ${a.orgId} and user_id = ${a.userId}`
    await excluirConta(db, (await refresh(db, a.token))!, 'senha-de-teste-123')

    for (const [t, col] of [
      ['set_mensagens', 'autor_id'],
      ['set_presenca', 'user_id'],
      ['set_preferencias', 'user_id'],
      ['set_leituras', 'user_id'],
      ['set_contatos', 'pedido_por'],
      ['set_bloqueios', 'bloqueado'],
    ] as const) {
      expect(await db.sql.unsafe(`select 1 from zro.${t} where ${col} = $1`, [a.userId]), t).toHaveLength(0)
    }
    expect(await db.sql`select 1 from zro.set_conversas where id = ${direta.id}`).toHaveLength(0)
    const b2 = await refresh(db, b.token)
    expect((await lerConversaSet(db, b2, pc.id)).mensagens.map((m) => m.texto)).toEqual(['fica no projeto'])
    const anon = await newUser(db, 'sem-org')
    await expectCode(estadoSet(db, anon.auth), 'no_active_organization')
  })
})
