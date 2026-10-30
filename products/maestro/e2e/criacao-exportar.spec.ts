/**
 * Criação · Fluxo, exportar e compartilhar (fase F6): o menu Exportar, "Copiar para IA" (sem link: imagens só pela
 * legenda; com link sem PIN e pedido: pelo token), criar link com PIN → abrir num navegador limpo → PIN → o fluxo só
 * de leitura (fora da busca); revogar → some; o pacote .zip; o JSON; mandar para um card → a ficha mostra o fluxo; no
 * iPhone, a folha Exportar e a página do link. Organização própria (e2e/preparar.ts). Com SHOTS_DIR, guarda capturas
 * (`exp-*`) no claro e no escuro.
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { lerZip } from "../src/lib/zip";

const ARQUIVO = "test-results/e2e-sessao-exportar.json";
const sessao = () => JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string; leitura: string; org: string };
const SHOTS = process.env.SHOTS_DIR;
const foto = async (page: Page, nome: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${nome}.png` });
};
const TEMAS = ["light", "dark"] as const;
const tema = (context: BrowserContext, baseURL: string, t: string) => context.addCookies([{ name: "zro_theme", value: t, url: baseURL }]);

/** Um fluxo pela API (como a tela faz): seção com imagem e nota, um link e a referência ao card. Devolve o id. */
async function fluxoPronto(page: Page, titulo: string) {
  const origem = new URL(page.url()).origin;
  const h = { Origin: origem };
  const r = await page.request.post("/api/criacao/fluxo", { data: { op: "criar", titulo }, headers: h });
  expect(r.status()).toBe(201);
  const { id } = (await r.json()) as { id: string };
  const foto = await sharp({ create: { width: 480, height: 270, channels: 3, background: "#e07a5f" } })
    .png()
    .toBuffer();
  const up = await page.request.post(`/api/criacao/img?fluxo=${id}`, { data: foto, headers: { ...h, "Content-Type": "image/png" } });
  expect(up.status()).toBe(201);
  const { imagem } = (await up.json()) as { imagem: { id: string; sha256: string } };
  const s = crypto.randomUUID();
  const nota = crypto.randomUUID();
  const ops = [
    { op: "criar_no", id: s, tipo: "secao", x: 0, y: 0, w: 640, h: 380, z: 1, dados: { nome: "Clima e luz", cor: "pessego" } },
    { op: "criar_no", tipo: "imagem", x: 30, y: 60, w: 260, h: 180, z: 2, secaoId: s, imagemId: imagem.id, dados: { legenda: "Fim de tarde, contraluz" } },
    {
      op: "criar_no",
      id: nota,
      tipo: "nota",
      x: 320,
      y: 70,
      w: 220,
      h: 120,
      z: 3,
      secaoId: s,
      dados: { texto: "Paleta quente, nada de azul.", cor: "amarelo" },
    },
    { op: "criar_no", tipo: "link", x: 760, y: 60, w: 240, h: 100, z: 4, dados: { url: "https://vimeo.com/76979871", titulo: "Referência de ritmo" } },
    { op: "criar_no", tipo: "card", x: 760, y: 220, w: 240, h: 80, z: 5, cardId: "ex-card-1" },
  ];
  const o = await page.request.post("/api/criacao/fluxo", { data: { op: "ops", id, ops }, headers: h });
  expect(o.status()).toBe(200);
  return { id, imagem };
}

const exportar = (page: Page) => page.getByRole("button", { name: "Exportar" });
const menu = (page: Page) => page.getByRole("menu", { name: "Exportar" });
const lerClipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

