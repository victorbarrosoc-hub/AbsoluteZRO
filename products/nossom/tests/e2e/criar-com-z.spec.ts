import { test, expect } from './fixtures';

function wav(rate: number, duration: number, freq: number) {
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
    buffer.writeFloatLE(0.2 * Math.sin((2 * Math.PI * freq * i) / rate), 44 + i * 4);
  return buffer;
}

test('a Z cria a trilha e um efeito no trecho escolhido, e a mixagem junta tudo', async ({
  page,
}) => {
  const trilha = wav(44100, 4, 330),
    efeito = wav(44100, 1, 880);
  const ids = {
    trilha: '99999999-9999-4999-8999-999999999991',
    efeito: '99999999-9999-4999-8999-999999999992',
  };
  const pedidos: { tipo: string; texto: string; segundos: number }[] = [];
  let liberados = 0;
  await page.route('https://nossom-test.supabase.co/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: route.request().url().includes('trilha') ? trilha : efeito,
    }),
  );
  await page.route('**/api/audio/jobs*', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      const id = new URL(request.url()).searchParams.get('id');
      if (!id) return route.fulfill({ json: { configured: true, advanced: true, pending: null } });
      const tipo = id === ids.trilha ? 'trilha' : 'efeito';
      const corpo = tipo === 'trilha' ? trilha : efeito;
      return route.fulfill({
        json: {
          id,
          status: 'completed',
          downloadUrls: [`https://nossom-test.supabase.co/${tipo}`],
          report: {
            preset: tipo === 'trilha' ? 'trilha-z-v1' : 'efeito-z-v1',
            chunks: [{ index: 0, bytes: corpo.length }],
            totalBytes: corpo.length,
          },
        },
      });
    }
    const body = request.postDataJSON();
    if (body.action === 'gerar') {
      pedidos.push({ tipo: body.tipo, texto: body.texto, segundos: body.segundos });
      return route.fulfill({
        json: { id: ids[body.tipo as 'trilha' | 'efeito'], status: 'running' },
      });
    }
    if (body.action === 'release') {
      liberados++;
      return route.fulfill({ json: { ok: true } });
    }
    throw new Error('Unexpected cloud action');
  });
  await page.goto('/studio/mixagem');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles({ name: 'voz.wav', mimeType: 'audio/wav', buffer: wav(48000, 3, 220) });
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
    timeout: 90000,
  });
  const z = page.getByRole('group', { name: 'Criar com a Z' });
  await z.getByLabel('CRIAR TRILHA COM A Z').fill('lo-fi calmo com piano');
  await z.getByRole('button', { name: 'Criar trilha' }).click();
  await expect(
    page.getByRole('button', { name: 'Trilha da Z · lo-fi calmo com piano', exact: true }),
  ).toBeVisible({ timeout: 60000 });
  // o efeito entra onde começa o trecho selecionado
  await page.getByRole('button', { name: 'Selecionar trecho', exact: true }).click();
  await page.getByLabel('Início do trecho em segundos').fill('1.5');
  await z.getByLabel('EFEITO COM A Z').fill('whoosh rápido');
  await z.getByRole('combobox', { name: 'Duração do efeito' }).selectOption('1');
  await z.getByRole('button', { name: 'Criar efeito' }).click();
  const lista = z.getByRole('list', { name: 'Efeitos na mixagem' });
  await expect(lista.getByText('whoosh rápido')).toBeVisible({ timeout: 60000 });
  await expect(lista.getByLabel('Segundo em que whoosh rápido entra')).toHaveValue('1.5');
  expect(pedidos).toEqual([
    { tipo: 'trilha', texto: 'lo-fi calmo com piano', segundos: 10 },
    { tipo: 'efeito', texto: 'whoosh rápido', segundos: 1 },
  ]);
  expect(liberados).toBe(2);
  await page.getByRole('button', { name: 'Aplicar tratamento' }).click();
  await expect(page.getByRole('heading', { name: /Mixar com música · V1/ })).toBeVisible({
    timeout: 90000,
  });
  await expect(page.locator('.alert.error')).toHaveCount(0);
});
