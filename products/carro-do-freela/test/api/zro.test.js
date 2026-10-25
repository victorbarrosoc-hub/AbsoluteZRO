/**
 * "Continuar com Absolute ZRO" contra uma Absolute ZRO FALSA, local, com
 * chave EC P-256 de verdade (`node --test test/api/`).
 *
 * O caminho feliz (entra, /eu diz quem é, sair apaga) e cada porta que tem
 * de ficar fechada: state errado, nonce errado, emissor e público errados,
 * assinatura de outra chave, cookie adulterado, volta para fora do site,
 * endereço não cadastrado. E as rotas do domínio (config.json da Build
 * Output API) servindo as funções, a CSP e o /app/ fechado.
 *
 * ⚠️ Fica em test/api/, FORA da lista do `test/run.js`: aquelas são as
 * suítes de navegador; esta é de servidor e não abre Chromium.
 */
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { iniciarZroFalsa } = require('./zro-falso.js');

const RAIZ = path.resolve(__dirname, '..', '..');
const CLIENTE = { clientId: 'carrodofreela-web', clientSecret: 'segredo-de-teste-' + crypto.randomBytes(8).toString('hex') };
const LIA = { sub: 'zro-111', email: 'Lia@Produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia' };

let zro, app, SITE, Z;

before(async () => {
  zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret });
  Z = require(path.join(RAIZ, 'api', 'zro', '_zro.js'));
  const rotas = {
    '/api/zro/entrar': require(path.join(RAIZ, 'api', 'zro', 'entrar.js')),
    '/api/zro/callback': require(path.join(RAIZ, 'api', 'zro', 'callback.js')),
    '/api/zro/eu': require(path.join(RAIZ, 'api', 'zro', 'eu.js')),
    '/api/zro/sair': require(path.join(RAIZ, 'api', 'zro', 'sair.js')),
  };
  app = http.createServer((req, res) => {
    const fn = rotas[new URL(req.url, 'http://x').pathname];
    if (fn) return fn(req, res);
    res.writeHead(404);
    res.end();
  });
  await new Promise(ok => app.listen(0, '127.0.0.1', ok));
  SITE = 'http://127.0.0.1:' + app.address().port;
});
after(async () => {
  await new Promise(ok => app.close(() => ok()));
  await zro.fechar();
});

const cookiesDe = res => {
  const m = new Map();
  for (const c of res.headers.getSetCookie()) {
    const [par] = c.split(';');
    const i = par.indexOf('=');
    m.set(par.slice(0, i), decodeURIComponent(par.slice(i + 1)));
  }
  return m;
};
const pedir = (caminho, o = {}) =>
  fetch(SITE + caminho, {
    method: o.method || 'GET',
    redirect: 'manual',
    headers: Object.assign({}, o.cookie ? { cookie: o.cookie } : {}, o.headers || {}),
  });

/** navegador: /api/zro/entrar → HUB falso → /api/zro/callback */
async function fluxo(o = {}) {
  Z._interno.esquecer();
  zro.estado.proximo = { pessoa: 'pessoa' in o ? o.pessoa : LIA, negar: !!o.negar, adulterar: o.adulterar || null };
  const q = new URLSearchParams();
  if (o.volta !== undefined) q.set('volta', o.volta);
  if (o.criar) q.set('criar', '1');
  const ida = await pedir('/api/zro/entrar' + (q.toString() ? '?' + q : ''));
  assert.equal(ida.status, 302);
  const destino = new URL(ida.headers.get('location'));
  assert.equal(destino.origin, zro.url);
  const sc = ida.headers.getSetCookie()[0];
  assert.match(sc, /^cdf_zro=/);
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Lax/);
  assert.match(sc, /Path=\/api\/zro/);
  assert.match(sc, /Max-Age=600/);
  let ida_cookie = cookiesDe(ida).get('cdf_zro');
  if (o.mexerNoCookie) ida_cookie = o.mexerNoCookie(ida_cookie);
  const z = await fetch(destino, { redirect: 'manual' });
  let volta = new URL(z.headers.get('location'));
  assert.equal(volta.origin, SITE);
  if (o.trocarState) volta.searchParams.set('state', 'outro-state');
  const res = await pedir(volta.pathname + volta.search, { cookie: 'cdf_zro=' + encodeURIComponent(ida_cookie) });
  return { ida, destino, res, cookies: cookiesDe(res), local: res.headers.get('location') };
}

