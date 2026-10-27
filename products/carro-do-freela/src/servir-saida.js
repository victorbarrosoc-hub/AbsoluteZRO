#!/usr/bin/env node
/**
 * `node src/servir-saida.js [porta]` — serve o `.vercel/output` que o
 * `src/vercel-build.js` gerou, seguindo as MESMAS rotas do config.json:
 * cabeçalhos, redirecionamentos, cleanUrls, arquivos e as funções de
 * /api/zro. É um ensaio na máquina, não a Vercel: serve para ver a CSP de
 * verdade, o /app/ fechado e o login com um HUB local (ZRO_ISSUER).
 *
 * Também é o que o teste do login usa (test/api/) para passar pelas rotas
 * como o navegador passaria.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const TIPOS = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.mp4': 'video/mp4', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' };

function servirSaida(saida) {
  const cfg = JSON.parse(fs.readFileSync(path.join(saida, 'config.json'), 'utf8'));
  const funcoes = {};
  const raizFn = path.join(saida, 'functions');
  const andar = (dir, rel) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      if (e.name.endsWith('.func')) {
        const vc = JSON.parse(fs.readFileSync(path.join(dir, e.name, '.vc-config.json'), 'utf8'));
        funcoes[rel + '/' + e.name.slice(0, -5)] = require(path.join(dir, e.name, vc.handler));
      } else andar(path.join(dir, e.name), rel + '/' + e.name);
    }
  };
  andar(raizFn, '');

  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://local');
    let caminho = decodeURIComponent(u.pathname);
    const extra = {};
    for (const r of cfg.routes) {
      if (r.handle === 'filesystem') {
        const fn = funcoes[caminho.split('?')[0]];
        if (fn) {
          const escrever = res.writeHead.bind(res);
          res.writeHead = (status, h) => escrever(status, Object.assign({}, extra, h || {}));
          return fn(req, res);
        }
        const arq = path.join(saida, 'static', caminho);
        if (arq.startsWith(path.join(saida, 'static')) && fs.existsSync(arq) && fs.statSync(arq).isFile()) {
          res.writeHead(200, Object.assign({ 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream' }, extra));
          return res.end(fs.readFileSync(arq));
        }
        res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, extra));
        return res.end('404');
      }
      const m = new RegExp(r.src).exec(caminho);
      if (!m) continue;
      const troca = s => s.replace(/\$(\d)/g, (_, i) => m[+i] || '');
      if (r.status) {
        const h = Object.assign({}, extra);
        for (const [k, v] of Object.entries(r.headers || {})) h[k] = troca(v);
        res.writeHead(r.status, h);
        return res.end();
      }
      if (r.headers) Object.assign(extra, r.headers);
      if (r.dest) caminho = troca(r.dest);
    }
    res.writeHead(404);
    res.end();
  });
}

module.exports = { servirSaida };

if (require.main === module) {
  const porta = +process.argv[2] || 5180;
  servirSaida(path.resolve(__dirname, '..', '.vercel', 'output')).listen(porta, '127.0.0.1', () => console.log('http://localhost:' + porta));
}
