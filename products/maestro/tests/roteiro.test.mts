// Criação · Roteiro (F1), tudo puro: lerRoteiro e limites, tempo estimado, cada vista (Literário, Técnico, Teleprompter
// byte a byte e contra o código do próprio TPeasy, Edição, Markdown, impressão), os 6 modelos (só dica, nunca
// conteúdo), a conversão do documento antigo e a junção por id.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { roteiroDoDocumentoAntigo, tamanhoDoTexto } from "../src/lib/criacao/roteiro/antigo";
import { juntarRoteiros } from "../src/lib/criacao/roteiro/juntar";
import { blocoVazio, bytesDoRoteiro, cabecalhoDaCena, LIMITES, lerRoteiro, roteiroVazio, type Roteiro } from "../src/lib/criacao/roteiro/modelo";
import { FICHAS_MODELOS, MODELOS_ROTEIRO, roteiroDoModelo } from "../src/lib/criacao/roteiro/modelos";
import { contarPalavras, formatarTempo, linhaDoTempo, medidor, palavrasDaFala, segundosDaFala } from "../src/lib/criacao/roteiro/tempo";
import {
  dadosImpressao,
  idNoTpeasy,
  literarioEmTexto,
  paraBackupTpeasy,
  paraMarkdown,
  vistaEdicao,
  vistaLiterario,
  vistaTecnico,
  vistaTeleprompter,
} from "../src/lib/criacao/roteiro/vistas";
import { podeEditarCriacao, podeEnviarCriacao, podeVerCriacao } from "../src/lib/criacao/permissoes";

const contador = (prefixo = "id") => {
  let n = 0;
  return () => `${prefixo}${++n}`;
};
const ZWSP = "\u200B";

/** Roteiro de exemplo (fictício): três cenas com quase todos os tipos de bloco. */
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

describe("lerRoteiro", () => {
  test("recusa o que não é roteiro e o que passa dos limites", () => {
    for (const v of [null, 1, "x", [], { v: 2, cenas: [] }, { cenas: "x" }, { cenas: [], pessoas: 3 }]) assert.equal(lerRoteiro(v), null, JSON.stringify(v));
    assert.equal(lerRoteiro({ cenas: Array.from({ length: LIMITES.cenas + 1 }, () => ({ titulo: "a", blocos: [] })) }), null);
    assert.equal(lerRoteiro({ cenas: [{ titulo: "a", blocos: Array.from({ length: LIMITES.blocos + 1 }, () => ({ tipo: "acao", texto: "a" })) }] }), null);
    const grande = "x".repeat(LIMITES.acao);
    assert.equal(lerRoteiro({ cenas: [{ titulo: "a", blocos: Array.from({ length: 60 }, () => ({ tipo: "acao", texto: grande })) }] }), null);
    assert.ok(lerRoteiro({ cenas: [{ titulo: "a", blocos: Array.from({ length: 40 }, () => ({ tipo: "acao", texto: grande })) }] }));
  });

  test("conserta em vez de recusar: tipos, listas, tetos, ids e pessoas", () => {
    const r = lerRoteiro(
      {
        formato: "21:9",
        wpm: 9999,
        alvo: { min: 60, max: 30 },
        pessoas: [{ id: "a", nome: "Ana\nSouza", papel: "chefe" }, { id: "a" }],
        cenas: [
          {
            id: "x",
            titulo: "Cena\r\num",
            periodo: "tarde",
            duracaoSeg: "12.34",
            blocos: [
              { id: "x", tipo: "fala", quem: "fantasma", texto: "oi\r\n", modo: "gritando", duracao: -1 },
              { tipo: "desconhecido", texto: "some" },
              { id: "ok-1", tipo: "lettering", texto: "y".repeat(900), estilo: "neon" },
              { id: "ok-1", tipo: "plano", tamanho: "PX", fps: 23.976, feito: "sim" },
              "lixo",
            ],
          },
        ],
      },
      { novoId: contador("n") },
    );
    assert.ok(r);
    assert.equal(r.formato, "16:9");
    assert.equal(r.wpm, LIMITES.wpmMax);
    assert.deepEqual(r.alvo, { min: 30, max: 60 });
    assert.deepEqual(r.pessoas, [
      { id: "a", nome: "Ana Souza", papel: "outro" },
      { id: "n1", nome: "", papel: "outro" },
    ]);
    const c = r.cenas[0];
    assert.equal(c.id, "x");
    assert.equal(c.titulo, "Cena um");
    assert.equal(c.periodo, undefined);
    assert.equal(c.duracaoSeg, 12.3);
    assert.equal(c.blocos.length, 3, "o tipo desconhecido e o lixo saem");
    const [f, l, p] = c.blocos;
    assert.deepEqual(f, { id: "n2", tipo: "fala", quem: null, texto: "oi\n", modo: "on" }, "id repetido com a cena ganha outro; texto não é aparado");
    assert.equal(l.tipo === "lettering" && l.estilo, "gc");
    assert.equal(l.tipo === "lettering" && l.texto.length, LIMITES.lettering);
    assert.deepEqual(p, { id: "n3", tipo: "plano", tamanho: "outro", fps: 23.976 });
  });

  test("é idempotente e não deixa undefined no jsonb", () => {
    const r = exemplo();
    assert.deepEqual(lerRoteiro(JSON.parse(JSON.stringify(r))), r);
    assert.ok(!JSON.stringify(r).includes("undefined"));
    assert.ok(bytesDoRoteiro(r) < LIMITES.bytes);
  });

  test("vazio, bloco vazio e cabeçalho da cena", () => {
    const g = contador();
    assert.deepEqual(roteiroVazio(g), {
      v: 1,
      formato: "16:9",
      alvo: null,
      wpm: 150,
      pessoas: [],
      cenas: [{ id: "id1", titulo: "", blocos: [{ id: "id2", tipo: "acao", texto: "" }] }],
    });
    assert.deepEqual(blocoVazio("fala", g, "ana"), { id: "id3", tipo: "fala", quem: "ana", texto: "", modo: "on" });
    const r = exemplo();
    assert.equal(cabecalhoDaCena(r.cenas[0], 1), "1. EXT. FAZENDA – AMANHECER");
    assert.equal(cabecalhoDaCena(r.cenas[1], 2), "2. INT. TORREFAÇÃO – DIA");
    assert.equal(cabecalhoDaCena(r.cenas[2], 3), "3. ASSINATURA");
    assert.equal(cabecalhoDaCena({ id: "z", titulo: " ", blocos: [] }, 4), "CENA 4");
    assert.equal(cabecalhoDaCena({ id: "z", titulo: "", periodo: "noite", blocos: [] }, 5), "5. NOITE");
  });
});

