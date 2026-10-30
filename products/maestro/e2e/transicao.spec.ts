/**
 * Troca de seção sem duas telas uma sobre a outra (titular, 29/10/2026: no iPhone a tela velha e a nova apareciam
 * juntas, títulos sobrepostos). No Chromium e no WebKit a tamanho de iPhone (e no computador): pela barra (ou cápsula),
 * Hoje → Quadro → Aprovações → Mais → Hoje. Em cada troca:
 * - a View Transition acontece com os grupos `m-sai` e `m-entra` (src/components/movimento.tsx);
 * - pelo relógio das animações, a velha termina antes de a nova começar (fim da saída ≤ atraso da entrada);
 * - amostrando quadro a quadro, nunca as duas acima de 10% de opacidade ao mesmo tempo;
 * - nenhum esqueleto na volta a uma seção já vista; no fim, uma seção só no conteúdo.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const ARQUIVO = "test-results/e2e-sessao-corte.json";

type Amostra = { t: number; velha: number | null; nova: number | null; esqueleto: boolean };
type Relogio = { saiFim: number; entraInicio: number } | null;

async function instalarSonda(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { sonda: { amostras: Amostra[]; relogio: Relogio; vts: number } };
    type Amostra = { t: number; velha: number | null; nova: number | null; esqueleto: boolean };
    type Relogio = { saiFim: number; entraInicio: number } | null;
    w.sonda = { amostras: [], relogio: null, vts: 0 };
    const d = document as Document & { __sondaVT?: boolean };
    if (!d.__sondaVT) {
      d.__sondaVT = true;
      const original = document.startViewTransition.bind(document);
      document.startViewTransition = ((arg: ViewTransitionUpdateCallback) => {
        w.sonda.vts++;
        const vt = original(arg);
        vt.ready
          .then(() => {
            const anim = document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.pseudoElement);
            const sai = anim.find((a) => (a.effect as KeyframeEffect).pseudoElement === "::view-transition-old(m-sai)");
            const entra = anim.find((a) => (a.effect as KeyframeEffect).pseudoElement === "::view-transition-new(m-entra)");
            if (sai && entra)
              w.sonda.relogio = {
                saiFim: Number(sai.effect!.getComputedTiming().endTime),
                entraInicio: Number(entra.effect!.getTiming().delay ?? 0),
              };
          })
          .catch(() => {});
        return vt;
      }) as typeof document.startViewTransition;
    }
    const op = (pe: string) => {
      const ativa = document.getAnimations().some((a) => (a.effect as KeyframeEffect | null)?.pseudoElement === pe);
      return ativa ? Number(getComputedStyle(document.documentElement, pe).opacity) : null;
    };
    const t0 = performance.now();
    const amostrar = () => {
      w.sonda.amostras.push({
        t: performance.now() - t0,
        velha: op("::view-transition-old(m-sai)"),
        nova: op("::view-transition-new(m-entra)"),
        esqueleto: !!document.querySelector('#conteudo [aria-busy="true"]'),
      });
    };
    const iv = setInterval(amostrar, 4);
    const quadro = () => {
      amostrar();
      if (performance.now() - t0 < 4000) requestAnimationFrame(quadro);
      else clearInterval(iv);
    };
    requestAnimationFrame(quadro);
  });
}

/**
 * A rede parada (500 ms sem pedido em aberto), sem contar o Set da barra de cima: o `<zro-set>` bate presença em
 * /api/zro/set e, no 401 do e2e, não lê o corpo; o Chromium deixa esse pedido "em aberto" até o lixo ser coletado e o
 * `networkidle` do Playwright pode nunca chegar. Conta só as seções pré-buscadas e o resto da página.
 */
function acompanharRede(page: Page) {
  const abertos = new Set<object>();
  page.on("request", (r) => {
    if (!/\/api\/zro\/set/.test(r.url())) abertos.add(r);
  });
  page.on("requestfinished", (r) => abertos.delete(r));
  page.on("requestfailed", (r) => abertos.delete(r));
  return async function parada() {
    const ate = Date.now() + 30_000;
    let quieta = 0;
    while (quieta < 500) {
      if (Date.now() > ate) throw new Error(`rede não parou: ${abertos.size} pedido(s) em aberto`);
      await page.waitForTimeout(50);
      quieta = abertos.size ? 0 : quieta + 50;
    }
  };
}

