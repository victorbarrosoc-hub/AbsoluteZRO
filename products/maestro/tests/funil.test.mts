// Funil leve de vendas (drizzle/0014): etapas do pedido e o gatilho que as amarra ao status (Ganho só com orçamento
// aprovado e é final; Perdido exige motivo; gerar orçamento e aceite andam sozinhos), próximo contato de pedido e de
// cliente, "contato feito" com histórico, "Retornar hoje" e o isolamento de `contatos` entre duas organizações.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("funil");
const { getBanco, codigoPg } = amb.banco;
const regras = await import("../src/lib/funil/regras");
const f = await import("../src/lib/funil/servidor");
const { somarDias } = await import("../src/lib/dinheiro");
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;
const HOJE = "2026-11-10";
const ids: Record<string, string> = {};

const etapaDe = async (id: string) =>
  getBanco().asSystem("teste", async (tx) => {
    const [r] = (await tx.execute(sql`select etapa, status, motivo_perda from maestro.pedidos where id = ${id}`)) as unknown as Record<string, string>[];
    return r;
  });

before(async () => {
  o = await duasOrganizacoes();
  await getBanco().asSystem("semente", async (tx) => {
    const um = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { id: string }[])[0].id;
    const A = o.orgA;
    ids.cli = await um(sql`insert into maestro.clients (org_id, name, status) values (${A}, 'Lead A', 'lead') returning id`);
    ids.p1 = await um(
      sql`insert into maestro.pedidos (org_id, protocolo, nome, email, consentimento_em) values (${A}, 'FUN00001', 'Um', 'um@x.com', now()) returning id`,
    );
    ids.p2 = await um(
      sql`insert into maestro.pedidos (org_id, protocolo, nome, email, consentimento_em) values (${A}, 'FUN00002', 'Dois', 'd@x.com', now()) returning id`,
    );
    ids.q = await um(
      sql`insert into maestro.orcamentos (org_id, numero, titulo, status, pedido_id) values (${A}, '2026-050', 'Orç', 'enviado', ${ids.p2}) returning id`,
    );
    await tx.execute(sql`update maestro.pedidos set orcamento_id = ${ids.q}, status = 'em_orcamento' where id = ${ids.p2}`);
    ids.pb = await um(
      sql`insert into maestro.pedidos (org_id, protocolo, nome, email, consentimento_em, proximo_contato) values (${o.orgB}, 'FUNB0001', 'Bê', 'b@x.com', now(), ${HOJE}) returning id`,
    );
  });
});
after(() => amb.fechar());

describe("regras puras", () => {
  test("podeMover", () => {
    assert.equal(regras.podeMover("novo", "conversa", { orcamentoAprovado: false }).ok, true);
    assert.deepEqual(regras.podeMover("novo", "ganho", { orcamentoAprovado: false }).ok, false);
    assert.equal(regras.podeMover("negociando", "ganho", { orcamentoAprovado: true }).ok, true);
    const p = regras.podeMover("novo", "perdido", { orcamentoAprovado: false, motivo: " " });
    assert.equal(p.ok, false);
    assert.equal(!p.ok && p.erro, "motivo");
    assert.equal(regras.podeMover("novo", "perdido", { orcamentoAprovado: false, motivo: "Preço" }).ok, true);
    assert.equal(regras.podeMover("ganho", "novo", { orcamentoAprovado: true }).ok, false);
    assert.equal(regras.podeMover("novo", "xis", { orcamentoAprovado: true }).ok, false);
    assert.equal(regras.podeMover("novo", "novo", { orcamentoAprovado: true }).ok, false);
  });
  test("situação e texto do retorno", () => {
    assert.equal(regras.situacaoRetorno("2026-11-09", HOJE), "atrasado");
    assert.equal(regras.situacaoRetorno(HOJE, HOJE), "hoje");
    assert.equal(regras.situacaoRetorno("2026-11-12", HOJE), "proximo");
    assert.equal(regras.quandoRetorno("2026-11-09", HOJE), "ontem");
    assert.equal(regras.quandoRetorno("2026-11-07", HOJE), "há 3 dias");
    assert.equal(regras.quandoRetorno("2026-11-11", HOJE), "amanhã");
    assert.equal(regras.validarRetorno("2026-02-30", null).ok, false);
    assert.deepEqual(regras.validarRetorno("2026-11-12", "  ligar  "), { ok: true, data: "2026-11-12", nota: "ligar" });
  });
});

