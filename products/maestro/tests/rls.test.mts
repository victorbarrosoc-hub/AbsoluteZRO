// Isolamento entre organizações e papéis no schema `maestro` (drizzle/0000_fundacao.sql). Banco real, papel maestro_app.
// Duas organizações: Ana é admin na A e leitura na B; Bia é gestora só na B. Organização forjada não lê nada.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { bancoDeTeste, UUID } from "./ambiente.mts";

const url = await bancoDeTeste("rls");
const { criarBanco, codigoPg, mensagemPg, PG, schema } = await import("../src/lib/db/client");
const banco = criarBanco(url, { max: 3 });
const { organizations, members, clients, projects, lotes, loteCards, approvalLinks, approvals, clientRequests, integrationState, cardMedia, auditLog } = schema;

const ANA = UUID();
const BIA = UUID();
let orgA: string;
let orgB: string;
let clienteA: string;
let projetoA: string;
const CARD_A = "cardA0001";

const TABELAS_COM_ORG = [
  "members",
  "clients",
  "projects",
  "cards",
  "card_history",
  "card_media",
  "lotes",
  "lote_cards",
  "approval_links",
  "approvals",
  "client_requests",
  "integration_state",
  "audit_log",
] as const;

const erroDe = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e as unknown,
  );

before(async () => {
  await banco.asSystem("semente", async (tx) => {
    const [a] = await tx.insert(organizations).values({ zroOrgId: UUID(), name: "Agência A" }).returning({ id: organizations.id });
    const [b] = await tx.insert(organizations).values({ zroOrgId: UUID(), name: "Agência B" }).returning({ id: organizations.id });
    orgA = a.id;
    orgB = b.id;
    await tx.insert(members).values([
      { orgId: orgA, zroSub: ANA, displayName: "Ana", hubRole: "owner", role: "admin" },
      { orgId: orgB, zroSub: ANA, displayName: "Ana", hubRole: "viewer", role: "leitura" },
      { orgId: orgB, zroSub: BIA, displayName: "Bia", hubRole: "manager", role: "gestor" },
    ]);
    const [ca] = await tx.insert(clients).values({ orgId: orgA, name: "Cliente A" }).returning({ id: clients.id });
    await tx.insert(clients).values({ orgId: orgB, name: "Cliente B" });
    clienteA = ca.id;
    const [pa] = await tx.insert(projects).values({ orgId: orgA, clientId: clienteA, code: "MAE-2026-001", title: "Projeto A" }).returning({ id: projects.id });
    projetoA = pa.id;
  });
  // O card da A nasce pela função, como a equipe faria.
  await banco.asUser({ sub: ANA, orgId: orgA }, (tx) =>
    tx.execute(sql`select maestro.card_criar(${CARD_A}, ${JSON.stringify({ tema: "Post de abertura", coluna: "pauta" })}::jsonb)`),
  );
  await banco.asSystem("semente 2", async (tx) => {
    const [lote] = await tx.insert(lotes).values({ orgId: orgA, clientId: clienteA, title: "Lote A" }).returning({ id: lotes.id });
    await tx.insert(loteCards).values({ loteId: lote.id, orgId: orgA, cardId: CARD_A });
    const [link] = await tx
      .insert(approvalLinks)
      .values({ orgId: orgA, clientId: clienteA, kind: "lote", loteId: lote.id, tokenHash: "hash-a" })
      .returning({ id: approvalLinks.id });
    await tx
      .insert(approvals)
      .values({ orgId: orgA, cardId: CARD_A, cardVersion: 1, loteId: lote.id, linkId: link.id, decision: "aprovado", idempotencyKey: "a:1:1" });
    await tx.insert(clientRequests).values({ orgId: orgA, clientId: clienteA, linkId: link.id, title: "Mais um story" });
    await tx.insert(integrationState).values({ orgId: orgA, projectId: projetoA, productId: "sobedesce", state: "ready" });
    await tx.insert(cardMedia).values({ orgId: orgA, cardId: CARD_A, nome: "capa.jpg", driveFileId: "1abcDEF" });
    await tx.insert(auditLog).values({ orgId: orgA, actorSub: ANA, action: "teste" });
  });
});
after(() => banco.close());

