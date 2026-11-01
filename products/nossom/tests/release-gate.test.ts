/**
 * NOSSOM fechado ao público (PRD §5, Etapa B, 28/10/2026): `RELEASE=closed` é o padrão e só a conta `allowed`
 * na claim `zro_release` do HUB entra. Aqui: a regra única (`temAcesso`), o proxy (estúdio → "Em desenvolvimento",
 * APIs → 403), o login com senha recusado, planos/checkout fechados e os downloads em 404.
 */
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import { GET as accountGet, POST as login } from '../app/api/account/route';
import { GET as subscriptionGet, POST as subscriptionPost } from '../app/api/subscription/route';
import { GET as baixar } from '../app/baixar/route';
import { GET as baixarArquivo } from '../app/baixar/[arquivo]/route';
import { GET as atualizacao } from '../app/baixar/atualizacoes/[arquivo]/route';
import { GET as plans } from '../app/api/plans/route';
import {
  AccessClosedError,
  nossomClosed,
  readZroRelease,
  releaseState,
  temAcesso,
} from '../lib/server/release';
import { authenticate, decodeSession } from '../lib/server/account';
import { allowedClaims, authEnvironment, testCookie, testUser } from './helpers/auth';

const SITE = 'https://nossom.test';
const extra = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'ZRO_CLIENT_ID',
  'ZRO_CLIENT_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];
let restore: () => void;
let oldExtra: Record<string, string | undefined>;
const oldFetch = globalThis.fetch;
/** O vínculo que o Supabase falso devolve para qualquer conta (null = conta sem vínculo). */
let link: Record<string, unknown> | null = null;

beforeEach(() => {
  restore = authEnvironment('closed');
  oldExtra = Object.fromEntries(extra.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    SUPABASE_SERVICE_ROLE_KEY: 'service-test-placeholder',
    ZRO_CLIENT_ID: 'nossom-web',
    ZRO_CLIENT_SECRET: 'zro-test-secret-placeholder',
    STRIPE_SECRET_KEY: 'sk_test_placeholder',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_placeholder',
  });
  link = null;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json(testUser);
    if (url.pathname === '/auth/v1/token')
      return Response.json({
        user: testUser,
        access_token: 'test-access-placeholder',
        refresh_token: 'test-refresh-placeholder',
        expires_in: 3600,
      });
    if (url.pathname === '/rest/v1/rpc/nossom_zro_link') {
      assert.equal(JSON.parse(String(init?.body)).p_action, 'get');
      return Response.json({ link });
    }
    throw new Error('Pedido inesperado ' + url);
  };
});
afterEach(() => {
  globalThis.fetch = oldFetch;
  restore();
  for (const k of extra)
    if (oldExtra[k] === undefined) delete process.env[k];
    else process.env[k] = oldExtra[k];
});
const released = () => {
  process.env.RELEASE = 'released';
};
const linked = (release: Record<string, string>, products = ['nossom']) => {
  link = { email: 'lia@produtora.com', organization: 'Produtora', products, release };
};

test('RELEASE is closed unless it says exactly "released"', () => {
  for (const value of [undefined, '', 'open', 'true', 'Released', ' closed ']) {
    if (value === undefined) delete process.env.RELEASE;
    else process.env.RELEASE = value;
    assert.equal(releaseState(), 'closed', JSON.stringify(value));
    assert.equal(nossomClosed(), true);
  }
  process.env.RELEASE = ' released ';
  assert.equal(releaseState(), 'released');
  assert.equal(nossomClosed(), false);
});

test('temAcesso: closed opens only for "allowed"; released follows zro_products and still honours "closed"', () => {
  const cases: [Parameters<typeof temAcesso>[0], boolean, boolean][] = [
    // [claims, fechado, aberto]
    [null, false, true],
    [{}, false, true],
    [{ zroProducts: ['nossom'] }, false, true],
    [{ zroProducts: ['synquei'] }, false, false],
    [{ zroProducts: ['nossom'], zroRelease: { nossom: 'released' } }, false, true],
    [{ zroProducts: [], zroRelease: { nossom: 'released' } }, false, false],
    [{ zroProducts: ['nossom'], zroRelease: { nossom: 'closed' } }, false, false],
    [{ zroProducts: ['nossom'], zroRelease: { nossom: 'allowed' } }, true, true],
    [{ zroProducts: [], zroRelease: { nossom: 'allowed' } }, true, true],
    [{ zroRelease: { nossom: 'allowed' } }, true, true],
    [{ zroProducts: ['nossom'], zroRelease: { synquei: 'allowed' } }, false, true],
  ];
  for (const [claims, closed, open] of cases) {
    process.env.RELEASE = 'closed';
    assert.equal(temAcesso(claims), closed, 'fechado: ' + JSON.stringify(claims));
    process.env.RELEASE = 'released';
    assert.equal(temAcesso(claims), open, 'aberto: ' + JSON.stringify(claims));
  }
});

