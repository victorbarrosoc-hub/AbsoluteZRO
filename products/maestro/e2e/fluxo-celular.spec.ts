/**
 * O Fluxo no iPhone e no trackpad (titular, 03/11/2026, prints do iPhone): a nota nunca fica estreita (largura mínima,
 * cresce com o texto), a pinça que começa na alça não deixa a nota torta nem a seta solta, os controles ficam por cima
 * do que está no canvas (imagem atrás da pílula do zoom), editar com o teclado não rola o canvas para baixo do
 * cabeçalho (campo de 16 px: o iPhone não amplia) e, no computador, ⌥ + rolagem e a pinça do trackpad aproximam em
 * volta do ponteiro, dentro dos limites. Organização do Fluxo (e2e/preparar.ts). Com SHOTS_DIR, guarda `fxc-*`.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const sessao = () => JSON.parse(readFileSync("test-results/e2e-sessao-fluxo.json", "utf8")) as { token: string };
const SHOTS = process.env.SHOTS_DIR;
const foto = async (page: Page, nome: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${nome}.png` });
};

type Caixa = { x: number; y: number; w: number; h: number };

/** Um fluxo pronto pela API: nota estreita (como a do print) ligada a outra e uma imagem onde fica o zoom no iPhone. */
async function fluxoDoPrint(page: Page, titulo: string, comImagem: boolean) {
  const origem = new URL(page.url()).origin;
  const r = await page.request.post("/api/criacao/fluxo", { data: { op: "criar", titulo }, headers: { Origin: origem } });
  expect(r.status()).toBe(201);
  const { id } = (await r.json()) as { id: string };
  let imagemId: string | null = null;
  if (comImagem) {
    imagemId = await page.evaluate(async (fluxo) => {
      const c = document.createElement("canvas");
      c.width = 720;
      c.height = 480;
      const g = c.getContext("2d")!;
      const grad = g.createLinearGradient(0, 0, 720, 480);
      grad.addColorStop(0, "#f6b26b");
      grad.addColorStop(1, "#4c2a4a");
      g.fillStyle = grad;
      g.fillRect(0, 0, 720, 480);
      const b = await new Promise<Blob>((ok) => c.toBlob((x) => ok(x!), "image/png"));
      const res = await fetch(`/api/criacao/img?fluxo=${encodeURIComponent(fluxo)}`, { method: "POST", body: b, headers: { "Content-Type": "image/png" } });
      return ((await res.json()) as { imagem: { id: string } }).imagem.id;
    }, id);
  }
  const estreita = crypto.randomUUID();
  const outra = crypto.randomUUID();
  const ops: Record<string, unknown>[] = [
    // 28 px: o servidor aceita (lado mínimo 16); a tela é que não pode desenhar uma letra por linha
    { op: "criar_no", id: estreita, tipo: "nota", x: 30, y: 150, w: 28, h: 120, z: 2, dados: { texto: "Abertura com a xícara", cor: "rosa" } },
    { op: "criar_no", id: outra, tipo: "nota", x: 230, y: 300, w: 140, h: 100, z: 3, dados: { texto: "Trilha", cor: "menta" } },
    { op: "criar_ligacao", de: estreita, para: outra, rotulo: null },
    // uma nota longe, embaixo: o canvas tem o que rolar (é o que o Safari rola com o teclado aberto)
    { op: "criar_no", id: crypto.randomUUID(), tipo: "nota", x: 40, y: 1800, w: 200, h: 120, z: 5, dados: { texto: "Fim", cor: "amarelo" } },
  ];
  if (imagemId)
    ops.push({ op: "criar_no", id: crypto.randomUUID(), tipo: "imagem", x: 0, y: 440, w: 380, h: 280, z: 4, imagemId, dados: { legenda: "Contraluz" } });
  const o = await page.request.post("/api/criacao/fluxo", { data: { op: "ops", id, ops }, headers: { Origin: origem } });
  expect(o.status()).toBe(200);
  // a vista 1:1 com o mundo na origem (guardada no aparelho, como a tela guarda)
  await page.evaluate((fid) => localStorage.setItem(`maestro:fluxo:vista:${fid}`, JSON.stringify({ x: 0, y: 0, z: 1 })), id);
  return { id, estreita, outra };
}

