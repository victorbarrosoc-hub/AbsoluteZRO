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

/* `chat` é o freio da Sede: o poll e o "digitando" moram nele, sem tirar a vez das outras escritas */
const LIMITE = { leitura: 120, escrita: 40, chat: 150 };
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
async function preparar(req, res, { metodos, escrita, freio, formato }) {
  if (!metodos.includes(req.method)) { json(res, 405, { erro: 'metodo' }, { Allow: metodos.join(', ') }); return null }
  if (passouDoLimite(req, freio || (escrita ? 'escrita' : 'leitura'))) { json(res, 429, { erro: 'devagar' }, { 'Retry-After': '60' }); return null }
  if (escrita && !mesmaOrigem(req)) { json(res, 403, { erro: 'origem' }); return null }
  if (escrita && req.method !== 'DELETE' && !(formato || /^application\/json\b/).test(String(req.headers['content-type'] || ''))) { json(res, 415, { erro: 'formato' }); return null }
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
function propostaSaida(l, sub, missoes) {
  const o = { id: l.id, recebida: l.para_sub === sub, de: l.de_sub, para: l.para_sub, de_nome: l.de_nome, tipo: l.tipo,
    anuncio: l.anuncio_id, dia: diaTxt(l.dia), ini: horaTxt(l.ini), fim: horaTxt(l.fim), funcao: l.funcao, local: l.local,
    mensagem: l.mensagem, valor_cents: l.valor_cents, estado: l.estado, motivo: l.motivo, criado_em: iso(l.criado_em) };
  /* a marca da guilda (0006): só existe na proposta que nasceu de uma missão da Sede; sem ela a saída é a de sempre */
  if (l.missao_id) {
    const m = missoes && missoes.get(l.missao_id);
    o.guilda = m ? { missao: l.missao_id, titulo: m.titulo, nome: m.nome, tag: m.tag, equipe: m.equipe } : { missao: l.missao_id };
  }
  return o;
}
/** o mínimo da missão para a caixa de Propostas: título, a guilda e o tamanho da equipe (RLS: só quem é da guilda lê) */
async function missoesDasPropostas(c, rows) {
  const ids = [...new Set(rows.map(l => l.missao_id).filter(Boolean))];
  if (!ids.length) return new Map();
  const r = (await c.query(
    `select m.id, m.titulo, g.nome, g.tag,
            (select count(*)::int from carro_do_freela.guilda_missao_vagas v where v.missao_id = m.id and v.estado <> 'trocada') + 1 as equipe
       from carro_do_freela.guilda_missoes m join carro_do_freela.guildas g on g.id = m.guilda_id where m.id = any($1::uuid[])`, [ids])).rows;
  return new Map(r.map(x => [x.id, x]));
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
      const { rows, missoes } = await db.asUser(sub, async c => {
        const rows = (await c.query('select * from carro_do_freela.propostas order by criado_em desc limit 300')).rows;
        return { rows, missoes: FASES.guildaNoAr() ? await missoesDasPropostas(c, rows) : new Map() };
      });
      const todas = rows.map(l => propostaSaida(l, sub, missoes));
      return json(res, 200, { recebidas: todas.filter(x => x.recebida), enviadas: todas.filter(x => !x.recebida) }, extra);
    }
    const corpo = await corpoDe(req, res, extra);
    if (corpo === undefined) return;
    if (req.method === 'POST') {
      const v = R.propostaDe(corpo);
      if (v.para === sub) return json(res, 400, { erro: 'para', campo: 'para' }, extra);
      /* a marca da guilda só existe com a fase 2 (db/fase.js): antes disso é um campo que não existe */
      if (v.missao && !FASES.guildaNoAr()) return json(res, 400, { erro: 'campo', campo: 'missao' }, extra);
      const l = await db.asUser(sub, async c => {
        if (v.tipo === 'brecho') {
          const an = (await c.query("select sub from carro_do_freela.anuncios where id = $1 and situacao = 'disponivel'", [v.anuncio])).rows[0];
          if (!an || an.sub !== v.para) return null;
        }
        return (await c.query(
          `insert into carro_do_freela.propostas (de_sub, para_sub, de_nome, tipo, anuncio_id, dia, ini, fim, funcao, local, mensagem, valor_cents, missao_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning *`,
          [sub, v.para, nomeDaConta(quem), v.tipo, v.anuncio, v.dia, v.ini, v.fim, v.funcao, v.local, v.mensagem, v.valor_cents, v.missao],
        )).rows[0];
      });
      if (!l) return json(res, 404, { erro: 'nao_achado' }, extra);
      return json(res, 201, { proposta: propostaSaida(l, sub, null) }, extra);
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

/* ---------------- guilda (0004 + a Sede da 0005, fase 2) ----------------
 * GET  /api/zro/guildas                → { fase, pode_fundar, pedir_url, pacotes, minha: {...}|null, recebidos: [...], carencia_ate }
 *      (minha = o painel da Sede: guilda com cores e logo, nível e XP, placa, lugares, memória em pôsteres, quem está
 *      na sede agora e o resumo do chat; só para quem é da guilda — RLS)
 * POST /api/zro/guildas                → 201 { guilda }            (acao "criar", o padrão; pede a FUNDAÇÃO na conta)
 * POST /api/zro/guildas {acao:"convidar", para?}  → 201 { convite, link? }  (sem `para` = convite por link)
 * POST ... {acao:"ver", token} · {acao:"aceitar", id|token} · {acao:"recusar", id, bloquear?}
 *      · {acao:"cancelar", id} · {acao:"sair"} · {acao:"remover", sub} · {acao:"personalizar", paleta, cor?, sobre?, praca?}
 * ⚠️ O portão é db/fase.js: com a fase 1 a rota responde 404, antes de qualquer outra coisa.
 * Nome, @ e foto de quem entra vêm da CONTA (sessão conferida), nunca do pedido. Vagas, bloqueio, carência e convite
 * vencido são conferidos no banco. Os adicionais (fundação, +5 e +15 lugares) são lidos da claim `zro_features` do DONO:
 * o HUB guarda os planos em RASCUNHO (infra/migrations/0043 e 0044), então ninguém os compra ainda; a tela leva o pedido
 * ao fluxo de pedido de plano do HUB (/perfil/plano), sem cobrança nenhuma aqui. */
const FASES = require('../../db/fase.js');
const crypto = require('crypto');
const ERROS_GUILDA = { ja_em_guilda: 409, carencia: 409, nome_em_uso: 409, cheia: 409, ja_membro: 409, ja_convidado: 409, limite_convites: 429,
  bloqueado: 403, so_dono: 403, dono_nao_sai: 409, convite_invalido: 404, convite_expirado: 410, sem_guilda: 404, nao_achado: 404,
  /* a Sede (0005) */
  devagar: 429, pedido: 400, chamada: 400, chamada_passou: 409, chamada_futura: 409, limite_fixados: 409, so_quem_fez: 403,
  limite_canais: 409, cota: 413,
  /* o quadro de missões (0006) */
  missao: 409, missao_dia: 409, equipe: 400, dia: 400 };
/* os sinais dos adicionais na claim: presença, não quantidade (o HUB não guarda quantos). Cada pacote é UM sinal. */
const SINAL_FUNDACAO = 'carro-do-freela.guilda_fundacao';
const PACOTES = { 'carro-do-freela.guilda_espaco_extra': 5, 'carro-do-freela.guilda_espaco_extra_15': 15 };
const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');
const sinais = quem => (quem && Array.isArray(quem.recursos) ? quem.recursos : []);
/** vagas extras que a conta tem: a soma dos pacotes presentes na claim (+5 e +15) */
const extraDaConta = quem => sinais(quem).reduce((n, s) => n + (PACOTES[s] || 0), 0);
const podeFundar = quem => sinais(quem).includes(SINAL_FUNDACAO);
const XP_NIVEL = 400, XP_JOB = 120;
const LOGO_URL = l => '/api/zro/sede-imagem?id=' + l.id + '&sha=' + l.sha256;
const semanaDe = d => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10) };

