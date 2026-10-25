import { test, expect, type Page } from './fixtures';
import { readFile } from 'node:fs/promises';
import { deliveryPresets } from '../../lib/presets';
async function report(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Relatório', exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
}
async function render(page: Page, heading: string) {
  await page.getByRole('button', { name: 'Aplicar tratamento', exact: true }).click();
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible({
    timeout: 90000,
  });
}
test('each destination renders to its measured loudness and true-peak reference', async ({
  page,
}, testInfo) => {
  await page.goto('/studio/masterizacao');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-speech.wav');
  await expect(page.getByRole('button', { name: 'Aplicar tratamento', exact: true })).toBeVisible({
    timeout: 90000,
  });
  const results = [];
  for (const [i, preset] of deliveryPresets.entries()) {
    if (i > 0) await page.getByRole('button', { name: 'Restaurar original', exact: true }).click();
    await page.getByRole('button', { name: preset.label, exact: false }).click();
    await expect(page.getByRole('slider', { name: 'Volume final', exact: true })).toHaveValue(
      String(preset.lufs),
    );
    if (preset.id === 'netflix-dialogue')
      await expect(page.getByText(preset.note, { exact: true })).toBeVisible();
    await render(page, `Preparar entrega · V${i + 1}`);
    const result = await report(page);
    expect(result.processingSettings.masterPreset).toBe(preset.id);
    expect(Math.abs(result.after.lufs - preset.lufs)).toBeLessThanOrEqual(0.75);
    expect(result.after.truePeak).toBeLessThanOrEqual(preset.peak + 0.15);
    results.push({ destination: preset.id, measured: result.after });
  }
  await testInfo.attach('destination-levels.json', {
    body: JSON.stringify(results),
    contentType: 'application/json',
  });
});
test('effects retain their tails, replace rather than stack, save settings and can be removed', async ({
  page,
}) => {
  await page.goto('/studio/efeitos');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-speech.wav');
  await expect(page.getByRole('group', { name: 'Presets de efeitos' })).toBeVisible({
    timeout: 90000,
  });
  const original = await report(page);
  const effects = page.getByRole('group', { name: 'Presets de efeitos' });
  await effects.getByRole('button', { name: 'Capela', exact: false }).click();
  await page.getByRole('slider', { name: 'Intensidade do efeito', exact: true }).fill('45');
  await page.getByLabel('Nome do preset', { exact: true }).fill('Minha capela');
  await page.getByRole('button', { name: 'Salvar preset', exact: true }).click();
  await render(page, 'Efeitos · V1');
  const chapel = await report(page);
  expect(chapel.processingSettings.effect).toBe('chapel');
  expect(chapel.processingSettings.effectMix).toBe(45);
  expect(chapel.output.duration).toBeCloseTo(original.output.duration + 1.4, 2);
  await effects.getByRole('button', { name: 'Igreja', exact: false }).click();
  await render(page, 'Efeitos · V2');
  const church = await report(page);
  expect(church.output.duration).toBeCloseTo(original.output.duration + 4.3, 2);
  expect(church.processingSettings.effect).toBe('church');
  await page.getByRole('button', { name: 'Remover efeito', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible();
  await effects.getByRole('button', { name: 'Telefone', exact: false }).click();
  await render(page, 'Efeitos · V3');
  const telephone = await report(page);
  expect(telephone.output.duration).toBeCloseTo(original.output.duration, 3);
  expect(telephone.processingSettings.effect).toBe('telephone');
  await page.reload();
  await page.getByRole('button', { name: 'Minha capela', exact: true }).click();
  await expect(
    page.getByRole('slider', { name: 'Intensidade do efeito', exact: true }),
  ).toHaveValue('45');
  await expect(effects.getByRole('button', { name: 'Capela', exact: false })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'artifacts/efeitos-mobile.png', fullPage: true });
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});
test('delivery remains an explicit finishing choice and preserves the selected source', async ({
  page,
}) => {
  await page.goto('/studio/masterizacao');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-speech.wav');
  const destination = page.getByLabel('ONDE ESSE SOM VAI CHEGAR?', { exact: true });
  await expect(destination).toBeVisible({ timeout: 90000 });
  const original = await report(page);
  for (const [i, id] of ['youtube', 'netflix-dialogue'].entries()) {
    if (i) await page.getByRole('button', { name: 'Restaurar original', exact: true }).click();
    const preset = deliveryPresets.find((p) => p.id === id)!;
    await destination.selectOption(id);
    await page.getByRole('button', { name: 'Aplicar tratamento', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: `Preparar entrega · V${i + 1}`, exact: true }),
    ).toBeVisible({ timeout: 90000 });
    const result = await report(page);
    expect(result.processingSettings.masterPreset).toBe(id);
    expect(Math.abs(result.after.lufs - preset.lufs)).toBeLessThanOrEqual(0.75);
    expect(result.after.truePeak).toBeLessThanOrEqual(preset.peak + 0.15);
    expect(result.output.duration).toBeCloseTo(original.output.duration, 3);
    expect(result.history[i + 1].parentId).toBe(original.activeVersionId);
  }
});
test('homepage renders without the two removed phrases and decorative arrow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Seu som,.*em outra escala/ })).toBeVisible();
  await expect(
    page.getByText('INTELIGÊNCIA E SENSIBILIDADE. NO MESMO SOM.', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Do primeiro impulso.', { exact: false })).toHaveCount(0);
  await expect(page.locator('.ns-ribbon-note')).toHaveCount(0);
});
test('studio voice finishing renders a close-mic chain at podcast loudness without clipping', async ({
  page,
}) => {
  await page.goto('/studio/masterizacao');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-speech.wav');
  await expect(page.getByRole('button', { name: 'Aplicar tratamento', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await page.getByRole('button', { name: 'Voz de estúdio', exact: false }).click();
  await expect(page.getByRole('slider', { name: 'Volume final', exact: true })).toHaveValue('-16');
  await render(page, 'Preparar entrega · V1');
  const result = await report(page);
  expect(result.processingSettings.masterPreset).toBe('studio-voice');
  expect(Math.abs(result.after.lufs - -16)).toBeLessThanOrEqual(0.75);
  expect(result.after.truePeak).toBeLessThanOrEqual(-1 + 0.15);
});
