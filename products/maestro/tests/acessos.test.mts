// O que cada pessoa vê (drizzle/0027, src/lib/acessos.ts; pedido do titular, 29/10/2026): seis áreas sensíveis com
// padrão por papel e ajuste por pessoa feito só pela administração. A regra é do banco: quem não tem a área não recebe
// nada pelas tabelas (asUser direto), pelas funções do servidor, pelo resumo da Z nem pela sessão; o gatilho impede
// gravar o valor que a pessoa não vê; a administração muda e fica na auditoria.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { CLIENTE, pedido, prepararAmbiente, UUID } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("acessos");
const { getBanco, codigoPg, PG } = amb.banco;
const acessos = await import("../src/lib/acessos");
const srv = await import("../src/lib/acessos-servidor");
const nav = await import("../src/lib/navegacao");
const pessoas = await import("../src/lib/pessoas");
const fr = await import("../src/lib/freelas/servidor");
const kit = await import("../src/lib/freelas/equipamentos");
const inv = await import("../src/lib/inventario/servidor");
const funil = await import("../src/lib/funil/servidor");
const ped = await import("../src/lib/pedidos/equipe");
const hoje = await import("../src/lib/hoje");
const precos = await import("../src/lib/orcamento/precos");
const orc = await import("../src/lib/orcamento/orcamentos");
const { criarSessao, autenticar } = await import("../src/lib/auth/sessao");
const { rotaResumoDaZ, ACAO_RESUMO } = await import("../src/lib/zro/resumo-da-z");
const { hojeBr } = await import("../src/lib/dinheiro");

let o: Awaited<ReturnType<typeof duasOrganizacoes>>;
/** Gui: gestão SEM ajuste (o padrão). Fia: equipe com o Financeiro ligado pela administração ("a pessoa do financeiro"). */
const GUI = UUID();
const FIA = UUID();
const gui = () => ({ sub: GUI, orgId: o.orgA });
const fia = () => ({ sub: FIA, orgId: o.orgA });
const ids: Record<string, string> = {};
const HOJE = hojeBr();

const contar = (ctx: { sub: string; orgId: string }, tabela: string) =>
  getBanco()
    .asUser(ctx, (tx) => tx.execute(sql.raw(`select count(*)::int as n from maestro.${tabela}`)))
    .then((r) => (r[0] as { n: number }).n);

/** Cada área e as tabelas inteiras dela (o RLS `<tabela>_area`). */
const TABELAS_DA_AREA: Record<string, string[]> = {
  financeiro: ["lancamentos", "baixas", "recorrencias", "metas"],
  orcamentos: ["orcamentos", "orcamento_itens", "precos_itens", "precos_faixas", "precos_variaveis", "orcamento_modelos", "links_publicos"],
  contratos: ["contrato_modelos"],
  diarias: ["freela_valores"],
  dados_equipe: ["freela_pagamento"],
};

