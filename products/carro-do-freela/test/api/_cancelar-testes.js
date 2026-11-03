/**
 * CANCELAR SÓ ATÉ A VÉSPERA (0010, 03/11/2026) — registrada no banco.test.js, que empresta o Postgres descartável, a
 * Absolute ZRO falsa e o servidor. Decisão do titular: o job aceito só se cancela enquanto o dia dele for depois de
 * hoje em São Paulo; do dia em diante, "Aconteceu? Não" (0009) é o caminho.
 *
 *  - a guarda das propostas (banco): recusa cancelar o job aceito no dia e depois, deixa na véspera; a proposta nova, o
 *    job sem dia e o brechó cancelam como antes; quem recebeu nunca cancela; quem é de fora não alcança a linha;
 *  - o job confirmado pelos dois continua no selo (não há mais como tirá-lo cancelando);
 *  - as rotas: GET diz `cancelavel` em cada proposta; PATCH {estado:'cancelada'} do dia em diante → 409
 *    {erro:'dia', campo:'dia'}, antes → 200.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');

module.exports = function registrar(ctx) {
  const pessoaNova = n => ({ sub: crypto.randomUUID(), email: n + '@exemplo.com', nome: n + ' Teste', org: 'Org ' + n });
  const P = (caminho, cookies, method, corpo) => { ctx().D._interno.esquecerLimite(); return ctx().pedir(caminho, { cookies, method: method || 'GET', corpo }) };
  const SQL = (sql, args) => ctx().admin(async c => (await c.query(sql, args)).rows, ctx().URL_TESTE);
  /* "hoje" é o de São Paulo, a mesma conta do banco */
  const diaSP = async n => (await SQL("select ((now() at time zone 'America/Sao_Paulo')::date + $1::int)::text as d", [n]))[0].d;
  const proposta = async (de, para, dia, estado = 'aceita', tipo = 'job') =>
    (await SQL("insert into carro_do_freela.propostas (de_sub, para_sub, de_nome, tipo, anuncio_id, dia, estado) values ($1, $2, 'Quem contrata', $3, $4, $5, $6) returning id",
      [de, para, tipo, tipo === 'brecho' ? crypto.randomUUID() : null, dia, estado]))[0].id;
  const cancelar = (db, sub, id) => db.asUser(sub, c => c.query("update carro_do_freela.propostas set estado = 'cancelada' where id = $1", [id]));
  const estado = async id => (await SQL('select estado from carro_do_freela.propostas where id = $1', [id]))[0].estado;
  const recusaDoDia = e => e.code === '42501' && /depois que o dia chega/.test(e.message);

  test('cancelar (0010): a guarda recusa cancelar o job aceito no dia e depois; a véspera, a nova, o sem dia e o brechó cancelam', async () => {
    const { db } = ctx();
    const [a, b, z] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (const [n, porque] of [[0, 'no dia'], [-1, 'um dia depois'], [-30, 'um mês depois']]) {
      const id = await proposta(a, b, await diaSP(n));
      await assert.rejects(cancelar(db, a, id), recusaDoDia, 'job aceito ' + porque + ': não cancela');
      assert.equal(await estado(id), 'aceita');
    }
    for (const [dia, est, tipo, porque] of [[await diaSP(1), 'aceita', 'job', 'na véspera'], [await diaSP(30), 'aceita', 'job', 'um mês antes'],
      [await diaSP(-3), 'nova', 'job', 'proposta nova, mesmo com o dia passado'], [await diaSP(0), 'nova', 'job', 'proposta nova no dia'],
      [null, 'aceita', 'job', 'job aceito sem dia'], [await diaSP(-3), 'aceita', 'brecho', 'brechó aceito'], [await diaSP(-3), 'nova', 'brecho', 'brechó novo']]) {
      const id = await proposta(a, b, dia, est, tipo);
      assert.equal((await cancelar(db, a, id)).rowCount, 1, porque + ': cancela');
      assert.equal(await estado(id), 'cancelada', porque);
    }
    /* quem recebeu nunca cancela (antes, no dia, depois); quem é de fora nem vê a linha */
    for (const n of [5, 0, -2]) {
      const id = await proposta(a, b, await diaSP(n));
      await assert.rejects(cancelar(db, b, id), e => e.code === '42501' && !recusaDoDia(e), 'quem recebeu não cancela');
      assert.equal((await cancelar(db, z, id)).rowCount, 0, 'quem é de fora não alcança');
      assert.equal(await estado(id), 'aceita');
    }
    /* o resto da guarda continua: aceitar e recusar de quem recebe, e nada além do estado muda */
    const nova = await proposta(a, b, await diaSP(-1), 'nova');
    await assert.rejects(db.asUser(a, c => c.query("update carro_do_freela.propostas set dia = dia + 9, estado = 'cancelada' where id = $1", [nova])),
      e => e.code === '42501' && /não muda depois de mandada/.test(e.message), 'mudar o dia para escapar da regra não passa');
    assert.equal((await db.asUser(b, c => c.query("update carro_do_freela.propostas set estado = 'aceita' where id = $1", [nova]))).rowCount, 1);
    await assert.rejects(cancelar(db, a, nova), recusaDoDia, 'aceita depois do dia: já não cancela');
  });

  test('cancelar (0010): o job confirmado pelos dois fica no selo', async () => {
    const { db } = ctx();
    const [f, c1] = [crypto.randomUUID(), crypto.randomUUID()];
    const id = await proposta(c1, f, await diaSP(-2));
    for (const s of [f, c1]) await db.asUser(s, c => c.query('insert into carro_do_freela.job_confirmacoes (proposta, sub, aconteceu) values ($1, $2, true)', [id, s]));
    const jobs = async () => (await db.asUser(f, async c => (await c.query('select jobs from carro_do_freela.selo_fatos($1)', [f])).rows[0])).jobs;
    assert.equal(await jobs(), 1);
    await assert.rejects(cancelar(db, c1, id), recusaDoDia, 'quem contratou não tira o job confirmado do selo cancelando');
    assert.equal(await jobs(), 1, 'continua contando');
  });

  test('rotas (0010): GET diz `cancelavel`; PATCH cancelar do dia em diante → 409 {erro:"dia"}, antes → 200', async () => {
    const freela = pessoaNova('cancela-freela'), quem = pessoaNova('cancela-contrata'), fora = pessoaNova('cancela-fora');
    const cf = await ctx().entrar(freela), cc = await ctx().entrar(quem), cx = await ctx().entrar(fora);
    const hoje = await proposta(quem.sub, freela.sub, await diaSP(0));
    const ontem = await proposta(quem.sub, freela.sub, await diaSP(-1));
    const amanha = await proposta(quem.sub, freela.sub, await diaSP(1));
    const nova = await proposta(quem.sub, freela.sub, await diaSP(-4), 'nova');
    const semDia = await proposta(quem.sub, freela.sub, null);
    const caixa = async (c, lado) => (await (await P('/api/zro/propostas', c)).json())[lado];
    const mapa = async (c, lado) => Object.fromEntries((await caixa(c, lado)).map(p => [p.id, p.cancelavel]));
    const env = await mapa(cc, 'enviadas');
    assert.deepEqual([env[hoje], env[ontem], env[amanha], env[nova], env[semDia]], [false, false, true, true, true], 'quem mandou: só até a véspera');
    const rec = await mapa(cf, 'recebidas');
    assert.ok([hoje, ontem, amanha, nova, semDia].every(id => rec[id] === false), 'quem recebeu nunca cancela');
    const patch = (c, id) => P('/api/zro/propostas?id=' + id, c, 'PATCH', { estado: 'cancelada' });
    for (const id of [hoje, ontem]) {
      const r = await patch(cc, id);
      assert.deepEqual([r.status, await r.json()], [409, { erro: 'dia', campo: 'dia' }], 'no dia e depois: recusa com o campo');
      assert.equal(await estado(id), 'aceita');
    }
    let r = await patch(cf, ontem);
    assert.equal(r.status, 403, 'quem recebeu continua sem cancelar (proibido, não "dia")');
    r = await patch(cx, amanha);
    assert.equal(r.status, 404, 'quem é de fora não acha');
    r = await patch(cc, amanha);
    assert.equal(r.status, 200);
    const pr = (await r.json()).proposta;
    assert.deepEqual([pr.estado, pr.cancelavel], ['cancelada', false], 'cancelada na véspera, e não cancela de novo');
    for (const id of [nova, semDia]) assert.equal((await patch(cc, id)).status, 200, 'nova e sem dia cancelam como antes');
    /* o caminho do "não aconteceu" continua aberto no job que não se cancela mais */
    r = await P('/api/zro/propostas?id=' + ontem, cc, 'PATCH', { acao: 'confirmar', aconteceu: false });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).proposta.confirmacao.minha, false);
  });
};
