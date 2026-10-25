/**
 * "Continuar com Absolute ZRO" contra a ZRO e o Supabase falsos: o HUB abre /api/zro/entrar direto,
 * cria conta nova só com e-mail confirmado, entra de novo na mesma conta pelo vínculo, não toma
 * conta pelo e-mail, liga e desliga em Minha conta, e recusa state, nonce, iss e aud errados.
 */
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GET as start } from '../app/api/zro/entrar/route';
import { GET as callback } from '../app/api/zro/callback/route';
import { GET as linkStatus, DELETE as unlink } from '../app/api/zro/conta/route';
import { GET as accountStatus } from '../app/api/account/route';
import {
  accountFromToken,
  currentAccount,
  decodeSession,
  encodeSession,
  refreshAccount,
  sessionCookie,
  sessionFromProvider,
} from '../lib/server/account';
import { zroConfigured, zroReturnPath } from '../lib/server/zro/config';
import { forgetZroCache } from '../lib/server/zro/oidc';
import { authEnvironment } from './helpers/auth';
import {
  CLIENT,
  ISSUER,
  SERVICE_KEY,
  startFakes,
  type Tamper,
  type ZroPerson,
} from './helpers/zro-fake';

const SITE = 'https://nossom.test';
const LIA: ZroPerson = {
  sub: 'zro-111',
  email: 'lia@produtora.com',
  name: 'Lia Produtora',
  org: 'Produtora Lia',
  products: ['nossom'],
};
const keys = ['SUPABASE_SERVICE_ROLE_KEY', 'ZRO_ISSUER', 'ZRO_CLIENT_ID', 'ZRO_CLIENT_SECRET'];
let restoreAuth: () => void;
let fakes: ReturnType<typeof startFakes>;
const oldFetch = globalThis.fetch;
const oldEnv = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
let ip = 0;

before(() => {
  restoreAuth = authEnvironment();
  Object.assign(process.env, {
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    ZRO_ISSUER: ISSUER,
    ZRO_CLIENT_ID: CLIENT.clientId,
    ZRO_CLIENT_SECRET: CLIENT.clientSecret,
  });
});
beforeEach(() => {
  fakes = startFakes();
  globalThis.fetch = fakes.fetch;
  forgetZroCache();
});
after(() => {
  globalThis.fetch = oldFetch;
  restoreAuth();
  for (const k of keys)
    if (oldEnv[k] === undefined) delete process.env[k];
    else process.env[k] = oldEnv[k];
});

const cookieOf = (response: Response, name: string) =>
  response.headers
    .getSetCookie()
    .find((c) => c.startsWith(name + '='))
    ?.split(';')[0]
    .slice(name.length + 1);

function sessionFor(user: { id: string; email: string; email_confirmed_at: string | null }) {
  return sessionCookie(
    encodeSession(
      sessionFromProvider({
        user,
        access_token: 'access-' + user.id,
        refresh_token: 'refresh',
        expires_in: 3600,
      }),
    ),
  ).split(';')[0];
}

/** Navegador: /api/zro/entrar → Absolute ZRO falsa → /api/zro/callback. */
async function flow(
  o: {
    person?: ZroPerson | null;
    query?: string;
    session?: string;
    tamper?: Tamper;
    deny?: boolean;
    swapState?: boolean;
  } = {},
) {
  fakes.state.person = o.person === undefined ? LIA : o.person;
  fakes.state.tamper = o.tamper ?? null;
  fakes.state.deny = !!o.deny;
  const forwarded = '10.0.0.' + ++ip;
  const go = await start(
    new Request(SITE + '/api/zro/entrar' + (o.query ?? ''), {
      headers: { 'x-forwarded-for': forwarded, ...(o.session ? { cookie: o.session } : {}) },
    }),
  );
  const location = go.headers.get('location') || '';
  if (go.status !== 302) return { go, location: location.replace(SITE, '') };
  const authorize = new URL(location);
  assert.equal(authorize.origin, ISSUER);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorize.searchParams.get('redirect_uri'), SITE + '/api/zro/callback');
  assert.equal(authorize.searchParams.get('scope'), 'openid email profile org');
  assert.ok(authorize.searchParams.get('nonce'));
  const header = go.headers.getSetCookie()[0];
  assert.match(header, /^nossom-zro=v1\./);
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Path=\/api\/zro/);
  assert.match(header, /Max-Age=600/);
  const state = cookieOf(go, 'nossom-zro')!;
  const back = fakes.authorize(location);
  if (o.swapState) back.searchParams.set('state', 'outro');
  const cookies = ['nossom-zro=' + state, ...(o.session ? [o.session] : [])].join('; ');
  const res = await callback(new Request(back.toString(), { headers: { cookie: cookies } }));
  assert.equal(res.status, 303);
  assert.equal(cookieOf(res, 'nossom-zro'), '', 'o cookie da ida é apagado na volta');
  const destination = new URL(res.headers.get('location')!);
  assert.equal(destination.origin, SITE);
  const session = cookieOf(res, 'nossom-account');
  return {
    go,
    res,
    location: destination.pathname + destination.search,
    session: session ? decodeSession(decodeURIComponent(session)) : null,
  };
}

