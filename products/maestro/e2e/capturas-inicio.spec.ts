/**
 * As capturas da página inicial (`public/produto/*-{claro,escuro}.webp`): o Maestro de verdade, com a produtora de
 * demonstração (e2e/preparar.ts + "Carregar demonstração"), no MacBook (1440×900 @1,5) e no iPhone (393×852 @2), em
 * claro e escuro. Só roda com `CAPTURAS_DIR=<pasta>` (PNG); `node scripts/capturas-inicio.mjs <pasta>` vira WebP em
 * public/produto. Nunca mock: o que aparece é a tela que a equipe usa. O que a demonstração não traz é feito aqui pelos
 * mesmos caminhos da tela: a equipe (pessoas fictícias no banco do e2e), o Fluxo (pela API, com as referências da
 * pasta `docs/demonstracao/fluxo/`, fotos de exemplo) e a semana da ANP (a falsa do e2e).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../playwright.config";

const DIR = process.env.CAPTURAS_DIR;
const ARQUIVO_SESSAO_DEMO = "test-results/e2e-sessao-demo.json";
const SUB_DEMO = "00000000-0000-4000-8000-0000000000d2";
const ORG_DEMO = "00000000-0000-4000-8000-0000000000d1";

test.skip(!DIR, "só com CAPTURAS_DIR");
test.describe.configure({ mode: "serial" });

async function entrar(context: BrowserContext, baseURL: string, tema: "light" | "dark") {
  const { token } = JSON.parse(readFileSync(ARQUIVO_SESSAO_DEMO, "utf8")) as { token: string };
  await context.addCookies([
    { name: "mae_sessao", value: token, url: baseURL },
    { name: "zro_theme", value: tema, url: baseURL },
  ]);
}

/** Espera a tela assentar: imagens carregadas, fontes prontas e as entradas do CSS terminadas. */
async function assentar(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => ((i.onload = r), (i.onerror = r))))));
  });
  await page.waitForTimeout(1400);
}

async function foto(page: Page, nome: string) {
  await assentar(page);
  await page.screenshot({ path: `${DIR}/${nome}.png` });
}

/** A equipe da produtora de demonstração (pessoas fictícias) e o nome de quem entra. */
async function semearEquipe() {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    const [org] = await sql`select id from maestro.organizations where zro_org_id = ${ORG_DEMO}`;
    await sql`update maestro.members set display_name = 'Diana Prado', funcao = 'Direção' where org_id = ${org.id} and zro_sub = ${SUB_DEMO}`;
    const equipe: [string, string, string, string, string][] = [
      ["00000000-0000-4000-8000-00000000c0a1", "Bruna Lima", "manager", "gestor", "Produção executiva"],
      ["00000000-0000-4000-8000-00000000c0a2", "Caio Mendes", "editor", "equipe", "Edição"],
      ["00000000-0000-4000-8000-00000000c0a3", "Otávio Reis", "editor", "equipe", "Câmera"],
      ["00000000-0000-4000-8000-00000000c0a4", "Renata Alves", "viewer", "leitura", "Atendimento"],
    ];
    for (const [sub, nome, hub, papel, funcao] of equipe)
      await sql`insert into maestro.members (org_id, zro_sub, display_name, hub_role, role, funcao)
        values (${org.id}, ${sub}, ${nome}, ${hub}, ${papel}, ${funcao}) on conflict do nothing`;
    // a edição vê as diárias (ajuste da administração por cima do padrão da Equipe)
    await sql`insert into maestro.acessos (org_id, zro_sub, area, permitido, atualizado_por)
      values (${org.id}, ${equipe[1][0]}, 'diarias', true, ${SUB_DEMO}) on conflict do nothing`;
    return org.id as string;
  } finally {
    await sql.end();
  }
}

