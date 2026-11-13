// O chão do banco num Postgres de verdade, montado como no Supabase: o administrador cria o papel `foto` (login, dono
// do schema) e o `foto_app` (sem login); o migrador roda como `foto`. Confere a migração (não repete, recusa arquivo
// aplicado que mudou, aplica arquivo novo) e os papéis: `comoPessoa` vira foto_app, sabe quem é a pessoa e a
// organização, e não é dono de nada. As tabelas (e o isolamento por RLS de cada uma) chegam a partir da 0001.

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import postgres from 'postgres'
import { semPostgres, subirPostgres } from './banco-apoio.js'

const EXIGIR = process.env.FOTO_EXIGIR === '1'
const pular = semPostgres
const SEGREDO = 'segredo-de-teste-que-so-existe-aqui'
let pg, urlFoto, banco, mig, z, primeira

before(async () => {
  if (pular) return
  pg = await subirPostgres()
  const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
  await admin.unsafe(`create role foto login password 'teste'; create role foto_app nologin; grant foto_app to foto with admin option; create schema foto authorization foto;`)
  await admin.end()
  urlFoto = pg.url.replace('postgres://postgres@', 'postgres://foto:teste@')
  process.env.ZRO_CLIENT_ID = 'foto-web'
  process.env.ZRO_CLIENT_SECRET = SEGREDO
  process.env.FOTO_DATABASE_URL = urlFoto
  delete process.env.FOTO_LOCAL
  mig = await import('../scripts/migrar.mjs')
  primeira = await mig.migrar(urlFoto)
  banco = await import('../api/_banco.js')
  z = await import('../api/_zro.js')
})
after(async () => {
  await banco?.fecharBanco()
  await pg?.fechar()
  delete process.env.FOTO_DATABASE_URL
})

test('Postgres é exigido no CI', { skip: !EXIGIR }, () => {
  assert.equal(semPostgres, false, 'FOTO_EXIGIR=1 e não há Postgres na máquina')
})

test('migração: aplica em ordem, não repete e registra o sha256 de cada arquivo', { skip: pular }, async () => {
  const todas = mig.migracoes()
  assert.equal(todas[0].nome, '0000_fundacao.sql')
  assert.deepEqual(
    todas.map((m) => m.nome),
    todas.map((m) => m.nome).sort(),
  )
  // a primeira rodada (no before, num banco só com o schema e os papéis) aplicou tudo
  assert.deepEqual(
    primeira,
    todas.map((m) => m.nome),
  )
  // de novo: nada a aplicar
  assert.deepEqual(await mig.migrar(urlFoto), [])
  assert.deepEqual(await mig.migrar(urlFoto), [])
  const sql = postgres(urlFoto, { max: 1, onnotice: () => {} })
  try {
    const linhas = await sql`select nome, sha from foto.migracoes order by nome`
    assert.deepEqual(
      linhas.map((l) => [l.nome, l.sha]),
      todas.map((m) => [m.nome, m.sha]),
    )
  } finally {
    await sql.end()
  }
})