/** os jobs da memória agrupados como a guilda os viveu: o mesmo contratante no mesmo dia é UM job (um pôster) */
function cartazes(jobs, membrosAgora, sub) {
  const ativos = new Set(membrosAgora.map(m => m.sub));
  const grupos = new Map();
  for (const j of jobs) {
    const k = j.de_sub + ':' + (diaTxt(j.dia) || 'sem-dia');
    if (!grupos.has(k)) grupos.set(k, { id: j.id, dia: diaTxt(j.dia), titulo: null, tipo: null, local: null, de: j.de_sub,
      contratante: j.de_nome || null, de_fora: !j.de_nome, creditos: [], fechado_em: iso(j.fechado_em), eu: false });
    const g = grupos.get(k);
    g.titulo = g.titulo || j.titulo || null; g.tipo = g.tipo || j.tipo || null; g.local = g.local || j.local || null;
    if (j.de_nome && !g.contratante) { g.contratante = j.de_nome; g.de_fora = false }
    g.creditos.push({ funcao: j.funcao || 'Equipe', nome: j.para_nome || null, de_fora: !j.para_nome, saiu: !!j.para_nome && !ativos.has(j.para_sub) });
    if (j.de_sub === sub || j.para_sub === sub) g.eu = true;
  }
  const hoje = new Date().toISOString().slice(0, 10);
  const todos = [...grupos.values()].map(g => { const x = Object.assign({}, g, { vem: !!g.dia && g.dia > hoje }); delete x.de; return x });
  /* o que ainda vai rodar primeiro (o mais perto antes), depois o que já rodou (o mais novo antes) */
  return todos.filter(g => g.vem).sort((a, b) => a.dia.localeCompare(b.dia))
    .concat(todos.filter(g => !g.vem).sort((a, b) => String(b.dia || b.fechado_em).localeCompare(String(a.dia || a.fechado_em))));
}

