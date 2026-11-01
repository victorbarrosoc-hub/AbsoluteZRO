import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { allowedAccount, signIn, definirTema } from './fixtures';

/**
 * O Set da Absolute ZRO (presença e conversas, ADR 0032 de lá) no estúdio: "Set" no fim da navegação (lateral e barra
 * do celular), que só aparece quando o Set responde e abre a folha do <zro-set modo="folha">, sem trocar de tela. O
 * widget é o de verdade (a cópia do repositório, apps/hub-web/public/set/v1); o repasse /api/zro/set responde aqui como
 * responderia com a conta conectada (o caminho até a Absolute ZRO tem os testes dele em tests/zro.test.ts).
 */
const SCRIPT = 'https://absolutezro.com/set/v1/zro-set.js';
const WIDGET = readFileSync(
  resolve(__dirname, '../../../../apps/hub-web/public/set/v1/zro-set.js'),
);
const P = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const ESTADO = {
  eu: {
    id: P(1),
    arroba: 'teste',
    nome: 'Pessoa de teste',
    foto: null,
    preferencias: { invisivel: false, quemVe: 'equipe_contatos', mostrarVisto: true },
  },
  pessoas: [
    {
      id: P(2),
      arroba: 'rui',
      nome: 'Rui Tavares',
      foto: null,
      estado: 'online',
      app: { id: 'maestro', nome: 'Maestro' },
    },
    {
      id: P(3),
      arroba: 'bia',
      nome: 'Bia Lemos',
      foto: null,
      estado: 'ausente',
      app: { id: 'hub', nome: 'Absolute ZRO' },
    },
  ],
  naoLidas: 2,
  pedidos: 0,
  porConversa: {},
  ultima: 0,
};
const FOTOS = process.env.SET_FOTOS;

async function enter(page: Page, o: { logado: boolean }) {
  await page.route(SCRIPT, (route) =>
    route.fulfill({
      contentType: 'text/javascript; charset=utf-8',
      headers: { 'access-control-allow-origin': '*' },
      body: WIDGET,
    }),
  );
  await page.route(/\/api\/zro\/set(\/|\?|$)/, (route) => {
    const caminho = new URL(route.request().url()).pathname.replace(/^\/api\/zro\/set/, '');
    const json = (status: number, corpo: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) });
    if (!o.logado) return json(401, { erro: 'reconectar_zro' });
    if (caminho === '' || caminho === '/') return json(200, ESTADO);
    if (caminho === '/conversas') return json(200, { conversas: [], projetos: [] });
    if (caminho === '/contatos')
      return json(200, { contatos: [], recebidos: [], enviados: [], bloqueados: [] });
    return json(200, { ok: true });
  });
  const email = 'set.' + crypto.randomUUID() + '@example.test';
  await allowedAccount(page.request, { email, password: 'valid-test-password' });
  expect((await signIn(page.request, email, 'valid-test-password')).status()).toBe(200);
}

test('Set closes the studio navigation right before the Z, shows up when the Set answers and opens the sheet without changing the view', async ({
  page,
}) => {
  await enter(page, { logado: true });
  await page.goto('/studio/inicio');
  const nav = page.getByRole('navigation', { name: 'Navegação do estúdio', exact: true });
  const set = nav.locator('[data-set]');
  await expect(set).toBeVisible();
  await expect(set).toContainText('Set');
  // A primeira aba e a tela de entrada não mudam; o Set fica no fim, logo antes da Z (que é sempre a última).
  await expect(nav.locator('button').first()).not.toHaveAttribute('data-set', '');
  expect(await set.evaluate((b) => b.nextElementSibling?.textContent?.trim() ?? null)).toBe('Z');
  await expect(set).toHaveAttribute('aria-label', /Set, 1 online, 2 novidades/);
  await set.click();
  const folha = page.locator('zro-set-folha .folha[data-on] .painel');
  await expect(folha).toBeVisible();
  await expect(page.locator('zro-set-folha .linha', { hasText: 'Rui Tavares' })).toBeVisible();
  await expect(set).toHaveAttribute('aria-expanded', 'true');
  await expect(page).toHaveURL(/\/studio\/inicio$/);
  // A folha veste os tokens do estúdio (a tinta é a do estúdio, no tema escuro padrão).
  const [cor, tinta] = await page.evaluate(() => {
    const p = document.querySelector('zro-set-folha')!.shadowRoot!.querySelector('.painel')!;
    return [
      getComputedStyle(p).color,
      getComputedStyle(document.querySelector('.studio-shell')!).color,
    ];
  });
  expect(cor).toBe(tinta);
  if (FOTOS) {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${FOTOS}/nossom-desktop-escuro.png` });
  }
  await page.keyboard.press('Escape');
  await expect(set).toHaveAttribute('aria-expanded', 'false');
  // Tema claro do estúdio: a folha acompanha.
  await definirTema(page, 'light');
  await expect(page.locator('zro-set')).toHaveAttribute('tema', 'claro');
  await set.click();
  await expect(folha).toBeVisible();
  const [corClara, tintaClara] = await page.evaluate(() => {
    const p = document.querySelector('zro-set-folha')!.shadowRoot!.querySelector('.painel')!;
    return [
      getComputedStyle(p).color,
      getComputedStyle(document.querySelector('.studio-shell')!).color,
    ];
  });
  expect(corClara).toBe(tintaClara);
  expect(corClara).not.toBe(cor);
  if (FOTOS) {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${FOTOS}/nossom-desktop-claro.png` });
  }
});

test('on the phone Set is the last tab of the bottom bar and the sheet fills the screen', async ({
  page,
}) => {
  await enter(page, { logado: true });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/studio/inicio');
  const tabs = page.getByRole('navigation', { name: 'Navegação rápida', exact: true });
  const set = tabs.locator('[data-set]');
  await expect(set).toBeVisible();
  await expect(tabs.locator('button').last()).toHaveAttribute('data-set', '');
  await set.click();
  const folha = page.locator('zro-set-folha .folha[data-on] .painel');
  await expect(folha).toBeVisible();
  await page.waitForTimeout(500);
  const caixa = (await folha.boundingBox())!;
  expect(caixa.width).toBeGreaterThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (FOTOS) await page.screenshot({ path: `${FOTOS}/nossom-393-escuro.png` });
});

test('without the Set scope (older login) there is no Set entry and the studio stays the same', async ({
  page,
}) => {
  await enter(page, { logado: false });
  await page.goto('/studio/inicio');
  await expect(page.getByRole('heading', { name: 'Seu áudio, melhor.' })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator('[data-set]')).toHaveCount(0);
});
