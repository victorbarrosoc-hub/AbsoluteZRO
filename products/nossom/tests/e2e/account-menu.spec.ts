import { test as guest } from '@playwright/test';
import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
guest(
  'homepage login menu animates, traps focus, switches forms and signs in without leaving the homepage first',
  async ({ page }) => {
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Entrar na sua conta', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'SEU ESPAÇO NOSSOM', exact: true });
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole('button', { name: 'Fechar menu da conta', exact: true });
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(
      dialog.getByRole('link', { name: 'Privacidade e armazenamento', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await dialog.getByRole('button', { name: 'Criar conta', exact: true }).click();
    await dialog.getByLabel('Nome', { exact: true }).fill('Pessoa Motion');
    await dialog
      .getByLabel('E-mail', { exact: true })
      .fill('motion.' + crypto.randomUUID() + '@example.test');
    await dialog.getByLabel('Senha', { exact: true }).fill('motion-test-password');
    await dialog.getByRole('button', { name: 'Mostrar senha', exact: true }).click();
    await expect(dialog.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'text');
    await dialog.getByRole('button', { name: 'Ocultar senha', exact: true }).click();
    await expect(dialog.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'password');
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await dialog.getByRole('button', { name: 'Criar conta e entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/studio$/);
    await expect(
      page.getByRole('button', { name: 'Abrir menu da conta', exact: true }),
    ).toBeVisible();
  },
);
guest(
  'mobile access menu respects reduced motion, fits the screen and closes with Escape or outside tap',
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Entrar na sua conta', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: 'artifacts/nossom-menu-login-mobile.png', fullPage: true });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.mouse.click(4, 4);
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  },
);
test('account menu shows the actual profile and balance, navigates and logs out on mobile', async ({
  page,
}) => {
  await page.goto('/studio');
  const trigger = page.getByRole('button', { name: 'Abrir menu da conta', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Sua conta', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Pessoa de teste', { exact: true })).toBeVisible();
  await expect(dialog.getByText('5 de 5 min disponíveis neste mês', { exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'artifacts/nossom-menu-conta-desktop.png', fullPage: true });
  await dialog.getByRole('link', { name: 'Meus projetos', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/projetos$/);
  await expect(dialog).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/nossom-menu-conta-mobile.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  expect((await page.request.get('/api/account')).status()).toBe(401);
});
