// A limpeza agendada (api/cron/limpar.js e api/cron/_limpeza.js) num Postgres temporário com a pasta local de prévias.
// Confere:
//   - sem CRON_SECRET: 503 e nada muda; segredo errado ou ausente: 401; outro método: 405;
//   - com o segredo: a galeria sem link vivo há 30 dias perde as prévias, o evento vencido perde vetores e prévias, o
//     rascunho parado há 14 dias perde as prévias (a ficha fica) e os avisos velhos saem; o que está vivo fica;
//   - de novo: nada muda (idempotente);
//   - sem armazenamento: os vetores do evento vencido saem mesmo assim; as prévias esperam;
//   - o corpo e o log só têm contagens (nenhum id, nome ou contato).

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import postgres from 'postgres'
import { semPostgres, subirPostgres } from './banco-apoio.js'

const EXIGIR = process.env.FOTO_EXIGIR === '1'
const pular = semPostgres
const SEGREDO = 'segredo-do-agendamento-que-so-existe-aqui'
const LIA = { sub: 'zro-lia', org: 'org-1' }

let pg, urlFoto, dono, banco, link, arquivos, rotaCron, limpeza, pasta
const antes = { ...process.env }

const sha256 = (b) => createHash('sha256').update(b).digest('hex')
function jpeg(semente, tamanho = 600) {
  const corpo = Buffer.alloc(tamanho - 24)
  for (let i = 0; i < corpo.length; i++) corpo[i] = (semente * 31 + i * 7) % 251
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'),
    Buffer.from([0xff, 0xdb]),
    corpo,
    Buffer.from([0xff, 0xd9]),
  ])
}
const resposta = () => {
  const r = { statusCode: 0, headers: {} }
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v)
  r.end = (c) => (r.corpo = c ? JSON.parse(String(c)) : null)
  return r
}
async function cron({ segredo = SEGREDO, metodo = 'GET', cabecalho } = {}) {
  const r = resposta()
  const headers = { host: 'foto.absolutezro.com', ...(cabecalho ?? (segredo ? { authorization: `Bearer ${segredo}` } : {})) }
  await rotaCron({ method: metodo, url: '/api/cron/limpar', headers }, r)
  return r
}
const existe = (chave) => existsSync(join(pasta, chave))
/** Desliga as guardas de uma tabela só durante `fn` (o teste envelhece linhas como dono). */
const semGuardas = (fn) =>
  dono.begin(async (tx) => {
    for (const [t, g] of [
      ['links', 'links_guarda'],
      ['galerias', 'galerias_guarda'],
    ])
      await tx.unsafe(`alter table foto.${t} disable trigger ${g}`)
    await fn(tx)
    for (const [t, g] of [
      ['links', 'links_guarda'],
      ['galerias', 'galerias_guarda'],
    ])
      await tx.unsafe(`alter table foto.${t} enable trigger ${g}`)
  })

/** Uma galeria da Lia com `n` fotos e as prévias na pasta. `estado`: 'rascunho' ou 'publicada' (com link). */
async function galeria({ n = 2, estado = 'publicada', nome = 'Casamento Ana & Rui' } = {}) {
  const token = link.novoToken()
  const g = await banco.comoPessoa(LIA, async (tx) => {
    const [gal] = await tx`insert into foto.galerias ${tx({ nome, fotografo: 'Lia', contratadas: 2 })} returning id`
    const linhas = Array.from({ length: n }, (_, i) => {
      const b = jpeg(i + 1)
      return {
        galeria: gal.id,
        foto_id: `cat-${i + 1}`,
        nome: `IMG_${i + 1}.CR3`,
        ordem: i,
        largura: 1600,
        altura: 1067,
        tipo: 'image/jpeg',
        tamanho: b.length,
        sha256: sha256(b),
      }
    })
    await tx`insert into foto.galeria_fotos ${tx(linhas)}`
    await tx`update foto.galeria_fotos set enviada_em = now() where galeria = ${gal.id}`
    if (estado === 'publicada') {
      await tx`update foto.galerias set estado = 'publicada' where id = ${gal.id}`
      await tx`insert into foto.links ${tx({ galeria: gal.id, token_hash: link.hashToken(token), expira_em: new Date(Date.now() + 7 * 86400000) })}`
    }
    return gal
  })
  const fotos = await dono`select id, chave from foto.galeria_fotos where galeria = ${g.id} order by ordem`
  const arm = arquivos.armazenamento()
  for (const f of fotos) await arm.gravar(f.chave, jpeg(1), 'image/jpeg')
  return { id: g.id, token, chaves: fotos.map((f) => f.chave) }
}

