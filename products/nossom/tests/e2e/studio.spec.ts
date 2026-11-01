import { test, expect, onlyWhenOpen, definirTema } from './fixtures';
function waveFixture(seconds = 4, stereo = false) {
  const rate = 48000,
    channels = stereo ? 2 : 1,
    frames = rate * seconds,
    b = Buffer.alloc(44 + frames * channels * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * channels * 2, 28);
  b.writeUInt16LE(channels * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(b.length - 44, 40);
  let seed = 42;
  for (let i = 0; i < frames; i++) {
    seed = (seed * 16807) % 2147483647;
    const t = i / rate;
    const value =
      (Math.sin(t * 2 * Math.PI * 220) * 0.12 + Math.sin(t * 2 * Math.PI * 440) * 0.03) *
        (Math.sin(t * 3) ** 2 * 0.7 + 0.3) +
      (seed / 2147483647 - 0.5) * 0.015;
    for (let c = 0; c < channels; c++)
      b.writeInt16LE(Math.round(value * (c === 1 ? 0.7 : 1) * 32767), 44 + (i * channels + c) * 2);
  }
  return b;
}
test('landing, responsive navigation, functional demonstration and assistant', async ({ page }) => {
  // Descreve o produto aberto (entrar, assinar, home com ações, /apps).
  onlyWhenOpen();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Do ruído.*ao pronto/ })).toBeVisible();
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForTimeout(850);
  await page.screenshot({ path: 'test-results/landing-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Ouvir demonstração' }).click();
  await expect(page.getByRole('button', { name: 'Pausar demonstração' })).toBeVisible();
  await page.getByRole('button', { name: 'Quasar', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar demonstração' }).click();
  await page.route('**/api/ai/status', (r) =>
    r.fulfill({ json: { configured: false, authorized: true } }),
  );
  await page.goto('/studio/inicio');
  await page.getByLabel('Descreva seu objetivo').fill('Reduzir ruído de uma entrevista');
  await page.getByRole('button', { name: 'Encontrar tratamento' }).click();
  await expect(page.getByRole('button', { name: 'Revisar tratamento' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Conectar Claude Sonnet 5.5', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Planos', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fechar menu' }).click();
  await page.screenshot({ path: 'test-results/landing-mobile.png', fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
test('real audio workflow: import, general denoise, A/B, master, report, export, persist, rename and delete', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/studio/limpeza');
  await page.screenshot({ path: 'test-results/studio-home.png', fullPage: true });
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles({ name: 'entrevista.wav', mimeType: 'audio/wav', buffer: waveFixture(5, true) });
  await expect(
    page.locator('.editor-heading p').getByText('entrevista', { exact: true }),
  ).toBeVisible({
    timeout: 90000,
  });
  await expect(page.getByText('Estéreo', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Ajustar manualmente', exact: true }).click();
  await page.getByRole('button', { name: 'Áudio geral', exact: false }).click();
  await expect(page.getByRole('button', { name: 'Aplicar tratamento' })).toBeEnabled();
  await page.getByRole('button', { name: 'Reproduzir áudio' }).click();
  await expect(page.getByRole('button', { name: 'Pausar áudio' })).toBeVisible();
  await page.getByRole('button', { name: 'Pausar áudio' }).click();
  await page.getByRole('button', { name: 'Aplicar tratamento' }).click();
  await expect(page.getByRole('heading', { name: 'Reduzir ruído · V1', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await page.getByRole('button', { name: 'A · Original', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Arquivo original', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'B · Resultado', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Ferramenta do estúdio', exact: true })
    .selectOption('master');
  await page.getByRole('button', { name: 'Aplicar tratamento' }).click();
  await expect(
    page.getByRole('heading', { name: 'Preparar entrega · V2', exact: true }),
  ).toBeVisible({ timeout: 90000 });
  const reportPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Relatório', exact: true }).click();
  const report = await reportPromise;
  const reportPath = await report.path();
  const fs = await import('node:fs/promises');
  const data = JSON.parse(await fs.readFile(reportPath!, 'utf8'));
  console.log('Delivery verification:', JSON.stringify(data.after));
  expect(data.after.lufs).not.toBeNull();
  expect(Math.abs(data.after.lufs - -16)).toBeLessThan(1);
  expect(data.after.truePeak).toBeLessThanOrEqual(-0.8);
  expect(data.output.channels).toBe(2);
  const wavPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar WAV', exact: true }).click();
  const wav = await wavPromise;
  const wavBuffer = await fs.readFile((await wav.path())!);
  expect(wavBuffer.subarray(0, 4).toString()).toBe('RIFF');
  expect(wavBuffer.length).toBeGreaterThan(10000);
  const mp3Promise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'MP3', exact: true }).click();
  const mp3 = await mp3Promise;
  expect((await fs.stat((await mp3.path())!)).size).toBeGreaterThan(1000);
  await page.screenshot({ path: 'test-results/studio-editor.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/studio-editor-mobile.png', fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Renomear projeto' }).click();
  await page.getByLabel('Nome do projeto').fill('Podcast NOSSOM');
  await page.getByRole('button', { name: 'Salvar nome', exact: true }).click();
  await expect(
    page.locator('.editor-heading p').getByText('Podcast NOSSOM', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator('.editor-heading p').getByText('Podcast NOSSOM', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Meus projetos', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir Podcast NOSSOM' }).click();
  await page.getByRole('button', { name: 'Excluir projeto', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Seu próximo projeto começa com um arquivo.' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('rejects invalid uploads without losing a project, supports selection and actual music ducking', async ({
  page,
}) => {
  await page.goto('/studio/automatico');
  await page.getByLabel('Importar arquivo de áudio', { exact: true }).setInputFiles({
    name: 'invalid.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('not audio'),
  });
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 90000 });
  await page.getByRole('button', { name: 'Dispensar erro' }).click();
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles({ name: 'voz.wav', mimeType: 'audio/wav', buffer: waveFixture(3) });
  await expect(page.locator('.editor-heading p').getByText('voz', { exact: true })).toBeVisible({
    timeout: 90000,
  });
  await page.getByRole('button', { name: 'Selecionar trecho', exact: true }).click();
  await page.getByLabel('Início do trecho em segundos').fill('0.5');
  await page.getByLabel('Fim do trecho em segundos').fill('2');
  await page
    .getByRole('combobox', { name: 'Ferramenta do estúdio', exact: true })
    .selectOption('wind');
  await page.getByRole('button', { name: 'Aplicar tratamento' }).click();
  await expect(page.getByRole('heading', { name: 'Atenuar vento · V1', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await page.getByRole('button', { name: 'Áudio inteiro', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Ferramenta do estúdio', exact: true })
    .selectOption('mix');
  await page
    .getByLabel('Importar trilha de música', { exact: true })
    .setInputFiles({ name: 'trilha.wav', mimeType: 'audio/wav', buffer: waveFixture(2, true) });
  await expect(page.getByRole('button', { name: 'trilha.wav', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await expect(page.getByRole('button', { name: 'Aplicar tratamento' })).toBeEnabled();
  await page.getByRole('button', { name: 'Aplicar tratamento' }).click();
  await expect(
    page.getByRole('heading', { name: 'Mixar com música · V2', exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await expect(page.locator('.alert.error')).toHaveCount(0);
});

test('landing and studio expose accessible names and sufficient text contrast', async ({
  page,
}) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  for (const path of ['/', '/studio/inicio']) {
    await page.goto(path);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo({ top: y, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 80));
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(result.violations).toEqual([]);
  }
});

test('cancelling an import preserves saved projects and lets the user retry', async ({ page }) => {
  await page.goto('/studio/automatico');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles({ name: 'cancelar.wav', mimeType: 'audio/wav', buffer: waveFixture(10) });
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('.processing-banner')).toHaveCount(0, { timeout: 65000 });
  await expect(
    page.locator('.editor-heading p').getByText('cancelar', { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.alert.error')).toContainText('cancelado');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles({ name: 'nova-tentativa.wav', mimeType: 'audio/wav', buffer: waveFixture(2) });
  await expect(
    page.locator('.editor-heading p').getByText('nova-tentativa', { exact: true }),
  ).toBeVisible({
    timeout: 90000,
  });
});

test('microphone recording can be imported, enhanced and leveled', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await page.goto('/studio/automatico');
  await page.getByRole('button', { name: 'Gravar uma ideia', exact: true }).click();
  await expect(page.getByRole('button', { name: /Finalizar/ })).toBeVisible();
  // Chromium supplies a synthetic microphone, so no real person is recorded.
  await expect(page.getByRole('button', { name: 'Finalizar · 0:02', exact: true })).toBeVisible({
    timeout: 5000,
  });
  await page.getByRole('button', { name: /Finalizar/ }).click();
  await expect(page.locator('.editor-heading p').getByText(/^Gravação /)).toBeVisible({
    timeout: 90000,
  });
  await page
    .getByRole('combobox', { name: 'Ferramenta do estúdio', exact: true })
    .selectOption('clarity');
  await page.getByRole('button', { name: 'Analisar e tratar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Melhorar voz · V1', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await page
    .getByRole('combobox', { name: 'Ferramenta do estúdio', exact: true })
    .selectOption('level');
  await page.getByRole('button', { name: 'Aplicar tratamento' }).click();
  await expect(
    page.getByRole('heading', { name: 'Nivelar volumes · V2', exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await expect(page.locator('.alert.error')).toHaveCount(0);
});

test('studio themes persist, responsive layouts fit and reduced motion pauses demonstrations', async ({
  page,
}) => {
  await page.goto('/studio/inicio');
  await definirTema(page, 'light');
  await page.reload();
  await expect(page.locator('.studio-shell')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Tema claro', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await definirTema(page, theme as 'light' | 'dark');
    // Audit settled colors, after the existing 200 ms theme transition.
    // nth(2): Meus projetos (Z e Início vêm antes).
    await expect(page.locator('.studio-sidebar nav > button').nth(2)).toHaveCSS(
      'color',
      theme === 'light' ? 'rgb(101, 101, 107)' : 'rgb(185, 198, 218)',
    );
    for (const width of [1440, 1000, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(audit.violations).toEqual([]);
    }
  }
  await page
    .getByRole('navigation', { name: 'Navegação rápida' })
    .getByRole('button', { name: 'Projetos', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Meus projetos.' })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('.chrome-hero-art')).toBeVisible();
  expect(
    await page
      .locator('.chrome-hero-art .ribbon-canvas')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  // a home da Proposta 2 (titular, 01/11/2026) é preta
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(0, 0, 0)',
  );
});
