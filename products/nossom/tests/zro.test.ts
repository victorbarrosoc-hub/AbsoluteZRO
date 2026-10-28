/**
 * "Continuar com Absolute ZRO" contra a ZRO e o Supabase falsos: o HUB abre /api/zro/entrar direto,
 * cria conta nova só com e-mail confirmado, entra de novo na mesma conta pelo vínculo, não toma
 * conta pelo e-mail, liga e desliga em Minha conta, e recusa state, nonce, iss e aud errados.
 *
 * Desde 28/10/2026 o NOSSOM está fechado ao público (`RELEASE=closed`, o padrão de produção, é o que roda
 * aqui): só a conta `allowed` na claim `zro_release` do HUB entra. Os casos de produto aberto rodam com
 * `released()` dentro do próprio teste.
 */
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GET as start } from '../app/api/zro/entrar/route';
import { GET as callback } from '../app/api/zro/callback/route';
import { GET as linkStatus, DELETE as unlink } from '../app/api/zro/conta/route';
import { GET as accountStatus, DELETE as signOut } from '../app/api/account/route';
import {
  GET as iaGet,
  POST as iaPost,
  DELETE as iaDelete,
} from '../app/api/zro/ia/[...caminho]/route';
import { iaTarget, openIaTokens, sealIaTokens } from '../lib/server/zro/ia';
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
/** A conta autorizada pelo proprietário: `allowed` no HUB (a única que entra com o NOSSOM fechado). */
const LIA: ZroPerson = {
  sub: 'zro-111',
  email: 'lia@produtora.com',
  name: 'Lia Produtora',
  org: 'Produtora Lia',
  products: ['nossom'],
  release: { nossom: 'allowed' },
};
const keys = ['SUPABASE_SERVICE_ROLE_KEY', 'ZRO_ISSUER', 'ZRO_CLIENT_ID', 'ZRO_CLIENT_SECRET'];
let restoreAuth: () => void;
let fakes: ReturnType<typeof startFakes>;
const oldFetch = globalThis.fetch;
const oldEnv = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
let ip = 0;
/** O produto aberto ao público (só dentro do teste que chamar). */
const released = () => {
  process.env.RELEASE = 'released';
};

before(() => {
  restoreAuth = authEnvironment('closed');
  Object.assign(process.env, {
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    ZRO_ISSUER: ISSUER,
    ZRO_CLIENT_ID: CLIENT.clientId,
    ZRO_CLIENT_SECRET: CLIENT.clientSecret,
  });
});
beforeEach(() => {
  process.env.RELEASE = 'closed';
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
  assert.equal(
    authorize.searchParams.get('scope'),
    'openid email profile org offline_access zro.ia',
  );
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
    ia: cookieOf(res, 'nossom-zro-ia'),
    iaHeader: res.headers.getSetCookie().find((c) => c.startsWith('nossom-zro-ia=')),
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
  assert.deepEqual(r.session?.zroRelease, { nossom: 'allowed' });
  assert.equal(fakes.state.created, 1);
  const link = fakes.links.get(r.session!.account.id);
  assert.equal(link?.zro_sub, 'zro-111');
  assert.equal(link?.created_by_zro, true);
  assert.equal(link?.organization, 'Produtora Lia');
  assert.deepEqual(link?.products, ['nossom']);
  assert.deepEqual(link?.release, { nossom: 'allowed' }, 'a claim fica guardada no vínculo');
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
  released();
  const owner = fakes.addUser('lia@produtora.com', 'Lia');
  // Pessoa fora da lista do proprietário (produto liberado na organização, mas não `allowed`).
  const r = await flow({ person: { ...LIA, release: { nossom: 'released' } } });
  assert.equal(r.location, '/entrar?erro=zro_email_em_uso');
  assert.equal(r.session, null);
  assert.equal(fakes.links.size, 0);
  assert.equal(fakes.users.size, 1);
  assert.equal(fakes.users.get(owner.id)?.user_metadata.name, 'Lia');
});

