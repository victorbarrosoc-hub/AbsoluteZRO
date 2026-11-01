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
 *
 * O SET (30/out): no domínio fechado, a quem o portão nega, nada do Set
 * (item 12a). O resto do Set na tela mora em test/set-zro.js.
 *
 * O PORTÃO DO LANÇAMENTO (28/out, adendo do PRD: acesso exclusivo do
 * proprietário). O domínio como está HOJE é FECHADO: o build marca
 * cdf-release=closed e CARRO_RELEASE não existe. Então:
 *  12. no domínio fechado, a home de / é vitrine sem porta ("Conhecer o
 *      projeto", sem Criar conta, planos "Em desenvolvimento", a Z
 *      "Chegando" sem porta, sem aba da Z); "Entrar", a conta antiga deste
 *      aparelho, o login do protótipo, o Google, o cadastro, qualquer
 *      show() de tela de dentro, /fase1 direto e a volta ?zro=fechado
 *      mostram a página "Em desenvolvimento" (símbolo pequeno, marca,
 *      Figtree Light × ExtraBold, uma linha, "Voltar ao HUB" de tinta e a
 *      única porta "Entrar com Absolute ZRO"); as personas do PRD §11 —
 *      conta comum, assinante, admin de equipe, outro admin, beta tester —
 *      pelo HUB (com o portão e antigo): NEGADAS; a sessão antiga quando o
 *      acesso sai: NEGADA; a conta da lista: PERMITIDA (entra, Z, jobs);
 *      a conta da lista sem o plano: a página diz e deixa sair; e cabe sem
 *      rolagem em 390 e 1440 nos dois temas.
 *  ⚠️ Os itens 2 a 11 rodam com CARRO_RELEASE=released e sem a meta: é o
 *      contrato de quando o Carro lançar (a tela de entrar, a conta antiga,
 *      a Z, o envio de jobs), que o portão não pode ter quebrado. O servidor
 *      lê a variável a cada pedido, por isso o item 12 a apaga antes.
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const { iniciarZroFalsa } = require('./api/zro-falso.js');
const ok = [], bad = []; const t = (c, m) => (c ? ok : bad).push(m);
const RAIZ = path.resolve(__dirname, '..');
const CLIENTE = { clientId: 'carrodofreela-web', clientSecret: 'segredo-da-suite-conta-zro' };
const HUB_PUBLIC = path.resolve(RAIZ, '..', '..', 'apps', 'hub-web', 'public');

/* o domínio em miniatura: o build interno + as funções + as rotas do build.
   `fechado` escreve a meta do portão como o vercel-build escreve (logo
   depois da fase) e põe /fase1 ao lado — o build por fase é a MESMA página
   com outra meta. */
function montarSaida(o = {}) {
  const SEG = require('../src/seguranca.js');
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'carro-conta-zro-'));
  fs.mkdirSync(path.join(saida, 'static'), { recursive: true });
  let html = fs.readFileSync(path.join(RAIZ, 'public', 'index.html'), 'utf8');
  const FASE0 = '<meta name="cdf-fase" content="0">';
  if (!html.includes(FASE0)) throw new Error('o build não tem a meta da fase');
  if (o.fechado) html = html.replace(FASE0, FASE0 + '\n<meta name="cdf-release" content="closed">');
  fs.writeFileSync(path.join(saida, 'static', 'index.html'), html);
  const paginas = ['index'];
  if (o.fechado) { fs.writeFileSync(path.join(saida, 'static', 'fase1.html'), html.replace(FASE0, '<meta name="cdf-fase" content="1">')); paginas.push('fase1') }
  fs.cpSync(path.join(RAIZ, 'public', 'm'), path.join(saida, 'static', 'm'), { recursive: true });
  for (const f of ['apple-touch-icon.png', 'icone-192.png', 'icone-512.png', 'icone-maskable.png', 'app.webmanifest', 'og.jpg'])
    fs.copyFileSync(path.join(RAIZ, 'public', f), path.join(saida, 'static', f));
  if (!o.semFuncoes) for (const n of ['entrar', 'callback', 'eu', 'sair', 'enviar', 'ia', 'set']) {
    const dir = path.join(saida, 'functions', 'api', 'zro', n + '.func');
    fs.mkdirSync(path.join(dir, 'api', 'zro'), { recursive: true });
    for (const f of [n + '.js', '_zro.js']) fs.copyFileSync(path.join(RAIZ, 'api', 'zro', f), path.join(dir, 'api', 'zro', f));
    fs.writeFileSync(path.join(dir, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: 'api/zro/' + n + '.js', launcherType: 'Nodejs' }));
  }
  const csp = SEG.politica(SEG.scriptsDoHtml(html), SEG.conexoes({}));
  fs.writeFileSync(path.join(saida, 'config.json'), JSON.stringify({ version: 3, routes: SEG.rotasVercel(csp, paginas) }));
  return saida;
}

