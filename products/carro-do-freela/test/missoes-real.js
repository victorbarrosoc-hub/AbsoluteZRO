/* O QUADRO DE MISSÕES NO SITE REAL (0006, fase 2) — montar o job na Sede com gente da guilda, contra um servidor de
 * mentira (fetch trocado, como guilda-real.js). O servidor de verdade (banco, RLS, gatilhos) é provado no `test:banco`
 * (_missoes-testes.js). Esta suíte constrói o site real com a constante em 2 e em 1 e jura:
 *   - fase 1: nada de missão (nem faixa, nem barra, nem pedido);
 *   - "Montar job" liga o modo de escolha: a faixa da Sede vira a grade de rostos (sem a própria pessoa), a lista de
 *     membros ganha o toque, e a barra fixa embaixo conta os escolhidos (e some ao cancelar);
 *   - a folha do job pede o dia ao servidor (quem está livre), sugere os livres, e ao montar manda a missão à sede e
 *     UMA proposta por pessoa pelo POST /api/zro/propostas de sempre, com `missao` — sem valor, sem telefone;
 *   - o quadro mostra os cartazes com a rodar / rodando / feito e o estado de cada pessoa (vai / pendente / não vai);
 *     o dono troca quem não vai (os livres do dia primeiro) e desmonta; quem está pendente vê "Responder";
 *   - o selo do próximo job na lista de membros; a proposta da guilda na caixa de Propostas;
 *   - movimento: o cartaz prega e a vaga que mudou pulsa, e nada disso com "reduzir movimento";
 *   - no iPhone, claro e escuro, nada rola de lado. */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ok = [], bad = []; const t = (c, m) => (c ? ok : bad).push(m);
const RAIZ = path.resolve(__dirname, '..');
const PUB = path.join(RAIZ, 'public');

function construir(fase, nome) {
  execFileSync(process.execPath, [path.join(RAIZ, 'src/build.js'), '--real'], { cwd: RAIZ, stdio: 'pipe', env: Object.assign({}, process.env, { CDF_TESTE_FASE: fase === 1 ? '' : String(fase) }) });
  fs.writeFileSync(path.join(PUB, nome), fs.readFileSync(path.join(PUB, 'real.html'), 'utf8'));
  return path.join(PUB, nome);
}

const EU = 'eeeeeeee-0000-4000-8000-00000000000e';
const P = n => 'aaaaaaaa-0000-4000-8000-00000000001' + n;
const hoje = new Date(Date.now() - 3 * 3600e3);
const dia = n => new Date(hoje.getTime() + n * 864e5).toISOString().slice(0, 10);
const MEMBROS = [{ sub: EU, nome: 'Conta Teste', arroba: 'conta.teste', papel: 'dono', eu: true, online: true },
  { sub: P(1), nome: 'Lia Moura', arroba: 'lia.moura', papel: 'membro', eu: false, online: true },
  { sub: P(2), nome: 'Caio Bezerra', arroba: 'caio.bz', papel: 'membro', eu: false, online: false },
  { sub: P(3), nome: 'Duda Freitas', arroba: 'duda.f', papel: 'membro', eu: false, online: false },
  { sub: P(4), nome: 'Rafa Lins', arroba: 'rafa.lins', papel: 'membro', eu: false, online: false },
  { sub: P(5), nome: 'Téo Galvão', arroba: 'teo.g', papel: 'membro', eu: false, online: false },
  { sub: P(6), nome: 'Nina Prado', arroba: 'nina.prado', papel: 'membro', eu: false, online: false }];
const V = (sub, nome, funcao, estado, enviada = true) => ({ sub, nome, funcao, estado, enviada, eu: sub === EU });
const conta = eq => ({ vai: eq.filter(x => x.estado === 'vai').length, pendente: eq.filter(x => x.estado === 'pendente').length, nao_vai: eq.filter(x => x.estado === 'nao_vai').length });
const M = (n, titulo, d, estado, dono, eq, extra) => Object.assign({ id: 'mmmmmmmm-0000-4000-8000-00000000000' + n, titulo, contratante: 'casa', cliente: null, dia: d, ini: '06:00', fim: '18:00', local: 'Redinha',
  dono: { sub: dono.sub, nome: dono.nome }, eu_dono: dono.sub === EU, canal: 'cccccccc-0000-4000-8000-00000000000' + n, chamada: null, estado, equipe: eq, conta: conta(eq), criado_em: '2026-10-31T10:00:00Z' }, extra || {});
