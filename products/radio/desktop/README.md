# RADION para computador

O rádio do set no Mac e no Windows. Não é só o site numa janela: o RADION fica na barra de menus (Mac) ou na bandeja
(Windows), fala por um atalho de qualquer app, encolhe numa janelinha por cima das outras e não dorme no meio da diária.
Entra pelo login único da Absolute ZRO, mostra "Sem conexão" local quando falta internet e é instalado e atualizado só
pela central Absolute ZRO. Mesma moldura do Relay e do Maestro para computador (`products/relay/desktop`,
`products/maestro/desktop`).

Pacote próprio (fora do `package.json` do site): só Electron e electron-builder.

```bash
cd products/radio/desktop
npm ci
npm run desktop                 # abre o app (RADION_URL=http://localhost:3000 e ZRO_HUB_URL=… apontam para locais)
npm test                        # regras, estado do rádio, aviso de versão, cópias do hub-desktop, ícones e nomes do Release
npm run smoke                   # tela "Sem conexão" e regras; escreve SMOKE OK (no Linux: xvfb-run -a … --no-sandbox)
npm run icones                  # build/icon* a partir de products/radio/app/marca/radion-icone.svg (Linux sem tela: xvfb-run -a)
npm run bandeja                 # build/bandeja/ (ícone da barra de menus e da bandeja) a partir do símbolo do RADION
npm run compartilhado           # copia de apps/hub-desktop o que é igual (o teste confere)
npx electron-builder --linux dir   # empacota para conferir (o .dmg e o .exe saem no GitHub Actions)
```

## O que o computador ganha

- **Barra de menus / bandeja.** O ícone do RADION (imagem modelo no Mac, que segue o tema). Ao lado, no Mac, o canal da
  fala, com `●` quando o microfone está aberto, ou "Silenciado". A dica diz a diária, o canal e quantos pediram a
  palavra. O menu: falar/parar, modo compacto, abrir o RADION, abrir ao iniciar o computador, o atalho e sair.
- **Atalho de falar** (global, funciona com o RADION atrás): `⌘⇧Espaço` no Mac, `Ctrl+Shift+Espaço` no Windows. Se outro
  app já usa, tenta `⌥⇧Espaço` e depois `⌘⌥Espaço` (`desktop/radio.cjs`). Aperta uma vez abre o microfone, outra fecha.
- **Modo compacto** (`⌘⇧M`, menu ou o botão na tela): uma janelinha de 380×136 por cima das outras, em todas as mesas, com
  o canal, quem fala e o botão de falar. Para deixar no canto enquanto trabalha no editor.
- **Não dorme na diária.** Com o rádio ligado, o app pede ao sistema para não suspender (`powerSaveBlocker`) e o
  navegador interno não freia a página em segundo plano: o áudio e os avisos continuam.
- **Fechar a janela não desliga o rádio.** Ela some e o RADION segue na barra; "Sair" no menu encerra. No Windows, a
  primeira vez avisa onde ele ficou.
- **Notificações do sistema** para aviso do set e pedido da palavra, só quando a janela não está na frente. O selo do
  ícone no Dock mostra quantos pediram a palavra (silenciado, um ponto); no Windows, a barra de tarefas pisca.
- **Abre direto na diária:** `radion://d/ABC234` abre `radion.absolutezro.com/?d=ABC234`. O menu Arquivo leva a No ar,
  Diárias, Equipe e Avisos.

A página e o app conversam por `window.radionDesktop` (`desktop/preload.cjs`): a página conta o estado (diária, canal,
falando, silenciado, mãos levantadas, ligado), que o app confere campo a campo (`limparEstado`), e o app manda comandos
(`alternar-fala`, `{ compacto }`). Nada do Node chega à página. No navegador, `window.radionDesktop` não existe e nada
disso aparece.

## Como é feito

- **Na janela:** o RADION (`radion.absolutezro.com`) e, para o login único, só as telas de entrar da Absolute ZRO. O
  resto abre no navegador, só se for `https`; `mailto:` vai para o e-mail. `radion://` abre só rotas do RADION (nunca
  `/api`).
- **Login:** o fluxo do site (OIDC com PKCE, cliente `radio-web`), dentro da janela, partição `persist:radion`. Google
  pelo navegador do sistema (ADR 0041, abaixo).
- **Segurança:** `contextIsolation`, `sandbox`, sem `nodeIntegration`, sem `<webview>`, sem janelas novas. Permissões
  negadas, menos o microfone (só áudio, nunca câmera), copiar, tela cheia e manter a tela acesa. Fusíveis do Electron
  como no Maestro. Uma instância só. `RADION_URL`/`ZRO_HUB_URL` só fora do app instalado. No Mac, o pedido do microfone
  diz para que é (`NSMicrophoneUsageDescription`).
- **Voz nunca no servidor:** o app não grava nem guarda áudio; a voz vai pelo WebRTC do site, como no navegador.
- **Ícone:** o oficial (`products/radio/app/marca/radion-icone.svg`), sem redesenho; na barra de menus, o símbolo
  (`radion-simbolo.svg`) em preto como imagem modelo.

## Versão nova: atualiza pela Absolute ZRO

Os apps de computador são instalados e atualizados **só pela central Absolute ZRO** (`apps/hub-desktop`). O RADION só
confere, uns segundos depois de abrir e a cada 6 h, `https://absolutezro.com/baixar/app/radio/versao.json` (a rota
confere o gate do produto, canal `download`). Build maior que o do app: aviso discreto e uma notificação por build, que
abrem `absolutezro://apps/radio?acao=atualizar` (sem a central, `https://absolutezro.com/baixar`).

Os canais `desktop` e `download` do RADION abriram na `0064` do HUB (titular, 07/11/2026), depois do primeiro build
verde (b4002): toda conta Absolute ZRO instala o RADION pela central.

## Entrar com o Google (ADR 0041)

O Google recusa OAuth em janela embutida. A janela nunca abre `accounts.google.com`: o app abre `<HUB>/entrar/app` no
navegador do sistema (`desktop/login-externo.cjs`, cópia idêntica em cada app), a pessoa entra e o navegador volta por
`radion://entrar-app?code=…&state=…`. O app confere o `state`, troca o código (60 s) e o `verifier` PKCE por uma sessão
do HUB e volta para onde estava. O `radion` está na lista `DESKTOP_LOGIN_APPS` (`packages/auth`) e na restrição do banco
(HUB 0063).

## Publicar

`.github/workflows/radion-desktop.yml`: em pull request, testes e teste de fumaça em Ubuntu. Mac e Windows rodam em push
na `main` que mexe em `products/radio/desktop/**` (ou nos arquivos compartilhados do hub-desktop e nos ícones), em tag
`radion-desktop-v*` e pelo botão "Run workflow". Cada um empacota, passa pelo `--smoke` do app empacotado e, na main, sobe
o instalador no Release de teste **"RADION · versão de teste"** (tag `radion-versao-de-teste`, prerelease); depois dos
dois, o `versao.json`. Build = número da execução + 4000 (`RADION_DESKTOP_BUILD_BASE`).

Arquivos: `RADION-<versão>-b<build>-mac-universal.dmg` e `RADION-<versão>-b<build>-windows-setup.exe`. A Absolute ZRO
entrega por `/baixar/app/radio/mac` e `/baixar/app/radio/windows`, e o catálogo da central (`/api/v1/desktop/apps`) lista
o RADION para o Absolute ZRO para computador instalar e atualizar.
