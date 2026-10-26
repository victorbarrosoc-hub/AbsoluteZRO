# Roadmap — o que foi entregue e o que falta

Atualizado em 26/10/2026. Legenda: ✅ entregue · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado por decisão/acesso.

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
- ✅ AEON (26/10/2026): a plataforma de edição ganha nome e ícone no catálogo, na home e no HUB (migration 0012); segue em desenvolvimento.
- ✅ Página inicial com o símbolo como protagonista (26/10/2026): o anel se desenha a partir da centelha, a estrela
  recolhe até a forma flat, um brilho corre no traço e o símbolo inclina com o ponteiro; o título entra palavra a
  palavra. Na rolagem, as ferramentas entram em órbita em volta do O ("Um só ecossistema."), todas acesas. Tudo em
  CSS (scroll-driven com `@supports`), sem estado por quadro no React, parado com "reduzir movimento".
- ✅ Login único: o HUB é provedor OpenID Connect (código + PKCE, refresh com rotação, permissão por app, Apps com acesso no Perfil, cadastro de apps no console) — [ADR 0012](decisions/0012-login-unico-oidc.md).
- ✅ Conta única: "Criar conta" nos apps cria a conta na Absolute ZRO (`prompt=create`), conta por app no Perfil e no admin, plano grátis com as ferramentas liberadas na organização nova e "Entrar com o Google" mesclando com a conta (migrations 0006–0008, [ADR 0014](decisions/0014-conta-unica-e-acesso.md)). ⛔ Botão do Google depende do cliente OAuth do titular.
- ✅ Painel de pessoas no console (`/admin/pessoas`): números, gráfico de 30 dias (cadastros e entradas em apps), funil, contas por app, lista com busca/filtros/ordem, troca de plano por organização (`changeOrgPlan`; Stripe só pelo provedor), página da pessoa com linha do tempo, suspender/reativar (encerra sessões e refresh tokens; admin protegido) e CSV auditado. Suporte vê, só admin muda.
- ✅ "Entrar com Absolute ZRO" nas cinco plataformas (SOBEDESCE, NOSSOM, Synquei, TPeasy, Carro do Freela). Apps da família entram direto, sem a tela Permitir, e o Abrir do HUB já chega logado (`products.sso_start_url`, migration 0005).
- ✅ Carro do Freela com conta única: "Criar conta" cria a conta Absolute ZRO (`prompt=create`), o app não cria conta própria, e a área logada respeita `carro-do-freela` em `zro_products` (lista de convite segue aberta).
- ✅ Synquei: conta pela Absolute ZRO ("Criar conta" com `prompt=create`) e aviso "ainda não tem acesso" quando `synquei` não está em `zro_products`; app, site e download continuam abertos.
- ✅ SOBEDESCE: conta nova só pela Absolute ZRO (`prompt=create`), Google vira só porta das contas antigas e conexão do Drive, e o acesso segue `zro_products` (sem `sobedesce` = funções bloqueadas com aviso).
- ✅ Um repositório para tudo ([ADR 0013](decisions/0013-monorepo-como-fonte.md)): as cinco plataformas moram em `products/<app>` e publicam nos próprios projetos Vercel a partir daqui (Root Directory por pasta, build só quando a pasta muda). CI e releases de desktop na raiz, com tag por app e o release antigo como reserva.
- ✅ Um Supabase para tudo: SOBEDESCE (schema `sobedesce`, papel `sobedesce_app`, cópia do Neon conferida tabela a tabela) e NOSSOM (`nossom_private` + Auth) migrados e conferidos. Bancos antigos intactos como reserva.
- ✅ TPeasy com conta única: "Criar conta" abre o cadastro da Absolute ZRO (`prompt=create`), o código por e-mail do Supabase vale só para contas antigas e o Google saiu do app; sem `tpeasy` em `zro_products`, a conta mostra "ainda não tem acesso" (o teleprompter continua aberto).
- ✅ Carro do Freela leve sem perder qualidade (26/10/2026): HTML de 2,6 MB para 241 KB (script, CSS, fontes e imagens em `m/` com hash e cache longo; as seis fases usam o mesmo script), mídia em escada de larguras e codecs (AV1/HEVC/H.264) refeita dos originais do Higgsfield e do Kling, fotos de telas escondidas em `loading="lazy"` e o pôster da home pré-carregado. Celular em 4G: LCP 7,3 → 4,1 s na primeira visita e 5,9 → 1,6 s na segunda. Bateria em paralelo num Chromium só (38 → ~15 min). ⬜ Dividir o script por tela (Etapa 2) fica para projeto próprio: o app liga todas as telas no arranque.
- ⬜ Carro do Freela no Supabase AbsoluteZRO (a lista de convite ainda está no projeto antigo; aguardando acesso).
- ⬜ Arquivar os repositórios antigos (todos conferidos: o `main` de cada um é o commit importado).
- ⬜ Domínio próprio `absolutezro.com` com subdomínio por app e sessão compartilhada (aguardando a compra).
- ✅ App Absolute ZRO para computador, primeira etapa (`apps/hub-desktop`, 25/10/2026): o HUB numa janela própria no Mac (.dmg universal) e no Windows (.exe com escolha de pasta), tema claro, tela "Sem conexão" local, menu em português, deep link `absolutezro://` e aviso de versão nova por `/baixar/hub/versao`. Instaladores no Release `hub-desktop` (workflow `hub-desktop.yml`), entregues por `/baixar/hub/{mac,windows}`. O download só abre ao público com `HUB_DESKTOP_PUBLICO=1` na Vercel (decisão do titular; até lá, "Em breve").
- ✅ Central de apps (26/10/2026, [ADR 0018](decisions/0018-central-de-apps.md)): o app Absolute ZRO instala, abre,
  atualiza e remove SOBEDESCE, Synquei e NOSSOM (catálogo `GET /api/v1/desktop/apps` a partir dos Releases, SHA-256
  conferido, sem administrador). Sites das ferramentas com "Instale pelo Absolute ZRO" primeiro e o download direto
  como reserva; no celular, o Absolute ZRO instala na tela de início (Android com um toque, iPhone com guia).
