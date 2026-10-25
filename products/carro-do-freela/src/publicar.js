#!/usr/bin/env node
/**
 * PUBLICAR — APOSENTADO EM 25/OUT, e não por acaso.
 *
 * Até aqui este script gerava os sete anônimos, espelhava o fonte em `app/`
 * e dava push no repositório antigo (`carrodofreela-app`), que a Vercel
 * publicava. Desde 25/out o fonte oficial mora no repositório AbsoluteZRO,
 * em `products/carro-do-freela` (ADR 0013), e o repositório antigo fica
 * arquivado: empurrar para lá não publica mais nada — e não deve.
 *
 * Quem publica agora é a própria Vercel: o projeto `carrodofreela-app` lê
 * esta pasta (Root Directory) e roda `node src/vercel-build.js`, que tem as
 * mesmas travas que moravam aqui (selo da lista fictícia, anonimato, zero
 * telefone, tags da tela de início, mídia completa) e calcula a CSP do que
 * acabou de gerar. Para pôr no ar: PR neste repositório, mesclado na main.
 *
 * Para conferir na máquina, sem publicar nada:
 *   node src/vercel-build.js        gera .vercel/output como a Vercel gera
 *   node src/blindar.js .vercel/output/static   prova a CSP num Chromium
 */
console.error('\n  publicar.js está aposentado: o Carro do Freela publica pela Vercel a partir do repositório AbsoluteZRO.'
  + '\n  Para conferir o que iria ao ar, rode `node src/vercel-build.js`. Nada foi enviado.\n');
process.exit(1);
