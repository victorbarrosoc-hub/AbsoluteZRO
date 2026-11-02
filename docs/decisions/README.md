# Decisões de arquitetura (ADRs)

Cada decisão é reversível salvo indicação. Formato: contexto, decisão, consequências, como reverter.

| #                                                | Decisão                                                           | Estado                |
| ------------------------------------------------ | ----------------------------------------------------------------- | --------------------- |
| [0001](0001-repositorio-e-monorepo.md)           | Repositório AbsoluteZRO como monorepo npm workspaces              | aceita                |
| [0002](0002-autenticacao-propria.md)             | Conta central própria do HUB (sem Supabase Auth)                  | aceita                |
| [0003](0003-rls-com-papel-restrito.md)           | RLS com papel `zro_app` e contexto por transação                  | aceita                |
| [0004](0004-copia-dos-produtos.md)               | Cópia controlada dos produtos e estratégia por produto            | substituída pela 0013 |
| [0005](0005-quotas-e-limites.md)                 | Quotas mensais, maior limite vence, sem limite = bloqueado        | aceita                |
| [0006](0006-timeline.md)                         | Timeline por referência (OTIO e cia.), sem prometer fidelidade    | proposta              |
| [0007](0007-cobranca-neutra.md)                  | Webhook neutro assinado até escolher provedor                     | aceita                |
| [0008](0008-identidade-visual.md)                | IDV oficial da Absolute ZRO e tema escuro padrão                  | aceita                |
| [0009](0009-admin-no-mesmo-app.md)               | Console de administração isolado dentro do hub-web                | aceita                |
| [0010](0010-fila-no-postgres.md)                 | Fila e outbox no próprio Postgres                                 | aceita                |
| [0011](0011-linguagem-da-familia.md)             | Interface na linguagem das ferramentas da família (suíte)         | aceita                |
| [0012](0012-login-unico-oidc.md)                 | Login único: HUB como provedor OpenID Connect                     | aceita                |
| [0013](0013-monorepo-como-fonte.md)              | Este repositório é a fonte de todas as plataformas                | aceita                |
| [0014](0014-conta-unica-e-acesso.md)             | Conta única Absolute ZRO e acesso decidido no admin               | aceita                |
| [0015](0015-finishing-resolve-powergrade-lut.md) | Revela (ex-Finishing): só Resolve, cor em PowerGrade e LUT        | aceita                |
| [0016](0016-identidade-revela.md)                | Identidade visual da Revela                                       | aceita                |
| [0019](0019-vendas-stripe.md)                    | Vendas pelo Stripe: avulso + Completo, teste de 7 dias            | aceita                |
| [0020](0020-editor-desktop-custo-zero.md)        | Editor de vídeo: app de desktop, custo zero, IA na máquina        | aceita                |
| [0021](0021-carro-hub-convidado.md)              | Carro → HUB: token de app e o papel convidado                     | aceita                |
| [0022](0022-maestro-no-monorepo.md)              | Maestro nasce no monorepo e se integra pelo projeto canônico      | aceita                |
| [0023](0023-gate-de-lancamento.md)               | Gate de lançamento: fechado é fechado, por conta e por canal      | aceita                |
| [0024](0024-maestro-v2.md)                       | Maestro v2: a produtora inteira, por fases                        | aceita                |
| [0025](0025-dominios-do-ecossistema.md)          | Cada plataforma em `<app>.absolutezro.com`                        | aceita                |
| [0026](0026-conexoes.md)                         | Conexões: o Google Agenda conectado uma vez na conta              | aceita                |
| [0027](0027-lancamento-maestro-beta-gratis.md)   | Lançamento do Maestro em Beta                                     | aceita                |
| [0028](0028-custos-do-ecossistema.md)            | Custos do ecossistema no console, só admin                        | aceita                |
| [0030](0030-relay-conversao.md)                  | Relay: conversão de mídia como setor; Revela fica com a cor       | aceita                |
| [0031](0031-maestro-acesso-por-area.md)          | Maestro: o que cada pessoa vê, por área                           | aceita                |
| [0032](0032-set-presenca-e-conversas.md)         | Set: presença e conversas do ecossistema                          | aceita                |
| [0033](0033-laboratorio-da-z.md)                 | Laboratório da Z: voz, ditado, anexos e configuração, só admin    | aceita                |
| [0034](0034-console-financeiro-e-correio.md)     | Papel Financeiro e Correio (caixas do iCloud) no console          | aceita                |
| [0035](0035-motion-2d-3d.md)                     | Motion 2D e 3D: setor de animação (nome a definir)                | proposta              |
| [0036](0036-central-unica-de-instalacao.md)      | Central única: apps de computador só pela Absolute ZRO            | aceita                |
| [0037](0037-higgsfield-nas-conexoes.md)          | Higgsfield nas Conexões: imagem e vídeo com os créditos da pessoa | aceita                |
| [0038](0038-edicao-automatica.md)                | Edição automática no AEON: modos por tipo de vídeo, na máquina    | aceita                |
