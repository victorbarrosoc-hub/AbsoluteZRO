/* O SITE REAL — o que o domínio serve desde 30/out (`node src/build.js --real`).
 *
 * Victor: "pode apagar esses 109 perfis fictícios, vamos começar com os
 * usuários que já estão no ecossistema." A página do domínio nasce sem
 * ninguém dentro: nem pessoa, nem job, nem post, nem anúncio. Quem aparece
 * vem de /api/zro/pessoas, e a MINHA agenda mora no banco (/api/zro/agenda).
 *
 * O que a suíte jura:
 *   - nenhum nome da base fictícia está na página nem no script dela;
 *   - o app abre sem erro com o CREW de uma pessoa só (a conta de quem abre);
 *   - nada simula: sem "Simular chamada", sem produtora de exemplo, sem
 *     assinatura de mentira, sem tempo de resposta inventado;
 *   - com a conta liberada, a busca vem do servidor e só traz quem divulgou a
 *     agenda (agenda !== null), nunca a própria conta duas vezes;
 *   - o status de cada pessoa sai da agenda que ELA declarou;
 *   - declarar e liberar um dia vira PUT e DELETE no servidor. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ok = [], bad = []; const t = (c, m) => (c ? ok : bad).push(m);
const RAIZ = path.resolve(__dirname, '..');

(async () => {
  execFileSync(process.execPath, [path.join(RAIZ, 'src/build.js'), '--real'], { cwd: RAIZ, stdio: 'pipe' });
  const pagina = path.join(RAIZ, 'public/real.html');
  const html = fs.readFileSync(pagina, 'utf8');
  const js = (html.match(/m\/app\.[0-9a-f]{10}\.js/) || [])[0];
  const txt = html + (js ? fs.readFileSync(path.join(RAIZ, 'public', js), 'utf8') : '');
  const ficticios = JSON.parse(fs.readFileSync(path.join(RAIZ, 'src/crew.json'), 'utf8')).filter(c => !c.me).map(c => c.nome);
  const achados = ficticios.filter(n => txt.includes(n));
  t(ficticios.length > 100 && achados.length === 0, 'nenhum dos ' + ficticios.length + ' nomes fictícios na página do domínio'
    + (achados.length ? ' — achei ' + achados.length + ', ex.: ' + achados[0] : ''));
  t(html.includes('<meta name="cdf-real" content="1">') && html.includes('<meta name="cdf-fase" content="1">'),
    'a página se declara real e na fase 1 (agenda e brechó, sem dinheiro)');

  const b = await require('./_navegador.js').abrir();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR: ' + e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://' + pagina, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3200);

  let m = await p.evaluate(() => ({
    real: REAL, crew: CREW.length, me: !!(CREW[0] && CREW[0].me), jobs: JOBS.length, posts: POSTS.length,
    anuncios: ANUNCIOS.length, propostas: PROPOSTAS.length, escalas: ESCALAS.length, prod: PROD.nome,
    resp: EU.resp, jobsEu: EU.jobs, streak: EU.streak,
    sim: (() => { const e = document.getElementById('pp-sim'); return !!(e && e.closest('.eco') && !e.closest('.eco').hidden) })()
  }));
  t(m.real && m.crew === 1 && m.me, 'o CREW leva só a conta de quem abre');
  t(m.jobs + m.posts + m.anuncios + m.propostas + m.escalas === 0, 'nada semeado: jobs, posts, anúncios, propostas e escalas vazios');
  t(m.prod === '', 'a conta de quem contrata nasce em branco (nenhuma produtora de exemplo)');
  t(m.resp === null && m.jobsEu === 0 && m.streak === 0, 'nada de reputação inventada: resposta, jobs e sequência zerados');
  t(!m.sim, '"Simular uma chamada" não existe no site real');

  /* a home (30/out, "refaz a homepage pra atualizar"): só o que existe — a manchete real, como funciona, os três
     cartões, a Z e o fechamento; somem a prévia de busca, os recursos, a praça, os planos, o selo Prévia e a fase */
  m = await p.evaluate(() => {
    show('home');
    const vis = e => !!e && !e.hidden && !e.closest('[hidden]');
    const blocos = [...document.querySelectorAll('#v-home > *')].filter(vis).map(e => e.id || e.className.split(' ')[0]);
    const txt = document.getElementById('v-home').innerText;
    return { blocos, titulo: document.getElementById('hh-t').textContent, fim: document.getElementById('hf-t').textContent,
      chip: vis(document.getElementById('fasechip')), previa: vis(document.querySelector('.fim-prev')),
      planosLink: [...document.querySelectorAll('.hlinks a, .fim-links a')].filter(vis).map(a => a.getAttribute('href')),
      dinheiro: /R\$|fictí|demonstra|Volante|Frota|take/i.test(txt), cartoes: document.querySelectorAll('#h-real .passo').length };
  });
  t(m.blocos.join(',') === 'hero,h-como,h-real,h-z,fim2', 'a home real tem só cinco blocos: topo, como funciona, os cartões, a Z e o fechamento (' + m.blocos.join(', ') + ')');
  t(m.titulo === 'Quem está livre, na data certa.' && m.fim === m.titulo, 'a manchete é a do site real, em cima e no fechamento');
  t(m.cartoes === 3, 'três cartões: marcar o dia, achar quem está livre, contato protegido');
  t(!m.dinheiro, 'a home não fala de preço, plano, moeda nem dado de demonstração');
  t(!m.chip && !m.previa, 'sem o chip de fase e sem o selo "Prévia": é o produto, não um teste');
  t(!m.planosLink.includes('#h-planos') && !m.planosLink.includes('#h-rec') && m.planosLink.includes('#h-real'),
    'os links do topo e do pé apontam para o que está na página');

  /* a linha visual B (30/out, aprovada): escuro fosco do ecossistema, o símbolo de sempre no topo e títulos sem degradê */
  m = await p.evaluate(() => {
    const raiz = getComputedStyle(document.documentElement);
    const selo = document.querySelector('.hp-texto .zselo');
    const r = selo && selo.getBoundingClientRect();
    const hl = document.querySelector('#hh-t .hl');
    return { classe: document.documentElement.classList.contains('real'), grafite: raiz.getPropertyValue('--grafite').trim().toLowerCase(),
      selo: !!(selo && !selo.hidden && r.width > 60), carro: !!(selo && selo.querySelector('.selo-carro')),
      degrade: hl ? getComputedStyle(hl).backgroundImage : '', foto: raiz.getPropertyValue('--real-foto').includes('home-poster') };
  });
  t(m.classe && m.grafite === '#0e0e10', 'o escuro é o grafite fosco do ecossistema (#0e0e10), nunca preto 100% (' + m.grafite + ')');
  t(m.selo && m.carro, 'o símbolo de sempre (anel, barras e o carrinho) abre o topo da home');
  t(m.degrade === 'none', 'o título é fino × pesado, sem texto em degradê');
  t(m.foto, 'a foto de Natal à noite é o fundo da home e da entrada');

  m = await p.evaluate(() => { const antes = typeof ASSINANTE !== 'undefined' && ASSINANTE; abrirAssinatura('volante');
    const form = document.getElementById('as-form'); return { antes, depois: typeof ASSINANTE !== 'undefined' && ASSINANTE,
      aberto: !!(form && form.offsetParent) } });
  t(!m.depois && !m.aberto, 'assinar o Volante não abre checkout de mentira — os planos são da Absolute ZRO e ainda não abriram');

  /* com a conta liberada: o servidor responde (fetch trocado, como o HUB falso das outras suítes) */
  m = await p.evaluate(async () => {
    const hoje = key(HOJE), am = key(dateAt(1)), d2 = key(dateAt(2));
    const pedidos = [];
    window.fetch = async (u, o) => {
      const met = (o && o.method) || 'GET';
      pedidos.push(met + ' ' + u + (o && o.body ? ' ' + o.body : ''));
      const J = (s, j) => new Response(JSON.stringify(j), { status: s, headers: { 'Content-Type': 'application/json' } });
      if (u.startsWith('/api/zro/agenda') && met === 'GET') return J(200, { agenda: { [am]: { e: 'fechado', p: 'dia' } } });
      if (u.startsWith('/api/zro/agenda') && met === 'PUT') return J(200, { dia: d2, declaracao: {} });
      if (u.startsWith('/api/zro/agenda') && met === 'DELETE') return new Response(null, { status: 204 });
      if (u.startsWith('/api/zro/pessoas')) return J(200, { agendas: true, pessoas: [
        { id: 'aaaaaaaa-0000-4000-8000-000000000001', arroba: 'pessoa.um', nome: 'Pessoa Um', foto: null, cidade: 'Natal/RN',
          funcoes: ['Op. de câmera'], nichos: [], bio: null, portfolio: null, agenda: { [hoje]: { e: 'fechado', p: 'dia' } } },
        { id: 'aaaaaaaa-0000-4000-8000-000000000002', arroba: 'pessoa.dois', nome: 'Pessoa Dois', foto: null, cidade: 'Natal/RN',
          funcoes: ['Editor'], nichos: [], bio: null, portfolio: null, agenda: { [hoje]: { e: 'negociando', p: 'manha' } } },
        { id: 'aaaaaaaa-0000-4000-8000-000000000003', arroba: 'sem.agenda', nome: 'Sem Agenda', foto: null, cidade: null,
          funcoes: [], nichos: [], bio: null, portfolio: null, agenda: null },
        { id: 'eeeeeeee-0000-4000-8000-00000000000e', arroba: 'eu', nome: 'Eu', foto: null, cidade: null,
          funcoes: [], nichos: [], bio: null, portfolio: null, agenda: {} }] });
      return J(404, {});
    };
    zroPodeEnviar = () => true;
    ZRO_CONTA = { sub: 'EEEEEEEE-0000-4000-8000-00000000000E', nome: 'Conta Teste', liberado: true };
    realCarregar();
    await new Promise(r => setTimeout(r, 400));
    const remotos = CREW.filter(c => c.remoto);
    const r = { nomes: remotos.map(c => c.nome), st: remotos.map(c => status(c, 0) + '/' + status(c, 1)),
      agenda: JSON.stringify(AGENDA), eu: EU.nome, euSt: status(EU, 1) };
    declarar(d2, 'negociando', 'manha', '13:00');
    liberarDia(am);
    await new Promise(r2 => setTimeout(r2, 200));
    show('buscar'); await new Promise(r2 => setTimeout(r2, 300));
    r.busca = (document.getElementById('rows') || {}).innerText || '';
    r.pedidos = pedidos; r.d2 = d2; r.am = am;
    return r;
  });
  t(m.pedidos[0] && /^GET \/api\/zro\/agenda\?de=/.test(m.pedidos[0]) && m.pedidos.some(x => /^GET \/api\/zro\/pessoas\?de=/.test(x)),
    'ao entrar, a agenda e a busca vêm do servidor');
  t(m.nomes.join(',') === 'Pessoa Um,Pessoa Dois', 'na busca só quem divulgou a agenda, e a própria conta não entra duas vezes ('
    + m.nomes.join(', ') + ')');
  t(m.st[0] === 'ocupado/livre' && m.st[1] === 'segura/livre',
    'o status sai da agenda declarada: dia fechado ocupa, manhã negociando segura, o resto é livre (' + m.st.join(' · ') + ')');
  t(m.euSt === 'ocupado' && m.eu === 'Conta Teste', 'a minha agenda volta do banco, e o nome vem da conta Absolute ZRO');
  t(m.pedidos.some(x => x === 'PUT /api/zro/agenda {"dia":"' + m.d2 + '","estado":"negociando","parte":"manha","hora":"13:00"}'),
    'declarar um dia manda o dia ao servidor (PUT)');
  t(m.pedidos.some(x => x === 'DELETE /api/zro/agenda?dia=' + m.am), 'liberar o dia apaga no servidor (DELETE)');
  t(!/responde em (null|undefined)/.test(m.busca) && /Pessoa Um/.test(m.busca), 'a busca mostra quem veio, sem tempo de resposta inventado');

  /* (30/out · 4, o lançamento) nada de protótipo dentro do app: sem planos, cursos, anúncio por WhatsApp nem
     orçamento com taxa; a escada de planos não tranca; sem "Prévia", sem simulação e sem o Supabase do original */
  m = await p.evaluate(() => {
    const vis = e => !!e && !e.hidden && !e.closest('[hidden]');
    const menu = [...document.querySelectorAll('[data-tab],[data-ir]')].filter(vis).map(e => e.dataset.tab || e.dataset.ir);
    show('planos'); const planos = S.tab; show('aprender'); const aprender = S.tab;
    abrirGuia(); const portas = [...document.querySelectorAll('#qp-portas [data-porta]')].map(b => b.dataset.porta);
    const guiaTxt = document.getElementById('qp-portas').innerText; fecharGuia();
    return { menu, planos, aprender, portas, guiaTxt, nivel: temNivel(NIVEL.FROTA), vivo: vivoPode(), nuvem: nuvemLigada(),
      previa: [...document.querySelectorAll('[data-previa]')].filter(vis).length,
      zerar: vis(document.getElementById('g-zerar')), movimento: vis(document.getElementById('g-vivo')),
      zap: vis(document.getElementById('ag-zap')) || vis(document.getElementById('cd-zap')) };
  });
  t(!['planos', 'aprender', 'passar', 'orcar'].some(x => m.menu.includes(x)) && m.planos === 'meu' && m.aprender === 'meu',
    'Planos, Aprender, Passar o carro e Orçamento não existem no site real (nem pelo menu, nem pelo show) — '
    + JSON.stringify({ menu: m.menu.filter(x => ['planos', 'aprender', 'passar', 'orcar'].includes(x)), planos: m.planos, aprender: m.aprender }));
  t(m.nivel, 'a escada de planos do protótipo não tranca nada: o plano é o da conta Absolute ZRO');
  t(m.portas.join(',') === 'agenda,meu,achar' && !/dinheiro|sinal|contrato/i.test(m.guiaTxt),
    'o guia de entrada mostra só o que funciona: agenda, perfil e achar (' + m.portas.join(', ') + ')');
  t(!m.previa && !m.zerar && !m.movimento && !m.zap,
    'sem "Prévia", "Recomeçar do zero", "Movimento na praça" nem lembrete no WhatsApp');
  t(!m.vivo && !m.nuvem, 'nada se simula e nada vai ao Supabase do app original');

  t(errs.length === 0, 'zero erro de console/página' + (errs.length ? ' — ' + errs[0] : ''));

  console.log('SITE REAL');
  ok.forEach(x => console.log('  ✓ ' + x));
  bad.forEach(x => console.log('  ✗ ' + x));
  console.log(ok.length + ' ok, ' + bad.length + ' falhas');
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
