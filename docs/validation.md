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
- Repositórios privados (25/10/2026): nenhum link do HUB vai para o `github.com`; o NOSSOM passa por
  `https://nossom-teal.vercel.app/baixar/<sistema>` como SOBEDESCE e Synquei. `tests/integration/downloads.test.ts` recusa
  `github.com`/`githubusercontent.com` e exige `/baixar/<sistema>` nos instaladores de desktop. Rotas do NOSSOM cobertas
  com GitHub falso em `products/nossom/tests/desktop-releases.test.ts`. Não validado aqui: download real com o
  `GITHUB_TOKEN` de produção (depende da variável nos projetos Vercel, ver
  [downloads-privados](operations/downloads-privados.md)).

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

## Painel de pessoas (25/10/2026)

- `tests/integration/people.test.ts` (10): `changeOrgPlan` grátis → manual (encerra o grátis, concede o novo,
  recalcula acessos, audita `subscription_canceled`, `plan_assigned` e `plan_changed` com o motivo), volta ao grátis
  e recusa o mesmo plano, bloqueio com assinatura Stripe ("Pago pelo Stripe", nada muda), motivo e plano ativo
  obrigatórios; suspender encerra sessões e refresh tokens, audita, reativar não reabre sessão; não suspende a si
  mesmo nem outro admin; números, série de 30 dias e funil; busca, filtros (plano, sem plano, sem organização,
  suspensas, Google, app), ordem; CSV com BOM e sem fórmula; página da pessoa com assinaturas, acessos, sessões e
  linha do tempo.
- `tests/e2e/admin.spec.ts` (2): quem não é da plataforma recebe 404 em `/admin/pessoas`, no CSV e na página da
  pessoa; admin (promovido por SQL no banco de e2e) vê a lista, busca, troca o plano na linha, exporta o CSV, abre
  a página da pessoa; axe WCAG 2.1 A/AA sem violações nas duas telas em claro e escuro; sem rolagem horizontal em
  390 px.
- Suite completa local: 102 testes Vitest (13 arquivos) e 16 e2e passando; lint, format, typecheck, build e
  `scan-secrets` limpos. Bancos de teste próprios (`zro_pessoas_test`, `zro_pessoas_e2e_test`) porque outra sessão
  usava `zro_test` ao mesmo tempo.

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

## Carro do Freela: conta única (25/10/2026)

- `npm run test:api` (HUB falso, chave EC P-256): `criar=1` → `prompt=create` (e só ele); `zro_products` sem
  `carro-do-freela` → sessão abre com `liberado:false`; com o produto → `liberado:true`; sessão antiga sem a lista → 401.
- `test/conta-zro.js` (Chromium, domínio em miniatura): quem chega não vê formulário nem Google; "Criar conta" leva
  `prompt=create` e volta no perfil; sem o produto, só o aviso e "Ver na Absolute ZRO" (nem `entrarNaConta()` abre);
  conta antiga do aparelho ainda entra pelo formulário; `file://` igual a antes.

## Synquei: conta pela Absolute ZRO (25/10/2026)

- `products/synquei`: `npm test` 67/67. `tests/zro.test.mjs` (HUB falso): Criar conta manda `prompt=create` e volta
  logado; `synquei` fora de `zro_products` entra com `acesso: false` e o link de `/ferramentas`; novo login reavalia.
  `tests/conta-ui.test.mjs`: botões Entrar/Criar conta, aviso sem acesso com "Ver na Absolute ZRO", conta liberada.
- Sem conferência visual em navegador nesta rodada (sem Chromium no ambiente).

## SOBEDESCE no monorepo (25/10/2026)

- Conta só pela Absolute ZRO: `web/tests/zro.test.mts` confere `prompt=create` no Criar conta, produto fora de
  `zro_products` com `/api/eu` e Drives em 403 `sem_acesso_zro`, liberação depois de religar e conta antiga sem
  vínculo livre; `web/tests/google.test.mts` confere que o Google não cria conta e que o Google de entrar antigo
  continua entrando. `npm test` 231/231, lint, typecheck e build.

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

## TPeasy: conta única Absolute ZRO (25/10/2026)

- `products/tpeasy`: `node --test tests/*.test.mjs` (23/23) com a Absolute ZRO falsa: `?criar=1` manda `prompt=create`
  e volta logado; `tpeasy` fora de `zro_products` entra com `acesso: false`; liberado dá `acesso: true`; nova entrada
  reavalia. Sintaxe dos módulos conferida como no CI.
- Ajustes conferidos no Chromium (Playwright) com `/api/zro/eu` simulado: fora (Entrar + Criar conta), sem acesso
  (aviso + "Ver na Absolute ZRO") e liberado (só a conta).

## Absolute ZRO para computador (25/10/2026)

- `apps/hub-desktop`: `npm test` (node --test) 14/14: regras de navegação (HUB e `accounts.google.com` na janela; o
  resto só sai por `https` no navegador; `file:`, `javascript:`, `smb:` e URL com usuário/senha recusados), deep link
  `absolutezro://` só para rotas do HUB (sem `/api`, `/oauth`, `//outro-host`, `usuario@host`), permissões negadas por
  padrão, aviso de versão (build 0 nunca avisa, "Depois" lembra o build), janela lembrada só se couber numa tela e
  ícones válidos (`.icns` com 8 tamanhos até 1024, `.ico` 16–256, fundo do DMG 540×380 e @2x).
