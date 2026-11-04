/**
 * As pastas do Drive no card (titular, 04/11/2026): "Brutos" e "Entrega" na ficha, só com o SOBEDESCE no plano.
 * Colar o link (o errado é recusado, o certo vira o endereço montado do id), escolher pelo navegador do Drive do Maestro
 * (Google de mentira), abrir pelo chip, recarregar e continua; sem o SOBEDESCE, a ficha não tem Drive nenhum.
 * Organização do Drive (e2e/preparar.ts). Com SHOTS_DIR, guarda `pd-*`.
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { googleDeMentira } from "./falsos/google-drive";

const SESSAO_DRIVE = "test-results/e2e-sessao-drive.json";
const SESSAO_SEM = "test-results/e2e-sessao-fluxo.json";
const SHOTS = process.env.SHOTS_DIR;
const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

async function entrar(context: BrowserContext, baseURL: string, arquivo: string) {
  const { token } = JSON.parse(readFileSync(arquivo, "utf8")) as { token: string };
  await context.clearCookies();
  await context.addCookies([
    { name: "mae_sessao", value: token, url: baseURL },
    { name: "zro_theme", value: "light", url: baseURL },
  ]);
}

async function foto(page: Page, nome: string, projeto: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/pd-${nome}-${projeto === "iphone" ? "iphone" : "desktop"}.png` });
}

/** Um card novo (sem projeto) na organização da sessão. */
async function novoCard(page: Page, tema: string): Promise<string> {
  const id = `c${Date.now().toString(36)}pd${Math.random().toString(36).slice(2, 6)}`;
  const r = await page.request.post("/api/quadro", {
    data: { op: "criar", id, dados: { tema, coluna: "fazendo" } },
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(r.ok()).toBe(true);
  return id;
}

test.describe("As pastas do Drive no card", () => {
  test.beforeEach(({}, info) => {
    test.skip(!["computador", "iphone"].includes(info.project.name), "computador e iPhone (Chromium)");
  });

  test("Brutos pelo link colado, Entrega pelo navegador do Drive; recarregar e continua", async ({ page, context, baseURL }, info) => {
    await googleDeMentira(context);
    await entrar(context, baseURL!, SESSAO_DRIVE);
    await page.goto("/app/quadro");
    const id = await novoCard(page, `Pastas ${info.project.name}`);
    await page.goto(`/app/quadro?card=${id}`);
    const drive = page.getByRole("region", { name: "Pastas no Drive" });
    await expect(drive).toBeVisible();
    await drive.scrollIntoViewIfNeeded();
    await foto(page, "ficha-vazia", info.project.name);

    // Brutos: o link de um arquivo é recusado; o da pasta vira o endereço montado do id
    await drive.getByRole("button", { name: "Brutos", exact: true }).click();
    const folha = page.getByRole("dialog", { name: "Pasta dos brutos" });
    await expect(folha).toBeVisible();
    const campo = folha.getByLabel("Link da pasta no Drive");
    await campo.fill(`https://drive.google.com/file/d/${ID}/view`);
    await folha.getByRole("button", { name: "Usar", exact: true }).click();
    await expect(folha.getByRole("alert")).toHaveText("Esse link não é de uma pasta do Drive.");
    await campo.fill(`https://drive.google.com/drive/u/1/folders/${ID}?usp=sharing`);
    await foto(page, "colar", info.project.name);
    await folha.getByRole("button", { name: "Usar", exact: true }).click();
    await expect(folha).toHaveCount(0);
    const brutos = drive.locator('[data-pasta="pastaBrutos"] a');
    await expect(brutos).toHaveAttribute("href", `https://drive.google.com/drive/folders/${ID}`);
    await expect(brutos).toHaveAttribute("target", "_blank");

    // Entrega: escolher a pasta pelo navegador do Drive
    await drive.getByRole("button", { name: "Entrega", exact: true }).click();
    const folhaE = page.getByRole("dialog", { name: "Pasta de entrega" });
    await folhaE.getByRole("button", { name: "Escolher no Drive" }).click();
    await folhaE.getByRole("button", { name: /Clientes/ }).click();
    await folhaE.getByRole("button", { name: /Café Aurora/ }).click();
    await expect(folhaE.getByRole("button", { name: /Teaser 15s vertical\.mp4/ })).toBeVisible();
    await foto(page, "navegador", info.project.name);
    await folhaE.getByRole("button", { name: "Usar esta pasta" }).click();
    await expect(folhaE).toHaveCount(0);
    const entrega = drive.locator('[data-pasta="pastaEntrega"] a');
    await expect(entrega).toHaveAttribute("href", "https://drive.google.com/drive/folders/f-aurora");
    await expect(entrega).toContainText("Café Aurora");
    await foto(page, "ficha-com-pastas", info.project.name);

    // gravado no card: recarregar e continua; tirar volta ao chip vazio
    await page.reload();
    await expect(page.getByRole("region", { name: "Pastas no Drive" }).locator('[data-pasta="pastaBrutos"] a')).toBeVisible();
    await page.getByRole("button", { name: "Trocar a pasta Brutos" }).click();
    await page.getByRole("dialog", { name: "Pasta dos brutos" }).getByRole("button", { name: "Tirar" }).click();
    await expect(page.getByRole("region", { name: "Pastas no Drive" }).getByRole("button", { name: "Brutos", exact: true })).toBeVisible();
  });

  test("sem o SOBEDESCE no plano a ficha não tem Drive", async ({ page, context, baseURL }) => {
    await entrar(context, baseURL!, SESSAO_SEM);
    await page.goto("/app/quadro");
    const id = await novoCard(page, "Sem pastas");
    await page.goto(`/app/quadro?card=${id}`);
    await expect(page.getByRole("dialog", { name: /Card: Sem pastas/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Versões" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Pastas no Drive" })).toHaveCount(0);
    // e a rota recusa a gravação
    const r = await page.request.post("/api/quadro", {
      data: { op: "mudar", id, campos: { pastaBrutos: { id: ID } } },
      headers: { Origin: new URL(page.url()).origin },
    });
    expect(r.status()).toBe(403);
  });
});
