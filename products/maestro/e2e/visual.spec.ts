/**
 * C1 · Aurora: contraste AA de todo texto visível nas telas principais, compondo os fundos de cada texto sobre o pior
 * ponto da luz ambiente (cada um dos três focos na opacidade cheia, e o fundo puro), nas quatro horas do claro e no
 * escuro; a luz que acende ao montar e fica parada com "reduzir movimento". Usa a organização da demonstração
 * (e2e/preparar.ts) e carrega a demonstração se ainda não houver.
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ARQUIVO_SESSAO_DEMO = "test-results/e2e-sessao-demo.json";

async function entrar(context: BrowserContext, baseURL: string) {
  const { token } = JSON.parse(readFileSync(ARQUIVO_SESSAO_DEMO, "utf8")) as { token: string };
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
}

/** Roda na página: devolve os textos abaixo de AA (4,5:1; 3:1 para texto grande). */
function auditar(): { min: number; falhas: string[] } {
  type Cor = [number, number, number, number];
  const tmp = document.createElement("i");
  document.body.append(tmp);
  const ler = (css: string): Cor => {
    tmp.style.color = "";
    tmp.style.color = css;
    const m = getComputedStyle(tmp)
      .color.match(/[\d.]+/g)
      ?.map(Number) ?? [0, 0, 0, 0];
    if (getComputedStyle(tmp).color.startsWith("color(")) return [m[0] * 255, m[1] * 255, m[2] * 255, m[3] ?? 1];
    return [m[0], m[1], m[2], m[3] ?? 1];
  };
  const sobre = (f: Cor, b: Cor): Cor => {
    const a = f[3];
    return [f[0] * a + b[0] * (1 - a), f[1] * a + b[1] * (1 - a), f[2] * a + b[2] * (1 - a), 1];
  };
  const lum = (c: Cor) => {
    const t = c.slice(0, 3).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];
  };
  const razao = (a: Cor, b: Cor) => {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const raiz = getComputedStyle(document.documentElement);
  const fundo = ler(raiz.backgroundColor);
  const o = parseFloat(raiz.getPropertyValue("--luz-o")) || 0;
  const baixo: Cor[] = ["--luz-1", "--luz-2", "--luz-3"].map((k) => {
    const c = ler(raiz.getPropertyValue(k).trim());
    return sobre([c[0], c[1], c[2], o], fundo);
  });
  baixo.push(fundo);
  const falhas: string[] = [];
  let min = 99;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode;
    const texto = n.textContent?.trim();
    if (!texto) continue;
    const el = n.parentElement!;
    if (el.closest("svg, video, iframe, img, .sr-only, [disabled], [aria-disabled='true'], [hidden], .amb")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.bottom < 0 || r.top > innerHeight) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden") continue;
    let opaco = true;
    for (let e: Element | null = el; e; e = e.parentElement) if (parseFloat(getComputedStyle(e).opacity) < 1) opaco = false;
    if (!opaco) continue;
    const cor = ler(st.color);
    const cadeia: Cor[] = [];
    for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) {
      const b = ler(getComputedStyle(e).backgroundColor);
      if (b[3] > 0) cadeia.push(b);
    }
    const tam = parseFloat(st.fontSize);
    const peso = Number(st.fontWeight);
    const alvo = tam >= 24 || (tam >= 18.66 && peso >= 700) ? 3 : 4.5;
    for (const u of baixo) {
      let b = u;
      for (let i = cadeia.length - 1; i >= 0; i--) b = sobre(cadeia[i], b);
      const c = razao(sobre(cor, b), b);
      min = Math.min(min, c / alvo);
      if (c < alvo) {
        falhas.push(`"${texto.slice(0, 32)}" ${c.toFixed(2)} < ${alvo}`);
        break;
      }
    }
  }
  tmp.remove();
  return { min: Number(min.toFixed(2)), falhas: [...new Set(falhas)].slice(0, 10) };
}

const TELAS = [
  "/app/hoje",
  "/app/quadro",
  "/app/aprovacoes",
  "/app/financeiro",
  "/app/orcamentos",
  "/app/freelas",
  "/app/inventario",
  "/app/agenda",
  "/app/ajustes",
  "/app/pedidos",
  "/app/financeiro/numeros",
  "/app/ajustes/pessoas",
  "/app/ajustes/agenda",
  "/app/ajustes/importar",
  "/",
];

async function conferir(page: Page, rotulo: string) {
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(auditar);
  expect(r.falhas, `${rotulo} ${page.url()}`).toEqual([]);
}

test.describe("C1 · Aurora", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ reducedMotion: "reduce" });

  test.beforeEach(async ({ context, baseURL }) => {
    await entrar(context, baseURL!);
  });

  test("demonstração pronta", async ({ page }) => {
    await page.goto("/app/ajustes");
    const carregar = page.getByRole("button", { name: /(Carregar|Completar) demonstra/ });
    const pronta = page.getByText("Os dados de exemplo estão em todas as seções.");
    await expect(carregar.or(pronta).first()).toBeVisible();
    if (await carregar.count()) {
      await carregar.click();
      await page.waitForURL("**/app/quadro", { timeout: 60_000 });
    }
  });

  test("todo texto passa AA no claro, em cada hora, e no escuro", async ({ page, context, baseURL }) => {
    for (const rota of TELAS) {
      await page.goto(rota);
      await expect(page.locator("html")).toHaveAttribute("data-hora", /manha|tarde|fim|noite/);
      for (const hora of ["manha", "tarde", "fim", "noite"]) {
        await page.evaluate((h) => (document.documentElement.dataset.hora = h), hora);
        await conferir(page, `claro/${hora}`);
      }
    }
    await context.addCookies([{ name: "zro_theme", value: "dark", url: baseURL! }]);
    for (const rota of TELAS) {
      await page.goto(rota);
      await conferir(page, "escuro");
    }
  });

  test("a luz acende ao montar e fica parada com reduzir movimento", async ({ page }) => {
    await page.goto("/app/hoje");
    const amb = page.locator(".amb");
    await expect(page.locator("html")).toHaveAttribute("data-hora", /manha|tarde|fim|noite/);
    await expect.poll(() => amb.evaluate((el) => getComputedStyle(el).opacity)).not.toBe("0");
    expect(await amb.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    expect(await amb.evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s/);
  });
});

test.describe("C1 · Aurora com movimento", () => {
  test.use({ reducedMotion: "no-preference" });
  test("o plano deriva devagar e as cores cruzam em 60 s", async ({ page, context, baseURL }) => {
    await entrar(context, baseURL!);
    await page.goto("/app/hoje");
    const amb = page.locator(".amb");
    expect(await amb.evaluate((el) => getComputedStyle(el).animationName)).toBe("amb-deriva");
    expect(await amb.evaluate((el) => getComputedStyle(el).animationDuration)).toBe("120s");
    expect(await amb.evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^60s/);
  });
});
