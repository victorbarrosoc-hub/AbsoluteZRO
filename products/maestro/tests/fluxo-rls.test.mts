// Criação · fluxos no banco (drizzle/0031): RLS nas quatro tabelas, duas organizações (a B e a forjada não leem nem
// gravam nada da A), papéis, operações por nó com rev (conflito só no item, o resto grava; erro de regra desfaz o
// pedido), "o que mudou desde", referências vivas ("sem acesso" sem título para quem é restrito), imagens (porta dos
// bytes, hash conferido, cota por produtora e por fluxo, limpeza), limite de nós, lixeira e apagar de vez.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import sharp from "sharp";
import { sql } from "drizzle-orm";
import { prepararAmbiente } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("fluxo_rls");
const { getBanco, codigoPg, PG } = amb.banco;
const fx = await import("../src/lib/criacao/fluxo/servidor");
const { lerOps } = await import("../src/lib/criacao/fluxo/modelo");
const { COTA } = await import("../src/lib/criacao/fluxo/cota");
const { fluxoParaMarkdown, fluxoParaJson } = await import("../src/lib/criacao/fluxo/exportar");
const rt = await import("../src/lib/criacao/roteiro/servidor");
const pessoas = await import("../src/lib/pessoas");
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;
const ids: Record<string, string> = {};

const erroDe = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e,
  );
const ok = <T extends { ok: boolean }>(r: T) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const erro = (r: { ok: boolean; erro?: string }) => (r.ok ? "ok" : r.erro);
const contar = async (ctx: { sub: string; orgId: string }, t: string) =>
  ((await getBanco().asUser(ctx, (tx) => tx.execute(sql.raw(`select count(*)::int as n from maestro.${t}`)))) as unknown as { n: number }[])[0].n;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ops = (lista: unknown[]) => {
  const l = lerOps(lista);
  assert.ok(l.ok, JSON.stringify(l));
  return l.ops;
};
const png = (cor: string, w = 64, h = 48) =>
  sharp({ create: { width: w, height: h, channels: 3, background: cor } })
    .png()
    .toBuffer();

before(async () => {
  o = await duasOrganizacoes();
  await getBanco().asSystem("semente do fluxo", async (tx) => {
    const um = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { id: string }[])[0].id;
    ids.cliSim = await um(sql`insert into maestro.clients (org_id, name) values (${o.orgA}, 'Café Aurora') returning id`);
    ids.cliNao = await um(sql`insert into maestro.clients (org_id, name) values (${o.orgA}, 'Outro cliente') returning id`);
    ids.projSim = await um(
      sql`insert into maestro.projects (org_id, code, title, client_id) values (${o.orgA}, 'MAE-2026-0001', 'Verão', ${ids.cliSim}) returning id`,
    );
    ids.projNao = await um(
      sql`insert into maestro.projects (org_id, code, title, client_id) values (${o.orgA}, 'MAE-2026-0002', 'Sigiloso', ${ids.cliNao}) returning id`,
    );
    ids.projB = await um(sql`insert into maestro.projects (org_id, code, title) values (${o.orgB}, 'MAE-2026-0003', 'Da B') returning id`);
    await tx.execute(
      sql`insert into maestro.cards (org_id, id, dados) values (${o.orgA}, 'card-aurora', ${JSON.stringify({ tema: "Gravação", coluna: "agendado", cliente: ids.cliSim, prazo: "2026-11-12" })}::jsonb)`,
    );
    await tx.execute(
      sql`insert into maestro.cards (org_id, id, dados) values (${o.orgA}, 'card-sigilo', ${JSON.stringify({ tema: "Campanha secreta", coluna: "pauta", cliente: ids.cliNao })}::jsonb)`,
    );
  });
  ids.rotSim = ok(await rt.criarRoteiro(o.admin, { titulo: "Institucional", projetoId: ids.projSim })).id;
  ids.rotNao = ok(await rt.criarRoteiro(o.admin, { titulo: "Roteiro sigiloso", projetoId: ids.projNao })).id;
});
after(() => amb.fechar());

