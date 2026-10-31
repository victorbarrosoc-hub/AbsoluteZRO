/**
 * O BANCO DO CARRO (28/out) — `npm run test:banco`, num Postgres DE VERDADE
 * e descartável (TEST_DATABASE_URL; padrão postgres://postgres:postgres@
 * localhost:5432/postgres — `service postgresql start`). Nada toca num banco
 * de verdade nem na Absolute ZRO de verdade.
 *
 *  1. migrações: aplicam num banco vazio, a segunda vez não faz nada, e as
 *     três recusas (editada, sumida, fora de ordem); e rodam com um papel de
 *     login SEM superusuário, como o `carro_do_freela` de produção;
 *  2. RLS com duas pessoas: cada uma só lê e escreve o que é dela, carro_do_freela_app
 *     não vê a fila nem o diário, e o banco recusa telefone;
 *  3. a fila: cada mudança vira UM retrato do inventário inteiro, e o retrato
 *     passa no contrato freela.inventario/1 (o JSON Schema exportado de
 *     packages/media-contracts) e no payload do evento;
 *  4. o publicador: desligado por padrão; ligado, manda só o mais novo, e o
 *     que não deu certo vai para revisão, nunca de novo sozinho;
 *  5. as rotas /api/zro/perfil e /api/zro/inventario contra uma Absolute ZRO
 *     falsa: sessão obrigatória (conferida no HUB), mesma origem, JSON,
 *     regras (nenhum campo de telefone entra), isolamento entre contas,
 *     portão fechado e banco desligado.
 */
const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { Client } = require('pg');
const { iniciarZroFalsa } = require('./zro-falso.js');
const { conferir } = require('./_esquema.js');

const RAIZ = path.resolve(__dirname, '..', '..');
const ESQUEMAS = path.resolve(RAIZ, '..', '..', 'docs', 'integration-contracts', 'schemas');
const BASE = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';
const NOME_DB = 'carro_test_' + process.pid;
const NOME_DB2 = 'carro_test_papel_' + process.pid;
const PAPEL_MIG = 'carro_mig_' + process.pid;
const urlDe = db => { const u = new URL(BASE); u.pathname = '/' + db; return u.toString() };
const URL_TESTE = urlDe(NOME_DB);

const { migrar, lerMigracoes, conferir: conferirMigracoes } = require(path.join(RAIZ, 'db', 'migrador.js'));
const B = require(path.join(RAIZ, 'db', 'banco.js'));
const SYNC = require(path.join(RAIZ, 'db', 'sync.js'));
const R = require(path.join(RAIZ, 'db', 'regras.js'));

const A = crypto.randomUUID();
const BB = crypto.randomUUID();
let db;

async function admin(fn, url = BASE) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try { return await fn(c) } finally { await c.end() }
}

before(async () => {
  await admin(async c => {
    await c.query(`drop database if exists ${NOME_DB} with (force)`);
    await c.query(`create database ${NOME_DB}`);
  });
  db = B.criarBanco(URL_TESTE, { max: 4 });
});
after(async () => {
  await db.fechar();
  await B.fecharCompartilhado();
  await admin(async c => {
    await c.query(`drop database if exists ${NOME_DB} with (force)`);
    await c.query(`drop database if exists ${NOME_DB2} with (force)`);
    await c.query(`drop role if exists ${PAPEL_MIG}`);
  });
});

/* ===================== 1. migrações ===================== */

test('migrações: aplicam num banco vazio, e a segunda vez não faz nada', async () => {
  const feitas = await admin(c => migrar(c), URL_TESTE);
  assert.deepEqual(feitas, lerMigracoes().map(m => m.tag));
  assert.ok(feitas.includes('0000_fundacao'));
  assert.deepEqual(await admin(c => migrar(c), URL_TESTE), []);
  const { rows } = await admin(c => c.query("select tag, sha256 from carro_do_freela.__migracoes"), URL_TESTE);
  assert.equal(rows.length, feitas.length);
  assert.equal(rows[0].sha256, lerMigracoes()[0].hash);
  /* as três tabelas, e nenhuma coluna de telefone, CPF ou e-mail */
  const cols = await admin(c => c.query("select table_name, column_name from information_schema.columns where table_schema = 'carro_do_freela'"), URL_TESTE);
  for (const t of ['perfis', 'inventario', 'inventario_eventos']) assert.ok(cols.rows.some(r => r.table_name === t), t);
  assert.deepEqual(cols.rows.filter(r => /tel|fone|whats|cpf|email|celular/i.test(r.column_name)), []);
});

test('migrações: recusa a editada, a sumida e a nova fora de ordem — antes de aplicar qualquer coisa', async () => {
  const m = lerMigracoes();
  const aplicadas = m.map(x => ({ tag: x.tag, sha256: x.hash }));
  assert.deepEqual(conferirMigracoes(m, aplicadas), []);
  assert.match(conferirMigracoes(m, [{ tag: m[0].tag, sha256: 'outro' }]).join(), /foi editada: 0000_fundacao/);
  assert.match(conferirMigracoes(m, aplicadas.concat({ tag: '0001_x', sha256: 'h' })).join(), /0001_x sumiu/);
  assert.match(conferirMigracoes(m, [{ tag: '0005_y', sha256: 'h' }]).join(), /vem antes da última aplicada/);
  /* e no banco: uma cópia da pasta com a 0000 editada é recusada pelo migrador */
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'carro-mig-'));
  fs.writeFileSync(path.join(pasta, '0000_fundacao.sql'), m[0].sql + '\n-- editada\n');
  await assert.rejects(admin(c => migrar(c, pasta), URL_TESTE), /foi editada: 0000_fundacao/);
  fs.writeFileSync(path.join(pasta, 'sem-numero.sql'), 'select 1');
  assert.throws(() => lerMigracoes(pasta), /fora do padrão/);
  fs.rmSync(pasta, { recursive: true, force: true });
});

/* O schema como ele está em produção (lido em 29/out): as três tabelas do app antigo, dono postgres, `anon` com
   USAGE no schema e só INSERT nas tabelas, por política. Só a forma — nenhum dado. */
