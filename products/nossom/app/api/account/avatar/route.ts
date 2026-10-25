import {
  accountFromUser,
  accountToken,
  currentAccount,
  decodeSession,
  encodeSession,
  sessionCookie,
  type AuthUser,
} from '@/lib/server/account';
import { allowRequest, privateHeaders, publicError, sameOrigin } from '@/lib/server/ai-access';
import { supabase } from '@/lib/server/supabase';
import {
  AVATAR_MAX_BYTES,
  avatarType,
  readAvatar,
  removeAvatar,
  saveAvatar,
} from '@/lib/server/avatar';
export const runtime = 'nodejs';
const unauthorized = () =>
  Response.json(
    { error: 'Entre novamente na sua conta.' },
    { status: 401, headers: privateHeaders },
  );
/** The photo is served only to its owner, versioned by URL, never sniffed or scripted. */
export async function GET(request: Request) {
  const account = await currentAccount(request);
  if (!account) return unauthorized();
  const avatar = account.avatar ? await readAvatar(account.id).catch(() => null) : null;
  if (!avatar) return new Response(null, { status: 404, headers: privateHeaders });
  return new Response(avatar.bytes, {
    headers: {
      'Content-Type': avatar.type,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
async function setVersion(request: Request, version: number | null) {
  const session = decodeSession(accountToken(request))!;
  const user = await supabase<AuthUser>('/auth/v1/user', {
    method: 'PUT',
    token: session.access,
    body: { data: { avatar_version: version } },
  });
  const account = accountFromUser(user);
  return Response.json(
    { account },
    {
      headers: {
        ...privateHeaders,
        'Set-Cookie': sessionCookie(encodeSession({ ...session, account })),
      },
    },
  );
}
export async function PUT(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem inválida.' }, { status: 403, headers: privateHeaders });
  const account = await currentAccount(request);
  if (!account) return unauthorized();
  if (!allowRequest('avatar:' + account.id, 10, 900000))
    return Response.json(
      { error: 'Aguarde alguns minutos antes de trocar a foto de novo.' },
      { status: 429, headers: privateHeaders },
    );
  if (Number(request.headers.get('content-length') || 0) > AVATAR_MAX_BYTES)
    return Response.json({ error: 'Foto muito grande.' }, { status: 413, headers: privateHeaders });
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > AVATAR_MAX_BYTES)
      return Response.json(
        { error: 'Foto muito grande.' },
        { status: 413, headers: privateHeaders },
      );
    const type = avatarType(request.headers.get('content-type'), bytes);
    if (!type)
      return Response.json(
        { error: 'Use uma imagem JPG, PNG ou WebP.' },
        { status: 415, headers: privateHeaders },
      );
    await saveAvatar(account.id, bytes, type);
    return await setVersion(request, Date.now());
  } catch (error) {
    return Response.json(
      { error: publicError(error, 'Não foi possível salvar a foto.') },
      { status: 503, headers: privateHeaders },
    );
  }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem inválida.' }, { status: 403, headers: privateHeaders });
  const account = await currentAccount(request);
  if (!account) return unauthorized();
  try {
    await removeAvatar(account.id);
    return await setVersion(request, null);
  } catch (error) {
    return Response.json(
      { error: publicError(error, 'Não foi possível remover a foto.') },
      { status: 503, headers: privateHeaders },
    );
  }
}
