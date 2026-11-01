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
 * Desde 28/out, O PORTÃO DO LANÇAMENTO (adendo do PRD: acesso exclusivo do
 * proprietário), no fim do arquivo: a sessão só nasce com `zro_release`
 * "allowed" (ou "released" dos dois lados); /eu, /enviar e /ia RELEEM a
 * claim no HUB a cada pedido (nunca o cookie de 30 dias); acesso removido,
 * sessão antiga e HUB fora do ar negam; e as personas do PRD §11 — anônimo,
 * conta comum, assinante, admin de equipe, outro admin, beta tester, sessão
 * antiga — NEGADAS, só a conta da lista PERMITIDA. A LIA das suítes é essa
 * conta (sem `acesso` o HUB falso diz "allowed").
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
    '/api/zro/enviar': require(path.join(RAIZ, 'api', 'zro', 'enviar.js')),
    '/api/zro/ia': require(path.join(RAIZ, 'api', 'zro', 'ia.js')),
    '/api/zro/set': require(path.join(RAIZ, 'api', 'zro', 'set.js')),
  };
  app = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    const fn = rotas[p.startsWith('/api/zro/ia/') ? '/api/zro/ia' : p.startsWith('/api/zro/set/') ? '/api/zro/set' : p];
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
const cookieDe = cookies => [...cookies].filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('; ');
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
  assert.equal(q.get('scope'), 'openid email profile org offline_access carro-do-freela.jobs zro.ia zro.set zro.pessoas');
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

test('direito de uso: conta na lista (allowed) sem "carro-do-freela" em zro_products entra, mas /eu diz liberado:false', async () => {
  for (const [produtos, liberado] of [[['nossom', 'synquei'], false], [[], false], [['carro-do-freela', 'nossom'], true]]) {
    const { cookies } = await fluxo({ pessoa: Object.assign({}, LIA, { produtos }) });
    const sessao = cookies.get('cdf_sessao');
    assert.ok(sessao, 'a sessão abre mesmo sem o plano: a pessoa entra e vê o aviso');
    const eu = await (await pedir('/api/zro/eu', { cookie: cookieDe(cookies) })).json();
    assert.deepEqual(eu.produtos, produtos);
    assert.equal(eu.liberado, liberado, JSON.stringify(produtos));
  }
  assert.equal(Z._interno.PRODUTO, 'carro-do-freela');
});

test('o @ do perfil da Absolute ZRO (preferred_username) chega no /eu; formato estranho não passa', async () => {
  for (const [arroba, esperado] of [['lia.som', 'lia.som'], ['Lia Som!', null]]) {
    const { cookies } = await fluxo({ pessoa: Object.assign({}, LIA, { arroba, produtos: ['carro-do-freela'] }) });
    const eu = await (await pedir('/api/zro/eu', { cookie: cookieDe(cookies) })).json();
    assert.equal(eu.arroba ?? null, esperado);
    assert.equal(JSON.stringify(eu).includes('telefone'), false);
  }
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

  const eu = await pedir('/api/zro/eu', { cookie: 'cdf_sessao=' + encodeURIComponent(sessao) + '; cdf_hub=' + encodeURIComponent(cookies.get('cdf_hub')) });
  assert.equal(eu.status, 200);
  assert.equal(eu.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await eu.json(), {
    sub: 'zro-111',
    nome: 'Lia Produtora',
    email: 'lia@produtora.com',
    organizacao: 'Produtora Lia',
    produtos: ['carro-do-freela'],
    liberado: true,
    hub: true, ia: true,
    release: 'closed',
  });

  const sair = await pedir('/api/zro/sair', { method: 'POST', cookie: 'cdf_sessao=' + encodeURIComponent(sessao), headers: { origin: SITE } });
  assert.equal(sair.status, 204);
  assert.equal(cookiesDe(sair).get('cdf_sessao'), '');
  assert.match(sair.headers.getSetCookie()[0], /Max-Age=0/);
});

