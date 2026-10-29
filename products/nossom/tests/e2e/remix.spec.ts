import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
const names = ['voz', 'bateria', 'baixo', 'guitarra', 'outros'];
/** Strength of one frequency in a float32 stereo WAV (Goertzel on the left channel). */
function tone(wav: Buffer, frequency: number) {
  const rate = wav.readUInt32LE(24),
    channels = wav.readUInt16LE(22),
    frames = (wav.length - 44) / (4 * channels),
    n = Math.min(frames, rate * 2),
    k = (2 * Math.PI * frequency) / rate;
  let s1 = 0,
    s2 = 0;
  for (let i = 0; i < n; i++) {
    const s0 = wav.readFloatLE(44 + i * 4 * channels) + 2 * Math.cos(k) * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - 2 * Math.cos(k) * s1 * s2) / n;
}
test('remixar: one GPU job, five faders heard live, instrumental and a cappella become versions', async ({
  page,
}) => {
  const job = '66666666-6666-4666-8666-666666666666';
  const files = await Promise.all(names.map((n) => readFile(`tests/fixtures/stems/${n}.flac`)));
  const pack = Buffer.concat(files);
  let submitted: string | undefined;
  await page.route('https://nossom-test.supabase.co/**', (r) =>
    r.fulfill({
      body: r.request().method() === 'PUT' ? '{}' : pack,
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
            preset: 'stems-v1',
            downloadUrls: ['https://nossom-test.supabase.co/stems'],
            report: {
              preset: 'stems-v1',
              chunks: [{ index: 0, bytes: pack.length }],
              totalBytes: pack.length,
              frames: 368014,
              sampleRate: 44100,
              channels: 2,
              gainDb: 0,
              stems: names.map((name, i) => ({ name, bytes: files[i].length })),
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
      submitted = body.preset;
      return r.fulfill({ json: { id: job, status: 'queued' } });
    }
    if (body.action === 'release') return r.fulfill({ json: { status: 'released' } });
    return r.fulfill({ status: 400 });
  });
  await page.goto('/studio/remixar');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-speech.wav');
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await page.getByRole('button', { name: 'Separar instrumentos', exact: true }).click();
  await expect(
    page.getByText('Faixas separadas. Mexa nos faders e ouça.', { exact: true }),
  ).toBeVisible({ timeout: 90000 });
  expect(submitted).toBe('stems-v1');
  const faders = page.getByRole('list', { name: 'Faixas' });
  await expect(faders.getByRole('listitem')).toHaveCount(5);
  // Live preview starts and stops without rendering anything.
  await page.getByRole('button', { name: 'Ouvir remix', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Parar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Parar', exact: true }).click();

  const download = async () => {
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar WAV', exact: true }).click();
    return readFile((await (await downloaded).path())!);
  };
  await page.getByRole('button', { name: 'Só instrumental', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mudo: Voz', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Criar versão', exact: true }).click();
  await expect(
    page.getByText('Só instrumental: nova versão salva. Baixe em WAV ou MP3.', { exact: true }),
  ).toBeVisible({ timeout: 90000 });
  const instrumental = await download();
  expect(instrumental.readUInt32LE(24)).toBe(44100);
  expect(instrumental.readUInt16LE(20)).toBe(3);
  await expect(page.getByText('WAV 32-bit float · 44,1 kHz · MP3 disponível')).toBeVisible();
  // The voice tone is gone; the guitar tone is there (at least 60 dB apart).
  expect(tone(instrumental, 440)).toBeLessThan(tone(instrumental, 330) / 1000);

  await page.getByRole('button', { name: 'Só acapella', exact: true }).click();
  await page.getByRole('button', { name: 'Criar versão', exact: true }).click();
  await expect(
    page.getByText('Só acapella: nova versão salva. Baixe em WAV ou MP3.', { exact: true }),
  ).toBeVisible({ timeout: 90000 });
  const acapella = await download();
  expect(tone(acapella, 330)).toBeLessThan(tone(acapella, 440) / 1000);
  expect(tone(acapella, 110)).toBeLessThan(tone(acapella, 440) / 1000);

  // A fader in dB: bass +6 dB doubles its amplitude against the flat mix.
  await page.getByRole('button', { name: 'Tudo', exact: true }).click();
  await page.getByRole('slider', { name: 'Volume: Baixo', exact: true }).fill('6');
  await page.getByRole('button', { name: 'Criar versão', exact: true }).click();
  await expect(
    page.getByText('Remix: Baixo +6 dB: nova versão salva. Baixe em WAV ou MP3.', { exact: true }),
  ).toBeVisible({ timeout: 90000 });
  const boosted = await download();
  expect(tone(boosted, 55) / tone(boosted, 110)).toBeCloseTo(10 ** (6 / 20), 1);

  await page.reload();
  await expect(page.getByRole('list', { name: 'Faixas' }).getByRole('listitem')).toHaveCount(5);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page })
    .include('.studio-main')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({
    path: 'artifacts/remix-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});
