/* A GUILDA NO SITE REAL (fase 2) — a tela contra /api/zro/guildas (fetch trocado, como na suíte site-real).
 *
 * A fase do lançamento é UMA constante (db/fase.js → FASE_LANCAMENTO, escrita no site pelo build). Esta suíte constrói
 * o site real duas vezes, com a constante em 2 e em 1 (CDF_TESTE_FASE só existe para isto), e jura:
 *   - fase 1: a guilda não existe (nem aba, nem menu, nem show(), nem um pedido ao servidor);
 *   - fase 2: a aba aparece, a tela lista a minha guilda do servidor, fundar/convidar/aceitar/sair/tirar viram pedidos;
 *     não há ranking entre guildas nem cobrança; o link ?guilda= pergunta antes de entrar;
 *   - a ordem da busca (filtrar) é a mesma com e sem guilda, nível e espaço extra, e o código de filtrar() não a conhece. */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ok = [], bad = []; const t = (c, m) => (c ? ok : bad).push(m);
const RAIZ = path.resolve(__dirname, '..');
const PUB = path.join(RAIZ, 'public');

/** constrói o site real com a fase pedida e guarda a página sob outro nome (a suíte site-real usa public/real.html) */
function construir(fase, nome) {
  execFileSync(process.execPath, [path.join(RAIZ, 'src/build.js'), '--real'], { cwd: RAIZ, stdio: 'pipe', env: Object.assign({}, process.env, { CDF_TESTE_FASE: fase === 1 ? '' : String(fase) }) });
  const html = fs.readFileSync(path.join(PUB, 'real.html'), 'utf8');
  const js = (html.match(/m\/app\.[0-9a-f]{10}\.js/) || [])[0];
  fs.writeFileSync(path.join(PUB, nome), html);
  return { arquivo: path.join(PUB, nome), js: fs.readFileSync(path.join(PUB, js), 'utf8') };
}

const SUB = 'eeeeeeee-0000-4000-8000-00000000000e';
const GUILDA = (extra = {}) => Object.assign({
  fase: 2, recebidos: [], carencia_ate: null,
  minha: {
    guilda: { id: 'g1', nome: 'Panelinha', tag: 'PNL', cor: '#7c9cff', sobre: 'Clipe e publicidade' }, eu: { sub: SUB.toLowerCase(), papel: 'dono' },
    membros: [{ sub: SUB.toLowerCase(), nome: 'Conta Teste', arroba: 'conta.teste', foto: null, papel: 'dono', eu: true },
      { sub: 'aaaaaaaa-0000-4000-8000-000000000001', nome: 'Pessoa Um', arroba: 'pessoa.um', foto: null, papel: 'membro', eu: false }],
    nivel: { atual: 2, jobs: 4, por_nivel: 3, faltam: 2 },
    vagas: { base: 15, bonus_de_nivel: 0, extra: 5, total: 20, ocupadas: 2, livres: 18 },
    beneficios: [{ nivel: 10, codigo: 'vagas_extras', titulo: '+2 vagas de membro', detalhe: 'o teto sobe', dados: { vagas: 2 }, ativo: true, conquistado: false },
      { nivel: 15, codigo: 'taxa_da_casa', titulo: 'Taxa de 5% em job da casa', detalhe: 'só vale com pagamento', dados: { taxa_bps: 500, cobra: false }, ativo: false, conquistado: false }],
    jobs: [{ id: 'j1', dia: '2026-11-12', funcao: 'Op. de câmera', membros: ['Pessoa Um'], fechado_em: '2026-11-01T10:00:00Z' }],
    convites: [{ id: 'c1', tipo: 'link', para: null, expira_em: '2026-11-08T10:00:00Z' }],
  },
}, extra);

