// The homepage. Open to the public, no account is needed; closed (titular, 01/11/2026) only the allowed account
// sees it, so the checks that hold in both states use the fixture session (`comAcesso`).
import { onlyWhenOpen, test as comAcesso } from './fixtures';
import { test, expect } from '@playwright/test';

test('glass navigation follows the pointer and the section, shrinks on scroll and keeps interface sounds optional', async ({
  page,
}) => {
  // Descreve o produto aberto (entrar, assinar, home com ações, /apps).
  onlyWhenOpen();
  await page.addInitScript(() => {
    const created: string[] = [];
    (window as unknown as { uiSounds: string[] }).uiSounds = created;
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      created.push('osc');
      return original.call(this);
    };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  await nav.getByRole('link', { name: 'Planos', exact: true }).hover();
  await expect(nav.locator('a', { hasText: 'Planos' }).locator('.nav-lens')).toHaveCount(1);
  await expect(page.locator('.ns-header')).not.toHaveClass(/is-scrolled/);
  await page.evaluate(() => scrollTo({ top: document.getElementById('planos')!.offsetTop }));
  await expect(page.locator('.ns-header')).toHaveClass(/is-scrolled/);
  await page.mouse.move(5, 500);
  await expect(nav.locator('a[aria-current="true"]')).toHaveText('Planos');

  // Sounds are synthesized after a click and stop once the person turns them off.
  const sounds = () =>
    page.evaluate(() => (window as unknown as { uiSounds: string[] }).uiSounds.length);
  await nav.getByRole('link', { name: 'Ferramentas', exact: true }).click();
  await nav.getByRole('link', { name: 'Planos', exact: true }).click();
  await expect.poll(sounds).toBeGreaterThan(0);
  const toggle = page.getByRole('button', { name: 'Sons da interface' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const before = await sounds();
  await nav.getByRole('link', { name: 'Ferramentas', exact: true }).click();
  await page.waitForTimeout(200);
  expect(await sounds()).toBe(before);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sons da interface' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('mobile plans swipe sideways without widening the page and step art rests under reduced motion', async ({
  page,
}) => {
  // Descreve o produto aberto (entrar, assinar, home com ações, /apps).
  onlyWhenOpen();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const grid = page.locator('.plans-grid');
  await grid.scrollIntoViewIfNeeded();
  expect(await grid.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page
      .locator('.step-art .bar')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  const link = page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Planos', exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole('button', { name: 'Abrir menu', exact: true })).toBeVisible();
});
comAcesso(
  'the floating capsule stays below the iPhone status bar safe area, at rest and while scrolling',
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    // Chromium reports no safe area; emulate an iPhone status bar of 59 px.
    await page.addStyleTag({ content: '.chrome-site .ns-header{--safe-top:59px}' });
    const top = () => page.locator('.ns-nav').evaluate((el) => el.getBoundingClientRect().top);
    expect(await top()).toBeGreaterThanOrEqual(59 + 8);
    await page.evaluate(() => scrollTo({ top: 1600, behavior: 'instant' }));
    await expect(page.locator('.ns-header')).toHaveClass(/is-scrolled/);
    expect(await top()).toBeGreaterThanOrEqual(59 + 8);
  },
);
test('the opening animation plays once per session, never blocks taps and respects reduced motion', async ({
  page,
}) => {
  // Descreve o produto aberto (entrar, assinar, home com ações, /apps).
  onlyWhenOpen();
  // Automation skips the intro; present a regular browser for this check.
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'webdriver', { get: () => false }),
  );
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-intro', 'play');
  const intro = page.locator('.brand-intro');
  expect(await intro.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  await page.getByRole('link', { name: 'Limpar fala' }).click({ trial: true });
  await expect(intro).toBeHidden({ timeout: 4000 });
  await expect(page.locator('html')).toHaveAttribute('data-intro', 'done');
  // Menus opened after the intro appear at once and stay visible.
  await page
    .getByRole('button', { name: /menu da conta|Entrar na sua conta/ })
    .first()
    .click();
  const backdrop = page.locator('.account-menu-backdrop');
  await expect(backdrop).toBeVisible();
  await page.waitForTimeout(400);
  expect(Number(await backdrop.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(
    0.9,
  );
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-intro', 'skip');
  const reduced = await page.context().newPage();
  await reduced.emulateMedia({ reducedMotion: 'reduce' });
  await reduced.addInitScript(() =>
    Object.defineProperty(navigator, 'webdriver', { get: () => false }),
  );
  await reduced.goto('/');
  await expect(reduced.locator('html')).toHaveAttribute('data-intro', 'skip');
  await expect(reduced.locator('.brand-intro')).toBeHidden();
});
