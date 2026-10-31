/**
 * "Continuar com Absolute ZRO": a NOSSOM é cliente do login único da Absolute ZRO (OpenID Connect,
 * código + PKCE S256, cliente confidencial `nossom-web`). Sem ZRO_CLIENT_ID e ZRO_CLIENT_SECRET o
 * botão não aparece e o site segue igual.
 */
import { accountConfigured } from '../account';
import { requestOrigin } from '../ai-access';

export const ZRO_ISSUER_DEFAULT = 'https://absolutezro.com';
/** `offline_access` mantém a conversa com a Z depois dos 10 minutos do access token; `zro.ia` abre a API da IA. */
export const ZRO_IA_SCOPE = 'zro.ia';
/**
 * `zro.set`: o Set (presença e conversas do ecossistema, ADR 0032 da Absolute ZRO), pelo repasse /api/zro/set. A
 * Absolute ZRO de antes do Set recusa o escopo (invalid_scope): o callback refaz o pedido sem ele, uma vez.
 */
export const ZRO_SET_SCOPE = 'zro.set';
export const ZRO_SCOPES_SEM_SET = 'openid email profile org offline_access ' + ZRO_IA_SCOPE;
export const ZRO_SCOPES = ZRO_SCOPES_SEM_SET + ' ' + ZRO_SET_SCOPE;

export function zroIssuer() {
  return (process.env.ZRO_ISSUER?.trim() || ZRO_ISSUER_DEFAULT).replace(/\/$/, '');
}

/** O botão só aparece com as credenciais do cliente e com as contas da NOSSOM prontas. */
export function zroConfigured() {
  return (
    !!process.env.ZRO_CLIENT_ID?.trim() &&
    !!process.env.ZRO_CLIENT_SECRET?.trim() &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
    accountConfigured()
  );
}

export function zroCredentials() {
  const clientId = process.env.ZRO_CLIENT_ID?.trim(),
    clientSecret = process.env.ZRO_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('Faltam ZRO_CLIENT_ID e ZRO_CLIENT_SECRET.');
  return { clientId, clientSecret };
}

/** Retorno cadastrado na Absolute ZRO: o endereço do próprio site + /api/zro/callback. */
export function zroRedirectUri(request: Request) {
  return requestOrigin(request) + '/api/zro/callback';
}

/** Caminho relativo seguro para voltar depois do login; o padrão é o estúdio. */
export function zroReturnPath(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length > 2000 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\r\n\t]/.test(value) ||
    /^\/api(?:\/|$)/.test(value)
  )
    return '/studio';
  return value;
}

/**
 * Perfil único: nome, foto e e-mail se editam na conta Absolute ZRO (claim `zro_conta`), nunca no
 * NOSSOM. Só vale endereço https do próprio emissor; sem ele, o Perfil da Absolute ZRO.
 */
export const ZRO_PROFILE_DEFAULT = ZRO_ISSUER_DEFAULT + '/perfil';
function fromIssuer(value: unknown, path: RegExp): string | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const url = new URL(value),
      issuer = new URL(zroIssuer());
    return url.protocol === 'https:' &&
      url.origin === issuer.origin &&
      !url.username &&
      !url.password &&
      !url.search &&
      path.test(url.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function zroManageUrl(claim?: unknown) {
  return (
    fromIssuer(claim, /^\/perfil(?:\/[a-z-]*)?$/) ??
    fromIssuer(zroIssuer() + '/perfil', /^\/perfil$/) ??
    ZRO_PROFILE_DEFAULT
  );
}
/** Foto da conta (claim `picture`): só o endereço público de fotos do emissor (/api/v1/foto/…). */
export function zroPictureUrl(claim: unknown) {
  return fromIssuer(claim, /^\/api\/v1\/foto\/[A-Za-z0-9_-]{8,128}$/);
}
