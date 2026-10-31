/**
 * O PERFIL E O INVENTÁRIO DO FREELA NO BANCO (28/out) — o miolo de
 * api/zro/perfil.js e api/zro/inventario.js.
 *
 *   GET  /api/zro/perfil               → { perfil | null }
 *   PUT  /api/zro/perfil               → { perfil }           (o perfil inteiro)
 *   GET  /api/zro/inventario           → { itens: [...] }
 *   POST /api/zro/inventario           → 201 { item }
 *   PATCH  /api/zro/inventario?id=<id> → { item }             (só o que veio)
 *   DELETE /api/zro/inventario?id=<id> → 204
 *   GET    /api/zro/agenda?de=&ate=    → { agenda: { "YYYY-MM-DD": {e,p,h?} } }   (a própria)
 *   PUT    /api/zro/agenda             → { dia, declaracao }  (UM dia: fechado|negociando)
 *   DELETE /api/zro/agenda?dia=        → 204                  (o dia volta a livre)
 *   GET    /api/zro/pessoas?de=&ate=   → { pessoas: [...], de, ate }  (a comunidade da Absolute ZRO + a agenda de quem consentiu)
 *
 * Cada pedido passa, nesta ordem: método → limite de pedidos (por IP) →
 * mesma origem (escrita: Origin igual ao site e Sec-Fetch-Site same-origin
 * quando o navegador manda) → JSON → sessão CONFERIDA NO HUB (a mesma do /eu:
 * portão do lançamento, claim relida, Carro no plano) → banco ligado → regras
 * (db/regras.js, estritas: telefone e campo desconhecido são recusados) →
 * banco como `carro_do_freela_app`, com o `sub` da sessão (RLS: só as linhas dela).
 * O `sub` NUNCA vem do pedido.
 *
 * Mudou o inventário: o gatilho do banco já pôs o retrato na fila. Com
 * CARRO_SYNC_ATIVO=1 (padrão: desligado) o publicador tenta mandar ao HUB
 * na hora, com o Bearer da pessoa; desligado, fica na fila (db/sync.js).
 */
const Z = require('./_zro.js');
const { banco, UUID } = require('../../db/banco.js');
const R = require('../../db/regras.js');
const SYNC = require('../../db/sync.js');

const LIMITE = { leitura: 120, escrita: 40 };
const JANELA_MS = 60 * 1000;
const contagem = new Map();

function json(res, status, corpo, extra = {}) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, extra));
  res.end(corpo === null ? '' : JSON.stringify(corpo));
}
function ipDe(req) {
  return String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || '?').trim().slice(0, 64);
}
/**
 * Limite de pedidos por IP e tipo, numa janela de 1 minuto. ⚠️ É por
 * INSTÂNCIA da função (memória), então é freio, não muro: segura o laço e o
 * clique repetido; abuso de verdade fica com o firewall da Vercel.
 */
function passouDoLimite(req, tipo, agora = Date.now()) {
  const k = tipo + ':' + ipDe(req);
  let e = contagem.get(k);
  if (!e || agora - e.t0 >= JANELA_MS) e = { t0: agora, n: 0 };
  e.n++;
  contagem.set(k, e);
  if (contagem.size > 5000) for (const [kk, v] of contagem) if (agora - v.t0 >= JANELA_MS) contagem.delete(kk);
  return e.n > LIMITE[tipo];
}
/** escrita só da própria página: Origin obrigatório e igual ao site; Sec-Fetch-Site, quando vem, same-origin */
function mesmaOrigem(req) {
  const origem = Z.origemDe(req);
  if (!origem || req.headers.origin !== origem) return false;
  const sfs = req.headers['sec-fetch-site'];
  return !sfs || sfs === 'same-origin';
}

/** o caminho comum de toda rota: devolve { db, sub, extra, at } ou já respondeu */
async function preparar(req, res, { metodos, escrita }) {
  if (!metodos.includes(req.method)) { json(res, 405, { erro: 'metodo' }, { Allow: metodos.join(', ') }); return null }
  if (passouDoLimite(req, escrita ? 'escrita' : 'leitura')) { json(res, 429, { erro: 'devagar' }, { 'Retry-After': '60' }); return null }
  if (escrita && !mesmaOrigem(req)) { json(res, 403, { erro: 'origem' }); return null }
  if (escrita && req.method !== 'DELETE' && !/^application\/json\b/.test(String(req.headers['content-type'] || ''))) { json(res, 415, { erro: 'formato' }); return null }
  const s = await Z.sessaoConferida(req);
  if (!s.quem) { json(res, s.status, s.corpo, s.headers || {}); return null }
  if (!UUID.test(s.quem.sub)) { json(res, 403, { erro: 'conta' }, s.extra); return null }
  const db = banco();
  if (!db) { json(res, 503, { erro: 'sem_banco' }, s.extra); return null }
  return { db, sub: s.quem.sub.toLowerCase(), quem: s.quem, extra: s.extra, at: s.at };
}

