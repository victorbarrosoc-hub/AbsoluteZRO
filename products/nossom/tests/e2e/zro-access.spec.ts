import { test, expect } from '@playwright/test';
import { existingAccount, signIn, zroLink } from './fixtures';

test('the NOSSOM opens only when the Absolute ZRO admin released it for the organization', async ({
  page,
}) => {
  const email = 'zro.' + crypto.randomUUID() + '@example.test',
    password = 'senha-de-teste';
  const id = await existingAccount(page.request, { email, password, name: 'Pessoa ZRO' });
  expect(id).toBeTruthy();

  // Conta ligada à Absolute ZRO, mas a organização ainda não tem o NOSSOM: entra e vê o aviso.
  await zroLink(page.request, id!, ['synquei']);
  expect((await signIn(page.request, email, password)).status()).toBe(200);
  await page.goto('/studio');
  await expect(
    page.getByRole('heading', { name: 'Sua conta Absolute ZRO ainda não tem acesso ao NOSSOM.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Ver na Absolute ZRO', exact: true }),
  ).toHaveAttribute('href', 'https://absolutezro.vercel.app/ferramentas');
  await expect(page.locator('.studio-header')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // As funções da conta são recusadas no servidor, não só escondidas.
  const account = await (await page.request.get('/api/account')).json();
  expect(account.account.zroBlocked).toBe(true);
  expect((await page.request.get('/api/usage')).status()).toBe(401);
  expect((await page.request.get('/api/zro/conta')).status()).toBe(401);
  // Páginas públicas continuam abertas.
  expect((await page.request.get('/')).status()).toBe(200);

  // O admin libera o NOSSOM; na próxima entrada a conta usa o estúdio normalmente.
  await zroLink(page.request, id!, ['synquei', 'nossom']);
  expect((await signIn(page.request, email, password)).status()).toBe(200);
  await page.goto('/studio');
  await expect(
    page.getByText('Sua conta Absolute ZRO ainda não tem acesso ao NOSSOM.'),
  ).toHaveCount(0);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  expect((await page.request.get('/api/usage')).status()).toBe(200);
  expect((await page.request.get('/api/account')).ok()).toBe(true);
  expect(
    (await (await page.request.get('/api/account')).json()).account.zroBlocked,
  ).toBeUndefined();
});

test('an older account that never used the Absolute ZRO keeps working as before', async ({
  page,
}) => {
  const email = 'antiga.' + crypto.randomUUID() + '@example.test';
  await existingAccount(page.request, { email, password: 'senha-de-teste' });
  expect((await signIn(page.request, email, 'senha-de-teste')).status()).toBe(200);
  await page.goto('/studio');
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  expect((await page.request.get('/api/usage')).status()).toBe(200);
});