test('the zro_release claim is read with only the three known states', () => {
  assert.deepEqual(readZroRelease(undefined), {});
  assert.deepEqual(readZroRelease('allowed'), {});
  assert.deepEqual(readZroRelease(['nossom']), {});
  assert.deepEqual(
    readZroRelease({ nossom: 'allowed', synquei: 'released', aeon: 'open', x: 1, y: null }),
    { nossom: 'allowed', synquei: 'released' },
  );
  const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => ['p' + i, 'closed']));
  assert.equal(Object.keys(readZroRelease(many)).length, 50);
  assert.deepEqual(readZroRelease({ ['x'.repeat(65)]: 'allowed' }), {});
});

test('closed: password login is refused for accounts without the owner list, and no cookie is issued', async () => {
  const request = () =>
    new Request(SITE + '/api/account', {
      method: 'POST',
      headers: { origin: SITE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email: testUser.email, password: 'valid' }),
    });
  // Conta própria, sem vínculo.
  await assert.rejects(authenticate(testUser.email, 'valid'), AccessClosedError);
  let response = await login(request());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'product_closed');
  assert.equal(response.headers.get('set-cookie'), null);
  // Vínculo, mas fora da lista (closed) ou só "released" no HUB.
  linked({ nossom: 'closed' }, []);
  assert.equal((await login(request())).status, 403);
  linked({ nossom: 'released' });
  assert.equal((await login(request())).status, 403);
  // A conta da lista entra, com a claim na sessão.
  linked({ nossom: 'allowed' });
  response = await login(request());
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')!;
  assert.match(cookie, /^nossom-account=.*HttpOnly/);
  const session = decodeSession(decodeURIComponent(cookie.split(';')[0].slice(15)));
  assert.deepEqual(session?.zroRelease, { nossom: 'allowed' });
  assert.equal((await response.json()).account.zroBlocked, undefined);
  // Aberto ao público, a conta própria volta a entrar como sempre.
  released();
  link = null;
  assert.equal((await login(request())).status, 200);
});

const nextRequest = (path: string, cookie?: string) =>
  new NextRequest(SITE + path, { headers: cookie ? { cookie } : {} });
const rewriteOf = (response: Response) => response.headers.get('x-middleware-rewrite');
const passes = (response: Response) => response.headers.get('x-middleware-next') === '1';

test('closed proxy: anonymous visitors get 403 on product APIs, the login page for the studio, and account routes untouched', async () => {
  for (const path of [
    '/api/plans',
    '/api/usage',
    '/api/audio/jobs',
    '/api/admin',
    '/api/zro/ia/estado',
    '/api/ai/assistant',
    '/api/subscription',
  ]) {
    const response = await proxy(nextRequest(path));
    assert.equal(response.status, 403, path);
    assert.equal((await response.json()).code, 'product_closed');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  for (const path of ['/api/account', '/api/account/avatar', '/api/zro/entrar', '/api/zro/conta'])
    assert.equal(passes(await proxy(nextRequest(path))), true, path);
  // Fechado (titular, 01/11/2026): o estúdio e as páginas do site vão para a Absolute ZRO, sem nada do NOSSOM.
  for (const path of [
    '/studio/z?project=1',
    '/',
    '/apps',
    '/entrar',
    '/baixar',
    '/em-desenvolvimento',
    '/opengraph-image',
  ]) {
    const response = await proxy(nextRequest(path));
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get('location'), 'https://absolutezro.com/', path);
  }
});

test('closed proxy: a signed-in account without "allowed" sees the dev page (200, same address) and 403 on APIs', async () => {
  const cookie = testCookie();
  for (const path of ['/studio', '/studio/z', '/studio/planos']) {
    const response = await proxy(nextRequest(path, cookie));
    assert.equal(response.status, 200, path);
    assert.match(rewriteOf(response) ?? '', /\/em-desenvolvimento$/, path);
  }
  // as páginas do site vão para a Absolute ZRO
  for (const path of ['/', '/apps', '/entrar']) {
    const response = await proxy(nextRequest(path, cookie));
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get('location'), 'https://absolutezro.com/', path);
  }
  for (const path of ['/api/usage', '/api/plans', '/api/zro/ia/estado', '/api/audio/jobs'])
    assert.equal((await proxy(nextRequest(path, cookie))).status, 403, path);
  // Sair e "quem sou" continuam: o menu explica e a pessoa pode sair.
  assert.equal(passes(await proxy(nextRequest('/api/account', cookie))), true);
  // Sessão antiga, só com zro_products (de antes da claim): o retrato não abre nada.
  const old = testCookie(testUser, undefined, { zroProducts: ['nossom'] });
  assert.match(rewriteOf(await proxy(nextRequest('/studio', old))) ?? '', /em-desenvolvimento/);
  // Vínculo fechado ou só "released" no HUB: idem.
  linked({ nossom: 'closed' }, []);
  assert.match(rewriteOf(await proxy(nextRequest('/studio', cookie))) ?? '', /em-desenvolvimento/);
  linked({ nossom: 'released' });
  assert.match(rewriteOf(await proxy(nextRequest('/studio', cookie))) ?? '', /em-desenvolvimento/);
  // O /api/account conta a verdade à tela: entrou, mas sem direito de uso.
  const who = await accountGet(new Request(SITE + '/api/account', { headers: { cookie } }));
  assert.equal(who.status, 200);
  assert.equal((await who.json()).account.zroBlocked, true);
});

