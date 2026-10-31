/**
 * Criação · o roteiro aprovado pelo cliente (fase F7): "Enviar ▾ › Para o cliente aprovar" salva a v1 e manda pelo
 * link do card (o lote e o link nascem); o cliente abre `/a` num navegador limpo, lê o roteiro sem nada interno, toca
 * num trecho e comenta, pede ajuste; o editor mostra o comentário embaixo do bloco e "Ajustes pedidos"; a v2 troca a
 * peça e o cliente aprova; quem só lê não manda. No iPhone, o mesmo pela folha do topo, o `/a` sem corte e o editor
 * com o comentário. Organização da Criação (e2e/preparar.ts); cada projeto do Playwright tem o próprio roteiro e card.
 * Com SHOTS_DIR, guarda as capturas `f7-*` (claro e escuro, computador e celular).
 */
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../playwright.config";
import { achadosDeCorte } from "./corte";

const ARQUIVO = "test-results/e2e-sessao-criacao.json";
const SUB = "00000000-0000-4000-8000-000000000cd8";
const SHOTS = process.env.SHOTS_DIR;
const sessao = () => JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string; leitura: string; org: string };
const SEGREDOS = ["Confirmar a autorização do drone", "Golden hour", "drone subindo", "macro 100mm"];

async function noBanco<T>(fn: (sql: postgres.Sql, org: string) => Promise<T>): Promise<T> {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql, sessao().org);
  } finally {
    await sql.end();
  }
}

/** Um roteiro (cópia do da demonstração, sem versão) ligado a um card novo de um cliente da demonstração. */
async function semear(projeto: string): Promise<{ id: string; card: string; titulo: string; cliente: string }> {
  const titulo = `Roteiro para o cliente ${projeto}`;
  const card = `e2e-cl-${projeto}`;
  return noBanco(async (sql, org) => {
    const [c] = await sql`select id, name from maestro.clients where org_id = ${org} and deleted_at is null order by created_at limit 1`;
    const [ja] = await sql`select id from maestro.roteiros where org_id = ${org} and card_id = ${card}`;
    if (ja) return { id: ja.id as string, card, titulo, cliente: c.name as string };
    await sql.begin(async (tx) => {
      await tx`select set_config('maestro.user_sub', ${SUB}, true), set_config('maestro.org_id', ${org}, true)`;
      await tx.unsafe("set local role maestro_app");
      await tx`select maestro.card_criar(${card}, ${tx.json({ tema: `Filme do cliente ${projeto}`, coluna: "fazendo", cliente: c.id })})`;
    });
    const [r] = await sql`
      insert into maestro.roteiros (org_id, card_id, titulo, modelo, formato, conteudo, duracao_seg)
      select org_id, ${card}, ${titulo}, modelo, formato, conteudo, duracao_seg from maestro.roteiros where org_id = ${org} and demo order by created_at limit 1
      returning id`;
    return { id: r.id as string, card, titulo, cliente: c.name as string };
  });
}

const estadoNoBanco = (id: string) => noBanco(async (sql) => ((await sql`select estado from maestro.roteiros where id = ${id}`)[0]?.estado as string) ?? null);

async function entrar(context: BrowserContext, baseURL: string, token = sessao().token, tema = "light") {
  await context.addCookies([
    { name: "mae_sessao", value: token, url: baseURL },
    { name: "zro_theme", value: tema, url: baseURL },
  ]);
}

const nomeShot = (nome: string, tema: string, projeto: string) =>
  `${SHOTS}/f7-${nome}-${tema === "light" ? "claro" : "escuro"}-${projeto === "iphone" ? "celular" : "computador"}.png`;

/** Capturas no claro e no escuro: troca o tema e refaz o caminho até a tela. */
async function fotos(page: Page, context: BrowserContext, baseURL: string, nome: string, projeto: string, chegar: () => Promise<void>) {
  if (!SHOTS) return;
  for (const tema of ["light", "dark"]) {
    await context.addCookies([{ name: "zro_theme", value: tema, url: baseURL }]);
    await chegar();
    await page.waitForTimeout(500);
    await page.screenshot({ path: nomeShot(nome, tema, projeto) });
  }
  await context.addCookies([{ name: "zro_theme", value: "light", url: baseURL }]);
}

/** O cliente: um navegador limpo (sem sessão), com o tamanho do projeto. */
async function navegadorDoCliente(browser: Browser, projeto: string, baseURL: string, tema = "light") {
  const c = await browser.newContext(
    projeto === "iphone"
      ? { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, baseURL }
      : { viewport: { width: 1440, height: 900 }, baseURL },
  );
  await c.addCookies([{ name: "zro_theme", value: tema, url: baseURL }]);
  return c;
}