describe("tempo", () => {
  test("conta palavras como o TPeasy (o próprio código dele)", () => {
    const fonte = readFileSync(new URL("../../tpeasy/app/js/data.js", import.meta.url), "utf8");
    const trecho = fonte.slice(fonte.indexOf("export function countWords"), fonte.indexOf("export function previewOf"));
    const countWords = new Function(`${trecho.replace(/export /g, "")}; return countWords;`)() as (b: string) => number;
    for (const t of [
      "Oi! Toque na tela. [pausa]",
      "# Começo\nTexto ((nota escondida)) com d'água, guarda-chuva e 2026.",
      "**ênfase** [Ana] ((sorrindo)) fala\n\n# Cena 2 · Título\noutra",
      `${ZWSP}#1 em sabor`,
      "",
    ]) {
      assert.equal(contarPalavras(t), countWords(t), t);
    }
    assert.equal(palavrasDaFala("#1 em sabor na região."), 5, "na fala, # no começo é texto");
    assert.equal(contarPalavras("#1 em sabor na região."), 0, "no TPeasy, é título");
  });

  test("fala estimada por palavras por minuto; tempo digitado manda", () => {
    assert.equal(segundosDaFala(Array.from({ length: 150 }, () => "palavra").join(" ")), 60);
    assert.equal(segundosDaFala("um dois três", 60), 3);
    assert.equal(formatarTempo(74), "1:14");
    assert.equal(formatarTempo(3725), "1:02:05");
    assert.equal(formatarTempo(-3), "0:00");
  });

  test("linha do tempo: voz × imagem, plano com ações, fatia, âncoras e excesso", () => {
    const t = linhaDoTempo(exemplo());
    assert.deepEqual(
      t.cenas.map((c) => [c.inicioSeg, c.duracaoSeg, c.vozSeg, c.imagemSeg, c.definida, c.excede]),
      [
        [0, 4, 2.8, 4, false, false],
        [4, 6.4, 6.4, 0, false, false],
        [10.4, 6, 2.4, 0, true, false],
      ],
    );
    assert.equal(t.totalSeg, 16.4);
    const d = Object.fromEntries(t.deixas.map((x) => [x.blocoId, [x.inicioSeg, x.fimSeg]]));
    assert.deepEqual(d, {
      p1: [0, 4],
      a1: [0, 4],
      s1: [0, 4],
      f1: [0, 2.8],
      p2: [4, 10.4],
      f2: [4, 8.4],
      l1: [4, 8.4],
      o1: [4, 8.4],
      f3: [8.4, 10.4],
      a2: [10.4, 16.4],
      l2: [10.4, 16.4],
      f4: [10.4, 12.8],
    });
    assert.ok(!("n1" in d), "nota não entra");
    const curta = exemplo();
    curta.cenas[2].duracaoSeg = 1;
    assert.equal(linhaDoTempo(curta).cenas[2].excede, true);
  });

  test("medidor contra o alvo, com 5% de folga como o TPeasy", () => {
    assert.equal(medidor(20, null).estado, "sem_alvo");
    assert.deepEqual(medidor(16.4, { min: 15, max: 30 }), {
      totalSeg: 16.4,
      alvo: { min: 15, max: 30 },
      estado: "no_alvo",
      diferencaSeg: 0,
      fracao: 16.4 / 30,
    });
    assert.equal(medidor(31.4, { min: 30, max: 30 }).estado, "no_alvo");
    assert.deepEqual([medidor(32, { min: 30, max: 30 }).estado, medidor(32, { min: 30, max: 30 }).diferencaSeg], ["acima", 2]);
    assert.deepEqual([medidor(10, { min: 15, max: 30 }).estado, medidor(10, { min: 15, max: 30 }).diferencaSeg], ["abaixo", -5]);
  });
});