const LEGADO = `
  do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; end $$;
  create schema carro_do_freela;
  grant usage on schema carro_do_freela to anon;
  create table carro_do_freela.cadastros (id bigint generated by default as identity primary key, quando timestamptz not null default now(),
    quem text not null, lado text, nome text, praca text, funcoes text[], contato text not null, versao text);
  create table carro_do_freela.leads (id bigint generated by default as identity primary key, criado_em timestamptz not null default now(),
    lado text not null check (lado in ('freela','contratante')), nome text not null, whatsapp text not null, praca text not null,
    funcao text, tipo_negocio text, jobs_mes text, aceite_contato boolean not null, aceite_publicacao boolean, dias_livres text[]);
  create table carro_do_freela.passos (id bigint generated by default as identity primary key, quando timestamptz not null default now(),
    quem text not null, passo text not null, lado text, volta boolean, versao text);
  alter table carro_do_freela.cadastros enable row level security;
  alter table carro_do_freela.leads enable row level security;
  alter table carro_do_freela.passos enable row level security;
  create policy insercao_publica on carro_do_freela.cadastros for insert to anon with check (true);
  create policy insercao_publica on carro_do_freela.leads for insert to anon with check (true);
  create policy insercao_publica on carro_do_freela.passos for insert to anon with check (true);
  grant insert on carro_do_freela.cadastros, carro_do_freela.leads, carro_do_freela.passos to anon;
  insert into carro_do_freela.passos (quem, passo) values ('aparelho-teste', 'abriu');
`;
const retratoLegado = c => c.query(`
  select 'tab' k, c.relname a, pg_get_userbyid(c.relowner) b, coalesce(array_to_string(c.relacl, ','), '') d
    from pg_class c where c.relnamespace = 'carro_do_freela'::regnamespace and c.relname in ('cadastros','leads','passos') and c.relkind = 'r'
  union all select 'pol', tablename || ':' || policyname, cmd, array_to_string(roles, ',') from pg_policies where schemaname = 'carro_do_freela'
    and tablename in ('cadastros','leads','passos')
  union all select 'col', table_name || '.' || column_name, data_type, is_nullable from information_schema.columns
    where table_schema = 'carro_do_freela' and table_name in ('cadastros','leads','passos')
  union all select 'linhas', 'passos', (select count(*)::text from carro_do_freela.passos), ''
  order by 1, 2`).then(r => r.rows);

test('migrações: no schema que JÁ EXISTE em produção (tabelas antigas, anon só INSERT), com o login sem superusuário — nada antigo muda', async () => {
  const senha = crypto.randomBytes(12).toString('hex');
  await admin(async c => {
    await c.query(`drop database if exists ${NOME_DB2} with (force)`);
    await c.query(`create database ${NOME_DB2}`);
    await c.query(`drop role if exists ${PAPEL_MIG}`);
    await c.query(`create role ${PAPEL_MIG} login password '${senha}' nosuperuser nocreaterole`);
  });
  const urlAdmin = urlDe(NOME_DB2);
  const antes = await admin(async c => {
    await c.query(LEGADO);
    /* os passos de produção (db/PRODUCAO.md): o papel sem login existe, o login pode assumi-lo, e o schema passa a ser
       do login (as tabelas antigas continuam do postgres) */
    await c.query(`grant carro_do_freela_app to ${PAPEL_MIG}`);
    await c.query(`alter schema carro_do_freela owner to ${PAPEL_MIG}`);
    return retratoLegado(c);
  }, urlAdmin);
  const u = new URL(urlAdmin);
  u.username = PAPEL_MIG;
  u.password = senha;
  assert.deepEqual(await admin(c => migrar(c), u.toString()), lerMigracoes().map(m => m.tag));
  await admin(async c => {
    assert.deepEqual(await retratoLegado(c), antes, 'tabelas, colunas, permissões, políticas e linhas antigas iguais');
    const dono = await c.query("select tablename, tableowner from pg_tables where schemaname = 'carro_do_freela' order by 1");
    assert.deepEqual(dono.rows.filter(r => ['inventario', 'perfis', 'inventario_eventos', '__migracoes'].includes(r.tablename)).map(r => r.tableowner), [PAPEL_MIG, PAPEL_MIG, PAPEL_MIG, PAPEL_MIG]);
    const anon = await c.query(`select has_schema_privilege('anon', 'carro_do_freela', 'usage') usage,
      has_table_privilege('anon', 'carro_do_freela.passos', 'insert') legado,
      has_table_privilege('anon', 'carro_do_freela.inventario', 'select') novo_select,
      has_table_privilege('anon', 'carro_do_freela.perfis', 'insert') novo_insert,
      has_table_privilege('carro_do_freela_app', 'carro_do_freela.passos', 'select') app_no_legado`);
    assert.deepEqual(anon.rows[0], { usage: true, legado: true, novo_select: false, novo_insert: false, app_no_legado: false });
  }, urlAdmin);
});

/* ===================== 2. RLS ===================== */

const novoItem = (c, sub, modelo, extra = {}) =>
  c.query('insert into carro_do_freela.inventario (sub, categoria, modelo, marca, diaria_cents) values ($1, $2, $3, $4, $5) returning *',
    [sub, extra.categoria || 'camera', modelo, extra.marca || null, extra.diaria === undefined ? null : extra.diaria]).then(r => r.rows[0]);

test('RLS: cada pessoa só lê e escreve o que é dela', async () => {
  const itemA = await db.asUser(A, async c => {
    await c.query("insert into carro_do_freela.perfis (sub, nome_exibicao, funcoes) values ($1, 'Freela A', '{Op. de câmera}')", [A]);
    return novoItem(c, A, 'FX3', { marca: 'Sony' });
  });
  await db.asUser(BB, c => novoItem(c, BB, 'Mavic 3', { categoria: 'drone' }));
  /* B não vê nada de A */
  const vistoB = await db.asUser(BB, async c => ({
    perfis: (await c.query('select sub from carro_do_freela.perfis')).rows,
    itens: (await c.query('select modelo from carro_do_freela.inventario')).rows,
  }));
  assert.deepEqual(vistoB.perfis, []);
  assert.deepEqual(vistoB.itens.map(r => r.modelo), ['Mavic 3']);
  /* B não muda nem apaga o item de A, nem pelo id */
  assert.equal(await db.asUser(BB, async c => (await c.query("update carro_do_freela.inventario set modelo = 'X' where id = $1", [itemA.id])).rowCount), 0);
  assert.equal(await db.asUser(BB, async c => (await c.query('delete from carro_do_freela.inventario where id = $1', [itemA.id])).rowCount), 0);
  /* B não cria em nome de A, nem passa o item dele para A */
  await assert.rejects(db.asUser(BB, c => novoItem(c, A, 'Intruso')), e => e.code === '42501');
  await assert.rejects(db.asUser(BB, c => c.query("insert into carro_do_freela.perfis (sub, nome_exibicao) values ($1, 'Falso')", [A])), e => e.code === '42501');
  await assert.rejects(db.asUser(BB, c => c.query('update carro_do_freela.inventario set sub = $1', [A])), e => e.code === '42501');
  /* A segue com o dele intacto */
  const vistoA = await db.asUser(A, async c => (await c.query('select modelo from carro_do_freela.inventario')).rows);
  assert.deepEqual(vistoA.map(r => r.modelo), ['FX3']);
});

test('RLS: carro_do_freela_app sem pessoa não vê nada, e não lê a fila nem o diário das migrações', async () => {
  const sem = await db.asSystem('teste', async c => {
    await c.query('set local role carro_do_freela_app');
    return (await c.query('select count(*)::int n from carro_do_freela.inventario')).rows[0].n;
  });
  assert.equal(sem, 0);
  await assert.rejects(db.asUser(A, c => c.query('select * from carro_do_freela.inventario_eventos')), e => e.code === '42501');
  await assert.rejects(db.asUser(A, c => c.query('select * from carro_do_freela.__migracoes')), e => e.code === '42501');
  await assert.rejects(db.asUser(A, c => c.query("insert into carro_do_freela.inventario_eventos (sub, idempotency_key, payload) values ($1, 'x', '{}')", [A])), e => e.code === '42501');
  await assert.rejects(db.asUser('nao-e-uuid', async () => 1), /sub inválido/);
});

