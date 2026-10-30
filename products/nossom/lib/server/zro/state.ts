/**
 * Cookie da ida para a Absolute ZRO: state + verificador PKCE + nonce + modo + volta, cifrado e
 * autenticado (AES-256-GCM, chave derivada de NOSSOM_AUTH_SECRET), só em /api/zro, 10 minutos.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { sessionSecret } from '../account';

export const ZRO_COOKIE = 'nossom-zro';
export const ZRO_COOKIE_SECONDS = 600;

export type ZroMode = 'login' | 'link';
export type ZroState = {
  state: string;
  verifier: string;
  nonce: string;
  mode: ZroMode;
  userId: string | null;
  next: string;
  /** O pedido já saiu sem `zro.set` (a Absolute ZRO recusou o escopo uma vez). */
  semSet?: boolean;
  /** "Criar conta" (prompt=create), para refazer o mesmo pedido sem `zro.set`. */
  create?: boolean;
  expires: number;
};

function key() {
  if (sessionSecret().length < 16) throw new Error('O acesso está temporariamente indisponível.');
  return createHmac('sha256', sessionSecret()).update('nossom:zro-state-v1').digest();
}

export function sealZroState(value: Omit<ZroState, 'expires'>) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(ZRO_COOKIE));
  const data = JSON.stringify({ ...value, expires: Date.now() + ZRO_COOKIE_SECONDS * 1000 });
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}

export function openZroState(token: string | undefined): ZroState | null {
  if (!token || token.length > 4000) return null;
  try {
    const [version, iv, value, tag, extra] = token.split('.');
    if (version !== 'v1' || !iv || !value || !tag || extra) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(ZRO_COOKIE));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const state = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(value, 'base64url')),
        decipher.final(),
      ]).toString(),
    ) as ZroState;
    if (
      typeof state.state !== 'string' ||
      typeof state.verifier !== 'string' ||
      typeof state.nonce !== 'string' ||
      typeof state.next !== 'string' ||
      (state.mode !== 'login' && state.mode !== 'link') ||
      (state.mode === 'link' && typeof state.userId !== 'string') ||
      typeof state.expires !== 'number' ||
      state.expires < Date.now()
    )
      return null;
    return state;
  } catch {
    return null;
  }
}

export function zroStateCookie(value: string | null, secure: boolean) {
  return `${ZRO_COOKIE}=${value ?? ''}; HttpOnly; SameSite=Lax; Path=/api/zro; Max-Age=${value ? ZRO_COOKIE_SECONDS : 0}${secure ? '; Secure' : ''}`;
}
