/**
 * Criação · Roteiro (fase F2): o caminho inteiro no computador (Novo com modelo → escrever com o teclado → trocar de
 * vista → gravação sozinha → recarregar e estar tudo lá; versão salva e comparada; folha A4), a junção quando outra
 * pessoa grava ao mesmo tempo, o documento antigo aberto no editor novo, quem só lê, e o iPhone (uma cena por vez, o
 * "+", segurar para arrastar, a prévia do Teleprompter). Organização própria com a demonstração (e2e/preparar.ts).
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../playwright.config";

const ARQUIVO = "test-results/e2e-sessao-criacao.json";
const sessao = () => JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string; leitura: string; org: string };

async function noBanco<T>(fn: (sql: postgres.Sql, org: string) => Promise<T>): Promise<T> {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql, sessao().org);
  } finally {
    await sql.end();
  }
}
const roteiroDemo = () =>
  noBanco(async (sql, org) => (await sql`select id from maestro.roteiros where org_id = ${org} and demo order by created_at limit 1`)[0].id as string);

async function entrar(page: Page, baseURL: string, token = sessao().token) {
  await page.context().addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
}

/** Espera a gravação sozinha terminar ("Salvo"). */
const salvo = (page: Page) => expect(page.locator(".cr-gravacao")).toHaveText("Salvo", { timeout: 10_000 });

