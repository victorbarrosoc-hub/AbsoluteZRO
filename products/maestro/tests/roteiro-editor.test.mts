// Criação · as operações do editor do Roteiro (F2), puras: Enter (fala depois de fala troca de pessoa), Tab e ⌘1–6
// trocam o tipo mantendo id e texto, mover e arrastar, apagar com o foco certo, cena nova, elenco, tempo digitado e
// "Comparar com a versão" por id. Nada muta o que veio; o que não mudou continua o mesmo objeto.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { compararRoteiros, resumoDoBloco } from "../src/lib/criacao/roteiro/comparar";
import {
  acharBloco,
  apagarBloco,
  apagarCena,
  apagarPessoa,
  blocoPorId,
  inserirDepois,
  inserirNoFim,
  lerTempo,
  moverBloco,
  moverCena,
  mudarBloco,
  mudarCena,
  novaCena,
  novaPessoa,
  proximaPessoa,
  reordenarBloco,
  tipoVizinho,
  trocarTipo,
} from "../src/lib/criacao/roteiro/editar";
import { lerRoteiro, type Roteiro } from "../src/lib/criacao/roteiro/modelo";

const contador = (p = "n") => {
  let i = 0;
  return () => `${p}${++i}`;
};

function exemplo(): Roteiro {
  return lerRoteiro({
    v: 1,
    pessoas: [
      { id: "ana", nome: "Ana", papel: "locutor" },
      { id: "rui", nome: "Rui", papel: "entrevistado" },
    ],
    cenas: [
      {
        id: "c1",
        titulo: "Abertura",
        blocos: [
          { id: "a1", tipo: "acao", texto: "Sol nasce." },
          { id: "f1", tipo: "fala", quem: "ana", texto: "Bom dia.", modo: "off" },
        ],
      },
      { id: "c2", titulo: "Fim", blocos: [{ id: "p1", tipo: "plano", tamanho: "PM", texto: "na mão", duracao: 5 }] },
    ],
  })!;
}

