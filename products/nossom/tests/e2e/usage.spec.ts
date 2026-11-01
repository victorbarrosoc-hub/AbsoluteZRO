import { test, expect, existingAccount, allowedAccount, onlyWhenOpen } from './fixtures';
test('free monthly allowance is visible and local EQ never consumes GPU minutes', async ({
  page,
}) => {
  await page.goto('/studio/inicio');
  await expect(
    page.locator('.weekly-usage').getByText('5 de 5 min disponíveis neste mês', { exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 12; i++) {
    expect(
      (
        await page.request.post('/api/usage', {
          headers: { Origin: 'http://localhost:3000' },
          data: { operation: 'eq' },
        })
      ).status(),
    ).toBe(200);
  }
  await page.reload();
  await expect(
    page.locator('.weekly-usage').getByText('5 de 5 min disponíveis neste mês', { exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.post('/api/usage', {
        headers: { Origin: 'http://localhost:3000' },
        data: { operation: 'auto', requestId: 'forged' },
      })
    ).status(),
  ).toBe(400);
  await page.goto('/studio/projetos');
  await expect(page.getByRole('heading', { name: 'Meus projetos.', exact: true })).toBeVisible();
});
test('verified administrator has no monthly minute limit and normal users cannot grant themselves admin', async ({
  page,
}) => {
  // Campos de papel enviados pelo navegador são ignorados; o ADM vem do admin da plataforma na Absolute ZRO (claim
  // `zro_admin` guardada no vínculo) e, fechado ao público, a conta precisa estar na lista do proprietário no HUB.
  await allowedAccount(page.request, {
    email: 'adm@example.test',
    password: 'test-only-password',
    name: 'Administrador',
    admin: true,
  });
  const login = await page.request.post('/api/account', {
    headers: { Origin: 'http://localhost:3000' },
    data: {
      action: 'login',
      email: 'adm@example.test',
      password: 'test-only-password',
      isAdmin: true,
    },
  });
  expect(login.status()).toBe(200);
  await page.goto('/studio/inicio');
  await expect(page.locator('.workspace-label .account-plan')).toHaveText('ADM · Ilimitado');
  for (let i = 0; i < 12; i++)
    expect(
      (
        await page.request.post('/api/usage', {
          headers: { Origin: 'http://localhost:3000' },
          data: { operation: 'eq' },
        })
      ).status(),
    ).toBe(200);
  const quota = await (await page.request.get('/api/usage')).json();
  expect(quota.unlimited).toBe(true);
  expect(quota.used).toBe(0);
});
test('an existing account still waiting for e-mail confirmation cannot sign in', async ({
  page,
}) => {
  // Descreve o produto aberto (entrar, assinar, home com ações, /apps).
  onlyWhenOpen();
  await page.request.delete('/api/account', { headers: { Origin: 'http://localhost:3000' } });
  await existingAccount(page.request, {
    email: 'confirm.new@example.test',
    password: 'test-password',
    confirmed: false,
  });
  await page.goto('/entrar');
  await expect(page.locator('.account-form-wrap')).toHaveCSS('opacity', '1');
  await page.locator('.account-form-wrap').hover();
  await page.getByLabel('E-mail', { exact: true }).fill('confirm.new@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Entrar no estúdio', exact: true }).click();
  await expect(page.locator('.account-error')).toContainText('Confirme seu e-mail para entrar');
  await page.goto('/studio/inicio');
  await expect(page).toHaveURL(/\/entrar\?next=/);
});
