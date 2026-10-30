/**
 * O Set (presença e conversas da Absolute ZRO, ADR 0032 de lá) pelo SOBEDESCE, contra a Absolute ZRO falsa: o login
 * pede `zro.set` junto com a Z, o repasse /api/zro/set/* acrescenta o Bearer da conta no servidor, só os caminhos do
 * Set passam, a ETag vai e o 304 volta sem corpo, outra origem não muda nada e um 401 do Set não apaga os tokens da Z.
 * Absolute ZRO de antes do Set (invalid_scope): o login refaz sem zro.set e a Z segue. A entrada da tela (a aba "Set"
 * no site e no app do celular) também está aqui, lida do código: o widget é o <zro-set modo="folha"> da Absolute ZRO.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { cookiesDe, pedido, prepararAmbiente, SITE } from "./ambiente.mjs";
import { iniciarZroFalsa, type PessoaZro } from "./zro-falso.mjs";

const CLIENTE = { clientId: "sobedesce-web", clientSecret: "zk_segredo_de_teste" };
const ID = "6f1c2a4e-1d2b-4c3d-8e9f-0a1b2c3d4e5f";
let amb: Awaited<ReturnType<typeof prepararAmbiente>>;
let zro: Awaited<ReturnType<typeof iniciarZroFalsa>>;
let rotaEntrar: typeof import("../src/app/api/zro/entrar/route");
let rotaVolta: typeof import("../src/app/api/zro/callback/route");
let rotaSet: typeof import("../src/app/api/zro/set/[[...caminho]]/route");
let rotaIa: typeof import("../src/app/api/zro/ia/[...caminho]/route");

const NINA: PessoaZro = { sub: "zro-set-1", email: "nina@set.com", nome: "Nina Ribeiro", org: "Nina Filmes", produtos: ["sobedesce"] };

before(async () => {
  amb = await prepararAmbiente();
  zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret });
  rotaEntrar = await import("../src/app/api/zro/entrar/route");
  rotaVolta = await import("../src/app/api/zro/callback/route");
  rotaSet = await import("../src/app/api/zro/set/[[...caminho]]/route");
  rotaIa = await import("../src/app/api/zro/ia/[...caminho]/route");
});

after(async () => {
  await zro?.fechar();
  await amb?.fechar();
});

async function entrar(pessoa: PessoaZro) {
  zro.estado.proximo = { pessoa, negar: false, adulterar: null };
  let caminho = "/api/zro/entrar?modo=entrar";
  for (let i = 0; i < 3; i++) {
    const ida = await rotaEntrar.GET(pedido(caminho));
    assert.equal(ida.status, 302);
    const cookie = cookiesDe(ida).get("sd_zro");
    const z = await fetch(ida.headers.get("location")!, { redirect: "manual" });
    const res = await rotaVolta.GET(pedido(z.headers.get("location")!.replace(SITE, ""), { cookies: { sd_zro: cookie } }));
    const destino = new URL(res.headers.get("location")!, SITE);
    if (destino.pathname === "/api/zro/entrar") {
      caminho = destino.pathname + destino.search;
      continue;
    }
    return { destino: destino.pathname + destino.search, cookies: cookiesDe(res) };
  }
  throw new Error("laço de login");
}

type Extra = { headers?: Record<string, string>; corpoBruto?: string; tipo?: string };
const set = (caminho: string, p: Parameters<typeof pedido>[1] & Extra = {}) => {
  let req = pedido(`/api/zro/set${caminho ? `/${caminho}` : ""}`, p);
  if (p.headers || p.corpoBruto !== undefined) {
    const h = new Headers(req.headers);
    for (const [k, v] of Object.entries(p.headers ?? {})) h.set(k, v);
    if (p.tipo) h.set("content-type", p.tipo);
    if (p.corpoBruto !== undefined && !h.has("origin")) h.set("origin", SITE);
    req = new Request(req.url, { method: req.method, headers: h, body: p.corpoBruto });
  }
  const partes = caminho.split("?")[0].split("/").filter(Boolean);
  return rotaSet[req.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE"](req, { params: Promise.resolve({ caminho: partes.length ? partes : undefined }) } as never);
};

let token = "";

describe("login", () => {
  test("pede zro.set junto com a Z", async () => {
    const r = await entrar(NINA);
    assert.match(zro.estado.ultimoEscopo ?? "", /\bzro\.ia\b/);
    assert.match(zro.estado.ultimoEscopo ?? "", /\bzro\.set\b/);
    token = r.cookies.get("sd_sessao")!;
    assert.ok(token);
  });
});

describe("repasse /api/zro/set", () => {
  test("sem sessão: 401, e nada chega à Absolute ZRO", async () => {
    const antes = zro.estado.pedidosSet.length;
    assert.equal((await set("")).status, 401);
    assert.equal(zro.estado.pedidosSet.length, antes);
  });

  test("leva o Bearer da conta (sem cookie do site); a ETag vai e o 304 volta sem corpo", async () => {
    const res = await set("", { cookies: { sd_sessao: token } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("etag"), 'W/"v1"');
    assert.equal(res.headers.get("cache-control"), "no-store");
    const corpo = await res.text();
    assert.doesNotMatch(corpo, /zat_|zrt_/);
    assert.equal(res.headers.get("set-cookie"), null);
    const ultimo = zro.estado.pedidosSet.at(-1)!;
    assert.match(ultimo.autorizacao ?? "", /^Bearer zat_/);
    const de304 = await set("", { cookies: { sd_sessao: token }, headers: { "if-none-match": 'W/"v1"' } });
    assert.equal(de304.status, 304);
    assert.equal(await de304.text(), "");
    assert.equal(zro.estado.pedidosSet.at(-1)!.seEtag, 'W/"v1"');
    // ETag estranha não segue
    await set("", { cookies: { sd_sessao: token }, headers: { "if-none-match": "*" } });
    assert.equal(zro.estado.pedidosSet.at(-1)!.seEtag, null);
  });

  test("na conversa só antes/depois/limite seguem; envio e batida passam com JSON", async () => {
    await set(`conversas/${ID}?depois=4&x=1`, { cookies: { sd_sessao: token } });
    assert.equal(zro.estado.pedidosSet.at(-1)!.caminho, `conversas/${ID}?depois=4`);
    const enviou = await set(`conversas/${ID}/mensagens`, { cookies: { sd_sessao: token }, corpo: { texto: "Oi", chave: "abcdefgh12" } });
    assert.equal(enviou.status, 200);
    assert.equal(zro.estado.pedidosSet.at(-1)!.corpo, '{"texto":"Oi","chave":"abcdefgh12"}');
    assert.equal((await set("", { cookies: { sd_sessao: token }, corpo: { estado: "ativo" } })).status, 200);
  });

  test("outra origem, corpo que não é JSON e caminhos ou métodos fora do Set não passam", async () => {
    const antes = zro.estado.pedidosSet.length;
    assert.equal((await set("", { cookies: { sd_sessao: token }, corpo: { estado: "ativo" }, origin: "https://outro.exemplo" })).status, 403);
    assert.equal((await set("", { cookies: { sd_sessao: token }, method: "POST", corpoBruto: "estado=ativo", tipo: "text/plain" })).status, 415);
    assert.equal((await set("../ia/estado", { cookies: { sd_sessao: token } })).status, 404);
    assert.equal((await set("conversas/nao-e-id", { cookies: { sd_sessao: token } })).status, 404);
    assert.equal((await set("preferencias", { cookies: { sd_sessao: token } })).status, 404);
    assert.equal((await set("", { cookies: { sd_sessao: token }, method: "DELETE" })).status, 404);
    assert.equal(zro.estado.pedidosSet.length, antes);
  });
});

describe("login de antes do Set", () => {
  test("invalid_scope: refaz sem zro.set, entra com a Z; o Set responde 401 e a Z continua", async () => {
    zro.estado.recusarEscopoSet = true;
    const r = await entrar({ sub: "zro-set-2", email: "caio@set.com", nome: "Caio", produtos: ["sobedesce"] });
    zro.estado.recusarEscopoSet = false;
    assert.equal(r.destino, "/conta?zro=ok");
    assert.match(zro.estado.ultimoEscopo ?? "", /\bzro\.ia\b/);
    assert.doesNotMatch(zro.estado.ultimoEscopo ?? "", /zro\.set/);
    const sessao = r.cookies.get("sd_sessao")!;
    const antes = zro.estado.pedidosSet.length;
    const res = await set("", { cookies: { sd_sessao: sessao } });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).erro, "reconectar_zro");
    assert.equal(zro.estado.pedidosSet.length, antes, "sem o escopo, nem pergunta à Absolute ZRO");
    const req = pedido("/api/zro/ia/estado", { cookies: { sd_sessao: sessao } });
    const z = await rotaIa.GET(req, { params: Promise.resolve({ caminho: ["estado"] }) } as never);
    assert.equal(z.status, 200, "os tokens continuam valendo para a Z");
  });
});

describe("a aba em comum na tela", () => {
  const raiz = new URL("../", import.meta.url);
  const ler = (f: string) => readFileSync(new URL(f, raiz), "utf8");

  test("no site: Set no cabeçalho, ao lado do anel da Z, abrindo a folha do <zro-set> pelo repasse", () => {
    const menu = ler("src/components/conta/menu.tsx");
    assert.match(menu, /<BotaoSet \/>\s*<LinkZ/);
    const aba = ler("src/components/conta/aba-set.tsx");
    assert.match(aba, /absolutezro\.com\/set\/v1\/zro-set\.js/);
    assert.match(aba, /setAttribute\("modo", "folha"\)/);
    assert.match(aba, /setAttribute\("api", "\/api\/zro\/set"\)/);
    assert.match(aba, /abrirSet\?\.\(\)/);
    assert.doesNotMatch(aba, /Bearer|access_token/);
  });

  test("no app do celular: no topo, ao lado da Z (não é aba), escondido até o Set responder, com a cara do app", () => {
    const tabs = ler("public/app/components/tabs.js");
    assert.doesNotMatch(tabs, /SetBotao|AbaSet/, "a barra de baixo é só a tarefa");
    assert.match(tabs, /useSet\(\)/);
    const main = ler("public/app/components/main.js");
    assert.match(main, /<\$\{SetBotao\} \/>\s*<\$\{ZBotao\} \/>/);
    const aba = ler("public/app/components/set.js");
    assert.match(aba, /absolutezro\.com\/set\/v1\/zro-set\.js/);
    assert.match(aba, /'modo', 'folha'/);
    assert.match(aba, /'api', '\/api\/zro\/set'/);
    const css = ler("public/app/app.css");
    for (const v of ["tinta", "superficie", "acento", "raio", "fonte"]) assert.match(css, new RegExp(`--zro-set-${v}:`));
    const sw = ler("public/app/sw.js");
    assert.match(sw, /components\/set\.js/);
  });
});
