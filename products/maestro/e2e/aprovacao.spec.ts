/**
 * Aprovação do começo ao fim (plano v2 §4, fases 3–6), no computador e no iPhone: a equipe monta o lote, cola três
 * links (mp4 local, YouTube e Vimeo falsos), comenta e gera o link; o cliente, sem conta, comenta no tempo com pino,
 * aprova e pede ajuste, revisa e envia com nome e aceite; o card anda no Quadro; o link revogado vira a tela neutra.
 * Nada sai para a internet: o mp4 vem de public/demo e as APIs do YouTube e do Vimeo são falsas (e2e/falsos).
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../playwright.config";

const ARQUIVO_SESSAO = "test-results/e2e-sessao.json";
const SUB = "00000000-0000-4000-8000-0000000000e2";
const MP4 = "https://midia.exemplo.test/entregas/reel.mp4";

async function entrar(context: BrowserContext, baseURL: string) {
  const { token } = JSON.parse(readFileSync(ARQUIVO_SESSAO, "utf8")) as { token: string };
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
}

/** Sem rede: o mp4 "remoto" é o arquivo local; as APIs do YouTube e do Vimeo são as falsas. */
async function falsos(context: BrowserContext) {
  // Como um CDN de verdade: responde a Range com 206 (sem isso o <video> não consegue pular no tempo).
  const mp4 = readFileSync("public/demo/demo-corte-1.mp4");
  await context.route(MP4, (r) => {
    const m = /bytes=(\d+)-(\d*)/.exec(r.request().headers()["range"] ?? "");
    if (!m) return r.fulfill({ body: mp4, contentType: "video/mp4", headers: { "accept-ranges": "bytes" } });
    const ini = Number(m[1]);
    const fim = m[2] ? Math.min(Number(m[2]), mp4.length - 1) : mp4.length - 1;
    return r.fulfill({
      status: 206,
      body: mp4.subarray(ini, fim + 1),
      contentType: "video/mp4",
      headers: { "accept-ranges": "bytes", "content-range": `bytes ${ini}-${fim}/${mp4.length}` },
    });
  });
  await context.route("https://www.youtube.com/iframe_api", (r) => r.fulfill({ path: "e2e/falsos/youtube.js", contentType: "text/javascript" }));
  await context.route("https://player.vimeo.com/api/player.js", (r) => r.fulfill({ path: "e2e/falsos/vimeo.js", contentType: "text/javascript" }));
}

type Semente = { cliente: string; cards: { reel: string; post: string; story: string } };

async function semear(sufixo: string): Promise<Semente> {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    const [org] = await sql`select id from maestro.organizations where zro_org_id = '00000000-0000-4000-8000-0000000000e1'`;
    const [cli] = await sql`insert into maestro.clients (org_id, name, whatsapp) values (${org.id}, ${`Café Aurora ${sufixo}`}, '5511999990000') returning id`;
    const cards = { reel: `e2e-reel-${sufixo}`, post: `e2e-post-${sufixo}`, story: `e2e-story-${sufixo}` };
    await sql.begin(async (tx) => {
      await tx`select set_config('maestro.user_sub', ${SUB}, true), set_config('maestro.org_id', ${org.id}, true)`;
      await tx.unsafe("set local role maestro_app");
      for (const [nome, id] of [
        ["Reel de lançamento", cards.reel],
        ["Post do cardápio", cards.post],
        ["Story da promoção", cards.story],
      ])
        await tx`select maestro.card_criar(${id}, ${tx.json({ tema: nome, coluna: "revisao", cliente: cli.id })})`;
    });
    return { cliente: `Café Aurora ${sufixo}`, cards };
  } finally {
    await sql.end();
  }
}

async function colunas(ids: string[]): Promise<Record<string, string>> {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    const r = await sql`select id, coluna from maestro.cards where id = any(${ids})`;
    return Object.fromEntries(r.map((x) => [x.id as string, x.coluna as string]));
  } finally {
    await sql.end();
  }
}

async function novaVersao(page: Page, peca: string, link: string, fonte: string) {
  await page
    .getByRole("navigation", { name: "Peças do lote" })
    .getByRole("button", { name: new RegExp(peca) })
    .click();
  await page.getByLabel("Link da nova versão").fill(link);
  await expect(page.locator(".ap-versao__fonte")).toContainText(fonte);
  await page.getByRole("button", { name: "Nova versão" }).click();
  await expect(page.getByRole("tablist", { name: "Versões" }).or(page.locator(".rv-palco"))).toBeVisible();
}

