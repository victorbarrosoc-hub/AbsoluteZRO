// Criação · Saídas do Roteiro (F3), tudo puro: o arquivo `maestro.roteiro/1` gerado do modelo e conferido contra o
// schema PUBLICADO (docs/integration-contracts/schemas, o mesmo que a raiz confere contra o zod) e contra o exemplo
// commitado; o texto e o `.txt` do TPeasy; o backup do TPeasy indo e voltando pelo código do próprio TPeasy; o PDF para
// a edição; e a opção do AEON escondida enquanto o gate do HUB não abre o produto.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, test } from "node:test";
import { lerRoteiro, type Roteiro } from "../src/lib/criacao/roteiro/modelo";
import {
  arquivoParaEdicao,
  dataDaVersao,
  ehSaida,
  mesmoConteudo,
  nomeDeArquivo,
  paraRoteiroMaestro,
  saidaTpeasy,
  textoFalado,
  type VersaoDeOrigem,
} from "../src/lib/criacao/roteiro/saidas";
import { linhaDoTempo } from "../src/lib/criacao/roteiro/tempo";
import { dadosImpressao, vistaEdicao, vistaTeleprompter } from "../src/lib/criacao/roteiro/vistas";
import { podeMandarParaAeon } from "../src/lib/criacao/permissoes";
import { conferirEsquema, esquemaPublicado } from "./esquema-json.mts";

const ZWSP = "​";
const EXEMPLO = new URL("../../../docs/integration-contracts/exemplos/maestro.roteiro.v1.json", import.meta.url);
const TPEASY = readFileSync(new URL("../../tpeasy/app/js/data.js", import.meta.url), "utf8");
const TPEASY_TELAS = readFileSync(new URL("../../tpeasy/app/js/views.js", import.meta.url), "utf8");

/** Roteiro fictício: três cenas com todos os tipos de bloco, uma nota, uma observação e um bloco vazio do modelo. */
function exemplo(): Roteiro {
  const r = lerRoteiro({
    v: 1,
    formato: "16:9",
    alvo: { min: 15, max: 30 },
    wpm: 150,
    pessoas: [
      { id: "ana", nome: "Ana", papel: "locutor" },
      { id: "joao", nome: "João", papel: "entrevistado" },
    ],
    cenas: [
      {
        id: "c1",
        titulo: "Abertura",
        intExt: "EXT",
        local: "Fazenda",
        periodo: "amanhecer",
        blocos: [
          { id: "p1", tipo: "plano", tamanho: "GPG", movimento: "drone subindo", duracao: 4 },
          { id: "a1", tipo: "acao", texto: "O sol nasce sobre o cafezal." },
          { id: "s1", tipo: "audio", audio: "trilha", texto: "Violão leve", entra: "fade" },
          { id: "f1", tipo: "fala", quem: "ana", modo: "off", texto: "Todo café começa **muito antes** da xícara. [pausa]", obs: "calma" },
          { id: "n1", tipo: "nota", texto: "Pedir autorização do drone" },
          { id: "v1", tipo: "lettering", estilo: "titulo", texto: "", dica: "Título do filme" },
        ],
      },
      {
        id: "c2",
        titulo: "O processo",
        intExt: "INT",
        local: "Torrefação",
        periodo: "dia",
        blocos: [
          { id: "p2", tipo: "plano", tamanho: "PM", lente: "35mm" },
          { id: "f2", tipo: "fala", quem: "joao", modo: "sonora", texto: "A gente torra em lotes pequenos.\n\nCada lote tem um nome." },
          { id: "l1", tipo: "lettering", estilo: "gc", texto: "João Lima, mestre de torra" },
          { id: "o1", tipo: "observacao", texto: "Gravar com a torradeira ligada" },
          { id: "f3", tipo: "fala", quem: "ana", modo: "off", texto: "#1 em sabor na região." },
        ],
      },
      {
        id: "c3",
        titulo: "Assinatura",
        duracaoSeg: 6,
        blocos: [
          { id: "a2", tipo: "acao", texto: "Packshot da embalagem" },
          { id: "l2", tipo: "lettering", estilo: "cta", texto: "exemplo.com.br" },
          { id: "f4", tipo: "fala", quem: "ana", modo: "off", texto: "Café Aurora. Do pé à xícara." },
        ],
      },
    ],
  });
  assert.ok(r);
  return r;
}