before(async () => {
  o = await duasOrganizacoes();
  await getBanco().asSystem("semente", async (tx) => {
    const A = o.orgA;
    const um = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { id: string }[])[0].id;
    await tx.execute(sql`insert into maestro.members (org_id, zro_sub, role, display_name, email) values
      (${A}, ${GUI}, 'gestor', 'Gui', 'gui@a.invalid'), (${A}, ${FIA}, 'equipe', 'Fia', 'fia@a.invalid')`);
    const cliente = await um(sql`insert into maestro.clients (org_id, name) values (${A}, 'Cliente') returning id`);
    ids.projeto = await um(
      sql`insert into maestro.projects (org_id, code, title, client_id, value_cents) values (${A}, 'MAE-2026-001', 'Projeto', ${cliente}, 500000) returning id`,
    );
    const item = await um(sql`insert into maestro.precos_itens (org_id, nome, preco_cents, custo_cents) values (${A}, 'Diária', 150000, 60000) returning id`);
    await tx.execute(sql`insert into maestro.precos_faixas (org_id, item_id, a_partir_de, preco_cents) values (${A}, ${item}, 3, 120000)`);
    await tx.execute(sql`insert into maestro.precos_variaveis (org_id, chave, rotulo, tipo) values (${A}, 'nicho', 'Nicho', 'escolha')`);
    await tx.execute(sql`insert into maestro.orcamento_modelos (org_id, nome) values (${A}, 'Modelo')`);
    ids.orc = await um(
      sql`insert into maestro.orcamentos (org_id, numero, titulo, cliente_id, status) values (${A}, '2026-001', 'Orç', ${cliente}, 'enviado') returning id`,
    );
    await tx.execute(
      sql`insert into maestro.orcamento_itens (org_id, orcamento_id, descricao, preco_cents, custo_cents) values (${A}, ${ids.orc}, 'Linha', 150000, 60000)`,
    );
    await tx.execute(
      sql`insert into maestro.links_publicos (org_id, tipo, token_hash) values (${A}, 'pedido', ${createHash("sha256").update(UUID()).digest("hex")})`,
    );
    await tx.execute(
      sql`insert into maestro.contrato_modelos (org_id, versao, texto, created_by) values (${A}, 1, 'Contrato de prestação de serviços {{cliente}}', ${o.ANA})`,
    );
    ids.freela = await um(
      sql`insert into maestro.freelas (org_id, nome, funcoes, email, whatsapp) values (${A}, 'Rafa', '{edicao}', 'rafa@x.invalid', '5511999990000') returning id`,
    );
    await tx.execute(sql`insert into maestro.freela_valores (org_id, freela_id, funcao, valor_cents) values (${A}, ${ids.freela}, 'edicao', 80000)`);
    await tx.execute(sql`insert into maestro.freela_pagamento (org_id, freela_id, titular) values (${A}, ${ids.freela}, 'Rafa')`);
    ids.kit = await um(
      sql`insert into maestro.freela_equipamentos (org_id, freela_id, modelo, diaria_cents) values (${A}, ${ids.freela}, 'FX3', 20000) returning id`,
    );
    ids.equip = await um(sql`insert into maestro.equipamentos (org_id, nome, chave, valor_cents) values (${A}, 'Sony FX6', 'sonyfx6', 4500000) returning id`);
    ids.escala = await um(sql`insert into maestro.escalas (org_id, projeto_id, freela_id, funcao, inicio, fim, dias, diaria_cents, valor_cents)
      values (${A}, ${ids.projeto}, ${ids.freela}, 'edicao', '2026-11-02', '2026-11-03', 2, 80000, 160000) returning id`);
    const lanc = await um(
      sql`insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento) values (${A}, 'entrada', 'cliente', 'Parcela', 300000, ${HOJE}) returning id`,
    );
    await tx.execute(sql`insert into maestro.baixas (org_id, lancamento_id, valor_cents, data) values (${A}, ${lanc}, 100000, ${HOJE})`);
    await tx.execute(
      sql`insert into maestro.recorrencias (org_id, tipo, categoria, descricao, valor_cents, dia, inicio_mes) values (${A}, 'saida', 'fixo', 'Aluguel', 200000, 5, ${HOJE.slice(0, 7)})`,
    );
    await tx.execute(sql`insert into maestro.metas (org_id, mes, receita_cents) values (${A}, ${HOJE.slice(0, 7)}, 900000)`);
    ids.pedido = await um(
      sql`insert into maestro.pedidos (org_id, protocolo, nome, email, consentimento_em, valor_estimado_cents) values (${A}, 'PED00001', 'Lead', 'lead@x.com', now(), 250000) returning id`,
    );
    // Sessões para a Z (o último login de cada um, com acesso).
    for (const sub of [o.ANA, GUI, FIA, o.equipe.sub])
      await tx.execute(sql`
        insert into maestro.sessions (org_id, zro_sub, token_hash, produtos, zro_release, expires_at)
        values (${A}, ${sub}, ${createHash("sha256").update(UUID()).digest("hex")}, '{maestro}', '{"maestro":"allowed"}'::jsonb, now() + interval '1 day')`);
  });
  // A administração liga o Financeiro para a Fia (equipe).
  const r = await srv.salvarAreas(o.admin, FIA, ["financeiro"]);
  assert.ok(r.ok, r.ok ? "" : r.mensagem);
});
after(() => amb.fechar());

