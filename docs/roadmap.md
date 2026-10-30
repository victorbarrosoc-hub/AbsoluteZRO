# Roadmap — o que foi entregue e o que falta

Atualizado em 30/10/2026. Legenda: ✅ entregue · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado por decisão/acesso.

## Fase 0 — Auditoria

- ✅ Inventário das cinco origens com commit, licença, stack, serviços e riscos ([source-inventory](architecture/source-inventory.md)).
- ✅ Estratégia por produto e ADRs ([decisions](decisions)).
- ✅ Prova de originais intocados (`scripts/check-originals.mjs`).
- ✅ Arte oficial da marca (fornecida pelo titular).
- ✅ Deploy autorizado (Vercel `absolutezro` + Supabase `AbsoluteZRO`) no ar em absolutezro.vercel.app.

## Fase 1 — Fundação

- ✅ Monorepo, CI (lint, formatação, tipos, testes com Postgres, build, E2E, varredura de segredos), Dependabot.
- ✅ Design system com a IDV oficial; landing, planos e telas essenciais do PRD §10; mobile sem rolagem horizontal.
- ✅ Redesign na linguagem das ferramentas da família (preto fosco, suíte com grade de apps, cápsula de vidro, demos em CSS com motion pausável), tema claro completo e seletor claro/escuro em todas as telas — [ADR 0011](decisions/0011-linguagem-da-familia.md).
- ✅ Downloads no estilo de central de apps (`/baixar` público e `/downloads` no HUB): instaladores oficiais de SOBEDESCE, Synquei e NOSSOM (Mac e Windows), TPeasy no iPhone, Carro do Freela no navegador; destaque do sistema de quem visita e instalação sem aviso pelo Terminal. Com os repositórios privados, todo instalador passa pela rota `/baixar` do site do app (endereço assinado do GitHub), nunca pelo `github.com` direto.
- ✅ Padrão Apple em todo o site e no HUB (25/10/2026): claro por padrão, títulos em Figtree (fino × pesado), botões e selos em Liquid Glass (`.zro-btn`, `.zro-pill`), nada de texto ou botão azul, eyebrow e apoio em cinza. Página inicial com telas reais de cada app em MacBook + iPhone (`public/brand/produto-<app>-*.webp`, `scripts/marca/aparelhos/produtos.py`), fechamento sóbrio, planos, downloads, entrar/criar conta e o HUB (sidebar leve, palco claro no Início) no mesmo padrão.
- ✅ Marca no compartilhamento e nos ícones: OG/Twitter 1200×630, ícone do iPhone/Safari (Adicionar à Tela de Início), manifest para instalar como app, favicon e ícones de Mac e Windows, tudo a partir do símbolo oficial (arte em `scripts/marca`).
- ✅ Marca flat (26/10/2026, aprovada pelo titular, [ADR 0017](decisions/0017-marca-flat-centelha.md)): o O vira anel com
  a centelha de 4 pontas por trás do traço, uma cor só, em SVG (`ZroWordmark`/`ZroSymbol` em `@zro/ui`). Aplicada no
  site, HUB, login único, ícones (navegador, iPhone, manifest, Mac, Windows), OG, app de computador, NOSSOM e
  SOBEDESCE. Em animação a estrela aparece inteira e recolhe até a forma flat. Manual e branding (Higgsfield) em
  [docs/marca](marca/README.md). O feixe de luz saiu.
- ✅ Fluidez entre abas no padrão do Synquei (29/10/2026): HUB, site e Maestro com pré-busca por intenção, cache curto
  do roteador, View Transitions (frente/volta pela ordem do menu) e a pílula do menu que desliza; troca de aba de
  ~330 ms para ~90 ms (medição em [validation](validation.md)). Maestro com folhas novas (véu na janela inteira, folha
  de baixo no celular), "Novo card" redesenhado, Quadro com FLIP e avisos com Desfazer. SOBEDESCE com a tela entrando
  do lado da navegação.
- ✅ Troca de aba limpa no iPhone e gestos do Quadro (29/10/2026, vídeo do titular): no Safari a tela velha e a nova
  apareciam juntas; a View Transition agora é da casa (a velha sai em 110 ms, a nova entra depois) no Maestro e no HUB.
  No Quadro do celular: deslizar de lado troca de coluna (segue o dedo, mola, pílula que anda junto) e o card se arrasta
  segurando 280 ms (fantasma do tamanho real, passa de coluna na borda ou soltando na pílula). No Maestro a Z saiu da
  primeira aba (ícone discreto) e `/app` abre no Hoje. Falta: conferir num iPhone de verdade depois de publicar.
- ✅ Início sem piscar cinza (29/10/2026, vídeo do titular no Mac): ao recarregar, o esqueleto genérico aparecia ~200 ms
  e o conteúdo "pulava" por cima. Agora o topo (saudação, palco, atalhos) chega primeiro e os painéis vêm em streaming;
  todo esqueleto da área logada tem a forma da tela real e só aparece depois de 320 ms; quando aparece, o conteúdo
  dissolve por cima; com "reduzir movimento", troca seca. Falta: conferir no Safari do titular depois de publicar.
- ✅ Página inicial no iPhone (29/10/2026, relato do titular): a cápsula do topo fica por cima de tudo, com faixa da cor
  da página atrás da barra de status; grade de ícones como a Tela de Início, com "Em breve" curto e alinhado; Maestro e
  Relay como "Em breve" pelo gate (o Relay aparece sozinho com a 0031). Falta: conferir num iPhone de verdade e regerar
  a foto do app para computador quando o Relay entrar.
- ✅ Página inicial de cinema (26/10/2026): paisagem com o símbolo esculpido sobre a rocha, faixa discreta das 7 ferramentas e cartão do Ciclo do O; sem selos de "em construção".
- ✅ AEON (26/10/2026): a plataforma de edição ganha nome e ícone no catálogo, na home e no HUB (migration 0012); segue em desenvolvimento.
- ✅ Página inicial com o símbolo como protagonista (26/10/2026): o anel se desenha a partir da centelha, a estrela
  recolhe até a forma flat, um brilho corre no traço e o símbolo inclina com o ponteiro; o título entra palavra a
  palavra. Na rolagem, as ferramentas entram em órbita em volta do O ("Um só ecossistema."), todas acesas. Tudo em
  CSS (scroll-driven com `@supports`), sem estado por quadro no React, parado com "reduzir movimento".
- ✅ Login único: o HUB é provedor OpenID Connect (código + PKCE, refresh com rotação, permissão por app, Apps com acesso no Perfil, cadastro de apps no console) — [ADR 0012](decisions/0012-login-unico-oidc.md).
- ✅ Conta única: "Criar conta" nos apps cria a conta na Absolute ZRO (`prompt=create`), conta por app no Perfil e no admin, plano grátis com as ferramentas liberadas na organização nova e "Entrar com o Google" mesclando com a conta (migrations 0006–0008, [ADR 0014](decisions/0014-conta-unica-e-acesso.md)). ⛔ Botão do Google depende do cliente OAuth do titular.
- ✅ Painel de pessoas no console (`/admin/pessoas`): números, gráfico de 30 dias (cadastros e entradas em apps), funil, contas por app, lista com busca/filtros/ordem, troca de plano por organização (`changeOrgPlan`; Stripe só pelo provedor), página da pessoa com linha do tempo, suspender/reativar (encerra sessões e refresh tokens; admin protegido) e CSV auditado. Suporte vê, só admin muda.
- ✅ Console redesenhado no Padrão Apple (28/10/2026): barra lateral (pílulas no celular) com Visão geral, Pessoas,
  Planos, Lançamento e Apps. Visão geral com **online agora** em tempo real (rota `/admin/online`, a cada 15 s; online =
  sessão do HUB usada ou token de app renovado nos últimos 15 min), números, cadastros e créditos de IA em 30 dias,
  ecossistema × avulso × grátis × sem plano, pessoas por plano e por app. Pessoas: todas as contas em páginas de 50,
  abas por segmento, filtro por app com os ícones, foto com ponto de online, último acesso relativo e arquivos/GB
  catalogados no HUB. Ficha, planos, lançamento e apps em cartões e seções que recolhem; ações com confirmação e motivo;
  ids técnicos só em "Detalhes técnicos". Envios feitos só dentro de cada app (banco do app) ainda não chegam ao HUB.
