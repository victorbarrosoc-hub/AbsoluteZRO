/**
 * O Quadro com fluidez (pedido do titular, 29/10/2026): a folha "Novo card" cobre a janela inteira (o véu não fica preso
 * num pedaço da tela), tem o tamanho do conteúdo, prende o foco e fecha com Esc; o card nasce na coluna escolhida sem
 * recarregar a página e o aviso confirma; "Mover para…" avisa com Desfazer; a troca de seção usa View Transitions; com
 * "reduzir movimento", nada anima. No computador e no iPhone (folha de baixo).
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ARQUIVO_SESSAO = "test-results/e2e-sessao.json";

async function entrar(context: BrowserContext, baseURL: string) {
  const { token } = JSON.parse(readFileSync(ARQUIVO_SESSAO, "utf8")) as { token: string };
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
}

async function abrirNovo(page: Page) {
  await page.getByRole("button", { name: "Novo card", exact: true }).first().click();
  const folha = page.getByRole("dialog", { name: "Novo card" });
  await expect(folha).toBeVisible();
  // a entrada da folha acabou (posição final para medir)
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".m-folha")
        ?.getAnimations()
        .some((a) => a.playState === "running"),
  );
  return folha;
}

/**
 * No celular o Quadro mostra uma coluna por vez: escolhe a aba da coluna. (A página chega em partes: o card pode já
 * estar no HTML escondido antes de a tela aparecer, então a decisão é pelo aparelho, não pelo que está à vista.)
 */
async function verColuna(page: Page, col: string, projeto: string) {
  if (projeto === "computador") return;
  const aba = page.locator(`.q-abas button[data-col="${col}"]`);
  await expect(aba).toBeVisible();
  // o clique só vale depois da hidratação: tenta de novo até a aba ficar marcada
  await expect(async () => {
    await aba.click();
    await expect(aba).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  }).toPass();
}

test.describe.configure({ mode: "serial" });

