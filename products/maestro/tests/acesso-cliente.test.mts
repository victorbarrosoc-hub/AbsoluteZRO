// Acesso por cliente (drizzle/0018): quem é da equipe ou só lê, restrito a alguns clientes, não lê nem grava nada de
// outro cliente em nenhuma tabela ligada a cliente, nem pelas funções security definer do Quadro e da revisão. A regra
// é do banco: as consultas aqui vão direto às tabelas como a pessoa (asUser). Admin e gestão nunca são restritos.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("acesso_cliente");
const { getBanco, codigoPg, PG } = amb.banco;
const pessoas = await import("../src/lib/pessoas");
const { listarClientes } = await import("../src/lib/crm/clientes");
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;
const ids: Record<string, string> = {};

// Cada tabela ligada a cliente: a pessoa restrita ao cliente "Sim" vê exatamente 1 linha (a do Sim), nunca a do "Não".
const TABELAS = [
  "clients",
  "projects",
  "cards",
  "card_history",
  "card_media",
  "versoes",
  "comentarios",
  "approvals",
  "lotes",
  "lote_cards",
  "approval_links",
  "client_requests",
  "integration_state",
  "orcamentos",
  "orcamento_itens",
  "pedidos",
  "contatos",
  "eventos",
  "escalas",
  "documentos",
  "reservas",
] as const;

const contar = async (ctx: { sub: string; orgId: string }, t: string) =>
  ((await getBanco().asUser(ctx, (tx) => tx.execute(sql.raw(`select count(*)::int as n from maestro.${t}`)))) as unknown as { n: number }[])[0].n;
const erroDe = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e,
  );

before(async () => {
  o = await duasOrganizacoes();
  await getBanco().asSystem("semente do acesso por cliente", async (tx) => {
    const um = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { id: string }[])[0]?.id;
    const A = o.orgA;
    ids.freela = await um(sql`insert into maestro.freelas (org_id, nome) values (${A}, 'Freela') returning id`);
    ids.equip = await um(sql`insert into maestro.equipamentos (org_id, nome, chave) values (${A}, 'Câmera', 'camera') returning id`);
    for (const [k, nome, dia] of [
      ["sim", "Cliente Sim", "01"],
      ["nao", "Cliente Não", "02"],
    ] as const) {
      const c = await um(sql`insert into maestro.clients (org_id, name) values (${A}, ${nome}) returning id`);
      ids[`c_${k}`] = c;
      const p = await um(sql`insert into maestro.projects (org_id, code, title, client_id) values (${A}, ${`MAE-2026-00${dia}`}, ${nome}, ${c}) returning id`);
      ids[`p_${k}`] = p;
      const card = `card-${k}`;
      ids[`k_${k}`] = card;
      await tx.execute(
        sql`insert into maestro.cards (org_id, id, dados) values (${A}, ${card}, ${JSON.stringify({ tema: nome, coluna: "fazendo", cliente: c })}::jsonb)`,
      );
      await tx.execute(sql`insert into maestro.card_history (org_id, card_id, operacao) values (${A}, ${card}, 'criar')`);
      await tx.execute(sql`insert into maestro.card_media (org_id, card_id, nome, drive_file_id) values (${A}, ${card}, 'peça', ${`arq${k}`})`);
      const v = await um(
        sql`insert into maestro.versoes (org_id, card_id, n, fonte, url) values (${A}, ${card}, 1, 'mp4', 'https://exemplo.com/a.mp4') returning id`,
      );
      await tx.execute(
        sql`insert into maestro.comentarios (org_id, versao_id, card_id, autor_tipo, autor_sub, texto, idem_key) values (${A}, ${v}, ${card}, 'equipe', ${o.ANA}, 'oi', ${`idem-${k}-1234`})`,
      );
      const lote = await um(sql`insert into maestro.lotes (org_id, client_id, title) values (${A}, ${c}, 'Lote') returning id`);
      await tx.execute(sql`insert into maestro.lote_cards (lote_id, org_id, card_id) values (${lote}, ${A}, ${card})`);
      const link = await um(
        sql`insert into maestro.approval_links (org_id, client_id, kind, lote_id, token_hash) values (${A}, ${c}, 'lote', ${lote}, ${k.repeat(32).slice(0, 64)}) returning id`,
      );
      await tx.execute(
        sql`insert into maestro.approvals (org_id, card_id, card_version, link_id, decision, idempotency_key) values (${A}, ${card}, 1, ${link}, 'aprovado', ${`ap-${k}`})`,
      );
      await tx.execute(sql`insert into maestro.client_requests (org_id, client_id, title) values (${A}, ${c}, 'Pedido do cliente')`);
      await tx.execute(sql`insert into maestro.integration_state (org_id, project_id, product_id, state) values (${A}, ${p}, 'hub', 'ok')`);
      const q = await um(sql`insert into maestro.orcamentos (org_id, numero, titulo, cliente_id) values (${A}, ${`2026-0${dia}0`}, 'Orç', ${c}) returning id`);
      await tx.execute(sql`insert into maestro.orcamento_itens (org_id, orcamento_id, descricao) values (${A}, ${q}, 'linha')`);
      const ped = await um(
        sql`insert into maestro.pedidos (org_id, protocolo, nome, email, consentimento_em, cliente_id) values (${A}, ${`ACE000${dia}`}, 'Nome', 'n@x.com', now(), ${c}) returning id`,
      );
      await tx.execute(sql`insert into maestro.contatos (org_id, pedido_id) values (${A}, ${ped})`);
      const ev = await um(sql`insert into maestro.eventos (org_id, titulo, data, projeto_id) values (${A}, 'Diária', ${`2026-11-${dia}`}, ${p}) returning id`);
      await tx.execute(
        sql`insert into maestro.escalas (org_id, projeto_id, evento_id, freela_id, funcao, inicio, fim) values (${A}, ${p}, ${ev}, ${ids.freela}, 'edicao', ${`2026-11-${dia}`}, ${`2026-11-${dia}`})`,
      );
      await tx.execute(sql`insert into maestro.documentos (org_id, projeto_id, tipo, titulo) values (${A}, ${p}, 'roteiro', 'Roteiro')`);
      await tx.execute(
        sql`insert into maestro.reservas (org_id, equipamento_id, projeto_id, inicio, fim) values (${A}, ${ids.equip}, ${p}, ${`2026-12-${dia}`}, ${`2026-12-${dia}`})`,
      );
    }
    // Um card sem cliente e uma diária sem projeto: a pessoa restrita não vê.
    await tx.execute(sql`insert into maestro.cards (org_id, id, dados) values (${A}, 'card-solto', '{"tema":"Solto","coluna":"pauta"}'::jsonb)`);
    await tx.execute(sql`insert into maestro.eventos (org_id, titulo, data) values (${A}, 'Reunião interna', '2026-11-05')`);
  });
  // Eva (equipe) vê só o cliente Sim; Leo (leitura) restrito a nenhum. Quem decide é a gestão (Gil).
  assert.equal((await pessoas.salvarAcesso(o.gestor, o.equipe.sub, true, [ids.c_sim])).ok, true);
  assert.equal((await pessoas.salvarAcesso(o.admin, o.leitura.sub, true, [])).ok, true);
});
after(() => amb.fechar());

