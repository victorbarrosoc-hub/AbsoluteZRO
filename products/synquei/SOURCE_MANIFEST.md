# SOURCE_MANIFEST — Synquei

Cópia controlada (PRD §6.2). O original continua sendo a fonte de produção; esta pasta não é deploy.

| Campo | Valor |
| --- | --- |
| Repositório de origem | https://github.com/victorbarrosoc-hub/synquei |
| Branch | `main` |
| Commit | `a5ac3f1dfd944e80c883fe80137fa3b97d409a19` |
| Data do commit | 2026-10-24T21:31:49-03:00 |
| Subpasta copiada | `/` |
| Visibilidade da origem | público |
| Licença | sem arquivo de licença; código do titular |
| Stack | Site + app em HTML/CSS/módulos ES sem build; desktop Electron 44 (desktop/) com ponte para o DaVinci Resolve Studio |
| Estratégia no HUB (PRD §6.2 a–d) | (c) adaptador: manifest validado → plano de organização (dry-run) no formato de pastas do Synquei; (d) app original separado |
| Cópia feita em | 2026-10-25T01:53:23.061Z |
| `git status` do original | inalterado antes e depois da cópia (limpo) |

Método: `git archive HEAD` do clone de leitura (só arquivos versionados) → `source/`, mais o saneamento abaixo.
Para atualizar: `node scripts/snapshot-product.mjs synquei <clone-do-original>`.

## Removido da cópia

- nada

## Trocado na cópia (saneamento)

- nada

## Observações

- `desktop/organizador.cjs` já consome o `descargas.jsonl` do SOBEDESCE. O HUB valida o mesmo contrato antes de propor qualquer organização.
- `scripts/release.mjs limpar` usa a API de Releases só dentro do CI do original; workflows em products/ não rodam.
