import { test as guest } from '@playwright/test';
import { test, expect, existingAccount, signIn, zroLink, ALLOWED, onlyWhenOpen } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
guest(
  'homepage login menu animates, traps focus, switches forms and signs in without leaving the homepage first',
  async ({ page }) => {
    // Descreve o produto aberto (entrar, assinar, home com ações, /apps).
    onlyWhenOpen();
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Entrar na sua conta', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'SEU ESPAÇO NOSSOM', exact: true });
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole('button', { name: 'Fechar menu da conta', exact: true });
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(
      dialog.getByRole('link', { name: 'Privacidade e armazenamento', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    // Conta nova só pela Absolute ZRO; quem já tem conta entra com e-mail e senha.
    await dialog.getByRole('button', { name: 'Criar conta', exact: true }).click();
    await expect(
      dialog.getByRole('link', { name: 'Criar conta com a Absolute ZRO', exact: true }),
    ).toHaveAttribute('href', '/api/zro/entrar?modo=criar&volta=%2Fstudio');
    await expect(dialog.getByLabel('Senha', { exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
    const email = 'motion.' + crypto.randomUUID() + '@example.test';
    await existingAccount(page.request, { email, password: 'motion-test-password' });
    await dialog.getByLabel('E-mail', { exact: true }).fill(email);
    await dialog.getByLabel('Senha', { exact: true }).fill('motion-test-password');
    await dialog.getByRole('button', { name: 'Mostrar senha', exact: true }).click();
    await expect(dialog.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'text');
    await dialog.getByRole('button', { name: 'Ocultar senha', exact: true }).click();
    await expect(dialog.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'password');
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await dialog.getByRole('button', { name: 'Entrar no estúdio', exact: true }).click();
    await expect(page).toHaveURL(/\/studio\/z$/);
    await expect(
      page.getByRole('button', { name: 'Abrir menu da conta', exact: true }),
    ).toBeVisible();
  },
);
guest(
  'mobile access menu respects reduced motion, fits the screen and closes with Escape or outside tap',
  async ({ page }) => {
    // Descreve o produto aberto (entrar, assinar, home com ações, /apps).
    onlyWhenOpen();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Entrar na sua conta', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: 'artifacts/nossom-menu-login-mobile.png', fullPage: true });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.mouse.click(4, 4);
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  },
);
test('account menu shows the actual profile and balance, navigates and logs out on mobile', async ({
  page,
}) => {
  // Descreve o produto aberto (entrar, assinar, home com ações, /apps).
  onlyWhenOpen();
  await page.goto('/studio/inicio');
  const trigger = page.getByRole('button', { name: 'Abrir menu da conta', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Sua conta', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Pessoa de teste', { exact: true })).toBeVisible();
  await expect(dialog.getByText('5 de 5 min disponíveis neste mês', { exact: true })).toBeVisible();
  // Sem a Absolute ZRO ligada: o menu de sempre, com o convite para ligar.
  await expect(
    dialog.getByRole('link', { name: 'Ligar conta Absolute ZRO', exact: true }),
  ).toHaveAttribute('href', '/api/zro/entrar?modo=ligar&volta=%2Fstudio%2Fconta');
  await expect(dialog.getByText('Conta Absolute ZRO', { exact: true })).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'artifacts/nossom-menu-conta-desktop.png', fullPage: true });
  await dialog.getByRole('link', { name: 'Meus projetos', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/projetos$/);
  await expect(dialog).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/nossom-menu-conta-mobile.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  expect((await page.request.get('/api/account')).status()).toBe(401);
});
guest(
  'a linked account shows the Absolute ZRO identity and the shortcut to edit it there',
  async ({ page }) => {
    await page.route('https://absolutezro.com/**', (route) => route.abort());
    const email = 'lia.' + crypto.randomUUID() + '@example.test';
    const id = await existingAccount(page.request, {
      email,
      password: 'senha-de-teste',
      name: 'Lia Produtora',
    });
    await zroLink(page.request, id!, ['nossom'], ALLOWED);
    expect((await signIn(page.request, email, 'senha-de-teste')).status()).toBe(200);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width > 500 ? 1000 : 844 });
      await page.goto('/studio/inicio');
      await page.getByRole('button', { name: 'Abrir menu da conta', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Sua conta', exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Lia Produtora', { exact: true })).toBeVisible();
      await expect(dialog.getByText(email + ' · Produtora', { exact: true })).toBeVisible();
      await expect(dialog.getByText('Conta Absolute ZRO', { exact: true })).toBeVisible();
      // O selo do plano é o do servidor: conta gratuita não vira "ilimitado".
      await expect(dialog.locator('.account-plan')).not.toContainText('Ilimitado');
      const edit = dialog.getByRole('link', { name: 'Editar na conta Absolute ZRO', exact: true });
      await expect(edit).toHaveAttribute('href', 'https://absolutezro.com/perfil');
      await expect(edit).toHaveAttribute('target', '_blank');
      await expect(dialog.getByRole('link', { name: 'Ligar conta Absolute ZRO' })).toHaveCount(0);
      for (const label of ['Meu estúdio', 'Meus projetos', 'Configurações da conta'])
        await expect(dialog.getByRole('link', { name: label, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
          .violations,
      ).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
  },
);
