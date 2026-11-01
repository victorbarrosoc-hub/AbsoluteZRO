# Maestro para computador

O Maestro (https://maestro.absolutezro.com/app) numa janela própria, no Mac e no Windows. Abre pelo Dock ou pela barra
de tarefas, continua logado, entra pelo login único da Absolute ZRO dentro da janela, mostra uma tela "Sem conexão"
local quando falta internet e avisa quando sai versão nova. Mesma moldura do Absolute ZRO para computador
(`apps/hub-desktop`), sem a central de apps: é só o Maestro, com o cronômetro na barra de menus (Mac) e na bandeja
(Windows) desde a 0.2.0.

## Novidades da 0.2.1: atualizações pela Absolute ZRO

Quando sai versão nova, o Maestro avisa (discreto, e uma notificação por versão) e a atualização é feita pela
central Absolute ZRO. O app não baixa mais instalador sozinho.

## Novidades da 0.2.0: o cronômetro na barra de menus e na bandeja

Pedido do titular (31/10/2026), sobre o cronômetro do site (`/api/tempo`, painel ⌥T, Pomodoro, tipos de vídeo):

- **Na barra de menus (Mac)**: o ícone de modelo do Maestro (o gesto da pauta numa cor só, `desktop/bandeja/`, gerado
  por `npm run icones:bandeja` a partir de `../public/brand/maestro-symbol.svg`) com o tempo ao lado ("01:11", o de
  hoje no card, como o título da aba do site); no foco e na pausa do Pomodoro, quanto falta. **Na bandeja (Windows)**:
  o ícone claro ou escuro conforme a barra de tarefas, com um ponto quando o cronômetro roda; a dica diz o tempo.
- **Menu ao clicar**: a tarefa, o cliente e o tempo; **Pausar**/**Retomar**; os últimos cards do dia (início rápido,
  um toque troca); **Pomodoro** (focar, pausa, encerrar a pausa); **Abrir painel** (abre ou traz a janela com o painel
  do cronômetro aberto); Ajustes (mostrar o tempo na barra, o atalho, abrir ao ligar o computador) e Sair.
- **A verdade é o servidor**: o app lê e muda o tempo pelas mesmas rotas do site (`GET`/`POST /api/tempo`), pelo fetch
  da sessão no processo principal (os cookies da janela, o Origin do Maestro; nenhum token vai à página). Conta do
  `inicio` gravado pelo banco + o desvio do relógio do servidor, a cada segundo; relê a cada 30 s, ao acordar ou
  desbloquear e logo depois de a janela mudar o tempo. **Funciona com a janela fechada**: fechar a janela não encerra
  (no Windows o app fica na bandeja e avisa na primeira vez); "Sair do Maestro" encerra.
- **Atalho global** ⌥⇧T / Alt+Shift+T pausa e retoma (com nada rodando, retoma o último card do dia). Troca nos
  Ajustes por ⌃⌥T, ⌥⇧Espaço ou nenhum (lista fechada; nunca o ⌥T do site, que segue abrindo o painel na janela). Ocupado
  por outro app, o menu diz e o anterior volta; sair libera.
- **Notificações do sistema** no fim do foco e da pausa do Pomodoro e no **parado**: o app mede a ociosidade do
  computador inteiro (`powerMonitor.getSystemIdleTime`, suspensão, tela bloqueada) com o limite do painel ("Perguntar
  parado após"); na volta pergunta "Manter ou descartar?" (no Mac, "Descartar" na própria notificação; no menu e no
  painel também). Descartar = a mesma `op: "parado"` do site.
- **Com o site, sem dobrar**: a página no app (`maestroDesktop.cronometro`, ponte estreita no `preload.cjs`) deixa o
  Pomodoro e o parado com o app e só mostra o que ele manda; as preferências do Pomodoro continuam no painel e vão para
  o app. No navegador, ou num app 0.1.0, o site segue sozinho como antes.
- Nada anima na barra (o número troca, sem efeito), então "reduzir movimento" não tem o que parar aqui.

| Arquivo                  | O que faz                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `desktop/tempo.cjs`      | contas (relógio, contagem), o estado do servidor conferido, o texto da barra, o menu, ajustes |
| `desktop/cronometro.cjs` | o controlador: rotas do site, relógio, revalidação, Pomodoro, parado, ponte com a página      |
| `desktop/pomodoro.cjs`   | o Pomodoro (as regras do site, no processo principal)                                         |
| `desktop/ocioso.cjs`     | o parado pelo sistema                                                                         |
| `desktop/atalho.cjs`     | o atalho global: registrar, trocar, ocupado, liberar                                          |

Pacote próprio (fora dos workspaces da raiz e do `package.json` do site do Maestro): `package.json` e
`package-lock.json` só com Electron e electron-builder.

```bash
cd products/maestro/desktop
npm ci
npm run desktop                 # abre o app (MAESTRO_URL=http://localhost:3000 e ZRO_HUB_URL=… apontam para locais)
npm test                        # regras, aviso de versão, cópias do hub-desktop, ícones, nomes do Release e o cronômetro
npm run smoke                   # "Sem conexão", regras e o cronômetro contra um Maestro falso local; escreve SMOKE OK (no Linux: xvfb-run -a … --no-sandbox)
npm run icones:bandeja          # o ícone da barra/bandeja (desktop/bandeja/) a partir do gesto oficial (no Linux: xvfb-run -a …)
npm run icones                  # build/ a partir de ../src/app/icon.svg (no Linux sem tela: xvfb-run -a npm run icones)
npm run compartilhado           # copia de apps/hub-desktop o que é igual (o teste confere)
npx electron-builder --linux dir   # empacota para conferir (o .dmg e o .exe saem no GitHub Actions)
```

## Como é feito

| Arquivo                                    | O que faz                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `desktop/main.cjs`                         | janela, menu em português, atalhos, sessão, deep link `maestro://`, aviso de versão e `--smoke` |
| `desktop/regras.cjs`                       | o que fica na janela, o que vai para o navegador, deep link e permissões (testado sem Electron) |
| `desktop/versao.cjs`                       | "Atualização disponível": `versao.json` pela Absolute ZRO, 15 s depois de abrir e a cada 6 h    |
| `desktop/central.cjs`                      | "Atualizar na Absolute ZRO": `absolutezro://apps/maestro?acao=atualizar`, sem central a página  |
| `desktop/paginas/`                         | barra de título do Mac (latão no carregando) e "Sem conexão" (HTML local, CSP fechada)          |
| `desktop/janela.cjs`, `preload-barra.cjs`… | **cópias idênticas** do `apps/hub-desktop` (`scripts/compartilhado.mjs`; o teste confere)       |
| `scripts/icones.mjs`                       | desenha o ícone oficial no Chromium e gera `.icns`, `.ico` e PNGs (código do hub-desktop)       |
| `scripts/release.mjs`                      | build-info, nome com build, SHA-256, `versao.json` e limpeza do Release                         |
| `electron-builder.yml`                     | DMG universal e NSIS (x64 e ARM), fusíveis, `maestro://`                                        |

- **Na janela:** o Maestro (`maestro.absolutezro.com`, menos as páginas do cliente) e, para o login único, só as telas
  de entrar da Absolute ZRO (`/oauth/authorize`, `/entrar`, `/entrar/google`, `/criar-conta`, `/esqueci-a-senha`,
  `/redefinir-senha`, `/confirmar-email`, `/boas-vindas`, `/em-desenvolvimento`) e `accounts.google.com`. O resto da
  Absolute ZRO (conta, planos, Conexões), os links do cliente `/a`, `/o` e `/p` (aprovação, orçamento, pedido) e
  qualquer outro site abrem no navegador, só se forem `https`. `mailto:` vai para o e-mail e `webcal://` do próprio
  Maestro (`/api/agenda/<token>.ics`) para o calendário. `maestro://rota` abre só rotas do Maestro (nunca `/api`; link
  do cliente vai para o navegador).
- **Login:** o fluxo normal do site, dentro da janela (OIDC com PKCE da Absolute ZRO). A partição `persist:maestro`
  guarda os cookies (`mae_sessao` e o `zro_session` do HUB têm `Max-Age`, então sobrevivem a fechar e abrir). O agente
  de usuário sai sem "Electron" (o Google recusa navegador embutido). Conferido: o login real abre dentro da janela até
  a tela "Qual é o seu e-mail?" da Absolute ZRO, e num Maestro e numa Absolute ZRO falsos (local) o app entra, volta
  logado e continua logado depois de fechar e abrir.
- **Segurança:** `contextIsolation`, `sandbox`, sem `nodeIntegration`, sem `<webview>`, sem janelas novas; permissões
  negadas, menos copiar e tela cheia do Maestro. Fusíveis: sem `RunAsNode`, sem `NODE_OPTIONS`/`--inspect`, só o
  `app.asar` conferido. Uma instância só. `MAESTRO_URL`/`ZRO_HUB_URL` só fora do app instalado.
- **Visual:** papel claro do Maestro (`#f7f3ee`) desde o primeiro quadro; no Mac, `hiddenInset` com a barra própria
  (voltar, avançar, título com o ícone, recarregar, início), igual ao Absolute ZRO; no Windows a moldura do sistema.
  "Sem conexão": ícone, título Figtree fino × pesado, uma linha, "Tentar de novo" (vidro escuro) e "Abrir no
  navegador"; o wordmark flat da Absolute ZRO no pé. Tenta sozinho quando a rede volta.
- **Ícone:** o oficial (`products/maestro/src/app/icon.svg`, o gesto em latão sobre grafite), sem redesenho: no Mac no
  grid da Apple (corpo de 824 px com sombra), no Windows ocupando o quadro.

## Versão nova: atualiza pela Absolute ZRO

Desde 01/11/2026 (pedido do titular) os apps de computador são instalados e atualizados **só pela central Absolute ZRO**
(`apps/hub-desktop`, como o Creative Cloud). O Maestro não baixa nem instala nada sozinho: não há mais motor do
"Atualizar" aqui (`atualizador.cjs` e `gerenciado.cjs` saíram). Ele só confere, uns segundos depois de abrir e a cada 6 h,
`https://absolutezro.com/baixar/app/maestro/versao.json` com os cookies do login (a rota confere o gate do produto, canal
`download`, e redireciona para o `versao.json` do Release). Build maior que o do app (`desktop/versao.cjs`):

- aviso discreto: a pílula "Atualização disponível" na barra do Mac, o item "Atualização disponível · Atualizar na
  Absolute ZRO" no menu e, no Windows, o título da janela;
- notificação do sistema uma vez por build: "Atualização disponível · Atualizar na Absolute ZRO".

Os dois abrem `absolutezro://apps/maestro?acao=atualizar` (`desktop/central.cjs`); sem a central no computador (ninguém
atende o protocolo), abrem `https://absolutezro.com/baixar`. "Atualizações…" no menu diz "As atualizações chegam pela
Absolute ZRO", com o mesmo botão.

Enquanto o Maestro está fechado (0024), só a lista de acesso recebe o aviso e baixa; a 0027 do lançamento abre para todos.

## Publicar

`.github/workflows/maestro-desktop.yml`: em pull request, só os testes e o teste de fumaça em Ubuntu. Mac e Windows
rodam em push na `main` que mexe em `products/maestro/desktop/**` (ou nos arquivos compartilhados do hub-desktop e no
ícone oficial), em tag `maestro-desktop-v*` e pelo botão "Run workflow"; cada um empacota, passa pelo `--smoke` do app
empacotado e, na main, sobe o instalador no Release de teste **"Maestro · versão de teste"** (tag
`maestro-versao-de-teste`, prerelease). Depois dos dois, o `versao.json` (build, versão, arquivo e SHA-256 de cada
sistema) vai para o Release e os builds antigos saem (ficam os três últimos).

Arquivos: `Maestro-<versão>-b<build>-mac-universal.dmg` e `Maestro-<versão>-b<build>-windows-setup.exe`. A Absolute ZRO
entrega por `/baixar/app/maestro/mac` e `/baixar/app/maestro/windows` (o mais novo, com SHA-256), e o catálogo da
central (`/api/v1/desktop/apps`) lista o Maestro para o Absolute ZRO para computador instalar e atualizar.

Instalar: só pela central Absolute ZRO (`absolutezro.com/baixar`), que baixa, confere e instala o Maestro.
