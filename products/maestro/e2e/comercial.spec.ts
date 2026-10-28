/**
 * O ciclo comercial inteiro (fases 11, 14 e 19): a marca, o link de pedido, o cliente pede pelo formulário público
 * (/p), a equipe vê em Pedidos e gera o orçamento pelo motor, manda o link (/o), o cliente aceita e nasce o projeto
 * com as parcelas; o Hoje conta. No computador e no iPhone, sem rolagem de lado. Organização própria (e2e/preparar.ts).
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ARQUIVO = "test-results/e2e-sessao-comercial.json";

async function entrar(context: BrowserContext, baseURL: string) {
  const { token } = JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string };
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
}

async function semRolagemDeLado(page: Page) {
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sobra, page.url()).toBeLessThanOrEqual(0);
}

test.describe.configure({ mode: "serial" });

test("pedido público → Pedidos → gerar orçamento → link → aceite → projeto", async ({ page, context, baseURL, browser }, info) => {
  test.setTimeout(120_000);
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await entrar(context, baseURL!);
  const empresa = `Café Aurora ${info.project.name}`;

  // Marca: a página abre com a prévia do timbrado.
  await page.goto("/app/ajustes/marca");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/marca\./);
  await expect(page.getByLabel("Código da cor")).toHaveValue("#0f7b5f");
  await semRolagemDeLado(page);

  // O link de pedido (cria se ainda não há).
  await page.goto("/app/ajustes/pedido");
  const criar = page.getByRole("button", { name: "Criar link" });
  if (await criar.isVisible()) await criar.click();
  const campo = page.getByLabel("Endereço do link");
  await expect(campo).toHaveValue(/\/p\/[A-Za-z0-9_-]{43}$/);
  const linkPedido = await campo.inputValue();
  await semRolagemDeLado(page);

  // O cliente, sem conta, num navegador limpo.
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use;
  const visitante = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL });
  const cli = await visitante.newPage();
  await cli.goto(linkPedido);
  const aberto = Date.now();
  await expect(cli.getByRole("heading", { level: 1 })).toHaveText("O que você precisa?");
  await expect(cli.getByText("Lumen Filmes")).toBeVisible();
  await semRolagemDeLado(cli);
  await cli.getByRole("radio", { name: /^Filme institucional/ }).click();
  await expect(cli.getByRole("heading", { level: 1 })).toHaveText("Quanto de cada coisa?");
  await cli.getByRole("button", { name: "Casamento" }).click();
  for (let i = 0; i < 3; i++) await cli.getByRole("button", { name: "Mais vídeos" }).click();
  for (let i = 0; i < 2; i++) await cli.getByRole("button", { name: "Mais diárias" }).click();
  await cli.getByRole("button", { name: /Continuar/ }).click();
  await expect(cli.getByRole("heading", { level: 1 })).toHaveText("Quando e onde?");
  await cli.getByLabel("Cidade ou local").fill("Belo Horizonte, MG");
  await cli.getByRole("button", { name: /Continuar/ }).click();
  await cli.getByRole("radio", { name: "R$ 15 a 40 mil" }).click();
  await expect(cli.getByRole("heading", { level: 1 })).toHaveText("Conte a ideia.");
  await cli.getByRole("textbox").fill("Filme do casamento na fazenda, com teaser.");
  await cli.getByRole("button", { name: /Continuar/ }).click();
  await cli.getByLabel("Seu nome").fill("Carla Souza");
  await cli.getByLabel("Empresa (opcional)").fill(empresa);
  await cli.getByLabel("E-mail").fill("carla@exemplo.com");
  await cli.getByRole("checkbox").check();
  await semRolagemDeLado(cli);
  const espera = 3_300 - (Date.now() - aberto);
  if (espera > 0) await cli.waitForTimeout(espera);
  await cli.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(cli.getByRole("heading", { level: 1 })).toHaveText("Recebido.");
  await expect(cli.getByText(/Protocolo [A-Z0-9]{8}/)).toBeVisible();

  // A equipe: o pedido chega e vira orçamento.
  await page.goto("/app/pedidos");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/pedidos\./);
  await page.getByRole("link", { name: new RegExp(empresa) }).click();
  await expect(page.getByText("Belo Horizonte, MG")).toBeVisible();
  await semRolagemDeLado(page);
  await page.getByRole("button", { name: "Gerar orçamento" }).click();
  await page.waitForURL(/\/app\/orcamentos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Filme institucional · ${empresa}`);
  // Motor: 2 diárias e 3 vídeos com casamento ×1,3.
  await expect(page.locator(".totais__total dd")).toHaveText(/R\$\s?8\.190,00/);

  // O link do orçamento com 2 parcelas.
  const painel = page.getByRole("region", { name: "Link para o cliente" });
  await painel.getByRole("radio", { name: "2x" }).click();
  await painel.getByRole("button", { name: "Enviar link" }).click();
  const campoO = painel.getByLabel("Endereço do link");
  await expect(campoO).toHaveValue(/\/o\/[A-Za-z0-9_-]{43}$/);
  const linkOrc = await campoO.inputValue();
  const orcamentoUrl = page.url();

  // O cliente aceita.
  await cli.goto(linkOrc);
  await expect(cli.getByRole("heading", { level: 1 })).toHaveText(`Filme institucional · ${empresa}`);
  await expect(cli.locator(".oc-total")).toHaveText(/8\.190,00/);
  await expect(cli.locator("article.lh").getByText(/custo|margem/i)).toHaveCount(0);
  await expect(cli.locator(".oc-parcelas li")).toHaveCount(2);
  await semRolagemDeLado(cli);
  await cli.getByRole("radio", { name: "Aceitar" }).click();
  await cli.getByLabel("Seu nome").fill("Carla Souza");
  await cli.getByRole("checkbox").check();
  await cli.getByRole("button", { name: "Confirmar aceite" }).click();
  await expect(cli.getByRole("heading", { name: "Aceito." })).toBeVisible();
  await cli.reload();
  await expect(cli.getByText(/Carla Souza, /)).toBeVisible();
  await visitante.close();

  // De volta à equipe: aprovado, com projeto e parcelas.
  await page.goto(orcamentoUrl);
  await expect(page.getByText(/Aceito pelo cliente: Carla Souza/)).toBeVisible();
  const projeto = page.locator("header.perfil").getByRole("link", { name: /^MAE-\d{4}-\d{3}$/ });
  await expect(projeto).toBeVisible();
  await projeto.click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Filme institucional · ${empresa}`);

  // Hoje conta o que está em aberto, sem rolagem de lado.
  await page.goto("/app/hoje");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/hoje\./);
  await expect(page.getByRole("link", { name: /Pedidos novos/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /A receber na semana/ })).toBeVisible();
  await semRolagemDeLado(page);
  expect(erros).toEqual([]);
});

test("link de pedido revogado: a mesma tela neutra", async ({ page }) => {
  await page.goto(`/p/${"x".repeat(43)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Este link não está mais ativo.");
  await page.goto(`/o/${"y".repeat(43)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Este link não está mais ativo.");
});