- ✅ "Entrar com Absolute ZRO" nas cinco plataformas (SOBEDESCE, NOSSOM, Synquei, TPeasy, Carro do Freela). Apps da família entram direto, sem a tela Permitir, e o Abrir do HUB já chega logado (`products.sso_start_url`, migration 0005).
- ✅ Carro do Freela com conta única: "Criar conta" cria a conta Absolute ZRO (`prompt=create`), o app não cria conta própria, e a área logada respeita `carro-do-freela` em `zro_products` (lista de convite segue aberta).
- ✅ Synquei: conta pela Absolute ZRO ("Criar conta" com `prompt=create`) e aviso "ainda não tem acesso" quando `synquei` não está em `zro_products`; app, site e download continuam abertos.
- ✅ SOBEDESCE: conta nova só pela Absolute ZRO (`prompt=create`), Google vira só porta das contas antigas e conexão do Drive, e o acesso segue `zro_products` (sem `sobedesce` = funções bloqueadas com aviso).
- ✅ Um repositório para tudo ([ADR 0013](decisions/0013-monorepo-como-fonte.md)): as cinco plataformas moram em `products/<app>` e publicam nos próprios projetos Vercel a partir daqui (Root Directory por pasta, build só quando a pasta muda). CI e releases de desktop na raiz, com tag por app e o release antigo como reserva.
- ✅ Um Supabase para tudo: SOBEDESCE (schema `sobedesce`, papel `sobedesce_app`, cópia do Neon conferida tabela a tabela) e NOSSOM (`nossom_private` + Auth) migrados e conferidos. Bancos antigos intactos como reserva.
- ✅ TPeasy com conta única: "Criar conta" abre o cadastro da Absolute ZRO (`prompt=create`), o código por e-mail do Supabase vale só para contas antigas e o Google saiu do app; sem `tpeasy` em `zro_products`, a conta mostra "ainda não tem acesso" (o teleprompter continua aberto).
- ✅ Perfil único no Synquei e no TPeasy (27/10/2026): foto e nome da conta Absolute ZRO, relidos a cada abertura em `/oauth/userinfo` (refresh token cifrado só em `/api/zro`), e **Editar na conta Absolute ZRO** no lugar de editar nome no app. ⬜ Validar contra o HUB de verdade depois do deploy.
- ✅ Synquei de computador com a conta Absolute ZRO (27/10/2026): a mesma tela do site (entrar, foto e nome na barra e em Ajustes, editar na conta, sair) com o cliente público `synquei-desktop` (navegador do sistema + 127.0.0.1, PKCE). ⬜ Validar num Mac/Windows de verdade contra o absolutezro.com.
- ✅ Entrar e criar conta como conversa (27/10/2026): uma pergunta por vez (e-mail → senha; e-mail → nome → senha), o símbolo da marca como orbe (Absolute ZRO · ouvindo · conferindo · pronto, com ✓ em traço fino) e "Conectado. Abrindo seu HUB…"; vale para `/entrar`, `/criar-conta` e `/app/entrar`, funciona sem JavaScript. ✅ O orbe é o Z animado (27/10/2026).
- 🟡 IA do ecossistema, o Z (27/10/2026): uma IA para todas as plataformas, conversas por plataforma reunidas no HUB, 1 crédito por resposta, `<zro-ia>` para as plataformas e o visual aprovado (anel e estrela cromados movidos por código, rastro e correntes). Falta: migrações 0016/0017 em produção, publicar, testar com a chave real e colocar o `<zro-ia>` em cada plataforma.
- ✅ Balões de pendência no Synquei (web e computador), TPeasy e Carro do Freela (27/10/2026): a aba com algo esperando a pessoa mostra o número (99+ acima de 99, `aria-label` "N pendências", o que espera no `title`), ao vivo, e vira ponto no canto do ícone no menu recolhido e na barra do celular. Só conta o que a tela já pede (religar mídia, sincronizar, clipe para conferir, cartão esperando, versão nova; conta sem acesso; proposta, contrato a assinar, entrega a conferir, avaliação, pedido de aluguel).
- 🟡 O Z nas páginas iniciais das sete plataformas (27/10/2026): seção curta com o anel e a estrela, "Chegando ao <app>", uma linha do que ele vai fazer ali e **Conhecer o Z** (absolutezro.com/ia). ⬜ O painel do Z dentro de cada plataforma (até lá a seção não diz que já funciona).
- ✅ A Z no painel inicial do Synquei (site, celular e computador) e do TPeasy (27/10/2026): `<zro-ia>` no topo do Início/Roteiros, com o repasse `/api/zro/ia` de cada app (token só no servidor ou no processo do Electron), `zro.ia` no login e "Entrar de novo" para logins de antes da Z. Homes dizem "Já no <app>". ⬜ Conferir com conta real no absolutezro.com e confirmar no console que `synquei-desktop` tem `product_id = synquei` e o escopo `zro.ia`.
- 🟡 Revela Lab (29/10/2026): criar o próprio look sobre bases da Revela, película e clássicos, com Analisar e corrigir, ajustes simples, LUT 33/65, receita `.revela` e Meus looks. Falta: abrir a LUT num Resolve real; a Z montando o look por texto; looks na conta (HUB); loja de looks (ver proposta).
- 🟡 Revela, motor de cor profissional (29/10/2026): look na luz da cena (LMT DaVinci Wide Gamut/Intermediate e ACEScct), tela separada no desenho do ACES 2.0 (SDR e HDR PQ), película por densidade, controle de qualidade com limites (os 20 looks passam), pacote profissional (.cube 65, CLF, CDL, LUT de monitor, LEIA-ME) e cópias de cinema 2383, 2393 e 3513 das fichas técnicas, revisadas em footage oficial da ARRI. Falta: validar num Resolve real, em OCIO e em monitor HDR; material log real da Sony, Blackmagic, Panasonic e Canon; comparar as cópias com uma cópia projetada; levar a tela de LUT e os Meus looks para o motor novo; halation e grão como etapa à parte (DCTL); a Z montando o look por texto.
- ✅ A Z sabe o que cada plataforma faz e só olha o Drive quando a pessoa pede (28/10/2026): guia em `apps/hub-web/lib/ia/plataformas.ts` no texto de sistema; pergunta de "como faço" vai para o recurso da plataforma atual (na Revela: Clonar LUT, Meus looks…), não para uma busca no Drive.
- ✅ A Z numa aba só dela no Synquei e no TPeasy (27/10/2026): primeira aba e tela de entrada (site, celular e computador); Início e Roteiros voltaram a ser como antes.
- 🟡 A Z no Início do NOSSOM (27/10/2026): `<zro-ia>` no topo de `/studio` (site, celular/PWA e app de computador), repasse `/api/zro/ia` com o token `zro.ia` guardado só no servidor, "Conectar com Absolute ZRO" sem token, home "Já no NOSSOM". Falta: publicar e conferir com uma conta real (o login antigo precisa conectar uma vez).
- 🟡 NOSSOM: a Z em aba própria (`/studio/z`, primeira da navegação e entrada de `/studio`, tela toda); o Início voltou ao de antes (27/10/2026). Falta: publicar.
- 🟡 NOSSOM no padrão de conta da Absolute ZRO (28/10/2026): o menu da conta (site, celular/PWA e app de computador) mostra a foto da conta Absolute ZRO (claim `picture`), nome, e-mail · organização, o selo "Conta Absolute ZRO" e "Editar na conta Absolute ZRO" (claim `zro_conta`, padrão absolutezro.com/perfil), como AEON, Revela, Synquei e TPeasy; sem vínculo, "Ligar conta Absolute ZRO". O selo ADM só diz "Ilimitado" quando o saldo do servidor diz. Falta: publicar e conferir com uma conta real.
- 🟡 NOSSOM fechado ao público (Etapa B, 28/10/2026): só a página "Em desenvolvimento"; estúdio, APIs, jobs, downloads, instalador, login com senha e Stripe negados; entra só a conta `allowed` na claim `zro_release` do HUB (`temAcesso()`, `RELEASE=closed` por padrão). Falta: o HUB emitir a claim, a migração `202610280001_zro_release.sql` em produção e publicar.
- 🟡 A Z no painel inicial do AEON e da Revela (27/10/2026): `<zro-ia>` como primeira tela do app (AEON: aba Z no dock, site, celular e app de computador; Revela: `inicio.html`, aba Z, `start_url` do app instalado), repasse `/api/zro/ia/*` com o token da sessão (o token não chega à página), `zro.ia` no login (web e desktop, com volta sem o escopo se o cliente recusar) e a seção da home como "Agora no AEON/na Revela". Falta: publicar, conferir em produção com conta real e se `aeon-web`/`aeon-desktop` têm `product_id` (sem ele não recebem `zro.ia` pela 0016).
- 🟡 A Z como painel inicial do SOBEDESCE e do Carro do Freela (27/10/2026): `<zro-ia>` no topo da conta (site), do Início do app do celular e do app de computador do SOBEDESCE, e no topo do Feed do Carro; o token `zro.ia` fica no servidor de cada app (repasse `/api/zro/ia/*`, NDJSON em streaming; no computador, pelo motor com o Bearer do dispositivo). A home dos dois diz "Agora no <app>". Falta: migração 0016 em produção, a migração 0014 do SOBEDESCE (`contas_zro.ia`) no deploy, publicar e conferir com conta real.
- 🟡 A Z com aba própria no SOBEDESCE e no Carro do Freela (27/10/2026): primeira aba e tela de entrada no site (`/z`, ao lado de Conta), no app do celular (sempre, com ou sem Drive), no app de computador e no Carro (primeiro item da lateral; no celular, botão em destaque à esquerda do topo, porque a barra 3 + Menu + 3 não comporta um oitavo item). Conta, Início e Feed voltaram a ser como eram. Falta: publicar e conferir com conta real.
- 🟡 A Z no Google Drive da pessoa (27/10/2026): busca por nome ou conteúdo, lista uma pasta na ordem pedida (o primeiro que entrou), mostra tamanho, resolução e os links de abrir e baixar, acha a versão pronta (ex.: MP4 720p) e, só depois do "sim" da pessoa, pede ao computador o mesmo "Baixar como…" do celular. HUB → SOBEDESCE servidor a servidor com JWT curto assinado pela chave do login único ([contrato](integration-contracts/sobedesce-drive.md)). Falta: publicar os dois, conferir com Drive e conta reais e, se o client do SOBEDESCE não for `sobedesce-web`, definir `ZRO_SOBEDESCE_CLIENT_ID` no HUB. Desde 28/10/2026, cada arquivo vem com dois botões pelo SOBEDESCE, Abrir (`/app/#arquivo/<id>`: a aba Drive na pasta dele, com o arquivo na prévia) e Baixar (`/app/#baixar/<id>`: o download do app), e cada pasta só Abrir (`/app/#drive/<id>`); nenhum link do site do Google Drive.
- 🟡 A Z, Fase 1 (28/10/2026, só leitura): ferramenta `ver_transferencias` lê o último relato de cada computador no SOBEDESCE (`POST /api/zro/transferencias`, `transferencias.ler`, mesmo `zro-pedido+jwt`; sem caminho local nem token) e responde citando fonte e hora ("segundo o SOBEDESCE, às 14:02"), fato separado de estimativa, aviso de relato antigo; sem dado diz que não sabe; preparos do Synquei: diz que ainda não tem acesso. `pedir_ao_computador` (piloto da Fase 3, sem ações novas) mostra a ação exata antes do "sim" (o HUB confere que a oferta nomeou o formato), grava em `zro.audit_logs` (`ia.computador.pedido`: resultado e erro, sem nome de arquivo) e diz como cancelar (remover o pedido em `/app/#referencias`). Falta: publicar HUB e sobedesce.com (autorização do titular), conferir com conta real, fonte dos preparos do Synquei (recibo `synquei.preparo/1`).
- 🟡 Entrada dos apps (decisão do titular, 28/10/2026): a Z segue aba própria e a primeira, mas o app abre na tarefa quando há algo em andamento. SOBEDESCE computador: sem rota, cartão na fila → Cartões, transferência andando → Transferências, senão Z (`public/lib/entrada.js`); celular: abre na Z e vai para Início se o retrato mostrar um computador transferindo nos primeiros 8 s (`web/public/app/lib/entrada.js`, SW v67, app 2.8.52); Synquei: cartão na fila do Organizar → Organizar (`app/js/entrada.js`, SW synquei-v23); TPeasy: link com # ou tarefa em curso, senão Z (nenhuma tarefa sobrevive ao fechar; SW tpeasy-v20); Maestro: `/app` abre sempre no Hoje (29/10/2026: no Maestro a Z deixou de ser a primeira aba; ícone discreto). Deep link sempre respeitado; a tela nunca pula depois de aberta. Falta: publicar e distribuir (autorização do titular; nenhum instalador gerado).
- 🟡 Entrada dos apps (decisão do titular, 28/10/2026): a Z segue aba própria e a primeira, mas o app abre na tarefa quando há algo em andamento. SOBEDESCE computador: sem rota, cartão na fila → Cartões, transferência andando → Transferências, senão Z (`public/lib/entrada.js`); celular: abre na Z e vai para Início se o retrato mostrar um computador transferindo nos primeiros 8 s (`web/public/app/lib/entrada.js`, SW v67, app 2.8.52); Synquei: cartão na fila do Organizar → Organizar (`app/js/entrada.js`, SW synquei-v23); TPeasy: link com # ou tarefa em curso, senão Z (nenhuma tarefa sobrevive ao fechar; SW tpeasy-v20); Maestro: `/app` abre no Quadro com card seu em Fazendo/Revisão, senão na Z. Deep link sempre respeitado; a tela nunca pula depois de aberta. Falta: publicar e distribuir (autorização do titular; nenhum instalador gerado).
- ✅ A Z nunca é a primeira tela (regra do titular, 29/10/2026; Plano de Integração §7–8: "a tarefa principal do
  aplicativo vem primeiro"): substitui as entradas de 27 e 28/10. Em todas as plataformas quem entra cai na tarefa e a
  Z é uma entrada discreta, nunca aba principal, nunca aberta sozinha, e nada dela carrega antes do toque; o link direto
  continua valendo. HUB: site em `/inicio` (a IA no fim do grupo Trabalho) e o app (`/app`, computador e iPhone) nos
  apps, Z em `/app/ia` (pé da barra; anel no topo do celular; `/app/apps` redireciona). SOBEDESCE: computador no Início
  ou na tarefa em curso (Z no pé da barra, `#/z`), celular no Início (anel no topo, `/app/#z`, reconectar volta à Z),
  site em `/conta` (anel no cabeçalho, `/z`). Synquei: Início (Z no pé da barra, anel no Início do celular, `#/z`, sem
  ⌘ de número). TPeasy: Roteiros (anel no topo, `#z`). Carro do Freela: Feed/Propostas (Z no fim da lateral, anel
  apagado no topo do celular). NOSSOM: `/studio` no Início (anel no topo, último item da lateral, `/studio/z`). AEON:
  Mídia/Seus universos (ícone na barra, `/app/#z`, ⌘1–⌘4 só o editor). Revela: `/lut` (anel no topo, `/inicio`).
  Maestro já seguia (Hoje); Relay não tem Z. Falta: conferir num iPhone de verdade depois de publicar (autorização do
  titular).
- 🟡 A Z digita as sugestões no campo (pedido do titular, 29/10/2026): os botões de sugestão saíram de todos os lugares
  onde a Z aparece; o campo vazio escreve uma sugestão da plataforma letra a letra (35–55 ms), segura 1,6 s, apaga e
  escreve a próxima. Começa com o campo à vista, pausa com a aba escondida, para no foco ou quando a pessoa escreve e
  volta no blur com o campo vazio. Focado e vazio: Tab ou → completa (nunca envia), Esc dispensa; no celular, tocar na
  sugestão completa. Camada `aria-hidden`, campo "Pergunte à Z" com as sugestões numa descrição fixa; "reduzir
  movimento" mostra uma sugestão inteira que troca a cada 4 s. Um módulo só (`apps/hub-web/public/ia/v1/digitando.js`):
  o `<zro-ia>` importa (SOBEDESCE site, app e `/z`, Synquei, TPeasy, NOSSOM, Carro, AEON, Revela, Maestro) e o HUB usa
  pelo `useDigitando`. `<zro-ia>` com `VERSAO` no `data-versao`, `/ia/v1/*` com `must-revalidate` e setters de
  `sugestoes`/`api` (React 19). AEON copia o módulo novo no `npm run vendor`. Falta: publicar o HUB (as plataformas
  pegam o painel novo de absolutezro.com sem novo deploy) e regerar o `vendor/` do app de computador do AEON.
- ✅ Carro do Freela leve sem perder qualidade (26/10/2026): HTML de 2,6 MB para 241 KB (script, CSS, fontes e imagens em `m/` com hash e cache longo; as seis fases usam o mesmo script), mídia em escada de larguras e codecs (AV1/HEVC/H.264) refeita dos originais do Higgsfield e do Kling, fotos de telas escondidas em `loading="lazy"` e o pôster da home pré-carregado. Celular em 4G: LCP 7,3 → 4,1 s na primeira visita e 5,9 → 1,6 s na segunda. Bateria em paralelo num Chromium só (38 → ~15 min). ⬜ Dividir o script por tela (Etapa 2) fica para projeto próprio: o app liga todas as telas no arranque.
- ⬜ Carro do Freela no Supabase AbsoluteZRO (a lista de convite ainda está no projeto antigo; aguardando acesso).
- ⬜ Arquivar os repositórios antigos (todos conferidos: o `main` de cada um é o commit importado).
- ⬜ Domínio próprio `absolutezro.com` com subdomínio por app e sessão compartilhada (aguardando a compra).
- ✅ App Absolute ZRO para computador, primeira etapa (`apps/hub-desktop`, 25/10/2026): o HUB numa janela própria no Mac (.dmg universal) e no Windows (.exe com escolha de pasta), tema claro, tela "Sem conexão" local, menu em português, deep link `absolutezro://` e aviso de versão nova por `/baixar/hub/versao`. Instaladores no Release `hub-desktop` (workflow `hub-desktop.yml`), entregues por `/baixar/hub/{mac,windows}`. O download só abre ao público com `HUB_DESKTOP_PUBLICO=1` na Vercel (decisão do titular; até lá, "Em breve").
- ✅ Central de apps (26/10/2026, [ADR 0018](decisions/0018-central-de-apps.md)): o app Absolute ZRO instala, abre,
  atualiza e remove SOBEDESCE, Synquei e NOSSOM (catálogo `GET /api/v1/desktop/apps` a partir dos Releases, SHA-256
  conferido, sem administrador). Sites das ferramentas com "Instale pelo Absolute ZRO" primeiro e o download direto
  como reserva; no celular, o Absolute ZRO instala na tela de início (Android com um toque, iPhone com guia).
- 🟡 Olho no campo de senha (28/10/2026, pedido do titular): mostrar/ocultar o que foi digitado em todo campo de senha
  do HUB (`@zro/ui/senha`), do site do SOBEDESCE, do NOSSOM e na chave manual do SOBEDESCE para computador; Carro do
  Freela já tinha. Falta: publicar os sites e um novo build do SOBEDESCE para computador.
- 🟡 Instalador do ecossistema em segundo plano (28/10/2026, pedido do titular; adendo do [ADR 0018](decisions/0018-central-de-apps.md)):
  Absolute ZRO para computador 1.3.0 com o símbolo na barra de menus/bandeja, abre com o computador (escondido),
  confere o catálogo do HUB a cada 4 h e atualiza SOBEDESCE e Synquei sozinho (instala com o app fechado; aberto,
  "atualiza ao fechar" e "Reiniciar e atualizar"), tela de boas-vindas para escolher os apps. SOBEDESCE e Synquei
  instalados pela central desligam o atualizador próprio (`apps-gerenciados.json`). Falta: build no Actions e Release
  `hub-desktop` (autorização do titular) e conferir num Mac e num Windows de verdade (barra de menus, login item,
  notificações, troca do app aberto).
- ⬜ App para computador, próximas etapas: certificados Apple/Microsoft (decisão do titular: depois) para assinar a
  central e atualizar ela mesma sozinha; NOSSOM no catálogo (Release `nossom-v…` no AbsoluteZRO ou `GITHUB_TOKEN` no
  projeto `absolutezro`); ~~abrir o download público~~ (`HUB_DESKTOP_PUBLICO=1` ligado em 26/10/2026, com instalação pelo Terminal).
- ⬜ `GITHUB_TOKEN` no projeto Vercel **absolutezro** e primeiro Release `hub-desktop` (push na `main` com mudança em `apps/hub-desktop/**`); até lá `/baixar` mostra "Em breve" ([downloads-privados](operations/downloads-privados.md)).
- ✅ Conta central: cadastro, login, sair, sessões (lista e encerrar), confirmação de e-mail, nova senha, troca de senha.
- ✅ Central da conta (26/10/2026, pedido do titular): `/perfil` vira "Sua conta", com visão geral (foto e nome),
  Segurança (troca de e-mail confirmada pelo endereço novo, senha, aparelhos conectados), Plano (plano da organização
  ativa, pedido de renovação ou upgrade que a equipe atende no console) e Acessos (organizações, papel, planos e
  ferramentas liberadas, apps em que a pessoa entrou). Migration 0010 (`user_avatars`, `plan_requests`,
  `auth_tokens.new_email`). ⛔ Renovar e fazer upgrade com pagamento de verdade dependem do provedor de pagamento.
- ✅ App para computador como painel (26/10/2026, pedido do titular): abre com a animação da marca (o anel se
  desenha e a estrela inteira recolhe, `desktop/paginas/abertura.html`) e cai no painel `/app`, no espírito do
  Creative Cloud: barra lateral com a conta, cartões das ferramentas com Instalar/Abrir/Atualizar e "Atualizar tudo".
  Login próprio animado em `/app/entrar`. Versão 1.1.0.
- ✅ AEON e Revela disponíveis (migration 0013, decisão do titular): entram no Completo, no Pro e no grátis de hoje.
- ✅ Página inicial com o ecossistema em números, destaques por app, fluxo de eventos e o app para computador.
- ✅ Planos: o Avulso vira uma janela só, em que se marcam um ou mais apps e o valor soma. Com as vendas fechadas,
  tudo liberado e os botões levam a baixar; com as vendas, a assinar.
- ✅ Menu lateral recolhível (botão e ⌘/Ctrl + \\, lembra a escolha; recolhe sozinho entre 901 e 1200 px), conteúdo
  até 1680 px centralizado e uma barra só no celular, com o menu em folha que fecha ao navegar.
- ✅ Organizações, troca de organização ativa, convites (e-mail confirmado e igual), papéis, remoção, dono garantido.
- ✅ RLS em todas as tabelas com testes de isolamento entre organizações.
- ✅ Catálogo versionado, Ciclo do O, planos individuais, entitlements, quotas atômicas, carência, console.
- ✅ Projeto canônico com etapas reais, briefing/roteiro versionados, Ciclo do O navegável com alternativa em lista.
- ✅ Auditoria só-inclusão; logs sem dados pessoais.
- 🟡 2FA (⬜), provedor de e-mail (⛔ decisão), login social (⬜).
- ✅ Excluir a conta (28/10/2026, pedido do titular): Sua conta › Segurança › "Excluir…" abre `/perfil/excluir`, em duas
  etapas (senha atual, ou o e-mail para quem só entra pelo Google; depois uma tela que diz o que acontece). No core
  (`packages/core/src/excluir-conta.ts`, migração 0023): anonimiza (e-mail único e inválido, nome, foto, senha e Google
  apagados, status `deleted`), encerra todas as sessões, revoga refresh tokens e consentimentos do login único em todos
  os apps, cancela pedidos e convites abertos, apaga as conversas com a Z, encerra as organizações só dela (`closed`) e
  registra `account.deleted` sem dado pessoal; auditoria, uso e cobrança ficam. Bloqueia dona de organização com outras
  pessoas (lista quais), assinatura paga ativa e administração da plataforma. O e-mail fica livre para conta nova; a
  pessoa recebe "Sua conta foi excluída" e cai em `/conta-excluida`. Falta: aplicar 0023 em produção e publicar.

## Fase 2 — Conexão real

- ✅ SOBEDESCE → HUB: resumo `descargas.jsonl` v1 + relatórios xxHash64, prova por destino, divergência explícita.
- ✅ HUB → Synquei: validação do manifest e prévia de organização (dry-run, IDs preservados) pela fila.
- 🟡 SOBEDESCE → Synquei depois do download do Drive (28/10/2026, plano SD→SQ, etapas 1–4 e 6): lote de download de
  uma pasta concluído sem arquivo diferente grava a linha `v: 2` no `.sobedesce/descargas.jsonl` da pasta baixada
  (`op`, origem do Drive sem credencial, arquivos com tamanho, id do Drive e MD5 quando conferido, `project_id`
  opcional) e mostra **Preparar no Synquei** (`synquei://organizar?…&op=`); sem o Synquei, a central Absolute ZRO
  (`absolutezro://baixar`) ou absolutezro.com/baixar. O Synquei confere o manifesto à risca e cada arquivo no disco
  (ausentes, movidos, alterados, `.sobedesce-part`), monta um projeto por operação (repetir não duplica), marca
  sincronia ambígua para revisar e grava o recibo `synquei.preparo/1` em `Synquei/preparos.jsonl`, que o lote do
  SOBEDESCE mostra (aguardando, preparando, preparado, pendências; 45 s sem recibo = "atualize o Synquei"). Contrato
  em `packages/media-contracts` + parser em `packages/integrations`. O cartão também passou a dizer "Preparar no
  Synquei". ⬜ Roteiro manual (Mac e Windows reais, HD externo, 300+ GB) em validation.md; ⬜ distribuir os dois
  desktops (autorização do titular); ⬜ HUB importar a v2 e o recibo (etapa 5) e o vínculo do `project_id` em degraus.
- ✅ SOBEDESCE → Synquei na mão da pessoa (26/10/2026): cartão OK no Backup Automático mostra **Abrir no Synquei**,
  que abre o Synquei (`synquei://organizar`) com a pasta do projeto e o tipo escolhido no projeto; o Synquei pergunta
  antes e o tipo também vai no `descargas.jsonl`. ⬜ Testar com os dois apps instalados (Mac e Windows) depois do
  próximo build de cada um.
- 🟡 SOBEDESCE · prova medida para página e anúncio: `products/sobedesce/scripts/prova-velocidade.mjs` mede o mesmo link
  no Chromium e no app (MD5 igual ou não vale) e o roteiro do vídeo 9:16 está em `products/sobedesce/docs/PROVA-VELOCIDADE.md`.
  ⬜ Rodar numa máquina real e gravar a tela (só então publicar número).
- ✅ SOBEDESCE · entrega conferida → HUB (26/10/2026): a pasta de entrega (a da Revela ou qualquer outra) sobe com o
  MD5 de cada arquivo conferido e o lote ganha **Comprovante** (`sobedesce.entrega/1`); em Finalização e entregas, o
  projeto registra o comprovante e publica `delivery.ready` v2 (`source: sobedesce`, link da pasta no Drive montado
  pelo HUB, mesma permissão e cota da importação de descarga, sem duplicar). ⬜ Envio automático do app para o HUB:
  pede o HUB aceitar o token do login único com escopo próprio (decisão de arquitetura, ADR nova).
- ⬜ SOBEDESCE · "Converter com a Revela" em Mac, Windows, iPhone e Android reais (roteiro em validation.md).
- ✅ Central de apps atualiza o que não instalou (29/10/2026): lê o build de dentro do app (`build-info.json` no
  `app.asar`) em vez de depender só do próprio registro. Antes, um SOBEDESCE instalado pelo Terminal ficava no build
  antigo: o app esperava a central e a central não sabia o build dele.
- ✅ SOBEDESCE · contador de "Agora" corrigido (29/10/2026): a porcentagem somava a lista inteira (lotes antigos
  concluídos e a tentativa que falhou de novo junto com a nova), e um envio de 100 GB aparecia como "51% de 205 GB"
  depois de terminado. Agora conta só a rodada de agora, e o envio mandado de novo substitui a tentativa que falhou.
- ✅ SOBEDESCE · build do app de desktop de volta (26/10/2026): o download do SDK da Blackmagic devolvia 400 com o
  cadastro antigo; com o segredo `BRAW_SDK_CADASTRO` refeito, Mac e Windows passam (SDK, empacotamento e teste de fumaça).
- ✅ TPeasy ↔ HUB pelo backup JSON do próprio app.
- ✅ Carro do Freela → HUB (26/10/2026): o site do Carro leva o job (`carro-do-freela.job/1`, com o briefing inteiro)
  e a equipe escalada (`carro-do-freela.crew/1`) para a organização no HUB, com o token da pessoa (escopo
  `carro-do-freela.jobs`, Bearer nas rotas `/api/v1/carro-do-freela/jobs` e `/jobs/crew`). Quem já é da organização
  entra na equipe do projeto; conta de fora recebe convite de **convidado** (papel `guest`, migration 0014) que só
  abre aquele projeto, só a mesma conta aceita e nunca rebaixa ninguém. O projeto mostra a seção Equipe.
- ✅ Carro do Freela fechado até o lançamento (28/10/2026, adendo do PRD): só a conta listada como `allowed` no HUB
  entra (claim `zro_release` relida a cada pedido; `CARRO_RELEASE` padrão `closed`). O resto vê "Em desenvolvimento".
- ✅ Carro do Freela (27/10/2026): sem selo "Prévia" na barra de cima (a prévia segue dita no pé da home, no menu e
  no rodapé do app) e o "Continuar com Absolute ZRO" com o símbolo flat no lugar do feixe de luz antigo.
- 🟡 Carro do Freela com banco próprio (29/10/2026, pedido do titular): schema `carro_do_freela` no Supabase
  AbsoluteZRO (já existia, com `cadastros`, `leads` e `passos` do app antigo, que ficam intactas), login
  `carro_do_freela` (migra) e `carro_do_freela_app` sem login (RLS por `sub`), migrações em
  `products/carro-do-freela/db/migrations` (diário com sha256; recusa editada, sumida e fora de ordem; servem também
  para o projeto novo em São Paulo), aplicadas no build da Vercel só com `CARRO_DATABASE_URL`. Perfil
  (`carro_do_freela.perfis`, sem telefone, CPF ou e-mail; visibilidade nasce privada) e inventário
  (`carro_do_freela.inventario`) pelo próprio freela em `/api/zro/perfil` e `/api/zro/inventario`, com a sessão
  conferida no HUB e o portão fechado (só o proprietário). Cada mudança grava o evento `freela.inventario.atualizado`
  (contrato `freela.inventario/1`) na fila do Carro. Falta, em produção e com o titular: criar os papéis, passar o
  schema para o login do app e pôr `CARRO_DATABASE_URL` no projeto `carrodofreela-app`
  (`products/carro-do-freela/db/PRODUCAO.md`).
- ⬜ Inventário do Carro chegando ao Maestro: o publicador existe e está desligado (`CARRO_SYNC_ATIVO`); falta o
  endpoint de entrada no HUB, a entrega assinada ao Maestro e tirar a rota de `DISABLED_ROUTES`, com decisão do titular.
- ✅ Eventos versionados, outbox, fila com retry/backoff, dead-letter, revisão, reprocessamento; fluxo ponta a ponta
  testado com fixtures gerados pelo código real do SOBEDESCE.
- 🟡 NOSSOM · Isolar voz no nível do Voice Isolator do ElevenLabs (29/10/2026): Mel-Band RoFormer + MossFormer2 SE 48K, modos Fala e Música, medido em CPU ([estudo](../products/nossom/docs/estudo-elevenlabs.md)); falta build da imagem, homologação na GPU e audição cega (⛔ autorização de deploy e GPU).
- ✅ NOSSOM · vídeo de verdade (29/10/2026): vídeo até 2 GB lido no aparelho, só o som (FLAC) vai à GPU, botão Vídeo devolve o original com o som novo (até 1 GB).
- ✅ NOSSOM · Legendas (29/10/2026): Whisper large-v3-turbo com tempo por palavra, SRT/VTT/TXT no navegador.
- ✅ NOSSOM · Remixar (29/10/2026, pedido do titular): voz, bateria, baixo, guitarra e outros com faders, mudo, Só instrumental e Só acapella; as faixas somam o original.
- ⬜ NOSSOM · próximas fases do estudo: arquivos de 1 h, tirar eco, edição por texto, voz com consentimento, dublagem.
- 🟡 NOSSOM: link e contrato `edit.timeline.ready`; passagem automática ⬜ (precisa de mudança no NOSSOM, com autorização).
- ⬜ HUB recebendo o recibo do Synquei (`synquei.preparo/1`, parser pronto em `parsePreparos`) no projeto; o Synquei
  segue lendo o manifesto local e o `OrganizationPlan` do HUB fica como prévia.
- 🟡 Carro do Freela emitindo jobs: o envio existe e é real; os jobs e a escala do protótipo ainda moram no aparelho
  (sem banco do Carro), e a gente da prévia não tem conta Absolute ZRO (aparece como "sem conta").
- ⛔ Tráfego pago do Carro do Freela (regra do titular): só depois de agenda, reputação e pagamento reais e do
  consentimento registrado no banco. O cadastro já pede e grava o consentimento (versão, data, origem
  "autodeclarado"), por enquanto no aparelho.
- ⬜ SSO Fase 2 (HUB como provedor OIDC para as cópias) e Fase 3 (federado com originais, exige autorização).
- ⬜ Testes de ida e volta de timeline com o editor-alvo (⛔ escolher editor).

## Fase 3 — Monetização

- ✅ Catálogo parametrizável, versões de plano, webhook neutro assinado/idempotente, carência, reconciliação.
- ✅ Stripe ([ADR 0019](decisions/0019-vendas-stripe.md)): avulso R$ 59,90/mês, Completo R$ 149,90/mês, Pro R$ 299,90/mês
  (anual: avulso R$ 449, Completo e Pro 10× o mensal), créditos de IA e GPU por plano, teste de 7 dias do Completo para conta nova, contas atuais até uma
  data de corte. Checkout, portal e webhook `customer.subscription.*`; "Ligar vendas" no console.
- ✅ Painel de consumo (27/10/2026): anel do que resta, "Renova em…" do mês e do plano, uso por dia e últimos usos.
- ⬜ Apps com IA e GPU chamarem `consumeQuota` na métrica `zro.ai_credits`; pacote de créditos extras.
- ⛔ Conta Stripe do titular e as chaves na Vercel; depois "Ligar vendas" com a data de corte.
- ⬜ Assentos, limites por plano, troca de plano com prorrateio (hoje é assinatura nova + cancelar a antiga no portal).

## Fase 4 — AI Edit · Fase 5 — Revela (Finishing)

- ✅ Balão de pendências na navegação (27/10/2026), no desenho do SOBEDESCE/HUB: AEON (Mídia sem arquivo, propostas
  para decidir), Revela (CST sem log conferido, Converter na fila ou pronto para baixar) e NOSSOM (pedido de
  restauração que espera a pessoa, em Meus projetos). Só estado real; regras em `src/pendencias.js` e
  `lib/studio-pending.ts`.
- 🟡 Scaffolds com contratos e formato de presets ([ai-edit](../products/ai-edit/README.md), [finishing](../products/finishing/README.md)).
- 🟡 Editor (nome provisório AI Edit), primeiro recorte (26/10/2026, [ADR 0020](decisions/0020-editor-desktop-custo-zero.md)):
  app de desktop no molde do Synquei (Electron, assinatura ad-hoc, instalação pelo Terminal/PowerShell, Release
  `ai-edit-app-desktop` publicado só pelo botão), custo zero. Importar (arquivo ou cartões conferidos do SOBEDESCE),
  Whisper na máquina com tempo por palavra, cortes de silêncio/respiro e zoom propostos para aprovar, linha do tempo
  magnética com desfazer, cores e etiquetas, legenda animada editável, exportação FCPXML/xmeml/OTIO/EDL/SRT com
  `ZroTimelineRef` e render MP4 com zoom e legenda. Demo medida em [validation](validation.md). Falta: nome definitivo,
  publicar o primeiro Release, conferir a ida e volta no Premiere/Final Cut/Resolve reais, medir num Mac e num PC com
  placa de vídeo, login único e créditos (quando houver recurso pago), entrada do Synquei/NOSSOM/TPeasy.
- 🟡 AEON (nome e marca do editor, 26/10/2026, [marca](marca/aeon.md)): estrela da Convergência e ΛEON em Montserrat
  SemiBold; Seus universos (projetos salvos sozinhos), Inspector (volume, opacidade, escala, posição), Histórico,
  marcadores e ímã na linha do tempo. Site em **aeon.absolutezro.com** (projeto Vercel `aeon`, autorizado pelo titular
  em 26/10/2026) com o editor no navegador em `/app/`, telas reais do app e imagens do Higgsfield. **Só abre com a conta
  Absolute ZRO** (decisão do titular): login único em `api/zro/*` (cliente `aeon-web`, mesmo padrão da Revela); falta
  cadastrar o cliente no console e pôr `ZRO_CLIENT_ID`/`ZRO_CLIENT_SECRET` no projeto Vercel, e o login no app de desktop. Primeiro
  Release do app no ar (build 8, 26/10/2026). Depois: tirar mídia do projeto (uma ou várias, com desfazer), AEON como
  editor completo (a IA é ajuda opcional) e homepage com motion no estilo do SOBEDESCE.
- ✅ AEON, menu lateral (27/10/2026): cada item faz algo de verdade (Seus universos com estado, Novo projeto, Abrir,
  Salvar cópia só com projeto), conta num cartão com menu (Conta Absolute ZRO, Sair) e a família numa linha só
  ("Apps Absolute ZRO" abre a grade). A conta no app de computador não abria (link interno em aba nova, que o Electron
  recusa).
- ✅ AEON, atualizar pelo app (27/10/2026): "Versão nova · Atualizar" na barra; baixa do Release, confere o SHA-256,
  fecha e abre já atualizado (Mac e Windows, no molde do SOBEDESCE). Site: sem corte seco entre as fotos (as cenas se
  dissolvem no fundo), a salina sem texto e o fecho com a estrela inteira. Falta conferir a troca num Mac e num
  Windows de verdade com o próximo Release.
- 🟡 AEON e Revela fechados ao público (28/10/2026, Etapa B do PRD §5–§6, decisão do titular): os sites só apresentam
  ("Conhecer o projeto" é âncora, Z "Chegando", sem Baixar/Abrir/Testar); o editor do AEON (`app/`, `src/`,
  `presets/`) e as ferramentas da Revela (`inicio`, `lut`, `cst`, `entrega`, `converter`, `app/`, `src/`,
  `exemplos/`) saem do estático (`scripts/publicar-site.mjs` → `publico/`) e só saem pela função `api/app.js` para a
  conta que o HUB marca `allowed` na claim `zro_release`; `/api/zro/eu` e `/api/zro/ia/*` 403 para o resto; página
  "Em desenvolvimento" (200) nos dois; `/baixar/*` do AEON volta à home e `instalar.sh`/`.ps1` só dão o recado;
  manifesto da Revela sem atalhos. `RELEASE=closed` local (`api/_release.js`), deny-by-default mesmo com o HUB fora.
  Falta: o HUB emitir `zro_release` e negar código/refresh/userinfo aos clientes fechados (contrato simulado em
  `test/zro-falso.js`), o Release `ai-edit-app-desktop` em rascunho (titular, no GitHub) e publicar os projetos
  `aeon` e `revela` depois do HUB.
- ⬜ Revela, primeiro recorte: só DaVinci Resolve, cor entregue em PowerGrade e LUT, técnica gerada e criativa entregue ([ADR 0015](decisions/0015-finishing-resolve-powergrade-lut.md)). QC, exportação e media manager vêm depois.
- ✅ Revela: identidade visual (película perfurada em amarelo filme, revelada em roxo → amarelo; escolha do titular; guia e alternativas em `products/finishing/marca`) aplicada na tela e no HUB — [ADR 0016](decisions/0016-identidade-revela.md).
- 🟡 Revela: referência → LUT criativa com tela e conta-gotas de pares de cor (`products/finishing`, sem IA, roda no navegador sem enviar imagens, 18 testes com Chromium e a CSP de produção, CI próprio). Projeto Vercel `revela` autorizado pelo titular em 25/10/2026, em revela-zro.vercel.app, hoje revela.absolutezro.com (o endereço antigo redireciona; `revela.vercel.app` é de outro app), com OG próprio. Falta: LUTs técnicas por câmera, ponte com o Resolve e pacote de entrega.
- 🟡 Revela: entrega por destino (8 presets com fonte e data, script do Resolve testado num Resolve simulado). Falta: teste no Resolve Studio real, presets de emissoras específicas e QC do arquivo renderizado.
- 🟡 Revela no SOBEDESCE: "Converter com a Revela" no botão direito do Drive (computador) e no menu do vídeo do celular; converte o aparelho que tocou (computador: ffmpeg com hardware e MD5 conferido; celular: no navegador, lendo do Drive por pedaços). Arquivo ao lado do original, presets da Revela. Falta: Mac e Windows reais (VideoToolbox, NVENC), iPhone e Android reais e arquivo final acima de 1,5 GB no celular.
- ✅ Revela: telas no padrão Apple com pouco texto (cartões visuais, Liquid Glass, motion com "reduzir movimento").
- 🟡 Revela: conversor no navegador, celular e computador (master ProRes → YouTube, Vimeo, Reels, TikTok em H.264/HEVC marcado BT.709; arquivo não sai do aparelho). Falta: teste em iPhone/Android reais, arquivos acima de 1,5 GB no celular e conversão de HDR.
- 🟡 Revela: página inicial com motion, página de login e login único Absolute ZRO (`api/zro/*`, cliente `revela-web`). Cliente `revela-web` cadastrado (26/10/2026, retorno `https://revela.absolutezro.com/api/zro/callback`), `sso_start_url` do `finishing` e `ZRO_CLIENT_ID` na Vercel. Falta: o titular colar `ZRO_CLIENT_SECRET` na Vercel (produção) e publicar de novo.
- ✅ Revela Look com a luz e a temperatura do grade de produção do titular (ΔE 6,2 → 2,9; meio-tom claro e dourado, branco neutro) e **Meus looks**: o clone salvo com nome, só no navegador, na grade de looks e no `.cube`.
- ✅ Revela: Clonar LUT com curva de tom e **Mais frames** (até 6 stills do mesmo grade, par e orientação automáticos); CST com saída LogC3 / AWG3 para LUT de película. Estudo com stills reais do titular (S-Log3, Rec.709 e look de película).
- ✅ Revela: abas do dock trocam só o painel central (`app/navegar.js`), sem recarregar menu, topo nem dock; a marca da aba desliza e cada painel guarda o que estava.
- 🟡 Revela: abertura de película do app instalado (sala escura, fita, quadros revelando) e trocas de aba sem borrão nem pulo no celular. Falta: ver num iPhone.
- 🟡 Revela como app no iPhone: Compartilhar → Adicionar à Tela de Início, com manifesto, ícones, barra de status e "Instalar o app" no menu. Falta: conferir num iPhone (login dentro do app instalado).
- 🟡 Revela no celular: `.cube` e `.py` baixam como arquivo (antes o iPhone salvava `.cube.txt`); nome comprido no Converter não alarga mais a página (era o que tirava a marca do dock do lugar); login mostra AEON e Absolute ZRO; Converter reduz o quadro na GPU. Falta: medir a velocidade num iPhone real.
- 🟡 Revela Look: look de película próprio como preset da tela de LUT (`src/cor/looks.js`, .cube 33/65). Falta: comparar no Resolve com o FVPro+ do titular e ajustar.
- 🟡 Revela CST: 17 entradas de câmera e 6 saídas (`cst.html`, `src/cor/espacos.js`), .cube 33/65. Falta: conferir no Resolve contra o CST dele (nível de dados) e match entre câmeras. CST no Converter feito (GPU).
- 🟡 Revela: Clonar LUT (antes e depois do mesmo frame) e preset .xmp para Lightroom (aproximado). Falta: conferir o .xmp num Lightroom real.
- ✅ Família Absolute ZRO no menu de todas as plataformas, em ordem alfabética (HUB, Revela, Sobedesce, Synquei, Nossom, TPEasy; Carro do Freela em seguida).
- ✅ Revela: dock de ferramentas embaixo (estilo DaVinci) e menu lateral recolhível (trilho no computador, gaveta no celular).
- ✅ Revela: tema claro por padrão (escuro no menu), títulos em Figtree, página inicial sem manchas de luz, com menos
  texto e telas reais no tema escolhido.
- ✅ Revela: cinco looks próprios e a grade com todos no mesmo frame, lado a lado (tela de LUT e página inicial).
- 🟡 Revela: exportar o look para Resolve, Premiere, Final Cut e CapCut (.cube no tamanho de cada um) e Lightroom
  (.xmp aproximado, XML conferido). Falta: abrir os arquivos em cada editor real.
- 🟡 Revela: CST por clipe a partir do relatório do Synquei (script do Resolve com as LUTs dentro, testado num Resolve
  simulado). Falta: Resolve real; o Synquei não lê o perfil de log, só a câmera.
- ⬜ Revela → SOBEDESCE → HUB (`delivery.ready`): falta porta de entrada no SOBEDESCE para receber a pasta de entrega
  de outro app e rota no HUB para produto publicar evento (hoje só sessão de navegador e rotas específicas).
- ⬜ Revela e créditos: a Revela não usa GPU de servidor (tudo roda no aparelho), então não há `zro.ai_credits` a
  descontar. Quando houver, falta rota no HUB para produto debitar e a Revela guardar o token de acesso.
- ⬜ Revela: compra única (Revela Look + LUTs CST) só depois de validar o Look no Resolve.

## Maestro — plataforma nova (28/10/2026, [ADR 0022](decisions/0022-maestro-no-monorepo.md))

- ✅ Etapa 0, fundação: `products/maestro` (Next 16 + Drizzle, `package.json` próprio, `vercel.json` com deploy
  travado), shell com a logo do Maestro e o símbolo Absolute ZRO, abas Z · Quadro · Aprovações · Clientes · Projetos ·
  Ajustes (as não feitas em estado vazio honesto), página inicial "Em desenvolvimento", tema claro/escuro.
- ✅ Banco: `drizzle/0000_fundacao.sql` no schema `maestro` (organizations, members, sessions, clients, projects com
  `zro_project_id`/`link_status`, cards com jsonb por campo e `versao`, card_history, card_media para o Drive, lotes,
  lote_cards, approval_links com hash/validade/PIN/revogação, approvals imutável, client_requests, integration_state,
  audit_log, rate_limit_attempts), papel `maestro_app`, RLS por organização em todas as tabelas com `with check`,
  escrita de cards só por função, migrador de schema não-`public`, semente `demo-` opcional.
- ✅ Login único `api/zro/{entrar,callback,eu,sair}` (PKCE S256, `state`/`nonce` selados, JWKS, `prompt=create`),
  sessão própria com tokens cifrados, organização e membro criados no callback com o papel por tabela fixa,
  `temAcesso()` num lugar só (com o encaixe da claim `zro_release` do gate), tela "sem acesso", repasse da Z
  (`api/zro/ia/*`, NDJSON sem buffer) e a aba Z como primeira.
- ✅ HUB: `maestro` em `ProductId` e `PRODUCT_SCOPES`, entrada da Z em `plataformas.ts`, migration `0019_maestro.sql`
  (`coming_soon`, `step_order` 8, feature `project_link`), ícone do produto. Planos não mudam (avulso).
- ✅ Etapa 1 (28/10/2026; o titular definiu o Maestro como a gestão da produtora: CRM, financeiro, pauta e aprovação):
  Quadro de pauta funcionando sobre `maestro.card_*` (criar, ficha por campo com conflito por campo, mover entre as 8
  colunas arrastando no computador e por "Mover para…" no celular, próximo passo do método, responsável, prazo,
  cliente, projeto, prioridade, filtro por cliente/responsável, busca, apagar com Desfazer, tempo real por poll de 5 s
  em `/api/quadro`); Clientes (CRM básico: nome, empresa, contato, WhatsApp, e-mail, observações, lead/ativo/pausado,
  busca, ficha com cards, projetos e `wa.me`); Projetos (código `MAE-AAAA-NNN` por organização, cliente, status,
  datas, briefing; `link_status` fica `pending`). Migration `drizzle/0002_crm_quadro_projetos.sql`.
- ✅ Demonstração (28/10/2026, pedido do titular): "Carregar demonstração" (Quadro vazio e Ajustes, só administração e
  gestão) monta na organização da sessão uma produtora de exemplo com 10 clientes fictícios (`@exemplo.com`, sem
  telefone), 12 projetos `DEMO-AAAA-NNN` (`unlinked`, com valor), 31 cards nas 8 colunas e 4 lotes enviados; selo
  "Demonstração" no topo enquanto houver; "Remover demonstração" apaga só o que é `demo`. Idempotente, `asUser` com RLS.
  Migration `drizzle/0003_demonstracao.sql` (coluna `demo`, `maestro.demo_apagar_cards()`).
- ⬜ Quadro, depois: vistas Por prazo, Minha lista e Calendário, lixeira com lista, histórico do card na ficha.
- ⬜ Financeiro (decisão do titular, 28/10/2026): lançamentos, fluxo e resultado por projeto.
- ⬜ Etapa 2: aprovação do cliente (`/aprovar/<token>`, um passo, pinos, conferência, idempotência), peças no Drive
  via SOBEDESCE (proposta em [maestro-project.md](integration-contracts/maestro-project.md)), `wa.me`.
- ⬜ Etapa 3: `maestro.project/1`, vínculo automático ao criar, chips de status, ferramentas da Z, balões.
- ⛔ Projeto Vercel `maestro`, domínio `maestro.absolutezro.com`, cliente OIDC `maestro-web` e migrações em produção:
  autorização do titular.
- ✅ Aberto em teste a todos com a fundação (decisão do titular, 28/10/2026): migration `0020_maestro_aberto.sql`
  (`stage = 'beta'`, `public_beta` com web/api/sso, no grátis vigente, no Completo e no Pro, contas atuais ganham pela
  assinatura vigente; sem avulso). `temAcesso()` exige `zro_release.maestro` released/allowed **e** `maestro` em
  `zro_products` (claim guardada na sessão, `drizzle/0001`). Cliente `maestro-web` por `npm run db:client:maestro`
  (segredo só por variável). `vercel.json` sem a trava.
- 🟡 Produção: projeto Vercel `maestro`, domínio, variáveis, papel/schema no Supabase e cliente OIDC
  ([deployment-checklist §5b](operations/deployment-checklist.md)), a fazer pelo titular.
- ℹ️ Estado atual: **fechado**, só a lista de acesso entra (migration `0024` do HUB). Abrir a todos é a `0022` e pede o
  titular.
- ✅ Maestro v2, fases 0–2 ([ADR 0024](decisions/0024-maestro-v2.md), 28/10/2026): `CLAUDE.md` do Maestro corrigido
  (fechado); `temProduto()` pelas claims; barra lateral em vidro com grupos (Z · Produção · Comercial · Ajustes) e barra
  de baixo no celular. Página inicial pública em `/` (frase "A produtora inteira num lugar só.", selo "Em teste
  fechado", capturas reais da demonstração em MacBook e iPhone, claro e escuro; método das 8 colunas, "Já funciona",
  "Vem aí" com "Em breve"; "Entrar com Absolute ZRO" e "Quero acesso"), OG, ícone Apple, `robots` e `sitemap`. Lista
  de espera em `drizzle/0004_lista_espera.sql` (e-mail, nome opcional, consentimento, HMAC do IP; RLS ligado,
  `maestro_app` sem privilégio na tabela, só `maestro.lista_espera_entrar()`; 5/h por IP e teto geral; armadilha;
  mesmo e-mail não duplica). Sistema visual: acento de latão só em superfície (filete da aba, foco, encaixe de soltar,
  selos), cor fechada por coluna do Quadro, títulos Light × ExtraBold, monograma com tom por cliente, card que inclina
  ao pegar e assenta com a mola, entrada de seção de 240 ms, esqueletos (`loading.tsx`), tudo em CSS e desligado em
  "reduzir movimento". E2E do Maestro (Playwright) no CI.
- ✅ Maestro v2, fases 3–6 (28/10/2026): **aprovação do cliente com vídeo por link**. Migration
  `drizzle/0005_revisao.sql`: `versoes` (link + fonte + metadados; n = volta), `comentarios` (tempo em ms, intervalo,
  pino x/y; o texto nunca muda, só "resolvido"), `approvals` com versão e volta; RLS por organização nas duas tabelas
  novas, escrita só pelas funções `versao_*`/`comentario_*`; porta estreita do cliente `link_pin`, `link_abrir`,
  `link_comentar`, `link_enviar` (security definer, sem organização na sessão, só o lote do token). Token só como
  sha256 (cópia cifrada para a equipe copiar), validade 7/15/30 dias, revogação, um ativo por lote, PIN opcional
  (scrypt + cookie assinado de 12 h), limites (abrir 120/h por link, 300/h e 30 links mortos/h por IP, PIN 5/15 min,
  comentar 60/h, enviar 20/h), IP só como HMAC do dia, auditoria. Decisão idempotente por peça e volta; aprovar leva o
  card a Aprovado e pedir ajuste a Revisão ("ajuste pedido"); gerar o link leva os cards em Revisão a Em aprovação e
  versão nova com link ativo volta a Em aprovação. Detector de fontes puro (Drive, YouTube, Vimeo, Dropbox `?raw=1`, mp4
  /mov/webm, HLS, genérico) e players: `<video>` com passo de quadro e timecode, HLS nativo ou hls.js carregado só quando
  preciso, YouTube IFrame API (nocookie), Vimeo Player SDK, Drive pela chave `MAESTRO_GOOGLE_API_KEY` (opcional; sem
  ela, iframe com tempo digitado); CSP própria em `/a` e `/app/aprovacoes`. Telas: `/app/aprovacoes` (lotes, novo lote,
  versões por link colado, régua com marcadores, resolver, filtros, link com PIN/validade, copiar, WhatsApp, revogar,
  fechar, CSV e EDL de marcadores) e `/a/[token]` (peças numeradas, comentário no tempo com pino, "Antes | Agora",
  "Aprovar esta"/"Pedir ajuste nesta", "Revisar e enviar" com nome e aceite, selo do aprovado, tela neutra). A
  demonstração ganhou aprovações (vídeos sintéticos em `public/demo`, comentários, decisões e link ativo; completa
  demonstrações antigas uma vez). Página inicial: Aprovação em "Já funciona" com captura real.
- ✅ Maestro v2, a produtora por dentro (plano v2 §6–§7, 28/10/2026): o `/painel` do ZRO portado para o Maestro, com
  `org_id` + RLS em toda tabela (helper `maestro.politicas_padrao`) e papéis da sessão. Migrations `0006_orcamentos`
  (tabela de preços com faixas por quantidade, multiplicadores por nicho, modelos; orçamentos numerados com versões,
  um aprovado por número), `0007_freelas_agenda` (freelas, valores por função, `freela_pagamento` com CPF/PIX
  cifrados com `MAESTRO_KEY` e lidos só por admin e gestão, diárias, escalas), `0008_financeiro` (lançamentos, baixas
  por gatilho, recorrências; escala vira "a pagar" sozinha; Financeiro só admin e gestão), `0009_inventario`
  (equipamentos, veículos com km/L, reservas com conflito barrado no banco: gatilho com trava e, havendo `btree_gist`,
  `exclude`) e `0010_documentos` (checklist, ordem do dia, roteiro, decupagem). Telas: Orçamentos (editor com motor
  puro igual ao do ZRO, margem, parcelas, deslocamento por km com cidade-base da organização, timbrado A4 com
  "Imprimir ou salvar PDF"; aprovar cria o projeto e as entradas), Financeiro (lançamentos, a pagar/a receber, baixas,
  recorrências, fluxo e resultado com gráfico e tabela acessível; sem DAS/ISS), Freelas, Inventário, Agenda (equipe,
  equipamento e aviso de conflito), documentos no projeto, Ajustes › Empresa e Tabela de preços. Navegação em grupos
  (Produção, Comercial, Operação, Dinheiro) e aba Mais no iPhone. Demonstração completa (preços, 8 orçamentos em
  estados diferentes, finanças de 3 meses atrás a 2 à frente, 16 freelas, 35 equipamentos com reservas, agenda,
  documentos), idempotente e removível. Página inicial: "A produtora por dentro" em "Já funciona". Serviços abertos da
  calculadora (Photon/OSRM/ANP) portados mas desligados (`MAESTRO_SERVICOS_ABERTOS`) até a ciência do titular; sem
  eles, km e litro digitados. Carro do Freela: só o mapa
  ([maestro-carro-do-freela.md](integration-contracts/maestro-carro-do-freela.md)).
- ✅ Maestro v2, fases 11, 14 e 19 (28/10/2026): **marca da produtora** (`0011_marca`: logo reencodado em WebP no
  servidor e guardado no Postgres, SVG recusado, cor com contraste conferido; no timbrado e nas páginas do cliente
  `/a`, `/p` e `/o`, para todos os planos; Ajustes → Marca), **pedido público e aceite** (`0012_pedidos`: link de pedido
  com token só em sha256, revogável; formulário `/p` com as perguntas da tabela de preços, armadilha, tempo mínimo e
  limites; Comercial → Pedidos; "Gerar orçamento" pelo motor; link do orçamento `/o` com parcelas; aceite uma vez que
  abre projeto, cliente e parcelas a receber; pedir ajuste) e **Hoje** (`/app/hoje`, contagens do dia por organização).
  Pedido do titular no mesmo dia: **kit próprio do freela** (`0013_freela_equipamentos`: perfil, filtro no banco de
  freelas, o que ele leva na diária com o aluguel no mesmo "a pagar"). Contrato `freela.inventario/1` e evento
  `freela.inventario.atualizado` registrados, rota desligada (`DISABLED_ROUTES`): o Carro do Freela é a fonte de
  verdade (o banco dele nasceu em 29/10/2026; a publicação segue desligada). Demonstração com marca, seis pedidos, um aceite que virou projeto, kits e Hoje.
  Página inicial: Hoje, Pedidos, Aceite online e Sua marca em "Já funciona".
- ✅ Maestro, visual **C1 · Aurora** (escolha do titular, 28/10/2026): luz ambiente que segue a hora de quem vê
  (manhã, tarde, fim de tarde e noite no claro; o escuro é a noite), cruzamento de 60 s e deriva de 120 s, parada com
  reduzir movimento; a barra lateral virou a cápsula de vidro no topo (grupos como menus, relógio "Manhã · 10:42"),
  barra de baixo flutuante no celular; cards brancos, colunas foscas, chips tingidos com texto grafite/branco, latão
  para "com o cliente", gráfico em grafite e pêssego; Hoje com a saudação da hora; página inicial com a cápsula e
  capturas refeitas da demonstração. Todo texto AA sobre o pior ponto da luz (e2e `visual.spec.ts`). Só visual: nada de
  dado ou comportamento mudou.
- ✅ Maestro, **o negócio por dentro** (estudo MakersHub §4, itens 1, 2, 3, 6 e 7 aprovados pelo titular, 28/10/2026;
  migrations `0014`–`0018`): **funil leve** nos Pedidos (quadro por etapa ou lista; Novo, Em conversa, Orçamento
  enviado, Negociando, Ganho só com orçamento aprovado e Perdido com motivo, amarrados ao status por gatilho; valor
  estimado, próximo contato e "contato feito" com histórico, também para clientes/leads) e **Retornar hoje** no Hoje
  com "Feito", "Amanhã" e "+1 semana"; Hoje no desenho C1 (agenda, vencendo, com o cliente, caixa da semana com dados
  reais e meta do mês). **Números do negócio** (Financeiro → Números, só admin e gestão também no banco): meta do mês
  com o ritmo esperado, faturado, recebido, ticket médio, conversão, taxa de ganho, motivos de perda, margem por
  projeto e por cliente, receita por nicho, seis meses; mês, trimestre ou ano. **Importar planilha** (Ajustes, admin e
  gestão): clientes, projetos, freelas e equipamentos de CSV, colunas pelos cabeçalhos em português, prévia linha a
  linha sem gravar, confirmação com o sha256 do mesmo arquivo, reimportação idempotente, relatório; modelos para
  baixar. **Agenda no celular** (.ics por endereço secreto, só o hash no banco, trocar e desligar; diárias, escala,
  prazos, aprovações e retornos, só o que a pessoa vê; passos para iPhone, Google e Outlook). **Acesso por cliente**
  (Ajustes → Pessoas: equipe e leitura restritas a alguns clientes, regra no banco em toda tabela ligada a cliente e
  nas funções do Quadro e da revisão). Resumo do dia para a Z (`POST /api/zro/maestro/resumo`, pedido assinado como
  o Drive da Z; ligado em 29/10/2026, item abaixo). Mapa em
  [maestro-z.md](integration-contracts/maestro-z.md). Demonstração com o funil inteiro, retornos, contatos e metas.
- ✅ **Z lendo o Maestro** (autorização do titular, 28/10/2026; item 5, só leitura): ferramenta `ver_maestro` na Z do
  HUB (`packages/core/src/ia-maestro.ts`), só com o Maestro aberto (gate, hoje o titular) e no plano; pedido assinado
  `zro-pedido+jwt` (`aud` `maestro-web`, ação `maestro.resumo`, 60 s, `jti` novo); fonte e hora em toda resposta,
  dinheiro só quando o Maestro manda (administração e gestão); auditoria `ia.maestro.leitura`. No Maestro, a lista
  `ACOES_ABERTAS` aceita só `maestro.resumo`. Sem variável nova obrigatória.
- ✅ Maestro, contrato junto com o orçamento (29/10/2026; estudo MakersHub item 4, "Escreva" do titular): modelo base
  de "Contrato de prestação de serviços audiovisuais" em português com `{{variáveis}}` e todos os números configuráveis
  (revisões, multas, prazos, licença, foro), Ajustes → Contrato com chips, prévia ao vivo, versões só de inclusão e
  restaurar; "Enviar contrato junto" por orçamento; em `/o` o cliente informa CPF/CNPJ e endereço, escolhe o portfólio e
  aceita, e fica o registro imutável (HTML + sha256 conferido pelo banco, hora, IP em HMAC, navegador) com PDF pelo
  navegador para os dois lados; links no orçamento, projeto e cliente; demonstração com um aceito. Migração `0020` do
  Maestro. "Modelo base; revise com um advogado" e "aceite eletrônico, não ICP-Brasil" na tela. Falta: revisão
  jurídica do texto pelo titular; assinatura com certificado (paga) só com nova decisão.
- ✅ Maestro com a sua marca, fase 20 (29/10/2026; "pode aplicar" do titular): o logo no timbrado e nas páginas do
  cliente segue grátis; o app inteiro com o logo e a cor da produtora e só "Powered by Absolute ZRO" é o adicional
  R$ 89,90/mês ou R$ 899/ano, incluído no Pro. HUB: migração `0025` (planos `maestro-marca-propria`/`-anual` e Pro v2,
  **em rascunho** até o titular revisar os preços; o adicional dá só o sinal, nunca a ferramenta), claim nova
  `zro_features` (só os sinais do produto do app, com o gate). Maestro: sinal em `organizations.zro_features`, shell com
  a marca, acento com 3:1 no claro e no escuro, páginas do cliente sem a marca do Maestro, cartão "Disponível no Pro ou
  como adicional" com link para os planos. Falta: o titular revisar e publicar os planos no console (e conceder o sinal à
  organização dele para testar: Concessão, produto Maestro, limite `maestro.marca_propria` = 1); domínio próprio
  depois, com autorização.
