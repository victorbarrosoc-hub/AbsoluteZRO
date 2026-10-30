/**
 * Criação · Enviar (fase F3): sempre de uma versão salva (sem versão, a folha salva antes; rascunho mudado, salva a
 * próxima ou usa a última), TPeasy (o .txt e o backup baixados são exatamente o que o modelo gera da versão), PDF para
 * a edição, a auditoria do que saiu, a opção do AEON escondida com o gate fechado e aparecendo sozinha quando abre (o
 * arquivo confere com o contrato publicado), o bloco "Criação" na ficha do card e quem só lê sem nada para enviar.
 * Organização da Criação (e2e/preparar.ts); cada projeto do Playwright tem o próprio roteiro e card. Com SHOTS_DIR,
 * guarda as capturas (menu, folha do TPeasy e ficha do card; claro e escuro).
 */
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../playwright.config";
import { conferirEsquema, esquemaPublicado } from "../tests/esquema-json.mts";
import type { Roteiro } from "../src/lib/criacao/roteiro/modelo";
import { arquivoParaEdicao, saidaTpeasy } from "../src/lib/criacao/roteiro/saidas";

const ARQUIVO = "test-results/e2e-sessao-criacao.json";
const SUB = "00000000-0000-4000-8000-0000000000d8";
const SHOTS = process.env.SHOTS_DIR;
const sessao = () => JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string; leitura: string; org: string };

async function noBanco<T>(fn: (sql: postgres.Sql, org: string) => Promise<T>): Promise<T> {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql, sessao().org);
  } finally {
    await sql.end();
  }
}

/** Um roteiro (cópia do da demonstração, sem versão) ligado a um card novo, só deste projeto do Playwright. */
async function semear(projeto: string): Promise<{ id: string; card: string; titulo: string; tema: string }> {
  const titulo = `Roteiro para enviar ${projeto}`;
  const tema = `Filme da safra ${projeto}`;
  const card = `e2e-cr-${projeto}`;
  return noBanco(async (sql, org) => {
    // já semeado por um teste anterior deste projeto (o título pode ter mudado lá)
    const [ja] = await sql`select id, titulo from maestro.roteiros where org_id = ${org} and card_id = ${card}`;
    if (ja) return { id: ja.id as string, card, titulo: ja.titulo as string, tema };
    await sql.begin(async (tx) => {
      await tx`select set_config('maestro.user_sub', ${SUB}, true), set_config('maestro.org_id', ${org}, true)`;
      await tx.unsafe("set local role maestro_app");
      await tx`select maestro.card_criar(${card}, ${tx.json({ tema, coluna: "fazendo" })})`;
    });
    const [r] = await sql`
      insert into maestro.roteiros (org_id, card_id, titulo, modelo, formato, conteudo, duracao_seg)
      select org_id, ${card}, ${titulo}, modelo, formato, conteudo, duracao_seg from maestro.roteiros where org_id = ${org} and demo order by created_at limit 1
      returning id`;
    return { id: r.id as string, card, titulo, tema };
  });
}

async function entrar(context: BrowserContext, baseURL: string, token = sessao().token) {
  await context.addCookies([
    { name: "mae_sessao", value: token, url: baseURL },
    { name: "zro_theme", value: "light", url: baseURL },
  ]);
}

/** Abre o AEON (ou fecha de novo) para a pessoa: a claim do gate e o produto na sessão, como o login traria. */
async function aeon(aberto: boolean) {
  await noBanco(async (sql, org) => {
    if (aberto)
      await sql`update maestro.sessions set produtos = array['maestro', 'ai-edit'], zro_release = ${sql.json({ maestro: "allowed", "ai-edit": "allowed" })}
                 where org_id = ${org} and zro_sub = ${SUB}`;
    else
      await sql`update maestro.sessions set produtos = array['maestro'], zro_release = ${sql.json({ maestro: "allowed" })} where org_id = ${org} and zro_sub = ${SUB}`;
  });
}

const envios = (id: string) =>
  noBanco(
    async (sql) =>
      (await sql`select metadata from maestro.audit_log where action = 'roteiro.enviado' and target_id = ${id} order by created_at`) as unknown as {
        metadata: { destino: string; formato: string; n: number; pessoa: string | null; sha256: string };
      }[],
  );

async function versaoDaApi(page: Page, id: string, n: number) {
  const r = await page.request.get(`/api/criacao/roteiros/${id}?versao=${n}`);
  expect(r.ok()).toBe(true);
  return ((await r.json()) as { versao: { n: number; titulo: string; sha256: string; criadoEm: string; conteudo: Roteiro } }).versao;
}

