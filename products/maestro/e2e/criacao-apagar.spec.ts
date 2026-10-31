/**
 * Apagar na Criação (components/criacao/lixeira.tsx), organização própria (e2e/preparar.ts):
 * - iPhone (Chromium e WebKit): deslizar o cartão para a esquerda até o fim apaga e "Desfazer" devolve; deslizar até a
 *   metade mostra o "Apagar" vermelho; segurar abre a folha com "Apagar" e a linha do card; de pé é rolagem; nos Fluxos
 *   igual. Toques sintéticos (PointerEvent de toque) nos dois motores; no Chromium também o toque de verdade (CDP).
 * - Computador: o "•••" com o mouse em cima → "Mandar para a lixeira" → "Lixeira · 1" → Restaurar; o botão direito;
 *   "Apagar de vez" com pergunta; o "•••" do editor e do canvas voltam para a lista com o "Apagado · Desfazer".
 * - Leitura não vê nada de apagar; equipe restaura mas não apaga de vez.
 * Com SHOTS_DIR, guarda capturas (`apagar-*-<tema>`; APAGAR_TEMA=dark para o escuro); com APAGAR_VIDEO=1, grava o
 * iPhone no tamanho dele (test-results/…/video.webm), com pausas para se ver; o computador grava com E2E_VIDEO=1.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../playwright.config";

const ARQUIVO = "test-results/e2e-sessao-lixeira.json";
const sessao = () => JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string; equipe: string; leitura: string; org: string };
const SHOTS = process.env.SHOTS_DIR;
const TEMA = process.env.APAGAR_TEMA === "dark" ? "dark" : "light";
const VIDEO = Boolean(process.env.APAGAR_VIDEO);
/** Só no vídeo: um respiro para o movimento se ver. */
const pausa = (page: Page, ms: number) => (VIDEO ? page.waitForTimeout(ms) : Promise.resolve());

const ROTEIROS: [string, string, string | null][] = [
  ["00000000-0000-4000-8000-00000000a001", "Vídeo institucional", "lx-card-1"],
  ["00000000-0000-4000-8000-00000000a002", "Reels da cafeteria", null],
];
const FLUXOS: [string, string][] = [
  ["00000000-0000-4000-8000-00000000b001", "Novo fluxo"],
  ["00000000-0000-4000-8000-00000000b002", "Moodboard do clipe"],
];
const [INSTITUCIONAL, REELS] = ROTEIROS.map((r) => r[0]);
const [NOVO_FLUXO, MOODBOARD] = FLUXOS.map((f) => f[0]);

async function banco<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Cada teste começa igual: dois roteiros (um no card) e dois fluxos, nada na lixeira. */
async function semear() {
  const { org } = sessao();
  await banco(async (sql) => {
    await sql`delete from maestro.roteiros where org_id = ${org}`;
    await sql`delete from maestro.fluxos where org_id = ${org}`;
    for (const [id, titulo, card] of ROTEIROS)
      await sql`insert into maestro.roteiros (id, org_id, titulo, card_id, conteudo) values (${id}, ${org}, ${titulo}, ${card}, '{}'::jsonb)`;
    for (const [id, titulo] of FLUXOS) await sql`insert into maestro.fluxos (id, org_id, titulo) values (${id}, ${org}, ${titulo})`;
  });
}
const naLixeira = (tabela: "roteiros" | "fluxos", id: string) =>
  banco(async (sql) => {
    const [r] = await sql`select apagado_em is not null as lixeira from ${sql(`maestro.${tabela}`)} where id = ${id}`;
    return r ? (r.lixeira as boolean) : "apagado";
  });

async function entrar(page: Page, baseURL: string, token: string, tema = TEMA) {
  await page.context().clearCookies();
  await page.context().addCookies([
    { name: "mae_sessao", value: token, url: baseURL },
    { name: "zro_theme", value: tema, url: baseURL },
  ]);
}

