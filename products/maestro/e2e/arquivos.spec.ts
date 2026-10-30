/**
 * Arquivos é o SOBEDESCE (titular, 30/10/2026) e o Drive na revisão (plano v2 §4.1 e §5).
 *
 * - Sem o SOBEDESCE no plano: o cadeado (e a rota do token nega).
 * - Com ele (organização própria em e2e/preparar.ts, ponte falsa no lugar do HUB e do SOBEDESCE): o próprio app do
 *   SOBEDESCE num quadro (`/app/?no=maestro&tema=`, servido de mentira em https://sobedesce.absolutezro.com por
 *   e2e/falsos/sobedesce.ts), sem botão de "abrir", só o selo; o tema do Maestro vai junto; a pasta aberta no quadro
 *   liga a um projeto; "Abrir" leva o quadro à pasta só pelo `#` (sem recarregar); a estrutura do projeto abre no
 *   quadro; envio andando acende o ponto em Arquivos (e em Mais), segura o fechar da aba e sobrevive à troca de seção;
 *   recado de outra origem não vale; o SOBEDESCE fora do ar vira um aviso com o link.
 * - Na revisão, o vídeo do Drive toca com tempo de verdade e o "Escolher no Drive" preenche o link (o navegador do
 *   Drive de antes, com o Google interceptado).
 *
 * Com SHOTS_DIR, guarda as capturas (claro e escuro, computador e iPhone).
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { googleDeMentira } from "./falsos/google-drive";
import { enviosNoQuadro, quadroDoSobedesce, SOBEDESCE_FALSO, sobedesceDeMentira } from "./falsos/sobedesce";

const SESSAO = "test-results/e2e-sessao.json";
const SESSAO_DRIVE = "test-results/e2e-sessao-drive.json";
const SHOTS = process.env.SHOTS_DIR;
const APP = `${SOBEDESCE_FALSO}/app/`;

async function entrar(context: BrowserContext, baseURL: string, arquivo: string, tema = "light") {
  const { token } = JSON.parse(readFileSync(arquivo, "utf8")) as { token: string };
  await context.addCookies([
    { name: "mae_sessao", value: token, url: baseURL },
    { name: "zro_theme", value: tema, url: baseURL },
  ]);
}

async function foto(page: Page, nome: string, projeto: string, tema = "light") {
  if (!SHOTS) return;
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/sd-${nome}-${tema}-${projeto === "iphone" ? "iphone" : "desktop"}.png` });
}

/** O ponto do envio andando num item da navegação (o ::after acende com `data-envios` no <html>). */
const pontoAceso = (page: Page, seletor: string) =>
  page
    .locator(seletor)
    .first()
    .evaluate((el) => getComputedStyle(el, "::after").content !== "none" && getComputedStyle(el, "::after").content !== "normal");

/** Espera o vídeo carregar pelo stream, pula para 2 s e confere o tempo de verdade. */
async function videoComTempo(page: Page, seletor: string) {
  const v = page.locator(seletor).first();
  await expect(v).toHaveAttribute("src", /^\/app\/stream\/vid-manifesto\?/);
  await page.waitForFunction((s) => {
    const el = document.querySelector<HTMLVideoElement>(s);
    return !!el && el.readyState >= 1 && el.duration > 0;
  }, seletor);
  await v.evaluate((el: HTMLVideoElement) => {
    el.currentTime = 2;
  });
  await page.waitForFunction((s) => {
    const el = document.querySelector<HTMLVideoElement>(s);
    return !!el && el.currentTime >= 1.9 && !el.seeking && el.readyState >= 2;
  }, seletor);
}

