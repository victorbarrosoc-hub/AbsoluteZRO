// Balões da barra de abas (app/js/pendencias.js): só conta o que espera uma ação da pessoa.
import assert from "node:assert/strict";
import { test } from "node:test";
import { pendencias, numeroBalao, rotuloBalao } from "../app/js/pendencias.js";

const LIA = { nome: "Lia", email: "lia@produtora.com" };

test("sem conta, sem nuvem: nenhum balão", () => {
  assert.deepEqual(pendencias({ zro: { estado: "?", pessoa: null }, nuvem: false, usuario: null, sync: { status: "off" } }), {});
  assert.deepEqual(pendencias({ zro: { estado: "fora", pessoa: null } }), {}, "não ter entrado não é pendência");
});

test("entrou com acesso: nada", () => {
  assert.deepEqual(pendencias({ zro: { estado: "dentro", pessoa: { ...LIA, acesso: true } } }), {});
});

test("entrou sem acesso ao TPeasy: um balão em Ajustes", () => {
  const r = pendencias({ zro: { estado: "dentro", pessoa: { ...LIA, acesso: false } } });
  assert.deepEqual(r, { ajustes: { n: 1, t: "Sua conta ainda não tem acesso ao TPeasy" } });
});

test("sincronização com erro só conta com a nuvem ligada e alguém dentro", () => {
  assert.deepEqual(pendencias({ nuvem: false, usuario: { email: "a@b" }, sync: { status: "error" } }), {});
  assert.deepEqual(pendencias({ nuvem: true, usuario: null, sync: { status: "error" } }), {});
  const r = pendencias({ zro: { estado: "dentro", pessoa: { ...LIA, acesso: false } }, nuvem: true, usuario: { email: "a@b" }, sync: { status: "error" } });
  assert.equal(r.ajustes.n, 2);
  assert.match(r.ajustes.t, /Erro ao sincronizar/);
});

test("Roteiros e Teleprompter nunca ganham balão", () => {
  const r = pendencias({ zro: { estado: "dentro", pessoa: { ...LIA, acesso: false } }, nuvem: true, usuario: {}, sync: { status: "error" } });
  assert.deepEqual(Object.keys(r), ["ajustes"]);
});

test("número e rótulo do balão", () => {
  assert.equal(numeroBalao(100), "99+");
  assert.equal(numeroBalao(5), "5");
  assert.equal(rotuloBalao(2), "2 pendências");
});
