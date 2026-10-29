/**
 * Pessoas da Absolute ZRO (ADR 0029 do HUB, drizzle/0022), contra o HUB falso (tests/ponte-falsa.mts): em Ajustes ›
 * Pessoas a administração busca pelo @ e convida (a pessoa aceita na Absolute ZRO); em Freelas, achar pelo @ adiciona
 * o freela ligado ao perfil e abre a ficha com o @. Perfil escondido não aparece. Com SHOTS_DIR, guarda as capturas
 * (claro e escuro, sem recarregar).
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const SHOTS = process.env.SHOTS_DIR;
const ARQUIVO_SESSAO_AGENDA = "test-results/e2e-sessao-agenda.json";

async function entrar(context: BrowserContext, baseURL: string) {
  const { token } = JSON.parse(readFileSync(ARQUIVO_SESSAO_AGENDA, "utf8")) as { token: string };
  await context.addCookies([
    { name: "mae_sessao", value: token, url: baseURL },
    { name: "zro_theme", value: "light", url: baseURL },
  ]);
}

async function fotos(page: Page, nome: string, projeto: string) {
  if (!SHOTS) return;
  for (const tema of ["light", "dark"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, tema);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/maestro-${nome}-${tema === "light" ? "claro" : "escuro"}-${projeto === "iphone" ? "celular" : "computador"}.png` });
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
}

test("Ajustes › Pessoas: buscar pelo @ e convidar; escondido não aparece", async ({ page, context, baseURL }, info) => {
  await entrar(context, baseURL!);
  await page.goto("/app/ajustes/pessoas");
  const campo = page.getByPlaceholder("@fulano ou nome");
  await campo.fill("@oculta");
  await expect(page.getByText("Ninguém com esse @ ou nome na Absolute ZRO.")).toBeVisible();
  // Cada projeto (computador, iphone) convida uma pessoa: o HUB falso guarda os convites entre os dois.
  const alvo =
    info.project.name === "iphone"
      ? { busca: "rafa", nome: "Rafael Prado", arroba: "rafa.edita", linha: "Edição, Color · Recife" }
      : { busca: "lu", nome: "Luana Sá", arroba: "lu.som", linha: "Som, Microfonista · Natal" };
  await campo.fill(alvo.busca);
  const ficha = page.getByRole("listitem", { name: `${alvo.nome}, @${alvo.arroba}` });
  await expect(ficha).toBeVisible();
  await expect(ficha).toContainText(alvo.linha);
  await page.getByLabel("Entra como").selectOption("gestor");
  await fotos(page, "pessoas-busca", info.project.name);
  await ficha.getByRole("button", { name: `Convidar @${alvo.arroba}` }).click();
  await expect(page.getByText(`Convite enviado. @${alvo.arroba} aceita na Absolute ZRO.`)).toBeVisible();
  await expect(ficha.getByText("Feito")).toBeVisible();
});

test("Freelas: achar pelo @ adiciona o freela ligado ao perfil", async ({ page, context, baseURL }) => {
  await entrar(context, baseURL!);
  await page.goto("/app/freelas");
  await page.getByText("Achar pelo @ na Absolute ZRO").click();
  await page.getByPlaceholder("@fulano ou nome").fill("@carla");
  const ficha = page.getByRole("listitem", { name: "Carla Nunes, @carla.drone" });
  await expect(ficha).toContainText("Freela no Carro do Freela");
  await ficha.getByRole("button", { name: "Adicionar @carla.drone" }).click();
  await page.waitForURL(/\/app\/freelas\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Carla Nunes");
  await expect(page.getByRole("link", { name: "@carla.drone" })).toBeVisible();
});
