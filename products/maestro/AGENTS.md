# Instruções para agentes (Maestro)

Veja [CLAUDE.md](CLAUDE.md) para as regras do produto e o [CLAUDE.md da raiz](../../CLAUDE.md) para as do repositório.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

Pontos desta versão já usados aqui: `cookies()`, `params` e `searchParams` são assíncronos; `RouteContext<"/rota">`
tipa as rotas (`next typegen`); layout e página renderizam em paralelo (cada página protegida confere o acesso);
`middleware` virou `proxy` (não usamos: a checagem fica em cada página e rota).
