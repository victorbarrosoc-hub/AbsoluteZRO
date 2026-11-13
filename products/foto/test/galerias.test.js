// Galerias e predefinições num Postgres de verdade (temporário), montado como no Supabase: papel `foto` (dono) e
// `foto_app` (o que as rotas assumem). Confere:
//   - as migrações 0001 e 0002: toda tabela nova com RLS e sem permissão para o público;
//   - o isolamento de CADA tabela nova pelo papel do app: a pessoa A não vê nem altera o que é da pessoa B nem o que
//     ela mesma tem em outra organização; predefinição compartilhada só aparece na mesma organização;
//   - as guardas do banco (estados, validade do link, revogação para sempre, teto de fotos);
//   - as rotas do fotógrafo de ponta a ponta com a pasta local: criar, registrar fotos, enviar prévias, publicar
//     (o endereço sai uma vez e o token não fica legível no banco), PIN, trocar, revogar, reabrir, encerrar, ler a
//     seleção, apagar (os arquivos vão junto) e a limpeza das vencidas; sem armazenamento, 503.
// As "imagens" daqui são bytes com cara de JPEG (o servidor confere tipo, tamanho, sha256 e GPS, não decodifica).

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
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
const TABELAS = ['galerias', 'galeria_fotos', 'links', 'selecao', 'envios', 'limites', 'predefinicoes']
// as da 0003 (busca por rosto em evento): isolamento e permissões conferidos em test/eventos.test.js
const DE_EVENTOS = ['eventos', 'evento_fotos', 'evento_links', 'evento_rostos', 'evento_pessoas', 'evento_ligacoes', 'evento_remocoes', 'evento_consentimentos', 'evento_pedidos', 'evento_buscas']

let pg, urlFoto, dono, banco, z, link, arquivos, rotaGalerias, rotaPredefinicoes, pasta

const sha256 = (b) => createHash('sha256').update(b).digest('hex')
/** Bytes com cara de JPEG (SOI, APP0 JFIF, um bloco de dados, EOI), diferentes a cada semente. */
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
const registro = (n, mais = {}) => {
  const b = jpeg(n)
  return {
    fotoId: `cat-${n}`,
    nome: `IMG_${String(n).padStart(4, '0')}.CR3`,
    largura: 1600,
    altura: 1067,
    tipo: 'image/jpeg',
    tamanho: b.length,
    sha256: sha256(b),
    ...mais,
  }
}

const comoPessoa = (p, fn) => banco.comoPessoa(p, fn)
const cookieDe = (p, nome = 'Lia Fotógrafa') =>
  `foto_conta=${z.selar(z.COOKIE_CONTA, { sub: p.sub, nome, apps: ['foto'], org: p.org ? { id: p.org, nome: 'Estúdio', papel: 'owner' } : null, lido: Math.floor(Date.now() / 1000) }, 3600)}`
const resposta = () => {
  const r = { statusCode: 0, headers: {} }
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v)
  r.end = (c) => (r.corpo = c ? JSON.parse(String(c)) : null)
  return r
}
/** Chama uma rota como a Vercel chamaria: `corpo` (objeto) já vem lido; `bytes` vem como Buffer. */
async function pedir(rota, metodo, url, { pessoa = LIA, corpo, bytes, semSessao = false, origem = `https://${SITE}` } = {}) {
  const r = resposta()
  const headers = { host: SITE, 'x-forwarded-proto': 'https', cookie: semSessao ? '' : cookieDe(pessoa), ...(origem ? { origin: origem } : {}) }
  await rota({ method: metodo, url, headers, body: bytes ?? corpo ?? (metodo === 'GET' ? undefined : {}) }, r)
  return r
}
const galerias = (metodo, caminho = '', opcoes) => {
  const [id, acao, resto] = caminho.split(/[/?]/).filter(Boolean)
  const q = new URLSearchParams(resto ?? '')
  if (id) q.set('id', id)
  if (acao) q.set('acao', acao)
  return pedir(rotaGalerias, metodo, `/api/foto/galerias?${q}`, opcoes)
}
const predefinicoes = (metodo, id, opcoes) => pedir(rotaPredefinicoes, metodo, `/api/foto/predefinicoes${id ? `?id=${id}` : ''}`, opcoes)

/** Uma galeria da pessoa com `n` fotos registradas e enviadas, direto pelo banco (papel do app). */
async function galeriaPronta(p, n = 3, ficha = {}) {
  return comoPessoa(p, async (tx) => {
    const [g] = await tx`insert into foto.galerias ${tx({ nome: 'Casamento', fotografo: 'Lia', contratadas: 2, ...ficha })} returning id`
    const linhas = Array.from({ length: n }, (_, i) => {
      const r = registro(i + 1)
      return {
        galeria: g.id,
        foto_id: r.fotoId,
        nome: r.nome,
        ordem: i,
        largura: r.largura,
        altura: r.altura,
        tipo: r.tipo,
        tamanho: r.tamanho,
        sha256: r.sha256,
      }
    })
    const fotos = n ? await tx`insert into foto.galeria_fotos ${tx(linhas)} returning id` : []
    if (n) await tx`update foto.galeria_fotos set enviada_em = now() where galeria = ${g.id}`
    return { id: g.id, fotos: fotos.map((f) => f.id) }
  })
}
/** Publica pelo banco (papel do app) e devolve o token do link. */
async function publicada(p, n = 3, ficha = {}, { pin = null } = {}) {
  const g = await galeriaPronta(p, n, ficha)
  const token = link.novoToken()
  await comoPessoa(p, async (tx) => {
    await tx`update foto.galerias set estado = 'publicada' where id = ${g.id}`
    await tx`insert into foto.links ${tx({ galeria: g.id, token_hash: link.hashToken(token), pin_hash: pin ? link.hashPin(pin) : null, expira_em: new Date(Date.now() + 86400000) })}`
  })
  return { ...g, token }
}
const pelaPorta = (sql) => link.comoLink(sql)

before(async () => {
  if (pular) return
  pg = await subirPostgres()
  const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
  await admin.unsafe(
    `create role foto login password 'teste'; create role foto_app nologin; grant foto_app to foto with admin option; create schema foto authorization foto;`,
  )
  await admin.end()
  urlFoto = pg.url.replace('postgres://postgres@', 'postgres://foto:teste@')
  pasta = mkdtempSync(join(tmpdir(), 'foto-arquivos-'))
  process.env.ZRO_CLIENT_ID = 'foto-web'
  process.env.ZRO_CLIENT_SECRET = SEGREDO
  process.env.FOTO_DATABASE_URL = urlFoto
  process.env.FOTO_ARQUIVOS_DIR = pasta
  for (const v of ['FOTO_LOCAL', 'FOTO_SITE', 'FOTO_S3_ENDPOINT', 'FOTO_S3_BUCKET', 'FOTO_S3_KEY_ID', 'FOTO_S3_SECRET', 'VERCEL']) delete process.env[v]
  const mig = await import('../scripts/migrar.mjs')
  await mig.migrar(urlFoto)
  dono = postgres(urlFoto, { max: 2, onnotice: () => {} })
  banco = await import('../api/_banco.js')
  z = await import('../api/_zro.js')
  link = await import('../api/_link.js')
  arquivos = await import('../api/_arquivos.js')
  rotaGalerias = (await import('../api/foto/galerias.js')).default
  rotaPredefinicoes = (await import('../api/foto/predefinicoes.js')).default
})
after(async () => {
  await dono?.end({ timeout: 5 })
  await banco?.fecharBanco()
  await pg?.fechar()
  if (pasta) rmSync(pasta, { recursive: true, force: true })
  delete process.env.FOTO_DATABASE_URL
  delete process.env.FOTO_ARQUIVOS_DIR
})

