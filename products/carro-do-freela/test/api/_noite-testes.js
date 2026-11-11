/**
 * A NOITE NA AGENDA (0011, 11/11/2026) — registrada no banco.test.js, que empresta o Postgres descartável, a Absolute ZRO
 * falsa e o servidor. Retorno de um freela: "boa parte dos trabalhos é à noite, não tem opção de marcar dizendo que a
 * noite está ocupada; aí eu tô marcando como se fosse à tarde."
 *
 *  - o banco aceita parte 'noite' (e segue recusando o que não é parte); `faixa_da_agenda` dá a noite das 18:00 (ou da
 *    hora) até 24:00, e a manhã e a tarde continuam as da 0007 (a tarde segue até 24:00, de propósito);
 *  - quem está ocupado à noite segue livre de manhã e à tarde para a guilda (`guilda_estado_em`), e ocupado à noite;
 *  - as rotas: PUT parte 'noite' (com e sem hora) → 200; quem contrata lê {e, p:'noite'} em /api/zro/pessoas.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');

module.exports = function registrar(ctx) {
  const pessoaNova = n => ({ sub: crypto.randomUUID(), email: n + '@exemplo.com', nome: n + ' Teste', org: 'Org ' + n, arroba: n.toLowerCase() + '.noite' });
  const P = (caminho, cookies, method, corpo) => { ctx().D._interno.esquecerLimite(); return ctx().pedir(caminho, { cookies, method: method || 'GET', corpo }) };
  const SQL = (sql, args) => ctx().admin(async c => (await c.query(sql, args)).rows, ctx().URL_TESTE);

  test('noite (0011): o banco aceita a noite; a faixa é das 18:00 (ou da hora) até 24:00; manhã e tarde não mudam', async () => {
    const faixa = async (p, h) => (await SQL('select carro_do_freela.faixa_da_agenda($1, $2::time)::text as f', [p, h]))[0].f;
    assert.equal(await faixa('noite', null), '[1080,1440)', 'noite sem hora: das 18:00 em diante');
    assert.equal(await faixa('noite', '20:30'), '[1230,1440)', 'noite com hora: da hora em diante');
    assert.equal(await faixa('tarde', null), '[720,1440)', 'a tarde segue do meio-dia até 24:00 (quem marcou tarde para a noite continua ocupado à noite)');
    assert.equal(await faixa('manha', null), '[0,720)');
    assert.equal(await faixa('dia', null), '[0,1440)');
    const { db } = ctx(), eu = crypto.randomUUID(), d = ctx().hojeMais(4);
    await db.asUser(eu, c => c.query("insert into carro_do_freela.agenda_dias (sub, dia, estado, parte) values ($1, $2, 'fechado', 'noite')", [eu, d]));
    await db.asUser(eu, c => c.query("update carro_do_freela.agenda_dias set estado = 'negociando', parte = 'noite', hora = '19:00' where sub = $1", [eu]));
    assert.deepEqual(await SQL("select estado, parte, to_char(hora, 'HH24:MI') as h from carro_do_freela.agenda_dias where sub = $1", [eu]), [{ estado: 'negociando', parte: 'noite', h: '19:00' }]);
    await assert.rejects(db.asUser(eu, c => c.query("update carro_do_freela.agenda_dias set parte = 'madrugada' where sub = $1", [eu])), e => e.code === '23514', 'o que não é parte continua recusado');
    await assert.rejects(db.asUser(eu, c => c.query("update carro_do_freela.agenda_dias set parte = 'dia' where sub = $1", [eu])), e => e.code === '23514', 'a hora segue fora do dia inteiro');
  });

  test('noite (0011): ocupado à noite = livre de manhã e à tarde, ocupado à noite (a disponibilidade da guilda)', async () => {
    const f = pessoaNova('Noturna'), cf = await ctx().entrar(f), d = ctx().hojeMais(6);
    assert.equal((await P('/api/zro/perfil', cf, 'PUT', { nome: 'Noturna Teste', cidade: 'Natal', uf: 'RN', funcoes: ['Editor'], visibilidade: 'contratantes' })).status, 200);
    assert.equal((await P('/api/zro/agenda', cf, 'PUT', { dia: d, estado: 'fechado', parte: 'noite' })).status, 200);
    const em = async (ini, fim) => (await SQL("select estado || coalesce(':' || motivo, '') as e from carro_do_freela.guilda_estado_em($1, $2, $3::date, carro_do_freela.faixa_do_dia($4::time, $5::time))",
      [crypto.randomUUID(), f.sub, d, ini, fim]))[0].e;
    assert.equal(await em('08:00', '12:00'), 'livre', 'de manhã, livre');
    assert.equal(await em('13:00', '18:00'), 'livre', 'à tarde até as 18:00 (encosta), livre');
    assert.equal(await em('17:00', '19:00'), 'ocupado:agenda', 'cruzou as 18:00, ocupado');
    assert.equal(await em('20:00', '02:00'), 'ocupado:agenda', 'a noite, ocupado');
    assert.equal(await em(null, null), 'ocupado:agenda', 'o dia todo cruza a noite');
    /* com a hora da virada: ocupada das 21:00 */
    assert.equal((await P('/api/zro/agenda', cf, 'PUT', { dia: d, estado: 'fechado', parte: 'noite', hora: '21:00' })).status, 200);
    assert.equal(await em('18:00', '21:00'), 'livre', 'antes da hora que ela disse, livre');
    assert.equal(await em('20:00', '22:00'), 'ocupado:agenda');
  });

  test('noite (0011): as rotas — PUT parte noite (com e sem hora) e quem contrata lê a noite', async () => {
    const f = pessoaNova('Lua'), cc = await ctx().entrar(pessoaNova('Contrata')), cf = await ctx().entrar(f);
    const d1 = ctx().hojeMais(2), d2 = ctx().hojeMais(3);
    await P('/api/zro/perfil', cf, 'PUT', { nome: 'Lua Teste', cidade: 'Natal', uf: 'RN', funcoes: ['Editor'], visibilidade: 'contratantes' });
    let r = await P('/api/zro/agenda', cf, 'PUT', { dia: d1, estado: 'fechado', parte: 'noite' });
    assert.deepEqual([r.status, (await r.json()).declaracao], [200, { e: 'fechado', p: 'noite' }]);
    r = await P('/api/zro/agenda', cf, 'PUT', { dia: d2, estado: 'negociando', parte: 'noite', hora: '19:30' });
    assert.deepEqual([r.status, (await r.json()).declaracao], [200, { e: 'negociando', p: 'noite', h: '19:30' }]);
    assert.equal((await P('/api/zro/agenda', cf, 'PUT', { dia: d1, estado: 'fechado', parte: 'madrugada' })).status, 400, 'parte que não existe');
    assert.deepEqual((await (await P('/api/zro/agenda', cf)).json()).agenda, { [d1]: { e: 'fechado', p: 'noite' }, [d2]: { e: 'negociando', p: 'noite', h: '19:30' } });
    const zro = ctx().zro, antes = zro.estado.comunidade;
    zro.estado.comunidade = [{ id: f.sub, arroba: f.arroba, nome: f.nome, foto: null, funcoes: [], cidade: 'Natal', portfolio: null, bio: null, selos: [], perfil: 'https://absolutezro.com/pessoas/@' + f.arroba }];
    try {
      const p = (await (await P('/api/zro/pessoas', cc)).json()).pessoas.find(x => x.arroba === f.arroba);
      assert.deepEqual([p.agenda[d1], p.agenda[d2]], [{ e: 'fechado', p: 'noite' }, { e: 'negociando', p: 'noite', h: '19:30' }]);
    } finally { zro.estado.comunidade = antes }
  });
};
