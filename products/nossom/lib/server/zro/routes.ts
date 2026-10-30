/**
 * Lógica de /api/zro/entrar e /api/zro/callback (as rotas só repassam o Request).
 * Erros voltam como ?erro=<código>; os textos ficam em lib/zro-messages.ts.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  accountToken,
  currentAccount,
  decodeSession,
  encodeSession,
  sessionCookie,
  sessionFromProvider,
  zroIdentity,
} from '../account';
import { allowRequest, cookieValue } from '../ai-access';
import { nossomClosed, temAcesso } from '../release';
import { zroConfigured, zroIssuer, zroRedirectUri, zroReturnPath } from './config';
import {
  adoptByEmail,
  createAccountWithZro,
  linkedUser,
  linkZro,
  sessionForUser,
} from './accounts';
import { iaCookieFor } from './ia';
import {
  authorizationUrl,
  exchangeCodeWithTokens,
  randomValue,
  type ZroProfile,
  type ZroTokens,
} from './oidc';
import { openZroState, sealZroState, ZRO_COOKIE, zroStateCookie, type ZroMode } from './state';

const SETTINGS = '/studio/conta';

export function withParam(path: string, key: string, value: string) {
  const url = new URL(path, 'https://nossom.invalid');
  url.searchParams.set(key, value);
  return url.pathname + url.search + url.hash;
}

function redirect(request: Request, location: string, status: number, cookies: string[] = []) {
  const headers = new Headers({
    Location: new URL(location, request.url).toString(),
    'Cache-Control': 'no-store',
  });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status, headers });
}

function errorPath(mode: ZroMode, next: string, code: string) {
  if (mode === 'link') return withParam(SETTINGS, 'erro', code);
  const base = withParam('/entrar', 'erro', code);
  return next !== '/studio' ? withParam(base, 'next', next) : base;
}

const secureCookie = (request: Request) =>
  process.env.NODE_ENV === 'production' || new URL(request.url).protocol === 'https:';

const sameValue = (a: string | null, b: string) =>
  !!a && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * GET /api/zro/entrar?volta=/studio&modo=ligar|criar → 302 para a Absolute ZRO.
 * `modo=criar` é o único caminho de conta nova: pede ao HUB a tela de criar conta
 * (`prompt=create`); a volta é a mesma do login (vínculo existente entra, senão cria).
 */
export async function startZro(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const requested = url.searchParams.get('modo');
  const mode: ZroMode = requested === 'ligar' ? 'link' : 'login';
  const create = requested === 'criar';
  const semSet = url.searchParams.get('sem_set') === '1';
  const next = zroReturnPath(url.searchParams.get('volta') ?? (mode === 'link' ? SETTINGS : null));
  if (!zroConfigured()) return redirect(request, errorPath(mode, next, 'zro_config'), 303);
  const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  if (!allowRequest('zro-start:' + ip, 30, 900000))
    return redirect(request, errorPath(mode, next, 'zro_devagar'), 303);
  let userId: string | null = null;
  if (mode === 'link') {
    const account = await currentAccount(request);
    if (!account) return redirect(request, withParam('/entrar', 'next', SETTINGS), 303);
    userId = account.id;
  }
  const state = randomValue(),
    nonce = randomValue(),
    verifier = randomValue();
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  let destination: string;
  try {
    destination = await authorizationUrl({
      state,
      nonce,
      challenge,
      redirectUri: zroRedirectUri(request),
      ...(create ? { prompt: 'create' as const } : {}),
      ...(semSet ? { semSet: true } : {}),
    });
  } catch {
    return redirect(request, errorPath(mode, next, 'zro_erro'), 303);
  }
  const sealed = sealZroState({
    state,
    verifier,
    nonce,
    mode,
    userId,
    next,
    ...(semSet ? { semSet: true } : {}),
    ...(create ? { create: true } : {}),
  });
  return redirect(request, destination, 302, [zroStateCookie(sealed, secureCookie(request))]);
}

