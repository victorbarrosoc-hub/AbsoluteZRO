/**
 * Achar o job no Quadro (titular, 30/10/2026: "o card que estiver com o link precisa ser de fácil entendimento... uma
 * miniatura também da mídia do card... não consigo localizar o job que quero achar"). Com a demonstração inteira
 * (organização própria, e2e/preparar.ts): o selo do link (peça, enviado, decisão do cliente), a miniatura da peça, a
 * capa enviada pela ficha (aparece no card sem recarregar, sai com "Tirar"), a busca por cliente com realce, contagem e
 * o "nada encontrado", o próximo passo só no gesto no computador (à vista no toque) e a leitura sem "Adicionar capa".
 * Computador e iPhone. `SHOTS_DIR` guarda `depois-*`.
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";

const ARQUIVO = "test-results/e2e-sessao-achar.json";
const SHOTS = process.env.SHOTS_DIR;
const sessao = () => JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string; leitura: string; org: string };

async function entrar(context: BrowserContext, baseURL: string, token: string, tema: "claro" | "escuro" = "claro") {
  await context.addCookies([
    { name: "mae_sessao", value: token, url: baseURL },
    { name: "zro_theme", value: tema === "escuro" ? "dark" : "light", url: baseURL },
  ]);
}

async function verColuna(page: Page, col: string, projeto: string) {
  if (projeto === "computador") return;
  const aba = page.locator(`.q-abas button[data-col="${col}"]`);
  await expect(aba).toBeVisible();
  await expect(async () => {
    if ((await aba.getAttribute("aria-pressed")) !== "true") await aba.click();
    await expect(aba).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  }).toPass();
}

/** As imagens à vista chegaram (as lazy fora da tela não contam). */
async function imagensProntas(page: Page) {
  await page.evaluate(async () => {
    const vistas = [...document.querySelectorAll<HTMLImageElement>(".q-card__capa:not([hidden]) img")].filter(
      (i) => i.getBoundingClientRect().top < innerHeight && i.offsetParent,
    );
    await Promise.all(vistas.map((i) => i.decode().catch(() => {})));
  });
  await page.waitForTimeout(300);
}

