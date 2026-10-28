/**
 * Página inicial pública (plano v2 §10), a navegação em grupos (§3) e o motion sob "reduzir movimento" (§9).
 * Roda no computador e no iPhone (projetos do playwright.config.ts).
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";

const ARQUIVO_SESSAO = "test-results/e2e-sessao.json";

async function entrar(context: BrowserContext, baseURL: string) {
  const { token } = JSON.parse(readFileSync(ARQUIVO_SESSAO, "utf8")) as { token: string };
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
}

test.describe("página inicial", () => {
  test("mostra a frase, o selo de teste fechado, o produto real e as duas portas", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Maestro · A produtora inteira num lugar só.");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/A produtora\s+inteira\s+num lugar só\./);
    await expect(page.getByText("Em teste fechado")).toBeVisible();
    // Entrar leva ao login Absolute ZRO; "Quero acesso" leva ao formulário da lista de espera.
    await expect(page.getByRole("link", { name: "Entrar com Absolute ZRO" }).first()).toHaveAttribute("href", "/entrar");
    await expect(page.getByRole("link", { name: "Quero acesso" })).toHaveAttribute("href", "#acesso");
    // As capturas reais carregam (claro por padrão).
    const fotos = page.locator(".ihero__aparelhos img.tela--claro");
    await expect(fotos).toHaveCount(2);
    for (const img of await fotos.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    }
    // Só o que existe: aprovação e a produtora por dentro já funcionam; "Hoje" segue "Em breve".
    await expect(page.locator(".ija h3", { hasText: "Aprovação do cliente" })).toBeVisible();
    await expect(page.locator(".ivem li", { hasText: "Aprovação do cliente" })).toHaveCount(0);
    await expect(page.locator(".iproduto li", { hasText: "Orçamentos" })).toBeVisible();
    await expect(page.locator(".ivem li", { hasText: "Orçamentos" })).toHaveCount(0);
    await expect(page.locator(".ivem li", { hasText: "Hoje" }).getByText("Em breve")).toBeVisible();
    await expect(page.locator('a[href="mailto:contato@absolutezro.com"]')).toBeVisible();
    // Sem rolagem de lado.
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sobra).toBeLessThanOrEqual(0);
  });

  test("metadados: OG, ícone, robots e sitemap", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^index, follow/);
    expect((await request.get("/robots.txt")).status()).toBe(200);
    expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /app");
    expect(await (await request.get("/sitemap.xml")).text()).toContain("<loc>");
  });

  test("Quero acesso: pede consentimento e guarda o e-mail", async ({ page }, info) => {
    await page.goto("/#acesso");
    const form = page.getByRole("form", { name: "Quero acesso ao Maestro" });
    await form.getByLabel("E-mail").fill(`e2e-${info.project.name}@exemplo.com`);
    await form.getByRole("button", { name: "Quero acesso" }).click();
    await expect(form.getByText("Marque para a gente poder escrever para você.")).toBeVisible();
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: "Quero acesso" }).click();
    await expect(page.getByRole("status")).toContainText("Você está na lista.");
  });

  test("quem já entra vê Abrir o Maestro", async ({ page, context, baseURL }) => {
    await entrar(context, baseURL!);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Abrir o Maestro" }).first()).toHaveAttribute("href", "/app");
    await expect(page.getByRole("form", { name: "Quero acesso ao Maestro" })).toHaveCount(0);
  });
});

test.describe("motion", () => {
  test("com movimento: o símbolo desenha a pauta", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    expect(await page.locator(".ihero__simbolo").evaluate((el) => getComputedStyle(el).animationName)).toBe("i-desenha");
  });

  test("reduzir movimento: nada anima, tudo aparece pronto", async ({ page, context, baseURL }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    for (const sel of [".ihero__simbolo", ".ihero__palavra", ".ihero__aparelhos", ".revela"]) {
      expect(
        await page
          .locator(sel)
          .first()
          .evaluate((el) => getComputedStyle(el).animationName),
        sel,
      ).toBe("none");
    }
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await entrar(context, baseURL!);
    await page.goto("/app/clientes");
    expect(
      await page
        .locator(".conteudo > *")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
  });
});

test.describe("navegação do app", () => {
  test("Z primeiro, grupos só com o que existe e a aba ativa marcada", async ({ page, context, baseURL }, info) => {
    await entrar(context, baseURL!);
    await page.goto("/app/clientes");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("clientes.");
    const nav = page.getByRole("navigation", { name: "Seções do Maestro" }).filter({ visible: true });
    await expect(nav).toHaveCount(1);
    const links = nav.getByRole("link");
    await expect(links.first()).toHaveAttribute("href", "/app/z");
    const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    if (info.project.name === "computador") {
      await expect(nav.getByRole("link", { name: /Clientes/ })).toHaveAttribute("aria-current", "page");
      expect(hrefs).toEqual([
        "/app/z",
        "/app/hoje",
        "/app/quadro",
        "/app/aprovacoes",
        "/app/projetos",
        "/app/agenda",
        "/app/pedidos",
        "/app/orcamentos",
        "/app/clientes",
        "/app/freelas",
        "/app/inventario",
        "/app/financeiro",
        "/app/ajustes",
      ]);
      for (const g of ["Produção", "Comercial", "Operação", "Dinheiro"]) await expect(nav.getByRole("group", { name: g })).toBeVisible();
    } else {
      // Celular: o dia a dia na barra; Clientes está em "Mais", que fica marcado.
      expect(hrefs).toEqual(["/app/z", "/app/hoje", "/app/quadro", "/app/aprovacoes", "/app/mais"]);
      await expect(nav.getByRole("link", { name: /Mais/ })).toHaveAttribute("aria-current", "page");
      await nav.getByRole("link", { name: /Mais/ }).click();
      await expect(page.getByRole("link", { name: "Financeiro" })).toBeVisible();
    }
  });
});