/** GET /api/zro/callback → 303 para a volta (sessão nova) ou ?erro=<código>. */
export async function finishZro(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const clear = zroStateCookie(null, secureCookie(request));
  const go = (path: string, cookies: string[] = []) =>
    redirect(request, path, 303, [clear, ...cookies]);
  const saved = openZroState(cookieValue(request, ZRO_COOKIE));
  if (!saved || !zroConfigured()) return go(withParam('/entrar', 'erro', 'zro_expirou'));
  const { mode, next } = saved;
  const fail = (code: string) => go(errorPath(mode, next, code));
  if (!sameValue(url.searchParams.get('state'), saved.state)) return fail('zro_expirou');
  // RFC 9207: a resposta diz quem a emitiu; confere antes de usar o código.
  if (url.searchParams.get('iss') !== zroIssuer()) return fail('zro_erro');
  const providerError = url.searchParams.get('error');
  // Absolute ZRO de antes do Set: recusa `zro.set`. O mesmo pedido sem ele, uma vez; o login não quebra.
  if (providerError === 'invalid_scope' && !saved.semSet) {
    const modo = mode === 'link' ? 'ligar' : saved.create ? 'criar' : null;
    return go(
      '/api/zro/entrar?' +
        new URLSearchParams({ ...(modo ? { modo } : {}), volta: next, sem_set: '1' }).toString(),
    );
  }
  if (providerError) return fail(providerError === 'access_denied' ? 'zro_recusado' : 'zro_erro');
  const code = url.searchParams.get('code');
  if (!code || code.length > 2000) return fail('zro_erro');

  let profile: ZroProfile, tokens: ZroTokens | null;
  try {
    ({ profile, tokens } = await exchangeCodeWithTokens(
      code,
      saved.verifier,
      saved.nonce,
      zroRedirectUri(request),
    ));
  } catch {
    return fail('zro_erro');
  }

  try {
    if (mode === 'link') {
      const account = await currentAccount(request);
      if (!account || account.id !== saved.userId)
        return go(withParam('/entrar', 'next', SETTINGS));
      const linked = await linkZro(account.id, profile);
      if (!linked.ok) return fail(linked.error);
      // Mesma sessão, agora com os produtos e o estado do lançamento na Absolute ZRO (podem bloquear o NOSSOM).
      const current = decodeSession(accountToken(request));
      // O token da Z (escopo zro.ia) fica guardado para esta conta: "Conectar" no painel passa por aqui.
      return go(withParam(next, 'zro', 'ok'), [
        ...(current
          ? [
              sessionCookie(
                encodeSession({
                  ...current,
                  zroProducts: profile.products,
                  zroRelease: profile.release,
                  zro: zroIdentity(profile),
                }),
              ),
            ]
          : []),
        ...iaCookieFor(request, account.id, tokens),
      ]);
    }
    // O vínculo existente guarda a claim nova antes de qualquer decisão.
    let userId = await linkedUser(profile);
    // Fechado ao público: sem `allowed` no HUB não nasce conta nem sessão (nada do dispositivo muda).
    if (
      nossomClosed() &&
      !temAcesso({ zroProducts: profile.products, zroRelease: profile.release })
    )
      return fail('zro_fechado');
    // Conta `allowed` com e-mail confirmado e uma conta NOSSOM antiga no mesmo e-mail: liga, em vez de "e-mail
    // em uso" (o login com senha está fechado; sem isso o proprietário não entraria na própria conta).
    if (!userId) userId = await adoptByEmail(profile);
    if (!userId) {
      const created = await createAccountWithZro(profile);
      if (!created.ok) return fail(created.error);
      userId = created.userId;
    }
    // Os produtos e o estado do lançamento vêm do id_token; sem direito de uso, a conta entra bloqueada.
    const session = {
      ...sessionFromProvider(await sessionForUser(userId)),
      zroProducts: profile.products,
      zroRelease: profile.release,
      zro: zroIdentity(profile),
    };
    // Uma sessão anterior neste navegador é trocada pela da conta ligada.
    return go(next, [
      sessionCookie(encodeSession(session)),
      ...iaCookieFor(request, userId, tokens),
    ]);
  } catch {
    return fail('zro_erro');
  }
}
