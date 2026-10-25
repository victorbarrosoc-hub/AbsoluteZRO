# Absolute ZRO HUB — regras para Claude Code

Leia antes de mudar qualquer coisa: [PRD.md](PRD.md) (referência principal), [AGENTS.md](AGENTS.md),
[docs/architecture/overview.md](docs/architecture/overview.md), [docs/roadmap.md](docs/roadmap.md) e
[docs/validation.md](docs/validation.md). O código, as migrations e os testes prevalecem sobre documentos antigos.

## Proibições permanentes

- **Repositórios originais são só leitura**: nossom, synquei, baixadordodrive (SOBEDESCE), tpeasy, carrodofreela-app.
  Nada de commit, push, PR, migration, deploy, `npm install`, mudança de env ou de autenticação neles. Copiar só com
  `scripts/snapshot-product.mjs` e registrar no `SOURCE_MANIFEST.md`. Rode `scripts/check-originals.mjs` ao terminar.
- **Deploy só com autorização explícita do titular.** Em 25/10/2026 o titular autorizou o projeto Vercel `absolutezro`
  (absolutezro.vercel.app) com o projeto Supabase novo `AbsoluteZRO`; a trava `git.deploymentEnabled: false` saiu. Qualquer outro projeto,
  domínio, DNS, banco pago ou ação irreversível pede nova autorização.
- Nunca reutilizar chaves, bancos, projetos Supabase ou secrets dos apps originais. O repositório é **público**:
  nada de `.env`, token, cookie, URL assinada, dado pessoal ou áudio privado. `node scripts/scan-secrets.mjs` antes
  de commitar.
- Não declarar SSO com os apps antigos: o login único vale para o HUB.
- Não fingir integração, IA, grading, saldo ou progresso. AI Edit e Finishing estão em desenvolvimento.

## Regras de implementação

- Toda operação relevante passa por `authorize()` (`packages/core/src/authz.ts`) na ordem do PRD §5.2. Organização e
  papel vêm da sessão e do banco, nunca do cliente.
- Operação de usuário usa `db.asUser` (papel `zro_app`, RLS). `db.asSystem` só para autenticação, webhook assinado,
  worker e console depois de `requirePlatformAdmin`. Toda tabela nova precisa de RLS e de teste de isolamento.
- No Next 16, layout e página renderizam em paralelo: cada página protegida checa acesso por conta própria.
- Migrations só no banco novo, só com arquivo novo em `infra/migrations` (o runner recusa editar uma aplicada).
- Quotas: `consumeQuota` com chave de idempotência. Sem limite configurado = bloqueado.
- Eventos: `publishEvent` com `idempotency_key`; rotas em `packages/integrations/src/handlers.ts`; teste de ciclo
  (`findEventCycle`) precisa continuar passando. Despacho ambíguo vai para revisão, nunca para nova tentativa sozinho.
- Arquivos de mídia: o HUB não move, renomeia nem apaga. Prévia (`dry_run`) e confirmação explícita sempre.
- Backup só é "comprovado" com checksum conferido em cada destino.
- Contratos: mudou schema em `packages/media-contracts`, rode `npm run contracts:export`. Rota nova em `/api`, documente
  em `docs/integration-contracts/openapi.yaml` (há teste que confere).

## Interface

Português, textos curtos, títulos em bold, tom humano. Identidade oficial em `packages/ui/src/tokens.css` e
`apps/hub-web/public/brand` (fonte: zrofilmes.vercel.app/absolute). Não inventar logo; produtos mantêm os próprios
ícones. Respeitar reduzir movimento; nada de animação por frame no React.

## Antes de entregar

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run build && npm run test:e2e`, e
atualize `docs/roadmap.md` e `docs/validation.md` com o que mudou.
