# Deploy — Vercel + Supabase

**Autorizado pelo titular em 25/10/2026** para o projeto Vercel `absolutezro` (team Victorbarrosoc) em
https://absolutezro.com, com o projeto Supabase **novo** `AbsoluteZRO` (nenhum banco de app original).

## 1. Projeto na Vercel (feito)

- Root Directory `apps/hub-web`, framework Next.js, Node 22, arquivos fora da pasta liberados (monorepo).
- O resto vem de `apps/hub-web/vercel.json`: instalação com npm 11 na raiz, `npm run vercel-build`, região `iad1` (perto do banco Supabase em us-east-2; cada consulta atravessaria o continente a partir de `gru1`).

## 2. Banco Supabase

1. Tabelas: SQL Editor › colar o SQL das migrations 0001–0003 (ou deixar o build aplicar, passo 3). O runner registra
   cada migration em `zro.schema_migrations` com checksum; rodar de novo não duplica nada.
2. Ligar o banco ao projeto: Vercel › `absolutezro` › Storage › Supabase › conectar o projeto existente
   `AbsoluteZRO` em Production e Preview. A integração cria `POSTGRES_URL` (pooler) e `POSTGRES_URL_NON_POOLING`.
   Alternativa manual: `DATABASE_URL` = Transaction pooler (porta 6543) e `DATABASE_URL_UNPOOLED` = Session pooler
   (porta 5432), copiadas de Supabase › Connect. Nunca cole a senha em issue, PR ou chat.
3. O código lê `DATABASE_URL` ou `POSTGRES_URL`, tira parâmetros extras da URL (`supa=`, `pgbouncer=`) e exige TLS
   (`normalizeDatabaseUrl`). O build aplica migrations pela URL sem pooler.

## 3. Variáveis opcionais

- `ZRO_OIDC_SIGNING_KEY` (PEM EC P-256): opcional. Sem ela, o HUB gera a chave do login único no primeiro uso e guarda
  em `zro.oidc_keys`.

- `ZRO_IP_HASH_SECRET` (openssl rand -hex 32): sem ela, o IP não é guardado nem usado nos limites por IP.
- Ambiente e origem saem da Vercel (`VERCEL_ENV`, `VERCEL_PROJECT_PRODUCTION_URL`); `ZRO_ENV`/`ZRO_APP_ORIGIN` só se
  quiser forçar.
- Cobrança pelo Stripe (ADR 0019): `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` no projeto `absolutezro` (Production).
  Webhook do Stripe em `https://absolutezro.com/api/v1/billing/webhooks/stripe` com `customer.subscription.created`,
  `.updated` e `.deleted`; portal do cliente salvo uma vez no painel do Stripe. Depois, Administração → Vendas →
  "Ligar vendas" com a data de corte do grátis antigo.

## 4. Produção

`absolutezro.com` publica o branch `main`. Branches de trabalho viram prévias protegidas pelo login da Vercel.
Levar para produção = merge no `main`, com autorização do titular.

## 5. Primeira conta de administração

Sem provedor de e-mail, ninguém confirma e-mail em produção. Depois de criar a conta no site, rode uma vez no SQL
Editor do Supabase, trocando pelo seu e-mail:

```sql
update zro.users set email_verified_at = now(), platform_role = 'admin'
where email = 'seu-email@exemplo.com';
```

O console fica em `/admin` (limites dos planos, concessões, fila parada, eventos de cobrança).

## 5a. Gate de lançamento (ADR 0023) — só com autorização do proprietário

A migration `0018_release_gate.sql` deixa NOSSOM, AEON (`ai-edit`), Revela (`finishing`) e Carro do Freela fechados
para todo mundo. A conta do proprietário (a única autorizada nos quatro, adendo do Carro) **não** está na migration
nem no código: entra em produção nesta publicação, uma vez, de um dos dois jeitos, e fica na auditoria.

1. Achar o `zro.users.id` da conta (o e-mail não serve de chave): `/admin/pessoas` › a própria pessoa (a URL é
   `/admin/pessoas/<uuid>`), ou `GET /api/v1/me` logado (`user.id`), ou no SQL Editor:
   `select id, email, platform_role from zro.users where platform_role = 'admin'` — deve haver uma linha com o e-mail do
   proprietário; mais de uma, ele aponta qual.
2. Conceder: Administração › **Lançamento › Acesso interno** (escolher a pessoa na lista, produto, tipo "Proprietário",
   todos os canais, sem validade, motivo), um produto por vez; ou no SQL Editor, trocando `<uuid>`:

   ```sql
   insert into zro.product_release_access (product_id, user_id, kind, reason, granted_by)
   select x.product_id, u.id, 'owner', 'conta do proprietário (adendo do PRD, 27/10/2026)', u.id
   from zro.users u cross join (values ('carro-do-freela'), ('nossom'), ('ai-edit'), ('finishing')) as x (product_id)
   where u.id = '<uuid>'
   on conflict (product_id, user_id) do nothing;
   ```

