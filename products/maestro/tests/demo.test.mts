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
    if (vazio.ok) assert.deepEqual(vazio.contagem, { clientes: 0, projetos: 0, cards: 0, lotes: 0 });
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
    if (de_novo.ok) assert.deepEqual(de_novo.contagem, { clientes: 0, projetos: 0, cards: 0, lotes: 0 });

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
