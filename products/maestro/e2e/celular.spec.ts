/**
 * As telas de uso real no iPhone (revisão do titular, 01/11/2026: "pode revisar os outros apps de celular?"), com a
 * demonstração e o tempo fictício da organização do cronômetro: Hoje, Quadro, o card aberto, o cronômetro (pílula
 * flutuante e o painel com Agora, Hoje e Semana), Criação e o editor do Roteiro, Financeiro e o lançamento novo, Tempo,
 * Agenda, Ajustes e Mais. Em 375, 393 e 430 px (o `sem-corte.spec.ts` cobre 375 e 393 em todas as telas; aqui também o
 * 430 do Pro Max):
 * - nada cortado e nenhum campo abaixo de 16 px (o mesmo detector, `e2e/corte.ts`);
 * - todo botão, link e aba com 44 × 44 px de toque (`e2e/toque.ts`; a área pode crescer além do desenho, `celular.css`);
 * - a pílula do cronômetro nunca cobre a barra de baixo, e o painel cabe na tela (com o teclado, `dvh`).
 * E o iPhone deitado (852 × 393): o Quadro mostra os cards antes da metade da tela. Com CELULAR_SHOTS=<pasta>, guarda
 * as capturas do 393 (e do deitado).
 */
import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { achadosDeCorte } from "./corte";
import { alvosPequenos } from "./toque";

const SHOTS = process.env.CELULAR_SHOTS;
const token = () => (JSON.parse(readFileSync("test-results/e2e-sessao-cronometro.json", "utf8")) as { token: string }).token;

type Tela = { nome: string; ir: (page: Page) => Promise<void> };

const ir = (rota: string) => async (page: Page) => {
  await page.goto(rota);
};

const telas: Tela[] = [
  { nome: "hoje", ir: ir("/app/hoje") },
  {
    nome: "quadro",
    ir: async (page) => {
      await page.goto("/app/quadro");
      // começa sem nada rodando (o banco é o mesmo do cronometro.spec.ts)
      await page.request.post("/api/tempo", { data: { op: "pausar" }, headers: { origin: new URL(page.url()).origin } });
      await page.reload();
    },
  },
  {
    nome: "quadro-card",
    ir: async (page) => {
      await page.locator(".q-card__abrir").first().click();
      await page.locator(".q-veu--ficha").waitFor();
    },
  },
  {
    nome: "cronometro-pilula",
    ir: async (page) => {
      await page.keyboard.press("Escape");
      await page.locator(".q-veu--ficha").waitFor({ state: "detached" });
      const aba = page.locator(`.q-abas button[data-col="fazendo"]`);
      await expect(async () => {
        if ((await aba.getAttribute("aria-pressed")) !== "true") await aba.click();
        await expect(aba).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
      }).toPass();
      await page.locator(`.q-col[data-col="fazendo"] .q-card .tp-play`).first().click();
      await page.locator(".tp-pilula").waitFor();
    },
  },
  {
    nome: "cronometro-painel",
    ir: async (page) => {
      await page.locator(".tp-pilula__abrir").click();
      await page.locator(".tp-painel").waitFor();
    },
  },
  {
    nome: "cronometro-painel-hoje",
    ir: async (page) => {
      await page.locator(".tp-painel").getByRole("tab", { name: "Hoje" }).click();
      await page.locator(".tp-painel .tp-dias button").first().waitFor();
    },
  },
  {
    nome: "cronometro-painel-semana",
    ir: async (page) => {
      await page.locator(".tp-painel").getByRole("tab", { name: "Semana" }).click();
      await page.locator(".tp-painel .tp-barra").first().waitFor();
    },
  },
  { nome: "criacao", ir: ir("/app/criacao") },
  {
    nome: "roteiro",
    ir: async (page) => {
      await page.locator("a[href*='/app/criacao/roteiros/']").first().click();
      await page.waitForURL(/\/app\/criacao\/roteiros\//);
      await page.locator(".cr-bloco").first().waitFor();
    },
  },
  {
    // o "+" do Roteiro (acima da pílula) abre a folha de adicionar bloco
    nome: "roteiro-adicionar",
    ir: async (page) => {
      await page.locator(".cr-fab").click();
      await page.getByRole("dialog").waitFor();
    },
  },
  { nome: "fluxos", ir: ir("/app/criacao/fluxos") },
  { nome: "financeiro", ir: ir("/app/financeiro") },
  { nome: "financeiro-novo", ir: ir("/app/financeiro/novo") },
  { nome: "tempo", ir: ir("/app/tempo") },
  { nome: "agenda", ir: ir("/app/agenda") },
  { nome: "ajustes", ir: ir("/app/ajustes") },
  { nome: "mais", ir: ir("/app/mais") },
];

async function assentar(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  await page.evaluate(() =>
    Promise.race([
      Promise.all([
        document.fonts.ready,
        ...document
          .getAnimations()
          .filter((a) => a.timeline === document.timeline && Number(a.effect?.getComputedTiming().endTime) <= 2000)
          .map((a) => a.finished.catch(() => {})),
      ]),
      new Promise((ok) => setTimeout(ok, 3000)),
    ]),
  );
  await page.waitForTimeout(150);
}

/** A pílula flutua acima da barra de baixo e dentro da tela; o painel cabe inteiro na altura visível. */
async function cronometroNoLugar(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const a: string[] = [];
    const pilula = document.querySelector(".tp-pilula");
    const barra = document.querySelector(".barra");
    if (pilula && barra && getComputedStyle(barra).display !== "none") {
      const p = pilula.getBoundingClientRect();
      const b = barra.getBoundingClientRect();
      if (p.bottom > b.top + 1) a.push(`a pílula cobre a barra (${Math.round(p.bottom)} > ${Math.round(b.top)})`);
      if (p.left < 0 || p.right > innerWidth) a.push("a pílula passa da tela");
    }
    // nada que flutua no rodapé fica por baixo da pílula (o "+" do Roteiro e do Fluxo, os controles do Fluxo)
    if (pilula)
      for (const el of Array.from(document.querySelectorAll(".cr-fab, .fx-mais, .fx-pe, .lx-aviso"))) {
        const p = pilula.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        if (r.width < 2 || getComputedStyle(el).display === "none") continue;
        const x = Math.min(p.right, r.right) - Math.max(p.left, r.left);
        const y = Math.min(p.bottom, r.bottom) - Math.max(p.top, r.top);
        if (x > 0 && y > 0) a.push(`a pílula cobre ${el.className.split(" ")[0]}`);
      }
    const painel = document.querySelector(".tp-painel");
    if (painel) {
      const r = painel.getBoundingClientRect();
      const alto = window.visualViewport?.height ?? innerHeight;
      if (r.top < -1 || r.bottom > alto + 1) a.push(`o painel não cabe na tela (${Math.round(r.top)}–${Math.round(r.bottom)} de ${Math.round(alto)})`);
    }
    return a;
  });
}

