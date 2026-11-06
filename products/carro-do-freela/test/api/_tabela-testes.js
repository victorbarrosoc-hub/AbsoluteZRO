/**
 * A TABELA DE DIÁRIA, O "TOPO VIAJAR" E O SELO NO SERVIDOR (0008, 03/11/2026) — registrada no banco.test.js, que
 * empresta o Postgres descartável, a Absolute ZRO falsa e o servidor. Titular: "Tabela diária tem que salvar sim,
 * precisa e pode preparar o selo de verificado".
 *
 *  - RLS: a tabela é só da dona (ler, escrever, apagar, mudar de dona); o banco recusa centavos fora da faixa, listas
 *    de tamanhos diferentes e telefone na função;
 *  - o selo é calculado no banco e nunca é campo: `selo_fatos` de outra conta, chamada pelo app, não revela nada; a
 *    vitrine exige pessoa e só devolve quem consentiu;
 *  - as rotas: GET/PUT /api/zro/tabela (erros por campo, a tabela inteira, nada inventado), GET /api/zro/selo
 *    (perfil, inventário, tabela e jobs concluídos mexem no medidor; 85% e 6 jobs dão o selo), o "topo viajar" no
 *    perfil, e o que quem contrata vê em /api/zro/pessoas (tabela e ✓ só de quem consentiu).
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');

module.exports = function registrar(ctx) {
  const pessoaNova = n => ({ sub: crypto.randomUUID(), email: n + '@exemplo.com', nome: n + ' Teste', org: 'Org ' + n });
  const P = (caminho, cookies, method, corpo) => { ctx().D._interno.esquecerLimite(); return ctx().pedir(caminho, { cookies, method: method || 'GET', corpo }) };
  const SQL = (sql, args) => ctx().admin(async c => (await c.query(sql, args)).rows, ctx().URL_TESTE);
  const TABELA = {
    linhas: [{ funcao: 'Op. de câmera', so_eu_cents: 60000, com_equip_cents: 95000 }, { funcao: 'Editor', so_eu_cents: 45000 }],
    meia_pct: 60, fds_pct: 20, hora_extra_cents: 8000, deslocamento_cents: 15000,
  };

  test('tabela (0008): RLS — só a dona lê e escreve; o banco recusa centavos fora da faixa, listas tortas e telefone', async () => {
    const { db } = ctx();
    const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
    await db.asUser(a, c => c.query("insert into carro_do_freela.tabelas (sub, funcoes, so_eu_cents, com_equip_cents, hora_extra_cents) values ($1, '{Editor}', '{50000}', '{null}', 9000)", [a]));
    assert.equal(await db.asUser(b, async c => (await c.query('select 1 from carro_do_freela.tabelas')).rowCount), 0, 'a outra conta não lê');
    assert.equal(await db.asUser(b, async c => (await c.query('update carro_do_freela.tabelas set hora_extra_cents = 1 where sub = $1', [a])).rowCount), 0, 'nem muda');
    assert.equal(await db.asUser(b, async c => (await c.query('delete from carro_do_freela.tabelas where sub = $1', [a])).rowCount), 0, 'nem apaga');
    await assert.rejects(db.asUser(b, c => c.query("insert into carro_do_freela.tabelas (sub) values ($1)", [a])), e => e.code === '42501', 'nem escreve em nome dela');
    await assert.rejects(db.asUser(a, c => c.query('update carro_do_freela.tabelas set sub = $1', [b])), e => e.code === '42501', 'nem passa a tabela adiante');
    for (const [sql, args] of [
      ["update carro_do_freela.tabelas set so_eu_cents = '{-1}' where sub = $1", [a]],
      ["update carro_do_freela.tabelas set so_eu_cents = '{100000001}' where sub = $1", [a]],
      ["update carro_do_freela.tabelas set com_equip_cents = '{}' where sub = $1", [a]],
      ["update carro_do_freela.tabelas set meia_pct = 101 where sub = $1", [a]],
      ["update carro_do_freela.tabelas set funcoes = '{\"Editor 84 99999-0000\"}' where sub = $1", [a]],
    ]) await assert.rejects(db.asUser(a, c => c.query(sql, args)), e => e.code === '23514', sql);
    assert.equal(await db.asUser(a, async c => (await c.query('select hora_extra_cents from carro_do_freela.tabelas')).rows[0].hora_extra_cents), 9000);
  });

  test('selo (0008): calculado no banco, nunca campo — a conta alheia não vaza por selo_fatos, e a vitrine exige pessoa', async () => {
    const { db } = ctx();
    const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
    await db.asUser(a, async c => {
      await c.query("insert into carro_do_freela.perfis (sub, nome_exibicao, cidade, funcoes, nichos, portfolio_url, visibilidade) values ($1, 'A', 'Natal', '{Editor}', '{Clipe}', 'https://a.exemplo', 'contratantes')", [a]);
      await c.query("insert into carro_do_freela.tabelas (sub, funcoes, so_eu_cents, com_equip_cents) values ($1, '{Editor}', '{50000}', '{null}')", [a]);
    });
    const meu = await db.asUser(a, async c => (await c.query('select fatos, jobs from carro_do_freela.selo_fatos($1)', [a])).rows[0]);
    assert.deepEqual(meu.fatos, { nome: true, port: true, func: true, nicho: true, equip: false, tabela: true, regras: false });
    /* B pergunta pelos fatos de A: as políticas só mostram as linhas de B, então sai tudo falso */
    const alheio = await db.asUser(b, async c => (await c.query('select fatos, jobs from carro_do_freela.selo_fatos($1)', [a])).rows[0]);
    assert.deepEqual(alheio, { fatos: { nome: false, port: false, func: false, nicho: false, equip: false, tabela: false, regras: false }, jobs: 0 });
    /* nenhuma coluna de selo, verificado ou completude existe para alguém ligar */
    const cols = await SQL("select table_name, column_name from information_schema.columns where table_schema = 'carro_do_freela' and column_name ~ '(selo|verific|compl)'");
    assert.deepEqual(cols, []);
    await assert.rejects(db.asSystem('teste: vitrine sem pessoa', async c => { await c.query('set local role carro_do_freela_app'); await c.query("select * from carro_do_freela.vitrine('{}'::uuid[])") }), /Sem pessoa/);
    const vit = await db.asUser(b, async c => (await c.query('select * from carro_do_freela.vitrine($1::uuid[])', [[a, b]])).rows);
    assert.deepEqual(vit.map(x => [x.sub, x.funcoes, x.so_eu_cents, x.verificado]), [[a, ['Editor'], [50000], false]], 'só quem consentiu, e do selo só o booleano');
    /* a pura: os pesos do produto, normalizados; 85% e 6 jobs */
    const s = (await SQL("select carro_do_freela.selo_de('{\"nome\":true,\"func\":true,\"nicho\":true,\"equip\":true,\"tabela\":true}'::jsonb, 6) as j"))[0].j;
    assert.deepEqual([s.pct, s.verificado, s.itens.map(i => i.peso).reduce((x, y) => x + y)], [88, true, 68]);
    assert.equal((await SQL("select carro_do_freela.selo_de('{\"nome\":true,\"func\":true,\"nicho\":true,\"equip\":true,\"tabela\":true}'::jsonb, 5) as j"))[0].j.verificado, false, '5 jobs não bastam');
    assert.equal((await SQL("select carro_do_freela.selo_de('{\"nome\":\"true\",\"func\":1}'::jsonb, 9) as j"))[0].j.pct, 0, 'só booleano conta');
  });

  test('rotas (0008): a tabela — nasce vazia, grava inteira, erros por campo, e nada é inventado', async () => {
    const eu = pessoaNova('tabela'), c = await ctx().entrar(eu);
    let r = await P('/api/zro/tabela', c);
    assert.equal(r.status, 200);
    let j = await r.json();
    assert.equal(j.tabela, null, 'sem tabela: null, nunca um padrão');
    assert.equal(j.selo.verificado, false);
    assert.equal(j.selo.pct, 0);
    r = await P('/api/zro/tabela', c, 'PUT', Object.assign({}, TABELA, { linhas: TABELA.linhas.concat({ funcao: 'Colorista' }) }));
    assert.equal(r.status, 200);
    j = await r.json();
    assert.deepEqual(j.tabela.linhas, [{ funcao: 'Op. de câmera', so_eu_cents: 60000, com_equip_cents: 95000 }, { funcao: 'Editor', so_eu_cents: 45000, com_equip_cents: null }],
      'a linha sem valor sai; o que não foi digitado fica null');
    assert.deepEqual([j.tabela.meia_pct, j.tabela.fds_pct, j.tabela.hora_extra_cents, j.tabela.deslocamento_cents], [60, 20, 8000, 15000]);
    assert.deepEqual(j.selo.itens.filter(i => i.ok).map(i => i.k), ['tabela', 'regras']);
    assert.equal(j.selo.pct, Math.floor(100 * 21 / 68));
    assert.deepEqual((await (await P('/api/zro/tabela', c)).json()).tabela.linhas.length, 2, 'recarregar mantém');
    /* a tabela é inteira: o que não vem volta a null */
    j = await (await P('/api/zro/tabela', c, 'PUT', { linhas: [{ funcao: 'Editor', com_equip_cents: 70000 }] })).json();
    assert.deepEqual([j.tabela.linhas, j.tabela.hora_extra_cents, j.tabela.meia_pct], [[{ funcao: 'Editor', so_eu_cents: null, com_equip_cents: 70000 }], null, null]);
    /* recusas com o campo, como o resto do Carro */
    const recusa = async (corpo, erro, campo) => {
      const x = await P('/api/zro/tabela', c, 'PUT', corpo);
      assert.equal(x.status, 400, JSON.stringify(corpo));
      assert.deepEqual(await x.json(), { erro, campo }, JSON.stringify(corpo));
    };
    await recusa({ linhas: [{ funcao: 'Som direto', so_eu_cents: 1 }] }, 'catalogo', 'funcao');
    await recusa({ linhas: [{ funcao: 'Editor', so_eu_cents: 1 }, { funcao: 'Editor', so_eu_cents: 2 }] }, 'repetida', 'funcao');
    await recusa({ linhas: [{ funcao: 'Editor', so_eu_cents: -5 }] }, 'numero', 'so_eu_cents');
    await recusa({ linhas: [{ funcao: 'Editor', com_equip_cents: 12.5 }] }, 'numero', 'com_equip_cents');
    await recusa({ linhas: [{ funcao: 'Editor', so_eu_cents: '600' }] }, 'numero', 'so_eu_cents');
    await recusa({ meia_pct: 120 }, 'numero', 'meia_pct');
    await recusa({ fds_pct: -1 }, 'numero', 'fds_pct');
    await recusa({ hora_extra_cents: 100000001 }, 'numero', 'hora_extra_cents');
    await recusa({ deslocamento_cents: 'x' }, 'numero', 'deslocamento_cents');
    await recusa({ linhas: Array.from({ length: 13 }, () => ({ funcao: 'Editor' })) }, 'tamanho', 'linhas');
    await recusa({ linhas: [{ funcao: 'Editor', so_eu_cents: 1, telefone: '84999990000' }] }, 'proibido', 'telefone');
    await recusa({ whatsapp: '84999990000' }, 'proibido', 'whatsapp');
    await recusa({ verificado: true }, 'campo', 'verificado');
    await recusa({ selo: true }, 'campo', 'selo');
    assert.equal((await P('/api/zro/tabela', c, 'DELETE')).status, 405);
    assert.equal((await ctx().pedir('/api/zro/tabela', { cookies: c, method: 'PUT', corpo: TABELA, headers: { origin: 'https://outro.site' } })).status, 403, 'escrita só da própria origem');
    /* outra conta: tabela própria vazia */
    const o = await ctx().entrar(pessoaNova('outra-tabela'));
    assert.equal((await (await P('/api/zro/tabela', o)).json()).tabela, null);
  });

  test('rotas (0008): o selo — perfil, equipamento, tabela e 6 jobs concluídos (dia passado, quem fez) dão o ✓; nada do pedido liga', async () => {
    const eu = pessoaNova('selo'), c = await ctx().entrar(eu);
    const selo = async () => (await (await P('/api/zro/selo', c)).json()).selo;
    let s = await selo();
    assert.deepEqual([s.pct, s.jobs, s.verificado, s.meta], [0, 0, false, { pct: 85, jobs: 6 }]);
    assert.deepEqual(s.itens.map(i => i.k), ['nome', 'port', 'func', 'nicho', 'equip', 'tabela', 'regras']);
    assert.ok(s.itens.every(i => typeof i.t === 'string' && typeof i.peso === 'number' && i.ok === false));
    await P('/api/zro/perfil', c, 'PUT', { nome: 'Selo Teste', cidade: 'Natal', uf: 'RN', funcoes: ['Op. de câmera'], nichos: ['Clipe'], portfolio: 'https://selo.exemplo', viaja: true });
    s = await selo();
    assert.equal(s.pct, Math.floor(100 * 35 / 68));
    await P('/api/zro/inventario', c, 'POST', { categoria: 'camera', modelo: 'FX3' });
    s = await selo();
    assert.equal(s.itens.find(i => i.k === 'equip').ok, false, 'câmera sem lente ainda não conta');
    const lente = await (await P('/api/zro/inventario', c, 'POST', { categoria: 'lente', modelo: '24-70' })).json();
    assert.equal((await selo()).itens.find(i => i.k === 'equip').ok, true);
    await P('/api/zro/inventario?id=' + lente.item.id, c, 'PATCH', { ativo: false });
    assert.equal((await selo()).itens.find(i => i.k === 'equip').ok, false, 'lente fora de uso não conta');
    await P('/api/zro/inventario?id=' + lente.item.id, c, 'PATCH', { ativo: true });
    s = (await (await P('/api/zro/tabela', c, 'PUT', TABELA)).json()).selo;
    assert.deepEqual([s.pct, s.jobs, s.verificado], [100, 0, false], 'perfil cheio sem jobs: sem selo');
    /* jobs: só proposta de job ACEITA em que eu sou quem fez, com o dia já passado; o mesmo contratante no mesmo dia conta uma
       vez; e (0009) só com os DOIS lados confirmando que aconteceu — aqui todos confirmados, para provar que as outras
       regras continuam valendo mesmo com as duas respostas (o banco de teste grava direto, sem passar pelo RLS) */
    const contratantes = [crypto.randomUUID(), crypto.randomUUID()];
    const job = async (de, para, dia, estado = 'aceita', tipo = 'job') => {
      const id = (await SQL("insert into carro_do_freela.propostas (de_sub, para_sub, de_nome, tipo, anuncio_id, dia, estado) values ($1, $2, 'Quem contrata', $3, $4, $5, $6) returning id",
        [de, para, tipo, tipo === 'brecho' ? crypto.randomUUID() : null, dia, estado]))[0].id;
      await SQL('insert into carro_do_freela.job_confirmacoes (proposta, sub, aconteceu) values ($1, $2, true), ($1, $3, true)', [id, de, para]);
      return id;
    };
    for (let i = 1; i <= 5; i++) await job(contratantes[i % 2], eu.sub, ctx().hojeMais(-i - 1));
    await job(contratantes[0], eu.sub, ctx().hojeMais(-3));          /* repetido: o mesmo contratante no mesmo dia (o i = 2 acima) */
    await job(contratantes[0], eu.sub, ctx().hojeMais(3));           /* ainda não aconteceu */
    await job(contratantes[0], eu.sub, ctx().hojeMais(-9), 'nova');  /* não aceita */
    await job(contratantes[0], eu.sub, ctx().hojeMais(-9), 'recusada');
    await job(contratantes[1], eu.sub, ctx().hojeMais(-9), 'aceita', 'brecho');
    await job(eu.sub, contratantes[0], ctx().hojeMais(-9));          /* eu contratei: não é job meu */
    s = await selo();
    assert.deepEqual([s.jobs, s.verificado], [5, false], 'cinco jobs de verdade: ainda não');
    await job(contratantes[1], eu.sub, ctx().hojeMais(-20));
    s = await selo();
    assert.deepEqual([s.pct, s.jobs, s.verificado], [100, 6, true], '100% e 6 jobs: verificado');
    /* tirar a tabela derruba (100 - 25 = 75 < 85): o selo é recalculado, não guardado */
    s = (await (await P('/api/zro/tabela', c, 'PUT', { linhas: [], hora_extra_cents: 8000, deslocamento_cents: 15000 })).json()).selo;
    assert.deepEqual([s.pct, s.verificado], [Math.floor(100 * 51 / 68), false]);
    await P('/api/zro/tabela', c, 'PUT', TABELA);
    assert.equal((await selo()).verificado, true);
    assert.equal((await P('/api/zro/selo', c, 'PUT', { verificado: true })).status, 405, 'não há como mandar o selo');
  });

  test('rotas (0008): "topo viajar" no perfil inteiro, e quem contrata vê tabela, viagem e ✓ só de quem consentiu', async () => {
    const { zro } = ctx();
    const freela = Object.assign(pessoaNova('vitrine'), { arroba: 'vitrine.teste' });
    const privada = Object.assign(pessoaNova('vitrine-privada'), { arroba: 'vitrine.privada' });
    const quem = pessoaNova('quem-contrata');
    const z = p => ({ id: p.sub, arroba: p.arroba, nome: p.nome, foto: null, funcoes: [], cidade: 'Natal', portfolio: null, bio: null, selos: [], perfil: 'https://absolutezro.com/pessoas/@' + p.arroba });
    zro.estado.comunidade = [z(freela), z(privada)];
    try {
      const cf = await ctx().entrar(freela), cp = await ctx().entrar(privada), cc = await ctx().entrar(quem);
      /* viaja: entra, sai, e o PUT inteiro sem ele volta a falso */
      let pf = (await (await P('/api/zro/perfil', cf, 'PUT', { nome: 'Vitrine', cidade: 'Natal', uf: 'RN', funcoes: ['Editor'], visibilidade: 'contratantes', viaja: true })).json()).perfil;
      assert.equal(pf.viaja, true);
      assert.equal((await (await P('/api/zro/perfil', cf)).json()).perfil.viaja, true, 'recarregar mantém');
      assert.deepEqual(await (await P('/api/zro/perfil', cf, 'PUT', { nome: 'Vitrine', viaja: 'sim' })).json(), { erro: 'tipo', campo: 'viaja' });
      pf = (await (await P('/api/zro/perfil', cf, 'PUT', { nome: 'Vitrine', cidade: 'Natal', uf: 'RN', funcoes: ['Editor'], visibilidade: 'contratantes' })).json()).perfil;
      assert.equal(pf.viaja, false, 'o perfil é inteiro: sem o campo, volta a falso');
      await P('/api/zro/perfil', cf, 'PUT', { nome: 'Vitrine', cidade: 'Natal', uf: 'RN', funcoes: ['Editor'], visibilidade: 'contratantes', viaja: true });
      await P('/api/zro/perfil', cp, 'PUT', { nome: 'Privada', funcoes: ['Editor'], viaja: true });
      await P('/api/zro/tabela', cf, 'PUT', TABELA);
      await P('/api/zro/tabela', cp, 'PUT', TABELA);
      const lista = async () => (await (await P('/api/zro/pessoas', cc)).json()).pessoas;
      let ps = await lista();
      const f = ps.find(p => p.arroba === 'vitrine.teste'), pv = ps.find(p => p.arroba === 'vitrine.privada');
      assert.deepEqual(f.tabela, { linhas: [{ funcao: 'Op. de câmera', so_eu_cents: 60000, com_equip_cents: 95000 }, { funcao: 'Editor', so_eu_cents: 45000, com_equip_cents: null }],
        meia_pct: 60, fds_pct: 20, hora_extra_cents: 8000, deslocamento_cents: 15000 }, 'a tabela que ELA digitou, sem nada a mais');
      assert.deepEqual([f.viaja, f.verificado], [true, false]);
      assert.deepEqual([pv.tabela, pv.viaja, pv.verificado, pv.agenda], [null, false, false, null], 'sem consentimento: nada da tabela, da viagem nem do selo');
      assert.ok(!/"(pct|itens|jobs|atualizado_em)"/.test(JSON.stringify(f.tabela)), 'do selo e da tabela, só o que é público');
      /* seis jobs e o perfil cheio: o ✓ aparece para quem contrata */
      await P('/api/zro/perfil', cf, 'PUT', { nome: 'Vitrine', cidade: 'Natal', uf: 'RN', funcoes: ['Editor'], nichos: ['Clipe'], portfolio: 'https://vitrine.exemplo', visibilidade: 'contratantes', viaja: true });
      await P('/api/zro/inventario', cf, 'POST', { categoria: 'camera', modelo: 'FX3' });
      await P('/api/zro/inventario', cf, 'POST', { categoria: 'lente', modelo: '35mm' });
      const ids = [];
      for (let i = 1; i <= 6; i++)
        ids.push((await SQL("insert into carro_do_freela.propostas (de_sub, para_sub, de_nome, dia, estado) values ($1, $2, 'Quem contrata', $3, 'aceita') returning id", [quem.sub, freela.sub, ctx().hojeMais(-i - 1)]))[0].id);
      ps = await lista();
      assert.equal(ps.find(p => p.arroba === 'vitrine.teste').verificado, false, '(0009) seis jobs aceitos, nenhum confirmado: sem ✓');
      for (const id of ids)
        await SQL('insert into carro_do_freela.job_confirmacoes (proposta, sub, aconteceu) values ($1, $2, true), ($1, $3, true)', [id, quem.sub, freela.sub]);
      ps = await lista();
      assert.equal(ps.find(p => p.arroba === 'vitrine.teste').verificado, true);
      /* desmarcou: some a tabela, a viagem e o ✓ (continua na comunidade) */
      await P('/api/zro/perfil', cf, 'PUT', { nome: 'Vitrine', funcoes: ['Editor'], visibilidade: 'privado', viaja: true });
      ps = await lista();
      const fora = ps.find(p => p.arroba === 'vitrine.teste');
      assert.deepEqual([fora.tabela, fora.viaja, fora.verificado, fora.agenda], [null, false, false, null]);
    } finally {
      zro.estado.comunidade = [];
    }
  });
};