- ⬜ Maestro, do mesmo estudo e à espera do titular: a Z **escrevendo** no Maestro (criar
  pedido, despesa, marcar contato, sempre com a ação exata e o "sim"; cota e plano da Z); sincronia de duas vias com o Google Agenda (OAuth); eventos
  `maestro.pedido.ganho`, `maestro.orcamento.aceito` e `maestro.projeto.criado` no HUB (desenho no mapa).
- ⬜ Maestro v2, depois: kits e modelos de projeto, etiquetas QR e manutenções do inventário, PDF gerado no servidor
  (hoje é a impressão do navegador), domínio próprio da produtora, retenção configurável dos
  pedidos, ligar o inventário do Carro do Freela quando ele tiver banco (endpoint assinado no Maestro e a rota sai de
  `DISABLED_ROUTES`).
- ✅ Maestro, versão colada na ficha do card (29/10/2026, pedido do titular): o bloco "Versões" abaixo do Briefing
  lista v1, v2… (fonte e link para abrir) e cola o próximo link (Enter ou "Adicionar") pelo mesmo caminho do lote
  (`useNovaVersao` → `novaVersaoAcao` → `maestro.versao_criar`; mesmas fontes, mensagens e papéis; leitura vê sem o
  campo). O lote que tem o card já mostra a versão. Apagar versão continua sem tela (nem no lote).
