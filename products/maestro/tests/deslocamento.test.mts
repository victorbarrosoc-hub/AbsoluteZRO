// Calculadora de deslocamento (porte do ZRO, generalizada): contas, a linha do orçamento, a leitura do Photon e do
// OSRM, o lugar escolhido sozinho a partir do texto digitado, o preço pelo lugar (município, estado, Brasil), os
// veículos de partida e a planilha semanal da ANP (municípios, estados e Brasil; gasolina, etanol e diesel S10) num
// .xlsx de mentira no desenho da de verdade (tests/anp-fixture.mts). Nada de rede aqui; o banco e o agendamento ficam
// em combustivel.test.mts, os serviços com o Photon/OSRM falsos em rota.test.mts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calcularDeslocamento,
  chaveDoMunicipio,
  dataDoExcel,
  escolherPreco,
  lerTextoDeLugar,
  linhaDeDeslocamento,
  linkDaPlanilhaSemanal,
  lugaresDoPhoton,
  melhorLugar,
  nomeBonito,
  nomeDoLugar,
  rotaDoOsrm,
  rotuloDoPreco,
  semanaDaPlanilha,
  tempoDeCarro,
  type PrecoGuardado,
} from "../src/lib/orcamento/deslocamento";
import { aplicarVeiculo, combustiveisDo, consumoDo, VEICULOS_PADRAO, veiculoPadrao } from "../src/lib/orcamento/veiculos";
import { lerZip } from "../src/lib/orcamento/zip";
import { paginaAnp, planilhaAnp } from "./anp-fixture.mts";
import { osrmFalso, photonFalso } from "./rota-fixture.mts";

describe("contas", () => {
  test("rodagem, litros e custo: ida e volta × viagens, com pedágio", () => {
    const d = calcularDeslocamento({ kmIda: 280, idaEVolta: true, viagens: 2, kmPorLitro: 10, litroCents: 629, pedagioCents: 4_500 });
    assert.equal(d.kmTotal, 1120);
    assert.equal(d.litros, 112);
    assert.equal(d.combustivelCents, 70_448);
    assert.equal(d.pedagioCents, 9_000);
    assert.equal(d.custoCents, 79_448);
    assert.equal(
      calcularDeslocamento({ kmIda: 100, idaEVolta: false, viagens: 0, kmPorLitro: 0, litroCents: 600 }).custoCents,
      0,
      "sem consumo = zero, nunca NaN",
    );
    assert.equal(calcularDeslocamento({ kmIda: Number.NaN, idaEVolta: true, viagens: 1, kmPorLitro: 10, litroCents: 600 }).custoCents, 0);
  });

  test("a linha do orçamento: descrição com a rota e o detalhe", () => {
    const l = linhaDeDeslocamento({ kmIda: 280, idaEVolta: true, viagens: 2, kmPorLitro: 10, litroCents: 629 }, "Natal", "Mossoró");
    assert.equal(l.descricao, "Deslocamento Natal → Mossoró");
    assert.equal(l.detalhe, "1.120 km · ida e volta · 2 viagens · 112 L a R$ 6,29/L");
    assert.deepEqual([l.quantidade, l.unidade, l.precoCents, l.custoCents], [1, "trecho", 70_448, 70_448]);
    assert.equal(
      linhaDeDeslocamento({ kmIda: 12.5, idaEVolta: false, viagens: 1, kmPorLitro: 10, litroCents: 600 }, null, null).descricao,
      "Deslocamento 12,5 km",
    );
  });
});