test('o banco recusa telefone e link de WhatsApp, mesmo se o servidor deixar passar', async () => {
  for (const [sql, args] of [
    ["insert into carro_do_freela.perfis (sub, nome_exibicao, bio) values ($1, 'X', $2)", [A, 'chama no (84) 99999-0000']],
    ["update carro_do_freela.perfis set bio = $2 where sub = $1", [A, 'zap 84999990000']],
    ["update carro_do_freela.perfis set portfolio_url = $2 where sub = $1", [A, 'https://wa.me/5584999990000']],
    ["insert into carro_do_freela.inventario (sub, modelo, observacao) values ($1, 'Lente', $2)", [A, 'falar com +55 84 3222-1111']],
  ])
    await assert.rejects(db.asUser(A, c => c.query(sql, args)), e => e.code === '23514' || e.code === '23505', sql);
});

/* ===================== 3. a fila (outbox) ===================== */

const esquemaInv = JSON.parse(fs.readFileSync(path.join(ESQUEMAS, 'freela.inventario.v1.schema.json'), 'utf8'));
const esquemaEv = JSON.parse(fs.readFileSync(path.join(ESQUEMAS, 'event.freela.inventario.atualizado.v1.schema.json'), 'utf8'));
const eventosDe = sub => db.asSystem('teste', async c => (await c.query('select * from carro_do_freela.inventario_eventos where sub = $1 order by id', [sub])).rows);

test('a fila: cada mudança grava o inventário INTEIRO, e o retrato passa no contrato freela.inventario/1', async () => {
  const C = crypto.randomUUID();
  await db.asUser(C, async c => {
    await novoItem(c, C, 'A7S III', { marca: 'Sony', diaria: 25000 });
    await novoItem(c, C, '24-70 f2.8', { categoria: 'lente' });
  });
  let evs = await eventosDe(C);
  assert.equal(evs.length, 1, 'duas mudanças na mesma transação = um retrato só');
  const ev = evs[0];
  assert.equal(ev.estado, 'pendente');
  assert.equal(ev.tipo, 'freela.inventario.atualizado');
  assert.match(ev.idempotency_key, new RegExp('^freela\\.inventario:' + C + ':\\d{4}-\\d{2}-\\d{2}T'));
  assert.equal(ev.idempotency_key, 'freela.inventario:' + C + ':' + ev.payload.inventario.atualizado_em);
  assert.deepEqual(conferir(esquemaEv, ev.payload), []);
  assert.deepEqual(conferir(esquemaInv, ev.payload.inventario), []);
  assert.equal(ev.payload.source, 'carro-do-freela');
  assert.equal(ev.payload.inventario.sub, C);
  assert.deepEqual(ev.payload.inventario.itens.map(i => [i.modelo, i.diaria_cents]), [['A7S III', 25000], ['24-70 f2.8', null]]);
  /* o conferidor reprova de verdade: campo a mais e telefone não passam */
  assert.notDeepEqual(conferir(esquemaInv, Object.assign({}, ev.payload.inventario, { telefone: '84999990000' })), []);
  assert.notDeepEqual(conferir(esquemaInv, Object.assign({}, ev.payload.inventario, { sub: 'zro-111' })), []);
  /* apagar e desativar também viram retrato */
  await db.asUser(C, c => c.query("update carro_do_freela.inventario set ativo = false where modelo = 'A7S III'"));
  await db.asUser(C, c => c.query("delete from carro_do_freela.inventario where modelo = '24-70 f2.8'"));
  evs = await eventosDe(C);
  assert.equal(evs.length, 3);
  const ultimo = evs[2].payload.inventario;
  assert.deepEqual(ultimo.itens.map(i => [i.modelo, i.ativo]), [['A7S III', false]]);
  assert.deepEqual(conferir(esquemaInv, ultimo), []);
  /* inventário vazio também é retrato válido (o Maestro desativa o que sumiu) */
  await db.asUser(C, c => c.query('delete from carro_do_freela.inventario'));
  const vazio = (await eventosDe(C)).pop().payload;
  assert.deepEqual(vazio.inventario.itens, []);
  assert.deepEqual(conferir(esquemaEv, vazio), []);
});

test('a fila: até 500 itens por pessoa (o máximo do contrato)', async () => {
  const D = crypto.randomUUID();
  await db.asUser(D, c => c.query("insert into carro_do_freela.inventario (sub, modelo) select $1, 'Item ' || g from generate_series(1, 500) g", [D]));
  await assert.rejects(db.asUser(D, c => novoItem(c, D, 'O 501')), e => e.code === '23514' && /500/.test(e.message));
  const ev = (await eventosDe(D)).pop().payload;
  assert.equal(ev.inventario.itens.length, 500);
  assert.deepEqual(conferir(esquemaEv, ev), []);
});

/* ===================== 4. o publicador ===================== */

test('o publicador: desligado por padrão — nada sai e a fila fica pendente', async () => {
  let chamou = 0;
  const r = await SYNC.publicar(db, { env: {}, autorizacao: 'Bearer x', buscar: async () => { chamou++; return { status: 200 } } });
  assert.deepEqual(r, { desligado: true });
  assert.equal(chamou, 0);
  assert.equal(SYNC.ligado({ CARRO_SYNC_ATIVO: 'true' }), false, 'só "1" liga');
  assert.equal(SYNC.destino({ ZRO_ISSUER: 'https://absolutezro.com/' }), 'https://absolutezro.com/api/v1/carro-do-freela/inventario');
});

test('o publicador ligado: manda só o retrato mais novo, com a chave de idempotência, e marca enviado', async () => {
  const E = crypto.randomUUID();
  await db.asUser(E, c => novoItem(c, E, 'FX6'));
  await db.asUser(E, c => novoItem(c, E, 'Ronin', { categoria: 'estabilizador' }));
  const pedidos = [];
  const buscar = async (url, init) => { pedidos.push({ url, init }); return { status: 202 } };
  const env = { CARRO_SYNC_ATIVO: '1', ZRO_ISSUER: 'https://hub.teste' };
  assert.deepEqual(await SYNC.publicar(db, { sub: E, env, buscar }), { semAcesso: true }, 'sem o acesso da pessoa, não manda');
  const r = await SYNC.publicar(db, { sub: E, env, buscar, autorizacao: 'Bearer at_x' });
  assert.deepEqual(r, { enviados: 1, revisao: 0, substituidos: 1 });
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].url, 'https://hub.teste/api/v1/carro-do-freela/inventario');
  const corpo = JSON.parse(pedidos[0].init.body);
  assert.equal(corpo.type, 'freela.inventario.atualizado');
  assert.equal(pedidos[0].init.headers['Idempotency-Key'], corpo.idempotency_key);
  assert.equal(pedidos[0].init.headers.Authorization, 'Bearer at_x');
  assert.deepEqual(corpo.payload.inventario.itens.map(i => i.modelo), ['FX6', 'Ronin'], 'o mais novo tem os dois');
  assert.deepEqual(conferir(esquemaEv, corpo.payload), []);
  assert.deepEqual((await eventosDe(E)).map(e => e.estado), ['substituido', 'enviado']);
  assert.deepEqual(await SYNC.publicar(db, { sub: E, env, buscar, autorizacao: 'Bearer at_x' }), { enviados: 0, revisao: 0, substituidos: 0 });
});

