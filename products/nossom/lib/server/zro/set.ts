/**
 * O Set da Absolute ZRO (presença e conversas do ecossistema, ADR 0032 de lá) dentro do NOSSOM, por repasse no
 * servidor. O widget `<zro-set api="/api/zro/set">` fala só com o NOSSOM; este repasse confere a sessão NOSSOM, usa o
 * MESMO token da Z (cookie cifrado `nossom-zro-ia`, Path=/api/zro, renovado pela mesma fila `refreshOnce`) e
 * encaminha para `<emissor>/api/v1/set/*` com `Authorization: Bearer`. Nenhum token vai para o navegador, para log ou
 * para a resposta; o texto das mensagens também não vai a log.
 *
 * - Só os caminhos e métodos da API do Set passam (`setTarget`); o resto é 404.
 * - Leitura com ETag: o If-None-Match do widget segue e o 304 (sem corpo) volta.
 * - Sem token, token sem `zro.set` (login de antes do Set) ou recusado lá: 401 e o widget some. Diferente da Z, o
 *   cookie NÃO é apagado aqui: o mesmo token continua valendo para a Z.
 * - "saiu" (ao fechar a página) com o token vencido não renova: o pedido vai sem esperar resposta.
 */
import { currentAccount } from '../account';
import { allowRequest, cookieValue, privateHeaders, sameOrigin } from '../ai-access';
import { ZRO_SET_SCOPE, zroConfigured, zroIssuer } from './config';
import { iaCookies, openIaTokens, refreshOnce, sealIaTokens, secureRequest, ZRO_IA_COOKIE } from './ia';

const MAX_BODY = 20_000;
const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ROUTES: [RegExp, string[]][] = [
  [/^$/, ['GET', 'POST']],
  [/^preferencias$/, ['PUT']],
  [/^contatos$/, ['GET', 'POST']],
  [new RegExp(`^contatos/${ID}$`, 'i'), ['PUT', 'DELETE']],
  [/^bloqueios$/, ['POST']],
  [new RegExp(`^bloqueios/${ID}$`, 'i'), ['DELETE']],
  [/^conversas$/, ['GET', 'POST']],
  [new RegExp(`^conversas/${ID}$`, 'i'), ['GET', 'PATCH']],
  [new RegExp(`^conversas/${ID}/mensagens$`, 'i'), ['POST']],
  [new RegExp(`^mensagens/${ID}$`, 'i'), ['PATCH', 'DELETE']],
  [/^denuncias$/, ['POST']],
];
/** A ETag fraca da API do Set (W/"…"): só ela vai e volta. */
const ETAG = /^W\/"[A-Za-z0-9_-]{1,64}"$/;

export const hasSetScope = (scope: string) => scope.split(/\s+/).includes(ZRO_SET_SCOPE);

/** O caminho da API do Set (sem barra no começo) que pode passar com este método; senão null. */
export function setTarget(parts: string[], method: string): string | null {
  const path = parts.join('/');
  if (parts.some((p) => !p || p === '.' || p === '..')) return null;
  const route = ROUTES.find(([re]) => re.test(path));
  return route && route[1].includes(method) ? path : null;
}

/** Só os números de leitura da conversa seguem. */
function query(request: Request, path: string, method: string) {
  if (method !== 'GET' || !/^conversas\/[^/]+$/.test(path)) return '';
  const q = new URL(request.url).searchParams,
    out = new URLSearchParams();
  for (const k of ['antes', 'depois', 'limite']) {
    const v = q.get(k);
    if (v && /^\d{1,15}$/.test(v)) out.set(k, v);
  }
  const s = out.toString();
  return s ? '?' + s : '';
}

