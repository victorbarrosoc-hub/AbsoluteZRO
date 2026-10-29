// O resumo do dia para a Z (só leitura, ligado: ver_maestro da Z do HUB): o pedido assinado pela Absolute ZRO é conferido
// (typ, assinatura, aud, ação, vida e uso único), a pessoa precisa ter acesso no último login, tudo é lido como ela
// (dinheiro só para gestão; acesso por cliente vale), com fonte e hora.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { CLIENTE, pedido, prepararAmbiente, UUID } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("resumo_z");
const { getBanco } = amb.banco;
const { rotaResumoDaZ, ACAO_RESUMO } = await import("../src/lib/zro/resumo-da-z");
const { ACOES_ABERTAS, conferirPedidoZro, PedidoRecusado } = await import("../src/lib/zro/pedido");
const pessoas = await import("../src/lib/pessoas");
const { hojeBr } = await import("../src/lib/dinheiro");
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;
let cafe = "";

const chamar = (token: string | null) =>
  rotaResumoDaZ(pedido("/api/zro/maestro/resumo", { method: "POST", origin: null, headers: token ? { authorization: `Bearer ${token}` } : {} }));
const assinar = (sub: string, extra: Partial<{ acao: string; aud: string; jti: string; vida: number }> = {}, errado = false) =>
  amb.zro.assinarPedido({ sub, aud: extra.aud ?? CLIENTE.clientId, acao: extra.acao ?? ACAO_RESUMO, jti: extra.jti, vida: extra.vida }, errado);

before(async () => {
  o = await duasOrganizacoes();
  const hoje = hojeBr();
  await getBanco().asSystem("semente", async (tx) => {
    const A = o.orgA;
    const um = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { id: string }[])[0].id;
    cafe = await um(sql`insert into maestro.clients (org_id, name, proximo_contato) values (${A}, 'Café', ${hoje}) returning id`);
    await um(sql`insert into maestro.clients (org_id, name, proximo_contato) values (${A}, 'Moda', ${hoje}) returning id`);
    await tx.execute(sql`insert into maestro.metas (org_id, mes, receita_cents) values (${A}, ${hoje.slice(0, 7)}, 500000)`);
    for (const [sub, org, release] of [
      [o.ANA, A, { maestro: "allowed" }],
      [o.equipe.sub, A, { maestro: "allowed" }],
      [o.leitura.sub, A, { maestro: "closed" }],
    ] as const)
      await tx.execute(sql`
        insert into maestro.sessions (org_id, zro_sub, token_hash, produtos, zro_release, expires_at)
        values (${org}, ${sub}, ${createHash("sha256").update(UUID()).digest("hex")}, '{maestro}', ${JSON.stringify(release)}::jsonb, now() + interval '1 day')`);
  });
  await pessoas.salvarAcesso(o.admin, o.equipe.sub, true, [cafe]);
});
after(() => amb.fechar());

describe("resumo do dia para a Z", () => {
  test("gestão: retornos, contagens e dinheiro, com fonte e hora", async () => {
    const r = await chamar(assinar(o.ANA));
    assert.equal(r.status, 200);
    const d = (await r.json()) as Record<string, unknown> & { retornar_hoje: { nome: string }[]; dinheiro: { meta_do_mes: number } | null };
    assert.equal(d.fonte, "Maestro");
    assert.equal(d.organizacao, "Produtora A");
    assert.match(String(d.gerado_em), /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(d.retornar_hoje.map((x) => x.nome).sort(), ["Café", "Moda"]);
    assert.equal(d.dinheiro?.meta_do_mes, 500000);
  });

  test("equipe restrita: só o cliente dela e nada de dinheiro", async () => {
    const r = await chamar(assinar(o.equipe.sub));
    const d = (await r.json()) as { retornar_hoje: { nome: string }[]; dinheiro: unknown };
    assert.deepEqual(
      d.retornar_hoje.map((x) => x.nome),
      ["Café"],
    );
    assert.equal(d.dinheiro, null);
  });

  test("pedido inválido: sem token, assinatura errada, outra ação, outro app, vida longa e reapresentado", async () => {
    assert.equal((await chamar(null)).status, 401);
    assert.equal((await chamar(assinar(o.ANA, {}, true))).status, 401);
    assert.equal((await chamar(assinar(o.ANA, { acao: "drive.buscar" }))).status, 401);
    assert.equal((await chamar(assinar(o.ANA, { aud: "sobedesce-web" }))).status, 401);
    assert.equal((await chamar(assinar(o.ANA, { vida: 600 }))).status, 401);
    const uma = assinar(o.ANA, { jti: "jti-unico-123456" });
    assert.equal((await chamar(uma)).status, 200);
    assert.equal((await chamar(uma)).status, 401, "uso único");
  });

  test("o pedido como o HUB assina (jti uuid, 60 s, aud maestro-web): aceito uma vez", async () => {
    const t = assinar(o.ANA, { jti: randomUUID() });
    const r = await chamar(t);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control")?.includes("no-store"), true);
    assert.equal((await chamar(t)).status, 401, "o mesmo jti não serve de novo");
  });

  test("só a leitura do dia está aberta: ação de escrita é recusada mesmo assinada para ela", async () => {
    assert.deepEqual([...ACOES_ABERTAS], [ACAO_RESUMO]);
    const escrita = assinar(o.ANA, { acao: "maestro.pedido.criar" });
    await assert.rejects(conferirPedidoZro(`Bearer ${escrita}`, "maestro.pedido.criar"), (e) => e instanceof PedidoRecusado && e.motivo === "ação fechada");
    assert.equal((await chamar(assinar(o.ANA, { acao: "maestro.pedido.criar" }))).status, 401);
  });

  test("sem acesso ao Maestro, de fora ou sem login: 404 neutro", async () => {
    assert.equal((await chamar(assinar(o.leitura.sub))).status, 404, "Maestro fechado no último login");
    assert.equal((await chamar(assinar(UUID()))).status, 404, "nunca entrou");
    assert.equal((await chamar(assinar(o.BIA))).status, 404, "sem sessão");
  });
});