test('Postgres é exigido no CI', { skip: !EXIGIR }, () => {
  assert.equal(semPostgres, false, 'FOTO_EXIGIR=1 e não há Postgres na máquina')
})

test('migrações: toda tabela nova tem RLS, o público não tem nada e o papel do app só tem o que precisa', { skip: pular }, async () => {
  const tabelas =
    await dono`select c.relname as nome, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'foto' and c.relkind = 'r' order by 1`
  assert.deepEqual(
    tabelas.filter((t) => t.nome !== 'migracoes' && !DE_EVENTOS.includes(t.nome)).map((t) => [t.nome, t.rls]),
    [...TABELAS].sort().map((t) => [t, true]),
  )
  for (const t of TABELAS) {
    const [p] =
      await dono`select has_table_privilege('public', ${`foto.${t}`}, 'select') as le, has_table_privilege('public', ${`foto.${t}`}, 'insert') as cria`
    assert.deepEqual({ ...p }, { le: false, cria: false }, t)
  }
  // o cliente não escreve seleção nem envio pelo papel do app: só a porta (funções do dono)
  const [p] = await dono`select
    has_table_privilege('foto_app', 'foto.selecao', 'insert') as selecao_cria,
    has_table_privilege('foto_app', 'foto.selecao', 'update') as selecao_muda,
    has_table_privilege('foto_app', 'foto.envios', 'insert') as envio_cria,
    has_table_privilege('foto_app', 'foto.limites', 'select') as limites_le,
    has_table_privilege('foto_app', 'foto.limites', 'insert') as limites_cria,
    has_table_privilege('foto_app', 'foto.links', 'select') as links_tudo,
    has_table_privilege('foto_app', 'foto.links', 'delete') as links_apaga,
    has_column_privilege('foto_app', 'foto.links', 'token_hash', 'select') as le_token,
    has_column_privilege('foto_app', 'foto.links', 'pin_hash', 'select') as le_pin,
    has_column_privilege('foto_app', 'foto.links', 'expira_em', 'select') as le_validade,
    has_column_privilege('foto_app', 'foto.galerias', 'dono', 'update') as muda_dono,
    has_column_privilege('foto_app', 'foto.galerias', 'dono', 'insert') as escolhe_dono,
    has_function_privilege('foto_app', 'foto.link_vivo(text)', 'execute') as link_vivo,
    has_function_privilege('foto_app', 'foto.link_abrir(text, boolean, boolean)', 'execute') as link_abrir,
    has_function_privilege('public', 'foto.link_abrir(text, boolean, boolean)', 'execute') as publico_abre`
  assert.deepEqual(
    { ...p },
    {
      selecao_cria: false,
      selecao_muda: false,
      envio_cria: false,
      limites_le: false,
      limites_cria: false,
      links_tudo: false,
      links_apaga: false,
      le_token: false,
      le_pin: false,
      le_validade: true,
      muda_dono: false,
      escolhe_dono: false,
      link_vivo: false,
      link_abrir: true,
      publico_abre: false,
    },
  )
  // as funções da porta são do dono do schema e nenhuma tabela força RLS (senão a porta não responderia)
  const portas =
    await dono`select p.proname as nome, p.prosecdef as definer, pg_get_userbyid(p.proowner) as dono from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'foto' and p.proname ~ '^link_' order by 1`
  assert.deepEqual(
    portas.map((f) => f.nome),
    ['link_abrir', 'link_comentar', 'link_contagem', 'link_enviar', 'link_escolher', 'link_imagem', 'link_pin', 'link_vivo'],
  )
  for (const f of portas) assert.deepEqual([f.definer, f.dono], [true, 'foto'], f.nome)
})

test('isolamento · galerias: só a dona, na organização em que criou', { skip: pular }, async () => {
  const g = await galeriaPronta(LIA, 0)
  const ve = (p) => comoPessoa(p, async (tx) => (await tx`select id from foto.galerias where id = ${g.id}`).length)
  assert.equal(await ve(LIA), 1)
  for (const outra of [RUI, EVA, LIA_FORA, ANA]) {
    assert.equal(await ve(outra), 0, JSON.stringify(outra))
    assert.equal(await comoPessoa(outra, async (tx) => (await tx`update foto.galerias set nome = 'minha agora' where id = ${g.id} returning id`).length), 0)
    assert.equal(await comoPessoa(outra, async (tx) => (await tx`delete from foto.galerias where id = ${g.id} returning id`).length), 0)
  }
  // sem pessoa na transação (a porta do cliente), nada aparece
  assert.equal(await pelaPorta(async (tx) => (await tx`select id from foto.galerias`).length), 0)
  // dono e organização vêm da sessão: não dá para escolher nem trocar
  await assert.rejects(
    comoPessoa(RUI, (tx) => tx`insert into foto.galerias (nome, fotografo, contratadas, dono) values ('x', 'y', 1, 'zro-lia')`),
    /permission denied/,
  )
  await assert.rejects(
    comoPessoa(LIA, (tx) => tx`update foto.galerias set dono = 'zro-rui' where id = ${g.id}`),
    /permission denied/,
  )
  const [linha] = await dono`select dono, organizacao, estado, nome from foto.galerias where id = ${g.id}`
  assert.deepEqual({ ...linha }, { dono: 'zro-lia', organizacao: 'org-1', estado: 'rascunho', nome: 'Casamento' })
  // a mesma pessoa em outra organização cria a dela, separada
  const outra = await galeriaPronta(LIA_FORA, 0)
  assert.equal(await comoPessoa(LIA, async (tx) => (await tx`select id from foto.galerias where id = ${outra.id}`).length), 0)
  assert.equal((await dono`select organizacao from foto.galerias where id = ${outra.id}`)[0].organizacao, 'org-2')
})

test('isolamento · galeria_fotos: seguem a galeria', { skip: pular }, async () => {
  const g = await galeriaPronta(LIA, 2)
  const r = registro(50)
  const linha = { galeria: g.id, foto_id: r.fotoId, nome: r.nome, largura: 800, altura: 600, tipo: r.tipo, tamanho: r.tamanho, sha256: r.sha256 }
  assert.equal(await comoPessoa(LIA, async (tx) => (await tx`select id from foto.galeria_fotos where galeria = ${g.id}`).length), 2)
  for (const outra of [RUI, EVA, LIA_FORA, ANA]) {
    assert.equal(await comoPessoa(outra, async (tx) => (await tx`select id from foto.galeria_fotos where galeria = ${g.id}`).length), 0)
    assert.equal(await comoPessoa(outra, async (tx) => (await tx`update foto.galeria_fotos set nome = 'x' where galeria = ${g.id} returning id`).length), 0)
    assert.equal(await comoPessoa(outra, async (tx) => (await tx`delete from foto.galeria_fotos where galeria = ${g.id} returning id`).length), 0)
    await assert.rejects(
      comoPessoa(outra, (tx) => tx`insert into foto.galeria_fotos ${tx(linha)}`),
      /row-level security/,
    )
  }
  assert.equal(await pelaPorta(async (tx) => (await tx`select id from foto.galeria_fotos`).length), 0)
  assert.equal((await dono`select count(*)::int as n from foto.galeria_fotos where galeria = ${g.id}`)[0].n, 2)
  // a chave do arquivo é calculada pelo banco: ninguém aponta para o arquivo de outra galeria
  const [f] = await dono`select id, chave from foto.galeria_fotos where galeria = ${g.id} limit 1`
  assert.equal(f.chave, `g/${g.id}/${f.id}`)
  await assert.rejects(
    comoPessoa(LIA, (tx) => tx`update foto.galeria_fotos set chave = 'g/outra' where id = ${f.id}`),
    /permission denied|can only be updated to DEFAULT/,
  )
})