- ⬜ App para computador, próximas etapas: certificados Apple/Microsoft (decisão do titular: depois) para assinar a
  central e atualizar ela mesma sozinha; NOSSOM no catálogo (Release `nossom-v…` no AbsoluteZRO ou `GITHUB_TOKEN` no
  projeto `absolutezro`); abrir o download público (`HUB_DESKTOP_PUBLICO=1`).
- ⬜ `GITHUB_TOKEN` no projeto Vercel **absolutezro** e primeiro Release `hub-desktop` (push na `main` com mudança em `apps/hub-desktop/**`); até lá `/baixar` mostra "Em breve" ([downloads-privados](operations/downloads-privados.md)).
- ✅ Conta central: cadastro, login, sair, sessões (lista e encerrar), confirmação de e-mail, nova senha, troca de senha.
- ✅ Central da conta (26/10/2026, pedido do titular): `/perfil` vira "Sua conta", com visão geral (foto e nome),
  Segurança (troca de e-mail confirmada pelo endereço novo, senha, aparelhos conectados), Plano (plano da organização
  ativa, pedido de renovação ou upgrade que a equipe atende no console) e Acessos (organizações, papel, planos e
  ferramentas liberadas, apps em que a pessoa entrou). Migration 0010 (`user_avatars`, `plan_requests`,
  `auth_tokens.new_email`). ⛔ Renovar e fazer upgrade com pagamento de verdade dependem do provedor de pagamento.
- ✅ Menu lateral recolhível (botão e ⌘/Ctrl + \\, lembra a escolha; recolhe sozinho entre 901 e 1200 px), conteúdo
  até 1680 px centralizado e uma barra só no celular, com o menu em folha que fecha ao navegar.
- ✅ Organizações, troca de organização ativa, convites (e-mail confirmado e igual), papéis, remoção, dono garantido.
- ✅ RLS em todas as tabelas com testes de isolamento entre organizações.
- ✅ Catálogo versionado, Ciclo do O, planos individuais, entitlements, quotas atômicas, carência, console.
- ✅ Projeto canônico com etapas reais, briefing/roteiro versionados, Ciclo do O navegável com alternativa em lista.
- ✅ Auditoria só-inclusão; logs sem dados pessoais.
- 🟡 2FA (⬜), provedor de e-mail (⛔ decisão), login social (⬜).

## Fase 2 — Conexão real

- ✅ SOBEDESCE → HUB: resumo `descargas.jsonl` v1 + relatórios xxHash64, prova por destino, divergência explícita.
- ✅ HUB → Synquei: validação do manifest e prévia de organização (dry-run, IDs preservados) pela fila.
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
- ✅ SOBEDESCE · build do app de desktop de volta (26/10/2026): o download do SDK da Blackmagic devolvia 400 com o
  cadastro antigo; com o segredo `BRAW_SDK_CADASTRO` refeito, Mac e Windows passam (SDK, empacotamento e teste de fumaça).
- ✅ TPeasy ↔ HUB pelo backup JSON do próprio app.
- ✅ Carro do Freela → HUB (26/10/2026): o site do Carro leva o job (`carro-do-freela.job/1`, com o briefing inteiro)
  e a equipe escalada (`carro-do-freela.crew/1`) para a organização no HUB, com o token da pessoa (escopo
  `carro-do-freela.jobs`, Bearer nas rotas `/api/v1/carro-do-freela/jobs` e `/jobs/crew`). Quem já é da organização
  entra na equipe do projeto; conta de fora recebe convite de **convidado** (papel `guest`, migration 0013) que só
  abre aquele projeto, só a mesma conta aceita e nunca rebaixa ninguém. O projeto mostra a seção Equipe.
- ✅ Eventos versionados, outbox, fila com retry/backoff, dead-letter, revisão, reprocessamento; fluxo ponta a ponta
  testado com fixtures gerados pelo código real do SOBEDESCE.
