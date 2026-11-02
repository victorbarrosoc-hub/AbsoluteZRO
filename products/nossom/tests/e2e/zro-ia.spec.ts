import { test, expect, type Page } from '@playwright/test';
import { allowedAccount, OPEN, signIn, definirTema } from './fixtures';
import { sealIaTokens } from '../../lib/server/zro/ia';

/**
 * A Z na tela própria do estúdio (/studio/z), nunca a entrada nem aba da barra (titular, 29/10/2026). O painel de verdade vem de absolutezro.com; aqui ele é trocado por um <zro-ia> mínimo que
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
  // Fechado ao público, só a conta `allowed` no HUB abre o estúdio (e a Z).
  const id = await allowedAccount(page.request, { email, password: 'valid-test-password' });
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

test('/studio lands on the studio home (the task), never on the Z; the Z is a discreet entry, not the first tab', async ({
  page,
}) => {
  const scripts: string[] = [];
  await page.route(SCRIPT, (route) => {
    scripts.push(route.request().url());
    return route.fulfill({ contentType: 'text/javascript', body: STUB });
  });
  await enter(page);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 393, height: 852 },
  ]) {
    await page.setViewportSize(size);
    // Quem entra em /studio (site, PWA, app de computador) cai no Início do estúdio; a busca fica.
    await page.goto('/studio?zro=ok');
    await expect(page).toHaveURL(/\/studio\?zro=ok$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Início do Quasar' })).toBeVisible();
    await expect(page.locator('zro-ia')).toHaveCount(0);
    // A Z é o ícone discreto do topo, apagado.
    const top = page.locator('.studio-header .z-top');
    await expect(top).toBeVisible();
    await expect(top).not.toHaveClass(/active/);
  }
  // A barra do celular não tem a Z; a primeira é o Início.
  const tabs = page.getByRole('navigation', { name: 'Navegação rápida', exact: true });
  await expect(tabs.getByRole('button').first()).toHaveText('Início');
  await expect(tabs.getByRole('button', { name: 'Z', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  // Na barra lateral a Z vem por último, depois das seções do estúdio.
  const nav = page.getByRole('navigation', { name: 'Navegação do estúdio', exact: true });
  await expect(nav.getByRole('button').first()).toHaveText('Início');
  await expect(nav.getByRole('button').last()).toHaveText('Z');
  expect(scripts).toHaveLength(0);
});

test('the Z opens only when asked: top icon or /studio/z link, asks to connect without a token and fills the screen', async ({
  page,
}) => {
  await page.route(SCRIPT, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: STUB }),
  );
  await enter(page);
  await page.goto('/studio/z');
  const nav = page.getByRole('navigation', { name: 'Navegação do estúdio', exact: true });
  await expect(nav.getByRole('button', { name: 'Z', exact: true })).toHaveClass(/active/);
  await expect(page.locator('.studio-header .z-top')).toHaveClass(/active/);
  const z = page.locator('zro-ia');
  await expect(z).toHaveAttribute('api', '/api/zro/ia');
  await expect(z).toHaveAttribute('tema', 'escuro');
  expect(JSON.parse((await z.getAttribute('sugestoes'))!)).toHaveLength(4);
  const connect = page.getByRole('link', { name: 'Conectar com Absolute ZRO' });
  await expect(connect).toBeVisible();
  await expect(connect).toHaveAttribute('href', '/api/zro/entrar?modo=ligar&volta=%2Fstudio%2Fz');
  await expect(
    page.getByText('Conecte sua conta Absolute ZRO para conversar com a Z.'),
  ).toBeVisible();
  // Tela só da Z: sem o assistente nem o envio de áudio embaixo, sem rodapé.
  await expect(page.getByRole('heading', { name: 'Início do Quasar' })).toHaveCount(0);
  await expect(page.locator('.studio-footer')).toBeHidden();
  const zBox = (await z.boundingBox())!;
  expect(zBox.height).toBeGreaterThan(600);
  // O tema do estúdio chega ao painel.
  await definirTema(page, 'light');
  await expect(z).toHaveAttribute('tema', 'claro');
  // O Início volta a ser só o assistente do NOSSOM com o envio de áudio.
  await nav.getByRole('button', { name: 'Início', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/inicio$/);
  await expect(page.locator('zro-ia')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Início do Quasar' })).toBeVisible();
  await page.locator('.studio-header .z-top').click();
  await expect(page).toHaveURL(/\/studio\/z$/);
  await expect(page.locator('zro-ia')).toHaveCount(1);
  await page.goto('/studio/ia');
  await expect(page.locator('zro-ia')).toHaveCount(0);
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
  await expect(page.locator('zro-ia')).toHaveCount(0);
  // No celular a Z abre pelo anel do topo (não é aba da barra de baixo).
  await page.locator('.studio-header .z-top').click();
  await expect(page).toHaveURL(/\/studio\/z$/);
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
  // Fechado ao público, a home só existe para a conta liberada (titular, 01/11/2026; anônimo vai para a Absolute ZRO,
  // tests/e2e/zro-access.spec.ts). Aberto, ela é pública; a sessão não muda o selo.
  await enter(page);
  // A home é estática: o selo depende das variáveis da Absolute ZRO no momento do build.
  await page.goto('/');
  const section = page.locator('#z');
  // Fechado ao público: a Z volta a "Chegando ao NOSSOM", sem link nenhum.
  if (!OPEN) {
    await expect(section.getByText('Chegando ao Quasar')).toBeVisible();
    await expect(section.getByRole('link')).toHaveCount(0);
    return;
  }
  await expect(section.getByRole('link', { name: 'Conhecer a Z' })).toBeVisible();
  const ready = await section.getByText('Já no Quasar').count();
  await expect(section.getByText(ready ? 'Já no Quasar' : 'Chegando ao Quasar')).toBeVisible();
  await expect(section.getByRole('link', { name: 'Conversar com a Z' })).toHaveCount(ready);
  if (ready)
    await expect(section.getByRole('link', { name: 'Conversar com a Z' })).toHaveAttribute(
      'href',
      '/studio/z',
    );
});

test('if the Z panel cannot load, its tab says so and the studio home stays as before', async ({
  page,
}) => {
  await page.route(SCRIPT, (route) => route.abort());
  await enter(page);
  await page.goto('/studio/z');
  await expect(page.getByText('A Z não carregou agora.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await page.goto('/studio/inicio');
  await expect(page.getByRole('heading', { name: 'Início do Quasar' })).toBeVisible();
  await expect(page.locator('zro-ia')).toHaveCount(0);
});
