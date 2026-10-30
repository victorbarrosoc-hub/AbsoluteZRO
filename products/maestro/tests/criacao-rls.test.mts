// Criação · roteiros no banco (drizzle/0030): RLS ligado, duas organizações (a B e a forjada não leem nem gravam nada
// da A, nem apontando para projeto ou card dela), papéis (leitura só lê; estado só administração e gestão), rev com
// conflito, versões só de inclusão com sha256 conferido, restaurar, lixeira e o documento antigo aberto no editor novo.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("criacao_rls");
const { getBanco, codigoPg, PG } = amb.banco;
const rt = await import("../src/lib/criacao/roteiro/servidor");
const { roteiroDoModelo } = await import("../src/lib/criacao/roteiro/modelos");
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;
const ids: Record<string, string> = {};

const erroDe = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e,
  );
const contar = async (ctx: { sub: string; orgId: string }, t: string) =>
  ((await getBanco().asUser(ctx, (tx) => tx.execute(sql.raw(`select count(*)::int as n from maestro.${t}`)))) as unknown as { n: number }[])[0].n;
const ok = <T extends { ok: boolean }>(r: T) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const erro = (r: { ok: boolean; erro?: string }) => (r.ok ? "ok" : r.erro);

before(async () => {
  o = await duasOrganizacoes();
  await getBanco().asSystem("semente da criação", async (tx) => {
    const um = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { id: string }[])[0].id;
    ids.cli = await um(sql`insert into maestro.clients (org_id, name) values (${o.orgA}, 'Café Aurora') returning id`);
    ids.proj = await um(
      sql`insert into maestro.projects (org_id, code, title, client_id) values (${o.orgA}, 'MAE-2026-0001', 'Verão', ${ids.cli}) returning id`,
    );
    ids.projB = await um(sql`insert into maestro.projects (org_id, code, title) values (${o.orgB}, 'MAE-2026-0002', 'Da B') returning id`);
    await tx.execute(
      sql`insert into maestro.cards (org_id, id, dados) values (${o.orgA}, 'card-aurora', ${JSON.stringify({ tema: "Reels verão", coluna: "pauta", cliente: ids.cli })}::jsonb)`,
    );
    ids.doc = await um(sql`
      insert into maestro.documentos (org_id, projeto_id, tipo, titulo, conteudo)
      values (${o.orgA}, ${ids.proj}, 'roteiro', 'Roteiro antigo', ${JSON.stringify({ texto: "Primeira fala.\n\nSegunda fala." })}::jsonb) returning id`);
    ids.doc2 = await um(sql`
      insert into maestro.documentos (org_id, projeto_id, tipo, titulo, conteudo)
      values (${o.orgA}, ${ids.proj}, 'decupagem', 'Decupagem', ${JSON.stringify({ planos: [{ cena: "1", plano: "PM", descricao: "Balcão" }] })}::jsonb) returning id`);
  });
});
after(() => amb.fechar());

