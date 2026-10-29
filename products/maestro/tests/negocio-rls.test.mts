// As tabelas novas do negócio (drizzle/0014–0018: contatos, metas, importacoes, agenda_assinaturas, acesso_restrito,
// acesso_clientes): RLS ligado e a política de organização em todas; a organização B e a forjada não veem nem gravam
// nada da A; metas e importações só para administração e gestão.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("negocio_rls");
const { getBanco, codigoPg, PG } = amb.banco;
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;

const NOVAS = ["contatos", "metas", "importacoes", "agenda_assinaturas", "acesso_restrito", "acesso_clientes"] as const;

const contar = async (ctx: { sub: string; orgId: string }, t: string) =>
  ((await getBanco().asUser(ctx, (tx) => tx.execute(sql.raw(`select count(*)::int as n from maestro.${t}`)))) as unknown as { n: number }[])[0].n;
const erroDe = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e,
  );

before(async () => {
  o = await duasOrganizacoes();
  await getBanco().asSystem("semente", async (tx) => {
    const A = o.orgA;
    const um = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { id: string }[])[0].id;
    const cli = await um(sql`insert into maestro.clients (org_id, name) values (${A}, 'Cliente A') returning id`);
    await tx.execute(sql`insert into maestro.contatos (org_id, cliente_id, nota) values (${A}, ${cli}, 'Liguei')`);
    await tx.execute(sql`insert into maestro.metas (org_id, mes, receita_cents) values (${A}, '2026-11', 100)`);
    await tx.execute(
      sql`insert into maestro.importacoes (org_id, tipo, arquivo, sha256, linhas, feita_por) values (${A}, 'clientes', 'a.csv', ${"e".repeat(64)}, 1, ${o.ANA})`,
    );
    for (const sub of [o.ANA, o.equipe.sub])
      await tx.execute(
        sql`insert into maestro.agenda_assinaturas (org_id, zro_sub, token_hash) values (${A}, ${sub}, ${sub.replace(/-/g, "").padEnd(64, "0").slice(0, 64)})`,
      );
    await tx.execute(sql`insert into maestro.acesso_restrito (org_id, zro_sub) values (${A}, ${o.leitura.sub})`);
    await tx.execute(sql`insert into maestro.acesso_clientes (org_id, zro_sub, cliente_id) values (${A}, ${o.leitura.sub}, ${cli})`);
  });
});
after(() => amb.fechar());

describe("tabelas novas do negócio: duas organizações", () => {
  test("RLS ligado e política de organização em todas", async () => {
    const r = (await getBanco().sql`
      select c.relname, c.relrowsecurity as rls,
             exists (select 1 from pg_policies p where p.schemaname = 'maestro' and p.tablename = c.relname and p.policyname = c.relname || '_org') as org
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'maestro' and c.relname = any (${[...NOVAS]})`) as { relname: string; rls: boolean; org: boolean }[];
    assert.equal(r.length, NOVAS.length);
    for (const x of r) assert.ok(x.rls && x.org, x.relname);
  });

  test("a A vê o dela; a B e a forjada não veem nada", async () => {
    for (const t of NOVAS) {
      assert.ok((await contar(o.admin, t)) >= 1, `admin em ${t}`);
      assert.equal(await contar(o.b, t), 0, `B em ${t}`);
      assert.equal(await contar(o.forjado, t), 0, `forjado em ${t}`);
    }
  });

  test("metas e importações só para administração e gestão; a agenda de cada um só para ele", async () => {
    for (const t of ["metas", "importacoes"]) {
      assert.equal(await contar(o.equipe, t), 0, `equipe em ${t}`);
      assert.equal(await contar(o.leitura, t), 0, `leitura em ${t}`);
      assert.equal(await contar(o.gestor, t), 1, `gestor em ${t}`);
    }
    assert.equal(await contar(o.admin, "agenda_assinaturas"), 1);
    assert.equal(await contar(o.equipe, "agenda_assinaturas"), 1);
    assert.equal(await contar(o.gestor, "agenda_assinaturas"), 0);
  });

  test("não grava na outra organização trocando o org_id", async () => {
    for (const q of [
      sql`insert into maestro.metas (org_id, mes, receita_cents) values (${o.orgA}, '2026-12', 1)`,
      sql`insert into maestro.importacoes (org_id, tipo, arquivo, sha256, linhas, feita_por) values (${o.orgA}, 'clientes', 'x.csv', ${"f".repeat(64)}, 1, ${o.BIA})`,
      sql`insert into maestro.acesso_restrito (org_id, zro_sub) values (${o.orgA}, ${o.equipe.sub})`,
      sql`insert into maestro.agenda_assinaturas (org_id, zro_sub, token_hash) values (${o.orgA}, ${o.BIA}, ${"1".repeat(64)})`,
    ]) {
      assert.equal(codigoPg(await erroDe(getBanco().asUser(o.b, (tx) => tx.execute(q)))), PG.rls, String(q));
    }
    const apagou = await getBanco().asUser(o.b, (tx) => tx.execute(sql`delete from maestro.contatos returning id`));
    assert.equal(apagou.length, 0);
    assert.equal(await contar(o.admin, "contatos"), 1);
  });

  test("o relatório de importação não muda depois de gravado", async () => {
    const e = await erroDe(getBanco().asUser(o.admin, (tx) => tx.execute(sql`update maestro.importacoes set criados = 99`)));
    assert.equal(codigoPg(e), PG.semPrivilegio);
  });
});
