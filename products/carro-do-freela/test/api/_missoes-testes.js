/**
 * O QUADRO DE MISSÕES NO BANCO E NAS ROTAS (0006, fase 2) — registrado no fim do banco.test.js, que empresta o Postgres
 * descartável, a Absolute ZRO falsa e o servidor. Cobre: o portão da fase (a rota da sede 404 e a marca `missao` recusada
 * na proposta), montar o job com gente da guilda (vagas, canal do job, call sheet), uma proposta por pessoa pelo POST de
 * sempre com a marca da guilda (dia, horário e local vêm da missão), aceitar/recusar pelo mesmo PATCH mudando o estado de
 * cada vaga, trocar quem não vai por alguém livre no dia (agenda), o quadro sem preço nem motivo da recusa, o próximo job de
 * cada pessoa, o fechar (memória com o nome do job e XP pelo livro-razão), desmontar e o isolamento entre guildas.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const path = require('node:path');

module.exports = function registrar(ctx) {
  const RAIZ = ctx().RAIZ;
  const FASES = require(path.join(RAIZ, 'db', 'fase.js'));
  const pessoa = (n, extra = {}) => Object.assign({ sub: crypto.randomUUID(), email: n + '@exemplo.com', nome: n[0].toUpperCase() + n.slice(1) + ' Missão', org: 'Org ' + n, arroba: n.toLowerCase() + '.mis' }, extra);
  const livre = () => ctx().D._interno.esquecerLimite();
  const G = (ck, corpo) => { livre(); return ctx().pedir('/api/zro/guildas', { cookies: ck, method: corpo === undefined ? 'GET' : 'POST', corpo }) };
  /** o pedido cru à sede (as provas da disponibilidade usam este) */
  const S0 = (ck, corpo, q) => { livre(); return ctx().pedir('/api/zro/sede' + (q || ''), { cookies: ck, method: corpo === undefined ? 'GET' : 'POST', corpo }) };
  /** nas provas de antes da 0007 a gente de teste não divulga agenda: o dono confirma cada um ("sem agenda, convidar mesmo
   *  assim") e o job sem horário ganha 08:00–18:00 (a data e o horário são obrigatórios desde 01/11) */
  const comoAntes = c => (c && c.acao === 'missao' && Array.isArray(c.equipe)
    ? Object.assign({ ini: '08:00', fim: '18:00' }, c, { equipe: c.equipe.map(x => (x && typeof x === 'object' ? Object.assign({ sem_agenda: true }, x) : x)) })
    : c && c.acao === 'missao_trocar' ? Object.assign({ sem_agenda: true }, c) : c);
  const S = (ck, corpo, q) => S0(ck, comoAntes(corpo), q);
  const P = (ck, corpo, method, id) => { livre(); return ctx().pedir('/api/zro/propostas' + (id ? '?id=' + id : ''), { cookies: ck, method: method || (corpo === undefined ? 'GET' : 'POST'), corpo }) };
  const SQL = (sql, args) => ctx().admin(async c => (await c.query(sql, args)).rows, ctx().URL_TESTE);
  const minha = async ck => (await (await G(ck)).json()).minha;
  const dia = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

  async function montar(nome, tag, nMembros) {
    const { entrar } = ctx();
    const dono = pessoa('dono' + tag.toLowerCase());   /* fundar é grátis (01/11) */
    const cd = await entrar(dono);
    assert.equal((await G(cd, { nome, tag })).status, 201, 'fundou ' + nome);
    const membros = [];
    for (let i = 0; i < nMembros; i++) {
      const p = pessoa('m' + i + tag.toLowerCase());
      const ck = await entrar(p);
      assert.equal((await G(cd, { acao: 'convidar', para: p.sub })).status, 201);
      const rec = (await (await G(ck)).json()).recebidos;
      assert.equal((await G(ck, { acao: 'aceitar', id: rec[0].id })).status, 200);
      membros.push({ p, ck });
    }
    const g = await minha(cd);
    return { dono, cd, membros, g };
  }
  const mandar = async (ckDe, para, missao, extra = {}) => P(ckDe, Object.assign({ para: para.sub, missao, mensagem: 'Job da guilda' }, extra));

  test('missões: com a guilda fora do ar (fase 0) a rota da sede responde 404 e a marca `missao` não existe na proposta', async () => {
    FASES.fixarParaTeste(0);
    const a = pessoa('fase1a'), b = pessoa('fase1b');
    const ca = await ctx().entrar(a); await ctx().entrar(b);
    assert.equal((await S(ca, { acao: 'missao', titulo: 'Clipe', dia: dia(3), equipe: [{ sub: b.sub }] })).status, 404);
    assert.equal((await S(ca, undefined, '?ver=dia&dia=' + dia(3))).status, 404);
    const r = await P(ca, { para: b.sub, missao: crypto.randomUUID() });
    assert.deepEqual([r.status, (await r.json()).campo], [400, 'missao'], 'guilda fora do ar: a marca da guilda é campo desconhecido');
    /* a proposta de sempre continua igual, e sem a marca */
    const ok = await P(ca, { para: b.sub, dia: dia(3), funcao: 'Editor' });
    assert.equal(ok.status, 201);
    const lista = await (await P(ca)).json();
    assert.ok(lista.enviadas.length && lista.enviadas.every(x => !('guilda' in x)), 'sem missão, a saída da proposta é a de sempre');
    FASES.fixarParaTeste(null);   /* daqui em diante, a fase de verdade (1): as missões rodam nela */
    assert.equal(FASES.faseAtual(), 1);
  });

  test('missões: montar o job com gente da guilda — vagas, canal do job, call sheet; recusas de quem não é da casa', async () => {
    const A = await montar('Cardume', 'CDM', 3), B = await montar('Mangue', 'MNG', 1);
    const [m1, m2, m3] = A.membros;
    const fora = pessoa('forasteiro'); await ctx().entrar(fora);
    const corpo = { acao: 'missao', titulo: 'Clipe “Maré Cheia”', contratante: 'fora', cliente: 'Selo Potengi', dia: dia(6), ini: '06:00', fim: '18:00',
      local: 'Forte dos Reis Magos', equipe: [{ sub: m1.p.sub, funcao: 'Op. de câmera' }, { sub: m2.p.sub, funcao: 'Gaffer' }], chamada: { hora: '05:30', obs: 'Maré baixa até 9h' } };
    /* recusas: quem não é da guilda, a própria pessoa, repetido, função fora do catálogo, telefone, preço, cliente sem "de fora" */
    const st = async c => (await S(A.cd, Object.assign({}, corpo, c))).status;
    assert.equal(await st({ equipe: [{ sub: fora.sub }] }), 400, 'quem não é da guilda não entra na missão');
    assert.equal(await st({ equipe: [{ sub: B.dono.sub }] }), 400, 'gente de outra guilda também não');
    assert.equal(await st({ equipe: [{ sub: A.dono.sub }] }), 400, 'quem monta não é vaga');
    assert.equal(await st({ equipe: [{ sub: m1.p.sub }, { sub: m1.p.sub }] }), 400, 'sem repetir');
    assert.equal(await st({ equipe: [{ sub: m1.p.sub, funcao: 'Som direto' }] }), 400, 'função só do catálogo');
    assert.equal(await st({ local: 'liga 84 99999-0000' }), 400, 'telefone não entra');
    assert.equal(await st({ valor_cents: 50000 }), 400, 'o quadro não tem preço');
    assert.equal(await st({ contratante: 'casa' }), 400, 'cliente só quando o contratante é de fora');
    assert.equal(await st({ equipe: [] }), 400, 'ninguém escolhido');
    /* monta */
    let r = await S(A.cd, corpo);
    assert.equal(r.status, 201);
    const { missao } = await r.json();
    assert.ok(missao.id && missao.canal && missao.chamada, 'a missão nasce com o canal do job e o call sheet');
    assert.equal((await S(A.cd, Object.assign({}, corpo, { equipe: [{ sub: m3.p.sub }] }))).status, 409, 'uma missão aberta por dono por dia');
    /* o canal é o canal do job (o dono no dia), com o call sheet da equipe inteira */
    const canal = await (await S(m1.ck, undefined, '?canal=' + missao.canal)).json();
    assert.deepEqual([canal.canal.tipo, canal.canal.nome, canal.canal.dia], ['job', 'Clipe “Maré Cheia”', dia(6)]);
    const cs = canal.mensagens.find(x => x.tipo === 'chamada');
    assert.deepEqual([cs.dados.hora, cs.dados.local, cs.dados.equipe.sort()], ['05:30', 'Forte dos Reis Magos', [A.dono.sub, m1.p.sub, m2.p.sub].sort()]);
    /* o quadro: a missão a rodar, com a equipe pendente; a outra guilda não vê nada (nem pelo papel do app) */
    let g = await minha(m3.ck);
    assert.equal(g.missoes.length, 1);
    const q = g.missoes[0];
    assert.deepEqual([q.titulo, q.estado, q.contratante, q.cliente, q.dono.nome, q.eu_dono], ['Clipe “Maré Cheia”', 'a_rodar', 'fora', 'Selo Potengi', A.dono.nome, false]);
    assert.deepEqual(q.equipe.map(x => [x.nome, x.funcao, x.estado, x.enviada]), [[m1.p.nome, 'Op. de câmera', 'pendente', false], [m2.p.nome, 'Gaffer', 'pendente', false]]);
    assert.ok(!/valor|cents|R\$/.test(JSON.stringify(g.missoes)), 'nada de preço no quadro');
    assert.equal((await minha(B.cd)).missoes.length, 0);
    assert.equal(await ctx().db.asUser(B.dono.sub, async x => (await x.query('select 1 from carro_do_freela.guilda_missoes')).rowCount), 0);
    assert.equal(await ctx().db.asUser(B.dono.sub, async x => (await x.query('select 1 from carro_do_freela.guilda_missao_vagas')).rowCount), 0);
    await assert.rejects(ctx().db.asUser(m1.p.sub, x => x.query("update carro_do_freela.guilda_missao_vagas set estado = 'vai'")), e => e.code === '42501');
    await assert.rejects(ctx().db.asUser(m1.p.sub, x => x.query("insert into carro_do_freela.guilda_missoes (guilda_id, dono_sub, dono_nome, titulo, dia) values ($1, $2, 'x', 'xx', current_date)", [A.g.guilda.id, m1.p.sub])), e => e.code === '42501');
  });

  test('missões: uma proposta por pessoa pela caixa de sempre, com a marca da guilda; o PATCH de sempre muda o quadro', async () => {
    const A = await montar('Ribeira', 'RBR', 4);
    const [m1, m2, m3, m4] = A.membros;
    const fora = pessoa('outro'); const cf = await ctx().entrar(fora);
    const r = await S(A.cd, { acao: 'missao', titulo: 'Campanha Verão', dia: dia(8), ini: '07:00', fim: '17:00', local: 'Redinha',
      equipe: [{ sub: m1.p.sub, funcao: 'Op. de câmera' }, { sub: m2.p.sub, funcao: 'Op. de drone' }, { sub: m3.p.sub }] });
    const { missao } = await r.json();
    /* recusas da marca: alguém fora da missão, outro dono, dia ou função diferentes da missão, brechó */
    assert.equal((await mandar(A.cd, m4.p, missao.id)).status, 409, 'só vaga da missão recebe proposta dela');
    assert.equal((await mandar(m1.ck, m2.p, missao.id)).status, 409, 'só quem montou manda as propostas da missão');
    assert.equal((await mandar(cf, m1.p, missao.id)).status, 409, 'de fora da guilda, nem pensar');
    assert.equal((await mandar(A.cd, m1.p, missao.id, { dia: dia(9) })).status, 409, 'o dia é o da missão');
    assert.equal((await mandar(A.cd, m1.p, missao.id, { funcao: 'Editor' })).status, 409, 'a função é a da vaga');
    assert.equal((await mandar(A.cd, m1.p, crypto.randomUUID())).status, 409, 'missão que não existe');
    /* manda: o servidor preenche dia, horário, local e função a partir da missão */
    const ids = {};
    for (const m of [m1, m2, m3]) {
      const x = await mandar(A.cd, m.p, missao.id);
      assert.equal(x.status, 201);
      const pr = (await x.json()).proposta;
      ids[m.p.sub] = pr.id;
      assert.deepEqual([pr.dia, pr.ini, pr.fim, pr.local], [dia(8), '07:00', '17:00', 'Redinha']);
    }
    assert.equal((await mandar(A.cd, m1.p, missao.id)).status, 409, 'uma proposta por vaga');
    /* quem recebe vê a proposta na caixa de sempre, com a marca da guilda e o tamanho da equipe */
    const cx = await (await P(m1.ck)).json();
    const rec = cx.recebidas.find(x => x.id === ids[m1.p.sub]);
    assert.deepEqual([rec.funcao, rec.guilda.titulo, rec.guilda.nome, rec.guilda.tag, rec.guilda.equipe], ['Op. de câmera', 'Campanha Verão', 'Ribeira', 'RBR', 4]);
    let q = (await minha(m4.ck)).missoes[0];
    assert.deepEqual(q.equipe.map(x => x.estado), ['pendente', 'pendente', 'pendente']);
    assert.ok(q.equipe.every(x => x.enviada));
    /* aceitar e recusar pelo MESMO PATCH */
    assert.equal((await P(m1.ck, { estado: 'aceita' }, 'PATCH', ids[m1.p.sub])).status, 200);
    assert.equal((await P(m2.ck, { estado: 'recusada', motivo: 'Já tenho job nesse dia' }, 'PATCH', ids[m2.p.sub])).status, 200);
    q = (await minha(m4.ck)).missoes[0];
    assert.deepEqual(q.equipe.map(x => x.estado), ['vai', 'nao_vai', 'pendente']);
    assert.deepEqual(q.conta, { vai: 1, pendente: 1, nao_vai: 1 });
    assert.ok(!/Já tenho job/.test(JSON.stringify(q)), 'o motivo da recusa fica entre os dois lados');
    /* a marca não muda depois de mandada, nem pelo papel do app */
    await assert.rejects(ctx().db.asUser(A.dono.sub, x => x.query("update carro_do_freela.propostas set missao_id = null, estado = 'cancelada' where id = $1", [ids[m3.p.sub]])), e => e.code === '42501');
    /* o próximo job de cada pessoa (o selo na lista de membros) */
    const prox = (await minha(m4.ck)).proximos;
    assert.deepEqual([prox[m1.p.sub].estado, prox[m3.p.sub].estado, prox[A.dono.sub].estado, prox[m2.p.sub], prox[m4.p.sub]], ['vai', 'pendente', 'monta', undefined, undefined]);
    assert.equal(prox[m1.p.sub].titulo, 'Campanha Verão');
  });

  test('missões: quem recusou dá lugar a alguém livre no dia (agenda), e só o dono do job troca', async () => {
    const A = await montar('Ponta Negra', 'PNG', 4);
    const [m1, m2, m3, m4] = A.membros;
    const D = dia(10);
    /* m3 divulga a agenda e tem job fechado no dia; m4 divulga e está livre; m2 nunca divulgou */
    for (const [m, est] of [[m3, 'fechado'], [m4, null]]) {
      livre(); await ctx().pedir('/api/zro/perfil', { cookies: m.ck, method: 'PUT', corpo: { nome: m.p.nome, visibilidade: 'contratantes' } });
      livre(); await ctx().pedir('/api/zro/agenda', { cookies: m.ck, method: 'PUT', corpo: { dia: est ? D : dia(20), estado: 'fechado' } });
    }
    const { missao } = await (await S(A.cd, { acao: 'missao', titulo: 'Casamento na praia', dia: D, equipe: [{ sub: m1.p.sub, funcao: 'Fotógrafo' }] })).json();
    const id1 = (await (await mandar(A.cd, m1.p, missao.id)).json()).proposta.id;
    /* quem está livre nesse dia e horário: só diz "livre" de quem divulgou a agenda; quem pergunta não está na lista */
    const dd = await (await S(A.cd, undefined, '?ver=dia&dia=' + D + '&ini=08:00&fim=18:00')).json();
    const est = Object.fromEntries(dd.pessoas.map(x => [x.sub, x.estado + (x.motivo ? ':' + x.motivo : '')]));
    assert.deepEqual([est[m1.p.sub], est[A.dono.sub], est[m2.p.sub], est[m3.p.sub], est[m4.p.sub]], ['ocupado:missao', undefined, 'sem_agenda', 'ocupado:agenda', 'livre']);
    assert.deepEqual([dd.dia, dd.ini, dd.fim], [D, '08:00', '18:00']);
    assert.equal((await S(A.cd, undefined, '?ver=dia&dia=2026-02-31')).status, 400);
    /* trocar: só quem não vai; só o dono do job; a pessoa nova entra sem proposta, e a proposta vai pela caixa de sempre */
    assert.equal((await S(A.cd, { acao: 'missao_trocar', missao: missao.id, sai: m1.p.sub, entra: m4.p.sub })).status, 409, 'quem está pendente não se troca');
    await P(m1.ck, { estado: 'recusada', motivo: 'Valor abaixo da minha tabela' }, 'PATCH', id1);
    assert.equal((await S(m2.ck, { acao: 'missao_trocar', missao: missao.id, sai: m1.p.sub, entra: m4.p.sub })).status, 403, 'só quem montou troca');
    assert.equal((await S(A.cd, { acao: 'missao_trocar', missao: missao.id, sai: m1.p.sub, entra: A.dono.sub })).status, 400);
    assert.equal((await S0(A.cd, { acao: 'missao_trocar', missao: missao.id, sai: m1.p.sub, entra: m3.p.sub })).status, 409, 'ocupado no horário não entra no lugar');
    assert.equal((await S0(A.cd, { acao: 'missao_trocar', missao: missao.id, sai: m1.p.sub, entra: m2.p.sub })).status, 409, 'sem agenda só com a confirmação do dono');
    assert.equal((await S0(A.cd, { acao: 'missao_trocar', missao: missao.id, sai: m1.p.sub, entra: m4.p.sub })).status, 204, 'livre no horário entra');
    let q = (await minha(A.cd)).missoes[0];
    assert.deepEqual(q.equipe.map(x => [x.nome, x.funcao, x.estado, x.enviada]), [[m4.p.nome, 'Fotógrafo', 'pendente', false]], 'a vaga liberada passa para quem entrou, com a função');
    assert.equal((await mandar(A.cd, m4.p, missao.id)).status, 201);
    assert.equal((await mandar(A.cd, m1.p, missao.id)).status, 409, 'quem saiu da missão não recebe outra proposta dela');
    q = (await minha(A.cd)).missoes[0];
    assert.ok(q.equipe[0].enviada);
  });

  test('missões: a disponibilidade por horário (0007) — cruzamento, borda início = fim, pendente ocupa, sem agenda, e o servidor confere ao montar', async () => {
    const { entrar, pedir } = ctx();
    const A = await montar('Maracajaú', 'MRJ', 6);
    const [m1, m2, m3, m4, m5, m6] = A.membros;
    const D = dia(15);
    const divulgar = async m => {
      livre(); assert.equal((await pedir('/api/zro/perfil', { cookies: m.ck, method: 'PUT', corpo: { nome: m.p.nome, visibilidade: 'contratantes' } })).status, 200);
      livre(); assert.equal((await pedir('/api/zro/agenda', { cookies: m.ck, method: 'PUT', corpo: { dia: dia(40), estado: 'negociando' } })).status, 200);
    };
    for (const m of [m1, m2, m3, m4, m5]) await divulgar(m);          /* m6 nunca divulga: "sem agenda" */
    /* m1: manhã fechada até 12:00 (a meia diária da agenda) */
    livre(); assert.equal((await pedir('/api/zro/agenda', { cookies: m1.ck, method: 'PUT', corpo: { dia: D, estado: 'fechado', parte: 'manha', hora: '12:00' } })).status, 200);
    /* m2: job aceito, de fora da guilda, das 14:00 às 18:00 */
    const fora = pessoa('cliente'); const cf = await entrar(fora);
    const job = async (m, ini, fim) => {
      const pr = (await (await P(cf, { para: m.p.sub, dia: D, ini, fim, funcao: 'Editor' })).json()).proposta;
      assert.equal((await P(m.ck, { estado: 'aceita' }, 'PATCH', pr.id)).status, 200);
    };
    await job(m2, '14:00', '18:00');
    /* m5 monta um job da guilda das 10:00 às 12:00 com m3, que fica PENDENTE */
    const r5 = await S0(m5.ck, { acao: 'missao', titulo: 'Making of', dia: D, ini: '10:00', fim: '12:00', equipe: [{ sub: m3.p.sub }] });
    assert.equal(r5.status, 201);
    const mis5 = (await r5.json()).missao;
    assert.equal((await mandar(m5.ck, m3.p, mis5.id)).status, 201);
    const ver = async (ini, fim) => {
      const r = await S0(A.cd, undefined, '?ver=dia&dia=' + D + (ini ? '&ini=' + ini + '&fim=' + fim : ''));
      assert.equal(r.status, 200);
      const l = (await r.json()).pessoas;
      assert.ok(!l.some(x => x.sub === A.dono.sub), 'quem pergunta não está na lista');
      return Object.fromEntries(l.map(x => [x.sub, x.estado + (x.motivo ? ':' + x.motivo : '')]));
    };
    const como = e => [m1, m2, m3, m4, m5, m6].map(m => e[m.p.sub]);
    /* 12:00–14:00: tudo ENCOSTA (a manhã acaba às 12, o job começa às 14, a missão acaba às 12): ninguém cruza */
    assert.deepEqual(como(await ver('12:00', '14:00')), ['livre', 'livre', 'livre', 'livre', 'livre', 'sem_agenda'], 'borda: início = fim não é cruzar');
    /* 11:00–15:00: cruza tudo */
    assert.deepEqual(como(await ver('11:00', '15:00')), ['ocupado:agenda', 'ocupado:agenda', 'ocupado:missao', 'livre', 'ocupado:missao', 'sem_agenda'],
      'cruzar: a manhã declarada, o job aceito, a vaga pendente (ocupa) e quem montou');
    /* o dia todo (sem horário) e a noite (22:00–04:00 vale até 24:00 naquele dia) */
    assert.deepEqual(como(await ver()), ['ocupado:agenda', 'ocupado:agenda', 'ocupado:missao', 'livre', 'ocupado:missao', 'sem_agenda']);
    assert.deepEqual(como(await ver('22:00', '04:00')), ['livre', 'livre', 'livre', 'livre', 'livre', 'sem_agenda'], 'a noite não cruza o dia');
    assert.equal((await S0(A.cd, undefined, '?ver=dia&dia=' + D + '&ini=10:00&fim=10:00')).status, 400, 'início = fim não é horário');
    assert.equal((await S0(A.cd, undefined, '?ver=dia&dia=' + D + '&ini=10:00')).status, 400, 'início sem fim');
    /* só gente que não saiu e da própria guilda; o papel do app não chama o miolo */
    await assert.rejects(ctx().db.asUser(A.dono.sub, x => x.query("select * from carro_do_freela.guilda_estado_em($1, $2, current_date, '[0,1440)'::int4range)", [A.g.guilda.id, m1.p.sub])), e => e.code === '42501');
    /* montar: o servidor confere (não confia na tela) */
    const base = { acao: 'missao', titulo: 'Campanha Maracajaú', dia: D, ini: '11:00', fim: '15:00' };
    assert.equal((await S0(A.cd, Object.assign({}, base, { ini: undefined }))).status, 400, 'sem início não monta');
    assert.equal((await S0(A.cd, Object.assign({}, base, { fim: '11:00' }))).status, 400, 'início = fim não monta');
    let r = await S0(A.cd, Object.assign({}, base, { equipe: [{ sub: m4.p.sub }, { sub: m2.p.sub }] }));
    assert.deepEqual([r.status, await r.json()], [409, { erro: 'ocupado', quem: m2.p.sub }], 'ocupado no horário: recusa e diz quem');
    r = await S0(A.cd, Object.assign({}, base, { equipe: [{ sub: m3.p.sub }] }));
    assert.deepEqual([r.status, (await r.json()).erro], [409, 'ocupado'], 'pendente em outro job da guilda conta como ocupado');
    r = await S0(A.cd, Object.assign({}, base, { equipe: [{ sub: m6.p.sub }] }));
    assert.deepEqual([r.status, await r.json()], [409, { erro: 'sem_agenda', quem: m6.p.sub }], 'sem agenda divulgada: só com a confirmação do dono');
    assert.equal((await S0(A.cd, Object.assign({}, base, { equipe: [{ sub: m6.p.sub, sem_agenda: 'sim' }] }))).status, 400);
    assert.equal((await minha(A.cd)).missoes.filter(x => x.titulo === 'Campanha Maracajaú').length, 0, 'nada foi montado nas recusas');
    /* ficou ocupada no meio-tempo: a lista disse livre, mas antes de montar m4 aceitou outro job no mesmo horário */
    assert.equal((await ver('16:00', '18:00'))[m4.p.sub], 'livre');
    await job(m4, '15:30', '17:00');
    r = await S0(A.cd, Object.assign({}, base, { ini: '16:00', fim: '18:00', equipe: [{ sub: m4.p.sub }] }));
    assert.deepEqual([r.status, await r.json()], [409, { erro: 'ocupado', quem: m4.p.sub }], 'quem ficou ocupado nesse meio-tempo é recusado');
    /* livre e confirmado: monta (o horário que encosta no da manhã de m1 e na missão de m5) */
    r = await S0(A.cd, Object.assign({}, base, { ini: '12:00', fim: '14:00', equipe: [{ sub: m1.p.sub }, { sub: m5.p.sub }, { sub: m6.p.sub, sem_agenda: true }] }));
    assert.equal(r.status, 201, 'livres no horário (e o sem agenda confirmado) montam');
    /* a vaga nova já ocupa: m1 aparece ocupado nesse horário para quem perguntar depois */
    const e2 = Object.fromEntries((await (await S0(m4.ck, undefined, '?ver=dia&dia=' + D + '&ini=13:00&fim=13:30')).json()).pessoas.map(x => [x.sub, x.estado + (x.motivo ? ':' + x.motivo : '')]));
    assert.deepEqual([e2[m1.p.sub], e2[A.dono.sub]], ['ocupado:missao', 'ocupado:missao'], 'a vaga sem proposta e quem montou já ocupam o horário');
  });

  test('missões: fechar leva à memória com o nome do job e soma XP; o call sheet é o do canal do job; desmontar tira tudo', async () => {
    const A = await montar('Genipabu', 'GNP', 2);
    const [m1, m2] = A.membros, gid = A.g.guilda.id;
    const xp = async () => (await SQL('select coalesce(sum(pontos), 0)::int as xp from carro_do_freela.guilda_xp where guilda_id = $1', [gid]))[0].xp;
    const { missao } = await (await S(A.cd, { acao: 'missao', titulo: 'Doc das dunas', dia: dia(12), local: 'Genipabu',
      equipe: [{ sub: m1.p.sub, funcao: 'Op. de drone' }, { sub: m2.p.sub, funcao: 'Op. de câmera' }], chamada: { hora: '04:50' } })).json();
    const ids = [];
    for (const m of [m1, m2]) ids.push((await (await mandar(A.cd, m.p, missao.id)).json()).proposta.id);
    assert.equal(await xp(), 0, 'proposta mandada não é job: XP só quando fecha');
    for (const [i, m] of [m1, m2].entries()) await P(m.ck, { estado: 'aceita' }, 'PATCH', ids[i]);
    assert.equal(await xp(), 240, 'cada dupla da casa vale 120, pela mesma antifarra');
    const mem = (await (await S(m1.ck, undefined, '?ver=memoria')).json()).cartazes;
    assert.equal(mem.length, 1, 'o job da missão vira UM pôster');
    assert.deepEqual([mem[0].titulo, mem[0].vem, mem[0].canal, mem[0].creditos.map(c => c.funcao).sort()], ['Doc das dunas', true, missao.canal, ['Op. de câmera', 'Op. de drone']]);
    /* desmontar: só o dono do job; as propostas viram canceladas e o XP e a memória saem como saíam */
    assert.equal((await S(m1.ck, { acao: 'missao_cancelar', missao: missao.id })).status, 403);
    assert.equal((await S(A.cd, { acao: 'missao_cancelar', missao: missao.id })).status, 204);
    assert.equal(await xp(), 0);
    assert.equal((await (await S(m1.ck, undefined, '?ver=memoria')).json()).cartazes.length, 0);
    assert.equal((await minha(m1.ck)).missoes.length, 0, 'desmontada sai do quadro');
    const cx = await (await P(m1.ck)).json();
    assert.equal(cx.recebidas.find(x => x.id === ids[0]).estado, 'cancelada', 'a caixa de quem foi chamado mostra a proposta cancelada');
    /* o mesmo dia fica livre para montar de novo */
    assert.equal((await S(A.cd, { acao: 'missao', titulo: 'Doc das dunas 2', dia: dia(12), equipe: [{ sub: m1.p.sub }] })).status, 201);
  });

  test('missões: o quadro mostra a rodar, rodando (hoje) e feito, e a busca não conhece missão', async () => {
    const A = await montar('Alecrim', 'ALC', 1);
    const m1 = A.membros[0];
    for (const [n, t] of [[0, 'Hoje no set'], [5, 'Semana que vem']]) {
      const { missao } = await (await S(A.cd, { acao: 'missao', titulo: t, dia: dia(n), equipe: [{ sub: m1.p.sub }] })).json();
      assert.ok(missao.id);
    }
    /* um feito: a missão de ontem (o banco aceita montar até a véspera, para quem fecha depois da meia-noite) */
    const ontem = dia(-1);
    assert.equal((await S(A.cd, { acao: 'missao', titulo: 'Ontem', dia: ontem, equipe: [{ sub: m1.p.sub }] })).status, 201);
    assert.equal((await S(A.cd, { acao: 'missao', titulo: 'Passou', dia: dia(-5), equipe: [{ sub: m1.p.sub }] })).status, 400, 'não se monta job no passado');
    const q = (await minha(m1.ck)).missoes;
    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    const esperado = x => (x.dia > hoje ? 'a_rodar' : x.dia === hoje ? 'rodando' : 'feito');
    assert.equal(q.length, 3);
    assert.ok(q.every(x => x.estado === esperado(x)), 'o estado sai do dia da praça: ' + JSON.stringify(q.map(x => [x.dia, x.estado])));
    assert.ok(q.some(x => x.estado === 'a_rodar') && q.some(x => x.estado !== 'a_rodar'), 'a rodar e (rodando ou feito) no mesmo quadro');
    if (esperado({ dia: ontem }) === 'feito') assert.equal(q[q.length - 1].titulo, 'Ontem', 'o que já foi fica depois do que vem');
    const src = require('node:fs').readFileSync(path.join(RAIZ, 'api', 'zro', '_dados.js'), 'utf8');
    const pessoas = src.slice(src.indexOf('async function pessoas('), src.indexOf('/* ---------------- propostas'));
    assert.ok(pessoas.length > 100 && !/missao|guilda/i.test(pessoas), 'a rota da busca não conhece missão nem guilda');
  });
};