async function corpoDe(req, res, extra) {
  try {
    return await Z.lerCorpo(req, 16 * 1024);
  } catch (e) {
    json(res, 400, { erro: 'pedido' }, extra);
    return undefined;
  }
}

/** recusa de regra (400 com o campo) e do banco (check, RLS) viram resposta curta; o resto sobe */
function responderErro(res, e, extra) {
  if (e instanceof R.Recusa) return json(res, 400, { erro: e.erro, campo: e.campo }, extra);
  if (e && e.code === '23514') return json(res, 400, { erro: /Limite/.test(e.message) ? 'limite' : 'regra' }, extra);
  /* regras da guilda levantadas pelo banco (db/migrations/0004): o texto da exceção é o código curto */
  if (e && e.code === 'P0001' && ERROS_GUILDA[e.message]) return json(res, ERROS_GUILDA[e.message], { erro: e.message }, extra);
  if (e && e.code === '42501') return json(res, 403, { erro: 'proibido' }, extra);
  if (e && e.code === '22P02') return json(res, 400, { erro: 'pedido' }, extra);
  if (e && e.code === '22023') return json(res, 400, { erro: 'janela' }, extra);
  throw e;
}

/* ---------------- perfil ---------------- */

async function perfil(req, res) {
  const p = await preparar(req, res, { metodos: ['GET', 'PUT'], escrita: req.method === 'PUT' });
  if (!p) return;
  const { db, sub, quem, extra } = p;
  try {
    if (req.method === 'GET') {
      const l = await db.asUser(sub, async c => (await c.query('select * from carro_do_freela.perfis where sub = $1', [sub])).rows[0]);
      return json(res, 200, { perfil: R.perfilSaida(l) }, extra);
    }
    const corpo = await corpoDe(req, res, extra);
    if (corpo === undefined) return;
    const v = R.perfilDe(corpo);
    const l = await db.asUser(sub, async c =>
      (await c.query(
        `insert into carro_do_freela.perfis (sub, nome_exibicao, cidade, uf, funcoes, nichos, bio, portfolio_url, visibilidade, arroba, foto)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (sub) do update set nome_exibicao = excluded.nome_exibicao, cidade = excluded.cidade, uf = excluded.uf,
           funcoes = excluded.funcoes, nichos = excluded.nichos, bio = excluded.bio, portfolio_url = excluded.portfolio_url,
           visibilidade = excluded.visibilidade, arroba = excluded.arroba, foto = excluded.foto
         returning *`,
        /* o @ e a foto vêm da CONTA (claims relidas no HUB a cada pedido), nunca do corpo */
        [sub, v.nome_exibicao, v.cidade, v.uf, v.funcoes, v.nichos, v.bio, v.portfolio_url, v.visibilidade, quem.arroba || null, quem.foto || null],
      )).rows[0]);
    return json(res, 200, { perfil: R.perfilSaida(l) }, extra);
  } catch (e) {
    return responderErro(res, e, extra);
  }
}

/* ---------------- inventário ---------------- */

const COLUNAS = ['categoria', 'marca', 'modelo', 'quantidade', 'observacao', 'diaria_cents', 'ativo'];
function idDe(req) {
  const id = new URL(req.url, 'http://x').searchParams.get('id');
  return id && UUID.test(id) ? id.toLowerCase() : null;
}
/** depois da mudança: com a sincronização ligada, tenta publicar agora (nunca derruba a resposta) */
async function sincronizar(db, sub, at) {
  if (!SYNC.ligado()) return 'desligada';
  try {
    const r = await SYNC.publicar(db, { sub, autorizacao: at ? 'Bearer ' + at : null });
    return r.enviados ? 'enviada' : r.revisao ? 'revisao' : 'pendente';
  } catch (e) {
    return 'pendente';
  }
}

