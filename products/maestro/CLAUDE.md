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
  no `/eu`. **O Maestro está fechado**: só a lista de acesso do HUB entra (migration `0024` do HUB, `product_release`
  em `development`); abrir a todos é a `0022` e só com o titular. Páginas usam `exigirAcessoNaPagina()` (cada página
  chama, além do layout: no Next 16 os dois renderizam em paralelo) e rotas de dados usam `exigirAcesso()`. Sem
  sessão 401, sem acesso 403; nunca só a tela. Outro produto (ex.: SOBEDESCE para Arquivos) só por `temProduto()`.
- **Login único**: `api/zro/{entrar,callback,eu,sair}` (PKCE S256, `state`/`nonce` selados, `id_token` conferido pela
  JWKS, `prompt=create` em Criar conta). Sessão própria em `maestro.sessions` (cookie `mae_sessao`, só o sha256;
  tokens da Absolute ZRO cifrados com `MAESTRO_KEY`). O `/eu` relê o perfil e os produtos no `userinfo` (≤ 1/min).
- **Banco**: duas portas em `src/lib/db/client.ts`. `asUser` assume `maestro_app` com RLS por organização em toda
  tabela (`with check` inclusive); `asSystem` só para sessões, callback do login, link do cliente, migração e a lista
  de espera (que assume `maestro_app` na hora). Cards só mudam pelas funções `maestro.card_*`. Migrações em
  `drizzle/*.sql` + `drizzle/meta/_journal.json`, aplicadas pelo migrador próprio (`src/lib/db/migrador.ts`); nunca
  edite uma aplicada.
- **Quadro**: a tela (`src/components/quadro`) grava por campo em `/api/quadro` mandando a versão de cada campo que viu
  (409 `conflito` traz o card atual); campos aceitos e forma de cada um em `CAMPOS_EDITAVEIS`/`valorDoCampo`
  (`src/lib/quadro/metodo.ts`); tempo real é poll de 5 s ("o que mudou desde"). Clientes e projetos em `src/lib/crm`
  (Server Actions conferem sessão e papel; o banco confere de novo). Remover cliente/projeto = `deleted_at`, só
  admin e gestão.
- **Z**: `api/zro/ia/[...caminho]` repassa ao HUB com o token da sessão (NDJSON sem buffer); a aba Z é a primeira.
- **Demonstração** (`src/lib/demo`, migration `0003`): "Carregar demonstração" monta a produtora de exemplo na
  organização da sessão (só admin e gestão); clientes, projetos e lotes com `demo = true`, cards `demo-…` com
  `dados.demo`; "Remover demonstração" apaga só esses (cards por `maestro.demo_apagar_cards()`). O selo
  "Demonstração" aparece no topo enquanto houver.
- **Aprovações** (plano v2 §4, `drizzle/0005_revisao.sql`, `src/lib/revisao`): a peça é um **link** (o Maestro não guarda
  bytes). `fontes/detectar.ts` é puro (Drive, YouTube, Vimeo, Dropbox `?raw=1`, mp4/mov/webm, HLS; outro https vira
  "link" com tempo digitado; o servidor nunca busca o link). Versões (`maestro.versao_criar`, n = volta) e comentários
  (`maestro.comentario_*`; tempo em ms, intervalo, pino x/y; o texto não muda) só por função. Equipe em
  `src/lib/revisao/equipe.ts` (asUser; link só admin e gestão; gerar leva Revisão → Em aprovação; versão nova com link
  ativo volta a Em aprovação). Cliente em `/a/[token]` + `/api/link/{pin,comentar,enviar}` (`link.ts`): transação como
  `maestro_app` **sem organização** e só as funções `maestro.link_*`; token só como sha256 (`token_enc` para copiar),
  PIN scrypt + cookie assinado, limites em `REGRAS.link*`, IP só como HMAC do dia; link morto = a mesma tela neutra. A
  decisão (`link_enviar`) vale uma vez por peça e volta e move o card (Aprovado; ajuste → Revisão com `ajustePedido`).
  Players em `src/components/revisao/player.tsx` (callbacks estáveis: o adaptador recria o player se mudarem);
  `MAESTRO_GOOGLE_API_KEY` (opcional, do titular) faz o Drive tocar num `<video>`; sem ela, iframe. CSP de `/a` e
  `/app/aprovacoes` em `next.config.ts` (abra host novo só lá). A demonstração usa os vídeos sintéticos
  `public/demo/*.mp4` (únicas URLs relativas aceitas, e só em card `demo-`).