/** Um evento da Lia, publicado, com uma foto (prévia na pasta) e uma pessoa que pediu para ser achada. */
async function evento({ vencido }) {
  const [e] = await dono`insert into foto.eventos ${dono({
    dono: LIA.sub,
    organizacao: LIA.org,
    nome: 'Formatura',
    prazo: new Date(Date.now() + (vencido ? -86400000 : 7 * 86400000)),
    estado: 'publicado',
  })} returning id`
  const b = jpeg(9)
  const [f] = await dono`insert into foto.evento_fotos ${dono({
    evento: e.id,
    foto_id: 'cat-9',
    nome: 'IMG_9.CR3',
    largura: 1600,
    altura: 1067,
    tipo: 'image/jpeg',
    tamanho: b.length,
    sha256: sha256(b),
    enviada_em: new Date(),
  })} returning id, chave`
  await arquivos.armazenamento().gravar(f.chave, b, 'image/jpeg')
  await dono`insert into foto.evento_pessoas ${dono({ evento: e.id, chave_hash: sha256(`p-${e.id}`), v1: Buffer.alloc(128, 3) })}`
  return { id: e.id, chave: f.chave }
}

before(async () => {
  if (pular) return
  pg = await subirPostgres()
  const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
  await admin.unsafe(
    `create role foto login password 'teste'; create role foto_app nologin; grant foto_app to foto with admin option; create schema foto authorization foto;`,
  )
  await admin.end()
  urlFoto = pg.url.replace('postgres://postgres@', 'postgres://foto:teste@')
  pasta = mkdtempSync(join(tmpdir(), 'foto-cron-'))
  process.env.ZRO_CLIENT_ID = 'foto-web'
  process.env.ZRO_CLIENT_SECRET = 'segredo-de-teste-que-so-existe-aqui'
  process.env.FOTO_DATABASE_URL = urlFoto
  process.env.FOTO_ARQUIVOS_DIR = pasta
  for (const v of ['FOTO_LOCAL', 'FOTO_S3_ENDPOINT', 'FOTO_S3_BUCKET', 'FOTO_S3_KEY_ID', 'FOTO_S3_SECRET', 'VERCEL', 'CRON_SECRET']) delete process.env[v]
  await (await import('../scripts/migrar.mjs')).migrar(urlFoto)
  dono = postgres(urlFoto, { max: 2, onnotice: () => {} })
  banco = await import('../api/_banco.js')
  link = await import('../api/_link.js')
  arquivos = await import('../api/_arquivos.js')
  rotaCron = (await import('../api/cron/limpar.js')).default
  limpeza = await import('../api/cron/_limpeza.js')
})
after(async () => {
  await dono?.end({ timeout: 5 })
  await banco?.fecharBanco()
  await pg?.fechar()
  if (pasta) rmSync(pasta, { recursive: true, force: true })
  for (const k of ['ZRO_CLIENT_ID', 'ZRO_CLIENT_SECRET', 'FOTO_DATABASE_URL', 'FOTO_ARQUIVOS_DIR', 'CRON_SECRET']) {
    if (antes[k] === undefined) delete process.env[k]
    else process.env[k] = antes[k]
  }
})

test('Postgres é exigido no CI', { skip: !EXIGIR }, () => {
  assert.equal(semPostgres, false, 'FOTO_EXIGIR=1 e não há Postgres na máquina')
})

test('vercel.json agenda a limpeza uma vez por dia, de madrugada em Brasília, num minuto quebrado', async () => {
  const { readFileSync } = await import('node:fs')
  const c = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const [agenda] = c.crons
  assert.equal(c.crons.length, 1)
  assert.equal(agenda.path, '/api/cron/limpar')
  const [minuto, hora, ...resto] = agenda.schedule.split(' ')
  assert.deepEqual(resto, ['*', '*', '*'])
  assert.ok(Number(minuto) % 5 !== 0, 'minuto quebrado')
  const brasilia = (Number(hora) - 3 + 24) % 24
  assert.ok(brasilia >= 1 && brasilia <= 5, `madrugada em Brasília (${brasilia} h)`)
})

