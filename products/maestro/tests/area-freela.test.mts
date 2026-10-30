// A área do freela (drizzle/0037): quem tem a conta ligada a freelas de duas produtoras vê só as próprias escalas,
// com só os campos da lista (nada interno, nada dos outros); freela A não vê nada do freela B; produtora sem o Maestro
// ou em que a pessoa é da equipe fica de fora; no escopo do freela, nenhuma tabela da produtora responde direto; o
// cliente some quando a produtora não mostra; confirmar/recusar só a própria escala, só enquanto não passou, auditado,
// e a resposta vale para as datas em que foi dada; a produtora lê e não grava; acesso por cliente vale para a
// resposta; o recado e o link de entrega; a sessão do freela não passa em nenhuma rota nem ação da produtora.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { pedido, prepararAmbiente, UUID } from "./ambiente.mts";

const amb = await prepararAmbiente("area_freela");
const { getBanco, schema, codigoPg } = amb.banco;
const area = await import("../src/lib/freelas/area");
const fr = await import("../src/lib/freelas/servidor");
const { criarSessao, autenticar } = await import("../src/lib/auth/sessao");
const { temAcesso } = await import("../src/lib/auth/acesso");
const quadro = await import("../src/lib/quadro/rota");
const { hojeBr, somarDias } = await import("../src/lib/dinheiro");

const ANA = UUID(); // admin da Lumière
const TEO = UUID(); // equipe da Lumière, restrito ao cliente Sim
const LEO = UUID(); // leitura da Lumière
const BIA = UUID(); // admin da Aurora
const A = UUID(); // freela A: Lumière e Aurora (e uma produtora sem o Maestro)
const B = UUID(); // freela B: só Lumière
const MIX = UUID(); // da equipe da Lumière e freela na Aurora
const NADA = UUID(); // conta sem vínculo nenhum
const hoje = hojeBr();
const amanha = somarDias(hoje, 1);
const semana = somarDias(hoje, 7);
const passado = somarDias(hoje, -10);

let lum: string;
let aur: string;
let semMaestro: string;
let proprio: string; // a organização pessoal do freela A no HUB
const e: Record<string, string> = {};
const f: Record<string, string> = {};
const SEGREDO = ["NOTA INTERNA", "BRIEFING INTERNO", "123.456.789-09", "chave-pix-secreta", "freela-b@exemplo.com", "999999"];

const ctx = (sub: string, o: string) => ({ sub, orgId: o });
const tx = <T,>(fn: (t: Parameters<Parameters<ReturnType<typeof getBanco>["asSystem"]>[1]>[0]) => Promise<T>) => getBanco().asSystem("teste", fn);
const um = async (q: ReturnType<typeof sql>) => ((await tx((t) => t.execute(q))) as unknown as { id: string }[])[0].id;

