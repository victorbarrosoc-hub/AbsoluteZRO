# SOURCE_MANIFEST — SOBEDESCE

Cópia controlada (PRD §6.2). O original continua sendo a fonte de produção; esta pasta não é deploy.

| Campo | Valor |
| --- | --- |
| Repositório de origem | https://github.com/victorbarrosoc-hub/baixadordodrive |
| Branch | `main` |
| Commit | `21f3a638dce0d3d87917547087fc51b0bfffb6c8` |
| Data do commit | 2026-10-24T15:41:42-03:00 |
| Subpasta copiada | `/` |
| Visibilidade da origem | público |
| Licença | MIT (package.json); avisos de terceiros preservados nos arquivos copiados |
| Stack | Electron 44 + Node (desktop, src/), Preact (public/), site Next.js 16 + Drizzle + Postgres/PGlite (web/) |
| Estratégia no HUB (PRD §6.2 a–d) | (c) adaptador do resumo `.sobedesce/descargas.jsonl` v1 + relatório `SOBEDESCE_copia_*.xxh64` → ZroMediaManifest; (d) app e conta originais seguem separados |
| Cópia feita em | 2026-10-25T01:53:22.932Z |
| `git status` do original | inalterado antes e depois da cópia (limpo) |

Método: `git archive HEAD` do clone de leitura (só arquivos versionados) → `source/`, mais o saneamento abaixo.
Para atualizar: `node scripts/snapshot-product.mjs sobedesce <clone-do-original>`.

## Removido da cópia

- nada

## Trocado na cópia (saneamento)

- nada

## Observações

- O desktop roda local e não passa arquivos por servidor; o HUB só lê o resumo e os relatórios que o SOBEDESCE grava nos destinos.
- O site (web/) tem conta própria (scrypt, sessões com hash sha256, limite de tentativas). O HUB replica esse padrão em packages/auth, com banco novo.
- `.github/workflows/desktop.yml` está dentro de products/: o GitHub só executa workflows da raiz, então ele não roda aqui.
