// A hora do dia da luz ambiente, do relógio e da saudação (src/lib/hora.ts): puro.
import assert from "node:assert/strict";
import { test } from "node:test";
import { horaNoBrasil, luzDaHora, rotuloDoRelogio, saudacaoDaHora } from "../src/lib/hora";

test("a luz troca de tom com a hora", () => {
  const tons = Array.from({ length: 24 }, (_, h) => luzDaHora(h));
  assert.deepEqual(tons.slice(0, 5), Array(5).fill("noite"));
  assert.deepEqual(tons.slice(5, 12), Array(7).fill("manha"));
  assert.deepEqual(tons.slice(12, 17), Array(5).fill("tarde"));
  assert.deepEqual(tons.slice(17, 19), ["fim", "fim"]);
  assert.deepEqual(tons.slice(19), Array(5).fill("noite"));
});

test("relógio e saudação", () => {
  assert.equal(rotuloDoRelogio(10, 42), "Manhã · 10:42");
  assert.equal(rotuloDoRelogio(15, 5), "Tarde · 15:05");
  assert.equal(rotuloDoRelogio(21, 0), "Noite · 21:00");
  assert.equal(rotuloDoRelogio(3, 9), "Madrugada · 03:09");
  assert.equal(saudacaoDaHora(4), "Boa noite");
  assert.equal(saudacaoDaHora(5), "Bom dia");
  assert.equal(saudacaoDaHora(12), "Boa tarde");
  assert.equal(saudacaoDaHora(18), "Boa noite");
});

test("hora do Brasil como padrão do servidor", () => {
  // 13:30 UTC = 10:30 em São Paulo (sem horário de verão desde 2019)
  assert.equal(horaNoBrasil(new Date("2026-10-28T13:30:00Z")), 10);
  assert.equal(horaNoBrasil(new Date("2026-10-28T02:10:00Z")), 23);
});