/** liga a página à "conta liberada" e a um servidor de mentira; devolve o que ela pediu */
const PREPARAR = `async (estado) => {
  window.__pedidos = [];
  window.fetch = async (u, o) => {
    const met = (o && o.method) || 'GET';
    window.__pedidos.push(met + ' ' + u + (o && o.body ? ' ' + o.body : ''));
    const J = (s, j) => new Response(JSON.stringify(j), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (u === '/api/zro/guildas') {
      if (met === 'GET') return J(200, window.__estado);
      const c = JSON.parse(o.body);
      if (!c.acao) { window.__estado = Object.assign({}, window.__estado, { minha: window.__criada }); return J(201, { guilda: { id: 'g1' } }) }
      if (c.acao === 'convidar' && !c.para) return J(201, { convite: { id: 'c9', tipo: 'link' }, link: 'http://x/?guilda=' + 'a'.repeat(32) });
      if (c.acao === 'convidar') return J(201, { convite: { id: 'c8', tipo: 'arroba' } });
      if (c.acao === 'ver') return J(200, { guilda: { nome: 'Panelinha', tag: 'PNL', cor: '#7c9cff', ocupadas: 2, vagas: 15, expira_em: '2026-11-08T10:00:00Z' } });
      if (c.acao === 'aceitar' || c.acao === 'recusar') { if (c.acao === 'aceitar') window.__estado = Object.assign({}, window.__estado, { recebidos: [], minha: window.__criada }); else window.__estado = Object.assign({}, window.__estado, { recebidos: [] }); return c.acao === 'aceitar' ? J(200, { guilda: { id: 'g1' } }) : new Response(null, { status: 204 }) }
      if (c.acao === 'sair' || c.acao === 'remover' || c.acao === 'cancelar') { if (c.acao === 'sair') window.__estado = Object.assign({}, window.__estado, { minha: null }); return new Response(null, { status: 204 }) }
    }
    if (u.startsWith('/api/zro/pessoas')) return J(200, { agendas: true, pessoas: [
      { id: 'aaaaaaaa-0000-4000-8000-000000000002', arroba: 'pessoa.dois', nome: 'Pessoa Dois', foto: null, cidade: 'Natal/RN', funcoes: ['Editor'], nichos: [], bio: null, portfolio: null, agenda: {} },
      { id: 'aaaaaaaa-0000-4000-8000-000000000003', arroba: 'pessoa.tres', nome: 'Pessoa Três', foto: null, cidade: null, funcoes: ['Op. de câmera'], nichos: [], bio: null, portfolio: null, agenda: {} }] });
    if (u.startsWith('/api/zro/agenda') && met === 'GET') return J(200, { agenda: {} });
    return J(200, { recebidas: [], enviadas: [], posts: [], anuncios: [] });
  };
  zroPodeEnviar = () => true;
  ZRO_CONTA = { sub: '${SUB.toUpperCase()}', nome: 'Conta Teste', liberado: true };
  window.__estado = estado.servidor; window.__criada = estado.criada;
}`;

