// temAcesso() é o único ponto de decisão (lib/auth/acesso.ts) e papelDoHub() a tabela fixa de papéis. Funções puras.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { temAcesso } from "../src/lib/auth/acesso";
import { papelDoHub, podeEscrever } from "../src/lib/papeis";

describe("temAcesso", () => {
  test("só com `maestro` em zro_products", () => {
    assert.equal(temAcesso({ produtos: ["maestro", "sobedesce"] }), true);
    assert.equal(temAcesso({ produtos: ["sobedesce", "synquei"] }), false);
    assert.equal(temAcesso({ produtos: [] }), false);
  });

  test("gate de lançamento: a claim zro_release, quando existir, nega mesmo com o produto na lista", () => {
    assert.equal(temAcesso({ produtos: ["maestro"], release: { maestro: "closed" } }), false);
    assert.equal(temAcesso({ produtos: ["maestro"], release: { maestro: "allowed" } }), true);
    assert.equal(temAcesso({ produtos: ["maestro"], release: { maestro: "released" } }), true);
    // Liberado pelo gate mas sem o produto na organização: continua negado (entitlement).
    assert.equal(temAcesso({ produtos: [], release: { maestro: "released" } }), false);
    // A claim sem o Maestro dentro não decide nada (outros produtos).
    assert.equal(temAcesso({ produtos: ["maestro"], release: { nossom: "closed" } }), true);
    assert.equal(temAcesso({ produtos: ["maestro"], release: null }), true);
  });
});

describe("papéis do Maestro vêm da organização da Absolute ZRO", () => {
  test("tabela fixa", () => {
    assert.equal(papelDoHub("owner"), "admin");
    assert.equal(papelDoHub("admin"), "admin");
    assert.equal(papelDoHub("manager"), "gestor");
    assert.equal(papelDoHub("editor"), "equipe");
    assert.equal(papelDoHub("viewer"), "leitura");
    assert.equal(papelDoHub("guest"), "leitura");
    assert.equal(papelDoHub("billing"), "leitura");
    assert.equal(papelDoHub(null), "leitura");
    assert.equal(papelDoHub(" OWNER "), "admin");
  });

  test("leitura não escreve", () => {
    assert.equal(podeEscrever("leitura"), false);
    assert.equal(podeEscrever("equipe"), true);
  });
});
