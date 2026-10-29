/**
 * Criação · Fluxo, a tela (fase F5): criar um fluxo, nota, colar texto (vira notas), colar imagem (sobe e vira nó),
 * colar link, ligar puxando a bolinha, mover, apagar com Desfazer, seção em volta do escolhido, e recarregar mantém
 * tudo; quem só lê anda e lê sem mudar nada; no iPhone, segurar 280 ms ergue o nó e a Lista mostra o fluxo por seção.
 * Organização própria (e2e/preparar.ts). Com SHOTS_DIR, guarda capturas (`fluxo-*`).
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const ARQUIVO = "test-results/e2e-sessao-fluxo.json";
const sessao = () => JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string; leitura: string; org: string };
const SHOTS = process.env.SHOTS_DIR;
const foto = async (page: Page, nome: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${nome}.png` });
};

/** ⌘V de texto (o mesmo evento que o navegador manda ao colar). */
async function colarTexto(page: Page, texto: string) {
  await page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, texto);
}

/** ⌘V de uma imagem PNG desenhada na hora (um pôr do sol em degradê). */
async function colarImagem(page: Page) {
  await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 480;
    c.height = 270;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 270);
    grad.addColorStop(0, "#f6b26b");
    grad.addColorStop(0.6, "#e06666");
    grad.addColorStop(1, "#4c2a4a");
    g.fillStyle = grad;
    g.fillRect(0, 0, 480, 270);
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), "image/png"));
    const dt = new DataTransfer();
    dt.items.add(new File([b], "contraluz.png", { type: "image/png" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
}

const nos = (page: Page, tipo?: string) => page.locator(tipo ? `.fx-plano [data-no][data-tipo="${tipo}"]` : ".fx-plano [data-no]");
const salvo = (page: Page) => expect(page.locator(".fx-salvo")).toHaveText("Salvo", { timeout: 10_000 });

async function caixa(page: Page, sel: string) {
  const b = await page.locator(sel).boundingBox();
  if (!b) throw new Error(`sem caixa: ${sel}`);
  return b;
}

/** Arrasta com o mouse de a até b em passos. */
async function arrastar(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + (b.x - a.x) / 3, a.y + (b.y - a.y) / 3, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

/** Cria um fluxo pela API (como a tela faz) com algumas notas numa seção; devolve o id. */
async function fluxoPronto(page: Page, titulo: string) {
  const origem = new URL(page.url() === "about:blank" ? "http://localhost" : page.url()).origin;
  const r = await page.request.post("/api/criacao/fluxo", { data: { op: "criar", titulo }, headers: { Origin: origem } });
  expect(r.status()).toBe(201);
  const { id } = (await r.json()) as { id: string };
  const s = crypto.randomUUID();
  const n1 = crypto.randomUUID();
  const n2 = crypto.randomUUID();
  const ops = [
    { op: "criar_no", id: s, tipo: "secao", x: 0, y: 0, w: 640, h: 380, z: 1, dados: { nome: "Clima e luz", cor: "pessego" } },
    { op: "criar_no", id: n1, tipo: "nota", x: 40, y: 70, w: 200, h: 120, z: 2, secaoId: s, dados: { texto: "Paleta quente, nada de azul.", cor: "amarelo" } },
    { op: "criar_no", id: n2, tipo: "nota", x: 760, y: 120, w: 200, h: 120, z: 3, dados: { texto: "Trilha: violão e piano.", cor: "menta" } },
    { op: "criar_ligacao", de: n1, para: n2, rotulo: "clima" },
  ];
  const o = await page.request.post("/api/criacao/fluxo", { data: { op: "ops", id, ops }, headers: { Origin: origem } });
  expect(o.status()).toBe(200);
  return { id, n1, n2, secao: s };
}

test.describe("Fluxo no computador", () => {
  test.beforeEach(async ({ context, baseURL, page }, info) => {
    test.skip(info.project.name !== "computador", "mouse e teclado: só no computador");
    await context.addCookies([{ name: "mae_sessao", value: sessao().token, url: baseURL! }]);
    // miniatura do YouTube sem rede (o endereço é conhecido; só não buscamos fora no teste)
    await page.route("https://i.ytimg.com/**", (r) => r.fulfill({ status: 204, body: "" }));
  });

  test("criar, nota, colar texto, imagem e link, ligar, mover, apagar e desfazer, seção, e recarregar mantém", async ({ page }) => {
    await page.goto("/app/criacao/fluxos");
    await expect(page.getByRole("heading", { name: "Nenhum fluxo ainda" })).toBeVisible();
    await page.getByRole("button", { name: "Novo fluxo" }).first().click();
    await page.waitForURL(/\/app\/criacao\/fluxos\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Cole para começar" })).toBeVisible();
    await foto(page, "fluxo-vazio");

    // título
    await page.locator(".fx-titulo__botao").click();
    const titulo = page.getByRole("textbox", { name: "Título do fluxo" });
    await titulo.fill("Verão Café Aurora");
    await titulo.press("Enter");
    await expect(page.locator(".fx-titulo h1")).toHaveText("Verão Café Aurora");

    // nota pela barra: nasce editando
    await page.getByRole("navigation", { name: "Ferramentas" }).getByRole("button", { name: "Nota" }).click();
    const campo = page.getByRole("textbox", { name: "Texto da nota" });
    await expect(campo).toBeFocused();
    await campo.fill("Gancho: a xícara antes do sol nascer.");
    await page.keyboard.press("Escape");
    await expect(nos(page, "nota")).toHaveCount(1);
    await expect(nos(page, "nota").first()).toContainText("Gancho");

    // colar texto com dois parágrafos: duas notas
    await page.mouse.click(1200, 700);
    await colarTexto(page, "Paleta quente, nada de azul.\n\nRitmo lento nos 5 primeiros segundos.");
    await expect(nos(page, "nota")).toHaveCount(3);

    // colar imagem: sobe (WebP no banco) e vira nó com a foto
    const subiu = page.waitForResponse((r) => r.url().includes("/api/criacao/img?fluxo=") && r.request().method() === "POST");
    await colarImagem(page);
    expect((await subiu).status()).toBe(201);
    await expect(nos(page, "imagem")).toHaveCount(1);
    await expect
      .poll(() =>
        nos(page, "imagem")
          .locator("img")
          .evaluate((i) => (i as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);

    // colar link do YouTube: reconhecido pelo endereço
    await colarTexto(page, "https://youtu.be/dQw4w9WgXcQ");
    await expect(nos(page, "link")).toHaveCount(1);
    await expect(nos(page, "link")).toContainText("youtube.com");
    await salvo(page);

    // enquadrar tudo e ligar: puxa a bolinha da primeira nota até a segunda
    await page.getByRole("button", { name: "Mostrar tudo" }).click();
    await page.waitForTimeout(450);
    const notas = nos(page, "nota");
    const idA = await notas.nth(0).getAttribute("data-no");
    const idB = await notas.nth(1).getAttribute("data-no");
    await page.locator(`[data-no="${idA}"]`).hover();
    const porta = await caixa(page, `[data-no="${idA}"] .fx-porta`);
    const alvoB = await caixa(page, `[data-no="${idB}"]`);
    await arrastar(page, { x: porta.x + porta.width / 2, y: porta.y + porta.height / 2 }, { x: alvoB.x + alvoB.width / 2, y: alvoB.y + alvoB.height / 2 });
    await expect(page.locator(".fx-ligacoes [data-lig]")).toHaveCount(1);
    await foto(page, "fluxo-ligado");

    // mover: arrastar a nota B 120 px para a direita
    const antes = await caixa(page, `[data-no="${idB}"]`);
    await arrastar(page, { x: antes.x + 30, y: antes.y + 30 }, { x: antes.x + 150, y: antes.y + 60 });
    const depois = await caixa(page, `[data-no="${idB}"]`);
    expect(depois.x - antes.x).toBeGreaterThan(80);
    const leftMovido = await page.locator(`[data-no="${idB}"]`).evaluate((e) => (e as HTMLElement).style.left);

    // apagar o link (Delete) e desfazer pelo aviso
    await nos(page, "link").click();
    await page.keyboard.press("Delete");
    await expect(nos(page, "link")).toHaveCount(0);
    await page.locator(".fx-aviso").getByRole("button", { name: "Desfazer" }).click();
    await expect(nos(page, "link")).toHaveCount(1);

    // seção em volta das duas notas ligadas (laço e "Seção")
    await page.locator(`[data-no="${idA}"]`).click();
    await page.locator(`[data-no="${idB}"]`).click({ modifiers: ["Shift"] });
    await page.getByRole("navigation", { name: "Ferramentas" }).getByRole("button", { name: "Seção" }).click();
    const nome = page.getByRole("textbox", { name: "Nome da seção" });
    await nome.fill("Narrativa");
    await nome.press("Enter");
    await expect(nos(page, "secao")).toHaveCount(1);
    await salvo(page);
    await foto(page, "fluxo-pronto");

    // recarregar: tudo no lugar (a vista guardada neste aparelho também)
    await page.reload();
    await expect(page.locator(".fx-titulo h1")).toHaveText("Verão Café Aurora");
    await expect(nos(page, "nota")).toHaveCount(3);
    await expect(nos(page, "imagem")).toHaveCount(1);
    await expect(nos(page, "link")).toHaveCount(1);
    await expect(nos(page, "secao")).toContainText("Narrativa");
    await expect(page.locator(".fx-ligacoes [data-lig]")).toHaveCount(1);
    expect(await page.locator(`[data-no="${idB}"]`).evaluate((e) => (e as HTMLElement).style.left)).toBe(leftMovido);

    // Lista: o mesmo fluxo por seção
    await page.getByRole("tab", { name: "Lista" }).click();
    await expect(page.getByRole("region", { name: "Narrativa" })).toContainText("Gancho");
    await expect(page.getByRole("region", { name: "Ligações" })).toBeVisible();
    await page.getByRole("tab", { name: "Canvas" }).click();
    await expect(page.locator(".fx-tela")).toBeVisible();

    // a lista de fluxos mostra o cartão
    await page.goto("/app/criacao/fluxos");
    await expect(page.locator(".fx-cartao")).toContainText("Verão Café Aurora");
  });

  test("quem só lê anda e lê; nada muda (nem pela API)", async ({ page, context, baseURL }) => {
    await page.goto("/app/criacao/fluxos");
    const { id } = await fluxoPronto(page, "Só para ler");
    await context.clearCookies();
    await context.addCookies([{ name: "mae_sessao", value: sessao().leitura, url: baseURL! }]);
    await page.goto(`/app/criacao/fluxos/${id}`);
    await expect(page.locator(".fx-salvo")).toHaveText("Só leitura");
    await expect(page.getByRole("navigation", { name: "Ferramentas" })).toHaveCount(0);
    await expect(nos(page, "nota")).toHaveCount(2);
    await page.locator(".fx-plano [data-tipo='nota']").first().dblclick();
    await expect(page.getByRole("textbox", { name: "Texto da nota" })).toHaveCount(0);
    const r = await page.request.post("/api/criacao/fluxo", {
      data: { op: "ops", id, ops: [{ op: "apagar_no", id: await nos(page, "nota").first().getAttribute("data-no") }] },
      headers: { Origin: new URL(page.url()).origin },
    });
    expect(r.status()).toBe(403);
    await page.goto("/app/criacao/fluxos");
    await expect(page.getByRole("button", { name: "Novo fluxo" })).toHaveCount(0);
  });
});

test.describe("Fluxo no iPhone", () => {
  test.beforeEach(async ({ context, baseURL }, info) => {
    test.skip(info.project.name !== "iphone", "toque: só no iPhone (Chromium)");
    await context.addCookies([{ name: "mae_sessao", value: sessao().token, url: baseURL! }]);
  });

  test("segurar 280 ms ergue a nota, ela segue o dedo e fica; a Lista lê por seção; a barra de abas fica", async ({ page }) => {
    await page.goto("/app/criacao/fluxos");
    const { id, n2 } = await fluxoPronto(page, "Toque");
    await page.goto(`/app/criacao/fluxos/${id}`);
    await expect(nos(page)).toHaveCount(3);
    // a barra de abas do celular continua (Hoje · Quadro · Aprovar · Mais)
    await expect(page.locator(".barra")).toBeVisible();
    await expect(page.locator(".barra a")).toHaveText(["Hoje", "Quadro", "Aprovar", "Mais"]);

    const el = page.locator(`[data-no="${n2}"]`);
    const b0 = await caixa(page, `[data-no="${n2}"]`);
    const leftAntes = await el.evaluate((e) => (e as HTMLElement).style.left);
    const p0 = { x: b0.x + b0.width / 2, y: b0.y + b0.height / 2 };
    // um dedo: aperta, segura 350 ms (ergue), anda 90 px para baixo e solta
    const erguido = await page.evaluate(
      async ({ p0 }) => {
        const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
        const alvo = document.elementFromPoint(p0.x, p0.y)!;
        const ev = (tipo: string, x: number, y: number) =>
          alvo.dispatchEvent(
            new PointerEvent(tipo, {
              bubbles: true,
              cancelable: true,
              composed: true,
              pointerId: 7,
              pointerType: "touch",
              isPrimary: true,
              clientX: x,
              clientY: y,
              buttons: tipo === "pointerup" ? 0 : 1,
            }),
          );
        ev("pointerdown", p0.x, p0.y);
        await espera(350);
        const no = alvo.closest<HTMLElement>("[data-no]")!;
        const ergueu = no.dataset.arrastando === "erguido";
        for (let i = 1; i <= 10; i++) {
          ev("pointermove", p0.x, p0.y + i * 9);
          await espera(16);
        }
        ev("pointerup", p0.x, p0.y + 90);
        return ergueu;
      },
      { p0 },
    );
    expect(erguido).toBe(true);
    await expect.poll(async () => (await caixa(page, `[data-no="${n2}"]`)).y - b0.y).toBeGreaterThan(40);
    expect(await el.evaluate((e) => (e as HTMLElement).style.left)).toBe(leftAntes);
    await salvo(page);

    // um toque rápido sem segurar não arrasta: anda a tela
    await foto(page, "fluxo-iphone");
    await page.reload();
    await expect.poll(async () => (await caixa(page, `[data-no="${n2}"]`)).y - b0.y).toBeGreaterThan(40);

    // a Lista: o fluxo por seção, para ler
    await page.getByRole("tab", { name: "Lista" }).click();
    const secao = page.getByRole("region", { name: "Clima e luz" });
    await expect(secao).toContainText("Paleta quente");
    await expect(page.getByRole("region", { name: "Fora das seções" })).toContainText("Trilha");
    await expect(page.getByRole("region", { name: "Ligações" })).toContainText("clima");
    await foto(page, "fluxo-iphone-lista");
    // "Ver no canvas" volta ao canvas com o item escolhido
    await secao.getByRole("button", { name: "Ver no canvas" }).first().click();
    await expect(page.locator(".fx-tela")).toBeVisible();
    await expect(page.locator(".fx-plano [data-sel]")).toHaveCount(1);

    // o "+" abre a folha Adicionar
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByRole("dialog", { name: "Adicionar" })).toBeVisible();
    await page.getByRole("dialog", { name: "Adicionar" }).getByRole("button", { name: "Nota" }).click();
    await expect(page.getByRole("textbox", { name: "Texto da nota" })).toBeVisible();
  });
});