async function abrirFolhaCliente(page: Page, celular: boolean) {
  if (celular) {
    await page.locator(".cr-topo").getByRole("button", { name: "Enviar" }).click();
    await page
      .getByRole("dialog", { name: "Enviar" })
      .getByRole("menuitem", { name: /Para o cliente aprovar/ })
      .click();
  } else {
    await page.getByRole("button", { name: "Enviar" }).click();
    await page
      .getByRole("menu", { name: "Enviar" })
      .getByRole("menuitem", { name: /Para o cliente aprovar/ })
      .click();
  }
  return page.getByRole("dialog", { name: "Para o cliente aprovar" });
}

/** Comentar num trecho do roteiro no /a (o nome vai junto na primeira vez). */
async function comentarNoTrecho(a: Page, bloco: string, texto: string, nome?: string) {
  const trecho = a.locator(`.cl-rot__bloco[data-bloco="${bloco}"]`);
  await trecho.locator(".cl-rot__alvo").click();
  const caixa = trecho.getByRole("form", { name: "Comentar este trecho" });
  if (nome) await caixa.getByLabel("Seu nome").fill(nome);
  await caixa.getByRole("textbox", { name: "Comentário" }).fill(texto);
  await caixa.getByRole("button", { name: "Comentar" }).click();
  await expect(trecho.locator(".cl-rot__comentarios")).toContainText(texto);
  return trecho;
}

async function decidirNoA(a: Page, decisao: "aprovado" | "ajuste", nome: string) {
  await a.locator(`.cl-escolha[data-tipo='${decisao}']`).click();
  await a.getByRole("button", { name: /Revisar e enviar/ }).click();
  const resumo = a.getByRole("form", { name: "Revisar e enviar" });
  await resumo.getByLabel("Seu nome").fill(nome);
  await resumo.getByRole("checkbox").check();
  await resumo.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(a.getByRole("heading", { name: "Enviado." })).toBeVisible();
}