before(async () => {
  await tx(async (t) => {
    const org = async (nome: string, produtos: string[]) =>
      (await t.insert(schema.organizations).values({ zroOrgId: UUID(), name: nome, zroProducts: produtos }).returning({ id: schema.organizations.id }))[0].id;
    lum = await org("Lumière Filmes", ["maestro"]);
    aur = await org("Aurora Conteúdo", ["maestro"]);
    semMaestro = await org("Sem Maestro", []);
    proprio = await org("Conta do freela A", []);
    await t.insert(schema.members).values([
      { orgId: lum, zroSub: ANA, role: "admin", displayName: "Ana" },
      { orgId: lum, zroSub: TEO, role: "equipe", displayName: "Téo" },
      { orgId: lum, zroSub: LEO, role: "leitura", displayName: "Leo" },
      { orgId: lum, zroSub: MIX, role: "equipe", displayName: "Mia" },
      { orgId: aur, zroSub: BIA, role: "admin", displayName: "Bia" },
      { orgId: proprio, zroSub: A, role: "admin", displayName: "Alice Freela", hubRole: "owner" },
    ]);
    await t.execute(
      sql`insert into maestro.org_marca (org_id, nome, cor, telefone, email) values (${lum}, 'Lumière', '#0f7b5f', '11 98888-7777', 'producao@lumiere.exemplo')`,
    );
    // A Aurora não mostra o cliente ao freela (Ajustes → Empresa).
    await t.execute(
      sql`update maestro.organizations set settings = jsonb_build_object('empresa', jsonb_build_object('freelaVeCliente', false)) where id = ${aur}`,
    );
  });
  const freela = (o: string, nome: string, sub: string | null) =>
    um(
      sql`insert into maestro.freelas (org_id, nome, zro_sub, email, notas) values (${o}, ${nome}, ${sub}, ${nome === "Bruno" ? "freela-b@exemplo.com" : null}, 'NOTA INTERNA') returning id`,
    );
  f.aLum = await freela(lum, "Alice", A);
  f.bLum = await freela(lum, "Bruno", B);
  f.mixLum = await freela(lum, "Mia", MIX); // é da equipe aqui: não conta
  f.aAur = await freela(aur, "Alice", A);
  f.mixAur = await freela(aur, "Mia", MIX);
  f.aSem = await freela(semMaestro, "Alice", A);
  await tx((t) =>
    t.execute(
      sql`insert into maestro.freela_pagamento (org_id, freela_id, documento_enc, pix_enc) values (${lum}, ${f.bLum}, 'v1.123.456.789-09', 'v1.chave-pix-secreta')`,
    ),
  );
  const cliSim = await um(sql`insert into maestro.clients (org_id, name, document) values (${lum}, 'Café Aurora', '999999') returning id`);
  const cliNao = await um(sql`insert into maestro.clients (org_id, name) values (${lum}, 'Outro Cliente') returning id`);
  const cliAur = await um(sql`insert into maestro.clients (org_id, name) values (${aur}, 'Cliente Escondido') returning id`);
  const projLum = await um(
    sql`insert into maestro.projects (org_id, code, title, client_id, briefing, value_cents) values (${lum}, 'MAE-2026-001', 'Filme do café', ${cliSim}, 'BRIEFING INTERNO', 9900000) returning id`,
  );
  const projNao = await um(
    sql`insert into maestro.projects (org_id, code, title, client_id) values (${lum}, 'MAE-2026-002', 'Outro projeto', ${cliNao}) returning id`,
  );
  const projAur = await um(
    sql`insert into maestro.projects (org_id, code, title, client_id) values (${aur}, 'MAE-2026-001', 'Série Aurora', ${cliAur}) returning id`,
  );
  const evento = await um(
    sql`insert into maestro.eventos (org_id, projeto_id, tipo, titulo, data, data_fim, hora_ini, hora_fim, local, notas)
        values (${lum}, ${projLum}, 'diaria', 'Diária na cafeteria', ${amanha}, ${somarDias(amanha, 1)}, '08:00', '18:30', 'Rua Augusta, 100', 'NOTA INTERNA') returning id`,
  );
  const escala = (o: string, freelaId: string, ini: string, fim: string, extra: { projeto?: string; evento?: string; diaria?: number; valor?: number } = {}) =>
    um(sql`insert into maestro.escalas (org_id, projeto_id, evento_id, freela_id, funcao, inicio, fim, dias, diaria_cents, valor_cents, notas)
           values (${o}, ${extra.projeto ?? null}, ${extra.evento ?? null}, ${freelaId}, 'captacao-camera', ${ini}, ${fim}, 2, ${extra.diaria ?? null}, ${extra.valor ?? 0}, 'NOTA INTERNA') returning id`);
  e.aLum = await escala(lum, f.aLum, amanha, somarDias(amanha, 1), { projeto: projLum, evento, diaria: 50000, valor: 100000 });
  e.bLum = await escala(lum, f.bLum, amanha, somarDias(amanha, 1), { projeto: projLum, evento, diaria: 77700, valor: 155400 });
  e.aLumPassada = await escala(lum, f.aLum, passado, passado, { projeto: projLum, valor: 30000 });
  e.aLumNao = await escala(lum, f.aLum, semana, semana, { projeto: projNao, valor: 0 });
  e.aAur = await escala(aur, f.aAur, semana, semana, { projeto: projAur, valor: 80000 });
  e.mixLum = await escala(lum, f.mixLum, semana, semana, { projeto: projLum });
  e.mixAur = await escala(aur, f.mixAur, semana, semana, { projeto: projAur });
  e.aSem = await escala(semMaestro, f.aSem, semana, semana);
  // A passada foi paga (a escala gerou o "a pagar" pelo gatilho).
  await tx((t) => t.execute(sql`update maestro.lancamentos set pago_cents = valor_cents where escala_id = ${e.aLumPassada}`));
  await tx((t) =>
    t.execute(
      sql`update maestro.escalas set para_freela = 'Levar o kit de luz.', entrega_url = 'https://drive.google.com/drive/folders/abc' where id = ${e.aLum}`,
    ),
  );
  // Téo (equipe) só vê o cliente Sim.
  await tx(async (t) => {
    await t.execute(sql`insert into maestro.acesso_restrito (org_id, zro_sub) values (${lum}, ${TEO})`);
    await t.execute(sql`insert into maestro.acesso_clientes (org_id, zro_sub, cliente_id) values (${lum}, ${TEO}, ${cliSim})`);
  });
});
after(async () => {
  await amb.fechar();
});