test('closed proxy: the allowed account passes everywhere; the link is re-read on every pass', async () => {
  linked({ nossom: 'allowed' });
  // A primeira passagem completa a sessão com a identidade do vínculo (e-mail, organização) e gira o cookie;
  // depois disso, enquanto nada muda no vínculo, o cookie fica.
  const first = await proxy(nextRequest('/studio', testCookie(testUser, undefined, allowedClaims)));
  assert.equal(passes(first), true);
  const cookie = first.headers.get('set-cookie')!.split(';')[0];
  assert.match(cookie, /^nossom-account=/);
  for (const path of [
    '/studio',
    '/studio/z',
    '/api/usage',
    '/api/plans',
    '/api/zro/ia/estado',
    '/',
    '/apps',
  ]) {
    const response = await proxy(nextRequest(path, cookie));
    assert.equal(passes(response), true, path);
    assert.equal(rewriteOf(response), null, path);
    assert.equal(response.headers.get('set-cookie'), null, 'nada mudou: o cookie fica');
  }
  // Uma sessão de antes da claim abre e ganha o cookie com a claim relida.
  const old = testCookie(testUser, undefined, { zroProducts: ['nossom'] });
  const upgraded = await proxy(nextRequest('/studio', old));
  assert.equal(passes(upgraded), true);
  assert.match(upgraded.headers.get('set-cookie') ?? '', /^nossom-account=/);
  // Tirada da lista: fecha na mesma hora, antes de qualquer renovação.
  linked({ nossom: 'closed' });
  assert.match(rewriteOf(await proxy(nextRequest('/studio', cookie))) ?? '', /em-desenvolvimento/);
  assert.equal((await proxy(nextRequest('/api/usage', cookie))).status, 403);
});

test('released proxy: accounts without a link pass as before and "closed" in the HUB still blocks', async () => {
  released();
  const cookie = testCookie();
  assert.equal(passes(await proxy(nextRequest('/studio', cookie))), true);
  // aberto, as páginas do site são públicas como antes
  for (const path of ['/', '/apps', '/entrar'])
    assert.equal(passes(await proxy(nextRequest(path))), true, path);
  assert.equal(
    passes(await proxy(nextRequest('/api/plans'))),
    true,
    'o catálogo volta a ser público',
  );
  linked({ nossom: 'closed' });
  // Aberto, o bloqueio por direito de uso é o de sempre: a rota responde (401) e o layout avisa.
  const blocked = await proxy(nextRequest('/studio', cookie));
  assert.equal(passes(blocked), true);
  assert.equal(rewriteOf(blocked), null);
});

test('closed: plans and Stripe are not for sale, and the downloads answer 404', async () => {
  const headers = { origin: SITE, 'Content-Type': 'application/json' };
  const checkout = await subscriptionPost(
    new Request(SITE + '/api/subscription', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'checkout', plan: 'studio' }),
    }),
  );
  assert.equal(checkout.status, 403);
  assert.equal((await checkout.json()).code, 'product_closed');
  const status = await subscriptionGet(new Request(SITE + '/api/subscription'));
  assert.deepEqual(await status.json(), { enabled: false, closed: true, subscription: null });
  // O catálogo em si só é alcançado por conta autorizada (o proxy barra o resto).
  assert.equal((await plans()).status, 200);
  const params = (arquivo: string) => ({ params: Promise.resolve({ arquivo }) });
  assert.equal(baixar().status, 404);
  for (const arquivo of ['mac-arm64', 'windows', 'diag'])
    assert.equal(
      (await baixarArquivo(new Request(SITE + '/baixar/' + arquivo), params(arquivo))).status,
      404,
      arquivo,
    );
  for (const arquivo of ['latest.yml', 'latest-mac.yml'])
    assert.equal(
      (await atualizacao(new Request(SITE + '/baixar/atualizacoes/' + arquivo), params(arquivo)))
        .status,
      404,
      arquivo,
    );
});