for (const largura of [375, 393, 430]) {
  test(`iPhone de ${largura} px: sem corte, campos de 16 px, toque de 44 px e o cronômetro no lugar`, async ({ page, context, baseURL }, info) => {
    test.skip(info.project.name === "computador", "é o celular");
    test.setTimeout(240_000);
    await page.setViewportSize({ width: largura, height: largura === 375 ? 667 : largura === 393 ? 852 : 932 });
    await context.addCookies([
      { name: "mae_sessao", value: token(), url: baseURL! },
      { name: "zro_theme", value: "light", url: baseURL! },
    ]);
    const achados: string[] = [];
    for (const t of telas) {
      await t.ir(page);
      await assentar(page);
      for (const x of await achadosDeCorte(page)) achados.push(`${t.nome}: ${x}`);
      for (const x of await alvosPequenos(page)) achados.push(`${t.nome}: ${x}`);
      for (const x of await cronometroNoLugar(page)) achados.push(`${t.nome}: ${x}`);
      if (SHOTS && largura === 393) {
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: `${SHOTS}/${t.nome}-${info.project.name}.png` });
      }
    }
    await page.request.post("/api/tempo", { data: { op: "pausar" }, headers: { origin: baseURL! } });
    expect(achados, achados.join("\n")).toEqual([]);
  });
}

test("iPhone deitado: o Quadro mostra os cards antes da metade da tela, sem rolar de lado e com toque de 44 px", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name === "computador", "é o celular");
  await page.setViewportSize({ width: 852, height: 393 });
  await context.addCookies([
    { name: "mae_sessao", value: token(), url: baseURL! },
    { name: "zro_theme", value: "light", url: baseURL! },
  ]);
  for (const rota of ["/app/hoje", "/app/quadro"]) {
    await page.goto(rota);
    await assentar(page);
    // deitado o Quadro é o do computador (as colunas rolam de lado dentro dele); a página, nunca
    expect(await page.evaluate(() => document.documentElement.scrollWidth), rota).toBeLessThanOrEqual(852);
    expect(await alvosPequenos(page), rota).toEqual([]);
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/quadro-deitado-${info.project.name}.png` });
  const topo = await page
    .locator(".q-card")
    .first()
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(topo).toBeLessThan(393 / 2);
});
