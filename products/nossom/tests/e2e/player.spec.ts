import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// O player da plataforma: o último áudio tocado segue tocando ao trocar de ferramenta, volta (pausado, no mesmo ponto)
// depois de recarregar, toca de novo lendo o som do aparelho e some quando a pessoa fecha.
const barra = (page: Page) => page.locator('.player-global');
const tempo = async (page: Page) =>
  Number(await barra(page).getByRole('slider', { name: 'Posição do áudio' }).inputValue());

test('o último áudio continua ao trocar de ferramenta, volta depois de recarregar e some ao fechar', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Do ruído.*ao pronto/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Tudo o que o som pede/ })).toBeVisible();
  await page.screenshot({ path: 'artifacts/home-p2-1440.png', fullPage: true, animations: 'disabled' });
  await page.goto('/studio/automatico');
  await expect(barra(page)).toHaveCount(0);
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-speech.wav');
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
    timeout: 90000,
  });
  // tocar na onda do estúdio liga a barra
  await page.getByRole('button', { name: 'Reproduzir áudio' }).click();
  await expect(barra(page)).toBeVisible();
  await expect(barra(page).getByRole('button', { name: 'Pausar' })).toBeVisible();
  await expect(barra(page).locator('.pg-textos strong')).toHaveText(/\S/);
  await expect.poll(() => tempo(page)).toBeGreaterThan(0.3);

  // trocar de ferramenta não para o som
  for (const tool of ['eq', 'effects', 'master']) {
    const antes = await tempo(page);
    await page
      .getByRole('combobox', { name: 'Ferramenta do estúdio', exact: true })
      .selectOption(tool);
    await expect(barra(page).getByRole('button', { name: 'Pausar' })).toBeVisible();
    await expect.poll(() => tempo(page)).toBeGreaterThan(antes);
  }

  // os quatro passos na lateral: abrir um passo leva à primeira ferramenta dele, com o som tocando
  const lateral = page.getByRole('navigation', { name: 'Navegação do estúdio' });
  const passos = lateral.getByRole('group', { name: 'Passos do estúdio' });
  await expect(passos.getByRole('button', { name: /Entregar/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await passos.getByRole('button', { name: /Ajustar/ }).click();
  await expect(page).toHaveURL(/\/studio\/voz/);
  await expect(passos.getByRole('button', { name: /Ajustar/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await passos.getByRole('button', { name: /Nivelar volumes/ }).click();
  await expect(page).toHaveURL(/\/studio\/nivelamento/);
  await expect(passos.getByRole('button', { name: /Nivelar volumes/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(barra(page).getByRole('button', { name: 'Pausar' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/estudio-p2-1440.png', animations: 'disabled' });

  // pausar na barra pausa a onda também (o mesmo som)
  await barra(page).getByRole('button', { name: 'Pausar' }).click();
  await expect(page.getByRole('button', { name: 'Reproduzir áudio' })).toBeVisible();
  const parado = await tempo(page);
  expect(parado).toBeGreaterThan(0);

  // recarregar: a barra volta pausada no mesmo ponto e toca de novo lendo o som do aparelho
  await page.reload();
  await expect(barra(page)).toBeVisible();
  await expect(barra(page).getByRole('button', { name: 'Tocar' })).toBeVisible();
  expect(Math.abs((await tempo(page)) - parado)).toBeLessThan(1);
  await barra(page).getByRole('button', { name: 'Tocar' }).click();
  await expect(barra(page).getByRole('button', { name: 'Pausar' })).toBeVisible({ timeout: 15000 });
  await expect.poll(() => tempo(page)).toBeGreaterThan(parado);
  await expect(barra(page).locator('.pg-erro')).toHaveCount(0);

  // no celular a barra fica acima das abas do estúdio e não cobre nada da largura
  await page.setViewportSize({ width: 390, height: 844 });
  const caixa = await barra(page).boundingBox();
  const abas = await page.locator('.studio-tabs').boundingBox();
  expect(caixa!.y + caixa!.height).toBeLessThanOrEqual(abas!.y + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/player-390.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'artifacts/player-1440.png', animations: 'disabled' });

  // fechar esquece o áudio, também depois de recarregar
  await barra(page).getByRole('button', { name: 'Fechar o player' }).click();
  await expect(barra(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(barra(page)).toHaveCount(0);
});