- Empacotamento local: `npx electron-builder --linux dir` (Electron 44.5.1, fusíveis aplicados, `app.asar` só com
  `desktop/`, `build/icon*.png` e `package.json`). Teste de fumaça do app empacotado com `xvfb-run … --smoke`:
  `SMOKE OK` (tela "Sem conexão" pronta, ponte presente, sem Node na página, símbolo e Figtree carregados, fundo
  `rgb(252, 251, 252)`, regras e deep link conferidos).
- HUB: `tests/integration/hub-desktop-download.test.ts` com GitHub falso: com token redireciona para o endereço assinado
  (`Accept: application/octet-stream`, sem seguir), sem token usa o link do Release, Release ausente volta para
  `/baixar?hub=indisponivel` ("Em breve"), `?build=N` exato, `/baixar/hub/versao` só com `versao.json` válido e
  `/baixar/hub/diag` sem mostrar o token. Raiz: lint, formato, tipos, Vitest 112/112, build e E2E 16/16.
- Não validado aqui: `.dmg` e `.exe` (só geram em Mac e Windows do GitHub Actions, em push na `main`), a barra de
  título do Mac numa máquina real e o download com o `GITHUB_TOKEN` de produção.

## Padrão Apple em todo o site e no HUB (25/10/2026)

- `npx eslint . --ignore-pattern '.claude/**'`, `npm run format:check`, `npm run typecheck`, vitest (93/93 com
  `TEST_DATABASE_URL`), `npm run build` e `E2E_PORT=3260 npx playwright test` (14/14, axe WCAG A/AA nos temas claro e
  escuro, público e logado) passando.
- Conferência visual com `next start` e conta criada pela UI: 1440×900 e 390×844, claro e escuro, em `/`, `/planos`,
  `/baixar`, `/entrar`, `/criar-conta`, `/boas-vindas`, `/inicio`, `/ferramentas`, `/projetos`, projeto, `/ciclo`,
  `/downloads`, `/perfil`, `/assinatura` e `/equipe`.
- Telas dos apps capturadas com Playwright dos sites públicos (SOBEDESCE, Synquei `/app/`, NOSSOM, TPeasy, Carro do
  Freela) em 25/10/2026; SOBEDESCE, NOSSOM e Carro do Freela não têm tema escuro e usam a mesma captura nos dois.

## App para computador fechado ao público (25/10/2026)

- O primeiro build da main (run 40236016758) gerou o `.dmg` e o `.exe` e passou nos testes de fumaça de Mac e Windows.
- `/baixar` mostra "Em breve" e `/baixar/hub/{mac,windows}` volta para `/baixar` enquanto `HUB_DESKTOP_PUBLICO` não for
  `1`. Isso vale mesmo com o Release no ar. Teste: `tests/integration/hub-desktop-download.test.ts`.

## Finishing: referência → LUT (25/10/2026)

- `products/finishing`: `npm test` (12/12, `node --test`, sem dependências). Cenas sintéticas com semente fixa e um look
  conhecido (S com preto levantado, sombras frias, altos quentes, −20% de saturação): referência igual ao material dá
  LUT identidade (desvio < 1e-4); intensidade 0 não mexe; mesma cena chega a < 0,35 da distância original; quatro
  duplas de cenas diferentes sempre aproximam (cada uma < 0,85, média < 0,65), saturação recuperada perto de 0,8; um
  bloco vermelho de 40% do quadro não tinge os cinzas (< 0,012 em Oklab); eixo neutro monótono, sem saltos na grade;
  material chapado não quebra; `.cube` e PNG (cinco filtros) gravam e leem de volta; linha de comando gera `.cube` e
  prévia.
- Limite medido: na dupla 12/13 (referência sem o conteúdo de cor do material) a cor piora; o tom ainda aproxima.
- Não validado: frames reais de filme e de câmera, e a LUT dentro do Resolve.

## Revela: nome no catálogo (25/10/2026)

- Migration `0009_revela.sql`: `finishing` passa a se chamar **Revela** (`provisional_name = false`), com nova descrição;
  só troca o que ainda estava como a 0003 deixou. Conferido no banco de teste depois das migrations.
- `scan-secrets` (1650 arquivos), lint, formatação, tipos, `npm test` (**103/103** em 13 arquivos), build e
  `npm run test:e2e` (**16/16**) verdes neste ambiente. `products/finishing`: `npm test` 12/12.

## Revela: tela (25/10/2026)

- `products/finishing`: `npm ci && npm test` (**15/15**), agora com a tela no Chromium (Playwright 1.63, servidor local
  no próprio teste): escolhe referência e frame, prévia desenhada, 8 linhas de leitura (saturação + 7 faixas), divisão
  em 0 e 100 iguais com intensidade 0 e diferentes com 100, `.cube` baixado em 33 e 65 pontos com título e nome certos,
  "só cor" avisa contraste desligado, arquivo que não é imagem avisa, celular de 375 px sem rolagem horizontal e
  controles com nome acessível. Sem erros de página.
- Conferido em captura: escuro e claro no desktop, escuro no celular.

## Revela: identidade visual (25/10/2026)

- Ícone conferido em 512, 128, 64, 32 e 16 px, em fundo escuro e claro; guia (`products/finishing/marca/index.html`)
  sem rolagem horizontal a 390 px.
- Tela da Revela: `npm test` (**15/15**); o teste da tela agora confere que o ícone do cabeçalho carregou e que o
  favicon sai como `image/svg+xml`. O brilho atrás do título cabe na largura (o teste do celular pegou 41 px de rolagem
  lateral na primeira versão).
- HUB com `--p-finishing` novo e ícone `finishing.svg` no `ProductMark` (3 lugares na página inicial): segredos, lint,
  formatação, tipos, `npm test` (**103/103**), build e `npm run test:e2e` (**16/16**, com axe) verdes.

