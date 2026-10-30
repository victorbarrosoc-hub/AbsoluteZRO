/**
 * Gestos do Quadro no celular (src/components/quadro/gestos.ts), no Chromium e no WebKit a tamanho de iPhone: deslizar
 * de lado troca de coluna (a pílula vai junto), começo na borda é do Safari, rolar de pé não troca de coluna; segurar o
 * card ergue em menos de 400 ms (sem o arrastar nativo e sem fundo preto), reordena na coluna, passa para a coluna do
 * lado segurando na borda e vai para a coluna da pílula onde é solto. Toques sintéticos (PointerEvent de toque) nos
 * dois motores; no Chromium a rolagem de pé usa o toque de verdade (CDP).
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../playwright.config";

const ARQUIVO = "test-results/e2e-sessao-gestos.json";
const sessao = () => JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string; org: string };

const CARDS: [string, string, string][] = [
  ["ge-p1", "Pauta um", "pauta"],
  ["ge-p2", "Pauta dois", "pauta"],
  ["ge-p3", "Pauta três", "pauta"],
  ["ge-p4", "Pauta quatro", "pauta"],
  ["ge-p5", "Pauta cinco", "pauta"],
  ["ge-p6", "Pauta seis", "pauta"],
  ["ge-p7", "Pauta sete", "pauta"],
  ["ge-a1", "A fazer um", "afazer"],
  ["ge-a2", "A fazer dois", "afazer"],
  ["ge-f1", "Fazendo um", "fazendo"],
];

/** Os cards do teste, do zero (cada teste começa igual, nos dois motores). */
async function semear() {
  const { org } = sessao();
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    // o histórico dos cards é só inclusão: volta cada card ao começo em vez de apagar
    let i = 0;
    for (const [id, tema, coluna] of CARDS) {
      i++;
      await sql`insert into maestro.cards (org_id, id, dados) values (${org}, ${id}, ${sql.json({ tema, coluna, ordem: i * 1000 })})
        on conflict (org_id, id) do update set dados = excluded.dados, versao = maestro.cards.versao + 1, versoes = '{}'::jsonb`;
    }
  } finally {
    await sql.end();
  }
}

async function colunaDoBanco(id: string) {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    const [r] = await sql`select dados->>'coluna' as coluna from maestro.cards where id = ${id}`;
    return r?.coluna as string | undefined;
  } finally {
    await sql.end();
  }
}

/** A ordem gravada de uma coluna (só os cards do teste). */
async function ordemDoBanco(col: string) {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    const l = await sql`select id from maestro.cards where org_id = ${sessao().org} and id like 'ge-%' and dados->>'coluna' = ${col}
      order by (dados->>'ordem')::float8, id`;
    return l.map((r) => r.id as string);
  } finally {
    await sql.end();
  }
}

test.beforeEach(async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name === "computador", "gestos de toque: só no celular");
  await semear();
  await context.addCookies([{ name: "mae_sessao", value: sessao().token, url: baseURL! }]);
  await page.goto("/app/quadro");
  // hidratado: a pílula de vidro foi medida
  await expect(page.locator(".q-abas[data-pilula]")).toHaveCount(1);
  await expect(page.locator('.q-col.on [data-card="ge-p1"]')).toBeVisible();
});

const ativa = (page: Page) => page.locator('.q-abas button[aria-pressed="true"]').getAttribute("data-col");
const ordemNaColuna = (page: Page, col: string) =>
  page.locator(`.q-col[data-col="${col}"] [data-card]`).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.card));

type Ponto = { x: number; y: number; ms?: number };

/**
 * Um dedo sintético: pointerdown no elemento sob o primeiro ponto, pointermove por cada ponto (com a pausa pedida) e
 * pointerup no fim. Os eventos vão para o alvo do toque (como num toque de verdade) e sobem até o Quadro.
 */
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
            pointerId: 41,
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

