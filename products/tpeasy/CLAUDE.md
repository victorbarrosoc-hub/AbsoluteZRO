# TPeasy — regras para Claude Code

Leia antes: as regras da raiz ([../../CLAUDE.md](../../CLAUDE.md)), o [README](README.md) e os contratos
[maestro-tpeasy.md](../../docs/integration-contracts/maestro-tpeasy.md) e
[tpeasy-leituras.md](../../docs/integration-contracts/tpeasy-leituras.md). O código e os testes prevalecem.

## O que é

Teleprompter para iPhone que roda no Safari e se instala na Tela de Início (PWA), **sem build e sem dependências**:
HTML, CSS e módulos ES servidos como estão. Endereço principal `tpeasy.absolutezro.com`; o `tpeasy.vercel.app` segue
valendo (ver Proibições). Projeto Vercel `tpeasy`, Root Directory = esta pasta. App de computador em `desktop/`
(pacote próprio, com o próprio README).

## Proibições

- **Nada de build, framework ou `package.json` no site.** Funções da Vercel em `api/zro/` só com módulos do Node.
- **Roteiro é do aparelho.** Nunca apagar nem sobrescrever texto sem guardar: versão nova do Maestro com mudança local
  vira cópia (`app/js/entregas.js`). Sincronização na nuvem segue desligada (`app/js/sync.js`).
- **Não redirecionar `tpeasy.vercel.app` antes de existir o caminho para levar os roteiros**: `localStorage` é por
  endereço e o redirecionamento sumiria com os roteiros de quem instalou lá.
- **Token do HUB nunca na página**: fica cifrado no cookie `tp_zro_hub` (só `/api/zro`); as funções repassam.
- **Registro de leituras sem dado pessoal**: só tempos, nomes de bloco e o roteiro (`tpeasy.leituras/1`). Mudou o
  formato → versão nova do contrato (`packages/media-contracts/src/tpeasy.ts` + `npm run contracts:export` na raiz).
- Não fingir: o TPeasy não sabe qual take ficou bom nem casa clipe com bloco; isso é do Synquei, com o bip.

## Como funciona

- `app/js/`: `main.js` (entrada), `views.js` (telas), `prompter.js` (TP e o registro de cada leitura), `data.js`
  (roteiros, perfis e leituras no `localStorage`), `leituras.js` (registro, puro), `entregas.js`/`maestro.js` (roteiros
  do Maestro), `zro.js`/`z.js`/`set.js` (conta, a Z e o Set).
- `api/zro/`: `entrar`, `callback`, `eu`, `sair`, `ia` (Z), `set` (Set) e `entregas` (caixa de roteiros do Maestro).
- Mudou arquivo do app → suba a versão do cache em `sw.js` (`tpeasy-vN`, o teste confere) e liste o arquivo novo em
  `FILES`.
- Interface: padrão Apple da raiz, pouco texto (o resto vai em `title`), "reduzir movimento" respeitado.

## Antes de entregar

`node --test tests/*.test.mjs` aqui; na raiz, o que o `CLAUDE.md` pede quando mexer no HUB ou em contrato. Atualize
`docs/roadmap.md` e `docs/validation.md`.
