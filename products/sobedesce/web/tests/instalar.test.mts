/**
 * Os instaladores de uma linha saíram (01/11/2026, decisão do titular: o app se instala só pela central Absolute ZRO):
 * public/instalar.sh e public/instalar.ps1 são um recado que não baixa nem instala nada, com sintaxe válida (curl | bash e
 * irm | iex continuam rodando sem erro de shell), texto UTF-8, e o navegador vai para https://absolutezro.com/baixar.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { describe, test } from "node:test";
import nextConfig from "../next.config";
import { CENTRAL_ZRO } from "../src/lib/site";

const sh = fs.readFileSync(new URL("../public/instalar.sh", import.meta.url), "utf8");
const ps1 = fs.readFileSync(new URL("../public/instalar.ps1", import.meta.url), "utf8");

describe("instalar.sh (Mac)", () => {
  test("sintaxe válida em sh e bash", () => {
    for (const shell of ["sh", "bash"]) {
      const r = spawnSync(shell, ["-n", "public/instalar.sh"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
      assert.equal(r.status, 0, `${shell} -n: ${r.stderr}`);
    }
  });

  test("é só o recado: aponta para a central e não baixa nem instala nada", () => {
    const r = spawnSync("sh", ["public/instalar.sh"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /https:\/\/absolutezro\.com\/baixar/);
    assert.equal(sh.trimEnd().split("\n").at(-1), 'main "$@"');
    const codigo = sh.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n");
    assert.doesNotMatch(codigo, /curl|hdiutil|xattr|baixar\/(mac|versao)|github/);
  });
});

describe("instalar.ps1 (Windows)", () => {
  test("um bloco só, sem exit (com | iex fecharia a janela do PowerShell), só o recado", () => {
    assert.match(ps1, /^& \{$/m);
    assert.equal(ps1.trimEnd().at(-1), "}");
    assert.doesNotMatch(ps1, /^\s*exit\b/im);
    assert.match(ps1, /https:\/\/absolutezro\.com\/baixar/);
    assert.doesNotMatch(ps1.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n"), /irm |Invoke-WebRequest|Start-Process|baixar\/(windows|versao)|github/);
  });
});

describe("site", () => {
  test("os dois scripts saem como texto UTF-8, com cache curto", async () => {
    const regras = await nextConfig.headers!();
    for (const source of ["/instalar.sh", "/instalar.ps1"]) {
      const r = regras.find((x) => x.source === source);
      assert.ok(r, source);
      assert.equal(r.headers.find((h) => h.key === "Content-Type")?.value, "text/plain; charset=utf-8");
      assert.match(r.headers.find((h) => h.key === "Cache-Control")?.value ?? "", /max-age=300/);
    }
  });

  test("no navegador (Accept: text/html), os dois levam para a central Absolute ZRO", async () => {
    const regras = await nextConfig.redirects!();
    for (const source of ["/instalar.sh", "/instalar.ps1"]) {
      const r = regras.find((x) => x.source === source);
      assert.ok(r, source);
      assert.equal(r.destination, CENTRAL_ZRO);
      assert.equal(r.permanent, false);
      assert.deepEqual(r.has, [{ type: "header", key: "accept", value: ".*text/html.*" }]);
    }
  });
});
