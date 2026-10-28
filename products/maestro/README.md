# Maestro

Pauta, aprovação do cliente e projetos para agências e produtoras. Plataforma do ecossistema Absolute ZRO: uma conta
para tudo, o projeto canônico no HUB, as peças no Google Drive da organização (via SOBEDESCE) e a Z em toda tela.

**Etapa 0 (fundação, 28/10/2026):** shell com a identidade, login único Absolute ZRO, sessão própria, schema
`maestro` com RLS por organização, repasse da Z. O Quadro, os clientes, os projetos e a aprovação do cliente chegam
nas etapas 1 a 3 (`docs/roadmap.md` na raiz). Em teste aberto desde 28/10/2026: entra quem tem `zro_release.maestro`
released/allowed e `maestro` em `zro_products` (plano grátis, Completo, Pro ou concessão do console).

## Rodar

```
cp .env.example .env.local
npm install
npm run db:migrate
npm run dev
```

Precisa de um Postgres (local: `service postgresql start`; `MAESTRO_DATABASE_URL` no `.env.local`). Sem
`ZRO_CLIENT_ID`/`ZRO_CLIENT_SECRET` o botão "Entrar com Absolute ZRO" não aparece.

## Conferir

```
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` cria bancos `maestro_test_*` (a partir de `TEST_DATABASE_URL`) e sobe uma Absolute ZRO falsa.

## Mapa

- `src/app` — páginas (inicial, `/entrar`, `/sem-acesso`, `/app/{z,quadro,aprovacoes,clientes,projetos,ajustes}`) e rotas `api/zro/*`.
- `src/lib/auth` — `acesso.ts` (o único `temAcesso`), sessão, cripto, limite, quem pede (rota e página).
- `src/lib/zro` — cliente OIDC, callback (organização e membro), `/eu`, `/sair`, repasse da Z.
- `src/lib/db` — duas portas (`asUser` com RLS, `asSystem`), schema Drizzle, migrador do schema `maestro`.
- `drizzle/0000_fundacao.sql` — tabelas, papéis, RLS, funções do Quadro.
- `tests/` — RLS com duas organizações, OIDC completo, repasse da Z, acesso e papéis.
