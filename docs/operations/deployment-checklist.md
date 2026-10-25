# Checklist de deploy — AGUARDANDO AUTORIZAÇÃO DO TITULAR

Nada abaixo foi executado. Cada item com custo ou efeito externo precisa de "sim" explícito.

## 1. Banco novo

- [ ] Criar projeto Postgres **novo** (recomendado: Supabase, região São Paulo). Nunca o banco de um app original.
- [ ] Em Supabase: Data API sem exposição do schema `zro` (as migrations já revogam `anon`/`authenticated`).
- [ ] `DATABASE_URL` do papel `postgres`. Com pooler em modo transação (porta 6543): `DATABASE_PREPARE=false`.
- [ ] `npm run db:migrate` a partir de máquina confiável ou job de CI com o segredo.
- [ ] Backups automáticos e PITR ligados; retenção definida.

## 2. Segredos (no provedor, nunca no Git)

- [ ] `ZRO_ENV=production`, `ZRO_APP_ORIGIN=https://<domínio>`, `ZRO_IP_HASH_SECRET` (openssl rand -hex 32).
- [ ] Cobrança só quando houver provedor: `ZRO_BILLING_PROVIDERS` e `ZRO_BILLING_WEBHOOK_SECRET_<PROVEDOR>`.
- [ ] Provedor de e-mail (adaptador a escrever em `packages/auth/src/email.ts`).

## 3. Vercel (HUB)

- [ ] Criar projeto **novo** ligado a `victorbarrosoc-hub/AbsoluteZRO`, raiz `apps/hub-web`, Node 22,
      instalação `npx -y npm@11.6.2 ci` (na raiz), build `npm run build`.
- [ ] Remover `"git": { "deploymentEnabled": false }` de `vercel.json` (raiz e `apps/hub-web`) **só** depois da
      autorização, ou fazer deploys manuais.
- [ ] Domínio novo do HUB (DNS só com autorização). Não usar domínios dos apps originais.
- [ ] Conferir `/api/health`, login, criação de organização e uma importação de teste em staging antes de produção.

## 4. Worker

- [ ] Processo Node contínuo (`npm run worker`) com `DATABASE_URL` (Railway/Fly/VM) ou rotina agendada que chame
      `runOnce` + `recoverStaleRuns`. Uma instância basta; várias são seguras (SKIP LOCKED).

## 5. Primeira configuração

- [ ] Criar a conta do titular, marcar `platform_role = 'admin'` direto no banco (uma vez) e confirmar o e-mail.
- [ ] Definir no console os limites (nova versão do Ciclo do O e dos individuais) e publicar.
- [ ] **Não** rodar `db:seed:demo` em produção (o script recusa).

## 6. Depois do deploy

- [ ] `node scripts/check-originals.mjs` de novo para registrar que nenhum original mudou.
- [ ] Monitorar dead-letter e eventos de cobrança com falha no console.
