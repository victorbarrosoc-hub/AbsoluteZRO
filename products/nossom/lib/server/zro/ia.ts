/**
 * A Z (a IA da Absolute ZRO) dentro do NOSSOM, por repasse no servidor.
 *
 * O login com a Absolute ZRO devolve um access token com o escopo `zro.ia` (10 minutos) e um refresh token. Os dois
 * ficam só aqui: num cookie próprio, cifrado e autenticado (AES-256-GCM, chave derivada de NOSSOM_AUTH_SECRET),
 * HttpOnly, preso à conta NOSSOM que entrou e enviado só para /api/zro (o repasse da Z e o do Set, 30/10/2026; antes
 * só /api/zro/ia: o cookie antigo nesse caminho é apagado em toda gravação, para nunca haver dois refresh tokens). O painel `<zro-ia api="/api/zro/ia">`
 * chama este repasse; ele confere a sessão NOSSOM, renova o token quando precisa e encaminha para
 * `<emissor>/api/v1/ia/*` com `Authorization: Bearer`. A resposta (NDJSON em streaming) passa sem buffer.
 * Sem token, token de outra conta, sem `zro.ia` ou recusado pela Absolute ZRO: 401, e o painel pede para conectar.
 * Nenhum token vai para o navegador, para log ou para a resposta.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { currentAccount, sessionSecret } from '../account';
import { allowRequest, cookieValue, privateHeaders, sameOrigin } from '../ai-access';
import { ZRO_IA_SCOPE, zroConfigured, zroIssuer } from './config';
import { refreshZroTokens, revokeZroToken, type ZroTokens } from './oidc';

export const ZRO_IA_COOKIE = 'nossom-zro-ia';
/** O caminho do cookie: os dois repasses que usam o token (/api/zro/ia e /api/zro/set). */
export const ZRO_IA_PATH = '/api/zro';
/** O caminho de antes do Set: o cookie que estiver lá sai em toda gravação (um token só por conta). */
const ZRO_IA_LEGACY_PATH = '/api/zro/ia';
const COOKIE_SECONDS = 30 * 24 * 3600;
const MAX_BODY = 64_000;

type Saved = ZroTokens & { user: string };

function key() {
  if (sessionSecret().length < 16) throw new Error('O acesso está temporariamente indisponível.');
  return createHmac('sha256', sessionSecret()).update('nossom:zro-ia-v1').digest();
}

export function sealIaTokens(user: string, tokens: ZroTokens) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(ZRO_IA_COOKIE));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({ ...tokens, user } satisfies Saved)),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}

export function openIaTokens(token: string | undefined): Saved | null {
  if (!token || token.length > 12000) return null;
  try {
    const [version, iv, value, tag, extra] = token.split('.');
    if (version !== 'v1' || !iv || !value || !tag || extra) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(ZRO_IA_COOKIE));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const saved = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(value, 'base64url')),
        decipher.final(),
      ]).toString(),
    ) as Saved;
    if (
      typeof saved.user !== 'string' ||
      typeof saved.access !== 'string' ||
      typeof saved.expires !== 'number' ||
      typeof saved.scope !== 'string' ||
      (saved.refresh !== null && typeof saved.refresh !== 'string')
    )
      return null;
    return saved;
  } catch {
    return null;
  }
}

export function iaCookie(value: string | null, secure: boolean) {
  return `${ZRO_IA_COOKIE}=${value ?? ''}; HttpOnly; SameSite=Lax; Path=${ZRO_IA_PATH}; Max-Age=${value ? COOKIE_SECONDS : 0}${secure ? '; Secure' : ''}`;
}

/**
 * Gravar (ou apagar) o cookie do token: o de agora em /api/zro e o antigo de /api/zro/ia apagado junto. Sem isso o
 * navegador mandaria os dois para /api/zro/ia (o mais específico primeiro) e um refresh token velho seria reusado,
 * o que derruba a família inteira na Absolute ZRO.
 */
export function iaCookies(value: string | null, secure: boolean) {
  return [
    iaCookie(value, secure),
    `${ZRO_IA_COOKIE}=; HttpOnly; SameSite=Lax; Path=${ZRO_IA_LEGACY_PATH}; Max-Age=0${secure ? '; Secure' : ''}`,
  ];
}

export const secureRequest = (request: Request) =>
  process.env.NODE_ENV === 'production' || new URL(request.url).protocol === 'https:';

/** Cookie da Z para a conta que acabou de entrar, ou nada quando a Absolute ZRO não liberou `zro.ia`. */
export function iaCookieFor(request: Request, user: string, tokens: ZroTokens | null) {
  if (!tokens || !hasIaScope(tokens.scope)) return iaCookies(null, secureRequest(request));
  return iaCookies(sealIaTokens(user, tokens), secureRequest(request));
}

/** Ao sair: apaga o cookie e revoga o refresh token na Absolute ZRO (sem esperar por ela além de 5 s). */
export async function forgetIaTokens(request: Request) {
  const saved = openIaTokens(cookieValue(request, ZRO_IA_COOKIE));
  if (saved?.refresh && zroConfigured()) await revokeZroToken(saved.refresh).catch(() => undefined);
  return iaCookies(null, secureRequest(request));
}