test('o publicador: recusa, erro e rede caída vão para revisão — nunca de novo sozinho', async () => {
  const env = { CARRO_SYNC_ATIVO: '1' };
  for (const buscar of [async () => ({ status: 500 }), async () => ({ status: 404 }), async () => { throw new TypeError('fetch failed') }]) {
    const F = crypto.randomUUID();
    await db.asUser(F, c => novoItem(c, F, 'Aputure 300D', { categoria: 'luz' }));
    let n = 0;
    const contar = async (...a) => { n++; return buscar(...a) };
    assert.equal((await SYNC.publicar(db, { sub: F, env, buscar: contar, autorizacao: 'Bearer y' })).revisao, 1);
    const [ev] = await eventosDe(F);
    assert.equal(ev.estado, 'revisao');
    assert.ok(ev.ultimo_erro);
    await SYNC.publicar(db, { sub: F, env, buscar: contar, autorizacao: 'Bearer y' });
    assert.equal(n, 1, 'o que foi para revisão não é tentado de novo');
  }
});

/* ===================== 5. as rotas ===================== */

const CLIENTE = { clientId: 'carrodofreela-web', clientSecret: 'segredo-de-teste-' + crypto.randomBytes(8).toString('hex') };
const FREELA = { sub: crypto.randomUUID(), email: 'freela@exemplo.com', nome: 'Freela Teste', org: 'Org Teste' };
const OUTRA = { sub: crypto.randomUUID(), email: 'outra@exemplo.com', nome: 'Outra Conta', org: 'Org Outra' };
const TERCEIRA = { sub: crypto.randomUUID(), email: 'terceira@exemplo.com', nome: 'Terceira Conta', org: 'Org Terceira' };
let zro, app, SITE, Z, D;

const cookiesDe = res => {
  const m = new Map();
  for (const c of res.headers.getSetCookie()) {
    const [par] = c.split(';');
    const i = par.indexOf('=');
    m.set(par.slice(0, i), decodeURIComponent(par.slice(i + 1)));
  }
  return m;
};
const cookieDe = cookies => [...cookies].filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('; ');

async function entrar(pessoa) {
  Z._interno.esquecer();
  zro.estado.proximo = { pessoa, negar: false, adulterar: null };
  const ida = await fetch(SITE + '/api/zro/entrar', { redirect: 'manual' });
  const z = await fetch(new URL(ida.headers.get('location')), { redirect: 'manual' });
  const volta = new URL(z.headers.get('location'));
  const res = await fetch(SITE + volta.pathname + volta.search, { redirect: 'manual', headers: { cookie: 'cdf_zro=' + encodeURIComponent(cookiesDe(ida).get('cdf_zro')) } });
  const c = cookiesDe(res);
  assert.ok(c.get('cdf_sessao') && c.get('cdf_hub'), 'entrou');
  return c;
}
function pedir(caminho, { cookies, method = 'GET', corpo, headers = {} } = {}) {
  const h = Object.assign({}, cookies ? { cookie: cookieDe(cookies) } : {}, method !== 'GET' ? { origin: SITE } : {}, corpo !== undefined ? { 'content-type': 'application/json' } : {}, headers);
  for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
  return fetch(SITE + caminho, { method, redirect: 'manual', headers: h, body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });
}

test('rotas: preparar a Absolute ZRO falsa e o servidor', async () => {
  zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret, CARRO_DATABASE_URL: URL_TESTE });
  delete process.env.CARRO_SYNC_ATIVO;
  Z = require(path.join(RAIZ, 'api', 'zro', '_zro.js'));
  D = require(path.join(RAIZ, 'api', 'zro', '_dados.js'));
  const rotas = {
    '/api/zro/entrar': require(path.join(RAIZ, 'api', 'zro', 'entrar.js')),
    '/api/zro/callback': require(path.join(RAIZ, 'api', 'zro', 'callback.js')),
    '/api/zro/perfil': require(path.join(RAIZ, 'api', 'zro', 'perfil.js')),
    '/api/zro/inventario': require(path.join(RAIZ, 'api', 'zro', 'inventario.js')),
    '/api/zro/agenda': require(path.join(RAIZ, 'api', 'zro', 'agenda.js')),
    '/api/zro/pessoas': require(path.join(RAIZ, 'api', 'zro', 'pessoas.js')),
    '/api/zro/propostas': require(path.join(RAIZ, 'api', 'zro', 'propostas.js')),
    '/api/zro/feed': require(path.join(RAIZ, 'api', 'zro', 'feed.js')),
    '/api/zro/brecho': require(path.join(RAIZ, 'api', 'zro', 'brecho.js')),
    '/api/zro/denuncia': require(path.join(RAIZ, 'api', 'zro', 'denuncia.js')),
  };
  app = http.createServer((req, res) => {
    const fn = rotas[new URL(req.url, 'http://x').pathname];
    if (fn) return fn(req, res);
    res.writeHead(404);
    res.end();
  });
  await new Promise(ok => app.listen(0, '127.0.0.1', ok));
  SITE = 'http://127.0.0.1:' + app.address().port;
});
/* o freio de pedidos é por IP, e aqui todo pedido vem de 127.0.0.1: cada teste começa zerado */
beforeEach(() => { if (D) D._interno.esquecerLimite() });
after(async () => {
  if (app) await new Promise(ok => app.close(() => ok()));
  if (zro) await zro.fechar();
});

test('rotas: sem sessão é 401, sem cache; método errado é 405', async () => {
  for (const c of ['/api/zro/perfil', '/api/zro/inventario', '/api/zro/agenda', '/api/zro/pessoas']) {
    const r = await pedir(c);
    assert.equal(r.status, 401);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal((await r.json()).erro, 'sem_sessao');
  }
  assert.equal((await pedir('/api/zro/perfil', { method: 'DELETE' })).status, 405);
  assert.equal((await pedir('/api/zro/inventario', { method: 'PUT', corpo: {} })).status, 405);
});

test('rotas: o perfil — nasce vazio, grava, e devolve só o que é do perfil', async () => {
  const c = await entrar(FREELA);
  assert.deepEqual(await (await pedir('/api/zro/perfil', { cookies: c })).json(), { perfil: null });
  const r = await pedir('/api/zro/perfil', { cookies: c, method: 'PUT', corpo: { nome: '  Freela   Teste ', cidade: 'Natal', uf: 'rn', funcoes: ['Op. de câmera', 'Editor', 'Editor'], nichos: ['Casamento'], bio: 'Câmera e edição.', portfolio: 'https://exemplo.com/reel' } });
  assert.equal(r.status, 200);
  const { perfil } = await r.json();
  assert.equal(perfil.nome, 'Freela Teste');
  assert.equal(perfil.uf, 'RN');
  assert.deepEqual(perfil.funcoes, ['Op. de câmera', 'Editor']);
  assert.equal(perfil.visibilidade, 'privado', 'caixa desmarcada não é consentimento: nasce privado');
  assert.deepEqual(Object.keys(perfil).sort(), ['arroba', 'atualizado_em', 'bio', 'cidade', 'funcoes', 'nichos', 'nome', 'portfolio', 'uf', 'visibilidade']);
  assert.equal((await (await pedir('/api/zro/perfil', { cookies: c })).json()).perfil.cidade, 'Natal');
  /* a outra conta não vê este perfil */
  const o = await entrar(OUTRA);
  assert.deepEqual(await (await pedir('/api/zro/perfil', { cookies: o })).json(), { perfil: null });
});

