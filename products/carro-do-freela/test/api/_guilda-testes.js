/**
 * A GUILDA NO BANCO E NAS ROTAS (0004; fase 1, GRÁTIS, desde 01/11/2026) — registrada no fim do banco.test.js, que
 * empresta o Postgres descartável, a Absolute ZRO falsa e o servidor. Cobre: o portão por recurso (db/fase.js: a guilda
 * abre na fase 1, a de verdade; fora do ar responde 404), a venda DESLIGADA (fundar grátis, 15 lugares, sinais de pacote
 * ignorados, compra recusada no servidor), RLS entre guildas e pessoas, convite pelo @ e por link, nível 10, bloqueio,
 * carência, remover, sair, a memória dos jobs fechados e a ordem da busca, que não conhece guilda.
 */
const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const crypto = require('node:crypto');
const path = require('node:path');

module.exports = function registrar(ctx) {
  const FASES = require(path.join(ctx().RAIZ, 'db', 'fase.js'));
  const pessoaNova = n => ({ sub: crypto.randomUUID(), email: n + '@exemplo.com', nome: n + ' Teste', org: 'Org ' + n });
  /** pedido à guilda; o freio de pedidos por IP é zerado a cada chamada (aqui há dezenas) */
  const G = (cookies, corpo, method) => { ctx().D._interno.esquecerLimite(); return ctx().pedir('/api/zro/guildas', { cookies, method: method || (corpo === undefined ? 'GET' : 'POST'), corpo }) };
  const minha = async c => (await G(c)).json();
  const tokenDe = link => new URL(link).searchParams.get('guilda');
  const SQL = (sql, args) => ctx().admin(async c => (await c.query(sql, args)).rows, ctx().URL_TESTE);
  const membroFalso = (g, n) => SQL("insert into carro_do_freela.guilda_membros (guilda_id, sub, nome) select $1, gen_random_uuid(), 'Membro ' || x from generate_series(1, $2::int) x", [g, n]);
  const jobFalso = (g, n) => SQL('insert into carro_do_freela.guilda_jobs (guilda_id, proposta_id, de_sub, para_sub) select $1, gen_random_uuid(), gen_random_uuid(), gen_random_uuid() from generate_series(1, $2::int)', [g, n]);
  const ADICIONAL = ['carro-do-freela.guilda_espaco_extra'];
  /* os sinais da venda guardada (fundação paga, +5, +15): com a venda desligada o servidor os IGNORA */
  const FUNDACAO = 'carro-do-freela.guilda_fundacao';
  const TODOS_OS_SINAIS = [FUNDACAO, 'carro-do-freela.guilda_espaco_extra', 'carro-do-freela.guilda_espaco_extra_15'];

  test('guilda: o portão por recurso — na fase 1 (a de verdade) a guilda abre; fora do ar (fase 0) responde 404 e nada é criado', async () => {
    assert.equal(FASES.FASE_LANCAMENTO, 1, 'o lançamento está na fase 1');
    assert.deepEqual(FASES.recursosDa(1), { guilda: true, venda_guilda: false }, 'fase 1: guilda no ar, venda fora');
    assert.deepEqual(FASES.recursosDa(2), { guilda: true, venda_guilda: false }, 'a venda não tem fase: nem a 2 liga');
    assert.throws(() => FASES.noAr('aluguel'), /recurso sem fase/, 'recurso sem fase é erro, não "ligado"');
    FASES.fixarParaTeste(0);
    const c = await ctx().entrar(ctx().OUTRA);
    for (const [m, ck, corpo] of [['GET', c], ['POST', c, { nome: 'Panelinha', tag: 'PNL' }], ['GET', undefined], ['POST', c, { acao: 'sair' }]]) {
      assert.equal((await G(ck, corpo, m)).status, 404, m + ' com a guilda fora do ar');
    }
    assert.equal((await SQL('select count(*)::int as n from carro_do_freela.guildas'))[0].n, 0);
    FASES.fixarParaTeste(null);
    assert.equal(FASES.faseAtual(), 1);
    const r = await G(c);
    assert.equal(r.status, 200, 'na fase 1 a guilda responde');
    assert.equal((await r.json()).fase, 1);
  });

  test('guilda: GRÁTIS na fase 1 — qualquer conta funda com 15 lugares; compra e pacotes recusados no servidor', async () => {
    const { entrar } = ctx();
    const quem = pessoaNova('gratis'), outra = pessoaNova('gratis2');
    const cq = await entrar(quem);
    let j = await minha(cq);
    assert.deepEqual([j.venda, j.pode_fundar, j.pacotes], [false, true, []], 'sem venda: todo mundo funda, nenhum pacote');
    assert.ok(!('pedir_url' in j), 'sem venda não há pedido de plano');
    /* comprar pelo servidor: recusado, nada é criado nem cobrado */
    for (const corpo of [{ acao: 'comprar' }, { acao: 'comprar', pacote: 15 }, { acao: 'fundacao' }, { acao: 'pacote', pacote: 5 }, { acao: 'espaco_extra' }, { acao: 'lugares', mais: 5 }]) {
      const r = await G(cq, corpo);
      assert.deepEqual([r.status, (await r.json()).erro], [403, 'sem_venda'], JSON.stringify(corpo));
    }
    assert.equal((await G(cq, { nome: 'Grátis', tag: 'GRT', pacote: 5 })).status, 400, 'pacote não entra na criação');
    assert.equal((await G(cq, { nome: 'Grátis', tag: 'GRT', espaco_extra: 15 })).status, 400, 'espaço extra não vem do pedido');
    assert.equal((await SQL("select count(*)::int as n from carro_do_freela.guildas where tag = 'GRT'"))[0].n, 0);
    /* funda sem nada na conta */
    const r = await G(cq, { nome: 'Grátis', tag: 'GRT' });
    assert.equal(r.status, 201, 'fundar é grátis');
    const gid = (await r.json()).guilda.id;
    j = await minha(cq);
    assert.deepEqual([j.minha.vagas.base, j.minha.vagas.extra, j.minha.vagas.total], [15, 0, 15]);
    /* mesmo com TODOS os sinais pagos na conta (se um dia o HUB os mandasse), nada muda: extra = 0, sem pacotes */
    j = await minha(await entrar(Object.assign({}, quem, { recursos: TODOS_OS_SINAIS })));
    assert.deepEqual([j.venda, j.pacotes, j.minha.vagas.extra, j.minha.vagas.total], [false, [], 0, 15], 'os sinais pagos são ignorados');
    assert.ok(!('pedir_url' in j));
    assert.equal((await SQL('select espaco_extra from carro_do_freela.guildas where id = $1', [gid]))[0].espaco_extra, 0);
    /* e a outra conta funda a dela, também grátis */
    assert.equal((await G(await entrar(outra), { nome: 'Grátis Dois', tag: 'GRD' })).status, 201);
    for (const p of [quem, outra]) assert.equal((await G(await entrar(p), { acao: 'sair' })).status, 204, 'encerra a guilda de teste');
  });

  test('guilda: o código guardado da venda ainda funciona quando ligado (só no teste): fundação e pacotes da claim', async () => {
    const { entrar } = ctx();
    FASES.fixarParaTeste(null, { venda_guilda: 1 });
    try {
      const p = pessoaNova('venda');
      const r = await G(await entrar(p), { nome: 'Venda', tag: 'VND' });
      assert.deepEqual([r.status, (await r.json()).erro], [402, 'fundacao'], 'com a venda ligada, fundar pede a fundação');
      const cv = await entrar(Object.assign({}, p, { recursos: TODOS_OS_SINAIS }));
      assert.equal((await G(cv, { nome: 'Venda', tag: 'VND' })).status, 201);
      const j = await minha(cv);
      assert.deepEqual([j.venda, j.pacotes.sort((a, b) => a - b), j.minha.vagas.extra, j.minha.vagas.total], [true, [5, 15], 20, 35]);
      assert.match(j.pedir_url, /\/perfil\/plano$/);
      assert.equal((await G(cv, { acao: 'sair' })).status, 204);
    } finally {
      FASES.fixarParaTeste(null);
    }
  });

  test('guilda: criar, convidar pelo @ e por link, aceitar, vagas e espaço extra; RLS entre guildas e pessoas', async () => {
    const { db, entrar, OUTRA: dono, FREELA: m1, TERCEIRA: m2 } = ctx();
    const q1 = pessoaNova('quarta'), q2 = pessoaNova('quinta');
    const c1 = await entrar(m1), c2 = await entrar(m2);
    /* fundar é grátis (01/11): a conta não precisa de nada */
    const cd = await entrar(dono);
    assert.equal((await minha(cd)).pode_fundar, true);
    assert.equal((await minha(c1)).pode_fundar, true, 'qualquer conta funda');
    let r;
    assert.equal((await G(cd, { nome: 'Panelinha', tag: 'x' })).status, 400);
    assert.equal((await G(cd, { nome: 'Panelinha', tag: 'PNL', cpf: '1' })).status, 400);
    assert.equal((await G(cd, { nome: 'Panelinha', tag: 'PNL', espaco_extra: 99 })).status, 400, 'o espaço extra não vem do pedido');
    assert.equal((await G(cd, { nome: 'Fale 84 99999-0000', tag: 'PNL' })).status, 400);
    r = await G(cd, { nome: 'Panelinha', tag: 'pnl', sobre: 'Clipe e publicidade' });
    assert.equal(r.status, 201);
    const gid = (await r.json()).guilda.id;
    assert.equal((await G(cd, { nome: 'Outra', tag: 'OUT' })).status, 409, 'uma guilda por vez');
    let g = (await minha(cd)).minha;
    assert.deepEqual([g.guilda.tag, g.eu.papel, g.membros.length, g.membros[0].nome], ['PNL', 'dono', 1, dono.nome], 'o nome vem da conta');
    assert.deepEqual([g.nivel.atual, g.vagas.base, g.vagas.total, g.vagas.ocupadas, g.vagas.livres], [1, 15, 15, 1, 14]);
    assert.equal((await minha(c2)).minha, null, 'quem não é da guilda não a vê');
    assert.equal((await G(c2, { acao: 'convidar', para: m1.sub })).status, 403, 'só o dono convida');
    assert.equal((await G(cd, { acao: 'convidar', para: m1.sub })).status, 201);
    assert.equal((await G(cd, { acao: 'convidar', para: m1.sub })).status, 409, 'já convidada');
    assert.equal((await G(cd, { acao: 'convidar', para: dono.sub })).status, 404, 'não convida a si mesmo');
    const rec = (await minha(c1)).recebidos;
    assert.deepEqual(rec.map(x => [x.nome, x.tag, x.de_nome]), [['Panelinha', 'PNL', dono.nome]]);
    assert.equal((await minha(c2)).recebidos.length, 0);
    assert.equal((await G(c2, { acao: 'aceitar', id: rec[0].id })).status, 404, 'convite de outra pessoa não se aceita');
    assert.equal((await G(c1, { acao: 'aceitar', id: rec[0].id, nome: 'Outro Nome' })).status, 400, 'o nome não vem do pedido');
    assert.equal((await G(c1, { acao: 'aceitar', id: rec[0].id })).status, 200);
    g = (await minha(c1)).minha;
    assert.deepEqual([g.eu.papel, g.membros.map(x => x.nome).sort()], ['membro', [dono.nome, m1.nome].sort()]);
    assert.deepEqual(g.convites, [], 'só o dono vê os convites');
    /* RLS direto no papel do app */
    assert.equal(await db.asUser(m2.sub, async c => (await c.query('select 1 from carro_do_freela.guilda_membros')).rowCount), 0);
    assert.equal(await db.asUser(m2.sub, async c => (await c.query('select 1 from carro_do_freela.guildas')).rowCount), 0);
    assert.equal(await db.asUser(m1.sub, async c => (await c.query('select 1 from carro_do_freela.guildas')).rowCount), 1);
    await assert.rejects(db.asUser(m2.sub, c => c.query("insert into carro_do_freela.guilda_membros (guilda_id, sub, nome) values ($1, $2, 'Eu')", [gid, m2.sub])), e => e.code === '42501');
    await assert.rejects(db.asUser(m1.sub, c => c.query('update carro_do_freela.guildas set espaco_extra = 50 where id = $1', [gid])), e => e.code === '42501');
    await assert.rejects(db.asUser(m1.sub, c => c.query('select carro_do_freela.guilda_remover($1)', [dono.sub])), e => e.message === 'so_dono');
    /* link: o código não fica guardado (só o hash), vale uma vez, e dá para ver antes de aceitar */
    r = await G(cd, { acao: 'convidar' });
    assert.equal(r.status, 201);
    const link = (await r.json()).link;
    assert.match(link, /^http:\/\/127\.0\.0\.1:\d+\/\?guilda=[A-Za-z0-9_-]{20,}$/);
    const tk = tokenDe(link);
    assert.equal((await SQL('select count(*)::int as n from carro_do_freela.guilda_convites where token_hash = $1', [tk]))[0].n, 0, 'o código em si não é guardado');
    assert.equal((await G(c2, { acao: 'ver', token: 'x'.repeat(30) })).status, 404);
    const ver = await (await G(c2, { acao: 'ver', token: tk })).json();
    assert.deepEqual([ver.guilda.nome, ver.guilda.ocupadas, ver.guilda.vagas], ['Panelinha', 2, 15]);
    assert.deepEqual(Object.keys(ver.guilda).sort(), ['cor', 'expira_em', 'nome', 'ocupadas', 'tag', 'vagas'], 'o link mostra o mínimo');
    assert.equal((await G(c2, { acao: 'aceitar', token: tk })).status, 200);
    const cq1 = await entrar(q1);
    assert.equal((await G(cq1, { acao: 'aceitar', token: tk })).status, 404, 'link usado não vale de novo');
    /* convite vencido */
    const tk2 = tokenDe((await (await G(cd, { acao: 'convidar' })).json()).link);
    await SQL("update carro_do_freela.guilda_convites set expira_em = clock_timestamp() - interval '1 minute' where guilda_id = $1 and token_hash is not null and estado = 'pendente'", [gid]);
    assert.equal((await G(cq1, { acao: 'ver', token: tk2 })).status, 404);
    assert.equal((await G(cq1, { acao: 'aceitar', token: tk2 })).status, 410, 'convite vencido');
    /* vagas: 15 de base; cheia recusa; o sinal de pacote na claim do DONO é ignorado (venda desligada); o nível 10 abre +2 */
    await membroFalso(gid, 12);
    g = (await minha(cd)).minha;
    assert.deepEqual([g.vagas.ocupadas, g.vagas.livres], [15, 0]);
    const convidarEAceitar = async (pes, ck) => {
      assert.equal((await G(cd, { acao: 'convidar', para: pes.sub })).status, 201);
      return G(ck, { acao: 'aceitar', id: (await minha(ck)).recebidos[0].id });
    };
    r = await convidarEAceitar(q1, cq1);
    assert.deepEqual([r.status, (await r.json()).erro], [409, 'cheia']);
    const comAdicional = Object.assign({}, dono, { recursos: ADICIONAL });
    g = (await minha(await entrar(comAdicional))).minha;
    assert.deepEqual([g.vagas.extra, g.vagas.total, g.vagas.livres], [0, 15, 0], 'o pacote pago não abre lugar: não há venda');
    r = await G(cq1, { acao: 'aceitar', id: (await minha(cq1)).recebidos[0].id });
    assert.deepEqual([r.status, (await r.json()).erro], [409, 'cheia'], 'a 16ª pessoa espera lugar');
    /* nível 10 (3.600 XP: 20 jobs de contratante de fora, 180 cada): +2 vagas, grátis (dado em guilda_beneficios) */
    await jobFalso(gid, 20);
    g = (await minha(await entrar(dono))).minha;
    assert.deepEqual([g.nivel.atual, g.vagas.bonus_de_nivel, g.vagas.extra, g.vagas.total, g.vagas.livres], [10, 2, 0, 17, 2]);
    assert.equal((await G(cq1, { acao: 'aceitar', id: (await minha(cq1)).recebidos[0].id })).status, 200, 'com o bônus de nível a 16ª pessoa entra');
    assert.ok(g.beneficios.find(b => b.nivel === 10 && b.ativo && b.conquistado));
    const taxa = g.beneficios.find(b => b.nivel === 15);
    assert.deepEqual([taxa.ativo, taxa.dados.taxa_bps, taxa.dados.min_time, taxa.dados.cobra], [false, 500, 3, false], 'a taxa de 5% fica como dado e não cobra nada');
    const cq2 = await entrar(q2);
    assert.equal((await convidarEAceitar(q2, cq2)).status, 200);
    const q3 = pessoaNova('sexta');
    r = await convidarEAceitar(q3, await entrar(q3));
    assert.equal(r.status, 409, 'cheia de novo (17 de 17)');
  });

  test('guilda: bloqueio, carência, remover, sair e a memória dos jobs fechados (o nível)', async () => {
    const { db, entrar, pedir, hojeMais, D } = ctx();
    const dono = pessoaNova('dono2'), p1 = pessoaNova('p1'), p2 = pessoaNova('p2'), p3 = pessoaNova('p3'), cli = pessoaNova('cliente');
    const [cd, c1, c2, c3, cc] = [await entrar(dono), await entrar(p1), await entrar(p2), await entrar(p3), await entrar(cli)];
    const gid = (await (await G(cd, { nome: 'Maré Alta', tag: 'MRA' })).json()).guilda.id;
    const convidar = async (pes, ck) => {
      assert.equal((await G(cd, { acao: 'convidar', para: pes.sub })).status, 201);
      return G(ck, { acao: 'aceitar', id: (await minha(ck)).recebidos[0].id });
    };
    /* recusar e bloquear: a pessoa não é mais convidada, nem entra por link */
    assert.equal((await G(cd, { acao: 'convidar', para: p1.sub })).status, 201);
    assert.equal((await G(c1, { acao: 'recusar', id: (await minha(c1)).recebidos[0].id, bloquear: true })).status, 204);
    let r = await G(cd, { acao: 'convidar', para: p1.sub });
    assert.deepEqual([r.status, (await r.json()).erro], [403, 'bloqueado']);
    const lk = tokenDe((await (await G(cd, { acao: 'convidar' })).json()).link);
    r = await G(c1, { acao: 'aceitar', token: lk });
    assert.deepEqual([r.status, (await r.json()).erro], [403, 'bloqueado'], 'bloqueada não entra nem por link');
    assert.equal((await G(c2, { acao: 'aceitar', token: lk })).status, 200);
    assert.equal((await convidar(p3, c3)).status, 200);
    /* jobs fechados por quem estava na guilda; só dia, função e nome de membro ficam na memória */
    const dia = hojeMais(9);
    const job = async (ckDe, para, ckPara) => {
      D._interno.esquecerLimite();
      const id = (await (await pedir('/api/zro/propostas', { cookies: ckDe, method: 'POST', corpo: { para: para.sub, dia, funcao: 'Op. de câmera', mensagem: 'Clipe', valor_cents: 77700 } })).json()).proposta.id;
      D._interno.esquecerLimite();
      assert.equal((await pedir('/api/zro/propostas?id=' + id, { cookies: ckPara, method: 'PATCH', corpo: { estado: 'aceita' } })).status, 200);
      return id;
    };
    const memoria = async () => (await SQL('select count(*)::int as n from carro_do_freela.guilda_jobs where guilda_id = $1', [gid]))[0].n;
    const j1 = await job(cc, p2, c2);
    await job(cc, p3, c3);
    assert.equal((await minha(cd)).minha.nivel.atual, 1, 'dois jobs ainda é nível 1');
    await job(cd, cli, cc);                          /* quem contrata também é da guilda */
    const fora = pessoaNova('fora');
    await job(cc, fora, await entrar(fora));         /* job de quem não é da guilda não conta */
    let g = (await minha(cd)).minha;
    assert.deepEqual([g.nivel.atual, g.nivel.jobs, g.nivel.faltam, await memoria()], [2, 3, 3, 3]);
    const txt = JSON.stringify(g);
    assert.ok(!/77700|Clipe|valor|mensagem/.test(txt) && !txt.includes(cli.nome), 'a memória não leva valor, mensagem nem o nome de quem está fora');
    assert.deepEqual(Object.keys(g.membros[0]).sort(), ['arroba', 'entrou_em', 'eu', 'foto', 'nome', 'online', 'papel', 'sub']);
    /* job cancelado deixa de contar */
    D._interno.esquecerLimite();
    assert.equal((await pedir('/api/zro/propostas?id=' + j1, { cookies: cc, method: 'PATCH', corpo: { estado: 'cancelada' } })).status, 200);
    assert.deepEqual([(await minha(cd)).minha.nivel.atual, await memoria()], [1, 2]);
    await job(cc, p2, c2);
    assert.deepEqual([(await minha(cd)).minha.nivel.atual, await memoria()], [2, 3]);
    /* sair: carência de 7 dias, a memória fica, quem saiu não vê mais a guilda */
    assert.equal((await G(c2, { acao: 'sair' })).status, 204);
    const sai = await minha(c2);
    assert.equal(sai.minha, null);
    assert.ok(sai.carencia_ate && new Date(sai.carencia_ate) > new Date(Date.now() + 6 * 864e5));
    assert.equal(await memoria(), 3, 'sair não apaga a memória');
    g = (await minha(cd)).minha;
    assert.deepEqual([g.nivel.atual, g.jobs.length, g.membros.length], [2, 3, 2], 'o nível e os jobs seguem na guilda');
    assert.ok(g.jobs.some(j => j.membros.includes(p2.nome)), 'o nome de quem saiu continua na memória daquele job');
    assert.equal(await db.asUser(p2.sub, async c => (await c.query('select 1 from carro_do_freela.guilda_jobs')).rowCount), 0, 'quem saiu não lê a memória');
    r = await convidar(p2, c2);
    assert.deepEqual([r.status, (await r.json()).erro], [409, 'carencia']);
    assert.equal((await G(await entrar(p2), { nome: 'Outra Guilda', tag: 'OTR' })).status, 409, 'nem fundar outra na carência');
    /* o dono tira alguém (sem carência); não sai com gente dentro; não-dono não tira */
    assert.equal((await G(c3, { acao: 'remover', sub: dono.sub })).status, 403);
    assert.equal((await G(cd, { acao: 'remover', sub: dono.sub })).status, 409);
    assert.equal((await G(cd, { acao: 'remover', sub: p2.sub })).status, 404, 'quem não está na guilda não é removido');
    assert.equal((await G(cd, { acao: 'sair' })).status, 409, 'o dono não sai com gente dentro');
    assert.equal((await G(cd, { acao: 'remover', sub: p3.sub })).status, 204);
    assert.equal((await minha(c3)).minha, null);
    assert.equal((await convidar(p3, c3)).status, 200, 'quem foi tirado pode voltar: sem carência');
    /* o dono sozinho encerra a guilda; a memória fica guardada */
    assert.equal((await G(c3, { acao: 'sair' })).status, 204);
    assert.equal((await G(cd, { acao: 'sair' })).status, 204);
    assert.equal((await minha(cd)).minha, null);
    assert.equal(await memoria(), 3);
  });

  test('guilda: a ordem da busca não conhece guilda, nível nem sinal de pacote', async () => {
    const { entrar, pedir, D, zro } = ctx();
    const a = pessoaNova('a'), b = pessoaNova('b'), c = pessoaNova('c'), v = pessoaNova('viu');
    const z = (p, arroba) => ({ id: p.sub, arroba, nome: p.nome, foto: null, funcoes: [], cidade: 'Natal', portfolio: null, bio: null, selos: [], perfil: 'https://absolutezro.com/pessoas/@' + arroba });
    zro.estado.comunidade = [z(a, 'aaa'), z(b, 'bbb'), z(c, 'ccc')];
    const cv = await entrar(v);
    const ordem = async () => { D._interno.esquecerLimite(); return (await (await pedir('/api/zro/pessoas', { cookies: cv })).json()).pessoas.map(p => p.arroba) };
    const antes = await ordem();
    assert.deepEqual(antes, ['aaa', 'bbb', 'ccc']);
    const cc = await entrar(Object.assign({}, c, { recursos: TODOS_OS_SINAIS }));
    const gid = (await (await G(cc, { nome: 'Os do Fim', tag: 'FIM' })).json()).guilda.id;
    await jobFalso(gid, 30);
    await membroFalso(gid, 5);
    assert.equal((await minha(cc)).minha.vagas.total, 15 + 2, 'o bônus de nível vale; o sinal de pacote, não');
    assert.deepEqual(await ordem(), antes, 'a ordem é a mesma com guilda forte e nível alto');
    zro.estado.comunidade = [];
  });

  after(() => FASES.fixarParaTeste(null));
};
