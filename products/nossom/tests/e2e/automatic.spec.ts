import { test, expect } from './fixtures';
import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { clippingRepairFilter } from '../../lib/declip';

function pcm(wav: Buffer) {
  let at = 12,
    channels = 1,
    width = 2,
    floating = false;
  while (at + 8 < wav.length) {
    const size = wav.readUInt32LE(at + 4),
      name = wav.toString('ascii', at, at + 4);
    if (name === 'fmt ') {
      channels = wav.readUInt16LE(at + 10);
      width = wav.readUInt16LE(at + 22) / 8;
      floating = wav.readUInt16LE(at + 8) === 3;
    }
    if (name === 'data') {
      const result = Array.from(
        { length: channels },
        () => new Float32Array(size / width / channels),
      );
      for (let i = 0; i < result[0].length; i++)
        for (let c = 0; c < channels; c++)
          result[c][i] = floating
            ? wav.readFloatLE(at + 8 + (i * channels + c) * width)
            : wav.readInt16LE(at + 8 + (i * channels + c) * width) / 32768;
      return result;
    }
    at += 8 + size + (size % 2);
  }
  throw new Error('PCM data missing');
}
function correlation(a: Float32Array, b: Float32Array) {
  let aa = 0,
    bb = 0,
    ab = 0;
  for (let i = 0; i < a.length; i++) {
    aa += a[i] ** 2;
    bb += b[i] ** 2;
    ab += a[i] * b[i];
  }
  return ab / Math.sqrt(aa * bb);
}
function siSdr(reference: Float32Array, estimate: Float32Array) {
  let rr = 0,
    re = 0;
  for (let i = 0; i < reference.length; i++) {
    rr += reference[i] ** 2;
    re += reference[i] * estimate[i];
  }
  const scale = re / rr;
  let target = 0,
    error = 0;
  for (let i = 0; i < reference.length; i++) {
    target += (reference[i] * scale) ** 2;
    error += (estimate[i] - reference[i] * scale) ** 2;
  }
  return 10 * Math.log10(target / error);
}
test('browser declipping reconstructs moderate clipped speech instead of merely lowering its peaks', async ({
  page,
}, testInfo) => {
  const bytes = await readFile('tests/fixtures/synthetic-speech.wav');
  const clean = pcm(bytes)[0],
    clipped = Buffer.from(bytes);
  // This fixture is mono PCM16. Locate the data chunk rather than assuming a 44-byte header.
  let at = 12;
  while (clipped.toString('ascii', at, at + 4) !== 'data')
    at += 8 + clipped.readUInt32LE(at + 4) + (clipped.readUInt32LE(at + 4) % 2);
  for (let i = 0; i < clean.length; i++)
    clipped.writeInt16LE(
      Math.round(Math.max(-0.2, Math.min(0.2, clean[i])) * 32768),
      at + 8 + i * 2,
    );
  const damaged = pcm(clipped)[0];
  await page.goto('/studio/automatico');
  const result = await page.evaluate(
    async ({ input, filter }) => {
      // Exercise the same bundled WASM filter and float transport used by processAudio.
      // @ts-expect-error runtime import of the public FFmpeg browser module
      const { FFmpeg } = await import('/ffmpeg/worker/index.js');
      const ff = new FFmpeg(),
        logs: string[] = [];
      ff.on('log', ({ message }: { message: string }) => logs.push(message));
      await ff.load({
        classWorkerURL: location.origin + '/ffmpeg/worker/worker.js',
        coreURL: location.origin + '/ffmpeg/ffmpeg-core.js',
        wasmURL: location.origin + '/ffmpeg/ffmpeg-core.wasm',
      });
      await ff.writeFile(
        'input.wav',
        Uint8Array.from(atob(input), (v) => v.charCodeAt(0)),
      );
      const code = await ff.exec(['-i', 'input.wav', '-af', filter, '-f', 'f32le', 'output.f32']);
      const output = await ff.readFile('output.f32');
      ff.terminate();
      return {
        code,
        samples: Array.from(new Float32Array(output.buffer)),
        detection: logs.find((s) => s.includes('Detected clips in')),
      };
    },
    { input: clipped.toString('base64'), filter: clippingRepairFilter(clean.length / 48000) },
  );
  expect(result.code).toBe(0);
  expect(result.samples.length).toBe(clean.length);
  const restored = Float32Array.from(result.samples as number[]);
  const before = siSdr(clean, damaged),
    after = siSdr(clean, restored);
  expect(after).toBeGreaterThan(before + 3);
  expect(restored.some((v) => Math.abs(v) > 0.25)).toBe(true);
  expect(result.detection).toMatch(/Detected clips in [1-9]\d* of/);
  await testInfo.attach('declipping-reference.json', {
    body: JSON.stringify({
      beforeSiSdrDb: before,
      afterSiSdrDb: after,
      detection: result.detection,
    }),
    contentType: 'application/json',
  });
});
test('default speech treatment needs no settings, improves the known noisy reference and keeps stereo coherent', async ({
  page,
}, testInfo) => {
  const clean = pcm(await readFile('tests/fixtures/synthetic-speech.wav'))[0];
  const wav = Buffer.alloc(44 + clean.length * 4);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(48000, 24);
  wav.writeUInt32LE(192000, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(clean.length * 4, 40);
  let seed = 17;
  for (let i = 0; i < clean.length; i++) {
    seed = (seed * 16807) % 2147483647;
    const value = clean[i] + (seed / 2147483647 - 0.5) * 0.045;
    wav.writeInt16LE(Math.round(value * 32767), 44 + i * 4);
    wav.writeInt16LE(Math.round(value * 0.99 * 32767), 46 + i * 4);
  }
  const noisy = pcm(wav)[0];
  await page.goto('/studio/limpeza');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles({ name: 'automatic-reference.wav', mimeType: 'audio/wav', buffer: wav });
  await expect(page.getByRole('button', { name: 'Analisar e tratar', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await expect(
    page.getByRole('slider', { name: 'Intensidade do tratamento', exact: true }),
  ).toBeHidden();
  await page.getByRole('button', { name: 'Analisar e tratar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reduzir ruído · V1', exact: true })).toBeVisible({
    timeout: 90000,
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar WAV', exact: true }).click();
  const rendered = pcm(await readFile((await (await download).path())!));
  expect(rendered[0].length).toBe(clean.length);
  expect(correlation(rendered[0], rendered[1])).toBeGreaterThan(0.9999);
  const before = siSdr(clean, noisy),
    after = siSdr(clean, rendered[0]);
  expect(after).toBeGreaterThan(before + 2);
  console.log(
    'Automatic speech validation:',
    JSON.stringify({
      beforeSiSdrDb: before,
      afterSiSdrDb: after,
      stereoCorrelation: correlation(rendered[0], rendered[1]),
    }),
  );
  await testInfo.attach('automatic-quality.json', {
    body: JSON.stringify({
      beforeSiSdrDb: before,
      afterSiSdrDb: after,
      stereoCorrelation: correlation(rendered[0], rendered[1]),
    }),
    contentType: 'application/json',
  });
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});

test('real recording regression: local cleanup preserves stereo/level, starts from original, and supports broadcast finishing', async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.NOSSOM_REGRESSION_MP3,
    'Requires the private recording supplied for this regression; it is never committed.',
  );
  await page.goto('/studio/limpeza');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles(process.env.NOSSOM_REGRESSION_MP3!);
  await expect(page.getByRole('button', { name: 'Analisar e tratar', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await expect(page).toHaveURL(/\/studio\/limpeza\?project=/);
  await page
    .getByRole('combobox', { name: 'Ferramenta do estúdio', exact: true })
    .selectOption('denoise');
  const originalDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar WAV', exact: true }).click();
  const original = pcm(await readFile((await (await originalDownload).path())!));
  await page.getByRole('button', { name: 'Analisar e tratar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reduzir ruído · V1', exact: true })).toBeVisible({
    timeout: 90000,
  });
  const firstDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar WAV', exact: true }).click();
  const firstPath = (await (await firstDownload).path())!;
  const first = pcm(await readFile(firstPath));
  expect(first[0].length).toBe(original[0].length);
  expect(correlation(first[0], first[1])).toBeGreaterThan(0.995);
  expect(correlation(original[0], first[0])).toBeGreaterThan(0.94);
  const reportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Relatório', exact: true }).click();
  const report = JSON.parse(await readFile((await (await reportDownload).path())!, 'utf8'));
  expect(report.processingSettings.automatic).toBe(true);
  expect(report.processingSettings.restoration.attenuationDb).toBeLessThan(60);
  expect(report.after.truePeak).toBeLessThanOrEqual(-1);
  expect(Math.abs(report.after.lufs - report.before.lufs)).toBeLessThan(1.5);
  await page.getByRole('button', { name: 'Analisar e tratar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reduzir ruído · V2', exact: true })).toBeVisible({
    timeout: 90000,
  });
  const repeatedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar WAV', exact: true }).click();
  const repeated = pcm(await readFile((await (await repeatedDownload).path())!));
  let error = 0;
  for (let i = 0; i < first[0].length; i++)
    error = Math.max(error, Math.abs(first[0][i] - repeated[0][i]));
  expect(error).toBeLessThanOrEqual(2 / 32768);
  await mkdir('artifacts', { recursive: true });
  await copyFile(firstPath, 'artifacts/altiplano-padrao-corrigido.wav');
  await testInfo.attach('automatic-real-recording-metrics.json', {
    body: JSON.stringify({
      after: report.after,
      before: report.before,
      settings: report.processingSettings,
      correlationWithOriginal: correlation(original[0], first[0]),
      stereoCorrelation: correlation(first[0], first[1]),
      repeatedMaxError: error,
    }),
    contentType: 'application/json',
  });
  await page
    .getByRole('combobox', { name: 'Ferramenta do estúdio', exact: true })
    .selectOption('master');
  await expect(page).toHaveURL(/\/studio\/masterizacao\?project=/);
  await page
    .getByRole('button', { name: /Transmissão \+ Limite −3 dB/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Aplicar tratamento', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Preparar entrega · V3', exact: true }),
  ).toBeVisible({ timeout: 90000 });
  const finalDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar WAV', exact: true }).click();
  const finalPath = (await (await finalDownload).path())!;
  await copyFile(finalPath, 'artifacts/altiplano-tratamento-completo.wav');
  const mp3Download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'MP3', exact: true }).click();
  await copyFile(
    (await (await mp3Download).path())!,
    'artifacts/altiplano-tratamento-completo.mp3',
  );
  const finalReportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Relatório', exact: true }).click();
  const finalReport = JSON.parse(
    await readFile((await (await finalReportDownload).path())!, 'utf8'),
  );
  expect(finalReport.processingSettings.masterPreset).toBe('broadcast');
  expect(finalReport.samplePeakDbfs).toBeLessThanOrEqual(-2.97);
  expect(finalReport.after.truePeak).toBeLessThanOrEqual(-1);
  let referenceLufs: number | undefined;
  if (process.env.NOSSOM_REFERENCE_MP3) {
    const { stderr } = await promisify(execFile)('ffmpeg', [
      '-hide_banner',
      '-i',
      process.env.NOSSOM_REFERENCE_MP3,
      '-af',
      'loudnorm=I=-16:TP=-1:print_format=json',
      '-f',
      'null',
      '-',
    ]);
    const measured = JSON.parse(stderr.match(/\{\s*"input_i"[\s\S]*?\}/)![0]);
    referenceLufs = Number(measured.input_i);
    expect(Math.abs(finalReport.after.lufs - referenceLufs)).toBeLessThan(2);
  }
  await testInfo.attach('full-treatment-reference-comparison.json', {
    body: JSON.stringify({
      referenceLufs,
      after: finalReport.after,
      samplePeakDbfs: finalReport.samplePeakDbfs,
      settings: finalReport.processingSettings,
      note: 'Level and signal checks are not proof of perceptual equivalence with Adobe.',
    }),
    contentType: 'application/json',
  });
  console.log(
    'Real recording validation:',
    JSON.stringify({
      referenceLufs,
      automatic: finalReport.after,
      samplePeak: finalReport.samplePeakDbfs,
      restoration: finalReport.processingSettings.restoration,
      clippingRepair: finalReport.processingSettings.clippingRepair,
      cleanup: report.after,
      cleanupCorrelation: correlation(original[0], first[0]),
      stereoCorrelation: correlation(first[0], first[1]),
      repeatedMaxError: error,
    }),
  );
  await page.screenshot({ path: 'artifacts/tratamento-completo.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