test('migração: recusa arquivo já aplicado que mudou; arquivo novo entra; nome fora do padrão é ignorado', { skip: pular }, async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'foto-migracoes-'))
  const sql = postgres(urlFoto, { max: 1, onnotice: () => {} })
  try {
    cpSync(mig.PASTA, pasta, { recursive: true })
    const antes = (await sql`select count(*)::int as n from foto.migracoes`)[0].n
    // mesmo conteúdo em outra pasta: nada a aplicar
    assert.deepEqual(await mig.migrar(urlFoto, { pasta }), [])
    // um espaço a mais já muda o sha256: recusa e não aplica nada
    const original = readFileSync(join(pasta, '0000_fundacao.sql'), 'utf8')
    writeFileSync(join(pasta, '0000_fundacao.sql'), `${original}\n-- mexida depois de aplicada\n`)
    writeFileSync(join(pasta, '9000_nova.sql'), 'create table foto.teste_migracao (id int primary key);\n')
    await assert.rejects(mig.migrar(urlFoto, { pasta }), /0000_fundacao\.sql já foi aplicada e mudou: crie um arquivo novo/)
    assert.equal((await sql`select count(*)::int as n from foto.migracoes`)[0].n, antes)
    assert.equal((await sql`select to_regclass('foto.teste_migracao') as t`)[0].t, null)
    // desfeita a mexida, o arquivo novo entra, uma vez só
    writeFileSync(join(pasta, '0000_fundacao.sql'), original)
    writeFileSync(join(pasta, 'rascunho.sql'), 'select 1/0;\n')
    writeFileSync(join(pasta, '9001_Maiuscula.sql'), 'select 1/0;\n')
    writeFileSync(join(pasta, '9002_sem_extensao'), 'select 1/0;\n')
    assert.deepEqual(await mig.migrar(urlFoto, { pasta }), ['9000_nova.sql'])
    assert.deepEqual(await mig.migrar(urlFoto, { pasta }), [])
    assert.equal((await sql`select count(*)::int as n from pg_tables where schemaname = 'foto' and tablename = 'teste_migracao'`)[0].n, 1)
    // migração que falha não deixa nada pela metade nem fica registrada
    writeFileSync(join(pasta, '9003_quebrada.sql'), 'create table foto.pela_metade (id int);\nselect 1/0;\n')
    await assert.rejects(mig.migrar(urlFoto, { pasta }))
    assert.equal((await sql`select to_regclass('foto.pela_metade') as t`)[0].t, null)
    assert.equal((await sql`select count(*)::int as n from foto.migracoes where nome = '9003_quebrada.sql'`)[0].n, 0)
  } finally {
    // o banco volta ao que as migrações de verdade deixam
    await sql`drop table if exists foto.teste_migracao`
    await sql`delete from foto.migracoes where nome like '9%'`
    await sql.end()
    rmSync(pasta, { recursive: true, force: true })
  }
  assert.deepEqual(await mig.migrar(urlFoto), [])
})

test('papéis: foto_app não entra sozinho, não é dono e não cria nada; o público não usa o schema', { skip: pular }, async () => {
  const sql = postgres(urlFoto, { max: 1, onnotice: () => {} })
  try {
    const [app] = await sql`select rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb from pg_roles where rolname = 'foto_app'`
    assert.deepEqual({ ...app }, { rolcanlogin: false, rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false })
    const [dono] = await sql`select rolsuper, rolbypassrls from pg_roles where rolname = 'foto'`
    assert.deepEqual({ ...dono }, { rolsuper: false, rolbypassrls: false })
    const [p] = await sql`select
      has_schema_privilege('foto_app', 'foto', 'usage') as app_usa,
      has_schema_privilege('foto_app', 'foto', 'create') as app_cria,
      has_schema_privilege('public', 'foto', 'usage') as publico_usa,
      has_function_privilege('foto_app', 'foto.sub()', 'execute') as app_sub,
      has_function_privilege('foto_app', 'foto.org()', 'execute') as app_org,
      has_function_privilege('public', 'foto.sub()', 'execute') as publico_sub,
      has_table_privilege('foto_app', 'foto.migracoes', 'select') as app_le_migracoes,
      (select nspowner::regrole::text from pg_namespace where nspname = 'foto') as dono`
    assert.deepEqual({ ...p }, { app_usa: true, app_cria: false, publico_usa: false, app_sub: true, app_org: true, publico_sub: false, app_le_migracoes: false, dono: 'foto' })
    // sem pessoa na transação, ninguém: as políticas que usam foto.sub() não deixam passar linha nenhuma
    const [vazio] = await sql`select foto.sub() as sub, foto.org() as org`
    assert.deepEqual({ ...vazio }, { sub: null, org: null })
    // entrar direto como foto_app não dá
    const direto = postgres(urlFoto.replace('foto:teste@', 'foto_app:teste@'), { max: 1, onnotice: () => {}, connect_timeout: 5 })
    await assert.rejects(direto`select 1`)
    await direto.end({ timeout: 1 }).catch(() => {})
  } finally {
    await sql.end()
  }
})

