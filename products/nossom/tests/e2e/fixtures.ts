import { test as base, expect, type APIRequestContext } from '@playwright/test';
export { expect };
export type { Page } from '@playwright/test';

// Supabase falso de scripts/test-server.mjs (só local). Conta nova não nasce pelo app (só pela
// Absolute ZRO), então os testes criam contas "que já existem" pela Admin API do falso.
const SUPABASE_DOUBLE = 'http://127.0.0.1:55440';
const randomIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

/** Conta e-mail/senha já existente no Supabase (ignora se o e-mail já tem conta). Devolve o id. */
export async function existingAccount(
  request: APIRequestContext,
  o: { email: string; password: string; name?: string; confirmed?: boolean },
): Promise<string | null> {
  const response = await request.post(SUPABASE_DOUBLE + '/auth/v1/admin/users', {
    headers: { Authorization: 'Bearer service-e2e-placeholder' },
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

/**
 * Liga a conta à Absolute ZRO no Supabase falso, como o callback faz, com os `zro_products`
 * que a organização ativa liberou. Vale a partir da próxima entrada.
 */
export async function zroLink(request: APIRequestContext, userId: string, products: string[]) {
  const response = await request.post(SUPABASE_DOUBLE + '/rest/v1/rpc/nossom_zro_link', {
    headers: { Authorization: 'Bearer service-e2e-placeholder' },
    data: {
      p_action: 'link',
      p_user: userId,
      p_sub: 'zro-' + userId,
      p_data: { email: 'zro@example.test', organization: 'Produtora', products },
    },
  });
  expect(response.status()).toBe(200);
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

/** Conta já existente + login (o caso do administrador nos testes). */
export async function signInExisting(
  request: APIRequestContext,
  o: { email: string; password: string; name?: string },
) {
  await existingAccount(request, o);
  const response = await signIn(request, o.email, o.password);
  expect(response.status()).toBe(200);
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
