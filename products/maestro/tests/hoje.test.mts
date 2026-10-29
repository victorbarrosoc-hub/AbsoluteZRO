// "Hoje" (fase 19): as contagens do dia por organização (agenda, cards que vencem, quem espera o cliente, pedidos,
// orçamentos aguardando, a receber e a pagar da semana e o caixa). A outra organização vê zero; o dinheiro só para
// administração e gestão (e o banco esconde mesmo se a tela pedir).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("hoje");
const { getBanco } = amb.banco;
const { resumoDoDia } = await import("../src/lib/hoje");
const { somarDias } = await import("../src/lib/dinheiro");
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;
const HOJE = "2026-11-10";

before(async () => {
  o = await duasOrganizacoes();
  await getBanco().asSystem("semente", async (tx) => {
    const A = o.orgA;
    const um = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { id: string }[])[0].id;
    const cli = await um(sql`insert into maestro.clients (org_id, name) values (${A}, 'Cliente') returning id`);
    await tx.execute(
      sql`insert into maestro.eventos (org_id, titulo, data) values (${A}, 'Diária hoje', ${HOJE}), (${A}, 'Diária de 3 dias', ${somarDias(HOJE, -1)})`,
    );
    await tx.execute(sql`update maestro.eventos set data_fim = ${somarDias(HOJE, 1)} where titulo = 'Diária de 3 dias'`);
    await tx.execute(
      sql`insert into maestro.eventos (org_id, titulo, data) values (${A}, 'Reunião', ${somarDias(HOJE, 3)}), (${A}, 'Longe', ${somarDias(HOJE, 30)})`,
    );
    const card = (id: string, coluna: string, prazo: string, resp: string | null = null) =>
      tx.execute(
        sql`insert into maestro.cards (org_id, id, dados) values (${A}, ${id}, ${JSON.stringify({ tema: id, coluna, prazo, ...(resp ? { resp } : {}) })}::jsonb)`,
      );
    await card("card-hoje", "fazendo", HOJE, o.ANA);
    await card("card-atrasado", "afazer", somarDias(HOJE, -2));
    await card("card-amanha", "fazendo", somarDias(HOJE, 1));
    await card("card-entregue", "entregue", somarDias(HOJE, -5));
    await card("card-aprov", "aprovacao", somarDias(HOJE, -5));
    const lote = await um(sql`insert into maestro.lotes (org_id, client_id, title, status) values (${A}, ${cli}, 'Lote', 'enviado') returning id`);
    await tx.execute(sql`insert into maestro.lote_cards (lote_id, org_id, card_id) values (${lote}, ${A}, 'card-aprov')`);
    await tx.execute(
      sql`insert into maestro.approval_links (org_id, client_id, kind, lote_id, token_hash) values (${A}, ${cli}, 'lote', ${lote}, ${"a".repeat(64)})`,
    );
    await tx.execute(sql`
      insert into maestro.pedidos (org_id, protocolo, nome, email, consentimento_em, status) values
        (${A}, 'AAAA1111', 'Um', 'um@exemplo.com', now(), 'novo'), (${A}, 'AAAA2222', 'Dois', 'dois@exemplo.com', now(), 'novo'),
        (${A}, 'AAAA3333', 'Três', 'tres@exemplo.com', now(), 'em_orcamento')`);
    const q1 = await um(
      sql`insert into maestro.orcamentos (org_id, numero, titulo, status, validade) values (${A}, '2026-001', 'Aguardando', 'enviado', ${somarDias(HOJE, 5)}) returning id`,
    );
    await tx.execute(sql`insert into maestro.orcamento_itens (org_id, orcamento_id, descricao, quantidade, preco_cents) values (${A}, ${q1}, 'x', 2, 50000)`);
    await tx.execute(sql`update maestro.orcamentos set retorno = '{"tipo":"ajuste"}'::jsonb where id = ${q1}`);
    await tx.execute(
      sql`insert into maestro.orcamentos (org_id, numero, titulo, status, validade) values (${A}, '2026-002', 'Vencido', 'enviado', ${somarDias(HOJE, -1)})`,
    );
    await tx.execute(sql`insert into maestro.orcamentos (org_id, numero, titulo, status) values (${A}, '2026-003', 'Rascunho', 'rascunho')`);
    const lanc = (tipo: string, valor: number, venc: string) =>
      um(
        sql`insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento) values (${A}, ${tipo}, ${tipo === "entrada" ? "cliente" : "fixo"}, 'x', ${valor}, ${venc}) returning id`,
      );
    await lanc("entrada", 100000, somarDias(HOJE, 2));
    await lanc("entrada", 30000, somarDias(HOJE, -3));
    await lanc("entrada", 999999, somarDias(HOJE, 20));
    await lanc("saida", 40000, HOJE);
    const pago = await lanc("entrada", 200000, somarDias(HOJE, -10));
    await tx.execute(sql`insert into maestro.baixas (org_id, lancamento_id, valor_cents) values (${A}, ${pago}, 200000)`);
    const saidaPaga = await lanc("saida", 50000, somarDias(HOJE, -10));
    await tx.execute(sql`insert into maestro.baixas (org_id, lancamento_id, valor_cents) values (${A}, ${saidaPaga}, 50000)`);
    // Caixa da semana (segunda 09/11 a domingo 15/11): entrou 300 na terça, saiu 120 na quarta (hoje).
    const recebida = await lanc("entrada", 30000, somarDias(HOJE, -1));
    await tx.execute(sql`insert into maestro.baixas (org_id, lancamento_id, valor_cents, data) values (${A}, ${recebida}, 30000, ${somarDias(HOJE, -1)})`);
    const paga = await lanc("saida", 12000, HOJE);
    await tx.execute(sql`insert into maestro.baixas (org_id, lancamento_id, valor_cents, data) values (${A}, ${paga}, 12000, ${HOJE})`);
    await tx.execute(sql`update maestro.pedidos set proximo_contato = ${somarDias(HOJE, -1)}, proximo_nota = 'Ligar' where protocolo = 'AAAA1111'`);
    await tx.execute(sql`update maestro.clients set proximo_contato = ${HOJE} where id = ${cli}`);
    await tx.execute(sql`update maestro.pedidos set proximo_contato = ${somarDias(HOJE, 3)} where protocolo = 'AAAA2222'`);
  });
});
after(() => amb.fechar());

