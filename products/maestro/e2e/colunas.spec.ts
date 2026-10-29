/**
 * Colunas do Quadro como no Trello (drizzle/0024, src/components/quadro/colunas.tsx), no computador e no iPhone:
 * renomear no lugar (clique duplo no cabeçalho; no celular, tocar na aba já escolhida), reordenar (arrastar o
 * cabeçalho; no celular, segurar a alça na folha), criar e recolorir na folha "Editar colunas", arquivar levando os
 * cards e restaurar; as 8 do método não arquivam (cadeado com o porquê, a rota recusa) e quem é da equipe não edita.
 * Organização própria (e2e/preparar.ts); cada teste começa das colunas de fábrica.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../playwright.config";

const ARQUIVO = "test-results/e2e-sessao-colunas.json";
const sessao = () => JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string; equipe: string; org: string };

/** Volta às 8 colunas de fábrica, tira os cards de antes (lápide: o histórico é só inclusão) e põe os do teste (o Quadro vazio mostra só o convite). */
async function zerar(cards: [string, string, string][] = [["co-base", "Card de base", "pauta"]]) {
  const { org } = sessao();
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    await sql`update maestro.cards set dados = dados || '{"apagadoEm": "2026-01-01T00:00:00Z"}'::jsonb where org_id = ${org} and dados ->> 'apagadoEm' is null`;
    await sql`delete from maestro.colunas where org_id = ${org} and papel is null`;
    await sql`update maestro.colunas c set nome = d.nome, cor = d.cor, ordem = d.ordem from maestro.colunas_padrao_lista() d where c.org_id = ${org} and c.id = d.id`;
    let i = 0;
    for (const [id, tema, coluna] of cards) {
      i++;
      const dados = { tema, coluna, ordem: i * 1000 };
      await sql`insert into maestro.cards (org_id, id, dados) values (${org}, ${id}, ${sql.json(dados)})
        on conflict (org_id, id) do update set dados = excluded.dados, versao = maestro.cards.versao + 1, versoes = '{}'::jsonb`;
    }
  } finally {
    await sql.end();
  }
}

async function noBanco<T>(fn: (sql: postgres.Sql, org: string) => Promise<T>): Promise<T> {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql, sessao().org);
  } finally {
    await sql.end();
  }
}
const ordemNoBanco = () =>
  noBanco(async (sql, org) =>
    (await sql`select id from maestro.colunas where org_id = ${org} and arquivada_em is null order by ordem`).map((r) => r.id as string),
  );
const colunaDoCard = (id: string) =>
  noBanco(async (sql, org) => ((await sql`select dados ->> 'coluna' as c from maestro.cards where org_id = ${org} and id = ${id}`)[0]?.c as string) ?? null);

async function abrirQuadro(page: Page, baseURL: string, token = sessao().token) {
  await page.context().addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
  await page.goto("/app/quadro");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Quadro");
  // hidratado: no celular a pílula foi medida; no computador o cabeçalho já arrasta
  await page.waitForFunction(() => !!document.querySelector(".q-abas[data-pilula]") || !!document.querySelector('.q-col__topo[draggable="true"]'));
}

async function abrirFolha(page: Page) {
  await page.getByRole("button", { name: "Editar colunas" }).click();
  const folha = page.getByRole("dialog", { name: "Editar colunas" });
  await expect(folha).toBeVisible();
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".m-folha")
        ?.getAnimations()
        .some((a) => a.playState === "running"),
  );
  return folha;
}

const nomesDasColunas = (page: Page, celular: boolean) =>
  celular
    ? page.locator(".q-abas > button").evaluateAll((els) => els.map((e) => (e.childNodes[1]?.textContent ?? "").trim()))
    : page.locator(".q-col__topo h2").allTextContents();

test.describe.configure({ mode: "serial" });