const versao = (n = 3, conteudo = exemplo(), criadoEm = "2026-10-29 14:00:00.5+00"): VersaoDeOrigem => ({
  roteiroId: "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f",
  titulo: "Café  Aurora",
  n,
  sha256: "a".repeat(64),
  criadoEm,
  conteudo,
});
const AGORA = new Date("2026-10-29T15:00:00.000Z");

describe("maestro.roteiro/1 (para a edição)", () => {
  test("sai do modelo: cenas com tempo, blocos da edição, ids estáveis; nota, observação e vazio fora", () => {
    const j = paraRoteiroMaestro(versao(), AGORA);
    assert.equal(j.contract, "maestro.roteiro/1");
    assert.deepEqual(j.origem, {
      app: "maestro",
      roteiro_id: "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f",
      titulo: "Café Aurora",
      versao: 3,
      sha256: "a".repeat(64),
      salva_em: "2026-10-29T14:00:00.500Z",
    });
    assert.equal(j.gerado_em, "2026-10-29T15:00:00.000Z");
    assert.equal(j.tempos, "estimados");
    const t = linhaDoTempo(exemplo());
    assert.equal(j.duracao_seg, t.totalSeg);
    assert.deepEqual(
      j.cenas.map((c) => [c.numero, c.cabecalho, c.inicio_seg, c.fim_seg, c.duracao_digitada_seg]),
      t.cenas.map((c) => [
        c.numero,
        j.cenas[c.numero - 1].cabecalho,
        c.inicioSeg,
        Math.round((c.inicioSeg + c.duracaoSeg) * 10) / 10,
        c.definida ? c.duracaoSeg : null,
      ]),
    );
    assert.equal(j.cenas[0].cabecalho, "1. EXT. FAZENDA – AMANHECER");
    const ids = j.cenas.flatMap((c) => c.blocos.map((b) => b.id));
    assert.deepEqual(ids, ["p1", "a1", "s1", "f1", "p2", "f2", "l1", "f3", "a2", "l2", "f4"]);
    for (const fora of ["n1", "o1", "v1"]) assert.ok(!ids.includes(fora), fora);
    // os tempos de cada bloco são os mesmos da vista Edição
    const ed = new Map(vistaEdicao(exemplo()).deixas.map((d) => [d.blocoId, [d.inicioSeg, d.fimSeg]]));
    for (const c of j.cenas) for (const b of c.blocos) assert.deepEqual([b.inicio_seg, b.fim_seg], ed.get(b.id), b.id);
    const f1 = j.cenas[0].blocos.find((b) => b.id === "f1")!;
    assert.deepEqual(f1, {
      id: "f1",
      inicio_seg: 0,
      fim_seg: 2.8,
      duracao_digitada_seg: null,
      tipo: "fala",
      pessoa_id: "ana",
      pessoa: "Ana",
      modo: "off",
      texto: "Todo café começa **muito antes** da xícara. [pausa]",
      texto_falado: "Todo café começa muito antes da xícara.",
      palavras: 7,
      obs: "calma",
    });
    const p1 = j.cenas[0].blocos[0];
    assert.deepEqual(p1, {
      id: "p1",
      inicio_seg: 0,
      fim_seg: 4,
      duracao_digitada_seg: 4,
      tipo: "plano",
      tamanho: "GPG",
      sigla: "GPG",
      angulo: null,
      movimento: "drone subindo",
      lente: null,
      fps: null,
      texto: null,
    });
    // nada de nota interna, observação ou dica no arquivo
    const texto = JSON.stringify(j);
    for (const fora of ["autorização", "torradeira", "Título do filme"]) assert.ok(!texto.includes(fora), fora);
  });

  test("confere com o schema publicado (docs/integration-contracts/schemas/maestro.roteiro.v1.schema.json)", () => {
    const esquema = esquemaPublicado("maestro.roteiro.v1");
    assert.deepEqual(conferirEsquema(esquema, paraRoteiroMaestro(versao(), AGORA)), []);
    // roteiro vazio e roteiro de um modelo também conferem
    const vazio = lerRoteiro({ cenas: [{ id: "c", titulo: "", blocos: [] }] })!;
    assert.deepEqual(conferirEsquema(esquema, paraRoteiroMaestro(versao(1, vazio), AGORA)), []);
    // o conferidor não é de enfeite: campo a mais, contrato errado e tipo fora da lista falham
    const j = JSON.parse(JSON.stringify(paraRoteiroMaestro(versao(), AGORA)));
    assert.ok(conferirEsquema(esquema, { ...j, email: "x@exemplo.com" }).length);
    assert.ok(conferirEsquema(esquema, { ...j, contract: "maestro.roteiro/2" }).length);
    j.cenas[0].blocos[0].tipo = "nota";
    assert.ok(conferirEsquema(esquema, j).length);
    assert.ok(
      conferirEsquema(esquema, { ...paraRoteiroMaestro(versao(), AGORA), origem: { ...paraRoteiroMaestro(versao(), AGORA).origem, sha256: "x" } }).length,
    );
  });

  test("é igual ao exemplo commitado (docs/integration-contracts/exemplos; ATUALIZAR_EXEMPLOS=1 regrava)", () => {
    const texto = JSON.stringify(paraRoteiroMaestro(versao(), AGORA), null, 2) + "\n";
    if (process.env.ATUALIZAR_EXEMPLOS === "1") writeFileSync(EXEMPLO, texto);
    assert.equal(readFileSync(EXEMPLO, "utf8"), texto);
  });

  test("texto falado sem a marcação; nome do arquivo com a versão", () => {
    assert.equal(textoFalado("**Oi**, [Ana] tudo ((sorrindo)) bem?\n\n  Sim.  "), "Oi, tudo bem?\n\nSim.");
    assert.equal(arquivoParaEdicao({ titulo: 'Café / Aurora: 30"', n: 4 }), "Café Aurora 30 · v4.maestro.json");
  });
});