async function contar(sub: string, orgId: string, tabela: string): Promise<number> {
  const r = await banco.asUser({ sub, orgId }, (tx) => tx.execute(sql.raw(`select count(*)::int as n from maestro.${tabela}`)));
  return (r[0] as { n: number }).n;
}

describe("RLS", () => {
  test("todas as tabelas do schema maestro têm RLS ligado", async () => {
    const r = await banco.sql`select tablename from pg_tables where schemaname = 'maestro' and tablename <> '__drizzle_migrations' and not rowsecurity`;
    assert.deepEqual(
      r.map((x) => x.tablename),
      [],
    );
    const todas = await banco.sql`select tablename from pg_tables where schemaname = 'maestro' and tablename <> '__drizzle_migrations' order by 1`;
    for (const t of [...TABELAS_COM_ORG, "organizations", "sessions", "rate_limit_attempts"])
      assert.ok(
        todas.some((x) => x.tablename === t),
        `tabela ${t} existe`,
      );
  });

  test("a dona da organização A vê o que é da A em toda tabela", async () => {
    for (const t of TABELAS_COM_ORG) assert.ok((await contar(ANA, orgA, t)) >= 1, t);
    assert.equal(await contar(ANA, orgA, "organizations"), 1);
  });

  test("organização forjada sem vínculo não mostra nada, em nenhuma tabela", async () => {
    for (const t of [...TABELAS_COM_ORG, "organizations"]) assert.equal(await contar(BIA, orgA, t), 0, t);
  });

  test("a mesma pessoa vê só a organização ativa", async () => {
    const naA = await banco.asUser({ sub: ANA, orgId: orgA }, (tx) => tx.select({ name: clients.name }).from(clients));
    const naB = await banco.asUser({ sub: ANA, orgId: orgB }, (tx) => tx.select({ name: clients.name }).from(clients));
    assert.deepEqual(
      naA.map((c) => c.name),
      ["Cliente A"],
    );
    assert.deepEqual(
      naB.map((c) => c.name),
      ["Cliente B"],
    );
  });

  test("não dá para criar cliente em outra organização trocando o org_id", async () => {
    const e = await erroDe(banco.asUser({ sub: ANA, orgId: orgA }, (tx) => tx.insert(clients).values({ orgId: orgB, name: "invasor" })));
    assert.equal(codigoPg(e), PG.rls);
  });

  test("leitura não escreve; gestão e equipe escrevem", async () => {
    const e = await erroDe(banco.asUser({ sub: ANA, orgId: orgB }, (tx) => tx.insert(clients).values({ orgId: orgB, name: "Cliente novo" })));
    assert.equal(codigoPg(e), PG.rls, "Ana é leitura na B");
    const r = await banco.asUser({ sub: BIA, orgId: orgB }, (tx) =>
      tx.insert(clients).values({ orgId: orgB, name: "Cliente novo" }).returning({ id: clients.id }),
    );
    assert.equal(r.length, 1, "Bia é gestora na B");
  });

  test("sessões e tentativas: maestro_app não lê nem o hash", async () => {
    for (const t of ["sessions", "rate_limit_attempts"]) {
      const e = await erroDe(banco.asUser({ sub: ANA, orgId: orgA }, (tx) => tx.execute(sql.raw(`select * from maestro.${t}`))));
      assert.equal(codigoPg(e), PG.semPrivilegio, t);
    }
  });

  test("membros: o papel só vem do login; admin ajusta revisor, gestão não", async () => {
    const e = await erroDe(
      banco.asUser({ sub: ANA, orgId: orgA }, (tx) =>
        tx
          .update(members)
          .set({ role: "admin" })
          .where(sql`zro_sub = ${ANA}`),
      ),
    );
    assert.equal(codigoPg(e), PG.semPrivilegio, "coluna role sem grant");
    const ok = await banco.asUser({ sub: ANA, orgId: orgA }, (tx) =>
      tx
        .update(members)
        .set({ revisor: true })
        .where(sql`zro_sub = ${ANA}`)
        .returning({ r: members.revisor }),
    );
    assert.deepEqual(ok, [{ r: true }]);
    const nada = await banco.asUser({ sub: BIA, orgId: orgB }, (tx) =>
      tx
        .update(members)
        .set({ revisor: true })
        .where(sql`zro_sub = ${BIA}`)
        .returning({ r: members.revisor }),
    );
    assert.equal(nada.length, 0, "gestora não muda membros");
  });

  test("organização: só admin muda nome e ajustes", async () => {
    const ok = await banco.asUser({ sub: ANA, orgId: orgA }, (tx) => tx.update(organizations).set({ name: "Agência A+" }).returning({ n: organizations.name }));
    assert.deepEqual(ok, [{ n: "Agência A+" }]);
    const nada = await banco.asUser({ sub: BIA, orgId: orgB }, (tx) => tx.update(organizations).set({ name: "x" }).returning({ n: organizations.name }));
    assert.equal(nada.length, 0);
    const e = await erroDe(banco.asUser({ sub: ANA, orgId: orgA }, (tx) => tx.update(organizations).set({ zroOrgId: UUID() })));
    assert.equal(codigoPg(e), PG.semPrivilegio, "zro_org_id não é da aplicação");
  });

  test("auditoria: quem escreve assina com o próprio sub; só admin e gestão leem; ninguém edita", async () => {
    await banco.asUser({ sub: ANA, orgId: orgA }, (tx) => tx.insert(auditLog).values({ orgId: orgA, actorSub: ANA, action: "cliente.criou" }));
    const e = await erroDe(banco.asUser({ sub: ANA, orgId: orgA }, (tx) => tx.insert(auditLog).values({ orgId: orgA, actorSub: BIA, action: "falso" })));
    assert.equal(codigoPg(e), PG.rls);
    assert.equal(await contar(ANA, orgB, "audit_log"), 0, "leitura não lê a auditoria");
    const del = await erroDe(banco.asSystem("teste", (tx) => tx.delete(auditLog)));
    assert.equal(codigoPg(del), PG.semPrivilegio);
  });
});

