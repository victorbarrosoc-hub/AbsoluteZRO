/**
 * O Set da Absolute ZRO (ADR 0032 do HUB) na barra de cima do Maestro: a pílula discreta mostra quem está online, a
 * folha abre a conversa do projeto (a mesma do HUB: "Filme Safra", escrita pela Bia lá) e a resposta sai pelo repasse
 * /api/zro/set. Sem login com o escopo do Set (401), a pílula some. O <zro-set> vem do próprio repositório
 * (apps/hub-web/public/set) no lugar de absolutezro.com, e o repasse responde como a Absolute ZRO, sem rede. A conversa
 * de verdade entre o HUB e um app (o mesmo projeto pelo token do app) está em tests/integration/set.test.ts do HUB.
 * Com SHOTS_DIR, guarda as capturas da pílula e da conversa (claro, computador e iPhone).
 */
import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

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

// ───────────── adicionar pelo @, com duas pessoas na mesma Absolute ZRO de mentira ─────────────

type P = { id: string; arroba: string; nome: string; foto: null };
const EU: P = { id: "0b5a5b5c-1111-4a1a-9a1a-1a1a1a1a1a1a", arroba: "pessoa", nome: "Pessoa", foto: null };
const LEO: P = { id: "0b5a5b5c-2222-4b2b-9b2b-2b2b2b2b2b2b", arroba: "leo.som", nome: "Leo", foto: null };

