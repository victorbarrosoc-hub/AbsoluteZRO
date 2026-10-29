// O repasse do Set (/api/zro/set/*, ADR 0031 do HUB): só os caminhos da API do Set, o Bearer da sessão com zro.set
// (nunca devolvido ao navegador), parâmetros de leitura filtrados, nega sem sessão, sem o escopo e de outra origem, e um
// 401 do Set não apaga os tokens da sessão (a Z continua).
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { cookiesDe, pedido, prepararAmbiente, SITE, UUID } from "./ambiente.mts";
import type { PessoaZro } from "./zro-falso.mts";

const amb = await prepararAmbiente("set");
const { zro } = amb;
const rotas = await import("../src/lib/zro/rotas");
const { repassarSet, caminhoSet } = await import("../src/lib/zro/set");
const { repassarIa } = await import("../src/lib/zro/ia");

const ORG = { id: UUID(), name: "Produtora Set", role: "owner" };
const LIA: PessoaZro = { sub: UUID(), email: "lia@set.exemplo", nome: "Lia Set", org: ORG, produtos: ["maestro"] };

after(() => amb.fechar());

async function entrar(caminho = "/api/zro/entrar"): Promise<string> {
  Object.assign(zro.estado.proximo, { pessoa: LIA, adulterar: null, negar: false });
  const ida = await rotas.entrar(pedido(caminho));
  const z = await fetch(new URL(ida.headers.get("location")!), { redirect: "manual" });
  const volta = await rotas.callback(pedido(z.headers.get("location")!.replace(SITE, ""), { cookies: { mae_zro: cookiesDe(ida).get("mae_zro") } }));
  return cookiesDe(volta).get("mae_sessao")!;
}

const set = (sessao: string | undefined, partes: string[], p: NonNullable<Parameters<typeof pedido>[1]> & { busca?: string } = {}) =>
  repassarSet(pedido(`/api/zro/set${partes.length ? `/${partes.join("/")}` : ""}${p.busca ?? ""}`, { cookies: { mae_sessao: sessao }, ...p }), partes);

describe("repasse do Set", () => {
  const id = UUID();
  test("só os caminhos e métodos da API do Set", () => {
    assert.equal(caminhoSet([], "GET"), "");
    assert.equal(caminhoSet([], "POST"), "");
    assert.equal(caminhoSet([], "DELETE"), null);
    assert.equal(caminhoSet(["preferencias"], "PUT"), "preferencias");
    assert.equal(caminhoSet(["contatos", id], "PUT"), `contatos/${id}`);
    assert.equal(caminhoSet(["contatos", "../x"], "PUT"), null);
    assert.equal(caminhoSet(["conversas", id, "mensagens"], "POST"), `conversas/${id}/mensagens`);
    assert.equal(caminhoSet(["conversas", id, "mensagens"], "GET"), null);
    assert.equal(caminhoSet(["mensagens", id], "DELETE"), `mensagens/${id}`);
    assert.equal(caminhoSet(["denuncias"], "POST"), "denuncias");
    assert.equal(caminhoSet(["admin"], "GET"), null);
    assert.equal(caminhoSet(["conversas", id, "mensagens", "x"], "POST"), null);
  });

  test("leva o Bearer com zro.set, filtra a busca e não vaza o token", async () => {
    const sessao = await entrar();
    zro.estado.pedidosSet.length = 0;
    const r = await set(sessao, [], { method: "POST", corpo: { estado: "ativo" } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const texto = await r.text();
    assert.ok(!/zat_|zrt_/.test(texto), "o token não vai ao navegador");
    assert.match(zro.estado.pedidosSet[0]!.autorizacao ?? "", /^Bearer zat_/);
    assert.equal(zro.estado.pedidosSet[0]!.corpo, '{"estado":"ativo"}');
    await set(sessao, ["conversas", id], { busca: "?depois=12&limite=30&x=<script>&antes=abc" });
    assert.equal(zro.estado.pedidosSet[1]!.caminho, `conversas/${id}?depois=12&limite=30`);
    assert.equal((await set(sessao, ["mensagens", id], { method: "DELETE" })).status, 204);
  });

  test("nega sem sessão, caminho fora da lista, outra origem e corpo que não é JSON", async () => {
    assert.equal((await set(undefined, [])).status, 401);
    const sessao = await entrar();
    assert.equal((await set(sessao, ["admin"])).status, 404);
    assert.equal((await set(sessao, [], { method: "POST", corpo: { estado: "ativo" }, origin: "https://mal.exemplo" })).status, 403);
  });

  test("login sem o zro.set (Absolute ZRO antiga): 401 reconectar, e a Z continua com os mesmos tokens", async () => {
    zro.estado.recusarSet = true;
    let sessao: string;
    try {
      Object.assign(zro.estado.proximo, { pessoa: LIA, adulterar: null, negar: false });
      const ida = await rotas.entrar(pedido("/api/zro/entrar?nivel=sem_set"));
      const z = await fetch(new URL(ida.headers.get("location")!), { redirect: "manual" });
      const volta = await rotas.callback(pedido(z.headers.get("location")!.replace(SITE, ""), { cookies: { mae_zro: cookiesDe(ida).get("mae_zro") } }));
      sessao = cookiesDe(volta).get("mae_sessao")!;
    } finally {
      zro.estado.recusarSet = false;
    }
    zro.estado.pedidosSet.length = 0;
    const r = await set(sessao, []);
    assert.equal(r.status, 401);
    assert.equal((await r.json()).erro, "reconectar_zro");
    assert.equal(zro.estado.pedidosSet.length, 0, "nem chega à Absolute ZRO");
    const z = await repassarIa(pedido("/api/zro/ia/estado", { cookies: { mae_sessao: sessao } }), ["estado"]);
    assert.equal(z.status, 200);
  });
});
