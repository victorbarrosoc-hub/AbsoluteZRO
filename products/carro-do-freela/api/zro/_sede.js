/**
 * A SEDE DA GUILDA (0005, fase 2) — o miolo de api/zro/sede.js: chat, quadro e memória.
 *
 *   GET  /api/zro/sede?canal=<id>&desde=<v>  → { v, canal, mensagens, fixadas, digitando, agora, canais }  (ETag/304)
 *   GET  /api/zro/sede?ver=mural             → { posts: [...] }
 *   GET  /api/zro/sede?ver=memoria           → { cartazes: [...] }   (todos os jobs juntos, com os créditos)
 *   GET  /api/zro/sede?ver=dia&dia=AAAA-MM-DD → { dia, pessoas: [{ sub, estado }] }   (quem da guilda está livre: 0006)
 *   POST /api/zro/sede {acao, ...}           → mensagem · chamada · reagir · apagar · fixar · responder · presenca ·
 *                                              canal_job · nomear · lido · digitando · post · post_apagar · post_fixar · post_reagir ·
 *                                              missao · missao_trocar · missao_cancelar   (o quadro de missões, 0006)
 *
 * O QUADRO DE MISSÕES (0006): `missao` monta o job com gente da guilda (as vagas, o canal do job e, se pedido, o call
 * sheet nele); a tela manda então UMA proposta por pessoa pelo POST /api/zro/propostas de sempre, com `missao`. O estado de
 * cada vaga vem da proposta (aceitar/recusar pelo mesmo PATCH, na mesma caixa). O quadro sai em GET /api/zro/guildas
 * (`minha.missoes` e `minha.proximos`).
 *
 * O chat é em tempo real por POLL barato: a guilda tem um contador de versão (guilda_versao, sobe a cada mensagem,
 * reação, resposta de call sheet ou post); o ETag é a versão + quem está digitando + quantos estão na sede, e o
 * navegador manda If-None-Match: nada mudou, 304 sem corpo. `desde=<v>` traz só o que mudou depois daquela versão.
 * Tudo pela sessão conferida no HUB e pelo papel `carro_do_freela_app` (RLS: só quem é da guilda). O nome de quem
 * escreve vem da CONTA. ⚠️ Com a fase 1 (db/fase.js) a rota responde 404, antes de qualquer outra coisa.
 */
const crypto = require('crypto');
const { UUID } = require('../../db/banco.js');
const R = require('../../db/regras.js');
const { json, preparar, corpoDe, responderErro, nomeDaConta, semConteudo, protegido, iso, FASES, cartazes } = require('./_dados.js')._comum;

const IMG = i => (i && i.id ? { url: '/api/zro/sede-imagem?id=' + i.id + '&sha=' + i.sha256, largura: i.largura, altura: i.altura } : null);
const etagDe = partes => 'W/"' + crypto.createHash('sha256').update(partes.join('|')).digest('hex').slice(0, 24) + '"';