describe("vistas", () => {
  test("Literário: cabeçalho, ação, falas com nome e modo; plano, observação e nota ficam fora", () => {
    const v = vistaLiterario(exemplo());
    assert.deepEqual(
      v.cenas.map((c) => [c.cabecalho, c.titulo, c.linhas.map((l) => l.blocoId)]),
      [
        ["1. EXT. FAZENDA – AMANHECER", "Abertura", ["a1", "s1", "f1"]],
        ["2. INT. TORREFAÇÃO – DIA", "O processo", ["f2", "l1", "f3"]],
        ["3. ASSINATURA", null, ["a2", "l2", "f4"]],
      ],
    );
    assert.equal(
      literarioEmTexto(exemplo()),
      [
        [
          "1. EXT. FAZENDA – AMANHECER\nAbertura",
          "O sol nasce sobre o cafezal.",
          "[Trilha · entra em fade: Violão leve]",
          "ANA (OFF)\n(calma)\nTodo café começa **muito antes** da xícara. [pausa]",
        ],
        [
          "2. INT. TORREFAÇÃO – DIA\nO processo",
          "JOÃO (SONORA)\nA gente torra em lotes pequenos.\n\nCada lote tem um nome.",
          "[GC: João Lima, mestre de torra]",
          "ANA (OFF)\n#1 em sabor na região.",
        ],
        ["3. ASSINATURA", "Packshot da embalagem", "[CTA: exemplo.com.br]", "ANA (OFF)\nCafé Aurora. Do pé à xícara."],
      ]
        .map((c) => c.join("\n\n"))
        .join("\n\n\n"),
    );
  });

  test("Técnico: linhas por plano e fala, colunas, rótulos e tempo", () => {
    const v = vistaTecnico(exemplo());
    assert.deepEqual(v.colunas, ["cena", "imagem", "lettering", "audio", "observacoes", "tempo"]);
    const resumo = v.cenas.map((c) =>
      c.linhas.map((l) => ({
        imagem: l.imagem.map((x) => `${x.rotulo ?? ""}|${x.texto}`),
        lettering: l.lettering.map((x) => `${x.rotulo}|${x.texto}`),
        audio: l.audio.map((x) => `${x.rotulo}|${x.texto}`),
        obs: l.observacoes.map((x) => x.texto),
        t: [l.inicioSeg, l.fimSeg, l.duracaoSeg],
      })),
    );
    assert.deepEqual(resumo, [
      [
        {
          imagem: ["GPG|drone subindo", "|O sol nasce sobre o cafezal."],
          lettering: [],
          audio: ["Trilha · entra em fade|Violão leve", "Ana · OFF|Todo café começa **muito antes** da xícara. [pausa]"],
          obs: [],
          t: [0, 4, 4],
        },
      ],
      [
        {
          imagem: ["PM|35mm"],
          lettering: ["GC|João Lima, mestre de torra"],
          audio: ["João · Sonora|A gente torra em lotes pequenos.\n\nCada lote tem um nome."],
          obs: ["Gravar com a torradeira ligada"],
          t: [4, 10.4, 6.4],
        },
        { imagem: [], lettering: [], audio: ["Ana · OFF|#1 em sabor na região."], obs: [], t: [8.4, 10.4, 2] },
      ],
      [
        {
          imagem: ["|Packshot da embalagem"],
          lettering: ["CTA|exemplo.com.br"],
          audio: ["Ana · OFF|Café Aurora. Do pé à xícara."],
          obs: [],
          t: [10.4, 16.4, 6],
        },
      ],
    ]);
    assert.equal(v.cenas[0].linhas[0].audio[1].obs, "calma");
    assert.equal(v.totalSeg, 16.4);
    assert.deepEqual(vistaTecnico(exemplo(), { ocultar: ["cena", "tempo", "observacoes"] }).colunas, ["cena", "imagem", "lettering", "audio"]);
  });

  test("Teleprompter: só as falas, na marcação do TPeasy, byte a byte", () => {
    const todas = vistaTeleprompter(exemplo());
    assert.equal(
      todas.texto,
      [
        "# Cena 1 · Abertura",
        "[Ana] ((calma)) Todo café começa **muito antes** da xícara. [pausa]",
        "# Cena 2 · O processo",
        "[João] A gente torra em lotes pequenos.",
        "Cada lote tem um nome.",
        `[Ana] ${ZWSP}#1 em sabor na região.`,
        "# Cena 3 · Assinatura",
        "[Ana] Café Aurora. Do pé à xícara.",
      ].join("\n\n"),
    );
    assert.deepEqual(todas.pessoas, [
      { id: "ana", nome: "Ana" },
      { id: "joao", nome: "João" },
    ]);
    assert.equal(todas.palavras, 29);
    assert.equal(todas.secoes, 3);
    const ana = vistaTeleprompter(exemplo(), { pessoa: "ana" });
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
    assert.equal(ana.palavras, 18);
    assert.equal(ana.duracaoSeg, 7.2);
    assert.equal(vistaTeleprompter(exemplo(), { pessoa: "ninguem" }).texto, "");
    for (const fora of ["Violão", "João Lima", "drone", "torradeira", "Packshot", "autorização", "exemplo.com.br"])
      assert.ok(!todas.texto.includes(fora), fora);
  });

  test("Teleprompter: o TPeasy lê como esperado (renderScript e countWords do próprio app)", () => {
    const fonte = readFileSync(new URL("../../tpeasy/app/js/data.js", import.meta.url), "utf8");
    const trecho = fonte.slice(fonte.indexOf("export function countWords"), fonte.indexOf("// ───────────── backup"));
    const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const tp = new Function("esc", `${trecho.replace(/export /g, "")}; return { countWords, renderScript, blocksOf };`)(esc) as {
      countWords: (b: string) => number;
      renderScript: (b: string) => string;
      blocksOf: (b: string) => string[];
    };
    const ana = vistaTeleprompter(exemplo(), { pessoa: "ana" }).texto;
    assert.deepEqual(tp.blocksOf(ana), ["Cena 1 · Abertura", "Cena 2 · O processo", "Cena 3 · Assinatura"], "o #1 da fala não vira título");
    assert.equal(tp.countWords(ana), 18);
    const html = tp.renderScript(ana);
    assert.ok(html.includes("<strong>muito antes</strong>"));
    assert.ok(html.includes('<span class="cue">[pausa]</span>'));
    assert.ok(!html.includes("calma"), "a indicação ((…)) não aparece no TP");
    assert.equal(tp.countWords(vistaTeleprompter(exemplo()).texto), 29);
  });

  test("backup do TPeasy: forma do contrato, id estável e atualiza pelo mais novo", () => {
    const corpo = vistaTeleprompter(exemplo(), { pessoa: "ana" }).texto;
    const b3 = paraBackupTpeasy({ roteiroId: "r1", titulo: "Café  Aurora", pessoa: "ana", texto: corpo, atualizadoEm: 1000, alvoSeg: 30, agora: new Date(0) });
    assert.deepEqual(b3, {
      app: "tpeasy",
      version: 1,
      exportedAt: "1970-01-01T00:00:00.000Z",
      scripts: [{ id: "maestro-r1-ana", title: "Café Aurora", body: corpo, updated: 1000, pos: 0, fav: false, target: 30 }],
    });
    assert.equal(idNoTpeasy("r1", null), "maestro-r1-todas");
    // o contrato do HUB (TpeasyBackupSchema) tem esses campos
    const contrato = readFileSync(new URL("../../../packages/media-contracts/src/handoffs.ts", import.meta.url), "utf8");
    const esquema = contrato.slice(contrato.indexOf("export const TpeasyScriptSchema"), contrato.indexOf("export type TpeasyBackup"));
    for (const campo of [
      "id:",
      "title:",
      "body:",
      "updated:",
      "pos:",
      "fav:",
      "target:",
      "app: z.literal('tpeasy')",
      "version: z.literal(1)",
      "exportedAt:",
      "scripts:",
    ])
      assert.ok(esquema.includes(campo), campo);
    // importAll do TPeasy: junta pelo id e fica com o mais novo
    const fonte = readFileSync(new URL("../../tpeasy/app/js/data.js", import.meta.url), "utf8");
    const importAll = fonte.slice(fonte.indexOf("export function importAll"), fonte.indexOf("\n}\n", fonte.indexOf("export function importAll")) + 2);
    const scripts: { id: string; body: string; updated: number }[] = [];
    const importar = new Function(
      "scripts",
      "saveScripts",
      "replacePrefs",
      "sessions",
      "store",
      "KEY",
      `${importAll.replace("export ", "")}; return importAll;`,
    )(
      scripts,
      () => {},
      () => {},
      [],
      { set() {} },
      {},
    ) as (d: unknown) => number;
    assert.equal(importar(b3), 1);
    const b4 = paraBackupTpeasy({ roteiroId: "r1", titulo: "Café Aurora", pessoa: "ana", texto: "# Cena 1\n\nNovo texto", atualizadoEm: 2000 });
    assert.equal(importar(b4), 0, "não duplica");
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].body, "# Cena 1\n\nNovo texto");
    assert.equal(importar(b3), 0);
    assert.equal(scripts[0].body, "# Cena 1\n\nNovo texto", "a versão velha não volta");
  });

  test("Edição: deixas em ordem de tempo, cor por tipo; observação e nota fora", () => {
    const v = vistaEdicao(exemplo());
    assert.deepEqual(
      v.deixas.map((d) => `${d.inicioSeg}-${d.fimSeg} ${d.cor} ${d.rotulo}`),
      [
        "0-4 imagem GPG",
        "0-4 imagem Imagem",
        "0-4 audio Trilha · entra em fade",
        "0-2.8 fala Ana · OFF",
        "4-10.4 imagem PM",
        "4-8.4 fala João · Sonora",
        "4-8.4 lettering GC",
        "8.4-10.4 fala Ana · OFF",
        "10.4-16.4 imagem Imagem",
        "10.4-16.4 lettering CTA",
        "10.4-12.8 fala Ana · OFF",
      ],
    );
    assert.ok(!v.deixas.some((d) => d.blocoId === "o1" || d.blocoId === "n1"));
    assert.equal(v.deixas[5].cenaTitulo, "O processo");
    assert.equal(v.totalSeg, 16.4);
  });

  test("Markdown: cabeçalhos por cena e blocos com rótulo; nota fica fora", () => {
    const md = paraMarkdown(exemplo(), "Café Aurora");
    assert.ok(md.startsWith("# Café Aurora\n\n> Formato 16:9 · 3 cenas · 0:16 estimados · alvo 0:15–0:30\n"));
    assert.ok(md.includes("## Cena 1 · Abertura · EXT · Fazenda · amanhecer (0:04)\n"));
    assert.ok(md.includes("- **Plano:** GPG · drone subindo\n"));
    assert.ok(md.includes("- **Fala · Ana (OFF):** _(calma)_ Todo café começa **muito antes** da xícara. [pausa]\n"));
    assert.ok(md.includes("- **Fala · João (Sonora):** A gente torra em lotes pequenos.\n  \n  Cada lote tem um nome.\n"));
    assert.ok(md.includes("- **Lettering (GC):** João Lima, mestre de torra\n"));
    assert.ok(md.includes("- **Áudio (Trilha · entra em fade):** Violão leve\n"));
    assert.ok(md.includes("- **Observação:** Gravar com a torradeira ligada\n"));
    assert.ok(!md.includes("autorização"));
    assert.ok(md.endsWith("\n"));
  });

  test("Impressão: as três vistas com cabeçalho e medidor", () => {
    const r = exemplo();
    const lit = dadosImpressao(r, { titulo: " Café  Aurora ", vista: "literario", versao: 3 });
    assert.equal(lit.titulo, "Café Aurora");
    assert.equal(lit.versao, "v3");
    assert.equal(lit.duracao, "0:16");
    assert.equal(lit.medidor.estado, "no_alvo");
    assert.deepEqual(lit.elenco, ["Ana · Locutor", "João · Entrevistado"]);
    assert.ok(lit.vista === "literario" && lit.literario.cenas.length === 3);
    const tec = dadosImpressao(r, { titulo: "x", vista: "tecnico", ocultar: ["observacoes"] });
    assert.ok(tec.vista === "tecnico" && !tec.tecnico.colunas.includes("observacoes"));
    const tp = dadosImpressao(r, { titulo: "x", vista: "teleprompter", pessoa: "joao" });
    assert.ok(tp.vista === "teleprompter" && tp.pessoa === "joao" && tp.teleprompter.texto.startsWith("# Cena 2"));
    assert.equal(tp.versao, null);
  });
});

