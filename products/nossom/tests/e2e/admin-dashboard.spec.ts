import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
test('administrator manages a plan in a wide, responsive dashboard; ordinary users cannot open it', async ({
  page,
}) => {
  await page.goto('/studio/admin');
  await expect(page.getByText('Acesso restrito ao administrador.', { exact: true })).toBeVisible();
  expect((await page.request.get('/api/admin')).status()).toBe(403);
  expect((await page.request.get('/api/admin/billing')).status()).toBe(403);
  const credentials = { email: 'victorbarrosoc@gmail.com', password: 'test-only-password' };
  const registered = await page.request.post('/api/account', {
    headers: { Origin: 'http://localhost:3000' },
    data: { action: 'register', name: 'Administrador', ...credentials },
  });
  if (!registered.ok())
    expect(
      (
        await page.request.post('/api/account', {
          headers: { Origin: 'http://localhost:3000' },
          data: { action: 'login', ...credentials },
        })
      ).status(),
    ).toBe(200);
  const data = {
    plans: [
      { id: 'free', name: 'Grátis', monthly_seconds: 300, price_cents: 0 },
      { id: 'essential', name: 'Essencial', monthly_seconds: 7200, price_cents: 3900 },
      { id: 'studio', name: 'Studio', monthly_seconds: 21600, price_cents: 9900 },
    ],
    users: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Pessoa Plano',
        email: 'pessoa@example.test',
        plan_id: 'free',
        assigned_plan_id: 'free',
        plan_name: 'Grátis',
        is_admin: false,
        blocked: false,
        limit_seconds: 300,
        used_seconds: 120,
        job_count: 2,
        failed_count: 0,
        uploaded_bytes: 1024000,
        seconds_override: null,
        expires_at: null,
      },
    ],
    totalUsers: 1,
    page: 0,
    days: Array.from({ length: 30 }, (_, i) => ({
      day: `2026-10-${String(i + 1).padStart(2, '0')}`,
      seconds: (i % 5) * 60,
      completed: i % 3,
      failed: 0,
    })),
    totals: {
      users: 1,
      monthlySeconds: 120,
      completed: 2,
      failed: 0,
      pending: 0,
      runtimeSeconds: 30,
      gpuUsdHour: 1.5,
    },
  };
  let update: any;
  await page.route('**/api/admin/billing', (route) =>
    route.fulfill({
      json: {
        checkedAt: '2026-10-23T18:00:00Z',
        runpod: { balanceUsd: 9.18, spendUsdHour: 0.69, message: 'Saldo informado pela RunPod.' },
        claude: {
          balanceUsd: null,
          message: 'A integração atual não informa o saldo de créditos.',
        },
      },
    }),
  );
  await page.route('**/api/admin?*', (route) => {
    if (route.request().method() === 'POST') {
      update = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: data });
  });
  await page.route('**/api/admin', (route) => {
    if (route.request().method() === 'POST') {
      update = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: data });
  });
  await page.goto('/studio/admin');
  await expect(page.getByText('US$ 9,18', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver créditos do Claude' })).toHaveAttribute(
    'href',
    'https://console.anthropic.com/settings/billing',
  );
  await expect(
    page.getByRole('heading', { name: 'Seu negócio, em sintonia.', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect
    .poll(async () => {
      const content = (await page.locator('.admin-dashboard').boundingBox())!;
      const sidebar = (await page.locator('.studio-sidebar').boundingBox())!;
      return content.x - sidebar.x - sidebar.width;
    })
    .toBeGreaterThanOrEqual(16);
  const box = await page.locator('.admin-dashboard').boundingBox();
  expect(box!.width).toBeGreaterThan(1450);
  await page.screenshot({
    path: 'artifacts/nossom-admin-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });

  await page.getByRole('button', { name: 'Gerenciar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Plano de Pessoa Plano' });
  await dialog.getByRole('combobox', { name: 'Plano', exact: true }).selectOption('essential');
  await dialog.getByLabel('Limite personalizado · minutos/mês').fill('15');
  await dialog.getByRole('button', { name: 'Salvar acesso', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(update).toEqual({
    action: 'set_member',
    data: {
      userId: data.users[0].id,
      planId: 'essential',
      secondsOverride: 900,
      expiresAt: null,
      blocked: false,
    },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/nossom-admin-mobile.png', fullPage: true });
  const a11y = await new AxeBuilder({ page })
    .include('.admin-dashboard')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(a11y.violations).toEqual([]);
});
