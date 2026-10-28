// Demonstração (botão "Carregar demonstração"), no banco real com o papel maestro_app: 10 clientes, projetos e cards
// nas 8 colunas; carregar duas vezes não duplica; remover tira só o que é demo; a outra organização nem vê; leitura e
// equipe não removem.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente, UUID } from "./ambiente.mts";

const amb = await prepararAmbiente("demo");
const { getBanco, schema } = amb.banco;
const demo = await import("../src/lib/demo/demonstracao");
const cli = await import("../src/lib/crm/clientes");
const proj = await import("../src/lib/crm/projetos");
const quadro = await import("../src/lib/quadro/servidor");

const ANA = UUID();
const LEO = UUID();
const EVA = UUID();
const BIA = UUID();
let orgA: string;
let orgB: string;
const A = () => ({ sub: ANA, orgId: orgA });
const LEITURA = () => ({ sub: LEO, orgId: orgA });
const EQUIPE = () => ({ sub: EVA, orgId: orgA });
const B = () => ({ sub: BIA, orgId: orgB });

type Linhas = Record<string, unknown>[];
const contar = (orgId: string) =>
  getBanco().asSystem("teste conta", async (tx) => {
    const [r] = (await tx.execute(sql`
      select (select count(*)::int from maestro.clients where org_id = ${orgId}) as clientes,
             (select count(*)::int from maestro.clients where org_id = ${orgId} and demo) as "clientesDemo",
             (select count(*)::int from maestro.projects where org_id = ${orgId}) as projetos,
             (select count(*)::int from maestro.cards where org_id = ${orgId}) as cards,
             (select count(*)::int from maestro.card_history where org_id = ${orgId}) as historico,
             (select count(*)::int from maestro.lotes where org_id = ${orgId}) as lotes,
             (select count(*)::int from maestro.versoes where org_id = ${orgId}) as versoes,
             (select count(*)::int from maestro.comentarios where org_id = ${orgId}) as comentarios,
             (select count(*)::int from maestro.approvals where org_id = ${orgId}) as decisoes,
             (select count(*)::int from maestro.approval_links where org_id = ${orgId} and revoked_at is null) as links`)) as unknown as Linhas;
    return r as {
      clientes: number;
      clientesDemo: number;
      projetos: number;
      cards: number;
      historico: number;
      lotes: number;
      versoes: number;
      comentarios: number;
      decisoes: number;
      links: number;
    };
  });

before(async () => {
  await getBanco().asSystem("semente", async (tx) => {
    const [a] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Produtora A" }).returning({ id: schema.organizations.id });
    const [b] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Produtora B" }).returning({ id: schema.organizations.id });
    orgA = a.id;
    orgB = b.id;
    await tx.insert(schema.members).values([
      { orgId: orgA, zroSub: ANA, role: "gestor" },
      { orgId: orgA, zroSub: LEO, role: "leitura" },
      { orgId: orgA, zroSub: EVA, role: "equipe" },
      { orgId: orgB, zroSub: BIA, role: "admin" },
    ]);
  });
});
after(() => amb.fechar());

