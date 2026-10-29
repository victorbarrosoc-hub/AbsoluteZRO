import { createHmac, timingSafeEqual } from 'node:crypto';
import { accountConfigured, currentAccount, sessionSecret } from './account';
const attempts = new Map<string, { count: number; reset: number }>();
export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY && accountConfigured();
}
export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('host') || url.host;
  if (!/^[a-zA-Z0-9.:[\]\-]+$/.test(host)) return url.origin;
  return new URL(url.protocol + '//' + host).origin;
}
export function sameOrigin(request: Request) {
  return request.headers.get('origin') === requestOrigin(request);
}
function signature(value: string) {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}
export function cookieValue(request: Request, name: string) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + '='))
    ?.slice(name.length + 1);
}
export function signToken(scope: string, data: Record<string, unknown>) {
  const value = Buffer.from(JSON.stringify({ ...data, expires: Date.now() + 3600000 })).toString(
    'base64url',
  );
  return `${value}.${signature(scope + ':' + value)}`;
}
export function readToken(
  scope: string,
  token: string | undefined,
): Record<string, unknown> | null {
  if (!accountConfigured() || !token || token.length > 4000) return null;
  const [value, sig, extra] = token.split('.');
  if (!value || !sig || extra) return null;
  const expected = Buffer.from(signature(scope + ':' + value)),
    actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const result = JSON.parse(Buffer.from(value, 'base64url').toString());
    return typeof result?.expires === 'number' &&
      result.expires > Date.now() &&
      result.expires <= Date.now() + 3601000
      ? result
      : null;
  } catch {
    return null;
  }
}
export async function authorized(request: Request) {
  return aiConfigured() && !!(await currentAccount(request));
}
export function allowRequest(key: string, limit = 20, period = 3600000) {
  const now = Date.now();
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
  const entry = attempts.get(key);
  if (!entry || entry.reset < now) {
    attempts.set(key, { count: 1, reset: now + period });
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}
/** Tests run many requests as one account in one process; production never calls this. */
export function resetRequestLimits() {
  attempts.clear();
}
export const privateHeaders = { 'Cache-Control': 'no-store' };
// Our own errors carry Portuguese messages for the person; runtime and network errors
// (fetch failed, timeouts, aborts) stay internal and become the fallback.
export function publicError(error: unknown, fallback: string) {
  if (
    !(error instanceof Error) ||
    error instanceof TypeError ||
    error instanceof SyntaxError ||
    error instanceof RangeError ||
    error.name === 'AbortError' ||
    error.name === 'TimeoutError'
  )
    return fallback;
  return error.message;
}