test('isolamento · links: seguem a galeria; o papel do app não lê o hash do token nem o do PIN', { skip: pular }, async () => {
  const g = await publicada(LIA, 2, {}, { pin: '4321' })
  const colunas = (tx) => tx`select id, tem_pin, pin_versao, expira_em, revogado_em, aberturas from foto.links where galeria = ${g.id}`
  const meu = await comoPessoa(LIA, colunas)
  assert.equal(meu.length, 1)
  assert.deepEqual([meu[0].tem_pin, meu[0].pin_versao, meu[0].aberturas, meu[0].revogado_em], [true, 0, 0, null])
  // nem a dona lê os hashes (nem pedindo tudo, nem por coluna, nem em filtro)
  for (const consulta of [
    (tx) => tx`select * from foto.links where galeria = ${g.id}`,
    (tx) => tx`select token_hash from foto.links where galeria = ${g.id}`,
    (tx) => tx`select pin_hash from foto.links where galeria = ${g.id}`,
    (tx) => tx`select id from foto.links where token_hash = ${link.hashToken(g.token)}`,
    (tx) => tx`select id from foto.links where pin_hash is not null`,
    (tx) => tx`update foto.links set expira_em = expira_em where galeria = ${g.id} returning token_hash`,
  ]) {
    await assert.rejects(comoPessoa(LIA, consulta), /permission denied/)
  }
  for (const outra of [RUI, EVA, LIA_FORA, ANA]) {
    assert.equal((await comoPessoa(outra, colunas)).length, 0)
    assert.equal(await comoPessoa(outra, async (tx) => (await tx`update foto.links set revogado_em = now() where galeria = ${g.id} returning id`).length), 0)
    await assert.rejects(
      comoPessoa(
        outra,
        (tx) => tx`insert into foto.links ${tx({ galeria: g.id, token_hash: link.hashToken(link.novoToken()), expira_em: new Date(Date.now() + 3600000) })}`,
      ),
      /link:estado|row-level security/,
    )
    await assert.rejects(
      comoPessoa(outra, (tx) => tx`delete from foto.links where galeria = ${g.id}`),
      /permission denied/,
    )
  }
  assert.equal(await pelaPorta(async (tx) => (await tx`select id from foto.links`).length), 0)
  // no banco fica só o sha256 do token e o scrypt do PIN: nem o token nem o PIN aparecem em coluna nenhuma
  const [linha] = await dono`select to_jsonb(l) as tudo from foto.links l where galeria = ${g.id}`
  assert.equal(linha.tudo.token_hash, link.hashToken(g.token))
  assert.match(linha.tudo.pin_hash, /^s1\$/)
  assert.ok(!JSON.stringify(linha.tudo).includes(g.token))
  assert.ok(!JSON.stringify(linha.tudo).includes('4321'))
  assert.equal((await dono`select count(*)::int as n from foto.links where galeria = ${g.id} and revogado_em is null`)[0].n, 1)
})

test('isolamento · selecao e envios: a dona lê; ninguém escreve pelo papel do app; as outras pessoas não veem', { skip: pular }, async () => {
  const g = await publicada(LIA, 3)
  const th = link.hashToken(g.token)
  await pelaPorta(async (tx) => {
    await tx`select foto.link_escolher(${th}, true, ${g.fotos[0]}::uuid, true)`
    await tx`select foto.link_comentar(${th}, true, ${g.fotos[1]}::uuid, 'mais clara', array['clarear'])`
    await tx`select foto.link_enviar(${th}, true, 'Ana Cliente')`
  })
  const selecao = (tx) => tx`select foto, escolhida, comentario, etiquetas from foto.selecao where galeria = ${g.id} order by escolhida desc`
  const envios = (tx) => tx`select nome, escolhidas, extras from foto.envios where galeria = ${g.id}`
  const minha = await comoPessoa(LIA, selecao)
  assert.deepEqual(
    minha.map((s) => [s.foto, s.escolhida, s.comentario, s.etiquetas]),
    [
      [g.fotos[0], true, null, []],
      [g.fotos[1], false, 'mais clara', ['clarear']],
    ],
  )
  assert.deepEqual(
    (await comoPessoa(LIA, envios)).map((e) => ({ ...e })),
    [{ nome: 'Ana Cliente', escolhidas: 1, extras: 0 }],
  )
  for (const outra of [RUI, EVA, LIA_FORA, ANA]) {
    assert.equal((await comoPessoa(outra, selecao)).length, 0)
    assert.equal((await comoPessoa(outra, envios)).length, 0)
  }
  assert.equal(await pelaPorta(async (tx) => (await tx`select foto from foto.selecao`).length), 0)
  assert.equal(await pelaPorta(async (tx) => (await tx`select id from foto.envios`).length), 0)
  // nem a dona escreve a seleção ou o envio no lugar do cliente
  for (const escrita of [
    (tx) => tx`insert into foto.selecao (foto, galeria, escolhida) values (${g.fotos[2]}, ${g.id}, true)`,
    (tx) => tx`update foto.selecao set escolhida = false where galeria = ${g.id}`,
    (tx) => tx`delete from foto.selecao where galeria = ${g.id}`,
    (tx) => tx`insert into foto.envios (galeria, nome, escolhidas, extras) values (${g.id}, 'Eu mesma', 3, 0)`,
    (tx) => tx`update foto.envios set nome = 'Outro' where galeria = ${g.id}`,
    (tx) => tx`delete from foto.envios where galeria = ${g.id}`,
  ]) {
    await assert.rejects(comoPessoa(LIA, escrita), /permission denied/)
  }
})

test('isolamento · limites: o papel do app não lê nem escreve', { skip: pular }, async () => {
  await dono`insert into foto.limites (chave) values ('teste:isolamento')`
  for (const p of [LIA, RUI, ANA]) {
    await assert.rejects(
      comoPessoa(p, (tx) => tx`select * from foto.limites`),
      /permission denied/,
    )
    await assert.rejects(
      comoPessoa(p, (tx) => tx`insert into foto.limites (chave) values ('x')`),
      /permission denied/,
    )
    await assert.rejects(
      comoPessoa(p, (tx) => tx`delete from foto.limites`),
      /permission denied/,
    )
  }
  await assert.rejects(
    pelaPorta((tx) => tx`select * from foto.limites`),
    /permission denied/,
  )
  await dono`delete from foto.limites where chave = 'teste:isolamento'`
})