test('a ida para o HUB: código + PKCE S256, escopos, nonce e retorno do próprio site', async () => {
  const { destino } = await fluxo();
  const q = destino.searchParams;
  assert.equal(destino.pathname, '/oauth/authorize');
  assert.equal(q.get('response_type'), 'code');
  assert.equal(q.get('client_id'), 'carrodofreela-web');
  assert.equal(q.get('scope'), 'openid email profile org');
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.match(q.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.ok(q.get('nonce') && q.get('state') && q.get('nonce') !== q.get('state'));
  assert.equal(q.get('redirect_uri'), SITE + '/api/zro/callback');
  assert.equal(q.get('prompt'), null, 'entrar não pede prompt');
});

test('criar conta = criar a conta Absolute ZRO: prompt=create no HUB, e volta já dentro', async () => {
  const { destino, local, cookies } = await fluxo({ criar: true, volta: '/?conta=criar' });
  assert.equal(destino.searchParams.get('prompt'), 'create');
  assert.equal(zro.estado.ultimoAuthorize.prompt, 'create');
  assert.equal(local, '/?conta=criar&zro=entrou');
  assert.ok(cookies.get('cdf_sessao'));
  /* qualquer outro valor não vira prompt */
  const r = await pedir('/api/zro/entrar?criar=sim');
  assert.equal(new URL(r.headers.get('location')).searchParams.get('prompt'), null);
});

test('direito de uso: sem "carro-do-freela" em zro_products entra, mas /eu diz liberado:false', async () => {
  for (const [produtos, liberado] of [[['nossom', 'synquei'], false], [[], false], [['carro-do-freela', 'nossom'], true]]) {
    const { cookies } = await fluxo({ pessoa: Object.assign({}, LIA, { produtos }) });
    const sessao = cookies.get('cdf_sessao');
    assert.ok(sessao, 'a sessão abre mesmo sem acesso: a pessoa entra e vê o aviso');
    const eu = await (await pedir('/api/zro/eu', { cookie: 'cdf_sessao=' + encodeURIComponent(sessao) })).json();
    assert.deepEqual(eu.produtos, produtos);
    assert.equal(eu.liberado, liberado, JSON.stringify(produtos));
  }
  assert.equal(Z._interno.PRODUTO, 'carro-do-freela');
});

test('sessão antiga, de antes da lista de produtos, não vale: volta pelo HUB', async () => {
  const velha = Z._interno.selar({ sub: 'zro-111', nome: 'Lia', email: 'lia@produtora.com', org: null, exp: Math.floor(Date.now() / 1000) + 3600 }, CLIENTE.clientSecret, Z._interno.COOKIE_SESSAO);
  const r = await pedir('/api/zro/eu', { cookie: 'cdf_sessao=' + encodeURIComponent(velha) });
  assert.equal(r.status, 401);
});

test('entra: sessão de 30 dias, volta marcada, /eu diz quem é e sair apaga', async () => {
  const { res, cookies, local } = await fluxo({ volta: '/fase1' });
  assert.equal(res.status, 303);
  assert.equal(local, '/fase1?zro=entrou');
  assert.equal(cookies.get('cdf_zro'), '', 'o cookie da ida é apagado na volta');
  const sessao = cookies.get('cdf_sessao');
  assert.ok(sessao);
  const linha = res.headers.getSetCookie().find(c => c.startsWith('cdf_sessao='));
  assert.match(linha, /HttpOnly/);
  assert.match(linha, /SameSite=Lax/);
  assert.match(linha, /Path=\//);
  assert.match(linha, /Max-Age=2592000/);
  assert.equal(zro.estado.trocas > 0, true);

  const eu = await pedir('/api/zro/eu', { cookie: 'cdf_sessao=' + encodeURIComponent(sessao) });
  assert.equal(eu.status, 200);
  assert.equal(eu.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await eu.json(), {
    sub: 'zro-111',
    nome: 'Lia Produtora',
    email: 'lia@produtora.com',
    organizacao: 'Produtora Lia',
    produtos: ['carro-do-freela'],
    liberado: true,
  });

  const sair = await pedir('/api/zro/sair', { method: 'POST', cookie: 'cdf_sessao=' + encodeURIComponent(sessao), headers: { origin: SITE } });
  assert.equal(sair.status, 204);
  assert.equal(cookiesDe(sair).get('cdf_sessao'), '');
  assert.match(sair.headers.getSetCookie()[0], /Max-Age=0/);
});

test('/eu sem sessão é 401, sem cache; GET só', async () => {
  const r = await pedir('/api/zro/eu');
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal((await r.json()).erro, 'sem_sessao');
  assert.equal((await pedir('/api/zro/eu', { method: 'POST' })).status, 405);
  assert.equal((await pedir('/api/zro/sair')).status, 405, 'sair só por POST');
});

test('state errado não entra', async () => {
  const { local, cookies } = await fluxo({ trocarState: true });
  assert.equal(local, '/?zro=expirou');
  assert.ok(!cookies.get('cdf_sessao'));
});

test('nonce errado no id_token não entra', async () => {
  const { local, cookies } = await fluxo({ adulterar: 'nonce' });
  assert.equal(local, '/?zro=erro');
  assert.ok(!cookies.get('cdf_sessao'));
});

test('emissor errado (no id_token e no ?iss=) não entra', async () => {
  for (const adulterar of ['emissor', 'iss-param']) {
    const { local, cookies } = await fluxo({ adulterar });
    assert.equal(local, '/?zro=erro', adulterar);
    assert.ok(!cookies.get('cdf_sessao'), adulterar);
  }
});

test('público (aud) de outro app não entra', async () => {
  const { local, cookies } = await fluxo({ adulterar: 'aud' });
  assert.equal(local, '/?zro=erro');
  assert.ok(!cookies.get('cdf_sessao'));
});

test('assinatura de outra chave não entra', async () => {
  const { local, cookies } = await fluxo({ adulterar: 'assinatura' });
  assert.equal(local, '/?zro=erro');
  assert.ok(!cookies.get('cdf_sessao'));
});

test('id_token vencido não entra', async () => {
  const { local } = await fluxo({ adulterar: 'expirado' });
  assert.equal(local, '/?zro=erro');
});

test('acesso negado no HUB volta com aviso, sem sessão', async () => {
  const { local, cookies } = await fluxo({ negar: true });
  assert.equal(local, '/?zro=recusado');
  assert.ok(!cookies.get('cdf_sessao'));
});

test('cookie da ida adulterado não entra (e sem cookie também não)', async () => {
  const trocaVolta = c => {
    const [corpo, mac] = c.split('.');
    const d = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    d.volta = 'https://outro.exemplo/';
    return Buffer.from(JSON.stringify(d)).toString('base64url') + '.' + mac;
  };
  const a = await fluxo({ mexerNoCookie: trocaVolta });
  assert.equal(a.local, '/?zro=expirou');
  assert.ok(!a.cookies.get('cdf_sessao'));
  const b = await fluxo({ mexerNoCookie: () => '' });
  assert.equal(b.local, '/?zro=expirou');
});

test('cookie de sessão adulterado, de outra chave ou vencido não vale', async () => {
  const { cookies } = await fluxo();
  const sessao = cookies.get('cdf_sessao');
  const [corpo, mac] = sessao.split('.');
  const d = JSON.parse(Buffer.from(corpo, 'base64url').toString());
  const outro = Buffer.from(JSON.stringify(Object.assign({}, d, { sub: 'zro-999', email: 'intruso@exemplo.com' }))).toString('base64url');
  const casos = {
    'corpo trocado, assinatura velha': outro + '.' + mac,
    'assinado com outro segredo': Z._interno.selar(Object.assign({}, d, { sub: 'zro-999' }), 'outro-segredo', Z._interno.COOKIE_SESSAO),
    'o cookie da ida no lugar do de sessão': Z._interno.selar(d, CLIENTE.clientSecret, Z._interno.COOKIE_IDA),
    vencido: Z._interno.selar(Object.assign({}, d, { exp: Math.floor(Date.now() / 1000) - 5 }), CLIENTE.clientSecret, Z._interno.COOKIE_SESSAO),
    lixo: 'abc.def',
  };
  for (const [nome, valor] of Object.entries(casos)) {
    const r = await pedir('/api/zro/eu', { cookie: 'cdf_sessao=' + encodeURIComponent(valor) });
    assert.equal(r.status, 401, nome);
  }
});

test('volta externa é recusada: sempre um caminho do próprio site', async () => {
  for (const ruim of ['https://outro.exemplo/x', '//outro.exemplo/x', '/\\outro.exemplo', 'javascript:alert(1)', 'fase1', '/%0d%0aSet-Cookie:x=1']) {
    const { local } = await fluxo({ volta: ruim });
    assert.ok(local.startsWith('/') && !local.startsWith('//') && !local.includes('outro.exemplo'), ruim + ' → ' + local);
    assert.ok(!/[\r\n]/.test(local), ruim);
  }
  const { local } = await fluxo({ volta: '/fase2?x=1' });
  assert.equal(local, '/fase2?x=1&zro=entrou');
  assert.equal(Z._interno.voltaSegura('https://outro.exemplo'), '/');
  assert.equal(Z._interno.voltaSegura('//outro.exemplo'), '/');
});

test('endereço não cadastrado não começa login', async () => {
  for (const host of ['carrodofreela.com.br.exemplo', 'outro.vercel.app', 'carrodofreela-app-git-x.vercel.app']) {
    const r = await pedir('/api/zro/entrar', { headers: { 'x-forwarded-host': host, 'x-forwarded-proto': 'https' } });
    assert.equal(r.status, 400, host);
    assert.equal(r.headers.getSetCookie().length, 0, host);
  }
});

test('nos três domínios: retorno cadastrado e cookie Secure', async () => {
  Z._interno.esquecer();
  for (const host of ['carrodofreela.com.br', 'www.carrodofreela.com.br', 'carrodofreela-app.vercel.app']) {
    const r = await pedir('/api/zro/entrar', { headers: { 'x-forwarded-host': host, 'x-forwarded-proto': 'https' } });
    assert.equal(r.status, 302, host);
    assert.equal(new URL(r.headers.get('location')).searchParams.get('redirect_uri'), 'https://' + host + '/api/zro/callback');
    assert.match(r.headers.getSetCookie()[0], /; Secure/, host);
  }
  const sair = await pedir('/api/zro/sair', { method: 'POST', headers: { 'x-forwarded-host': 'carrodofreela.com.br', 'x-forwarded-proto': 'https', origin: 'https://evil.exemplo' } });
  assert.equal(sair.status, 403, 'sair pedido por outro site é recusado');
});

test('a ida é de uso único: o mesmo código não troca duas vezes', async () => {
  Z._interno.esquecer();
  zro.estado.proximo = { pessoa: LIA, negar: false, adulterar: null };
  const ida = await pedir('/api/zro/entrar');
  const c = cookiesDe(ida).get('cdf_zro');
  const z = await fetch(ida.headers.get('location'), { redirect: 'manual' });
  const v = new URL(z.headers.get('location'));
  const um = await pedir(v.pathname + v.search, { cookie: 'cdf_zro=' + encodeURIComponent(c) });
  assert.equal(um.headers.get('location'), '/?zro=entrou');
  const dois = await pedir(v.pathname + v.search, { cookie: 'cdf_zro=' + encodeURIComponent(c) });
  assert.equal(dois.headers.get('location'), '/?zro=erro');
});

test('sem ZRO_CLIENT_ID/SECRET: /eu responde 503 (o botão não aparece) e entrar avisa', async () => {
  const guardado = process.env.ZRO_CLIENT_SECRET;
  delete process.env.ZRO_CLIENT_SECRET;
  try {
    assert.equal((await pedir('/api/zro/eu')).status, 503);
    const r = await pedir('/api/zro/entrar?volta=/fase1');
    assert.equal(r.headers.get('location'), '/fase1?zro=indisponivel');
  } finally {
    process.env.ZRO_CLIENT_SECRET = guardado;
  }
});

test('as rotas do domínio (config.json): CSP, cleanUrls, /app fechado e as funções', async () => {
  const SEG = require(path.join(RAIZ, 'src', 'seguranca.js'));
  const { servirSaida } = require(path.join(RAIZ, 'src', 'servir-saida.js'));
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'carro-saida-'));
  try {
    const paginas = ['index', 'fase1', 'fase2'];
    fs.mkdirSync(path.join(saida, 'static', 'm'), { recursive: true });
    for (const p of paginas) fs.writeFileSync(path.join(saida, 'static', p + '.html'), '<!doctype html><title>' + p + '</title><script>window.p="' + p + '"</script>');
    fs.writeFileSync(path.join(saida, 'static', 'm', 'x.1234567890.webp'), 'w');
    for (const n of ['entrar', 'callback', 'eu', 'sair']) {
      const dir = path.join(saida, 'functions', 'api', 'zro', n + '.func');
      fs.mkdirSync(path.join(dir, 'api', 'zro'), { recursive: true });
      for (const f of [n + '.js', '_zro.js']) fs.copyFileSync(path.join(RAIZ, 'api', 'zro', f), path.join(dir, 'api', 'zro', f));
      fs.writeFileSync(path.join(dir, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: 'api/zro/' + n + '.js', launcherType: 'Nodejs' }));
    }
    const scripts = paginas.flatMap(p => SEG.scriptsDoHtml(fs.readFileSync(path.join(saida, 'static', p + '.html'), 'utf8')));
    const csp = SEG.politica(scripts, ['https://api.web3forms.com']);
    fs.writeFileSync(path.join(saida, 'config.json'), JSON.stringify({ version: 3, routes: SEG.rotasVercel(csp, paginas) }));
    const srv = servirSaida(saida);
    await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
    const B = 'http://127.0.0.1:' + srv.address().port;
    const get = c => fetch(B + c, { redirect: 'manual' });
    try {
      const home = await get('/');
      assert.equal(home.status, 200);
      assert.match(await home.text(), /window\.p="index"/);
      assert.equal(home.headers.get('content-security-policy'), csp);
      assert.match(csp, /script-src 'self' 'sha256-/);
      assert.equal(home.headers.get('x-robots-tag'), 'noindex, nofollow');
      assert.equal(home.headers.get('x-frame-options'), 'DENY');
      assert.equal(home.headers.get('referrer-policy'), 'no-referrer');
      assert.match(await (await get('/fase1')).text(), /window\.p="fase1"/);
      assert.equal((await get('/fase1.html')).headers.get('location'), '/fase1');
      assert.equal((await get('/index.html')).headers.get('location'), '/');
      for (const c of ['/app', '/app/CLAUDE.md', '/app/src/template.html', '/README.md']) {
        const r = await get(c);
        assert.equal(r.status, 307, c);
        assert.equal(r.headers.get('location'), '/', c);
      }
      assert.equal((await get('/CLAUDE.md')).status, 404);
      assert.match((await get('/m/x.1234567890.webp')).headers.get('cache-control'), /immutable/);
      const eu = await get('/api/zro/eu');
      assert.equal(eu.status, 401);
      assert.equal(eu.headers.get('cache-control'), 'no-store');
      assert.equal(eu.headers.get('x-content-type-options'), 'nosniff');
    } finally {
      await new Promise(ok => srv.close(() => ok()));
    }
  } finally {
    fs.rmSync(saida, { recursive: true, force: true });
  }
});
