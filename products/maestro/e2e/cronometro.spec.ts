/**
 * O cronômetro de tarefas (drizzle/0038, pedido do titular 31/10/2026, inspirado no Ritto). Com a demonstração e tempo
 * fictício (e2e/semente-cronometro.ts): o play no card (um rodando por vez, o anterior pausa), a pílula em toda tela e
 * o título da aba, o painel (Livre, Pomodoro, Hoje, Semana), Ajustar, o parado ("Descartar"), a ficha com tipo de
 * vídeo, previsto e a sugestão do típico, e a tela "Tempo" por tipo. Computador e iPhone. `SHOTS_DIR` guarda `tp-*`
 * nos dois temas; `TP_VIDEO=<pasta>` grava o passeio play → pílula → painel.
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ARQUIVO = "test-results/e2e-sessao-cronometro.json";
const SHOTS = process.env.SHOTS_DIR;
const VIDEO = process.env.TP_VIDEO;
const sessao = () => JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string; equipe: string; org: string };

async function entrar(context: BrowserContext, baseURL: string, token: string, tema: "claro" | "escuro" = "claro") {
  await context.addCookies([
    { name: "mae_sessao", value: token, url: baseURL },
    { name: "zro_theme", value: tema === "escuro" ? "dark" : "light", url: baseURL },
  ]);
}

/** Começa sem nada rodando (o banco é o mesmo entre os testes). */
async function zerarEstado(page: Page, baseURL: string) {
  await page.request.post("/api/tempo", { data: { op: "pausar" }, headers: { origin: baseURL } });
  await page.evaluate(() => {
    try {
      localStorage.removeItem("mae:pomodoro:v1");
      localStorage.removeItem("mae:cronometro:canto");
    } catch {}
  });
}

async function verColuna(page: Page, col: string, projeto: string) {
  if (projeto === "computador") return;
  const aba = page.locator(`.q-abas button[data-col="${col}"]`);
  await expect(async () => {
    if ((await aba.getAttribute("aria-pressed")) !== "true") await aba.click();
    await expect(aba).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  }).toPass();
}

/** O play de um card da coluna (no computador ele aparece no gesto). */
async function play(page: Page, col: string, n: number, projeto: string) {
  const card = page.locator(`.q-col[data-col="${col}"] .q-card`).nth(n);
  if (projeto === "computador") await card.hover();
  const botao = card.locator(".tp-play");
  await botao.click();
  return { card, botao, tema: (await card.locator(".q-card__tema").innerText()).trim() };
}

