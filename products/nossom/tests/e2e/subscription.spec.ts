import { test, expect, signInExisting, onlyWhenOpen } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
// Runs against the local Stripe double in scripts/test-server.mjs: Checkout, signed webhooks
// and the customer portal. No real payment provider is contacted.
test('a person subscribes by card, sees the plan only after Stripe confirms, and can cancel', async ({
  page,
}) => {
  onlyWhenOpen();
  await page.goto('/studio/planos');
  const plans = page.getByRole('region', { name: 'Planos da NOSSOM' });
  await expect(plans.getByText(/Planos pagos são cobrados todo mês no cartão/)).toBeVisible();
  await expect(plans.getByRole('link', { name: /Solicitar ativação/ })).toHaveCount(0);
  await plans.getByRole('button', { name: 'Assinar Essencial' }).click();
  // Card details are collected on the payment page, never by NOSSOM.
  await expect(page.getByRole('heading', { name: 'Pagamento de teste' })).toBeVisible();
  await page.getByRole('button', { name: 'Pagar' }).click();
  await expect(page).toHaveURL(/\/studio\/planos$/);
  await expect(plans.getByText('Pagamento confirmado. Seu plano já está valendo.')).toBeVisible();
  await expect(plans.getByText(/Assinatura ativa\. Renova em \d{2}\/\d{2}\./)).toBeVisible();
  const essential = plans.locator('.plan-choice', { hasText: 'Essencial' });
  await expect(essential.getByText('Seu plano')).toBeVisible();
  await expect(page.locator('.plan-summary')).toContainText('Essencial');
  // Moving to another plan asks for confirmation before charging the difference.
  const studio = plans.locator('.plan-choice', { hasText: 'Studio' });
  await studio.getByRole('button', { name: 'Trocar para Studio' }).click();
  await expect(
    studio.getByText('A diferença deste mês é cobrada agora no seu cartão.'),
  ).toBeVisible();
  await studio.getByRole('button', { name: /Confirmar troca/ }).click();
  await expect(plans.getByText('Plano trocado.')).toBeVisible();
  await expect(studio.getByText('Seu plano')).toBeVisible();
  await expect(page.locator('.plan-summary')).toContainText('Studio');
  // Managing and cancelling happen on Stripe's page; the plan ends when Stripe says so.
  await studio.getByRole('button', { name: 'Gerenciar assinatura' }).click();
  await expect(page.getByRole('heading', { name: 'Sua assinatura' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar assinatura' }).click();
  await expect(page).toHaveURL(/\/studio\/planos$/);
  await expect(plans.getByRole('button', { name: 'Assinar Essencial' })).toBeVisible();
  await expect(page.locator('.plan-summary')).toContainText('Grátis');
});
test('the homepage sends paid plans to the account, where checkout starts after sign-in', async ({
  browser,
}) => {
  onlyWhenOpen();
  const page = await browser.newPage();
  await page.goto('/');
  const link = page
    .getByRole('region', { name: 'Planos da NOSSOM' })
    .getByRole('link', { name: 'Assinar Studio' });
  await expect(link).toHaveAttribute('href', '/studio/planos?plano=studio');
  await link.click();
  await expect(page).toHaveURL(/\/entrar\?next=%2Fstudio%2Fplanos%3Fplano%3Dstudio/);
  await page.close();
});
test('after signing in, the plan and the upgrade are one tap away from the sidebar, the account menu and settings', async ({
  page,
}) => {
  onlyWhenOpen();
  await page.goto('/studio/inicio');
  // The minutes card leads to the plan page.
  await page.locator('.weekly-usage').getByRole('link', { name: 'Fazer upgrade' }).click();
  await expect(page).toHaveURL(/\/studio\/planos$/);
  await expect(page.getByRole('heading', { name: /Mais tempo para o seu som/ })).toBeVisible();
  await expect(page.locator('.plan-summary')).toContainText('Grátis');
  await expect(page.locator('.plan-summary')).toContainText('min disponíveis neste mês');
  await expect(
    page
      .getByRole('region', { name: 'Planos da NOSSOM' })
      .getByRole('button', { name: 'Assinar Studio' }),
  ).toBeVisible();
  // So do the sidebar, the account menu and the account settings.
  await page.goto('/studio/projetos');
  await page
    .getByRole('navigation', { name: 'Navegação do estúdio' })
    .getByRole('button', { name: 'Meu plano' })
    .click();
  await expect(page).toHaveURL(/\/studio\/planos$/);
  await page.goto('/studio/projetos');
  await page
    .getByRole('button', { name: /menu da conta/ })
    .first()
    .click();
  await page.getByRole('link', { name: 'Meu plano e upgrade' }).click();
  await expect(page).toHaveURL(/\/studio\/planos$/);
  await page.goto('/studio/conta');
  await page.getByRole('link', { name: /Ver meu plano, minutos do mês e fazer upgrade/ }).click();
  await expect(page).toHaveURL(/\/studio\/planos$/);
  await expect(page.locator('.plan-summary')).toBeVisible();
  // Readable in both themes.
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Tema do estúdio', { exact: true }).selectOption(theme);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
  // On a phone, the minutes strip above every screen links there too.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/studio/projetos');
  await page.locator('.mobile-usage').getByRole('link', { name: 'Upgrade' }).click();
  await expect(page).toHaveURL(/\/studio\/planos$/);
});
test('the administrator also reaches the plans, as customers see them, without losing unlimited access', async ({
  page,
}) => {
  const credentials = { email: 'adm@example.test', password: 'test-only-password', admin: true };
  await signInExisting(page.request, { ...credentials, name: 'Administrador' });
  await page.goto('/studio/projetos');
  await page
    .getByRole('navigation', { name: 'Navegação do estúdio' })
    .getByRole('button', { name: 'Planos', exact: true })
    .click();
  await expect(page).toHaveURL(/\/studio\/planos$/);
  await expect(page.locator('.plan-summary')).toContainText('ADM · Ilimitado');
  await expect(page.getByText(/Visão do cliente/)).toBeVisible();
  const plans = page.getByRole('region', { name: 'Planos da NOSSOM' });
  await expect(plans.locator('.plan-choice')).toHaveCount(3);
  await expect(plans.getByText('Seu plano')).toHaveCount(0);
  await page.goto('/studio/conta');
  await expect(
    page.getByRole('link', { name: /Ver os planos como os clientes veem/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menu da conta' }).click();
  await expect(page.getByRole('link', { name: 'Planos', exact: true })).toBeVisible();
});
