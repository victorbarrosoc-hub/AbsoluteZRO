// Local-only GoTrue/PostgREST contract double. Never included in the application.
import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
const users = new Map(),
  tokens = new Map(),
  refreshTokens = new Map(),
  uses = new Map(),
  avatars = new Map(),
  // Stripe double: customers, Checkout pages and subscriptions, plus the app's mirror of them.
  stripeSessions = new Map(),
  stripeSubscriptions = new Map(),
  subscriptionRows = new Map(),
  memberships = new Map(),
  portalReturns = new Map(),
  // Vínculo com a Absolute ZRO (nossom_private.zro_links): user_id → { sub, products, ... }.
  zroLinks = new Map();
// ADM = admin da plataforma Absolute ZRO guardado no vínculo e e-mail confirmado (nossom_private.is_admin).
const platformAdmin = (user) => zroLinks.get(user.id)?.admin === true && !!user.email_confirmed_at;
const app = 'http://localhost:3000',
  webhookSecret = 'whsec_e2e_placeholder';
const plansCatalog = [
  { id: 'free', name: 'Grátis', monthly_seconds: 300, price_cents: 0 },
  { id: 'essential', name: 'Essencial', monthly_seconds: 7200, price_cents: 3900 },
  { id: 'studio', name: 'Studio', monthly_seconds: 21600, price_cents: 9900 },
];
// Sends a signed event the way Stripe does; the app then reads the subscription back.
async function stripeEvent(type, subscription) {
  const payload = JSON.stringify({
    id: 'evt_' + randomUUID(),
    type,
    data: { object: subscription },
  });
  const time = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', webhookSecret).update(`${time}.${payload}`).digest('hex');
  await fetch(app + '/api/subscription/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${time},v1=${v1}`, 'Content-Type': 'application/json' },
    body: payload,
  });
}
function page(res, title, action) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    `<!doctype html><meta charset="utf-8"><title>${title}</title><h1>${title}</h1><form method="post"><button>${action}</button></form>`,
  );
}
const origin = 'http://127.0.0.1:55440';
function session(user) {
  const access_token = randomUUID(),
    refresh_token = randomUUID();
  tokens.set(access_token, user);
  refreshTokens.set(refresh_token, user);
  return { access_token, refresh_token, expires_in: 3600, user };
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, origin);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  // Private profile photos (service role only), kept in memory like the rest of this double.
  const photo = url.pathname.match(
    /^\/storage\/v1\/object\/(?:authenticated\/)?nossom-avatars\/([0-9a-f-]{36})$/,
  );
  if (photo || url.pathname.startsWith('/storage/v1/')) {
    if (req.headers.authorization !== 'Bearer service-e2e-placeholder') {
      res.writeHead(403);
      res.end('{}');
      return;
    }
    if (photo && req.method === 'POST') {
      avatars.set(photo[1], { type: req.headers['content-type'], bytes: Buffer.concat(chunks) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }
    if (photo && req.method === 'GET' && avatars.has(photo[1])) {
      const saved = avatars.get(photo[1]);
      res.writeHead(200, { 'Content-Type': saved.type });
      res.end(saved.bytes);
      return;
    }
    if (url.pathname === '/storage/v1/object/nossom-avatars' && req.method === 'DELETE') {
      for (const prefix of JSON.parse(Buffer.concat(chunks).toString()).prefixes)
        avatars.delete(prefix);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
      return;
    }
    res.writeHead(404);
    res.end('{}');
    return;
  }
  // API da IA da Absolute ZRO (a Z), só o necessário para o painel do Início: aceita o token de teste
  // `zat_e2e` (o mesmo que os testes guardam no cookie cifrado da Z) e responde em NDJSON como o HUB.
  if (url.pathname.startsWith('/zro/api/v1/ia/')) {
    const path = url.pathname.slice('/zro/api/v1/ia'.length);
    const reply = (data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (req.headers.authorization !== 'Bearer zat_e2e')
      return reply({ error: 'unauthenticated', message: 'Token inválido.' }, 401);
    if (path === '/estado' && req.method === 'GET')
      return reply({
        ligada: true,
        nome: 'Teste',
        creditos: { usados: 3, limite: 200, renova_em: '2026-11-27T03:00:00.000Z' },
      });
    if (path === '/conversas' && req.method === 'GET') return reply({ conversas: [] });
    if (path === '/mensagens' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
      for (const e of [
        { tipo: 'conversa', id: '00000000-0000-4000-8000-000000000001', titulo: 'Fala limpa' },
        { tipo: 'texto', t: 'Comece pela Limpeza no estúdio e confira antes de salvar.' },
        { tipo: 'fim', mensagem: '00000000-0000-4000-8000-000000000002', creditos: 1 },
      ])
        res.write(JSON.stringify(e) + '\n');
      return res.end();
    }
    return reply({ error: 'not_found' }, 404);
  }
  if (url.pathname.startsWith('/stripe/')) {
    const form = new URLSearchParams(Buffer.concat(chunks).toString());
    const json = (data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    const redirect = (to) => {
      res.writeHead(303, { Location: to });
      res.end();
    };
    const checkout = url.pathname.match(/^\/stripe\/checkout\/(cs_[\w-]+)$/);
    if (checkout) {
      const session = stripeSessions.get(checkout[1]);
      if (req.method === 'GET') return page(res, 'Pagamento de teste', 'Pagar');
      const id = 'sub_' + randomUUID().replaceAll('-', '');
      const subscription = {
        id,
        customer: session.customer,
        status: 'active',
        cancel_at_period_end: false,
        metadata: session.metadata,
        items: {
          data: [
            {
              id: 'si_' + id,
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
              price: { product: session.product },
            },
          ],
        },
      };
      stripeSubscriptions.set(id, subscription);
      await stripeEvent('checkout.session.completed', { id: checkout[1], subscription: id });
      return redirect(session.success);
    }
    const portal = url.pathname.match(/^\/stripe\/portal\/(cus_[\w-]+)$/);
    if (portal) {
      if (req.method === 'GET') return page(res, 'Sua assinatura', 'Cancelar assinatura');
      for (const subscription of stripeSubscriptions.values())
        if (subscription.customer === portal[1] && subscription.status === 'active') {
          subscription.status = 'canceled';
          await stripeEvent('customer.subscription.deleted', subscription);
        }
      return redirect(portalReturns.get(portal[1]) || app + '/studio');
    }
    if (req.headers.authorization !== 'Bearer sk_test_e2e_placeholder') return json({}, 401);
    if (url.pathname === '/stripe/v1/customers')
      return json({ id: 'cus_' + randomUUID().replaceAll('-', '') });
    if (url.pathname.startsWith('/stripe/v1/products/')) return json({}, 404);
    if (url.pathname === '/stripe/v1/products') return json({ id: form.get('id') });
    if (url.pathname === '/stripe/v1/checkout/sessions') {
      const id = 'cs_' + randomUUID().replaceAll('-', '');
      stripeSessions.set(id, {
        customer: form.get('customer'),
        product: form.get('line_items[0][price_data][product]'),
        metadata: {
          user_id: form.get('subscription_data[metadata][user_id]'),
          plan: form.get('subscription_data[metadata][plan]'),
        },
        success: form.get('success_url'),
      });
      return json({ id, url: origin + '/stripe/checkout/' + id });
    }
    if (url.pathname === '/stripe/v1/billing_portal/sessions') {
      portalReturns.set(form.get('customer'), form.get('return_url'));
      return json({ url: origin + '/stripe/portal/' + form.get('customer') });
    }
    const subscription = url.pathname.match(/^\/stripe\/v1\/subscriptions\/(sub_\w+)$/);
    if (subscription && stripeSubscriptions.has(subscription[1])) {
      const found = stripeSubscriptions.get(subscription[1]);
      // A plan change: the item now bills the other product (the payment is approved here).
      if (req.method === 'POST')
        found.items.data[0].price.product = form.get('items[0][price_data][product]');
      return json(found);
    }
    return json({}, 404);
  }
  const raw = Buffer.concat(chunks).toString();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    res.writeHead(400);
    res.end('{}');
    return;
  }
  const send = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  const token = req.headers.authorization?.replace('Bearer ', ''),
    user = tokens.get(token);
  // Sem cadastro público: a NOSSOM só cria conta pela Absolute ZRO. Contas "que já existem"
  // entram aqui pela Admin API (service role), como no Supabase de verdade.
  if (url.pathname === '/auth/v1/signup') return send({ error_code: 'signup_disabled' }, 422);
  if (url.pathname === '/auth/v1/admin/users' && req.method === 'POST') {
    if (token !== 'service-e2e-placeholder') return send({ code: 403 }, 403);
    if (users.has(body.email)) return send({ error_code: 'email_exists' }, 422);
    const user = {
      id: randomUUID(),
      email: body.email,
      email_confirmed_at: body.email_confirm === false ? null : new Date().toISOString(),
      user_metadata: body.user_metadata || {},
    };
    users.set(body.email, { user, password: body.password });
    return send(user);
  }
  if (url.pathname === '/auth/v1/token') {
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      const u = refreshTokens.get(body.refresh_token);
      return u ? send(session(u)) : send({ error_code: 'invalid_grant' }, 401);
    }
    const saved = users.get(body.email);
    if (!saved || saved.password !== body.password)
      return send({ error_code: 'invalid_credentials' }, 400);
    if (!saved.user.email_confirmed_at) return send({ error_code: 'email_not_confirmed' }, 400);
    return send(session(saved.user));
  }
  if (url.pathname === '/auth/v1/user' && req.method === 'PUT') {
    if (!user) return send({ error_code: 'session_not_found' }, 401);
    if (body.data) user.user_metadata = { ...user.user_metadata, ...body.data };
    if (body.password) {
      const stored = users.get(user.email);
      stored.password = body.password;
    }
    return send(user);
  }
  if (url.pathname === '/auth/v1/user')
    return user ? send(user) : send({ error_code: 'session_not_found' }, 401);
  if (url.pathname === '/auth/v1/logout') {
    tokens.delete(token);
    if (user) for (const [t, u] of refreshTokens) if (u.id === user.id) refreshTokens.delete(t);
    return send({});
  }
  // nossom_zro_link (só service role), com as mesmas ações da migração. Os testes ligam uma conta
  // "como se" tivesse entrado pela Absolute ZRO para conferir o bloqueio por zro_products.
  if (url.pathname === '/rest/v1/rpc/nossom_zro_link') {
    if (token !== 'service-e2e-placeholder') return send({ code: '42501' }, 403);
    const data = body.p_data || {},
      products = Array.isArray(data.products) ? data.products : [],
      // `zro_release` (migração 202610280001): só os três estados, por produto.
      release = Object.fromEntries(
        Object.entries(data.release && typeof data.release === 'object' ? data.release : {}).filter(
          ([, v]) => ['released', 'closed', 'allowed'].includes(v),
        ),
      );
    if (body.p_action === 'find') {
      const found = [...zroLinks.values()].find((l) => l.sub === body.p_sub);
      if (found) {
        found.products = products;
        found.release = release;
        found.admin = data.admin === true;
      }
      return send({ userId: found?.userId ?? null });
    }
    // Conta `allowed` adota a conta antiga de mesmo e-mail confirmado (migração 202610280001).
    if (body.p_action === 'find_by_email') {
      const saved = users.get(String(data.email || '').toLowerCase());
      return send({ userId: saved?.user.email_confirmed_at ? saved.user.id : null });
    }
    if (![...users.values()].some((u) => u.user.id === body.p_user))
      return send({ message: 'Account required' }, 400);
    const row = zroLinks.get(body.p_user);
    if (body.p_action === 'get')
      return send({
        link: row
          ? {
              email: row.email,
              organization: row.organization,
              products: row.products,
              release: row.release,
              admin: row.admin === true,
              createdByZro: row.createdByZro,
              linkedAt: row.linkedAt,
              lastLoginAt: null,
            }
          : null,
      });
    if (body.p_action === 'link') {
      zroLinks.set(body.p_user, {
        userId: body.p_user,
        sub: body.p_sub,
        email: String(data.email || ''),
        organization: data.organization || null,
        products,
        release,
        // claim `zro_admin` (migração 202611010001): só o booleano true conta.
        admin: data.admin === true,
        createdByZro: data.createdByZro === true,
        linkedAt: row?.linkedAt ?? new Date().toISOString(),
      });
      return send({ ok: true });
    }
    if (body.p_action === 'unlink') {
      if (row?.createdByZro) return send({ error: 'only_login' });
      zroLinks.delete(body.p_user);
      return send({ ok: true });
    }
    return send({ message: 'Invalid action' }, 400);
  }
  if (url.pathname === '/rest/v1/rpc/nossom_plan_catalog') return send(plansCatalog);
  if (url.pathname === '/rest/v1/rpc/nossom_subscription') {
    if (token !== 'service-e2e-placeholder') return send({ code: '42501' }, 403);
    const { p_action: action, p_user: id, p_data: data } = body;
    let row = subscriptionRows.get(id) || null;
    if (action === 'customer' && !row) {
      row = { customer_id: data.customerId, subscription_id: null, cancel_at_period_end: false };
      subscriptionRows.set(id, row);
    }
    if (action === 'apply') {
      if (!row || row.customer_id !== data.customerId) return send({ code: 'P0001' }, 400);
      Object.assign(row, {
        subscription_id: data.subscriptionId,
        plan_id: data.planId,
        status: data.status,
        period_end: data.periodEnd,
        cancel_at_period_end: data.cancelAtPeriodEnd,
      });
      if (['active', 'trialing', 'past_due'].includes(data.status))
        memberships.set(id, data.planId);
      else memberships.delete(id);
    }
    return send({ subscription: row });
  }
  if (url.pathname === '/rest/v1/rpc/nossom_plan_usage') {
    if (!user) return send({ code: '28000' }, 401);
    const used = uses.get(user.id) || 0;
    const unlimited = platformAdmin(user);
    const plan = plansCatalog.find((p) => p.id === (memberships.get(user.id) || 'free')),
      limit = plan.monthly_seconds;
    return send({
      allowed: unlimited || used < limit,
      used,
      remaining: unlimited ? null : Math.max(0, limit - used),
      limit: unlimited ? null : limit,
      unlimited,
      resetAt: '2026-11-01T03:00:00Z',
      unit: 'seconds',
      planId: plan.id,
      planName: plan.name,
      usedSeconds: used,
      limitSeconds: unlimited ? null : limit,
      remainingSeconds: unlimited ? null : Math.max(0, limit - used),
    });
  }
  if (url.pathname === '/rest/v1/rpc/nossom_audio_usage') {
    if (!user) return send({ code: '28000' }, 401);
    const used = uses.get(user.id) || 0,
      unlimited = platformAdmin(user);
    const allowed = unlimited || used < 10;
    const count = body.p_request_id && allowed ? used + 1 : used;
    uses.set(user.id, count);
    return send({
      allowed: body.p_request_id ? allowed : unlimited || count < 10,
      used: count,
      remaining: unlimited ? null : Math.max(0, 10 - count),
      limit: unlimited ? null : 10,
      unlimited,
      resetAt: '2026-10-26T03:00:00Z',
    });
  }
  send({}, 404);
});
server.listen(55440, '127.0.0.1', () => {
  const next = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '0.0.0.0'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        SUPABASE_URL: origin,
        SUPABASE_ANON_KEY: 'public-e2e-placeholder',
        SUPABASE_SERVICE_ROLE_KEY: 'service-e2e-placeholder',
        STRIPE_SECRET_KEY: 'sk_test_e2e_placeholder',
        STRIPE_WEBHOOK_SECRET: webhookSecret,
        STRIPE_API_URL: origin + '/stripe',
        NOSSOM_AUTH_SECRET: 'local-e2e-session-key-placeholder',
        // Absolute ZRO sem servidor de verdade: o botão aparece e a ida falha com aviso amigável.
        ZRO_ISSUER: origin + '/zro',
        ZRO_CLIENT_ID: 'nossom-web',
        ZRO_CLIENT_SECRET: 'zro-e2e-placeholder',
        ANTHROPIC_API_KEY: '',
        NEXT_PUBLIC_ELEVENLABS_AGENT_ID: '',
      },
    },
  );
  const cleanup = () => {
    next.kill('SIGTERM');
    server.close();
  };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
  next.on('exit', (code) => {
    server.close();
    process.exit(code || 0);
  });
});