const MISSOES = () => [
  M(1, 'Campanha Café Potengi', dia(0), 'rodando', MEMBROS[4], [V(EU, 'Conta Teste', 'Direção de fotografia', 'vai'), V(P(1), 'Lia Moura', 'Op. de gimbal', 'vai')]),
  M(2, 'Clipe Maré Cheia', dia(6), 'a_rodar', MEMBROS[0], [V(P(1), 'Lia Moura', 'Op. de câmera', 'vai'), V(P(2), 'Caio Bezerra', 'Gaffer', 'pendente'), V(P(3), 'Duda Freitas', 'Op. de drone', 'nao_vai'), V(P(4), 'Rafa Lins', null, 'pendente', false)],
    { contratante: 'fora', cliente: 'Selo Potengi' }),
  M(3, 'Doc das dunas', dia(12), 'a_rodar', MEMBROS[3], [V(EU, 'Conta Teste', 'Op. de câmera', 'pendente')]),
  M(4, 'Casamento na Redinha', dia(-3), 'feito', MEMBROS[0], [V(P(4), 'Rafa Lins', 'Fotógrafo', 'vai')]),
];
const PROX = { [EU]: { missao: 'x', titulo: 'Campanha Café Potengi', dia: dia(0), estado: 'vai' }, [P(2)]: { missao: 'x', titulo: 'Clipe Maré Cheia', dia: dia(6), estado: 'pendente' } };
const MINHA = () => ({
  guilda: { id: 'g1', nome: 'Panelinha', tag: 'PNL', cor: '#F062B8', sobre: null, praca: null, criada_em: '2026-03-01T10:00:00Z', paleta: { id: 'gel-magenta', nome: 'Gel magenta', d: '#F062B8', l: '#B0307A', ink: '#1F0716' }, cor_propria: null, logo: null },
  eu: { sub: EU, papel: 'dono' }, membros: MEMBROS,
  nivel: { atual: 2, xp: 500, de: 400, ate: 800, por_nivel: 400, faltam: 3, jobs: 2 }, vagas: { base: 15, bonus_de_nivel: 0, extra: 0, total: 15, ocupadas: 5, livres: 10 }, beneficios: [],
  placa: { sequencia: 1, semanas: Array(12).fill(false), credenciais: [], semana: [], temporada: { xp: 500, jobs: 2 } },
  memoria: { jobs: 0, contratantes: 0, desde: '2026-03-01T10:00:00Z', cartazes: [] }, jobs: [], agora: { n: 1, subs: [EU] },
  chat: { sala: 'cccccccc-0000-4000-8000-000000000000', nao_lidas: 0, digitando: [], canais: [{ id: 'cccccccc-0000-4000-8000-000000000000', tipo: 'sala', nome: 'geral', nao_lidas: 0 }], ultimas: [] },
  convites: [], missoes: MISSOES(), proximos: PROX,
});
const DIA = { [EU]: 'no_job', [P(1)]: 'livre', [P(2)]: 'ocupado', [P(3)]: 'livre', [P(4)]: 'sem_agenda', [P(5)]: 'sem_agenda', [P(6)]: 'livre' };

