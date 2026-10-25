# Validação — evidências

Rodado em 25/10/2026 neste ambiente (Linux, Node 22.22, Postgres 16.15 local, Chromium do Playwright 1.63).
Mesmos passos do CI (`.github/workflows/ci.yml`). O CI do GitHub roda no primeiro push.

| Verificação                              | Comando                              | Resultado                                     |
| ---------------------------------------- | ------------------------------------ | --------------------------------------------- |
| Segredos                                 | `node scripts/scan-secrets.mjs`      | nenhum segredo em 1482 arquivos versionados   |
| Lint                                     | `npm run lint`                       | 0 problemas                                   |
| Formatação                               | `npm run format:check`               | ok                                            |
| Tipos                                    | `npm run typecheck`                  | ok (pacotes, worker e hub-web)                |
| Unitários + integração (Postgres real)   | `npm test`                           | **69/69** em 8 arquivos                       |
| Build de produção                        | `npm run build`                      | ok, 41 rotas                                  |
| E2E + acessibilidade (axe WCAG 2.1 A/AA) | `npm run test:e2e`                   | **8/8**                                       |
| Dependências                             | `npm audit`                          | 0 vulnerabilidades (Next 16.4.3)              |
| Originais intactos                       | `node scripts/check-originals.mjs …` | 5/5: mesmo HEAD da cópia e `git status` limpo |

## Originais

```
OK  /home/user/nossom · HEAD f04e517 (cópia: f04e517) · git status limpo
OK  /home/user/synquei · HEAD a5ac3f1 (cópia: a5ac3f1) · git status limpo
OK  /home/user/baixadordodrive · HEAD 21f3a63 (cópia: 21f3a63) · git status limpo
OK  /home/user/tpeasy · HEAD dfa91e3 (cópia: dfa91e3) · git status limpo
OK  /home/user/carrodofreela-app · HEAD 5fc93a7 (cópia: 5fc93a7) · git status limpo
```

## Cobertura por critério de aceite (PRD §14)

| Critério                                                                            | Evidência                                                                         |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Repositório independente, commits, README e CLAUDE.md                               | este repositório, `git log`                                                       |
| Originais documentados com SHA e sem alteração                                      | `products/*/SOURCE_MANIFEST.md`, `check-originals.mjs`                            |
| Integrações com origem comprovada; pendências claras                                | `docs/architecture/source-inventory.md`, `docs/roadmap.md`                        |
| Cadastro/login, organização, projeto, convite, troca de organização                 | `auth.test.ts`, `core.test.ts` (equipe), E2E                                      |
| Sem assinatura → 403 inclusive por URL direta                                       | E2E "API: sem assinatura recebe 403", `flow.test.ts` caso A                       |
| Isolamento entre organizações                                                       | `rls.test.ts` (14 testes), `core.test.ts`                                         |
| Plano individual só libera o previsto; Ciclo do O com catálogo versionado e limites | `billing.test.ts` casos A–D, feature, quotas                                      |
| Upgrade, expiração, cancelamento, webhook duplicado e erro                          | `billing.test.ts` (webhook), E2E webhook                                          |
| Eventos com versão, idempotência, auditoria, reprocessamento e estados              | `core.test.ts` (fila), `flow.test.ts`                                             |
| SOBEDESCE → Synquei valida manifest e não perde IDs                                 | `adapters.test.ts`, `flow.test.ts` (fixtures do código real)                      |
| Mídia nunca apagada/sobrescrita; prévia antes de mudança                            | plano com `moves` vazio e `dry_run` (`adapters.test.ts`)                          |
| Módulos futuros sem IA de fachada                                                   | `core.test.ts` (etapas `unavailable`), `products/ai-edit`, `products/finishing`   |
| UI responsiva e acessível; Ciclo do O com alternativa textual                       | E2E mobile sem rolagem horizontal, axe em 12 telas, lista do Ciclo do O           |
| Testes, lint e build passam                                                         | tabela acima                                                                      |
| Sem segredos; sem apontar para produção original                                    | `scan-secrets.mjs`, saneamento nos `SOURCE_MANIFEST.md`                           |
| Nenhum deploy sem consentimento                                                     | nenhum projeto Vercel ligado ao repositório; `vercel.json` desliga deploy por Git |

## Testes (Vitest)