describe("roteiros: tabelas e duas organizações", () => {
  test("RLS ligado, política de organização e de cliente nas duas tabelas", async () => {
    const r = (await getBanco().sql`
      select c.relname, c.relrowsecurity as rls,
             exists (select 1 from pg_policies p where p.schemaname = 'maestro' and p.tablename = c.relname and p.policyname = c.relname || '_org') as org,
             exists (select 1 from pg_policies p where p.schemaname = 'maestro' and p.tablename = c.relname and p.policyname = c.relname || '_cliente') as cliente
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'maestro' and c.relname in ('roteiros', 'roteiro_versoes') order by c.relname`) as {
      relname: string;
      rls: boolean;
      org: boolean;
      cliente: boolean;
    }[];
    assert.deepEqual(
      r.map((x) => [x.relname, x.rls, x.org, x.cliente]),
      [
        ["roteiro_versoes", true, true, true],
        ["roteiros", true, true, true],
      ],
    );
  });

  test("a A cria e lê; a B e a forjada não veem nem mexem", async () => {
    const c = ok(await rt.criarRoteiro(o.equipe, { titulo: "  Verão  2026 ", modelo: "institucional", projetoId: ids.proj, cardId: "card-aurora" }));
    ids.r1 = c.id;
    assert.equal(c.rev, 1);
    const r = await rt.obterRoteiro(o.leitura, c.id);
    assert.ok(r);
    assert.equal(r.titulo, "Verão 2026");
    assert.equal(r.modelo, "institucional");
    assert.equal(r.projeto, "Verão");
    assert.equal(r.card, "Reels verão");
    assert.equal(r.criadoPor, o.equipe.sub);
    assert.equal(r.conteudo.cenas.length, 6);
    assert.equal((await rt.listarRoteiros(o.admin)).length, 1);
    assert.equal((await rt.listarRoteiros(o.admin, { projetoId: ids.proj })).length, 1);
    assert.equal((await rt.listarRoteiros(o.admin, { cardId: "card-aurora" })).length, 1);

    for (const ctx of [o.b, o.forjado]) {
      assert.deepEqual(await rt.listarRoteiros(ctx), []);
      assert.equal(await rt.obterRoteiro(ctx, c.id), null);
      assert.equal(await contar(ctx, "roteiros"), 0);
      assert.equal(erro(await rt.salvarRoteiro(ctx, c.id, { rev: 1, titulo: "invasão" })), "nao_existe");
      assert.equal(erro(await rt.salvarVersao(ctx, c.id)), ctx === o.b ? "nao_existe" : "sem_permissao");
      assert.equal(erro(await rt.lixeiraRoteiro(ctx, c.id, true)), "nao_existe");
      assert.equal(erro(await rt.ligarRoteiro(ctx, c.id, { projetoId: null })), "nao_existe");
    }
    // gravar direto na A, ou na B apontando para projeto/card da A
    for (const q of [
      sql`insert into maestro.roteiros (org_id, titulo, conteudo) values (${o.orgA}, 'x', '{}'::jsonb)`,
      sql`update maestro.roteiros set titulo = 'invasão' where id = ${c.id} returning id`,
    ]) {
      const e = await erroDe(getBanco().asUser(o.b, (tx) => tx.execute(q)));
      if (e) assert.equal(codigoPg(e), PG.rls, String(q));
    }
    assert.equal(erro(await rt.criarRoteiro(o.b, { titulo: "Na B", projetoId: ids.proj })), "vinculo");
    assert.equal(erro(await rt.criarRoteiro(o.b, { titulo: "Na B", cardId: "card-aurora" })), "vinculo");
    ok(await rt.criarRoteiro(o.b, { titulo: "Na B", projetoId: ids.projB }));
    assert.equal((await rt.obterRoteiro(o.admin, c.id))?.titulo, "Verão 2026", "intacto");
    assert.equal(await contar(o.admin, "roteiros"), 1, "a A não vê o da B");
  });

  test("papéis: leitura só lê; estado só administração e gestão; colunas do banco não mudam por fora", async () => {
    assert.equal(erro(await rt.criarRoteiro(o.leitura, { titulo: "Não pode" })), "sem_permissao");
    assert.equal(erro(await rt.salvarRoteiro(o.leitura, ids.r1, { rev: 1, titulo: "Não pode" })), "sem_permissao");
    assert.equal(erro(await rt.salvarVersao(o.leitura, ids.r1)), "sem_permissao");
    assert.equal(erro(await rt.lixeiraRoteiro(o.leitura, ids.r1, true)), "sem_permissao");
    assert.equal(erro(await rt.mudarEstadoRoteiro(o.equipe, ids.r1, "aprovado")), "sem_permissao");
    assert.equal(
      erro(await rt.criarRoteiro(o.equipe, { titulo: "Já aprovado?" }).then(async (r) => (r.ok ? rt.mudarEstadoRoteiro(o.equipe, r.id, "com_cliente") : r))),
      "sem_permissao",
    );
    ok(await rt.mudarEstadoRoteiro(o.gestor, ids.r1, "com_cliente"));
    assert.equal((await rt.obterRoteiro(o.equipe, ids.r1))?.estado, "com_cliente");
    ok(await rt.mudarEstadoRoteiro(o.admin, ids.r1, "rascunho"));
    for (const q of [
      sql`update maestro.roteiros set versao_atual = 9 where id = ${ids.r1}`,
      sql`update maestro.roteiros set rev = 99 where id = ${ids.r1}`,
      sql`update maestro.roteiros set org_id = ${o.orgB} where id = ${ids.r1}`,
      sql`update maestro.roteiros set demo = true where id = ${ids.r1}`,
    ]) {
      assert.equal(codigoPg(await erroDe(getBanco().asUser(o.admin, (tx) => tx.execute(q)))), PG.semPrivilegio, String(q));
    }
    // insert com estado já aprovado por quem é da equipe
    const e = await erroDe(
      getBanco().asUser(o.equipe, (tx) =>
        tx.execute(sql`insert into maestro.roteiros (org_id, titulo, conteudo, estado) values (${o.orgA}, 'x', '{}'::jsonb, 'aprovado')`),
      ),
    );
    assert.equal(codigoPg(e), PG.semPrivilegio);
  });

  test("rev: gravar com o rev visto; o antigo volta conflito com o atual; ligar não sobe o rev", async () => {
    const atual = await rt.obterRoteiro(o.equipe, ids.r1);
    assert.ok(atual);
    const conteudo = structuredClone(atual.conteudo);
    const fala = conteudo.cenas[1].blocos.find((b) => b.tipo === "fala");
    assert.ok(fala && fala.tipo === "fala");
    fala.texto = "Somos uma torrefação pequena, de família.";
    const s1 = ok(await rt.salvarRoteiro(o.equipe, ids.r1, { rev: atual.rev, conteudo }));
    assert.equal(s1.rev, atual.rev + 1);
    assert.equal(s1.duracaoSeg, 2, "6 palavras a 150/min = 2,4 s");
    const velho = await rt.salvarRoteiro(o.gestor, ids.r1, { rev: atual.rev, titulo: "Outro título" });
    assert.equal(velho.ok, false);
    assert.ok(!velho.ok && velho.erro === "conflito" && "atual" in velho && velho.atual.rev === s1.rev && velho.atual.titulo === "Verão 2026");
    ok(await rt.ligarRoteiro(o.equipe, ids.r1, { projetoId: ids.proj, cardId: null }));
    const depois = await rt.obterRoteiro(o.equipe, ids.r1);
    assert.equal(depois?.rev, s1.rev, "ligar não é mudança de conteúdo");
    assert.equal(depois?.cardId, null);
    assert.equal(erro(await rt.salvarRoteiro(o.equipe, ids.r1, { rev: s1.rev, conteudo: { cenas: "x" } })), "formato");
    assert.equal(erro(await rt.salvarRoteiro(o.equipe, ids.r1, { rev: s1.rev, titulo: "   " })), "titulo");
    ok(await rt.ligarRoteiro(o.equipe, ids.r1, { projetoId: ids.proj, cardId: "card-aurora" }));
  });

  test("versões: só pela função, n em sequência, sha256 conferido, imutáveis", async () => {
    const v1 = ok(await rt.salvarVersao(o.equipe, ids.r1, "  Primeira   para o cliente "));
    assert.equal(v1.n, 1);
    const [canon] = (await getBanco().asUser(o.admin, (tx) =>
      tx.execute(sql`select conteudo::text as t from maestro.roteiros where id = ${ids.r1}`),
    )) as unknown as { t: string }[];
    assert.equal(v1.sha256, createHash("sha256").update(canon.t, "utf8").digest("hex"), "sha256 do texto canônico do jsonb");
    const v2 = ok(await rt.salvarVersao(o.gestor, ids.r1));
    assert.equal(v2.n, 2);
    const lista = await rt.listarVersoes(o.leitura, ids.r1);
    assert.deepEqual(
      lista.map((v) => [v.n, v.nota]),
      [
        [2, null],
        [1, "Primeira para o cliente"],
      ],
    );
    assert.equal((await rt.obterRoteiro(o.admin, ids.r1))?.versaoAtual, 2);
    assert.deepEqual(await rt.listarVersoes(o.b, ids.r1), []);
    assert.equal(await rt.obterVersao(o.b, ids.r1, 1), null);
    assert.equal(erro(await rt.salvarVersao(o.equipe, ids.r1, "x".repeat(501))), "formato");

    for (const q of [
      sql`insert into maestro.roteiro_versoes (org_id, roteiro_id, n, titulo, conteudo, sha256) values (${o.orgA}, ${ids.r1}, 3, 'x', '{}'::jsonb, ${"0".repeat(64)})`,
      sql`update maestro.roteiro_versoes set nota = 'mudei' where roteiro_id = ${ids.r1}`,
      sql`delete from maestro.roteiro_versoes where roteiro_id = ${ids.r1}`,
    ]) {
      assert.equal(codigoPg(await erroDe(getBanco().asUser(o.admin, (tx) => tx.execute(q)))), PG.semPrivilegio, String(q));
    }
    // nem o dono das tabelas muda ou apaga (gatilho), e o check confere o hash
    for (const q of [
      sql`update maestro.roteiro_versoes set nota = 'mudei' where roteiro_id = ${ids.r1}`,
      sql`delete from maestro.roteiro_versoes where roteiro_id = ${ids.r1}`,
    ]) {
      assert.equal(codigoPg(await erroDe(getBanco().asSystem("teste", (tx) => tx.execute(q)))), PG.semPrivilegio, String(q));
    }
    const hash = await erroDe(
      getBanco().asSystem("teste", (tx) =>
        tx.execute(
          sql`insert into maestro.roteiro_versoes (org_id, roteiro_id, n, titulo, conteudo, sha256) values (${o.orgA}, ${ids.r1}, 9, 'x', '{}'::jsonb, ${"0".repeat(64)})`,
        ),
      ),
    );
    assert.equal(codigoPg(hash), PG.checagem);
    // o roteiro com versão salva não sai de vez (nem por administração)
    const apagar = await erroDe(getBanco().asUser(o.admin, (tx) => tx.execute(sql`delete from maestro.roteiros where id = ${ids.r1}`)));
    assert.equal(codigoPg(apagar), PG.semPrivilegio);
    // equipe não apaga de vez nem roteiro sem versão
    const semVersao = ok(await rt.criarRoteiro(o.equipe, { titulo: "Rascunho solto" }));
    const r = await getBanco().asUser(o.equipe, (tx) => tx.execute(sql`delete from maestro.roteiros where id = ${semVersao.id} returning id`));
    assert.equal(r.length, 0);
  });

  test("restaurar uma versão: o rascunho volta a ela; a versão não muda", async () => {
    const v1 = await rt.obterVersao(o.equipe, ids.r1, 1);
    assert.ok(v1);
    const atual = await rt.obterRoteiro(o.equipe, ids.r1);
    assert.ok(atual);
    const mudado = structuredClone(atual.conteudo);
    mudado.cenas = mudado.cenas.slice(0, 1);
    const s = ok(await rt.salvarRoteiro(o.equipe, ids.r1, { rev: atual.rev, conteudo: mudado, titulo: "Encurtado" }));
    assert.equal(erro(await rt.restaurarVersao(o.equipe, ids.r1, 1, atual.rev)), "conflito");
    const rr = ok(await rt.restaurarVersao(o.equipe, ids.r1, 1, s.rev));
    assert.equal(rr.rev, s.rev + 1);
    const depois = await rt.obterRoteiro(o.equipe, ids.r1);
    assert.deepEqual(depois?.conteudo, v1.conteudo);
    assert.equal(depois?.titulo, v1.titulo);
    assert.equal(erro(await rt.restaurarVersao(o.equipe, ids.r1, 7, rr.rev)), "nao_existe");
    assert.equal((await rt.listarVersoes(o.equipe, ids.r1)).length, 2, "restaurar não cria versão");
  });

  test("lixeira: some da lista, volta; nada se apaga de vez", async () => {
    ok(await rt.lixeiraRoteiro(o.equipe, ids.r1, true));
    assert.equal(
      (await rt.listarRoteiros(o.admin)).some((x) => x.id === ids.r1),
      false,
    );
    assert.equal(
      (await rt.listarRoteiros(o.admin, { lixeira: true })).some((x) => x.id === ids.r1),
      true,
    );
    assert.equal(erro(await rt.salvarVersao(o.equipe, ids.r1)), "nao_existe");
    ok(await rt.lixeiraRoteiro(o.equipe, ids.r1, true));
    ok(await rt.lixeiraRoteiro(o.equipe, ids.r1, false));
    assert.equal(
      (await rt.listarRoteiros(o.admin)).some((x) => x.id === ids.r1),
      true,
    );
  });

  test("documento antigo → editor novo: um por documento, o antigo fica intacto, outra organização não abre", async () => {
    const a = ok(await rt.abrirDocumentoAntigo(o.equipe, ids.doc));
    assert.equal(a.jaExistia, false);
    const r = await rt.obterRoteiro(o.equipe, a.id);
    assert.ok(r);
    assert.equal(r.modelo, "documento");
    assert.equal(r.projetoId, ids.proj);
    assert.equal(r.origemDocumentoId, ids.doc);
    assert.deepEqual(
      r.conteudo.cenas[0].blocos.map((b) => (b.tipo === "fala" ? b.texto : b.tipo)),
      ["Primeira fala.", "Segunda fala."],
    );
    const b = ok(await rt.abrirDocumentoAntigo(o.gestor, ids.doc));
    assert.deepEqual([b.id, b.jaExistia], [a.id, true]);
    const [doc] = (await getBanco().asSystem("teste", (tx) => tx.execute(sql`select conteudo from maestro.documentos where id = ${ids.doc}`))) as unknown as {
      conteudo: unknown;
    }[];
    assert.deepEqual(doc.conteudo, { texto: "Primeira fala.\n\nSegunda fala." });
    assert.equal(erro(await rt.abrirDocumentoAntigo(o.b, ids.doc)), "nao_existe");
    assert.equal(erro(await rt.abrirDocumentoAntigo(o.leitura, ids.doc2)), "sem_permissao");
    assert.equal(ok(await rt.abrirDocumentoAntigo(o.leitura, ids.doc)).jaExistia, true, "o que já existe, quem lê abre");
  });

  test("demonstração sai com as versões; organização apagada leva tudo", async () => {
    const d = ok(await rt.criarRoteiro(o.admin, { titulo: "Demo", modelo: "reels", demo: true, conteudo: roteiroDoModelo("reels") }));
    ok(await rt.salvarVersao(o.admin, d.id));
    const r = await getBanco().asUser(o.admin, (tx) => tx.execute(sql`delete from maestro.roteiros where demo returning id`));
    assert.equal(r.length, 1);
    assert.equal(await contar(o.admin, "roteiro_versoes"), 2, "as versões de verdade ficam");
    await getBanco().asSystem("teste", (tx) => tx.execute(sql`delete from maestro.organizations where id = ${o.orgA}`));
    const [n] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(
        sql`select (select count(*) from maestro.roteiros where org_id = ${o.orgA})::int + (select count(*) from maestro.roteiro_versoes where org_id = ${o.orgA})::int as n`,
      ),
    )) as unknown as { n: number }[];
    assert.equal(n.n, 0);
  });
});
