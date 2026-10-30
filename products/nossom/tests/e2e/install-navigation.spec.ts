import { test, expect, onlyWhenOpen } from './fixtures';
import { mkdir, writeFile } from 'node:fs/promises';
test('compact navigation exposes six destinations, Início first and the Z last, and switches tools without losing the project', async ({
  page,
}) => {
  await page.goto('/studio/automatico');
  const navigation = page.getByRole('navigation', { name: 'Navegação do estúdio', exact: true });
  await expect(navigation.getByRole('button')).toHaveCount(6);
  await expect(navigation.getByRole('button').first()).toHaveText('Início');
  await expect(navigation.getByRole('button').last()).toHaveText('Z');
  await expect(navigation.getByRole('button', { name: 'Estúdio', exact: true })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Meu plano', exact: true })).toBeVisible();
  await expect(navigation.getByText('FERRAMENTAS', { exact: true })).toHaveCount(0);
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-speech.wav');
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await expect(page).toHaveURL(/\/studio\/automatico\?project=/);
  const project = new URL(page.url()).searchParams.get('project');
  const switcher = page.getByRole('combobox', { name: 'Ferramenta do estúdio', exact: true });
  await expect(switcher.locator('optgroup')).toHaveCount(4);
  await switcher.selectOption('effects');
  await expect(page).toHaveURL(/\/studio\/efeitos\?project=/);
  expect(new URL(page.url()).searchParams.get('project')).toBe(project);
  await switcher.selectOption('master');
  await expect(
    page.getByRole('heading', { name: 'Preparar entrega', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('navigation', { name: 'Navegação rápida', exact: true }).getByRole('button'),
  ).toHaveCount(4); // a Z não é aba da barra do celular (titular, 29/10/2026): fica no anel do topo
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/estudio-navegacao-mobile.png', fullPage: true });
});
test('manifest, Apple icon and social metadata serve real correctly sized images', async ({
  page,
  request,
}) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/studio');
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src),
      bytes = await response.body();
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('image/png');
    expect(bytes.readUInt32BE(16)).toBe(Number(icon.sizes.split('x')[0]));
  }
  await page.goto('/');
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes',
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    'content',
    'NOSSOM',
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/pwa/icon-180.png?v=4',
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /^https:\/\/nossom-teal\.vercel\.app\/opengraph-image/,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  );
  const social = await request.get('/opengraph-image'),
    png = await social.body();
  expect(social.ok()).toBeTruthy();
  expect(social.headers()['content-type']).toContain('image/png');
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/nossom-opengraph.png', png);
});
test('iPhone installation help explains the Safari share action and restores focus when closed', async ({
  browser,
}) => {
  onlyWhenOpen();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  await page.goto('/');
  const install = page.getByRole('button', { name: 'Adicionar à Tela de Início', exact: true });
  await install.click();
  const dialog = page.getByRole('dialog', { name: 'Seu som, a um toque.' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Compartilhar', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Adicionar à Tela de Início', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'artifacts/instalar-nossom-iphone.png', fullPage: false });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(install).toBeFocused();
  await context.close();
});
test('the installation action is hidden when opened as an iOS home-screen app', async ({
  page,
}) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Adicionar à Tela de Início', exact: true }),
  ).toHaveCount(0);
});
test('the studio menu lists the Absolute ZRO family with real icons, on desktop and phone', async ({
  page,
}) => {
  await page.goto('/studio/inicio');
  const family = page.getByRole('navigation', { name: 'Absolute ZRO', exact: true });
  // o Maestro entrou na família no lançamento (29/10/2026, MAESTRO_NA_FAMILIA em components/family-nav.tsx)
  const apps = [
    'Absolute ZRO',
    'Carro do Freela',
    'Maestro',
    'Revela',
    'Sobedesce',
    'Synquei',
    'TPEasy',
  ];
  await expect(family.getByRole('link')).toHaveText(apps);
  for (const name of apps) {
    const link = family.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /^https:\/\//);
    await expect(link).toHaveAttribute('target', '_blank');
  }
  await expect(family.getByRole('link', { name: 'NOSSOM' })).toHaveCount(0);
  await expect
    .poll(() =>
      family
        .locator('img')
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  await mkdir('artifacts', { recursive: true });
  await page
    .locator('#studio-navigation')
    .screenshot({ path: 'artifacts/estudio-familia-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Abrir navegação', exact: true }).click();
  await family.getByRole('link', { name: 'Carro do Freela', exact: true }).scrollIntoViewIfNeeded();
  await expect(family.getByRole('link', { name: 'Carro do Freela', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  expect(
    (
      await new AxeBuilder({ page })
        .include('.family-nav')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .locator('#studio-navigation')
    .screenshot({ path: 'artifacts/estudio-familia-mobile.png' });
});
