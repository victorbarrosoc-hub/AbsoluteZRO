// Isolamento das tabelas da produtora (drizzle/0006–0010): toda tabela tem a linha da organização A visível só para
// quem é da A; organização forjada não vê nada; não dá para gravar na outra organização trocando o org_id nem apontar
// para a linha dela (chave composta); dinheiro e dados de pagamento só para administração e gestão; leitura não escreve.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("produtora_rls");
const { getBanco, codigoPg, PG } = amb.banco;
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;

const TODAS = [
  "precos_itens",
  "precos_faixas",
  "precos_variaveis",
  "orcamento_modelos",
  "orcamentos",
  "orcamento_itens",
  "freelas",
  "freela_valores",
  "freela_pagamento",
  "eventos",
  "escalas",
  "lancamentos",
  "baixas",
  "recorrencias",
  "recorrencia_execucoes",
  "equipamentos",
  "reservas",
  "documentos",
  "org_marca",
  "links_publicos",
  "pedidos",
  "freela_equipamentos",
  "escala_equipamentos",
] as const;
const SO_GESTAO = ["freela_pagamento", "lancamentos", "baixas", "recorrencias", "recorrencia_execucoes", "links_publicos"];

const ids: Record<string, string> = {};

before(async () => {
  o = await duasOrganizacoes();
  await getBanco().asSystem("semente da produtora", async (tx) => {
    const um = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { id: string }[])[0]?.id;
    const A = o.orgA;
    ids.cliente = await um(sql`insert into maestro.clients (org_id, name) values (${A}, 'Cliente A') returning id`);
    ids.projeto = await um(
      sql`insert into maestro.projects (org_id, code, title, client_id) values (${A}, 'MAE-2026-001', 'Projeto A', ${ids.cliente}) returning id`,
    );
    ids.item = await um(sql`insert into maestro.precos_itens (org_id, nome, preco_cents) values (${A}, 'Diária', 100) returning id`);
    await tx.execute(sql`insert into maestro.precos_faixas (org_id, item_id, a_partir_de, preco_cents) values (${A}, ${ids.item}, 3, 90)`);
    await tx.execute(sql`insert into maestro.precos_variaveis (org_id, chave, rotulo, tipo) values (${A}, 'nicho', 'Nicho', 'escolha')`);
    await tx.execute(sql`insert into maestro.orcamento_modelos (org_id, nome) values (${A}, 'Modelo')`);
    ids.orc = await um(
      sql`insert into maestro.orcamentos (org_id, numero, titulo, cliente_id) values (${A}, '2026-001', 'Orçamento A', ${ids.cliente}) returning id`,
    );
    await tx.execute(sql`insert into maestro.orcamento_itens (org_id, orcamento_id, descricao, preco_cents) values (${A}, ${ids.orc}, 'Linha', 100)`);
    ids.freela = await um(sql`insert into maestro.freelas (org_id, nome) values (${A}, 'Freela A') returning id`);
    await tx.execute(sql`insert into maestro.freela_valores (org_id, freela_id, funcao, valor_cents) values (${A}, ${ids.freela}, 'edicao', 100)`);
    await tx.execute(sql`insert into maestro.freela_pagamento (org_id, freela_id, pix_tipo) values (${A}, ${ids.freela}, 'aleatoria')`);
    ids.evento = await um(
      sql`insert into maestro.eventos (org_id, titulo, data, projeto_id) values (${A}, 'Diária A', '2026-11-01', ${ids.projeto}) returning id`,
    );
    ids.escala = await um(
      sql`insert into maestro.escalas (org_id, projeto_id, evento_id, freela_id, funcao, inicio, fim, valor_cents) values (${A}, ${ids.projeto}, ${ids.evento}, ${ids.freela}, 'edicao', '2026-11-01', '2026-11-01', 100) returning id`,
    );
    ids.rec = await um(
      sql`insert into maestro.recorrencias (org_id, tipo, categoria, descricao, valor_cents, inicio_mes) values (${A}, 'saida', 'fixo', 'Aluguel', 100, '2026-10') returning id`,
    );
    ids.lanc = await um(
      sql`insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento, recorrencia_id) values (${A}, 'saida', 'fixo', 'Aluguel', 100, '2026-10-05', ${ids.rec}) returning id`,
    );
    await tx.execute(
      sql`insert into maestro.recorrencia_execucoes (org_id, recorrencia_id, mes, lancamento_id) values (${A}, ${ids.rec}, '2026-10', ${ids.lanc})`,
    );
    await tx.execute(sql`insert into maestro.baixas (org_id, lancamento_id, valor_cents) values (${A}, ${ids.lanc}, 50)`);
    ids.equip = await um(sql`insert into maestro.equipamentos (org_id, nome, chave) values (${A}, 'Sony FX6', 'sonyfx6') returning id`);
    await tx.execute(sql`insert into maestro.reservas (org_id, equipamento_id, inicio, fim) values (${A}, ${ids.equip}, '2026-11-01', '2026-11-01')`);
    await tx.execute(sql`insert into maestro.documentos (org_id, projeto_id, tipo, titulo) values (${A}, ${ids.projeto}, 'roteiro', 'Roteiro')`);
    // drizzle/0011–0013: marca, links públicos, pedidos e o equipamento do freela.
    await tx.execute(sql`insert into maestro.org_marca (org_id, nome, cor) values (${A}, 'Marca A', '#1f6feb')`);
    ids.link = await um(sql`insert into maestro.links_publicos (org_id, tipo, token_hash) values (${A}, 'pedido', ${"b".repeat(64)}) returning id`);
    await tx.execute(
      sql`insert into maestro.pedidos (org_id, link_id, protocolo, nome, email, consentimento_em) values (${A}, ${ids.link}, 'PED00001', 'Pessoa', 'p@exemplo.com', now())`,
    );
    ids.fequip = await um(sql`insert into maestro.freela_equipamentos (org_id, freela_id, modelo) values (${A}, ${ids.freela}, 'FX6') returning id`);
    await tx.execute(sql`insert into maestro.escala_equipamentos (org_id, escala_id, equipamento_id) values (${A}, ${ids.escala}, ${ids.fequip})`);
  });
});
after(() => amb.fechar());

