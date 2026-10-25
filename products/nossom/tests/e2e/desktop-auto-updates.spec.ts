import { test, expect } from './fixtures';

test('the installed preview receives studio updates automatically after recording and an idle pause', async ({
  page,
}) => {
  let next = false,
    navigations = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.resourceType() === 'document') {
      navigations++;
      if (next) next = false;
    }
  });
  await page.addInitScript(() => {
    (window as any).nossomDesktop = {
      getUpdateState: async () => ({ status: 'unavailable', version: '0.1.1', progress: 0 }),
      onUpdate: () => () => {},
      update: async () => null,
    };
  });
  await page.route('**/api/desktop/version', (route) =>
    route.fulfill({ json: { release: next ? 'f'.repeat(40) : 'development' } }),
  );
  await page.context().grantPermissions(['microphone']);
  await page.goto('/studio/automatico');
  await page.getByRole('button', { name: 'Gravar uma ideia', exact: true }).click();
  const beforeUpdate = navigations;
  next = true;
  await expect
    .poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      return await page.locator('.desktop-web-update').count();
    })
    .toBe(1);
  await expect(
    page.getByText('Vamos esperar sua gravação ou tratamento terminar.', { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1100);
  await page.clock.install();
  await page.clock.fastForward(35000);
  expect(navigations).toBe(beforeUpdate);
  await page.getByRole('button', { name: /^Finalizar ·/ }).click();
  await expect(
    page.getByText('Vamos aplicar automaticamente quando você fizer uma pausa.', { exact: false }),
  ).toBeVisible({ timeout: 90000 });
  await page.clock.fastForward(31000);
  await expect.poll(() => navigations).toBeGreaterThan(beforeUpdate);
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible({
    timeout: 90000,
  });
});

test('signed native updates install automatically without a download click after the user pauses', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let listener = (_state: unknown) => {};
    (window as any).__nativeActions = [];
    (window as any).__nativeDownloaded = () =>
      listener({
        status: 'downloaded',
        version: '0.2.0',
        nextVersion: '0.2.1',
        progress: 100,
        automatic: true,
        installRequested: true,
      });
    (window as any).nossomDesktop = {
      getUpdateState: async () => ({
        status: 'current',
        version: '0.2.0',
        progress: 0,
        automatic: true,
      }),
      onUpdate: (next: typeof listener) => {
        listener = next;
        return () => {};
      },
      update: async (action: string) => {
        (window as any).__nativeActions.push(action);
        return {
          status: 'installing',
          version: '0.2.0',
          nextVersion: '0.2.1',
          progress: 100,
          automatic: true,
        };
      },
    };
  });
  await page.goto('/studio');
  await page.clock.install();
  await page.evaluate(() => (window as any).__nativeDownloaded());
  await expect(
    page.getByText('Atualização pronta. Vamos instalar quando você fizer uma pausa.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.clock.fastForward(20000);
  await page
    .getByLabel('Descreva seu objetivo')
    .fill('Quero terminar minha ideia antes de atualizar');
  await page.clock.fastForward(35000);
  expect(await page.evaluate(() => (window as any).__nativeActions)).toEqual([]);
  await page.getByRole('button', { name: 'Atualizações do aplicativo', exact: true }).click();
  await page.clock.fastForward(31000);
  await expect
    .poll(() => page.evaluate(() => (window as any).__nativeActions))
    .toEqual(['install']);
});
