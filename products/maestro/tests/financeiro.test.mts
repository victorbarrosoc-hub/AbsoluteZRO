// Financeiro: as contas puras (status, resumo, fluxo, resultado por projeto, recorrência) e o banco real: baixa parcial
// e total, desfazer, recorrência que gera o mês uma vez só (também em paralelo, com os cards da Pauta), a escala que
// vira "a pagar" sozinha e só a gestão lendo o dinheiro.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("financeiro");
const c = await import("../src/lib/financeiro/contas");
const f = await import("../src/lib/financeiro/servidor");
const fr = await import("../src/lib/freelas/servidor");
const { getBanco } = amb.banco;
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;

before(async () => {
  o = await duasOrganizacoes();
});
after(() => amb.fechar());

const L = (tipo: "entrada" | "saida", valorCents: number, pagoCents: number, vencimento: string, projetoId: string | null = null) => ({
  tipo,
  valorCents,
  pagoCents,
  vencimento,
  projetoId,
});

describe("contas puras", () => {
  test("status: pago, atrasado, parcial e pendente (do ZRO)", () => {
    assert.equal(c.statusDe(L("entrada", 100, 100, "2026-01-01"), "2026-10-28"), "pago");
    assert.equal(c.statusDe(L("entrada", 100, 40, "2026-10-01"), "2026-10-28"), "atrasado");
    assert.equal(c.statusDe(L("entrada", 100, 40, "2026-11-01"), "2026-10-28"), "parcial");
    assert.equal(c.statusDe(L("entrada", 100, 0, "2026-10-28"), "2026-10-28"), "pendente");
  });

  test("resumo: recebido, a receber, atrasado e saldos", () => {
    const r = c.resumir(
      [L("entrada", 1000, 400, "2026-10-01"), L("entrada", 500, 0, "2026-11-01"), L("saida", 300, 300, "2026-10-05"), L("saida", 200, 0, "2026-10-10")],
      "2026-10-28",
    );
    assert.deepEqual(r.entrada, { pago: 400, aberto: 1100, atrasado: 600, total: 1500, quantos: 2 });
    assert.deepEqual(r.saida, { pago: 300, aberto: 200, atrasado: 200, total: 500, quantos: 2 });
    assert.equal(r.saldoRealizado, 100);
    assert.equal(r.saldoPrevisto, 1000);
  });

  test("fluxo por mês com saldo acumulado; meses e vencimento no fim do mês", () => {
    assert.deepEqual(c.mesesEntre("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
    const fl = c.fluxoPorMes(
      [L("entrada", 1000, 1000, "2026-10-05"), L("saida", 300, 0, "2026-10-31"), L("entrada", 200, 0, "2026-11-30")],
      ["2026-10", "2026-11"],
    );
    assert.deepEqual(
      fl.map((m) => [m.mes, m.entradas, m.saidas, m.recebido, m.pago, m.saldo, m.acumulado]),
      [
        ["2026-10", 1000, 300, 1000, 0, 700, 700],
        ["2026-11", 200, 0, 0, 0, 200, 900],
      ],
    );
    assert.equal(c.vencimentoNoMes({ dia: 31 }, "2027-02"), "2027-02-28");
    assert.ok(c.valeNoMes({ inicioMes: "2026-08", fimMes: "2026-12", ativo: true, dia: 5 }, "2026-10"));
    assert.equal(c.valeNoMes({ inicioMes: "2026-08", fimMes: "2026-09", ativo: true, dia: 5 }, "2026-10"), false);
  });

  test("resultado por projeto: contratado como receita, custos e margem; sem valor usa as entradas", () => {
    const r = c.resultadoPorProjeto(
      [
        { id: "a", codigo: "A", titulo: "A", cliente: null, valor: 10_000, margemOrcadaPct: 0.5 },
        { id: "b", codigo: "B", titulo: "B", cliente: null, valor: 0, margemOrcadaPct: null },
        { id: "c", codigo: "C", titulo: "C", cliente: null, valor: 0, margemOrcadaPct: null },
      ],
      [L("entrada", 4000, 4000, "2026-10-01", "a"), L("saida", 3000, 1000, "2026-10-01", "a"), L("entrada", 2000, 0, "2026-10-01", "b")],
    );
    assert.equal(r.length, 2, "projeto sem valor nem lançamento fica de fora");
    assert.deepEqual(
      [r[0].receita, r[0].recebido, r[0].semLancar, r[0].custos, r[0].custosAbertos, r[0].margem, r[0].margemPct],
      [10_000, 4000, 6000, 3000, 2000, 7000, 0.7],
    );
    assert.equal(r[1].receita, 2000);
  });

  test("cards do mês: id estável, tema com o mês, no máximo 60", () => {
    const cards = c.cardsDoMes("1234abcd-0000-4000-8000-000000000000", [{ titulo: "Reels", qtd: 2 }], "2026-10", "outubro");
    assert.deepEqual(
      cards.map((x) => [x.id, x.tema]),
      [
        ["rec-1234abcd00004000-202610-1", "Reels · 1 de 2 · outubro"],
        ["rec-1234abcd00004000-202610-2", "Reels · 2 de 2 · outubro"],
      ],
    );
    assert.equal(c.cardsDoMes("x", [{ titulo: "Post", qtd: 999 }], "2026-10", "outubro").length, 60);
    assert.deepEqual(f.lerEntregas("8 reels\n12x posts\nStories"), [
      { titulo: "Reels", qtd: 8 },
      { titulo: "Posts", qtd: 12 },
      { titulo: "Stories", qtd: 1 },
    ]);
  });
});

describe("no banco", () => {
  let lanc: string;

  test("lançamento: gestão cria; equipe e leitura não leem nem criam", async () => {
    const v = f.validarLancamento({ tipo: "entrada", categoria: "cliente", descricao: "Café · parcela 1", valor: "1.000,00", vencimento: "2026-10-10" });
    assert.ok(v.ok);
    if (!v.ok) return;
    const r = await f.salvarLancamento(o.gestor, v.entrada);
    assert.ok(r.ok);
    if (r.ok) lanc = r.id;
    assert.equal((await f.salvarLancamento(o.equipe, v.entrada)).ok, false);
    assert.equal((await f.listarLancamentos(o.equipe, { mes: null })).lancamentos.length, 0, "equipe não lê");
    assert.equal((await f.listarLancamentos(o.leitura, { mes: null })).lancamentos.length, 0, "leitura não lê");
    assert.equal((await f.listarLancamentos(o.b, { mes: null })).lancamentos.length, 0, "a outra organização não vê");
    assert.equal(
      f.validarLancamento({ tipo: "entrada", categoria: "freela", descricao: "x", valor: "1", vencimento: "2026-10-10" }).ok,
      false,
      "categoria do outro tipo",
    );
  });

  test("baixa parcial, total, além do aberto e desfazer", async () => {
    assert.ok((await f.darBaixa(o.gestor, lanc, { valorCents: 40_000, data: "2026-10-12" }, "2026-10-28")).ok);
    let l = await f.obterLancamento(o.gestor, lanc, "2026-10-28");
    assert.deepEqual([l?.pagoCents, l?.status, l?.pagoEm], [40_000, "atrasado", "2026-10-12"]);
    const demais = await f.darBaixa(o.gestor, lanc, { valorCents: 70_000 });
    assert.ok(!demais.ok && demais.erro === "valor");
    assert.ok((await f.darBaixa(o.gestor, lanc, {}, "2026-10-28")).ok, "sem valor quita o que falta");
    l = await f.obterLancamento(o.gestor, lanc, "2026-10-28");
    assert.deepEqual([l?.pagoCents, l?.status, l?.baixas.length], [100_000, "pago", 2]);
    assert.equal((await f.darBaixa(o.gestor, lanc, {})).ok, false, "quitado");
    assert.equal((await f.darBaixa(o.equipe, lanc, {})).ok, false);
    assert.ok((await f.desfazerBaixa(o.gestor, l!.baixas[1].id)).ok);
    l = await f.obterLancamento(o.gestor, lanc, "2026-10-28");
    assert.equal(l?.pagoCents, 40_000);
    const pouco = f.validarLancamento({ tipo: "entrada", categoria: "cliente", descricao: "x", valor: "100", vencimento: "2026-10-10" });
    assert.ok(pouco.ok);
    if (!pouco.ok) return;
    const menor = await f.salvarLancamento(o.gestor, pouco.entrada, lanc);
    assert.ok(!menor.ok && menor.erro === "valor", "valor menor que o já baixado");
  });

  test("recorrência: gera o mês uma vez só, também com dois pedidos ao mesmo tempo, e os cards da Pauta", async () => {
    const [cli] = (await getBanco().asUser(o.admin, (tx) =>
      tx.execute(sql`insert into maestro.clients (org_id, name) values (${o.orgA}, 'Café') returning id`),
    )) as unknown as {
      id: string;
    }[];
    const v = f.validarRecorrencia({
      tipo: "entrada",
      categoria: "cliente",
      descricao: "Café · contrato",
      valor: "6.500,00",
      dia: "31",
      inicio: "2026-09",
      cliente: cli.id,
      entregas: "2 reels",
    });
    assert.ok(v.ok);
    if (!v.ok) return;
    assert.ok((await f.salvarRecorrencia(o.gestor, v.entrada)).ok);
    const aluguel = f.validarRecorrencia({ tipo: "saida", categoria: "fixo", descricao: "Aluguel", valor: "3500", dia: "5", inicio: "2026-11", entregas: "" });
    if (aluguel.ok) assert.ok((await f.salvarRecorrencia(o.gestor, aluguel.entrada)).ok);
    const [x, y] = await Promise.all([f.gerarRecorrencias(o.gestor, "2026-10"), f.gerarRecorrencias(o.admin, "2026-10")]);
    assert.ok(x.ok && y.ok);
    if (!x.ok || !y.ok) return;
    assert.equal(x.lancamentos + y.lancamentos, 1, "aluguel começa em novembro; o contrato gera uma vez");
    assert.equal(x.cards + y.cards, 2);
    const de_novo = await f.gerarRecorrencias(o.gestor, "2026-10");
    assert.ok(de_novo.ok && de_novo.lancamentos === 0 && de_novo.cards === 0);
    const lista = await f.listarLancamentos(o.gestor, { mes: "2026-10" });
    const gerado = lista.lancamentos.find((l) => l.recorrenciaId);
    assert.deepEqual([gerado?.vencimento, gerado?.valorCents, gerado?.descricao], ["2026-10-31", 650_000, "Café · contrato · outubro de 2026"]);
    const cards = (await getBanco().asUser(o.equipe, (tx) =>
      tx.execute(sql`select id, dados ->> 'coluna' as coluna, dados ->> 'cliente' as cliente from maestro.cards order by id`),
    )) as unknown as {
      id: string;
      coluna: string;
      cliente: string;
    }[];
    assert.equal(cards.length, 2);
    assert.ok(cards.every((k) => k.coluna === "pauta" && k.cliente === cli.id && k.id.startsWith("rec-")));
    const eq = await f.gerarRecorrencias(o.equipe, "2026-11");
    assert.ok(eq.ok && eq.lancamentos === 0, "a equipe nem enxerga as recorrências: nada é gerado por ela");
  });

  test("escala vira a pagar sozinha: acompanha o valor, some se nada foi pago, fica se foi pago", async () => {
    const vf = fr.validarFreela({ nome: "Rafael Moura", funcoes: "Edição", valores: "Edição: 500,00" });
    assert.ok(vf.ok);
    if (!vf.ok) return;
    // Os valores do freela são da área "Diárias e cachês" (a gestão tem); a equipe escala com a diária do cadastro.
    const fl = await fr.salvarFreela(o.gestor, vf.entrada);
    assert.ok(fl.ok);
    if (!fl.ok) return;
    const ve = fr.validarEscala({ freela: fl.id, funcao: "edicao", inicio: "2026-11-02", fim: "2026-11-04", modo: "diaria", valor: "500,00" });
    assert.ok(ve.ok);
    if (!ve.ok) return;
    const e = await fr.salvarEscala(o.equipe, ve.entrada);
    assert.ok(e.ok);
    if (!e.ok) return;
    const aPagar = async () =>
      (await f.listarLancamentos(o.gestor, { mes: null })).lancamentos.filter((l) => l.escalaId === e.id || (l.freelaId === fl.id && l.categoria === "freela"));
    let ls = await aPagar();
    assert.equal(ls.length, 1);
    assert.deepEqual([ls[0].tipo, ls[0].valorCents, ls[0].vencimento, ls[0].descricao], ["saida", 150_000, "2026-11-04", "Rafael Moura · edição"]);
    // Mudou o período: o valor e o vencimento acompanham.
    await fr.salvarEscala(o.equipe, { ...ve.entrada, fim: "2026-11-05" }, e.id);
    ls = await aPagar();
    assert.deepEqual([ls[0].valorCents, ls[0].vencimento], [200_000, "2026-11-05"]);
    // Pagou uma parte: o vencimento não muda mais; tirar a escala não apaga o que foi pago.
    assert.ok((await f.darBaixa(o.gestor, ls[0].id, { valorCents: 50_000 })).ok);
    await fr.salvarEscala(o.equipe, { ...ve.entrada, fim: "2026-11-06" }, e.id);
    ls = await aPagar();
    assert.deepEqual([ls[0].valorCents, ls[0].vencimento], [250_000, "2026-11-05"]);
    assert.ok((await fr.removerEscala(o.equipe, e.id)).ok);
    ls = await aPagar();
    assert.equal(ls.length, 1, "o pago fica");
    assert.equal(ls[0].escalaId, null);
    // Escala nova, sem pagamento: tirar apaga o a pagar.
    const e2 = await fr.salvarEscala(o.equipe, { ...ve.entrada, inicio: "2026-12-01", fim: "2026-12-01" });
    assert.ok(e2.ok);
    assert.equal((await aPagar()).length, 2);
    if (e2.ok) await fr.removerEscala(o.equipe, e2.id);
    assert.equal((await aPagar()).length, 1);
    const ap = await f.aPagarEReceber(o.gestor, "2026-10-28");
    assert.ok(ap.freelas.some((g) => g.nome === "Rafael Moura"));
  });
});