- **A produtora por dentro** (plano v2 §6–§7, o `/painel` do ZRO portado; migrations `0006`–`0010`): toda tabela tem
  `org_id` e RLS pelo helper `maestro.politicas_padrao(tabela, escrita, remocao, leitura)`; chaves compostas
  `(org_id, id)` impedem apontar para a linha de outra organização. **Orçamentos** (`src/lib/orcamento`): `motor.ts` é
  puro e faz as mesmas contas do `quoteTotals` do ZRO (não mude sem o teste); tabela de preços com faixas e
  multiplicadores por nicho, modelos com fórmula estruturada (nada de `eval`); só rascunho edita; aprovar cria projeto
  e entradas uma vez. Timbrado = página com CSS de impressão (`.imprimivel`, A4), sem custo nem margem; o PDF é o
  "salvar PDF" do navegador. Deslocamento: contas em `deslocamento.ts`; Photon/OSRM/ANP em `servicos.ts` **desligados**
  até a ciência do titular (`MAESTRO_SERVICOS_ABERTOS=1` liga); a tela sempre aceita km e litro digitados.
  **Financeiro** (`src/lib/financeiro`) só admin e gestão (`podeVerDinheiro`), também no banco; baixas recalculam o
  pago por gatilho; recorrência gera o mês uma vez; a escala vira "a pagar" pelo gatilho `escala_sincronizar`. Sem
  DAS/ISS. **Freelas**: CPF e PIX só em `freela_pagamento`, cifrados com `selar()` (`MAESTRO_KEY`, contexto
  `freela_pagamento:<org>:<freela>:<campo>`), lidos só por admin e gestão; nunca em lista, log ou demonstração real.
  **Inventário**: reserva em conflito é barrada no banco (gatilho com trava, erro 23P01, e `exclude` com `btree_gist`
  quando existe). **Agenda** e documentos do projeto (checklist, ordem do dia, roteiro, decupagem). Navegação em
  `src/lib/navegacao.ts` (módulo sem "use client": o servidor também lê). Carro do Freela: só o mapa em
  `docs/integration-contracts/maestro-carro-do-freela.md`. A demonstração (`src/lib/demo/operacao.ts`) cobre tudo isso
  com `demo = true` e PIX aleatório; completa, nunca duplica.
- **Página inicial** (`src/app/page.tsx`, `inicio.css`, plano v2 §10, ADR 0024): pública, só o que existe, "Em breve"
  para o resto, capturas reais da demonstração em `public/produto/*-{claro,escuro}.webp` (refazer com
  `npm run db:seed:demo` quando a tela mudar; nunca mock). "Quero acesso" grava na lista de espera
  (`drizzle/0004`, `src/lib/lista-espera.ts`): `maestro_app` não tem privilégio na tabela, só a função
  `maestro.lista_espera_entrar()`; armadilha, 5/h por IP e consentimento obrigatório. A lista não libera ninguém.
- **Visual** (plano v2 §9): navegação em `src/components/nav.tsx` com os dados em `src/lib/navegacao.ts` (grupos só com tela de verdade); o latão (`--acento`)
  é superfície, traço e ícone, nunca texto; cada coluna do Quadro tem a cor dela (`--col-*`, `data-col`); motion só
  em CSS e sempre desligado em `prefers-reduced-motion`.
- Repositório público: nada de `.env`, chave, dado pessoal ou mídia dos repositórios antigos. Semente só `demo-` (`db:seed:demo` usa a mesma demonstração).

## Como rodar e testar

```
cp .env.example .env.local      # Postgres local: service postgresql start
npm install
npm run db:migrate && npm run dev
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build && npm run test:e2e
```

Os testes (`node --test` via tsx) criam bancos `maestro_test_<nome>` a partir de `TEST_DATABASE_URL` (padrão
`postgres://postgres:postgres@localhost:5432/postgres`) e sobem uma Absolute ZRO falsa (`tests/zro-falso.mts`).
Cobertura mínima que não pode cair: isolamento RLS com duas organizações (`rls.test.mts`), OIDC completo
(`zro.test.mts`), repasse da Z (`ia.test.mts`), `temAcesso` e papéis (`acesso.test.mts`), Quadro com conflito por campo (`quadro.test.mts`), clientes e projetos com
isolamento e papel de leitura (`crm.test.mts`), demonstração idempotente que remove só o que é `demo` (`demo.test.mts`),
lista de espera com RLS, limite e armadilha (`lista-espera.test.mts`), detector de fontes e tempo (`fontes.test.mts`),
revisão com duas organizações, porta estreita, PIN, limites e decisão idempotente (`revisao.test.mts`), motor e fluxo
do orçamento (`orcamento.test.mts`), deslocamento e ANP (`deslocamento.test.mts`), financeiro com baixas, recorrência e
escala (`financeiro.test.mts`), freelas, pagamento cifrado, reservas sem conflito e documentos (`operacao.test.mts`),
duas organizações em toda tabela da produtora (`produtora-rls.test.mts`). E2E: `npm run build && npm run test:e2e`
(Playwright, banco `maestro_test_e2e`): página inicial, "Quero acesso", reduzir movimento, navegação, a aprovação
inteira (`aprovacao.spec.ts`, mp4 local e YouTube/Vimeo falsos em `e2e/falsos`) e a produtora com a demonstração
(`produtora.spec.ts`, organização própria criada em `e2e/preparar.ts`).
