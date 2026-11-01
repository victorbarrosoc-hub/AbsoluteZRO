import { test, expect, OPEN, definirTema } from './fixtures';

// Fechado ao público, só a conta liberada vê a página inicial: ela age como nos outros apps da Absolute ZRO, com a
// conta no topo, os apps da família no menu e "Abrir o estúdio", inclusive no celular (titular, 01/11/2026).
test('a conta liberada volta ao estúdio pela página inicial, no computador e no celular', async ({
  page,
}) => {
  test.skip(OPEN, 'descreve o NOSSOM fechado ao público');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByText(/Em desenvolvimento/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Conhecer o projeto/ })).toHaveCount(0);
  const topo = page.locator('.ns-header');
  await expect(topo.getByRole('button', { name: 'Abrir menu da conta' })).toBeVisible();
  await expect(topo.getByRole('link', { name: /Abrir o estúdio/ }).last()).toBeVisible();

  // o menu da conta traz os atalhos e os apps da família
  await topo.getByRole('button', { name: 'Abrir menu da conta' }).click();
  const menu = page.getByRole('dialog');
  await expect(menu.getByRole('link', { name: /Meus projetos/ })).toBeVisible();
  await expect(menu.getByRole('navigation', { name: 'Absolute ZRO' })).toBeVisible();
  await expect(menu.getByRole('link', { name: /Carro do Freela/ })).toBeVisible();
  await expect(menu.getByRole('link', { name: /Revela/ })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/home-logada-menu-1440.png', animations: 'disabled' });
  await page.keyboard.press('Escape');

  // no celular: a conta no topo e o estúdio no menu e no título
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(topo.getByRole('button', { name: 'Abrir menu da conta' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/home-logada-390.png', animations: 'disabled' });
  await topo.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await topo
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: /Abrir o estúdio/ })
    .click();
  await expect(page).toHaveURL(/\/studio/);

  await page.goto('/');
  await page.locator('.home-hero').getByRole('link', { name: 'Abrir o estúdio' }).click();
  await expect(page).toHaveURL(/\/studio/);
});

test('no celular o estúdio tem o botão de tema e o menu mostra o nome de cada app', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/studio/inicio');
  await definirTema(page, 'light');
  await page.screenshot({ path: 'artifacts/estudio-claro-390.png', animations: 'disabled' });
  await definirTema(page, 'dark');
  await page.getByRole('button', { name: 'Abrir navegação', exact: true }).click();
  const familia = page.getByRole('navigation', { name: 'Absolute ZRO', exact: true });
  const carro = familia.getByRole('link', { name: 'Carro do Freela', exact: true });
  await carro.scrollIntoViewIfNeeded();
  await expect(carro.locator('span')).toHaveText('Carro do Freela');
  expect(
    await carro.locator('span').evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThan(10);
  await page.screenshot({ path: 'artifacts/estudio-menu-390.png', animations: 'disabled' });
});