/** De a até b em n passos de 16 ms. */
function linha(a: { x: number; y: number }, b: { x: number; y: number }, n = 12): Ponto[] {
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

async function centro(page: Page, sel: string) {
  const b = (await page.locator(sel).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test.describe("Quadro no celular: deslizar entre colunas", () => {
  test("deslizar de lado troca de coluna, a pílula vai junto e a ponta é elástica", async ({ page }) => {
    const c = await centro(page, '[data-card="ge-p2"]');
    // durante o gesto a vizinha aparece colada e a coluna segue o dedo
    await dedo(page, linha(c, { x: c.x - 170, y: c.y }, 8), { soltar: false });
    await expect(page.locator('.q-col[data-col="afazer"][data-vizinha]')).toHaveCount(1);
    const tx = await page.locator(".q-col.on").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
    expect(tx).toBeLessThan(-100);
    await page.evaluate(() =>
      document
        .elementFromPoint(100, 400)!
        .dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 41, pointerType: "touch", isPrimary: true, clientX: 100, clientY: 400 })),
    );
    await expect.poll(() => ativa(page)).toBe("afazer");
    await expect(page.locator(".q-col[data-vizinha]")).toHaveCount(0);
    await expect(page.locator('.q-abas button[data-col="afazer"][data-sob]')).toHaveCount(1);
    // e volta
    const d = await centro(page, '[data-card="ge-a1"]');
    await dedo(page, linha(d, { x: d.x + 200, y: d.y }));
    await expect.poll(() => ativa(page)).toBe("pauta");
    // na primeira coluna, para a direita: elástico e fica
    const e = await centro(page, '[data-card="ge-p2"]');
    await dedo(page, linha(e, { x: e.x + 180, y: e.y }, 8), { soltar: false });
    const elastico = await page.locator(".q-col.on").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
    expect(elastico).toBeGreaterThan(10);
    expect(elastico).toBeLessThan(150);
    await page.evaluate(() =>
      document
        .elementFromPoint(200, 400)!
        .dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 41, pointerType: "touch", isPrimary: true, clientX: 300, clientY: 400 })),
    );
    await expect.poll(() => page.locator(".q-col.on").evaluate((el) => getComputedStyle(el).transform)).toBe("none");
    expect(await ativa(page)).toBe("pauta");
  });

  test("começar na borda é do Safari; de pé é rolagem; as pílulas continuam trocando", async ({ page }, info) => {
    const c = await centro(page, '[data-card="ge-p2"]');
    await dedo(page, linha({ x: 8, y: c.y }, { x: 260, y: c.y }));
    await page.waitForTimeout(500);
    expect(await ativa(page)).toBe("pauta");
    // de pé: não troca de coluna
    await dedo(page, linha(c, { x: c.x + 20, y: c.y - 200 }));
    await page.waitForTimeout(500);
    expect(await ativa(page)).toBe("pauta");
    if (info.project.name === "iphone") {
      // toque de verdade (Chromium): a página rola e a coluna fica
      const cdp = await page.context().newCDPSession(page);
      const antes = await page.evaluate(() => window.scrollY);
      const pts = linha({ x: c.x, y: c.y + 200 }, { x: c.x + 15, y: c.y - 150 }, 10);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pts[0].x, y: pts[0].y }] });
      for (const p of pts.slice(1)) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x, y: p.y }] });
        await page.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(antes + 50);
      expect(await ativa(page)).toBe("pauta");
      // e o deslizar de verdade troca
      await page.evaluate(() => window.scrollTo(0, 0));
      const d = await centro(page, '[data-card="ge-p2"]');
      const lado = linha(d, { x: d.x - 220, y: d.y + 6 }, 10);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: lado[0].x, y: lado[0].y }] });
      for (const p of lado.slice(1)) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x, y: p.y }] });
        await page.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(() => ativa(page)).toBe("afazer");
    }
    // a pílula (teclado, leitor de tela, toque) continua trocando
    await page.locator('.q-abas button[data-col="fazendo"]').click();
    await expect.poll(() => ativa(page)).toBe("fazendo");
    await expect(page.locator('.q-col.on [data-card="ge-f1"]')).toBeVisible();
  });

  test("com reduzir movimento, troca na hora", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const c = await centro(page, '[data-card="ge-p2"]');
    await dedo(page, linha(c, { x: c.x - 150, y: c.y }, 6), { soltar: false });
    expect(await page.locator(".q-col.on").evaluate((el) => getComputedStyle(el).transform)).toBe("none");
    await page.evaluate(() =>
      document
        .elementFromPoint(100, 400)!
        .dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 41, pointerType: "touch", isPrimary: true, clientX: 100, clientY: 400 })),
    );
    expect(await ativa(page)).toBe("afazer");
  });
});

