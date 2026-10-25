#!/usr/bin/env node
"use strict";
/* Recalcula o selo de src/crew.json.
 *
 * ⚠️ ISTO NÃO É UM PASSO DE ROTINA. O selo existe para que uma troca do
 * seed REPROVE a publicação; rodar este script apaga exatamente esse
 * alarme. Só se usa quando a lista fictícia mudou DE PROPÓSITO — mais
 * cadastros, outra praça, um campo novo.
 *
 * ⚠️ CONFIRA ANTES DE SELAR. O script imprime o que está prestes a selar
 * e pede `--confirmo` para escrever. Selar sem olhar transforma a trava
 * em carimbo: ela passaria a jurar que o arquivo é o aprovado só porque
 * alguém mandou aprovar.
 *
 * Uso:
 *   node src/selar-crew.js              mostra o que mudaria, não escreve
 *   node src/selar-crew.js --confirmo   escreve o selo novo
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const AQUI = __dirname;
const CREW = path.join(AQUI, "crew.json");
const SELO = path.join(AQUI, "crew.selo.json");

const bytes = fs.readFileSync(CREW);
const lista = JSON.parse(bytes);
const sha = crypto.createHash("sha256").update(bytes).digest("hex");

const velho = fs.existsSync(SELO) ? JSON.parse(fs.readFileSync(SELO, "utf8")) : null;

console.log("\nO QUE ESTÁ NO crew.json AGORA");
console.log("  registros : " + lista.length);
console.log("  primeiro  : " + (lista[0] && lista[0].nome));
console.log("  último    : " + (lista[lista.length - 1] && lista[lista.length - 1].nome));
console.log("  sha256    : " + sha);

/* Um telefone no seed é o defeito que a casa mais teme, e ele não depende
   de lista nenhuma para ser detectado — então é conferido aqui também,
   antes de qualquer selo sair. */
const texto = bytes.toString("utf8");
const comFone = /"(fone|telefone|celular|whats\w*)"\s*:/i.test(texto)
  || /\b(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}\b/.test(texto);
if (comFone) {
  console.log("\n\x1b[31m✗ TEM JEITO DE TELEFONE DENTRO DO crew.json. Não vou selar isso.\x1b[0m");
  console.log("  Telefone nunca é versionado nem exibido — é a restrição nº 1 da casa.\n");
  process.exit(1);
}

if (velho) {
  if (velho.sha256 === sha) {
    console.log("\n\x1b[32m✓ O selo já bate. Nada a fazer.\x1b[0m\n");
    process.exit(0);
  }
  console.log("\nO SELO GUARDADO DIZ");
  console.log("  registros : " + velho.registros);
  console.log("  primeiro  : " + velho.primeiro);
  console.log("  sha256    : " + velho.sha256);
  console.log("  selado em : " + velho.selado_em);
  console.log("\n\x1b[33m⚠  O arquivo MUDOU desde o último selo.\x1b[0m");
  console.log("   Antes de confirmar, responda: esta lista é FICTÍCIA?");
  console.log("   Se ela veio de um reset de container, a resposta é não —");
  console.log("   recupere o crew.json do repositório em vez de selar.");
}

if (!process.argv.includes("--confirmo")) {
  console.log("\nNada foi escrito. Para selar: node src/selar-crew.js --confirmo\n");
  process.exit(0);
}

const novo = Object.assign({}, velho || {}, {
  sha256: sha,
  bytes: bytes.length,
  registros: lista.length,
  primeiro: (lista[0] && lista[0].nome) || "",
  ultimo: (lista[lista.length - 1] && lista[lista.length - 1].nome) || "",
  selado_em: new Date().toISOString().slice(0, 10),
});
fs.writeFileSync(SELO, JSON.stringify(novo, null, 2) + "\n");
console.log("\n\x1b[32m✓ Selo atualizado.\x1b[0m Commite src/crew.selo.json junto com o crew.json.\n");
