import { privateHeaders, sameOrigin, allowRequest } from '@/lib/server/ai-access';
import { currentAccount } from '@/lib/server/account';
import { audioUsage } from '@/lib/server/usage';
import { operations } from '@/lib/presets';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  if (!(await currentAccount(request)))
    return Response.json(
      { error: 'Entre na sua conta.' },
      { status: 401, headers: privateHeaders },
    );
  try {
    return Response.json(await audioUsage(request), { headers: privateHeaders });
  } catch {
    return Response.json(
      {
        error:
          'Não foi possível consultar seu limite de tratamentos. Tente novamente em instantes.',
      },
      { status: 503, headers: privateHeaders },
    );
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: 'Origem não autorizada.' },
      { status: 403, headers: privateHeaders },
    );
  const account = await currentAccount(request);
  if (!account)
    return Response.json(
      { error: 'Entre na sua conta.' },
      { status: 401, headers: privateHeaders },
    );
  if (!allowRequest('usage:' + account.id, 120, 60000))
    return Response.json(
      { error: 'Aguarde um instante antes de tentar novamente.' },
      { status: 429, headers: privateHeaders },
    );
  const raw = await request.text();
  if (raw.length > 1000)
    return Response.json({ error: 'Pedido inválido.' }, { status: 413, headers: privateHeaders });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Pedido inválido.' }, { status: 400, headers: privateHeaders });
  }
  if (!body || typeof body !== 'object' || !operations.some((o) => o.id === body.operation))
    return Response.json({ error: 'Pedido inválido.' }, { status: 400, headers: privateHeaders });
  try {
    // GPU authorization belongs to /api/audio/jobs, never this browser endpoint.
    if (body.operation === 'auto')
      return Response.json(
        { error: 'Inicie a restauração pela fila de processamento.' },
        { status: 400, headers: privateHeaders },
      );
    try {
      const usage = await audioUsage(request);
      return Response.json({ ...usage, allowed: true }, { headers: privateHeaders });
    } catch {
      // Finishing is local and free of GPU cost; an unavailable balance must not
      // disable the user's saved projects or local processing.
      return Response.json({ allowed: true, usageUnavailable: true }, { headers: privateHeaders });
    }
  } catch {
    return Response.json(
      { error: 'Não foi possível autorizar o tratamento. Tente novamente em instantes.' },
      { status: 503, headers: privateHeaders },
    );
  }
}
