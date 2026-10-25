import { test, expect } from './fixtures';
// A real 64 × 48 PNG drawn in the page, so the browser crop and encode path runs too.
async function picture(page: import('@playwright/test').Page) {
  return Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 48;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#3a8bff';
      context.fillRect(0, 0, 64, 48);
      const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/png'));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }),
  );
}
test('a person can set, see everywhere and remove their profile photo', async ({ page }) => {
  await page.goto('/studio/conta');
  const input = page.getByLabel('Escolher foto de perfil');
  await input.setInputFiles({ name: 'eu.png', mimeType: 'image/png', buffer: await picture(page) });
  await expect(page.getByText('Sua foto foi atualizada.')).toBeVisible();
  const photos = page.locator('.has-photo img');
  await expect(photos.first()).toBeVisible();
  // The photo survives a reload and shows in the sidebar, served only with the session.
  await page.reload();
  await expect(page.locator('.workspace-avatar.has-photo img')).toBeVisible();
  const src = await page.locator('.workspace-avatar img').getAttribute('src');
  const own = await page.request.get(src!);
  expect(own.ok()).toBe(true);
  expect(own.headers()['x-content-type-options']).toBe('nosniff');
  const anonymous = await page.context().browser()!.newContext();
  expect((await anonymous.request.get('http://localhost:3000' + src)).status()).toBe(401);
  await anonymous.close();
  // A disguised file is refused by its real signature.
  const fake = await page.request.put('/api/account/avatar', {
    headers: { Origin: 'http://localhost:3000', 'Content-Type': 'image/png' },
    data: Buffer.from('<svg onload=alert(1)>'),
  });
  expect(fake.status()).toBe(415);
  // The photo and its remove link never run under the name or the email, on phone or desktop.
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const photo = await page.locator('.account-photo').boundingBox();
    const name = await page.locator('.account-settings-summary strong').boundingBox();
    const email = await page.locator('.account-settings-summary p').first().boundingBox();
    expect(photo!.x + photo!.width).toBeLessThanOrEqual(name!.x);
    expect(photo!.x + photo!.width).toBeLessThanOrEqual(email!.x);
  }
  await page.getByRole('button', { name: 'Remover foto' }).click();
  await expect(page.getByText('Sua foto foi removida.')).toBeVisible();
  await expect(page.locator('.workspace-avatar.has-photo')).toHaveCount(0);
});
