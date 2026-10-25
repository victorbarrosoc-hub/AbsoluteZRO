import { test, expect, signInExisting } from './fixtures';
import AxeBuilder from '@axe-core/playwright';

test('account administration action belongs to the summary with clear separation on phone and desktop', async ({
  page,
}) => {
  const credentials = { email: 'victorbarrosoc@gmail.com', password: 'test-only-password' };
  await signInExisting(page.request, { ...credentials, name: 'Victor Barroso' });
  for (const width of [360, 390, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/studio/conta');
    const summary = page.locator('.account-settings-summary');
    const action = summary.getByRole('link', { name: 'Painel de administração' });
    await expect(action).toBeVisible();
    const grid = await page.locator('.account-settings-grid').boundingBox();
    const button = await action.boundingBox();
    expect(grid!.y - button!.y - button!.height).toBeGreaterThanOrEqual(20);
    const box = await summary.boundingBox();
    expect(button!.x).toBeGreaterThan(box!.x + 10);
    expect(button!.x + button!.width).toBeLessThan(box!.x + box!.width - 10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `artifacts/account-refined-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['light', 'dark']) {
    await page.getByRole('combobox', { name: 'Tema da plataforma' }).selectOption(theme);
    const audit = await new AxeBuilder({ page })
      .include('.account-settings')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({
      path: `artifacts/account-${theme}-mobile.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
});

test('public pages and every studio tool fit mobile and desktop workspaces', async ({ page }) => {
  await page.route('**/api/ai/status', (r) =>
    r.fulfill({ json: { configured: true, authorized: true } }),
  );
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      '/',
      '/apps',
      '/privacidade',
      '/studio',
      '/studio/projetos',
      '/studio/conta',
      '/studio/planos',
      '/studio/automatico',
      '/studio/isolar-voz',
      '/studio/limpeza',
      '/studio/voz',
      '/studio/equalizacao',
      '/studio/vento',
      '/studio/nivelamento',
      '/studio/masterizacao',
      '/studio/efeitos',
      '/studio/mixagem',
    ]) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${path} at ${width}px`,
      ).toBe(true);
      if (['/apps', '/studio', '/studio/automatico', '/studio/projetos'].includes(path))
        await page.screenshot({
          path: `artifacts/review-${path.replaceAll('/', '-') || 'home'}-${width}.png`,
          fullPage: true,
          animations: 'disabled',
        });
    }
  }
});

test('imported audio retains its project when switching tools in the desktop app layout and mobile', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).nossomDesktop = {
      getUpdateState: async () => ({ status: 'unavailable', version: '0.1.1', progress: 0 }),
      onUpdate: () => () => {},
      update: async () => null,
    };
  });
  await page.goto('/studio/automatico');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-speech.wav');
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
    timeout: 90000,
  });
  const project = new URL(page.url()).searchParams.get('project');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tool of ['eq', 'effects', 'master', 'auto']) {
      await page
        .getByRole('combobox', { name: 'Ferramenta do estúdio', exact: true })
        .selectOption(tool);
      expect(new URL(page.url()).searchParams.get('project')).toBe(project);
      await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    const history = await page.locator('.history-panel').boundingBox();
    const title = await page.locator('.history-panel h2').boundingBox();
    expect(title!.x - history!.x).toBeGreaterThanOrEqual(16);
    expect(title!.y - history!.y).toBeGreaterThanOrEqual(16);
    await page.screenshot({
      path: `artifacts/editor-refined-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
});
