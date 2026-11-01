import { test, expect } from '@playwright/test';
import { onlyWhenOpen } from './fixtures';
test('the Absolute ZRO button keeps the return path and explains a failed trip', async ({
  page,
}) => {
  onlyWhenOpen();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/entrar?next=%2Fstudio%2Fia');
  const button = page.getByRole('link', { name: 'Entrar com Absolute ZRO' });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('href', '/api/zro/entrar?volta=%2Fstudio%2Fia');
  await expect(button.locator('svg path')).toHaveCount(2); // símbolo flat: centelha + anel
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Sem a Absolute ZRO no ar, a pessoa volta para a tela de entrar com um aviso curto.
  await button.click();
  await expect(page).toHaveURL(/\/entrar\?erro=zro_erro&next=%2Fstudio%2Fia$/);
  await expect(page.locator('.account-error')).toHaveText(
    'Não deu para falar com a Absolute ZRO agora. Tente de novo.',
  );
});
test('creating an account goes to the Absolute ZRO and the sign-up form is gone', async ({
  page,
}) => {
  onlyWhenOpen();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/entrar?modo=criar&next=%2Fstudio%2Fia');
  await expect(page.getByText('A conta do Quasar é a sua conta Absolute ZRO.')).toBeVisible();
  const create = page.getByRole('link', { name: 'Criar conta com a Absolute ZRO', exact: true });
  await expect(create).toHaveAttribute('href', '/api/zro/entrar?modo=criar&volta=%2Fstudio%2Fia');
  for (const label of ['Nome', 'Senha'])
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Criar conta e entrar' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Sem a Absolute ZRO no ar, volta para a tela de entrar com o aviso curto.
  await create.click();
  await expect(page).toHaveURL(/\/entrar\?erro=zro_erro&next=%2Fstudio%2Fia$/);
  await expect(page.locator('.account-error')).toHaveText(
    'Não deu para falar com a Absolute ZRO agora. Tente de novo.',
  );
});