test.describe("Criação no computador", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "computador", "computador"));

  test("novo pelo modelo → escrever com o teclado → vistas → grava sozinho → recarregar", async ({ page, baseURL }) => {
    await entrar(page, baseURL!);
    await page.goto("/app/criacao");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Criação");
    // a navegação tem a Criação no grupo Produção
    await page.getByRole("button", { name: "Novo roteiro" }).click();
    const folha = page.getByRole("dialog", { name: "Novo roteiro" });
    await expect(folha.getByRole("radio")).toHaveCount(6 + 2);
    await folha.getByRole("radio", { name: /Em branco/ }).click();
    await folha.getByLabel("Título").fill("Filme da padaria");
    await folha.getByRole("button", { name: "Criar" }).click();
    await page.waitForURL(/\/app\/criacao\/roteiros\/[0-9a-f-]{36}\?vista=literario/);
    const id = page.url().match(/roteiros\/([0-9a-f-]{36})/)![1];

    // a cena do modelo em branco: um bloco de ação com a dica cinza (nunca texto)
    await page.getByLabel("Título da cena 1").fill("Abertura");
    const acao = page.getByPlaceholder("Comece por aqui");
    await acao.click();
    await page.keyboard.type("Pão saindo do forno.");
    // Enter cria o bloco seguinte (ação), ⌘1 vira fala
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+1");
    await expect(page.locator(".cr-bloco:focus-within")).toHaveAttribute("data-tipo", "fala");
    await page.keyboard.type("Bom dia, cidade. [pausa]");
    // Enter de novo e "/" no bloco vazio abre o menu de tipos
    await page.keyboard.press("Enter");
    await page.keyboard.press("/");
    const menu = page.getByRole("listbox", { name: "Tipo do bloco" });
    await expect(menu).toBeVisible();
    await menu.getByRole("option", { name: /Lettering/ }).click();
    await expect(page.locator(".cr-bloco:focus-within")).toHaveAttribute("data-tipo", "lettering");
    await page.keyboard.type("Padaria Aurora");
    // Tab percorre os tipos (lettering → áudio) e ⇧Tab volta
    await page.keyboard.press("Tab");
    await expect(page.locator(".cr-bloco:focus-within")).toHaveAttribute("data-tipo", "audio");
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator(".cr-bloco:focus-within")).toHaveAttribute("data-tipo", "lettering");
    await salvo(page);

    // as vistas saem do mesmo documento
    await page.getByRole("radio", { name: "Técnico" }).click();
    await expect(page.getByRole("table", { name: "Roteiro técnico" })).toBeVisible();
    await expect(page.locator('[role="cell"][data-coluna="lettering"] textarea')).toHaveValue("Padaria Aurora");
    await expect(page.locator('[role="cell"][data-coluna="audio"] textarea')).toHaveValue("Bom dia, cidade. [pausa]");
    await page.getByRole("radio", { name: "Teleprompter" }).click();
    const tp = page.getByRole("article", { name: "Prévia do teleprompter" });
    await expect(tp).toContainText("Bom dia, cidade.");
    await expect(tp).not.toContainText("Padaria Aurora");
    await expect(tp.locator(".cr-tp__deixa")).toHaveText("[pausa]");
    await page.getByRole("radio", { name: "Edição" }).click();
    await expect(page.getByRole("list", { name: "Deixas para a edição" })).toContainText("Padaria Aurora");

    // no Técnico também se escreve, e o título grava junto
    await page.getByRole("radio", { name: "Técnico" }).click();
    const imagem = page.locator('[role="cell"][data-coluna="imagem"] textarea').first();
    await imagem.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Vapor na vitrine.");
    await page.getByLabel("Título do roteiro").fill("Filme da padaria · 30s");
    await salvo(page);

    await page.reload();
    await expect(page.getByLabel("Título do roteiro")).toHaveValue("Filme da padaria · 30s");
    await expect(page.getByRole("radio", { name: "Técnico" })).toHaveAttribute("aria-checked", "true");
    await expect(page.locator('[role="cell"][data-coluna="imagem"] textarea').first()).toHaveValue("Pão saindo do forno. Vapor na vitrine.");
    const banco = await noBanco(async (sql) => (await sql`select titulo, rev, conteudo from maestro.roteiros where id = ${id}`)[0]);
    expect(banco.titulo).toBe("Filme da padaria · 30s");
    expect(JSON.stringify(banco.conteudo)).toContain("Bom dia, cidade.");

    // versão: salvar, mudar e comparar; a folha A4
    await page.getByRole("button", { name: "Salvar versão" }).click();
    const versoes = page.getByRole("dialog", { name: "Versões" });
    await versoes.getByLabel("Nota da versão").fill("Para a reunião");
    await versoes.getByRole("button", { name: "Salvar versão" }).click();
    await expect(versoes.getByRole("status")).toHaveText("v1 salva.");
    await expect(page.locator(".cr-cabeca .selo")).toContainText("v1");
    await page.keyboard.press("Escape");
    await page.locator('[role="cell"][data-coluna="lettering"] textarea').fill("Padaria Aurora · desde 1990");
    await salvo(page);
    await page.getByRole("button", { name: "Salvar versão" }).click();
    await versoes.getByRole("button", { name: "Comparar" }).click();
    await expect(versoes.locator(".cr-dif")).toContainText("1 mudou");
    await expect(versoes.locator(".cr-dif")).toContainText("Padaria Aurora · desde 1990");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Imprimir ou PDF" }).first().click();
    await page.waitForURL(/\/imprimir\?vista=tecnico/);
    await expect(page.locator(".imprimivel h1")).toHaveText("Filme da padaria · 30s");
    await expect(page.locator(".imprimivel")).toContainText("Padaria Aurora · desde 1990");
    // a lista mostra o novo
    await page.goto("/app/criacao");
    await expect(page.locator(".cr-cartao", { hasText: "Filme da padaria · 30s" })).toBeVisible();
  });

  test("outra pessoa grava ao mesmo tempo em outro bloco: as duas mudanças ficam", async ({ page, baseURL }) => {
    await entrar(page, baseURL!);
    const id = await roteiroDemo();
    await page.goto(`/app/criacao/roteiros/${id}?vista=literario`);
    const titulo = page.getByLabel("Título da cena 2");
    await expect(titulo).toHaveValue("A família");
    // a outra pessoa muda a cena 1 pela mesma rota (com o rev que tinha)
    const atual = (await (await page.request.get(`/api/criacao/roteiros/${id}`)).json()) as {
      roteiro: { rev: number; conteudo: { cenas: { titulo: string }[] } };
    };
    const deles = structuredClone(atual.roteiro.conteudo);
    deles.cenas[0].titulo = "Abertura no cafezal";
    const r = await page.request.post(`/api/criacao/roteiros/${id}`, {
      data: { op: "salvar", rev: atual.roteiro.rev, conteudo: deles },
      headers: { Origin: baseURL! },
    });
    expect(r.ok()).toBe(true);
    // aqui, sem saber, mudamos a cena 2: a gravação volta 409, junta por id e grava de novo
    await titulo.fill("A família Serra");
    await salvo(page);
    await expect(page.getByLabel("Título da cena 1")).toHaveValue("Abertura no cafezal");
    const cenas = await noBanco(
      async (sql) => (await sql`select conteudo -> 'cenas' as c from maestro.roteiros where id = ${id}`)[0].c as { titulo: string }[],
    );
    expect(cenas.map((c) => c.titulo).slice(0, 2)).toEqual(["Abertura no cafezal", "A família Serra"]);
  });

  test("o roteiro antigo do projeto abre no editor novo (e continua lá)", async ({ page, baseURL }) => {
    await entrar(page, baseURL!);
    const doc = await noBanco(
      async (sql, org) => (await sql`select id, projeto_id from maestro.documentos where org_id = ${org} and tipo = 'roteiro' limit 1`)[0],
    );
    await page.goto(`/app/projetos/${doc.projeto_id}`);
    await expect(
      page
        .getByRole("region", { name: "Roteiros" })
        .or(page.locator("section", { hasText: "Roteiros" }))
        .first(),
    ).toContainText("Institucional Café Serra Alta");
    await page.goto(`/app/projetos/${doc.projeto_id}/documentos/${doc.id}`);
    await page.getByRole("button", { name: "Abrir no editor novo" }).click();
    await page.waitForURL(/\/app\/criacao\/roteiros\/[0-9a-f-]{36}/);
    await expect(page.getByLabel("Título do roteiro")).toHaveValue("Roteiro do filme de 60s");
    await expect(page.locator(".cr-bloco textarea").first()).not.toHaveValue("");
    const ainda = await noBanco(async (sql) => (await sql`select count(*)::int as n from maestro.documentos where id = ${doc.id}`)[0].n);
    expect(ainda).toBe(1);
  });

  test("quem só lê vê tudo e não muda nada", async ({ page, baseURL }) => {
    await entrar(page, baseURL!, sessao().leitura);
    await page.goto("/app/criacao");
    await expect(page.getByRole("button", { name: "Novo roteiro" })).toHaveCount(0);
    await page.locator(".cr-cartao__link").first().click();
    await expect(page.locator(".cr-gravacao")).toHaveText("Só leitura");
    await expect(page.locator(".cr-bloco textarea").first()).toHaveAttribute("readonly", "");
    await expect(page.getByRole("button", { name: "Versões" })).toBeVisible();
  });

  test("Fluxos ainda não existe: estado honesto", async ({ page, baseURL }) => {
    await entrar(page, baseURL!);
    await page.goto("/app/criacao?aba=fluxos");
    await expect(page.getByRole("region", { name: "Fluxos chegam em breve." })).toBeVisible();
  });
});