const json = (status: number, body: Record<string, unknown>, cookies: string[] = []) => {
  const headers = new Headers({ ...privateHeaders, 'Content-Type': 'application/json' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(JSON.stringify(body), { status, headers });
};
const semSet = (cookies: string[] = []) =>
  json(401, { error: 'zro_set_login', message: 'Entre com a conta Absolute ZRO para ver o Set.' }, cookies);

/** /api/zro/set[/…] → <emissor>/api/v1/set[/…] com o token da conta, sem expor o token. */
export async function proxySet(request: Request, parts: string[]): Promise<Response> {
  const method = request.method.toUpperCase();
  const path = setTarget(parts, method);
  if (path === null) return json(404, { error: 'not_found', message: 'Caminho desconhecido.' });
  // O cookie vai sozinho com o navegador: mudanças só da própria origem, e só JSON.
  if (method !== 'GET' && !sameOrigin(request))
    return json(403, { error: 'origin', message: 'Origem não autorizada.' });
  const withBody = method !== 'GET' && method !== 'DELETE';
  if (withBody && !/^application\/json\b/i.test(request.headers.get('content-type') || ''))
    return json(415, { error: 'formato', message: 'Mande JSON.' });
  // Sem o login ligado aqui: o widget some (401), sem tentar de novo a cada batida.
  if (!zroConfigured()) return semSet();
  const account = await currentAccount(request);
  if (!account) return semSet();
  if (!allowRequest('zro-set:' + account.id, 900, 600000))
    return json(429, { error: 'devagar', message: 'Muitos pedidos seguidos. Aguarde um pouco.' });

  let saved = openIaTokens(cookieValue(request, ZRO_IA_COOKIE));
  if (!saved || saved.user !== account.id || !hasSetScope(saved.scope)) return semSet();

  let body: string | undefined;
  if (withBody) {
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY)
      return json(413, { error: 'grande', message: 'Mensagem grande demais.' });
    body = await request.text();
    if (body.length > MAX_BODY) return json(413, { error: 'grande', message: 'Mensagem grande demais.' });
  }

  const cookies: string[] = [];
  if (saved.expires < Date.now() + 60_000) {
    let leaving = false;
    try {
      leaving = path === '' && method === 'POST' && JSON.parse(body || '{}')?.estado === 'saiu';
    } catch {
      leaving = false;
    }
    if (leaving) return new Response(null, { status: 204, headers: privateHeaders });
    if (!saved.refresh) return semSet();
    let fresh;
    try {
      fresh = await refreshOnce(saved.refresh);
    } catch {
      return json(503, { error: 'zro_rede', message: 'A Absolute ZRO não respondeu. Tente de novo.' });
    }
    if (!fresh) return semSet();
    saved = { ...fresh, scope: fresh.scope || saved.scope, user: account.id };
    cookies.push(...iaCookies(sealIaTokens(account.id, saved), secureRequest(request)));
  }

  const asked = request.headers.get('if-none-match') || '';
  let upstream: Response;
  try {
    upstream = await fetch(zroIssuer() + '/api/v1/set' + (path ? '/' + path : '') + query(request, path, method), {
      method,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
      headers: {
        Authorization: 'Bearer ' + saved.access,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method === 'GET' && asked.length <= 200 && ETAG.test(asked) ? { 'If-None-Match': asked } : {}),
      },
      ...(body !== undefined ? { body } : {}),
    });
  } catch {
    return json(503, { error: 'zro_rede', message: 'A Absolute ZRO não respondeu. Tente de novo.' }, cookies);
  }
  // Login de antes do Set (token sem zro.set) ou acesso recusado: o widget some; o cookie fica para a Z.
  if (upstream.status === 401) {
    await upstream.body?.cancel().catch(() => undefined);
    return semSet(cookies);
  }
  const headers = new Headers({ ...privateHeaders });
  const type = upstream.headers.get('content-type');
  if (type) headers.set('Content-Type', type);
  const etag = upstream.headers.get('etag');
  if (etag && ETAG.test(etag)) headers.set('ETag', etag);
  for (const c of cookies) headers.append('Set-Cookie', c);
  const empty = upstream.status === 204 || upstream.status === 304;
  if (empty) await upstream.body?.cancel().catch(() => undefined);
  return new Response(empty ? null : await upstream.arrayBuffer(), { status: upstream.status, headers });
}
