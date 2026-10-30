/* O SET, A ABA EM COMUM DO ECOSSISTEMA (30/out, ADR 0032 da Absolute ZRO).
 *
 * O servidor tem o teste dele (test/api/zro.test.js: repasse, ETag, origem,
 * login sem zro.set); esta suíte olha o lado da TELA, no domínio em miniatura
 * de conta-zro.js — o build interno, as funções de verdade e uma Absolute
 * ZRO falsa local. O widget vem do próprio repositório (apps/hub-web), por
 * rota do Playwright.
 *
 * O que ela jura, no computador (1440) e no celular (390):
 *   1. com a conta liberada, "Set" aparece no fim da lateral e na gaveta
 *      quando o Set responde, pelo /api/zro/set de verdade (função → HUB
 *      falso, com o Bearer posto no servidor e sem cookie), com o balão;
 *   2. o toque abre a folha do <zro-set modo="folha"> da Absolute ZRO com a
 *      tinta do Carro, lateral no computador e tela cheia no celular, sem
 *      trocar de tela (a tela de entrada é a tarefa, nunca a Z); Esc fecha.
 * O domínio fechado (nada do Set para quem o portão nega) é o item 12a de
 * conta-zro.js. SET_FOTOS=<pasta> grava as telas.
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { iniciarZroFalsa } = require('./api/zro-falso.js');
const ok = [], bad = []; const t = (c, m) => (c ? ok : bad).push(m);
const RAIZ = path.resolve(__dirname, '..');
const CLIENTE = { clientId: 'carrodofreela-web', clientSecret: 'segredo-da-suite-set-zro' };
const HUB_PUBLIC = path.resolve(RAIZ, '..', '..', 'apps', 'hub-web', 'public');

/* o domínio aberto em miniatura (o mesmo de conta-zro.js, sem a meta do portão) */
function montarSaida() {
  const SEG = require('../src/seguranca.js');
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'carro-set-zro-'));
  fs.mkdirSync(path.join(saida, 'static'), { recursive: true });
  const html = fs.readFileSync(path.join(RAIZ, 'public', 'index.html'), 'utf8');
  fs.writeFileSync(path.join(saida, 'static', 'index.html'), html);
  fs.cpSync(path.join(RAIZ, 'public', 'm'), path.join(saida, 'static', 'm'), { recursive: true });
  for (const f of ['apple-touch-icon.png', 'icone-192.png', 'icone-512.png', 'icone-maskable.png', 'app.webmanifest', 'og.jpg'])
    fs.copyFileSync(path.join(RAIZ, 'public', f), path.join(saida, 'static', f));
  for (const n of ['entrar', 'callback', 'eu', 'sair', 'enviar', 'ia', 'set']) {
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
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret, CARRO_RELEASE: 'released' });
  const { servirSaida } = require('../src/servir-saida.js');
  const saida = montarSaida();
  const srv = servirSaida(saida); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const DOMINIO = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await require('./_navegador.js').abrir();
  const RITA = { sub: 'zro-42', email: 'rita@coletivo.com', nome: 'Rita Duarte', org: 'Coletivo Rita' };
  const abrir = async (url, opts = {}) => {
    const ctx = await b.newContext(opts.desktop ? { viewport: { width: 1440, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const erros = [];
    await ctx.route('https://absolutezro.com/**', rt => {
      const u = new URL(rt.request().url());
      const f = path.join(HUB_PUBLIC, decodeURIComponent(u.pathname));
      if (f.startsWith(HUB_PUBLIC) && fs.existsSync(f) && fs.statSync(f).isFile())
        return rt.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript; charset=utf-8' : f.endsWith('.webp') ? 'image/webp' : 'application/octet-stream', headers: { 'access-control-allow-origin': '*' } });
      return rt.fulfill({ status: 404, body: '' });
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => erros.push(e.message));
    /* o 401 do /eu sem sessão é a resposta CERTA do contrato, e o favicon.ico nunca existiu no domínio */
    p.on('console', m => { const u = (m.location() && m.location().url) || '';
      if (m.type() === 'error' && !/\/favicon\.ico$/.test(u) && !(opts.aceita401 && /status of 401/.test(m.text()))) erros.push(m.text() + ' @ ' + u) });
    await p.addInitScript(() => { try { localStorage.setItem('cdf-pv', '1'); localStorage.setItem('cdf-guia', '1') } catch (e) {} });
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(400);
    return { ctx, p, erros };
  };
  const telaEntrar = async p => { await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(900) };

  {
    const P = n => '00000000-0000-4000-8000-00000000000' + n;
    zro.estado.setEstado = { eu: { id: P(1), arroba: 'rita', nome: 'Rita Duarte', foto: null, preferencias: { invisivel: false, quemVe: 'equipe_contatos', mostrarVisto: true } },
      pessoas: [{ id: P(2), arroba: 'rui', nome: 'Rui Tavares', foto: null, estado: 'online', app: { id: 'maestro', nome: 'Maestro' } },
        { id: P(3), arroba: 'bia', nome: 'Bia Lemos', foto: null, estado: 'ausente', app: { id: 'hub', nome: 'Absolute ZRO' } }],
      naoLidas: 2, pedidos: 0, porConversa: {}, ultima: 0 };
    const FOTOS = process.env.SET_FOTOS;
    for (const desktop of [true, false]) {
      zro.estado.proximo = { pessoa: Object.assign({}, RITA, { sub: 'zro-4' + (desktop ? '8' : '9') }), negar: false, adulterar: null };
      const { ctx, p, erros } = await abrir(DOMINIO, { aceita401: true, desktop });
      await telaEntrar(p);
      await Promise.all([p.waitForURL(/\/$/, { timeout: 15000 }).catch(() => {}), p.locator('#lg-zro').click()]);
      await p.waitForFunction(() => typeof ZRO_CONTA !== 'undefined' && ZRO_CONTA && MODO, null, { timeout: 15000 }).catch(() => {});
      await p.evaluate(() => { if (S.tab === 'cadastro') concluirCadastro() });
      await p.waitForFunction(() => !document.getElementById('tab-set').hidden, null, { timeout: 15000 }).catch(() => {});
      const W = desktop ? 'computador' : 'celular';
      const e = await p.evaluate(d => { const l = document.getElementById('tab-set'), g = document.getElementById('g-set');
        const vis = d ? l : g;
        return { lado: !l.hidden, gaveta: !g.hidden, balao: vis.querySelector('[data-set-balao]').textContent, tela: S.tab,
          fim: [...document.querySelectorAll('.top .tabs .tab')].filter(x => !x.hidden).slice(-2).map(x => x.id).join(' '), modo: (document.querySelector('zro-set') || {}).getAttribute && document.querySelector('zro-set').getAttribute('modo') } }, desktop);
      t(e.lado && e.gaveta && e.balao === '2', W + ': "Set" aparece quando o Set responde, com o balão das novidades (' + e.balao + ')');
      t(e.fim === 'tab-set tab-z', W + ': o Set fecha a lateral, logo antes da Z (que é a última) (' + e.fim + ')');
      t(e.modo === 'folha' && (e.tela === 'feed' || e.tela === 'propostas'), W + ': a folha do <zro-set>, e a tela de entrada é a tarefa, nunca a Z nem o Set (' + e.tela + ')');
      if (desktop) await p.locator('#tab-set').click();
      else { await p.evaluate(() => abrirGaveta ? abrirGaveta() : null).catch(() => {}); await p.evaluate(() => v('g-set').click()) }
      await p.waitForFunction(() => { const f = document.querySelector('zro-set-folha'); return f && f.shadowRoot.querySelector('.folha[data-on]') && /Rui Tavares/.test(f.shadowRoot.textContent) }, null, { timeout: 15000 }).catch(() => {});
      await p.waitForTimeout(500);
      const f = await p.evaluate(() => { const r = document.querySelector('zro-set-folha').shadowRoot, pn = r.querySelector('.painel');
        const d = document.createElement('div'); d.style.color = 'var(--cal)'; document.body.append(d); const cal = getComputedStyle(d).color; d.remove();
        return { aberta: !!r.querySelector('.folha[data-on]'), rui: /Rui Tavares/.test(r.textContent), cor: getComputedStyle(pn).color, cal, expandido: document.getElementById('tab-set').getAttribute('aria-expanded'), tela: S.tab, largura: pn.getBoundingClientRect().width } });
      t(f.aberta && f.rui, W + ': o toque abre a folha, com quem está online');
      t(f.cor === f.cal, W + ': a tinta da folha é a do Carro (' + f.cor + ')');
      t(f.expandido === 'true' && f.tela === e.tela, W + ': a entrada fica marcada e a tela não muda (' + f.tela + ')');
      t(desktop ? f.largura <= 440 : f.largura >= 380, W + ': lateral no computador, tela cheia no celular (' + Math.round(f.largura) + 'px)');
      const pedido = zro.estado.pedidosSet.filter(x => x.caminho === '').pop();
      t(pedido && /^Bearer at_/.test(pedido.autorizacao) && !pedido.cookie, W + ': o HUB recebeu o Bearer da sessão, posto pelo servidor, sem cookie');
      if (FOTOS) {
        for (const tema of desktop ? ['light', 'dark'] : ['light']) {
          await p.evaluate(tm => aplicarTema(tm), tema); await p.waitForTimeout(400);
          await p.screenshot({ path: path.join(FOTOS, 'carro-' + (desktop ? 'desktop' : '393') + '-' + (tema === 'light' ? 'claro' : 'escuro') + '.png') });
        }
      }
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      t(await p.evaluate(() => document.getElementById('tab-set').getAttribute('aria-expanded')) === 'false', W + ': Esc fecha a folha');
      t(erros.length === 0, W + ': sem erro: ' + erros.slice(0, 2).join(' · '));
      await ctx.close();
    }
    delete zro.estado.setEstado;
  }


  await b.close();
  await new Promise(r => srv.close(() => r()));
  await zro.fechar();
  fs.rmSync(saida, { recursive: true, force: true });
  console.log('\n== OK =='); ok.forEach(x => console.log('  ✓ ' + x));
  if (bad.length) { console.log('\n== FALHAS =='); bad.forEach(x => console.log('  ✗ ' + x)) }
  console.log('\n' + ok.length + ' ok, ' + bad.length + ' falhas');
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
