/**
 * Criação F8 · "Para o TPeasy" direto pela Absolute ZRO: no Enviar do roteiro, a versão salva vai para a caixa de entrada
 * do TPeasy (o HUB de mentira, tests/ponte-falsa.mts, que confere o corpo pelo contrato publicado); a folha mostra
 * "Enviado ao TPeasy · v1 · agora"; Reenviar não duplica; o TPeasy de verdade (products/tpeasy servido aqui, com as
 * funções de /api/zro trocadas pelo HUB de mentira) recebe ao abrir, marca "Do Maestro · v1" e conta que recebeu, e o
 * Maestro passa a mostrar "Recebido". Sem o TPeasy no plano, a folha diz por quê e fica como antes.
 * Organização própria (e2e/preparar.ts, "Café Filmes E2E"). Com SHOTS_DIR guarda as capturas (f8-*: claro e escuro,
 * computador e iPhone); com E2E_VIDEO=1, o passeio do computador numa página só (Maestro → TPeasy → Maestro).
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../playwright.config";
import { PORTA_PONTE } from "./preparar";

const ARQUIVO = "test-results/e2e-sessao-tpeasy.json";
const SHOTS = process.env.SHOTS_DIR;
const PONTE = `http://127.0.0.1:${PORTA_PONTE}`;
const PORTA_TP = Number(process.env.E2E_TP_PORT || 3233);
const TP = `http://localhost:${PORTA_TP}`;
const TP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../tpeasy");
const sessao = () => JSON.parse(readFileSync(ARQUIVO, "utf8")) as { token: string; org: string; sub: string };

test.use({ serviceWorkers: "block" });

// ───────────── o TPeasy de verdade, servido como a Vercel serve (estático) ─────────────
const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};
let servidorTp: http.Server | null = null;
test.beforeAll(async () => {
  servidorTp = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", TP);
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const arq = path.resolve(TP_DIR, `.${rel}`);
    if (!arq.startsWith(TP_DIR) || arq.includes(`${path.sep}api${path.sep}`)) {
      res.writeHead(404);
      return res.end();
    }
    try {
      const corpo = await readFile(arq);
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(arq)] ?? "application/octet-stream" });
      res.end(corpo);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((ok) => servidorTp!.listen(PORTA_TP, "127.0.0.1", ok));
});
test.afterAll(async () => {
  await new Promise<void>((ok) => (servidorTp ? servidorTp.close(() => ok()) : ok()));
});

/**
 * As funções do TPeasy (/api/zro/eu e /api/zro/entregas) fazem só o repasse ao HUB com o token da sessão
 * (products/tpeasy/api/zro/entregas.mjs, testado em tests/zro.test.mjs); aqui o navegador fala direto com o HUB de
 * mentira, com o mesmo token da pessoa.
 */
async function tpeasyLogado(page: Page) {
  const { sub } = sessao();
  await page.route("**/api/zro/eu", (r) =>
    r.fulfill({
      json: {
        entrou: true,
        sub,
        nome: "Rita Roteiro",
        email: "rita@cafe.exemplo",
        foto: null,
        conta: "https://absolutezro.com/perfil",
        organizacao: { nome: "Café Filmes" },
        produtos: ["maestro", "tpeasy"],
        acesso: true,
      },
    }),
  );
  await page.route("**/api/zro/set**", (r) => r.fulfill({ status: 401, json: { reconectar: true } }));
  await page.route("**/api/zro/entregas**", async (r) => {
    const metodo = r.request().method();
    const resp = await fetch(`${PONTE}/api/v1/apps/entregas/recebidas${metodo === "GET" ? "?destino=tpeasy" : ""}`, {
      method: metodo,
      headers: { Authorization: `Bearer at-${sub}`, "Content-Type": "application/json" },
      body: metodo === "POST" ? r.request().postData() : undefined,
    });
    await r.fulfill({ status: resp.status, json: await resp.json() });
  });
}

async function noBanco<T>(fn: (sql: postgres.Sql, org: string) => Promise<T>): Promise<T> {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql, sessao().org);
  } finally {
    await sql.end();
  }
}

/** Um roteiro (cópia do da demonstração, sem versão), só deste projeto do Playwright. */
async function semear(projeto: string): Promise<{ id: string; titulo: string }> {
  const titulo = `Café Aurora · manifesto ${projeto === "iphone" ? "(celular)" : ""}`.trim();
  return noBanco(async (sql, org) => {
    const [ja] = await sql`select id from maestro.roteiros where org_id = ${org} and titulo = ${titulo}`;
    if (ja) return { id: ja.id as string, titulo };
    const [r] = await sql`
      insert into maestro.roteiros (org_id, titulo, modelo, formato, conteudo, duracao_seg)
      select org_id, ${titulo}, modelo, formato, conteudo, duracao_seg from maestro.roteiros where org_id = ${org} and demo order by created_at limit 1
      returning id`;
    return { id: r.id as string, titulo };
  });
}

