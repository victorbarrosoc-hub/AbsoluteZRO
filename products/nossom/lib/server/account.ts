import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import type { Account } from '../accounts';
import {
  AccessClosedError,
  nossomClosed,
  readZroRelease,
  temAcesso,
  ZRO_PRODUCT,
  type ZroRelease,
} from './release';
import { supabase, supabaseConfig, SupabaseError } from './supabase';
import { zroLinkReady, zroLinkSummary, type ZroLinkSummary } from './zro/accounts';
import { zroManageUrl } from './zro/config';
export { ZRO_PRODUCT };
export const ACCOUNT_COOKIE = 'nossom-account';
// Admin do NOSSOM (não é acesso ao produto, que vem do gate do HUB). O endereço novo vale junto com o antigo até a
// troca de e-mail da conta do titular (28/10/2026).
export const ADMIN_EMAIL = 'victorbarrosoc@gmail.com';
const ADMIN_EMAILS = new Set([ADMIN_EMAIL, 'victor@absolutezro.com']);
const lifetime = 7 * 24 * 60 * 60 * 1000;
export type AuthUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  user_metadata?: { name?: string; full_name?: string; avatar_version?: unknown };
};
export type ProviderSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  user: AuthUser;
};
type Session = {
  account: Account;
  access: string;
  refresh: string;
  expires: number;
  sid: string;
  /**
   * `zro_products` guardados no vínculo com a Absolute ZRO (relidos no login, em cada renovação e em cada
   * pedido à API). Ausente = conta sem vínculo ZRO.
   */
  zroProducts?: string[];
  /**
   * `zro_release` guardada no vínculo: o estado do NOSSOM para esta conta no HUB (`allowed` = fechado, mas na
   * lista do proprietário). Ausente = vínculo anterior à claim ou conta sem vínculo (lib/server/release.ts).
   */
  zroRelease?: ZroRelease;
  /** Quem é na Absolute ZRO (perfil único): e-mail, organização, foto e onde editar. */
  zro?: ZroIdentity;
};
type ZroIdentity = {
  email: string;
  organization: string | null;
  picture?: string;
  manage?: string;
};
/** Identidade da Absolute ZRO guardada na sessão, a partir do id_token já conferido. */
export function zroIdentity(p: {
  email: string;
  organization: string | null;
  picture: string | null;
  manage: string;
}): ZroIdentity {
  return {
    email: p.email,
    organization: p.organization,
    ...(p.picture ? { picture: p.picture } : {}),
    manage: p.manage,
  };
}
const validIdentity = (z: unknown) =>
  !!z &&
  typeof z === 'object' &&
  typeof (z as ZroIdentity).email === 'string' &&
  ((z as ZroIdentity).organization === null ||
    typeof (z as ZroIdentity).organization === 'string') &&
  ['undefined', 'string'].includes(typeof (z as ZroIdentity).picture) &&
  ['undefined', 'string'].includes(typeof (z as ZroIdentity).manage);
const validRelease = (r: unknown) =>
  !!r &&
  typeof r === 'object' &&
  !Array.isArray(r) &&
  Object.entries(r as Record<string, unknown>).every(
    ([key, value]) =>
      typeof key === 'string' && ['released', 'closed', 'allowed'].includes(value as string),
  );
/**
 * Sessão sem direito de usar o NOSSOM. A decisão é só de `temAcesso` (lib/server/release.ts): fechado ao
 * público, abre apenas para a conta `allowed` no HUB; aberto, segue `zro_products`.
 */
export function zroBlocked(session: Pick<Session, 'zroProducts' | 'zroRelease'>) {
  return !temAcesso(session);
}
/**
 * Conta para a tela: `zroBlocked` sem o NOSSOM liberado; `zro` (perfil único) quando ligada à
 * Absolute ZRO; `zroInvite` quando dá para ligar e ainda não ligou.
 */