test('isolamento · predefinicoes: a pessoa vê as suas e as compartilhadas da organização dela; só o dono altera', { skip: pular }, async () => {
  const gravar = (p, chave, compartilhada) =>
    comoPessoa(
      p,
      async (tx) =>
        (
          await tx`insert into foto.predefinicoes (chave, nome, familia, json, compartilhada) values (${chave}, ${`Look ${chave}`}, 'Retrato', '{"zro":"foto.predefinicao","versao":1}'::jsonb, ${compartilhada}) returning id`
        )[0].id,
    )
  const privada = await gravar(LIA, 'lia-privada', false)
  const dividida = await gravar(LIA, 'lia-equipe', true)
  const daEva = await gravar(EVA, 'eva-equipe', true)
  const ve = async (p) => (await comoPessoa(p, (tx) => tx`select chave from foto.predefinicoes order by chave`)).map((l) => l.chave)
  assert.deepEqual(await ve(LIA), ['lia-equipe', 'lia-privada'])
  // mesma organização: só a compartilhada; outra organização: nada da Lia
  assert.deepEqual(await ve(RUI), ['lia-equipe'])
  assert.deepEqual(await ve(EVA), ['eva-equipe'])
  assert.deepEqual(await ve(ANA), [])
  // a Lia em outra organização continua vendo as dela, e vê a compartilhada de lá
  assert.deepEqual(await ve(LIA_FORA), ['eva-equipe', 'lia-equipe', 'lia-privada'])
  assert.deepEqual(await pelaPorta(async (tx) => (await tx`select id from foto.predefinicoes`).length), 0)
  // só o dono altera e apaga (o colega vê a compartilhada, mas não mexe)
  for (const outra of [RUI, EVA, ANA]) {
    for (const id of [privada, dividida]) {
      assert.equal(await comoPessoa(outra, async (tx) => (await tx`update foto.predefinicoes set nome = 'minha' where id = ${id} returning id`).length), 0)
      assert.equal(await comoPessoa(outra, async (tx) => (await tx`delete from foto.predefinicoes where id = ${id} returning id`).length), 0)
    }
  }
  await assert.rejects(
    comoPessoa(RUI, (tx) => tx`insert into foto.predefinicoes (chave, nome, json, dono) values ('x', 'y', '{}'::jsonb, 'zro-lia')`),
    /permission denied/,
  )
  assert.equal((await dono`select count(*)::int as n from foto.predefinicoes where id in (${privada}, ${dividida}) and nome like 'Look %'`)[0].n, 2)
  // a mesma chave em duas pessoas não se atrapalha (a chave é única por dono)
  const doRui = await gravar(RUI, 'lia-equipe', false)
  assert.notEqual(doRui, dividida)
  assert.deepEqual(await ve(RUI), ['lia-equipe', 'lia-equipe'])
  // deixar de compartilhar some para o colega
  await comoPessoa(LIA, (tx) => tx`update foto.predefinicoes set compartilhada = false where id = ${dividida}`)
  assert.deepEqual(await ve(RUI), ['lia-equipe'])
  assert.equal((await comoPessoa(RUI, (tx) => tx`select id from foto.predefinicoes`))[0].id, doRui)
  // sem equipe não há com quem compartilhar; json acima de 256 KB não entra
  await assert.rejects(gravar(ANA, 'ana-equipe', true), /predefinicoes_equipe/)
  await assert.rejects(
    comoPessoa(
      LIA,
      (tx) => tx`insert into foto.predefinicoes (chave, nome, json) values ('grande', 'Grande', ${JSON.stringify({ a: 'x'.repeat(263000) })}::jsonb)`,
    ),
    /violates check constraint/,
  )
  await dono`delete from foto.predefinicoes`
})

test('guardas: estados da galeria, fotos travadas depois do envio, validade e revogação do link, teto de fotos', { skip: pular }, async () => {
  // publicar pede fotos, e todas com arquivo
  const vazia = await galeriaPronta(LIA, 0)
  await assert.rejects(
    comoPessoa(LIA, (tx) => tx`update foto.galerias set estado = 'publicada' where id = ${vazia.id}`),
    /galeria:sem_fotos/,
  )
  const g = await galeriaPronta(LIA, 2)
  await comoPessoa(LIA, (tx) => tx`update foto.galeria_fotos set sha256 = ${'a'.repeat(64)} where id = ${g.fotos[0]}`)
  // arquivo novo (sha256 diferente) volta a "não enviada"
  assert.equal((await dono`select enviada_em from foto.galeria_fotos where id = ${g.fotos[0]}`)[0].enviada_em, null)
  await assert.rejects(
    comoPessoa(LIA, (tx) => tx`update foto.galerias set estado = 'publicada' where id = ${g.id}`),
    /galeria:faltam_arquivos/,
  )
  // link só em galeria publicada; estados só andam para a frente pelo caminho certo
  const novo = () => ({ galeria: g.id, token_hash: link.hashToken(link.novoToken()), expira_em: new Date(Date.now() + 3600000) })
  await assert.rejects(
    comoPessoa(LIA, (tx) => tx`insert into foto.links ${tx(novo())}`),
    /link:estado/,
  )
  for (const estado of ['concluida', 'reaberta', 'encerrada']) {
    await assert.rejects(
      comoPessoa(LIA, (tx) => tx`update foto.galerias set estado = ${estado} where id = ${g.id}`),
      /galeria:estado/,
    )
  }
  await comoPessoa(LIA, async (tx) => {
    await tx`update foto.galeria_fotos set enviada_em = now() where id = ${g.fotos[0]}`
    await tx`update foto.galerias set estado = 'publicada' where id = ${g.id}`
  })
  for (const estado of ['rascunho', 'concluida', 'reaberta']) {
    await assert.rejects(
      comoPessoa(LIA, (tx) => tx`update foto.galerias set estado = ${estado} where id = ${g.id}`),
      /galeria:estado/,
    )
  }
  // validade: no futuro e até 90 dias
  for (const expira of [new Date(Date.now() - 1000), new Date(Date.now() + 91 * 86400000)]) {
    await assert.rejects(
      comoPessoa(LIA, (tx) => tx`insert into foto.links ${tx({ ...novo(), expira_em: expira })}`),
      /link:validade/,
    )
  }
  const token = link.novoToken()
  await comoPessoa(LIA, (tx) => tx`insert into foto.links ${tx({ ...novo(), token_hash: link.hashToken(token) })}`)
  // um link vivo por galeria
  await assert.rejects(
    comoPessoa(LIA, (tx) => tx`insert into foto.links ${tx(novo())}`),
    /links_um_vivo/,
  )
  // trocar o PIN sobe a versão; revogar é para sempre
  await comoPessoa(LIA, (tx) => tx`update foto.links set pin_hash = ${link.hashPin('1234')} where galeria = ${g.id}`)
  await comoPessoa(LIA, (tx) => tx`update foto.links set pin_hash = null where galeria = ${g.id}`)
  assert.equal((await dono`select pin_versao from foto.links where galeria = ${g.id}`)[0].pin_versao, 2)
  await comoPessoa(LIA, (tx) => tx`update foto.links set revogado_em = now() where galeria = ${g.id}`)
  for (const mexida of [
    (tx) => tx`update foto.links set revogado_em = null where galeria = ${g.id}`,
    (tx) => tx`update foto.links set pin_hash = ${link.hashPin('9999')} where galeria = ${g.id}`,
    (tx) => tx`update foto.links set expira_em = now() + interval '5 days' where galeria = ${g.id}`,
  ]) {
    await assert.rejects(comoPessoa(LIA, mexida), /link:revogado/)
  }
  // depois do envio do cliente (porta), as fotos ficam como estão até reabrir
  const token2 = link.novoToken()
  await comoPessoa(LIA, (tx) => tx`insert into foto.links ${tx({ ...novo(), token_hash: link.hashToken(token2) })}`)
  const th = link.hashToken(token2)
  await pelaPorta(async (tx) => {
    await tx`select foto.link_escolher(${th}, true, ${g.fotos[0]}::uuid, true)`
    await tx`select foto.link_enviar(${th}, true, 'Ana')`
  })
  assert.equal((await dono`select estado from foto.galerias where id = ${g.id}`)[0].estado, 'concluida')
  const r = registro(77)
  for (const mexida of [
    (tx) => tx`delete from foto.galeria_fotos where id = ${g.fotos[1]}`,
    (tx) => tx`update foto.galeria_fotos set nome = 'outro.jpg' where id = ${g.fotos[1]}`,
    (tx) =>
      tx`insert into foto.galeria_fotos ${tx({ galeria: g.id, foto_id: r.fotoId, nome: r.nome, largura: 800, altura: 600, tipo: r.tipo, tamanho: r.tamanho, sha256: r.sha256 })}`,
  ]) {
    await assert.rejects(comoPessoa(LIA, mexida), /fotos:travada/)
  }
  await comoPessoa(LIA, (tx) => tx`update foto.galerias set estado = 'reaberta' where id = ${g.id}`)
  await comoPessoa(LIA, (tx) => tx`update foto.galeria_fotos set nome = 'outro.jpg' where id = ${g.fotos[1]}`)
  await comoPessoa(LIA, (tx) => tx`update foto.galerias set estado = 'encerrada' where id = ${g.id}`)
  await assert.rejects(
    comoPessoa(LIA, (tx) => tx`update foto.galerias set estado = 'publicada' where id = ${g.id}`),
    /galeria:estado/,
  )
  // apagar a galeria leva fotos, links, seleção e envios
  await comoPessoa(LIA, (tx) => tx`delete from foto.galerias where id = ${g.id}`)
  const [resto] = await dono`select
    (select count(*)::int from foto.galeria_fotos where galeria = ${g.id}) as fotos, (select count(*)::int from foto.links where galeria = ${g.id}) as links,
    (select count(*)::int from foto.selecao where galeria = ${g.id}) as selecao, (select count(*)::int from foto.envios where galeria = ${g.id}) as envios`
  assert.deepEqual({ ...resto }, { fotos: 0, links: 0, selecao: 0, envios: 0 })
  // teto: 1.500 fotos por galeria
  const cheia = await galeriaPronta(LIA, 0)
  const lote = (de, n) =>
    Array.from({ length: n }, (_, i) => ({
      galeria: cheia.id,
      foto_id: `f-${de + i}`,
      nome: `f-${de + i}.jpg`,
      largura: 800,
      altura: 600,
      tipo: 'image/jpeg',
      tamanho: 1000,
      sha256: 'b'.repeat(64),
    }))
  await comoPessoa(LIA, async (tx) => {
    await tx`insert into foto.galeria_fotos ${tx(lote(0, 750))}`
    await tx`insert into foto.galeria_fotos ${tx(lote(750, 750))}`
  })
  await assert.rejects(
    comoPessoa(LIA, (tx) => tx`insert into foto.galeria_fotos ${tx(lote(1500, 1))}`),
    /fotos:teto/,
  )
  await comoPessoa(LIA, (tx) => tx`delete from foto.galerias where id = ${cheia.id}`)
})