test('without ZRO credentials the button stays hidden and the route explains it', async () => {
  const id = process.env.ZRO_CLIENT_ID;
  delete process.env.ZRO_CLIENT_ID;
  try {
    assert.equal(zroConfigured(), false);
    const r = await flow();
    assert.equal(r.go.status, 303);
    assert.equal(r.location, '/entrar?erro=zro_config');
  } finally {
    process.env.ZRO_CLIENT_ID = id;
  }
  assert.equal(zroConfigured(), true);
});

test('first visit straight from the HUB creates a confirmed account linked to the ZRO person', async () => {
  const r = await flow();
  assert.equal(r.location, '/studio');
  assert.equal(r.session?.account.email, 'lia@produtora.com');
  assert.equal(r.session?.account.name, 'Lia Produtora');
  assert.equal(r.session?.account.isAdmin, false);
  assert.equal(fakes.state.created, 1);
  const link = fakes.links.get(r.session!.account.id);
  assert.equal(link?.zro_sub, 'zro-111');
  assert.equal(link?.created_by_zro, true);
  assert.equal(link?.organization, 'Produtora Lia');
  assert.deepEqual(link?.products, ['nossom']);
  // Só ZRO: não deixa desligar o único jeito de entrar.
  const cookie = sessionFor(fakes.users.get(r.session!.account.id)!);
  const status = await (
    await linkStatus(new Request(SITE + '/api/zro/conta', { headers: { cookie } }))
  ).json();
  assert.equal(status.link.onlyLogin, true);
  const refused = await unlink(
    new Request(SITE + '/api/zro/conta', {
      method: 'DELETE',
      headers: { cookie, origin: SITE },
    }),
  );
  assert.equal(refused.status, 409);
  assert.match((await refused.json()).error, /único jeito de entrar/);
  assert.ok(fakes.links.has(r.session!.account.id));
});

test('an existing link signs in to the same account with a fresh session and a safe return', async () => {
  const first = await flow();
  const again = await flow({ query: '?volta=' + encodeURIComponent('/studio/projetos?project=a') });
  assert.equal(again.location, '/studio/projetos?project=a');
  assert.equal(again.session?.account.id, first.session?.account.id);
  assert.notEqual(again.session?.refresh, first.session?.refresh);
  assert.equal(fakes.state.created, 1);
  // Volta externo vira o estúdio.
  const outside = await flow({ query: '?volta=' + encodeURIComponent('//evil.example/x') });
  assert.equal(outside.location, '/studio');
  assert.equal(zroReturnPath('/\\evil.example'), '/studio');
  assert.equal(zroReturnPath('/api/account'), '/studio');
  assert.equal(zroReturnPath('https://evil.example'), '/studio');
});

test('a wrong state is refused before any code exchange', async () => {
  const r = await flow({ swapState: true });
  assert.equal(r.location, '/entrar?erro=zro_expirou');
  assert.equal(r.session, null);
  assert.equal(fakes.state.exchanges, 0);
  // Sem o cookie da ida também não entra.
  const lost = await callback(new Request(SITE + '/api/zro/callback?code=x&state=y&iss=' + ISSUER));
  assert.equal(new URL(lost.headers.get('location')!).search, '?erro=zro_expirou');
  assert.equal(cookieOf(lost, 'nossom-account'), undefined);
});