/** A lista hidratada (o cartão marca `data-pronto` ao montar). */
async function abrir(page: Page, rota: string) {
  await page.goto(rota);
  await expect(page.locator("[data-item][data-pronto]").first()).toBeVisible();
}
const cartao = (page: Page, id: string) => page.locator(`[data-item="${id}"]`);

async function foto(page: Page, nome: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(260);
  await page.screenshot({ path: `${SHOTS}/apagar-${nome}-${TEMA}.png` });
}

type Ponto = { x: number; y: number; ms?: number };
/** Um dedo sintético (como no gestos.spec.ts): pointerdown no elemento sob o 1º ponto, move por cada ponto, pointerup. */
async function dedo(page: Page, pontos: Ponto[], { segurar = 0, soltar = true }: { segurar?: number; soltar?: boolean } = {}) {
  await page.evaluate(
    async ({ pontos, segurar, soltar }) => {
      const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const [p0] = pontos;
      const alvo = document.elementFromPoint(p0.x, p0.y)!;
      const ev = (tipo: string, p: { x: number; y: number }) =>
        alvo.dispatchEvent(
          new PointerEvent(tipo, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 51,
            pointerType: "touch",
            isPrimary: true,
            clientX: p.x,
            clientY: p.y,
            button: 0,
            buttons: tipo === "pointerup" ? 0 : 1,
          }),
        );
      ev("pointerdown", p0);
      if (segurar) await espera(segurar);
      for (const p of pontos.slice(1)) {
        ev("pointermove", p);
        await espera(p.ms ?? 16);
      }
      if (soltar) ev("pointerup", pontos[pontos.length - 1]);
    },
    { pontos, segurar, soltar },
  );
}
const linha = (a: Ponto, b: Ponto, n = 12): Ponto[] =>
  Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
async function caixa(page: Page, id: string) {
  const b = (await cartao(page, id).boundingBox())!;
  return { x: b.x, y: b.y, w: b.width, h: b.height, meio: { x: b.x + b.width / 2, y: b.y + b.height / 2 } };
}
const frenteX = (page: Page, id: string) =>
  cartao(page, id)
    .locator(".lx-frente")
    .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);

// o vídeo do iPhone no tamanho dele (o do computador é o E2E_VIDEO do playwright.config.ts)
if (VIDEO) test.use({ video: { mode: "on", size: { width: 393, height: 852 } } });

test.beforeEach(async () => {
  await semear();
});

