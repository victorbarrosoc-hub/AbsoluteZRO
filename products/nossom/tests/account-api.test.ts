import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, PATCH } from '../app/api/account/route';
import { authEnvironment } from './helpers/auth';
test('anonymous activation health checks Supabase and migration without credentials, email or paid generation', async () => {
  const restore = authEnvironment(),
    old = globalThis.fetch;
  let migrated = false;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    assert.equal(new Headers(init?.headers).get('authorization'), null);
    if (url.endsWith('/auth/v1/settings')) return Response.json({ external: { email: true } });
    assert.match(url, /\/rpc\/nossom_plan_usage$/);
    assert.deepEqual(JSON.parse(String(init?.body)), { p_request_id: null });
    return Response.json(
      { code: migrated ? '42501' : 'PGRST202' },
      { status: migrated ? 401 : 404 },
    );
  };
  try {
    const health = () => GET(new Request('https://nossom.test/api/account?verify=1'));
    assert.deepEqual(await (await health()).json(), {
      configured: true,
      reachable: true,
      quotaReady: false,
      restorationReady: false,
    });
    migrated = true;
    assert.deepEqual(await (await health()).json(), {
      configured: true,
      reachable: true,
      quotaReady: true,
      restorationReady: false,
    });
    assert.equal(calls.length, 4);
    assert.ok(calls.every((c) => c.includes('supabase.example.test')));
    const status = await GET(new Request('https://nossom.test/api/account'));
    assert.equal(status.status, 401);
  } finally {
    globalThis.fetch = old;
    restore();
  }
});

test('profile updates use authenticated identity, ignore roles, and require the current password for security changes', async () => {
  const restore = authEnvironment(),
    old = globalThis.fetch;
  const changes: Record<string, unknown>[] = [];
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'teste@example.test',
    email_confirmed_at: '2026-10-22T00:00:00Z',
    user_metadata: { name: 'Pessoa' },
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/token') {
      const body = JSON.parse(String(init?.body));
      return body.password === 'valid-test-password'
        ? Response.json({
            user,
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 3600,
          })
        : Response.json({ error_code: 'invalid_credentials' }, { status: 400 });
    }
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      changes.push(body);
      if (body.data) user.user_metadata = body.data;
      return Response.json(user);
    }
    return Response.json(user);
  };
  try {
    const { testCookie } = await import('./helpers/auth');
    const cookie = testCookie();
    const request = (body: unknown, origin = 'https://nossom.test', auth = true) =>
      new Request('https://nossom.test/api/account', {
        method: 'PATCH',
        headers: { origin, ...(auth ? { cookie } : {}), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    assert.equal(
      (await PATCH(request({ action: 'profile', name: 'Teste' }, 'https://evil.test'))).status,
      403,
    );
    assert.equal(
      (await PATCH(request({ action: 'profile', name: 'Teste' }, 'https://nossom.test', false)))
        .status,
      401,
    );
    const profile = await PATCH(
      request({
        action: 'profile',
        name: 'Novo nome',
        isAdmin: true,
        email: 'adm@example.test',
      }),
    );
    assert.equal(profile.status, 200);
    const data = await profile.json();
    assert.equal(data.account.name, 'Novo nome');
    assert.equal(data.account.isAdmin, false);
    assert.equal(data.account.email, user.email);
    assert.equal(data.token, undefined);
    assert.deepEqual(changes[0], { data: { name: 'Novo nome' } });
    const failed = await PATCH(
      request({ action: 'password', password: 'a-new-password', currentPassword: 'wrong' }),
    );
    assert.equal(failed.status, 400);
    assert.equal(changes.length, 1);
    const changed = await PATCH(
      request({
        action: 'password',
        password: 'a-new-password',
        currentPassword: 'valid-test-password',
      }),
    );
    assert.equal(changed.status, 200);
    assert.deepEqual(changes[1], { password: 'a-new-password' });
    assert.match(changed.headers.get('set-cookie')!, /HttpOnly/);
  } finally {
    globalThis.fetch = old;
    restore();
  }
});