async function inventario(req, res) {
  const escrita = req.method !== 'GET';
  const p = await preparar(req, res, { metodos: ['GET', 'POST', 'PATCH', 'DELETE'], escrita });
  if (!p) return;
  const { db, sub, extra, at } = p;
  try {
    if (req.method === 'GET') {
      const rows = await db.asUser(sub, async c => (await c.query('select * from carro_do_freela.inventario order by criado_em, id')).rows);
      return json(res, 200, { itens: rows.map(R.itemSaida) }, extra);
    }
    let id = null;
    if (req.method !== 'POST') {
      id = idDe(req);
      if (!id) return json(res, 400, { erro: 'id' }, extra);
    }
    if (req.method === 'DELETE') {
      const n = await db.asUser(sub, async c => (await c.query('delete from carro_do_freela.inventario where id = $1', [id])).rowCount);
      if (!n) return json(res, 404, { erro: 'nao_achado' }, extra);
      await sincronizar(db, sub, at);
      res.writeHead(204, Object.assign({ 'Cache-Control': 'no-store' }, extra));
      return res.end();
    }
    const corpo = await corpoDe(req, res, extra);
    if (corpo === undefined) return;
    const v = R.itemDe(corpo, { novo: req.method === 'POST' });
    const cols = COLUNAS.filter(k => k in v);
    let l;
    if (req.method === 'POST') {
      l = await db.asUser(sub, async c =>
        (await c.query(
          `insert into carro_do_freela.inventario (sub, ${cols.join(', ')}) values ($1, ${cols.map((_, i) => '$' + (i + 2)).join(', ')}) returning *`,
          [sub, ...cols.map(k => v[k])],
        )).rows[0]);
    } else {
      l = await db.asUser(sub, async c =>
        (await c.query(
          `update carro_do_freela.inventario set ${cols.map((k, i) => k + ' = $' + (i + 2)).join(', ')} where id = $1 returning *`,
          [id, ...cols.map(k => v[k])],
        )).rows[0]);
      if (!l) return json(res, 404, { erro: 'nao_achado' }, extra);
    }
    const sincronizacao = await sincronizar(db, sub, at);
    return json(res, req.method === 'POST' ? 201 : 200, { item: R.itemSaida(l), sincronizacao }, extra);
  } catch (e) {
    return responderErro(res, e, extra);
  }
}

/* ---------------- agenda ---------------- */

async function agenda(req, res) {
  const p = await preparar(req, res, { metodos: ['GET', 'PUT', 'DELETE'], escrita: req.method !== 'GET' });
  if (!p) return;
  const { db, sub, extra } = p;
  try {
    const q = new URL(req.url, 'http://x').searchParams;
    if (req.method === 'GET') {
      const j = R.janelaDe(q.get('de'), q.get('ate'));
      const rows = await db.asUser(sub, async c =>
        (await c.query("select to_char(dia, 'YYYY-MM-DD') as dia, estado, parte, hora from carro_do_freela.agenda_dias where dia between $1 and $2 order by dia", [j.de, j.ate])).rows);
      const agenda = {};
      for (const l of rows) agenda[l.dia] = R.agendaSaida(l);
      return json(res, 200, { agenda, de: j.de, ate: j.ate }, extra);
    }
    if (req.method === 'DELETE') {
      const dia = R.diaDe(q.get('dia'));
      await db.asUser(sub, async c => c.query('delete from carro_do_freela.agenda_dias where dia = $1', [dia]));
      res.writeHead(204, Object.assign({ 'Cache-Control': 'no-store' }, extra));
      return res.end();
    }
    const corpo = await corpoDe(req, res, extra);
    if (corpo === undefined) return;
    const v = R.agendaDe(corpo);
    const l = await db.asUser(sub, async c =>
      (await c.query(
        `insert into carro_do_freela.agenda_dias (sub, dia, estado, parte, hora) values ($1, $2, $3, $4, $5)
         on conflict (sub, dia) do update set estado = excluded.estado, parte = excluded.parte, hora = excluded.hora
         returning estado, parte, hora`,
        [sub, v.dia, v.estado, v.parte, v.hora],
      )).rows[0]);
    return json(res, 200, { dia: v.dia, declaracao: R.agendaSaida(l) }, extra);
  } catch (e) {
    return responderErro(res, e, extra);
  }
}

/* ---------------- quem está no Carro ---------------- */

/**
 * Ver a agenda de quem está no Carro. ⚠️ É AQUI que mora a tranca do plano quando ela vier ("só quem paga sabe quem
 * está livre"): hoje o Carro está fechado (só as contas liberadas no portão entram) e o preço ainda não foi decidido,
 * então toda conta que passou do portão vê. Decidido o plano, esta função lê o direito da sessão (zro_products /
 * entitlements do HUB) e, sem ele, a lista sai SEM a agenda (as pessoas continuam achadas pelo nome, de graça).
 */
function podeVerAgendas(/* quem */) {
  return true;
}

/* as funções do perfil da Absolute ZRO (chaves do HUB) no catálogo do Carro, para a busca por função funcionar com
   quem ainda não descreveu o ofício aqui; quem descreveu (e consentiu) aparece com as funções do Carro */