## Revela: marca colorida, conta-gotas e publicação (25/10/2026)

- Marca refeita a pedido do titular ("pegada das cores da Kodak, colorido"): três símbolos comparados em 300, 96, 48,
  32 e 20 px, em fundo escuro e claro. O titular escolheu o perfurado e pediu roxo; três gradientes com roxo
  comparados, o final usa roxo profundo → roxo → vermelho → laranja → amarelo (sem rosa, para não encostar no magenta
  do Carro do Freela). Conferido em 300, 64 e 32 px; guia sem rolagem horizontal a 390 px.
- `products/finishing`: `npm test` (**18/18**). Conta-gotas: o par leva a cor marcada a menos de 0,012 da referência;
  na dupla 12/13 o erro de cor vai de 0,026 (sem pares) para 0,0135 com dois pares, abaixo do original (0,0162); com a
  cor desligada os pares não agem. Na tela: marcar par sem abrir a escolha de arquivo, Esc cancela, Limpar volta.
  O servidor do teste aplica os cabeçalhos do `vercel.json` e a tela roda sem erro de console com a CSP de produção.
- HUB com amarelo e roxo em `--p-finishing`/`--p-finishing-2`: segredos, lint, formatação, tipos, `npm test` (**103/103**),
  build e `npm run test:e2e` (**16/16**) verdes.

## Revela: fundo sempre escuro (25/10/2026)

- A pedido do titular, a tela da Revela é sempre preto fosco (`#0E0E10` com grão neutro), sem tema claro; a sombra da
  comparação ficou neutra (sem brilho colorido perto da imagem). `products/finishing`: `npm test` (**19/19**), com
  teste novo: com o sistema no tema claro, fundo continua `rgb(14, 14, 16)` e texto claro. Conferido em captura.

## Revela: merge do main (25/10/2026)

- `main` (Padrão Apple, app para computador) trazido para o PR #31 por merge. Conflitos: página de planos (fica o layout
  novo do `main`, com "Revela") e esta página (as duas seções mantidas). Segredos (1758 arquivos), lint, formatação,
  tipos, `npm test` (**113/113**), build, `npm run test:e2e` (**16/16**) e `products/finishing` (**19/19**) verdes.

## OG com a Revela (25/10/2026)

- A pedido do titular, `scripts/marca/og-claro.html` ganhou o ícone da Revela na fileira das ferramentas;
  `opengraph-image.jpg` e `twitter-image.jpg` recapturados em 1200×630 (Chromium, Figtree carregada).
- Ícone da Revela sem a margem de ícone de Mac (quadro de borda a borda, como Synquei e NOSSOM): no OG ele tinha
  um aro branco e parecia menor. Tela da Revela e guia ajustados; `npm test` da Revela verde.

## Revela: OG próprio e endereço (25/10/2026)

- `revela.vercel.app` já pertence a outro app ("REVELA – Seu App de Estudo Bíblico"); com o aval do titular, o projeto
  `revela` ganhou `revela-zro.vercel.app` (verificado na Vercel; antes respondia `DEPLOYMENT_NOT_FOUND`, ou seja, livre).
- OG da Revela (`products/finishing/og.jpg`, 1200×630, fundo preto fosco, cubo de cor isométrico) gerado de
  `marca/og.html`; tags `og:*` e `twitter:*` com URL absoluta. `npm test` (**20/20**): teste novo confere as tags e que
  a imagem servida tem 1200×630.

## Revela: logo do titular (25/10/2026)

- Logo entregue pelo titular guardada sem alteração (`revela-logo-original.png`, 2172×724, fundo preto). Versão para o
  preto fosco (`revela-logo.png`, 1740×325): fundo preto retirado por "cor para alfa" e margens recortadas; composta
  de volta sobre o preto, difere da original em no máximo 0,5 nível (arredondamento).
- Aplicada no cabeçalho da tela, no guia (capa e seção "Logo") e no OG do link (`og.jpg`, tags com `?v=2`).
  `products/finishing`: `npm test` (**20/20**), com a logo carregando no cabeçalho.

## Revela: entrega por destino (25/10/2026)

- Fontes conferidas em 25/10/2026: YouTube (codificação recomendada e HDR), Vimeo (compressão), Netflix Partner Help
  (servicing em ProRes 422 HQ, Rec.709/BT.1886), Portaria MC 354/2012 (−23 LKFS ±2). Instagram e TikTok não publicam
  especificação técnica: presets marcados como Mercado. API de render do Resolve conferida no README de script da v20.
- `products/finishing`: `npm test` (**27/27**). Dados: todo preset tem fonte com link, tipo e data; bitrate pela
  altura/cadência. Script: roda num Resolve simulado (Python) e escolhe H.264/H.265/ProRes 422 HQ pelo nome (sem
  confundir com ProRes 422), bitrate de 2160p numa timeline 4K, 1080×1920 nos verticais, PCM 24 bits na TV, e relata
  ajuste recusado. Tela: 8 destinos, selos Oficial/Mercado/"Loudness oficial", download do `.py`, link direto por
  `#destino`, celular sem rolagem lateral, sem erro de console com a CSP de produção.
- Não validado: o script no DaVinci Resolve Studio real (nomes de tags HDR como `ST2084` podem variar por versão; o
  script avisa se o Resolve recusar).

## Revela: conversor no navegador (25/10/2026)

