/**
 * A Z (IA da Absolute ZRO) pelo SOBEDESCE, contra a Absolute ZRO falsa: o login pede `offline_access zro.ia`, os tokens
 * ficam cifrados na conta, o repasse /api/zro/ia/* acrescenta o Bearer no servidor (cookie do site ou Bearer do
 * computador), renova o access token sem reapresentar refresh velho, repassa o NDJSON em streaming, recusa sem sessão
 * e nunca devolve token ao navegador. Sem o escopo (invalid_scope), o login refaz o pedido sem ele.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { cookiesDe, pedido, prepararAmbiente, SITE } from "./ambiente.mjs";
import { iniciarZroFalsa, type PessoaZro } from "./zro-falso.mjs";

const CLIENTE = { clientId: "sobedesce-web", clientSecret: "zk_segredo_de_teste" };
let amb: Awaited<ReturnType<typeof prepararAmbiente>>;
let zro: Awaited<ReturnType<typeof iniciarZroFalsa>>;
let rotaEntrar: typeof import("../src/app/api/zro/entrar/route");
let rotaVolta: typeof import("../src/app/api/zro/callback/route");
let rotaIa: typeof import("../src/app/api/zro/ia/[...caminho]/route");
let sessao: typeof import("../src/lib/auth/sessao");
let contas: typeof import("../src/lib/auth/contas");

const LIA: PessoaZro = { sub: "zro-ia-1", email: "lia@ia.com", nome: "Lia Montadora", org: "Lia Filmes", produtos: ["sobedesce"] };

before(async () => {
  amb = await prepararAmbiente();
  zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret });
  rotaEntrar = await import("../src/app/api/zro/entrar/route");
  rotaVolta = await import("../src/app/api/zro/callback/route");
  rotaIa = await import("../src/app/api/zro/ia/[...caminho]/route");
  sessao = await import("../src/lib/auth/sessao");
  contas = await import("../src/lib/auth/contas");
});

after(async () => {
  await zro?.fechar();
  await amb?.fechar();
});

/** Entrar pela Absolute ZRO falsa (seguindo o refazer sem escopo, se houver). Devolve destino e cookies. */
async function entrar(o: { pessoa: PessoaZro; modo?: "entrar" | "vincular"; sessao?: string; volta?: string }) {
  zro.estado.proximo = { pessoa: o.pessoa, negar: false, adulterar: null };
  const q = new URLSearchParams({ modo: o.modo ?? "entrar" });
  if (o.volta) q.set("volta", o.volta);
  let caminho = `/api/zro/entrar?${q}`;
  for (let i = 0; i < 2; i++) {
    const ida = await rotaEntrar.GET(pedido(caminho, { cookies: { sd_sessao: o.sessao } }));
    assert.equal(ida.status, 302);
    const cookie = cookiesDe(ida).get("sd_zro");
    const z = await fetch(ida.headers.get("location")!, { redirect: "manual" });
    const res = await rotaVolta.GET(pedido(z.headers.get("location")!.replace(SITE, ""), { cookies: { sd_zro: cookie, sd_sessao: o.sessao } }));
    const destino = new URL(res.headers.get("location")!, SITE);
    if (destino.pathname === "/api/zro/entrar") {
      caminho = destino.pathname + destino.search;
      continue;
    }
    return { destino: destino.pathname + destino.search, cookies: cookiesDe(res) };
  }
  throw new Error("laço de login");
}

const ia = (caminho: string, p: Parameters<typeof pedido>[1] = {}) => {
  const req = pedido(`/api/zro/ia/${caminho}`, p);
  return rotaIa[req.method as "GET" | "POST" | "DELETE"](req, { params: Promise.resolve({ caminho: caminho.split("/") }) } as never);
};

let token = "";

describe("login pede o escopo da Z e guarda os tokens só no servidor", () => {
  test("o pedido leva offline_access e zro.ia; nenhum cookie leva token", async () => {
    const r = await entrar({ pessoa: LIA });
    assert.match(zro.estado.ultimoEscopo ?? "", /\boffline_access\b/);
    assert.match(zro.estado.ultimoEscopo ?? "", /\bzro\.ia\b/);
    token = r.cookies.get("sd_sessao")!;
    assert.ok(token);
    for (const [, v] of r.cookies) assert.doesNotMatch(v, /zat_|zrt_/);
    const { db, schema } = amb.banco;
    const [linha] = await db.select().from(schema.contasZro);
    assert.ok(linha.ia, "tokens guardados na conta");
    assert.doesNotMatch(linha.ia!, /zat_|zrt_/, "cifrados, não em texto");
  });
});

