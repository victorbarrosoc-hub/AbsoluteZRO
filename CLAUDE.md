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
  (absolutezro.vercel.app, hoje no domínio absolutezro.com) com o projeto Supabase novo `AbsoluteZRO`; a trava `git.deploymentEnabled: false` saiu. Qualquer outro projeto,
  domínio, DNS, banco pago ou ação irreversível pede nova autorização.
- Nunca reutilizar chaves, bancos, projetos Supabase ou secrets dos apps originais. O repositório é **público**:
  nada de `.env`, token, cookie, URL assinada, dado pessoal ou áudio privado. `node scripts/scan-secrets.mjs` antes
  de commitar.
- Não declarar SSO com os apps antigos: o login único vale para o HUB.
- Não fingir integração, IA, grading, saldo ou progresso. AI Edit e Revela (id técnico `finishing`) estão em desenvolvimento.

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
`apps/hub-web/public/brand`; manual em [docs/marca/README.md](docs/marca/README.md). Não inventar logo; produtos mantêm
os próprios ícones.

**Marca flat** (aprovada pelo titular, 26/10/2026, ADR 0017): o O é um anel com a centelha de 4 pontas por trás do
traço (só as pontas horizontais aparecem), uma cor só (grafite no claro, branco no escuro). Use `ZroWordmark` e
`ZroSymbol` de `@zro/ui` ou os SVG `absolute-zro*.svg`; nunca o antigo feixe de luz. **Em animação a estrela aparece
inteira** (4 pontas) e recolhe até a forma flat (`<ZroSymbol animated />`). Geometria só em
`scripts/marca/vetor/vetorizar.py`. Respeitar reduzir movimento; nada de animação por frame no React.

**Padrão Apple** (pedido do titular, 25/10/2026): a Absolute ZRO se comporta como produto e ecossistema Apple. Antes
de qualquer tela, pense em como a apple.com faria: visual, motion e elegância.

- Frase da marca: **"O futuro começa do zero."** Título da página inicial e do OG.
- **Tema claro é o padrão**; o escuro é escolha no seletor.
- Credibilidade vem do **produto real**: telas de verdade do HUB e dos apps em aparelhos (MacBook, iPhone), não efeitos
  de luz. Na página inicial o símbolo é o protagonista (pedido do titular, 26/10/2026: ele é a força da marca): grande
  no topo, desenhando o anel e com a estrela recolhendo, e no centro da órbita das ferramentas. No HUB e nas demais
  telas segue pequeno, como assinatura.
- Títulos em **Figtree**, só em grafite (#1d1d1f) ou branco no escuro, contraste fino (Light) × pesado (ExtraBold).
  **Nada de texto azul ou em degradê.** Texto de apoio em cinza (#6e6e73).
- Botões em **Liquid Glass**: pílula de vidro translúcido com brilho de borda (`.glass-btn`); a ação principal em vidro
  escuro (`.glass-btn--ink`). Nada de botão azul chapado.
- **Pouco texto** (pedido do titular, 26/10/2026): título curto e no máximo uma linha de apoio. O resto vira forma
  (ícone, cartão, ficha, estado visual) ou fica recolhido (detalhes, dica no `title`). Texto demais e a pessoa não sabe
  para onde olhar.
- Uma ideia por tela, uma ação principal e uma secundária. Muito respiro. Motion só com propósito (o produto entra com a
  rolagem), sempre respeitando "reduzir movimento".
- Comportamento de ecossistema: uma conta (como o Apple ID), os apps se reconhecem, nada de cadastro duplicado.
  Detalhe acabado em todo canto: ícone, OG, estado vazio, erro, carregamento.

## Antes de entregar

`npm run lint && npm run format:check && npm run typecheck && npm test && npm run build && npm run test:e2e`, e
atualize `docs/roadmap.md` e `docs/validation.md` com o que mudou.
