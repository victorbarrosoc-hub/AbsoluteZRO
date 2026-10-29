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
- `ZRO_CONEXOES_KEY` (openssl rand -base64 32, Production; ADR 0026): chave das Conexões. Dela saem, por HKDF, a chave
  dos tokens do Google Agenda (AES-256-GCM) e a do cookie da ida ao Google. Sem ela, `/conexoes` mostra
  "indisponível" e `/api/v1/agenda/*` responde 503. Trocar a chave invalida as conexões guardadas (cada pessoa conecta
  de novo). O cliente Google é o mesmo do "Entrar com Google" (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`), com o retorno
  `https://absolutezro.com/conexoes/google/retorno` e os escopos `calendar.events` e `calendar.calendarlist.readonly`.
- `CRON_SECRET` (openssl rand -hex 32, Production; sem espaço nem quebra de linha no fim, ou a Vercel recusa o build): o agendamento diário `GET /api/cron/dolar` (vercel.json) busca o dólar
  PTAX do Banco Central para os Custos (migração 0030). Sem ele, a rota responde 503 e só a página dos Custos atualiza.
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

## 6. Fila

Sem worker contínuo, o HUB processa a fila logo depois de cada importação ou "Repetir" (`apps/hub-web/lib/queue.ts`).
Para volume maior, rodar `npm run worker` num processo contínuo com a mesma `DATABASE_URL`.

## Nunca

- Rodar `db:seed:demo` em produção (o script recusa).
- Apontar `DATABASE_URL` para o banco de um app original.
- Usar o domínio de um app original.
