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
   Storage próprio. WhatsApp: `wa.me` com texto pronto, sem API. Plano avulso: não mexa em `zro.plan_products` (exceção do
   titular, 29/10/2026: o adicional da marca própria e o Pro v2, migração `0025` do HUB, em rascunho).
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
- **Z**: `api/zro/ia/[...caminho]` repassa ao HUB com o token da sessão (NDJSON sem buffer). **A Z não é a primeira
  aba** (titular, 29/10/2026; PRD Maestro v1.1, Plano de Integração §7–8: presença discreta, central de comando no HUB,
  nunca abrir o chat sozinho): ícone discreto no fim da cápsula, no topo do celular e em "Mais" (`Z` em
  `src/lib/navegacao.ts`); a barra do celular é Hoje · Quadro · Aprovar · Mais; `/app` (a volta do login) abre
  sempre no Hoje (`src/lib/entrada.ts`).
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
  A versão é do **card**: a ficha do Quadro tem o bloco "Versões" (`components/quadro/versoes.tsx`, lista por
  `versoesDoCard`, leitura vê sem o campo) e cola o link pelo mesmo `useNovaVersao` → `novaVersaoAcao` do lote
  (`components/revisao/nova-versao.ts`); o lote que tem o card já mostra. Apagar versão não tem tela (nem no lote).
  Players em `src/components/revisao/player.tsx` (callbacks estáveis: o adaptador recria o player se mudarem);
  `MAESTRO_GOOGLE_API_KEY` (opcional, do titular; desde 29/10/2026 variável compartilhada do time, chave "Absolute ZRO –
  navegador" do projeto Google do ecossistema, restrita por site à Drive API) faz o Drive tocar num `<video>`; sem
  ela, iframe. CSP de `/a` e
  `/app/aprovacoes` em `next.config.ts` (abra host novo só lá). A demonstração usa os vídeos sintéticos
  `public/demo/*.mp4` (únicas URLs relativas aceitas, e só em card `demo-`).
- **Drive pelo SOBEDESCE** (plano v2 §4.1 e §5, fases 7–10; `src/lib/sobedesce`, `drizzle/0019`; contrato em
  `docs/integration-contracts/maestro-sobedesce.md`): só com `temProduto(sessao, 'sobedesce')`. A ponte
  (`ponte.ts`) pede ao HUB um `zro-pedido+jwt` (`POST <HUB>/api/v1/apps/pedidos`, Bearer da sessão com escopo
  `maestro.projects`) e o próprio Maestro chama o SOBEDESCE na `url` devolvida (https; http só em loopback de teste);
  desfazer sem a pessoa usa a credencial do Maestro (Basic) + `sub`. **Arquivos** (`/app/arquivos`): sem o produto,
  cadeado e 403 em `POST /api/arquivos/token`; com ele, o token curto do Drive (`drive.token`) só vai para a memória da
  aba (`components/arquivos/drive-cliente.ts`), o navegador (`navegador.tsx`) usa o núcleo de `packages/drive-web`
  (cópias idênticas em `src/lib/drive-web/` e `public/drive-sw.js`; `tests/drive-sobedesce.test.mts` confere; mude no
  pacote e copie) e chama o Google direto; "Estrutura no Drive" e "Ligar a um projeto" gravam só
  `projects.drive_folder_id`/`drive_folder_nome`. **Revisão**: a equipe toca o Drive pelo SW (`/app/stream/<id>`,
  Range, contexto `DriveEquipe` no player) e tem "Escolher no Drive"; gerar o link e versão nova com link ativo ligam
  "qualquer pessoa com o link" (`revisao.ts`, `versoes.compartilhamento` por `maestro.versao_compartilhamento`);
  revogar e fechar desligam; vencido, o `GET /api/cron/revisao` (Vercel Cron, `CRON_SECRET`) desliga. Nenhum byte passa
  pelo servidor. Demonstração sem Drive de verdade: o estado honesto "Conecte o Drive no SOBEDESCE" (nunca arquivo
  inventado); o e2e usa a ponte falsa (`tests/ponte-falsa.mts`, `MAESTRO_PONTE_URL`) e intercepta o Google no navegador
  (`e2e/falsos/google-drive.ts`, `tests/drive-fixture.mts`).
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
- **Marca da produtora** (plano v2 §8, fase 11, `drizzle/0011`, `src/lib/marca`): `maestro.org_marca` (logo em bytea,
  nome, CNPJ, contato, endereço, assinatura, cor), todos leem e só admin muda. O logo entra só como PNG/JPEG/WebP
  conferido pelos bytes (SVG nunca), passa pelo `sharp` (gira, tira metadados, cabe em 1024 px) e é gravado em WebP até
  512 KB; sai por `GET /api/marca/<org>/<sha>` (porta `maestro.marca_logo`, cache imutável). A cor passa por contraste
  de 3:1 no papel e vira `--acento` (filete e ponto, nunca texto) no timbrado e em `/a`, `/p` e `/o`, para todos os
  planos. Nome, CNPJ, contato e endereço saíram de Ajustes → Empresa (a 0011 copiou uma vez); `lerEmpresa` junta os
  dois.
- **Maestro com a sua marca** (white-label, plano v2 §8, fase 20; titular 29/10/2026, `drizzle/0020`,
  `src/lib/marca/propria.ts`): adicional R$ 89,90/mês ou R$ 899/ano, incluído no Pro (planos do HUB na migração `0025`,
  em **rascunho** até o titular revisar os preços). O sinal chega na claim `zro_features` (`maestro.marca_propria`) no
  login e no `/eu` e fica em `organizations.zro_features`; **`temMarcaPropria()`** (`acesso.ts`: acesso + sinal) é o
  único ponto de decisão. Com o sinal: logo ou nome da produtora na cápsula e no topo, a cor como `--acento` no claro e
  no escuro (`acentosDaMarca` em `cor.ts`: 3:1 nos dois; no escuro clareia até passar; sem cor, latão), aba "Página ·
  Produtora · Maestro" e favicon do logo, "Powered by Absolute ZRO" discreto; `/a`, `/p` e `/o` sem a marca do Maestro
  (`marca_publica.propria`). Sem o sinal, Ajustes → Marca mostra o cartão "Disponível no Pro ou como adicional" com link
  para os planos do HUB (nada de compra falsa). Domínio próprio: depois, com autorização.
- **Contrato** (estudo MakersHub §4 item 4; titular 29/10/2026; `drizzle/0020`, `src/lib/contrato`): modelo base de
  "Contrato de prestação de serviços audiovisuais" em `modelo.ts` (puro: `{{variáveis}}`, números em `CAMPOS_CONFIG`,
  `desenharContrato` escapa tudo; CPF/CNPJ com dígito). **"Modelo base; revise com um advogado antes de usar"** sempre
  na tela; não dizemos mais que isso. Ajustes → Contrato (admin escreve, gestão lê): chips, prévia ao vivo, versões só de
  inclusão (`contrato_modelos`, imutável) e restaurar. "Enviar contrato junto" por orçamento (`orcamentos.contrato`,
  admin e gestão). Em `/o` o cliente lê o contrato preenchido, informa CPF/CNPJ e endereço, escolhe o portfólio e marca
  "Li e aceito"; o servidor preenche o mesmo modelo e a porta `orcamento_link_aceitar_contrato` aceita o orçamento e
  grava `maestro.contratos` (HTML, sha256 conferido por check, hora, IP em HMAC, navegador, nome, documento, endereço)
  numa transação; o gatilho `orcamentos_exige_contrato` barra aceitar sem o contrato. Registro imutável (gatilho
  `registro_imutavel`: só a linha demo sai), só admin e gestão leem, política `_cliente`. **Aceite eletrônico, não
  ICP-Brasil** (`AVISO_ACEITE`). `/app/contratos/<id>` mostra o registro com o hash conferido e vira PDF; links no
  orçamento, projeto e cliente. A demonstração aceita um orçamento com contrato (CNPJ de exemplo da Receita).
- **Pedido público e aceite** (plano v2 §6.2–§6.3, fase 14, `drizzle/0012`): `maestro.links_publicos` (tipos `pedido`
  e `orcamento`, token só como sha256 + `token_enc`, revogação, validade, um ativo por organização/orçamento; só admin
  e gestão) e `maestro.pedidos`. Quem não tem conta passa só pela porta estreita (`src/lib/publico/porta.ts`, funções
  `pedido_form`, `pedido_enviar`, `orcamento_link_abrir`, `orcamento_link_aceitar`, `orcamento_link_ajuste`), com os
  limites por IP do link de aprovação, armadilha, selo de tempo assinado (3 s a 24 h), 5/h por IP e 30/10 min por link
  (`REGRAS.pedido*`/`orcamento*`). As perguntas do `/p/<token>` vêm da tabela de preços (modelos = tipo, variável
  `nicho`, variáveis de número = entregas) e o cliente nunca vê preço nem multiplicador. "Gerar orçamento"
  (`src/lib/pedidos/equipe.ts`, puro em `formulario.ts`: `rascunhoDoPedido`) cria o cliente como lead e roda o motor.
  O link do orçamento (`src/lib/orcamento/link.ts`) combina 1–3 parcelas e vale até a validade; versão nova derruba o
  aceite da antiga. O aceite vale uma vez: cliente (se não há), projeto `MAE-` pendente de ligar ao HUB, parcelas a
  receber e o termo (nome, hora, sha256) no orçamento. Rotas `POST /api/publico/{pedido,orcamento/aceitar,orcamento/ajuste}`
  com Origin conferido; CSP de `/p` e `/o` em `next.config.ts`.
- **Hoje** (`/app/hoje`, `src/lib/hoje.ts`, desenho C1): agenda do dia, "Vencendo", "Com o cliente", **Retornar hoje**
  (com "Feito", "Amanhã" e "+1 sem.") e o caixa da semana (baixas de segunda a domingo), mais as contagens (cards no
  prazo, peças com o cliente, pedidos novos, orçamentos aguardando, a receber e a pagar, caixa, meta do mês); dinheiro
  só admin e gestão (o RLS esconde de qualquer jeito). Primeiro item de Produção e na barra do celular.
- **O negócio por dentro** (estudo MakersHub §4, itens 1, 2, 3, 6 e 7; `drizzle/0014`–`0018`; mapa das ligações em
  `docs/integration-contracts/maestro-z.md`):
  - **Funil** (`0014`, `src/lib/funil`): `pedidos.etapa` (novo, conversa, orcamento, negociando, ganho, perdido) e o
    `status` antigo andam juntos pelo gatilho `maestro.pedido_etapa` (quem muda a etapa manda; senão o status): Ganho
    só com o orçamento do pedido aprovado e é final; Perdido exige `motivo_perda` (check) e vira `recusado`; gerar
    orçamento leva a "Orçamento enviado"; aprovar o orçamento (link ou equipe, gatilho `orcamento_ganha_pedido`) ganha.
    Próximo contato + nota em pedidos e clientes; `maestro.contatos` guarda o "contato feito". Regras puras em
    `regras.ts`; telas em `/app/pedidos` (quadro ou lista, `?ver=lista`) e nas fichas.
  - **Números** (`0015`, `src/lib/numeros`, `/app/financeiro/numeros`): `maestro.metas` (uma por mês, só admin e
    gestão, também na leitura); fórmulas puras em `formulas.ts` (faturado = entradas por vencimento; recebido = baixas;
    ticket = orçamentos aprovados; conversão = pedidos com orçamento aprovado; taxa de ganho = ganhos ÷ fechados no
    período; margem por projeto e cliente pelos lançamentos ligados). Só dados reais: sem base, "—".
  - **Importar planilha** (`0016`, `src/lib/importar`, `/app/ajustes/importar`, admin e gestão): `csv.ts` puro (leitor,
    mapa pelos cabeçalhos em português, conferência por linha, limites 1 MB/2.000 linhas/40 colunas, modelos em
    `/api/importar/modelo/<tipo>`); `servidor.ts` faz a prévia só lendo e a confirmação numa transação, conferindo o
    sha256 do mesmo texto (quebras de linha normalizadas antes) e deixando `maestro.importacoes` (relatório, sem o
    arquivo, só inclusão). Casa por e-mail, código, patrimônio, série ou nome; célula vazia não apaga. Freelas aceitam
    `zro_sub` (conta Absolute ZRO); equipamentos entram como da produtora. Exemplos em `docs/demonstracao/*.csv`.
  - **Agenda no celular** (`0017`, `src/lib/agenda/{ics,feed,rotas}.ts`): `maestro.agenda_assinaturas` (um endereço
    ativo por pessoa, só o sha256, cada um vê o próprio); `GET /api/agenda/<token>.ics` passa pela porta
    `maestro.agenda_feed_dono` (pessoa ativa e último login com acesso, o mesmo `temAcesso`) e lê como a pessoa;
    `GET /api/agenda/minha` baixa com a sessão. RFC 5545 com `TZID=America/Sao_Paulo`.
  - **Google Agenda pelas Conexões** (ADR 0026 do HUB, `drizzle/0021`, `src/lib/agenda/{google,sincronia,depois}.ts`;
    contrato em `docs/integration-contracts/agenda.md`): a pessoa conecta o Google Agenda UMA vez em
    `absolutezro.com/conexoes`; o Maestro nunca vê token do Google e fala só com a API `/api/v1/agenda/*` do HUB
    (`naAgendaDoHub`, base `basePonte()`), com o access token da sessão e o escopo `zro.agenda` (pedido no login; a ida
    cai em `nivel=sem_agenda` e depois `basico` se a Absolute ZRO recusar com invalid_scope). Ajustes → Agenda: estado
    da conexão, "Enviar para o Google" + tipos (`maestro.agenda_google`, cada um o seu) e "Sincronizar agora".
    **Caixa de saída**: gatilhos em `eventos`, `escalas` e `cards` enfileiram `evento-<id>`/`card-<id>` em
    `maestro.agenda_google_fila` para quem ligou, na transação do salvar (demonstração nunca); `sincronizarDepois(sessao)`
    (`after()`) esvazia a fila da pessoa da sessão depois da resposta, lendo o item como ela (acesso por cliente vale):
    vai (PUT, só se o hash mudou, `agenda_google_enviados`) ou sai (DELETE). Falha nunca desfaz o salvar: tentativas e
    espera crescente; sem conexão, app desligado ou sem o escopo param a rodada e viram o estado da tela. A fila de quem
    não abre o Maestro espera a próxima vez dessa pessoa. Ação nova que mexe em data/hora/lugar de item da agenda: chame
    `sincronizarDepois`. "Ocupado no Google" (`components/ocupado-google.tsx`, `GET /api/agenda/google/ocupado`) ao
    marcar e na ficha da diária. Testes: `tests/agenda-google.test.mts` (HUB falso em `tests/ponte-falsa.mts`, que o e2e
    controla por `/__agenda`) e `e2e/agenda-google.spec.ts`.
  - **Acesso por cliente** (`0018`, `src/lib/pessoas.ts`, Ajustes → Pessoas): `acesso_restrito` + `acesso_clientes`
    para `equipe` e `leitura` (admin e gestão nunca); políticas RESTRITIVAS `<tabela>_cliente` (helpers
    `maestro.cliente_visivel`, `projeto_visivel`, `card_visivel`…) em toda tabela ligada a cliente, e os gatilhos
    `cards_guarda_cliente`/`*_guarda_cliente` barram as funções security definer. Tabela nova ligada a cliente precisa
    da política `_cliente` e de entrar em `tests/acesso-cliente.test.mts`.
  - **Z** (ligada só para leitura, titular 28/10/2026): `POST /api/zro/maestro/resumo` (`src/lib/zro/{pedido,resumo-da-z}.ts`)
    com o pedido assinado `zro-pedido+jwt` do HUB (ação `maestro.resumo`, a única em `ACOES_ABERTAS`), lido como a
    pessoa, com fonte e hora. Quem chama é a ferramenta `ver_maestro` da Z do HUB (`packages/core/src/ia-maestro.ts`).
    Ação nova (escrita pela Z) só com nova decisão do titular e entrando em `ACOES_ABERTAS`.
- **Kit do freela** (`drizzle/0013`, `src/lib/freelas/{kit,equipamentos}.ts`): `freela_equipamentos` (origem `maestro`
  ou `carro-do-freela`) e `escala_equipamentos`; o aluguel (diária × dias) soma ao mesmo "a pagar" da escala (gatilho
  `escala_sincronizar` refeito na 0013). Itens do Carro do Freela são só leitura (gatilho barra `maestro_app`). A
  sincronização (`aplicarInventarioDoCarro`, contrato `freela.inventario/1`, pelo `zro_sub`) está pronta e **desligada**:
  nada a chama enquanto o Carro não tem banco (`docs/integration-contracts/maestro-carro-do-freela.md`).
- **Página inicial** (`src/app/page.tsx`, `inicio.css`, plano v2 §10, ADR 0024): pública, só o que existe, "Em breve"
  para o resto, capturas reais da demonstração em `public/produto/*-{claro,escuro}.webp` (refazer com
  `npm run db:seed:demo` quando a tela mudar; nunca mock). "Quero acesso" grava na lista de espera
  (`drizzle/0004`, `src/lib/lista-espera.ts`): `maestro_app` não tem privilégio na tabela, só a função
  `maestro.lista_espera_entrar()`; armadilha, 5/h por IP e consentimento obrigatório. A lista não libera ninguém.
- **Visual: C1 · Aurora** (escolha do titular, 28/10/2026; plano v2 §9): uma luz ambiente que segue a hora de quem
  vê (`src/components/ambiente.tsx` + `src/lib/hora.ts`): o servidor desenha a luz apagada e o relógio vazio; ao montar,
  o `<html>` ganha `data-hora` (`manha`, `tarde`, `fim`, `noite`) e o plano `.amb` acende. No claro, pêssego/rosa de
  manhã até lavanda à noite; **o escuro é a noite** (índigo, ameixa). As cores são propriedades registradas
  (`@property --amb-*`): trocar de hora cruza em 60 s; o plano deriva 3% em 120 s; painéis sobem 8 px uma vez; nada
  em laço visível; tudo parado com "reduzir movimento". Tokens em `globals.css` (`--luz-*`, `--painel`, `--coluna`,
  `--card-sombra`, `--st-*`, `--g-entra`/`--g-sai`); acabamentos tela a tela em `aurora.css`. Navegação: no computador,
  a **cápsula de vidro no topo** (`Capsula` em `src/components/nav.tsx`, dados em `src/lib/navegacao.ts`): Z, os grupos
  Produção/Comercial/Operação como menus (o botão mostra a seção atual, "Produção: Quadro"), Financeiro direto, Ajustes,
  o relógio "Manhã · 10:42", tema e conta; no celular, topo + barra de baixo flutuante com "Mais". Cards brancos,
  colunas foscas sem blur; `backdrop-filter` só na cápsula, nos painéis grandes e nos botões de vidro. Chips e selos de
  estado = fundo tingido + ponto, **texto sempre grafite/branco**; latão para "com o cliente" (`enviado`); gráfico em
  grafite e pêssego. O latão (`--acento`) segue superfície, traço e ícone, nunca texto; cada coluna do Quadro tem a cor
  dela (`--col-*`, `data-col`). **Contraste**: todo texto passa AA sobre o ponto mais forte da luz (o cinza de apoio
  claro é `#5e5e63` por isso); `e2e/visual.spec.ts` confere as telas principais nas quatro horas e no escuro. O
  timbrado e os documentos continuam papel branco (também no escuro e no PDF). Hoje abre com a saudação da hora
  ("Bom dia, Diana."; padrão do servidor no fuso do Brasil, corrigido ao montar).
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
duas organizações em toda tabela da produtora (`produtora-rls.test.mts`), logo, cor e marca com duas organizações
(`marca.test.mts`), pedido público, link e aceite idempotente (`pedidos.test.mts`), contagens do Hoje (`hoje.test.mts`),
kit do freela, aluguel na escala e sincronização desligada (`freela-equipamentos.test.mts`), funil e retornos
(`funil.test.mts`), números (`numeros.test.mts`), importar planilha (`importar.test.mts`), agenda .ics
(`agenda-ics.test.mts`), acesso por cliente em toda tabela ligada a cliente (`acesso-cliente.test.mts`), as tabelas
novas com duas organizações (`negocio-rls.test.mts`) e o resumo para a Z (`resumo-z.test.mts`), o contrato (preenchimento, versões, aceite com hash, imutável;
`contrato.test.mts`), a marca própria (sinal ligado e desligado, contraste, duas organizações; `marca-propria.test.mts`), a ponte do Drive, Arquivos, compartilhar/recolher e o agendamento
(`drive-sobedesce.test.mts`), a versão colada na ficha do card (`versoes-card.test.mts`). E2E: `npm run build && npm run test:e2e`
(Playwright, banco `maestro_test_e2e`): página inicial, "Quero acesso", reduzir movimento, navegação, a aprovação
inteira (`aprovacao.spec.ts`, mp4 local e YouTube/Vimeo falsos em `e2e/falsos`) e a versão colada na ficha do card que aparece no lote (`versao-card.spec.ts`) e a produtora com a demonstração
(`produtora.spec.ts`, organização própria criada em `e2e/preparar.ts`) e o ciclo comercial (`comercial.spec.ts`: pedido
público → Pedidos → gerar orçamento → link → aceite → projeto → Hoje, organização própria) e o visual
(`visual.spec.ts`: contraste AA em cada hora e no escuro, luz parada com reduzir movimento) e o negócio
(`negocio.spec.ts`: funil com Retornar hoje, importar, .ics e acesso por cliente, organização própria) e o contrato
(`contrato.spec.ts`: Ajustes → Contrato, enviar junto, o cliente aceita com CPF, o registro para a equipe, a marca
própria ligada e o cartão do adicional; `SHOTS_DIR` guarda `ct-*`/`wl-*`) e o Drive (`arquivos.spec.ts`: cadeado sem o SOBEDESCE, navegador, prévia com timecode, estrutura do projeto, Drive tocando na
revisão e Escolher no Drive; `SHOTS_DIR` guarda as capturas) e nada cortado no celular (`sem-corte.spec.ts` com o
detector `e2e/corte.ts`: todas as telas a 375 e 393 px, claro e escuro, Chromium e WebKit; tela nova entra na lista;
faixa que rola de lado só com `data-rolagem`; regras de celular em `src/app/celular.css`) e o Quadro com fluidez
(`quadro.spec.ts`: folha na janela inteira, "Novo card", Mover para com Desfazer, troca de seção com View Transition),
a troca de seção sem duas telas juntas (`transicao.spec.ts`, Chromium e WebKit: pelo relógio das animações e amostrando
quadro a quadro) e os gestos do Quadro no celular (`gestos.spec.ts`, Chromium e WebKit, organização própria).
Movimento (29/10/2026): toda folha usa `Folha` (`src/components/folha.tsx`, portal no `<body>`). **Troca de seção**
(`src/components/movimento.tsx` + `src/app/motion.css`): a View Transition é chamada por nós, não pelo
`<ViewTransition>` do React (no Safari do iPhone o par sai/entra do React deixava a tela velha e a nova uma sobre a
outra): o clique num link `/app/…` é segurado na captura, a seção atual (`.m-pagina`) vira `m-sai`, o Next navega
dentro da transição e a nova, quando monta (esperando até 320 ms pelo conteúdo se veio o esqueleto), vira `m-entra`;
a velha some em 110 ms e a nova só começa aos 100 ms (nunca as duas juntas). Sentido pelo `data-sentido` do link (ordem
de `ABAS`). Nada de `var()` nas regras dos pseudo-elementos da transição, e nada de vidro (`backdrop-filter`) na seção
durante a troca (no WebKit ele escapa da foto). **Gestos do Quadro no celular** (`src/components/quadro/gestos.ts`):
deslizar de lado troca de coluna (segue o dedo, elástico nas pontas, mola pela velocidade, pílula de vidro que anda
junto; `touch-action: pan-y`; começo a 20 px da borda é do Safari); segurar o card 280 ms ergue um fantasma do tamanho
real (sem o arrastar nativo do HTML no toque: `draggable` só com mouse), os outros abrem espaço, a página rola perto das
bordas, segurar na borda da tela (0,42 s) passa de coluna, soltar na pílula manda para aquela coluna, soltar acima do
Quadro desiste; grava pelo mesmo `moverPara` (aviso com Desfazer) e o FLIP é "fixado" antes (`useFlip` devolve
`fixar`). Links da cápsula pré-buscam com a intenção; a barra do celular pré-busca inteira; `staleTimes` em
`next.config.ts` (o Quadro chama `renovarSecoes` depois de gravar). Nada de `transform` que fique preso num ancestral
de `position: fixed`. Unitário da hora em
`hora.test.mts`.