describe("demonstração", () => {
  test("carrega a produtora: 10 clientes, projetos, cards nas 8 colunas e lotes em aprovação", async () => {
    // dados reais antes da demonstração (precisam sobreviver à remoção)
    const real = await cli.criarCliente(A(), {
      nome: "Cliente de verdade",
      empresa: null,
      contato: null,
      whatsapp: null,
      email: null,
      observacoes: null,
      status: "ativo",
    });
    assert.ok(real.ok);
    const p = await proj.criarProjeto(A(), {
      titulo: "Projeto de verdade",
      cliente: (real as { id: string }).id,
      status: "active",
      inicio: null,
      prazo: null,
      briefing: null,
    });
    assert.ok(p.ok);
    const c = await quadro.criarCard(A(), "creal0001", { tema: "Card de verdade" });
    assert.ok(c.ok);
    assert.equal(await demo.temDemonstracao(A()), false);

    const r = await demo.carregarDemonstracao(A());
    assert.ok(r.ok && r.criou);
    if (!r.ok) return;
    assert.equal(r.contagem.clientes, 10);
    assert.ok(r.contagem.projetos >= 10);
    assert.ok(r.contagem.cards >= 24);
    assert.ok(r.contagem.lotes >= 1);
    assert.equal(await demo.temDemonstracao(A()), true);

    const clientes = await cli.listarClientes(A());
    assert.equal(clientes.length, 11);
    for (const k of clientes.filter((x) => x.nome !== "Cliente de verdade")) assert.match(k.email ?? "", /@exemplo\.com$/);
    assert.ok(
      clientes.every((k) => !k.whatsapp),
      "nenhum telefone",
    );

    const { cards } = await quadro.carregarCards(A());
    const colunas = new Set(cards.map((k) => k.dados.coluna));
    assert.deepEqual([...colunas].sort(), ["afazer", "agendado", "aprovacao", "aprovado", "entregue", "fazendo", "pauta", "revisao"]);
    assert.ok(cards.filter((k) => k.id.startsWith("demo-")).every((k) => (k.dados as Record<string, unknown>).demo === true && k.dados.cliente));

    const projetos = await proj.listarProjetos(A(), { status: "active" });
    assert.ok(projetos.some((x) => /^DEMO-\d{4}-\d{3}$/.test(x.codigo) && x.linkStatus === "unlinked"));
  });

  test("carregar de novo não duplica", async () => {
    const antes = await contar(orgA);
    const r = await demo.carregarDemonstracao(A());
    assert.ok(r.ok && !r.criou);
    assert.deepEqual(await contar(orgA), antes);
    const [x, y] = await Promise.all([demo.carregarDemonstracao(A()), demo.carregarDemonstracao(A())]);
    assert.ok(x.ok && !x.criou && y.ok && !y.criou);
    assert.deepEqual(await contar(orgA), antes);
  });

  test("aprovações da demonstração: versões, comentários com tempo, decisões e um link ativo por lote", async () => {
    const c = await contar(orgA);
    assert.equal(c.versoes, 4);
    assert.ok(c.comentarios >= 7, `comentários: ${c.comentarios}`);
    assert.equal(c.decisoes, 3);
    assert.equal(c.links, c.lotes);
    const rev = await import("../src/lib/revisao/equipe");
    const lotes = await rev.listarLotes(A());
    assert.ok(lotes.every((l) => l.demo && l.link));
    const com2 = (await Promise.all(lotes.map((l) => rev.carregarLote(A(), l.id)))).flatMap((l) => l!.pecas).find((p) => p.versoes.length === 2);
    assert.ok(com2, "uma peça com Antes e Agora");
    assert.equal(com2.coluna, "aprovacao");
    assert.ok(com2.versoes[1].comentarios.some((k) => k.autor === "cliente" && k.x !== null && k.t !== null));
    // Demonstração antiga (sem aprovações): carregar de novo completa uma vez só.
    await getBanco().asSystem("teste: tira as versões", async (tx) => {
      await tx.execute(sql`select set_config('maestro.limpando_demo', 'on', true)`);
      await tx.execute(sql`delete from maestro.approvals where org_id = ${orgA}`);
      await tx.execute(sql`delete from maestro.versoes where org_id = ${orgA}`);
      await tx.execute(sql`update maestro.approval_links set revoked_at = now() where org_id = ${orgA}`);
    });
    await demo.carregarDemonstracao(A());
    const d = await contar(orgA);
    assert.equal(d.versoes, 4);
    await demo.carregarDemonstracao(A());
    assert.equal((await contar(orgA)).versoes, 4);
  });

  test("a outra organização não vê nada da demonstração", async () => {
    assert.equal(await demo.temDemonstracao(B()), false);
    assert.equal((await cli.listarClientes(B())).length, 0);
    assert.equal((await quadro.carregarCards(B())).cards.length, 0);
    const vazio = await demo.removerDemonstracao(B());
    assert.ok(vazio.ok);
    if (vazio.ok) assert.deepEqual(vazio.contagem, demo.CONTAGEM_ZERO);
    assert.equal((await contar(orgA)).clientesDemo, 10, "remover em B não toca em A");
  });

  test("leitura não carrega; leitura e equipe não removem", async () => {
    const l = await demo.carregarDemonstracao({ sub: LEO, orgId: orgB });
    assert.equal(l.ok, false, "quem não é da organização não carrega");
    const rl = await demo.removerDemonstracao(LEITURA());
    assert.equal(rl.ok, false);
    if (!rl.ok) assert.equal(rl.erro, "sem_permissao");
    const re = await demo.removerDemonstracao(EQUIPE());
    assert.equal(re.ok, false);
    assert.equal((await contar(orgA)).clientesDemo, 10);
  });

  test("remover tira só a demonstração (com histórico e lotes) e é idempotente", async () => {
    // a outra organização também tem demonstração: precisa ficar de pé
    const b = await demo.carregarDemonstracao(B());
    assert.ok(b.ok && b.criou);
    const antesB = await contar(orgB);

    const r = await demo.removerDemonstracao(A());
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.contagem.clientes, 10);
    const depois = await contar(orgA);
    assert.deepEqual(depois, {
      clientes: 1,
      clientesDemo: 0,
      projetos: 1,
      cards: 1,
      historico: 1,
      lotes: 0,
      versoes: 0,
      comentarios: 0,
      decisoes: 0,
      links: 0,
    });
    assert.equal(await demo.temDemonstracao(A()), false);
    assert.deepEqual(
      (await cli.listarClientes(A())).map((x) => x.nome),
      ["Cliente de verdade"],
    );
    assert.deepEqual(await contar(orgB), antesB, "B intacta");

    const de_novo = await demo.removerDemonstracao(A());
    assert.ok(de_novo.ok);
    if (de_novo.ok) assert.deepEqual(de_novo.contagem, demo.CONTAGEM_ZERO);

    // e pode carregar outra vez
    const outra = await demo.carregarDemonstracao(A());
    assert.ok(outra.ok && outra.criou);
  });

  test("o histórico continua só inclusão fora da remoção da demonstração", async () => {
    await assert.rejects(
      getBanco().asSystem("teste", (tx) => tx.execute(sql`delete from maestro.card_history where org_id = ${orgA} and card_id like 'demo-%'`)),
      (e) => /somente inclusão/.test(amb.banco.mensagemPg(e)),
    );
    await assert.rejects(
      getBanco().asUser(A(), (tx) => tx.execute(sql`delete from maestro.cards where id like 'demo-%'`)),
      (e) => amb.banco.codigoPg(e) === "42501",
    );
  });
});

