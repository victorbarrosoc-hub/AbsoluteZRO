/**
 * Conta Absolute ZRO ligada a uma conta NOSSOM (nossom_private.zro_links, só pelo servidor).
 * - Entrar: a pessoa ZRO (`sub`) já ligada entra na conta NOSSOM dela.
 * - Primeira vez, sem conta NOSSOM no e-mail: cria a conta (só com e-mail confirmado pela ZRO).
 * - E-mail que já tem conta NOSSOM: nunca liga sozinho. A pessoa entra como sempre e liga a
 *   Absolute ZRO em Minha conta.
 * Tudo aqui usa a service role, só no servidor; nada chega ao navegador.
 */
import type { AuthUser, ProviderSession } from '../account';
import { supabase, supabaseConfig, SupabaseError } from '../supabase';
import type { ZroProfile } from './oidc';

function service() {
  const config = supabaseConfig(),
    key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config || !key) throw new Error('O acesso está temporariamente indisponível.');
  return { url: config.url, key };
}

async function serviceCall<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const { url, key } = service();
  const response = await fetch(url + path, {
    method,
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new SupabaseError(response.status, error.error_code || error.code || 'provider_error');
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

type LinkResult = { ok?: true; error?: 'other_account' | 'already_linked' | 'only_login' };
const rpc = <T>(action: string, args: { user?: string; sub?: string; data?: unknown }) =>
  serviceCall<T>('/rest/v1/rpc/nossom_zro_link', 'POST', {
    p_action: action,
    p_user: args.user ?? null,
    p_sub: args.sub ?? null,
    p_data: args.data ?? {},
  });
const profileData = (p: ZroProfile, createdByZro = false) => ({
  email: p.email,
  organization: p.organization,
  products: p.products,
  createdByZro,
});

/** Dono NOSSOM da pessoa ZRO, ou null. Atualiza e-mail, organização e produtos guardados. */
export async function linkedUser(p: ZroProfile): Promise<string | null> {
  const result = await rpc<{ userId: string | null }>('find', { sub: p.sub, data: profileData(p) });
  return typeof result?.userId === 'string' ? result.userId : null;
}

export type LinkError = 'zro_outra_conta' | 'zro_ja_ligada';
/** Liga a Absolute ZRO à conta de quem está logado (Minha conta). */
export async function linkZro(
  userId: string,
  p: ZroProfile,
  createdByZro = false,
): Promise<{ ok: true } | { ok: false; error: LinkError }> {
  const result = await rpc<LinkResult>('link', {
    user: userId,
    sub: p.sub,
    data: profileData(p, createdByZro),
  });
  if (result?.error === 'other_account') return { ok: false, error: 'zro_outra_conta' };
  if (result?.error === 'already_linked') return { ok: false, error: 'zro_ja_ligada' };
  if (!result?.ok) throw new Error('Não foi possível ligar a Absolute ZRO.');
  return { ok: true };
}

export type CreateError = 'zro_email_nao_verificado' | 'zro_email_em_uso';
export async function createAccountWithZro(
  p: ZroProfile,
): Promise<{ ok: true; userId: string } | { ok: false; error: CreateError }> {
  // Conta nova só com e-mail confirmado pela Absolute ZRO: ninguém cria conta no e-mail de outra pessoa.
  if (!p.emailVerified) return { ok: false, error: 'zro_email_nao_verificado' };
  let user: AuthUser;
  try {
    user = await serviceCall<AuthUser>('/auth/v1/admin/users', 'POST', {
      email: p.email,
      email_confirm: true,
      user_metadata: { name: p.name || p.email.split('@')[0].slice(0, 60) },
    });
  } catch (error) {
    // O e-mail já tem conta NOSSOM: não toma a conta pelo e-mail.
    if (
      error instanceof SupabaseError &&
      (error.code === 'email_exists' ||
        error.code === 'user_already_exists' ||
        error.status === 409 ||
        error.status === 422)
    )
      return { ok: false, error: 'zro_email_em_uso' };
    throw error;
  }
  if (!user?.id || !/^[a-f0-9-]{36}$/i.test(user.id))
    throw new Error('Não foi possível criar a conta.');
  let linked: Awaited<ReturnType<typeof linkZro>> | null = null;
  try {
    linked = await linkZro(user.id, p, true);
  } finally {
    // Sem a ligação a conta nova ficaria sem senha e sem como entrar: desfaz.
    if (!linked?.ok)
      await serviceCall('/auth/v1/admin/users/' + user.id, 'DELETE').catch(() => undefined);
  }
  if (!linked?.ok) return { ok: false, error: 'zro_email_em_uso' };
  return { ok: true, userId: user.id };
}

/**
 * Sessão Supabase para a conta ligada, sem senha: link mágico gerado pela Admin API (não envia
 * e-mail) e confirmado aqui mesmo pelo token_hash. Devolve a sessão como o login com senha.
 */
export async function sessionForUser(userId: string): Promise<ProviderSession> {
  const user = await serviceCall<AuthUser>('/auth/v1/admin/users/' + userId);
  if (user?.id !== userId || !user.email) throw new Error('Conta inválida.');
  const link = await serviceCall<{
    hashed_token?: string;
    properties?: { hashed_token?: string };
  }>('/auth/v1/admin/generate_link', 'POST', { type: 'magiclink', email: user.email });
  const tokenHash = link?.properties?.hashed_token || link?.hashed_token;
  if (!tokenHash) throw new Error('Não foi possível entrar.');
  const data = await supabase<ProviderSession>('/auth/v1/verify', {
    method: 'POST',
    body: { type: 'magiclink', token_hash: tokenHash },
  });
  if (!data?.access_token || !data.refresh_token) throw new Error('Não foi possível entrar.');
  // A identidade vem do GoTrue com o token novo, como no login com senha.
  data.user = await supabase<AuthUser>('/auth/v1/user', { token: data.access_token });
  if (data.user?.id !== userId) throw new Error('Não foi possível confirmar sua identidade.');
  return data;
}

export type ZroLink = {
  email: string;
  organization: string | null;
  products: string[];
  createdByZro: boolean;
  linkedAt: string;
  lastLoginAt: string | null;
};
export async function zroLinkOf(userId: string): Promise<ZroLink | null> {
  return (await rpc<{ link: ZroLink | null }>('get', { user: userId }))?.link ?? null;
}

/**
 * Produtos liberados (`zro_products`) guardados no vínculo, ou null para conta sem vínculo.
 * Sem o cliente da Absolute ZRO configurado não há vínculo a conferir.
 */
export async function zroProductsOf(userId: string): Promise<string[] | null> {
  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    !process.env.ZRO_CLIENT_ID?.trim() ||
    !process.env.ZRO_CLIENT_SECRET?.trim()
  )
    return null;
  const link = await zroLinkOf(userId);
  if (!link) return null;
  return Array.isArray(link.products)
    ? link.products.filter((p): p is string => typeof p === 'string')
    : [];
}

/** Desliga. Conta criada pela Absolute ZRO (sem senha) não desliga: ficaria sem como entrar. */
export async function unlinkZro(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: 'zro_unico_login' }> {
  const result = await rpc<LinkResult>('unlink', { user: userId });
  if (result?.error === 'only_login') return { ok: false, error: 'zro_unico_login' };
  if (!result?.ok) throw new Error('Não foi possível desligar a Absolute ZRO.');
  return { ok: true };
}
