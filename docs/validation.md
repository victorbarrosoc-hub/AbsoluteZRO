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

## A Z no Início do NOSSOM (27/10/2026)

- `products/nossom`: `npm test` **83/83** (5 novos em `tests/zro.test.ts`: cookie da Z cifrado, HttpOnly e preso a
  `/api/zro/ia`; repasse encaminha o Bearer e passa o NDJSON sem vazar token; recusa sem sessão, sem token, com token
  de outra conta, cookie adulterado, outra origem e caminho fora da API sem chamar a Absolute ZRO; renovação única
  pelo refresh que gira; token sem `zro.ia` não é guardado; sair apaga e revoga). `typecheck`, `format:check` e
  `npm run build` ok.
- E2E (`npx playwright test`): **75 passaram, 4 falharam, 1 pulado**; as falhas são as 3 de gravação pelo microfone
  (o Chromium daqui não dá o microfone) e a contagem de seções da home, que já quebrava desde a seção da Z (6 → 7,
  corrigida e conferida depois). `tests/e2e/zro-ia.spec.ts` (4) passa: Z no topo, "Conectar com Absolute ZRO" sem
  token, assistente NOSSOM logo abaixo, tema do estúdio no painel, repasse até a API falsa do HUB, token fora da
  página, painel fora do ar não quebra o Início.
- Fotos com o `zro-ia.js` de verdade (servido localmente) e a API do HUB falsa, 1440 e 390 px, claro e escuro, sem
  rolagem horizontal; conferidas a olho, fora do repositório. `node scripts/scan-secrets.mjs` limpo.
- Não validado: conta Absolute ZRO real, o `nossom-web` aceitando `offline_access zro.ia` em produção, o app de
  computador instalado (carrega o mesmo `/studio`, sem mudança no binário) e Safari/iPhone físicos.

## A Z em aba própria no NOSSOM (27/10/2026)

- `/studio/z`: primeira aba (anel fino, "Z") na lateral e na barra do celular; `/studio` redireciona para ela (site,
  PWA e app de computador, com a busca junto). Tela toda, sem rodapé nem faixa de minutos. O Início foi para
  `/studio/inicio` e voltou ao de antes (assistente + envio de áudio). "Conectar com Absolute ZRO" volta para a Z;
  "Conversar com a Z" da home leva a `/studio/z`. Sem o login Absolute ZRO configurado, a aba some e `/studio` é o Início.
- `npm test` 83/83, `typecheck`, `format:check`, `build` ok. E2E completo: 79 (3 falhas na primeira rodada: disco cheio
  na máquina e dois testes ainda em `/studio`; corrigidos e repassados). `scan-secrets` limpo. Fotos 1440 e 390 px fora
  do repositório. Não validado: conta real e app instalado.

## Balão de pendências: AEON, Revela e NOSSOM (27/10/2026)

- Regras puras com teste (estado → número e dica por aba): AEON `src/pendencias.js` (`test/nucleo.test.js`), Revela
  `src/pendencias.js` (`test/pendencias.test.js`), NOSSOM `lib/studio-pending.ts` (`tests/studio-pending.test.ts`).
- AEON `npm test` **88/88** (a tela confere o balão de Revisar subindo e descendo ao aprovar/desfazer e o de Mídia ao
  reabrir e religar); `xvfb-run -a npx electron . --smoke` ok. Revela `npm test` **112/112** (Converter: na fila →
  pronto para baixar → some ao baixar; CST: some ao escolher o log). NOSSOM `npm test` **78/78**, `typecheck` e
  `format:check` ok, `npm run build` ok; e2e `cloud-restoration`, `studio` e `install-navigation`: 16/17, a que falhou é a
  gravação pelo microfone (o Chromium deste ambiente não dá o microfone; não toca no balão).
- Fotos (Playwright, claro e escuro, 1440 px e 390 px) conferidas a olho; ficaram fora do repositório.

## Carro do Freela: sem selo no topo e símbolo flat no login (27/10/2026)

- Carro, bateria completa (`npm test`, Chromium 1243): **87/87** em 20,5 min; `sem-zoom` falhou em paralelo e passou
  sozinha (regra do `run.js`). Conferido em tela a 390 px: barra de cima sem o selo "Prévia", "Prévia" no pé da home e
  o "Continuar com Absolute ZRO" com o símbolo flat (SVG, cor do texto). `scripts/scan-secrets.mjs` limpo.

## Carro do Freela → HUB: job, equipe e consentimento (26/10/2026)

- HUB, raiz: `npm run lint`, `format:check`, `typecheck` limpos; `npm test` (Postgres 16 local) **150/150**, com
  `tests/integration/carro-hub.test.ts` (10): escopo só no cliente do Carro; token vira a pessoa na organização do
  login e o job vira projeto com o briefing; token sem escopo, adulterado, de app removido no Perfil ou desativado é
  recusado; quem saiu da organização perde o acesso mesmo com token válido; equipe pede o job antes, membro entra
  direto, conta de fora recebe convite, reenviar não duplica; convite só a mesma conta aceita e abre só aquele
  projeto; **isolamento do convidado** (não vê membros, plano, vínculos, eventos da organização nem nomes de quem
  não está com ele num projeto; não importa job nem monta equipe; vê as etapas no estado real, sem "contratar");
  convite de convidado não rebaixa quem já é da organização; edição importa job mas não monta equipe.
- `npm run build` ok; `npm run test:e2e` **21/21**, com o novo `sso.spec.ts` "Carro do Freela": token do app cria o
  projeto pela API real sem cookie e com outra Origin (201, depois 200 com o mesmo id), Bearer inválido 401, equipe
  sem e-mail confirmado 403 `email_not_verified`, e a página do projeto com a seção Equipe.
- `npm run contracts:export` (novo `carro-do-freela.crew.v1.schema.json`); rota nova documentada no OpenAPI.
- Carro: `npm run test:api` **27/27** (HUB falso com refresh em rotação, revogação e as duas rotas): cookie `cdf_hub`
  cifrado e httpOnly em `/api/zro`; HUB sem o escopo → login refeito sem ele; envio monta só os campos do contrato
  (telefone fica de fora) e a equipe com conta; token vencido renova e o refresh velho derruba o acesso; portas
  fechadas (origem, método, tipo, sessão, conta trocada, plano, pedido ruim, recusa do HUB); sair revoga no HUB.
- Carro, navegador: `conta-zro` **54/54** (§10: botão no painel do job, HUB recebe o briefing inteiro, só quem tem
  conta vai na equipe, "Abrir na Absolute ZRO" depois, nada no lado do freela nem fora do domínio);
  `consentimento` **11/11** (caixa desmarcada, sem marcar não registra, marcar grava versão e data, retirada
  registrada, sobrevive ao recarregar, ninguém fictício "autorizou"). As quatro suítes das fases passaram com
  `public/fase-*.html` apagados: o `run.js` gera os sete builds.
- Carro, bateria completa (`npm test`, Chromium 1243): **87/87** em 20,5 min; `sem-zoom` falhou em paralelo e
  passou sozinha (regra do `run.js`, igual à rodada anterior). `node src/vercel-build.js` aprovado (build 26/out · 3).
- `node scripts/scan-secrets.mjs` limpo.

## Carro do Freela: leve sem perder qualidade (26/10/2026)

- Bateria (`npm run build:fases && npm run build && node test/run.js`, Chromium 1243): **86/86** em 20 min no arnês
  paralelo (antes 38 min em série). `sem-zoom` falhou em paralelo e passou sozinha (regra do `run.js`). O "87º" da
  contagem antiga era o `_servir.js`, ajudante sem asserção. `npm run test:api` 21/21. `node src/vercel-build.js`
  aprovado: 7 páginas anônimas, FASE e VERSAO conferidas no HTML + script, m/ só com o que as páginas citam (279
  arquivos, 138 MB), CSP com 1 script embutido. `scripts/scan-secrets.mjs` limpo.
- Peso e LCP (servidor com brotli e cache longo em `m/`; celular 390@3x em 4G simulado 1,6 Mb/s/150 ms e CPU 4×):
  1ª visita 1,7 MB → 1,37 MB e LCP 7,3 → 4,1 s; 2ª visita 852 → 173 KB e LCP 5,9 → 1,6 s. Computador: LCP 808 → 548 ms.
- Qualidade (SSIM/PSNR contra o master sem perda remontado do Kling): carona no celular 0,923/31 dB → ~0,984/41 dB;
  receita da montagem conferida a ~40 dB por quadro contra o vídeo antigo. Capturas lado a lado (home e login com
  vídeo, praça, brechó e fechamento, em 1440@2x e 390@3x) entregues ao titular; o "pode subir" é dele.
- Não feito: dividir o script por tela (40% do script roda na primeira tela, mas 838 de 840 KB são alcançáveis do
  arranque); fica para projeto próprio, com o aval do titular.

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
  Release nossom-v\* mais novo ou pelo repositório antigo; GitHub fora do ar não quebra o catálogo; download só de
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

## AEON: marca, Seus universos, Inspector, Histórico e site (26/10/2026)

- `products/ai-edit`: `npm test` (unidade, exportadores com xmllint e JSON Schema, SOBEDESCE, instaladores) **27/27**;
  telas no Chromium **4/4** (+1 que baixa o Whisper, pulada sem rede): caminho inteiro com Inspector (opacidade e
  escala viram uma ação no desfazer e vão para o FCPXML), marcador (M) e Histórico (volta e avança), autosave em Seus
  universos, reabrir e religar o vídeo pelo nome, projeto novo 9:16 a 25 qps e renomear. Smoke do Electron ok.
- Marca: geometria em `src/marca.js` (hipérboles), conferida lado a lado com a prancha do titular; letras do nome em
  contorno da Montserrat SemiBold (OFL) por `scripts/letras.py`.
