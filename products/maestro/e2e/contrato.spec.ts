/**
 * Contrato junto com o orçamento e "Maestro com a sua marca" (decisões do titular, 29/10/2026), numa organização própria
 * com a demonstração e o sinal maestro.marca_propria (e2e/preparar.ts): Ajustes → Contrato salva uma versão; o
 * orçamento liga "Enviar contrato junto" e manda o link; o cliente lê o contrato, informa CPF e endereço e aceita; a
 * equipe vê o contrato com o hash conferido, no orçamento e no projeto. O app inteiro com a marca da produtora e o
 * cliente sem a marca do Maestro; sem o sinal (outra organização), o cartão do adicional. Com SHOTS_DIR, guarda as
 * capturas ct-* e wl-* (claro, escuro e iPhone).
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const SHOTS = process.env.SHOTS_DIR;
const sessao = () => JSON.parse(readFileSync("test-results/e2e-sessao-contrato.json", "utf8")) as { token: string; rascunho: string | null };
const comercial = () => JSON.parse(readFileSync("test-results/e2e-sessao-comercial.json", "utf8")) as { token: string };

async function entrar(context: BrowserContext, baseURL: string, token: string, tema = "light") {
  await context.clearCookies();
  await context.addCookies([
    { name: "mae_sessao", value: token, url: baseURL },
    { name: "zro_theme", value: tema, url: baseURL },
  ]);
}

async function semRolagemDeLado(page: Page) {
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sobra, page.url()).toBeLessThanOrEqual(0);
}

async function foto(page: Page, nome: string, projeto: string, inteira = false) {
  if (!SHOTS) return;
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${nome}-${projeto === "iphone" ? "iphone" : "claro"}.png`, fullPage: inteira });
}

async function fotoEscura(page: Page, context: BrowserContext, baseURL: string, nome: string, projeto: string) {
  if (!SHOTS || projeto !== "computador") return;
  await context.addCookies([{ name: "zro_theme", value: "dark", url: baseURL }]);
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${nome}-escuro.png` });
  await context.addCookies([{ name: "zro_theme", value: "light", url: baseURL }]);
}

test.describe.configure({ mode: "serial" });

test("contrato: modelo → enviar junto → o cliente aceita com CPF → a equipe vê o registro", async ({ page, context, baseURL, browser }, info) => {
  test.setTimeout(150_000);
  const { token, rascunho } = sessao();
  expect(rascunho, "a demonstração tem um orçamento em rascunho").toBeTruthy();
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await entrar(context, baseURL!, token);
  const projeto = info.project.name;

  // Ajustes → Contrato: o aviso, os chips, os números e a prévia ao vivo; salvar vira versão.
  await page.goto("/app/ajustes/contrato");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/contrato\./);
  await expect(page.getByRole("note")).toHaveText(/Modelo base; revise com um advogado antes de usar\./);
  const previa = page.locator(".ct-editor__previa .ct-folha");
  await expect(previa).toContainText("Contrato de prestação de serviços audiovisuais");
  await page.locator(".ct-numeros > summary").click();
  const rodadas = page.getByLabel("Rodadas de revisão incluídas");
  if (projeto === "computador") {
    await rodadas.fill("3");
    await expect(previa).toContainText("Estão incluídas 3 rodadas");
    await page.getByRole("button", { name: "Salvar versão" }).click();
    await expect(page.locator(".aviso-ok").first()).toContainText(/Salvo como versão \d+\./);
  } else {
    await expect(rodadas).toHaveValue("3");
  }
  await semRolagemDeLado(page);
  await foto(page, "ct-ajustes", projeto);
  await fotoEscura(page, context, baseURL!, "ct-ajustes", projeto);

  // O orçamento: "Enviar contrato junto" e o link com 2 parcelas.
  await page.goto(`/app/orcamentos/${rascunho}`);
  const ficha = page.getByRole("region", { name: "Contrato", exact: true });
  if (projeto === "computador") {
    await ficha.getByRole("button", { name: "Enviar contrato junto" }).click();
    await expect(ficha).toContainText("Vai junto com o link");
  } else {
    // No iPhone o orçamento já foi aceito no computador: segue para conferir as telas.
    await expect(ficha.getByRole("link", { name: "Ver contrato" })).toBeVisible();
  }
  await semRolagemDeLado(page);
  if (projeto !== "computador") return;

  const painel = page.getByRole("region", { name: "Link para o cliente" });
  await painel.getByRole("radio", { name: "2x" }).click();
  await painel.getByRole("button", { name: "Enviar link" }).click();
  const campo = painel.getByLabel("Endereço do link");
  await expect(campo).toHaveValue(/\/o\/[A-Za-z0-9_-]{43}$/);
  const linkOrc = await campo.inputValue();
  const orcamentoUrl = page.url();
  await foto(page, "ct-orcamento", projeto);

  // O cliente, sem conta: lê o contrato, informa os dados e aceita.
  for (const aparelho of ["iphone", "computador"] as const) {
    const dev = aparelho === "iphone" ? { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {};
    const visitante = await browser.newContext({ ...dev, baseURL });
    const cli = await visitante.newPage();
    await cli.goto(linkOrc);
    const contrato = cli.getByRole("region", { name: "Contrato", exact: true });
    await expect(contrato.getByRole("heading", { name: "Contrato", exact: true })).toBeVisible();
    await expect(contrato).toContainText("Estão incluídas 3 rodadas");
    await expect(contrato).toContainText("Produtora Exemplo");
    await expect(cli.locator(".cl-rodape")).toHaveText(/Powered by Absolute ZRO/);
    await expect(cli.locator(".cl-rodape")).not.toContainText("Maestro");
    await semRolagemDeLado(cli);
    await cli.getByRole("radio", { name: "Aceitar" }).click();
    await cli.getByLabel("Seu nome").fill("Carla Souza");
    await cli.getByLabel("CPF ou CNPJ").fill("529.982.247-25");
    await cli.getByLabel("Endereço completo").fill("Av. Paulista, 1000, São Paulo/SP");
    await expect(contrato).toContainText("529.982.247-25");
    await cli.getByRole("checkbox", { name: /Li e aceito o contrato e a proposta/ }).check();
    await semRolagemDeLado(cli);
    await foto(cli, "ct-cliente-form", aparelho);
    if (aparelho === "iphone") {
      await visitante.close();
      continue;
    }
    await cli.getByRole("button", { name: "Confirmar aceite" }).click();
    await expect(cli.getByRole("heading", { name: "Aceito." })).toBeVisible();
    await cli.reload();
    const aceito = cli.getByRole("region", { name: "Contrato aceito" });
    await expect(aceito).toContainText("Carla Souza");
    await expect(aceito.locator(".ct-registro__hash")).toHaveText(/^[0-9a-f]{64}$/);
    await expect(aceito).toContainText("Não é assinatura com certificado ICP-Brasil");
    await foto(cli, "ct-cliente-aceito", aparelho, true);
    await visitante.close();
  }

  // De volta à equipe: "Ver contrato", o registro com o hash conferido e o link no projeto.
  await page.goto(orcamentoUrl);
  await expect(ficha).toContainText("Aceito por Carla Souza");
  await ficha.getByRole("link", { name: "Ver contrato" }).click();
  await page.waitForURL(/\/app\/contratos\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Aceito · conferido")).toBeVisible();
  await expect(page.locator(".ct-registro")).toContainText("529.982.247-25");
  await expect(page.locator(".ct-registro")).toContainText("Texto conferido");
  const contratoUrl = page.url();
  await semRolagemDeLado(page);
  await foto(page, "ct-equipe", projeto);
  await fotoEscura(page, context, baseURL!, "ct-equipe", projeto);
  await page
    .locator(".timbrado-barra")
    .getByRole("link", { name: /^(MAE|DEMO)-\d{4}-\d{3}$/ })
    .click();
  await expect(page.getByRole("link", { name: /^Contrato · / })).toBeVisible();
  expect(contratoUrl).toContain("/app/contratos/");
  expect(erros).toEqual([]);
});

test("contrato no iPhone: a ficha e o registro sem rolagem de lado", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "iphone", "só no iPhone");
  await entrar(context, baseURL!, sessao().token);
  await page.goto(`/app/orcamentos/${sessao().rascunho}`);
  await page.getByRole("region", { name: "Contrato", exact: true }).getByRole("link", { name: "Ver contrato" }).click();
  await expect(page.getByText("Aceito · conferido")).toBeVisible();
  await semRolagemDeLado(page);
  await foto(page, "ct-equipe", "iphone");
  await page.goto("/app/ajustes/contrato");
  await semRolagemDeLado(page);
  await foto(page, "ct-ajustes", "iphone");
});

test("marca própria: o app com o logo e a cor da produtora; sem o sinal, o cartão do adicional", async ({ page, context, baseURL }, info) => {
  const projeto = info.project.name;
  await entrar(context, baseURL!, sessao().token);
  await page.goto("/app/hoje");
  const marca = projeto === "iphone" ? page.locator(".topo__marca") : page.locator(".capsula__marca");
  await expect(marca.locator("img.marca-propria__logo")).toBeVisible();
  await expect(marca).toHaveAttribute("aria-label", "Produtora Exemplo, início");
  await expect(page).toHaveTitle(/· Produtora Exemplo · Maestro$/);
  const acento = await page.locator(".shell").evaluate((el) => getComputedStyle(el).getPropertyValue("--acento").trim());
  expect(acento).toBe("#0f7b5f");
  await expect(page.locator(".powered")).toHaveText(/Powered by Absolute ZRO/);
  await semRolagemDeLado(page);
  await foto(page, "wl-hoje", projeto);
  await fotoEscura(page, context, baseURL!, "wl-hoje", projeto);
  if (projeto === "computador") {
    await entrar(context, baseURL!, sessao().token, "dark");
    await page.goto("/app/hoje");
    const escuro = await page.locator(".shell").evaluate((el) => getComputedStyle(el).getPropertyValue("--acento").trim());
    // o verde da demonstração já passa 3:1 no fundo escuro (src/lib/marca/cor.ts): segue a mesma cor
    expect(escuro).toMatch(/^#[0-9a-f]{6}$/);
    await entrar(context, baseURL!, sessao().token);
  }
  await page.goto("/app/ajustes/marca");
  await expect(page.getByRole("region", { name: "Maestro com a sua marca" })).toContainText("Ligado");
  await page.goto("/app/quadro");
  await semRolagemDeLado(page);
  await foto(page, "wl-quadro", projeto);

  // Sem o sinal: a marca do Maestro e o cartão "Disponível no Pro ou como adicional" com o link para os planos.
  await entrar(context, baseURL!, comercial().token);
  await page.goto("/app/ajustes/marca");
  const cartao = page.getByRole("region", { name: "Maestro com a sua marca" });
  await expect(cartao).toContainText("Disponível no Pro ou como adicional");
  await expect(cartao.getByRole("link", { name: "Ver planos" })).toHaveAttribute("href", /\/planos$/);
  await expect((projeto === "iphone" ? page.locator(".topo__marca") : page.locator(".capsula__marca")).locator("img")).toHaveCount(0);
  await expect(page.locator(".powered")).toHaveCount(0);
  await semRolagemDeLado(page);
  await foto(page, "wl-sem-adicional", projeto);
});