/** a placa: sequência de semanas com job fechado, credenciais (todas de dado real) e o que a semana pede */
function placa(m, jobs, extras) {
  const semanas = new Set(jobs.map(j => semanaDe(j.fechado_em)));
  const agora = Date.now();
  const doze = [];
  for (let i = 11; i >= 0; i--) doze.push(semanas.has(semanaDe(agora - i * 7 * 864e5)));
  /* a sequência não quebra no meio da semana: se esta ainda não tem job, conta a partir da passada */
  let seq = 0;
  for (let i = doze[11] ? 11 : 10; i >= 0 && doze[i]; i--) seq++;
  const grupos = new Set(jobs.map(j => j.de_sub + ':' + diaTxt(j.dia))).size;
  const dias = Math.floor((agora - new Date(m.criado_em).getTime()) / 864e5);
  const cred = (codigo, titulo, detalhe, ico, n, meta) => ({ codigo, titulo, detalhe, ico, n: Math.min(n, meta), meta, ok: n >= meta });
  const credenciais = [
    cred('primeiro', 'Primeiro job', 'o primeiro job fechado', 'estrela', grupos, 1),
    cred('dez', '10 juntos', '10 jobs na memória', 'livro', grupos, 10),
    cred('cliente', 'Cliente de volta', 'contratante de fora voltou', 'aperto', extras.volta, 1),
    cred('madrugada', 'Madrugada', '3 chamadas antes das 6h', 'relogio', extras.madrugada, 3),
    cred('equipe', 'Equipe completa', '6 da guilda num call sheet', 'equipe', extras.equipe, 6),
    cred('sequencia', 'Sem parar', '4 semanas seguidas', 'fogo', seq, 4),
    cred('cinquenta', '50 juntos', '50 jobs na memória', 'livro', grupos, 50),
    cred('ano', 'Ano um', 'um ano de sede', 'escudo', dias, 365),
  ];
  const semana = [
    { t: 'Fechar um job', n: Math.min(extras.semana.jobs, 1), meta: 1 },
    { t: 'Presença num call sheet', n: Math.min(extras.semana.presencas, 1), meta: 1 },
    { t: 'Uma vitória no quadro', n: Math.min(extras.semana.vitorias, 1), meta: 1 },
  ];
  return { sequencia: seq, semanas: doze, credenciais, semana, temporada: extras.temporada };
}

