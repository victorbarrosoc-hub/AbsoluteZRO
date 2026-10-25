# SOURCE_MANIFEST — NOSSOM

Cópia controlada (PRD §6.2). O original continua sendo a fonte de produção; esta pasta não é deploy.

| Campo | Valor |
| --- | --- |
| Repositório de origem | https://github.com/victorbarrosoc-hub/nossom |
| Branch | `main` |
| Commit | `f04e517fa99e5fa3756ef4d3fab166f37d3f37ff` |
| Data do commit | 2026-10-24T20:09:36-03:00 |
| Subpasta copiada | `/` |
| Visibilidade da origem | público |
| Licença | sem arquivo de licença; THIRD_PARTY_NOTICES.md preservado |
| Stack | Next.js 16 + React 19, Supabase (contas/cotas), RunPod Serverless, Stripe, Electron (desktop/) |
| Estratégia no HUB (PRD §6.2 a–d) | (d) link externo com conta própria; (c) contrato `edit.timeline.ready` → NOSSOM especificado, sem chamada às APIs do original |
| Cópia feita em | 2026-10-25T01:53:23.239Z |
| `git status` do original | inalterado antes e depois da cópia (limpo) |

Método: `git archive HEAD` do clone de leitura (só arquivos versionados) → `source/`, mais o saneamento abaixo.
Para atualizar: `node scripts/snapshot-product.mjs nossom <clone-do-original>`.

## Removido da cópia

- nada

## Trocado na cópia (saneamento)

- `.env.example: referência ao projeto Supabase de produção do original`
- `docs/supabase-setup.md: referência ao projeto Supabase de produção do original`

## Observações

- O áudio dos usuários fica no dispositivo (IndexedDB) e o HUB não recebe áudio; ver products/nossom/source/docs/architecture.md.
- Cotas atômicas (advisory lock + idempotência por request_id) e eventos fora de ordem da assinatura foram usados como referência em infra/migrations.
