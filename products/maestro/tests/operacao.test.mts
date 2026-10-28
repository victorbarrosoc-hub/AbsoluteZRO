// Operação: banco de freelas (valores, dados de pagamento cifrados e só para a gestão), inventário (reserva dupla
// barrada no banco, mesmo em paralelo), agenda (escalar na diária com a diária do cadastro, conflito) e documentos
// (ordem do dia montada da diária, checklist do que está reservado, conteúdo conferido por tipo).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("operacao");
const fun = await import("../src/lib/freelas/funcoes");
const pag = await import("../src/lib/freelas/pagamento");
const fr = await import("../src/lib/freelas/servidor");
const nomes = await import("../src/lib/inventario/nomes");
const inv = await import("../src/lib/inventario/servidor");
const ag = await import("../src/lib/agenda/servidor");
const conteudo = await import("../src/lib/documentos/conteudo");
const docs = await import("../src/lib/documentos/servidor");
const { getBanco, codigoPg } = amb.banco;
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;
let rafael: string;
let caio: string;
let projeto: string;

before(async () => {
  o = await duasOrganizacoes();
  const [p] = (await getBanco().asUser(o.admin, (tx) =>
    tx.execute(sql`insert into maestro.projects (org_id, code, title) values (${o.orgA}, 'MAE-2026-001', 'Filme Safra') returning id`),
  )) as unknown as { id: string }[];
  projeto = p.id;
});
after(() => amb.fechar());