/** Toques de mentira (o mesmo PointerEvent que o Safari manda), um dedo por id. */
async function dedos(page: Page, passos: { t: "down" | "move" | "up"; id: number; x: number; y: number; espera?: number }[]) {
  await page.evaluate(async (ps) => {
    const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const alvos = new Map<number, Element>();
    for (const p of ps) {
      if (p.t === "down") alvos.set(p.id, document.elementFromPoint(p.x, p.y)!);
      const alvo = alvos.get(p.id)!;
      alvo.dispatchEvent(
        new PointerEvent(p.t === "down" ? "pointerdown" : p.t === "move" ? "pointermove" : "pointerup", {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: p.id,
          pointerType: "touch",
          isPrimary: p.id === ps[0].id,
          clientX: p.x,
          clientY: p.y,
          buttons: p.t === "up" ? 0 : 1,
        }),
      );
      await espera(p.espera ?? 16);
    }
  }, passos);
}

const tocar = (page: Page, x: number, y: number) =>
  dedos(page, [
    { t: "down", id: 3, x, y, espera: 40 },
    { t: "up", id: 3, x, y, espera: 60 },
  ]);

/** A caixa do nó no mundo, como está desenhada (estilo + tamanho real), e a da ligação (início e fim do caminho). */
async function desenho(page: Page, de: string, para: string) {
  return page.evaluate(
    ({ de, para }) => {
      const cx = (id: string) => {
        const el = document.querySelector<HTMLElement>(`.fx-plano [data-no="${id}"]`)!;
        return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      };
      const d = document.querySelector(".fx-ligacoes [data-lig] .fx-lig__linha")!.getAttribute("d")!;
      const n = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      return { a: cx(de), b: cx(para), ini: { x: n[0], y: n[1] }, fim: { x: n[n.length - 2], y: n[n.length - 1] } };
    },
    { de, para },
  );
}

/** O ponto está na borda da caixa (a linha encosta no nó, não no vazio). */
const naBorda = (p: { x: number; y: number }, c: Caixa, folga = 1.5) => {
  const dentroX = p.x >= c.x - folga && p.x <= c.x + c.w + folga;
  const dentroY = p.y >= c.y - folga && p.y <= c.y + c.h + folga;
  const encosta = Math.abs(p.x - c.x) <= folga || Math.abs(p.x - (c.x + c.w)) <= folga || Math.abs(p.y - c.y) <= folga || Math.abs(p.y - (c.y + c.h)) <= folga;
  return dentroX && dentroY && encosta;
};

