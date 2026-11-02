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
  const m = await p.evaluate(() => ({ hb: getComputedStyle(document.getElementById('menu-bt')).display,
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
  t(!api.length, 'nenhum pedido chega ao servidor (' + api.slice(0, 3).join(', ') + ')');
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
