# TPeasy para computador

O TPeasy (https://tpeasy.absolutezro.com/app/) numa janela própria, no Mac e no Windows: o mesmo teleprompter do navegador, sem nada nativo por enquanto. Abre pelo
Dock ou pela barra de tarefas, continua logado, entra pelo login único da Absolute ZRO dentro da janela, mostra uma tela "Sem
conexão" local quando falta internet e avisa quando sai versão nova. Mesma moldura do Maestro para computador
(`products/maestro/desktop`) e do Absolute ZRO para computador (`apps/hub-desktop`), sem a central de apps e sem a bandeja:
é só o TPeasy.

Pacote próprio (fora do `package.json` do site): `package.json` e `package-lock.json` só com Electron e electron-builder.

```bash
cd products/tpeasy/desktop
npm ci
npm run desktop                 # abre o app (TPEASY_URL=http://localhost:3000 e ZRO_HUB_URL=… apontam para locais)
npm test                        # regras, aviso de versão, cópias do hub-desktop, ícones e nomes do Release
npm run smoke                   # tela "Sem conexão" e regras; escreve SMOKE OK (no Linux: xvfb-run -a … --no-sandbox)
npm run icones                  # build/ a partir de `products/tpeasy/marca/tpeasy-icone.svg` (no Linux sem tela: xvfb-run -a npm run icones)
npm run compartilhado           # copia de apps/hub-desktop o que é igual (o teste confere)
npx electron-builder --linux dir   # empacota para conferir (o .dmg e o .exe saem no GitHub Actions)
```

## Como é feito

Igual ao do Maestro (leia o [README dele](../../maestro/desktop/README.md)); aqui só o que muda:

- **Na janela:** o TPeasy (`tpeasy.absolutezro.com`) e, para o login único, só as telas de entrar da Absolute ZRO
  (`/oauth/authorize`, `/entrar`, `/entrar/google`, `/criar-conta`, `/esqueci-a-senha`, `/redefinir-senha`,
  `/confirmar-email`, `/boas-vindas`, `/em-desenvolvimento`) e `accounts.google.com`. O resto da Absolute ZRO e qualquer outro
  site abrem no navegador, só se forem `https`; `mailto:` vai para o e-mail. `tpeasy://rota` abre só rotas do TPeasy (nunca
  `/api`). Sem página do cliente, sem agenda `.ics`: o TPeasy não tem.
- **Login:** o fluxo normal do site (OIDC com PKCE, cliente `tpeasy-web`), dentro da janela. Partição `persist:tpeasy`.
  Agente de usuário sem "Electron" (o Google recusa navegador embutido).
- **Segurança:** `contextIsolation`, `sandbox`, sem `nodeIntegration`, sem `<webview>`, sem janelas novas; permissões negadas,
  menos copiar e tela cheia, e a pasta que a pessoa escolhe para salvar as conversões (`fileSystem`). Fusíveis do Electron como no Maestro. Uma instância só.
  `TPEASY_URL`/`ZRO_HUB_URL` só fora do app instalado.
- **Visual:** fundo claro `#f5f5f7` desde o primeiro quadro (a cor do site); no Mac, `hiddenInset` com a barra própria (voltar,
  avançar, título com o ícone, recarregar, início). "Sem conexão" no mesmo tema, com o wordmark flat da Absolute ZRO no pé.
- **Ícone:** o oficial (`products/tpeasy/marca/tpeasy-icone.svg`, o trilho verde e o anel do O sobre grafite), sem redesenho: no Mac no grid da Apple (corpo de 824 px com sombra), no Windows ocupando o quadro, os
  dois com os cantos do app (a arte oficial é uma placa quadrada).
- **Abre em:** `/app/` (o teleprompter); Arquivo › Controle remoto abre `/app/remote.html`.

## Versão nova e o gate de lançamento

O app pede `https://absolutezro.com/baixar/app/tpeasy/versao.json` com os cookies do login; a rota confere o gate do produto
(canal `download`) e redireciona para o `versao.json` do Release. Build maior que o do app: "Nova versão do TPeasy" uma vez por
build, com **Atualizar** (baixa `…/baixar/app/tpeasy/<arquivo do build>`, confere o SHA-256, fecha e abre já atualizado) ou
**Baixar** (`absolutezro.com/baixar#tpeasy`). Os canais `desktop` e `download` abrem na migração `0042` do HUB
(`infra/migrations/0042_tpeasy_carro_desktop.sql`): aplique depois do primeiro build verde.

## Publicar

`.github/workflows/tpeasy-desktop.yml`: em pull request, só os testes e o teste de fumaça em Ubuntu. Mac e Windows rodam em push
na `main` que mexe em `products/tpeasy/desktop/**` (ou nos arquivos compartilhados do hub-desktop e no ícone oficial), em tag
`tpeasy-desktop-v*` e pelo botão "Run workflow"; cada um empacota, passa pelo `--smoke` do app empacotado e, na main, sobe o
instalador no Release de teste **"TPeasy · versão de teste"** (tag `tpeasy-versao-de-teste`, prerelease). Depois dos dois, o
`versao.json` vai para o Release e os builds antigos saem (ficam os três últimos). Build = número da execução + 2000
(`TPEASY_DESKTOP_BUILD_BASE`).

Arquivos: `TPeasy-<versão>-b<build>-mac-universal.dmg` e `TPeasy-<versão>-b<build>-windows-setup.exe`. A Absolute ZRO entrega por
`/baixar/app/tpeasy/mac` e `/baixar/app/tpeasy/windows` (o mais novo, com SHA-256), e o catálogo da central
(`/api/v1/desktop/apps`) lista o TPeasy para o Absolute ZRO para computador instalar e atualizar.

Sem assinatura da Apple e da Microsoft por enquanto: na primeira vez, no Mac, botão direito › Abrir › Abrir (ou
`xattr -cr "/Applications/TPeasy.app"`); no Windows, Mais informações › Executar assim mesmo.
