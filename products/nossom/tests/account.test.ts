import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountFromToken,
  accountFromUser,
  accountToken,
  authenticate,
  currentAccount,
  decodeSession,
  encodeSession,
  refreshAccount,
  sessionCookie,
  sessionFromProvider,
  accountSessionOwner,
} from '../lib/server/account';
import { safeReturnPath } from '../lib/accounts';
import { authEnvironment, testUser, testCookie } from './helpers/auth';
test('Supabase session is encrypted, HttpOnly, expiring and rejects tampering or legacy demo receipts', () => {
  const restore = authEnvironment();
  try {
    const cookie = testCookie(),
      token = cookie.split('=')[1];
    assert.equal(accountFromToken(token)?.email, testUser.email);
    assert.ok(
      !cookie.includes('test-access-placeholder') &&
        !cookie.includes('test-refresh-placeholder') &&
        !cookie.includes(testUser.email!),
    );
    assert.match(sessionCookie(token), /HttpOnly; SameSite=Lax/);
    assert.equal(accountFromToken(token + 'modified'), null);
    assert.equal(accountFromToken('legacy.demo'), null);
    const session = decodeSession(token)!;
    session.expires = Date.now() - 1;
    assert.equal(accountFromToken(encodeSession(session)), null);
  } finally {
    restore();
  }
});
test('admin privileges require the exact email and verified Supabase identity; metadata cannot grant admin', () => {
  assert.equal(
    accountFromUser({
      ...testUser,
      user_metadata: { name: 'ADM', ...{ role: 'admin', isAdmin: true } },
    }).isAdmin,
    false,
  );
  assert.equal(
    accountFromUser({ ...testUser, email: 'victorbarrosoc@gmail.com', email_confirmed_at: null })
      .isAdmin,
    false,
  );
  assert.equal(accountFromUser({ ...testUser, email: 'victorbarrosoc@gmail.com' }).isAdmin, true);
  assert.equal(
    accountFromUser({ ...testUser, email: 'victorbarrosoc+fake@gmail.com' }).isAdmin,
    false,
  );
});
test('login uses GoTrue, verified identity, and never returns provider credentials to the interface', async () => {
  const restore = authEnvironment(),
    oldFetch = globalThis.fetch;
  const calls: { url: string; body: any }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.endsWith('/auth/v1/user')) return Response.json(testUser);
    return Response.json({
      user: { ...testUser, email: 'spoof@example.test' },
      access_token: 'test-access',
      refresh_token: 'test-refresh',
      expires_in: 3600,
    });
  };
  try {
    const result = await authenticate('teste@example.test', 'valid-password');
    assert.equal(result.account?.id, testUser.id);
    assert.equal(result.account?.email, testUser.email);
    // Conta nova só nasce pela Absolute ZRO: aqui é só login, nunca cadastro.
    assert.match(calls[0].url, /\/auth\/v1\/token\?grant_type=password$/);
    assert.ok(!calls.some((c) => c.url.includes('/signup')));
    const req = new Request('https://nossom.test/api/usage', {
      headers: { cookie: 'nossom-account=' + result.token },
    });
    assert.equal((await currentAccount(req))?.id, testUser.id);
    assert.equal((await currentAccount(req))?.id, testUser.id);
    assert.equal(
      calls.filter((c) => c.url.endsWith('/user')).length,
      2,
      'identity only checked once per Request',
    );
    const anonymous = new Request('https://nossom.test');
    assert.equal(await currentAccount(anonymous), null);
    globalThis.fetch = async () =>
      Response.json({ error_code: 'session_not_found' }, { status: 401 });
    assert.equal(
      await currentAccount(new Request(req)),
      null,
      'revoked identity cannot access the API with a sealed cookie',
    );
  } finally {
    globalThis.fetch = oldFetch;
    restore();
  }
});
test('an unconfirmed e-mail does not get a login cookie and an expired session refresh keeps conversation ownership', async () => {
  const restore = authEnvironment(),
    oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ user: testUser });
    await assert.rejects(authenticate(testUser.email, 'valid-password'), /Confirme seu e-mail/);
    const session = sessionFromProvider({
      user: testUser,
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      expires_in: 3600,
    });
    const original = encodeSession(session),
      owner = accountSessionOwner(
        new Request('https://nossom.test', { headers: { cookie: 'nossom-account=' + original } }),
      );
    session.expires = Date.now() - 1000;
    globalThis.fetch = async (input, init) => {
      assert.match(String(input), /grant_type=refresh_token/);
      assert.equal(JSON.parse(String(init?.body)).refresh_token, 'old-refresh');
      return Response.json({
        user: testUser,
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      });
    };
    const refreshed = await refreshAccount(encodeSession(session));
    assert.ok(refreshed && refreshed !== 'unavailable');
    assert.equal(decodeSession(refreshed.token)?.access, 'new-access');
    assert.equal(
      accountSessionOwner(
        new Request('https://nossom.test', {
          headers: { cookie: 'nossom-account=' + refreshed.token },
        }),
      ),
      owner,
    );
  } finally {
    globalThis.fetch = oldFetch;
    restore();
  }
});
test('input validation rejects unsafe returns and weak credentials before provider traffic', async () => {
  await assert.rejects(authenticate('bad', 'long-password'), /e-mail/);
  await assert.rejects(authenticate('valid@example.test', ''), /senha/);
  await assert.rejects(authenticate('valid@example.test', 'x'.repeat(129)), /senha/);
  for (const value of [
    'https://evil.test',
    '//evil.test',
    '/studioevil',
    '/studio/\\evil',
    '/studio\nX',
  ])
    assert.equal(safeReturnPath(value), '/studio');
  assert.equal(safeReturnPath('/studio/efeitos?project=123'), '/studio/efeitos?project=123');
});
test('a transient Auth outage keeps the session while a rejected refresh ends it', async () => {
  const restore = authEnvironment(),
    oldFetch = globalThis.fetch;
  try {
    const session = sessionFromProvider({
      user: testUser,
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      expires_in: 3600,
    });
    session.expires = Date.now() - 1000;
    const token = encodeSession(session);
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };
    assert.equal(await refreshAccount(token), 'unavailable');
    globalThis.fetch = async () => Response.json({ message: 'down' }, { status: 503 });
    assert.equal(await refreshAccount(token), 'unavailable');
    globalThis.fetch = async () => Response.json({ error_code: 'too_many' }, { status: 429 });
    assert.equal(await refreshAccount(token), 'unavailable');
    globalThis.fetch = async () =>
      Response.json({ error_code: 'refresh_token_not_found' }, { status: 400 });
    assert.equal(await refreshAccount(token), null);
  } finally {
    globalThis.fetch = oldFetch;
    restore();
  }
});
