// Tela de entrada (decisão do titular, 28/10/2026): a Z continua a primeira aba, mas quem entra em /app com card seu em
// produção ou revisão abre no Quadro (src/lib/entrada.ts, src/app/(app)/app/page.tsx).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { entradaDoMaestro, ENTRADA_QUADRO, ENTRADA_Z, temTarefaEmAndamento } from "../src/lib/entrada";
import type { ColunaKey, DadosCard } from "../src/lib/quadro/metodo";

const EU = "pessoa-eu";
const card = (coluna: ColunaKey, extra: Partial<DadosCard> = {}) => ({ dados: { tema: "x", coluna, ...extra } as DadosCard });

test("sem card seu em andamento: entra na Z", () => {
  assert.equal(entradaDoMaestro([], EU), ENTRADA_Z);
  const outros = [
    card("pauta", { resp: EU }),
    card("afazer", { resp: EU }),
    card("aprovacao", { resp: EU }),
    card("entregue", { resp: EU }),
    card("fazendo", { resp: "outra" }),
    card("fazendo"),
  ];
  assert.equal(entradaDoMaestro(outros, EU), ENTRADA_Z);
});

test("card seu em Fazendo ou Revisão: entra no Quadro", () => {
  assert.equal(entradaDoMaestro([card("fazendo", { resp: EU })], EU), ENTRADA_QUADRO);
  assert.equal(entradaDoMaestro([card("pauta"), card("revisao", { resp: EU })], EU), ENTRADA_QUADRO);
});

test("card apagado não conta", () => {
  assert.equal(temTarefaEmAndamento([card("fazendo", { resp: EU, apagadoEm: "2026-10-28T10:00:00Z" })], EU), false);
});

test("a Z segue a primeira aba; /app é a entrada do login", () => {
  const nav = readFileSync(new URL("../src/lib/navegacao.ts", import.meta.url), "utf8");
  assert.ok(nav.indexOf('href: "/app/z"') >= 0 && nav.indexOf('href: "/app/z"') < nav.indexOf('href: "/app/quadro"'));
  const site = readFileSync(new URL("../src/lib/site.ts", import.meta.url), "utf8");
  assert.match(site, /app: "\/app",/);
  const pagina = readFileSync(new URL("../src/app/(app)/app/page.tsx", import.meta.url), "utf8");
  assert.match(pagina, /exigirAcessoNaPagina\("\/app"\)/);
  assert.match(pagina, /redirect\(entradaDoMaestro\(cards, sessao\.sub\)\)/);
});
