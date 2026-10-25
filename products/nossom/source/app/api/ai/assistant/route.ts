import {
  allowRequest,
  authorized,
  privateHeaders,
  publicError,
  sameOrigin,
} from '@/lib/server/ai-access';
import { currentAccount } from '@/lib/server/account';
import { aiSessionAllowed } from '@/lib/server/usage';
import {
  agentConnection,
  askManagedAgent,
  closeManagedConversation,
} from '@/lib/server/managed-agent';
export const maxDuration = 120;
export async function POST(request: Request) {
  if (!sameOrigin(request) || !(await authorized(request)))
    return Response.json(
      {
        error:
          'Entre na sua conta para usar o assistente. Se já entrou, tente novamente mais tarde.',
      },
      { status: 401, headers: privateHeaders },
    );
  if (
    !(await currentAccount(request))!.isAdmin &&
    !allowRequest('assistant:' + (await currentAccount(request))!.id)
  )
    return Response.json(
      { error: 'Limite desta sessão atingido. Tente novamente mais tarde.' },
      { status: 429, headers: privateHeaders },
    );
  const raw = await request.text();
  if (raw.length > 5000) return Response.json({ error: 'Pedido muito longo.' }, { status: 413 });
  try {
    const body = JSON.parse(raw);
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1500)
      return Response.json(
        { error: 'Escreva um pedido de até 1.500 caracteres.' },
        { status: 400 },
      );
    const context: Record<string, unknown> = {};
    for (const key of ['lufs', 'truePeak', 'lra', 'duration', 'channels'])
      if (typeof body.context?.[key] === 'number' && Number.isFinite(body.context[key]))
        context[key] = body.context[key];
    if (body.conversation == null && !(await aiSessionAllowed(request)))
      return Response.json(
        { error: 'Você chegou ao limite de conversas de hoje. Volte amanhã.' },
        { status: 429, headers: privateHeaders },
      );
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(100000)]);
    const config = await agentConnection(request);
    if (!config) throw new Error('Entre novamente para conversar com o assistente.');
    return Response.json(
      await askManagedAgent(request, config, body.text, context, body.conversation, signal),
      { headers: privateHeaders },
    );
  } catch (error) {
    return Response.json(
      { error: publicError(error, 'Não foi possível obter a sugestão.') },
      { status: 502, headers: privateHeaders },
    );
  }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request) || !(await authorized(request)))
    return Response.json({ error: 'Acesso negado.' }, { status: 401, headers: privateHeaders });
  const config = await agentConnection(request);
  if (!config) return Response.json({ closed: true }, { headers: privateHeaders });
  try {
    const raw = await request.text();
    if (raw.length > 5000) return Response.json({ error: 'Pedido inválido.' }, { status: 413 });
    const body = JSON.parse(raw);
    if (typeof body.conversation !== 'string')
      return Response.json({ error: 'Conversa inválida.' }, { status: 400 });
    await closeManagedConversation(request, config, body.conversation);
    return Response.json({ closed: true }, { headers: privateHeaders });
  } catch {
    return Response.json(
      { error: 'Não foi possível encerrar a conversa no provedor.' },
      { status: 502, headers: privateHeaders },
    );
  }
}
