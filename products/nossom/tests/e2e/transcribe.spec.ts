import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
test('legendas: one GPU job, words saved in the project, SRT/VTT/TXT built locally', async ({
  page,
}) => {
  const job = '77777777-7777-4777-8777-777777777777';
  let submitted: string | undefined,
    cleaned = false;
  const transcript = Buffer.from(
    JSON.stringify({
      version: 1,
      language: 'pt',
      duration: 8.345,
      words: [
        [1.0, 1.3, 'Sua'],
        [1.3, 2.0, 'voz'],
        [2.0, 2.5, 'conta'],
        [2.5, 2.9, 'uma'],
        [2.9, 3.6, 'história.'],
        [4.6, 5.0, 'Cada'],
        [5.0, 5.6, 'gravação'],
        [5.6, 6.4, 'merece.'],
      ],
    }),
  );
  await page.route('https://nossom-test.supabase.co/**', (r) =>
    r.fulfill({
      body: r.request().method() === 'PUT' ? '{}' : transcript,
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
            preset: 'whisper-transcript-v1',
            downloadUrls: ['https://nossom-test.supabase.co/transcript'],
            report: {
              preset: 'whisper-transcript-v1',
              chunks: [{ index: 0, bytes: transcript.length }],
              totalBytes: transcript.length,
              words: 8,
              language: 'pt',
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
    if (body.action === 'release') {
      cleaned = true;
      return r.fulfill({ json: { status: 'released' } });
    }
    return r.fulfill({ status: 400 });
  });
  await page.goto('/studio/legendas');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-speech.wav');
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await page.getByRole('button', { name: 'Gerar legendas', exact: true }).click();
  await expect(
    page.getByText('Legendas prontas. Baixe em SRT, VTT ou TXT.', { exact: true }),
  ).toBeVisible({ timeout: 90000 });
  expect(submitted).toBe('whisper-transcript-v1');
  await expect.poll(() => cleaned).toBe(true);
  const cues = page.getByRole('list', { name: 'Prévia das legendas' });
  await expect(cues.getByRole('listitem')).toHaveCount(2);
  await expect(cues).toContainText('Sua voz conta uma história.');
  // A transcript is not a new audio version.
  await expect(page.getByText('Original preservado', { exact: false })).toBeVisible();
  const files: Record<string, string> = {};
  for (const format of ['SRT', 'VTT', 'TXT']) {
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: format, exact: true }).click();
    const saved = await downloaded;
    expect(saved.suggestedFilename()).toBe(`synthetic-speech.${format.toLowerCase()}`);
    files[format] = await readFile((await saved.path())!, 'utf8');
  }
  expect(files.SRT).toBe(
    '1\n00:00:01,000 --> 00:00:03,600\nSua voz conta uma história.\n\n' +
      '2\n00:00:04,600 --> 00:00:06,400\nCada gravação merece.\n',
  );
  expect(files.VTT.startsWith('WEBVTT\n\n00:00:01.000 --> 00:00:03.600\n')).toBe(true);
  expect(files.TXT).toBe('Sua voz conta uma história. Cada gravação merece.\n');
  await page.reload();
  await expect(page.getByRole('list', { name: 'Prévia das legendas' })).toContainText(
    'Cada gravação merece.',
  );
  await expect(page.getByRole('button', { name: 'Gerar de novo', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page })
    .include('.studio-main')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({
    path: 'artifacts/transcribe-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});