/** A API do Set de mentira para duas pessoas: contatos, pedidos, presença (quem tem a aba aberta) e uma conversa. */
function setFalso() {
  const perfis = [EU, LEO];
  const pedidos: { de: string; para: string }[] = [];
  const contatos = new Set<string>();
  const par = (a: string, b: string) => [a, b].sort().join(":");
  const msgs: { id: string; seq: number; autor: P; texto: string; criadaEm: string }[] = [];
  const conversaId = "0c0c0c0c-3333-4c3c-9c3c-3c3c3c3c3c3c";
  const vistos = new Map<string, number>();
  let limite = false;
  const resumoConversa = (eu: P) => {
    const outro = eu.id === EU.id ? LEO : EU;
    return {
      id: conversaId,
      tipo: "direta",
      pessoa: outro,
      projeto: null,
      titulo: outro.nome,
      ultima: msgs.length,
      ultimaEm: msgs.at(-1)?.criadaEm ?? null,
      previa: msgs.at(-1)?.texto ?? null,
      previaMinha: msgs.at(-1)?.autor.id === eu.id,
      naoLidas: 0,
      silenciada: false,
      podeEscrever: true,
    };
  };
  const situacao = (eu: P, outro: P) =>
    contatos.has(par(eu.id, outro.id))
      ? "contato"
      : pedidos.some((x) => x.de === eu.id && x.para === outro.id)
        ? "enviado"
        : pedidos.some((x) => x.de === outro.id && x.para === eu.id)
          ? "recebido"
          : "nenhuma";
  const rotear = (eu: P) => (r: Route) => {
    const u = new URL(r.request().url());
    const caminho = u.pathname.replace(/^\/api\/zro\/set/, "");
    const metodo = r.request().method();
    const corpo = (JSON.parse(r.request().postData() || "{}") ?? {}) as Record<string, string>;
    const json = (c: unknown, status = 200) => r.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(c) });
    const erro = (status: number, message: string) => json({ ok: false, message }, status);
    if (caminho === "" || caminho === "/") {
      vistos.set(eu.id, Date.now());
      const pessoas = perfis
        .filter((p) => p.id !== eu.id && contatos.has(par(eu.id, p.id)))
        .map((p) => {
          const on = Date.now() - (vistos.get(p.id) ?? 0) < 60_000;
          return { ...p, equipe: false, contato: true, estado: on ? "online" : "offline", app: on ? { id: "maestro", nome: "Maestro" } : null, vistoEm: null };
        });
      return json({
        eu: { ...eu, preferencias: { invisivel: false, quemVe: "equipe_contatos", mostrarVisto: true } },
        pessoas,
        naoLidas: 0,
        pedidos: pedidos.filter((x) => x.para === eu.id).length,
        porConversa: {},
        ultima: msgs.length,
      });
    }
    if (caminho === "/contatos" && metodo === "GET") {
      const de = (s: string) => perfis.filter((p) => p.id !== eu.id && situacao(eu, p) === s);
      return json({ contatos: de("contato"), recebidos: de("recebido"), enviados: de("enviado"), bloqueados: [] });
    }
    if (caminho === "/contatos" && metodo === "POST") {
      const arroba = String(corpo.ver ?? corpo.arroba ?? "")
        .replace(/^@/, "")
        .toLowerCase();
      const alvo = perfis.find((p) => p.arroba === arroba && p.id !== eu.id);
      // "escondida" tem perfil, mas escondido da busca: a mesma resposta de quem não existe
      if (!alvo) return erro(404, `Não achamos @${arroba}.`);
      if (corpo.ver) return json({ pessoa: alvo, situacao: situacao(eu, alvo) });
      if (situacao(eu, alvo) === "contato") return erro(409, "Vocês já são contatos.");
      if (situacao(eu, alvo) === "recebido") {
        pedidos.splice(
          pedidos.findIndex((x) => x.de === alvo.id),
          1,
        );
        contatos.add(par(eu.id, alvo.id));
        return json({ estado: "aceito", pessoa: alvo }, 201);
      }
      if (limite) return erro(429, "Muitos pedidos hoje. Tente amanhã.");
      if (situacao(eu, alvo) === "nenhuma") pedidos.push({ de: eu.id, para: alvo.id });
      return json({ estado: "pendente", pessoa: alvo }, 201);
    }
    const resp = caminho.match(/^\/contatos\/([0-9a-f-]{36})$/);
    if (resp && metodo === "PUT") {
      const i = pedidos.findIndex((x) => x.de === resp[1] && x.para === eu.id);
      if (i < 0) return erro(404, "Esse pedido não está mais aqui.");
      pedidos.splice(i, 1);
      if (corpo.acao === "aceitar") contatos.add(par(eu.id, resp[1]!));
      return json({ estado: corpo.acao === "aceitar" ? "aceito" : "recusado" });
    }
    if (caminho === "/conversas" && metodo === "POST") {
      if (!contatos.has(par(eu.id, corpo.pessoa ?? ""))) return erro(403, "Para conversar, peça contato antes.");
      return json({ conversa: resumoConversa(eu) }, 201);
    }
    if (caminho === "/conversas") return json({ conversas: msgs.length ? [resumoConversa(eu)] : [], projetos: [] });
    if (caminho === `/conversas/${conversaId}` && metodo === "GET") {
      const depois = Number(u.searchParams.get("depois") ?? -1);
      const lista = msgs.filter((m) => m.seq > depois).map((m) => ({ ...m, minha: m.autor.id === eu.id, editadaEm: null, apagada: false }));
      return json({ conversa: resumoConversa(eu), mensagens: lista, mais: false });
    }
    if (caminho === `/conversas/${conversaId}` && metodo === "PATCH") return r.fulfill({ status: 204 });
    if (caminho === `/conversas/${conversaId}/mensagens` && metodo === "POST") {
      msgs.push({ id: `m${msgs.length + 1}`, seq: msgs.length + 1, autor: eu, texto: corpo.texto!, criadaEm: new Date().toISOString() });
      return json({ id: `m${msgs.length}`, seq: msgs.length, criadaEm: new Date().toISOString(), repetida: false }, 201);
    }
    return erro(404, "Não encontrado.");
  };
  return {
    rotear,
    limitar: () => {
      limite = true;
    },
  };
}