describe("freelas", () => {
  test("funções e valores em texto, WhatsApp e diária sugerida", () => {
    assert.equal(fun.normalizarFuncao(" drone "), "drone");
    assert.equal(fun.normalizarFuncao("Captação com câmera"), "captacao-camera");
    assert.equal(fun.normalizarFuncao("maquiagem", ["Maquiagem"]), "Maquiagem");
    assert.equal(fun.normalizarFuncao("   "), null);
    assert.deepEqual(fr.lerValores("Edição: 450,00\nMotion: 2.200,00 por projeto\nColor e finalização: R$ 600 por vídeo"), [
      { funcao: "edicao", unidade: "diaria", valorCents: 45_000 },
      { funcao: "motion", unidade: "projeto", valorCents: 220_000 },
      { funcao: "color", unidade: "video", valorCents: 60_000 },
    ]);
    assert.equal(fr.lerValores("Edição: 450\nEdição: 500"), null, "a mesma função e unidade duas vezes");
    assert.equal(fr.lerValores("Edição quatrocentos"), null);
    assert.equal(fun.textoWhatsapp(null, "Lívia Andrade", "Produtora X"), "Oi, Lívia! Tudo bem? Aqui é da Produtora X.");
    assert.equal(fun.diariaSugerida([{ funcao: "som", unidade: "diaria", valorCents: 600 }], "edicao"), 600);
    assert.equal(fun.diasDoPeriodo("2026-11-01", "2026-11-03"), 3);
  });

  test("CPF, CNPJ e PIX conferidos", () => {
    assert.equal(pag.lerDocumento("529.982.247-25"), "52998224725");
    assert.equal(pag.lerDocumento("111.111.111-11"), undefined);
    assert.equal(pag.lerDocumento("11.222.333/0001-81"), "11222333000181");
    assert.equal(pag.lerDocumento("12.345.678/0001-00"), undefined);
    assert.equal(pag.lerDocumento(""), null);
    assert.deepEqual(pag.lerPix("email", "Pessoa@Exemplo.com"), { tipo: "email", chave: "pessoa@exemplo.com" });
    assert.equal(pag.lerPix("cpf", "123"), undefined);
    assert.equal(pag.formatarDocumento("52998224725"), "529.982.247-25");
  });

  test("cadastro: equipe cadastra; leitura não; a outra organização não vê", async () => {
    const v = fr.validarFreela({
      nome: "Rafael Moura",
      cidade: "São Paulo",
      funcoes: "Captação com câmera, Drone",
      valores: "Captação com câmera: 900,00\nDrone: 700",
      whatsapp: "(11) 91234-5678",
    });
    assert.ok(v.ok);
    if (!v.ok) return;
    assert.equal(v.entrada.whatsapp, "5511912345678");
    const r = await fr.salvarFreela(o.equipe, v.entrada);
    assert.ok(r.ok);
    if (r.ok) rafael = r.id;
    const v2 = fr.validarFreela({ nome: "Caio Bastos", funcoes: "Som", valores: "Som direto: 600" });
    if (v2.ok) {
      const r2 = await fr.salvarFreela(o.gestor, v2.entrada);
      if (r2.ok) caio = r2.id;
    }
    assert.equal((await fr.salvarFreela(o.leitura, v.entrada)).ok, false);
    assert.equal((await fr.listarFreelas(o.b)).length, 0);
    const l = await fr.listarFreelas(o.leitura, { funcao: "drone" });
    assert.deepEqual(
      l.map((x) => [x.nome, x.diaria]),
      [["Rafael Moura", 70_000]],
    );
  });

  test("dados de pagamento: cifrados no banco, só a gestão lê, a cifra não abre em outro freela", async () => {
    const v = fr.validarPagamento({ documento: "529.982.247-25", pixTipo: "cpf", pix: "52998224725", titular: "Rafael Moura" });
    assert.ok(v.ok);
    if (!v.ok) return;
    const eq = await fr.salvarPagamento(o.equipe, rafael, v.entrada);
    assert.ok(!eq.ok && eq.erro === "sem_permissao", "equipe não grava");
    assert.ok((await fr.salvarPagamento(o.gestor, rafael, v.entrada)).ok);
    const [cru] = (await getBanco().asSystem("conferir", (tx) => tx.execute(sql`select documento_enc, pix_enc from maestro.freela_pagamento`))) as unknown as {
      documento_enc: string;
      pix_enc: string;
    }[];
    assert.match(cru.documento_enc, /^v1\./);
    assert.equal(cru.documento_enc.includes("52998224725"), false, "nunca em claro");
    // A equipe não lê nem a cifra (RLS em todo comando) e a ficha não traz o campo.
    const n = await getBanco().asUser(o.equipe, (tx) => tx.execute(sql`select count(*)::int as n from maestro.freela_pagamento`));
    assert.equal((n[0] as { n: number }).n, 0);
    const fichaEquipe = await fr.obterFreela(o.equipe, "equipe", rafael, "2026-10-28");
    assert.equal(fichaEquipe?.dadosPagamento, undefined);
    const fichaGestor = await fr.obterFreela(o.gestor, "gestor", rafael, "2026-10-28");
    assert.deepEqual(fichaGestor?.dadosPagamento, { documento: "52998224725", pix: "52998224725", pixTipo: "cpf", titular: "Rafael Moura", ilegivel: false });
    // Copiar a cifra para outro freela não abre (o contexto amarra organização, freela e campo).
    await getBanco().asSystem("adulterar", (tx) =>
      tx.execute(sql`insert into maestro.freela_pagamento (org_id, freela_id, documento_enc) values (${o.orgA}, ${caio}, ${cru.documento_enc})`),
    );
    const outro = await fr.obterFreela(o.gestor, "gestor", caio, "2026-10-28");
    assert.deepEqual([outro?.dadosPagamento?.documento, outro?.dadosPagamento?.ilegivel], [null, true]);
    assert.equal(await fr.obterFreela(o.b, "admin", rafael, "2026-10-28"), null);
  });
});

