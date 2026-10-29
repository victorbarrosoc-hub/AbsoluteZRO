// Combustível automático (drizzle/0022, lib/orcamento/servicos.ts, GET /api/cron/combustivel), no banco real e com uma
// ANP falsa (tests/anp-fixture.mts, valores inventados): o agendamento só entra com CRON_SECRET, guarda a semana
// (município, estado e Brasil), repetir não duplica, guarda só 8 semanas, ANP fora do ar não apaga nada; a leitura cai
// do município para o estado e para o Brasil; a tabela é de referência (maestro_app só lê, as duas organizações veem o
// mesmo) e a coleta de reserva só roda quando o agendamento atrasou.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { pedido, prepararAmbiente, UUID } from "./ambiente.mts";
import { iniciarAnpFalsa, SEMANA_PADRAO } from "./anp-fixture.mts";

const amb = await prepararAmbiente("combustivel");
const { getBanco, schema, codigoPg, PG } = amb.banco;
const anp = await iniciarAnpFalsa();
process.env.MAESTRO_ANP_URL = anp.pagina;
const servicos = await import("../src/lib/orcamento/servicos");
const rota = await import("../src/app/api/cron/combustivel/route");

const ctxA = { sub: UUID(), orgId: "" };
const ctxB = { sub: UUID(), orgId: "" };
const NATAL = { uf: "RN", cidade: "Natal" };

const contar = async () =>
  Number(
    (
      (await getBanco().asSystem("teste conta", (tx) => tx.execute(sql`select count(*)::int as n from maestro.combustivel_precos`))) as unknown as {
        n: number;
      }[]
    )[0].n,
  );
const semanas = async () =>
  (
    (await getBanco().asSystem("teste semanas", (tx) =>
      tx.execute(sql`select distinct semana::text as s from maestro.combustivel_precos order by 1`),
    )) as unknown as { s: string }[]
  ).map((r) => r.s);
const cron = (segredo?: string) => rota.GET(pedido("/api/cron/combustivel", segredo ? { headers: { authorization: `Bearer ${segredo}` } } : {}));
const erroDe = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e as unknown,
  );

before(async () => {
  await getBanco().asSystem("semente", async (tx) => {
    for (const ctx of [ctxA, ctxB]) {
      const [o] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Produtora" }).returning({ id: schema.organizations.id });
      ctx.orgId = o.id;
      await tx.insert(schema.members).values({ orgId: o.id, zroSub: ctx.sub, role: "equipe" });
    }
  });
});

after(async () => {
  delete process.env.CRON_SECRET;
  delete process.env.MAESTRO_ANP_URL;
  await anp.fechar();
  await amb.fechar();
});