- Site: telas do app tiradas por `scripts/telas.mjs` (o app de verdade, com vídeos de demonstração gravados das imagens
  do Higgsfield e transcrição trocada por roteiro fixo, porque a fala sintética não tem palavras). Conferido em escuro,
  claro e 390 px de largura.
- Não validado: o app no navegador em Safari e Firefox (precisa de WebCodecs; o site indica Chrome ou Edge).
- Conta obrigatória: `test/zro.test.js` **21/21** (entrar, criar conta, volta, sessão sem token, recusas de state,
  nonce, emissor, público e assinatura, login desligado → 503) e o teste de tela "só com conta" (sem sessão o editor vai
  para `entrar.html?volta=/app/`; com sessão o menu mostra a pessoa).

## AEON: tirar mídia, selecionar várias, editor completo e homepage nova (26–27/10/2026)

- Tirar mídia: `test/nucleo.test.js` (some a mídia, os clipes, a transcrição, as propostas e as correções; uma ou
  várias; desfazer devolve) e a tela "projeto novo" (× no cartão, Selecionar → marcar duas → Tirar do projeto → ⌘Z).
- Atualização pelo app: fica a da main (`desktop/atualizador.cjs`, "Versão nova · Atualizar"); uma segunda versão
  feita em paralelo (atualização ao fechar o app) saiu para não ter dois atualizadores.
- Instalador do Terminal conferido de ponta a ponta com os comandos do Mac simulados no Linux (build 8 baixado,
  SHA-256 conferido, `AEON.app` em Aplicativos). No Mac de verdade parou em `NOME?: unbound variable`: o bash 3.2 lê o
  "…" colado em `$NOME` como parte do nome. Variável colada em caractere não ASCII vai entre chaves e
  `test/instalacao.test.js` confere o arquivo inteiro. Não validado: o bash 3.2 rodando aqui.
- Site: download direto com o passo da quarentena, 390 px sem rolagem lateral. Homepage: topo na tela toda no
  computador, cenas que se dissolvem no fundo, MacBook que abre, números que contam e três demonstrações ao vivo
  (rodam só na tela; paradas com "reduzir movimento"); conferida em 1440×900 (claro e escuro) e 390×844.
- Posicionamento (titular, 26/10/2026): o AEON é editor completo e a IA é ajuda opcional. Textos do site, do app, do
  HUB (linha do catálogo, página do projeto, migration 0014 para descrição e papel no fluxo) e regras do produto
  (`products/ai-edit/CLAUDE.md`). Downloads do HUB: AEON com Mac, Windows e navegador; `/baixar/mac` e
  `/baixar/windows` do site redirecionam para o Release (regra de "instalador pela rota /baixar do site" conferida).

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

## Revela em revela.absolutezro.com (26/10/2026)

- A pedido do titular, o projeto Vercel `revela` ganhou o domínio `revela.absolutezro.com` (zona do absolutezro.com na
  própria Vercel, HTTPS no ar). `revela-zro.vercel.app` redireciona (308) para o endereço novo pelo `vercel.json`.
- Links trocados na Revela (canônico, OG, login `SITE`), no HUB, no Nossom, no TPEasy (cache v13) e no Carro do Freela.
  Ficaram com o endereço antigo, que redireciona, os menus do Synquei (`app/`) e do SOBEDESCE (computador e web): mexer
  neles dispara a publicação do app de computador, que o titular deixou para depois.
- Login único: o cliente `revela-web` no console do HUB deve usar `https://revela.absolutezro.com/api/zro/callback`.
- `products/finishing`: `npm test` 89/89; TPEasy 23/23; raiz: lint, formato e typecheck.

## Revela: abas sem recarregar e login cadastrado (26/10/2026)

- Bug relatado pelo titular: tocar numa aba do dock recarregava a página inteira (menu, logo, dock). Agora
  `app/navegar.js` busca o painel da aba uma vez, troca só o `<main>`, roda o módulo dele uma vez e atualiza título,
  canônico e histórico (voltar/avançar funcionam). O painel de antes fica guardado com o que estava (frame, looks,
  conversão em andamento). Cada módulo procura os elementos no próprio `<main>` (`raiz`), então os painéis não se
  misturam. Início, conta e links externos seguem pelo link. A marca da aba ativa é uma peça só que desliza de aba em
  aba (sem deslizar com "reduzir movimento"). Sem `fetch`/`history` ou com erro, vai pelo link como antes.
- Teste novo no Chromium: LUT → CST sem recarregar (marca na `window` e no menu continuam), marca desliza, CST baixa o
  `.cube`, voltar devolve o LUT com o frame e os 5 looks, e o CST guarda a câmera escolhida.
- Login: cliente `revela-web` (confidencial, confiável, produto `finishing`) e auditoria `oauth_client.created` no
  banco `AbsoluteZRO`; `sso_start_url` = `https://revela.absolutezro.com/api/zro/entrar`; `ZRO_CLIENT_ID` na Vercel.
  O segredo não está no repositório: o titular cola `ZRO_CLIENT_SECRET` na Vercel. Login de ponta a ponta ainda não
  testado.
- `products/finishing`: `npm test` 90/90; raiz: lint e formato.

## Revela: estudo com stills reais e Clonar com mais frames (26/10/2026)

- Material do titular (fora do repositório): 4 cenas em S-Log3 / S-Gamut3.Cine, o Rec.709 e o look de película de
  cada uma, e os PowerGrades (`.drx`). O `.drx` mostra o caminho: CST S-Log3 → LogC3 (EI 800) / AWG3, negativo e cópia
  em LUT, utilitários, grão, halação e um DCTL; a versão Rec.709 troca a CST para Rec.709 e mantém as primárias.
- Clonar LUT, medido nessas cenas (ΔE Oklab ×100, numa cena que a LUT não viu): log → Rec.709 1,52 → **0,69** com 3
  frames e 2,61 → **1,17** com um; log → look 7,17 → **6,18** com um e 5,07 com 3. O look não cabe numa LUT só
  (mesmo com as 4 cenas, 2 a 4 de erro): muda de plano para plano e tem grão e halação. A orientação automática acertou
  24 de 24 pares e o "mesmo quadro" separou as 16 combinações de cena.
- Tela: "Mais frames" no lugar do conta-gotas no clone, contagem de frames e aviso para imagem sem par.
- CST: saída "ARRI LogC3 / AWG3 · para LUT de película" (log para log, sem mapa de tom), como no node tree estudado.
- Testes: unidade (curva vale em outra cena, 2 frames ≥ 1, orientação, outra cena recusada, LogC3) e Chromium (stills
  em qualquer ordem e um sem par). `products/finishing`: `npm test` 94/94; raiz: lint e formato.
- Não validado: a LUT clonada aplicada dentro do Resolve em material de vídeo; o Rec.709 do estudo inclui as primárias
  do colorista, então ele não mede a CST da Revela sozinha.

- Ícone do app (pedido do titular): placa branca chapada, sem sombra nem degradê, anel no centro e marca maior
  (`scripts/marca/icones.py`, diâmetro 0,56). Gerado de novo para o HUB (`--instalar`) e para o app (`npm run icons`).

## App para computador 1.1.1: cliques voltam a funcionar no Mac (26/10/2026)

- Causa: no Mac, a área de arrastar janela (`-webkit-app-region: drag`) da página da barra (`barra.css`, `.barra` com
  `height: 100%`, isto é, a janela inteira por baixo do HUB) e da abertura (`abertura.css`, `body`) vale para a janela
  toda e engole os cliques no painel. Os botões Voltar/Avançar/Início também ficavam no meio da janela, escondidos.
- Correção: a barra arrasta só nos 38 px de cima (`ALTURA_BARRA`); a abertura não arrasta. `test/cliques.test.mjs`
  (falha sem a correção, passa com ela); `apps/hub-desktop` `npm test` 25/25.
- Conferido no Linux (Electron 44 em tela virtual, cliques e teclado reais pelo X): abertura, login em `/app/entrar`,
  painel `/app` e clique em Planos na barra lateral. A barra renderizada tem 38 px com os botões dentro.
- Painel no app: ferramenta sem versão para o computador (NOSSOM hoje) mostra **Abrir na web** em vez de ficar sem
  botão. SOBEDESCE e Synquei têm instalador para Mac e Windows no catálogo (`/api/v1/desktop/apps`).
- Não validado: o Mac de verdade (a área de arrastar só vale lá e no Windows); conferir no 1.1.1 instalado.

## Revela Look com a luz do grade do titular e Meus looks (26–27/10/2026)

- Primeira tentativa recusada pelo titular ("não tá bonito nem perto"): o ajuste automático dos 15 parâmetros baixou o
  erro médio (6,2 → 2,9) amarelando as altas e o branco. A comparação mostrada ainda aplicava o look num frame que já
  tinha o grade dele (grade em dobro). Não foi para a main.
- Leitura por faixa de luz (Rec.709 → grade dele, 3 cenas): o grade sobe o meio-tom (L 41 → 46, 58 → 69, 75 → 83)
  com preto e branco no lugar, esquenta meios e altas (b +2 a +3) e deixa a sombra neutra. O motor ganhou `gama`
  (curva do meio sem mexer nas pontas) e `meios` (tom no meio-tom que some antes do branco), opcionais.
- Versão final: base antiga + gama 1,2, contraste 7, pivô 0,28, densidade 0,25, saturação 0,95, sombra neutra, meios
  dourados e branco quase neutro; matizes da base. Erro médio 6,21 → **2,92**; comparação visual nas 3 cenas perto do
  grade (o 1.19 é de outro grade). `marca/home/look-revela.jpg` refeita.
- **Meus looks** (`src/cor/meuslooks.js`): o clone vira LUT 33³ em 16 bits com nome, até 8, em `localStorage`; aparece
  na grade de looks em qualquer frame, baixa `.cube` com o nome e apaga. Para o grade exato do titular sem publicar o
  look de um pacote pago no site.