describe("serviços abertos (só a leitura das respostas)", () => {
  test("Photon: cidade antes de rua, só Brasil, UF pela sigla, sem repetir", () => {
    const r = lugaresDoPhoton({
      features: [
        {
          geometry: { coordinates: [-34.86, -7.11] },
          properties: { name: "Rua João Pessoa", type: "street", osm_key: "highway", city: "Natal", state: "Rio Grande do Norte", countrycode: "BR" },
        },
        { geometry: { coordinates: [-34.86, -7.12] }, properties: { name: "João Pessoa", type: "city", state: "Paraíba", countrycode: "BR" } },
        { geometry: { coordinates: [-34.86, -7.12] }, properties: { name: "João Pessoa", type: "city", state: "Paraíba", countrycode: "BR" } },
        { geometry: { coordinates: [-8.6, 41.1] }, properties: { name: "Porto", type: "city", countrycode: "PT" } },
        { properties: { name: "sem geometria" } },
      ],
    });
    assert.deepEqual(
      r.map((l) => [l.rotulo, l.detalhe]),
      [
        ["João Pessoa", "PB"],
        ["Rua João Pessoa", "Natal · RN"],
      ],
    );
    assert.deepEqual(lugaresDoPhoton(null), []);
  });

  test("OSRM: km de uma ida com uma casa e minutos; sem rota = null", () => {
    assert.deepEqual(rotaDoOsrm({ code: "Ok", routes: [{ distance: 279_640, duration: 13_000 }] }), { km: 279.6, minutos: 217 });
    assert.equal(rotaDoOsrm({ code: "NoRoute" }), null);
    assert.equal(rotaDoOsrm({ code: "Ok", routes: [{}] }), null);
  });

  test("zip estragado não abre", () => {
    assert.throws(() => lerZip(Buffer.from("não é zip"), () => true));
  });
});

describe("ANP: a planilha semanal", () => {
  const xlsx = () => lerZip(planilhaAnp(), (n) => n.startsWith("xl/"));

  test("datas do Excel e dd/mm/aaaa", () => {
    assert.equal(dataDoExcel("46313"), "2026-10-18");
    assert.equal(dataDoExcel("18/10/2026"), "2026-10-18");
    assert.equal(dataDoExcel(""), "");
    assert.equal(dataDoExcel("abc"), "");
  });

  test("município, estado e Brasil; só gasolina comum, etanol e diesel S10; datas das células", () => {
    const s = semanaDaPlanilha(xlsx());
    assert.ok(s);
    assert.equal(s.semana, "2026-10-18");
    assert.equal(s.semanaFim, "2026-10-24");
    const achar = (uf: string, municipio: string, c: string) => s.linhas.find((l) => l.uf === uf && l.municipio === municipio && l.combustivel === c);
    assert.deepEqual(achar("RN", "NATAL", "gasolina"), { uf: "RN", municipio: "NATAL", combustivel: "gasolina", preco: 6.493, postos: 52 });
    assert.equal(achar("RN", "NATAL", "etanol")?.preco, 5.19);
    assert.equal(achar("RN", "NATAL", "diesel")?.preco, 6.89);
    assert.equal(achar("SP", "SANTA BARBARA D OESTE", "gasolina")?.preco, 5.99, "apóstrofo vira espaço na chave");
    assert.equal(achar("RN", "", "gasolina")?.preco, 6.55, "média do estado");
    assert.equal(achar("BR", "", "gasolina")?.preco, 6.49, "média do Brasil");
    assert.equal(achar("BR", "", "diesel")?.preco, 7.32, "diesel S10, não o S500; repetido vale o primeiro");
    // Fora: aditivada, estado desconhecido, preço zero, semana diferente, CAPITAIS (não lida).
    assert.equal(s.linhas.filter((l) => l.uf === "RN" && l.municipio === "NATAL").length, 3);
    assert.ok(!s.linhas.some((l) => l.municipio === "X" || l.municipio === "PRECO ERRADO" || l.municipio === "SEMANA VELHA"));
    assert.ok(!s.linhas.some((l) => l.preco === 1));
    assert.equal(s.linhas.length, 3 + 1 + 1 + 1 + 3 + 1 + 3);
  });

  test("planilha sem as abas ou sem cabeçalho = null (nada inventado)", () => {
    const x = xlsx();
    assert.equal(semanaDaPlanilha({ ...x, "xl/workbook.xml": "<workbook><sheets/></workbook>" }), null);
    assert.equal(semanaDaPlanilha({}), null);
  });

  test("o link da semana mais nova: nomes bagunçados, só do mesmo site", () => {
    const base = "https://www.gov.br/anp/precos";
    const html = paginaAnp(base, [46306, 46313, 46299]);
    assert.equal(linkDaPlanilhaSemanal(html, `${base}/pagina`), `${base}/arquivos-lpc/resumo_semanal_lpc_2026_10_18-2026_10_24.xlsx`);
    // A página de verdade usa links absolutos do gov.br; relativos também servem.
    assert.equal(
      linkDaPlanilhaSemanal('<a href="/anp/x/resumo-semanal-lpc-16-10-2022-22-10-2022.xlsx">a</a>', "https://www.gov.br/anp/pagina"),
      "https://www.gov.br/anp/x/resumo-semanal-lpc-16-10-2022-22-10-2022.xlsx",
    );
    // Sem data no nome: a primeira da página.
    assert.equal(
      linkDaPlanilhaSemanal('<a href="/a/resumo_semanal_lpc_2711.xlsx"></a><a href="/a/resumo_semanal_lpc_0311.xlsx"></a>', "https://www.gov.br/x"),
      "https://www.gov.br/a/resumo_semanal_lpc_2711.xlsx",
    );
    assert.equal(linkDaPlanilhaSemanal('<a href="https://outro.example/resumo_semanal_lpc_2026-10-18_2026-10-24.xlsx">x</a>', "https://www.gov.br/x"), null);
    assert.equal(linkDaPlanilhaSemanal("<p>nada</p>", "https://www.gov.br/x"), null);
  });

  test("chave do município e o rótulo da fonte", () => {
    assert.equal(chaveDoMunicipio("  Santa Bárbara d'Oeste "), "SANTA BARBARA D OESTE");
    assert.equal(chaveDoMunicipio("São Luís"), "SAO LUIS");
    const etanol = linhaDeDeslocamento({ kmIda: 70, idaEVolta: true, viagens: 1, kmPorLitro: 7, litroCents: 519, combustivel: "etanol" }, "Natal", "Touros");
    assert.equal(etanol.detalhe, "140 km · ida e volta · 20 L de etanol a R$ 5,19/L");
    assert.equal(etanol.precoCents, 10_380);
    assert.match(
      linhaDeDeslocamento({ kmIda: 10, idaEVolta: false, viagens: 1, kmPorLitro: 10, litroCents: 700, combustivel: "diesel" }, null, null).detalhe,
      /L de diesel S10 a/,
    );
    assert.equal(rotuloDoPreco({ base: "municipio", onde: "Natal/RN", semana: "2026-10-18" }), "Preço médio da semana em Natal/RN · ANP, semana de 18/10");
    assert.equal(rotuloDoPreco({ base: "estado", onde: "RN", semana: "2026-10-18" }), "Preço médio da semana no estado (RN) · ANP, semana de 18/10");
    assert.equal(rotuloDoPreco({ base: "brasil", onde: "Brasil", semana: "2026-10-18" }), "Preço médio da semana no Brasil · ANP, semana de 18/10");
  });
});

