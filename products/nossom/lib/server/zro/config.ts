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
export const ZRO_SCOPES = 'openid email profile org offline_access ' + ZRO_IA_SCOPE;

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