test('rotas: nenhum campo de telefone entra — nem como campo, nem escondido no texto', async () => {
  const c = await entrar(FREELA);
  const recusa = async (corpo, erro, campo) => {
    const r = await pedir('/api/zro/perfil', { cookies: c, method: 'PUT', corpo });
    assert.equal(r.status, 400, JSON.stringify(corpo));
    assert.deepEqual(await r.json(), { erro, campo });
  };
  for (const k of ['telefone', 'whatsapp', 'celular', 'cpf', 'email', 'tel']) await recusa({ nome: 'X', [k]: '84999990000' }, 'proibido', k);
  await recusa({ nome: 'X', bio: 'me chama no 84 99999-0000' }, 'telefone', 'bio');
  await recusa({ nome: 'X (84) 3222-1111' }, 'telefone', 'nome');
  await recusa({ nome: 'X', portfolio: 'https://wa.me/5584999990000' }, 'telefone', 'portfolio');
  await recusa({ nome: 'X', portfolio: 'https://api.whatsapp.com/send' }, 'proibido', 'portfolio');
  await recusa({ nome: 'X', portfolio: 'http://inseguro.exemplo' }, 'link', 'portfolio');
  await recusa({ nome: 'X', sub: crypto.randomUUID() }, 'campo', 'sub');
  await recusa({ nome: 'X', funcoes: ['Som direto'] }, 'catalogo', 'funcoes');
  await recusa({ nome: 'X', uf: 'XX' }, 'uf', 'uf');
  await recusa({ nome: 'X', visibilidade: 'publico' }, 'visibilidade', 'visibilidade');
  await recusa({}, 'obrigatorio', 'nome');
  const ri = await pedir('/api/zro/inventario', { cookies: c, method: 'POST', corpo: { modelo: 'FX3', telefone: '84999990000' } });
  assert.deepEqual(await ri.json(), { erro: 'proibido', campo: 'telefone' });
  const ro = await pedir('/api/zro/inventario', { cookies: c, method: 'POST', corpo: { modelo: 'FX3', observacao: 'aluguel: 84999990000' } });
  assert.deepEqual(await ro.json(), { erro: 'telefone', campo: 'observacao' });
});

