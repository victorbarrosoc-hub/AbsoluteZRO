import { test, expect, type Page } from '@playwright/test';
import { existingAccount, signIn } from './fixtures';
import { sealIaTokens } from '../../lib/server/zro/ia';

/**
 * A Z no topo do Início. O painel de verdade vem de absolutezro.com; aqui ele é trocado por um <zro-ia> mínimo que
 * faz o mesmo contrato (GET {api}/estado, 401 → zro-ia:sem-login). O caminho até a "Absolute ZRO" passa pelo
 * repasse /api/zro/ia de verdade e pela API falsa de scripts/test-server.mjs.
 */
const SCRIPT = 'https://absolutezro.com/ia/v1/zro-ia.js';
const STUB = `
customElements.define('zro-ia', class extends HTMLElement {
  async connectedCallback() {
    const r = await fetch(this.getAttribute('api') + '/estado', { credentials: 'same-origin' })
    if (r.status === 401) {
      this.textContent = 'sem conta'
      this.dispatchEvent(new CustomEvent('zro-ia:sem-login', { bubbles: true, composed: true }))
      return
    }
    const e = await r.json()
    this.innerHTML = '<p class="z-ola">Olá, ' + e.nome + '.</p>'
  }
})`;

async function enter(page: Page, o: { iaToken?: string } = {}) {
  const email = 'z.' + crypto.randomUUID() + '@example.test';
  const id = await existingAccount(page.request, { email, password: 'valid-test-password' });
  expect((await signIn(page.request, email, 'valid-test-password')).status()).toBe(200);
  if (o.iaToken) {
    process.env.NOSSOM_AUTH_SECRET = 'local-e2e-session-key-placeholder';
    const value = sealIaTokens(id!, {
      access: o.iaToken,
      refresh: null,
      expires: Date.now() + 600000,
      scope: 'openid email profile org offline_access zro.ia',
    });
    await page
      .context()
      .addCookies([
        { name: 'nossom-zro-ia', value, domain: 'localhost', path: '/api/zro/ia', httpOnly: true },
      ]);
  }
}

test('the Z opens the studio home, asks to connect without a token and keeps the NOSSOM assistant below', async ({
  page,
}) => {
  await page.route(SCRIPT, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: STUB }),
  );
  await enter(page);
  await page.goto('/studio');
  const z = page.locator('zro-ia');
  await expect(z).toHaveAttribute('api', '/api/zro/ia');
  await expect(z).toHaveAttribute('tema', 'escuro');
  expect(JSON.parse((await z.getAttribute('sugestoes'))!)).toHaveLength(4);
  const connect = page.getByRole('link', { name: 'Conectar com Absolute ZRO' });
  await expect(connect).toBeVisible();
  await expect(connect).toHaveAttribute('href', '/api/zro/entrar?modo=ligar&volta=%2Fstudio');
  await expect(
    page.getByText('Conecte sua conta Absolute ZRO para conversar com a Z.'),
  ).toBeVisible();
  // O assistente e o envio de áudio do NOSSOM continuam no Início, logo abaixo da Z.
  await expect(page.getByRole('heading', { level: 2, name: 'Seu áudio, melhor.' })).toBeVisible();
  const zBox = (await z.boundingBox())!,
    assistant = (await page.locator('.assistant-below-z').boundingBox())!;
  expect(assistant.y).toBeGreaterThan(zBox.y + zBox.height - 1);
  // O tema do estúdio chega ao painel.
  await page.getByLabel('Tema do estúdio').selectOption('light');
  await expect(z).toHaveAttribute('tema', 'claro');
  // O assistente NOSSOM sozinho continua em /studio/ia, sem a Z.
  await page.goto('/studio/ia');
  await expect(page.locator('zro-ia')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Seu áudio, melhor.' })).toBeVisible();
});

test('with the Z token the panel talks to the Absolute ZRO through the proxy, token never in the page', async ({
  page,
}) => {
  await page.route(SCRIPT, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: STUB }),
  );
  await enter(page, { iaToken: 'zat_e2e' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/studio');
  await expect(page.locator('zro-ia .z-ola')).toHaveText('Olá, Teste.');
  await expect(page.getByRole('link', { name: 'Conectar com Absolute ZRO' })).toHaveCount(0);
  // A resposta chega em streaming pelo repasse.
  const answer = await page.evaluate(async () => {
    const r = await fetch('/api/zro/ia/mensagens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversa: null, texto: 'Como limpo minha fala?' }),
    });
    return { status: r.status, type: r.headers.get('content-type'), text: await r.text() };
  });
  expect(answer.status).toBe(200);
  expect(answer.type).toContain('ndjson');
  expect(
    answer.text
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l).tipo),
  ).toEqual(['conversa', 'texto', 'fim']);
  expect(await page.content()).not.toContain('zat_e2e');
  expect(await page.evaluate(() => document.cookie)).not.toContain('nossom-zro-ia');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the public home tells the truth about the Z: available with the Absolute ZRO login, coming without it', async ({
  page,
}) => {
  // A home é estática: o selo depende das variáveis da Absolute ZRO no momento do build.
  await page.goto('/');
  const section = page.locator('#z');
  await expect(section.getByRole('link', { name: 'Conhecer a Z' })).toBeVisible();
  const ready = await section.getByText('Já no NOSSOM').count();
  await expect(section.getByText(ready ? 'Já no NOSSOM' : 'Chegando ao NOSSOM')).toBeVisible();
  await expect(section.getByRole('link', { name: 'Conversar com a Z' })).toHaveCount(ready);
  if (ready)
    await expect(section.getByRole('link', { name: 'Conversar com a Z' })).toHaveAttribute(
      'href',
      '/studio',
    );
});

test('if the Z panel cannot load, the studio home stays as before', async ({ page }) => {
  await page.route(SCRIPT, (route) => route.abort());
  await enter(page);
  await page.goto('/studio');
  await expect(page.getByRole('heading', { name: 'Seu áudio, melhor.' })).toBeVisible();
  await expect(page.locator('zro-ia')).toHaveCount(0);
});