describe("Quadro: escrita só por função", () => {
  test("maestro_app não insere, muda nem apaga cards direto", async () => {
    const ins = await erroDe(
      banco.asUser({ sub: ANA, orgId: orgA }, (tx) => tx.execute(sql`insert into maestro.cards (org_id, id, dados) values (${orgA}, 'direto01', '{}'::jsonb)`)),
    );
    assert.equal(codigoPg(ins), PG.semPrivilegio);
    const upd = await erroDe(banco.asUser({ sub: ANA, orgId: orgA }, (tx) => tx.execute(sql`update maestro.cards set dados = '{}'::jsonb`)));
    assert.equal(codigoPg(upd), PG.semPrivilegio);
    const del = await erroDe(banco.asUser({ sub: ANA, orgId: orgA }, (tx) => tx.execute(sql`delete from maestro.cards`)));
    assert.equal(codigoPg(del), PG.semPrivilegio);
  });

  test("leitura não cria card; equipe cria, muda com versão por campo e o histórico cresce", async () => {
    const e = await erroDe(
      banco.asUser({ sub: ANA, orgId: orgB }, (tx) => tx.execute(sql`select maestro.card_criar('cardB0001', '{"tema":"x","coluna":"pauta"}'::jsonb)`)),
    );
    assert.equal(codigoPg(e), PG.semPrivilegio);
    await banco.asUser({ sub: BIA, orgId: orgB }, (tx) =>
      tx.execute(sql`select maestro.card_criar('cardB0001', '{"tema":"Reel de lançamento","coluna":"pauta"}'::jsonb)`),
    );
    const [c1] = await banco.asUser({ sub: BIA, orgId: orgB }, (tx) =>
      tx.execute(sql`select * from maestro.card_mudar('cardB0001', '{"coluna":"afazer","resp":"Bia"}'::jsonb, '{"coluna":1}'::jsonb)`),
    );
    assert.equal(c1.versao, 2);
    assert.deepEqual(c1.versoes, { tema: 1, coluna: 2, resp: 1 });
    assert.equal(c1.coluna, "afazer");
    // Base velha para o mesmo campo: conflito.
    const conflito = await erroDe(
      banco.asUser({ sub: BIA, orgId: orgB }, (tx) =>
        tx.execute(sql`select maestro.card_mudar('cardB0001', '{"coluna":"fazendo"}'::jsonb, '{"coluna":1}'::jsonb)`),
      ),
    );
    assert.equal(codigoPg(conflito), PG.regra);
    assert.match(mensagemPg(conflito), /conflito:coluna/);
    // Valor null apaga o campo.
    const [c2] = await banco.asUser({ sub: BIA, orgId: orgB }, (tx) => tx.execute(sql`select * from maestro.card_mudar('cardB0001', '{"resp":null}'::jsonb)`));
    assert.equal((c2.dados as Record<string, unknown>).resp, undefined);
    const hist = await banco.asUser({ sub: BIA, orgId: orgB }, (tx) =>
      tx.execute(sql`select operacao from maestro.card_history where card_id = 'cardB0001' order by n`),
    );
    assert.deepEqual(
      hist.map((h) => h.operacao),
      ["criar", "mudar", "mudar"],
    );
    // A outra organização não vê o card nem o histórico.
    assert.equal(await contar(ANA, orgA, "cards"), 1);
    const deA = await banco.asUser({ sub: ANA, orgId: orgA }, (tx) => tx.execute(sql`select id from maestro.cards`));
    assert.deepEqual(
      deA.map((c) => c.id),
      [CARD_A],
    );
  });

  test("apagar é lápide e restaurar tira a lápide", async () => {
    const [ap] = await banco.asUser({ sub: ANA, orgId: orgA }, (tx) => tx.execute(sql`select * from maestro.card_apagar(${CARD_A})`));
    assert.ok(ap.apagado_em, "apagadoEm preenchido");
    const [re] = await banco.asUser({ sub: ANA, orgId: orgA }, (tx) => tx.execute(sql`select * from maestro.card_restaurar(${CARD_A})`));
    assert.equal(re.apagado_em, null);
    const n = await contar(ANA, orgA, "cards");
    assert.equal(n, 1, "nada some do banco");
  });

  test("card de outra organização não é alcançado pela função", async () => {
    const e = await erroDe(banco.asUser({ sub: BIA, orgId: orgB }, (tx) => tx.execute(sql`select maestro.card_mudar(${CARD_A}, '{"tema":"invasão"}'::jsonb)`)));
    assert.equal(codigoPg(e), "P0002", "não encontrado na organização ativa");
  });
});