async function chat(c, sub, canalId, desde, req) {
  const g = (await c.query('select carro_do_freela.guilda_minha() as g')).rows[0].g;
  if (!g) return { status: 404, erro: 'sem_guilda' };
  const canal = (await c.query('select id, tipo, nome, job_chave from carro_do_freela.guilda_canais where id = $1', [canalId])).rows[0];
  if (!canal) return { status: 404, erro: 'nao_achado' };
  await c.query('select carro_do_freela.guilda_estou_aqui(null)');
  const v = Number((await c.query('select v from carro_do_freela.guilda_versao where guilda_id = $1', [g])).rows[0]?.v || 0);
  const digitando = (await c.query(
    `select m.nome from carro_do_freela.guilda_presenca p join carro_do_freela.guilda_membros m on m.guilda_id = p.guilda_id and m.sub = p.sub and m.saiu_em is null
      where p.guilda_id = $1 and p.sub <> $2 and p.digitando_canal = $3 and p.digitando_em > clock_timestamp() - interval '6 seconds' order by m.nome`,
    [g, sub, canalId])).rows.map(x => x.nome);
  const agora = (await c.query("select sub from carro_do_freela.guilda_presenca where guilda_id = $1 and visto_em > clock_timestamp() - interval '2 minutes' order by sub", [g])).rows.map(x => x.sub);
  const etag = etagDe([v, canalId, desde, digitando.join(','), agora.join(',')]);
  if (req.headers['if-none-match'] === etag) return { etag, naoMudou: true };
  const rows = desde > 0
    ? (await c.query('select * from carro_do_freela.guilda_mensagens where canal_id = $1 and ver > $2 order by seq limit 200', [canalId, desde])).rows
    : (await c.query('select * from carro_do_freela.guilda_mensagens where canal_id = $1 order by seq desc limit 80', [canalId])).rows.reverse();
  const ids = rows.map(x => x.id);
  const reacoes = ids.length ? (await c.query(
    `select mensagem_id, emoji, count(*)::int as n, bool_or(sub = $2) as eu from carro_do_freela.guilda_reacoes
      where mensagem_id = any($1::uuid[]) group by mensagem_id, emoji order by min(criado_em)`, [ids, sub])).rows : [];
  const chamadas = ids.length ? (await c.query('select mensagem_id, sub, resposta, presente from carro_do_freela.guilda_chamadas where mensagem_id = any($1::uuid[])', [ids])).rows : [];
  const imagens = (await c.query('select id, sha256, largura, altura from carro_do_freela.guilda_imagens where id = any($1::uuid[])',
    [rows.map(x => x.imagem_id).filter(Boolean)])).rows;
  const fixadas = (await c.query(
    `select id, tipo, left(texto, 120) as texto, dados ->> 'titulo' as titulo, dados ->> 'hora' as hora, dados ->> 'local' as local, fixada_em
       from carro_do_freela.guilda_mensagens where canal_id = $1 and fixada_em is not null and apagada_em is null order by fixada_em desc`, [canalId])).rows;
  const max = rows.reduce((n, x) => Math.max(n, Number(x.seq)), 0);
  if (max) await c.query('select carro_do_freela.guilda_lido($1, $2)', [canalId, max]);
  const canais = (await c.query(
    `select c.id, c.tipo, c.nome,
            (select count(*)::int from carro_do_freela.guilda_mensagens x where x.canal_id = c.id and x.apagada_em is null
               and x.autor_sub is distinct from $2 and x.seq > coalesce(l.seq, 0)) as nao_lidas
       from carro_do_freela.guilda_canais c left join carro_do_freela.guilda_leituras l on l.canal_id = c.id and l.sub = $2
      where c.guilda_id = $1`, [g, sub])).rows;
  const porImg = new Map(imagens.map(i => [i.id, i]));
  const mensagens = rows.map(x => {
    const ch = x.tipo === 'chamada' ? chamadas.filter(k => k.mensagem_id === x.id) : null;
    return {
      id: x.id, seq: Number(x.seq), ver: Number(x.ver), autor: x.autor_sub ? { sub: x.autor_sub, nome: x.autor_nome } : null, eu: x.autor_sub === sub,
      tipo: x.tipo, texto: x.texto, dados: x.dados, mencoes: x.mencoes || [], imagem: IMG(porImg.get(x.imagem_id)),
      fixada: !!x.fixada_em, apagada: !!x.apagada_em, criado_em: iso(x.criado_em),
      reacoes: reacoes.filter(r => r.mensagem_id === x.id).map(r => ({ e: r.emoji, n: r.n, eu: r.eu })),
      chamada: ch && {
        vou: ch.filter(k => k.resposta === 'vou').map(k => k.sub), nao: ch.filter(k => k.resposta === 'nao').map(k => k.sub),
        presentes: ch.filter(k => k.presente).map(k => k.sub), eu: (ch.find(k => k.sub === sub) || {}).resposta || null,
      },
    };
  });
  return {
    etag, corpo: {
      v, canal: { id: canal.id, tipo: canal.tipo, nome: canal.nome, dia: canal.job_chave ? canal.job_chave.split(':')[1] : null },
      mensagens, completo: !(desde > 0), digitando, agora: { n: agora.length, subs: agora },
      fixadas: fixadas.map(f => ({ id: f.id, tipo: f.tipo, texto: f.texto, titulo: f.titulo, hora: f.hora, local: f.local })),
      canais: canais.map(x => ({ id: x.id, tipo: x.tipo, nome: x.nome, nao_lidas: x.nao_lidas })),
    },
  };
}

