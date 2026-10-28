// Números do negócio (Financeiro → Números, drizzle/0015): as fórmulas (taxa, ticket médio, margem, meta do período,
// ritmo, período) e a leitura no banco com dados conhecidos; metas só para administração e gestão, duas organizações.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("numeros");
const { getBanco, codigoPg } = amb.banco;
const fx = await import("../src/lib/numeros/formulas");
const nm = await import("../src/lib/numeros/servidor");
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;
const HOJE = "2026-11-15";

describe("fórmulas", () => {
  test("taxa, ticket e margem", () => {
    assert.equal(fx.taxa(1, 4), 0.25);
    assert.equal(fx.taxa(3, 0), null);
    assert.equal(fx.taxa(5, 4), 1);
    assert.equal(fx.ticketMedio([100, 200, 0, Number.NaN]), 150);
    assert.equal(fx.ticketMedio([]), null);
    assert.equal(fx.margem(1000, 600), 0.4);
    assert.equal(fx.margem(1000, 1500), -0.5);
    assert.equal(fx.margem(0, 100), null);
  });
  test("período, meta e ritmo", () => {
    assert.deepEqual(fx.periodoDe("mes", "2026-02", HOJE), { tipo: "mes", de: "2026-02-01", ate: "2026-02-28", mes: "2026-02", rotulo: "fev 2026" });
    const t = fx.periodoDe("tri", "2026-01", HOJE);
    assert.equal(t.de, "2025-11-01");
    assert.equal(t.ate, "2026-01-31");
    assert.deepEqual(fx.mesesDoPeriodo(t), ["2025-11", "2025-12", "2026-01"]);
    assert.equal(fx.periodoDe("ano", "x", HOJE).de, "2026-01-01");
    assert.equal(fx.periodoDe("zzz", null, HOJE).mes, "2026-11");
    assert.equal(fx.metaDoPeriodo({ "2025-11": 100, "2026-01": 50 }, ["2025-11", "2025-12", "2026-01"]), 150);
    assert.equal(fx.metaDoPeriodo({}, ["2026-01"]), null);
    assert.equal(fx.progressoMeta(150, 100), 1.5);
    assert.equal(fx.progressoMeta(10, null), null);
    assert.equal(fx.ritmoEsperado("2026-11", HOJE), 0.5);
    assert.equal(fx.ritmoEsperado("2026-10", HOJE), 1);
    assert.equal(fx.ritmoEsperado("2026-12", HOJE), 0);
    const t5 = fx.topo(
      [
        { nome: "a", valor: 1 },
        { nome: "b", valor: 5 },
        { nome: "c", valor: 3 },
      ],
      2,
    );
    assert.deepEqual(
      t5.map((x) => [x.nome, x.valor]),
      [
        ["b", 5],
        ["Outros", 4],
      ],
    );
  });
});

