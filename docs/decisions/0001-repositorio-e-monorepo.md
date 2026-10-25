# 0001 · Repositório AbsoluteZRO como monorepo

**Contexto.** O PRD sugere `absolute-zro-hub` "ou variação aprovada". O titular indicou o repositório existente
`victorbarrosoc-hub/AbsoluteZRO`.

**Decisão.** Usar `AbsoluteZRO` com npm workspaces: `apps/hub-web`, `apps/worker`, `packages/*`. `products/*` fica
fora dos workspaces (cada cópia tem o próprio `package.json` e não entra no build do HUB). npm 11 (`packageManager`),
porque o npm 10 do ambiente falhou num bug de peer deps ao resolver o Vitest.

**Consequências.** Um `npm ci` instala tudo do HUB; as cópias instalam à parte quando alguém for trabalhar nelas.
`apps/admin-console` do PRD virou rota isolada (ver 0009).

**Reverter.** Mover pacotes para outro gerenciador (pnpm) é mecânico; nada depende de recurso exclusivo do npm.
