import { randomUUID } from 'node:crypto';
import {
  encodeSession,
  sessionCookie,
  sessionFromProvider,
  type AuthUser,
} from '../../lib/server/account';
import type { ZroRelease } from '../../lib/server/release';
export const testUser: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'teste@example.test',
  email_confirmed_at: '2026-10-22T00:00:00Z',
  user_metadata: { name: 'Pessoa Teste' },
};
/** A conta na lista do proprietário (`allowed` no HUB): a única que usa o NOSSOM fechado ao público. */
export const allowedClaims = {
  zroProducts: ['nossom'],
  zroRelease: { nossom: 'allowed' } as ZroRelease,
};
/**
 * Cookie de sessão de teste. Sem `claims`, uma conta sem vínculo com a Absolute ZRO (só entra com
 * `RELEASE=released`); com `allowedClaims`, a conta autorizada.
 */
export function testCookie(
  user = testUser,
  sid = randomUUID(),
  claims: {
    zroProducts?: string[];
    zroRelease?: ZroRelease;
    /** Identidade guardada do vínculo; `admin` = admin da plataforma (claim `zro_admin`). */
    zro?: { email: string; organization: string | null; manage?: string; admin?: true };
  } = {},
) {
  return sessionCookie(
    encodeSession({
      ...sessionFromProvider(
        {
          user,
          access_token: 'test-access-placeholder',
          refresh_token: 'test-refresh-placeholder',
          expires_in: 3600,
        },
        sid,
      ),
      ...claims,
    }),
  ).split(';')[0];
}
/**
 * Variáveis de ambiente dos testes de conta. `release` é o estado local do lançamento (lib/server/release.ts):
 * os testes de mecânica da sessão rodam com `released`; os do bloqueio pedem `closed`, o padrão de produção.
 */
export function authEnvironment(release: 'released' | 'closed' = 'released') {
  const keys = [
    'NOSSOM_AUTH_SECRET',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'ANTHROPIC_API_KEY',
    'RELEASE',
  ];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.NOSSOM_AUTH_SECRET = 'unit-tests-secret-placeholder-only';
  process.env.SUPABASE_URL = 'https://supabase.example.test';
  process.env.SUPABASE_ANON_KEY = 'public-test-placeholder';
  process.env.ANTHROPIC_API_KEY = 'anthropic-test-placeholder';
  process.env.RELEASE = release;
  return () => {
    for (const k of keys)
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
  };
}