describe("o padrão de cada papel", () => {
  test("a tabela do TypeScript é a mesma do banco (maestro.area_padrao)", async () => {
    const r = (await getBanco().sql`
      select p.papel, a.area, maestro.area_padrao(p.papel, a.area) as v
        from unnest(${["admin", "gestor", "equipe", "leitura"]}::text[]) p(papel), unnest(${[...acessos.AREAS]}::text[]) a(area)`) as {
      papel: "admin";
      area: (typeof acessos.AREAS)[number];
      v: boolean;
    }[];
    assert.equal(r.length, 4 * acessos.AREAS.length);
    for (const x of r) assert.equal(acessos.PADRAO[x.papel][x.area], x.v, `${x.papel}/${x.area}`);
  });

  test("Criação: o nível de cada papel é o mesmo no TypeScript e no banco (maestro.criacao_padrao e pode_criacao)", async () => {
    const r = (await getBanco().sql`
      select p.papel, n.nivel, maestro.criacao_padrao(p.papel, n.nivel) as v
        from unnest(${["admin", "gestor", "equipe", "leitura"]}::text[]) p(papel), unnest(${[...acessos.NIVEIS_CRIACAO]}::text[]) n(nivel)`) as {
      papel: "admin";
      nivel: (typeof acessos.NIVEIS_CRIACAO)[number];
      v: boolean;
    }[];
    assert.equal(r.length, 12);
    for (const x of r) assert.equal(acessos.CRIACAO_PADRAO[x.papel][x.nivel], x.v, `${x.papel}/${x.nivel}`);
    const nivel = async (ctx: { sub: string; orgId: string }) =>
      (
        await getBanco().asUser(ctx, (tx) =>
          tx.execute(sql`select maestro.pode_criacao(${ctx.orgId}::uuid, 'ver') as ver, maestro.pode_criacao(${ctx.orgId}::uuid, 'editar') as editar,
                              maestro.pode_criacao(${ctx.orgId}::uuid, 'enviar') as enviar`),
        )
      )[0];
    assert.deepEqual({ ...(await nivel(o.leitura)) }, { ver: true, editar: false, enviar: false });
    assert.deepEqual({ ...(await nivel(o.equipe)) }, { ver: true, editar: true, enviar: false });
    assert.deepEqual({ ...(await nivel(o.gestor)) }, { ver: true, editar: true, enviar: true });
    assert.deepEqual({ ...(await nivel(o.forjado)) }, { ver: false, editar: false, enviar: false });
    assert.equal(acessos.podeCriacao({ papel: "equipe" }, "enviar"), false);
  });

  test("escolhas seguras: gestão sem Financeiro; equipe e leitura sem nenhuma área; administração com tudo, sempre", () => {
    assert.deepEqual(acessos.areasLigadas(acessos.PADRAO.gestor), ["orcamentos", "contratos", "diarias", "dados_equipe", "inventario_valores"]);
    assert.deepEqual(acessos.areasLigadas(acessos.PADRAO.equipe), []);
    assert.deepEqual(acessos.areasLigadas(acessos.PADRAO.leitura), []);
    // Administração ignora ajuste (não dá para trancar a conta por engano).
    assert.ok(acessos.veTudo(acessos.acessosDe("admin", { financeiro: false })));
    assert.equal(acessos.acessosDe("equipe", { financeiro: true }).financeiro, true);
    assert.equal(acessos.acessosDe("gestor", { contratos: false, x: true } as never).contratos, false);
    assert.equal(acessos.resumoDoAcesso("equipe", acessos.PADRAO.equipe), "Sem valores");
    assert.equal(acessos.resumoDoAcesso("equipe", acessos.acessosDe("equipe", { financeiro: true })), "Financeiro");
    assert.equal(acessos.resumoDoAcesso("admin", acessos.PADRAO.admin), "Tudo");
  });

  test("o banco devolve o mesmo que a tela calcula, pessoa por pessoa", async () => {
    assert.deepEqual(await srv.minhasAreas(o.admin), acessos.PADRAO.admin);
    assert.deepEqual(await srv.minhasAreas(gui()), acessos.PADRAO.gestor);
    assert.deepEqual(await srv.minhasAreas(o.equipe), acessos.PADRAO.equipe);
    assert.deepEqual(await srv.minhasAreas(fia()), acessos.acessosDe("equipe", { financeiro: true }));
    // Quem não é membro (a Ana forjando a B) não tem área nenhuma.
    assert.deepEqual(await srv.minhasAreas(o.forjado), acessos.PADRAO.leitura);
  });
});