test('rotas: sem sessão, 401; sem a claim do app, 401; sem armazenamento, 503 em tudo (nunca fingir que publicou)', { skip: pular }, async () => {
  assert.equal((await galerias('GET', '', { semSessao: true })).statusCode, 401)
  const r = resposta()
  const semClaim = `foto_conta=${z.selar(z.COOKIE_CONTA, { sub: 'zro-lia', nome: 'Lia', apps: ['radio'], org: { id: 'org-1' } }, 3600)}`
  await rotaGalerias({ method: 'GET', url: '/api/foto/galerias', headers: { host: SITE, 'x-forwarded-proto': 'https', cookie: semClaim } }, r)
  assert.equal(r.statusCode, 401)
  // escrita de outra origem não entra
  assert.equal((await galerias('POST', '', { corpo: { nome: 'x', contratadas: 1 }, origem: 'https://outro.exemplo' })).statusCode, 403)
  const dir = process.env.FOTO_ARQUIVOS_DIR
  delete process.env.FOTO_ARQUIVOS_DIR
  try {
    for (const [metodo, caminho, corpo] of [
      ['GET', ''],
      ['POST', '', { nome: 'Casamento', contratadas: 10 }],
      ['GET', '00000000-0000-4000-8000-000000000000'],
      ['POST', '00000000-0000-4000-8000-000000000000/publicar'],
      ['GET', '00000000-0000-4000-8000-000000000000/selecao'],
    ]) {
      const s = await galerias(metodo, caminho, { corpo })
      assert.deepEqual([s.statusCode, s.corpo], [503, { ok: false, erro: 'sem_armazenamento' }], `${metodo} ${caminho}`)
    }
    assert.equal((await dono`select count(*)::int as n from foto.galerias where nome = 'Casamento' and contratadas = 10`)[0].n, 0)
    // na Vercel a pasta local não vale (o disco some): continua sem armazenamento
    process.env.FOTO_ARQUIVOS_DIR = dir
    process.env.VERCEL = '1'
    assert.equal((await galerias('GET')).statusCode, 503)
  } finally {
    delete process.env.VERCEL
    process.env.FOTO_ARQUIVOS_DIR = dir
  }
  assert.equal((await galerias('GET')).statusCode, 200)
})