test('comoPessoa: assume foto_app, com a pessoa e a organização da sessão, só dentro da transação', { skip: pular }, async () => {
  const lia = await banco.comoPessoa({ sub: 'zro-lia', org: 'org-1' }, async (tx) => (await tx`select current_user as papel, foto.sub() as sub, foto.org() as org`)[0])
  assert.deepEqual({ ...lia }, { papel: 'foto_app', sub: 'zro-lia', org: 'org-1' })
  const rui = await banco.comoPessoa({ sub: 'zro-rui' }, async (tx) => (await tx`select current_user as papel, foto.sub() as sub, foto.org() as org`)[0])
  assert.deepEqual({ ...rui }, { papel: 'foto_app', sub: 'zro-rui', org: null })
  // o contexto morre com a transação: a conexão seguinte (a mesma do pool) não herda pessoa nem papel
  const [depois] = await banco.banco()`select current_user as papel, foto.sub() as sub, foto.org() as org`
  assert.deepEqual({ ...depois }, { papel: 'foto', sub: null, org: null })
  // foto_app não é dono: não lê o registro das migrações, não cria tabela, não troca de papel
  await assert.rejects(
    banco.comoPessoa({ sub: 'zro-lia' }, (tx) => tx`select * from foto.migracoes`),
    /permission denied/,
  )
  await assert.rejects(
    banco.comoPessoa({ sub: 'zro-lia' }, (tx) => tx`create table foto.minha (id int)`),
    /permission denied/,
  )
  await assert.rejects(
    banco.comoPessoa({ sub: 'zro-lia' }, (tx) => tx`drop function foto.sub()`),
    /must be owner/,
  )
  // sub e org vêm conferidos: nada de vazio, de tipo errado ou gigante
  for (const ruim of [{ sub: '' }, { sub: null }, { sub: 42 }, { sub: 'a'.repeat(201) }, { sub: 'zro-lia', org: 7 }, { sub: 'zro-lia', org: 'o'.repeat(101) }]) {
    await assert.rejects(
      banco.comoPessoa(ruim, (tx) => tx`select 1`),
      /comoPessoa/,
    )
  }
  // sub com aspas vai como valor, nunca como SQL
  const feio = `x'; drop schema foto cascade; --`
  const r = await banco.comoPessoa({ sub: feio }, async (tx) => (await tx`select foto.sub() as sub`)[0])
  assert.equal(r.sub, feio)
})

test('rota da pessoa com o banco: roda como foto_app, com a organização da sessão; saúde conta as migrações', { skip: pular }, async () => {
  const { rota } = await import('../api/_rota.js')
  const saude = (await import('../api/foto/saude.js')).default
  const resposta = () => {
    const r = { statusCode: 0, headers: {} }
    r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v)
    r.end = (c) => (r.corpo = c ? JSON.parse(String(c)) : null)
    return r
  }
  const cookie = (apps) => `foto_conta=${z.selar(z.COOKIE_CONTA, { sub: 'zro-lia', nome: 'Lia', apps, org: { id: 'org-9', nome: 'Estúdio', papel: 'owner' } }, 3600)}`
  const pedido = (metodo, apps, corpo) => ({ method: metodo, url: '/api/foto/teste', body: corpo, headers: { host: 'foto.absolutezro.com', 'x-forwarded-proto': 'https', cookie: cookie(apps), origin: 'https://foto.absolutezro.com' } })
  const quem = rota({
    GET: async (tx, p) => ({ status: 200, corpo: { ...(await tx`select current_user as papel, foto.sub() as sub, foto.org() as org`)[0], pessoa: p.sub } }),
    POST: async (tx, p, corpo) => ({ status: 201, corpo: { eco: corpo.nome, sub: (await tx`select foto.sub() as sub`)[0].sub } }),
  })
  const r = resposta()
  await quem(pedido('GET', ['foto']), r)
  assert.equal(r.statusCode, 200)
  assert.deepEqual(r.corpo, { papel: 'foto_app', sub: 'zro-lia', org: 'org-9', pessoa: 'zro-lia' })
  const r2 = resposta()
  await quem(pedido('POST', ['foto'], { nome: 'Casamento', sub: 'zro-outra' }), r2)
  assert.deepEqual([r2.statusCode, r2.corpo], [201, { eco: 'Casamento', sub: 'zro-lia' }])
  // sem a claim do app, a rota nem chega ao banco
  const r3 = resposta()
  await quem(pedido('GET', ['radio']), r3)
  assert.equal(r3.statusCode, 401)

  const s = resposta()
  await saude({ method: 'GET', url: '/api/foto/saude', headers: {} }, s)
  assert.deepEqual(s.corpo, { ok: true, migracoes: mig.migracoes().length })
  // sem a variável do banco: { ok: false }, sem erro e sem dizer nada do app
  const url = process.env.FOTO_DATABASE_URL
  delete process.env.FOTO_DATABASE_URL
  try {
    const s2 = resposta()
    await saude({ method: 'GET', url: '/api/foto/saude', headers: {} }, s2)
    assert.deepEqual(s2.corpo, { ok: false })
    const r4 = resposta()
    await quem(pedido('GET', ['foto']), r4)
    assert.equal(r4.statusCode, 503)
  } finally {
    process.env.FOTO_DATABASE_URL = url
  }
})
