import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from '../app/api/usage/route';
import { testCookie, testUser, authEnvironment } from './helpers/auth';
import { aiSessionAllowed } from '../lib/server/usage';
test('local finishing requires verified identity but never spends GPU minutes or grants cloud authorization', async () => {
  const restore = authEnvironment(),
    old = globalThis.fetch;
  const ids: string[] = [];
  let exhausted = false;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/auth/v1/user')) return Response.json(testUser);
    assert.match(String(input), /\/rest\/v1\/rpc\/nossom_plan_usage$/);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-access-placeholder');
    const body = JSON.parse(String(init?.body));
    if (body.p_request_id) ids.push(body.p_request_id);
    return Response.json({
      allowed: !exhausted,
      used: exhausted ? 10 : 1,
      remaining: exhausted ? 0 : 9,
      limit: 10,
      unlimited: false,
      resetAt: '2026-10-26T03:00:00Z',
    });
  };
  try {
    const cookie = testCookie();
    const request = (body: unknown, origin = 'https://nossom.test', authenticated = true) =>
      new Request('https://nossom.test/api/usage', {
        method: 'POST',
        headers: {
          origin,
          ...(authenticated ? { cookie } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    assert.equal((await POST(request({ operation: 'auto' }, 'https://evil.test'))).status, 403);
    assert.equal(
      (await POST(request({ operation: 'auto' }, 'https://nossom.test', false))).status,
      401,
    );
    assert.equal((await POST(request({ operation: 'execute-code' }))).status, 400);
    assert.equal((await POST(request(null))).status, 400);
    assert.equal((await GET(new Request('https://nossom.test/api/usage'))).status, 401);
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await POST(
            request({
              operation: 'eq',
              requestId: 'attacker-reused-id',
              userId: 'other',
              isAdmin: true,
            }),
          )
        ).status,
        200,
      );
    assert.equal(ids.length, 0);
    assert.ok(ids.every((id) => id !== 'attacker-reused-id'));
    exhausted = true;
    assert.equal((await POST(request({ operation: 'auto' }))).status, 400);
    assert.equal((await POST(request({ operation: 'eq' }))).status, 200);
    globalThis.fetch = async () =>
      Response.json({ error_code: 'session_revoked' }, { status: 401 });
    assert.equal((await POST(request({ operation: 'auto' }))).status, 401);
  } finally {
    globalThis.fetch = old;
    restore();
  }
});
test('new assistant conversations follow the database daily cap and tolerate only a missing function', async () => {
  const restore = authEnvironment(),
    old = globalThis.fetch;
  let reply: () => Response = () => Response.json({ allowed: true, used: 1, limit: 40 });
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /\/rest\/v1\/rpc\/nossom_ai_session$/);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-access-placeholder');
    return reply();
  };
  try {
    const request = new Request('https://nossom.test/api/ai/assistant', {
      headers: { cookie: testCookie() },
    });
    assert.equal(await aiSessionAllowed(request), true);
    reply = () => Response.json({ allowed: false, used: 40, limit: 40 });
    assert.equal(await aiSessionAllowed(request), false);
    reply = () => Response.json({ code: 'PGRST202' }, { status: 404 });
    assert.equal(await aiSessionAllowed(request), true);
    reply = () => Response.json({ message: 'down' }, { status: 503 });
    assert.equal(await aiSessionAllowed(request), false);
  } finally {
    globalThis.fetch = old;
    restore();
  }
});
