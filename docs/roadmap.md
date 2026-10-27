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
- ✅ Página inicial de cinema (26/10/2026): paisagem com o símbolo esculpido sobre a rocha, faixa discreta das 7 ferramentas e cartão do Ciclo do O; sem selos de "em construção".
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
- ✅ Perfil único no Synquei e no TPeasy (27/10/2026): foto e nome da conta Absolute ZRO, relidos a cada abertura em `/oauth/userinfo` (refresh token cifrado só em `/api/zro`), e **Editar na conta Absolute ZRO** no lugar de editar nome no app. ⬜ Validar contra o HUB de verdade depois do deploy.
- ✅ Synquei de computador com a conta Absolute ZRO (27/10/2026): a mesma tela do site (entrar, foto e nome na barra e em Ajustes, editar na conta, sair) com o cliente público `synquei-desktop` (navegador do sistema + 127.0.0.1, PKCE). ⬜ Validar num Mac/Windows de verdade contra o absolutezro.com.
- ✅ Entrar e criar conta como conversa (27/10/2026): uma pergunta por vez (e-mail → senha; e-mail → nome → senha), o símbolo da marca como orbe (Absolute ZRO · ouvindo · conferindo · pronto, com ✓ em traço fino) e "Conectado. Abrindo seu HUB…"; vale para `/entrar`, `/criar-conta` e `/app/entrar`, funciona sem JavaScript. ✅ O orbe é o Z animado (27/10/2026).
- 🟡 IA do ecossistema, o Z (27/10/2026): uma IA para todas as plataformas, conversas por plataforma reunidas no HUB, 1 crédito por resposta, `<zro-ia>` para as plataformas e o visual aprovado (anel e estrela cromados movidos por código, rastro e correntes). Falta: migrações 0016/0017 em produção, publicar, testar com a chave real e colocar o `<zro-ia>` em cada plataforma.
- ✅ Balões de pendência no Synquei (web e computador), TPeasy e Carro do Freela (27/10/2026): a aba com algo esperando a pessoa mostra o número (99+ acima de 99, `aria-label` "N pendências", o que espera no `title`), ao vivo, e vira ponto no canto do ícone no menu recolhido e na barra do celular. Só conta o que a tela já pede (religar mídia, sincronizar, clipe para conferir, cartão esperando, versão nova; conta sem acesso; proposta, contrato a assinar, entrega a conferir, avaliação, pedido de aluguel).
- 🟡 O Z nas páginas iniciais das sete plataformas (27/10/2026): seção curta com o anel e a estrela, "Chegando ao <app>", uma linha do que ele vai fazer ali e **Conhecer o Z** (absolutezro.com/ia). ⬜ O painel do Z dentro de cada plataforma (até lá a seção não diz que já funciona).
- ✅ A Z no painel inicial do Synquei (site, celular e computador) e do TPeasy (27/10/2026): `<zro-ia>` no topo do Início/Roteiros, com o repasse `/api/zro/ia` de cada app (token só no servidor ou no processo do Electron), `zro.ia` no login e "Entrar de novo" para logins de antes da Z. Homes dizem "Já no <app>". ⬜ Conferir com conta real no absolutezro.com e confirmar no console que `synquei-desktop` tem `product_id = synquei` e o escopo `zro.ia`.
- 🟡 A Z no Início do NOSSOM (27/10/2026): `<zro-ia>` no topo de `/studio` (site, celular/PWA e app de computador), repasse `/api/zro/ia` com o token `zro.ia` guardado só no servidor, "Conectar com Absolute ZRO" sem token, home "Já no NOSSOM". Falta: publicar e conferir com uma conta real (o login antigo precisa conectar uma vez).
- 🟡 A Z no painel inicial do AEON e da Revela (27/10/2026): `<zro-ia>` como primeira tela do app (AEON: aba Z no dock, site, celular e app de computador; Revela: `inicio.html`, aba Z, `start_url` do app instalado), repasse `/api/zro/ia/*` com o token da sessão (o token não chega à página), `zro.ia` no login (web e desktop, com volta sem o escopo se o cliente recusar) e a seção da home como "Agora no AEON/na Revela". Falta: publicar, conferir em produção com conta real e se `aeon-web`/`aeon-desktop` têm `product_id` (sem ele não recebem `zro.ia` pela 0016).
- 🟡 A Z como painel inicial do SOBEDESCE e do Carro do Freela (27/10/2026): `<zro-ia>` no topo da conta (site), do Início do app do celular e do app de computador do SOBEDESCE, e no topo do Feed do Carro; o token `zro.ia` fica no servidor de cada app (repasse `/api/zro/ia/*`, NDJSON em streaming; no computador, pelo motor com o Bearer do dispositivo). A home dos dois diz "Agora no <app>". Falta: migração 0016 em produção, a migração 0014 do SOBEDESCE (`contas_zro.ia`) no deploy, publicar e conferir com conta real.
- 🟡 A Z com aba própria no SOBEDESCE e no Carro do Freela (27/10/2026): primeira aba e tela de entrada no site (`/z`, ao lado de Conta), no app do celular (sempre, com ou sem Drive), no app de computador e no Carro (primeiro item da lateral; no celular, botão em destaque à esquerda do topo, porque a barra 3 + Menu + 3 não comporta um oitavo item). Conta, Início e Feed voltaram a ser como eram. Falta: publicar e conferir com conta real.
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
  entra na equipe do projeto; conta de fora recebe convite de **convidado** (papel `guest`, migration 0014) que só
  abre aquele projeto, só a mesma conta aceita e nunca rebaixa ninguém. O projeto mostra a seção Equipe.
- ✅ Carro do Freela (27/10/2026): sem selo "Prévia" na barra de cima (a prévia segue dita no pé da home, no menu e
  no rodapé do app) e o "Continuar com Absolute ZRO" com o símbolo flat no lugar do feixe de luz antigo.
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
6. ~~Nome do editor~~: AEON (26/10/2026); falta busca no INPI e autorização para publicar o primeiro Release; LGPD, termos e retenção de mídia.
7. `GITHUB_TOKEN` (token fino, só leitura de Contents em AbsoluteZRO, baixadordodrive, synquei e nossom) nos projetos Vercel sobedesce, synquei e nossom: sem ele, com os repositórios privados, os downloads ficam indisponíveis ([downloads-privados](operations/downloads-privados.md)).
