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
  // a página neutra (titular, 01/11/2026): nada do NOSSOM
  await expect(page.getByRole('heading', { name: 'Página indisponível.' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Ir para a Absolute ZRO', exact: true }),
  ).toHaveAttribute('href', 'https://absolutezro.com');
  await expect(page.locator('main')).not.toContainText('NOSSOM');
  await expect(page.locator('main')).not.toContainText('Quasar');
  await expect(page.locator('.studio-header')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function expectFora(page: Page, path: string) {
  const response = await page.request.get(path, { maxRedirects: 0 });
  expect(response.status(), path).toBe(307);
  expect(response.headers().location, path).toBe('https://absolutezro.com/');
}

/** Estúdio, APIs do produto, downloads e instalador negados no servidor. */
async function expectProductDenied(page: Page, { sessao = false } = {}) {
  // com sessão (sem acesso), o estúdio mostra a página neutra no mesmo endereço; sem sessão, vai para a Absolute ZRO
  for (const path of ['/studio', '/studio/z'])
    await (sessao ? expectDevPage(page, path) : expectFora(page, path));
  for (const path of [
    '/api/usage',
    '/api/plans',
    '/api/audio/jobs',
    '/api/admin',
    '/api/zro/set',
    '/api/zro/set/conversas',
  ])
    expect((await page.request.get(path)).status(), path).toBe(403);
  // as páginas do site e os downloads vão para a Absolute ZRO
  for (const path of [
    '/',
    '/apps',
    '/entrar',
    '/baixar',
    '/baixar/mac',
    '/baixar/atualizacoes/latest.json',
  ])
    await expectFora(page, path);
  const install = await page.request.get('/instalar.sh');
  expect(await install.text()).toContain('exit 1');
}

test('anônimo: o site, o estúdio e os downloads vão para a Absolute ZRO; APIs negadas', async ({
  page,
}) => {
  // titular, 01/11/2026: o NOSSOM não lançado não aparece para quem não tem acesso, nem a página inicial
  for (const path of ['/', '/apps', '/entrar', '/studio', '/studio/z', '/em-desenvolvimento'])
    await expectFora(page, path);
  for (const path of ['/api/usage', '/api/plans', '/api/audio/jobs', '/api/admin', '/api/zro/set'])
    expect((await page.request.get(path)).status(), path).toBe(403);
  for (const path of ['/baixar', '/baixar/mac', '/baixar/atualizacoes/latest.json'])
    await expectFora(page, path);
  const install = await page.request.get('/instalar.sh');
  expect(await install.text()).toContain('exit 1');
  expect(await install.text()).not.toContain('NOSSOM');
  expect(await install.text()).not.toContain('Quasar');
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
  await expect(page.getByRole('heading', { name: 'Página indisponível.' })).toHaveCount(0);
  expect((await page.request.get('/api/usage')).status()).toBe(200);
  expect(
    (await (await page.request.get('/api/account')).json()).account.zroBlocked,
  ).toBeUndefined();
  // Nada à venda nem para quem entra.
  const subscription = await (await page.request.get('/api/subscription')).json();
  expect(subscription.enabled).toBe(false);

  // Sessão antiga: o proprietário tira a conta da lista. O vínculo é relido a cada pedido.
  await zroLink(page.request, id!, ['nossom'], { nossom: 'closed' });
  await expectProductDenied(page, { sessao: true });
  const account = await (await page.request.get('/api/account')).json();
  expect(account.account.zroBlocked).toBe(true);

  // E sem vínculo nenhum (vira conta própria): continua negado.
  await zroUnlink(page.request, id!);
  expect((await page.request.get('/api/usage')).status()).toBe(403);
});