```
packages/billing/test/billing.test.ts > janela da assinatura > ativa vai até o fim do período; past_due até a carência; cancelada no fim do período vale até lá
packages/billing/test/billing.test.ts > casos de acesso (PRD §9.2) > A: só SOBEDESCE → Synquei aparece para contratar e é negado
packages/auth/test/auth.test.ts > senha > scrypt confere e recusa
packages/core/test/core.test.ts > autorização > ordem: sem sessão 401 → sem organização 409 → papel 403 → projeto 404 → entitlement 403
packages/auth/test/auth.test.ts > conta e sessão > cadastro normaliza e-mail, cria sessão e exige confirmação
packages/auth/test/auth.test.ts > conta e sessão > e-mail repetido e senha curta são recusados
packages/billing/test/billing.test.ts > casos de acesso (PRD §9.2) > B: SOBEDESCE + Synquei → os dois liberados
packages/core/test/core.test.ts > autorização > organização no cliente não vale: só a da sessão, conferida no banco
packages/core/test/core.test.ts > autorização > quota sem limite configurado bloqueia antes de executar
packages/billing/test/billing.test.ts > casos de acesso (PRD §9.2) > C: Ciclo do O libera as cinco ferramentas lançadas; as futuras seguem indisponíveis
packages/billing/test/billing.test.ts > casos de acesso (PRD §9.2) > D: cancelamento imediato bloqueia; no fim do período mantém até lá
packages/core/test/core.test.ts > equipe (caso E e convites) > convite exige e-mail igual e confirmado; troca de organização isola os dados
packages/billing/test/billing.test.ts > casos de acesso (PRD §9.2) > período vencido sem renovação deixa de valer
packages/core/test/core.test.ts > equipe (caso E e convites) > admin não convida admin; dono não fica sem dono; removido perde acesso
packages/billing/test/billing.test.ts > casos de acesso (PRD §9.2) > feature fora do plano é negada
packages/core/test/core.test.ts > projetos > etapas começam com estado real e mostram bloqueio por assinatura
packages/billing/test/billing.test.ts > webhook de cobrança > assinatura HMAC confere, com tolerância de tempo
packages/billing/test/billing.test.ts > webhook de cobrança > ativa, é idempotente e ignora evento mais velho
packages/core/test/core.test.ts > fila > evento idempotente; execução com sucesso
packages/auth/test/auth.test.ts > conta e sessão > login: mesma mensagem para e-mail inexistente e senha errada; limite por e-mail+IP
packages/billing/test/billing.test.ts > webhook de cobrança > pagamento falhou: carência do plano e depois bloqueio
packages/core/test/core.test.ts > fila > falha temporária volta com backoff e termina em dead-letter
packages/billing/test/billing.test.ts > webhook de cobrança > organização ou plano desconhecidos ficam registrados como falha, sem conceder nada
packages/core/test/core.test.ts > fila > despacho ambíguo vai para revisão, sem repetir sozinho; reprocessar é manual e único
packages/auth/test/auth.test.ts > conta e sessão > sair revoga na hora; token malformado nem consulta
packages/core/test/core.test.ts > fila > worker que caiu: idempotente volta para a fila, não idempotente vai para revisão
packages/auth/test/auth.test.ts > conta e sessão > sessão vencida não vale
packages/billing/test/billing.test.ts > webhook de cobrança > assinatura de uma organização não muda de dono por evento
packages/core/test/core.test.ts > fila > backoff cresce com teto e jitter limitado
packages/core/test/core.test.ts > fila > detecta ciclo de eventos
packages/core/test/core.test.ts > fila > evento fora do contrato é recusado
packages/billing/test/billing.test.ts > webhook de cobrança > evento fora do contrato é recusado
packages/billing/test/billing.test.ts > quotas > sem limite configurado a operação medida é bloqueada
packages/billing/test/billing.test.ts > quotas > consome até o limite, é idempotente e seguro em concorrência
tests/integration/flow.test.ts > Ciclo do O ponta a ponta > rotas de eventos sem ciclos
packages/auth/test/auth.test.ts > conta e sessão > redefinir senha encerra todas as sessões; trocar senha mantém a atual
packages/billing/test/billing.test.ts > quotas > o maior limite entre as fontes vale
packages/db/test/rls.test.ts > RLS > todas as tabelas do schema zro têm RLS ligado
packages/db/test/rls.test.ts > RLS > cliente de outra organização não vê projetos de terceiros
packages/billing/test/billing.test.ts > catálogo versionado > nova versão começa em rascunho; publicar aposenta a anterior para novas vendas
packages/db/test/rls.test.ts > RLS > forjar a organização ativa sem vínculo não mostra nada
packages/db/test/rls.test.ts > RLS > a mesma pessoa vê só a organização ativa (caso E)
packages/db/test/rls.test.ts > RLS > viewer vê projeto da organização mas não o restrito, e não edita
packages/db/test/rls.test.ts > RLS > papel billing não vê projetos
packages/db/test/rls.test.ts > RLS > viewer não cria projeto
packages/db/test/rls.test.ts > RLS > não dá para criar projeto em outra organização trocando o org_id
packages/db/test/rls.test.ts > RLS > zro_app não lê senhas, tokens nem eventos de cobrança
packages/db/test/rls.test.ts > RLS > sessões: a pessoa não lê o hash do token
packages/db/test/rls.test.ts > RLS > assinaturas e entitlements não são graváveis pelo usuário
packages/db/test/rls.test.ts > RLS > admin não rebaixa dono; dono não fica sozinho sem dono
packages/db/test/rls.test.ts > RLS > auditoria só cresce
packages/db/test/rls.test.ts > RLS > catálogo é público e esconde rascunhos
tests/integration/flow.test.ts > Ciclo do O ponta a ponta > Carro do Freela → TPeasy → SOBEDESCE → Synquei, sem perder IDs
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > lê o descargas.jsonl real, ignora linha pela metade e cancelada
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > relatório xxh64 no formato do xxhsum
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > leva única conferida nos dois destinos = backup comprovado
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > sem relatório o backup NÃO é declarado concluído
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > duas levas no mesmo minuto: só a última tem prova (comportamento real do SOBEDESCE)
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > checksum divergente entre destinos vira erro explícito
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > IDs de ativo são estáveis entre levas e destinos
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > caminho perigoso é recusado pelo contrato
packages/integrations/test/adapters.test.ts > Synquei: prévia de organização > preserva todos os asset IDs, não move nada e cria as pastas de trabalho do Synquei
packages/integrations/test/adapters.test.ts > TPeasy e Carro do Freela > backup do TPeasy vai e volta sem mexer nos ajustes do app
packages/integrations/test/adapters.test.ts > TPeasy e Carro do Freela > job do Carro do Freela vira projeto sem dados pessoais
packages/media-contracts/test/schemas.test.ts > JSON Schemas publicados > docs/integration-contracts/schemas está em dia com o código (rode npm run contracts:export)
tests/integration/openapi.test.ts > OpenAPI > documenta exatamente as rotas da API
tests/integration/flow.test.ts > Ciclo do O ponta a ponta > caso A no fluxo: sem Synquei a execução aparece bloqueada e a API nega com 403
tests/integration/flow.test.ts > Ciclo do O ponta a ponta > assinatura revogada antes da execução: o worker não roda, marca bloqueado
tests/integration/flow.test.ts > Ciclo do O ponta a ponta > manifest com divergência: ingest.failed, Synquei não recebe
 1 tests/e2e/a11y.spec.ts:14:1 › páginas públicas sem violações WCAG A/AA (6.2s)
 2 tests/e2e/a11y.spec.ts:18:1 › área logada e projeto sem violações WCAG A/AA (15.2s)
 3 tests/e2e/hub.spec.ts:21:1 › área logada exige sessão (415ms)
 4 tests/e2e/hub.spec.ts:26:1 › cadastro → organização → projeto com Ciclo do O e alternativa em lista (1.4s)
 5 tests/e2e/hub.spec.ts:41:1 › API: sem assinatura recebe 403 por URL direta; sem sessão 401; outra origem 403 (1.0s)
 6 tests/e2e/hub.spec.ts:68:1 › webhook de cobrança: assinatura errada 400, provedor desconhecido 404, evento válido ativa e repetido não duplica (848ms)
 7 tests/e2e/hub.spec.ts:110:1 › console de administração não existe para quem não é da plataforma (878ms)
 8 tests/e2e/hub.spec.ts:116:1 › páginas públicas e mobile sem rolagem horizontal (760ms)
```