- `products/finishing`: `npm test` (**35/35**). Plano (puro): bitrate de 2160p a partir de master 4K, redução sem
  ampliar, dimensões pares, 1080×1920 no vertical, avisos de HDR/primárias/cadência, sem áudio não pede codec;
  `vendor/` igual aos pacotes instalados. Tela: ffmpeg gera ProRes 422 HQ 1280×720 com áudio PCM, a página confere
  `crossOriginIsolated`, converte, baixa e o ffprobe lê H.264 1280×720 com `bt709` nas três tags e faixa de áudio.
- Experimento fora do teste: ProRes 1080p de 4 s convertido em ~3 s no Chromium headless sem GPU (mais rápido que o
  tempo real); diferença média de RGB entre o ProRes e a saída: 0,61 nível (sem a remarcação BT.709, a saída ia
  como `smpte170m`).
- Chromium no Linux não codifica AAC: a saída usa Opus e a tela avisa. CI do app ganhou o ffmpeg.
- Celular (390 px) sem rolagem lateral. Não validado: Safari/iOS e Chrome/Android reais, codificador de hardware,
  arquivos grandes no celular.

## Revela: telas no padrão Apple, com pouco texto (26/10/2026)

- A pedido do titular, as três telas da Revela perderam os blocos de explicação: título curto, uma linha de apoio,
  cartões com o formato de cada destino (16:9, 9:16, TV, película), controles segmentados, botões em Liquid Glass
  (ação principal em vidro claro sobre o preto fosco) e detalhes técnicos recolhidos (ficha, avisos, fontes).
- Conversor: miniatura do primeiro quadro (com a cor BT.709 certa), fichas em vez de frases, barra com brilho
  enquanto converte, selo de pronto; a caixa de soltar encolhe quando há arquivos.
- Motion só em CSS e só com `prefers-reduced-motion: no-preference`: entrada escalonada, troca do detalhe, brilho da
  barra, selo de pronto, ícone que respira ao arrastar.
- `products/finishing`: `npm test` (**35/35**), testes de tela ajustados (fichas, miniatura não vazia, caixa
  compacta, grupos de rádio com nome). Desktop 1280 e celular 390 sem rolagem lateral e sem erro de console.

## HUB: menu recolhível, tela inteira e central da conta (26/10/2026)

- Pedido do titular: menu lateral recolhível, melhor uso da tela de cada aparelho e uma central de administração da
  conta (senha, e-mail, foto, plano, acessos).
- Raiz: `npm run lint`, `format:check`, `typecheck` ok; `npm test` **125/125** em 15 arquivos (novo
  `account-center.test.ts`, 12 testes: troca de e-mail só depois de confirmada pelo endereço novo, senha atual
  exigida, e-mail de outra conta recusado, links de nova senha antigos derrubados, conta só Google sem troca; nome pelo
  `zro_app`; foto pelo tipo real dos bytes, até 300 KB, visível só a quem divide organização, RLS contra escrita em
  nome de outra pessoa; pedidos de plano só por dono/administração/financeiro, um aberto por plano, editor e outra
  organização não veem nem criam, a pessoa não marca o próprio pedido como atendido, renovação exige plano pago; resumo
  de acessos com plano só para a cobrança). `npm run build` ok (72 rotas). `npm run test:e2e` **18/18** (novos: menu
  recolhe, lembra no recarregar e não vale no celular, que usa uma barra só e fecha a folha ao navegar; conta com nome,
  foto reduzida para WebP no navegador e servida em `/api/v1/users/{id}/avatar`, pedido de upgrade e acessos; axe
  WCAG 2.1 A/AA nas quatro seções da conta, claro e escuro). `scan-secrets`: nada em 1774 arquivos.
- Conferido em screenshot: 1440 px aberto e recolhido, as quatro seções da conta, e 390 px com a faixa de seções e a
  folha do menu.
- Não validado: envio real do e-mail de troca (sem provedor de e-mail, a tela avisa e mostra o link só em
  desenvolvimento); fotos HEIC em iPhone real (o navegador pode não abrir; o servidor recusa o que não for JPG, PNG ou
  WebP).

## Marca flat: anel com centelha (26/10/2026)

- Letras do wordmark original vetorizadas (`scripts/marca/vetor`, potrace com ampliação 6×) e O redesenhado; SVG
  mestres, `packages/ui/src/marca.ts` e ícones saem da mesma geometria. Conferido em tela: wordmark e símbolo em
  claro e escuro, ampliados (retas limpas) e pequenos (16 px só o anel).
- HUB: `lint`, `format:check`, `typecheck` ok; `npm test` **113/113**; `npm run build` ok; `npm run test:e2e`
  **16/16** (axe WCAG A/AA claro e escuro com a marca em SVG). App de computador: `npm run icons` e `npm test`
  **14/14**.
- NOSSOM: `typecheck` ok, `npm test` **73/73**, E2E do botão "Entrar com Absolute ZRO" **2/2** (o teste confere o
  símbolo em SVG). SOBEDESCE: `typecheck` ok, `npm test` **231/231**.
- OG e capturas do HUB nos aparelhos refeitos com a marca nova (demo local). Branding no Higgsfield: 6 imagens
  (GPT Image 2.5, 2K) e a animação (FLUX 3 Video, 5 s): a estrela nasce com as 4 pontas e recolhe até a forma flat.
- Não validado: ícones no Dock/Menu Iniciar reais (sem Mac/Windows aqui) e no iPhone real.

## Central de apps (26/10/2026)