async function entrar(context: BrowserContext, baseURL: string, tema = "light") {
  await context.addCookies([
    { name: "mae_sessao", value: sessao().token, url: baseURL },
    { name: "zro_theme", value: tema, url: baseURL },
  ]);
}

const caixa = async () =>
  (await (await fetch(`${PONTE}/__entregas`)).json()) as {
    lista: { roteiro: string; versao: number; vezes: number; item: string; recebida_em: string | null }[];
  };

/** O TPeasy no plano da sessão (como o login traria), ou não. */
async function tpeasyNoPlano(sim: boolean) {
  await noBanco(
    (sql, org) => sql`update maestro.sessions set produtos = ${sim ? ["maestro", "tpeasy"] : ["maestro"]} where org_id = ${org} and zro_sub = ${sessao().sub}`,
  );
}

async function abrirFolha(page: Page, celular: boolean) {
  if (celular) {
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Enviar" })
      .getByRole("menuitem", { name: /Para o TPeasy/ })
      .click();
  } else {
    await page.getByRole("button", { name: "Enviar" }).click();
    await page
      .getByRole("menu", { name: "Enviar" })
      .getByRole("menuitem", { name: /Para o TPeasy/ })
      .click();
  }
  const folha = page.getByRole("dialog", { name: "Para o TPeasy" });
  const salvar = folha.getByRole("button", { name: /^Salvar v\d+ e continuar$/ });
  await expect(folha.locator(".cr-enviar__versao").or(salvar)).toBeVisible();
  if (await salvar.isVisible()) await salvar.click();
  await expect(folha.locator(".cr-enviar__versao")).toBeVisible();
  return folha;
}

const sufixo = (projeto: string) => (projeto === "iphone" ? "celular" : "computador");

async function fotosTpeasy(page: Page, projeto: string) {
  if (!SHOTS) return;
  for (const tema of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: tema });
    // outro endereço (não só o #): o app recarrega de verdade, com a biblioteca do aparelho
    await page.goto(`${TP}/app/?tema=${tema}#roteiros`);
    await expect(page.locator(".item-origem").first()).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/f8-tpeasy-biblioteca-${tema === "light" ? "claro" : "escuro"}-${sufixo(projeto)}.png` });
    await page
      .locator(".item", { has: page.locator(".item-origem") })
      .first()
      .locator('[data-act="edit"]')
      .click();
    await expect(page.locator("#editorOrigem")).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/f8-tpeasy-editor-${tema === "light" ? "claro" : "escuro"}-${sufixo(projeto)}.png` });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