describe("quem é freela de quem", () => {
  test("as produtoras com o Maestro, sem a da equipe e sem a que não tem o Maestro", async () => {
    assert.deepEqual((await area.produtorasDoFreela(A)).map((p) => p.org).sort(), [lum, aur].sort());
    assert.deepEqual(
      (await area.produtorasDoFreela(B)).map((p) => p.org),
      [lum],
    );
    assert.deepEqual(
      (await area.produtorasDoFreela(MIX)).map((p) => p.org),
      [aur],
    );
    assert.deepEqual(await area.produtorasDoFreela(NADA), []);
    assert.deepEqual(await area.produtorasDoFreela("nao-e-uuid"), []);
    const l = (await area.produtorasDoFreela(A)).find((p) => p.org === lum)!;
    assert.equal(l.nome, "Lumière");
    assert.equal(l.cor, "#0f7b5f");
  });

  test("freela desativado sai", async () => {
    await tx((t) => t.execute(sql`update maestro.freelas set ativo = false where id = ${f.aAur}`));
    assert.deepEqual(
      (await area.produtorasDoFreela(A)).map((p) => p.org),
      [lum],
    );
    await tx((t) => t.execute(sql`update maestro.freelas set ativo = true where id = ${f.aAur}`));
  });
});

describe("Seus trabalhos", () => {
  test("A vê só as escalas dele, nas duas produtoras, com o próprio dinheiro", async () => {
    const r = await area.trabalhosDoFreela(A);
    const ids = r.flatMap((p) => p.trabalhos.map((t) => t.id)).sort();
    assert.deepEqual(ids, [e.aLum, e.aLumPassada, e.aLumNao, e.aAur].sort());
    const t = r.find((p) => p.org === lum)!.trabalhos.find((x) => x.id === e.aLum)!;
    assert.equal(t.titulo, "Diária na cafeteria");
    assert.equal(t.projeto, "Filme do café");
    assert.equal(t.cliente, "Café Aurora");
    assert.equal(t.horaIni, "08:00");
    assert.equal(t.horaFim, "18:30");
    assert.equal(t.local, "Rua Augusta, 100");
    assert.equal(t.diariaCents, 50000);
    assert.equal(t.valorCents, 100000);
    assert.equal(t.temRecado, true);
    assert.equal(t.entrega, "https://drive.google.com/drive/folders/abc");
    assert.equal(r.find((p) => p.org === lum)!.trabalhos.find((x) => x.id === e.aLumPassada)!.pago, true);
    assert.equal(t.pago, false);
  });

  test("nada interno nem dos outros sai (nem na lista nem na ficha)", async () => {
    const lista = JSON.stringify(await area.trabalhosDoFreela(A));
    const ficha = JSON.stringify(await area.trabalhoDoFreela(A, e.aLum));
    for (const s of [lista, ficha]) {
      for (const x of SEGREDO) assert.ok(!s.includes(x), `vazou ${x}`);
      assert.ok(!s.includes("77700") && !s.includes("155400"), "valor do outro freela");
      assert.ok(!s.includes("9900000"), "valor do projeto");
      assert.ok(!s.includes("Bruno"), "outro freela");
      assert.ok(!s.includes(f.bLum) && !s.includes(e.bLum), "id do outro");
    }
  });

  test("a produtora que não mostra o cliente", async () => {
    const t = (await area.trabalhosDoFreela(A)).find((p) => p.org === aur)!.trabalhos[0];
    assert.equal(t.cliente, null);
    assert.ok(!JSON.stringify(await area.trabalhoDoFreela(A, e.aAur)).includes("Cliente Escondido"));
  });

  test("B vê só a dele; um não abre a do outro", async () => {
    const r = await area.trabalhosDoFreela(B);
    assert.deepEqual(
      r.flatMap((p) => p.trabalhos.map((t) => t.id)),
      [e.bLum],
    );
    assert.equal(await area.trabalhoDoFreela(B, e.aLum), null);
    assert.equal(await area.trabalhoDoFreela(A, e.bLum), null);
    assert.equal(await area.trabalhoDoFreela(A, e.aSem), null, "produtora sem o Maestro");
    assert.equal(await area.trabalhoDoFreela(MIX, e.mixLum), null, "da equipe ali");
    assert.ok(await area.trabalhoDoFreela(MIX, e.mixAur));
    assert.equal(await area.trabalhoDoFreela(NADA, e.aLum), null);
    assert.equal(await area.trabalhoDoFreela(A, UUID()), null);
  });

  test("a ficha traz o recado e o contato da produtora", async () => {
    const d = (await area.trabalhoDoFreela(A, e.aLum))!;
    assert.equal(d.recado, "Levar o kit de luz.");
    assert.deepEqual(d.contato, { telefone: "11 98888-7777", email: "producao@lumiere.exemplo" });
    assert.equal(d.marca.nome, "Lumière");
  });

  test("no escopo do freela, nenhuma tabela da produtora responde direto", async () => {
    const tabelas = (await tx((t) =>
      t.execute(sql`select tablename from pg_tables where schemaname = 'maestro' and tablename <> '__drizzle_migrations' order by 1`),
    )) as unknown as { tablename: string }[];
    assert.ok(tabelas.length > 40);
    for (const { tablename } of tabelas) {
      if (tablename === "escala_respostas") continue;
      let n = 0;
      try {
        const [r] = (await getBanco().asFreela(A, (t) => t.execute(sql.raw(`select count(*)::int as n from maestro.${tablename}`)))) as unknown as {
          n: number;
        }[];
        n = r.n;
      } catch (err) {
        assert.equal(codigoPg(err), "42501", tablename);
      }
      // A tabela de referência sem organização (preços da ANP) é pública para o app; o resto, zero.
      if (tablename !== "combustivel_precos") assert.equal(n, 0, `escopo do freela leu ${tablename}`);
    }
    // e as portas da produtora não abrem
    await assert.rejects(getBanco().asFreela(A, (t) => t.execute(sql`select maestro.card_criar('x', '{}'::jsonb)`)));
  });

  test("a porta só funciona sem organização: com a sessão da produtora, nada", async () => {
    const [r] = (await getBanco().asUser(ctx(ANA, lum), (t) =>
      t.execute(sql`select maestro.freela_trabalhos() as j, maestro.freela_trabalho(${e.aLum}::uuid) as d`),
    )) as unknown as {
      j: unknown[];
      d: unknown;
    }[];
    assert.deepEqual(r.j, []);
    assert.equal(r.d, null);
  });
});