describe("no banco", () => {
  before(async () => {
    o = await duasOrganizacoes();
    await getBanco().asSystem("semente", async (tx) => {
      const A = o.orgA;
      const um = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { id: string }[])[0].id;
      const c1 = await um(sql`insert into maestro.clients (org_id, name) values (${A}, 'Café') returning id`);
      const c2 = await um(sql`insert into maestro.clients (org_id, name) values (${A}, 'Moda') returning id`);
      const p1 = await um(sql`insert into maestro.projects (org_id, code, title, client_id) values (${A}, 'MAE-2026-001', 'Filme', ${c1}) returning id`);
      await tx.execute(sql`insert into maestro.precos_variaveis (org_id, chave, rotulo, tipo, opcoes) values (${A}, 'nicho', 'Nicho', 'escolha',
        '[{"valor":"gastro","rotulo":"Gastronomia"},{"valor":"moda","rotulo":"Moda"}]'::jsonb)`);
      const lanc = (tipo: string, v: number, venc: string, projeto: string | null, cliente: string | null) =>
        um(sql`insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento, projeto_id, cliente_id)
               values (${A}, ${tipo}, ${tipo === "entrada" ? "cliente" : "freela"}, 'x', ${v}, ${venc}, ${projeto}, ${cliente}) returning id`);
      const e1 = await lanc("entrada", 600000, "2026-11-05", p1, null);
      await lanc("saida", 200000, "2026-11-08", p1, null);
      await lanc("entrada", 400000, "2026-11-20", null, c2);
      await lanc("entrada", 999900, "2026-10-10", null, c2);
      await tx.execute(sql`insert into maestro.baixas (org_id, lancamento_id, valor_cents, data) values (${A}, ${e1}, 300000, '2026-11-06')`);
      // pedidos: 4 em novembro; 1 com orçamento aprovado. Fechados no período: 1 ganho, 2 perdidos.
      const ped = (prot: string) =>
        um(
          sql`insert into maestro.pedidos (org_id, protocolo, nome, email, consentimento_em, created_at) values (${A}, ${prot}, 'Nome', 'n@x.com', now(), '2026-11-03') returning id`,
        );
      const pa = await ped("NUM00001");
      const pb = await ped("NUM00002");
      const pc = await ped("NUM00003");
      await ped("NUM00004");
      const q1 = await um(sql`insert into maestro.orcamentos (org_id, numero, titulo, status, pedido_id, respostas, decidido_em, cliente_id)
        values (${A}, '2026-001', 'A', 'enviado', ${pa}, '{"nicho":"gastro"}'::jsonb, '2026-11-09', ${c1}) returning id`);
      await tx.execute(
        sql`insert into maestro.orcamento_itens (org_id, orcamento_id, descricao, quantidade, preco_cents) values (${A}, ${q1}, 'x', 2, 300000)`,
      );
      const q2 = await um(sql`insert into maestro.orcamentos (org_id, numero, titulo, status, respostas, decidido_em, desconto_cents)
        values (${A}, '2026-002', 'B', 'aprovado', '{"nicho":"moda"}'::jsonb, '2026-11-12', 100000) returning id`);
      await tx.execute(
        sql`insert into maestro.orcamento_itens (org_id, orcamento_id, descricao, quantidade, preco_cents) values (${A}, ${q2}, 'x', 1, 500000)`,
      );
      await tx.execute(sql`update maestro.pedidos set orcamento_id = ${q1}, status = 'em_orcamento' where id = ${pa}`);
      await tx.execute(sql`update maestro.orcamentos set status = 'aprovado' where id = ${q1}`);
      await tx.execute(sql`update maestro.pedidos set etapa = 'perdido', motivo_perda = 'Preço' where id in (${pb}, ${pc})`);
      await tx.execute(sql`update maestro.pedidos set etapa_em = '2026-11-10' where id in (${pa}, ${pb}, ${pc})`);
      await tx.execute(
        sql`insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento) values (${o.orgB}, 'entrada', 'cliente', 'B', 777, '2026-11-02')`,
      );
    });
  });
  after(() => amb.fechar());

  test("meta: admin e gestão gravam; equipe e leitura não; a outra organização não vê", async () => {
    assert.equal((await nm.salvarMeta(o.gestor, "2026-11", 2_000_000)).ok, true);
    assert.equal((await nm.salvarMeta(o.equipe, "2026-11", 1)).ok, false);
    assert.equal((await nm.salvarMeta(o.leitura, "2026-11", 1)).ok, false);
    assert.equal((await nm.salvarMeta(o.admin, "2026-13", 1)).ok, false);
    assert.equal(await nm.metaDoMes(o.b, "2026-11"), null);
    assert.equal(await nm.metaDoMes(o.equipe, "2026-11"), null, "o banco esconde a meta da equipe");
    assert.deepEqual(await nm.metaDoMes(o.admin, "2026-11"), { meta: 2_000_000, faturado: 1_000_000 });
    await assert.rejects(
      getBanco().asUser(o.b, (tx) => tx.execute(sql`insert into maestro.metas (org_id, mes, receita_cents) values (${o.orgA}, '2026-12', 1)`)),
      (e) => codigoPg(e) === "42501",
    );
  });

  test("os números de novembro", async () => {
    const r = await nm.numerosDoNegocio(o.admin, fx.periodoDe("mes", "2026-11", HOJE));
    assert.equal(r.faturado, 1_000_000);
    assert.equal(r.despesas, 200_000);
    assert.equal(r.recebido, 300_000);
    assert.equal(r.meta, 2_000_000);
    assert.equal(r.progresso, 0.5);
    assert.equal(r.aprovados, 2);
    assert.equal(r.ticket, 500_000, "(600 mil + 400 mil) ÷ 2");
    assert.equal(r.pedidos, 4);
    assert.equal(r.pedidosConvertidos, 1);
    assert.equal(r.conversao, 0.25);
    assert.deepEqual([r.ganhos, r.perdidos], [1, 2]);
    assert.equal(r.taxaGanho, 1 / 3);
    assert.deepEqual(r.motivosPerda, [{ nome: "Preço", valor: 2 }]);
    assert.deepEqual(
      r.projetos.map((p) => [p.nome, p.entradas, p.saidas, p.margem]),
      [["Filme", 600_000, 200_000, 2 / 3]],
    );
    assert.deepEqual(
      r.clientes.map((c) => [c.nome, c.entradas]),
      [
        ["Café", 600_000],
        ["Moda", 400_000],
      ],
    );
    assert.deepEqual(r.nichos, [
      { nome: "Gastronomia", valor: 600_000 },
      { nome: "Moda", valor: 400_000 },
    ]);
    assert.equal(r.serie.length, 6);
    assert.deepEqual(r.serie.at(-1), { mes: "2026-11", faturado: 1_000_000, meta: 2_000_000 });
    assert.equal(r.serie.at(-2)?.faturado, 999_900);
  });

  test("equipe e outra organização: nada de dinheiro", async () => {
    const e = await nm.numerosDoNegocio(o.equipe, fx.periodoDe("mes", "2026-11", HOJE));
    assert.equal(e.faturado, 0);
    assert.equal(e.meta, null);
    const b = await nm.numerosDoNegocio(o.b, fx.periodoDe("mes", "2026-11", HOJE));
    assert.equal(b.faturado, 777);
    assert.equal(b.pedidos, 0);
    assert.equal(b.aprovados, 0);
  });
});
