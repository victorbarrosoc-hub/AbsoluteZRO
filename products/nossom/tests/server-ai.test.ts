import test from 'node:test';
import assert from 'node:assert/strict';
import { authorized, sameOrigin } from '../lib/server/ai-access';
import { askClaude, validPlan } from '../lib/server/claude';
import { authEnvironment, testUser, testCookie } from './helpers/auth';
test('paid assistant requires a live verified Supabase session and rejects legacy or tampered cookies', async () => {
  const restore = authEnvironment(),
    oldFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(testUser);
  try {
    const cookie = testCookie();
    assert.equal(
      await authorized(
        new Request('http://localhost/api/ai/assistant', {
          headers: { cookie: 'nossom-ai=legacy' },
        }),
      ),
      false,
    );
    assert.equal(
      await authorized(new Request('http://localhost/api/ai/assistant', { headers: { cookie } })),
      true,
    );
    assert.equal(
      await authorized(
        new Request('http://localhost/api/ai/assistant', {
          headers: { cookie: cookie + 'modified' },
        }),
      ),
      false,
    );
    assert.equal(
      sameOrigin(
        new Request('http://localhost/api/account', { headers: { origin: 'https://example.com' } }),
      ),
      false,
    );
  } finally {
    globalThis.fetch = oldFetch;
    restore();
  }
});
test('Claude requests verified Sonnet 5.5 with high effort and adaptive thinking; returned operations are constrained', async () => {
  const fetchBefore = globalThis.fetch,
    key = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-only-placeholder';
  let payload: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes('/v1/models/'))
      return Response.json({
        id: 'claude-sonnet-5-5',
        capabilities: {
          effort: { high: { supported: true } },
          thinking: { adaptive: { supported: true } },
        },
      });
    payload = JSON.parse(String(init?.body));
    return Response.json({
      stop_reason: 'end_turn',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            reply: 'Sugiro revisar a curva de presença.',
            operation: 'eq',
            intensity: 65,
            eqPreset: 'presence',
          }),
        },
      ],
    });
  };
  try {
    const result = await askClaude('Deixe a voz mais clara.', { lufs: -20 });
    assert.equal(result.operation, 'eq');
    assert.equal(payload?.model, 'claude-sonnet-5-5');
    assert.deepEqual(payload?.thinking, { type: 'adaptive' });
    assert.equal((payload?.output_config as { effort: string }).effort, 'high');
    assert.equal(
      validPlan({ reply: 'teste', operation: 'execute code', intensity: 999 }).operation,
      null,
    );
    assert.equal(validPlan({ reply: 'teste', operation: 'eq', intensity: 999 }).intensity, 100);
  } finally {
    globalThis.fetch = fetchBefore;
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = key;
  }
});
