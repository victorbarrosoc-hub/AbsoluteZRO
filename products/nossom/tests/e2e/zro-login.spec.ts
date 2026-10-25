import { test, expect } from '@playwright/test';
test('the Absolute ZRO button keeps the return path and explains a failed trip', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/entrar?next=%2Fstudio%2Fia');
  const button = page.getByRole('link', { name: 'Continuar com Absolute ZRO' });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('href', '/api/zro/entrar?volta=%2Fstudio%2Fia');
  await expect(button.locator('img')).toHaveAttribute('src', '/absolute-zro-o-alpha.webp');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Sem a Absolute ZRO no ar, a pessoa volta para a tela de entrar com um aviso curto.
  await button.click();
  await expect(page).toHaveURL(/\/entrar\?erro=zro_erro&next=%2Fstudio%2Fia$/);
  await expect(page.locator('.account-error')).toHaveText(
    'Não deu para falar com a Absolute ZRO agora. Tente de novo.',
  );
});