for (const [tamper, label] of [
  ['nonce', 'nonce'],
  ['iss', 'issuer in the id_token'],
  ['aud', 'audience'],
  ['signature', 'signature'],
  ['redirect-iss', 'issuer in the redirect'],
] as const)
  test(`a wrong ${label} never creates an account or a session`, async () => {
    const r = await flow({ tamper });
    assert.equal(r.location, '/entrar?erro=zro_erro');
    assert.equal(r.session, null);
    assert.equal(fakes.state.created, 0);
    assert.equal(fakes.links.size, 0);
  });

test('cancelling at the ZRO keeps everything as it was', async () => {
  const r = await flow({ deny: true, query: '?volta=/studio/ia' });
  assert.equal(r.location, '/entrar?erro=zro_recusado&next=%2Fstudio%2Fia');
  assert.equal(r.session, null);
});

test('an unverified ZRO e-mail cannot create a NOSSOM account', async () => {
  const r = await flow({ person: { ...LIA, verified: false } });
  assert.equal(r.location, '/entrar?erro=zro_email_nao_verificado');
  assert.equal(r.session, null);
  assert.equal(fakes.users.size, 0);
});

test('an e-mail already used by a NOSSOM account is never merged on its own', async () => {
  const owner = fakes.addUser('lia@produtora.com', 'Lia');
  const r = await flow();
  assert.equal(r.location, '/entrar?erro=zro_email_em_uso');
  assert.equal(r.session, null);
  assert.equal(fakes.links.size, 0);
  assert.equal(fakes.users.size, 1);
  assert.equal(fakes.users.get(owner.id)?.user_metadata.name, 'Lia');
});

test('the signed-in owner links the ZRO in settings, then signs in through it and may unlink', async () => {
  const owner = fakes.addUser('lia@produtora.com', 'Lia');
  const cookie = sessionFor(owner);
  // Ligar exige estar logado.
  const anonymous = await flow({ query: '?modo=ligar' });
  assert.equal(anonymous.go.status, 303);
  assert.equal(anonymous.location, '/entrar?next=%2Fstudio%2Fconta');
  const linked = await flow({ query: '?modo=ligar', session: cookie });
  assert.equal(linked.location, '/studio/conta?zro=ok');
  // Ligar não troca a sessão: só guarda nela os produtos liberados na Absolute ZRO.
  const before = decodeSession(decodeURIComponent(cookie.split('=')[1]))!;
  assert.equal(linked.session?.sid, before.sid);
  assert.equal(linked.session?.refresh, before.refresh);
  assert.deepEqual(linked.session?.zroProducts, ['nossom']);
  assert.equal(fakes.links.get(owner.id)?.created_by_zro, false);
  const login = await flow();
  assert.equal(login.session?.account.id, owner.id);
  assert.equal(fakes.state.created, 0);
  // Outra conta NOSSOM não pega a mesma pessoa ZRO.
  const other = fakes.addUser('outra@example.test');
  const taken = await flow({ query: '?modo=ligar', session: sessionFor(other) });
  assert.equal(taken.location, '/studio/conta?erro=zro_outra_conta');
  // Desligar: pede mesma origem; conta com senha pode.
  const request = (origin: string) =>
    new Request(SITE + '/api/zro/conta', { method: 'DELETE', headers: { cookie, origin } });
  assert.equal((await unlink(request('https://evil.example'))).status, 403);
  assert.equal((await unlink(request(SITE))).status, 200);
  assert.equal(fakes.links.has(owner.id), false);
  const status = await (
    await linkStatus(new Request(SITE + '/api/zro/conta', { headers: { cookie } }))
  ).json();
  assert.deepEqual(status, { configured: true, link: null });
});

const cookieFor = (session: NonNullable<ReturnType<typeof decodeSession>>) =>
  sessionCookie(encodeSession(session)).split(';')[0];

