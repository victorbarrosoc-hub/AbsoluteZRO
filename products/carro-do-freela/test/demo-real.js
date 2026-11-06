/* O MODO DEMONSTRAÇÃO (02/nov) — carro.absolutezro.com/demo.
 * Victor: "um modo demonstração pra simular como se tivesse uns 100 usuários usando a plataforma… em um endereço
 * separado, qualquer pessoa com o link vê como funciona."
 *
 * O que esta suíte guarda:
 *   - /demo é o site real com perfis fictícios: ~100 pessoas, propostas, feed, brechó e guilda, sem login;
 *   - o selo "Demonstração · perfis fictícios" fica sempre na tela e leva ao site de verdade;
 *   - nada vai ao servidor (/api/zro/* responde da memória) e o localStorage do domínio não é tocado;
 *   - a página não é indexada e a página principal não carrega o script da demonstração;
 *   - (03/11) a tabela de diária, o "topo viajar" e o selo vêm do servidor: Meu perfil salva a tabela (PUT
 *     /api/zro/tabela) e relê, o medidor do selo é o que o servidor calculou, e quem contrata vê a tabela e o ✓ só de
 *     quem o servidor devolveu;
 *   - (03/11, 0009) o job só conta no selo quando os DOIS lados confirmam: Jobs pergunta "Aconteceu?" a quem fez e a quem
 *     contratou, a resposta vai ao servidor uma vez, o estado aparece no histórico e o medidor diz por quê;
 *   - (03/11) a Agenda mostra os quatro estados na célula inteira (livre, negociando, ocupado, meia diária), com a
 *     legenda que conta o mês e filtra, no computador e no celular; e o /demo funciona dentro de um iframe;
 *   - (03/11, 0010) o job aceito só se cancela até a véspera: do dia em diante não há "Cancelar" e o servidor recusa
 *     (409 dia); a proposta nova cancela (dois toques).
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

  /* 03/11 · OS QUATRO ESTADOS DA AGENDA (titular, no celular: "não consigo mais ver fácil quais dias estou livre, quais
     tô ocupado e quais estou negociando"). Cada dia tem um estado na célula inteira — livre, negociando, ocupado (job
     também) e meia diária —, saído do job e da agenda declarada; a legenda conta o mês e filtra; hoje mantém o anel. */
  const AG_ESPERADO = `(k => { const js = JOBS.filter(j => j.data === k); if (js.length) return js.some(j => !j.hold) ? 'ocup' : 'neg';
    const d = AGENDA[k]; if (!d) return 'livre'; if (d.e === 'negociando') return 'neg'; return d.p === 'dia' ? 'ocup' : 'meia' })`;
  const agLer = (pg, sel) => pg.evaluate(([esp, sel]) => { const esperado = eval(esp);
    const cel = [...document.querySelectorAll('#nx-ag ' + sel + '[data-ag]')].filter(c => c.dataset.ag !== 'passou');
    const conta = {}; cel.forEach(c => { conta[c.dataset.ag] = (conta[c.dataset.ag] || 0) + 1 });
    const leg = {}; document.querySelectorAll('#nx-ag .nx-leg-i').forEach(b => { leg[b.dataset.f] = +b.querySelector('b').textContent });
    const est = {}; ['livre', 'neg', 'ocup', 'meia'].forEach(ag => { const c = cel.find(x => x.dataset.ag === ag); if (!c) return; const s = getComputedStyle(c);
      est[ag] = { bg: s.backgroundColor, img: s.backgroundImage, borda: s.borderTopStyle } });
    const hj = document.querySelector('#nx-ag ' + sel + '[data-hoje]');
    return { errados: cel.filter(c => c.dataset.ag !== esperado(c.dataset.k)).map(c => c.dataset.k + ':' + c.dataset.ag), conta, leg, est,
      hoje: hj ? getComputedStyle(hj).outlineStyle : 'sem hoje', velho: !!document.querySelector('#nx-ag .nx-livres, #nx-ag .nx-barra') } }, [AG_ESPERADO, sel]);
  /* o mês de cada dia da conta da demonstração: dia(2) fechado, dia(5) negociando, dia(9) manhã ocupada, dia(8) job */
  const agDia = (pg, n, sel) => pg.evaluate(async ([n, sel]) => { const d = addD(HOJE, n), k = key(d); NX.agFiltro = null; NX.agMes = new Date(d.getFullYear(), d.getMonth(), 1); nxAgenda();
    const c = document.querySelector('#nx-ag ' + sel + '[data-k="' + k + '"]'); return c ? [c.dataset.ag, c.dataset.meia || '', c.querySelector('.nx-dj') ? 'job' : '', c.getAttribute('aria-label')].join('|') : 'sem ' + k }, [n, sel]);
  await p.evaluate(() => { NX.agMes = null; NX.agFiltro = null; show('agenda') }); await p.waitForTimeout(300);
  m = await agLer(p, '.nx-cal .nx-dia');
  t(!m.errados.length && Object.keys(m.conta).length >= 2 && !m.velho, 'Agenda (computador): cada dia de hoje em diante tem o estado do job e da agenda declarada, e o número grande saiu (' + JSON.stringify([m.errados, m.conta]) + ')');
  t(JSON.stringify(Object.keys(m.leg).sort()) === JSON.stringify(Object.keys(m.conta).sort()) && Object.keys(m.conta).every(k => m.leg[k] === m.conta[k]),
    '⟶⟶ a legenda conta o mês (só o que aparece): ' + JSON.stringify(m.leg));
  t(m.hoje === 'solid', '⟶⟶ hoje mantém o anel (' + m.hoje + ')');
  const agDias = [];
  for (const [n, sel] of [[2, '.nx-cal .nx-dia'], [5, '.nx-cal .nx-dia'], [9, '.nx-cal .nx-dia'], [8, '.nx-cal .nx-dia']]) agDias.push(await agDia(p, n, sel));
  t(/^ocup\|\|\|/.test(agDias[0]) && /^neg\|\|\|.*negociando/.test(agDias[1]) && /^meia\|manha\|\|.*meia diária, manhã ocupada/.test(agDias[2]) && /^ocup\|\|job\|/.test(agDias[3]),
    '⟶⟶ ocupado, negociando, meia diária (a manhã) e o dia de job (ocupado, com o job na célula) (' + agDias.join(' · ') + ')');
  await p.evaluate(() => { NX.agMes = new Date(HOJE.getFullYear(), HOJE.getMonth() + (addD(HOJE, 9).getMonth() !== HOJE.getMonth() ? 1 : 0), 1); nxAgenda() });
  m = await agLer(p, '.nx-cal .nx-dia');
  t(m.est.livre && m.est.neg && m.est.ocup && m.est.meia && m.est.livre.bg !== m.est.neg.bg && m.est.livre.bg !== 'rgba(0, 0, 0, 0)' && m.est.neg.borda === 'dashed' && m.est.livre.borda !== 'dashed' &&
    /repeating-linear-gradient/.test(m.est.ocup.img) && /^linear-gradient.*repeating-linear-gradient/.test(m.est.meia.img),
    '⟶⟶ os quatro na célula inteira e não só pela cor: livre liso, negociando tracejado, ocupado hachurado, meia diária pela metade (' + JSON.stringify(Object.keys(m.est)) + ')');
  /* a legenda filtra: tocar em "negociando" acende só esses dias; tocar de novo volta */
  m = await p.evaluate(async () => { const b = document.querySelector('#nx-ag .nx-leg-i[data-f="neg"]'); b.click(); await new Promise(r => setTimeout(r, 100));
    const apagados = [...document.querySelectorAll('#nx-ag .nx-cal .nx-dia[data-ag]:not([data-ag="passou"])')], so = apagados.filter(c => !c.dataset.apaga).map(c => c.dataset.ag);
    const pr = document.querySelector('#nx-ag .nx-leg-i[data-f="neg"]').getAttribute('aria-pressed'), op = +getComputedStyle(apagados.find(c => c.dataset.ag === 'livre')).opacity;
    document.querySelector('#nx-ag .nx-leg-i[data-f="neg"]').click(); await new Promise(r => setTimeout(r, 100));
    return { so: [...new Set(so)], pr, op, volta: document.querySelectorAll('#nx-ag [data-apaga]').length, filtro: NX.agFiltro } });
  t(m.so.join() === 'neg' && m.pr === 'true' && m.op < 0.5 && m.volta === 0 && m.filtro === null, '⟶⟶ a legenda filtra: "negociando" acende só esses dias, e tocar de novo volta (' + JSON.stringify(m) + ')');
  /* a folha do dia muda o estado e a legenda acompanha; "Bloquear dias" marca vários de uma vez */
  m = await p.evaluate(async () => { NX.agMes = null; nxAgenda(); const livres = [...document.querySelectorAll('#nx-ag .nx-cal .nx-dia[data-ag="livre"]')].map(c => c.dataset.k);
    const n0 = k => +((document.querySelector('#nx-ag .nx-leg-i[data-f="' + k + '"] b') || {}).textContent || 0), antes = { livre: n0('livre'), neg: n0('neg'), ocup: n0('ocup'), meia: n0('meia') };
    const put0 = CDF_DEMO.pedidos.filter(x => x === 'PUT agenda').length;
    document.querySelector('#nx-ag .nx-cal [data-k="' + livres[0] + '"]').click(); await new Promise(r => setTimeout(r, 100));
    const sw = [...document.querySelectorAll('#nx-folha [data-dia-op] .nx-sw')].map(i => i.dataset.ag + (i.dataset.meia ? '/' + i.dataset.meia : ''));
    document.querySelector('#nx-folha [data-dia-op="segura"]').click(); await new Promise(r => setTimeout(r, 150));
    const neg = document.querySelector('#nx-ag .nx-cal [data-k="' + livres[0] + '"]').dataset.ag, depois1 = { livre: n0('livre'), neg: n0('neg') };
    document.querySelector('#nx-ag [data-nx="ag-bloq"]').click(); await new Promise(r => setTimeout(r, 50));
    for (const k of [livres[1], livres[2]]) { document.querySelector('#nx-ag .nx-cal [data-k="' + k + '"]').click(); await new Promise(r => setTimeout(r, 50)) }
    const marcados = document.querySelectorAll('#nx-ag .nx-cal [data-bloq]').length, ok = document.querySelector('#nx-ag [data-nx="ag-bloq-ok"]').textContent;
    document.querySelector('#nx-ag [data-nx="ag-bloq-ok"]').click(); await new Promise(r => setTimeout(r, 150));
    return { sw, neg, antes, depois1, marcados, ok, bloq: [livres[1], livres[2]].map(k => document.querySelector('#nx-ag .nx-cal [data-k="' + k + '"]').dataset.ag + ':' + (AGENDA[k] && AGENDA[k].e + '/' + AGENDA[k].p)),
      depois2: { livre: n0('livre'), ocup: n0('ocup') }, put: CDF_DEMO.pedidos.filter(x => x === 'PUT agenda').length - put0 } });
  t(m.sw.join() === 'livre,neg,ocup,meia/manha,meia/tarde' && m.neg === 'neg' && m.depois1.livre === m.antes.livre - 1 && m.depois1.neg === m.antes.neg + 1,
    '⟶⟶ a folha do dia mostra o desenho de cada estado, e "Negociando" pinta o dia e conta na legenda (' + JSON.stringify([m.sw, m.antes, m.depois1]) + ')');
  t(m.marcados === 2 && m.ok === 'Bloquear 2 dias' && m.bloq.every(x => x === 'ocup:fechado/dia') && m.depois2.livre === m.antes.livre - 3 && m.depois2.ocup === m.antes.ocup + 2 && m.put === 3,
    '⟶⟶ "Bloquear dias" marca vários, vira ocupado no servidor e a legenda acompanha (' + JSON.stringify([m.bloq, m.depois2, m.put]) + ')');

  /* o celular (390×844): o mesmo estado no mês pequeno, a legenda numa linha, nada sai da tela */
  const ctxCel = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const rotaDemo = r => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/api/')) { api.push(u.pathname); return r.fulfill({ status: 401, contentType: 'application/json', body: '{"erro":"sem_sessao"}' }) }
    const rel = u.pathname === '/demo' ? 'demo.html' : u.pathname === '/' ? 'real.html' : decodeURIComponent(u.pathname.slice(1)), f = path.join(PUB, rel);
    if (u.pathname === '/nada') return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title>' });
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: TIPOS[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  };
  await ctxCel.route('https://carro.absolutezro.com/**', rotaDemo);
  const pc = await ctxCel.newPage(); const errosC = []; pc.on('pageerror', e => errosC.push(e.message));
  await pc.goto('https://carro.absolutezro.com/demo');
  await pc.waitForFunction(() => typeof S === 'object' && S.tab && S.tab !== 'home', null, { timeout: 15000 }).catch(() => {});
  await pc.waitForTimeout(600);
  await pc.evaluate(() => { if (MODO !== 'freela') v('modo-tog').onclick(); show('agenda') }); await pc.waitForTimeout(400);
  m = await agLer(pc, '.nx-minical .nx-mini-d');
  const cel = await pc.evaluate(() => { const leg = [...document.querySelectorAll('#nx-ag .nx-leg-i')].map(b => b.getBoundingClientRect());
    return { mini: !!document.querySelector('#nx-ag .nx-minical').offsetParent, grande: !!document.querySelector('#nx-ag .nx-cal').offsetParent,
      linha: leg.length > 1 && leg.every(r => Math.abs(r.top - leg[0].top) < 2), dentro: leg.every(r => r.left >= 0 && r.right <= innerWidth), alto: leg.every(r => r.height >= 44),
      larg: document.documentElement.scrollWidth <= innerWidth, dia: Math.min(...[...document.querySelectorAll('#nx-ag .nx-mini-d[data-ag]')].map(c => c.getBoundingClientRect().height)) } });
  t(cel.mini && !cel.grande && !m.errados.length && Object.keys(m.conta).every(k => m.leg[k] === m.conta[k]) && m.hoje === 'solid',
    'Agenda (celular): o mês pequeno tem os mesmos estados, a legenda conta igual e hoje tem o anel (' + JSON.stringify([m.errados, m.leg, m.hoje]) + ')');
  t(cel.linha && cel.dentro && cel.alto && cel.larg && cel.dia >= 44, '⟶⟶ a legenda cabe numa linha, cada item e cada dia com 44px ou mais, sem rolar de lado (' + JSON.stringify(cel) + ')');
  m = { d: [await agDia(pc, 2, '.nx-minical .nx-mini-d'), await agDia(pc, 5, '.nx-minical .nx-mini-d'), await agDia(pc, 9, '.nx-minical .nx-mini-d')] };
  await pc.evaluate(() => { NX.agMes = new Date(HOJE.getFullYear(), HOJE.getMonth() + (addD(HOJE, 9).getMonth() !== HOJE.getMonth() ? 1 : 0), 1); nxAgenda() });
  const estC = (await agLer(pc, '.nx-minical .nx-mini-d')).est;
  t(/^ocup/.test(m.d[0]) && /^neg/.test(m.d[1]) && /^meia\|manha/.test(m.d[2]) && estC.neg && estC.neg.borda === 'dashed' && /repeating-linear-gradient/.test((estC.ocup || {}).img) && /^linear-gradient/.test((estC.meia || {}).img),
    '⟶⟶ no celular também: ocupado hachurado, negociando tracejado, meia diária pela metade (' + m.d.join(' · ') + ')');
  await pc.evaluate(() => { NX.agMes = null; nxAgenda() });
  const kCel = await pc.evaluate(() => (document.querySelector('#nx-ag .nx-minical .nx-mini-d[data-ag="livre"]:not([data-hoje])') || {}).dataset.k);
  await pc.click('#nx-ag .nx-minical [data-k="' + kCel + '"]'); await pc.waitForTimeout(300);
  await pc.click('#nx-folha [data-dia-op="tarde"]'); await pc.waitForTimeout(300);
  m = await pc.evaluate(k => { const c = document.querySelector('#nx-ag .nx-minical [data-k="' + k + '"]'); return [c.dataset.ag, c.dataset.meia, AGENDA[k] && AGENDA[k].e + '/' + AGENDA[k].p].join('|') }, kCel);
  t(m === 'meia|tarde|fechado/tarde', '⟶⟶ tocar num dia no celular abre a folha, e "Tarde ocupada" vira meia diária (' + m + ')');
  t(!errosC.length, '⟶⟶ zero erro de página no celular' + (errosC.length ? ': ' + errosC.join(' | ') : ''));
  await ctxCel.close();

  /* 03/11 · A DEMONSTRAÇÃO DENTRO DE UM IFRAME (uma prévia embutida): a conta da demonstração liga mesmo assim (o
     servidor dela é de mentira, no navegador). O site de verdade num iframe continua com a conta desligada. */
  const ctxF = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctxF.route('https://carro.absolutezro.com/**', rotaDemo);
  const pf = await ctxF.newPage(); const errosF = []; pf.on('pageerror', e => errosF.push(e.message));
  await pf.goto('https://carro.absolutezro.com/nada');
  await pf.evaluate(() => { for (const [id, src] of [['fd', '/demo'], ['fr', '/']]) { const f = document.createElement('iframe'); f.id = id; f.src = src; f.style.cssText = 'width:1200px;height:800px'; document.body.appendChild(f) } });
  const fDemo = () => pf.frames().find(f => /\/demo$/.test(f.url())), fReal = () => pf.frames().find(f => /\/$/.test(f.url()) && f !== pf.mainFrame());
  for (let i = 0; i < 60 && !(fDemo() && fReal()); i++) await pf.waitForTimeout(100);
  await fDemo().waitForFunction(() => typeof PROPOSTAS === 'object' && PROPOSTAS.some(x => x.srv), null, { timeout: 15000 }).catch(() => {});
  m = await fDemo().evaluate(() => ({ iframe: window.top !== window.self, liga: zroLigavel(), conta: !!ZRO_CONTA, propostas: PROPOSTAS.filter(x => x.srv).length, crew: CREW.length, tab: S.tab }));
  const mr = await fReal().evaluate(() => ({ iframe: window.top !== window.self, liga: zroLigavel(), demo: !!window.CDF_DEMO }));
  t(m.iframe && m.liga && m.conta && m.propostas >= 3 && m.crew >= 100, 'o /demo dentro de um iframe liga a conta da demonstração e mostra as propostas dela (' + JSON.stringify(m) + ')');
  t(mr.iframe && !mr.liga && !mr.demo, '⟶⟶ o site de verdade num iframe continua com a conta desligada (' + JSON.stringify(mr) + ')');
  t(!errosF.length, '⟶⟶ zero erro de página no iframe' + (errosF.length ? ': ' + errosF.join(' | ') : ''));
  await ctxF.close();

  /* 03/11 · A TABELA DE DIÁRIA E O SELO NO SERVIDOR (titular: "Tabela diária tem que salvar sim, precisa e pode preparar o
     selo de verificado"). Meu perfil: a linha "Tabela de diária" abre a folha; salvar manda a tabela inteira ao
     servidor; o medidor é o do servidor (pesos, 85% e 6 jobs) e cada item que falta abre a linha que resolve. */
  await p.evaluate(() => show('meu')); await p.waitForTimeout(600);
  m = await p.evaluate(() => { const s = document.getElementById('nx-selo');
    return { selo: !!s, srv: s && s.dataset.srv, pct: NX_SELO && NX_SELO.pct, jobs: NX_SELO && NX_SELO.jobs, ver: EU.ver, compl: EU.compl,
      anel: s && s.querySelector('.nx-selo-anel b') && s.querySelector('.nx-selo-anel b').textContent, sub: (document.getElementById('nx-selo-s') || {}).textContent,
      falta: [...document.querySelectorAll('#nx-selo [data-nx]')].map(b => b.dataset.nx + ':' + b.dataset.k),
      linha: (document.querySelector('.nx-li[data-nx="meu-tab"] small') || {}).textContent,
      get: CDF_DEMO.pedidos.filter(x => x === 'GET tabela').length } });
  t(m.selo && m.srv === 'true' && m.pct === 63 && m.jobs === 2 && m.anel === '63%' && m.compl === 63 && m.ver === false && /Faltam 22% e 4 jobs/.test(m.sub) && m.get >= 1,
    'Meu perfil mostra o medidor do SERVIDOR: 63%, 2 de 6 jobs, "faltam 22% e 4 jobs" (' + JSON.stringify(m) + ')');
  t(m.falta.join(',') === 'meu-port:port,meu-tab:tabela,meu-tab:regras' && m.linha === 'Não preenchida', '⟶⟶ o que falta leva à linha que resolve, e a tabela começa "Não preenchida" (' + m.falta.join(',') + ' · ' + m.linha + ')');
  await p.click('#nx-selo [data-k="tabela"]'); await p.waitForTimeout(300);
  m = await p.evaluate(() => ({ tit: (document.getElementById('nx-folha-t') || {}).textContent, linhas: [...document.querySelectorAll('#nx-folha .nx-tab-li b')].map(b => b.textContent),
    vazios: [...document.querySelectorAll('#nx-folha input')].every(i => i.value === ''), txt: (document.getElementById('nx-folha') || {}).innerText || '' }));
  t(m.tit === 'Tabela de diária' && m.linhas.join(',') === 'Op. de câmera,Editor' && m.vazios, '⟶⟶ a folha tem uma linha por função que a pessoa faz, toda vazia (nada sugerido) (' + m.linhas.join(',') + ')');
  t(!/WhatsApp|\btaxas?\b|garantia|contrato|sinal|planos?\b|gr[áa]tis/i.test(m.txt), '⟶⟶ sem taxa, garantia, contrato, plano ou "grátis" na folha');
  await p.fill('#nx-folha [data-tab-f="Op. de câmera"][data-tab-k="so_eu_cents"]', '600');
  await p.fill('#nx-folha [data-tab-f="Op. de câmera"][data-tab-k="com_equip_cents"]', '1.200');
  await p.fill('#nx-folha [data-tab-f="Editor"][data-tab-k="so_eu_cents"]', 'abc');
  await p.fill('#nx-t-meia', '60'); await p.fill('#nx-t-hex', '80'); await p.fill('#nx-t-desl', '150,50');
  await p.click('#nx-f-ok'); await p.waitForTimeout(200);
  m = await p.evaluate(() => ({ st: document.getElementById('nx-f-st').textContent, inv: [...document.querySelectorAll('#nx-folha [aria-invalid="true"]')].map(i => i.dataset.tabF + '/' + i.dataset.tabK),
    put: CDF_DEMO.pedidos.filter(x => x === 'PUT tabela').length }));
  t(m.inv.join() === 'Editor/so_eu_cents' && /Só eu/.test(m.st) && m.put === 0, '⟶⟶ valor que não é número marca o campo e não sai do aparelho (' + JSON.stringify(m) + ')');
  await p.fill('#nx-folha [data-tab-f="Editor"][data-tab-k="so_eu_cents"]', '450');
  await p.click('#nx-f-ok'); await p.waitForTimeout(500);
  m = await p.evaluate(() => ({ put: CDF_DEMO.pedidos.filter(x => x === 'PUT tabela').length, folha: !!document.getElementById('nx-folha'), tab: NX_TABELA, selo: NX_SELO && [NX_SELO.pct, NX_SELO.jobs, NX_SELO.verificado],
    linha: (document.querySelector('.nx-li[data-nx="meu-tab"] small') || {}).textContent, anel: (document.querySelector('#nx-selo .nx-selo-anel b') || {}).textContent,
    sub: (document.getElementById('nx-selo-s') || {}).textContent, cartao: (document.querySelector('#nx-meu .nx-cartao-dia') || {}).textContent,
    precos: [PRECOS.base['Op. de câmera'], PRECOS.comeq['Op. de câmera'], PRECOS.base.Editor, PRECOS.hex, PRECOS.desl], minha: minhaTabela() }));
  t(m.put === 1 && !m.folha && m.tab && JSON.stringify(m.tab.linhas) === JSON.stringify([{ funcao: 'Op. de câmera', so_eu_cents: 60000, com_equip_cents: 120000 }, { funcao: 'Editor', so_eu_cents: 45000, com_equip_cents: null }]) &&
    m.tab.meia_pct === 60 && m.tab.fds_pct === null && m.tab.hora_extra_cents === 8000 && m.tab.deslocamento_cents === 15050,
    '⟶⟶ Salvar manda a tabela inteira ao servidor (PUT /api/zro/tabela), em centavos, e o vazio vai null (' + JSON.stringify(m.tab) + ')');
  t(m.selo && m.selo.join() === '94,2,false' && m.anel === '94%' && /Faltam 4 jobs/.test(m.sub) && m.linha === '2 funções · a partir de R$ 450' && /R\$ 450/.test(m.cartao || '') &&
    m.precos.join() === '600,1200,450,80,150.5' && m.minha, '⟶⟶ o medidor sobe com o que o servidor devolveu (94%, faltam 4 jobs), a linha resume e o cartão diz "a partir de" (' + JSON.stringify([m.selo, m.linha, m.cartao]) + ')');
  /* "recarregar": esquece o que a tela tem e relê do servidor */
  m = await p.evaluate(async () => { NX_TABELA = null; NX_SELO = null; PRECOS.base = {}; PRECOS.comeq = {}; nxTabelaCarregar(true); await new Promise(r => setTimeout(r, 300));
    nxMeuFolha('tab'); await new Promise(r => setTimeout(r, 150));
    const val = (f, k) => (document.querySelector('#nx-folha [data-tab-f="' + f + '"][data-tab-k="' + k + '"]') || {}).value;
    const r = { a: val('Op. de câmera', 'so_eu_cents'), b: val('Op. de câmera', 'com_equip_cents'), c: val('Editor', 'so_eu_cents'), d: val('Editor', 'com_equip_cents'),
      meia: v('nx-t-meia').value, fds: v('nx-t-fds').value, hex: v('nx-t-hex').value, desl: v('nx-t-desl').value, pct: NX_SELO && NX_SELO.pct };
    nxFolhaFechar(); return r });
  t(JSON.stringify(m) === JSON.stringify({ a: '600', b: '1200', c: '450', d: '', meia: '60', fds: '', hex: '80', desl: '150,50', pct: 94 }), '⟶⟶ relida do servidor, a tabela volta igual (' + JSON.stringify(m) + ')');
  /* o selo NUNCA sai do aparelho: perfil cheio no aparelho e jobs locais não ligam o ✓; com o servidor dizendo sim, liga */
  m = await p.evaluate(() => { const antes = NX_SELO; EU.jobs = 99; recalcular(); const semSrv = EU.ver;
    NX_SELO = null; recalcular(); const nulo = EU.ver;
    nxSeloAplicar(Object.assign({}, antes, { pct: 94, jobs: 6, verificado: true }));
    const r = { semSrv, nulo, ver: EU.ver, jobs: EU.jobs, tit: (document.getElementById('nx-selo-t') || {}).textContent, ok: !!document.querySelector('#nx-selo .nx-selo-ok'),
      falta: document.querySelectorAll('#nx-selo [data-nx]').length, vf: !!document.querySelector('#nx-meu .nx-vf') };
    nxSeloAplicar(antes); return r });
  t(m.semSrv === false && m.nulo === false && m.ver === true && m.jobs === 6 && m.tit === 'Verificado' && m.ok && m.falta === 0 && m.vf,
    '⟶⟶ o ✓ só vem do servidor: jobs no aparelho não ligam; com o servidor, "Verificado" no medidor e no cartão (' + JSON.stringify(m) + ')');
  /* servidor fora (503 sem_banco): a tela fica com o aparelho, como os outros blocos, e o selo não aparece */
  m = await p.evaluate(async () => { const f0 = window.fetch, antes = [NX_SELO, NX_TABELA];
    window.fetch = (u, o) => /\/api\/zro\/(tabela|selo)/.test(String(u)) ? Promise.resolve(new Response('{"erro":"sem_banco"}', { status: 503 })) : f0(u, o);
    NX_SELO = null; NX_TABELA = null; EU.jobs = 99; nxTabelaCarregar(true); await new Promise(r => setTimeout(r, 200)); recalcular(); nxPintar('meu');
    const s = document.getElementById('nx-selo'), r = { srv: s && s.dataset.srv, ver: EU.ver, dv: s && s.dataset.ver, sub: (document.getElementById('nx-selo-s') || {}).textContent };
    window.fetch = f0; NX_TABELA = antes[1]; nxSeloAplicar(antes[0]); return r });
  t(m.srv === 'false' && m.ver === false && m.dv === 'false' && /conferido na sua conta/.test(m.sub), '⟶⟶ sem o servidor (503), o medidor é do aparelho e nunca dá o selo (' + JSON.stringify(m) + ')');
  /* "Topo viajar" é do servidor: a folha "Onde trabalho" manda viaja no perfil inteiro */
  await p.click('.nx-li[data-nx="meu-onde"]'); await p.waitForTimeout(300);
  await p.click('#nx-f-vj'); await p.click('#nx-f-ok'); await p.waitForTimeout(400);
  m = await p.evaluate(() => ({ viaja: CDF_DEMO.perfil().viaja, eu: EU.viaja, linha: (document.querySelector('.nx-li[data-nx="meu-onde"] small') || {}).textContent,
    selo: CDF_DEMO.pedidos.filter(x => x === 'GET selo').length }));
  t(m.viaja === true && m.eu === true && /topo viajar/.test(m.linha) && m.selo >= 1, '⟶⟶ "Topo viajar" vai ao servidor no perfil, e o selo é relido depois de salvar (' + JSON.stringify(m) + ')');
  /* quem contrata: a tabela e o ✓ de quem o servidor devolveu; quem não tem tabela não ganha "a partir de" */
  await p.evaluate(() => { if (MODO !== 'contratante') v('modo-tog').onclick(); S.only = false; S.lim = 500; show('buscar') }); await p.waitForTimeout(600);
  m = await p.evaluate(() => { const com = CREW.find(c => c.remoto && c.ver && c.tabelaSrv), sem = CREW.find(c => c.remoto && !c.ver && !c.tabelaSrv);
    const linha = c => { const b = linhaDe(c); return { vf: !!b.querySelector('.vfi'), dia: (b.querySelector('.vlr.dito') || {}).textContent || '' } };
    abrirPerfil(com.id); const blk = document.getElementById('p-tab-blk'), tab = !!blk && !blk.hidden, pg = document.getElementById('p-gar').textContent, vf = document.getElementById('p-vf').textContent,
      ring = !!document.querySelector('#p-nums .pring'), linhas = [...document.querySelectorAll('#p-tab .rt-tr:not(.rt-cab)')].length;
    abrirPerfil(sem.id); const tab2 = document.getElementById('p-tab-blk');
    return { n: CREW.filter(c => c.remoto && c.ver).length, com: linha(com), sem: linha(sem), min: com.tabelaSrv.min, tab, linhas, pg, vf, ring,
      esperado: Object.keys(com.tabelaSrv.base).concat(Object.keys(com.tabelaSrv.comeq)).filter((f, i, a) => a.indexOf(f) === i).length, tab2: !!tab2 && !tab2.hidden, semVf: document.getElementById('p-vf').textContent } });
  t(m.n > 0 && m.com.vf && m.com.dia === 'diária a partir de R$ ' + m.min.toLocaleString('pt-BR') && !m.sem.vf && !m.sem.dia,
    'na busca, ✓ e "diária a partir de" só de quem o servidor devolveu (' + JSON.stringify([m.com, m.sem]) + ')');
  t(m.tab && m.linhas === m.esperado && /a partir de/.test(m.pg) && /verificado/.test(m.vf) && !m.ring && !m.tab2 && !/verificado/.test(m.semVf),
    '⟶⟶ no perfil da pessoa, a tabela que ela publicou e o ✓; quem não publicou fica sem tabela e sem ✓ (' + JSON.stringify(m) + ')');
  await p.evaluate(() => { if (MODO !== 'freela') v('modo-tog').onclick() });

  /* 03/11 · O JOB ACONTECEU? (0009; titular: o job só conta para o selo quando os DOIS lados confirmam, depois do dia).
     Na demo: os jobs 4 e 8 estão confirmados; o 10 espera a minha resposta (quem chamou já disse sim), o 11 espera quem
     chamou, e o 12 é um job que EU contratei, esperando a minha resposta de contratante. */
  m = await p.evaluate(async () => { show('jobs'); await new Promise(r => setTimeout(r, 300));
    const passados = PROPOSTAS.filter(x => x.srvTipo === 'job' && x.status === 'aceita' && x.data < key(HOJE)).length;
    const meu = PROPOSTAS.find(x => x.conf && x.conf.pendente), espera = PROPOSTAS.find(x => x.conf && x.conf.minha === true && x.conf.outra === null);
    const contratei = REAL_ENVIADAS.find(x => x.confirmacao && x.confirmacao.pendente);
    const li = srv => document.querySelector('#nx-conf li[data-srv="' + srv + '"]');
    NX.jbFeitos = true; nxJobs();
    const hist = [...document.querySelectorAll('#nx-jb .nx-hist [data-conf]')].map(e => e.dataset.conf + ':' + e.textContent);
    NX.jbFeitos = false; nxJobs();
    return { passados, jobs: NX_SELO && NX_SELO.jobs, meu: meu && meu.srv, contratei: contratei && contratei.id, espera: espera && espera.srv,
      cab: (document.querySelector('#nx-conf h2') || {}).textContent, dica: (document.querySelector('#nx-conf .nx-conf-cab small') || {}).textContent,
      liMeu: !!(meu && li(meu.srv) && li(meu.srv).querySelectorAll('[data-nx="jb-conf"]').length === 2), liContratei: !!(contratei && li(contratei.id) && li(contratei.id).querySelector('[data-sim="0"]')),
      liEspera: !!(espera && li(espera.srv)), hist, bal: (pendenciasAbas().jobs || {}).t || '', seloDica: (document.getElementById('nx-selo-dica') || {}).textContent };
  });
  t(m.passados === 4 && m.jobs === 2, 'job aceito com o dia passado só conta no selo quando os dois confirmam: 4 feitos, 2 no selo (' + JSON.stringify([m.passados, m.jobs]) + ')');
  t(m.cab === 'Aconteceu?' && /os dois confirmam/.test(m.dica || '') && m.liMeu && m.liContratei && !m.liEspera,
    '⟶⟶ Jobs pergunta "Aconteceu?" com Sim e Não nos jobs que esperam a MINHA resposta, dos dois lados (quem fez e quem contratou) (' + JSON.stringify(m) + ')');
  t(m.hist.some(h => h === 'espera:Esperando a outra parte') && m.hist.some(h => h === 'ok:Confirmado pelos dois') && m.hist.some(h => h === 'voce:Falta você'),
    '⟶⟶ no histórico, cada job feito diz o estado: confirmado pelos dois, esperando a outra parte, falta você (' + m.hist.join(' | ') + ')');
  t(/2 jobs para confirmar/.test(m.bal), '⟶⟶ e a aba Jobs ganha o balão do que espera a minha resposta (' + m.bal + ')');
  const antesConf = await p.evaluate(() => ({ patch: CDF_DEMO.pedidos.filter(x => x === 'PATCH propostas').length, selo: CDF_DEMO.pedidos.filter(x => x === 'GET selo').length }));
  await p.click('#nx-conf li[data-srv="' + m.meu + '"] [data-nx="jb-conf"][data-sim="1"]'); await p.waitForTimeout(600);
  let c2 = await p.evaluate(([srv, a]) => { const li = document.querySelector('#nx-conf li[data-srv="' + srv + '"]');
    return { conf: CDF_DEMO.confirmacoes()[srv], botoes: li ? li.querySelectorAll('[data-nx="jb-conf"]').length : -1, pill: li && (li.querySelector('.nx-pill') || {}).textContent,
      patch: CDF_DEMO.pedidos.filter(x => x === 'PATCH propostas').length - a.patch, selo: CDF_DEMO.pedidos.filter(x => x === 'GET selo').length - a.selo, jobs: NX_SELO && NX_SELO.jobs,
      bal: (pendenciasAbas().jobs || {}).t || '' } }, [m.meu, antesConf]);
  t(c2.patch === 1 && c2.conf && c2.conf.para === true && c2.conf.de === true && c2.botoes === 0 && c2.pill === 'Confirmado pelos dois',
    '"Sim" manda a resposta ao servidor (PATCH {acao:"confirmar"}), e o job fica "Confirmado pelos dois" sem botão para mudar (' + JSON.stringify(c2) + ')');
  t(c2.selo >= 1 && c2.jobs === 3 && /1 job para confirmar/.test(c2.bal), '⟶⟶ o selo é relido e sobe para 3 jobs; o balão desce para 1 (' + JSON.stringify([c2.jobs, c2.bal]) + ')');
  await p.evaluate(() => show('meu')); await p.waitForTimeout(400);
  c2 = await p.evaluate(() => ({ dica: (document.getElementById('nx-selo-dica') || {}).textContent, on: document.querySelectorAll('#nx-selo .nx-selo-jobs i[data-on="true"]').length,
    sub: (document.getElementById('nx-selo-s') || {}).textContent }));
  t(c2.dica === 'Job conta quando os dois confirmam.' && c2.on === 3 && /3 jobs/.test(c2.sub), '⟶⟶ Meu perfil: 3 dos 6 traços e "Job conta quando os dois confirmam." (' + JSON.stringify(c2) + ')');
  /* quem contratou: a mesma pergunta no detalhe da proposta que mandou e em Jobs; "Não" fica registrado e não conta */
  await p.evaluate(() => { if (MODO !== 'contratante') v('modo-tog').onclick() });
  c2 = await p.evaluate(async srv => { const pr = nxEnviadas().find(x => x.srv === srv), det = nxPropDet(pr);
    show('jobs'); await new Promise(r => setTimeout(r, 300));
    return { det: /Aconteceu\?/.test(det) && /data-nx="jb-conf"/.test(det) && /data-sim="0"/.test(det), li: !!document.querySelector('#nx-conf li[data-srv="' + srv + '"] [data-sim="0"]') } }, m.contratei);
  t(c2.det && c2.li, 'quem contratou vê "Aconteceu?" no detalhe da proposta que mandou e em Jobs (' + JSON.stringify(c2) + ')');
  await p.click('#nx-conf li[data-srv="' + m.contratei + '"] [data-nx="jb-conf"][data-sim="0"]'); await p.waitForTimeout(600);
  c2 = await p.evaluate(srv => { const li = document.querySelector('#nx-conf li[data-srv="' + srv + '"]'), env = REAL_ENVIADAS.find(x => x.id === srv);
    return { conf: CDF_DEMO.confirmacoes()[srv], pill: li && (li.querySelector('.nx-pill') || {}).textContent, botoes: li ? li.querySelectorAll('[data-nx="jb-conf"]').length : -1,
      det: nxPropDet(nxEnviadas().find(x => x.srv === srv)), jobs: NX_SELO && NX_SELO.jobs, bal: pendenciasAbas().jobs || null, srv: env && env.confirmacao } }, m.contratei);
  t(c2.conf && c2.conf.de === false && c2.pill === 'Não aconteceu' && c2.botoes === 0 && /Não aconteceu/.test(c2.det) && !/jb-conf/.test(c2.det) && c2.jobs === 3 && !c2.bal,
    '⟶⟶ "Não" fica registrado ("Não aconteceu"), não volta a perguntar, não mexe no meu selo, e o balão apaga (' + JSON.stringify([c2.conf, c2.pill, c2.jobs, c2.bal]) + ')');
  /* (03/11, 0010) cancelar só até a véspera: o job aceito que eu mandei, com o dia chegado, não tem "Cancelar" (o
     servidor recusa com 409 dia); no dia a nota diz "Depois do dia, responda se aconteceu."; a proposta nova cancela */
  c2 = await p.evaluate(async srv => {
    const passado = nxEnviadas().find(x => x.srv === srv), nova = nxEnviadas().find(x => x.status === 'novo' && x.srvTipo === 'job');
    const noDia = nxPropDet(Object.assign({}, nova, { status: 'aceita', cancelavel: false, conf: { aberta: false, minha: null, outra: null, pendente: false, confirmado: false } }));
    const antes = CDF_DEMO.pedidos.filter(x => x === 'PATCH propostas').length;
    const r = await cfbPedir('PATCH', '/api/zro/propostas?id=' + encodeURIComponent(srv), { estado: 'cancelada' });
    return { canc: passado.cancelavel, botao: /pp-cancela/.test(nxPropDet(passado)), status: r.status, j: r.j, msg: cfbMsg(r), patch: CDF_DEMO.pedidos.filter(x => x === 'PATCH propostas').length - antes,
      estado: (await cfbPedir('GET', '/api/zro/propostas')).j.enviadas.find(x => x.id === srv).estado,
      noDia: /data-chegou="1"/.test(noDia) && /Depois do dia, responda se aconteceu\./.test(noDia) && !/pp-cancela/.test(noDia), nova: nova && nova.id, novaCanc: nova && nova.cancelavel };
  }, m.contratei);
  t(c2.canc === false && !c2.botao && c2.status === 409 && c2.j && c2.j.erro === 'dia' && c2.j.campo === 'dia' && c2.msg === 'Depois do dia, responda se aconteceu.' && c2.estado === 'aceita',
    'job aceito que eu mandei, com o dia chegado: sem "Cancelar", e o PATCH de cancelar é recusado (409 dia) (' + JSON.stringify(c2) + ')');
  t(c2.noDia, '⟶⟶ no dia do job aceito: sem "Cancelar", e a nota diz "Depois do dia, responda se aconteceu."');
  await p.evaluate(async id => { show('propostas'); await new Promise(r => setTimeout(r, 200)); NX.pp = 'env'; NX.ppSel = id; nxPropostas() }, c2.nova);
  const cancBt = '#nx-prop .nx-pp-det [data-nx="pp-cancela"]';
  const antesCanc = await p.evaluate(() => CDF_DEMO.pedidos.filter(x => x === 'PATCH propostas').length);
  const temCanc = c2.novaCanc === true && await p.locator(cancBt).isVisible();
  await p.click(cancBt); await p.waitForTimeout(150);
  const primeiro = await p.evaluate(([sel, a]) => ({ txt: (document.querySelector(sel) || {}).textContent, patch: CDF_DEMO.pedidos.filter(x => x === 'PATCH propostas').length - a }), [cancBt, antesCanc]);
  await p.click(cancBt); await p.waitForTimeout(600);
  c2 = await p.evaluate(([id, a]) => { const e = nxEnviadas().find(x => x.id === id), it = document.querySelector('#nx-prop [data-nx="pp-sel"][data-id="' + id + '"]');
    return { patch: CDF_DEMO.pedidos.filter(x => x === 'PATCH propostas').length - a, canc: e && e.canc, cancelavel: e && e.cancelavel, pill: it && (it.querySelector('.nx-pill') || {}).textContent,
      botao: !!document.querySelector('#nx-prop .nx-pp-det [data-nx="pp-cancela"]'), nota: (document.querySelector('#nx-prop .nx-pp-det .nx-pe-nota') || {}).textContent } }, [c2.nova, antesCanc]);
  t(temCanc && primeiro.txt === 'Cancelar mesmo?' && primeiro.patch === 0 && c2.patch === 1 && c2.canc === true && c2.cancelavel === false && c2.pill === 'cancelada' && !c2.botao && c2.nota === 'Você cancelou.',
    '⟶⟶ a proposta nova que eu mandei tem "Cancelar" (dois toques): vai ao servidor e fica "cancelada" (' + JSON.stringify([temCanc, primeiro, c2]) + ')');
  await p.evaluate(() => { if (MODO !== 'freela') v('modo-tog').onclick() });

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
    fim.perfil.portfolio === 'https://instagram.com/voce.demo' && fim.perfil.visibilidade === 'contratantes' && fim.perfil.viaja === true,
    '⟶⟶ concluir manda o perfil ao servidor (PUT /api/zro/perfil) com praça, "topo viajar", funções, portfólio e a busca ligada (' + JSON.stringify(fim.perfil) + ')');
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
