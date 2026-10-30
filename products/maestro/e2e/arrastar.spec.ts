/**
 * Arrastar o card com o mouse no computador (titular, 29/10/2026: "a animação dá uma travadinha"), no Chromium e no
 * WebKit (o Safari do Mac): um relógio por quadro (requestAnimationFrame) grava onde o card está à vista em cada quadro,
 * quantas vezes o React desenhou e o que mudou no DOM. Enquanto o mouse anda, nada de render do React nem de layout
 * (só `transform`); o lugar de soltar não pisca; ao soltar, o card assenta de onde foi solto, sempre inteiro e à vista
 * (sem sumir, sem ser cortado pela coluna, sem pulo); depois de o banco confirmar e da volta de 5 s, nada se mexe.
 * Com "reduzir movimento", o card vai direto. Os números de cada passada ficam em test-results/arrastar-<projeto>.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../playwright.config";

const ARQUIVO = "test-results/e2e-sessao-arrastar.json";
const sessao = () => JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string; org: string };

const COLUNAS = ["pauta", "afazer", "fazendo", "revisao", "aprovacao", "aprovado", "agendado", "entregue"];
const CARDS: [string, string, string][] = COLUNAS.flatMap((col, i) =>
  ["um", "dois", "três", "quatro"].map(
    (n, j) => [`ar-${i}${j}`, `${col} ${n}${j % 2 ? " com um título que quebra em duas linhas" : ""}`, col] as [string, string, string],
  ),
);

async function semear() {
  const { org } = sessao();
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    let i = 0;
    for (const [id, tema, coluna] of CARDS) {
      i++;
      await sql`insert into maestro.cards (org_id, id, dados) values (${org}, ${id}, ${sql.json({ tema, coluna, ordem: i * 1000, prazo: "2026-11-03" })})
        on conflict (org_id, id) do update set dados = excluded.dados, versao = maestro.cards.versao + 1, versoes = '{}'::jsonb`;
    }
  } finally {
    await sql.end();
  }
}

async function noBanco(id: string) {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    const [r] = await sql`select dados->>'coluna' as coluna, (dados->>'ordem')::float as ordem from maestro.cards where id = ${id}`;
    return r as { coluna: string; ordem: number } | undefined;
  } finally {
    await sql.end();
  }
}

type Amostra = {
  t: number;
  fase: "antes" | "arrasto" | "solto";
  /** onde o card está à vista: o fantasma, o card de verdade ou (arrastar nativo) o ponteiro menos a pega */
  x: number;
  y: number;
  /** quanto do card se vê (0 a 1): opacidade × parte não cortada pela coluna; o card de origem escondido conta 0 */
  visivel: number;
  /** soma do topo de layout (sem transform) de todos os lugares: muda = houve layout na coluna */
  layout: number;
};
type Relatorio = {
  amostras: Amostra[];
  commits: { t: number }[];
  mutacoes: { t: number; col: string; tipo: string }[];
  soltouEm: number;
  comecouEm: number;
  pega: { dx: number; dy: number; w: number; h: number };
};

/** Liga o relógio por quadro e o contador de commits do React (o gancho do DevTools, antes do React carregar). */
async function instrumentar(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const commits: { t: number }[] = [];
    w.__commits = commits;
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject: () => 1,
      onCommitFiberRoot: () => commits.push({ t: performance.now() }),
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      checkDCE: () => {},
    };
  });
}

