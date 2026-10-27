import {
  accountToken,
  currentAccount,
  decodeSession,
  encodeSession,
  sessionCookie,
} from '@/lib/server/account';
import { allowRequest, privateHeaders, sameOrigin } from '@/lib/server/ai-access';
import { forgetIaTokens } from '@/lib/server/zro/ia';
import { zroConfigured } from '@/lib/server/zro/config';
import { unlinkZro, zroLinkOf } from '@/lib/server/zro/accounts';
import { zroMessage } from '@/lib/zro-messages';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Absolute ZRO ligada à conta de quem está logado (Minha conta). */
export async function GET(request: Request) {
  const account = await currentAccount(request);
  if (!account)
    return Response.json(
      { error: 'Entre novamente na sua conta.' },
      { status: 401, headers: privateHeaders },
    );
  if (!zroConfigured())
    return Response.json({ configured: false, link: null }, { headers: privateHeaders });
  try {
    const link = await zroLinkOf(account.id);
    return Response.json(
      {
        configured: true,
        link: link && {
          email: link.email,
          organization: link.organization,
          onlyLogin: link.createdByZro,
          lastLoginAt: link.lastLoginAt,
        },
      },
      { headers: privateHeaders },
    );
  } catch {
    return Response.json(
      { error: 'Não deu para ver a Absolute ZRO agora.' },
      { status: 503, headers: privateHeaders },
    );
  }
}

/** Desliga a Absolute ZRO; recusa quando ela é o único jeito de entrar. */
export async function DELETE(request: Request) {
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
  if (!allowRequest('zro-unlink:' + account.id, 10, 900000))
    return Response.json(
      { error: 'Aguarde alguns minutos.' },
      { status: 429, headers: privateHeaders },
    );
  try {
    const result = await unlinkZro(account.id);
    if (!result.ok)
      return Response.json(
        { error: zroMessage(result.error) },
        { status: 409, headers: privateHeaders },
      );
    // Sem vínculo, a conta volta a ser como antes da Absolute ZRO.
    const headers = new Headers(privateHeaders);
    headers.append('Set-Cookie', await forgetIaTokens(request));
    const session = decodeSession(accountToken(request));
    if (session?.zroProducts) {
      const { zroProducts: _, ...rest } = session;
      headers.append('Set-Cookie', sessionCookie(encodeSession(rest)));
    }
    return Response.json({ unlinked: true }, { headers });
  } catch {
    return Response.json(
      { error: 'Não deu para desligar agora. Tente de novo.' },
      { status: 503, headers: privateHeaders },
    );
  }
}
