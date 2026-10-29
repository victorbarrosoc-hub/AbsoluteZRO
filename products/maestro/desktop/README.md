# Maestro para computador

O Maestro (https://maestro.absolutezro.com/app) numa janela própria, no Mac e no Windows. Abre pelo Dock ou pela barra
de tarefas, continua logado, entra pelo login único da Absolute ZRO dentro da janela, mostra uma tela "Sem conexão"
local quando falta internet e avisa quando sai versão nova. Mesma moldura do Absolute ZRO para computador
(`apps/hub-desktop`), sem a central de apps e sem a bandeja: é só o Maestro.

Pacote próprio (fora dos workspaces da raiz e do `package.json` do site do Maestro): `package.json` e
`package-lock.json` só com Electron e electron-builder.

```bash
cd products/maestro/desktop
npm ci
npm run desktop                 # abre o app (MAESTRO_URL=http://localhost:3000 e ZRO_HUB_URL=… apontam para locais)
npm test                        # regras, aviso de versão, cópias do hub-desktop, ícones e nomes do Release
npm run smoke                   # tela "Sem conexão" e regras; escreve SMOKE OK (no Linux: xvfb-run -a … --no-sandbox)
npm run icones                  # build/ a partir de ../src/app/icon.svg (no Linux sem tela: xvfb-run -a npm run icones)
npm run compartilhado           # copia de apps/hub-desktop o que é igual (o teste confere)
npx electron-builder --linux dir   # empacota para conferir (o .dmg e o .exe saem no GitHub Actions)
```

## Como é feito

| Arquivo                                  | O que faz                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `desktop/main.cjs`                       | janela, menu em português, atalhos, sessão, deep link `maestro://`, aviso de versão e `--smoke` |
| `desktop/regras.cjs`                     | o que fica na janela, o que vai para o navegador, deep link e permissões (testado sem Electron) |
| `desktop/versao.cjs`                     | "Nova versão do Maestro": `versao.json` pela Absolute ZRO, 15 s depois de abrir e a cada 6 h    |
| `desktop/gerenciado.cjs`                 | instalado pela central do Absolute ZRO: quem atualiza é ela (o aviso fica quieto)               |
| `desktop/paginas/`                       | barra de título do Mac (latão no carregando) e "Sem conexão" (HTML local, CSP fechada)          |
| `desktop/atualizador.cjs`, `janela.cjs`… | **cópias idênticas** do `apps/hub-desktop` (`scripts/compartilhado.mjs`; o teste confere)       |
| `scripts/icones.mjs`                     | desenha o ícone oficial no Chromium e gera `.icns`, `.ico` e PNGs (código do hub-desktop)       |
| `scripts/release.mjs`                    | build-info, nome com build, SHA-256, `versao.json` e limpeza do Release                         |
| `electron-builder.yml`                   | DMG universal e NSIS (x64 e ARM), fusíveis, `maestro://`                                        |

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

## Versão nova e o gate de lançamento

O app pede `https://absolutezro.com/baixar/app/maestro/versao.json` com os cookies do login. A rota da Absolute ZRO
confere o gate do Maestro (canal `download`) e redireciona para o `versao.json` do Release. Build maior que o do app:
"Nova versão do Maestro" uma vez por build, com **Atualizar** (baixa `…/baixar/app/maestro/<arquivo do build>`,
confere o SHA-256, fecha e abre já atualizado; motor compartilhado com o Absolute ZRO) ou **Baixar** (abre
`absolutezro.com/baixar#maestro`), e **Depois**. "Procurar atualizações…" no menu. Enquanto o Maestro está fechado
(0024), só a lista de acesso recebe o aviso e baixa; a 0027 do lançamento abre para todos.

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

Sem assinatura da Apple e da Microsoft por enquanto: na primeira vez, no Mac, botão direito › Abrir › Abrir (ou
`xattr -cr /Applications/Maestro.app`); no Windows, Mais informações › Executar assim mesmo. O "Atualizar" pelo app não
passa por esse aviso (o arquivo baixado pelo próprio app não ganha a marca de "veio da internet").