async function entrar(context: BrowserContext, baseURL: string, rota: (r: Route) => unknown) {
  const { token } = JSON.parse(readFileSync(ARQUIVO_SESSAO, "utf8")) as { token: string };
  await context.addCookies([{ name: "mae_sessao", value: token, url: baseURL }]);
  await context.route("https://absolutezro.com/set/**", (r) =>
    r.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*", "content-type": "text/javascript; charset=utf-8" },
      body: readFileSync(new URL(new URL(r.request().url()).pathname.replace(/^\/set\//, ""), SET)),
    }),
  );
  await context.route("**/api/zro/set**", rota);
}

test.describe("adicionar pelo @ no Set", () => {
  test("pedido pelo @ → aparece para o Leo → ele aceita → os dois se veem online → o toque abre a conversa", async ({
    page,
    context,
    baseURL,
    browser,
  }, info) => {
    test.setTimeout(120_000);
    const falso = setFalso();
    await entrar(context, baseURL!, falso.rotear(EU));
    const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, proxy } = info.project.use;
    const ctxLeo = await browser.newContext({
      viewport,
      userAgent,
      deviceScaleFactor,
      isMobile,
      hasTouch,
      baseURL,
      proxy: proxy ?? { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1,::1" },
    });
    await entrar(ctxLeo, baseURL!, falso.rotear(LEO));
    const leo = await ctxLeo.newPage();
    try {
      await page.goto("/app/hoje");
      await pilula(page).click();
      const f = page.getByRole("dialog", { name: "Set" });
      await expect(f.getByRole("button", { name: "Adicionar pelo @" })).toBeVisible();
      await f.getByRole("button", { name: "Adicionar alguém pelo @" }).click();
      const campo = f.getByRole("textbox", { name: "@ da pessoa" });
      await campo.fill("@leo.som");
      await expect(f.locator(".achado")).toContainText("Leo");
      await expect(f.locator(".achado")).toContainText("@leo.som");
      await foto(page, "maestro-set-adicionar", info.project.name);
      await f.getByRole("button", { name: "Adicionar Leo" }).click();
      await expect(f.getByRole("status")).toContainText("Pedido enviado");

      await leo.goto("/app/hoje");
      await expect(pilula(leo)).toHaveAttribute("aria-label", /1 pedido de contato/);
      await pilula(leo).click();
      const fl = leo.getByRole("dialog", { name: "Set" });
      await expect(fl.getByRole("tab", { name: /Online/ })).toContainText("1");
      await foto(leo, "maestro-set-pedidos", info.project.name);
      await fl.getByRole("button", { name: "Aceitar Pessoa" }).click();
      await expect(fl.getByRole("status")).toContainText("Agora vocês são contatos");
      await expect(fl.getByRole("button", { name: /Pessoa/ })).toContainText("no Maestro");

      // a outra aba vê o Leo online sem recarregar (a folha relê a cada 12 s) e o toque abre a conversa
      await expect(f.getByRole("button", { name: /Leo/ })).toContainText("no Maestro", { timeout: 25_000 });
      await f.getByRole("button", { name: /Leo/ }).click();
      await f.getByRole("textbox", { name: "Mensagem" }).fill("Oi, Leo!");
      await f.getByRole("textbox", { name: "Mensagem" }).press("Enter");
      await expect(f.getByRole("log")).toContainText("Oi, Leo!");
      await fl.getByRole("button", { name: /Pessoa/ }).click();
      await expect(fl.getByRole("log")).toContainText("Oi, Leo!");
      const largura = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(largura).toBeLessThanOrEqual(0);
    } finally {
      await ctxLeo.close();
    }
  });

  test('perfil escondido é "não achamos" e o limite do dia aparece', async ({ page, context, baseURL }, info) => {
    const falso = setFalso();
    await entrar(context, baseURL!, falso.rotear(EU));
    await page.goto("/app/hoje");
    await pilula(page).click();
    const f = page.getByRole("dialog", { name: "Set" });
    await f.getByRole("button", { name: "Adicionar pelo @" }).click();
    const campo = f.getByRole("textbox", { name: "@ da pessoa" });
    await campo.fill("escondida");
    await expect(f.getByRole("alert")).toHaveText("Não achamos @escondida.");
    falso.limitar();
    await campo.fill("leo.som");
    await f.getByRole("button", { name: "Adicionar Leo" }).click();
    await expect(f.getByRole("alert")).toHaveText("Muitos pedidos hoje. Tente amanhã.");
    await foto(page, "maestro-set-limite", info.project.name);
  });
});
