import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import type { Account } from '../accounts';
import { supabase, supabaseConfig, SupabaseError } from './supabase';
export const ACCOUNT_COOKIE = 'nossom-account';
export const ADMIN_EMAIL = 'victorbarrosoc@gmail.com';
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
type Session = { account: Account; access: string; refresh: string; expires: number; sid: string };
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
    isAdmin: email === ADMIN_EMAIL && !!user.email_confirmed_at,
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
      typeof session.expires !== 'number'
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
export function accountFromToken(token: string | undefined) {
  const s = decodeSession(token);
  return s && s.expires > Date.now() ? s.account : null;
}
const verified = new WeakMap<Request, Promise<Account | null>>();
export function currentAccount(request: Request): Promise<Account | null> {
  let result = verified.get(request);
  if (!result) {
    result = (async () => {
      const session = decodeSession(accountToken(request));
      if (!accountConfigured() || !session || session.expires <= Date.now()) return null;
      try {
        return accountFromUser(
          await supabase<AuthUser>('/auth/v1/user', { token: session.access }),
        );
      } catch {
        return null;
      }
    })();
    verified.set(request, result);
  }
  return result;
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
      return { account: accountFromUser(user), token: token! };
    }
    const data = await supabase<ProviderSession>('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh },
    });
    return {
      account: accountFromUser(data.user),
      token: encodeSession(sessionFromProvider(data, session.sid)),
    };
  } catch (error) {
    return sessionRejected(error) ? null : 'unavailable';
  }
}
export async function authenticate(
  action: 'register' | 'login',
  email: unknown,
  password: unknown,
  name: unknown,
  origin: string,
) {
  if (
    typeof email !== 'string' ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  )
    throw new Error('Informe um e-mail válido.');
  if (
    typeof password !== 'string' ||
    password.length < (action === 'register' ? 8 : 1) ||
    password.length > 128
  )
    throw new Error('Use uma senha entre 8 e 128 caracteres.');
  if (
    action === 'register' &&
    (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60)
  )
    throw new Error('Use um nome entre 2 e 60 caracteres.');
  try {
    const data = await supabase<ProviderSession>(
      action === 'register'
        ? '/auth/v1/signup?redirect_to=' + encodeURIComponent(origin + '/auth/confirm')
        : '/auth/v1/token?grant_type=password',
      {
        method: 'POST',
        body: {
          email: email.trim().toLowerCase(),
          password,
          ...(action === 'register' ? { data: { name: (name as string).trim() } } : {}),
        },
      },
    );
    if (!data.access_token) return { confirmationRequired: true };
    // Resolve trusted identity through GoTrue, never through a client-supplied role/profile.
    data.user = await supabase<AuthUser>('/auth/v1/user', { token: data.access_token });
    return { account: accountFromUser(data.user), token: encodeSession(sessionFromProvider(data)) };
  } catch (error) {
    if (error instanceof SupabaseError) {
      if (error.code === 'email_not_confirmed')
        throw new Error('Confirme seu e-mail para entrar. Confira também a pasta de spam.');
      if (error.status === 429) throw new Error('Muitas tentativas. Aguarde alguns minutos.');
      if (action === 'register')
        throw new Error(
          'Não foi possível criar a conta. Confira os dados ou tente entrar com seu e-mail.',
        );
      throw new Error('E-mail ou senha inválidos.');
    }
    throw error;
  }
}