async function gravar(page: Page, id: string) {
  await page.evaluate((id) => {
    const w = window as unknown as Record<string, unknown>;
    const amostras: Amostra[] = [];
    const mutacoes: { t: number; col: string; tipo: string }[] = [];
    const estado = { fase: "antes" as Amostra["fase"], px: 0, py: 0, soltouEm: 0, comecouEm: 0, pega: { dx: 0, dy: 0, w: 0, h: 0 }, vivo: true };
    const card0 = document.querySelector<HTMLElement>(`[data-card="${id}"]`)!;
    const r0 = card0.getBoundingClientRect();
    estado.pega = { dx: 0, dy: 0, w: r0.width, h: r0.height };
    const ponteiro = (e: MouseEvent) => {
      estado.px = e.clientX;
      estado.py = e.clientY;
    };
    addEventListener("pointermove", ponteiro, true);
    addEventListener("dragover", ponteiro, true);
    addEventListener(
      "pointerdown",
      (e) => {
        const r = document.querySelector<HTMLElement>(`[data-card="${id}"]`)!.getBoundingClientRect();
        estado.pega = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
        estado.px = e.clientX;
        estado.py = e.clientY;
      },
      true,
    );
    const comecou = () => {
      if (estado.fase === "antes") {
        estado.fase = "arrasto";
        estado.comecouEm = performance.now();
      }
    };
    addEventListener("dragstart", comecou, true);
    const soltou = () => {
      if (estado.fase === "arrasto") {
        estado.fase = "solto";
        estado.soltouEm = performance.now();
      }
    };
    addEventListener("drop", soltou, true);
    addEventListener("dragend", soltou, true);
    addEventListener("pointerup", soltou, true);
    const obs = new MutationObserver((l) => {
      for (const m of l) {
        const el = (m.target.nodeType === 1 ? m.target : m.target.parentElement) as HTMLElement | null;
        const col = el?.closest<HTMLElement>(".q-col")?.dataset.col ?? "-";
        if (m.type === "attributes" && m.attributeName === "style") continue; // transform direto no estilo: é o que queremos
        mutacoes.push({ t: performance.now(), col, tipo: m.type === "attributes" ? `attr:${m.attributeName}` : "filhos" });
      }
    });
    obs.observe(document.querySelector(".q-quadro")!, { subtree: true, childList: true, attributes: true, characterData: true });
    const quadro = () => {
      if (!estado.vivo) return;
      if (document.querySelector(".q-fantasma")) comecou();
      const t = performance.now();
      const fantasma = document.querySelector<HTMLElement>(".q-fantasma");
      const card = document.querySelector<HTMLElement>(`[data-card="${id}"]`);
      let x = 0;
      let y = 0;
      let visivel = 0;
      const escondido = (el: HTMLElement) =>
        el.classList.contains("q-card--origem") || el.classList.contains("q-card--arrastando") || getComputedStyle(el).visibility === "hidden";
      if (fantasma && estado.fase !== "antes") {
        const r = fantasma.getBoundingClientRect();
        x = r.left;
        y = r.top;
        visivel = Number(getComputedStyle(fantasma).opacity);
      } else if (estado.fase === "arrasto") {
        // arrastar nativo: a imagem do navegador segue o ponteiro (não está no DOM)
        x = estado.px - estado.pega.dx;
        y = estado.py - estado.pega.dy;
        visivel = 1;
      } else if (card) {
        const r = card.getBoundingClientRect();
        x = r.left;
        y = r.top;
        let op = escondido(card) ? 0 : 1;
        for (let el: HTMLElement | null = card; el && op > 0; el = el.parentElement) op *= Number(getComputedStyle(el).opacity);
        // a coluna (ou qualquer ancestral) que corta o que passa dela
        let area = 1;
        for (let el = card.parentElement; el && el !== document.body; el = el.parentElement) {
          const s = getComputedStyle(el);
          if (s.overflowX === "visible" && s.overflowY === "visible") continue;
          const c = el.getBoundingClientRect();
          const ix = Math.max(0, Math.min(r.right, c.right) - Math.max(r.left, c.left));
          const iy = Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
          area = Math.min(area, (ix * iy) / Math.max(1, r.width * r.height));
        }
        visivel = op * area;
      }
      let layout = 0;
      for (const l of document.querySelectorAll<HTMLElement>(".q-lugar")) layout += l.offsetTop;
      amostras.push({ t, fase: estado.fase, x, y, visivel, layout });
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
    w.__parar = () => {
      estado.vivo = false;
      obs.disconnect();
      return {
        amostras,
        mutacoes,
        commits: (w.__commits as { t: number }[]).slice(),
        soltouEm: estado.soltouEm,
        comecouEm: estado.comecouEm,
        pega: estado.pega,
      };
    };
  }, id);
}

/** Um mouse de gente: anda a ~60 Hz, para no lugar e treme um pouco antes de soltar. */
async function arrastar(page: Page, de: { x: number; y: number }, para: { x: number; y: number }, { soltar = true } = {}) {
  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  const n = 36;
  for (let i = 1; i <= n; i++) {
    const p = i / n;
    const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    await page.mouse.move(de.x + (para.x - de.x) * e, de.y + (para.y - de.y) * e + Math.sin(p * Math.PI) * 30);
    await page.waitForTimeout(16);
  }
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(para.x + ((i % 3) - 1) * 2, para.y + ((i % 2) - 0.5) * 2);
    await page.waitForTimeout(16);
  }
  if (soltar) await page.mouse.up();
}