- 🟡 NOSSOM: link e contrato `edit.timeline.ready`; passagem automática ⬜ (precisa de mudança no NOSSOM, com autorização).
- ⬜ Synquei lendo o plano do HUB (hoje o Synquei lê o `descargas.jsonl` direto; integrar exige mudança no original).
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
- ⬜ Apps com IA e GPU chamarem `consumeQuota` na métrica `zro.ai_credits`; pacote de créditos extras.
- ⛔ Conta Stripe do titular e as chaves na Vercel; depois "Ligar vendas" com a data de corte.
- ⬜ Assentos, limites por plano, troca de plano com prorrateio (hoje é assinatura nova + cancelar a antiga no portal).

## Fase 4 — AI Edit · Fase 5 — Revela (Finishing)

- 🟡 Scaffolds com contratos e formato de presets ([ai-edit](../products/ai-edit/README.md), [finishing](../products/finishing/README.md)).
- ⬜ Implementação (AI Edit: decupagem/transcrição primeiro).
- ⬜ Revela, primeiro recorte: só DaVinci Resolve, cor entregue em PowerGrade e LUT, técnica gerada e criativa entregue ([ADR 0015](decisions/0015-finishing-resolve-powergrade-lut.md)). QC, exportação e media manager vêm depois.
- ✅ Revela: identidade visual (película perfurada em amarelo filme, revelada em roxo → amarelo; escolha do titular; guia e alternativas em `products/finishing/marca`) aplicada na tela e no HUB — [ADR 0016](decisions/0016-identidade-revela.md).
- 🟡 Revela: referência → LUT criativa com tela e conta-gotas de pares de cor (`products/finishing`, sem IA, roda no navegador sem enviar imagens, 18 testes com Chromium e a CSP de produção, CI próprio). Projeto Vercel `revela` autorizado pelo titular em 25/10/2026, em revela-zro.vercel.app (`revela.vercel.app` é de outro app), com OG próprio. Falta: LUTs técnicas por câmera, ponte com o Resolve e pacote de entrega.
- 🟡 Revela: entrega por destino (8 presets com fonte e data, script do Resolve testado num Resolve simulado). Falta: teste no Resolve Studio real, presets de emissoras específicas e QC do arquivo renderizado.
- 🟡 Revela no SOBEDESCE: "Converter com a Revela" no botão direito do Drive (computador) e no menu do vídeo do celular; converte o aparelho que tocou (computador: ffmpeg com hardware e MD5 conferido; celular: no navegador, lendo do Drive por pedaços). Arquivo ao lado do original, presets da Revela. Falta: Mac e Windows reais (VideoToolbox, NVENC), iPhone e Android reais e arquivo final acima de 1,5 GB no celular.
- ✅ Revela: telas no padrão Apple com pouco texto (cartões visuais, Liquid Glass, motion com "reduzir movimento").
- 🟡 Revela: conversor no navegador, celular e computador (master ProRes → YouTube, Vimeo, Reels, TikTok em H.264/HEVC marcado BT.709; arquivo não sai do aparelho). Falta: teste em iPhone/Android reais, arquivos acima de 1,5 GB no celular e conversão de HDR.
- 🟡 Revela: página inicial com motion, página de login e login único Absolute ZRO (`api/zro/*`, cliente `revela-web`). Falta: criar o cliente no console do HUB, `sso_start_url` e as variáveis na Vercel.
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

## Fase 6 — Escala

- ⬜ Observabilidade em produção (drain de logs, métricas da fila, alertas), backups e retenção definidos.
- ⬜ Hardening: CSP com nonce, limites de taxa na API, rotação de segredos de webhook, testes de carga.

## Bloqueios e decisões do titular

1. Aplicar o SQL no Supabase e ligar o banco ao projeto `absolutezro` na Vercel ([checklist](operations/deployment-checklist.md)).
2. ~~Provedor de pagamento e preços~~: Stripe e tabela da ADR 0019. Falta a conta Stripe com as chaves na Vercel.
3. Provedor de e-mail transacional. Caixa oficial: Google Workspace `contato@absolutezro.com` (MX, SPF e DMARC já no
   DNS da Vercel; falta o titular entrar no Workspace e mandar o código de verificação e a chave DKIM).
4. ~~Domínio do HUB~~: `absolutezro.com` comprado e no ar (26/10/2026), `www` redireciona; falta o retorno do Google (`https://absolutezro.com/entrar/google/retorno`) no Google Cloud.
5. Manter o AbsoluteZRO público (com cópias de TPeasy e Carro do Freela) ou torná-lo privado.
6. Nome definitivo do AI Edit (Finishing virou Revela, editor-alvo Resolve: ADR 0015); LGPD, termos e retenção de mídia.
7. `GITHUB_TOKEN` (token fino, só leitura de Contents em AbsoluteZRO, baixadordodrive, synquei e nossom) nos projetos Vercel sobedesce, synquei e nossom: sem ele, com os repositórios privados, os downloads ficam indisponíveis ([downloads-privados](operations/downloads-privados.md)).