describe("inventário", () => {
  let fx6: string;
  let ducato: string;

  test("nomes: categoria pelo nome, chave do modelo e nome limpo", () => {
    assert.equal(nomes.adivinharCategoria("Sony FX30"), "camera");
    assert.equal(nomes.adivinharCategoria("Sigma 18-35mm 1.8"), "lente");
    assert.equal(nomes.adivinharCategoria("Lapela Sennheiser EW-D"), "audio");
    assert.equal(nomes.adivinharCategoria("Aputure 600d Pro"), "luz");
    assert.equal(nomes.adivinharCategoria("DJI Mavic 3 Pro"), "drone");
    assert.equal(nomes.adivinharCategoria("Fiat Ducato"), "veiculo");
    assert.equal(nomes.adivinharCategoria("Coisa estranha"), "outro");
    assert.equal(nomes.chaveDoEquipamento("Sony A7-IV"), nomes.chaveDoEquipamento("sony a7 iv"));
    assert.equal(nomes.limparNome("• sony fx3."), "Sony fx3");
    assert.ok(nomes.cruzam({ inicio: "2026-11-01", fim: "2026-11-02" }, { inicio: "2026-11-02", fim: "2026-11-03" }));
    assert.equal(nomes.cruzam({ inicio: "2026-11-01", fim: "2026-11-01" }, { inicio: "2026-11-02", fim: "2026-11-03" }), false);
  });

  test("cadastro, patrimônio único e veículo com consumo", async () => {
    const v = inv.validarEquipamento({ nome: "Sony FX6", categoria: "auto", patrimonio: "PAT-001", valor: "38.900,00" });
    assert.ok(v.ok && v.entrada.categoria === "camera");
    if (!v.ok) return;
    const r = await inv.salvarEquipamento(o.equipe, v.entrada);
    assert.ok(r.ok);
    if (r.ok) fx6 = r.id;
    const dup = await inv.salvarEquipamento(o.equipe, { ...v.entrada, nome: "Outra" });
    assert.ok(!dup.ok && dup.erro === "patrimonio");
    const c = inv.validarEquipamento({ nome: "Fiat Ducato", kmL: "9,5" });
    if (c.ok) {
      const rc = await inv.salvarEquipamento(o.equipe, c.entrada);
      if (rc.ok) ducato = rc.id;
    }
    assert.deepEqual(await inv.listarVeiculos(o.leitura), [{ id: ducato, nome: "Fiat Ducato", kmL: 9.5 }]);
    assert.equal((await inv.salvarEquipamento(o.leitura, v.entrada)).ok, false);
  });

  test("reserva dupla é barrada no banco; vizinha, cancelada e outro item passam", async () => {
    const r1 = await inv.reservar(o.equipe, { equipamentoId: fx6, projetoId: projeto, eventoId: null, inicio: "2026-11-01", fim: "2026-11-02", notas: null });
    assert.ok(r1.ok);
    const r2 = await inv.reservar(o.equipe, { equipamentoId: fx6, projetoId: null, eventoId: null, inicio: "2026-11-02", fim: "2026-11-04", notas: null });
    assert.ok(!r2.ok && r2.erro === "conflito");
    // Direto no banco (sem passar pela aplicação) também não entra.
    const e = await getBanco()
      .asUser(o.equipe, (tx) =>
        tx.execute(sql`insert into maestro.reservas (org_id, equipamento_id, inicio, fim) values (${o.orgA}, ${fx6}, '2026-11-01', '2026-11-01')`),
      )
      .then(
        () => null,
        (x) => x,
      );
    assert.equal(codigoPg(e), "23P01");
    assert.ok(
      (await inv.reservar(o.equipe, { equipamentoId: fx6, projetoId: null, eventoId: null, inicio: "2026-11-03", fim: "2026-11-03", notas: null })).ok,
      "vizinha",
    );
    assert.ok(
      (await inv.reservar(o.equipe, { equipamentoId: ducato, projetoId: null, eventoId: null, inicio: "2026-11-01", fim: "2026-11-02", notas: null })).ok,
      "outro item",
    );
    if (r1.ok) assert.ok((await inv.mudarReserva(o.equipe, r1.id, "cancelar")).ok);
    assert.ok(
      (await inv.reservar(o.equipe, { equipamentoId: fx6, projetoId: null, eventoId: null, inicio: "2026-11-02", fim: "2026-11-02", notas: null })).ok,
      "cancelada libera",
    );
  });

  test("duas reservas ao mesmo tempo para o mesmo período: só uma entra", async () => {
    const pedido = () =>
      inv.reservar(o.equipe, { equipamentoId: ducato, projetoId: null, eventoId: null, inicio: "2026-12-10", fim: "2026-12-12", notas: null });
    const rs = await Promise.all([pedido(), pedido(), pedido()]);
    assert.equal(rs.filter((r) => r.ok).length, 1);
  });

  test("saída e retorno mudam o estado; a outra organização não alcança o item", async () => {
    const r = await inv.reservar(o.equipe, { equipamentoId: fx6, projetoId: null, eventoId: null, inicio: "2026-12-20", fim: "2026-12-20", notas: null });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.ok((await inv.mudarReserva(o.equipe, r.id, "saida")).ok);
    assert.equal((await inv.obterEquipamento(o.equipe, fx6, "2026-10-28"))?.estado, "em_uso");
    assert.ok((await inv.mudarReserva(o.equipe, r.id, "retorno")).ok);
    assert.equal((await inv.obterEquipamento(o.equipe, fx6, "2026-10-28"))?.estado, "disponivel");
    const alheia = await inv.reservar(o.b, { equipamentoId: fx6, projetoId: null, eventoId: null, inicio: "2027-01-01", fim: "2027-01-01", notas: null });
    assert.equal(alheia.ok, false, "a chave composta não deixa apontar para o item de outra organização");
    assert.equal(await inv.obterEquipamento(o.b, fx6, "2026-10-28"), null);
  });
});

