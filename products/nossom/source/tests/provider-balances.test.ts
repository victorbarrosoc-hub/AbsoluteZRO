import test from 'node:test';
import assert from 'node:assert/strict';
import { providerBalances } from '../lib/server/provider-balances';
test('balances preserve zero, cache reads and return no secret or invented value on provider failure', async () => {
  const fetcher = globalThis.fetch,
    now = Date.now,
    key = process.env.RUNPOD_API_KEY;
  let clock = now(),
    calls = 0;
  Date.now = () => clock;
  try {
    delete process.env.RUNPOD_API_KEY;
    assert.equal((await providerBalances()).runpod.balanceUsd, null);
    clock += 61000;
    process.env.RUNPOD_API_KEY = 'test-only-key';
    globalThis.fetch = async (_input, init) => {
      calls++;
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-only-key');
      return Response.json({ data: { myself: { clientBalance: 0, currentSpendPerHr: 0.69 } } });
    };
    const data = await providerBalances();
    assert.equal(data.runpod.balanceUsd, 0);
    assert.equal(data.runpod.spendUsdHour, 0.69);
    assert.equal(data.claude.balanceUsd, null);
    await providerBalances();
    assert.equal(calls, 1);
    clock += 61000;
    globalThis.fetch = async () => {
      throw new Error('secret-provider-details');
    };
    const failed = await providerBalances();
    assert.equal(failed.runpod.balanceUsd, null);
    assert.doesNotMatch(JSON.stringify(failed), /test-only-key|secret-provider-details/);
  } finally {
    globalThis.fetch = fetcher;
    Date.now = now;
    if (key === undefined) delete process.env.RUNPOD_API_KEY;
    else process.env.RUNPOD_API_KEY = key;
  }
});
