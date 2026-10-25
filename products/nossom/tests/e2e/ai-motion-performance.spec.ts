import { test, expect } from './fixtures';
test('wave moves without DOM path morphing, pauses offscreen and respects reduced motion', async ({
  page,
}) => {
  await page.goto('/');
  const wave = page.locator('.chrome-hero-art .cinematic-ribbon');
  await wave.scrollIntoViewIfNeeded();
  await expect(wave).toHaveClass(/is-running/);
  const field = page.locator('.signal-field');
  await expect(field).toHaveClass(/is-running/);
  const paths = field.locator('.signal-bundle > path');
  await expect(paths).toHaveCount(16);
  const firstLines = await field
    .locator('.signal-bundle')
    .evaluate((el) => getComputedStyle(el).transform);
  const canvas = wave.locator('canvas');
  const first = await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL());
  await page.waitForTimeout(250);
  expect(await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL())).not.toBe(first);
  expect(
    await field.locator('.signal-bundle').evaluate((el) => getComputedStyle(el).transform),
  ).not.toBe(firstLines);
  const mutations = await wave.evaluate(async (el) => {
    let changes = 0;
    const o = new MutationObserver((records) => {
      changes += records.filter((r) => r.attributeName === 'd').length;
    });
    o.observe(el, { subtree: true, attributes: true, attributeFilter: ['d'] });
    await new Promise((r) => setTimeout(r, 1000));
    o.disconnect();
    return changes;
  });
  expect(mutations).toBe(0);
  await page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await expect(wave).not.toHaveClass(/is-running/);
  const paused = await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL());
  await page.waitForTimeout(300);
  expect(await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL())).toBe(paused);
  await wave.scrollIntoViewIfNeeded();
  await expect(wave).toHaveClass(/is-running/);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(wave).not.toHaveClass(/is-running/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(wave.locator('canvas')).toHaveCSS('animation-name', 'none');
  await expect(field.locator('.signal-bundle')).toHaveCSS('animation-name', 'none');
  await expect(field.locator('.signal-pulse').first()).toHaveCSS('animation-name', 'none');
  await page.waitForTimeout(100);
  const reduced = await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL());
  await page.waitForTimeout(300);
  expect(await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL())).toBe(reduced);
});
