/**
 * "Gerar versões com o Relay" (contrato "Maestro → Relay" em docs/integration-contracts/relay.md), no computador e no
 * iPhone (Chromium e WebKit): a versão aprovada do Drive na ficha do card → a folha (destinos, pasta, prévia com o
 * nome e o peso pelo plano do Relay; "Mais" nos grupos do Relay) → "Gerar N versões" → na fila, com o computador
 * fechado (e o Relay no navegador como saída) → cancelar um → o computador abre → pronto com MD5 e o link do Drive, o
 * cancelado fica cancelado; o lote mostra as mesmas entregas. Despacho ambíguo: "Conferir" e a mesma fila. Sem o
 * Relay no plano: o porquê e o link. HUB e SOBEDESCE de mentira (tests/ponte-falsa.mts, controlados por /__relay);
 * Google interceptado no navegador. Com SHOTS_DIR, guarda as capturas `rl-*` (claro e escuro, 1440 e 393) e, no
 * computador, o vídeo do fluxo.
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
const NA_FILA_FECHADO = "Começa quando o computador com o SOBEDESCE abrir.";

type Relay = { token: string; sub: string; org: string; cli: string; proj: string };
const relay = () => JSON.parse(readFileSync(SESSAO_RELAY, "utf8")) as Relay;
type PedidoFalso = { ref: string; preset: string; status: string };

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
const pedidosNaFila = async () => ((await (await fetch(`${PONTE}/__relay`)).json()) as { pedidos: PedidoFalso[] }).pedidos;

/** Um card aprovado com a v1 no Drive (o master) e um lote com ele, só deste projeto do Playwright. */
async function semear(sufixo: string): Promise<{ card: string; lote: string; versao: string }> {
  const r = relay();
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    const card = `e2e-rl-${sufixo}`;
    await sql`insert into maestro.cards (org_id, id, dados) values (${r.org}, ${card}, ${sql.json({ tema: `Manifesto ${sufixo}`, coluna: "aprovado", cliente: r.cli, projeto: r.proj })})`;
    const [v] = await sql`insert into maestro.versoes (org_id, card_id, n, titulo, fonte, url, drive_file_id)
              values (${r.org}, ${card}, 1, 'Master', 'drive', 'https://drive.google.com/file/d/vid-manifesto/view', 'vid-manifesto') returning id`;
    const [l] =
      await sql`insert into maestro.lotes (org_id, client_id, title, status) values (${r.org}, ${r.cli}, ${`Entregas ${sufixo}`}, 'rascunho') returning id`;
    await sql`insert into maestro.lote_cards (lote_id, org_id, card_id, posicao, volta) values (${l.id}, ${r.org}, ${card}, 0, 1)`;
    return { card, lote: l.id, versao: v.id };
  } finally {
    await sql.end();
  }
}