test.describe("Fluxo no iPhone (prints do titular)", () => {
  test.beforeEach(async ({ context, baseURL }, info) => {
    test.skip(!info.project.name.startsWith("iphone"), "toque: só no iPhone");
    await context.addCookies([
      { name: "mae_sessao", value: sessao().token, url: baseURL! },
      { name: "zro_theme", value: "dark", url: baseURL! },
    ]);
  });

  test("a nota estreita ganha largura, os controles ficam por cima da imagem e a seta encosta nos nós", async ({ page }) => {
    await page.goto("/app/criacao/fluxos");
    const { id, estreita, outra } = await fluxoDoPrint(page, "Print do iPhone", true);
    await page.goto(`/app/criacao/fluxos/${id}`);
    const nota = page.locator(`.fx-plano [data-no="${estreita}"]`);
    await expect(nota).toBeVisible();
    await expect(page.locator(".fx-plano [data-tipo='imagem'] img")).toBeVisible();
    await page.waitForTimeout(500);
    await foto(page, "fxc-nota-e-controles");

    // nunca uma letra por linha: a nota tem largura de nota e o texto quebra por palavra
    const largura = await nota.evaluate((e) => (e as HTMLElement).offsetWidth);
    expect(largura).toBeGreaterThanOrEqual(120);
    const linhas = await nota.locator(".fx-nota__texto").evaluate((p) => {
      const r = document.createRange();
      r.selectNodeContents(p);
      return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
    });
    expect(linhas).toBeLessThanOrEqual(3);

    // a seta sai e chega na borda do que está desenhado
    const d0 = await desenho(page, estreita, outra);
    expect(naBorda(d0.ini, d0.a)).toBe(true);
    expect(naBorda(d0.fim, d0.b)).toBe(true);

    // os controles ficam por cima: o toque no zoom é do zoom, e a pílula não deixa a imagem aparecer através dela
    const zoom = page.locator(".fx-pe .fx-zoom");
    const bz = (await zoom.boundingBox())!;
    const dono = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest(".fx-pe"), { x: bz.x + bz.width / 2, y: bz.y + bz.height / 2 });
    expect(dono).toBe(true);
    const imagemAtras = await page.evaluate(({ x, y }) => document.elementsFromPoint(x, y).some((e) => e.closest(".fx-imagem")), {
      x: bz.x + bz.width / 2,
      y: bz.y + bz.height / 2,
    });
    expect(imagemAtras).toBe(true);
    const opaco = await zoom.evaluate((e) => {
      const c = getComputedStyle(e).backgroundColor;
      const a = c.match(/\/\s*([\d.]+)\)$/) ?? c.match(/rgba\([^)]*,\s*([\d.]+)\)$/);
      return a ? Number(a[1]) : 1;
    });
    expect(opaco).toBeGreaterThanOrEqual(0.85);
    // o canvas é uma camada só: nada dele sobe acima do que flutua
    expect(await page.locator(".fx-tela").evaluate((e) => getComputedStyle(e).isolation)).toBe("isolate");
  });

  test("a pinça que começa na alça não deixa a nota estreita nem a seta no vazio", async ({ page }) => {
    await page.goto("/app/criacao/fluxos");
    const { id, estreita, outra } = await fluxoDoPrint(page, "Pinça na alça", false);
    await page.goto(`/app/criacao/fluxos/${id}`);
    const nota = page.locator(`.fx-plano [data-no="${estreita}"]`);
    await expect(nota).toBeVisible();
    await page.waitForTimeout(400);
    // escolhe a nota (aparece a alça) e põe o dedo nela; o segundo dedo chega e vira pinça
    const b = (await nota.boundingBox())!;
    await tocar(page, b.x + b.width / 2, b.y + 20);
    const alca = (await page.locator(`.fx-plano [data-no="${estreita}"] .fx-alca`).boundingBox())!;
    const a0 = { x: alca.x + alca.width / 2, y: alca.y + alca.height / 2 };
    // só tocar na alça (sem arrastar) não tira a largura da nota (antes ela encolhia até a menor palavra)
    await dedos(page, [
      { t: "down", id: 9, x: a0.x, y: a0.y, espera: 40 },
      { t: "up", id: 9, x: a0.x, y: a0.y, espera: 80 },
    ]);
    expect(await nota.evaluate((e) => (e as HTMLElement).offsetWidth)).toBeGreaterThanOrEqual(120);
    const passos: Parameters<typeof dedos>[1] = [{ t: "down", id: 11, x: a0.x, y: a0.y }];
    for (let i = 1; i <= 6; i++) passos.push({ t: "move", id: 11, x: a0.x - i * 25, y: a0.y });
    passos.push({ t: "down", id: 12, x: 300, y: 470 });
    for (let i = 1; i <= 6; i++) passos.push({ t: "move", id: 11, x: a0.x - 150 - i * 4, y: a0.y }, { t: "move", id: 12, x: 300 + i * 6, y: 470 + i * 6 });
    passos.push({ t: "up", id: 12, x: 336, y: 506 }, { t: "up", id: 11, x: a0.x - 174, y: a0.y, espera: 120 });
    await dedos(page, passos);

    // a outra nota anda (segurar e arrastar): a seta é redesenhada pelo que está guardado
    const bo = (await page.locator(`.fx-plano [data-no="${outra}"]`).boundingBox())!;
    const p0 = { x: bo.x + bo.width / 2, y: bo.y + bo.height / 2 };
    const anda: Parameters<typeof dedos>[1] = [{ t: "down", id: 21, x: p0.x, y: p0.y, espera: 350 }];
    for (let i = 1; i <= 8; i++) anda.push({ t: "move", id: 21, x: p0.x + i * 6, y: p0.y + i * 8 });
    anda.push({ t: "up", id: 21, x: p0.x + 48, y: p0.y + 64, espera: 200 });
    await dedos(page, anda);
    await page.waitForTimeout(300);
    await foto(page, "fxc-pinca-na-alca");

    const d = await desenho(page, estreita, outra);
    expect(d.a.w).toBeGreaterThanOrEqual(120);
    expect(await page.locator(".fx-tela").getAttribute("data-gesto")).toBeNull();
    expect(naBorda(d.ini, d.a)).toBe(true);
    expect(naBorda(d.fim, d.b)).toBe(true);
  });

  test("editar a nota: campo de 16 px, cresce com o texto e o canvas não rola para baixo do cabeçalho", async ({ page }) => {
    await page.goto("/app/criacao/fluxos");
    const { id, estreita, outra } = await fluxoDoPrint(page, "Teclado", false);
    await page.goto(`/app/criacao/fluxos/${id}`);
    const nota = page.locator(`.fx-plano [data-no="${estreita}"]`);
    await expect(nota).toBeVisible();
    await page.waitForTimeout(400);
    const b = (await nota.boundingBox())!;
    // tocar escolhe; tocar de novo edita
    await tocar(page, b.x + b.width / 2, b.y + 20);
    await tocar(page, b.x + b.width / 2, b.y + 20);
    const campo = page.getByRole("textbox", { name: "Texto da nota" });
    await expect(campo).toBeFocused();
    expect(await campo.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
    const alturaAntes = await nota.evaluate((e) => (e as HTMLElement).offsetHeight);
    await campo.press("End");
    await page.keyboard.type(" e o vapor subindo devagar, contra a luz da janela, antes do primeiro gole do dia.");
    // o Safari rola quem tem overflow escondido para mostrar o cursor acima do teclado: a tela volta sozinha
    await page.evaluate(() => {
      document.querySelector<HTMLElement>(".fx-tela")!.scrollTop = 180;
      document.querySelector<HTMLElement>(".fx-palco")!.scrollTop = 120;
    });
    await page.waitForTimeout(250);
    await foto(page, "fxc-editando");
    expect(await page.evaluate(() => [document.querySelector(".fx-tela")!.scrollTop, document.querySelector(".fx-palco")!.scrollTop])).toEqual([0, 0]);
    const largura = await campo.evaluate((e) => (e as HTMLElement).clientWidth);
    expect(largura).toBeGreaterThanOrEqual(80);
    await expect.poll(() => nota.evaluate((e) => (e as HTMLElement).offsetHeight)).toBeGreaterThan(alturaAntes);

    // sair grava o texto e o tamanho novo; a seta segue presa na nota que cresceu
    await campo.evaluate((e) => (e as HTMLElement).blur());
    await expect(page.locator(".fx-salvo")).toHaveText("Salvo", { timeout: 10_000 });
    const d = await desenho(page, estreita, outra);
    expect(d.a.h).toBeGreaterThan(alturaAntes);
    expect(naBorda(d.ini, d.a)).toBe(true);
    await page.reload();
    await expect(nota).toContainText("antes do primeiro gole");
    // visível de fato (o streaming entrega o trecho escondido antes)
    await expect(nota).toBeVisible();
    await expect.poll(() => nota.evaluate((e) => (e as HTMLElement).offsetHeight)).toBeGreaterThan(alturaAntes);
    await foto(page, "fxc-depois-de-editar");
  });
});

