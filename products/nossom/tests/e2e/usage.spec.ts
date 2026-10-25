import { test, expect } from './fixtures';
test('free monthly allowance is visible and local EQ never consumes GPU minutes', async ({
  page,
}) => {
  await page.goto('/studio');
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
  const res = await page.request.post('/api/account', {
    headers: { Origin: 'http://localhost:3000' },
    data: {
      action: 'register',
      name: 'Administrador',
      email: 'victorbarrosoc@gmail.com',
      password: 'test-only-password',
      isAdmin: true,
    },
  });
  if (!res.ok()) {
    const login = await page.request.post('/api/account', {
      headers: { Origin: 'http://localhost:3000' },
      data: { action: 'login', email: 'victorbarrosoc@gmail.com', password: 'test-only-password' },
    });
    expect(login.status()).toBe(200);
  }
  await page.goto('/studio');
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
test('email confirmation cannot create an authenticated session', async ({ page }) => {
  await page.request.delete('/api/account', { headers: { Origin: 'http://localhost:3000' } });
  await page.goto('/entrar');
  await expect(page.locator('.account-form-wrap')).toHaveCSS('opacity', '1');
  await page.locator('.account-form-wrap').hover();
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Confirmar conta');
  await page.getByLabel('E-mail', { exact: true }).fill('confirm.new@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Criar conta e entrar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Enviamos um link de confirmação');
  await page.goto('/studio');
  await expect(page).toHaveURL(/\/entrar\?next=/);
});