test('the account the owner listed (allowed) adopts its older NOSSOM account by verified e-mail', async () => {
  // Com o login por senha fechado, é assim que o proprietário entra na própria conta antiga.
  const owner = fakes.addUser('lia@produtora.com', 'Lia');
  const r = await flow();
  assert.equal(r.location, '/studio');
  assert.equal(r.session?.account.id, owner.id, 'entra na conta antiga, não numa nova');
  assert.equal(fakes.state.created, 0);
  assert.equal(fakes.links.get(owner.id)?.zro_sub, 'zro-111');
  assert.equal(fakes.links.get(owner.id)?.created_by_zro, false);
  assert.deepEqual(fakes.links.get(owner.id)?.release, { nossom: 'allowed' });
  // E-mail não confirmado no HUB: nada de adoção.
  fakes.links.clear();
  const unverified = await flow({ person: { ...LIA, verified: false } });
  assert.equal(unverified.location, '/entrar?erro=zro_email_nao_verificado');
  assert.equal(fakes.links.size, 0);
  // Conta antiga já ligada a outra pessoa ZRO: continua "e-mail em uso".
  fakes.links.set(owner.id, {
    user_id: owner.id,
    zro_sub: 'zro-outra',
    email: owner.email,
    organization: null,
    products: ['nossom'],
    release: { nossom: 'allowed' },
    created_by_zro: false,
  });
  const taken = await flow();
  assert.equal(taken.location, '/entrar?erro=zro_email_em_uso');
  assert.equal(fakes.links.get(owner.id)?.zro_sub, 'zro-outra');
});

test('the signed-in owner links the ZRO in settings, then signs in through it and may unlink', async () => {
  // Ligar em Minha conta exige uma sessão com direito de uso: só com o produto aberto uma conta sem
  // vínculo chega lá (fechado, ela nem entra).
  released();
  const owner = fakes.addUser('lia@produtora.com', 'Lia');
  const cookie = sessionFor(owner);
  // Ligar exige estar logado.
  const anonymous = await flow({ query: '?modo=ligar' });
  assert.equal(anonymous.go.status, 303);
  assert.equal(anonymous.location, '/entrar?next=%2Fstudio%2Fconta');
  const linked = await flow({ query: '?modo=ligar', session: cookie });
  assert.equal(linked.location, '/studio/conta?zro=ok');
  // Ligar não troca a sessão: só guarda nela os produtos e o estado do lançamento na Absolute ZRO.
  const before = decodeSession(decodeURIComponent(cookie.split('=')[1]))!;
  assert.equal(linked.session?.sid, before.sid);
  assert.equal(linked.session?.refresh, before.refresh);
  assert.deepEqual(linked.session?.zroProducts, ['nossom']);
  assert.deepEqual(linked.session?.zroRelease, { nossom: 'allowed' });
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
  const unlinked = await unlink(
    new Request(SITE + '/api/zro/conta', {
      method: 'DELETE',
      headers: { cookie: cookieFor(linked.session!), origin: SITE },
    }),
  );
  assert.equal(unlinked.status, 200);
  assert.equal(fakes.links.has(owner.id), false);
  // Desligou: a sessão volta a ser só do NOSSOM, sem a identidade da Absolute ZRO.
  const after = decodeSession(decodeURIComponent(cookieOf(unlinked, 'nossom-account')!))!;
  assert.equal(after.zroProducts, undefined);
  assert.equal(after.zroRelease, undefined);
  assert.equal(after.zro, undefined);
  const status = await (
    await linkStatus(new Request(SITE + '/api/zro/conta', { headers: { cookie } }))
  ).json();
  assert.deepEqual(status, { configured: true, link: null });
});

const cookieFor = (session: NonNullable<ReturnType<typeof decodeSession>>) =>
  sessionCookie(encodeSession(session)).split(';')[0];

test('the menu shows the Absolute ZRO identity: photo, organization and where to edit (perfil único)', async () => {
  const photo = ISSUER + '/api/v1/foto/6f1c2a90-1b7e-4a55-9a0c-3f2d1e0b9c11';
  const r = await flow({ person: { ...LIA, picture: photo, conta: ISSUER + '/perfil' } });
  assert.deepEqual(r.session?.zro, {
    email: 'lia@produtora.com',
    organization: 'Produtora Lia',
    picture: photo,
    manage: ISSUER + '/perfil',
  });
  const shown = accountFromToken(encodeSession(r.session!));
  assert.deepEqual(shown?.zro, {
    email: 'lia@produtora.com',
    organization: 'Produtora Lia',
    picture: photo,
    manage: ISSUER + '/perfil',
  });
  assert.equal(shown?.zroInvite, undefined);
  // A renovação mantém a foto e relê e-mail e organização no vínculo.
  fakes.links.get(r.session!.account.id)!.organization = 'Produtora Nova';
  const refreshed = await refreshAccount(
    encodeSession({ ...r.session!, expires: Date.now() - 1000 }),
  );
  assert.ok(refreshed && refreshed !== 'unavailable');
  assert.equal(refreshed.account.zro?.organization, 'Produtora Nova');
  assert.equal(refreshed.account.zro?.picture, photo);
  // Foto ou "onde editar" de outro endereço não entram: sem foto, a inicial; o Perfil do emissor.
  const unsafe = await flow({
    person: {
      ...LIA,
      picture: 'https://evil.example/api/v1/foto/6f1c2a90-1b7e-4a55-9a0c-3f2d1e0b9c11',
      conta: 'https://evil.example/perfil',
    },
  });
  assert.equal(unsafe.session?.zro?.picture, undefined);
  assert.equal(unsafe.session?.zro?.manage, ISSUER + '/perfil');
  const insecure = await flow({ person: { ...LIA, picture: photo.replace('https:', 'http:') } });
  assert.equal(insecure.session?.zro?.picture, undefined);
});