describe("tabelas inteiras: quem não tem a área não lê nada", () => {
  test("cada área, para cada pessoa sem ela, devolve zero linhas; com ela, as linhas", async () => {
    const gente = { admin: o.admin, gui: gui(), fia: fia(), equipe: o.equipe, leitura: o.leitura };
    for (const [area, tabelas] of Object.entries(TABELAS_DA_AREA))
      for (const [quem, ctx] of Object.entries(gente)) {
        const tem = (await srv.minhasAreas(ctx))[area as keyof typeof acessos.PADRAO.admin];
        for (const t of tabelas) {
          const n = await contar(ctx, t);
          assert.ok(tem ? n >= 1 : n === 0, `${quem} ${tem ? "com" : "sem"} ${area} em ${t}: ${n}`);
        }
      }
  });

  test("gestão por padrão: orçamentos e diárias sim, Financeiro não (nem ler, nem gravar)", async () => {
    assert.equal(await contar(gui(), "lancamentos"), 0);
    const e = await getBanco()
      .asUser(gui(), (tx) =>
        tx.execute(
          sql`insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento) values (${o.orgA}, 'saida', 'fixo', 'x', 1, ${HOJE})`,
        ),
      )
      .catch((x: unknown) => x);
    assert.equal(codigoPg(e), PG.rls);
    assert.ok((await contar(gui(), "orcamento_itens")) >= 1);
  });

  test("a pessoa do financeiro (equipe com a área) lê e lança; não vê orçamentos nem diárias", async () => {
    assert.ok((await contar(fia(), "lancamentos")) >= 1);
    const ok = await getBanco().asUser(fia(), (tx) =>
      tx.execute(
        sql`insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento) values (${o.orgA}, 'saida', 'fixo', 'Luz', 1, ${HOJE}) returning id`,
      ),
    );
    assert.equal(ok.length, 1);
    assert.equal(await contar(fia(), "orcamentos"), 0);
    assert.equal(await contar(fia(), "freela_valores"), 0);
  });

  test("contratos aceitos: só com a área", async () => {
    // A tabela de registros (contratos) usa a área na política de leitura; sem linhas aqui, confere a política.
    const [p] = (await getBanco().sql`
      select qual from pg_policies where schemaname = 'maestro' and tablename = 'contratos' and policyname = 'contratos_leitura'`) as { qual: string }[];
    assert.match(p.qual, /pode\(org_id, 'contratos'/);
  });
});

describe("colunas de dinheiro em telas de todos: o servidor não manda", () => {
  test("freela: diária, contato, CPF/PIX e pagamento só para quem tem cada área", async () => {
    const eq = await fr.obterFreela(o.equipe, ids.freela, HOJE);
    assert.ok(eq);
    assert.deepEqual(
      [eq.email, eq.whatsapp, eq.valores.length, eq.dadosPagamento, eq.escalas[0].valorCents, eq.escalas[0].pagamento],
      [null, null, 0, undefined, null, null],
    );
    assert.deepEqual(eq.ve, { diarias: false, dados: false, financeiro: false });
    const ge = await fr.obterFreela(gui(), ids.freela, HOJE);
    assert.deepEqual([ge?.email, ge?.valores.length, ge?.escalas[0].valorCents, ge?.dadosPagamento?.titular], ["rafa@x.invalid", 1, 160000, "Rafa"]);
    assert.equal((await fr.listarFreelas(o.equipe)).find((f) => f.id === ids.freela)?.diaria, null);
    assert.equal((await fr.listarFreelas(gui())).find((f) => f.id === ids.freela)?.diaria, 80000);
    const esc = await fr.escalasDoProjeto(o.equipe, ids.projeto, HOJE);
    assert.deepEqual([esc[0].diariaCents, esc[0].valorCents], [null, null]);
    // O que a escala virou no "a pagar" (gatilho) só aparece com o Financeiro.
    assert.equal((await fr.escalasDoProjeto(gui(), ids.projeto, HOJE))[0].pagamento, null);
    assert.ok((await fr.escalasDoProjeto(o.gestor, ids.projeto, HOJE))[0].pagamento);
  });

  test("kit do freela e aluguel na escala: sem diárias, vazio", async () => {
    assert.equal((await kit.listarEquipDoFreela(o.equipe, ids.freela))[0].diariaCents, null);
    assert.equal((await kit.listarEquipDoFreela(gui(), ids.freela))[0].diariaCents, 20000);
    const [e] = await kit.equipamentosDasEscalas(o.equipe, [ids.escala]);
    assert.deepEqual([e.veValores, e.aluguelCents, e.disponiveis[0].diariaCents], [false, 0, null]);
  });

  test("inventário: o valor do equipamento só com a área", async () => {
    const eq = await inv.obterEquipamento(o.equipe, ids.equip, HOJE);
    assert.deepEqual([eq?.valorCents, eq?.veValor], [null, false]);
    const ge = await inv.obterEquipamento(gui(), ids.equip, HOJE);
    assert.deepEqual([ge?.valorCents, ge?.veValor], [4500000, true]);
  });

  test("pedidos: o valor estimado só com Orçamentos", async () => {
    assert.equal((await ped.obterPedido(o.equipe, ids.pedido))?.valorEstimado, null);
    assert.equal((await ped.listarPedidos(o.equipe)).find((p) => p.id === ids.pedido)?.valor, null);
    assert.equal((await ped.obterPedido(gui(), ids.pedido))?.valorEstimado, 250000);
  });

  test("Hoje: caixa, a receber e orçamentos só para quem tem cada área, mesmo pedindo", async () => {
    const g = await hoje.resumoDoDia(gui(), true, HOJE);
    assert.equal(g.dinheiro, null, "gestão sem Financeiro");
    assert.ok(g.orcamentos.aguardando >= 1 && g.orcamentos.valor > 0);
    const f = await hoje.resumoDoDia(fia(), true, HOJE);
    assert.ok(f.dinheiro && f.dinheiro.caixa > 0);
    assert.deepEqual([f.orcamentos.aguardando, f.orcamentos.valor], [0, 0]);
  });

  test("Pessoas: e-mail dos outros só com Dados da equipe; o próprio, sempre", async () => {
    const l = await pessoas.listarPessoas(o.equipe);
    assert.equal(l.find((p) => p.sub === GUI)?.email, null);
    assert.equal(l.find((p) => p.sub === o.equipe.sub)?.email ?? null, null, "a Eva não tem e-mail na semente");
    assert.equal((await pessoas.listarPessoas(fia())).find((p) => p.sub === FIA)?.email, "fia@a.invalid");
    assert.equal((await pessoas.listarPessoas(gui())).find((p) => p.sub === FIA)?.email, "fia@a.invalid");
  });

  test("tabela de preços e orçamento: nada para quem não tem a área", async () => {
    assert.equal((await precos.carregarTabela(o.equipe)).itens.length, 0);
    assert.equal(await orc.obterOrcamento(o.equipe, ids.orc, HOJE), null);
    assert.equal(await orc.documentoDoOrcamento(o.equipe, ids.orc), null, "nem o timbrado");
    assert.ok(await orc.obterOrcamento(gui(), ids.orc, HOJE));
  });
});

describe("gravar o que não vê: o banco guarda o de antes", () => {
  test("equipe edita o equipamento: o valor fica; no item novo, nada de valor", async () => {
    const v = inv.validarEquipamento({ nome: "Sony FX6", categoria: "camera", estado: "disponivel", dono: "produtora", valor: "1,00" });
    assert.ok(v.ok);
    if (!v.ok) return;
    assert.ok((await inv.salvarEquipamento(o.equipe, { ...v.entrada, valorCents: null }, ids.equip)).ok);
    assert.ok((await inv.salvarEquipamento(o.equipe, v.entrada, ids.equip)).ok);
    assert.equal((await inv.obterEquipamento(o.admin, ids.equip, HOJE))?.valorCents, 4500000);
    const novo = await inv.salvarEquipamento(o.equipe, { ...v.entrada, nome: "Rode NTG", chave: undefined } as never);
    assert.ok(novo.ok);
    if (novo.ok) assert.equal((await inv.obterEquipamento(o.admin, novo.id, HOJE))?.valorCents, null);
  });

  test("valor estimado do pedido e valor do projeto: quem não vê não troca", async () => {
    const r = await funil.salvarValorEstimado(o.equipe, ids.pedido, 1);
    assert.equal(r.ok, true, "a gravação passa, mas o valor fica");
    assert.equal((await ped.obterPedido(o.admin, ids.pedido))?.valorEstimado, 250000);
    await getBanco().asUser(o.equipe, (tx) => tx.execute(sql`update maestro.projects set value_cents = 1, title = 'Projeto novo' where id = ${ids.projeto}`));
    const [p] = (await getBanco().asSystem("conferir", (tx) =>
      tx.execute(sql`select value_cents::int as v, title from maestro.projects where id = ${ids.projeto}`),
    )) as unknown as {
      v: number;
      title: string;
    }[];
    assert.deepEqual(p, { v: 500000, title: "Projeto novo" });
  });

  test("escala feita por quem não vê diárias: a diária vem do cadastro; mudar o período recalcula pela mesma diária", async () => {
    const e = await fr.salvarEscala(o.equipe, {
      projetoId: ids.projeto,
      eventoId: null,
      freelaId: ids.freela,
      funcao: "edicao",
      inicio: "2026-12-01",
      fim: "2026-12-03",
      diariaCents: 1,
      valorCents: null,
      notas: null,
    });
    assert.ok(e.ok);
    if (!e.ok) return;
    const ler = async () =>
      (
        (await getBanco().asSystem("conferir", (tx) =>
          tx.execute(sql`select diaria_cents::int as d, valor_cents::int as v from maestro.escalas where id = ${e.id}`),
        )) as unknown as {
          d: number;
          v: number;
        }[]
      )[0];
    assert.deepEqual(await ler(), { d: 80000, v: 240000 }, "o 1 digitado não vale");
    assert.ok(
      (
        await fr.salvarEscala(
          o.equipe,
          {
            projetoId: ids.projeto,
            eventoId: null,
            freelaId: ids.freela,
            funcao: "edicao",
            inicio: "2026-12-01",
            fim: "2026-12-01",
            diariaCents: 5,
            valorCents: null,
            notas: null,
          },
          e.id,
        )
      ).ok,
    );
    assert.deepEqual(await ler(), { d: 80000, v: 80000 });
  });

  test("o freela: contato e diárias de quem não vê ficam; o kit também", async () => {
    const v = fr.validarFreela({ nome: "Rafa", funcoes: "Edição", valores: "Edição: 1,00", whatsapp: "(11) 90000-0000" });
    assert.ok(v.ok);
    if (!v.ok) return;
    assert.ok((await fr.salvarFreela(o.equipe, v.entrada, ids.freela)).ok);
    const f = await fr.obterFreela(o.admin, ids.freela, HOJE);
    assert.deepEqual([f?.whatsapp, f?.email, f?.valores.map((x) => x.valorCents)], ["5511999990000", "rafa@x.invalid", [80000]]);
    const e = { categoria: "camera" as const, marca: null, modelo: "FX3", quantidade: 1, observacao: "nova", diariaCents: 1, ativo: true };
    assert.ok((await kit.salvarEquipFreela(o.equipe, ids.freela, e, ids.kit)).ok);
    assert.equal((await kit.listarEquipDoFreela(o.admin, ids.freela))[0].diariaCents, 20000);
  });

  test("dados de pagamento: sem a área nem a gestão grava", async () => {
    await srv.salvarAreas(
      o.admin,
      GUI,
      acessos.areasLigadas(acessos.PADRAO.gestor).filter((a) => a !== "dados_equipe"),
    );
    const v = fr.validarPagamento({ titular: "Outro" });
    assert.ok(v.ok);
    if (v.ok) assert.equal((await fr.salvarPagamento(gui(), ids.freela, v.entrada)).ok, false);
    assert.equal((await fr.obterFreela(gui(), ids.freela, HOJE))?.dadosPagamento, undefined);
    await srv.salvarAreas(o.admin, GUI, acessos.areasLigadas(acessos.PADRAO.gestor));
  });
});

describe("quem muda o acesso", () => {
  test("só a administração; gestão, equipe e a outra organização não", async () => {
    for (const ctx of [gui(), o.gestor, o.equipe, o.leitura, o.b]) {
      const r = await srv.salvarAreas(ctx, o.equipe.sub, ["financeiro"]);
      assert.equal(r.ok, false);
    }
    assert.equal((await srv.minhasAreas(o.equipe)).financeiro, false);
    // Nem direto na tabela (RLS acessos_*).
    const e = await getBanco()
      .asUser(o.equipe, (tx) =>
        tx.execute(
          sql`insert into maestro.acessos (org_id, zro_sub, area, permitido, atualizado_por) values (${o.orgA}, ${o.equipe.sub}, 'financeiro', true, ${o.equipe.sub})`,
        ),
      )
      .catch((x: unknown) => x);
    assert.equal(codigoPg(e), PG.rls);
    // Administração não se ajusta.
    const adm = await srv.salvarAreas(o.admin, o.ANA, []);
    assert.ok(!adm.ok && adm.erro === "papel");
  });

  test("cada um lê só os próprios ajustes; a administração lê todos", async () => {
    assert.equal(await contar(o.equipe, "acessos"), 0);
    assert.equal(await contar(fia(), "acessos"), 1);
    assert.ok((await contar(o.admin, "acessos")) >= 2);
    assert.equal(await contar(o.b, "acessos"), 0);
  });

  test("ligar, desligar e voltar ao padrão: guarda só o que difere e audita antes e depois", async () => {
    const r = await srv.salvarAreas(o.admin, o.equipe.sub, ["diarias", "inventario_valores"]);
    assert.ok(r.ok);
    assert.deepEqual(acessos.areasLigadas(await srv.minhasAreas(o.equipe)), ["diarias", "inventario_valores"]);
    const [n] = (await getBanco().asSystem("conferir", (tx) =>
      tx.execute(sql`select count(*)::int as n from maestro.acessos where zro_sub = ${o.equipe.sub}`),
    )) as unknown as { n: number }[];
    assert.equal(n.n, 2);
    const [log] = (await getBanco().asSystem("conferir", (tx) =>
      tx.execute(sql`select actor_sub, metadata from maestro.audit_log where action = 'acesso.areas' and target_id = ${o.equipe.sub} order by id desc limit 1`),
    )) as unknown as { actor_sub: string; metadata: { papel: string; antes: object; depois: Record<string, boolean> } }[];
    assert.equal(log.actor_sub, o.ANA);
    assert.equal(log.metadata.papel, "equipe");
    assert.deepEqual(log.metadata.antes, {});
    assert.equal(log.metadata.depois.diarias, true);
    // Volta ao padrão: nada guardado.
    assert.ok((await srv.salvarAreas(o.admin, o.equipe.sub, [])).ok);
    const [z] = (await getBanco().asSystem("conferir", (tx) =>
      tx.execute(sql`select count(*)::int as n from maestro.acessos where zro_sub = ${o.equipe.sub}`),
    )) as unknown as { n: number }[];
    assert.equal(z.n, 0);
    // A gestão desligada de uma área padrão guarda o "não".
    assert.ok((await srv.salvarAreas(o.admin, GUI, ["orcamentos"])).ok);
    assert.equal((await srv.minhasAreas(gui())).contratos, false);
    assert.ok((await srv.salvarAreas(o.admin, GUI, acessos.areasLigadas(acessos.PADRAO.gestor))).ok);
    const lista = await pessoas.listarPessoas(o.admin);
    assert.equal(lista.find((p) => p.sub === GUI)?.ajustado, false);
    assert.equal(lista.find((p) => p.sub === FIA)?.ajustado, true);
    assert.equal(lista.find((p) => p.sub === FIA)?.acessos.financeiro, true);
  });

  test("a sessão traz o acesso de cada um (o que a tela usa)", async () => {
    const t = await criarSessao({ orgId: o.orgA, sub: FIA, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    const s = await autenticar(t.token);
    assert.equal(s?.acessos.financeiro, true);
    assert.equal(s?.acessos.orcamentos, false);
    const t2 = await criarSessao({ orgId: o.orgA, sub: GUI, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    assert.deepEqual((await autenticar(t2.token))?.acessos, acessos.PADRAO.gestor);
  });
});

describe("navegação: nada de link morto", () => {
  test("Financeiro e Orçamentos somem para quem não tem; grupo vazio some", () => {
    const hrefs = (a: Parameters<typeof nav.gruposPara>[0]) => nav.gruposPara(a).flatMap((g) => g.abas.map((x) => x.href));
    assert.ok(!hrefs(acessos.PADRAO.equipe).includes("/app/financeiro"));
    assert.ok(!hrefs(acessos.PADRAO.equipe).includes("/app/orcamentos"));
    assert.ok(!nav.gruposPara(acessos.PADRAO.equipe).some((g) => g.nome === "Dinheiro"));
    assert.ok(!hrefs(acessos.PADRAO.gestor).includes("/app/financeiro"));
    assert.ok(hrefs(acessos.PADRAO.gestor).includes("/app/orcamentos"));
    assert.ok(hrefs(acessos.PADRAO.admin).includes("/app/financeiro"));
    assert.deepEqual(nav.abasOcultas(acessos.PADRAO.equipe), ["/app/orcamentos", "/app/financeiro"]);
    assert.deepEqual(nav.abasOcultas(acessos.PADRAO.admin), []);
    // A barra do celular não tem área nenhuma (Hoje, Quadro, Aprovar, Mais).
    assert.ok(nav.BARRA.every((a) => !a.area));
  });
});

describe("a Z", () => {
  const chamar = async (sub: string) => {
    const token = await amb.zro.assinarPedido({ sub, aud: CLIENTE.clientId, acao: ACAO_RESUMO });
    const r = await rotaResumoDaZ(pedido("/api/zro/maestro/resumo", { method: "POST", origin: null, headers: { authorization: `Bearer ${token}` } }));
    assert.equal(r.status, 200);
    return (await r.json()) as { dinheiro: { caixa: number } | null; contagens: { orcamentos_aguardando: number | null } };
  };

  test("não fala de dinheiro com quem não tem o Financeiro (gestão por padrão inclusive)", async () => {
    assert.equal((await chamar(GUI)).dinheiro, null);
    assert.equal((await chamar(o.equipe.sub)).dinheiro, null);
    assert.ok((await chamar(FIA)).dinheiro);
    assert.ok((await chamar(o.ANA)).dinheiro);
  });

  test("nem de orçamentos com quem não tem a área", async () => {
    assert.equal((await chamar(FIA)).contagens.orcamentos_aguardando, null);
    assert.equal((await chamar(o.equipe.sub)).contagens.orcamentos_aguardando, null);
    assert.ok(((await chamar(GUI)).contagens.orcamentos_aguardando ?? 0) >= 1);
  });
});
