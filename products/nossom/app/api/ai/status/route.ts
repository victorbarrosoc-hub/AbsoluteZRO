import { aiConfigured, allowRequest, privateHeaders } from '@/lib/server/ai-access';
import { claudeModel } from '@/lib/server/claude';
import { currentAccount } from '@/lib/server/account';
import { agentConnection, verifyManagedAgent } from '@/lib/server/managed-agent';
export async function GET(request: Request) {
  const connected = !!(await currentAccount(request));
  if (connected && new URL(request.url).searchParams.get('verify') === '1') {
    const account = (await currentAccount(request))!;
    if (!allowRequest('agent-health:' + account.id, 3, 60000))
      return Response.json(
        { error: 'Aguarde um minuto para conferir novamente.' },
        { status: 429, headers: privateHeaders },
      );
    try {
      const config = (await agentConnection(request))!;
      await verifyManagedAgent(config, AbortSignal.timeout(15000));
      return Response.json(
        {
          configured: aiConfigured(),
          authorized: true,
          shared: true,
          mode: 'managed',
          verified: true,
        },
        { headers: privateHeaders },
      );
    } catch (error) {
      return Response.json(
        {
          verified: false,
          error: error instanceof Error ? error.message : 'Assistente indisponível.',
        },
        { status: 503, headers: privateHeaders },
      );
    }
  }
  return Response.json(
    {
      configured: aiConfigured(),
      authorized: connected,
      mode: 'managed',
      shared: true,
      model: claudeModel(),
      effort: 'high',
    },
    { headers: privateHeaders },
  );
}
