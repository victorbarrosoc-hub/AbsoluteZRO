#!/usr/bin/env node
/**
 * `node src/blindar.js <pasta>` — calcula a CSP dos HTML da pasta e PROVA
 * que cada um abre com ela. Imprime JSON: { csp, arquivos:[{nome,ok,erros}] }.
 *
 * O `publicar.js` chama isto depois de gerar os sete anônimos, com a pasta
 * do clone. Política que quebra a página não sobe: cada arquivo é servido
 * com o cabeçalho de verdade (e a pasta m/ junto) num Chromium, e tem de
 * passar a abertura inteira sem nenhuma violação de CSP nem exceção.
 *
 * Por que aqui e não só na bateria: as suítes abrem o build interno por
 * file://, onde cabeçalho não existe. Esta é a única passada que vê a página
 * do jeito que o domínio entrega.
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { politica, scriptsDe } = require('./seguranca.js');

const PASTA = path.resolve(process.argv[2] || path.join(__dirname, '..', 'public'));
const NOMES = (process.argv[3] ? process.argv[3].split(',') : ['index', 'fase1', 'fase2', 'fase3', 'fase4', 'fase5', 'fase6'])
  .filter(n => fs.existsSync(path.join(PASTA, n + '.html')));
const BASE = 'http://cdf.blindar/';
const TIPO = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.mp4': 'video/mp4', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json',
  /* (26/out) o script, a folha e as fontes também moram em m/ */
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const lei = await b.newPage();
  const scripts = [];
  for (const n of NOMES) scripts.push(...await scriptsDe(lei, fs.readFileSync(path.join(PASTA, n + '.html'), 'utf8')));
  const csp = politica(scripts);
  await lei.close();

  const arquivos = [];
  for (const n of NOMES) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', e => erros.push('exceção: ' + e.message.slice(0, 140)));
    await p.addInitScript(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', e =>
        window.__csp.push(e.violatedDirective + ' ← ' + (e.blockedURI || 'inline') + (e.sample ? ' «' + e.sample.slice(0, 40) + '»' : '')));
    });
    await p.route('**/*', r => {
      const u = r.request().url();
      if (!u.startsWith(BASE)) return r.fulfill({ status: 204, body: '' });
      let rel = decodeURIComponent(u.slice(BASE.length).split(/[?#]/)[0]) || n + '.html';
      const arq = path.join(PASTA, rel);
      if (!arq.startsWith(PASTA) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) return r.fulfill({ status: 404, body: '' });
      r.fulfill({ status: 200, body: fs.readFileSync(arq), headers: {
        'content-type': TIPO[path.extname(arq)] || 'application/octet-stream',
        'content-security-policy': csp } });
    });
    await p.goto(BASE + n + '.html', { waitUntil: 'load' });
    const abriu = await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 12000 }).then(() => true, () => false);
    if (!abriu) erros.push('a abertura não saiu em 12s');
    const viol = await p.evaluate(() => window.__csp || []);
    erros.push(...viol.map(v => 'CSP: ' + v));
    arquivos.push({ nome: n, ok: !erros.length, erros: erros.slice(0, 6) });
    await ctx.close();
  }
  await b.close();
  process.stdout.write(JSON.stringify({ csp, arquivos }));
})().catch(e => { process.stdout.write(JSON.stringify({ erro: String(e && e.message || e) })); process.exit(1) });