async function fotosMaestro(page: Page, context: BrowserContext, baseURL: string, url: string, projeto: string) {
  if (!SHOTS) return;
  for (const tema of ["light", "dark"]) {
    await context.addCookies([{ name: "zro_theme", value: tema, url: baseURL }]);
    await page.goto(url);
    const folha = await abrirFolha(page, projeto === "iphone");
    await folha.getByRole("radio", { name: "Antônio" }).click();
    await expect(folha.locator(".cr-tpd__estado")).toContainText("Enviado ao TPeasy");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/f8-maestro-enviado-${tema === "light" ? "claro" : "escuro"}-${sufixo(projeto)}.png` });
    await page.keyboard.press("Escape");
  }
  await context.addCookies([{ name: "zro_theme", value: "light", url: baseURL }]);
}

for (const projeto of ["computador", "iphone"] as const) {
  test(`Para o TPeasy (${projeto}): envia a versão, reenviar não duplica, chega no TPeasy "Do Maestro" e volta "Recebido"`, async ({
    page,
    context,
    baseURL,
  }, info) => {
    test.skip(info.project.name !== projeto, projeto);
    const celular = projeto === "iphone";
    const s = await semear(projeto);
    await entrar(context, baseURL!);
    await tpeasyLogado(page);
    const url = `/app/criacao/roteiros/${s.id}`;
    await page.goto(url);

    // o menu diz o que acontece; a folha: v1 salva, a pessoa, a ação principal e os outros jeitos recolhidos
    if (!celular) {
      await page.getByRole("button", { name: "Enviar" }).click();
      await expect(page.getByRole("menu", { name: "Enviar" }).getByRole("menuitem", { name: /Para o TPeasy/ })).toContainText("Direto no app");
      await page.keyboard.press("Escape");
    }
    const folha = await abrirFolha(page, celular);
    await folha.getByRole("radio", { name: "Antônio" }).click();
    const enviar = folha.getByRole("button", { name: "Enviar ao TPeasy" });
    await expect(enviar).toBeVisible();
    await expect(folha.getByRole("button", { name: "Copiar" })).toBeHidden();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/f8-maestro-folha-claro-${sufixo(projeto)}.png` });
    await enviar.click();
    const estado = folha.locator(".cr-tpd__estado");
    await expect(estado).toContainText("Enviado ao TPeasy · v1 · agora");
    await expect(estado).toHaveAttribute("data-recebido", "nao");
    await expect(folha.getByRole("list", { name: "Últimos envios" })).toContainText("TPeasy · no app · v1");

    // reenviar a mesma versão: a mesma entrega (nada duplica lá)
    await folha.getByRole("button", { name: "Reenviar" }).click();
    await expect(estado).toContainText("Enviado ao TPeasy · v1 · agora");
    await expect.poll(async () => (await caixa()).lista.filter((e) => e.roteiro === s.id).map((e) => [e.versao, e.vezes])).toEqual([[1, 2]]);
    const entrega = (await caixa()).lista.find((e) => e.roteiro === s.id)!;
    expect(entrega.item).toMatch(new RegExp(`^maestro-${s.id}-`));
    await page.keyboard.press("Escape");

    // o TPeasy abre e o roteiro está lá, marcado "Do Maestro · v1", com o texto do Teleprompter e o link de volta
    await page.goto(`${TP}/app/#roteiros`);
    await expect(page.locator("#toast")).toHaveText(/Roteiro do Maestro chegou|roteiros do Maestro/);
    const linha = page.locator(".item", { has: page.locator(".item-origem"), hasText: s.titulo });
    await expect(linha.locator(".item-origem")).toHaveText("Do Maestro · v1");
    await expect(linha.locator(".item-title")).toContainText(s.titulo);
    await expect(linha.locator(".item-title")).toContainText("Antônio");
    await expect.poll(async () => (await caixa()).lista.find((e) => e.roteiro === s.id)?.recebida_em ?? null).not.toBeNull();
    await linha.locator('[data-act="edit"]').click();
    await expect(page.locator("#editorOrigem")).toContainText("Do Maestro · v1");
    await expect(page.locator("#editorOrigem")).toHaveAttribute("href", new RegExp(`/app/criacao/roteiros/${s.id}$`));
    await expect(page.locator("#bodyInput")).toHaveValue(/^# /);
    // abrir de novo não duplica
    await page.goto(`${TP}/app/?de-novo=1#roteiros`);
    await expect(page.locator(".item", { hasText: s.titulo })).toHaveCount(1);

    // de volta ao Maestro: "Recebido"
    await page.goto(url);
    const folha2 = await abrirFolha(page, celular);
    await folha2.getByRole("radio", { name: "Antônio" }).click();
    await expect(folha2.locator(".cr-tpd__estado")).toContainText("Recebido");
    await expect(folha2.getByRole("button", { name: "Reenviar" })).toBeVisible();
    const larguras = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(larguras[0]).toBeLessThanOrEqual(larguras[1]);
    await page.keyboard.press("Escape");

    await fotosMaestro(page, context, baseURL!, url, projeto);
    await fotosTpeasy(page, projeto);
  });
}

test("sem o TPeasy no plano: a folha diz por quê, sem o envio direto, e os outros jeitos ficam à vista", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "computador", "computador");
  const s = await semear("computador");
  await entrar(context, baseURL!);
  await tpeasyNoPlano(false);
  try {
    await page.goto(`/app/criacao/roteiros/${s.id}`);
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByRole("menu", { name: "Enviar" }).getByRole("menuitem", { name: /Para o TPeasy/ })).toContainText("Só as falas");
    await page.keyboard.press("Escape");
    const folha = await abrirFolha(page, false);
    await expect(folha).toContainText("Enviar direto pede o TPeasy no plano.");
    await expect(folha.getByRole("button", { name: "Enviar ao TPeasy" })).toHaveCount(0);
    await expect(folha.getByRole("button", { name: "Copiar" })).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/f8-maestro-sem-tpeasy-claro-computador.png` });
    const r = await page.request.post(`/api/criacao/roteiros/${s.id}`, { data: { op: "tpeasy", n: 1 }, headers: { origin: baseURL! } });
    expect(r.status()).toBe(403);
  } finally {
    await tpeasyNoPlano(true);
  }
});