describe("lugar entendido sozinho (o que foi digitado vira cidade/UF)", () => {
  const busca = (q: string) => lugaresDoPhoton(photonFalso(q));

  test("Photon: município, UF e tipo de cada lugar", () => {
    const sp = busca("São Paulo");
    const cidade = sp.find((l) => l.tipo === "cidade");
    assert.deepEqual([cidade?.rotulo, cidade?.cidade, cidade?.uf], ["São Paulo", "São Paulo", "SP"]);
    const estado = sp.find((l) => l.tipo === "estado");
    assert.deepEqual([estado?.rotulo, estado?.cidade, estado?.uf, estado?.detalhe], ["São Paulo", undefined, "SP", ""]);
    const bairro = sp.find((l) => l.tipo === "lugar");
    assert.deepEqual([bairro?.cidade, bairro?.uf], ["Capanema", "PA"]);
    const estacao = busca("Natal").find((l) => l.detalhe.includes("Praça"));
    assert.deepEqual([estacao?.tipo, estacao?.cidade, estacao?.uf], ["lugar", "Natal", "RN"]);
  });

  test("o nome e a UF do texto", () => {
    assert.deepEqual(lerTextoDeLugar("Natal, RN"), { nome: "Natal", uf: "RN" });
    assert.deepEqual(lerTextoDeLugar("natal/rn"), { nome: "natal", uf: "RN" });
    assert.deepEqual(lerTextoDeLugar("Natal - Rio Grande do Norte"), { nome: "Natal", uf: "RN" });
    assert.deepEqual(lerTextoDeLugar("  São   Paulo SP "), { nome: "São Paulo", uf: "SP" });
    assert.deepEqual(lerTextoDeLugar("São Paulo"), { nome: "São Paulo", uf: null });
    assert.deepEqual(lerTextoDeLugar("Rio de Janeiro"), { nome: "Rio de Janeiro", uf: null });
    assert.deepEqual(lerTextoDeLugar("Av. Paulista, 1000, São Paulo"), { nome: "Av. Paulista, 1000", uf: "SP" });
  });

  test("a cidade com o mesmo nome ganha do estado, do bairro e da rua; acento e caixa não importam", () => {
    for (const q of ["São Paulo", "sao paulo", "SAO PAULO", "São Paulo, SP"]) {
      const l = melhorLugar(busca(q), q);
      assert.deepEqual([l?.tipo, l?.uf, nomeDoLugar(l!)], ["cidade", "SP", "São Paulo/SP"], q);
    }
    const natal = melhorLugar(busca("natal"), "natal");
    assert.deepEqual([natal?.tipo, nomeDoLugar(natal!)], ["cidade", "Natal/RN"]);
    // Com a UF de outro lugar com o mesmo nome, vale a UF dita.
    const natalPi = melhorLugar(busca("Natal, PI"), "Natal, PI");
    assert.deepEqual([natalPi?.uf, nomeDoLugar(natalPi!)], ["PI", "Natal · Sigefredo Pacheco/PI"]);
    // Nada com o mesmo nome: o primeiro da lista (o mais relevante); lista vazia, nada.
    assert.equal(melhorLugar(busca("Camp"), "Camp")?.rotulo, "Campinas");
    assert.equal(melhorLugar([], "Natal"), null);
  });

  test("a capital ganha quando duas cidades têm o mesmo nome", () => {
    const ponto = { detalhe: "", lat: 0, lon: 0, tipo: "cidade" as const };
    const lugares = [
      { ...ponto, rotulo: "Natal", cidade: "Natal", uf: "PI" },
      { ...ponto, rotulo: "Natal", cidade: "Natal", uf: "RN" },
    ];
    assert.equal(melhorLugar(lugares, "Natal")?.uf, "RN");
    assert.equal(melhorLugar(lugares, "Natal PI")?.uf, "PI");
  });

  test("rota: São Paulo → Natal pela estrada e o tempo de carro", () => {
    const de = melhorLugar(busca("São Paulo"), "São Paulo")!;
    const para = melhorLugar(busca("Natal"), "Natal")!;
    const r = rotaDoOsrm(osrmFalso(`${de.lon},${de.lat};${para.lon},${para.lat}`));
    assert.deepEqual(r, { km: 2923.1, minutos: 2445 });
    assert.equal(tempoDeCarro(r!.minutos), "≈ 40h45 de carro");
    assert.equal(tempoDeCarro(45), "≈ 45 min de carro");
  });
});

