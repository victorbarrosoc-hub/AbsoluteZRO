import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
function stereoWav(seconds: number) {
  const rate = 44100,
    frames = Math.round(rate * seconds),
    result = Buffer.alloc(44 + frames * 8);
  result.write('RIFF');
  result.writeUInt32LE(result.length - 8, 4);
  result.write('WAVEfmt ', 8);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(3, 20);
  result.writeUInt16LE(2, 22);
  result.writeUInt32LE(rate, 24);
  result.writeUInt32LE(rate * 8, 28);
  result.writeUInt16LE(8, 32);
  result.writeUInt16LE(32, 34);
  result.write('data', 36);
  result.writeUInt32LE(frames * 8, 40);
  for (let i = 0; i < frames; i++) {
    result.writeFloatLE(0.1 * Math.sin((2 * Math.PI * 220 * i) / rate), 44 + i * 8);
    result.writeFloatLE(0.08 * Math.sin((2 * Math.PI * 330 * i) / rate), 48 + i * 8);
  }
  return result;
}
test('vocals uses the music model, saves a stereo version, and never runs speech enhancement', async ({
  page,
}) => {
  const output = stereoWav(8.345),
    job = '88888888-8888-4888-8888-888888888888';
  let submits = 0,
    cleaned = false;
  await page.route('https://nossom-test.supabase.co/**', (r) =>
    r.fulfill({
      body: r.request().method() === 'PUT' ? '{}' : output,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }),
  );
  await page.route('**/api/audio/jobs*', async (r) => {
    if (r.request().method() === 'GET') {
      if (r.request().url().includes('?id='))
        return r.fulfill({
          json: {
            id: job,
            status: 'completed',
            preset: 'htdemucs-vocals-v1',
            downloadUrls: ['https://nossom-test.supabase.co/vocals'],
            report: {
              preset: 'htdemucs-vocals-v1',
              channels: 2,
              frames: (output.length - 44) / 8,
              sampleRate: 44100,
              gainDb: 0,
              totalBytes: output.length,
              chunks: [{ index: 0, bytes: output.length }],
            },
          },
        });
      return r.fulfill({ json: { configured: true, pending: null } });
    }
    const body = r.request().postDataJSON();
    if (body.action === 'prepare')
      return r.fulfill({
        json: {
          id: job,
          partBytes: 20 * 1024 * 1024,
          uploadUrls: ['https://nossom-test.supabase.co/source'],
        },
      });
    if (body.action === 'submit') {
      expect(body.preset).toBe('htdemucs-vocals-v1');
      submits++;
      return r.fulfill({ json: { id: job, status: 'queued' } });
    }
    if (body.action === 'release') {
      cleaned = true;
      return r.fulfill({ json: { status: 'released' } });
    }
    return r.fulfill({ status: 400 });
  });
  await page.goto('/studio/inicio');
  await page.getByRole('button', { name: 'Isolar voz da música', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/isolar-voz$/);
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-speech.wav');
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await page.getByRole('button', { name: 'Isolar voz da música', exact: true }).click();
  await expect(
    page.getByText('Voz isolada. Compare com a música original e baixe o resultado.', {
      exact: true,
    }),
  ).toBeVisible({ timeout: 90000 });
  expect(submits).toBe(1);
  await expect.poll(() => cleaned).toBe(true);
  await expect(page.locator('.editor-heading')).toContainText('Estéreo');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar WAV', exact: true }).click();
  const saved = await downloaded;
  const wav = await readFile((await saved.path())!);
  expect(wav.readUInt16LE(20)).toBe(3);
  expect(wav.readUInt16LE(22)).toBe(2);
  expect(wav.equals(output)).toBe(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Isolar voz da música', level: 1, exact: true }),
  ).toBeVisible();
  await expect(page.locator('.editor-heading')).toContainText('Estéreo');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page })
    .include('.studio-main')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({
    path: 'artifacts/vocals-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});