3. Sessões emitidas antes do gate (refresh tokens de 30 dias e consentimentos dos clientes `nossom-web`, `aeon-web`,
   `aeon-desktop`, `revela-web`, `carrodofreela-web` para quem não está na lista): o HUB já não renova nem aceita, mas
   deixar o banco igual à regra é um comando, primeiro em prévia e só depois para valer, com a `DATABASE_URL` sem pooler:

   ```sh
   npm run db:release:revoke -- --reason "gate de lançamento (ADR 0023)"            # prévia: só conta, não muda nada
   npm run db:release:revoke -- --reason "gate de lançamento (ADR 0023)" --apply    # executa e grava a auditoria
   ```

4. Conferir em `/admin/lancamento`: os três lançados em "Lançado" com todos os canais, os quatro fechados em
   "Em desenvolvimento", a conta do proprietário nos quatro, e a auditoria com as linhas. Abrir um produto ao público
   depois = mudar o estado nessa tela (vale em até 30 s, sem redeploy); nunca por migration.

## 5b. Maestro em teste aberto (decisão do titular, 28/10/2026)

A migration `0022_maestro_aberto.sql` do HUB (aplicada pelo build do `absolutezro`) abre o Maestro: `beta`,
`public_beta` com web/api/sso, no grátis, no Completo e no Pro, e o entitlement para as contas atuais. O resto, nesta
ordem:

1. **Papel e schema no Supabase `AbsoluteZRO`** (SQL Editor, uma vez; senha forte gerada na hora, nunca no repositório):

   ```sql
   create role maestro with login password '<senha forte>';
   create role maestro_app nologin;
   grant maestro_app to maestro with admin option;
   create schema if not exists maestro authorization maestro;
   ```

   O `maestro` é dono do schema e roda as migrações; `maestro_app` (sem login, sem BYPASSRLS) é o papel que o servidor
   assume em toda operação de usuário. Nada dentro de `zro`.

2. **Cliente OIDC `maestro-web`** (confidencial, da família, retorno `https://maestro.absolutezro.com/api/zro/callback`,
   escopos base + `zro.ia` + `maestro.projects`). O segredo é gerado na máquina de quem publica e entra só por variável;
   o banco guarda o sha256. Com a `DATABASE_URL` sem pooler do HUB:

   ```sh
   export OAUTH_CLIENT_SECRET="$(openssl rand -base64 48)"   # guarde para o passo 3
   npm run db:client:maestro                 # prévia: confere e não grava
   npm run db:client:maestro -- --apply      # grava e registra na auditoria
   ```

   Rodar de novo troca o segredo (e derruba o anterior). Alternativa: Administração › Login único no console (o HUB gera
   o segredo, mostra uma vez; marcar "da família", produto Maestro).

3. **Projeto Vercel `maestro`**: Root Directory `products/maestro`, Node 22, framework e build pelo `vercel.json`
   (`npm run vercel-build` = migrações do schema `maestro` + `next build`; com a migração falhando, não publica).
   Ignored Build Step igual aos outros produtos: `git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- .` (só builda
   quando a pasta muda). Domínio `maestro.absolutezro.com`. Variáveis (Production; as sensíveis marcadas como tal):
   - `MAESTRO_DATABASE_URL` (sensível): Transaction pooler (porta 6543) com o usuário `maestro.<ref do projeto>` e a
     senha do passo 1.
   - `MAESTRO_KEY` (sensível): `openssl rand -base64 32`.
   - `ZRO_CLIENT_ID` = `maestro-web`; `ZRO_CLIENT_SECRET` (sensível) = o `OAUTH_CLIENT_SECRET` do passo 2.
   - `ZRO_ISSUER` = `https://absolutezro.com`; `NEXT_PUBLIC_SITE_URL` = `https://maestro.absolutezro.com`.
4. Conferir: o HUB mostra o Maestro com o selo Beta e "Abrir" leva ao login único; uma conta grátis entra e chega ao
   app; `/admin/lancamento` mostra o Maestro em "Beta público" com web, API e login único.

## 6. Fila

Sem worker contínuo, o HUB processa a fila logo depois de cada importação ou "Repetir" (`apps/hub-web/lib/queue.ts`).
Para volume maior, rodar `npm run worker` num processo contínuo com a mesma `DATABASE_URL`.

## Nunca

- Rodar `db:seed:demo` em produção (o script recusa).
- Apontar `DATABASE_URL` para o banco de um app original.
- Usar o domínio de um app original.
