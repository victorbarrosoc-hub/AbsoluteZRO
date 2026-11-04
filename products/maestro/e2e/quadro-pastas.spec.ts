/**
 * As pastas do Drive no card (titular, 04/11/2026): "Brutos" e "Entrega" na ficha, só com o SOBEDESCE no plano.
 * Colar o link (o errado é recusado, o certo vira o endereço montado do id), escolher pelo navegador do Drive do Maestro
 * (Google de mentira), abrir pelo chip, recarregar e continua; sem o SOBEDESCE, a ficha não tem Drive nenhum.
 * Nas Versões: "Escolher no Drive" sempre (com o SOBEDESCE no plano) e "Enviar a entrega" só quando o SOBEDESCE
 * publicado diz que sabe (contrato 2, a sonda); com o SOBEDESCE de antes, o botão não aparece. O envio pelo quadro
 * do SOBEDESCE de mentira volta como `enviado` e preenche a versão; quem adiciona é a pessoa.
 * Organização do Drive (e2e/preparar.ts). Com SHOTS_DIR, guarda `pd-*`.
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { googleDeMentira } from "./falsos/google-drive";
import { enviadoNoQuadro, sobedesceDeMentira } from "./falsos/sobedesce";

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

/** Um card com a pasta Entrega já posta (a mesma rota da ficha). */
async function cardComEntrega(page: Page, tema: string): Promise<string> {
  const id = await novoCard(page, tema);
  const r = await page.request.post("/api/quadro", {
    data: { op: "mudar", id, campos: { pastaEntrega: { id: "pastaEntregaE2E", nome: "05 Entregas" } } },
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(r.ok()).toBe(true);
  return id;
}

test.describe("Versões com o SOBEDESCE", () => {
  // o service worker do SOBEDESCE de verdade assumiria os pedidos que o teste simula
  test.use({ serviceWorkers: "block" });
  test.beforeEach(({}, info) => {
    test.skip(!["computador", "iphone"].includes(info.project.name), "computador e iPhone (Chromium)");
  });

  test("o SOBEDESCE de antes não sabe enviar: só Escolher no Drive, nada de Enviar a entrega", async ({ page, context, baseURL }, info) => {
    const sd = await sobedesceDeMentira(context);
    await entrar(context, baseURL!, SESSAO_DRIVE);
    await page.goto("/app/quadro");
    const id = await cardComEntrega(page, `Sem envio ${info.project.name}`);
    await page.goto(`/app/quadro?card=${id}`);
    const versoes = page.getByRole("region", { name: "Versões" });
    await expect(versoes.getByRole("button", { name: "Escolher no Drive" })).toBeVisible();
    // a sonda perguntou e o quadro escondido já saiu
    await expect.poll(() => sd.pedidos.some((q) => q.includes("modo=sonda"))).toBe(true);
    await expect(page.locator('iframe[src*="modo=sonda"]')).toHaveCount(0);
    await expect(versoes.getByRole("button", { name: "Enviar a entrega" })).toHaveCount(0);
    await versoes.scrollIntoViewIfNeeded();
    await foto(page, "versoes-sem-envio", info.project.name);
  });

  test("o SOBEDESCE que sabe: Enviar a entrega para a pasta do card e usar como versão", async ({ page, context, baseURL }, info) => {
    const sd = await sobedesceDeMentira(context, { recursos: ["enviar"] });
    await entrar(context, baseURL!, SESSAO_DRIVE);
    await page.goto("/app/quadro");
    const id = await cardComEntrega(page, `Com envio ${info.project.name}`);
    await page.goto(`/app/quadro?card=${id}`);
    const versoes = page.getByRole("region", { name: "Versões" });
    const botao = versoes.getByRole("button", { name: "Enviar a entrega" });
    await expect(botao).toBeVisible();
    await versoes.scrollIntoViewIfNeeded();
    await foto(page, "versoes-com-envio", info.project.name);
    await botao.click();
    const folha = page.getByRole("dialog", { name: "Enviar a entrega" });
    await expect(folha).toBeVisible();
    const el = await page.waitForSelector("iframe.en__quadro");
    expect(await el.getAttribute("src")).toContain("modo=enviar");
    expect(await el.getAttribute("src")).toContain("pasta=pastaEntregaE2E");
    expect(sd.pedidos.some((q) => q.includes("modo=enviar") && q.includes("nome=05+Entregas"))).toBe(true);
    const f = (await el.contentFrame())!;
    await f.waitForFunction(() => !!(window as unknown as { __sd?: unknown }).__sd);
    await expect(f.getByText("Enviar para 05 Entregas")).toBeVisible();
    // o que não conferiu não vira versão; o conferido vira
    await enviadoNoQuadro(f, { id: "arqNaoConferiu", nome: "Final v2.mp4", conferencia: "diferente" });
    await enviadoNoQuadro(f, { id: "arqFinalE2E01", nome: "Final v3.mp4", conferencia: "ok" });
    const lista = folha.getByRole("list", { name: "Enviados" });
    await expect(lista.getByText("Conferido")).toBeVisible();
    await expect(lista.getByText("Não conferiu")).toBeVisible();
    await expect(lista.getByRole("button", { name: "Usar como versão" })).toHaveCount(1);
    await foto(page, "entrega-enviada", info.project.name);
    await lista.getByRole("button", { name: "Usar como versão" }).click();
    await expect(folha).toHaveCount(0);
    await expect(versoes.getByLabel("Link da versão")).toHaveValue("https://drive.google.com/file/d/arqFinalE2E01/view");
    await versoes.getByRole("button", { name: "Adicionar" }).click();
    await expect(versoes.locator(".vc__lista")).toContainText("Final v3");
  });
});