describe("fluxos: tabelas, duas organizações e papéis", () => {
  test("RLS ligado, política de organização e de cliente nas quatro tabelas; bytes só pela porta", async () => {
    const r = (await getBanco().sql`
      select c.relname, c.relrowsecurity as rls,
             exists (select 1 from pg_policies p where p.schemaname = 'maestro' and p.tablename = c.relname and p.policyname = c.relname || '_org') as org,
             exists (select 1 from pg_policies p where p.schemaname = 'maestro' and p.tablename = c.relname and p.policyname = c.relname || '_cliente' and p.permissive = 'RESTRICTIVE') as cliente
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'maestro' and c.relname in ('fluxos', 'fluxo_nos', 'fluxo_ligacoes', 'fluxo_imagens') order by c.relname`) as {
      relname: string;
      rls: boolean;
      org: boolean;
      cliente: boolean;
    }[];
    assert.deepEqual(
      r.map((x) => [x.relname, x.rls, x.org, x.cliente]),
      [
        ["fluxo_imagens", true, true, true],
        ["fluxo_ligacoes", true, true, true],
        ["fluxo_nos", true, true, true],
        ["fluxos", true, true, true],
      ],
    );
    const [c] = (await getBanco().sql`select bytes, imagens_por_fluxo from maestro.fluxo_cota(${o.orgA}::uuid)`) as {
      bytes: string;
      imagens_por_fluxo: number;
    }[];
    assert.deepEqual([Number(c.bytes), c.imagens_por_fluxo], [COTA.bytesPorOrganizacao, COTA.imagensPorFluxo], "a cota do banco bate com cota.ts");
  });

  test("a A cria e lê; a B e a forjada não veem nem mexem", async () => {
    const c = ok(await fx.criarFluxo(o.equipe, { titulo: "  Verão   Café Aurora ", projetoId: ids.projSim }));
    ids.f1 = c.id;
    assert.equal(c.rev, 1);
    const f = await fx.obterFluxo(o.leitura, c.id);
    assert.ok(f);
    assert.equal(f.fluxo.titulo, "Verão Café Aurora");
    assert.equal(f.fluxo.projeto, "Verão");
    assert.equal(f.fluxo.criadoPor, o.equipe.sub);
    assert.deepEqual([f.nos, f.ligacoes], [[], []]);
    assert.ok(f.cursor);
    assert.equal((await fx.listarFluxos(o.admin)).length, 1);
    assert.equal((await fx.listarFluxos(o.admin, { projetoId: ids.projSim })).length, 1);

    for (const ctx of [o.b, o.forjado]) {
      assert.deepEqual(await fx.listarFluxos(ctx), []);
      assert.equal(await fx.obterFluxo(ctx, c.id), null);
      assert.equal(await contar(ctx, "fluxos"), 0);
      assert.equal(erro(await fx.salvarFluxo(ctx, c.id, { rev: 1, titulo: "invasão" })), "nao_existe");
      assert.equal(
        erro(await fx.aplicarOps(ctx, c.id, ops([{ op: "criar_no", tipo: "nota", dados: { texto: "x" } }]))),
        ctx === o.b ? "nao_existe" : "sem_permissao",
      );
      assert.equal(erro(await fx.lixeiraFluxo(ctx, c.id, true)), "nao_existe");
      assert.equal(erro(await fx.fluxoDesde(ctx, c.id, f.cursor)), "nao_existe");
      assert.equal(erro(await fx.enviarImagem(ctx, c.id, await png("#c96"))), ctx === o.b ? "nao_existe" : "sem_permissao");
    }
    // direto na tabela: a B na A, ou apontando para o projeto/card da A
    for (const q of [
      sql`insert into maestro.fluxos (org_id, titulo) values (${o.orgA}, 'x')`,
      sql`insert into maestro.fluxo_nos (org_id, fluxo_id, tipo, w, h) values (${o.orgA}, ${c.id}, 'nota', 100, 100)`,
      sql`insert into maestro.fluxo_nos (org_id, fluxo_id, tipo, w, h) values (${o.orgB}, ${c.id}, 'nota', 100, 100)`,
    ]) {
      const e = await erroDe(getBanco().asUser(o.b, (tx) => tx.execute(q)));
      assert.ok(e && [PG.rls, PG.chaveEstrangeira, "P0002"].includes(codigoPg(e) as string), String(q));
    }
    const nada = await getBanco().asUser(o.b, (tx) => tx.execute(sql`update maestro.fluxos set titulo = 'invasão' where id = ${c.id} returning id`));
    assert.equal(nada.length, 0);
    assert.equal(erro(await fx.criarFluxo(o.b, { titulo: "Na B", projetoId: ids.projSim })), "vinculo");
    assert.equal(erro(await fx.criarFluxo(o.b, { titulo: "Na B", cardId: "card-aurora" })), "vinculo");
    ids.fB = ok(await fx.criarFluxo(o.b, { titulo: "Na B", projetoId: ids.projB })).id;
    assert.equal(await contar(o.admin, "fluxos"), 1, "a A não vê o da B");
  });

  test("papéis: leitura só lê; colunas do banco não mudam por fora", async () => {
    assert.equal(erro(await fx.criarFluxo(o.leitura, { titulo: "Não pode" })), "sem_permissao");
    assert.equal(erro(await fx.salvarFluxo(o.leitura, ids.f1, { rev: 1, titulo: "Não" })), "sem_permissao");
    assert.equal(erro(await fx.aplicarOps(o.leitura, ids.f1, ops([{ op: "criar_no", tipo: "nota", dados: { texto: "x" } }]))), "sem_permissao");
    assert.equal(erro(await fx.enviarImagem(o.leitura, ids.f1, await png("#c96"))), "sem_permissao");
    assert.equal(erro(await fx.limparFluxos(o.leitura)), "sem_permissao");
    for (const q of [
      sql`update maestro.fluxos set rev = 9 where id = ${ids.f1}`,
      sql`update maestro.fluxos set org_id = ${o.orgB} where id = ${ids.f1}`,
      sql`update maestro.fluxos set demo = true where id = ${ids.f1}`,
    ]) {
      assert.equal(codigoPg(await erroDe(getBanco().asUser(o.admin, (tx) => tx.execute(q)))), PG.semPrivilegio, String(q));
    }
  });

  test("título com rev: o velho perde e recebe o atual", async () => {
    const s = ok(await fx.salvarFluxo(o.equipe, ids.f1, { rev: 1, titulo: "Verão · Café Aurora" }));
    assert.equal(s.rev, 2);
    const velho = await fx.salvarFluxo(o.gestor, ids.f1, { rev: 1, titulo: "Outro" });
    assert.ok(!velho.ok && velho.erro === "conflito" && "atual" in velho && velho.atual.titulo === "Verão · Café Aurora");
    ok(await fx.ligarFluxo(o.equipe, ids.f1, { projetoId: ids.projSim, cardId: "card-aurora" }));
    assert.equal((await fx.obterFluxo(o.equipe, ids.f1))?.fluxo.rev, 2, "ligar não sobe o rev");
  });
});