describe("só inclusão", () => {
  test("decisões do cliente e histórico não mudam nem somem, nem pelo dono", async () => {
    const u = await erroDe(banco.asSystem("teste", (tx) => tx.execute(sql`update maestro.approvals set decision = 'ajuste'`)));
    assert.equal(codigoPg(u), PG.semPrivilegio);
    const d = await erroDe(banco.asSystem("teste", (tx) => tx.execute(sql`delete from maestro.card_history`)));
    assert.equal(codigoPg(d), PG.semPrivilegio);
    const dup = await erroDe(
      banco.asSystem("teste", (tx) =>
        tx.insert(approvals).values({ orgId: orgA, cardId: CARD_A, cardVersion: 1, decision: "aprovado", idempotencyKey: "a:1:1" }),
      ),
    );
    assert.equal(codigoPg(dup), PG.unicidade, "idempotência da decisão");
  });

  test("um link ativo por lote; validade padrão de 30 dias", async () => {
    const [l] = await banco.asSystem("teste", (tx) => tx.select({ loteId: approvalLinks.loteId, expira: approvalLinks.expiresAt }).from(approvalLinks));
    const dias = (l.expira.getTime() - Date.now()) / 86_400_000;
    assert.ok(dias > 29.9 && dias <= 30.01, `validade de ${dias} dias`);
    const e = await erroDe(
      banco.asSystem("teste", (tx) =>
        tx.insert(approvalLinks).values({ orgId: orgA, clientId: clienteA, kind: "lote", loteId: l.loteId!, tokenHash: "hash-b" }),
      ),
    );
    assert.equal(codigoPg(e), PG.unicidade);
  });
});