test('a limpeza agendada: sem segredo não roda; com ele limpa o vencido, deixa o vivo e não muda nada na segunda vez', { skip: pular }, async () => {
  const viva = await galeria()
  const vencida = await galeria({ nome: 'Ensaio Rui' })
  const rascunhoParado = await galeria({ estado: 'rascunho', nome: 'Rascunho velho' })
  const rascunhoNovo = await galeria({ estado: 'rascunho' })
  const eVencido = await evento({ vencido: true })
  const eVivo = await evento({ vencido: false })
  // o cliente enviou na viva (aviso novo, fica) e na vencida (aviso lido há 40 dias, sai)
  for (const g of [viva, vencida]) {
    const [f] = await dono`select id from foto.galeria_fotos where galeria = ${g.id} order by ordem limit 1`
    const th = link.hashToken(g.token)
    await link.comoLink((tx) => tx`select foto.link_escolher(${th}, true, ${f.id}::uuid, true)`)
    const [r] = await link.comoLink((tx) => tx`select foto.link_enviar(${th}, true, ${g === viva ? 'Ana Cliente' : 'Rui Cliente'}) as r`)
    assert.equal(r.r.ok, true, JSON.stringify(r.r))
  }
  await dono`update foto.avisos set lido_em = now() - interval '40 days' where galeria = ${vencida.id}`
  // o banco não deixa criar o passado: o teste envelhece as linhas como dono
  await semGuardas(async (tx) => {
    await tx`update foto.links set criado_em = now() - interval '60 days', expira_em = now() - interval '45 days' where galeria = ${vencida.id}`
    await tx`update foto.galerias set atualizada_em = now() - interval '20 days' where id = ${rascunhoParado.id}`
    await tx`update foto.galeria_fotos set criada_em = now() - interval '20 days', enviada_em = now() - interval '20 days' where galeria = ${rascunhoParado.id}`
  })
  const todas = [viva, vencida, rascunhoParado, rascunhoNovo].flatMap((g) => g.chaves).concat([eVencido.chave, eVivo.chave])
  const foto = async () => ({
    arquivos: todas.filter(existe).length,
    vencida: (await dono`select estado from foto.galerias where id = ${vencida.id}`)[0].estado,
    eventos: (await dono`select id, estado from foto.eventos order by id`).map((e) => e.estado).sort(),
    pessoas: (await dono`select count(*)::int as n from foto.evento_pessoas`)[0].n,
    avisos: (await dono`select count(*)::int as n from foto.avisos`)[0].n,
  })
  const inicio = await foto()
  assert.deepEqual(inicio, { arquivos: 10, vencida: 'concluida', eventos: ['publicado', 'publicado'], pessoas: 2, avisos: 2 })

  // sem CRON_SECRET: 503, nada roda
  assert.deepEqual((await cron()).corpo, { ok: false, erro: 'sem_config' })
  assert.equal((await cron()).statusCode, 503)
  assert.deepEqual(await foto(), inicio)
  // com o segredo configurado: errado, ausente ou de outro tipo, 401; outro método, 405
  process.env.CRON_SECRET = SEGREDO
  for (const pedido of [{ segredo: 'errado' }, { segredo: null }, { cabecalho: { authorization: SEGREDO } }, { segredo: `${SEGREDO}x` }]) {
    const r = await cron(pedido)
    assert.deepEqual([r.statusCode, r.corpo], [401, { ok: false, erro: 'nao_autorizado' }], JSON.stringify(pedido))
  }
  assert.equal((await cron({ metodo: 'POST' })).statusCode, 405)
  assert.deepEqual(await foto(), inicio)

  // roda: o log só leva contagens
  const linhas = []
  const log = console.log
  console.log = (...x) => linhas.push(x.join(' '))
  let r
  try {
    r = await cron()
  } finally {
    console.log = log
  }
  assert.equal(r.statusCode, 200, JSON.stringify(r.corpo))
  assert.deepEqual(r.corpo, { ok: true, galerias: 1, eventos: 1, rascunhos: 1, avisos: 1, arquivos: 5, semArmazenamento: false, falhas: [] })
  const texto = linhas.join('\n') + JSON.stringify(r.corpo)
  for (const proibido of [viva.id, vencida.id, eVencido.id, 'Ana', 'Rui', 'Casamento', 'Formatura', 'Rascunho']) assert.ok(!texto.includes(proibido), proibido)
  assert.match(linhas.join('\n'), /^limpar: \{.*"arquivos":5/)

  // o vencido saiu; o vivo ficou
  for (const c of [...vencida.chaves, ...rascunhoParado.chaves, eVencido.chave]) assert.ok(!existe(c), c)
  for (const c of [...viva.chaves, ...rascunhoNovo.chaves, eVivo.chave]) assert.ok(existe(c), c)
  assert.deepEqual(await foto(), { arquivos: 5, vencida: 'encerrada', eventos: ['encerrado', 'publicado'], pessoas: 1, avisos: 1 })
  // o rascunho parado continua rascunho, com as fotos registradas e sem prévia (a tela oferece "Enviar as que faltam")
  const [rp] =
    await dono`select estado, arquivos_apagados_em, (select count(*)::int from foto.galeria_fotos f where f.galeria = g.id) as fotos, (select count(*)::int from foto.galeria_fotos f where f.galeria = g.id and f.enviada_em is not null) as enviadas from foto.galerias g where id = ${rascunhoParado.id}`
  assert.deepEqual({ ...rp }, { estado: 'rascunho', arquivos_apagados_em: null, fotos: 2, enviadas: 0 })
  // a ficha e a seleção da vencida ficam
  assert.equal((await dono`select count(*)::int as n from foto.envios where galeria = ${vencida.id}`)[0].n, 1)

  // de novo: nada muda
  const de_novo = await cron()
  assert.deepEqual(de_novo.corpo, { ok: true, galerias: 0, eventos: 0, rascunhos: 0, avisos: 0, arquivos: 0, semArmazenamento: false, falhas: [] })
  assert.deepEqual(await foto(), { arquivos: 5, vencida: 'encerrada', eventos: ['encerrado', 'publicado'], pessoas: 1, avisos: 1 })
  delete process.env.CRON_SECRET
})

test('sem armazenamento: os vetores do evento vencido saem mesmo assim; as prévias esperam a próxima', { skip: pular }, async () => {
  const e = await evento({ vencido: true })
  const r = await limpeza.limpar({ arm: null, log: { error: () => {} } })
  assert.deepEqual(
    { ...r, eventos: r.eventos >= 1 },
    { ok: true, galerias: 0, eventos: true, rascunhos: 0, avisos: 0, arquivos: 0, semArmazenamento: true, falhas: [] },
  )
  assert.equal((await dono`select count(*)::int as n from foto.evento_pessoas where evento = ${e.id}`)[0].n, 0)
  assert.ok(existe(e.chave))
  // com o armazenamento de volta, a prévia sai
  const depois = await limpeza.limpar({ log: { error: () => {} } })
  assert.equal(depois.arquivos, 1)
  assert.ok(!existe(e.chave))
})

test('uma etapa que falha não segura as outras e o resumo diz qual (sem detalhe)', { skip: pular }, async () => {
  await galeria({ estado: 'rascunho' })
  const parado = await galeria({ estado: 'rascunho' })
  await semGuardas(async (tx) => {
    await tx`update foto.galerias set atualizada_em = now() - interval '30 days' where id = ${parado.id}`
    await tx`update foto.galeria_fotos set criada_em = now() - interval '30 days', enviada_em = now() - interval '30 days' where galeria = ${parado.id}`
  })
  const erros = []
  const quebrado = { tipo: 'pasta', apagar: async () => Promise.reject(Object.assign(new Error('recusou /g/segredo'), { code: 'EACCES' })) }
  const r = await limpeza.limpar({ arm: quebrado, log: { error: (t) => erros.push(t) } })
  assert.deepEqual([r.ok, r.falhas], [false, ['rascunhos']])
  assert.deepEqual(erros, ['limpar: rascunhos falhou (EACCES)'])
  // nada foi marcado: a próxima rodada tenta de novo
  assert.equal((await dono`select count(*)::int as n from foto.galeria_fotos where galeria = ${parado.id} and enviada_em is not null`)[0].n, 2)
  assert.equal((await limpeza.limpar({ log: { error: () => {} } })).rascunhos, 1)
})