- ✅ Maestro, nada cortado no iPhone (29/10/2026; relato do titular no lote de Aprovações): detector de corte
  (`e2e/corte.ts`) e `e2e/sem-corte.spec.ts` em todas as telas a 375 e 393 px, claro e escuro, Chromium e WebKit
  (Safari); faixa com rolagem de lado só com `data-rolagem` e ponta esmaecida enquanto há mais; no lote, CSV/EDL/Fechar
  em três colunas iguais, peças quebrando linha, o link da versão na linha inteira com os botões embaixo; no toque o
  `<video>` fica sem a barra nativa (o transporte do Maestro controla; o tempo dela pisava no timecode do quadro).
- ✅ Maestro v2, fases 7–10 (29/10/2026; decisões do titular de 28/10): **ponte com o SOBEDESCE** pelo HUB
  (`POST /api/v1/apps/pedidos` assina um `zro-pedido+jwt` e o próprio Maestro chama o SOBEDESCE; lista fechada, 403
  sem o SOBEDESCE no plano, limite e auditoria nos dois lados); ações novas no SOBEDESCE `drive.listar`,
  `drive.miniatura`, `drive.pasta.criar`, `drive.compartilhar_revisao`, `drive.recolher_revisao` e `drive.token`
  (`auditoria_zro`, migração 0015); contratos em `packages/media-contracts/src/ponte.ts` e
  [maestro-sobedesce.md](integration-contracts/maestro-sobedesce.md). **Drive na revisão**: a equipe toca a versão do
  Drive num `<video>` pelo service worker do Maestro (Range, tempo e timecode de verdade, até arquivo privado) e
  "Escolher no Drive" no formulário da versão; o link do cliente liga "qualquer pessoa com o link" e revogar, fechar
  ou vencer (Vercel Cron diário, `CRON_SECRET`) desliga. **Arquivos** (`/app/arquivos`, só com o SOBEDESCE no plano;
  cadeado e "Ver planos" sem ele): o navegador do Drive da aba do SOBEDESCE (núcleo extraído para
  `packages/drive-web`, que o SOBEDESCE passou a usar), prévia de vídeo, imagem e PDF, "Abrir no SOBEDESCE",
  "Estrutura no Drive" por projeto e ligar pasta a projeto (migração 0019). Falta: upload pelo Maestro
  (`drive.enviar`), raiz do Drive compartilhado da organização em Ajustes, proxy 720p automático para ProRes.
