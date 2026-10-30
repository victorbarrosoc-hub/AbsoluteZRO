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
   titular, 29/10/2026: o adicional da marca própria e o Pro v2, migração `0025` do HUB, em rascunho; e o lançamento em
   Beta grátis, migração `0027`: grátis, Completo e Pro).
5. Quadro: as 8 colunas do método (`src/lib/quadro/metodo.ts`); "Com o cliente" = **Em aprovação**, "Publicado" =
   **Entregue**. O método não muda: desde 29/10/2026 (colunas como no Trello) cada produtora renomeia, recolore e
   reordena as 8 e cria as dela, mas as 8 nunca são arquivadas e tudo o que o produto automatiza olha o **id/papel** da
   coluna, nunca o nome.
6. Logo: o gesto da pauta em latão (`public/brand/maestro-symbol*.svg`), colorido ao lado da marca flat da Absolute
   ZRO; o resto é identidade Absolute ZRO (Figtree, grafite, Liquid Glass, tema claro padrão, pouco texto).

## Como funciona

- **Acesso**: `temAcesso()` em `src/lib/auth/acesso.ts` é o ÚNICO ponto de decisão: `zro_release.maestro` released
  ou allowed (sem a claim = fechado) **e** `maestro` em `zro_products`. As duas claims ficam na sessão e são relidas
  no `/eu`. **Hoje o Maestro está fechado** (migration `0024` do HUB, `product_release` em `development`: só a lista
  de acesso entra). **Lançamento em Beta** (ADR 0027 do HUB, no OK final do titular;
  `docs/operations/lancamento-maestro.md`): a migration `0027` abre o gate (`public_beta`, todos os canais) e põe o
  Maestro no grátis, no Completo e no Pro (o grátis nunca leva `maestro.marca_propria`); a vitrine vira com
  `MAESTRO_LANCADO` em `src/lib/site.ts` (`node scripts/lancamento-maestro.mjs --abrir` na raiz, junto com as listas
  da família dos outros apps). A página inicial lançada mostra "Beta" (sem "grátis": posicionamento da marca, 29/10/2026), "Criar conta"/"Entrar com
  Absolute ZRO" (`CRIAR_CONTA_ZRO`/`ENTRAR_ZRO`, direto no login único), "No celular, como app." e, só com instalador
  publicado no catálogo da central do HUB, o app de computador (`src/lib/desktop.ts`; `MAESTRO_CATALOGO_DESKTOP=desligado`
  no e2e). A lista de espera fica no código, sem aparecer. A vitrine nunca abre nada: quem entra é o gate. Páginas usam `exigirAcessoNaPagina()` (cada página
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
- **Colunas do Quadro** (titular 29/10/2026, "como no Trello"; `drizzle/0024_colunas.sql`, `src/lib/quadro/colunas.ts`
  puro, `colunas-servidor.ts`, tela em `components/quadro/colunas.tsx`): `maestro.colunas` por organização (id, papel,
  nome 1–30, cor da paleta fechada `CORES_COLUNA`/`--cor-*`, ordem, arquivada). As 8 do método são de sistema: **id =
  papel** (`pauta`…`entregue`), então renomear/reordenar não regrava card nem histórico e toda automação (`link_enviar`
  → Aprovado/Revisão, gerar link → Em aprovação, Hoje, agenda, Z) segue pelo id; nunca compare pelo nome. As da
  produtora (`x-<12 hex>`, até 24) contam como "em produção" (`emTrabalho`, `FORA_DO_TRABALHO`). Todos leem
  (inclusive acesso por cliente); só admin e gestão mudam (`podeEditarColunas`), e só pelas funções `maestro.coluna_*`
  (`maestro_app` sem insert/update/delete). Arquivar exige o destino e move cada card por `card_mudar` (apagados
  inclusive; histórico só de inclusão); sistema não arquiva (check + função). O card só entra em coluna viva da própria
  organização (gatilho `cards_coluna_valida`, que trocou o check fixo `cards_coluna_ok`). Organização nova ganha as 8
  pelo gatilho em `organizations`. Na tela: clique duplo no cabeçalho renomeia e arrastar o cabeçalho reordena
  (computador); no celular, tocar na aba já escolhida renomeia; "Colunas" abre a folha "Editar colunas" (`Folha`):
  renomear, cor, alça (mouse na hora, toque segurando 280 ms, setas do teclado), arquivar com destino, "Nova coluna",
  arquivadas com "Restaurar" e "Restaurar padrão". Tudo otimista, com volta se o banco recusar; o poll de 5 s traz as
  colunas. `/api/quadro` aceita `coluna_criar|coluna_mudar|coluna_ordenar|coluna_arquivar|coluna_restaurar|colunas_padrao`.
  Nome ou cor de coluna em outra tela: junte `maestro.colunas` pelo id (`colunaNome`/`colunaCor`, `data-cor`).
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
  "salvar PDF" do navegador. Deslocamento: contas em `deslocamento.ts`; Photon/OSRM em `servicos.ts` **ligados**
  desde 29/10/2026 (o titular pediu o km medido sozinho; `MAESTRO_SERVICOS_ABERTOS=0` desliga; só o servidor chama,
  busca presa ao Brasil, memória de 12 h). O texto digitado vira lugar sozinho (`melhorLugar`: cidade com o mesmo
  nome, capital em empate, UF dita) ao sair do campo, no Enter ou quando só uma cidade casa, e a dica mostra
  "Cidade/UF"; a rota preenche o km, km digitado vale com "Usar o da rota". Veículos de partida em `veiculos.ts`
  (consumo de estrada por combustível) junto com os do inventário. A tela sempre aceita km, consumo e litro
  digitados. Teste com Photon/OSRM falsos (`tests/rota-fixture.mts`, `MAESTRO_PHOTON_URL`/`MAESTRO_OSRM_URL`).
  **Combustível automático** (titular 29/10/2026, `drizzle/0022`): gasolina, etanol ou diesel S10 com o preço médio da
  semana da ANP (planilha semanal `resumo_semanal_lpc`, abas MUNICIPIOS/ESTADOS/BRASIL) na **cidade de saída** (onde
  se abastece; sem saída, a da produtora em Ajustes → Empresa), senão no estado, senão no Brasil (`escolherPreco`,
  puro; nome digitado sem acento/caixa/UF casa), sempre com "· ANP, semana de dd/mm". Só o agendamento fala com
  a ANP: `GET /api/cron/combustivel` (Vercel Cron no sábado, `CRON_SECRET`, porta `src/lib/cron.ts`) guarda a semana em
  `maestro.combustivel_precos` (referência sem organização: `maestro_app` só SELECT; 8 semanas) e
  `coletarSeAtrasado` (`after()` na ação) cobre o agendamento atrasado, uma vez por hora. Preço digitado vale para
  aquele combustível naquele orçamento (localStorage); a linha grava o preço usado (orçamento salvo não muda). Sem
  semana guardada, campo vazio e "Digite o preço do posto"; nunca preço inventado. Teste com a ANP falsa
  (`tests/anp-fixture.mts`, `MAESTRO_ANP_URL`).
  **Financeiro** (`src/lib/financeiro`) só com a área Financeiro (`pode(sessao, "financeiro")`, ver "Quem vê o quê"), também no banco; baixas recalculam o
  pago por gatilho; recorrência gera o mês uma vez; a escala vira "a pagar" pelo gatilho `escala_sincronizar`. Sem
  DAS/ISS. **Freelas**: CPF e PIX só em `freela_pagamento`, cifrados com `selar()` (`MAESTRO_KEY`, contexto
  `freela_pagamento:<org>:<freela>:<campo>`), lidos só com a área Dados da equipe; nunca em lista, log ou demonstração real.
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
  só com a área Financeiro e orçamentos só com a área Orçamentos (o RLS esconde de qualquer jeito). Primeiro item de
  Produção e na barra do celular.
- **Quem vê o quê** (titular 29/10/2026, [ADR 0031](../../docs/decisions/0031-maestro-acesso-por-area.md), mapa e
  auditoria em `docs/permissoes.md`; `drizzle/0027`, `src/lib/acessos.ts` puro, `src/lib/acessos-servidor.ts`): o papel
  do HUB decide escrever/remover; por cima, seis **áreas** (`financeiro`, `orcamentos`, `contratos`, `diarias`,
  `dados_equipe`, `inventario_valores`) com padrão por papel (`PADRAO` = `maestro.area_padrao`; Gestão sem Financeiro,
  Equipe e Leitura sem nenhuma) e ajuste por pessoa em `maestro.acessos`, que **só a Administração** muda (Ajustes →
  Pessoas → "O que vê", `salvarAreas`, auditado `acesso.areas`); a Administração vê tudo sempre. No banco:
  `maestro.pode(org, área)` em política restritiva `<tabela>_area` (`maestro.politica_area`) nas tabelas de cada área;
  colunas de dinheiro em tabelas de todos (escala, freela, kit, equipamento, pedido, projeto) mascaradas na consulta
  (`case when maestro.pode(...)`, `areasNaTx`) e guardadas pelos gatilhos `*_guarda_area` (quem não vê não troca; a
  escala nova pega a diária do cadastro). Na tela: `sessao.acessos` e `pode(sessao, área)`; a navegação esconde a seção
  (`gruposPara`/`abasOcultas`, `Aba.area`); endereço digitado mostra `SemArea` ou 404. Tela, ação ou tabela nova com
  dinheiro: escolha a área, ponha a política/máscara e um caso em `tests/acessos.test.mts`.
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
- **Pessoas da Absolute ZRO** (ADR 0029 do HUB, `drizzle/0023`, `src/lib/zro/pessoas.ts`; contrato em
  `docs/integration-contracts/pessoas.md`): o login pede `zro.pessoas` (HUB sem a 0029 recusa e a ida cai em
  `nivel=sem_pessoas`, depois `sem_agenda` e `basico`) e guarda o @ (`preferred_username`) em `members.zro_arroba`.
  `buscarPessoas`/`pessoaPorArroba`/`convidarPessoa` falam só com `/api/v1/pessoas/*` do HUB (`basePonte()`) com o
  token da sessão; o que vem é conferido em `pessoaDoHub` (e-mail e telefone nunca entram). Ajustes → Pessoas: a
  **administração** busca pelo @ e convida (Equipe/Gestão/Leitura → editor/manager/viewer no HUB; a pessoa aceita lá);
  cada pessoa mostra o @ e a **Função na produtora** (`members.funcao`, texto livre com sugestões
  `FUNCOES_NA_PRODUTORA`, só administração muda, política `members_admin`; não mexe no papel). Freelas: "Achar pelo @"
  (`PessoasZro` em `src/components/pessoas-zro.tsx`) relê o perfil no HUB e cria o freela ligado
  (`src/lib/freelas/da-zro.ts`: `zro_sub` + `zro_arroba`, um por organização pelo índice único; nome, cidade e funções
  mapeadas; contato nunca vem do perfil); a ficha mostra o @ com link para o perfil. O inventário do Carro chega pelo
  mesmo `zro_sub` só quando `CARRO_SYNC_ATIVO` ligar. Testes: `tests/pessoas-zro.test.mts` e `e2e/pessoas-zro.spec.ts`
  (HUB falso com perfis fictícios em `tests/ponte-falsa.mts`).
- **Set da Absolute ZRO** (ADR 0032 do HUB, contrato em `docs/integration-contracts/set.md`): quem da equipe e dos
  contatos está online e as conversas (diretas e do projeto canônico). O widget `<zro-set>` vem de
  `absolutezro.com/set/v1/zro-set.js` (`components/set-zro.tsx`, pílula discreta na cápsula e no topo do celular, como
  a Z; nunca aba) e fala só com `/api/zro/set/*`, o repasse de `src/lib/zro/set.ts`: caminhos e métodos fechados
  (`caminhoSet`), Origin conferido, JSON até 20 kB, Bearer da sessão com `zro.set` só no servidor, ETag/304 de ida e
  volta. O login pede `zro.set` (HUB antigo recusa: `nivel=sem_set`); sem o escopo, 401 `reconectar_zro` e a pílula
  some, sem apagar os tokens da Z. Testes: `tests/set.test.mts` e `e2e/set.spec.ts`. Duas baterias de e2e na mesma máquina:
  `E2E_DB_NAME=maestro_test_<nome>` (com `E2E_PORT`, `E2E_PONTE_PORT` e `E2E_ANP_PORT` próprios).
- **Kit do freela** (`drizzle/0013`, `src/lib/freelas/{kit,equipamentos}.ts`): `freela_equipamentos` (origem `maestro`
  ou `carro-do-freela`) e `escala_equipamentos`; o aluguel (diária × dias) soma ao mesmo "a pagar" da escala (gatilho
  `escala_sincronizar` refeito na 0013). Itens do Carro do Freela são só leitura (gatilho barra `maestro_app`). A
  sincronização (`aplicarInventarioDoCarro`, contrato `freela.inventario/1`, pelo `zro_sub`) está pronta e **desligada**:
  nada a chama enquanto o Carro não tem banco (`docs/integration-contracts/maestro-carro-do-freela.md`).
- **Criação · Roteiro** (plano da Criação, fase F1 = só o núcleo, sem tela; `drizzle/0030_roteiros.sql`,
  `src/lib/criacao/roteiro/**`): UM documento (`Roteiro`: formato, alvo min–max, wpm 150, pessoas, cenas → blocos
  `fala`/`acao`/`plano`/`lettering`/`audio`/`observacao`/`nota`, ids estáveis) em `roteiros.conteudo`, conferido por
  `lerRoteiro` (conserta; `null` só fora dos limites: 300 cenas, 3.000 blocos, 256 KB). `dica` é o cinza dos modelos e
  nunca vira texto. Tempo em `tempo.ts` (fala = palavras ÷ wpm pela regra do `countWords` do TPeasy; plano + ações
  = um plano; cena = `duracaoSeg` digitado ou o maior entre voz e imagem; medidor com 5% de folga). Vistas puras em
  `vistas/` (Literário, Técnico, Teleprompter na marcação do TPeasy + `paraBackupTpeasy` com id
  `maestro-<roteiro>-<pessoa>`, Edição, Markdown, `dadosImpressao`); 6 modelos em `modelos.ts`; documento antigo →
  novo em `antigo.ts` (só leitura); `juntar.ts` junta por id no 409 do `rev`. Banco: `servidor.ts` (asUser; `rev` sobe
  por gatilho; estado só admin/gestão pelo gatilho `roteiros_guarda`; `versao_atual`/`rev`/`demo` sem UPDATE para
  `maestro_app`), versões só por `maestro.roteiro_versao_salvar` (sha256 por check, `registro_imutavel`), políticas
  `_cliente` (sem vínculo fica escondido de quem é restrito). Papéis em `src/lib/criacao/permissoes.ts`
  (`podeVerCriacao`/`podeEditarCriacao`/`podeEnviarCriacao`, desde a F3 pela capacidade `criacao` de `acessos.ts`,
  `podeCriacao`; as políticas da 0030 têm os mesmos papéis e o `roteiro.test.mts` confere).
  O migrador aplica qualquer migração do journal ainda não gravada (pelo `when` ou pelo hash), então números fora de
  ordem entre frentes funcionam; `when` repetido para o deploy.
- **Criação · editor do Roteiro** (fase F2): "Criação" no grupo Produção e em Mais (`navegacao.ts`; a barra do celular
  não muda). `/app/criacao` (cartões; "Novo roteiro" em `components/criacao/roteiro/novo.tsx` pela Server Action
  `criarRoteiroAcao`; `?novo=1&projeto=` abre a folha já ligada). O seletor Roteiros · Fluxos é
  `components/criacao/abas.tsx`, nas duas rotas irmãs (`/app/criacao` e `/app/criacao/fluxos`, mesmo título; o
  `?aba=fluxos` antigo redireciona). Editor em
  `/app/criacao/roteiros/[id]` (`editor.tsx`): as vistas puras da F1 (Técnico com `incluirVazios`, a `dica` é só
  placeholder), operações puras em `lib/criacao/roteiro/editar.ts` (nunca mutam; o que não mudou fica o mesmo objeto) e
  "Comparar" em `comparar.ts`. Gravação em `gravacao.ts`: 600 ms + ao sair do campo/aba, sempre com `rev`; 409 traz o
  atual e a tela junta com `juntarRoteiros(base, meu, deles)` e grava de novo; poll de 5 s só adota sem mudança local.
  Rota única `/api/criacao/roteiros/[id]` (`lib/criacao/roteiro/rota.ts`: GET `?rev=`/`?versoes`/`?versao=`, POST
  `salvar|versao|restaurar|ligar|estado|lixeira`, Origin conferida, papéis por `permissoes.ts`). Folha A4 em
  `roteiros/[id]/imprimir` (`dadosImpressao`). Estados e nomes sem banco em `nomes.ts` (a tela no navegador importa
  dali, nunca de `servidor.ts`). Projeto: seção "Roteiros"; documento `roteiro`/`decupagem` antigo com "Abrir no editor
  novo" (`abrirNoEditorNovoAcao`); os chips de Documentos não criam mais esses dois tipos. Demonstração: o roteiro
  institucional com a v1 (`src/lib/demo/criacao.ts`). CSS em `criacao.css` (prefixo `cr-`).
- **Criação · saídas do Roteiro** (fase F3; contrato em `docs/integration-contracts/maestro-roteiro.md`): "Enviar ▾"
  (`components/criacao/roteiro/enviar.tsx`) só para `podeEnviarCriacao`; tudo sai de uma **versão salva** (a folha
  oferece salvar a próxima quando o rascunho mudou, comparando com `mesmoConteudo`). Saídas puras em
  `lib/criacao/roteiro/saidas.ts`: `saidaTpeasy` (texto, `.txt` com o título no nome, backup com id estável e `updated` =
  hora da versão), `paraRoteiroMaestro` (`maestro.roteiro/1`, schema zod em `packages/media-contracts/src/roteiro.ts`;
  mudou a forma, `npm run contracts:export` na raiz e `ATUALIZAR_EXEMPLOS=1` no `roteiro-saidas.test.mts` para o
  exemplo em `docs/integration-contracts/exemplos/`). PDF para a edição = folha A4 `?vista=edicao&versao=n`. Cada envio
  é `POST {op:"enviado"}` → `registrarEnvio` (auditoria `roteiro.enviado` com o sha256 do banco). A opção do AEON (o
  arquivo) só com `podeMandarParaAeon` (claim `zro_release["ai-edit"]` released/allowed + produto + papel): hoje o AEON
  está fechado e nada aparece; a rota recusa `aeon` também. "Para o cliente aprovar" é a F7 (abaixo). Ficha do card:
  bloco "Criação" (`components/criacao/do-card.tsx`, `criacaoDoCardAcao`: roteiros e fluxos do card num pedido só).
  Nome de arquivo com acento só sai
  do navegador com locale UTF-8 (o `playwright.config.ts` força `C.UTF-8`).
- **Criação · Fluxo** (plano da Criação §6, fase F4 = só o núcleo, sem tela; `drizzle/0031_fluxos.sql`,
  `src/lib/criacao/fluxo/**`): cada nó é uma linha de `fluxo_nos` (`nota`, `imagem`, `link`, `roteiro`, `card`,
  `secao`; x/y/w/h/z, `secao_id` do mesmo fluxo, `dados` ≤ 16 KB conferidos por `lerDados`, `rev` subido pelo gatilho
  `fluxo_nos_guarda`), ligações em `fluxo_ligacoes` (de → para, rótulo, `rev`); apagar = lápide (`apagado_em`) e a
  limpeza (`maestro.fluxo_limpar`) tira de vez depois de 7 dias. Gravação por `aplicarOps` (lista conferida por
  `lerOps`, até 500 por pedido, numa transação): `rev` velho = `conflito` só naquele item; sem `rev` (mover) o último
  leva; erro de regra desfaz tudo. Poll de 5 s em `fluxoDesde` (índice por `updated_at`, lápides inclusive).
  Referência guarda só o id (`roteiro_id`/`card_id`, chave composta): título e estado vêm de `resolverReferencias` com
  o RLS de quem vê; fora do alcance = "sem acesso", nunca o título; criar referência ao que não se vê é barrado no
  gatilho. Imagens (decisão do titular: no banco, WebP, cota por produtora): `prepararImagem` (bytes conferidos como no
  logo, sharp, ≤ 2048 px e 400 KB, miniatura ≤ 40 KB, sem metadados) → `fluxo_imagens` (sha256 por check; cota em
  `maestro.fluxo_cota`, 200 MB por produtora e 300 por fluxo, igual a `cota.ts`, conferida no insert com trava);
  `maestro_app` não lê os bytes pela tabela, só pela porta `maestro.fluxo_imagem(id, sha, mini)`; rota
  `GET /api/criacao/img/<id>/<sha>` com sessão (cache privado). Link colado: `endereco.ts` puro (YouTube, Vimeo, Drive
  pelo endereço; nunca busca a página). "Copiar para IA": `exportar.ts` (Markdown e `maestro.fluxo/1`; imagem só leva
  endereço com o link da F6). Rotas em `src/lib/criacao/fluxo/rota.ts` (`/api/criacao/fluxo`, `/api/criacao/img`).
- **Criação · Fluxo, a tela** (fase F5; `src/components/criacao/fluxo/**`, `src/app/fluxo.css`, rotas
  `/app/criacao/fluxos` e `/app/criacao/fluxos/[id]`): canvas feito à mão (DOM + SVG; tldraw não). O que acontece a cada
  quadro (andar, zoom, arrastar, redimensionar, puxar ligação, laço) mexe só no estilo (`canvas.tsx`); o React recebe ao
  soltar. Contas puras em `geometria.ts`, colar em `colar.ts` (referência do Maestro → link → notas), estado otimista
  em `ops.ts` + `estado.ts` (fila juntada, `rev` só em mudança de conteúdo, conflito por item fica com a versão do
  banco, recusa do pedido inteiro recarrega, poll de 5 s que não passa por cima do que está na fila ou em edição, nem
  mexe na vista). Desfazer guarda volta e refazer (criar desfaz com lápide e refaz com restaurar). Apagar seção leva o
  que mora nela; apagar nó leva as ligações. A vista fica por aparelho em `localStorage`. No celular (≤ 900 px) o topo
  do shell some e a barra de abas fica; segurar 280 ms ergue o nó. Nó usa `scale` na entrada (o `transform` é do
  arrastar) e nada de `overflow: hidden` no próprio nó (a alça e a bolinha saem da borda). Testes:
  `tests/fluxo-tela.test.mts`, `e2e/criacao-fluxo.spec.ts`, telas no `sem-corte.spec.ts`.
- **Criação · Fluxo, exportar e compartilhar** (fase F6; decisão do titular: privado por padrão; `drizzle/0032_fluxo_links.sql`,
  `src/lib/criacao/fluxo/{compartilhar,link,link-rota,pacote}.ts`, `src/lib/zip.ts`, tela em
  `components/criacao/fluxo/{exportar,imprimir}.tsx` + `fluxo-exportar.css`): menu **Exportar** (popover no computador,
  `Folha` no iPhone). Copiar para IA, JSON e PDF saem no navegador do estado da tela; o pacote .zip
  (`GET /api/criacao/fluxo/pacote`, quem vê o fluxo) é montado no servidor e enviado aos pedaços, com as imagens pela
  porta `fluxo_imagem` e o Markdown apontando para `imagens/NN-legenda.webp`. **Links** (`/api/criacao/fluxo/links`,
  só admin e gestão, `podeEnviarCriacao`): `maestro.fluxo_links` guarda só o sha256 e a cópia cifrada (`selar`) do
  token, PIN scrypt (`hashPin`), 1 a 30 dias (7 padrão), até 10 vivos, revogar para sempre (gatilho), visitas; criar e
  revogar caem no `audit_log` pelo gatilho; `maestro_app` não lê `token_hash`/`pin_hash`/`refs_*` e só muda
  `revogado_em`. `/f/<token>` (página, a Lista com `publico`), `/f/<token>.md|.json` (reescrita `beforeFiles` para
  `/f/<token>/fluxo.md|json`), `/f/<token>/i/<id>/<sha>.webp` e `POST /f/<token>/pin`: porta estreita
  `maestro.fluxo_link_{pin,abrir,imagem}` como `maestro_app` sem organização (`comoLink`), limites `REGRAS.fluxo*`,
  prova do PIN num cookie assinado preso ao hash do token (`Path=/f`, ≤ 12 h e ≤ validade). Morto, vencido, revogado
  ou fluxo na lixeira = a mesma tela neutra. Referência no link: só o título (`RefTitulo`, estado `titulo`) e só do
  que quem criou alcançava ao criar (`refs_roteiros`/`refs_cards`); id interno nunca sai. Imagem para a IA só por
  link vivo **sem PIN** e só com "Imagens pelo link" marcado (`linkParaIa`). CSP, `X-Robots-Tag` e `no-referrer` de
  `/f` em `next.config.ts`; `/f/` fora do `robots.txt`; `DO_CLIENTE` do app de computador inclui `f`. "Mandar para um
  card" = `ligar` (`ligarCard` em `estado.ts`); o fluxo aparece no bloco "Criação" da ficha (`components/criacao/do-card.tsx`).
  Papéis do Fluxo pelas mesmas `permissoes.ts` do Roteiro (capacidade `criacao`); o `fluxo.test.mts` confere as
  políticas da 0031/0032 contra `PAPEIS_EDITAR_CRIACAO`/`PAPEIS_ENVIAR_CRIACAO`.
  Testes: `tests/links-fluxo.test.mts`, `e2e/criacao-exportar.spec.ts` (`SHOTS_DIR` guarda `exp-*`), telas no
  `sem-corte.spec.ts`.
- **Criação · o cliente aprova o roteiro** (fase F7; decisão do titular nº 4: o MESMO link `/a` do card, o roteiro é
  mais uma peça; `drizzle/0033_roteiro_na_revisao.sql`, `src/lib/criacao/roteiro/cliente.ts`, `src/lib/revisao/roteiro.ts`,
  telas em `components/criacao/roteiro/cliente.tsx` e `components/revisao/roteiro-cliente.tsx`): a fonte de versão
  `roteiro` presa a `roteiro_versao_id` e **sem URL** (check `versoes_roteiro_ok`; uma vez por card, índice
  `versoes_roteiro_uq`); nasce só por `maestro.roteiro_para_cliente(roteiro, n)` (`pode_criacao(…, 'enviar')`, alcance do
  roteiro, sobe a volta dos lotes abertos, estado `com_cliente`, audita `versao.criar` + `roteiro.enviado` destino
  `cliente`; a rota recusa anotar `cliente` à mão). `enviarAoCliente` (op `cliente` em `/api/criacao/roteiros/[id]`)
  numa transação: sem lote aberto cria o do cliente do card (ou o escolhido), sem link gera (30 dias), devolve o token.
  O gatilho `approvals_roteiro` leva a decisão do cliente ao roteiro (`aprovado`/`ajuste`) e audita `roteiro.decisao`.
  No `/a`, `link_abrir` traz o `conteudo` congelado e `paraTela` troca por `roteiroDoCliente` (vista Literário, sem
  nota, plano, observação, dica, ids de pessoa nem `((…))`) antes de ir à tela; `comentarios.bloco_id` só em versão de
  roteiro e só em bloco que o cliente vê (`maestro.roteiro_bloco_do_cliente`: fala, ação, lettering, áudio), sem tempo
  nem pino. O player nunca recebe versão de roteiro (o lote da equipe mostra "Abrir no editor"; a ficha do card abre o
  editor). Editor: `?cliente=1` (comentários por bloco e versão + decisões, poll 20 s), `op: "resolver"` (quem edita).
  Testes: `tests/roteiro-cliente.test.mts`, `e2e/criacao-cliente.spec.ts` (`SHOTS_DIR` guarda `f7-*`).
- **Criação · apagar** (titular, 30/10/2026; `components/criacao/lixeira.tsx` + `deslizar.ts`, puro em
  `lib/criacao/lixeira.ts`, CSS `app/lixeira.css`, prefixo `lx-`): as duas listas usam `ListaLixeira` +
  `CartaoApagavel` (só com `podeEditarCriacao`). iPhone: deslizar para a esquerda (só `transform`, `touch-action: pan-y`;
  55% da largura apaga direto) e segurar 450 ms (folha com Abrir/Apagar); computador: "•••" no hover/foco e botão
  direito (menu no `<body>`). Apagar = lixeira, sem pergunta, com "Apagado · Desfazer" (6 s) e a linha de
  `avisoAoApagar` (card ligado, link vivo do fluxo: `linksVivos` em `listarFluxos`). O clique depois do gesto é engolido
  na captura da **janela** (antes do `movimento.tsx`). Editor e canvas voltam para `?apagou=<id>` (a lista abre com o
  Desfazer). Lixeira em `?lixeira=1` nas duas rotas (`CartaoNaLixeira`: Restaurar; "Apagar de vez" com pergunta só
  `podeApagarDeVezCriacao`; roteiro com versão salva não sai, `tem_versao`). Roteiro: `POST {op:"apagar_de_vez"}` →
  `apagarRoteiroDeVez` (auditoria `roteiro.apagou`). Testes: `tests/lixeira.test.mts`, `e2e/criacao-apagar.spec.ts`
  (iPhone Chromium + Safari, `SHOTS_DIR`/`APAGAR_TEMA`/`APAGAR_VIDEO`), telas no `sem-corte.spec.ts`.
- **App na Tela de Início (PWA)**: `src/app/manifest.ts` (`/manifest.webmanifest`: Maestro, `start_url` `/app`, `scope`
  `/`, standalone, cores do claro), ícones em `public/pwa/` gerados do `src/app/icon.svg` por `scripts/icones-pwa.mjs`
  (nunca desenhar outro), `apple-icon.png` (180 px), `appleWebApp` + `apple-mobile-web-app-capable` no layout, barra de
  status `default` (sem `viewport-fit=cover`: nada por baixo da barra) e `theme-color` pelo tema do cookie
  (`generateViewport`). "No celular, como app." (`components/instalar.tsx`, `lancamento.css`) em Ajustes e na página
  inicial lançada: Safari › Compartilhar › Adicionar à Tela de Início; "Instalar" só com `beforeinstallprompt`; some
  aberto como app. `e2e/instalar.spec.ts`: manifesto, metas, a dica e o app aberto como instalado sem corte a 375/393 px.
- **Página inicial** (`src/app/page.tsx`, `inicio.css`, plano v2 §10, ADR 0024): pública, só o que existe, "Em breve"
  para o resto, capturas reais da demonstração em `public/produto/*-{claro,escuro}.webp` (refazer com
  `npm run db:seed:demo` quando a tela mudar; nunca mock). "Quero acesso" grava na lista de espera
  (`drizzle/0004`, `src/lib/lista-espera.ts`): `maestro_app` não tem privilégio na tabela, só a função
  `maestro.lista_espera_entrar()`; armadilha, 5/h por IP e consentimento obrigatório. A lista não libera ninguém.
- **App de computador** (`desktop/`, Mac e Windows; [README](desktop/README.md)): Electron com pacote próprio (fora
  do `package.json` do site; ignorado no lint, Prettier, tsconfig, `maestro.yml` e `.vercelignore` daqui; lint pela
  raiz, como o `apps/hub-desktop`). Abre `/app` numa `WebContentsView` (partição `persist:maestro`, sandbox, sem Node);
  na janela só o Maestro, as telas de entrar da Absolute ZRO e `accounts.google.com` (`desktop/regras.cjs`); `/a`,
  `/o`, `/p`, o resto do HUB e outros sites vão para o navegador. Login = o fluxo normal do site, os cookies ficam
  (Max-Age). Motor do "Atualizar", memória da janela e a "Sem conexão" são **cópias idênticas** do hub-desktop
  (`npm run compartilhado`; o teste confere). Ícone = `src/app/icon.svg` (`npm run icones`). Aviso "Nova versão" e
  download passam pela Absolute ZRO (`/baixar/app/maestro/{versao.json,mac,windows,<arquivo>}`, gate do canal
  `download`; `APPS_DESKTOP` em `apps/hub-web/lib/desktop-apps.ts`, `DOWNLOADS` em `lib/downloads.ts`): fechado, só
  a lista de acesso vê. Release de teste `maestro-versao-de-teste` pelo `.github/workflows/maestro-desktop.yml` a
  cada push na main que mexe em `desktop/`. Sem assinatura da Apple/Microsoft por enquanto. Rota nova que deve abrir
  no navegador (página do cliente): ponha em `DO_CLIENTE` de `regras.cjs` e no teste.
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
do orçamento (`orcamento.test.mts`), deslocamento, lugar entendido, preço pelo lugar, veículos e a planilha da ANP (`deslocamento.test.mts`), lugares e km
com Photon/OSRM falsos (`rota.test.mts`), combustível automático com a ANP falsa, agendamento,
fallbacks e só leitura (`combustivel.test.mts`), financeiro com baixas, recorrência e
escala (`financeiro.test.mts`), freelas, pagamento cifrado, reservas sem conflito e documentos (`operacao.test.mts`),
duas organizações em toda tabela da produtora (`produtora-rls.test.mts`), logo, cor e marca com duas organizações
(`marca.test.mts`), pedido público, link e aceite idempotente (`pedidos.test.mts`), contagens do Hoje (`hoje.test.mts`),
kit do freela, aluguel na escala e sincronização desligada (`freela-equipamentos.test.mts`), funil e retornos
(`funil.test.mts`), números (`numeros.test.mts`), importar planilha (`importar.test.mts`), agenda .ics
(`agenda-ics.test.mts`), acesso por cliente em toda tabela ligada a cliente (`acesso-cliente.test.mts`), as tabelas
novas com duas organizações (`negocio-rls.test.mts`) e o resumo para a Z (`resumo-z.test.mts`), o contrato (preenchimento, versões, aceite com hash, imutável;
`contrato.test.mts`), a marca própria (sinal ligado e desligado, contraste, duas organizações; `marca-propria.test.mts`), a ponte do Drive, Arquivos, compartilhar/recolher e o agendamento
(`drive-sobedesce.test.mts`), a versão colada na ficha do card (`versoes-card.test.mts`), pessoas da Absolute ZRO (`pessoas-zro.test.mts`), colunas do Quadro (fábrica e backfill, duas organizações, papéis,
automação pelo papel, arquivar com destino, paleta; `colunas.test.mts`), o roteiro puro (modelo, tempo, cada vista, TPeasy
contra o código do próprio app, modelos só com dica, documento antigo, junção; `roteiro.test.mts`), roteiros no banco
(duas organizações, papéis, rev, versões imutáveis; `criacao-rls.test.mts`), as operações do editor e o comparar
(`roteiro-editor.test.mts`), a rota do editor (Origin, papéis, poll, 409 com o atual e a junção, versões, restaurar;
`criacao-rota.test.mts`; também o envio anotado e o AEON pelo gate), as saídas (`maestro.roteiro/1` contra o schema
publicado com o conferidor `tests/esquema-json.mts`, TPeasy pelo código do próprio app, AEON escondido;
`roteiro-saidas.test.mts`), o roteiro com o cliente (vista sem nada interno, mandar, `/a` por bloco, ajuste, versão nova, rotas públicas, limite, duas organizações e acesso por cliente; `roteiro-cliente.test.mts`), o fluxo puro (link, operações, exportação, cota, imagem; `fluxo.test.mts`), fluxos no banco
(duas organizações, papéis, rev por nó, o que mudou, referências "sem acesso", porta da imagem, cota, limpeza;
`fluxo-rls.test.mts`) e as rotas do fluxo e da imagem (`fluxo-rota.test.mts`), o link e a exportação do Fluxo
(`links-fluxo.test.mts`), o migrador com migração atrasada
(`migrador.test.mts`) e o lançamento (app de computador só com instalador publicado, manifesto e a chave da vitrine;
`lancamento.test.mts`), quem vê o quê (padrão igual no TS e no banco, cada área por pessoa, máscaras, gatilhos, só a
administração muda e audita, sessão, navegação e a Z; `acessos.test.mts`). E2E: `npm run build && npm run test:e2e`
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
quadro a quadro) e os gestos do Quadro no celular (`gestos.spec.ts`, Chromium e WebKit, organização própria) e arrastar
com o mouse (`arrastar.spec.ts`, Chromium e o projeto `computador-safari`: relógio por quadro, zero render/DOM/layout
com o mouse andando, card sempre inteiro ao soltar; `E2E_DB_SUFIXO` separa o banco, `E2E_VIDEO=1` grava) e as colunas
(`colunas.spec.ts`: renomear no lugar, reordenar, criar e recolorir, arquivar com destino e restaurar, sistema não
arquiva, equipe não edita; computador e iPhone, organização própria), quem vê o quê (`acessos.spec.ts`: o editor sem
dinheiro na navegação, no Hoje, nas fichas e no HTML; a administração liga o Financeiro e volta ao padrão; `SHOTS_DIR`
guarda `pessoas-acesso-*`) e a Criação (`criacao-roteiro.spec.ts`: novo pelo
modelo → teclado → vistas → grava sozinho → recarregar, versão e comparar, folha A4, junção com outra pessoa, documento
antigo no editor novo, leitura; no iPhone uma cena por vez, "+", segurar para arrastar e o Teleprompter; e
`criacao-enviar.spec.ts`: salvar a versão antes de enviar, o `.txt` e o backup do TPeasy iguais ao que o modelo gera,
PDF para a edição, auditoria, AEON escondido e aparecendo com o gate aberto, o bloco do card, leitura sem Enviar;
`SHOTS_DIR` guarda as capturas). Bancos por cópia do repositório: `TEST_DB_SUFIXO` (testes) e `E2E_DB_SUFIXO` (e2e).
O navegador do e2e usa um proxy que não existe (`playwright.config.ts`): nada sai para a internet (o `<zro-set>` de
absolutezro.com falha na hora em vez de segurar o "networkidle"); serviço de fora só com `route`.
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
real (sem o arrastar nativo do HTML: os cards não são `draggable`), os outros abrem espaço, a página rola perto das
bordas, segurar na borda da tela (0,42 s) passa de coluna, soltar na pílula manda para aquela coluna, soltar acima do
Quadro desiste; grava pelo mesmo `moverPara` (aviso com Desfazer) e o FLIP é "fixado" antes (`useFlip` devolve
`fixar`). **No computador** o card arrasta com o mouse pelo mesmo modelo (`src/components/quadro/arrastar.ts`;
titular, 29/10/2026, "a animação dá uma travadinha"): 5 px viram arrasto, a coluna sob o mouse abre espaço, a de
origem fecha o buraco, Esc/soltar fora/perder a janela devolvem, Entregue (`ordemPorChegada`) recebe no topo. Regras do
movimento do Quadro: nada de estado do React nem leitura de layout por quadro (mede tudo ao erguer; rolagem guardada
pelos eventos), só `transform`/`translate`; o fantasma (`fantasma.ts`) vai no `<body>` com as variáveis do card (no
`.shell` o 1º quadro refazia a página); nada de classe no `<html>` durante o gesto; o FLIP mede pelo `.q-lugar` e não
repete a entrada (`q-assenta`) de quem só trocou de coluna; `.q-col` não corta (o card passa por cima com `z-index`).
Links da cápsula pré-buscam com a intenção; a barra do celular pré-busca inteira; `staleTimes` em
`next.config.ts` (o Quadro chama `renovarSecoes` depois de gravar). Nada de `transform` que fique preso num ancestral
de `position: fixed`. Unitário da hora em
`hora.test.mts`.