describe("editor do roteiro: blocos", () => {
  test("Enter: mesmo tipo logo depois; fala depois de fala troca de pessoa; nada muta", () => {
    const r = exemplo();
    const copia = JSON.stringify(r);
    const x = inserirDepois(r, "f1", undefined, contador());
    assert.equal(JSON.stringify(r), copia);
    assert.deepEqual(
      x.roteiro.cenas[0].blocos.map((b) => b.id),
      ["a1", "f1", "n1"],
    );
    const novo = blocoPorId(x.roteiro, "n1")!;
    assert.equal(novo.tipo, "fala");
    assert.equal(novo.tipo === "fala" && novo.quem, "rui");
    assert.equal(x.roteiro.cenas[1], r.cenas[1], "a cena que não mudou é o mesmo objeto");
    // depois da ação, uma fala nova vem com quem falou por último
    const y = inserirDepois(r, "a1", "fala", contador());
    const f = blocoPorId(y.roteiro, "n1")!;
    assert.equal(f.tipo === "fala" && f.quem, "ana", "ninguém falou antes: a primeira do elenco");
    assert.equal(proximaPessoa(r, "rui"), "ana");
    assert.equal(proximaPessoa({ ...r, pessoas: [] }, "ana"), null);
  });

  test("Tab e ⌘1–6: troca o tipo mantendo id, texto, tempo e dica", () => {
    const r = exemplo();
    assert.equal(tipoVizinho("fala", 1), "acao");
    assert.equal(tipoVizinho("fala", -1), "nota");
    assert.equal(tipoVizinho("nota", 1), "fala");
    const a = trocarTipo(r, "a1", "fala");
    const b = blocoPorId(a, "a1")!;
    assert.equal(b.tipo, "fala");
    assert.equal(b.tipo === "fala" && b.texto, "Sol nasce.");
    assert.equal(b.tipo === "fala" && b.quem, "ana", "a primeira pessoa do elenco quando ninguém falou antes");
    const p = blocoPorId(trocarTipo(r, "p1", "lettering"), "p1")!;
    assert.deepEqual(p, { id: "p1", tipo: "lettering", texto: "na mão", estilo: "gc", duracao: 5 });
    const vazio = blocoPorId(trocarTipo(mudarBloco(r, "a1", { texto: "" }), "a1", "plano"), "a1")!;
    assert.deepEqual(vazio, { id: "a1", tipo: "plano", tamanho: "PM" });
    assert.equal(trocarTipo(r, "a1", "acao"), r, "mesmo tipo: nada muda");
    // o resultado continua passando por lerRoteiro sem conserto
    assert.deepEqual(lerRoteiro(a), a);
  });

  test("mover (⌥↑/⌥↓) atravessa a cena; arrastar reordena; apagar devolve o foco", () => {
    const r = exemplo();
    const m = moverBloco(r, "f1", -1);
    assert.deepEqual(
      m.cenas[0].blocos.map((b) => b.id),
      ["f1", "a1"],
    );
    const desce = moverBloco(r, "f1", 1);
    assert.deepEqual(
      desce.cenas.map((c) => c.blocos.map((b) => b.id)),
      [["a1"], ["f1", "p1"]],
    );
    assert.equal(moverBloco(r, "a1", -1), r, "na ponta do roteiro não anda");
    assert.deepEqual(
      reordenarBloco(r, "c1", 1, 0).cenas[0].blocos.map((b) => b.id),
      ["f1", "a1"],
    );
    const ap = apagarBloco(r, "f1");
    assert.equal(ap.foco, "a1");
    assert.equal(acharBloco(ap.roteiro, "f1"), null);
    assert.equal(apagarBloco(r, "p1").foco, null);
  });

  test("cenas: nova depois da atual, mudar, mover, apagar (sempre fica uma)", () => {
    const r = exemplo();
    const n = novaCena(r, "c1", contador());
    assert.deepEqual(
      n.roteiro.cenas.map((c) => c.id),
      ["c1", "n1", "c2"],
    );
    assert.equal(n.blocoId, "n2");
    const t = mudarCena(r, "c1", { local: "Fazenda", intExt: "EXT", periodo: undefined });
    assert.equal(t.cenas[0].local, "Fazenda");
    assert.ok(!("periodo" in t.cenas[0]));
    assert.deepEqual(
      moverCena(r, "c2", -1).cenas.map((c) => c.id),
      ["c2", "c1"],
    );
    assert.equal(apagarCena(apagarCena(r, "c1"), "c2").cenas.length, 1);
    const fim = inserirNoFim(r, "c2", "audio", contador());
    assert.equal(fim.roteiro.cenas[1].blocos.at(-1)!.tipo, "audio");
  });

  test("elenco: pessoa nova e tirar pessoa (a fala fica, sem pessoa)", () => {
    const r = exemplo();
    const p = novaPessoa(r, "  Bia   Lima ", "ator", contador("p"));
    assert.deepEqual(p.roteiro.pessoas.at(-1), { id: "p1", nome: " Bia Lima ", papel: "ator" });
    const sem = apagarPessoa(r, "ana");
    const f = blocoPorId(sem, "f1")!;
    assert.equal(f.tipo === "fala" && f.quem, null);
    assert.equal(f.tipo === "fala" && f.texto, "Bom dia.");
  });

  test("tempo digitado: 5, 0:05, 1:30, 1m30, 90s; vazio ou lixo é null", () => {
    assert.equal(lerTempo("5"), 5);
    assert.equal(lerTempo("0:05"), 5);
    assert.equal(lerTempo("1:30"), 90);
    assert.equal(lerTempo("1m30"), 90);
    assert.equal(lerTempo("90s"), 90);
    assert.equal(lerTempo("2,5"), 2.5);
    assert.equal(lerTempo(""), null);
    assert.equal(lerTempo("abc"), null);
    assert.equal(lerTempo("0"), null);
  });
});

describe("comparar com a versão", () => {
  test("incluído, removido e mudou por id; ordem não é mudança; dica não conta", () => {
    const antes = exemplo();
    let depois = mudarBloco(antes, "a1", { texto: "Sol nasce devagar." });
    depois = inserirDepois(depois, "p1", "lettering", contador()).roteiro;
    depois = apagarBloco(depois, "f1").roteiro;
    depois = novaCena(depois, null, contador("x")).roteiro;
    const d = compararRoteiros(antes, depois);
    assert.deepEqual(
      d.mudados.map((x) => [x.id, x.antes, x.depois]),
      [["a1", "Sol nasce.", "Sol nasce devagar."]],
    );
    assert.deepEqual(
      d.removidos.map((x) => [x.id, x.rotulo, x.antes]),
      [["f1", "Fala · Ana (OFF)", "Bom dia."]],
    );
    assert.deepEqual(
      d.incluidos.map((x) => [x.tipo, x.cena]),
      [
        ["lettering", 2],
        ["acao", 3],
      ],
    );
    assert.deepEqual(d.cenasIncluidas, ["Cena 3"]);
    assert.equal(d.igual, false);
    assert.equal(compararRoteiros(antes, moverBloco(antes, "f1", -1)).igual, true);
    assert.equal(compararRoteiros(antes, mudarBloco(antes, "a1", { dica: "Imagem de abertura" })).igual, true);
    assert.deepEqual(resumoDoBloco(antes, blocoPorId(antes, "p1")!), { rotulo: "Plano · PM", texto: "na mão" });
  });
});
