import {
  accountConfigured,
  accountFromUser,
  decodeSession,
  encodeSession,
  sessionFromProvider,
  type AuthUser,
  type ProviderSession,
  accountToken,
  accessToken,
  authenticate,
  currentAccount,
  sessionCookie,
} from '@/lib/server/account';
import {
  allowRequest,
  privateHeaders,
  publicError,
  sameOrigin,
  requestOrigin,
} from '@/lib/server/ai-access';
import { supabase, SupabaseError } from '@/lib/server/supabase';
import { restorationAvailable } from '@/lib/server/restoration';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get('verify') === '1') {
    const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0];
    if (!allowRequest('supabase-health:' + ip, 3, 60000))
      return Response.json(
        { error: 'Aguarde um minuto.' },
        { status: 429, headers: privateHeaders },
      );
    if (!accountConfigured())
      return Response.json(
        { configured: false, reachable: false, quotaReady: false },
        { status: 503, headers: privateHeaders },
      );
    try {
      await supabase('/auth/v1/settings');
      let quotaReady = false;
      try {
        await supabase('/rest/v1/rpc/nossom_plan_usage', {
          method: 'POST',
          body: { p_request_id: null },
        });
      } catch (error) {
        quotaReady = error instanceof SupabaseError && ['42501', '28000'].includes(error.code);
      }
      return Response.json(
        {
          configured: true,
          reachable: true,
          quotaReady,
          restorationReady: await restorationAvailable(),
        },
        { headers: privateHeaders },
      );
    } catch {
      return Response.json(
        { configured: true, reachable: false, quotaReady: false },
        { status: 503, headers: privateHeaders },
      );
    }
  }
  const account = await currentAccount(request);
  return Response.json(
    { account, configured: accountConfigured() },
    { status: account ? 200 : 401, headers: privateHeaders },
  );
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: 'Origem não autorizada.' },
      { status: 403, headers: privateHeaders },
    );
  if (!accountConfigured())
    return Response.json(
      { error: 'O acesso ao Supabase está sendo preparado. Tente novamente em breve.' },
      { status: 503, headers: privateHeaders },
    );
  const raw = await request.text();
  if (raw.length > 6000)
    return Response.json({ error: 'Dados inválidos.' }, { status: 413, headers: privateHeaders });
  try {
    const body = JSON.parse(raw),
      ip = (request.headers.get('x-forwarded-for') ?? 'local').split(',')[0];
    if (!['register', 'login'].includes(body.action))
      return Response.json({ error: 'Ação inválida.' }, { status: 400, headers: privateHeaders });
    if (
      !allowRequest(
        'account:' + body.action + ':' + ip,
        body.action === 'register' ? 60 : 30,
        900000,
      )
    )
      return Response.json(
        { error: 'Muitas tentativas. Aguarde alguns minutos.' },
        { status: 429, headers: privateHeaders },
      );
    const result = await authenticate(
      body.action,
      body.email,
      body.password,
      body.name,
      requestOrigin(request),
    );
    const headers = new Headers(privateHeaders);
    if ('token' in result && result.token)
      headers.append('Set-Cookie', sessionCookie(result.token));
    return Response.json(
      { account: result.account, confirmationRequired: result.confirmationRequired || false },
      { headers },
    );
  } catch (error) {
    return Response.json(
      { error: publicError(error, 'Não foi possível entrar.') },
      { status: 400, headers: privateHeaders },
    );
  }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: 'Origem não autorizada.' },
      { status: 403, headers: privateHeaders },
    );
  // Clear even an expired local cookie. Logout in Supabase revokes this refresh session.
  if (accountToken(request) && accessToken(request))
    try {
      await supabase('/auth/v1/logout?scope=local', {
        method: 'POST',
        token: accessToken(request),
      });
    } catch {
      /* Local logout still succeeds when the provider is unavailable. */
    }
  return Response.json(
    { signedOut: true },
    { headers: { ...privateHeaders, 'Set-Cookie': sessionCookie(null) } },
  );
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: 'Origem não autorizada.' },
      { status: 403, headers: privateHeaders },
    );
  const account = await currentAccount(request);
  if (!account)
    return Response.json(
      { error: 'Entre novamente na sua conta.' },
      { status: 401, headers: privateHeaders },
    );
  if (!allowRequest('account-update:' + account.id, 10, 900000))
    return Response.json(
      { error: 'Aguarde alguns minutos antes de alterar novamente.' },
      { status: 429, headers: privateHeaders },
    );
  const raw = await request.text();
  if (raw.length > 3000)
    return Response.json({ error: 'Dados inválidos.' }, { status: 413, headers: privateHeaders });
  try {
    const body = JSON.parse(raw);
    let changes: Record<string, unknown> = {};
    const session = decodeSession(accountToken(request))!;
    let auth: ProviderSession | undefined;
    if (body.action === 'profile') {
      if (
        typeof body.name !== 'string' ||
        body.name.trim().length < 2 ||
        body.name.trim().length > 60
      )
        throw new Error('Use um nome entre 2 e 60 caracteres.');
      changes = { data: { name: body.name.trim() } };
    } else if (body.action === 'email' || body.action === 'password') {
      if (
        typeof body.currentPassword !== 'string' ||
        !body.currentPassword ||
        body.currentPassword.length > 128
      )
        throw new Error('Informe sua senha atual.');
      if (body.action === 'password') {
        if (
          typeof body.password !== 'string' ||
          body.password.length < 8 ||
          body.password.length > 128
        )
          throw new Error('Use uma senha entre 8 e 128 caracteres.');
        changes = { password: body.password };
      } else {
        if (
          typeof body.email !== 'string' ||
          body.email.length > 254 ||
          !/^\S+@\S+\.\S+$/.test(body.email)
        )
          throw new Error('Informe um e-mail válido.');
        changes = { email: body.email.trim().toLowerCase() };
      }
      try {
        auth = await supabase<ProviderSession>('/auth/v1/token?grant_type=password', {
          method: 'POST',
          body: { email: account.email, password: body.currentPassword },
        });
      } catch {
        throw new Error('Sua senha atual não foi confirmada.');
      }
      if (auth.user.id !== account.id)
        throw new Error('Não foi possível confirmar sua identidade.');
    } else
      return Response.json({ error: 'Ação inválida.' }, { status: 400, headers: privateHeaders });
    const user = await supabase<AuthUser>(
      '/auth/v1/user?redirect_to=' + encodeURIComponent(requestOrigin(request) + '/auth/confirm'),
      { method: 'PUT', token: auth?.access_token || session.access, body: changes },
    );
    const updated = accountFromUser(user);
    const token = auth
      ? encodeSession(sessionFromProvider({ ...auth, user }))
      : encodeSession({ ...session, account: updated });
    return Response.json(
      { account: updated, confirmationRequired: body.action === 'email' },
      { headers: { ...privateHeaders, 'Set-Cookie': sessionCookie(token) } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SupabaseError
            ? 'Não foi possível alterar os dados. Confira sua conta e tente novamente.'
            : publicError(error, 'Não foi possível salvar.'),
      },
      { status: 400, headers: privateHeaders },
    );
  }
}