async function guildaMinha(c, sub) {
  const m = (await c.query(
    `select g.*, carro_do_freela.guilda_nivel(g.id) as nivel, carro_do_freela.guilda_vagas(g.id) as vagas,
            carro_do_freela.guilda_ocupadas(g.id) as ocupadas, carro_do_freela.guilda_xp_total(g.id) as xp
       from carro_do_freela.guildas g where g.encerrada_em is null`)).rows[0];
  if (!m) return null;
  await c.query('select carro_do_freela.guilda_estou_aqui(null)');
  const membros = (await c.query(
    `select m.sub, m.nome, m.arroba, m.foto, m.papel, m.entrou_em, p.visto_em
       from carro_do_freela.guilda_membros m left join carro_do_freela.guilda_presenca p on p.guilda_id = m.guilda_id and p.sub = m.sub
      where m.guilda_id = $1 and m.saiu_em is null order by m.papel, m.entrou_em`, [m.id])).rows;
  const jobs = (await c.query('select * from carro_do_freela.guilda_jobs where guilda_id = $1 order by fechado_em desc', [m.id])).rows;
  const beneficios = (await c.query('select nivel, codigo, titulo, detalhe, dados, ativo from carro_do_freela.guilda_beneficios order by nivel')).rows;
  const logo = m.logo_id ? (await c.query('select id, sha256 from carro_do_freela.guilda_imagens where id = $1', [m.logo_id])).rows[0] : null;
  const extras = (await c.query(
    `select
       (select count(*)::int from (select x.chave from carro_do_freela.guilda_xp x join carro_do_freela.guilda_jobs j on j.id = x.job_id
           where x.guilda_id = $1 and x.origem = 'job' and x.chave like 'fora:%' and j.de_nome is null
           group by x.chave having count(distinct j.dia) >= 2) v) as volta,
       (select count(*)::int from carro_do_freela.guilda_mensagens y where y.guilda_id = $1 and y.tipo = 'chamada' and y.apagada_em is null
           and (y.dados ->> 'hora') < '06:00' and exists (select 1 from carro_do_freela.guilda_chamadas k where k.mensagem_id = y.id and k.presente)) as madrugada,
       (select coalesce(max(n), 0)::int from (select count(*) as n from carro_do_freela.guilda_chamadas k where k.guilda_id = $1 and k.resposta = 'vou'
           group by k.mensagem_id) e) as equipe,
       (select count(*)::int from carro_do_freela.guilda_jobs j where j.guilda_id = $1 and j.fechado_em >= date_trunc('week', now())) as sem_jobs,
       (select count(*)::int from carro_do_freela.guilda_chamadas k where k.guilda_id = $1 and k.presente and k.atualizado_em >= date_trunc('week', now())) as sem_presencas,
       (select count(*)::int from carro_do_freela.guilda_mural p where p.guilda_id = $1 and p.tipo = 'vitoria' and p.criado_em >= date_trunc('week', now())) as sem_vitorias,
       (select coalesce(sum(x.pontos), 0)::int from carro_do_freela.guilda_xp x where x.guilda_id = $1 and x.criado_em > now() - interval '90 days') as tmp_xp,
       (select count(*)::int from carro_do_freela.guilda_jobs j where j.guilda_id = $1 and j.fechado_em > now() - interval '90 days') as tmp_jobs`, [m.id])).rows[0];
  const sala = (await c.query("select id from carro_do_freela.guilda_canais where guilda_id = $1 and tipo = 'sala'", [m.id])).rows[0];
  const canais = (await c.query(
    `select c.id, c.tipo, c.nome, c.job_chave,
            (select count(*)::int from carro_do_freela.guilda_mensagens x where x.canal_id = c.id and x.apagada_em is null
               and x.autor_sub is distinct from $2 and x.seq > coalesce(l.seq, 0)) as nao_lidas,
            (select max(x.criado_em) from carro_do_freela.guilda_mensagens x where x.canal_id = c.id) as ultima
       from carro_do_freela.guilda_canais c left join carro_do_freela.guilda_leituras l on l.canal_id = c.id and l.sub = $2
      where c.guilda_id = $1`, [m.id, sub])).rows
    .sort((a, b) => (a.tipo === b.tipo ? String(iso(b.ultima) || '').localeCompare(String(iso(a.ultima) || '')) : a.tipo === 'sala' ? -1 : 1));
  const ultimas = sala ? (await c.query(
    `select x.id, x.autor_sub, x.autor_nome, x.tipo, left(x.texto, 160) as texto, x.dados, x.criado_em,
            (select coalesce(json_agg(json_build_object('e', r.emoji, 'n', r.n, 'eu', r.eu)), '[]') from
               (select emoji, count(*)::int as n, bool_or(sub = $2) as eu from carro_do_freela.guilda_reacoes where mensagem_id = x.id
                 group by emoji order by count(*) desc limit 3) r) as reacoes
       from carro_do_freela.guilda_mensagens x where x.canal_id = $1 and x.apagada_em is null and x.tipo <> 'evento' order by x.seq desc limit 2`,
    [sala.id, sub])).rows.reverse() : [];
  const digitando = (await c.query(
    `select m.nome from carro_do_freela.guilda_presenca p join carro_do_freela.guilda_membros m on m.guilda_id = p.guilda_id and m.sub = p.sub and m.saiu_em is null
      where p.guilda_id = $1 and p.sub <> $2 and p.digitando_em > clock_timestamp() - interval '6 seconds'`, [m.id, sub])).rows.map(x => x.nome);
  const dono = m.dono_sub === sub;
  const convites = dono
    ? (await c.query("select id, para_sub, expira_em from carro_do_freela.guilda_convites where guilda_id = $1 and estado = 'pendente' and expira_em > clock_timestamp() order by criado_em desc", [m.id])).rows
    : [];
  const nivel = Number(m.nivel), xp = Number(m.xp);
  const bonus = Number(m.vagas) - 15 - m.espaco_extra;
  const online = x => !!x.visto_em && Date.now() - new Date(x.visto_em).getTime() < 120000;
  const lista = cartazes(jobs, membros, sub);
  const missoes = await missoesDa(c, m.id, sub);
  return {
    guilda: { id: m.id, nome: m.nome, tag: m.tag, cor: m.cor, sobre: m.sobre, praca: m.praca, criada_em: iso(m.criado_em),
      paleta: R.paletaDe(m.paleta, m.cor_propria), cor_propria: m.cor_propria, logo: logo ? { id: logo.id, sha: logo.sha256, url: LOGO_URL(logo) } : null },
    eu: { sub, papel: dono ? 'dono' : 'membro' },
    membros: membros.map(x => ({ sub: x.sub, nome: x.nome, arroba: x.arroba, foto: x.foto, papel: x.papel, eu: x.sub === sub, entrou_em: iso(x.entrou_em),
      online: online(x) })),
    nivel: { atual: nivel, xp, de: (nivel - 1) * XP_NIVEL, ate: nivel * XP_NIVEL, por_nivel: XP_NIVEL,
      faltam: Math.max(1, Math.ceil((nivel * XP_NIVEL - xp) / XP_JOB)), jobs: jobs.length },
    vagas: { base: 15, bonus_de_nivel: bonus, extra: m.espaco_extra, total: Number(m.vagas), ocupadas: Number(m.ocupadas), livres: Math.max(0, Number(m.vagas) - Number(m.ocupadas)) },
    beneficios: beneficios.map(b => ({ nivel: b.nivel, codigo: b.codigo, titulo: b.titulo, detalhe: b.detalhe, dados: b.dados, ativo: b.ativo, conquistado: nivel >= b.nivel })),
    placa: placa(m, jobs, { volta: extras.volta, madrugada: extras.madrugada, equipe: extras.equipe,
      semana: { jobs: extras.sem_jobs, presencas: extras.sem_presencas, vitorias: extras.sem_vitorias },
      temporada: { xp: extras.tmp_xp, jobs: extras.tmp_jobs } }),
    memoria: { jobs: lista.length, contratantes: new Set(jobs.map(j => j.de_sub)).size, desde: iso(m.criado_em), cartazes: lista.slice(0, 12) },
    jobs: jobs.slice(0, 30).map(j => ({ id: j.id, dia: diaTxt(j.dia), funcao: j.funcao, membros: [j.de_nome, j.para_nome].filter(Boolean), fechado_em: iso(j.fechado_em) })),
    agora: { n: membros.filter(online).length, subs: membros.filter(online).map(x => x.sub) },
    chat: { sala: sala ? sala.id : null, nao_lidas: canais.reduce((n, x) => n + x.nao_lidas, 0), digitando,
      canais: canais.map(x => ({ id: x.id, tipo: x.tipo, nome: x.nome, nao_lidas: x.nao_lidas, ultima: iso(x.ultima) })),
      ultimas: ultimas.map(x => ({ id: x.id, autor: x.autor_sub ? { sub: x.autor_sub, nome: x.autor_nome } : null, tipo: x.tipo, texto: x.texto,
        dados: x.dados, criado_em: iso(x.criado_em), reacoes: x.reacoes })) },
    convites: convites.map(v => ({ id: v.id, tipo: v.para_sub ? 'arroba' : 'link', para: v.para_sub, expira_em: iso(v.expira_em) })),
    missoes, proximos: proximosDe(missoes),
  };
}

