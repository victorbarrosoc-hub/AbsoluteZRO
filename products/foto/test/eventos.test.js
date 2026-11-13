// Busca por rosto em evento num Postgres de verdade (temporário, montado como no Supabase: papel `foto` dono e
// `foto_app`), com as rotas de verdade (api/foto/eventos.js, api/link/evento.js, api/evento.js) e a pasta local de
// arquivos. Vetores sintéticos (normais com semente), nenhuma foto de ninguém. Confere:
//   - a migração 0003: RLS em CADA tabela nova, nada para o público, o papel do app sem nada em evento_rostos, sem
//     ler hash de token, de PIN nem a chave de quem pediu; sem pgvector, a migração segue (coluna vv só com ele);
//   - o isolamento de CADA tabela nova: outra pessoa, outra organização e a mesma pessoa em outra organização não veem
//     nem mexem;
//   - a porta estreita: link desconhecido, revogado, vencido, de evento encerrado ou em rascunho e token malformado dão
//     a mesma resposta em toda ação; PIN; limites por link e IP;
//   - busca aberta: "É você" e "Talvez" iguais aos de src/rosto/decidir.js; o vetor da busca não fica em tabela nenhuma
//     nem no log do Postgres nem no console;
//   - com consentimento: o pedido guarda só os vetores de quem pediu; o fotógrafo lê, compara, sobe as ligações; a
//     pessoa volta pela chave; reaproveita o pedido; desiste e tudo some;
//   - "não quero aparecer": confere, apaga e barra foto nova parecida;
//   - pedidos de foto; o modo errado é recusado; encerrar, apagar (cascata) e a limpeza do prazo.

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { NOME } from '../app/nome.js'
import { normalizar, quantizar, vetorParaTexto } from '../src/rosto/assinatura.js'
import { procurar } from '../src/rosto/decidir.js'
import { TEXTOS } from '../src/rosto/textos.js'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const EXIGIR = process.env.FOTO_EXIGIR === '1'
const BIN = ['/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin'].find((b) => existsSync(join(b, 'initdb')))
const pular = BIN ? false : 'sem Postgres na máquina'
const SEGREDO = 'segredo-de-teste-que-so-existe-aqui'
const SITE = 'foto.absolutezro.com'
const LIA = { sub: 'zro-lia', org: 'org-1' }
const RUI = { sub: 'zro-rui', org: 'org-1' }
const EVA = { sub: 'zro-eva', org: 'org-2' }
const LIA_FORA = { sub: 'zro-lia', org: 'org-2' }
const IP = '203.0.113.7'
const NOVAS = [
  'eventos',
  'evento_fotos',
  'evento_links',
  'evento_rostos',
  'evento_pessoas',
  'evento_ligacoes',
  'evento_remocoes',
  'evento_consentimentos',
  'evento_pedidos',
  'evento_buscas',
]
const NEUTRA = readFileSync(join(RAIZ, 'app/indisponivel.html'))

let pg, urlFoto, dono, banco, z, link, evento, rotaEventos, rotaVisitante, rotaPagina, pasta

// ───────── um Postgres que guarda o log (o vetor da busca não pode aparecer nele) ─────────