test('an account without the Absolute ZRO gets only the invite to link it', async () => {
  const owner = fakes.addUser('sem-zro@example.test', 'Sem ZRO');
  const token = decodeURIComponent(sessionFor(owner).split('=')[1]);
  const shown = accountFromToken(token);
  assert.equal(shown?.zro, undefined);
  assert.equal(shown?.zroInvite, true);
  // Sem o cliente da Absolute ZRO configurado, nem o convite aparece.
  const id = process.env.ZRO_CLIENT_ID;
  delete process.env.ZRO_CLIENT_ID;
  try {
    assert.equal(accountFromToken(token)?.zroInvite, undefined);
  } finally {
    process.env.ZRO_CLIENT_ID = id;
  }
});

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

// ——— Fechado ao público (Etapa B, 28/10/2026): quem entra, quem não entra ———

test('closed: an Absolute ZRO account outside the owner list gets no account, no session and the dev page', async () => {
  const r = await flow({
    person: { ...LIA, products: ['synquei'], release: { nossom: 'closed' } },
  });
  assert.equal(r.location, '/entrar?erro=zro_fechado');
  assert.equal(r.session, null);
  assert.equal(fakes.state.created, 0, 'nenhuma conta NOSSOM nasce para quem não pode usar');
  assert.equal(fakes.links.size, 0);
});

test('closed: "released" in the HUB alone does not open the NOSSOM; opening takes both sides', async () => {
  const person: ZroPerson = { ...LIA, release: { nossom: 'released' } };
  const r = await flow({ person });
  assert.equal(r.location, '/entrar?erro=zro_fechado');
  assert.equal(fakes.state.created, 0);
  released();
  const open = await flow({ person });
  assert.equal(open.location, '/studio');
  assert.equal(open.session?.account.zroBlocked, undefined);
  assert.equal(
    (
      await currentAccount(
        new Request(SITE + '/x', { headers: { cookie: cookieFor(open.session!) } }),
      )
    )?.id,
    open.session!.account.id,
  );
});