async function foto(page: Page, nome: string, projeto: string, tema = "light") {
  if (!SHOTS) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/rl-${nome}-${tema}-${projeto}.png` });
}

/** O fluxo inteiro, do card aprovado ao pronto, com um cancelado no meio. */
async function fluxo(page: Page, projeto: string, s: { card: string; lote: string; versao: string }, fotos = true, tema = "light") {
  await fila({ avancar: false, falhar: false, converterFalha: null, computador: { aberto_agora: false, usado_ha_pouco: false } });
  await page.goto(`/app/quadro?card=${s.card}`);
  const ficha = page.getByRole("dialog", { name: `Card: Manifesto ${projeto}` });
  const versoes = ficha.getByRole("region", { name: "Versões" });
  await expect(versoes).not.toHaveAttribute("aria-busy", "true");
  await expect(versoes.getByText("Aprovada")).toBeVisible({ visible: !/iphone/.test(projeto) });
  const gerar = versoes.getByRole("button", { name: "Gerar versões" });
  await expect(gerar).toHaveClass(/glass-btn--ink/); // aprovada: em destaque
  await gerar.scrollIntoViewIfNeeded();
  if (fotos) await foto(page, "ficha", projeto, tema);
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
  // "Mais": os outros destinos nos grupos do Relay; "Tamanho exato" fica de fora (pede o MB na hora)
  const mais = folha.locator("summary", { hasText: "Mais" });
  await mais.click();
  await expect(folha.getByRole("group", { name: "Redes" })).toContainText("LinkedIn");
  await expect(folha.getByRole("group", { name: "TV" })).toContainText("Smart TV");
  await expect(folha.getByRole("group", { name: "Áudio" })).toContainText("MP3");
  await expect(folha.getByText("Tamanho exato")).toHaveCount(0);
  await mais.click();
  await expect(folha.getByRole("checkbox", { name: "TikTok" })).not.toBeChecked();
  await folha.locator("label", { hasText: "TikTok" }).click();
  await expect(folha.getByRole("checkbox", { name: "TikTok" })).toBeChecked();
  await expect(folha.getByText("4 de 8")).toBeVisible();
  // a pasta de entrega do projeto e a prévia com o nome, o codec e o peso do plano do Relay
  await expect(folha.getByRole("radio", { name: /05 Entregas/ })).toHaveAttribute("aria-checked", "true");
  const previa = folha.getByRole("list", { name: "Prévia" });
  await expect(previa).toContainText("Filme manifesto v3 (YouTube 1080p).mp4");
  await expect(previa).toContainText("H.264 · 1920×1080 · ≈");
  await expect(previa).toContainText("Filme manifesto v3 (WhatsApp).mp4");
  if (fotos) {
    await foto(page, "folha", projeto, tema);
    if (/iphone/.test(projeto)) expect(await achadosDeCorte(page)).toEqual([]);
  }
  await folha.getByRole("button", { name: "Gerar 4 versões" }).click();
  await expect(folha).toHaveCount(0);

  // na fila, sem prometer prazo: o computador com o SOBEDESCE está fechado; o Relay no navegador é a saída
  const lista = versoes.getByRole("region", { name: "Entregáveis da v1" });
  await expect(lista.getByText("Na fila")).toHaveCount(4);
  await expect(lista).toContainText(NA_FILA_FECHADO);
  await expect(lista.getByRole("link", { name: "Converter WhatsApp no navegador com o Relay" })).toHaveAttribute(
    "href",
    "https://relay.absolutezro.com/converter?preset=whatsapp&de=maestro",
  );
  await lista.scrollIntoViewIfNeeded();
  if (fotos) await foto(page, "na-fila", projeto, tema);

  // cancelar o TikTok: sai da fila de verdade (o SOBEDESCE de mentira confere) e fica "Cancelado"
  await lista.getByRole("button", { name: "Cancelar TikTok" }).click();
  await expect(lista.getByText("Cancelado")).toHaveCount(1);
  await expect(lista.getByText("Na fila")).toHaveCount(3);
  expect((await pedidosNaFila()).find((p) => p.ref === s.versao && p.preset === "tiktok")?.status).toBe("cancelado");

  // o computador abre: convertendo e pronto (o MD5 conferido do lado do SOBEDESCE), com o link do Drive
  await fila({ avancar: true, computador: { aberto_agora: true } });
  await expect(lista.getByText(/Convertendo|Pronto/).first()).toBeVisible({ timeout: 25_000 });
  await expect(lista.getByText("Pronto")).toHaveCount(3, { timeout: 25_000 });
  await expect(lista.getByText("MD5")).toHaveCount(3);
  await expect(lista.getByText("Cancelado")).toHaveCount(1);
  await expect(lista).not.toContainText(NA_FILA_FECHADO);
  await expect(lista.getByRole("link", { name: "Abrir YouTube 1080p no Drive" })).toHaveAttribute(
    "href",
    /^https:\/\/drive\.google\.com\/file\/d\/out-[a-f0-9]+\/view$/,
  );
  await expect(lista).toContainText("Filme manifesto v3 (YouTube 1080p).mp4");
  if (fotos) await foto(page, "pronto", projeto, tema);
  await fila({ avancar: false });
}

test.describe("Gerar versões com o Relay", () => {
  test("versão aprovada do Drive → Gerar versões → na fila → cancelar um → pronto, e o lote mostra as entregas", async ({ page, context, baseURL }, info) => {
    test.setTimeout(120_000);
    const s = await semear(info.project.name);
    await entrar(context, baseURL!, relay().token);
    await fluxo(page, info.project.name, s);

    // o lote do card mostra as mesmas entregas, com o número da versão
    await page.goto(`/app/aprovacoes/${s.lote}`);
    const entregas = page.getByRole("region", { name: "Versões de entrega" });
    await expect(entregas.getByText("v1 · YouTube 1080p")).toBeVisible();
    await expect(entregas.getByText("Pronto")).toHaveCount(3);
    await expect(entregas.getByText("Cancelado")).toHaveCount(1);
    await entregas.scrollIntoViewIfNeeded();
    await foto(page, "lote", info.project.name);
    if (SHOTS) {
      await context.addCookies([{ name: "zro_theme", value: "dark", url: baseURL! }]);
      await page.reload();
      await expect(entregas.getByText("Pronto")).toHaveCount(3);
      await entregas.scrollIntoViewIfNeeded();
      await foto(page, "lote", info.project.name, "dark");
    }
  });

  test("no escuro: a folha e o card com os estados (só com SHOTS_DIR)", async ({ page, context, baseURL }, info) => {
    test.skip(!SHOTS || info.project.name === "iphone-safari", "capturas: computador e iPhone, com SHOTS_DIR");
    test.setTimeout(120_000);
    const nome = `${info.project.name}-escuro`;
    const s = await semear(nome);
    await entrar(context, baseURL!, relay().token, "dark");
    await fluxo(page, nome, s, true, "dark");
  });

  test("despacho ambíguo: a fila guardou e a resposta não voltou → Conferir, e é o mesmo pedido", async ({ page, context, baseURL }, info) => {
    test.setTimeout(90_000);
    const nome = `${info.project.name}-ambiguo`;
    const s = await semear(nome);
    await entrar(context, baseURL!, relay().token);
    await fila({ avancar: false, converterFalha: "rede", computador: { aberto_agora: false, usado_ha_pouco: false } });
    const lista = page.getByRole("region", { name: "Entregáveis da v1" });
    try {
      await page.goto(`/app/quadro?card=${s.card}`);
      const versoes = page.getByRole("dialog", { name: `Card: Manifesto ${nome}` }).getByRole("region", { name: "Versões" });
      await expect(versoes).not.toHaveAttribute("aria-busy", "true");
      await versoes.getByRole("button", { name: "Gerar versões" }).click();
      const folha = page.getByRole("dialog", { name: "Gerar versões" });
      await expect(folha.getByRole("checkbox", { name: "YouTube 1080p" })).toBeChecked();
      for (const n of ["Reels · No Compress", "WhatsApp"]) await folha.locator("label", { hasText: n }).click();
      await expect(folha.getByText("1 de 8")).toBeVisible();
      await folha.getByRole("button", { name: "Gerar 1 versão" }).click();
      await expect(folha).toHaveCount(0);
      await expect(lista.getByText("A conferir", { exact: true })).toBeVisible();
      await expect(lista).toContainText("O pedido saiu, mas a resposta não voltou.");
    } finally {
      await fila({ converterFalha: null });
    }
    // uma chamada só: a fila guardou o pedido, e ninguém tentou de novo
    const daVersao = async () => (await pedidosNaFila()).filter((p) => p.ref === s.versao);
    expect(await daVersao()).toHaveLength(1);
    await foto(page, "conferir", info.project.name);
    // a pessoa confere: a mesma chave devolve o pedido que já existia
    await lista.getByRole("button", { name: "Conferir" }).click();
    await expect(lista.getByText("Na fila")).toHaveCount(1);
    expect(await daVersao()).toHaveLength(1);
  });

  test("sem o Relay no plano: o porquê e o link, nada é pedido; Esc fecha só a folha de cima", async ({ page, context, baseURL }, info) => {
    const { token } = JSON.parse(readFileSync(SESSAO_DRIVE, "utf8")) as { token: string };
    await entrar(context, baseURL!, token);
    const antes = (await pedidosNaFila()).length;
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
    expect((await pedidosNaFila()).length).toBe(antes);
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