test.describe("Para o cliente aprovar, no computador", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "computador", "computador"));

  test("manda a v1 → o cliente comenta num trecho e pede ajuste → v2 → aprova", async ({ page, context, baseURL, browser }, info) => {
    test.setTimeout(120_000);
    const s = await semear(info.project.name);
    await entrar(context, baseURL!);
    const url = `/app/criacao/roteiros/${s.id}?vista=literario`;
    await page.goto(url);

    // sem versão: a folha salva a v1; o card e o cliente dele aparecem antes de mandar
    let folha = await abrirFolhaCliente(page, false);
    await expect(folha).toContainText("Envio sai de uma versão salva.");
    await folha.getByRole("button", { name: "Salvar v1 e continuar" }).click();
    await expect(folha.locator(".cr-cliente__card")).toContainText(`Filme do cliente ${info.project.name}`);
    await expect(folha).toContainText(`Vai para um link novo para ${s.cliente}.`);
    if (SHOTS) await page.screenshot({ path: nomeShot("enviar-cliente", "light", info.project.name) });
    await folha.getByRole("button", { name: "Mandar a v1" }).click();
    await expect(folha).toContainText("A v1 está com o cliente.");
    const link = await folha.getByRole("link", { name: "Ver como o cliente" }).getAttribute("href");
    expect(link).toMatch(/\/a\/[A-Za-z0-9_-]{43}$/);
    await page.keyboard.press("Escape");
    await expect(page.locator(".cr-cabeca .selo")).toContainText("Com o cliente");
    if (SHOTS) {
      // a folha no escuro (de novo: a v1 já está lá, o botão vira "Copiar o link")
      await context.addCookies([{ name: "zro_theme", value: "dark", url: baseURL! }]);
      await page.goto(url);
      folha = await abrirFolhaCliente(page, false);
      await expect(folha.getByRole("button", { name: "Copiar o link" })).toBeVisible();
      await page.screenshot({ path: nomeShot("enviar-cliente", "dark", info.project.name) });
      await page.keyboard.press("Escape");
      await context.addCookies([{ name: "zro_theme", value: "light", url: baseURL! }]);
    }

    // o cliente, num navegador limpo: o roteiro em Literário, sem nota interna, plano nem observação
    const ctxCliente = await navegadorDoCliente(browser, info.project.name, baseURL!);
    const a = await ctxCliente.newPage();
    await a.goto(link!);
    await expect(a.locator(".cl-rot")).toBeVisible();
    await expect(a.locator(".cl-rot__meta")).toContainText("Roteiro · v1");
    await expect(a.locator(".cl-rot__cena h3").first()).toHaveText("1. EXT. FAZENDA – AMANHECER");
    const html = await a.content();
    for (const segredo of [...SEGREDOS, s.id]) expect(html, segredo).not.toContain(segredo);
    await expect(a.locator('.cl-rot__bloco[data-bloco="demo-b07"]')).toHaveCount(0);
    const trecho = await comentarNoTrecho(a, "demo-b05", "Trocar por “antes do amanhecer”.", "Marina Lopes");
    await expect(trecho.locator(".cl-rot__n")).toHaveText("1");
    await fotos(a, ctxCliente, baseURL!, "cliente-a", info.project.name, async () => {
      await a.goto(link!);
      await a.locator('.cl-rot__bloco[data-bloco="demo-b05"] .cl-rot__alvo').click();
      await a.locator('.cl-rot__bloco[data-bloco="demo-b05"]').scrollIntoViewIfNeeded();
    });
    await a.goto(link!);
    await decidirNoA(a, "ajuste", "Marina Lopes");

    // no editor: "Ajustes pedidos", o comentário embaixo do bloco, a folha do cliente com a história
    await page.goto(url);
    await expect(page.locator(".cr-cabeca .selo")).toContainText("Ajustes pedidos");
    const bloco = page.locator('.cr-bloco[data-bloco="demo-b05"]');
    await expect(bloco.locator(".cr-cli")).toContainText("Trocar por “antes do amanhecer”.");
    await expect(bloco.locator(".cr-cli")).toContainText("Marina Lopes");
    await expect(page.getByRole("button", { name: "1 comentário do cliente em aberto" })).toBeVisible();
    await fotos(page, context, baseURL!, "editor-comentarios", info.project.name, async () => {
      await page.goto(url);
      await page.locator('.cr-bloco[data-bloco="demo-b05"] .cr-cli').scrollIntoViewIfNeeded();
    });
    await page.goto(url);
    await page.getByRole("button", { name: "1 comentário do cliente em aberto" }).click();
    const historia = page.getByRole("dialog", { name: "Cliente" });
    await expect(historia.getByRole("list", { name: "Decisões do cliente" })).toContainText("Ajustes pedidos · v1 · Marina Lopes");
    await historia.getByRole("button", { name: "Resolver" }).click();
    await expect(historia.getByRole("button", { name: "Reabrir" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bloco.locator(".cr-cli")).toHaveCount(0);

    // a v2: muda o texto, a folha salva a próxima e manda; o cliente vê a v2 e aprova
    const campo = page.locator('textarea[data-campo="demo-b05"]');
    await campo.fill("Tudo começa antes do amanhecer. [pausa]");
    await expect(page.locator(".cr-gravacao")).toHaveText("Salvo");
    folha = await abrirFolhaCliente(page, false);
    await expect(folha).toContainText("O rascunho mudou depois da v1.");
    await folha.getByRole("button", { name: "Salvar v2 e continuar" }).click();
    await folha.getByRole("button", { name: "Mandar a v2" }).click();
    await expect(folha).toContainText("A v2 está com o cliente.");
    expect(await folha.getByRole("link", { name: "Ver como o cliente" }).getAttribute("href")).toBe(link);
    await page.keyboard.press("Escape");

    await a.goto(link!);
    await expect(a.locator(".cl-rot__meta")).toContainText("Roteiro · v2");
    await expect(a.locator('.cl-rot__bloco[data-bloco="demo-b05"]')).toContainText("antes do amanhecer");
    await expect(a.locator(".cl-rot__n")).toHaveCount(0);
    await decidirNoA(a, "aprovado", "Marina Lopes");
    await ctxCliente.close();
    expect(await estadoNoBanco(s.id)).toBe("aprovado");

    await page.goto(url);
    await expect(page.locator(".cr-cabeca .selo")).toContainText("Aprovado");
    // a ficha do card: o roteiro aprovado e as duas versões de roteiro
    await page.goto(`/app/quadro?card=${s.card}`);
    const ficha = page.getByRole("dialog", { name: `Card: Filme do cliente ${info.project.name}` });
    await expect(ficha.getByRole("region", { name: "Criação" })).toContainText("Aprovado");
    await expect(ficha.getByRole("region", { name: "Versões" }).locator(".vc__versao")).toHaveCount(2);
    // a auditoria: duas idas ao cliente e as duas decisões
    const acoes = await noBanco(async (sql) =>
      (await sql`select action from maestro.audit_log where target_id = ${s.id} and action in ('roteiro.enviado', 'roteiro.decisao') order by created_at`).map(
        (x) => x.action as string,
      ),
    );
    expect(acoes).toEqual(["roteiro.enviado", "roteiro.decisao", "roteiro.enviado", "roteiro.decisao"]);
  });

  test("quem só lê não manda: sem Enviar e a rota recusa", async ({ page, context, baseURL }, info) => {
    const s = await semear(info.project.name);
    await entrar(context, baseURL!, sessao().leitura);
    await page.goto(`/app/criacao/roteiros/${s.id}`);
    await expect(page.getByRole("button", { name: "Versões" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar" })).toHaveCount(0);
    for (const data of [
      { op: "cliente", n: 1 },
      { op: "resolver", id: "00000000-0000-4000-8000-000000000000", resolvido: true },
    ]) {
      const r = await page.request.post(`/api/criacao/roteiros/${s.id}`, { data, headers: { origin: baseURL! } });
      expect(r.status()).toBe(403);
    }
    expect((await page.request.get(`/api/criacao/roteiros/${s.id}?para-cliente=1`)).status()).toBe(403);
  });
});

test.describe("Para o cliente aprovar, no iPhone", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "iphone", "iphone"));

  test("a folha do topo manda; o /a sem corte com o comentário num trecho; o editor mostra", async ({ page, context, baseURL, browser }, info) => {
    test.setTimeout(120_000);
    const s = await semear(info.project.name);
    await entrar(context, baseURL!);
    const url = `/app/criacao/roteiros/${s.id}?vista=literario`;
    await page.goto(url);
    const folha = await abrirFolhaCliente(page, true);
    await folha.getByRole("button", { name: /^Salvar v\d+ e continuar$/ }).click();
    await expect(folha.locator(".cr-cliente__card")).toBeVisible();
    await fotos(page, context, baseURL!, "enviar-cliente", info.project.name, async () => {
      await page.goto(url);
      const f = await abrirFolhaCliente(page, true);
      await expect(f.locator(".cr-cliente__card")).toBeVisible();
    });
    await page.goto(url);
    const f2 = await abrirFolhaCliente(page, true);
    await f2.getByRole("button", { name: /^(Mandar a v\d+|Copiar o link)$/ }).click();
    await expect(f2).toContainText(/está com o cliente|já estava com o cliente/);
    const link = (await f2.getByRole("link", { name: "Ver como o cliente" }).getAttribute("href"))!;

    for (const tema of ["light", "dark"]) {
      const ctxCliente = await navegadorDoCliente(browser, info.project.name, baseURL!, tema);
      const a = await ctxCliente.newPage();
      await a.goto(link);
      await expect(a.locator(".cl-rot")).toBeVisible();
      if (tema === "light") await comentarNoTrecho(a, "demo-b09", "Mostrar as mãos dele.", "Marina");
      else {
        await a.locator('.cl-rot__bloco[data-bloco="demo-b09"] .cl-rot__alvo').click();
        await expect(a.locator('.cl-rot__bloco[data-bloco="demo-b09"] .cl-rot__comentarios')).toContainText("Mostrar as mãos dele.");
      }
      await a.locator('.cl-rot__bloco[data-bloco="demo-b09"]').scrollIntoViewIfNeeded();
      await a.waitForTimeout(400);
      expect(await achadosDeCorte(a), `corte no /a (${tema})`).toEqual([]);
      if (SHOTS) await a.screenshot({ path: nomeShot("cliente-a", tema, info.project.name) });
      await ctxCliente.close();
    }

    // o editor no iPhone: a cena 2 com o comentário embaixo do bloco
    await fotos(page, context, baseURL!, "editor-comentarios", info.project.name, async () => {
      await page.goto(url);
      await page.getByRole("button", { name: /comentário do cliente em aberto/ }).click();
      await page
        .getByRole("dialog", { name: "Cliente" })
        .getByRole("button", { name: /Cena 2/ })
        .click();
      await expect(page.locator('.cr-bloco[data-bloco="demo-b09"] .cr-cli')).toBeVisible();
      await page.locator('.cr-bloco[data-bloco="demo-b09"] .cr-cli').scrollIntoViewIfNeeded();
    });
    await page.goto(url);
    await page.getByRole("button", { name: /comentário do cliente em aberto/ }).click();
    await page
      .getByRole("dialog", { name: "Cliente" })
      .getByRole("button", { name: /Cena 2/ })
      .click();
    await expect(page.locator('.cr-bloco[data-bloco="demo-b09"] .cr-cli')).toContainText("Mostrar as mãos dele.");
  });
});