const capaPng = (de = "#f6c79a", ate = "#6b3f8f") =>
  sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${de}"/><stop offset="1" stop-color="${ate}"/></linearGradient></defs>
      <rect width="1600" height="900" fill="url(#g)"/>
      <circle cx="1180" cy="330" r="170" fill="#ffe7b8" opacity="0.9"/>
      <path d="M0 720 L420 470 L760 690 L1080 520 L1600 760 L1600 900 L0 900 Z" fill="#2b1f3a" opacity="0.85"/>
    </svg>`),
  )
    .png()
    .toBuffer();

test.describe.configure({ mode: "serial" });

test.describe("Quadro: achar o job", () => {
  test("de relance: selo do link, miniatura da peça e a marca do cliente", async ({ page, context, baseURL }, info) => {
    await entrar(context, baseURL!, sessao().token);
    await page.goto("/app/quadro");
    await verColuna(page, "aprovacao", info.project.name);
    const col = page.locator('.q-col[data-col="aprovacao"]');
    // a demonstração manda os lotes ao cliente: os cards em aprovação dizem isso sem abrir
    await expect(col.locator(".q-selo").first()).toBeVisible();
    const tons = await page.locator(".q-selo").evaluateAll((l) => l.map((e) => (e as HTMLElement).dataset.tom));
    expect(tons).toContain("enviado");
    expect(tons.some((t) => t === "aprovado" || t === "ajuste")).toBe(true);
    const selo = col.locator(".q-selo").first();
    await expect(selo).toHaveAttribute("title", /cliente/);
    // o leitor de tela ouve a frase inteira no botão do card
    const nome = await selo.locator("xpath=ancestor::article").locator(".q-card__abrir").getAttribute("aria-label");
    expect(nome).toContain((await selo.getAttribute("title"))!);
    // a peça da demonstração tem o quadro do vídeo como miniatura (sem buscar nada no servidor)
    const mini = page.locator('.q-card__capa img[src^="/demo/"]').first();
    await expect(mini).toHaveCount(1);
    // cada card com cliente tem a sigla na cor dele, a mesma para o mesmo cliente
    const marcas = await page
      .locator(".q-card .q-cli")
      .evaluateAll((l) => l.map((e) => [e.closest(".q-card")!.querySelector(".q-card__cliente-nome")!.textContent, (e as HTMLElement).dataset.cor]));
    expect(marcas.length).toBeGreaterThan(10);
    const porCliente = new Map<string, Set<string>>();
    for (const [n, c] of marcas) porCliente.set(n!, (porCliente.get(n!) ?? new Set()).add(c!));
    for (const [n, cores] of porCliente) expect(cores.size, n).toBe(1);
  });

  test("capa: escolher na ficha aparece no card na hora; Tirar volta ao compacto", async ({ page, context, baseURL }, info) => {
    await entrar(context, baseURL!, sessao().token);
    await page.goto("/app/quadro");
    await verColuna(page, "fazendo", info.project.name);
    const card = page.locator('.q-col[data-col="fazendo"] .q-card:not(.q-card--imagem)').first();
    const id = await card.getAttribute("data-card");
    const tema = (await card.locator(".q-card__tema").textContent())!;
    await card.locator(".q-card__abrir").click();
    const ficha = page.getByRole("dialog", { name: `Card: ${tema}` });
    await expect(ficha).toBeVisible();
    await ficha.locator('input[data-campo="capa"]').setInputFiles({ name: "capa.png", mimeType: "image/png", buffer: await capaPng() });
    await expect(ficha.getByRole("img", { name: "Capa do card" })).toBeVisible();
    await expect(ficha.getByRole("button", { name: "Trocar capa" })).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/depois-${info.project.name}-ficha-capa.png` });
    await page.keyboard.press("Escape");
    await expect(ficha).toBeHidden();
    const noQuadro = page.locator(`[data-card="${id}"] .q-card__capa img`);
    await expect(noQuadro).toHaveAttribute("src", new RegExp(`^/api/quadro/capa/${id}/[0-9a-f]{64}$`));
    await expect.poll(() => noQuadro.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
    // recarregar: a capa vem do banco
    await page.reload();
    await verColuna(page, "fazendo", info.project.name);
    await expect(page.locator(`[data-card="${id}"] .q-card__capa img`)).toBeVisible();
    // Tirar
    await page.locator(`[data-card="${id}"] .q-card__abrir`).click();
    await page.getByRole("dialog").getByRole("button", { name: "Tirar a capa" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Adicionar capa" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(`[data-card="${id}"] .q-card__capa`)).toHaveCount(0);
  });

  test("busca: cliente ou título, com realce e contagem; nada encontrado com Limpar", async ({ page, context, baseURL }, info) => {
    await entrar(context, baseURL!, sessao().token);
    await page.goto("/app/quadro");
    const busca = page.getByRole("searchbox");
    if (info.project.name === "computador") {
      // "/" leva à busca (depois da hidratação: tenta até pegar)
      await expect(async () => {
        await page.locator("body").press("/");
        await expect(busca).toBeFocused({ timeout: 500 });
      }).toPass();
      await expect(busca).toHaveValue("");
    }
    await busca.fill("cafe serra");
    await expect(page.locator(".q-contagem")).toHaveText(/^\d+ cards?$/);
    const n = Number((await page.locator(".q-contagem").textContent())!.split(" ")[0]);
    expect(n).toBeGreaterThan(0);
    const nomes = await page.locator(".q-card .q-card__cliente-nome").allTextContents();
    expect(nomes.length).toBe(n);
    for (const nome of nomes) expect(nome).toBe("Café Serra Alta");
    await expect(page.locator(".q-card mark.q-realce").first()).toBeVisible();
    await busca.fill("zzz sem nada");
    await expect(page.getByText("Nada com “zzz sem nada”.")).toBeVisible();
    await expect(page.locator(".q-contagem")).toHaveText("Nenhum card");
    await page.getByRole("button", { name: "Limpar busca" }).click();
    await expect(busca).toHaveValue("");
    await expect(page.locator(".q-nada")).toHaveCount(0);
  });

  test("o próximo passo: no computador só no gesto; no toque à vista", async ({ page, context, baseURL }, info) => {
    await entrar(context, baseURL!, sessao().token);
    await page.goto("/app/quadro");
    await verColuna(page, "afazer", info.project.name);
    const card = page.locator('.q-col[data-col="afazer"] .q-card').first();
    const passo = card.locator(".q-card__passo");
    if (info.project.name === "computador") {
      await page.mouse.move(2, 2);
      await expect(passo).toHaveCSS("opacity", "0");
      await card.hover();
      await expect(passo).toHaveCSS("opacity", "1");
    } else {
      await expect(passo).toHaveCSS("opacity", "1");
      await expect(passo).toBeInViewport();
    }
  });

  test("leitura vê selos e imagens, sem Adicionar capa", async ({ page, context, baseURL }, info) => {
    await entrar(context, baseURL!, sessao().leitura);
    await page.goto("/app/quadro");
    await verColuna(page, "aprovacao", info.project.name);
    await expect(page.locator(".q-selo").first()).toBeAttached();
    await page.locator('.q-col[data-col="aprovacao"] .q-card__abrir').first().click();
    const ficha = page.getByRole("dialog");
    await expect(ficha).toBeVisible();
    await expect(ficha.getByRole("button", { name: /capa/ })).toHaveCount(0);
    await expect(ficha.locator('input[data-campo="capa"]')).toHaveCount(0);
  });

  test("telas (claro e escuro)", async ({ page, context, baseURL }, info) => {
    test.skip(!SHOTS, "só com SHOTS_DIR");
    // algumas capas pela mesma rota da ficha, para a tela mostrar o Quadro como a equipe vai usar
    await entrar(context, baseURL!, sessao().token);
    await page.goto("/app/quadro");
    const cores: [string, string, string][] = [
      ["fazendo", "#f6c79a", "#6b3f8f"],
      ["revisao", "#9be3d0", "#1d5c6b"],
      ["agendado", "#ffd36e", "#c2410c"],
      ["pauta", "#d9c7ff", "#3b2a6b"],
    ];
    for (const [coluna, de, ate] of cores) {
      const id = await page.locator(`.q-col[data-col="${coluna}"] .q-card:not(.q-card--imagem)`).first().getAttribute("data-card");
      const r = await page.request.post(`/api/quadro/capa?card=${id}`, {
        headers: { origin: baseURL!, "content-type": "image/png" },
        data: await capaPng(de, ate),
      });
      expect(r.status()).toBe(201);
    }
    for (const tema of ["claro", "escuro"] as const) {
      await context.clearCookies();
      await entrar(context, baseURL!, sessao().token, tema);
      await page.emulateMedia({ colorScheme: tema === "escuro" ? "dark" : "light", reducedMotion: "reduce" });
      await page.goto("/app/quadro");
      await verColuna(page, "aprovacao", info.project.name);
      await expect(page.locator(".q-col.on .q-card, .q-col .q-card").locator("visible=true").first()).toBeVisible();
      await imagensProntas(page);
      await page.screenshot({ path: `${SHOTS}/depois-${info.project.name}-${tema}.png` });
      await page.getByRole("searchbox").fill("cafe");
      await imagensProntas(page);
      await page.screenshot({ path: `${SHOTS}/depois-${info.project.name}-${tema}-busca.png` });
    }
  });

  test("passeio para o vídeo (E2E_VIDEO=1)", async ({ page, context, baseURL }, info) => {
    test.skip(!process.env.E2E_VIDEO || info.project.name !== "computador", "só gravando, no computador");
    const pausa = (ms = 900) => page.waitForTimeout(ms);
    await entrar(context, baseURL!, sessao().token);
    await page.goto("/app/quadro");
    await imagensProntas(page);
    await pausa(1500);
    // o link de relance: passar sobre o selo mostra a frase inteira
    const selo = page.locator('.q-col[data-col="aprovacao"] .q-selo').first();
    await selo.hover();
    await pausa(1400);
    // capa: abrir um card, escolher a imagem, fechar e ver no Quadro
    const card = page.locator('.q-col[data-col="afazer"] .q-card:not(.q-card--imagem)').first();
    await card.hover();
    await pausa(1000);
    await card.locator(".q-card__abrir").click();
    const ficha = page.getByRole("dialog");
    await pausa(900);
    await ficha.getByRole("button", { name: "Adicionar capa" }).hover();
    await pausa(700);
    await ficha.locator('input[data-campo="capa"]').setInputFiles({ name: "capa.png", mimeType: "image/png", buffer: await capaPng("#ffd36e", "#7c2d12") });
    await expect(ficha.getByRole("img", { name: "Capa do card" })).toBeVisible();
    await pausa(1400);
    await page.keyboard.press("Escape");
    await imagensProntas(page);
    await pausa(1500);
    // achar o job: "/" e o nome do cliente
    await expect(async () => {
      await page.locator("body").press("/");
      await expect(page.getByRole("searchbox")).toBeFocused({ timeout: 500 });
    }).toPass();
    await page.getByRole("searchbox").pressSequentially("serra", { delay: 140 });
    await pausa(2000);
    await page.getByRole("searchbox").fill("");
    await page.getByRole("searchbox").pressSequentially("documentário", { delay: 110 });
    await pausa(2000);
    await page.getByRole("searchbox").press("Escape");
    await pausa(1200);
  });
});