## Redesign (25/10/2026)

- `npm run lint`, `format:check`, `typecheck`: ok. `npm test`: 69/69. `npm run build`: ok. `npm run test:e2e`: 10/10,
  incluindo axe WCAG 2.1 A/AA nas páginas públicas e na área logada **nos temas claro e escuro** e o teste do seletor
  (troca sem recarregar, cookie gravado, escolha mantida após recarregar).
- Conferência visual com Playwright em 1440×900 e 390×844, tema escuro e claro: landing, planos, entrar, início,
  projeto, Ciclo do O e Ferramentas. Referência: telas reais de Synquei, TPeasy e SOBEDESCE servidas a partir das
  cópias em `products/`.

## Downloads (25/10/2026)

- Cada instalador listado em `apps/hub-web/lib/downloads.ts` foi conferido com download real de 1 byte (HTTP 206):
  SOBEDESCE e Synquei (`/baixar/mac`, `/baixar/windows`), NOSSOM (release `desktop-v0.2.2`, Mac Apple Silicon, Mac
  Intel e Windows) e as versões web (200).
- `tests/integration/downloads.test.ts`: catálogo inteiro, só HTTPS em domínios oficiais, nada para instalar no que está
  em desenvolvimento. E2E com axe em `/baixar` e `/downloads` nos dois temas: 10/10.

## Login único (25/10/2026)

