import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existingAccount } from './fixtures';
async function openAccess(page: Page) {
  const card = page.locator('.account-form-wrap');
  await expect(card).toHaveCSS('opacity', '1');
  await card.hover();
  await expect(card).toHaveClass(/is-expanded/);
}
/** Conta e-mail/senha que já existe no Supabase entra pela tela, como sempre. */
async function create(page: Page, name: string, email: string) {
  await existingAccount(page.request, { email, password: 'senha-de-teste', name });
  await page.goto('/entrar');
  await openAccess(page);
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar no estúdio', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/z(?:\?|$)/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
}
test('every studio route and the paid assistant require an account; public sharing assets remain accessible', async ({
  page,
  request,
}) => {
  await page.goto('/studio/efeitos');
  await expect(page).toHaveURL(/\/entrar\?next=/);
  await openAccess(page);
  await expect(page.getByRole('button', { name: 'Entrar no estúdio', exact: true })).toBeVisible();
  const ai = await request.post('/api/ai/assistant', {
    headers: { Origin: 'http://localhost:3000' },
    data: { text: 'Teste' },
  });
  expect(ai.status()).toBe(401);
  const cross = await request.post('/api/account', {
    headers: { Origin: 'https://another.test' },
    data: { action: 'register', name: 'Pessoa', username: 'fake', password: 'senha-de-teste' },
  });
  expect(cross.status()).toBe(403);
  // Conta nova só pela Absolute ZRO: o cadastro por e-mail e senha é recusado no servidor.
  const signup = await request.post('/api/account', {
    headers: { Origin: 'http://localhost:3000' },
    data: {
      action: 'register',
      name: 'Pessoa',
      email: 'nova.' + crypto.randomUUID() + '@example.test',
      password: 'senha-de-teste',
    },
  });
  expect(signup.status()).toBe(403);
  const refused = await signup.json();
  expect(refused.code).toBe('zro_only');
  expect(refused.createWith).toBe('/api/zro/entrar?modo=criar');
  expect(signup.headers()['set-cookie']).toBeUndefined();
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  const social = await request.get('/opengraph-image');
  expect(social.ok()).toBe(true);
});
test('existing Supabase accounts sign in, sign out and sign in from another browser with their own password', async ({
  page,
  context,
}) => {
  await create(page, 'Pessoa Fictícia', 'pessoa.ficticia@example.test');
  const cookie = (await context.cookies()).find((c) => c.name === 'nossom-account')!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.secure).toBe(true);
  const status = await (await page.request.get('/api/ai/status')).json();
  expect(status.authorized).toBe(true);
  expect(status.shared).toBe(true);
  expect(status.mode).toBe('managed');
  expect(status.agentId).toBeUndefined();
  expect(status.environmentId).toBeUndefined();
  const saved = await page.evaluate(() => localStorage.getItem('nossom-demo-accounts-v1'));
  expect(saved).toBeNull();
  await page.getByRole('button', { name: 'Abrir menu da conta', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sair da conta', exact: true })
    .click();
  await expect(page).toHaveURL(/\/entrar$/);
  await openAccess(page);
  await expect(page.getByRole('button', { name: 'Entrar no estúdio', exact: true })).toBeVisible();
  await page.getByLabel('E-mail', { exact: true }).fill('pessoa.ficticia@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar no estúdio', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'E-mail ou senha inválidos' }),
  ).toContainText('E-mail ou senha inválidos');
  await page.getByLabel('Senha', { exact: true }).fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar no estúdio', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/z$/);
  await expect(page.getByText('pessoa.ficticia@example.test', { exact: true })).toBeVisible();
  const another = await page.context().browser()!.newContext();
  const elsewhere = await another.newPage();
  await elsewhere.goto('http://localhost:3000/entrar');
  await openAccess(elsewhere);
  await elsewhere.getByLabel('E-mail', { exact: true }).fill('pessoa.ficticia@example.test');
  await elsewhere.getByLabel('Senha', { exact: true }).fill('senha-de-teste');
  await elsewhere.getByRole('button', { name: 'Entrar no estúdio', exact: true }).click();
  await expect(elsewhere).toHaveURL(/\/studio\/z$/);
  await another.close();
});
test('accounts keep separate project spaces and logging back in restores the first account workspace', async ({
  page,
}) => {
  await create(page, 'Alice de teste', 'alice.demo@example.test');
  await page.goto('/studio/automatico');
  await page
    .getByLabel('Importar arquivo de áudio', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-speech.wav');
  await expect(page).toHaveURL(/\/studio\/automatico\?project=/, { timeout: 90000 });
  const project = new URL(page.url()).searchParams.get('project')!;
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menu da conta', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sair da conta', exact: true })
    .click();
  await expect(page).toHaveURL(/\/entrar$/);
  await openAccess(page);
  await create(page, 'Bob de teste', 'bob.demo@example.test');
  await page.goto('/studio/projetos');
  await expect(page.getByText('synthetic-speech', { exact: true })).toHaveCount(0);
  await page.goto('/studio/equalizacao?project=' + project);
  await expect(page.getByLabel('Importar arquivo de áudio', { exact: true })).toHaveCount(1);
  await expect(page.getByText('synthetic-speech', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir menu da conta', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sair da conta', exact: true })
    .click();
  await expect(page).toHaveURL(/\/entrar$/);
  await openAccess(page);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('alice.demo@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar no estúdio', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/z$/);
  await page.goto('/studio/projetos');
  await expect(page.getByText('synthetic-speech', { exact: true })).toBeVisible();
});
test('account access is responsive and accessible with email and no per-user API configuration', async ({
  page,
}) => {
  await page.goto('/entrar');
  await openAccess(page);
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Criar conta com a Absolute ZRO', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Nome', { exact: true })).toHaveCount(0);
  for (const label of ['API Key', 'Agent ID', 'Environment ID', 'Código de acesso da NOSSOM'])
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/conta-nossom-mobile.png', fullPage: true });
});
