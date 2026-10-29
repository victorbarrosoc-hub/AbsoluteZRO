/**
 * Arquivos e o Drive na revisão (plano v2 §4.1 e §5): sem o SOBEDESCE no plano, o cadeado (e a rota do token nega);
 * com ele (organização própria em e2e/preparar.ts, ponte falsa no lugar do HUB e do SOBEDESCE, Google interceptado no
 * navegador), o navegador do Drive com pastas, migalhas, miniaturas, prévia do vídeo pelo service worker com timecode,
 * "Abrir no SOBEDESCE" e a estrutura do projeto; na revisão, o vídeo do Drive toca com tempo de verdade e o
 * "Escolher no Drive" preenche o link. Com SHOTS_DIR, guarda as capturas (claro, escuro e iPhone).
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { googleDeMentira } from "./falsos/google-drive";

const SESSAO = "test-results/e2e-sessao.json";
const SESSAO_DRIVE = "test-results/e2e-sessao-drive.json";
const SHOTS = process.env.SHOTS_DIR;

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
    const r = await page.request.post("/api/arquivos/token", { data: {}, headers: { origin: baseURL! } });
    expect(r.status()).toBe(403);
    await foto(page, "arquivos-bloqueado", info.project.name);
    if (SHOTS && info.project.name === "computador") {
      await context.addCookies([{ name: "zro_theme", value: "dark", url: baseURL! }]);
      await page.reload();
      await foto(page, "arquivos-bloqueado", info.project.name, "dark");
    }
  });

  test("com o SOBEDESCE: pastas, migalhas, prévia com timecode, Abrir no SOBEDESCE e a estrutura do projeto", async ({ page, context, baseURL }, info) => {
    await googleDeMentira(context);
    await entrar(context, baseURL!, SESSAO_DRIVE);
    await page.goto("/app/arquivos");
    const drive = page.getByRole("region", { name: "Google Drive" });
    await expect(drive.getByRole("button", { name: /Clientes/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Projetos no Drive" }).getByText("Filme manifesto")).toBeVisible();
    await drive.getByRole("button", { name: /Clientes/ }).click();
    await drive.getByRole("button", { name: /Café Aurora/ }).click();
    await expect(drive.getByRole("list", { name: "Caminho" })).toContainText("Café Aurora");
    await expect(drive.getByRole("button", { name: /Filme manifesto v3\.mp4/ })).toBeVisible();
    await foto(page, "arquivos-drive", info.project.name);
    // Nada de rolagem para o lado (no iPhone também).
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    // Filtro por tipo: só vídeos.
    if (info.project.name === "computador") {
      await drive.getByRole("button", { name: "Vídeos" }).click();
      await expect(drive.getByRole("button", { name: /Roteiro aprovado\.pdf/ })).toHaveCount(0);
      await drive.getByRole("button", { name: "Tudo" }).click();
    }
    await drive.getByRole("button", { name: /Filme manifesto v3\.mp4/ }).click();
    const previa = page.getByRole("dialog", { name: "Filme manifesto v3.mp4" });
    await expect(previa).toBeVisible();
    await videoComTempo(page, ".dv-video");
    await expect(previa.getByLabel("Tempo atual")).toHaveText("00:00:02");
    await expect(previa.getByRole("link", { name: "Abrir no SOBEDESCE" })).toHaveAttribute("href", "https://sobedesce.com/app/#arquivo/vid-manifesto");
    await foto(page, "arquivos-previa", info.project.name);
    await previa.getByRole("button", { name: "Fechar" }).click();
    if (info.project.name === "computador") {
      // Estrutura do projeto: Maestro/Café Aurora/MAE-2026-015 Teasers de lançamento/01…05, e a pasta fica ligada.
      const projetos = page.getByRole("region", { name: "Projetos no Drive" });
      const linha = projetos.getByRole("listitem").filter({ hasText: "Teasers de lançamento" });
      await linha.getByRole("button", { name: "Estrutura no Drive" }).click();
      await expect(projetos.getByRole("status")).toHaveText(/Estrutura criada no Drive/);
      await expect(linha.getByRole("button", { name: "Abrir" })).toBeVisible();
      if (SHOTS) {
        await context.addCookies([{ name: "zro_theme", value: "dark", url: baseURL! }]);
        await page.goto("/app/arquivos");
        await drive.getByRole("button", { name: /Clientes/ }).click();
        await drive.getByRole("button", { name: /Café Aurora/ }).click();
        await expect(drive.getByRole("button", { name: /Filme manifesto v3\.mp4/ })).toBeVisible();
        await foto(page, "arquivos-drive", info.project.name, "dark");
      }
    }
  });

  test("revisão: o Drive toca com tempo de verdade e o Escolher no Drive preenche o link", async ({ page, context, baseURL }, info) => {
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
