/* A GUILDA NO SITE REAL — a SEDE (fase 1, GRÁTIS, desde 01/11/2026) contra /api/zro/guildas, /api/zro/sede e
 * /api/zro/sede-imagem (fetch trocado, como na suíte site-real). O servidor de verdade (banco, RLS, XP, imagens) é provado
 * no `test:banco` (_guilda-testes.js e _sede-testes.js).
 *
 * O portão é db/fase.js (recursos por fase, escritos no site pelo build). Esta suíte constrói o site real duas vezes:
 * na fase 1 (a de verdade) e na fase 0 (CDF_TESTE_FASE só existe para isto: nenhum recurso de lançamento), e jura:
 *   - fase 0: a guilda não existe (nem aba, nem menu, nem show(), nem a home, nem um pedido ao servidor): o portão vale;
 *   - fase 1: a Sede aparece (painel, chat, quadro, memória) com o que o servidor manda, na cor da casa, e a home tem a
 *     guilda entre os destaques; NADA de compra: sem preço, sem "Aumentar lugares", sem pedido de plano, só o limite
 *     honesto ("15 lugares"); fundar é grátis; o chat faz poll com ETag (304 = nada muda), manda mensagem, confirma o
 *     call sheet; o quadro e a memória vêm do servidor; personalizar é só do dono; convidar, tirar, cancelar, sair e o
 *     link ?guilda= seguem pedidos ao servidor;
 *   - a conta da cor própria é a mesma do servidor (db/regras.js);
 *   - a ordem da busca (filtrar) é a mesma com e sem guilda, nível, lugares e cor, e o código de filtrar() não a conhece. */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ok = [], bad = []; const t = (c, m) => (c ? ok : bad).push(m);
const RAIZ = path.resolve(__dirname, '..');
const PUB = path.join(RAIZ, 'public');
const R = require('../db/regras.js');

function construir(fase, nome) {
  execFileSync(process.execPath, [path.join(RAIZ, 'src/build.js'), '--real'], { cwd: RAIZ, stdio: 'pipe', env: Object.assign({}, process.env, { CDF_TESTE_FASE: fase === 1 ? '' : String(fase) }) });
  const html = fs.readFileSync(path.join(PUB, 'real.html'), 'utf8');
  fs.writeFileSync(path.join(PUB, nome), html);
  return { arquivo: path.join(PUB, nome) };
}