- Testes: unidade (ida e volta do look salvo, intensidade, nome, registro corrompido; Revela Look com meio claro e
  dourado, branco neutro, sombra neutra; Petróleo segue com sombra fria) e Chromium (clone → salvar → outra visita →
  grade com 6 looks → baixar `revela-zro-filmes-33.cube` → apagar). `products/finishing`: `npm test` 96/96.
- Não validado: o `.cube` do look novo e de um "meu look" no Resolve, em vídeo.

## Z: sabe o que cada plataforma faz e só busca no Drive quando pedem (28/10/2026)

- Caso real do titular na Revela: "Consigo deixar meu vídeo com a cor parecida do FVPRO+?" A Z buscou no Drive (o texto
  de sistema mandava usar o Drive "sem pedir licença sempre que a pessoa falar de arquivo, pasta, vídeo, referência"),
  achou o .zip do pacote e disse não saber se a Revela fazia isso.
- Agora: o Drive entra só quando a pessoa pede ou fala dele (meu Drive, minha pasta, um arquivo pelo nome); pergunta de
  como fazer vai para a plataforma atual. O texto de sistema traz o que cada uma das sete faz hoje
  (`apps/hub-web/lib/ia/plataformas.ts`, fixo, no cache), e para a Revela diz que pacote de LUTs não se aplica direto: o
  caminho é Clonar LUT com frames antes e depois, salvando em Meus looks.
- Teste novo `tests/integration/ia-plataformas.test.ts` (3/3): o guia cobre exatamente os produtos do catálogo, a Revela
  aponta Clonar LUT e Meus looks, e o texto de sistema tem a regra nova do Drive e o guia. Lint, formato, tipos verdes.
  `npm test` completo fica para o CI (sem Postgres local nesta sessão).
- Não validado: resposta real da Z com a chave em produção.

## Revela: abertura de película e transições no celular (27/10/2026)

- Vídeo do titular no iPhone: a abertura do ícone não agradou ("mais a ver com película"); trocar de aba deixava o
  painel novo borrado; pela gaveta a página e o dock pulavam.
- Abertura nova (`app/abertura.js` + CSS): sala escura com luz vermelha de segurança tremendo, tira de película em
  diagonal entrando como no projetor, sete quadros latentes revelando em sequência (cada um um recorte da luz da
  marca; o do meio é o quadro do ícone), vazamento de luz laranja atravessando, grão de filme, nome em branco e a
  sala acendendo para a ferramenta. Quadros conferidos com a animação parada a 0,1 / 0,45 / 0,8 / 1,1 / 1,35 / 1,7 /
  2,1 / 2,5 / 2,8 s.
- Troca de aba: o painel novo reentrava com a entrada lenta com desfoque (`.entra`, 0,8 s) a cada troca. Agora a
  entrada lenta fica para a primeira visita; a troca é um deslize curto (0,32 s) para o lado da aba.
- Página mais larga que a tela na Entrega (o deslize e a fileira de destinos passavam de 390 para 401–408 px): no
  iPhone isso alarga a tela inteira e tira o dock do lugar. `html, body { overflow-x: clip }`.
- Teste novo: pela gaveta até a Entrega em 390 px, a página fica em 390 e a entrada lenta não roda. `npm test` 102/102.
- Não validado: num iPhone de verdade.

## Revela: abertura do app (27/10/2026)

- Pedido do titular: animação ao abrir o app. `app/abertura.js` (script do `<head>` nas quatro ferramentas) cobre a tela
  antes do primeiro quadro; o ícone entra com mola, o "revelado" varre o quadro da película da direita com o fio de
  luz na frente e a tela some com o ícone crescendo. Só CSS, sem animação por quadro; toque pula; some sozinha em 4 s
  no pior caso.
- Só no app aberto do ícone (`display-mode: standalone`), uma vez por abertura (`sessionStorage`), nunca com reduzir
  movimento. `?abertura=1` força no navegador.
- Conferido em quadros a 0,25 / 0,7 / 0,95 / 1,3 / 1,7 / 2,3 s (Chromium, 390 px). Teste: sem abertura no navegador
  comum; com `?abertura=1` aparece, sai sozinha e a página fica utilizável. `npm test` 101/101.
- Não validado: num iPhone de verdade.

## Revela como app no iPhone (27/10/2026)

- Pedido do titular: a experiência do computador no celular, a partir do Compartilhar do Safari. O iOS não deixa site
  virar destino do Compartilhar; o caminho é **Adicionar à Tela de Início**, que fica no mesmo menu.
- `manifest.webmanifest` (standalone, abre em `/lut`, atalhos das quatro ferramentas), `apple-touch-icon` 180 e ícones
  192/512 (`scripts/icones-app.mjs`), metas de app do iOS e barra de status translúcida em todas as páginas; o topo, o
  menu, o início e o entrar respeitam a área da hora e da bateria. `theme-color` segue o tema (era escuro no claro).
- Menu: "Instalar o app" (folha com Compartilhar → Adicionar à Tela de Início no iPhone; pedido do Chrome no resto).
- Bug do menu: o ouvinte de troca de aba estava colado 4 vezes, três delas dentro das funções do botão do menu
  (cada abrir/recolher registrava mais um). Agora um só.
- Testes no Chromium: manifesto e tamanhos reais dos PNG, metas nas seis páginas, folha de instalar com o
  user-agent do iPhone, item escondido no computador, menu aberto e recolhido 4 vezes seguindo a aba.
  `products/finishing`: `npm test` 100/100.
- Não validado: num iPhone de verdade (ícone, barra de status, login pela conta Absolute ZRO dentro do app instalado).

## Revela no celular: .cube, tela do Converter, login e conversão (27/10/2026)

- `.cube` baixava como `.cube.txt` no iPhone: o Safari põe `.txt` em arquivo `text/plain`. Downloads de `.cube` e
  `.py` agora saem como `application/octet-stream` (teste confere que nenhum download usa `text/*`).
- Converter no celular: um nome de arquivo comprido alargava a grade da fila (trilha `auto` cresce até o texto
  inteiro), a página passava de 390 para 604 px, cortava à esquerda e a marca do dock caía entre duas abas. Fila e
  corpo do item com `minmax(0, 1fr)`; a marca também segue o dock por `ResizeObserver`.
- Login: a fileira "Uma conta para" ganhou AEON e Absolute ZRO.
- Velocidade: no caminho antigo o Mediabunny reduz 4K → 720p num canvas 2D, que no Safari tende a copiar o quadro
  para a CPU. Novo `app/escala-gpu.js` reduz em WebGL2 (mipmaps, rotação do celular, contain/fill) quando há GPU de
  verdade. No contêiner de teste (SwiftShader, sem GPU) o caminho novo é ~5× mais lento que o canvas (30 s × 6,5 s
  num 4K de 4 s), por isso só liga com placa de vídeo real. Teste no Chromium: vídeo 1080p girado 90° convertido para
  720p pela GPU e pelo canvas dá o mesmo quadro (diferença média 0,66 em 255; com a rotação trocada, 116).
  `products/finishing`: `npm test` 98/98.
- Não medido: tempo de conversão num iPhone real (aqui não há aparelho).

## Página inicial: faixa das ferramentas (26/10/2026)

- Cartões verticais (ícone em cima, nome numa linha, apoio em até duas linhas reservadas): os sete com a mesma altura
  e sem nome quebrado. Abaixo de 1100 px, quatro por linha com a segunda centralizada. Capturas em 1440 (claro e
  escuro), 1000 e 390 px; `npm run test:e2e` verde.

## Página inicial com dados do ecossistema (26/10/2026)

- Novas seções: **Em números** (contam ao aparecer; ferramentas, eventos e formatos vêm do catálogo e de
  `@zro/media-contracts`, nada digitado à mão), **Conheça de perto** (abas com a tela real de cada app num MacBook e
  iPhone, três fatos e o site; passa sozinha e pausa com mouse, foco ou fora da tela), **Do job à entrega** (o fluxo
  com os eventos reais que cada app manda para o HUB) e **Um app no computador** (o painel do app e o HUB no iPhone).
- Imagens novas: `produto-hub-*` (painel `/app` e `/inicio` de hoje), `produto-ai-edit-*` e `produto-finishing-*` (os
  sites no ar), por `scripts/marca/aparelhos/produtos.py`.
- Capturas em 1440 (claro e escuro) e 390 px; `npm run test:e2e` 21/21 (axe incluso).

## Downloads por ícones, NOSSOM no Mac e símbolo do fim da home (27/10/2026)

- `/baixar` e `/downloads`: só os ícones; o toque abre a parte de download do app (Mac, Windows, celular ou
  navegador, Terminal e primeira abertura) e o **Conheça mais** (página da plataforma, `site` em `lib/downloads.ts`).
  `#app-<id>` no endereço abre o app certo (links dos sites de cada ferramenta). O cartão do Absolute ZRO para
  computador não estoura mais: botões numa linha e o Terminal recolhido.
- Links conferidos com download real (GET com Range até o arquivo): SOBEDESCE 0.1.0 b1025, Synquei 1.0.0 b1027,
  Absolute ZRO 1.1.1 b13 (Mac e Windows); NOSSOM 0.2.2 (Mac Apple Silicon, Intel e Windows) depois do workflow
  `nossom-desktop.yml` corrigido (o passo de validação rodava antes do checkout) e disparado como prévia.
- NOSSOM no Mac: `xattr` em app já em Aplicativos falha no macOS novo sem Gerenciamento de Apps. Novo
  `products/nossom/public/instalar.sh` (curl, sem quarentena; escolhe Apple Silicon ou Intel; `hdiutil verify`; refaz
  a assinatura local se não conferir). `tests/instalar-mac.test.ts` 3/3; `npm test` do NOSSOM 76/76. Não validado
  num Mac de verdade.
- Símbolo do fim da página inicial: animava com a rolagem e ficava travado no meio quando a página acabava antes;
  agora desenha uma vez quando aparece (`components/home/aparece.tsx`).
