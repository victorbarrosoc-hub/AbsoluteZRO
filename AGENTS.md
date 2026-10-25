# Instruções para agentes

Veja [CLAUDE.md](CLAUDE.md) para as regras permanentes do repositório.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

Pontos desta versão já usados no HUB: `cookies()`, `headers()`, `params` e `searchParams` são assíncronos; `middleware`
virou `proxy`; Server Actions conferem Origin contra Host; pacotes do workspace são transpilados automaticamente.