(async () => {
  const f2 = construir(2, 'real-guilda-f2.html');
  const f1 = construir(1, 'real-guilda-f1.html');
  t(require('../db/fase.js').FASE_LANCAMENTO === 1, 'o padrão do lançamento é a fase 1 (db/fase.js): a guilda nasce escondida');

  const b = await require('./_navegador.js').abrir();
  const abrir = async (arquivo, viewport) => {
    const ctx = await b.newContext({ viewport: viewport || { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push('ERR: ' + e.message));
    p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto('file://' + arquivo, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2800);
    p.errs = errs;
    return p;
  };

  /* ---------------- fase 1: a guilda não existe ---------------- */
  let p = await abrir(f1.arquivo);
  let m = await p.evaluate(async ({ prep, srv }) => {
    await eval(prep)({ servidor: srv, criada: null });
    const vis = e => !!e && !e.hidden && !e.closest('[hidden]') && e.getBoundingClientRect().width > 0;
    realCarregar();
    await new Promise(r => setTimeout(r, 500));
    show('guildas');
    const abas = [...document.querySelectorAll('[data-tab="guildas"]')].filter(vis).length;
    return { fase: FASE_LANCAMENTO, real: REAL, abas, tab: S.tab, menu: MENU.some(x => x[0] === 'guildas'),
      naFase: naFase('guildas'), pedidos: window.__pedidos.filter(x => /guildas/.test(x)) };
  }, { prep: PREPARAR, srv: GUILDA() });
  t(m.real && m.fase === 1, 'o site real nasce com FASE_LANCAMENTO = 1');
  t(m.abas === 0 && !m.menu && !m.naFase && m.tab !== 'guildas', 'fase 1: sem aba, sem item de menu e show("guildas") não abre (' + JSON.stringify({ abas: m.abas, tab: m.tab }) + ')');
  t(m.pedidos.length === 0, 'fase 1: a página nunca fala com /api/zro/guildas');
  t(p.errs.length === 0, 'fase 1: zero erro de console' + (p.errs[0] ? ' — ' + p.errs[0] : ''));
  await p.context().close();

  /* ---------------- fase 2 ---------------- */
  p = await abrir(f2.arquivo);
  m = await p.evaluate(async ({ prep, srv }) => {
    await eval(prep)({ servidor: srv, criada: srv.minha });
    const vis = e => !!e && !e.hidden && !e.closest('[hidden]') && e.getBoundingClientRect().width > 0;
    realCarregar();
    await new Promise(r => setTimeout(r, 500));
    show('meu');
    return { fase: FASE_LANCAMENTO, abas: [...document.querySelectorAll('[data-tab="guildas"]')].filter(vis).length, menu: MENU.some(x => x[0] === 'guildas'),
      naFase: naFase('guildas'), salao: naFase('salao') };
  }, { prep: PREPARAR, srv: GUILDA() });
  t(m.fase === 2 && m.naFase && m.menu && m.abas >= 1, 'fase 2: a aba Guilda aparece e está no menu (' + JSON.stringify(m) + ')');
  t(!m.salao, 'o salão do protótipo (chat e mural de mentira) continua fora do site real');

  m = await p.evaluate(async () => {
    show('guildas');
    await new Promise(r => setTimeout(r, 500));
    const txt = document.getElementById('gl-eu').innerText;
    const hid = id => { const e = document.getElementById(id); return !e || e.hidden };
    return { txt, h1: document.getElementById('gl-h1').textContent, rank: hid('gl-rank'), fundar: hid('gl-fundar'), rankLab: hid('gl-rank-lab'),
      time: document.querySelectorAll('#rg-time .slm').length, tirar: document.querySelectorAll('[data-rg-tirar]').length,
      convidar: !!document.getElementById('rg-convidar'), pedidos: window.__pedidos.filter(x => /guildas/.test(x)),
      dinheiro: /R\$|taxa de fundação|VIP|ranking/i.test(document.getElementById('v-guildas').innerText) };
  });
  t(/Panelinha/.test(m.txt) && /nível 2/.test(m.txt) && /2\/20/.test(m.txt) && /\+5 de espaço extra/.test(m.txt), 'a minha guilda vem do servidor: nome, nível, membros e espaço extra');
  t(/Conta Teste/.test(m.txt) && /Pessoa Um/.test(m.txt) && m.time === 2 && m.tirar === 1, 'o time lista os membros, e o dono pode tirar os outros (não a si)');
  t(/Op\. de câmera/.test(m.txt) && /12\/11/.test(m.txt) && /Pessoa Um/.test(m.txt), 'a memória mostra os jobs fechados (função, dia, quem é da guilda)');
  t(m.rank && m.fundar && m.rankLab && m.convidar, 'sem ranking entre guildas e sem fundação paga; o dono vê Convidar');
  t(!m.dinheiro, 'nada de preço, taxa de fundação, VIP nem ranking na tela');
  t(/em breve/.test(m.txt) && /\+2 vagas/.test(m.txt), 'as conquistas vêm do banco e a taxa de 5% aparece como "em breve" (não cobra)');
  t(m.pedidos[0] === 'GET /api/zro/guildas', 'a tela pede ao servidor');

  /* convidar por link e pelo @; tirar; cancelar; sair */
  m = await p.evaluate(async () => {
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    window.__pedidos.length = 0;
    document.getElementById('rg-convidar').click();
    document.getElementById('rg-c-link').click();
    await esperar(300);
    const url = (document.getElementById('rg-c-url') || {}).value || '';
    const q = document.getElementById('rg-c-q'); q.value = '@pessoa.d'; q.dispatchEvent(new Event('input'));
    await esperar(300);
    const ach = [...document.querySelectorAll('#rg-c-lista .slm b')].map(x => x.textContent);
    const bt = document.querySelector('[data-rg-conv]'); if (bt) bt.click();
    await esperar(300);
    const ped = window.__pedidos.slice();
    rgFechar();
    window.confirm = () => true;
    document.querySelector('[data-rg-tirar]').click(); await esperar(200);
    document.querySelector('[data-rg-cancelar]').click(); await esperar(200);
    return { url, ach, ped, todos: window.__pedidos.slice() };
  });
  t(/\?guilda=a{32}$/.test(m.url), 'convite por link: o servidor devolve o link e a tela o mostra');
  t(m.ach.join() === 'Pessoa Dois', 'convite pelo @: a busca acha pela comunidade da Absolute ZRO e não oferece quem já é da guilda (' + m.ach.join() + ')');
  t(m.ped.some(x => x === 'POST /api/zro/guildas {"acao":"convidar","para":"aaaaaaaa-0000-4000-8000-000000000002"}'), 'convidar pelo @ manda só o id da pessoa');
  t(m.todos.some(x => x === 'POST /api/zro/guildas {"acao":"remover","sub":"aaaaaaaa-0000-4000-8000-000000000001"}')
    && m.todos.some(x => x === 'POST /api/zro/guildas {"acao":"cancelar","id":"c1"}'), 'tirar alguém e cancelar convite são pedidos ao servidor');

  m = await p.evaluate(async () => {
    window.confirm = () => true; window.__pedidos.length = 0;
    document.getElementById('rg-sair').click();
    await new Promise(r => setTimeout(r, 500));
    return { ped: window.__pedidos.slice(), txt: document.getElementById('gl-eu').innerText, fundar: !!document.getElementById('rg-fundar') };
  });
  t(m.ped[0] === 'POST /api/zro/guildas {"acao":"sair"}' && /não tem guilda/i.test(m.txt) && m.fundar, 'sair é pedido ao servidor, e a tela volta ao "sem guilda" com o botão de fundar');

  /* fundar: valida no aparelho e manda só nome, tag, cor e sobre */
  m = await p.evaluate(async () => {
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    window.__pedidos.length = 0;
    document.getElementById('rg-fundar').click();
    document.getElementById('rg-f-ok').click();
    const erro1 = document.getElementById('rg-f-erro').textContent;
    document.getElementById('rg-f-nome').value = 'Panelinha'; document.getElementById('rg-f-tag').value = 'pnl';
    document.getElementById('rg-f-ok').click();
    await esperar(500);
    return { erro1, ped: window.__pedidos.filter(x => x.startsWith('POST')), txt: document.getElementById('gl-eu').innerText };
  });
  t(/nome/i.test(m.erro1), 'fundar sem nome é recusado na tela');
  t(m.ped[0] === 'POST /api/zro/guildas {"nome":"Panelinha","tag":"PNL","cor":"#7c9cff","sobre":null}' && /Panelinha/.test(m.txt), 'fundar manda nome, tag, cor e sobre; nada de preço nem de dono vindo da tela');

  /* convite recebido: aceitar, e o link ?guilda= pergunta antes */
  m = await p.evaluate(async () => {
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    window.__estado = { fase: 2, minha: null, carencia_ate: null, recebidos: [{ id: 'cv1', nome: 'Os do Fim', tag: 'FIM', cor: '#ff6b9d', de_nome: 'Dona Fim', expira_em: '2026-11-08T10:00:00Z' }] };
    REAL_GUILDA = null; realGuildaPintar(); await esperar(500);
    const txt = document.getElementById('gl-eu').innerText;
    window.__pedidos.length = 0;
    document.querySelector('[data-rg-aceitar]').click(); await esperar(500);
    return { txt, ped: window.__pedidos.filter(x => x.startsWith('POST')) };
  });
  t(/Os do Fim/.test(m.txt) && /Dona Fim/.test(m.txt), 'o convite recebido aparece com o nome da guilda e de quem convidou');
  t(m.ped[0] === 'POST /api/zro/guildas {"acao":"aceitar","id":"cv1"}', 'aceitar manda só o id do convite');
  m = await p.evaluate(async () => {
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    window.__estado = { fase: 2, minha: null, carencia_ate: null, recebidos: [] }; REAL_GUILDA = null;
    sessionStorage.setItem('cdf-guilda-token', 'b'.repeat(30));
    window.__pedidos.length = 0;
    await realGuildaCarregar(); rgConviteDoLink(); await esperar(500);
    const o = document.getElementById('rg-ovl');
    const aberto = !!o && !o.hidden, txt = o ? o.innerText : '';
    const antes = window.__pedidos.filter(x => /aceitar/.test(x)).length;
    document.getElementById('rg-l-ok').click(); await esperar(500);
    return { aberto, txt, antes, ped: window.__pedidos.filter(x => /aceitar/.test(x)) };
  });
  t(m.aberto && /Panelinha/.test(m.txt) && m.antes === 0, 'o link de convite mostra a guilda e pergunta; nada entra sem o toque');
  t(m.ped[0] === 'POST /api/zro/guildas {"acao":"aceitar","token":"' + 'b'.repeat(30) + '"}', 'aceitar pelo link manda o código');

  /* a busca não conhece guilda: mesma ordem com e sem guilda, nível e espaço extra */
  m = await p.evaluate(async () => {
    const ordem = () => filtrar().map(c => c.id).join();
    const sem = ordem();
    REAL_GUILDA = Object.assign({}, window.__estado, { minha: window.__criada });
    REAL_GUILDA.minha.vagas.extra = 50; REAL_GUILDA.minha.nivel.atual = 30;
    const com = ordem();
    return { sem, com, n: filtrar().length, fonte: filtrar.toString() + sortFn() };
    function sortFn() { return typeof ordenar === 'function' ? ordenar.toString() : '' }
  });
  t(m.sem === m.com && m.sem.length > 0, 'a ordem da busca é idêntica com e sem guilda, nível e espaço extra');
  t(!/guilda|GUILDA|slots|espaco/i.test(m.fonte), 'filtrar() (e a ordenação) não conhecem guilda nem espaço extra');
  t(p.errs.length === 0, 'fase 2: zero erro de console' + (p.errs[0] ? ' — ' + p.errs[0] : ''));
  await p.context().close();

  /* iPhone: a guilda tem porta na barra de baixo, e a tela cabe sem rolar de lado */
  p = await abrir(f2.arquivo, { width: 390, height: 844 });
  m = await p.evaluate(async ({ prep, srv }) => {
    await eval(prep)({ servidor: srv, criada: srv.minha });
    realCarregar(); await new Promise(r => setTimeout(r, 500));
    const vis = e => !!e && !e.hidden && !e.closest('[hidden]') && e.getBoundingClientRect().width > 0;
    show('meu'); await new Promise(r => setTimeout(r, 300));
    const barra = [...document.querySelectorAll('.bottombar .bt[data-tab="guildas"]')].filter(vis).length;
    show('guildas'); await new Promise(r => setTimeout(r, 600));
    return { barra, larg: document.documentElement.scrollWidth, jan: innerWidth };
  }, { prep: PREPARAR, srv: GUILDA() });
  t(m.barra >= 1, 'no iPhone a guilda tem porta na barra de baixo');
  t(m.larg <= m.jan, 'no iPhone a tela da guilda não rola de lado (' + m.larg + ' de ' + m.jan + ')');
  t(p.errs.length === 0, 'iPhone: zero erro de console' + (p.errs[0] ? ' — ' + p.errs[0] : ''));
  await p.context().close();

  for (const f of ['real-guilda-f1.html', 'real-guilda-f2.html']) try { fs.unlinkSync(path.join(PUB, f)) } catch (e) {}
  console.log('GUILDA NO SITE REAL');
  ok.forEach(x => console.log('  ✓ ' + x));
  bad.forEach(x => console.log('  ✗ ' + x));
  console.log(ok.length + ' ok, ' + bad.length + ' falhas');
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
