/**
 * Absolute ZRO e Supabase falsos, em memória, para os testes do "Continuar com Absolute ZRO".
 * A ZRO falsa publica descoberta e JWKS, devolve o código na hora (app da família, sem tela de
 * permissão), confere segredo, PKCE, redirect_uri e uso único do código, e assina o id_token com
 * uma chave ES256 de verdade. `tamper` gera respostas ruins de propósito. O Supabase falso cobre a
 * Admin API, o link mágico, /verify, /user e a função nossom_zro_link (mesmas regras da migração).
 */
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import assert from 'node:assert/strict';

export const ISSUER = 'https://zro.example.test';
export const CLIENT = { clientId: 'nossom-web', clientSecret: 'zro-test-secret-placeholder' };
export const SERVICE_KEY = 'service-role-test-placeholder';

export type ZroPerson = {
  sub: string;
  email: string;
  name: string;
  verified?: boolean;
  org?: string | null;
  products?: string[];
  /**
   * Claim `zro_release` como o HUB manda (contrato de 28/10/2026). Sem ela aqui, a ZRO falsa deduz: `released`
   * quando `nossom` está em `products`, `closed` quando não está.
   */
  release?: Record<string, 'released' | 'closed' | 'allowed'>;
  /** Claims do perfil único (`picture`, `zro_conta`), como o HUB manda. */
  picture?: string;
  conta?: string;
};
export type Tamper = null | 'nonce' | 'aud' | 'iss' | 'signature' | 'redirect-iss';
type User = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  user_metadata: Record<string, unknown>;
  password?: string;
};
type Link = {
  user_id: string;
  zro_sub: string;
  email: string;
  organization: string | null;
  products: string[];
  release: Record<string, string>;
  created_by_zro: boolean;
};

