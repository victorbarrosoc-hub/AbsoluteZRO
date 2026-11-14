// Avisos ao fotógrafo (db/migrations/0005_avisos.sql e api/foto/avisos.js) num Postgres temporário. Confere:
//   - a migração: RLS, nada para o público, o papel do app só lê e marca como lido; os gatilhos são do dono;
//   - o isolamento: o aviso da Lia não aparece para colega, outra organização, a mesma Lia em outra organização, quem
//     não tem organização, nem para a porta do link (sem pessoa); ninguém cria, apaga ou mexe em outra coluna;
//   - de ponta a ponta: o cliente envia pela rota do link e a visitante pede fotos pela porta do evento; o aviso nasce
//     na mesma transação, sem contato; reabrir e enviar de novo troca o aviso; marcar como lido por id, galeria,
//     evento e todos; apagar a galeria leva o aviso;
//   - sem banco: o GET responde 200 { ok: false } (a casca consulta sozinha), o POST 503; sem sessão, 401.

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import postgres from 'postgres'
import { semPostgres, subirPostgres } from './banco-apoio.js'

const EXIGIR = process.env.FOTO_EXIGIR === '1'
const pular = semPostgres
const SEGREDO = 'segredo-de-teste-que-so-existe-aqui'
const SITE = 'foto.absolutezro.com'
const LIA = { sub: 'zro-lia', org: 'org-1' }
const RUI = { sub: 'zro-rui', org: 'org-1' }
const EVA = { sub: 'zro-eva', org: 'org-2' }
const LIA_FORA = { sub: 'zro-lia', org: 'org-2' }
const ANA = { sub: 'zro-ana', org: null }
const CONTATO = 'visitante@exemplo.com'

let pg, urlFoto, dono, banco, z, link, rotaAvisos, rotaPorta, rotaGalerias, pasta
const antes = { ...process.env }

const sha256 = (b) => createHash('sha256').update(b).digest('hex')
const resposta = () => {
  const r = { statusCode: 0, headers: {} }
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v)
  r.end = (c) => (r.corpo = c ? JSON.parse(String(c)) : null)
  return r
}
const cookieDe = (p) =>
  `foto_conta=${z.selar(z.COOKIE_CONTA, { sub: p.sub, nome: 'Lia', apps: ['foto'], org: p.org ? { id: p.org, nome: 'Estúdio', papel: 'owner' } : null, lido: Math.floor(Date.now() / 1000) }, 3600)}`
async function chamar(rota, metodo, url, { pessoa = LIA, corpo, semSessao = false } = {}) {
  const r = resposta()
  const headers = { host: SITE, 'x-forwarded-proto': 'https', 'x-real-ip': '203.0.113.9', origin: `https://${SITE}`, cookie: semSessao ? '' : cookieDe(pessoa) }
  await rota({ method: metodo, url, headers, body: corpo ?? (metodo === 'GET' ? undefined : {}) }, r)
  return r
}
const avisos = (metodo = 'GET', opcoes) => chamar(rotaAvisos, metodo, '/api/foto/avisos', opcoes)
const naoLidos = async (p = LIA) => (await avisos('GET', { pessoa: p })).corpo

