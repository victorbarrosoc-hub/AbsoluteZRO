// A Z lendo o Maestro (só leitura): a autorização do HUB vem antes (gate de lançamento + plano; fechado → nenhum
// pedido sai), o pedido assinado tem a forma que o Maestro confere (typ, aud, ação, 60 s, jti de uso único), a
// resposta vira texto com fonte e hora, dinheiro só quando veio, e toda leitura (ou recusa) fica na auditoria.
import { createPublicKey, verify, type JsonWebKey } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jwks, PEDIDO_TTL_S, PEDIDO_TYP, setIssuer } from '@zro/auth'
import { IA_ACAO_MAESTRO, MAESTRO_LEITURAS, maestroConfigDoAmbiente, maestroParaIa, resumoDoMaestroParaIa, type MaestroConfig } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { allowRelease, giveLimits, newOrgWithOwner } from './helpers'

let db: Database
const ISS = 'https://hub.teste.absolutezro.local'
const BASE = 'https://maestro.teste.absolutezro.local'
const AUD = 'maestro-web'

type Chamada = { url: string; metodo: string; corpo: string; cabecalho: Record<string, unknown>; claims: Record<string, unknown>; assinaturaOk: boolean }

/** Um Maestro falso: guarda o pedido e confere a assinatura pela JWKS do HUB, como o Maestro faz. */
function maestroFalso(resposta: { status: number; corpo: unknown }) {
  const chamadas: Chamada[] = []
  const cfg: MaestroConfig = {
    base: BASE,
    clientId: AUD,
    fetch: (async (url: string, init: RequestInit) => {
      const token = /^Bearer (.+)$/.exec((init.headers as Record<string, string>).Authorization ?? '')?.[1] ?? ''
      const [c, d, a] = token.split('.')
      const cabecalho = JSON.parse(Buffer.from(c!, 'base64url').toString()) as Record<string, unknown>
      const claims = JSON.parse(Buffer.from(d!, 'base64url').toString()) as Record<string, unknown>
      const chave = (await jwks(db)).keys.find((k) => k.kid === cabecalho.kid)
      const assinaturaOk =
        !!chave &&
        verify(
          'sha256',
          Buffer.from(`${c}.${d}`),
          { key: createPublicKey({ key: chave as JsonWebKey, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
          Buffer.from(a!, 'base64url'),
        )
      chamadas.push({ url, metodo: init.method ?? 'GET', corpo: String(init.body ?? ''), cabecalho, claims, assinaturaOk })
      return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch,
  }
  return { cfg, chamadas }
}

const RESUMO = {
  fonte: 'Maestro',
  organizacao: 'Produtora Teste',
  gerado_em: new Date().toISOString(),
  hoje: '2026-10-28',
  link: `${BASE}/app/hoje`,
  retornar_hoje: [{ nome: 'Café', tipo: 'cliente', data: '2026-10-28', nota: 'ligar' }],
  vencendo: [{ card: 'Reels lançamento', cliente: 'Café', prazo: '2026-10-28' }],
  com_o_cliente: [],
  contagens: { pedidos_novos: 2, orcamentos_aguardando: 1, agenda_hoje: 3, cards_atrasados: 0 },
  dinheiro: { meta_do_mes: 500000, faturado_no_mes: 123456, caixa: 99000, receber_semana: 10000, pagar_semana: 5000, moeda: 'BRL centavos' },
}

/** Dona com o Maestro liberado (lista de acesso) e no plano: o caso do titular hoje. */
async function donaComMaestro(label: string) {
  const o = await newOrgWithOwner(db, label)
  await allowRelease(db, 'maestro', o.userId, { kind: 'owner' })
  await giveLimits(db, o.orgId, 'maestro', {})
  return o
}

const auditoria = (userId: string) =>
  db.sql`select action, target_type, metadata from zro.audit_logs where actor_user_id = ${userId} and action = ${IA_ACAO_MAESTRO} order by created_at`

beforeAll(() => {
  db = testDatabase()
  setIssuer(ISS)
})
afterAll(async () => {
  await db.close()
})

describe('ver_maestro: a Z lendo o Maestro', () => {
  it('config: padrão é o Maestro oficial e o cliente maestro-web; o ambiente troca', () => {
    expect(maestroConfigDoAmbiente({})).toEqual({ base: 'https://maestro.absolutezro.com', clientId: 'maestro-web' })
    expect(maestroConfigDoAmbiente({ ZRO_MAESTRO_URL: 'https://m.local/', ZRO_MAESTRO_CLIENT_ID: 'outro' })).toEqual({
      base: 'https://m.local',
      clientId: 'outro',
    })
    expect(Object.values(MAESTRO_LEITURAS).map((l) => l.acao)).toEqual(['maestro.resumo'])
  })

  it('liberado e no plano: um POST assinado como o Maestro confere, resposta com fonte, hora e dinheiro, e auditoria', async () => {
    const o = await donaComMaestro('maestro-ok')
    const m = maestroFalso({ status: 200, corpo: RESUMO })
    const r = await maestroParaIa(db, { actor: { auth: o.auth, userId: o.userId, orgId: o.orgId } }, 'resumo', m.cfg)
    expect(r.erro).toBe(false)
    expect(m.chamadas).toHaveLength(1)
    const c = m.chamadas[0]!
    expect(c.url).toBe(`${BASE}/api/zro/maestro/resumo`)
    expect(c.metodo).toBe('POST')
    expect(c.corpo).toBe('{}')
    expect(c.assinaturaOk).toBe(true)
    expect(c.cabecalho).toMatchObject({ alg: 'ES256', typ: PEDIDO_TYP })
    expect(c.claims).toMatchObject({ iss: ISS, sub: o.userId, aud: AUD, zro_pedido: 'maestro.resumo' })
    expect((c.claims.exp as number) - (c.claims.iat as number)).toBe(PEDIDO_TTL_S)
    expect(PEDIDO_TTL_S).toBeLessThanOrEqual(60)
    // O Maestro aceita jti de 8 a 80 caracteres [A-Za-z0-9_-] (products/maestro/src/lib/zro/pedido.ts).
    expect(c.claims.jti).toMatch(/^[A-Za-z0-9_-]{8,80}$/)

    const j = JSON.parse(r.texto)
    expect(j.fonte).toBe('Maestro')
    expect(j.citar_como).toMatch(/^segundo o Maestro, às \d{2}:\d{2}$/)
    expect(j.abrir_no_maestro).toBe(`${BASE}/app/hoje`)
    expect(j.retornar_hoje).toEqual([{ nome: 'Café', tipo: 'cliente', data: '2026-10-28', nota: 'ligar' }])
    expect(j.contagens).toEqual({ pedidos_novos: 2, orcamentos_aguardando: 1, agenda_hoje: 3, cards_atrasados: 0 })
    expect(j.dinheiro.meta_do_mes).toMatch(/5\.000,00/)
    expect(j.dinheiro.faturado_no_mes).toMatch(/1\.234,56/)

    const a = await auditoria(o.userId)
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({
      target_type: 'maestro_leitura',
      metadata: { produto: 'maestro', acao: 'maestro.resumo', resultado: 'lido', erro: null, dinheiro: true },
    })
    // Nada do conteúdo lido vai para a auditoria.
    expect(JSON.stringify(a)).not.toMatch(/Café|Reels|Produtora Teste/)
  })

  it('cada leitura leva um jti novo (o Maestro recusa o reapresentado)', async () => {
    const o = await donaComMaestro('maestro-jti')
    const m = maestroFalso({ status: 200, corpo: RESUMO })
    const actor = { auth: o.auth, userId: o.userId, orgId: o.orgId }
    await maestroParaIa(db, { actor }, 'resumo', m.cfg)
    await maestroParaIa(db, { actor }, 'resumo', m.cfg)
    expect(m.chamadas[0]!.claims.jti).not.toBe(m.chamadas[1]!.claims.jti)
  })

  it('gate fechado (fora da lista de acesso): nenhum pedido sai e a recusa fica na auditoria', async () => {
    const o = await newOrgWithOwner(db, 'maestro-fechado')
    await giveLimits(db, o.orgId, 'maestro', {})
    const m = maestroFalso({ status: 200, corpo: RESUMO })
    const r = await maestroParaIa(db, { actor: { auth: o.auth, userId: o.userId, orgId: o.orgId } }, 'resumo', m.cfg)
    expect(r).toMatchObject({ erro: true, codigo: 'product_closed' })
    expect(r.texto).toMatch(/não está liberado/)
    expect(m.chamadas).toHaveLength(0)
    const a = await auditoria(o.userId)
    expect(a.map((x) => x.metadata)).toEqual([expect.objectContaining({ resultado: 'recusado', erro: 'product_closed' })])
  })

  it('liberado mas sem o Maestro no plano: nenhum pedido sai', async () => {
    const o = await newOrgWithOwner(db, 'maestro-sem-plano')
    await allowRelease(db, 'maestro', o.userId)
    const m = maestroFalso({ status: 200, corpo: RESUMO })
    const r = await maestroParaIa(db, { actor: { auth: o.auth, userId: o.userId, orgId: o.orgId } }, 'resumo', m.cfg)
    expect(r).toMatchObject({ erro: true, codigo: 'entitlement_required' })
    expect(m.chamadas).toHaveLength(0)
  })

  it('sem dinheiro no Maestro (papel equipe/leitura): a Z não recebe valores e é avisada', async () => {
    const o = await donaComMaestro('maestro-equipe')
    const m = maestroFalso({ status: 200, corpo: { ...RESUMO, dinheiro: null } })
    const r = await maestroParaIa(db, { actor: { auth: o.auth, userId: o.userId, orgId: o.orgId } }, 'resumo', m.cfg)
    const j = JSON.parse(r.texto)
    expect(j.dinheiro).toBeNull()
    expect(j.sem_dinheiro).toMatch(/Não fale de dinheiro/)
    expect(r.texto).not.toMatch(/R\$/)
    expect((await auditoria(o.userId))[0]!.metadata).toMatchObject({ resultado: 'lido', dinheiro: false })
  })

  it('falhas do Maestro viram frases (sem número inventado) e ficam na auditoria', async () => {
    const o = await donaComMaestro('maestro-falhas')
    const actor = { auth: o.auth, userId: o.userId, orgId: o.orgId }
    const semVinculo = await maestroParaIa(db, { actor }, 'resumo', maestroFalso({ status: 404, corpo: { erro: 'sem_vinculo' } }).cfg)
    expect(semVinculo).toMatchObject({ erro: true, codigo: 'sem_vinculo' })
    expect(semVinculo.texto).toContain(BASE)
    const devagar = await maestroParaIa(db, { actor }, 'resumo', maestroFalso({ status: 429, corpo: { erro: 'devagar' } }).cfg)
    expect(devagar.texto).toMatch(/esperar/)
    const recusou = await maestroParaIa(db, { actor }, 'resumo', maestroFalso({ status: 401, corpo: { erro: 'nao_autorizado' } }).cfg)
    expect(recusou).toMatchObject({ erro: true, codigo: 'nao_autorizado' })
    const caiu = await maestroParaIa(db, { actor }, 'resumo', {
      base: BASE,
      clientId: AUD,
      fetch: (async () => {
        throw new Error('rede')
      }) as typeof fetch,
    })
    expect(caiu).toMatchObject({ erro: true, codigo: 'fora_do_ar' })
    expect(caiu.texto).toMatch(/Não invente/)
    const a = await auditoria(o.userId)
    expect(a.map((x) => (x.metadata as { erro: string }).erro)).toEqual(['sem_vinculo', 'devagar', 'nao_autorizado', 'fora_do_ar'])
    expect(a.every((x) => (x.metadata as { resultado: string }).resultado === 'falhou')).toBe(true)
  })

  it('link estranho some; listas e textos são cortados', () => {
    const j = JSON.parse(
      resumoDoMaestroParaIa(
        { ...RESUMO, link: 'https://golpe.example/app/hoje', vencendo: Array.from({ length: 50 }, (_, i) => ({ card: `c${i}`, cliente: null, prazo: null })) },
        BASE,
      ),
    )
    expect(j.abrir_no_maestro).toBeUndefined()
    expect(j.vencendo).toHaveLength(20)
  })
})