- ✅ Maestro para computador (29/10/2026, pedido do titular; `products/maestro/desktop`,
  [README](../products/maestro/desktop/README.md)): Electron no Mac e no Windows com a moldura do Absolute ZRO para
  computador (barra própria no Mac, papel claro do Maestro, menu em português, memória da janela, uma instância,
  `maestro://`, "Sem conexão" local) e o ícone oficial. Na janela só o Maestro, as telas de entrar da Absolute ZRO e o
  Google; links do cliente (`/a`, `/o`, `/p`) e o resto vão para o navegador. Login único pelo próprio site, cookies
  guardados. "Nova versão do Maestro" com Atualizar (motor compartilhado com o hub-desktop, que ganhou o nome do app
  como opção) pela Absolute ZRO: `/baixar/app/maestro/{versao.json,mac,windows,<arquivo>}` com o gate do canal
  download; Maestro em `APPS_DESKTOP` (central) e em `DOWNLOADS` (`/baixar`), escondido enquanto fechado.
  `.github/workflows/maestro-desktop.yml` publica no Release de teste `maestro-versao-de-teste` (SHA-256,
  `versao.json`, três últimos builds). Falta: primeiro build no GitHub (sai no próximo push na main), instalar num Mac e
  num Windows de verdade, assinatura/notarização da Apple e certificado da Microsoft (decisão e conta do titular).
- ✅ Maestro, **colunas do Quadro como no Trello** (pedido do titular, 29/10/2026; `drizzle/0024_colunas.sql`): cada
  produtora renomeia no lugar (clique duplo no cabeçalho; no celular, tocar na aba já escolhida), recolore (paleta de
  12 tons da Aurora), reordena (arrastar o cabeçalho; no celular, segurar a alça 280 ms na folha) e cria colunas
  ("Captação", "Color"); a folha "Editar colunas" junta tudo, com arquivar perguntando para onde vão os cards,
  arquivadas para restaurar e "Restaurar padrão". As 8 do método são de sistema (id = papel, cadeado com o porquê,
  nunca arquivam): a aprovação do cliente, o Hoje, a agenda e a Z seguem pelo id, nunca pelo nome; as novas contam
  como "em produção". Só administração e gestão mudam (RLS + funções `maestro.coluna_*`); organizações existentes
  ficam com as 8 de hoje. Falta: aplicar a 0024 em produção (vai junto com o próximo deploy autorizado do Maestro) e
  conferir num iPhone de verdade.