const contar = async (ctx: { sub: string; orgId: string }, t: string) =>
  ((await getBanco().asUser(ctx, (tx) => tx.execute(sql.raw(`select count(*)::int as n from maestro.${t}`)))) as unknown as { n: number }[])[0].n;
const erroDe = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e,
  );

describe("tabelas da produtora: duas organizações", () => {
  test("RLS ligado e a política de organização em todas", async () => {
    const r = (await getBanco().sql`
      select c.relname, c.relrowsecurity as rls,
             exists (select 1 from pg_policies p where p.schemaname = 'maestro' and p.tablename = c.relname and p.policyname = c.relname || '_org') as org
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'maestro' and c.relname = any (${[...TODAS]})`) as { relname: string; rls: boolean; org: boolean }[];
    assert.equal(r.length, TODAS.length);
    for (const x of r) assert.ok(x.rls && x.org, x.relname);
  });

  test("a gestão da A vê tudo da A", async () => {
    for (const t of TODAS) assert.ok((await contar(o.gestor, t)) >= 1, t);
    assert.equal(await contar(o.admin, "lancamentos"), 2, "o aluguel e o a pagar que a escala gerou");
  });

  test("a B e a organização forjada não veem nada da A", async () => {
    for (const t of TODAS) {
      assert.equal(await contar(o.b, t), 0, `B em ${t}`);
      assert.equal(await contar(o.forjado, t), 0, `forjado em ${t}`);
    }
  });

  test("equipe e leitura veem a operação, mas não o dinheiro nem os dados de pagamento", async () => {
    for (const t of TODAS) {
      const so = SO_GESTAO.includes(t);
      for (const [quem, ctx] of [
        ["equipe", o.equipe],
        ["leitura", o.leitura],
      ] as const) {
        const n = await contar(ctx, t);
        assert.ok(so ? n === 0 : n >= 1, `${quem} em ${t}: ${n}`);
      }
    }
  });

  test("não dá para gravar na outra organização trocando o org_id", async () => {
    for (const q of [
      sql`insert into maestro.freelas (org_id, nome) values (${o.orgB}, 'invasor')`,
      sql`insert into maestro.equipamentos (org_id, nome, chave) values (${o.orgB}, 'x', 'x')`,
      sql`insert into maestro.eventos (org_id, titulo, data) values (${o.orgB}, 'x', '2026-11-01')`,
      sql`insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento) values (${o.orgB}, 'saida', 'fixo', 'x', 1, '2026-10-01')`,
    ]) {
      assert.equal(codigoPg(await erroDe(getBanco().asUser(o.admin, (tx) => tx.execute(q)))), PG.rls);
    }
  });

  test("não dá para apontar para a linha da outra organização (chave composta)", async () => {
    const [fb] = (await getBanco().asUser(o.b, (tx) =>
      tx.execute(sql`insert into maestro.freelas (org_id, nome) values (${o.orgB}, 'Freela B') returning id`),
    )) as unknown as {
      id: string;
    }[];
    // B tentando escalar o freela B no projeto da A, e reservar o equipamento da A.
    const e1 = await erroDe(
      getBanco().asUser(o.b, (tx) =>
        tx.execute(
          sql`insert into maestro.escalas (org_id, projeto_id, freela_id, funcao, inicio, fim) values (${o.orgB}, ${ids.projeto}, ${fb.id}, 'x', '2026-11-01', '2026-11-01')`,
        ),
      ),
    );
    assert.equal(codigoPg(e1), PG.chaveEstrangeira);
    const e2 = await erroDe(
      getBanco().asUser(o.b, (tx) =>
        tx.execute(sql`insert into maestro.reservas (org_id, equipamento_id, inicio, fim) values (${o.orgB}, ${ids.equip}, '2026-12-01', '2026-12-01')`),
      ),
    );
    assert.equal(codigoPg(e2), PG.chaveEstrangeira);
    const e3 = await erroDe(
      getBanco().asUser(o.b, (tx) =>
        tx.execute(sql`insert into maestro.orcamentos (org_id, numero, titulo, cliente_id) values (${o.orgB}, '2026-001', 'x', ${ids.cliente})`),
      ),
    );
    assert.equal(codigoPg(e3), PG.chaveEstrangeira);
    // Pedido da B apontando para o cliente ou o link da A; equipamento da B no freela da A.
    for (const q of [
      sql`insert into maestro.pedidos (org_id, protocolo, nome, email, consentimento_em, cliente_id) values (${o.orgB}, 'PED00002', 'Xx', 'x@exemplo.com', now(), ${ids.cliente})`,
      sql`insert into maestro.pedidos (org_id, protocolo, nome, email, consentimento_em, link_id) values (${o.orgB}, 'PED00003', 'Xx', 'x@exemplo.com', now(), ${ids.link})`,
      sql`insert into maestro.freela_equipamentos (org_id, freela_id, modelo) values (${o.orgB}, ${ids.freela}, 'x')`,
    ]) {
      assert.equal(codigoPg(await erroDe(getBanco().asUser(o.b, (tx) => tx.execute(q)))), PG.chaveEstrangeira);
    }
  });

  test("leitura não escreve; equipe não escreve na tabela de preços nem no dinheiro", async () => {
    const leitura = await erroDe(getBanco().asUser(o.leitura, (tx) => tx.execute(sql`insert into maestro.freelas (org_id, nome) values (${o.orgA}, 'x')`)));
    assert.equal(codigoPg(leitura), PG.rls);
    for (const q of [
      sql`insert into maestro.precos_itens (org_id, nome) values (${o.orgA}, 'x')`,
      sql`insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento) values (${o.orgA}, 'saida', 'fixo', 'x', 1, '2026-10-01')`,
      sql`insert into maestro.freela_pagamento (org_id, freela_id) values (${o.orgA}, ${ids.freela})`,
    ]) {
      assert.equal(codigoPg(await erroDe(getBanco().asUser(o.equipe, (tx) => tx.execute(q)))), PG.rls);
    }
    const mudou = await getBanco().asUser(o.equipe, (tx) => tx.execute(sql`update maestro.precos_itens set preco_cents = 1 returning id`));
    assert.equal(mudou.length, 0, "equipe não muda preço");
    const apagou = await getBanco().asUser(o.equipe, (tx) => tx.execute(sql`delete from maestro.freelas returning id`));
    assert.equal(apagou.length, 0, "equipe não apaga freela");
  });

  test("preços de combustível (referência da ANP): maestro_app lê e não grava", async () => {
    await getBanco().asUser(o.admin, (tx) => tx.execute(sql`select * from maestro.combustivel_precos`));
    const e = await erroDe(getBanco().asUser(o.admin, (tx) => tx.execute(sql`delete from maestro.combustivel_precos`)));
    assert.equal(codigoPg(e), PG.semPrivilegio);
  });
});
