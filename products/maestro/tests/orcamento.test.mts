// Orçamento: o motor puro (totais e margem iguais ao ZRO, faixas, nicho, fórmulas, parcelas, validade) e o ciclo no
// banco real (criar do modelo, editar só em rascunho, enviar, nova versão, aprovar → projeto + parcelas a receber, uma
// vez só; equipe não aprova; a outra organização não vê).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("orcamento");
const m = await import("../src/lib/orcamento/motor");
const precos = await import("../src/lib/orcamento/precos");
const orc = await import("../src/lib/orcamento/orcamentos");
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;

before(async () => {
  o = await duasOrganizacoes();
});
after(() => amb.fechar());

describe("motor puro", () => {
  test("totais e margem: as mesmas contas do ZRO (quoteTotals)", () => {
    const linhas = [
      { quantidade: 3, precoCents: 180_000, custoCents: 90_000 },
      { quantidade: 1.5, precoCents: 33_333, custoCents: 0 },
    ];
    const t = m.totais(linhas, 10_000, 6);
    // 540000 + round(49999.5)=50000 → 590000; desconto 10000 → 580000; imposto 6% = 34800; custo 270000.
    assert.deepEqual(t, {
      subtotal: 590_000,
      desconto: 10_000,
      total: 580_000,
      custo: 270_000,
      imposto: 34_800,
      impostoPct: 6,
      margem: 275_200,
      margemPct: 275_200 / 580_000,
    });
    assert.equal(m.totais(linhas, 999_999_999).desconto, 590_000, "desconto nunca maior que o subtotal");
    assert.equal(m.totais(linhas, -5).desconto, 0);
    assert.equal(m.totais([], 0).margemPct, null);
  });

  test("saúde da margem: prejuízo, baixa (< 20%), saudável e sem custo", () => {
    assert.equal(m.saudeDaMargem(m.totais([{ quantidade: 1, precoCents: 100, custoCents: 150 }])).tom, "perigo");
    assert.equal(m.saudeDaMargem(m.totais([{ quantidade: 1, precoCents: 100, custoCents: 85 }])).rotulo, "Margem baixa");
    const ok = m.saudeDaMargem(m.totais([{ quantidade: 1, precoCents: 100, custoCents: 50 }]));
    assert.equal(ok.tom, "ok");
    assert.match(m.saudeDaMargem(m.totais([{ quantidade: 1, precoCents: 100 }])).dica ?? "", /Sem custos/);
    assert.equal(m.saudeDaMargem(m.totais([])).tom, "neutro");
  });

  test("parcelas padrão: 1x, 2x (entrada e saldo em 30 dias), 3x; a última absorve os centavos", () => {
    assert.deepEqual(m.parcelasPadrao(1000, 1, "2026-10-28"), [{ rotulo: "parcela única", valorCents: 1000, vencimento: "2026-10-28" }]);
    assert.deepEqual(
      m.parcelasPadrao(1001, 2, "2026-10-28").map((p) => [p.rotulo, p.valorCents, p.vencimento]),
      [
        ["entrada", 500, "2026-10-28"],
        ["saldo", 501, "2026-11-27"],
      ],
    );
    const tres = m.parcelasPadrao(1000, 3, "2026-01-31");
    assert.deepEqual(
      tres.map((p) => p.valorCents),
      [333, 333, 334],
    );
    assert.equal(tres[2].vencimento, "2026-04-01");
  });

  test("número, status efetivo, validade e condições", () => {
    assert.equal(m.proximoNumero(2026, ["2026-001", "2026-009", "2025-040"]), "2026-010");
    assert.equal(m.proximoNumero("2027", []), "2027-001");
    assert.equal(m.codigoOrcamento("2026-010", 2), "2026-010 v2");
    assert.equal(m.statusEfetivo({ status: "enviado", validade: "2026-10-01" }, "2026-10-28"), "expirado");
    assert.equal(m.statusEfetivo({ status: "aprovado", validade: "2026-10-01" }, "2026-10-28"), "aprovado");
    assert.equal(m.avisoDeValidade("2026-10-29", "2026-10-28", "enviado")?.rotulo, "Vence amanhã");
    assert.equal(m.avisoDeValidade("2026-10-20", "2026-10-28", "rascunho")?.rotulo, "Venceu há 8 dias");
    assert.equal(m.avisoDeValidade("2026-10-20", "2026-10-28", "aprovado"), null);
    assert.deepEqual(m.lerCondicoes("- uma\n2) duas\n\n• três\r\n"), ["uma", "duas", "três"]);
    assert.equal(m.unidadeComQuantidade("diaria", 2), "diárias");
    assert.equal(m.unidadeComQuantidade("km", 120), "km");
  });

  const item: import("../src/lib/orcamento/motor").ItemTabela = {
    id: "00000000-0000-4000-8000-000000000001",
    grupo: "pos",
    nome: "Edição de vídeo curto",
    descricao: null,
    unidade: "video",
    precoCents: 90_000,
    custoCents: 35_000,
    ativo: true,
    faixas: [
      { aPartirDe: 10, precoCents: 60_000 },
      { aPartirDe: 4, precoCents: 75_000 },
    ],
  };
  const variaveis: import("../src/lib/orcamento/motor").Variavel[] = [
    {
      chave: "nicho",
      rotulo: "Nicho",
      tipo: "escolha",
      opcoes: [
        { valor: "casamento", rotulo: "Casamento", mult: 1.3 },
        { valor: "corporativo", rotulo: "Corporativo", mult: 1 },
      ],
    },
    { chave: "urgencia", rotulo: "Prazo", tipo: "escolha", opcoes: [{ valor: "urgente", rotulo: "Urgente", mult: 1.25, grupos: ["pos"] }] },
    { chave: "videos", rotulo: "Vídeos", tipo: "numero", opcoes: [] },
  ];

  test("faixa por quantidade: a maior faixa alcançada vale", () => {
    assert.equal(m.precoPorQuantidade(item, 1), 90_000);
    assert.equal(m.precoPorQuantidade(item, 4), 75_000);
    assert.equal(m.precoPorQuantidade(item, 9.5), 75_000);
    assert.equal(m.precoPorQuantidade(item, 12), 60_000);
  });

  test("multiplicadores do nicho e da urgência (só no grupo certo)", () => {
    const p = m.precificar(item, 4, variaveis, { nicho: "casamento", urgencia: "urgente" });
    assert.equal(p.precoCents, Math.round(75_000 * 1.3 * 1.25));
    assert.equal(p.detalhe, "Casamento ×1,3 · Urgente ×1,25");
    const captacao = { ...item, grupo: "captacao" as const };
    assert.equal(m.precificar(captacao, 1, variaveis, { urgencia: "urgente" }).precoCents, 90_000, "urgência só em pós");
    assert.equal(m.precificar(item, 1, variaveis, { nicho: "corporativo" }).detalhe, null, "×1 não aparece");
  });

  test("fórmula do modelo: fixo, variável × mult + soma, mínimo e máximo; sem eval", () => {
    assert.equal(m.quantidadeDaFormula({ fixo: 2 }, {}), 2);
    assert.equal(m.quantidadeDaFormula({ var: "videos" }, { videos: "6" }), 6);
    assert.equal(m.quantidadeDaFormula({ var: "videos", mult: 0.5, soma: 1 }, { videos: 5 }), 3.5);
    assert.equal(m.quantidadeDaFormula({ var: "videos", min: 1 }, {}), 1);
    assert.equal(m.quantidadeDaFormula({ var: "videos", max: 10 }, { videos: 40 }), 10);
    assert.equal(m.quantidadeDaFormula({ var: "videos" }, { videos: "process.exit()" }), 0);
    const linhas = m.aplicarModelo(
      {
        linhas: [
          { itemId: item.id, qtd: { var: "videos" } },
          { itemId: "inexistente", qtd: { fixo: 1 } },
        ],
      },
      { videos: 4, nicho: "casamento" },
      [item],
      variaveis,
    );
    assert.equal(linhas.length, 1);
    assert.deepEqual([linhas[0].quantidade, linhas[0].precoCents], [4, 97_500]);
    assert.equal(
      m.aplicarModelo({ linhas: [{ itemId: item.id, qtd: { var: "videos" } }] }, { videos: 0 }, [item], variaveis).length,
      0,
      "quantidade zero fica de fora",
    );
  });

  test("leitura do que vem da tela: faixas, opções e linhas do modelo", () => {
    assert.deepEqual(precos.lerFaixas("4: 750,00\n10 = 600"), [
      { aPartirDe: 4, precoCents: 75_000 },
      { aPartirDe: 10, precoCents: 60_000 },
    ]);
    assert.equal(precos.lerFaixas("4: 750\n4: 700"), null, "faixa repetida");
    assert.equal(precos.lerFaixas("quatro: 10"), null);
    const op = precos.lerOpcoesEmTexto("Casamento: 1,3\nUrgente: 1,25 | pos, extra\nNormal");
    assert.deepEqual(op, [
      { valor: "casamento", rotulo: "Casamento", mult: 1.3 },
      { valor: "urgente", rotulo: "Urgente", mult: 1.25, grupos: ["pos", "extra"] },
      { valor: "normal", rotulo: "Normal" },
    ]);
    assert.equal(precos.lerOpcoesEmTexto("Absurdo: 50"), null, "multiplicador fora de 0–10");
    assert.equal(m.lerLinhasDoModelo([{ itemId: "x", qtd: {} }]), null);
    assert.deepEqual(m.lerLinhasDoModelo([{ itemId: item.id, qtd: { var: "videos; drop table", fixo: "2" } }]), [{ itemId: item.id, qtd: { fixo: 2 } }]);
  });
});