test('rotas: escrita só da própria origem, só JSON, corpo pequeno', async () => {
  const c = await entrar(FREELA);
  assert.equal((await pedir('/api/zro/perfil', { cookies: c, method: 'PUT', corpo: { nome: 'X' }, headers: { origin: 'https://evil.exemplo' } })).status, 403);
  assert.equal((await pedir('/api/zro/perfil', { cookies: c, method: 'PUT', corpo: { nome: 'X' }, headers: { origin: null } })).status, 403, 'sem Origin');
  assert.equal((await pedir('/api/zro/inventario', { cookies: c, method: 'POST', corpo: { modelo: 'X' }, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await pedir('/api/zro/inventario', { cookies: c, method: 'POST', corpo: '{"modelo":"X"}', headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await pedir('/api/zro/inventario', { cookies: c, method: 'POST', corpo: '{nada' })).status, 400);
  assert.equal((await pedir('/api/zro/inventario', { cookies: c, method: 'POST', corpo: { modelo: 'x'.repeat(20000) } })).status, 400);
  assert.equal((await pedir('/api/zro/inventario', { cookies: c, method: 'POST', corpo: [] })).status, 400);
});

test('rotas: o inventário — lista, cria, muda, apaga, e a outra conta não alcança nada', async () => {
  const c = await entrar(FREELA);
  const r1 = await pedir('/api/zro/inventario', { cookies: c, method: 'POST', corpo: { categoria: 'camera', marca: 'Sony', modelo: 'FX3', quantidade: 1, diaria_cents: 30000 } });
  assert.equal(r1.status, 201);
  const { item, sincronizacao } = await r1.json();
  assert.equal(sincronizacao, 'desligada');
  assert.match(item.id, B.UUID);
  assert.deepEqual(Object.keys(item).sort(), ['ativo', 'atualizado_em', 'categoria', 'diaria_cents', 'id', 'marca', 'modelo', 'observacao', 'quantidade']);
  const r2 = await pedir('/api/zro/inventario', { cookies: c, method: 'POST', corpo: { modelo: 'Tripé' } });
  assert.equal((await r2.json()).item.categoria, 'outro', 'sem categoria = outro; sem diária = nenhuma (nada inventado)');
  const lista = (await (await pedir('/api/zro/inventario', { cookies: c })).json()).itens;
  assert.deepEqual(lista.map(i => [i.modelo, i.diaria_cents]), [['FX3', 30000], ['Tripé', null]]);
  /* PATCH só o que veio */
  const p = await pedir('/api/zro/inventario?id=' + item.id, { cookies: c, method: 'PATCH', corpo: { ativo: false, observacao: 'na revisão' } });
  assert.equal(p.status, 200);
  const mudou = (await p.json()).item;
  assert.equal(mudou.ativo, false);
  assert.equal(mudou.modelo, 'FX3');
  assert.equal((await pedir('/api/zro/inventario?id=' + item.id, { cookies: c, method: 'PATCH', corpo: {} })).status, 400, 'nada para mudar');
  assert.equal((await pedir('/api/zro/inventario?id=' + item.id, { cookies: c, method: 'PATCH', corpo: { quantidade: 0 } })).status, 400);
  assert.equal((await pedir('/api/zro/inventario?id=x', { cookies: c, method: 'PATCH', corpo: { ativo: true } })).status, 400);
  /* a outra conta: não vê, não muda, não apaga */
  const o = await entrar(OUTRA);
  assert.deepEqual((await (await pedir('/api/zro/inventario', { cookies: o })).json()).itens, []);
  assert.equal((await pedir('/api/zro/inventario?id=' + item.id, { cookies: o, method: 'PATCH', corpo: { modelo: 'Roubado' } })).status, 404);
  assert.equal((await pedir('/api/zro/inventario?id=' + item.id, { cookies: o, method: 'DELETE' })).status, 404);
  /* o dono apaga */
  assert.equal((await pedir('/api/zro/inventario?id=' + item.id, { cookies: c, method: 'DELETE' })).status, 204);
  assert.equal((await pedir('/api/zro/inventario?id=' + item.id, { cookies: c, method: 'DELETE' })).status, 404);
  /* a fila guardou o retrato final, válido no contrato */
  const ev = (await eventosDe(FREELA.sub)).pop().payload;
  assert.deepEqual(ev.inventario.itens.map(i => i.modelo), ['Tripé']);
  assert.deepEqual(conferir(esquemaEv, ev), []);
});

const hojeMais = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

test('rotas: a agenda — declara, lê, libera; livre é ausência; a outra conta não vê nem mexe', async () => {
  const c = await entrar(FREELA);
  const d1 = hojeMais(2), d2 = hojeMais(3);
  assert.deepEqual((await (await pedir('/api/zro/agenda', { cookies: c })).json()).agenda, {}, 'nasce toda livre');
  let r = await pedir('/api/zro/agenda', { cookies: c, method: 'PUT', corpo: { dia: d1, estado: 'fechado' } });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).declaracao, { e: 'fechado', p: 'dia' });
  r = await pedir('/api/zro/agenda', { cookies: c, method: 'PUT', corpo: { dia: d2, estado: 'negociando', parte: 'manha', hora: '13:30' } });
  assert.deepEqual((await r.json()).declaracao, { e: 'negociando', p: 'manha', h: '13:30' });
  /* o mesmo dia de novo troca a declaração (não duplica) */
  await pedir('/api/zro/agenda', { cookies: c, method: 'PUT', corpo: { dia: d1, estado: 'negociando' } });
  const ag = (await (await pedir('/api/zro/agenda', { cookies: c })).json()).agenda;
  assert.deepEqual(ag, { [d1]: { e: 'negociando', p: 'dia' }, [d2]: { e: 'negociando', p: 'manha', h: '13:30' } });
  /* recusas: dia que não existe, estado livre (livre é DELETE), hora no dia inteiro, campo de fora */
  for (const corpo of [{ dia: '2026-02-31', estado: 'fechado' }, { dia: d1, estado: 'livre' }, { dia: d1, estado: 'fechado', hora: '10:00' },
    { dia: d1, estado: 'fechado', telefone: '84999990000' }, { dia: d1, estado: 'fechado', parte: 'noite' }]) {
    assert.equal((await pedir('/api/zro/agenda', { cookies: c, method: 'PUT', corpo })).status, 400, JSON.stringify(corpo));
  }
  assert.equal((await pedir('/api/zro/agenda', { cookies: c, method: 'PUT', corpo: { dia: hojeMais(400), estado: 'fechado' } })).status, 400, 'fora da janela de um ano');
  assert.equal((await pedir('/api/zro/agenda?de=' + hojeMais(0) + '&ate=' + hojeMais(90), { cookies: c })).status, 400, 'janela de leitura até 62 dias');
  /* a outra conta: agenda própria vazia, e apagar o dia da primeira não alcança nada */
  const o = await entrar(OUTRA);
  assert.deepEqual((await (await pedir('/api/zro/agenda', { cookies: o })).json()).agenda, {});
  assert.equal((await pedir('/api/zro/agenda?dia=' + d1, { cookies: o, method: 'DELETE' })).status, 204);
  assert.ok((await (await pedir('/api/zro/agenda', { cookies: c })).json()).agenda[d1], 'o dia da primeira continua lá');
  /* liberar = apagar a linha */
  assert.equal((await pedir('/api/zro/agenda?dia=' + d1, { cookies: c, method: 'DELETE' })).status, 204);
  assert.equal((await (await pedir('/api/zro/agenda', { cookies: c })).json()).agenda[d1], undefined);
  assert.equal((await pedir('/api/zro/agenda', { cookies: c, method: 'PUT', corpo: { dia: d1, estado: 'fechado' }, headers: { origin: 'https://outro.site' } })).status, 403, 'escrita só da própria origem');
});

test('rotas (0003): a consulta de quem contrata CHEGA na caixa do freela; só os dois veem; o freela aceita e vira job', async () => {
  const contrata = await entrar(OUTRA), freela = await entrar(FREELA), terceira = await entrar(TERCEIRA);
  const dia = hojeMais(5);
  let r = await pedir('/api/zro/propostas', { cookies: contrata, method: 'POST', corpo: { para: FREELA.sub, dia, ini: '08:00', fim: '18:00', funcao: 'Op. de câmera', local: 'Ponta Negra', mensagem: 'Clipe na praia', valor_cents: 90000 } });
  assert.equal(r.status, 201);
  const prop = (await r.json()).proposta;
  assert.equal(prop.de_nome, OUTRA.nome, 'o nome vem da conta, não do pedido');
  /* chegou na caixa do freela */
  const caixa = await (await pedir('/api/zro/propostas', { cookies: freela })).json();
  assert.deepEqual(caixa.recebidas.map(p => [p.id, p.estado, p.funcao, p.dia, p.valor_cents]), [[prop.id, 'nova', 'Op. de câmera', dia, 90000]]);
  assert.deepEqual((await (await pedir('/api/zro/propostas', { cookies: contrata })).json()).enviadas.map(p => p.id), [prop.id]);
  /* a terceira conta não vê nem responde */
  const t = await (await pedir('/api/zro/propostas', { cookies: terceira })).json();
  assert.deepEqual([t.recebidas.length, t.enviadas.length], [0, 0]);
  assert.equal((await pedir('/api/zro/propostas?id=' + prop.id, { cookies: terceira, method: 'PATCH', corpo: { estado: 'aceita' } })).status, 404);
  /* quem mandou não aceita a própria; telefone, CPF e PIX não entram */
  assert.equal((await pedir('/api/zro/propostas?id=' + prop.id, { cookies: contrata, method: 'PATCH', corpo: { estado: 'aceita' } })).status, 403);
  for (const corpo of [{ para: FREELA.sub, mensagem: 'me liga 84 99999-0000' }, { para: FREELA.sub, cpf: '123' }, { para: FREELA.sub, pix: 'x' }, { para: OUTRA.sub }]) {
    assert.equal((await pedir('/api/zro/propostas', { cookies: contrata, method: 'POST', corpo })).status, 400, JSON.stringify(corpo));
  }
  /* o freela aceita: vira job (aceita), e o contratante vê */
  r = await pedir('/api/zro/propostas?id=' + prop.id, { cookies: freela, method: 'PATCH', corpo: { estado: 'aceita' } });
  assert.equal(r.status, 200);
  assert.equal((await (await pedir('/api/zro/propostas', { cookies: contrata })).json()).enviadas[0].estado, 'aceita');
  /* aceita não volta a recusada */
  assert.equal((await pedir('/api/zro/propostas?id=' + prop.id, { cookies: freela, method: 'PATCH', corpo: { estado: 'recusada', motivo: 'x' } })).status, 403);
});

test('rotas (0003): feed e brechó — todo mundo que entrou vê; só a dona apaga; denúncia guardada e o denunciado some só para quem denunciou', async () => {
  const a = await entrar(FREELA), b = await entrar(OUTRA);
  let r = await pedir('/api/zro/feed', { cookies: a, method: 'POST', corpo: { texto: 'Gravei hoje em Pipa', tipo: 'bastidor' } });
  assert.equal(r.status, 201);
  const post = (await r.json()).post;
  const visto = (await (await pedir('/api/zro/feed', { cookies: b })).json()).posts.find(p => p.id === post.id);
  assert.ok(visto && !visto.eu && visto.autor.nome === FREELA.nome);
  assert.equal((await pedir('/api/zro/feed?id=' + post.id, { cookies: b, method: 'DELETE' })).status, 404, 'a outra conta não apaga');
  assert.equal((await pedir('/api/zro/feed', { cookies: a, method: 'POST', corpo: { texto: 'chama no 84 99999 0000' } })).status, 400);
  /* brechó: anúncio, interesse que chega ao dono, vendido some da vitrine */
  r = await pedir('/api/zro/brecho', { cookies: a, method: 'POST', corpo: { titulo: 'Sony FX3', categoria: 'camera', preco_cents: 1800000, descricao: 'Pouco uso' } });
  assert.equal(r.status, 201);
  const an = (await r.json()).anuncio;
  assert.ok((await (await pedir('/api/zro/brecho', { cookies: b })).json()).anuncios.some(x => x.id === an.id && !x.eu));
  assert.equal((await pedir('/api/zro/brecho?id=' + an.id, { cookies: b, method: 'DELETE' })).status, 404);
  assert.equal((await pedir('/api/zro/brecho?id=' + an.id, { cookies: b, method: 'PATCH', corpo: { situacao: 'vendido' } })).status, 404);
  r = await pedir('/api/zro/propostas', { cookies: b, method: 'POST', corpo: { para: FREELA.sub, tipo: 'brecho', anuncio: an.id, mensagem: 'Tenho interesse na FX3' } });
  assert.equal(r.status, 201);
  assert.ok((await (await pedir('/api/zro/propostas', { cookies: a })).json()).recebidas.some(p => p.tipo === 'brecho' && p.anuncio === an.id));
  assert.equal((await pedir('/api/zro/propostas', { cookies: b, method: 'POST', corpo: { para: OUTRA.sub, tipo: 'brecho', anuncio: an.id } })).status, 400, 'não fala consigo');
  /* denúncia: guardada no servidor; quem denunciou para de ver; quem foi denunciado não sabe */
  assert.equal((await pedir('/api/zro/denuncia', { cookies: b, method: 'POST', corpo: { alvo: 'post', id: post.id, motivo: 'Spam' } })).status, 204);
  assert.ok(!(await (await pedir('/api/zro/feed', { cookies: b })).json()).posts.some(p => p.id === post.id));
  assert.ok((await (await pedir('/api/zro/feed', { cookies: a })).json()).posts.some(p => p.id === post.id));
  const n = await admin(async c => (await c.query("select count(*)::int as n from carro_do_freela.denuncias where alvo = 'post' and alvo_id = $1", [post.id])).rows[0].n, URL_TESTE);
  assert.equal(n, 1);
  /* a dona marca vendido (some da vitrine dos outros) e apaga o post */
  assert.equal((await pedir('/api/zro/brecho?id=' + an.id, { cookies: a, method: 'PATCH', corpo: { situacao: 'vendido' } })).status, 200);
  assert.ok(!(await (await pedir('/api/zro/brecho', { cookies: b })).json()).anuncios.some(x => x.id === an.id));
  assert.equal((await pedir('/api/zro/feed?id=' + post.id, { cookies: a, method: 'DELETE' })).status, 204);
});

test('banco (0003): isolamento direto no papel do app — ninguém lê proposta alheia, nem denúncia, nem escreve em nome de outro', async () => {
  const [x, y, z] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const pr = await db.asUser(x, async c => (await c.query("insert into carro_do_freela.propostas (de_sub, para_sub, de_nome) values ($1, $2, 'X') returning id", [x, y])).rows[0]);
  assert.equal(await db.asUser(z, async c => (await c.query('select 1 from carro_do_freela.propostas')).rowCount), 0);
  assert.equal(await db.asUser(y, async c => (await c.query('select 1 from carro_do_freela.propostas where id = $1', [pr.id])).rowCount), 1);
  await assert.rejects(db.asUser(z, c => c.query("insert into carro_do_freela.propostas (de_sub, para_sub, de_nome) values ($1, $2, 'Falso')", [x, y])), e => e.code === '42501');
  await assert.rejects(db.asUser(y, c => c.query("update carro_do_freela.propostas set valor_cents = 1 where id = $1", [pr.id])), e => e.code === '42501');
  await assert.rejects(db.asUser(z, c => c.query("insert into carro_do_freela.posts (sub, autor_nome, texto) values ($1, 'Falso', 'oi')", [x])), e => e.code === '42501');
  await db.asUser(z, c => c.query("insert into carro_do_freela.denuncias (sub, alvo, alvo_id, motivo) values ($1, 'post', $2, 'Spam')", [z, pr.id]));
  assert.equal(await db.asUser(x, async c => (await c.query('select 1 from carro_do_freela.denuncias')).rowCount), 0, 'denúncia alheia é invisível');
});

test('rotas: as pessoas — a comunidade da Absolute ZRO, com a agenda só de quem consentiu no Carro', async () => {
  const freela = Object.assign({}, FREELA, { arroba: 'freela.teste', foto: 'https://absolutezro.com/api/v1/foto/abc' });
  const privada = { sub: crypto.randomUUID(), email: 'privada@exemplo.com', nome: 'Privada', org: 'Org P', arroba: 'privada' };
  const contratante = { sub: crypto.randomUUID(), email: 'quem.contrata@exemplo.com', nome: 'Quem Contrata', org: 'Produtora' };
  const z = (p, funcoes) => ({ id: p.sub, arroba: p.arroba, nome: p.nome, foto: p.foto || null, funcoes, cidade: 'Natal', portfolio: null, bio: null, selos: [], perfil: 'https://absolutezro.com/pessoas/@' + p.arroba });
  /* a comunidade vem do HUB (já filtrada lá: visível e com o @ confirmado) */
  zro.estado.comunidade = [z(freela, [{ chave: 'camera', nome: 'Câmera' }]), z(privada, [{ chave: 'edicao', nome: 'Edição' }])];
  const cf = await entrar(freela), cp = await entrar(privada), cc = await entrar(contratante);
  /* o corpo nunca escolhe o @ nem a foto: vêm da conta */
  assert.equal((await pedir('/api/zro/perfil', { cookies: cf, method: 'PUT', corpo: { nome: 'Freela Teste', arroba: 'outro' } })).status, 400);
  await pedir('/api/zro/perfil', { cookies: cf, method: 'PUT', corpo: { nome: 'Freela Teste', cidade: 'Natal', uf: 'RN', funcoes: ['Editor', 'Colorista'], visibilidade: 'contratantes' } });
  await pedir('/api/zro/perfil', { cookies: cp, method: 'PUT', corpo: { nome: 'Privada', funcoes: ['Editor'] } });
  const d = hojeMais(5);
  await pedir('/api/zro/agenda', { cookies: cf, method: 'PUT', corpo: { dia: d, estado: 'fechado', parte: 'tarde' } });
  await pedir('/api/zro/agenda', { cookies: cp, method: 'PUT', corpo: { dia: d, estado: 'fechado' } });
  const r = await pedir('/api/zro/pessoas', { cookies: cc });
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.deepEqual(corpo.pessoas.map(p => p.arroba), ['freela.teste', 'privada'], 'quem está na comunidade aparece, por ordem de @');
  const f = corpo.pessoas.find(p => p.arroba === 'freela.teste');
  assert.equal(f.id, freela.sub);
  assert.equal(f.foto, 'https://absolutezro.com/api/v1/foto/abc');
  assert.deepEqual(f.funcoes, ['Editor', 'Colorista'], 'quem descreveu o ofício no Carro aparece com as funções do Carro');
  assert.deepEqual(f.agenda[d], { e: 'fechado', p: 'tarde' });
  const pv = corpo.pessoas.find(p => p.arroba === 'privada');
  assert.equal(pv.agenda, null, 'sem "mostrar para quem contrata", a agenda não é divulgada');
  assert.deepEqual(pv.funcoes, ['Editor'], 'e as funções vêm do perfil da Absolute ZRO, no catálogo do Carro');
  assert.deepEqual(Object.keys(f).sort(), ['agenda', 'agenda_atualizada_em', 'arroba', 'bio', 'cidade', 'foto', 'funcoes', 'id', 'nichos', 'nome', 'portfolio']);
  assert.ok(!/@exemplo\.com|telefone|diaria/.test(JSON.stringify(corpo)), 'nem e-mail, nem telefone, nem diária saem');
  /* fora da janela, a agenda vem vazia; janela longa é recusada */
  const longe = await (await pedir('/api/zro/pessoas?de=' + hojeMais(10) + '&ate=' + hojeMais(20), { cookies: cc })).json();
  assert.deepEqual(longe.pessoas.find(p => p.arroba === 'freela.teste').agenda, {});
  assert.equal((await pedir('/api/zro/pessoas?de=' + hojeMais(0) + '&ate=' + hojeMais(100), { cookies: cc })).status, 400);
  /* desmarcou: continua na lista (é da comunidade), sem a agenda */
  await pedir('/api/zro/perfil', { cookies: cf, method: 'PUT', corpo: { nome: 'Freela Teste', visibilidade: 'privado' } });
  assert.equal((await (await pedir('/api/zro/pessoas', { cookies: cc })).json()).pessoas.find(p => p.arroba === 'freela.teste').agenda, null);
  /* paginação: 450 pessoas = 3 páginas de 200 */
  zro.estado.comunidade = Array.from({ length: 450 }, (_, i) => z({ sub: crypto.randomUUID(), arroba: 'p' + String(i).padStart(3, '0'), nome: 'P ' + i }, []));
  zro.estado.paginasPessoas = 0;
  assert.equal((await (await pedir('/api/zro/pessoas', { cookies: cc })).json()).pessoas.length, 450);
  assert.equal(zro.estado.paginasPessoas, 3);
  zro.estado.comunidade = [];
});

test('banco: a agenda alheia só sai pela função, que exige pessoa e janela curta', async () => {
  await assert.rejects(db.asUser(A, c => c.query("select * from carro_do_freela.agendas(array[$1]::uuid[], current_date, current_date + 90)", [BB])), /62 dias/);
  await assert.rejects(db.asSystem('teste: função sem pessoa', async c => { await c.query('set local role carro_do_freela_app'); await c.query("select * from carro_do_freela.agendas('{}'::uuid[], current_date, current_date + 5)") }), /Sem pessoa/);
  /* a agenda alheia não se lê direto: a política só deixa a própria */
  await db.asUser(BB, c => c.query("insert into carro_do_freela.agenda_dias (sub, dia, estado) values ($1, current_date + 1, 'fechado') on conflict do nothing", [BB]));
  const visto = await db.asUser(A, async c => (await c.query('select count(*)::int as n from carro_do_freela.agenda_dias')).rows[0].n);
  assert.equal(visto, 0);
});

test('rotas: o portão — acesso removido no HUB, conta fechada e sem o Carro no plano não passam', async () => {
  const pessoa = { sub: crypto.randomUUID(), email: 'removida@exemplo.com', nome: 'Removida', org: 'Org' };
  const c = await entrar(pessoa);
  assert.equal((await pedir('/api/zro/inventario', { cookies: c })).status, 200);
  zro.estado.contas.get(pessoa.sub).acesso = 'closed';
  const r = await pedir('/api/zro/inventario', { cookies: c });
  assert.ok([401, 403].includes(r.status), 'acesso removido depois do login: ' + r.status);
  const sem = await entrar({ sub: crypto.randomUUID(), email: 'semplano@exemplo.com', nome: 'Sem Plano', org: 'Org', produtos: ['nossom'] });
  const rp = await pedir('/api/zro/perfil', { cookies: sem });
  assert.equal(rp.status, 403);
  assert.equal((await rp.json()).erro, 'plano');
  /* sub que não é uuid (conta de HUB antigo) não chega ao banco */
  const velha = await entrar({ sub: 'zro-111', email: 'lia@exemplo.com', nome: 'Lia', org: 'Org' });
  assert.equal((await (await pedir('/api/zro/perfil', { cookies: velha })).json()).erro, 'conta');
  /* cookie do HUB de outra conta: reconectar */
  const a = await entrar(FREELA), b = await entrar(OUTRA);
  const mist = new Map([['cdf_sessao', a.get('cdf_sessao')], ['cdf_hub', b.get('cdf_hub')]]);
  assert.equal((await pedir('/api/zro/perfil', { cookies: mist })).status, 401);
});

test('rotas: sem CARRO_DATABASE_URL o banco está desligado — 503 sem_banco, e nada quebra', async () => {
  const c = await entrar(FREELA);
  const guardado = process.env.CARRO_DATABASE_URL;
  delete process.env.CARRO_DATABASE_URL;
  try {
    const r = await pedir('/api/zro/inventario', { cookies: c });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).erro, 'sem_banco');
  } finally {
    process.env.CARRO_DATABASE_URL = guardado;
  }
});

