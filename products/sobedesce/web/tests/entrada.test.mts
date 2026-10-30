/**
 * Entrada da área logada (titular, 29/10/2026; Plano de Integração §7–8: "a tarefa principal do aplicativo vem
 * primeiro"): quem entra sem pedir página cai em /conta, nunca na Z. A Z fica num anel discreto no cabeçalho
 * (components/conta/abas.tsx › LinkZ) e /z segue valendo como link direto.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { destinoDeEntrada, INICIO, voltaSegura } from "../src/lib/auth/volta";

const ler = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("quem só entrou cai na conta; quem pediu /z volta para a Z", () => {
  assert.equal(INICIO, "/conta");
  assert.equal(destinoDeEntrada(voltaSegura(undefined)), "/conta");
  assert.equal(destinoDeEntrada("/conta"), "/conta");
  assert.equal(destinoDeEntrada(voltaSegura("/z")), "/z", "link direto continua valendo");
});

test("a Z não é aba: a conta não tem as abas e o cabeçalho tem o anel discreto", () => {
  const conta = ler("app/(conta)/conta/page.tsx");
  assert.doesNotMatch(conta, /AbasConta/);
  const menu = ler("components/conta/menu.tsx");
  assert.match(menu, /<LinkZ atual=\{naZ\} \/>/);
  // a ação principal (Enviar) vem antes do anel da Z
  assert.ok(menu.indexOf('href="/app/"') < menu.indexOf("<LinkZ"));
  const abas = ler("components/conta/abas.tsx");
  assert.doesNotMatch(abas, /export function AbasConta/);
  assert.match(abas, /export function LinkZ/);
  const z = ler("app/(conta)/z/page.tsx");
  assert.match(z, /<VoltarConta \/>/);
});