/** Uma galeria publicada da Lia, com `n` fotos e link. */
async function publicada(n = 3) {
  const token = link.novoToken()
  const g = await banco.comoPessoa(LIA, async (tx) => {
    const [gal] =
      await tx`insert into foto.galerias ${tx({ nome: 'Casamento Ana & Rui', fotografo: 'Lia', contratadas: 2, permite_extras: true })} returning id`
    const linhas = Array.from({ length: n }, (_, i) => ({
      galeria: gal.id,
      foto_id: `cat-${i}`,
      nome: `IMG_${i}.CR3`,
      ordem: i,
      largura: 1600,
      altura: 1067,
      tipo: 'image/jpeg',
      tamanho: 600,
      sha256: sha256(`f${i}`),
    }))
    const fotos = await tx`insert into foto.galeria_fotos ${tx(linhas)} returning id`
    await tx`update foto.galeria_fotos set enviada_em = now() where galeria = ${gal.id}`
    await tx`update foto.galerias set estado = 'publicada' where id = ${gal.id}`
    await tx`insert into foto.links ${tx({ galeria: gal.id, token_hash: link.hashToken(token), expira_em: new Date(Date.now() + 7 * 86400000) })}`
    return { id: gal.id, fotos: fotos.map((f) => f.id) }
  })
  return { ...g, token }
}
/** O cliente escolhe as `k` primeiras e envia, pelas rotas do link (como a página faz). */
async function clienteEnvia(g, k, nome = 'Ana Cliente') {
  for (const foto of g.fotos.slice(0, k)) {
    const r = await chamar(rotaPorta, 'POST', '/api/link/porta?acao=escolher', { semSessao: true, corpo: { token: g.token, foto, escolhida: true } })
    assert.equal(r.statusCode, 200, JSON.stringify(r.corpo))
  }
  const r = await chamar(rotaPorta, 'POST', '/api/link/porta?acao=enviar', { semSessao: true, corpo: { token: g.token, nome } })
  assert.equal(r.statusCode, 200, JSON.stringify(r.corpo))
}
/** Um evento publicado da Lia com 2 fotos e link vivo. Devolve { id, fotos, th }. */
async function evento() {
  const [e] =
    await dono`insert into foto.eventos ${dono({ dono: LIA.sub, organizacao: LIA.org, nome: 'Formatura 2026', prazo: new Date(Date.now() + 7 * 86400000), estado: 'publicado' })} returning id`
  const fotos = []
  for (let i = 0; i < 2; i++) {
    const [f] =
      await dono`insert into foto.evento_fotos ${dono({ evento: e.id, foto_id: `ev-${i}`, nome: `E_${i}.CR3`, largura: 1600, altura: 1067, tipo: 'image/jpeg', tamanho: 600, sha256: sha256(`e${i}`), enviada_em: new Date() })} returning id`
    fotos.push(f.id)
  }
  const th = link.hashToken(link.novoToken())
  await dono`insert into foto.evento_links ${dono({ evento: e.id, token_hash: th })}`
  return { id: e.id, fotos, th }
}
const pedir = (e, fotos, nome = 'Bia Visitante') =>
  link.comoLink(async (tx) => (await tx`select foto.evento_pedir(${e.th}, true, ${nome}, ${CONTATO}, ${fotos}::uuid[]) as r`)[0].r)

before(async () => {
  if (pular) return
  pg = await subirPostgres()
  const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
  await admin.unsafe(
    `create role foto login password 'teste'; create role foto_app nologin; grant foto_app to foto with admin option; create schema foto authorization foto;`,
  )
  await admin.end()
  urlFoto = pg.url.replace('postgres://postgres@', 'postgres://foto:teste@')
  pasta = mkdtempSync(join(tmpdir(), 'foto-avisos-'))
  process.env.ZRO_CLIENT_ID = 'foto-web'
  process.env.ZRO_CLIENT_SECRET = SEGREDO
  process.env.FOTO_DATABASE_URL = urlFoto
  process.env.FOTO_ARQUIVOS_DIR = pasta
  for (const v of ['FOTO_LOCAL', 'FOTO_SITE', 'FOTO_S3_ENDPOINT', 'FOTO_S3_BUCKET', 'FOTO_S3_KEY_ID', 'FOTO_S3_SECRET', 'VERCEL']) delete process.env[v]
  await (await import('../scripts/migrar.mjs')).migrar(urlFoto)
  dono = postgres(urlFoto, { max: 2, onnotice: () => {} })
  banco = await import('../api/_banco.js')
  z = await import('../api/_zro.js')
  link = await import('../api/_link.js')
  rotaAvisos = (await import('../api/foto/avisos.js')).default
  rotaPorta = (await import('../api/link/porta.js')).default
  rotaGalerias = (await import('../api/foto/galerias.js')).default
})
after(async () => {
  await dono?.end({ timeout: 5 })
  await banco?.fecharBanco()
  await pg?.fechar()
  if (pasta) rmSync(pasta, { recursive: true, force: true })
  for (const k of ['ZRO_CLIENT_ID', 'ZRO_CLIENT_SECRET', 'FOTO_DATABASE_URL', 'FOTO_ARQUIVOS_DIR']) {
    if (antes[k] === undefined) delete process.env[k]
    else process.env[k] = antes[k]
  }
})

test('Postgres é exigido no CI', { skip: !EXIGIR }, () => {
  assert.equal(semPostgres, false, 'FOTO_EXIGIR=1 e não há Postgres na máquina')
})