- ✅ Maestro, **arrastar o card no computador sem "travadinha"** (vídeo do titular no Safari do Mac, 29/10/2026): o
  arrastar nativo do HTML saiu dos cards; o mouse usa o mesmo gesto do celular (`src/components/quadro/arrastar.ts`):
  fantasma do tamanho real com camada própria seguindo o mouse só com `translate`, os outros cards abrem espaço com
  `transform` (zero render do React e zero layout por quadro), o lugar de soltar não pisca mais (o `dragleave` sem
  `relatedTarget` do Safari apagava e redesenhava tudo), e ao soltar o card pousa de onde foi solto, inteiro (a coluna
  não corta mais, e o card que troca de coluna não "chega" de novo invisível). Esc e soltar fora devolvem; Entregue
  recebe no topo; "reduzir movimento" vai direto. A volta de 5 s e a página renovada depois de gravar não redesenham
  mais o Quadro inteiro. Falta: conferir no Safari de um Mac e num iPhone de verdade depois do próximo deploy autorizado.

- 🟡 **Lançamento do Maestro em Beta grátis** (29/10/2026, decisão do titular, [ADR 0027](decisions/0027-lancamento-maestro-beta-gratis.md);
  pronto no ramo, vale no OK final): migration `0027_maestro_lancamento.sql` (gate `public_beta` em todos os canais; o
  Maestro inteiro no grátis, no Completo e no Pro com os créditos do plano; Pro v2 em rascunho abre o Maestro e mantém
  a marca própria; o grátis nunca leva o sinal; entitlements das contas atuais, idempotente). HUB: "Conheça de perto"
  com o Maestro no MacBook e no iPhone (`produto-maestro-*.webp`), `/baixar` com navegador e Tela de Início, a Z
  sabendo que é Beta grátis; o fluxo só mostra quem manda evento. PWA do Maestro (manifesto, ícones do ícone oficial,
  `apple-touch-icon`, metas do Safari, "No celular, como app." em Ajustes e na página inicial). Página inicial lançada
  (Beta grátis, "Criar conta grátis", "Entrar com Absolute ZRO", app de computador só com instalador publicado) e o
  Maestro nas listas da família de SOBEDESCE, Synquei, TPeasy, NOSSOM, AEON, Revela e Carro do Freela, tudo atrás de
  chaves que viram juntas (`node scripts/lancamento-maestro.mjs --abrir`; checklist e reversão em
  [docs/operations/lancamento-maestro.md](operations/lancamento-maestro.md)). Falta: o OK do titular, publicar cada
  app e o app de computador do Maestro entrar na central (`APPS_DESKTOP`) quando tiver Release.
- ⬜ Maestro, pendente do titular: ciência dos serviços abertos da calculadora; criar a chave de API do Google só do
  Maestro (restrita à Drive API e a `maestro.absolutezro.com`) e pôr em `MAESTRO_GOOGLE_API_KEY` na Vercel; pôr
  `CRON_SECRET` no projeto `maestro` da Vercel (agendamento que desliga o compartilhamento de revisão vencido).
  pedidos, ligar o inventário do Carro do Freela (o banco e a fila do Carro existem desde 29/10/2026; falta o endpoint de
  entrada no HUB, o endpoint assinado no Maestro e a rota sair de `DISABLED_ROUTES`).
- ⬜ Maestro v2, fase 7 em diante (plano): ponte com o SOBEDESCE (Drive com permissão temporária e stream da equipe).
  Pendente do titular: ciência dos serviços abertos da calculadora; criar a
  chave de API do Google só do Maestro (restrita à Drive API e a `maestro.absolutezro.com`) e pôr em
  `MAESTRO_GOOGLE_API_KEY` na Vercel.

## Conexões: Google Agenda conectado uma vez na conta (29/10/2026, [ADR 0026](decisions/0026-conexoes.md))

- ✅ `/conexoes` na central da conta (menu Conta e seções da conta): Google Agenda (conectar, conta, agendas que contam
  como ocupado, "Usado por" com interruptor por app, desconectar com revogação no Google) e Google Drive (caminho para o
  SOBEDESCE). Estados vazio, conectado, reconectar, cancelado/permissão desmarcada e indisponível.
- ✅ OAuth no servidor (PKCE S256, state e nonce em cookie cifrado, `access_type=offline`, `prompt=consent`) e tokens
  cifrados (AES-256-GCM, HKDF de `ZRO_CONEXOES_KEY`) em `zro.conexoes`/`zro.conexao_apps` (migration `0026`, RLS por
  pessoa). Renovação no servidor; `invalid_grant` vira "conectar de novo".
- ✅ API `/api/v1/agenda/{conexao,livre-ocupado,eventos,eventos/{app}/{ref}}` com o escopo de família `zro.agenda`
  ([contrato](integration-contracts/agenda.md)).
- ✅ Maestro: diárias, entregas, reuniões e prazos no Google de quem liga (caixa de saída `drizzle/0021`), "Ocupado no
  Google" ao marcar diária e Ajustes → Agenda.
- ⛔ Em produção: `ZRO_CONEXOES_KEY` no projeto `absolutezro` (titular) e as migrations `0026` (HUB) e `0021` (Maestro) no
  deploy. Não testado contra o Google de verdade (aviso de app não verificado esperado).
- ⬜ Z, "Hoje" do HUB e Carro do Freela pelo mesmo contrato.

## Custos do ecossistema no console (29/10/2026, [ADR 0028](decisions/0028-custos-do-ecossistema.md))

- ✅ `/admin/custos` (só papel admin; suporte recebe 404 e não vê a seção): custo por mês hoje e por ano em R$ e US$
  (anual ÷ 12 no mês, por uso à parte como "+ uso"), cotação do dólar editável com data, rosca por categoria, barras por
  fornecedor, projeção de 12 meses (ativo, previsto e futuro pelo mês estimado), ponto de equilíbrio com os planos
  publicados e a receita real das assinaturas pagas, metas (receita, assinantes, data-alvo) e recomendações por regra.
- ✅ Lista por estado com filtros, folha para criar, editar e apagar (com confirmação) e planilha CSV. Tudo auditado.
- ✅ Migration `0028_custos.sql` (`zro.custos`, `zro.custos_config`, sem acesso para `zro_app`) com os 12 itens que o
  titular listou; o que não foi confirmado entra com valor 0 e "a conferir".
- ⛔ Titular: informar a cotação do dólar e as metas no console e conferir os itens marcados "a conferir" (API da Z,
  Vercel uso, Stripe, RunPod, avaliação CASA, Resend, domínio). Migration `0028` sobe no próximo deploy autorizado.
- ⬜ Contagem de quem conectou o Drive (mora no SOBEDESCE) para o gatilho da avaliação CASA, se o SOBEDESCE expuser.

## Automáticos: dólar nos Custos e combustível no Maestro (29/10/2026)

- ✅ **Dólar automático** (HUB, migração `0030`, adendo ao [ADR 0028](decisions/0028-custos-do-ecossistema.md)): PTAX de
  venda do Banco Central (Olinda, sem chave), com volta ao último dia útil; agendamento diário `GET /api/cron/dolar`
  (Vercel Cron 13h23 de Brasília, `CRON_SECRET`) e a própria página quando a busca passou de 24 h (depois de responder).
  "Dólar hoje R$ 5,34 · Banco Central, 28/10"; falha mantém o último valor com a data; "Usar valor manual" e "Voltar ao
  automático" auditados. Metas em folha própria.
- ✅ **Combustível automático** (Maestro, `drizzle/0022`): a calculadora de deslocamento escolhe gasolina, etanol ou
  diesel S10 e já vem com o preço médio da semana da ANP no município da produtora (Ajustes → Empresa), senão no
  estado, senão no Brasil, escrito "Preço médio da semana em Natal/RN · ANP, semana de 18/10". Mostra R$ por km e o
  total; preço digitado vale para aquele combustível naquele orçamento (no aparelho); consumo de partida por
  combustível sem veículo no inventário. Agendamento semanal `GET /api/cron/combustivel` (sábado 10h41 de Brasília,
  `CRON_SECRET`) guarda a planilha semanal (municípios, estados e Brasil; 8 semanas, ~12 mil linhas) em
  `maestro.combustivel_precos` (só leitura para `maestro_app`); coleta de reserva se o agendamento atrasar. Orçamento
  salvo não muda. Photon e OSRM continuam desligados (`MAESTRO_SERVICOS_ABERTOS`).
- ⛔ Em produção: `CRON_SECRET` no projeto `absolutezro` (o do `maestro` já existe), migrações `0030` (HUB) e `0022`
  (Maestro) no próximo deploy autorizado. Primeira semana da ANP entra no primeiro sábado ou na primeira abertura da
  calculadora.
- ✅ **Deslocamento sozinho** (Maestro, pedido do titular 29/10/2026, sem migração): Photon e OSRM **ligados**
  (`MAESTRO_SERVICOS_ABERTOS=0` desliga); o texto digitado vira lugar sozinho (cidade com o mesmo nome, capital em
  empate, UF dita; ao sair do campo, no Enter ou quando só uma cidade casa) e a dica diz o que foi entendido
  ("São Paulo/SP"); a rota preenche "Km de uma ida" ("Pela estrada · ≈ 40h45 de carro"), km digitado vale com "Usar o
  da rota". O preço do litro vem da **cidade de saída** (onde se abastece; senão a da produtora), município → estado →
  Brasil, também com nome digitado sem acento/UF; sem semana guardada, pergunta de novo uma vez (coleta de reserva).
  Veículos de partida (Compacto, Sedã, SUV compacto, SUV médio, Picape compacta, Picape diesel, Van, Micro-ônibus,
  consumo de estrada por combustível; `src/lib/orcamento/veiculos.ts`) junto com os do inventário; consumo segue
  digitável.

## Perfil profissional com @ (29/10/2026, [ADR 0029](decisions/0029-perfil-profissional-arroba.md))

- ✅ Toda conta é um perfil do audiovisual com @ único (migração `0029`): escolhido na conversa de criar conta (sugestão
  do nome), sugestão para quem já tinha conta, troca 2×/mês com o @ antigo levando ao perfil por 90 dias, reservados
  recusados. Funções (lista fixa + Outra), cidade, portfólio, bio, selos dos apps que a pessoa usa e liga. Sem e-mail
  nem telefone.
- ✅ Visível na busca por padrão, com "Aparecer na busca" em Sua conta › Perfil profissional e o aviso único na central
  (Entendi / Esconder meu perfil). Página `/pessoas/@fulano` (só logado; @ antigo redireciona).
- ✅ Equipe: um campo "@fulano, nome ou e-mail" com as fichas e "Convidar" (convite por @ sem mostrar o e-mail; e-mail
  exato para quem escondeu), "Convites para você" com Aceitar/Recusar e o balão no menu, e cada pessoa com um menu só
  (papel marcado + "Remover da equipe…" com confirmação).
- ✅ Apps: `preferred_username` no login único e o escopo de família `zro.pessoas` para `/api/v1/pessoas/{busca,@arroba,convites}`
  ([contrato](integration-contracts/pessoas.md)): `authorize()`, limites, auditoria sem o texto buscado.
- ✅ Maestro: busca e convite pelo @ em Ajustes › Pessoas, o @ e a "Função na produtora" de cada pessoa, e "Achar pelo @"
  em Freelas (freela ligado ao perfil, `drizzle/0023`). Carro do Freela: o @ no `/eu` e em "Meu perfil".
- ⛔ Em produção: migrações `0029` (HUB) e `0022` (Maestro) no deploy; o Maestro passa a pedir `zro.pessoas` (HUB sem a
  0029 cai em `nivel=sem_pessoas`, sem quebrar o login).
- ⬜ Inventário do Carro no freela achado pelo @ (pronto atrás de `CARRO_SYNC_ATIVO`, desligado).

## Maestro · Criação: núcleo do Roteiro (F1, 29/10/2026)

- ✅ Modelo único do roteiro (cenas → blocos: fala on/OFF/sonora/passagem com pessoa, ação, plano, lettering
  GC/título/legenda/CTA/legal, áudio trilha/efeito/BG/silêncio, observação, nota interna), tempo estimado (150 palavras
  por minuto, regra de contagem do TPeasy) e alvo. Vistas puras: Literário, Técnico, Teleprompter (marcação e backup do
  TPeasy, id estável por pessoa), Edição, Markdown e dados da impressão. 6 modelos só com dica cinza. Documento antigo
  (roteiro/decupagem) abre no editor novo sem mudar o antigo. Junção por id no conflito de `rev`.
- ✅ Banco: `drizzle/0030_roteiros.sql` (`roteiros`, `roteiro_versoes` só de inclusão com sha256 conferido), RLS por
  organização e por cliente, papéis provisórios até a área `criacao` do acesso por área. O migrador do Maestro passa a
  aplicar migração que entra fora de ordem (0025–0029 de outras frentes depois da 0030).
- ✅ F3 (enviar: TPeasy, edição, roteiros na ficha do card), 30/10/2026: seção própria abaixo.
- ⬜ F5 (Fluxo), F7 (aprovação pelo `/a`).
- ⛔ Em produção: migração `0030` do Maestro no próximo deploy autorizado.

## Maestro · Criação: editor do Roteiro (F2, 29/10/2026)

- ✅ "Criação" no grupo Produção (computador) e em Mais (iPhone; a barra de baixo não muda). `/app/criacao`: roteiros
  em cartões (vínculo, duração contra o alvo, estado, quando mudou), "Novo roteiro" com os 6 modelos, vínculo a
  projeto/card e "Literário ou Técnico primeiro?"; seletor Roteiros · Fluxos (desde a integração, Fluxos é a lista de verdade).
