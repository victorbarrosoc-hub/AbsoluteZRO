/**
 * O que cada pessoa vê (drizzle/0027, src/lib/acessos.ts; pedido do titular, 29/10/2026). O editor (equipe) não vê
 * Financeiro nem Orçamentos na navegação, nem dinheiro no Hoje, na ficha do freela ou no inventário, e o HTML que chega
 * não traz os valores; quem digita o endereço vê o estado "sem acesso" (ou 404 na ficha). A administração liga uma
 * área em Ajustes → Pessoas (interruptor, salva na hora) e a pessoa passa a ver; "Voltar ao padrão" desfaz.
 * Organização própria (e2e/preparar.ts), no computador e no iPhone. Com SHOTS_DIR, guarda as capturas da tela de acesso.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ARQUIVO = "test-results/e2e-sessao-acessos.json";
const SHOTS = process.env.SHOTS_DIR;
type Semente = { admin: string; gestor: string; editor: string; freela: string; equip: string; orc: string };
const s = () => JSON.parse(readFileSync(ARQUIVO, "utf8")) as Semente;

async function como(context: BrowserContext, baseURL: string, token: string) {
  await context.clearCookies();
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
}

async function semRolagemDeLado(page: Page) {
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sobra, page.url()).toBeLessThanOrEqual(0);
}

/** As seções da navegação que a pessoa vê (cápsula no computador, "Mais" no celular). */
async function secoes(page: Page, celular: boolean): Promise<string[]> {
  if (celular) {
    await page.goto("/app/mais");
    return page.locator(".mais-item span").allTextContents();
  }
  await page.goto("/app/hoje");
  const nav = page.getByRole("navigation", { name: "Seções do Maestro" }).first();
  // Os grupos são menus: o nome das seções está nos links (dentro dos menus fechados também).
  return nav.locator("a").evaluateAll((as) => as.map((a) => (a.textContent ?? "").trim()));
}

test.describe.configure({ mode: "serial" });