test('rotas do fotógrafo: da criação à seleção, com a pasta local', { skip: pular }, async () => {
  // criar: o nome de quem o cliente vê vem da sessão quando não é dito
  const ruim = await galerias('POST', '', { corpo: { nome: '   ', contratadas: 10 } })
  assert.deepEqual([ruim.statusCode, ruim.corpo], [400, { ok: false, erro: 'campo', campo: 'nome' }])
  assert.equal((await galerias('POST', '', { corpo: { nome: 'Ensaio', contratadas: 0 } })).corpo.campo, 'contratadas')
  assert.equal((await galerias('POST', '', { corpo: { nome: 'Ensaio', contratadas: 5, prazo: 'ontem' } })).corpo.campo, 'prazo')
  const criada = await galerias('POST', '', {
    corpo: {
      nome: '  Casamento Ana & Rui ',
      contratadas: 2,
      permiteExtras: true,
      precoExtra: 'R$ 25 por foto',
      prazo: '2030-01-15T12:00:00.000Z',
      mensagem: 'Escolham com calma.',
      dono: 'zro-rui',
      estado: 'publicada',
    },
  })
  assert.equal(criada.statusCode, 201)
  const g = criada.corpo.galeria
  assert.deepEqual(
    {
      nome: g.nome,
      fotografo: g.fotografo,
      contratadas: g.contratadas,
      permiteExtras: g.permiteExtras,
      precoExtra: g.precoExtra,
      estado: g.estado,
      marcaDagua: g.marcaDagua,
      mensagem: g.mensagem,
      fotos: g.fotos,
      link: g.link,
      envio: g.envio,
    },
    {
      nome: 'Casamento Ana & Rui',
      fotografo: 'Lia Fotógrafa',
      contratadas: 2,
      permiteExtras: true,
      precoExtra: 'R$ 25 por foto',
      estado: 'rascunho',
      marcaDagua: true,
      mensagem: 'Escolham com calma.',
      fotos: 0,
      link: null,
      envio: null,
    },
  )
  assert.equal(new Date(g.prazo).toISOString(), '2030-01-15T12:00:00.000Z')
  assert.deepEqual({ ...(await dono`select dono, organizacao from foto.galerias where id = ${g.id}`)[0] }, { dono: 'zro-lia', organizacao: 'org-1' })
  // outra pessoa não vê, não altera, não publica, não apaga: 404 (como se não existisse)
  for (const [metodo, caminho, corpo] of [
    ['GET', g.id],
    ['PATCH', g.id, { nome: 'Minha' }],
    ['POST', `${g.id}/publicar`],
    ['GET', `${g.id}/selecao`],
    ['DELETE', g.id],
    ['POST', `${g.id}/fotos`, { fotos: [registro(1)] }],
  ]) {
    assert.equal((await galerias(metodo, caminho, { pessoa: RUI, corpo })).statusCode, 404, `${metodo} ${caminho}`)
  }
  assert.deepEqual((await galerias('GET', '', { pessoa: RUI })).corpo.galerias, [])
  assert.equal((await galerias('GET', '', { pessoa: LIA })).corpo.galerias.filter((x) => x.id === g.id).length, 1)

  // alterar
  const alterada = await galerias('PATCH', g.id, { corpo: { fotografo: 'Lia Fotografia', marcaDagua: false, mensagem: '' } })
  assert.deepEqual(
    [alterada.corpo.galeria.fotografo, alterada.corpo.galeria.marcaDagua, alterada.corpo.galeria.mensagem, alterada.corpo.galeria.nome],
    ['Lia Fotografia', false, null, 'Casamento Ana & Rui'],
  )

  // publicar sem fotos não dá
  assert.deepEqual((await galerias('POST', `${g.id}/publicar`)).corpo, { ok: false, erro: 'sem_fotos' })

  // registrar em lote (com pilha e miniatura numa delas)
  const mini = jpeg(901, 200)
  const lote = [
    registro(1, { grupo: 'p1', melhor: true }),
    registro(2, { grupo: 'p1' }),
    registro(3, { mini: { tipo: 'image/jpeg', tamanho: mini.length, sha256: sha256(mini) } }),
  ]
  assert.equal((await galerias('POST', `${g.id}/fotos`, { corpo: { fotos: [{ ...registro(9), tipo: 'image/png' }] } })).statusCode, 400)
  assert.equal((await galerias('POST', `${g.id}/fotos`, { corpo: { fotos: [{ ...registro(9), tamanho: 5 * 1024 * 1024 }] } })).statusCode, 400)
  assert.equal((await galerias('POST', `${g.id}/fotos`, { corpo: { fotos: [registro(9), registro(9)] } })).corpo.repetida, true)
  const registradas = await galerias('POST', `${g.id}/fotos`, { corpo: { fotos: lote } })
  assert.equal(registradas.statusCode, 200)
  const fotos = registradas.corpo.fotos
  assert.deepEqual(
    fotos.map((f) => [f.fotoId, f.ordem, f.grupo, f.melhor, f.enviada, f.mini?.enviada ?? null]),
    [
      ['cat-1', 0, 'p1', true, false, null],
      ['cat-2', 1, 'p1', false, false, null],
      ['cat-3', 2, null, false, false, false],
    ],
  )
  // registrar de novo a mesma foto atualiza (não duplica)
  await galerias('POST', `${g.id}/fotos`, { corpo: { fotos: [registro(2, { grupo: 'p1', ordem: 1, nome: 'IMG_0002-editada.CR3' })] } })
  assert.equal((await galerias('GET', g.id)).corpo.fotos.length, 3)
  assert.deepEqual((await galerias('POST', `${g.id}/publicar`)).corpo, { ok: false, erro: 'faltam_arquivos', faltam: 3 })

  // enviar as prévias: tipo, tamanho, sha256 e GPS conferidos; só a dona
  const enviar = (foto, bytes, variante, pessoa) => galerias('PUT', `${g.id}/arquivo?foto=${foto}${variante ? `&v=${variante}` : ''}`, { bytes, pessoa })
  assert.deepEqual((await enviar(fotos[0].id, jpeg(2))).corpo, { ok: false, erro: 'sha256' })
  assert.deepEqual((await enviar(fotos[0].id, jpeg(1, 601))).corpo, { ok: false, erro: 'tamanho' })
  assert.deepEqual((await enviar(fotos[0].id, Buffer.from('<html>oi</html> isto não é imagem'))).corpo, { ok: false, erro: 'tipo' })
  assert.equal((await enviar(fotos[0].id, Buffer.alloc(4 * 1024 * 1024 + 1))).statusCode, 413)
  assert.equal((await enviar(fotos[0].id, jpeg(1), null, RUI)).statusCode, 404)
  assert.equal((await enviar(fotos[1].id, jpeg(1))).corpo.erro, 'sha256')
  assert.deepEqual((await enviar(fotos[1].id, jpeg(2), 'mini')).corpo, { ok: false, erro: 'sem_mini' })
  assert.equal(existsSync(join(pasta, 'g', g.id)), false, 'nada foi gravado até aqui')
  // prévia com posição de GPS no EXIF: recusada mesmo com tipo, tamanho e sha256 certos (a tela tira; o servidor confere)
  const comGps = Buffer.concat([
    jpeg(4).subarray(0, 2),
    Buffer.from('ffe100224578696600004949' + '2a00080000000100258804000100000' + '01a00000000000000', 'hex'),
    jpeg(4).subarray(2),
  ])
  const [marcada] = (await galerias('POST', `${g.id}/fotos`, { corpo: { fotos: [{ ...registro(4), tamanho: comGps.length, sha256: sha256(comGps) }] } })).corpo
    .fotos
  assert.deepEqual((await enviar(marcada.id, comGps)).corpo, { ok: false, erro: 'gps' })
  assert.equal(existsSync(join(pasta, 'g', g.id)), false)
  assert.deepEqual((await galerias('DELETE', `${g.id}/fotos`, { corpo: { ids: [marcada.id] } })).corpo, { ok: true, fotos: 1, arquivos: 0 })
  for (let i = 0; i < 3; i++) assert.deepEqual((await enviar(fotos[i].id, jpeg(i + 1))).corpo, { ok: true, foto: fotos[i].id, variante: 'previa' })
  assert.deepEqual((await enviar(fotos[2].id, mini, 'mini')).corpo, { ok: true, foto: fotos[2].id, variante: 'mini' })
  assert.deepEqual(readdirSync(join(pasta, 'g', g.id)).sort(), [fotos[0].id, fotos[1].id, fotos[2].id, `${fotos[2].id}-m`].sort())
  const lida = (await galerias('GET', g.id)).corpo
  assert.deepEqual([lida.galeria.fotos, lida.galeria.enviadas], [3, 3])
  assert.deepEqual(
    lida.fotos.map((f) => [f.nome, f.enviada, f.mini?.enviada ?? null]),
    [
      ['IMG_0001.CR3', true, null],
      ['IMG_0002-editada.CR3', true, null],
      ['IMG_0003.CR3', true, true],
    ],
  )

  // publicar: o endereço sai UMA vez; o token não fica legível no banco
  assert.equal((await galerias('POST', `${g.id}/publicar`, { corpo: { pin: '12' } })).corpo.campo, 'pin')
  assert.equal((await galerias('POST', `${g.id}/publicar`, { corpo: { validadeDias: 400 } })).corpo.campo, 'validadeDias')
  const pub = await galerias('POST', `${g.id}/publicar`, { corpo: { pin: '2468', validadeDias: 20 } })
  assert.equal(pub.statusCode, 201)
  assert.match(pub.corpo.endereco, /^https:\/\/foto\.absolutezro\.com\/g\/[A-Za-z0-9_-]{43}$/)
  const token = pub.corpo.endereco.split('/g/')[1]
  assert.equal(pub.corpo.galeria.estado, 'publicada')
  assert.deepEqual([pub.corpo.galeria.link.temPin, pub.corpo.galeria.link.vivo, pub.corpo.galeria.link.aberturas], [true, true, 0])
  const dias = (new Date(pub.corpo.galeria.link.expiraEm) - Date.now()) / 86400000
  assert.ok(dias > 19.9 && dias < 20.1)
  const tudo = JSON.stringify(
    await dono`select to_jsonb(l) as l, (select to_jsonb(g) from foto.galerias g where g.id = l.galeria) as g from foto.links l where l.galeria = ${g.id}`,
  )
  assert.ok(!tudo.includes(token), 'o token não pode estar em coluna nenhuma')
  assert.ok(tudo.includes(link.hashToken(token)))
  assert.ok(!JSON.stringify((await galerias('GET', g.id)).corpo).includes(token), 'ler a galeria não devolve o endereço de novo')
  assert.deepEqual((await galerias('POST', `${g.id}/publicar`)).corpo, { ok: false, erro: 'estado', estado: 'publicada' })

  // o cliente abre, escolhe três (uma extra), comenta e envia (pela porta; a página usa as rotas de api/link)
  const th = link.hashToken(token)
  await pelaPorta(async (tx) => {
    assert.deepEqual((await tx`select foto.link_abrir(${th}, false, true) as r`)[0].r, { estado: 'pin' })
    for (const f of fotos) await tx`select foto.link_escolher(${th}, true, ${f.id}::uuid, true)`
    await tx`select foto.link_comentar(${th}, true, ${fotos[1].id}::uuid, 'Tirar o fio atrás', array['remover_objeto', 'suavizar_pele'])`
  })
  const parcial = (await galerias('GET', `${g.id}/selecao`)).corpo
  assert.deepEqual([parcial.enviada, parcial.escolhidas, parcial.extras, parcial.envio], [false, 3, 1, null])
  assert.deepEqual((await galerias('POST', `${g.id}/reabrir`)).corpo, { ok: false, erro: 'estado', estado: 'publicada' })
  await pelaPorta((tx) => tx`select foto.link_enviar(${th}, true, 'Ana Cliente')`)

  // ler a seleção: ids do catálogo, comentários, etiquetas, extras, quem enviou e quando, e a lista para colar
  const s = (await galerias('GET', `${g.id}/selecao`)).corpo
  assert.deepEqual([s.enviada, s.escolhidas, s.extras, s.galeria.estado], [true, 3, 1, 'concluida'])
  assert.deepEqual(s.ids, ['cat-1', 'cat-2', 'cat-3'])
  assert.deepEqual([s.envio.nome, s.envio.escolhidas, s.envio.extras], ['Ana Cliente', 3, 1])
  assert.ok(Date.now() - new Date(s.envio.em) < 60000)
  assert.deepEqual(
    s.fotos.map((f) => [f.fotoId, f.nome, f.escolhida, f.comentario, f.etiquetas]),
    [
      ['cat-1', 'IMG_0001.CR3', true, null, []],
      ['cat-2', 'IMG_0002-editada.CR3', true, 'Tirar o fio atrás', ['remover_objeto', 'suavizar_pele']],
      ['cat-3', 'IMG_0003.CR3', true, null, []],
    ],
  )
  assert.deepEqual(s.listas, {
    nomes: ['IMG_0001.CR3', 'IMG_0002-editada.CR3', 'IMG_0003.CR3'],
    lightroom: 'IMG_0001, IMG_0002-editada, IMG_0003',
    captureOne: 'IMG_0001\nIMG_0002-editada\nIMG_0003',
  })
  const naLista = (await galerias('GET')).corpo.galerias.find((x) => x.id === g.id)
  assert.deepEqual([naLista.estado, naLista.escolhidas, naLista.envio.nome, naLista.link.aberturas], ['concluida', 3, 'Ana Cliente', 0])

  // enviada = congelada: nem foto nova, nem arquivo novo, nem tirar foto, até reabrir
  assert.deepEqual((await galerias('POST', `${g.id}/fotos`, { corpo: { fotos: [registro(4)] } })).corpo, { ok: false, erro: 'travada' })
  assert.deepEqual((await enviar(fotos[0].id, jpeg(1))).corpo, { ok: false, erro: 'travada' })
  assert.deepEqual((await galerias('DELETE', `${g.id}/fotos`, { corpo: { ids: [fotos[0].id] } })).corpo, { ok: false, erro: 'travada' })
  assert.equal((await galerias('POST', `${g.id}/reabrir`)).corpo.galeria.estado, 'reaberta')
  assert.equal((await pelaPorta((tx) => tx`select foto.link_escolher(${th}, true, ${fotos[2].id}::uuid, false) as r`))[0].r.escolhidas, 2)

  // PIN: remover, definir de novo (a versão sobe) e estender a validade
  assert.equal((await galerias('PATCH', `${g.id}/link`, { corpo: { pin: null } })).corpo.galeria.link.temPin, false)
  assert.equal((await galerias('PATCH', `${g.id}/link`, { corpo: { pin: 'abcd' } })).corpo.campo, 'pin')
  const comPin = await galerias('PATCH', `${g.id}/link`, { corpo: { pin: '13579', validadeDias: 60 } })
  assert.equal(comPin.corpo.galeria.link.temPin, true)
  assert.ok((new Date(comPin.corpo.galeria.link.expiraEm) - Date.now()) / 86400000 > 59.9)
  assert.equal((await dono`select pin_versao from foto.links where galeria = ${g.id} and revogado_em is null`)[0].pin_versao, 2)

  // trocar o link: o antigo morre na hora, o novo sai uma vez
  const troca = await galerias('POST', `${g.id}/link`, { corpo: {} })
  assert.equal(troca.statusCode, 201)
  const token2 = troca.corpo.endereco.split('/g/')[1]
  assert.notEqual(token2, token)
  assert.equal(troca.corpo.galeria.link.temPin, false)
  assert.equal((await pelaPorta((tx) => tx`select foto.link_pin(${th}) as r`))[0].r, null)
  assert.notEqual((await pelaPorta((tx) => tx`select foto.link_pin(${link.hashToken(token2)}) as r`))[0].r, null)

  // revogar: sem link, o cliente não entra; dá para criar outro
  assert.equal((await galerias('DELETE', `${g.id}/link`)).corpo.galeria.link, null)
  assert.equal((await pelaPorta((tx) => tx`select foto.link_pin(${link.hashToken(token2)}) as r`))[0].r, null)
  assert.deepEqual((await galerias('DELETE', `${g.id}/link`)).corpo, { ok: false, erro: 'sem_link' })
  assert.deepEqual((await galerias('PATCH', `${g.id}/link`, { corpo: { pin: '1234' } })).corpo, { ok: false, erro: 'sem_link' })
  const token3 = (await galerias('POST', `${g.id}/link`, { corpo: { pin: '1234' } })).corpo.endereco.split('/g/')[1]
  assert.notEqual((await pelaPorta((tx) => tx`select foto.link_pin(${link.hashToken(token3)}) as r`))[0].r, null)

  // tirar uma foto leva o arquivo dela (e a marca do cliente nela)
  const tirada = await galerias('DELETE', `${g.id}/fotos`, { corpo: { ids: [fotos[2].id] } })
  assert.deepEqual(tirada.corpo, { ok: true, fotos: 1, arquivos: 2 })
  assert.deepEqual(readdirSync(join(pasta, 'g', g.id)).sort(), [fotos[0].id, fotos[1].id].sort())

  // encerrar: o link morre; a seleção continua legível
  assert.equal((await galerias('POST', `${g.id}/encerrar`)).corpo.galeria.estado, 'encerrada')
  assert.equal((await pelaPorta((tx) => tx`select foto.link_pin(${link.hashToken(token3)}) as r`))[0].r, null)
  assert.deepEqual((await galerias('POST', `${g.id}/link`, { corpo: {} })).corpo, { ok: false, erro: 'estado', estado: 'encerrada' })
  assert.deepEqual((await galerias('GET', `${g.id}/selecao`)).corpo.ids, ['cat-1', 'cat-2'])

  // apagar a galeria apaga os arquivos
  assert.deepEqual((await galerias('DELETE', g.id)).corpo, { ok: true, arquivos: 2 })
  assert.equal(existsSync(join(pasta, 'g', g.id)), false)
  assert.equal((await galerias('GET', g.id)).statusCode, 404)
  assert.equal((await dono`select count(*)::int as n from foto.galeria_fotos where galeria = ${g.id}`)[0].n, 0)
  // caminhos que não existem
  assert.equal((await galerias('GET', 'nao-e-uuid')).statusCode, 404)
  assert.equal((await galerias('POST', `${g.id}/inventada`)).statusCode, 404)
})

