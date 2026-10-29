import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
function floatWav(seconds: number, rate: number, channels: number) {
  const frames = Math.round(rate * seconds),
    result = Buffer.alloc(44 + frames * channels * 4);
  result.write('RIFF');
  result.writeUInt32LE(result.length - 8, 4);
  result.write('WAVEfmt ', 8);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(3, 20);
  result.writeUInt16LE(channels, 22);
  result.writeUInt32LE(rate, 24);
  result.writeUInt32LE(rate * channels * 4, 28);
  result.writeUInt16LE(channels * 4, 32);
  result.writeUInt16LE(32, 34);
  result.write('data', 36);
  result.writeUInt32LE(frames * channels * 4, 40);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++)
      result.writeFloatLE(
        (0.1 - c * 0.02) * Math.sin((2 * Math.PI * (220 + c * 110) * i) / rate),
        44 + (i * channels + c) * 4,
      );
  return result;
}
for (const mode of [
  {
    name: 'speech',
    choice: /^Fala/,
    preset: 'voice-isolator-v1',
    rate: 48000,
    channels: 1,
    apply: 'Isolar voz',
    done: 'Voz isolada. Compare com o original e baixe.',
    layout: 'Mono',
  },
  {
    name: 'singing',
    choice: /^Música/,
    preset: 'roformer-vocals-v1',
    rate: 44100,
    channels: 2,
    apply: 'Separar vocal',
    done: 'Vocal separado. Compare com a música e baixe.',
    layout: 'Estéreo',
  },
])
  test(`isolar voz (${mode.name}) dispatches ${mode.preset} once and saves its exact WAV`, async ({
    page,
  }) => {
    const output = floatWav(8.345, mode.rate, mode.channels),
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
              preset: mode.preset,
              downloadUrls: ['https://nossom-test.supabase.co/vocals'],
              report: {
                preset: mode.preset,
                channels: mode.channels,
                frames: (output.length - 44) / (4 * mode.channels),
                sampleRate: mode.rate,
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
        expect(body.preset).toBe(mode.preset);
        submits++;
        return r.fulfill({ json: { id: job, status: 'queued' } });
      }
      if (body.action === 'release') {
        cleaned = true;
        return r.fulfill({ json: { status: 'released' } });
      }
      return r.fulfill({ status: 400 });
    });
    await page.goto('/studio');
    await page.getByRole('button', { name: 'Isolar voz', exact: true }).click();
    await expect(page).toHaveURL(/\/studio\/isolar-voz$/);
    await page
      .getByLabel('Importar arquivo de áudio', { exact: true })
      .setInputFiles('tests/fixtures/synthetic-speech.wav');
    await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
      timeout: 90000,
    });
    await page.getByRole('button', { name: mode.choice }).click();
    await expect(page.getByRole('button', { name: mode.choice })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: mode.apply, exact: true }).click();
    await expect(page.getByText(mode.done, { exact: true })).toBeVisible({ timeout: 90000 });
    expect(submits).toBe(1);
    await expect.poll(() => cleaned).toBe(true);
    await expect(page.locator('.editor-heading')).toContainText(mode.layout);
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar WAV', exact: true }).click();
    const saved = await downloaded;
    const wav = await readFile((await saved.path())!);
    expect(wav.readUInt16LE(20)).toBe(3);
    expect(wav.readUInt16LE(22)).toBe(mode.channels);
    expect(wav.readUInt32LE(24)).toBe(mode.rate);
    expect(wav.equals(output)).toBe(true);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Isolar voz', level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.locator('.editor-heading')).toContainText(mode.layout);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const audit = await new AxeBuilder({ page })
      .include('.studio-main')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({
      path: `artifacts/vocals-${mode.name}-mobile.png`,
      fullPage: true,
      animations: 'disabled',
    });
  });
