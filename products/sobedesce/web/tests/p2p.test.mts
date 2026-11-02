/**
 * Wi-Fi celular ↔ computador/celular descontinuado (titular, 02/11/2026). As rotas /api/p2p/* existem só para os apps
 * antigos: 503 na hora, sem sessão nem banco, com Retry-After. O app antigo trata como falha e recua (celular até 30 s,
 * computador até 60 s; test/celular-p2p-antigo.test.js reproduz os dois laços).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

describe("p2p descontinuado", () => {
  test("espera, aparelhos e sinal: 503 na hora, sem login, com Retry-After de 2 min", async () => {
    const espera = await import("../src/app/api/p2p/espera/route");
    const aparelhos = await import("../src/app/api/p2p/aparelhos/route");
    const sinal = await import("../src/app/api/p2p/sinal/route");
    const inicio = Date.now();
    for (const r of [espera.GET(), aparelhos.GET(), sinal.POST()]) {
      assert.equal(r.status, 503, "não 401: o computador antigo não sai da conta");
      assert.equal(r.headers.get("retry-after"), "120");
      assert.equal(r.headers.get("cache-control"), "no-store");
      const b = await r.json();
      assert.equal(b.erro, "p2p_descontinuado");
      assert.equal(b.proxima_em, 120_000);
    }
    assert.ok(Date.now() - inicio < 500, "não segura a função");
  });

  test("as rotas não importam banco nem sessão", async () => {
    const { readFileSync } = await import("node:fs");
    for (const r of ["espera", "aparelhos", "sinal"]) {
      const src = readFileSync(new URL(`../src/app/api/p2p/${r}/route.ts`, import.meta.url), "utf8");
      assert.doesNotMatch(src, /@\/lib\/db|@\/lib\/auth|maxDuration/, r);
    }
  });
});
