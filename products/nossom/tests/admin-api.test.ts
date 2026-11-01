import test from 'node:test';
import assert from 'node:assert/strict';
import { GET as billingGET } from '../app/api/admin/billing/route';
import { GET, POST } from '../app/api/admin/route';
import { authEnvironment, testCookie, testUser } from './helpers/auth';
test('admin API checks the platform admin from the Absolute ZRO link, same-origin writes and plan bounds; never trusts client roles', async () => {
  const restore = authEnvironment(),
    before = globalThis.fetch,
    env = ['SUPABASE_SERVICE_ROLE_KEY', 'ZRO_CLIENT_ID', 'ZRO_CLIENT_SECRET'] as const,
    oldEnv = env.map((k) => process.env[k]);
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-placeholder';
  process.env.ZRO_CLIENT_ID = 'nossom-web';
  process.env.ZRO_CLIENT_SECRET = 'zro-test-secret-placeholder';
  let user = testUser,
    calls = 0,
    last: any,
    // Vínculo com a Absolute ZRO guardado no banco; `admin` = claim `zro_admin` do último login.
    link: Record<string, unknown> | null = null;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/auth/v1/user')) return Response.json(user);
    if (String(input).endsWith('/rpc/nossom_zro_link')) return Response.json({ link });
    calls++;
    last = JSON.parse(String(init?.body));
    assert.match(String(input), /\/rpc\/nossom_admin$/);
    return Response.json({ ok: true });
  };
  const request = (body?: unknown, origin = 'http://localhost') =>
    new Request('http://localhost/api/admin', {
      method: body ? 'POST' : 'GET',
      headers: { cookie: testCookie(user), origin },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    assert.equal((await GET(request())).status, 403);
    assert.equal(
      (await POST(request({ action: 'set_member', isAdmin: true, data: {} }))).status,
      403,
    );
    assert.equal((await billingGET(request())).status, 403);
    assert.equal(calls, 0);
    // Ligada à Absolute ZRO, mas sem ser admin da plataforma: não entra.
    link = {
      email: 'pessoa@example.test',
      organization: null,
      products: ['nossom'],
      release: {},
      admin: false,
    };
    assert.equal((await GET(request())).status, 403);
    // Admin da plataforma (claim `zro_admin` guardada no vínculo): entra. O e-mail não decide nada.
    link = { ...link, admin: true };
    assert.equal((await GET(request())).status, 200);
    // Sinal que não é o booleano true não vale.
    link = { ...link, admin: 'true' };
    assert.equal((await GET(request())).status, 403);
    link = { ...link, admin: true };
    const body = {
      action: 'set_member',
      data: {
        userId: testUser.id,
        planId: 'essential',
        secondsOverride: null,
        expiresAt: null,
        blocked: false,
      },
    };
    assert.equal((await POST(request(body, 'https://evil.test'))).status, 403);
    assert.equal(
      (await POST(request({ ...body, data: { ...body.data, secondsOverride: -1 } }))).status,
      400,
    );
    assert.equal((await POST(request(body))).status, 200);
    assert.equal(last.p_action, 'set_member');
    assert.deepEqual(last.p_data, body.data);
    assert.equal(
      (await POST(request({ action: 'set_cost', data: { usdPerHour: 1000 } }))).status,
      400,
    );
  } finally {
    globalThis.fetch = before;
    env.forEach((k, i) =>
      oldEnv[i] === undefined ? delete process.env[k] : (process.env[k] = oldEnv[i]),
    );
    restore();
  }
});
