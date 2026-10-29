/**
 * O Set da Absolute ZRO (ADR 0031 do HUB) na barra de cima do Maestro: a pílula discreta mostra quem está online, a
 * folha abre a conversa do projeto (a mesma do HUB: "Filme Safra", escrita pela Bia lá) e a resposta sai pelo repasse
 * /api/zro/set. Sem login com o escopo do Set (401), a pílula some. O <zro-set> vem do próprio repositório
 * (apps/hub-web/public/set) no lugar de absolutezro.com, e o repasse responde como a Absolute ZRO, sem rede. A conversa
 * de verdade entre o HUB e um app (o mesmo projeto pelo token do app) está em tests/integration/set.test.ts do HUB.
 * Com SHOTS_DIR, guarda as capturas da pílula e da conversa (claro, computador e iPhone).
 */
import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ARQUIVO_SESSAO = "test-results/e2e-sessao.json";
const SHOTS = process.env.SHOTS_DIR;

/** Com SHOTS_DIR, guarda a captura (tema claro; computador e iPhone). */
async function foto(page: Page, nome: string, projeto: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/${nome}-${projeto}.png` });
}
const SET = new URL("../../../apps/hub-web/public/set/", import.meta.url);
const CONVERSA = "6a0c1c1e-2a5b-4c1d-9e7f-1a2b3c4d5e6f";
const PROJETO = "7b1d2d2f-3b6c-4d2e-8f80-2b3c4d5e6f70";
const BIA = { id: "8c2e3e30-4c7d-4e3f-9091-3c4d5e6f7081", arroba: "bia.som", nome: "Bia", foto: null };

async function preparar(context: BrowserContext, baseURL: string, o: { semLogin?: boolean } = {}) {
  const { token } = JSON.parse(readFileSync(ARQUIVO_SESSAO, "utf8")) as { token: string };
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
  const enviados: string[] = [];
  await context.route("https://absolutezro.com/set/**", (r) =>
    r.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*", "content-type": "text/javascript; charset=utf-8" },
      body: readFileSync(new URL(new URL(r.request().url()).pathname.replace(/^\/set\//, ""), SET)),
    }),
  );
  const conversa = {
    id: CONVERSA,
    tipo: "projeto",
    pessoa: null,
    projeto: { id: PROJETO, titulo: "Filme Safra" },
    titulo: "Filme Safra",
    ultima: 41,
    ultimaEm: new Date().toISOString(),
    previa: "Diária confirmada para sexta.",
    previaMinha: false,
    naoLidas: 1,
    silenciada: false,
    podeEscrever: true,
  };
  const mensagens = [
    {
      id: "m1",
      seq: 41,
      autor: BIA,
      minha: false,
      texto: "Diária confirmada para sexta.",
      criadaEm: new Date().toISOString(),
      editadaEm: null,
      apagada: false,
    },
  ];
  await context.route("**/api/zro/set**", (r) => {
    if (o.semLogin) return r.fulfill({ status: 401, contentType: "application/json", body: '{"error":"reconectar_zro"}' });
    const u = new URL(r.request().url());
    const caminho = u.pathname.replace(/^\/api\/zro\/set/, "");
    const metodo = r.request().method();
    const json = (c: unknown, status = 200) => r.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(c) });
    if (caminho === "" || caminho === "/")
      return json({
        eu: { id: "eu", arroba: "pessoa", nome: "Pessoa", foto: null, preferencias: { invisivel: false, quemVe: "equipe_contatos", mostrarVisto: true } },
        pessoas: [{ ...BIA, equipe: true, contato: false, estado: "online", app: { id: "hub", nome: "Absolute ZRO" }, vistoEm: new Date().toISOString() }],
        naoLidas: mensagens.some((m) => m.minha) ? 0 : 1,
        pedidos: 0,
        porConversa: mensagens.some((m) => m.minha) ? {} : { [CONVERSA]: 1 },
        ultima: mensagens.at(-1)!.seq,
      });
    if (caminho === "/conversas") return json({ conversas: [conversa], projetos: [] });
    if (caminho === `/conversas/${CONVERSA}` && metodo === "GET") {
      const depois = Number(u.searchParams.get("depois") ?? -1);
      return json({ conversa, mensagens: depois >= 0 ? mensagens.filter((m) => m.seq > depois) : mensagens, mais: false });
    }
    if (caminho === `/conversas/${CONVERSA}` && metodo === "PATCH") return r.fulfill({ status: 204 });
    if (caminho === `/conversas/${CONVERSA}/mensagens` && metodo === "POST") {
      const texto = (JSON.parse(r.request().postData() ?? "{}") as { texto: string }).texto;
      enviados.push(texto);
      mensagens.push({
        id: `m${mensagens.length + 1}`,
        seq: 41 + mensagens.length,
        autor: { ...BIA, id: "eu", nome: "Pessoa" },
        minha: true,
        texto,
        criadaEm: new Date().toISOString(),
        editadaEm: null,
        apagada: false,
      });
      return json({ mensagem: { id: "x", seq: 42, criadaEm: new Date().toISOString(), repetida: false } }, 201);
    }
    return json({ error: "nao_encontrado" }, 404);
  });
  return enviados;
}

const pilula = (page: Page) => page.locator("zro-set.set-zro:visible .pilula");

test.describe("o Set na barra de cima", () => {
  test("pílula discreta, a conversa do projeto (a mesma do HUB) e a resposta pelo repasse", async ({ page, context, baseURL }, info) => {
    const enviados = await preparar(context, baseURL!);
    await page.goto("/app/hoje");
    await expect(pilula(page)).toHaveAttribute("aria-label", /1 pessoa online, 1 mensagem nova/);
    await foto(page, "maestro-set-pilula", info.project.name);
    await pilula(page).click();
    const folha = page.getByRole("dialog", { name: "Set" });
    await expect(folha.getByRole("button", { name: /Bia/ })).toContainText("na Absolute ZRO");
    await folha.getByRole("tab", { name: /Conversas/ }).click();
    await folha.getByRole("button", { name: /Filme Safra/ }).click();
    await expect(folha.getByRole("log")).toContainText("Diária confirmada para sexta.");
    // na folha, a conversa aberta toma o lugar da lista (nunca as duas juntas)
    await expect(folha.getByRole("tab", { name: /Conversas/ })).toBeHidden();
    await folha.getByRole("textbox", { name: "Mensagem" }).fill("Fechado, até sexta!");
    await folha.getByRole("textbox", { name: "Mensagem" }).press("Enter");
    await expect(folha.getByRole("log")).toContainText("Fechado, até sexta!");
    expect(enviados).toEqual(["Fechado, até sexta!"]);
    await foto(page, "maestro-set-conversa", info.project.name);
    // nada vaza de lado no celular
    const largura = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(largura).toBeLessThanOrEqual(0);
  });

  test("sem login com o escopo do Set, a pílula some (nada de erro na barra)", async ({ page, context, baseURL }) => {
    await preparar(context, baseURL!, { semLogin: true });
    await page.goto("/app/hoje");
    await expect(page.locator("zro-set.set-zro[data-fora]")).toHaveCount(1);
    await expect(page.locator("zro-set.set-zro .pilula:visible")).toHaveCount(0);
  });
});
