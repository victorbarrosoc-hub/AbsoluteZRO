// O repasse da Z (/api/zro/ia/*): leva o Bearer da sessão à Absolute ZRO, nunca o devolve ao navegador, passa o
// NDJSON sem esperar o fim, nega sem sessão, sem acesso ao Maestro, sem o escopo da IA e de outra origem.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { cookiesDe, pedido, prepararAmbiente, SITE, UUID } from "./ambiente.mts";
import type { PessoaZro } from "./zro-falso.mts";

const amb = await prepararAmbiente("ia");
const { zro } = amb;
const rotas = await import("../src/lib/zro/rotas");
const { repassarIa, caminhoIa } = await import("../src/lib/zro/ia");

const ORG = { id: UUID(), name: "Produtora Lia", role: "owner" };
const LIA: PessoaZro = { sub: UUID(), email: "lia@produtora.exemplo", nome: "Lia Produtora", org: ORG, produtos: ["maestro"] };

after(() => amb.fechar());

async function entrar(pessoa: PessoaZro = LIA): Promise<string> {
  Object.assign(zro.estado.proximo, { pessoa, adulterar: null, negar: false });
  const ida = await rotas.entrar(pedido("/api/zro/entrar"));
  const z = await fetch(new URL(ida.headers.get("location")!), { redirect: "manual" });
  const volta = await rotas.callback(pedido(z.headers.get("location")!.replace(SITE, ""), { cookies: { mae_zro: cookiesDe(ida).get("mae_zro") } }));
  return cookiesDe(volta).get("mae_sessao")!;
}

const ia = (sessao: string | undefined, partes: string[], p: Parameters<typeof pedido>[1] = {}) =>
  repassarIa(pedido(`/api/zro/ia/${partes.join("/")}`, { cookies: { mae_sessao: sessao }, ...p }), partes);

describe("repasse da Z", () => {
  test("só os caminhos do painel", () => {
    assert.equal(caminhoIa(["estado"], "GET"), "estado");
    assert.equal(caminhoIa(["conversas"], "GET"), "conversas");
    assert.equal(caminhoIa(["conversas", "abc"], "DELETE"), "conversas/abc");
    assert.equal(caminhoIa(["mensagens"], "POST"), "mensagens");
    assert.equal(caminhoIa(["mensagens"], "GET"), null);
    assert.equal(caminhoIa(["conversas", "../x"], "GET"), null);
    assert.equal(caminhoIa(["admin"], "GET"), null);
  });

  test("leva o Bearer da sessão e não vaza o token", async () => {
    const sessao = await entrar();
    zro.estado.pedidosIa.length = 0;
    const r = await ia(sessao, ["estado"]);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const texto = await r.text();
    assert.equal(JSON.parse(texto).produto, "maestro");
    assert.equal(zro.estado.pedidosIa.length, 1);
    assert.match(zro.estado.pedidosIa[0].autorizacao ?? "", /^Bearer zat_/);
    assert.ok(!/zat_|zrt_/.test(texto), "o token não vai ao navegador");
  });

  test("mensagens: NDJSON em streaming, a primeira linha chega antes do fim", async () => {
    const sessao = await entrar();
    const r = await ia(sessao, ["mensagens"], { corpo: { texto: "Oi" } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /x-ndjson/);
    const leitor = r.body!.getReader();
    const t0 = Date.now();
    const primeiro = await leitor.read();
    const dt = Date.now() - t0;
    assert.ok(!primeiro.done);
    const linha = new TextDecoder().decode(primeiro.value);
    assert.match(linha, /"tipo":"conversa"/);
    assert.ok(!linha.includes('"fim"'), "não esperou o fim");
    assert.ok(dt < 55, `primeira linha em ${dt} ms`);
    let resto = linha;
    for (;;) {
      const p = await leitor.read();
      if (p.done) break;
      resto += new TextDecoder().decode(p.value);
    }
    assert.equal(resto.trim().split("\n").length, 3);
  });

  test("nega sem sessão, com caminho fora da lista e de outra origem", async () => {
    assert.equal((await ia(undefined, ["estado"])).status, 401);
    const sessao = await entrar();
    assert.equal((await ia(sessao, ["qualquer"])).status, 404);
    assert.equal((await ia(sessao, ["mensagens"], { corpo: { texto: "x" }, origin: "https://mal.exemplo" })).status, 403);
    assert.equal((await ia(sessao, ["mensagens"], { method: "POST", headers: { "content-type": "text/plain" } })).status, 415);
  });

  test("sem acesso ao Maestro: 403 mesmo com sessão", async () => {
    const sessao = await entrar({
      ...LIA,
      sub: UUID(),
      email: "nina@outra.exemplo",
      org: { id: UUID(), name: "Outra", role: "owner" },
      produtos: ["sobedesce"],
    });
    const r = await ia(sessao, ["estado"]);
    assert.equal(r.status, 403);
    assert.equal((await r.json()).erro, "sem_acesso_zro");
  });

  test("login sem o escopo da IA (básico): pede para entrar de novo", async () => {
    zro.estado.recusarEscoposExtras = true;
    try {
      Object.assign(zro.estado.proximo, { pessoa: LIA, adulterar: null, negar: false });
      const ida = await rotas.entrar(pedido("/api/zro/entrar?basico=1"));
      const z = await fetch(new URL(ida.headers.get("location")!), { redirect: "manual" });
      const volta = await rotas.callback(pedido(z.headers.get("location")!.replace(SITE, ""), { cookies: { mae_zro: cookiesDe(ida).get("mae_zro") } }));
      const sessao = cookiesDe(volta).get("mae_sessao")!;
      const r = await ia(sessao, ["estado"]);
      assert.equal(r.status, 401);
      assert.equal((await r.json()).erro, "reconectar_zro");
    } finally {
      zro.estado.recusarEscoposExtras = false;
    }
  });

  test("access token vencido: renova antes de repassar; Absolute ZRO recusou: 401 reconectar e tokens esquecidos", async () => {
    zro.estado.vidaAcesso = 0;
    const sessao = await entrar();
    zro.estado.vidaAcesso = 600;
    const antes = zro.estado.renovacoes;
    assert.equal((await ia(sessao, ["estado"])).status, 200);
    assert.equal(zro.estado.renovacoes, antes + 1);
    zro.estado.recusarRefresh = true;
    zro.estado.vidaAcesso = 0;
    try {
      const outra = await entrar();
      const r = await ia(outra, ["estado"]);
      assert.equal(r.status, 401);
      assert.equal((await r.json()).erro, "reconectar_zro");
    } finally {
      zro.estado.recusarRefresh = false;
      zro.estado.vidaAcesso = 600;
    }
  });

  test("Absolute ZRO fora do ar: 502, sem derrubar a sessão", async () => {
    const sessao = await entrar();
    zro.estado.fora = true;
    try {
      const r = await ia(sessao, ["estado"]);
      assert.equal(r.status, 502);
    } finally {
      zro.estado.fora = false;
    }
    assert.equal((await ia(sessao, ["estado"])).status, 200);
  });
});
