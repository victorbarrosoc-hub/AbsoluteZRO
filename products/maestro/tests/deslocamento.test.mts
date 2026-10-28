// Calculadora de deslocamento (porte do ZRO, generalizada): contas, a linha do orçamento, a leitura do Photon e do
// OSRM e a planilha semanal da ANP (capital da UF ou média do estado) num .xlsx de exemplo montado aqui. Nada de rede:
// os serviços abertos ficam desligados sem MAESTRO_SERVICOS_ABERTOS=1.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { crc32, deflateRawSync } from "node:zlib";
import { calcularDeslocamento, dataDoExcel, linhaDeDeslocamento, lugaresDoPhoton, precoNaPlanilha, rotaDoOsrm } from "../src/lib/orcamento/deslocamento";
import { lerZip } from "../src/lib/orcamento/zip";

/** Zip mínimo (deflate) para o teste: o mesmo formato que a ANP publica. */
function zip(arquivos: Record<string, string>): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let pos = 0;
  for (const [nome, texto] of Object.entries(arquivos)) {
    const dados = Buffer.from(texto, "utf8");
    const comp = deflateRawSync(dados);
    const n = Buffer.from(nome, "utf8");
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0);
    l.writeUInt16LE(20, 4);
    l.writeUInt16LE(8, 8);
    l.writeUInt32LE(crc32(dados), 14);
    l.writeUInt32LE(comp.length, 18);
    l.writeUInt32LE(dados.length, 22);
    l.writeUInt16LE(n.length, 26);
    locais.push(l, n, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc32(dados), 16);
    c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(dados.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(pos, 42);
    centrais.push(c, n);
    pos += 30 + n.length + comp.length;
  }
  const dir = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(Object.keys(arquivos).length, 8);
  fim.writeUInt16LE(Object.keys(arquivos).length, 10);
  fim.writeUInt32LE(dir.length, 12);
  fim.writeUInt32LE(pos, 16);
  return Buffer.concat([...locais, dir, fim]);
}

const linha = (r: number, celulas: [string, string | number, boolean?][]) =>
  `<row r="${r}">${celulas.map(([c, v, s]) => (s ? `<c r="${c}${r}" t="s"><v>${v}</v></c>` : `<c r="${c}${r}"><v>${v}</v></c>`)).join("")}</row>`;

/** Planilha de exemplo: aba CAPITAIS (desenho fixo, sem cabeçalho) e ESTADOS (com cabeçalho). Valores inventados. */
function planilha() {
  const textos = [
    "RIO GRANDE DO NORTE",
    "NATAL",
    "GASOLINA COMUM",
    "ETANOL HIDRATADO",
    "SÃO PAULO",
    "DATA INICIAL",
    "DATA FINAL",
    "REGIÃO",
    "ESTADO",
    "PRODUTO",
    "NÚMERO DE POSTOS PESQUISADOS",
    "PREÇO MÉDIO REVENDA",
    "SUDESTE",
    "NORDESTE",
  ];
  const s = (t: string) => textos.indexOf(t);
  const capitais = [
    linha(10, [
      ["A", 46310],
      ["B", 46316],
      ["C", s("RIO GRANDE DO NORTE"), true],
      ["D", s("NATAL"), true],
      ["E", s("ETANOL HIDRATADO"), true],
      ["F", 40],
      ["H", 4.59],
    ]),
    linha(11, [
      ["A", 46310],
      ["B", 46316],
      ["C", s("RIO GRANDE DO NORTE"), true],
      ["D", s("NATAL"), true],
      ["E", s("GASOLINA COMUM"), true],
      ["F", 52],
      ["H", 6.493],
    ]),
  ].join("");
  const estados = [
    linha(9, [
      ["A", s("DATA INICIAL"), true],
      ["B", s("DATA FINAL"), true],
      ["C", s("REGIÃO"), true],
      ["D", s("ESTADO"), true],
      ["E", s("PRODUTO"), true],
      ["F", s("NÚMERO DE POSTOS PESQUISADOS"), true],
      ["G", s("PREÇO MÉDIO REVENDA"), true],
    ]),
    linha(10, [
      ["A", 46310],
      ["B", 46316],
      ["C", s("SUDESTE"), true],
      ["D", s("SÃO PAULO"), true],
      ["E", s("GASOLINA COMUM"), true],
      ["F", 1200],
      ["G", 6.11],
    ]),
    linha(11, [
      ["A", 46310],
      ["B", 46316],
      ["C", s("NORDESTE"), true],
      ["D", s("RIO GRANDE DO NORTE"), true],
      ["E", s("GASOLINA COMUM"), true],
      ["F", 300],
      ["G", 6.55],
    ]),
  ].join("");
  return zip({
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": `<workbook><sheets><sheet name="CAPITAIS" sheetId="1" r:id="rId1"/><sheet name="ESTADOS" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst>${textos.map((t) => `<si><t>${t}</t></si>`).join("")}</sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData>${capitais}</sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet><sheetData>${estados}</sheetData></worksheet>`,
  });
}

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

  test("ANP: o .xlsx abre pelo zip do Node; capital da UF e média do estado", () => {
    assert.equal(dataDoExcel("46310"), "2026-10-15");
    const xlsx = lerZip(planilha(), (n) => n.startsWith("xl/"));
    assert.equal(Object.keys(xlsx).length, 5);
    const natal = precoNaPlanilha(xlsx, "RN", "Natal", new Date("2026-10-28T12:00:00Z"));
    assert.deepEqual(natal, {
      litroCents: 649,
      inicio: "2026-10-15",
      fim: "2026-10-21",
      postos: 52,
      base: "capital",
      onde: "Natal, RN",
      buscadoEm: "2026-10-28T12:00:00.000Z",
    });
    const mossoro = precoNaPlanilha(xlsx, "RN", "Mossoró");
    assert.equal(mossoro?.base, "estado");
    assert.equal(mossoro?.litroCents, 655);
    assert.equal(mossoro?.onde, "Rio Grande do Norte");
    // Capital sem linha na aba de capitais: cai na média do estado (com cabeçalho, coluna G).
    const sp = precoNaPlanilha(xlsx, "SP", "São Paulo");
    assert.deepEqual([sp?.base, sp?.litroCents, sp?.postos], ["estado", 611, 1200]);
    assert.equal(precoNaPlanilha(xlsx, "AM", null), null, "UF fora da planilha");
    assert.equal(precoNaPlanilha(xlsx, "XX", null), null);
  });

  test("zip estragado não abre", () => {
    assert.throws(() => lerZip(Buffer.from("não é zip"), () => true));
  });
});