const root = typeof process.getuid === 'function' && process.getuid() === 0
const portaLivre = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })
async function subirPostgres() {
  const dir = mkdtempSync(join(tmpdir(), 'foto-pg-evento-'))
  chmodSync(dir, 0o777)
  const dados = join(dir, 'dados')
  const comoPg = (bin, args, opcoes) => (root ? ['runuser', ['-u', 'postgres', '--', join(BIN, bin), ...args], opcoes] : [join(BIN, bin), args, opcoes])
  execFileSync(...comoPg('initdb', ['-D', dados, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-locale'], { stdio: 'pipe' }))
  const porta = await portaLivre()
  // o log como no Supabase (só DDL), mais os erros com o comando que falhou
  const [cmd, args] = comoPg('postgres', [
    '-D',
    dados,
    '-p',
    String(porta),
    '-h',
    '127.0.0.1',
    '-k',
    dir,
    '-c',
    'fsync=off',
    '-c',
    'log_statement=ddl',
    '-c',
    'log_min_error_statement=error',
    '-c',
    'log_min_messages=notice',
  ])
  const proc = spawn(cmd, args, { stdio: 'pipe' })
  const estado = { log: '' }
  proc.stderr.on('data', (d) => (estado.log += d))
  for (let i = 0; i < 100 && !/ready to accept connections/.test(estado.log); i++) await new Promise((ok) => setTimeout(ok, 100))
  return {
    url: `postgres://postgres@127.0.0.1:${porta}/postgres`,
    log: () => estado.log,
    fechar: async () => {
      const saiu = new Promise((ok) => proc.once('exit', ok))
      execFileSync(...comoPg('pg_ctl', ['-D', dados, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' }))
      await saiu
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

// ───────── vetores e bytes sintéticos ─────────

function sorteio(semente) {
  let s = semente >>> 0
  const u = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const normal = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u())
  return { u, vetor: () => normalizar(Float32Array.from({ length: 128 }, normal)) }
}
const r = sorteio(2026)
function aoCosseno(base, c) {
  const ruido = r.vetor()
  let p = 0
  for (let i = 0; i < 128; i++) p += ruido[i] * base[i]
  const orto = normalizar(ruido.map((x, i) => x - p * base[i]))
  return normalizar(base.map((x, i) => c * x + Math.sqrt(1 - c * c) * orto[i]))
}
const texto = (v) => vetorParaTexto(quantizar(v))
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

// ───────── rotas como a Vercel chamaria ─────────

const cookieDe = (p) =>
  `foto_conta=${z.selar(z.COOKIE_CONTA, { sub: p.sub, nome: 'Lia', apps: ['foto'], org: p.org ? { id: p.org, nome: 'Estúdio', papel: 'owner' } : null, lido: Math.floor(Date.now() / 1000) }, 3600)}`
const resposta = () => {
  const s = { statusCode: 0, headers: {}, bruto: Buffer.alloc(0), corpo: null }
  s.setHeader = (k, v) => (s.headers[k.toLowerCase()] = v)
  s.end = (c) => {
    s.bruto = c == null ? Buffer.alloc(0) : Buffer.from(c)
    try {
      s.corpo = JSON.parse(s.bruto.toString('utf8'))
    } catch {
      s.corpo = null
    }
  }
  return s
}
async function fotografo(metodo, caminho = '', { pessoa = LIA, corpo, bytes } = {}) {
  const [id, acao, resto] = caminho.split(/[/?]/).filter(Boolean)
  const q = new URLSearchParams(resto ?? '')
  if (id) q.set('id', id)
  if (acao) q.set('acao', acao)
  const s = resposta()
  const headers = { host: SITE, 'x-forwarded-proto': 'https', cookie: cookieDe(pessoa), origin: `https://${SITE}` }
  await rotaEventos({ method: metodo, url: `/api/foto/eventos?${q}`, headers, body: bytes ?? corpo ?? (metodo === 'GET' ? undefined : {}) }, s)
  return s
}
async function visitante(acao, corpo, { ip = IP, cookie = '' } = {}) {
  const s = resposta()
  const headers = { host: SITE, 'x-forwarded-proto': 'https', 'x-real-ip': ip, cookie, origin: `https://${SITE}` }
  await rotaVisitante({ method: 'POST', url: `/api/link/evento?acao=${acao}`, headers, body: corpo }, s)
  return s
}
async function imagem(token, foto, { ip = IP, cookie = '' } = {}) {
  const s = resposta()
  await rotaVisitante(
    { method: 'GET', url: `/api/link/evento?acao=imagem&t=${token}&f=${foto}`, headers: { host: SITE, 'x-forwarded-proto': 'https', 'x-real-ip': ip, cookie } },
    s,
  )
  return s
}
async function pagina(token, consulta = '') {
  const s = resposta()
  await rotaPagina({ method: 'GET', url: `/api/evento?t=${token}${consulta}`, headers: { host: SITE, 'x-forwarded-proto': 'https', 'x-real-ip': IP } }, s)
  return s
}
const tokenDe = (endereco) => endereco.split('/e/')[1]
const provaDe = (s) => String(s.headers['set-cookie']?.[0] ?? '').split(';')[0]

/**
 * Um evento da pessoa, pelas rotas: cria, registra `n` fotos, manda as prévias e as miniaturas, grava os rostos e
 * publica. `rostos(i)` = os rostos da foto i ([{ v: Float32Array, largura, nota, colado, perfil }]). Devolve
 * { id, fotos: [id do servidor], token }.
 */
async function eventoPronto({ pessoa = LIA, modo = 'aberta', n = 4, rostos = () => [], pin = null, publicar = true } = {}) {
  const c = await fotografo('POST', '', {
    pessoa,
    corpo: { nome: 'Corrida da Serra', data: '2026-11-20', modo, prazoDias: 14, aviso: modo === 'aberta' ? TEXTOS.ativacaoAberta.versao : undefined },
  })
  assert.equal(c.statusCode, 201, JSON.stringify(c.corpo))
  const id = c.corpo.evento.id
  const registros = Array.from({ length: n }, (_, i) => {
    const b = jpeg(i + 1)
    const m = jpeg(i + 101, 300)
    return {
      fotoId: `cat-${i + 1}`,
      nome: `IMG_${i + 1}.ARW`,
      largura: 2048,
      altura: 1365,
      tipo: 'image/jpeg',
      tamanho: b.length,
      sha256: sha256(b),
      mini: { tipo: 'image/jpeg', tamanho: m.length, sha256: sha256(m) },
    }
  })
  const f = await fotografo('POST', `${id}/fotos`, { pessoa, corpo: { fotos: registros } })
  assert.equal(f.statusCode, 200, JSON.stringify(f.corpo))
  const fotos = f.corpo.fotos.map((x) => x.id)
  for (let i = 0; i < n; i++) {
    const pv = await fotografo('PUT', `${id}/arquivo?foto=${fotos[i]}&v=previa`, { pessoa, bytes: jpeg(i + 1) })
    assert.equal(pv.statusCode, 200, JSON.stringify(pv.corpo))
    assert.equal((await fotografo('PUT', `${id}/arquivo?foto=${fotos[i]}&v=mini`, { pessoa, bytes: jpeg(i + 101, 300) })).statusCode, 200)
    const lista = rostos(i).map((x) => ({ v: texto(x.v), largura: x.largura ?? 80, nota: x.nota ?? 0.9, colado: !!x.colado, perfil: !!x.perfil }))
    const g = await fotografo('POST', `${id}/rostos`, {
      pessoa,
      corpo: modo === 'aberta' ? { foto: fotos[i], rostos: lista } : { foto: fotos[i], quantos: lista.length },
    })
    assert.equal(g.statusCode, 200, JSON.stringify(g.corpo))
  }
  if (!publicar) return { id, fotos, token: null }
  const p = await fotografo('POST', `${id}/publicar`, { pessoa, corpo: pin ? { pin } : {} })
  assert.equal(p.statusCode, 201, JSON.stringify(p.corpo))
  return { id, fotos, token: tokenDe(p.corpo.endereco) }
}
const contar = async (tabela, onde = 'true') => (await dono.unsafe(`select count(*)::int as n from foto.${tabela} where ${onde}`))[0].n

before(async () => {
  if (pular) return
  pg = await subirPostgres()
  const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
  await admin.unsafe(
    `create role foto login password 'teste'; create role foto_app nologin; grant foto_app to foto with admin option; create schema foto authorization foto;`,
  )
  await admin.end()
  urlFoto = pg.url.replace('postgres://postgres@', 'postgres://foto:teste@')
  pasta = mkdtempSync(join(tmpdir(), 'foto-arquivos-evento-'))
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
  evento = await import('../api/_evento.js')
  rotaEventos = (await import('../api/foto/eventos.js')).default
  rotaVisitante = (await import('../api/link/evento.js')).default
  rotaPagina = (await import('../api/evento.js')).default
})
after(async () => {
  await dono?.end({ timeout: 5 })
  await banco?.fecharBanco()
  await pg?.fechar()
  if (pasta) rmSync(pasta, { recursive: true, force: true })
  for (const v of ['FOTO_DATABASE_URL', 'FOTO_ARQUIVOS_DIR', 'ZRO_CLIENT_ID', 'ZRO_CLIENT_SECRET']) delete process.env[v]
})
/** Zera os limites entre os testes (o IP é o mesmo em todos). */
const semLimites = () => dono`delete from foto.limites`

test('Postgres é exigido no CI', { skip: !EXIGIR }, () => {
  assert.equal(pular, false, 'FOTO_EXIGIR=1 e não há Postgres na máquina')
})

test('migração 0003: RLS em cada tabela nova, nada para o público, o app sem os rostos nem os hashes', { skip: pular }, async () => {
  const t =
    await dono`select c.relname as nome, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'foto' and c.relkind = 'r' and c.relname = any(${NOVAS})`
  assert.deepEqual(t.map((x) => x.nome).sort(), [...NOVAS].sort())
  for (const x of t) assert.equal(x.rls, true, x.nome)
  for (const nome of NOVAS) {
    const [p] =
      await dono`select has_table_privilege('public', ${`foto.${nome}`}, 'select') as le, has_table_privilege('public', ${`foto.${nome}`}, 'insert') as cria`
    assert.deepEqual({ ...p }, { le: false, cria: false }, nome)
  }
  const [p] = await dono`select
    has_table_privilege('foto_app', 'foto.evento_rostos', 'select') as rostos_le,
    has_table_privilege('foto_app', 'foto.evento_rostos', 'insert') as rostos_cria,
    has_table_privilege('foto_app', 'foto.evento_rostos', 'update') as rostos_muda,
    has_table_privilege('foto_app', 'foto.evento_rostos', 'delete') as rostos_apaga,
    has_column_privilege('foto_app', 'foto.evento_links', 'token_hash', 'select') as le_token,
    has_column_privilege('foto_app', 'foto.evento_links', 'pin_hash', 'select') as le_pin,
    has_column_privilege('foto_app', 'foto.evento_pessoas', 'chave_hash', 'select') as le_chave,
    has_column_privilege('foto_app', 'foto.evento_remocoes', 'v', 'select') as le_remocao,
    has_table_privilege('foto_app', 'foto.evento_pessoas', 'insert') as pessoas_cria,
    has_table_privilege('foto_app', 'foto.evento_consentimentos', 'update') as consentimento_muda,
    has_table_privilege('foto_app', 'foto.evento_buscas', 'insert') as buscas_cria,
    has_function_privilege('foto_app', 'foto.evento_cossenos(uuid, bytea[])', 'execute') as cossenos,
    has_function_privilege('foto_app', 'foto.evento_achar(text, boolean, bytea[], text, text)', 'execute') as achar,
    has_function_privilege('public', 'foto.evento_achar(text, boolean, bytea[], text, text)', 'execute') as publico_acha,
    has_function_privilege('foto_app', 'foto.eventos_limpar()', 'execute') as limpar`
  assert.deepEqual(
    { ...p },
    {
      rostos_le: false,
      rostos_cria: false,
      rostos_muda: false,
      rostos_apaga: false,
      le_token: false,
      le_pin: false,
      le_chave: false,
      le_remocao: false,
      pessoas_cria: false,
      consentimento_muda: false,
      buscas_cria: false,
      cossenos: false,
      achar: true,
      publico_acha: false,
      limpar: false,
    },
  )
  // sem pgvector nesta máquina: a migração seguiu e a coluna vv não existe (com ele, existiria)
  const temVector = (await dono`select count(*)::int as n from pg_extension where extname = 'vector'`)[0].n > 0
  const temVv =
    (await dono`select count(*)::int as n from pg_attribute where attrelid = 'foto.evento_rostos'::regclass and attname = 'vv' and not attisdropped`)[0].n > 0
  assert.equal(temVv, temVector)
})

test('isolamento: cada tabela nova, por pessoa e por organização', { skip: pular }, async () => {
  await semLimites()
  const base = r.vetor()
  const a = await eventoPronto({ rostos: (i) => [{ v: aoCosseno(base, 0.8) }, { v: r.vetor(), largura: 30 }].slice(0, 1 + (i % 2)) })
  const c = await eventoPronto({ modo: 'consentimento' })
  // o visitante gera pessoa, ligação, remoção, consentimento, pedido e contagem
  await visitante('achar', { token: a.token, vetores: [texto(aoCosseno(base, 0.9))], versao: TEXTOS.busca.versao })
  await visitante('remover', { token: a.token, vetores: [texto(r.vetor())], fotos: [a.fotos[3]], versao: TEXTOS.remocao.versao })
  const k = link.novoToken()
  const cad = await visitante('cadastrar', { token: c.token, vetores: [texto(base)], chave: k, versao: TEXTOS.cadastro.versao })
  assert.equal(cad.statusCode, 200, JSON.stringify(cad.corpo))
  const pes = await fotografo('GET', `${c.id}/pessoas`)
  assert.equal(
    (
      await fotografo('POST', `${c.id}/ligacoes`, {
        corpo: { pessoas: [pes.corpo.pessoas[0].id], ligacoes: [{ pessoa: pes.corpo.pessoas[0].id, foto: c.fotos[0], faixa: 'eu' }] },
      })
    ).statusCode,
    200,
  )
  assert.equal((await visitante('pedir', { token: a.token, nome: 'Ana', contato: 'ana@exemplo.com', fotos: [a.fotos[0]] })).statusCode, 200)
  for (const t of NOVAS.filter((x) => x !== 'evento_rostos')) assert.ok((await contar(t)) > 0, `${t} tem linhas`)

  const visiveis = async (p, tabela) => banco.comoPessoa(p, async (tx) => (await tx.unsafe(`select count(*)::int as n from foto.${tabela}`))[0].n)
  for (const tabela of NOVAS.filter((x) => !['evento_rostos', 'evento_remocoes', 'evento_links', 'evento_pessoas'].includes(x))) {
    assert.ok((await visiveis(LIA, tabela)) > 0, `${tabela}: a dona vê`)
    for (const outro of [RUI, EVA, LIA_FORA]) assert.equal(await visiveis(outro, tabela), 0, `${tabela} × ${outro.sub}/${outro.org}`)
  }
  // as tabelas com permissão por coluna: lê só as colunas liberadas, e só da dona
  const colunas = { evento_links: 'id', evento_pessoas: 'id', evento_remocoes: 'id' }
  for (const [tabela, col] of Object.entries(colunas)) {
    const ver = (p) => banco.comoPessoa(p, async (tx) => (await tx.unsafe(`select count(${col})::int as n from foto.${tabela}`))[0].n)
    assert.ok((await ver(LIA)) > 0, tabela)
    for (const outro of [RUI, EVA, LIA_FORA]) assert.equal(await ver(outro), 0, `${tabela} × ${outro.sub}`)
  }
  // os rostos: ninguém do app lê, nem a dona
  for (const p of [LIA, RUI])
    await assert.rejects(
      banco.comoPessoa(p, (tx) => tx`select count(*) from foto.evento_rostos`),
      /permission denied/,
    )
  await assert.rejects(
    banco.comoPessoa(LIA, (tx) => tx`select v from foto.evento_remocoes`),
    /permission denied/,
  )
  await assert.rejects(
    banco.comoPessoa(LIA, (tx) => tx`select chave_hash from foto.evento_pessoas`),
    /permission denied/,
  )
  // mexer no que é de outra pessoa não acha nada
  for (const outro of [RUI, EVA, LIA_FORA]) {
    const n = await banco.comoPessoa(outro, async (tx) => {
      const x = await tx`update foto.eventos set nome = 'outro' where id = ${a.id} returning id`
      const y = await tx`delete from foto.evento_fotos where evento = ${a.id} returning id`
      const w = await tx`delete from foto.evento_pedidos where evento = ${a.id} returning id`
      const v = await tx`delete from foto.evento_ligacoes where evento = ${c.id} returning pessoa`
      return x.length + y.length + w.length + v.length
    })
    assert.equal(n, 0, outro.sub)
    await assert.rejects(
      banco.comoPessoa(
        outro,
        (tx) =>
          tx`insert into foto.evento_fotos ${tx({ evento: a.id, foto_id: 'x', nome: 'x', largura: 100, altura: 100, tipo: 'image/jpeg', tamanho: 10, sha256: 'a'.repeat(64) })}`,
      ),
      /row-level security/,
    )
    await assert.rejects(
      banco.comoPessoa(
        outro,
        (tx) =>
          tx`insert into foto.evento_consentimentos ${tx({ evento: a.id, tipo: 'ativacao', resultado: 'aceitou', versao: 'x', sha256_texto: 'a'.repeat(64) })}`,
      ),
      /row-level security/,
    )
    const g = await banco.comoPessoa(outro, (tx) => tx`select foto.evento_rostos_gravar(${a.fotos[0]}, '[]'::jsonb) as r`)
    assert.deepEqual(g[0].r, { erro: 'nao_existe' })
    assert.equal((await fotografo('GET', a.id, { pessoa: outro })).statusCode, 404)
    assert.equal((await fotografo('GET', `${c.id}/pessoas`, { pessoa: outro })).statusCode, 404)
  }
  // o visitante (papel do app sem pessoa) não vê tabela nenhuma
  for (const tabela of NOVAS.filter((x) => x !== 'evento_rostos')) {
    const n = await link.comoLink(
      async (tx) => (await tx.unsafe(`select count(*)::int as n from foto.${tabela} where false or true`).catch(() => [{ n: 0 }]))[0].n,
    )
    assert.equal(n, 0, tabela)
  }
})

test('porta estreita: link morto de qualquer tipo dá a mesma resposta em toda ação; PIN', { skip: pular }, async () => {
  await semLimites()
  const vivo = await eventoPronto({ rostos: () => [{ v: r.vetor() }] })
  const revogado = await eventoPronto()
  await fotografo('POST', `${revogado.id}/link`)
  const encerrado = await eventoPronto()
  await fotografo('POST', `${encerrado.id}/encerrar`)
  const vencido = await eventoPronto()
  await dono`update foto.eventos set prazo = now() - interval '1 minute' where id = ${vencido.id}`
  const rascunho = await eventoPronto({ publicar: false })
  const tokenRascunho = link.novoToken()
  await dono`insert into foto.evento_links (evento, token_hash) values (${rascunho.id}, ${link.hashToken(tokenRascunho)})`
  const mortos = [link.novoToken(), revogado.token, encerrado.token, vencido.token, tokenRascunho, 'curto', '../../x']
  const v = [texto(r.vetor())]
  const acoes = [
    ['abrir', {}],
    ['achar', { vetores: v, versao: TEXTOS.busca.versao }],
    ['cadastrar', { vetores: v, chave: link.novoToken(), versao: TEXTOS.cadastro.versao }],
    ['minhas', { chave: link.novoToken() }],
    ['desistir', { chave: link.novoToken() }],
    ['remover', { vetores: v, versao: TEXTOS.remocao.versao }],
    ['pedir', { nome: 'Ana', contato: 'ana@x.com', fotos: [vivo.fotos[0]] }],
    ['recusar', { tipo: 'busca', versao: TEXTOS.busca.versao }],
  ]
  for (const t of mortos) {
    for (const [acao, corpo] of acoes) {
      await semLimites()
      const s = await visitante(acao, { token: t, ...corpo })
      assert.equal(s.statusCode, 404, `${acao} ${t.slice(0, 6)}`)
      assert.deepEqual(s.corpo, { ok: false, erro: 'link' })
    }
    const img = await imagem(t, vivo.fotos[0])
    assert.equal(img.statusCode, 404)
    const pg_ = await pagina(t)
    assert.equal(pg_.statusCode, 404)
    assert.deepEqual(pg_.bruto, NEUTRA)
  }
  // vivo: abre, a página não leva o nome do produto, e só arquivos da lista saem
  await semLimites()
  const ab = await visitante('abrir', { token: vivo.token, contar: true })
  assert.equal(ab.statusCode, 200)
  assert.deepEqual(Object.keys(ab.corpo.evento).sort(), ['data', 'fotos', 'marcaDagua', 'modo', 'nome', 'prazo'])
  const html = await pagina(vivo.token)
  assert.equal(html.statusCode, 200)
  assert.ok(!html.bruto.toString().includes(NOME))
  assert.match(html.bruto.toString(), new RegExp(`/e/${vivo.token}/evento.js`))
  for (const [c, ok] of [
    ['&f=evento.js', 200],
    ['&d=app-rosto&f=worker.js', 200],
    ['&d=src-rosto&f=alinhar.js', 200],
    ['&d=app-trabalho&f=servir.js', 200],
    ['&d=app-rosto&f=painel.js', 404],
    ['&d=app&f=nome.js', 404],
    ['&d=src-rosto&f=../../api/_zro.js', 404],
    ['&f=evento.html', 404],
  ]) {
    const s = await pagina(vivo.token, c)
    assert.equal(s.statusCode, ok, c)
    if (ok === 200) assert.ok(!s.bruto.toString().includes(NOME), c)
  }
  // a imagem só por link vivo e da foto do evento
  const img = await imagem(vivo.token, vivo.fotos[0])
  assert.equal(img.statusCode, 200)
  assert.deepEqual(img.bruto, jpeg(1))
  assert.equal((await imagem(vivo.token, revogado.fotos[0])).statusCode, 404)

  // PIN
  const comPin = await eventoPronto({ pin: '4821', rostos: () => [{ v: r.vetor() }] })
  await semLimites()
  assert.deepEqual((await visitante('abrir', { token: comPin.token })).corpo, { ok: true, estado: 'pin' })
  assert.equal((await visitante('achar', { token: comPin.token, vetores: v, versao: TEXTOS.busca.versao })).statusCode, 401)
  assert.equal((await imagem(comPin.token, comPin.fotos[0])).statusCode, 404)
  assert.equal((await visitante('pin', { token: comPin.token, pin: '0000' })).statusCode, 401)
  const certo = await visitante('pin', { token: comPin.token, pin: '4821' })
  assert.equal(certo.statusCode, 200)
  const cookie = provaDe(certo)
  assert.match(cookie, /^foto_epin_/)
  assert.equal((await visitante('abrir', { token: comPin.token }, { cookie })).corpo.estado, 'ok')
  assert.equal((await visitante('achar', { token: comPin.token, vetores: v, versao: TEXTOS.busca.versao }, { cookie })).statusCode, 200)
  // trocar o PIN derruba a prova
  assert.equal((await fotografo('PATCH', `${comPin.id}/link`, { corpo: { pin: '9999' } })).statusCode, 200)
  assert.deepEqual((await visitante('abrir', { token: comPin.token }, { cookie })).corpo, { ok: true, estado: 'pin' })
  // PIN errado: 5 por link e IP em 15 minutos
  await semLimites()
  for (let i = 0; i < 5; i++) assert.equal((await visitante('pin', { token: comPin.token, pin: '1111' })).statusCode, 401)
  assert.equal((await visitante('pin', { token: comPin.token, pin: '9999' })).statusCode, 429)
  assert.equal((await visitante('pin', { token: comPin.token, pin: '9999' }, { ip: '198.51.100.9' })).statusCode, 200)
})

test('busca aberta: as faixas batem com src/rosto/decidir.js; o vetor da busca não fica em lugar nenhum', { skip: pular }, async () => {
  await semLimites()
  const pessoa = r.vetor()
  // 30 fotos com rostos variados: a pessoa (em vários cossenos), outras pessoas, pequenos, colados, de perfil
  const plano = Array.from({ length: 30 }, (_, i) => {
    const lista = [{ v: r.vetor() }]
    const c = [0.9, 0.7, 0.55, 0.47, 0.42, 0.3][i % 6]
    lista.push({ v: aoCosseno(pessoa, c), largura: i % 5 === 0 ? 22 : 80, colado: i % 7 === 0, perfil: i % 11 === 0, nota: i % 13 === 0 ? 0.76 : 0.9 })
    return lista
  })
  const e = await eventoPronto({ n: 30, rostos: (i) => plano[i] })
  const sondas = [aoCosseno(pessoa, 0.85), aoCosseno(pessoa, 0.8), aoCosseno(pessoa, 0.82)]
  const consolelog = []
  const antigo = { log: console.log, info: console.info, warn: console.warn, error: console.error }
  for (const k of Object.keys(antigo)) console[k] = (...a) => consolelog.push(a.map(String).join(' '))
  let s
  try {
    s = await visitante('achar', { token: e.token, vetores: sondas.map(texto), versao: TEXTOS.busca.versao })
    // e um erro no meio do caminho (vetor ruim chega ao banco pela função): nada vaza
    await link.comoLink((tx) => tx`select foto.evento_achar(${link.hashToken(e.token)}, true, ${[`\\x${'00'.repeat(127)}`]}::bytea[], 'x', 'y') as r`)
    await link.comoLink((tx) => tx`select foto.evento_achar(${link.hashToken(e.token)}, true, ${['\\xzz']}::bytea[], 'x', 'y')`).catch(() => {})
  } finally {
    Object.assign(console, antigo)
  }
  assert.equal(s.statusCode, 200, JSON.stringify(s.corpo))
  // o mesmo cálculo em JS, com os mesmos rostos (int8)
  const rostos = plano.flatMap((lista, i) =>
    lista.map((x) => ({
      foto: e.fotos[i],
      v: quantizar(x.v),
      largura: x.largura ?? 80,
      nota: Math.round((x.nota ?? 0.9) * 100) / 100,
      colado: !!x.colado,
      perfil: !!x.perfil,
    })),
  )
  const js = procurar(sondas.map(quantizar), rostos)
  assert.deepEqual(s.corpo.eu.map((f) => f.id).sort(), [...js.eu].sort())
  assert.deepEqual(s.corpo.talvez.map((f) => f.id).sort(), [...js.talvez].sort())
  assert.ok(js.eu.length >= 5 && js.talvez.length >= 5, `eu ${js.eu.length}, talvez ${js.talvez.length}`)
  assert.deepEqual(Object.keys(s.corpo.eu[0]).sort(), ['altura', 'id', 'largura', 'mini', 'v'])
  // as sondas não estão em tabela nenhuma do schema, nem no log do Postgres, nem no console
  const hexes = sondas.map((v) => Buffer.from(quantizar(v).buffer).toString('hex'))
  const b64 = sondas.map(texto)
  const tabelas = await dono`select tablename from pg_tables where schemaname = 'foto'`
  for (const { tablename } of tabelas) {
    const tudo = (await dono.unsafe(`select coalesce(string_agg(t::text, ' '), '') as s from foto.${tablename} t`))[0].s
    for (const h of hexes) assert.ok(!tudo.includes(h), `sonda em foto.${tablename}`)
  }
  const log = pg.log()
  assert.match(log, /ERROR/, 'o erro de propósito chegou ao log')
  for (const h of [...hexes, ...b64]) {
    assert.ok(!log.includes(h) && !log.includes(h.slice(0, 64)), 'sonda no log do Postgres')
    assert.ok(!consolelog.join('\n').includes(h), 'sonda no console')
  }
  // registro do consentimento: versão e sha256 do texto, nada da pessoa
  const [reg] = await dono`select * from foto.evento_consentimentos where evento = ${e.id} and tipo = 'busca'`
  assert.equal(reg.versao, TEXTOS.busca.versao)
  assert.equal(reg.sha256_texto, evento.textoAceito(TEXTOS.busca.versao, 'busca').sha)
  assert.deepEqual(Object.keys(reg).sort(), ['criado_em', 'evento', 'id', 'resultado', 'sha256_texto', 'tipo', 'versao'])
  assert.equal(await contar('evento_buscas', `evento = '${e.id}' and buscas = 1`), 1)
  // vetor mal-formado, versão de texto errada, modo errado
  assert.equal((await visitante('achar', { token: e.token, vetores: ['A'.repeat(172)], versao: TEXTOS.busca.versao })).corpo.erro, 'vetor')
  assert.equal((await visitante('achar', { token: e.token, vetores: [texto(pessoa)], versao: 'busca-1999' })).corpo.erro, 'formato')
  assert.equal((await visitante('achar', { token: e.token, vetores: Array(4).fill(texto(pessoa)), versao: TEXTOS.busca.versao })).corpo.erro, 'vetor')
  assert.equal(
    (await visitante('cadastrar', { token: e.token, vetores: [texto(pessoa)], chave: link.novoToken(), versao: TEXTOS.cadastro.versao })).statusCode,
    409,
  )
  // limite: 5 buscas em 10 minutos por link e IP (as anteriores já contaram); outro IP segue
  await semLimites()
  for (let i = 0; i < 5; i++)
    assert.equal((await visitante('achar', { token: e.token, vetores: [texto(pessoa)], versao: TEXTOS.busca.versao })).statusCode, 200)
  assert.equal((await visitante('achar', { token: e.token, vetores: [texto(pessoa)], versao: TEXTOS.busca.versao })).statusCode, 429)
  assert.equal((await visitante('achar', { token: e.token, vetores: [texto(pessoa)], versao: TEXTOS.busca.versao }, { ip: '198.51.100.40' })).statusCode, 200)
  // o IP não vai para o banco: só o HMAC do dia
  const chaves = (await dono`select string_agg(chave, ' ') as s from foto.limites`)[0].s
  assert.ok(!chaves.includes(IP))
})

test('"não quero aparecer": confere as parecidas, apaga só o confirmado e barra foto nova parecida', { skip: pular }, async () => {
  await semLimites()
  const eu = r.vetor()
  const e = await eventoPronto({ n: 5, rostos: (i) => [{ v: i < 3 ? aoCosseno(eu, 0.8) : r.vetor() }] })
  const v = [texto(aoCosseno(eu, 0.85))]
  const previa = await visitante('remover', { token: e.token, vetores: v, versao: TEXTOS.remocao.versao })
  assert.equal(previa.statusCode, 200)
  assert.deepEqual(previa.corpo.fotos.map((f) => f.id).sort(), e.fotos.slice(0, 3).sort())
  assert.equal(await contar('evento_rostos', `evento = '${e.id}'`), 5, 'conferir não apaga nada')
  const feito = await visitante('remover', { token: e.token, vetores: v, fotos: e.fotos.slice(0, 2), versao: TEXTOS.remocao.versao })
  assert.deepEqual(feito.corpo, { ok: true, removidos: 2 })
  assert.equal(await contar('evento_rostos', `evento = '${e.id}'`), 3)
  const achou = await visitante('achar', { token: e.token, vetores: v, versao: TEXTOS.busca.versao })
  assert.deepEqual(
    achou.corpo.eu.map((f) => f.id),
    [e.fotos[2]],
  )
  // foto nova parecida com quem pediu: o rosto não entra
  const g = await fotografo('POST', `${e.id}/rostos`, {
    corpo: {
      foto: e.fotos[0],
      rostos: [
        { v: texto(aoCosseno(eu, 0.8)), largura: 80, nota: 0.9 },
        { v: texto(r.vetor()), largura: 80, nota: 0.9 },
      ],
    },
  })
  assert.deepEqual(g.corpo, { ok: true, gravados: 1, barrados: 1 })
  assert.equal(await contar('evento_consentimentos', `evento = '${e.id}' and tipo = 'remocao'`), 1)
  assert.equal(await contar('evento_remocoes', `evento = '${e.id}' and removidos = 2`), 1)
})

test('com consentimento: só quem pediu; o fotógrafo compara e sobe as ligações; voltar, reaproveitar, desistir', { skip: pular }, async () => {
  await semLimites()
  const ana = r.vetor()
  const e = await eventoPronto({ modo: 'consentimento', n: 4 })
  // nenhum vetor das fotos subiu
  assert.equal(await contar('evento_rostos', `evento = '${e.id}'`), 0)
  assert.equal(
    (await fotografo('POST', `${e.id}/rostos`, { corpo: { foto: e.fotos[0], rostos: [{ v: texto(ana), largura: 80, nota: 0.9 }] } })).statusCode,
    409,
  )
  assert.equal((await visitante('achar', { token: e.token, vetores: [texto(ana)], versao: TEXTOS.busca.versao })).statusCode, 409)
  const chave = link.novoToken()
  const c = await visitante('cadastrar', {
    token: e.token,
    vetores: [texto(aoCosseno(ana, 0.9)), texto(aoCosseno(ana, 0.88))],
    chave,
    versao: TEXTOS.cadastro.versao,
  })
  assert.equal(c.statusCode, 200, JSON.stringify(c.corpo))
  assert.deepEqual([c.corpo.eu, c.corpo.talvez, c.corpo.processado], [[], [], null])
  // o banco guarda o sha256 da chave, não a chave
  const [p] = await dono`select * from foto.evento_pessoas where evento = ${e.id}`
  assert.equal(p.chave_hash, sha256(chave))
  assert.equal(p.v3, null)
  // o fotógrafo: lê quem pediu, compara no computador dele e sobe só as ligações
  const lista = await fotografo('GET', `${e.id}/pessoas`)
  assert.equal(lista.corpo.pessoas.length, 1)
  assert.equal(lista.corpo.pessoas[0].vetores.length, 2)
  assert.equal(lista.corpo.pessoas[0].pendente, true)
  const pid = lista.corpo.pessoas[0].id
  const lig = await fotografo('POST', `${e.id}/ligacoes`, {
    corpo: {
      pessoas: [pid],
      ligacoes: [
        { pessoa: pid, foto: e.fotos[1], faixa: 'eu' },
        { pessoa: pid, foto: e.fotos[2], faixa: 'talvez' },
      ],
    },
  })
  assert.deepEqual(lig.corpo, { ok: true, pessoas: 1, ligacoes: 2 })
  assert.equal((await fotografo('GET', `${e.id}/pessoas`)).corpo.pessoas[0].pendente, false)
  // foto de outro evento não liga
  const outro = await eventoPronto({ modo: 'consentimento', n: 1 })
  assert.equal(
    (await fotografo('POST', `${e.id}/ligacoes`, { corpo: { pessoas: [pid], ligacoes: [{ pessoa: pid, foto: outro.fotos[0], faixa: 'eu' }] } })).statusCode,
    409,
  )
  // a pessoa volta pelo mesmo link com a chave
  const m = await visitante('minhas', { token: e.token, chave })
  assert.deepEqual([m.corpo.eu.map((f) => f.id), m.corpo.talvez.map((f) => f.id)], [[e.fotos[1]], [e.fotos[2]]])
  assert.ok(m.corpo.processado)
  assert.equal((await visitante('minhas', { token: e.token, chave: link.novoToken() })).corpo.erro, 'chave')
  // pediu de novo (outro celular): o mesmo pedido, com as fotos já ligadas e a chave nova
  const chave2 = link.novoToken()
  const de_novo = await visitante('cadastrar', {
    token: e.token,
    vetores: [texto(aoCosseno(ana, 0.87)), texto(aoCosseno(ana, 0.86)), texto(aoCosseno(ana, 0.85))],
    chave: chave2,
    versao: TEXTOS.cadastro.versao,
  })
  assert.deepEqual(
    de_novo.corpo.eu.map((f) => f.id),
    [e.fotos[1]],
  )
  assert.equal(await contar('evento_pessoas', `evento = '${e.id}'`), 1)
  assert.equal((await fotografo('GET', `${e.id}/pessoas`)).corpo.pessoas[0].pendente, true, 'vetor novo: comparar de novo')
  // outra pessoa é outro pedido
  await visitante('cadastrar', { token: e.token, vetores: [texto(r.vetor())], chave: link.novoToken(), versao: TEXTOS.cadastro.versao })
  assert.equal(await contar('evento_pessoas', `evento = '${e.id}'`), 2)
  // desistir: vetores e ligações somem, fica o registro
  assert.deepEqual((await visitante('desistir', { token: e.token, chave: chave2 })).corpo, { ok: true })
  assert.equal(await contar('evento_pessoas', `id = '${pid}'`), 0)
  assert.equal(await contar('evento_ligacoes', `pessoa = '${pid}'`), 0)
  assert.equal(await contar('evento_consentimentos', `evento = '${e.id}' and tipo = 'desistencia'`), 1)
  assert.equal(await contar('evento_consentimentos', `evento = '${e.id}' and tipo = 'cadastro'`), 3)
  // recusar registra a recusa e nada mais
  assert.equal((await visitante('recusar', { token: e.token, tipo: 'cadastro', versao: TEXTOS.cadastro.versao })).statusCode, 200)
  assert.equal(await contar('evento_consentimentos', `evento = '${e.id}' and resultado = 'recusou'`), 1)
})

test('pedidos de foto, regras do fotógrafo, encerrar, apagar em cascata e a limpeza do prazo', { skip: pular }, async () => {
  await semLimites()
  const e = await eventoPronto({ n: 3, rostos: () => [{ v: r.vetor() }] })
  // pedir: só fotos do evento
  const outro = await eventoPronto({ n: 1 })
  assert.equal((await visitante('pedir', { token: e.token, nome: 'Ana', contato: 'ana@x.com', fotos: [outro.fotos[0]] })).corpo.erro, 'fotos')
  assert.equal((await visitante('pedir', { token: e.token, nome: '', contato: 'ana@x.com', fotos: [e.fotos[0]] })).corpo.erro, 'nome')
  assert.deepEqual((await visitante('pedir', { token: e.token, nome: 'Ana <b>', contato: '11 99999-0000', fotos: [e.fotos[0], e.fotos[2]] })).corpo, {
    ok: true,
    fotos: 2,
  })
  const ped = await fotografo('GET', `${e.id}/pedidos`)
  assert.equal(ped.corpo.pedidos[0].nome, 'Ana b')
  assert.deepEqual(ped.corpo.pedidos[0].fotos.map((f) => f.fotoId).sort(), ['cat-1', 'cat-3'])
  // regras: busca aberta sem aviso não publica; prazo até 30 dias; modo não muda depois de publicar; prorrogar uma vez
  const semAviso = await fotografo('POST', '', { corpo: { nome: 'X', modo: 'aberta' } })
  assert.equal(semAviso.statusCode, 201)
  assert.equal((await fotografo('POST', `${semAviso.corpo.evento.id}/publicar`)).corpo.erro, 'sem_fotos')
  assert.equal((await fotografo('POST', '', { corpo: { nome: 'X', prazoDias: 31 } })).statusCode, 400)
  assert.equal((await fotografo('PATCH', e.id, { corpo: { modo: 'consentimento' } })).corpo.erro, 'modo')
  assert.equal((await fotografo('PATCH', e.id, { corpo: { prazoDias: 30 } })).statusCode, 200)
  assert.equal((await fotografo('PATCH', e.id, { corpo: { prazoDias: 29 } })).statusCode, 200, 'encurtar pode')
  assert.equal((await fotografo('PATCH', e.id, { corpo: { prazoDias: 30 } })).corpo.erro, 'prorrogado')
  const lista = await fotografo('GET')
  const ficha = lista.corpo.eventos.find((x) => x.id === e.id)
  assert.deepEqual([ficha.contagens.fotos, ficha.contagens.enviadas, ficha.contagens.guardados, ficha.contagens.pedidos, ficha.prorrogado], [3, 3, 3, 1, true])
  // encerrar: o link morre e os vetores somem na hora; a ficha, o pedido e o registro ficam
  assert.equal((await fotografo('POST', `${e.id}/encerrar`)).statusCode, 200)
  assert.equal(await contar('evento_rostos', `evento = '${e.id}'`), 0)
  assert.equal((await visitante('abrir', { token: e.token })).statusCode, 404)
  assert.equal(await contar('evento_pedidos', `evento = '${e.id}'`), 1)
  assert.equal((await fotografo('POST', `${e.id}/fotos`, { corpo: { fotos: [{ fotoId: 'x' }] } })).statusCode, 409)
  // a limpeza tira as prévias do evento encerrado
  const arquivosAntes = readdirSync(join(pasta, 'g', e.id)).length
  assert.equal(arquivosAntes, 6)
  const l = await evento.limparEventos()
  assert.ok(l.arquivos >= 6)
  assert.ok(!existsSync(join(pasta, 'g', e.id)) || readdirSync(join(pasta, 'g', e.id)).length === 0)
  // prazo vencido: a limpeza apaga vetores, pessoas e ligações e encerra
  const c = await eventoPronto({ modo: 'consentimento', n: 2 })
  await visitante('cadastrar', { token: c.token, vetores: [texto(r.vetor())], chave: link.novoToken(), versao: TEXTOS.cadastro.versao })
  const a = await eventoPronto({ n: 2, rostos: () => [{ v: r.vetor() }] })
  await dono`update foto.eventos set prazo = now() - interval '1 second' where id = any(${[c.id, a.id]})`
  const l2 = await evento.limparEventos()
  assert.ok(l2.eventos >= 2)
  for (const t of ['evento_rostos', 'evento_pessoas', 'evento_ligacoes', 'evento_remocoes'])
    assert.equal(await contar(t, `evento in ('${c.id}', '${a.id}')`), 0, t)
  assert.equal((await dono`select estado from foto.eventos where id = ${c.id}`)[0].estado, 'encerrado')
  // apagar: tudo em cascata, inclusive os arquivos
  const d = await eventoPronto({ n: 2, rostos: () => [{ v: r.vetor() }] })
  await visitante('pedir', { token: d.token, nome: 'Rui', contato: 'rui@x.com', fotos: [d.fotos[0]] })
  assert.equal((await fotografo('DELETE', d.id)).statusCode, 200)
  for (const t of NOVAS) assert.equal(await contar(t, t === 'eventos' ? `id = '${d.id}'` : `evento = '${d.id}'`), 0, t)
  assert.ok(!existsSync(join(pasta, 'g', d.id)) || readdirSync(join(pasta, 'g', d.id)).length === 0)
})

test('sem armazenamento: 503 nas rotas do fotógrafo e do visitante', { skip: pular }, async () => {
  const antes = process.env.FOTO_ARQUIVOS_DIR
  delete process.env.FOTO_ARQUIVOS_DIR
  try {
    assert.equal((await fotografo('GET')).statusCode, 503)
    assert.equal((await visitante('abrir', { token: link.novoToken() })).statusCode, 503)
  } finally {
    process.env.FOTO_ARQUIVOS_DIR = antes
  }
})
