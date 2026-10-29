// Tela de entrada (decisão do titular, 29/10/2026): /app abre sempre no Hoje; a Z não é a primeira aba nem a da barra
// do celular, fica num ícone discreto (src/lib/entrada.ts, src/lib/navegacao.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ENTRADA } from "../src/lib/entrada";
import { ABAS, BARRA, GRUPOS, Z } from "../src/lib/navegacao";

test("/app abre no Hoje (a volta do login)", () => {
  assert.equal(ENTRADA, "/app/hoje");
  const site = readFileSync(new URL("../src/lib/site.ts", import.meta.url), "utf8");
  assert.match(site, /app: "\/app",/);
  const pagina = readFileSync(new URL("../src/app/(app)/app/page.tsx", import.meta.url), "utf8");
  assert.match(pagina, /exigirAcessoNaPagina\("\/app"\)/);
  assert.match(pagina, /redirect\(ENTRADA\)/);
});

test("a Z não é a primeira: fora dos grupos e da barra do celular, por último na ordem", () => {
  assert.equal(ABAS[0].href, "/app/hoje");
  assert.equal(ABAS[ABAS.length - 1], Z);
  assert.ok(!GRUPOS.some((g) => g.abas.some((a) => a.href === "/app/z")));
  assert.deepEqual(
    BARRA.map((a) => a.href),
    ["/app/hoje", "/app/quadro", "/app/aprovacoes", "/app/mais"],
  );
});