const caixa = async (page: Page, sel: string) => (await page.locator(sel).boundingBox())!;

function resumir(r: Relatorio, destino: { x: number; y: number }) {
  const a = r.amostras;
  const dts = a.slice(1).map((s, i) => s.t - a[i].t);
  const durante = a.filter((s) => s.fase === "arrasto");
  const depois = a.filter((s) => s.fase === "solto" && s.t - r.soltouEm < 900);
  const tDurante = (s: Amostra) => s.fase === "arrasto";
  const dtsDurante = a.slice(1).flatMap((s, i) => (tDurante(s) && tDurante(a[i]) ? [s.t - a[i].t] : []));
  const dtsDepois = a.slice(1).flatMap((s, i) => (s.fase === "solto" && s.t - r.soltouEm < 900 ? [s.t - a[i].t] : []));
  const p = (l: number[], q: number) => (l.length ? [...l].sort((x, y) => x - y)[Math.min(l.length - 1, Math.floor(l.length * q))] : 0);
  // o pulo maior entre dois quadros seguidos (onde o card está à vista)
  const visto = a.filter((s) => s.fase !== "antes" && s.t - r.soltouEm < 900);
  let pulo = 0;
  for (let i = 1; i < visto.length; i++) pulo = Math.max(pulo, Math.hypot(visto[i].x - visto[i - 1].x, visto[i].y - visto[i - 1].y));
  // ao soltar: do último quadro do arrasto até o card parado, nenhum passo maior que o caminho que faltava (sem teletransporte)
  const ultimo = visto.findLastIndex((s) => s.fase === "arrasto");
  const assentar = visto.slice(Math.max(0, ultimo));
  let puloAoSoltar = 0;
  for (let i = 1; i < assentar.length; i++)
    puloAoSoltar = Math.max(puloAoSoltar, Math.hypot(assentar[i].x - assentar[i - 1].x, assentar[i].y - assentar[i - 1].y));
  const caminho = assentar.length ? Math.hypot(assentar[0].x - destino.x, assentar[0].y - destino.y) : 0;
  const layoutsDurante = new Set(durante.map((s) => s.layout)).size - 1;
  return {
    quadros: a.length,
    dtMax: Math.round(Math.max(...dts)),
    durante: {
      quadros: durante.length,
      p50: Math.round(p(dtsDurante, 0.5)),
      p95: Math.round(p(dtsDurante, 0.95)),
      max: Math.round(Math.max(0, ...dtsDurante)),
      acima34: dtsDurante.filter((d) => d > 34).length,
    },
    soltar: {
      quadros: depois.length,
      p95: Math.round(p(dtsDepois, 0.95)),
      max: Math.round(Math.max(0, ...dtsDepois)),
      acima34: dtsDepois.filter((d) => d > 34).length,
    },
    commitsDurante: r.commits.filter((c) => c.t > r.comecouEm + 50 && c.t < r.soltouEm).length,
    // o DOM que o React mexeria (filhos, classes); o destaque da coluna de destino (data-alvo) conta à parte
    mutacoesDurante: r.mutacoes.filter((m) => m.t > r.comecouEm + 50 && m.t < r.soltouEm && m.tipo !== "attr:data-alvo").length,
    // parado sobre o lugar (os últimos 300 ms antes de soltar), o destino não pisca
    piscadasParado: r.mutacoes.filter((m) => m.t > r.soltouEm - 300 && m.t < r.soltouEm).length,
    layoutsDurante,
    visivelMinDepois: Math.min(...depois.map((s) => s.visivel)),
    quadrosEscondidosDepois: depois.filter((s) => s.visivel < 0.95).length,
    puloMax: Math.round(pulo),
    puloAoSoltar: Math.round(puloAoSoltar),
    caminhoAoSoltar: Math.round(caminho),
    final: depois.length ? { x: Math.round(depois[depois.length - 1].x), y: Math.round(depois[depois.length - 1].y) } : null,
    destino: { x: Math.round(destino.x), y: Math.round(destino.y) },
  };
}

