/* O PORTA-MALAS É O SOBEDESCE (30/out · 5) — no site real.
 * Victor: "O porta mala vira uma sessão onde o sobedesce está ali dentro, fazendo as mesmas coisas da aba Drive do
 * sobedesce, e transferências." Aberto para toda conta (Drive e Transferências são do plano grátis do Sobedesce).
 *
 * O que esta suíte guarda, com carro.absolutezro.com e sobedesce.absolutezro.com simulados no navegador:
 *   - o Porta-malas está na lateral e no menu do site real, e a demonstração antiga não aparece;
 *   - em *.absolutezro.com ele é o próprio app do Sobedesce, num quadro em /app/?no=carro, com Transferências e Drive;
 *   - sem botão de "abrir": a tela abre como a aba Drive do Sobedesce, com um selo pequeno dele (leva ao site);
 *   - o protótipo (build sem --real) continua com a demonstração e sem o item novo na lateral.
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ok = [], bad = []; const t = (c, m) => (c ? ok : bad).push(m);
const PUB = path.resolve(__dirname, '..', 'public');
const APP = path.resolve(__dirname, '..', '..', 'sobedesce', 'web', 'public', 'app');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
const { CHROME, ARGS } = require('./_navegador');

(async () => {
  const real = path.join(PUB, 'real.html');
  if (!fs.existsSync(real)) require('child_process').execFileSync(process.execPath, [path.join(__dirname, '..', 'src', 'build.js'), '--real'], { stdio: 'ignore' });
  const b = await chromium.launch({ executablePath: CHROME, args: ARGS });
  const erros = [];

  /* ---------- no domínio: o quadro do Sobedesce ---------- */
  // sem o service worker do Sobedesce: ele assumiria os pedidos que este teste simula (o SW tem os testes dele)
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await ctx.route('https://carro.absolutezro.com/**', r => {
    const u = new URL(r.request().url());
    const rel = u.pathname === '/' ? 'real.html' : decodeURIComponent(u.pathname.slice(1));
    const f = path.join(PUB, rel);
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      if (u.pathname.startsWith('/api/')) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"erro":"sem_sessao"}' });
      return r.fulfill({ status: 404, body: '' });
    }
    return r.fulfill({ status: 200, contentType: TIPOS[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  const pedidosApp = [];
  await ctx.route('https://sobedesce.absolutezro.com/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/api/eu') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usuario: { id: 'u1', nome: 'Lia Montadora', email: 'lia@exemplo.com' }, contas: [], recursos: {}, zro: { ligada: true } }) });
    if (u.pathname.startsWith('/api/')) return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    let rel = decodeURIComponent(u.pathname.replace(/^\/app\/?/, '')); if (!rel) { rel = 'index.html'; if (u.searchParams.get('no')) pedidosApp.push(u.search) }
    const f = path.join(APP, rel);
    if (!f.startsWith(APP) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: TIPOS[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push(e.message));
  await p.goto('https://carro.absolutezro.com/');
  await p.waitForTimeout(2500);
  await p.evaluate(() => show('malas'));
  await p.waitForTimeout(600);
  const lado = await p.evaluate(() => { const b = document.querySelector('.tabs .tab[data-tab="malas"]'); return !!b && !b.hidden && b.offsetParent !== null && b.getAttribute('aria-current') });
  t(lado === 'true', 'o Porta-malas está na lateral do site real, marcado (' + lado + ')');
  t(await p.evaluate(() => MENU.some(m => m[0] === 'malas')), 'e no menu (chega na fase 1 do site real)');
  const st = await p.evaluate(() => ({
    demo: [...document.querySelectorAll('#v-malas [data-sem-real]')].every(e => e.hidden),
    real: !document.querySelector('#v-malas .ml-real').hidden,
    src: (document.querySelector('#ml-sd iframe') || {}).src || null,
    botoes: document.querySelectorAll('#v-malas #ml-subir:not([hidden])').length && document.querySelector('#ml-subir').offsetParent !== null,
  }));
  t(st.demo && !st.botoes, 'a demonstração antiga (fila desenhada, Subir/Baixar de mentira) não aparece');
  t(st.real, 'o bloco do Sobedesce aparece');
  t(st.src === 'https://sobedesce.absolutezro.com/app/?no=carro&tema=escuro', '⟶⟶ é o próprio app do Sobedesce, em /app/?no=carro, no tema do Carro (' + st.src + ')');
  const quadro = p.frameLocator('#ml-sd iframe');
  const barra = quadro.getByRole('navigation', { name: 'Seções' });
  await barra.waitFor({ timeout: 30000 }).catch(() => {});
  const abas = await barra.locator('.tab-label').allTextContents().catch(() => []);
  t(abas.join(',') === 'Transferências,Drive', '⟶⟶ dentro do quadro: só Transferências e Drive (' + abas.join(', ') + ')');
  const caixa = await p.locator('#ml-sd iframe').boundingBox();
  t(caixa && caixa.height >= 520 && caixa.width > 600, 'o quadro tem altura de app (' + (caixa && Math.round(caixa.height)) + 'px)');
  // o tema do Carro muda, e o Sobedesce muda junto (nunca o do aparelho)
  const fr = p.frames().find(f => f.url().includes('/app/'));
  t(fr && await fr.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'o Sobedesce abre no tema do Carro (escuro)');
  await p.evaluate(() => document.documentElement.classList.add('app-light')); await p.waitForTimeout(300);
  t(fr && await fr.evaluate(() => document.documentElement.dataset.theme) === 'light', '⟶⟶ o Carro foi para o claro, e o Sobedesce foi junto');
  await p.evaluate(() => document.documentElement.classList.remove('app-light'));
  // envio andando: o ponto no Porta-malas, e o "sair?" ao fechar; parou, apaga
  const ponto = () => p.evaluate(() => { const b = document.querySelector('.tabs .tab[data-tab="malas"]'); return getComputedStyle(b, '::after').content !== 'none' });
  await p.evaluate(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://exemplo.com', data: { fonte: 'sobedesce', tipo: 'envios', andando: 3 } })));
  t(!(await ponto()), 'recado de outra origem não acende nada');
  await p.evaluate(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://sobedesce.absolutezro.com', data: { fonte: 'sobedesce', tipo: 'envios', andando: 2 } })));
  t(await ponto() && await p.evaluate(() => MALAS_ANDANDO === 2), '⟶⟶ envio andando: o ponto acende no Porta-malas');
  await p.evaluate(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://sobedesce.absolutezro.com', data: { fonte: 'sobedesce', tipo: 'envios', andando: 0 } })));
  t(!(await ponto()), 'e apaga quando termina');
  await p.evaluate(() => show('malas'));
  t(await p.locator('#ml-sd iframe').count() === 1 && pedidosApp.length === 1, 'voltar à tela não recarrega o quadro (' + JSON.stringify(pedidosApp) + ')');
  if (process.env.PM_FOTOS) await p.screenshot({ path: path.join(process.env.PM_FOTOS, 'porta-malas-pc.png') });
  await ctx.close();

  /* ---------- sem botão: o selo do Sobedesce, e nada de "abrir" ---------- */
  const p2 = await b.newPage({ viewport: { width: 390, height: 844 } });
  p2.on('pageerror', e => erros.push(e.message));
  await p2.goto('file://' + real); await p2.waitForTimeout(1500);
  await p2.evaluate(() => show('malas')); await p2.waitForTimeout(400);
  const selo = await p2.evaluate(() => { const a = document.querySelector('#v-malas .ml-real .ml-selo'); const r = a && a.getBoundingClientRect();
    return { href: a && a.href, alvo: a && a.target, txt: a && a.textContent.trim(), img: !!(a && a.querySelector('img')), alto: r && r.height,
      botoes: [...document.querySelectorAll('#v-malas .ml-real .btn, #v-malas .ml-real button')].filter(e => e.offsetParent).length,
      quadro: !!document.querySelector('#ml-sd iframe') } });
  t(selo.txt === 'Sobedesce' && selo.img && selo.href === 'https://sobedesce.com/' && selo.alvo === '_blank', '⟶⟶ um selo do Sobedesce diz de quem é o sistema e leva ao site dele');
  t(selo.alto && selo.alto <= 34, 'o selo é pequeno (' + Math.round(selo.alto) + 'px)');
  t(selo.botoes === 0 && selo.quadro, 'sem botão de "abrir": a tela já é o Sobedesce');
  await p2.close();

  /* ---------- o protótipo não muda ---------- */
  const proto = path.join(PUB, 'index.html');
  if (fs.existsSync(proto)) {
    const p3 = await b.newPage({ viewport: { width: 1440, height: 900 } });
    p3.on('pageerror', e => erros.push(e.message));
    await p3.goto('file://' + proto); await p3.waitForTimeout(1500);
    const pr = await p3.evaluate(() => { const b = document.querySelector('.tabs .tab[data-tab="malas"]'); show('malas'); return { lado: !!b && !b.hidden, demo: !!document.getElementById('ml-subir') && document.getElementById('ml-subir').offsetParent !== null, quadro: !!document.querySelector('#ml-sd iframe') } });
    t(!pr.lado && pr.demo && !pr.quadro, 'no protótipo o porta-malas segue a demonstração, e a lateral não ganha item');
    await p3.close();
  }

  t(!erros.length, 'zero erro de página' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
  console.log('\nPORTA-MALAS NO SITE REAL');
  ok.forEach(m => console.log('  ✓ ' + m)); bad.forEach(m => console.log('  ✗ ' + m));
  console.log(ok.length + ' ok, ' + bad.length + ' falhas');
  process.exit(bad.length ? 1 : 0);
})();
