# TPeasy — regras para Claude Code

Leia antes: as regras da raiz ([../../CLAUDE.md](../../CLAUDE.md)), o [README](README.md) e o contrato
[tpeasy-leituras.md](../../docs/integration-contracts/tpeasy-leituras.md). O código e os testes prevalecem.

## O que é

Teleprompter para iPhone que roda no Safari e se instala na Tela de Início (PWA), **sem build e sem dependências**:
HTML, CSS e módulos ES servidos como estão. Endereço oficial **`tpeasy.absolutezro.com`** (ADR 0025, titular em
29/10/2026); o `tpeasy.vercel.app` segue valendo (ver Proibições). Projeto Vercel `tpeasy`, Root Directory = esta pasta.

## Proibições

- **Nada de build, framework ou `package.json`.** Funções da Vercel em `api/zro/` só com módulos do Node.
- **Roteiro é do aparelho.** O TPeasy nunca apaga nem sobrescreve texto sem guardar: versão nova da Absolute ZRO com
  mudança local vira cópia "(do aparelho)" (`app/js/hub.js`). Sincronização na nuvem segue desligada.
- **Não redirecionar `tpeasy.vercel.app` antes de existir o caminho para levar os roteiros.** `localStorage` é por
  endereço: o redirecionamento sumiria com os roteiros de quem instalou lá.
- **Token do HUB nunca na página**: fica cifrado no cookie `tp_zro_hub` (só `/api/zro`); as funções repassam.
- **Registro de leituras sem dado pessoal**: só tempos, nomes de bloco e o roteiro (`tpeasy.leituras/1`). Mudou o
  formato → versão nova do contrato (`packages/media-contracts/src/tpeasy.ts` + `npm run contracts:export` na raiz).
- Não fingir: o TPeasy não sabe qual take ficou bom nem casa clipe com bloco; isso é do Synquei, com o bip.

## Como funciona

- `app/js/`: `main.js` (entrada), `views.js` (telas), `prompter.js` (TP), `data.js` (roteiros, perfis, leituras no
  `localStorage`), `leituras.js` (registro, puro), `hub.js` ("Abrir no TPeasy", puro + busca), `entrada.js` (aba
  inicial), `zro.js`/`z.js` (conta e a Z).
- `api/zro/`: `entrar`, `callback`, `eu`, `sair`, `ia` (repasse da Z) e `roteiro` (repasse do roteiro do projeto).
  Escopos pedidos em `_zro.mjs` (`ESCOPOS`); escopo novo precisa estar no cliente `tpeasy-web` do HUB (migração).
- Mudou arquivo do app → suba a versão do cache em `sw.js` (`tpeasy-vN`) e liste o arquivo novo em `FILES`.
- Interface: padrão Apple da raiz, pouco texto (o resto vai em `title`), "reduzir movimento" respeitado.

## Antes de entregar

`node --test tests/*.test.mjs` aqui; na raiz, o que o `CLAUDE.md` pede quando mexer no HUB ou em contrato. Atualize
`docs/roadmap.md` e `docs/validation.md`.