test('released: without "nossom" in zro_products the person signs in but every account function is closed', async () => {
  released();
  const r = await flow({
    person: { ...LIA, products: ['synquei'], release: { nossom: 'released' } },
  });
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

test('the allowed account opens; taking it off the list in the HUB closes it on the next request and refresh', async () => {
  const r = await flow();
  assert.deepEqual(r.session?.zroRelease, { nossom: 'allowed' });
  const cookie = cookieFor(r.session!);
  const opened = await currentAccount(new Request(SITE + '/x', { headers: { cookie } }));
  assert.equal(opened?.id, r.session!.account.id);
  assert.equal(opened?.zroBlocked, undefined);
  // O proprietário tira a conta da lista; o vínculo guarda a claim nova no próximo login ZRO. Aqui, o que o
  // banco diz vale já no próximo pedido à API (o cookie é só um retrato).
  fakes.links.get(r.session!.account.id)!.release = { nossom: 'closed' };
  assert.equal(await currentAccount(new Request(SITE + '/x', { headers: { cookie } })), null);
  const status = await accountStatus(new Request(SITE + '/api/account', { headers: { cookie } }));
  assert.equal((await status.json()).account.zroBlocked, true, 'o /api/account relê o vínculo');
  // A renovação também relê e guarda o estado novo na sessão.
  const expired = encodeSession({ ...r.session!, expires: Date.now() - 1000 });
  const refreshed = await refreshAccount(expired);
  assert.ok(refreshed && refreshed !== 'unavailable');
  assert.equal(refreshed.account.zroBlocked, true);
  assert.deepEqual(decodeSession(refreshed.token)?.zroRelease, { nossom: 'closed' });
  // De volta à lista: a próxima renovação abre.
  fakes.links.get(r.session!.account.id)!.release = { nossom: 'allowed' };
  const again = await refreshAccount(
    encodeSession({ ...decodeSession(refreshed.token)!, expires: Date.now() - 1000 }),
  );
  assert.ok(again && again !== 'unavailable');
  assert.equal(again.account.zroBlocked, undefined);
});

test('released: a refresh re-reads zro_products in the link', async () => {
  released();
  const r = await flow({ person: { ...LIA, release: { nossom: 'released' } } });
  assert.deepEqual(r.session?.zroProducts, ['nossom']);
  // O admin tira o NOSSOM da organização; a lista nova vale na renovação.
  fakes.links.get(r.session!.account.id)!.products = [];
  const expired = encodeSession({ ...r.session!, expires: Date.now() - 1000 });
  const refreshed = await refreshAccount(expired);
  assert.ok(refreshed && refreshed !== 'unavailable');
  assert.equal(refreshed.account.zroBlocked, true);
  assert.deepEqual(decodeSession(refreshed.token)?.zroProducts, []);
  fakes.links.get(r.session!.account.id)!.products = ['nossom'];
  const again = await refreshAccount(
    encodeSession({ ...decodeSession(refreshed.token)!, expires: Date.now() - 1000 }),
  );
  assert.ok(again && again !== 'unavailable');
  assert.equal(again.account.zroBlocked, undefined);
});

test('an older account without a ZRO link is blocked while closed and opens only when released', async () => {
  const owner = fakes.addUser('antiga@example.test', 'Antiga');
  const cookie = sessionFor(owner);
  const token = decodeURIComponent(cookie.split('=')[1]);
  assert.equal(decodeSession(token)?.zroProducts, undefined);
  assert.equal(accountFromToken(token)?.zroBlocked, true);
  assert.equal(await currentAccount(new Request(SITE + '/x', { headers: { cookie } })), null);
  // A renovação confere o vínculo e, sem ele, continua fechada.
  const stale = encodeSession({
    ...decodeSession(token)!,
    refresh: 'refresh-' + owner.id,
    expires: 0,
  });
  const refreshed = await refreshAccount(stale);
  assert.ok(refreshed && refreshed !== 'unavailable');
  assert.equal(refreshed.account.zroBlocked, true);
  assert.equal(decodeSession(refreshed.token)?.zroProducts, undefined);
  // Produto aberto: a conta antiga segue como sempre.
  released();
  assert.equal(accountFromToken(token)?.zroBlocked, undefined);
  assert.equal(
    (await currentAccount(new Request(SITE + '/x', { headers: { cookie } })))?.id,
    owner.id,
  );
  const open = await refreshAccount(stale);
  assert.ok(open && open !== 'unavailable');
  assert.equal(open.account.zroBlocked, undefined);
});

test('a session from before the claim (zro_products only) is blocked until the link is re-read', async () => {
  const r = await flow();
  const { zroRelease: _release, ...old } = r.session!;
  const token = encodeSession(old);
  // O retrato no cookie, sem a claim, não abre nada por si.
  assert.equal(accountFromToken(token)?.zroBlocked, true);
  // Mas o vínculo diz `allowed`: o próximo pedido à API e a próxima passagem pelo proxy releem e abrem.
  const cookie = 'nossom-account=' + token;
  assert.equal(
    (await currentAccount(new Request(SITE + '/x', { headers: { cookie } })))?.id,
    r.session!.account.id,
  );
  const refreshed = await refreshAccount(token);
  assert.ok(refreshed && refreshed !== 'unavailable');
  assert.equal(refreshed.account.zroBlocked, undefined);
  assert.notEqual(refreshed.token, token, 'o cookie gira com a claim relida');
  assert.deepEqual(decodeSession(refreshed.token)?.zroRelease, { nossom: 'allowed' });
});

// ——— A Z (IA da Absolute ZRO): repasse /api/zro/ia → <emissor>/api/v1/ia com o token da conta ———

type Flow = Awaited<ReturnType<typeof flow>>;
const iaCall = (
  r: Flow,
  path: string,
  o: { method?: string; ia?: string | null; origin?: string; body?: string; session?: string } = {},
) => {
  const method = o.method ?? 'GET';
  const parts = path.split('/').filter(Boolean);
  const cookie = [
    o.session ?? cookieFor(r.session!),
    ...(o.ia === null ? [] : ['nossom-zro-ia=' + (o.ia ?? r.ia)]),
  ].join('; ');
  const request = new Request(SITE + '/api/zro/ia/' + path, {
    method,
    headers: { cookie, ...(o.origin ? { origin: o.origin } : {}) },
    ...(o.body ? { body: o.body } : {}),
  });
  const handler = method === 'POST' ? iaPost : method === 'DELETE' ? iaDelete : iaGet;
  return handler(request, { params: Promise.resolve({ caminho: parts }) });
};
const leaks = (res: Response, text: string) =>
  /zat_|zrt_/.test(text) ||
  [...res.headers.entries()].some(([k, v]) => k !== 'set-cookie' && /zat_|zrt_/.test(v)) ||
  res.headers.getSetCookie().some((c) => /zat_|zrt_/.test(c));

test('signing in keeps the Z token only in an encrypted HttpOnly cookie scoped to the proxy', async () => {
  const r = await flow();
  assert.ok(r.ia);
  assert.match(r.iaHeader!, /HttpOnly/);
  assert.match(r.iaHeader!, /Secure/);
  assert.match(r.iaHeader!, /SameSite=Lax/);
  assert.match(r.iaHeader!, /Path=\/api\/zro\/ia;/);
  assert.doesNotMatch(r.iaHeader!, /zat_|zrt_/, 'o token não aparece em claro no cookie');
  const saved = openIaTokens(r.ia);
  assert.equal(saved?.user, r.session?.account.id);
  assert.match(saved!.access, /^zat_/);
  assert.match(saved!.scope, /\bzro\.ia\b/);
  // Ligar em Minha conta também guarda o token, para a conta de quem está logado (produto aberto: só
  // assim uma conta sem vínculo chega a Minha conta).
  released();
  const owner = fakes.addUser('dono@example.test', 'Dono');
  const linked = await flow({
    person: { ...LIA, sub: 'zro-222', email: 'dono@example.test' },
    query: '?modo=ligar&volta=%2Fstudio',
    session: sessionFor(owner),
  });
  assert.equal(linked.location, '/studio?zro=ok');
  assert.equal(openIaTokens(linked.ia)?.user, owner.id);
});

test('the proxy forwards the Bearer token, streams the answer and never leaks the token', async () => {
  const r = await flow();
  const estado = await iaCall(r, 'estado');
  assert.equal(estado.status, 200);
  const text = await estado.text();
  assert.deepEqual(JSON.parse(text), { ligada: true, nome: 'Lia', creditos: null });
  assert.equal(estado.headers.get('cache-control'), 'no-store');
  assert.equal(leaks(estado, text), false);
  const call = fakes.state.ia.at(-1)!;
  assert.equal(call.path, '/estado');
  assert.equal(call.auth, 'Bearer ' + openIaTokens(r.ia)!.access);

  const answer = await iaCall(r, 'mensagens', {
    method: 'POST',
    origin: SITE,
    body: JSON.stringify({ conversa: null, texto: 'Como limpo minha fala?' }),
  });
  assert.equal(answer.status, 200);
  assert.match(answer.headers.get('content-type')!, /ndjson/);
  const lines = (await answer.text())
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  assert.deepEqual(
    lines.map((l) => l.tipo),
    ['conversa', 'texto', 'fim'],
  );
  assert.equal(fakes.state.ia.at(-1)!.body, '{"conversa":null,"texto":"Como limpo minha fala?"}');

  assert.equal((await iaCall(r, 'conversas/c1', { method: 'DELETE', origin: SITE })).status, 200);
  assert.equal(fakes.state.ia.at(-1)!.path, '/conversas/c1');
});

test('the proxy refuses without a NOSSOM session, without the Z token or with another account token', async () => {
  const r = await flow();
  const before = fakes.state.ia.length;
  // Sem sessão NOSSOM.
  const anonymous = await iaGet(
    new Request(SITE + '/api/zro/ia/estado', { headers: { cookie: 'nossom-zro-ia=' + r.ia } }),
    { params: Promise.resolve({ caminho: ['estado'] }) },
  );
  assert.equal(anonymous.status, 401);
  // Sessão sem o token da Z (entrou com senha, ou antes desta versão).
  const noToken = await iaCall(r, 'estado', { ia: null });
  assert.equal(noToken.status, 401);
  assert.equal((await noToken.json()).error, 'zro_ia_login');
  // Token guardado para outra conta (troca de conta no mesmo navegador): nunca é usado e é apagado.
  const other = await flow({ person: { ...LIA, sub: 'zro-333', email: 'outra@example.test' } });
  const foreign = await iaCall(r, 'estado', { session: cookieFor(other.session!) });
  assert.equal(foreign.status, 401);
  assert.equal(cookieOf(foreign, 'nossom-zro-ia'), '');
  // Conta sem direito de uso (fechado, fora da lista): 401 sem chegar à Absolute ZRO.
  const stranger = fakes.addUser('estranha@example.test');
  assert.equal((await iaCall(r, 'estado', { session: sessionFor(stranger) })).status, 401);
  // Cookie adulterado.
  assert.equal((await iaCall(r, 'estado', { ia: r.ia!.slice(0, -4) + 'AAAA' })).status, 401);
  // Mudança de outra origem, caminho fora da API e método errado.
  assert.equal(
    (await iaCall(r, 'mensagens', { method: 'POST', origin: 'https://evil.example', body: '{}' }))
      .status,
    403,
  );
  assert.equal((await iaCall(r, 'admin')).status, 404);
  assert.equal((await iaCall(r, 'estado', { method: 'DELETE', origin: SITE })).status, 404);
  assert.equal(iaTarget(['conversas', '../admin'], 'GET'), null);
  assert.equal(fakes.state.ia.length, before, 'nada disso chegou à Absolute ZRO');
});

test('an expiring token is renewed once with the rotating refresh token; a refused one asks to connect again', async () => {
  fakes.state.accessLife = 30; // menos que a margem de 60 s: todo pedido renova
  const r = await flow();
  const first = await iaCall(r, 'estado');
  assert.equal(first.status, 200);
  assert.equal(fakes.state.refreshes, 1);
  const rotated = cookieOf(first, 'nossom-zro-ia')!;
  assert.ok(rotated && rotated !== r.ia);
  assert.equal(fakes.state.ia.at(-1)!.auth, 'Bearer ' + openIaTokens(rotated)!.access);
  assert.notEqual(openIaTokens(rotated)!.refresh, openIaTokens(r.ia)!.refresh);
  // Um pedido simultâneo com o cookie antigo reaproveita a mesma renovação: o refresh não é reusado
  // (reuso derrubaria a sessão inteira na Absolute ZRO).
  const parallel = await iaCall(r, 'estado');
  assert.equal(parallel.status, 200);
  assert.equal(fakes.state.refreshes, 1);
  // Refresh recusado (revogado na Absolute ZRO): o cookie sai e o painel pede para conectar.
  const expiring = await flow();
  fakes.revokeAll();
  const reused = await iaCall(expiring, 'estado');
  assert.equal(reused.status, 401);
  assert.equal(cookieOf(reused, 'nossom-zro-ia'), '');
  // Acesso removido na Absolute ZRO: o token é recusado lá e aqui vira "conectar de novo".
  fakes.state.accessLife = 600;
  const again = await flow();
  fakes.revokeAll();
  const refused = await iaCall(again, 'estado');
  assert.equal(refused.status, 401);
  assert.equal((await refused.json()).error, 'zro_ia_login');
  assert.equal(cookieOf(refused, 'nossom-zro-ia'), '');
});

test('a token without the zro.ia scope is not kept; signing out forgets and revokes the Z token', async () => {
  fakes.state.scope = 'openid email profile org offline_access';
  const old = await flow();
  assert.equal(old.ia, '', 'sem zro.ia o cookie da Z é apagado');
  assert.equal((await iaCall(old, 'estado', { ia: null })).status, 401);
  // Um cookie antigo, de antes do escopo, também é recusado sem ir à Absolute ZRO.
  const legacy = sealIaTokens(old.session!.account.id, {
    access: 'zat_legacy',
    refresh: null,
    expires: Date.now() + 600000,
    scope: 'openid email',
  });
  assert.equal((await iaCall(old, 'estado', { ia: legacy })).status, 401);

  fakes.state.scope = 'openid email profile org offline_access zro.ia';
  const r = await flow();
  const out = await signOut(
    new Request(SITE + '/api/account', {
      method: 'DELETE',
      headers: { origin: SITE, cookie: cookieFor(r.session!) + '; nossom-zro-ia=' + r.ia },
    }),
  );
  assert.equal(out.status, 200);
  assert.equal(cookieOf(out, 'nossom-zro-ia'), '');
  assert.deepEqual(fakes.state.revoked, [openIaTokens(r.ia)!.refresh]);
});
