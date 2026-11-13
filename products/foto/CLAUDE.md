# Plataforma de fotos (id `foto`) — regras para Claude Code

Decupagem, revelação RAW e predefinições, no aparelho (ADR 0044). As regras do `CLAUDE.md` da raiz valem aqui; este
arquivo só acrescenta. O contrato entre os módulos é [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md): mudou um contrato,
mude lá primeiro.

## O que não se negocia

- **Fechado.** O app não está lançado: sem a claim `zro_release.foto` (`allowed` ou `released`), só a página neutra.
  Nome, ícone, manifesto, OG, telas e núcleo saem **só** pelas funções `api/pagina.js` e `api/recurso.js`, depois do
  gate. O `publico/` leva só o que não tem marca (fontes, bibliotecas de terceiros, modelos, `robots.txt`, `404.html`).
  Sem `ZRO_CLIENT_ID`/`ZRO_CLIENT_SECRET`, tudo fechado. Abrir é migration do HUB, com o titular; não existe variável
  local de abertura.
- **O nome mora em `app/nome.js`** (`NOME`, `ASSINATURA`, `MOTOR`, `NOTA`) e em nenhum outro arquivo. HTML e manifesto
  levam `%NOME%` e `%ASSINATURA%`, trocados pelo servidor. O id técnico `foto` (pasta, schema, cookies, cliente
  `foto-web`) não muda quando o nome mudar.
- **A foto não sai do aparelho.** Ler, decupar, revelar e exportar rodam no navegador. Só sobe a prévia reduzida de uma
  galeria que a pessoa mandou publicar.
- **Nada é movido, renomeado nem apagado**; grava só o que a pessoa pede.
- **Não fingir.** Sinal não medido não aparece; camada de visão que não carregou aparece como indisponível
  (`/modelos.json` diz o que veio no build).
- **Rosto é dado sensível**: detectar rosto e olho fechado roda local e não identifica ninguém.
- Repositório público: nenhuma foto de cliente, RAW privado, token ou `.env`. `.amostras/` e `.modelos/` ficam fora do git.

## Como está montado

| Pasta | O que é |
| --- | --- |
| `src/` | núcleo ESM sem DOM (Node e navegador). O navegador importa direto de `/src/...`, pelo gate |
| `app/` | telas (Preact + htm, sem build). `index.html` é a casca; `principal.js` é a entrada |
| `api/` | funções Vercel: login único (`_zro.js`, `zro/*`), gate (`pagina.js`, `recurso.js`), banco (`_banco.js`, `_rota.js`) |
| `db/migrations/` | schema `foto`. Arquivo novo para mudar; o migrador recusa arquivo aplicado que mudou |
| `vendor/` | bibliotecas pequenas versionadas (LibRaw WASM, typed-cstruct, Preact, htm), geradas por `npm run vendor` |
| `publico/` | saída do build (fora do git) |

- **Imports de biblioteca sempre por caminho relativo** a `/vendor` (`../vendor/preact/preact.mjs`): a CSP não aceita
  import map nem script inline. Biblioteca nova entra em `scripts/vendor.mjs` (com licença) e nunca é editada à mão.
- **LibRaw**: LGPL-2.1 eleita. `vendor/libraw/libraw.wasm` é o arquivo do pacote, sem alteração; versão, sha256 e
  endereço do fonte ficam em `vendor/README.md` (gerado). Sem código GPL no núcleo.
- **MediaPipe** (~30 MB) e **modelos** (~15 MB) não entram no git: `publicar.mjs` copia o MediaPipe de `node_modules`
  (por isso ele está em `dependencies`) e os modelos de `.modelos/`. `modelos.json` tem endereço oficial com versão fixa
  (`/1/`), tamanho e sha256; modelo novo = nome de arquivo novo.
- **Cache**: `/fontes`, `/vendor` e `/modelos` saem com cache imutável de um ano. Trocou a versão de uma biblioteca,
  troque também o nome da pasta ou do arquivo, senão o navegador de quem já abriu fica com a antiga.
- **Cabeçalhos** só no `vercel.json` (o servidor local lê de lá). COOP `same-origin` e **sem COEP**, de propósito: ele
  barraria o quadro do Drive depois. Logo, sem `SharedArrayBuffer`: WASM de uma thread.
- **Tema**: claro é o padrão. A escolha fica no cookie `foto_tema` e o servidor já escreve `data-tema` no `<html>`
  (sem piscar, sem script inline). Use `tema` de `app/principal.js`.
- **Banco**: rota de pessoa só por `rota()` (`api/_rota.js`) → `comoPessoa` (papel `foto_app`, RLS). Pessoa e
  organização vêm da sessão, nunca do pedido. Toda tabela nova com RLS e teste de isolamento.
- O modo local (`FOTO_LOCAL=1`) é só para desenvolver: liga só sem login configurado e em localhost.
- Português, textos curtos. Código sem ponto e vírgula, aspas simples, 2 espaços.

## Rodar e testar

```
npm ci                      # uma vez
npm run modelos             # baixa os modelos de visão para .modelos/ (confere o sha256)
node scripts/amostras.mjs   # baixa as 12 amostras RAW CC0 do raw.pixls.us para .amostras/ (confere o sha256)
npm run dev                 # monta publico/ e abre http://localhost:8094 em modo local
npm test                    # node --test: núcleo, gate, login, banco (Postgres temporário) e Chromium
node --test test/fechado.test.js   # um módulo só
FOTO_DATABASE_URL=… npm run migrar # aplica db/migrations no banco (papel dono `foto`)
npm run vendor              # refaz vendor/ depois de mudar a versão de uma biblioteca
```

Teste que precisa de modelo (`.modelos/`), Postgres ou Chromium pula com mensagem; com `FOTO_EXIGIR=1` (CI) a falta
vira falha. Amostra RAW (`.amostras/`, e `.amostras/titular/` com os arquivos do titular, que nunca saem da máquina) só
é exigida com `FOTO_EXIGIR_AMOSTRAS=1`: o CI não baixa por padrão, para não depender de site de terceiros (o workflow
tem a opção manual `amostras`). Antes de entregar: `npm test` nesta pasta e `node scripts/scan-secrets.mjs` na raiz.

## Depende do titular (nada disso foi feito)

- Nome definitivo (hoje provisório, em `app/nome.js`) e busca de marca.
- Projeto Vercel (Root Directory `products/foto`) e o domínio `foto.absolutezro.com` (ou `FOTO_SITE` com outro).
- Schema `foto` e papéis `foto` (login) e `foto_app` no Supabase `AbsoluteZRO`; `FOTO_DATABASE_URL` na Vercel.
- Cliente OIDC `foto-web` no console do HUB (`ZRO_CLIENT_ID`, `ZRO_CLIENT_SECRET` só na Vercel) e a migration do
  catálogo com o gate fechado.
- Bucket das prévias de galeria (só existe depois de autorizado) e qualquer deploy.