async function ler(page: Page) {
  return page.evaluate(() => (window as unknown as { sonda: { amostras: Amostra[]; relogio: Relogio; vts: number } }).sonda);
}

test("troca de seção: a velha sai antes de a nova entrar, sem esqueleto na volta", async ({ page, context, baseURL }, info) => {
  const { token } = JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string };
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL! }]);
  const redeParada = acompanharRede(page);
  await page.goto("/app/hoje");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const celular = info.project.name !== "computador";
  const nav = celular ? page.locator(".barra") : page.locator(".capsula__nav");
  // a pré-busca das seções da barra/cápsula termina com a página parada
  await redeParada();

  const rota: { nome: RegExp; url: string; titulo: RegExp; volta?: true }[] = celular
    ? [
        { nome: /^Quadro$/, url: "/app/quadro", titulo: /Quadro/ },
        { nome: /^Aprovar$/, url: "/app/aprovacoes", titulo: /aprovações/ },
        { nome: /^Mais$/, url: "/app/mais", titulo: /seções/ },
        { nome: /^Hoje$/, url: "/app/hoje", titulo: /Diana/, volta: true },
        { nome: /^Quadro$/, url: "/app/quadro", titulo: /Quadro/, volta: true },
      ]
    : [
        { nome: /^Financeiro$/, url: "/app/financeiro", titulo: /./ },
        { nome: /^Z$/, url: "/app/z", titulo: /./ },
        { nome: /^Financeiro$/, url: "/app/financeiro", titulo: /./, volta: true },
      ];

  for (const passo of rota) {
    await instalarSonda(page);
    await nav.getByRole("link", { name: passo.nome }).click();
    await page.waitForURL(`**${passo.url}`);
    // a transição acabou
    await page.waitForFunction(() => !document.documentElement.dataset.mSentido, null, { timeout: 8000 });
    await page.waitForTimeout(150);
    const s = await ler(page);
    expect(s.vts, `${passo.url}: houve View Transition`).toBeGreaterThan(0);
    expect(s.relogio, `${passo.url}: grupos m-sai e m-entra`).not.toBeNull();
    // pelo relógio das animações: a velha some antes de a nova começar
    expect(s.relogio!.saiFim, `${passo.url}: saída termina antes da entrada`).toBeLessThanOrEqual(s.relogio!.entraInicio + 12);
    // quadro a quadro: nunca as duas visíveis
    const juntas = s.amostras.filter((a) => (a.velha ?? 0) > 0.1 && (a.nova ?? 0) > 0.1);
    expect(juntas, `${passo.url}: velha e nova juntas`).toEqual([]);
    if (passo.volta)
      expect(
        s.amostras.filter((a) => a.esqueleto),
        `${passo.url}: esqueleto na volta`,
      ).toEqual([]);
    await expect(page.locator("#conteudo > .m-pagina")).toHaveCount(1);
    if (celular) await expect(page.getByRole("heading", { level: 1 })).toHaveText(passo.titulo);
  }
});

test("com reduzir movimento, a troca é na hora (sem View Transition)", async ({ page, context, baseURL }) => {
  const { token } = JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string };
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL! }]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app/hoje");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await instalarSonda(page);
  const link = page
    .locator(".barra:visible, .capsula__nav:visible")
    .first()
    .getByRole("link", { name: /^(Quadro|Financeiro)$/ });
  await link.click();
  await page.waitForURL(/\/app\/(quadro|financeiro)/);
  expect((await ler(page)).vts).toBe(0);
});

test("barra de baixo: as abas dividem a largura toda, sem coluna vazia", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name === "computador", "só no celular");
  const { token } = JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string };
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL! }]);
  await page.goto("/app/aprovacoes");
  const abas = page.locator(".barra a");
  await expect(abas.first()).toBeVisible();
  const caixas = await abas.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.left, w: r.width })));
  const largura = page.viewportSize()!.width;
  const ultima = caixas.at(-1)!;
  // a última aba (Mais) chega à borda direita, como a primeira chega à esquerda
  expect(largura - (ultima.x + ultima.w)).toBeLessThan(20);
  expect(caixas[0].x).toBeLessThan(20);
  // todas da mesma largura
  for (const c of caixas) expect(Math.abs(c.w - caixas[0].w)).toBeLessThan(2);
});
