/**
 * A SEDE DA GUILDA NO BANCO E NAS ROTAS (0005, fase 2) — registrada no fim do banco.test.js, que empresta o Postgres
 * descartável, a Absolute ZRO falsa e o servidor. Cobre: o portão da fase (404), o chat (sala, canal de job, menção,
 * reação, apagar, fixar, freio, poll com ETag/304, não lidas), o call sheet (confirmar, presença, XP só no canal do
 * job), o XP com a regra antifarra, o quadro, a personalização só do dono (com a guarda de contraste), as imagens
 * (reencodadas, só para a guilda, cota), os lugares (+5 e +15), a memória com os créditos e a busca, que não muda.
 */
const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const crypto = require('node:crypto');
const path = require('node:path');

module.exports = function registrar(ctx) {
  const RAIZ = ctx().RAIZ;
  const FASES = require(path.join(RAIZ, 'db', 'fase.js'));
  const R = require(path.join(RAIZ, 'db', 'regras.js'));
  const FUNDACAO = 'carro-do-freela.guilda_fundacao';
  const pessoa = (n, extra = {}) => Object.assign({ sub: crypto.randomUUID(), email: n + '@exemplo.com', nome: n[0].toUpperCase() + n.slice(1) + ' Sede', org: 'Org ' + n, arroba: n.toLowerCase() + '.sede' }, extra);
  const livre = () => ctx().D._interno.esquecerLimite();
  const G = (ck, corpo, method) => { livre(); return ctx().pedir('/api/zro/guildas', { cookies: ck, method: method || (corpo === undefined ? 'GET' : 'POST'), corpo }) };
  const S = (ck, corpo, extra = {}) => { livre(); return ctx().pedir('/api/zro/sede' + (extra.q || ''), Object.assign({ cookies: ck, method: corpo === undefined ? 'GET' : 'POST', corpo }, extra.headers ? { headers: extra.headers } : {})) };
  const SQL = (sql, args) => ctx().admin(async c => (await c.query(sql, args)).rows, ctx().URL_TESTE);
  const minha = async ck => (await (await G(ck)).json()).minha;
  const json = async r => { const t = await r.text(); try { return JSON.parse(t) } catch (e) { return t } };
  const imagem = async (ck, tipo, bytes, ct) => {
    livre();
    return fetch(ctx().SITE + '/api/zro/sede-imagem?tipo=' + tipo, { method: 'POST', body: bytes,
      headers: { cookie: ctx().cookieDe(ck), origin: ctx().SITE, 'content-type': ct || 'image/png' } });
  };
  const verImagem = async (ck, url) => { livre(); return fetch(ctx().SITE + url, { headers: { cookie: ctx().cookieDe(ck) } }) };

  /** uma guilda com dono e membros, pronta: devolve os cookies, a guilda e a sala */
  async function montar(nome, tag, nMembros) {
    const { entrar } = ctx();
    const dono = pessoa('dono' + tag.toLowerCase(), { recursos: [FUNDACAO] });
    const cd = await entrar(dono);
    const r = await G(cd, { nome, tag });
    assert.equal(r.status, 201, 'fundou ' + nome);
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
    return { dono, cd, membros, g, sala: g.chat.sala };
  }
  const proposta = async (ckDe, para, ckPara, dia, extra = {}) => {
    livre();
    const r = await ctx().pedir('/api/zro/propostas', { cookies: ckDe, method: 'POST', corpo: Object.assign({ para: para.sub, dia, funcao: 'Op. de câmera', local: 'Redinha' }, extra) });
    assert.equal(r.status, 201);
    const id = (await r.json()).proposta.id;
    livre();
    assert.equal((await ctx().pedir('/api/zro/propostas?id=' + id, { cookies: ckPara, method: 'PATCH', corpo: { estado: 'aceita' } })).status, 200);
    return id;
  };
  const xpDe = async gid => (await SQL('select coalesce(sum(pontos), 0)::int as xp from carro_do_freela.guilda_xp where guilda_id = $1', [gid]))[0].xp;

  test('sede: com a fase 1 a rota da sede e a das imagens respondem 404 para todos', async () => {
    FASES.fixarParaTeste(1);
    const c = await ctx().entrar(pessoa('fase'));
    assert.equal((await S(c)).status, 404);
    assert.equal((await S(c, { acao: 'mensagem', canal: crypto.randomUUID(), texto: 'oi' })).status, 404);
    assert.equal((await S(undefined)).status, 404);
    assert.equal((await imagem(c, 'logo', Buffer.from('x'))).status, 404);
    FASES.fixarParaTeste(2);
  });

  test('sede: o chat — sala, menção, reação, apagar, fixar, telefone recusado, freio, e uma guilda não alcança a outra', async () => {
    const A = await montar('Maresia', 'MRS', 2), B = await montar('Farol', 'FRL', 1);
    const [m1, m2] = A.membros;
    assert.ok(A.sala && B.sala && A.sala !== B.sala, 'cada guilda nasce com a sua sala');
    let r = await S(m1.ck, { acao: 'mensagem', canal: A.sala, texto: 'Bom dia @' + m2.p.arroba + ', leva o blimp' });
    assert.equal(r.status, 201);
    const id = (await r.json()).mensagem.id;
    let c = await (await S(m2.ck, undefined, { q: '?canal=' + A.sala })).json();
    const msg = c.mensagens.find(x => x.id === id);
    assert.deepEqual([msg.autor.nome, msg.mencoes, msg.eu], [m1.p.nome, [m2.p.sub], false], 'o nome vem da conta e a menção é de quem é da guilda');
    assert.equal((await S(m1.ck, { acao: 'mensagem', canal: A.sala, texto: 'me chama no 84 99999-0000' })).status, 400, 'telefone não entra');
    assert.equal((await S(m1.ck, { acao: 'mensagem', canal: A.sala, texto: 'oi', autor: 'outro' })).status, 400, 'campo desconhecido é recusado');
    /* a outra guilda: não lê, não escreve, não reage, nem pelo papel do app */
    assert.equal((await S(B.cd, undefined, { q: '?canal=' + A.sala })).status, 404);
    assert.equal((await S(B.cd, { acao: 'mensagem', canal: A.sala, texto: 'intruso' })).status, 404);
    assert.equal((await S(B.cd, { acao: 'reagir', id, emoji: '🔥' })).status, 404);
    assert.equal(await ctx().db.asUser(B.dono.sub, async x => (await x.query('select 1 from carro_do_freela.guilda_mensagens')).rowCount), 0);
    assert.equal(await ctx().db.asUser(B.dono.sub, async x => (await x.query('select 1 from carro_do_freela.guilda_canais where guilda_id = $1', [A.g.guilda.id])).rowCount), 0);
    await assert.rejects(ctx().db.asUser(m1.p.sub, x => x.query("insert into carro_do_freela.guilda_mensagens (guilda_id, canal_id, autor_sub, texto) values ($1, $2, $3, 'direto')", [A.g.guilda.id, A.sala, m1.p.sub])), e => e.code === '42501');
    await assert.rejects(ctx().db.asUser(m1.p.sub, x => x.query('update carro_do_freela.guilda_mensagens set texto = $1', ['x'])), e => e.code === '42501');
    /* reações */
    assert.equal((await S(m2.ck, { acao: 'reagir', id, emoji: '🙌' })).status, 204);
    assert.equal((await S(A.cd, { acao: 'reagir', id, emoji: '🙌' })).status, 204);
    assert.equal((await S(m2.ck, { acao: 'reagir', id, emoji: '🍕' })).status, 400, 'só as reações da casa');
    c = await (await S(m1.ck, undefined, { q: '?canal=' + A.sala })).json();
    assert.deepEqual(c.mensagens.find(x => x.id === id).reacoes, [{ e: '🙌', n: 2, eu: false }]);
    /* fixar: só o dono */
    assert.equal((await S(m1.ck, { acao: 'fixar', id })).status, 403);
    assert.equal((await S(A.cd, { acao: 'fixar', id })).status, 204);
    c = await (await S(m1.ck, undefined, { q: '?canal=' + A.sala })).json();
    assert.deepEqual(c.fixadas.map(f => f.id), [id]);
    /* apagar: o autor apaga o que é seu; outro membro não; o dono tira qualquer uma */
    const id2 = (await (await S(m2.ck, { acao: 'mensagem', canal: A.sala, texto: 'fora do tom' })).json()).mensagem.id;
    assert.equal((await S(m1.ck, { acao: 'apagar', id: id2 })).status, 403);
    assert.equal((await S(A.cd, { acao: 'apagar', id: id2 })).status, 204);
    assert.equal((await S(m1.ck, { acao: 'apagar', id })).status, 204);
    c = await (await S(m2.ck, undefined, { q: '?canal=' + A.sala })).json();
    const ap = c.mensagens.find(x => x.id === id);
    assert.deepEqual([ap.apagada, ap.texto, ap.reacoes.length, c.fixadas.length], [true, null, 0, 0], 'apagada some o conteúdo, as reações e o fixado');
    /* freio: 20 mensagens por minuto por pessoa (no banco) */
    let ultimo = 0;
    for (let i = 0; i < 21; i++) ultimo = (await S(m2.ck, { acao: 'mensagem', canal: A.sala, texto: 'linha ' + i })).status;
    assert.equal(ultimo, 429, 'a 21ª mensagem no minuto espera');
  });

  test('sede: o poll do chat — ETag e 304 sem mudança, só o que mudou com `desde`, digitando, presença e não lidas', async () => {
    const A = await montar('Pipa', 'PPA', 1);
    const m1 = A.membros[0];
    await S(A.cd, { acao: 'mensagem', canal: A.sala, texto: 'primeira' });
    let r = await S(m1.ck, undefined, { q: '?canal=' + A.sala });
    assert.equal(r.status, 200);
    const etag = r.headers.get('etag'); const c1 = await r.json();
    assert.ok(etag && c1.v > 0 && c1.completo);
    r = await S(m1.ck, undefined, { q: '?canal=' + A.sala, headers: { 'if-none-match': etag } });
    assert.equal(r.status, 304, 'nada mudou: 304 sem corpo');
    assert.equal(await r.text(), '');
    /* o dono vê 1 não lida da mensagem do outro antes de abrir o canal */
    await S(m1.ck, { acao: 'mensagem', canal: A.sala, texto: 'segunda' });
    assert.equal((await minha(A.cd)).chat.nao_lidas, 1);
    r = await S(m1.ck, undefined, { q: '?canal=' + A.sala + '&desde=' + c1.v, headers: { 'if-none-match': etag } });
    const c2 = await r.json();
    assert.deepEqual([r.status, c2.completo, c2.mensagens.map(x => x.texto)], [200, false, ['segunda']], 'desde traz só o que mudou');
    await S(A.cd, undefined, { q: '?canal=' + A.sala });
    assert.equal((await minha(A.cd)).chat.nao_lidas, 0, 'abrir o canal marca como lido');
    /* digitando chega a quem está no canal; e a sede sabe quem está aqui */
    assert.equal((await S(A.cd, { acao: 'digitando', canal: A.sala })).status, 204);
    r = await S(m1.ck, undefined, { q: '?canal=' + A.sala + '&desde=' + c2.v, headers: { 'if-none-match': r.headers.get('etag') } });
    const c3 = await r.json();
    assert.deepEqual([r.status, c3.digitando], [200, [A.dono.nome]]);
    assert.equal(c3.agora.n, 2);
    assert.equal((await minha(m1.ck)).agora.n, 2, '2 na sede agora');
    assert.equal((await S(m1.ck, undefined, { q: '?canal=nao-e-uuid' })).status, 400);
  });

  test('sede: XP só de evento real, com a regra antifarra; evento na sala, marco no quadro, cancelado tira', async () => {
    const { entrar } = ctx();
    const A = await montar('Barra', 'BRR', 2);
    const [m1, m2] = A.membros, gid = A.g.guilda.id;
    const fora = pessoa('cliente'), cf = await entrar(fora);
    const dia = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    /* dupla da casa: a primeira conta 120; a segunda da mesma dupla no mês não conta */
    await proposta(m1.ck, m2.p, m2.ck, dia(3));
    assert.equal(await xpDe(gid), 120);
    await proposta(m2.ck, m1.p, m1.ck, dia(4));
    assert.equal(await xpDe(gid), 120, 'a mesma dupla da casa conta uma vez por mês');
    assert.deepEqual((await SQL("select motivo from carro_do_freela.guilda_xp where guilda_id = $1 and pontos = 0", [gid])).map(x => x.motivo), ['mesma dupla da casa no mês']);
    /* contratante de fora: 180 (1,5×), até 4 no mês com o mesmo */
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await proposta(cf, i % 2 ? m1.p : m2.p, i % 2 ? m1.ck : m2.ck, dia(5 + i)));
    assert.equal(await xpDe(gid), 120 + 4 * 180, 'o mesmo contratante de fora rende em até 4 jobs no mês');
    /* mensagem e reação não dão XP */
    const msg = (await (await S(m1.ck, { acao: 'mensagem', canal: A.sala, texto: 'valeu, time' })).json()).mensagem.id;
    await S(m2.ck, { acao: 'reagir', id: msg, emoji: '👏' });
    assert.equal(await xpDe(gid), 840);
    /* o evento na sala (job com XP) e o marco no quadro (subiu do 1 para o 3) */
    const c = await (await S(m1.ck, undefined, { q: '?canal=' + A.sala })).json();
    const ev = c.mensagens.filter(x => x.tipo === 'evento');
    assert.equal(ev.length, 5, 'um evento por job com XP');
    assert.ok(ev.every(x => x.autor === null && x.dados.xp > 0));
    const marcos = (await (await S(m1.ck, undefined, { q: '?ver=mural' })).json()).posts.filter(p => p.tipo === 'marco');
    assert.deepEqual(marcos.map(p => p.titulo).sort(), ['A sede subiu para o nível 2', 'A sede subiu para o nível 3']);
    let g = await minha(m1.ck);
    assert.deepEqual([g.nivel.atual, g.nivel.xp, g.nivel.de, g.nivel.ate], [3, 840, 800, 1200]);
    /* cancelado deixa de contar, e o evento sai da sala */
    livre();
    assert.equal((await ctx().pedir('/api/zro/propostas?id=' + ids[0], { cookies: cf, method: 'PATCH', corpo: { estado: 'cancelada' } })).status, 200);
    assert.equal(await xpDe(gid), 660);
    assert.equal((await SQL("select count(*)::int as n from carro_do_freela.guilda_mensagens where guilda_id = $1 and tipo = 'evento'", [gid]))[0].n, 4);
    /* o quadro: 10 XP por post, até 3 por pessoa por semana */
    for (let i = 0; i < 4; i++) assert.equal((await S(m1.ck, { acao: 'post', tipo: 'vitoria', titulo: 'Vitória ' + i })).status, 201);
    assert.equal(await xpDe(gid), 660 + 30, 'só 3 posts por semana rendem XP');
    g = await minha(m1.ck);
    assert.equal(g.placa.semana.find(x => /vitória/i.test(x.t)).n, 1);
    assert.ok(g.placa.credenciais.find(x => x.codigo === 'primeiro').ok);
    assert.equal(g.placa.credenciais.find(x => x.codigo === 'cliente').ok, true, 'o contratante de fora voltou (vários dias)');
  });

  test('sede: o call sheet — confirmar, presença no dia por quem mandou ou pelo dono, XP só no canal do job e para quem confirmou', async () => {
    const A = await montar('Rendeiras', 'RND', 3);
    const [m1, m2, m3] = A.membros;
    const hoje = new Date().toISOString().slice(0, 10), amanha = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    /* o job de hoje (m1 chamou m2 e m3) e o canal dele: quem fez abre; quem não fez não abre; o dono abre */
    await proposta(m1.ck, m2.p, m2.ck, hoje);
    await proposta(m1.ck, m3.p, m3.ck, hoje, { funcao: 'Gaffer' });
    const job = (await SQL('select id from carro_do_freela.guilda_jobs where guilda_id = $1 and para_sub = $2', [A.g.guilda.id, m2.p.sub]))[0].id;
    const fora = pessoa('naofez'); const cfora = await ctx().entrar(fora);
    assert.equal((await G(A.cd, { acao: 'convidar', para: fora.sub })).status, 201);
    assert.equal((await G(cfora, { acao: 'aceitar', id: (await (await G(cfora)).json()).recebidos[0].id })).status, 200);
    assert.equal((await S(cfora, { acao: 'canal_job', job })).status, 403, 'quem não fez o job não abre o canal');
    let r = await S(m2.ck, { acao: 'canal_job', job });
    assert.equal(r.status, 200);
    const canal = (await r.json()).canal.id;
    assert.equal((await (await S(A.cd, { acao: 'canal_job', job })).json()).canal.id, canal, 'um canal por job');
    /* o call sheet: hora da chamada, locação e equipe (só gente da guilda entra na equipe) */
    r = await S(m1.ck, { acao: 'chamada', canal, titulo: 'Campanha Verão', dia: hoje, hora: '05:30', local: 'Redinha', equipe: [m2.p.sub, m3.p.sub, crypto.randomUUID()] });
    assert.equal(r.status, 201);
    const cs = (await r.json()).mensagem.id;
    assert.equal((await S(m1.ck, { acao: 'chamada', canal, titulo: 'X', dia: hoje, hora: '25:00', local: 'R' })).status, 400, 'hora inválida');
    let c = await (await S(m2.ck, undefined, { q: '?canal=' + canal })).json();
    const sheet = c.mensagens.find(x => x.id === cs);
    assert.deepEqual([sheet.tipo, sheet.dados.hora, sheet.dados.local, sheet.dados.equipe.sort()], ['chamada', '05:30', 'Redinha', [m2.p.sub, m3.p.sub].sort()]);
    assert.equal((await S(m2.ck, { acao: 'responder', id: cs, resposta: 'vou' })).status, 204);
    assert.equal((await S(m3.ck, { acao: 'responder', id: cs, resposta: 'nao' })).status, 204);
    c = await (await S(m2.ck, undefined, { q: '?canal=' + canal })).json();
    assert.deepEqual(c.mensagens.find(x => x.id === cs).chamada, { vou: [m2.p.sub], nao: [m3.p.sub], presentes: [], eu: 'vou' });
    /* presença: só quem mandou ou o dono; só de quem confirmou; XP 15 */
    const xpAntes = await xpDe(A.g.guilda.id);
    assert.equal((await S(m2.ck, { acao: 'presenca', id: cs, sub: m2.p.sub })).status, 403);
    assert.equal((await S(m1.ck, { acao: 'presenca', id: cs, sub: m3.p.sub })).status, 404, 'quem não confirmou não ganha presença');
    assert.equal((await S(m1.ck, { acao: 'presenca', id: cs, sub: m2.p.sub })).status, 204);
    assert.equal(await xpDe(A.g.guilda.id), xpAntes + 15);
    assert.equal((await S(A.cd, { acao: 'presenca', id: cs, sub: m2.p.sub, presente: false })).status, 204);
    assert.equal(await xpDe(A.g.guilda.id), xpAntes, 'desmarcar tira o XP');
    /* na sala (fora do canal do job) a presença vale, mas não dá XP; e chamada futura não aceita presença */
    const naSala = (await (await S(m1.ck, { acao: 'chamada', canal: A.sala, titulo: 'Reunião', dia: hoje, hora: '09:00', local: 'Sede' })).json()).mensagem.id;
    await S(m2.ck, { acao: 'responder', id: naSala, resposta: 'vou' });
    assert.equal((await S(m1.ck, { acao: 'presenca', id: naSala, sub: m2.p.sub })).status, 204);
    assert.equal(await xpDe(A.g.guilda.id), xpAntes);
    const futura = (await (await S(m1.ck, { acao: 'chamada', canal, titulo: 'Diária 2', dia: amanha, hora: '06:00', local: 'Redinha' })).json()).mensagem.id;
    await S(m2.ck, { acao: 'responder', id: futura, resposta: 'vou' });
    assert.equal((await S(m1.ck, { acao: 'presenca', id: futura, sub: m2.p.sub })).status, 409);
    /* nomear o job: quem fez ou o dono; quem não fez não */
    assert.equal((await S(cfora, { acao: 'nomear', job, titulo: 'Outro nome' })).status, 403);
    assert.equal((await S(m3.ck, { acao: 'nomear', job, titulo: 'Campanha Verão', tipo: 'Publicidade' })).status, 204);
    assert.equal((await S(m3.ck, { acao: 'nomear', job, titulo: 'X', tipo: 'Inventado' })).status, 400);
    const mem = (await (await S(m1.ck, undefined, { q: '?ver=memoria' })).json()).cartazes;
    const cart = mem.find(x => x.dia === hoje);
    assert.deepEqual([cart.titulo, cart.tipo, cart.local, cart.canal, cart.contratante, cart.creditos.map(x => x.funcao).sort()],
      ['Campanha Verão', 'Publicidade', 'Redinha', canal, m1.p.nome, ['Gaffer', 'Op. de câmera']], 'um pôster por job (o mesmo contratante no mesmo dia), com os créditos');
  });

  test('sede: o quadro — aviso só do dono, vaga, reações e "quero", fixar só o dono, apagar, e a outra guilda não vê', async () => {
    const A = await montar('Ponta', 'PNT', 1), B = await montar('Areia', 'ARE', 0);
    const m1 = A.membros[0];
    assert.equal((await S(m1.ck, { acao: 'post', tipo: 'aviso', titulo: 'Sábado é dia' })).status, 403, 'aviso é da líder');
    assert.equal((await S(A.cd, { acao: 'post', tipo: 'aviso', titulo: 'Sábado é dia de Café Potengi', texto: 'Chamada 6h na Redinha.' })).status, 201);
    let r = await S(m1.ck, { acao: 'post', tipo: 'vaga', titulo: '1ª assistente de câmera', dia: '2026-11-14', funcao: '1º assistente', diaria_cents: 45000 });
    assert.equal(r.status, 201);
    const vaga = (await r.json()).post.id;
    assert.equal((await S(m1.ck, { acao: 'post', tipo: 'set', titulo: 'Bastidor', link: 'http://inseguro.exemplo' })).status, 400);
    assert.equal((await S(m1.ck, { acao: 'post', tipo: 'set', titulo: 'Bastidor', link: 'https://wa.me/5584999990000' })).status, 400);
    assert.equal((await S(m1.ck, { acao: 'post', tipo: 'marco', titulo: 'Inventei um marco' })).status, 400, 'marco é só da sede');
    assert.equal((await S(A.cd, { acao: 'post_reagir', id: vaga, emoji: 'quero' })).status, 204);
    assert.equal((await S(A.cd, { acao: 'post_reagir', id: vaga, emoji: '🔥' })).status, 204);
    let posts = (await (await S(m1.ck, undefined, { q: '?ver=mural' })).json()).posts;
    const pv = posts.find(p => p.id === vaga);
    assert.deepEqual([pv.dados, pv.quero, pv.reacoes], [{ dia: '2026-11-14', funcao: '1º assistente', diaria_cents: 45000 }, { n: 1, eu: false }, [{ e: '🔥', n: 1, eu: false }]]);
    assert.equal((await S(m1.ck, { acao: 'post_fixar', id: vaga })).status, 403);
    assert.equal((await S(A.cd, { acao: 'post_fixar', id: vaga })).status, 204);
    posts = (await (await S(m1.ck, undefined, { q: '?ver=mural' })).json()).posts;
    assert.equal(posts[0].id, vaga, 'o fixado vem primeiro');
    assert.deepEqual((await (await S(B.cd, undefined, { q: '?ver=mural' })).json()).posts, [], 'a outra guilda não vê o quadro');
    assert.equal((await S(B.cd, { acao: 'post_apagar', id: vaga })).status, 404);
    assert.equal((await S(A.cd, { acao: 'post_apagar', id: vaga })).status, 204, 'o dono tira qualquer post');
  });

  test('sede: personalizar é só do dono; a cor própria ganha a guarda de contraste nos dois temas', async () => {
    const A = await montar('Cores', 'COR', 1);
    const m1 = A.membros[0];
    assert.equal((await minha(m1.ck)).guilda.paleta.id, 'gel-magenta', 'Gel magenta é a padrão');
    assert.deepEqual(Object.keys(R.PALETAS).sort(), ['bordo', 'gel-magenta', 'jade', 'luz-do-dia', 'tungstenio']);
    assert.equal((await G(m1.ck, { acao: 'personalizar', paleta: 'jade' })).status, 403, 'membro não muda a cor');
    assert.equal((await G(A.cd, { acao: 'personalizar', paleta: 'roxo' })).status, 400);
    assert.equal((await G(A.cd, { acao: 'personalizar', paleta: 'propria' })).status, 400, 'cor própria pede a cor');
    assert.equal((await G(A.cd, { acao: 'personalizar', paleta: 'jade', praca: 'Natal/RN', sobre: 'Clipe e casamento' })).status, 200);
    let g = (await minha(m1.ck)).guilda;
    assert.deepEqual([g.paleta.id, g.paleta.d, g.paleta.l, g.praca, g.sobre], ['jade', '#3FD3B0', '#0F7D66', 'Natal/RN', 'Clipe e casamento']);
    /* uma cor que não passaria em nenhum dos dois temas (cinza médio): a guarda clareia no escuro e escurece no claro */
    const r0 = await G(A.cd, { acao: 'personalizar', paleta: 'propria', cor: '#777777' });
    assert.equal(r0.status, 200);
    g = (await minha(m1.ck)).guilda;
    assert.equal(g.paleta.id, 'propria');
    assert.ok(R.contraste(g.paleta.d, '#1E1E22') >= 4.5 && R.contraste(g.paleta.l, '#F5F5F7') >= 4.5, JSON.stringify(g.paleta));
    assert.ok(R.contraste(g.paleta.d, g.paleta.ink) >= 4.5, 'a tinta sobre o acento também passa');
    for (const cor of ['#000000', '#FFFFFF', '#FFFF00', '#0000FF', '#12AB34']) {
      const p = R.corPropria(cor);
      assert.ok(R.contraste(p.d, '#1E1E22') >= 4.5 && R.contraste(p.l, '#F5F5F7') >= 4.5, cor + ' → ' + JSON.stringify(p));
    }
    assert.equal((await G(A.cd, { acao: 'personalizar', paleta: 'propria', cor: 'red' })).status, 400);
    await assert.rejects(ctx().db.asUser(m1.p.sub, x => x.query("update carro_do_freela.guildas set paleta = 'bordo'")), e => e.code === '42501');
  });

  test('sede: o logo — só o dono troca, reencodado em WebP sem metadados, tipo pelos bytes, só a guilda vê, cota igual nos dois lados', async () => {
    const sharp = require('sharp');
    const A = await montar('Logo', 'LGO', 1), B = await montar('Vizinha', 'VZN', 0);
    const m1 = A.membros[0];
    const png = await sharp({ create: { width: 900, height: 700, channels: 4, background: '#F062B8' } }).png().toBuffer();
    const jpg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#3FD3B0' } })
      .jpeg().withMetadata({ exif: { IFD0: { Copyright: 'SEGREDO-DO-EXIF', Artist: 'Fulano' } } }).toBuffer();
    assert.ok(jpg.includes(Buffer.from('SEGREDO-DO-EXIF')), 'o JPEG de teste leva EXIF');
    assert.equal((await imagem(m1.ck, 'logo', png)).status, 403, 'membro não troca o logo');
    assert.equal((await imagem(A.cd, 'logo', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png')).status, 415, 'SVG não passa, nem disfarçado de PNG');
    assert.equal((await imagem(A.cd, 'logo', Buffer.from('GIF89a' + 'x'.repeat(40)), 'image/png')).status, 415);
    assert.equal((await imagem(A.cd, 'logo', png, 'text/plain')).status, 415);
    assert.equal((await imagem(A.cd, 'logo', Buffer.alloc(4 * 1024 * 1024 + 10))).status, 413);
    let r = await imagem(A.cd, 'logo', jpg, 'image/jpeg');
    assert.equal(r.status, 201);
    const im = (await r.json()).imagem;
    assert.ok(im.largura <= 512 && im.altura <= 512 && im.bytes <= 65536, JSON.stringify(im));
    const g = (await minha(m1.ck)).guilda;
    assert.equal(g.logo.url, im.url, 'o logo vale para toda a guilda');
    r = await verImagem(m1.ck, im.url);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/webp');
    assert.match(r.headers.get('cache-control'), /^private/);
    const b = Buffer.from(await r.arrayBuffer());
    assert.equal(b.toString('latin1', 0, 4) + b.toString('latin1', 8, 12), 'RIFFWEBP');
    assert.ok(!b.includes(Buffer.from('SEGREDO-DO-EXIF')) && !b.includes(Buffer.from('Fulano')), 'nenhum metadado sobrevive');
    assert.equal(crypto.createHash('sha256').update(b).digest('hex'), im.sha);
    assert.equal((await verImagem(B.cd, im.url)).status, 404, 'a outra guilda não lê o logo');
    assert.equal((await verImagem(A.cd, im.url.replace(/sha=[0-9a-f]+/, 'sha=' + 'a'.repeat(64)))).status, 404, 'sha errado não abre');
    await assert.rejects(ctx().db.asUser(A.dono.sub, x => x.query('select webp from carro_do_freela.guilda_imagens')), e => e.code === '42501', 'os bytes só pela porta');
    /* trocar o logo apaga o antigo; tirar volta ao emblema de iniciais */
    r = await imagem(A.cd, 'logo', png);
    assert.equal(r.status, 201);
    assert.equal((await SQL("select count(*)::int as n from carro_do_freela.guilda_imagens where guilda_id = $1 and tipo = 'logo'", [A.g.guilda.id]))[0].n, 1);
    livre();
    assert.equal((await fetch(ctx().SITE + '/api/zro/sede-imagem?tipo=logo', { method: 'DELETE', headers: { cookie: ctx().cookieDe(m1.ck), origin: ctx().SITE } })).status, 403);
    livre();
    assert.equal((await fetch(ctx().SITE + '/api/zro/sede-imagem?tipo=logo', { method: 'DELETE', headers: { cookie: ctx().cookieDe(A.cd), origin: ctx().SITE } })).status, 204);
    assert.equal((await minha(A.cd)).guilda.logo, null);
    /* foto do set: qualquer membro manda e anexa no quadro (só a própria, uma vez) */
    r = await imagem(m1.ck, 'foto', jpg, 'image/jpeg');
    const foto = (await r.json()).imagem;
    assert.equal((await S(A.cd, { acao: 'post', tipo: 'set', titulo: 'Bastidor', imagem: foto.id })).status, 404, 'a foto de outra pessoa não se anexa');
    assert.equal((await S(m1.ck, { acao: 'post', tipo: 'set', titulo: 'Bastidor do institucional', imagem: foto.id })).status, 201);
    assert.equal((await S(m1.ck, { acao: 'mensagem', canal: A.sala, imagem: foto.id })).status, 404, 'uma foto, um lugar');
    /* a cota é a mesma no banco e no servidor */
    const cota = (await SQL('select carro_do_freela.guilda_imagens_cota() as c'))[0].c;
    assert.equal(Number(cota), require(path.join(RAIZ, 'api', 'zro', '_imagem.js')).COTA_IMAGENS);
    await SQL('create or replace function carro_do_freela.guilda_imagens_cota() returns bigint language sql immutable set search_path = \'\' as $$ select 1000::bigint $$');
    try {
      r = await imagem(A.cd, 'logo', png);
      assert.deepEqual([r.status, (await r.json()).erro], [413, 'cota']);
    } finally {
      await SQL('create or replace function carro_do_freela.guilda_imagens_cota() returns bigint language sql immutable set search_path = \'\' as $$ select 50::bigint * 1024 * 1024 $$');
    }
  });

  test('sede: lugares — +5 e +15 somam na guilda do dono; quem saiu da guilda fica nos créditos com "saiu"', async () => {
    const { entrar } = ctx();
    const A = await montar('Lugar', 'LGR', 2);
    const [m1, m2] = A.membros;
    let g = await minha(await entrar(Object.assign({}, A.dono, { recursos: [FUNDACAO, 'carro-do-freela.guilda_espaco_extra_15'] })));
    assert.deepEqual([g.vagas.extra, g.vagas.total], [15, 30]);
    const r = await G(await entrar(Object.assign({}, A.dono, { recursos: [FUNDACAO, 'carro-do-freela.guilda_espaco_extra', 'carro-do-freela.guilda_espaco_extra_15'] })));
    const j = await r.json();
    assert.deepEqual([j.minha.vagas.extra, j.minha.vagas.total, j.pacotes.sort((a, b) => a - b)], [20, 35, [5, 15]]);
    assert.match(j.pedir_url, /\/perfil\/plano$/, 'o pedido de plano vai ao HUB (nada é cobrado aqui)');
    /* o job e quem saiu */
    const hoje = new Date().toISOString().slice(0, 10);
    await proposta(m1.ck, m2.p, m2.ck, hoje, { funcao: 'Drone' });
    assert.equal((await G(m2.ck, { acao: 'sair' })).status, 204);
    const cart = (await (await S(m1.ck, undefined, { q: '?ver=memoria' })).json()).cartazes[0];
    assert.deepEqual(cart.creditos, [{ funcao: 'Drone', nome: m2.p.nome, de_fora: false, saiu: true }]);
    assert.equal((await S(m2.ck, undefined, { q: '?ver=memoria' })).status, 404, 'quem saiu não lê mais a memória');
  });

  test('sede: XP, nível, lugares e cor nunca mexem na ordem da busca', async () => {
    const { entrar, pedir, zro } = ctx();
    const a = pessoa('ba'), b = pessoa('bb'), c = pessoa('bc'), v = pessoa('bv');
    const z = (p, arroba) => ({ id: p.sub, arroba, nome: p.nome, foto: null, funcoes: [], cidade: 'Natal', portfolio: null, bio: null, selos: [], perfil: 'https://absolutezro.com/pessoas/@' + arroba });
    zro.estado.comunidade = [z(a, 'zaa'), z(b, 'zbb'), z(c, 'zcc')];
    const cv = await entrar(v);
    const ordem = async () => { livre(); return (await (await pedir('/api/zro/pessoas', { cookies: cv })).json()).pessoas.map(p => p.arroba) };
    const antes = await ordem();
    const cc = await entrar(Object.assign({}, c, { recursos: [FUNDACAO, 'carro-do-freela.guilda_espaco_extra_15'] }));
    assert.equal((await G(cc, { nome: 'Os Fortes', tag: 'FRT' })).status, 201);
    const gid = (await minha(cc)).guilda.id;
    await SQL('insert into carro_do_freela.guilda_jobs (guilda_id, proposta_id, de_sub, para_sub) select $1, gen_random_uuid(), gen_random_uuid(), gen_random_uuid() from generate_series(1, 40)', [gid]);
    await G(cc, { acao: 'personalizar', paleta: 'propria', cor: '#FF0000' });
    assert.ok((await minha(cc)).nivel.atual >= 15);
    assert.deepEqual(await ordem(), antes, 'a mesma ordem com XP alto, 30 lugares e cor própria');
    zro.estado.comunidade = [];
  });

  after(() => FASES.fixarParaTeste(null));
};