describe("no banco", () => {
  let modeloId: string;
  let clienteId: string;
  let orcId: string;

  test("tabela de preços: gestão grava; equipe e leitura não", async () => {
    const it = precos.validarItem({
      nome: "Edição de vídeo curto",
      grupo: "pos",
      unidade: "video",
      preco: "900,00",
      custo: "350",
      faixas: "4: 750,00",
      ativo: "sim",
    });
    assert.ok(it.ok);
    if (!it.ok) return;
    const r = await precos.salvarItem(o.gestor, it.entrada);
    assert.ok(r.ok);
    const neg = await precos.salvarItem(o.equipe, it.entrada);
    assert.equal(neg.ok, false);
    const v = precos.validarVariavel({ rotulo: "Vídeos", tipo: "numero" });
    assert.ok(v.ok);
    if (v.ok) assert.ok((await precos.salvarVariavel(o.gestor, v.entrada)).ok);
    const n = precos.validarVariavel({ rotulo: "Nicho", tipo: "escolha", opcoes: "Casamento: 1,3\nCorporativo" });
    if (n.ok) assert.ok((await precos.salvarVariavel(o.gestor, n.entrada)).ok);
    const dup = precos.validarVariavel({ rotulo: "Nicho", tipo: "numero" });
    if (dup.ok) assert.equal((await precos.salvarVariavel(o.gestor, dup.entrada)).ok, false, "chave repetida");
    const mo = precos.validarModelo({ nome: "Reels", linhas: [{ itemId: r.ok ? r.id : "", qtd: { var: "videos" } }], respostas: { videos: 4 } });
    assert.ok(mo.ok);
    if (!mo.ok) return;
    const mr = await precos.salvarModelo(o.gestor, mo.entrada);
    assert.ok(mr.ok);
    if (mr.ok) modeloId = mr.id;
    const t = await precos.carregarTabela(o.leitura);
    assert.equal(t.itens[0].faixas[0].precoCents, 75_000, "leitura lê");
    assert.equal((await precos.carregarTabela(o.b)).itens.length, 0, "a outra organização não vê");
  });

  test("criar do modelo: número do ano, linhas pela faixa e nicho", async () => {
    const [c] = (await amb.banco
      .getBanco()
      .asUser(o.admin, (tx) => tx.execute(sql`insert into maestro.clients (org_id, name) values (${o.orgA}, 'Café') returning id`))) as unknown as {
      id: string;
    }[];
    clienteId = c.id;
    const r = await orc.criarOrcamento(
      o.equipe,
      { titulo: "Reels de novembro", clienteId, projetoId: null, modeloId, respostas: { videos: "6", nicho: "casamento" } },
      "2026-10-28",
    );
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.numero, "2026-001");
    orcId = r.id;
    const f = await orc.obterOrcamento(o.equipe, r.id, "2026-10-28");
    assert.equal(f?.itens.length, 1);
    assert.equal(f?.itens[0].quantidade, 6);
    assert.equal(f?.itens[0].precoCents, Math.round(75_000 * 1.3));
    assert.equal(f?.validade, "2026-11-12", "15 dias pela empresa (padrão)");
    const r2 = await orc.criarOrcamento(o.equipe, { titulo: "Outro", clienteId: null, projetoId: null, modeloId: null, respostas: {} }, "2026-10-28");
    assert.ok(r2.ok && r2.numero === "2026-002");
    assert.equal(await orc.obterOrcamento(o.b, r.id), null, "a outra organização não abre");
  });

  test("editar só em rascunho; enviar trava; voltar destrava", async () => {
    const v = orc.validarEdicao({
      titulo: "Reels de novembro",
      clienteId,
      descontoCents: 1000,
      impostoPct: 6,
      itens: [{ descricao: "Edição", quantidade: 2, precoCents: 50_000, custoCents: 20_000 }],
    });
    assert.ok(v.ok);
    if (!v.ok) return;
    assert.ok((await orc.salvarOrcamento(o.equipe, orcId, v.e)).ok);
    assert.equal((await orc.salvarOrcamento(o.leitura, orcId, v.e)).ok, false, "leitura não edita");
    assert.ok((await orc.mudarStatus(o.equipe, orcId, "enviado")).ok);
    const travado = await orc.salvarOrcamento(o.equipe, orcId, v.e);
    assert.ok(!travado.ok && travado.erro === "travado");
    assert.equal((await orc.mudarStatus(o.equipe, orcId, "aprovado" as never)).ok, false, "aprovar não é passo de status");
    assert.ok(orc.validarEdicao({ titulo: "", itens: [] }).ok === false);
    assert.ok(orc.validarEdicao({ titulo: "x", itens: [{ descricao: "a", quantidade: 0, precoCents: 1 }] }).ok === false);
  });

  test("nova versão copia linhas; aprovar abre projeto e lança parcelas, uma vez só", async () => {
    const nv = await orc.novaVersao(o.equipe, orcId, "2026-10-30");
    assert.ok(nv.ok && nv.versao === 2);
    if (!nv.ok) return;
    const doc = await orc.documentoDoOrcamento(o.equipe, nv.id, "2026-10-30");
    assert.equal(doc?.total, 99_000);
    assert.equal(JSON.stringify(doc).includes("custo"), false, "o timbrado não leva custo");

    const parcelas = [
      { valorCents: 49_500, vencimento: "2026-10-30" },
      { valorCents: 49_500, vencimento: "2026-11-29" },
    ];
    const eq = await orc.aprovarOrcamento(o.equipe, nv.id, parcelas);
    assert.equal(eq.ok, false, "equipe não lança no Financeiro");
    const errado = await orc.aprovarOrcamento(o.gestor, nv.id, [{ valorCents: 1, vencimento: "2026-10-30" }]);
    assert.ok(!errado.ok && errado.erro === "parcelas");
    const ok = await orc.aprovarOrcamento(o.gestor, nv.id, parcelas);
    assert.ok(ok.ok);
    const de_novo = await orc.aprovarOrcamento(o.gestor, nv.id, parcelas);
    assert.equal(de_novo.ok, false);
    const outra = await orc.aprovarOrcamento(o.gestor, orcId, parcelas);
    assert.ok(!outra.ok && /versão 2/.test(outra.mensagem), "só uma versão aprovada por número");
    const [r] = (await amb.banco.getBanco().asSystem("conferir", (tx) =>
      tx.execute(sql`select (select count(*)::int from maestro.lancamentos where orcamento_id = ${nv.id}) as n,
                            (select sum(valor_cents)::int from maestro.lancamentos where orcamento_id = ${nv.id}) as soma,
                            (select value_cents::int from maestro.projects p join maestro.orcamentos q on q.projeto_id = p.id where q.id = ${nv.id}) as valor`),
    )) as unknown as { n: number; soma: number; valor: number }[];
    assert.deepEqual(r, { n: 2, soma: 99_000, valor: 99_000 });
  });
});