const foto = async (page: Page, nome: string, projeto: string, tema: string) => {
  if (!SHOTS) return;
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${SHOTS}/tp-${projeto}-${tema}-${nome}.png`, animations: "disabled" });
};

test.describe.configure({ mode: "serial" });

for (const tema of ["claro", "escuro"] as const) {
  test.describe(`cronômetro (${tema})`, () => {
    test("play no card → pílula → painel, um rodando por vez, título da aba", async ({ page, context, baseURL }, info) => {
      const p = info.project.name;
      await entrar(context, baseURL!, sessao().token, tema);
      await page.goto("/app/quadro");
      await zerarEstado(page, baseURL!);
      await page.reload();
      await verColuna(page, "fazendo", p);
      const a = await play(page, "fazendo", 0, p);
      await expect(a.botao).toHaveAttribute("aria-pressed", "true");
      const pilula = page.locator(".tp-pilula");
      await expect(pilula).toBeVisible();
      await expect(pilula.locator(".tp-pilula__tema")).toHaveText(a.tema);
      await expect.poll(() => page.title()).toMatch(/^▶ \d{2}:\d{2} · /);
      // outro card: o primeiro pausa sozinho e a pílula troca de tarefa
      const b = await play(page, "fazendo", 1, p);
      await expect(b.botao).toHaveAttribute("aria-pressed", "true");
      await expect(a.botao).toHaveAttribute("aria-pressed", "false");
      await expect(pilula.locator(".tp-pilula__tema")).toHaveText(b.tema);
      // o servidor guardou um só rodando
      const est = await (await page.request.get("/api/tempo")).json();
      expect(est.rodando.card).toBeTruthy();
      expect(est.hoje.filter((r: { fim: string | null }) => !r.fim)).toHaveLength(1);
      await page.mouse.move(5, 5);
      await foto(page, "quadro-rodando", p, tema);

      // a pílula abre o painel no Agora, com o cronômetro grande
      await pilula.locator(".tp-pilula__abrir").click();
      const painel = page.locator(".tp-painel");
      await expect(painel).toBeVisible();
      await expect(painel.locator(".tp-agora__tarefa strong")).toHaveText(b.tema);
      await expect(painel.locator(".tp-grande__num")).toHaveText(/\d{2}:\d{2}:\d{2}/);
      await foto(page, "painel-livre", p, tema);

      // Pomodoro: contagem de 25:00 para baixo
      await painel.getByRole("radio", { name: "Pomodoro" }).click();
      await expect(painel.locator(".tp-grande__num")).toHaveText(/^2[45]:\d{2}$/);
      await expect(painel.locator(".tp-ciclos i")).toHaveCount(4);
      await foto(page, "painel-pomodoro", p, tema);
      await painel.getByRole("radio", { name: "Livre" }).click();

      // Hoje: os cards em que trabalhou, com o seletor de dias
      await painel.getByRole("tab", { name: "Hoje" }).click();
      await expect(painel.locator(".tp-dias button")).toHaveCount(7);
      await expect(painel.locator(".tp-lista .tp-linha").first()).toBeVisible();
      await foto(page, "painel-hoje", p, tema);

      // Semana: total, barras por dia, por cliente e por tipo
      await painel.getByRole("tab", { name: "Semana" }).click();
      await expect(painel.locator(".tp-barra")).toHaveCount(7);
      await expect(painel.locator(".tp-fatias").first()).toBeVisible();
      await expect(painel.locator(".tp-resumo__total strong")).toHaveText(/\d/);
      await foto(page, "painel-semana", p, tema);
      if (p === "computador") {
        // o time (administração): o seletor Eu/Time
        await painel.getByRole("radio", { name: "Time" }).click();
        await expect(painel.locator(".tp-resumo")).not.toHaveAttribute("aria-busy", "true");
      }

      // ⌥T / Alt+T fecha e abre; Esc fecha
      await page.keyboard.press("Escape");
      await expect(painel).toBeHidden();
      if (p === "computador") {
        await page.keyboard.press("Alt+KeyT");
        await expect(painel).toBeVisible();
        // espaço com o painel em foco pausa
        await painel.focus();
        await page.keyboard.press("Space");
        await expect(page.locator(".tp-botao").first()).not.toHaveAttribute("data-rodando", "");
        await page.keyboard.press("Alt+KeyT");
        await expect(painel).toBeHidden();
      }
    });

    test("Ajustar: somar tempo com motivo; Zerar com Desfazer", async ({ page, context, baseURL }, info) => {
      const p = info.project.name;
      await entrar(context, baseURL!, sessao().token, tema);
      await page.goto("/app/quadro");
      await zerarEstado(page, baseURL!);
      await page.reload();
      await verColuna(page, "fazendo", p);
      await play(page, "fazendo", 2, p);
      await page.locator(".tp-pilula__abrir").click();
      const painel = page.locator(".tp-painel");
      await painel.getByRole("button", { name: "Ajustar" }).click();
      const folha = page.locator(".tp-ajustar");
      await expect(folha).toBeVisible();
      await folha.getByRole("radio", { name: "+30min" }).click();
      await folha.getByRole("button", { name: /^Somar/ }).click();
      await expect(folha.locator(".tp-motivo")).toHaveAttribute("aria-invalid", "true");
      await folha.locator(".tp-motivo").fill("Esqueci de ligar na captação");
      await foto(page, "ajustar", p, tema);
      await folha.getByRole("button", { name: /^Somar/ }).click();
      await expect(page.locator(".tp-aviso")).toHaveText(/Tempo somado/);
      await expect(folha.locator(".tp-sessoes li")).not.toHaveCount(0);
      await folha.getByRole("button", { name: "Pronto" }).click();
      // Zerar pede confirmação e tem Desfazer
      await painel.getByRole("button", { name: "Zerar" }).click();
      await painel.getByRole("button", { name: "Zerar mesmo?" }).click();
      await expect(page.locator(".tp-aviso")).toHaveText(/zerado/);
      await page.locator(".tp-aviso").getByRole("button", { name: "Desfazer" }).click();
      await expect(painel.locator(".tp-grande__num")).not.toHaveText("00:00:00");
    });

    test("parado: ao voltar pergunta e descarta o tempo parado", async ({ page, context, baseURL }, info) => {
      const p = info.project.name;
      await entrar(context, baseURL!, sessao().token, tema);
      await page.clock.install();
      await page.goto("/app/quadro");
      await zerarEstado(page, baseURL!);
      await page.reload();
      await verColuna(page, "fazendo", p);
      await play(page, "fazendo", 0, p);
      await expect(page.locator(".tp-pilula")).toBeVisible();
      await page.waitForTimeout(600);
      // 12 minutos sem mexer em nada (o poll do estado fica de fora: o relógio falso só anda na aba, e o desvio
      // calculado com o relógio de verdade do servidor desfaria o salto)
      await page.route("**/api/tempo", (r) => (r.request().method() === "GET" ? r.abort() : r.continue()));
      await page.clock.fastForward("12:30");
      await page.mouse.move(200, 300);
      await page.mouse.move(220, 320);
      const pergunta = page.locator(".tp-parado");
      await expect(pergunta).toBeVisible();
      await expect(pergunta).toContainText(/Parado 1[23]min/);
      await foto(page, "parado", p, tema);
      await page.unroute("**/api/tempo");
      await pergunta.getByRole("button", { name: /Descartar/ }).click();
      await expect(pergunta).toBeHidden();
      await expect(page.locator(".tp-pilula")).toBeVisible();
    });

    test("ficha: tipo de vídeo, previsto e a sugestão do típico", async ({ page, context, baseURL }, info) => {
      const p = info.project.name;
      await entrar(context, baseURL!, sessao().token, tema);
      await page.goto("/app/quadro");
      await verColuna(page, "fazendo", p);
      await page.locator('.q-col[data-col="fazendo"] .q-card .q-card__abrir').first().click();
      const ficha = page.locator(".q-ficha");
      const bloco = ficha.locator(".tp-ficha");
      await expect(bloco).toBeVisible();
      // sem previsto e com o tipo Reels: a sugestão do típico aparece
      await bloco.locator('input[data-campo="previsto"]').fill("");
      await bloco.locator('input[data-campo="previsto"]').blur();
      await bloco.locator('select[data-campo="tipo"]').selectOption({ label: "Reels" });
      await expect(bloco.locator(".tp-sugestao")).toContainText(/Reels costuma levar ~\dh\d{2}/);
      await bloco.locator(".tp-sugestao").getByRole("button", { name: "Usar" }).click();
      await expect(bloco.locator('input[data-campo="previsto"]')).toHaveValue(/\dh\d{2}|\dh/);
      await bloco.scrollIntoViewIfNeeded();
      await foto(page, "ficha", p, tema);
    });

    test("tela Tempo: média, faixa típica e tendência por tipo", async ({ page, context, baseURL }, info) => {
      const p = info.project.name;
      await entrar(context, baseURL!, sessao().token, tema);
      await page.goto("/app/tempo");
      const cartoes = page.locator(".tp-cartao");
      await expect(cartoes.first()).toBeVisible();
      expect(await cartoes.count()).toBeGreaterThanOrEqual(5);
      const reels = cartoes.filter({ hasText: "Reels" }).first();
      await expect(reels.locator(".tp-cartao__media strong")).toHaveText(/\dh\d{2}|\dh/);
      await expect(reels.locator(".tp-cartao__faixa")).toContainText("mediana");
      await expect(reels.locator(".tp-tendencia__barra").first()).toBeAttached();
      await foto(page, "tempo-tipos", p, tema);
      // filtros: 12 meses agrupa por mês; um cliente sem vídeo mostra o vazio
      await page.getByRole("radio", { name: "12 meses" }).click();
      await expect(reels.locator(".tp-cartao__fim")).toContainText("por mês");
      // a lista de tipos: criar um
      await page.getByRole("button", { name: "Tipos" }).click();
      const folha = page.locator(".tp-editar");
      await folha.getByLabel("Novo tipo").fill(`Vlog ${tema} ${p}`);
      await folha.getByRole("button", { name: "Criar" }).click();
      await expect(folha.locator(`.tp-editar__lista input[value="Vlog ${tema} ${p}"]`)).toHaveCount(1);
      await expect(folha.getByLabel("Novo tipo")).toHaveValue("");
      await foto(page, "tipos-editar", p, tema);
    });
  });
}

test("a equipe vê só o próprio tempo (sem Eu/Time) e cronometra", async ({ page, context, baseURL }, info) => {
  await entrar(context, baseURL!, sessao().equipe);
  await page.goto("/app/tempo");
  await expect(page.locator(".tp-filtro select")).toHaveCount(1);
  const est = await (await page.request.get("/api/tempo")).json();
  expect(est.time).toBe(false);
  expect((await page.request.get("/api/tempo?semana=&quem=time")).status()).toBe(403);
  void info;
});

test("o passeio para o vídeo (TP_VIDEO)", async ({ browser, baseURL }, info) => {
  test.skip(!VIDEO || info.project.name !== "computador", "só com TP_VIDEO, no computador");
  const context = await browser.newContext({ ...info.project.use, recordVideo: { dir: VIDEO!, size: { width: 1440, height: 900 } } });
  await entrar(context, baseURL!, sessao().token);
  const page = await context.newPage();
  await page.goto("/app/quadro");
  await zerarEstado(page, baseURL!);
  await page.reload();
  await page.waitForTimeout(900);
  const card = page.locator('.q-col[data-col="fazendo"] .q-card').first();
  await card.hover();
  await page.waitForTimeout(500);
  await card.locator(".tp-play").click();
  await page.waitForTimeout(1600);
  const outro = page.locator('.q-col[data-col="fazendo"] .q-card').nth(1);
  await outro.hover();
  await page.waitForTimeout(400);
  await outro.locator(".tp-play").click();
  await page.waitForTimeout(1600);
  await page.locator(".tp-pilula__abrir").click();
  await page.waitForTimeout(1800);
  await page.locator(".tp-painel").getByRole("radio", { name: "Pomodoro" }).click();
  await page.waitForTimeout(1300);
  await page.locator(".tp-painel").getByRole("tab", { name: "Semana" }).click();
  await page.waitForTimeout(1800);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  await context.close();
});