function withAccess(session: Session, account = session.account): Account {
  const { zroBlocked: _, zro: _zro, zroInvite: _invite, ...plain } = account;
  const z = session.zro;
  return {
    ...plain,
    ...(zroBlocked(session) ? { zroBlocked: true as const } : {}),
    ...(Array.isArray(session.zroProducts)
      ? {
          zro: {
            ...(z?.email ? { email: z.email } : {}),
            ...(z?.organization ? { organization: z.organization } : {}),
            ...(z?.picture ? { picture: z.picture } : {}),
            manage: z?.manage || zroManageUrl(),
          },
        }
      : zroLinkReady()
        ? { zroInvite: true as const }
        : {}),
  };
}
export function sessionSecret() {
  return process.env.NOSSOM_AUTH_SECRET || process.env.NOSSOM_AI_ACCESS_CODE || '';
}
export function accountConfigured() {
  return sessionSecret().length >= 16 && !!supabaseConfig();
}
function key() {
  if (sessionSecret().length < 16) throw new Error('O acesso está temporariamente indisponível.');
  return createHmac('sha256', sessionSecret()).update('nossom:supabase-session-v2').digest();
}
export function accountFromUser(user: AuthUser): Account {
  if (!/^[a-f0-9-]{36}$/i.test(user.id) || !user.email) throw new Error('Conta inválida.');
  const email = user.email.toLowerCase();
  const suppliedName = user.user_metadata?.name || user.user_metadata?.full_name;
  const name =
    (typeof suppliedName === 'string' ? suppliedName : email.split('@')[0]).trim().slice(0, 60) ||
    'Criador';
  return {
    id: user.id,
    name,
    username: email,
    email,
    kind: 'supabase',
    isAdmin: ADMIN_EMAILS.has(email ?? '') && !!user.email_confirmed_at,
    ...(typeof user.user_metadata?.avatar_version === 'number' &&
    Number.isSafeInteger(user.user_metadata.avatar_version) &&
    (user.user_metadata?.avatar_version as number) > 0
      ? { avatar: user.user_metadata?.avatar_version as number }
      : {}),
  };
}
export function sessionFromProvider(data: ProviderSession, sid: string = randomUUID()): Session {
  if (!data.access_token || !data.refresh_token)
    throw new Error('Confirme seu e-mail antes de entrar.');
  return {
    account: accountFromUser(data.user),
    access: data.access_token,
    refresh: data.refresh_token,
    expires: Math.min(
      Date.now() + 3600000,
      data.expires_at ? data.expires_at * 1000 : Date.now() + (data.expires_in || 3600) * 1000,
    ),
    sid,
  };
}
export function encodeSession(session: Session) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(ACCOUNT_COOKIE));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()]);
  return [
    'v2',
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}
export function decodeSession(token: string | undefined): Session | null {
  if (!token || token.length > 16000) return null;
  try {
    const [version, iv, value, tag, extra] = token.split('.');
    if (version !== 'v2' || !iv || !value || !tag || extra) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(ACCOUNT_COOKIE));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const session = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(value, 'base64url')),
        decipher.final(),
      ]).toString(),
    ) as Session;
    if (
      session.account?.kind !== 'supabase' ||
      !/^[a-f0-9-]{36}$/i.test(session.account.id) ||
      typeof session.access !== 'string' ||
      typeof session.refresh !== 'string' ||
      typeof session.sid !== 'string' ||
      typeof session.expires !== 'number' ||
      (session.zroProducts !== undefined &&
        (!Array.isArray(session.zroProducts) ||
          !session.zroProducts.every((p) => typeof p === 'string'))) ||
      (session.zroRelease !== undefined && !validRelease(session.zroRelease)) ||
      (session.zro !== undefined && !validIdentity(session.zro))
    )
      return null;
    return session;
  } catch {
    return null;
  }
}
export function sessionCookie(token: string | null) {
  // Supabase access tokens and refresh tokens stay encrypted in an HttpOnly cookie.
  const value = token ? encodeURIComponent(token) : '';
  if (value.length > 3800)
    throw new Error('Esta conta retornou uma sessão grande demais. Contate o suporte.');
  return `${ACCOUNT_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? lifetime / 1000 : 0}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
export function accountToken(request: Request) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(ACCOUNT_COOKIE + '='))
    ?.slice(ACCOUNT_COOKIE.length + 1);
}
/** Conta do cookie (sem ir ao Supabase). Traz `zroBlocked` quando o NOSSOM não está liberado. */
export function accountFromToken(token: string | undefined) {
  const s = decodeSession(token);
  return s && s.expires > Date.now() ? withAccess(s) : null;
}
/**
 * A sessão com o vínculo relido: `zro_products`, `zro_release`, e-mail e organização. Sem vínculo, a sessão
 * volta a ser só do NOSSOM. Se o banco não responder agora, fica com o que já estava na sessão.
 */
async function withLink(session: Session, userId: string): Promise<Session> {
  let link: ZroLinkSummary | null;
  try {
    link = await zroLinkSummary(userId);
  } catch {
    return session;
  }
  const { zroProducts: _products, zroRelease: _release, zro: _zro, ...plain } = session;
  if (!link) return plain;
  return {
    ...plain,
    zroProducts: link.products,
    zroRelease: link.release,
    // A foto e o "onde editar" vêm do último login pela Absolute ZRO; e-mail e organização, do vínculo.
    zro: {
      ...session.zro,
      email: link.email,
      organization: link.organization,
      manage: session.zro?.manage || zroManageUrl(),
    },
  };
}
const sameClaims = (a: Session, b: Session) =>
  JSON.stringify([a.zroProducts, a.zroRelease, a.zro]) ===
  JSON.stringify([b.zroProducts, b.zroRelease, b.zro]);
const verified = new WeakMap<Request, Promise<Account | null>>();
/**
 * Quem está logado, conferido no Supabase e com o vínculo relido a cada pedido, com `zroBlocked` quando
 * `temAcesso` nega. Só para dizer à tela quem entrou; as funções usam `currentAccount`.
 */
export function signedInAccount(request: Request): Promise<Account | null> {
  let result = verified.get(request);
  if (!result) {
    result = (async () => {
      const session = decodeSession(accountToken(request));
      if (!accountConfigured() || !session || session.expires <= Date.now()) return null;
      try {
        const account = accountFromUser(
          await supabase<AuthUser>('/auth/v1/user', { token: session.access }),
        );
        // Toda API sensível relê o vínculo: a lista do proprietário vale na hora, não só na renovação.
        return withAccess(await withLink(session, account.id), account);
      } catch {
        return null;
      }
    })();
    verified.set(request, result);
  }
  return result;
}
/** Conta com direito de uso: sem conta, ou com o NOSSOM fora de `zro_products`, é null. */
export async function currentAccount(request: Request): Promise<Account | null> {
  const account = await signedInAccount(request);
  return account && !account.zroBlocked ? account : null;
}
export function accountSessionOwner(request: Request) {
  const session = decodeSession(accountToken(request));
  if (!session || session.expires <= Date.now())
    throw new Error('Entre na sua conta para conversar.');
  return createHash('sha256')
    .update(session.account.id + ':' + session.sid)
    .digest('hex');
}
export function accessToken(request: Request) {
  return decodeSession(accountToken(request))?.access;
}
// Only a definitive rejection from Auth ends the session; outages and timeouts keep the cookie.
function sessionRejected(error: unknown) {
  return (
    error instanceof SupabaseError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}
export async function refreshAccount(
  token: string | undefined,
): Promise<{ account: Account; token: string } | null | 'unavailable'> {
  const session = decodeSession(token);
  if (!session || !accountConfigured()) return null;
  try {
    if (session.expires > Date.now() + 60000) {
      const user = await supabase<AuthUser>('/auth/v1/user', { token: session.access });
      // Sessão ainda válida: relê o vínculo mesmo assim, para a lista do proprietário valer já no próximo pedido.
      const fresh = await withLink({ ...session, account: accountFromUser(user) }, user.id);
      return {
        account: withAccess(fresh),
        token: sameClaims(fresh, session) ? token! : encodeSession(fresh),
      };
    }
    const data = await supabase<ProviderSession>('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh },
    });
    // A cada renovação, relê o vínculo com a Absolute ZRO (produtos e estado do lançamento).
    const refreshed = await withLink(
      { ...session, ...sessionFromProvider(data, session.sid) },
      data.user.id,
    );
    return { account: withAccess(refreshed), token: encodeSession(refreshed) };
  } catch (error) {
    return sessionRejected(error) ? null : 'unavailable';
  }
}
/**
 * Login com e-mail e senha de uma conta que já existe no Supabase Auth.
 * Conta nova não nasce aqui: só pela Absolute ZRO (`/api/zro/entrar?modo=criar`).
 */
export async function authenticate(email: unknown, password: unknown) {
  if (
    typeof email !== 'string' ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  )
    throw new Error('Informe um e-mail válido.');
  if (typeof password !== 'string' || password.length < 1 || password.length > 128)
    throw new Error('Informe sua senha.');
  try {
    const data = await supabase<ProviderSession>('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), password },
    });
    if (!data.access_token) throw new Error('Confirme seu e-mail para entrar.');
    // Resolve trusted identity through GoTrue, never through a client-supplied role/profile.
    data.user = await supabase<AuthUser>('/auth/v1/user', { token: data.access_token });
    // Conta ligada à Absolute ZRO: guarda os produtos liberados na sessão. Sem vínculo, nada muda.
    let link: Awaited<ReturnType<typeof zroLinkSummary>>;
    try {
      link = await zroLinkSummary(data.user.id);
    } catch {
      throw new Error('O acesso está temporariamente indisponível. Tente de novo.');
    }
    const session: Session = {
      ...sessionFromProvider(data),
      ...(link
        ? {
            zroProducts: link.products,
            zroRelease: link.release,
            zro: { email: link.email, organization: link.organization, manage: zroManageUrl() },
          }
        : {}),
    };
    // Fechado ao público: login próprio recusado, salvo a conta `allowed` no HUB (nenhum cookie sai).
    if (nossomClosed() && !temAcesso(session)) throw new AccessClosedError();
    return { account: withAccess(session), token: encodeSession(session) };
  } catch (error) {
    if (error instanceof SupabaseError) {
      if (error.code === 'email_not_confirmed')
        throw new Error('Confirme seu e-mail para entrar. Confira também a pasta de spam.');
      if (error.status === 429) throw new Error('Muitas tentativas. Aguarde alguns minutos.');
      throw new Error('E-mail ou senha inválidos.');
    }
    throw error;
  }
}
