import { test, expect, type Page } from '@playwright/test';
import { ALLOWED, OPEN, existingAccount, signIn, zroLink, zroUnlink } from './fixtures';

// NOSSOM fechado ao público (RELEASE=closed, o padrão do servidor de teste): só a conta `allowed` na claim
// `zro_release` do HUB usa o estúdio. Cada persona abaixo confere páginas, APIs e downloads no servidor.

test.skip(OPEN, 'descreve o NOSSOM fechado ao público (RELEASE=closed, o padrão)');

const newEmail = (prefix: string) => prefix + '.' + crypto.randomUUID() + '@example.test';
const password = 'senha-de-teste';

async function expectDevPage(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Em desenvolvimento.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voltar ao HUB', exact: true })).toHaveAttribute(
    'href',
    'https://absolutezro.com/inicio',
  );
  await expect(page.locator('.studio-header')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

/** Estúdio, APIs do produto, downloads e instalador negados no servidor. */
async function expectProductDenied(page: Page) {
  await expectDevPage(page, '/studio');
  await expectDevPage(page, '/studio/z');
  for (const path of [
    '/api/usage',
    '/api/plans',
    '/api/audio/jobs',
    '/api/admin',
    '/api/zro/set',
    '/api/zro/set/conversas',
  ])
    expect((await page.request.get(path)).status(), path).toBe(403);
  for (const path of ['/baixar', '/baixar/mac', '/baixar/atualizacoes/latest.json'])
    expect((await page.request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
  const install = await page.request.get('/instalar.sh');
  expect(await install.text()).toContain('exit 1');
}

test('anônimo: home sem CTA funcional, estúdio e entrar em "Em desenvolvimento", APIs e downloads negados', async ({
  page,
}) => {
  const home = await page.goto('/');
  expect(home?.status()).toBe(200);
  await expect(page.getByRole('link', { name: /Conhecer o projeto/ }).first()).toBeVisible();
  // Nada que abra, baixe, instale ou venda.
  for (const href of ['/studio', '/apps', '/baixar', '/entrar'])
    await expect(page.locator(`main a[href^="${href}"]`)).toHaveCount(0);
  await expect(page.getByText('Chegando ao NOSSOM')).toBeVisible();
  await expect(page.locator('#planos')).toHaveCount(0);

  await expectDevPage(page, '/entrar');
  await expectDevPage(page, '/apps');
  await expectProductDenied(page);
  expect((await page.request.get('/api/account')).status()).toBe(401);
});

test('conta própria (sem vínculo Absolute ZRO): a senha não abre o NOSSOM fechado', async ({
  page,
}) => {
  const email = newEmail('propria');
  expect(await existingAccount(page.request, { email, password })).toBeTruthy();
  const response = await signIn(page.request, email, password);
  expect(response.status()).toBe(403);
  expect((await response.json()).code).toBe('product_closed');
  expect(response.headers()['set-cookie'] ?? '').not.toContain('nossom-account=');
  await expectProductDenied(page);
});

test('conta Absolute ZRO sem acesso (closed): login recusado e nada do produto', async ({
  page,
}) => {
  const email = newEmail('fechada');
  const id = await existingAccount(page.request, { email, password });
  // Mesmo com o NOSSOM em `zro_products`, `closed` no HUB nega.
  await zroLink(page.request, id!, ['nossom'], { nossom: 'closed' });
  expect((await signIn(page.request, email, password)).status()).toBe(403);
  // Vínculo antigo, sem a claim `zro_release`: também fechado.
  await zroLink(page.request, id!, ['nossom']);
  expect((await signIn(page.request, email, password)).status()).toBe(403);
  await expectProductDenied(page);
});

test('conta allowed: usa o estúdio; ao sair da lista a sessão aberta perde o acesso no próximo pedido', async ({
  page,
}) => {
  const email = newEmail('autorizada');
  const id = await existingAccount(page.request, { email, password, name: 'Pessoa autorizada' });
  await zroLink(page.request, id!, ['nossom'], ALLOWED);
  expect((await signIn(page.request, email, password)).status()).toBe(200);
  await page.goto('/studio');
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Em desenvolvimento.' })).toHaveCount(0);
  expect((await page.request.get('/api/usage')).status()).toBe(200);
  expect(
    (await (await page.request.get('/api/account')).json()).account.zroBlocked,
  ).toBeUndefined();
  // Nada à venda nem para quem entra.
  const subscription = await (await page.request.get('/api/subscription')).json();
  expect(subscription.enabled).toBe(false);

  // Sessão antiga: o proprietário tira a conta da lista. O vínculo é relido a cada pedido.
  await zroLink(page.request, id!, ['nossom'], { nossom: 'closed' });
  await expectProductDenied(page);
  const account = await (await page.request.get('/api/account')).json();
  expect(account.account.zroBlocked).toBe(true);

  // E sem vínculo nenhum (vira conta própria): continua negado.
  await zroUnlink(page.request, id!);
  expect((await page.request.get('/api/usage')).status()).toBe(403);
});
