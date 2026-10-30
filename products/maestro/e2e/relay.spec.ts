/**
 * "Gerar versões com o Relay" (contrato "Maestro → Relay" em docs/integration-contracts/relay.md), no computador e no
 * iPhone (Chromium e WebKit): a versão aprovada do Drive na ficha do card → a folha (destinos, pasta, prévia com o
 * nome e o peso pelo plano do Relay) → "Gerar N versões" → na fila, com o computador fechado → o computador abre →
 * pronto com MD5 e o link do Drive; o lote mostra as mesmas entregas. Sem o Relay no plano: o porquê e o link.
 * HUB e SOBEDESCE de mentira (tests/ponte-falsa.mts, controlados por /__relay); Google interceptado no navegador.
 * Com SHOTS_DIR, guarda as capturas `rl-*` e, no computador, o vídeo do fluxo.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../playwright.config";
import { achadosDeCorte } from "./corte";
import { googleDeMentira } from "./falsos/google-drive";
import { PORTA_PONTE } from "./preparar";

const SESSAO_RELAY = "test-results/e2e-sessao-relay.json";
const SESSAO_DRIVE = "test-results/e2e-sessao-drive.json";
const SHOTS = process.env.SHOTS_DIR;
const PONTE = `http://127.0.0.1:${PORTA_PONTE}`;

type Relay = { token: string; sub: string; org: string; cli: string; proj: string };
const relay = () => JSON.parse(readFileSync(SESSAO_RELAY, "utf8")) as Relay;

async function entrar(context: BrowserContext, baseURL: string, token: string, tema = "light") {
  await context.addCookies([
    { name: "mae_sessao", value: token, url: baseURL },
    { name: "zro_theme", value: tema, url: baseURL },
  ]);
  await googleDeMentira(context);
}

async function fila(estado: Record<string, unknown>) {
  const r = await fetch(`${PONTE}/__relay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(estado) });
  expect(r.ok).toBe(true);
}

/** Um card aprovado com a v1 no Drive (o master) e um lote com ele, só deste projeto do Playwright. */
async function semear(sufixo: string): Promise<{ card: string; lote: string }> {
  const r = relay();
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    const card = `e2e-rl-${sufixo}`;
    await sql`insert into maestro.cards (org_id, id, dados) values (${r.org}, ${card}, ${sql.json({ tema: `Manifesto ${sufixo}`, coluna: "aprovado", cliente: r.cli, projeto: r.proj })})`;
    await sql`insert into maestro.versoes (org_id, card_id, n, titulo, fonte, url, drive_file_id)
              values (${r.org}, ${card}, 1, 'Master', 'drive', 'https://drive.google.com/file/d/vid-manifesto/view', 'vid-manifesto')`;
    const [l] =
      await sql`insert into maestro.lotes (org_id, client_id, title, status) values (${r.org}, ${r.cli}, ${`Entregas ${sufixo}`}, 'rascunho') returning id`;
    await sql`insert into maestro.lote_cards (lote_id, org_id, card_id, posicao, volta) values (${l.id}, ${r.org}, ${card}, 0, 1)`;
    return { card, lote: l.id };
  } finally {
    await sql.end();
  }
}

