// Banco do rádio num Postgres de verdade, montado como no Supabase: o administrador cria o papel `radio` (login, dono
// do schema) e o `radio_app`; o migrador roda como `radio`. Confere a migração, o gate (sem a claim do rádio, nada
// abre), o isolamento entre pessoas pelo RLS (pelas rotas e direto no banco) e quem pode mandar aviso de set.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import postgres from 'postgres'
import { semPostgres, subirPostgres } from './banco-apoio.js'

const pular = semPostgres
let pg, urlRadio, z, banco, rotas

const SEGREDO = 'segredo-de-teste-que-so-existe-aqui'
const pedido = (metodo, url, cookie, corpo) => {
  const texto = corpo ? JSON.stringify(corpo) : ''
  return Object.assign([Buffer.from(texto)][Symbol.iterator](), {
    method: metodo,
    url,
    body: corpo ?? undefined,
    headers: { host: 'radio.absolutezro.com', 'x-forwarded-proto': 'https', cookie: cookie ? `rd_conta=${cookie}` : '', 'content-type': 'application/json' },
  })
}
const resposta = () => {
  const r = { statusCode: 0, headers: {} }
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v)
  r.end = (c) => {
    const t = c == null ? '' : String(c)
    try {
      r.corpo = t ? JSON.parse(t) : null
    } catch {
      r.corpo = t
    }
  }
  return r
}
const chamar = async (rota, metodo, cookie, corpo, url = '/') => {
  const r = resposta()
  await rotas[rota](pedido(metodo, url, cookie, corpo), r)
  return r
}
/** Sessão do login único como o callback grava: com a claim do rádio liberada (ou sem, para o gate). */
const sessao = (sub, nome, apps = ['radio']) => z.selar(z.COOKIE_CONTA, { sub, nome, email: `${sub}@exemplo.com`, apps, lido: Math.floor(Date.now() / 1000) }, 3600)

before(async () => {
  if (pular) return
  pg = await subirPostgres()
  const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
  await admin.unsafe(`create role radio login password 'teste'; create role radio_app nologin; grant radio_app to radio with admin option; create schema radio authorization radio;`)
  await admin.end()
  urlRadio = pg.url.replace('postgres://postgres@', 'postgres://radio:teste@')
  process.env.ZRO_CLIENT_ID = 'radio-web'
  process.env.ZRO_CLIENT_SECRET = SEGREDO
  process.env.RADIO_DATABASE_URL = urlRadio
  delete process.env.RADIO_LOCAL
  const { migrar } = await import('../scripts/migrar.mjs')
  await migrar(urlRadio)
  z = await import('../api/_zro.js')
  banco = await import('../api/_banco.js')
  rotas = {
    diarias: (await import('../api/radio/diarias.js')).default,
    batida: (await import('../api/radio/batida.js')).default,
    aviso: (await import('../api/radio/aviso.js')).default,
    pagina: (await import('../api/pagina.js')).default,
    recurso: (await import('../api/recurso.js')).default,
    local: (await import('../api/local.js')).default,
  }
})
after(async () => {
  await banco?.fecharBanco()
  await pg?.fechar()
})

test('migração: não repete e recusa arquivo já aplicado que mudou', { skip: pular }, async () => {
  const { migrar, migracoes } = await import('../scripts/migrar.mjs')
  assert.deepEqual(await migrar(urlRadio), [])
  const sql = postgres(urlRadio, { max: 1, onnotice: () => {} })
  const [m] = await sql`select count(*)::int as n from radio.migracoes`
  assert.equal(m.n, migracoes().length)
  await sql`update radio.migracoes set sha = 'outro' where nome = '0000_fundacao.sql'`
  await assert.rejects(migrar(urlRadio), /mudou/)
  await sql`update radio.migracoes set sha = ${migracoes()[0].sha} where nome = '0000_fundacao.sql'`
  await sql.end()
})

test('gate: sem a claim do rádio, página neutra, recurso 404 e API 401', { skip: pular }, async () => {
  const fora = sessao('sub-fora', 'Fora', ['maestro'])
  const p = await chamar('pagina', 'GET', fora)
  assert.equal(p.statusCode, 200)
  assert.match(p.corpo, /Página <\/span><b>indisponível/)
  assert.doesNotMatch(p.corpo, /Rádio/)
  assert.match((await chamar('pagina', 'GET', null)).corpo, /indisponível/)
  assert.equal((await chamar('recurso', 'GET', fora, null, '/api/recurso?f=app.js')).statusCode, 404)
  assert.equal((await chamar('diarias', 'GET', fora)).statusCode, 401)
  assert.equal((await chamar('batida', 'POST', null, { diaria: 'aaaaaaaaaaaa', peer: 'a'.repeat(24) })).statusCode, 401)
  // modo local nunca liga com o login configurado nem fora de localhost
  process.env.RADIO_LOCAL = '1'
  assert.equal((await chamar('local', 'POST', null, { nome: 'Teste' })).statusCode, 404)
  delete process.env.RADIO_LOCAL
  // com a claim: o app
  const dentro = sessao('sub-dentro', 'Dentro')
  assert.match((await chamar('pagina', 'GET', dentro)).corpo, /Segure para falar/)
  const js = await chamar('recurso', 'GET', dentro, null, '/api/recurso?f=app.js')
  assert.equal(js.statusCode, 200)
  assert.equal((await chamar('recurso', 'GET', dentro, null, '/api/recurso?f=../api/_zro.js')).statusCode, 404)
})