- HUB: `tests/integration/desktop-apps.test.ts` (escolha do arquivo por versão e build, só com SHA-256; NOSSOM pelo
  Release nossom-v* mais novo ou pelo repositório antigo; GitHub fora do ar não quebra o catálogo; download só de
  arquivo reconhecido, com token pelo endereço assinado). Conferido contra os Releases reais: SOBEDESCE 0.1.0 (b1005) e
  Synquei 1.0.0 (b1004) entram com SHA-256; NOSSOM fica de fora sem token (repositório antigo privado).
- E2E: a página Downloads com a ponte do app simulada instala com progresso, abre, mostra Atualizar e esconde o
  instalador avulso; no navegador nada da central aparece.
- App de computador: `test/central.test.mjs` (catálogo malicioso descartado, arquitetura do Mac, regra de atualização,
  registro do Windows, download conferido e apagado quando não confere, instalação simulada no Mac em `/Applications` e
  em `~/Applications`, NSIS com `/S /currentuser`, app aberto bloqueia atualizar). `npm test` e `npm run smoke`
  (Electron real no Linux, com a ponte da central) ok.
- Sites: Synquei `npm test`, SOBEDESCE `typecheck` e `npm test`, NOSSOM `typecheck` e `npm test` ok.
- Não validado: instalação real num Mac e num Windows (sem os sistemas aqui), instalação da tela de início em iPhone e
  Android reais.

## Revela: página inicial, login e conta Absolute ZRO (26/10/2026)

- `index.html` virou a página inicial (motion em CSS, telas reais em MacBook/iPhone, frames da ZRO Filmes como exemplo (o "antes" é o frame em log simulado));
  a ferramenta de LUT foi para `lut.html`. "Testar com um exemplo" carrega as duas fotos e monta a prévia.
- `entrar.html` + `api/zro/{entrar,callback,eu,sair}.js` no padrão do Synquei (PKCE S256, `client_secret_basic`,
  cookies assinados, `zro_products` decide o acesso). `Cache-Control: no-store` em `/api/zro/*`.
- `products/finishing`: `npm test` (**59/59**): 21 do login contra um provedor OIDC falso; tela com home (1440 e 390
  sem rolagem lateral, sem imagem quebrada, sem erro de console), entrar (fora e desligado) e o exemplo.
- Não validado: login real (falta o cliente `revela-web` no console e as variáveis no projeto Vercel `revela`).

## Revela Look (26/10/2026)

- `src/cor/looks.js`: look de película com matemática própria (o FVPro+ do titular, pacote pago de terceiro, não
  entrou no repositório). Botão "Revela Look" na tela de LUT, no lugar da referência; conta-gotas desligado nele.
- `products/finishing`: `npm test` (**65/65**): 5 testes do look (intensidade 0 não mexe, curva monótona com preto
  aberto e branco que deita, sombras frias e altas quentes, verde para oliva com pele no lugar, só curva / só cor,
  .cube fiel ao look) e 1 de tela (sem referência, baixa `revela-look-33.cube`, referência nova volta ao normal).
- Não validado: comparação lado a lado com o FVPro+ no Resolve.

## Revela CST (26/10/2026)

- `src/cor/espacos.js`: curvas log e gamuts das câmeras do CST do Resolve, a partir das fórmulas publicadas pelos
  fabricantes. `cst.html`: câmera → saída, prévia num still, .cube 33/65, "Suavizar altas". Aba CST nas quatro telas.
- `products/finishing`: `npm test` (**72/72**): cinza 18% de cada log no valor publicado (S-Log3 420, S-Log2 347,
  LogC3 0,391, LogC4 0,2784, V-Log 433, Canon Log 3 34,3% IRE, Log3G10 1/3…), ida e volta de todas as curvas, matrizes
  Rec.709→XYZ, S-Gamut3.Cine→709 e AP1→709 iguais às de referência, branco que continua branco, cinza neutro na
  saída para as 17 câmeras, identidade, log→log sem corte, altas suaves; tela no computador e no celular (375 px sem
  rolagem lateral), baixa `revela-cst-arri-logc4-para-rec709-65.cube`.
- Não validado: comparação no Resolve com o CST dele (nível de dados de cada formato) e em material real de cada câmera.

## Revela: dock embaixo e menu recolhível (26/10/2026)

- As abas saíram do cabeçalho (o desfoque dele prendia o `position: fixed`) e viraram um dock embaixo; `app/menu.js`
  monta o menu lateral nas quatro ferramentas: trilho 68 px ↔ 248 px no computador (lembrado), gaveta no celular.
- `products/finishing`: `npm test` (**73/73**), com teste novo: dock no rodapé da tela, menu que abre e é lembrado
  entre páginas, item atual marcado, gaveta no celular que fecha com Esc, sem rolagem lateral em 375 px.

## Família Absolute ZRO nos menus de todas as plataformas (26/10/2026)

- A pedido do titular, o bloco "Absolute ZRO" (ícone e nome de cada app, levando ao app) entrou no menu de cada
  plataforma: HUB (lateral e menu do celular), Revela, Sobedesce (lateral do computador e Ajustes do celular),
  Synquei (lateral), Nossom (menu do estúdio e gaveta), TPEasy (Ajustes). Ordem alfabética em todas, sem o app atual
  e sem o AI Edit (em desenvolvimento). Revela sem o selo "Protótipo".
- Testes: Revela 73/73 (confere a ordem), Sobedesce `test:fast` 706/706 (familia.test.js confere a ordem), Synquei
  63 (4 pulados sem luajit), TPEasy 23/23, Nossom typecheck, formato, 73/73 e o e2e da família (confere a ordem);
  HUB lint, typecheck, 113 unitários, build e 16 e2e.
- Não validado: cliques nos apps de computador (Electron) e em iPhone/Android reais.