const SUB = 'eeeeeeee-0000-4000-8000-00000000000e';
const UM = 'aaaaaaaa-0000-4000-8000-000000000001';
const SALA = 'cccccccc-0000-4000-8000-000000000001', CJOB = 'cccccccc-0000-4000-8000-000000000002';
const MINHA = (dono = true) => ({
  guilda: { id: 'g1', nome: 'Panelinha', tag: 'PNL', cor: '#7c9cff', sobre: 'Clipe e publicidade', praca: 'Natal/RN', criada_em: '2026-03-01T10:00:00Z',
    paleta: { id: 'gel-magenta', nome: 'Gel magenta', d: '#F062B8', l: '#B0307A', ink: '#1F0716' }, cor_propria: null, logo: null },
  eu: { sub: SUB.toLowerCase(), papel: dono ? 'dono' : 'membro' },
  membros: [{ sub: SUB.toLowerCase(), nome: 'Conta Teste', arroba: 'conta.teste', foto: null, papel: dono ? 'dono' : 'membro', eu: true, online: true },
    { sub: UM, nome: 'Pessoa Um', arroba: 'pessoa.um', foto: null, papel: dono ? 'membro' : 'dono', eu: false, online: true }],
  nivel: { atual: 7, xp: 2680, de: 2400, ate: 2800, por_nivel: 400, faltam: 1, jobs: 4 },
  vagas: { base: 15, bonus_de_nivel: 0, extra: 0, total: 15, ocupadas: 2, livres: 13 },
  beneficios: [],
  placa: { sequencia: 9, semanas: [false, false, false, true, true, true, true, true, true, true, true, true],
    credenciais: [{ codigo: 'primeiro', titulo: 'Primeiro job', detalhe: 'o primeiro job fechado', ico: 'estrela', n: 1, meta: 1, ok: true },
      { codigo: 'madrugada', titulo: 'Madrugada', detalhe: '3 chamadas antes das 6h', ico: 'relogio', n: 1, meta: 3, ok: false }],
    semana: [{ t: 'Fechar um job', n: 1, meta: 1 }, { t: 'Presença num call sheet', n: 0, meta: 1 }, { t: 'Uma vitória no quadro', n: 0, meta: 1 }],
    temporada: { xp: 1200, jobs: 7 } },
  memoria: { jobs: 2, contratantes: 2, desde: '2026-03-01T10:00:00Z', cartazes: [
    { id: 'j1', dia: '2026-10-19', titulo: 'Clipe “Maré Cheia”', tipo: 'Clipe', local: 'Forte dos Reis Magos', contratante: null, de_fora: true, eu: true, vem: false,
      creditos: [{ funcao: 'Op. de câmera', nome: 'Pessoa Um', de_fora: false, saiu: false }, { funcao: 'Gaffer', nome: 'Vítor Sales', de_fora: false, saiu: true }], fechado_em: '2026-10-19T10:00:00Z' },
    { id: 'j2', dia: '2026-09-21', titulo: null, tipo: null, local: 'Redinha', contratante: 'Conta Teste', de_fora: false, eu: true, vem: false,
      creditos: [{ funcao: 'Op. de drone', nome: null, de_fora: true, saiu: false }], fechado_em: '2026-09-21T10:00:00Z' }] },
  jobs: [],
  agora: { n: 2, subs: [SUB.toLowerCase(), UM] },
  chat: { sala: SALA, nao_lidas: 3, digitando: [], canais: [{ id: SALA, tipo: 'sala', nome: 'geral', nao_lidas: 2 }, { id: CJOB, tipo: 'job', nome: 'Clipe “Maré Cheia”', nao_lidas: 1 }],
    ultimas: [{ id: 'm1', autor: { sub: UM, nome: 'Pessoa Um' }, tipo: 'texto', texto: 'Cliente aprovou o roteiro final.', dados: {}, criado_em: '2026-10-31T10:00:00Z', reacoes: [{ e: '🙌', n: 6, eu: true }] }] },
  convites: dono ? [{ id: 'c1', tipo: 'link', para: null, expira_em: '2026-11-08T10:00:00Z' }] : [],
});
/* o que o servidor manda na fase 1: venda desligada, todo mundo funda, nenhum pacote, nenhum pedir_url */
const GUILDA = (extra = {}) => Object.assign({ fase: 1, venda: false, pode_fundar: true, pacotes: [], recebidos: [], carencia_ate: null, minha: MINHA() }, extra);
const CHAT = v => ({ v, canal: { id: SALA, tipo: 'sala', nome: 'geral', dia: null }, completo: v === 10, digitando: v === 10 ? [] : ['Pessoa Um'], agora: { n: 2, subs: [SUB.toLowerCase(), UM] },
  fixadas: [{ id: 'm2', tipo: 'chamada', texto: null, titulo: 'Campanha Verão', hora: '06:00', local: 'Redinha' }],
  canais: [{ id: SALA, tipo: 'sala', nome: 'geral', nao_lidas: 0 }, { id: CJOB, tipo: 'job', nome: 'Clipe “Maré Cheia”', nao_lidas: 1 }],
  mensagens: v === 10 ? [
    { id: 'm1', seq: 1, ver: 3, autor: { sub: UM, nome: 'Pessoa Um' }, eu: false, tipo: 'texto', texto: 'Bom dia @conta.teste, leva o blimp', dados: {}, mencoes: [SUB.toLowerCase()], imagem: null, fixada: false, apagada: false, criado_em: '2026-10-31T09:00:00Z', reacoes: [{ e: '👍', n: 2, eu: false }], chamada: null },
    { id: 'm2', seq: 2, ver: 5, autor: { sub: UM, nome: 'Pessoa Um' }, eu: false, tipo: 'chamada', texto: null, dados: { titulo: 'Campanha Verão', dia: '2026-11-07', hora: '06:00', local: 'Redinha', obs: null, equipe: [UM, SUB.toLowerCase()] },
      mencoes: [], imagem: null, fixada: true, apagada: false, criado_em: '2026-10-31T09:10:00Z', reacoes: [], chamada: { vou: [UM], nao: [], presentes: [], eu: null } },
    { id: 'm3', seq: 3, ver: 6, autor: null, eu: false, tipo: 'evento', texto: null, dados: { xp: 180, n: 2, titulo: 'Clipe “Maré Cheia”', dia: '2026-10-19', fora: true, nivel: 7, subiu: false }, mencoes: [], imagem: null, fixada: false, apagada: false, criado_em: '2026-10-31T09:20:00Z', reacoes: [], chamada: null }]
    : [{ id: 'm4', seq: 4, ver: 11, autor: { sub: SUB.toLowerCase(), nome: 'Conta Teste' }, eu: true, tipo: 'texto', texto: 'Chego às 5h40.', dados: {}, mencoes: [], imagem: null, fixada: false, apagada: false, criado_em: '2026-10-31T10:00:00Z', reacoes: [], chamada: null }] });

