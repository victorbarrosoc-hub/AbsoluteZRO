/**
 * O link do Fluxo com permissão (titular, 04/11/2026; drizzle/0039): na folha "Links do fluxo" a escolha Só ver · Ver
 * e comentar · Editar; "Ver e comentar" aberto de fora (sem conta, no iPhone e no computador): só o nome, comentar um
 * item e o fluxo todo, o nome lembrado no aparelho; a equipe vê os comentários no editor e apaga; revogado, ninguém
 * comenta. "Só ver" segue sem "Comentar". Organização do Exportar (e2e/preparar.ts). Com SHOTS_DIR, guarda `fcm-*`.
 */
import { readFileSync } from "node:fs";
import { devices, expect, test, type Browser, type Page } from "@playwright/test";

const ARQUIVO = "test-results/e2e-sessao-exportar.json";
const sessao = () => JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string };
const SHOTS = process.env.SHOTS_DIR;
// as capturas com densidade 2
test.use({ deviceScaleFactor: 2 });
const foto = async (page: Page, nome: string) => {
  if (SHOTS) {
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/fcm-${nome}.png` });
  }
};

async function fluxoComNota(page: Page, titulo: string) {
  const h = { Origin: new URL(page.url()).origin };
  const r = await page.request.post("/api/criacao/fluxo", { data: { op: "criar", titulo }, headers: h });
  expect(r.status()).toBe(201);
  const { id } = (await r.json()) as { id: string };
  const s = crypto.randomUUID();
  const ops = [
    { op: "criar_no", id: s, tipo: "secao", x: 0, y: 0, w: 640, h: 380, z: 1, dados: { nome: "Abertura", cor: "pessego" } },
    { op: "criar_no", tipo: "nota", x: 30, y: 70, w: 240, h: 120, z: 2, secaoId: s, dados: { texto: "Abre no rosto, luz da janela.", cor: "amarelo" } },
    { op: "criar_no", tipo: "nota", x: 320, y: 70, w: 240, h: 120, z: 3, secaoId: s, dados: { texto: "Trilha sobe no corte.", cor: "rosa" } },
  ];
  expect((await page.request.post("/api/criacao/fluxo", { data: { op: "ops", id, ops }, headers: h })).status()).toBe(200);
  return id;
}

/** Cria o link pela folha "Links do fluxo" com a permissão escolhida; devolve o endereço. */
async function criarLink(page: Page, permissao: "Só ver" | "Ver e comentar" | "Editar", nome: string) {
  await page.locator(".fx-privado:not(.fxc-botao)").click();
  const folha = page.getByRole("dialog", { name: "Links do fluxo" });
  const grupo = folha.getByRole("radiogroup", { name: "Permissão" });
  await expect(grupo.getByRole("radio")).toHaveText(["Só ver", "Ver e comentar", "Editar"]);
  await expect(grupo.getByRole("radio", { name: "Só ver" })).toHaveAttribute("aria-checked", "true");
  await grupo.getByRole("radio", { name: permissao }).click();
  await foto(page, nome);
  await folha.getByRole("button", { name: "Criar link" }).click();
  const url = await folha.locator(".fx-links__url").inputValue();
  expect(url).toMatch(/\/f\/[A-Za-z0-9_-]{43}$/);
  await folha.getByRole("button", { name: "Outro link" }).click();
  await page.keyboard.press("Escape");
  await expect(folha).toHaveCount(0);
  return url;
}

async function visitante(browser: Browser, celular: boolean) {
  const ctx = await browser.newContext(
    celular ? { ...devices["iPhone 15 Pro"], deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  );
  return { ctx, page: await ctx.newPage() };
}

test.describe("Link do Fluxo com permissão", () => {
  test.beforeEach(async ({ context, baseURL }, info) => {
    test.skip(info.project.name !== "computador", "a equipe no computador; quem abre no iPhone e no computador");
    await context.addCookies([{ name: "mae_sessao", value: sessao().token, url: baseURL! }]);
  });

  test("Ver e comentar: só o nome, comentar um item e o fluxo; a equipe vê e apaga; revogado, não comenta", async ({ page, browser }) => {
    await page.goto("/app/criacao/fluxos");
    const id = await fluxoComNota(page, "Teaser da padaria");
    await page.goto(`/app/criacao/fluxos/${id}`);
    await expect(page.locator(".fx-plano [data-no]")).toHaveCount(3);
    const url = await criarLink(page, "Ver e comentar", "permissao-desktop");
    await expect(page.getByRole("button", { name: /Comentários/ })).toHaveCount(0);

    // quem abre, no iPhone e sem conta
    const v = await visitante(browser, true);
    await v.page.goto(url);
    await expect(v.page.getByText(/Comentários abertos/)).toBeVisible();
    const item = v.page.locator(".fxc-no").first();
    await item.getByRole("button", { name: "Comentar" }).click();
    const form = item.getByRole("form", { name: "Comentar este item" });
    await expect(form.getByPlaceholder("Seu nome")).toBeVisible();
    await form.getByPlaceholder("Seu nome").fill("Ana da Padaria");
    await form.getByPlaceholder("Escreva um comentário").fill("Amei a luz.\nDá para abrir mais quente?");
    await foto(v.page, "comentar-iphone");
    await form.getByRole("button", { name: "Comentar" }).click();
    await expect(item.locator(".fxc-lista")).toContainText("Ana da Padaria");
    await expect(item.locator(".fxc-lista")).toContainText("Dá para abrir mais quente?");
    await foto(v.page, "comentado-iphone");

    // o nome fica no aparelho: depois de recarregar, "Como Ana da Padaria"
    await v.page.reload();
    const geral = v.page.getByRole("form", { name: "Comentar o fluxo" });
    await expect(geral.getByText("Como")).toContainText("Ana da Padaria");
    await expect(geral.getByPlaceholder("Seu nome")).toHaveCount(0);
    await geral.getByPlaceholder("Escreva um comentário").fill("No geral, aprovado.");
    await geral.getByRole("button", { name: "Comentar" }).click();
    await expect(v.page.getByRole("region", { name: "Comentários do fluxo" }).locator(".fxc-lista")).toContainText("No geral, aprovado.");
    await expect(v.page.locator(".fxc-no").first().getByRole("button", { name: "Comentar (1)" })).toBeVisible();

    // no computador, também sem conta
    const d = await visitante(browser, false);
    await d.page.goto(url);
    await expect(d.page.locator(".fxc-lista")).toHaveCount(2);
    await foto(d.page, "link-desktop");
    await d.ctx.close();

    // a equipe vê no editor e apaga
    await page.reload();
    const botao = page.getByRole("button", { name: "Comentários (2)" });
    await expect(botao).toBeVisible();
    await botao.click();
    const folha = page.getByRole("dialog", { name: "Comentários" });
    await expect(folha.getByRole("list", { name: "Comentários do link" }).locator("> li")).toHaveCount(2);
    await expect(folha).toContainText("Ana da Padaria");
    await expect(folha.getByRole("button", { name: /Abre no rosto/ })).toBeVisible();
    await foto(page, "equipe-desktop");
    await folha.locator("li", { hasText: "No geral, aprovado." }).getByRole("button", { name: "Apagar" }).click();
    await expect(folha.getByRole("list", { name: "Comentários do link" }).locator("> li")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Comentários (1)" })).toBeVisible();

    // revogado: ninguém comenta mais (e a página vira a tela neutra)
    await page.locator(".fx-privado:not(.fxc-botao)").click();
    const links = page.getByRole("dialog", { name: "Links do fluxo" });
    await links.getByRole("button", { name: "Revogar" }).click();
    await links.getByRole("button", { name: "Revogar" }).click();
    await expect(links.getByRole("list", { name: "Links ativos" })).toHaveCount(0);
    await v.page.getByRole("form", { name: "Comentar o fluxo" }).getByPlaceholder("Escreva um comentário").fill("Depois de revogado");
    await v.page.getByRole("form", { name: "Comentar o fluxo" }).getByRole("button", { name: "Comentar" }).click();
    await expect(v.page.locator(".fxc-erro")).toHaveText("Este link não está mais ativo.");
    await v.page.reload();
    await expect(v.page.locator(".fxc-no")).toHaveCount(0);
    await v.ctx.close();
  });

  test("Só ver: sem Comentar; Editar sem conta: só lê, com Entrar para editar", async ({ page, browser }) => {
    await page.goto("/app/criacao/fluxos");
    const id = await fluxoComNota(page, "Só para ver");
    await page.goto(`/app/criacao/fluxos/${id}`);
    const ver = await criarLink(page, "Só ver", "permissao-ver");
    const editar = await criarLink(page, "Editar", "permissao-editar");
    const v = await visitante(browser, true);
    await v.page.goto(ver);
    await expect(v.page.getByText(/Só leitura/)).toBeVisible();
    await expect(v.page.getByRole("button", { name: "Comentar" })).toHaveCount(0);
    await v.page.goto(editar);
    await expect(v.page.getByText(/Só leitura/)).toBeVisible();
    await expect(v.page.getByRole("link", { name: "Entrar para editar" })).toBeVisible();
    await expect(v.page.getByRole("link", { name: "Editar no Maestro" })).toHaveCount(0);
    await foto(v.page, "editar-sem-conta-iphone");
    await v.ctx.close();
    // quem é da produtora (a sessão da equipe) abre o mesmo link e vai para o editor
    await page.goto(editar);
    const ir = page.getByRole("link", { name: "Editar no Maestro" });
    await expect(ir).toHaveAttribute("href", `/app/criacao/fluxos/${id}`);
    await expect(page.getByText(/Você edita no Maestro/)).toBeVisible();
  });
});