describe("preço pelo lugar: município, senão estado, senão Brasil", () => {
  const fonte = "https://www.gov.br/anp/resumo_semanal_lpc_2026_10_18-2026_10_24.xlsx";
  const l = (semana: string, uf: string, municipio: string, preco: number): PrecoGuardado => ({
    semana,
    semanaFim: semana === "2026-10-18" ? "2026-10-24" : "2026-10-17",
    uf,
    municipio,
    preco,
    postos: 10,
    fonte,
  });
  const linhas = [
    l("2026-10-18", "SP", "SAO PAULO", 6.11),
    l("2026-10-18", "SP", "", 6.2),
    l("2026-10-18", "RN", "NATAL", 6.493),
    l("2026-10-18", "RN", "", 6.55),
    l("2026-10-18", "BR", "", 6.49),
    l("2026-10-11", "MG", "BELO HORIZONTE", 5.0),
    l("2026-10-11", "BR", "", 5.5),
  ];
  const escolher = (cidade: string | null, uf: string | null) => escolherPreco(linhas, { cidade, uf }, "gasolina");

  test("cidade da saída com a linha dela: o município, com o nome como foi digitado", () => {
    const p = escolher("São Paulo", "SP");
    assert.deepEqual(
      [p?.base, p?.onde, p?.litroCents, rotuloDoPreco(p!)],
      ["municipio", "São Paulo/SP", 611, "Preço médio da semana em São Paulo/SP · ANP, semana de 18/10"],
    );
    assert.deepEqual([escolher("natal", "RN")?.onde, escolher("NATAL", null)?.onde], ["Natal/RN", "Natal/RN"]);
    assert.deepEqual([escolher("sao paulo", null)?.base, escolher("sao paulo", null)?.onde], ["municipio", "Sao Paulo/SP"]);
    assert.equal(escolher("Natal, RN", null)?.litroCents, 649);
  });

  test("cidade sem linha própria: a média do estado; sem estado, a do Brasil", () => {
    const campinas = escolher("Campinas", "SP");
    assert.deepEqual([campinas?.base, campinas?.onde, campinas?.litroCents], ["estado", "SP", 620]);
    assert.equal(escolher("Mossoró, RN", null)?.base, "estado");
    const mg = escolher("Belo Horizonte", "MG");
    assert.deepEqual([mg?.base, mg?.onde, mg?.litroCents, mg?.semana], ["brasil", "Brasil", 649, "2026-10-18"], "semana velha não vale");
    assert.equal(escolher(null, null)?.base, "brasil");
    assert.equal(escolher("Cidade Que Não Existe", null)?.base, "brasil");
    // Mesmo nome em outro estado não vale.
    assert.equal(escolher("Natal", "SP")?.base, "estado");
    assert.equal(escolherPreco([], { cidade: "Natal", uf: "RN" }, "gasolina"), null);
  });

  test("sem UF e o nome em dois estados: a capital; senão o Brasil", () => {
    const dois = [...linhas, l("2026-10-18", "PI", "NATAL", 7.0), l("2026-10-18", "MG", "SAO JOSE", 6.0), l("2026-10-18", "SC", "SAO JOSE", 6.3)];
    assert.equal(escolherPreco(dois, { cidade: "Natal", uf: null }, "gasolina")?.onde, "Natal/RN");
    assert.equal(escolherPreco(dois, { cidade: "São José", uf: null }, "gasolina")?.base, "brasil");
    assert.equal(escolherPreco(dois, { cidade: "São José", uf: "SC" }, "gasolina")?.litroCents, 630);
  });

  test("nome com cara de nome", () => {
    assert.equal(nomeBonito("sao paulo"), "Sao Paulo");
    assert.equal(nomeBonito("RIO DE JANEIRO"), "Rio de Janeiro");
    assert.equal(nomeBonito("São Paulo"), "São Paulo");
  });
});