test.describe("Fluxo no computador: zoom pelo trackpad", () => {
  test.beforeEach(async ({ context, baseURL }, info) => {
    test.skip(info.project.name !== "computador", "trackpad: só no computador");
    await context.addCookies([{ name: "mae_sessao", value: sessao().token, url: baseURL! }]);
  });

  test("⌥ + rolagem e a pinça do trackpad aproximam em volta do ponteiro, sem passar dos limites", async ({ page }) => {
    await page.goto("/app/criacao/fluxos");
    const { id, outra } = await fluxoDoPrint(page, "Trackpad", false);
    await page.goto(`/app/criacao/fluxos/${id}`);
    const alvo = page.locator(`.fx-plano [data-no="${outra}"]`);
    await expect(alvo).toBeVisible();
    await page.waitForTimeout(400);
    const zoom = () => page.locator(".fx-tela").evaluate((e) => Number((e as HTMLElement).dataset.zoom));
    const centro = async () => {
      const b = (await alvo.boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const c0 = await centro();
    await page.mouse.move(c0.x, c0.y);
    expect(await zoom()).toBe(100);

    // ⌥ + dois dedos para cima: aproxima, e o nó sob o ponteiro fica no lugar
    await page.keyboard.down("Alt");
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -40);
    await page.keyboard.up("Alt");
    await expect.poll(zoom).toBeGreaterThan(100);
    const c1 = await centro();
    expect(Math.abs(c1.x - c0.x)).toBeLessThan(3);
    expect(Math.abs(c1.y - c0.y)).toBeLessThan(3);

    // sem ⌥ a rolagem só anda (não muda o zoom)
    const z1 = await zoom();
    await page.mouse.wheel(0, 60);
    expect(await zoom()).toBe(z1);

    // a pinça do trackpad chega como roda com Ctrl: afasta em volta do ponteiro
    const c2 = await centro();
    await page.mouse.move(c2.x, c2.y);
    await page.keyboard.down("Control");
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 30);
    await page.keyboard.up("Control");
    await expect.poll(zoom).toBeLessThan(z1);
    const c3 = await centro();
    expect(Math.abs(c3.x - c2.x)).toBeLessThan(3);

    // limites: muito ⌥ + rolagem para cima para em 400%, para baixo em 10%
    await page.keyboard.down("Alt");
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -120);
    expect(await zoom()).toBe(400);
    for (let i = 0; i < 80; i++) await page.mouse.wheel(0, 120);
    await page.keyboard.up("Alt");
    expect(await zoom()).toBe(10);
  });
});