test('/eu sem sessão: 200 { entrou: false } para o visitante (sem 401 no console), 401 para cookie que não vale; sem cache; GET só', async () => {
  const r = await pedir('/api/zro/eu');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const j = await r.json();
  assert.equal(j.entrou, false);
  assert.equal(j.sub, undefined);
  const lixo = await pedir('/api/zro/eu', { cookie: 'cdf_sessao=abc.def' });
  assert.equal(lixo.status, 401);
  assert.equal((await lixo.json()).erro, 'sem_sessao');
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
  for (const host of ['carrodofreela.com.br', 'www.carrodofreela.com.br', 'carro.absolutezro.com', 'carrodofreela-app.vercel.app']) {
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

test('o domínio antigo leva ao carro.absolutezro.com, com o caminho (308); o subdomínio não redireciona', () => {
  const SEG = require(path.join(RAIZ, 'src', 'seguranca.js'));
  const rotas = SEG.rotasVercel("default-src 'self'", ['index']);
  for (const host of ['carrodofreela.com.br', 'www.carrodofreela.com.br']) {
    const r = rotas.find(x => x.has && x.has.some(h => h.type === 'host' && h.value === host));
    assert.ok(r, host);
    assert.equal(r.status, 308);
    assert.equal(r.headers.Location, 'https://carro.absolutezro.com/$1');
    assert.ok(rotas.indexOf(r) < rotas.findIndex(x => x.handle === 'filesystem'));
  }
  assert.ok(!rotas.some(x => x.has && x.has.some(h => /absolutezro\.com$/.test(h.value))), 'o subdomínio nunca redireciona para si');
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
    for (const n of ['entrar', 'callback', 'eu', 'sair', 'ia']) {
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
      /* a Z: /api/zro/ia/<caminho> chega à função ia (sem sessão, 401; caminho fora da lista, 404) */
      assert.equal((await get('/api/zro/ia/estado')).status, 401);
      assert.equal((await get('/api/zro/ia/../eu')).status, 200, 'o ../ normaliza para /api/zro/eu (visitante: 200 entrou:false), nunca para a Z');
      assert.equal((await get('/api/zro/ia/carro-do-freela/jobs')).status, 404);
      assert.match(csp, /script-src 'self' https:\/\/absolutezro\.com 'sha256-/);
      assert.match(csp, /img-src 'self' data: blob: https:\/\/absolutezro\.com/);
      assert.doesNotMatch(csp, /connect-src[^;]*absolutezro/);
      const eu = await get('/api/zro/eu');
      assert.equal(eu.status, 200);
      assert.equal((await eu.json()).entrou, false);
      assert.equal(eu.headers.get('cache-control'), 'no-store');
      assert.equal(eu.headers.get('x-content-type-options'), 'nosniff');
    } finally {
      await new Promise(ok => srv.close(() => ok()));
    }
  } finally {
    fs.rmSync(saida, { recursive: true, force: true });
  }
});

/* ============ job e equipe → projeto na Absolute ZRO (26/out · 3) ============ */

const SALA = '0e7d3c1a-4b2f-4c8e-9a1d-2f6b8c0d4e11';
const ZECA = '5a9c2e7b-1d3f-4a6b-8c0e-9f2d4b6a8c13';
const pedidoJob = (extra = {}) =>
  Object.assign(
    {
      job: {
        id: 'cdf-1a2b3c',
        titulo: 'Institucional Cooperativa',
        tipo: 'Institucional',
        cliente: 'Cooperativa Potiguar',
        cidade: 'Natal',
        briefing: 'Três blocos: depoimentos, assembleia e fábrica.\nChamada: 07:00 no estacionamento',
        datas: [{ data: '2026-11-03', rotulo: '07:30 às 18:00' }, { data: 'amanhã' }],
        funcoes: [{ funcao: 'Op. de câmera', quantas: 2 }, { funcao: 'Editor', quantas: 0 }],
        referencias: ['https://exemplo.com/board', 'http://inseguro.exemplo', 'board no Pinterest'],
        telefone: '(84) 99999-0000',
      },
      equipe: [
        { conta: SALA, email: 'Sala@Exemplo.com', funcao: 'Op. de câmera', papel: 'editor', telefone: '84999990000' },
        { conta: ZECA, email: 'zeca@exemplo.com', funcao: 'Drone' },
        { conta: null, email: 'sem-conta@exemplo.com', funcao: 'Assistente' },
      ],
    },
    extra,
  );
const enviarJob = (cookies, corpo, headers = {}) =>
  fetch(SITE + '/api/zro/enviar', {
    method: 'POST',
    redirect: 'manual',
    headers: Object.assign(
      { 'content-type': 'application/json', origin: SITE, cookie: [...cookies].filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('; ') },
      headers,
    ),
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
const sessaoCom = cookies => new Map([['cdf_sessao', cookies.get('cdf_sessao')], ['cdf_hub', cookies.get('cdf_hub')]]);

test('o login guarda o acesso ao HUB cifrado, httpOnly e só em /api/zro', async () => {
  const { res, cookies } = await fluxo();
  const linha = res.headers.getSetCookie().find(c => c.startsWith('cdf_hub='));
  assert.match(linha, /HttpOnly/);
  assert.match(linha, /SameSite=Lax/);
  assert.match(linha, /Path=\/api\/zro/);
  const valor = cookies.get('cdf_hub');
  assert.ok(valor && !/zt_|at_/.test(valor) && !/zt_|at_/.test(Buffer.from(valor.split('.')[1], 'base64url').toString('latin1')), 'nada de token legível no cookie');
  const d = Z._interno.decifrar(valor, CLIENTE.clientSecret);
  assert.equal(d.sub, LIA.sub);
  assert.match(d.rt, /^zt_/);
  assert.equal(Z._interno.decifrar(valor, 'outro-segredo'), null, 'outra chave não abre');
  const mexido = valor.slice(0, -3) + (valor.endsWith('A') ? 'BBB' : 'AAA');
  assert.equal(Z._interno.decifrar(mexido, CLIENTE.clientSecret), null, 'cookie adulterado não abre');
});

test('HUB que ainda não conhece o escopo de jobs: o login refaz o pedido sem ele e entra igual', async () => {
  zro.estado.semEscopoJobs = true;
  try {
    const { local: semSet, res } = await fluxo({ volta: '/fase1' });
    assert.equal(res.status, 303);
    /* primeiro sem o Set (HUB de antes dele); recusou de novo, sem os escopos de API */
    assert.match(semSet, /^\/api\/zro\/entrar\?sem_set=1&volta=%2Ffase1$/);
    const ida0 = await pedir(semSet);
    assert.equal(new URL(ida0.headers.get('location')).searchParams.get('scope'), 'openid email profile org offline_access carro-do-freela.jobs zro.ia');
    const z0 = await fetch(new URL(ida0.headers.get('location')), { redirect: 'manual' });
    const v0 = new URL(z0.headers.get('location'));
    const local = (await pedir(v0.pathname + v0.search, { cookie: 'cdf_zro=' + encodeURIComponent(cookiesDe(ida0).get('cdf_zro')) })).headers.get('location');
    assert.match(local, /^\/api\/zro\/entrar\?basico=1&volta=%2Ffase1$/);
    const ida = await pedir(local);
    const destino = new URL(ida.headers.get('location'));
    /* o refresh fica no pedido básico: é com ele que a claim é relida (28/out) */
    assert.equal(destino.searchParams.get('scope'), 'openid email profile org offline_access');
    const z = await fetch(destino, { redirect: 'manual' });
    const volta = new URL(z.headers.get('location'));
    const fim = await pedir(volta.pathname + volta.search, { cookie: 'cdf_zro=' + encodeURIComponent(cookiesDe(ida).get('cdf_zro')) });
    assert.equal(fim.headers.get('location'), '/fase1?zro=entrou');
    const c = cookiesDe(fim);
    assert.ok(c.get('cdf_sessao'));
    assert.ok(c.get('cdf_hub'), 'o acesso fica guardado mesmo sem os escopos: a claim é relida com ele');
    const eu = await (await pedir('/api/zro/eu', { cookie: cookieDe(c) })).json();
    assert.equal(eu.liberado, true);
    assert.equal(eu.hub, false, 'sem o escopo de jobs, nada de envio');
    assert.equal(eu.ia, false);
  } finally {
    zro.estado.semEscopoJobs = false;
  }
});

test('enviar: o job vira projeto e a equipe com conta vai junto, só com o que o contrato aceita', async () => {
  const { cookies } = await fluxo();
  const r = await enviarJob(sessaoCom(cookies), pedidoJob());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const out = await r.json();
  assert.match(out.projeto.id, /^[0-9a-f-]{36}$/);
  assert.equal(out.projeto.link, zro.url + '/projetos/' + out.projeto.id);
  assert.equal(out.projeto.criado, true);
  assert.deepEqual(out.equipe, {
    membros: [
      { conta: SALA, funcao: 'Op. de câmera', estado: 'na_equipe' },
      { conta: ZECA, funcao: 'Drone', estado: 'convidado' },
    ],
    emailEnviado: true,
  });
  const job = zro.estado.jobs.get('cdf-1a2b3c').job;
  assert.deepEqual(Object.keys(job).sort(), ['briefing', 'city', 'client_reference', 'contract', 'crew_roles', 'dates', 'job_id', 'production_type', 'references', 'title']);
  assert.equal(job.contract, 'carro-do-freela.job/1');
  assert.match(job.briefing, /Chamada: 07:00/);
  assert.deepEqual(job.dates, [{ date: '2026-11-03', label: '07:30 às 18:00' }]);
  assert.deepEqual(job.crew_roles, [{ role: 'Op. de câmera', count: 2 }]);
  assert.deepEqual(job.references, ['https://exemplo.com/board']);
  assert.ok(!JSON.stringify(job).includes('99999'), 'telefone não sai do Carro');
  const eq = zro.estado.equipes.at(-1);
  assert.equal(eq.contract, 'carro-do-freela.crew/1');
  assert.deepEqual(eq.members, [
    { zro_user_id: SALA, email: 'sala@exemplo.com', function: 'Op. de câmera', project_role: 'editor' },
    { zro_user_id: ZECA, email: 'zeca@exemplo.com', function: 'Drone', project_role: 'viewer' },
  ]);
  /* de novo: o mesmo projeto, e com o token ainda valendo não há troca de refresh */
  const antes = zro.estado.renovacoes;
  const de2 = await (await enviarJob(sessaoCom(cookies), pedidoJob({ equipe: [] }))).json();
  assert.equal(de2.projeto.id, out.projeto.id);
  assert.equal(de2.projeto.criado, false);
  assert.equal(de2.equipe, null);
  assert.equal(zro.estado.renovacoes, antes);
});

test('enviar com o token vencido: renova, grava o refresh novo, e o velho derruba o acesso', async () => {
  zro.estado.atTtl = 30;
  try {
    const { cookies } = await fluxo();
    const velho = sessaoCom(cookies);
    const antes = zro.estado.renovacoes;
    const r = await enviarJob(velho, pedidoJob());
    assert.equal(r.status, 200);
    assert.equal(zro.estado.renovacoes, antes + 1);
    const novo = cookiesDe(r).get('cdf_hub');
    assert.ok(novo && novo !== velho.get('cdf_hub'));
    assert.equal((await enviarJob(new Map([['cdf_sessao', velho.get('cdf_sessao')], ['cdf_hub', novo]]), pedidoJob())).status, 200);
    /* reapresentar o refresh já trocado: o HUB derruba a família e o Carro pede para entrar de novo */
    const r3 = await enviarJob(velho, pedidoJob());
    assert.equal(r3.status, 401);
    assert.equal((await r3.json()).erro, 'reconectar');
    assert.equal(cookiesDe(r3).get('cdf_hub'), '');
  } finally {
    zro.estado.atTtl = 600;
  }
});

test('enviar: portas fechadas (origem, método, sessão, acesso de outra conta, plano, pedido ruim, recusa do HUB)', async () => {
  const { cookies } = await fluxo();
  const ok = sessaoCom(cookies);
  assert.equal((await enviarJob(ok, pedidoJob(), { origin: 'https://evil.exemplo' })).status, 403);
  assert.equal((await fetch(SITE + '/api/zro/enviar', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'x=1' }, body: '{}' })).status, 403, 'sem Origin');
  assert.equal((await pedir('/api/zro/enviar')).status, 405);
  assert.equal((await enviarJob(ok, pedidoJob(), { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await enviarJob(new Map([['cdf_hub', ok.get('cdf_hub')]]), pedidoJob())).status, 401, 'sem sessão');
  const r = await enviarJob(new Map([['cdf_sessao', ok.get('cdf_sessao')]]), pedidoJob());
  assert.equal(r.status, 401);
  assert.equal((await r.json()).erro, 'reconectar', 'sessão de antes do envio: entra de novo');
  const outra = await fluxo({ pessoa: Object.assign({}, LIA, { sub: 'zro-222' }) });
  assert.equal((await enviarJob(new Map([['cdf_sessao', ok.get('cdf_sessao')], ['cdf_hub', outra.cookies.get('cdf_hub')]]), pedidoJob())).status, 401, 'acesso de outra conta');
  /* outra conta sem o plano (o HUB falso guarda a conta por sub: mudar a Lia mudaria o `ok` também) */
  const sem = await fluxo({ pessoa: Object.assign({}, LIA, { sub: 'zro-333', produtos: ['nossom'] }) });
  const rp = await enviarJob(sessaoCom(sem.cookies), pedidoJob());
  assert.equal(rp.status, 403);
  assert.equal((await rp.json()).erro, 'plano');
  assert.equal((await enviarJob(ok, '{nada')).status, 400);
  assert.equal((await enviarJob(ok, { job: { id: 'a b', titulo: 'x' } })).status, 400, 'id fora do formato');
  assert.equal((await enviarJob(ok, { job: { id: 'cdf-x' } })).status, 400, 'sem título');
  assert.equal((await enviarJob(ok, 'x'.repeat(70 * 1024))).status, 400, 'grande demais');
  zro.estado.recusaJob = 'entitlement_required';
  try {
    const rj = await enviarJob(ok, pedidoJob());
    assert.equal(rj.status, 403);
    assert.equal((await rj.json()).erro, 'plano');
  } finally {
    zro.estado.recusaJob = null;
  }
  zro.estado.recusaJob = 'forbidden_role';
  try {
    assert.equal((await (await enviarJob(ok, pedidoJob())).json()).erro, 'papel');
  } finally {
    zro.estado.recusaJob = null;
  }
  zro.estado.recusaEquipe = 'forbidden_role';
  try {
    const re = await enviarJob(ok, pedidoJob());
    assert.equal(re.status, 200, 'o projeto sai mesmo quando a equipe é recusada');
    assert.deepEqual((await re.json()).equipe, { erro: 'papel' });
  } finally {
    zro.estado.recusaEquipe = null;
  }
});

test('sair revoga o acesso no HUB e apaga o cookie dele', async () => {
  zro.estado.atTtl = 30; /* o token de acesso guardado já não vale: o envio teria de usar o refresh */
  const { cookies } = await fluxo();
  zro.estado.atTtl = 600;
  const antes = zro.estado.revogados;
  const sair = await pedir('/api/zro/sair', {
    method: 'POST',
    cookie: 'cdf_sessao=' + encodeURIComponent(cookies.get('cdf_sessao')) + '; cdf_hub=' + encodeURIComponent(cookies.get('cdf_hub')),
    headers: { origin: SITE },
  });
  assert.equal(sair.status, 204);
  assert.equal(zro.estado.revogados, antes + 1);
  assert.equal(cookiesDe(sair).get('cdf_hub'), '');
  assert.equal((await enviarJob(sessaoCom(cookies), pedidoJob())).status, 401, 'o refresh revogado não serve mais');
});

/* ============ a Z, a IA da Absolute ZRO (27/out · 4) ============ */

const ia = (caminho, cookies, o = {}) =>
  fetch(SITE + '/api/zro/ia/' + caminho, {
    method: o.method || (o.corpo !== undefined ? 'POST' : 'GET'),
    redirect: 'manual',
    headers: Object.assign({ cookie: cookieDe(cookies) }, o.corpo !== undefined ? { 'content-type': 'application/json' } : {}, o.method || o.corpo !== undefined ? { origin: SITE } : {}, o.headers || {}),
    body: o.corpo !== undefined ? JSON.stringify(o.corpo) : undefined,
  });

test('a Z: o repasse leva o Bearer da sessão ao HUB e nunca devolve token', async () => {
  const { cookies } = await fluxo({ pessoa: Object.assign({}, LIA, { produtos: ['carro-do-freela'] }) });
  const eu = await (await pedir('/api/zro/eu', { cookie: cookieDe(cookies) })).json();
  assert.equal(eu.ia, true);
  zro.estado.pedidosIa.length = 0;
  const r = await ia('estado', cookies);
  assert.equal(r.status, 200);
  const txt = await r.text();
  assert.equal(JSON.parse(txt).nome, 'Lia');
  assert.doesNotMatch(txt, /at_|zt_/);
  assert.match(zro.estado.pedidosIa[0].autorizacao, /^Bearer at_/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.getSetCookie().length, 0, 'token ainda vale: nada de cookie novo');
  assert.equal((await ia('conversas/c1', cookies, { method: 'DELETE' })).status, 204);
});

test('a Z: mensagens em NDJSON, repassadas em streaming', async () => {
  const { cookies } = await fluxo({ pessoa: Object.assign({}, LIA, { produtos: ['carro-do-freela'] }) });
  const r = await ia('mensagens', cookies, { corpo: { texto: 'quem está no job?' } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /ndjson/);
  const leitor = r.body.getReader();
  const primeiro = new TextDecoder().decode((await leitor.read()).value);
  assert.match(primeiro, /"tipo":"conversa"/);
  assert.doesNotMatch(primeiro, /"tipo":"fim"/, 'não esperou o fim para mandar');
  let resto = '';
  for (let p = await leitor.read(); !p.done; p = await leitor.read()) resto += new TextDecoder().decode(p.value);
  assert.match(resto, /"tipo":"fim"/);
  assert.equal(zro.estado.pedidosIa.at(-1).corpo, JSON.stringify({ texto: 'quem está no job?' }));
});

test('a Z: token vencido renova uma vez e o cookie novo vai na resposta', async () => {
  zro.estado.atTtl = 0;
  const { cookies } = await fluxo({ pessoa: Object.assign({}, LIA, { produtos: ['carro-do-freela'] }) });
  zro.estado.atTtl = 600;
  const antes = zro.estado.renovacoes;
  const r = await ia('conversas', cookies);
  assert.equal(r.status, 200);
  assert.equal(zro.estado.renovacoes, antes + 1);
  const novo = cookiesDe(r).get('cdf_hub');
  assert.ok(novo && novo !== cookies.get('cdf_hub'));
  assert.doesNotMatch(novo, /at_|zt_/);
});

test('a Z: portas fechadas (sem sessão, outra origem, caminho fora, sem o escopo, plano)', async () => {
  const antes = zro.estado.pedidosIa.length;
  assert.equal((await ia('estado', new Map())).status, 401, 'sem sessão');
  const { cookies } = await fluxo({ pessoa: Object.assign({}, LIA, { produtos: ['carro-do-freela'] }) });
  assert.equal((await ia('mensagens', cookies, { corpo: { texto: 'oi' }, headers: { origin: 'https://evil.example' } })).status, 403, 'outra origem');
  assert.equal((await ia('estado', cookies, { method: 'DELETE' })).status, 404, 'método fora');
  assert.equal((await ia('conversas/a/b', cookies)).status, 404, 'caminho fora');
  assert.equal(zro.estado.pedidosIa.length, antes, 'nada disso chegou ao HUB');
  /* plano sem o Carro (outra conta: o HUB falso guarda a conta por sub) */
  const sem = await fluxo({ pessoa: Object.assign({}, LIA, { sub: 'zro-333', produtos: [] }) });
  assert.equal((await ia('estado', sem.cookies)).status, 403);
  /* HUB que não conhece zro.ia: entra sem ele, e a Z pede para reconectar */
  zro.estado.semEscopoIa = true;
  try {
    const { local } = await fluxo({ pessoa: Object.assign({}, LIA, { produtos: ['carro-do-freela'] }), volta: '/' });
    /* primeiro tenta sem o Set; o HUB segue recusando (zro.ia), e aí vai o básico */
    assert.match(local, /^\/api\/zro\/entrar\?sem_set=1/);
  } finally {
    zro.estado.semEscopoIa = false;
  }
});

test('a Z: acesso recusado no HUB vira 401 reconectar e apaga o cookie do HUB', async () => {
  const { cookies } = await fluxo({ pessoa: Object.assign({}, LIA, { produtos: ['carro-do-freela'] }) });
  /* sair revoga a família no HUB; o cookie velho, reapresentado, já não vale */
  const h = Z._interno.decifrar(cookies.get('cdf_hub'), CLIENTE.clientSecret);
  zro.estado.atTtl = 0;
  const vencido = Object.assign({}, h, { atExp: 0 });
  const c2 = new Map(cookies);
  c2.set('cdf_hub', Z._interno.cifrar(vencido, CLIENTE.clientSecret));
  await fetch(zro.url + '/oauth/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic ' + Buffer.from(CLIENTE.clientId + ':' + CLIENTE.clientSecret).toString('base64') },
    body: new URLSearchParams({ token: h.rt }),
  });
  zro.estado.atTtl = 600;
  const r = await ia('estado', c2);
  assert.equal(r.status, 401);
  assert.equal((await r.json()).erro, 'reconectar');
  assert.equal(cookiesDe(r).get('cdf_hub'), '');
});

test('a Z: cookie do HUB de antes da Z (sem ia) pede para reconectar, e o envio de jobs segue', async () => {
  const { cookies } = await fluxo({ pessoa: Object.assign({}, LIA, { produtos: ['carro-do-freela'] }) });
  const h = Z._interno.decifrar(cookies.get('cdf_hub'), CLIENTE.clientSecret);
  delete h.ia;
  delete h.jobs;
  const c2 = new Map(cookies);
  c2.set('cdf_hub', Z._interno.cifrar(h, CLIENTE.clientSecret));
  const r = await ia('estado', c2);
  assert.equal(r.status, 401);
  assert.equal((await r.json()).erro, 'reconectar');
  const eu = await (await pedir('/api/zro/eu', { cookie: cookieDe(c2) })).json();
  assert.equal(eu.hub, true);
  assert.equal(eu.ia, false);
});

/* ============ o portão do lançamento (28/out) — só a conta do proprietário ============ */

const DONO = { sub: 'zro-dono', email: 'dono@exemplo.com', nome: 'Dono da Casa', org: 'Absolute ZRO', acesso: 'allowed' };
/* o HUB falso guarda a conta por sub: subs próprios para cada persona, para uma não mudar a outra */
const PERSONAS = [
  ['conta comum (grátis)', { sub: 'zro-p1', email: 'comum@exemplo.com', nome: 'Conta Comum', org: null, acesso: 'closed', produtos: [] }],
  ['assinante do SOBEDESCE', { sub: 'zro-p2', email: 'assinante@exemplo.com', nome: 'Assinante', org: 'Produtora X', acesso: 'closed', produtos: ['sobedesce', 'synquei'] }],
  ['admin de equipe (dono da organização)', { sub: 'zro-p3', email: 'admin.equipe@exemplo.com', nome: 'Admin de Equipe', org: 'Produtora Y', acesso: 'closed', produtos: ['sobedesce'] }],
  ['outro admin da plataforma (platform_role não é lista)', { sub: 'zro-p4', email: 'outro.admin@exemplo.com', nome: 'Outro Admin', org: 'Absolute ZRO', acesso: 'closed', produtos: ['sobedesce', 'synquei', 'tpeasy'] }],
  ['beta tester de outro produto', { sub: 'zro-p5', email: 'tester@exemplo.com', nome: 'Beta Tester', org: null, acesso: 'closed', produtos: ['nossom'] }],
  ['plano com o Carro, mas fora da lista (HUB sem filtrar zro_products)', { sub: 'zro-p6', email: 'plano@exemplo.com', nome: 'Com Plano', org: 'Produtora Z', acesso: 'closed', semFiltro: true, produtos: ['carro-do-freela'] }],
];
const semSessao = (cookies, nome) => assert.ok(!cookies.get('cdf_sessao') && !cookies.get('cdf_hub'), 'nenhum cookie de sessão fica (' + nome + '): ' + JSON.stringify([...cookies]));

test('o portão: o HUB não emite código para quem está fora (access_denied), e nenhuma sessão nasce', async () => {
  for (const [nome, pessoa] of PERSONAS) {
    const { local, cookies } = await fluxo({ pessoa });
    assert.equal(local, '/?zro=recusado', nome);
    semSessao(cookies, nome);
  }
});

test('o portão: HUB antigo que emite token para qualquer um — a trava deste lado segura, e volta ?zro=fechado', async () => {
  zro.estado.hubAntigo = true;
  try {
    for (const [nome, pessoa] of PERSONAS) {
      const { res, local, cookies } = await fluxo({ pessoa, volta: '/fase1' });
      assert.equal(res.status, 303, nome);
      assert.equal(local, '/fase1?zro=fechado', nome);
      semSessao(cookies, nome);
      assert.equal(cookies.get('cdf_zro'), '', 'o cookie da ida é apagado (' + nome + ')');
    }
    /* sem a claim (HUB de antes do portão): fechado, sempre */
    const sem = await fluxo({ pessoa: Object.assign({}, DONO, { sub: 'zro-p7', acesso: undefined, semRelease: true }) });
    assert.equal(sem.local, '/?zro=fechado', 'sem zro_release = closed');
    semSessao(sem.cookies, 'sem claim');
    /* "released" no HUB com este deploy fechado: os dois lados têm de abrir */
    const rel = await fluxo({ pessoa: Object.assign({}, DONO, { sub: 'zro-p8', acesso: 'released' }) });
    assert.equal(rel.local, '/?zro=fechado', 'released só no HUB não abre');
    semSessao(rel.cookies, 'released só no HUB');
  } finally {
    zro.estado.hubAntigo = false;
  }
  assert.equal(Z._interno.liberacaoDe({}), 'closed');
  assert.equal(Z._interno.liberacaoDe({ zro_release: { 'carro-do-freela': 'allowed' } }), 'allowed');
  assert.equal(Z._interno.liberacaoDe({ zro_release: { 'carro-do-freela': 'aberto' } }), 'closed', 'valor desconhecido = closed');
  assert.equal(Z._interno.liberacaoDe({ zro_release: { nossom: 'allowed' } }), 'closed', 'a lista de outro produto não vale');
});

test('o portão: a conta da lista (allowed) entra, /eu diz liberado, e o envio e a Z funcionam', async () => {
  const { local, cookies } = await fluxo({ pessoa: DONO });
  assert.equal(local, '/?zro=entrou');
  assert.ok(cookies.get('cdf_sessao') && cookies.get('cdf_hub'));
  const r = await pedir('/api/zro/eu', { cookie: cookieDe(cookies) });
  assert.equal(r.status, 200);
  const eu = await r.json();
  assert.equal(eu.sub, 'zro-dono');
  assert.equal(eu.liberado, true);
  assert.equal(eu.release, 'closed', 'o deploy continua fechado para todo o resto');
  assert.equal((await enviarJob(sessaoCom(cookies), pedidoJob({ job: { id: 'cdf-dono', titulo: 'Job do dono' } }))).status, 200);
  assert.equal((await ia('estado', cookies)).status, 200);
});

test('o portão: /eu relê a claim no HUB a cada pedido — o cookie de 30 dias não decide nada', async () => {
  const { cookies } = await fluxo({ pessoa: Object.assign({}, DONO, { sub: 'zro-relido' }) });
  const antes = zro.estado.userinfos;
  assert.equal((await pedir('/api/zro/eu', { cookie: cookieDe(cookies) })).status, 200);
  assert.equal((await pedir('/api/zro/eu', { cookie: cookieDe(cookies) })).status, 200);
  assert.equal(zro.estado.userinfos, antes + 2, 'dois pedidos, duas releituras');
  /* o cookie de sessão sozinho (o de 30 dias, assinado e válido) não vale: não há como reler */
  const so = await pedir('/api/zro/eu', { cookie: 'cdf_sessao=' + encodeURIComponent(cookies.get('cdf_sessao')) });
  assert.equal(so.status, 401);
  assert.equal((await so.json()).erro, 'sem_sessao');
  assert.equal(cookiesDe(so).get('cdf_sessao'), '', 'e a sessão é descartada');
  /* o acesso ao HUB de OUTRA conta com esta sessão também não */
  const outra = await fluxo({ pessoa: Object.assign({}, DONO, { sub: 'zro-relido-2' }) });
  const mistura = await pedir('/api/zro/eu', { cookie: 'cdf_sessao=' + encodeURIComponent(cookies.get('cdf_sessao')) + '; cdf_hub=' + encodeURIComponent(outra.cookies.get('cdf_hub')) });
  assert.equal(mistura.status, 401);
});

test('o portão: acesso removido depois do login (sessão antiga) — /eu 401, /enviar e /ia 401, e os cookies vão embora', async () => {
  const pessoa = Object.assign({}, DONO, { sub: 'zro-antiga' });
  const { cookies } = await fluxo({ pessoa });
  assert.equal((await pedir('/api/zro/eu', { cookie: cookieDe(cookies) })).status, 200);
  /* a conta sai da lista no HUB (o cookie daqui continua assinado e dentro dos 30 dias) */
  zro.estado.contas.get('zro-antiga').acesso = 'closed';
  const eu = await pedir('/api/zro/eu', { cookie: cookieDe(cookies) });
  assert.equal(eu.status, 401);
  assert.equal((await eu.json()).erro, 'sem_sessao');
  const apagados = cookiesDe(eu);
  assert.equal(apagados.get('cdf_sessao'), '');
  assert.equal(apagados.get('cdf_hub'), '');
  assert.ok(eu.headers.getSetCookie().every(c => /Max-Age=0/.test(c)));
  const env = await enviarJob(sessaoCom(cookies), pedidoJob());
  assert.equal(env.status, 401);
  assert.equal((await env.json()).erro, 'reconectar');
  assert.equal(cookiesDe(env).get('cdf_sessao'), '', 'o envio também descarta a sessão');
  const z = await ia('estado', cookies);
  assert.equal(z.status, 401);
  assert.equal((await z.json()).erro, 'reconectar');
  /* e com o token de acesso vencido, o refresh também é recusado pelo HUB (invalid_grant) */
  const h = Z._interno.decifrar(cookies.get('cdf_hub'), CLIENTE.clientSecret);
  const c2 = new Map(cookies);
  c2.set('cdf_hub', Z._interno.cifrar(Object.assign({}, h, { atExp: 0 }), CLIENTE.clientSecret));
  assert.equal((await pedir('/api/zro/eu', { cookie: cookieDe(c2) })).status, 401);
});

test('o portão: HUB antigo que ainda responde userinfo com a claim fechada — 403 fechado em /eu, /enviar e /ia, sessão descartada', async () => {
  const pessoa = Object.assign({}, DONO, { sub: 'zro-fechou' });
  const { cookies } = await fluxo({ pessoa });
  zro.estado.hubAntigo = true;
  try {
    zro.estado.contas.get('zro-fechou').acesso = 'closed';
    const eu = await pedir('/api/zro/eu', { cookie: cookieDe(cookies) });
    assert.equal(eu.status, 403);
    assert.deepEqual(await eu.json(), { erro: 'fechado', release: 'closed' });
    assert.equal(cookiesDe(eu).get('cdf_sessao'), '');
    assert.equal(cookiesDe(eu).get('cdf_hub'), '');
    const antes = zro.estado.jobs.size;
    const env = await enviarJob(sessaoCom(cookies), pedidoJob({ job: { id: 'cdf-fechou', titulo: 'Não passa' } }));
    assert.equal(env.status, 403);
    assert.equal((await env.json()).erro, 'fechado');
    assert.equal(zro.estado.jobs.size, antes, 'nada chegou à API do HUB: a trava é antes');
    const z = await ia('estado', cookies);
    assert.equal(z.status, 403);
    assert.equal((await z.json()).erro, 'fechado');
    assert.equal(cookiesDe(z).get('cdf_hub'), '');
  } finally {
    zro.estado.hubAntigo = false;
  }
});

test('o portão: o HUB diz product_closed na API do Carro — 403 fechado aqui também', async () => {
  /* a claim relida diz allowed (lista), mas a API do HUB fechou o produto no meio do caminho */
  const { cookies } = await fluxo({ pessoa: Object.assign({}, DONO, { sub: 'zro-api' }) });
  zro.estado.recusaJob = 'product_closed';
  try {
    const env = await enviarJob(sessaoCom(cookies), pedidoJob());
    assert.equal(env.status, 403);
    assert.equal((await env.json()).erro, 'fechado');
  } finally {
    zro.estado.recusaJob = null;
  }
});

test('o portão: HUB fora do ar — nada se confere, nada abre (503/502), e a sessão fica para quando ele voltar', async () => {
  const { cookies } = await fluxo({ pessoa: Object.assign({}, DONO, { sub: 'zro-fora' }) });
  zro.estado.fora = true;
  try {
    const eu = await pedir('/api/zro/eu', { cookie: cookieDe(cookies) });
    assert.equal(eu.status, 503);
    assert.deepEqual(await eu.json(), { erro: 'hub', release: 'closed' });
    assert.equal(eu.headers.getSetCookie().length, 0, 'os cookies ficam');
    assert.equal((await enviarJob(sessaoCom(cookies), pedidoJob())).status, 502);
    assert.equal((await ia('estado', cookies)).status, 502);
  } finally {
    zro.estado.fora = false;
  }
  assert.equal((await pedir('/api/zro/eu', { cookie: cookieDe(cookies) })).status, 200, 'o HUB voltou: a mesma sessão vale');
});

test('o portão: /eu sem sessão e sem chaves dizem o estado do deploy (release) — e anônimo não passa em nada', async () => {
  const r = await pedir('/api/zro/eu');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { entrou: false, release: 'closed' });
  assert.equal((await ia('estado', new Map())).status, 401);
  assert.equal((await fetch(SITE + '/api/zro/enviar', { method: 'POST', headers: { 'content-type': 'application/json', origin: SITE }, body: '{}' })).status, 401);
  const guardado = process.env.ZRO_CLIENT_SECRET;
  delete process.env.ZRO_CLIENT_SECRET;
  try {
    const d = await pedir('/api/zro/eu');
    assert.equal(d.status, 503);
    assert.deepEqual(await d.json(), { erro: 'desligado', release: 'closed' });
  } finally {
    process.env.ZRO_CLIENT_SECRET = guardado;
  }
});

test('o portão: CARRO_RELEASE — só "released" exato abre, e só junto com o HUB', async () => {
  for (const v of [undefined, '', 'closed', 'aberto', 'RELEASED ', 'true', '1']) {
    if (v === undefined) delete process.env.CARRO_RELEASE; else process.env.CARRO_RELEASE = v;
    assert.equal(Z._interno.release(), 'closed', JSON.stringify(v));
  }
  process.env.CARRO_RELEASE = 'released';
  try {
    assert.equal(Z._interno.release(), 'released');
    assert.equal((await (await pedir('/api/zro/eu')).json()).release, 'released');
    /* released nos dois lados: entra */
    const rel = await fluxo({ pessoa: Object.assign({}, DONO, { sub: 'zro-rel', acesso: 'released' }) });
    assert.equal(rel.local, '/?zro=entrou');
    assert.equal((await (await pedir('/api/zro/eu', { cookie: cookieDe(rel.cookies) })).json()).liberado, true);
    /* a lista continua valendo */
    assert.equal((await fluxo({ pessoa: Object.assign({}, DONO, { sub: 'zro-rel-2' }) })).local, '/?zro=entrou');
    /* e quem o HUB diz fechado continua fora, mesmo com o deploy aberto */
    zro.estado.hubAntigo = true;
    try {
      const fechada = await fluxo({ pessoa: Object.assign({}, DONO, { sub: 'zro-rel-3', acesso: 'closed' }) });
      assert.equal(fechada.local, '/?zro=fechado');
      semSessao(fechada.cookies, 'fechado com deploy aberto');
    } finally {
      zro.estado.hubAntigo = false;
    }
  } finally {
    delete process.env.CARRO_RELEASE;
  }
  assert.equal(Z._interno.release(), 'closed');
});

/* ---------------- o Set (30/out, ADR 0032 da Absolute ZRO) ---------------- */

const SET_ID = '3f2b8c1e-7d4a-4b9e-9c21-5a6f7e8d9c0b';
const noSet = (caminho, cookies, o = {}) =>
  fetch(SITE + '/api/zro/set' + (caminho ? '/' + caminho : ''), {
    method: o.method || 'GET',
    redirect: 'manual',
    headers: Object.assign({ cookie: cookieDe(cookies) }, o.corpo !== undefined ? { 'content-type': 'application/json' } : {}, o.method && o.method !== 'GET' ? { origin: SITE } : {}, o.headers || {}),
    body: o.corpo !== undefined ? JSON.stringify(o.corpo) : undefined,
  });

test('o Set: o repasse leva o Bearer da sessão, a ETag vai e o 304 volta sem corpo, sem token na resposta', async () => {
  const { cookies } = await fluxo({ pessoa: Object.assign({}, LIA, { produtos: ['carro-do-freela'] }) });
  zro.estado.pedidosSet.length = 0;
  const r = await noSet('', cookies);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('etag'), 'W/"v1"');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const txt = await r.text();
  assert.doesNotMatch(txt, /at_|zt_/);
  const p = zro.estado.pedidosSet[0];
  assert.match(p.autorizacao, /^Bearer at_/);
  assert.equal(p.cookie, null, 'cookie do Carro não vai ao HUB');
  const r2 = await noSet('', cookies, { headers: { 'if-none-match': 'W/"v1"' } });
  assert.equal(r2.status, 304);
  assert.equal(await r2.text(), '');
  await noSet('conversas/' + SET_ID + '?depois=5&limite=x', cookies);
  assert.equal(zro.estado.pedidosSet.at(-1).busca, '?depois=5');
  assert.equal((await noSet('conversas/' + SET_ID + '/mensagens', cookies, { method: 'POST', corpo: { texto: 'oi', chave: 'abcdefgh12' } })).status, 200);
  assert.equal(zro.estado.pedidosSet.at(-1).corpo, JSON.stringify({ texto: 'oi', chave: 'abcdefgh12' }));
});

test('o Set: portas fechadas (sem sessão, outra origem, caminho e método fora, plano) e o 401 do HUB não derruba a sessão', async () => {
  const antes = zro.estado.pedidosSet.length;
  assert.equal((await noSet('', new Map())).status, 401, 'sem sessão');
  const { cookies } = await fluxo({ pessoa: Object.assign({}, LIA, { produtos: ['carro-do-freela'] }) });
  assert.equal((await noSet('', cookies, { method: 'POST', corpo: { estado: 'ativo' }, headers: { origin: 'https://evil.example' } })).status, 403);
  for (const c of ['admin', 'conversas/x', '../oauth/token', 'ia/estado']) assert.equal((await noSet(c, cookies)).status, 404, c);
  assert.equal((await noSet('preferencias', cookies)).status, 405);
  assert.equal(zro.estado.pedidosSet.length, antes, 'nada disso chegou ao HUB');
  const sem = await fluxo({ pessoa: Object.assign({}, LIA, { sub: 'zro-334', produtos: [] }) });
  assert.equal((await noSet('', sem.cookies)).status, 403, 'sem o Carro no plano');
  /* HUB de antes do Set: o login refaz sem zro.set, entra com jobs e a Z, e o Set responde 401 sem apagar nada */
  zro.estado.semEscopoSet = true;
  try {
    const { local } = await fluxo({ pessoa: Object.assign({}, LIA, { produtos: ['carro-do-freela'] }), volta: '/' });
    assert.match(local, /^\/api\/zro\/entrar\?sem_set=1/);
    const ida = await pedir(local);
    const destino = new URL(ida.headers.get('location'));
    assert.equal(destino.searchParams.get('scope'), 'openid email profile org offline_access carro-do-freela.jobs zro.ia');
    const z = await fetch(destino, { redirect: 'manual' });
    const v = new URL(z.headers.get('location'));
    const fim = await pedir(v.pathname + v.search, { cookie: 'cdf_zro=' + encodeURIComponent(cookiesDe(ida).get('cdf_zro')) });
    const c = cookiesDe(fim);
    assert.ok(c.get('cdf_sessao') && c.get('cdf_hub'));
    const r = await noSet('', c);
    assert.equal(r.status, 401);
    assert.ok(!r.headers.getSetCookie().some(x => /Max-Age=0/.test(x)), 'a sessão fica');
    const eu = await (await pedir('/api/zro/eu', { cookie: cookieDe(c) })).json();
    assert.equal(eu.ia, true, 'a Z segue');
  } finally {
    zro.estado.semEscopoSet = false;
  }
});

test('o Set: a aba em comum no Carro — "Set" na lateral e na gaveta, só com a sessão liberada, e a folha com a cara da casa', () => {
  const t = fs.readFileSync(path.join(RAIZ, 'src', 'template.html'), 'utf8');
  assert.match(t, /<button class="tab tabset" id="tab-set" type="button" data-set hidden/);
  assert.match(t, /<button class="gitem" id="g-set" type="button" data-set hidden/);
  assert.match(t, /var SET_SCRIPT="https:\/\/absolutezro\.com\/set\/v1\/zro-set\.js"/);
  assert.match(t, /setAttribute\("modo","folha"\)/);
  assert.match(t, /setAttribute\("api","\/api\/zro\/set"\)/);
  assert.doesNotMatch(t, /zro-set[^\n]*\.token\s*=/);
  for (const v of ['tinta', 'superficie', 'fundo', 'acento', 'raio', 'fonte']) assert.match(t, new RegExp('--zro-set-' + v + ':'), v);
  /* a mesma régua da Z: só no domínio e com a conta liberada */
  assert.match(t, /function setLigavel\(\)\{ return zAbaLigada\(\)&&zroPodeEnviar\(\) \}/);
  const vb = fs.readFileSync(path.join(RAIZ, 'src', 'vercel-build.js'), 'utf8');
  assert.match(vb, /'ia', 'set'\]/);
  assert.match(fs.readFileSync(path.join(RAIZ, 'src', 'seguranca.js'), 'utf8'), /\^\/api\/zro\/set\/\(\.\+\)\$/);
});
