/**
 * A Z na aba dela (/app/z): sem os botões de sugestão, o campo digita sozinho as sugestões do Maestro, Tab (ou o toque,
 * no celular) completa sem enviar, e "reduzir movimento" troca a digitação por uma sugestão inteira e parada.
 * O <zro-ia> vem do próprio repositório (apps/hub-web/public/ia) no lugar de absolutezro.com, e o repasse
 * /api/zro/ia/* responde como a Absolute ZRO, sem rede.
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ARQUIVO_SESSAO = "test-results/e2e-sessao.json";
const IA = new URL("../../../apps/hub-web/public/ia/", import.meta.url);
const SUGESTOES = [
  "O que entra no Quadro esta semana?",
  "Como funciona a aprovação do cliente?",
  "O que a Absolute ZRO vê do meu projeto?",
  "Quantos créditos de IA tenho?",
];

async function preparar(context: BrowserContext, baseURL: string) {
  const { token } = JSON.parse(readFileSync(ARQUIVO_SESSAO, "utf8")) as { token: string };
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
  const enviados: string[] = [];
  await context.route("https://absolutezro.com/ia/**", (r) => {
    const p = new URL(r.request().url()).pathname.replace(/^\/ia\//, "");
    return r.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*", "content-type": p.endsWith(".js") ? "text/javascript; charset=utf-8" : "image/webp" },
      body: readFileSync(new URL(p, IA)),
    });
  });
  await context.route("**/api/zro/ia/**", (r) => {
    const caminho = new URL(r.request().url()).pathname.replace(/^\/api\/zro\/ia/, "");
    if (caminho === "/mensagens") enviados.push(r.request().postData() ?? "");
    const corpo =
      caminho === "/estado"
        ? { ligada: true, nome: "Lia", produto: "maestro", creditos: { usados: 3, limite: 50, renova_em: "2026-11-01T00:00:00.000Z" } }
        : { conversas: [] };
    return r.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(corpo) });
  });
  return enviados;
}

const campo = (page: Page) => page.locator("zro-ia textarea");
const fantasma = (page: Page) => page.locator("zro-ia .fantasma .zf-texto");

test.describe("a Z digita as sugestões no campo", () => {
  test("sem botões; a sugestão se escreve, Tab completa e nada é enviado", async ({ page, context, baseURL }) => {
    const enviados = await preparar(context, baseURL!);
    await page.goto("/app/z");
    await expect(page.locator("zro-ia h1")).toHaveText(/^(Bom dia|Boa tarde|Boa noite), Pessoa\./);
    // os botões de sugestão saíram; o campo tem nome fixo e a lista de sugestões numa descrição (não viva)
    await expect(page.locator("zro-ia .sug, zro-ia [data-sug]")).toHaveCount(0);
    await expect(campo(page)).toHaveAttribute("aria-label", "Pergunte à Z");
    await expect(campo(page)).toHaveAttribute("placeholder", "");
    const descricao = await page.locator("zro-ia #zd").textContent();
    for (const s of SUGESTOES) expect(descricao).toContain(s);
    await expect(page.locator("zro-ia .fantasma")).toHaveAttribute("aria-hidden", "true");
    // anima: o texto cresce letra a letra a partir do começo de uma sugestão
    await expect.poll(async () => ((await fantasma(page).textContent()) ?? "").length, { timeout: 5000 }).toBeGreaterThan(3);
    const a = (await fantasma(page).textContent()) ?? "";
    await expect.poll(async () => (await fantasma(page).textContent()) ?? "").not.toBe(a);
    expect(SUGESTOES.some((s) => s.startsWith(a))).toBe(true);
    // foco: para e mostra a sugestão inteira; Tab completa no campo, sem enviar
    await campo(page).focus();
    const inteira = (await fantasma(page).textContent()) ?? "";
    expect(SUGESTOES).toContain(inteira);
    await page.waitForTimeout(400);
    await expect(fantasma(page)).toHaveText(inteira);
    await page.keyboard.press("Tab");
    await expect(campo(page)).toHaveValue(inteira);
    await expect(campo(page)).toBeFocused();
    await expect(page.locator("zro-ia .fantasma")).toHaveAttribute("data-vazio", "");
    await expect(page.locator("zro-ia button[type=submit]")).toBeEnabled();
    await page.waitForTimeout(300);
    expect(enviados).toHaveLength(0);
    await expect(page.locator("zro-ia .msg")).toHaveCount(0);
    // apagou tudo: a sugestão volta; saiu do campo vazio: volta a digitar
    await campo(page).fill("");
    await expect(fantasma(page)).toHaveText(inteira);
    await campo(page).blur();
    await expect.poll(async () => (await fantasma(page).textContent()) ?? "", { timeout: 4000 }).not.toBe(inteira);
  });

  test("reduzir movimento: uma sugestão inteira, sem cursor piscando", async ({ page, context, baseURL }) => {
    await preparar(context, baseURL!);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app/z");
    await expect(page.locator("zro-ia h1")).toHaveText(/^(Bom dia|Boa tarde|Boa noite), Pessoa\./);
    await expect.poll(async () => SUGESTOES.includes((await fantasma(page).textContent()) ?? "")).toBe(true);
    await expect(page.locator("zro-ia .zf-cursor")).toBeHidden();
  });

  test("no celular, tocar na sugestão completa o campo (no tema escuro também)", async ({ page, context, baseURL, isMobile }) => {
    test.skip(!isMobile, "toque é do celular");
    await preparar(context, baseURL!);
    await context.addCookies([{ name: "zro_theme", value: "dark", url: baseURL! }]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app/z");
    await expect(page.locator("zro-ia")).toHaveAttribute("data-escuro", "");
    await expect.poll(async () => SUGESTOES.includes((await fantasma(page).textContent()) ?? "")).toBe(true);
    const texto = (await fantasma(page).textContent()) ?? "";
    await fantasma(page).tap();
    await expect(campo(page)).toHaveValue(texto);
    // nada vaza do campo no celular: a sugestão termina em reticências se não couber
    const largura = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(largura).toBeLessThanOrEqual(0);
  });
});
