import { test, expect } from './fixtures';

// Safari do iPhone: o IndexedDB às vezes recusa guardar o áudio como Blob ("Error preparing Blob/File data"), até
// depois de copiado para a memória. O NOSSOM guarda os mesmos bytes e o projeto volta inteiro depois de recarregar.
test('o áudio entra mesmo quando o navegador recusa guardar Blob', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    const temBlob = (value: unknown) =>
      !!value &&
      typeof value === 'object' &&
      (value as { originalFile?: unknown }).originalFile instanceof Blob;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (temBlob(value))
        throw new DOMException(
          'Error preparing Blob/File data to be stored in object store',
          'UnknownError',
        );
      return put.call(this, value, key);
    };
  });
  await page.goto('/studio/automatico');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-speech.wav');
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await expect(page.getByText(/não conseguiu guardar/)).toHaveCount(0);

  // depois de recarregar o projeto abre do aparelho e toca
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Reproduzir áudio' }).click();
  await expect(
    page.locator('.player-global').getByRole('button', { name: 'Pausar' }),
  ).toBeVisible();
});