describe("acesso por cliente", () => {
  test("restrita a um cliente: em toda tabela ligada a cliente só a linha dele", async () => {
    for (const t of TABELAS) assert.equal(await contar(o.equipe, t), 1, `equipe em ${t}`);
    const [c] = (await getBanco().asUser(o.equipe, (tx) => tx.execute(sql`select id from maestro.clients`))) as unknown as { id: string }[];
    assert.equal(c.id, ids.c_sim);
    const k = (await getBanco().asUser(o.equipe, (tx) => tx.execute(sql`select id from maestro.cards`))) as unknown as { id: string }[];
    assert.deepEqual(
      k.map((x) => x.id),
      ["card-sim"],
    );
    assert.deepEqual(
      (await listarClientes(o.equipe)).map((x) => x.nome),
      ["Cliente Sim"],
    );
  });

  test("restrita a nenhum: nada ligado a cliente; o que não é de cliente segue visível", async () => {
    for (const t of TABELAS) assert.equal(await contar(o.leitura, t), 0, `leitura em ${t}`);
    assert.equal(await contar(o.leitura, "freelas"), 1);
    assert.equal(await contar(o.leitura, "equipamentos"), 1);
  });

  test("admin e gestão veem tudo; a restrição não vale para eles nem dá para restringi-los", async () => {
    assert.equal(await contar(o.admin, "clients"), 2);
    assert.equal(await contar(o.gestor, "cards"), 3);
    assert.equal(await contar(o.gestor, "eventos"), 3);
    const r = await pessoas.salvarAcesso(o.admin, o.gestor.sub, true, []);
    assert.equal(r.ok, false);
    // Mesmo gravado à força, gestão não fica restrita (o papel manda).
    await getBanco().asSystem("teste", (tx) => tx.execute(sql`insert into maestro.acesso_restrito (org_id, zro_sub) values (${o.orgA}, ${o.gestor.sub})`));
    assert.equal(await contar(o.gestor, "clients"), 2);
    await getBanco().asSystem("teste", (tx) => tx.execute(sql`delete from maestro.acesso_restrito where zro_sub = ${o.gestor.sub}`));
  });

  test("só administração e gestão mudam o acesso", async () => {
    assert.equal((await pessoas.salvarAcesso(o.equipe, o.leitura.sub, false, [])).ok, false);
    const e = await erroDe(
      getBanco().asUser(o.equipe, (tx) =>
        tx.execute(sql`insert into maestro.acesso_clientes (org_id, zro_sub, cliente_id) values (${o.orgA}, ${o.equipe.sub}, ${ids.c_nao})`),
      ),
    );
    assert.equal(codigoPg(e), PG.rls);
  });

  test("não grava no cliente de fora: tabelas, card_* e versões", async () => {
    // tabela direta: projeto e evento no cliente Não
    for (const q of [
      sql`insert into maestro.projects (org_id, code, title, client_id) values (${o.orgA}, 'MAE-2026-099', 'x', ${ids.c_nao})`,
      sql`insert into maestro.clients (org_id, name) values (${o.orgA}, 'Cliente novo')`,
      sql`insert into maestro.eventos (org_id, titulo, data, projeto_id) values (${o.orgA}, 'x', '2026-11-09', ${ids.p_nao})`,
    ]) {
      assert.equal(codigoPg(await erroDe(getBanco().asUser(o.equipe, (tx) => tx.execute(q)))), PG.rls);
    }
    const mudou = await getBanco().asUser(o.equipe, (tx) =>
      tx.execute(sql`update maestro.projects set title = 'invasão' where id = ${ids.p_nao} returning id`),
    );
    assert.equal(mudou.length, 0);
    // funções security definer: mudar o card de fora, mover o próprio para o cliente de fora, versão e comentário
    for (const q of [
      sql`select maestro.card_mudar('card-nao', '{"tema":"invasão"}'::jsonb)`,
      sql`select maestro.card_mudar('card-sim', ${JSON.stringify({ cliente: ids.c_nao })}::jsonb)`,
      sql`select maestro.card_criar('card-novo-nao', ${JSON.stringify({ tema: "x", coluna: "pauta", cliente: ids.c_nao })}::jsonb)`,
      sql`select maestro.card_apagar('card-nao')`,
      sql`select maestro.versao_criar('card-nao', 'mp4', 'https://exemplo.com/b.mp4')`,
    ]) {
      assert.equal(codigoPg(await erroDe(getBanco().asUser(o.equipe, (tx) => tx.execute(q)))), PG.rls, String(q));
    }
    // o próprio cliente funciona
    await getBanco().asUser(o.equipe, (tx) => tx.execute(sql`select maestro.card_mudar('card-sim', '{"tema":"Novo tema"}'::jsonb)`));
    await getBanco().asUser(o.equipe, (tx) =>
      tx.execute(sql`select maestro.card_criar('card-novo-sim', ${JSON.stringify({ tema: "x", coluna: "pauta", cliente: ids.c_sim })}::jsonb)`),
    );
    assert.equal(await contar(o.equipe, "cards"), 2);
    const [t] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select dados ->> 'tema' as tema from maestro.cards where id = 'card-nao'`),
    )) as unknown as {
      tema: string;
    }[];
    assert.equal(t.tema, "Cliente Não", "o card de fora ficou intacto");
  });

  test("tirar a restrição devolve tudo; a outra organização segue isolada", async () => {
    assert.equal((await pessoas.salvarAcesso(o.admin, o.equipe.sub, false, [])).ok, true);
    assert.equal(await contar(o.equipe, "clients"), 2);
    for (const t of TABELAS) assert.equal(await contar(o.b, t), 0, `B em ${t}`);
    const lista = await pessoas.listarPessoas(o.admin);
    assert.equal(lista.find((p) => p.sub === o.leitura.sub)?.restrito, true);
    assert.equal(lista.find((p) => p.sub === o.equipe.sub)?.restrito, false);
    assert.equal((await pessoas.listarPessoas(o.b)).length, 1);
  });
});

describe("contratos (drizzle/0020)", () => {
  test("tabela ligada a cliente com a política _cliente; quem lê é só administração e gestão", async () => {
    const [p] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select permissive from pg_policies where schemaname = 'maestro' and tablename = 'contratos' and policyname = 'contratos_cliente'`),
    )) as unknown as { permissive: string }[];
    assert.equal(p?.permissive, "RESTRICTIVE");
    const html = `<article class="ct-texto"><p>${"contrato de teste ".repeat(5)}</p></article>`;
    await getBanco().asSystem("semente", async (tx) => {
      for (const k of ["sim", "nao"]) {
        const [q] = (await tx.execute(
          sql`select id from maestro.orcamentos where org_id = ${o.orgA} and cliente_id = ${ids[`c_${k}`]} limit 1`,
        )) as unknown as { id: string }[];
        await tx.execute(sql`
          insert into maestro.contratos (org_id, orcamento_id, cliente_id, projeto_id, modelo_versao, html, hash, nome, documento, endereco)
          values (${o.orgA}, ${q.id}, ${ids[`c_${k}`]}, ${ids[`p_${k}`]}, 0, ${html}, encode(sha256(convert_to(${html}, 'UTF8')), 'hex'), 'Nome', '52998224725', 'Rua A, 1')`);
      }
    });
    assert.equal(await contar(o.admin, "contratos"), 2);
    assert.equal(await contar(o.gestor, "contratos"), 2);
    assert.equal(await contar(o.equipe, "contratos"), 0, "equipe não lê contrato (tem valor e documento)");
    assert.equal(await contar(o.leitura, "contratos"), 0);
    assert.equal(await contar(o.b, "contratos"), 0);
  });
});
