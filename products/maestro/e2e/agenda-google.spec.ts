/**
 * Google Agenda pelas Conexões da Absolute ZRO (ADR 0026 do HUB, drizzle/0021), contra a Agenda da ponte falsa
 * (tests/ponte-falsa.mts, controlada por /__agenda): Ajustes → Agenda conectada, ligar o envio (a diária e o prazo vão
 * para o "Google"), o "Ocupado no Google" ao marcar uma diária e o estado sem conexão. Com SHOTS_DIR, guarda as capturas.
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const SHOTS = process.env.SHOTS_DIR;
const ARQUIVO_SESSAO_AGENDA = "test-results/e2e-sessao-agenda.json";
const PONTE = `http://127.0.0.1:${Number(process.env.E2E_PONTE_PORT || 3219)}`;

async function entrar(context: BrowserContext, baseURL: string, tema = "light") {
  const { token } = JSON.parse(readFileSync(ARQUIVO_SESSAO_AGENDA, "utf8")) as { token: string };
  await context.addCookies([
    { name: "mae_sessao", value: token, url: baseURL },
    { name: "zro_theme", value: tema, url: baseURL },
  ]);
}

async function agenda(page: Page, mudar?: Record<string, unknown>) {
  const r = await page.request.fetch(`${PONTE}/__agenda`, mudar ? { method: "POST", data: mudar } : { method: "GET" });
  return (await r.json()) as { eventos: Record<string, { titulo: string; inicio?: string; dia?: string }> };
}

async function fotos(page: Page, context: BrowserContext, baseURL: string, nome: string, projeto: string) {
  if (!SHOTS) return;
  for (const tema of ["light", "dark"]) {
    await context.addCookies([{ name: "zro_theme", value: tema, url: baseURL }]);
    await page.reload();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: `${SHOTS}/maestro-${nome}-${tema === "light" ? "claro" : "escuro"}-${projeto === "iphone" ? "celular" : "computador"}.png`,
      fullPage: false,
    });
  }
  await context.addCookies([{ name: "zro_theme", value: "light", url: baseURL }]);
}

test.describe("Google Agenda pelas Conexões", () => {
  test.beforeEach(async ({ page }) => {
    await agenda(page, { conectada: true, appLigado: true, falhar: false, ocupado: [{ inicio: "2026-11-24T12:00:00.000Z", fim: "2026-11-24T14:00:00.000Z" }] });
  });

  test("Ajustes → Agenda: conectada, ligar manda a diária e o prazo; sem conexão leva às Conexões", async ({ page, context, baseURL }, info) => {
    await entrar(context, baseURL!);
    await page.goto("/app/ajustes/agenda");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Agenda");
    const ficha = page.getByRole("region", { name: "Google Agenda" });
    await expect(ficha).toContainText("Conectada · equipe@produtora.test");
    const ligar = ficha.getByLabel(/Enviar para o Google/);
    if (!(await ligar.isChecked())) await ligar.check();
    await ficha.getByRole("button", { name: "Salvar" }).click();
    await expect(ficha.getByText(/Ligado\. Indo para o Google\.|Desligado/)).toBeVisible();
    await expect
      .poll(
        async () =>
          Object.values((await agenda(page)).eventos)
            .map((e) => e.titulo)
            .sort(),
        { timeout: 15_000 },
      )
      .toEqual(["Diária: Campanha verão", "Prazo: Reels de lançamento"]);
    const ev = Object.values((await agenda(page)).eventos).find((e) => e.titulo.startsWith("Diária"))!;
    expect(ev.inicio).toBe("2026-11-24T08:00:00-03:00");
    await page.reload();
    await expect(ficha.getByRole("button", { name: "Sincronizar agora" })).toBeVisible();
    await ficha.getByRole("button", { name: "Sincronizar agora" }).click();
    await expect(ficha.getByText("Tudo em dia.")).toBeVisible();
    await fotos(page, context, baseURL!, "ajustes-agenda-conectada", info.project.name);

    await agenda(page, { conectada: false });
    await page.reload();
    await expect(ficha).toContainText("Não conectada");
    await expect(ficha.getByRole("link", { name: /Abrir Conexões/ })).toHaveAttribute("href", `${PONTE}/conexoes`);
    await fotos(page, context, baseURL!, "ajustes-agenda-sem-conexao", info.project.name);
  });

  test("marcar diária: o Ocupado no Google segue a data do formulário", async ({ page, context, baseURL }, info) => {
    await entrar(context, baseURL!);
    await page.goto("/app/agenda/novo?data=2026-11-24");
    const ocupado = page.getByRole("region", { name: "Ocupado no Google" });
    await expect(ocupado).toContainText("09:00–11:00");
    await fotos(page, context, baseURL!, "ocupado-no-google", info.project.name);
    await page.locator('form input[name="data"]').fill("2026-11-25");
    await page.locator('form input[name="data"]').dispatchEvent("change");
    await expect(ocupado).toContainText("Livre no Google.");
    await agenda(page, { conectada: false });
    await page.locator('form input[name="data"]').fill("2026-11-24");
    await page.locator('form input[name="data"]').dispatchEvent("change");
    await expect(ocupado).toContainText("Conecte o Google Agenda na sua conta.");
  });
});