test.describe("Colunas do Quadro", () => {
  test("clique duplo no cabeçalho renomeia; Esc desiste; vazio não vale (computador)", async ({ page, baseURL }, info) => {
    test.skip(info.project.name !== "computador", "cabeçalho com mouse");
    await zerar([["co-c1", "Roteiro do reels", "pauta"]]);
    await abrirQuadro(page, baseURL!);
    const pauta = page.locator('.q-col[data-col="pauta"]');
    await pauta.locator("h2").dblclick();
    const campo = pauta.getByRole("textbox", { name: "Nome da coluna Pauta" });
    await expect(campo).toBeFocused();
    await campo.fill("Ideias soltas");
    await campo.press("Enter");
    await expect(pauta.locator("h2")).toHaveText("Ideias soltas");
    await expect(page.locator(".q-aviso")).toContainText("Agora é Ideias soltas");
    // Esc desiste
    await pauta.locator("h2").dblclick();
    await pauta.getByRole("textbox").fill("Outra coisa");
    await pauta.getByRole("textbox").press("Escape");
    await expect(pauta.locator("h2")).toHaveText("Ideias soltas");
    // vazio não salva: o campo fica marcado e continua aberto
    await pauta.locator("h2").dblclick();
    await pauta.getByRole("textbox").fill("   ");
    await pauta.getByRole("textbox").press("Enter");
    await expect(pauta.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    await pauta.getByRole("textbox").press("Escape");
    // a mudança ficou no banco e volta depois de recarregar; o card continua na mesma coluna
    await page.reload();
    await expect(pauta.locator("h2")).toHaveText("Ideias soltas");
    await expect(pauta.locator('[data-card="co-c1"]')).toBeVisible();
    expect(await colunaDoCard("co-c1")).toBe("pauta");
  });

  test("arrastar o cabeçalho reordena e Desfazer volta (computador)", async ({ page, baseURL }, info) => {
    test.skip(info.project.name !== "computador", "arrastar do HTML com mouse");
    await zerar();
    await abrirQuadro(page, baseURL!);
    await page.locator('.q-col[data-col="entregue"] .q-col__topo').dragTo(page.locator('.q-col[data-col="pauta"]'), { targetPosition: { x: 12, y: 60 } });
    await expect(page.locator(".q-quadro > .q-col").first()).toHaveAttribute("data-col", "entregue");
    await expect.poll(ordemNoBanco).toEqual(["entregue", "pauta", "afazer", "fazendo", "revisao", "aprovacao", "aprovado", "agendado"]);
    await page.locator(".q-aviso").getByRole("button", { name: "Desfazer" }).click();
    await expect(page.locator(".q-quadro > .q-col").first()).toHaveAttribute("data-col", "pauta");
    await expect.poll(ordemNoBanco).toEqual(["pauta", "afazer", "fazendo", "revisao", "aprovacao", "aprovado", "agendado", "entregue"]);
  });

  test("Editar colunas: cria, renomeia e recolore; aparece no Quadro na hora", async ({ page, baseURL }, info) => {
    const celular = info.project.name !== "computador";
    await zerar();
    await abrirQuadro(page, baseURL!);
    const folha = await abrirFolha(page);
    await folha.getByRole("button", { name: "Nova coluna" }).click();
    const nova = folha.getByRole("textbox", { name: "Nome da nova coluna" });
    await nova.fill("Captação");
    await nova.press("Enter");
    const linha = folha.locator("li[data-col^='x-']");
    await expect(linha).toHaveCount(1);
    await expect(folha.getByRole("textbox", { name: "Nome da coluna Captação" })).toHaveValue("Captação");
    // renomeia na folha
    const nome = folha.getByRole("textbox", { name: "Nome da coluna Captação" });
    await nome.fill("Captação externa");
    await nome.press("Enter");
    // recolore
    await folha.getByRole("button", { name: "Cor de Captação externa" }).click();
    await folha.getByRole("radio", { name: "Rosa" }).click();
    await expect(linha).toHaveAttribute("data-cor", "rosa");
    await folha.getByRole("button", { name: "Pronto" }).click();
    await expect(folha).toBeHidden();
    const nomes = await nomesDasColunas(page, celular);
    expect(nomes.at(-1)).toBe("Captação externa");
    await expect(page.locator(".q-col[data-col^='x-']")).toHaveAttribute("data-cor", "rosa");
    await expect
      .poll(() =>
        noBanco(async (sql, org) =>
          (await sql`select nome, cor from maestro.colunas where org_id = ${org} and papel is null`).map((r) => `${r.nome}:${r.cor}`),
        ),
      )
      .toEqual(["Captação externa:rosa"]);
  });

  test("as colunas do método não arquivam: cadeado com o porquê e a rota recusa", async ({ page, baseURL }) => {
    await zerar();
    await abrirQuadro(page, baseURL!);
    const folha = await abrirFolha(page);
    await expect(folha.locator("li[data-col]")).toHaveCount(8);
    await expect(folha.getByRole("button", { name: /^Arquivar / })).toHaveCount(0);
    const aprovado = folha.locator('li[data-col="aprovado"] .qc-selo');
    await expect(aprovado).toHaveAttribute("title", "Usada pela aprovação do cliente");
    const r = await page.request.post("/api/quadro", { data: { op: "coluna_arquivar", id: "aprovado", destino: "pauta" }, headers: { origin: baseURL! } });
    expect(r.status()).toBe(409);
    expect((await r.json()).erro).toBe("coluna_sistema");
  });

  test("arquivar pergunta para onde vão os cards, leva e dá para restaurar", async ({ page, baseURL }, info) => {
    const celular = info.project.name !== "computador";
    await zerar();
    const id = await noBanco(async (sql, org) => {
      await sql`insert into maestro.colunas (org_id, id, papel, nome, cor, ordem) values (${org}, 'x-e2ecaptacao1', null, 'Captação', 'ceu', 9)`;
      return "x-e2ecaptacao1";
    });
    await noBanco(async (sql, org) => {
      for (const [k, tema] of [
        ["co-a1", "Diária no estúdio"],
        ["co-a2", "Externa no parque"],
      ])
        await sql`insert into maestro.cards (org_id, id, dados) values (${org}, ${k}, ${sql.json({ tema, coluna: id })})
          on conflict (org_id, id) do update set dados = excluded.dados, versao = maestro.cards.versao + 1, versoes = '{}'::jsonb`;
    });
    await abrirQuadro(page, baseURL!);
    const folha = await abrirFolha(page);
    await folha.getByRole("button", { name: "Arquivar Captação" }).click();
    const painel = folha.getByRole("group", { name: "Arquivar Captação" });
    await expect(painel).toContainText("Levar os 2 cards para");
    await painel.getByRole("combobox").selectOption("fazendo");
    await painel.getByRole("button", { name: "Arquivar" }).click();
    await expect(page.locator(".q-aviso")).toContainText("Captação arquivada. 2 cards foram para Fazendo.");
    await expect(folha.locator(`li[data-col="${id}"]`)).toHaveCount(0);
    await expect.poll(() => colunaDoCard("co-a1")).toBe("fazendo");
    expect(await colunaDoCard("co-a2")).toBe("fazendo");
    // os cards já estão em Fazendo na tela
    await folha.getByRole("button", { name: "Pronto" }).click();
    await expect(page.locator(`.q-col[data-col="${id}"]`)).toHaveCount(0);
    if (celular) await page.locator('.q-abas button[data-col="fazendo"]').click();
    await expect(page.locator('.q-col[data-col="fazendo"] [data-card="co-a1"]')).toBeVisible();
    // restaurar
    const folha2 = await abrirFolha(page);
    await folha2.getByRole("button", { name: "Restaurar Captação" }).click();
    await expect(folha2.locator(`li[data-col="${id}"]`)).toHaveCount(1);
    await expect.poll(ordemNoBanco).toContain(id);
  });

  test("celular: tocar na aba já escolhida renomeia", async ({ page, baseURL }, info) => {
    test.skip(info.project.name === "computador", "abas só no celular");
    await zerar([["co-m1", "Teaser", "afazer"]]);
    await abrirQuadro(page, baseURL!);
    const aba = page.locator('.q-abas button[data-col="afazer"]');
    await aba.click();
    await expect(aba).toHaveAttribute("aria-pressed", "true");
    await aba.click();
    const campo = page.locator(".q-abas").getByRole("textbox", { name: "Nome da coluna A fazer" });
    await expect(campo).toBeFocused();
    await campo.fill("Briefado");
    await campo.press("Enter");
    await expect(page.locator('.q-abas button[data-col="afazer"]')).toContainText("Briefado");
    await expect(page.locator('.q-abas button[data-col="afazer"]')).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => noBanco(async (sql, org) => (await sql`select nome from maestro.colunas where org_id = ${org} and id = 'afazer'`)[0].nome))
      .toBe("Briefado");
    // o deslizar entre colunas continua: o card segue na coluna renomeada
    await expect(page.locator('.q-col.on [data-card="co-m1"]')).toBeVisible();
  });

  test("celular: segurar a alça (280 ms) e arrastar reordena na folha", async ({ page, baseURL }, info) => {
    test.skip(info.project.name === "computador", "toque");
    await zerar();
    await abrirQuadro(page, baseURL!);
    const folha = await abrirFolha(page);
    const de = (await folha.getByRole("button", { name: "Mover Entregue" }).boundingBox())!;
    const ate = (await folha.locator('li[data-col="afazer"]').boundingBox())!;
    await page.evaluate(
      async ({ x, y, y2 }) => {
        const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
        const alvo = document.elementFromPoint(x, y)!.closest("button")!;
        const ev = (tipo: string, py: number) =>
          alvo.dispatchEvent(
            new PointerEvent(tipo, {
              bubbles: true,
              cancelable: true,
              pointerId: 51,
              pointerType: "touch",
              isPrimary: true,
              clientX: x,
              clientY: py,
              buttons: 1,
            }),
          );
        ev("pointerdown", y);
        await espera(360);
        for (let i = 1; i <= 14; i++) {
          ev("pointermove", y + ((y2 - y) * i) / 14);
          await espera(16);
        }
        ev("pointerup", y2);
      },
      { x: de.x + de.width / 2, y: de.y + de.height / 2, y2: ate.y + 4 },
    );
    await expect.poll(ordemNoBanco).toEqual(["pauta", "entregue", "afazer", "fazendo", "revisao", "aprovacao", "aprovado", "agendado"]);
    await expect(folha.locator("li[data-col]").nth(1)).toHaveAttribute("data-col", "entregue");
    // toque rápido (sem segurar) não ergue nada
    const de2 = (await folha.getByRole("button", { name: "Mover Agendado" }).boundingBox())!;
    await page.evaluate(
      async ({ x, y }) => {
        const alvo = document.elementFromPoint(x, y)!.closest("button")!;
        const ev = (tipo: string, py: number) =>
          alvo.dispatchEvent(
            new PointerEvent(tipo, { bubbles: true, pointerId: 52, pointerType: "touch", isPrimary: true, clientX: x, clientY: py, buttons: 1 }),
          );
        ev("pointerdown", y);
        ev("pointermove", y - 120);
        ev("pointerup", y - 120);
      },
      { x: de2.x + de2.width / 2, y: de2.y + de2.height / 2 },
    );
    await page.waitForTimeout(400);
    expect((await ordemNoBanco()).at(-1)).toBe("agendado");
  });

  test("quem é da equipe usa as colunas, mas não edita", async ({ page, baseURL }, info) => {
    test.skip(info.project.name !== "computador", "uma vez basta");
    await zerar([["co-e1", "Peça da equipe", "pauta"]]);
    await abrirQuadro(page, baseURL!, sessao().equipe);
    await expect(page.getByRole("button", { name: "Editar colunas" })).toHaveCount(0);
    await page.locator('.q-col[data-col="pauta"] h2').dblclick();
    await expect(page.locator(".q-col__topo input")).toHaveCount(0);
    await expect(page.locator('.q-col__topo[draggable="true"]')).toHaveCount(0);
    const r = await page.request.post("/api/quadro", { data: { op: "coluna_mudar", id: "pauta", nome: "Minha" }, headers: { origin: baseURL! } });
    expect(r.status()).toBe(403);
  });
});
