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
  _interno: { passouDoLimite, mesmaOrigem, esquecerLimite: () => contagem.clear(), LIMITE },
};
