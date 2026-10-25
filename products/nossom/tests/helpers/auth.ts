import { randomUUID } from 'node:crypto';
import {
  encodeSession,
  sessionCookie,
  sessionFromProvider,
  type AuthUser,
} from '../../lib/server/account';
export const testUser: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'teste@example.test',
  email_confirmed_at: '2026-10-22T00:00:00Z',
  user_metadata: { name: 'Pessoa Teste' },
};
export function testCookie(user = testUser, sid = randomUUID()) {
  return sessionCookie(
    encodeSession(
      sessionFromProvider(
        {
          user,
          access_token: 'test-access-placeholder',
          refresh_token: 'test-refresh-placeholder',
          expires_in: 3600,
        },
        sid,
      ),
    ),
  ).split(';')[0];
}
export function authEnvironment() {
  const keys = ['NOSSOM_AUTH_SECRET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ANTHROPIC_API_KEY'];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.NOSSOM_AUTH_SECRET = 'unit-tests-secret-placeholder-only';
  process.env.SUPABASE_URL = 'https://supabase.example.test';
  process.env.SUPABASE_ANON_KEY = 'public-test-placeholder';
  process.env.ANTHROPIC_API_KEY = 'anthropic-test-placeholder';
  return () => {
    for (const k of keys)
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
  };
}
