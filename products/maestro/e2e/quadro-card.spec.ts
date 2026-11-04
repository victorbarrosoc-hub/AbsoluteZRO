/**
 * O card do Quadro (titular, 03/11/2026): o próximo passo ("Mandar para revisão") nunca cobre o prazo nem o
 * responsável, no computador (com o mouse por cima) e no iPhone; "Duplicar" copia os campos principais para a mesma
 * coluna, com "(cópia)" no título; "Copiar link" dá o endereço interno do card (`/app/quadro?card=`), que abre a ficha
 * para quem tem acesso e nada para quem não tem. Quem só lê copia o link e não duplica. Organização do Fluxo
 * (e2e/preparar.ts). Com SHOTS_DIR, guarda `qc-*`.
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const sessao = () => JSON.parse(readFileSync("test-results/e2e-sessao-fluxo.json", "utf8")) as { token: string; leitura: string };
const outraOrg = () => JSON.parse(readFileSync("test-results/e2e-sessao.json", "utf8")) as { token: string };
const SHOTS = process.env.SHOTS_DIR;

const amanha = () => {
  const d = new Date(Date.now() + 86_400_000);
  return d.toISOString().slice(0, 10);
};

async function entrar(context: BrowserContext, baseURL: string, token: string) {
  await context.clearCookies();
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
}

/** Um card em Fazendo (o passo é "Mandar para revisão"), com prazo, responsável, prioridade e briefing. */
async function cardEmFazendo(page: Page, tema: string) {
  const origem = new URL(page.url()).origin;
  const q = (await (await page.request.get("/api/quadro")).json()) as { pessoas: { sub: string }[] };
  const id = `c${Date.now().toString(36)}e2e${Math.random().toString(36).slice(2, 6)}`;
  const r = await page.request.post("/api/quadro", {
    data: {
      op: "criar",
      id,
      dados: {
        tema,
        coluna: "fazendo",
        prazo: amanha(),
        resp: q.pessoas[0]?.sub,
        prioridade: "alta",
        briefing: "Abertura com a xícara, luz da manhã.",
        previsto: 120,
      },
    },
    headers: { Origin: origem },
  });
  expect(r.ok()).toBe(true);
  return id;
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

const cruza = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe.configure({ mode: "serial" });

test.describe("O card do Quadro", () => {
  test.beforeEach(async ({ context, baseURL }, info) => {
    test.skip(!["computador", "iphone"].includes(info.project.name), "computador e iPhone (Chromium)");
    await entrar(context, baseURL!, sessao().token);
  });

  test("o próximo passo não cobre o prazo nem o responsável", async ({ page }, info) => {
    await page.goto("/app/quadro");
    const id = await cardEmFazendo(page, "Teaser do café");
    await page.goto("/app/quadro");
    await verColuna(page, "fazendo", info.project.name);
    const card = page.locator(`.q-card[data-card="${id}"]`);
    await expect(card).toBeVisible();
    if (info.project.name === "computador") await card.hover();
    const passo = card.locator(".q-card__passo");
    await expect(passo).toHaveText(/Mandar para revisão/);
    await expect(passo).toHaveCSS("opacity", "1");
    if (SHOTS) await card.screenshot({ path: `${SHOTS}/qc-passo-${info.project.name}.png` });
    const bp = (await passo.boundingBox())!;
    const infos = card.locator(".q-card__meta > *");
    expect(await infos.count()).toBeGreaterThanOrEqual(2);
    for (const b of await infos.all()) {
      const bb = await b.boundingBox();
      if (bb) expect(cruza(bp, bb), `o passo cobre ${await b.getAttribute("class")}`).toBe(false);
    }
    // o passo fica dentro do card
    const bc = (await card.boundingBox())!;
    expect(bp.y + bp.height).toBeLessThanOrEqual(bc.y + bc.height + 0.5);
  });

  test("Duplicar copia os campos para a mesma coluna; Copiar link abre o card", async ({ page, context, baseURL }, info) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL! });
    await page.goto("/app/quadro");
    const tema = `Reels da padaria ${info.project.name}`;
    const id = await cardEmFazendo(page, tema);
    await page.goto(`/app/quadro?card=${id}`);
    const ficha = page.getByRole("dialog", { name: `Card: ${tema}` });
    await expect(ficha).toBeVisible();

    // copiar o link interno
    await ficha.getByRole("button", { name: "Copiar link" }).click();
    await expect(page.locator(".q-aviso")).toContainText("Link copiado");
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toBe(`${new URL(page.url()).origin}/app/quadro?card=${id}`);

    // duplicar: nasce na mesma coluna, logo depois, com "(cópia)"; a ficha da cópia abre
    await ficha.getByRole("button", { name: "Duplicar" }).click();
    const copia = page.getByRole("dialog", { name: `Card: ${tema} (cópia)` });
    await expect(copia).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/qc-duplicado-${info.project.name}.png` });
    const todos = (await (await page.request.get("/api/quadro")).json()) as { cards: { id: string; dados: Record<string, unknown> }[] };
    const original = todos.cards.find((c) => c.id === id)!;
    const novo = todos.cards.find((c) => c.dados.tema === `${tema} (cópia)`)!;
    expect(novo).toBeTruthy();
    expect(novo.id).not.toBe(id);
    for (const k of ["coluna", "prazo", "resp", "prioridade", "briefing", "previsto"]) expect(novo.dados[k], k).toEqual(original.dados[k]);
    // logo depois do original (empate na ordem: o número mais novo vem depois)
    expect(Number(novo.dados.ordem)).toBeGreaterThanOrEqual(Number(original.dados.ordem ?? 0));
    expect(novo.dados.capa).toBeUndefined();

    // o link abre a ficha do card certo
    await page.goto(link);
    await expect(page.getByRole("dialog", { name: `Card: ${tema}` })).toBeVisible();

    // quem só lê: copia o link, não duplica
    await entrar(context, baseURL!, sessao().leitura);
    await page.goto(link);
    const lendo = page.getByRole("dialog", { name: `Card: ${tema}` });
    await expect(lendo).toBeVisible();
    await expect(lendo.getByRole("button", { name: "Copiar link" })).toBeVisible();
    await expect(lendo.getByRole("button", { name: "Duplicar" })).toHaveCount(0);

    // de outra organização o mesmo link não abre nada (e nada diz que o card existe)
    await entrar(context, baseURL!, outraOrg().token);
    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Quadro");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