- HUB: `npm test` 153/153; `npm run test:e2e` 21/21.
- Fotos dos aparelhos (`produto-*.webp`) sem fundo chapado (`scripts/marca/aparelhos/transparente.py`, máscara do
  molde): sem o retângulo preto atrás do notebook no tema escuro nem o branco no claro. Conferido em 1440 px.

## AEON: menu lateral que funciona (27/10/2026)

- Causa: a conta era `<a href="../entrar.html" target="_blank">` (`app/trilho.js`); no app de computador o
  `setWindowOpenHandler` (`desktop/main.cjs`) só entrega `http(s)` ao navegador e recusa o resto, então o clique morria; no
  navegador abria outra aba do entrar. "Seus universos" não fazia nada na própria lista (sem estado de selecionado) e
  "Salvar cópia" sem projeto voltava calado (`salvarAgora`).
- Agora: Projeto (Seus universos com `aria-current`, Novo projeto, Abrir projeto…, Salvar cópia desligado sem projeto
  e ⌘S avisando); embaixo "Apps Absolute ZRO" (uma linha; grade com os sete apps em popover) e o cartão da conta (menu
  com Conta Absolute ZRO e Sair por `POST /api/zro/sair`). Etapas seguem no dock.
- `test/tela.test.js` › "menu: cada item faz algo de verdade" (falha no código antigo): seletor de arquivo, projeto
  novo pelo menu, download da cópia, volta à lista, aba nova do SOBEDESCE, sair indo para entrar.html, e todo link de
  fora do menu em `https` (o caso que o Electron recusava). `npm test` 57/57 (1 pulado: Whisper, sem rede).
- Conferido no Electron 44 em tela virtual (Playwright `_electron`, conta falsa em `conta.json`): Novo projeto, diálogo
  de salvar, volta à lista, Revela e Conta Absolute ZRO no navegador do sistema, Sair apaga `conta.json` e vai para
  entrar.html. `--smoke` OK.

## Absolute ZRO para computador 1.2.0: "Atualizar" com um clique (27/10/2026)

- Como no SOBEDESCE: o aviso de versão nova tem **Atualizar**. O app baixa o instalador de `/baixar/hub/<sistema>?build=N`,
  confere o SHA-256 publicado em `/baixar/hub/versao`, prepara a troca (Mac: `hdiutil` + `ditto` ao lado do app +
  `xattr -cr`; Windows: NSIS `/S`), fecha e abre já na versão nova (`desktop/atualizador.cjs`). Progresso na barra do
  ícone (Dock/barra de tarefas), sem diálogo piscando. Se não dá para trocar (aberto do disco de instalação, sem
  permissão, troca anterior que falhou), o botão vira **Baixar**.
- `test/atualizador.test.mjs` (Mac e Windows com comandos falsos, SHA-256 que não bate, build novo no meio, marca de
  falha) e o aviso entregando o build certo: `npm test` 35/35; `--smoke` ok no Electron 44 (Linux).
- Quem está na 1.1.1 atualiza para a 1.2.0 pelo comando do Terminal uma última vez; dali em diante, pelo botão.
- Não validado: a troca num Mac e num Windows de verdade.

## Synquei: aviso de download que não pisca (27/10/2026)

- Causa: `desenhar()` em `products/synquei/app/js/atualizacao.js` trocava o `innerHTML` do cartão a cada evento de
  progresso (até 4 por segundo, `desktop/atualizador.cjs`); o `.atu` nascia de novo e a entrada `rise` (`app.css`)
  recomeçava do transparente, então o aviso piscava. A barra também nunca deslizava (nascia já na largura nova).
- Agora `aplicarCartao()` compara a forma do cartão sem os números: se só o progresso mudou (baixando, conferindo,
  preparando), troca no lugar o texto, a largura e o `aria-valuenow`; o cartão só é refeito quando muda de verdade
  (pronto, erro, Depois). Ajustes não se redesenha mais a cada pedaço baixado. Reduzir movimento segue pela regra
  global. `sw.js` foi para `synquei-v15`.
- `tests/aviso-atualizacao.test.mjs` (3 casos): 40 eventos de progresso com uma troca de HTML só, conferindo/preparando
  no mesmo cartão, barra indeterminada sem tamanho. `npm test` em `products/synquei`: 71 ok, 4 pulados, 0 falhas.
- Chromium (Playwright) com o app servido e o atualizador falso, 46 eventos: antes 46 cartões recriados, 46 entradas
  reiniciadas e opacidade ~0,3 60 ms depois de cada evento; depois 0, 0 e opacidade 1.

## Ciclo do O sem a pílula atrás e login com a paisagem da marca (27/10/2026)

- `/ciclo`: o seletor Mensal/Anual de Planos usava a classe `.cycle`, a mesma do Ciclo do O, e desenhava uma pílula
  enorme atrás do anel. Virou `.cobranca`.