describe("modelos", () => {
  test("os 6 cartões, na ordem, com formato e alvo do plano", () => {
    assert.deepEqual(
      FICHAS_MODELOS.map((f) => [f.k, f.formato, f.alvo]),
      [
        ["institucional", "16:9", { min: 90, max: 180 }],
        ["reels", "9:16", { min: 30, max: 60 }],
        ["comercial30", "16:9", { min: 30, max: 30 }],
        ["documentario", "16:9", null],
        ["evento", "16:9", { min: 60, max: 180 }],
        ["branco", "16:9", null],
      ],
    );
    assert.deepEqual(FICHAS_MODELOS[0].cenas, ["Abertura", "Quem somos", "O que fazemos", "Diferenciais", "Prova", "Assinatura"]);
    assert.deepEqual(FICHAS_MODELOS[5].cenas, []);
  });

  for (const k of MODELOS_ROTEIRO) {
    test(`${k}: só estrutura e dica, nunca conteúdo; nenhuma vista mostra a dica`, () => {
      const r = roteiroDoModelo(k, contador(k));
      assert.deepEqual(lerRoteiro(JSON.parse(JSON.stringify(r))), r, "o modelo passa no lerRoteiro sem mudar");
      assert.ok(r.cenas.length >= 1);
      const dicas: string[] = [];
      for (const p of r.pessoas) {
        assert.equal(p.nome, "", "pessoa sem nome inventado");
        if (p.dica) dicas.push(p.dica);
      }
      for (const c of r.cenas)
        for (const b of c.blocos) {
          assert.equal(b.tipo === "plano" ? (b.texto ?? "") : b.texto, "", `${b.id} vazio`);
          assert.ok(b.dica, `${b.id} tem dica`);
          dicas.push(b.dica!);
          if (b.tipo === "fala") assert.ok(b.quem && r.pessoas.some((p) => p.id === b.quem), "fala com uma pessoa do modelo");
        }
      for (const c of r.cenas) if (c.dica) dicas.push(c.dica);
      const saidas = [
        JSON.stringify(vistaLiterario(r)),
        literarioEmTexto(r),
        JSON.stringify(vistaTecnico(r)),
        vistaTeleprompter(r).texto,
        JSON.stringify(vistaEdicao(r)),
        paraMarkdown(r, "Novo"),
        JSON.stringify(dadosImpressao(r, { titulo: "Novo", vista: "tecnico" })),
      ];
      for (const s of saidas) for (const d of dicas) assert.ok(!s.includes(d), `"${d}" vazou`);
      assert.equal(vistaTeleprompter(r).texto, "");
      assert.ok(vistaLiterario(r).cenas.every((c) => c.linhas.length === 0));
      // com incluirVazios, a tela recebe a dica num campo próprio (nunca no texto)
      const lit = vistaLiterario(r, { incluirVazios: true }).cenas.flatMap((c) => c.linhas);
      assert.ok(lit.every((l) => l.texto === ""));
      const tec = vistaTecnico(r, { incluirVazios: true }).cenas.flatMap((c) =>
        c.linhas.flatMap((l) => [...l.imagem, ...l.lettering, ...l.audio, ...l.observacoes]),
      );
      assert.ok(tec.length > 0 && tec.every((x) => x.texto === "" && !!x.dica));
    });
  }

  test('Comercial 30" fecha em 30 s; Reels abre com o gancho de 3 s; ids novos a cada roteiro', () => {
    const c = roteiroDoModelo("comercial30");
    assert.equal(linhaDoTempo(c).totalSeg, 30);
    assert.equal(medidor(linhaDoTempo(c).totalSeg, c.alvo).estado, "no_alvo");
    assert.equal(roteiroDoModelo("reels").cenas[0].duracaoSeg, 3);
    const reels = roteiroDoModelo("reels");
    assert.ok(
      reels.cenas.flatMap((x) => x.blocos).every((b, i, todos) => b.tipo !== "fala" || todos[i + 1]?.tipo === "lettering"),
      "legenda depois de toda fala",
    );
    assert.notEqual(roteiroDoModelo("branco").cenas[0].id, roteiroDoModelo("branco").cenas[0].id);
    const doc = roteiroDoModelo("documentario");
    assert.ok(
      doc.cenas.some((x) => x.blocos.some((b) => b.tipo === "nota")),
      "perguntas da entrevista como nota",
    );
  });
});