/** liga a página à "conta liberada" e a um servidor de mentira; devolve o que ela pediu */
const PREPARAR = `async (estado) => {
  window.__pedidos = []; window.__inm = [];
  window.open = (u) => { window.__aberto = u; return null };
  window.fetch = async (u, o) => {
    const met = (o && o.method) || 'GET';
    window.__pedidos.push(met + ' ' + u + (o && o.body && typeof o.body === 'string' ? ' ' + o.body : ''));
    const J = (s, j, h) => new Response(JSON.stringify(j), { status: s, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}) });
    if (u === '/api/zro/guildas') {
      if (met === 'GET') return J(200, window.__estado);
      const c = JSON.parse(o.body);
      if (!c.acao) { if (!window.__estado.pode_fundar) return J(402, { erro: 'fundacao' }); window.__estado = Object.assign({}, window.__estado, { minha: window.__criada }); return J(201, { guilda: { id: 'g1' } }) }
      if (c.acao === 'personalizar') { window.__estado.minha.guilda.paleta = { id: c.paleta, nome: 'x', d: '#3FD3B0', l: '#0F7D66', ink: '#04150F' }; return J(200, { paleta: window.__estado.minha.guilda.paleta }) }
      if (c.acao === 'convidar' && !c.para) return J(201, { convite: { id: 'c9', tipo: 'link' }, link: 'http://x/?guilda=' + 'a'.repeat(32) });
      if (c.acao === 'convidar') return J(201, { convite: { id: 'c8', tipo: 'arroba' } });
      if (c.acao === 'ver') return J(200, { guilda: { nome: 'Panelinha', tag: 'PNL', cor: '#7c9cff', ocupadas: 2, vagas: 15, expira_em: '2026-11-08T10:00:00Z' } });
      if (c.acao === 'aceitar') { window.__estado = Object.assign({}, window.__estado, { recebidos: [], minha: window.__criada }); return J(200, { guilda: { id: 'g1' } }) }
      if (c.acao === 'recusar') { window.__estado = Object.assign({}, window.__estado, { recebidos: [] }); return new Response(null, { status: 204 }) }
      if (c.acao === 'sair') window.__estado = Object.assign({}, window.__estado, { minha: null });
      return new Response(null, { status: 204 });
    }
    if (u.startsWith('/api/zro/sede?canal=')) {
      const h = (o && o.headers) || {}; window.__inm.push(h['If-None-Match'] || null);
      const desde = +new URL(u, 'http://x').searchParams.get('desde');
      if (desde === 0) return J(200, ${JSON.stringify(CHAT(10))}, { ETag: 'W/"e10"' });
      if (h['If-None-Match'] === 'W/"e10"' && !window.__novo) return new Response(null, { status: 304 });
      return J(200, window.__chat11, { ETag: 'W/"e11"' });
    }
    if (u === '/api/zro/sede?ver=mural') return J(200, { posts: [
      { id: 'p1', tipo: 'aviso', autor: { sub: '${SUB.toLowerCase()}', nome: 'Conta Teste' }, eu: true, titulo: 'Sábado é dia de Café Potengi', texto: 'Chamada 6h.', link: null, imagem: null, dados: {}, fixado: true, criado_em: '2026-10-30T10:00:00Z', reacoes: [{ e: '👍', n: 3, eu: false }], quero: { n: 0, eu: false } },
      { id: 'p2', tipo: 'vaga', autor: { sub: '${UM}', nome: 'Pessoa Um' }, eu: false, titulo: '1ª assistente de câmera', texto: null, link: null, imagem: null, dados: { dia: '2026-11-14', funcao: '1º assistente', diaria_cents: 45000 }, fixado: false, criado_em: '2026-10-30T10:00:00Z', reacoes: [], quero: { n: 2, eu: false } },
      { id: 'p3', tipo: 'marco', autor: null, eu: false, titulo: 'A sede subiu para o nível 7', texto: null, link: null, imagem: null, dados: { nivel: 7 }, fixado: false, criado_em: '2026-10-12T10:00:00Z', reacoes: [], quero: { n: 0, eu: false } }] });
    if (u === '/api/zro/sede?ver=memoria') return J(200, { cartazes: window.__estado.minha.memoria.cartazes.map(c => Object.assign({ canal: null }, c)) });
    if (u === '/api/zro/sede') return o.body && JSON.parse(o.body).acao === 'canal_job' ? J(200, { canal: { id: '${CJOB}' } }) : J(201, { mensagem: { id: 'm9' } });
    if (u.startsWith('/api/zro/pessoas')) return J(200, { agendas: true, pessoas: [
      { id: 'aaaaaaaa-0000-4000-8000-000000000002', arroba: 'pessoa.dois', nome: 'Pessoa Dois', foto: null, cidade: 'Natal/RN', funcoes: ['Editor'], nichos: [], bio: null, portfolio: null, agenda: {} },
      { id: 'aaaaaaaa-0000-4000-8000-000000000003', arroba: 'pessoa.tres', nome: 'Pessoa Três', foto: null, cidade: null, funcoes: ['Op. de câmera'], nichos: [], bio: null, portfolio: null, agenda: {} }] });
    if (u.startsWith('/api/zro/agenda') && met === 'GET') return J(200, { agenda: {} });
    return J(200, { recebidas: [], enviadas: [], posts: [], anuncios: [] });
  };
  zroPodeEnviar = () => true;
  ZRO_CONTA = { sub: '${SUB.toUpperCase()}', nome: 'Conta Teste', liberado: true };
  window.__estado = estado.servidor; window.__criada = estado.criada; window.__chat11 = estado.chat11;
}`;

