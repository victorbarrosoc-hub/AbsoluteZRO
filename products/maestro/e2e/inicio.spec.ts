/**
 * Página inicial pública (plano v2 §10): a frase, sem Beta, o produto real, as ferramentas em abas (clique e teclado),
 * os detalhes de mexer com as regras do app; a navegação em grupos (§3) e o motion sob "reduzir movimento" (§9).
 * Roda no computador e no iPhone (projetos do playwright.config.ts).
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";
import { CRIAR_CONTA_ZRO, ENTRAR_ZRO, MAESTRO_LANCADO } from "../src/lib/site";

const ARQUIVO_SESSAO = "test-results/e2e-sessao.json";

async function entrar(context: BrowserContext, baseURL: string) {
  const { token } = JSON.parse(readFileSync(ARQUIVO_SESSAO, "utf8")) as { token: string };
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
}

test.describe("página inicial", () => {
  test("mostra a frase, sem selo de Beta, o produto real e as duas portas", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Maestro · A produtora inteira num lugar só.");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/A produtora\s+inteira\s+num lugar só\./);
    // No ar (titular, 30/10/2026): nada de Beta nem de "grátis", na página e na descrição.
    const texto = await page.locator("body").innerText();
    expect(texto).not.toMatch(/\bbeta\b/i);
    expect(texto).not.toMatch(/grátis/i);
    expect(await page.locator('meta[name="description"]').getAttribute("content")).not.toMatch(/beta/i);
    expect(await page.locator('meta[property="og:description"]').getAttribute("content")).not.toMatch(/beta/i);
    // Só o que está no ar no ecossistema: nada de AEON, Revela ou NOSSOM; a Z não é protagonista.
    expect(texto).not.toMatch(/\b(AEON|Revela|NOSSOM)\b/i);
    if (MAESTRO_LANCADO) {
      // Lançado: "Criar conta" e "Entrar com Absolute ZRO" direto no login único; nada de lista de espera.
      await expect(page.locator(".ihero .selo")).toHaveCount(0);
      await expect(page.getByText("Em teste fechado")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Criar conta" }).first()).toHaveAttribute("href", CRIAR_CONTA_ZRO);
      await expect(page.getByRole("link", { name: "Entrar com Absolute ZRO" }).first()).toHaveAttribute("href", ENTRAR_ZRO);
      await expect(page.getByRole("form", { name: "Quero acesso ao Maestro" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Quero acesso" })).toHaveCount(0);
      await expect(page.locator(".instalar--pagina")).toContainText("Adicionar à Tela de Início");
      // sem instalador publicado (no e2e o catálogo está desligado), nenhuma área de download e o app "Em breve"
      await expect(page.locator(".idesktop")).toHaveCount(0);
      await expect(page.locator(".ivem li", { hasText: "App de computador" }).getByText("Em breve")).toBeVisible();
    } else {
      await expect(page.getByText("Em teste fechado")).toBeVisible();
      // Entrar leva ao login Absolute ZRO; "Quero acesso" leva ao formulário da lista de espera.
      await expect(page.getByRole("link", { name: "Entrar com Absolute ZRO" }).first()).toHaveAttribute("href", "/entrar");
      await expect(page.getByRole("link", { name: "Quero acesso" })).toHaveAttribute("href", "#acesso");
      await expect(page.locator(".instalar")).toHaveCount(0);
    }
    // As capturas reais carregam (claro por padrão): o Quadro no MacBook e o Hoje no iPhone.
    const fotos = page.locator(".ihero__aparelhos img.tela--claro");
    await expect(fotos).toHaveCount(2);
    for (const img of await fotos.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    }
    // A foto de set (Higgsfield, só contexto) e os números do produto.
    await expect(page.locator(".ifoto img")).toHaveAttribute("alt", /equipe/);
    await expect(page.locator(".inumeros dd")).toHaveText(["8", "1", "4", "6"]);
    // O que já existe e o que vem: Domínio próprio segue "Em breve".
    await expect(page.locator(".ivem li", { hasText: "Domínio próprio" }).getByText("Em breve")).toBeVisible();
    await expect(page.locator(".ijunto li")).toHaveText([/Set/, /Drive.*SOBEDESCE/, /Google Agenda/, /TPeasy/]);
    await expect(page.locator('a[href="mailto:contato@absolutezro.com"]')).toBeVisible();
    // Sem rolagem de lado.
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sobra).toBeLessThanOrEqual(0);
  });

  test("as ferramentas numa aba cada: clique, teclado e a tela de verdade", async ({ page }, info) => {
    await page.goto("/");
    const lista = page.getByRole("tablist", { name: "Ferramentas do Maestro" });
    await lista.scrollIntoViewIfNeeded();
    const abas = lista.getByRole("tab");
    await expect(abas).toHaveText(["Quadro", "Aprovação", "Orçamento", "Equipe", "Financeiro", "Criação"]);
    await expect(abas.first()).toHaveAttribute("aria-selected", "true");
    const visivel = page.locator(".itour [role=tabpanel]:not([hidden])");
    await expect(visivel).toHaveCount(1);
    await expect(visivel.getByRole("heading", { level: 3 })).toHaveText("A pauta em oito colunas.");
    // as 8 colunas do método no painel do Quadro
    await expect(visivel.locator(".metodo li")).toHaveCount(8);

    await lista.getByRole("tab", { name: "Aprovação", exact: true }).click();
    await expect(lista.getByRole("tab", { name: "Aprovação", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(visivel.getByRole("heading", { level: 3 })).toHaveText("O cliente aprova pelo link.");
    // no celular o iPhone manda (o MacBook some); no computador, os dois
    const celular = info.project.name !== "computador";
    const img = visivel.locator(celular ? ".iphone img.tela--claro" : ".mac img.tela--claro");
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await expect(visivel.locator(".mac")).toBeVisible({ visible: !celular });

    // teclado: setas andam e escolhem, End vai para a última, Home volta
    await lista.getByRole("tab", { name: "Aprovação", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(lista.getByRole("tab", { name: "Orçamento", exact: true })).toBeFocused();
    await expect(visivel.getByRole("heading", { level: 3 })).toHaveText("Orçamento com contrato.");
    await page.keyboard.press("End");
    await expect(lista.getByRole("tab", { name: "Criação", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(visivel.getByRole("heading", { level: 3 })).toHaveText("Do roteiro ao set.");
    await page.keyboard.press("ArrowRight");
    await expect(lista.getByRole("tab", { name: "Quadro", exact: true })).toHaveAttribute("aria-selected", "true");
    // só a aba escolhida entra no Tab
    await expect(lista.locator('[role=tab][tabindex="0"]')).toHaveCount(1);
  });

  test("os detalhes de mexer: vistas do roteiro, viagem e quem vê o quê", async ({ page }) => {
    await page.goto("/");
    // Um roteiro, quatro vistas: cada aba mostra a captura daquela vista.
    const vistas = page.getByRole("tablist", { name: "Vistas do roteiro" });
    await vistas.scrollIntoViewIfNeeded();
    await vistas.getByRole("tab", { name: "Técnico", exact: true }).click();
    const recorte = page.locator(".iabas--vistas [role=tabpanel]:not([hidden]) img.tela--claro");
    await expect(recorte).toHaveAttribute("src", /roteiro-tecnico-mac-claro/);
    await expect.poll(() => recorte.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

    // Viagem: os veículos de partida do app (km/L de estrada) e os litros; nada de preço na vitrine.
    const viagem = page.locator(".dviagem");
    await viagem.scrollIntoViewIfNeeded();
    await expect(viagem.getByRole("button", { name: "SUV compacto", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(viagem.locator("dd").last()).toHaveText("16,7 L");
    await viagem.getByRole("button", { name: "Van", exact: true }).click();
    await expect(viagem.getByRole("button", { name: "Van", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(viagem.locator("dt").last()).toHaveText("Diesel S10");
    await expect(viagem.locator("dd").last()).toHaveText("22,2 L");
    await viagem.getByRole("button", { name: "Compacto", exact: true }).click();
    await expect(viagem.locator("dd").nth(1)).toHaveText("14 km/L");
    await expect(viagem.locator("dd").last()).toHaveText("14,3 L");
    expect(await viagem.innerText()).not.toMatch(/R\$/);

    // Quem vê o quê: o padrão de cada papel (src/lib/acessos.ts).
    const acessos = page.locator(".dacessos");
    await acessos.scrollIntoViewIfNeeded();
    const ligadas = acessos.locator("li[data-ligada]");
    await expect(ligadas).toHaveCount(5);
    await expect(acessos.locator("li", { hasText: "Financeiro" })).not.toHaveAttribute("data-ligada");
    await acessos.getByRole("button", { name: "Equipe", exact: true }).click();
    await expect(acessos.getByRole("button", { name: "Equipe", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(ligadas).toHaveCount(0);
    await acessos.getByRole("button", { name: "Administração", exact: true }).click();
    await expect(ligadas).toHaveCount(6);
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
    test.skip(MAESTRO_LANCADO, "lançado: a lista de espera fica guardada, sem aparecer");
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
    for (const sel of [".ihero__simbolo", ".ihero__palavra", ".ihero__aparelhos", ".revela", ".iabas__painel"]) {
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
  test("Hoje primeiro, a Z discreta no fim, grupos só com o que existe e a aba ativa marcada", async ({ page, context, baseURL }, info) => {
    await entrar(context, baseURL!);
    await page.goto("/app/clientes");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("clientes.");
    const nav = page.getByRole("navigation", { name: "Seções do Maestro" }).filter({ visible: true });
    await expect(nav).toHaveCount(1);
    // o primeiro é o Hoje (no computador, dentro do menu Produção; no celular, a primeira aba da barra)
    await expect(nav.locator("a").first()).toHaveAttribute("href", "/app/hoje");
    // Os menus da cápsula guardam as seções fechadas: a ordem vale para todos os links, abertos ou não.
    const hrefs = await nav.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    if (info.project.name === "computador") {
      // A cápsula mostra a seção atual no menu do grupo dela.
      const comercial = nav.getByRole("button", { name: /Comercial: Clientes/ });
      await expect(comercial).toHaveAttribute("aria-current", "true");
      await comercial.click();
      await expect(nav.getByRole("group", { name: "Comercial" })).toBeVisible();
      await expect(nav.getByRole("link", { name: /Clientes/ })).toHaveAttribute("aria-current", "page");
      await page.keyboard.press("Escape");
      await expect(nav.getByRole("group", { name: "Comercial" })).toBeHidden();
      expect(hrefs).toEqual([
        "/app/hoje",
        "/app/quadro",
        "/app/aprovacoes",
        "/app/projetos",
        "/app/criacao",
        "/app/arquivos",
        "/app/agenda",
        "/app/pedidos",
        "/app/orcamentos",
        "/app/clientes",
        "/app/freelas",
        "/app/inventario",
        "/app/financeiro",
        "/app/ajustes",
        "/app/z",
      ]);
      for (const g of ["Produção", "Operação"]) {
        await nav.getByRole("button", { name: g }).click();
        await expect(nav.getByRole("group", { name: g })).toBeVisible();
      }
      // Um grupo de uma seção só (Dinheiro) é link direto; ir a outra seção fecha o menu.
      await nav.getByRole("link", { name: "Financeiro" }).click();
      await page.waitForURL("**/app/financeiro");
      await expect(nav.getByRole("group", { name: "Operação" })).toBeHidden();
    } else {
      // Celular: o dia a dia na barra; Clientes está em "Mais", que fica marcado.
      expect(hrefs).toEqual(["/app/hoje", "/app/quadro", "/app/aprovacoes", "/app/mais"]);
      // a Z fica discreta no topo e em "Mais"
      await expect(page.locator(".topo .topo__z")).toHaveAttribute("href", "/app/z");
      await expect(nav.getByRole("link", { name: /Mais/ })).toHaveAttribute("aria-current", "page");
      await nav.getByRole("link", { name: /Mais/ }).click();
      await expect(page.getByRole("link", { name: "Financeiro" })).toBeVisible();
    }
  });
});