test.describe("Criação no iPhone: deslizar para apagar", () => {
  test.beforeEach(async ({ page, baseURL }, info) => {
    test.skip(!info.project.name.startsWith("iphone"), "gestos de toque: só no celular");
    await entrar(page, baseURL!, sessao().token);
  });

  test("deslizar até o fim apaga, Desfazer devolve; até a metade mostra o Apagar", async ({ page }, info) => {
    await abrir(page, "/app/criacao");
    await pausa(page, 700);
    const c = await caixa(page, REELS);
    // até a metade: o "Apagar" vermelho fica à mostra
    await dedo(page, linha({ x: c.x + c.w - 30, y: c.meio.y }, { x: c.x + c.w - 30 - 70, y: c.meio.y + 3 }, 8));
    await expect(cartao(page, REELS)).toHaveAttribute("data-deslizando", "");
    await expect.poll(() => frenteX(page, REELS)).toBe(-92);
    await expect(cartao(page, REELS).locator(".lx-fundo__apagar")).toBeVisible();
    if (info.project.name === "iphone") await foto(page, "iphone-aberto");
    await pausa(page, 900);
    // um toque no cartão aberto fecha (e não abre o roteiro)
    await dedo(page, [c.meio]);
    await page.evaluate(({ x, y }) => (document.elementFromPoint(x, y) as HTMLElement).click(), c.meio);
    await expect.poll(() => frenteX(page, REELS)).toBe(0);
    await expect(page).toHaveURL(/\/app\/criacao$/);
    await pausa(page, 600);

    // até o fim (mais de 55%): apaga direto
    await dedo(page, linha({ x: c.x + c.w - 20, y: c.meio.y }, { x: c.x + 10, y: c.meio.y + 4 }, 14), { soltar: false });
    await expect(cartao(page, REELS)).toHaveAttribute("data-armado", "");
    if (info.project.name === "iphone") await foto(page, "iphone-armado");
    await pausa(page, 500);
    await page.evaluate(
      ({ x, y }) =>
        document
          .querySelector(".lx-cartao[data-armado] .lx-frente")!
          .dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 51, pointerType: "touch", isPrimary: true, clientX: x, clientY: y })),
      { x: c.x + 10, y: c.meio.y },
    );
    await expect(cartao(page, REELS)).toHaveCount(0);
    const aviso = page.locator(".lx-aviso");
    await expect(aviso).toContainText("Apagado");
    await expect.poll(() => naLixeira("roteiros", REELS)).toBe(true);
    await expect(page.locator(".lx-entrada")).toHaveText(/Lixeira · 1/);
    if (info.project.name === "iphone") await foto(page, "iphone-desfazer");
    await pausa(page, 1400);
    // o aviso fica acima da barra de baixo, dentro da tela
    const a = (await aviso.boundingBox())!;
    const barra = await page.locator(".barra").boundingBox();
    if (barra) expect(a.y + a.height).toBeLessThanOrEqual(barra.y);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x + a.width).toBeLessThanOrEqual(page.viewportSize()!.width);

    await aviso.getByRole("button", { name: "Desfazer" }).click();
    await expect(cartao(page, REELS)).toBeVisible();
    await expect.poll(() => naLixeira("roteiros", REELS)).toBe(false);
    await pausa(page, 1200);
    await expect(page.locator(".lx-entrada")).toHaveCount(0);
  });

  test("segurar abre a folha com Apagar e a linha do card; de pé é rolagem", async ({ page }, info) => {
    await abrir(page, "/app/criacao");
    const c = await caixa(page, INSTITUCIONAL);
    // de pé: nada anda
    await dedo(page, linha(c.meio, { x: c.meio.x + 6, y: c.meio.y - 120 }, 8));
    await page.waitForTimeout(200);
    expect(await frenteX(page, INSTITUCIONAL)).toBe(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // segurar
    await dedo(page, [c.meio, { x: c.meio.x + 1, y: c.meio.y + 1, ms: 10 }], { segurar: 650 });
    const folha = page.getByRole("dialog", { name: "Vídeo institucional" });
    await expect(folha).toBeVisible();
    await expect(folha).toContainText("Sai do card até voltar da lixeira.");
    await expect(folha.getByRole("menuitem", { name: "Abrir" })).toBeVisible();
    if (info.project.name === "iphone") await foto(page, "iphone-segurar");
    await folha.getByRole("menuitem", { name: "Apagar" }).click();
    await expect(cartao(page, INSTITUCIONAL)).toHaveCount(0);
    await expect(page.locator(".lx-aviso")).toContainText("Sai do card");
    await expect.poll(() => naLixeira("roteiros", INSTITUCIONAL)).toBe(true);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("nos Fluxos é igual: deslizar apaga e Desfazer devolve", async ({ page }) => {
    await abrir(page, "/app/criacao/fluxos");
    const c = await caixa(page, NOVO_FLUXO);
    await dedo(page, linha({ x: c.x + c.w - 20, y: c.meio.y }, { x: c.x + 10, y: c.meio.y }, 14));
    await expect(cartao(page, NOVO_FLUXO)).toHaveCount(0);
    await expect.poll(() => naLixeira("fluxos", NOVO_FLUXO)).toBe(true);
    await page.locator(".lx-aviso").getByRole("button", { name: "Desfazer" }).click();
    await expect(cartao(page, NOVO_FLUXO)).toBeVisible();
    await expect.poll(() => naLixeira("fluxos", NOVO_FLUXO)).toBe(false);
  });

  test("toque de verdade (Chromium): deslizar apaga; rolar de pé rola a página", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone", "CDP: só no Chromium");
    await abrir(page, "/app/criacao/fluxos");
    const cdp = await page.context().newCDPSession(page);
    const toque = async (pts: Ponto[]) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pts[0].x, y: pts[0].y }] });
      for (const p of pts.slice(1)) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x, y: p.y }] });
        await page.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    const c = await caixa(page, MOODBOARD);
    await toque(linha({ x: c.x + c.w - 24, y: c.meio.y }, { x: c.x + 12, y: c.meio.y + 4 }, 14));
    await expect(cartao(page, MOODBOARD)).toHaveCount(0);
    await expect.poll(() => naLixeira("fluxos", MOODBOARD)).toBe(true);
    await expect(page).toHaveURL(/\/app\/criacao\/fluxos$/);
    await page.locator(".lx-aviso").getByRole("button", { name: "Desfazer" }).click();
    await expect(cartao(page, MOODBOARD)).toBeVisible();
  });
});

