import { test as base, expect, type APIRequestContext } from '@playwright/test';
export { expect };
export type { Page } from '@playwright/test';

// Supabase falso de scripts/test-server.mjs (só local). Conta nova não nasce pelo app (só pela
// Absolute ZRO), então os testes criam contas "que já existem" pela Admin API do falso.
//
// O servidor de teste roda com o padrão de produção, `RELEASE=closed` (28/10/2026): só a conta `allowed`
// na claim `zro_release` do HUB entra. Por isso a persona padrão da suíte é uma conta ligada à Absolute
// ZRO e na lista do proprietário (`allowedAccount`); conta própria e conta fora da lista são as personas
// de tests/e2e/zro-access.spec.ts.
const SUPABASE_DOUBLE = 'http://127.0.0.1:55440';
const SERVICE = { Authorization: 'Bearer service-e2e-placeholder' };
const randomIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

/** O produto aberto ao público (`RELEASE=released` no build e no servidor de teste); padrão: fechado. */
export const OPEN = process.env.RELEASE?.trim() === 'released';
const OPEN_ONLY = 'só com o NOSSOM aberto ao público (RELEASE=released)';
/** Pula o teste enquanto o NOSSOM está fechado: ele descreve o produto aberto (entrar, assinar, instalar). */
export const onlyWhenOpen = () => base.skip(!OPEN, OPEN_ONLY);

export type Release = Record<string, 'released' | 'closed' | 'allowed'>;
export const ALLOWED: Release = { nossom: 'allowed' };

/** Conta e-mail/senha já existente no Supabase (ignora se o e-mail já tem conta). Devolve o id. */
export async function existingAccount(
  request: APIRequestContext,
  o: { email: string; password: string; name?: string; confirmed?: boolean },
): Promise<string | null> {
  const response = await request.post(SUPABASE_DOUBLE + '/auth/v1/admin/users', {
    headers: SERVICE,
    data: {
      email: o.email,
      password: o.password,
      email_confirm: o.confirmed !== false,
      user_metadata: { name: o.name ?? 'Pessoa de teste' },
    },
  });
  expect([200, 422]).toContain(response.status());
  return response.status() === 200 ? (await response.json()).id : null;
}

/** Id da conta confirmada com este e-mail (a função `find_by_email` da migração 202610280001), ou null. */
export async function accountIdByEmail(request: APIRequestContext, email: string) {
  const response = await request.post(SUPABASE_DOUBLE + '/rest/v1/rpc/nossom_zro_link', {
    headers: SERVICE,
    data: { p_action: 'find_by_email', p_user: null, p_sub: null, p_data: { email } },
  });
  expect(response.status()).toBe(200);
  return ((await response.json()).userId as string | null) ?? null;
}

/**
 * Liga a conta à Absolute ZRO no Supabase falso, como o callback faz, com os `zro_products` e a claim
 * `zro_release` que o HUB mandou. Vale a partir do próximo pedido (o servidor relê o vínculo sempre).
 */
export async function zroLink(
  request: APIRequestContext,
  userId: string,
  products: string[],
  release: Release = {},
  email = 'zro@example.test',
) {
  const response = await request.post(SUPABASE_DOUBLE + '/rest/v1/rpc/nossom_zro_link', {
    headers: SERVICE,
    data: {
      p_action: 'link',
      p_user: userId,
      p_sub: 'zro-' + userId,
      p_data: { email, organization: 'Produtora', products, release },
    },
  });
  expect(response.status()).toBe(200);
}

/** Desliga a Absolute ZRO da conta (vira conta própria, sem vínculo). */
export async function zroUnlink(request: APIRequestContext, userId: string) {
  const response = await request.post(SUPABASE_DOUBLE + '/rest/v1/rpc/nossom_zro_link', {
    headers: SERVICE,
    data: { p_action: 'unlink', p_user: userId, p_sub: null, p_data: {} },
  });
  expect(response.status()).toBe(200);
}

/** Conta já existente, ligada à Absolute ZRO e na lista do proprietário (`allowed`). Devolve o id. */
export async function allowedAccount(
  request: APIRequestContext,
  o: { email: string; password: string; name?: string },
): Promise<string> {
  const id = (await existingAccount(request, o)) ?? (await accountIdByEmail(request, o.email));
  expect(id).toBeTruthy();
  await zroLink(request, id!, ['nossom'], ALLOWED);
  return id!;
}

/** Entra como sempre, com e-mail e senha, pela API da NOSSOM. */
export async function signIn(request: APIRequestContext, email: string, password: string) {
  // Cada entrada sai de um endereço próprio para o limite por IP (mantido) não travar a suíte.
  // Só o servidor local respeita este cabeçalho.
  return request.post('/api/account', {
    headers: { Origin: 'http://localhost:3000', 'X-Forwarded-For': randomIp() },
    data: { action: 'login', email, password },
  });
}

/** Conta autorizada já existente + login (o caso do administrador nos testes). Devolve o id. */
export async function signInExisting(
  request: APIRequestContext,
  o: { email: string; password: string; name?: string },
) {
  const id = await allowedAccount(request, o);
  const response = await signIn(request, o.email, o.password);
  expect(response.status()).toBe(200);
  return id;
}

export const test = base.extend({
  page: async ({ page }, use) => {
    // O painel da Z vem de absolutezro.com; a suíte não depende da rede (zro-ia.spec.ts testa o painel).
    await page.route('https://absolutezro.com/**', (route) => route.abort());
    await signInExisting(page.request, {
      email: 'test.' + crypto.randomUUID() + '@example.test',
      password: 'valid-test-password',
    });
    await use(page);
  },
});