test('migração: RLS, nada para o público, o papel do app só lê e marca como lido; os gatilhos são do dono', { skip: pular }, async () => {
  const [t] =
    await dono`select c.relrowsecurity as rls, c.relforcerowsecurity as forca from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'foto' and c.relname = 'avisos'`
  assert.deepEqual({ ...t }, { rls: true, forca: false })
  const [p] = await dono`select
    has_table_privilege('public', 'foto.avisos', 'select') as publico_le,
    has_table_privilege('foto_app', 'foto.avisos', 'select') as le,
    has_table_privilege('foto_app', 'foto.avisos', 'insert') as cria,
    has_table_privilege('foto_app', 'foto.avisos', 'delete') as apaga,
    has_table_privilege('foto_app', 'foto.avisos', 'update') as muda_tudo,
    has_column_privilege('foto_app', 'foto.avisos', 'lido_em', 'update') as marca,
    has_column_privilege('foto_app', 'foto.avisos', 'dono', 'update') as muda_dono,
    has_function_privilege('foto_app', 'foto.avisos_do_envio()', 'execute') as gatilho_envio,
    has_function_privilege('foto_app', 'foto.avisos_do_pedido()', 'execute') as gatilho_pedido`
  assert.deepEqual(
    { ...p },
    { publico_le: false, le: true, cria: false, apaga: false, muda_tudo: false, marca: true, muda_dono: false, gatilho_envio: false, gatilho_pedido: false },
  )
  const fs =
    await dono`select p.proname as nome, p.prosecdef as definer, pg_get_userbyid(p.proowner) as dono from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'foto' and p.proname ~ '^avisos_' order by 1`
  assert.deepEqual(
    fs.map((f) => [f.nome, f.definer, f.dono]),
    [
      ['avisos_do_envio', true, 'foto'],
      ['avisos_do_pedido', true, 'foto'],
      ['avisos_guarda', false, 'foto'],
    ],
  )
})

test('de ponta a ponta: o cliente envia, a visitante pede, a fotógrafa vê e marca como lido', { skip: pular }, async () => {
  assert.deepEqual(await naoLidos(), { ok: true, avisos: [], naoLidos: 0 })
  const g = await publicada()
  await clienteEnvia(g, 3)
  const e = await evento()
  assert.deepEqual(await pedir(e, [e.fotos[0], e.fotos[1]]), { ok: true, fotos: 2 })

  const lista = await naoLidos()
  assert.equal(lista.naoLidos, 2)
  const [pedido, escolha] = lista.avisos
  assert.deepEqual(
    { ...escolha, id: typeof escolha.id, em: typeof escolha.em },
    { id: 'string', tipo: 'escolha', em: 'string', galeria: g.id, evento: null, nome: 'Casamento Ana & Rui', quem: 'Ana Cliente', fotos: 3 },
  )
  assert.deepEqual(
    { ...pedido, id: typeof pedido.id, em: typeof pedido.em },
    { id: 'string', tipo: 'pedido', em: 'string', galeria: null, evento: e.id, nome: 'Formatura 2026', quem: 'Bia Visitante', fotos: 2 },
  )
  // o contato de quem pediu não sai por aqui (o fotógrafo vê na lista de pedidos do evento)
  assert.ok(!JSON.stringify(lista).includes(CONTATO))

  // reabrir e o cliente enviar de novo: um aviso só para aquela galeria, o novo
  const reaberta = await chamar(rotaGalerias, 'POST', `/api/foto/galerias?id=${g.id}&acao=reabrir`)
  assert.equal(reaberta.statusCode, 200, JSON.stringify(reaberta.corpo))
  await clienteEnvia(g, 0, 'Ana de Novo')
  const depois = await naoLidos()
  assert.deepEqual(
    depois.avisos.filter((a) => a.galeria === g.id).map((a) => a.quem),
    ['Ana de Novo'],
  )
  assert.equal(depois.naoLidos, 2)
  assert.equal((await dono`select count(*)::int as n from foto.avisos where galeria = ${g.id}`)[0].n, 2)

  // marcar: por galeria, por id, por evento; a hora é do servidor e não volta
  assert.deepEqual((await avisos('POST', { corpo: { galeria: g.id } })).corpo, { ok: true, marcados: 1, naoLidos: 1 })
  assert.deepEqual((await avisos('POST', { corpo: { galeria: g.id } })).corpo, { ok: true, marcados: 0, naoLidos: 1 })
  assert.deepEqual((await avisos('POST', { corpo: { ids: [pedido.id] } })).corpo, { ok: true, marcados: 1, naoLidos: 0 })
  await pedir(e, [e.fotos[1]], 'Caio')
  await pedir(e, [e.fotos[0]], 'Duda')
  assert.deepEqual((await avisos('POST', { corpo: { evento: e.id } })).corpo, { ok: true, marcados: 2, naoLidos: 0 })
  await pedir(e, [e.fotos[0]], 'Edu')
  assert.deepEqual((await avisos('POST', { corpo: { todos: true } })).corpo, { ok: true, marcados: 1, naoLidos: 0 })
  await assert.rejects(
    banco.comoPessoa(LIA, (tx) => tx`update foto.avisos set lido_em = null, dono = 'zro-rui'`),
    /permission denied/,
  )
  const mexido = await banco.comoPessoa(LIA, (tx) => tx`update foto.avisos set lido_em = null where id = ${pedido.id} returning lido_em`)
  assert.ok(mexido[0].lido_em instanceof Date, 'lido não volta a não lido')

  // corpo errado
  for (const corpo of [{}, { ids: [] }, { ids: ['x'] }, { todos: false }, { galeria: 'x' }, { ids: [pedido.id], todos: true }, []]) {
    const r = await avisos('POST', { corpo })
    assert.equal(r.statusCode, 400, JSON.stringify(corpo))
    assert.equal(r.corpo.erro, 'campo')
  }

  // apagar a galeria leva os avisos dela
  assert.equal((await chamar(rotaGalerias, 'DELETE', `/api/foto/galerias?id=${g.id}`)).statusCode, 200)
  assert.equal((await dono`select count(*)::int as n from foto.avisos where galeria = ${g.id}`)[0].n, 0)
})