async function mural(c, sub) {
  const rows = (await c.query(
    `select p.*, i.sha256, i.largura, i.altura from carro_do_freela.guilda_mural p left join carro_do_freela.guilda_imagens i on i.id = p.imagem_id
      order by p.fixado_em desc nulls last, p.criado_em desc limit 80`)).rows;
  const ids = rows.map(x => x.id);
  const reacoes = ids.length ? (await c.query(
    `select post_id, emoji, count(*)::int as n, bool_or(sub = $2) as eu from carro_do_freela.guilda_mural_reacoes
      where post_id = any($1::uuid[]) group by post_id, emoji order by min(criado_em)`, [ids, sub])).rows : [];
  return rows.map(p => ({
    id: p.id, tipo: p.tipo, autor: p.autor_sub ? { sub: p.autor_sub, nome: p.autor_nome } : null, eu: p.autor_sub === sub,
    titulo: p.titulo, texto: p.texto, link: p.link, imagem: IMG(p.imagem_id && { id: p.imagem_id, sha256: p.sha256, largura: p.largura, altura: p.altura }),
    dados: p.dados, fixado: !!p.fixado_em, criado_em: iso(p.criado_em),
    reacoes: reacoes.filter(r => r.post_id === p.id && r.emoji !== 'quero').map(r => ({ e: r.emoji, n: r.n, eu: r.eu })),
    quero: (() => { const q = reacoes.find(r => r.post_id === p.id && r.emoji === 'quero'); return q ? { n: q.n, eu: q.eu } : { n: 0, eu: false } })(),
  }));
}

async function memoria(c, sub) {
  const g = (await c.query('select carro_do_freela.guilda_minha() as g')).rows[0].g;
  if (!g) return null;
  const membros = (await c.query('select sub from carro_do_freela.guilda_membros where guilda_id = $1 and saiu_em is null', [g])).rows;
  const jobs = (await c.query('select * from carro_do_freela.guilda_jobs where guilda_id = $1 order by fechado_em desc', [g])).rows;
  const canais = (await c.query("select id, job_chave from carro_do_freela.guilda_canais where guilda_id = $1 and tipo = 'job'", [g])).rows;
  const porChave = new Map(canais.map(x => [x.job_chave, x.id]));
  const deSub = new Map(jobs.map(j => [j.id, j.de_sub]));
  return cartazes(jobs, membros, sub).map(x => Object.assign(x, { canal: (x.dia && porChave.get(deSub.get(x.id) + ':' + x.dia)) || null }));
}

