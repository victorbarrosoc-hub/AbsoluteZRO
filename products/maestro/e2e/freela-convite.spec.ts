/**
 * O freela entra no banco pela conta Absolute ZRO (drizzle/0036), contra o HUB falso (tests/ponte-falsa.mts): no
 * "Novo freela", o @ mostra a prévia e liga o freela à conta; avulso, sai com o convite (Copiar link e Mandar no
 * WhatsApp com o número e a mensagem do cadastro); quem abre o link sem conta vê "Criar conta"; com a conta (o cookie
 * que a volta do login deixa), aceita e a ficha da produtora mostra "Conectado @fulano". Revogar = a tela neutra.
 * Com SHOTS_DIR, guarda as capturas `fc-*` (claro e escuro).
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { E2E_KEY } from "../playwright.config";

const SHOTS = process.env.SHOTS_DIR;
const ARQUIVO = "test-results/e2e-sessao-convite.json";

async function comoProdutora(context: BrowserContext, baseURL: string) {
  const { token } = JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string };
  await context.addCookies([
    { name: "mae_sessao", value: token, url: baseURL },
    { name: "zro_theme", value: "light", url: baseURL },
  ]);
}

/** O cookie que a volta do login do convite deixa (src/lib/zro/identidade.ts), selado com a chave do e2e. */
async function comoFreela(context: BrowserContext, baseURL: string, quem: { arroba: string; nome: string }) {
  process.env.MAESTRO_KEY = E2E_KEY;
  const { selarIdentidade } = await import("../src/lib/zro/identidade");
  await context.clearCookies();
  await context.addCookies([
    { name: "mae_conv", value: selarIdentidade({ sub: randomUUID(), arroba: quem.arroba, nome: quem.nome, foto: null }), url: baseURL },
    { name: "zro_theme", value: "light", url: baseURL },
  ]);
}

