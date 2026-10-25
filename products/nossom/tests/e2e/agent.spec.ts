import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';

test('the platform agent is connected automatically, continues a private conversation and only selects a treatment after review', async ({
  page,
}) => {
  let turns = 0;
  let closed = false;
  await page.route('**/api/ai/status', (route) =>
    route.fulfill({
      json: {
        configured: true,
        authorized: true,
        model: 'claude-sonnet-5-5',
        effort: 'high',
        missing: [],
        mode: 'managed',
        shared: true,
      },
    }),
  );
  await page.route('**/api/ai/assistant', async (route) => {
    const body = route.request().postDataJSON();
    expect(body.agentId).toBeUndefined();
    expect(body.environmentId).toBeUndefined();
    expect(body.code).toBeUndefined();
    expect(body.apiKey).toBeUndefined();
    if (route.request().method() === 'DELETE') {
      expect(body.conversation).toBe('test-conversation-2');
      closed = true;
      return route.fulfill({ json: { closed: true } });
    }
    expect(body.conversation).toBe(turns ? 'test-conversation-1' : undefined);
    turns++;
    return route.fulfill({
      json: {
        reply: `Sugestão ${turns}: mais presença.`,
        operation: 'eq',
        intensity: 65,
        eqPreset: 'presence',
        conversation: `test-conversation-${turns}`,
      },
    });
  });
  await page.goto('/studio/ia');
  await expect(page.getByText('Pronta para ajudar', { exact: true })).toBeVisible();
  for (const label of [
    'IA da plataforma',
    'Agent ID',
    'Environment ID',
    'Código de acesso da NOSSOM',
  ])
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Conectar meu agente', exact: true })).toHaveCount(
    0,
  );
  await page.goto('/studio');
  await page.locator('.assistant-top').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Pronta para ajudar', { exact: true })).toBeVisible();
  await dialog.getByLabel('Descreva seu objetivo').fill('Mais presença na voz.');
  await dialog.getByRole('button', { name: 'Encontrar tratamento', exact: true }).click();
  await expect(page.getByText('Sugestão 1: mais presença.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/studio$/);
  await dialog.getByLabel('Descreva seu objetivo').fill('E a equalização?');
  await dialog.getByRole('button', { name: 'Encontrar tratamento', exact: true }).click();
  await expect(page.getByText('Sugestão 2: mais presença.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Revisar tratamento', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/equalizacao$/);
  await expect.poll(() => closed).toBe(true);
  await page.goto('/studio/ia');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect
    .poll(
      async () =>
        (await page.locator('.studio-sidebar').boundingBox())!.x +
        (await page.locator('.studio-sidebar').boundingBox())!.width,
    )
    .toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'artifacts/nossom-assistente-motion-mobile.png', fullPage: true });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});