test.beforeEach(async ({ page, context, baseURL }, info) => {
  test.skip(!info.project.name.startsWith("computador"), "arrastar com o mouse: só no computador");
  await semear();
  await instrumentar(page);
  await context.addCookies([
    { name: "mae_sessao", value: sessao().token, url: baseURL! },
    { name: "zro_theme", value: "dark", url: baseURL! },
  ]);
  await page.goto("/app/quadro");
  await expect(page.locator('[data-card="ar-30"]')).toBeVisible();
  // O WebKit e o Chromium headless daqui não compõem na GPU: a luz ambiente (.amb, uma camada própria no Mac e no
  // iPhone) seria repintada inteira a cada quadro e mediria a máquina, não o Quadro. Fica apagada nas medidas.
  await page.addStyleTag({ content: ".amb{display:none!important}" });
  // hidratado e parado (os cards já assentaram)
  await page.waitForFunction(
    () =>
      !!document.querySelector(".q-quadro") &&
      document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
  await page.waitForTimeout(300);
});

test("entre colunas: segue o mouse sem render, o lugar não pisca e o card assenta inteiro de onde foi solto", async ({ page }, info) => {
  const origem = await caixa(page, '[data-card="ar-30"]');
  const a1 = await caixa(page, '[data-card="ar-40"]');
  const a2 = await caixa(page, '[data-card="ar-41"]');
  const de = { x: origem.x + origem.width / 2, y: origem.y + 24 };
  const para = { x: a1.x + a1.width / 2 + 6, y: (a1.y + a1.height + a2.y) / 2 + 4 };
  await gravar(page, "ar-30");
  const salvou = page.waitForResponse((r) => r.url().includes("/api/quadro") && r.request().method() === "POST");
  await arrastar(page, de, para);
  await page.waitForTimeout(1000);
  const r = (await page.evaluate(() => (window as unknown as { __parar: () => unknown }).__parar())) as Relatorio;
  const fim = await caixa(page, '[data-card="ar-30"]');
  const m = resumir(r, fim);
  writeFileSync(`test-results/arrastar-${info.project.name}.json`, JSON.stringify(m, null, 2));
  console.log(`[arrastar ${info.project.name}]`, JSON.stringify(m));
  // o lugar onde o card ficou (na coluna Em aprovação, entre o primeiro e o segundo)
  await expect(page.locator('.q-col[data-col="aprovacao"] [data-card]').nth(1)).toHaveAttribute("data-card", "ar-30");

  // gravou no banco e no lugar certo
  await salvou;
  await expect.poll(async () => (await noBanco("ar-30"))?.coluna).toBe("aprovacao");
  // enquanto o mouse anda: nenhum render do React, nada muda no DOM além do transform, nenhum layout
  expect(m.commitsDurante).toBe(0);
  expect(m.mutacoesDurante).toBe(0);
  expect(m.layoutsDurante).toBe(0);
  expect(m.piscadasParado).toBe(0);
  // ao soltar: o card nunca some nem é cortado, e não pula (anda de onde foi solto até o lugar)
  expect(m.visivelMinDepois).toBeGreaterThan(0.95);
  expect(m.puloAoSoltar).toBeLessThanOrEqual(m.caminhoAoSoltar + 4);
  expect(Math.abs(m.final!.x - fim.x)).toBeLessThan(1.5);
  expect(Math.abs(m.final!.y - fim.y)).toBeLessThan(1.5);

  // depois de o banco confirmar e da volta de 5 s: nada se mexe
  // (a resposta do banco, a página renovada pelo servidor depois de gravar e a pergunta de 5 s): nenhum card desliza
  await page.evaluate(() => {
    const w = window as unknown as { __deslizes: number; __commitsAntes: number; __commits: unknown[] };
    w.__deslizes = 0;
    w.__commitsAntes = w.__commits.length;
    const ate = performance.now() + 5600;
    const quadro = () => {
      for (const el of document.querySelectorAll(".q-quadro [data-card]"))
        if (el.getAnimations().some((a) => a.playState === "running" && !(a instanceof CSSAnimation) && !(a instanceof CSSTransition))) w.__deslizes++;
      if (performance.now() < ate) requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
  });
  await page.waitForTimeout(5800);
  const depois = await caixa(page, '[data-card="ar-30"]');
  expect(Math.abs(depois.x - fim.x)).toBeLessThan(1);
  expect(Math.abs(depois.y - fim.y)).toBeLessThan(1);
  const { deslizes, commits } = await page.evaluate(() => {
    const w = window as unknown as { __deslizes: number; __commitsAntes: number; __commits: unknown[] };
    return { deslizes: w.__deslizes, commits: w.__commits.length - w.__commitsAntes };
  });
  console.log(`[arrastar ${info.project.name}] depois de assentar: ${commits} renders do React, ${deslizes} quadros com card deslizando`);
  expect(deslizes).toBe(0);
  expect(await page.evaluate(() => document.querySelectorAll(".q-quadro [data-card]").length)).toBe(CARDS.length);
});

const ordem = (page: Page, col: string) =>
  page.locator(`.q-col[data-col="${col}"] [data-card]`).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.card));