/** O Fluxo do filme Safra pela API (como a tela grava): seções, notas, fotos de referência e o roteiro ligado. */
async function semearFluxo(page: Page, roteiroId: string, cardId: string | null) {
  const origem = new URL(page.url()).origin;
  const h = { Origin: origem };
  const r = await page.request.post("/api/criacao/fluxo", { data: { op: "criar", titulo: "Filme Safra 2027" }, headers: h });
  expect(r.status()).toBe(201);
  const { id } = (await r.json()) as { id: string };
  const img = async (arq: string) => {
    const x = await page.request.post(`/api/criacao/img?fluxo=${id}`, {
      data: readFileSync(`docs/demonstracao/fluxo/${arq}`),
      headers: { ...h, "content-type": "image/webp" },
    });
    expect(x.ok()).toBe(true);
    return ((await x.json()) as { imagem: { id: string } }).imagem.id;
  };
  const [serra, maos, xicara] = [await img("serra.webp"), await img("maos.webp"), await img("xicara.webp")];
  const u = () => crypto.randomUUID();
  const [s1, s2, n1, n2, n3, i1, i2, i3, rt, cd] = Array.from({ length: 10 }, u);
  const ops: Record<string, unknown>[] = [
    { op: "criar_no", id: s1, tipo: "secao", x: 0, y: 0, w: 760, h: 470, z: 1, dados: { nome: "Clima e luz", cor: "pessego" } },
    { op: "criar_no", id: i1, tipo: "imagem", x: 30, y: 60, w: 330, h: 248, z: 2, secaoId: s1, imagemId: serra, dados: { legenda: "Amanhecer na serra" } },
    { op: "criar_no", id: i2, tipo: "imagem", x: 390, y: 60, w: 330, h: 248, z: 3, secaoId: s1, imagemId: maos, dados: { legenda: "A colheita nas mãos" } },
    {
      op: "criar_no",
      id: n1,
      tipo: "nota",
      x: 30,
      y: 336,
      w: 300,
      h: 104,
      z: 4,
      secaoId: s1,
      dados: { texto: "Luz dourada, nada de azul. Câmera na mão só na colheita.", cor: "amarelo" },
    },
    { op: "criar_no", id: s2, tipo: "secao", x: 840, y: 0, w: 640, h: 470, z: 5, dados: { nome: "Da fazenda à xícara", cor: "menta" } },
    {
      op: "criar_no",
      id: i3,
      tipo: "imagem",
      x: 870,
      y: 60,
      w: 330,
      h: 248,
      z: 6,
      secaoId: s2,
      imagemId: xicara,
      dados: { legenda: "Fecho no café da cidade" },
    },
    { op: "criar_no", id: rt, tipo: "roteiro", x: 1230, y: 60, w: 220, h: 130, z: 7, secaoId: s2, roteiroId, dados: {} },
    { op: "criar_no", id: n2, tipo: "nota", x: 1230, y: 220, w: 220, h: 110, z: 8, secaoId: s2, dados: { texto: "Trilha: violão e piano.", cor: "menta" } },
    {
      op: "criar_no",
      id: n3,
      tipo: "nota",
      x: 870,
      y: 336,
      w: 330,
      h: 104,
      z: 9,
      secaoId: s2,
      dados: { texto: "Entrevista com a família no terreiro.", cor: "lavanda" },
    },
    { op: "criar_ligacao", de: i1, para: i2, rotulo: "abre" },
    { op: "criar_ligacao", de: i2, para: i3, rotulo: "corta" },
  ];
  if (cardId) ops.push({ op: "criar_no", id: cd, tipo: "card", x: 1230, y: 350, w: 220, h: 100, z: 10, secaoId: s2, cardId, dados: {} });
  const o = await page.request.post("/api/criacao/fluxo", { data: { op: "ops", id, ops }, headers: h });
  expect(o.status(), await o.text()).toBe(200);
  return id;
}

type Ids = { roteiro: string; fluxo: string; lote: string; linkCliente: string; orcamento: string; diaria: string };
let ids: Ids;

