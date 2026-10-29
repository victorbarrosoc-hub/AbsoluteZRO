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

## NOSSOM: Isolar voz no nível do Voice Isolator (29/10/2026)

- Nova cadeia no worker de GPU (`voice-isolator-v1`: Mel-Band RoFormer + MossFormer2 SE 48K, mono 48 kHz;
  `roformer-vocals-v1`: vocal estéreo 44,1 kHz), pesos com revisão e SHA-256 fixos, `weights_only=True`.
- Benchmark em CPU com fala real em português e ruído/música CC BY: SI-SDR médio 15,46 dB contra 11,13
  (DeepFilterNet3, motor local) e 9,96 (HTDemucs, Isolar voz anterior); melhor também em PESQ, ESTOI e DNSMOS. O
  código de produção reproduz o benchmark (14,72 × 14,74 dB). Detalhes em `products/nossom/docs/validation.md`.
- `products/nossom`: `npm test` 76/76, `npm run test:e2e` 75 + 1 pulado, `typecheck`, `format:check` e `build` ok;
  testes Python do worker no CI.
- Não validado: imagem na GPU, custo por minuto, cold start, audição cega. Sem deploy.