test('isolamento · avisos: só a dona, na organização em que criou; a porta do link não vê', { skip: pular }, async () => {
  const g = await publicada()
  await clienteEnvia(g, 1)
  const [a] = await dono`select id from foto.avisos where galeria = ${g.id}`
  const ve = (p) => banco.comoPessoa(p, async (tx) => (await tx`select id from foto.avisos where id = ${a.id}`).length)
  assert.equal(await ve(LIA), 1)
  for (const outra of [RUI, EVA, LIA_FORA, ANA]) {
    assert.equal(await ve(outra), 0, JSON.stringify(outra))
    assert.equal(await banco.comoPessoa(outra, async (tx) => (await tx`update foto.avisos set lido_em = now() where id = ${a.id} returning id`).length), 0)
    await assert.rejects(
      banco.comoPessoa(outra, (tx) => tx`delete from foto.avisos where id = ${a.id}`),
      /permission denied/,
    )
    await assert.rejects(
      banco.comoPessoa(
        outra,
        (tx) => tx`insert into foto.avisos (dono, organizacao, tipo, galeria, envio) values (${outra.sub}, ${outra.org}, 'escolha', ${g.id}, ${a.id})`,
      ),
      /permission denied/,
    )
    // pela rota: nada aparece, e marcar o da Lia não marca
    assert.deepEqual((await naoLidos(outra)).avisos, [])
    assert.deepEqual((await avisos('POST', { pessoa: outra, corpo: { ids: [a.id] } })).corpo, { ok: true, marcados: 0, naoLidos: 0 })
  }
  assert.equal(await link.comoLink(async (tx) => (await tx`select id from foto.avisos`).length), 0)
  assert.equal((await dono`select lido_em from foto.avisos where id = ${a.id}`)[0].lido_em, null)
})

test('sem banco o GET some sem barulho (200 { ok: false }); sem sessão, 401', { skip: pular }, async () => {
  assert.equal((await avisos('GET', { semSessao: true })).statusCode, 401)
  assert.equal((await avisos('POST', { semSessao: true, corpo: { todos: true } })).statusCode, 401)
  assert.equal((await avisos('DELETE')).statusCode, 405)
  const url = process.env.FOTO_DATABASE_URL
  delete process.env.FOTO_DATABASE_URL
  try {
    const r = await avisos('GET')
    assert.deepEqual([r.statusCode, r.corpo], [200, { ok: false, erro: 'sem_banco' }])
    assert.equal((await avisos('POST', { corpo: { todos: true } })).statusCode, 503)
    assert.equal((await avisos('GET', { semSessao: true })).statusCode, 401)
  } finally {
    process.env.FOTO_DATABASE_URL = url
  }
})
