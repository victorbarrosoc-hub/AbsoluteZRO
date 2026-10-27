import { NextResponse, type NextRequest } from 'next/server';
import { ACCOUNT_COOKIE, refreshAccount, sessionCookie } from './lib/server/account';
export async function proxy(request: NextRequest) {
  const before = request.cookies.get(ACCOUNT_COOKIE)?.value;
  const session = await refreshAccount(before);
  // A transient Auth failure must not sign everyone out: keep the cookie and let the route decide.
  if (session === 'unavailable') return NextResponse.next();
  if (session) {
    const headers = new Headers(request.headers);
    // Forward a rotated session to Server Components in the same request.
    const cookies = (headers.get('cookie') || '')
      .split(';')
      .filter((c) => !c.trim().startsWith(ACCOUNT_COOKIE + '=') && c.trim());
    cookies.push(ACCOUNT_COOKIE + '=' + session.token);
    headers.set('cookie', cookies.join('; '));
    const response = NextResponse.next({ request: { headers } });
    if (session.token !== before)
      response.headers.append('Set-Cookie', sessionCookie(session.token));
    return response;
  }
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const response = NextResponse.next();
    if (before) response.headers.append('Set-Cookie', sessionCookie(null));
    return response;
  }
  const url = new URL('/entrar', request.url);
  url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  const response = NextResponse.redirect(url);
  if (before) response.headers.append('Set-Cookie', sessionCookie(null));
  return response;
}
export const config = {
  matcher: [
    '/studio/:path*',
    '/api/ai/:path*',
    '/api/usage',
    '/api/account',
    '/api/account/:path*',
    '/api/subscription',
    // Renova a sessão antes de ligar a Absolute ZRO; o callback não passa por aqui.
    '/api/zro/entrar',
    '/api/zro/conta',
    // Painel da Z: a sessão NOSSOM renovada antes do repasse.
    '/api/zro/ia/:path*',
  ],
};
