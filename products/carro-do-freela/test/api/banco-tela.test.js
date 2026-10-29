/**
 * MEU PERFIL E MEU INVENTÁRIO NA TELA (28/out) — o bloco `#cfb` de "Meu
 * perfil" num Chromium de verdade, contra o servidor de verdade (as funções
 * de api/zro/), uma Absolute ZRO falsa e um Postgres descartável.
 *
 * Roda em `npm run test:banco` junto com banco.test.js; precisa de Postgres
 * (TEST_DATABASE_URL) e do Playwright (global, como a bateria; CHROME=…).
 * Sem o Playwright, PULA dizendo por quê — nunca passa à toa.
 *
 * Confere: sem sessão o bloco não existe; com a conta liberada ele aparece,
 * nasce vazio (sem diária nem item inventado), grava perfil e itens no banco,
 * recusa telefone dizendo por quê, edita e remove; e banco desligado some
 * com o bloco sem quebrar a tela.
 */
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { Client } = require('pg');
const { iniciarZroFalsa } = require('./zro-falso.js');

const RAIZ = path.resolve(__dirname, '..', '..');
let chromium = null, porque = '';
try { ({ chromium } = require('playwright')) } catch (e) {
  /* o Playwright da bateria é global (o Carro não o põe em node_modules) */
  try { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright'))) }
  catch (e2) { porque = 'sem o Playwright (instale global, como a bateria)' }
}
const CHROME = process.env.CHROME || ['/opt/pw-browsers/chromium-1248/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(f => fs.existsSync(f));

const BASE = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';
const NOME_DB = 'carro_test_tela_' + process.pid;
const urlDe = db => { const u = new URL(BASE); u.pathname = '/' + db; return u.toString() };
const CLIENTE = { clientId: 'carrodofreela-web', clientSecret: 'segredo-de-teste-' + crypto.randomBytes(8).toString('hex') };
const DONO = { sub: crypto.randomUUID(), email: 'dono@exemplo.com', nome: 'Dono Teste', org: 'Org' };
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };

let zro, app, SITE, nav;
const pular = () => porque || (!fs.existsSync(path.join(RAIZ, 'public', 'index.html')) ? 'sem public/index.html (rode npm run build)' : '');

before(async () => {
  if (pular()) return;
  const a = new Client({ connectionString: BASE });
  await a.connect();
  await a.query(`drop database if exists ${NOME_DB} with (force)`);
  await a.query(`create database ${NOME_DB}`);
  await a.end();
  const c = new Client({ connectionString: urlDe(NOME_DB) });
  await c.connect();
  await require(path.join(RAIZ, 'db', 'migrador.js')).migrar(c);
  await c.end();
  zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret, CARRO_DATABASE_URL: urlDe(NOME_DB) });
  delete process.env.CARRO_SYNC_ATIVO;
  const fn = n => require(path.join(RAIZ, 'api', 'zro', n + '.js'));
  const rotas = { entrar: fn('entrar'), callback: fn('callback'), eu: fn('eu'), sair: fn('sair'), perfil: fn('perfil'), inventario: fn('inventario') };
  app = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    const m = p.match(/^\/api\/zro\/([a-z]+)$/);
    if (m && rotas[m[1]]) return rotas[m[1]](req, res);
    const f = path.join(RAIZ, 'public', p === '/' ? 'index.html' : path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (f.startsWith(path.join(RAIZ, 'public')) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(f));
    }
    res.writeHead(204);
    res.end();
  });
  await new Promise(ok => app.listen(0, '127.0.0.1', ok));
  SITE = 'http://127.0.0.1:' + app.address().port;
  nav = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
});
after(async () => {
  if (nav) await nav.close();
  if (app) await new Promise(ok => app.close(() => ok()));
  if (zro) await zro.fechar();
  await require(path.join(RAIZ, 'db', 'banco.js')).fecharCompartilhado();
  if (pular()) return;
  const a = new Client({ connectionString: BASE });
  await a.connect();
  await a.query(`drop database if exists ${NOME_DB} with (force)`);
  await a.end();
});

async function pagina(logado) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const pg = await ctx.newPage();
  const erros = [];
  pg.on('pageerror', e => erros.push(String(e)));
  if (logado) {
    zro.estado.proximo = { pessoa: DONO, negar: false, adulterar: null };
    await pg.goto(SITE + '/api/zro/entrar?volta=%2F');
  } else await pg.goto(SITE + '/');
  await pg.waitForFunction(() => typeof show === 'function' && !document.getElementById('splash'), null, { timeout: 15000 });
  await pg.evaluate(() => show('meu'));
  return { ctx, pg, erros };
}