test('diária: criar, entrar pelo código, função, presença e isolamento', { skip: pular }, async () => {
  const ana = sessao('sub-ana', 'Ana')
  const bia = sessao('sub-bia', 'Bia')
  const caio = sessao('sub-caio', 'Caio')

  const c = await chamar('diarias', 'POST', ana, { acao: 'criar', nome: 'Comercial · dia 1' })
  assert.equal(c.statusCode, 201)
  const d = c.corpo.diaria
  assert.match(d.codigo, /^[A-HJ-NP-Z2-9]{6}$/)
  assert.equal(d.dono, true)
  assert.equal(d.funcao, 'direcao')

  // Bia ainda não está: não vê a diária nem bate
  assert.equal((await chamar('diarias', 'GET', bia)).corpo.diarias.length, 0)
  assert.equal((await chamar('batida', 'POST', bia, { diaria: d.id, peer: 'b'.repeat(24) })).statusCode, 403)
  assert.equal((await chamar('diarias', 'POST', bia, { acao: 'entrar', codigo: 'ZZZZZZ' })).statusCode, 404)

  const e = await chamar('diarias', 'POST', bia, { acao: 'entrar', codigo: d.codigo.toLowerCase() })
  assert.equal(e.statusCode, 200)
  assert.equal(e.corpo.diaria.dono, false)
  assert.equal((await chamar('diarias', 'POST', bia, { acao: 'funcao', diaria: d.id, funcao: 'som' })).statusCode, 200)
  assert.equal((await chamar('diarias', 'POST', bia, { acao: 'funcao', diaria: d.id, funcao: 'diretor' })).statusCode, 400)

  // presença: os dois se veem; Caio (fora) não
  const pa = 'a'.repeat(24)
  const pb = 'b'.repeat(24)
  await chamar('batida', 'POST', ana, { diaria: d.id, peer: pa })
  const bb = await chamar('batida', 'POST', bia, { diaria: d.id, peer: pb })
  assert.equal(bb.statusCode, 200)
  assert.deepEqual(bb.corpo.pessoas.map((p) => [p.nome, p.funcao, p.eu]), [
    ['Ana', 'direcao', false],
    ['Bia', 'som', true],
  ])
  assert.equal(bb.corpo.eu.podeAvisar, false)
  assert.equal((await chamar('batida', 'POST', caio, { diaria: d.id, peer: 'c'.repeat(24) })).statusCode, 403)

  // sinal: Ana → Bia chega só para a Bia, uma vez
  await chamar('batida', 'POST', ana, { diaria: d.id, peer: pa, sinais: [{ para: pb, tipo: 'oferta', dados: { sdp: 'v=0 teste' } }] })
  const s1 = await chamar('batida', 'POST', bia, { diaria: d.id, peer: pb })
  assert.deepEqual(s1.corpo.sinais, [{ de: pa, tipo: 'oferta', dados: { sdp: 'v=0 teste' } }])
  assert.deepEqual((await chamar('batida', 'POST', bia, { diaria: d.id, peer: pb })).corpo.sinais, [])
  // sinal para aparelho que não está na diária não grava
  await chamar('batida', 'POST', ana, { diaria: d.id, peer: pa, sinais: [{ para: 'c'.repeat(24), tipo: 'oferta', dados: { sdp: 'x' } }] })
  const sql = postgres(urlRadio, { max: 1, onnotice: () => {} })
  assert.equal((await sql`select count(*)::int as n from radio.sinais`)[0].n, 0)

  // aviso: Ana (dona) manda; Bia (Som) não; quem bate depois recebe
  const visto = s1.corpo.ultimoAviso
  const av = await chamar('aviso', 'POST', ana, { diaria: d.id, tipo: 'acao' })
  assert.equal(av.statusCode, 201)
  assert.equal((await chamar('aviso', 'POST', bia, { diaria: d.id, tipo: 'corta' })).statusCode, 403)
  const comAviso = await chamar('batida', 'POST', bia, { diaria: d.id, peer: pb, aviso: visto })
  assert.deepEqual(comAviso.corpo.avisos, [{ id: av.corpo.aviso.id, tipo: 'acao', de: 'Ana' }])
  // Bia na Direção passa a poder
  await chamar('diarias', 'POST', bia, { acao: 'funcao', diaria: d.id, funcao: 'direcao' })
  assert.equal((await chamar('aviso', 'POST', bia, { diaria: d.id, tipo: 'corta' })).statusCode, 201)

  // direto no banco, como radio_app: Caio não lê nada; Bia não vira dona nem se põe em diária alheia
  const como = (sub, fn) =>
    sql.begin(async (tx) => {
      await tx`select set_config('radio.user_sub', ${sub}, true)`
      await tx.unsafe('set local role radio_app')
      return fn(tx)
    })
  assert.equal((await como('sub-caio', (tx) => tx`select * from radio.diarias`)).length, 0)
  assert.equal((await como('sub-caio', (tx) => tx`select * from radio.membros`)).length, 0)
  assert.equal((await como('sub-caio', (tx) => tx`select * from radio.avisos`)).length, 0)
  await assert.rejects(como('sub-bia', (tx) => tx`update radio.membros set papel = 'dono' where user_sub = 'sub-bia'`), /permission denied/)
  await assert.rejects(como('sub-caio', (tx) => tx`insert into radio.membros (diaria_id, user_sub, nome, papel) values (${d.id}, 'sub-caio', 'Caio', 'dono')`), /row-level security/)
  await assert.rejects(como('sub-caio', (tx) => tx`insert into radio.avisos (diaria_id, tipo, de_sub, de_nome) values (${d.id}, 'acao', 'sub-caio', 'Caio')`), /row-level security/)
  assert.equal((await como('sub-bia', (tx) => tx`delete from radio.diarias where id = ${d.id}`)).count, 0)
  await sql.end()
})