test("um clique abre a ficha; dentro da coluna reordena; Esc e soltar fora devolvem sem gravar", async ({ page }) => {
  // clique parado: é a ficha, não arrasto
  await page.locator('[data-card="ar-31"] .q-card__abrir').click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // dentro da Pauta: o primeiro vai para depois do terceiro
  const c0 = await caixa(page, '[data-card="ar-00"]');
  const c2 = await caixa(page, '[data-card="ar-02"]');
  const c3 = await caixa(page, '[data-card="ar-03"]');
  await arrastar(page, { x: c0.x + c0.width / 2, y: c0.y + 20 }, { x: c2.x + c2.width / 2, y: (c2.y + c2.height + c3.y) / 2 - (c0.height / 2 - 20) });
  await expect.poll(() => ordem(page, "pauta")).toEqual(["ar-01", "ar-02", "ar-00", "ar-03"]);
  await expect(page.locator(".q-fantasma")).toHaveCount(0);
  await expect.poll(async () => (await noBanco("ar-00"))?.ordem).toBe(3500);

  // Esc no meio do caminho: volta ao lugar e nada vai para o banco
  let gravou = false;
  page.on("request", (r) => {
    if (r.url().includes("/api/quadro") && r.method() === "POST") gravou = true;
  });
  const b = await caixa(page, '[data-card="ar-10"]');
  const alvo = await caixa(page, '[data-card="ar-41"]');
  await arrastar(page, { x: b.x + b.width / 2, y: b.y + 20 }, { x: alvo.x + alvo.width / 2, y: alvo.y + 10 }, { soltar: false });
  await expect(page.locator('.q-col[data-col="aprovacao"][data-alvo]')).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".q-fantasma")).toHaveCount(0);
  await expect(page.locator(".q-col[data-alvo]")).toHaveCount(0);
  expect(await ordem(page, "afazer")).toEqual(["ar-10", "ar-11", "ar-12", "ar-13"]);
  // a ficha não abre com o clique que fecha o arrasto
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // soltar acima do Quadro (nos filtros): também volta
  await arrastar(page, { x: b.x + b.width / 2, y: b.y + 20 }, { x: b.x + 40, y: 60 });
  await expect(page.locator(".q-fantasma")).toHaveCount(0);
  expect(await ordem(page, "afazer")).toEqual(["ar-10", "ar-11", "ar-12", "ar-13"]);
  await page.waitForTimeout(300);
  expect(gravou).toBe(false);
  // o card de origem voltou a aparecer e nada ficou deslocado
  await expect(page.locator('[data-card="ar-10"]')).toBeVisible();
  expect(await page.locator(".q-lugar").evaluateAll((els) => els.filter((e) => (e as HTMLElement).style.transform).length)).toBe(0);
});

