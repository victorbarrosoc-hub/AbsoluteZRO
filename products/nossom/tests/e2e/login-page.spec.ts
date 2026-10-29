import { test, expect } from '@playwright/test';
import { onlyWhenOpen } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
test('desktop access expands by hover and keyboard, keeping fields available while typing', async ({
  page,
}) => {
  onlyWhenOpen();
  await page.goto('/entrar');
  const card = page.locator('.account-expandable');
  await expect(card).not.toHaveClass(/is-expanded/);
  await page.getByRole('button', { name: 'Acessar minha conta' }).focus();
  await expect(card).toHaveClass(/is-expanded/);
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeFocused();
  await page.getByLabel('E-mail', { exact: true }).fill('teste@example.test');
  await page.mouse.move(0, 0);
  await expect(card).toHaveClass(/is-expanded/);
  await page.screenshot({ path: 'artifacts/nossom-login-desktop.png', fullPage: true });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.reload();
  await expect(card).not.toHaveClass(/is-expanded/);
  await card.hover();
  await expect(card).toHaveClass(/is-expanded/);
});
test('mobile login opens without hover and account creation goes to the Absolute ZRO', async ({
  page,
}) => {
  onlyWhenOpen();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/entrar');
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Criar conta com a Absolute ZRO', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/nossom-login-mobile.png', fullPage: true });
});
