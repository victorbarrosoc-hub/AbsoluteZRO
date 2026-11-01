// Banco do Rift num Postgres de verdade, montado como no Supabase: o administrador cria o papel `rift` (login, dono do
// schema) e o `rift_app`; o migrador roda como `rift`. Confere a migração (não aplica de novo, recusa arquivo mudado),
// o isolamento entre pessoas pelo RLS (direto no banco e pelas rotas) e as recusas das rotas.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import postgres from 'postgres'
import { semPostgres, subirPostgres } from './banco-apoio.js'

const pular = semPostgres
let pg, urlRift, z, banco, rotas

const pedido = (metodo, url, cookie, corpo) => {
  const texto = corpo ? JSON.stringify(corpo) : ''
  return Object.assign([Buffer.from(texto)][Symbol.iterator](), {
    method: metodo,
    url,
    body: corpo ?? undefined,
    headers: { host: 'rift.absolutezro.com', 'x-forwarded-proto': 'https', origin: 'https://rift.absolutezro.com', cookie: cookie ? `rf_conta=${cookie}` : '', 'content-type': 'application/json' },
  })
}
const resposta = () => {
  const r = { statusCode: 0, headers: {} }
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v)
  r.end = (c) => (r.corpo = c ? JSON.parse(c) : null)
  return r
}
const chamar = async (rota, metodo, url, cookie, corpo) => {
  const r = resposta()
  await rotas[rota](pedido(metodo, url, cookie, corpo), r)
  return r
}

before(async () => {
  if (pular) return
  pg = await subirPostgres()
  const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
  await admin.unsafe(`create role rift login password 'teste'; create role rift_app nologin; grant rift_app to rift with admin option; create schema rift authorization rift;`)
  await admin.end()
  urlRift = pg.url.replace('postgres://postgres@', 'postgres://rift:teste@')
  process.env.ZRO_CLIENT_ID = 'rift-web'
  process.env.ZRO_CLIENT_SECRET = 'segredo-de-teste-que-so-existe-aqui'
  process.env.RIFT_DATABASE_URL = urlRift
  z = await import('../api/_zro.js')
  banco = await import('../api/_banco.js')
  rotas = {
    projetos: (await import('../api/rift/projetos.js')).default,
    biblioteca: (await import('../api/rift/biblioteca.js')).default,
    exportacoes: (await import('../api/rift/exportacoes.js')).default,
  }
})
after(async () => {
  await banco?.fecharBanco()
  await pg?.fechar()
})

test('migração: aplica como o dono do schema, não repete e recusa arquivo já aplicado que mudou', { skip: pular }, async () => {
  const { migrar, PASTA } = await import('../scripts/migrar.mjs')
  assert.deepEqual(await migrar(urlRift), ['0000_fundacao.sql'])
  assert.deepEqual(await migrar(urlRift), [])
  const outra = mkdtempSync(join(tmpdir(), 'rift-mig-'))
  cpSync(PASTA, outra, { recursive: true })
  writeFileSync(join(outra, '0000_fundacao.sql'), '-- mudou\n')
  await assert.rejects(migrar(urlRift, { pasta: outra }), /já foi aplicada e mudou/)
})

const sessao = (sub, org = null) => z.selar('rf_conta', { sub, nome: sub, email: `${sub}@x.com`, org: org ? { id: org, nome: 'Org' } : null, produtos: [], lido: 0 }, 3600)
const novo = (id, nome = 'Abertura') => ({ id, nome, formato: '9:16', cadencia: '23.976', duracao: 10, tom: 30, modelo: 'logo' })