/* ---------------- o quadro de missões (0006): os jobs montados na Sede, com a equipe e o estado de cada pessoa ----------------
 * a rodar = o dia ainda vem; rodando = é hoje; feito = já passou (o que foi feito fica 45 dias no quadro; depois, só na
 * memória). Sem preço (missão e vaga não guardam valor) e sem o motivo de quem recusou (esse fica entre os dois lados).
 * O dia "de hoje" é o da praça (Natal, UTC−3), não o do servidor. */
const hojeNaPraca = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
function estadoDaMissao(dia, hoje) { return dia > hoje ? 'a_rodar' : dia === hoje ? 'rodando' : 'feito' }
async function missoesDa(c, g, sub) {
  const ms = (await c.query(
    `select * from carro_do_freela.guilda_missoes where guilda_id = $1 and estado = 'aberta' and dia >= current_date - 45
      order by dia, criado_em limit 60`, [g])).rows;
  if (!ms.length) return [];
  const vagas = (await c.query(
    `select missao_id, sub, nome, funcao, estado from carro_do_freela.guilda_missao_vagas
      where missao_id = any($1::uuid[]) and estado <> 'trocada' order by criado_em`, [ms.map(x => x.id)])).rows;
  const hoje = hojeNaPraca();
  const lista = ms.map(x => {
    const dia = diaTxt(x.dia);
    const eq = vagas.filter(v => v.missao_id === x.id).map(v => ({ sub: v.sub, nome: v.nome, funcao: v.funcao,
      estado: v.estado === 'enviar' ? 'pendente' : v.estado, enviada: v.estado !== 'enviar', eu: v.sub === sub }));
    return {
      id: x.id, titulo: x.titulo, contratante: x.contratante, cliente: x.cliente, dia, ini: horaTxt(x.ini), fim: horaTxt(x.fim),
      local: x.local, dono: { sub: x.dono_sub, nome: x.dono_nome }, eu_dono: x.dono_sub === sub, canal: x.canal_id, chamada: x.chamada_id,
      estado: estadoDaMissao(dia, hoje), equipe: eq,
      conta: { vai: eq.filter(v => v.estado === 'vai').length, pendente: eq.filter(v => v.estado === 'pendente').length,
        nao_vai: eq.filter(v => v.estado === 'nao_vai').length },
      criado_em: iso(x.criado_em),
    };
  });
  /* no quadro: o que vem primeiro (o mais perto antes) e o que já foi depois (o mais novo antes) */
  return lista.filter(x => x.estado !== 'feito').concat(lista.filter(x => x.estado === 'feito').reverse());
}
/** o próximo job de cada pessoa da guilda (o selo na lista de membros): quem montou ou quem vai/está pendente */
function proximosDe(missoes) {
  const out = {};
  const pegar = (s, x, estado) => { if (!out[s] || out[s].dia > x.dia) out[s] = { missao: x.id, titulo: x.titulo, dia: x.dia, estado } };
  for (const x of missoes) {
    if (x.estado === 'feito') continue;
    pegar(x.dono.sub, x, 'monta');
    for (const v of x.equipe) if (v.estado !== 'nao_vai') pegar(v.sub, x, v.estado);
  }
  return out;
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
        fase: FASES.faseAtual(), pode_fundar: podeFundar(quem), pedir_url: Z.config().issuer + '/perfil/plano',
        pacotes: Object.keys(PACOTES).filter(s => sinais(quem).includes(s)).map(s => PACOTES[s]),
        minha: r.minha,
        recebidos: r.recebidos.map(x => ({ id: x.id, nome: x.nome, tag: x.tag, cor: x.cor, de_nome: x.de_nome, expira_em: iso(x.expira_em) })),
        carencia_ate: ate && ate > new Date() ? ate.toISOString() : null,
      }, extra);
    }
    const corpo = await corpoDe(req, res, extra);
    if (corpo === undefined) return;
    const acao = corpo && corpo.acao !== undefined ? corpo.acao : 'criar';
    if (acao === 'criar') {
      const v = R.guildaDe(corpo);
      /* fundar é pago (só quem funda paga): sem a fundação na conta, nada é criado. O plano ainda é rascunho no HUB. */
      if (!podeFundar(quem)) return json(res, 402, { erro: 'fundacao' }, extra);
      const g = await db.asUser(sub, async c => {
        const id = (await c.query('select carro_do_freela.guilda_criar($1, $2, $3, $4, $5, $6, $7) as id', [v.nome, v.tag, v.cor, v.sobre, nome, arroba, foto])).rows[0].id;
        await c.query('select carro_do_freela.guilda_definir_extra($1)', [extraDaConta(quem)]);
        return id;
      });
      return json(res, 201, { guilda: { id: g } }, extra);
    }
    if (acao === 'personalizar') {
      const v = R.personalizarDe(corpo);
      await db.asUser(sub, async c => c.query('select carro_do_freela.guilda_personalizar($1, $2, $3, $4)', [v.paleta, v.cor, v.sobre, v.praca]));
      return json(res, 200, { paleta: R.paletaDe(v.paleta, v.cor) }, extra);
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
  /* o que a Sede (_sede.js) usa daqui: o mesmo caminho de toda rota */
  _comum: { json, preparar, corpoDe, responderErro, nomeDaConta, semConteudo, protegido, iso, diaTxt, FASES, cartazes, hojeNaPraca },
};