const PREPARAR = `async (estado) => {
  window.__pedidos = [];
  window.fetch = async (u, o) => {
    const met = (o && o.method) || 'GET';
    window.__pedidos.push(met + ' ' + u + (o && o.body ? ' ' + o.body : ''));
    const J = (s, j) => new Response(JSON.stringify(j), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (u === '/api/zro/guildas') return J(200, { fase: 2, pode_fundar: false, pedir_url: 'https://absolutezro.com/perfil/plano', pacotes: [], recebidos: [], carencia_ate: null, minha: window.__minha });
    if (u.startsWith('/api/zro/sede?ver=dia')) return J(200, { dia: '', pessoas: Object.entries(window.__dia).map(([sub, estado]) => ({ sub, estado })) });
    if (u.startsWith('/api/zro/sede?ver=')) return J(200, { posts: [], cartazes: [] });
    if (u.startsWith('/api/zro/sede?canal=')) return J(200, { v: 1, canal: { id: 'x', tipo: 'job', nome: 'job' }, mensagens: [], completo: true, digitando: [], agora: { n: 1, subs: [] }, fixadas: [], canais: [] });
    if (u === '/api/zro/sede') { const c = JSON.parse(o.body);
      if (c.acao === 'missao') return J(201, { missao: { id: 'mmmmmmmm-0000-4000-8000-000000000009', canal: 'cccccccc-0000-4000-8000-000000000009', chamada: c.chamada ? 'k1' : null } });
      return new Response(null, { status: 204 }); }
    if (u === '/api/zro/propostas' && met === 'POST') return J(201, { proposta: { id: 'pp' } });
    if (u === '/api/zro/propostas') return J(200, { recebidas: window.__recebidas || [], enviadas: [] });
    if (u.startsWith('/api/zro/pessoas')) return J(200, { agendas: true, pessoas: [] });
    if (u.startsWith('/api/zro/agenda')) return J(200, { agenda: {} });
    return J(200, { recebidas: [], enviadas: [], posts: [], anuncios: [] });
  };
  window.confirm = () => true;
  zroPodeEnviar = () => true;
  ZRO_CONTA = { sub: '${EU.toUpperCase()}', nome: 'Conta Teste', liberado: true };
  window.__minha = estado.minha; window.__dia = estado.dia;
}`;
const esperar = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const f2 = construir(2, 'real-missoes-f2.html');
  const f1 = construir(1, 'real-missoes-f1.html');
  const b = await require('./_navegador.js').abrir();
  const abrir = async (arquivo, viewport, tema, movimento) => {
    const ctx = await b.newContext({ viewport: viewport || { width: 1280, height: 900 }, reducedMotion: movimento ? 'no-preference' : 'reduce' });
    await ctx.addInitScript(x => { try { if (x) localStorage.setItem('cf-app-tema', x) } catch (e) {} }, tema || null);
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push('ERR: ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' ')));
    p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto('file://' + arquivo, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2800);
    p.errs = errs;
    await p.evaluate(async ({ prep, est }) => { await eval(prep)(est); realCarregar(); await new Promise(r => setTimeout(r, 400)) }, { prep: PREPARAR, est: { minha: MINHA(), dia: DIA } });
    return p;
  };

  /* ---------------- fase 1: nada de missão ---------------- */
  let p = await abrir(f1);
  let m = await p.evaluate(async () => {
    show('guildas'); await new Promise(r => setTimeout(r, 500));
    return { fase: FASE_LANCAMENTO, faixa: !!document.querySelector('.mq-faixa,#mq-barra,.mq-c'), ped: window.__pedidos.filter(x => /guildas|sede|missao/.test(x)) };
  });
  t(m.fase === 1 && !m.faixa && m.ped.length === 0, 'fase 1: nem faixa, nem barra, nem cartaz, e nenhum pedido de guilda ou missão');
  t(p.errs.length === 0, 'fase 1: zero erro de console' + (p.errs[0] ? ' — ' + p.errs[0] : ''));
  await p.context().close();

  /* ---------------- fase 2: a faixa na Sede e o modo Montar job ---------------- */
  p = await abrir(f2);
  m = await p.evaluate(async () => {
    show('guildas'); await new Promise(r => setTimeout(r, 700));
    const f = document.getElementById('mq-faixa');
    const r = { faixa: f && f.innerText, mini: f ? f.querySelectorAll('.mq-c').length : 0, feitoNaFaixa: f ? !!f.querySelector('.mq-c[data-e="feito"]') : true,
      salas: [...document.querySelectorAll('.sd-salas button')].map(x => x.innerText.replace(/\s+/g, ' ').trim()) };
    document.querySelector('[data-mq-montar]').click(); await new Promise(r => setTimeout(r, 300));
    const g = document.getElementById('mq-faixa'), bar = document.getElementById('mq-barra');
    r.montar = g.hasAttribute('data-montar'); r.rostos = [...g.querySelectorAll('[data-sd-escolher]')].map(x => x.innerText.split('\n')[0]);
    r.bar0 = bar && bar.innerText.replace(/\s+/g, ' ').trim(); r.ok0 = document.getElementById('mq-b-ok').disabled;
    g.querySelector('[data-sd-escolher="aaaaaaaa-0000-4000-8000-000000000011"]').click();
    g.querySelector('[data-sd-escolher="aaaaaaaa-0000-4000-8000-000000000012"]').click();
    r.bar2 = document.getElementById('mq-barra').innerText.replace(/\s+/g, ' ').trim();
    r.press = [...g.querySelectorAll('[aria-pressed="true"]')].length;
    /* a lista de membros: o mesmo modo, o mesmo toque, e o selo do próximo job */
    sdMembros(); await new Promise(r => setTimeout(r, 200));
    const lista = document.getElementById('rg-time');
    r.mmontar = document.getElementById('mq-m-montar').getAttribute('aria-pressed'); r.esc = lista.querySelectorAll('.mq-esc').length;
    r.escOn = lista.querySelectorAll('.mq-esc[aria-pressed="true"]').length; r.barVisivel = !document.getElementById('mq-barra').hidden;
    r.zbar = +getComputedStyle(document.getElementById('mq-barra')).zIndex; r.zveu = +getComputedStyle(document.getElementById('sd-veu')).zIndex;
    lista.querySelector('[data-sd-escolher="aaaaaaaa-0000-4000-8000-000000000013"]').click();
    r.bar3 = document.getElementById('mq-barra').innerText.replace(/\s+/g, ' ').trim();
    r.selos = [...lista.querySelectorAll('.mq-prox')].map(x => x.innerText.trim());
    lista.querySelector('[data-sd-escolher="aaaaaaaa-0000-4000-8000-000000000013"]').click();
    sdFecharFolha();
    return r;
  });
  t(m.salas.some(x => /^Missões/.test(x)) && m.salas.length === 5, 'a Sede ganha a sala Missões (' + m.salas.join(' | ') + ')');
  t(m.salas.some(x => /^Missões 1$/.test(x)), 'a sala Missões mostra quantos cartazes esperam a minha resposta');
  t(/Quadro de missões/.test(m.faixa) && m.mini >= 1 && m.mini <= 3 && !m.feitoNaFaixa, 'a faixa da Sede: até 3 cartazes do que vem, sem o que já foi feito');
  t(m.montar && m.rostos.length === 6 && !m.rostos.includes('Conta'), '"Montar job" vira a faixa na grade de rostos, sem a própria pessoa (' + m.rostos.join(',') + ')');
  t(/0 escolhidos/.test(m.bar0) && m.ok0, 'a barra fixa nasce com 0 escolhidos e a ação desligada');
  t(/2 escolhidos/.test(m.bar2) && m.press === 2, 'tocar marca a pessoa e a barra conta (' + m.bar2 + ')');
  t(m.mmontar === 'true' && m.esc === 6 && m.escOn === 2 && m.barVisivel && m.zbar > m.zveu, 'na lista de membros o mesmo modo: o toque de escolher, as marcas de antes, e a barra por cima da folha');
  t(/3 escolhidos/.test(m.bar3), 'escolher na lista conta na mesma barra');
  t(m.selos.some(x => /Campanha Café Potengi/.test(x)) && m.selos.some(x => /Clipe Maré Cheia/.test(x)), 'o selo do próximo job de cada pessoa na lista de membros (' + m.selos.join(' | ') + ')');

  /* ---------------- a folha do job e o montar ---------------- */
  m = await p.evaluate(async (diaJob) => {
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    window.__pedidos.length = 0;
    document.getElementById('mq-b-ok').click(); await esperar(200);
    const r = { barEsc: document.getElementById('mq-barra').hidden, eq: document.querySelectorAll('#mq-f-eq .mq-er').length };
    const s = (id, val) => { const e = document.getElementById(id); e.value = val; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')) };
    document.getElementById('mq-f-ok').click(); r.erro1 = document.querySelector('.sd-veu .sd-erro').textContent;
    s('mq-f-tit', 'Clipe Maré Cheia 2'); s('mq-f-dia', diaJob); await esperar(300);
    r.ag = [...document.querySelectorAll('#mq-f-eq .mq-ag')].map(x => x.textContent);
    r.sug = [...document.querySelectorAll('#mq-f-eq [data-mq-add]')].map(x => x.textContent.trim());
    document.querySelector('[data-mq-add]').click(); await esperar(100);
    r.eq2 = document.querySelectorAll('#mq-f-eq .mq-er').length;
    document.querySelector('[data-mq-tirar="aaaaaaaa-0000-4000-8000-000000000013"]').click(); await esperar(100);
    document.querySelector('[data-mq-contr="fora"]').click(); s('mq-f-cli', 'Selo Potengi');
    s('mq-f-ini', '05:30'); s('mq-f-fim', '14:00'); s('mq-f-local', 'Forte dos Reis Magos');
    const f = document.querySelectorAll('[data-mq-fun]'); f[0].value = 'Op. de câmera'; f[0].dispatchEvent(new Event('change'));
    const cs = document.getElementById('mq-f-cs'); cs.checked = true; cs.dispatchEvent(new Event('change'));
    r.hora = document.getElementById('mq-f-hora').value;
    r.prev = document.getElementById('mq-f-prev').innerText;
    r.botao = document.getElementById('mq-f-ok').textContent;
    document.getElementById('mq-f-ok').click(); await esperar(900);
    r.ped = window.__pedidos.filter(x => x.startsWith('POST')); r.get = window.__pedidos.filter(x => /ver=dia/.test(x));
    r.tela = SD.tela; r.bar = !!document.getElementById('mq-barra'); r.veu = !!document.getElementById('sd-veu'); r.montar = SD.montar;
    return r;
  }, dia(5));
  t(m.barEsc && m.eq === 2, 'a folha abre com os 2 escolhidos, e a barra sai da frente');
  t(/título/i.test(m.erro1), 'sem título a folha não manda nada');
  t(m.get.length >= 1 && m.ag.join() === 'livre no dia,ocupado no dia', 'escolhido o dia, a folha pergunta à sede quem está livre e mostra a agenda de cada um (' + m.ag.join() + ')');
  t(m.sug.length === 2 && /Duda/.test(m.sug[0]) && /Nina/.test(m.sug[1]), 'sugere quem da guilda está livre nesse dia (e só quem divulgou a agenda: ' + m.sug.join(',') + ')');
  t(m.eq2 === 3, 'a sugestão entra na equipe com um toque');
  t(m.hora === '05:30', 'o call sheet nasce na hora do início');
  t(/Clipe Maré Cheia 2/.test(m.prev) && /Selo Potengi/.test(m.prev) && /Op\. de câmera/.test(m.prev), 'a prévia do cartaz acompanha a folha');
  t(m.botao === 'Mandar 2 propostas', 'o botão diz quantas propostas vão');
  const missao = m.ped.find(x => x.startsWith('POST /api/zro/sede '));
  const corpo = missao && JSON.parse(missao.slice('POST /api/zro/sede '.length));
  t(corpo && JSON.stringify(corpo) === JSON.stringify({ acao: 'missao', titulo: 'Clipe Maré Cheia 2', contratante: 'fora', dia: dia(5),
    equipe: [{ sub: P(1), funcao: 'Op. de câmera' }, { sub: P(2) }], cliente: 'Selo Potengi', ini: '05:30', fim: '14:00', local: 'Forte dos Reis Magos', chamada: { hora: '05:30' } }),
  'montar manda à sede título, contratante, dia, horário, local, a função de cada um e o call sheet — nada de valor (' + (missao || 'nada') + ')');
  const props = m.ped.filter(x => x.startsWith('POST /api/zro/propostas'));
  t(props.length === 2 && props.every(x => /"missao":"mmmmmmmm-0000-4000-8000-000000000009"/.test(x) && /"mensagem":"Job da guilda Panelinha: Clipe Maré Cheia 2"/.test(x) && !/valor|dia|local/.test(x.replace(/"mensagem":"[^"]*"/, ''))),
    'e UMA proposta por pessoa pelo POST /api/zro/propostas de sempre, com a marca `missao` (dia e local vêm da missão)');
  t(m.ped.indexOf(missao) === 0, 'a missão vem antes das propostas');
  t(m.tela === 'missoes' && !m.bar && !m.veu && m.montar === null, 'montado: a folha fecha, a barra some e o quadro abre');

  /* ---------------- o quadro ---------------- */
  m = await p.evaluate(async () => {
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    sdIr('missoes'); await esperar(300);
    const q = document.getElementById('mq-quadro');
    const c2 = q.querySelector('[data-mq="mmmmmmmm-0000-4000-8000-000000000002"]');
    const r = { n: q.querySelectorAll('.mq-c').length, est: [...q.querySelectorAll('.mq-est')].map(x => x.textContent.trim()),
      vagas: [...c2.querySelectorAll('.mq-v')].map(x => x.dataset.e), c2: c2.innerText, trocar: c2.querySelectorAll('[data-mq-trocar]').length, mandar: c2.querySelectorAll('[data-mq-mandar]').length,
      resp: !!q.querySelector('[data-mq="mmmmmmmm-0000-4000-8000-000000000003"] [data-mq-resp]'), desmontar: q.querySelectorAll('[data-mq-desmontar]').length,
      novo: q.querySelectorAll('[data-novo],[data-mudou]').length, preco: /R\$|diária|valor/i.test(q.innerText) };
    document.querySelector('[data-mq-filtro="feito"]').click(); await esperar(200);
    r.feito = [...document.querySelectorAll('#mq-quadro .mq-c')].map(x => x.querySelector('h3').textContent);
    document.querySelector('[data-mq-filtro="tudo"]').click(); await esperar(200);
    /* trocar quem não vai: os livres do dia primeiro */
    window.__pedidos.length = 0;
    document.querySelector('[data-mq-trocar]').click(); await esperar(400);
    r.cand = [...document.querySelectorAll('#mq-t-lista .slm')].map(x => x.innerText.replace(/\s+/g, ' ').trim());
    document.querySelector('[data-mq-entra]').click(); await esperar(500);
    r.ped = window.__pedidos.filter(x => x.startsWith('POST'));
    window.__pedidos.length = 0;
    document.querySelector('[data-mq-mandar]').click(); await esperar(400);
    r.mandou = window.__pedidos.filter(x => x.startsWith('POST'));
    window.__pedidos.length = 0;
    document.querySelector('[data-mq-desmontar]').click(); await esperar(400);
    r.desm = window.__pedidos.filter(x => x.startsWith('POST'));
    return r;
  });
  t(m.n === 4 && ['Rodando', 'A rodar', 'Feito'].every(e => m.est.includes(e)), 'o quadro: os 4 cartazes com a rodar, rodando e feito (' + m.est.join(',') + ')');
  t(m.vagas.join() === 'vai,pendente,nao_vai,pendente' && /De fora · Selo Potengi/.test(m.c2) && /1 vai · 2 pendentes · 1 não vai/.test(m.c2), 'cada cartaz com a equipe e o estado de cada pessoa (vai / pendente / não vai) e a conta');
  t(m.trocar === 1 && m.mandar === 1 && m.desmontar === 1, 'o dono do job: Trocar quem não vai, Mandar a proposta que faltou, Desmontar (só nos seus e só no que não foi feito)');
  t(m.resp, 'quem está pendente vê Responder (a caixa de Propostas de sempre)');
  t(!m.preco, 'nada de preço no quadro');
  t(m.novo === 0, 'com "reduzir movimento" nenhum cartaz prega nem pulsa');
  t(m.feito.join() === 'Casamento na Redinha', 'o filtro Feito mostra só o que já foi');
  t(/Nina Prado livre no dia/.test(m.cand[0]) && /Téo Galvão agenda não divulgada/.test(m.cand[1]) && m.cand.length === 2, 'trocar sugere os livres do dia primeiro, entre quem ainda não está no job (' + m.cand.join(' | ') + ')');
  t(/"acao":"missao_trocar"/.test(m.ped[0]) && /"sai":"aaaaaaaa-0000-4000-8000-000000000013"/.test(m.ped[0]) && /"funcao":"Op. de drone"/.test(m.ped[0]) && /^POST \/api\/zro\/propostas .*"missao":"mmmmmmmm-0000-4000-8000-000000000002"/.test(m.ped[1] || ''),
    'trocar: a vaga passa a quem entrou, com a função, e a proposta vai pela caixa de sempre');
  t(m.mandou.length === 1 && /"para":"aaaaaaaa-0000-4000-8000-000000000014","missao":"mmmmmmmm-0000-4000-8000-000000000002"/.test(m.mandou[0]), 'Mandar refaz a proposta que não foi');
  t(m.desm[0] === 'POST /api/zro/sede {"acao":"missao_cancelar","missao":"mmmmmmmm-0000-4000-8000-000000000002"}', 'desmontar é pedido à sede (que cancela as propostas)');

  /* ---------------- a proposta da guilda na caixa de Propostas ---------------- */
  m = await p.evaluate(async (d) => {
    window.__recebidas = [{ id: 'p1', recebida: true, de: 'aaaaaaaa-0000-4000-8000-000000000013', para: 'x', de_nome: 'Duda Freitas', tipo: 'job', anuncio: null, dia: d, ini: '04:50', fim: null, funcao: 'Op. de câmera',
      local: 'Genipabu', mensagem: 'Job da guilda Panelinha: Doc das dunas', valor_cents: null, estado: 'nova', motivo: null, criado_em: '2026-10-31T10:00:00Z',
      guilda: { missao: 'mmmmmmmm-0000-4000-8000-000000000003', titulo: 'Doc das dunas', nome: 'Panelinha', tag: 'PNL', equipe: 2 } },
      { id: 'p2', recebida: true, de: 'x', para: 'x', de_nome: 'Outra Pessoa', tipo: 'job', anuncio: null, dia: d, ini: null, fim: null, funcao: 'Editor', local: null, mensagem: null, valor_cents: null, estado: 'nova', motivo: null, criado_em: '2026-10-31T10:00:00Z' }];
    MODO = 'freela'; try { aplicarModo() } catch (e) {}
    show('propostas'); realPropostas(); await new Promise(r => setTimeout(r, 400));
    const fl = [...document.querySelectorAll('#pp-lista .prop [data-gui]')];
    const r = { n: fl.length, txt: fl[0] && fl[0].innerText, aceitar: !!(fl[0] && fl[0].closest('.prop').querySelector('[data-ac]')) };
    window.__pedidos.length = 0;
    fl[0].closest('.prop').querySelector('[data-ac]').click(); await new Promise(r => setTimeout(r, 300));
    r.patch = window.__pedidos.filter(x => x.startsWith('PATCH'));
    document.querySelector('[data-pp-quadro]').click(); await new Promise(r => setTimeout(r, 500));
    r.tab = S.tab; r.tela = SD.tela;
    return r;
  }, dia(12));
  t(m.n === 1 && /Job da guilda Panelinha · Doc das dunas · 2 na equipe/.test(m.txt), 'a proposta da guilda chega na caixa de sempre com a marca da guilda (e a de fora, sem marca)');
  t(m.aceitar && m.patch[0] === 'PATCH /api/zro/propostas?id=p1 {"estado":"aceita","motivo":null}', 'aceitar é o mesmo PATCH de sempre');
  t(m.tab === 'guildas' && m.tela === 'missoes', '"Ver a equipe" leva ao quadro de missões');
  t(p.errs.length === 0, 'fase 2: zero erro de console' + (p.errs[0] ? ' — ' + p.errs[0] : ''));
  await p.context().close();

  /* ---------------- movimento: o cartaz prega, a vaga que mudou pulsa ---------------- */
  p = await abrir(f2, null, null, true);
  m = await p.evaluate(async () => {
    show('guildas'); await new Promise(r => setTimeout(r, 600));
    SD.missaoNova = 'mmmmmmmm-0000-4000-8000-000000000002'; sdIr('missoes'); await new Promise(r => setTimeout(r, 200));
    const novo = document.querySelector('[data-mq="mmmmmmmm-0000-4000-8000-000000000002"][data-novo]');
    const anim = novo && getComputedStyle(novo).animationName;
    window.__minha.missoes[1].equipe[1].estado = 'vai';
    await realGuildaCarregar(); sdPintar(false); await new Promise(r => setTimeout(r, 100));
    const mudou = [...document.querySelectorAll('[data-mudou]')];
    return { anim, mudou: mudou.length, animv: mudou[0] && getComputedStyle(mudou[0]).animationName, e: mudou[0] && mudou[0].dataset.e };
  });
  t(m.anim === 'mq-pregar', 'o cartaz novo "prega" no quadro (' + m.anim + ')');
  t(m.mudou === 1 && m.animv === 'mq-troca' && m.e === 'vai', 'a pessoa que mudou de estado pulsa uma vez, e só ela');
  await p.context().close();

  /* ---------------- iPhone, claro e escuro ---------------- */
  for (const tema of ['dark', 'light']) {
    p = await abrir(f2, { width: 393, height: 852 }, tema);
    m = await p.evaluate(async () => {
      const esperar = ms => new Promise(r => setTimeout(r, ms));
      show('guildas'); await esperar(500);
      const larg = {};
      sdIr('missoes'); await esperar(400); larg.missoes = document.documentElement.scrollWidth;
      sdMontar(true); await esperar(300); sdEscolher('aaaaaaaa-0000-4000-8000-000000000011'); larg.montar = document.documentElement.scrollWidth;
      const bar = document.getElementById('mq-barra').getBoundingClientRect();
      const baixo = document.getElementById('bottombar').getBoundingClientRect();
      sdMissaoFolha(); await esperar(300); larg.folha = document.documentElement.scrollWidth;
      const folha = document.querySelector('.sd-folha').getBoundingClientRect();
      sdFecharFolha(); sdMontar(false); await esperar(300);
      return { larg, jan: innerWidth, barDentro: bar.left >= 0 && bar.right <= innerWidth, barAcima: bar.bottom <= baixo.top + 1, folhaLarg: folha.width, sobrou: !!document.getElementById('mq-barra') };
    });
    t(Object.values(m.larg).every(x => x <= m.jan), tema + ': no iPhone nada rola de lado (' + JSON.stringify(m.larg) + ')');
    t(m.barDentro && m.barAcima, tema + ': a barra de Montar job cabe na tela e fica acima da barra de baixo');
    t(m.folhaLarg <= m.jan && !m.sobrou, tema + ': a folha do job é folha de baixo, e cancelar tira a barra');
    t(p.errs.length === 0, tema + ' iPhone: zero erro de console' + (p.errs[0] ? ' — ' + p.errs[0] : ''));
    await p.context().close();
  }

  for (const f of ['real-missoes-f1.html', 'real-missoes-f2.html']) try { fs.unlinkSync(path.join(PUB, f)) } catch (e) {}
  console.log('O QUADRO DE MISSÕES NO SITE REAL');
  ok.forEach(x => console.log('  ✓ ' + x));
  bad.forEach(x => console.log('  ✗ ' + x));
  console.log(ok.length + ' ok, ' + bad.length + ' falhas');
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