test('limpeza: galeria sem link vivo há N dias perde os arquivos; a ficha e a seleção ficam', { skip: pular }, async () => {
  const montar = async () => {
    const g = await publicada(LIA, 2)
    const arm = arquivos.armazenamento()
    const fotos = await dono`select id, chave from foto.galeria_fotos where galeria = ${g.id} order by ordem`
    for (const f of fotos) await arm.gravar(f.chave, jpeg(1), 'image/jpeg')
    await arm.gravar(`${fotos[0].chave}-m`, jpeg(2, 100), 'image/jpeg')
    await dono`update foto.galeria_fotos set mini_tipo = 'image/jpeg', mini_tamanho = 100, mini_sha256 = ${'c'.repeat(64)}, mini_enviada_em = now() where id = ${fotos[0].id}`
    return g
  }
  const viva = await montar()
  const vencida = await montar()
  const recente = await montar()
  const encerrada = await montar()
  await pelaPorta((tx) => tx`select foto.link_escolher(${link.hashToken(vencida.token)}, true, ${vencida.fotos[0]}::uuid, true)`)
  // o banco não deixa criar link vencido: o teste envelhece as linhas como dono
  await comoPessoa(LIA, (tx) => tx`update foto.galerias set estado = 'encerrada' where id = ${encerrada.id}`)
  await dono.begin(async (tx) => {
    await tx`alter table foto.links disable trigger links_guarda`
    await tx`alter table foto.galerias disable trigger galerias_guarda`
    await tx`update foto.links set criado_em = now() - interval '60 days', expira_em = now() - interval '45 days' where galeria = ${vencida.id}`
    await tx`update foto.links set criado_em = now() - interval '20 days', expira_em = now() - interval '10 days' where galeria = ${recente.id}`
    await tx`update foto.galerias set atualizada_em = now() - interval '40 days' where id = ${encerrada.id}`
    await tx`update foto.links set revogado_em = now() - interval '40 days' where galeria = ${encerrada.id}`
    await tx`alter table foto.links enable trigger links_guarda`
    await tx`alter table foto.galerias enable trigger galerias_guarda`
  })

  const r = await arquivos.limparVencidas({ dias: 30 })
  assert.deepEqual(r, { ok: true, galerias: 2, arquivos: 6 })
  const pastas = existsSync(join(pasta, 'g')) ? readdirSync(join(pasta, 'g')) : []
  assert.ok(pastas.includes(viva.id) && pastas.includes(recente.id))
  assert.ok(!pastas.includes(vencida.id) && !pastas.includes(encerrada.id))
  const [v] =
    await dono`select estado, arquivos_apagados_em is not null as apagados, (select count(*)::int from foto.galeria_fotos f where f.galeria = g.id and (f.enviada_em is not null or f.mini_enviada_em is not null)) as com_arquivo from foto.galerias g where id = ${vencida.id}`
  assert.deepEqual({ ...v }, { estado: 'encerrada', apagados: true, com_arquivo: 0 })
  // a fotógrafa ainda lê o que o cliente escolheu
  const s = (await galerias('GET', `${vencida.id}/selecao`)).corpo
  assert.deepEqual([s.galeria.estado, s.ids], ['encerrada', ['cat-1']])
  assert.equal((await dono`select estado from foto.galerias where id = ${viva.id}`)[0].estado, 'publicada')
  // de novo: nada a fazer
  assert.deepEqual(await arquivos.limparVencidas({ dias: 30 }), { ok: true, galerias: 0, arquivos: 0 })
  // prazo menor alcança a que venceu há 10 dias
  assert.deepEqual(await arquivos.limparVencidas({ dias: 7 }), { ok: true, galerias: 1, arquivos: 3 })
  await assert.rejects(arquivos.limparVencidas({ dias: 0 }), /dias/)
  assert.deepEqual(await arquivos.limparVencidas({ dias: 30, arm: null }), { ok: false, erro: 'sem_armazenamento' })
})