describe("repasse /api/zro/ia", () => {
  test("encaminha com o Bearer da conta e devolve o estado", async () => {
    zro.estado.pedidosIa.length = 0;
    const res = await ia("estado", { cookies: { sd_sessao: token } });
    assert.equal(res.status, 200);
    const corpo = await res.text();
    assert.equal(JSON.parse(corpo).nome, "Lia");
    assert.doesNotMatch(corpo, /zat_|zrt_/);
    assert.match(zro.estado.pedidosIa[0].autorizacao ?? "", /^Bearer zat_/);
    assert.equal(res.headers.get("set-cookie"), null);
  });

  test("mensagens: NDJSON repassado em streaming (a primeira linha chega antes do fim)", async () => {
    const res = await ia("mensagens", { cookies: { sd_sessao: token }, corpo: { texto: "oi" } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /ndjson/);
    const leitor = res.body!.getReader();
    const primeiro = new TextDecoder().decode((await leitor.read()).value);
    assert.match(primeiro, /"tipo":"conversa"/);
    assert.doesNotMatch(primeiro, /"tipo":"fim"/, "não esperou o fim para mandar");
    let resto = "";
    for (let p = await leitor.read(); !p.done; p = await leitor.read()) resto += new TextDecoder().decode(p.value);
    assert.match(resto, /"tipo":"fim"/);
    assert.equal(zro.estado.pedidosIa.at(-1)?.corpo, JSON.stringify({ texto: "oi" }));
  });

  test("sem sessão: 401, e nada chega à Absolute ZRO", async () => {
    const antes = zro.estado.pedidosIa.length;
    const res = await ia("estado");
    assert.equal(res.status, 401);
    assert.equal(zro.estado.pedidosIa.length, antes);
  });

  test("pedido de outra origem com cookie: recusado", async () => {
    const res = await ia("mensagens", { cookies: { sd_sessao: token }, corpo: { texto: "oi" }, origin: "https://outro.exemplo" });
    assert.equal(res.status, 403);
  });

  test("caminho ou método fora da API da IA: 404", async () => {
    assert.equal((await ia("../carro-do-freela/jobs", { cookies: { sd_sessao: token } })).status, 404);
    assert.equal((await ia("estado", { cookies: { sd_sessao: token }, method: "DELETE" })).status, 404);
    assert.equal((await ia("conversas/c1", { cookies: { sd_sessao: token }, method: "DELETE" })).status, 204);
  });

  test("o app de computador usa o Bearer do dispositivo (o mesmo token da conta)", async () => {
    const a = await sessao.autenticar({ cookie: token });
    const d = await sessao.criarSessao(a!.usuario.id, "dispositivo", { nome: "Mac do estúdio", plataforma: "mac" });
    const res = await ia("conversas", { bearer: d.token });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { conversas: [] });
  });

  test("access token vencido: renova uma vez (o refresh roda) e dois pedidos juntos não derrubam a família", async () => {
    zro.estado.vidaAcesso = 0;
    // Gasta o access token guardado: o próximo login emite com vida 0.
    const r = await entrar({ pessoa: LIA });
    token = r.cookies.get("sd_sessao")!;
    // Os tokens renovados já vêm com vida normal: só o guardado está vencido.
    zro.estado.vidaAcesso = 600;
    const antes = zro.estado.renovacoes;
    const [a, b] = await Promise.all([ia("estado", { cookies: { sd_sessao: token } }), ia("conversas", { cookies: { sd_sessao: token } })]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.ok(zro.estado.renovacoes > antes);
    assert.equal(zro.estado.renovacoes, antes + 1, "uma troca só: o segundo pedido esperou e usou o token novo");
    assert.equal(zro.estado.familiaDerrubada, false);
  });

  test("refresh recusado: 401 reconectar_zro e os tokens saem da conta", async () => {
    const { db, schema } = amb.banco;
    zro.estado.vidaAcesso = 0;
    const r = await entrar({ pessoa: LIA });
    token = r.cookies.get("sd_sessao")!;
    // Derruba a família na Absolute ZRO falsa (como "remover acesso do app").
    zro.estado.familiaDerrubada = false;
    const [linha] = await db.select().from(schema.contasZro);
    const tokens = (await import("../src/lib/google/cripto")).abrir(linha.ia!, `contas_zro.ia:${linha.usuarioId}`);
    const rt = JSON.parse(tokens).rt as string;
    await fetch(`${zro.url}/oauth/token`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${CLIENTE.clientId}:${CLIENTE.clientSecret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt }),
    });
    zro.estado.vidaAcesso = 600;
    const res = await ia("estado", { cookies: { sd_sessao: token } });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).erro, "reconectar_zro");
    const [depois] = await db.select().from(schema.contasZro);
    assert.equal(depois.ia, null);
  });

  test("reconectar (vincular) devolve os tokens e a Z volta a responder", async () => {
    const r = await entrar({ pessoa: LIA, modo: "vincular", sessao: token, volta: "/conta" });
    assert.equal(r.destino, "/conta?zro=ok");
    const res = await ia("estado", { cookies: { sd_sessao: token } });
    assert.equal(res.status, 200);
  });

  test("conta sem vínculo com a Absolute ZRO: 401 reconectar_zro", async () => {
    const c = await contas.criarConta({ nome: "Rui", email: "rui@ia.com", senha: "senha do rui!", ip: "9.9.9.9" });
    assert.ok(c.ok);
    const res = await ia("estado", { cookies: { sd_sessao: c.token } });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).erro, "reconectar_zro");
  });
});

describe("Absolute ZRO sem o escopo da Z", () => {
  test("invalid_scope: o login refaz o pedido sem zro.ia e entra do mesmo jeito", async () => {
    zro.estado.recusarEscopoIa = true;
    const r = await entrar({ pessoa: { sub: "zro-ia-2", email: "bia@ia.com", nome: "Bia", produtos: ["sobedesce"] } });
    zro.estado.recusarEscopoIa = false;
    assert.equal(r.destino, "/conta?zro=ok");
    assert.ok(r.cookies.get("sd_sessao"));
    assert.doesNotMatch(zro.estado.ultimoEscopo ?? "", /zro\.ia/);
  });
});