export function startFakes() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'ES256', use: 'sig' };
  const codes = new Map<
    string,
    { challenge: string; redirectUri: string; person: ZroPerson; nonce: string; used: boolean }
  >();
  const users = new Map<string, User>();
  const links = new Map<string, Link>();
  const magic = new Map<string, string>();
  const state = {
    person: null as ZroPerson | null,
    deny: false,
    tamper: null as Tamper,
    exchanges: 0,
    created: 0,
    /** Escopo devolvido no token (um token antigo vinha sem `zro.ia`, ou sem `zro.set`). */
    scope: 'openid email profile org offline_access zro.ia zro.set',
    /** Absolute ZRO de antes do Set: recusa `zro.set` no authorize (invalid_scope) e aceita o pedido sem ele. */
    recusarSet: false,
    /** O escopo pedido no último authorize. */
    pedido: '',
    /** Pedidos que chegaram à API do Set: caminho, método, Authorization, If-None-Match e corpo. */
    set: [] as { path: string; method: string; auth: string | null; inm: string | null; body: string | null }[],
    /** Vida do access token, em segundos. */
    accessLife: 600,
    refreshes: 0,
    revoked: [] as string[],
    /** Pedidos que chegaram à API da IA: caminho, método, Authorization e corpo. */
    ia: [] as { path: string; method: string; auth: string | null; body: string | null }[],
  };
  // access token → pessoa; refresh token → pessoa (gira a cada uso, como na Absolute ZRO).
  const access = new Map<string, ZroPerson>();
  const refresh = new Map<string, { person: ZroPerson; used: boolean }>();
  const issue = (person: ZroPerson) => {
    const at = 'zat_' + randomBytes(12).toString('hex'),
      rt = 'zrt_' + randomBytes(12).toString('hex');
    access.set(at, person);
    refresh.set(rt, { person, used: false });
    return {
      access_token: at,
      refresh_token: rt,
      token_type: 'Bearer',
      expires_in: state.accessLife,
      scope: state.scope,
    };
  };

  const jwt = (claims: Record<string, unknown>, wrongKey = false) => {
    const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = b({ alg: 'ES256', typ: 'JWT', kid: jwk.kid }) + '.' + b(claims);
    const key = wrongKey
      ? generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey
      : privateKey;
    return (
      head +
      '.' +
      sign('sha256', Buffer.from(head), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
    );
  };

  /** O navegador na Absolute ZRO: devolve o endereço de volta para o app. */
  function authorize(location: string) {
    const q = new URL(location).searchParams;
    const back = new URL(q.get('redirect_uri')!);
    back.searchParams.set('state', q.get('state')!);
    back.searchParams.set(
      'iss',
      state.tamper === 'redirect-iss' ? 'https://outro.example' : ISSUER,
    );
    state.pedido = q.get('scope') || '';
    const completo = 'openid email profile org offline_access zro.ia zro.set';
    const semSet = 'openid email profile org offline_access zro.ia';
    if (state.recusarSet && q.get('scope') === completo) back.searchParams.set('error', 'invalid_scope');
    else if (
      q.get('client_id') !== CLIENT.clientId ||
      q.get('code_challenge_method') !== 'S256' ||
      !q.get('nonce') ||
      q.get('scope') !== (state.recusarSet ? semSet : completo)
    )
      back.searchParams.set('error', 'invalid_request');
    else if (state.deny || !state.person) back.searchParams.set('error', 'access_denied');
    else {
      const code = 'zc_' + randomBytes(16).toString('hex');
      codes.set(code, {
        challenge: q.get('code_challenge')!,
        redirectUri: q.get('redirect_uri')!,
        person: state.person,
        nonce: q.get('nonce')!,
        used: false,
      });
      back.searchParams.set('code', code);
    }
    return back;
  }

  function zro(url: URL, init: RequestInit | undefined) {
    if (url.pathname === '/.well-known/openid-configuration')
      return Response.json({
        issuer: ISSUER,
        authorization_endpoint: ISSUER + '/oauth/authorize',
        token_endpoint: ISSUER + '/oauth/token',
        jwks_uri: ISSUER + '/oauth/jwks',
      });
    if (url.pathname === '/oauth/jwks') return Response.json({ keys: [jwk] });
    // O Set: Bearer com `zro.set` no escopo do token (sem ele, 401); leitura com ETag W/"v1" e 304 sem corpo.
    if (url.pathname === '/api/v1/set' || url.pathname.startsWith('/api/v1/set/')) {
      const h = new Headers(init?.headers);
      const auth = h.get('authorization');
      state.set.push({
        path: url.pathname.slice('/api/v1/set'.length) + url.search,
        method: init?.method || 'GET',
        auth,
        inm: h.get('if-none-match'),
        body: init?.body ? String(init.body) : null,
      });
      const person = access.get((auth || '').replace(/^Bearer /, ''));
      if (!person || !state.scope.split(' ').includes('zro.set'))
        return Response.json({ error: 'unauthenticated' }, { status: 401 });
      if ((init?.method || 'GET') === 'GET' && h.get('if-none-match') === 'W/"v1"')
        return new Response(null, { status: 304, headers: { etag: 'W/"v1"' } });
      return Response.json(
        url.pathname === '/api/v1/set' ? { eu: { id: 'eu' }, pessoas: [], naoLidas: 1, pedidos: 0 } : { ok: true },
        { headers: (init?.method || 'GET') === 'GET' ? { etag: 'W/"v1"' } : {} },
      );
    }
    if (url.pathname.startsWith('/api/v1/ia/')) {
      const auth = new Headers(init?.headers).get('authorization');
      state.ia.push({
        path: url.pathname.slice('/api/v1/ia'.length),
        method: init?.method || 'GET',
        auth,
        body: init?.body ? String(init.body) : null,
      });
      const person = access.get((auth || '').replace(/^Bearer /, ''));
      if (!person) return Response.json({ error: 'unauthenticated' }, { status: 401 });
      if (url.pathname === '/api/v1/ia/estado')
        return Response.json({ ligada: true, nome: person.name.split(' ')[0], creditos: null });
      if (url.pathname === '/api/v1/ia/conversas') return Response.json({ conversas: [] });
      if (url.pathname === '/api/v1/ia/mensagens')
        return new Response(
          new ReadableStream({
            start(c) {
              const e = new TextEncoder();
              c.enqueue(
                e.encode(JSON.stringify({ tipo: 'conversa', id: 'c1', titulo: 'Teste' }) + '\n'),
              );
              c.enqueue(e.encode(JSON.stringify({ tipo: 'texto', t: 'Olá' }) + '\n'));
              c.enqueue(
                e.encode(JSON.stringify({ tipo: 'fim', mensagem: 'm1', creditos: 1 }) + '\n'),
              );
              c.close();
            },
          }),
          { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } },
        );
      return Response.json({ ok: true });
    }
    if (url.pathname === '/oauth/revoke' && init?.method === 'POST') {
      state.revoked.push(new URLSearchParams(String(init.body)).get('token') || '');
      return new Response(null, { status: 200 });
    }
    if (url.pathname === '/oauth/token' && init?.method === 'POST') {
      const form = new URLSearchParams(String(init.body));
      const auth = new Headers(init.headers).get('authorization') || '';
      const basic = Buffer.from(auth.replace(/^Basic /, ''), 'base64').toString();
      if (basic !== CLIENT.clientId + ':' + CLIENT.clientSecret)
        return Response.json({ error: 'invalid_client' }, { status: 401 });
      if (form.get('grant_type') === 'refresh_token') {
        const r = refresh.get(form.get('refresh_token') || '');
        if (!r || r.used) return Response.json({ error: 'invalid_grant' }, { status: 400 });
        r.used = true;
        state.refreshes++;
        return Response.json(issue(r.person));
      }
      const c = codes.get(form.get('code') || '');
      if (!c || c.used) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      c.used = true;
      const challenge = createHash('sha256')
        .update(form.get('code_verifier') || '')
        .digest('base64url');
      if (challenge !== c.challenge || form.get('redirect_uri') !== c.redirectUri)
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      state.exchanges++;
      const now = Math.floor(Date.now() / 1000),
        t = state.tamper;
      return Response.json({
        ...issue(c.person),
        id_token: jwt(
          {
            iss: t === 'iss' ? 'https://outro.example' : ISSUER,
            sub: c.person.sub,
            aud: t === 'aud' ? 'outro-app' : CLIENT.clientId,
            iat: now,
            exp: now + 600,
            auth_time: now,
            nonce: t === 'nonce' ? 'nonce-errado' : c.nonce,
            email: c.person.email,
            email_verified: c.person.verified !== false,
            name: c.person.name,
            zro_org: c.person.org ? { id: 'org-1', name: c.person.org, role: 'owner' } : null,
            zro_products: c.person.products ?? [],
            zro_release:
              c.person.release ??
              (c.person.products?.includes('nossom')
                ? { nossom: 'released' }
                : { nossom: 'closed' }),
            ...(c.person.picture ? { picture: c.person.picture } : {}),
            ...(c.person.conta ? { zro_conta: c.person.conta } : {}),
          },
          t === 'signature',
        ),
      });
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  function linkRpc(body: {
    p_action: string;
    p_user: string | null;
    p_sub: string | null;
    p_data: Record<string, unknown>;
  }) {
    const data = body.p_data || {};
    const fields = {
      email: String(data.email || '').toLowerCase(),
      organization: (data.organization as string) || null,
      products: (data.products as string[]) || [],
      release: (data.release as Record<string, string>) || {},
    };
    const bySub = [...links.values()].find((l) => l.zro_sub === body.p_sub);
    if (body.p_action === 'find') {
      if (bySub) Object.assign(bySub, fields);
      return { userId: bySub?.user_id ?? null };
    }
    if (body.p_action === 'find_by_email') {
      const user = [...users.values()].find(
        (u) => u.email === fields.email && u.email_confirmed_at,
      );
      return { userId: user?.id ?? null };
    }
    if (!body.p_user || !users.has(body.p_user))
      return Response.json({ message: 'Account required' }, { status: 400 });
    const row = links.get(body.p_user);
    if (body.p_action === 'get')
      return {
        link: row
          ? {
              email: row.email,
              organization: row.organization,
              products: row.products,
              release: row.release,
              createdByZro: row.created_by_zro,
              linkedAt: new Date().toISOString(),
              lastLoginAt: null,
            }
          : null,
      };
    if (body.p_action === 'link') {
      if (bySub && bySub.user_id !== body.p_user) return { error: 'other_account' };
      if (row && row.zro_sub !== body.p_sub) return { error: 'already_linked' };
      if (row) Object.assign(row, fields);
      else
        links.set(body.p_user, {
          user_id: body.p_user,
          zro_sub: body.p_sub!,
          ...fields,
          created_by_zro: data.createdByZro === true,
        });
      return { ok: true };
    }
    if (body.p_action === 'unlink') {
      if (row?.created_by_zro) return { error: 'only_login' };
      links.delete(body.p_user);
      return { ok: true };
    }
    return Response.json({ message: 'Invalid action' }, { status: 400 });
  }

  function supabase(url: URL, init: RequestInit | undefined) {
    const headers = new Headers(init?.headers),
      method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const service = () =>
      assert.equal(headers.get('authorization'), 'Bearer ' + SERVICE_KEY, url.pathname);
    if (url.pathname === '/rest/v1/rpc/nossom_zro_link') {
      service();
      const result = linkRpc(body);
      return result instanceof Response ? result : Response.json(result);
    }
    if (url.pathname === '/auth/v1/admin/users' && method === 'POST') {
      service();
      assert.equal(body.email_confirm, true);
      if ([...users.values()].some((u) => u.email === body.email))
        return Response.json({ code: 422, error_code: 'email_exists' }, { status: 422 });
      const user: User = {
        id: randomUUID(),
        email: body.email,
        email_confirmed_at: new Date().toISOString(),
        user_metadata: body.user_metadata || {},
      };
      users.set(user.id, user);
      state.created++;
      return Response.json(user);
    }
    const admin = url.pathname.match(/^\/auth\/v1\/admin\/users\/([a-f0-9-]{36})$/);
    if (admin) {
      service();
      const user = users.get(admin[1]);
      if (!user) return Response.json({ error_code: 'user_not_found' }, { status: 404 });
      if (method === 'DELETE') {
        users.delete(user.id);
        links.delete(user.id);
        return new Response(null, { status: 204 });
      }
      return Response.json(user);
    }
    if (url.pathname === '/auth/v1/admin/generate_link') {
      service();
      assert.equal(body.type, 'magiclink');
      const user = [...users.values()].find((u) => u.email === body.email);
      if (!user) return Response.json({ error_code: 'user_not_found' }, { status: 404 });
      const hashed = randomBytes(16).toString('hex');
      magic.set(hashed, user.id);
      // Formato do GoTrue: campos na raiz (o supabase-js os move para `properties`).
      return Response.json({ ...user, hashed_token: hashed, verification_type: 'magiclink' });
    }
    if (url.pathname === '/auth/v1/verify' && method === 'POST') {
      assert.notEqual(headers.get('authorization'), 'Bearer ' + SERVICE_KEY);
      const id = magic.get(body.token_hash);
      if (!id || body.type !== 'magiclink')
        return Response.json({ error_code: 'otp_expired' }, { status: 403 });
      magic.delete(body.token_hash);
      const user = users.get(id)!;
      return Response.json({
        access_token: 'access-' + id,
        refresh_token: 'refresh-' + id + '-' + randomBytes(6).toString('hex'),
        expires_in: 3600,
        user,
      });
    }
    if (
      url.pathname === '/auth/v1/token' &&
      url.searchParams.get('grant_type') === 'refresh_token'
    ) {
      // Renovação: o refresh "refresh-<id>-..." pertence à conta <id>.
      const id = String(body.refresh_token || '').match(/^refresh-([a-f0-9-]{36})/)?.[1];
      const user = id ? users.get(id) : undefined;
      if (!user) return Response.json({ error_code: 'refresh_token_not_found' }, { status: 400 });
      return Response.json({
        access_token: 'access-' + user.id,
        refresh_token: 'refresh-' + user.id + '-' + randomBytes(6).toString('hex'),
        expires_in: 3600,
        user,
      });
    }
    if (url.pathname === '/auth/v1/user') {
      const token = (headers.get('authorization') || '').replace(/^Bearer /, '');
      const user = token.startsWith('access-') ? users.get(token.slice(7)) : undefined;
      return user ? Response.json(user) : Response.json({ error_code: 'bad_jwt' }, { status: 401 });
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const fetchFake: typeof fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.origin === ISSUER) return zro(url, init);
    if (url.origin === 'https://supabase.example.test') return supabase(url, init);
    throw new Error('Unexpected request ' + url);
  };

  function addUser(email: string, name = 'Pessoa') {
    const user: User = {
      id: randomUUID(),
      email,
      email_confirmed_at: new Date().toISOString(),
      user_metadata: { name },
      password: 'senha',
    };
    users.set(user.id, user);
    return user;
  }

  /** Revoga os tokens de todos (o app foi removido na Absolute ZRO). */
  const revokeAll = () => {
    access.clear();
    refresh.clear();
  };
  return { state, users, links, authorize, fetch: fetchFake, addUser, revokeAll };
}