describe("agenda e documentos", () => {
  let diaria: string;

  test("escalar na diária: a diária do cadastro, o período da diária e o aviso de conflito", async () => {
    const v = ag.validarEvento({
      tipo: "diaria",
      titulo: "Safra: fazenda",
      data: "2026-11-01",
      dataFim: "2026-11-02",
      horaIni: "06:00",
      local: "Fazenda",
      projeto,
    });
    assert.ok(v.ok);
    if (!v.ok) return;
    const r = await ag.salvarEvento(o.equipe, v.entrada);
    assert.ok(r.ok);
    if (!r.ok) return;
    diaria = r.id;
    assert.ok((await ag.escalarNaDiaria(o.equipe, diaria, rafael, "captacao-camera", null)).ok);
    assert.ok((await ag.escalarNaDiaria(o.equipe, diaria, caio, "", null)).ok);
    const dup = await ag.escalarNaDiaria(o.equipe, diaria, rafael, "drone", null);
    assert.ok(!dup.ok && dup.erro === "repetida");
    const esc = await fr.escalasDoProjeto(o.gestor, "gestor", projeto, "2026-10-28");
    const r1 = esc.find((e) => e.freelaId === rafael);
    assert.deepEqual([r1?.dias, r1?.diariaCents, r1?.valorCents], [2, 90_000, 180_000]);
    // Outra diária no mesmo dia com o Rafael: conflito nas duas.
    const v2 = ag.validarEvento({ tipo: "diaria", titulo: "Depoimentos", data: "2026-11-02" });
    if (!v2.ok) return;
    const r2 = await ag.salvarEvento(o.equipe, v2.entrada);
    if (r2.ok) await ag.escalarNaDiaria(o.equipe, r2.id, rafael, "", 50_000);
    const evs = await ag.listarEventos(o.leitura, "2026-11-01", "2026-11-30");
    const fazenda = evs.find((e) => e.id === diaria);
    assert.deepEqual(
      fazenda?.equipe.find((p) => p.freelaId === rafael)?.conflitos.map((c) => c.titulo),
      ["Depoimentos"],
    );
    assert.equal(fazenda?.equipe.find((p) => p.freelaId === caio)?.conflitos.length, 0);
    // Mudar a data da diária leva a escala junto.
    await ag.salvarEvento(o.equipe, { ...v.entrada, dataFim: "2026-11-03" }, diaria);
    const depois = (await fr.escalasDoProjeto(o.gestor, "gestor", projeto, "2026-10-28")).find((e) => e.freelaId === rafael);
    assert.deepEqual([depois?.fim, depois?.dias, depois?.valorCents], ["2026-11-03", 3, 270_000]);
    assert.equal((await ag.listarEventos(o.b, "2026-11-01", "2026-11-30")).length, 0);
  });

  test("ordem do dia montada da diária e checklist do que está reservado", async () => {
    const eq = (await inv.listarEquipamentos(o.equipe, "2026-10-28")).find((e) => e.nome === "Fiat Ducato")!;
    assert.ok(
      (await inv.reservar(o.equipe, { equipamentoId: eq.id, projetoId: projeto, eventoId: diaria, inicio: "2026-11-03", fim: "2026-11-03", notas: null })).ok,
    );
    const od = await docs.criarDocumento(o.equipe, { projetoId: projeto, tipo: "ordem_do_dia", titulo: "Ordem do dia", data: "2026-11-01", eventoId: diaria });
    assert.ok(od.ok);
    if (!od.ok) return;
    const d = await docs.obterDocumento(o.leitura, od.id);
    const c = d?.conteudo as import("../src/lib/documentos/conteudo").OrdemDoDia;
    assert.equal(c.chamada, "06:00");
    assert.equal(c.local, "Fazenda");
    assert.deepEqual(c.equipe.map((p) => [p.nome, p.funcao]).sort(), [
      ["Caio Bastos", "Som"],
      ["Rafael Moura", "Captação com câmera"],
    ]);
    const ck = await docs.criarDocumento(o.equipe, { projetoId: projeto, tipo: "checklist", titulo: "Checklist", data: null, eventoId: diaria });
    assert.ok(ck.ok);
    if (!ck.ok) return;
    const dc = await docs.obterDocumento(o.equipe, ck.id);
    assert.deepEqual((dc?.conteudo as { itens: unknown[] }).itens, [{ nome: "Fiat Ducato", qtd: 1, saiu: false, voltou: false }]);
    assert.ok((await docs.salvarDocumento(o.equipe, ck.id, "Checklist", null, { itens: [{ nome: "Fiat Ducato", qtd: 1, saiu: true, voltou: false }] })).ok);
    assert.equal((await docs.salvarDocumento(o.leitura, ck.id, "x", null, { itens: [] })).ok, false);
    assert.equal(await docs.obterDocumento(o.b, ck.id), null);
  });

  test("conteúdo conferido por tipo", () => {
    assert.deepEqual(conteudo.lerConteudo("checklist", { itens: [{ nome: " Câmera ", qtd: "2", saiu: true }, { nome: "" }] }), {
      itens: [{ nome: "Câmera", qtd: 2, saiu: true, voltou: false }],
    });
    assert.equal(conteudo.lerConteudo("checklist", { itens: "não" }), null);
    const od = conteudo.lerConteudo("ordem_do_dia", {
      chamada: "25:00",
      localUrl: "javascript:alert(1)",
      cronograma: [{ hora: "06:00", atividade: "Chegada" }],
      equipe: [],
      contatos: [{ nome: "Ju", telefone: "(11) 9<script>" }],
    }) as import("../src/lib/documentos/conteudo").OrdemDoDia;
    assert.equal(od.chamada, null);
    assert.equal(od.localUrl, null, "só https");
    assert.equal(od.contatos[0].telefone, "(11) 9");
    assert.equal(conteudo.lerConteudo("decupagem", { planos: Array.from({ length: 501 }, () => ({ plano: "1" })) }) as unknown, null);
    assert.deepEqual(
      conteudo.andamentoChecklist({
        itens: [
          { nome: "a", qtd: 1, saiu: true, voltou: true },
          { nome: "b", qtd: 1, saiu: true, voltou: false },
        ],
      }),
      { total: 2, sairam: 2, voltaram: 1 },
    );
  });
});
