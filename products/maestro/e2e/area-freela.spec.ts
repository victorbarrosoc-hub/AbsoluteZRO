/**
 * A área do freela (drizzle/0037; semente em e2e/semente-area-freela.ts): a Alice entra com a conta dela (sem o
 * Maestro) e cai em "Seus trabalhos", com o Estúdio Farol e a Casa Aurora, só os trabalhos dela e o próprio valor; a
 * ficha traz quando, onde, a função, o recado da produção e o link de entrega; confirma e recusa. O Bruno, na mesma
 * diária, não vê nada da Alice (e a ficha dela dá 404). Rotas e dados da produtora são recusados para o freela. A Mia,
 * da equipe do Farol e freela na Aurora, troca entre os dois. Ligada sem trabalho = vazio calmo; sem vínculo = "sem
 * acesso". Computador e iPhone. Com SHOTS_DIR, guarda `af-*` (claro e escuro); com AF_VIDEO=<pasta>, grava o passeio
 * do iPhone.
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const SHOTS = process.env.SHOTS_DIR;
type Semente = {
  alice: string;
  bruno: string;
  cora: string;
  nilo: string;
  mia: string;
  farol: string;
  projeto: string;
  aliceDiaria: string;
  brunoDiaria: string;
  aliceAurora: string;
};
const s = () => JSON.parse(readFileSync("test-results/e2e-sessao-area-freela.json", "utf8")) as Semente;
const SEGREDO = ["NOTA INTERNA", "BRIEFING INTERNO", "12.345.678/0001-90", "Bruno", "777,00", "1.554,00", "99.000", "Cliente Escondido"];

async function como(context: BrowserContext, baseURL: string, token: string, tema = "light") {
  await context.clearCookies();
  await context.addCookies([
    { name: "mae_sessao", value: token, url: baseURL },
    { name: "zro_theme", value: tema, url: baseURL },
  ]);
}

async function semRolagemDeLado(page: Page) {
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sobra, page.url()).toBeLessThanOrEqual(0);
}

async function fotos(page: Page, nome: string, projeto: string) {
  if (!SHOTS) return;
  for (const tema of ["light", "dark"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, tema);
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/af-${nome}-${tema === "light" ? "claro" : "escuro"}-${projeto}.png`, fullPage: true });
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
}

test.describe.configure({ mode: "serial" });

test("a Alice entra e vê só os trabalhos dela, nas duas produtoras", async ({ page, context, baseURL }, info) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await como(context, baseURL!, s().alice);
  // a entrada do app manda para a área do freela (não tem o Maestro na conta dela)
  await page.goto("/app");
  await expect(page).toHaveURL(/\/trabalhos$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Seus trabalhos.");
  const farol = page.getByRole("region", { name: "Estúdio Farol" });
  const aurora = page.getByRole("region", { name: "Casa Aurora" });
  await expect(farol).toBeVisible();
  await expect(aurora).toBeVisible();
  // a diária: título, cliente (o Farol mostra), a função, o horário, o lugar e o valor dela
  const cartao = farol.getByRole("link", { name: /Diária na cafeteria/ });
  await expect(cartao).toBeVisible();
  await expect(cartao).toContainText("Café Aurora");
  await expect(cartao).toContainText("Captação com câmera");
  await expect(cartao).toContainText("8h – 18h30");
  await expect(cartao).toContainText("Rua Augusta");
  await expect(cartao).toContainText("1.200,00");
  // a Aurora não mostra o cliente
  await expect(aurora.getByRole("link", { name: /Série Aurora/ })).toBeVisible();
  // os que passaram ficam recolhidos
  const anteriores = farol.locator("details.ft-anteriores");
  await expect(anteriores).not.toHaveAttribute("open", "");
  await expect(anteriores.locator("summary")).toContainText("1");
  await expect(anteriores.getByRole("link")).toBeHidden();
  const html = await page.content();
  for (const x of SEGREDO) expect(html, x).not.toContain(x);
  await semRolagemDeLado(page);
  await fotos(page, "lista", info.project.name);
  await anteriores.locator("summary").click();
  await expect(anteriores.getByRole("link")).toContainText("Pago");
  await anteriores.locator("summary").click();

  // a ficha
  await cartao.click();
  await expect(page).toHaveURL(new RegExp(`/trabalhos/${s().aliceDiaria}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Diária na cafeteria");
  await expect(page.getByText("Café Aurora · Filme do café")).toBeVisible();
  await expect(page.getByRole("region", { name: "Da produção" })).toContainText("Figurino preto");
  await expect(page.getByRole("link", { name: "Enviar material" })).toHaveAttribute("href", "https://drive.google.com/drive/folders/farol-entrega");
  await expect(page.getByRole("link", { name: "Falar com a produção" })).toHaveAttribute("href", /^https:\/\/wa\.me\/5511988887777\?text=/);
  await expect(page.getByRole("link", { name: "Rua Augusta, 1200, São Paulo" })).toHaveAttribute("href", /google\.com\/maps/);
  const fichaHtml = await page.content();
  for (const x of SEGREDO) expect(fichaHtml, x).not.toContain(x);
  await semRolagemDeLado(page);
  await fotos(page, "ficha", info.project.name);

  // recusar e confirmar (de novo = troca)
  const resposta = page.getByRole("form", { name: "Sua resposta" });
  await resposta.getByRole("button", { name: "Recusar" }).click();
  await expect(resposta).toContainText("Você recusou.");
  await expect(page.locator(".ft-ficha__estado")).toContainText("Recusado");
  await resposta.getByRole("button", { name: "Confirmar" }).click();
  await expect(resposta).toContainText("Você confirmou.");
  await expect(resposta.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  await fotos(page, "confirmado", info.project.name);
  await page.getByRole("link", { name: "Seus trabalhos" }).first().click();
  await expect(page.getByRole("link", { name: /Diária na cafeteria/ })).toContainText("Confirmado");
  expect(erros).toEqual([]);
});

test("o Bruno não vê nada da Alice; a ficha dela dá 404", async ({ page, context, baseURL }) => {
  await como(context, baseURL!, s().bruno);
  await page.goto("/trabalhos");
  await expect(page.getByRole("region", { name: "Estúdio Farol" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Casa Aurora" })).toHaveCount(0);
  const cartao = page.getByRole("link", { name: /Diária na cafeteria/ });
  await expect(cartao).toContainText("1.554,00");
  const html = await page.content();
  for (const x of ["Alice", "1.200,00", "Figurino preto", "Série Aurora", "NOTA INTERNA"]) expect(html, x).not.toContain(x);
  const r = await page.goto(`/trabalhos/${s().aliceDiaria}`);
  expect(r?.status()).toBe(404);
  const r2 = await page.goto(`/trabalhos/${s().aliceAurora}`);
  expect(r2?.status()).toBe(404);
});

test("o freela não passa nas telas nem nos dados da produtora", async ({ page, context, baseURL }) => {
  await como(context, baseURL!, s().alice);
  for (const rota of ["/app/hoje", "/app/quadro", "/app/financeiro", "/app/freelas", `/app/projetos/${s().projeto}`, "/app/ajustes/pessoas", "/sem-acesso"]) {
    await page.goto(rota);
    await expect(page, rota).toHaveURL(/\/trabalhos$/);
  }
  for (const [metodo, rota] of [
    ["GET", "/api/quadro"],
    ["POST", "/api/quadro"],
    ["GET", "/api/agenda/minha"],
    ["POST", "/api/arquivos/token"],
  ] as const) {
    const r = metodo === "GET" ? await page.request.get(rota) : await page.request.post(rota, { data: {}, headers: { origin: baseURL! } });
    expect([401, 403], `${metodo} ${rota}`).toContain(r.status());
  }
  // a escala do Bruno, pelo endereço: 404
  const r = await page.goto(`/trabalhos/${s().brunoDiaria}`);
  expect(r?.status()).toBe(404);
});

test("a Mia é da equipe do Farol e freela na Aurora: troca entre os dois", async ({ page, context, baseURL }, info) => {
  await como(context, baseURL!, s().mia);
  await page.goto("/app/hoje");
  const ir = page.getByRole("link", { name: "Seus trabalhos como freela" }).locator("visible=true").first();
  await ir.click();
  await expect(page).toHaveURL(/\/trabalhos$/);
  await expect(page.getByRole("region", { name: "Casa Aurora" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Estúdio Farol" })).toHaveCount(0);
  await semRolagemDeLado(page);
  await fotos(page, "troca", info.project.name);
  await page.getByRole("link", { name: /Produtora/ }).click();
  await expect(page).toHaveURL(/\/app\/hoje$/);
});

test("ligada sem trabalho: vazio calmo; sem vínculo: sem acesso", async ({ page, context, baseURL }, info) => {
  await como(context, baseURL!, s().cora);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/trabalhos$/);
  await expect(page.getByText("Nenhum trabalho por enquanto.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Produtoras" })).toContainText("Estúdio Farol");
  await semRolagemDeLado(page);
  await fotos(page, "vazio", info.project.name);
  await como(context, baseURL!, s().nilo);
  await page.goto("/trabalhos");
  await expect(page).toHaveURL(/\/sem-acesso$/);
});

test("a produtora vê a resposta e escreve o recado", async ({ page, context, baseURL }, info) => {
  await como(context, baseURL!, s().farol);
  await page.goto(`/app/projetos/${s().projeto}`);
  const equipe = page.locator("section.secao").filter({ has: page.getByRole("heading", { name: "Equipe", exact: true }) });
  const linha = equipe.locator("li").filter({ hasText: "Alice Ramos" }).filter({ hasText: "Confirmou" });
  await expect(linha).toHaveCount(1);
  // o Bruno não respondeu
  await expect(equipe.locator("li").filter({ hasText: "Bruno Lima" })).not.toContainText(/Confirmou|Recusou/);
  await linha.locator("summary", { hasText: "Para o freela" }).click();
  await linha.getByLabel("Recado").fill(`Chegar 7h30. Figurino preto, sem logo. (${info.project.name})`);
  await linha.getByRole("button", { name: "Salvar" }).click();
  await expect(linha.getByRole("status")).toHaveText(/O freela já vê/);
  await como(context, baseURL!, s().alice);
  await page.goto(`/trabalhos/${s().aliceDiaria}`);
  await expect(page.getByRole("region", { name: "Da produção" })).toContainText(`(${info.project.name})`);
});

test("o passeio no iPhone (vídeo)", async ({ browser, baseURL }, info) => {
  const pasta = process.env.AF_VIDEO;
  test.skip(!pasta || info.project.name !== "iphone", "só com AF_VIDEO, no iPhone");
  const context = await browser.newContext({ ...info.project.use, recordVideo: { dir: pasta!, size: { width: 393, height: 852 } } });
  await como(context, baseURL!, s().alice);
  const page = await context.newPage();
  await page.goto("/trabalhos");
  await page.waitForTimeout(1200);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(800);
  await page.locator("details.ft-anteriores summary").first().click();
  await page.waitForTimeout(900);
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(600);
  await page.getByRole("link", { name: /Diária na cafeteria/ }).click();
  await page.waitForTimeout(1400);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(900);
  const resposta = page.getByRole("form", { name: "Sua resposta" });
  await resposta.getByRole("button", { name: "Recusar" }).click();
  await expect(resposta).toContainText("Você recusou.");
  await page.waitForTimeout(800);
  await resposta.getByRole("button", { name: "Confirmar" }).click();
  await expect(resposta).toContainText("Você confirmou.");
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await page.waitForTimeout(1200);
  await page.getByRole("link", { name: "Seus trabalhos" }).first().click();
  await page.waitForTimeout(1500);
  await context.close();
});