test.describe("Arquivos", () => {
  test("sem o SOBEDESCE no plano: cadeado, caminho para os planos e a rota do token nega", async ({ page, context, baseURL }, info) => {
    await entrar(context, baseURL!, SESSAO);
    await page.goto("/app/arquivos");
    await expect(page.getByRole("heading", { name: "Arquivos faz parte dos planos com SOBEDESCE" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver planos" })).toHaveAttribute("href", /\/planos$/);
    await expect(page.locator("iframe")).toHaveCount(0);
    const r = await page.request.post("/api/arquivos/token", { data: {}, headers: { origin: baseURL! } });
    expect(r.status()).toBe(403);
    await foto(page, "arquivos-bloqueado", info.project.name);
    if (SHOTS && info.project.name === "computador") {
      await context.addCookies([{ name: "zro_theme", value: "dark", url: baseURL! }]);
      await page.reload();
      await foto(page, "arquivos-bloqueado", info.project.name, "dark");
    }
  });
});

test.describe("Arquivos é o SOBEDESCE", () => {
  // O service worker do SOBEDESCE de verdade assumiria os pedidos que o teste simula (o SW tem os testes dele).
  test.use({ serviceWorkers: "block" });

  test("o app embutido: tema junto, pasta ligada, Abrir pelo #, envio andando e a troca de seção", async ({ page, context, baseURL }, info) => {
    const pc = info.project.name === "computador";
    const sd = await sobedesceDeMentira(context);
    await entrar(context, baseURL!, SESSAO_DRIVE);
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(e.message));
    await page.goto("/app/arquivos");

    // Sem botão de "abrir": a tela já é o SOBEDESCE, com o selo pequeno dele (leva ao site).
    await expect(page.getByRole("heading", { name: "Seus arquivos." })).toBeVisible();
    const selo = page.getByRole("link", { name: "SOBEDESCE" });
    await expect(selo).toHaveAttribute("href", "https://sobedesce.com");
    await expect(selo).toHaveAttribute("target", "_blank");
    expect((await selo.boundingBox())!.height).toBeLessThanOrEqual(34);
    await expect(page.getByRole("link", { name: /Abrir no SOBEDESCE/ })).toHaveCount(0);

    // O próprio app, em /app/?no=maestro, no tema do Maestro; só Transferências e Drive.
    const iframe = page.locator("iframe.sd-quadro");
    await expect(iframe).toHaveAttribute("src", `${APP}?no=maestro&tema=claro`);
    await expect(page.locator(".sd-vivo")).toHaveAttribute("data-fase", "pronto");
    const f = await quadroDoSobedesce(page);
    expect(await f.locator(".abas button").allTextContents()).toEqual(["Transferências", "Drive"]);
    expect(await f.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
    const carregou = await f.evaluate(() => (window as unknown as { __sd: { carregou: number } }).__sd.carregou);

    // Ocupa a tela: no computador até embaixo da janela; no iPhone até a barra de baixo. Nada rola de lado.
    const vh = page.viewportSize()!.height;
    const fimDaTela = pc ? vh : (await page.locator(".barra").boundingBox())!.y;
    /** O fim do quadro: dentro da tela (até a barra no iPhone) e perto dela (ocupa o que sobra). */
    const fimDoQuadro = async () => {
      const b = (await iframe.boundingBox())!;
      return Math.round(b.y + b.height);
    };
    const caixa = (await iframe.boundingBox())!;
    expect(caixa.height).toBeGreaterThanOrEqual(pc ? 520 : 360);
    if (pc) expect(caixa.width).toBeGreaterThan(1200);
    expect(await fimDoQuadro()).toBeLessThanOrEqual(fimDaTela);
    expect(await fimDoQuadro()).toBeGreaterThan(fimDaTela - 40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await foto(page, "arquivos-sobedesce", info.project.name);

    // O tema do Maestro muda e o SOBEDESCE vai junto, sem recarregar.
    await page.locator('.tema button[title="Tema escuro"]:visible').click();
    await expect.poll(() => f.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    expect(await f.evaluate(() => (window as unknown as { __sd: { recebidos: unknown[] } }).__sd.recebidos)).toContainEqual({ tipo: "tema", tema: "escuro" });
    await expect(iframe).toHaveAttribute("src", `${APP}?no=maestro&tema=claro`);
    await foto(page, "arquivos-sobedesce", info.project.name, "dark");
    await page.locator('.tema button[title="Tema claro"]:visible').click();
    await expect.poll(() => f.evaluate(() => document.documentElement.dataset.theme)).toBe("light");

    // A pasta aberta no Drive do quadro vira "Ligar a um projeto".
    await f.getByRole("button", { name: "Drive" }).click();
    await f.getByRole("button", { name: /Clientes/ }).click();
    await f.getByRole("button", { name: /Café Aurora/ }).click();
    const ligar = page.getByRole("form", { name: "Ligar a pasta aberta a um projeto" });
    await expect(ligar).toContainText("Café Aurora");
    // A faixa de cima ganhou "Ligar" (no iPhone, mais uma linha): o quadro encolhe e continua inteiro na tela.
    await expect.poll(fimDoQuadro).toBeLessThanOrEqual(fimDaTela);
    await foto(page, "arquivos-pasta", info.project.name);
    const projetos = page.getByRole("region", { name: "Projetos no Drive" });
    const manifesto = projetos.getByRole("listitem").filter({ hasText: "Filme manifesto" });
    if (pc) {
      await ligar.getByLabel("Projeto").selectOption({ label: "MAE-2026-014 · Filme manifesto" });
      await ligar.getByRole("button", { name: "Ligar" }).click();
      await expect(page.locator(".dv-aviso")).toHaveText("“Café Aurora” ligada ao projeto.");
    }
    // Voltar à raiz no quadro: a pasta some do "Ligar".
    await f.getByRole("button", { name: "Meu Drive" }).click();
    await expect(ligar).toHaveCount(0);

    // "Abrir" no projeto leva o quadro à pasta só pelo # (o quadro não recarrega).
    await manifesto.getByRole("button", { name: "Abrir" }).click();
    await expect.poll(() => f.evaluate(() => document.documentElement.dataset.pasta)).toBe("f-aurora");
    await expect(f.getByRole("navigation", { name: "Caminho" })).toContainText("Café Aurora");
    expect(await f.evaluate(() => (window as unknown as { __sd: { carregou: number } }).__sd.carregou)).toBe(carregou);
    expect(await f.evaluate(() => location.hash)).toBe("");

    // A estrutura do projeto: cria no Drive e o quadro abre a pasta nova.
    if (pc) {
      const teasers = projetos.getByRole("listitem").filter({ hasText: "Teasers de lançamento" });
      await teasers.getByRole("button", { name: "Estrutura no Drive" }).click();
      await expect(page.locator(".dv-aviso")).toHaveText(/Estrutura criada no Drive/);
      await expect(teasers.getByRole("button", { name: "Abrir" })).toBeVisible();
      await expect.poll(() => f.evaluate(() => document.documentElement.dataset.pasta)).toMatch(/^p-/);
    }

    // Recado de outra origem (a própria página fingindo) não acende nada.
    await page.evaluate(() => window.postMessage({ fonte: "sobedesce", tipo: "envios", andando: 3 }, "*"));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.dataset.envios ?? null)).toBeNull();

    // Envio andando: o ponto acende e o fechar da aba pede confirmação.
    await enviosNoQuadro(f, 2);
    await expect(page.locator("html")).toHaveAttribute("data-envios", "2");
    const segura = () => page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })));
    expect(await segura()).toBe(true);
    const item = pc ? '.capsula__menu > .capsula__item[data-sinal="envios"]' : '.barra a[data-sinal="envios"]';
    expect(await pontoAceso(page, item)).toBe(true);

    // Sair de Arquivos não para o envio: o quadro fica vivo (escondido), o ponto continua aceso.
    await page.locator('a[href="/app/hoje"]:visible').first().click();
    await expect(page).toHaveURL(/\/app\/hoje$/);
    await expect(page.locator(".sd-vivo")).toBeHidden();
    await expect(iframe).toHaveCount(1);
    expect(await pontoAceso(page, item)).toBe(true);
    await foto(page, "envio-andando", info.project.name);
    if (pc) {
      await page.locator('.capsula__menu > .capsula__item[data-sinal="envios"]').click();
      await expect(page.locator('.capsula__opcao[data-sinal="envios"]')).toBeVisible();
      expect(await pontoAceso(page, '.capsula__opcao[data-sinal="envios"]')).toBe(true);
      await foto(page, "envio-andando-menu", info.project.name);
      await page.locator('.capsula__opcao[data-sinal="envios"]').click();
    } else {
      await page.locator('.barra a[href="/app/mais"]').click();
      await expect(page).toHaveURL(/\/app\/mais$/);
      expect(await pontoAceso(page, '.mais-item[data-sinal="envios"]')).toBe(true);
      await foto(page, "envio-andando-mais", info.project.name);
      await page.locator('.mais-item[data-sinal="envios"]').click();
    }
    await expect(page).toHaveURL(/\/app\/arquivos$/);
    await expect(page.locator(".sd-vivo")).toBeVisible();
    expect(await f.evaluate(() => (window as unknown as { __sd: { carregou: number } }).__sd.carregou)).toBe(carregou);
    expect(sd.pedidos).toEqual(["?no=maestro&tema=claro"]);

    // Terminou: o ponto apaga e o fechar volta ao normal.
    await enviosNoQuadro(f, 0);
    await expect(page.locator("html")).not.toHaveAttribute("data-envios", /.*/);
    expect(await segura()).toBe(false);
    expect(await pontoAceso(page, item)).toBe(false);

    // E com envio andando, fechar a aba de verdade pede confirmação ao navegador.
    if (pc) {
      await enviosNoQuadro(f, 1);
      await expect(page.locator("html")).toHaveAttribute("data-envios", "1");
      const dialogo = page.waitForEvent("dialog");
      await page.close({ runBeforeUnload: true });
      const d = await dialogo;
      expect(d.type()).toBe("beforeunload");
      await d.accept();
    }
    expect(erros).toEqual([]);
  });

  test("o SOBEDESCE não abre (fora do ar ou recusando o quadro): aviso curto com o link, nunca quadro quebrado", async ({ page, context, baseURL }, info) => {
    await sobedesceDeMentira(context, { recusar: true });
    await entrar(context, baseURL!, SESSAO_DRIVE);
    await page.goto("/app/arquivos");
    const aviso = page.locator(".sd-falhou");
    await expect(aviso).toBeVisible({ timeout: 15_000 });
    await expect(aviso).toContainText("O SOBEDESCE não abriu aqui.");
    await expect(aviso.getByRole("link", { name: "Abrir o SOBEDESCE" })).toHaveAttribute("href", APP);
    await expect(page.locator("iframe.sd-quadro")).toHaveCount(0);
    // A lista de projetos continua.
    await expect(page.getByRole("region", { name: "Projetos no Drive" })).toBeVisible();
    await foto(page, "arquivos-sem-sobedesce", info.project.name);
    await aviso.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(page.locator("iframe.sd-quadro")).toHaveCount(1);
    await expect(aviso).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Drive na revisão", () => {
  test("o Drive toca com tempo de verdade e o Escolher no Drive preenche o link", async ({ page, context, baseURL }, info) => {
    const google = await googleDeMentira(context);
    await entrar(context, baseURL!, SESSAO_DRIVE);
    const { lote } = JSON.parse(readFileSync(SESSAO_DRIVE, "utf8")) as { lote: string };
    await page.goto(`/app/aprovacoes/${lote}`);
    await videoComTempo(page, ".rv-video");
    await expect(page.locator(".rv-relogio .rv-tc")).toHaveText(/^00:00:02/);
    await page.locator(".rv-transporte").scrollIntoViewIfNeeded();
    expect(google.midia).toContain("vid-manifesto");
    await foto(page, "revisao-drive", info.project.name);
    await page.getByRole("button", { name: "Escolher no Drive" }).click();
    const seletor = page.getByRole("dialog", { name: "Escolher no Drive" });
    await seletor.getByRole("button", { name: /Clientes/ }).click();
    await seletor.getByRole("button", { name: /Café Aurora/ }).click();
    await expect(seletor.getByRole("button", { name: /Teaser 15s vertical\.mp4/ })).toBeVisible();
    await expect(seletor.getByRole("button", { name: /Roteiro aprovado\.pdf/ })).toHaveCount(0);
    await foto(page, "revisao-escolher", info.project.name);
    await seletor.getByRole("button", { name: /Teaser 15s vertical\.mp4/ }).click();
    await expect(seletor).toHaveCount(0);
    await expect(page.getByLabel("Link da nova versão")).toHaveValue("https://drive.google.com/file/d/vid-teaser/view");
    await expect(page.getByLabel("Nome da versão")).toHaveValue("Teaser 15s vertical");
    await expect(page.getByText("Toca com tempo automático pelo SOBEDESCE.")).toBeVisible();
    if (SHOTS && info.project.name === "computador") {
      await context.addCookies([{ name: "zro_theme", value: "dark", url: baseURL! }]);
      await page.goto(`/app/aprovacoes/${lote}`);
      await videoComTempo(page, ".rv-video");
      await page.locator(".rv-transporte").scrollIntoViewIfNeeded();
      await foto(page, "revisao-drive", info.project.name, "dark");
      await page.getByRole("button", { name: "Escolher no Drive" }).click();
      await page
        .getByRole("dialog", { name: "Escolher no Drive" })
        .getByRole("button", { name: /Clientes/ })
        .click();
      await page
        .getByRole("dialog", { name: "Escolher no Drive" })
        .getByRole("button", { name: /Café Aurora/ })
        .click();
      await foto(page, "revisao-escolher", info.project.name, "dark");
    }
  });
});
