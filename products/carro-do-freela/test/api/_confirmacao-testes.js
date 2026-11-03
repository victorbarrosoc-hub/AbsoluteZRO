/**
 * O JOB ACONTECEU? (0009, 03/11/2026) — registrada no banco.test.js, que empresta o Postgres descartável, a Absolute
 * ZRO falsa e o servidor. Titular, aprovando o endurecimento do selo: um job só conta nos "6 jobs concluídos" quando
 * quem contratou e quem fez confirmam, depois do dia, que ele aconteceu.
 *
 *  - RLS de `job_confirmacoes`: cada lado só a própria linha, só em proposta de job aceita da qual é ponta, só depois
 *    do dia, uma vez (sem UPDATE nem DELETE, e `em` é do banco); quem é de fora não lê nem escreve;
 *  - o selo: job sem as duas respostas, ou com um "não aconteceu", não conta; com as duas, conta;
 *  - as rotas: GET /api/zro/propostas diz a cada lado se falta a resposta dele e o que o outro disse;
 *    PATCH ?id= {acao:'confirmar', aconteceu} com os erros {erro, campo} de sempre.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');

module.exports = function registrar(ctx) {
  const pessoaNova = n => ({ sub: crypto.randomUUID(), email: n + '@exemplo.com', nome: n + ' Teste', org: 'Org ' + n });
  const P = (caminho, cookies, method, corpo) => { ctx().D._interno.esquecerLimite(); return ctx().pedir(caminho, { cookies, method: method || 'GET', corpo }) };
  const SQL = (sql, args) => ctx().admin(async c => (await c.query(sql, args)).rows, ctx().URL_TESTE);
  /* "hoje" na praça é o do banco (São Paulo): o dia de ontem em UTC pode ainda ser hoje lá */
  const diaSP = async n => (await SQL("select ((now() at time zone 'America/Sao_Paulo')::date + $1::int)::text as d", [n]))[0].d;
  const proposta = async (de, para, dia, estado = 'aceita', tipo = 'job') =>
    (await SQL("insert into carro_do_freela.propostas (de_sub, para_sub, de_nome, tipo, anuncio_id, dia, estado) values ($1, $2, 'Quem contrata', $3, $4, $5, $6) returning id",
      [de, para, tipo, tipo === 'brecho' ? crypto.randomUUID() : null, dia, estado]))[0].id;
  const responder = (db, sub, prop, aconteceu = true) =>
    db.asUser(sub, c => c.query('insert into carro_do_freela.job_confirmacoes (proposta, sub, aconteceu) values ($1, $2, $3)', [prop, sub, aconteceu]));

  test('confirmação (0009): RLS — cada lado só a sua vez, depois do dia, uma vez; quem é de fora não lê nem escreve', async () => {
    const { db } = ctx();
    const [a, b, z] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const passou = await proposta(a, b, await diaSP(-2));
    await responder(db, b, passou);
    assert.deepEqual(await db.asUser(a, async c => (await c.query('select sub, aconteceu from carro_do_freela.job_confirmacoes where proposta = $1', [passou])).rows),
      [{ sub: b, aconteceu: true }], 'o outro lado vê a resposta de quem fez');
    assert.equal(await db.asUser(z, async c => (await c.query('select 1 from carro_do_freela.job_confirmacoes')).rowCount), 0, 'quem é de fora não lê');
    await assert.rejects(responder(db, b, passou, false), e => e.code === '23505', 'responder de novo não vira a resposta');
    await assert.rejects(db.asUser(b, c => c.query('update carro_do_freela.job_confirmacoes set aconteceu = false where proposta = $1', [passou])), e => e.code === '42501', 'nem por UPDATE');
    await assert.rejects(db.asUser(b, c => c.query('delete from carro_do_freela.job_confirmacoes where proposta = $1', [passou])), e => e.code === '42501', 'nem apagando');
    await assert.rejects(db.asUser(b, c => c.query('insert into carro_do_freela.job_confirmacoes (proposta, sub, aconteceu) values ($1, $2, true)', [passou, a])), e => e.code === '42501', 'nem em nome do outro lado');
    await assert.rejects(responder(db, z, passou), e => e.code === '42501', 'quem não é ponta não responde');
    await assert.rejects(db.asUser(a, c => c.query("insert into carro_do_freela.job_confirmacoes (proposta, sub, aconteceu, em) values ($1, $2, true, now() - interval '9 days')", [passou, a])),
      e => e.code === '42501', 'a hora é do banco');
    /* só job aceito, só com o dia passado (hoje ainda não), nunca brechó */
    for (const [dia, estado, tipo, porque] of [[await diaSP(0), 'aceita', 'job', 'hoje ainda não passou'], [await diaSP(3), 'aceita', 'job', 'dia que vem'],
      [await diaSP(-3), 'nova', 'job', 'não aceita'], [await diaSP(-3), 'recusada', 'job', 'recusada'], [await diaSP(-3), 'cancelada', 'job', 'cancelada'],
      [await diaSP(-3), 'aceita', 'brecho', 'brechó'], [null, 'aceita', 'job', 'sem dia']]) {
      const id = await proposta(a, b, dia, estado, tipo);
      await assert.rejects(responder(db, b, id), e => e.code === '42501', porque);
    }
    await responder(db, a, passou, false);
    assert.equal((await SQL('select count(*)::int as n from carro_do_freela.job_confirmacoes where proposta = $1', [passou]))[0].n, 2);
  });

  test('confirmação (0009): o selo só conta o job que os DOIS confirmaram que aconteceu', async () => {
    const { db } = ctx();
    const [f, c1, c2, c3] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const jobs = async () => (await db.asUser(f, async c => (await c.query('select jobs from carro_do_freela.selo_fatos($1)', [f])).rows[0])).jobs;
    const j1 = await proposta(c1, f, await diaSP(-2)), j2 = await proposta(c2, f, await diaSP(-4)), j3 = await proposta(c3, f, await diaSP(-6));
    assert.equal(await jobs(), 0, 'aceita e passada, sem resposta: não conta');
    await responder(db, f, j1);
    assert.equal(await jobs(), 0, 'só quem fez confirmou: não conta');
    await responder(db, c1, j1);
    assert.equal(await jobs(), 1, 'os dois: conta');
    await responder(db, c2, j2); await responder(db, f, j2, false);
    assert.equal(await jobs(), 1, 'um "não aconteceu": não conta');
    await responder(db, c3, j3);
    assert.equal(await jobs(), 1, 'só quem contratou confirmou: não conta');
    /* a mesma conta para quem contrata ver (vitrine, security definer): o ✓ também só com jobs confirmados */
    await SQL("insert into carro_do_freela.perfis (sub, nome_exibicao, cidade, funcoes, nichos, portfolio_url, visibilidade) values ($1, 'F', 'Natal', '{Editor}', '{Clipe}', 'https://f.exemplo', 'contratantes')", [f]);
    await SQL("insert into carro_do_freela.inventario (sub, categoria, modelo) values ($1, 'camera', 'FX3'), ($1, 'lente', '35mm')", [f]);
    await SQL("insert into carro_do_freela.tabelas (sub, funcoes, so_eu_cents, com_equip_cents, hora_extra_cents, deslocamento_cents) values ($1, '{Editor}', '{50000}', '{null}', 0, 0)", [f]);
    const outros = [];
    for (let i = 0; i < 5; i++) outros.push([crypto.randomUUID(), await diaSP(-10 - i)]);
    const ids = [];
    for (const [c, d] of outros) ids.push([c, await proposta(c, f, d)]);
    const ver = async () => (await db.asUser(c1, async c => (await c.query('select verificado from carro_do_freela.vitrine($1::uuid[])', [[f]])).rows[0])).verificado;
    assert.equal(await ver(), false, 'perfil cheio e 6 jobs aceitos, mas só 1 confirmado: sem ✓');
    for (const [c, id] of ids) { await responder(db, f, id); await responder(db, c, id) }
    assert.equal(await jobs(), 6);
    assert.equal(await ver(), true, 'seis confirmados pelos dois: ✓ (R$ 0 de hora extra e deslocamento conta como respondido)');
  });

  test('rotas (0009): GET diz de quem é a vez; PATCH {acao:"confirmar"} responde uma vez, depois do dia, com erro por campo', async () => {
    const freela = pessoaNova('confirma-freela'), quem = pessoaNova('confirma-contrata'), fora = pessoaNova('confirma-fora');
    const cf = await ctx().entrar(freela), cc = await ctx().entrar(quem), cx = await ctx().entrar(fora);
    const passou = await proposta(quem.sub, freela.sub, await diaSP(-2));
    const naoFoi = await proposta(quem.sub, freela.sub, await diaSP(-5));
    const vem = await proposta(quem.sub, freela.sub, await diaSP(4));
    const nova = await proposta(quem.sub, freela.sub, await diaSP(-3), 'nova');
    const caixa = async (c, lado) => (await (await P('/api/zro/propostas', c)).json())[lado];
    const conf = async (c, lado, id) => (await caixa(c, lado)).find(p => p.id === id).confirmacao;
    assert.deepEqual(await conf(cf, 'recebidas', passou), { aberta: true, minha: null, outra: null, pendente: true, confirmado: false });
    assert.deepEqual(await conf(cf, 'recebidas', vem), { aberta: false, minha: null, outra: null, pendente: false, confirmado: false }, 'antes do dia não pede');
    assert.equal(await conf(cf, 'recebidas', nova), undefined, 'proposta que não é job aceito não tem confirmação');
    const selo = async () => (await (await P('/api/zro/selo', cf)).json()).selo.jobs;
    assert.equal(await selo(), 0);
    /* quem fez responde */
    const patch = (c, id, corpo) => P('/api/zro/propostas?id=' + id, c, 'PATCH', corpo);
    let r = await patch(cf, passou, { acao: 'confirmar', aconteceu: true });
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).proposta.confirmacao, { aberta: true, minha: true, outra: null, pendente: false, confirmado: false });
    assert.equal(await selo(), 0, 'só um lado: ainda não conta');
    r = await patch(cf, passou, { acao: 'confirmar', aconteceu: false });
    assert.deepEqual([r.status, await r.json()], [409, { erro: 'ja_confirmado', campo: 'aconteceu' }], 'a resposta não vira');
    /* quem contratou vê que é a vez dele, e o que o outro disse */
    assert.deepEqual(await conf(cc, 'enviadas', passou), { aberta: true, minha: null, outra: true, pendente: true, confirmado: false });
    r = await patch(cc, passou, { acao: 'confirmar', aconteceu: true });
    assert.deepEqual((await r.json()).proposta.confirmacao, { aberta: true, minha: true, outra: true, pendente: false, confirmado: true });
    assert.equal(await selo(), 1, 'os dois: conta no selo de quem fez');
    assert.deepEqual(await conf(cf, 'recebidas', passou), { aberta: true, minha: true, outra: true, pendente: false, confirmado: true });
    /* "não aconteceu" de um lado: fica registrado e não conta */
    await patch(cf, naoFoi, { acao: 'confirmar', aconteceu: false });
    await patch(cc, naoFoi, { acao: 'confirmar', aconteceu: true });
    assert.deepEqual(await conf(cc, 'enviadas', naoFoi), { aberta: true, minha: true, outra: false, pendente: false, confirmado: false });
    assert.equal(await selo(), 1);
    /* recusas */
    const recusa = async (c, id, corpo, status, esperado) => {
      const x = await patch(c, id, corpo);
      assert.deepEqual([x.status, await x.json()], [status, esperado], JSON.stringify(corpo));
    };
    await recusa(cf, vem, { acao: 'confirmar', aconteceu: true }, 409, { erro: 'cedo', campo: 'dia' });
    await recusa(cf, nova, { acao: 'confirmar', aconteceu: true }, 409, { erro: 'estado', campo: 'estado' });
    await recusa(cx, passou, { acao: 'confirmar', aconteceu: true }, 404, { erro: 'nao_achado' });
    await recusa(cf, vem, { acao: 'confirmar' }, 400, { erro: 'tipo', campo: 'aconteceu' });
    await recusa(cf, vem, { acao: 'confirmar', aconteceu: 'sim' }, 400, { erro: 'tipo', campo: 'aconteceu' });
    await recusa(cf, vem, { acao: 'aceitar', aconteceu: true }, 400, { erro: 'tipo', campo: 'acao' });
    await recusa(cf, vem, { acao: 'confirmar', aconteceu: true, estado: 'aceita' }, 400, { erro: 'campo', campo: 'estado' });
    await recusa(cf, vem, { acao: 'confirmar', aconteceu: true, verificado: true }, 400, { erro: 'campo', campo: 'verificado' });
    assert.equal((await ctx().pedir('/api/zro/propostas?id=' + vem, { cookies: cf, method: 'PATCH', corpo: { acao: 'confirmar', aconteceu: true }, headers: { origin: 'https://outro.site' } })).status, 403,
      'escrita só da própria origem');
    /* aceitar e recusar continuam pelo mesmo PATCH */
    const outra = await proposta(quem.sub, freela.sub, await diaSP(9), 'nova');
    r = await patch(cf, outra, { estado: 'aceita' });
    assert.equal((await r.json()).proposta.estado, 'aceita');
  });
};