describe("veículos de partida", () => {
  test("tipos comuns, consumo de estrada plausível por combustível, etanol rende menos", () => {
    assert.ok(VEICULOS_PADRAO.length >= 6);
    assert.equal(new Set(VEICULOS_PADRAO.map((v) => v.id)).size, VEICULOS_PADRAO.length);
    for (const v of VEICULOS_PADRAO) {
      const cs = combustiveisDo(v);
      assert.ok(cs.length >= 1, v.id);
      for (const c of cs) assert.ok(v.kmL[c]! >= 4 && v.kmL[c]! <= 20, `${v.id} ${c}`);
      if (v.kmL.gasolina && v.kmL.etanol) {
        const r = v.kmL.etanol / v.kmL.gasolina;
        assert.ok(r > 0.6 && r < 0.8, `${v.id}: etanol ≈ 70% da gasolina`);
      }
    }
    assert.ok(["compacto", "seda", "suv", "picape", "van", "micro"].every((id) => veiculoPadrao(id)));
    assert.equal(veiculoPadrao("nao-existe"), null);
  });

  test("escolher o tipo mantém o combustível se ele usa; senão troca para o dele", () => {
    const compacto = veiculoPadrao("compacto")!;
    assert.deepEqual(aplicarVeiculo(compacto, "etanol"), { combustivel: "etanol", kmL: 10 });
    assert.deepEqual(aplicarVeiculo(compacto, "diesel"), { combustivel: "gasolina", kmL: 14 });
    assert.deepEqual(aplicarVeiculo(veiculoPadrao("van")!, "gasolina"), { combustivel: "diesel", kmL: 9 });
    assert.deepEqual(aplicarVeiculo(veiculoPadrao("suv-medio")!, "diesel"), { combustivel: "diesel", kmL: 11 });
    assert.equal(consumoDo(veiculoPadrao("van")!, "etanol"), null);
  });
});