test('rotas: cada pessoa vê, muda e apaga só os próprios projetos; o RLS segura até no banco direto', { skip: pular }, async () => {
  const ana = sessao('ana', 'org1')
  const beto = sessao('beto', 'org1')
  let r = await chamar('projetos', 'POST', '/api/rift/projetos', ana, novo('anaproj1'))
  assert.equal(r.statusCode, 200, JSON.stringify(r.corpo))
  assert.deepEqual([r.corpo.projeto.largura, r.corpo.projeto.altura, r.corpo.projeto.cadencia], [1080, 1920, '23.976'], 'tamanho vem do formato, não do pedido')
  await chamar('projetos', 'POST', '/api/rift/projetos', beto, novo('betoproj1', 'Do Beto'))

  r = await chamar('projetos', 'GET', '/api/rift/projetos', ana)
  assert.deepEqual(r.corpo.projetos.map((p) => p.id), ['anaproj1'])
  r = await chamar('projetos', 'PATCH', '/api/rift/projetos?id=betoproj1', ana, { nome: 'Invadido' })
  assert.equal(r.statusCode, 404)
  r = await chamar('projetos', 'DELETE', '/api/rift/projetos?id=betoproj1', ana)
  assert.equal(r.statusCode, 404)
  r = await chamar('projetos', 'PATCH', '/api/rift/projetos?id=anaproj1', ana, { nome: 'Abertura 2', cadencia: '120' })
  assert.deepEqual([r.corpo.projeto.nome, r.corpo.projeto.cadencia], ['Abertura 2', '120'])
  // a cena do estúdio: salva no PATCH, volta no GET ?id=, fora da lista; de outra pessoa, 404; formato errado, 400
  const cena = { v: 1, camadas: { esfera: { X: [[0, -4.5], [1.2, -1.6, 'mola']] } } }
  assert.equal((await chamar('projetos', 'PATCH', '/api/rift/projetos?id=anaproj1', ana, { cena })).statusCode, 200)
  r = await chamar('projetos', 'GET', '/api/rift/projetos?id=anaproj1', ana)
  assert.deepEqual(r.corpo.projeto.cena, cena)
  assert.equal((await chamar('projetos', 'GET', '/api/rift/projetos', ana)).corpo.projetos[0].cena, undefined)
  assert.equal((await chamar('projetos', 'GET', '/api/rift/projetos?id=anaproj1', beto)).statusCode, 404)
  assert.equal((await chamar('projetos', 'PATCH', '/api/rift/projetos?id=anaproj1', ana, { cena: { v: 2 } })).statusCode, 400)
  assert.equal((await chamar('projetos', 'PATCH', '/api/rift/projetos?id=anaproj1', ana, { nome: 'Abertura 2' })).corpo.projeto.nome, 'Abertura 2')
  assert.deepEqual((await chamar('projetos', 'GET', '/api/rift/projetos?id=anaproj1', ana)).corpo.projeto.cena, cena, 'mudar o nome não apaga a cena')
  // cena do editor de camadas (v2): lista de camadas com id e tipo
  const cena2 = { v: 2, duracao: 6, camadas: [{ id: 'k1', tipo: 'texto', nome: 'Título', texto: 'Oi', props: { x: 50 }, trilhas: { x: [[0, 10, 'suave'], [1, 50, 'mola']] } }] }
  assert.equal((await chamar('projetos', 'PATCH', '/api/rift/projetos?id=anaproj1', ana, { cena: cena2 })).statusCode, 200)
  assert.deepEqual((await chamar('projetos', 'GET', '/api/rift/projetos?id=anaproj1', ana)).corpo.projeto.cena, cena2)
  assert.equal((await chamar('projetos', 'PATCH', '/api/rift/projetos?id=anaproj1', ana, { cena: { v: 2, camadas: [{ nome: 'sem id' }] } })).statusCode, 400)
  assert.equal((await chamar('projetos', 'PATCH', '/api/rift/projetos?id=anaproj1', ana, { cena: { v: 2, camadas: Array.from({ length: 101 }, (_, i) => ({ id: 'k' + i, tipo: 'forma' })) } })).statusCode, 400)

  // direto no banco, como rift_app e sem passar pela rota
  const sql = postgres(urlRift, { max: 1, onnotice: () => {} })
  const comoBeto = (fn) =>
    sql.begin(async (tx) => {
      await tx`select set_config('rift.user_sub', 'beto', true)`
      await tx.unsafe('set local role rift_app')
      return fn(tx)
    })
  const visto = await comoBeto(async (tx) => {
    const antes = await tx`select id from rift.projetos order by id`
    await tx`update rift.projetos set nome = 'x' where id = 'anaproj1'`
    return antes.map((x) => x.id)
  })
  assert.deepEqual(visto, ['betoproj1'])
  await assert.rejects(
    comoBeto((tx) => tx`insert into rift.projetos (user_sub, id, nome, formato, largura, altura, cadencia, duracao) values ('ana', 'forjado1', 'x', '16:9', 1920, 1080, '24', 5)`),
    /row-level security/,
  )
  // nem o dono do schema enxerga as linhas (RLS forçado); a conferência é com o administrador
  assert.equal((await sql`select id from rift.projetos`).length, 0)
  await sql.end()
  const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
  const [a] = await admin`select nome from rift.projetos where id = 'anaproj1'`
  assert.equal(a.nome, 'Abertura 2', 'o update do Beto não tocou no projeto da Ana')
  await admin.end()
})

