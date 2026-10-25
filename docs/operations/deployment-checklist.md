# Deploy — Vercel + Neon

**Autorizado pelo titular em 25/10/2026** para o projeto `absolutezro` (team Victorbarrosoc) em
https://absolutezro.vercel.app, com banco Neon criado pela Vercel. O conector da Vercel desta sessão não tem permissão
para criar projetos (403), então os passos 1 e 2 são feitos no painel.

## 1. Importar o projeto (painel da Vercel)

1. Add New › Project › Import `victorbarrosoc-hub/AbsoluteZRO`.
2. Project Name: `absolutezro`.
3. **Root Directory: `apps/hub-web`** (obrigatório). O resto vem de `apps/hub-web/vercel.json`: instalação com npm 11 na
   raiz do monorepo, `npm run vercel-build`, região `gru1`.
4. Deploy. Sem banco o build passa, mas as páginas que usam dados respondem erro até o passo 2.

## 2. Banco Neon (painel da Vercel)

1. No projeto: Storage › Create Database › Neon › região São Paulo se houver (ou a mais próxima) › Connect ao
   `absolutezro` em Production e Preview.
2. A Vercel injeta `DATABASE_URL`, `DATABASE_URL_UNPOOLED` e afins. Não é o banco de nenhum app original.
3. Deployments › Redeploy. O build aplica as migrations sozinho (`scripts/vercel-build.mjs`, com a URL sem pooler).

## 3. Variáveis opcionais

- `ZRO_IP_HASH_SECRET` (openssl rand -hex 32): sem ela, o IP não é guardado nem usado nos limites por IP.
- Ambiente e origem saem da Vercel (`VERCEL_ENV`, `VERCEL_PROJECT_PRODUCTION_URL`); `ZRO_ENV`/`ZRO_APP_ORIGIN` só se
  quiser forçar.
- Cobrança só quando houver provedor: `ZRO_BILLING_PROVIDERS` e `ZRO_BILLING_WEBHOOK_SECRET_<PROVEDOR>`.

## 4. Primeira conta de administração

Sem provedor de e-mail, ninguém consegue confirmar e-mail em produção. Depois de criar sua conta no site, rode uma vez
no SQL Editor da Neon (troque o e-mail se for outro):

```sql
update zro.users set email_verified_at = now(), platform_role = 'admin'
where email = 'victorbarrosoc@gmail.com';
```

Depois disso o console fica em `/admin` (limites dos planos, concessões, fila parada, eventos de cobrança).

## 5. Fila

Sem worker contínuo, o HUB processa a fila logo depois de cada importação ou "Repetir" (`apps/hub-web/lib/queue.ts`).
Para volume maior, rodar `npm run worker` num processo contínuo com a mesma `DATABASE_URL`.

## Nunca

- Rodar `db:seed:demo` em produção (o script recusa).
- Apontar `DATABASE_URL` para o banco de um app original.
- Usar o domínio de um app original.

## Validação local deste caminho

Simulado com um Postgres novo e um dono **sem superusuário** (como o da Neon): migrations no build, cadastro,
organização e projeto em modo produção, sem links de desenvolvimento expostos.