describe("confirmar ou recusar", () => {
  test("A confirma a dele; a produtora vê; auditado", async () => {
    assert.ok((await area.responderTrabalho(A, e.aLum, "confirmado")).ok);
    assert.equal((await area.trabalhoDoFreela(A, e.aLum))!.resposta, "confirmado");
    const equipe = await fr.escalasDoProjeto(
      ctx(ANA, lum),
      ((await tx((t) => t.execute(sql`select projeto_id as id from maestro.escalas where id = ${e.aLum}`))) as unknown as { id: string }[])[0].id,
      hoje,
    );
    const minha = equipe.find((x) => x.id === e.aLum)!;
    assert.equal(minha.resposta, "confirmado");
    assert.equal(minha.conta, true);
    assert.equal(equipe.find((x) => x.id === e.bLum)!.resposta, null);
    assert.ok((await area.responderTrabalho(A, e.aLum, "recusado")).ok);
    assert.equal((await area.trabalhoDoFreela(A, e.aLum))!.resposta, "recusado");
    const log = (await tx((t) =>
      t.execute(sql`select action, actor_sub from maestro.audit_log where target_type = 'escala' and target_id = ${e.aLum} order by created_at, id`),
    )) as unknown as { action: string; actor_sub: string }[];
    assert.deepEqual(
      log.map((l) => l.action),
      ["escala.freela_confirmou", "escala.freela_recusou"],
    );
    assert.ok(log.every((l) => l.actor_sub === A));
  });

  test("B não responde a de A; ninguém responde a que passou; resposta inválida", async () => {
    assert.equal((await area.responderTrabalho(B, e.aLum, "confirmado")).ok, false);
    assert.equal((await area.responderTrabalho(NADA, e.aLum, "confirmado")).ok, false);
    const r = await area.responderTrabalho(A, e.aLumPassada, "confirmado");
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.erro, "passou");
    assert.equal((await area.responderTrabalho(A, e.aLum, "talvez")).ok, false);
    // B tentando gravar direto na tabela, pela escala de A
    await assert.rejects(
      getBanco().asFreela(B, (t) =>
        t.execute(
          sql`insert into maestro.escala_respostas (org_id, escala_id, zro_sub, resposta, inicio, fim) values (${lum}, ${e.aLum}, ${B}, 'confirmado', current_date, current_date)`,
        ),
      ),
    );
    // B não lê a resposta de A
    const [n] = (await getBanco().asFreela(B, (t) => t.execute(sql`select count(*)::int as n from maestro.escala_respostas`))) as unknown as { n: number }[];
    assert.equal(n.n, 0);
  });

  test("a produtora lê, mas não grava a resposta", async () => {
    for (const sub of [ANA, TEO]) {
      await assert.rejects(
        getBanco().asUser(ctx(sub, lum), (t) =>
          t.execute(
            sql`insert into maestro.escala_respostas (org_id, escala_id, zro_sub, resposta, inicio, fim) values (${lum}, ${e.bLum}, ${B}, 'confirmado', current_date, current_date)`,
          ),
        ),
      );
      await getBanco().asUser(ctx(sub, lum), (t) => t.execute(sql`update maestro.escala_respostas set resposta = 'confirmado'`));
    }
    assert.equal((await area.trabalhoDoFreela(A, e.aLum))!.resposta, "recusado");
    // Bia (outra produtora) não lê nada da Lumière
    const [n] = (await getBanco().asUser(ctx(BIA, aur), (t) => t.execute(sql`select count(*)::int as n from maestro.escala_respostas`))) as unknown as {
      n: number;
    }[];
    assert.equal(n.n, 0);
  });

  test("acesso por cliente vale para a resposta", async () => {
    assert.ok((await area.responderTrabalho(A, e.aLumNao, "confirmado")).ok);
    const ver = async (sub: string) =>
      (
        (await getBanco().asUser(ctx(sub, lum), (t) => t.execute(sql`select escala_id from maestro.escala_respostas order by escala_id`))) as unknown as {
          escala_id: string;
        }[]
      ).map((x) => x.escala_id);
    assert.deepEqual(await ver(ANA), [e.aLum, e.aLumNao].sort());
    assert.deepEqual(await ver(TEO), [e.aLum]);
  });

  test("mudou a data, a resposta volta a esperar", async () => {
    await getBanco().asUser(ctx(ANA, lum), (t) => t.execute(sql`update maestro.escalas set inicio = ${semana}, fim = ${semana} where id = ${e.aLum}`));
    assert.equal((await area.trabalhoDoFreela(A, e.aLum))!.resposta, null);
    assert.ok((await area.responderTrabalho(A, e.aLum, "confirmado")).ok);
    assert.equal((await area.trabalhoDoFreela(A, e.aLum))!.resposta, "confirmado");
  });
});