test.describe("aprovação", () => {
  test("equipe → link → cliente decide → o Quadro anda; revogado vira tela neutra", async ({ page, context, browser, baseURL }, info) => {
    test.setTimeout(120_000);
    const s = await semear(info.project.name);
    await entrar(context, baseURL!);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
    await falsos(context);

    // Equipe: lote novo com as três peças (as que estão em Revisão vêm marcadas).
    await page.goto("/app/aprovacoes/novo");
    await page.getByLabel("Cliente").selectOption({ label: s.cliente });
    await page.getByLabel("Nome do lote").fill(`Semana 44 ${info.project.name}`);
    for (const n of ["Reel de lançamento", "Post do cardápio", "Story da promoção"])
      await expect(page.getByRole("checkbox", { name: new RegExp(n) })).toBeChecked();
    await page.getByRole("button", { name: "Criar lote" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`Semana 44 ${info.project.name}`);

    // Três links: arquivo direto, YouTube e Vimeo. Link ruim é recusado na hora.
    await page.getByLabel("Link da nova versão").fill("http://inseguro.exemplo.test/x.mp4");
    await expect(page.getByRole("form", { name: "Nova versão" }).getByRole("alert")).toContainText("https://");
    await novaVersao(page, "Reel", MP4, "Arquivo de vídeo");
    await expect(page.locator("video")).toHaveCount(1);
    await novaVersao(page, "Post", "https://youtu.be/dQw4w9WgXcQ", "YouTube");
    await expect(page.locator(".yt-falso")).toBeVisible();
    await novaVersao(page, "Story", "https://vimeo.com/76979871", "Vimeo");
    await expect(page.locator(".rv-palco")).toContainText("Vimeo falso");

    // A equipe comenta no Reel, no tempo em que o vídeo está.
    await page.getByRole("navigation", { name: "Peças do lote" }).getByRole("button", { name: /Reel/ }).click();
    await page.locator("video").evaluate(
      (v: HTMLVideoElement) =>
        new Promise<void>((ok) => {
          const ir = () => {
            v.currentTime = 2;
            v.addEventListener("seeked", () => ok(), { once: true });
          };
          if (v.readyState >= 1) ir();
          else v.addEventListener("loadedmetadata", ir, { once: true });
        }),
    );
    await page.getByRole("button", { name: "Comentar aqui" }).click();
    await expect(page.locator(".rv-chip").first()).toContainText("0:02");
    await page.getByLabel("Comentário", { exact: true }).fill("Cor da abertura ainda provisória");
    await page.getByRole("button", { name: "Comentar", exact: true }).click();
    await expect(page.getByRole("list", { name: "Comentários desta versão" })).toContainText("Cor da abertura ainda provisória");
    await expect(page.locator(".rv-marca")).toHaveCount(1);

    // Link do cliente, sem PIN, 30 dias. Os cards em Revisão vão para Em aprovação.
    await page.getByRole("button", { name: "Gerar link" }).click();
    const campo = page.getByLabel("Endereço do link");
    await expect(campo).toHaveValue(/\/a\/[A-Za-z0-9_-]{43}$/);
    const url = await campo.inputValue();
    expect(Object.values(await colunas(Object.values(s.cards)))).toEqual(["aprovacao", "aprovacao", "aprovacao"]);

    // Cliente: outro navegador, sem conta.
    const cli = await browser.newContext({ ...info.project.use, baseURL });
    await falsos(cli);
    const c = await cli.newPage();
    const resp = await c.goto(url);
    expect(resp?.headers()["x-robots-tag"]).toContain("noindex");
    expect(resp?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(resp?.headers()["referrer-policy"]).toBe("strict-origin");
    await expect(c.getByRole("heading", { level: 1 })).toHaveText(`Semana 44 ${info.project.name}`);
    const html = await c.content();
    expect(html).not.toContain("e2e@");
    expect(html).not.toContain(SUB);
    await expect(c.getByRole("navigation", { name: "O que aprovar" }).getByRole("button")).toHaveCount(3);
    await expect(c.getByText("Cor da abertura ainda provisória")).toBeVisible();

    // Reel: comentário no tempo com pino; o nome vai junto.
    await c.locator("video").evaluate(
      (v: HTMLVideoElement) =>
        new Promise<void>((ok) => {
          const ir = () => {
            v.currentTime = 3;
            v.addEventListener("seeked", () => ok(), { once: true });
          };
          if (v.readyState >= 1) ir();
          else v.addEventListener("loadedmetadata", ir, { once: true });
        }),
    );
    await c.getByRole("button", { name: "Comentar aqui" }).click();
    await c.getByRole("button", { name: /Ponto/ }).click();
    await c.locator(".rv-pinos").click({ position: { x: 40, y: 30 } });
    await expect(c.getByRole("button", { name: /Ponto marcado/ })).toBeVisible();
    await c.getByLabel("Seu nome").fill("Marina Lopes");
    await c.getByLabel("Comentário", { exact: true }).fill("O logo pode crescer");
    await c.getByRole("button", { name: "Comentar", exact: true }).click();
    const nota = c.getByRole("list", { name: "Comentários desta versão" }).getByRole("listitem").filter({ hasText: "O logo pode crescer" });
    await expect(nota).toContainText("0:03");
    await expect(nota).toContainText("Marina Lopes");
    await expect(c.locator(".rv-pino")).toHaveCount(1);
    await c.getByRole("radio", { name: "Aprovar esta" }).click();

    // A próxima abre sozinha: o Post (YouTube falso, tempo 7 s). Pedir ajuste exige dizer o quê.
    await expect(c.getByRole("heading", { level: 2, name: "Post do cardápio" })).toBeVisible();
    await expect(c.locator(".rv-relogio")).toContainText("0:07");
    await c.getByRole("radio", { name: "Pedir ajuste nesta" }).click();
    await c.getByLabel(/O que ajustar/).fill("Trocar a foto do prato");
    await c.getByRole("navigation", { name: "O que aprovar" }).getByRole("button", { name: /Story/ }).click();
    await expect(c.locator(".rv-relogio")).toContainText("0:04");
    await c.getByRole("radio", { name: "Aprovar esta" }).click();

    // Revisar e enviar: o resumo, o nome e o aceite.
    await c.getByRole("button", { name: /Revisar e enviar/ }).click();
    const resumo = c.getByRole("form", { name: "Revisar e enviar" });
    await expect(resumo.getByRole("listitem")).toHaveCount(3);
    await expect(resumo).toContainText("Trocar a foto do prato");
    await resumo.getByRole("button", { name: "Enviar" }).click();
    await expect(resumo.getByRole("alert")).toContainText("aceite");
    await resumo.getByRole("checkbox").check();
    await resumo.getByRole("button", { name: "Enviar" }).click();
    await expect(c.getByRole("heading", { name: "Enviado." })).toBeVisible();
    await expect(c.locator(".cl-selo").first()).toBeVisible();

    // O Quadro andou: aprovados para Aprovado, o ajuste de volta para Revisão.
    expect(await colunas(Object.values(s.cards))).toEqual({ [s.cards.reel]: "aprovado", [s.cards.post]: "revisao", [s.cards.story]: "aprovado" });

    // A equipe vê a decisão, o comentário do cliente e exporta as notas.
    await page.reload();
    await page.getByRole("navigation", { name: "Peças do lote" }).getByRole("button", { name: /Post/ }).click();
    await expect(page.locator(".ap-detalhe__cabeca")).toContainText("Ajuste pedido por Marina Lopes");
    await expect(page.locator(".ap-nota")).toContainText("Trocar a foto do prato");
    const csv = await page.request.get(`${new URL(page.url()).pathname}/notas?formato=csv`);
    expect(csv.status()).toBe(200);
    const texto = await csv.text();
    expect(texto).toContain("O logo pode crescer");
    expect(texto).toContain("00:00:03:00");
    const edl = await (await page.request.get(`${new URL(page.url()).pathname}/notas?formato=edl`)).text();
    expect(edl).toContain("FCM: NON-DROP FRAME");

    // Revogado: a mesma tela neutra de qualquer link morto.
    await page.getByRole("button", { name: "Revogar" }).click();
    await expect(page.getByRole("button", { name: "Gerar link" })).toBeVisible();
    await c.goto(url);
    await expect(c.getByRole("heading", { level: 1 })).toHaveText("Este link não está mais ativo.");
    await expect(c.locator("body")).not.toContainText("Café Aurora");
    await cli.close();
  });

  test("link desconhecido: tela neutra, sem rolagem de lado e o selo parado com reduzir movimento", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/a/${"x".repeat(43)}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Este link não está mais ativo.");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sobra).toBeLessThanOrEqual(0);
  });

  test("a API do link recusa outra origem e token inválido", async ({ request, baseURL }) => {
    const outra = await request.post("/api/link/comentar", { headers: { origin: "https://golpe.exemplo.test" }, data: { token: "x".repeat(43) } });
    expect(outra.status()).toBe(403);
    const morto = await request.post("/api/link/enviar", {
      headers: { origin: new URL(baseURL!).origin },
      data: { token: "x".repeat(43), nome: "A", aceite: true, decisoes: [] },
    });
    expect(morto.status()).toBe(404);
    expect(await morto.json()).toEqual({ erro: "link", mensagem: "Este link não está mais ativo." });
  });
});