- ✅ Editor `/app/criacao/roteiros/<id>`: Literário · Técnico (células editáveis, colunas escondíveis) · Teleprompter
  (prévia no preto, por pessoa) · Edição (deixas em ordem de tempo). Teclado: Enter, Tab/⇧Tab, "/", ⌘1–6, "@",
  ⌘⇧Enter, ⌥↑/⌥↓, ⌫. Grava sozinho (600 ms, `rev`, junção por id no 409, aviso "mudou ao mesmo tempo" com "Ficar com o
  meu"), poll de 5 s, medidor contra o alvo, versões (salvar com nota, comparar por bloco, restaurar), folha A4 pelo
  `dadosImpressao`. iPhone: uma cena por vez, "+" com os tipos em ícones grandes, segurar 280 ms para arrastar.
- ✅ Projeto: seção "Roteiros" e "Novo"; roteiro e decupagem antigos com "Abrir no editor novo" (o antigo fica; os
  dois tipos deixam de nascer pelos chips de Documentos). Demonstração com o roteiro institucional e a v1.

## Maestro · Criação: saídas do Roteiro (F3, 30/10/2026)

- ✅ "Enviar ▾" é a ação principal do editor para administração e gestão ("Salvar versão" ao lado e no menu; no iPhone,
  o ícone no topo abre a folha). Tudo sai de uma **versão salva**: sem versão ou com o rascunho mudado, a folha oferece
  salvar a próxima ou usar a última. Cada envio vai para a auditoria (`roteiro.enviado`: versão, sha256, destino,
  formato, pessoa) e aparece em "Últimos envios".
- ✅ TPeasy: só as falas, por pessoa; Compartilhar (folha do sistema, com o `.txt` quando dá), Copiar, `.txt` (o nome vira
  o título no TPeasy) e o backup do TPeasy (id estável, hora da versão: a versão nova atualiza o mesmo roteiro lá). "Compartilha
  o texto pronto", nunca "sincroniza".
- ✅ PDF para a edição (folha A4 na vista Edição: cenas com tempo, lettering, áudio e falas) e PDF Literário, Técnico ou
  Teleprompter, sempre de `?versao=n`.
- ✅ Contrato `maestro.roteiro/1` em `packages/media-contracts` ([maestro-roteiro.md](integration-contracts/maestro-roteiro.md),
  schema e exemplo gerado pelo Maestro). A opção do arquivo (AEON) **só aparece com o AEON aberto para a pessoa** (gate
  do HUB, `zro_release["ai-edit"]`); hoje fechado, ninguém vê. O AEON ainda não importa (F8b).
- ✅ Ficha do card: bloco "Criação" com os roteiros ligados (título, versão, duração, estado) e "Novo roteiro" já ligado.
- ✅ Permissões da Criação pela capacidade `criacao` (ver/editar/enviar) do acesso por área (`podeCriacao`).
- ⬜ Cliente aprovar (F7, fora do menu até lá); TPeasy lendo direto do Maestro (F8a); AEON abrindo o arquivo (F8b). Sem
  migração nova.

## Maestro · Criação: núcleo do Fluxo (F4, 29/10/2026)

- ✅ Banco: `drizzle/0031_fluxos.sql` (`fluxos`, `fluxo_nos` com nota/imagem/link/roteiro/card/seção, `fluxo_ligacoes`,
  `fluxo_imagens`), RLS por organização e por cliente (o fluxo segue o projeto/card; o solto some para quem é restrito),
  `rev` por nó e por ligação, lápide em vez de apagar, limites de 2.000 nós e 4.000 ligações por fluxo.
- ✅ Servidor (`src/lib/criacao/fluxo`): operações em lote com conflito por item, "o que mudou desde" para o poll de
  5 s, referências vivas a roteiro e card ("sem acesso" sem título), imagens em WebP ≤ 400 KB + miniatura, sem
  metadados, com cota por produtora (200 MB) e por fluxo (300) conferida no banco, rota autorizada
  `/api/criacao/img/<id>/<sha>`. Link colado reconhecido pelo endereço (YouTube, Vimeo, Drive), sem buscar nada.
  Markdown e JSON `maestro.fluxo/1` para "Copiar para IA" (sem endereço de imagem sem o link da F6).
- ✅ F5 (canvas, abaixo). ⬜ F6 (exportar, link privado `/f`).
- ⛔ Em produção: migração `0031` do Maestro no próximo deploy autorizado. A cota de 200 MB depende do plano do
  Supabase `AbsoluteZRO` (conferir com o titular).

## Maestro · Criação: o canvas do Fluxo (F5, 29/10/2026)

- ✅ `/app/criacao/fluxos` (cartões, "Novo fluxo", lixeira) e `/app/criacao/fluxos/[id]`: canvas infinito feito à mão
  (DOM + SVG, sem tldraw), grade de pontos, andar e aproximar (trackpad, ⌘/Ctrl + roda, pinça), laço e ⇧, mover,
  redimensionar, seções coloridas que levam o que está dentro, ligações puxadas da bolinha com rótulo opcional, apagar
  com Desfazer/Refazer, cores, duplicar, setas e atalhos; barra de vidro (Selecionar · Nota · Imagem · Link · Seção ·
  Ligar · Roteiro · Card) e o zoom no pé.
- ✅ Colar é o gesto principal: imagem sobe com progresso e mensagem de cota, link vira nó (YouTube/Vimeo/Drive pelo
  endereço, sem buscar nada), texto vira notas, link de roteiro/card do Maestro vira referência viva; soltar arquivo
  também. Gravação otimista em lote (`aplicarOps`), conflito por item, poll de 5 s que não mexe na vista.
- ✅ iPhone: segurar 280 ms ergue o nó, pinça, "+" com a folha Adicionar (Foto, Imagem, Link, Nota, Seção, Roteiro ·
  Card) e a Lista por seção; a barra Hoje · Quadro · Aprovar · Mais fica. Quem só lê anda e lê. Claro e escuro,
  reduzir movimento.
- ✅ Entrada "Criação" na navegação e o seletor Roteiros · Fluxos (integração, abaixo); Exportar (F6).

## Maestro · Criação: exportar e compartilhar o Fluxo (F6, 30/10/2026)

- ✅ Menu **Exportar** no canvas (popover no computador, folha no iPhone): Copiar para IA (Markdown; imagens pela
  legenda, ou pelo link quando há um sem PIN e a pessoa marca "Imagens pelo link"), Criar link / Links, Mandar para um
  card, Baixar pacote (.zip com `fluxo.md`, `fluxo.json` e `imagens/`, montado no servidor e enviado aos pedaços), JSON
  (`maestro.fluxo/1`) e PDF (a Lista com CSS de impressão). "Privado" / "Link ativo" no topo.
- ✅ Link privado (decisão do titular): migração `0032` do Maestro (`fluxo_links`: só o sha256 e a cópia cifrada do
  token, 1 a 30 dias com 7 por padrão, PIN scrypt opcional, revogar para sempre, até 10 vivos, visitas, audit de criar e
  revogar), só administração e gestão. `/f/<token>` só de leitura (a Lista), `/f/<token>.md` e `.json`, imagens pelo
  token; noindex, `X-Robots-Tag`, `no-referrer`, CSP própria, fora do robots.txt, limites por link e IP. Referência a
  roteiro/card: só o título, e só do que quem criou alcançava. App de computador abre `/f` no navegador.
- ✅ "Mandar para um card" liga o fluxo ao card; o bloco "Criação" da ficha do card mostra o fluxo.
- ⛔ Em produção: migração `0032` do Maestro no deploy (com autorização).
- ⬜ PNG do canvas; criar card novo em Pauta a partir do fluxo.

## Maestro · Criação: o cliente aprova o roteiro (F7, 30/10/2026)

- ✅ "Enviar ▾ › Para o cliente aprovar" (administração e gestão, `podeCriacao(…, 'enviar')`): de uma versão salva, a
  versão vira **mais uma peça do link de aprovação do card** (`/a`; decisão do titular nº 4, nada de segundo sistema).
  Sem card, a folha liga um; sem lote aberto, nasce o lote do cliente do card; sem link, o link nasce; copia o link.
  Mandar a mesma versão de novo devolve a mesma peça e o mesmo link.
- ✅ No `/a`: o roteiro na vista Literário (montada no servidor: sem nota interna, plano, observação, dica, ids nem a
  nota `((…))` da fala), versão e duração; tocar num trecho comenta nele; Aprovar / Pedir ajuste com nome e hora como
  as outras peças. Token, PIN, validade e limites de sempre (nenhuma rota pública nova).
- ✅ No editor: o comentário embaixo do bloco (id estável: o da v1 continua no mesmo trecho da v2), resolver/reabrir,
  o número em aberto no topo e a folha "Cliente" com as decisões; o estado vira "Com o cliente" / "Aprovado" /
  "Ajustes pedidos" sozinho e aparece na ficha do card; versão nova troca a peça (a volta sobe) e os comentários
  antigos ficam na versão deles; auditoria `roteiro.enviado` (destino cliente) e `roteiro.decisao`.
- ✅ Migração `0033` do Maestro (`versoes.fonte = 'roteiro'` + `roteiro_versao_id` sem URL, `comentarios.bloco_id`,
  `maestro.roteiro_para_cliente`, gatilho em `approvals`, `link_abrir`/`link_comentar` com o roteiro e o bloco).
- ⛔ Em produção: migração `0033` do Maestro no próximo deploy autorizado.
- ⬜ Resposta da equipe dentro do trecho (hoje a equipe resolve; a conversa segue no lote); vista Técnico para o cliente.

## Maestro · Criação: Roteiro e Fluxo num produto só (30/10/2026)

- ✅ Uma entrada "Criação" (Produção no computador, Mais no iPhone) com o seletor **Roteiros · Fluxos**: duas rotas
  irmãs com o mesmo título (`/app/criacao` e `/app/criacao/fluxos`); o "em breve" saiu e o `?aba=fluxos` antigo leva à
  lista de fluxos. Sem entrada repetida.
- ✅ Ficha do card: um bloco **Criação** só, com os roteiros (versão, duração, estado) e os fluxos (itens) ligados, num
  pedido só, e "Novo roteiro" já ligado. Quem só lê vê a lista; sem nada ligado, o bloco some para quem só lê.
- ✅ Permissões: Roteiro e Fluxo pela mesma capacidade `criacao` (`podeCriacao`, ver/editar/enviar); as políticas da
  0030, 0031 e 0032 usam os mesmos papéis (o `roteiro.test.mts` e o `fluxo.test.mts` conferem).
- ✅ Migrações do Maestro na ordem do journal: 0027 (acessos), 0030 (roteiros), 0031 (fluxos), 0032 (links do fluxo),
  `when` únicos; o migrador aplica as fora de ordem (`migrador.test.mts`).
- ⛔ Em produção: 0027, 0030, 0031 e 0032 do Maestro no próximo deploy autorizado.

## Relay: conversão de mídia como setor próprio (29/10/2026, [ADR 0030](decisions/0030-relay-conversao.md))

A Revela fica só com a cor (looks, espaço de cor, LUT e PowerGrade). Codec, contêiner e formatos de vídeo e áudio vão
para uma plataforma nova, vendida sozinha e chamada pelas outras.

- ✅ Mapa do que já converte no ecossistema (Revela, SOBEDESCE, AEON, NOSSOM) e a divisão entre os setores, na ADR.
- ✅ Nome: **Relay** (`relay`, relay.absolutezro.com), aberto. Contrato de integração por plataforma em
  [integration-contracts/relay.md](integration-contracts/relay.md).
- ✅ Relay de pé em `products/relay/` (29/10/2026): identidade (o relé: trilho, sinal menta → limão e o anel do O;
  guia em `marca/`), página inicial com o relé ligando e as entradas na rolagem, conversor com 16 destinos (23 desde 29/10: TV, LinkedIn, X, Slides, Vídeo de fundo) com fonte e
  data, vários destinos e arquivos de uma vez, ficha técnica de cada saída, presets da pessoa ("Meus", editor com a
  ficha ao vivo, levar e trazer em `.relay.json`) e tamanho máximo que escolhe a resolução. 38 testes (unidade, ffmpeg
  e Chromium de verdade). ⛔ Projeto Vercel `relay` e domínio pedem autorização do titular.
- ✅ Qualidade medida contra uma referência x264 no mesmo tamanho (`npm run qualidade`,
  [QUALIDADE](../products/relay/docs/QUALIDADE.md), interno): no computador, empata; no navegador, Lanczos e YUV
  BT.709 na placa, cor do ProRes corrigida e 10 bits arredondados. O Chromium do Linux (OpenH264) fica abaixo do x264.
  Falta: medir em Mac (VideoToolbox), Windows e iPhone reais.
- ✅ Liberado aos usuários junto com o Maestro (29/10/2026, decisão do titular, sem e-mail): `RELEASE=released` no
  projeto Vercel `relay` e a migration `0032` (produto ativo, gate web). Site sem "grátis" no texto (posicionamento da
  marca, como a página inicial do HUB).
- ✅ Comparativo com outros conversores fora do público (pedido do titular): sem a página de qualidade, sem citar marca
  em texto ou código; o laboratório interno mede contra uma referência x264.
- ✅ Laboratório de aparelhos (`/laboratorio`, só nas prévias da Vercel e no `npm run dev`): cenas geradas no aparelho,
  codificadas pelo chip dele e medidas contra a referência x264 no mesmo bitrate. ⬜ Rodar no Mac, iPhone e Windows do
  titular e ajustar os bitrates por aparelho.
- ✅ Máxima qualidade: no Mac e no Windows, o Relay abre o app SOBEDESCE pelo link `sobedesce://relay` com os destinos
  (inclusive os da pessoa); o app converte arquivos do computador com o x264 e salva ao lado do original.
- ✅ SOBEDESCE: "Converter com o Relay" no computador e no celular, com o núcleo do Relay copiado e conferido por teste
  dos dois lados; a Revela sai do SOBEDESCE.
- ✅ HUB: produto `relay` no catálogo (migration `0031`, incluído em todo plano, fechado pelo gate), `ProductId`, catálogo
  de integrações e a Z.
- ⬜ Revela tira a aba Converter e aponta para o Relay (na conversa da Revela); AEON e NOSSOM exportam pelos presets do
  Relay; Synquei e Maestro pedem versões pela fila ([contrato](integration-contracts/relay.md)).
- ✅ Presets de TV e formatos específicos (pedido do titular, 29/10/2026): Smart TV (H.264 Full HD a 30 fps, pendrive) e
  Smart TV 4K (HEVC) num grupo TV; LinkedIn e X em Redes; Slides e Vídeo de fundo (sem som) em Trabalho. Entrega para
  emissora (MXF/XDCAM, ProRes, loudness) fica de fora até existir no computador.
- ✅ Leitura com plano B: gravação de tela do Mac recusada pelo navegador ("Este navegador não lê H.264") é tentada de
  outras formas, só vale a que devolve quadro; sem jeito, o erro mostra codec, tamanho e navegador.
- ⬜ Confirmar no aparelho do titular qual navegador recusou a gravação de tela (o detalhe do erro agora diz).
- ✅ Editor de preset completo (pedido do titular, 30/10/2026): cadência exata (23,976 e afins, em fração no ffmpeg),
  recorte, giro e espelho, tela fixa com faixas/preencher/esticar, bitrate constante, qualidade constante (RF), trecho,
  volume em dB, opções do computador (velocidade e ajuste do x264, perfil, desentrelaçar, ruído, nitidez, LUFS) e
  fichas antigas abrindo iguais.
- ✅ Cor da Revela na exportação, no código e desligada até a Revela abrir: receita (log da câmera → Rec.709 + look
  `.cube`) no preset, em lote; CST como conta na placa (não LUT 3D: medido, a LUT erra até ~30/255 em cor saturada).
- ⬜ Revela: looks pela conta (`/api/zro/looks`) e ligar `REVELA=released` no projeto `relay` quando abrir.
- ⬜ Cor da Revela no computador: a mesma conta no ffmpeg e o SOBEDESCE assando a receita (hoje preset com cor fica
  no navegador).
- ✅ Painel da conta (pedido do titular, 30/10/2026): `/painel` com recentes, números, projetos (nome + destinos, abre o
  conversor com eles e as saídas entram no projeto) e meus presets; quem entra cai nele. Topo com a foto da conta e o
  menu (Painel, Sua conta, Sair); a página inicial mostra que a pessoa está dentro ("Seu painel").
- ✅ Painel na conta (autorizado pelo titular, 30/10/2026): schema `relay` + papel `relay_app` com RLS, migrador
  próprio, `/api/relay/painel`, sincronização (o de antes sobe uma vez; sem rede, pendências) e equipe (projetos e
  presets liberados por quem criou, mesma organização, só leitura).
- ✅ Looks (`.cube`) no Drive pelo SOBEDESCE (pedido do titular, 30/10/2026): pasta escolhida no painel do Relay (leva e
  traz, sem gravar por cima) e `sobedesce://looks` abre o Comparar do app com a pasta e o Drive dos looks. Aparece com
  a cor da Revela (`RECURSOS.revela`). ⬜ Sai no app do SOBEDESCE na próxima versão do desktop.
- 🟡 "Escolher no Drive" no Relay (pedido do titular, 30/10/2026): lado do Relay pronto e testado (quadro, leitura aos
  pedaços, "Para o Drive"), atrás de `RECURSOS.drive`. ⬜ Lado do SOBEDESCE (`?no=relay`, modo escolher, `ler`/`enviar`)
  depois do embutido do Carro entrar na main; então `DRIVE=released` no projeto `relay`.
- ⬜ App de computador do Relay e SOBEDESCE gravando no painel (Bearer da conta em `/api/relay/painel`).
- ⬜ Conta excluída na Absolute ZRO apagar o schema `relay` dela (hoje nenhum app recebe o aviso do HUB).
- ⬜ "Baixar como…" das Referências e o pedido da Z no SOBEDESCE pelos presets do Relay.
- ⬜ Computador: ProRes, DNxHR e HDR 10 bits de saída; loudness normalizado; legenda queimada; corte de trecho.
- ⬜ Evento `media.conversion.completed` no HUB, quando a primeira integração passar por ele.

## Maestro: quem vê o quê (29/10/2026, [ADR 0031](decisions/0031-maestro-acesso-por-area.md))

- ✅ Seis áreas sensíveis (Financeiro, Orçamentos e preços, Contratos, Diárias e cachês, Dados da equipe, Valores do
  inventário) com padrão por papel e ajuste por pessoa só da Administração em Ajustes → Pessoas → "O que vê"
  (interruptores, auditado). Regra no banco (`drizzle/0027`: RLS por área, máscara das colunas de dinheiro, gatilhos
  que guardam o valor de antes), na navegação (sem link morto), no Hoje, nas fichas, nas ações e na Z. Mapa em
  `products/maestro/docs/permissoes.md`.
- ⛔ Em produção: migração `0027` do Maestro no próximo deploy autorizado. Avisar quem é Gestão e usa o Financeiro: a
  Administração liga a área (a Gestão não vê o Financeiro por padrão).
- ⬜ Perguntas ao titular: Gestão com Financeiro por padrão? Contato dos freelas separado de CPF/PIX? Restringir
  clientes só com a Administração? Aprovar na tela pedir também o Financeiro?

## Set: presença e conversas (29/10/2026, [ADR 0032](decisions/0032-set-presenca-e-conversas.md))

- ✅ Fase 1, presença (migração `0035_set.sql`): quem da equipe (mesma organização ou projeto) e dos contatos aceitos
  está online e em qual app ("na Absolute ZRO", "no Maestro"; o app vem do token). Invisível com um toque, "Quem vê
  você online" e "Mostrar visto há". Ninguém de fora vê ninguém; e-mail e telefone nunca saem.
- ✅ Fase 2, conversas: direta com quem trabalha junto ou é contato (pedido pelo @ de perfil visível; recusa sem aviso e
  30 dias de espera), e a do projeto canônico para quem vê o projeto, de qualquer app. Não lidas, silenciar, editar
  (24 h) e apagar com a versão anterior só para a moderação (90 dias), bloquear nos dois sentidos, denunciar.
  Limites: 30 mensagens/min, 20 pedidos e 10 denúncias por dia. Exclusão da conta leva os dados do Set.
- ✅ Tempo real sem serviço novo: poll curto com ETag (304 sem corpo) — batida 45 s, estado 12 s com a folha aberta,
  conversa 4 s.
- ✅ Central: "Set" no menu (não é aba principal), pílula discreta na barra de cima (rostos de quem está online e o
  balão), página `/set` (lista e conversa lado a lado; no iPhone a conversa fica com a tela) e "Conversa" na página do
  projeto. Console › Denúncias (admin ou suporte) para resolver.
- ✅ Apps: escopo de família `zro.set` e o widget `<zro-set>` (`/set/v1/zro-set.js`, [contrato](integration-contracts/set.md)).
  Maestro: pílula na cápsula e no topo do celular, repasse `/api/zro/set/*` com o token no servidor (ETag inclusive),
  login pede `zro.set` (HUB antigo: `nivel=sem_set`).
- ⛔ Em produção: migração `0035` no deploy e novo login no Maestro para o escopo `zro.set`.
- ✅ Todas as plataformas (30/10/2026, "a aba em comum com todas as plataformas do ecossistema"): SOBEDESCE (site e
  app do celular), Synquei (site e computador), TPeasy, Relay, Carro do Freela, NOSSOM, AEON e Revela ganharam a
  entrada "Set" na própria navegação (nunca a tela de entrada) que abre a folha do `<zro-set modo="folha">`, o repasse
  `/api/zro/set/*` com o token no servidor e o login com `zro.set` (Absolute ZRO antiga: refaz sem ele). A folha veste
  a identidade de cada app (`--zro-set-*`). Fechados (Carro, NOSSOM, AEON, Revela) seguem o portão: a conta fora da lista
  não vê a entrada e o repasse responde 403. O Relay ganhou um login só para o Set, desligado enquanto o site estiver
  fechado. Tabela em [set.md](integration-contracts/set.md).
- ✅ Integrado com "a Z nunca é a primeira tela" (30/10/2026): a entrada de cada app continua a tarefa, a Z segue
  discreta (só carrega no toque) e o Set tem a entrada dele sem ser a entrada. Barra de baixo do iPhone com no máximo
  cinco itens: no SOBEDESCE (celular), no Synquei (celular) e na Revela o Set foi para o topo, ao lado da Z; TPeasy
  (Roteiros, Teleprompter, Ajustes, Set), AEON (Mídia, Revisar, Edição, Entrega, Set) e NOSSOM (Início, Projetos,
  Estúdio, Conta, Set) mantêm o Set como a última aba; no Carro e no NOSSOM a lateral termina em Set e Z (a Z
  sempre a última); no site do SOBEDESCE o Set fica no cabeçalho, ao lado do anel da Z.
- ⛔ Em produção: cliente `relay-web` no console (para o Set do Relay) e deploy de cada app, com autorização.
- ⬜ App de computador do SOBEDESCE com o Set (o motor local ainda não repassa); aviso fora do app (e-mail/push);
  anexos.
- ⬜ Fase 3, salas abertas da comunidade: com o lançamento do Carro do Freela (novo tipo de conversa, mesma API).

## Laboratório da Z (30/10/2026, [ADR 0033](decisions/0033-laboratorio-da-z.md))

- ✅ Console › **Laboratório da Z** (só o admin da plataforma; suporte e clientes não veem): Testar e Configurar.
  Migração `0036_laboratorio_z.sql` com RLS em todas as tabelas `z_*`.
- ✅ Conversa por voz como a do ChatGPT: mãos livres (Scribe v2 Realtime, VAD) ou segure para falar (Scribe v2),
  resposta do Claude em streaming falada frase a frase (ElevenLabs Flash v2.5 em PCM), barge-in, legenda ao vivo e o
  tempo de cada etapa; modelo escolhido na hora (o da Z hoje ou um mais rápido).
- ✅ A Z é uma mulher: personalidade feminina proposta no rascunho, vozes femininas pt-BR da conta pré-filtradas e o
  Voice Design para criar uma (salva na conta só com confirmação).
- ✅ Ditado no campo (o microfone escreve para editar antes de enviar) e anexos: imagem e PDF nativos no Claude;
  Word, Excel, PowerPoint, texto e CSV lidos no servidor; áudio e vídeo transcritos (e quatro quadros do vídeo).
- ✅ Configurar: personalidade, tom, regras, instrução por plataforma, textos de referência, voz e saudação, modelo e
  tamanho da resposta, teto por dia; versões imutáveis com nota, diferenças, comparar lado a lado e restaurar.
- ✅ Custo de cada chamada (tokens, caracteres, segundos) com teto por dia (sem teto = bloqueado) e o gasto nos Custos.
- ✅ Liberação por plano (voz, ditado, anexos) e "Publicar para os clientes": tudo desligado, ligar pede confirmação e
  fica na auditoria.
- ⛔ Em produção: migração `0036` no deploy e o primeiro teste com as chaves reais (`IA_ANTHROPIC_KEY` e
  `ELEVENLABS_API_KEY`, já na Vercel).
- ✅ Voz robusta (30/10/2026): com a escuta ao vivo recusada (401 no token de uso único, visto em produção com a chave
  restrita), mãos livres segue **por frase**: VAD no navegador (~700 ms de silêncio) e Scribe v2 pelo HUB, com a nota
  "Escuta ao vivo indisponível: usando transcrição por frase", custo e teto valendo. O log diz o código da recusa.
- ✅ Modo voz no iPhone (30/10/2026): nada passa da largura em 375/393/430 px e deitado (coluna `minmax(0, 1fr)`,
  topo em duas linhas, seletor a 16 px sem zoom do Safari, anel e tempos que encolhem); e2e no Chromium e no WebKit.
- ⬜ Para os clientes: voz, ditado e anexos no painel `<zro-ia>` lendo `z_recurso_liberado`, quando os planos forem
  vendidos.

## Fase 6 — Escala

- ⬜ Observabilidade em produção (drain de logs, métricas da fila, alertas), backups e retenção definidos.
- ⬜ Hardening: CSP com nonce, limites de taxa na API, rotação de segredos de webhook, testes de carga.

## Lançamento progressivo — Etapa B do PRD de acesso (28/10/2026)

- ✅ **Gate de lançamento no HUB** ([ADR 0023](decisions/0023-gate-de-lancamento.md), migration 0018): fonte única
  `zro.product_release` + `zro.product_release_access` + `zro.release_allows(produto, pessoa, canal)`; SOBEDESCE,
  Synquei e TPeasy lançados em todos os canais; NOSSOM, AEON, Revela e Carro do Freela fechados (sem linha = fechado,
  então `maestro` nasce fechado). `checkEntitlement`/`productAccessFor`/`authorize` aplicam o gate em nome da pessoa
  e do canal (`product_closed` 403, `access: 'closed'`, `release` por produto); login único não emite código, não
  renova nem aceita token de cliente de produto fechado para conta fora da lista, e os tokens levam `zro_release`;
  a Z chamada de dentro de um app fechado recebe 403 e o guia dela só cita as plataformas abertas; página "Em
  desenvolvimento" (`/em-desenvolvimento/<produto>`, dentro do `/oauth/authorize` e a versão estática em
  `docs/integration-contracts/em-desenvolvimento.html`); console Administração › Lançamento (estado, canais, acesso
  interno por conta escolhida na lista, auditoria); `npm run db:release:revoke` (prévia por padrão) para as sessões
  de antes do gate. Catálogo público devolve `release: { state, canais }` por produto.