test.describe("Criação no iPhone", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "iphone", "iphone"));

  test("uma cena por vez, o + adiciona, segurar arrasta, a prévia lê no preto", async ({ page, baseURL }) => {
    await entrar(page, baseURL!);
    // a Criação mora em Mais (a barra de baixo não muda)
    await page.goto("/app/mais");
    await page.getByRole("link", { name: "Criação" }).click();
    await page.waitForURL(/\/app\/criacao$/);
    await page.locator(".cr-cartao__link", { hasText: "Institucional Café Serra Alta" }).click();
    await page.waitForURL(/\/app\/criacao\/roteiros\//);
    const pager = page.getByRole("navigation", { name: "Cenas" });
    await expect(pager).toContainText("Cena 1 de 4");
    await expect(page.getByLabel("Título da cena 2")).toBeHidden();
    await pager.getByRole("button", { name: "Próxima cena" }).click();
    await expect(pager).toContainText("Cena 2 de 4");
    await expect(page.getByLabel("Título da cena 2")).toBeVisible();

    // o "+" abre os tipos em ícones grandes
    await page.getByRole("button", { name: "Adicionar bloco" }).click();
    const mais = page.getByRole("dialog", { name: "Adicionar" });
    await mais.getByRole("button", { name: "Observação" }).click();
    await expect(page.locator(".cr-bloco:focus-within")).toHaveAttribute("data-tipo", "observacao");
    await page.keyboard.type("Levar rebatedor");
    await salvo(page);

    // segurar a alça do último bloco e levar para o topo da cena
    const cena = page.locator(".cr-cena[data-atual]");
    const ordem = () => cena.locator(".cr-bloco").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.tipo));
    expect((await ordem()).at(-1)).toBe("observacao");
    const alca = cena.locator(".cr-alca").last();
    // longe do "+" flutuante, no meio da tela
    await alca.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const a = (await alca.boundingBox())!;
    const topo = (await cena.locator(".cr-alca").first().boundingBox())!;
    await page.evaluate(
      async ({ a, topo }) => {
        const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
        const x = a.x + a.width / 2;
        const y0 = a.y + a.height / 2;
        const alvo = document.elementFromPoint(x, y0)!;
        const ev = (t: string, y: number) =>
          alvo.dispatchEvent(
            new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y }),
          );
        ev("pointerdown", y0);
        await espera(340);
        const y1 = topo.y - 10;
        for (let i = 1; i <= 12; i++) {
          ev("pointermove", y0 + ((y1 - y0) * i) / 12);
          await espera(16);
        }
        ev("pointerup", y1);
      },
      { a, topo },
    );
    await expect.poll(async () => (await ordem())[0]).toBe("observacao");
    await salvo(page);

    // a prévia do Teleprompter: só as falas, por pessoa, no preto
    await page.getByRole("radio", { name: "Teleprompter" }).click();
    const tp = page.getByRole("article", { name: "Prévia do teleprompter" });
    await expect(tp).toBeVisible();
    await page.getByRole("radio", { name: "Antônio" }).click();
    await expect(tp).toContainText("Meu avô dizia que café bom não tem pressa.");
    await expect(tp).not.toContainText("Cada lote");
    const fundo = await tp.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(fundo).toBe("rgb(0, 0, 0)");
    // nada passa da largura da tela
    const largura = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(largura).toBeLessThanOrEqual(0);
  });
});
