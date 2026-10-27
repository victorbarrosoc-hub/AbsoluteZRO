/* A CONTA ABSOLUTE ZRO NA TELA DE ENTRAR (25/out).
 *
 * O Carro do Freela entrou no login único da Absolute ZRO (ADR 0012, app
 * da família: sem tela de permissão). O servidor é api/zro/ e tem o teste
 * dele (test/api/zro.test.js); esta suíte olha o lado da TELA, servida do
 * jeito que o domínio entrega — rotas do build, funções de verdade e uma
 * Absolute ZRO falsa, local, com chave EC P-256.
 *
 * O que ela jura:
 *   1. FORA DO DOMÍNIO NADA MUDA: aberto do disco (file://) ou num servidor
 *      sem as funções, o botão não aparece e o console fica limpo — a
 *      bateria inteira reprova erro de console;
 *   2. no domínio, sem sessão, o botão "Continuar com Absolute ZRO" aparece
 *      no mesmo estilo dos outros e leva ao HUB;
 *   3. a volta do HUB (?zro=entrou) entra no app como o login do protótipo
 *      entra, com o NOME e o E-MAIL da conta — e a marca some do endereço;
 *   4. com sessão, o botão entra direto; sair apaga a sessão deste site;
 *   5. erro na volta vira aviso na tela de entrar, nunca tela quebrada.
 *
 * CONTA ÚNICA (25/out · 2, regra do titular):
 *   6. no domínio a porta é a Absolute ZRO: quem chega agora não vê o
 *      formulário próprio nem o Google — o Carro não cria conta própria;
 *   7. "Criar conta" vai ao HUB com prompt=create e volta já dentro, no perfil;
 *   8. sem "carro-do-freela" em zro_products a pessoa entra, mas só vê o
 *      aviso curto e a porta para a Absolute ZRO; com o produto, entra;
 *   9. conta antiga deste aparelho (sem vínculo ZRO) continua entrando.
 *
 * JOB → PROJETO (26/out · 3):
 *  10. quem contrata leva o job à Absolute ZRO pelo painel do job: o HUB
 *      recebe o job/1 com o briefing inteiro e a equipe que TEM conta; quem
 *      não tem aparece como "sem conta", e o botão vira "Abrir". Fora do
 *      domínio o bloco não existe.
 *
 * A Z, A IA DO ECOSSISTEMA (27/out · 4; aba própria desde 27/out · 5):
 *  11. no domínio a Z tem aba própria, a primeira e a tela de entrada (o
 *      botão em destaque à esquerda do topo no celular, o primeiro item da
 *      lateral no computador): quem entra cai nela, e o Feed volta a ser só
 *      o Feed. Com conta liberada o <zro-ia> conversa por /api/zro/ia
 *      (função de verdade → HUB falso), a resposta chega em streaming e
 *      nenhum token aparece na página. Sem o acesso da Z, aparece
 *      "Reconectar com Absolute ZRO", dentro da aba. Fora do domínio a aba
 *      não aparece e nada é pedido à absolutezro.com.
 *      O script do painel vem do próprio repositório (apps/hub-web), por
 *      rota do Playwright: a suíte não sai para a internet.
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const { iniciarZroFalsa } = require('./api/zro-falso.js');
const ok = [], bad = []; const t = (c, m) => (c ? ok : bad).push(m);
const RAIZ = path.resolve(__dirname, '..');
const CLIENTE = { clientId: 'carrodofreela-web', clientSecret: 'segredo-da-suite-conta-zro' };
const HUB_PUBLIC = path.resolve(RAIZ, '..', '..', 'apps', 'hub-web', 'public');

/* o domínio em miniatura: o build interno + as funções + as rotas do build */
function montarSaida(semFuncoes) {
  const SEG = require('../src/seguranca.js');
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'carro-conta-zro-'));
  fs.mkdirSync(path.join(saida, 'static'), { recursive: true });
  const html = fs.readFileSync(path.join(RAIZ, 'public', 'index.html'), 'utf8');
  fs.writeFileSync(path.join(saida, 'static', 'index.html'), html);
  fs.cpSync(path.join(RAIZ, 'public', 'm'), path.join(saida, 'static', 'm'), { recursive: true });
  for (const f of ['apple-touch-icon.png', 'icone-192.png', 'icone-512.png', 'icone-maskable.png', 'app.webmanifest', 'og.jpg'])
    fs.copyFileSync(path.join(RAIZ, 'public', f), path.join(saida, 'static', f));
  if (!semFuncoes) for (const n of ['entrar', 'callback', 'eu', 'sair', 'enviar', 'ia']) {
    const dir = path.join(saida, 'functions', 'api', 'zro', n + '.func');
    fs.mkdirSync(path.join(dir, 'api', 'zro'), { recursive: true });
    for (const f of [n + '.js', '_zro.js']) fs.copyFileSync(path.join(RAIZ, 'api', 'zro', f), path.join(dir, 'api', 'zro', f));
    fs.writeFileSync(path.join(dir, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: 'api/zro/' + n + '.js', launcherType: 'Nodejs' }));
  }
  const csp = SEG.politica(SEG.scriptsDoHtml(html), SEG.conexoes({}));
  fs.writeFileSync(path.join(saida, 'config.json'), JSON.stringify({ version: 3, routes: SEG.rotasVercel(csp, ['index']) }));
  return saida;
}

