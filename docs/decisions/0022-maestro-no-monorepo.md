# ADR 0022 — Maestro nasce no monorepo e se integra pelo projeto canônico

**Status:** aceita (28/10/2026, decisões do titular)

## Contexto

O Maestro (pauta, aprovação do cliente e projetos para agências e produtoras) existia como repositório próprio, com
Supabase próprio, chave anon no navegador e um documento por cliente que causou perdas de dados. O titular decidiu
**resetar**: o Maestro nasce de novo como plataforma do ecossistema, com o mesmo nome e a mesma logo, e nenhum dado,
banco ou chave migra. O desenho e as decisões estão no PRD de 28/10/2026 (`desenho-maestro`, seções 4 e 5).

## Decisão

- **Casa.** `products/maestro` no monorepo (ADR 0013): `package.json`, testes e regras próprias, projeto Vercel próprio
  (Root Directory = a pasta; `vercel.json` com `git.deploymentEnabled: false` até o titular autorizar projeto,
  domínio `maestro.absolutezro.com` e cliente OIDC `maestro-web`). Nada publicado nesta etapa.
- **Banco.** Schema `maestro` e papel `maestro_app` (sem login, sem BYPASSRLS) no Supabase `AbsoluteZRO`, nunca dentro
  de `zro`. Duas portas (`asUser` com RLS por organização em toda tabela, `with check` inclusive; `asSystem` só para
  sessões, callback do login, link do cliente e migração). Cards só mudam pelas funções `maestro.card_*`; histórico,
  decisões do cliente e auditoria só crescem. Migrador próprio de schema não-`public` (molde do SOBEDESCE).
- **Conta e papéis.** Uma conta Absolute ZRO por pessoa; o Maestro não tem cadastro. A organização do Maestro é a
  organização da Absolute ZRO (claim `zro_org`, 1:1); o papel vem por tabela fixa (owner/admin → admin, manager →
  gestor, editor → equipe, viewer/guest → leitura), reaplicada a cada login. Quem convida é a Absolute ZRO.
- **Acesso num ponto só.** `temAcesso()` (`src/lib/auth/acesso.ts`) decide para páginas e rotas de dados: hoje,
  `maestro` em `zro_products` (concessão pelo console; plano avulso, sem mexer em `zro.plan_products`); a claim
  `zro_release` do gate de lançamento entra ali. O Maestro nasce fechado: no catálogo como `coming_soon`.
- **Projeto canônico.** Todo projeto do Maestro liga-se ao projeto do HUB (`zro.projects`) **ao nascer**, de forma
  idempotente (`zro.integration_links` + `projects.zro_project_id`); se o HUB falhar, fica `link_status = pending` e
  tenta de novo. O Maestro funciona sozinho. Eventos de outras plataformas só viram indicador no card; nunca movem
  coluna nem decidem pelo cliente. Contrato `maestro.project/1` (rascunho em `docs/integration-contracts`), rotas e
  escopo `maestro.projects` ficam para a etapa 3.
- **Aprovação do cliente.** Um passo só (texto e peça juntos). Link por lote com validade padrão de 30 dias, PIN
  opcional, um link ativo por lote, token só como hash, decisão imutável com a versão exata do card e chave de
  idempotência. WhatsApp por `wa.me` com texto pronto, sem API.
- **Peças.** Pastas do Google Drive da organização via SOBEDESCE (`card_media` guarda id do arquivo, pasta e a
  referência da miniatura); nada de Storage próprio. A forma do pedido (HUB assinando, ou token da pessoa) se decide
  na etapa 2 com base no rascunho do contrato.
- **Quadro.** As 8 colunas do método, com "Com o cliente" = **Em aprovação** e "Publicado" = **Entregue**.
- **Identidade.** O gesto da pauta em latão (logo do Maestro) colorido ao lado da marca flat da Absolute ZRO; o resto
  é a identidade Absolute ZRO (Figtree, grafite, Liquid Glass, tema claro padrão, pouco texto). A Z é a primeira aba.

## Consequências

- No HUB, mudanças mínimas: `maestro` em `ProductId`, `PRODUCT_SCOPES['maestro']`, entrada em `plataformas.ts`,
  migration `0019_maestro.sql` (produto `coming_soon`, `step_order` 8, feature `project_link`), ícone do produto. O
  Ciclo do O passa a ter 8 etapas.
- O gate de lançamento (migration 0018, outro agente) decide quando o Maestro abre e para quem; até lá só entra quem
  recebeu o produto pelo console.
- Projeto Vercel, domínio, cliente OIDC e migrações em produção esperam o "sim" do titular.

## Como reverter

Desativar o produto no catálogo (`stage = 'disabled'`) e apagar o schema `maestro`. Nada foi migrado dos repositórios
antigos, que seguem arquivados como estavam.
