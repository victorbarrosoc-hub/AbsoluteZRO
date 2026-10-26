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

## 6. Fila

Sem worker contínuo, o HUB processa a fila logo depois de cada importação ou "Repetir" (`apps/hub-web/lib/queue.ts`).
Para volume maior, rodar `npm run worker` num processo contínuo com a mesma `DATABASE_URL`.

## Nunca

- Rodar `db:seed:demo` em produção (o script recusa).
- Apontar `DATABASE_URL` para o banco de um app original.
- Usar o domínio de um app original.
