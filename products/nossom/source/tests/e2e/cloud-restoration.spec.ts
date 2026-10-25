import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';

function wav(rate: number, duration: number, floatPeaks = false) {
  const frames = Math.round(rate * duration),
    buffer = Buffer.alloc(44 + frames * 4);
  buffer.write('RIFF');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(3, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(32, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++)
    buffer.writeFloatLE(0.15 * Math.sin((2 * Math.PI * 220 * i) / rate), 44 + i * 4);
  if (floatPeaks) {
    buffer.writeFloatLE(1.4, 44 + 400 * 4);
    buffer.writeFloatLE(-1.2, 44 + 800 * 4);
  }
  return buffer;
}
test('cloud D restores once, preserves float import, saves before cleanup, then opens editable finishing without rerunning AI', async ({
  page,
}) => {
  const duration = 2,
    source = wav(48000, duration, true),
    output = wav(44100, duration);
  const job = '77777777-7777-4777-8777-777777777777';
  let prepared = 0,
    submitted = 0,
    released = 0;
  await page.route('https://nossom-test.supabase.co/**', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: route.request().method() === 'PUT' ? Buffer.from('{}') : output,
    }),
  );
  await page.route('**/api/audio/jobs*', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      if (request.url().includes('?id='))
        return route.fulfill({
          json: {
            id: job,
            status: 'completed',
            downloadUrls: ['https://nossom-test.supabase.co/result'],
            report: {
              preset: 'resemble-d-v1',
              chunks: [{ index: 0, bytes: output.length }],
              totalBytes: output.length,
              frames: 44100 * duration,
              sampleRate: 44100,
              channels: 1,
              gainDb: 0,
            },
          },
        });
      return route.fulfill({ json: { configured: true, pending: null } });
    }
    const body = request.postDataJSON();
    if (body.action === 'prepare') {
      prepared++;
      return route.fulfill({
        json: {
          id: job,
          partBytes: 20 * 1024 * 1024,
          uploadUrls: ['https://nossom-test.supabase.co/source'],
        },
      });
    }
    if (body.action === 'submit') {
      submitted++;
      return route.fulfill({
        json: {
          id: job,
          status: 'queued',
          usage: {
            allowed: true,
            resetAt: '2026-11-01T03:00:00Z',
            used: 60,
            remaining: 240,
            limit: 300,
            unit: 'seconds',
            planId: 'free',
            planName: 'Grátis',
            usedSeconds: 60,
            remainingSeconds: 240,
            limitSeconds: 300,
          },
        },
      });
    }
    if (body.action === 'release') {
      released++;
      return route.fulfill({ json: { ok: true } });
    }
    throw new Error('Unexpected cloud action');
  });
  await page.goto('/studio/automatico');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles({ name: 'float-original.wav', mimeType: 'audio/wav', buffer: source });
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
    timeout: 90000,
  });
  const original = await page.evaluate(async () => {
    const request = indexedDB.open('nossom-studio');
    const db = await new Promise<IDBDatabase>(
      (resolve) => (request.onsuccess = () => resolve(request.result)),
    );
    const q = db.transaction('projects').objectStore('projects').getAll();
    const list: any[] = await new Promise((resolve) => (q.onsuccess = () => resolve(q.result)));
    const data = new DataView(await list[0].versions[0].blob.arrayBuffer());
    return { format: data.getUint16(20, true), peak: list[0].versions[0].info.peak };
  });
  expect(original.format).toBe(3);
  expect(original.peak).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Restaurar com IA', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Agora, deixe do seu jeito.', exact: true }),
  ).toBeVisible({ timeout: 90000 });
  expect(prepared).toBe(1);
  expect(submitted).toBe(1);
  expect(released).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.finish-panel').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/nossom-after-restoration-mobile.png', fullPage: true });
  const accessibility = await new AxeBuilder({ page })
    .include('.finish-panel')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button', { name: /Encorpar · Premiere/ }).click();
  await expect(page).toHaveURL(/\/studio\/masterizacao\?project=/);
  await expect(
    page.getByRole('button', { name: /Transmissão \+ Limite −3 dB/ }).first(),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByText('Sua cadeia do Premiere, com quatro bandas e dois limitadores.'),
  ).toBeVisible();
  expect(prepared).toBe(1);
  expect(submitted).toBe(1);
  await page.getByRole('button', { name: /Equalizar do meu jeito/ }).click();
  await expect(page).toHaveURL(/\/studio\/equalizacao\?project=/);
  await expect(page.getByRole('group', { name: /Presets de equalização/ })).toBeVisible();
});
test('unconfigured cloud restoration is explicit and keeps local tools available', async ({
  page,
}) => {
  await page.route('**/api/audio/jobs*', (route) =>
    route.fulfill({ json: { configured: false, pending: null } }),
  );
  await page.goto('/studio/automatico');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles({ name: 'voice.wav', mimeType: 'audio/wav', buffer: wav(48000, 1) });
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await expect(page.getByRole('button', { name: 'Restaurar com IA', exact: true })).toBeDisabled();
  await expect(
    page.getByText('A melhoria com IA está temporariamente indisponível', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Experimentar outra limpeza/ }).click();
  await expect(page).toHaveURL(/\/studio\/limpeza\?project=/);
});