describe("nós e ligações: operações em lote, rev e o que mudou", () => {
  test("colar muitos e ligar no mesmo pedido (ids da tela)", async () => {
    const r = ok(
      await fx.aplicarOps(
        o.equipe,
        ids.f1,
        ops([
          { op: "criar_no", id: U(1), tipo: "secao", x: 60, y: 150, w: 560, h: 330, dados: { nome: "Clima e luz" } },
          { op: "criar_no", id: U(2), tipo: "nota", x: 450, y: 200, secaoId: U(1), dados: { texto: "Paleta quente, nada de azul." } },
          { op: "criar_no", id: U(3), tipo: "nota", x: 720, y: 205, dados: { texto: "Gancho: a xícara antes do sol." } },
          { op: "criar_no", id: U(4), tipo: "link", x: 80, y: 370, secaoId: U(1), dados: { url: "https://youtu.be/dQw4w9WgXcQ", titulo: "Ritmo" } },
          { op: "criar_ligacao", id: U(100), de: U(3), para: U(2), rotulo: "clima" },
        ]),
      ),
    );
    assert.equal(r.resultados.length, 5);
    assert.ok(r.resultados.every((x) => x.ok));
    const n2 = r.resultados[1];
    assert.ok(n2.ok && "no" in n2);
    assert.deepEqual([n2.no.rev, n2.no.secaoId, n2.no.dados], [1, U(1), { texto: "Paleta quente, nada de azul.", cor: "amarelo" }]);
    const n4 = r.resultados[3];
    assert.ok(n4.ok && "no" in n4 && "link" in n4.no.dados);
    assert.equal(n4.no.dados.link.fonte, "youtube");
    const f = await fx.obterFluxo(o.leitura, ids.f1);
    assert.deepEqual([f?.nos.length, f?.ligacoes.length], [4, 1]);
    const lista = await fx.listarFluxos(o.admin);
    assert.deepEqual([lista[0].itens, lista[0].imagens], [3, 0], "seção não conta como item");
  });

  test("rev por nó: conflito só no item velho; os outros gravam; mover sem rev leva; dados juntam", async () => {
    const r = ok(
      await fx.aplicarOps(
        o.equipe,
        ids.f1,
        ops([
          { op: "mudar_no", id: U(2), rev: 1, dados: { texto: "Paleta quente." } },
          { op: "mudar_no", id: U(3), rev: 1, x: 730 },
        ]),
      ),
    );
    assert.ok(r.resultados.every((x) => x.ok));
    const outra = ok(
      await fx.aplicarOps(
        o.gestor,
        ids.f1,
        ops([
          { op: "mudar_no", id: U(2), rev: 1, dados: { texto: "Versão velha" } },
          { op: "mudar_no", id: U(3), x: 800, y: 210 },
          { op: "mudar_no", id: U(2), rev: 2, dados: { cor: "menta" } },
          { op: "mudar_no", id: U(99), x: 1 },
        ]),
      ),
    );
    const [c, m, cor, falta] = outra.resultados;
    assert.ok(!c.ok && c.erro === "conflito" && "no" in c && c.no.rev === 2 && "texto" in c.no.dados && c.no.dados.texto === "Paleta quente.");
    assert.ok(m.ok && "no" in m && m.no.x === 800 && m.no.rev === 3, "sem rev, quem grava por último leva");
    assert.ok(cor.ok && "no" in cor);
    assert.deepEqual(cor.no.dados, { texto: "Paleta quente.", cor: "menta" }, "mudar a cor não apaga o texto");
    assert.equal(cor.no.atualizadoPor, o.gestor.sub);
    assert.deepEqual(falta, { ok: false, erro: "nao_existe", id: U(99) });
  });

  test("erro de regra desfaz o pedido inteiro", async () => {
    const antes = await contar(o.admin, "fluxo_nos");
    const r = await fx.aplicarOps(
      o.equipe,
      ids.f1,
      ops([
        { op: "criar_no", id: U(5), tipo: "nota", dados: { texto: "não fica" } },
        { op: "mudar_no", id: U(2), dados: { texto: "x".repeat(2001) } },
      ]),
    );
    assert.equal(erro(r), "formato");
    assert.equal(await contar(o.admin, "fluxo_nos"), antes);
    // seção de outro fluxo, ou um nó que não é seção
    const outro = ok(await fx.criarFluxo(o.equipe, { titulo: "Outro", projetoId: ids.projSim })).id;
    ids.f2 = outro;
    ok(await fx.aplicarOps(o.equipe, outro, ops([{ op: "criar_no", id: U(50), tipo: "secao", dados: { nome: "Lá" } }])));
    assert.equal(erro(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "criar_no", tipo: "nota", secaoId: U(50), dados: {} }]))), "secao");
    assert.equal(erro(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "mudar_no", id: U(4), secaoId: U(2) }]))), "secao");
    // ligação para nó de outro fluxo
    assert.equal(erro(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "criar_ligacao", de: U(2), para: U(50) }]))), "vinculo");
    // colunas que não mudam por fora
    for (const q of [
      sql`update maestro.fluxo_nos set tipo = 'link' where id = ${U(2)}`,
      sql`update maestro.fluxo_nos set rev = 99 where id = ${U(2)}`,
      sql`update maestro.fluxo_nos set fluxo_id = ${outro} where id = ${U(2)}`,
      sql`update maestro.fluxo_nos set roteiro_id = ${ids.rotSim} where id = ${U(2)}`,
    ]) {
      assert.equal(codigoPg(await erroDe(getBanco().asUser(o.admin, (tx) => tx.execute(q)))), PG.semPrivilegio, String(q));
    }
  });

  test("lápide e volta; ligação repetida devolve a que existe; ponta apagada não liga", async () => {
    const dup = ok(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "criar_ligacao", de: U(3), para: U(2), rotulo: "outra" }])));
    const l = dup.resultados[0];
    assert.ok(l.ok && "ligacao" in l && l.ligacao.id === U(100) && l.ligacao.rotulo === "clima");
    const ap = ok(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "apagar_no", id: U(4) }])));
    const a = ap.resultados[0];
    assert.ok(a.ok && "no" in a && a.no.apagado);
    ok(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "apagar_no", id: U(4) }])));
    assert.equal(erro(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "criar_ligacao", de: U(4), para: U(2) }]))), "ponta");
    const mudarMorto = ok(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "mudar_no", id: U(4), x: 5 }])));
    assert.equal(mudarMorto.resultados[0].ok, false, "nó na lápide não muda");
    assert.equal(
      (await fx.obterFluxo(o.equipe, ids.f1))?.nos.some((n) => n.id === U(4)),
      false,
    );
    const volta = ok(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "restaurar_no", id: U(4) }])));
    assert.ok(volta.resultados[0].ok && "no" in volta.resultados[0] && !volta.resultados[0].no.apagado);
    // ligação: rótulo com rev, apagar e restaurar
    const ml = ok(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "mudar_ligacao", id: U(100), rev: 1, rotulo: "luz" }])));
    assert.ok(ml.resultados[0].ok && "ligacao" in ml.resultados[0] && ml.resultados[0].ligacao.rev === 2);
    const velha = ok(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "mudar_ligacao", id: U(100), rev: 1, rotulo: "x" }])));
    assert.equal(velha.resultados[0].ok, false);
    ok(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "apagar_ligacao", id: U(100) }])));
    ok(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "restaurar_ligacao", id: U(100) }])));
  });

  test("o que mudou desde: só o que mexeu (lápide inclusive), barato e com cursor novo", async () => {
    const f = await fx.obterFluxo(o.equipe, ids.f1);
    assert.ok(f);
    // tudo o que já existe ficou para trás da folga de 5 s
    await getBanco().asSystem("teste", async (tx) => {
      await tx.execute(sql`update maestro.fluxo_nos set updated_at = updated_at - interval '1 minute' where fluxo_id = ${ids.f1}`);
      await tx.execute(sql`update maestro.fluxo_ligacoes set updated_at = updated_at - interval '1 minute' where fluxo_id = ${ids.f1}`);
    });
    const vazio = ok(await fx.fluxoDesde(o.leitura, ids.f1, f.cursor));
    assert.deepEqual([vazio.nos.length, vazio.ligacoes.length], [0, 0]);
    ok(
      await fx.aplicarOps(
        o.gestor,
        ids.f1,
        ops([
          { op: "mudar_no", id: U(3), x: 900 },
          { op: "apagar_no", id: U(4) },
        ]),
      ),
    );
    const d = ok(await fx.fluxoDesde(o.leitura, ids.f1, vazio.cursor));
    assert.deepEqual(d.nos.map((n) => [n.id, n.apagado]).sort(), [
      [U(3), false],
      [U(4), true],
    ]);
    assert.equal(d.nos.find((n) => n.id === U(3))?.x, 900);
    assert.notEqual(d.cursor, vazio.cursor);
    assert.equal(d.fluxo.titulo, "Verão · Café Aurora");
    assert.equal(erro(await fx.fluxoDesde(o.leitura, ids.f1, "ontem")), "formato");
    assert.equal(erro(await fx.fluxoDesde(o.leitura, ids.f1, "2026-10-29 10:00:00'; drop table x; --")), "formato");
  });
});

