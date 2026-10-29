/**
 * Versão colada direto na ficha do card (no computador e no iPhone): o link entra pelo Enter ou por "Adicionar", a
 * fonte e o erro são os mesmos do lote, a lista mostra v1, v2… e o lote montado depois já traz as versões do card.
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../playwright.config";

const ARQUIVO_SESSAO = "test-results/e2e-sessao.json";
const SUB = "00000000-0000-4000-8000-0000000000e2";
const MP4 = "https://midia.exemplo.test/entregas/teaser-v2.mp4";

async function entrar(context: BrowserContext, baseURL: string) {
  const { token } = JSON.parse(readFileSync(ARQUIVO_SESSAO, "utf8")) as { token: string };
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
  // Sem rede: o mp4 "remoto" é o arquivo local; YouTube e Vimeo são os falsos.
  const mp4 = readFileSync("public/demo/demo-corte-1.mp4");
  await context.route(MP4, (r) => r.fulfill({ body: mp4, contentType: "video/mp4" }));
  await context.route("https://www.youtube.com/iframe_api", (r) => r.fulfill({ path: "e2e/falsos/youtube.js", contentType: "text/javascript" }));
  await context.route("https://player.vimeo.com/api/player.js", (r) => r.fulfill({ path: "e2e/falsos/vimeo.js", contentType: "text/javascript" }));
}

async function semear(sufixo: string): Promise<{ cliente: string; card: string }> {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    const [org] = await sql`select id from maestro.organizations where zro_org_id = '00000000-0000-4000-8000-0000000000e1'`;
    const nome = `Festival Lume ${sufixo}`;
    const [cli] = await sql`insert into maestro.clients (org_id, name) values (${org.id}, ${nome}) returning id`;
    const card = `e2e-vc-${sufixo}`;
    await sql.begin(async (tx) => {
      await tx`select set_config('maestro.user_sub', ${SUB}, true), set_config('maestro.org_id', ${org.id}, true)`;
      await tx.unsafe("set local role maestro_app");
      await tx`select maestro.card_criar(${card}, ${tx.json({ tema: "Teaser do festival", coluna: "revisao", cliente: cli.id })})`;
    });
    return { cliente: nome, card };
  } finally {
    await sql.end();
  }
}

test("a versão colada na ficha do card aparece no lote", async ({ page, context, baseURL }, info) => {
  test.setTimeout(90_000);
  const s = await semear(info.project.name);
  await entrar(context, baseURL!);

  await page.goto(`/app/quadro?card=${s.card}`);
  const ficha = page.getByRole("dialog", { name: "Card: Teaser do festival" });
  const versoes = ficha.getByRole("region", { name: "Versões" });
  const campo = versoes.getByLabel("Link da versão");
  // A lista carregou: a ficha já está hidratada (antes disso o campo ainda não é do React).
  await expect(versoes).not.toHaveAttribute("aria-busy", "true");

  // Enter adiciona (e não envia a ficha); a fonte aparece na lista.
  await campo.fill("https://youtu.be/dQw4w9WgXcQ");
  await campo.press("Enter");
  await expect(versoes.getByRole("link", { name: /v1.*YouTube/ })).toBeVisible();
  await expect(campo).toHaveValue("");
  await expect(ficha).toBeVisible();

  // As mesmas mensagens do lote.
  await campo.fill("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp");
  await expect(versoes.getByRole("alert")).toHaveText("Esse link é de uma pasta. Cole o link do arquivo de vídeo.");
  await expect(versoes.getByRole("button", { name: "Adicionar" })).toBeDisabled();

  await campo.fill(MP4);
  await versoes.getByRole("button", { name: "Adicionar" }).click();
  await expect(versoes.getByRole("listitem")).toHaveCount(2);
  await expect(versoes.getByRole("listitem").first()).toContainText("v2");
  await expect(versoes.getByRole("listitem").first()).toContainText("Arquivo de vídeo");
  await expect(versoes.getByRole("link", { name: /v2/ })).toHaveAttribute("href", MP4);

  // Mandou para a revisão: o lote nasce com as duas versões, a mais nova na mesa.
  await page.goto("/app/aprovacoes/novo");
  await page.getByLabel("Cliente").selectOption({ label: s.cliente });
  await page.getByLabel("Nome do lote").fill(`Teaser ${info.project.name}`);
  await expect(page.getByRole("checkbox", { name: /Teaser do festival/ })).toBeChecked();
  await page.getByRole("button", { name: "Criar lote" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Teaser ${info.project.name}`);
  const abas = page.getByRole("tablist", { name: "Versões" });
  await expect(abas.getByRole("tab")).toHaveText(["v2", "v1"]);
  await expect(abas.getByRole("tab", { name: "v2" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("video")).toHaveCount(1);

  // E o caminho de volta: a versão colada no lote também aparece na ficha.
  await page.getByLabel("Link da nova versão").fill("https://vimeo.com/76979871");
  await page.getByRole("button", { name: "Nova versão" }).click();
  await expect(abas.getByRole("tab")).toHaveText(["v3", "v2", "v1"]);
  await page.goto(`/app/quadro?card=${s.card}`);
  await expect(page.getByRole("region", { name: "Versões" }).getByRole("listitem").first()).toContainText("Vimeo");
});