- ✅ **Interface do HUB lendo `release`** (28/10/2026): homepage (faixa e "Conheça de perto" com selo "Em
  desenvolvimento" e sem link para os fechados; números, etapas e órbita da Z só com lançados ou liberados para a
  pessoa logada), `/planos` (fechado não aparece como incluído), `/baixar` e `/downloads` (`downloadsLiberados`: fechado
  vira `soon` sem instalador, Terminal nem "Conheça mais"; quem está na lista do canal `download` continua baixando),
  central do computador (`/api/v1/desktop/apps` só com canal `desktop`; `/baixar/app/<id>/…` 404 para fechado), menu
  "Absolute ZRO" montado do catálogo (lançados/liberados), Ferramentas (grupo "Em desenvolvimento" com os `closed`),
  `AppTile`, painel do app, `/inicio` (fechados por último e fora da órbita), Sua conta › Acessos e a gaveta da Z com
  o selo.
- ✅ **Homepage só com a verdade de hoje** (28/10/2026, pedido do titular): "Do roteiro à entrega." no lugar de "Do job
  à entrega." (o job é do Carro do Freela, fechado); números e fluxo só com eventos de produtos abertos; linha do topo,
  do OG e da descrição sem "pessoas" nem "todas as etapas"; Ciclo do O fala das ferramentas lançadas; `/baixar` com o
  selo nos fechados; Maestro em "Conheça de perto" com o ícone (ainda sem foto); `/inicio` só fala de job com o Carro
  aberto; links "Ciclo do O" e "Ferramentas" do menu e do rodapé apontam para seções que existem. Foto dos aparelhos
  (`produto-hub-*`) refeita no HUB local com conta neutra (`scripts/marca/aparelhos/capturar-hub.ts`).
- ✅ **Apps de celular e computador iguais ao web** (28/10/2026): SOBEDESCE (computador `public/` e celular
  `web/public/app`, app 2.8.51 / `sobedesce-app-v66`), Synquei (`app/`, `synquei-v22`) e TPeasy (`app/`,
  `tpeasy-v19`) sem NOSSOM, Revela e Carro do Freela na lista da família; o SOBEDESCE chama a entrada de "conta
  Absolute ZRO" nos dois apps. Falta o titular autorizar os instaladores novos do SOBEDESCE e do Synquei.
- ✅ **SOBEDESCE no Windows: bandeja e barra lateral** (28/10/2026, pedido de cliente): minimizar manda para a bandeja
  (padrão no Windows, ajuste "Minimizar para a bandeja" em Ajustes → Aparência), menu da bandeja com "Abrir SOBEDESCE",
  quantas transferências andam e "Sair"; fechar no X com transferência andando vai para a bandeja. Barra lateral cabe
  em 1280×720 com 125% sem rolagem: aviso de versão vira pílula com balão, a família vira uma linha com balão. Falta o
  titular autorizar o instalador novo.
- ✅ **SOBEDESCE: proxies à vista no lote e números do envio** (29/10/2026, pedido do titular): o cartão fechado de um
  envio com os originais no Drive e os proxies andando diz "Originais no Drive · gerando proxies 3 de 26" (anel no ícone,
  "proxies 3/26" à direita); depois "26 proxies prontos em 18 min" ou "2 proxies falharam · Tentar de novo". Limpar
  concluídas e "Tirar da lista" não tiram lote com proxy pendente nem cancelam o proxy ("1 lote ficou: ainda gerando
  proxies."); a bandeja mostra "Gerando 3 proxies" e fechar o app pergunta antes. Lote terminado mostra "104 GB em 1 h
  12 min · 24,6 MB/s" (média pelo tempo transferindo), gravado em `queue.json` (`batch.stats`). Falta publicar o
  instalador (autorização do titular).
- ✅ **SOBEDESCE: "Agora sua conta é Absolute ZRO" para contas antigas** (29/10/2026, decisão do titular): quem está
  logado sem vínculo com a Absolute ZRO vê, uma vez, uma tela inteira com o símbolo e "Continuar com Absolute ZRO" (o
  vincular de sempre) no site (`/conta`, `/z`), no app do celular e no do computador. Ninguém sai da conta: a API não
  bloqueia, e no computador a folha só cobre a interface com o app parado (com transferência andando vira uma faixa
  fixa e a fila continua). Ligou → Conexões da central (`ZRO_CONEXOES_URL`, padrão `${ZRO_ISSUER}/conexoes`). Falta o
  titular autorizar o deploy do site e o instalador novo; a página de Conexões da central vem de outro deploy.
- ⬜ Pastas dos quatro produtos fechados (`RELEASE=closed`, telas, `/api/zro/*` com 403, instaladores e Releases) —
  outros agentes, no mesmo branch.
- ⛔ Em produção, só com autorização: inserir a conta do proprietário em `product_release_access` e rodar o
  `db:release:revoke --apply` ([checklist 5a](operations/deployment-checklist.md)).

## Bloqueios e decisões do titular

1. Aplicar o SQL no Supabase e ligar o banco ao projeto `absolutezro` na Vercel ([checklist](operations/deployment-checklist.md)).
2. ~~Provedor de pagamento e preços~~: Stripe e tabela da ADR 0019. Falta a conta Stripe com as chaves na Vercel.
3. Provedor de e-mail transacional. Caixa oficial: Google Workspace `contato@absolutezro.com` (MX, SPF e DMARC já no
   DNS da Vercel; falta o titular entrar no Workspace e mandar o código de verificação e a chave DKIM).
4. ~~Domínio do HUB~~: `absolutezro.com` comprado e no ar (26/10/2026), `www` redireciona; falta o retorno do Google (`https://absolutezro.com/entrar/google/retorno`) no Google Cloud.
5. Manter o AbsoluteZRO público (com cópias de TPeasy e Carro do Freela) ou torná-lo privado.
6. ~~Nome do editor~~: AEON (26/10/2026); falta busca no INPI e autorização para publicar o primeiro Release; LGPD, termos e retenção de mídia.
7. `GITHUB_TOKEN` (token fino, só leitura de Contents em AbsoluteZRO, baixadordodrive, synquei e nossom) nos projetos Vercel sobedesce, synquei e nossom: sem ele, com os repositórios privados, os downloads ficam indisponíveis ([downloads-privados](operations/downloads-privados.md)).
8. Produtos fechados (AEON, Revela): pôr o Release `ai-edit-app-desktop` em rascunho no GitHub; publicar os projetos
   Vercel `aeon` e `revela` só depois de o HUB negar a emissão aos clientes fechados; quando for abrir, mudar os dois
   lados (HUB e `RELEASE=released` nos projetos).