## Revela no SOBEDESCE: "Converter com a Revela" (26/10/2026)

- Um botão só (pedido do titular): converte o aparelho que tocou. Computador: ffmpeg do app. Celular: o próprio
  aparelho, no navegador; o pedido ao computador que existia antes deste ajuste saiu (site sem mudança).
- `products/sobedesce`: `test/revela.test.js` (**7/7**): cópias de products/finishing iguais (presets, plano, ícone e,
  no celular, plano e Mediabunny), leitura do `ffmpeg -i` (ProRes 4K, HDR com `pq`, celular deitado), linha de
  comando (45 Mbit/s no 4K do YouTube, GOP de 12 a 23,98 fps, tags 1-1-1, AAC 384k, 1080×1920 no Reels) e, com o ffmpeg
  de verdade e o Drive falso, um ProRes do Drive vira `<nome>-youtube.mp4` na mesma pasta, H.264 1280×720 `bt709` nas
  três tags com AAC 48 kHz, MD5 do Drive igual e nenhum temporário para trás. Trabalhos da tela (SSE, parar).
- `test/revela-celular.test.js` (**1/1**, Chromium): o motor do app do celular, com a CSP de produção do `/app/`, lê um
  ProRes de um "Drive" que só responde com token e por pedaços, troca o token recusado (401) e devolve H.264 1280×720
  `bt709` com áudio. A CSP do `/app/` ganhou `'wasm-unsafe-eval'` e `worker-src blob:` (o teste mostrou o bloqueio).
- Suíte do SOBEDESCE (`npm run test:fast`): estado inicial com a chave `revela`, app do celular 2.8.44 (cache v59).
- Tela do computador conferida no Chromium com o app de verdade: menu, janela com os quatro cartões nos temas escuro e
  claro, andamento e pronto com o arquivo novo na pasta.
- Não validado: Mac e Windows reais (VideoToolbox, NVENC); iPhone e Android reais (velocidade, memória, Safari).

## Domínio absolutezro.com e junção dos PRs 34 a 37 (26/10/2026)

- HUB em `https://absolutezro.com` (`/api/health` ok, emissor OIDC no domínio novo, `www` → 308). `ZRO_ISSUER` no domínio
  novo nos projetos Vercel de Synquei, SOBEDESCE, NOSSOM, TPeasy e Carro do Freela; "Entrar com Absolute ZRO" de cada um
  leva ao `/oauth/authorize` do domínio novo e daí à tela de entrar. Endereços fixos `absolutezro.vercel.app` trocados.
- Deploys: o passo de ignorar build compara com o último deploy (`VERCEL_GIT_PREVIOUS_SHA`), não com `HEAD^`; saiu o
  `ignoreCommand` do `vercel.json` do Carro do Freela e do Revela, que sobrescrevia o do projeto.
- Junção: raiz `lint`, `format:check`, `typecheck` ok, `npm test` **131/131**, `build` ok, `test:e2e` **20/20**. App de
  computador **22/22**. Synquei **63/63**. NOSSOM `typecheck` ok e testes sem falha. SOBEDESCE **715/715** e web
  **231/231**.
  Carro do Freela **83/87**: as 4 que falham (`fase1-sem-dinheiro`, `seguranca`, `tela-de-inicio`, `versoes`) falham
  igual na `main`, porque dependem das páginas geradas por `npm run build:fases`.

## Vendas pelo Stripe (26/10/2026)

- Migração 0011: preços (avulso R$ 59,90/mês ou R$ 449/ano; Completo R$ 149,90 ou R$ 1.499; Pro R$ 299,90 ou
  R$ 2.999), créditos de IA e GPU por plano (200, 600, 2.000; teste 50), versões sem preço aposentadas, conta grátis v3 sem ferramentas (rascunho até ligar as vendas) e `zro.platform_settings`.
- `packages/billing/test/stripe.test.ts` (8 testes): tabela de preços e créditos; corpo no formato do Stripe; assinatura
  `Stripe-Signature` (segredo errado, corpo alterado e evento velho recusados); tradução de `customer.subscription.*`
  (unpaid → atraso, incomplete_expired → expirada, sem metadados do HUB → ignorado); checkout com preço e organização
  nos metadados da assinatura; erro do Stripe vira mensagem curta; evento libera a ferramenta e repetido não duplica;
  "Ligar vendas" numa transação desfeita (conta antiga até o corte, conta nova com grátis v3 + 7 dias do Completo,
  teste com 50 créditos mesmo depois de recalcular, repetir não move o corte, validações). Raiz: `npm test`
  **140/140**.
- Não validado: checkout e portal reais (sem conta Stripe ainda).

## Revela: Clonar LUT, preset Lightroom e página inicial (26/10/2026)

- `src/cor/clonar.js`: o mesmo frame com e sem a cor vira LUT. Matriz afim por mínimos quadrados + resíduo numa grade
  17³ (espalhamento trilinear, borrado e regularizado para a matriz onde não há amostra). Numa cena diferente, a LUT
  clonada chega a 0,0095 do look verdadeiro (sem nada: 0,079).
- `src/cor/lightroom.js`: preset .xmp com curvas por canal e HSL das oito faixas. É aproximado (o Lightroom não aplica
  LUT 3D em preset) e a tela diz isso no botão.
- Página inicial: "Testar agora" abre a LUT com o exemplo carregado; comparação Log/Final arrastável; faixa "Funciona
  no seu editor"; cartão do CST. Sem "grátis" no texto (PRD §9.1: não assumir preço nem teste grátis).
- `products/finishing`: `npm test` **78/78**.
- Não validado: o .xmp aberto num Lightroom real (Classic e celular) e a semelhança dele com a LUT.

