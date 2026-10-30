# Validação — evidências

Rodado em 25/10/2026 neste ambiente (Linux, Node 22.22, Postgres 16.15 local, Chromium do Playwright 1.63).
Mesmos passos do CI (`.github/workflows/ci.yml`). O CI do GitHub roda no primeiro push.

| Verificação                              | Comando                              | Resultado                                     |
| ---------------------------------------- | ------------------------------------ | --------------------------------------------- |
| Segredos                                 | `node scripts/scan-secrets.mjs`      | nenhum segredo em 1482 arquivos versionados   |
| Lint                                     | `npm run lint`                       | 0 problemas                                   |
| Formatação                               | `npm run format:check`               | ok                                            |
| Tipos                                    | `npm run typecheck`                  | ok (pacotes, worker e hub-web)                |
| Unitários + integração (Postgres real)   | `npm test`                           | **69/69** em 8 arquivos                       |
| Build de produção                        | `npm run build`                      | ok, 41 rotas                                  |
| E2E + acessibilidade (axe WCAG 2.1 A/AA) | `npm run test:e2e`                   | **8/8**                                       |
| Dependências                             | `npm audit`                          | 0 vulnerabilidades (Next 16.4.3)              |
| Originais intactos                       | `node scripts/check-originals.mjs …` | 5/5: mesmo HEAD da cópia e `git status` limpo |

## Lançamento de "Gerar versões com o Relay": o botão só quando funciona e o SOBEDESCE 0.2.0 (30/10/2026)

O `relay-sobedesce` sobre a main de 30/10 (Set @, apagar na Criação, aprendizados da Z, looks do Relay; conflitos só no
e2e do Maestro e neste arquivo). O app de computador 0.2.0 diz `x-sobedesce-capacidades: relay`; o site grava
(`sessoes.capacidades`, migração SOBEDESCE `0017_capacidades_do_computador`) e conta ao Maestro pelo `relay.pedido`
(`computador.relay`/`desatualizado`, `ids: []` aceito); o Maestro só mostra o botão com `relay` e o pedido para
atualizar com `desatualizado` (só depois que o `/baixar` entrega a 0.2.0); o site recusa `relay.converter` sem computador
que converta (409). Passos do lançamento: [operations/lancamento-gerar-versoes.md](operations/lancamento-gerar-versoes.md).
Bancos e portas próprios: `zro_rlanc_test`, `maestro_test_*_rlanc`, `maestro_test_e2e_rlanc` (portas 7417–7423).

| Verificação                              | Resultado                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Raiz `lint`, `format:check`, `typecheck` | ok                                                                                                                                                                                                                                                                                                                                                                 |
| Raiz `npm test`                          | **419/419** em 46 arquivos                                                                                                                                                                                                                                                                                                                                         |
| `npm run contracts:export`               | `sobedesce.relay-pedido.{entrada,resposta}.v1`: `ids` de 0 a 50; `computador.relay` e `computador.desatualizado` opcionais (site antigo não manda = `false`)                                                                                                                                                                                                       |
| SOBEDESCE site `lint`, `typecheck`       | ok                                                                                                                                                                                                                                                                                                                                                                 |
| SOBEDESCE site `npm test`                | **316/316**. `zro-relay.test.mts`: o cabeçalho (só as conhecidas), só app antigo = 409 e nada na fila, "desatualizado" só com a 0.2.0 no Release (GitHub de mentira; fora do ar = não pede), o app novo vale na hora e voltar para o antigo desliga, sem computador nem um nem outro. `zro-relay-ciclo`: o executor de verdade manda o cabeçalho e libera o pedido |
| SOBEDESCE app `test:fast`                | **796 ok**, 2 falhas do ambiente: `mobile-stream` (tempo, com a máquina carregada; passa sozinho) e o `smoke` de `protecao.test.js` (o `onnxruntime-node` opcional ficou de fora da instalação por falta de disco). `cloud.test.js`: todo pedido ao site diz `relay`                                                                                               |
| Maestro `lint`, `typecheck`, `npm test`  | ok, ok, **636/636**. `relay.test.mts`: `gerarCom`/`computadorConferido` (site antigo = sem botão), botão com computador que converte, aviso com app antigo, 409 sem gravar nada, nada sem resposta, sem acompanhar, leitura, sem Relay ou sem SOBEDESCE (sem perguntar)                                                                                            |
| Maestro `build` e e2e `relay.spec.ts`    | `build` ok; **12 ok**, 6 pulados (os de `SHOTS_DIR`), no computador, iPhone Chromium e iPhone WebKit. Novo: app antigo = o aviso no card e no lote, sem computador = nada, o app novo abre = o botão; sem o Relay no plano = nem botão nem aviso                                                                                                                   |
| `node scripts/scan-secrets.mjs`          | nenhum segredo                                                                                                                                                                                                                                                                                                                                                     |
| Não verificado                           | o deploy (sem autorização para este passo), o build do app 0.2.0 no Actions, um computador de verdade com Drive de verdade                                                                                                                                                                                                                                         |

## SOBEDESCE: o lado que faltava de "Gerar versões com o Relay" (30/10/2026)

Rotas `/api/zro/relay/{converter,pedido,cancelar}`, o tipo `relay` na fila `pedidos_proxy` (migração SOBEDESCE
`0016_pedidos_relay`, só no banco de teste) e o executor no app de computador (`src/engine/pedidos-relay.js`). Sobre a
main de 30/10 e o `claude/admiring-goodall-eiznf7` do Relay (conflitos só no Maestro: 0033 antes da 0034). Bancos com
sufixo próprio (`zro_rlsd_test`, `maestro_test_*_rlsd`), apagados no fim.

| Verificação                              | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SOBEDESCE site `lint`, `typecheck`       | ok                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| SOBEDESCE site `npm test`                | **311/311**. `tests/zro-relay.test.mts` (9): pedido de outra ação ou reapresentado 401, sem o SOBEDESCE 403; contrato estrito (Tamanho exato, mais de 8, campo a mais, ref longa); arquivo de outra pessoa 404, pasta que é arquivo 400, áudio com preset de vídeo 400; um pedido por preset na pasta pedida, idempotente por `ref:preset` até com dois pedidos ao mesmo tempo (índice único); auditoria no converter e nenhuma no acompanhamento; isolamento (a outra pessoa não vê, não cancela e o computador dela não pega); o computador pega de uma vez só, `frac` só cresce, `pronto` só com o arquivo e o MD5, finais que ninguém reabre; cancelar (pendente e convertendo; o sinal de vida recebe 409); computador sumido vira erro e outro computador não pega; o celular não cria pedido do Relay. `tests/zro-relay-ciclo.test.mts` (1): o ciclo Maestro → rotas → fila → executor de verdade (`PedidosRelay` + `RelayJobs`, conversão de mentira) → acompanhamento, com cada corpo e resposta conferidos contra `docs/integration-contracts/schemas/sobedesce.relay-*.v1.schema.json`: uma versão pronta com o MD5, a outra cancelada no meio sem subir nada, e pedir de novo sem duplicar |
| SOBEDESCE app `npm run test:fast`        | **798 ok, 0 falhas** (4 pulados de sempre). `test/pedidos-relay.test.js` (9): só os do Relay, na pasta pedida, andamento que só cresce; sem MD5 é erro; frase do erro; preset desconhecido; preset com a cor da Revela recusado e nunca convertido; cancelado no Maestro para antes de subir; outro computador levou; fechar o app antes de subir devolve, no meio do envio vira erro; "pronto" repetido quando a resposta cai; sem ffmpeg não pega; site antigo pausa; **de verdade: ffmpeg do sistema e o Drive falso**, o ProRes vira `Master (WhatsApp).mp4` na pasta de entregas com o MD5 conferido e o original intacto. `test/relay.test.js` e as filas antigas sem mudança                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Raiz `lint`, `format:check`, `typecheck` | ok                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Raiz `npm test`                          | **396/396** em 45 arquivos (inclui `pedidos-entre-apps.test.ts` e o `findEventCycle`; nenhum evento novo)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Maestro `npm test`                       | **626/626** (com a 0033 da Criação e a 0034 juntas)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Maestro `build` e e2e `relay.spec.ts`    | `build` ok; **12 ok**, 3 pulados (computador, iPhone Chromium e iPhone WebKit; portas 3617–3623, banco `_rlsd`), com as capturas `rl-*` claro e escuro e o vídeo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Demonstração do app de computador        | `startApp` de verdade com o Drive falso, o ffmpeg do sistema e um site de mentira com duas versões pedidas: o executor pegou, converteu com o x264 (`libx264`), subiu `Lançamento v3 (WhatsApp).mp4` e `… (Reels · No Compress).mp4` em "05 Entregas", mandou `pronto` com o MD5 e a tela mostrou "Versão para o Maestro: …" (capturas `sd-*` claro e escuro e o vídeo, fora do repositório)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `node scripts/scan-secrets.mjs`          | nenhum segredo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Não verificado                           | o site do SOBEDESCE publicado com a `0016` aplicada (sem autorização de deploy) e um app de computador instalado com o executor (sem build nem release); Drive e computador de verdade; o HUB de verdade assinando para o SOBEDESCE de verdade (cada lado testado com o outro de mentira, pelo mesmo contrato)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Maestro: "Gerar versões com o Relay" (30/10/2026)

A frente interrompida de 29/10 retomada sobre a main de 30/10 (acesso por área, Set, Criação, arrastar novo; drizzle do
Maestro até a 0032) e terminada: migração Maestro `0034_entregaveis_relay` (`when` 1796083200000; a 0033 fica com a
F7), presets do Relay copiados de novo (23 destinos, com "Vídeo de fundo" sem som), a `PONTES` do HUB com as `relay.*`,
estados só para a frente, **Conferir** no despacho ambíguo, cancelar, quem pede por `acessos.ts` e o Relay no
navegador com o computador fechado. Bancos e portas próprios: `zro_relay_test`, `maestro_test_relay`,
`maestro_test_e2e_relay` (portas 6817/6819/6821/6823).

| Verificação                                  | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maestro `lint`, `format:check`, `typecheck`  | ok                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Maestro `npm test`                           | **611/611**. `tests/relay.test.mts` (36): cópia de `presets.js`/`plano.js`/ícone igual à do Relay e todo campo tipado em `presets.d.ts`; "Mais" nos grupos do Relay e a forma de cada destino; o intervalo do acompanhamento; `aplicavel` (pronto final, erro/cancelado finais no mesmo pedido); ambíguo → `revisar` com uma chamada só e Conferir devolvendo o mesmo pedido; resposta parcial; recusa 400 sem gravar; a mesma resposta duas vezes; atrasada não desfaz o pronto (código e gatilho, 23514); pedido sumido → Conferir; acompanhar e cancelar sem resposta não mudam o estado; `podeEntregas` igual às políticas da 0034; o resto de antes (folha, idempotência, sem plano, computador fechado, duas organizações, acesso por cliente) |
| Maestro `build`                              | ok                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Maestro e2e `relay.spec.ts`                  | **12 ok** com `SHOTS_DIR` (computador, iPhone Chromium e iPhone WebKit; o escuro e o vídeo só com ele): pedir 4 → na fila com o computador fechado e o link do Relay no navegador → cancelar o TikTok (a fila falsa confere) → o computador abre → 3 prontos com MD5, 1 cancelado → o lote mostra; despacho ambíguo → "A conferir" → Conferir → a mesma fila (um pedido); sem o Relay no plano; detector de corte na folha no iPhone. Capturas `rl-*` em 1440 e 393, claro e escuro                                                                                                                                                                                                                                                                  |
| Maestro e2e completo                         | **186 ok**, 56 pulados (projetos que não se aplicam), 2 do `arrastar.spec.ts` caíram com a máquina carregada (carga ~15; o WebKit sem GPU desenhou 7 quadros em 4 s) e passaram rodando de novo (o de Chromium no arquivo inteiro e o de WebKit sozinho); 42,9 min                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Raiz `lint`, `format:check`, `typecheck`     | ok                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Raiz `npm test`                              | **390/390** em 44 arquivos. `tests/integration/pedidos-entre-apps.test.ts` (10): as `relay.*` assinadas para a rota exata; sem o Relay, 403 com `details.product = relay` e nada auditado; só o Relay sem o SOBEDESCE, 403 do SOBEDESCE; nunca sem a pessoa; `relay.pedido` com contador próprio. `findEventCycle` passa (nenhum evento novo)                                                                                                                                                                                                                                                                                                                                                                                                        |
| `npm run contracts:export`                   | 6 schemas novos `sobedesce.relay-*.v1` e as ações no `zro.app-pedido.*`; sem diferença depois de exportar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `node scripts/scan-secrets.mjs`              | nenhum segredo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Não verificado (o lado que ainda não existe) | as rotas `/api/zro/relay/*` do SOBEDESCE, o tipo `relay` na fila e o executor no app de computador (conversão e MD5 de verdade); metadados reais do Drive (o Google é interceptado com `videoMediaMetadata` fixo); um iPhone de verdade                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Subdomínios do Carro e do SOBEDESCE (30/10/2026)

- HUB `npm test` **392/392** com a migração 0037 (retornos novos, idempotente; numa rodada o `set.test.ts` falhou e passou
  sozinho e na rodada seguinte); `npm run lint` limpo. Carro `npm run test:api` **47/47** (origem `carro.absolutezro.com`
  aceita). SOBEDESCE: só a lista de origens do site mudou (`origensDoSite`).

## Set: adicionar pelo @ no Online (30/10/2026)

Achar a pessoa pelo @, adicionar, ver quando está online e abrir a conversa, tudo no Online do `<zro-set>` (antes
escondido nos Ajustes). API: `POST /api/v1/set/contatos { ver }` (prévia; mesmas regras da busca de perfis) e "já são
contatos" = 409; widget continua `v1` e nenhum repasse dos apps mudou (a prévia vai pelo POST que todos já passam).

| Verificação    | Comando                                                                                                           | Resultado                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Raiz           | `npm run lint`, `format:check`, `typecheck`, `npm test` (`TEST_DATABASE_URL=…/zro_setadd_test`), `npm run build`  | ok, ok, ok, 395/395 (45 arquivos; 3 casos novos em `set.test.ts`), ok          |
| E2E do HUB     | `tests/e2e/set.spec.ts` (`E2E_PORT=7017`, banco `zro_setadd_e2e_test`)                                            | 7/7 (Chromium e WebKit, computador e iPhone; limite e escondido no 1440 e 393) |
| E2E do Maestro | `e2e/set.spec.ts` (`E2E_DB_SUFIXO=setadd E2E_PORT=7017 E2E_PONTE_PORT=7019 E2E_ANP_PORT=7021 E2E_ROTA_PORT=7023`) | 12/12 (computador, iPhone e Safari do iPhone)                                  |
| Segredos       | `node scripts/scan-secrets.mjs`                                                                                   | nenhum segredo                                                                 |

O que os testes cobrem: a prévia mostra nome, @ e foto só de perfil visível (escondido e inexistente com a mesma
resposta, sem e-mail), não pede nem avisa ninguém, diz enviado/recebido/contato/bloqueado e nunca o bloqueio da outra
pessoa; o pedido pelo @ aparece para a outra pessoa no topo do Online (número na aba), ela aceita ali, os dois se veem
online ("na Absolute ZRO"/"no Maestro") e o toque na pessoa abre a conversa; já contatos = 409; o limite de 20 por dia
aparece no campo (repetir o enviado e aceitar o recebido não gastam); Esc fecha só o campo.

## Divulgação só do que está no ar; Maestro e Relay no ar (30/10/2026)

Banco local `zro_eco_a20d` (todas as migrations + 0039), testes em `zro_eco_a20d_test` e E2E em
`zro_eco_a20d_e2e_test` (porta 3473). Máquina carregada (load ~25 em 4 núcleos, disco quase cheio).

| Verificação                                                    | Resultado                                                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| lint, `format:check`, `typecheck`                              | ok                                                                                           |
| `npm test`                                                     | 394/396; as 2 do `stripe.test.ts` caíram por disco cheio (53100) e passaram de novo sozinhas |
| `divulgacao.test.ts` (novo), `maestro-lancamento`, `downloads` | ok: só os cinco no ar divulgados; abrir o gate do NOSSOM o divulga; 0027 + 0039 idempotentes |
| Maestro `tests/lancamento.test.mts`                            | 5/5 (descrição sem "Beta")                                                                   |
| E2E `hub.spec.ts`, `home-celular.spec.ts`, `z-entrada.spec.ts` | ok (novo: páginas públicas sem AEON/Revela/NOSSOM/Carro em 1440 e 390 px; painel com Abrir)  |
| E2E `a11y.spec.ts`                                             | públicas ok; "área logada" estourou os 120 s pela carga da máquina (páginas não mudaram)     |
| Capturas antes/depois (computador e iPhone, claro)             | fora do repositório (scratchpad da sessão)                                                   |

## Integração: a Z discreta e o Set em todas as plataformas (30/10/2026)

Os dois ramos de 30/10 juntos ("a Z nunca é a primeira tela" e "Set em todas as plataformas"). Em todo app a entrada
continua a tarefa, a Z segue discreta (nada dela carrega antes do toque) e o Set tem a entrada dele sem ser a entrada.
Barras de baixo do iPhone com no máximo cinco itens. Bancos e portas próprios: `zro_integra_zset_test`,
`zro_integra_zset_e2e_test` (porta 3281) e `maestro_test_e2e_integra` (porta 9717).

| Plataforma        | Barra do iPhone (o Set e a Z)                                                                  | Verificação                                                         | Resultado                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Raiz e HUB        | app: Apps, Projetos, Planos, Conta; Z no anel do topo (o `/app` não tem Set; o site tem)       | lint, `format:check`, `typecheck`, `npm test`, build, `test:e2e`    | ok; 358/358 (2 de banco cruzado caíram em paralelo e passaram sozinhas); 49/49 |
| SOBEDESCE celular | Início, Drive, Aparelhos, (Referências), Criar; Set e Z no topo (e no canto da tela sem Drive) | `npm test` (motor e celular, com `set-celular.test.js`)             | 791/791 (+4 pulados)                                                           |
| SOBEDESCE site    | Set no cabeçalho, antes do anel da Z; entrada em `/conta`                                      | `web`: lint, tipos, `npm test`                                      | ok, ok, 301/301                                                                |
| Synquei           | Início, Mídia, Sincronizar, Linha, Exportar; Set e Z no canto do Início (Set no menu lateral)  | `npm test`                                                          | 153/153 (+6 pulados, Electron)                                                 |
| TPeasy            | Roteiros, Teleprompter, Ajustes, Set; Z no anel do topo de Roteiros                            | `node --test tests/*.test.mjs`                                      | 61/61                                                                          |
| Relay             | sem Z; Set no fim das páginas do topo                                                          | `npm test` (com `npm ci` só do Relay)                               | 57/57                                                                          |
| Carro do Freela   | 3 + Menu + 3 (não mudou); Set no menu; Z no anel do topo; lateral termina em Set e Z           | `test:api`; bateria inteira (`run.js`)                              | 47/47; 89/89 (`conta-zro` e `sem-zoom` só sozinhas, pelo teto de tempo)        |
| NOSSOM            | Início, Projetos, Estúdio, Conta, Set; Z no anel do topo; lateral termina em Set e Z           | `npm test`, tipos, `format:check`, build, e2e inteiro               | 124/124, ok, ok, ok; 65/65 (+26 pulados)                                       |
| AEON              | dock: Mídia, Revisar, Edição, Entrega, Set; Z no ícone da barra                                | `npm test` (com `npm run vendor`)                                   | 140/140                                                                        |
| Revela            | dock: LUT, Lab, CST, Entrega, Converter; Set e Z no topo                                       | `npm test`                                                          | 180/180                                                                        |
| Maestro           | não mudou (Set na pílula do topo, Z discreta)                                                  | `npm test`; `e2e/set.spec.ts` (`E2E_DB_SUFIXO=integra`, porta 9717) | 430/430; 6/6 (computador, iPhone e Safari)                                     |

Conflitos e como ficaram: SOBEDESCE celular (`tabs.js`), Synquei (`main.js`, `app.css`, `sw.js`) e Revela tinham seis
itens na barra com o Set; o Set foi para o topo, ao lado da Z (o Synquei liga a entrada nova a cada desenho do Início,
`pintarSet`). TPeasy e AEON: o Set fica como a última aba e a Z continua montando só no toque. Carro (`template.html`) e
NOSSOM (`studio.tsx`): Set antes da Z na lateral. Site do SOBEDESCE (`abas.tsx`): o controle Z · Conta tinha saído; o
Set virou botão do cabeçalho (`BotaoSet`). Testes que esperavam o Set como último item ou a Z como entrada foram
acertados para a regra nova. Achado no caminho: o teste da família no NOSSOM e o `mapa` do Carro ainda esperavam a
família sem o Maestro (lançado em 29/10). Capturas (claro, 1440 e 393 px) fora do repositório. Não rodou: o site do
SOBEDESCE no navegador (precisa de sessão da Absolute ZRO e do banco), os apps de computador em Electron e iPhone de
verdade.

## A Z nunca é a primeira tela (30/10/2026)

Regra do titular (29/10/2026; Plano de Integração §7–8): em todas as plataformas quem entra cai na tarefa; a Z é uma
entrada discreta, nunca aba principal nem aberta sozinha, e nada dela carrega antes do toque. Banco e portas próprios
no e2e do HUB (`zro_zentrada_e2e_test`, porta 3271).

| Plataforma      | Verificação                                                                                             | Resultado                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raiz            | lint, `format:check`, `typecheck`, `scan-secrets`                                                       | ok                                                                                                                                                                  |
| HUB             | `npm run build`; `tests/e2e/z-entrada.spec.ts` (novo) e `z-digitando.spec.ts`                           | build ok; 4/4 (HUB em `/inicio` com a IA no fim do grupo; `/app` nos apps, `/app/apps` redireciona, Z em `/app/ia` só no toque, 393 px com 4 abas e o anel no topo) |
| HUB             | `npm run test:e2e` inteiro                                                                              | 46/49; as 3 que caíram (a11y, admin, sso) passaram de novo sozinhas — axe estourou os 120 s com outra build na máquina                                              |
| SOBEDESCE       | `npm test` (computador e celular), `web: npm test`                                                      | 790/790 (+4 pulados) e web 293/293; `entrada.test.js`, `entrada-celular.test.js` e `web/tests/entrada.test.mts` cobrem a entrada sem a Z                            |
| Synquei, TPeasy | `npm test` / `node --test tests/*.test.mjs`                                                             | 139/139 (+5 pulados, Electron) e 54/54                                                                                                                              |
| Carro do Freela | `conta-zro` e `run.js colisao contraste movimento doca versoes seguranca menu-recolhivel feed feedback` | 148/148 (cai na tarefa, nada da Z montado, anel apagado, `#tab-z` último; reconectar volta à Z) e 9/9                                                               |
| NOSSOM          | `npm test`, `tsc`, `next build --webpack`, e2e `zro-ia` e `install-navigation`                          | 120/120, ok, ok, 5/5 e 3/4 (a falha é anterior: a família agora tem o Maestro)                                                                                      |
| AEON, Revela    | `node --test test/*.test.js`                                                                            | 126/126 e 167/167 (primeira tela Mídia / LUT; Z no ícone da barra / anel do topo; `#z` e `/inicio` diretos)                                                         |

Capturas da primeira tela (claro, 1440 e 393 px) de HUB (site e app), SOBEDESCE (computador e celular), Synquei, TPeasy,
Carro do Freela, NOSSOM, AEON e Revela: nenhuma monta `<zro-ia>` nem pede o script da Z ao abrir. Não rodou: o
app de computador do SOBEDESCE/Synquei/AEON em Electron (`--smoke`), nem iPhone de verdade.

## Set: presença e conversas (29/10/2026, ADR 0032)

Migração `0035_set.sql` (renumerada de 0032: 0031–0034 já são de outros ramos). Banco de teste próprio
(`TEST_DATABASE_URL=…/zro_set_test`, `E2E_DATABASE_URL=…/zro_set_e2e_test`, porta 3261).

| Verificação                                    | Resultado                                                                                                                                                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, formatação, tipos, `scan-secrets` (raiz) | ok (3109 arquivos, nenhum segredo)                                                                                                                                                                                            |
| `npm test` (raiz, Postgres real)               | **352/352** em 39 arquivos; `set.test.ts`: presença e app pelo token, invisível/quem vê, contatos, direta, projeto, bloqueio, denúncia, limites, RLS de toda tabela, exclusão da conta                                        |
| `npm run build` (HUB)                          | ok (`/set`, `/admin/denuncias`, `/api/v1/set/*`)                                                                                                                                                                              |
| `npm run test:e2e` (HUB)                       | **48/48** (um WebKit da página inicial caiu por falta de memória com outros testes na máquina e passou de novo sozinho); `set.spec.ts` em Chromium e WebKit, computador e iPhone, mais moderação no console e o 304 da ETag   |
| Maestro: lint, formatação, tipos               | ok                                                                                                                                                                                                                            |
| Maestro: `npm test`                            | **378/378** (um arquivo caiu com `checkpoint request failed` do Postgres com a máquina cheia e passou de novo sozinho; `set.test.mts`: caminhos fechados, Bearer só no servidor, ETag/304, outra origem, login sem `zro.set`) |
| Maestro: `e2e/set.spec.ts`                     | **6/6** (computador, iPhone Chromium e Safari; banco próprio com o novo `E2E_DB_NAME`); a lista some quando a conversa abre na folha                                                                                          |

Privacidade conferida nos testes: outra organização não aparece; invisível não grava presença; "quem vê" e "visto há"
valem; perfil escondido não é achado pelo @; e-mail não aparece em nenhuma resposta nem no console; mensagem de
bloqueado some nos dois sentidos; `zro_app` não escreve direto em nenhuma tabela do Set.

## Set em todas as plataformas (30/10/2026)

A aba em comum ("Set") em SOBEDESCE (site e celular), Synquei, TPeasy, Relay, Carro do Freela, NOSSOM, AEON e Revela;
tabela em [set.md](integration-contracts/set.md). Telas (claro, computador e 393 px; escuro em Carro, NOSSOM, AEON,
Revela, Relay, Synquei e TPeasy) gravadas fora do repositório.

| Verificação                                 | Resultado                                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Raiz: lint, formatação, tipos, build do HUB | ok                                                                                                                                                           |
| Raiz: `npm test` (banco `zro_setall_test`)  | **358/358** em 41 arquivos; `e2e/set.spec.ts` do HUB 5/5 (Chromium e WebKit) com o widget novo                                                               |
| SOBEDESCE site: lint, tipos, `npm test`     | ok; **299/299**; `zro-set.test.mts`: login com `zro.set` e sem ele, Bearer só no servidor, ETag/304, origem, caminhos                                        |
| SOBEDESCE celular                           | `test/set-celular.test.js` (Chromium com a CSP do `/app/`): última aba, balão, folha tela cheia, tinta do app                                                |
| Synquei / TPeasy                            | 153/153 (5 pulados sem Electron) / 60/60, com os testes do repasse e da entrada                                                                              |
| Relay                                       | `set.test.js` 10/10 (login desligado com o site fechado); telas 5/5 com o servidor local sem login                                                           |
| Carro do Freela                             | `test:api` 47/47; `conta-zro` 145/145 rodada direto (275 s: o teto de 240 s do `run.js` estoura com a máquina cheia); `set-zro` 20/20 (computador e celular) |
| NOSSOM: tipos, `npm test`, e2e              | ok; 121/121; `set.spec.ts` 3/3, `zro-access` (o portão cobre `/api/zro/set`) e `zro-ia` 11/11                                                                |
| AEON / Revela                               | 138/138 / 179/179 (repasse, 403 do portão, dock e folha com a identidade do app)                                                                             |

Achado no caminho: no NOSSOM a folha não trocava de tema ao trocar o tema do estúdio (o React aplica o atributo `tema`
do filho antes do `data-theme` do pai); o widget agora recopia a identidade depois da mudança e ao abrir.
Não rodado: `vendor.test.js` do Relay (sem `node_modules` neste ambiente) e o site do SOBEDESCE no navegador (só o
componente e a rota, pelos testes).

## Página inicial no iPhone: topo por cima de tudo e grade de ícones (29/10/2026)

Relato do titular (Safari do iPhone, tema claro): texto das seções aparecia entre a barra de status e a cápsula do topo e
lia através dela; selos "Em desenvolvimento" cortados e nomes desalinhados na grade; buraco depois de "Ferramentas que
se conectam". Reproduzido no build de produção (WebKit e Chromium, 393 px): a cápsula era vidro com ~14% de
transparência e nada cobria a faixa acima dela; o selo longo empurrava o nome de um ícone e o cartão esticava as linhas.

Agora: `viewport-fit=cover` só no site, cápsula abaixo da safe area e faixa da cor da página atrás dela (some em
degradê); vidro da cápsula quase opaco; `.public-main` isolado (nada da página sobe acima do topo); grade como a Tela de
Início (4 por linha, 3 quando fecha a conta), nome alinhado pelo topo e "Em breve" em cinza; ícones fechados sem
esmaecer; régua centrada e sem a margem extra. Maestro e Relay ("Em breve", pelo gate) com ícone e linha; o Relay entra
sozinho quando a 0031 chegar (conferido aplicando a 0031 num banco local: 3×3 no celular, 5+4 no computador).

| Verificação                             | Resultado                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Lint, formatação, tipos, `scan-secrets` | ok                                                                                                     |
| `npm test` (raiz, Postgres real)        | **340/340** em 38 arquivos                                                                             |
| `npm run build` (HUB)                   | ok                                                                                                     |
| `npm run test:e2e` (HUB)                | **43/43**; novo `home-celular.spec.ts` (WebKit e Chromium, 375/393/430 px), que falha no código antigo |

`home-celular.spec.ts` rola a página inteira e compara a faixa acima da cápsula e o meio dela com e sem o conteúdo da
página (nada pode aparecer), confere nomes alinhados e selos inteiros na grade, o espaço até "Em números" e corte ou
rolagem de lado em todas as seções. A foto do app para computador (`produto-hub-*.webp`) já mostra o catálogo atual;
quando a 0031 entrar, regerar com `scripts/marca/aparelhos/capturar-hub.ts`. Falta conferir num iPhone de verdade.

## Início sem piscar cinza nem pular (29/10/2026)

Vídeo do titular (Mac, absolutezro.com, recarregando o Início): 12 quadros (~200 ms) só com o esqueleto genérico de
`(hub)/loading.tsx` (um bloco largo e quatro pequenos), depois o Início inteiro de uma vez. Causa: a página esperava
todas as consultas (8 em série) atrás de um esqueleto de outro formato, visível desde o primeiro quadro, e a troca era
seca. Reproduzido aqui com o build de produção e um proxy que atrasa o Postgres em 12 ms por pacote (antes: esqueleto à
vista em 6–9 quadros no Chromium e 3 no WebKit a cada recarga).

Agora: `homeTopo` + `homePaineis` em paralelo (o topo chega e os painéis vêm em streaming com o próprio esqueleto);
esqueletos com as mesmas classes da tela (`components/esqueleto.tsx`: Início inteiro, painéis e o genérico de página);
invisíveis nos primeiros 320 ms (o mesmo tempo que `movimento.tsx` espera, acima dos 300 ms que o React segura o
conteúdo depois de um fallback); se chegaram a aparecer, o conteúdo dissolve por cima (`lib/esqueleto-script.ts`, só Web
Animations, sem mexer em atributo); "reduzir movimento" troca seco.

| Verificação                                   | Resultado                                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Lint, formatação, tipos, `scan-secrets`       | ok                                                                                                         |
| `npm test` (raiz, Postgres real)              | **340/340** em 38 arquivos                                                                                 |
| `npm run build` (HUB)                         | ok                                                                                                         |
| `npm run test:e2e` (HUB)                      | **41/41**; `esqueleto.spec.ts` 5/5 (3 rodadas seguidas, sem falha)                                         |
| Banco rápido, Chromium e WebKit               | recarregar, menu e logo: nenhum quadro com esqueleto à vista; palco e atalhos nascem no lugar final; CLS 0 |
| Banco preso (cotas travadas), Chromium/WebKit | topo chega antes; esqueleto invisível até 300 ms; números, painéis e apps no mesmo lugar do esqueleto      |
| Reduzir movimento                             | esqueleto aparece seco aos 320 ms, sem cópia nem animação no conteúdo                                      |

CI com WebKit (29/10/2026, run 40943896316): o WebKit headless do runner dá ~3 quadros por segundo, e as sondas, só em
`requestAnimationFrame`, contavam 3 quadros e perdiam a cópia que dissolve (vive 260 ms). Agora as sondas também amostram
a cada 10 ms e a cópia é contada quando entra no body (MutationObserver). Reproduzido aqui atrasando os quadros das sondas
para 400 ms: antes 2 falhas iguais às do CI; depois `esqueleto.spec.ts` 20/20 (4 rodadas sem atraso).

Segunda rodada no CI (run 40948422689): o runner levou mais de 3 s para pintar o Início, e a sonda (que parava 3 s depois
de abrir) não viu o palco. Agora ela segue até 1,5 s depois de o palco aparecer (no máximo 20 s). E a regra conferida
virou a do desenho, que vale em qualquer máquina: nenhum esqueleto à vista nos primeiros 300 ms de vida (numa máquina
lenta ele pode viver mais e aparecer, de propósito). Local: 15/15, e 6/6 no WebKit com as sondas atrasadas.
| Proxy de 12 ms (como o vídeo), depois | Chromium: 0 quadros com esqueleto; WebKit (mais lento aqui): 0–1 quadro, já com a dissolvência |

Não conferido: o Safari do titular em produção (precisa publicar).

## Maestro: colunas do Quadro como no Trello (29/10/2026)

Pedido do titular: renomear, recolorir, reordenar, criar e arquivar colunas por organização, só administração e gestão.
Rodado neste ambiente (Postgres 16 local próprio, Chromium e WebKit do Playwright 1.63), máquina compartilhada.

- **Dados** (`products/maestro/drizzle/0024_colunas.sql`): `maestro.colunas` (org, id, papel, nome 1–30, cor da paleta,
  ordem, arquivada). Escolha: o card continua guardando a coluna em `dados.coluna` e o **id das 8 colunas de sistema é o
  próprio papel** (`pauta`…`entregue`, check `papel = id`). Assim nenhum card, histórico ou decisão do cliente é
  regravado; as funções `card_*` e `link_enviar` seguem iguais e renomear/reordenar nunca quebra uma automação. Colunas
  novas têm id `x-<12 hex>`. O check fixo `cards_coluna_ok` virou o gatilho `cards_coluna_valida` (só coluna viva da
  própria organização, com trava contra arquivar ao mesmo tempo). Backfill das organizações existentes e gatilho para as
  novas. Escrita só por `maestro.coluna_*` (security definer, papel conferido; `maestro_app` sem insert/update/delete);
  arquivar move cada card por `card_mudar` (histórico só de inclusão, apagados inclusive); sistema não arquiva (check).
- **Tela** (`src/components/quadro/colunas.tsx`, `quadro.tsx`, `estado.ts`, `src/app/colunas.css`): clique duplo no
  cabeçalho renomeia (Enter/sair salva, Esc desiste, vazio não vale); arrastar o cabeçalho reordena com Desfazer; no
  celular, tocar na aba já escolhida renomeia; "Colunas" abre a folha "Editar colunas" (`Folha`): alça (mouse na hora,
  toque segurando 280 ms, setas do teclado), cor, arquivar com destino, "Nova coluna", arquivadas, "Restaurar padrão".
  Otimista com volta e aviso; o poll de 5 s traz as colunas. Hoje, fichas de cliente/projeto e lotes mostram nome e cor
  da organização; coluna nova conta como "em produção" (prazo, Vencendo, lote).
- Testes novos: `tests/colunas.test.mts` (15: fábrica igual ao código, backfill migrando até a 0023 e depois a 0024,
  equipe/leitura 403 no banco e na rota, `maestro_app` sem escrita direta, duas organizações, arquivar com destino e
  histórico intacto, sistema não arquiva nem por fora da função, restaurar e padrão, limite, aprovação do cliente
  depois de renomear e reordenar ainda leva a Aprovado/Revisão, Hoje e lote com coluna nova, acesso por cliente lê,
  paleta do CSS = código com contraste) e `e2e/colunas.spec.ts` (computador e iPhone: renomear no lugar, reordenar
  com Desfazer, criar/renomear/recolorir na folha, sistema não arquiva, arquivar com destino e restaurar, aba do
  celular, alça segurando 280 ms, equipe não edita). `quadro.spec.ts`: a ajuda de trocar de aba não toca na aba já
  marcada (agora renomeia).
- No celular o botão "Colunas" fica ao lado da busca (o topo segue numa linha só: título e "Novo card"; com o topo em
  duas linhas, o card descia e o `gestos.spec.ts` "soltar sobre a pílula" falhava).
- Capturas e vídeos (claro e escuro, computador e iPhone) guardados fora do repositório. Falta conferir num iPhone de
  verdade e aplicar a 0024 em produção (com o próximo deploy autorizado).

| Verificação                            | Resultado                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Maestro lint, formatação, tipos, build | ok                                                                                                    |
| Maestro `npm test`                     | **377/377** (`colunas.test.mts` 15 novos)                                                             |
| Maestro `test:e2e` completo            | **129 ok**, 21 pulados (por aparelho), 0 falhas; inclui `sem-corte`, `transicao` e `gestos` no WebKit |
| `node scripts/scan-secrets.mjs`        | nenhum segredo                                                                                        |

## A Z digita as sugestões no campo (29/10/2026)

Rodado neste ambiente (Postgres 16 local próprio, Chromium do Playwright 1.63), máquina compartilhada.

| Verificação                                   | Resultado                                                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Lint, formatação, tipos (raiz e hub-web)      | ok                                                                                                                               |
| `npm test` (raiz, Postgres real)              | **340/340** em 38 arquivos; `tests/integration/z-digitando.test.ts` 12 novos (ordem, ritmo, pausa, foco, Tab, reduzir movimento) |
| `npm run build` (HUB)                         | ok                                                                                                                               |
| `npm run test:e2e` (HUB)                      | **34/35**; `z-digitando.spec.ts` 3/3 (sem botões, anima, Tab e → completam sem enviar, Esc, escuro, toque no iPhone)             |
|                                               | a falha é o axe de `/admin/custos` (contraste do `.cst-chip__n` com `opacity: .7`, em `custos.css`), fora desta mudança          |
| Maestro lint, formatação, tipos, build        | ok                                                                                                                               |
| Maestro `npm test`                            | **364/364**                                                                                                                      |
| Maestro e2e `z.spec.ts` (computador e iPhone) | **5 ok**, 1 pulado (toque só no celular): painel servido do repositório, Tab completa sem enviar, reduzir movimento, escuro      |
| AEON `npm test` (com `npm run vendor`)        | **122/122** (`tela.test.js`: sem botões, as 4 sugestões na descrição; o vendor copia `digitando.js`)                             |
| Revela `npm test`                             | **146/146** (`tela.test.js`: Tab completa, nada enviado até o Enter)                                                             |
| Carro do Freela `node test/run.js conta-zro`  | **144 ok**, 0 falhas (sem botões, Tab completa com sugestão do Carro, Enter manda)                                               |
| `node scripts/scan-secrets.mjs`               | nenhum segredo                                                                                                                   |

Vídeos (MP4 H.264) do efeito no HUB e no Maestro, computador e iPhone, claro e escuro, gravados com o Playwright: não
versionados (pasta de trabalho da sessão). SOBEDESCE, Synquei, TPeasy e NOSSOM não mudaram de arquivo: recebem o
painel novo de absolutezro.com.

## Perfil profissional com @ (29/10/2026, ADR 0029)

Rodado neste ambiente (Postgres 16.15 local, Chromium do Playwright), máquina compartilhada e carregada (load 15–20).

| Verificação                                                  | Resultado                                                                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Lint, formatação, tipos (raiz e hub-web)                     | ok                                                                                                               |
| `npm test` (raiz, Postgres real)                             | **292/292** em 35 arquivos; `tests/integration/perfis.test.ts` 18 novos                                          |
| `npm run build` (HUB)                                        | ok (rotas novas `/perfil/profissional`, `/pessoas/[arroba]`, `/api/v1/pessoas/*`)                                |
| `npm run test:e2e` (HUB)                                     | **31/31** (`pessoas.spec.ts` novo; a11y e admin estouraram o tempo com a máquina cheia e passaram sozinhos)      |
| Maestro lint, formatação, tipos, build                       | ok                                                                                                               |
| Maestro `npm test`                                           | **352/352** (`pessoas-zro.test.mts` 6 novos; `zro.test.mts` com o nível `sem_pessoas`)                           |
| Maestro e2e (negócio, visual, sem corte, produtora, pessoas) | **39 ok**, 5 pulados (os mesmos de antes), 0 falhas                                                              |
| Carro do Freela `npm run test:api`, `npm test` e build       | **44/44**; **88/88** (12 suítes de tela estouraram o tempo com a máquina cheia e passaram uma por vez); build ok |
| `node scripts/scan-secrets.mjs`                              | nenhum segredo                                                                                                   |

O que os testes cobrem: listas do @ iguais no TypeScript e no banco; formato, reservados (também com ponto/sublinhado),
sugestão sem acento e com número; cadastro com @ ocupado (sem diferença de maiúsculas) não cria a conta; troca com
limite (2/30 dias, sugestão não conta), @ antigo levando ao perfil por 90 dias e bloqueado para outros; RLS (cada um lê
e muda só a própria linha, não muda o @ direto, não lê o histórico, sem sessão nada); busca só de visíveis, sem a própria
pessoa, **nenhum e-mail em nenhuma resposta** (nem na lista de convites pendentes por @); escondido não aparece nem pelo
@ (só a dona vê) e continua convidável pelo e-mail exato; e-mail confirmado e limite de buscas; selos só de app usado;
perfil recusa e-mail, telefone, função fora da lista, http e bio longa; convite por @ (admin só pelo dono, editor não
convida, nem direto no banco), recusar fecha o convite, aceitar pela central; `preferred_username` no id_token e no
userinfo; API dos apps com o escopo certo, auditoria sem o texto buscado; conta excluída sai da busca e o @ fica
guardado. Maestro: @ do login, busca/convite pelo HUB falso (sem escopo = entrar de novo; e-mail do HUB descartado),
freela pelo @ (um por organização, isolado, leitura não adiciona), função na produtora só pela administração.

Não verificado: o e-mail do convite por @ saindo de verdade (sem provedor aqui, o link aparece só fora de produção e a
pessoa vê o convite na central); as migrações `0029`/`0022` contra o banco de produção; o Carro do Freela rodou com o
Chromium desta máquina (`CHROME=/opt/pw-browsers/chromium-1243/...`), outra versão que a do padrão do arnês.

Capturas (claro/escuro, computador/celular): aviso único, editor do perfil, busca no Convidar, menu de ações e a folha de
remover em Equipe, e a busca em Pessoas do Maestro.

## Troca de aba limpa no iPhone, gestos do Quadro e a Z discreta no Maestro (29/10/2026)

Vídeo do titular (iPhone, Safari, maestro.absolutezro.com, demonstração): ao trocar de aba pela barra, a tela velha e a
nova apareciam juntas ("Seu Quadro." por cima de "Boa tarde, Victor.", cards das duas). Quadro a quadro (120 fps): a
velha ficava inteira, sem esmaecer, ~250 ms sob a nova, que também não deslizava.

- **Causa**: a troca vinha do `<ViewTransition>` do React com chave por caminho (um grupo só de saída e outro só de
  entrada, nomes `_t_N_`). No WebKit isso não se comporta como no Chromium: ele cria as duas metades
  (`::view-transition-old` e `-new`) em todo grupo, inclusive no de saída e no de entrada, e o grupo da tela anterior
  continuava vivo na troca seguinte; no WebKit do Playwright a seção nova chegou a ser pintada antes da foto e depois
  esmaecida de novo. Além disso, saída (150 ms) e entrada (320 ms) começavam juntas, então mesmo no Chromium havia
  ~100 ms das duas visíveis. Vidro (`backdrop-filter`) dentro da seção escapava da foto no WebKit.
- **Correção** (Maestro `src/components/movimento.tsx` + `motion.css`; HUB `components/movimento.tsx` + bloco "troca de
  tela" do `globals.css`): a View Transition é chamada por nós. O clique no link de seção é segurado na captura; a seção
  atual vira o grupo `m-sai` (HUB: `z-sai`), o Next navega dentro da transição (o navegador mostra a foto da velha) e a
  nova, quando monta, vira `m-entra` (esperando até 320 ms pelo conteúdo quando chega o esqueleto: esqueleto só com
  espera de verdade); a velha some em 110 ms e a nova só começa aos 100 ms. Regras sem `var()`, a metade inexistente de
  cada grupo escondida, sem vidro na seção durante a troca, sem a API ou com "reduzir movimento" a troca é na hora. A
  barra do celular pré-busca as quatro abas inteiras (antes "Mais" mostrava esqueleto).
- **Quadro no celular** (`src/components/quadro/gestos.ts`): deslizar de lado troca de coluna (lista segue o dedo,
  elástico nas pontas, mola pela velocidade, a pílula de vidro anda junto; direção trava em 8 px, `touch-action:
pan-y`, começo a 20 px da borda fica para o Safari). Arrastar o card (segundo vídeo do titular: segurar demorava ~1 s,
  o card ficava com fundo preto e um fantasma pequeno, e não passava de coluna): o arrastar nativo do HTML saiu do toque
  (`draggable` só com mouse, `-webkit-touch-callout: none`, `user-select: none`); segurar 280 ms ergue o card do tamanho
  real (1,03 e sombra macia), os outros abrem espaço com a mola, a página rola perto do topo e do pé, segurar na borda
  da tela 0,42 s passa para a coluna do lado, soltar sobre uma pílula manda para aquela coluna, soltar acima do Quadro
  desiste; grava pelo mesmo "mover" (aviso com Desfazer).
- **A Z discreta** (decisão do titular; PRD Maestro v1.1, Plano de Integração §7–8): barra do celular Hoje · Quadro ·
  Aprovar · Mais; a Z é ícone no fim da cápsula, no topo do celular e em "Mais"; `/app` (a volta do login) abre sempre
  no Hoje; a marca no topo leva ao Hoje.
- Testes novos: `products/maestro/e2e/transicao.spec.ts` (computador, iPhone Chromium e iPhone WebKit: em cada troca,
  pelo relógio das animações a saída termina antes de a entrada começar, amostrando a cada 4 ms nunca as duas acima de
  10%, nada de esqueleto na volta, uma seção só no fim; com reduzir movimento, nenhuma transição),
  `products/maestro/e2e/gestos.spec.ts` (iPhone Chromium e WebKit, organização própria: deslizar troca de coluna e a
  pílula vai junto, elástico na ponta, borda do Safari e gesto de pé não trocam, toque de verdade pelo CDP rola a
  página e desliza; segurar ergue em menos de 400 ms do tamanho do card e sem fundo escuro; reordena e grava; borda
  passa de coluna com Desfazer; pílula recebe o card; soltar fora devolve), `tests/entrada.test.mts` (Hoje na entrada,
  a Z fora da barra) e no HUB `tests/e2e/hub.spec.ts` ("troca de tela pelo menu").
- Vídeos a tamanho de iPhone (antes/depois, WebKit e Chromium do Playwright) guardados fora do repositório. O WebKit
  do Playwright aqui roda sem GPU e tira a foto da troca devagar (0,3–2 s): serve para conferir a ordem das camadas,
  não a velocidade. Falta conferir num iPhone de verdade depois de publicar.
- Rodado: Maestro `lint`, `format:check`, `typecheck`, `npm test` **343/343**, `build`, `test:e2e` completo **108/108**
  (14 pulados: gestos só no celular; inclui `sem-corte`, `transicao` e `gestos` no Chromium e no WebKit). HUB `lint`,
  `format:check`, `typecheck`, `npm test` **274/274**, `build`, `test:e2e` **30/30** (o cadastro do `sso.spec.ts`
  estourou o tempo uma vez e passou na repetição). `scan-secrets` ok. Também ficou mais firme o
  `quadro.spec.ts` ("Desfazer" espera o servidor gravar antes do próximo teste).

## Fluidez entre abas: HUB, Maestro e SOBEDESCE (29/10/2026)

Pedido do titular: "abrir uma aba é lento e sem fluidez; o Synquei é instantâneo". O Synquei é uma SPA local: troca de
tela por hash sem rede (render direto da memória), service worker com cache primeiro, a tela entra deslizando 22 px
do lado da navegação (0,45 s), pílula da barra que desliza e números que contam. Medição local (build de produção,
Postgres local, Playwright/Chromium sem GPU, mediana de 5 rodadas, clique → conteúdo da aba visível):

- **Causa**: o servidor respondia em 10–40 ms, mas toda troca mostrava o esqueleto do `loading.tsx` e o React segura a
  revelação do conteúdo por 300 ms depois de um esqueleto (Suspense throttle). Resultado: ~330 ms em toda aba do
  Maestro e em quase todas do HUB, e nenhuma transição (só um `fade` de 0,24 s no Maestro).
- **Maestro**: mediana 338 ms → 90 ms (1ª visita) e 337 ms → 88 ms (volta); todas as 11 abas com View Transition.
- **HUB** (telas logadas): mediana 335 ms → 97–143 ms (1ª visita) e 314 ms → 94–118 ms (volta), conforme a carga
  da máquina; todas com View Transition. O site público já trocava em 50–80 ms (sem esqueleto) e agora paga a
  transição (80–160 ms até o primeiro quadro animado no Chromium sem GPU).
- O que mudou: pré-busca da seção inteira com a intenção (mouse em cima, foco, toque) e do esqueleto de todas as
  seções com a página parada; `staleTimes` (Maestro: 30 s dinâmico, 60 s pré-busca; HUB: só os 60 s da pré-busca,
  porque com o dinâmico o login único reaproveitava `/entrar` e `/criar-conta` no meio do fluxo) e o
  Quadro perguntando "o que mudou" ao abrir; `<ViewTransition>` do React 19.3 na área de conteúdo (frente/volta pela
  ordem do menu, menu e topo parados); pílula do menu que desliza; destino aceso no clique; contagem dos números do
  Hoje e de Números. Tudo parado com "reduzir movimento".
- **Maestro, folhas**: o véu cobria só um retângulo (a animação de entrada da seção deixava `transform` no ancestral e
  prendia o `position: fixed`). Agora a folha vai por portal ao `<body>`, véu na janela inteira com desfoque, folha do
  tamanho do conteúdo no centro (computador) ou de baixo com alça (celular), entrada e saída com mola, foco preso, Esc.
  "Novo card" redesenhado (título grande, coluna em pílulas com a cor, listas com avatar/sigla, prazo amigável com
  atalhos, briefing que cresce, Enter cria), card que voa até a coluna (FLIP), Quadro que se reorganiza deslizando,
  avisos "Card criado." e "Movido para Revisão." com Desfazer.
- **SOBEDESCE (computador)**: as telas já eram locais com cache (stale-while-revalidate do Drive); a tela nova agora
  entra do lado para onde a pessoa foi na barra, como no Synquei.
- Testes: `products/maestro/e2e/quadro.spec.ts` (computador e iPhone: véu na janela inteira por cima de tudo, folha do
  tamanho do conteúdo/folha de baixo, foco preso, roda não rola a página, Esc; criar com coluna, prazo e prioridade sem
  recarregar e persistido; Mover para com aviso e Desfazer; ficha com saída; troca de seção com View Transition;
  reduzir movimento parado).
- Cuidado achado no caminho: com `staleTimes`, um redirect de Server Action para a mesma rota reaproveitava a tela
  guardada (o "Permitir" do login único ficava parado em `/oauth/authorize`). No HUB, login, saída, troca de
  organização e consentimento agora redirecionam por `lib/actions/ir.ts`, que limpa o cache do roteador antes; no
  Maestro toda Server Action já chamava `revalidatePath`.
- Rodado (depois do merge com a main): HUB `lint`, `format:check`, `typecheck`, `npm test` **260/260**, `build`,
  `test:e2e` **26/26**, `scan-secrets` ok. Maestro `lint`, `format:check`, `typecheck`, `npm test` **330/330**,
  `build`, `test:e2e` completo **82/82** (6 pulados; inclui `quadro.spec.ts` e `sem-corte` no Chromium e no WebKit).
  SOBEDESCE `test:fast` **769/769** (4 pulados).

## Custos do ecossistema no console (29/10/2026, ADR 0028)

Postgres 16 próprio, build de produção local.

- `tests/integration/custos.test.ts` (18): mês = mensal + anual ÷ 12, por uso fora; conversão com e sem cotação (zero
  não precisa); só o vigente conta (fim no passado e pausado ficam fora); item em reais sem cotação fica fora dos
  gráficos e é contado; nome sem repetir o fornecedor; projeção de 12 meses empilhada pelo mês estimado (virada de ano,
  fim no meio); planos à venda (um por nome, mensal primeiro, avulsos juntos, anual sozinho ÷ 12) e ponto de equilíbrio
  arredondado para cima; recomendações (anual mais barato, uso sem teto, a conferir, conferência velha, custo por conta,
  sem receita, receita abaixo do custo, próximos gatilhos, cotação faltando); formulário (número brasileiro, datas, apps
  conhecidos, recusas); planilha com BOM e sem fórmula. No banco: os 12 itens da migration (US$ 242 por mês ativos),
  `zro_app` sem leitura nem escrita nas duas tabelas (42501, inclusive admin via `asUser`), auditoria de criar, alterar
  (campos e de → para dos números, sem texto livre), apagar e configurar, duplicado = `conflict`, receita só de
  assinatura paga ativa (manual não conta). Raiz `npm test` **292/292** em 35 arquivos.
- E2E `tests/e2e/admin.spec.ts`: `/admin/custos` e `/admin/custos/csv` dão 404 para conta comum e para o suporte (sem
  a seção no menu); admin vê US$ 242, informa a cotação (R$ 1.331), edita o Claude para US$ 210, cria e apaga um item
  com confirmação, filtra por estado, exporta a planilha e a auditoria registra tudo; axe WCAG 2.1 A/AA nos dois temas e
  celular sem rolagem lateral (com as outras telas do console). Suíte e2e do HUB inteira **30/30**.
- Lint, formatação, tipos e build ok. `node scripts/scan-secrets.mjs`: nenhum segredo. Capturas (claro/escuro,
  computador/celular, folha de edição) fora do repositório.
- Não verificado: os valores "a conferir" nas páginas dos fornecedores e a migration `0028` no banco de produção.

## Automáticos: dólar nos Custos e combustível no Maestro (29/10/2026)

Postgres 16 próprio, Banco Central e ANP falsos (servidores locais); nada de rede nos testes. Fontes conferidas à mão
neste ambiente: PTAX de 28/10/2026 = venda 5,342 (Olinda); planilha `resumo_semanal_lpc_2026_10_18-2026_10_24.xlsx`
(abas CAPITAIS, MUNICIPIOS, ESTADOS, REGIOES e BRASIL, ~460 municípios) na página "últimas semanas pesquisadas".

- HUB `tests/integration/dolar.test.ts` (11): leitura da resposta (4 casas, último boletim do dia, vazio = null,
  formato estranho e preço fora da faixa = erro), URL do Olinda, volta de segunda-feira de feriado até a sexta (4
  pedidos, datas conferidas), dia útil com um pedido, HTTP 503 interrompe, 10 dias vazios = erro, servidor mudo estoura
  o tempo, regra das 24 h e da espera de 1 h depois de falha, `GET /api/cron/dolar` com 503 sem `CRON_SECRET` e 401
  com segredo errado ou sem `Bearer` (sem pedido ao Banco Central).
- HUB `tests/integration/custos.test.ts` (+2, 20): no banco, grava a PTAX (29/10 antes das 13 h vale 28/10), busca
  recente não repete, Banco Central fora mantém o valor e anota a falha, "Usar valor manual" vale e não é sobrescrito
  pelo agendamento, "Voltar ao automático", repetição sem linha nova, auditoria com de → para, a rota com o segredo
  certo (200/502) e `zro_app` sem ver nem gravar as colunas novas (42501); valor automático sem data/fonte barrado
  (23514). Metas e cotação com formulários separados. Raiz `npm test` **304/304** em 36 arquivos.
- Maestro `tests/deslocamento.test.mts` (10) e `tests/combustivel.test.mts` (8): planilha no desenho real (municípios,
  estados, Brasil; aditivada, diesel S500, estado desconhecido, preço zero e outra semana fora; repetido vale o
  primeiro), link da semana mais nova com nomes bagunçados e só do mesmo site, linha "L de etanol"; no banco, o
  agendamento com 503/401/200, repetir não duplica (13 linhas), município → estado → Brasil (inclusive cidade com
  apóstrofo e cidade de outro estado com o mesmo nome), as duas organizações leem o mesmo e `maestro_app` não grava,
  muda nem apaga (42501), 10 semanas coletadas ficam 8, ANP fora = 502 com as semanas guardadas, coleta de reserva só
  com semana velha e uma vez por hora; `cache_combustivel` removida. Maestro `npm test` **357/357**.
- E2E HUB `tests/e2e/admin.spec.ts` (custos) com o Banco Central falso: fora do ar → "Usar valor manual" (R$ 1.331),
  metas na folha própria, agendamento 401/200, manual continua valendo, "Voltar ao automático" (R$ 1.260, "Banco
  Central, dd/mm"), auditoria; `admin.spec.ts` + `a11y.spec.ts` **7/7**. E2E Maestro `produtora.spec.ts` (computador)
  **7/7**, com o combustível automático: agendamento 401/200, gasolina de São Paulo/SP, etanol caindo no Brasil, R$ por
  km e total, preço digitado que fica no orçamento ao fechar e abrir, "Usar o da ANP" e a linha "L de etanol".
- Root e Maestro: lint, formatação, tipos e build ok; `node scripts/scan-secrets.mjs` sem segredos. Capturas com dados
  reais (PTAX de 29/10 = 5,3744; ANP 18–24/10: São Paulo gasolina 6,33) em claro/escuro, computador/celular, fora do
  repositório. Coleta real da ANP: 1.290 linhas na semana.
- Não verificado: o Vercel Cron de verdade (precisa de `CRON_SECRET` no `absolutezro`) e as migrações `0030`/`0022` em
  produção; o e2e do Maestro no iPhone e no WebKit (o editor só roda no computador; o detector de corte não abre a
  calculadora).

## Lançamento do Maestro em Beta grátis, pronto no ramo (29/10/2026, ADR 0027)

- HUB: `tests/integration/maestro-lancamento.test.ts` (4): catálogo `beta` e gate `public_beta` com os cinco canais
  abertos a qualquer um; conta comum só com o grátis, fora de lista, fica `contracted`, `authorize` passa e o login
  único leva `maestro` em `zro_products` e `released` em `zro_release` (os fechados seguem `closed`); grátis e Completo
  sem `maestro.marca_propria`, Pro v2 (rascunho) com o Maestro inteiro e o sinal, adicional só o sinal, nenhum plano
  aposentado tocado; backfill idempotente (conta de antes ganha o entitlement uma vez; rodar a 0027 de novo não muda
  plano, entitlement nem auditoria). `lancamento-maestro-chaves.test.ts` (2): as 11 chaves do código existem, viram
  juntas e abrir + fechar devolve o arquivo idêntico; o ícone do Maestro em cada app é o oficial. Testes que diziam
  "Maestro fechado" passam ao estado de lançamento (accounts, release-gate, ia-maestro, stripe, core, downloads, e2e
  `hub.spec`). Lint, formatação, tipos, `npm test` **267/267**, build ok, e2e **26/26** (hub, a11y, admin, sso),
  `scan-secrets` limpo.
- Maestro: `npm test` **335/335** (inclui `lancamento.test.mts`: app de computador só com instalador publicado no
  catálogo, nome de arquivo estranho não vira link, cache de 5 min e HUB fora do ar = nada; manifesto e ícones;
  chave da vitrine). Build ok com a vitrine fechada e aberta. E2E com a vitrine **aberta** (todas as chaves em
  `--abrir`): **80 passaram**, 12 pulados de propósito (inclui o detector de corte em Chromium e WebKit a 375/393 px,
  claro e escuro, e `instalar.spec.ts`: manifesto, metas do Safari, `theme-color` pelo tema, a dica em Ajustes que some
  aberto como app e o app instalado sem corte). Com a vitrine **fechada** (estado do ramo): `inicio.spec.ts` +
  `instalar.spec.ts` **24/24**.
- Outros apps (no estado aberto e no fechado): SOBEDESCE `test:fast` 777 ok/4 pulados (`familia.test.js` 4), Synquei
  `npm test` 139 ok, TPeasy 53/53, NOSSOM `npm test` 105/105 + tipos e formatação, AEON `familia.test.js` 2/2, Revela
  `npm test` 147/147 (menu em ordem alfabética com o Maestro), Carro do Freela `npm run build` com o ícone na lateral
  e na gaveta. Não verificado aqui: as telas do AEON (`tela.test.js` pede `npm run vendor`, que não roda neste
  ambiente; o teste do menu passou a contar a família de `src/familia.js`).

### Deslocamento sozinho (Maestro, 29/10/2026)

- Causa do relato do titular: (1) km — Photon e OSRM estavam desligados (`MAESTRO_SERVICOS_ABERTOS` ausente, dica
  "Digite os km do trajeto.") e, ligados, a rota só media depois de escolher uma sugestão na lista; (2) preço — a
  `0022` subiu às 16h35 de 29/10 e a primeira semana só foi guardada pela coleta de reserva (`buscado_em` 20h34),
  disparada pela própria abertura da calculadora, que naquela vez já respondia "Sem preço"; o preço também olhava só a
  cidade da produtora. Corrigido: serviços ligados, lugar escolhido sozinho, preço pela saída e nova pergunta depois da
  coleta.
- Maestro `npm test` **392/392**: `deslocamento.test.mts` (21: lugar com município/UF/tipo, "sao paulo"/"SAO PAULO"/
  "São Paulo, SP" → São Paulo/SP e não o estado, "Natal, PI", capital em empate, preço município → estado → Brasil com
  e sem UF, semana velha fora, nome em dois estados, veículos e troca de combustível), `combustivel.test.mts` (9: no
  banco, nomes digitados) e o novo `rota.test.mts` (3, Photon/OSRM falsos em `tests/rota-fixture.mts`: ligados por
  padrão, busca presa ao Brasil, memória de 12 h, fora do ar lança, `=0` não sai nada).
- E2E `produtora.spec.ts` **14/14 + 2 pulados** (computador e iPhone 393 px): "sao paulo" → "Natal" digitados,
  2923,1 km pela rota falsa, gasolina de São Paulo/SP 6,11, Compacto · 14 → R$ 2.551,45, Van troca para diesel,
  consumo e km digitados com "Usar o da rota". Capturas claro/escuro, computador/393 px fora do repositório.
- Conferido ao vivo neste ambiente (Photon e OSRM públicos): São Paulo → Natal 2.921,7 km (≈ 40h44), "natal, rn" e
  Campinas → Mossoró ok. Não verificado: o comportamento em produção (deploy só com o titular) e o uso justo dos
  serviços públicos com muitas produtoras (hoje: memória por servidor e busca só ao parar de digitar).

## E-mails da central com cara de e-mail de conta (29/10/2026)

- Convite caiu em Promoções no Gmail (SPF, DKIM e DMARC conferidos no DNS: ok). `apps/hub-web/lib/email/modelos.ts`
  passa a mandar fundo branco, símbolo e logo pequenos (PNG do site em cinza, nunca anexado), título curto, um botão simples e o endereço por extenso, sem imagem
  anexada (o `imagens.ts` saiu), sem preenchimento na prévia e sem a faixa de produtos. Lint, formatação, tipos e
  `npm test` **260/260** (inclui `excluir-conta`: links só para a marca e o contato). Prévias renderizadas no claro e no
  escuro conferidas no Chromium.

## Conexões: Google Agenda pelo HUB (29/10/2026, ADR 0026)

Contra um Google falso (`tests/fixtures/google-falso.ts`: OAuth com PKCE, refresh, revogar e o pedaço da Calendar
API usado), Postgres 16 próprio.

- HUB: `tests/integration/conexoes.test.ts` (14): chave por HKDF de `ZRO_CONEXOES_KEY` (recusa sem ela ou curta);
  AES-256-GCM com contexto (outro contexto, outra chave ou byte trocado não abrem); ida ao Google com `offline`,
  `consent`, escopos e PKCE S256, cookie cifrado, curto e preso à conta; cancelar, state trocado, permissão desmarcada e
  nonce trocado viram motivos; tokens só cifrados no banco; RLS (outra pessoa não vê, não muda, não insere); agendas só
  as da conta; renovação do token vencido e `invalid_grant` → `reconectar` sem tokens e 409 `sem_conexao`; desconectar
  revoga e apaga; API: sessão do HUB e sem token = 403 `so_app`, token sem `zro.agenda` não autentica, app fechado =
  `product_closed`, sem conexão = 409 com o link, app desligado = 403, outro app no caminho = 403, conexão de uma pessoa
  não vale para outra, PUT idempotente por (app, ref) (mesmo id, uma linha), dia inteiro com fim exclusivo, evento
  forjado de outro app = 409, apagar idempotente e regravar o apagado, auditoria sem título nem lugar, "Usado por";
  livre/ocupado junta intervalos, ignora livre, recusado e os do próprio app, e renova depois de 401; limite por pessoa
  e app. Raiz `npm test` **274/274** em 34 arquivos (com `findEventCycle` e o teste do openapi com as 4 rotas novas).
- HUB e2e `tests/e2e/conexoes.spec.ts` (3): vazio, cancelar, permissão desmarcada, conectar, agendas salvando sozinhas,
  Maestro desligado, reconectar, desconectar (revogado no Google falso), celular sem rolagem lateral e a página exige
  sessão. Suíte e2e do HUB inteira **29/29** (o Google falso usa um cliente só de teste, `ZRO_GOOGLE_TESTE_*`, para o
  "Entrar com Google" seguir desligado nos outros testes); build ok.
- Maestro: `tests/agenda-google.test.mts` (14): desenho da diária (hora de Brasília com o deslocamento do dia, lugar,
  projeto, equipe, sem as notas), dia inteiro, entrega livre, prazo de card; hash estável; ninguém ligado = fila vazia;
  ligar enfileira o que a pessoa vê; PUT idempotente e sem chamada quando nada mudou; mudar hora, escalar e apagar pelos
  gatilhos; acesso por cliente (a restrita não manda o prazo do outro cliente); RLS da fila e da escolha; HUB fora do ar
  não desfaz o salvar, conta tentativa, espera e envia depois; sem conexão e sessão sem o escopo param sem contar
  tentativa; desligar tira do Google; rota do ocupado (estado, 400, 401). `tests/zro.test.mts`: a ida cai em
  `sem_agenda` e depois `basico` com invalid_scope. `npm test` **345/345**; lint, formatação, tipos e build ok.
- Maestro e2e `e2e/agenda-google.spec.ts` (computador e iPhone, 4/4) e `e2e/negocio.spec.ts` (8/8): Ajustes → Agenda
  conectada, ligar manda a diária e o prazo ao HUB falso, "Sincronizar agora" = "Tudo em dia", sem conexão leva às
  Conexões; "Ocupado no Google" segue a data do formulário (bloco 09:00–11:00, livre, sem conexão). Suíte e2e do Maestro
  inteira: **76 passaram**, 6 pulados (como antes), nenhuma falha.
- `node scripts/scan-secrets.mjs`: nenhum segredo. Capturas (claro/escuro, computador/celular) fora do repositório.
- Não verificado: o Google de verdade (consentimento, aviso de app não verificado, cotas) e as migrations no banco de
  produção.

## Maestro v2, fases 7–10: ponte com o SOBEDESCE, Drive na revisão e Arquivos (29/10/2026)

- HUB: `tests/integration/pedidos-entre-apps.test.ts` (6): pedido assinado com `aud` do SOBEDESCE, `sub` da pessoa,
  60 s e `jti` diferente a cada pedido, conferido pela JWKS; auditoria `app.pedido.emitido` com a organização; sem o
  SOBEDESCE no plano 403 `entitlement_required` (nada assinado nem auditado), menos desfazer; ação fora da lista,
  outro destino ou sessão do navegador → 403 `action_not_allowed`; credencial do app (Basic) só para
  `drive.recolher_revisao` e só para quem usa o app; limite próprio do `drive.token`. Contratos exportados
  (`npm run contracts:export`), openapi com a rota nova (teste de deriva), `packages/drive-web/test` (4: núcleo, service
  worker do stream numa vm com Range → 206, chave da aba, só mídia, CSP sandbox).
- SOBEDESCE: `web/tests/zro-maestro.test.mts` (7): outra ação, outro público e `jti` reapresentado → 401; sem o
  SOBEDESCE liberado → 403 em tudo menos recolher; listar só metadados e a miniatura no tamanho; miniatura sem byte;
  estrutura `Maestro/<Cliente>/<Projeto>/01…05` idempotente e com nomes limpos; compartilhar liga `anyone` uma vez e
  recolher só apaga ela (a do dono, nunca); token = access token (nunca o refresh) e auditoria sem o token. `web`:
  lint, typecheck e `npm test` **280/280** antes do Maestro e de novo no fim; `npm run test:fast` do motor com
  `test/drive-web.test.js` (cópias idênticas do pacote, listador com os 400 contornados) e o SW em v68.
- Maestro: `tests/drive-sobedesce.test.mts` (11): token pela ponte e não guardado; sem o SOBEDESCE 403 sem pedir ao HUB;
  HUB negando = 403; sem Drive = 409 com onde conectar; estrutura do projeto idempotente e pasta ligada; compartilhar ao
  gerar o link e em versão nova com link ativo; revogar desfaz pela pessoa e, quando foi outra pessoa, pela credencial
  do Maestro; cron 503 sem segredo, 401 com o errado e desliga o que venceu; `urlConfere`; cópias de
  `packages/drive-web`. `npm test` **302/302** (com a main); e2e `arquivos.spec.ts` (6, computador e iPhone): cadeado, navegador,
  migalhas, filtro, prévia com `00:00:02` real pelo service worker, Abrir no SOBEDESCE, estrutura, sem rolagem lateral,
  o Drive tocando na revisão com o timecode e Escolher no Drive. Suíte e2e inteira 57/57 (1 pulado, como antes).
- Capturas (claro, escuro e iPhone) geradas pelo e2e com `SHOTS_DIR` (fora do repositório).

## Carro do Freela: banco próprio, perfil e inventário (29/10/2026)

- `products/carro-do-freela`: `npm run test:banco` **24/24** (Postgres 16 local, um banco descartável por arquivo):
  migrações num banco vazio e de novo sem efeito; recusa da migração editada, sumida e fora de ordem; a 0000 aplicada
  por um login **sem superusuário** num schema `carro_do_freela` que reproduz o de produção (`cadastros`, `leads`,
  `passos`, `anon` só INSERT) — tabelas, colunas, permissões, políticas e linhas antigas iguais antes e depois, `anon`
  sem acesso às tabelas novas; RLS com duas contas (ler, mudar, apagar e criar em nome da outra: nada passa) e
  `carro_do_freela_app` sem acesso à fila e ao diário; o banco recusando telefone e link de WhatsApp; a fila com um
  retrato por transação, conferido contra os JSON Schemas `freela.inventario.v1` e
  `event.freela.inventario.atualizado.v1`, inclusive vazio e com 500 itens (o 501º é recusado); o publicador desligado
  por padrão, e ligado mandando só o mais novo com `Idempotency-Key`, com recusa, erro e rede caída indo para
  `revisao` sem nova tentativa; as rotas `/api/zro/perfil` e `/api/zro/inventario` contra a Absolute ZRO falsa (sessão
  obrigatória, portão, plano, conta de outro, mesma origem, JSON, campos de telefone/CPF/e-mail recusados, isolamento
  entre contas, banco desligado = 503, limite = 429); e a tela num Chromium (bloco ausente sem sessão, grava perfil e
  item, recusa telefone dizendo por quê, edita, remove, some com o banco desligado).
- `npm run test:api` **43/43** (login, sem mudança de comportamento); bateria de navegador `npm test` **88/88**
  (`versoes` refeita sozinha depois de o template mudar no meio da rodada; `conta-zro` e `sem-zoom` passaram sozinhas,
  como o arnês manda); `npm run build:vercel` ok, com `perfil` e `inventario` empacotadas com o `pg`.
- Raiz: `node scripts/scan-secrets.mjs` sem segredo; Vitest de `freela.inventario` (contrato e rota desligada) 6/6.
- Produção **não** foi tocada: o schema `carro_do_freela` foi só lido (três tabelas antigas, 1/0/375 linhas, sem
  papéis do Carro). Passos para ligar em `products/carro-do-freela/db/PRODUCAO.md`.

## Z lendo o Maestro, só leitura (29/10/2026)

- HUB: `tests/integration/ia-maestro.test.ts` (novo, 8): Maestro liberado e no plano → um `POST` em
  `/api/zro/maestro/resumo` com `zro-pedido+jwt` conferido pela JWKS (`alg` ES256, `iss`, `sub` da pessoa, `aud`
  `maestro-web`, `zro_pedido` `maestro.resumo`, vida de 60 s, `jti` no formato que o Maestro aceita e novo a cada
  leitura); resposta com fonte, `citar_como` e dinheiro em reais; auditoria `ia.maestro.leitura` sem conteúdo lido.
  Gate fechado e Maestro fora do plano → **nenhum pedido sai** e a recusa fica na auditoria. Sem dinheiro (papel
  equipe/leitura) → nada de R$. Falhas (`sem_vinculo`, `devagar`, 401, rede) viram frases e ficam na auditoria; link
  estranho some, listas cortadas. `ia-plataformas.test.ts`: `ver_maestro` só com o Maestro `contracted`, guia diz "só
  leitura". `ia-drive.test.ts` e `flows`/`findEventCycle` seguem passando. Raiz: `lint`, `format:check`, `typecheck`
  ok; `npm test` **247/247** em 31 arquivos; `apps/hub-web` build ok.
- Maestro: `resumo-z.test.mts` com 2 novos: o pedido como o HUB assina (`jti` uuid) aceito uma vez e recusado ao
  reapresentar; ação de escrita (`maestro.pedido.criar`) recusada mesmo assinada para ela (`ACOES_ABERTAS`). Seguem
  os de `aud` errado, ação errada, vida longa, assinatura errada e sem token. `lint`, `typecheck`, `npm test`
  **291/291** e `build` ok. `node scripts/scan-secrets.mjs`: nenhum segredo.
- **Não validado**: a chamada real entre os dois projetos Vercel em produção (sem deploy neste corte).

## Maestro: funil, Números, importar planilha, agenda .ics e acesso por cliente (28/10/2026)

- `products/maestro`: `lint`, `format:check`, `typecheck` ok; `npm test` **289/289** (Postgres 16 local, migrations
  0000–0018). Novos: `funil.test.mts` (regras puras; Ganho barrado sem orçamento aprovado na tela e no banco, Perdido
  exige motivo e vira recusado, reabrir limpa, leitura não move, gerar orçamento e aprovar o orçamento andam sozinhos,
  Ganho é final; retornos de pedido e cliente, "contato feito" com histórico e Novo → Em conversa, reagendar; duas
  organizações), `numeros.test.mts` (taxa, ticket, margem, período, meta e ritmo; números de um mês conhecido batendo
  com o banco; meta só admin e gestão; equipe e outra organização sem dinheiro), `importar.test.mts` (separador, aspas,
  BOM, CRLF, Windows-1252, limites de 1 MB, 2.000 linhas, 40 colunas e célula; mapa pelos cabeçalhos; datas, valores,
  WhatsApp e erros por linha; prévia não grava; confirmar, reimportar igual, atualizar só o que mudou; sha256 trocado
  recusado; equipe e leitura não importam; projetos pelo nome do cliente; freelas com `zro_sub`; equipamentos com e
  sem patrimônio; duas organizações; as planilhas de exemplo sem erro), `agenda-ics.test.mts` (RFC 5545: CRLF, dobra
  em 75 octetos em UTF-8, escape, dia inteiro com fim exclusivo, TZID e VTIMEZONE, DTSTAMP; só o hash no banco; trocar
  e desligar; acesso por cliente no feed; Maestro fechado no último login ou pessoa desativada = morto; cada um só o
  próprio endereço), `acesso-cliente.test.mts` (pessoa restrita vê exatamente a linha do cliente dela em 21 tabelas,
  restrita a nenhum não vê nada ligado a cliente, admin e gestão nunca restritos, só gestão muda, não grava fora nem
  por `card_*` e `versao_criar`), `negocio-rls.test.mts` (as seis tabelas novas com RLS e duas organizações),
  `resumo-z.test.mts` (pedido assinado: typ, assinatura, ação, `aud`, vida e uso único; equipe restrita sem dinheiro;
  sem acesso = 404). `hoje.test.mts` e `demo.test.mts` cobrem as listas do dia, o caixa da semana e a demonstração do
  funil. `npm run build` ok.
- `npm run test:e2e` **51/51 + 1 pulado**. Novo `e2e/negocio.spec.ts` (computador e iPhone): funil (Ganho travado, Em conversa,
  próximo contato hoje → Retornar hoje no Hoje → "Amanhã" tira da lista; Perdido com motivo), importar (prévia com
  erro por linha e nada gravado, importar, reimportar igual), agenda (o endereço serve `text/calendar`, baixar o .ics,
  desligar dá 404) e acesso por cliente (a gestão restringe em Pessoas; a pessoa restrita não vê o outro cliente nem o
  projeto dele, e a ficha dele dá "não existe"). `visual.spec.ts` com Pedidos, Números, Pessoas, Agenda e Importar nas
  quatro horas e no escuro; `produtora.spec.ts` com o quadro do funil e Números; `inicio.spec.ts` com os itens novos.
- Capturas (claro a 1440 px, claro no iPhone, escuro a 1440 px) de Hoje, Pedidos, ficha do pedido, Números, Importar,
  Agenda no celular e Pessoas conferidas à mão.
- **Não está no ar / não validado**: eventos no HUB
  (desenhados em `docs/integration-contracts/maestro-z.md`); sincronia com o Google Agenda; o .ics num iPhone ou Google
  Agenda de verdade (validado pelo formato e pelo download).

## Maestro v2: marca, pedido público, aceite, Hoje e kit do freela (28/10/2026)

- `products/maestro`: `lint`, `format:check`, `typecheck` ok; `npm test` **234/234** (Postgres 16 local, migrations
  0000–0013). Novos: `marca.test.mts` (PNG, JPEG e WebP reencodados em WebP ≤ 1024 px e sem metadados; SVG, GIF, texto,
  vazio, PNG falso e arquivo grande recusados; contraste da cor; só admin grava; B e organização forjada não veem;
  logo público só com organização e sha certos, cache imutável), `pedidos.test.mts` (link só admin e gestão, banco com
  sha256 e cópia cifrada; formulário sem preço nem multiplicador; armadilha não grava; selo de tempo rápido, adulterado
  e de outro link recusados; consentimento e contato obrigatórios; chave do aparelho não duplica; 5/h por IP; Origin
  conferido; revogar mata na hora; "Gerar orçamento" monta as linhas iguais ao motor com nicho e entregas do pedido e
  cria o cliente lead, idempotente; link do orçamento só admin e gestão; o cliente não vê custo, margem nem nota; aceite
  confere nome e aceite, abre projeto, ativa o cliente e lança as parcelas uma vez; sem cliente o aceite cria; versão
  nova barra o aceite e derruba o link antigo; vencido e revogado mortos; a B não acha nada), `hoje.test.mts` (as
  contagens da A, zero para a B e a forjada, dinheiro escondido da equipe mesmo pedindo), `freela-equipamentos.test.mts`
  (validação, papéis, filtro por categoria, aluguel × dias no a pagar, item de outro freela barrado no banco,
  sincronização pelo `sub`: idempotente, desativa o que sumiu, só leitura para `maestro_app`). `produtora-rls.test.mts`
  com as cinco tabelas novas; `demo.test.mts` com marca, pedidos, aceite, kits e remoção. `npm run build` ok.
- `npm run test:e2e` **35/35 + 1 pulado**. Novo `e2e/comercial.spec.ts` (computador e iPhone): marca, criar o link de
  pedido, o cliente num navegador limpo preenche o formulário (tipo, nicho, vídeos, diárias, local, faixa, ideia,
  contato e consentimento), Pedidos, "Gerar orçamento" (R$ 8.190,00 pelo motor), link com 2 parcelas, o cliente vê o
  timbrado sem custo e aceita, o projeto `MAE-` nasce, Hoje sem rolagem de lado; link desconhecido em `/p` e `/o` dá a
  tela neutra. `produtora.spec.ts` ganhou Pedidos, filtro de kit, Hoje, logo de exemplo e kit no perfil.
- Raiz: `packages/media-contracts` (`freela.inventario/1` estrito: sem e-mail, CPF ou telefone; evento
  `freela.inventario.atualizado`) e `packages/integrations` (rota desligada fora de `ROUTES` e `HANDLERS`, sem ciclo
  somada às ativas) com testes; `npm run contracts:export` em dia; `typecheck` ok.
- Capturas (claro e escuro a 1440 px, claro no iPhone) de Marca, Link de pedido, formulário público, Pedidos, orçamento
  automático, aceite e Hoje conferidas à mão.
- **Não está no ar / não validado**: o inventário do Carro do Freela (contrato, evento e importação prontos, mas nada
  publica nem chama: o Carro não tem banco); retenção configurável dos pedidos (hoje só apagar a pedido); o app inteiro
  com a marca da produtora (white-label); `sharp` no runtime da Vercel (é o mesmo binário que o Next já usa).

## Maestro v2: a produtora por dentro (28/10/2026)

- `products/maestro`: `lint`, `format:check`, `typecheck` ok; `npm test` **199/199** (Postgres 16 local, migrations
  0000–0010). Novos: `orcamento.test.mts` (motor: totais iguais ao `quoteTotals` do ZRO, desconto, margem e saúde,
  faixas por quantidade, multiplicador por nicho, parcelas; numeração, versão nova, só rascunho edita, aprovar cria
  projeto e entradas uma vez), `deslocamento.test.mts` (rodagem, litros e custo de ida e volta com pedágio, linha
  do orçamento, leitura das respostas do Photon e do OSRM, planilha da ANP num xlsx de teste aberta pelo zip do Node,
  zip estragado recusado), `financeiro.test.mts` (somas de a
  pagar/a receber, baixa parcial e total pelo gatilho, desfazer, fluxo e resultado por mês, recorrência gerada uma vez
  por mês, escala vira lançamento e acompanha mudança e remoção), `operacao.test.mts` (reserva dupla barrada no banco,
  também com dois pedidos ao mesmo tempo; vizinha, cancelada e outro item passam; saída e retorno; freela: valores,
  CPF/PIX conferidos e cifrados; escala na diária com aviso de conflito; ordem do dia e checklist) e
  `produtora-rls.test.mts` (duas organizações em todas as tabelas novas: a B não lê nem escreve na A, `org_id`
  forjado recusado; leitura e equipe sem Financeiro; CPF/PIX só admin e gestão, no banco só cifrados, outra org não
  abre). `demo.test.mts`: a demonstração preenche todos os painéis, recarregar só completa (idempotente), remover tira
  tudo o que é demo e mais nada. `npm run build` ok.
- `npm run test:e2e` **29/29 + 1 pulado** (o editor do orçamento só no computador). Novo `e2e/produtora.spec.ts`:
  carrega a demonstração pela tela de Ajustes, cada painel cheio, sem erro e sem rolagem de lado (computador e iPhone),
  timbrado com total e sem custo/margem, deslocamento digitado (100 km, 10 km/L, R$ 6,00 → R$ 120,00) entra no total e
  salva, conflito de escala na agenda. Navegação em grupos e aba Mais conferidas em `inicio.spec.ts`.
- Capturas (claro e escuro a 1440 px, claro no iPhone) de cada painel novo com a demonstração conferidas à mão.
- Não validado: Photon, OSRM e ANP de verdade (desligados até a ciência do titular; o parser da ANP só com planilha
  de teste), `btree_gist` no Supabase (sem ele vale só o gatilho, que também barra), PDF fora do Chromium.

## Maestro v2, fases 3–6: aprovação do cliente com vídeo por link (28/10/2026)

- `products/maestro`: `lint`, `format:check`, `typecheck` ok; `npm test` **149/149** (Postgres 16 local). Novos:
  `fontes.test.mts` (tabela do detector: 27 links aceitos e normalizados de Drive, YouTube, Vimeo, Dropbox, mp4/mov/webm,
  HLS e genérico; 15 recusados: http, `javascript:`, usuário e senha, localhost/IP, pasta, ids curtos, comprido demais;
  capacidades e endereços do Drive; tempo, timecode, leitura do tempo digitado, CSV sem fórmula e EDL de marcadores) e
  `revisao.test.mts` (duas organizações: a B não vê nem alcança lote, versões e comentários da A; leitura não cria
  versão; `maestro_app` não escreve direto; comentário idempotente, o texto não muda nem pelo dono; só admin e gestão
  geram link; banco só com o sha256; 30 dias; abrir sem vazar e-mail, sub, ids nem o token; sem organização,
  `maestro_app` não lê nenhuma tabela e a função interna é fechada; peça e versão têm de ser do lote; nome, aceite e
  "o que ajustar" obrigatórios; versão velha recusada; decisão vale uma vez por peça e volta e move o card; versão nova
  sobe a volta e reabre a decisão; revogado, vencido, lote fechado e token desconhecido dão a mesma resposta; PIN:
  tela do PIN, 5 erros em 15 min bloqueiam, cookie adulterado não vale, scrypt no banco; 120 aberturas/h por link e 30
  links mortos/h por IP; IP nunca em claro). `rls.test.mts` cobre `versoes` e `comentarios`; `demo.test.mts` confere as
  aprovações da demonstração, a complementação única e a remoção total. `npm run build` ok.
- `npm run test:e2e` **20/20** no computador e no iPhone. Novo `e2e/aprovacao.spec.ts`: equipe cria o lote, cola mp4
  local (servido com Range), YouTube e Vimeo falsos, comenta no tempo e gera o link (cards → Em aprovação); cliente sem
  conta (cabeçalhos `noindex`, CSP, `strict-origin`; nada de e-mail ou sub no HTML) comenta no tempo com pino, aprova,
  pede ajuste, revisa e envia com nome e aceite; o Quadro anda (Aprovado/Revisão); a equipe vê a decisão e exporta
  CSV e EDL; revogado vira a tela neutra; API recusa outra origem e token morto. Página inicial com Aprovação em "Já
  funciona".
- Capturas (claro/escuro, 1440 px e iPhone) da equipe e do cliente conferidas à mão, com a demonstração.
- Não validado: chave de API do Google de verdade (o titular cria; sem ela o Drive toca pelo iframe com tempo
  digitado), YouTube e Vimeo de verdade (só os falsos no e2e), HLS com hls.js num servidor real, Safari de verdade.

## Maestro v2, fases 0–2: página inicial, lista de espera e sistema visual (28/10/2026)

- `products/maestro`: `lint`, `format:check`, `typecheck` ok; `npm test` **86/86** (Postgres 16 local). Novos:
  `lista-espera.test.mts` (entra com consentimento, mesmo e-mail em outra caixa não duplica e responde igual, sem
  consentimento ou e-mail ruim não grava, armadilha não grava nem conta tentativa, 5/h por IP com outro IP seguindo,
  IP só como HMAC; `maestro_app` com organização e vínculo válidos não lê/insere/muda/apaga a tabela, a função recusa
  sem consentimento chamada direto, RLS ligado) e `temProduto` em `acesso.test.mts`. `npm run build` ok.
- `npm run test:e2e` (novo, Playwright 1.63, Chromium, build local + banco `maestro_test_e2e`) **14/14** no computador
  e no iPhone: página inicial (título, selo, capturas carregadas, "Em breve" na aprovação, `mailto`, sem rolagem de
  lado), OG/robots/sitemap, "Quero acesso" (pede consentimento, guarda), sessão vê "Abrir o Maestro", símbolo anima com
  movimento e nada anima com "reduzir movimento", navegação com a Z primeiro e os grupos.
- Capturas antes/depois (claro e escuro, computador e iPhone) da inicial, do Quadro e de Clientes conferidas à mão.
- Não validado: produção (nada publicado), Safari de verdade (a revelação por rolagem usa `animation-timeline`; sem
  suporte, a seção aparece pronta).

## Console da plataforma redesenhado (28/10/2026)

- Raiz: `lint`, `format:check`, `typecheck` ok; `npm test` **231/231** em 27 arquivos (Postgres 16 local); `npm run build`
  ok; `npx playwright test` **26/26** (axe WCAG A/AA claro e escuro em `/admin`, `/admin/pessoas`, ficha, `/admin/planos`,
  `/admin/lancamento` e `/admin/apps`; 390 px sem rolagem horizontal).
- `tests/integration/people.test.ts` (+5): segmentos ecossistema/avulso/grátis/sem plano e as abas somando o total;
  online (sessão do HUB nos últimos 15 min, token de app renovado; parado há 20 min e conta suspensa não contam) e
  filtro por produto; arquivos só do manifesto importado pela pessoa; páginas de 50 (página além do fim); visão geral
  (créditos de IA, série de 30 dias, pessoas por plano e por app).
- `tests/e2e/admin.spec.ts`: 404 para quem não é da plataforma em todo o console e em `/admin/online`; número online
  confere com a rota; segmento Grátis → Avulso depois da troca de plano na ficha; CSV com a coluna segmento.
- Capturas antes/depois (claro/escuro, 1440 px e iPhone) feitas com dados fictícios locais; não entram no repositório.

## Z Fase 1 e entrada dos apps na tarefa (28/10/2026)

- Raiz: `lint`, `format:check`, `typecheck` ok; `npm test` **223/223** em 27 arquivos (Postgres 16 local, banco
  próprio `zro_agz_test`). Novos em `tests/integration/ia-drive.test.ts`: `ver_transferencias` assina
  `transferencias.ler`, cita fonte e hora ("segundo o SOBEDESCE, às 14:02"), separa fato de estimativa, avisa relato
  antigo/computador fechado, sem dado diz que não sabe, SOBEDESCE fora do ar não inventa; `acao_exata` antes do
  "sim"; `confirmacaoClara` com formato; auditoria de `pedir_ao_computador` (recusa sem confirmação, pedido, já na
  fila, falha; sem nome de arquivo nem id do Drive na auditoria).
- SOBEDESCE web: `lint`, `typecheck` ok; `npm test` **271/271**. Novo `tests/zro-transferencias.test.mts`: sem token,
  vencido, vida longa, outro público, assinatura errada e outra ação = 401; jti reapresentado = 401; sem vínculo 404;
  sem o SOBEDESCE liberado 403; cada conta vê só os próprios computadores; contagens, conferências, lotes e hora do
  relato; sem caminho local (Mac, Windows, rede), token nem id de sessão; sem computador = lista vazia.
- SOBEDESCE motor: `npm run test:fast` 744/748 (3 pulados; 1 falha intermitente em `lan.test.js` "outra conta",
  temporização, que passa 7/7 rodando o arquivo sozinho). Novos `test/entrada.test.js` e
  `test/entrada-celular.test.js`; `app-sw.test.js` confere SW v67 / app 2.8.52.
- Synquei `npm test` 123 ok (4 pulados), novo `tests/entrada.test.mjs`; TPeasy `node --test tests/*.test.mjs`
  **53/53**, novo `tests/entrada.test.mjs`; Maestro `lint`, `typecheck` ok e `npm test` **70/70**, novo
  `tests/entrada.test.mts` (login sem volta agora cai em `/app`).
- `node scripts/scan-secrets.mjs`: nenhum segredo. Nada publicado, nenhum instalador gerado, nenhum banco remoto tocado.
  Não rodados aqui: `npm run build` e `npm run test:e2e` da raiz.

## SOBEDESCE → Synquei: "Preparar no Synquei" depois do download do Drive (28/10/2026)

Rodado neste ambiente (Linux, Node 22, Postgres 16 local, banco próprio `zro_sdsq_test`), como root (por isso os
testes de permissão de arquivo pulam: root lê tudo). Nada publicado, nenhum instalador gerado, nenhum banco remoto.

| Onde            | Comando                                                     | Resultado                                                                             |
| --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| SOBEDESCE motor | `npm run test:fast`                                         | **745/749** ok, 4 pulados (já pulavam + permissão como root), 0 falhas                |
| SOBEDESCE site  | `cd web && npm run lint && npm run typecheck && npm test`   | lint e tipos ok; **263/263**                                                          |
| Synquei         | `npm test`                                                  | **133/138** ok, 5 pulados (4 sem LuaJIT, já pulavam; 1 permissão como root), 0 falhas |
| Raiz            | `npm run lint && npm run format:check && npm run typecheck` | ok                                                                                    |
| Raiz            | `TEST_DATABASE_URL=…/zro_sdsq_test npm test`                | **220/220** em 27 arquivos                                                            |
| Raiz            | `node scripts/scan-secrets.mjs`                             | nenhum segredo                                                                        |

Coberto por teste automático (seção 6 do plano):

- **Concluída:** `products/sobedesce/test/preparo-synquei.test.js` baixa uma pasta de verdade pelo mock do Drive e
  confere a linha v2 (MD5 de cada arquivo, id da pasta, `op` = lote) e o link com `op`.
- **Interrompida / em andamento:** lote com arquivo baixando, pausado, com falha ou com MD5 diferente não grava
  manifesto nem mostra o botão; arquivo `.sobedesce-part` não entra no Synquei.
- **Ausentes, movidos, alterados:** `products/synquei/tests/preparo-drive.test.mjs` (apagado → ausente; tamanho
  diferente ou baixando de novo → alterado; mesmo nome e tamanho em outro lugar → movido; dois candidatos → ausente) e
  o recibo diz cada um; "preparado" com pendência no disco vira "com pendências".
- **Permissões:** pasta sem leitura recusa com explicação; sem permissão de gravar, o SOBEDESCE não oferece o botão
  (os dois pulam como root; rodar como usuário comum).
- **Vários formatos:** resumo da página com MP4, MOV, WAV, BWF, MXF, texto e arquivo quebrado (organizados,
  sincronizados, ignorados, sincronia ambígua para revisar).
- **Repetição sem duplicar:** o mesmo `op` já preparado só grava um recibo `repetido`; a mesma pasta continua uma só;
  linha nova do mesmo `op` reprocessa como uma operação; o SOBEDESCE não regrava a mesma linha.
- **Retomada:** outro Organizador (app reaberto) devolve a operação pendente; recibo atrasado depois do "não
  confirmou" ainda vale.
- **Synquei fechado/indisponível:** sem recibo em 45 s, o lote diz "O Synquei não confirmou · Atualizar o Synquei";
  ponte sem Synquei abre a central (`absolutezro://baixar`) ou absolutezro.com/baixar; link estranho não abre nada.
- **Manifesto inválido/adulterado:** campo a mais, `..`, caminho absoluto, letra de unidade, `\`, NUL, segmento vazio,
  `.sobedesce-part`, contagem/estado/bytes mentindo, repetido, 50.001 arquivos — recusados nos três leitores
  (SOBEDESCE, Synquei, `packages/integrations`); recibo adulterado, de outro `op` ou pela metade fica de fora.
- **Disco desconectado (simulado):** pasta renomeada some sem quebrar nem marcar pronto e volta a andar; no SOBEDESCE,
  "Preparar" recusa com "a pasta baixada não está mais lá" e o lote mostra "Pasta inacessível".
- **Caracteres especiais:** acentos, espaço, `#`, `&`, `%`, emoji no link; arquivo em NFD no disco com manifesto em NFC.
- **Volume:** validação de 50.000 arquivos < 3 s; 80 arquivos esparsos de 4 GB (~320 GB declarados) conferidos sem ler
  os bytes.
- **Regressões:** cartões v1 e Drive v2 no mesmo `descargas.jsonl`; toda a bateria anterior dos três lados passa.

Roteiro manual (precisa de computadores e discos reais; não feito aqui):

1. **Mac (Apple Silicon) e Windows 11**, builds locais de SOBEDESCE e Synquei (`npm run desktop` em cada um):
   baixar uma pasta do Drive com subpastas, acentos e um Doc Google; ao fim, o lote mostra "Preparar no Synquei" com
   "N de M conferidos (MD5) · 1 sem conferência"; tocar abre o Synquei, que pergunta "Preparar …?"; confirmar e ver
   o lote passar por "Aguardando" → "Preparando" → "Preparado"/"Preparado · N pendências".
2. **Synquei fechado:** repetir com o Synquei fechado (o sistema abre e o pedido fica pendente até o Organizar subir).
   **Não instalado:** com a central Absolute ZRO instalada, abre a página Downloads dela; sem a central, o navegador
   em absolutezro.com/baixar. **Synquei antigo:** em 45 s o lote diz "O Synquei não confirmou".
3. **HD externo USB:** baixar para o HD, desplugar no meio da preparação (o Synquei mostra erro sem marcar pronto;
   o SOBEDESCE mostra "Pasta inacessível"), plugar de novo e "Preparar no Synquei" outra vez (nada duplica).
   No macOS, conferir o pedido de acesso a Volumes Removíveis (TCC) nos dois apps.
4. **300+ GB reais** (câmeras RAW/BRAW e áudio): tempo da conferência no Synquei, memória dos dois apps, tamanho da
   linha v2 e do `organizador.json`, e se a sincronia aguenta a quantidade.
5. **Repetir** o mesmo "Preparar" depois de pronto: um recibo `repetido`, nenhum projeto, clipe ou importação no
   DaVinci a mais. Apagar um arquivo e repetir: volta como pendência.
6. **Windows:** caminho longo (> 260), nomes reservados e unidade de rede; **macOS:** pasta com nome em NFD.

## Maestro: Etapa 1, Quadro + Clientes + Projetos (28/10/2026)

- `products/maestro`: `lint`, `format:check`, `typecheck` ok; `npm test` **66/66** (Postgres 16 local, bancos
  `maestro_test_*`). Novos: `quadro.test.mts` (rota `/api/quadro`: 401 sem sessão, 403 de outra origem, criar com
  cliente/responsável/prazo/prioridade, mover com `colunaEm`, campo fora do método recusado, **conflito por campo**
  devolve 409 com o card atual e não desfaz a mudança de quem chegou antes, leitura não escreve mas lê, outra
  organização não vê nem alcança cliente, card ou pessoa da outra, lápide sai da lista e aparece no "desde",
  restaurar, número repetido não sobrescreve; método: próximo passo, ordem entre vizinhos, filtros) e
  `crm.test.mts` (validação e WhatsApp normalizado para `wa.me`, busca por nome/contato/WhatsApp com curinga
  escapado, código `MAE-AAAA-NNN` em sequência por organização e sem colisão em paralelo, `link_status` pendente,
  outra organização não vê nem muda, leitura não cria nem muda). `build` ok.
- Navegador (Chromium do Playwright, `next start` com banco local fictício): criar card, arrastar da Pauta para
  Fazendo, persistir no recarregar, próximo passo, busca, apagar e Desfazer, outra aba recebe pelo poll em ≤ 6,5 s,
  "Mover para…" no celular (390 px), cliente com erro por campo mantendo o que foi digitado, projeto com o próximo
  código; console sem erros. Capturas 1440/390, claro e escuro, fora do repositório.
- Não validado: a migration `0002` no Supabase de produção (aplica no próximo deploy pelo `vercel-build`).

## Maestro aberto em teste (28/10/2026)

- Raiz: `lint`, `format:check`, `typecheck` ok; `npm test` **202/202** (banco próprio `zro_maestro_open_test`): release
  do Maestro (`public_beta`, web/api/sso sim, desktop/download não), planos (grátis, Completo e Pro com 8 apps; sem
  avulso), 0022 reaplicada dá o entitlement uma vez só, `maestro-web` por script (só sha256, escopos `zro.ia` e
  `maestro.projects`, idempotente). `build` ok; e2e `hub.spec.ts` **14/14** (órbita com o Maestro, Ciclo do O
  bloqueado por assinatura, `/planos` sem avulso do Maestro, 4 apps em Acessos).
- `products/maestro`: `lint`, `typecheck`, `format:check` ok, `npm test` **49/49** (claim `zro_release`: closed,
  allowed, ausente e released, relida no `/eu`), `build` ok, `db:migrate` aplica `0000` e `0001` e é idempotente.
- Não validado: produção (projeto Vercel, domínio, cliente OIDC real, migrations no Supabase).

## Olho no campo de senha (28/10/2026)

Pedido do titular: em todo campo de senha, um olho dentro do campo, à direita, para mostrar e esconder o que foi
digitado. Botão `type="button"` (não envia o form), `aria-label` "Mostrar senha"/"Ocultar senha", `aria-pressed`,
clique sem tirar o foco do campo e com o cursor no mesmo lugar, `autocomplete` mantido, ícone em `currentColor` cinza.

- HUB: `CampoSenha` em `@zro/ui/senha` (`packages/ui/src/senha.tsx`, estilo `.zro-senha` em `components.css`) em
  /entrar, /criar-conta e /app/entrar (conversa, olho à esquerda da seta), /redefinir-senha, Perfil e segurança (trocar
  e-mail, trocar senha) e Excluir a conta. O app de computador carrega o site e herda. `packages/ui/test/senha.test.ts`
  (4) e o E2E "entrar é uma conversa…" (mostra, foco no campo, `autocomplete`, não envia, esconde). `lint`,
  `format:check`, `typecheck`, `npm test` (218/218 em 28 arquivos), `build` e `test:e2e` (26/26, axe claro e escuro) ok.
- SOBEDESCE site (`web/src/components/ui/senha.tsx`): entrar, nova senha, conta (trocar senha, trocar o Google) e
  apagar a conta. `web/tests/senha.test.mts` (nenhum campo de senha sem olho; HTML do olho). `lint`, `typecheck`,
  `npm test` (265/265) ok. Celular (`web/public/app`): sem campo de senha.
- SOBEDESCE computador (`public/components/senha.js` + `public/lib/senha.js`): client secret da chave manual
  ("Mostrar chave"). `test/senha.test.js` (rótulos, troca com cursor preservado, nenhum `type="password"` solto em
  `public/` e `web/public/app`). `npm run test:fast` 739/742 (3 pulados, 0 falhas). Chega às pessoas só com um novo
  build do app de computador.
- NOSSOM (`components/password-field.tsx`): entrar (já tinha olho, agora no componente) e Conta (senha para trocar
  e-mail, senha atual, nova senha). `tests/password-field.test.ts`; `typecheck`, `format:check`, `npm test` (103/103).
- Carro do Freela: o login já tinha o olho (`lg-olho`). Synquei, TPeasy, Maestro, AEON e Revela: sem campo de senha
  (entram pela Absolute ZRO).

## Excluir a conta (28/10/2026)

- `tests/integration/excluir-conta.test.ts` (12): exclusão feliz (anonimiza, todas as sessões caem, organização só dela
  `closed` com assinatura e acessos encerrados, auditoria sem e-mail nem nome, conta e organização não voltam); e-mail
  liberado para recadastro; conta só do Google confirma com o e-mail e o Google depois cria conta nova; refresh token e
  userinfo do login único recusados; bloqueio por organização com membros (e saída quando há outro dono); membro sai
  sem encerrar a equipe; bloqueio por assinatura paga (liberado com cancelamento no fim do período); admin de
  plataforma; sem sessão e token de app recusados; limite de tentativas; isolamento (zro_app não muda e-mail nem
  status, a equipe deixa de ver a conta excluída); e-mail de confirmação só com links da marca e do contato.
- E2E `hub.spec.ts` "excluir a conta…": senha errada, confirmação, `/conta-excluida`, sem cookie, `/inicio` → `/entrar`
  e o mesmo e-mail cria conta nova. `a11y.spec.ts` passa por `/perfil/excluir` e `/conta-excluida` (claro e escuro).
- `npm run lint`, `format:check`, `typecheck`, `npm test` (214/214 em 27 arquivos), `npm run build` e
  `npm run test:e2e` ok neste ambiente (Postgres local, banco próprio). Telas 1440 e 390 (claro) conferidas.
- Não validado: migração 0023 no banco de produção e o envio real do e-mail.

## AEON e Revela fechados ao público (28/10/2026)

- `products/ai-edit`: `npm test` 122/122 (novo `test/fechado.test.js`: anônimo, conta `closed`, conta `allowed`, sessão
  antiga sem a claim, liberação tirada no HUB, `RELEASE=released`; `publicar-site.mjs` fechado sem `app/`, `src/` do
  editor e `presets/`; `instalar.sh`/`.ps1` só com o recado; `/baixar/*` → home).
- `products/finishing`: `npm test` 146/146 (ferramentas `inicio`, `lut`, `cst`, `entrega`, `converter` só pela função
  `api/app.js` com conta `allowed`; manifesto sem atalhos; CSP de produção).
- Telas Playwright 1440 e 390 das homes e da página "Em desenvolvimento" conferidas (claro e escuro).
- Não validado: o HUB emitindo `zro_release` (contrato simulado em `test/zro-falso.js`), deploy na Vercel e o
  atualizador do desktop com o Release em rascunho.

## Originais

```
OK  /home/user/nossom · HEAD f04e517 (cópia: f04e517) · git status limpo
OK  /home/user/synquei · HEAD a5ac3f1 (cópia: a5ac3f1) · git status limpo
OK  /home/user/baixadordodrive · HEAD 21f3a63 (cópia: 21f3a63) · git status limpo
OK  /home/user/tpeasy · HEAD dfa91e3 (cópia: dfa91e3) · git status limpo
OK  /home/user/carrodofreela-app · HEAD 5fc93a7 (cópia: 5fc93a7) · git status limpo
```

## Cobertura por critério de aceite (PRD §14)

| Critério                                                                            | Evidência                                                                         |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Repositório independente, commits, README e CLAUDE.md                               | este repositório, `git log`                                                       |
| Originais documentados com SHA e sem alteração                                      | `products/*/SOURCE_MANIFEST.md`, `check-originals.mjs`                            |
| Integrações com origem comprovada; pendências claras                                | `docs/architecture/source-inventory.md`, `docs/roadmap.md`                        |
| Cadastro/login, organização, projeto, convite, troca de organização                 | `auth.test.ts`, `core.test.ts` (equipe), E2E                                      |
| Sem assinatura → 403 inclusive por URL direta                                       | E2E "API: sem assinatura recebe 403", `flow.test.ts` caso A                       |
| Isolamento entre organizações                                                       | `rls.test.ts` (14 testes), `core.test.ts`                                         |
| Plano individual só libera o previsto; Ciclo do O com catálogo versionado e limites | `billing.test.ts` casos A–D, feature, quotas                                      |
| Upgrade, expiração, cancelamento, webhook duplicado e erro                          | `billing.test.ts` (webhook), E2E webhook                                          |
| Eventos com versão, idempotência, auditoria, reprocessamento e estados              | `core.test.ts` (fila), `flow.test.ts`                                             |
| SOBEDESCE → Synquei valida manifest e não perde IDs                                 | `adapters.test.ts`, `flow.test.ts` (fixtures do código real)                      |
| Mídia nunca apagada/sobrescrita; prévia antes de mudança                            | plano com `moves` vazio e `dry_run` (`adapters.test.ts`)                          |
| Módulos futuros sem IA de fachada                                                   | `core.test.ts` (etapas `unavailable`), `products/ai-edit`, `products/finishing`   |
| UI responsiva e acessível; Ciclo do O com alternativa textual                       | E2E mobile sem rolagem horizontal, axe em 12 telas, lista do Ciclo do O           |
| Testes, lint e build passam                                                         | tabela acima                                                                      |
| Sem segredos; sem apontar para produção original                                    | `scan-secrets.mjs`, saneamento nos `SOURCE_MANIFEST.md`                           |
| Nenhum deploy sem consentimento                                                     | nenhum projeto Vercel ligado ao repositório; `vercel.json` desliga deploy por Git |

## Testes (Vitest)

```
packages/billing/test/billing.test.ts > janela da assinatura > ativa vai até o fim do período; past_due até a carência; cancelada no fim do período vale até lá
packages/billing/test/billing.test.ts > casos de acesso (PRD §9.2) > A: só SOBEDESCE → Synquei aparece para contratar e é negado
packages/auth/test/auth.test.ts > senha > scrypt confere e recusa
packages/core/test/core.test.ts > autorização > ordem: sem sessão 401 → sem organização 409 → papel 403 → projeto 404 → entitlement 403
packages/auth/test/auth.test.ts > conta e sessão > cadastro normaliza e-mail, cria sessão e exige confirmação
packages/auth/test/auth.test.ts > conta e sessão > e-mail repetido e senha curta são recusados
packages/billing/test/billing.test.ts > casos de acesso (PRD §9.2) > B: SOBEDESCE + Synquei → os dois liberados
packages/core/test/core.test.ts > autorização > organização no cliente não vale: só a da sessão, conferida no banco
packages/core/test/core.test.ts > autorização > quota sem limite configurado bloqueia antes de executar
packages/billing/test/billing.test.ts > casos de acesso (PRD §9.2) > C: Ciclo do O libera as cinco ferramentas lançadas; as futuras seguem indisponíveis
packages/billing/test/billing.test.ts > casos de acesso (PRD §9.2) > D: cancelamento imediato bloqueia; no fim do período mantém até lá
packages/core/test/core.test.ts > equipe (caso E e convites) > convite exige e-mail igual e confirmado; troca de organização isola os dados
packages/billing/test/billing.test.ts > casos de acesso (PRD §9.2) > período vencido sem renovação deixa de valer
packages/core/test/core.test.ts > equipe (caso E e convites) > admin não convida admin; dono não fica sem dono; removido perde acesso
packages/billing/test/billing.test.ts > casos de acesso (PRD §9.2) > feature fora do plano é negada
packages/core/test/core.test.ts > projetos > etapas começam com estado real e mostram bloqueio por assinatura
packages/billing/test/billing.test.ts > webhook de cobrança > assinatura HMAC confere, com tolerância de tempo
packages/billing/test/billing.test.ts > webhook de cobrança > ativa, é idempotente e ignora evento mais velho
packages/core/test/core.test.ts > fila > evento idempotente; execução com sucesso
packages/auth/test/auth.test.ts > conta e sessão > login: mesma mensagem para e-mail inexistente e senha errada; limite por e-mail+IP
packages/billing/test/billing.test.ts > webhook de cobrança > pagamento falhou: carência do plano e depois bloqueio
packages/core/test/core.test.ts > fila > falha temporária volta com backoff e termina em dead-letter
packages/billing/test/billing.test.ts > webhook de cobrança > organização ou plano desconhecidos ficam registrados como falha, sem conceder nada
packages/core/test/core.test.ts > fila > despacho ambíguo vai para revisão, sem repetir sozinho; reprocessar é manual e único
packages/auth/test/auth.test.ts > conta e sessão > sair revoga na hora; token malformado nem consulta
packages/core/test/core.test.ts > fila > worker que caiu: idempotente volta para a fila, não idempotente vai para revisão
packages/auth/test/auth.test.ts > conta e sessão > sessão vencida não vale
packages/billing/test/billing.test.ts > webhook de cobrança > assinatura de uma organização não muda de dono por evento
packages/core/test/core.test.ts > fila > backoff cresce com teto e jitter limitado
packages/core/test/core.test.ts > fila > detecta ciclo de eventos
packages/core/test/core.test.ts > fila > evento fora do contrato é recusado
packages/billing/test/billing.test.ts > webhook de cobrança > evento fora do contrato é recusado
packages/billing/test/billing.test.ts > quotas > sem limite configurado a operação medida é bloqueada
packages/billing/test/billing.test.ts > quotas > consome até o limite, é idempotente e seguro em concorrência
tests/integration/flow.test.ts > Ciclo do O ponta a ponta > rotas de eventos sem ciclos
packages/auth/test/auth.test.ts > conta e sessão > redefinir senha encerra todas as sessões; trocar senha mantém a atual
packages/billing/test/billing.test.ts > quotas > o maior limite entre as fontes vale
packages/db/test/rls.test.ts > RLS > todas as tabelas do schema zro têm RLS ligado
packages/db/test/rls.test.ts > RLS > cliente de outra organização não vê projetos de terceiros
packages/billing/test/billing.test.ts > catálogo versionado > nova versão começa em rascunho; publicar aposenta a anterior para novas vendas
packages/db/test/rls.test.ts > RLS > forjar a organização ativa sem vínculo não mostra nada
packages/db/test/rls.test.ts > RLS > a mesma pessoa vê só a organização ativa (caso E)
packages/db/test/rls.test.ts > RLS > viewer vê projeto da organização mas não o restrito, e não edita
packages/db/test/rls.test.ts > RLS > papel billing não vê projetos
packages/db/test/rls.test.ts > RLS > viewer não cria projeto
packages/db/test/rls.test.ts > RLS > não dá para criar projeto em outra organização trocando o org_id
packages/db/test/rls.test.ts > RLS > zro_app não lê senhas, tokens nem eventos de cobrança
packages/db/test/rls.test.ts > RLS > sessões: a pessoa não lê o hash do token
packages/db/test/rls.test.ts > RLS > assinaturas e entitlements não são graváveis pelo usuário
packages/db/test/rls.test.ts > RLS > admin não rebaixa dono; dono não fica sozinho sem dono
packages/db/test/rls.test.ts > RLS > auditoria só cresce
packages/db/test/rls.test.ts > RLS > catálogo é público e esconde rascunhos
tests/integration/flow.test.ts > Ciclo do O ponta a ponta > Carro do Freela → TPeasy → SOBEDESCE → Synquei, sem perder IDs
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > lê o descargas.jsonl real, ignora linha pela metade e cancelada
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > relatório xxh64 no formato do xxhsum
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > leva única conferida nos dois destinos = backup comprovado
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > sem relatório o backup NÃO é declarado concluído
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > duas levas no mesmo minuto: só a última tem prova (comportamento real do SOBEDESCE)
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > checksum divergente entre destinos vira erro explícito
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > IDs de ativo são estáveis entre levas e destinos
packages/integrations/test/adapters.test.ts > SOBEDESCE → manifest > caminho perigoso é recusado pelo contrato
packages/integrations/test/adapters.test.ts > Synquei: prévia de organização > preserva todos os asset IDs, não move nada e cria as pastas de trabalho do Synquei
packages/integrations/test/adapters.test.ts > TPeasy e Carro do Freela > backup do TPeasy vai e volta sem mexer nos ajustes do app
packages/integrations/test/adapters.test.ts > TPeasy e Carro do Freela > job do Carro do Freela vira projeto sem dados pessoais
packages/media-contracts/test/schemas.test.ts > JSON Schemas publicados > docs/integration-contracts/schemas está em dia com o código (rode npm run contracts:export)
tests/integration/openapi.test.ts > OpenAPI > documenta exatamente as rotas da API
tests/integration/flow.test.ts > Ciclo do O ponta a ponta > caso A no fluxo: sem Synquei a execução aparece bloqueada e a API nega com 403
tests/integration/flow.test.ts > Ciclo do O ponta a ponta > assinatura revogada antes da execução: o worker não roda, marca bloqueado
tests/integration/flow.test.ts > Ciclo do O ponta a ponta > manifest com divergência: ingest.failed, Synquei não recebe
 1 tests/e2e/a11y.spec.ts:14:1 › páginas públicas sem violações WCAG A/AA (6.2s)
 2 tests/e2e/a11y.spec.ts:18:1 › área logada e projeto sem violações WCAG A/AA (15.2s)
 3 tests/e2e/hub.spec.ts:21:1 › área logada exige sessão (415ms)
 4 tests/e2e/hub.spec.ts:26:1 › cadastro → organização → projeto com Ciclo do O e alternativa em lista (1.4s)
 5 tests/e2e/hub.spec.ts:41:1 › API: sem assinatura recebe 403 por URL direta; sem sessão 401; outra origem 403 (1.0s)
 6 tests/e2e/hub.spec.ts:68:1 › webhook de cobrança: assinatura errada 400, provedor desconhecido 404, evento válido ativa e repetido não duplica (848ms)
 7 tests/e2e/hub.spec.ts:110:1 › console de administração não existe para quem não é da plataforma (878ms)
 8 tests/e2e/hub.spec.ts:116:1 › páginas públicas e mobile sem rolagem horizontal (760ms)
```

## Redesign (25/10/2026)

- `npm run lint`, `format:check`, `typecheck`: ok. `npm test`: 69/69. `npm run build`: ok. `npm run test:e2e`: 10/10,
  incluindo axe WCAG 2.1 A/AA nas páginas públicas e na área logada **nos temas claro e escuro** e o teste do seletor
  (troca sem recarregar, cookie gravado, escolha mantida após recarregar).
- Conferência visual com Playwright em 1440×900 e 390×844, tema escuro e claro: landing, planos, entrar, início,
  projeto, Ciclo do O e Ferramentas. Referência: telas reais de Synquei, TPeasy e SOBEDESCE servidas a partir das
  cópias em `products/`.

## Downloads (25/10/2026)

- Cada instalador listado em `apps/hub-web/lib/downloads.ts` foi conferido com download real de 1 byte (HTTP 206):
  SOBEDESCE e Synquei (`/baixar/mac`, `/baixar/windows`), NOSSOM (release `desktop-v0.2.2`, Mac Apple Silicon, Mac
  Intel e Windows) e as versões web (200).
- `tests/integration/downloads.test.ts`: catálogo inteiro, só HTTPS em domínios oficiais, nada para instalar no que está
  em desenvolvimento. E2E com axe em `/baixar` e `/downloads` nos dois temas: 10/10.
- Repositórios privados (25/10/2026): nenhum link do HUB vai para o `github.com`; o NOSSOM passa por
  `https://nossom-teal.vercel.app/baixar/<sistema>` como SOBEDESCE e Synquei. `tests/integration/downloads.test.ts` recusa
  `github.com`/`githubusercontent.com` e exige `/baixar/<sistema>` nos instaladores de desktop. Rotas do NOSSOM cobertas
  com GitHub falso em `products/nossom/tests/desktop-releases.test.ts`. Não validado aqui: download real com o
  `GITHUB_TOKEN` de produção (depende da variável nos projetos Vercel, ver
  [downloads-privados](operations/downloads-privados.md)).

## Login único (25/10/2026)

- `tests/integration/oidc.test.ts` (8): retorno só cadastrado (sem redirecionamento aberto), loopback por porta,
  PKCE obrigatório, troca com organização e produtos contratados, verifier/segredo errados, código reapresentado
  revoga o refresh, rotação com detecção de reuso, remoção do app no Perfil, isolamento (`zro_app` não lê segredo,
  códigos, refresh tokens nem a chave).
- `tests/e2e/sso.spec.ts`: do app ao HUB, criar conta, criar organização, permitir, voltar com código, trocar por
  tokens, userinfo, reautorização silenciosa, descoberta, JWKS e retorno malicioso recusado; axe na tela de permissão.

## Conta única (25/10/2026)

- `tests/integration/accounts.test.ts` (9): plano grátis na organização nova com as cinco ferramentas e no
  `zro_products`, idempotência, `zro_app` sem acesso à função; conta por app com contagem de entradas e RLS
  (cada pessoa só lê as próprias, não grava); Google com PKCE, state, nonce, aud, iss, validade e e-mail
  confirmado; conta nova sem senha, vínculo reaproveitado, mescla com conta confirmada mantendo a senha, conta
  nunca confirmada perde senha e sessões, conta suspensa recusada sem vínculo.
- `tests/e2e/sso.spec.ts`: "Criar conta" vindo de um app abre `/criar-conta`, passa por Boas-vindas já
  preenchida e volta ao app com código, sem botão do Google quando não configurado; `app_accounts` registrado.
- `tests/e2e/hub.spec.ts`: conta nova recebe as ferramentas do plano grátis; os testes de bloqueio tiram o plano.
- Suite completa local: 92 testes Vitest e 14 e2e passando; lint, format e typecheck limpos.

## Painel de pessoas (25/10/2026)

- `tests/integration/people.test.ts` (10): `changeOrgPlan` grátis → manual (encerra o grátis, concede o novo,
  recalcula acessos, audita `subscription_canceled`, `plan_assigned` e `plan_changed` com o motivo), volta ao grátis
  e recusa o mesmo plano, bloqueio com assinatura Stripe ("Pago pelo Stripe", nada muda), motivo e plano ativo
  obrigatórios; suspender encerra sessões e refresh tokens, audita, reativar não reabre sessão; não suspende a si
  mesmo nem outro admin; números, série de 30 dias e funil; busca, filtros (plano, sem plano, sem organização,
  suspensas, Google, app), ordem; CSV com BOM e sem fórmula; página da pessoa com assinaturas, acessos, sessões e
  linha do tempo.
- `tests/e2e/admin.spec.ts` (2): quem não é da plataforma recebe 404 em `/admin/pessoas`, no CSV e na página da
  pessoa; admin (promovido por SQL no banco de e2e) vê a lista, busca, troca o plano na linha, exporta o CSV, abre
  a página da pessoa; axe WCAG 2.1 A/AA sem violações nas duas telas em claro e escuro; sem rolagem horizontal em
  390 px.
- Suite completa local: 102 testes Vitest (13 arquivos) e 16 e2e passando; lint, format, typecheck, build e
  `scan-secrets` limpos. Bancos de teste próprios (`zro_pessoas_test`, `zro_pessoas_e2e_test`) porque outra sessão
  usava `zro_test` ao mesmo tempo.

## Virada das plataformas (25/10/2026)

- Origem: o `main` de cada repositório antigo é exatamente o commit importado (2f6716e, f04e517, a5ac3f1, dfa91e3,
  5fc93a7); nada ficou para trás.
- SOBEDESCE: deploy de produção copiou 20 tabelas do Neon para `sobedesce` com contagem e md5 iguais
  (`sobedesce._copia_neon`); sobedesce.com, /entrar, /conta e /baixar/versao respondendo; Neon intacto.
- NOSSOM: estrutura (`nossom_private`, 10 tabelas, funções `nossom_*`, buckets) e dados (1 conta, 1 identidade,
  3 tratamentos, 1 plano, 1 auditoria, 8 restaurações, 6 usos) conferidos no Supabase AbsoluteZRO;
  `/api/account?verify=1` = configured/reachable/quotaReady/restorationReady. Avatar (arquivo) não copiado.
- Synquei, TPeasy, Carro do Freela: publicados a partir de `products/<app>`; Carro conferido contra o site anterior
  (mesmas rotas, chaves e CSP) antes da produção.
- Login único nas cinco: `/api/zro/entrar` de cada domínio leva ao HUB; apps marcados como da família.

## NOSSOM fechado ao público (28/10/2026)

- `products/nossom`: `npm test` **101/101**, `typecheck`, `format:check`, `build` ok; E2E 83 cenários; só os 2 de microfone falham (como antes), 26 pulados por descreverem o produto aberto
  (`zro-access.spec.ts`: anônimo, conta própria, Absolute ZRO `closed`, `allowed`, sessão antiga). Regra única em
  `lib/server/release.ts` (`temAcesso`), deny-by-default com `RELEASE=closed`. Detalhes em
  `products/nossom/docs/validation.md`. Não validado: claim `zro_release` vinda do HUB real e migração em produção.

## A Z no Início do NOSSOM (27/10/2026)

- `products/nossom`: `npm test` **83/83** (5 novos em `tests/zro.test.ts`: cookie da Z cifrado, HttpOnly e preso a
  `/api/zro/ia`; repasse encaminha o Bearer e passa o NDJSON sem vazar token; recusa sem sessão, sem token, com token
  de outra conta, cookie adulterado, outra origem e caminho fora da API sem chamar a Absolute ZRO; renovação única
  pelo refresh que gira; token sem `zro.ia` não é guardado; sair apaga e revoga). `typecheck`, `format:check` e
  `npm run build` ok.
- E2E (`npx playwright test`): **75 passaram, 4 falharam, 1 pulado**; as falhas são as 3 de gravação pelo microfone
  (o Chromium daqui não dá o microfone) e a contagem de seções da home, que já quebrava desde a seção da Z (6 → 7,
  corrigida e conferida depois). `tests/e2e/zro-ia.spec.ts` (4) passa: Z no topo, "Conectar com Absolute ZRO" sem
  token, assistente NOSSOM logo abaixo, tema do estúdio no painel, repasse até a API falsa do HUB, token fora da
  página, painel fora do ar não quebra o Início.
- Fotos com o `zro-ia.js` de verdade (servido localmente) e a API do HUB falsa, 1440 e 390 px, claro e escuro, sem
  rolagem horizontal; conferidas a olho, fora do repositório. `node scripts/scan-secrets.mjs` limpo.
- Não validado: conta Absolute ZRO real, o `nossom-web` aceitando `offline_access zro.ia` em produção, o app de
  computador instalado (carrega o mesmo `/studio`, sem mudança no binário) e Safari/iPhone físicos.

## A Z em aba própria no NOSSOM (27/10/2026)

- `/studio/z`: primeira aba (anel fino, "Z") na lateral e na barra do celular; `/studio` redireciona para ela (site,
  PWA e app de computador, com a busca junto). Tela toda, sem rodapé nem faixa de minutos. O Início foi para
  `/studio/inicio` e voltou ao de antes (assistente + envio de áudio). "Conectar com Absolute ZRO" volta para a Z;
  "Conversar com a Z" da home leva a `/studio/z`. Sem o login Absolute ZRO configurado, a aba some e `/studio` é o Início.
- `npm test` 83/83, `typecheck`, `format:check`, `build` ok. E2E completo: 79 (3 falhas na primeira rodada: disco cheio
  na máquina e dois testes ainda em `/studio`; corrigidos e repassados). `scan-secrets` limpo. Fotos 1440 e 390 px fora
  do repositório. Não validado: conta real e app instalado.

## Balão de pendências: AEON, Revela e NOSSOM (27/10/2026)

- Regras puras com teste (estado → número e dica por aba): AEON `src/pendencias.js` (`test/nucleo.test.js`), Revela
  `src/pendencias.js` (`test/pendencias.test.js`), NOSSOM `lib/studio-pending.ts` (`tests/studio-pending.test.ts`).
- AEON `npm test` **88/88** (a tela confere o balão de Revisar subindo e descendo ao aprovar/desfazer e o de Mídia ao
  reabrir e religar); `xvfb-run -a npx electron . --smoke` ok. Revela `npm test` **112/112** (Converter: na fila →
  pronto para baixar → some ao baixar; CST: some ao escolher o log). NOSSOM `npm test` **78/78**, `typecheck` e
  `format:check` ok, `npm run build` ok; e2e `cloud-restoration`, `studio` e `install-navigation`: 16/17, a que falhou é a
  gravação pelo microfone (o Chromium deste ambiente não dá o microfone; não toca no balão).
- Fotos (Playwright, claro e escuro, 1440 px e 390 px) conferidas a olho; ficaram fora do repositório.

## Carro do Freela: sem selo no topo e símbolo flat no login (27/10/2026)

- Carro, bateria completa (`npm test`, Chromium 1243): **87/87** em 20,5 min; `sem-zoom` falhou em paralelo e passou
  sozinha (regra do `run.js`). Conferido em tela a 390 px: barra de cima sem o selo "Prévia", "Prévia" no pé da home e
  o "Continuar com Absolute ZRO" com o símbolo flat (SVG, cor do texto). `scripts/scan-secrets.mjs` limpo.

## Carro do Freela → HUB: job, equipe e consentimento (26/10/2026)

- HUB, raiz: `npm run lint`, `format:check`, `typecheck` limpos; `npm test` (Postgres 16 local) **150/150**, com
  `tests/integration/carro-hub.test.ts` (10): escopo só no cliente do Carro; token vira a pessoa na organização do
  login e o job vira projeto com o briefing; token sem escopo, adulterado, de app removido no Perfil ou desativado é
  recusado; quem saiu da organização perde o acesso mesmo com token válido; equipe pede o job antes, membro entra
  direto, conta de fora recebe convite, reenviar não duplica; convite só a mesma conta aceita e abre só aquele
  projeto; **isolamento do convidado** (não vê membros, plano, vínculos, eventos da organização nem nomes de quem
  não está com ele num projeto; não importa job nem monta equipe; vê as etapas no estado real, sem "contratar");
  convite de convidado não rebaixa quem já é da organização; edição importa job mas não monta equipe.
- `npm run build` ok; `npm run test:e2e` **21/21**, com o novo `sso.spec.ts` "Carro do Freela": token do app cria o
  projeto pela API real sem cookie e com outra Origin (201, depois 200 com o mesmo id), Bearer inválido 401, equipe
  sem e-mail confirmado 403 `email_not_verified`, e a página do projeto com a seção Equipe.
- `npm run contracts:export` (novo `carro-do-freela.crew.v1.schema.json`); rota nova documentada no OpenAPI.
- Carro: `npm run test:api` **27/27** (HUB falso com refresh em rotação, revogação e as duas rotas): cookie `cdf_hub`
  cifrado e httpOnly em `/api/zro`; HUB sem o escopo → login refeito sem ele; envio monta só os campos do contrato
  (telefone fica de fora) e a equipe com conta; token vencido renova e o refresh velho derruba o acesso; portas
  fechadas (origem, método, tipo, sessão, conta trocada, plano, pedido ruim, recusa do HUB); sair revoga no HUB.
- Carro, navegador: `conta-zro` **54/54** (§10: botão no painel do job, HUB recebe o briefing inteiro, só quem tem
  conta vai na equipe, "Abrir na Absolute ZRO" depois, nada no lado do freela nem fora do domínio);
  `consentimento` **11/11** (caixa desmarcada, sem marcar não registra, marcar grava versão e data, retirada
  registrada, sobrevive ao recarregar, ninguém fictício "autorizou"). As quatro suítes das fases passaram com
  `public/fase-*.html` apagados: o `run.js` gera os sete builds.
- Carro, bateria completa (`npm test`, Chromium 1243): **87/87** em 20,5 min; `sem-zoom` falhou em paralelo e
  passou sozinha (regra do `run.js`, igual à rodada anterior). `node src/vercel-build.js` aprovado (build 26/out · 3).
- `node scripts/scan-secrets.mjs` limpo.

## Carro do Freela: leve sem perder qualidade (26/10/2026)

- Bateria (`npm run build:fases && npm run build && node test/run.js`, Chromium 1243): **86/86** em 20 min no arnês
  paralelo (antes 38 min em série). `sem-zoom` falhou em paralelo e passou sozinha (regra do `run.js`). O "87º" da
  contagem antiga era o `_servir.js`, ajudante sem asserção. `npm run test:api` 21/21. `node src/vercel-build.js`
  aprovado: 7 páginas anônimas, FASE e VERSAO conferidas no HTML + script, m/ só com o que as páginas citam (279
  arquivos, 138 MB), CSP com 1 script embutido. `scripts/scan-secrets.mjs` limpo.
- Peso e LCP (servidor com brotli e cache longo em `m/`; celular 390@3x em 4G simulado 1,6 Mb/s/150 ms e CPU 4×):
  1ª visita 1,7 MB → 1,37 MB e LCP 7,3 → 4,1 s; 2ª visita 852 → 173 KB e LCP 5,9 → 1,6 s. Computador: LCP 808 → 548 ms.
- Qualidade (SSIM/PSNR contra o master sem perda remontado do Kling): carona no celular 0,923/31 dB → ~0,984/41 dB;
  receita da montagem conferida a ~40 dB por quadro contra o vídeo antigo. Capturas lado a lado (home e login com
  vídeo, praça, brechó e fechamento, em 1440@2x e 390@3x) entregues ao titular; o "pode subir" é dele.
- Não feito: dividir o script por tela (40% do script roda na primeira tela, mas 838 de 840 KB são alcançáveis do
  arranque); fica para projeto próprio, com o aval do titular.

## Carro do Freela: conta única (25/10/2026)

- `npm run test:api` (HUB falso, chave EC P-256): `criar=1` → `prompt=create` (e só ele); `zro_products` sem
  `carro-do-freela` → sessão abre com `liberado:false`; com o produto → `liberado:true`; sessão antiga sem a lista → 401.
- `test/conta-zro.js` (Chromium, domínio em miniatura): quem chega não vê formulário nem Google; "Criar conta" leva
  `prompt=create` e volta no perfil; sem o produto, só o aviso e "Ver na Absolute ZRO" (nem `entrarNaConta()` abre);
  conta antiga do aparelho ainda entra pelo formulário; `file://` igual a antes.

## Synquei: conta pela Absolute ZRO (25/10/2026)

- `products/synquei`: `npm test` 67/67. `tests/zro.test.mjs` (HUB falso): Criar conta manda `prompt=create` e volta
  logado; `synquei` fora de `zro_products` entra com `acesso: false` e o link de `/ferramentas`; novo login reavalia.
  `tests/conta-ui.test.mjs`: botões Entrar/Criar conta, aviso sem acesso com "Ver na Absolute ZRO", conta liberada.
- Sem conferência visual em navegador nesta rodada (sem Chromium no ambiente).

## SOBEDESCE no monorepo (25/10/2026)

- Conta só pela Absolute ZRO: `web/tests/zro.test.mts` confere `prompt=create` no Criar conta, produto fora de
  `zro_products` com `/api/eu` e Drives em 403 `sem_acesso_zro`, liberação depois de religar e conta antiga sem
  vínculo livre; `web/tests/google.test.mts` confere que o Google não cria conta e que o Google de entrar antigo
  continua entrando. `npm test` 231/231, lint, typecheck e build.

- `products/sobedesce/web`: `npm run lint`, `npm run typecheck`, `npm run build` e `npm test` (227/227) com Postgres
  local (`TEST_DATABASE_URL`) e de novo com PGlite.
- `tests/banco-schema.test.mts`: `SOBEDESCE_DATABASE_URL` antes do Neon, um banco só durante a virada, rótulo do pooler
  do Supabase sem senha, migrador no schema com o mesmo hash e a mesma ordem do Drizzle, falha desfaz só a migração.
- `tests/copiar-do-neon.test.mts`: cópia conferida (contagem e md5), re-execução sem efeito, destino com linhas sem
  registro → erro, divergência → erro sem nada gravado, colunas diferentes → erro, log sem dados nem endereços.
- Ensaio da virada com dois bancos locais (um `public` no papel do Neon, um papel `sobedesce_app` dono do schema
  `sobedesce` com `search_path`): migrações + cópia de 20 tabelas conferidas; segunda execução = nada a fazer.
- `tests/versao.test.mts`: Release `sobedesce-versao-de-teste` primeiro; 404 → o antigo; outro erro não cai no antigo.
- `products/sobedesce/test/numero-build.test.js`: build = execução + 1000; limpeza só no Release novo.
- Não validado aqui: a cópia contra o Neon e o Supabase reais (depende das variáveis na Vercel) e os workflows na
  nuvem do GitHub (rodam no push).

- Deploy real (Vercel, Supabase novo, domínio): aguardando autorização.
- CI no GitHub: roda no primeiro push deste branch.
- Cartões reais: os fixtures vêm do código real do SOBEDESCE com cartões Sony falsos em pastas temporárias.
- Synquei e DaVinci Resolve Studio reais consumindo a prévia; NOSSOM recebendo timeline.
- Provedor de pagamento e de e-mail reais (não escolhidos).
- Worker como processo contínuo por horas (validado via `runOnce`/`recoverStaleRuns` nos testes e no seed).
- Carga e concorrência além do teste de quota em paralelo.

## TPeasy: conta única Absolute ZRO (25/10/2026)

- `products/tpeasy`: `node --test tests/*.test.mjs` (23/23) com a Absolute ZRO falsa: `?criar=1` manda `prompt=create`
  e volta logado; `tpeasy` fora de `zro_products` entra com `acesso: false`; liberado dá `acesso: true`; nova entrada
  reavalia. Sintaxe dos módulos conferida como no CI.
- Ajustes conferidos no Chromium (Playwright) com `/api/zro/eu` simulado: fora (Entrar + Criar conta), sem acesso
  (aviso + "Ver na Absolute ZRO") e liberado (só a conta).

## Absolute ZRO para computador (25/10/2026)

- `apps/hub-desktop`: `npm test` (node --test) 14/14: regras de navegação (HUB e `accounts.google.com` na janela; o
  resto só sai por `https` no navegador; `file:`, `javascript:`, `smb:` e URL com usuário/senha recusados), deep link
  `absolutezro://` só para rotas do HUB (sem `/api`, `/oauth`, `//outro-host`, `usuario@host`), permissões negadas por
  padrão, aviso de versão (build 0 nunca avisa, "Depois" lembra o build), janela lembrada só se couber numa tela e
  ícones válidos (`.icns` com 8 tamanhos até 1024, `.ico` 16–256, fundo do DMG 540×380 e @2x).
- Empacotamento local: `npx electron-builder --linux dir` (Electron 44.5.1, fusíveis aplicados, `app.asar` só com
  `desktop/`, `build/icon*.png` e `package.json`). Teste de fumaça do app empacotado com `xvfb-run … --smoke`:
  `SMOKE OK` (tela "Sem conexão" pronta, ponte presente, sem Node na página, símbolo e Figtree carregados, fundo
  `rgb(252, 251, 252)`, regras e deep link conferidos).
- HUB: `tests/integration/hub-desktop-download.test.ts` com GitHub falso: com token redireciona para o endereço assinado
  (`Accept: application/octet-stream`, sem seguir), sem token usa o link do Release, Release ausente volta para
  `/baixar?hub=indisponivel` ("Em breve"), `?build=N` exato, `/baixar/hub/versao` só com `versao.json` válido e
  `/baixar/hub/diag` sem mostrar o token. Raiz: lint, formato, tipos, Vitest 112/112, build e E2E 16/16.
- Não validado aqui: `.dmg` e `.exe` (só geram em Mac e Windows do GitHub Actions, em push na `main`), a barra de
  título do Mac numa máquina real e o download com o `GITHUB_TOKEN` de produção.

## Padrão Apple em todo o site e no HUB (25/10/2026)

- `npx eslint . --ignore-pattern '.claude/**'`, `npm run format:check`, `npm run typecheck`, vitest (93/93 com
  `TEST_DATABASE_URL`), `npm run build` e `E2E_PORT=3260 npx playwright test` (14/14, axe WCAG A/AA nos temas claro e
  escuro, público e logado) passando.
- Conferência visual com `next start` e conta criada pela UI: 1440×900 e 390×844, claro e escuro, em `/`, `/planos`,
  `/baixar`, `/entrar`, `/criar-conta`, `/boas-vindas`, `/inicio`, `/ferramentas`, `/projetos`, projeto, `/ciclo`,
  `/downloads`, `/perfil`, `/assinatura` e `/equipe`.
- Telas dos apps capturadas com Playwright dos sites públicos (SOBEDESCE, Synquei `/app/`, NOSSOM, TPeasy, Carro do
  Freela) em 25/10/2026; SOBEDESCE, NOSSOM e Carro do Freela não têm tema escuro e usam a mesma captura nos dois.

## App para computador fechado ao público (25/10/2026)

- O primeiro build da main (run 40236016758) gerou o `.dmg` e o `.exe` e passou nos testes de fumaça de Mac e Windows.
- `/baixar` mostra "Em breve" e `/baixar/hub/{mac,windows}` volta para `/baixar` enquanto `HUB_DESKTOP_PUBLICO` não for
  `1`. Isso vale mesmo com o Release no ar. Teste: `tests/integration/hub-desktop-download.test.ts`.

## Finishing: referência → LUT (25/10/2026)

- `products/finishing`: `npm test` (12/12, `node --test`, sem dependências). Cenas sintéticas com semente fixa e um look
  conhecido (S com preto levantado, sombras frias, altos quentes, −20% de saturação): referência igual ao material dá
  LUT identidade (desvio < 1e-4); intensidade 0 não mexe; mesma cena chega a < 0,35 da distância original; quatro
  duplas de cenas diferentes sempre aproximam (cada uma < 0,85, média < 0,65), saturação recuperada perto de 0,8; um
  bloco vermelho de 40% do quadro não tinge os cinzas (< 0,012 em Oklab); eixo neutro monótono, sem saltos na grade;
  material chapado não quebra; `.cube` e PNG (cinco filtros) gravam e leem de volta; linha de comando gera `.cube` e
  prévia.
- Limite medido: na dupla 12/13 (referência sem o conteúdo de cor do material) a cor piora; o tom ainda aproxima.
- Não validado: frames reais de filme e de câmera, e a LUT dentro do Resolve.

## Revela: nome no catálogo (25/10/2026)

- Migration `0009_revela.sql`: `finishing` passa a se chamar **Revela** (`provisional_name = false`), com nova descrição;
  só troca o que ainda estava como a 0003 deixou. Conferido no banco de teste depois das migrations.
- `scan-secrets` (1650 arquivos), lint, formatação, tipos, `npm test` (**103/103** em 13 arquivos), build e
  `npm run test:e2e` (**16/16**) verdes neste ambiente. `products/finishing`: `npm test` 12/12.

## Revela: tela (25/10/2026)

- `products/finishing`: `npm ci && npm test` (**15/15**), agora com a tela no Chromium (Playwright 1.63, servidor local
  no próprio teste): escolhe referência e frame, prévia desenhada, 8 linhas de leitura (saturação + 7 faixas), divisão
  em 0 e 100 iguais com intensidade 0 e diferentes com 100, `.cube` baixado em 33 e 65 pontos com título e nome certos,
  "só cor" avisa contraste desligado, arquivo que não é imagem avisa, celular de 375 px sem rolagem horizontal e
  controles com nome acessível. Sem erros de página.
- Conferido em captura: escuro e claro no desktop, escuro no celular.

## Revela: identidade visual (25/10/2026)

- Ícone conferido em 512, 128, 64, 32 e 16 px, em fundo escuro e claro; guia (`products/finishing/marca/index.html`)
  sem rolagem horizontal a 390 px.
- Tela da Revela: `npm test` (**15/15**); o teste da tela agora confere que o ícone do cabeçalho carregou e que o
  favicon sai como `image/svg+xml`. O brilho atrás do título cabe na largura (o teste do celular pegou 41 px de rolagem
  lateral na primeira versão).
- HUB com `--p-finishing` novo e ícone `finishing.svg` no `ProductMark` (3 lugares na página inicial): segredos, lint,
  formatação, tipos, `npm test` (**103/103**), build e `npm run test:e2e` (**16/16**, com axe) verdes.

## Revela: marca colorida, conta-gotas e publicação (25/10/2026)

- Marca refeita a pedido do titular ("pegada das cores da Kodak, colorido"): três símbolos comparados em 300, 96, 48,
  32 e 20 px, em fundo escuro e claro. O titular escolheu o perfurado e pediu roxo; três gradientes com roxo
  comparados, o final usa roxo profundo → roxo → vermelho → laranja → amarelo (sem rosa, para não encostar no magenta
  do Carro do Freela). Conferido em 300, 64 e 32 px; guia sem rolagem horizontal a 390 px.
- `products/finishing`: `npm test` (**18/18**). Conta-gotas: o par leva a cor marcada a menos de 0,012 da referência;
  na dupla 12/13 o erro de cor vai de 0,026 (sem pares) para 0,0135 com dois pares, abaixo do original (0,0162); com a
  cor desligada os pares não agem. Na tela: marcar par sem abrir a escolha de arquivo, Esc cancela, Limpar volta.
  O servidor do teste aplica os cabeçalhos do `vercel.json` e a tela roda sem erro de console com a CSP de produção.
- HUB com amarelo e roxo em `--p-finishing`/`--p-finishing-2`: segredos, lint, formatação, tipos, `npm test` (**103/103**),
  build e `npm run test:e2e` (**16/16**) verdes.

## Revela: fundo sempre escuro (25/10/2026)

- A pedido do titular, a tela da Revela é sempre preto fosco (`#0E0E10` com grão neutro), sem tema claro; a sombra da
  comparação ficou neutra (sem brilho colorido perto da imagem). `products/finishing`: `npm test` (**19/19**), com
  teste novo: com o sistema no tema claro, fundo continua `rgb(14, 14, 16)` e texto claro. Conferido em captura.

## Revela: merge do main (25/10/2026)

- `main` (Padrão Apple, app para computador) trazido para o PR #31 por merge. Conflitos: página de planos (fica o layout
  novo do `main`, com "Revela") e esta página (as duas seções mantidas). Segredos (1758 arquivos), lint, formatação,
  tipos, `npm test` (**113/113**), build, `npm run test:e2e` (**16/16**) e `products/finishing` (**19/19**) verdes.

## OG com a Revela (25/10/2026)

- A pedido do titular, `scripts/marca/og-claro.html` ganhou o ícone da Revela na fileira das ferramentas;
  `opengraph-image.jpg` e `twitter-image.jpg` recapturados em 1200×630 (Chromium, Figtree carregada).
- Ícone da Revela sem a margem de ícone de Mac (quadro de borda a borda, como Synquei e NOSSOM): no OG ele tinha
  um aro branco e parecia menor. Tela da Revela e guia ajustados; `npm test` da Revela verde.

## Revela: OG próprio e endereço (25/10/2026)

- `revela.vercel.app` já pertence a outro app ("REVELA – Seu App de Estudo Bíblico"); com o aval do titular, o projeto
  `revela` ganhou `revela-zro.vercel.app` (verificado na Vercel; antes respondia `DEPLOYMENT_NOT_FOUND`, ou seja, livre).
- OG da Revela (`products/finishing/og.jpg`, 1200×630, fundo preto fosco, cubo de cor isométrico) gerado de
  `marca/og.html`; tags `og:*` e `twitter:*` com URL absoluta. `npm test` (**20/20**): teste novo confere as tags e que
  a imagem servida tem 1200×630.

## Revela: logo do titular (25/10/2026)

- Logo entregue pelo titular guardada sem alteração (`revela-logo-original.png`, 2172×724, fundo preto). Versão para o
  preto fosco (`revela-logo.png`, 1740×325): fundo preto retirado por "cor para alfa" e margens recortadas; composta
  de volta sobre o preto, difere da original em no máximo 0,5 nível (arredondamento).
- Aplicada no cabeçalho da tela, no guia (capa e seção "Logo") e no OG do link (`og.jpg`, tags com `?v=2`).
  `products/finishing`: `npm test` (**20/20**), com a logo carregando no cabeçalho.

## Revela: entrega por destino (25/10/2026)

- Fontes conferidas em 25/10/2026: YouTube (codificação recomendada e HDR), Vimeo (compressão), Netflix Partner Help
  (servicing em ProRes 422 HQ, Rec.709/BT.1886), Portaria MC 354/2012 (−23 LKFS ±2). Instagram e TikTok não publicam
  especificação técnica: presets marcados como Mercado. API de render do Resolve conferida no README de script da v20.
- `products/finishing`: `npm test` (**27/27**). Dados: todo preset tem fonte com link, tipo e data; bitrate pela
  altura/cadência. Script: roda num Resolve simulado (Python) e escolhe H.264/H.265/ProRes 422 HQ pelo nome (sem
  confundir com ProRes 422), bitrate de 2160p numa timeline 4K, 1080×1920 nos verticais, PCM 24 bits na TV, e relata
  ajuste recusado. Tela: 8 destinos, selos Oficial/Mercado/"Loudness oficial", download do `.py`, link direto por
  `#destino`, celular sem rolagem lateral, sem erro de console com a CSP de produção.
- Não validado: o script no DaVinci Resolve Studio real (nomes de tags HDR como `ST2084` podem variar por versão; o
  script avisa se o Resolve recusar).

## Revela: conversor no navegador (25/10/2026)

- `products/finishing`: `npm test` (**35/35**). Plano (puro): bitrate de 2160p a partir de master 4K, redução sem
  ampliar, dimensões pares, 1080×1920 no vertical, avisos de HDR/primárias/cadência, sem áudio não pede codec;
  `vendor/` igual aos pacotes instalados. Tela: ffmpeg gera ProRes 422 HQ 1280×720 com áudio PCM, a página confere
  `crossOriginIsolated`, converte, baixa e o ffprobe lê H.264 1280×720 com `bt709` nas três tags e faixa de áudio.
- Experimento fora do teste: ProRes 1080p de 4 s convertido em ~3 s no Chromium headless sem GPU (mais rápido que o
  tempo real); diferença média de RGB entre o ProRes e a saída: 0,61 nível (sem a remarcação BT.709, a saída ia
  como `smpte170m`).
- Chromium no Linux não codifica AAC: a saída usa Opus e a tela avisa. CI do app ganhou o ffmpeg.
- Celular (390 px) sem rolagem lateral. Não validado: Safari/iOS e Chrome/Android reais, codificador de hardware,
  arquivos grandes no celular.

## Revela: telas no padrão Apple, com pouco texto (26/10/2026)

- A pedido do titular, as três telas da Revela perderam os blocos de explicação: título curto, uma linha de apoio,
  cartões com o formato de cada destino (16:9, 9:16, TV, película), controles segmentados, botões em Liquid Glass
  (ação principal em vidro claro sobre o preto fosco) e detalhes técnicos recolhidos (ficha, avisos, fontes).
- Conversor: miniatura do primeiro quadro (com a cor BT.709 certa), fichas em vez de frases, barra com brilho
  enquanto converte, selo de pronto; a caixa de soltar encolhe quando há arquivos.
- Motion só em CSS e só com `prefers-reduced-motion: no-preference`: entrada escalonada, troca do detalhe, brilho da
  barra, selo de pronto, ícone que respira ao arrastar.
- `products/finishing`: `npm test` (**35/35**), testes de tela ajustados (fichas, miniatura não vazia, caixa
  compacta, grupos de rádio com nome). Desktop 1280 e celular 390 sem rolagem lateral e sem erro de console.

## HUB: menu recolhível, tela inteira e central da conta (26/10/2026)

- Pedido do titular: menu lateral recolhível, melhor uso da tela de cada aparelho e uma central de administração da
  conta (senha, e-mail, foto, plano, acessos).
- Raiz: `npm run lint`, `format:check`, `typecheck` ok; `npm test` **125/125** em 15 arquivos (novo
  `account-center.test.ts`, 12 testes: troca de e-mail só depois de confirmada pelo endereço novo, senha atual
  exigida, e-mail de outra conta recusado, links de nova senha antigos derrubados, conta só Google sem troca; nome pelo
  `zro_app`; foto pelo tipo real dos bytes, até 300 KB, visível só a quem divide organização, RLS contra escrita em
  nome de outra pessoa; pedidos de plano só por dono/administração/financeiro, um aberto por plano, editor e outra
  organização não veem nem criam, a pessoa não marca o próprio pedido como atendido, renovação exige plano pago; resumo
  de acessos com plano só para a cobrança). `npm run build` ok (72 rotas). `npm run test:e2e` **18/18** (novos: menu
  recolhe, lembra no recarregar e não vale no celular, que usa uma barra só e fecha a folha ao navegar; conta com nome,
  foto reduzida para WebP no navegador e servida em `/api/v1/users/{id}/avatar`, pedido de upgrade e acessos; axe
  WCAG 2.1 A/AA nas quatro seções da conta, claro e escuro). `scan-secrets`: nada em 1774 arquivos.
- Conferido em screenshot: 1440 px aberto e recolhido, as quatro seções da conta, e 390 px com a faixa de seções e a
  folha do menu.
- Não validado: envio real do e-mail de troca (sem provedor de e-mail, a tela avisa e mostra o link só em
  desenvolvimento); fotos HEIC em iPhone real (o navegador pode não abrir; o servidor recusa o que não for JPG, PNG ou
  WebP).

## Marca flat: anel com centelha (26/10/2026)

- Letras do wordmark original vetorizadas (`scripts/marca/vetor`, potrace com ampliação 6×) e O redesenhado; SVG
  mestres, `packages/ui/src/marca.ts` e ícones saem da mesma geometria. Conferido em tela: wordmark e símbolo em
  claro e escuro, ampliados (retas limpas) e pequenos (16 px só o anel).
- HUB: `lint`, `format:check`, `typecheck` ok; `npm test` **113/113**; `npm run build` ok; `npm run test:e2e`
  **16/16** (axe WCAG A/AA claro e escuro com a marca em SVG). App de computador: `npm run icons` e `npm test`
  **14/14**.
- NOSSOM: `typecheck` ok, `npm test` **73/73**, E2E do botão "Entrar com Absolute ZRO" **2/2** (o teste confere o
  símbolo em SVG). SOBEDESCE: `typecheck` ok, `npm test` **231/231**.
- OG e capturas do HUB nos aparelhos refeitos com a marca nova (demo local). Branding no Higgsfield: 6 imagens
  (GPT Image 2.5, 2K) e a animação (FLUX 3 Video, 5 s): a estrela nasce com as 4 pontas e recolhe até a forma flat.
- Não validado: ícones no Dock/Menu Iniciar reais (sem Mac/Windows aqui) e no iPhone real.

## Central de apps (26/10/2026)

- HUB: `tests/integration/desktop-apps.test.ts` (escolha do arquivo por versão e build, só com SHA-256; NOSSOM pelo
  Release nossom-v\* mais novo ou pelo repositório antigo; GitHub fora do ar não quebra o catálogo; download só de
  arquivo reconhecido, com token pelo endereço assinado). Conferido contra os Releases reais: SOBEDESCE 0.1.0 (b1005) e
  Synquei 1.0.0 (b1004) entram com SHA-256; NOSSOM fica de fora sem token (repositório antigo privado).
- E2E: a página Downloads com a ponte do app simulada instala com progresso, abre, mostra Atualizar e esconde o
  instalador avulso; no navegador nada da central aparece.
- App de computador: `test/central.test.mjs` (catálogo malicioso descartado, arquitetura do Mac, regra de atualização,
  registro do Windows, download conferido e apagado quando não confere, instalação simulada no Mac em `/Applications` e
  em `~/Applications`, NSIS com `/S /currentuser`, app aberto bloqueia atualizar). `npm test` e `npm run smoke`
  (Electron real no Linux, com a ponte da central) ok.
- Sites: Synquei `npm test`, SOBEDESCE `typecheck` e `npm test`, NOSSOM `typecheck` e `npm test` ok.
- Não validado: instalação real num Mac e num Windows (sem os sistemas aqui), instalação da tela de início em iPhone e
  Android reais.

## Revela: página inicial, login e conta Absolute ZRO (26/10/2026)

- `index.html` virou a página inicial (motion em CSS, telas reais em MacBook/iPhone, frames da ZRO Filmes como exemplo (o "antes" é o frame em log simulado));
  a ferramenta de LUT foi para `lut.html`. "Testar com um exemplo" carrega as duas fotos e monta a prévia.
- `entrar.html` + `api/zro/{entrar,callback,eu,sair}.js` no padrão do Synquei (PKCE S256, `client_secret_basic`,
  cookies assinados, `zro_products` decide o acesso). `Cache-Control: no-store` em `/api/zro/*`.
- `products/finishing`: `npm test` (**59/59**): 21 do login contra um provedor OIDC falso; tela com home (1440 e 390
  sem rolagem lateral, sem imagem quebrada, sem erro de console), entrar (fora e desligado) e o exemplo.
- Não validado: login real (falta o cliente `revela-web` no console e as variáveis no projeto Vercel `revela`).

## Revela Look (26/10/2026)

- `src/cor/looks.js`: look de película com matemática própria (o FVPro+ do titular, pacote pago de terceiro, não
  entrou no repositório). Botão "Revela Look" na tela de LUT, no lugar da referência; conta-gotas desligado nele.
- `products/finishing`: `npm test` (**65/65**): 5 testes do look (intensidade 0 não mexe, curva monótona com preto
  aberto e branco que deita, sombras frias e altas quentes, verde para oliva com pele no lugar, só curva / só cor,
  .cube fiel ao look) e 1 de tela (sem referência, baixa `revela-look-33.cube`, referência nova volta ao normal).
- Não validado: comparação lado a lado com o FVPro+ no Resolve.

## Revela CST (26/10/2026)

- `src/cor/espacos.js`: curvas log e gamuts das câmeras do CST do Resolve, a partir das fórmulas publicadas pelos
  fabricantes. `cst.html`: câmera → saída, prévia num still, .cube 33/65, "Suavizar altas". Aba CST nas quatro telas.
- `products/finishing`: `npm test` (**72/72**): cinza 18% de cada log no valor publicado (S-Log3 420, S-Log2 347,
  LogC3 0,391, LogC4 0,2784, V-Log 433, Canon Log 3 34,3% IRE, Log3G10 1/3…), ida e volta de todas as curvas, matrizes
  Rec.709→XYZ, S-Gamut3.Cine→709 e AP1→709 iguais às de referência, branco que continua branco, cinza neutro na
  saída para as 17 câmeras, identidade, log→log sem corte, altas suaves; tela no computador e no celular (375 px sem
  rolagem lateral), baixa `revela-cst-arri-logc4-para-rec709-65.cube`.
- Não validado: comparação no Resolve com o CST dele (nível de dados de cada formato) e em material real de cada câmera.

## Revela: dock embaixo e menu recolhível (26/10/2026)

- As abas saíram do cabeçalho (o desfoque dele prendia o `position: fixed`) e viraram um dock embaixo; `app/menu.js`
  monta o menu lateral nas quatro ferramentas: trilho 68 px ↔ 248 px no computador (lembrado), gaveta no celular.
- `products/finishing`: `npm test` (**73/73**), com teste novo: dock no rodapé da tela, menu que abre e é lembrado
  entre páginas, item atual marcado, gaveta no celular que fecha com Esc, sem rolagem lateral em 375 px.

## Família Absolute ZRO nos menus de todas as plataformas (26/10/2026)

- A pedido do titular, o bloco "Absolute ZRO" (ícone e nome de cada app, levando ao app) entrou no menu de cada
  plataforma: HUB (lateral e menu do celular), Revela, Sobedesce (lateral do computador e Ajustes do celular),
  Synquei (lateral), Nossom (menu do estúdio e gaveta), TPEasy (Ajustes). Ordem alfabética em todas, sem o app atual
  e sem o AI Edit (em desenvolvimento). Revela sem o selo "Protótipo".
- Testes: Revela 73/73 (confere a ordem), Sobedesce `test:fast` 706/706 (familia.test.js confere a ordem), Synquei
  63 (4 pulados sem luajit), TPEasy 23/23, Nossom typecheck, formato, 73/73 e o e2e da família (confere a ordem);
  HUB lint, typecheck, 113 unitários, build e 16 e2e.
- Não validado: cliques nos apps de computador (Electron) e em iPhone/Android reais.

## Revela no SOBEDESCE: "Converter com a Revela" (26/10/2026)

- Um botão só (pedido do titular): converte o aparelho que tocou. Computador: ffmpeg do app. Celular: o próprio
  aparelho, no navegador; o pedido ao computador que existia antes deste ajuste saiu (site sem mudança).
- `products/sobedesce`: `test/revela.test.js` (**7/7**): cópias de products/finishing iguais (presets, plano, ícone e,
  no celular, plano e Mediabunny), leitura do `ffmpeg -i` (ProRes 4K, HDR com `pq`, celular deitado), linha de
  comando (45 Mbit/s no 4K do YouTube, GOP de 12 a 23,98 fps, tags 1-1-1, AAC 384k, 1080×1920 no Reels) e, com o ffmpeg
  de verdade e o Drive falso, um ProRes do Drive vira `<nome>-youtube.mp4` na mesma pasta, H.264 1280×720 `bt709` nas
  três tags com AAC 48 kHz, MD5 do Drive igual e nenhum temporário para trás. Trabalhos da tela (SSE, parar).
- `test/revela-celular.test.js` (**1/1**, Chromium): o motor do app do celular, com a CSP de produção do `/app/`, lê um
  ProRes de um "Drive" que só responde com token e por pedaços, troca o token recusado (401) e devolve H.264 1280×720
  `bt709` com áudio. A CSP do `/app/` ganhou `'wasm-unsafe-eval'` e `worker-src blob:` (o teste mostrou o bloqueio).
- Suíte do SOBEDESCE (`npm run test:fast`): estado inicial com a chave `revela`, app do celular 2.8.44 (cache v59).
- Tela do computador conferida no Chromium com o app de verdade: menu, janela com os quatro cartões nos temas escuro e
  claro, andamento e pronto com o arquivo novo na pasta.
- Não validado: Mac e Windows reais (VideoToolbox, NVENC); iPhone e Android reais (velocidade, memória, Safari).

## Domínio absolutezro.com e junção dos PRs 34 a 37 (26/10/2026)

- HUB em `https://absolutezro.com` (`/api/health` ok, emissor OIDC no domínio novo, `www` → 308). `ZRO_ISSUER` no domínio
  novo nos projetos Vercel de Synquei, SOBEDESCE, NOSSOM, TPeasy e Carro do Freela; "Entrar com Absolute ZRO" de cada um
  leva ao `/oauth/authorize` do domínio novo e daí à tela de entrar. Endereços fixos `absolutezro.vercel.app` trocados.
- Deploys: o passo de ignorar build compara com o último deploy (`VERCEL_GIT_PREVIOUS_SHA`), não com `HEAD^`; saiu o
  `ignoreCommand` do `vercel.json` do Carro do Freela e do Revela, que sobrescrevia o do projeto.
- Junção: raiz `lint`, `format:check`, `typecheck` ok, `npm test` **131/131**, `build` ok, `test:e2e` **20/20**. App de
  computador **22/22**. Synquei **63/63**. NOSSOM `typecheck` ok e testes sem falha. SOBEDESCE **715/715** e web
  **231/231**.
  Carro do Freela **83/87**: as 4 que falham (`fase1-sem-dinheiro`, `seguranca`, `tela-de-inicio`, `versoes`) falham
  igual na `main`, porque dependem das páginas geradas por `npm run build:fases`.

## Vendas pelo Stripe (26/10/2026)

- Migração 0011: preços (avulso R$ 59,90/mês ou R$ 449/ano; Completo R$ 149,90 ou R$ 1.499; Pro R$ 299,90 ou
  R$ 2.999), créditos de IA e GPU por plano (200, 600, 2.000; teste 50), versões sem preço aposentadas, conta grátis v3 sem ferramentas (rascunho até ligar as vendas) e `zro.platform_settings`.
- `packages/billing/test/stripe.test.ts` (8 testes): tabela de preços e créditos; corpo no formato do Stripe; assinatura
  `Stripe-Signature` (segredo errado, corpo alterado e evento velho recusados); tradução de `customer.subscription.*`
  (unpaid → atraso, incomplete_expired → expirada, sem metadados do HUB → ignorado); checkout com preço e organização
  nos metadados da assinatura; erro do Stripe vira mensagem curta; evento libera a ferramenta e repetido não duplica;
  "Ligar vendas" numa transação desfeita (conta antiga até o corte, conta nova com grátis v3 + 7 dias do Completo,
  teste com 50 créditos mesmo depois de recalcular, repetir não move o corte, validações). Raiz: `npm test`
  **140/140**.
- Não validado: checkout e portal reais (sem conta Stripe ainda).

## Revela: Clonar LUT, preset Lightroom e página inicial (26/10/2026)

- `src/cor/clonar.js`: o mesmo frame com e sem a cor vira LUT. Matriz afim por mínimos quadrados + resíduo numa grade
  17³ (espalhamento trilinear, borrado e regularizado para a matriz onde não há amostra). Numa cena diferente, a LUT
  clonada chega a 0,0095 do look verdadeiro (sem nada: 0,079).
- `src/cor/lightroom.js`: preset .xmp com curvas por canal e HSL das oito faixas. É aproximado (o Lightroom não aplica
  LUT 3D em preset) e a tela diz isso no botão.
- Página inicial: "Testar agora" abre a LUT com o exemplo carregado; comparação Log/Final arrastável; faixa "Funciona
  no seu editor"; cartão do CST. Sem "grátis" no texto (PRD §9.1: não assumir preço nem teste grátis).
- `products/finishing`: `npm test` **78/78**.
- Não validado: o .xmp aberto num Lightroom real (Classic e celular) e a semelhança dele com a LUT.

## Página inicial: símbolo e órbita (26/10/2026)

- `BrandSymbol` (anel em traço + centelha da `ZRO_SIMBOLO`) e `PointerTilt` (variáveis CSS, só mouse/caneta, nada
  com "reduzir movimento"). Órbita com classes `zorbit` para não colidir com a órbita do Início do HUB.
- Conferido em 1440×900 e 390×844, claro e escuro, e com "reduzir movimento" (forma flat parada, sem rolagem
  horizontal).
- `a11y.spec.ts` termina as animações de entrada (finitas, de tempo) antes do axe, que mede o contraste final;
  as infinitas e as de rolagem ficam como estão.
- `npm test` **140/140**; `npm run test:e2e` **20/20**.
- Não validado: Safari e Firefox sem `animation-timeline` (caem na versão sem órbita animada, conferida só no
  Chromium com reduzir movimento).
- OG novo (escolha do titular): símbolo grande à esquerda, fundo branco chapado, apps sem placa nem borda
  (`scripts/marca/og-claro.html` → `opengraph-image.jpg`/`twitter-image.jpg`). Ícone do app segue o atual (claro).
- Ícone da SOBEDESCE na família sem a moldura (placa até a borda, sem margem nem sombra) no HUB, NOSSOM, Revela,
  TPeasy, Synquei e Carro do Freela; caches `synquei-v13` e `tpeasy-v13`. Órbita da home mostra só o ícone de cada
  app, sem placa de vidro em volta. `products/synquei` e `products/tpeasy`: `npm test` ok; e2e 20/20.

## Revela: CST no Converter (26/10/2026)

- "Log da câmera" no Converter: cada quadro passa por uma LUT 3D do CST (65³, WebGL2) antes de codificar; o shader
  desfaz a faixa de vídeo antes da curva. Produção conferida depois do merge do #38 (exemplo, Revela Look, CST e
  Converter abrindo sem erro em revela-zro.vercel.app).
- `products/finishing`: `npm test` **79/79**. Teste novo: ProRes com cinza no código do S-Log3 vira MP4 H.264 com o
  cinza em ~124 (Y de 8 bits, o cinza 18% do Rec.709; sem o CST ficaria perto de 105) e marcado BT.709.
- Não validado: arquivos reais de cada câmera e o desempenho em celulares.

## AEON na página inicial (26/10/2026)

- Migração 0012: a plataforma de edição vira **AEON** (id `ai-edit` mantido, estágio "em desenvolvimento"), com a linha
  "Edição com IA: transcrição, cortes e timeline para o seu editor". Só troca o que ainda está como a 0003 deixou.
- Ícone do AEON (de `products/ai-edit/marca/aeon-icone.svg`, branch `claude/ai-edit-primeiro-recorte`) em
  `public/products/ai-edit.svg`, recortado até a placa (sem margem), no `ProductMark`: órbita, cartões, planos e HUB.
- Cartão da home: "A IA propõe. Você aprova." Projeto: etapa "AEON" ainda não lançada. e2e procura "AEON".
- `npm test` 140/140; e2e 20/20.

## Revela: tema claro, looks lado a lado, exportar por editor e CST por clipe (26/10/2026)

- Tema claro por padrão em todas as telas (o escuro fica no menu e é lembrado), logo grafite no claro, Figtree nos
  títulos (servida da própria Revela), sem manchas de luz na página inicial nem no login. Página inicial com menos
  texto (sem sobretítulos e sem frases nos cartões), seção "Um frame. Todos os looks." e telas reais no tema escolhido.
- Cinco looks (`LOOKS`): diferentes entre si, cinza sempre subindo em luz percebida, P&B sem cor. Grade de looks na tela
  de LUT: só o frame já mostra todos; com referência, ela entra primeiro e dá para voltar.
- Exportar: Premiere, Final Cut e CapCut recebem .cube de 33 com o editor no nome; .xmp de cada look é XML válido.
- CST por clipe: o relatório do `toCsv` do Synquei vira câmeras com log sugerido; o script gerado roda num Resolve de
  mentira (Python) e põe a LUT certa no nó 1 de cada clipe, deixando de fora clipe sem log ou fora do relatório.
- `products/finishing`: `npm test` (ver o total no PR). CI da Revela também roda quando muda o relatório do Synquei.
- Não validado: o script num DaVinci Resolve real (SetLUT no nó 1), os .cube no Premiere, Final Cut e CapCut reais, o
  .xmp num Lightroom real.
- Não feito, por depender de outros apps: entrega da Revela subindo pelo SOBEDESCE com MD5 e `delivery.ready` no HUB;
  desconto de `zro.ai_credits` (a Revela não usa GPU de servidor).

## AEON: marca, Seus universos, Inspector, Histórico e site (26/10/2026)

- `products/ai-edit`: `npm test` (unidade, exportadores com xmllint e JSON Schema, SOBEDESCE, instaladores) **27/27**;
  telas no Chromium **4/4** (+1 que baixa o Whisper, pulada sem rede): caminho inteiro com Inspector (opacidade e
  escala viram uma ação no desfazer e vão para o FCPXML), marcador (M) e Histórico (volta e avança), autosave em Seus
  universos, reabrir e religar o vídeo pelo nome, projeto novo 9:16 a 25 qps e renomear. Smoke do Electron ok.
- Marca: geometria em `src/marca.js` (hipérboles), conferida lado a lado com a prancha do titular; letras do nome em
  contorno da Montserrat SemiBold (OFL) por `scripts/letras.py`.
- Site: telas do app tiradas por `scripts/telas.mjs` (o app de verdade, com vídeos de demonstração gravados das imagens
  do Higgsfield e transcrição trocada por roteiro fixo, porque a fala sintética não tem palavras). Conferido em escuro,
  claro e 390 px de largura.
- Não validado: o app no navegador em Safari e Firefox (precisa de WebCodecs; o site indica Chrome ou Edge).
- Conta obrigatória: `test/zro.test.js` **21/21** (entrar, criar conta, volta, sessão sem token, recusas de state,
  nonce, emissor, público e assinatura, login desligado → 503) e o teste de tela "só com conta" (sem sessão o editor vai
  para `entrar.html?volta=/app/`; com sessão o menu mostra a pessoa).

## AEON: tirar mídia, selecionar várias, editor completo e homepage nova (26–27/10/2026)

- Tirar mídia: `test/nucleo.test.js` (some a mídia, os clipes, a transcrição, as propostas e as correções; uma ou
  várias; desfazer devolve) e a tela "projeto novo" (× no cartão, Selecionar → marcar duas → Tirar do projeto → ⌘Z).
- Atualização pelo app: fica a da main (`desktop/atualizador.cjs`, "Versão nova · Atualizar"); uma segunda versão
  feita em paralelo (atualização ao fechar o app) saiu para não ter dois atualizadores.
- Instalador do Terminal conferido de ponta a ponta com os comandos do Mac simulados no Linux (build 8 baixado,
  SHA-256 conferido, `AEON.app` em Aplicativos). No Mac de verdade parou em `NOME?: unbound variable`: o bash 3.2 lê o
  "…" colado em `$NOME` como parte do nome. Variável colada em caractere não ASCII vai entre chaves e
  `test/instalacao.test.js` confere o arquivo inteiro. Não validado: o bash 3.2 rodando aqui.
- Site: download direto com o passo da quarentena, 390 px sem rolagem lateral. Homepage: topo na tela toda no
  computador, cenas que se dissolvem no fundo, MacBook que abre, números que contam e três demonstrações ao vivo
  (rodam só na tela; paradas com "reduzir movimento"); conferida em 1440×900 (claro e escuro) e 390×844.
- Posicionamento (titular, 26/10/2026): o AEON é editor completo e a IA é ajuda opcional. Textos do site, do app, do
  HUB (linha do catálogo, página do projeto, migration 0014 para descrição e papel no fluxo) e regras do produto
  (`products/ai-edit/CLAUDE.md`). Downloads do HUB: AEON com Mac, Windows e navegador; `/baixar/mac` e
  `/baixar/windows` do site redirecionam para o Release (regra de "instalador pela rota /baixar do site" conferida).

## Página inicial de cinema (26/10/2026, estrutura escolhida pelo titular)

- Topo: paisagem em preto e branco com o símbolo esculpido em metal sobre a rocha, gerada no Higgsfield (GPT Image
  2.5) a partir do SVG oficial como referência: anel grosso com só as duas pontas horizontais da centelha
  (`public/brand/home-paisagem{,-sm}.webp`). Frase "O futuro começa do zero." à esquerda, palavras do ecossistema à
  direita, véu claro/escuro para leitura e foto escurecida no tema escuro.
- Abaixo: as 7 ferramentas numa faixa discreta (ícone, nome, uma linha, link para o site oficial), a régua
  "Ferramentas que se conectam · Um ecossistema completo", o cartão do Ciclo do O (para /planos), o painel do HUB e o
  fechamento. Saíram a órbita, o explorador, a linha do job à entrega, os números e os downloads repetidos.
- Conferido em 1440×900 e 390×844, claro e escuro, sem rolagem horizontal nem erro no console. e2e 20/20 (o teste do
  login único falhou uma vez no axe por `document-title` antes do título carregar e passou ao repetir).

## App Absolute ZRO para computador no ar (26/10/2026)

- Pedido do titular: download público do app (central das ferramentas com a conta única), também pelo Terminal como no
  SOBEDESCE. `HUB_DESKTOP_PUBLICO=1` em produção no projeto `absolutezro`; Release `hub-desktop` build 10 (1.0.0) com
  `.dmg` e `.exe` e SHA-256 em `/baixar/hub/versao`.
- `public/instalar.sh` (Mac) e `public/instalar.ps1` (Windows), derivados dos do SOBEDESCE: leem `/baixar/hub/versao`,
  baixam `/baixar/hub/{mac,windows}`, conferem o SHA-256, fecham o app aberto, instalam ("Absolute ZRO.app" em
  Aplicativos sem quarentena; NSIS em silêncio para o usuário) e abrem. `sh -n` ok. O cartão do app em `/baixar` mostra
  os dois comandos com botão de copiar.
- Não validado: a instalação real num Mac e num Windows (sem aparelho aqui).

## SOBEDESCE: Abrir no Synquei, ficha de compatibilidade e prova medida (26/10/2026)

- Abrir no Synquei: `products/sobedesce/test/synquei-ponte.test.js` (tipos iguais aos do Synquei, link só com pasta
  absoluta e tipo conhecido, cartão Sony falso copiado de verdade → `tipo` no `descargas.jsonl` → link com a pasta do
  projeto; sem cartão conferido, 409). Synquei: `tests/link-organizar.test.mjs` (link válido, recusa de pasta relativa,
  outro host e outro esquema, link no argv do Windows) e `tests/organizador.test.mjs` (tipo do resumo vale até a pasta
  ter um escolhido no Synquei; tipo desconhecido é ignorado).
- Ficha de compatibilidade no topo da página inicial do site (Mac, Windows, iPhone e Android, Google Drive, cartões e
  HDs): só o que o README e o `electron-builder.yml` dizem. `npm run lint` e `npm run typecheck` do site sem erro.
- Prova medida: o script mede, não estima. Não rodou aqui (sem Drive real nem rede de casa): os seletores do botão de
  download do Drive precisam ser conferidos na primeira medição; se falharem, o script aceita o tempo medido à mão e
  registra isso no JSON.
- Não validado: o protocolo `synquei://` num Mac e num Windows reais (registro pelo instalador, `open-url`, segundo
  processo no Windows) e o aviso "Instale o Synquei" quando ele não está no computador.

### Roteiro: "Converter com a Revela" em aparelhos reais (a fazer)

| Aparelho                                | O que conferir                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Mac (Apple Silicon e Intel)             | Converter um vídeo do Drive para cada destino; arquivo novo ao lado do original; MD5 conferido; original intacto |
| Windows 10/11                           | O mesmo, com ffmpeg do pacote                                                                                    |
| iPhone (Safari e app na tela de início) | Converter pelo celular; progresso, cancelar e erro com mensagem clara                                            |
| Android (Chrome)                        | O mesmo do iPhone                                                                                                |

Anotar por aparelho: sistema, tamanho do arquivo, tempo, destino e o que falhou.

## SOBEDESCE: entrega conferida → `delivery.ready` v2 (26/10/2026)

- Contrato: `delivery.ready` v2 (`source` finishing ou sobedesce, arquivos, bytes, `checksum: md5`, `verified: true`,
  `folder_url` só no formato de pasta do Drive); schema exportado em
  `docs/integration-contracts/schemas/event.delivery.ready.v2.schema.json`. Rota nova
  `POST /api/v1/projects/{id}/sobedesce/deliveries` documentada no OpenAPI.
- SOBEDESCE `test/entrega.test.js`: comprovante só com o lote inteiro concluído e conferido (pulado igual no Drive
  entra), um envio de uma pasta, link montado pelo id da pasta.
- HUB `packages/integrations/test/adapters.test.ts`: lê o comprovante gerado pelo código real
  (`tests/fixtures/sobedesce/entrega.json`, `scripts/fixtures/generate-sobedesce-entrega.mjs`) e recusa caminho
  perigoso, MD5 fora do formato, arquivo repetido, lista vazia e link que não é o da pasta.
- HUB `tests/integration/flow.test.ts`: registrar publica um `delivery.ready` v2 (`producer: sobedesce`), registrar de
  novo não duplica nem gasta cota, link adulterado é recusado e sem plano a resposta é 403.
- Não validado: o botão **Comprovante** num envio real para o Drive e o registro pela tela do HUB em produção.
- Site do SOBEDESCE: topo sem texto em degradê e sem brilho azul (Padrão Apple).

## App para computador: abertura, painel e login; AEON e Revela disponíveis; Avulso numa janela (26/10/2026)

- `npm test` **143/143** (testes que esperavam AEON e Revela bloqueados agora conferem a liberação de 0013; o caso
  "fora do catálogo" usa um id inexistente). `apps/hub-desktop` `npm test` 22/22. Lint, formatação, tipos e build ok.
- Capturas locais (claro e escuro) de `/planos` com 3 apps marcados, `/app/entrar`, `/app` com conta nova e quadros
  da abertura em 0,3 s, 0,9 s, 1,6 s e 2,4 s.
- Não validado: a abertura e o painel dentro do app instalado (Mac e Windows) até sair o build 1.1.0.

## Revela em revela.absolutezro.com (26/10/2026)

- A pedido do titular, o projeto Vercel `revela` ganhou o domínio `revela.absolutezro.com` (zona do absolutezro.com na
  própria Vercel, HTTPS no ar). `revela-zro.vercel.app` redireciona (308) para o endereço novo pelo `vercel.json`.
- Links trocados na Revela (canônico, OG, login `SITE`), no HUB, no Nossom, no TPEasy (cache v13) e no Carro do Freela.
  Ficaram com o endereço antigo, que redireciona, os menus do Synquei (`app/`) e do SOBEDESCE (computador e web): mexer
  neles dispara a publicação do app de computador, que o titular deixou para depois.
- Login único: o cliente `revela-web` no console do HUB deve usar `https://revela.absolutezro.com/api/zro/callback`.
- `products/finishing`: `npm test` 89/89; TPEasy 23/23; raiz: lint, formato e typecheck.

## Revela: abas sem recarregar e login cadastrado (26/10/2026)

- Bug relatado pelo titular: tocar numa aba do dock recarregava a página inteira (menu, logo, dock). Agora
  `app/navegar.js` busca o painel da aba uma vez, troca só o `<main>`, roda o módulo dele uma vez e atualiza título,
  canônico e histórico (voltar/avançar funcionam). O painel de antes fica guardado com o que estava (frame, looks,
  conversão em andamento). Cada módulo procura os elementos no próprio `<main>` (`raiz`), então os painéis não se
  misturam. Início, conta e links externos seguem pelo link. A marca da aba ativa é uma peça só que desliza de aba em
  aba (sem deslizar com "reduzir movimento"). Sem `fetch`/`history` ou com erro, vai pelo link como antes.
- Teste novo no Chromium: LUT → CST sem recarregar (marca na `window` e no menu continuam), marca desliza, CST baixa o
  `.cube`, voltar devolve o LUT com o frame e os 5 looks, e o CST guarda a câmera escolhida.
- Login: cliente `revela-web` (confidencial, confiável, produto `finishing`) e auditoria `oauth_client.created` no
  banco `AbsoluteZRO`; `sso_start_url` = `https://revela.absolutezro.com/api/zro/entrar`; `ZRO_CLIENT_ID` na Vercel.
  O segredo não está no repositório: o titular cola `ZRO_CLIENT_SECRET` na Vercel. Login de ponta a ponta ainda não
  testado.
- `products/finishing`: `npm test` 90/90; raiz: lint e formato.

## Revela: estudo com stills reais e Clonar com mais frames (26/10/2026)

- Material do titular (fora do repositório): 4 cenas em S-Log3 / S-Gamut3.Cine, o Rec.709 e o look de película de
  cada uma, e os PowerGrades (`.drx`). O `.drx` mostra o caminho: CST S-Log3 → LogC3 (EI 800) / AWG3, negativo e cópia
  em LUT, utilitários, grão, halação e um DCTL; a versão Rec.709 troca a CST para Rec.709 e mantém as primárias.
- Clonar LUT, medido nessas cenas (ΔE Oklab ×100, numa cena que a LUT não viu): log → Rec.709 1,52 → **0,69** com 3
  frames e 2,61 → **1,17** com um; log → look 7,17 → **6,18** com um e 5,07 com 3. O look não cabe numa LUT só
  (mesmo com as 4 cenas, 2 a 4 de erro): muda de plano para plano e tem grão e halação. A orientação automática acertou
  24 de 24 pares e o "mesmo quadro" separou as 16 combinações de cena.
- Tela: "Mais frames" no lugar do conta-gotas no clone, contagem de frames e aviso para imagem sem par.
- CST: saída "ARRI LogC3 / AWG3 · para LUT de película" (log para log, sem mapa de tom), como no node tree estudado.
- Testes: unidade (curva vale em outra cena, 2 frames ≥ 1, orientação, outra cena recusada, LogC3) e Chromium (stills
  em qualquer ordem e um sem par). `products/finishing`: `npm test` 94/94; raiz: lint e formato.
- Não validado: a LUT clonada aplicada dentro do Resolve em material de vídeo; o Rec.709 do estudo inclui as primárias
  do colorista, então ele não mede a CST da Revela sozinha.

- Ícone do app (pedido do titular): placa branca chapada, sem sombra nem degradê, anel no centro e marca maior
  (`scripts/marca/icones.py`, diâmetro 0,56). Gerado de novo para o HUB (`--instalar`) e para o app (`npm run icons`).

## App para computador 1.1.1: cliques voltam a funcionar no Mac (26/10/2026)

- Causa: no Mac, a área de arrastar janela (`-webkit-app-region: drag`) da página da barra (`barra.css`, `.barra` com
  `height: 100%`, isto é, a janela inteira por baixo do HUB) e da abertura (`abertura.css`, `body`) vale para a janela
  toda e engole os cliques no painel. Os botões Voltar/Avançar/Início também ficavam no meio da janela, escondidos.
- Correção: a barra arrasta só nos 38 px de cima (`ALTURA_BARRA`); a abertura não arrasta. `test/cliques.test.mjs`
  (falha sem a correção, passa com ela); `apps/hub-desktop` `npm test` 25/25.
- Conferido no Linux (Electron 44 em tela virtual, cliques e teclado reais pelo X): abertura, login em `/app/entrar`,
  painel `/app` e clique em Planos na barra lateral. A barra renderizada tem 38 px com os botões dentro.
- Painel no app: ferramenta sem versão para o computador (NOSSOM hoje) mostra **Abrir na web** em vez de ficar sem
  botão. SOBEDESCE e Synquei têm instalador para Mac e Windows no catálogo (`/api/v1/desktop/apps`).
- Não validado: o Mac de verdade (a área de arrastar só vale lá e no Windows); conferir no 1.1.1 instalado.

## Revela Look com a luz do grade do titular e Meus looks (26–27/10/2026)

- Primeira tentativa recusada pelo titular ("não tá bonito nem perto"): o ajuste automático dos 15 parâmetros baixou o
  erro médio (6,2 → 2,9) amarelando as altas e o branco. A comparação mostrada ainda aplicava o look num frame que já
  tinha o grade dele (grade em dobro). Não foi para a main.
- Leitura por faixa de luz (Rec.709 → grade dele, 3 cenas): o grade sobe o meio-tom (L 41 → 46, 58 → 69, 75 → 83)
  com preto e branco no lugar, esquenta meios e altas (b +2 a +3) e deixa a sombra neutra. O motor ganhou `gama`
  (curva do meio sem mexer nas pontas) e `meios` (tom no meio-tom que some antes do branco), opcionais.
- Versão final: base antiga + gama 1,2, contraste 7, pivô 0,28, densidade 0,25, saturação 0,95, sombra neutra, meios
  dourados e branco quase neutro; matizes da base. Erro médio 6,21 → **2,92**; comparação visual nas 3 cenas perto do
  grade (o 1.19 é de outro grade). `marca/home/look-revela.jpg` refeita.
- **Meus looks** (`src/cor/meuslooks.js`): o clone vira LUT 33³ em 16 bits com nome, até 8, em `localStorage`; aparece
  na grade de looks em qualquer frame, baixa `.cube` com o nome e apaga. Para o grade exato do titular sem publicar o
  look de um pacote pago no site.
- Testes: unidade (ida e volta do look salvo, intensidade, nome, registro corrompido; Revela Look com meio claro e
  dourado, branco neutro, sombra neutra; Petróleo segue com sombra fria) e Chromium (clone → salvar → outra visita →
  grade com 6 looks → baixar `revela-zro-filmes-33.cube` → apagar). `products/finishing`: `npm test` 96/96.
- Não validado: o `.cube` do look novo e de um "meu look" no Resolve, em vídeo.

## Revela: motor de cor profissional (29/10/2026)

- Pedido do titular: resultado de cinema/Netflix, com testes internos e melhoria constante. Pesquisa (Netflix Partner
  Help Center, ACES 2.0, ARRI ALF4, RED IPP2, OpenDRT, Cullen Kelly, Yedlin, Dehancer, Film Look Creator): o salto
  é de arquitetura. O motor antigo aplicava o look sobre Rec.709 de tela (leitoso, preso ao SDR e à câmera).
- Agora: look na luz da cena (LMT DWG/DI → DWG/DI), tela separada (curva de tom do ACES 2.0 com inversa exata no SDR,
  gamut comprimido, HDR PQ), película por densidade e pacote com LMT 65 (.cube e CLF), ACEScct, LUT de monitor,
  Rec.709, CDL, receita, controle de qualidade e LEIA-ME.
- Controle de qualidade com limites (`src/cor/qc.js`). Primeira rodada: os 13 looks reprovaram (degrau perto do
  preto, cor fora do gamut virando negativa, Oklab instável fora do lócus espectral, pele variando até 34° com a
  exposição, LUT 65 errando até ΔE 0,16). Correções: log com base de filme, compressão de gamut no LMT, contas de cor
  dentro do Rec.2020, pele recortada da separação de tons e com âncora de matiz, transições suaves perto do cinza.
  Hoje os 13 passam; o pior caso de pele é 6,6° e o de LUT é 0,011.
- Revisão visual (folha de contato nos três frames de exemplo e na cartela): sem banding nem degrau nas rampas de
  matiz; ajustes de colorista no 250D e no 500T (estavam lavados) e no branco do Laranja e petróleo e do Dourado.
- Testes: `test/motor.test.js` (tela, ida e volta, película neutra, os 13 looks no controle de qualidade, um look
  quebrado reprovado, tetraédrica, pacote, CLF, CDL, zip) e `test/lab.test.js` reescrito; Chromium do Lab baixa o
  pacote. `products/finishing`: `npm test` 163/163.
- Não validado: as LUTs num Resolve real (DWG/DI e ACEScct), o CLF num leitor OCIO, a LUT do monitor num monitor de
  set, material log real de cada câmera e telas HDR.

## Revela: cópias de cinema das fichas técnicas e revisão em material real (29/10/2026)

- Pedido do titular: presets de películas conhecidas (Kodak 2383 e afins) e material de banco com as especificações.
- Cópias a partir de dado publicado, não de LUT de terceiros: curvas sensitométricas da KODAK VISION 2383 (H-1-2383,
  2022), da VISION Premier 2393 (H-61, 1998) e da FUJICOLOR ETERNA-CP 3513DI (manual Fujifilm, 2007), digitalizadas
  dos gráficos (traço por cor ou por linha) e ajustadas por Richards (erro 0,02–0,09 de densidade); corantes da 2383
  pelo gráfico de densidade espectral em Status A. Na 2393 o verde é a média do vermelho e do azul (a ficha desenha as
  três quase juntas).
- Modelo (`src/cor/copia.js`): negativo + cópia com contraste 1,8 no cinza; os negativos que saem do equilíbrio do
  cinza têm gama 0,50–0,68 (os negativos reais ficam perto de 0,6), conferência independente de que o modelo faz
  sentido. Cinza na densidade de laboratório (1,0 acima da base) → 10% do branco, igual à tela da Revela. Volta pela
  inversa exata da tela Rec.709, então na tela SDR o look é a cópia.
- Rodadas do controle de qualidade:
  - pele virando 11–21° de -2 a +2 stops e razão R/B linear da pele de 11 (contra 3 na tela neutra). Causa: cada
    camada do negativo tratada como primária pura. Correção: sobreposição espectral das camadas (saturação do sistema
    1,3 no meio-tom, em log da razão);
  - sombra profunda da 2393 e da 3513 puxando a pele para o vermelho, dentro do erro da digitalização: o cruzamento
    entre camadas entra com peso de confiança (2383: 1; 2393 e 3513: 0,5), sobre a base de cada camada (o cinza
    continua exato);
  - a cópia real vira a pele com a exposição (vermelha na sombra, dourada na alta): âncora de 0,75 para o matiz que a
    própria cópia dá no meio-tom. Limite declarado de 12° para looks com cópia (cobrado no controle de qualidade);
    medido: 3,8° a 11,4°.
- Os 20 looks passam (`node scripts/qc-looks.mjs`). Testes novos: cópia (cinza, contraste 1,8, gama dos negativos,
  preto da densidade máxima, branco da base, motor = cópia na tela), receita com cópia (versão 3; a 2 abre sem cópia),
  Lab escolhendo a cópia, Looks com o pack Cinema e o pacote com a nota da cópia no LEIA-ME.
- Desempenho: pacote com cópia caiu de 32 s para 9 s (tabela 1D de cada camada com Hermite; inversa da tela sem busca
  longe do pico e com secante perto dele).
- Material real: footage oficial da ARRI (ALEXA Mini e Mini LF em LogC3, ALEXA 35 em LogC4, ProRes 4444 12 bits) e da
  DJI (Inspire 3, D-Log), só nos testes internos (é de terceiros e não entra no repositório). A tela neutra lê LogC3 e
  LogC4 certo; as cópias dão preto denso, céu que deita no branco e, com o 250D, grama oliva.
- Analisar e corrigir no material real: num interior escuro de propósito (galpão com a madeira bem exposta) subia
  +1,1 stop e estourava o assunto. Agora, numa cena escura de propósito, as altas (percentil 90) não passam de 0,75
  stop sobre o cinza: +0,5. Os outros três frames não mudaram.
- Não conseguido: Sony S-Log3 (pro.sony responde 403 a este ambiente), Blackmagic (só BRAW, sem SDK aqui), Panasonic,
  Canon e Fujifilm (sem footage oficial nos sites). Não validado: as cópias contra uma cópia de verdade projetada ou
  contra o scan de um laboratório.

## Revela Lab (29/10/2026)

- Pedido do titular depois do estudo do Shift (plugin de grade para quem não é colorista): um laboratório para criar o
  próprio look com película e looks conhecidos, ajustar e exportar.
- `src/cor/lab.js`: 13 bases em 3 grupos (os 5 looks da Revela, 5 películas e 3 clássicos, todos com o motor de
  `looks.js` e nomes genéricos), correção do frame (exposição pelo meio-tom, no máximo ±1,2 stop, e branco pelos tons
  neutros), 8 ajustes e a receita `.revela` (lida com limites e recusa o que não é receita). `lab.html` protegida como
  as outras ferramentas (`api/app.js`, `vercel.json`, `publicar-site.mjs`), no dock depois da LUT e no menu.
- Testes: unidade (`test/lab.test.js` 6/6: neutro não muda o pixel, bases distintas, cada ajuste no sentido certo, pele
  protegida, correção de frame escuro e azulado, receita ida e volta) e Chromium em 390 px (exemplo → Película →
  Negativo 500T → Calor → LUT `revela-lab-noite-quente-33.cube` → receita → zerar → reabrir → Meus looks).
  `products/finishing`: `npm test` 153/153.
- Converter: o CI passou para Ubuntu 26.04 (ffmpeg 8), que tira a cor dos quadros e ignora as opções `-color_*`
  sozinhas: o ProRes de teste saiu sem `colr` e com os quadros em BT.601, e a saída (corretamente) em `smpte170m`
  (diagnóstico no próprio CI). O master agora marca os quadros com `setparams`. De quebra, quando contêiner e quadro
  discordam, vale o contêiner (como no QuickTime); o teste grava esse desencontro (quadros em 601, `colr` em 709).
- Não validado: a LUT do Lab num Resolve real.

## Z: sabe o que cada plataforma faz e só busca no Drive quando pedem (28/10/2026)

- Caso real do titular na Revela: "Consigo deixar meu vídeo com a cor parecida do FVPRO+?" A Z buscou no Drive (o texto
  de sistema mandava usar o Drive "sem pedir licença sempre que a pessoa falar de arquivo, pasta, vídeo, referência"),
  achou o .zip do pacote e disse não saber se a Revela fazia isso.
- Agora: o Drive entra só quando a pessoa pede ou fala dele (meu Drive, minha pasta, um arquivo pelo nome); pergunta de
  como fazer vai para a plataforma atual. O texto de sistema traz o que cada uma das sete faz hoje
  (`apps/hub-web/lib/ia/plataformas.ts`, fixo, no cache), e para a Revela diz que pacote de LUTs não se aplica direto: o
  caminho é Clonar LUT com frames antes e depois, salvando em Meus looks.
- Teste novo `tests/integration/ia-plataformas.test.ts` (3/3): o guia cobre exatamente os produtos do catálogo, a Revela
  aponta Clonar LUT e Meus looks, e o texto de sistema tem a regra nova do Drive e o guia. Lint, formato, tipos verdes.
  `npm test` completo fica para o CI (sem Postgres local nesta sessão).
- Não validado: resposta real da Z com a chave em produção.

## Revela: abertura de película e transições no celular (27/10/2026)

- Vídeo do titular no iPhone: a abertura do ícone não agradou ("mais a ver com película"); trocar de aba deixava o
  painel novo borrado; pela gaveta a página e o dock pulavam.
- Abertura nova (`app/abertura.js` + CSS): sala escura com luz vermelha de segurança tremendo, tira de película em
  diagonal entrando como no projetor, sete quadros latentes revelando em sequência (cada um um recorte da luz da
  marca; o do meio é o quadro do ícone), vazamento de luz laranja atravessando, grão de filme, nome em branco e a
  sala acendendo para a ferramenta. Quadros conferidos com a animação parada a 0,1 / 0,45 / 0,8 / 1,1 / 1,35 / 1,7 /
  2,1 / 2,5 / 2,8 s.
- Troca de aba: o painel novo reentrava com a entrada lenta com desfoque (`.entra`, 0,8 s) a cada troca. Agora a
  entrada lenta fica para a primeira visita; a troca é um deslize curto (0,32 s) para o lado da aba.
- Página mais larga que a tela na Entrega (o deslize e a fileira de destinos passavam de 390 para 401–408 px): no
  iPhone isso alarga a tela inteira e tira o dock do lugar. `html, body { overflow-x: clip }`.
- Teste novo: pela gaveta até a Entrega em 390 px, a página fica em 390 e a entrada lenta não roda. `npm test` 102/102.
- Não validado: num iPhone de verdade.

## Revela: abertura do app (27/10/2026)

- Pedido do titular: animação ao abrir o app. `app/abertura.js` (script do `<head>` nas quatro ferramentas) cobre a tela
  antes do primeiro quadro; o ícone entra com mola, o "revelado" varre o quadro da película da direita com o fio de
  luz na frente e a tela some com o ícone crescendo. Só CSS, sem animação por quadro; toque pula; some sozinha em 4 s
  no pior caso.
- Só no app aberto do ícone (`display-mode: standalone`), uma vez por abertura (`sessionStorage`), nunca com reduzir
  movimento. `?abertura=1` força no navegador.
- Conferido em quadros a 0,25 / 0,7 / 0,95 / 1,3 / 1,7 / 2,3 s (Chromium, 390 px). Teste: sem abertura no navegador
  comum; com `?abertura=1` aparece, sai sozinha e a página fica utilizável. `npm test` 101/101.
- Não validado: num iPhone de verdade.

## Revela como app no iPhone (27/10/2026)

- Pedido do titular: a experiência do computador no celular, a partir do Compartilhar do Safari. O iOS não deixa site
  virar destino do Compartilhar; o caminho é **Adicionar à Tela de Início**, que fica no mesmo menu.
- `manifest.webmanifest` (standalone, abre em `/lut`, atalhos das quatro ferramentas), `apple-touch-icon` 180 e ícones
  192/512 (`scripts/icones-app.mjs`), metas de app do iOS e barra de status translúcida em todas as páginas; o topo, o
  menu, o início e o entrar respeitam a área da hora e da bateria. `theme-color` segue o tema (era escuro no claro).
- Menu: "Instalar o app" (folha com Compartilhar → Adicionar à Tela de Início no iPhone; pedido do Chrome no resto).
- Bug do menu: o ouvinte de troca de aba estava colado 4 vezes, três delas dentro das funções do botão do menu
  (cada abrir/recolher registrava mais um). Agora um só.
- Testes no Chromium: manifesto e tamanhos reais dos PNG, metas nas seis páginas, folha de instalar com o
  user-agent do iPhone, item escondido no computador, menu aberto e recolhido 4 vezes seguindo a aba.
  `products/finishing`: `npm test` 100/100.
- Não validado: num iPhone de verdade (ícone, barra de status, login pela conta Absolute ZRO dentro do app instalado).

## Revela no celular: .cube, tela do Converter, login e conversão (27/10/2026)

- `.cube` baixava como `.cube.txt` no iPhone: o Safari põe `.txt` em arquivo `text/plain`. Downloads de `.cube` e
  `.py` agora saem como `application/octet-stream` (teste confere que nenhum download usa `text/*`).
- Converter no celular: um nome de arquivo comprido alargava a grade da fila (trilha `auto` cresce até o texto
  inteiro), a página passava de 390 para 604 px, cortava à esquerda e a marca do dock caía entre duas abas. Fila e
  corpo do item com `minmax(0, 1fr)`; a marca também segue o dock por `ResizeObserver`.
- Login: a fileira "Uma conta para" ganhou AEON e Absolute ZRO.
- Velocidade: no caminho antigo o Mediabunny reduz 4K → 720p num canvas 2D, que no Safari tende a copiar o quadro
  para a CPU. Novo `app/escala-gpu.js` reduz em WebGL2 (mipmaps, rotação do celular, contain/fill) quando há GPU de
  verdade. No contêiner de teste (SwiftShader, sem GPU) o caminho novo é ~5× mais lento que o canvas (30 s × 6,5 s
  num 4K de 4 s), por isso só liga com placa de vídeo real. Teste no Chromium: vídeo 1080p girado 90° convertido para
  720p pela GPU e pelo canvas dá o mesmo quadro (diferença média 0,66 em 255; com a rotação trocada, 116).
  `products/finishing`: `npm test` 98/98.
- Não medido: tempo de conversão num iPhone real (aqui não há aparelho).

## Página inicial: faixa das ferramentas (26/10/2026)

- Cartões verticais (ícone em cima, nome numa linha, apoio em até duas linhas reservadas): os sete com a mesma altura
  e sem nome quebrado. Abaixo de 1100 px, quatro por linha com a segunda centralizada. Capturas em 1440 (claro e
  escuro), 1000 e 390 px; `npm run test:e2e` verde.

## Página inicial com dados do ecossistema (26/10/2026)

- Novas seções: **Em números** (contam ao aparecer; ferramentas, eventos e formatos vêm do catálogo e de
  `@zro/media-contracts`, nada digitado à mão), **Conheça de perto** (abas com a tela real de cada app num MacBook e
  iPhone, três fatos e o site; passa sozinha e pausa com mouse, foco ou fora da tela), **Do job à entrega** (o fluxo
  com os eventos reais que cada app manda para o HUB) e **Um app no computador** (o painel do app e o HUB no iPhone).
- Imagens novas: `produto-hub-*` (painel `/app` e `/inicio` de hoje), `produto-ai-edit-*` e `produto-finishing-*` (os
  sites no ar), por `scripts/marca/aparelhos/produtos.py`.
- Capturas em 1440 (claro e escuro) e 390 px; `npm run test:e2e` 21/21 (axe incluso).

## Downloads por ícones, NOSSOM no Mac e símbolo do fim da home (27/10/2026)

- `/baixar` e `/downloads`: só os ícones; o toque abre a parte de download do app (Mac, Windows, celular ou
  navegador, Terminal e primeira abertura) e o **Conheça mais** (página da plataforma, `site` em `lib/downloads.ts`).
  `#app-<id>` no endereço abre o app certo (links dos sites de cada ferramenta). O cartão do Absolute ZRO para
  computador não estoura mais: botões numa linha e o Terminal recolhido.
- Links conferidos com download real (GET com Range até o arquivo): SOBEDESCE 0.1.0 b1025, Synquei 1.0.0 b1027,
  Absolute ZRO 1.1.1 b13 (Mac e Windows); NOSSOM 0.2.2 (Mac Apple Silicon, Intel e Windows) depois do workflow
  `nossom-desktop.yml` corrigido (o passo de validação rodava antes do checkout) e disparado como prévia.
- NOSSOM no Mac: `xattr` em app já em Aplicativos falha no macOS novo sem Gerenciamento de Apps. Novo
  `products/nossom/public/instalar.sh` (curl, sem quarentena; escolhe Apple Silicon ou Intel; `hdiutil verify`; refaz
  a assinatura local se não conferir). `tests/instalar-mac.test.ts` 3/3; `npm test` do NOSSOM 76/76. Não validado
  num Mac de verdade.
- Símbolo do fim da página inicial: animava com a rolagem e ficava travado no meio quando a página acabava antes;
  agora desenha uma vez quando aparece (`components/home/aparece.tsx`).
- HUB: `npm test` 153/153; `npm run test:e2e` 21/21.
- Fotos dos aparelhos (`produto-*.webp`) sem fundo chapado (`scripts/marca/aparelhos/transparente.py`, máscara do
  molde): sem o retângulo preto atrás do notebook no tema escuro nem o branco no claro. Conferido em 1440 px.

## AEON: menu lateral que funciona (27/10/2026)

- Causa: a conta era `<a href="../entrar.html" target="_blank">` (`app/trilho.js`); no app de computador o
  `setWindowOpenHandler` (`desktop/main.cjs`) só entrega `http(s)` ao navegador e recusa o resto, então o clique morria; no
  navegador abria outra aba do entrar. "Seus universos" não fazia nada na própria lista (sem estado de selecionado) e
  "Salvar cópia" sem projeto voltava calado (`salvarAgora`).
- Agora: Projeto (Seus universos com `aria-current`, Novo projeto, Abrir projeto…, Salvar cópia desligado sem projeto
  e ⌘S avisando); embaixo "Apps Absolute ZRO" (uma linha; grade com os sete apps em popover) e o cartão da conta (menu
  com Conta Absolute ZRO e Sair por `POST /api/zro/sair`). Etapas seguem no dock.
- `test/tela.test.js` › "menu: cada item faz algo de verdade" (falha no código antigo): seletor de arquivo, projeto
  novo pelo menu, download da cópia, volta à lista, aba nova do SOBEDESCE, sair indo para entrar.html, e todo link de
  fora do menu em `https` (o caso que o Electron recusava). `npm test` 57/57 (1 pulado: Whisper, sem rede).
- Conferido no Electron 44 em tela virtual (Playwright `_electron`, conta falsa em `conta.json`): Novo projeto, diálogo
  de salvar, volta à lista, Revela e Conta Absolute ZRO no navegador do sistema, Sair apaga `conta.json` e vai para
  entrar.html. `--smoke` OK.

## Absolute ZRO para computador 1.3.0: o instalador do ecossistema em segundo plano (28/10/2026)

- Pedido do titular: um programa que roda como o SOBEDESCE e traz as atualizações dos apps. Bandeja/barra de menus
  com o símbolo flat (template no Mac), fechar a janela não encerra, abre com o computador (ligado na primeira vez,
  escondido), agenda que confere o catálogo do HUB 20 s depois de abrir e a cada 4 h e instala SOBEDESCE/Synquei com o
  app fechado ("atualiza ao fechar" e "Reiniciar e atualizar" com ele aberto), notificações curtas, tela de
  boas-vindas para escolher os apps. O catálogo agora é lido com os cookies do login (antes ia sem sessão), então o
  gate de lançamento vale por pessoa. As telas locais trocaram o antigo símbolo de feixe de luz (`simbolo.webp`) pelo
  símbolo flat oficial (`simbolo.svg`).
- `apps/hub-desktop`: `npm test` **60/60** (novos: `agenda.test.mjs` com relógio falso, `bandeja.test.mjs`,
  `inicio-sistema.test.mjs` e casos da central para baixar em segundo plano, reaproveitar o arquivo conferido,
  gerenciável e fechar sem forçar). `xvfb-run -a npx electron . --smoke --no-sandbox`: **SMOKE OK** (sem conexão,
  regras, bandeja 16×16, boas-vindas). Rodou 30 s em modo de desenvolvimento sem erro.
- `products/sobedesce`: `npm run test:fast` **735/735** (3 pulados de sempre), com 2 novos em `test/version.test.js`
  (instalado pela central não pergunta ao site nem baixa; arquivo da central vale até 14 dias).
- `products/synquei`: `npm test` **118/118**, com 2 novos em `tests/atualizador.test.mjs`.
- Raiz: `lint`, `format:check` e `typecheck` ok; `npm test` **205/205** (página Downloads: `Reiniciar e atualizar` e
  "Atualiza ao fechar" com o app 1.3, sem mudar nada para versões antigas).
- Não validado: build do Actions e Release (pedem autorização do titular); Mac e Windows de verdade (ícone na barra de
  menus, item de login e início escondido, notificações, `quit app`/`taskkill` com SOBEDESCE e Synquei abertos).

## Absolute ZRO para computador 1.2.0: "Atualizar" com um clique (27/10/2026)

- Como no SOBEDESCE: o aviso de versão nova tem **Atualizar**. O app baixa o instalador de `/baixar/hub/<sistema>?build=N`,
  confere o SHA-256 publicado em `/baixar/hub/versao`, prepara a troca (Mac: `hdiutil` + `ditto` ao lado do app +
  `xattr -cr`; Windows: NSIS `/S`), fecha e abre já na versão nova (`desktop/atualizador.cjs`). Progresso na barra do
  ícone (Dock/barra de tarefas), sem diálogo piscando. Se não dá para trocar (aberto do disco de instalação, sem
  permissão, troca anterior que falhou), o botão vira **Baixar**.
- `test/atualizador.test.mjs` (Mac e Windows com comandos falsos, SHA-256 que não bate, build novo no meio, marca de
  falha) e o aviso entregando o build certo: `npm test` 35/35; `--smoke` ok no Electron 44 (Linux).
- Quem está na 1.1.1 atualiza para a 1.2.0 pelo comando do Terminal uma última vez; dali em diante, pelo botão.
- Não validado: a troca num Mac e num Windows de verdade.

## Synquei: aviso de download que não pisca (27/10/2026)

- Causa: `desenhar()` em `products/synquei/app/js/atualizacao.js` trocava o `innerHTML` do cartão a cada evento de
  progresso (até 4 por segundo, `desktop/atualizador.cjs`); o `.atu` nascia de novo e a entrada `rise` (`app.css`)
  recomeçava do transparente, então o aviso piscava. A barra também nunca deslizava (nascia já na largura nova).
- Agora `aplicarCartao()` compara a forma do cartão sem os números: se só o progresso mudou (baixando, conferindo,
  preparando), troca no lugar o texto, a largura e o `aria-valuenow`; o cartão só é refeito quando muda de verdade
  (pronto, erro, Depois). Ajustes não se redesenha mais a cada pedaço baixado. Reduzir movimento segue pela regra
  global. `sw.js` foi para `synquei-v15`.
- `tests/aviso-atualizacao.test.mjs` (3 casos): 40 eventos de progresso com uma troca de HTML só, conferindo/preparando
  no mesmo cartão, barra indeterminada sem tamanho. `npm test` em `products/synquei`: 71 ok, 4 pulados, 0 falhas.
- Chromium (Playwright) com o app servido e o atualizador falso, 46 eventos: antes 46 cartões recriados, 46 entradas
  reiniciadas e opacidade ~0,3 60 ms depois de cada evento; depois 0, 0 e opacidade 1.

## Ciclo do O sem a pílula atrás e login com a paisagem da marca (27/10/2026)

- `/ciclo`: o seletor Mensal/Anual de Planos usava a classe `.cycle`, a mesma do Ciclo do O, e desenhava uma pílula
  enorme atrás do anel. Virou `.cobranca`.
- Telas de conta (`(auth)/layout.tsx`): a paisagem da marca no fundo, com véu e zoom lento (parado com "reduzir
  movimento"); frase oficial "O futuro começa do zero."; o login cita todas as ferramentas.
- `npm run test:e2e` 21/21. Capturas de `/entrar` (claro, escuro, 390 px) e `/ciclo`.

## AEON: site sem corte seco, fecho inteiro e "Atualizar" no app (27/10/2026)

- Site (`products/ai-edit/index.html`, `site/site.css`, `site/home.js`): a abertura escurece até o preto e a salina vira
  uma passagem sem texto que nasce do preto e volta para ele (máscara em cima e embaixo), no lugar das duas fotos
  coladas num corte seco. Saiu "O espaço entre os instantes." (subtítulo da abertura, título da salina e o
  `og:description`, que agora diz o que o AEON faz). O fecho usa a estrela de palco (`simbolo({ brilho, margem })`,
  pontas e fios somem aos poucos, com respiro) e segue o tema; antes os fios terminavam num corte reto e pareciam
  cortados. De quebra: os cartões de Baixar não alargam mais a página no celular (`minmax(0, 1fr)`; o botão Copiar
  ficava fora da tela) e o menu fechado não mancha mais a borda esquerda no tema claro (sombra fora da vista).
  Conferido no Chromium em 1440 e 390 px, escuro e claro, com "reduzir movimento".
- App de desktop (`desktop/atualizador.cjs`, `desktop/main.cjs`, `desktop/preload.cjs`, `app/atualizacao.js`), no
  molde do SOBEDESCE: só no app empacotado com build do CI (`desktop/build-info.json`; build 0 não pergunta nada),
  confere o `versao.json` do Release `ai-edit-app-desktop` (o mesmo do `instalar.sh`) 10 s depois de abrir e a cada 4 h.
  Build maior = pílula "Versão nova · Atualizar" na barra. Atualizar baixa o instalador do Release com progresso
  medido (barra fina que só avança), confere o SHA-256, prepara a troca (Mac: `hdiutil` + `ditto` ao lado + `xattr -cr`;
  Windows: NSIS `/S`), grava o projeto aberto (recusa com exportação andando), entrega o script e fecha; o script
  espera o app sair, troca e abre de novo. Falhou: o antigo volta, fica `atualizacao-falhou.json` e a próxima
  abertura oferece o Baixar (site `/#baixar`). Fora de Aplicativos, sem permissão ou sem SHA-256: só o Baixar.
- `test/atualizador.test.js` (17): Release igual ao do instalador, desenvolvimento sem rede, download com progresso,
  incompleto e parado, fluxo do Mac com peças falsas, SHA-256 diferente (nada trocado, temporários apagados), sem
  hash, sem permissão, AppTranslocation, `/Volumes`, marca de troca que falhou, entrega recusada, Windows (BOM,
  `/S`), progresso limitado e o script do Mac rodando de verdade (troca e abre; se falhar, volta o antigo e grava a
  marca). `test/tela.test.js` › "versão nova": a pílula com uma ponte falsa, Baixando 42%, barra sem voltar, Tentar
  de novo e Depois. `npm test` 76/76; `xvfb-run -a npx electron . --smoke` SMOKE OK.
- Não conferido: a troca num Mac e num Windows de verdade (precisa de um Release publicado com build maior que o do
  app instalado; publicar é decisão do titular).

## OG com a paisagem da home e o app no celular igual ao do computador (27/10/2026)

- OG (`scripts/marca/og-paisagem.html` → `app/opengraph-image.jpg` e `twitter-image.jpg`): a paisagem do topo da
  página inicial com "O futuro começa do zero.".
- App da Tela de Início (Safari › Compartilhar › Adicionar à Tela de Início): abre no painel `/app` (manifest), com a
  abertura da marca (`components/abertura-app.tsx`, só em `display-mode: standalone`, uma vez por sessão) e o login
  do app. No celular a barra lateral vira barra de abas (Apps, Projetos, Planos, Conta), a conta fica no avatar do
  topo e as ferramentas numa lista compacta com "Abrir". No Safari sem instalar, o topo ensina a pôr na Tela de Início.
- Conferido no Chromium com o iPhone 14 emulado (claro e escuro); a abertura, aplicando as regras do modo standalone
  na página (o Chromium não emula `display-mode`). `npm run test:e2e` 21/21. Não validado: num iPhone de verdade.
- Ícone do iPhone (`app/apple-icon.png`): placa grafite com o anel branco (`icones.py`, tema escuro). O ícone de Tela
  de Início não tem versão escura e o branco ficava "gravado" no modo Escuro do iPhone. Computador segue branco.

## Perfil único: a conta Absolute ZRO vale para todas as plataformas (27/10/2026)

- HUB: o login único passa a entregar `picture` (foto num endereço público que muda a cada foto nova,
  `/api/v1/foto/<uuid>`), `updated_at` e `zro_conta` no escopo `profile`. Migration 0015 (aplicada no banco novo).
  Contrato para as plataformas: `docs/integration-contracts/perfil-unico.md`.
- `tests/integration/oidc.test.ts` › "perfil único (0015)": nome e foto vêm do login, foto nova muda o endereço e o
  antigo some. `npm test` 154/154.

## Perfil único no Synquei e no TPeasy (27/10/2026)

- O login pede também `offline_access`; o refresh e o access token ficam **cifrados** (AES-256-GCM) num cookie só de
  `/api/zro` (`sq_hub`, `tp_zro_hub`). A cada abertura (no máximo uma vez por minuto) o `/api/zro/eu` relê nome,
  e-mail, foto, organização e produtos em `/oauth/userinfo` (troca o refresh token, que roda, quando o access venceu).
  HUB fora do ar: vale a última cópia. Acesso removido no Perfil: a sessão acaba. Sair revoga o refresh token.
- Telas: foto da conta no avatar (sem foto, as iniciais) e **Editar na conta Absolute ZRO** (`zro_conta`, aba nova).
  No TPeasy, o "Nome" próprio some para quem entrou com a Absolute ZRO. Nenhum dos dois tem CSP; nada a liberar.
- Synquei: `tests/zro.test.mjs` › "perfil único" (9) e `tests/conta-ui.test.mjs` (2 novos); `npm test` 82 ok, 0 falha.
  TPeasy: `tests/zro.test.mjs` › "perfil único" (8) e `tests/conta-ui.test.mjs` (4); `node --test tests/*.test.mjs`
  35/35. A Absolute ZRO falsa de cada um ganhou refresh que roda, `userinfo`, `revoke`, `picture` e `updated_at`.
- Não validado: contra o HUB de verdade (precisa de deploy e das variáveis já cadastradas). Sessões abertas antes
  disto seguem com a cópia do login até a próxima entrada.
- AEON e Revela (`products/ai-edit`, `products/finishing`): o login pede também `offline_access`. A sessão
  (`ae_conta`/`rv_conta`) guarda a cópia do perfil (nome, e-mail, foto, onde editar); os tokens vão num cookie
  cifrado (AES-256-GCM) só de `/api/zro`. Cada `/api/zro/eu` relê o perfil no `/oauth/userinfo` (renova o access
  token pelo refresh token se venceu; prazo de 3 s, senão vale a cópia). Refresh recusado: esquece os tokens e fica a
  cópia. Sair revoga o refresh token.
- AEON de computador (`desktop/conta.cjs`): relê o perfil a cada abertura; o refresh token só vai ao disco cifrado
  pelo cofre do sistema (`safeStorage`: Keychain/DPAPI). Sem cofre (Linux sem chaveiro), fica só na memória.
- Telas: a foto da conta no cartão e no menu da conta do AEON, no topo e na entrada da Revela e do site do AEON (sem
  foto ou foto que não carrega: iniciais). "Editar na conta Absolute ZRO" aponta para `zro_conta` e abre fora do app.
  CSP com `img-src https://absolutezro.com` (`vercel.json` dos dois e `desktop/cabecalhos.json`).
- Testes: AEON `npm test` 87/87 (login web e de computador contra a Absolute ZRO falsa com `picture`, `updated_at`,
  `userinfo`, refresh que gira e revogação; tela com a foto sob a CSP real); Revela `npm test` 109/109 com o mesmo teste de
  login e a tela da foto; `xvfb-run -a npx electron . --smoke` SMOKE OK. Não validado: contra o absolutezro.com de
  verdade e o cofre do sistema num Mac ou Windows de verdade.

## Assinatura e consumo, menu do celular (27/10/2026)

- `/assinatura` refeita: anel animado com os créditos de IA e GPU que restam (verde, âmbar acima de 75%, vermelho
  acima de 90%), contagem "Renova em…" até o fim do mês (UTC, atualiza a cada 30 s), cartão do plano com a contagem
  até `current_period_end`, barras das outras cotas, gráfico de uso por dia (toque ou passe o mouse) e últimos usos.
  Tudo vem do banco (`quota_usage`, limites dos planos, eventos de uso); nada é estimado. Não existe limite por sessão
  na plataforma: só o mês e o plano. Motion respeita "reduzir movimento".
- Menu do celular: o fundo do painel aberto passou a ser sólido (o vidro aninhado vazava o conteúdo no Safari).
- Validado: lint, format, typecheck, `npm test` 154/154, `npm run test:e2e` 21/21, telas claro/escuro/celular com
  dados de teste. Não validado: com consumo real em produção.

## Synquei de computador: conta Absolute ZRO (27/10/2026)

- `products/synquei/desktop/conta.cjs` (porta do AEON): cliente público `synquei-desktop`, login de app nativo (RFC 8252) no navegador do sistema com volta para `http://127.0.0.1:<porta>/callback`, PKCE S256, state, nonce e o
  `id_token` conferido pela JWKS. O protocolo do app (`desktop/main.cjs`) responde `/api/zro/eu`, `/entrar` e `/sair`
  no mesmo formato do site, então `app/js/conta.js` é o mesmo nos dois (no desktop liga quando a ponte tem `conta`).
- Perfil único: cada `/api/zro/eu` relê nome, foto, organização e `zro_products` no `/oauth/userinfo` (3 s, senão vale a
  cópia). O refresh token só vai ao disco cifrado pelo `safeStorage`; access token só na memória; sair revoga.
  `zro_products` só decide o aviso "sem acesso"; o plano continua Grátis para todos, como no site.
- Testes: `tests/conta-desktop.test.mjs` (7) contra a Absolute ZRO falsa, que ganhou cliente público e `vencer()`;
  `npm test` sem falhas; `xvfb-run -a npx electron . --smoke` SMOKE OK, agora conferindo "Entrar com Absolute ZRO" na
  barra lateral. Telas conferidas no Electron (logado com iniciais e sem sessão).
- Não validado: login contra o absolutezro.com de verdade e o cofre do sistema num Mac ou Windows de verdade.

## Entrar e criar conta como conversa (27/10/2026)

- `components/conversa-conta.tsx`: `/entrar` (e-mail → senha), `/criar-conta` (e-mail → nome → senha) e `/app/entrar`
  (mesma conversa, volta para `/app`). O orbe é o Z (ver "IA do ecossistema: o Z") com `data-estado` (absolute-zro,
  ouvindo, conferindo, pronto) e rótulo em pílula `aria-live`; no fim, ✓ em traço fino, "Conectado." e barra fina antes
  de abrir o destino. "Reduzir movimento" deixa tudo parado.
- A conversa só avança no cliente; nenhum e-mail é consultado antes do envio. `loginAction`/`signupAction` seguem
  redirecionando; com o campo `conversa=1` (só com JavaScript) devolvem o destino para o cliente mostrar "pronto". As
  páginas não redirecionam quem acabou de entrar quando estão respondendo à própria Server Action (`respondendoAcao`).
- Sem JavaScript todos os campos aparecem e o form posta direto; com JavaScript os passos fora da vez ficam no form
  (gerenciador de senhas: `email`, `name`, `current-password`, `new-password`), escondidos e `inert`.
- Validado: lint, format, typecheck, `npm test`, build, `npm run test:e2e` (conversa de entrar com erro e foco, sem
  JavaScript, cadastro/SSO pelos passos, axe em `/entrar` e `/criar-conta` nos dois temas). Telas conferidas em claro e
  escuro, 1280 e 390. Não validado: gerenciador de senhas real (Chrome/1Password/iCloud) e Safari antigo sem
  `@media (scripting)`.

## Balões de pendência no Synquei, TPeasy e Carro do Freela (27/10/2026)

- Mesmo desenho do SOBEDESCE e do HUB: pílula com número em negrito tabular, 99+ acima de 99, `aria-label`
  "N pendências", o que espera no `title` do item, entrada curta só em CSS (parada com reduzir movimento) e ponto com
  número no canto do ícone no menu recolhido e na barra do celular. Atualiza junto com o estado de cada app.
- Regras puras: `products/synquei/app/js/pendencias.js`, `products/tpeasy/app/js/pendencias.js` e
  `contarPendencias` em `products/carro-do-freela/src/template.html`. Synquei e TPeasy subiram o cache do service
  worker (v18 e v15); Carro subiu a `VERSAO` (27/out · 2).
- Testes: Synquei `npm test` sem falhas (+10 em `tests/pendencias.test.mjs`), TPeasy `node --test tests/*.test.mjs`
  41/41 (+6), Carro `node test/run.js` 88/88 (suíte nova `baloes`, 24 asserções: conta pura, ao vivo na lateral,
  recolhida, celular e gaveta). `node scripts/scan-secrets.mjs` sem segredos. Telas claro/escuro, computador e
  celular conferidas no Playwright.
- Não validado: o Synquei de computador no Electron (a barra é a mesma do site; balões de Organizar e Ajustes
  conferidos simulando o estado do desktop no navegador) e a falha de sincronização na nuvem do TPeasy (nuvem
  desligada no app).

## IA do ecossistema: o Z (27/10/2026)

- Uma IA para todas as plataformas (o "Z"): conversas guardadas por plataforma (`zro.ia_conversas`/`zro.ia_mensagens`,
  migrações 0016 e 0017, RLS por pessoa), 1 crédito `zro.ai_credits` por resposta (`concluirTurno`, chave
  `ia:<pergunta>`), API `/api/v1/ia` (estado, conversas, mensagens em NDJSON; CORS para quem chega com Bearer e escopo
  `zro.ia`), painel no HUB (`/ia` e `/app`) com a gaveta "Conversas" agrupada por plataforma e `<zro-ia>`
  (`public/ia/v1/zro-ia.js`) para as plataformas. Testes: `tests/integration/ia.test.ts` e `pendencias.test.ts`.
- Visual aprovado pelo titular em 27/10/2026: anel e estrela cromados em peças separadas (`public/ia/z/*.webp`, recorte
  alfa, servem em qualquer fundo) movidos por código (`apps/hub-web/lib/ia/z/motor.ts`): volta de 3,2 s, 0,75 de giro
  por volta, ritmo suave, horário, pausa de 1 s; estrela sempre por cima e centrada no tubo; anel girando devagar no
  próprio eixo (loop a cada 4 ciclos); conjunto flutuando; brilho e halo crescem com o giro e os raios longos só no
  auge. Em volta, o ar (`lib/ia/z/ar.ts`): rastro que contorna o anel e correntes em espiral, leves em repouso e mais
  fortes ouvindo, pensando e respondendo. Um laço de quadros só, fora do React; pausa fora da tela e em aba oculta;
  "reduzir movimento" para tudo. A mesma conta está copiada em `zro-ia.js` (as plataformas não importam o HUB).
- `/ia/*` responde com `Access-Control-Allow-Origin: *` (script módulo e máscara CSS de outra origem precisam de CORS).
- Conferido no Playwright: `/ia` claro, escuro e celular (início, pensando com o Z pequeno na barra, resposta),
  `/entrar` claro e escuro e `<zro-ia>` servido de outra origem sobre o azul do NOSSOM, sem erro de página.
- Não validado: migrações 0016/0017 no banco de produção e a IA com a chave real (só com a API falsa local); não
  publicado em produção.

## O Z nas páginas iniciais das plataformas (27/10/2026)

- Seção curta na home de AEON, Carro do Freela, Revela, NOSSOM, SOBEDESCE, Synquei e TPeasy: anel e estrela do Z
  (cópias locais de `apps/hub-web/public/ia/z/`, porque absolutezro.com/ia/z ainda responde 404 e AEON e Revela usam
  COEP `require-corp`), selo "Chegando ao <app>", uma linha do que ele vai fazer ali, quatro fichas (mesma conta,
  conversas reunidas, você confere antes, 1 crédito por resposta) e **Conhecer o Z** para absolutezro.com/ia. Não diz
  que o Z já funciona dentro do app. A estrela respira só em CSS e para com "reduzir movimento".
- Synquei e TPeasy: cache do service worker v18 e v15, com as duas imagens. Carro do Freela: VERSAO `27/out · 2`.
- Testes: AEON `npm test` 87/87; Revela 109/109; Synquei 89 ok, 0 falhas (4 pulados); TPeasy 35/35; NOSSOM
  format:check, typecheck, `npm test` 76/76, build e e2e da home (liquid-site, homepage-demo, design-review,
  install-navigation) 15/15; SOBEDESCE web lint, typecheck, `npm test` 231/231 e build; Carro do Freela 87 de 87
  suítes (4 de novo sozinhas, como o arnês prevê) e `test:api` 27/27; `node scripts/scan-secrets.mjs` sem segredos.
- Telas conferidas no Playwright (Chromium), computador 1440 e celular 390, claro e escuro onde há, sem rolagem
  lateral. Não validado: o link absolutezro.com/ia no ar (depende do deploy do HUB).

## A Z no painel inicial do Synquei e do TPeasy (27/10/2026)

- Synquei (site/PWA e app de computador) e TPeasy (site/PWA; não tem app de computador): o `<zro-ia>` de
  `absolutezro.com/ia/v1/zro-ia.js` é a primeira coisa do Início (Synquei) e de Roteiros (TPeasy), com apoio e quatro
  sugestões do contexto. O resto da tela continua logo abaixo; no Synquei a Z fica fora da tela que redesenha, então a
  conversa não se perde, e aparece só no Início. Tema: Synquei segue Ajustes › Tema (`data-theme`), TPeasy o aparelho.
- Como o token chega à Z: nunca pela página. `api/zro/ia.js` (Synquei) e `api/zro/ia.mjs` (TPeasy) leem o cofre
  cifrado da sessão (`sq_hub`/`tp_zro_hub`, só em `/api/zro`), renovam o access token se venceu e encaminham para
  `/api/v1/ia/*` com `Authorization: Bearer`, repassando o NDJSON em pedaços. Só `estado`, `conversas`,
  `conversas/<id>` e `mensagens`; POST/DELETE de outra origem é recusado. `vercel.json` reescreve
  `/api/zro/ia/:caminho*` para `?c=` (TPeasy ganhou `vercel.json` só com isso). No computador, `desktop/conta.cjs`
  (`repassarIa`) faz o mesmo no processo principal; a renovação do refresh token entra numa fila, para o perfil e a Z
  não gastarem o mesmo token (a Absolute ZRO derrubaria a família). No site a Z só monta depois do `/api/zro/eu`.
- `zro.ia` entra no scope pedido (web e desktop). Sem sessão, ou login de antes da Z (401 mesmo depois de renovar): o
  repasse responde 401 com `reconectar`, a Z dispara `zro-ia:sem-login` e o app mostra "Entrar com Absolute ZRO" ou
  "Entrar de novo para usar a Z" (no computador, pelo login no navegador do sistema).
- Service worker: `synquei-v20` e `tpeasy-v17` com `app/js/z.js`; `/api/` e outras origens não passam pelo cache.
  Nenhum dos dois tem CSP: nada a liberar.
- Homes: "Já no Synquei"/"Já no TPeasy", **Conversar com a Z** (para o painel) e **Conhecer a Z**; texto no feminino.
- Testes: Synquei `npm test` sem falhas (novos: `tests/zro-ia.test.mjs` com 13 casos e dois em
  `tests/conta-desktop.test.mjs`: Bearer encaminhado sem cookie do site, 401 sem sessão, token fora da resposta e do
  disco, NDJSON em pedaços, renovação, sem `zro.ia`, caminhos e origem recusados, perfil e Z ao mesmo tempo); TPeasy
  `node --test tests/*.test.mjs` 49/49 (8 novos); `xvfb-run -a electron --no-sandbox . --smoke` SMOKE OK; e
  `node scripts/scan-secrets.mjs` sem segredos.
- Telas no Playwright com a API simulada (`page.route`): 1440 e 390, claro e escuro, sem conta, "entrar de novo" e uma
  conversa; no Electron, o Início carregou o script real de absolutezro.com e pediu para entrar (sem conta).
- Não validado: conversa de verdade com conta real (site e computador) e se o cliente `synquei-desktop` no banco tem
  `product_id = synquei` e `zro.ia` (cadastrado pelo console; clientes com produto ganham `zro.ia` no cadastro e pela
  migração 0016). O texto interno do painel ("Pergunte ao Z…") vem do `<zro-ia>` do HUB.

## A Z numa aba só dela no Synquei e no TPeasy (27/10/2026)

- Pedido do titular: a Z ganha aba própria, a primeira e a tela de entrada. Synquei (site/PWA e computador): item **Z**
  (anel fino) no topo da barra lateral e na barra de abas do celular (6 colunas); rota `#/z`, padrão para endereço vazio
  ou desconhecido. O `#zPainel` continua fora de `#view` (a conversa não se perde ao trocar de aba) e só aparece em
  `#/z`, ocupando a altura da janela. Atalhos: teclas 1–6 (Z, Início, Mídia, Sincronizar, Linha, Exportar) e o menu Ir
  do computador renumerado (⌘1 Z … ⌘6 Exportar, ⌘7 Projetos, ⌘8 Organizar); digitar no campo da Z não troca de aba. A
  lista da barra lateral rola em janela baixa. TPeasy: aba **Z** antes de Roteiros (4 colunas); o app abre na Z (um
  link com `#roteiros`, `#tp` ou `#ajustes` ainda abre a aba dele).
- O Início do Synquei voltou a ser o de antes (com "Bom dia"); Roteiros do TPeasy também, sem a Z em cima. Balões de
  pendência inalterados. Sem conta e "Entrar de novo" ficam dentro da aba; offline ou sem as funções da conta, a aba diz
  "A Z precisa de internet." com Tentar de novo e o caminho para Início/Roteiros. "Conversar com a Z" das homes leva a
  `/app/#/z` e `/app/#z`.
- Service worker `synquei-v21` e `tpeasy-v18`. Testes: Synquei `npm test` sem falhas (novo caso da aba no
  `tests/zro-ia.test.mjs`); TPeasy `node --test tests/*.test.mjs` 50/50 (novo caso da aba); smoke do Electron confere
  que o app abre na Z. Telas no Playwright com a conta e a Z simuladas: 1440 e 390, claro e escuro, sem conta, e o
  Início/Roteiros de volta.

## A Z no painel inicial do AEON e da Revela (27/10/2026)

- AEON: aba **Z** primeira no dock e página inicial do app (`app/z.js`), no site, no celular e no app de computador;
  o editor segue a um toque (⌘1 Z, ⌘2–5 Mídia a Entrega). Site: `<zro-ia>` de absolutezro.com (CSP `script-src` com
  absolutezro.com); app de computador: cópia em `vendor/ia` (`npm run vendor`), sem código de fora na janela com a
  ponte. Revela: `inicio.html` com a Z, aba Z no dock, item no menu, `start_url` `/inicio` e "Abrir a Revela" no painel.
- Token: a página fala só com `/api/zro/ia/*`. Site: repasse da Vercel (`api/_ia.js`, mesmo arquivo nos dois) com o
  access token do cookie cifrado, renovado pelo refresh token quando vence; resposta NDJSON passada aos poucos; só os
  caminhos e métodos do contrato; mudança só da própria origem e com JSON; sem sessão ou refresh recusado = 401 (o
  painel mostra "Entrar de novo"/"Entrar com Absolute ZRO"). Desktop: `desktop/main.cjs › repassarIa` com o token de
  `conta.cjs › tokenDeAcesso` (só no processo principal; um refresh por vez). O login pede `zro.ia`; se a Absolute ZRO
  devolver `invalid_scope`, entra de novo sem ele (web e desktop) e a Z fica em 401.
- Home: seção da Z como "Agora no AEON"/"Agora na Revela", com **Conversar com a Z** (painel) e **Conhecer a Z**.
- Testes: AEON `npm test` 102/102 (repasse em `test/ia.test.js`: Bearer, sem cookie para fora, NDJSON em pedaços,
  renovação, 401 sem sessão/token adulterado/sem escopo, outra origem, caminho e método fora do contrato, sem token na
  resposta, volta sem `zro.ia`; `conta-desktop`: token só no processo, refresh único, escopo recusado; telas com a CSP de
  produção e a Z simulada); `xvfb-run -a npx electron . --smoke` SMOKE OK. Revela `npm test` 124/124 (o mesmo repasse,
  painel com a CSP de produção, celular sem conta, seção da home). `node scripts/scan-secrets.mjs` sem segredos.
- Telas no Playwright (computador 1440 e celular 390, claro e escuro, conversa, gaveta Conversas, sem escopo).
- Não validado: produção (nada publicado), conta e IA reais, streaming pela Vercel, o repasse do app de computador
  contra a Absolute ZRO de verdade (só o smoke, que responde 401 à Z) e se `aeon-web`/`aeon-desktop` têm `product_id`
  (a 0016 só dá `zro.ia` a clientes com produto). Os textos dentro do `<zro-ia>` ("Pergunte ao Z…") vêm do HUB.

## A Z como painel inicial: SOBEDESCE e Carro do Freela (27/10/2026)

- SOBEDESCE: login pede `offline_access zro.ia` (sem o escopo, `invalid_scope` refaz o pedido sem ele); os tokens ficam
  cifrados na conta (`contas_zro.ia`, migração 0014) e `/api/zro/ia/*` repassa com o Bearer, renovando com a linha
  travada. Painel no topo de `/conta`, do Início do `/app/` (cache v62, 2.8.47) e do Início do app de computador
  (motor: `/api/ia/*` → site com o Bearer do dispositivo). CSP: script da absolutezro.com no `/app/` e no motor.
- Carro do Freela: login pede `zro.ia`; `/api/zro/ia/*` (função `ia`, streaming) usa o mesmo `cdf_hub`. Painel no topo
  do Feed (fora da `.wrap` que anima), só no domínio com conta liberada. CSP: script e imagens da absolutezro.com.
  VERSAO `27/out · 4`. Home dos dois: "Agora no <app>", **Conversar com a Z** e **Conhecer a Z**.
- Testes: SOBEDESCE web lint, typecheck, `npm test` (novo `zro-ia.test.mts`: Bearer encaminhado, streaming, sem sessão,
  origem, renovação sem derrubar a família, reconectar) e build; motor `test:fast` (novo `ia-z.test.js`). Carro
  `test:api` 33/33 (6 novos da Z), `conta-zro` com a seção 11 (painel, conversa, reconectar) e `node test/run.js` 88 de 88 (doca e sem-zoom de novo sozinhas).
- Telas (Playwright, 1440 e 390, claro e escuro, API simulada pela Absolute ZRO falsa, script do painel servido do
  repositório). Não validado: com conta e chave reais, e o app de computador dentro do Electron.

## A Z com aba própria: SOBEDESCE e Carro do Freela (27/10/2026)

- SOBEDESCE: aba **Z** primeiro e tela de entrada em todo lugar. Site: `/z` com as abas Z · Conta (controle segmentado);
  quem entra sem pedir página cai em `/z` (`destinoDeEntrada`; conta nova segue em `/conta?zro=ok`, celular em `/app/`);
  sem login, "Entrar com Absolute ZRO" dentro da aba; `/conta` voltou com o "Olá". App do celular: aba Z antes de Início,
  sempre (sem conta: "Entrar"; sem Drive: as outras abas mostram a tela da conta); cache v63, 2.8.48. App de computador:
  rota `#/z` padrão e primeiro item do menu; Início voltou com a saudação. Home: "Conversar com a Z" leva a `/z`.
- Carro do Freela: `#v-z`, só no domínio; primeiro item da lateral e, no celular, botão em destaque à esquerda do topo
  (a barra de baixo não comporta: 4 itens de um lado ficariam com ~40px a 390). Quem entra, termina o cadastro ou abre
  o app já dentro cai na Z; "Entrar" e "Reconectar" dentro da aba. Feed voltou a ser só o Feed. VERSAO `27/out · 5`.
- Testes: SOBEDESCE web lint, typecheck, `npm test` 244/244 (novo: entrar sem volta cai em `/z`), build; motor
  `test:fast` 726/726. Carro `test:api` 33/33, `node test/run.js` 88 de 88 (sem-zoom de novo sozinha, verde) e, depois
  do ícone final, conta-zro (74), home-clara, menu-recolhivel, mapa, baloes, doca, versoes, sem-zoom, seguranca,
  identidade e colisao sozinhas, todas verdes.
- Telas (Playwright, 1440 e 390, claro e escuro, Absolute ZRO falsa, script do painel servido do repositório; 320 no
  celular do SOBEDESCE e 360 no Carro sem rolagem lateral). Não validado: com conta e chave reais, e dentro do Electron.

## A Z no Google Drive, pelo SOBEDESCE (27/10/2026)

- HUB: ferramentas `buscar_no_drive`, `listar_pasta_do_drive`, `procurar_versao_no_drive` (só leem) e
  `pedir_ao_computador` (só com `confirmado_pela_pessoa` e um "sim" claro conferido no HUB, `confirmacaoClara`).
  Pedido ao SOBEDESCE com `assinarPedidoDeApp` (JWT `zro-pedido+jwt`, 60 s, `jti`, `zro_pedido` = ação). Painel mostra
  "Procurando no seu Drive…" (`rotulo` no evento `lendo`).
- SOBEDESCE: `/api/zro/drive/{buscar,pasta,versao,computador}` conferem o JWT pela JWKS (cache), `iss`, `aud`, vida,
  ação e uso único; conta pelo `contas_zro`; limite de 30 por pessoa em 10 min. O pedido ao computador é o mesmo
  "Baixar como…" do celular (`pedidos_proxy` tipo `formato`).
- Testes: raiz `npm test` 173/173 (novo `ia-drive.test.ts`: JWT na JWKS, aud, vida e typ; ferramenta contra
  SOBEDESCE falso; confirmação), lint, format, typecheck e build ok. SOBEDESCE web: lint, typecheck, `npm test`
  262/262 (novo `zro-drive.test.mts`: JWT ausente, vencido, de outro público, emissor, assinatura, ação ou
  reapresentado; sem vínculo, sem Drive, sem acesso; `q` escapada; só metadados; pasta por nome, id e ordem; versão
  pronta; pedido ao computador com e sem computador; limite) e build ok. `scan-secrets` limpo.
- Não validado: Drive e conta reais (busca `fullText` e `webContentLink` do Google de verdade), o computador real
  convertendo um arquivo fora de coleção, e `npm run test:e2e` (nenhum E2E cobre a Z).

### Abrir a pasta no SOBEDESCE (28/10/2026)

- SOBEDESCE: cada arquivo e pasta das rotas da Z traz `abrir_no_sobedesce` (`<site>/app/#drive/<id>`, a pasta dele
  ou a própria). App do celular 2.8.49 (service worker v64): `/app/#drive/<id>` abre a aba Drive na pasta, com a
  trilha pelos pais (`lib/drive-link.js`), de fora e com o app aberto; sem acesso, aviso e raiz.
- HUB: as ferramentas repassam o link (só o formato exato, na origem do SOBEDESCE), uma vez por pasta na listagem; o
  prompt pede botões em markdown (`[Abrir]`, `[Baixar]`, `[Abrir a pasta no SOBEDESCE]`) e nada de endereço cru.
- Testes: SOBEDESCE web lint, typecheck, `npm test` 263/263 e build; motor `test:fast` 731 ok, 3 pulados (novo `drive-link.test.js`,
  versão do app). Raiz lint, format, typecheck, `npm test` 174/174 (Postgres local) e build. Tela Playwright em
  390 px com Google falso: link de fora abre "Meu Drive › Projetos 2026 › Clipe Verão"; `hashchange` com o app
  aberto; pasta sem acesso mostra o aviso e fica na raiz; voltar sobe até a raiz. Não validado: Drive real.

### Abrir e Baixar pelo SOBEDESCE (28/10/2026)

- Pedido do titular: cada arquivo que a Z mostra tem exatamente dois botões, os dois pelo SOBEDESCE, nenhum link do
  site do Google Drive; pasta só Abrir.
- SOBEDESCE: as rotas da Z devolvem por arquivo `abrir_no_sobedesce` (`<site>/app/#arquivo/<id>`) e
  `baixar_pelo_sobedesce` (`<site>/app/#baixar/<id>`), por pasta só `abrir_no_sobedesce` (`#drive/<id>`);
  `webViewLink` e `webContentLink` saíram da resposta e do pedido ao Google. App do celular 2.8.50 (service worker
  v65, `lib/drive-link.js`: `linkDoHash`, `alvoDoLink`): `#arquivo/<id>` abre a pasta do arquivo (primeiro pai; sem
  acesso a ela, Compartilhados comigo) com ele na prévia; `#baixar/<id>` faz o mesmo e aperta o Baixar da prévia
  (download pelo service worker, confirmação acima de 1 GB, Docs do Google "Esse arquivo não pode ser baixado.").
  Vale de fora e com o app aberto (`hashchange`, mesmo com outra prévia aberta); o `#` some do endereço; sem acesso,
  na lixeira ou inexistente: "Esse arquivo não abriu neste Drive." e a raiz.
- HUB: `linkDoSobedesce` só repassa a origem do SOBEDESCE, caminho `/app/`, rota certa para o tipo e id do próprio
  item (qualquer outra coisa some); o prompt da Z pede por arquivo `[Abrir]` e `[Baixar]`, por pasta só `[Abrir]`,
  nunca link do Google nem endereço cru; o botão "Abrir a pasta no SOBEDESCE" por arquivo saiu.
- Testes: SOBEDESCE web lint, typecheck, `npm test` 263/263 (campos novos, nada de `drive.google.com` nem
  `webViewLink`/`webContentLink` na resposta e no `fields`) e build; motor `test:fast` 732 ok, 3 pulados
  (`drive-link.test.js`: `linkDoHash`, `alvoDoLink`; versão 2.8.50/v65). Raiz lint, format, typecheck, `npm test`
  177/177 (Postgres local; `ia-drive.test.ts`: os dois links por arquivo, só Abrir por pasta, link de outra origem,
  caminho, query, rota ou id some) e build. `scan-secrets` limpo. Os dois builds rodaram com `next build --webpack`:
  no worktree desta sessão o `node_modules` é um link para o checkout principal e o Turbopack recusa link que sai da
  raiz do projeto.
- Tela Playwright em 390 px com o Drive falso do repositório (`test/mock-drive.js`, `?dev_api=`) e o service worker
  de verdade: `#arquivo` de fora abre "Meu Drive › Projetos 2026 › Clipe Verão" com Teaser.mp4 tocando na prévia;
  `#baixar` com o app aberto dispara o download (evento do navegador, bytes iguais por MD5) e mostra "Baixando";
  arquivo de 2,1 GB pede a confirmação; sem acesso mostra o aviso e fica na raiz; Doc do Google avisa que não baixa;
  o `#` some em todos. Não validado: Drive e conta reais; iPhone de verdade (o app instalado recebendo o link com
  ele aberto).

## Maestro: Etapa 0, fundação (28/10/2026)

- Plataforma nova em `products/maestro` ([ADR 0022](decisions/0022-maestro-no-monorepo.md)): shell, login único,
  schema `maestro` com RLS, repasse da Z. Nada publicado; nenhum dado dos repositórios antigos.
- Produto: `npm run lint`, `format:check`, `typecheck`, `npm test` **47/47** em 4 arquivos (`node --test`, Postgres
  16 local, bancos `maestro_test_*`, Absolute ZRO falsa): `rls.test.mts` (RLS em toda tabela; dona vê a sua
  organização em 13 tabelas; organização forjada não lê nada em nenhuma; a mesma pessoa vê só a ativa; `org_id`
  trocado recusado; leitura não escreve; sessões e tentativas sem privilégio; papel só pelo login; só admin muda a
  organização; auditoria assinada e só inclusão; cards só por função, conflito por campo, lápide, outra organização
  inalcançável; decisões imutáveis e idempotentes; um link ativo por lote com 30 dias), `zro.test.mts` (entra e vira
  membro admin, Criar conta com `prompt=create`, papel reaplicado a cada login, sem organização, volta para fora
  recusada, recusa na Absolute ZRO, `invalid_scope` refaz com os básicos, state/nonce/aud/emissor/assinatura/cookie
  adulterados recusados, sem acesso cai em `/sem-acesso` e o `/eu` relê os produtos nos dois sentidos, perfil único,
  renovação do token, renovação recusada encerra a sessão, Absolute ZRO fora do ar mantém a última cópia, sair revoga
  na Absolute ZRO, POST de outra origem recusado, sessão forjada e vencida negadas), `ia.test.mts` (só os caminhos do
  painel, Bearer da sessão sem vazar o token, NDJSON em streaming antes do fim, 401/404/403/415, 403 sem acesso,
  login básico pede reconectar, renovação antes de repassar, recusa esquece os tokens, 502 sem derrubar a sessão) e
  `acesso.test.mts` (`temAcesso` com e sem a claim `zro_release`, tabela fixa de papéis); `npm run build` ok.
- Raiz, depois das mudanças no HUB (`ProductId`, `PRODUCT_SCOPES`, `plataformas.ts`, `0019_maestro.sql`, ícone;
  `ia-plataformas.test.ts` passa a ler os produtos de todas as migrations): `npm run lint` 0 problemas,
  `format:check` ok, `typecheck` ok, `npm test` **177/177** em 23 arquivos (Postgres local, banco `zro_maestro_test`,
  com a 0019 aplicada: `openapi`, `schemas`, `findEventCycle`, RLS do `zro` e o plano grátis com 7 apps seguem iguais),
  `next build --webpack` do hub-web ok (o `node_modules` do worktree é um link e o Turbopack recusa);
  `contracts:export` não mudou nenhum schema publicado; `scan-secrets`: nenhum segredo em 2.291 arquivos.
- Telas Playwright (Chromium 1.63; 1440 e 390 px, claro e escuro; 28 imagens): página inicial, `/entrar`, shell com
  a aba Z (o `<zro-ia>` publicado em absolutezro.com carregou e falou com a Absolute ZRO falsa pelo repasse), Quadro
  com as 8 colunas vazias, Aprovações (estado vazio), Ajustes e "sem acesso", contra a Absolute ZRO falsa e um
  Postgres local, com o build de produção (`next start`).
- Não validado: Absolute ZRO de verdade (cliente `maestro-web` não existe), o `<zro-ia>` publicado respondendo pelo
  repasse em produção, Supabase (o papel `maestro_app` precisa ser criado pelo `postgres` antes da primeira migração
  e o login do pool ser o dono do schema `maestro`), projeto Vercel e domínio.

## Maestro — demonstração de uma produtora (28/10/2026)

- `products/maestro`: `npm run lint`, `format:check`, `typecheck` ok; `npm test` **72/72** em 16 suítes (novo
  `tests/demo.test.mts`: carrega 10 clientes, projetos e cards nas 8 colunas; carregar de novo, inclusive dois ao mesmo
  tempo, não duplica; outra organização não vê nem remove; leitura e equipe não removem; remover deixa intactos o
  cliente, o projeto, o card e o histórico de verdade e a demonstração da outra organização; o histórico segue só
  inclusão fora da remoção); `npm run build` ok; `db:migrate` + `db:seed:demo` duas vezes num banco novo (a segunda
  não muda nada).
- Não validado: telas no Playwright (selo, botões no Quadro vazio e em Ajustes) e a migração 0003 no Supabase.

## Gate de lançamento no HUB — Etapa B do PRD de acesso (28/10/2026)

- Decisão do proprietário aplicada ([ADR 0023](decisions/0023-gate-de-lancamento.md), migration
  `0018_release_gate.sql`): SOBEDESCE, Synquei e TPeasy `released` em todos os canais; NOSSOM, AEON (`ai-edit`),
  Revela (`finishing`) e Carro do Freela `development` sem canal; sem linha = fechado (o `maestro` nasce fechado).
  Única conta autorizada nos quatro = a do proprietário, inserida só em produção ([checklist 5a](operations/deployment-checklist.md));
  a migration traz apenas o exemplo comentado.
- Núcleo: `zro.product_release`, `zro.product_release_access`, `zro.release_allows(produto, pessoa, canal)` (RLS:
  estado legível por `zro_app`, lista só do sistema; auditoria por trigger, só-inclusão); `@zro/billing` `release.ts`
  (`releaseState` com cache de 30 s, `releaseAllows` por pedido, `releaseClaimsFor`, operações do console);
  `checkEntitlement(..., { who })` → `product_closed` antes do plano; `productAccessFor` → `access: 'closed'` +
  `release: { state, open, allowed, channels }` (pessoa da transação `asUser` ou passada; canal padrão web);
  `authorize()` com o canal do pedido (token de app = api, sessão = web) e `need.release`; erro
  `product_closed` 403 com `details.closed = true` e `upgrade = false`.
- Login único: `issueCode`, troca de código, refresh (`invalid_grant` "Este app ainda está em desenvolvimento."),
  `userinfo` e `authenticateAccessToken` (401) conferem `zro.release_allows` a cada pedido; claim `zro_release` em
  id_token, access token e `userinfo`; `zro_products` só com produtos contratados e abertos para a pessoa.
  `/oauth/authorize` de cliente fechado: página "Em desenvolvimento" (200) + auditoria `release.denied`
  (cliente e canal, nada privado); `prompt=none` → `access_denied`. `npm run db:release:revoke` (prévia por padrão,
  `--apply` com motivo e auditoria) para as sessões de antes do gate — **não rodado em produção**.
- HUB: componente `EmDesenvolvimento` (`/em-desenvolvimento/<produto>`: 200 fechado, 404 inexistente, lançado → `/inicio`),
  catálogo público com `release: { state, canais }`, a Z nega 403 de dentro de app fechado e o guia dela só cita as
  plataformas abertas para a pessoa (`retrato.ferramentas` com `acesso !== 'closed'`), `estadoDaIa` marca
  `emDesenvolvimento`; console Administração › Lançamento (estado e canais com motivo; acesso interno por pessoa
  escolhida na lista, tipo, canais, validade; revogar também encerra as sessões da pessoa nos apps do produto;
  auditoria). Etapas de projeto: produto fechado sem histórico = `unavailable`; o que já aconteceu continua visível.
- Testes (Postgres local, bancos próprios `zro_gate_test` e `zro_gate_e2e_test`): lint 0, `format:check` ok,
  `typecheck` ok (pacotes e hub-web), `npm test` **197/197 em 24 arquivos** (novo `release-gate.test.ts`, 12 casos:
  seed e regra do banco, anônimo, RLS, conta grátis, assinante do SOBEDESCE com Completo, usuário de outro produto,
  admin da plataforma sem linha, tester por canal com validade e revogação, Carro só para a conta listada — outro
  admin, assinante e colega da mesma organização negados —, cross-tenant, console com cache e auditoria, validação da
  concessão, `db:release:revoke` prévia e `--apply`; casos novos em `oidc.test.ts` (access_denied, zro_release,
  refresh/userinfo/Bearer revogados), `ia-token.test.ts`, `ia.test.ts`, `carro-hub.test.ts`; regressão de
  `flow.test.ts`, `ia.test.ts`, `accounts.test.ts`, `core.test.ts` ajustada ao estado real dos produtos), `npm run build` ok,
  `scan-secrets` limpo (2289 arquivos), `npm run test:e2e` **24/24** (caso novo no `sso.spec.ts`: cliente trusted do
  NOSSOM → "Em desenvolvimento" sem código e sem violação axe WCAG A/AA, `prompt=none` → `access_denied`, auditoria
  `release.denied` só com cliente e canal, `/em-desenvolvimento/nossom` 200, inexistente 404, lançado → `/inicio`, conta
  listada volta ao app com código; `hub.spec.ts` ajustado ao estado real: AEON indisponível, NOSSOM `closed`, 3 apps com
  acesso no plano grátis; o cliente de teste do fluxo trusted virou Synquei e o do Carro lista a conta nova como
  proprietária). Tela "Em desenvolvimento" conferida em captura local (claro e escuro, 390 px e 1280 px): símbolo
  pequeno, ícone do app, título Light × ExtraBold, uma linha, botão de vidro escuro.
- Interface do HUB lendo `release` (28/10/2026, mesmo branch): `liberadosPara(pessoa, canal)` em
  `lib/data/catalog.ts` (via `releaseClaimsFor`, sem cache) decide o que cada tela mostra; homepage, `/planos`,
  `/baixar`, `/downloads`, `/api/v1/desktop/apps`, `/baixar/app/<id>/…`, menu "Absolute ZRO", Ferramentas, `AppTile`,
  painel do app, `/inicio`, Sua conta › Acessos e a gaveta da Z. Testes: `downloads.test.ts` (fechado vira `soon`, sem
  instalador; lista de acesso continua baixando), `desktop-apps.test.ts` (catálogo e endereço só para liberados),
  `core.test.ts` com o `maestro` fechado; e2e novo em `hub.spec.ts` (anônimo: homepage com selo e sem nenhum link para
  site de produto fechado, órbita da Z só com lançados, `/baixar` sem instalador nem "Conheça mais" do NOSSOM,
  `/api/v1/desktop/apps` sem `nossom`, `/baixar/app/nossom/…` 404) e `/planos` sem AEON/NOSSOM. Resultados (bancos
  próprios `zro_gateui_test`/`zro_e2e_gateui_test`): lint 0, `format:check` ok, `typecheck` ok, `npm test` 199/199,
  build ok, `scan-secrets` limpo, `hub.spec.ts` + `sso.spec.ts` 19/19, `test:e2e` 24/25 — o caso "área logada sem
  violações WCAG" passa sem violação (56 s) mas estoura os 60 s com a máquina carregada; o mesmo caso no commit de
  antes leva 57–59 s, então o limite já estava no fio (não é regressão). Capturas locais (1280 px, claro): faixa e
  "Conheça de perto" da homepage, órbita da Z, `/baixar` com NOSSOM e Synquei, `/planos`, `/inicio` e `/ferramentas`
  de conta básica.
- Não validado: produção (nada publicado; a conta do proprietário e o `revoke --apply` dependem de autorização);
  sites dos produtos lendo `zro_release` (outros agentes); `maestro` (migration 0019 de
  outro agente) só por construção (sem linha = fechado).

## Carro do Freela fechado até o lançamento (28/10/2026)

- Adendo do PRD: só a conta que o HUB lista como `allowed` em `zro_release` entra; claim relida a cada pedido
  (`/oauth/userinfo`), `CARRO_RELEASE` padrão `closed` (só `released` exato abre). Fechado: callback volta
  `?zro=fechado` sem sessão; `eu` 401/403 e apaga os cookies; `enviar`/`ia` 403 `fechado`. Tela: build do domínio com
  `cdf-release=closed`, home sem porta e toda outra tela/rota (`/fase1`) em "Em desenvolvimento". VERSAO `28/out · 1`.
- Testes: Carro `test:api` 43/43; `node test/run.js` (JUNTAS=2) 84 de 88 numa rodada cortada pelo limite de tempo do
  ambiente, e as 4 restantes sozinhas, verdes: conta-zro 142 (personas do PRD §11 negadas, conta allowed permitida,
  sessão antiga negada), sem-zoom 41, abertura 39, tempo-real 23. home-clara 80, baloes 24, menu-recolhivel 52.
  `scan-secrets` limpo. Telas 1440 e 390 ("Em desenvolvimento" claro/escuro e home fechada).
- Não validado: HUB real emitindo `zro_release` (contrato simulado pelo HUB falso) e o deploy na Vercel com a variável.

## Homepage só com a verdade de hoje (28/10/2026)

- Pedido do titular: no ar para todos só SOBEDESCE, Synquei e TPeasy (e o HUB/Z); Carro do Freela, AEON, NOSSOM,
  Revela e Maestro em desenvolvimento. O gate (`zro.product_release`) já filtrava faixa, órbita e etapas; mudou o
  texto e as imagens que prometiam o fechado.
- Foto dos aparelhos (`public/brand/produto-hub-{claro,escuro}.webp`): `scripts/marca/aparelhos/capturar-hub.ts` cria a
  conta de demonstração "Victor" (Aurora Filmes, projeto "Clipe Aurora") num banco local migrado (0001–0021, estado de
  lançamento das migrations), simula a central do app de computador (SOBEDESCE e Synquei instalados) e captura
  `/app/apps` (1440×916 @2x) e `/inicio` (390×860 @2x), claro e escuro; depois `produtos.py <pasta> hub` e
  `transparente.py`. MacBook: fechados com o selo e sem Abrir; iPhone: órbita com os 3 lançados e "Novo projeto ·
  Comece do zero". OG e `twitter-image` recapturados de `og-paisagem.html` (Figtree carregada).
- Conferido no HUB local (anônimo, claro): `/`, `/planos` e `/baixar` em 1440 e 390 sem rolagem lateral e sem
  recurso 404 (antes, `produto-maestro-claro.webp` dava 404 em "Conheça de perto").
- `lint`, `format:check`, `typecheck` ok; `npm test` **202/202** (banco próprio); `hub.spec.ts` **14/14** (gate:
  "Do roteiro à entrega.", nada de "do job" na home, selo nos fechados de `/baixar`; conta nova sem "de um job" no
  Início). `scan-secrets` limpo.
- Não validado: produção (nada publicado); tema escuro da homepage só pela foto dos aparelhos.

## Apps de celular e computador iguais ao web (28/10/2026)

- Pedido do titular: "atualiza as plataformas no mobile e no computador também". Conferido em cada cliente lançado:
  - **Aba da Z**: SOBEDESCE (computador `public/`, celular `web/public/app`), Synquei (`app/`, também empacotado no
    Electron) e TPeasy (`app/`) já tinham a Z como primeira aba. Nenhum cliente guarda cópia do `<zro-ia>`: todos
    carregam `https://absolutezro.com/ia/v1/zro-ia.js` ao vivo, então a versão é sempre a do HUB.
  - **SOBEDESCE só com a conta Absolute ZRO**: nenhuma tela dos apps tinha "Entrar com Google" (o computador entra pelo
    código no site, o celular pelo `/entrar`, que já é só Absolute ZRO). Os textos de entrada passaram de "conta
    SOBEDESCE" para "conta Absolute ZRO" (Primeiros passos, Ajustes, Z, Dispositivos, Referências, navegador; celular:
    tela de entrada). O "Conectar um Drive só neste computador" (chave própria do Google) continua como opção de
    conexão do Drive, não de entrada.
  - **Contato**: nenhum e-mail pessoal ou gmail nas telas dos clientes.
  - **Produtos fechados**: NOSSOM, Revela e Carro do Freela saíram da lista "Absolute ZRO" do SOBEDESCE (barra lateral
    do computador e Ajustes do celular), do Synquei e do TPeasy, e os ícones deles saíram do cache dos service workers.
    O "Converter com a Revela" do celular do SOBEDESCE (conversão no próprio aparelho, sem abrir a Revela) ficou como
    está, igual ao web.
  - **Absolute ZRO para computador** (`apps/hub-desktop`): abre o site ao vivo; nada a mudar.
- Versões: app do celular SOBEDESCE 2.8.51 / `sobedesce-app-v66`; `synquei-v22`; `tpeasy-v19`. O build dos apps de
  computador (SOBEDESCE e Synquei) vem do GitHub Actions (`build-info.json`), não do `package.json`.
- Testes: SOBEDESCE `npm run test:fast` 733 ok, 3 pulados (novos casos em `test/familia.test.js`: só plataformas
  abertas e entrada só com Absolute ZRO); `web`: lint, typecheck e 263/263. Synquei `npm test` 116 ok, 4 pulados (caso
  novo da família em `tests/zro-ia.test.mjs`). TPeasy `node --test tests/*.test.mjs` 50/50.
- Não validado: instaladores novos (dependem de autorização do titular) e telas no Playwright.

## SOBEDESCE no Windows: bandeja e barra lateral (28/10/2026)

- Pedido de cliente (Windows): "minimizar para a bandeja, não para a barra". `desktop/bandeja.js` decide (função pura):
  minimizar → bandeja com o ajuste ligado (padrão só no Windows); fechar no X → como antes sem transferência; com
  transferência andando e a bandeja ligada, esconde na bandeja em vez de perguntar "Sair?"; Mac nunca muda (Dock).
  Aviso "O SOBEDESCE continua aqui na bandeja" uma vez só (`<userData>/bandeja.json`). Segunda abertura traz a janela
  de volta. Ícones gerados por `scripts/bandeja-icones.mjs` (ICO 16–64 px no Windows, template no Mac). O teste de
  fumaça não cria bandeja.
- Barra lateral: medida no Chromium do Playwright com o `scripts/ui-stub.js` (versão nova pronta) em 1366×768,
  1280×720 e nos equivalentes de 125% (1093×614 e 1024×576 CSS): antes, a família sumia (rolagem interna de 0 px) e a
  conta ficava fora da janela (sobravam 43 a 236 px); depois, nenhum item fora e nenhuma rolagem. O aviso de versão é
  uma pílula ("Atualizar") que abre o cartão num balão; "Depois" fecha e esconde. A família é uma linha "Absolute ZRO"
  que abre a lista num balão.
- Testes: `test/bandeja.test.js` (7 casos) e `npm run test:fast` no SOBEDESCE; `scan-secrets` limpo.
- Não validado: Electron real no Windows (bandeja, balão, clique duplo); só lógica, ícones e interface no navegador.

## Maestro: visual C1 · Aurora (28/10/2026)

- `products/maestro`: `npm ci`, `lint` 0 problemas, `format:check` ok, `typecheck` ok, `npm test` **237/237** (novo
  `tests/hora.test.mts`: tom da luz, relógio, saudação e hora do Brasil), `npm run build` ok, `npm run test:e2e`
  **43 passaram, 1 pulado** (o editor completo do orçamento só roda no computador, como antes). E2E novo
  `e2e/visual.spec.ts`: em Hoje, Quadro, Aprovações, Financeiro, Orçamentos, Freelas, Inventário, Agenda, Ajustes e a
  página inicial, todo texto visível passa AA compondo os fundos sobre cada foco da luz na opacidade cheia, nas quatro
  horas do claro e no escuro (computador e iPhone); a luz acende ao montar (`data-hora`), fica parada com reduzir
  movimento e, com movimento, deriva em 120 s e cruza em 60 s. `inicio.spec.ts` atualizado para a cápsula (menu do
  grupo com a seção atual, Esc fecha, navegar fecha). Auditoria extra fora do e2e (script local) em 34 telas, incluindo
  detalhes, timbrado, documentos e `/a`, `/p`, `/o`: sem falhas depois de escurecer o cinza de apoio (`#5e5e63`), os
  rótulos do timbrado (`#6e6e73`) e dar vidro claro aos botões dentro da folha no escuro.
- Capturas da página inicial (`public/produto/*.webp`) refeitas com a demonstração no visual novo; capturas de todas as
  telas (claro e escuro no computador, claro no iPhone) para revisão do titular, fora do repositório.
- Raiz: `npm run format:check` ok; `node scripts/scan-secrets.mjs` limpo.
- Não validado: Safari real (o cruzamento de 60 s depende de `@property`, sem ele a cor troca de uma vez) e telas com o
  menu da cápsula em leitor de tela.

## Maestro: nada cortado no iPhone (29/10/2026)

- Relato do titular (iPhone, Safari, 393 px, claro) no lote de Aprovações: ações, peças, linha da versão e o tempo no
  player cortados dentro das caixas. Detector novo `products/maestro/e2e/corte.ts` (texto ou controle fora do ancestral
  que corta ou da tela, texto cortado sem reticências, rolagem de lado sem `data-rolagem`, placeholder que não cabe,
  rótulo curto quebrado em duas linhas, textos sobrepostos e barra nativa do `<video>` no player) e
  `e2e/sem-corte.spec.ts`: mais de 60 telas e estados com a demonstração (Hoje, Quadro e ficha, Aprovações, os lotes e o lote
  com o SOBEDESCE, `/a` com Antes e Resumo, Projetos, Clientes, Pedidos quadro/lista/ficha, Orçamentos lista/editor/
  timbrado, Financeiro e Números, Freelas e o perfil com kit, Inventário, Agenda, Documentos, Arquivos com cadeado e com
  o Drive falso, Ajustes e subpáginas, `/p`, `/o`, página inicial, Z, formulários) a 375 e 393 px, claro e escuro, no
  Chromium e no WebKit (projeto `iphone-safari`; o CI do Maestro passa a instalar o WebKit).
- Antes: 40 achados a 393 px no WebKit (faixas sem aviso, `+ Peça` e filtros cortados, placeholders, a página de
  editar lançamento alargada por um select no WebKit, o arquivo do Importar fora da tela, o select da ficha do Quadro).
  Depois: nenhum. `products/maestro`: `lint` ok, `format:check` ok, `typecheck` ok, `npm test` **302/302**, `build` ok,
  `test:e2e` **65 passaram, 5 pulados** (o detector não roda no computador; o editor completo do orçamento só no
  computador). Computador sem mudança visual (regras em media query de celular; `min-width: 0` e `overflow: hidden`
  no select só valem quando algo transbordava).
- Não validado: Safari num iPhone de verdade (WebKit do Playwright com emulação) e o iframe do Drive sem a chave (a
  barra dele é do Google).

## Maestro: versão colada na ficha do card (29/10/2026)

- `tests/versoes-card.test.mts` (7): colada no card aparece na ficha (mais nova primeiro) e no lote que já tinha o card
  (a volta sobe); lote criado depois começa na versão do card; link `http://` e pasta do Drive recusados com a mesma
  mensagem do lote; leitura lê e não cola (`sem_permissao`); duas organizações; equipe com acesso restrito a outro
  cliente não vê nem cola; id inválido não chega ao banco. `npm test` **330/330** (33 arquivos).
- E2E `e2e/versao-card.spec.ts` (computador e iPhone): cola YouTube com Enter (a ficha não envia), pasta do Drive dá o
  erro do lote e desliga "Adicionar", mp4 por "Adicionar" vira v2; o lote criado depois traz v2 e v1 com a v2 na mesa; a
  versão colada no lote (Vimeo) aparece na ficha. `sem-corte.spec.ts` ganhou a ficha com Versões e com o erro (375 e
  393 px, claro e escuro, Chromium e WebKit). `test:e2e` inteiro: **72 passaram, 6 pulados**. `lint`, `format:check`,
  `typecheck`, `build` ok; `node scripts/scan-secrets.mjs` sem segredo.
- Capturas: `scratchpad/maestro-versao-card/ficha-versoes-{desktop,phone}-{light,dark}.png`.
- Não validado: Safari num iPhone de verdade; Drive real (a versão do Drive colada na ficha usa o mesmo
  `compartilharVersaoSeComLink` do lote, coberto pelos testes do SOBEDESCE).

## Maestro: contrato junto com o orçamento e "Maestro com a sua marca" (29/10/2026)

- HUB: migração `0025` (adicional `maestro-marca-propria` R$ 89,90/mês e `-anual` R$ 899/ano e o Pro v2 com o sinal,
  tudo em rascunho). `packages/billing/test/stripe.test.ts` (+2): preços, rascunho fora da venda, Pro v2 com as 7
  ferramentas e os créditos da v1 mais o sinal; o adicional sozinho não abre o Maestro (`checkEntitlement`
  `entitlement_required`, `productAccessFor` sem contrato), o sinal só sai com o Maestro aberto para a pessoa e não
  vaza para outra organização. `tests/integration/oidc.test.ts` (+1): `zro_features` no id_token, no access token e no
  userinfo só para o cliente do Maestro; outro app recebe lista vazia; organização sem o sinal, vazia. Sinal fora dos
  medidores (`isFeatureFlag`) e da vitrine. Raiz: `lint`, `format:check`, `typecheck` ok, `npm test` **260/260** (33
  arquivos), `apps/hub-web` build ok, `node scripts/scan-secrets.mjs` sem segredo.
- Maestro: migração `0020`. `tests/contrato.test.mts` (14): preenchimento e escape das variáveis, listas, o que falta,
  modelo base só com variáveis conhecidas, números com limites, CPF/CNPJ com dígito, foro pela sede, parcelas que andam
  com o aceite atrasado; versões só de inclusão (admin salva, gestão lê, equipe e a outra organização não, igual não
  cria versão, restaurar vira versão); versão imutável até para o dono do banco; aceite com contrato: o banco recusa a
  função antiga, documento inválido, sem "Li e aceito", hash trocado e modelo velho; aceita uma vez com projeto,
  parcelas e o registro (hash = sha256 do HTML, CPF formatado, endereço, total, sede, portfólio, IP em HMAC, navegador,
  auditoria); repetir não duplica; a equipe com dinheiro lê e confere, equipe/leitura/outra organização não; registro não
  muda nem se apaga (nem como admin), check do hash, contrato de orçamento aprovado não desliga; sem contrato, o aceite
  de sempre. `tests/marca-propria.test.mts` (4): claim filtrada, `temMarcaPropria` (acesso + sinal; fechado é fechado),
  acento com 3:1 no claro e no escuro e fallback, login → sinal na organização → releitura apaga; `marca_publica.propria`
  só na organização com o sinal. `acesso-cliente.test.mts` (+1, política `contratos_cliente`), `demo.test.mts` (o
  contrato de exemplo sai com a demonstração). `npm test` **321/321**; `lint`, `format:check`, `typecheck`, `build` ok.
- E2E `e2e/contrato.spec.ts` (computador e iPhone): Ajustes → Contrato salva versão com a prévia ao vivo; "Enviar
  contrato junto"; o cliente lê o contrato com a marca da produtora e o rodapé só "Powered by Absolute ZRO", preenche
  CPF e endereço (o texto se completa ao digitar) e aceita; reabre e vê o registro com o hash; a equipe abre "Ver
  contrato" (aceito · conferido) e o projeto lista o contrato; marca própria: logo na cápsula/topo, título com a
  produtora, `--acento` com a cor dela, "Powered by"; outra organização sem o sinal vê o cartão do adicional com o link
  para os planos. `sem-corte.spec.ts` ganhou Ajustes → Contrato e o contrato aceito. `test:e2e` inteiro: **67 passaram,
  6 pulados, 3 caíram por disco cheio no ambiente (ENOSPC, Chromium travado)**; os 3 rodados de novo passaram (o
  `negocio` do iPhone e o sem-corte do iPhone no Chromium a 375 escuro e 393 claro e escuro). WebKit (Safari) sem corte
  nas 4 combinações.
- Capturas: `scratchpad/maestro-v2/shots/ct-*.png` e `wl-*.png` (claro, escuro e iPhone).
- Não validado: revisão jurídica do texto do contrato (é modelo base); planos publicados e cobrança do adicional
  (rascunho até o titular); concessão do sinal à organização do titular em produção; domínio próprio (fora do escopo).

## SOBEDESCE: proxies à vista no lote e números do envio (29/10/2026)

- Pedido do titular: o lote "26 arquivos · 104 GB · 100% · 26 de 26 conferidos" parecia pronto, mas os proxies ainda
  eram gerados e enviados (só aparecia abrindo o lote), e dava para limpar a fila sem querer. Fonte: `record.previa`
  de cada envio (o motor já mandava pelo SSE `transfers`); `public/lib/transferencias.js` (`proxiesDoLote`,
  `proxyResumo`) monta o estado do cartão fechado; nada inventado na tela.
- Limpar: `TransferManager.clearFinished()` mantém o lote inteiro com proxy pendente (na fila, pausado, gerando ou
  enviando) e devolve `{ removidos, mantidos }`; `remove(ids)` não tira envio concluído com proxy pendente (a linha
  esconde "Tirar da lista"; "Pular" continua sendo o jeito de cancelar o proxy). Antes, limpar tirava o registro e o
  proxy seguia invisível e se perdia ao fechar o app.
- Números do lote: `src/engine/lote-tempo.js` grava em `batch.stats` o primeiro começo, o último original que chegou, o
  tempo com algum arquivo andando (vários juntos contam uma vez; fila, pausa e esperas fora), os bytes que passaram e o
  tempo dos proxies. Média = bytes / tempo andando, em MB/s como o resto do app (Mbps na dica). Lote de versão anterior:
  relógio inteiro, marcado na dica. O uso diário enviado à conta (`src/engine/uso.js`) já tem bytes e `msAtivo` por dia;
  não mudou.
- Bandeja e fechar o app (`desktop/bandeja.js`, `main.js`): com os originais no Drive e proxies andando, "Gerando 3
  proxies" no menu e na dica, pergunta antes de sair e o computador não dorme.
- Testes: `test/lote-proxies.test.js` (7 casos: cartão, falhas, conta da média, LoteTempo, bandeja, limpar com o motor de
  verdade e o Drive falso sem cancelar o proxy, `batch.stats` gravado e lido ao reabrir); `test/server.test.js` com a
  resposta nova do `/api/transfers/clear`. SOBEDESCE `npm run test:fast` **776 ok, 4 pulados**, 0 falhas; teste de fumaça do
  Electron (`--smoke`, Linux com xvfb) `SMOKE OK`; `scan-secrets` limpo.
- Telas: `scripts/ui-stub.js` com `STUB_PROXIES=1` no Chromium do Playwright, claro e escuro (cartão andando, prontos,
  com falha, e a tela depois de Limpar concluídas com o aviso).
- Não validado: Electron real com bandeja no Windows/Mac e um lote real de 100 GB (a conta da média foi conferida com
  números feitos e com o Drive falso).

## SOBEDESCE: "Agora sua conta é Absolute ZRO" para contas antigas (29/10/2026)

- Decisão do titular: contas antigas sem `contas_zro` (várias com Drive em `contas_google`) precisam ligar a Absolute
  ZRO para o ecossistema achar o Drive, sem tirar ninguém da conta e sem parar transferência. Regra em
  `web/src/lib/zro/ligar.ts`; o botão usa o `modo=vincular` de sempre. Vínculo novo → 303 para
  `ZRO_CONEXOES_URL` (padrão `${ZRO_ISSUER}/conexoes`); religar segue em `?zro=ok`; vínculo novo exige e-mail confirmado.
- Site: `/conta` e `/z` trocam a página pela tela (`components/conta/ligar-zro.tsx`). `/dispositivo`, `/admin` e a API
  não mudam; `/api/eu` ganhou `zro: { ligada, pedir, ligar }`.
- Celular (`web/public/app`): tela inteira no lugar das abas; com envio andando, faixa fixa e link em outra janela.
- Computador: `CloudAuth` lê `zro` do `/api/eu`; `POST /api/cloud/zro/ligar` devolve o endereço e confere a cada 3 s.
  Folha com o app parado, faixa fixa com transferência ou cartão andando; a fila não é tocada.
- Testes: `web/tests/zro-ligar.test.mts` (11 casos: tela aparece e some, API sem 403 para Drives/token/andamento,
  Conexões e `ZRO_CONEXOES_URL`, outra conta, e-mail não confirmado, cancelar, sem SOBEDESCE em `zro_products`, sem
  configuração, render da tela); web `npm test` **291 ok**, lint e typecheck limpos, `next build` ok.
  `test/ligar-zro.test.js` (5 casos, com envio real no Drive falso terminando conferido enquanto a conta liga);
  `npm run test:fast` **779 ok, 4 pulados**; as 2 falhas da rodada foram o teste do cache do app (já corrigido) e
  `revela.test.js` sem espaço em disco nesta máquina (precisa de 1,1 GB). Fumaça do Electron (`--smoke`, xvfb)
  `SMOKE OK`; `scan-secrets` limpo.
- Telas: `next start` com banco e Absolute ZRO falsos (site claro/escuro, celular claro/escuro, recados) e
  `scripts/ui-stub.js` com `STUB_ZRO=folha|faixa` (app do computador) no Chromium do Playwright.
- Não validado: a página de Conexões da central (outro deploy), o caminho no iPhone com o app instalado (folha do
  navegador por cima ao tocar na faixa) e o Electron de verdade abrindo o navegador do sistema.

## Maestro para computador (29/10/2026)

App Electron em `products/maestro/desktop` (Mac e Windows), Release de teste `maestro-versao-de-teste` e o Maestro no
catálogo de downloads da Absolute ZRO, atrás do gate.

| Verificação                                       | Comando                                                                         | Resultado                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Regras, aviso de versão, cópias, ícones e Release | `cd products/maestro/desktop && npm test`                                       | **24/24** (navegação, links do cliente, `mailto:`/`webcal:`, deep link, permissões, versão, gerenciado)     |
| Fumaça (dev e empacotado)                         | `xvfb-run -a electron . --smoke --no-sandbox` e `dist/linux-unpacked/… --smoke` | `SMOKE OK` nos dois (ponte, sem Node, Figtree, ícone, papel `#f7f3ee`, regras); asar só com `desktop/**`    |
| Empacotar                                         | `electron-builder --linux dir`                                                  | ok, fusíveis gravados; o .dmg e o .exe saem no GitHub Actions (Mac e Windows não rodam aqui)                |
| Login dentro da janela (site real)                | app em dev, CDP                                                                 | `/app` → "Entrar com Absolute ZRO." do Maestro → `absolutezro.com/entrar?next=/oauth/authorize…` na janela  |
| Sessão guardada (Maestro e HUB falsos, local)     | app em dev com `MAESTRO_URL`/`ZRO_HUB_URL`                                      | entra, volta em `/app/hoje`; fecha e abre: continua logado (`mae_sessao` com validade, não de sessão)       |
| Hub: catálogo e downloads                         | `npx vitest run tests/integration/{desktop-apps,downloads}.test.ts`             | fechado = fora do catálogo e 404 em `mac`, `windows`, `versao.json` e arquivo; liberado = Mac/Windows/aviso |
| Raiz                                              | `npm run lint`, `format:check`, `typecheck`, `npm test`                         | ok · ok · ok · **280/280** em 34 arquivos                                                                   |
| E2E do HUB                                        | `next build --webpack` + `npx playwright test`                                  | **29/29**; o gate confere que nada do Maestro para computador aparece nem responde para anônimo             |
| hub-desktop (motor com o nome do app)             | `cd apps/hub-desktop && npm test`                                               | 60/60                                                                                                       |
| Segredos                                          | `node scripts/scan-secrets.mjs`                                                 | nenhum                                                                                                      |

Não conferido aqui: instalar e abrir num Mac e num Windows de verdade, o "Atualizar" trocando o app (só nos testes com
sistema simulado), e o primeiro Release (sai no primeiro push na main com `products/maestro/desktop/**`).

## SOBEDESCE: contador de "Agora" (29/10/2026)

- Relato do titular: pasta de 100,3 GB enviada de novo depois de uma falha; terminou e o painel mostrava "51% de 205 GB".
  Causa: o número grande somava todas as transferências da lista (lotes antigos concluídos e a tentativa que falhou,
  com o que já tinha subido) e o motor deixava a tentativa velha "com problema" ao lado da nova.
- `test/manager.test.js`: envio que falhou e é mandado de novo entra; a tentativa antiga vira cancelada
  (`substituidaPor`) e sai do total, do "parado" e dos problemas.
- `test/transferencias-ui.test.js` (`rodada`): lote velho concluído, cancelado e tentativa substituída ficam de fora;
  terminar não faz a porcentagem cair; dois lotes ao mesmo tempo contam juntos até o fim.
- Não validado: o painel num envio real de 100 GB no Mac do titular.

## Maestro · Criação: núcleo do Roteiro (F1, 29/10/2026)

Sem tela nesta fase: modelo, tempo, vistas, modelos de criação, conversão do documento antigo, junção por id, a
migração `0030_roteiros` e o migrador aceitando migração fora de ordem.

| Verificação                                                  | Comando                                                          | Resultado                                                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Puro: modelo, tempo, vistas, modelos, antigo, junção, papéis | `cd products/maestro && npx tsx --test tests/roteiro.test.mts`   | **31/31**; Teleprompter byte a byte e contra `countWords`/`renderScript`/`importAll` do TPeasy |
| Banco: duas organizações, papéis, rev, versões imutáveis     | `npx tsx --test tests/criacao-rls.test.mts`                      | **9/9**                                                                                        |
| Acesso por cliente com `roteiros` e `roteiro_versoes`        | `npx tsx --test tests/acesso-cliente.test.mts`                   | ok                                                                                             |
| Migrador: 0027 atrasada depois da 0030, `when` repetido      | `npx tsx --test tests/migrador.test.mts`                         | **2/2**                                                                                        |
| Maestro inteiro                                              | `npm run lint`, `format:check`, `typecheck`, `npm test`, `build` | ok · ok · ok · **419/419** · ok                                                                |
| Raiz                                                         | `npm run lint`, `format:check`, `typecheck`                      | ok · ok · ok                                                                                   |
| Segredos                                                     | `node scripts/scan-secrets.mjs`                                  | nenhum                                                                                         |

Não rodado: o e2e do Maestro (nenhuma tela mudou). A migração `0030` não foi aplicada em banco de verdade.

## Maestro · Criação: editor do Roteiro (F2, 29/10/2026)

`/app/criacao` (lista, "Novo roteiro", Fluxos "em breve"), o editor com as quatro vistas, a rota
`/api/criacao/roteiros/[id]`, a folha A4, "Abrir no editor novo" e o roteiro da demonstração. Sem migração nova.

| Verificação                                                             | Comando                                                               | Resultado                                   |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| Operações do editor e comparar com a versão (puro)                      | `cd products/maestro && npx tsx --test tests/roteiro-editor.test.mts` | **7/7**                                     |
| Rota: Origin, papéis, poll por `rev`, 409 com o atual e junção, versões | `npx tsx --test tests/criacao-rota.test.mts`                          | **7/7**                                     |
| Maestro inteiro                                                         | `npm run lint`, `format:check`, `typecheck`, `npm test`, `build`      | ok · ok · ok · **433/433** · ok             |
| E2E da Criação (computador e iPhone)                                    | `npx playwright test e2e/criacao-roteiro.spec.ts`                     | **6/6**                                     |
| E2E inteiro (com as telas novas no `sem-corte`, Chromium e WebKit)      | `npm run test:e2e`                                                    | **135 passaram**, 27 pulados (por aparelho) |
| Raiz                                                                    | `npm run lint`, `format:check`, `typecheck`                           | ok · ok · ok                                |
| Segredos                                                                | `node scripts/scan-secrets.mjs`                                       | nenhum                                      |

Rodado num Postgres local próprio (porta separada, `TEST_DATABASE_URL`, `E2E_PORT`/`E2E_PONTE_PORT`/`E2E_ANP_PORT`) para
não disputar os bancos `maestro_test_*` com outras frentes. Não validado: Safari de um iPhone de verdade (o arrastar
foi conferido com toque sintético; `field-sizing` não existe no WebKit e os campos curtos usam a largura fixa).

## Maestro · Criação: saídas do Roteiro (F3, 30/10/2026)

"Enviar ▾" (TPeasy, PDF para a edição, PDF; o cliente entra na F7), sempre de uma versão salva, com auditoria;
contrato `maestro.roteiro/1` (a opção do arquivo só com o AEON aberto pelo gate: hoje ninguém vê); bloco "Criação" na
ficha do card. Sem migração nova.

| Verificação                                                                                         | Comando                                                               | Resultado                        |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------- |
| Saídas puras: contrato contra o schema publicado e o exemplo, TPeasy pelo código do app, AEON       | `cd products/maestro && npx tsx --test tests/roteiro-saidas.test.mts` | **12/12**                        |
| Rota: envio só de versão salva, papéis, Origin, sha256 na auditoria, AEON só com o gate aberto      | `npx tsx --test tests/criacao-rota.test.mts`                          | **8/8**                          |
| Contrato (zod) aceita o arquivo do Maestro e recusa dado pessoal, nota, id repetido, fora do elenco | `npx vitest run packages/media-contracts`                             | **7/7** (com a deriva do schema) |
| Maestro inteiro                                                                                     | `npm run lint`, `format:check`, `typecheck`, `npm test`, `build`      | ok · ok · ok · **499/499** · ok  |
| E2E do Enviar (computador e iPhone)                                                                 | `npx playwright test e2e/criacao-enviar.spec.ts`                      | **5/5**                          |
| E2E inteiro (Chromium e WebKit)                                                                     | `npm run test:e2e`                                                    | **162 ok**, 38 pulados           |
| Raiz                                                                                                | `npm run lint`, `format:check`, `typecheck`, `npm test`               | ok · ok · ok · **361/361**       |
| Segredos                                                                                            | `node scripts/scan-secrets.mjs`                                       | nenhum                           |

Bancos próprios desta cópia (`TEST_DB_SUFIXO=f3`, `E2E_DB_SUFIXO=f3`) e portas separadas. As permissões da Criação
passam a vir da capacidade `criacao` do acesso por área (mesmo resultado; o teste confere com as políticas da 0030). O
navegador do e2e ganhou um proxy inexistente: sem rede, o `<zro-set>` de absolutezro.com segurava o "networkidle"
(transição, gestos e sem corte estouravam o tempo); agora falha na hora.
Não validado: a folha de compartilhar de um iPhone de verdade (no e2e, um `navigator.share` de mentira confere o `.txt`
entregue a ela) e o "Restaurar backup" no TPeasy instalado (o `importAll` do próprio app foi
rodado no teste).

## Maestro · Criação: núcleo do Fluxo (F4, 29/10/2026)

Sem tela nesta fase: migração `0031_fluxos`, operações por nó com `rev`, "o que mudou desde", referências vivas,
imagens em WebP com cota, link colado sem rede e a exportação em Markdown/JSON.

| Verificação                                                          | Comando                                                          | Resultado                       |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------- |
| Puro: link, operações, notas coladas, exportação, cota, imagem limpa | `cd products/maestro && npx tsx --test tests/fluxo.test.mts`     | **20/20**                       |
| Banco: duas organizações, papéis, rev, desde, referências, cota      | `npx tsx --test tests/fluxo-rls.test.mts`                        | **19/19**                       |
| Rotas do fluxo e da imagem (401/403/404, cabeçalhos)                 | `npx tsx --test tests/fluxo-rota.test.mts`                       | **5/5**                         |
| Acesso por cliente com as quatro tabelas do fluxo e a porta          | `npx tsx --test tests/acesso-cliente.test.mts`                   | **7/7**                         |
| Maestro inteiro                                                      | `npm run lint`, `format:check`, `typecheck`, `npm test`, `build` | ok · ok · ok · **463/463** · ok |
| Raiz                                                                 | `npm run lint`, `format:check`, `typecheck`                      | ok · ok · ok                    |
| Segredos                                                             | `node scripts/scan-secrets.mjs`                                  | nenhum                          |

Não rodado: o e2e do Maestro (nenhuma tela mudou). A migração `0031` não foi aplicada em banco de verdade; a cota de
200 MB por produtora ainda depende do plano do Supabase `AbsoluteZRO`.

## Maestro · Criação: o canvas do Fluxo (F5, 29/10/2026)

Telas `/app/criacao/fluxos` e `/app/criacao/fluxos/[id]` sobre o núcleo da F4; nenhuma migração nova.

| Verificação                                                                                                           | Comando                                                                      | Resultado                                                 |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| Puro: vista, zoom, enquadrar, seção sob o ponto, ligação, colar, fila e poll                                          | `cd products/maestro && npx tsx --test tests/fluxo-tela.test.mts`            | **16/16**                                                 |
| E2E: criar, nota, colar texto/imagem/link, ligar, mover, Desfazer, seção, recarregar; leitura; iPhone segurar e Lista | `E2E_DB_SUFIXO=f5 npx playwright test e2e/criacao-fluxo.spec.ts`             | **3/3**                                                   |
| Nada cortado a 375/393 px (lista, canvas, Lista, folha Adicionar)                                                     | `npx playwright test e2e/sem-corte.spec.ts`                                  | ok (Chromium e WebKit, 375/393, claro e escuro)           |
| Maestro inteiro                                                                                                       | `npm run lint`, `format:check`, `typecheck`, `npm test`, `build`, `test:e2e` | ok · ok · ok · **479/479** · ok · **132 ok** (24 pulados) |
| Raiz                                                                                                                  | `npm run lint`, `format:check`, `typecheck`                                  | ok · ok · ok                                              |
| Segredos                                                                                                              | `node scripts/scan-secrets.mjs`                                              | nenhum                                                    |

`E2E_DB_SUFIXO` separa o banco do e2e quando duas cópias rodam juntas. Não validado: pinça do trackpad no Safari de
verdade (`gesture*`) e o toque num iPhone físico (o e2e usa toques sintéticos no Chromium).

## Maestro · Criação: exportar e compartilhar o Fluxo (F6, 30/10/2026)

Migração `0032_fluxo_links` do Maestro (só no banco de teste; produção pede o deploy autorizado).

| Verificação                                                                                                                                                                                                                                                                                      | Comando                                                                      | Resultado                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Puro (Markdown/JSON com e sem imagens pelo link, validade, PIN, nomes, zip), banco (RLS, duas organizações, papéis, hashes fora do alcance, revogar para sempre, 10 vivos, auditoria, só o título), rotas (.md, .json, imagem, PIN, vencido, revogado, limite, noindex, links da equipe, pacote) | `cd products/maestro && npx tsx --test tests/links-fluxo.test.mts`           | **14/14**                                                                         |
| Acesso por cliente: `fluxo_links` com `_cliente`, só administração e gestão leem                                                                                                                                                                                                                 | `npx tsx --test tests/acesso-cliente.test.mts`                               | **8/8**                                                                           |
| E2E: menu, Copiar para IA, link com PIN num navegador limpo, revogar, pacote, JSON, mandar para um card; leitura; iPhone (folha e página do link, claro e escuro)                                                                                                                                | `E2E_DB_SUFIXO=f6 npx playwright test e2e/criacao-exportar.spec.ts`          | **4/4**                                                                           |
| App de computador: `/f` abre no navegador                                                                                                                                                                                                                                                        | `cd products/maestro/desktop && node --test test/regras.test.mjs`            | ok                                                                                |
| Maestro inteiro                                                                                                                                                                                                                                                                                  | `npm run lint`, `format:check`, `typecheck`, `npm test`, `build`, `test:e2e` | ok · ok · ok · **499/499** · ok · **144 ok** (34 pulados; com `E2E_DB_SUFIXO=f6`) |
| Raiz                                                                                                                                                                                                                                                                                             | `npm run lint`, `format:check`, `typecheck`                                  | ok · ok · ok                                                                      |
| Segredos                                                                                                                                                                                                                                                                                         | `node scripts/scan-secrets.mjs`                                              | nenhum                                                                            |

Na rodada inteira, os 2 testes de `criacao-fluxo.spec.ts` caíram porque o e2e novo usava a mesma organização (a lista
não vinha vazia); o e2e da exportação ganhou organização própria (`e2e/preparar.ts`) e os dois specs passaram juntos
(7/7). Não validado: imprimir para PDF de verdade no Safari do iPhone (o e2e confere a página e o CSS, não o PDF gerado) e uma
IA de verdade lendo `/f/<token>.md`.

## Maestro · Criação: o cliente aprova o roteiro (F7, 30/10/2026)

Migração `0033_roteiro_na_revisao` do Maestro (só no banco de teste; produção pede o deploy autorizado). Nenhum e-mail
sai: o link é copiado pela equipe.

| Verificação                                                                                                                                                                                                                                                                                                                                        | Comando                                                                                        | Resultado                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Vista do cliente (pura), mandar (papéis, sem card, lote e link nascem, idempotente), `/a` sem nota/plano/observação/dica/ids, comentar por bloco (só blocos do cliente), token errado, outra origem, limite 60/h, pedir ajuste, editor (por bloco e versão, resolver), versão nova, auditoria, duas organizações, acesso por cliente, banco direto | `cd products/maestro && TEST_DB_SUFIXO=f7 npx tsx --test tests/roteiro-cliente.test.mts`       | **15/15**                                                                                 |
| E2E: Enviar › Para o cliente aprovar → `/a` num navegador limpo → comentar num trecho → pedir ajuste → v2 → aprovar; leitura sem Enviar e 403; iPhone (folha do topo, `/a` sem corte claro e escuro, editor)                                                                                                                                       | `E2E_DB_SUFIXO=f7 E2E_PORT=6717 … npx playwright test e2e/criacao-cliente.spec.ts`             | **3/3** (computador e iPhone)                                                             |
| Maestro inteiro                                                                                                                                                                                                                                                                                                                                    | `npm run lint`, `format:check`, `typecheck`, `TEST_DB_SUFIXO=f7 npm test`, `build`, `test:e2e` | ok · ok · ok · **590/590** · ok · **181 passaram**, 53 pulados, 1 falha de tempo (abaixo) |
| Raiz                                                                                                                                                                                                                                                                                                                                               | `npm run lint`, `format:check`, `typecheck`                                                    | ok · ok · ok                                                                              |
| Segredos                                                                                                                                                                                                                                                                                                                                           | `node scripts/scan-secrets.mjs`                                                                | nenhum                                                                                    |

Na rodada inteira (carga ~5), `arrastar.spec.ts` "Mover para…" no Safari do computador não viu quadro andando; sozinho
passou (4/4). O menu do Enviar ganhou "Para o cliente aprovar" e o `criacao-enviar.spec.ts` foi ajustado. Não validado:
Safari de um iPhone de verdade no `/a` (o e2e do roteiro roda no Chromium com toque).

## Maestro · Criação: Roteiro e Fluxo num produto só (30/10/2026)

Integração das frentes F1–F3 (Roteiro) e F1+F4–F6 (Fluxo) sobre a `main`: seletor Roteiros · Fluxos nas duas rotas
irmãs, um bloco "Criação" na ficha do card (roteiros e fluxos), permissões do Fluxo pela capacidade `criacao`, e o
proxy do e2e (nada sai para a internet) junto com as esperas determinísticas da `main`. Migrações do Maestro no
journal: 0027, 0030, 0031, 0032 (`when` únicos).

| Verificação                                                                                  | Comando                                                                                 | Resultado                                             |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Maestro inteiro                                                                              | `npm run lint`, `format:check`, `typecheck`, `TEST_DB_SUFIXO=criacao npm test`, `build` | ok · ok · ok · **575/575** · ok                       |
| Políticas da 0031/0032 com os papéis da capacidade `criacao`; migrador com migração atrasada | `npx tsx --test tests/fluxo.test.mts tests/migrador.test.mts`                           | ok                                                    |
| E2E inteiro (computador, iPhone, iPhone Safari, computador Safari)                           | `E2E_DB_SUFIXO=criacao E2E_PORT=9917 … npm run test:e2e`                                | **179 passaram**, 50 pulados (por aparelho), 0 falhas |
| Raiz                                                                                         | `npm run lint`, `format:check`, `typecheck`, `npm test`                                 | ok · ok · ok · **386/386**                            |
| Contratos                                                                                    | `npm run contracts:export`                                                              | nenhum arquivo mudou                                  |
| Segredos                                                                                     | `node scripts/scan-secrets.mjs`                                                         | nenhum                                                |

Na primeira rodada inteira, o teste do Fluxo no iPhone falhou 3 de 3 (não era lentidão): a contagem já via o nó dentro
do trecho que o streaming ainda não revelou (`<div hidden id="S:0">`) e a medida vinha vazia. O `caixa()` do spec
agora espera o nó visível. Na raiz, `custos.test.ts` caiu uma vez (assinante de outro arquivo no mesmo banco, em
paralelo); passou sozinho e na rodada seguinte inteira. Tour em vídeo (computador 1440×900 e iPhone 393×852) gravado
com o mesmo servidor do e2e. Não validado: Safari de um iPhone de verdade; a miniatura do YouTube (o e2e não sai para a
internet).

## SOBEDESCE: Atualizações quando o Absolute ZRO cuida do app (29/10/2026)

- Relato do titular: o app no build 1034 dizia "Você está na versão mais nova" com o 1042 publicado. Instalado pela
  central do Absolute ZRO, o SOBEDESCE não pergunta ao site (quem atualiza é a central, `src/gerenciado.js`) e a tela
  caía no texto de "em dia". Agora diz que quem atualiza é o Absolute ZRO e some o "Procurar atualização" (que não
  procurava nada nesse caso). O catálogo da central (`/api/v1/desktop/apps`) já oferecia o 1042.
- E a central também não oferecia: ela só comparava o build com o que ela mesma tinha instalado (`registro`), e o
  SOBEDESCE instalado pelo Terminal, pelo .dmg ou pela atualização própria dele não tem registro; como a versão é sempre
  0.1.0, ninguém atualizava. Agora a central lê o build de dentro do app instalado (`build-info.json` no `app.asar`,
  `lerBuildInstalado` em `apps/hub-desktop/desktop/central.cjs`) e compara com o catálogo. `apps/hub-desktop`:
  `npm test` 61/61 (caso b1034 → b1042 sem registro, build do app vale mais que o registro, Synquei em
  `desktop/build-info.json`, versão de desenvolvimento sem build).
- Não validado: a leitura do `app.asar` de outro app pela central empacotada num Mac e num Windows reais.

## Conversão de mídia como setor próprio (29/10/2026)

Só documentos ([ADR 0030](decisions/0030-relay-conversao.md), PRD §2, roadmap): nenhum código mudou. Mapa feito
lendo o código de `products/finishing`, `products/sobedesce`, `products/ai-edit`, `products/nossom`,
`products/synquei` e `products/maestro`. Synquei exporta projeto (XML, OTIO, EDL), não mídia; Maestro, TPeasy, Carro
do Freela e HUB não convertem. `npm run format:check` e `node scripts/scan-secrets.mjs` ok.

## Relay: plataforma de conversão, SOBEDESCE e HUB (29/10/2026)

- `products/relay`: `npm test` **38/38** (núcleo, presets da pessoa, ffmpeg de verdade, Chromium de verdade com
  conversão real, Lanczos conferido com o ffmpeg em SSIM > 0,97 e sem virar, celular girado igual à rotação do ffmpeg,
  tamanho exato cabendo, presets da pessoa ponta a ponta, nenhuma página rolando para o lado em 375 px, cópias nas
  outras plataformas).
- Qualidade: `npm run qualidade` com 4 masters ProRes contra presets x264 de referência e a referência no mesmo tamanho
  ([QUALIDADE](../products/relay/docs/QUALIDADE.md)). No computador, empate (0,9469 × 0,9468 no grão; 0,9927 × 0,9923
  no movimento; 0,9962 × 0,9966 na limpa; 0,9779 × 0,9798 no 4K → 1080p). No navegador do Linux (OpenH264) o x264
  guarda mais no mesmo tamanho. Três correções de cor e a escala na placa saíram da medição.
- SOBEDESCE: `npm run test:fast` 780 ok; 2 falhas na primeira rodada: a versão do app de celular (subiu com o cache:
  2.8.54 / v69, corrigido, 9/9) e o limitador de metadados (tempo, 2,002 × 2; passa sozinho, sem relação com o Relay).
  `test/relay.test.js` 8/8 e `test/relay-celular.test.js` 1/1 (Chromium com a CSP do app, Drive por pedaços, AAC).
  Site: `npm run lint`, `typecheck` e `npm test` (291) ok.
- HUB: migration `0031_relay.sql`; `npm test` 328 com 2 falhas que contavam os produtos dos planos e as etapas do
  projeto, atualizadas (billing e core 41/41). Depois de juntar o `main`: `format:check`, `lint`, `typecheck`, `npm test`
  **340/340** e `build` ok; e2e 38/41: o Ciclo do O passa a ter 9 etapas (teste atualizado, Relay indisponível); os
  dois testes de WebKit do esqueleto (vindos do `main`) não rodam aqui (WebKit não instalado neste ambiente); o
  "Escolha seu @" do SSO do Carro falhou uma vez e passa sozinho (tempo).

## Relay: comparativo interno, laboratório de aparelhos e Máxima qualidade (29/10/2026)

- `products/relay`: `npm test` **45/45** (link do Máxima qualidade com acentos e limite de 8 destinos; publicação:
  produção fechada sem o laboratório, prévia com ele; laboratório no Chromium gerando, codificando e medindo).
- Laboratório no Chromium deste ambiente (OpenH264, sem placa): 0,0116 de SSIM abaixo da referência x264 no mesmo
  bitrate, em média (6 medidas, 56 s). Falta o Mac, o iPhone e o Windows de verdade.
- SOBEDESCE: `test/relay.test.js` **12/12**: o link montado pelo Relay é o que o app aceita (e links tortos viram
  nada), nome livre sem gravar por cima, conversão local de verdade (WhatsApp 1280×720 e MP3 da pessoa ao lado do
  original, MD5 do original igual, nenhum parcial sobrando) e a rota `/api/relay/local` recusando caminho relativo,
  extensão errada e destino inventado.

## Relay liberado (29/10/2026)

- Menções a outro conversor fora do repositório inteiro (Revela, ADR 0015, Synquei, laboratório); no Synquei, a regra
  que separa arquivo de software de arquivo de câmera passou a reconhecer a versão no campo do fabricante (138/138).
- Migration `0032_relay_aberto.sql`: `npm test` **340/340** (planos, etapas e acessos com o Relay aberto); e2e do HUB
  16/16 (Ciclo do O com o Relay "Bloqueado por assinatura" sem plano, 4 acessos lançados no plano grátis).
- Nenhum e-mail: o HUB só envia e-mail de login e de conta (`packages/auth/src/email.ts`); abrir produto e gate não
  manda aviso.
- Produção (`relay.absolutezro.com`, deploy `dpl_BSNVYA6bT95oHzNLh8JsrA6ivrhU`, commit `7d408bd`, `RELEASE=released`):
  `/` e `/converter` 200 com o site de verdade, `/laboratorio` e `/qualidade` 404, `vendor/` servido. Chromium de
  verdade contra a produção: um ProRes 1080p de 2 s virou "YouTube 1080p" (MP4, 3,9 MB), sem erro no console.
- O deploy só de variável (mesmo commit da prévia) é cancelado pelo Ignored Build Step do projeto (`git diff` contra o
  commit anterior). Contorno usado: a checagem foi trocada por `exit 1` só durante esse deploy e voltou igual depois.

## Relay: presets de TV e leitura com plano B (29/10/2026)

- Gravação de tela do Mac recusada ("Este navegador não lê H.264"): no Chromium do Linux, Retina 3024×1964, 5K, P3,
  região e 4:4:4 abrem; a causa no aparelho do titular ainda não foi vista. `test/tela.test.js` simula um navegador que
  recusa o nível 5.2: o Relay acha outra forma (nível menor), converte 1920×1200 a 60 fps para YouTube 1080p
  (1728×1080, 60 quadros, SSIM > 0,9). Navegador que não lê H.264 nenhum: a mensagem mostra
  `avc1.640034 · 1920×1200 · <navegador>`.
- O preset Proxy para edição estava sem `id` desde o primeiro commit; corrigido e conferido em `test/plano.test.js`.
- 23 destinos (Smart TV, Smart TV 4K, LinkedIn, X, Slides, Vídeo de fundo novos), cópias no SOBEDESCE iguais
  (`test/relay.test.js`), app do celular 2.8.55 / v70.

## Relay: editor completo e cor da Revela (30/10/2026)

- `products/relay`: `npm test` com os testes novos `editor.test.js` (cadência exata, recorte/giro, tela fixa, CBR, RF,
  trecho, volume, computador, receita de cor, fichas da versão 1), `cor.test.js` (conta da placa × Revela em todas as
  câmeras < 1,2/255; LUT do ffmpeg; S-Log3 de verdade no ffmpeg ≤ 3/255) e `editor-tela.test.js` no Chromium (30 fps →
  23,976 com 48 quadros; recorte+giro+espelho SSIM > 0,95 contra o ffmpeg; trecho de 2 s com +6 dB medido; cor na placa
  ≤ 4/255 e de ponta a ponta cinzas ≤ 2, cores ≤ 7; o editor salva 23,976, trecho e a receita).
- Cópias conferidas: `src/revela/` = `products/finishing/src/cor/`; SOBEDESCE com o núcleo novo (2.8.56 / v71).
- Medidas e limites em `products/relay/docs/QUALIDADE.md` ("Cor da Revela").

## NOSSOM: Isolar voz no nível do Voice Isolator (29/10/2026)

- Nova cadeia no worker de GPU (`voice-isolator-v1`: Mel-Band RoFormer + MossFormer2 SE 48K, mono 48 kHz;
  `roformer-vocals-v1`: vocal estéreo 44,1 kHz), pesos com revisão e SHA-256 fixos, `weights_only=True`.
- Benchmark em CPU com fala real em português e ruído/música CC BY: SI-SDR médio 15,46 dB contra 11,13
  (DeepFilterNet3, motor local) e 9,96 (HTDemucs, Isolar voz anterior); melhor também em PESQ, ESTOI e DNSMOS. O
  código de produção reproduz o benchmark (14,72 × 14,74 dB). Detalhes em `products/nossom/docs/validation.md`.
- `products/nossom`: `npm test` 76/76, `npm run test:e2e` 75 + 1 pulado, `typecheck`, `format:check` e `build` ok;
  testes Python do worker no CI.
- Não validado: imagem na GPU, custo por minuto, cold start, audição cega. Sem deploy.
- Vídeo (29/10/2026): NOSSOM importa vídeo até 2 GB sem copiar para a memória, envia à GPU só FLAC do som e devolve
  o vídeo original com o som novo (vídeo copiado, AAC). E2E com MP4 sintético; ffprobe confere H.264 + AAC de 4,000 s.
  Build da imagem do worker passou com inferência real em CPU; publicação movida para `absolutezro-nossom-worker`.
- Legendas e Remixar no NOSSOM (29/10/2026): Whisper turbo com WER 4,1% em 3 min de português (CPU) e janelas
  cortadas em pausas depois de achar estouro de memória no modo em blocos; remixer com cinco faixas que somam o
  original (erro 1e-7). `npm test` 115/115, e2e 61 + 26 pulados.

## Maestro: quem vê o quê (29/10/2026, [ADR 0031](decisions/0031-maestro-acesso-por-area.md))

Seis áreas sensíveis com padrão por papel e ajuste da Administração (`products/maestro/drizzle/0027_acessos.sql`, mapa
em `products/maestro/docs/permissoes.md`). Local, Postgres e Chromium/WebKit desta máquina.

| O quê                           | Como                                                         | Resultado                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitários do Maestro            | `cd products/maestro && npm test`                            | **404/404** (27 novos em `acessos.test.mts`; testes antigos ajustados ao padrão novo)                                                                                |
| Padrão igual no TS e no banco   | `acessos.test.mts`                                           | `PADRAO` = `maestro.area_padrao`; `CRIACAO_PADRAO` = `maestro.criacao_padrao`                                                                                        |
| Cada área, cada pessoa          | `acessos.test.mts` (asUser direto nas tabelas)               | sem a área: 0 linhas em toda tabela dela; com a área: as linhas; gestão sem Financeiro                                                                               |
| Máscaras e gatilhos             | `acessos.test.mts`                                           | freela, escala, kit, inventário, pedido, Hoje, Pessoas, tabela e timbrado vazios sem a área; quem não vê grava e o valor fica                                        |
| Quem muda                       | `acessos.test.mts`                                           | só a Administração (nem direto na tabela), auditado com antes/depois; sessão traz o acesso                                                                           |
| A Z                             | `acessos.test.mts` (rota com o pedido assinado)              | `dinheiro` null sem Financeiro (gestão inclusive); `orcamentos_aguardando` null sem a área                                                                           |
| Tela                            | `npm run build && E2E_DB_SUFIXO=acessos npx playwright test` | **135 ok, 21 pulados (por desenho), 0 falhas**; `acessos.spec.ts` 6/6 (computador e iPhone)                                                                          |
| Lint, Prettier, tipos (Maestro) | `npm run lint`, `format:check`, `typecheck`                  | ok · ok · ok                                                                                                                                                         |
| Raiz                            | `npm run lint`, `format:check`                               | ok · ok (o `typecheck` da raiz acusa erros em pacotes do HUB não tocados aqui: `node_modules` da cópia principal, desatualizado; não reinstalado por falta de disco) |
| Segredos                        | `node scripts/scan-secrets.mjs`                              | nenhum                                                                                                                                                               |

Não conferido aqui: a migração `0027` no banco de produção (deploy só com autorização) e a tela com dados reais.

## Maestro: arrastar o card no computador sem "travadinha" (29/10/2026)

Vídeo do titular (Safari do Mac, tema escuro, maestro.absolutezro.com, 5,8 s): card arrastado de Revisão para Em
aprovação e de volta. Quadro a quadro (ffmpeg, linha do tempo de 60 fps):

- **Parado sobre o destino** (0,83–1,17 s): o destino piscava a ~30 Hz. Em quadros alternados a linha de soltar sumia,
  o conteúdo de Em aprovação descia e subia ~10 px e o encaixe de origem ganhava contorno; em 1,12–1,13 s a coluna de
  destino chegou a esconder o cabeçalho. Na volta, o destaque da coluna também alternava.
- **Ao soltar** (1,18 s): o card sumia por 2 quadros e entrava cortado pela borda da coluna até 1,32 s ("…la semana",
  "ories da semana"); na volta (2,38–2,52 s), entrava pela direita, cortado e meio transparente.
- **Causas** no código: (1) no Safari, `dragleave` chega sem `relatedTarget` a cada filho e o Quadro apagava o alvo,
  redesenhava tudo e o recolocava no `dragover` seguinte (linha de soltar no DOM, ~11 px de layout por troca); (2) cada
  troca de alvo desenhava as 8 colunas (card sem `memo`) e o FLIP media todos os cards, inclusive com o deslize ainda
  andando (`composite: "add"` somava de novo), e a mira lia retângulos com esse transform; (3) ao trocar de coluna o
  card é remontado e o CSS repetia a entrada (`q-assenta`, começa com `opacity: 0`), o FLIP saía do lugar de origem e
  `.q-col { overflow: hidden }` cortava; (4) a pergunta de 5 s agendava render sempre (colunas) e trazia de volta os
  próprios cards; a página renovada depois de gravar redesenhava todos os cards.
- **Correção** (`src/components/quadro/arrastar.ts`, `fantasma.ts`, `flip.ts`, `quadro.tsx`, `estado.ts`, CSS): o card
  arrasta com o ponteiro como no celular (fantasma com camada própria, só `translate`; espaço aberto por `transform`;
  coluna de destino cresce uma vez por coluna; tudo medido de uma vez ao erguer e nada lido no meio do arrasto); pousa
  onde vai ficar e só então o React grava, com o FLIP fixado; o FLIP mede pelo lugar (sem transform do próprio card),
  não repete a entrada de quem já estava na tela e passa por cima das colunas (`z-index` durante o deslize, coluna sem
  corte). Esc, soltar fora e perder a janela devolvem; Entregue recebe no topo; "reduzir movimento" vai direto. O
  fantasma (celular inclusive) vai no `<body>`: no `.shell` o primeiro quadro custava a página inteira. A pergunta de
  5 s e a página renovada não redesenham mais o Quadro à toa. Reordenar colunas pelo cabeçalho também não pisca mais.
  O clique logo depois de abrir a página não é mais engolido (o "engolir" começava em 0 ms).
- **Medidas** (`e2e/arrastar.spec.ts`, 1440×900, escuro, 32 cards; máquina dividida, carga ~18 em 4 núcleos; a luz
  ambiente apagada nas medidas porque o headless não compõe na GPU). Antes → depois, Chromium: renders do React com o
  mouse andando 3–4 → **0**; mudanças no DOM 6–8 → **0**; layout 1 → **0**; card invisível depois de soltar 7–8 quadros
  → **0** (sempre inteiro); maior pulo ao soltar 290–332 px → **8–14 px** (menor que o caminho de 24 px até o lugar);
  quadro p50 31 → **17 ms**, p95 59–63 → **34–54 ms**. WebKit: renders 1–2 → **0**, DOM 4 → **0**, card invisível →
  **0**, pulo 217 px → **10–21 px**. Custo de erguer no WebKit: 50–85 ms → **2–7 ms** de JavaScript; primeiro quadro
  depois de erguer ~0,5–0,9 s → ~0,06–0,09 s (o headless sem GPU exagera a pintura; no Mac é composição). Depois de
  assentar: 1–2 renders (a resposta do banco e a página renovada) e nenhum card desliza nelas nem na volta de 5 s.
- Testes: `e2e/arrastar.spec.ts` (computador e o novo projeto `computador-safari`, WebKit): sem render, DOM e layout
  com o mouse andando, destino sem piscar, card sempre à vista e sem pulo ao soltar, nada desliza depois; clique abre a
  ficha, reordenar na coluna, Esc e soltar fora sem gravar; Entregue no topo com reduzir movimento; "Mover para…"
  desliza por cima das colunas, inteiro. `gestos.spec.ts` (iPhone, Chromium e WebKit), `quadro.spec.ts`,
  `colunas.spec.ts`, `transicao.spec.ts`, `visual.spec.ts` e `sem-corte.spec.ts` passam. `E2E_DB_SUFIXO` separa o
  banco do e2e quando duas cópias rodam juntas; `E2E_VIDEO=1` grava cada teste.
- Não validado: Safari de um Mac e iPhone de verdade (sem deploy).

## Maestro: barra de baixo com 4 abas e a barra de cima com o Set (30/10/2026)

- Barra de baixo do iPhone: uma coluna por aba (`grid-auto-flow: column`), as 4 dividem a largura toda, sem a 5ª vazia
  (`transicao.spec.ts`, Chromium e WebKit). Barra de cima: com o selo Demonstração, a Z, a pílula do Set, o tema e a
  conta, a 393 px a conta saía 17 px da tela (a pílula veio com o Set); agora quem cede é o selo (reticências).
- `transicao.spec.ts` e `gestos.spec.ts` não esperam mais `networkidle`: o `<zro-set>` não lê o corpo do 401 e o
  Chromium deixa o pedido em aberto (CDP: resposta e 87 bytes recebidos, sem `loadingFinished`). Esperam a rede parada
  sem o Set e a ordem gravada no banco. Resultado: transicao, gestos, arrastar, quadro, contrato, sem-corte e set
  **61/61** (18 pulados por projeto); `npm test` **430/430**; lint, Prettier, tipos e build ok (Maestro e raiz);
  `scan-secrets` sem segredo. Com carga ~16 em 4 núcleos, "segurar na borda" (WebKit) caiu 1 em 3: passou mais de 1 s
  entre a troca e o próximo movimento do teste, e a borda já passava para a coluna seguinte (o código da borda não mudou).

## Laboratório da Z (30/10/2026, [ADR 0033](decisions/0033-laboratorio-da-z.md))

Console › Laboratório da Z (só admin), migração `0036_laboratorio_z.sql`. Local, Postgres e Chromium desta máquina;
Claude e ElevenLabs **falsos** (`tests/fixtures/z-lab-falso.ts`), nenhuma chamada real.

| O quê                                | Como                                                                                  | Resultado                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anexos, custos, pedidos, voz, PCM    | `tests/integration/z-lab-unidade.test.ts`                                             | 18/18: tipo pelo conteúdo, Office por dentro, bomba de zip, senha, XML sem entidade externa, conta de custo, tom, filtro de voz, frases e PCM    |
| Quem pode e RLS                      | `tests/integration/z-lab.test.ts`                                                     | não admin e suporte: 403 em todas as funções; `asUser` direto: 0 linhas nas 7 tabelas, insert 42501, update 0 linhas                             |
| Teto, uso, versões, publicação       | `tests/integration/z-lab.test.ts`                                                     | sem teto = bloqueado; uso idempotente; passou = 429; versão imutável; restaurar; publicar só com a trava e confirmação; trava desligada = padrão |
| Recursos por plano e auditoria       | `tests/integration/z-lab.test.ts`                                                     | tudo desligado; vale só para o plano da lista; cada mudança em `audit_logs` (`z_lab.*`)                                                          |
| Rotas documentadas                   | `tests/integration/openapi.test.ts`                                                   | as 20 rotas `/api/v1/admin/z-lab/*` no OpenAPI                                                                                                   |
| Tela (e2e)                           | `npx playwright test tests/e2e/z-lab.spec.ts`                                         | 2/2: 404/403 em tudo para cliente e suporte; teto, streaming, ditado, anexos (Word, PNG, WAV), comparar, voz ao vivo, Configurar, axe, Custos    |
| Suíte inteira                        | `npm test` · `npm run test:e2e`                                                       | 383/383 · 48 ok + 2 por tempo da máquina carregada (`admin.spec` e `esqueleto` WebKit), que passam sozinhos                                      |
| Lint, Prettier, tipos, build, chaves | `npm run lint`, `format:check`, `typecheck`, `build`, `node scripts/scan-secrets.mjs` | ok · ok · ok · ok · nenhum segredo                                                                                                               |

**Voz por frase e iPhone (30/10/2026).** `tests/integration/z-lab-escuta.test.ts` 6/6 (ElevenLabs falsa com 401 no
token: `aoVivo` falso, sem lançar, log sem a chave; transcrição por frase funciona; transcrição também recusada nomeia
`speech_to_text`; VAD: frase com antes e fim aparado, estalo ignorado, corte aos 30 s). `npx playwright test
tests/e2e/z-lab-voz-celular.spec.ts` 3/3: token recusado → nota calma, a frase do microfone (WAV falso do Chromium) é
transcrita pelo HUB e a Z responde, tempos e gasto de transcrição; layout em 375/393/430 px e deitado (parada, ouvindo,
erro) sem rolagem lateral e com os controles na tela, no Chromium e no WebKit. O mesmo e2e com o CSS anterior falha nos
dois navegadores ("o diálogo rola de lado"). `tests/e2e/z-lab.spec.ts` segue 2/2; `npm test` 392/392; lint, Prettier,
tipos, build e `scan-secrets` ok.

Não conferido aqui: voz, transcrição, Voice Design e o Claude com as chaves reais (a latência de verdade e a qualidade
da voz); microfone de verdade e o eco do alto-falante no barge-in; vídeos grandes no navegador; a migração `0036` em
produção (deploy só com autorização).

**Aprender conversando (30/10/2026, ADR 0033 § Aprender conversando).** Banco `zro_aprender_test` e
`zro_aprender_e2e_test` (portas 3271–3274), Claude e ElevenLabs falsos (a Z falsa chama `propor_aprendizado` para uma
correção e `confirmar_aprendizado` para "guarda e…").

| O quê                                | Como                                                                                    | Resultado                                                                                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ferramentas, trava, repetido, cartão | `tests/integration/z-aprendizados-unidade.test.ts`                                      | 12/12: `strict` sem campo opcional; entrada do modelo conferida; trava (regra, ação, confirmação, senha, inventar, fingir, outra conta); repetido; contradição; "sim/pode guardar/ignora"; bloco por último; limites; pedido |
| Quem pode, RLS, auditoria            | `tests/integration/z-lab.test.ts` (aprender conversando)                                | não admin e suporte: 403 em guardar, editar e remover; `asUser` direto: 0 linhas e update sem efeito no rascunho; cada gravação, edição, mudança de seção e remoção em `audit_logs`                                          |
| Confirmar, repetido, contradição     | `tests/integration/z-lab.test.ts`                                                       | sem `confirmar: true` = 422; toque duplo e outras palavras não duplicam; a correção nova fica no lugar da contraditória; trava = 403; 41º = 409; Configurar salvando não apaga                                               |
| Rascunho × versão × clientes         | `tests/integration/z-lab.test.ts`                                                       | a versão congela os aprendizados (gatilho imutável); clientes nulos até publicar; publicada traz o bloco; restaurar traz os da versão                                                                                        |
| Turno com o Claude falso             | `tests/integration/z-lab.test.ts` (aprender no turno)                                   | correção → cartão, nada salvo, uso das duas voltas; "pode guardar" decidido antes do modelo e já no sistema; próxima resposta segue; "ignora"; frase longa pela ferramenta; o modelo não confirma sozinho; trava sem cartão  |
| Tela (e2e)                           | `npx playwright test tests/e2e/z-lab-aprender.spec.ts`                                  | 1/1: correção → cartão → Guardar no toque → próxima resposta segue; na voz, cartão → "pode guardar" dito → guardado; Configurar › Aprendizados com origem; mover; salvar versão com os dois; remover; axe                    |
| Rotas novas                          | `tests/e2e/z-lab.spec.ts` e `tests/integration/openapi.test.ts`                         | 403 para cliente e suporte em `POST /aprendizados`, `PATCH`/`DELETE /aprendizados/{id}`; as 22 rotas `/api/v1/admin/z-lab/*` no OpenAPI                                                                                      |
| Suíte                                | `npm test` · lint, Prettier, tipos, build, `node scripts/scan-secrets.mjs` · e2e do lab | 412/412 · ok · ok · ok · ok · nenhum segredo · `z-lab*.spec.ts` 6/6 (z-lab.spec agora aceita o número da versão de quem rodou antes)                                                                                         |

`npm run test:e2e` inteiro: 52/55; os 3 que caíram (`home-celular` WebKit, `hub` plano grátis, `sso` app da
família) são de outras telas e passam sozinhos (4/4), tempo da máquina carregada.

Fotos do cartão na conversa, guardado, na voz e da seção no Configurar (393 e 1440 px, claro e escuro): rodar o e2e com
`ZLAB_FOTOS=<pasta>`. Não conferido aqui: o modelo real reconhecendo correções (a Z falsa decide por palavra-chave) e a
transcrição real de "pode guardar".

## Relay: login único e Set ligados na produção (30/10/2026)

- Cliente `relay-web` cadastrado pelo titular no console do HUB (Apps → Login único): confidencial, app da família,
  produto `relay`, retorno só em `https://relay.absolutezro.com/api/zro/callback`, escopos da família com `zro.set`.
  Canal `sso` do Relay aberto (Lançamento); computador, download e API seguem fechados.
- `ZRO_CLIENT_ID` e `ZRO_CLIENT_SECRET` (sensível) só na produção do projeto Vercel `relay`; o segredo conferido contra o
  sha256 do banco antes de gravar. Deploy de `e40b627` (main): `/api/zro/eu` responde `configurado: true` e
  `/api/zro/entrar` leva a `absolutezro.com/oauth/authorize` com `client_id=relay-web`, que segue para o login (sem
  `invalid_client`). Falta o titular entrar uma vez e ver o Set no topo.

## Relay: painel da conta e Sair (30/10/2026)

- `/painel` (`painel.html`, `app/painel.js`): fora da conta pede "Entrar" e volta para ele; dentro, olá com a foto da
  conta, três números, recentes, projetos e meus presets. Histórico e projetos no IndexedDB do aparelho, por conta
  (`pessoa.id` = resumo do sub, conferido no `set.test.js`: nunca o sub nem o e-mail).
- Topo de todas as páginas com a conta: "Painel", a foto (iniciais sem foto) com o menu Painel, Converter, Sua conta
  Absolute ZRO e **Sair** (`POST /api/zro/sair`, volta à inicial, que mostra "Entrar"). Login sem `volta` (o "Abrir" do
  HUB) e o "Entrar" da inicial caem no painel.
- `test/painel.test.js` no Chromium: cria projeto com dois destinos, abre o conversor por ele, converte um MP4 nos dois,
  as duas saídas aparecem nos recentes e no projeto, outra conta no mesmo aparelho não vê nada, Sair encerra; 375 px sem
  rolar para o lado. Relay `npm test`: 92/92. Lint, Prettier e `scan-secrets`: ok.
- Não conferido aqui: o painel na produção com a conta do titular (depende do merge e do deploy pela main).

## Relay: painel na conta e equipe (30/10/2026)

- Schema `relay` (`products/relay/db/migrations/0000_fundacao.sql`): `projetos`, `presets`, `conversoes` com RLS
  forçado; papel `relay_app` sem login, assumido por `comoPessoa` (`api/_banco.js`). Migrador próprio
  (`scripts/migrar.mjs`) recusa editar migração aplicada.
- `test/nuvem.test.js` num Postgres 16 de verdade (cluster temporário): pessoa B não vê, não grava em nome de A nem apaga
  o de A; sem pessoa na transação, nada passa; equipe vê só o liberado, só na mesma organização, sem mudar nem apagar;
  conversão em projeto da equipe pode, de outra organização não; projeto apagado deixa as conversões sem projeto; preset
  da equipe exige organização. Rota: 401 sem sessão, 403 de outra origem e no id de outra pessoa, lote sem repetir,
  corte em 500, ficha validada pelo conversor, sem `RELAY_DATABASE_URL` responde `nuvem: false`.
- Chromium com o banco: o histórico e o preset de antes da nuvem sobem; o segundo aparelho da mesma pessoa vê tudo; a
  colega da mesma organização vê o projeto e o preset liberados como "Da equipe" (só leitura) e não vê o histórico;
  apagar num aparelho some no outro. Relay `npm test`: 101/101.
- Produção (autorizado pelo titular, 30/10/2026), no Supabase AbsoluteZRO-SP: papel `relay` (login, dono do schema,
  limite de 20 conexões), `relay_app` (sem login), schema `relay authorization relay` e `0000_fundacao.sql` aplicada
  como `relay` (registrada em `relay.migracoes` com o sha256 do arquivo). Conferido: as três tabelas são do `relay`, com
  RLS forçado; `anon` e `authenticated` não leem nada; `relay_app` lê. `RELAY_DATABASE_URL` (sensível, só produção do
  projeto Vercel `relay`, pooler de transação). A migração perdeu o `create schema if not exists` antes de ir para a
  produção: o papel `relay` não cria schema no banco (o migrador só cria quando falta, no Postgres local).

## Maestro · Criação: apagar fácil, com Desfazer (30/10/2026)

Deslizar/segurar no iPhone, "•••"/botão direito no computador, lixeira com Restaurar e Apagar de vez nas listas de
Roteiros e Fluxos (`components/criacao/lixeira.tsx`, `lib/criacao/lixeira.ts`, `app/lixeira.css`).

| Verificação                                                                                                                             | Comando                                                                              | Resultado                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lixeira pura e pelas rotas (pedido, aviso, deslizar, papéis, de vez só da lixeira e só admin/gestão, versão fica, auditoria, link vivo) | `TEST_DB_SUFIXO=lixo npx tsx --test tests/lixeira.test.mts`                          | **9/9**                                                                                                                                                  |
| Maestro inteiro                                                                                                                         | `npm run lint`, `format:check`, `typecheck`, `TEST_DB_SUFIXO=lixo npm test`, `build` | ok · ok · ok · **584/584** · ok                                                                                                                          |
| E2E do apagar (computador, iPhone Chromium com toque de verdade, iPhone Safari)                                                         | `E2E_DB_SUFIXO=lixo E2E_PORT=6917 … npx playwright test e2e/criacao-apagar.spec.ts`  | **17 passaram**, 16 pulados (por aparelho)                                                                                                               |
| E2E da Criação e nada cortado (lixeiras e a folha de segurar entraram no `sem-corte`)                                                   | `npx playwright test e2e/criacao-*.spec.ts e2e/sem-corte.spec.ts`                    | **43 passaram**, 35 pulados (por aparelho), 0 falhas (`sem-corte` com as duas lixeiras e a folha de segurar, Chromium e WebKit, 375/393, claro e escuro) |
| Raiz                                                                                                                                    | `npm run lint`, `format:check`, `typecheck`                                          | ok · ok · ok                                                                                                                                             |
| Segredos                                                                                                                                | `node scripts/scan-secrets.mjs`                                                      | nenhum                                                                                                                                                   |

Não validado: o dedo de verdade num iPhone (o e2e usa toques sintéticos no WebKit e o toque do CDP no Chromium) e a
vibração do segurar (`navigator.vibrate` não existe no Safari). Equipe não vê o aviso do link vivo (os links são só de
administração e gestão pelo RLS).

## Looks do Relay no Drive pelo SOBEDESCE (30/10/2026)

- Relay `test/pasta-looks.test.js`: leva o que só está no aparelho, traz o que só está na pasta, deixa o igual, mesmo
  nome com conteúdo diferente fica como está (avisa), arquivo que não é `.cube` 3D é recusado, nada é apagado; a
  segunda vez não muda nada. `test/painel.test.js` no Chromium: a seção Looks (com a Revela ligada), escolher a pasta,
  `1 levado para a pasta · 1 trazido da pasta.`, os dois arquivos de verdade na pasta e o link `sobedesce://looks`.
  O Chromium de teste cai ao guardar no IndexedDB uma pasta do armazenamento privado; o teste usa um invólucro dela
  (guardado na memória). No Chrome de verdade, a pasta escolhida fica guardada; não conferido aqui com um seletor real.
- SOBEDESCE `test/relay.test.js`: `sobedesce://looks` e `?trocar=1` aceitos; com caminho, outro parâmetro ou outro
  host, recusados. O Comparar com as duas pastas não foi exercitado com o app aberto (falta o desktop rodando aqui).

## NOSSOM: falhas da GPU com motivo e Safari guardando o áudio (30/10/2026)

- Primeiros pedidos reais no endpoint `nossom-v2` falharam em 50–166 ms, antes do processamento: o worker só dizia
  "restoration failed". Agora ele devolve e registra um motivo curto e sem URL (mensagens próprias, como
  `Source download failed (HTTP 400)`, ou só o tipo da exceção), e o site grava o motivo no log da Vercel. Causa
  provável da primeira falha: `NOSSOM_STORAGE_ORIGIN` apontando para o banco anterior ao AbsoluteZRO-SP.
- Safari recusava guardar o áudio importado ("Error preparing Blob/File data to be stored in object store"):
  `saveProject` tenta de novo com os bytes em memória e, se ainda falhar, explica (espaço em disco, arquivo só no iCloud).
- Worker `test_handler.py` 14/14 (motivo sem URL), NOSSOM `npm test` 115/115, `typecheck`, `lint`, `scan-secrets`.
- Não validado: o Safari do titular com o arquivo que falhou.