describe("referências vivas", () => {
  test("roteiro e card: título, estado e coluna lidos na hora; nada copiado no nó", async () => {
    const r = ok(
      await fx.aplicarOps(
        o.equipe,
        ids.f1,
        ops([
          { op: "criar_no", id: U(10), tipo: "roteiro", x: 720, y: 315, roteiroId: ids.rotSim },
          { op: "criar_no", id: U(11), tipo: "card", x: 940, y: 215, cardId: "card-aurora" },
          { op: "criar_no", id: U(12), tipo: "roteiro", x: 950, y: 330, roteiroId: ids.rotNao },
        ]),
      ),
    );
    const rot = r.refs[U(10)];
    assert.ok(rot.estado === "ok" && rot.tipo === "roteiro");
    assert.deepEqual([rot.titulo, rot.situacao, rot.versao], ["Institucional", "rascunho", 0]);
    const card = r.refs[U(11)];
    assert.ok(card.estado === "ok" && card.tipo === "card");
    assert.deepEqual([card.titulo, card.coluna, card.colunaNome, card.prazo], ["Gravação", "agendado", "Agendado", "2026-11-12"]);
    // renomeou o roteiro: a referência acompanha sem o nó mudar
    const atual = await rt.obterRoteiro(o.admin, ids.rotSim);
    ok(await rt.salvarRoteiro(o.admin, ids.rotSim, { rev: atual!.rev, titulo: "Institucional v2" }));
    ok(await rt.salvarVersao(o.admin, ids.rotSim));
    const f = await fx.obterFluxo(o.equipe, ids.f1);
    const r2 = f?.refs[U(10)];
    assert.ok(r2?.estado === "ok" && r2.tipo === "roteiro" && r2.titulo === "Institucional v2" && r2.versao === 1);
    const no = f?.nos.find((n) => n.id === U(10));
    assert.deepEqual(no?.dados, {});
    const [linha] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select dados::text as d from maestro.fluxo_nos where id = ${U(10)}`),
    )) as unknown as {
      d: string;
    }[];
    assert.doesNotMatch(linha.d, /Institucional/, "o título nunca é gravado no nó");
  });

  test("acesso por cliente: o fluxo do cliente aparece; referência de outro cliente = 'sem acesso', sem título em lugar nenhum", async () => {
    ok(await pessoas.salvarAcesso(o.admin, o.equipe.sub, true, [ids.cliSim]));
    try {
      const f = await fx.obterFluxo(o.equipe, ids.f1);
      assert.ok(f, "fluxo ligado ao projeto e card do cliente Sim");
      assert.deepEqual(f.refs[U(12)], { tipo: "roteiro", estado: "sem_acesso" });
      assert.ok(f.refs[U(10)].estado === "ok");
      const tudo = JSON.stringify(f);
      assert.doesNotMatch(tudo, /sigiloso|Sigiloso|Campanha secreta/);
      const exp = await fx.dadosParaExportar(o.equipe, ids.f1);
      assert.ok(exp);
      const md = fluxoParaMarkdown(exp, { agora: new Date() });
      assert.match(md, /- Roteiro: \(sem acesso\)/);
      assert.doesNotMatch(md + JSON.stringify(fluxoParaJson(exp, { agora: new Date() })), /sigiloso|Sigiloso/);
      // não cria referência ao que não vê, nem fluxo solto ou de outro cliente
      assert.equal(erro(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "criar_no", tipo: "roteiro", roteiroId: ids.rotNao }]))), "referencia");
      assert.equal(erro(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "criar_no", tipo: "card", cardId: "card-sigilo" }]))), "referencia");
      assert.equal(erro(await fx.criarFluxo(o.equipe, { titulo: "Solto" })), "sem_permissao");
      assert.equal(erro(await fx.criarFluxo(o.equipe, { titulo: "De fora", projetoId: ids.projNao })), "sem_permissao");
      // o fluxo sem vínculo e o do outro cliente somem para ela
      const solto = ok(await fx.criarFluxo(o.gestor, { titulo: "Ideia solta" })).id;
      const fora = ok(await fx.criarFluxo(o.gestor, { titulo: "Do outro", projetoId: ids.projNao })).id;
      ok(await fx.aplicarOps(o.gestor, fora, ops([{ op: "criar_no", id: U(60), tipo: "nota", dados: { texto: "segredo" } }])));
      ok(await fx.aplicarOps(o.gestor, fora, ops([{ op: "criar_no", id: U(61), tipo: "nota", dados: { texto: "outro" } }])));
      ok(await fx.aplicarOps(o.gestor, fora, ops([{ op: "criar_ligacao", de: U(60), para: U(61) }])));
      ids.fora = fora;
      for (const id of [solto, fora]) {
        assert.equal(await fx.obterFluxo(o.equipe, id), null);
        assert.equal(erro(await fx.aplicarOps(o.equipe, id, ops([{ op: "criar_no", tipo: "nota", dados: {} }]))), "nao_existe");
      }
      const visiveis = (await fx.listarFluxos(o.equipe)).map((x) => x.id).sort();
      assert.deepEqual(visiveis, [ids.f1, ids.f2].sort());
      const n = (await getBanco().asUser(o.equipe, (tx) =>
        tx.execute(
          sql`select (select count(*) from maestro.fluxo_nos where fluxo_id = ${fora})::int + (select count(*) from maestro.fluxo_ligacoes where fluxo_id = ${fora})::int as n`,
        ),
      )) as unknown as { n: number }[];
      assert.equal(n[0].n, 0, "nós e ligações do fluxo de fora também somem");
    } finally {
      ok(await pessoas.salvarAcesso(o.admin, o.equipe.sub, false, []));
    }
  });

  test("apagado de vez vira 'removido'; na lixeira avisa", async () => {
    const solto = ok(await rt.criarRoteiro(o.admin, { titulo: "Vai sumir" })).id;
    ok(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "criar_no", id: U(13), tipo: "roteiro", roteiroId: solto }])));
    await getBanco().asUser(o.admin, (tx) => tx.execute(sql`delete from maestro.roteiros where id = ${solto}`));
    ok(await rt.lixeiraRoteiro(o.admin, ids.rotSim, true));
    const f = await fx.obterFluxo(o.equipe, ids.f1);
    assert.deepEqual(f?.refs[U(13)], { tipo: "roteiro", estado: "removido" });
    assert.equal(f?.nos.find((n) => n.id === U(13))?.roteiroId, null);
    const r = f?.refs[U(10)];
    assert.ok(r?.estado === "ok" && r.tipo === "roteiro" && r.naLixeira);
    ok(await rt.lixeiraRoteiro(o.admin, ids.rotSim, false));
  });
});

describe("imagens: porta dos bytes, hash, cota e limpeza", () => {
  test("envia, reaproveita a mesma, lê pela porta só com id e sha certos", async () => {
    const bytes = await png("#d08a4e", 900, 600);
    const r = ok(await fx.enviarImagem(o.equipe, ids.f1, bytes));
    assert.equal(r.jaExistia, false);
    assert.equal(r.imagem.url, `/api/criacao/img/${r.imagem.id}/${r.imagem.sha256}`);
    ids.img = r.imagem.id;
    ids.sha = r.imagem.sha256;
    const de = ok(await fx.enviarImagem(o.gestor, ids.f1, bytes));
    assert.deepEqual([de.jaExistia, de.imagem.id], [true, r.imagem.id], "a mesma imagem não gasta cota de novo");
    const webp = await fx.lerImagem(o.leitura, ids.img, ids.sha);
    assert.ok(webp && webp.subarray(8, 12).toString() === "WEBP");
    const mini = await fx.lerImagem(o.leitura, ids.img, ids.sha, true);
    assert.ok(mini && mini.length < webp.length);
    assert.equal(await fx.lerImagem(o.leitura, ids.img, "0".repeat(64)), null);
    assert.equal(await fx.lerImagem(o.b, ids.img, ids.sha), null);
    assert.equal(await fx.lerImagem(o.forjado, ids.img, ids.sha), null);
    // o nó aponta para a imagem; a lista conta
    const n = ok(
      await fx.aplicarOps(
        o.equipe,
        ids.f1,
        ops([{ op: "criar_no", id: U(20), tipo: "imagem", x: 80, y: 190, imagemId: ids.img, dados: { legenda: "Fim de tarde" } }]),
      ),
    );
    const no = n.resultados[0];
    assert.ok(no.ok && "no" in no && no.no.imagem?.sha256 === ids.sha && no.no.imagem.largura === 900);
    assert.equal((await fx.listarFluxos(o.admin)).find((f) => f.id === ids.f1)?.imagens, 1);
    // imagem de outro fluxo não entra
    const outra = ok(await fx.enviarImagem(o.equipe, ids.f2, await png("#334455")));
    assert.equal(erro(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "criar_no", tipo: "imagem", imagemId: outra.imagem.id }]))), "vinculo");
    // quem é restrito e não alcança o fluxo não lê a imagem
    const foraImg = ok(await fx.enviarImagem(o.gestor, ids.fora, await png("#123456"))).imagem;
    ok(await pessoas.salvarAcesso(o.admin, o.leitura.sub, true, [ids.cliSim]));
    try {
      assert.equal(await fx.lerImagem(o.leitura, foraImg.id, foraImg.sha256), null);
      assert.ok(await fx.lerImagem(o.leitura, ids.img, ids.sha));
    } finally {
      ok(await pessoas.salvarAcesso(o.admin, o.leitura.sub, false, []));
    }
  });

  test("bytes não saem pela tabela; hash conferido; imagem não muda nem sai enquanto um nó usa", async () => {
    for (const q of [
      sql`select webp from maestro.fluxo_imagens`,
      sql`select mini from maestro.fluxo_imagens`,
      sql`select * from maestro.fluxo_imagens`,
      sql`update maestro.fluxo_imagens set largura = 1`,
    ]) {
      assert.equal(codigoPg(await erroDe(getBanco().asUser(o.admin, (tx) => tx.execute(q)))), PG.semPrivilegio, String(q));
    }
    const hash = await erroDe(
      getBanco().asSystem("teste", (tx) =>
        tx.execute(sql`
          insert into maestro.fluxo_imagens (org_id, fluxo_id, sha256, largura, altura, webp, mini, mini_largura, mini_altura)
          values (${o.orgA}, ${ids.f1}, ${"0".repeat(64)}, 1, 1, '\\x52494646'::bytea, '\\x52'::bytea, 1, 1)`),
      ),
    );
    assert.equal(codigoPg(hash), PG.checagem);
    const usada = await erroDe(getBanco().asUser(o.admin, (tx) => tx.execute(sql`delete from maestro.fluxo_imagens where id = ${ids.img}`)));
    assert.equal(codigoPg(usada), PG.chaveEstrangeira);
  });

  test("cota: a mensagem diz quanto; por fluxo; a limpeza libera antes de dizer não", async () => {
    const uso = await fx.usoDasImagens(o.leitura);
    assert.equal(uso.limite, COTA.bytesPorOrganizacao);
    assert.equal(uso.imagens, 3);
    assert.ok(uso.usado > 0);
    assert.deepEqual(await fx.usoDasImagens(o.b), { usado: 0, limite: COTA.bytesPorOrganizacao, imagens: 0, imagensPorFluxo: COTA.imagensPorFluxo });
    // cota pequena só neste banco de teste: cabe o que já tem e mais nada
    await getBanco().asSystem("teste", (tx) =>
      tx.execute(
        sql.raw(`create or replace function maestro.fluxo_cota(p_org uuid) returns table (bytes bigint, imagens_por_fluxo integer)
        language sql immutable set search_path = '' as $$ select ${uso.usado + 10}::bigint, 300 $$`),
      ),
    );
    try {
      const c = await fx.enviarImagem(o.equipe, ids.f1, await png("#abcdef"));
      assert.ok(!c.ok && c.erro === "cota", JSON.stringify(c));
      assert.match(c.mensagem, /chegaram ao limite \(.+ de .+\)/);
      // uma imagem solta (sem nó) com mais de 1 hora: a limpeza tira e a próxima cabe
      await getBanco().asSystem("teste", (tx) =>
        tx.execute(sql`update maestro.fluxo_imagens set criado_em = now() - interval '2 hours' where fluxo_id = ${ids.f2}`),
      );
      const depois = await fx.enviarImagem(o.equipe, ids.f1, await png("#334455"));
      assert.ok(depois.ok, JSON.stringify(depois));
      const [{ n }] = (await getBanco().asSystem("teste", (tx) =>
        tx.execute(sql`select count(*)::int as n from maestro.fluxo_imagens where fluxo_id = ${ids.f2}`),
      )) as unknown as { n: number }[];
      assert.equal(n, 0, "a solta saiu");
      // por fluxo
      await getBanco().asSystem("teste", (tx) =>
        tx.execute(
          sql.raw(`create or replace function maestro.fluxo_cota(p_org uuid) returns table (bytes bigint, imagens_por_fluxo integer)
          language sql immutable set search_path = '' as $$ select 209715200::bigint, 2 $$`),
        ),
      );
      const f = await fx.enviarImagem(o.equipe, ids.f1, await png("#fedcba"));
      assert.ok(!f.ok && f.erro === "cota_fluxo" && /2 imagens/.test(f.mensagem), JSON.stringify(f));
    } finally {
      await getBanco().asSystem("teste", (tx) =>
        tx.execute(
          sql.raw(`create or replace function maestro.fluxo_cota(p_org uuid) returns table (bytes bigint, imagens_por_fluxo integer)
          language sql immutable set search_path = '' as $$ select 200::bigint * 1024 * 1024, 300 $$`),
        ),
      );
    }
  });

  test("limpeza: lápide com mais de 7 dias sai de vez; a recente fica", async () => {
    ok(
      await fx.aplicarOps(
        o.equipe,
        ids.f1,
        ops([
          { op: "criar_no", id: U(30), tipo: "nota", dados: { texto: "velha" } },
          { op: "apagar_no", id: U(30) },
        ]),
      ),
    );
    await getBanco().asSystem("teste", (tx) => tx.execute(sql`update maestro.fluxo_nos set apagado_em = now() - interval '8 days' where id = ${U(30)}`));
    const l = ok(await fx.limparFluxos(o.equipe));
    assert.equal(l.nos, 1);
    const f = await fx.obterFluxo(o.admin, ids.f1);
    assert.ok(f);
    const [{ n }] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select count(*)::int as n from maestro.fluxo_nos where id in (${U(30)}, ${U(4)})`),
    )) as unknown as {
      n: number;
    }[];
    assert.equal(n, 1, "U(4) foi para a lápide agora há pouco e fica");
  });
});

