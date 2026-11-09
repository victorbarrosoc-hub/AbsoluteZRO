import { NextResponse, type NextRequest } from 'next/server';
import { ACCOUNT_COOKIE, refreshAccount, sessionCookie } from './lib/server/account';
import { nossomClosed } from './lib/server/release';
import { cabecalhosIrmao, caminhoIrmao, origemIrma, preVoo } from './lib/server/irmaos';
import {
  chaveConfere,
  chavePrevia,
  emPrevia,
  PREVIA_COOKIE,
  PREVIA_ERRO,
  previaCookie,
  selo,
} from './lib/server/previa';

/** Rotas de conta que continuam respondendo com o NOSSOM fechado: entrar, sair, quem sou, ligar/desligar a Absolute ZRO. */
const ACCOUNT_API = /^\/api\/(?:account(?:\/|$)|zro\/(?:entrar|conta)$)/;
/** A página neutra (HTTP 200, endereço preservado): sem marca, nome ou explicação do app. */
const DEV_PAGE = '/em-desenvolvimento';
/**
 * Fechado, as páginas do site (inicial, apps, baixar, entrar...) não mostram nada do NOSSOM a quem não tem acesso: vão
 * para a Absolute ZRO (titular, 01/11/2026: app não lançado não aparece em lugar nenhum, nem como "em desenvolvimento").
 * A conta liberada (`allowed` no HUB: a administração da plataforma) entra pelo Abrir do HUB (/api/zro/entrar).
 */
export const FORA = 'https://absolutezro.com';

const closedJson = () =>
  NextResponse.json(
    { error: 'Indisponível.', code: 'product_closed' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );

const paraFora = (before?: string) => {
  const response = NextResponse.redirect(FORA, 307);
  response.headers.set('Cache-Control', 'no-store');
  if (before) response.headers.append('Set-Cookie', sessionCookie(null));
  return response;
};

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // App irmão (o AEON) pedindo a separação de faixas pelo navegador da pessoa (lib/server/irmaos.ts): o pré-voo do
  // CORS responde aqui, sem sessão; as respostas de verdade (inclusive o 403 de fechado) levam o CORS dele.
  if (request.method === 'OPTIONS') return preVoo(request, path);
  const irma = caminhoIrmao(path) ? origemIrma(request) : null;
  const response = await responder(request, path);
  if (irma) for (const [k, v] of Object.entries(cabecalhosIrmao(irma))) response.headers.set(k, v);
  return response;
}

/**
 * GET /previa?chave=… (lib/server/previa.ts). Porta desligada (sem ZRO_CHAVE_PREVIA): segue como antes (404). Chave
 * certa: o cookie com o HMAC e o estúdio (303). Chave errada: o mesmo de qualquer página fechada (a Absolute ZRO).
 */
async function portaDaPrevia(request: NextRequest) {
  const chave = chavePrevia();
  if (request.method !== 'GET' || !chave) return NextResponse.next();
  if (!chaveConfere(request.nextUrl.searchParams.get('chave'))) return paraFora();
  const response = NextResponse.redirect(new URL('/studio', request.url), 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.append('Set-Cookie', previaCookie(await selo(chave)));
  return response;
}

/** Na prévia, sem conta: páginas e estúdio abrem; o que depende de serviço responde 503; "Sair" apaga o cookie. */
function naPrevia(request: NextRequest, path: string) {
  if (!path.startsWith('/api/')) return NextResponse.next();
  if (path === '/api/account' && request.method === 'DELETE') {
    const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.headers.append('Set-Cookie', previaCookie(null));
    return response;
  }
  return NextResponse.json(
    { error: PREVIA_ERRO, code: 'previa' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

async function responder(request: NextRequest, path: string) {
  if (path === '/previa') return portaDaPrevia(request);
  // Prévia do titular (team grátis): só sem conta; a conta de verdade, quando existe, segue o caminho de sempre.
  if (
    !request.cookies.get(ACCOUNT_COOKIE)?.value &&
    (await emPrevia(request.cookies.get(PREVIA_COOKIE)?.value))
  )
    return naPrevia(request, path);
  const api = path.startsWith('/api/');
  const studio = path === '/studio' || path.startsWith('/studio/');
  // Página do site (não API nem estúdio): aberto, segue como sempre (pública).
  const pagina = !api && !studio;
  if (pagina && !nossomClosed()) return NextResponse.next();
  const before = request.cookies.get(ACCOUNT_COOKIE)?.value;
  // Fechado e sem sessão: a página nem consulta o Supabase.
  if (pagina && !before) return paraFora();
  const session = await refreshAccount(before);
  // A transient Auth failure must not sign everyone out: keep the cookie and let the route decide.
  // Fechado, uma página do site não arrisca: sem confirmar a conta, vai para a Absolute ZRO (sem apagar o cookie).
  if (session === 'unavailable') return pagina ? paraFora() : NextResponse.next();
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
    const fechado =
      nossomClosed() && session.account.zroBlocked && !(api && ACCOUNT_API.test(path));
    const response = !fechado
      ? NextResponse.next({ request: { headers } })
      : api
        ? closedJson()
        : pagina
          ? paraFora()
          : NextResponse.rewrite(new URL(DEV_PAGE, request.url), { request: { headers } });
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
  // Fechado: nada de tela de entrar do NOSSOM para quem chega sem conta; a Absolute ZRO.
  if (nossomClosed()) return paraFora(before);
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
    // O Set (presença e conversas da Absolute ZRO): o mesmo portão da Z, fechado só para a conta liberada.
    '/api/zro/set',
    '/api/zro/set/:path*',
    // Fechado ao público (28/10/2026): GPU/jobs, catálogo de planos e administração só com conta autorizada.
    // O cron de limpeza (/api/audio/cleanup, CRON_SECRET) e o webhook assinado da Stripe ficam fora: não são
    // canais de uso.
    '/api/audio/jobs',
    '/api/audio/jobs/:path*',
    '/api/plans',
    '/api/admin',
    '/api/admin/:path*',
    // As páginas do site: fechado, só a conta liberada as vê; o resto vai para a Absolute ZRO (01/11/2026).
    '/',
    '/apps',
    '/baixar',
    '/baixar/:path*',
    '/entrar',
    '/em-desenvolvimento',
    '/privacidade',
    '/auth/:path*',
    '/opengraph-image',
    '/manifest.webmanifest',
    // Prévia do titular no team grátis (lib/server/previa.ts); sem ZRO_CHAVE_PREVIA, segue como antes.
    '/previa',
  ],
};