test('sem sessão Absolute ZRO o bloco do banco não existe', { skip: pular() || false }, async () => {
  const { ctx, pg, erros } = await pagina(false);
  await pg.waitForTimeout(600);
  assert.equal(await pg.locator('#cfb').count(), 0);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('com a conta liberada: perfil e inventário gravam no banco, telefone é recusado na tela', { skip: pular() || false }, async () => {
  const { ctx, pg, erros } = await pagina(true);
  const bloco = pg.locator('#cfb');
  await bloco.waitFor({ state: 'visible', timeout: 10000 });
  await pg.evaluate(() => document.getElementById('cfb').scrollIntoView());
  assert.match(await bloco.innerText(), /Nenhum equipamento ainda/);
  assert.equal(await pg.locator('#cfb-vis').isChecked(), false, 'mostrar o perfil nasce desmarcado');
  /* perfil: telefone na bio é recusado, e a tela diz por quê */
  await pg.fill('#cfb-nome', 'Dono Teste');
  await pg.fill('#cfb-bio', 'chama no 84 99999-0000');
  await pg.click('#cfb-salvar');
  await pg.waitForFunction(() => /telefone/i.test(document.getElementById('cfb-pst').textContent));
  await pg.fill('#cfb-bio', 'Câmera e drone.');
  await pg.fill('#cfb-cidade', 'Natal');
  await pg.selectOption('#cfb-uf', 'RN');
  await pg.click('#cfb-fun .chip[data-v="Op. de câmera"]');
  await pg.click('#cfb-salvar');
  await pg.waitForFunction(() => document.getElementById('cfb-pst').textContent === 'Salvo.');
  /* inventário: adicionar, editar, remover */
  await pg.click('#cfb-novo');
  await pg.selectOption('#cfb-icat', 'drone');
  await pg.fill('#cfb-imar', 'DJI');
  await pg.fill('#cfb-imod', 'Mavic 3');
  await pg.fill('#cfb-idia', '350,00');
  await pg.click('#cfb-isalvar');
  await pg.locator('.cfb-it').first().waitFor();
  assert.match(await pg.locator('.cfb-it').first().innerText(), /DJI Mavic 3[\s\S]*Drone[\s\S]*R\$\s?350,00/);
  /* CFB_FOTO=/caminho.png guarda o retrato do bloco para olhar (não é asserção) */
  if (process.env.CFB_FOTO) await bloco.screenshot({ path: process.env.CFB_FOTO });
  await pg.click('[data-cfb-ed]');
  await pg.uncheck('#cfb-iat');
  await pg.click('#cfb-isalvar');
  await pg.locator('.cfb-it.off').waitFor();
  /* recarregou: o que está lá veio do banco, não do aparelho */
  const c = new Client({ connectionString: urlDe(NOME_DB) });
  await c.connect();
  const { rows } = await c.query('select sub, modelo, diaria_cents, ativo from carro_do_freela.inventario');
  const perfil = (await c.query('select nome_exibicao, uf, funcoes, visibilidade from carro_do_freela.perfis')).rows;
  await c.end();
  assert.deepEqual(rows.map(r => [r.sub, r.modelo, Number(r.diaria_cents), r.ativo]), [[DONO.sub, 'Mavic 3', 35000, false]]);
  assert.deepEqual(perfil, [{ nome_exibicao: 'Dono Teste', uf: 'RN', funcoes: ['Op. de câmera'], visibilidade: 'privado' }]);
  await pg.click('[data-cfb-rm]');
  await pg.click('[data-cfb-rm]');
  await pg.locator('.cfb-vz').waitFor();
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('banco desligado: o bloco some e a tela segue igual', { skip: pular() || false }, async () => {
  const guardado = process.env.CARRO_DATABASE_URL;
  delete process.env.CARRO_DATABASE_URL;
  try {
    const { ctx, pg, erros } = await pagina(true);
    await pg.waitForTimeout(1500);
    assert.equal(await pg.locator('#cfb').count(), 0);
    assert.ok(await pg.locator('#pf-add').isVisible(), 'o resto de Meu perfil continua');
    assert.deepEqual(erros, []);
    await ctx.close();
  } finally {
    process.env.CARRO_DATABASE_URL = guardado;
  }
});