describe("TPeasy", () => {
  test("o texto pronto é a vista Teleprompter da VERSÃO; por pessoa; o .txt leva o título", () => {
    const todas = saidaTpeasy(versao(), null, AGORA);
    assert.equal(todas.texto, vistaTeleprompter(exemplo()).texto);
    assert.equal(todas.titulo, "Café Aurora");
    assert.equal(todas.arquivoTxt, "Café Aurora.txt");
    assert.equal(todas.arquivoBackup, "Café Aurora · v3 · TPeasy.json");
    const ana = saidaTpeasy(versao(), "ana", AGORA);
    assert.equal(
      ana.texto,
      [
        "# Cena 1 · Abertura",
        "((calma)) Todo café começa **muito antes** da xícara. [pausa]",
        "# Cena 2 · O processo",
        `${ZWSP}#1 em sabor na região.`,
        "# Cena 3 · Assinatura",
        "Café Aurora. Do pé à xícara.",
      ].join("\n\n"),
    );
    assert.equal(ana.titulo, "Café Aurora · Ana");
    assert.equal(ana.arquivoTxt, "Café Aurora · Ana.txt");
    assert.equal(ana.palavras, 18);
    // pessoa que não está no roteiro vira "Todas" (nunca um texto vazio por engano)
    assert.equal(saidaTpeasy(versao(), "ninguem", AGORA).texto, todas.texto);
    for (const fora of ["Violão", "João Lima", "drone", "torradeira", "Packshot", "autorização", "exemplo.com.br"])
      assert.ok(!todas.texto.includes(fora), fora);
  });

  test("o .txt entra pelo 'Importar arquivo' do TPeasy: o nome vira o título e o texto chega inteiro", () => {
    // products/tpeasy/app/js/views.js: createScript(f.name.replace(/\.[^.]+$/, ""), text) com o texto aparado
    assert.ok(TPEASY_TELAS.includes('D.createScript(f.name.replace(/\\.[^.]+$/, ""), text)'), "o TPeasy ainda importa assim");
    assert.ok(TPEASY_TELAS.includes('accept=".txt') || readFileSync(new URL("../../tpeasy/app/index.html", import.meta.url), "utf8").includes('accept=".txt'));
    const s = saidaTpeasy(versao(), "ana", AGORA);
    assert.equal(s.arquivoTxt.replace(/\.[^.]+$/, ""), "Café Aurora · Ana");
    assert.equal(s.texto.replace(/\r\n?/g, "\n").trim(), s.texto, "nada se perde no trim do TPeasy");
  });

  test("backup: confere com o schema do TPeasy e vai e volta pelo importAll do próprio TPeasy, atualizando pelo id", () => {
    const esquema = esquemaPublicado("tpeasy.backup.v1");
    const v3 = saidaTpeasy(versao(3), "ana", AGORA).backup;
    assert.deepEqual(conferirEsquema(esquema, JSON.parse(JSON.stringify(v3))), []);
    assert.equal(v3.scripts[0].id, "maestro-6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f-ana");
    assert.equal(v3.scripts[0].updated, Date.parse("2026-10-29T14:00:00.500Z"), "a hora da versão, não a de agora");
    assert.equal(v3.scripts[0].target, 30, "o máximo do alvo vira a meta");
    assert.equal(v3.scripts[0].title, "Café Aurora · Ana");

    const trecho = TPEASY.slice(TPEASY.indexOf("export function importAll"), TPEASY.indexOf("\n}\n", TPEASY.indexOf("export function importAll")) + 2);
    const scripts: { id: string; body: string; updated: number; title: string }[] = [];
    const importAll = new Function("scripts", "saveScripts", "replacePrefs", "sessions", "store", "KEY", `${trecho.replace("export ", "")}; return importAll;`)(
      scripts,
      () => {},
      () => {},
      [],
      { set() {} },
      {},
    ) as (d: unknown) => number;
    // o arquivo baixado é JSON: vai como texto e volta pelo JSON.parse, como no "Restaurar backup"
    assert.equal(importAll(JSON.parse(JSON.stringify(v3))), 1);
    assert.equal(scripts[0].body, saidaTpeasy(versao(3), "ana", AGORA).texto);
    // a mesma versão de novo não muda nada; a v4 (mais nova) atualiza o MESMO roteiro, sem duplicar
    assert.equal(importAll(JSON.parse(JSON.stringify(v3))), 0);
    const mudado = exemplo();
    mudado.cenas[2].blocos[2] = { ...mudado.cenas[2].blocos[2], texto: "Café Aurora. Desde 1998." } as Roteiro["cenas"][number]["blocos"][number];
    const v4 = saidaTpeasy(versao(4, mudado, "2026-10-30 09:00:00+00"), "ana", AGORA).backup;
    assert.equal(importAll(JSON.parse(JSON.stringify(v4))), 0);
    assert.equal(scripts.length, 1);
    assert.ok(scripts[0].body.endsWith("Café Aurora. Desde 1998."));
    // mandar a v3 de novo depois da v4 não volta o texto velho
    assert.equal(importAll(JSON.parse(JSON.stringify(v3))), 0);
    assert.ok(scripts[0].body.endsWith("Café Aurora. Desde 1998."));
    // outra pessoa (ou "Todas") é outro roteiro no TPeasy
    assert.equal(importAll(JSON.parse(JSON.stringify(saidaTpeasy(versao(4, mudado), "joao", AGORA).backup))), 1);
    assert.equal(importAll(JSON.parse(JSON.stringify(saidaTpeasy(versao(4, mudado), null, AGORA).backup))), 1);
    assert.deepEqual(
      scripts.map((s) => s.id.replace("maestro-6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f-", "")),
      ["ana", "joao", "todas"],
    );
  });
});

