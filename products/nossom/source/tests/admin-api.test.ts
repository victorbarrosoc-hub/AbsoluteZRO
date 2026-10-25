import test from 'node:test';
import assert from 'node:assert/strict';
import { GET as billingGET } from '../app/api/admin/billing/route';
import { GET, POST } from '../app/api/admin/route';
import { authEnvironment, testCookie, testUser } from './helpers/auth';
test('admin API checks live verified owner, same-origin writes and plan bounds; never trusts client roles', async () => {
  const restore = authEnvironment(),
    before = globalThis.fetch;
  let user = testUser,
    calls = 0,
    last: any;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/auth/v1/user')) return Response.json(user);
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
    user = { ...testUser, email: 'victorbarrosoc@gmail.com', email_confirmed_at: null };
    assert.equal((await GET(request())).status, 403);
    user = { ...user, email_confirmed_at: '2026-10-23T00:00:00Z' };
    assert.equal((await GET(request())).status, 200);
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
    restore();
  }
});
