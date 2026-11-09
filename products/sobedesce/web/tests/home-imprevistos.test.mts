/**
 * Página inicial › "E se…" (09/11/2026): os imprevistos do cartão que o app de computador resolve. Cada frase tem de
 * bater com o que o app faz (docs/BACKUP-AUTOMATICO.md e src/backup/imprevistos.js); nada de número inventado.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ler = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("a seção E se… está na página inicial, logo depois de Entre aparelhos, com seis casos curtos", () => {
  const pagina = ler("app/page.tsx");
  assert.match(pagina, /<AparelhosSection \/>\s*<ImprevistosSection \/>/);
  const secao = ler("components/home/imprevistos-section.tsx");
  const titulos = [...secao.matchAll(/titulo: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(titulos, [
    "O cartão saiu no meio.",
    "O mesmo cartão, de novo.",
    "A bateria acabou gravando.",
    "A câmera zerou a numeração.",
    "O HD desconectou.",
    "Fechou tudo no meio da cópia.",
  ]);
  for (const m of secao.matchAll(/texto: "([^"]+)"/g)) assert.ok(m[1].length <= 80, `uma linha só: ${m[1]}`);
  assert.doesNotMatch(secao, /\d+\s*(GB|MB|min|s)\b/, "nenhum número de velocidade sem medição");
});
