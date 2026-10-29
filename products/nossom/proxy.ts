import { NextResponse, type NextRequest } from 'next/server';
import { ACCOUNT_COOKIE, refreshAccount, sessionCookie } from './lib/server/account';
import { nossomClosed } from './lib/server/release';

/** Rotas de conta que continuam respondendo com o NOSSOM fechado: entrar, sair, quem sou, ligar/desligar a Absolute ZRO. */
const ACCOUNT_API = /^\/api\/(?:account(?:\/|$)|zro\/(?:entrar|conta)$)/;
/** A página institucional "Em desenvolvimento" (HTTP 200, endereço preservado). */
const DEV_PAGE = '/em-desenvolvimento';

const closedJson = () =>
  NextResponse.json(
    { error: 'O NOSSOM está em desenvolvimento.', code: 'product_closed' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const api = path.startsWith('/api/');
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
    // Fechado ao público e sem direito de uso (`temAcesso`): estúdio vira "Em desenvolvimento" (200) e as
    // APIs do produto respondem 403, antes de qualquer rota. As rotas de conta seguem para sair ou entrar de novo.
    const response =
      nossomClosed() && session.account.zroBlocked && !(api && ACCOUNT_API.test(path))
        ? api
          ? closedJson()
          : NextResponse.rewrite(new URL(DEV_PAGE, request.url), { request: { headers } })
        : NextResponse.next({ request: { headers } });
    if (session.token !== before)
      response.headers.append('Set-Cookie', sessionCookie(session.token));
    return response;
  }
  if (api) {
    // Sem conta: fechado, as APIs do produto nem chegam à rota (403); as de conta continuam (401 lá dentro).
    const response = nossomClosed() && !ACCOUNT_API.test(path) ? closedJson() : NextResponse.next();
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
    // Fechado ao público (28/10/2026): GPU/jobs, catálogo de planos e administração só com conta autorizada.
    // O cron de limpeza (/api/audio/cleanup, CRON_SECRET) e o webhook assinado da Stripe ficam fora: não são
    // canais de uso.
    '/api/audio/jobs',
    '/api/audio/jobs/:path*',
    '/api/plans',
    '/api/admin',
    '/api/admin/:path*',
  ],
};
