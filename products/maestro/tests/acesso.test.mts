// temAcesso() é o único ponto de decisão (lib/auth/acesso.ts) e papelDoHub() a tabela fixa de papéis. Funções puras.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { liberacao, temAcesso } from "../src/lib/auth/acesso";
import { papelDoHub, podeEscrever } from "../src/lib/papeis";

describe("temAcesso", () => {
  const aberto = { maestro: "released" };
  test("precisa de `maestro` em zro_products", () => {
    assert.equal(temAcesso({ produtos: ["maestro", "sobedesce"], release: aberto }), true);
    assert.equal(temAcesso({ produtos: ["sobedesce", "synquei"], release: aberto }), false);
    assert.equal(temAcesso({ produtos: [], release: aberto }), false);
  });

  test("gate de lançamento: zro_release.maestro released ou allowed entra; closed, outro valor ou sem a claim, não", () => {
    assert.equal(temAcesso({ produtos: ["maestro"], release: { maestro: "closed" } }), false);
    assert.equal(temAcesso({ produtos: ["maestro"], release: { maestro: "allowed" } }), true);
    assert.equal(temAcesso({ produtos: ["maestro"], release: { maestro: "released" } }), true);
    assert.equal(temAcesso({ produtos: ["maestro"], release: { maestro: "beta" } }), false);
    // Liberado pelo gate mas sem o produto na organização: continua negado (entitlement).
    assert.equal(temAcesso({ produtos: [], release: { maestro: "released" } }), false);
    // Deny-by-default: claim sem o Maestro, nula ou ausente = fechado.
    assert.equal(temAcesso({ produtos: ["maestro"], release: { nossom: "released" } }), false);
    assert.equal(temAcesso({ produtos: ["maestro"], release: null }), false);
    assert.equal(temAcesso({ produtos: ["maestro"] }), false);
  });

  test("liberacao() resume a claim", () => {
    assert.equal(liberacao({ release: { maestro: "allowed" } }), "allowed");
    assert.equal(liberacao({ release: { maestro: "released" } }), "released");
    assert.equal(liberacao({ release: { maestro: "development" } }), "closed");
    assert.equal(liberacao({}), "closed");
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
