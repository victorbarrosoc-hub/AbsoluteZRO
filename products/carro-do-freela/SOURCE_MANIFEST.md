# SOURCE_MANIFEST — Carro do Freela

Cópia controlada (PRD §6.2). O original continua sendo a fonte de produção; esta pasta não é deploy.

| Campo | Valor |
| --- | --- |
| Repositório de origem | https://github.com/victorbarrosoc-hub/carrodofreela-app |
| Branch | `main` |
| Commit | `5fc93a7f82f7c4674129513200e2d040351d26a8` |
| Data do commit | 2026-10-19T23:41:16+00:00 |
| Subpasta copiada | `app` |
| Visibilidade da origem | privado (cópia autorizada pelo titular em 25/10/2026 para o repositório público AbsoluteZRO) |
| Licença | sem arquivo de licença; código proprietário do titular |
| Stack | HTML/JS sem dependências; build em Node (src/build.js); testes Playwright; Supabase (projeto do original) e Web3Forms |
| Estratégia no HUB (PRD §6.2 a–d) | (d) link externo com identidade separada + (c) adaptador de contrato `job.created` no HUB |
| Cópia feita em | 2026-10-25T01:53:22.565Z |
| `git status` do original | inalterado antes e depois da cópia (limpo) |

Método: `git archive HEAD` do clone de leitura (só arquivos versionados) → `source/`, mais o saneamento abaixo.
Para atualizar: `node scripts/snapshot-product.mjs carro-do-freela <clone-do-original>`.

## Removido da cópia

- `public/artifact.html`
- `public/fase-1-artifact.html`
- `public/fase-1.html`
- `public/fase-2-artifact.html`
- `public/fase-2.html`
- `public/fase-3-artifact.html`
- `public/fase-3.html`
- `public/fase-4-artifact.html`
- `public/fase-4.html`
- `public/fase-5-artifact.html`
- `public/fase-5.html`
- `public/fase-6-artifact.html`
- `public/fase-6.html`
- `public/index.html`

## Trocado na cópia (saneamento)

- `CLAUDE.md: referência ao projeto Supabase de produção do original`
- `docs/fase1-no-ar.html: referência ao projeto Supabase de produção do original`
- `landing/README.md: referência ao projeto Supabase de produção do original`
- `landing/corpo.html: chave anon do Supabase de produção do original`
- `landing/corpo.html: referência ao projeto Supabase de produção do original`
- `landing/index.html: chave anon do Supabase de produção do original`
- `landing/index.html: referência ao projeto Supabase de produção do original`
- `src/seguranca.js: referência ao projeto Supabase de produção do original`
- `src/template.html: chave anon do Supabase de produção do original`
- `src/template.html: referência ao projeto Supabase de produção do original`
- `src/template.html: chave Web3Forms do original (entrega no e-mail do original)`
- `test/seguranca.js: referência ao projeto Supabase de produção do original`
- `src/publicar.js: script que dá push no repositório de produção do original; trocado por um aviso que encerra`

## Observações

- A lista `src/crew.json` é FICTÍCIA: o sha256 confere com `src/crew.selo.json` (c68186fd…). A lista real nunca esteve no git.
- Os HTML gerados em `public/` (index, artifact, fase-N) saíram da cópia: são saída de `npm run build` / `npm run build:fases` e embutiam as chaves do original.
- O build e os testes dependem de Playwright/Chromium. Rode-os dentro desta pasta; ela não faz parte dos workspaces do monorepo.
- Para operar de verdade a partir desta cópia: criar projeto Supabase e chave Web3Forms NOVOS e trocar os marcadores SUBSTITUIR_*.