describe("demonstração da produtora por dentro", () => {
  const TABELAS = [
    "precos_itens",
    "orcamentos",
    "lancamentos",
    "recorrencias",
    "freelas",
    "freela_pagamento",
    "escalas",
    "equipamentos",
    "reservas",
    "eventos",
    "documentos",
  ];
  const porTabela = (orgId: string) =>
    getBanco().asSystem("teste conta módulos", async (tx) => {
      const out: Record<string, number> = {};
      for (const t of TABELAS) {
        const [r] = (await tx.execute(sql.raw(`select count(*)::int as n from maestro.${t} where org_id = '${orgId}'`))) as unknown as { n: number }[];
        out[t] = r.n;
      }
      return out;
    });

  test("todo painel cheio: preços, orçamentos em vários status, 3 meses + 2 de financeiro, 15+ freelas, 30+ itens, agenda e documentos", async () => {
    const n = await porTabela(orgA);
    assert.ok(n.precos_itens >= 12, "tabela de preços");
    assert.ok(n.freelas >= 15, "freelas");
    assert.ok(n.equipamentos >= 30, "inventário");
    assert.ok(n.reservas >= 20, "reservas");
    assert.ok(n.eventos >= 12, "agenda");
    assert.ok(n.documentos >= 5, "documentos");
    assert.ok(n.freela_pagamento >= 1, "PIX de exemplo (cifrado)");
    const [r] = (await getBanco().asSystem("conferir", (tx) =>
      tx.execute(sql`
        select (select array_agg(distinct status order by status) from maestro.orcamentos where org_id = ${orgA}) as status,
               (select count(*)::int from maestro.orcamentos where org_id = ${orgA} and validade < current_date and status = 'enviado') as expirados,
               (select min(vencimento)::text from maestro.lancamentos where org_id = ${orgA}) as primeiro,
               (select max(vencimento)::text from maestro.lancamentos where org_id = ${orgA}) as ultimo,
               (select count(*)::int from maestro.lancamentos where org_id = ${orgA} and escala_id is not null) as de_freela,
               (select count(*)::int from maestro.lancamentos where org_id = ${orgA} and escala_id is not null and pago_cents >= valor_cents) as freela_pagos,
               (select count(*)::int from maestro.lancamentos where org_id = ${orgA} and recorrencia_id is not null) as recorrentes,
               (select count(*)::int from maestro.lancamentos where org_id = ${orgA} and orcamento_id is not null) as parcelas,
               (select bool_and(demo) from maestro.lancamentos where org_id = ${orgA}) as todos_demo,
               (select count(*)::int from maestro.freela_pagamento where org_id = ${orgA} and pix_enc not like 'v1.%') as em_claro`),
    )) as unknown as Record<string, unknown>[];
    assert.deepEqual(r.status, ["aprovado", "enviado", "rascunho", "recusado"]);
    assert.ok((r.expirados as number) >= 1, "um enviado vencido aparece como expirado");
    const hoje = new Date();
    const meses = (s: string) => (+s.slice(0, 4) - hoje.getFullYear()) * 12 + (+s.slice(5, 7) - (hoje.getMonth() + 1));
    assert.ok(meses(r.primeiro as string) <= -2, `financeiro começa uns 3 meses atrás (${r.primeiro})`);
    assert.ok(meses(r.ultimo as string) >= 2, `e vai 2 meses à frente (${r.ultimo})`);
    assert.ok((r.de_freela as number) >= 10 && (r.freela_pagos as number) >= 3, "pagamentos de freela, alguns pagos");
    assert.ok((r.recorrentes as number) >= 30, "aluguel, software e contrato mensal");
    assert.ok((r.parcelas as number) >= 5, "parcelas dos orçamentos aprovados");
    assert.equal(r.todos_demo, true);
    assert.equal(r.em_claro, 0);
  });

  test("completar: uma demonstração antiga ganha só os módulos que faltam, sem duplicar", async () => {
    const antes = await porTabela(orgA);
    // Simula a demonstração de antes dos módulos novos: só sobram Quadro, Clientes e Projetos.
    await getBanco().asUser(A(), async (tx) => {
      for (const t of [
        "documentos",
        "reservas",
        "lancamentos",
        "recorrencias",
        "escalas",
        "eventos",
        "equipamentos",
        "freelas",
        "orcamentos",
        "orcamento_modelos",
        "precos_variaveis",
        "precos_itens",
      ])
        await tx.execute(sql.raw(`delete from maestro.${t} where demo`));
    });
    assert.equal(await demo.demonstracaoCompleta(A()), false);
    const cl = (await contar(orgA)).clientesDemo;
    const r = await demo.carregarDemonstracao(A());
    assert.ok(r.ok && r.criou);
    if (r.ok) assert.equal(r.contagem.clientes, 0, "a base não é refeita");
    assert.equal((await contar(orgA)).clientesDemo, cl);
    assert.deepEqual(await porTabela(orgA), antes);
    assert.equal(await demo.demonstracaoCompleta(A()), true);
    const de_novo = await demo.carregarDemonstracao(A());
    assert.ok(de_novo.ok && !de_novo.criou);
    assert.deepEqual(await porTabela(orgA), antes);
  });

  test("remover tira os módulos todos (e os dados da empresa que a demonstração pôs); o que é de verdade fica", async () => {
    const real = await getBanco().asUser(A(), (tx) =>
      tx.execute(sql`insert into maestro.freelas (org_id, nome) values (${orgA}, 'Freela de verdade') returning id`),
    );
    assert.equal(real.length, 1);
    const r = await demo.removerDemonstracao(A());
    assert.ok(r.ok);
    if (r.ok) assert.ok(r.contagem.freelas >= 15 && r.contagem.equipamentos >= 30 && r.contagem.lancamentos > 0);
    const n = await porTabela(orgA);
    assert.deepEqual(n, { ...Object.fromEntries(TABELAS.map((t) => [t, 0])), freelas: 1 });
    const [org] = (await getBanco().asSystem("conferir", (tx) =>
      tx.execute(sql`select settings from maestro.organizations where id = ${orgA}`),
    )) as unknown as {
      settings: Record<string, unknown>;
    }[];
    assert.equal(org.settings.empresa, undefined);
    assert.equal(await demo.temDemonstracao(A()), false);
  });
});