describe("o recado e o link para o freela", () => {
  test("só link https; leitura não grava; o freela vê", async () => {
    assert.equal(fr.validarParaFreela({ recado: "x", entrega: "http://exemplo.com" }).ok, false);
    assert.equal(fr.validarParaFreela({ recado: "x", entrega: "javascript:alert(1)" }).ok, false);
    assert.equal(fr.validarParaFreela({ recado: "x".repeat(2001), entrega: "" }).ok, false);
    const v = fr.validarParaFreela({ recado: " Chegar 7h30.\r\nFigurino preto. ", entrega: "https://wetransfer.com/x" });
    assert.ok(v.ok);
    assert.deepEqual(v.entrada, { recado: "Chegar 7h30.\nFigurino preto.", entrega: "https://wetransfer.com/x" });
    assert.equal((await fr.salvarParaFreela(ctx(LEO, lum), e.aLum, v.entrada)).ok, false);
    assert.equal((await fr.salvarParaFreela(ctx(BIA, aur), e.aLum, v.entrada)).ok, false, "outra produtora");
    assert.ok((await fr.salvarParaFreela(ctx(TEO, lum), e.aLum, v.entrada)).ok);
    const d = (await area.trabalhoDoFreela(A, e.aLum))!;
    assert.equal(d.recado, "Chegar 7h30.\nFigurino preto.");
    assert.equal(d.entrega, "https://wetransfer.com/x");
    // o banco também recusa link sem https
    await assert.rejects(tx((t) => t.execute(sql`update maestro.escalas set entrega_url = 'http://x.com' where id = ${e.aLum}`)));
  });
});