test.describe("Criação no computador: •••, lixeira e restaurar", () => {
  test.beforeEach(async ({ page, baseURL }, info) => {
    test.skip(info.project.name !== "computador", "mouse: só no computador");
    await entrar(page, baseURL!, sessao().token);
  });

  test("••• → Mandar para a lixeira → Lixeira · 1 → Restaurar", async ({ page }) => {
    await abrir(page, "/app/criacao");
    const mais = cartao(page, REELS).locator(".lx-mais");
    await expect(mais).toHaveCSS("opacity", "0");
    await cartao(page, REELS).hover();
    await expect(mais).toHaveCSS("opacity", "1");
    await foto(page, "computador-hover");
    await mais.click();
    const menu = page.getByRole("menu", { name: "Opções de Reels da cafeteria" });
    await expect(menu.getByRole("menuitem", { name: "Mandar para a lixeira" })).toBeFocused();
    await foto(page, "computador-menu");
    await menu.getByRole("menuitem", { name: "Mandar para a lixeira" }).click();
    await expect(cartao(page, REELS)).toHaveCount(0);
    await expect(page.locator(".lx-aviso")).toContainText("Apagado");
    await foto(page, "computador-desfazer");
    await expect.poll(() => naLixeira("roteiros", REELS)).toBe(true);
    await page.getByRole("link", { name: /Lixeira · 1/ }).click();
    await expect(page.getByRole("heading", { name: /lixeira/ })).toBeVisible();
    await expect(cartao(page, REELS)).toContainText("Reels da cafeteria");
    await foto(page, "computador-lixeira");
    await cartao(page, REELS).getByRole("button", { name: "Restaurar" }).click();
    await expect(cartao(page, REELS)).toHaveCount(0);
    await expect(page.locator(".lx-aviso")).toContainText("Restaurado");
    await expect.poll(() => naLixeira("roteiros", REELS)).toBe(false);
    await page.goto("/app/criacao");
    await expect(cartao(page, REELS)).toBeVisible();
  });

  test("botão direito abre o mesmo menu; Esc fecha e devolve o foco", async ({ page }) => {
    await abrir(page, "/app/criacao/fluxos");
    await cartao(page, MOODBOARD).locator(".fx-cartao__titulo").click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Opções de Moodboard do clipe" });
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    // pelo teclado: Tab chega no "•••" e Enter abre
    await cartao(page, MOODBOARD).locator(".lx-mais").focus();
    await page.keyboard.press("Enter");
    await expect(menu.getByRole("menuitem", { name: "Mandar para a lixeira" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(cartao(page, MOODBOARD)).toHaveCount(0);
    await expect.poll(() => naLixeira("fluxos", MOODBOARD)).toBe(true);
  });

  test("Apagar de vez pergunta antes e some do banco", async ({ page }) => {
    await banco((sql) => sql`update maestro.fluxos set apagado_em = now() where id = ${MOODBOARD}`);
    await abrir(page, "/app/criacao/fluxos?lixeira=1");
    await cartao(page, MOODBOARD).getByRole("button", { name: "Apagar de vez" }).click();
    const folha = page.getByRole("dialog", { name: "Apagar de vez" });
    await expect(folha).toContainText("Não dá para desfazer.");
    await foto(page, "computador-de-vez");
    await folha.getByRole("button", { name: "Apagar de vez" }).click();
    await expect(cartao(page, MOODBOARD)).toHaveCount(0);
    await expect.poll(() => naLixeira("fluxos", MOODBOARD)).toBe("apagado");
    await expect(page.getByText("Lixeira vazia")).toBeVisible();
  });

  test("no editor e no canvas, o ••• manda para a lixeira e a lista abre com Desfazer", async ({ page }) => {
    await page.goto(`/app/criacao/roteiros/${INSTITUCIONAL}`);
    await page.getByRole("button", { name: "Ajustes do roteiro" }).last().click();
    await page.getByRole("dialog").getByRole("button", { name: "Mandar para a lixeira" }).click();
    await expect(page).toHaveURL(/\/app\/criacao$/);
    const aviso = page.locator(".lx-aviso");
    await expect(aviso).toContainText("Apagado");
    await expect(aviso).toContainText("Sai do card");
    await expect(cartao(page, INSTITUCIONAL)).toHaveCount(0);
    await aviso.getByRole("button", { name: "Desfazer" }).click();
    await expect(cartao(page, INSTITUCIONAL)).toBeVisible();
    await expect.poll(() => naLixeira("roteiros", INSTITUCIONAL)).toBe(false);

    await page.goto(`/app/criacao/fluxos/${NOVO_FLUXO}`);
    await page.getByRole("button", { name: "Mais" }).click();
    await page.getByRole("menuitem", { name: "Mandar para a lixeira" }).click();
    await expect(page).toHaveURL(/\/app\/criacao\/fluxos$/);
    await expect(page.locator(".lx-aviso")).toContainText("Apagado");
    await expect(cartao(page, NOVO_FLUXO)).toHaveCount(0);
    await expect.poll(() => naLixeira("fluxos", NOVO_FLUXO)).toBe(true);
  });
});

test.describe("quem pode apagar", () => {
  test("leitura não vê nada de apagar: nem •••, nem deslizar, nem botão direito, nem Restaurar", async ({ page, baseURL }, info) => {
    await banco((sql) => sql`update maestro.fluxos set apagado_em = now() where id = ${MOODBOARD}`);
    await entrar(page, baseURL!, sessao().leitura);
    await page.goto("/app/criacao");
    await expect(cartao(page, REELS)).toBeVisible();
    await expect(page.locator(".lx-mais, .lx-fundo")).toHaveCount(0);
    if (info.project.name.startsWith("iphone")) {
      const c = (await cartao(page, REELS).boundingBox())!;
      await dedo(page, linha({ x: c.x + c.width - 20, y: c.y + c.height / 2 }, { x: c.x + 10, y: c.y + c.height / 2 }, 14));
      await page.waitForTimeout(300);
      await expect(cartao(page, REELS)).toBeVisible();
    } else {
      await cartao(page, REELS).click({ button: "right" });
      await expect(page.getByRole("menu")).toHaveCount(0);
    }
    expect(await naLixeira("roteiros", REELS)).toBe(false);
    await page.goto("/app/criacao/fluxos?lixeira=1");
    await expect(cartao(page, MOODBOARD)).toBeVisible();
    await expect(page.getByRole("button", { name: /Restaurar|Apagar de vez/ })).toHaveCount(0);
  });

  test("equipe apaga e restaura, mas não apaga de vez", async ({ page, baseURL }) => {
    await banco((sql) => sql`update maestro.roteiros set apagado_em = now() where id = ${REELS}`);
    await entrar(page, baseURL!, sessao().equipe);
    await abrir(page, "/app/criacao?lixeira=1");
    await expect(cartao(page, REELS).getByRole("button", { name: "Restaurar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Apagar de vez" })).toHaveCount(0);
  });
});