test('"Criar conta" asks the HUB for its sign-up screen (prompt=create); signing in does not', async () => {
  const create = await start(
    new Request(SITE + '/api/zro/entrar?modo=criar&volta=%2Fstudio%2Fia', {
      headers: { 'x-forwarded-for': '10.1.0.1' },
    }),
  );
  assert.equal(create.status, 302);
  const authorize = new URL(create.headers.get('location')!);
  assert.equal(authorize.searchParams.get('prompt'), 'create');
  const login = await start(
    new Request(SITE + '/api/zro/entrar', { headers: { 'x-forwarded-for': '10.1.0.2' } }),
  );
  assert.equal(new URL(login.headers.get('location')!).searchParams.get('prompt'), null);
  // A volta de "criar" é a de sempre: a conta nasce ligada e entra já logada.
  const r = await flow({ query: '?modo=criar&volta=%2Fstudio%2Fia' });
  assert.equal(r.location, '/studio/ia');
  assert.equal(r.session?.account.email, 'lia@produtora.com');
  assert.equal(fakes.state.created, 1);
});

test('without "nossom" in zro_products the person signs in but every account function is closed', async () => {
  const r = await flow({ person: { ...LIA, products: ['synquei'] } });
  assert.equal(r.location, '/studio');
  assert.deepEqual(r.session?.zroProducts, ['synquei']);
  assert.deepEqual(fakes.links.get(r.session!.account.id)?.products, ['synquei']);
  const cookie = cookieFor(r.session!);
  const token = decodeURIComponent(cookie.split('=')[1]);
  // A tela sabe quem entrou e mostra o aviso; as funções recusam no servidor.
  assert.equal(accountFromToken(token)?.zroBlocked, true);
  const status = await accountStatus(new Request(SITE + '/api/account', { headers: { cookie } }));
  assert.equal(status.status, 200);
  assert.equal((await status.json()).account.zroBlocked, true);
  assert.equal(await currentAccount(new Request(SITE + '/x', { headers: { cookie } })), null);
  assert.equal(
    (await linkStatus(new Request(SITE + '/api/zro/conta', { headers: { cookie } }))).status,
    401,
  );
});

test('with "nossom" released the account opens, and a refresh re-reads the products in the link', async () => {
  const r = await flow();
  assert.deepEqual(r.session?.zroProducts, ['nossom']);
  const cookie = cookieFor(r.session!);
  const opened = await currentAccount(new Request(SITE + '/x', { headers: { cookie } }));
  assert.equal(opened?.id, r.session!.account.id);
  assert.equal(opened?.zroBlocked, undefined);
  // O admin tira o NOSSOM da organização; o vínculo guarda a lista nova no próximo login ZRO.
  fakes.links.get(r.session!.account.id)!.products = [];
  const expired = encodeSession({ ...r.session!, expires: Date.now() - 1000 });
  const refreshed = await refreshAccount(expired);
  assert.ok(refreshed && refreshed !== 'unavailable');
  assert.equal(refreshed.account.zroBlocked, true);
  assert.deepEqual(decodeSession(refreshed.token)?.zroProducts, []);
  // Liberado de novo: a próxima renovação abre.
  fakes.links.get(r.session!.account.id)!.products = ['nossom'];
  const again = await refreshAccount(
    encodeSession({ ...decodeSession(refreshed.token)!, expires: Date.now() - 1000 }),
  );
  assert.ok(again && again !== 'unavailable');
  assert.equal(again.account.zroBlocked, undefined);
});

test('an older account without a ZRO link is never blocked', async () => {
  const owner = fakes.addUser('antiga@example.test', 'Antiga');
  const cookie = sessionFor(owner);
  const token = decodeURIComponent(cookie.split('=')[1]);
  assert.equal(decodeSession(token)?.zroProducts, undefined);
  assert.equal(accountFromToken(token)?.zroBlocked, undefined);
  assert.equal(
    (await currentAccount(new Request(SITE + '/x', { headers: { cookie } })))?.id,
    owner.id,
  );
  // A renovação confere o vínculo e, sem ele, segue igual.
  const refreshed = await refreshAccount(
    encodeSession({ ...decodeSession(token)!, refresh: 'refresh-' + owner.id, expires: 0 }),
  );
  assert.ok(refreshed && refreshed !== 'unavailable');
  assert.equal(refreshed.account.zroBlocked, undefined);
  assert.equal(decodeSession(refreshed.token)?.zroProducts, undefined);
});