async function foto(page: Page, nome: string, projeto: string, tema = "light") {
  if (!SHOTS) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/rl-${nome}-${tema}-${projeto}.png` });
}

/** O fluxo inteiro, do card aprovado ao pronto. */
async function fluxo(page: Page, projeto: string, s: { card: string; lote: string }, fotos = true) {
  await fila({ avancar: false, falhar: false, computador: { aberto_agora: false, usado_ha_pouco: false } });
  await page.goto(`/app/quadro?card=${s.card}`);
  const ficha = page.getByRole("dialog", { name: `Card: Manifesto ${projeto}` });
  const versoes = ficha.getByRole("region", { name: "Versões" });
  await expect(versoes).not.toHaveAttribute("aria-busy", "true");
  await expect(versoes.getByText("Aprovada")).toBeVisible({ visible: !/iphone/.test(projeto) });
  const gerar = versoes.getByRole("button", { name: "Gerar versões" });
  await expect(gerar).toHaveClass(/glass-btn--ink/); // aprovada: em destaque
  await gerar.scrollIntoViewIfNeeded();
  if (fotos) await foto(page, "ficha", projeto);
  await gerar.click();

  const folha = page.getByRole("dialog", { name: "Gerar versões" });
  await expect(folha.getByRole("img", { name: "Relay" })).toBeVisible();
  // os de entrega ao cliente primeiro; três já vêm marcados
  await expect(folha.getByRole("checkbox", { name: "YouTube 1080p" })).toBeChecked();
  await expect(folha.locator(".rl-grupo").first().locator(":scope > .rl-opcoes .rl-opcao__nome")).toHaveText([
    "YouTube 1080p",
    "YouTube 4K",
    "Reels · No Compress",
    "Instagram Feed 4:5",
    "TikTok",
    "WhatsApp",
    "Vimeo",
    "E-mail",
  ]);
  await expect(folha.getByRole("checkbox", { name: "TikTok" })).not.toBeChecked();
  await folha.locator("label", { hasText: "TikTok" }).click();
  await expect(folha.getByRole("checkbox", { name: "TikTok" })).toBeChecked();
  await expect(folha.getByText("4 de 8")).toBeVisible();
  // a pasta de entrega do projeto (vai ser criada) e a prévia com o nome, o codec e o peso do plano do Relay
  await expect(folha.getByRole("radio", { name: /05 Entregas/ })).toHaveAttribute("aria-checked", "true");
  const previa = folha.getByRole("list", { name: "Prévia" });
  await expect(previa).toContainText("Filme manifesto v3 (YouTube 1080p).mp4");
  await expect(previa).toContainText("H.264 · 1920×1080 · ≈");
  await expect(previa).toContainText("Filme manifesto v3 (WhatsApp).mp4");
  if (fotos) {
    await foto(page, "folha", projeto);
    if (/iphone/.test(projeto)) expect(await achadosDeCorte(page)).toEqual([]);
  }
  await folha.getByRole("button", { name: "Gerar 4 versões" }).click();
  await expect(folha).toHaveCount(0);

  // na fila, sem prometer prazo: o computador com o SOBEDESCE está fechado
  const lista = versoes.getByRole("region", { name: "Entregáveis da v1" });
  await expect(lista.getByText("Na fila")).toHaveCount(4);
  await expect(lista).toContainText("Vai começar quando o computador com o SOBEDESCE abrir.");
  await lista.scrollIntoViewIfNeeded();
  if (fotos) await foto(page, "na-fila", projeto);

  // o computador abre: convertendo e pronto (o MD5 conferido do lado do SOBEDESCE), com o link do Drive
  await fila({ avancar: true, computador: { aberto_agora: true } });
  await expect(lista.getByText(/Convertendo|Pronto/).first()).toBeVisible({ timeout: 15_000 });
  await expect(lista.getByText("Pronto")).toHaveCount(4, { timeout: 20_000 });
  await expect(lista.getByText("MD5")).toHaveCount(4);
  await expect(lista).not.toContainText("Vai começar");
  await expect(lista.getByRole("link", { name: "Abrir YouTube 1080p no Drive" })).toHaveAttribute(
    "href",
    /^https:\/\/drive\.google\.com\/file\/d\/out-[a-f0-9]+\/view$/,
  );
  await expect(lista).toContainText("Filme manifesto v3 (YouTube 1080p).mp4");
  if (fotos) await foto(page, "pronto", projeto);
  await fila({ avancar: false });
}

test.describe("Gerar versões com o Relay", () => {
  test("versão aprovada do Drive → Gerar versões → na fila → pronto, e o lote mostra as entregas", async ({ page, context, baseURL }, info) => {
    test.setTimeout(120_000);
    const s = await semear(info.project.name);
    await entrar(context, baseURL!, relay().token);
    await fluxo(page, info.project.name, s);

    // o lote do card mostra as mesmas entregas, com o número da versão
    await page.goto(`/app/aprovacoes/${s.lote}`);
    const entregas = page.getByRole("region", { name: "Versões de entrega" });
    await expect(entregas.getByText("v1 · YouTube 1080p")).toBeVisible();
    await expect(entregas.getByText("Pronto")).toHaveCount(4);
    await entregas.scrollIntoViewIfNeeded();
    await foto(page, "lote", info.project.name);
    if (SHOTS && info.project.name === "computador") {
      await context.addCookies([{ name: "zro_theme", value: "dark", url: baseURL! }]);
      await page.reload();
      await expect(entregas.getByText("Pronto")).toHaveCount(4);
      await foto(page, "lote", info.project.name, "dark");
    }
  });

  test("sem o Relay no plano: o porquê e o link, nada é pedido; Esc fecha só a folha de cima", async ({ page, context, baseURL }, info) => {
    const { token } = JSON.parse(readFileSync(SESSAO_DRIVE, "utf8")) as { token: string };
    await entrar(context, baseURL!, token);
    const antes = ((await (await fetch(`${PONTE}/__relay`)).json()) as { pedidos: unknown[] }).pedidos.length;
    await page.goto("/app/quadro?card=e2e-drive-1");
    const ficha = page.getByRole("dialog", { name: /^Card: / });
    const versoes = ficha.getByRole("region", { name: "Versões" });
    await expect(versoes).not.toHaveAttribute("aria-busy", "true");
    await versoes.getByRole("button", { name: "Gerar versões" }).first().click();
    const folha = page.getByRole("dialog", { name: "Gerar versões" });
    await expect(folha.getByRole("heading", { name: "O Relay ainda não está liberado" })).toBeVisible();
    await expect(folha.getByRole("link", { name: "Conhecer o Relay" })).toHaveAttribute("href", "https://relay.absolutezro.com");
    await expect(folha.getByRole("button", { name: /^Gerar \d/ })).toHaveCount(0);
    await foto(page, "sem-relay", info.project.name);
    await page.keyboard.press("Escape");
    await expect(folha).toHaveCount(0);
    await expect(ficha).toBeVisible();
    const depois = ((await (await fetch(`${PONTE}/__relay`)).json()) as { pedidos: unknown[] }).pedidos.length;
    expect(depois).toBe(antes);
  });
});

/** O vídeo do fluxo (só no computador e com SHOTS_DIR): um contexto que grava. */
test("vídeo do fluxo", async ({ browser, baseURL }, info) => {
  test.skip(!SHOTS || info.project.name !== "computador", "só com SHOTS_DIR, no computador");
  test.setTimeout(120_000);
  const s = await semear("video");
  const ctx = await (browser as Browser).newContext({
    baseURL,
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: `${SHOTS}/video`, size: { width: 1280, height: 800 } },
  });
  await entrar(ctx, baseURL!, relay().token);
  const page = await ctx.newPage();
  // o vídeo mostra o mesmo fluxo com o nome do card do vídeo
  await fluxo(page, "video", s, false);
  await page.waitForTimeout(1200);
  await ctx.close();
});