- Telas de conta (`(auth)/layout.tsx`): a paisagem da marca no fundo, com véu e zoom lento (parado com "reduzir
  movimento"); frase oficial "O futuro começa do zero."; o login cita todas as ferramentas.
- `npm run test:e2e` 21/21. Capturas de `/entrar` (claro, escuro, 390 px) e `/ciclo`.

## AEON: site sem corte seco, fecho inteiro e "Atualizar" no app (27/10/2026)

- Site (`products/ai-edit/index.html`, `site/site.css`, `site/home.js`): a abertura escurece até o preto e a salina vira
  uma passagem sem texto que nasce do preto e volta para ele (máscara em cima e embaixo), no lugar das duas fotos
  coladas num corte seco. Saiu "O espaço entre os instantes." (subtítulo da abertura, título da salina e o
  `og:description`, que agora diz o que o AEON faz). O fecho usa a estrela de palco (`simbolo({ brilho, margem })`,
  pontas e fios somem aos poucos, com respiro) e segue o tema; antes os fios terminavam num corte reto e pareciam
  cortados. De quebra: os cartões de Baixar não alargam mais a página no celular (`minmax(0, 1fr)`; o botão Copiar
  ficava fora da tela) e o menu fechado não mancha mais a borda esquerda no tema claro (sombra fora da vista).
  Conferido no Chromium em 1440 e 390 px, escuro e claro, com "reduzir movimento".
- App de desktop (`desktop/atualizador.cjs`, `desktop/main.cjs`, `desktop/preload.cjs`, `app/atualizacao.js`), no
  molde do SOBEDESCE: só no app empacotado com build do CI (`desktop/build-info.json`; build 0 não pergunta nada),
  confere o `versao.json` do Release `ai-edit-app-desktop` (o mesmo do `instalar.sh`) 10 s depois de abrir e a cada 4 h.
  Build maior = pílula "Versão nova · Atualizar" na barra. Atualizar baixa o instalador do Release com progresso
  medido (barra fina que só avança), confere o SHA-256, prepara a troca (Mac: `hdiutil` + `ditto` ao lado + `xattr -cr`;
  Windows: NSIS `/S`), grava o projeto aberto (recusa com exportação andando), entrega o script e fecha; o script
  espera o app sair, troca e abre de novo. Falhou: o antigo volta, fica `atualizacao-falhou.json` e a próxima
  abertura oferece o Baixar (site `/#baixar`). Fora de Aplicativos, sem permissão ou sem SHA-256: só o Baixar.
- `test/atualizador.test.js` (17): Release igual ao do instalador, desenvolvimento sem rede, download com progresso,
  incompleto e parado, fluxo do Mac com peças falsas, SHA-256 diferente (nada trocado, temporários apagados), sem
  hash, sem permissão, AppTranslocation, `/Volumes`, marca de troca que falhou, entrega recusada, Windows (BOM,
  `/S`), progresso limitado e o script do Mac rodando de verdade (troca e abre; se falhar, volta o antigo e grava a
  marca). `test/tela.test.js` › "versão nova": a pílula com uma ponte falsa, Baixando 42%, barra sem voltar, Tentar
  de novo e Depois. `npm test` 76/76; `xvfb-run -a npx electron . --smoke` SMOKE OK.
- Não conferido: a troca num Mac e num Windows de verdade (precisa de um Release publicado com build maior que o do
  app instalado; publicar é decisão do titular).

## OG com a paisagem da home e o app no celular igual ao do computador (27/10/2026)

- OG (`scripts/marca/og-paisagem.html` → `app/opengraph-image.jpg` e `twitter-image.jpg`): a paisagem do topo da
  página inicial com "O futuro começa do zero.".
- App da Tela de Início (Safari › Compartilhar › Adicionar à Tela de Início): abre no painel `/app` (manifest), com a
  abertura da marca (`components/abertura-app.tsx`, só em `display-mode: standalone`, uma vez por sessão) e o login
  do app. No celular a barra lateral vira barra de abas (Apps, Projetos, Planos, Conta), a conta fica no avatar do
  topo e as ferramentas numa lista compacta com "Abrir". No Safari sem instalar, o topo ensina a pôr na Tela de Início.
- Conferido no Chromium com o iPhone 14 emulado (claro e escuro); a abertura, aplicando as regras do modo standalone
  na página (o Chromium não emula `display-mode`). `npm run test:e2e` 21/21. Não validado: num iPhone de verdade.
- Ícone do iPhone (`app/apple-icon.png`): placa grafite com o anel branco (`icones.py`, tema escuro). O ícone de Tela
  de Início não tem versão escura e o branco ficava "gravado" no modo Escuro do iPhone. Computador segue branco.

## Perfil único: a conta Absolute ZRO vale para todas as plataformas (27/10/2026)

- HUB: o login único passa a entregar `picture` (foto num endereço público que muda a cada foto nova,
  `/api/v1/foto/<uuid>`), `updated_at` e `zro_conta` no escopo `profile`. Migration 0015 (aplicada no banco novo).
  Contrato para as plataformas: `docs/integration-contracts/perfil-unico.md`.
- `tests/integration/oidc.test.ts` › "perfil único (0015)": nome e foto vêm do login, foto nova muda o endereço e o
  antigo some. `npm test` 154/154.

## Perfil único no Synquei e no TPeasy (27/10/2026)

- O login pede também `offline_access`; o refresh e o access token ficam **cifrados** (AES-256-GCM) num cookie só de
  `/api/zro` (`sq_hub`, `tp_zro_hub`). A cada abertura (no máximo uma vez por minuto) o `/api/zro/eu` relê nome,
  e-mail, foto, organização e produtos em `/oauth/userinfo` (troca o refresh token, que roda, quando o access venceu).
  HUB fora do ar: vale a última cópia. Acesso removido no Perfil: a sessão acaba. Sair revoga o refresh token.
- Telas: foto da conta no avatar (sem foto, as iniciais) e **Editar na conta Absolute ZRO** (`zro_conta`, aba nova).
  No TPeasy, o "Nome" próprio some para quem entrou com a Absolute ZRO. Nenhum dos dois tem CSP; nada a liberar.
- Synquei: `tests/zro.test.mjs` › "perfil único" (9) e `tests/conta-ui.test.mjs` (2 novos); `npm test` 82 ok, 0 falha.
  TPeasy: `tests/zro.test.mjs` › "perfil único" (8) e `tests/conta-ui.test.mjs` (4); `node --test tests/*.test.mjs`
  35/35. A Absolute ZRO falsa de cada um ganhou refresh que roda, `userinfo`, `revoke`, `picture` e `updated_at`.
- Não validado: contra o HUB de verdade (precisa de deploy e das variáveis já cadastradas). Sessões abertas antes
  disto seguem com a cópia do login até a próxima entrada.
- AEON e Revela (`products/ai-edit`, `products/finishing`): o login pede também `offline_access`. A sessão
  (`ae_conta`/`rv_conta`) guarda a cópia do perfil (nome, e-mail, foto, onde editar); os tokens vão num cookie
  cifrado (AES-256-GCM) só de `/api/zro`. Cada `/api/zro/eu` relê o perfil no `/oauth/userinfo` (renova o access
  token pelo refresh token se venceu; prazo de 3 s, senão vale a cópia). Refresh recusado: esquece os tokens e fica a
  cópia. Sair revoga o refresh token.
- AEON de computador (`desktop/conta.cjs`): relê o perfil a cada abertura; o refresh token só vai ao disco cifrado
  pelo cofre do sistema (`safeStorage`: Keychain/DPAPI). Sem cofre (Linux sem chaveiro), fica só na memória.
- Telas: a foto da conta no cartão e no menu da conta do AEON, no topo e na entrada da Revela e do site do AEON (sem
  foto ou foto que não carrega: iniciais). "Editar na conta Absolute ZRO" aponta para `zro_conta` e abre fora do app.
  CSP com `img-src https://absolutezro.com` (`vercel.json` dos dois e `desktop/cabecalhos.json`).
- Testes: AEON `npm test` 87/87 (login web e de computador contra a Absolute ZRO falsa com `picture`, `updated_at`,
  `userinfo`, refresh que gira e revogação; tela com a foto sob a CSP real); Revela `npm test` 109/109 com o mesmo teste de
  login e a tela da foto; `xvfb-run -a npx electron . --smoke` SMOKE OK. Não validado: contra o absolutezro.com de
  verdade e o cofre do sistema num Mac ou Windows de verdade.

## Assinatura e consumo, menu do celular (27/10/2026)

- `/assinatura` refeita: anel animado com os créditos de IA e GPU que restam (verde, âmbar acima de 75%, vermelho
  acima de 90%), contagem "Renova em…" até o fim do mês (UTC, atualiza a cada 30 s), cartão do plano com a contagem
  até `current_period_end`, barras das outras cotas, gráfico de uso por dia (toque ou passe o mouse) e últimos usos.
  Tudo vem do banco (`quota_usage`, limites dos planos, eventos de uso); nada é estimado. Não existe limite por sessão
  na plataforma: só o mês e o plano. Motion respeita "reduzir movimento".
- Menu do celular: o fundo do painel aberto passou a ser sólido (o vidro aninhado vazava o conteúdo no Safari).
- Validado: lint, format, typecheck, `npm test` 154/154, `npm run test:e2e` 21/21, telas claro/escuro/celular com
  dados de teste. Não validado: com consumo real em produção.

## Synquei de computador: conta Absolute ZRO (27/10/2026)

- `products/synquei/desktop/conta.cjs` (porta do AEON): cliente público `synquei-desktop`, login de app nativo (RFC 8252) no navegador do sistema com volta para `http://127.0.0.1:<porta>/callback`, PKCE S256, state, nonce e o
  `id_token` conferido pela JWKS. O protocolo do app (`desktop/main.cjs`) responde `/api/zro/eu`, `/entrar` e `/sair`
  no mesmo formato do site, então `app/js/conta.js` é o mesmo nos dois (no desktop liga quando a ponte tem `conta`).
- Perfil único: cada `/api/zro/eu` relê nome, foto, organização e `zro_products` no `/oauth/userinfo` (3 s, senão vale a
  cópia). O refresh token só vai ao disco cifrado pelo `safeStorage`; access token só na memória; sair revoga.
  `zro_products` só decide o aviso "sem acesso"; o plano continua Grátis para todos, como no site.
- Testes: `tests/conta-desktop.test.mjs` (7) contra a Absolute ZRO falsa, que ganhou cliente público e `vencer()`;
  `npm test` sem falhas; `xvfb-run -a npx electron . --smoke` SMOKE OK, agora conferindo "Entrar com Absolute ZRO" na
  barra lateral. Telas conferidas no Electron (logado com iniciais e sem sessão).
- Não validado: login contra o absolutezro.com de verdade e o cofre do sistema num Mac ou Windows de verdade.

## Entrar e criar conta como conversa (27/10/2026)

- `components/conversa-conta.tsx`: `/entrar` (e-mail → senha), `/criar-conta` (e-mail → nome → senha) e `/app/entrar`
  (mesma conversa, volta para `/app`). O orbe é o Z (ver "IA do ecossistema: o Z") com `data-estado` (absolute-zro,
  ouvindo, conferindo, pronto) e rótulo em pílula `aria-live`; no fim, ✓ em traço fino, "Conectado." e barra fina antes
  de abrir o destino. "Reduzir movimento" deixa tudo parado.
- A conversa só avança no cliente; nenhum e-mail é consultado antes do envio. `loginAction`/`signupAction` seguem
  redirecionando; com o campo `conversa=1` (só com JavaScript) devolvem o destino para o cliente mostrar "pronto". As
  páginas não redirecionam quem acabou de entrar quando estão respondendo à própria Server Action (`respondendoAcao`).
- Sem JavaScript todos os campos aparecem e o form posta direto; com JavaScript os passos fora da vez ficam no form
  (gerenciador de senhas: `email`, `name`, `current-password`, `new-password`), escondidos e `inert`.
- Validado: lint, format, typecheck, `npm test`, build, `npm run test:e2e` (conversa de entrar com erro e foco, sem
  JavaScript, cadastro/SSO pelos passos, axe em `/entrar` e `/criar-conta` nos dois temas). Telas conferidas em claro e
  escuro, 1280 e 390. Não validado: gerenciador de senhas real (Chrome/1Password/iCloud) e Safari antigo sem
  `@media (scripting)`.

## Balões de pendência no Synquei, TPeasy e Carro do Freela (27/10/2026)

- Mesmo desenho do SOBEDESCE e do HUB: pílula com número em negrito tabular, 99+ acima de 99, `aria-label`
  "N pendências", o que espera no `title` do item, entrada curta só em CSS (parada com reduzir movimento) e ponto com
  número no canto do ícone no menu recolhido e na barra do celular. Atualiza junto com o estado de cada app.
- Regras puras: `products/synquei/app/js/pendencias.js`, `products/tpeasy/app/js/pendencias.js` e
  `contarPendencias` em `products/carro-do-freela/src/template.html`. Synquei e TPeasy subiram o cache do service
  worker (v18 e v15); Carro subiu a `VERSAO` (27/out · 2).
- Testes: Synquei `npm test` sem falhas (+10 em `tests/pendencias.test.mjs`), TPeasy `node --test tests/*.test.mjs`
  41/41 (+6), Carro `node test/run.js` 88/88 (suíte nova `baloes`, 24 asserções: conta pura, ao vivo na lateral,
  recolhida, celular e gaveta). `node scripts/scan-secrets.mjs` sem segredos. Telas claro/escuro, computador e
  celular conferidas no Playwright.
- Não validado: o Synquei de computador no Electron (a barra é a mesma do site; balões de Organizar e Ajustes
  conferidos simulando o estado do desktop no navegador) e a falha de sincronização na nuvem do TPeasy (nuvem
  desligada no app).

## IA do ecossistema: o Z (27/10/2026)

- Uma IA para todas as plataformas (o "Z"): conversas guardadas por plataforma (`zro.ia_conversas`/`zro.ia_mensagens`,
  migrações 0016 e 0017, RLS por pessoa), 1 crédito `zro.ai_credits` por resposta (`concluirTurno`, chave
  `ia:<pergunta>`), API `/api/v1/ia` (estado, conversas, mensagens em NDJSON; CORS para quem chega com Bearer e escopo
  `zro.ia`), painel no HUB (`/ia` e `/app`) com a gaveta "Conversas" agrupada por plataforma e `<zro-ia>`
  (`public/ia/v1/zro-ia.js`) para as plataformas. Testes: `tests/integration/ia.test.ts` e `pendencias.test.ts`.
- Visual aprovado pelo titular em 27/10/2026: anel e estrela cromados em peças separadas (`public/ia/z/*.webp`, recorte
  alfa, servem em qualquer fundo) movidos por código (`apps/hub-web/lib/ia/z/motor.ts`): volta de 3,2 s, 0,75 de giro
  por volta, ritmo suave, horário, pausa de 1 s; estrela sempre por cima e centrada no tubo; anel girando devagar no
  próprio eixo (loop a cada 4 ciclos); conjunto flutuando; brilho e halo crescem com o giro e os raios longos só no
  auge. Em volta, o ar (`lib/ia/z/ar.ts`): rastro que contorna o anel e correntes em espiral, leves em repouso e mais
  fortes ouvindo, pensando e respondendo. Um laço de quadros só, fora do React; pausa fora da tela e em aba oculta;
  "reduzir movimento" para tudo. A mesma conta está copiada em `zro-ia.js` (as plataformas não importam o HUB).
- `/ia/*` responde com `Access-Control-Allow-Origin: *` (script módulo e máscara CSS de outra origem precisam de CORS).
- Conferido no Playwright: `/ia` claro, escuro e celular (início, pensando com o Z pequeno na barra, resposta),
  `/entrar` claro e escuro e `<zro-ia>` servido de outra origem sobre o azul do NOSSOM, sem erro de página.
- Não validado: migrações 0016/0017 no banco de produção e a IA com a chave real (só com a API falsa local); não
  publicado em produção.

## O Z nas páginas iniciais das plataformas (27/10/2026)

- Seção curta na home de AEON, Carro do Freela, Revela, NOSSOM, SOBEDESCE, Synquei e TPeasy: anel e estrela do Z
  (cópias locais de `apps/hub-web/public/ia/z/`, porque absolutezro.com/ia/z ainda responde 404 e AEON e Revela usam
  COEP `require-corp`), selo "Chegando ao <app>", uma linha do que ele vai fazer ali, quatro fichas (mesma conta,
  conversas reunidas, você confere antes, 1 crédito por resposta) e **Conhecer o Z** para absolutezro.com/ia. Não diz
  que o Z já funciona dentro do app. A estrela respira só em CSS e para com "reduzir movimento".
- Synquei e TPeasy: cache do service worker v18 e v15, com as duas imagens. Carro do Freela: VERSAO `27/out · 2`.
- Testes: AEON `npm test` 87/87; Revela 109/109; Synquei 89 ok, 0 falhas (4 pulados); TPeasy 35/35; NOSSOM
  format:check, typecheck, `npm test` 76/76, build e e2e da home (liquid-site, homepage-demo, design-review,
  install-navigation) 15/15; SOBEDESCE web lint, typecheck, `npm test` 231/231 e build; Carro do Freela 87 de 87
  suítes (4 de novo sozinhas, como o arnês prevê) e `test:api` 27/27; `node scripts/scan-secrets.mjs` sem segredos.
- Telas conferidas no Playwright (Chromium), computador 1440 e celular 390, claro e escuro onde há, sem rolagem
  lateral. Não validado: o link absolutezro.com/ia no ar (depende do deploy do HUB).

## A Z no painel inicial do Synquei e do TPeasy (27/10/2026)

- Synquei (site/PWA e app de computador) e TPeasy (site/PWA; não tem app de computador): o `<zro-ia>` de
  `absolutezro.com/ia/v1/zro-ia.js` é a primeira coisa do Início (Synquei) e de Roteiros (TPeasy), com apoio e quatro
  sugestões do contexto. O resto da tela continua logo abaixo; no Synquei a Z fica fora da tela que redesenha, então a
  conversa não se perde, e aparece só no Início. Tema: Synquei segue Ajustes › Tema (`data-theme`), TPeasy o aparelho.
- Como o token chega à Z: nunca pela página. `api/zro/ia.js` (Synquei) e `api/zro/ia.mjs` (TPeasy) leem o cofre
  cifrado da sessão (`sq_hub`/`tp_zro_hub`, só em `/api/zro`), renovam o access token se venceu e encaminham para
  `/api/v1/ia/*` com `Authorization: Bearer`, repassando o NDJSON em pedaços. Só `estado`, `conversas`,
  `conversas/<id>` e `mensagens`; POST/DELETE de outra origem é recusado. `vercel.json` reescreve
  `/api/zro/ia/:caminho*` para `?c=` (TPeasy ganhou `vercel.json` só com isso). No computador, `desktop/conta.cjs`
  (`repassarIa`) faz o mesmo no processo principal; a renovação do refresh token entra numa fila, para o perfil e a Z
  não gastarem o mesmo token (a Absolute ZRO derrubaria a família). No site a Z só monta depois do `/api/zro/eu`.
- `zro.ia` entra no scope pedido (web e desktop). Sem sessão, ou login de antes da Z (401 mesmo depois de renovar): o
  repasse responde 401 com `reconectar`, a Z dispara `zro-ia:sem-login` e o app mostra "Entrar com Absolute ZRO" ou
  "Entrar de novo para usar a Z" (no computador, pelo login no navegador do sistema).
- Service worker: `synquei-v20` e `tpeasy-v17` com `app/js/z.js`; `/api/` e outras origens não passam pelo cache.
  Nenhum dos dois tem CSP: nada a liberar.
- Homes: "Já no Synquei"/"Já no TPeasy", **Conversar com a Z** (para o painel) e **Conhecer a Z**; texto no feminino.
- Testes: Synquei `npm test` sem falhas (novos: `tests/zro-ia.test.mjs` com 13 casos e dois em
  `tests/conta-desktop.test.mjs`: Bearer encaminhado sem cookie do site, 401 sem sessão, token fora da resposta e do
  disco, NDJSON em pedaços, renovação, sem `zro.ia`, caminhos e origem recusados, perfil e Z ao mesmo tempo); TPeasy
  `node --test tests/*.test.mjs` 49/49 (8 novos); `xvfb-run -a electron --no-sandbox . --smoke` SMOKE OK; e
  `node scripts/scan-secrets.mjs` sem segredos.
- Telas no Playwright com a API simulada (`page.route`): 1440 e 390, claro e escuro, sem conta, "entrar de novo" e uma
  conversa; no Electron, o Início carregou o script real de absolutezro.com e pediu para entrar (sem conta).
- Não validado: conversa de verdade com conta real (site e computador) e se o cliente `synquei-desktop` no banco tem
  `product_id = synquei` e `zro.ia` (cadastrado pelo console; clientes com produto ganham `zro.ia` no cadastro e pela
  migração 0016). O texto interno do painel ("Pergunte ao Z…") vem do `<zro-ia>` do HUB.

## A Z numa aba só dela no Synquei e no TPeasy (27/10/2026)

- Pedido do titular: a Z ganha aba própria, a primeira e a tela de entrada. Synquei (site/PWA e computador): item **Z**
  (anel fino) no topo da barra lateral e na barra de abas do celular (6 colunas); rota `#/z`, padrão para endereço vazio
  ou desconhecido. O `#zPainel` continua fora de `#view` (a conversa não se perde ao trocar de aba) e só aparece em
  `#/z`, ocupando a altura da janela. Atalhos: teclas 1–6 (Z, Início, Mídia, Sincronizar, Linha, Exportar) e o menu Ir
  do computador renumerado (⌘1 Z … ⌘6 Exportar, ⌘7 Projetos, ⌘8 Organizar); digitar no campo da Z não troca de aba. A
  lista da barra lateral rola em janela baixa. TPeasy: aba **Z** antes de Roteiros (4 colunas); o app abre na Z (um
  link com `#roteiros`, `#tp` ou `#ajustes` ainda abre a aba dele).
- O Início do Synquei voltou a ser o de antes (com "Bom dia"); Roteiros do TPeasy também, sem a Z em cima. Balões de
  pendência inalterados. Sem conta e "Entrar de novo" ficam dentro da aba; offline ou sem as funções da conta, a aba diz
  "A Z precisa de internet." com Tentar de novo e o caminho para Início/Roteiros. "Conversar com a Z" das homes leva a
  `/app/#/z` e `/app/#z`.
- Service worker `synquei-v21` e `tpeasy-v18`. Testes: Synquei `npm test` sem falhas (novo caso da aba no
  `tests/zro-ia.test.mjs`); TPeasy `node --test tests/*.test.mjs` 50/50 (novo caso da aba); smoke do Electron confere
  que o app abre na Z. Telas no Playwright com a conta e a Z simuladas: 1440 e 390, claro e escuro, sem conta, e o
  Início/Roteiros de volta.

## A Z no painel inicial do AEON e da Revela (27/10/2026)

- AEON: aba **Z** primeira no dock e página inicial do app (`app/z.js`), no site, no celular e no app de computador;
  o editor segue a um toque (⌘1 Z, ⌘2–5 Mídia a Entrega). Site: `<zro-ia>` de absolutezro.com (CSP `script-src` com
  absolutezro.com); app de computador: cópia em `vendor/ia` (`npm run vendor`), sem código de fora na janela com a
  ponte. Revela: `inicio.html` com a Z, aba Z no dock, item no menu, `start_url` `/inicio` e "Abrir a Revela" no painel.
- Token: a página fala só com `/api/zro/ia/*`. Site: repasse da Vercel (`api/_ia.js`, mesmo arquivo nos dois) com o
  access token do cookie cifrado, renovado pelo refresh token quando vence; resposta NDJSON passada aos poucos; só os
  caminhos e métodos do contrato; mudança só da própria origem e com JSON; sem sessão ou refresh recusado = 401 (o
  painel mostra "Entrar de novo"/"Entrar com Absolute ZRO"). Desktop: `desktop/main.cjs › repassarIa` com o token de
  `conta.cjs › tokenDeAcesso` (só no processo principal; um refresh por vez). O login pede `zro.ia`; se a Absolute ZRO
  devolver `invalid_scope`, entra de novo sem ele (web e desktop) e a Z fica em 401.
- Home: seção da Z como "Agora no AEON"/"Agora na Revela", com **Conversar com a Z** (painel) e **Conhecer a Z**.
- Testes: AEON `npm test` 102/102 (repasse em `test/ia.test.js`: Bearer, sem cookie para fora, NDJSON em pedaços,
  renovação, 401 sem sessão/token adulterado/sem escopo, outra origem, caminho e método fora do contrato, sem token na
  resposta, volta sem `zro.ia`; `conta-desktop`: token só no processo, refresh único, escopo recusado; telas com a CSP de
  produção e a Z simulada); `xvfb-run -a npx electron . --smoke` SMOKE OK. Revela `npm test` 124/124 (o mesmo repasse,
  painel com a CSP de produção, celular sem conta, seção da home). `node scripts/scan-secrets.mjs` sem segredos.
- Telas no Playwright (computador 1440 e celular 390, claro e escuro, conversa, gaveta Conversas, sem escopo).
- Não validado: produção (nada publicado), conta e IA reais, streaming pela Vercel, o repasse do app de computador
  contra a Absolute ZRO de verdade (só o smoke, que responde 401 à Z) e se `aeon-web`/`aeon-desktop` têm `product_id`
  (a 0016 só dá `zro.ia` a clientes com produto). Os textos dentro do `<zro-ia>` ("Pergunte ao Z…") vêm do HUB.

## A Z como painel inicial: SOBEDESCE e Carro do Freela (27/10/2026)

- SOBEDESCE: login pede `offline_access zro.ia` (sem o escopo, `invalid_scope` refaz o pedido sem ele); os tokens ficam
  cifrados na conta (`contas_zro.ia`, migração 0014) e `/api/zro/ia/*` repassa com o Bearer, renovando com a linha
  travada. Painel no topo de `/conta`, do Início do `/app/` (cache v62, 2.8.47) e do Início do app de computador
  (motor: `/api/ia/*` → site com o Bearer do dispositivo). CSP: script da absolutezro.com no `/app/` e no motor.
- Carro do Freela: login pede `zro.ia`; `/api/zro/ia/*` (função `ia`, streaming) usa o mesmo `cdf_hub`. Painel no topo
  do Feed (fora da `.wrap` que anima), só no domínio com conta liberada. CSP: script e imagens da absolutezro.com.
  VERSAO `27/out · 4`. Home dos dois: "Agora no <app>", **Conversar com a Z** e **Conhecer a Z**.
- Testes: SOBEDESCE web lint, typecheck, `npm test` (novo `zro-ia.test.mts`: Bearer encaminhado, streaming, sem sessão,
  origem, renovação sem derrubar a família, reconectar) e build; motor `test:fast` (novo `ia-z.test.js`). Carro
  `test:api` 33/33 (6 novos da Z), `conta-zro` com a seção 11 (painel, conversa, reconectar) e `node test/run.js` 88 de 88 (doca e sem-zoom de novo sozinhas).
- Telas (Playwright, 1440 e 390, claro e escuro, API simulada pela Absolute ZRO falsa, script do painel servido do
  repositório). Não validado: com conta e chave reais, e o app de computador dentro do Electron.

## A Z com aba própria: SOBEDESCE e Carro do Freela (27/10/2026)

- SOBEDESCE: aba **Z** primeiro e tela de entrada em todo lugar. Site: `/z` com as abas Z · Conta (controle segmentado);
  quem entra sem pedir página cai em `/z` (`destinoDeEntrada`; conta nova segue em `/conta?zro=ok`, celular em `/app/`);
  sem login, "Entrar com Absolute ZRO" dentro da aba; `/conta` voltou com o "Olá". App do celular: aba Z antes de Início,
  sempre (sem conta: "Entrar"; sem Drive: as outras abas mostram a tela da conta); cache v63, 2.8.48. App de computador:
  rota `#/z` padrão e primeiro item do menu; Início voltou com a saudação. Home: "Conversar com a Z" leva a `/z`.
- Carro do Freela: `#v-z`, só no domínio; primeiro item da lateral e, no celular, botão em destaque à esquerda do topo
  (a barra de baixo não comporta: 4 itens de um lado ficariam com ~40px a 390). Quem entra, termina o cadastro ou abre
  o app já dentro cai na Z; "Entrar" e "Reconectar" dentro da aba. Feed voltou a ser só o Feed. VERSAO `27/out · 5`.
- Testes: SOBEDESCE web lint, typecheck, `npm test` 244/244 (novo: entrar sem volta cai em `/z`), build; motor
  `test:fast` 726/726. Carro `test:api` 33/33, `node test/run.js` 88 de 88 (sem-zoom de novo sozinha, verde) e, depois
  do ícone final, conta-zro (74), home-clara, menu-recolhivel, mapa, baloes, doca, versoes, sem-zoom, seguranca,
  identidade e colisao sozinhas, todas verdes.
- Telas (Playwright, 1440 e 390, claro e escuro, Absolute ZRO falsa, script do painel servido do repositório; 320 no
  celular do SOBEDESCE e 360 no Carro sem rolagem lateral). Não validado: com conta e chave reais, e dentro do Electron.

## A Z no Google Drive, pelo SOBEDESCE (27/10/2026)

- HUB: ferramentas `buscar_no_drive`, `listar_pasta_do_drive`, `procurar_versao_no_drive` (só leem) e
  `pedir_ao_computador` (só com `confirmado_pela_pessoa` e um "sim" claro conferido no HUB, `confirmacaoClara`).
  Pedido ao SOBEDESCE com `assinarPedidoDeApp` (JWT `zro-pedido+jwt`, 60 s, `jti`, `zro_pedido` = ação). Painel mostra
  "Procurando no seu Drive…" (`rotulo` no evento `lendo`).
- SOBEDESCE: `/api/zro/drive/{buscar,pasta,versao,computador}` conferem o JWT pela JWKS (cache), `iss`, `aud`, vida,
  ação e uso único; conta pelo `contas_zro`; limite de 30 por pessoa em 10 min. O pedido ao computador é o mesmo
  "Baixar como…" do celular (`pedidos_proxy` tipo `formato`).
- Testes: raiz `npm test` 173/173 (novo `ia-drive.test.ts`: JWT na JWKS, aud, vida e typ; ferramenta contra
  SOBEDESCE falso; confirmação), lint, format, typecheck e build ok. SOBEDESCE web: lint, typecheck, `npm test`
  262/262 (novo `zro-drive.test.mts`: JWT ausente, vencido, de outro público, emissor, assinatura, ação ou
  reapresentado; sem vínculo, sem Drive, sem acesso; `q` escapada; só metadados; pasta por nome, id e ordem; versão
  pronta; pedido ao computador com e sem computador; limite) e build ok. `scan-secrets` limpo.
- Não validado: Drive e conta reais (busca `fullText` e `webContentLink` do Google de verdade), o computador real
  convertendo um arquivo fora de coleção, e `npm run test:e2e` (nenhum E2E cobre a Z).

### Abrir a pasta no SOBEDESCE (28/10/2026)

- SOBEDESCE: cada arquivo e pasta das rotas da Z traz `abrir_no_sobedesce` (`<site>/app/#drive/<id>`, a pasta dele
  ou a própria). App do celular 2.8.49 (service worker v64): `/app/#drive/<id>` abre a aba Drive na pasta, com a
  trilha pelos pais (`lib/drive-link.js`), de fora e com o app aberto; sem acesso, aviso e raiz.
- HUB: as ferramentas repassam o link (só o formato exato, na origem do SOBEDESCE), uma vez por pasta na listagem; o
  prompt pede botões em markdown (`[Abrir]`, `[Baixar]`, `[Abrir a pasta no SOBEDESCE]`) e nada de endereço cru.
- Testes: SOBEDESCE web lint, typecheck, `npm test` 263/263 e build; motor `test:fast` 731 ok, 3 pulados (novo `drive-link.test.js`,
  versão do app). Raiz lint, format, typecheck, `npm test` 174/174 (Postgres local) e build. Tela Playwright em
  390 px com Google falso: link de fora abre "Meu Drive › Projetos 2026 › Clipe Verão"; `hashchange` com o app
  aberto; pasta sem acesso mostra o aviso e fica na raiz; voltar sobe até a raiz. Não validado: Drive real.

### Abrir e Baixar pelo SOBEDESCE (28/10/2026)

- Pedido do titular: cada arquivo que a Z mostra tem exatamente dois botões, os dois pelo SOBEDESCE, nenhum link do
  site do Google Drive; pasta só Abrir.
- SOBEDESCE: as rotas da Z devolvem por arquivo `abrir_no_sobedesce` (`<site>/app/#arquivo/<id>`) e
  `baixar_pelo_sobedesce` (`<site>/app/#baixar/<id>`), por pasta só `abrir_no_sobedesce` (`#drive/<id>`);
  `webViewLink` e `webContentLink` saíram da resposta e do pedido ao Google. App do celular 2.8.50 (service worker
  v65, `lib/drive-link.js`: `linkDoHash`, `alvoDoLink`): `#arquivo/<id>` abre a pasta do arquivo (primeiro pai; sem
  acesso a ela, Compartilhados comigo) com ele na prévia; `#baixar/<id>` faz o mesmo e aperta o Baixar da prévia
  (download pelo service worker, confirmação acima de 1 GB, Docs do Google "Esse arquivo não pode ser baixado.").
  Vale de fora e com o app aberto (`hashchange`, mesmo com outra prévia aberta); o `#` some do endereço; sem acesso,
  na lixeira ou inexistente: "Esse arquivo não abriu neste Drive." e a raiz.
- HUB: `linkDoSobedesce` só repassa a origem do SOBEDESCE, caminho `/app/`, rota certa para o tipo e id do próprio
  item (qualquer outra coisa some); o prompt da Z pede por arquivo `[Abrir]` e `[Baixar]`, por pasta só `[Abrir]`,
  nunca link do Google nem endereço cru; o botão "Abrir a pasta no SOBEDESCE" por arquivo saiu.
- Testes: SOBEDESCE web lint, typecheck, `npm test` 263/263 (campos novos, nada de `drive.google.com` nem
  `webViewLink`/`webContentLink` na resposta e no `fields`) e build; motor `test:fast` 732 ok, 3 pulados
  (`drive-link.test.js`: `linkDoHash`, `alvoDoLink`; versão 2.8.50/v65). Raiz lint, format, typecheck, `npm test`
  177/177 (Postgres local; `ia-drive.test.ts`: os dois links por arquivo, só Abrir por pasta, link de outra origem,
  caminho, query, rota ou id some) e build. `scan-secrets` limpo. Os dois builds rodaram com `next build --webpack`:
  no worktree desta sessão o `node_modules` é um link para o checkout principal e o Turbopack recusa link que sai da
  raiz do projeto.
- Tela Playwright em 390 px com o Drive falso do repositório (`test/mock-drive.js`, `?dev_api=`) e o service worker
  de verdade: `#arquivo` de fora abre "Meu Drive › Projetos 2026 › Clipe Verão" com Teaser.mp4 tocando na prévia;
  `#baixar` com o app aberto dispara o download (evento do navegador, bytes iguais por MD5) e mostra "Baixando";
  arquivo de 2,1 GB pede a confirmação; sem acesso mostra o aviso e fica na raiz; Doc do Google avisa que não baixa;
  o `#` some em todos. Não validado: Drive e conta reais; iPhone de verdade (o app instalado recebendo o link com
  ele aberto).

## Maestro: Etapa 0, fundação (28/10/2026)

- Plataforma nova em `products/maestro` ([ADR 0022](decisions/0022-maestro-no-monorepo.md)): shell, login único,
  schema `maestro` com RLS, repasse da Z. Nada publicado; nenhum dado dos repositórios antigos.
- Produto: `npm run lint`, `format:check`, `typecheck`, `npm test` **47/47** em 4 arquivos (`node --test`, Postgres
  16 local, bancos `maestro_test_*`, Absolute ZRO falsa): `rls.test.mts` (RLS em toda tabela; dona vê a sua
  organização em 13 tabelas; organização forjada não lê nada em nenhuma; a mesma pessoa vê só a ativa; `org_id`
  trocado recusado; leitura não escreve; sessões e tentativas sem privilégio; papel só pelo login; só admin muda a
  organização; auditoria assinada e só inclusão; cards só por função, conflito por campo, lápide, outra organização
  inalcançável; decisões imutáveis e idempotentes; um link ativo por lote com 30 dias), `zro.test.mts` (entra e vira
  membro admin, Criar conta com `prompt=create`, papel reaplicado a cada login, sem organização, volta para fora
  recusada, recusa na Absolute ZRO, `invalid_scope` refaz com os básicos, state/nonce/aud/emissor/assinatura/cookie
  adulterados recusados, sem acesso cai em `/sem-acesso` e o `/eu` relê os produtos nos dois sentidos, perfil único,
  renovação do token, renovação recusada encerra a sessão, Absolute ZRO fora do ar mantém a última cópia, sair revoga
  na Absolute ZRO, POST de outra origem recusado, sessão forjada e vencida negadas), `ia.test.mts` (só os caminhos do
  painel, Bearer da sessão sem vazar o token, NDJSON em streaming antes do fim, 401/404/403/415, 403 sem acesso,
  login básico pede reconectar, renovação antes de repassar, recusa esquece os tokens, 502 sem derrubar a sessão) e
  `acesso.test.mts` (`temAcesso` com e sem a claim `zro_release`, tabela fixa de papéis); `npm run build` ok.
- Raiz, depois das mudanças no HUB (`ProductId`, `PRODUCT_SCOPES`, `plataformas.ts`, `0019_maestro.sql`, ícone;
  `ia-plataformas.test.ts` passa a ler os produtos de todas as migrations): `npm run lint` 0 problemas,
  `format:check` ok, `typecheck` ok, `npm test` **177/177** em 23 arquivos (Postgres local, banco `zro_maestro_test`,
  com a 0019 aplicada: `openapi`, `schemas`, `findEventCycle`, RLS do `zro` e o plano grátis com 7 apps seguem iguais),
  `next build --webpack` do hub-web ok (o `node_modules` do worktree é um link e o Turbopack recusa);
  `contracts:export` não mudou nenhum schema publicado; `scan-secrets`: nenhum segredo em 2.291 arquivos.
- Telas Playwright (Chromium 1.63; 1440 e 390 px, claro e escuro; 28 imagens): página inicial, `/entrar`, shell com
  a aba Z (o `<zro-ia>` publicado em absolutezro.com carregou e falou com a Absolute ZRO falsa pelo repasse), Quadro
  com as 8 colunas vazias, Aprovações (estado vazio), Ajustes e "sem acesso", contra a Absolute ZRO falsa e um
  Postgres local, com o build de produção (`next start`).
- Não validado: Absolute ZRO de verdade (cliente `maestro-web` não existe), o `<zro-ia>` publicado respondendo pelo
  repasse em produção, Supabase (o papel `maestro_app` precisa ser criado pelo `postgres` antes da primeira migração
  e o login do pool ser o dono do schema `maestro`), projeto Vercel e domínio.

## Gate de lançamento no HUB — Etapa B do PRD de acesso (28/10/2026)

- Decisão do proprietário aplicada ([ADR 0023](decisions/0023-gate-de-lancamento.md), migration
  `0018_release_gate.sql`): SOBEDESCE, Synquei e TPeasy `released` em todos os canais; NOSSOM, AEON (`ai-edit`),
  Revela (`finishing`) e Carro do Freela `development` sem canal; sem linha = fechado (o `maestro` nasce fechado).
  Única conta autorizada nos quatro = a do proprietário, inserida só em produção ([checklist 5a](operations/deployment-checklist.md));
  a migration traz apenas o exemplo comentado.
- Núcleo: `zro.product_release`, `zro.product_release_access`, `zro.release_allows(produto, pessoa, canal)` (RLS:
  estado legível por `zro_app`, lista só do sistema; auditoria por trigger, só-inclusão); `@zro/billing` `release.ts`
  (`releaseState` com cache de 30 s, `releaseAllows` por pedido, `releaseClaimsFor`, operações do console);
  `checkEntitlement(..., { who })` → `product_closed` antes do plano; `productAccessFor` → `access: 'closed'` +
  `release: { state, open, allowed, channels }` (pessoa da transação `asUser` ou passada; canal padrão web);
  `authorize()` com o canal do pedido (token de app = api, sessão = web) e `need.release`; erro
  `product_closed` 403 com `details.closed = true` e `upgrade = false`.
- Login único: `issueCode`, troca de código, refresh (`invalid_grant` "Este app ainda está em desenvolvimento."),
  `userinfo` e `authenticateAccessToken` (401) conferem `zro.release_allows` a cada pedido; claim `zro_release` em
  id_token, access token e `userinfo`; `zro_products` só com produtos contratados e abertos para a pessoa.
  `/oauth/authorize` de cliente fechado: página "Em desenvolvimento" (200) + auditoria `release.denied`
  (cliente e canal, nada privado); `prompt=none` → `access_denied`. `npm run db:release:revoke` (prévia por padrão,
  `--apply` com motivo e auditoria) para as sessões de antes do gate — **não rodado em produção**.
- HUB: componente `EmDesenvolvimento` (`/em-desenvolvimento/<produto>`: 200 fechado, 404 inexistente, lançado → `/inicio`),
  catálogo público com `release: { state, canais }`, a Z nega 403 de dentro de app fechado e o guia dela só cita as
  plataformas abertas para a pessoa (`retrato.ferramentas` com `acesso !== 'closed'`), `estadoDaIa` marca
  `emDesenvolvimento`; console Administração › Lançamento (estado e canais com motivo; acesso interno por pessoa
  escolhida na lista, tipo, canais, validade; revogar também encerra as sessões da pessoa nos apps do produto;
  auditoria). Etapas de projeto: produto fechado sem histórico = `unavailable`; o que já aconteceu continua visível.
- Testes (Postgres local, bancos próprios `zro_gate_test` e `zro_gate_e2e_test`): lint 0, `format:check` ok,
  `typecheck` ok (pacotes e hub-web), `npm test` **197/197 em 24 arquivos** (novo `release-gate.test.ts`, 12 casos:
  seed e regra do banco, anônimo, RLS, conta grátis, assinante do SOBEDESCE com Completo, usuário de outro produto,
  admin da plataforma sem linha, tester por canal com validade e revogação, Carro só para a conta listada — outro
  admin, assinante e colega da mesma organização negados —, cross-tenant, console com cache e auditoria, validação da
  concessão, `db:release:revoke` prévia e `--apply`; casos novos em `oidc.test.ts` (access_denied, zro_release,
  refresh/userinfo/Bearer revogados), `ia-token.test.ts`, `ia.test.ts`, `carro-hub.test.ts`; regressão de
  `flow.test.ts`, `ia.test.ts`, `accounts.test.ts`, `core.test.ts` ajustada ao estado real dos produtos), `npm run build` ok,
  `scan-secrets` limpo (2289 arquivos), `npm run test:e2e` **24/24** (caso novo no `sso.spec.ts`: cliente trusted do
  NOSSOM → "Em desenvolvimento" sem código e sem violação axe WCAG A/AA, `prompt=none` → `access_denied`, auditoria
  `release.denied` só com cliente e canal, `/em-desenvolvimento/nossom` 200, inexistente 404, lançado → `/inicio`, conta
  listada volta ao app com código; `hub.spec.ts` ajustado ao estado real: AEON indisponível, NOSSOM `closed`, 3 apps com
  acesso no plano grátis; o cliente de teste do fluxo trusted virou Synquei e o do Carro lista a conta nova como
  proprietária). Tela "Em desenvolvimento" conferida em captura local (claro e escuro, 390 px e 1280 px): símbolo
  pequeno, ícone do app, título Light × ExtraBold, uma linha, botão de vidro escuro.
- Não validado: produção (nada publicado; a conta do proprietário e o `revoke --apply` dependem de autorização);
  interface do HUB e sites dos produtos lendo `release`/`zro_release` (outros agentes); `maestro` (migration 0019 de
  outro agente) só por construção (sem linha = fechado).
