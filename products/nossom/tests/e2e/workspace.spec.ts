import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
test('home is the assistant, attaches an audio file, sends measurements and opens the reviewed treatment', async ({
  page,
}) => {
  let measured = false;
  await page.route('**/api/ai/status', (r) =>
    r.fulfill({ json: { configured: true, authorized: true, shared: true } }),
  );
  await page.route('**/api/ai/assistant', (r) => {
    if (r.request().method() === 'DELETE') return r.fulfill({ json: { closed: true } });
    const body = r.request().postDataJSON();
    expect(body.context.duration).toBeGreaterThan(0);
    expect(body.apiKey).toBeUndefined();
    measured = true;
    return r.fulfill({
      json: {
        reply: 'Vamos tratar a gravação.',
        operation: 'auto',
        intensity: 100,
        conversation: 'test-audio-plan',
      },
    });
  });
  await page.goto('/studio/inicio');
  await expect(page.getByRole('heading', { name: 'Seu áudio, melhor.' })).toBeVisible();
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-speech.wav');
  await expect(page.getByText('synthetic-speech.wav', { exact: true })).toBeVisible({
    timeout: 90000,
  });
  await expect(page).toHaveURL(/\/studio\/inicio$/);
  await page.getByLabel('Descreva seu objetivo').fill('Trate meu áudio');
  await page.getByRole('button', { name: 'Encontrar tratamento', exact: true }).click();
  await expect(page.getByText('Vamos tratar a gravação.', { exact: true })).toBeVisible();
  expect(measured).toBe(true);
  await page.getByRole('button', { name: 'Revisar tratamento', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/automatico\?project=/);
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible();
});
test('mobile sidebar always closes and install dialog is centered outside it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/studio/inicio');
  const toggle = page.getByRole('button', { name: 'Abrir navegação', exact: true });
  await toggle.click();
  await page.getByRole('button', { name: 'Fechar navegação', exact: true }).click();
  await expect(page.locator('.studio-sidebar')).not.toHaveClass(/open/);
  await toggle.click();
  await page
    .getByRole('button', { name: 'Fechar navegação ao tocar fora', exact: true })
    .click({ position: { x: 375, y: 100 } });
  await expect(page.locator('.studio-sidebar')).not.toHaveClass(/open/);
  await toggle.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.studio-sidebar')).not.toHaveClass(/open/);
  await toggle.click();
  await page
    .getByRole('navigation', { name: 'Navegação do estúdio', exact: true })
    .getByRole('button', { name: 'Início', exact: true })
    .click();
  await expect(page.locator('.studio-sidebar')).not.toHaveClass(/open/);
  await toggle.click();
  await page.getByRole('button', { name: 'Adicionar à Tela de Início', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Seu som, a um toque.' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('.studio-sidebar')).not.toHaveClass(/open/);
  const box = await dialog.boundingBox();
  expect(box!.width).toBeGreaterThan(330);
  expect(Math.abs(box!.x - (390 - box!.width) / 2)).toBeLessThan(3);
  expect(box!.height).toBeLessThanOrEqual(820);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'artifacts/nossom-install-mobile-fixed.png', fullPage: true });
  await page.getByRole('button', { name: 'Entendi', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(toggle).toBeFocused();
});
test('account settings save the profile, require current password and preserve appearance on reload', async ({
  page,
}) => {
  await page.goto('/studio/conta');
  await page.getByLabel('Nome de exibição', { exact: true }).fill('Novo nome Motion');
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Seu perfil foi atualizado.' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Nome de exibição', { exact: true })).toHaveValue(
    'Novo nome Motion',
  );
  await page.getByLabel('Senha atual', { exact: true }).fill('invalid-password');
  await page.getByLabel('Nova senha', { exact: true }).fill('new-valid-password');
  await page.getByRole('button', { name: 'Atualizar senha', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Sua senha atual não foi confirmada.' }),
  ).toBeVisible();
  await page.getByLabel('Senha atual', { exact: true }).fill('valid-test-password');
  await page.getByRole('button', { name: 'Atualizar senha', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Sua senha foi atualizada.' }),
  ).toBeVisible();
  await page.getByLabel('Tema da plataforma', { exact: true }).selectOption('light');
  await page.reload();
  await expect(page.getByLabel('Tema da plataforma', { exact: true })).toHaveValue('light');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
  await page.screenshot({ path: 'artifacts/nossom-account-settings-mobile.png', fullPage: true });
});
test('readable controls fit mobile and desktop; desktop navigation collapses and download options have no dead links', async ({
  page,
}) => {
  await page.goto('/studio/inicio');
  await page.getByRole('button', { name: 'Recolher navegação', exact: true }).click();
  await expect(page.locator('.studio-shell')).toHaveClass(/nav-collapsed/);
  await page.reload();
  await expect(page.locator('.studio-shell')).toHaveClass(/nav-collapsed/);
  await page.getByRole('button', { name: 'Expandir navegação', exact: true }).click();
  await expect(page.locator('.studio-shell')).not.toHaveClass(/nav-collapsed/);
  for (const width of [1440, 1000, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByLabel('Descreva seu objetivo')).toHaveCSS(
      'font-size',
      width === 390 ? '16px' : '17px',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await expect
    .poll(async () => {
      const b = await page.locator('.studio-sidebar').boundingBox();
      return b!.x + b!.width;
    })
    .toBeLessThanOrEqual(0);
  await expect
    .poll(async () => (await page.locator('.studio-body').boundingBox())!.x)
    .toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'artifacts/nossom-ai-start-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(async () => (await page.locator('.studio-sidebar').boundingBox())!.x).toBe(0);
  await page.screenshot({ path: 'artifacts/nossom-ai-start-desktop.png', fullPage: true });
  await page.goto('/apps');
  await expect(
    page.getByRole('heading', { name: 'Mac · Apple Silicon', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Windows', exact: true })).toBeVisible();
  const downloads = page.locator('.apps-grid a.button.primary');
  const pending = page.getByRole('button', { name: 'Instalador em preparação', exact: true });
  expect((await downloads.count()) + (await pending.count())).toBe(3);
  await expect(page.getByRole('link', { name: 'Baixar para Windows', exact: true })).toBeVisible();
  for (const link of await downloads.all()) {
    // Repositórios privados: a página aponta para a rota /baixar deste site (ou para um override HTTPS).
    expect(await link.getAttribute('href')).toMatch(
      /^(\/baixar\/(mac-arm64|mac-x64|windows)|https:\/\/(?!github\.com\/).+)$/,
    );
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/');
  for (const width of [1440, 1000, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
