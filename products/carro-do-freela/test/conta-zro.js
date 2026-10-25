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
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const { iniciarZroFalsa } = require('./api/zro-falso.js');
const ok = [], bad = []; const t = (c, m) => (c ? ok : bad).push(m);
const RAIZ = path.resolve(__dirname, '..');
const CLIENTE = { clientId: 'carrodofreela-web', clientSecret: 'segredo-da-suite-conta-zro' };

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
  if (!semFuncoes) for (const n of ['entrar', 'callback', 'eu', 'sair']) {
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
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  const abrir = async (url, opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const erros = [], pedidos = [];
    p.on('pageerror', e => erros.push(e.message));
    /* o 401 do /eu sem sessão é a resposta CERTA do contrato, e o favicon.ico
       nunca existiu no domínio (o Chromium pede sozinho); o resto reprova */
    p.on('console', m => { const u = (m.location() && m.location().url) || '';
      if (m.type() === 'error' && !/\/favicon\.ico$/.test(u) && !(opts.aceita401 && /status of 401/.test(m.text()))) erros.push(m.text() + ' @ ' + u) });
    p.on('request', r => { if (/\/api\/zro\//.test(r.url())) pedidos.push(r.url()) });
    await p.addInitScript(() => { try { localStorage.setItem('cdf-pv', '1'); localStorage.setItem('cdf-guia', '1') } catch (e) {} });
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(400);
    return { ctx, p, erros, pedidos };
  };
  const telaEntrar = async p => { await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(900) };
  const botao = p => p.evaluate(() => { const e = document.getElementById('lg-zro');
    return { existe: !!e, escondido: e.hidden, visivel: !!(e.offsetParent), texto: e.innerText.trim(), classe: e.className,
      altura: e.getBoundingClientRect().height, alturaGoogle: document.querySelector('[data-login="Google"]').getBoundingClientRect().height } });

  /* ============ 1. fora do domínio, nada muda ============ */
  {
    const { ctx, p, erros, pedidos } = await abrir('file://' + path.join(RAIZ, 'public', 'index.html'));
    await telaEntrar(p);
    const r = await botao(p);
    t(r.existe && r.escondido && !r.visivel, '⟶⟶ aberto do disco, o botão da Absolute ZRO não aparece');
    t(pedidos.length === 0, 'e o app nem pergunta por /api/zro (' + pedidos.length + ' pedidos)');
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
    t(!r.escondido && r.visivel, '⟶⟶ no domínio, sem sessão, o botão "Continuar com Absolute ZRO" aparece');
    t(r.texto === 'Continuar com Absolute ZRO', 'com o texto combinado (' + r.texto + ')');
    t(/\bblogin\b/.test(r.classe) && Math.abs(r.altura - r.alturaGoogle) < 1, 'no mesmo estilo do botão do Google (' + r.altura + ' × ' + r.alturaGoogle + ')');
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

  await b.close();
  for (const x of srv) await new Promise(r => x.close(() => r()));
  await zro.fechar();
  for (const s of saidas) fs.rmSync(s, { recursive: true, force: true });
  console.log('\n== OK =='); ok.forEach(x => console.log('  ✓ ' + x));
  if (bad.length) { console.log('\n== FALHAS =='); bad.forEach(x => console.log('  ✗ ' + x)) }
  console.log('\n' + ok.length + ' ok, ' + bad.length + ' falhas');
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