test("Entregue recebe no topo; com reduzir movimento o card vai direto, sem voo", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const de = await caixa(page, '[data-card="ar-50"]');
  const e2 = await caixa(page, '[data-card="ar-72"]');
  await arrastar(page, { x: de.x + de.width / 2, y: de.y + 20 }, { x: e2.x + e2.width / 2, y: e2.y + 10 }, { soltar: false });
  // a Entregue não tem ordem manual: o espaço abre no topo, onde o card vai ficar
  const t0 = await page
    .locator('.q-col[data-col="entregue"] .q-lugar')
    .first()
    .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42);
  expect(t0).toBeGreaterThan(20);
  await page.mouse.up();
  // sem voo: logo depois de soltar, o card já está no lugar e nada anima
  await expect.poll(async () => (await ordem(page, "entregue"))[0]).toBe("ar-50");
  expect(await ordem(page, "entregue")).toHaveLength(5);
  await expect(page.locator(".q-fantasma")).toHaveCount(0);
  const animando = await page.evaluate(
    () =>
      [...document.querySelectorAll(".q-quadro [data-card]")]
        .flatMap((el) => el.getAnimations())
        .filter((a) => a.playState === "running" && !(a instanceof CSSTransition)).length,
  );
  expect(animando).toBe(0);
  await expect.poll(async () => (await noBanco("ar-50"))?.coluna).toBe("entregue");
});

test("Mover para…: o card desliza por cima das colunas do caminho, inteiro e sem piscar", async ({ page }) => {
  await page.locator('[data-card="ar-20"] .q-card__mais').click();
  const folha = page.getByRole("dialog", { name: "Mover para" });
  await expect(folha).toBeVisible();
  // um relógio por quadro: enquanto o card desliza, quanto dele se vê e se ele passa por cima (z-index)
  await page.evaluate(() => {
    const w = window as unknown as { __mov: { visivel: number; z: string; anda: boolean }[] };
    w.__mov = [];
    const ate = performance.now() + 4000;
    const quadro = () => {
      const card = document.querySelector<HTMLElement>('[data-card="ar-20"]');
      if (card) {
        const r = card.getBoundingClientRect();
        let op = 1;
        for (let el: HTMLElement | null = card; el; el = el.parentElement) op *= Number(getComputedStyle(el).opacity);
        let area = 1;
        for (let el = card.parentElement; el && el !== document.body; el = el.parentElement) {
          const s = getComputedStyle(el);
          if (s.overflowX === "visible" && s.overflowY === "visible") continue;
          const c = el.getBoundingClientRect();
          const ix = Math.max(0, Math.min(r.right, c.right) - Math.max(r.left, c.left));
          const iy = Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
          area = Math.min(area, (ix * iy) / Math.max(1, r.width * r.height));
        }
        const anda = card.getAnimations().some((a) => a.playState === "running" && !(a instanceof CSSAnimation) && !(a instanceof CSSTransition));
        w.__mov.push({ visivel: op * area, z: getComputedStyle(card).zIndex, anda });
      }
      if (performance.now() < ate) requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
  });
  await folha.locator('button[data-col="aprovado"]').click();
  await expect(page.locator('.q-col[data-col="aprovado"] [data-card="ar-20"]')).toBeVisible();
  await page.waitForTimeout(4100);
  const mov = await page.evaluate(() => (window as unknown as { __mov: { visivel: number; z: string; anda: boolean }[] }).__mov);
  const andando = mov.filter((m) => m.anda);
  console.log("[mover para]", mov.length, "quadros,", andando.length, "andando");
  // (o WebKit headless, sem GPU, desenha poucos quadros com o véu da folha: basta um no meio do caminho)
  expect(andando.length).toBeGreaterThan(0);
  // de Fazendo até Aprovado passa por cima de Revisão e Em aprovação: nunca cortado, nunca transparente, por cima
  expect(Math.min(...andando.map((m) => m.visivel))).toBeGreaterThan(0.95);
  expect(andando.every((m) => m.z === "2")).toBe(true);
  // parado: volta ao normal
  expect(await page.locator('[data-card="ar-20"]').evaluate((el) => getComputedStyle(el).zIndex)).toBe("auto");
});