test("o editor não vê dinheiro: nem na navegação, nem no Hoje, nem nas fichas, nem no HTML", async ({ page, context, baseURL }, info) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  const celular = info.project.name === "iphone";
  await page.emulateMedia({ colorScheme: "light" });
  await como(context, baseURL!, s().editor);

  const nomes = await secoes(page, celular);
  expect(nomes.join(" ")).toContain("Quadro");
  expect(nomes.some((n) => /Financeiro/.test(n))).toBe(false);
  expect(nomes.some((n) => /Orçamentos/.test(n))).toBe(false);

  await page.goto("/app/hoje");
  await expect(page.getByRole("region", { name: "Agenda" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Caixa da semana" })).toHaveCount(0);
  await expect(page.getByText("A receber na semana")).toHaveCount(0);
  await expect(page.getByText("Orçamentos aguardando")).toHaveCount(0);
  expect(await page.content()).not.toContain("12.500,00");
  await semRolagemDeLado(page);

  // Endereço digitado: o estado "sem acesso", sem nada da área.
  await page.goto("/app/financeiro");
  await expect(page.getByText("Financeiro: sem acesso")).toBeVisible();
  expect(await page.content()).not.toContain("Parcela 1/2");
  await page.goto("/app/orcamentos");
  await expect(page.getByText("Orçamentos e preços: sem acesso")).toBeVisible();
  expect(await page.content()).not.toContain("Filme institucional");
  // A ficha pelo endereço: a mesma tela de "não existe" (com o esqueleto, o status do streaming fica 200).
  await page.goto(`/app/orcamentos/${s().orc}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("não existe");
  expect(await page.content()).not.toContain("Diária de captação");
  await page.goto("/app/ajustes/precos");
  await expect(page.getByText("Orçamentos e preços: sem acesso")).toBeVisible();

  // A ficha do freela: funções e escala sim; diária, contato e dados de pagamento não.
  await page.goto(`/app/freelas/${s().freela}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rafa Lima");
  await expect(page.getByRole("heading", { name: "Valores" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Dados de pagamento" })).toHaveCount(0);
  const html = await page.content();
  expect(html).not.toContain("650,00");
  expect(html).not.toContain("5511912345678");
  expect(html).not.toContain("rafa@exemplo.com");

  // O inventário: o item sim, o valor não.
  await page.goto(`/app/inventario/${s().equip}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sony FX6");
  expect(await page.content()).not.toContain("45.000,00");

  // Ajustes: o próprio acesso, numa linha.
  await page.goto("/app/ajustes");
  await expect(page.getByText("Sem valores nem dados da equipe")).toBeVisible();
  expect(erros).toEqual([]);
});

test("a administração liga o Financeiro para o editor, ele passa a ver, e volta ao padrão", async ({ page, context, baseURL }, info) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  const celular = info.project.name === "iphone";
  await page.emulateMedia({ colorScheme: "light" });
  await como(context, baseURL!, s().admin);

  await page.goto("/app/ajustes/pessoas");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pessoas");
  const edu = page.locator(".pessoa", { hasText: "Edu Matos" });
  const gil = page.locator(".pessoa", { hasText: "Gil Prado" });
  await expect(edu.locator(".selo--acesso")).toHaveText("Sem valores");
  await expect(gil.locator(".selo--acesso")).toHaveText("5 áreas");
  await expect(page.locator(".pessoa", { hasText: "Diana Lopes" }).locator(".selo--acesso")).toHaveText("Tudo");
  // A administração não tem interruptor (vê tudo sempre); cada outra pessoa tem um por área.
  await expect(page.locator(".pessoa", { hasText: "Diana Lopes" }).getByRole("checkbox")).toHaveCount(0);
  const fin = edu.getByRole("checkbox", { name: "Financeiro" });
  await expect(fin).not.toBeChecked();
  await expect(gil.getByRole("checkbox", { name: "Financeiro" })).not.toBeChecked();
  await expect(gil.getByRole("checkbox", { name: "Orçamentos e preços" })).toBeChecked();
  await semRolagemDeLado(page);
  if (SHOTS) {
    await page.evaluate(() => document.fonts.ready);
    // A barra de baixo do celular é fixa: na captura da página inteira ela ficaria no meio; some só para a foto.
    const sem = await page.addStyleTag({ content: ".barra { visibility: hidden !important; }" });
    await page.screenshot({ path: path.join(SHOTS, `pessoas-acesso-${celular ? "iphone" : "computador"}.png`), fullPage: true });
    await sem.evaluate((el) => (el as HTMLElement).remove());
  }

  await fin.check();
  await expect(edu.getByRole("status")).toContainText("Acesso salvo.");
  await expect(fin).toBeChecked();
  await expect(edu.locator(".selo--acesso")).toHaveText("Financeiro");
  await expect(edu.getByRole("button", { name: "Voltar ao padrão da Equipe" })).toBeVisible();
  if (SHOTS) await edu.screenshot({ path: path.join(SHOTS, `pessoas-acesso-ligado-${celular ? "iphone" : "computador"}.png`) });

  // O editor agora vê o Financeiro (navegação e Hoje); Orçamentos continua fechado.
  await como(context, baseURL!, s().editor);
  const nomes = await secoes(page, celular);
  expect(nomes.some((n) => /Financeiro/.test(n))).toBe(true);
  expect(nomes.some((n) => /Orçamentos/.test(n))).toBe(false);
  await page.goto("/app/hoje");
  await expect(page.getByText("A receber na semana")).toBeVisible();
  await page.goto("/app/financeiro");
  await expect(page.getByText("Parcela 1/2")).toBeVisible();

  // De volta ao padrão.
  await como(context, baseURL!, s().admin);
  await page.goto("/app/ajustes/pessoas");
  await edu.getByRole("button", { name: "Voltar ao padrão da Equipe" }).click();
  await expect(edu.getByRole("status")).toContainText("Voltou ao padrão.");
  await expect(edu.locator(".selo--acesso")).toHaveText("Sem valores");
  await expect(fin).not.toBeChecked();
  await como(context, baseURL!, s().editor);
  await page.goto("/app/financeiro");
  await expect(page.getByText("Financeiro: sem acesso")).toBeVisible();
  expect(erros).toEqual([]);
});

test("a gestão por padrão: orçamentos e diárias sim, Financeiro não; não muda o acesso de ninguém", async ({ page, context, baseURL }, info) => {
  const celular = info.project.name === "iphone";
  await como(context, baseURL!, s().gestor);
  const nomes = await secoes(page, celular);
  expect(nomes.some((n) => /Orçamentos/.test(n))).toBe(true);
  expect(nomes.some((n) => /Financeiro/.test(n))).toBe(false);
  await page.goto(`/app/freelas/${s().freela}`);
  await expect(page.locator(".secao", { has: page.getByRole("heading", { name: "Valores" }) })).toContainText("650,00");
  await page.goto("/app/ajustes/pessoas");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});