test('pending audio from another browser can be recovered and resumed without submitting a second GPU job', async ({
  page,
}) => {
  const source = wav(48000, 2),
    output = wav(44100, 2),
    id = '88888888-8888-4888-8888-888888888888';
  let released = false,
    newSubmissions = 0;
  const report = {
    preset: 'resemble-d-v1',
    chunks: [{ index: 0, bytes: output.length }],
    totalBytes: output.length,
    frames: 88200,
    sampleRate: 44100,
    channels: 1,
    gainDb: 0,
  };
  await page.route('https://nossom-test.supabase.co/**', (route) =>
    route.fulfill({
      body: route.request().url().endsWith('/source') ? source : output,
      headers: { 'Access-Control-Allow-Origin': '*' },
    }),
  );
  await page.route('**/api/audio/jobs*', (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      const body = req.postDataJSON();
      if (body.action === 'release') {
        released = true;
        return route.fulfill({ json: { ok: true } });
      }
      newSubmissions++;
      return route.fulfill({ status: 500, json: { error: 'Unexpected duplicate submission' } });
    }
    if (req.url().includes('source=1'))
      return route.fulfill({
        json: {
          id,
          duration: 2,
          bytes: source.length,
          downloadUrls: ['https://nossom-test.supabase.co/source'],
        },
      });
    if (req.url().includes('?id='))
      return route.fulfill({
        json: {
          id,
          status: 'completed',
          report,
          downloadUrls: ['https://nossom-test.supabase.co/output'],
        },
      });
    return route.fulfill({
      json: {
        configured: true,
        pending: released
          ? null
          : {
              id,
              status: 'completed',
              duration: 2,
              bytes: source.length,
              createdAt: '2026-10-23T18:00:00Z',
            },
      },
    });
  });
  await page.goto('/studio/automatico');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'outro.wav', mimeType: 'audio/wav', buffer: source });
  await expect(page.getByText('Resultado pronto', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Recuperar áudio deste pedido' }).click();
  await expect(
    page.getByRole('button', { name: 'Retomar restauração', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retomar restauração', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Agora, deixe do seu jeito.' })).toBeVisible({
    timeout: 90000,
  });
  expect(newSubmissions).toBe(0);
  expect(released).toBe(true);
});

test('selection can be drawn on the wave, adjusted by keyboard and cleared on desktop and touch', async ({
  page,
}) => {
  await page.route('**/api/audio/jobs*', (route) =>
    route.fulfill({ json: { configured: true, pending: null } }),
  );
  await page.goto('/studio/automatico');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'trecho.wav', mimeType: 'audio/wav', buffer: wav(48000, 4) });
  await page.getByRole('button', { name: 'Selecionar trecho', exact: true }).click();
  const surface = page.locator('.wave-selection-surface');
  await expect(surface).toBeVisible();
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel('Início do trecho em segundos')).toHaveValue('1');
  await expect(page.getByLabel('Fim do trecho em segundos')).toHaveValue('3');
  await page.getByRole('button', { name: 'Ajustar início do trecho' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Início do trecho em segundos')).toHaveValue('1.1');
  await page.setViewportSize({ width: 390, height: 844 });
  await surface.scrollIntoViewIfNeeded();
  const touchBox = (await surface.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: touchBox.x + touchBox.width * 0.5, y: touchBox.y + 30 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: touchBox.x + touchBox.width * 0.9, y: touchBox.y + 30 }],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByLabel('Início do trecho em segundos')).toHaveValue('2');
  await page.getByRole('button', { name: 'Áudio inteiro', exact: true }).click();
  await expect(surface).toBeHidden();
});

test('queued audio has no invented percentage and a confirmed cancellation permits a new request', async ({
  page,
}) => {
  const id = '99999999-9999-4999-8999-999999999999';
  let state = 'queued',
    prepared = false,
    cancellation = 0;
  await page.route('https://nossom-test.supabase.co/**', (route) =>
    route.fulfill({
      body: '{}',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'PUT,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }),
  );
  await page.route('**/api/audio/jobs*', (route) => {
    const request = route.request();
    if (request.method() === 'GET')
      return route.fulfill({
        json: request.url().includes('?id=')
          ? { id, status: state }
          : {
              configured: true,
              pending: prepared && state !== 'failed' ? { id, status: state } : null,
            },
      });
    const data = request.postDataJSON();
    if (data.action === 'prepare') {
      prepared = true;
      return route.fulfill({
        json: {
          id,
          partBytes: 20 * 1024 * 1024,
          uploadUrls: ['https://nossom-test.supabase.co/input'],
        },
      });
    }
    if (data.action === 'submit') return route.fulfill({ json: { id, status: state } });
    if (data.action === 'cancel') {
      cancellation++;
      state = 'failed';
      return route.fulfill({ json: { id, status: 'cancelled' } });
    }
    throw new Error('Unexpected action');
  });
  await page.goto('/studio/automatico');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'fila.wav', mimeType: 'audio/wav', buffer: wav(48000, 2) });
  await page.getByRole('button', { name: 'Restaurar com IA', exact: true }).click();
  const banner = page.locator('.processing-banner');
  await expect(banner).toContainText('O tratamento ainda não começou.');
  await expect(banner).not.toContainText('20%');
  await expect(banner.locator('progress')).not.toHaveAttribute('value', /.+/);
  await banner.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(banner).toBeHidden();
  await expect(page.getByRole('button', { name: 'Restaurar com IA', exact: true })).toBeEnabled();
  await expect(page.getByText(/Pedido encerrado. O original foi preservado/)).toBeVisible();
  expect(cancellation).toBe(1);
});
