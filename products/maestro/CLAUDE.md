# Maestro — regras para Claude Code

Plataforma nova do ecossistema Absolute ZRO (ADR 0022): pauta (Quadro), aprovação do cliente e projetos para agências
e produtoras. Mora em `products/maestro`, publica no projeto Vercel próprio (Root Directory = esta pasta; projeto, domínio
`maestro.absolutezro.com` e cliente OIDC `maestro-web` autorizados pelo titular em 28/10/2026, passos em
`docs/operations/deployment-checklist.md` §5b) e usa o schema
`maestro` do Supabase `AbsoluteZRO`, com papel próprio. As regras do `CLAUDE.md` da raiz valem aqui; este arquivo só
acrescenta. Leia `AGENTS.md` (Next 16) antes de mexer em rota ou página.

## Decisões do proprietário (28/10/2026)

1. Uma conta Absolute ZRO por pessoa. Os papéis vêm da organização do HUB por tabela fixa (`src/lib/papeis.ts`:
   owner/admin → admin, manager → gestor, editor → equipe, viewer/guest → leitura), reaplicados a cada login.
   Quem convida é a Absolute ZRO; o Maestro não tem cadastro.
2. Aprovação do cliente em **um passo** (texto e peça juntos). Link por lote: 30 dias, PIN opcional, um ativo por lote.
3. O projeto do Maestro liga-se ao projeto do HUB **sozinho** ao nascer (idempotente; `link_status` pendente tenta de
   novo; o Maestro funciona sem o HUB).
4. Peças ficam em pastas do Google Drive da organização via SOBEDESCE (`card_media` guarda só id e pasta); nada de
   Storage próprio. WhatsApp: `wa.me` com texto pronto, sem API. Plano avulso: não mexa em `zro.plan_products`.
5. Quadro: as 8 colunas do método (`src/lib/quadro/metodo.ts`); "Com o cliente" = **Em aprovação**, "Publicado" =
   **Entregue**. O método não muda.
6. Logo: o gesto da pauta em latão (`public/brand/maestro-symbol*.svg`), colorido ao lado da marca flat da Absolute
   ZRO; o resto é identidade Absolute ZRO (Figtree, grafite, Liquid Glass, tema claro padrão, pouco texto).

## Como funciona

- **Acesso**: `temAcesso()` em `src/lib/auth/acesso.ts` é o ÚNICO ponto de decisão: `zro_release.maestro` released
  ou allowed (sem a claim = fechado) **e** `maestro` em `zro_products`. As duas claims ficam na sessão e são relidas
  no `/eu`. Desde 28/10/2026 o Maestro está em teste aberto a todos (migration `0020` do HUB). Páginas usam `exigirAcessoNaPagina()` (cada página chama,
  além do layout: no Next 16 os dois renderizam em paralelo) e rotas de dados usam `exigirAcesso()`. Sem sessão 401,
  sem acesso 403; nunca só a tela.
- **Login único**: `api/zro/{entrar,callback,eu,sair}` (PKCE S256, `state`/`nonce` selados, `id_token` conferido pela
  JWKS, `prompt=create` em Criar conta). Sessão própria em `maestro.sessions` (cookie `mae_sessao`, só o sha256;
  tokens da Absolute ZRO cifrados com `MAESTRO_KEY`). O `/eu` relê o perfil e os produtos no `userinfo` (≤ 1/min).
- **Banco**: duas portas em `src/lib/db/client.ts`. `asUser` assume `maestro_app` com RLS por organização em toda
  tabela (`with check` inclusive); `asSystem` só para sessões, callback do login, link do cliente e migração. Cards
  só mudam pelas funções `maestro.card_*`. Migrações em `drizzle/*.sql` + `drizzle/meta/_journal.json`, aplicadas
  pelo migrador próprio (`src/lib/db/migrador.ts`); nunca edite uma aplicada.
- **Z**: `api/zro/ia/[...caminho]` repassa ao HUB com o token da sessão (NDJSON sem buffer); a aba Z é a primeira.
- Repositório público: nada de `.env`, chave, dado pessoal ou mídia dos repositórios antigos. Semente só `demo-`.

## Como rodar e testar

```
cp .env.example .env.local      # Postgres local: service postgresql start
npm install
npm run db:migrate && npm run dev
npm run lint && npm run typecheck && npm test && npm run build
```

Os testes (`node --test` via tsx) criam bancos `maestro_test_<nome>` a partir de `TEST_DATABASE_URL` (padrão
`postgres://postgres:postgres@localhost:5432/postgres`) e sobem uma Absolute ZRO falsa (`tests/zro-falso.mts`).
Cobertura mínima que não pode cair: isolamento RLS com duas organizações (`rls.test.mts`), OIDC completo
(`zro.test.mts`), repasse da Z (`ia.test.mts`), `temAcesso` e papéis (`acesso.test.mts`).
