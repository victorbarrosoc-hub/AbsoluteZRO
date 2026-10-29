/**
 * A produtora por dentro com a demonstração (plano v2 §6–§7): carregar pela tela de Ajustes, cada painel cheio e sem
 * rolagem de lado, o timbrado, o editor do orçamento com a calculadora de deslocamento manual e o aviso de conflito
 * na agenda. Usa a organização própria da demonstração (e2e/preparar.ts), no computador e no iPhone.
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ARQUIVO_SESSAO_DEMO = "test-results/e2e-sessao-demo.json";

async function entrar(context: BrowserContext, baseURL: string) {
  const { token } = JSON.parse(readFileSync(ARQUIVO_SESSAO_DEMO, "utf8")) as { token: string };
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
}

async function semRolagemDeLado(page: Page) {
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sobra, page.url()).toBeLessThanOrEqual(0);
}

test.describe.configure({ mode: "serial" });

test.describe("produtora por dentro", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await entrar(context, baseURL!);
  });

  test("carregar a demonstração pela tela de Ajustes", async ({ page }) => {
    await page.goto("/app/ajustes");
    const carregar = page.getByRole("button", { name: /(Carregar|Completar) demonstra/ });
    const pronta = page.getByText("Os dados de exemplo estão em todas as seções.");
    await expect(carregar.or(pronta).first()).toBeVisible();
    if (await carregar.count()) {
      await carregar.click();
      await page.waitForURL("**/app/quadro", { timeout: 60_000 });
    }
    await page.goto("/app/ajustes");
    await expect(page.getByText("Os dados de exemplo estão em todas as seções.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Tabela de preços/ })).toBeVisible();
  });

  test("cada painel cheio, sem erro e sem rolagem de lado", async ({ page }) => {
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(e.message));
    const paineis: [string, RegExp, string][] = [
      ["/app/orcamentos", /orçamentos\./, ".lista .item"],
      ["/app/financeiro", /financeiro\./, ".lista .item"],
      ["/app/financeiro/contas", /financeiro\./, ".grupos li"],
      ["/app/financeiro/fluxo", /financeiro\./, ".fluxo__mes"],
      ["/app/financeiro/recorrencias", /financeiro\./, ".tabela-precos li"],
      ["/app/freelas", /freelas\./, ".lista .item"],
      ["/app/inventario", /inventário\./, ".lista .item"],
      ["/app/agenda", /agenda\./, ".evento"],
      ["/app/ajustes/precos", /preços\./, ".tabela-precos li"],
      ["/app/pedidos?ver=lista", /pedidos\./, ".lista .item"],
      ["/app/pedidos", /pedidos\./, ".funil-card"],
      ["/app/financeiro/numeros", /financeiro\./, ".numeros-serie__mes"],
      ["/app/freelas?equip=sim", /freelas\./, ".lista .item"],
      ["/app/hoje", /^(Bom dia|Boa tarde|Boa noite)/, ".hoje-cartao"],
    ];
    for (const [rota, titulo, item] of paineis) {
      await page.goto(rota);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(titulo);
      expect(await page.locator(item).count(), rota).toBeGreaterThan(2);
      await semRolagemDeLado(page);
    }
    await page.goto("/app/freelas");
    expect(await page.locator(".lista .item").count()).toBeGreaterThanOrEqual(15);
    expect(erros).toEqual([]);
  });

  test("timbrado do aprovado: total, sem custo, botão de PDF", async ({ page }) => {
    await page.goto("/app/orcamentos?status=aprovado");
    await page.locator(".lista .item").first().click();
    await page.getByRole("link", { name: "Timbrado" }).click();
    const folha = page.locator("article.lh");
    await expect(folha).toBeVisible();
    await expect(folha.locator(".lh-total dd")).toHaveText(/^R\$ /);
    await expect(folha.getByText(/custo|margem/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Imprimir ou salvar PDF" })).toBeVisible();
    await semRolagemDeLado(page);
  });

  test("editor do rascunho: deslocamento digitado entra no total e salva", async ({ page }, info) => {
    test.skip(info.project.name !== "computador", "o editor completo roda no computador; o celular só lê");
    await page.goto("/app/orcamentos?status=rascunho");
    await page.locator(".lista .item").first().click();
    const total = page.locator(".totais__total dd");
    const antes = await total.innerText();
    await page.getByRole("button", { name: "Deslocamento" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Km de uma ida").fill("100");
    await dialogo.getByLabel("Consumo (km/L)").fill("10");
    await dialogo.getByLabel("Preço do litro").fill("6,00");
    await expect(dialogo.getByText("R$ 120,00")).toBeVisible();
    await dialogo.getByRole("button", { name: "Adicionar ao orçamento" }).click();
    await expect(total).not.toHaveText(antes);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Salvo." })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Descrição").last()).toHaveValue(/^Deslocamento/);
  });

  test("combustível automático: preço da semana da ANP, troca de combustível, digitado vale neste orçamento", async ({ page, request }, info) => {
    test.skip(info.project.name !== "computador", "o editor completo roda no computador; o celular só lê");
    // O agendamento semanal (com o segredo) guarda a semana da ANP de mentira (tests/anp-fixture.mts).
    expect((await request.get("/api/cron/combustivel")).status()).toBe(401);
    const r = await request.get("/api/cron/combustivel", { headers: { authorization: "Bearer segredo-do-cron-e2e" } });
    expect(r.status()).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, semana: "2026-10-18" });

    await page.goto("/app/orcamentos?status=rascunho");
    await page.locator(".lista .item").first().click();
    await page.getByRole("button", { name: "Deslocamento" }).click();
    const dialogo = page.getByRole("dialog");
    const litro = dialogo.getByLabel("Preço do litro");
    // A demonstração fica em São Paulo/SP: gasolina do município.
    await expect(dialogo.getByRole("radio", { name: "Gasolina" })).toHaveAttribute("aria-checked", "true");
    await expect(litro).toHaveValue("6,11");
    await expect(dialogo.getByText("Preço médio da semana em São Paulo/SP · ANP, semana de 18/10")).toBeVisible();
    // Etanol: SP sem a linha na planilha de mentira, vale a média do Brasil.
    await dialogo.getByRole("radio", { name: "Etanol" }).click();
    await expect(litro).toHaveValue("4,11");
    await expect(dialogo.getByText("Preço médio da semana no Brasil · ANP, semana de 18/10")).toBeVisible();
    await dialogo.getByLabel("Km de uma ida").fill("100");
    await dialogo.getByLabel("Consumo (km/L)").fill("10");
    const resumo = dialogo.locator(".resumo-desl");
    await expect(resumo.getByText("R$ 82,20")).toBeVisible();
    await expect(resumo.getByText("R$ 0,41")).toBeVisible();
    if (process.env.SHOTS_DIR) await dialogo.screenshot({ path: `${process.env.SHOTS_DIR}/maestro-combustivel-claro-computador.png` });
    // Preço digitado vale para o etanol neste orçamento, mesmo fechando e abrindo de novo; dá para voltar ao da ANP.
    await litro.fill("5,00");
    await expect(dialogo.getByText("Preço digitado.")).toBeVisible();
    await dialogo.getByRole("button", { name: "Fechar" }).click();
    await page.getByRole("button", { name: "Deslocamento" }).click();
    await expect(dialogo.getByRole("radio", { name: "Etanol" })).toHaveAttribute("aria-checked", "true");
    await expect(litro).toHaveValue("5,00");
    await dialogo.getByRole("radio", { name: "Diesel S10" }).click();
    await expect(litro).toHaveValue("7,32");
    await dialogo.getByRole("radio", { name: "Etanol" }).click();
    await expect(litro).toHaveValue("5,00");
    await dialogo.getByRole("button", { name: "Usar o da ANP (R$ 4,11)" }).click();
    await expect(litro).toHaveValue("4,11");
    await dialogo.getByLabel("Km de uma ida").fill("100");
    await dialogo.getByLabel("Consumo (km/L)").fill("10");
    await dialogo.getByRole("button", { name: "Adicionar ao orçamento" }).click();
    await expect(page.getByLabel("Detalhe").last()).toHaveValue(/20 L de etanol a R\$ 4,11\/L/);
  });

  test("marca de exemplo no timbrado e kit no perfil do freela", async ({ page }) => {
    await page.goto("/app/ajustes/marca");
    await expect(page.locator(".marca-logo__palco img")).toBeVisible();
    await page.goto("/app/freelas?equip=drone");
    await page.getByRole("link", { name: /Rafael Moura/ }).click();
    const kit = page.locator("section.secao", { has: page.getByRole("heading", { name: "Equipamento próprio" }) });
    await expect(kit.getByText("DJI Mavic 3 Classic")).toBeVisible();
    await semRolagemDeLado(page);
  });

  test("agenda mostra o conflito de escala", async ({ page }) => {
    await page.goto("/app/agenda");
    await expect(page.locator(".chip[data-conflito]").first()).toBeVisible();
  });
});
