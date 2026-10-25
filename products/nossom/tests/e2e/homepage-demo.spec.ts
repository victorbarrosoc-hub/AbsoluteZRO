import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
test('human voice demo plays real files, preserves time on A/B, seeks and controls volume', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ouvir demonstração', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Pausar demonstração', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('audio')
        .first()
        .evaluate((el: HTMLAudioElement) => el.currentTime),
    )
    .toBeGreaterThan(0.3);
  const before = await page
    .locator('audio')
    .first()
    .evaluate((el: HTMLAudioElement) => el.currentTime);
  await page.getByRole('button', { name: 'NOSSOM', exact: true }).click();
  const result = await page.locator('audio').evaluateAll((els: HTMLAudioElement[]) =>
    els.map((el) => ({
      time: el.currentTime,
      paused: el.paused,
      duration: el.duration,
      src: el.currentSrc,
    })),
  );
  expect(result[0].paused).toBe(true);
  expect(result[1].src).toContain('/demo/voice-treated.mp3');
  expect(result[1].time).toBeGreaterThanOrEqual(before - 0.1);
  expect(result[1].duration).toBeCloseTo(35, 1);
  await page.getByRole('button', { name: 'Pausar demonstração', exact: true }).click();
  const seek = page.getByLabel('Posição da demonstração', { exact: true });
  await seek.fill('4.25');
  expect(
    await page
      .locator('audio')
      .nth(1)
      .evaluate((el: HTMLAudioElement) => el.currentTime),
  ).toBeCloseTo(4.25, 1);
  await page.getByLabel('Volume da demonstração', { exact: true }).fill('0.5');
  expect(
    await page
      .locator('audio')
      .nth(1)
      .evaluate((el: HTMLAudioElement) => el.volume),
  ).toBe(0.5);
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  expect(
    await page
      .locator('audio')
      .first()
      .evaluate((el: HTMLAudioElement) => el.currentTime),
  ).toBeCloseTo(4.25, 1);
  await page.getByText('Sobre esta demonstração', { exact: true }).click();
  await expect(page.getByText(/Gravação real em português/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Isolar cantor', exact: true })).toHaveAttribute(
    'href',
    '/studio/isolar-voz',
  );
  await page.getByRole('button', { name: 'Ouvir demonstração', exact: true }).click();
  await page
    .locator('audio')
    .first()
    .evaluate((el) => {
      (window as any).__demoAudio = el;
    });
  await page.locator('.voice-player-try').click();
  await expect(page).toHaveURL(/\/studio$/);
  expect(await page.evaluate(() => (window as any).__demoAudio.paused)).toBe(true);
});
test('immersive homepage fits desktop and mobile, respects reduced motion and remains accessible', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const width of [1440, 1000, 390]) {
    await page.setViewportSize({ width, height: 950 });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 750) {
        scrollTo({ top: y, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 20));
      }
      scrollTo({ top: 0, behavior: 'instant' });
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(result.violations).toEqual([]);
    await page.screenshot({ path: `artifacts/nossom-home-${width}.png`, fullPage: true });
    await page.screenshot({ path: `artifacts/nossom-home-hero-${width}.png` });
    await page
      .locator('.voice-player')
      .screenshot({ path: `artifacts/nossom-voice-player-${width}.png` });
  }
  expect(
    await page
      .locator('.chrome-hero-art .ribbon-canvas')
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link', { name: 'Planos', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fechar menu', exact: true }).click();
});
test('current plan is highlighted under the name and desktop update completes without a website download', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let state = { status: 'available', version: '0.1.0', nextVersion: '0.2.0', progress: 0 };
    let listener: (state: unknown) => void = () => {};
    (window as any).__desktopActions = [];
    (window as any).nossomDesktop = {
      getUpdateState: async () => state,
      onUpdate: (next: any) => {
        listener = next;
        return () => {
          listener = () => {};
        };
      },
      update: async (action: string) => {
        (window as any).__desktopActions.push(action);
        if (action === 'download') {
          state = { ...state, status: 'downloading', progress: 50 };
          listener(state);
          setTimeout(() => {
            state = { ...state, status: 'downloaded', progress: 100 };
            listener(state);
          }, 100);
        }
        if (action === 'install') {
          state = { ...state, status: 'installing' };
          listener(state);
        }
        return state;
      },
    };
  });
  await page.context().grantPermissions(['microphone']);
  await page.goto('/studio/automatico');
  await expect(page.locator('.workspace-label .account-plan')).toHaveText('Plano Grátis');
  await expect(
    page.getByRole('heading', { name: 'Uma nova NOSSOM chegou.', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Atualizar agora', exact: true }).click();
  await page.getByRole('button', { name: 'Gravar uma ideia', exact: true }).click();
  await expect(
    page.getByText('Aguardando sua gravação ou tratamento terminar antes de reiniciar.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.waitForTimeout(3300);
  expect(await page.evaluate(() => (window as any).__desktopActions)).toEqual(['download']);
  await page.getByRole('button', { name: /^Finalizar ·/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Reiniciando a NOSSOM…', exact: true }),
  ).toBeVisible({ timeout: 90000 });
  expect(await page.evaluate(() => (window as any).__desktopActions)).toEqual([
    'download',
    'install',
  ]);
  await page.getByRole('button', { name: 'Fechar aviso de atualização', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir menu da conta', exact: true }).click();
  await expect(page.locator('.account-profile .account-plan')).toHaveText('Plano Grátis');
});