(async () => {
  const zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret });
  zro.estado.proximo = { pessoa: { sub: 'zro-42', email: 'rita@coletivo.com', nome: 'Rita Duarte', org: 'Coletivo Rita' }, negar: false, adulterar: null };
  const { servirSaida } = require('../src/servir-saida.js');
  /* três domínios em miniatura: o ABERTO (sem a meta; com CARRO_RELEASE=released
     é o contrato de quando o Carro lançar — itens 2 a 11), o SEM FUNÇÕES, e o
     FECHADO (item 12: o que o domínio serve HOJE — a meta do portão, e a
     variável apagada) */
  const saidas = [montarSaida(), montarSaida({ semFuncoes: true }), montarSaida({ fechado: true })];
  const srv = [], BASE = [];
  for (const s of saidas) {
    const x = servirSaida(s); await new Promise(r => x.listen(0, '127.0.0.1', r));
    srv.push(x); BASE.push('http://127.0.0.1:' + x.address().port + '/');
  }
  const [DOMINIO, SEM_FUNCOES, FECHADO] = BASE;
  process.env.CARRO_RELEASE = 'released';
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
    const eu = await p.evaluate(async () => (await (async r => r.status === 401 || (r.status === 200 && (await r.json()).entrou === false) ? 'sem_sessao' : r.status)(await fetch('/api/zro/eu', { cache: 'no-store' }))));
    t(eu === 'sem_sessao' && await p.evaluate(() => ZRO_CONTA === null), '⟶⟶ Sair apaga a sessão deste site (/eu volta a dizer que não há sessão)');
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
    const s = await p.evaluate(async () => ({ bloq: !document.getElementById('lg-bloq').hidden, eu: (await (async r => r.status === 401 || (r.status === 200 && (await r.json()).entrou === false) ? 'sem_sessao' : r.status)(await fetch('/api/zro/eu', { cache: 'no-store' }))) }));
    t(!s.bloq && s.eu === 'sem_sessao', '"Sair desta conta" apaga a sessão e o aviso sai');
    t(erros.length === 0, 'sem erro: ' + erros.slice(0, 2).join(' · '));
    await ctx.close();
  }

  /* ============ 9. conta antiga deste aparelho: só a porta da Absolute ZRO, e o perfil local fica ============ */
  {
    /* 01/11/2026 (decisão do titular): os logins antigos (e-mail/senha deste aparelho e o Google da prévia) saíram do
       domínio. Eles nunca guardaram nada no servidor; o que a pessoa tinha mora neste aparelho, e entrar pela
       Absolute ZRO não zera quem já tinha entrado aqui. */
    const { ctx, p, erros } = await abrir(DOMINIO, { aceita401: true, antigo: true });
    await telaEntrar(p);
    const r = await botao(p);
    t(!r.escondido && r.texto === 'Entrar com Absolute ZRO', '⟶⟶ conta antiga: a porta é a Absolute ZRO');
    t(!r.form && !r.google, 'e o formulário de e-mail e senha e o Google saíram');
    t(await p.evaluate(() => !document.getElementById('lg-cx').classList.contains('compacto')), 'sem a pílula "Entrar" escondendo a porta');
    const fica = await p.evaluate(() => { EU.nome = 'Antiga Deste Aparelho'; entrarNaConta('Absolute ZRO', false); return EU.nome });
    t(fica === 'Antiga Deste Aparelho', 'entrar pela Absolute ZRO não zera o perfil que já estava neste aparelho (' + fica + ')');
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

  /* ============ 11. a Z, a IA da Absolute ZRO: tela própria, nunca a de entrada (29/out) ============ */
  {
    zro.estado.proximo = { pessoa: Object.assign({}, RITA, { sub: 'zro-46' }), negar: false, adulterar: null };
    const { ctx, p, erros, deFora } = await abrir(DOMINIO, { aceita401: true });
    await telaEntrar(p);
    await Promise.all([p.waitForURL(/\/$/, { timeout: 15000 }).catch(() => {}), p.locator('#lg-zro').click()]);
    await p.waitForFunction(() => typeof ZRO_CONTA !== 'undefined' && ZRO_CONTA && MODO, null, { timeout: 15000 }).catch(() => {});
    /* conta nova passa pelo cadastro; terminado, a primeira tela é a tarefa (Feed/Propostas), não a Z */
    await p.evaluate(() => { if (S.tab === 'cadastro') concluirCadastro() });
    await p.waitForFunction(() => !document.getElementById('z-top').hidden || !document.getElementById('tab-z').hidden, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(400);
    const antes = await p.evaluate(() => { const topo = document.getElementById('z-top'), abas = [...document.querySelectorAll('.top .tabs .tab')];
      const primeiro = [...document.querySelector('.top .wrap').children].find(e => e.offsetParent);
      return { tela: S.tab, ia: !!document.querySelector('zro-ia'), script: !!document.querySelector('script[src*="/ia/v1/zro-ia.js"]'),
        zHidden: document.getElementById('v-z').hidden, topoVisivel: !topo.hidden, topoPrimeiro: primeiro === topo, topoAceso: topo.getAttribute('aria-current'),
        topoTexto: topo.textContent.trim(), lateralPrimeiro: abas[0] && abas[0].id, lateralUltimo: abas.length && abas[abas.length - 1].id };
    });
    t(antes.tela !== 'z' && (antes.tela === 'feed' || antes.tela === 'propostas') && antes.zHidden, '⟶⟶ quem entra cai na tarefa, nunca na Z (' + antes.tela + ')');
    t(!antes.ia && !antes.script, 'nada da Z monta nem carrega sozinho ao entrar');
    t(antes.topoVisivel && !antes.topoPrimeiro && antes.topoAceso !== 'true' && antes.topoTexto === '', 'no celular a Z é um anel discreto, sem rótulo, à direita (não o primeiro do topo) e apagado');
    t(antes.lateralPrimeiro !== 'tab-z' && antes.lateralUltimo === 'tab-z', 'no computador ela é o último item da lateral, nunca o primeiro (' + antes.lateralPrimeiro + ' … ' + antes.lateralUltimo + ')');
    /* a Z abre só no toque */
    await p.evaluate(() => show('z'));
    await p.waitForFunction(() => { const z = document.querySelector('zro-ia'); return z && z.shadowRoot && /Rita/.test(z.shadowRoot.textContent) }, null, { timeout: 15000 }).catch(() => {});
    const z = await p.evaluate(() => { const el = document.querySelector('zro-ia'), aba = document.getElementById('v-z'), topo = document.getElementById('z-top');
      return { existe: !!el, tela: S.tab, dentro: !!el && aba.contains(el) && !aba.hidden && !!aba.offsetParent,
        atual: topo.getAttribute('aria-current'),
        feedLimpo: !document.getElementById('v-feed').querySelector('zro-ia, #z-painel'), api: el && el.getAttribute('api'),
        tema: el && el.getAttribute('tema'), texto: el && el.shadowRoot ? el.shadowRoot.textContent : '', sug: el ? JSON.parse(el.getAttribute('sugestoes')) : [],
        alto: el ? el.getBoundingClientRect().height : 0, acao: !document.getElementById('z-acao').hidden, sem: !document.getElementById('z-sem').hidden } });
    t(z.existe && z.tela === 'z' && z.dentro, '⟶⟶ no toque, a Z abre na tela dela e o painel mora nela (' + z.tela + ')');
    t(z.atual === 'true', 'e o anel do topo acende enquanto ela está aberta');
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
    /* conversa: sem botões, a sugestão se escreve no campo; Tab completa, Enter manda e a resposta volta pelo repasse */
    t(await p.evaluate(() => { const r = document.querySelector('zro-ia').shadowRoot; return !r.querySelector('.sug, [data-sug]') && !!r.querySelector('.fantasma') }),
      'sem botões de sugestão: o campo da Z digita as sugestões do Carro');
    await p.evaluate(() => document.querySelector('zro-ia').shadowRoot.querySelector('textarea').focus());
    await p.keyboard.press('Tab');
    const sugerida = await p.evaluate(() => document.querySelector('zro-ia').shadowRoot.querySelector('textarea').value);
    t(z.sug.includes(sugerida), 'Tab completa com uma sugestão do Carro (' + sugerida + ')');
    await p.keyboard.press('Enter');
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
    await p.waitForTimeout(400);
    t(await p.evaluate(() => S.tab !== 'z' && !document.querySelector('zro-ia')), 'entrou: a tarefa primeiro, a Z fechada');
    await p.evaluate(() => show('z'));
    await p.waitForFunction(() => !document.getElementById('z-acao').hidden, null, { timeout: 15000 }).catch(() => {});
    const r = await p.evaluate(() => ({ acao: !document.getElementById('z-acao').hidden, texto: document.getElementById('z-reconectar').textContent, tela: S.tab,
      dentro: document.getElementById('v-z').contains(document.getElementById('z-reconectar')) }));
    t(r.acao && r.texto === 'Reconectar com Absolute ZRO' && r.tela === 'z' && r.dentro, '⟶⟶ sem o acesso da Z: "Reconectar com Absolute ZRO", dentro da aba dela (' + r.texto + ')');
    zro.estado.semEscopoIa = false;
    /* a página de antes fica marcada: a espera é pela página que VOLTA do HUB, não pela que sai */
    await p.evaluate(() => { window.__antesDoHub = true });
    await Promise.all([p.waitForURL(/\/$/, { timeout: 15000 }).catch(() => {}), p.locator('#z-reconectar').click()]);
    await p.waitForFunction(() => !window.__antesDoHub && typeof ZRO_CONTA !== 'undefined' && ZRO_CONTA && typeof S !== 'undefined' && S.tab !== 'entrar', null, { timeout: 20000 }).catch(() => {});
    await p.evaluate(() => { if (S.tab === 'cadastro') concluirCadastro() });
    await p.waitForFunction(() => { const z = document.querySelector('zro-ia'); return z && z.shadowRoot && /Rita/.test(z.shadowRoot.textContent) }, null, { timeout: 15000 }).catch(() => {});
    const volta = await p.evaluate(() => { const z = document.querySelector('zro-ia'); return { ok: !!z && !!z.shadowRoot && /Rita/.test(z.shadowRoot.textContent) && document.getElementById('z-acao').hidden && S.tab === 'z', tela: S.tab, z: !!z, acao: !document.getElementById('z-acao').hidden, url: location.href } });
    t(volta.ok, 'reconectou pelo HUB e volta para a Z, que a pessoa tinha aberto (' + JSON.stringify(volta) + ')');
    await ctx.close();
  }

  /* ============ 12. O PORTÃO DO LANÇAMENTO (28/out): fechado para todo mundo, menos o proprietário ============ */
  delete process.env.CARRO_RELEASE;   /* o domínio como está HOJE: closed (sem a variável) */
  const fechadoNaTela = p => p.evaluate(() => { const f = document.getElementById('v-fechado'), h1 = f.querySelector('h1');
    return { tela: S.tab, vis: !f.hidden && !!f.offsetParent, home: !document.getElementById('v-home').hidden, entrar: !document.getElementById('v-entrar').hidden,
      titulo: h1.textContent.trim(), fino: getComputedStyle(h1.querySelector('.fc-fino')).fontWeight, forte: getComputedStyle(h1.querySelector('.fc-forte')).fontWeight,
      fonte: getComputedStyle(h1).fontFamily, cor: getComputedStyle(h1).color, sub: document.getElementById('fc-sub').textContent,
      linhas: [...document.querySelectorAll('#v-fechado p')].filter(x => !x.hidden).length,
      hub: (a => ({ href: a.href, ink: a.classList.contains('glass-btn--ink') && a.classList.contains('glass-btn'), vis: !!a.offsetParent, texto: a.textContent.trim() }))(document.getElementById('fc-hub')),
      porta: (bt => ({ vis: !bt.hidden && !!bt.offsetParent, texto: bt.textContent.trim(), glass: bt.classList.contains('glass-btn') }))(document.getElementById('fc-entrar')),
      sair: !document.getElementById('fc-troca').hidden, zro: !!document.querySelector('#v-fechado .fc-zro svg'), marca: /Carro do Freela/.test(document.querySelector('#v-fechado .fc-marca').textContent),
      topbar: document.getElementById('topbar').hidden, bottom: document.getElementById('bottombar').hidden, homenav: document.getElementById('homenav').hidden,
      form: !!document.getElementById('lg-form').offsetParent, google: !!(document.querySelector('#lg-cx [data-login="Google"]') || {}).offsetParent,
      abaZ: document.getElementById('tab-z').hidden && document.getElementById('z-top').hidden, zIa: !!document.querySelector('zro-ia'),
      como: /Como funciona/.test(f.innerText), rola: document.documentElement.scrollWidth > innerWidth + 1,
      classe: document.documentElement.classList.contains('fechado') } });
  {
    /* 12a. anônimo no domínio fechado: a home é vitrine sem porta, e "Entrar" é a página "Em desenvolvimento" */
    const { ctx, p, erros, pedidos } = await abrir(FECHADO, { aceita401: true });
    t(await p.evaluate(() => document.getElementById('tab-set').hidden && document.getElementById('g-set').hidden && !document.querySelector('zro-set')) && !pedidos.some(u => /\/api\/zro\/set/.test(u)),
      'fechado: nada do Set (nem a entrada, nem o widget, nem pedido)');
    const home = await p.evaluate(() => { const bs = [...document.querySelectorAll('.hprod .hcta .entrar-cta')];
      return { tela: S.tab, classe: document.documentElement.classList.contains('fechado'), criar: document.getElementById('hn-criar').hidden,
        cta: bs.map(b => ({ txt: b.textContent.trim(), vis: !!b.offsetParent, ir: b.dataset.ir, lg: b.dataset.lg })),
        fim: [...document.querySelectorAll('.fim-faixa .hcta .entrar-cta')].map(b => ({ txt: b.textContent.trim(), vis: !!b.offsetParent })),
        ver: document.getElementById('hj-ver').hidden, praca: [...document.querySelectorAll('#v-home .pc-cta')].every(b => b.hidden),
        itens: [...document.querySelectorAll('#v-home .pc-it')].every(b => b.disabled),
        planos: [...document.querySelectorAll('#h-planos .entrar-cta')].map(b => b.disabled && b.textContent.trim()),
        zSelo: document.querySelector('#h-z .z-selo').textContent.trim(), zPorta: !!document.querySelector('#h-z .entrar-cta'), zLink: (document.querySelector('#h-z a.z-ir') || {}).href,
        abaZ: document.getElementById('tab-z').hidden && document.getElementById('z-top').hidden } });
    t(home.tela === 'home' && home.classe, '⟶⟶ no domínio fechado, / abre na home — marcada como fechada (' + home.tela + ')');
    t(home.criar, '"Criar conta" some: não há conta a criar');
    t(home.cta.length === 2 && home.cta[0].txt === 'Conhecer o projeto' && home.cta[0].ir === '#h-como' && !home.cta[0].lg && home.cta[0].vis && !home.cta[1].vis, '⟶⟶ o topo tem UMA chamada, "Conhecer o projeto", e nenhuma porta (' + JSON.stringify(home.cta) + ')');
    t(home.fim.length === 2 && home.fim[0].txt === 'Conhecer o projeto' && home.fim[0].vis && !home.fim[1].vis, 'o fechamento também');
    t(home.ver && home.praca && home.itens, 'a busca sem conta não chama ninguém, e a praça não abre nada');
    t(home.planos.length >= 6 && home.planos.every(x => x === 'Em desenvolvimento'), 'os planos dizem "Em desenvolvimento" e não assinam (' + home.planos.length + ')');
    t(home.zSelo === 'Chegando ao Carro do Freela' && !home.zPorta && home.zLink === 'https://absolutezro.com/ia', '⟶⟶ a Z na home: "Chegando ao Carro do Freela", sem porta — só "Conhecer a Z"');
    t(home.abaZ, 'e a aba da Z não existe sem sessão liberada');
    /* "Conhecer o projeto" rola, não abre */
    await p.locator('.hprod .hcta .entrar-cta:visible').first().click(); await p.waitForTimeout(600);
    t(await p.evaluate(() => S.tab === 'home' && document.getElementById('v-entrar').hidden), '"Conhecer o projeto" fica na home');
    /* o Entrar do topo: a página "Em desenvolvimento" */
    await telaEntrar(p);
    const f = await fechadoNaTela(p);
    t(f.tela === 'fechado' && f.vis && !f.entrar && !f.home, '⟶⟶ "Entrar" mostra a página "Em desenvolvimento", nunca a tela de entrar (' + f.tela + ')');
    t(f.titulo === 'Em desenvolvimento.' && f.fino === '300' && f.forte === '800' && /Figtree/.test(f.fonte), 'título "Em desenvolvimento." em Figtree, Light × ExtraBold (' + f.fino + '/' + f.forte + ')');
    t(f.zro && f.marca, 'o símbolo da Absolute ZRO pequeno e a marca do Carro');
    t(f.linhas === 1 && /Estamos construindo/.test(f.sub), 'uma linha de apoio: "' + f.sub + '"');
    t(f.hub.href === 'https://absolutezro.com/inicio' && f.hub.ink && f.hub.vis && f.hub.texto === 'Voltar ao HUB', '⟶⟶ "Voltar ao HUB" em vidro escuro leva a absolutezro.com/inicio');
    t(f.porta.vis && f.porta.texto === 'Entrar com Absolute ZRO' && f.porta.glass && !f.sair, '⟶⟶ a única porta é "Entrar com Absolute ZRO"');
    t(!f.form && !f.google, 'nada de formulário próprio nem Google');
    t(f.topbar && f.bottom && f.homenav && f.abaZ && !f.zIa && !f.como && !f.rola, 'sem barras, sem a Z, sem "Como funciona", sem rolagem lateral');
    t(/rgb\(255, 255, 255\)/.test(f.cor), 'no escuro, o título é branco (' + f.cor + ')');
    await p.evaluate(() => aplicarTema('light')); await p.waitForTimeout(100);
    const claro = await fechadoNaTela(p);
    t(/rgb\(29, 29, 31\)/.test(claro.cor) && claro.hub.ink, 'no claro, grafite #1d1d1f — e o botão continua de tinta (' + claro.cor + ')');
    await p.evaluate(() => aplicarTema('dark'));
    /* nenhuma tela de dentro abre: por show(), pela entrada da conta, pelo cadastro */
    const dentro = await p.evaluate(() => { const r = {}; for (const k of ['feed', 'z', 'propostas', 'agenda', 'jobs', 'guildas', 'brecho', 'cadastro', 'entrar', 'pracas', 'buscar', 'planos', 'cofre']) { show(k); r[k] = S.tab } return r });
    t(Object.values(dentro).every(x => x === 'fechado'), '⟶⟶ Feed, Z, Propostas, Agenda, Jobs, Guilda, Brechó, cadastro… nada abre: ' + JSON.stringify(dentro));
    const portas = await p.evaluate(() => { const r = []; for (const prov of ['Google', 'Carro do Freela', 'Absolute ZRO']) { LG_TIPO = 'contratante'; entrarNaConta(prov, false); r.push(S.tab) } LG_MODO = 'criar'; entrarNaConta('Carro do Freela', true); r.push(S.tab);
      return { r, entrou: localStorage.getItem('cdf-entrou'), pode: zroPodeEnviar(), z: zAbaLigada() } });
    t(portas.r.every(x => x === 'fechado') && portas.entrou === null && !portas.pode && !portas.z, '⟶⟶ o login do protótipo, o Google, criar conta: nenhuma porta abre a conta (' + portas.r.join(',') + ')');
    t(pedidos.every(u => /\/api\/zro\/eu$/.test(u)), 'e nada além de /api/zro/eu foi pedido (' + pedidos.join(', ') + ')');
    t(erros.length === 0, 'sem erro: ' + erros.slice(0, 2).join(' · '));
    await ctx.close();
  }
  {
    /* 12b. a conta antiga deste aparelho também fica de fora enquanto fechado */
    const { ctx, p, erros } = await abrir(FECHADO, { aceita401: true, antigo: true });
    await telaEntrar(p);
    const f = await fechadoNaTela(p);
    t(f.tela === 'fechado' && !f.form && !f.google && f.porta.vis, '⟶⟶ conta antiga deste aparelho: a mesma página, sem o formulário de antes');
    t(await p.evaluate(() => { entrarNaConta('Carro do Freela', false); return S.tab }) === 'fechado', 'e ela não entra como entrava');
    t(erros.length === 0, 'sem erro: ' + erros.slice(0, 2).join(' · '));
    await ctx.close();
  }
  {
    /* 12c. rota direta (/fase1) e a volta recusada (?zro=fechado) */
    const a = await abrir(FECHADO + 'fase1', { aceita401: true });
    const fa = await fechadoNaTela(a.p);
    t(fa.tela === 'fechado' && fa.vis && !fa.home, '⟶⟶ /fase1 direto: "Em desenvolvimento", sem passar pela home (' + fa.tela + ')');
    t(await a.p.evaluate(() => FASE === 1), 'e é mesmo o build da fase');
    t(a.erros.length === 0, 'sem erro: ' + a.erros.slice(0, 2).join(' · '));
    await a.ctx.close();
    const b2 = await abrir(FECHADO + '?zro=fechado', { aceita401: true });
    const fb = await fechadoNaTela(b2.p);
    t(fb.tela === 'fechado' && /ainda não tem acesso/.test(fb.sub) && fb.porta.vis && !fb.sair, '⟶⟶ a volta ?zro=fechado: a página diz que a conta não tem acesso (' + fb.sub + ')');
    t(await b2.p.evaluate(() => location.search === ''), 'e a marca sai do endereço');
    await b2.ctx.close();
  }
  {
    /* 12d. as personas pelo HUB: conta comum, assinante, admin de equipe, outro admin, beta tester → NEGADO */
    const personas = [
      ['conta comum', { sub: 'zro-c1', email: 'comum@exemplo.com', nome: 'Conta Comum', org: null, acesso: 'closed', produtos: [] }],
      ['assinante do SOBEDESCE', { sub: 'zro-c2', email: 'assinante@exemplo.com', nome: 'Assinante', org: 'Produtora X', acesso: 'closed', produtos: ['sobedesce'] }],
      ['admin de equipe', { sub: 'zro-c3', email: 'admin@exemplo.com', nome: 'Admin', org: 'Produtora Y', acesso: 'closed', produtos: ['sobedesce', 'synquei'] }],
      ['outro admin da plataforma', { sub: 'zro-c4', email: 'outro@exemplo.com', nome: 'Outro Admin', org: 'Absolute ZRO', acesso: 'closed', produtos: ['sobedesce', 'synquei', 'tpeasy'] }],
      ['beta tester', { sub: 'zro-c5', email: 'tester@exemplo.com', nome: 'Tester', org: null, acesso: 'closed', produtos: ['nossom'] }],
    ];
    for (const [modo, antigo] of [['HUB com o portão', false], ['HUB antigo, que emite token', true]]) {
      zro.estado.hubAntigo = antigo;
      for (const [nome, pessoa] of personas) {
        zro.estado.proximo = { pessoa, negar: false, adulterar: null };
        const { ctx, p, erros } = await abrir(FECHADO, { aceita401: true });
        await telaEntrar(p);
        await Promise.all([p.waitForURL(/\/$/, { timeout: 15000 }).catch(() => {}), p.locator('#fc-entrar').click()]);
        await p.waitForFunction(() => typeof ZRO_PRONTO !== 'undefined' && ZRO_PRONTO && S.tab === 'fechado', null, { timeout: 15000 }).catch(() => {});
        await p.waitForTimeout(500);
        const f = await fechadoNaTela(p);
        const eu = await p.evaluate(async () => ({ conta: ZRO_CONTA, entrou: localStorage.getItem('cdf-entrou'), eu: (await (async r => r.status === 401 || (r.status === 200 && (await r.json()).entrou === false) ? 'sem_sessao' : r.status)(await fetch('/api/zro/eu', { cache: 'no-store' }))) }));
        t(f.tela === 'fechado' && f.vis && /ainda não tem acesso/.test(f.sub) && eu.conta === null && eu.entrou === null && eu.eu === 'sem_sessao' && f.abaZ,
          '⟶⟶ NEGADO — ' + nome + ' (' + modo + '): "' + f.sub + '", sem sessão (/eu ' + eu.eu + ')');
        t(erros.length === 0, 'sem erro (' + nome + '): ' + erros.slice(0, 2).join(' · '));
        await ctx.close();
      }
    }
    zro.estado.hubAntigo = false;
  }
  {
    /* 12e. a conta do proprietário (allowed) → PERMITIDO; e a sessão antiga, quando o acesso sai → NEGADO */
    const DONO = { sub: 'zro-dono', email: 'dono@exemplo.com', nome: 'Dono da Casa', org: 'Absolute ZRO', acesso: 'allowed' };
    zro.estado.proximo = { pessoa: DONO, negar: false, adulterar: null };
    const { ctx, p, erros } = await abrir(FECHADO, { aceita401: true });
    await telaEntrar(p);
    await Promise.all([p.waitForURL(/\/$/, { timeout: 15000 }).catch(() => {}), p.locator('#fc-entrar').click()]);
    await p.waitForFunction(() => typeof ZRO_CONTA !== 'undefined' && ZRO_CONTA && MODO, null, { timeout: 15000 }).catch(() => {});
    await p.evaluate(() => { if (S.tab === 'cadastro') concluirCadastro() });
    await p.waitForTimeout(600);
    const d = await p.evaluate(() => ({ tela: S.tab, liberado: ZRO_CONTA && ZRO_CONTA.liberado, entrou: localStorage.getItem('cdf-entrou'), classe: document.documentElement.classList.contains('fechado'),
      abaZ: !document.getElementById('tab-z').hidden, pode: zroPodeEnviar(), fechado: !document.getElementById('v-fechado').hidden }));
    t(d.liberado === true && d.entrou === '1' && !d.classe && !d.fechado, '⟶⟶ PERMITIDO — a conta da lista entra (' + d.tela + ')');
    t(d.tela !== 'z' && d.abaZ && d.pode, 'cai na tarefa (não na Z), com a entrada da Z à mão, e pode levar jobs ao HUB (' + d.tela + ')');
    /* recarregar: a claim é relida e a tela guardada abre */
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => !document.getElementById('splash') && typeof ZRO_CONTA !== 'undefined' && ZRO_CONTA, null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(600);
    t(await p.evaluate(() => S.tab !== 'z' && S.tab !== 'fechado' && !document.documentElement.classList.contains('fechado')), 'recarregou: continua dentro, na tela da tarefa (a Z não abre sozinha)');
    /* o acesso sai da lista no HUB: a sessão antiga deste aparelho não vale mais */
    zro.estado.contas.get('zro-dono').acesso = 'closed';
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => !document.getElementById('splash') && typeof ZRO_PRONTO !== 'undefined' && ZRO_PRONTO, null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(600);
    const f = await fechadoNaTela(p);
    const s = await p.evaluate(async () => ({ conta: ZRO_CONTA, eu: (await (async r => r.status === 401 || (r.status === 200 && (await r.json()).entrou === false) ? 'sem_sessao' : r.status)(await fetch('/api/zro/eu', { cache: 'no-store' }))) }));
    t(f.tela === 'fechado' && f.vis && s.conta === null && s.eu === 'sem_sessao' && f.abaZ, '⟶⟶ NEGADO — sessão antiga: o acesso saiu e a página volta a ser "Em desenvolvimento" (/eu ' + s.eu + ')');
    t(erros.length === 0, 'sem erro: ' + erros.slice(0, 2).join(' · '));
    await ctx.close();
  }
  {
    /* 12f. conta da lista sem o plano: entra, mas a página diz e deixa sair */
    zro.estado.proximo = { pessoa: { sub: 'zro-plano', email: 'plano@exemplo.com', nome: 'Sem Plano', org: 'Produtora P', acesso: 'allowed', produtos: ['nossom'] }, negar: false, adulterar: null };
    const { ctx, p, erros } = await abrir(FECHADO, { aceita401: true });
    await telaEntrar(p);
    await Promise.all([p.waitForURL(/\/$/, { timeout: 15000 }).catch(() => {}), p.locator('#fc-entrar').click()]);
    await p.waitForFunction(() => typeof ZRO_CONTA !== 'undefined' && ZRO_CONTA, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(600);
    const f = await fechadoNaTela(p);
    t(f.tela === 'fechado' && /ainda não tem acesso/.test(f.sub) && f.sair && !f.porta.vis, '⟶⟶ sem o plano: "Em desenvolvimento" com "Sair desta conta" (' + f.sub + ')');
    t(await p.evaluate(() => localStorage.getItem('cdf-entrou') === null), 'a porta do app não foi marcada');
    await p.locator('#fc-sair').click(); await p.waitForTimeout(700);
    const f2 = await fechadoNaTela(p);
    t(!f2.sair && f2.porta.vis && await p.evaluate(async () => ZRO_CONTA === null && (await (async r => r.status === 401 || (r.status === 200 && (await r.json()).entrou === false) ? 'sem_sessao' : r.status)(await fetch('/api/zro/eu', { cache: 'no-store' }))) === 'sem_sessao'), 'saiu: a porta volta e a sessão foi embora');
    t(erros.length === 0, 'sem erro: ' + erros.slice(0, 2).join(' · '));
    await ctx.close();
  }
  {
    /* 12g. cabe sem rolagem em 390 e 1440, nos dois temas */
    for (const [W, H] of [[390, 844], [1440, 900]]) {
      const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: W < 821, hasTouch: W < 821 });
      const p = await ctx.newPage();
      await p.addInitScript(() => { try { localStorage.setItem('cdf-pv', '1'); localStorage.setItem('cdf-guia', '1') } catch (e) {} });
      await p.goto(FECHADO + 'fase1', { waitUntil: 'load' });
      await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(400);
      for (const tema of ['dark', 'light']) {
        await p.evaluate(tm => aplicarTema(tm), tema); await p.waitForTimeout(120);
        const m = await p.evaluate(() => ({ tela: S.tab, alto: document.documentElement.scrollHeight, janela: innerHeight, largo: document.documentElement.scrollWidth, w: innerWidth,
          hub: document.getElementById('fc-hub').getBoundingClientRect().toJSON(), porta: document.getElementById('fc-entrar').getBoundingClientRect().toJSON() }));
        t(m.tela === 'fechado' && m.alto <= m.janela + 1 && m.largo <= m.w + 1, W + 'px ' + tema + ': cabe sem rolagem (' + m.alto + '/' + m.janela + ')');
        t(m.hub.height >= 44 && m.porta.height >= 44 && m.hub.bottom <= m.janela && m.porta.bottom <= m.janela, W + 'px ' + tema + ': os dois botões à vista, com altura de toque');
        await p.screenshot({ path: path.join(__dirname, 'saida', 'fechado-' + W + '-' + tema + '.png') });
      }
      await ctx.close();
    }
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
