# SOURCE_MANIFEST — TPeasy

Cópia controlada (PRD §6.2). O original continua sendo a fonte de produção; esta pasta não é deploy.

| Campo | Valor |
| --- | --- |
| Repositório de origem | https://github.com/victorbarrosoc-hub/tpeasy |
| Branch | `main` |
| Commit | `dfa91e30c6865e2f4e7501ad6c4d0d2fcf43d330` |
| Data do commit | 2026-10-20T00:12:34-03:00 |
| Subpasta copiada | `/` |
| Visibilidade da origem | privado (cópia autorizada pelo titular em 25/10/2026 para o repositório público AbsoluteZRO) |
| Licença | sem arquivo de licença; código proprietário do titular |
| Stack | PWA em HTML/CSS/módulos ES, sem build; Supabase opcional (desligado: SUPABASE_URL vazio em app/js/config.js) |
| Estratégia no HUB (PRD §6.2 a–d) | (d) link externo + (c) adaptador de roteiro (backup JSON `app: "tpeasy", version: 1`) |
| Cópia feita em | 2026-10-25T01:53:22.699Z |
| `git status` do original | inalterado antes e depois da cópia (limpo) |

Método: `git archive HEAD` do clone de leitura (só arquivos versionados) → `source/`, mais o saneamento abaixo.
Para atualizar: `node scripts/snapshot-product.mjs tpeasy <clone-do-original>`.

## Removido da cópia

- nada

## Trocado na cópia (saneamento)

- nada

## Observações

- Nenhuma credencial no código: `app/js/config.js` já vem com SUPABASE_URL e SUPABASE_KEY vazios.
- O modelo do roteiro (id, title, body com marcações `# bloco`, `[pausa]`, `**ênfase**`, `((nota))`, fav, target) é o contrato usado por packages/integrations/src/tpeasy.ts.
