# Absolute ZRO HUB — regras para Claude Code

Leia antes de mudar qualquer coisa: [PRD.md](PRD.md) (referência principal), [AGENTS.md](AGENTS.md),
[docs/architecture/overview.md](docs/architecture/overview.md), [docs/roadmap.md](docs/roadmap.md) e
[docs/validation.md](docs/validation.md). O código, as migrations e os testes prevalecem sobre documentos antigos.

## Proibições permanentes

- **Este repositório é a fonte de todas as plataformas** (ADR 0013, pedido do titular em 25/10/2026): cada uma mora em
  `products/<app>/` com as próprias regras (`CLAUDE.md`/`AGENTS.md` da pasta), `package.json` e testes, e publica no
  projeto Vercel dela (Root Directory = pasta do app). Os repositórios antigos (nossom, synquei, baixadordodrive,
  tpeasy, carrodofreela-app) só recebem a importação final (`scripts/import-product.mjs`) e depois são arquivados;
  nada de trabalho novo neles. Banco: um schema e um papel por app no Supabase `AbsoluteZRO`, nunca dentro de `zro`.
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

Português, textos curtos, tom humano. Identidade oficial em `packages/ui/src/tokens.css` e
`apps/hub-web/public/brand` (fonte: zrofilmes.vercel.app/absolute). Não inventar logo; produtos mantêm os próprios
ícones. Respeitar reduzir movimento; nada de animação por frame no React.

**Padrão Apple** (pedido do titular, 25/10/2026): a Absolute ZRO se comporta como produto e ecossistema Apple.

- Frase da marca: **"O futuro começa do zero."** Título da página inicial e do OG.
- Tipografia em contraste fino × pesado, como o wordmark (ABSOLUTE fino, ZR pesado): uma parte em Extra Light, a
  palavra que importa em Bold/ExtraBold. Nada de tudo em bold.
- Uma ideia por tela, uma ação principal (botão em pílula) e uma secundária em link ("Saiba mais ›"). Muito respiro,
  texto centralizado nas aberturas, imagem de alta qualidade (`scripts/marca`), sem enfeite gratuito.
- Comportamento de ecossistema: uma conta (como o Apple ID), os apps se reconhecem, o que muda num lugar aparece no
  outro, nada de cadastro duplicado. Detalhe acabado em todo canto: ícone, OG, estado vazio, erro, carregamento.

## Antes de entregar

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run build && npm run test:e2e`, e
atualize `docs/roadmap.md` e `docs/validation.md` com o que mudou.