describe("combustível automático", () => {
  test("a antiga cache_combustivel saiu; sem semana guardada, nada (a tela pede o preço à mão)", async () => {
    const [r] = (await getBanco().asSystem("teste", (tx) => tx.execute(sql`select to_regclass('maestro.cache_combustivel') as t`))) as unknown as {
      t: string | null;
    }[];
    assert.equal(r.t, null);
    assert.equal(await servicos.precoDoCombustivel(ctxA, NATAL, "gasolina"), null);
  });

  test("agendamento: sem CRON_SECRET 503, segredo errado 401, nada buscado na ANP", async () => {
    delete process.env.CRON_SECRET;
    assert.equal((await cron("qualquer")).status, 503);
    process.env.CRON_SECRET = "segredo-do-cron-de-teste";
    assert.equal((await cron()).status, 401);
    assert.equal((await cron("errado")).status, 401);
    assert.equal(anp.estado.pedidos.length, 0);
  });

  test("com o segredo: guarda a semana; repetir não duplica", async () => {
    const r = await cron("segredo-do-cron-de-teste");
    assert.equal(r.status, 200);
    const corpo = (await r.json()) as { ok: boolean; semana: string; semanaFim: string; linhas: number; fonte: string };
    assert.deepEqual([corpo.ok, corpo.semana, corpo.semanaFim, corpo.linhas], [true, "2026-10-18", "2026-10-24", 13]);
    assert.match(corpo.fonte, /resumo_semanal_lpc_2026_10_18-2026_10_24\.xlsx$/);
    assert.equal(await contar(), 13);
    assert.equal((await cron("segredo-do-cron-de-teste")).status, 200);
    assert.equal(await contar(), 13);
  });

  test("município, senão estado, senão Brasil; o nome da cidade como a produtora escreveu", async () => {
    assert.deepEqual(await servicos.precoDoCombustivel(ctxA, NATAL, "gasolina"), {
      combustivel: "gasolina",
      litroCents: 649,
      semana: "2026-10-18",
      semanaFim: "2026-10-24",
      postos: 52,
      base: "municipio",
      onde: "Natal/RN",
      fonte: anp.pagina.replace("/pagina", "/arquivos-lpc/resumo_semanal_lpc_2026_10_18-2026_10_24.xlsx"),
    });
    assert.equal((await servicos.precoDoCombustivel(ctxA, NATAL, "etanol"))?.litroCents, 519);
    assert.equal((await servicos.precoDoCombustivel(ctxA, NATAL, "diesel"))?.litroCents, 689);
    // Mossoró: etanol do município; gasolina só do estado.
    const mossoro = { uf: "RN", cidade: "Mossoró" };
    assert.deepEqual(
      [(await servicos.precoDoCombustivel(ctxA, mossoro, "etanol"))?.base, (await servicos.precoDoCombustivel(ctxA, mossoro, "etanol"))?.onde],
      ["municipio", "Mossoró/RN"],
    );
    const est = await servicos.precoDoCombustivel(ctxA, mossoro, "gasolina");
    assert.deepEqual([est?.base, est?.onde, est?.litroCents], ["estado", "RN", 655]);
    assert.equal((await servicos.precoDoCombustivel(ctxA, { uf: "SP", cidade: "Santa Bárbara d'Oeste" }, "gasolina"))?.litroCents, 599);
    // Estado sem a linha (SP diesel) e produtora sem UF: Brasil.
    const sp = await servicos.precoDoCombustivel(ctxA, { uf: "SP", cidade: "São Paulo" }, "diesel");
    assert.deepEqual([sp?.base, sp?.onde, sp?.litroCents], ["brasil", "Brasil", 732]);
    const semLugar = await servicos.precoDoCombustivel(ctxA, { uf: null, cidade: null }, "gasolina");
    assert.deepEqual([semLugar?.base, semLugar?.litroCents], ["brasil", 649]);
    // Cidade de outro estado com o mesmo nome não vale.
    assert.equal((await servicos.precoDoCombustivel(ctxA, { uf: "SP", cidade: "Natal" }, "gasolina"))?.base, "estado");
  });

  test("dado de referência: as duas organizações leem o mesmo; maestro_app não grava, não muda, não apaga", async () => {
    assert.deepEqual(await servicos.precoDoCombustivel(ctxB, NATAL, "gasolina"), await servicos.precoDoCombustivel(ctxA, NATAL, "gasolina"));
    for (const q of [
      sql`insert into maestro.combustivel_precos (semana, semana_fim, uf, combustivel, preco_medio, fonte) values ('2026-10-25', '2026-10-31', 'RN', 'gasolina', 1, 'https://x')`,
      sql`update maestro.combustivel_precos set preco_medio = 1`,
      sql`delete from maestro.combustivel_precos`,
    ]) {
      const e = await erroDe(getBanco().asUser(ctxA, (tx) => tx.execute(q)));
      assert.equal(codigoPg(e), PG.semPrivilegio);
    }
    assert.equal(await contar(), 13);
  });

  test("semana nova vale na hora; ficam só as 8 mais novas", async () => {
    for (let i = 1; i <= 9; i++) {
      anp.estado.semanas = [SEMANA_PADRAO + 7 * i, SEMANA_PADRAO + 7 * (i - 1)];
      const r = await servicos.coletarSemanaAnp();
      assert.equal(r.ok, true);
    }
    const s = await semanas();
    assert.equal(s.length, 8);
    assert.equal(s.at(-1), "2026-12-20");
    assert.equal(s[0], "2026-11-01");
    const natal = await servicos.precoDoCombustivel(ctxA, NATAL, "gasolina");
    assert.equal(natal?.semana, "2026-12-20");
    assert.equal(natal?.litroCents, Math.round(6.493 * (1 + 63 / 700) * 100));
  });

  test("ANP fora do ar: 502 no agendamento e as semanas guardadas continuam", async () => {
    anp.estado.fora = true;
    const r = await cron("segredo-do-cron-de-teste");
    assert.equal(r.status, 502);
    assert.equal(((await r.json()) as { erro: string }).erro, "fonte_indisponivel");
    assert.equal((await semanas()).length, 8);
    assert.equal((await servicos.precoDoCombustivel(ctxA, NATAL, "gasolina"))?.semana, "2026-12-20");
    anp.estado.fora = false;
  });

  test("coleta de reserva: só com a última semana velha, e uma vez por hora", async () => {
    const antes = anp.estado.pedidos.length;
    await servicos.coletarSeAtrasado("2026-12-28"); // semana até 26/12: em dia
    assert.equal(anp.estado.pedidos.length, antes);
    await servicos.coletarSeAtrasado("2027-01-30"); // atrasou: busca
    assert.ok(anp.estado.pedidos.length > antes);
    const depois = anp.estado.pedidos.length;
    await servicos.coletarSeAtrasado("2027-01-30"); // dentro da hora: não busca de novo
    assert.equal(anp.estado.pedidos.length, depois);
  });
});