describe("transições no banco", () => {
  test("Ganho sem orçamento aprovado é barrado (tela e banco)", async () => {
    const r = await f.moverEtapa(o.equipe, ids.p1, "ganho");
    assert.equal(r.ok, false);
    await assert.rejects(
      getBanco().asUser(o.admin, (tx) => tx.execute(sql`update maestro.pedidos set etapa = 'ganho' where id = ${ids.p1}`)),
      (e) => codigoPg(e) === "P0001",
    );
  });

  test("Perdido exige motivo, vira recusado; reabrir limpa o motivo", async () => {
    assert.equal((await f.moverEtapa(o.equipe, ids.p1, "perdido", "")).ok, false);
    await assert.rejects(
      getBanco().asUser(o.admin, (tx) => tx.execute(sql`update maestro.pedidos set etapa = 'perdido' where id = ${ids.p1}`)),
      (e) => codigoPg(e) === "23514",
    );
    assert.equal((await f.moverEtapa(o.equipe, ids.p1, "perdido", "Preço")).ok, true);
    assert.deepEqual(await etapaDe(ids.p1), { etapa: "perdido", status: "recusado", motivo_perda: "Preço" });
    assert.equal((await f.moverEtapa(o.equipe, ids.p1, "conversa")).ok, true);
    assert.deepEqual(await etapaDe(ids.p1), { etapa: "conversa", status: "novo", motivo_perda: null });
  });

  test("leitura não move", async () => {
    const r = await f.moverEtapa(o.leitura, ids.p1, "negociando");
    assert.equal(r.ok, false);
  });

  test("gerar orçamento levou a 'Orçamento enviado'; aprovar o orçamento ganha o pedido, e Ganho é final", async () => {
    assert.equal((await etapaDe(ids.p2)).etapa, "orcamento");
    assert.equal((await f.moverEtapa(o.gestor, ids.p2, "negociando")).ok, true);
    await getBanco().asUser(o.admin, (tx) => tx.execute(sql`update maestro.orcamentos set status = 'aprovado' where id = ${ids.q}`));
    assert.deepEqual(await etapaDe(ids.p2), { etapa: "ganho", status: "virou_projeto", motivo_perda: null });
    const volta = await f.moverEtapa(o.admin, ids.p2, "negociando");
    assert.equal(volta.ok, false);
    await assert.rejects(
      getBanco().asUser(o.admin, (tx) => tx.execute(sql`update maestro.pedidos set etapa = 'novo' where id = ${ids.p2}`)),
      (e) => codigoPg(e) === "P0001",
    );
  });

  test("recusar pelo status antigo vira Perdido com motivo padrão", async () => {
    await getBanco().asUser(o.admin, (tx) => tx.execute(sql`update maestro.pedidos set status = 'recusado' where id = ${ids.p1}`));
    assert.deepEqual(await etapaDe(ids.p1), { etapa: "perdido", status: "recusado", motivo_perda: "Recusado" });
    await f.moverEtapa(o.admin, ids.p1, "novo");
  });
});

describe("retornos e contatos", () => {
  test("marcar, listar (atrasados primeiro), contato feito e reagendar", async () => {
    assert.equal((await f.agendarRetorno(o.equipe, "pedido", ids.p1, somarDias(HOJE, -1), "Ligar")).ok, true);
    assert.equal((await f.agendarRetorno(o.equipe, "cliente", ids.cli, HOJE, null)).ok, true);
    assert.equal((await f.agendarRetorno(o.equipe, "pedido", ids.p1, "ontem", null)).ok, false);
    const lista = await f.listarRetornos(o.equipe, HOJE);
    assert.deepEqual(
      lista.map((x) => [x.alvo, x.id, x.data]),
      [
        ["pedido", ids.p1, somarDias(HOJE, -1)],
        ["cliente", ids.cli, HOJE],
      ],
    );
    assert.equal((await f.contatoFeito(o.equipe, "pedido", ids.p1, { nota: "Falei no WhatsApp" })).ok, true);
    assert.equal((await etapaDe(ids.p1)).etapa, "conversa", "novo → em conversa");
    assert.deepEqual(
      (await f.listarRetornos(o.equipe, HOJE)).map((x) => x.id),
      [ids.cli],
    );
    const h = await f.historicoDeContatos(o.admin, "pedido", ids.p1);
    assert.equal(h.length, 1);
    assert.equal(h[0].nota, "Falei no WhatsApp");
    assert.equal((await f.reagendar(o.equipe, "cliente", ids.cli, 7, HOJE)).ok, true);
    assert.equal((await f.listarRetornos(o.equipe, HOJE)).length, 0);
    assert.equal((await f.listarRetornos(o.equipe, somarDias(HOJE, 7))).length, 1);
  });

  test("pedido ganho não recebe retorno", async () => {
    assert.equal((await f.agendarRetorno(o.equipe, "pedido", ids.p2, HOJE, null)).ok, false);
  });

  test("duas organizações: retornos e contatos não cruzam; organização forjada não vê nada", async () => {
    assert.deepEqual(
      (await f.listarRetornos(o.b, HOJE)).map((x) => x.id),
      [ids.pb],
    );
    assert.equal((await f.listarRetornos(o.forjado, HOJE)).length, 0);
    assert.equal((await f.historicoDeContatos(o.b, "pedido", ids.p1)).length, 0);
    assert.equal((await f.contatoFeito(o.b, "pedido", ids.p1)).ok, false);
    await assert.rejects(
      getBanco().asUser(o.b, (tx) => tx.execute(sql`insert into maestro.contatos (org_id, pedido_id) values (${o.orgA}, ${ids.p1})`)),
      (e) => codigoPg(e) === "42501",
    );
    const n = await getBanco().asUser(
      o.b,
      async (tx) => (await tx.execute(sql`select count(*)::int as n from maestro.contatos`)) as unknown as { n: number }[],
    );
    assert.equal(n[0].n, 0);
  });
});