test("carregar a demonstração e o que ela não traz", async ({ page, context, baseURL, request }, info) => {
  test.setTimeout(180_000);
  test.skip(info.project.name !== "computador", "uma vez");
  mkdirSync(DIR!, { recursive: true });
  await entrar(context, baseURL!, "light");
  await page.goto("/app/ajustes");
  const carregar = page.getByRole("button", { name: /(Carregar|Completar) demonstra/ });
  const pronta = page.getByText("Os dados de exemplo estão em todas as seções.");
  await expect(carregar.or(pronta).first()).toBeVisible();
  if (await carregar.count()) {
    await carregar.click();
    await page.waitForURL("**/app/quadro", { timeout: 90_000 });
  }
  // a semana da ANP (a falsa do e2e) para a calculadora de viagem
  await request.get("/api/cron/combustivel", { headers: { authorization: "Bearer segredo-do-cron-e2e" } });
  const orgId = await semearEquipe();

  await page.goto("/app/criacao");
  const roteiro = (await page.locator('a[href^="/app/criacao/roteiros/"]').first().getAttribute("href"))!.split("/").pop()!;
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  const [card] =
    await sql`select id from maestro.cards where org_id = ${orgId} and id like 'demo-%' and coluna = 'fazendo' and dados->>'tema' ilike '%filme%' limit 1`.catch(
      () => [],
    );
  await sql.end();
  const fluxo = await semearFluxo(page, roteiro, (card?.id as string) ?? null);

  // o lote com o vídeo, os comentários no tempo e a decisão do cliente (a equipe e o link)
  const loteDe = async (cliente: string) => {
    await page.goto("/app/aprovacoes");
    await page.locator('a[href^="/app/aprovacoes/"]').filter({ hasText: cliente }).first().click();
    await page.waitForURL(/\/app\/aprovacoes\/[0-9a-f-]{36}/);
    return page.url().split("/").pop()!;
  };
  const lote = await loteDe("Instituto Mar Aberto");
  await page.getByRole("button", { name: "Copiar link" }).click();
  const linkCliente = new URL(await page.getByLabel("Endereço do link").inputValue()).pathname;

  // o rascunho com o contrato indo junto
  await page.goto("/app/orcamentos?status=rascunho");
  await page.locator(".lista .item").first().click();
  await page.waitForURL(/\/app\/orcamentos\/[0-9a-f-]{36}/);
  const orcamento = page.url().split("/").pop()!;
  await page.getByRole("button", { name: "Enviar contrato junto" }).click();
  await expect(page.getByRole("button", { name: "Não enviar contrato" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Vai junto com o link; o cliente aceita os dois.")).toBeVisible();

  await page.goto("/app/agenda");
  await page.locator(".evento", { hasText: "Safra 2027: fazenda" }).first().click();
  await page.waitForURL(/\/app\/agenda\/[0-9a-f-]{36}/);
  const diaria = page.url().split("/").pop()!;
  ids = { roteiro, fluxo, lote, linkCliente, orcamento, diaria };
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/capturas-ids.json", JSON.stringify(ids));
});

const temas = [
  ["claro", "light"],
  ["escuro", "dark"],
] as const;

for (const [nomeTema, tema] of temas) {
  test(`telas · ${nomeTema}`, async ({ browser, baseURL }, info) => {
    test.setTimeout(300_000);
    ids ??= JSON.parse(readFileSync("test-results/capturas-ids.json", "utf8")) as Ids;
    // MacBook a 1,5× (2160×1350) e iPhone a 2× (786×1704), o tamanho das molduras da página inicial.
    const mac = info.project.name === "computador";
    const context = await browser.newContext({
      ...info.project.use,
      baseURL,
      deviceScaleFactor: mac ? 1.5 : 2,
      ...(mac ? {} : { viewport: { width: 393, height: 852 } }),
      timezoneId: "America/Sao_Paulo",
      locale: "pt-BR",
    });
    const page = await context.newPage();
    await entrar(context, baseURL!, tema);
    await page.clock.setFixedTime(new Date("2026-10-30T10:20:00-03:00"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    const sufixo = `${mac ? "mac" : "iphone"}-${nomeTema}`;
    const ir = async (nome: string, rota: string) => {
      await page.goto(rota);
      await foto(page, `${nome}-${sufixo}`);
    };
    await ir("quadro", "/app/quadro");
    if (mac) {
      await ir("agenda", "/app/agenda");
      await ir("aprovacao", `/app/aprovacoes/${ids.lote}`);
      await ir("financeiro", "/app/financeiro/fluxo");
      await ir("fluxo", `/app/criacao/fluxos/${ids.fluxo}`);
    } else {
      await ir("hoje", "/app/hoje");
      await ir("financeiro", "/app/financeiro/numeros");
      // a diária no celular, já na equipe
      await page.goto(`/app/agenda/${ids.diaria}`);
      await assentar(page);
      await page
        .getByRole("heading", { name: "Equipe" })
        .first()
        .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 96));
      await foto(page, `equipe-${sufixo}`);
    }
    // O roteiro nas quatro vistas (no celular, o Teleprompter).
    for (const vista of mac ? ["Literário", "Técnico", "Teleprompter", "Edição"] : ["Teleprompter"]) {
      await page.goto(`/app/criacao/roteiros/${ids.roteiro}`);
      await assentar(page);
      const r = page.getByRole("radio", { name: vista === "Teleprompter" && !mac ? /^(TP|Teleprompter)$/ : vista });
      await expect(async () => {
        await r.first().click();
        await expect(r.first()).toHaveAttribute("aria-checked", "true", { timeout: 1000 });
      }).toPass();
      await foto(
        page,
        `roteiro-${vista
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()}-${sufixo}`,
      );
    }

    // Orçamento com o contrato e a calculadora de viagem: São Paulo → Campinas, SUV compacto, gasolina pela ANP.
    await page.goto(`/app/orcamentos/${ids.orcamento}`);
    await foto(page, `orcamento-${sufixo}`);
    if (mac) {
      await page.getByRole("button", { name: "Deslocamento" }).click();
      const d = page.getByRole("dialog");
      await d.getByRole("radio", { name: "Gasolina" }).click();
      await d.getByLabel("Saída").fill("São Paulo");
      await expect(d.locator("#desl-saida-dica")).toHaveText("São Paulo/SP");
      await d.getByLabel("Chegada").fill("Campinas");
      await expect(d.locator("#desl-chegada-dica")).toHaveText("Campinas/SP");
      await expect(d.getByLabel("Km de uma ida")).not.toHaveValue("");
      await d.getByRole("button", { name: /^SUV compacto/ }).click();
      await d.getByLabel("Chegada").blur();
      // a folha inteira, sem a rolagem dela: a janela cresce só para a foto
      await page.setViewportSize({ width: 1440, height: 1400 });
      await assentar(page);
      await d.screenshot({ path: `${DIR}/viagem-${sufixo}.png` });
      await page.setViewportSize({ width: 1440, height: 900 });
    }

    // O cliente, sem conta, no link da aprovação.
    const cli = await browser.newContext({ ...info.project.use, baseURL, deviceScaleFactor: 2, viewport: { width: 393, height: 852 } });
    await cli.addCookies([{ name: "zro_theme", value: tema, url: baseURL! }]);
    const c = await cli.newPage();
    await c.emulateMedia({ reducedMotion: "reduce" });
    if (!mac) {
      await c.goto(ids.linkCliente);
      await foto(c, `aprovacao-${sufixo}`);
    }
    await cli.close();
    await context.close();
  });
}