describe("documento antigo → roteiro novo", () => {
  test("roteiro de texto: um bloco de fala por parágrafo; # abre cena", () => {
    const r = roteiroDoDocumentoAntigo("roteiro", { texto: "Primeiro parágrafo.\r\n\r\nSegundo\ncom duas linhas.\n\n# Fechamento\nÚltimo." }, contador());
    assert.ok(r);
    assert.deepEqual(r.pessoas, [{ id: "id1", nome: "", papel: "locutor" }]);
    assert.deepEqual(
      r.cenas.map((c) => [c.titulo, c.blocos.map((b) => (b.tipo === "fala" ? `${b.quem}:${b.texto}` : b.tipo))]),
      [
        ["", ["id1:Primeiro parágrafo.", "id1:Segundo\ncom duas linhas."]],
        ["Fechamento", ["id1:Último."]],
      ],
    );
    assert.ok(lerRoteiro(r));
    const vazio = roteiroDoDocumentoAntigo("roteiro", { texto: "" }, contador());
    assert.ok(vazio && vazio.cenas.length === 1 && vazio.pessoas.length === 0);
  });

  test("decupagem: cena por valor, plano + ação, tamanho reconhecido", () => {
    const r = roteiroDoDocumentoAntigo(
      "decupagem",
      {
        planos: [
          { cena: "1", plano: "PG", descricao: "Fachada", lente: "24mm", movimento: "", feito: true },
          { cena: "1", plano: "Plano médio", descricao: "", lente: "", movimento: "travelling", feito: false },
          { cena: "Final", plano: "contra-plongée", descricao: "Logo", lente: "", movimento: "", feito: false },
        ],
      },
      contador(),
    );
    assert.ok(r);
    assert.deepEqual(
      r.cenas.map((c) => ({ titulo: c.titulo, blocos: c.blocos.map(({ id: _id, ...b }) => b) })),
      [
        {
          titulo: "Cena 1",
          blocos: [
            { tipo: "plano", tamanho: "PG", lente: "24mm", feito: true },
            { tipo: "acao", texto: "Fachada" },
            { tipo: "plano", tamanho: "PM", movimento: "travelling" },
          ],
        },
        {
          titulo: "Final",
          blocos: [
            { tipo: "plano", tamanho: "outro", texto: "contra-plongée" },
            { tipo: "acao", texto: "Logo" },
          ],
        },
      ],
    );
    assert.deepEqual(lerRoteiro(JSON.parse(JSON.stringify(r)), { novoId: contador("z") }), r);
    assert.equal(tamanhoDoTexto("pp"), "PP");
    assert.equal(tamanhoDoTexto("Grande plano geral"), "GPG");
    assert.equal(tamanhoDoTexto("DRONE"), "drone");
    assert.equal(tamanhoDoTexto("plano esquisito"), null);
    assert.equal(roteiroDoDocumentoAntigo("checklist", { itens: [] }), null);
    assert.equal(roteiroDoDocumentoAntigo("decupagem", { planos: "x" }), null);
  });
});

