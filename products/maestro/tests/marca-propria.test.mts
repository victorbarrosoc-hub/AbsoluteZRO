// "Maestro com a sua marca" (white-label, drizzle/0020, migração 0025 do HUB): a claim zro_features chega no login e na
// releitura e fica na organização; temMarcaPropria liga só com o acesso e o sinal; o acento da produtora com contraste
// garantido no claro e no escuro (fallback para o latão); a marca pública diz `propria` só para a organização com o
// sinal (duas organizações).
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { cookiesDe, pedido, prepararAmbiente, SITE, UUID } from "./ambiente.mts";
import type { PessoaZro } from "./zro-falso.mts";

const amb = await prepararAmbiente("marca_propria");
const { zro, banco } = amb;
const { getBanco, schema } = banco;
const rotas = await import("../src/lib/zro/rotas");
const { autenticar } = await import("../src/lib/auth/sessao");
const { hashToken } = await import("../src/lib/auth/cripto");
const { temMarcaPropria, MARCA_PROPRIA } = await import("../src/lib/auth/acesso");
const { perfilDeClaims } = await import("../src/lib/zro/oidc");
const cor = await import("../src/lib/marca/cor");
const { marcaPropriaDe, estiloDaMarcaPropria, marcaPropriaDaSessao } = await import("../src/lib/marca/propria");
after(() => amb.fechar());

const ORG_A = { id: UUID(), name: "Lumen Filmes", role: "owner" };
const ORG_B = { id: UUID(), name: "Outra Produtora", role: "owner" };
const ANA: PessoaZro = { sub: UUID(), email: "ana@lumen.exemplo", nome: "Ana", org: ORG_A, produtos: ["maestro"], recursos: [MARCA_PROPRIA] };
const BIA: PessoaZro = { sub: UUID(), email: "bia@outra.exemplo", nome: "Bia", org: ORG_B, produtos: ["maestro"] };

async function entrar(pessoa: PessoaZro): Promise<string> {
  Object.assign(zro.estado.proximo, { pessoa, adulterar: null, negar: false });
  const ida = await rotas.entrar(pedido("/api/zro/entrar"));
  const z = await fetch(new URL(ida.headers.get("location")!), { redirect: "manual" });
  const res = await rotas.callback(pedido(z.headers.get("location")!.replace(SITE, ""), { cookies: { mae_zro: cookiesDe(ida).get("mae_zro") } }));
  assert.equal(res.status, 303);
  return cookiesDe(res).get("mae_sessao")!;
}

describe("sinal (puro)", () => {
  test("zro_features: só sinais do Maestro, no formato certo", () => {
    const p = perfilDeClaims({
      sub: UUID(),
      email: "a@b.c",
      zro_features: ["maestro.marca_propria", "sobedesce.algo", "maestro.X", 3, "maestro.outro_sinal"],
    });
    assert.deepEqual(p.recursos, ["maestro.marca_propria", "maestro.outro_sinal"]);
    assert.deepEqual(perfilDeClaims({ sub: UUID(), email: "a@b.c" }).recursos, [], "HUB sem a claim: nada");
  });

  test("temMarcaPropria: precisa do acesso ao Maestro e do sinal", () => {
    const base = { produtos: ["maestro"], release: { maestro: "allowed" } };
    assert.equal(temMarcaPropria({ ...base, recursos: [MARCA_PROPRIA] }), true);
    assert.equal(temMarcaPropria({ ...base, recursos: [] }), false);
    assert.equal(temMarcaPropria({ ...base }), false);
    assert.equal(temMarcaPropria({ ...base, release: { maestro: "closed" }, recursos: [MARCA_PROPRIA] }), false, "fechado é fechado");
    assert.equal(temMarcaPropria({ produtos: [], release: base.release, recursos: [MARCA_PROPRIA] }), false, "o adicional sozinho não abre o Maestro");
  });

  test("acento: 3:1 no claro e no escuro; cor escura clareia no escuro; inválida ou clara demais volta ao latão", () => {
    const azul = cor.acentosDaMarca("#1f6feb")!;
    assert.equal(azul.claro, "#1f6feb");
    assert.ok(cor.contraste(azul.escuro, cor.FUNDO_ESCURO) >= 3);
    const grafite = cor.acentosDaMarca("#1d1d1f")!;
    assert.equal(grafite.claro, "#1d1d1f");
    assert.notEqual(grafite.escuro, "#1d1d1f", "grafite some no escuro: clareia");
    assert.ok(cor.contraste(grafite.escuro, cor.FUNDO_ESCURO) >= 3);
    assert.ok(cor.contraste(grafite.claro, "#ffffff") >= 3);
    assert.equal(cor.acentosDaMarca("#ffe680"), null, "clara demais para o papel");
    assert.equal(cor.acentosDaMarca("vermelho"), null);
    assert.equal(cor.acentosDaMarca(null), null);
    assert.equal(estiloDaMarcaPropria(marcaPropriaDe({ nome: null, logo: null, cor: null }, "Org")), undefined, "sem cor: sem variáveis");
    assert.deepEqual(marcaPropriaDe({ nome: "  ", logo: null, cor: "#1f6feb" }, "Org").nome, "Org");
  });
});

describe("login, releitura e duas organizações", () => {
  test("o sinal chega no login, fica na organização e sai na releitura quando o HUB tira", async () => {
    const sa = await entrar(ANA);
    const sb = await entrar(BIA);
    const a = (await autenticar(sa))!;
    const b = (await autenticar(sb))!;
    assert.deepEqual(a.recursos, [MARCA_PROPRIA]);
    assert.equal(temMarcaPropria(a), true);
    assert.deepEqual(b.recursos, []);
    assert.equal(temMarcaPropria(b), false);
    assert.equal(await marcaPropriaDaSessao(b), null);
    const m = await marcaPropriaDaSessao(a);
    assert.equal(m?.nome, "Lumen Filmes");

    // marca pública (páginas do cliente): `propria` só para a A
    const publica = async (org: string) =>
      (
        (await getBanco().asSystem("teste", (tx) => tx.execute(sql`select maestro.marca_publica(${org}::uuid) as r`))) as unknown as {
          r: { propria: boolean };
        }[]
      )[0].r;
    assert.equal((await publica(a.orgId)).propria, true);
    assert.equal((await publica(b.orgId)).propria, false);

    // o HUB tira o sinal (adicional cancelado): a releitura do /eu apaga
    zro.contas.set(ANA.sub, { ...ANA, recursos: [] });
    await getBanco().asSystem("teste", (tx) =>
      tx
        .update(schema.sessions)
        .set({ perfilLidoEm: new Date(Date.now() - 120_000) })
        .where(eq(schema.sessions.tokenHash, hashToken(sa))),
    );
    const r = await rotas.eu(pedido("/api/zro/eu", { cookies: { mae_sessao: sa } }));
    assert.equal(r.status, 200);
    const depois = (await autenticar(sa))!;
    assert.deepEqual(depois.recursos, []);
    assert.equal(temMarcaPropria(depois), false);
    assert.equal((await publica(a.orgId)).propria, false);
  });
});
