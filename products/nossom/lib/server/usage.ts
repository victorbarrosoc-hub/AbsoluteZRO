import { accessToken, currentAccount } from './account';
import { supabase, SupabaseError } from './supabase';
import type { AudioUsage } from '../usage';
export async function audioUsage(
  request: Request,
  requestId?: string,
  operation?: string,
): Promise<AudioUsage> {
  if (!(await currentAccount(request))) throw new Error('Entre novamente para continuar.');
  return supabase<AudioUsage>('/rest/v1/rpc/nossom_plan_usage', {
    method: 'POST',
    token: accessToken(request),
    // Local finishing does not consume GPU minutes. Only a server-claimed cloud
    // job can reserve its duration, read authoritatively from the database.
    body: { p_request_id: operation === 'auto' ? requestId || null : null },
  });
}
/** Durable daily cap on new assistant conversations, enforced in PostgreSQL per account. */
export async function aiSessionAllowed(request: Request): Promise<boolean> {
  try {
    const result = await supabase<{ allowed: boolean }>('/rest/v1/rpc/nossom_ai_session', {
      method: 'POST',
      token: accessToken(request),
      body: {},
    });
    return result.allowed === true;
  } catch (error) {
    // Until the migration is applied PostgREST reports the function as missing (404):
    // keep the per-instance limit only. Any other failure denies a new paid session.
    return error instanceof SupabaseError && error.status === 404;
  }
}
