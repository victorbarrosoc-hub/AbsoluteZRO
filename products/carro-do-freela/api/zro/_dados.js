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
  return { db, sub: s.quem.sub.toLowerCase(), extra: s.extra, at: s.at };
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
  throw e;
}

/* ---------------- perfil ---------------- */

async function perfil(req, res) {
  const p = await preparar(req, res, { metodos: ['GET', 'PUT'], escrita: req.method === 'PUT' });
  if (!p) return;
  const { db, sub, extra } = p;
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
        `insert into carro_do_freela.perfis (sub, nome_exibicao, cidade, uf, funcoes, nichos, bio, portfolio_url, visibilidade)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (sub) do update set nome_exibicao = excluded.nome_exibicao, cidade = excluded.cidade, uf = excluded.uf,
           funcoes = excluded.funcoes, nichos = excluded.nichos, bio = excluded.bio, portfolio_url = excluded.portfolio_url,
           visibilidade = excluded.visibilidade
         returning *`,
        [sub, v.nome_exibicao, v.cidade, v.uf, v.funcoes, v.nichos, v.bio, v.portfolio_url, v.visibilidade],
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
  _interno: { passouDoLimite, mesmaOrigem, esquecerLimite: () => contagem.clear(), LIMITE },
};
