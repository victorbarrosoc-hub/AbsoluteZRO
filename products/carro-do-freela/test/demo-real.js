/* O MODO DEMONSTRAÇÃO (02/nov) — carro.absolutezro.com/demo.
 * Victor: "um modo demonstração pra simular como se tivesse uns 100 usuários usando a plataforma… em um endereço
 * separado, qualquer pessoa com o link vê como funciona."
 *
 * O que esta suíte guarda:
 *   - /demo é o site real com perfis fictícios: ~100 pessoas, propostas, feed, brechó e guilda, sem login;
 *   - o selo "Demonstração · perfis fictícios" fica sempre na tela e leva ao site de verdade;
 *   - nada vai ao servidor (/api/zro/* responde da memória) e o localStorage do domínio não é tocado;
 *   - a página não é indexada e a página principal não carrega o script da demonstração.
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ok = [], bad = []; const t = (c, m) => (c ? ok : bad).push(m);
const PUB = path.resolve(__dirname, '..', 'public');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json' };
const { CHROME, ARGS } = require('./_navegador');

(async () => {
  const demo = path.join(PUB, 'demo.html');
  if (!fs.existsSync(demo)) require('child_process').execFileSync(process.execPath, [path.join(__dirname, '..', 'src', 'build.js'), '--real'], { stdio: 'ignore' });
  const html = fs.readFileSync(demo, 'utf8'), real = fs.readFileSync(path.join(PUB, 'real.html'), 'utf8');
  t(/<meta name="robots" content="noindex, nofollow">/.test(html), 'a demonstração não é indexada');
  t(html.includes('<link rel="canonical" href="https://carro.absolutezro.com/demo">') && !/rel="canonical" href="https:\/\/carro\.absolutezro\.com\/"/.test(html), 'o canonical do /demo aponta para ele mesmo');
  t(!/<!--/.test(html.replace(/<!--\[if[\s\S]*?endif\]-->/g, '')) || (html.match(/<!--/g) || []).length === (real.match(/<!--/g) || []).length, 'sem comentário a mais que o site real');
  t(!/\b(aeon|revela|nossom|quasar|rift)\b/i.test(html), 'nada de AEON, Revela, NOSSOM ou Rift');
  t(/<meta name="cdf-demo" content="1">/.test(html) && !/cdf-demo/.test(real), 'só a demonstração carrega o modo (a página principal não)');
  const nomesCrew = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'crew.json'), 'utf8')).map(c => c.nome).filter(Boolean).slice(0, 20);
  t(!nomesCrew.some(n => html.includes(n)), 'nenhum perfil do protótipo (crew.json) vai junto');

  const b = await chromium.launch({ executablePath: CHROME, args: ARGS });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const api = [];
  await ctx.route('https://carro.absolutezro.com/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/api/')) { api.push(u.pathname); return r.fulfill({ status: 401, contentType: 'application/json', body: '{"erro":"sem_sessao"}' }) }
    const rel = u.pathname === '/demo' ? 'demo.html' : u.pathname === '/' ? 'real.html' : decodeURIComponent(u.pathname.slice(1));
    const f = path.join(PUB, rel);
    if (u.pathname === '/nada') return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title>' });
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: TIPOS[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  const p = await ctx.newPage(); const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  // o domínio já tem uma conta de verdade neste navegador: a demonstração não pode mexer nela
  await p.goto('https://carro.absolutezro.com/nada'); await p.evaluate(() => localStorage.setItem('cdf-uso', 'conta-real'));
  await p.goto('https://carro.absolutezro.com/demo');
  await p.waitForFunction(() => typeof S === 'object' && S.tab && S.tab !== 'home', null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(800);
  const st = await p.evaluate(() => ({ tab: S.tab, crew: CREW.length, nome: EU.nome, selo: (document.getElementById('demo-selo') || {}).textContent || '', link: (document.querySelector('#demo-selo a') || {}).href }));
  t(st.tab === 'feed', 'entra sozinha, direto no feed (' + st.tab + ')');
  t(st.crew >= 100, '⟶⟶ com cerca de 100 pessoas na praça (' + st.crew + ')');
  t(/Demonstração/.test(st.selo) && /fictícios/.test(st.selo), 'o selo diz que é demonstração com perfis fictícios');
  t(st.link === 'https://carro.absolutezro.com/', '⟶⟶ e leva ao site de verdade');
  // site real no computador (02/11): o selo neon é a marca da lateral, e há um menu só (sem o ☰; a conta abre "conta e ajustes")
  let m = await p.evaluate(() => ({ hb: getComputedStyle(document.getElementById('menu-bt')).display,
    selo: !!document.querySelector('.top .brand .zselo:not([hidden])') && getComputedStyle(document.querySelector('.top .brand .mk-marca')).display === 'none' }));
  t(m.selo, 'a lateral mostra o selo neon, não o "///"');
  t(m.hb === 'none', 'no computador não há ☰: a lateral é o menu');
  await p.click('#eu-bt'); await p.waitForTimeout(600);
  const g = await p.evaluate(() => ({ on: document.getElementById('gaveta').classList.contains('on'),
    telas: [...document.querySelectorAll('#gaveta .mn-lista>.mn-g:not(.mn-fim)')].some(e => e.offsetParent !== null),
    ajustes: !!document.querySelector('#gaveta [data-sanf="ajustes"]').offsetParent }));
  t(g.on && !g.telas && g.ajustes, '⟶⟶ o cartão da conta abre "conta e ajustes", sem repetir as telas da lateral');
  await p.evaluate(() => { const x = document.getElementById('g-x'); if (x) x.click() }); await p.waitForTimeout(400);
  await p.evaluate(() => show('propostas')); await p.waitForTimeout(800);
  t(await p.evaluate(() => /Esperando você/.test(document.getElementById('v-propostas').textContent)), 'propostas de exemplo esperando resposta');
  await p.evaluate(() => show('guildas')); await p.waitForTimeout(1200);
  t(await p.evaluate(() => /Panelinha/.test(document.getElementById('v-guildas').textContent)), 'a guilda de exemplo abre');

  /* 02/11 · O SITE REAL NÃO FALA DO QUE NÃO EXISTE (titular, com a gaveta aberta: "O take, a moeda da plataforma" e
     "Taxas e como o dinheiro anda" na Ajuda). A fase 1 não tem dinheiro dentro do Carro (take, pedágio, taxa, sinal,
     custódia, contrato, aluguel, destaque pago, seguro), nem plano pago, selo "Prévia", Passar o carro, Sirene, Cofre,
     Orçamento ou WhatsApp. R$ só onde é dado de verdade: preço do anúncio, valor da proposta e a tabela de diária. */
  const NADA = /\btakes?\b|T\$|ped[áa]gio|\btaxas?\b|\bsinal\b|cust[óo]dia|garantia|contrato|gov\.br|aluguel|\balug|impulsion|\bseguro|dossi[êe]|Volante|Frota|Carona|Premium|Estrada|\bassin[ae]|mensalidade|Pr[ée]via|Passar o carro|Sirene|\bCofre|Or[çc]amento|WhatsApp|\bzap\b/i;
  const sujo = (sel, comReais) => p.evaluate(({ sel, a, rs }) => {
    const el = document.querySelector(sel); if (!el) return ['(sem ' + sel + ')'];
    const A = new RegExp(a, 'i');
    return el.innerText.split('\n').map(l => l.trim()).filter(l => A.test(l) || (rs && /R\$/.test(l))).slice(0, 3);
  }, { sel, a: NADA.source, rs: !!comReais });
  await p.evaluate(() => { abrirGaveta(); const a = document.querySelector('#gaveta [data-sanf="ajuda"] .mn-abre'); if (a && a.getAttribute('aria-expanded') !== 'true') a.click() });
  await p.waitForTimeout(400);
  const ajuda = await p.evaluate(() => [...document.querySelectorAll('#gaveta [data-ajuda]')].filter(b => b.offsetParent).map(b => b.dataset.ajuda));
  const gav = await sujo('#gaveta', true);
  t(!ajuda.includes('moeda') && !ajuda.includes('taxas') && ajuda.length >= 4 && !gav.length, 'a Ajuda da gaveta não tem take, taxas nem nada que não existe (' + ajuda.join(', ') + (gav.length ? ' · ' + gav.join(' | ') : '') + ')');
  const arts = [];
  for (const k of ajuda) { await p.evaluate(k => abrirAjuda(k), k); await p.waitForTimeout(150); arts.push(...(await sujo('#v-ajuda', true)).map(l => k + ': ' + l)) }
  t(ajuda.length && !arts.length, '⟶⟶ e cada artigo aberto também não (' + arts.slice(0, 3).join(' | ') + ')');
  t(await p.evaluate(() => { abrirAjuda('moeda'); abrirAjuda('taxas'); return !/take|taxa/i.test(document.getElementById('v-ajuda').innerText) }), '⟶⟶ e o take e as taxas não abrem nem chamados direto');
  await p.evaluate(() => abrirGuia()); await p.waitForTimeout(300);
  const guia = await sujo('#ovl-guia', true);
  t(!guia.length, 'o guia de entrada só fala do que existe' + (guia.length ? ' (' + guia.join(' | ') + ')' : ''));
  await p.evaluate(() => fecharGuia());
  const telas = [];
  for (const [modo, tela, rs] of [['freela', 'agenda', 1], ['freela', 'propostas', 0], ['freela', 'jobs', 1], ['freela', 'meu', 0], ['freela', 'cadastro', 1],
    ['contratante', 'buscar', 0], ['contratante', 'equipe', 0], ['contratante', 'minhaprod', 1], ['contratante', 'brecho', 0]]) {
    await p.evaluate(([m, x]) => { if (MODO !== m) v('modo-tog').onclick(); if (x === 'cadastro') { abrirCadastro('meu'); cadTodo = true; irPasso(1) } else show(x); if (x === 'brecho') painelBrecho('vender') }, [modo, tela]);
    await p.waitForTimeout(500);
    telas.push(...(await sujo('#v-' + tela, rs)).map(l => modo + '/' + tela + ': ' + l));
  }
  t(!telas.length, 'nas telas dos dois lados, nada de dinheiro, plano, contrato ou WhatsApp' + (telas.length ? ' (' + telas.slice(0, 4).join(' | ') + ')' : ''));
  t(await p.evaluate(() => !CAD_PERG.some(q => /WhatsApp/.test(q.t)) && !ITENS.some(i => i.k === 'fone')), 'o cadastro não pergunta o WhatsApp (o número não teria para onde ir)');
  t(!api.length, 'nenhum pedido chega ao servidor (' + api.slice(0, 3).join(', ') + ')');
  /* 02/11 · 3 · AS TELAS NOVAS DO SITE REAL (desenho aprovado pelo titular): cada tela nova pinta o seu bloco e o
     antigo some; a caixa de propostas abre na primeira, a agenda é o mês inteiro, o brechó é vitrine */
  await p.evaluate(() => { if (MODO !== 'freela') v('modo-tog').onclick() });
  const telasNovas = [];
  for (const [tela, sel] of [['propostas', '#nx-prop .nx-pp-it'], ['agenda', '#nx-ag .nx-cal .nx-dia'], ['jobs', '#nx-jb .nx-jb-hero'], ['brecho', '#nx-br .nx-an'], ['meu', '#nx-meu .nx-lista .nx-li']]) {
    await p.evaluate(x => show(x), tela); await p.waitForTimeout(400);
    telasNovas.push(await p.evaluate(([tela, sel]) => { const e = document.querySelector(sel), w = document.querySelector('#v-' + tela + '>.wrap');
      return { tela, ok: !!e && !!e.offsetParent, antigo: !!w && !!w.offsetParent } }, [tela, sel]));
  }
  t(telasNovas.every(x => x.ok && !x.antigo), 'Propostas, Agenda, Jobs, Brechó e Meu perfil são as telas novas, e as antigas somem (' +
    telasNovas.filter(x => !x.ok || x.antigo).map(x => x.tela).join(', ') + ')');
  m = await p.evaluate(async () => { show('propostas'); await new Promise(r => setTimeout(r, 200));
    const novas = PROPOSTAS.filter(x => x.status === 'novo').length;
    const pr = PROPOSTAS.find(x => x.status === 'novo' && x.srvTipo === 'job');
    document.querySelector('#nx-prop [data-nx="pp-sel"][data-id="' + pr.id + '"]').click(); await new Promise(r => setTimeout(r, 100));
    const det = document.querySelector('#nx-prop .nx-pp-det'), tinha = /Aceitar/.test(det.innerText);
    document.querySelector('#nx-prop .nx-pp-det [data-nx="pp-aceita"]').click(); await new Promise(r => setTimeout(r, 400));
    return { det: !!det && /Seu dia/.test(det.innerText), tinha, aceita: PROPOSTAS.find(x => x.id === pr.id).status, job: JOBS.some(j => j.srv === pr.srv), novas,
      pedidos: CDF_DEMO.pedidos.filter(x => /^PATCH propostas/.test(x)).length };
  });
  t(m.det && m.tinha && m.aceita === 'aceita' && m.job && m.pedidos === 1, '⟶⟶ a caixa mostra o detalhe com "Seu dia", e Aceitar vai ao servidor e vira job (' + JSON.stringify(m) + ')');
  m = await p.evaluate(async () => { show('agenda'); await new Promise(r => setTimeout(r, 200));
    const k = key(dateAt(20)); document.querySelector('#nx-ag .nx-cal [data-k="' + k + '"]').click(); await new Promise(r => setTimeout(r, 100));
    const folha = !!document.getElementById('nx-folha'); document.querySelector('#nx-folha [data-dia-op="dia"]').click(); await new Promise(r => setTimeout(r, 200));
    return { folha, dec: AGENDA[k] && AGENDA[k].e + '/' + AGENDA[k].p, est: document.querySelector('#nx-ag .nx-cal [data-k="' + k + '"]').dataset.est,
      put: CDF_DEMO.pedidos.filter(x => x === 'PUT agenda').length };
  });
  t(m.folha && m.dec === 'fechado/dia' && m.est === 'ocupado' && m.put >= 1, '⟶⟶ na agenda, tocar num dia abre a folha e marcar ocupado vai ao servidor (' + JSON.stringify(m) + ')');

  /* 02/11 · 3 · A ENTRADA EM PERGUNTAS: a conta que acabou de chegar (/demo?novo=1) não cai no cadastro antigo; responde
     uma pergunta por tela, e o fim é o caminho de sempre (concluirCadastro → PUT /api/zro/perfil) */
  const pn = await ctx.newPage(); const errosN = []; pn.on('pageerror', e => errosN.push(e.message));
  await pn.goto('https://carro.absolutezro.com/demo?novo=1');
  await pn.waitForFunction(() => { const o = document.getElementById('ob'); return o && !o.hidden }, null, { timeout: 15000 }).catch(() => {});
  const passosOb = [];
  const passoOb = async () => passosOb.push(await pn.evaluate(() => { const o = document.getElementById('ob'); return o && !o.hidden ? (o.querySelector('.ob-tit') || {}).textContent : '(sem #ob)' }));
  const irOb = () => pn.click('#ob [data-ob="ir"]');
  await passoOb();
  m = await pn.evaluate(() => ({ cad: S.tab === 'cadastro', ops: document.querySelectorAll('#ob [data-ob-modo]').length, cartao: /Assim quem contrata vê você/.test(document.getElementById('ob').textContent) }));
  await irOb(); await passoOb();
  await pn.fill('#ob-q', 'parna'); await pn.click('#ob [data-praca="Parnamirim/RN"]'); await pn.click('#ob-viaja');
  const viajaRot = await pn.evaluate(() => document.querySelector('label[for="ob-viaja"]').textContent);
  await irOb(); await passoOb();
  await irOb(); const semFuncao = await pn.evaluate(() => document.getElementById('ob-nota').textContent);
  for (const f of ['Op. de câmera', 'Editor', 'Editor']) await pn.click('#ob-func [data-func="' + f + '"]');
  const estrela = await pn.evaluate(() => [OB.func.join(','), (document.querySelector('#ob-func [data-estrela]') || {}).dataset.func]);
  await irOb(); await passoOb();
  await pn.fill('#ob-port', '@voce.demo'); const prev = await pn.evaluate(() => document.getElementById('ob-prev').textContent);
  await irOb(); await passoOb();
  await pn.click('#ob-mostrar'); await irOb(); await pn.waitForTimeout(500); await passoOb();
  const fim = await pn.evaluate(() => ({ pedidos: CDF_DEMO.pedidos.slice(), perfil: CDF_DEMO.perfil(), tab: S.tab, eu: [EU.cidade, EU.func.join(','), EU.port, !!EU.viaja],
    txt: document.getElementById('ob').innerText }));
  t(passosOb[0] !== '(sem #ob)' && !m.cad && m.ops === 2 && m.cartao, 'a conta nova cai na entrada em perguntas (não no cadastro antigo), com o cartão "Assim quem contrata vê você" ao lado');
  t(passosOb.join(' | ') === 'Você está aqui para quê? | Onde você trabalha? | O que você faz? | Onde está o seu trabalho? | Quer aparecer na busca? | Você está no Carro.',
    '⟶⟶ uma pergunta por tela, cinco e o pronto (' + passosOb.join(' | ') + ')');
  t(viajaRot === 'Topo viajar' && /função/.test(semFuncao), '⟶⟶ "Topo viajar", e sem função não passa (' + semFuncao + ')');
  t(estrela[0] === 'Editor,Op. de câmera' && estrela[1] === 'Editor', '⟶⟶ tocar de novo numa função marcada faz dela a principal (★) (' + estrela.join(' / ') + ')');
  t(/instagram\.com\/voce\.demo/.test(prev), '⟶⟶ o @ vira o link na hora (' + prev + ')');
  t(fim.pedidos.includes('PUT perfil') && fim.perfil && fim.perfil.cidade === 'Parnamirim' && fim.perfil.uf === 'RN' && fim.perfil.funcoes.join(',') === 'Editor,Op. de câmera' &&
    fim.perfil.portfolio === 'https://instagram.com/voce.demo' && fim.perfil.visibilidade === 'contratantes',
    '⟶⟶ concluir manda o perfil ao servidor (PUT /api/zro/perfil) com praça, funções, portfólio e a busca ligada (' + JSON.stringify(fim.perfil) + ')');
  t(/Marcar minha semana/.test(fim.txt) && /Ir para o feed/.test(fim.txt) && fim.eu[0] === 'Parnamirim/RN' && fim.eu[3], '⟶⟶ o pronto oferece a agenda e o feed, e o aparelho fica com o mesmo perfil (' + fim.eu.join(' · ') + ')');
  t(!/WhatsApp|diária|equipamento que/i.test(passosOb.join(' ')) && !/\(\d{2}\)\s?\d|\d{4,5}-\d{4}/.test(fim.txt), '⟶⟶ sem WhatsApp, sem telefone e sem tabela de diária na entrada');
  await pn.click('#ob [data-ob-fim="agenda"]'); await pn.waitForTimeout(400);
  m = await pn.evaluate(() => ({ tab: S.tab, ob: document.getElementById('ob').hidden, pronto: perfilPronto() }));
  t(m.tab === 'agenda' && m.ob && m.pronto, '⟶⟶ "Marcar minha semana" fecha a entrada e abre a agenda (' + JSON.stringify(m) + ')');
  t(!errosN.length, '⟶⟶ zero erro de página na conta nova' + (errosN.length ? ': ' + errosN.join(' | ') : ''));
  await pn.close();

  const p2 = await ctx.newPage(); await p2.goto('https://carro.absolutezro.com/nada');
  const lsReal = await p2.evaluate(() => ({ uso: localStorage.getItem('cdf-uso'), entrou: localStorage.getItem('cdf-entrou') }));
  t(lsReal.uso === 'conta-real' && lsReal.entrou === null, 'o localStorage do domínio fica intocado (' + JSON.stringify(lsReal) + ')');
  t(!erros.length, 'zero erro de página' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
  console.log('\nMODO DEMONSTRAÇÃO');
  ok.forEach(m => console.log('  ✓ ' + m)); bad.forEach(m => console.log('  ✗ ' + m));
  console.log(ok.length + ' ok, ' + bad.length + ' falhas');
  process.exit(bad.length ? 1 : 0);
})();
