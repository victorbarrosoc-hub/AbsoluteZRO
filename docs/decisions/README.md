# Decisões de arquitetura (ADRs)

Cada decisão é reversível salvo indicação. Formato: contexto, decisão, consequências, como reverter.

| #                                      | Decisão                                                        | Estado   |
| -------------------------------------- | -------------------------------------------------------------- | -------- |
| [0001](0001-repositorio-e-monorepo.md) | Repositório AbsoluteZRO como monorepo npm workspaces           | aceita   |
| [0002](0002-autenticacao-propria.md)   | Conta central própria do HUB (sem Supabase Auth)               | aceita   |
| [0003](0003-rls-com-papel-restrito.md) | RLS com papel `zro_app` e contexto por transação               | aceita   |
| [0004](0004-copia-dos-produtos.md)     | Cópia controlada dos produtos e estratégia por produto         | aceita   |
| [0005](0005-quotas-e-limites.md)       | Quotas mensais, maior limite vence, sem limite = bloqueado     | aceita   |
| [0006](0006-timeline.md)               | Timeline por referência (OTIO e cia.), sem prometer fidelidade | proposta |
| [0007](0007-cobranca-neutra.md)        | Webhook neutro assinado até escolher provedor                  | aceita   |
| [0008](0008-identidade-visual.md)      | IDV oficial da Absolute ZRO e tema escuro padrão               | aceita   |
| [0009](0009-admin-no-mesmo-app.md)     | Console de administração isolado dentro do hub-web             | aceita   |
| [0010](0010-fila-no-postgres.md)       | Fila e outbox no próprio Postgres                              | aceita   |
| [0011](0011-linguagem-da-familia.md)   | Interface na linguagem das ferramentas da família (suíte)      | aceita   |
