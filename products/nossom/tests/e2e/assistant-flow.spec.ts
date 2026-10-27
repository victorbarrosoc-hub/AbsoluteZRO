import { test, expect } from './fixtures';

test('mobile shortcuts open real tools even while AI is unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let calls = 0;
  await page.route('**/api/ai/status', (r) =>
    r.fulfill({ json: { configured: false, authorized: true } }),
  );
  await page.route('**/api/ai/assistant', (r) => {
    calls++;
    return r.fulfill({ status: 503 });
  });
  for (const [label, path] of [
    ['Limpar minha fala', 'automatico'],
    ['Nivelar volumes', 'nivelamento'],
    ['Preparar para publicar', 'masterizacao'],
  ]) {
    await page.goto('/studio');
    await expect(page.getByRole('heading', { name: 'Seu áudio, melhor.' })).toBeVisible();
    await expect(page.locator('.assistant-details')).not.toHaveAttribute('open');
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/studio/${path}$`));
  }
  expect(calls).toBe(0);
});

test('a slow conversation can be cancelled and shortcuts remain available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/ai/status', (r) =>
    r.fulfill({ json: { configured: true, authorized: true } }),
  );
  let finish!: () => void;
  const wait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/api/ai/assistant', async (r) => {
    await wait;
    await r.fulfill({ json: { reply: 'Resposta antiga', operation: 'auto' } }).catch(() => {});
  });
  await page.goto('/studio');
  await page.getByLabel('Descreva seu objetivo').fill('Quero uma voz mais suave');
  await page.getByRole('button', { name: 'Encontrar tratamento', exact: true }).click();
  await expect(page.locator('.assistant-panel .ai-motion')).toHaveClass(/state-thinking/);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  finish();
  await expect(page.getByLabel('Descreva seu objetivo')).toBeEnabled();
  await expect(page.getByText('Resposta antiga')).toBeHidden();
  await page.screenshot({ path: 'artifacts/assistant-compact-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Limpar minha fala', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/automatico$/);
});

test('mobile homepage keeps demo, plans and FAQ in a shorter page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Ouvir demonstração', exact: true })).toBeVisible();
  // Seis seções do NOSSOM e a da Z, a IA da Absolute ZRO.
  expect(await page.locator('main > section').count()).toBe(7);
  await page.locator('.ns-faq').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Meu áudio é enviado à IA?' }).click();
  await expect(page.locator('#faq-2')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'artifacts/home-short-mobile.png', fullPage: true });
});
