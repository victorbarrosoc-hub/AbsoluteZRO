// Calculadora de deslocamento (porte do ZRO, generalizada): contas, a linha do orçamento, a leitura do Photon e do
// OSRM e a planilha semanal da ANP (municípios, estados e Brasil; gasolina, etanol e diesel S10) num .xlsx de mentira
// no desenho da de verdade (tests/anp-fixture.mts). Nada de rede aqui; o banco e o agendamento ficam em
// combustivel.test.mts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calcularDeslocamento,
  chaveDoMunicipio,
  dataDoExcel,
  linhaDeDeslocamento,
  linkDaPlanilhaSemanal,
  lugaresDoPhoton,
  rotaDoOsrm,
  rotuloDoPreco,
  semanaDaPlanilha,
} from "../src/lib/orcamento/deslocamento";
import { lerZip } from "../src/lib/orcamento/zip";
import { paginaAnp, planilhaAnp } from "./anp-fixture.mts";

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