(async () => {
  const f1 = construir(1, 'real-guilda-f1.html');
  const f0 = construir(0, 'real-guilda-f0.html');
  const FASES = require('../db/fase.js');
  t(FASES.FASE_LANCAMENTO === 1 && FASES.noAr('guilda', 1) && !FASES.noAr('venda_guilda', 1), 'o lançamento é a fase 1 (db/fase.js): guilda no ar, venda fora');

  const b = await require('./_navegador.js').abrir();
  const abrir = async (arquivo, viewport, tema) => {
    const ctx = await b.newContext({ viewport: viewport || { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    if (tema) await ctx.addInitScript(x => { try { localStorage.setItem('cf-app-tema', x) } catch (e) {} }, tema);
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push('ERR: ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' ')));
    p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto('file://' + arquivo, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2800);
    p.errs = errs;
    return p;
  };
  const ESTADO = { servidor: GUILDA(), criada: MINHA(), chat11: CHAT(11) };

  /* ---------------- fase 0 (só no teste): com o recurso fora do ar, a guilda não existe ---------------- */
  let p = await abrir(f0.arquivo);
  let m = await p.evaluate(async ({ prep, est }) => {
    await eval(prep)(est);
    const vis = e => !!e && !e.hidden && !e.closest('[hidden]') && e.getBoundingClientRect().width > 0;
    realCarregar();
    await new Promise(r => setTimeout(r, 500));
    show('guildas');
    const abas = [...document.querySelectorAll('[data-tab="guildas"]')].filter(vis).length;
    realHome();
    return { fase: FASE_LANCAMENTO, real: REAL, abas, tab: S.tab, menu: MENU.some(x => x[0] === 'guildas'), sd: !!document.getElementById('sd'),
      naFase: naFase('guildas'), home: [...document.querySelectorAll('[data-guilda]')].every(e => e.hidden),
      pedidos: window.__pedidos.filter(x => /guildas|sede/.test(x)) };
  }, { prep: PREPARAR, est: ESTADO });
  t(m.real && m.fase === 0, 'o site real de teste nasce com FASE_LANCAMENTO = 0');
  t(m.abas === 0 && !m.menu && !m.naFase && m.tab !== 'guildas' && !m.sd, 'fase 0: sem aba, sem item de menu, sem a Sede, e show("guildas") não abre (' + JSON.stringify({ abas: m.abas, tab: m.tab }) + ')');
  t(m.home, 'fase 0: a home não fala da guilda');
  t(m.pedidos.length === 0, 'fase 0: a página nunca fala com /api/zro/guildas nem com /api/zro/sede');
  t(p.errs.length === 0, 'fase 0: zero erro de console' + (p.errs[0] ? ' — ' + p.errs[0] : ''));
  await p.context().close();

  /* ---------------- fase 1: a home com a guilda e o painel ---------------- */
  p = await abrir(f1.arquivo);
  m = await p.evaluate(async ({ prep, est }) => {
    await eval(prep)(est);
    const vis = e => !!e && !e.hidden && !e.closest('[hidden]') && e.getBoundingClientRect().width > 0;
    realHome();
    const hb = document.getElementById('hb-guilda'), pc = document.querySelector('#h-praca [data-guilda]');
    const home = { bento: !!hb && !hb.hidden, praca: !!pc && !pc.hidden, txt: (hb ? hb.textContent : '') + (pc ? pc.textContent : '') };
    realCarregar();
    await new Promise(r => setTimeout(r, 500));
    show('meu');
    const abas = [...document.querySelectorAll('[data-tab="guildas"]')].filter(vis).length;
    show('guildas');
    await new Promise(r => setTimeout(r, 700));
    const sd = document.getElementById('sd');
    return { fase: FASE_LANCAMENTO, abas, menu: MENU.some(x => x[0] === 'guildas'), naFase: naFase('guildas'), salao: naFase('salao'),
      txt: sd ? sd.innerText : '', amb: sd && getComputedStyle(sd).getPropertyValue('--sd-amb').trim(), velho: vis(document.getElementById('gl-rank')) || vis(document.getElementById('gl-fundar')),
      convidar: !!document.getElementById('rg-convidar'), cartazes: document.querySelectorAll('#sd .sd-cartaz').length, h1: document.querySelector('#sd .sd-heroi h1').textContent,
      dinheiro: /R\$|VIP|ranking|pacote|comprar|\/mês/i.test(sd.innerText), aumentar: !!document.querySelector('[data-sd-lugares]'), home,
      pedidos: window.__pedidos.filter(x => /guildas|sede/.test(x)) };
  }, { prep: PREPARAR, est: ESTADO });
  t(m.home.bento && m.home.praca && /guilda/i.test(m.home.txt) && !/R\$|grátis|pago|preço/i.test(m.home.txt), 'fase 1: a home tem a guilda entre os destaques (o bento e a praça), sem preço');
  t(m.fase === 1 && m.naFase && m.menu && m.abas >= 1, 'fase 1: a aba Guilda aparece e está no menu (' + JSON.stringify({ abas: m.abas }) + ')');
  t(!m.salao, 'o salão do protótipo (chat e mural de mentira) continua fora do site real');
  t(m.h1 === 'Panelinha' && /Natal\/RN/.test(m.txt) && /Clipe e publicidade/.test(m.txt), 'o herói da Sede vem do servidor: nome, praça e o que a guilda roda');
  t(/2\.680/.test(m.txt) && /2\.800 XP/.test(m.txt) && /falta 1 job/.test(m.txt) && /9\s*semanas seguidas/.test(m.txt), 'a placa: nível, XP, quanto falta e a sequência de semanas');
  t(/2\s*de 15/.test(m.txt) && /15 da sede/.test(m.txt) && /1 convite/.test(m.txt), 'os lugares: o limite honesto (2 de 15, 15 da sede) e o convite aberto');
  t(!m.aumentar, 'sem "Aumentar lugares": nada de compra na Sede');
  t(/2\s*jobs juntos/.test(m.txt) && m.cartazes >= 2 && /Vítor Sales/.test(m.txt) && /saiu da guilda/.test(m.txt), 'a memória em pôsteres e os créditos (quem saiu continua, marcado)');
  t(/2 na sede agora/.test(m.txt) && /Cliente aprovou/.test(m.txt), 'quem está na sede agora e o chat ao vivo');
  t(m.amb.toUpperCase() === '#F062B8', 'a casa veste a paleta da guilda (Gel magenta, ' + m.amb + ')');
  t(!m.velho && m.convidar, 'sem ranking entre guildas; o dono vê Convidar');
  t(!m.dinheiro, 'nada de preço, pacote, VIP nem ranking no painel');
  t(m.pedidos[0] === 'GET /api/zro/guildas', 'a tela pede ao servidor');

  /* ---------------- o chat: poll com ETag, mensagem, call sheet ---------------- */
  m = await p.evaluate(async () => {
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    window.__pedidos.length = 0;
    sdIr('chat'); await esperar(600);
    const msgs = document.getElementById('sd-msgs');
    const r = { txt: msgs.innerText, men: [...msgs.querySelectorAll('.sd-men')].map(x => x.textContent), cs: !!msgs.querySelector('.sd-cs'), evento: msgs.querySelector('.sd-evento') && msgs.querySelector('.sd-evento').innerText,
      fixo: document.getElementById('sd-fixo').innerText, canais: [...document.querySelectorAll('#sd-lista .sd-cn')].map(x => x.innerText.replace(/\s+/g, ' ').trim()) };
    await sdPollChat(false); r.mesmas = msgs.querySelectorAll('[data-sd-msg]').length;
    window.__novo = true; await sdPollChat(false); window.__novo = false;
    r.novas = msgs.querySelectorAll('[data-sd-msg]').length; r.ultima = msgs.lastElementChild.previousElementSibling.innerText; r.dig = document.getElementById('sd-digit').innerText;
    r.inm = window.__inm.slice();
    const tx = document.getElementById('sd-txt'); tx.value = 'Chego às 5h40.'; tx.dispatchEvent(new Event('input'));
    document.getElementById('sd-env').click(); await esperar(300);
    document.querySelector('[data-sd-msg="m2"] [data-sd-resp="vou"]').click(); await esperar(300);
    r.ped = window.__pedidos.filter(x => x.startsWith('POST'));
    return r;
  });
  t(/leva o blimp/.test(m.txt) && m.men.join() === '@Conta', 'o chat mostra as mensagens do servidor, e a menção de quem é da guilda aparece marcada');
  t(m.cs && /06:00/.test(m.txt) && /Redinha/.test(m.txt) && /1 de 2 confirmou/.test(m.txt), 'o call sheet como anexo: chamada, locação, equipe e quem confirmou');
  t(/Job fechado/.test(m.evento || '') && /\+180 XP/.test(m.evento || ''), 'o job fechado vira evento na sala, com o XP');
  t(/Fixado/.test(m.fixo) && /06:00/.test(m.fixo), 'o fixado aparece no topo do canal');
  t(m.canais.some(c => /geral/.test(c)) && m.canais.some(c => /Maré Cheia/.test(c) && /1/.test(c)), 'a sala e o canal do job, com as não lidas');
  t(m.inm[0] === null && m.inm[1] === 'W/"e10"' && m.mesmas === 3, 'o poll manda If-None-Match; 304 não mexe em nada' + ' ' + JSON.stringify([m.inm, m.mesmas, m.novas, m.dig]));
  t(m.novas === 4 && /Chego às 5h40/.test(m.ultima) && /Pessoa digitando|Pessoa está digitando/.test(m.dig), 'o que chegou depois entra no fim, e quem digita aparece');
  t(m.ped.some(x => x === 'POST /api/zro/sede {"acao":"mensagem","canal":"' + SALA + '","texto":"Chego às 5h40."}'), 'mandar mensagem é pedido à sede (canal e texto, nada mais)');
  t(m.ped.some(x => x === 'POST /api/zro/sede {"acao":"responder","id":"m2","resposta":"vou"}'), 'confirmar o call sheet é pedido à sede');

  /* ---------------- quadro, memória, personalizar ---------------- */
  m = await p.evaluate(async () => {
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    window.__pedidos.length = 0;
    sdIr('mural'); await esperar(500);
    const r = { mural: document.getElementById('sd-mural').innerText, placa: document.querySelector('.sd-placa').innerText };
    document.querySelector('[data-sd-quero]').click(); await esperar(200);
    sdIr('memoria'); await esperar(500);
    r.mem = document.querySelector('#sd .sd-mbase').innerText;
    document.querySelectorAll('#sd-mprat .sd-cartaz')[1].click(); await esperar(300);
    r.mem2 = document.querySelector('#sd .sd-mficha').innerText;
    sdPersonalizar(); await esperar(200);
    document.querySelector('[data-sd-cor="jade"]').click(); await esperar(100);
    document.getElementById('sd-p-praca').value = 'Natal/RN';
    document.getElementById('sd-p-ok').click(); await esperar(400);
    r.ped = window.__pedidos.filter(x => x.startsWith('POST'));
    r.amb = getComputedStyle(document.getElementById('sd')).getPropertyValue('--sd-amb').trim();
    return r;
  });
  t(/Sábado é dia de Café Potengi/.test(m.mural) && /R\$ 450/.test(m.mural) && /Interesse\s*2/.test(m.mural) && /nível 7/.test(m.mural), 'o quadro vem do servidor: aviso, vaga (com a diária e o interesse) e o marco de nível');
  t(/Nível 7/.test(m.placa) && /Primeiro job/.test(m.placa) && /1 de 3/.test(m.placa) && /Nada disso mexe na busca/.test(m.placa), 'a placa: credenciais com progresso e a regra (nada mexe na busca)');
  t(/Clipe “Maré Cheia”/.test(m.mem) && /Vítor Sales/.test(m.mem) && /saiu da guilda/.test(m.mem) && /de fora da guilda/.test(m.mem), 'a memória: créditos do job, quem saiu, e o contratante de fora sem nome');
  t(/Conta Teste/.test(m.mem2) && /Redinha/.test(m.mem2), 'escolher o pôster troca os créditos e a ficha');
  t(m.ped.some(x => x === 'POST /api/zro/sede {"acao":"post_reagir","id":"p2","emoji":"quero","ligar":true}'), '"Quero" na vaga é pedido à sede');
  t(m.ped.some(x => /"acao":"personalizar","paleta":"jade","cor":null/.test(x) && /"praca":"Natal\/RN"/.test(x)), 'personalizar manda a paleta, a praça e o que roda');
  t(m.amb.toUpperCase() === '#3FD3B0', 'a sede repinta na cor nova');

  /* a conta da cor própria é a mesma do servidor (db/regras.js) */
  const cores = ['#777777', '#FFFF00', '#0000FF', '#12AB34', '#000000', '#FFFFFF', '#F062B8'];
  const naTela = await p.evaluate(cs => cs.map(c => sdPaleta('propria', c)), cores);
  t(cores.every((c, i) => JSON.stringify([naTela[i].d, naTela[i].l, naTela[i].ink]) === JSON.stringify([R.corPropria(c).d, R.corPropria(c).l, R.corPropria(c).ink])), 'a guarda de contraste da cor própria é a mesma na tela e no servidor');
  t(JSON.stringify(await p.evaluate(() => SD_PALETAS)) === JSON.stringify(Object.fromEntries(Object.entries(R.PALETAS))), 'as 5 paletas aprovadas são as mesmas na tela e no servidor');

  /* convidar por link e pelo @; tirar; cancelar; sair */
  m = await p.evaluate(async () => {
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    sdIr('painel'); await esperar(200);
    window.__pedidos.length = 0;
    document.getElementById('rg-convidar').click();
    document.getElementById('rg-c-link').click(); await esperar(300);
    const url = (document.getElementById('rg-c-url') || {}).value || '';
    const q = document.getElementById('rg-c-q'); q.value = '@pessoa.d'; q.dispatchEvent(new Event('input')); await esperar(300);
    const ach = [...document.querySelectorAll('#rg-c-lista .slm b')].map(x => x.textContent);
    const bt = document.querySelector('[data-rg-conv]'); if (bt) bt.click(); await esperar(300);
    const ped = window.__pedidos.slice();
    sdFecharFolha();
    window.confirm = () => true;
    sdMembros(); await esperar(100);
    const time = document.querySelectorAll('#rg-time .slm').length, tirar = document.querySelectorAll('[data-rg-tirar]').length;
    document.querySelector('[data-rg-tirar]').click(); await esperar(300);
    sdMembros(); await esperar(100);
    document.querySelector('[data-rg-cancelar]').click(); await esperar(300);
    return { url, ach, ped, time, tirar, todos: window.__pedidos.slice() };
  });
  t(/\?guilda=a{32}$/.test(m.url), 'convite por link: o servidor devolve o link e a tela o mostra');
  t(m.ach.join() === 'Pessoa Dois', 'convite pelo @: a busca acha pela comunidade da Absolute ZRO e não oferece quem já é da guilda (' + m.ach.join() + ')');
  t(m.ped.some(x => x === 'POST /api/zro/guildas {"acao":"convidar","para":"aaaaaaaa-0000-4000-8000-000000000002"}'), 'convidar pelo @ manda só o id da pessoa');
  t(m.time === 2 && m.tirar === 1, 'membros: o dono pode tirar os outros (não a si)');
  t(m.todos.some(x => x === 'POST /api/zro/guildas {"acao":"remover","sub":"' + UM + '"}') && m.todos.some(x => x === 'POST /api/zro/guildas {"acao":"cancelar","id":"c1"}'), 'tirar alguém e cancelar convite são pedidos ao servidor');

  m = await p.evaluate(async () => {
    window.confirm = () => true; window.__pedidos.length = 0;
    sdMembros(); await new Promise(r => setTimeout(r, 100));
    document.getElementById('rg-sair').click();
    await new Promise(r => setTimeout(r, 500));
    return { ped: window.__pedidos.slice(), txt: document.getElementById('sd').innerText, fundar: !!document.getElementById('rg-fundar') };
  });
  t(m.ped[0] === 'POST /api/zro/guildas {"acao":"sair"}' && /Abra a sede/i.test(m.txt) && m.fundar, 'sair é pedido ao servidor, e a tela volta à porta da sede com Fundar');

  /* fundar: GRÁTIS (01/11). A folha mostra só o limite honesto (15 lugares), sem preço, pacote nem pedido de plano */
  m = await p.evaluate(async () => {
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    window.__pedidos.length = 0; window.__aberto = undefined;
    document.getElementById('rg-fundar').click();
    document.getElementById('sd-f-ok').click();
    const erro1 = document.querySelector('.sd-veu .sd-erro').textContent;
    const passos = document.querySelector('.sd-veu .sd-passos').innerText;
    document.getElementById('sd-f-nome').value = 'Panelinha'; document.getElementById('sd-f-tag').value = 'pnl';
    document.getElementById('sd-f-ok').click(); await esperar(100);
    const folha = document.querySelector('.sd-veu').innerText;
    const pedir = !!document.getElementById('sd-f-pedir'), packs = document.querySelectorAll('.sd-veu [data-sd-pack]').length, conta = !!document.getElementById('sd-conta');
    document.getElementById('sd-f-fundar').click(); await esperar(600);
    sdLugaresFolha(); await esperar(100);
    return { erro1, passos, folha, pedir, packs, conta, aberto: window.__aberto, lugares: !!document.getElementById('sd-veu'),
      ped: window.__pedidos.filter(x => x.startsWith('POST')), txt: document.getElementById('sd').innerText };
  });
  t(/nome/i.test(m.erro1), 'fundar sem nome é recusado na tela');
  t(!/Pedir|Lugares/.test(m.passos) && /Abrir/.test(m.passos), 'os passos de fundar: nome e brasão, abrir (sem passo de compra)');
  t(/15/.test(m.folha) && /lugares/.test(m.folha) && /De graça/.test(m.folha) && !/R\$|14,90|34,90|189|\/mês|Pix|Cartão|Pedir|pacote/i.test(m.folha), 'a folha de fundar: grátis e o limite honesto (15 lugares), sem preço, pacote nem pedido');
  t(!m.pedir && m.packs === 0 && !m.conta && m.aberto === undefined, 'nenhum botão de compra, nenhum pacote, nenhuma conta, e nada abre na conta Absolute ZRO');
  t(m.ped[0] === 'POST /api/zro/guildas {"nome":"Panelinha","tag":"PNL","cor":"#F062B8","sobre":null}' && /Panelinha/.test(m.txt), 'fundar manda nome, tag, cor e sobre (nada de preço nem de dono vindo da tela) e a sede abre');
  t(!m.lugares, 'a folha de lugares pagos não abre (a venda está desligada)');

  /* convite recebido, e o link ?guilda= pergunta antes */
  m = await p.evaluate(async () => {
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    window.__estado = Object.assign({}, window.__estado, { minha: null, recebidos: [{ id: 'cv1', nome: 'Os do Fim', tag: 'FIM', cor: '#ff6b9d', de_nome: 'Dona Fim', expira_em: '2026-11-08T10:00:00Z' }] });
    REAL_GUILDA = null; realGuildaPintar(); await esperar(500);
    const txt = document.getElementById('sd').innerText;
    window.__pedidos.length = 0;
    document.querySelector('[data-rg-aceitar]').click(); await esperar(500);
    return { txt, ped: window.__pedidos.filter(x => x.startsWith('POST')) };
  });
  t(/Os do Fim/.test(m.txt) && /Dona Fim/.test(m.txt), 'o convite recebido aparece com o nome da guilda e de quem convidou');
  t(m.ped[0] === 'POST /api/zro/guildas {"acao":"aceitar","id":"cv1"}', 'aceitar manda só o id do convite');
  m = await p.evaluate(async () => {
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    window.__estado = Object.assign({}, window.__estado, { minha: null, recebidos: [] }); REAL_GUILDA = null;
    sessionStorage.setItem('cdf-guilda-token', 'b'.repeat(30));
    window.__pedidos.length = 0;
    await realGuildaCarregar(); rgConviteDoLink(); await esperar(500);
    const o = document.getElementById('sd-veu');
    const aberto = !!o, txt = o ? o.innerText : '';
    const antes = window.__pedidos.filter(x => /aceitar/.test(x)).length;
    document.getElementById('rg-l-ok').click(); await esperar(500);
    return { aberto, txt, antes, ped: window.__pedidos.filter(x => /aceitar/.test(x)) };
  });
  t(m.aberto && /Panelinha/.test(m.txt) && m.antes === 0, 'o link de convite mostra a guilda e pergunta; nada entra sem o toque');
  t(m.ped[0] === 'POST /api/zro/guildas {"acao":"aceitar","token":"' + 'b'.repeat(30) + '"}', 'aceitar pelo link manda o código');

  /* a busca não conhece guilda: mesma ordem com e sem guilda, nível, lugares e cor */
  m = await p.evaluate(async () => {
    const ordem = () => filtrar().map(c => c.id).join();
    const sem = ordem();
    REAL_GUILDA = Object.assign({}, window.__estado, { minha: window.__criada });
    REAL_GUILDA.minha.vagas.extra = 50; REAL_GUILDA.minha.nivel.atual = 30; REAL_GUILDA.minha.nivel.xp = 12000; REAL_GUILDA.minha.guilda.paleta = sdPaleta('propria', '#FF0000');
    const com = ordem();
    return { sem, com, fonte: filtrar.toString() + (typeof ordenar === 'function' ? ordenar.toString() : '') };
  });
  t(m.sem === m.com && m.sem.length > 0, 'a ordem da busca é idêntica com e sem guilda, nível, XP, lugares e cor');
  t(!/guilda|GUILDA|slots|espaco|sd[A-Z]|SD\./.test(m.fonte), 'filtrar() (e a ordenação) não conhecem guilda, XP nem espaço extra');
  t(p.errs.length === 0, 'fase 1: zero erro de console' + (p.errs[0] ? ' — ' + p.errs[0] : ''));
  await p.context().close();

  /* iPhone, escuro e claro: a guilda tem porta na barra de baixo, e nenhuma sala rola de lado */
  for (const tema of ['dark', 'light']) {
    p = await abrir(f1.arquivo, { width: 393, height: 852 }, tema);
    m = await p.evaluate(async ({ prep, est }) => {
      await eval(prep)(est);
      realCarregar(); await new Promise(r => setTimeout(r, 500));
      const vis = e => !!e && !e.hidden && !e.closest('[hidden]') && e.getBoundingClientRect().width > 0;
      show('meu'); await new Promise(r => setTimeout(r, 300));
      const barra = [...document.querySelectorAll('.bottombar .bt[data-tab="guildas"]')].filter(vis).length;
      show('guildas'); await new Promise(r => setTimeout(r, 600));
      const larg = {};
      for (const s of ['painel', 'chat', 'mural', 'memoria']) { sdIr(s); await new Promise(r => setTimeout(r, 500)); larg[s] = document.documentElement.scrollWidth }
      sdLugaresFolha(); await new Promise(r => setTimeout(r, 200)); larg.lugares = document.documentElement.scrollWidth;
      return { barra, larg, jan: innerWidth, claro: document.documentElement.classList.contains('app-light'), ink: getComputedStyle(document.getElementById('sd')).getPropertyValue('--sd-ink').trim() };
    }, { prep: PREPARAR, est: { servidor: GUILDA(), criada: MINHA(), chat11: CHAT(11) } });
    t(m.barra >= 1, tema + ': no iPhone a guilda tem porta na barra de baixo');
    t(Object.values(m.larg).every(x => x <= m.jan), tema + ': no iPhone nenhuma sala da sede rola de lado (' + JSON.stringify(m.larg) + ')');
    t(tema === 'light' ? m.claro && m.ink.toUpperCase() === '#1D1D1F' : !m.claro && m.ink.toUpperCase() === '#F5F5F7', tema + ': a sede veste o tema (' + m.ink + ')');
    t(p.errs.length === 0, tema + ' iPhone: zero erro de console' + (p.errs[0] ? ' — ' + p.errs[0] : ''));
    await p.context().close();
  }

  for (const f of ['real-guilda-f0.html', 'real-guilda-f1.html']) try { fs.unlinkSync(path.join(PUB, f)) } catch (e) {}
  console.log('GUILDA NO SITE REAL — A SEDE');
  ok.forEach(x => console.log('  ✓ ' + x));
  bad.forEach(x => console.log('  ✗ ' + x));
  console.log(ok.length + ' ok, ' + bad.length + ' falhas');
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