export const hasIaScope = (scope: string) => scope.split(/\s+/).includes(ZRO_IA_SCOPE);

// Uma renovação por refresh token por vez nesta instância (a Z e o Set juntos): o refresh gira e reuso derruba a família.
const refreshing = new Map<string, Promise<ZroTokens | null>>();
export function refreshOnce(refresh: string) {
  const id = createHash('sha256').update(refresh).digest('base64url');
  let pending = refreshing.get(id);
  if (!pending) {
    pending = refreshZroTokens(refresh).finally(() =>
      setTimeout(() => refreshing.delete(id), 30_000),
    );
    refreshing.set(id, pending);
  }
  return pending;
}

/** Caminhos e métodos que a API da IA do HUB expõe; o resto não sai daqui. */
export function iaTarget(parts: string[], method: string): string | null {
  const [first, second, ...rest] = parts;
  if (rest.length) return null;
  if (first === 'estado' && !second && method === 'GET') return '/estado';
  if (first === 'conversas' && !second && method === 'GET') return '/conversas';
  if (
    first === 'conversas' &&
    second &&
    /^[A-Za-z0-9-]{1,100}$/.test(second) &&
    (method === 'GET' || method === 'DELETE')
  )
    return '/conversas/' + second;
  if (first === 'mensagens' && !second && method === 'POST') return '/mensagens';
  return null;
}

const json = (status: number, body: Record<string, unknown>, cookies: string[] = []) => {
  const headers = new Headers({ ...privateHeaders, 'Content-Type': 'application/json' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(JSON.stringify(body), { status, headers });
};

const needsLogin = (cookies: string[] = []) =>
  json(
    401,
    { error: 'zro_ia_login', message: 'Conecte sua conta Absolute ZRO para conversar com a Z.' },
    cookies,
  );

/** /api/zro/ia/* → <emissor>/api/v1/ia/* com o token da conta, sem expor o token. */
export async function proxyIa(request: Request, parts: string[]): Promise<Response> {
  const method = request.method.toUpperCase();
  const target = iaTarget(parts, method);
  if (!target) return json(404, { error: 'not_found', message: 'Caminho desconhecido.' });
  // O cookie vai sozinho com o navegador: mudanças só da própria origem.
  if (method !== 'GET' && !sameOrigin(request))
    return json(403, { error: 'origin', message: 'Origem não autorizada.' });
  if (!zroConfigured())
    return json(503, { error: 'zro_config', message: 'A Z ainda não está ligada aqui.' });
  const account = await currentAccount(request);
  if (!account) return json(401, { error: 'account', message: 'Entre novamente na sua conta.' });
  if (!allowRequest('zro-ia:' + account.id, 240, 600000))
    return json(429, { error: 'devagar', message: 'Muitos pedidos seguidos. Aguarde um pouco.' });

  const clear = iaCookies(null, secureRequest(request));
  let saved = openIaTokens(cookieValue(request, ZRO_IA_COOKIE));
  // Token de outra conta (troca de conta neste navegador) nunca é usado.
  if (!saved || saved.user !== account.id || !hasIaScope(saved.scope)) return needsLogin(clear);

  const cookies: string[] = [];
  if (saved.expires < Date.now() + 60_000) {
    if (!saved.refresh) return needsLogin(clear);
    let fresh: ZroTokens | null;
    try {
      fresh = await refreshOnce(saved.refresh);
    } catch {
      return json(503, {
        error: 'zro_rede',
        message: 'A Absolute ZRO não respondeu. Tente de novo.',
      });
    }
    if (!fresh || !hasIaScope(fresh.scope || saved.scope)) return needsLogin(clear);
    saved = { ...fresh, scope: fresh.scope || saved.scope, user: account.id };
    cookies.push(...iaCookies(sealIaTokens(account.id, saved), secureRequest(request)));
  }

  let body: string | undefined;
  if (method === 'POST') {
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY)
      return json(413, { error: 'grande', message: 'Mensagem grande demais.' });
    body = await request.text();
    if (body.length > MAX_BODY)
      return json(413, { error: 'grande', message: 'Mensagem grande demais.' });
  }

  let upstream: Response;
  try {
    upstream = await fetch(zroIssuer() + '/api/v1/ia' + target, {
      method,
      cache: 'no-store',
      redirect: 'manual',
      // "Parar" no painel fecha o pedido aqui e lá.
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(150_000)]),
      headers: {
        Authorization: 'Bearer ' + saved.access,
        Accept: 'application/json, application/x-ndjson',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body } : {}),
    });
  } catch {
    return json(
      503,
      { error: 'zro_rede', message: 'A Absolute ZRO não respondeu. Tente de novo.' },
      cookies,
    );
  }
  // Recusado lá (revogado, sem escopo, app removido): o painel pede para conectar de novo.
  if (upstream.status === 401 || upstream.status === 403) {
    await upstream.body?.cancel().catch(() => undefined);
    return needsLogin(clear);
  }
  const headers = new Headers({
    ...privateHeaders,
    'Content-Type': upstream.headers.get('content-type') || 'application/json',
    'X-Accel-Buffering': 'no',
  });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(upstream.body, { status: upstream.status, headers });
}