## Página inicial: símbolo e órbita (26/10/2026)

- `BrandSymbol` (anel em traço + centelha da `ZRO_SIMBOLO`) e `PointerTilt` (variáveis CSS, só mouse/caneta, nada
  com "reduzir movimento"). Órbita com classes `zorbit` para não colidir com a órbita do Início do HUB.
- Conferido em 1440×900 e 390×844, claro e escuro, e com "reduzir movimento" (forma flat parada, sem rolagem
  horizontal).
- `a11y.spec.ts` termina as animações de entrada (finitas, de tempo) antes do axe, que mede o contraste final;
  as infinitas e as de rolagem ficam como estão.
- `npm test` **140/140**; `npm run test:e2e` **20/20**.
- Não validado: Safari e Firefox sem `animation-timeline` (caem na versão sem órbita animada, conferida só no
  Chromium com reduzir movimento).
- OG novo (escolha do titular): símbolo grande à esquerda, fundo branco chapado, apps sem placa nem borda
  (`scripts/marca/og-claro.html` → `opengraph-image.jpg`/`twitter-image.jpg`). Ícone do app segue o atual (claro).
- Ícone da SOBEDESCE na família sem a moldura (placa até a borda, sem margem nem sombra) no HUB, NOSSOM, Revela,
  TPeasy, Synquei e Carro do Freela; caches `synquei-v13` e `tpeasy-v13`. Órbita da home mostra só o ícone de cada
  app, sem placa de vidro em volta. `products/synquei` e `products/tpeasy`: `npm test` ok; e2e 20/20.

## Revela: CST no Converter (26/10/2026)

- "Log da câmera" no Converter: cada quadro passa por uma LUT 3D do CST (65³, WebGL2) antes de codificar; o shader
  desfaz a faixa de vídeo antes da curva. Produção conferida depois do merge do #38 (exemplo, Revela Look, CST e
  Converter abrindo sem erro em revela-zro.vercel.app).
- `products/finishing`: `npm test` **79/79**. Teste novo: ProRes com cinza no código do S-Log3 vira MP4 H.264 com o
  cinza em ~124 (Y de 8 bits, o cinza 18% do Rec.709; sem o CST ficaria perto de 105) e marcado BT.709.
- Não validado: arquivos reais de cada câmera e o desempenho em celulares.

## AEON na página inicial (26/10/2026)

- Migração 0012: a plataforma de edição vira **AEON** (id `ai-edit` mantido, estágio "em desenvolvimento"), com a linha
  "Edição com IA: transcrição, cortes e timeline para o seu editor". Só troca o que ainda está como a 0003 deixou.
- Ícone do AEON (de `products/ai-edit/marca/aeon-icone.svg`, branch `claude/ai-edit-primeiro-recorte`) em
  `public/products/ai-edit.svg`, recortado até a placa (sem margem), no `ProductMark`: órbita, cartões, planos e HUB.
- Cartão da home: "A IA propõe. Você aprova." Projeto: etapa "AEON" ainda não lançada. e2e procura "AEON".
- `npm test` 140/140; e2e 20/20.

## Revela: tema claro, looks lado a lado, exportar por editor e CST por clipe (26/10/2026)

- Tema claro por padrão em todas as telas (o escuro fica no menu e é lembrado), logo grafite no claro, Figtree nos
  títulos (servida da própria Revela), sem manchas de luz na página inicial nem no login. Página inicial com menos
  texto (sem sobretítulos e sem frases nos cartões), seção "Um frame. Todos os looks." e telas reais no tema escolhido.
- Cinco looks (`LOOKS`): diferentes entre si, cinza sempre subindo em luz percebida, P&B sem cor. Grade de looks na tela
  de LUT: só o frame já mostra todos; com referência, ela entra primeiro e dá para voltar.
- Exportar: Premiere, Final Cut e CapCut recebem .cube de 33 com o editor no nome; .xmp de cada look é XML válido.
- CST por clipe: o relatório do `toCsv` do Synquei vira câmeras com log sugerido; o script gerado roda num Resolve de
  mentira (Python) e põe a LUT certa no nó 1 de cada clipe, deixando de fora clipe sem log ou fora do relatório.
- `products/finishing`: `npm test` (ver o total no PR). CI da Revela também roda quando muda o relatório do Synquei.
- Não validado: o script num DaVinci Resolve real (SetLUT no nó 1), os .cube no Premiere, Final Cut e CapCut reais, o
  .xmp num Lightroom real.
- Não feito, por depender de outros apps: entrega da Revela subindo pelo SOBEDESCE com MD5 e `delivery.ready` no HUB;
  desconto de `zro.ai_credits` (a Revela não usa GPU de servidor).

## Página inicial de cinema (26/10/2026, estrutura escolhida pelo titular)

- Topo: paisagem em preto e branco com o símbolo esculpido em metal sobre a rocha, gerada no Higgsfield (GPT Image
  2.5) a partir do SVG oficial como referência: anel grosso com só as duas pontas horizontais da centelha
  (`public/brand/home-paisagem{,-sm}.webp`). Frase "O futuro começa do zero." à esquerda, palavras do ecossistema à
  direita, véu claro/escuro para leitura e foto escurecida no tema escuro.
- Abaixo: as 7 ferramentas numa faixa discreta (ícone, nome, uma linha, link para o site oficial), a régua
  "Ferramentas que se conectam · Um ecossistema completo", o cartão do Ciclo do O (para /planos), o painel do HUB e o
  fechamento. Saíram a órbita, o explorador, a linha do job à entrega, os números e os downloads repetidos.
