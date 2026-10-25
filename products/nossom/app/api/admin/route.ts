import { accessToken, currentAccount } from '@/lib/server/account';
import { allowRequest, privateHeaders, sameOrigin } from '@/lib/server/ai-access';
import { supabase } from '@/lib/server/supabase';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  const account = await currentAccount(request);
  if (!account?.isAdmin)
    return Response.json(
      { error: 'Acesso restrito ao administrador.' },
      { status: 403, headers: privateHeaders },
    );
  const url = new URL(request.url),
    page = Number(url.searchParams.get('page') || 0);
  if (!Number.isInteger(page) || page < 0 || page > 10000)
    return Response.json({ error: 'Página inválida.' }, { status: 400, headers: privateHeaders });
  try {
    const data = await supabase('/rest/v1/rpc/nossom_admin', {
      method: 'POST',
      token: accessToken(request),
      body: {
        p_action: 'dashboard',
        p_data: { search: (url.searchParams.get('search') || '').slice(0, 100), page },
      },
    });
    return Response.json(data, { headers: privateHeaders });
  } catch {
    return Response.json(
      { error: 'O painel está aguardando a migração de planos no Supabase.' },
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
  if (!account?.isAdmin)
    return Response.json(
      { error: 'Acesso restrito ao administrador.' },
      { status: 403, headers: privateHeaders },
    );
  if (!allowRequest('admin:' + account.id, 30, 60000))
    return Response.json(
      { error: 'Aguarde um instante.' },
      { status: 429, headers: privateHeaders },
    );
  try {
    const raw = await request.text();
    if (raw.length > 3000) throw new Error('Pedido inválido.');
    const body = JSON.parse(raw),
      d = body?.data;
    if (!d || typeof d !== 'object') throw new Error('Pedido inválido.');
    let data;
    if (body.action === 'set_member') {
      if (
        !/^[0-9a-f-]{36}$/i.test(d.userId) ||
        !['free', 'essential', 'studio'].includes(d.planId) ||
        !(
          d.secondsOverride === null ||
          (Number.isInteger(d.secondsOverride) &&
            d.secondsOverride >= 0 &&
            d.secondsOverride <= 864000)
        ) ||
        typeof d.blocked !== 'boolean' ||
        !(
          d.expiresAt === null ||
          (typeof d.expiresAt === 'string' && Number.isFinite(Date.parse(d.expiresAt)))
        )
      )
        throw new Error('Plano ou limite inválido.');
      data = {
        userId: d.userId,
        planId: d.planId,
        secondsOverride: d.secondsOverride,
        blocked: d.blocked,
        expiresAt: d.expiresAt,
      };
    } else if (body.action === 'set_plan') {
      if (
        !['free', 'essential', 'studio'].includes(d.planId) ||
        typeof d.name !== 'string' ||
        d.name.trim().length < 2 ||
        d.name.trim().length > 40 ||
        !Number.isInteger(d.monthlySeconds) ||
        d.monthlySeconds < 0 ||
        d.monthlySeconds > 864000 ||
        !Number.isInteger(d.priceCents) ||
        d.priceCents < 0 ||
        d.priceCents > 1000000 ||
        (d.planId === 'free' && d.priceCents !== 0)
      )
        throw new Error('Valores do plano inválidos.');
      data = {
        planId: d.planId,
        name: d.name.trim(),
        monthlySeconds: d.monthlySeconds,
        priceCents: d.priceCents,
      };
    } else if (body.action === 'set_cost') {
      if (!Number.isFinite(d.usdPerHour) || d.usdPerHour < 0.01 || d.usdPerHour > 50)
        throw new Error('Custo por hora inválido.');
      data = { usdPerHour: d.usdPerHour };
    } else throw new Error('Ação inválida.');
    const result = await supabase('/rest/v1/rpc/nossom_admin', {
      method: 'POST',
      token: accessToken(request),
      body: { p_action: body.action, p_data: data },
    });
    return Response.json(result, { headers: privateHeaders });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SyntaxError
            ? 'Pedido inválido.'
            : 'Não foi possível salvar. Confira os dados e a migração do painel.',
      },
      { status: 400, headers: privateHeaders },
    );
  }
}