describe("peças das saídas", () => {
  test("nome de arquivo seguro, data da versão, conteúdo igual sem ligar para a ordem das chaves", () => {
    assert.equal(nomeDeArquivo('  a/b\\c:d*e?f"g<h>i|j\u0007  ', "txt"), "a b c d e f g h i j.txt");
    assert.equal(nomeDeArquivo("...", "txt"), "Roteiro.txt");
    assert.equal(nomeDeArquivo("x".repeat(300), "json").length, 125);
    assert.equal(dataDaVersao("2026-10-29 14:00:00.123+00").toISOString(), "2026-10-29T14:00:00.123Z");
    assert.equal(dataDaVersao("2026-10-29T14:00:00Z").toISOString(), "2026-10-29T14:00:00.000Z");
    assert.ok(mesmoConteudo({ a: 1, b: { c: [1, { d: 2, e: undefined }] } }, { b: { c: [1, { d: 2 }] }, a: 1 }));
    assert.ok(!mesmoConteudo({ a: [1, 2] }, { a: [2, 1] }));
    assert.ok(mesmoConteudo(exemplo(), lerRoteiro(JSON.parse(JSON.stringify(exemplo())))));
  });

  test("destinos e formatos conhecidos (a rota recusa o resto)", () => {
    assert.ok(ehSaida("tpeasy", "backup"));
    assert.ok(ehSaida("edicao", "pdf"));
    assert.ok(ehSaida("pdf", "teleprompter"));
    assert.ok(ehSaida("aeon", "json"));
    for (const [d, f] of [
      ["tpeasy", "json"],
      ["aeon", "pdf"],
      ["email", "pdf"],
      ["toString", "x"],
      [null, null],
    ])
      assert.ok(!ehSaida(d, f), `${d}/${f}`);
  });

  test("PDF para a edição: cenas com o tempo e as deixas da vista Edição", () => {
    const d = dadosImpressao(exemplo(), { titulo: "Café", vista: "edicao", versao: 3 });
    assert.equal(d.vista, "edicao");
    if (d.vista !== "edicao") return;
    assert.equal(d.versao, "v3");
    assert.deepEqual(
      d.cenasEdicao.map((c) => c.cabecalho),
      ["1. EXT. FAZENDA – AMANHECER", "2. INT. TORREFAÇÃO – DIA", "3. ASSINATURA"],
    );
    assert.deepEqual(d.edicao, vistaEdicao(exemplo()));
  });
});