describe("Hoje", () => {
  test("as contagens da A", async () => {
    const r = await resumoDoDia(o.admin, true, HOJE);
    assert.deepEqual(r.agenda.hoje.map((e) => e.titulo).sort(), ["Diária de 3 dias", "Diária hoje"]);
    assert.equal(r.agenda.semana, 1);
    assert.deepEqual(r.cards, { vencemHoje: 1, atrasados: 1, meus: 1 });
    assert.deepEqual(r.cliente, { lotes: 1, pecas: 1 });
    assert.equal(r.pedidosNovos, 2);
    assert.deepEqual(r.orcamentos, { aguardando: 1, comAjuste: 1, valor: 100000 });
    assert.deepEqual(r.dinheiro, {
      receberSemana: { n: 1, valor: 100000 },
      receberAtrasado: { n: 1, valor: 30000 },
      pagarSemana: { n: 1, valor: 40000 },
      pagarAtrasado: { n: 0, valor: 0 },
      caixa: 168000,
    });
  });

  test("as listas do dia: vencendo, com o cliente, retornar hoje e o caixa da semana", async () => {
    const r = await resumoDoDia(o.admin, true, HOJE);
    assert.deepEqual(
      r.vencendo.map((k) => k.id),
      ["card-atrasado", "card-hoje", "card-amanha"],
    );
    assert.deepEqual(
      r.comCliente.map((k) => k.id),
      ["card-aprov"],
    );
    assert.deepEqual(
      r.retornos.map((x) => [x.alvo, x.nome, x.data]),
      [
        ["pedido", "Um", somarDias(HOJE, -1)],
        ["cliente", "Cliente", HOJE],
      ],
    );
    assert.equal(r.semana?.length, 7);
    assert.equal(r.semana?.[0].dia, "2026-11-09", "começa na segunda");
    assert.deepEqual(
      r.semana?.map((d) => [d.entrou, d.saiu]),
      [
        [30000, 0],
        [0, 12000],
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ],
    );
    const e = await resumoDoDia(o.equipe, false, HOJE);
    assert.equal(e.semana, null, "a equipe não vê o caixa");
    assert.equal(e.retornos.length, 2, "retornos a equipe vê");
  });

  test("a B e a forjada veem zero", async () => {
    for (const ctx of [o.b, o.forjado]) {
      const r = await resumoDoDia(ctx, true, HOJE);
      assert.equal(r.agenda.hoje.length, 0);
      assert.deepEqual(r.cards, { vencemHoje: 0, atrasados: 0, meus: 0 });
      assert.deepEqual(r.cliente, { lotes: 0, pecas: 0 });
      assert.equal(r.pedidosNovos, 0);
      assert.equal(r.orcamentos.aguardando, 0);
      assert.equal(r.dinheiro?.caixa, 0);
      assert.equal(r.vencendo.length + r.comCliente.length + r.retornos.length, 0);
    }
  });

  test("dinheiro: a tela não pede para a equipe, e o banco esconde mesmo se pedir", async () => {
    assert.equal((await resumoDoDia(o.equipe, false, HOJE)).dinheiro, null);
    const forcado = await resumoDoDia(o.equipe, true, HOJE);
    assert.equal(forcado.dinheiro?.caixa, 0);
    assert.equal(forcado.dinheiro?.receberSemana.n, 0);
    assert.equal(forcado.pedidosNovos, 2, "pedidos a equipe vê");
  });
});