test.describe("Exportar no computador", () => {
  test.beforeEach(async ({ context, baseURL }, info) => {
    test.skip(info.project.name !== "computador", "mouse e teclado: só no computador");
    await context.addCookies([{ name: "mae_sessao", value: sessao().token, url: baseURL! }]);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL! });
  });

  test("copiar para IA, link com PIN aberto de fora, revogar, pacote, JSON e mandar para um card", async ({ page, browser, baseURL }) => {
    await page.goto("/app/criacao/fluxos");
    const { id, imagem } = await fluxoPronto(page, "Verão Café Aurora");
    await page.goto(`/app/criacao/fluxos/${id}`);
    await expect(page.locator(".fx-plano [data-no]")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Privado" })).toBeVisible();

    // o menu, na ordem do desenho, com a linha da privacidade
    await exportar(page).click();
    await expect(menu(page).getByRole("menuitem")).toHaveText([
      /Copiar para IA\s*Markdown/,
      /Criar link\s*7 dias · revogável/,
      /Mandar para um card\s*Quadro/,
      /Baixar pacote\s*\.md \+ imagens/,
      /JSON\s*maestro\.fluxo\/1/,
      /PDF\s*imprimir/,
    ]);
    await expect(menu(page)).toContainText("Ninguém de fora vê sem um link. O link não aparece em buscadores.");
    await foto(page, "exp-menu-1440-claro");

    // Copiar para IA sem link: as imagens só pela legenda
    await menu(page)
      .getByRole("menuitem", { name: /Copiar para IA/ })
      .click();
    await expect(page.locator(".fx-aviso")).toContainText("Copiado");
    const semLink = await lerClipboard(page);
    expect(semLink).toContain("# Fluxo: Verão Café Aurora");
    expect(semLink).toContain("## Clima e luz");
    expect(semLink).toContain('- Imagem: "Fim de tarde, contraluz" (não incluída)');
    expect(semLink).toContain("- Link: Referência de ritmo, vimeo.com (https://vimeo.com/76979871)");
    expect(semLink).toContain('- Card: "Gravação da cafeteria"');
    expect(semLink).toContain("Crie um link para incluir as imagens.");
    expect(semLink).not.toContain("/api/criacao/img");

    // Criar link com PIN
    await exportar(page).click();
    await menu(page)
      .getByRole("menuitem", { name: /Criar link/ })
      .click();
    const folha = page.getByRole("dialog", { name: "Links do fluxo" });
    await expect(folha).toBeVisible();
    await expect(folha.getByRole("radio", { name: "7 dias" })).toHaveAttribute("aria-checked", "true");
    await folha.getByRole("textbox", { name: "PIN (opcional)" }).fill("2468");
    await foto(page, "exp-criar-link-1440-claro");
    await folha.getByRole("button", { name: "Criar link" }).click();
    const campo = folha.getByRole("textbox", { name: "Endereço do link" });
    await expect(campo).toHaveValue(/\/f\/[A-Za-z0-9_-]{43}$/);
    const urlPin = await campo.inputValue();
    expect(await lerClipboard(page)).toBe(urlPin);
    // e outro sem PIN (para a IA ler as imagens)
    await folha.getByRole("button", { name: "Outro link" }).click();
    await folha.getByRole("radio", { name: "1 dia" }).click();
    await folha.getByRole("button", { name: "Criar link" }).click();
    await expect(campo).toHaveValue(/\/f\/[A-Za-z0-9_-]{43}$/);
    const urlLivre = await campo.inputValue();
    expect(urlLivre).not.toBe(urlPin);
    await folha.getByRole("button", { name: "Outro link" }).click();
    await expect(folha.getByRole("list", { name: "Links ativos" }).getByRole("listitem")).toHaveCount(2);
    await expect(folha.getByRole("list", { name: "Links ativos" })).toContainText("PIN");
    await foto(page, "exp-links-1440-claro");
    await page.keyboard.press("Escape");
    await expect(folha).toBeHidden();
    await expect(page.getByRole("button", { name: "2 links" })).toBeVisible();

    // Copiar para IA com as imagens pelo link (só quando pedido, e pelo link sem PIN)
    await exportar(page).click();
    await menu(page).getByRole("checkbox", { name: "Imagens pelo link" }).check();
    await menu(page)
      .getByRole("menuitem", { name: /Copiar para IA/ })
      .click();
    await expect(page.locator(".fx-aviso")).toContainText("Copiado. Cole na IA.");
    const comLink = await lerClipboard(page);
    expect(comLink).toContain(`- Imagem: "Fim de tarde, contraluz" (${urlLivre}/i/${imagem.id}/${imagem.sha256}.webp)`);
    expect(comLink).not.toContain("Crie um link");

    // abrir o link com PIN num navegador limpo: PIN, depois o fluxo só de leitura e fora da busca
    for (const t of TEMAS) {
      const fora = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await tema(fora, baseURL!, t);
      const p = await fora.newPage();
      const resp = await p.goto(urlPin);
      expect(resp?.headers()["x-robots-tag"]).toContain("noindex");
      expect(resp?.headers()["referrer-policy"]).toBe("no-referrer");
      expect(resp?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
      await expect(p.getByRole("heading", { name: "Digite o PIN." })).toBeVisible();
      await expect(p.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await foto(p, `exp-publico-pin-1440-${t === "light" ? "claro" : "escuro"}`);
      await p.getByRole("textbox", { name: "PIN" }).fill("1357");
      await p.getByRole("button", { name: "Abrir" }).click();
      await expect(p.locator(".rv-erro")).toHaveText("PIN errado.");
      await p.getByRole("textbox", { name: "PIN" }).fill("2468");
      await p.getByRole("button", { name: "Abrir" }).click();
      await expect(p.getByRole("heading", { level: 1 })).toHaveText("Verão Café Aurora");
      await expect(p.getByRole("region", { name: "Clima e luz" })).toContainText("Paleta quente, nada de azul.");
      await expect(p.getByRole("region", { name: "Fora das seções" })).toContainText("Gravação da cafeteria");
      await expect(p.getByRole("button", { name: "Ver no canvas" })).toHaveCount(0);
      await expect(p.locator('a[href^="/app/"]')).toHaveCount(0);
      await expect.poll(() => p.locator(".fx-lista__item--imagem img").evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      // o .md pelo mesmo navegador (com a prova do PIN)
      const md = await p.request.get(`${urlPin}.md`);
      expect(md.status()).toBe(200);
      expect(md.headers()["x-robots-tag"]).toContain("noindex");
      expect(await md.text()).toContain(`${urlPin}/i/${imagem.id}/${imagem.sha256}.webp`);
      await foto(p, `exp-publico-1440-${t === "light" ? "claro" : "escuro"}`);
      await fora.close();
    }
    // sem PIN, o .json lê direto (IA que lê endereço)
    const j = await page.request.get(`${urlLivre}.json`);
    expect(j.status()).toBe(200);
    expect(((await j.json()) as { formato: string }).formato).toBe("maestro.fluxo/1");

    // revogar: quem abrir agora não vê nada
    await page.getByRole("button", { name: "2 links" }).click();
    const lista = page.getByRole("dialog", { name: "Links do fluxo" }).getByRole("list", { name: "Links ativos" });
    const comPin = lista.getByRole("listitem").filter({ hasText: "PIN" });
    await comPin.getByRole("button", { name: "Revogar" }).click();
    await comPin.getByRole("button", { name: "Revogar" }).click();
    await expect(page.locator(".fx-aviso")).toContainText("Link revogado");
    await expect(lista.getByRole("listitem")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Link ativo" })).toBeVisible();
    const fora = await browser.newContext();
    const p = await fora.newPage();
    await p.goto(urlPin);
    await expect(p.getByRole("heading", { name: "Este link não está mais ativo." })).toBeVisible();
    expect((await p.request.get(`${urlPin}/i/${imagem.id}/${imagem.sha256}.webp`)).status()).toBe(404);
    await fora.close();

    // o pacote .zip
    await exportar(page).click();
    const baixou = page.waitForEvent("download");
    await menu(page)
      .getByRole("menuitem", { name: /Baixar pacote/ })
      .click();
    const d = await baixou;
    expect(d.suggestedFilename()).toBe("fluxo-verao-cafe-aurora.zip");
    const z = lerZip(new Uint8Array(readFileSync((await d.path())!)));
    expect([...z.keys()]).toEqual(["fluxo.md", "fluxo.json", "imagens/01-fim-de-tarde-contraluz.webp"]);
    expect(z.get("fluxo.md")!.toString()).toContain('- Imagem: "Fim de tarde, contraluz" (imagens/01-fim-de-tarde-contraluz.webp)');

    // o JSON
    await exportar(page).click();
    const json = page.waitForEvent("download");
    await menu(page).getByRole("menuitem", { name: /JSON/ }).click();
    const dj = await json;
    expect(dj.suggestedFilename()).toBe("fluxo-verao-cafe-aurora.json");
    const fj = JSON.parse(readFileSync((await dj.path())!, "utf8")) as { formato: string; nos: { tipo: string; imagem?: { url: string | null } }[] };
    expect(fj.formato).toBe("maestro.fluxo/1");
    expect(fj.nos.find((n) => n.tipo === "imagem")?.imagem?.url).toBeNull();

    // mandar para um card: a ficha do card mostra o fluxo
    await exportar(page).click();
    await menu(page)
      .getByRole("menuitem", { name: /Mandar para um card/ })
      .click();
    const cardFolha = page.getByRole("dialog", { name: "Mandar para um card" });
    await cardFolha.getByRole("button", { name: /Gravação da cafeteria/ }).click();
    await expect(page.locator(".fx-aviso")).toContainText('No card "Gravação da cafeteria"');
    await page.goto("/app/quadro?card=ex-card-1");
    const fluxos = page.getByRole("region", { name: "Fluxos" });
    await expect(fluxos).toContainText("Verão Café Aurora");
    await fluxos.getByRole("link", { name: /Verão Café Aurora/ }).click();
    await page.waitForURL(new RegExp(`/app/criacao/fluxos/${id}$`));
  });

  test("escuro: o menu e os links", async ({ page, context, baseURL }) => {
    await tema(context, baseURL!, "dark");
    await page.goto("/app/criacao/fluxos");
    const { id } = await fluxoPronto(page, "Noite no estúdio");
    await page.goto(`/app/criacao/fluxos/${id}`);
    await exportar(page).click();
    await expect(menu(page)).toBeVisible();
    await foto(page, "exp-menu-1440-escuro");
    await menu(page)
      .getByRole("menuitem", { name: /Criar link/ })
      .click();
    const folha = page.getByRole("dialog", { name: "Links do fluxo" });
    await folha.getByRole("button", { name: "Criar link" }).click();
    await expect(folha.getByRole("textbox", { name: "Endereço do link" })).toBeVisible();
    await folha.getByRole("button", { name: "Outro link" }).click();
    await foto(page, "exp-links-1440-escuro");
  });

  test("quem só lê: copia e baixa, mas não cria link nem muda o card", async ({ page, context, baseURL }) => {
    await page.goto("/app/criacao/fluxos");
    const { id } = await fluxoPronto(page, "Só leitura");
    await context.clearCookies();
    await context.addCookies([{ name: "mae_sessao", value: sessao().leitura, url: baseURL! }]);
    await page.goto(`/app/criacao/fluxos/${id}`);
    await expect(page.getByRole("button", { name: "Privado" })).toHaveCount(0);
    await exportar(page).click();
    await expect(menu(page).getByRole("menuitem", { name: /Criar link/ })).toBeDisabled();
    await expect(menu(page).getByRole("menuitem", { name: /Mandar para um card/ })).toBeDisabled();
    await expect(menu(page).getByRole("menuitem", { name: /Copiar para IA/ })).toBeEnabled();
    expect((await page.request.get(`/api/criacao/fluxo/links?fluxo=${id}`)).status()).toBe(403);
  });
});

test.describe("Exportar no iPhone", () => {
  test.beforeEach(async ({ context, baseURL }, info) => {
    test.skip(info.project.name !== "iphone", "toque: só no iPhone (Chromium)");
    await context.addCookies([{ name: "mae_sessao", value: sessao().token, url: baseURL! }]);
  });

  test("a folha Exportar, os links e a página do link a 393 px, no claro e no escuro", async ({ page, context, browser, baseURL }) => {
    await page.goto("/app/criacao/fluxos");
    const { id } = await fluxoPronto(page, "Verão no iPhone");
    let url = "";
    for (const t of TEMAS) {
      const nome = t === "light" ? "claro" : "escuro";
      await tema(context, baseURL!, t);
      await page.goto(`/app/criacao/fluxos/${id}`);
      await exportar(page).click();
      const folha = page.getByRole("dialog", { name: "Exportar" });
      await expect(folha.getByRole("menuitem")).toHaveCount(6);
      await foto(page, `exp-menu-393-${nome}`);
      await folha.getByRole("menuitem", { name: /Criar link|Links/ }).click();
      const links = page.getByRole("dialog", { name: "Links do fluxo" });
      await expect(links).toBeVisible();
      if (!url) {
        await links.getByRole("button", { name: "Criar link" }).click();
        url = await links.getByRole("textbox", { name: "Endereço do link" }).inputValue();
        await links.getByRole("button", { name: "Outro link" }).click();
      }
      await expect(links.getByRole("list", { name: "Links ativos" }).getByRole("listitem")).toHaveCount(1);
      await foto(page, `exp-links-393-${nome}`);

      const fora = await browser.newContext({ ...{ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } });
      await tema(fora, baseURL!, t);
      const p = await fora.newPage();
      await p.goto(url);
      await expect(p.getByRole("heading", { level: 1 })).toHaveText("Verão no iPhone");
      await expect(p.getByRole("region", { name: "Clima e luz" })).toBeVisible();
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await foto(p, `exp-publico-393-${nome}`);
      await fora.close();
    }
  });
});