- Conferido em 1440×900 e 390×844, claro e escuro, sem rolagem horizontal nem erro no console. e2e 20/20 (o teste do
  login único falhou uma vez no axe por `document-title` antes do título carregar e passou ao repetir).

## App Absolute ZRO para computador no ar (26/10/2026)

- Pedido do titular: download público do app (central das ferramentas com a conta única), também pelo Terminal como no
  SOBEDESCE. `HUB_DESKTOP_PUBLICO=1` em produção no projeto `absolutezro`; Release `hub-desktop` build 10 (1.0.0) com
  `.dmg` e `.exe` e SHA-256 em `/baixar/hub/versao`.
- `public/instalar.sh` (Mac) e `public/instalar.ps1` (Windows), derivados dos do SOBEDESCE: leem `/baixar/hub/versao`,
  baixam `/baixar/hub/{mac,windows}`, conferem o SHA-256, fecham o app aberto, instalam ("Absolute ZRO.app" em
  Aplicativos sem quarentena; NSIS em silêncio para o usuário) e abrem. `sh -n` ok. O cartão do app em `/baixar` mostra
  os dois comandos com botão de copiar.
- Não validado: a instalação real num Mac e num Windows (sem aparelho aqui).

## SOBEDESCE: Abrir no Synquei, ficha de compatibilidade e prova medida (26/10/2026)

- Abrir no Synquei: `products/sobedesce/test/synquei-ponte.test.js` (tipos iguais aos do Synquei, link só com pasta
  absoluta e tipo conhecido, cartão Sony falso copiado de verdade → `tipo` no `descargas.jsonl` → link com a pasta do
  projeto; sem cartão conferido, 409). Synquei: `tests/link-organizar.test.mjs` (link válido, recusa de pasta relativa,
  outro host e outro esquema, link no argv do Windows) e `tests/organizador.test.mjs` (tipo do resumo vale até a pasta
  ter um escolhido no Synquei; tipo desconhecido é ignorado).
- Ficha de compatibilidade no topo da página inicial do site (Mac, Windows, iPhone e Android, Google Drive, cartões e
  HDs): só o que o README e o `electron-builder.yml` dizem. `npm run lint` e `npm run typecheck` do site sem erro.
- Prova medida: o script mede, não estima. Não rodou aqui (sem Drive real nem rede de casa): os seletores do botão de
  download do Drive precisam ser conferidos na primeira medição; se falharem, o script aceita o tempo medido à mão e
  registra isso no JSON.
- Não validado: o protocolo `synquei://` num Mac e num Windows reais (registro pelo instalador, `open-url`, segundo
  processo no Windows) e o aviso "Instale o Synquei" quando ele não está no computador.

### Roteiro: "Converter com a Revela" em aparelhos reais (a fazer)

| Aparelho                                | O que conferir                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Mac (Apple Silicon e Intel)             | Converter um vídeo do Drive para cada destino; arquivo novo ao lado do original; MD5 conferido; original intacto |
| Windows 10/11                           | O mesmo, com ffmpeg do pacote                                                                                    |
| iPhone (Safari e app na tela de início) | Converter pelo celular; progresso, cancelar e erro com mensagem clara                                            |
| Android (Chrome)                        | O mesmo do iPhone                                                                                                |

Anotar por aparelho: sistema, tamanho do arquivo, tempo, destino e o que falhou.

## SOBEDESCE: entrega conferida → `delivery.ready` v2 (26/10/2026)

- Contrato: `delivery.ready` v2 (`source` finishing ou sobedesce, arquivos, bytes, `checksum: md5`, `verified: true`,
  `folder_url` só no formato de pasta do Drive); schema exportado em
  `docs/integration-contracts/schemas/event.delivery.ready.v2.schema.json`. Rota nova
  `POST /api/v1/projects/{id}/sobedesce/deliveries` documentada no OpenAPI.
- SOBEDESCE `test/entrega.test.js`: comprovante só com o lote inteiro concluído e conferido (pulado igual no Drive
  entra), um envio de uma pasta, link montado pelo id da pasta.
- HUB `packages/integrations/test/adapters.test.ts`: lê o comprovante gerado pelo código real
  (`tests/fixtures/sobedesce/entrega.json`, `scripts/fixtures/generate-sobedesce-entrega.mjs`) e recusa caminho
  perigoso, MD5 fora do formato, arquivo repetido, lista vazia e link que não é o da pasta.
- HUB `tests/integration/flow.test.ts`: registrar publica um `delivery.ready` v2 (`producer: sobedesce`), registrar de
  novo não duplica nem gasta cota, link adulterado é recusado e sem plano a resposta é 403.
- Não validado: o botão **Comprovante** num envio real para o Drive e o registro pela tela do HUB em produção.
- Site do SOBEDESCE: topo sem texto em degradê e sem brilho azul (Padrão Apple).

## App para computador: abertura, painel e login; AEON e Revela disponíveis; Avulso numa janela (26/10/2026)

- `npm test` **143/143** (testes que esperavam AEON e Revela bloqueados agora conferem a liberação de 0013; o caso
  "fora do catálogo" usa um id inexistente). `apps/hub-desktop` `npm test` 22/22. Lint, formatação, tipos e build ok.
- Capturas locais (claro e escuro) de `/planos` com 3 apps marcados, `/app/entrar`, `/app` com conta nova e quadros
  da abertura em 0,3 s, 0,9 s, 1,6 s e 2,4 s.
- Não validado: a abertura e o painel dentro do app instalado (Mac e Windows) até sair o build 1.1.0.