describe("AEON só com o gate aberto", () => {
  const base = { papel: "admin" as const, produtos: ["maestro", "ai-edit"] };
  test("fechado (hoje), sem a claim, sem o produto ou sem o papel: escondido", () => {
    assert.equal(podeMandarParaAeon({ ...base, release: { maestro: "released" } }), false, "sem a claim do AEON");
    assert.equal(podeMandarParaAeon({ ...base, release: { maestro: "released", "ai-edit": "closed" } }), false, "fechado");
    assert.equal(podeMandarParaAeon({ ...base, release: { maestro: "released", "ai-edit": "development" } }), false);
    assert.equal(podeMandarParaAeon({ ...base, release: null }), false);
    assert.equal(podeMandarParaAeon({ ...base, produtos: ["maestro"], release: { "ai-edit": "released" } }), false, "sem o produto no plano");
    assert.equal(podeMandarParaAeon({ ...base, papel: "equipe", release: { "ai-edit": "released" } }), false, "equipe não envia");
    assert.equal(podeMandarParaAeon({ ...base, papel: "leitura", release: { "ai-edit": "released" } }), false);
  });
  test("aberto para a pessoa (released ou allowed): aparece sozinho", () => {
    assert.equal(podeMandarParaAeon({ ...base, release: { "ai-edit": "released" } }), true);
    assert.equal(podeMandarParaAeon({ ...base, papel: "gestor", release: { "ai-edit": "allowed" } }), true);
  });
});
