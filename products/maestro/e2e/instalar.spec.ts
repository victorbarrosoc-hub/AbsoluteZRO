/**
 * O Maestro como app na Tela de Início (PWA): o manifesto, o ícone do iPhone e as metas do Safari; o "No celular, como
 * app." em Ajustes; e o app aberto como instalado (display-mode standalone e `navigator.standalone`, como o iPhone
 * diz) sem nada cortado a 375 e 393 px, no claro e no escuro (o mesmo detector de e2e/corte.ts). Com PWA_SHOTS=<pasta>,
 * guarda as capturas.
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { achadosDeCorte } from "./corte";

const CORTE = "test-results/e2e-sessao-corte.json";
const SHOTS = process.env.PWA_SHOTS;

async function entrar(context: BrowserContext, baseURL: string, tema: "light" | "dark") {
  const { token } = JSON.parse(readFileSync(CORTE, "utf8")) as { token: string };
  await context.clearCookies();
  await context.addCookies([
    { name: "mae_sessao", value: token, url: baseURL },
    { name: "zro_theme", value: tema, url: baseURL },
  ]);
}

/** Como o iPhone abre o app instalado: display-mode standalone (Chromium) e navigator.standalone (o sinal do Safari). */
async function comoAppInstalado(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    const original = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => {
      const mql = original(q);
      if (/display-mode:\s*standalone/.test(q)) Object.defineProperty(mql, "matches", { value: true });
      return mql;
    };
  });
  const cdp = await page
    .context()
    .newCDPSession(page)
    .catch(() => null);
  await cdp?.send("Emulation.setEmulatedMedia", { features: [{ name: "display-mode", value: "standalone" }] }).catch(() => {});
}

async function esperarAssentar(page: Page) {
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

test.describe("app na Tela de Início", () => {
  test("manifesto, ícones e metas do Safari", async ({ page, request }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();
    const r = await request.get(href!);
    expect(r.status()).toBe(200);
    const m = (await r.json()) as Record<string, unknown> & { icons: { src: string; sizes: string; purpose?: string }[] };
    expect(m).toMatchObject({ name: "Maestro", short_name: "Maestro", start_url: "/app", scope: "/", display: "standalone", theme_color: "#f7f3ee" });
    expect(m.icons.map((i) => `${i.sizes}:${i.purpose}`)).toEqual(["192x192:any", "512x512:any", "512x512:maskable"]);
    for (const i of m.icons) {
      const png = await request.get(i.src);
      expect(png.status(), i.src).toBe(200);
      expect(png.headers()["content-type"]).toContain("image/png");
    }
    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    expect((await request.get(apple!)).status()).toBe(200);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Maestro");
    await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute("content", "default");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f7f3ee");
  });

  test("o escuro pinta a barra de escuro", async ({ page, context, baseURL }) => {
    await entrar(context, baseURL!, "dark");
    await page.goto("/app/ajustes");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0a0c16");
  });

  test("Ajustes ensina a pôr na Tela de Início; aberto como app, o aviso some", async ({ page, context, baseURL }) => {
    await entrar(context, baseURL!, "light");
    await page.goto("/app/ajustes");
    const dica = page.locator(".instalar");
    await expect(dica).toContainText("No celular, como app.");
    await expect(dica).toContainText("Compartilhar");
    await expect(dica).toContainText("Adicionar à Tela de Início");
    await comoAppInstalado(page);
    await page.goto("/app/ajustes");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(".instalar")).toHaveCount(0);
  });
});

for (const largura of [375, 393]) {
  for (const tema of ["light", "dark"] as const) {
    test.describe(`aberto como app, sem corte a ${largura} px (${tema})`, () => {
      test.use({ viewport: { width: largura, height: 812 } });

      test("Hoje, Quadro, Aprovações, Ajustes e Mais cabem", async ({ page, context, baseURL }, info) => {
        test.skip(info.project.name === "computador", "o app instalado é o do celular");
        test.setTimeout(120_000);
        await entrar(context, baseURL!, tema);
        await comoAppInstalado(page);
        const achados: string[] = [];
        for (const rota of ["/app/hoje", "/app/quadro", "/app/aprovacoes", "/app/ajustes", "/app/mais"]) {
          const r = await page.goto(rota);
          expect(r?.status(), rota).toBeLessThan(400);
          await esperarAssentar(page);
          expect(await page.evaluate(() => matchMedia("(display-mode: standalone)").matches)).toBe(true);
          for (const a of await achadosDeCorte(page)) achados.push(`${rota}: ${a}`);
          const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(sobra, rota).toBeLessThanOrEqual(0);
          if (SHOTS) await page.screenshot({ path: `${SHOTS}/pwa-${rota.replace(/\W+/g, "-")}-${largura}-${tema}-${info.project.name}.png` });
        }
        expect(achados, achados.join("\n")).toEqual([]);
      });
    });
  }
}
