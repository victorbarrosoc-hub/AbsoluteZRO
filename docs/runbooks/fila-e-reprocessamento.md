# Runbook — fila, falhas e reprocessamento

| Situação                    | O que significa                                                                    | O que fazer                                                    |
| --------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `queued` com tentativas > 0 | Falha temporária, vai tentar de novo (backoff até 15 min)                          | Esperar; ver `last_error`                                      |
| `dead_letter`               | Esgotou as tentativas                                                              | Corrigir a causa; "Repetir" em Atividades (cria nova execução) |
| `requires_review`           | Efeito externo pode ter acontecido, ou worker caiu no meio de algo não idempotente | Conferir no destino; só então "Repetir"                        |
| `blocked`                   | Organização sem a ferramenta ou sem quota na hora de executar                      | Contratar/conceder ou configurar limite; "Repetir"             |
| `failed`                    | Erro definitivo (ex.: manifest inválido)                                           | Corrigir a origem e importar de novo                           |

- Execuções presas em `running` além de `ZRO_WORKER_LEASE_MS` são recuperadas pelo worker: idempotentes voltam para a
  fila; as outras vão para revisão.
- "Repetir" duas vezes na mesma execução devolve a mesma nova execução (sem duplicar).
- Console da plataforma lista as execuções paradas de todas as organizações.