const ACOES = {
  async mensagem(c, corpo, nome) {
    const v = R.mensagemDe(corpo);
    return { status: 201, corpo: { mensagem: { id: (await c.query('select carro_do_freela.guilda_msg_enviar($1, $2, $3, $4, $5, $6) as id', [v.canal, 'texto', v.texto, null, v.imagem, nome])).rows[0].id } } };
  },
  async chamada(c, corpo, nome) {
    const v = R.chamadaDe(corpo);
    const dados = { titulo: v.titulo, dia: v.dia, hora: v.hora, local: v.local, obs: v.obs, equipe: v.equipe };
    return { status: 201, corpo: { mensagem: { id: (await c.query('select carro_do_freela.guilda_msg_enviar($1, $2, $3, $4, $5, $6) as id', [v.canal, 'chamada', null, dados, null, nome])).rows[0].id } } };
  },
  async reagir(c, corpo) { const v = R.reagirDe(corpo); await c.query('select carro_do_freela.guilda_reagir($1, $2, $3)', [v.id, v.emoji, v.ligar]) },
  async apagar(c, corpo) { await c.query('select carro_do_freela.guilda_msg_apagar($1)', [R.sedeIdDe(corpo)]) },
  async fixar(c, corpo) { const v = R.fixarDe(corpo); await c.query('select carro_do_freela.guilda_msg_fixar($1, $2)', [v.id, v.fixar]) },
  async responder(c, corpo) { const v = R.responderChamadaDe(corpo); await c.query('select carro_do_freela.guilda_chamada_responder($1, $2)', [v.id, v.resposta]) },
  async presenca(c, corpo) { const v = R.presencaDe(corpo); await c.query('select carro_do_freela.guilda_chamada_presenca($1, $2, $3)', [v.id, v.sub, v.presente]) },
  async canal_job(c, corpo) {
    return { status: 200, corpo: { canal: { id: (await c.query('select carro_do_freela.guilda_canal_do_job($1) as id', [R.jobDe(corpo)])).rows[0].id } } };
  },
  async nomear(c, corpo) { const v = R.nomearDe(corpo); await c.query('select carro_do_freela.guilda_job_nomear($1, $2, $3)', [v.job, v.titulo, v.tipo]) },
  async lido(c, corpo) { const v = R.lidoDe(corpo); await c.query('select carro_do_freela.guilda_lido($1, $2)', [v.canal, v.seq]) },
  async digitando(c, corpo) { await c.query('select carro_do_freela.guilda_estou_aqui($1)', [R.digitandoDe(corpo)]) },
  async post(c, corpo, nome) {
    const v = R.muralDe(corpo);
    return { status: 201, corpo: { post: { id: (await c.query('select carro_do_freela.guilda_post_criar($1, $2, $3, $4, $5, $6, $7) as id', [v.tipo, v.titulo, v.texto, v.link, v.imagem, v.dados, nome])).rows[0].id } } };
  },
  async post_apagar(c, corpo) { await c.query('select carro_do_freela.guilda_post_apagar($1)', [R.sedeIdDe(corpo)]) },
  async post_fixar(c, corpo) { const v = R.fixarDe(corpo); await c.query('select carro_do_freela.guilda_post_fixar($1, $2)', [v.id, v.fixar]) },
  async missao(c, corpo, nome) {
    const v = R.missaoDe(corpo);
    const r = (await c.query('select * from carro_do_freela.guilda_missao_criar($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [v.titulo, v.contratante, v.cliente, v.dia, v.ini, v.fim, v.local, JSON.stringify(v.equipe), nome, v.chamada && JSON.stringify(v.chamada)])).rows[0];
    return { status: 201, corpo: { missao: { id: r.id, canal: r.canal, chamada: r.chamada || null } } };
  },
  async missao_trocar(c, corpo) {
    const v = R.missaoTrocarDe(corpo);
    await c.query('select carro_do_freela.guilda_missao_trocar($1, $2, $3, $4)', [v.missao, v.sai, v.entra, v.funcao]);
  },
  async missao_cancelar(c, corpo) { await c.query('select carro_do_freela.guilda_missao_cancelar($1)', [R.missaoIdDe(corpo)]) },
  async post_reagir(c, corpo) { const v = R.reagirDe(corpo, R.EMOJIS.concat('quero')); await c.query('select carro_do_freela.guilda_post_reagir($1, $2, $3)', [v.id, v.emoji, v.ligar]) },
};

async function sede(req, res) {
  if (!FASES.guildaNoAr()) return json(res, 404, { erro: 'nao_encontrado' });
  const p = await preparar(req, res, { metodos: ['GET', 'POST'], escrita: req.method === 'POST', freio: 'chat' });
  if (!p) return;
  const { db, sub, quem, extra } = p;
  try {
    if (req.method === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams;
      if (q.has('canal')) {
        const canal = q.get('canal');
        if (!UUID.test(String(canal))) return json(res, 400, { erro: 'tipo', campo: 'canal' }, extra);
        const desde = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, parseInt(q.get('desde') || '0', 10) || 0));
        const r = await db.asUser(sub, c => chat(c, sub, canal.toLowerCase(), desde, req));
        if (r.erro) return json(res, r.status, { erro: r.erro }, extra);
        if (r.naoMudou) {
          res.writeHead(304, Object.assign({ ETag: r.etag, 'Cache-Control': 'no-cache' }, extra));
          return res.end();
        }
        return json(res, 200, r.corpo, Object.assign({ ETag: r.etag, 'Cache-Control': 'no-cache' }, extra));
      }
      if (q.get('ver') === 'dia') {
        const dia = R.diaDe(String(q.get('dia') || ''));
        const l = await db.asUser(sub, async c => (await c.query('select * from carro_do_freela.guilda_missao_dia($1::date)', [dia])).rows);
        return json(res, 200, { dia, pessoas: l.map(x => ({ sub: x.sub, estado: x.estado })) }, extra);
      }
      if (q.get('ver') === 'mural') return json(res, 200, { posts: await db.asUser(sub, c => mural(c, sub)) }, extra);
      if (q.get('ver') === 'memoria') {
        const l = await db.asUser(sub, c => memoria(c, sub));
        if (!l) return json(res, 404, { erro: 'sem_guilda' }, extra);
        return json(res, 200, { cartazes: l }, extra);
      }
      return json(res, 400, { erro: 'pedido' }, extra);
    }
    const corpo = await corpoDe(req, res, extra);
    if (corpo === undefined) return;
    const fazer = corpo && typeof corpo === 'object' && Object.prototype.hasOwnProperty.call(ACOES, corpo.acao) ? ACOES[corpo.acao] : null;
    if (!fazer) return json(res, 400, { erro: 'acao' }, extra);
    const r = await db.asUser(sub, c => fazer(c, corpo, nomeDaConta(quem)));
    if (r && r.corpo) return json(res, r.status, r.corpo, extra);
    return semConteudo(res, extra);
  } catch (e) {
    return responderErro(res, e, extra);
  }
}

module.exports = { sede: protegido(sede) };