async function fotos(page: Page, nome: string, projeto: string) {
  if (!SHOTS) return;
  for (const tema of ["light", "dark"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, tema);
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/fc-${nome}-${tema === "light" ? "claro" : "escuro"}-${projeto === "iphone" ? "iphone" : "computador"}.png` });
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
}

test("Novo freela: o @ mostra a prévia, preenche e liga o freela à conta", async ({ page, context, baseURL }, info) => {
  await comoProdutora(context, baseURL!);
  const alvo =
    info.project.name === "iphone"
      ? { arroba: "rafa.edita", nome: "Rafael Prado", linha: "Edição, Color · Recife", cidade: "Recife" }
      : { arroba: "carla.drone", nome: "Carla Nunes", linha: "Câmera, Drone · Natal", cidade: "Natal" };
  await page.goto("/app/freelas/novo");
  const campo = page.getByLabel("@ no Absolute ZRO");
  await campo.fill("oculta.pessoa");
  await expect(page.getByText("Não achamos esse @.")).toBeVisible();
  await campo.fill(alvo.arroba);
  const previa = page.getByLabel(`${alvo.nome}, @${alvo.arroba}`);
  await expect(previa).toBeVisible();
  await expect(previa).toContainText(alvo.linha);
  await fotos(page, "arroba-previa", info.project.name);
  await previa.getByRole("button", { name: "Usar" }).click();
  await expect(page.getByLabel(`Conectado a @${alvo.arroba}`)).toBeVisible();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue(alvo.nome);
  await expect(page.getByLabel("Cidade")).toHaveValue(alvo.cidade);
  await expect(page.getByRole("switch", { name: "Convidar para o Absolute ZRO" })).toHaveCount(0);
  await fotos(page, "arroba-escolhido", info.project.name);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await page.waitForURL(/\/app\/freelas\/[0-9a-f-]{36}$/);
  const conta = page.getByRole("region", { name: "Conta Absolute ZRO" });
  await expect(conta).toContainText("Conectado");
  await expect(conta.getByRole("link", { name: `@${alvo.arroba}` })).toBeVisible();
  await fotos(page, "ficha-conectado", info.project.name);
  // a mesma conta não entra em outro freela
  await page.goto("/app/freelas/novo");
  await page.getByLabel("@ no Absolute ZRO").fill(alvo.arroba);
  await page.getByLabel(`${alvo.nome}, @${alvo.arroba}`).getByRole("button", { name: "Usar" }).click();
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByText(`@${alvo.arroba} já está no banco como ${alvo.nome}.`)).toBeVisible();
});

test("Avulso: convite com Copiar link e WhatsApp; o freela cria a conta, aceita e a ficha mostra Conectado", async ({ page, context, baseURL }, info) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  await comoProdutora(context, baseURL!);
  const quem = info.project.name === "iphone" ? { nome: "Bruno Lopes", arroba: "bruno.cam" } : { nome: "Júlia Reis", arroba: "julia.som" };
  await page.goto("/app/freelas/novo");
  await page.getByLabel("Nome", { exact: true }).fill(quem.nome);
  await page.getByLabel("WhatsApp", { exact: true }).fill("11 97777-6666");
  await page.getByLabel("Mensagem do WhatsApp").fill("Oi, {nome}! Aqui é da {produtora}.");
  const chave = page.getByRole("switch", { name: "Convidar para o Absolute ZRO" });
  await chave.click();
  await expect(chave).toHaveAttribute("aria-checked", "true");
  await fotos(page, "avulso", info.project.name);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await page.waitForURL(/\/app\/freelas\/[0-9a-f-]{36}$/);
  const ficha = page.url();
  const conta = page.getByRole("region", { name: "Conta Absolute ZRO" });
  await expect(conta).toContainText("Convite enviado");
  const wpp = conta.getByRole("link", { name: "Mandar no WhatsApp" });
  const href = (await wpp.getAttribute("href"))!;
  expect(href).toMatch(/^https:\/\/wa\.me\/5511977776666\?text=/);
  const texto = new URL(href).searchParams.get("text")!;
  const primeiro = quem.nome.split(" ")[0];
  expect(texto).toContain(`Oi, ${primeiro}! Aqui é da Lumière Filmes.`);
  const link = /https?:\/\/\S+\/convite\/[A-Za-z0-9_-]{43}/.exec(texto)![0];
  await conta.getByRole("button", { name: "Copiar link" }).click();
  await expect(conta.getByRole("button", { name: "Copiado" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await fotos(page, "ficha-convite", info.project.name);

  // quem recebe: sem conta, "Criar conta" leva ao login único com a volta para o convite
  const caminho = new URL(link).pathname;
  await context.clearCookies();
  await page.goto(caminho);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Oi, ${primeiro}.`);
  await expect(page.getByText("A Lumière Filmes quer você no banco de freelas.")).toBeVisible();
  const criar = new URL((await page.getByRole("link", { name: "Criar conta" }).getAttribute("href"))!, baseURL);
  expect(criar.pathname).toBe("/api/zro/entrar");
  expect(criar.searchParams.get("modo")).toBe("criar");
  expect(criar.searchParams.get("volta")).toBe(caminho);
  await fotos(page, "convite-sem-conta", info.project.name);
  // voltou do login com a conta nova: aceita
  await comoFreela(context, baseURL!, quem);
  await page.reload();
  await expect(page.getByLabel(`Entrando como @${quem.arroba}`)).toBeVisible();
  await fotos(page, "convite-aceitar", info.project.name);
  await page.getByRole("button", { name: "Aceitar convite" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Pronto, ${primeiro}.`);
  await fotos(page, "convite-pronto", info.project.name);

  // a produtora vê a conta ligada
  await context.clearCookies();
  await comoProdutora(context, baseURL!);
  await page.goto(ficha);
  await expect(conta).toContainText("Conectado");
  await expect(conta.getByRole("link", { name: `@${quem.arroba}` })).toBeVisible();
  // outra pessoa com o mesmo link: a tela neutra
  await comoFreela(context, baseURL!, { nome: "Outra Pessoa", arroba: "outra.pessoa" });
  await page.goto(caminho);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Este link não está mais ativo.");
});

test("Ficha: sem conta → convidar → revogar; o link revogado é a tela neutra", async ({ page, context, baseURL }, info) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  await comoProdutora(context, baseURL!);
  await page.goto("/app/freelas/novo");
  await page.getByLabel("Nome", { exact: true }).fill(`Sem Zap ${info.project.name}`);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await page.waitForURL(/\/app\/freelas\/[0-9a-f-]{36}$/);
  const conta = page.getByRole("region", { name: "Conta Absolute ZRO" });
  await expect(conta).toContainText("Sem conta");
  await fotos(page, "ficha-sem-conta", info.project.name);
  await conta.getByRole("button", { name: "Convidar para o Absolute ZRO" }).click();
  await expect(conta).toContainText("Convite enviado");
  // sem WhatsApp no cadastro: só o link
  await expect(conta.getByRole("link", { name: "Mandar no WhatsApp" })).toHaveCount(0);
  await conta.getByRole("button", { name: "Copiar link" }).click();
  await expect(conta.getByRole("button", { name: "Copiado" })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  await conta.getByRole("button", { name: "Revogar" }).click();
  await expect(conta).toContainText("Sem conta");
  await page.goto(new URL(link).pathname);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Este link não está mais ativo.");
});