test.describe("Quadro: novo card e folhas", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await entrar(context, baseURL!);
  });

  test("o véu cobre a janela inteira, a folha cabe no conteúdo, o foco fica dentro e Esc fecha", async ({ page }, info) => {
    await page.goto("/app/quadro");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Quadro");
    const folha = await abrirNovo(page);
    const veu = page.locator(".m-veu");
    // o véu é filho do <body> (portal) e ocupa a janela toda, por cima da cápsula e das margens
    expect(await veu.evaluate((el) => el.parentElement === document.body)).toBe(true);
    const vp = page.viewportSize()!;
    const caixa = (await veu.boundingBox())!;
    expect(caixa.x).toBeLessThanOrEqual(0);
    expect(caixa.y).toBeLessThanOrEqual(0);
    expect(caixa.x + caixa.width).toBeGreaterThanOrEqual(vp.width - 1);
    expect(caixa.y + caixa.height).toBeGreaterThanOrEqual(vp.height - 1);
    // o canto da janela é o véu (nada da página por cima dele)
    expect(await page.evaluate(() => document.elementFromPoint(2, 2)?.classList.contains("m-veu"))).toBe(true);
    const f = (await folha.boundingBox())!;
    if (info.project.name === "computador") {
      // no centro e do tamanho do conteúdo (nada de folha da altura da janela com branco embaixo)
      expect(f.height).toBeLessThan(vp.height - 40);
      expect(Math.abs(f.x + f.width / 2 - vp.width / 2)).toBeLessThan(4);
    } else {
      // no celular, a folha de baixo: encostada no rodapé, com a alça
      expect(f.y + f.height).toBeGreaterThanOrEqual(vp.height - 1);
      await expect(page.locator(".m-folha__alca")).toBeVisible();
    }
    // o título começa focado; o Tab dá a volta dentro da folha
    await expect(page.locator("[data-campo='tema']")).toBeFocused();
    for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest(".m-folha"))).toBe(true);
    // a página por trás não rola com a roda sobre o véu
    const y0 = await page.evaluate(() => scrollY);
    await page.mouse.move(4, vp.height / 2);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => scrollY)).toBe(y0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".m-veu")).toHaveCount(0);
  });

  test("criar um card: escolhe a coluna e o prazo, Enter cria, o card entra na coluna sem recarregar", async ({ page }, info) => {
    await page.goto("/app/quadro");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Quadro");
    await page.evaluate(() => ((window as unknown as { semRecarregar: boolean }).semRecarregar = true));
    const folha = await abrirNovo(page);
    // vazio não cria: o título avisa
    await folha.getByRole("button", { name: "Criar card" }).click();
    await expect(page.locator("[data-campo='tema']")).toHaveAttribute("aria-invalid", "true");
    const tema = `Teaser do festival ${info.project.name}`;
    await page.locator("[data-campo='tema']").fill(tema);
    await folha.getByRole("radio", { name: "Fazendo" }).click();
    await expect(folha.getByRole("radio", { name: "Fazendo" })).toHaveAttribute("aria-checked", "true");
    await folha.getByRole("button", { name: "Amanhã" }).click();
    await expect(folha.locator(".q-prazo__texto")).toHaveText("amanhã");
    await folha.getByRole("radio", { name: "Alta" }).click();
    await page.locator("[data-campo='tema']").press("Enter");
    await expect(page.locator(".m-veu")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Card criado." })).toBeVisible();
    const card = page.locator(".q-card", { hasText: tema });
    await expect(card).toHaveAttribute("data-col", "fazendo");
    await expect(card.locator(".q-chip--alta")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { semRecarregar?: boolean }).semRecarregar)).toBe(true);
    // e ficou no banco: depois de recarregar, continua na coluna
    await page.reload();
    await expect(page.locator(".q-card", { hasText: tema })).toHaveAttribute("data-col", "fazendo");
  });

  test("Mover para… avisa para onde e Desfazer volta", async ({ page }, info) => {
    await page.goto("/app/quadro");
    const tema = `Teaser do festival ${info.project.name}`;
    const card = page.locator(".q-card", { hasText: tema });
    await expect(card).toHaveAttribute("data-col", "fazendo");
    await verColuna(page, "fazendo", info.project.name);
    await card.getByRole("button", { name: "Mover para…" }).click();
    const folha = page.getByRole("dialog", { name: "Mover para" });
    await expect(folha).toBeVisible();
    await folha.getByRole("button", { name: /Revisão/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Movido para Revisão." })).toBeVisible();
    await expect(page.locator(".q-card", { hasText: tema })).toHaveAttribute("data-col", "revisao");
    await page.getByRole("status").getByRole("button", { name: "Desfazer" }).click();
    await expect(page.locator(".q-card", { hasText: tema })).toHaveAttribute("data-col", "fazendo");
  });

  test("ficha de um card: abre, mostra a coluna e fecha pelo botão com a saída", async ({ page }, info) => {
    await page.goto("/app/quadro");
    const tema = `Teaser do festival ${info.project.name}`;
    await expect(page.locator(".q-card", { hasText: tema })).toHaveAttribute("data-col", "fazendo");
    await verColuna(page, "fazendo", info.project.name);
    await page
      .locator(".q-card", { hasText: tema })
      .getByRole("button", { name: `Abrir ${tema}` })
      .click();
    const folha = page.getByRole("dialog", { name: `Card: ${tema}` });
    await expect(folha).toBeVisible();
    await expect(folha.locator(".q-ficha__coluna")).toHaveText("Fazendo");
    await expect(page).toHaveURL(/card=/);
    await folha.getByRole("button", { name: "Fechar" }).click();
    await expect(page.locator(".m-veu")).toHaveCount(0);
    await expect(page).not.toHaveURL(/card=/);
  });
});

test.describe("troca de seção", () => {
  test("a seção nova entra com View Transition; com reduzir movimento, a folha aparece parada", async ({ page, context, baseURL }, info) => {
    await entrar(context, baseURL!);
    await page.goto("/app/hoje");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as { vts: number };
      w.vts = 0;
      const o = document.startViewTransition?.bind(document) as ((a: unknown) => unknown) | undefined;
      if (o)
        (document as unknown as { startViewTransition: (a: unknown) => unknown }).startViewTransition = (a: unknown) => {
          w.vts++;
          return o(a);
        };
    });
    const destino =
      info.project.name === "computador"
        ? page.locator(".capsula__nav").getByRole("link", { name: "Financeiro" })
        : page.locator(".barra").getByRole("link", { name: /Aprovar/ });
    await destino.click();
    await page.waitForURL(info.project.name === "computador" ? "**/app/financeiro" : "**/app/aprovacoes");
    await expect(destino).toHaveAttribute("aria-current", "page");
    expect(await page.evaluate(() => (window as unknown as { vts: number }).vts)).toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app/quadro");
    await page.getByRole("button", { name: "Novo card", exact: true }).first().click();
    await expect(page.getByRole("dialog", { name: "Novo card" })).toBeVisible();
    expect(await page.locator(".m-folha").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await page.keyboard.press("Escape");
    await expect(page.locator(".m-veu")).toHaveCount(0);
  });
});