/** Capturas no claro e no escuro: recarrega com o tema e refaz o caminho até a tela. */
async function fotos(page: Page, context: BrowserContext, baseURL: string, nome: string, projeto: string, url: string, chegar: () => Promise<void>) {
  if (!SHOTS) return;
  for (const tema of ["light", "dark"]) {
    await context.addCookies([{ name: "zro_theme", value: tema, url: baseURL }]);
    await page.goto(url);
    await chegar();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/maestro-${nome}-${tema === "light" ? "claro" : "escuro"}-${projeto === "iphone" ? "celular" : "computador"}.png` });
  }
  await context.addCookies([{ name: "zro_theme", value: "light", url: baseURL }]);
}

async function baixado(page: Page, clicar: () => Promise<void>): Promise<{ nome: string; texto: string }> {
  const [d] = await Promise.all([page.waitForEvent("download"), clicar()]);
  return { nome: d.suggestedFilename(), texto: readFileSync((await d.path())!, "utf8") };
}

test.describe("Enviar no computador", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "computador", "computador"));

  test("TPeasy: salva a v1 antes; o .txt e o backup são o que sai da versão; PDF para a edição; auditoria", async ({ page, context, baseURL }, info) => {
    const s = await semear(info.project.name);
    await entrar(context, baseURL!);
    const url = `/app/criacao/roteiros/${s.id}?vista=literario`;
    await page.goto(url);

    // o menu: TPeasy, PDF para a edição, PDF e Cliente (desligado); Salvar versão continua ao alcance; AEON não aparece
    await page.getByRole("button", { name: "Enviar" }).click();
    const menu = page.getByRole("menu", { name: "Enviar" });
    await expect(menu.getByRole("menuitem")).toHaveText([/TPeasy/, /PDF para a edição/, /^PDF/, /Cliente/, /Salvar versão/]);
    await expect(menu.getByRole("menuitem", { name: /Cliente/ })).toBeDisabled();
    await expect(menu.getByRole("menuitem", { name: /AEON/ })).toHaveCount(0);
    await expect(page.getByText("AEON")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Salvar versão" })).toBeVisible();

    // TPeasy: sem versão, a folha salva a v1 antes de qualquer saída
    await page.getByRole("button", { name: "Enviar" }).click();
    await menu.getByRole("menuitem", { name: /TPeasy/ }).click();
    const folha = page.getByRole("dialog", { name: "TPeasy" });
    await expect(folha).toContainText("Envio sai de uma versão salva.");
    await folha.getByRole("button", { name: "Salvar v1 e continuar" }).click();
    await expect(folha.locator(".cr-enviar__versao")).toContainText("v1");
    await expect(page.locator(".cr-cabeca .selo")).toContainText("v1");
    await expect(folha).toContainText("Compartilha o texto pronto");
    await expect(folha).not.toContainText(/sincroniz/i);

    // por pessoa: Antônio; o .txt é o texto pronto da versão, com o título no nome (vira o título no TPeasy)
    await folha.getByRole("radio", { name: "Antônio" }).click();
    const v1 = await versaoDaApi(page, s.id, 1);
    const origem = { roteiroId: s.id, titulo: v1.titulo, n: 1, sha256: v1.sha256, criadoEm: v1.criadoEm, conteudo: v1.conteudo };
    const esperado = saidaTpeasy(origem, "demo-ant");
    const txt = await baixado(page, () => folha.getByRole("button", { name: ".txt" }).click());
    expect(txt.nome).toBe(`${s.titulo} · Antônio.txt`);
    expect(txt.texto).toBe(esperado.texto);
    expect(txt.texto).toContain("# Cena");
    expect(txt.texto).not.toMatch(/\[Antônio\]/);
    // só as falas: nada de lettering, plano ou nota
    for (const fora of ["GC", "Trilha", "PG ", "Drone"]) expect(txt.texto).not.toContain(fora);

    // o backup do TPeasy: id estável por roteiro e pessoa, hora da versão, o mesmo texto
    const bk = await baixado(page, () => folha.getByRole("button", { name: "Backup do TPeasy" }).click());
    expect(bk.nome).toBe(`${s.titulo} · Antônio · v1 · TPeasy.json`);
    const backup = JSON.parse(bk.texto);
    expect(conferirEsquema(esquemaPublicado("tpeasy.backup.v1"), backup)).toEqual([]);
    expect({ ...backup, exportedAt: "x" }).toEqual({ ...esperado.backup, exportedAt: "x" });
    expect(backup.scripts[0].id).toBe(`maestro-${s.id}-demo-ant`);
    await expect(folha.getByRole("list", { name: "Últimos envios" })).toContainText("TPeasy · backup · v1");

    // mudou o rascunho: a próxima saída pergunta; "Usar a v1" segue com a versão salva
    await page.keyboard.press("Escape");
    await expect(folha).toHaveCount(0);
    await page.getByLabel("Título do roteiro").fill(`${s.titulo} (ajuste)`);
    await page.getByLabel("Título do roteiro").blur();
    await expect(page.locator(".cr-gravacao")).toHaveText("Salvo", { timeout: 10_000 });
    await page.getByRole("button", { name: "Enviar" }).click();
    await menu.getByRole("menuitem", { name: /PDF para a edição/ }).click();
    const edicao = page.getByRole("dialog", { name: "PDF para a edição" });
    await expect(edicao).toContainText("O rascunho mudou depois da v1.");
    await edicao.getByRole("button", { name: "Usar a v1" }).click();
    await edicao.getByRole("link", { name: "Abrir o PDF" }).click();
    await page.waitForURL(/\/imprimir\?vista=edicao&versao=1$/);
    await expect(page.locator(".imprimivel h1")).toHaveText(s.titulo);
    await expect(page.locator(".imprimivel .folha__meta").first()).toContainText("v1");
    await expect(page.locator(".imprimivel .cr-folha__cena h2").first()).toContainText("1. EXT. FAZENDA – AMANHECER");
    await expect(page.locator(".cr-folha__deixas li[data-cor='lettering']").first()).toBeVisible();

    // a auditoria tem o que saiu, de qual versão (com o sha256 do banco)
    await expect
      .poll(async () => (await envios(s.id)).map((e) => `${e.metadata.destino}/${e.metadata.formato}/v${e.metadata.n}/${e.metadata.pessoa}`))
      .toEqual(["tpeasy/txt/v1/demo-ant", "tpeasy/backup/v1/demo-ant", "edicao/pdf/v1/null"]);
    expect((await envios(s.id)).every((e) => e.metadata.sha256 === v1.sha256)).toBe(true);

    // capturas: o menu e a folha do TPeasy
    await fotos(page, context, baseURL!, "criacao-enviar-menu", info.project.name, url, async () => {
      await page.getByRole("button", { name: "Enviar" }).click();
      await expect(menu).toBeVisible();
    });
    await fotos(page, context, baseURL!, "criacao-enviar-tpeasy", info.project.name, url, async () => {
      await page.getByRole("button", { name: "Enviar" }).click();
      await menu.getByRole("menuitem", { name: /TPeasy/ }).click();
      await folha.getByRole("button", { name: "Usar a v1" }).click();
      await expect(folha.locator(".cr-tp__tela")).toBeVisible();
    });
  });

  test("AEON: escondido com o gate fechado; aberto, aparece sozinho e o arquivo confere com o contrato", async ({ page, context, baseURL }, info) => {
    const s = await semear(info.project.name);
    await entrar(context, baseURL!);
    const url = `/app/criacao/roteiros/${s.id}`;
    await page.goto(url);
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByRole("menuitem", { name: /AEON/ })).toHaveCount(0);

    await aeon(true);
    try {
      await page.goto(url);
      await page.getByRole("button", { name: "Enviar" }).click();
      await page.getByRole("menuitem", { name: /AEON/ }).click();
      const folha = page.getByRole("dialog", { name: "AEON" });
      // se o rascunho mudou depois da última versão (o título do teste anterior), salva a próxima
      const salvar = folha.getByRole("button", { name: /^Salvar v\d+ e continuar$/ });
      await expect(folha.locator(".cr-enviar__versao").or(salvar)).toBeVisible();
      if (await salvar.isVisible()) await salvar.click();
      await expect(folha.locator(".cr-enviar__versao")).toBeVisible();
      const n = Number((await folha.locator(".cr-enviar__versao .selo").innerText()).replace(/\D/g, ""));
      const v = await versaoDaApi(page, s.id, n);
      const arq = await baixado(page, () => folha.getByRole("button", { name: "Baixar o arquivo" }).click());
      expect(arq.nome).toBe(arquivoParaEdicao({ titulo: v.titulo, n }));
      const j = JSON.parse(arq.texto);
      expect(conferirEsquema(esquemaPublicado("maestro.roteiro.v1"), j)).toEqual([]);
      expect(j.origem).toMatchObject({ app: "maestro", roteiro_id: s.id, versao: n, sha256: v.sha256 });
      expect(j.cenas.length).toBe(v.conteudo.cenas.length);
      await expect.poll(async () => (await envios(s.id)).some((e) => e.metadata.destino === "aeon" && e.metadata.n === n)).toBe(true);
    } finally {
      await aeon(false);
    }
    await page.goto(url);
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByRole("menuitem", { name: /AEON/ })).toHaveCount(0);
  });

  test("a ficha do card mostra o roteiro ligado (versão, duração, estado) e abre o editor", async ({ page, context, baseURL }, info) => {
    const s = await semear(info.project.name);
    await entrar(context, baseURL!);
    const url = `/app/quadro?card=${s.card}`;
    await page.goto(url);
    const ficha = page.getByRole("dialog", { name: `Card: ${s.tema}` });
    const criacao = ficha.getByRole("region", { name: "Criação" });
    await expect(criacao).not.toHaveAttribute("aria-busy", "true");
    const link = criacao.getByRole("link", { name: new RegExp(s.titulo.replace(/[()]/g, "\\$&")) });
    await expect(link).toContainText(/v\d · Rascunho/);
    await expect(link).toContainText(/\d+:\d\d/);
    await expect(criacao.getByRole("link", { name: "Novo roteiro" })).toHaveAttribute("href", `/app/criacao?novo=1&card=${s.card}`);
    await fotos(page, context, baseURL!, "criacao-card", info.project.name, url, async () => {
      await expect(criacao).not.toHaveAttribute("aria-busy", "true");
      await criacao.scrollIntoViewIfNeeded();
    });
    await link.click();
    await page.waitForURL(new RegExp(`/app/criacao/roteiros/${s.id}`));
  });

  test("quem só lê não tem nada para enviar e vê o bloco do card sem o Novo", async ({ page, context, baseURL }, info) => {
    const s = await semear(info.project.name);
    await entrar(context, baseURL!, sessao().leitura);
    await page.goto(`/app/criacao/roteiros/${s.id}`);
    await expect(page.getByRole("button", { name: "Versões" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar" })).toHaveCount(0);
    await page.goto(`/app/quadro?card=${s.card}`);
    const criacao = page.getByRole("dialog", { name: `Card: ${s.tema}` }).getByRole("region", { name: "Criação" });
    await expect(criacao).not.toHaveAttribute("aria-busy", "true");
    await expect(criacao.getByRole("link")).toHaveCount(1);
    // a rota recusa mesmo se alguém chamar direto
    const r = await page.request.post(`/api/criacao/roteiros/${s.id}`, {
      data: { op: "enviado", n: 1, destino: "tpeasy", formato: "txt" },
      headers: { origin: baseURL! },
    });
    expect(r.status()).toBe(403);
  });
});

test.describe("Enviar no iPhone", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "iphone", "iphone"));

  test("o Enviar no topo abre a folha; TPeasy com a versão salva e os botões ao alcance; a ficha do card", async ({ page, context, baseURL }, info) => {
    const s = await semear(info.project.name);
    await entrar(context, baseURL!);
    const url = `/app/criacao/roteiros/${s.id}`;
    await page.goto(url);
    await page.getByRole("button", { name: "Enviar" }).click();
    const menu = page.getByRole("dialog", { name: "Enviar" });
    await expect(menu.getByRole("menuitem")).toHaveText([/TPeasy/, /PDF para a edição/, /^PDF/, /Cliente/, /Salvar versão/]);
    await menu.getByRole("menuitem", { name: /TPeasy/ }).click();
    const folha = page.getByRole("dialog", { name: "TPeasy" });
    await folha.getByRole("button", { name: /^Salvar v\d+ e continuar$/ }).click();
    await expect(folha.locator(".cr-enviar__versao")).toBeVisible();
    for (const nome of ["Copiar", ".txt", "Backup do TPeasy"]) {
      const b = folha.getByRole("button", { name: nome });
      await b.scrollIntoViewIfNeeded();
      await expect(b).toBeInViewport();
    }
    const larguras = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(larguras[0]).toBeLessThanOrEqual(larguras[1]);

    await fotos(page, context, baseURL!, "criacao-enviar-menu", info.project.name, url, async () => {
      await page.getByRole("button", { name: "Enviar" }).click();
      await expect(menu).toBeVisible();
    });
    await fotos(page, context, baseURL!, "criacao-enviar-tpeasy", info.project.name, url, async () => {
      await page.getByRole("button", { name: "Enviar" }).click();
      await menu.getByRole("menuitem", { name: /TPeasy/ }).click();
      await expect(folha.locator(".cr-tp__tela")).toBeVisible();
    });
    const card = `/app/quadro?card=${s.card}`;
    await fotos(page, context, baseURL!, "criacao-card", info.project.name, card, async () => {
      const criacao = page.getByRole("dialog", { name: `Card: ${s.tema}` }).getByRole("region", { name: "Criação" });
      await expect(criacao).not.toHaveAttribute("aria-busy", "true");
      await criacao.scrollIntoViewIfNeeded();
    });
  });
});