- `tests/integration/oidc.test.ts` (8): retorno só cadastrado (sem redirecionamento aberto), loopback por porta,
  PKCE obrigatório, troca com organização e produtos contratados, verifier/segredo errados, código reapresentado
  revoga o refresh, rotação com detecção de reuso, remoção do app no Perfil, isolamento (`zro_app` não lê segredo,
  códigos, refresh tokens nem a chave).
- `tests/e2e/sso.spec.ts`: do app ao HUB, criar conta, criar organização, permitir, voltar com código, trocar por
  tokens, userinfo, reautorização silenciosa, descoberta, JWKS e retorno malicioso recusado; axe na tela de permissão.

## Conta única (25/10/2026)

- `tests/integration/accounts.test.ts` (9): plano grátis na organização nova com as cinco ferramentas e no
  `zro_products`, idempotência, `zro_app` sem acesso à função; conta por app com contagem de entradas e RLS
  (cada pessoa só lê as próprias, não grava); Google com PKCE, state, nonce, aud, iss, validade e e-mail
  confirmado; conta nova sem senha, vínculo reaproveitado, mescla com conta confirmada mantendo a senha, conta
  nunca confirmada perde senha e sessões, conta suspensa recusada sem vínculo.
- `tests/e2e/sso.spec.ts`: "Criar conta" vindo de um app abre `/criar-conta`, passa por Boas-vindas já
  preenchida e volta ao app com código, sem botão do Google quando não configurado; `app_accounts` registrado.
- `tests/e2e/hub.spec.ts`: conta nova recebe as ferramentas do plano grátis; os testes de bloqueio tiram o plano.
- Suite completa local: 92 testes Vitest e 14 e2e passando; lint, format e typecheck limpos.

## Virada das plataformas (25/10/2026)

- Origem: o `main` de cada repositório antigo é exatamente o commit importado (2f6716e, f04e517, a5ac3f1, dfa91e3,
  5fc93a7); nada ficou para trás.
- SOBEDESCE: deploy de produção copiou 20 tabelas do Neon para `sobedesce` com contagem e md5 iguais
  (`sobedesce._copia_neon`); sobedesce.com, /entrar, /conta e /baixar/versao respondendo; Neon intacto.
- NOSSOM: estrutura (`nossom_private`, 10 tabelas, funções `nossom_*`, buckets) e dados (1 conta, 1 identidade,
  3 tratamentos, 1 plano, 1 auditoria, 8 restaurações, 6 usos) conferidos no Supabase AbsoluteZRO;
  `/api/account?verify=1` = configured/reachable/quotaReady/restorationReady. Avatar (arquivo) não copiado.
- Synquei, TPeasy, Carro do Freela: publicados a partir de `products/<app>`; Carro conferido contra o site anterior
  (mesmas rotas, chaves e CSP) antes da produção.
- Login único nas cinco: `/api/zro/entrar` de cada domínio leva ao HUB; apps marcados como da família.

## SOBEDESCE no monorepo (25/10/2026)

- `products/sobedesce/web`: `npm run lint`, `npm run typecheck`, `npm run build` e `npm test` (227/227) com Postgres
  local (`TEST_DATABASE_URL`) e de novo com PGlite.
- `tests/banco-schema.test.mts`: `SOBEDESCE_DATABASE_URL` antes do Neon, um banco só durante a virada, rótulo do pooler
  do Supabase sem senha, migrador no schema com o mesmo hash e a mesma ordem do Drizzle, falha desfaz só a migração.
- `tests/copiar-do-neon.test.mts`: cópia conferida (contagem e md5), re-execução sem efeito, destino com linhas sem
  registro → erro, divergência → erro sem nada gravado, colunas diferentes → erro, log sem dados nem endereços.
- Ensaio da virada com dois bancos locais (um `public` no papel do Neon, um papel `sobedesce_app` dono do schema
  `sobedesce` com `search_path`): migrações + cópia de 20 tabelas conferidas; segunda execução = nada a fazer.
- `tests/versao.test.mts`: Release `sobedesce-versao-de-teste` primeiro; 404 → o antigo; outro erro não cai no antigo.
- `products/sobedesce/test/numero-build.test.js`: build = execução + 1000; limpeza só no Release novo.
- Não validado aqui: a cópia contra o Neon e o Supabase reais (depende das variáveis na Vercel) e os workflows na
  nuvem do GitHub (rodam no push).

- Deploy real (Vercel, Supabase novo, domínio): aguardando autorização.
- CI no GitHub: roda no primeiro push deste branch.
- Cartões reais: os fixtures vêm do código real do SOBEDESCE com cartões Sony falsos em pastas temporárias.
- Synquei e DaVinci Resolve Studio reais consumindo a prévia; NOSSOM recebendo timeline.
- Provedor de pagamento e de e-mail reais (não escolhidos).
- Worker como processo contínuo por horas (validado via `runOnce`/`recoverStaleRuns` nos testes e no seed).
- Carga e concorrência além do teste de quota em paralelo.