test.describe("Quadro no celular: arrastar o card", () => {
  test("segurar ergue em menos de 400 ms, do tamanho do card e sem fundo preto", async ({ page }) => {
    // sem o arrastar nativo (o do iOS demora e pinta de preto) e sem o menu de segurar
    await expect(page.locator('[data-card="ge-p1"]')).not.toHaveAttribute("draggable", "true");
    const estilo = await page.locator('[data-card="ge-p1"]').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { sel: cs.userSelect || cs.getPropertyValue("-webkit-user-select"), callout: cs.getPropertyValue("-webkit-touch-callout") };
    });
    expect(estilo.sel).toBe("none");
    if (estilo.callout) expect(estilo.callout).toBe("none");
    const card = (await page.locator('[data-card="ge-p2"]').boundingBox())!;
    const c = { x: card.x + card.width / 2, y: card.y + card.height / 2 };
    const t0 = Date.now();
    await dedo(page, [c], { soltar: false });
    await expect(page.locator(".q-fantasma")).toHaveCount(1, { timeout: 400 });
    expect(Date.now() - t0).toBeLessThan(600);
    const f = await page.locator(".q-fantasma").evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const rgb = cs.backgroundColor.match(/[\d.]+/g)!.map(Number);
      return { w: r.width, h: r.height, fundo: rgb, sombra: cs.boxShadow };
    });
    // do tamanho do card (com o leve 1,03 de erguer), fundo claro e sombra macia
    expect(f.w).toBeGreaterThan(card.width * 0.98);
    expect(f.w).toBeLessThan(card.width * 1.06);
    expect(f.h).toBeGreaterThan(card.height * 0.98);
    const [r, g, b] = f.fundo;
    expect((r + g + b) / 3).toBeGreaterThan(200);
    expect(f.sombra).not.toBe("none");
    await expect(page.locator('[data-card="ge-p2"]')).toHaveCSS("visibility", "hidden");
    // solta onde estava: nada muda
    await page.evaluate(
      ({ x, y }) =>
        document
          .querySelector('[data-card="ge-p2"]')!
          .dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 41, pointerType: "touch", isPrimary: true, clientX: x, clientY: y })),
      c,
    );
    await expect(page.locator(".q-fantasma")).toHaveCount(0);
    expect(await ordemNaColuna(page, "pauta")).toEqual(["ge-p1", "ge-p2", "ge-p3", "ge-p4", "ge-p5", "ge-p6", "ge-p7"]);
  });

  test("reordena dentro da coluna: os outros abrem espaço e a ordem fica gravada", async ({ page }) => {
    const a = await centro(page, '[data-card="ge-p1"]');
    const b = (await page.locator('[data-card="ge-p2"]').boundingBox())!;
    await dedo(page, linha(a, { x: a.x, y: b.y + b.height * 0.8 }, 10), { segurar: 360, soltar: false });
    // os cards de baixo subiram para abrir espaço
    const subiu = await page.locator('[data-card="ge-p2"]').evaluate((el) => new DOMMatrix(el.parentElement!.style.transform || "none").m42);
    expect(subiu).toBeLessThan(-20);
    await page.evaluate(() =>
      document
        .querySelector('[data-card="ge-p1"]')!
        .dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 41, pointerType: "touch", isPrimary: true })),
    );
    await expect(page.locator(".q-fantasma")).toHaveCount(0);
    await expect.poll(() => ordemNaColuna(page, "pauta")).toEqual(["ge-p2", "ge-p1", "ge-p3", "ge-p4", "ge-p5", "ge-p6", "ge-p7"]);
    // gravada no banco (e não "rede parada": o Set da barra de cima bate presença o tempo todo)
    await expect.poll(() => ordemDoBanco("pauta")).toEqual(["ge-p2", "ge-p1", "ge-p3", "ge-p4", "ge-p5", "ge-p6", "ge-p7"]);
    await page.reload();
    await expect.poll(() => ordemNaColuna(page, "pauta")).toEqual(["ge-p2", "ge-p1", "ge-p3", "ge-p4", "ge-p5", "ge-p6", "ge-p7"]);
  });

  test("segurar na borda passa para a coluna do lado e solta lá, com Desfazer", async ({ page }) => {
    const a = await centro(page, '[data-card="ge-p2"]');
    const largura = page.viewportSize()!.width;
    await dedo(page, linha(a, { x: largura - 12, y: a.y }, 10), { segurar: 340, soltar: false });
    await page.waitForFunction(() => (document.querySelector('.q-abas button[aria-pressed="true"]') as HTMLElement | null)?.dataset.col === "afazer", null, {
      polling: "raf",
      timeout: 4000,
    });
    // tira da borda (senão vai para a próxima) e solta entre os cards de A fazer
    const alvo = (await page.locator('[data-card="ge-a1"]').boundingBox())!;
    await page.evaluate(
      async ({ x, y }) => {
        const el = document.querySelector('[data-card="ge-p2"]')!;
        const ev = (t: string) =>
          el.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 41, pointerType: "touch", isPrimary: true, clientX: x, clientY: y }));
        ev("pointermove");
        await new Promise((r) => setTimeout(r, 120));
        ev("pointerup");
      },
      { x: alvo.x + alvo.width / 2, y: alvo.y + alvo.height * 0.75 },
    );
    await expect(page.locator(".q-fantasma")).toHaveCount(0);
    await expect.poll(() => ordemNaColuna(page, "afazer")).toEqual(["ge-a1", "ge-p2", "ge-a2"]);
    await expect(page.getByRole("status").filter({ hasText: "Movido para A fazer." })).toBeVisible();
    await expect.poll(() => colunaDoBanco("ge-p2")).toBe("afazer");
    await page.getByRole("button", { name: "Desfazer" }).click();
    await expect.poll(() => colunaDoBanco("ge-p2")).toBe("pauta");
  });

  test("soltar sobre a pílula manda o card para aquela coluna", async ({ page }) => {
    const a = await centro(page, '[data-card="ge-p3"]');
    const p = await centro(page, '.q-abas button[data-col="fazendo"]');
    await dedo(page, linha(a, p, 12), { segurar: 340, soltar: false });
    await expect(page.locator('.q-abas button[data-col="fazendo"][data-alvo]')).toHaveCount(1);
    await page.evaluate(() =>
      document
        .querySelector('[data-card="ge-p3"]')!
        .dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 41, pointerType: "touch", isPrimary: true })),
    );
    await expect(page.locator(".q-fantasma")).toHaveCount(0);
    await expect(page.locator('.q-col[data-col="fazendo"] [data-card="ge-p3"]')).toHaveCount(1);
    expect(await ativa(page)).toBe("pauta");
    await expect(page.getByRole("status").filter({ hasText: "Movido para Fazendo." })).toBeVisible();
    await expect.poll(() => colunaDoBanco("ge-p3")).toBe("fazendo");
  });

  test("soltar fora da área devolve o card ao lugar", async ({ page }) => {
    const a = await centro(page, '[data-card="ge-p2"]');
    await dedo(page, linha(a, { x: a.x, y: 30 }, 8), { segurar: 340, soltar: false });
    await page.evaluate(() =>
      document
        .querySelector('[data-card="ge-p2"]')!
        .dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 41, pointerType: "touch", isPrimary: true })),
    );
    await expect(page.locator(".q-fantasma")).toHaveCount(0);
    expect(await ordemNaColuna(page, "pauta")).toEqual(["ge-p1", "ge-p2", "ge-p3", "ge-p4", "ge-p5", "ge-p6", "ge-p7"]);
    expect(await colunaDoBanco("ge-p2")).toBe("pauta");
  });
});