describe("limites, lixeira e apagar de vez", () => {
  test("2.000 itens vivos por fluxo; voltar da lápide também conta", async () => {
    const f = ok(await fx.criarFluxo(o.admin, { titulo: "Cheio" })).id;
    await getBanco().asUser(o.admin, (tx) =>
      tx.execute(sql`insert into maestro.fluxo_nos (org_id, fluxo_id, tipo, w, h) select ${o.orgA}, ${f}, 'nota', 100, 100 from generate_series(1, 1999)`),
    );
    ok(await fx.aplicarOps(o.admin, f, ops([{ op: "criar_no", id: U(40), tipo: "nota", dados: {} }])));
    assert.equal(erro(await fx.aplicarOps(o.admin, f, ops([{ op: "criar_no", tipo: "nota", dados: {} }]))), "limite");
    ok(await fx.aplicarOps(o.admin, f, ops([{ op: "apagar_no", id: U(40) }])));
    ok(await fx.aplicarOps(o.admin, f, ops([{ op: "criar_no", tipo: "nota", dados: {} }])));
    assert.equal(erro(await fx.aplicarOps(o.admin, f, ops([{ op: "restaurar_no", id: U(40) }]))), "limite");
    ok(await fx.lixeiraFluxo(o.admin, f, true));
    ok(await fx.apagarFluxoDeVez(o.admin, f));
  });

  test("lixeira: some da lista, não aceita mudança; apagar de vez só da lixeira e só administração e gestão", async () => {
    ok(await fx.lixeiraFluxo(o.equipe, ids.f1, true));
    assert.equal(
      (await fx.listarFluxos(o.admin)).some((x) => x.id === ids.f1),
      false,
    );
    assert.equal(
      (await fx.listarFluxos(o.admin, { lixeira: true })).some((x) => x.id === ids.f1),
      true,
    );
    assert.ok(await fx.obterFluxo(o.leitura, ids.f1), "na lixeira ainda se vê");
    assert.equal(erro(await fx.aplicarOps(o.equipe, ids.f1, ops([{ op: "mudar_no", id: U(2), x: 1 }]))), "na_lixeira");
    assert.equal(erro(await fx.enviarImagem(o.equipe, ids.f1, await png("#010203"))), "nao_existe");
    assert.ok(await fx.lerImagem(o.leitura, ids.img, ids.sha), "a imagem do fluxo na lixeira ainda abre");
    assert.equal(erro(await fx.apagarFluxoDeVez(o.equipe, ids.f1)), "sem_permissao");
    assert.equal(erro(await fx.apagarFluxoDeVez(o.admin, ids.f2)), "fora_da_lixeira");
    const antes = await fx.usoDasImagens(o.admin);
    const r = ok(await fx.apagarFluxoDeVez(o.gestor, ids.f1));
    assert.ok(r.bytes > 0);
    const depois = await fx.usoDasImagens(o.admin);
    assert.equal(depois.usado, antes.usado - r.bytes, "libera a cota");
    assert.equal(await fx.obterFluxo(o.admin, ids.f1), null);
    const [{ n }] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(
        sql`select (select count(*) from maestro.fluxo_nos where fluxo_id = ${ids.f1})::int + (select count(*) from maestro.fluxo_imagens where fluxo_id = ${ids.f1})::int as n`,
      ),
    )) as unknown as { n: number }[];
    assert.equal(n, 0);
  });

  test("demonstração sai; organização apagada leva tudo", async () => {
    const d = ok(await fx.criarFluxo(o.admin, { titulo: "Demo", demo: true })).id;
    ok(await fx.enviarImagem(o.admin, d, await png("#999999")));
    const r = await getBanco().asUser(o.admin, (tx) => tx.execute(sql`delete from maestro.fluxos where demo returning id`));
    assert.equal(r.length, 1);
    await getBanco().asSystem("teste", (tx) => tx.execute(sql`delete from maestro.organizations where id = ${o.orgA}`));
    const [{ n }] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`
        select (select count(*) from maestro.fluxos where org_id = ${o.orgA})::int + (select count(*) from maestro.fluxo_nos where org_id = ${o.orgA})::int
             + (select count(*) from maestro.fluxo_ligacoes where org_id = ${o.orgA})::int + (select count(*) from maestro.fluxo_imagens where org_id = ${o.orgA})::int as n`),
    )) as unknown as { n: number }[];
    assert.equal(n, 0);
    assert.equal((await fx.listarFluxos(o.b)).length, 1, "a B segue com o dela");
  });
});
