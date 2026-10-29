import { test, expect } from './fixtures';

test('studio navigation responds without server round trips, supports history and retains the audio', async ({
  page,
}) => {
  await page.goto('/studio/automatico');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-speech.wav');
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
    timeout: 90000,
  });
  const project = new URL(page.url()).searchParams.get('project');
  let serverNavigations = 0;
  await page.route('**/studio**', (route) => {
    if (route.request().headers()['rsc'] || route.request().isNavigationRequest()) {
      serverNavigations++;
      return route.abort();
    }
    return route.continue();
  });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const navigation = page.getByRole('navigation', {
      name: width < 680 ? 'Navegação rápida' : 'Navegação do estúdio',
      exact: true,
    });
    await navigation
      .getByRole('button', { name: width < 680 ? 'Conta' : 'Minha conta', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Minha conta.', exact: true })).toBeVisible({
      timeout: 1000,
    });
    await expect(page).toHaveURL(/\/studio\/conta$/);
    await navigation
      .getByRole('button', { name: width < 680 ? 'Projetos' : /^Meus projetos/ })
      .click();
    await expect(page.getByRole('heading', { name: 'Meus projetos.', exact: true })).toBeVisible({
      timeout: 1000,
    });
    await navigation.getByRole('button', { name: 'Estúdio', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
      timeout: 1000,
    });
    expect(new URL(page.url()).searchParams.get('project')).toBe(project);
    await page
      .getByRole('combobox', { name: 'Ferramenta do estúdio', exact: true })
      .selectOption('eq');
    await expect(
      page.getByRole('heading', { name: 'Equalização', exact: true, level: 1 }),
    ).toBeVisible({ timeout: 1000 });
    await page.goBack();
    await expect(
      page.getByRole('heading', { name: 'Restaurar com IA', exact: true, level: 1 }),
    ).toBeVisible({ timeout: 1000 });
    await page.goForward();
    await expect(
      page.getByRole('heading', { name: 'Equalização', exact: true, level: 1 }),
    ).toBeVisible({ timeout: 1000 });
    await page
      .getByRole('combobox', { name: 'Ferramenta do estúdio', exact: true })
      .selectOption('auto');
  }
  expect(serverNavigations).toBe(0);
  await page.unroute('**/studio**');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('project')).toBe(project);
});

test('account menu links also change screens locally', async ({ page }) => {
  await page.goto('/studio/inicio');
  let serverNavigations = 0;
  await page.route('**/studio**', (route) => {
    if (route.request().headers()['rsc'] || route.request().isNavigationRequest()) {
      serverNavigations++;
      return route.abort();
    }
    return route.continue();
  });
  await page.getByRole('button', { name: /Abrir menu da conta/ }).click();
  await page.getByRole('link', { name: 'Configurações da conta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Minha conta.', exact: true })).toBeVisible({
    timeout: 1000,
  });
  expect(serverNavigations).toBe(0);
});
