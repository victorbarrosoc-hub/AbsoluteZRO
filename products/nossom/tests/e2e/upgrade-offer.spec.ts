import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
// The minutes are served by the account's real usage endpoint; here they are set per step.
async function minutesLeft(page: Page, remaining: number, planId = 'free', limit = 300) {
  await page.unroute('**/api/usage');
  await page.route('**/api/usage', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          json: {
            allowed: remaining >= 60,
            used: limit - remaining,
            remaining,
            limit,
            unlimited: false,
            resetAt: '2026-11-01T03:00:00Z',
            unit: 'seconds',
            planId,
            planName:
              planId === 'free' ? 'Grátis' : planId === 'essential' ? 'Essencial' : 'Studio',
            usedSeconds: limit - remaining,
            limitSeconds: limit,
            remainingSeconds: remaining,
          },
        })
      : route.continue(),
  );
}
test('running low offers the next plan once per stage, closes without fuss and never shows on the top plan', async ({
  page,
}) => {
  await minutesLeft(page, 270);
  await page.goto('/studio/inicio');
  await expect(page.locator('.weekly-usage')).toContainText('4,5 de 5 min');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // The last two minutes of a small allowance.
  await minutesLeft(page, 90);
  await page.reload();
  const offer = page.getByRole('dialog', { name: 'Seus minutos estão acabando.' });
  await expect(offer).toBeVisible();
  await expect(offer).toContainText('Restam 1,5 de 5 min neste mês.');
  await expect(offer).toContainText('Essencial');
  await expect(offer).toContainText('R$ 39');
  expect(
    (
      await new AxeBuilder({ page })
        .include('.upgrade-offer')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(offer).toHaveCount(0);
  // Same stage, same month: not again.
  await page.reload();
  await expect(page.locator('.weekly-usage')).toContainText('1,5 de 5 min');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Out of minutes is a new stage; choosing the plan opens it on the plan page.
  await minutesLeft(page, 30);
  await page.reload();
  const out = page.getByRole('dialog', { name: 'Seus minutos do mês acabaram.' });
  await expect(out).toBeVisible();
  await out.getByRole('button', { name: 'Ver o Essencial' }).click();
  await expect(page).toHaveURL(/\/studio\/planos\?plano=essential$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Studio is the top plan: nothing to offer.
  await minutesLeft(page, 30, 'studio', 21600);
  await page.goto('/studio/projetos');
  await expect(page.locator('.weekly-usage')).toContainText('0,5 de 360 min');
  await page.waitForTimeout(500);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