(async () => {
  const zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret });
  zro.estado.proximo = { pessoa: { sub: 'zro-42', email: 'rita@coletivo.com', nome: 'Rita Duarte', org: 'Coletivo Rita' }, negar: false, adulterar: null };
  const { servirSaida } = require('../src/servir-saida.js');
  const saidas = [montarSaida(false), montarSaida(true)];
  const srv = [], BASE = [];
  for (const s of saidas) {
    const x = servirSaida(s); await new Promise(r => x.listen(0, '127.0.0.1', r));
    srv.push(x); BASE.push('http://127.0.0.1:' + x.address().port + '/');
  }
  const [DOMINIO, SEM_FUNCOES] = BASE;
  const b = await require('./_navegador.js').abrir();

  const RITA = { sub: 'zro-42', email: 'rita@coletivo.com', nome: 'Rita Duarte', org: 'Coletivo Rita' };
  const abrir = async (url, opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const erros = [], pedidos = [], deFora = [];
    /* o painel da Z vem da absolutezro.com: aqui, do próprio repositório */
    await ctx.route('https://absolutezro.com/**', rt => {
      const u = new URL(rt.request().url()); deFora.push(u.pathname);
      const f = path.join(HUB_PUBLIC, decodeURIComponent(u.pathname));
      if (f.startsWith(HUB_PUBLIC) && fs.existsSync(f) && fs.statSync(f).isFile())
        return rt.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript; charset=utf-8' : f.endsWith('.webp') ? 'image/webp' : 'application/octet-stream', headers: { 'access-control-allow-origin': '*' } });
      return rt.fulfill({ status: 404, body: '' });
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => erros.push(e.message));
    /* o 401 do /eu sem sessão é a resposta CERTA do contrato, e o favicon.ico
       nunca existiu no domínio (o Chromium pede sozinho); o resto reprova */
    p.on('console', m => { const u = (m.location() && m.location().url) || '';
      if (m.type() === 'error' && !/\/favicon\.ico$/.test(u) && !(opts.aceita401 && /status of 401/.test(m.text()))) erros.push(m.text() + ' @ ' + u) });
    p.on('request', r => { if (/\/api\/zro\//.test(r.url())) pedidos.push(r.url()) });
    await p.addInitScript(antigo => { try { localStorage.setItem('cdf-pv', '1'); localStorage.setItem('cdf-guia', '1');
      if (antigo) localStorage.setItem('cdf-entrou', '1') } catch (e) {} }, !!opts.antigo);
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(400);
    return { ctx, p, erros, pedidos, deFora };
  };
  const telaEntrar = async p => { await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(900) };
  const botao = p => p.evaluate(() => { const e = document.getElementById('lg-zro'), f = document.getElementById('lg-form'),
      g = document.querySelector('#lg-cx [data-login="Google"]');
    return { existe: !!e, escondido: e.hidden, visivel: !!(e.offsetParent), texto: e.innerText.trim(), classe: e.className,
      altura: e.getBoundingClientRect().height, alturaOk: document.getElementById('lg-ok').getBoundingClientRect().height,
      form: !!f.offsetParent, google: !!(g && g.offsetParent), antesDoForm: !!(e.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING),
      bloq: !document.getElementById('lg-bloq').hidden } });
  const tela = p => p.evaluate(() => Object.keys(views).find(k => !views[k].hidden));

  /* ============ 1. fora do domínio, nada muda ============ */
  {
    const { ctx, p, erros, pedidos, deFora } = await abrir('file://' + path.join(RAIZ, 'public', 'index.html'));
    t(await p.evaluate(() => { const z = document.getElementById('v-z'); return z.hidden && !z.offsetParent && !document.querySelector('zro-ia') && document.getElementById('tab-z').hidden && document.getElementById('z-top').hidden }), '⟶⟶ aberto do disco, a aba da Z não aparece (nem o painel, nem os botões)');
    t(deFora.length === 0, 'e nada é pedido à absolutezro.com (' + deFora.join(', ') + ')');
    await telaEntrar(p);
    const r = await botao(p);
    t(r.existe && r.escondido && !r.visivel, '⟶⟶ aberto do disco, o botão da Absolute ZRO não aparece');
    t(r.form && r.google && !r.bloq, 'e a prévia segue como era: formulário e Google à vista');
    t(pedidos.length === 0, 'e o app nem pergunta por /api/zro (' + pedidos.length + ' pedidos)');
    t(await p.evaluate(() => !zroPodeEnviar()), 'nem oferece levar job à Absolute ZRO');
    t(erros.length === 0, 'console limpo no file:// ' + erros.slice(0, 2).join(' · '));
    await ctx.close();
  }
  {
    const { ctx, p, erros } = await abrir(SEM_FUNCOES);
    await telaEntrar(p);
    const r = await botao(p);
    t(r.escondido, 'num servidor sem as funções (404), o botão continua escondido — porta que dá em erro é pior que nenhuma');
    t(erros.every(e => /status of 404/.test(e) && /\/api\/zro\/eu$/.test(e)), 'e o único ruído possível é o 404 do /api/zro/eu desse servidor, sem exceção da página ' + erros.join(' · '));
    await ctx.close();
  }

  /* ============ 2 e 3. no domínio: sem sessão → HUB → de volta, dentro ============ */
  {
    const { ctx, p, erros } = await abrir(DOMINIO, { aceita401: true });
    await telaEntrar(p);
    const r = await botao(p);
    t(!r.escondido && r.visivel, '⟶⟶ no domínio, sem sessão, o botão da Absolute ZRO aparece');
    t(r.texto === 'Entrar com Absolute ZRO', 'com o texto combinado (' + r.texto + ')');
    t(/\bblogin\b/.test(r.classe) && /\bprim\b/.test(r.classe) && r.altura >= 47 && r.altura <= 55, 'é a porta principal, na altura de botão da tela (' + r.altura + 'px)');
    t(!r.form && !r.google, '⟶⟶ conta única: quem chega agora não vê formulário próprio nem Google');
    await p.evaluate(() => { LG_MODO = 'criar'; pintarLogin() });
    const rc = await botao(p);
    t(rc.texto === 'Criar conta Absolute ZRO' && !rc.form && !rc.google, 'no modo criar, só a conta Absolute ZRO (' + rc.texto + ')');
    await p.evaluate(() => { LG_MODO = 'entrar'; pintarLogin() });
    await p.locator('[data-lgtipo="contratante"]').click();
    await Promise.all([p.waitForURL(/zro=|\/$/, { timeout: 15000 }).catch(() => {}), p.locator('#lg-zro').click()]);
    await p.waitForFunction(() => typeof ZRO_CONTA !== 'undefined' && ZRO_CONTA && MODO, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1200);
    const d = await p.evaluate(() => ({ url: location.pathname + location.search, conta: ZRO_CONTA, modo: MODO,
      nome: EU.nome, email: EU.email, entrou: localStorage.getItem('cdf-entrou'),
      tela: Object.keys(views).find(k => !views[k].hidden) }));
    t(d.url === '/', '⟶⟶ voltou do HUB e a marca ?zro=entrou saiu do endereço (' + d.url + ')');
    t(d.conta && d.conta.email === 'rita@coletivo.com' && d.conta.nome === 'Rita Duarte', 'a conta é a do HUB: nome e e-mail reais');
    t(d.entrou === '1', '⟶⟶ entrou no app como o login do protótipo entra (a porta foi marcada)');
    t(d.modo === 'contratante', 'e do lado que a pessoa escolheu antes de ir (' + d.modo + ')');
    t(d.nome === 'Rita Duarte' && d.email === 'rita@coletivo.com', 'o perfil novo nasce com o nome e o e-mail da conta (' + d.nome + ' · ' + d.email + ')');
    t(zro.estado.ultimoAuthorize && zro.estado.ultimoAuthorize.prompt === undefined, 'entrar não pede prompt ao HUB');
    t(erros.length === 0, 'nenhum erro no caminho inteiro: ' + erros.slice(0, 2).join(' · '));

    /* ============ 4. com sessão: o botão entra direto; sair apaga ============ */
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(600);
    await p.evaluate(() => { LG_MODO = 'entrar'; pintarLogin(); show('entrar') });
    await p.waitForTimeout(300);
    const s = await p.evaluate(() => ({ b: !document.getElementById('lg-zro').hidden, nota: document.querySelector('#lg-nota span').textContent,
      title: document.getElementById('lg-zro').title }));
    t(s.b && /rita@coletivo\.com/.test(s.nota) && /rita@coletivo\.com/.test(s.title), 'com sessão, a tela de entrar diz com qual conta vai entrar (' + s.nota + ')');
    const antes = zro.estado.trocas;
    await p.locator('#lg-zro').click(); await p.waitForTimeout(900);
    const dentro = await p.evaluate(() => ({ url: location.pathname, entrar: !document.getElementById('v-entrar').hidden }));
    t(dentro.url === '/' && !dentro.entrar && zro.estado.trocas === antes, '⟶⟶ com sessão o botão entra direto, sem ir ao HUB de novo');
    await p.evaluate(() => document.getElementById('g-sair').click());
    await p.waitForTimeout(700);
    const eu = await p.evaluate(async () => (await fetch('/api/zro/eu', { cache: 'no-store' })).status);
    t(eu === 401 && await p.evaluate(() => ZRO_CONTA === null), '⟶⟶ Sair apaga a sessão deste site (/eu volta a dar 401)');
    await ctx.close();
  }

  /* ============ 5. erro na volta vira aviso ============ */
  {
    const { ctx, p, erros } = await abrir(DOMINIO + '?zro=recusado', { aceita401: true });
    const r = await p.evaluate(() => ({ entrar: !document.getElementById('v-entrar').hidden, aviso: document.getElementById('lg-erro').textContent,
      url: location.search }));
    t(r.entrar && /não foi liberado/.test(r.aviso), '⟶⟶ acesso negado no HUB abre a tela de entrar com o aviso (' + r.aviso + ')');
    t(r.url === '', 'e a marca sai do endereço');
    t(erros.length === 0, 'sem erro de página: ' + erros.join(' · '));
    await ctx.close();
  }

  /* ============ 7. criar conta = prompt=create, e volta no perfil ============ */
  {
    zro.estado.proximo = { pessoa: Object.assign({}, RITA, { sub: 'zro-43' }), negar: false, adulterar: null };
    const { ctx, p, erros } = await abrir(DOMINIO, { aceita401: true });
    await telaEntrar(p);
    await p.locator('#lg-cad').click(); await p.waitForTimeout(300);
    t((await botao(p)).texto === 'Criar conta Absolute ZRO', '⟶⟶ "Criar conta" vira "Criar conta Absolute ZRO"');
    await Promise.all([p.waitForURL(/\/$/, { timeout: 15000 }).catch(() => {}), p.locator('#lg-zro').click()]);
    await p.waitForFunction(() => typeof ZRO_CONTA !== 'undefined' && ZRO_CONTA && MODO, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1200);
    t(zro.estado.ultimoAuthorize.prompt === 'create', '⟶⟶ o HUB recebe prompt=create (' + zro.estado.ultimoAuthorize.prompt + ')');
    const d = await p.evaluate(() => ({ url: location.pathname + location.search, entrou: localStorage.getItem('cdf-entrou') }));
    const tl = await tela(p);
    t(d.url === '/' && d.entrou === '1', 'volta já dentro, e a marca sai do endereço (' + d.url + ')');
    t(tl === 'cadastro', 'quem acabou de criar a conta cai no perfil (' + tl + ')');
    t(erros.length === 0, 'sem erro: ' + erros.slice(0, 2).join(' · '));
    await ctx.close();
  }

  /* ============ 8. sem o produto liberado: entra, mas fica no aviso ============ */
  {
    zro.estado.proximo = { pessoa: Object.assign({}, RITA, { sub: 'zro-44', produtos: ['nossom'] }), negar: false, adulterar: null };
    const { ctx, p, erros } = await abrir(DOMINIO, { aceita401: true });
    await telaEntrar(p);
    await Promise.all([p.waitForURL(/\/$/, { timeout: 15000 }).catch(() => {}), p.locator('#lg-zro').click()]);
    await p.waitForFunction(() => typeof ZRO_CONTA !== 'undefined' && ZRO_CONTA, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1200);
    const r = await p.evaluate(() => { const bl = document.getElementById('lg-bloq'), a = document.getElementById('lg-bloq-ir');
      return { liberado: ZRO_CONTA && ZRO_CONTA.liberado, bloq: !bl.hidden && !!bl.offsetParent, texto: bl.innerText, href: a.href,
        form: !!document.getElementById('lg-form').offsetParent, zro: !!document.getElementById('lg-zro').offsetParent,
        entrou: localStorage.getItem('cdf-entrou'), modo: MODO } });
    const tl = await tela(p);
    t(r.liberado === false, '⟶⟶ zro_products sem "carro-do-freela": a conta entra marcada como sem acesso');
    t(tl === 'entrar' && r.bloq && /ainda não tem acesso ao Carro do Freela/.test(r.texto), '⟶⟶ a tela é o aviso curto (' + tl + ')');
    t(r.href === 'https://absolutezro.com/ferramentas' && /Ver na Absolute ZRO/.test(r.texto), 'com a porta "Ver na Absolute ZRO"');
    t(!r.form && !r.zro, 'e nenhuma outra porta à vista');
    t(r.entrou === null, 'as funções da conta não abriram (a porta do app não foi marcada)');
    await p.evaluate(() => { LG_TIPO = 'freela'; entrarNaConta('Carro do Freela', false) });
    await p.waitForTimeout(300);
    t((await tela(p)) === 'entrar' && await p.evaluate(() => localStorage.getItem('cdf-entrou')) === null, 'nem chamando a entrada por dentro');
    await p.locator('#lg-bloq-sair').click(); await p.waitForTimeout(600);
    const s = await p.evaluate(async () => ({ bloq: !document.getElementById('lg-bloq').hidden, eu: (await fetch('/api/zro/eu', { cache: 'no-store' })).status }));
    t(!s.bloq && s.eu === 401, '"Sair desta conta" apaga a sessão e o aviso sai');
    t(erros.length === 0, 'sem erro: ' + erros.slice(0, 2).join(' · '));
    await ctx.close();
  }

  /* ============ 9. conta antiga deste aparelho continua entrando ============ */
  {
    const { ctx, p, erros } = await abrir(DOMINIO, { aceita401: true, antigo: true });
    await telaEntrar(p);
    const r = await botao(p);
    t(!r.escondido && r.antesDoForm && r.texto === 'Entrar com Absolute ZRO', '⟶⟶ conta antiga: a Absolute ZRO vem primeiro, como caminho recomendado');
    t(r.form && r.google, 'e o formulário de antes continua para quem já tinha conta aqui');
    await p.evaluate(() => { LG_MODO = 'criar'; pintarLogin() });
    t(!(await botao(p)).form, 'mas não serve para criar conta nova');
    await p.evaluate(() => { LG_MODO = 'entrar'; pintarLogin() });
    await p.fill('#lg-email', 'antiga@exemplo.com'); await p.fill('#lg-senha', 'segredo1');
    await p.locator('#lg-ok').click(); await p.waitForTimeout(900);
    t((await tela(p)) !== 'entrar', 'e ela entra como sempre entrou (' + (await tela(p)) + ')');
    t(erros.length === 0, 'sem erro: ' + erros.slice(0, 2).join(' · '));
    await ctx.close();
  }

  /* ============ 10. o job vira projeto na Absolute ZRO ============ */
  {
    zro.estado.proximo = { pessoa: Object.assign({}, RITA, { sub: 'zro-45' }), negar: false, adulterar: null };
    const { ctx, p, erros } = await abrir(DOMINIO, { aceita401: true });
    await telaEntrar(p);
    await p.locator('[data-lgtipo="contratante"]').click();
    await Promise.all([p.waitForURL(/\/$/, { timeout: 15000 }).catch(() => {}), p.locator('#lg-zro').click()]);
    await p.waitForFunction(() => typeof ZRO_CONTA !== 'undefined' && ZRO_CONTA && MODO === 'contratante', null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1200);
    t(await p.evaluate(() => ZRO_CONTA.hub === true), '⟶⟶ o login guardou o acesso para levar jobs (sem token no navegador)');
    t(await p.evaluate(() => !/zt_|at_/.test(document.cookie)), 'nenhum token legível pelo script da página');
    /* uma pessoa da escala com conta Absolute ZRO (as da prévia não têm) */
    const job = await p.evaluate(() => {
      show('jobs'); const e = meusJobs()[0]; jobAberto = e.id;
      const x = e.equipe.find(y => y.quem !== EU.id), c = CREW.find(y => y.id === x.quem);
      c.zro = { conta: '5a9c2e7b-1d3f-4a6b-8c0e-9f2d4b6a8c13', email: 'zeca@exemplo.com' };
      drawJobs();
      return { nome: e.nome, func: x.func, outros: e.equipe.filter(y => y.quem !== EU.id).length };
    });
    await p.waitForTimeout(300);
    const antes = await p.evaluate(() => { const b = document.querySelector('#jb-det [data-zroenv]'), n = document.querySelector('#jb-det .jzro + .note');
      return { bt: b && b.textContent, nota: n && n.textContent, abrir: !!document.querySelector('#jb-det .jzro a') } });
    t(antes.bt === 'Levar para a Absolute ZRO' && !antes.abrir, '⟶⟶ no painel do job: "Levar para a Absolute ZRO" (' + antes.bt + ')');
    t(new RegExp((job.outros - 1) + ' sem conta Absolute ZRO').test(antes.nota || ''), 'e diz quantos da escala não têm conta (' + antes.nota + ')');
    await p.locator('#jb-det [data-zroenv]').click();
    await p.waitForFunction(() => !!document.querySelector('#jb-det .jzro a'), null, { timeout: 15000 }).catch(() => {});
    const enviado = [...zro.estado.jobs.values()].pop();
    t(enviado && enviado.job.title === job.nome && /Chamada: /.test(enviado.job.briefing) && /Horário: /.test(enviado.job.briefing),
      '⟶⟶ o HUB recebeu o job com o briefing inteiro (horário, chamada, local)');
    t(enviado && /^cdf-/.test(enviado.job.job_id) && enviado.job.dates.length === 1, 'com id próprio do job e a data');
    const eq = zro.estado.equipes.pop();
    t(eq && eq.members.length === 1 && eq.members[0].zro_user_id === '5a9c2e7b-1d3f-4a6b-8c0e-9f2d4b6a8c13' && eq.members[0].function === job.func,
      '⟶⟶ só quem tem conta vai na equipe, com a função da escala');
    const depois = await p.evaluate(() => { const a = document.querySelector('#jb-det .jzro a'), n = document.querySelector('#jb-det .jzro + .note');
      return { href: a && a.href, bt: document.querySelector('#jb-det [data-zroenv]').textContent, nota: n && n.textContent } });
    t(depois.href === zro.url + '/projetos/' + enviado.projectId && depois.bt === 'Atualizar equipe', '⟶⟶ depois: "Abrir na Absolute ZRO" leva ao projeto');
    t(/1 na equipe/.test(depois.nota || ''), 'e o resumo da equipe (' + depois.nota + ')');
    t(await p.evaluate(() => { const m = MODO; MODO = 'freela'; const h = detJob(ESCALAS[0]); MODO = m; return !h.includes('data-zroenv') }), 'do lado do freela o bloco não existe');
    t(erros.length === 0, 'sem erro: ' + erros.slice(0, 2).join(' · '));
    await ctx.close();
  }

  /* ============ 11. a Z, a IA da Absolute ZRO, na aba própria ============ */
  {
    zro.estado.proximo = { pessoa: Object.assign({}, RITA, { sub: 'zro-46' }), negar: false, adulterar: null };
    const { ctx, p, erros, deFora } = await abrir(DOMINIO, { aceita401: true });
    await telaEntrar(p);
    await Promise.all([p.waitForURL(/\/$/, { timeout: 15000 }).catch(() => {}), p.locator('#lg-zro').click()]);
    await p.waitForFunction(() => typeof ZRO_CONTA !== 'undefined' && ZRO_CONTA && MODO, null, { timeout: 15000 }).catch(() => {});
    /* conta nova passa pelo cadastro; terminado, a primeira tela é a Z */
    await p.evaluate(() => { if (S.tab === 'cadastro') concluirCadastro() });
    await p.waitForFunction(() => { const z = document.querySelector('zro-ia'); return z && z.shadowRoot && /Rita/.test(z.shadowRoot.textContent) }, null, { timeout: 15000 }).catch(() => {});
    const z = await p.evaluate(() => { const el = document.querySelector('zro-ia'), aba = document.getElementById('v-z'), topo = document.getElementById('z-top');
      const primeiro = [...document.querySelector('.top .wrap').children].find(e => e.offsetParent);
      return { existe: !!el, tela: S.tab, dentro: !!el && aba.contains(el) && !aba.hidden && !!aba.offsetParent, topo: !topo.hidden && !!topo.offsetParent && primeiro === topo,
        atual: topo.getAttribute('aria-current'), lateral: document.querySelector('.top .tabs .tab').id === 'tab-z' && !document.getElementById('tab-z').hidden,
        feedLimpo: !document.getElementById('v-feed').querySelector('zro-ia, #z-painel'), api: el && el.getAttribute('api'),
        tema: el && el.getAttribute('tema'), texto: el && el.shadowRoot ? el.shadowRoot.textContent : '', sug: el ? JSON.parse(el.getAttribute('sugestoes')) : [],
        alto: el ? el.getBoundingClientRect().height : 0, acao: !document.getElementById('z-acao').hidden, sem: !document.getElementById('z-sem').hidden } });
    t(z.existe && z.tela === 'z' && z.dentro, '⟶⟶ quem entra cai na aba da Z, e o painel mora nela (' + z.tela + ')');
    t(z.topo && z.atual === 'true', 'no celular a Z é o primeiro botão do topo, em destaque, aceso na aba dela');
    t(z.lateral, 'e no computador é o primeiro item da lateral, antes de Planos');
    t(z.feedLimpo, 'o Feed volta a ser só o Feed');
    t(z.alto >= 380, 'a Z ocupa a tela da aba (' + Math.round(z.alto) + 'px)');
    t(!z.sem, 'com a conta liberada, sem o "Entrar" da aba');
    t(z.api === '/api/zro/ia', 'e fala com o servidor do Carro, não com o HUB direto (' + z.api + ')');
    t(/Rita/.test(z.texto) && !z.acao, 'cumprimenta pelo nome que veio do HUB, sem pedir login (' + z.texto.slice(0, 60).trim() + ')');
    t(z.sug.length >= 3 && z.sug.length <= 4, 'com 3 a 4 sugestões do Carro (' + z.sug.join(' · ') + ')');
    t(z.tema === (await p.evaluate(() => document.documentElement.classList.contains('app-light') ? 'claro' : 'escuro')), 'no tema do app (' + z.tema + ')');
    await p.evaluate(() => aplicarTema('light'));
    await p.waitForTimeout(100);
    t(await p.evaluate(() => document.querySelector('zro-ia').getAttribute('tema')) === 'claro', 'e troca junto quando o app troca de tema');
    /* conversa: a sugestão vai, a resposta volta pelo repasse */
    await p.evaluate(() => document.querySelector('zro-ia').shadowRoot.querySelector('.sug button').click());
    await p.waitForFunction(() => /Olá\./.test(document.querySelector('zro-ia').shadowRoot.textContent), null, { timeout: 15000 }).catch(() => {});
    const pedido = zro.estado.pedidosIa.filter(x => x.caminho === 'mensagens').pop();
    t(await p.evaluate(() => /Olá\./.test(document.querySelector('zro-ia').shadowRoot.textContent)), '⟶⟶ a pergunta foi e a resposta da Z chegou pelo /api/zro/ia');
    t(pedido && /^Bearer at_/.test(pedido.autorizacao), 'o HUB recebeu o Bearer da sessão, posto pelo servidor');
    t(await p.evaluate(() => !/zt_|at_/.test(document.cookie + document.documentElement.outerHTML)), 'nenhum token na página nem nos cookies que o script lê');
    t(deFora.includes('/ia/v1/zro-ia.js'), 'o painel é o <zro-ia> da Absolute ZRO');
    t(erros.length === 0, 'sem erro: ' + erros.slice(0, 2).join(' · '));
    await ctx.close();
  }
  {
    /* HUB que ainda não conhece zro.ia: entra sem ele, e a Z pede para reconectar */
    zro.estado.semEscopoIa = true;
    zro.estado.proximo = { pessoa: Object.assign({}, RITA, { sub: 'zro-47' }), negar: false, adulterar: null };
    const { ctx, p } = await abrir(DOMINIO, { aceita401: true });
    await telaEntrar(p);
    await Promise.all([p.waitForURL(/\/$/, { timeout: 15000 }).catch(() => {}), p.locator('#lg-zro').click()]);
    await p.waitForFunction(() => typeof ZRO_CONTA !== 'undefined' && ZRO_CONTA && MODO, null, { timeout: 15000 }).catch(() => {});
    await p.evaluate(() => { if (S.tab === 'cadastro') concluirCadastro() });
    await p.waitForFunction(() => !document.getElementById('z-acao').hidden, null, { timeout: 15000 }).catch(() => {});
    const r = await p.evaluate(() => ({ acao: !document.getElementById('z-acao').hidden, texto: document.getElementById('z-reconectar').textContent, tela: S.tab,
      dentro: document.getElementById('v-z').contains(document.getElementById('z-reconectar')) }));
    t(r.acao && r.texto === 'Reconectar com Absolute ZRO' && r.tela === 'z' && r.dentro, '⟶⟶ sem o acesso da Z: "Reconectar com Absolute ZRO", dentro da aba dela (' + r.texto + ')');
    zro.estado.semEscopoIa = false;
    await Promise.all([p.waitForURL(/\/$/, { timeout: 15000 }).catch(() => {}), p.locator('#z-reconectar').click()]);
    await p.waitForFunction(() => { const z = document.querySelector('zro-ia'); return z && z.shadowRoot && /Rita/.test(z.shadowRoot.textContent) }, null, { timeout: 15000 }).catch(() => {});
    await p.evaluate(() => { if (S.tab === 'cadastro') concluirCadastro() });
    t(await p.evaluate(() => { const z = document.querySelector('zro-ia'); return !!z && /Rita/.test(z.shadowRoot.textContent) && document.getElementById('z-acao').hidden && S.tab === 'z' }), 'reconectou pelo HUB e a Z abre de novo, na aba dela');
    await ctx.close();
  }

  await b.close();
  for (const x of srv) await new Promise(r => x.close(() => r()));
  await zro.fechar();
  for (const s of saidas) fs.rmSync(s, { recursive: true, force: true });
  console.log('\n== OK =='); ok.forEach(x => console.log('  ✓ ' + x));
  if (bad.length) { console.log('\n== FALHAS =='); bad.forEach(x => console.log('  ✗ ' + x)) }
  console.log('\n' + ok.length + ' ok, ' + bad.length + ' falhas');
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
