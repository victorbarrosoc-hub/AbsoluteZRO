import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';
test('dedicated tools render EQ, apply the supplied multiband preset, and undo/redo persist without destroying audio', async ({
  page,
}, testInfo) => {
  await page.goto('/studio/equalizacao');
  await expect(page.getByRole('heading', { name: 'Equalização', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Seu espaço de criação.' })).toHaveCount(0);
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-speech.wav');
  await expect(page.getByRole('group', { name: 'Presets de equalização' })).toBeVisible({
    timeout: 90000,
  });
  await page.getByRole('button', { name: 'Corpo e calor', exact: false }).click();
  await expect(page.getByRole('slider', { name: 'Ganho em 100 Hz' })).toHaveValue('2.5');
  await page.getByRole('slider', { name: 'Ganho em 100 Hz' }).fill('4');
  await page.getByLabel('Nome do preset', { exact: true }).fill('Minha voz quente');
  await page.getByRole('button', { name: 'Salvar preset', exact: true }).click();
  await page.getByRole('slider', { name: 'Ganho em 100 Hz' }).fill('-2');
  await page.getByRole('button', { name: 'Minha voz quente', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Ganho em 100 Hz' })).toHaveValue('4');
  await page.getByRole('button', { name: 'Aplicar tratamento', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Equalização · V1', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await page
    .getByRole('combobox', { name: 'Ferramenta do estúdio', exact: true })
    .selectOption('master');
  await expect(page).toHaveURL(/\/studio\/masterizacao\?project=/);
  await page.getByRole('button', { name: 'Transmissão + Limite −3 dB', exact: false }).click();
  await expect(page.getByRole('spinbutton', { name: 'Crossover 1', exact: true })).toHaveValue(
    '137',
  );
  await expect(page.getByRole('spinbutton', { name: 'Crossover 2', exact: true })).toHaveValue(
    '1147',
  );
  await expect(page.getByRole('spinbutton', { name: 'Crossover 3', exact: true })).toHaveValue(
    '6910',
  );
  await expect(page.getByRole('spinbutton', { name: 'Amplitude máxima', exact: true })).toHaveValue(
    '-3',
  );
  await expect(
    page.getByRole('spinbutton', { name: 'Aumento de entrada', exact: true }),
  ).toHaveValue('6');
  await expect(page.getByRole('spinbutton', { name: 'Look-ahead', exact: true })).toHaveValue('7');
  await page.getByRole('button', { name: 'Aplicar tratamento', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Preparar entrega · V2', exact: true }),
  ).toBeVisible({ timeout: 90000 });
  const reportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Relatório', exact: true }).click();
  const report = JSON.parse(await readFile((await (await reportDownload).path())!, 'utf8'));
  expect(report.processingSettings.broadcast.bands[0].threshold).toBe(-20.2);
  expect(report.processingSettings.broadcast.bands[3].gain).toBe(3);
  expect(report.processingSettings.masterPreset).toBe('broadcast');
  expect(report.samplePeakDbfs).toBeLessThanOrEqual(-2.98);
  expect(report.after.lufs).not.toBeNull();
  await testInfo.attach('broadcast-report.json', {
    body: JSON.stringify(report),
    contentType: 'application/json',
  });
  await page.getByRole('button', { name: 'Desfazer efeito', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Equalização · V1', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Equalização · V1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refazer efeito', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Preparar entrega · V2', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Restaurar original', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Desfazer efeito', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/broadcast-mobile.png', fullPage: true });
});
test('the assistant page has no personal key, access-code or agent configuration', async ({
  page,
}) => {
  await page.goto('/studio/ia');
  await expect(page.getByLabel('Descreva seu objetivo')).toBeVisible();
  for (const label of [
    'Código de acesso da NOSSOM',
    'Agent ID',
    'Environment ID',
    'IA da plataforma',
  ])
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Conectar Claude', exact: true })).toHaveCount(0);
});