const FUNCAO_DO_HUB = {
  camera: 'Op. de câmera', edicao: 'Editor', color: 'Colorista', drone: 'Op. de drone', fotografia: 'Fotógrafo',
  direcao: 'Direção', producao: 'Produtor', motion: 'Motion / VFX',
};
const PAGINAS_MAX = 10;

/** a comunidade inteira no HUB (páginas de 200, até 2000), com o token da pessoa (escopo zro.pessoas) */
async function comunidade(at) {
  const cfg = Z.config();
  const lista = [];
  let depois = null;
  for (let i = 0; i < PAGINAS_MAX; i++) {
    const u = new URL(cfg.issuer + '/api/v1/pessoas');
    u.searchParams.set('limite', '200');
    if (depois) u.searchParams.set('depois', depois);
    const r = await fetch(u, { headers: { authorization: 'Bearer ' + at, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (r.status === 401 || r.status === 403) return { recusado: true };
    if (!r.ok) throw new Error('hub ' + r.status);
    const corpo = await r.json();
    for (const x of Array.isArray(corpo.pessoas) ? corpo.pessoas : []) lista.push(x);
    if (!corpo.proximo) break;
    depois = String(corpo.proximo);
  }
  return { lista };
}

async function pessoas(req, res) {
  const p = await preparar(req, res, { metodos: ['GET'], escrita: false });
  if (!p) return;
  const { db, sub, quem, extra, at } = p;
  try {
    const q = new URL(req.url, 'http://x').searchParams;
    const j = R.janelaDe(q.get('de'), q.get('ate'));
    let c;
    try {
      c = at ? await comunidade(at) : { recusado: true };
    } catch (e) {
      return json(res, 503, { erro: 'hub' }, extra);
    }
    /* o token desta sessão não tem zro.pessoas (login de antes): a lista pede entrar de novo, nada quebra */
    if (c.recusado) return json(res, 200, { pessoas: [], de: j.de, ate: j.ate, agendas: false, reconectar: true }, extra);
    const subs = c.lista.map(x => String(x.id || '').toLowerCase()).filter(x => UUID.test(x));
    const rows = subs.length
      ? await db.asUser(sub, async cx => (await cx.query('select * from carro_do_freela.agendas($1::uuid[], $2, $3)', [subs, j.de, j.ate])).rows)
      : [];
    const doCarro = new Map(rows.map(l => [String(l.sub), l]));
    const ver = podeVerAgendas(quem);
    const lista = c.lista.map(x => R.pessoaSaida(x, doCarro.get(String(x.id).toLowerCase()), FUNCAO_DO_HUB)).filter(Boolean)
      .map(x => (ver || x.id === sub ? x : Object.assign(x, { agenda: null })));
    return json(res, 200, { pessoas: lista, de: j.de, ate: j.ate, agendas: ver }, extra);
  } catch (e) {
    return responderErro(res, e, extra);
  }
}

/* ---------------- propostas, feed, brechó e denúncia (0003) ----------------
 * GET    /api/zro/propostas              → { recebidas: [...], enviadas: [...] }   (as minhas, dos dois lados)
 * POST   /api/zro/propostas              → 201 { proposta }   (chega na caixa de `para`, dentro do Carro)
 * PATCH  /api/zro/propostas?id=          → { proposta }       (aceitar/recusar quem recebeu; cancelar quem mandou)
 * GET    /api/zro/feed                   → { posts: [...] }   (os 100 mais novos, sem os que EU denunciei)
 * POST   /api/zro/feed                   → 201 { post }
 * DELETE /api/zro/feed?id=               → 204                (só o próprio)
 * GET    /api/zro/brecho                 → { anuncios: [...] } (disponíveis + os meus)
 * POST   /api/zro/brecho                 → 201 { anuncio }
 * PATCH  /api/zro/brecho?id=             → { anuncio }        (vendido/disponível, só o próprio)
 * DELETE /api/zro/brecho?id=             → 204                (só o próprio)
 * POST   /api/zro/denuncia               → 204                (guardada; ninguém de fora lê)
 * O nome de quem escreve vem da CONTA (sessão conferida no HUB), nunca do pedido. */
function nomeDaConta(quem) {
  const n = String((quem && quem.nome) || '').trim().slice(0, 80);
  return n && !R.TELEFONE.test(n) ? n : quem && quem.arroba ? '@' + quem.arroba : 'Conta Absolute ZRO';
}
const iso = d => (d instanceof Date ? d.toISOString() : d);
const diaTxt = d => (d instanceof Date ? d.toISOString().slice(0, 10) : d || null);
const horaTxt = h => (h ? String(h).slice(0, 5) : null);
function propostaSaida(l, sub) {
  return { id: l.id, recebida: l.para_sub === sub, de: l.de_sub, para: l.para_sub, de_nome: l.de_nome, tipo: l.tipo,
    anuncio: l.anuncio_id, dia: diaTxt(l.dia), ini: horaTxt(l.ini), fim: horaTxt(l.fim), funcao: l.funcao, local: l.local,
    mensagem: l.mensagem, valor_cents: l.valor_cents, estado: l.estado, motivo: l.motivo, criado_em: iso(l.criado_em) };
}
const postSaida = (l, sub) => ({ id: l.id, autor: { sub: l.sub, nome: l.autor_nome }, eu: l.sub === sub, tipo: l.tipo,
  texto: l.texto, criado_em: iso(l.criado_em) });
const anuncioSaida = (l, sub) => ({ id: l.id, dono: { sub: l.sub, nome: l.dono_nome }, eu: l.sub === sub, titulo: l.titulo,
  categoria: l.categoria, estado_item: l.estado_item, descricao: l.descricao, cidade: l.cidade, preco_cents: l.preco_cents,
  situacao: l.situacao, criado_em: iso(l.criado_em) });
function semConteudo(res, extra) {
  res.writeHead(204, Object.assign({ 'Cache-Control': 'no-store' }, extra));
  return res.end();
}

async function propostas(req, res) {
  const p = await preparar(req, res, { metodos: ['GET', 'POST', 'PATCH'], escrita: req.method !== 'GET' });
  if (!p) return;
  const { db, sub, quem, extra } = p;
  try {
    if (req.method === 'GET') {
      const rows = await db.asUser(sub, async c =>
        (await c.query('select * from carro_do_freela.propostas order by criado_em desc limit 300')).rows);
      const todas = rows.map(l => propostaSaida(l, sub));
      return json(res, 200, { recebidas: todas.filter(x => x.recebida), enviadas: todas.filter(x => !x.recebida) }, extra);
    }
    const corpo = await corpoDe(req, res, extra);
    if (corpo === undefined) return;
    if (req.method === 'POST') {
      const v = R.propostaDe(corpo);
      if (v.para === sub) return json(res, 400, { erro: 'para', campo: 'para' }, extra);
      const l = await db.asUser(sub, async c => {
        if (v.tipo === 'brecho') {
          const an = (await c.query("select sub from carro_do_freela.anuncios where id = $1 and situacao = 'disponivel'", [v.anuncio])).rows[0];
          if (!an || an.sub !== v.para) return null;
        }
        return (await c.query(
          `insert into carro_do_freela.propostas (de_sub, para_sub, de_nome, tipo, anuncio_id, dia, ini, fim, funcao, local, mensagem, valor_cents)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning *`,
          [sub, v.para, nomeDaConta(quem), v.tipo, v.anuncio, v.dia, v.ini, v.fim, v.funcao, v.local, v.mensagem, v.valor_cents],
        )).rows[0];
      });
      if (!l) return json(res, 404, { erro: 'nao_achado' }, extra);
      return json(res, 201, { proposta: propostaSaida(l, sub) }, extra);
    }
    const id = idDe(req);
    if (!id) return json(res, 400, { erro: 'id' }, extra);
    const v = R.respostaDe(corpo);
    const l = await db.asUser(sub, async c =>
      (await c.query('update carro_do_freela.propostas set estado = $2, motivo = coalesce($3, motivo) where id = $1 returning *', [id, v.estado, v.motivo])).rows[0]);
    if (!l) return json(res, 404, { erro: 'nao_achado' }, extra);
    return json(res, 200, { proposta: propostaSaida(l, sub) }, extra);
  } catch (e) {
    return responderErro(res, e, extra);
  }
}

async function feed(req, res) {
  const p = await preparar(req, res, { metodos: ['GET', 'POST', 'DELETE'], escrita: req.method !== 'GET' });
  if (!p) return;
  const { db, sub, quem, extra } = p;
  try {
    if (req.method === 'GET') {
      const rows = await db.asUser(sub, async c =>
        (await c.query(
          `select p.* from carro_do_freela.posts p
            where not exists (select 1 from carro_do_freela.denuncias d where d.alvo = 'post' and d.alvo_id = p.id)
            order by p.criado_em desc limit 100`)).rows);
      return json(res, 200, { posts: rows.map(l => postSaida(l, sub)) }, extra);
    }
    if (req.method === 'DELETE') {
      const id = idDe(req);
      if (!id) return json(res, 400, { erro: 'id' }, extra);
      const n = await db.asUser(sub, async c => (await c.query('delete from carro_do_freela.posts where id = $1', [id])).rowCount);
      if (!n) return json(res, 404, { erro: 'nao_achado' }, extra);
      return semConteudo(res, extra);
    }
    const corpo = await corpoDe(req, res, extra);
    if (corpo === undefined) return;
    const v = R.postDe(corpo);
    const l = await db.asUser(sub, async c =>
      (await c.query('insert into carro_do_freela.posts (sub, autor_nome, tipo, texto) values ($1, $2, $3, $4) returning *',
        [sub, nomeDaConta(quem), v.tipo, v.texto])).rows[0]);
    return json(res, 201, { post: postSaida(l, sub) }, extra);
  } catch (e) {
    return responderErro(res, e, extra);
  }
}

async function brecho(req, res) {
  const p = await preparar(req, res, { metodos: ['GET', 'POST', 'PATCH', 'DELETE'], escrita: req.method !== 'GET' });
  if (!p) return;
  const { db, sub, quem, extra } = p;
  try {
    if (req.method === 'GET') {
      const rows = await db.asUser(sub, async c =>
        (await c.query(
          `select a.* from carro_do_freela.anuncios a
            where not exists (select 1 from carro_do_freela.denuncias d where d.alvo = 'anuncio' and d.alvo_id = a.id)
            order by a.criado_em desc limit 300`)).rows);
      return json(res, 200, { anuncios: rows.map(l => anuncioSaida(l, sub)) }, extra);
    }
    let id = null;
    if (req.method !== 'POST') {
      id = idDe(req);
      if (!id) return json(res, 400, { erro: 'id' }, extra);
    }
    if (req.method === 'DELETE') {
      const n = await db.asUser(sub, async c => (await c.query('delete from carro_do_freela.anuncios where id = $1', [id])).rowCount);
      if (!n) return json(res, 404, { erro: 'nao_achado' }, extra);
      return semConteudo(res, extra);
    }
    const corpo = await corpoDe(req, res, extra);
    if (corpo === undefined) return;
    if (req.method === 'PATCH') {
      const situacao = R.situacaoDe(corpo);
      const l = await db.asUser(sub, async c =>
        (await c.query('update carro_do_freela.anuncios set situacao = $2 where id = $1 returning *', [id, situacao])).rows[0]);
      if (!l) return json(res, 404, { erro: 'nao_achado' }, extra);
      return json(res, 200, { anuncio: anuncioSaida(l, sub) }, extra);
    }
    const v = R.anuncioDe(corpo);
    const l = await db.asUser(sub, async c =>
      (await c.query(
        `insert into carro_do_freela.anuncios (sub, dono_nome, titulo, categoria, estado_item, descricao, cidade, preco_cents)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
        [sub, nomeDaConta(quem), v.titulo, v.categoria, v.estado_item, v.descricao, v.cidade, v.preco_cents])).rows[0]);
    return json(res, 201, { anuncio: anuncioSaida(l, sub) }, extra);
  } catch (e) {
    return responderErro(res, e, extra);
  }
}

async function denuncia(req, res) {
  const p = await preparar(req, res, { metodos: ['POST'], escrita: true });
  if (!p) return;
  const { db, sub, extra } = p;
  try {
    const corpo = await corpoDe(req, res, extra);
    if (corpo === undefined) return;
    const v = R.denunciaDe(corpo);
    await db.asUser(sub, async c =>
      c.query(
        `insert into carro_do_freela.denuncias (sub, alvo, alvo_id, motivo, detalhe) values ($1, $2, $3, $4, $5)
         on conflict (sub, alvo, alvo_id) do nothing`, [sub, v.alvo, v.id, v.motivo, v.detalhe]));
    return semConteudo(res, extra);
  } catch (e) {
    return responderErro(res, e, extra);
  }
}

/* ---------------- guilda (0004, fase 2) ----------------
 * GET  /api/zro/guildas                → { fase, minha: {...}|null, recebidos: [...], carencia_ate }
 * POST /api/zro/guildas                → 201 { guilda }            (acao "criar", o padrão)
 * POST /api/zro/guildas {acao:"convidar", para?}  → 201 { convite, link? }  (sem `para` = convite por link)
 * POST ... {acao:"ver", token} · {acao:"aceitar", id|token} · {acao:"recusar", id, bloquear?}
 *      · {acao:"cancelar", id} · {acao:"sair"} · {acao:"remover", sub}
 * ⚠️ O portão é db/fase.js: com a fase 1 a rota responde 404, antes de qualquer outra coisa.
 * Nome, @ e foto de quem entra vêm da CONTA (sessão conferida), nunca do pedido. Vagas, bloqueio, carência e convite
 * vencido são conferidos no banco. O adicional "Espaço extra na guilda" é lido da claim do DONO e gravado na guilda. */
const FASES = require('../../db/fase.js');
const crypto = require('crypto');
const ERROS_GUILDA = { ja_em_guilda: 409, carencia: 409, nome_em_uso: 409, cheia: 409, ja_membro: 409, ja_convidado: 409, limite_convites: 429,
  bloqueado: 403, so_dono: 403, dono_nao_sai: 409, convite_invalido: 404, convite_expirado: 410, sem_guilda: 404, nao_achado: 404 };
const EXTRA_POR_ADICIONAL = 5;
const SINAL_EXTRA = 'carro-do-freela.guilda_espaco_extra';
const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');
/** vagas extras que a conta tem: o sinal do adicional na claim (o HUB só diz "tem", sem quantidade: um pacote de 5) */
const extraDaConta = quem => (quem && Array.isArray(quem.recursos) && quem.recursos.includes(SINAL_EXTRA) ? EXTRA_POR_ADICIONAL : 0);

async function guildaMinha(c, sub) {
  const m = (await c.query(
    `select g.*, carro_do_freela.guilda_nivel(g.id) as nivel, carro_do_freela.guilda_vagas(g.id) as vagas,
            carro_do_freela.guilda_ocupadas(g.id) as ocupadas
       from carro_do_freela.guildas g where g.encerrada_em is null`)).rows[0];
  if (!m) return null;
  const membros = (await c.query('select sub, nome, arroba, foto, papel, entrou_em from carro_do_freela.guilda_membros where guilda_id = $1 and saiu_em is null order by papel, entrou_em', [m.id])).rows;
  const jobs = (await c.query('select * from carro_do_freela.guilda_jobs where guilda_id = $1 order by fechado_em desc', [m.id])).rows;
  const beneficios = (await c.query('select nivel, codigo, titulo, detalhe, dados, ativo from carro_do_freela.guilda_beneficios order by nivel')).rows;
  const dono = m.dono_sub === sub;
  const convites = dono
    ? (await c.query("select id, para_sub, expira_em from carro_do_freela.guilda_convites where guilda_id = $1 and estado = 'pendente' and expira_em > clock_timestamp() order by criado_em desc", [m.id])).rows
    : [];
  const bonus = Number(m.vagas) - 15 - m.espaco_extra;
  return {
    guilda: { id: m.id, nome: m.nome, tag: m.tag, cor: m.cor, sobre: m.sobre, criada_em: iso(m.criado_em) },
    eu: { sub, papel: dono ? 'dono' : 'membro' },
    membros: membros.map(x => ({ sub: x.sub, nome: x.nome, arroba: x.arroba, foto: x.foto, papel: x.papel, eu: x.sub === sub, entrou_em: iso(x.entrou_em) })),
    nivel: { atual: m.nivel, jobs: jobs.length, por_nivel: 3, faltam: 3 - (jobs.length % 3) },
    vagas: { base: 15, bonus_de_nivel: bonus, extra: m.espaco_extra, total: Number(m.vagas), ocupadas: Number(m.ocupadas), livres: Math.max(0, Number(m.vagas) - Number(m.ocupadas)) },
    beneficios: beneficios.map(b => ({ nivel: b.nivel, codigo: b.codigo, titulo: b.titulo, detalhe: b.detalhe, dados: b.dados, ativo: b.ativo, conquistado: m.nivel >= b.nivel })),
    jobs: jobs.slice(0, 30).map(j => ({ id: j.id, dia: diaTxt(j.dia), funcao: j.funcao, membros: [j.de_nome, j.para_nome].filter(Boolean), fechado_em: iso(j.fechado_em) })),
    convites: convites.map(v => ({ id: v.id, tipo: v.para_sub ? 'arroba' : 'link', para: v.para_sub, expira_em: iso(v.expira_em) })),
  };
}

async function guildas(req, res) {
  if (!FASES.guildaNoAr()) return json(res, 404, { erro: 'nao_encontrado' });
  const p = await preparar(req, res, { metodos: ['GET', 'POST'], escrita: req.method === 'POST' });
  if (!p) return;
  const { db, sub, quem, extra } = p;
  const nome = nomeDaConta(quem), arroba = quem.arroba || null, foto = quem.foto || null;
  try {
    if (req.method === 'GET') {
      const r = await db.asUser(sub, async c => {
        await c.query('select carro_do_freela.guilda_tocar($1, $2, $3)', [nome, arroba, foto]);
        await c.query('select carro_do_freela.guilda_definir_extra($1)', [extraDaConta(quem)]);
        const minha = await guildaMinha(c, sub);
        const recebidos = (await c.query('select * from carro_do_freela.guilda_convites_para_mim()')).rows;
        const sai = (await c.query("select max(saiu_em) as t from carro_do_freela.guilda_membros where sub = $1 and saida = 'saiu'", [sub])).rows[0].t;
        return { minha, recebidos, sai };
      });
      const ate = r.sai ? new Date(r.sai.getTime() + 7 * 864e5) : null;
      return json(res, 200, {
        fase: FASES.faseAtual(), minha: r.minha,
        recebidos: r.recebidos.map(x => ({ id: x.id, nome: x.nome, tag: x.tag, cor: x.cor, de_nome: x.de_nome, expira_em: iso(x.expira_em) })),
        carencia_ate: ate && ate > new Date() ? ate.toISOString() : null,
      }, extra);
    }
    const corpo = await corpoDe(req, res, extra);
    if (corpo === undefined) return;
    const acao = corpo && corpo.acao !== undefined ? corpo.acao : 'criar';
    if (acao === 'criar') {
      const v = R.guildaDe(corpo);
      const g = await db.asUser(sub, async c => {
        const id = (await c.query('select carro_do_freela.guilda_criar($1, $2, $3, $4, $5, $6, $7) as id', [v.nome, v.tag, v.cor, v.sobre, nome, arroba, foto])).rows[0].id;
        await c.query('select carro_do_freela.guilda_definir_extra($1)', [extraDaConta(quem)]);
        return id;
      });
      return json(res, 201, { guilda: { id: g } }, extra);
    }
    if (acao === 'convidar') {
      const v = R.conviteDe(corpo);
      const token = v.para ? null : crypto.randomBytes(24).toString('base64url');
      const id = await db.asUser(sub, async c => {
        const g = (await c.query('select id from carro_do_freela.guildas where dono_sub = $1 and encerrada_em is null', [sub])).rows[0];
        if (!g) { const e = new Error('so_dono'); e.code = 'P0001'; throw e }
        await c.query('select carro_do_freela.guilda_definir_extra($1)', [extraDaConta(quem)]);
        return (await c.query('select carro_do_freela.guilda_convidar($1, $2, $3) as id', [g.id, v.para, token && hashToken(token)])).rows[0].id;
      });
      return json(res, 201, { convite: { id, tipo: v.para ? 'arroba' : 'link' }, link: token ? Z.origemDe(req) + '/?guilda=' + token : undefined }, extra);
    }
    if (acao === 'ver') {
      const t = R.verConviteDe(corpo);
      const l = (await db.asUser(sub, async c => (await c.query('select * from carro_do_freela.guilda_ver_convite($1)', [hashToken(t)])).rows))[0];
      if (!l) return json(res, 404, { erro: 'convite_invalido' }, extra);
      return json(res, 200, { guilda: { nome: l.nome, tag: l.tag, cor: l.cor, ocupadas: l.ocupadas, vagas: l.vagas, expira_em: iso(l.expira_em) } }, extra);
    }
    if (acao === 'aceitar') {
      const v = R.aceitarDe(corpo);
      const id = await db.asUser(sub, async c =>
        (await c.query('select carro_do_freela.guilda_aceitar($1, $2, $3, $4, $5) as id', [v.id, v.token && hashToken(v.token), nome, arroba, foto])).rows[0].id);
      return json(res, 200, { guilda: { id } }, extra);
    }
    if (acao === 'recusar') {
      const v = R.recusarDe(corpo);
      await db.asUser(sub, async c => c.query('select carro_do_freela.guilda_recusar($1, $2)', [v.id, v.bloquear]));
      return semConteudo(res, extra);
    }
    if (acao === 'cancelar') {
      const id = R.idConviteDe(corpo);
      await db.asUser(sub, async c => c.query('select carro_do_freela.guilda_cancelar_convite($1)', [id]));
      return semConteudo(res, extra);
    }
    if (acao === 'sair') {
      R.guildaSemCampos(corpo);
      await db.asUser(sub, async c => c.query('select carro_do_freela.guilda_sair()'));
      return semConteudo(res, extra);
    }
    if (acao === 'remover') {
      const alvo = R.removerDe(corpo);
      await db.asUser(sub, async c => c.query('select carro_do_freela.guilda_remover($1)', [alvo]));
      return semConteudo(res, extra);
    }
    return json(res, 400, { erro: 'acao' }, extra);
  } catch (e) {
    return responderErro(res, e, extra);
  }
}

const protegido = fn => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (!res.headersSent) json(res, 500, { erro: 'interno' });
    else res.end();
  }
};

module.exports = {
  perfil: protegido(perfil),
  inventario: protegido(inventario),
  agenda: protegido(agenda),
  pessoas: protegido(pessoas),
  propostas: protegido(propostas),
  feed: protegido(feed),
  brecho: protegido(brecho),
  denuncia: protegido(denuncia),
  guildas: protegido(guildas),
  _interno: { passouDoLimite, mesmaOrigem, esquecerLimite: () => contagem.clear(), LIMITE },
};