test('rotas: limite de pedidos por IP (freio por instância) e a régua de origem', async () => {
  D._interno.esquecerLimite();
  const req = { headers: { 'x-forwarded-for': '203.0.113.9' }, socket: {} };
  let barrado = 0;
  for (let i = 0; i < D._interno.LIMITE.escrita + 5; i++) if (D._interno.passouDoLimite(req, 'escrita', 1000)) barrado++;
  assert.equal(barrado, 5);
  assert.equal(D._interno.passouDoLimite(req, 'escrita', 1000 + 61000), false, 'a janela anda');
  assert.equal(D._interno.passouDoLimite({ headers: { 'x-forwarded-for': '203.0.113.10' }, socket: {} }, 'escrita', 1000), false, 'outro IP, outra conta');
  D._interno.esquecerLimite();
  /* e a rota responde 429 quando passa */
  const c = await entrar(FREELA);
  let ultimo;
  for (let i = 0; i <= D._interno.LIMITE.leitura; i++) ultimo = await pedir('/api/zro/perfil', { cookies: c });
  assert.equal(ultimo.status, 429);
  assert.equal(ultimo.headers.get('retry-after'), '60');
  D._interno.esquecerLimite();
});

test('regras: os catálogos do servidor são os do app (funções da base, nichos de TIPOS)', () => {
  const tpl = fs.readFileSync(path.join(RAIZ, 'src', 'template.html'), 'utf8');
  const tipos = JSON.parse('[' + tpl.match(/const TIPOS=\[([\s\S]*?)\];/)[1].trim() + ']');
  assert.deepEqual(R.TIPOS, tipos);
  const crew = require(path.join(RAIZ, 'src', 'crew.json'));
  assert.deepEqual(R.FUNCOES, [...new Set(crew.flatMap(c => c.func))].filter(f => f !== 'Não informado'));
  assert.ok(!R.FUNCOES.some(f => /som direto/i.test(f)), 'nenhuma função que a base não tem');
});
