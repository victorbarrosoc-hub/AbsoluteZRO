import { setTimeout as delay } from 'node:timers/promises';
import {
  assistantSystem,
  claudeModel,
  validPlan,
  verifyClaude,
  type AssistantPlan,
} from './claude';
import { readToken, signToken } from './ai-access';
import { accountSessionOwner, currentAccount } from './account';

export type AgentConnection = { agentId: string; environmentId: string };
type AgentInfo = {
  id: string;
  name: string;
  version: number;
  system: string | null;
  archived_at?: string | null;
  multiagent?: unknown;
};
type Event = {
  id: string;
  type: string;
  content?: { type: string; text?: string }[];
  stop_reason?: { type: string };
};
type EventPage = { data: Event[]; next_page?: string | null };

export function validConnection(value: unknown): AgentConnection {
  const v = value as Partial<AgentConnection> | null;
  if (
    !v ||
    typeof v.agentId !== 'string' ||
    !/^agent_[a-zA-Z0-9]{8,100}$/.test(v.agentId) ||
    typeof v.environmentId !== 'string' ||
    !/^env_[a-zA-Z0-9]{8,100}$/.test(v.environmentId)
  )
    throw new Error('Informe o Agent ID (agent_…) e o Environment ID (env_…) do Console.');
  return { agentId: v.agentId, environmentId: v.environmentId };
}
export async function agentConnection(request: Request): Promise<AgentConnection | null> {
  if (!(await currentAccount(request))) return null;
  return validConnection({
    agentId: process.env.ANTHROPIC_AGENT_ID || 'agent_01MwL58EV86EVa1QtnRoJJFN',
    environmentId: process.env.ANTHROPIC_ENVIRONMENT_ID || 'env_01XJjWsz3E3nym6SNC7ZbtsM',
  });
}
async function provider<T>(
  path: string,
  method: string,
  signal?: AbortSignal,
  body?: unknown,
): Promise<T> {
  const response = await fetch('https://api.anthropic.com/v1/' + path, {
    method,
    signal,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'managed-agents-2026-04-01',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? 'Agente ou ambiente não encontrado. Confira os IDs e o workspace da chave.'
        : response.status === 401 || response.status === 403
          ? 'Esta chave não tem acesso ao agente ou ambiente informado.'
          : response.status === 429
            ? 'O agente atingiu o limite de uso. Aguarde antes de tentar novamente.'
            : 'A Anthropic não concluiu a operação com o agente. Confira a configuração no Console.',
    );
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function verifyManagedAgent(config: AgentConnection, signal?: AbortSignal) {
  validConnection(config);
  const [agent, environment] = await Promise.all([
    provider<AgentInfo>(`agents/${config.agentId}?beta=true`, 'GET', signal),
    provider<{ id: string }>(`environments/${config.environmentId}?beta=true`, 'GET', signal),
    verifyClaude(signal),
  ]);
  if (
    agent.id !== config.agentId ||
    environment.id !== config.environmentId ||
    !Number.isInteger(agent.version) ||
    agent.version < 1 ||
    agent.archived_at
  )
    throw new Error('O agente ou ambiente retornou uma configuração inválida ou arquivada.');
  if (agent.multiagent)
    throw new Error(
      'Esta conexão aceita um agente individual. Escolha um agente sem orquestração de outros agentes.',
    );
  return agent;
}
function owner(request: Request) {
  return accountSessionOwner(request);
}
function conversationSession(request: Request, config: AgentConnection, token: unknown) {
  if (token === undefined || token === null) return null;
  if (typeof token !== 'string') throw new Error('Conversa inválida. Abra uma nova conversa.');
  const data = readToken('agent-conversation', token);
  if (
    !data ||
    data.owner !== owner(request) ||
    data.agentId !== config.agentId ||
    data.environmentId !== config.environmentId ||
    data.model !== claudeModel() ||
    typeof data.sessionId !== 'string' ||
    !/^sesn_[a-zA-Z0-9]{8,100}$/.test(data.sessionId)
  )
    throw new Error('Esta conversa expirou ou pertence a outra conexão. Abra uma nova conversa.');
  return data.sessionId;
}
async function eventsAfter(sessionId: string, boundary: string | undefined, signal?: AbortSignal) {
  const events: Event[] = [];
  let page: string | null | undefined;
  for (let i = 0; i < 10; i++) {
    const query = new URLSearchParams({ beta: 'true', order: 'desc', limit: '100' });
    if (page) query.set('page', page);
    const result = await provider<EventPage>(
      `sessions/${sessionId}/events?${query}`,
      'GET',
      signal,
    );
    for (const event of result.data) {
      if (event.id === boundary) return events.reverse();
      events.push(event);
    }
    page = result.next_page;
    if (!page) {
      if (boundary)
        throw new Error(
          'Não foi possível separar os eventos desta resposta. Abra uma nova conversa.',
        );
      return events.reverse();
    }
  }
  throw new Error('A resposta do agente excedeu o limite de eventos desta conversa.');
}
function planFromMessages(events: Event[]): AssistantPlan {
  const reply = events
    .filter((e) => e.type === 'agent.message')
    .flatMap((e) => e.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n')
    .trim();
  if (!reply)
    throw new Error(
      'O agente encerrou sem uma resposta de texto. Confira as instruções no Console.',
    );
  const unfenced = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    return validPlan({ reply, operation: null });
  }
  return validPlan(parsed);
}
export async function closeManagedConversation(
  request: Request,
  config: AgentConnection,
  token: unknown,
) {
  const sessionId = conversationSession(request, config, token);
  if (sessionId)
    await provider(`sessions/${sessionId}?beta=true`, 'DELETE', AbortSignal.timeout(5000));
}
export async function askManagedAgent(
  request: Request,
  config: AgentConnection,
  text: string,
  context: Record<string, unknown>,
  token: unknown,
  signal: AbortSignal,
) {
  let sessionId = conversationSession(request, config, token);
  const fresh = !sessionId;
  if (!sessionId) {
    const agent = await verifyManagedAgent(config, signal);
    const session = await provider<{ id: string }>('sessions?beta=true', 'POST', signal, {
      agent: {
        type: 'agent_with_overrides',
        id: agent.id,
        version: agent.version,
        model: { id: claudeModel(), effort: 'high' },
        system: `${agent.system ?? ''}\n\n${assistantSystem()}\nResponda somente com JSON: {"reply":"texto em português","operation":"uma operação disponível ou null","intensity":0,"eqPreset":"neutral, warm, presence ou air"}.`,
        tools: [],
        mcp_servers: [],
      },
      environment_id: config.environmentId,
      budget: { type: 'limit', max_list_cost: { amount: '100', currency: 'USD' } },
      title: 'Quasar · orientação de áudio',
    });
    if (!/^sesn_[a-zA-Z0-9]{8,100}$/.test(session.id))
      throw new Error('A Anthropic retornou uma sessão inválida.');
    sessionId = session.id;
  }
  try {
    const baseline = await provider<EventPage>(
      `sessions/${sessionId}/events?beta=true&order=desc&limit=1`,
      'GET',
      signal,
    );
    const boundary = baseline.data[0]?.id;
    await provider(`sessions/${sessionId}/events?beta=true`, 'POST', signal, {
      events: [
        {
          type: 'user.message',
          content: [{ type: 'text', text: JSON.stringify({ pedido: text, medicoes: context }) }],
        },
      ],
    });
    while (true) {
      signal.throwIfAborted();
      const events = await eventsAfter(sessionId, boundary, signal);
      if (events.some((e) => e.type === 'session.status_terminated'))
        throw new Error('A sessão do agente foi encerrada. Abra uma nova conversa.');
      const idle = events.findLast((e) => e.type === 'session.status_idle');
      const lastRunning = events.findLastIndex((e) => e.type === 'session.status_running');
      const lastMessage = events.findLastIndex((e) => e.type === 'agent.message');
      const lastUser = events.findLastIndex((e) => e.type === 'user.message');
      if (
        idle &&
        events.indexOf(idle) > Math.max(lastRunning, lastMessage, lastUser) &&
        (lastMessage >= 0 || lastUser >= 0)
      ) {
        if (idle.stop_reason?.type === 'budget_reached')
          throw new Error(
            'Esta conversa atingiu o limite de US$ 1. Abra uma nova conversa para continuar.',
          );
        if (idle.stop_reason?.type === 'requires_action')
          throw new Error(
            'O agente solicitou uma ferramenta externa. Esta conexão usa sugestões de áudio com revisão.',
          );
        if (idle.stop_reason?.type === 'retries_exhausted')
          throw new Error('O agente encerrou após falhas no provedor. Tente uma nova conversa.');
        return {
          ...planFromMessages(events),
          conversation: signToken('agent-conversation', {
            sessionId,
            ...config,
            model: claudeModel(),
            owner: owner(request),
          }),
        };
      }
      await delay(800, undefined, { signal });
    }
  } catch (error) {
    // A local timeout or closing the assistant must also stop remote generation.
    try {
      if (fresh)
        await provider(`sessions/${sessionId}?beta=true`, 'DELETE', AbortSignal.timeout(5000));
      else
        await provider(
          `sessions/${sessionId}/events?beta=true`,
          'POST',
          AbortSignal.timeout(5000),
          { events: [{ type: 'user.interrupt' }] },
        );
    } catch {
      /* The provider may already have terminated this session. */
    }
    throw error;
  }
}