describe("a sessão do freela não entra na produtora", () => {
  test("sem acesso ao Maestro: rota de dados 403; a porta de dados pela sessão dele é a dele", async () => {
    const { token } = await criarSessao({ orgId: proprio, sub: A, produtos: [], release: { maestro: "closed" }, tokens: null });
    const s = (await autenticar(token))!;
    assert.equal(temAcesso(s), false);
    const r = await quadro.getQuadro(pedido("/api/quadro", { cookies: { mae_sessao: token } }));
    assert.equal(r.status, 403);
    // A organização da sessão é a dele: nem com ela a produtora aparece.
    const [n] = (await getBanco().asUser(ctx(A, proprio), (t) => t.execute(sql`select count(*)::int as n from maestro.escalas`))) as unknown as { n: number }[];
    assert.equal(n.n, 0);
  });
});

describe("puro", () => {
  test("próximos e anteriores, período, horário e quando", () => {
    const t = (inicio: string, fim = inicio) => ({ inicio, fim });
    const { proximos, anteriores } = area.separar([t("2026-11-10"), t("2026-10-01"), t("2026-10-29", "2026-10-31"), t("2026-10-20")], "2026-10-30");
    assert.deepEqual(
      proximos.map((x) => x.inicio),
      ["2026-10-29", "2026-11-10"],
    );
    assert.deepEqual(
      anteriores.map((x) => x.inicio),
      ["2026-10-20", "2026-10-01"],
    );
    assert.equal(area.periodo("2026-11-05", "2026-11-05"), "qui, 5 nov");
    assert.equal(area.periodo("2026-11-05", "2026-11-07"), "5–7 nov");
    assert.equal(area.periodo("2026-10-30", "2026-11-02"), "30 out – 2 nov");
    assert.equal(area.horario("08:00", "18:30"), "8h – 18h30");
    assert.equal(area.horario("07:30", null), "7h30");
    assert.equal(area.horario(null, "10:00"), null);
    assert.equal(area.quando("2026-10-30", "2026-10-30", "2026-10-30"), "Hoje");
    assert.equal(area.quando("2026-10-31", "2026-10-31", "2026-10-30"), "Amanhã");
    assert.equal(area.quando("2026-11-03", "2026-11-03", "2026-10-30"), "Em 4 dias");
    assert.equal(area.quando("2026-12-03", "2026-12-03", "2026-10-30"), null);
  });
});
