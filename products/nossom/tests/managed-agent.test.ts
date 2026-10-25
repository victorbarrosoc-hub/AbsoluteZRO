import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agentConnection,
  askManagedAgent,
  closeManagedConversation,
  verifyManagedAgent,
  validConnection,
} from '../lib/server/managed-agent';
import { authEnvironment, testUser, testCookie } from './helpers/auth';
import { randomUUID } from 'node:crypto';
import { GET as status } from '../app/api/ai/status/route';

const config = { agentId: 'agent_test12345678', environmentId: 'env_test12345678' };
const sessionId = 'sesn_test12345678';
const makePlan = (reply: string) => ({
  reply,
  operation: 'eq',
  intensity: 65,
  eqPreset: 'presence',
});
function fixture() {
  const restoreAuth = authEnvironment();
  const previous = {
    fetch: globalThis.fetch,
    key: process.env.ANTHROPIC_API_KEY,
    code: process.env.NOSSOM_AI_ACCESS_CODE,
  };
  process.env.ANTHROPIC_API_KEY = 'managed-test-placeholder';
  process.env.NOSSOM_AI_ACCESS_CODE = 'managed-test-access-not-real';
  const cookie = testCookie();
  const request = new Request('http://localhost/api/ai/assistant', { headers: { cookie } });
  const calls: { url: URL; method: string; body?: Record<string, unknown> }[] = [];
  let turns = 0;
  let abortOnSend: AbortController | undefined;
  let deniedEnvironment = false;
  function idle(turn: number) {
    return { id: `idle${turn}`, type: 'session.status_idle', stop_reason: { type: 'end_turn' } };
  }
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'https://supabase.example.test') return Response.json(testUser);
    assert.equal(url.origin, 'https://api.anthropic.com');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (url.pathname.startsWith('/v1/models/')) return Response.json({ id: 'claude-sonnet-5-5' });
    assert.equal(new Headers(init?.headers).get('anthropic-beta'), 'managed-agents-2026-04-01');
    if (url.pathname.startsWith('/v1/agents/'))
      return Response.json({
        ...config,
        id: config.agentId,
        name: 'Meu agente',
        version: 3,
        system: 'Instruções originais do meu agente.',
        multiagent: null,
      });
    if (url.pathname.startsWith('/v1/environments/'))
      return deniedEnvironment
        ? Response.json({}, { status: 403 })
        : Response.json({ id: config.environmentId });
    if (url.pathname === '/v1/sessions') return Response.json({ id: sessionId });
    if (method === 'DELETE') return Response.json({ id: sessionId, deleted: true });
    if (method === 'POST') {
      if (body.events[0].type === 'user.message') {
        turns++;
        abortOnSend?.abort();
      }
      return Response.json({ data: [{ id: `user${turns}`, type: 'user.message' }] });
    }
    if (url.searchParams.get('limit') === '1')
      return Response.json({ data: [idle(turns)], next_page: null });
    if (turns === 2 && !url.searchParams.has('page'))
      return Response.json({
        data: [
          idle(2),
          {
            id: 'answer2',
            type: 'agent.message',
            content: [
              { type: 'text', text: JSON.stringify(makePlan('Segunda resposta, com contexto.')) },
            ],
          },
        ],
        next_page: 'older-events',
      });
    if (turns === 2)
      return Response.json({
        data: [
          { id: 'user2', type: 'user.message' },
          { id: 'running2', type: 'session.status_running' },
          idle(1),
          {
            id: 'answer1',
            type: 'agent.message',
            content: [{ type: 'text', text: 'Não reutilizar a resposta anterior.' }],
          },
        ],
        next_page: null,
      });
    return Response.json({
      data: [
        idle(1),
        {
          id: 'answer1',
          type: 'agent.message',
          content: [{ type: 'text', text: JSON.stringify(makePlan('Primeira resposta.')) }],
        },
        { id: 'user1', type: 'user.message' },
        { id: 'running1', type: 'session.status_running' },
        idle(0),
      ],
      next_page: null,
    });
  };
  return {
    request,
    calls,
    abortWhenSent(controller: AbortController) {
      abortOnSend = controller;
    },
    denyEnvironment() {
      deniedEnvironment = true;
    },
    restore() {
      globalThis.fetch = previous.fetch;
      restoreAuth();
      if (previous.key === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous.key;
      if (previous.code === undefined) delete process.env.NOSSOM_AI_ACCESS_CODE;
      else process.env.NOSSOM_AI_ACCESS_CODE = previous.code;
    },
  };
}
test('every signed-in account receives the platform agent without personal connection settings or paid generation', async () => {
  const f = fixture();
  try {
    const response = await status(f.request),
      data = await response.json();
    assert.equal(data.authorized, true);
    assert.equal(data.configured, true);
    assert.equal(data.mode, 'managed');
    assert.equal(data.shared, true);
    assert.equal(data.agentId, undefined);
    assert.equal(data.environmentId, undefined);
    const connection = (await agentConnection(f.request))!;
    assert.equal(connection.agentId, 'agent_01MwL58EV86EVa1QtnRoJJFN');
    assert.equal(connection.environmentId, 'env_01XJjWsz3E3nym6SNC7ZbtsM');
    assert.equal(f.calls.length, 0);
    assert.equal(await agentConnection(new Request('http://localhost')), null);
    assert.throws(() =>
      validConnection({ agentId: '../../other', environmentId: config.environmentId }),
    );
  } finally {
    f.restore();
  }
});
test('Managed Agents pins the saved agent, preserves its instructions, requests high effort and continues one isolated session across paginated replies', async () => {
  const f = fixture();
  try {
    const first = await askManagedAgent(
      f.request,
      config,
      'Mais presença.',
      { lufs: -22 },
      undefined,
      new AbortController().signal,
    );
    assert.equal(first.reply, 'Primeira resposta.');
    const second = await askManagedAgent(
      f.request,
      config,
      'E agora?',
      { lufs: -18 },
      first.conversation,
      new AbortController().signal,
    );
    assert.equal(second.reply, 'Segunda resposta, com contexto.');
    const creates = f.calls.filter((c) => c.url.pathname === '/v1/sessions' && c.method === 'POST');
    assert.equal(creates.length, 1);
    const body = creates[0].body!;
    assert.deepEqual(body.budget, {
      type: 'limit',
      max_list_cost: { amount: '100', currency: 'USD' },
    });
    const agent = body.agent as Record<string, unknown>;
    assert.equal(agent.id, config.agentId);
    assert.equal(agent.version, 3);
    assert.deepEqual(agent.model, { id: 'claude-sonnet-5-5', effort: 'high' });
    assert.match(String(agent.system), /Instruções originais do meu agente\./);
    assert.deepEqual(agent.tools, []);
    assert.deepEqual(agent.mcp_servers, []);
    await closeManagedConversation(f.request, config, second.conversation);
    assert.equal(f.calls.at(-1)?.method, 'DELETE');
  } finally {
    f.restore();
  }
});
test('conversation tokens reject another login, another agent and tampering before provider traffic', async () => {
  const f = fixture();
  try {
    const first = await askManagedAgent(
      f.request,
      config,
      'Mais presença.',
      {},
      undefined,
      new AbortController().signal,
    );
    const count = f.calls.length;
    const other = new Request('http://localhost/api/ai/assistant', {
      headers: {
        cookie: testCookie({ ...testUser, id: randomUUID() }),
      },
    });
    await assert.rejects(
      askManagedAgent(
        other,
        config,
        'Outro usuário',
        {},
        first.conversation,
        new AbortController().signal,
      ),
      /outra conexão/,
    );
    await assert.rejects(
      askManagedAgent(
        f.request,
        { ...config, agentId: 'agent_other12345678' },
        'Outro agente',
        {},
        first.conversation,
        new AbortController().signal,
      ),
      /outra conexão/,
    );
    await assert.rejects(
      closeManagedConversation(f.request, config, first.conversation + 'modified'),
      /outra conexão/,
    );
    assert.equal(f.calls.length, count);
  } finally {
    f.restore();
  }
});
test('cancelling a fresh agent request also deletes the remote session', async () => {
  const f = fixture();
  try {
    const controller = new AbortController();
    f.abortWhenSent(controller);
    await assert.rejects(
      askManagedAgent(f.request, config, 'Mais presença.', {}, undefined, controller.signal),
      { name: 'AbortError' },
    );
    assert.equal(f.calls.at(-1)?.method, 'DELETE');
    assert.match(f.calls.at(-1)!.url.pathname, /\/sessions\/sesn_/);
  } finally {
    f.restore();
  }
});
test('an inaccessible environment fails validation without creating or running a session', async () => {
  const f = fixture();
  try {
    f.denyEnvironment();
    await assert.rejects(verifyManagedAgent(config), /não tem acesso/);
    assert.ok(f.calls.every((c) => c.method === 'GET'));
  } finally {
    f.restore();
  }
});
test('cancelling a continuation interrupts the existing remote session', async () => {
  const f = fixture();
  try {
    const first = await askManagedAgent(
      f.request,
      config,
      'Mais presença.',
      {},
      undefined,
      new AbortController().signal,
    );
    const controller = new AbortController();
    f.abortWhenSent(controller);
    await assert.rejects(
      askManagedAgent(f.request, config, 'Continue.', {}, first.conversation, controller.signal),
      { name: 'AbortError' },
    );
    const last = f.calls.at(-1)!;
    assert.equal(last.method, 'POST');
    assert.deepEqual(last.body, { events: [{ type: 'user.interrupt' }] });
  } finally {
    f.restore();
  }
});
