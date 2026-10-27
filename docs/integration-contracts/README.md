# Contratos de integração

- [openapi.yaml](openapi.yaml): API do HUB (teste garante que toda rota está documentada).
- [schemas/](schemas): JSON Schema gerado de `packages/media-contracts` (`npm run contracts:export`; teste de deriva).

| Contrato                        | Versão                                        | Produtor → consumidor                                      |
| ------------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| `zro-project`                   | v1                                            | HUB                                                        |
| `zro-media-manifest`            | 1.0                                           | SOBEDESCE (via adaptador) → HUB → Synquei                  |
| `zro-organization-plan`         | 1.0                                           | HUB (adaptador Synquei), sempre `dry_run`, `moves` vazio   |
| `zro-timeline-ref`              | 0.1                                           | Synquei / AI Edit → NOSSOM → Finishing (proposta)          |
| `zro-event-envelope` + payloads | v1                                            | todos (tabela em `packages/media-contracts/src/events.ts`) |
| `carro-do-freela.job`           | v1 (proposto)                                 | Carro do Freela → HUB                                      |
| `tpeasy.backup`                 | v1 (existente no TPeasy)                      | TPeasy ↔ HUB                                               |
| `sobedesce.descargas.jsonl`     | v1 (existente no SOBEDESCE)                   | SOBEDESCE → HUB/Synquei                                    |
| `zro-pedido+jwt` (Drive da Z)   | v1 ([sobedesce-drive.md](sobedesce-drive.md)) | HUB → SOBEDESCE                                            |

Regras: payload mínimo (IDs e resumos, sem mídia nem dados pessoais), `idempotency_key` obrigatória, mudança
incompatível = nova versão.
