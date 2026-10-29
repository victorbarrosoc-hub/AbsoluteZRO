import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';
function monoWav(seconds: number, rate = 48000) {
  const frames = Math.round(rate * seconds),
    result = Buffer.alloc(44 + frames * 4);
  result.write('RIFF');
  result.writeUInt32LE(result.length - 8, 4);
  result.write('WAVEfmt ', 8);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(3, 20);
  result.writeUInt16LE(1, 22);
  result.writeUInt32LE(rate, 24);
  result.writeUInt32LE(rate * 4, 28);
  result.writeUInt16LE(4, 32);
  result.writeUInt16LE(32, 34);
  result.write('data', 36);
  result.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++)
    result.writeFloatLE(0.1 * Math.sin((2 * Math.PI * 220 * i) / rate), 44 + i * 4);
  return result;
}
test('a video sends only lossless audio to the GPU and comes back as a video with the new sound', async ({
  page,
}) => {
  const output = monoWav(4),
    job = '99999999-9999-4999-8999-999999999999';
  let uploaded: Buffer | null = null,
    prepared: { bytes?: number } = {};
  await page.route('https://nossom-test.supabase.co/**', (r) => {
    if (r.request().method() === 'PUT') uploaded = r.request().postDataBuffer();
    return r.fulfill({
      body: r.request().method() === 'PUT' ? '{}' : output,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  });
  await page.route('**/api/audio/jobs*', async (r) => {
    if (r.request().method() === 'GET') {
      if (r.request().url().includes('?id='))
        return r.fulfill({
          json: {
            id: job,
            status: 'completed',
            preset: 'voice-isolator-v1',
            downloadUrls: ['https://nossom-test.supabase.co/voice'],
            report: {
              preset: 'voice-isolator-v1',
              channels: 1,
              frames: (output.length - 44) / 4,
              sampleRate: 48000,
              gainDb: 0,
              totalBytes: output.length,
              chunks: [{ index: 0, bytes: output.length }],
            },
          },
        });
      return r.fulfill({ json: { configured: true, pending: null } });
    }
    const body = r.request().postDataJSON();
    if (body.action === 'prepare') {
      prepared = body;
      return r.fulfill({
        json: {
          id: job,
          partBytes: 20 * 1024 * 1024,
          uploadUrls: ['https://nossom-test.supabase.co/source'],
        },
      });
    }
    if (body.action === 'submit') return r.fulfill({ json: { id: job, status: 'queued' } });
    if (body.action === 'release') return r.fulfill({ json: { status: 'released' } });
    return r.fulfill({ status: 400 });
  });
  await page.goto('/studio/isolar-voz');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-video.mp4');
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
    timeout: 90000,
  });
  // Nothing to put back under the picture until the sound is treated.
  await expect(page.getByRole('button', { name: 'Vídeo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Isolar voz', exact: true }).click();
  await expect(
    page.getByText('Voz isolada. Compare com o original e baixe.', { exact: true }),
  ).toBeVisible({ timeout: 90000 });
  // The GPU got FLAC of the soundtrack, never the MP4.
  expect(uploaded).not.toBeNull();
  expect(uploaded!.subarray(0, 4).toString('latin1')).toBe('fLaC');
  expect(prepared.bytes).toBe(uploaded!.length);
  const original = await readFile('tests/fixtures/synthetic-video.mp4');
  expect(uploaded!.includes(original.subarray(0, 64))).toBe(false);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Vídeo', exact: true }).click();
  const saved = await downloaded;
  expect(saved.suggestedFilename()).toMatch(/\.mp4$/);
  await saved.saveAs('artifacts/video-isolated.mp4');
  const video = await readFile((await saved.path())!);
  expect(video.subarray(4, 8).toString('latin1')).toBe('ftyp');
  // Picture copied as H.264, new sound encoded as AAC.
  expect(video.includes(Buffer.from('avc1'))).toBe(true);
  expect(video.includes(Buffer.from('mp4a'))).toBe(true);
  await expect(page.getByText('Vídeo pronto, com o som novo.', { exact: true })).toBeVisible();
});
