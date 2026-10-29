// IA do ecossistema (0016): conversa pessoal, plataforma de origem vinda do token, crédito só com resposta.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Authenticated } from '@zro/auth'
import { abrirConversa, apagarConversa, concluirTurno, iniciarTurno, listarConversas, retratoDoEcossistema } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { allowRelease, expectCode, giveLimits, newOrgWithOwner, newUser, refresh } from './helpers'

let db: Database
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

/** A mesma pessoa, como se chamasse de um app da família com o token do login único. */
const viaApp = (auth: Authenticated, productId: string): Authenticated => ({
  ...auth,
  session: { ...auth.session, app: { clientId: `${productId}-web`, productId } },
})

async function comCreditos(label: string, creditos = 5) {
  const o = await newOrgWithOwner(db, label)
  await giveLimits(db, o.orgId, 'tpeasy', { 'zro.ai_credits': creditos })
  return o
}

describe('IA do ecossistema', () => {
  it('sem crédito configurado no plano, nem começa (nada de "ilimitado" por omissão)', async () => {
    const o = await newOrgWithOwner(db, 'ia-sem-plano')
    await expectCode(iniciarTurno(db, o.auth, { texto: 'Oi' }), 'quota_not_configured')
  })

  it('guarda pergunta e resposta, gasta 1 crédito por resposta e só uma vez', async () => {
    const o = await comCreditos('ia-credito', 2)
    const t = await iniciarTurno(db, o.auth, { texto: 'Quais projetos pedem atenção?' })
    expect(t.conversa.produto).toBeNull()
    expect(t.conversa.titulo).toBe('Quais projetos pedem atenção?')
    expect(t.historico.map((m) => m.papel)).toEqual(['user'])
    const r = await concluirTurno(db, t, 'Nenhum agora.')
    expect(r.creditos).toBe(1)
    expect((await concluirTurno(db, t, 'De novo.')).creditos).toBe(0) // mesma pergunta não conta duas vezes
    const [q] = await db.sql`select used from zro.quotas where org_id = ${o.orgId} and metric = 'zro.ai_credits'`
    expect(Number(q!.used)).toBe(1)

    const t2 = await iniciarTurno(db, o.auth, { conversa: t.conversa.id, texto: 'E o próximo?' })
    expect(t2.historico.map((m) => m.papel)).toEqual(['user', 'assistant', 'assistant', 'user'])
    await concluirTurno(db, t2, 'Ok.')
    await expectCode(iniciarTurno(db, o.auth, { texto: 'Mais uma' }), 'quota_exceeded')
  })

  it('a plataforma vem do token do app, nunca do corpo; o HUB lista todas e filtra por plataforma', async () => {
    const o = await comCreditos('ia-plataformas')
    const a = await iniciarTurno(db, viaApp(o.auth, 'sobedesce'), { texto: 'Subir a pasta do casamento' })
    const b = await iniciarTurno(db, viaApp(o.auth, 'synquei'), { texto: 'Organizar a pasta', produto: 'sobedesce' })
    const c = await iniciarTurno(db, o.auth, { texto: 'Resumo da semana' })
    expect(a.conversa.produto).toBe('sobedesce')
    expect(b.conversa.produto).toBe('synquei')
    expect(c.conversa.produto).toBeNull()

    expect((await listarConversas(db, o.auth)).map((x) => x.id).sort()).toEqual([a, b, c].map((x) => x.conversa.id).sort())
    expect((await listarConversas(db, o.auth, { produto: 'sobedesce' })).map((x) => x.id)).toEqual([a.conversa.id])
    expect((await listarConversas(db, o.auth, { produto: null })).map((x) => x.id)).toEqual([c.conversa.id])
    expect((await listarConversas(db, o.auth, { produto: 'synquei' }))[0]!.produtoNome).toBe('Synquei')
  })

  it('app fechado por lançamento (ADR 0023): a Z nega product_closed, mesmo com crédito; conta listada no canal api entra', async () => {
    const o = await comCreditos('ia-fechado')
    const nossom = viaApp(o.auth, 'nossom')
    await expectCode(iniciarTurno(db, nossom, { texto: 'Limpar minha fala' }), 'product_closed')
    await expectCode(listarConversas(db, nossom), 'product_closed')
    await expectCode(abrirConversa(db, nossom, '00000000-0000-4000-8000-000000000000'), 'product_closed')
    await expectCode(apagarConversa(db, nossom, '00000000-0000-4000-8000-000000000000'), 'product_closed')
    await allowRelease(db, 'nossom', o.userId, { channels: ['api'] })
    const t = await iniciarTurno(db, nossom, { texto: 'Limpar minha fala' })
    expect(t.conversa.produto).toBe('nossom')
    expect((await listarConversas(db, nossom, { produto: 'nossom' })).map((x) => x.id)).toEqual([t.conversa.id])
    // o retrato que a Z lê marca o que está fechado para a pessoa no canal da chamada (api): o NOSSOM abre (sem plano = disponível)
    const retrato = await retratoDoEcossistema(db, t.actor, 'nossom')
    const acesso = Object.fromEntries(retrato.ferramentas.map((f) => [f.id, f.acesso]))
    expect(acesso).toMatchObject({ nossom: 'available', tpeasy: 'contracted', 'ai-edit': 'closed', finishing: 'closed', 'carro-do-freela': 'closed' })
  })

  it('conversa é pessoal: nem o dono da organização lê a de outra pessoa (RLS)', async () => {
    const o = await comCreditos('ia-pessoal')
    const colega = await newUser(db, 'ia-colega')
    await db.asSystem('teste: vínculo', async (tx) => {
      await tx`insert into zro.memberships (org_id, user_id, role, status) values (${o.orgId}, ${colega.userId}, 'editor', 'active')`
      await tx`update zro.sessions set active_org_id = ${o.orgId} where user_id = ${colega.userId}`
    })
    const colegaAuth = await refresh(db, colega.token)
    const t = await iniciarTurno(db, colegaAuth, { texto: 'Algo meu' })
    await concluirTurno(db, t, 'Resposta.')

    expect(await listarConversas(db, o.auth)).toEqual([])
    await expectCode(abrirConversa(db, o.auth, t.conversa.id), 'not_found')
    await expectCode(apagarConversa(db, o.auth, t.conversa.id), 'not_found')
    await expectCode(iniciarTurno(db, o.auth, { conversa: t.conversa.id, texto: 'invadir' }), 'not_found')
    // e pelo papel da aplicação, direto no banco
    const vistos = await db.asUser({ userId: o.userId, orgId: o.orgId }, (tx) => tx`select id from zro.ia_mensagens where conversa_id = ${t.conversa.id}`)
    expect(vistos).toHaveLength(0)

    const lida = await abrirConversa(db, colegaAuth, t.conversa.id)
    expect(lida.mensagens.map((m) => m.texto)).toEqual(['Algo meu', 'Resposta.'])
    await apagarConversa(db, colegaAuth, t.conversa.id)
    expect(await listarConversas(db, colegaAuth)).toEqual([])
  })

  it('outra organização não enxerga nada', async () => {
    const o = await comCreditos('ia-org-a')
    const outra = await comCreditos('ia-org-b')
    const t = await iniciarTurno(db, o.auth, { texto: 'Segredo da produtora A' })
    await expectCode(abrirConversa(db, outra.auth, t.conversa.id), 'not_found')
    expect(await listarConversas(db, outra.auth)).toEqual([])
  })

  it('o retrato traz a conta e o que a pessoa vê, com a plataforma atual', async () => {
    const o = await comCreditos('ia-retrato')
    const t = await iniciarTurno(db, viaApp(o.auth, 'tpeasy'), { texto: 'Oi' })
    const r = await retratoDoEcossistema(db, t.actor, t.conversa.produto)
    expect(r.plataforma_atual).toBe('TPeasy')
    expect(r.pessoa.papel_na_organizacao).toBe('owner')
    expect(r.ferramentas.find((f) => f.id === 'tpeasy')!.acesso).toBe('contracted')
    expect(r.consumo_do_mes.metricas.some((m) => m.metrica === 'zro.ai_credits')).toBe(true)
  })

  it('recusa texto vazio ou longo demais', async () => {
    const o = await comCreditos('ia-validacao')
    await expectCode(iniciarTurno(db, o.auth, { texto: '   ' }), 'invalid_input')
    await expectCode(iniciarTurno(db, o.auth, { texto: 'x'.repeat(8001) }), 'invalid_input')
  })
})