test('biblioteca e exportações: só de quem criou; exportação nasce "não renderizado" e guarda o nome do projeto', { skip: pular }, async () => {
  const ana = sessao('ana', 'org1')
  const beto = sessao('beto', 'org1')
  let r = await chamar('biblioteca', 'POST', '/api/rift/biblioteca', ana, { itens: [{ id: 'arq00001', nome: 'logo.mov', tipo: 'Vídeo', ext: 'MOV', tamanho: 2048 }] })
  assert.equal(r.corpo.itens.length, 1)
  assert.equal((await chamar('biblioteca', 'GET', '/api/rift/biblioteca', beto)).corpo.itens.length, 0)
  r = await chamar('exportacoes', 'POST', '/api/rift/exportacoes', ana, { id: 'exp00001', projetoId: 'anaproj1', projeto: 'Abertura 2', formato: 'ProRes 4444', fps: '23,976', tamanho: '1920 × 1080', destino: 'DaVinci Resolve' })
  assert.equal(r.statusCode, 200, JSON.stringify(r.corpo))
  assert.deepEqual([r.corpo.item.estado, r.corpo.item.projetoId], ['nao_renderizado', 'anaproj1'])
  // o Beto não consegue prender exportação a projeto da Ana (o projeto some pelo RLS)
  r = await chamar('exportacoes', 'POST', '/api/rift/exportacoes', beto, { id: 'exp00002', projetoId: 'anaproj1', projeto: 'X', formato: 'MP4', fps: '24', tamanho: '1080 × 1080', destino: 'Só salvar' })
  assert.equal(r.corpo.item.projetoId, null)
  assert.equal((await chamar('exportacoes', 'GET', '/api/rift/exportacoes', beto)).corpo.itens.length, 1)
  // apagar o projeto deixa a exportação, sem o vínculo
  await chamar('projetos', 'DELETE', '/api/rift/projetos?id=anaproj1', ana)
  const lista = (await chamar('exportacoes', 'GET', '/api/rift/exportacoes', ana)).corpo.itens
  assert.deepEqual([lista[0].projeto, lista[0].projetoId], ['Abertura 2', null])
})

test('recusas: sem sessão 401, outro site 403, dado fora do formato 400', { skip: pular }, async () => {
  assert.equal((await chamar('projetos', 'GET', '/api/rift/projetos', null)).statusCode, 401)
  const ana = sessao('ana')
  const p = pedido('POST', '/api/rift/projetos', ana, novo('qualquer1'))
  p.headers.origin = 'https://golpe.com'
  const r = resposta()
  await rotas.projetos(p, r)
  assert.equal(r.statusCode, 403)
  assert.equal((await chamar('projetos', 'POST', '/api/rift/projetos', ana, { ...novo('qualquer2'), cadencia: '25' })).statusCode, 400)
  assert.equal((await chamar('projetos', 'POST', '/api/rift/projetos', ana, { ...novo('Maiusc!') })).statusCode, 400)
  assert.equal((await chamar('projetos', 'PATCH', '/api/rift/projetos?id=naoexiste', ana, { nome: 'x' })).statusCode, 404)
})