test('rotas de predefinições: gravar, listar (minhas e da equipe), ler, compartilhar, apagar', { skip: pular }, async () => {
  const json = { zro: 'foto.predefinicao', versao: 1, id: 'look-quente', nome: 'Quente', ajustes: { cor: { temperatura: 12 } } }
  assert.equal((await predefinicoes('PUT', null, { corpo: { chave: 'tem espaço', nome: 'x', json } })).corpo.campo, 'chave')
  assert.equal((await predefinicoes('PUT', null, { corpo: { chave: 'look-quente', nome: '', json } })).corpo.campo, 'nome')
  assert.equal((await predefinicoes('PUT', null, { corpo: { chave: 'look-quente', nome: 'Quente', json: [] } })).corpo.campo, 'json')
  assert.equal((await predefinicoes('PUT', null, { corpo: { chave: 'look-quente', nome: 'Quente', json: { a: 'x'.repeat(270000) } } })).statusCode, 413)
  const gravada = await predefinicoes('PUT', null, { corpo: { chave: 'look-quente', nome: 'Quente', familia: 'Retrato', json } })
  assert.equal(gravada.statusCode, 200, JSON.stringify(gravada.corpo))
  const p = gravada.corpo.predefinicao
  assert.deepEqual([p.chave, p.nome, p.familia, p.compartilhada, p.minha], ['look-quente', 'Quente', 'Retrato', false, true])
  assert.ok(p.tamanho > 50)
  // a mesma chave de novo atualiza (mesmo id)
  const regravada = await predefinicoes('PUT', null, {
    corpo: { chave: 'look-quente', nome: 'Quente 2', familia: 'Retrato', json: { ...json, nome: 'Quente 2' } },
  })
  assert.deepEqual([regravada.corpo.predefinicao.id, regravada.corpo.predefinicao.nome], [p.id, 'Quente 2'])
  // ler com o json; listar sem
  const lida = await predefinicoes('GET', p.id)
  assert.deepEqual(lida.corpo.predefinicao.json, { ...json, nome: 'Quente 2' })
  const lista = (await predefinicoes('GET')).corpo
  assert.deepEqual([lista.minhas.length, lista.equipe.length, 'json' in lista.minhas[0]], [1, 0, false])
  // o colega não vê até compartilhar; depois vê, lê, mas não altera nem apaga
  assert.deepEqual((await predefinicoes('GET', null, { pessoa: RUI })).corpo, { ok: true, minhas: [], equipe: [] })
  assert.equal((await predefinicoes('GET', p.id, { pessoa: RUI })).statusCode, 404)
  assert.equal((await predefinicoes('PATCH', p.id, { corpo: { compartilhada: true } })).corpo.predefinicao.compartilhada, true)
  const doRui = (await predefinicoes('GET', null, { pessoa: RUI })).corpo
  assert.deepEqual([doRui.minhas.length, doRui.equipe.map((e) => [e.nome, e.minha])], [0, [['Quente 2', false]]])
  assert.equal((await predefinicoes('GET', p.id, { pessoa: RUI })).corpo.predefinicao.json.nome, 'Quente 2')
  assert.equal((await predefinicoes('PATCH', p.id, { pessoa: RUI, corpo: { nome: 'Do Rui' } })).statusCode, 404)
  assert.equal((await predefinicoes('DELETE', p.id, { pessoa: RUI })).statusCode, 404)
  // outra organização e quem não tem equipe: nada
  assert.deepEqual((await predefinicoes('GET', null, { pessoa: EVA })).corpo.equipe, [])
  assert.equal((await predefinicoes('GET', p.id, { pessoa: EVA })).statusCode, 404)
  assert.deepEqual((await predefinicoes('PUT', null, { pessoa: ANA, corpo: { chave: 'a', nome: 'A', json, compartilhada: true } })).corpo, {
    ok: false,
    erro: 'sem_equipe',
  })
  assert.equal((await predefinicoes('PUT', null, { pessoa: ANA, corpo: { chave: 'a', nome: 'A', json } })).statusCode, 200)
  // sem sessão, 401; apagar
  assert.equal((await predefinicoes('GET', null, { semSessao: true })).statusCode, 401)
  assert.deepEqual((await predefinicoes('DELETE', p.id)).corpo, { ok: true })
  assert.equal((await predefinicoes('GET', p.id)).statusCode, 404)
  assert.deepEqual((await predefinicoes('GET', null, { pessoa: RUI })).corpo.equipe, [])
})