describe("juntar duas edições por id", () => {
  const base = () => exemplo();
  test("mudanças em blocos diferentes se juntam; a ordem é a deles", () => {
    const meu = base();
    const deles = base();
    (meu.cenas[0].blocos[1] as { texto: string }).texto = "O sol nasce devagar.";
    (deles.cenas[1].blocos[2] as { texto: string }).texto = "João Lima, torrador";
    deles.formato = "9:16";
    meu.wpm = 160;
    const { roteiro, conflitos } = juntarRoteiros(base(), meu, deles);
    assert.deepEqual(conflitos, []);
    assert.equal(roteiro.formato, "9:16");
    assert.equal(roteiro.wpm, 160);
    assert.equal((roteiro.cenas[0].blocos[1] as { texto: string }).texto, "O sol nasce devagar.");
    assert.equal((roteiro.cenas[1].blocos[2] as { texto: string }).texto, "João Lima, torrador");
    assert.ok(lerRoteiro(roteiro));
  });

  test("o mesmo bloco mudado dos dois lados fica o deles, com o conflito", () => {
    const meu = base();
    const deles = base();
    (meu.cenas[2].blocos[2] as { texto: string }).texto = "Versão minha.";
    (deles.cenas[2].blocos[2] as { texto: string }).texto = "Versão deles.";
    const { roteiro, conflitos } = juntarRoteiros(base(), meu, deles);
    assert.equal((roteiro.cenas[2].blocos[2] as { texto: string }).texto, "Versão deles.");
    assert.equal(conflitos.length, 1);
    assert.ok(
      conflitos[0].tipo === "bloco" &&
        conflitos[0].id === "f4" &&
        conflitos[0].meu &&
        "texto" in conflitos[0].meu &&
        conflitos[0].meu.texto === "Versão minha.",
    );
  });

  test("incluir, apagar e o apagado que foi mudado", () => {
    const meu = base();
    const deles = base();
    // eu: incluo um bloco depois de a1, apago a nota e mudo f3; eles: apagam f3 e incluem uma cena no fim
    meu.cenas[0].blocos.splice(2, 0, { id: "novo", tipo: "acao", texto: "Close no grão." });
    meu.cenas[0].blocos = meu.cenas[0].blocos.filter((b) => b.id !== "n1");
    (meu.cenas[1].blocos[4] as { texto: string }).texto = "Primeiro em sabor.";
    deles.cenas[1].blocos = deles.cenas[1].blocos.filter((b) => b.id !== "f3");
    deles.cenas.push({ id: "c4", titulo: "Extra", blocos: [] });
    const { roteiro, conflitos } = juntarRoteiros(base(), meu, deles);
    assert.deepEqual(
      roteiro.cenas[0].blocos.map((b) => b.id),
      ["p1", "a1", "novo", "s1", "f1"],
    );
    assert.ok(
      roteiro.cenas[1].blocos.some((b) => b.id === "f3" && "texto" in b && b.texto === "Primeiro em sabor."),
      "o que eu escrevi não se perde",
    );
    assert.deepEqual(
      conflitos.map((c) => c.tipo + ":" + ("id" in c ? c.id : "")),
      ["bloco:f3"],
    );
    assert.deepEqual(
      roteiro.cenas.map((c) => c.id),
      ["c1", "c2", "c3", "c4"],
    );
  });

  test("cena apagada por mim sai se eles não mexeram; volta se mexeram", () => {
    const meu = base();
    meu.cenas = meu.cenas.filter((c) => c.id !== "c3");
    assert.deepEqual(
      juntarRoteiros(base(), meu, base()).roteiro.cenas.map((c) => c.id),
      ["c1", "c2"],
    );
    const deles = base();
    (deles.cenas[2].blocos[0] as { texto: string }).texto = "Packshot novo";
    const j = juntarRoteiros(base(), meu, deles);
    assert.deepEqual(
      j.roteiro.cenas.map((c) => c.id),
      ["c1", "c2", "c3"],
    );
    assert.equal(j.conflitos[0].tipo, "cena");
  });
});

test("permissões provisórias da Criação (até a área `criacao`)", () => {
  assert.deepEqual(
    (["admin", "gestor", "equipe", "leitura"] as const).map((p) => [podeVerCriacao(p), podeEditarCriacao(p), podeEnviarCriacao(p)]),
    [
      [true, true, true],
      [true, true, true],
      [true, true, false],
      [true, false, false],
    ],
  );
});
