# Relay para computador

O Relay (https://relay.absolutezro.com/converter) numa janela própria, no Mac e no Windows: o mesmo site do navegador, o conversor, que trabalha no próprio aparelho (nada é enviado), sem conversão nativa por enquanto. Abre pelo
Dock ou pela barra de tarefas, continua logado, entra pelo login único da Absolute ZRO dentro da janela, mostra uma tela "Sem
conexão" local quando falta internet e avisa quando sai versão nova. Mesma moldura do Maestro para computador
(`products/maestro/desktop`) e do Absolute ZRO para computador (`apps/hub-desktop`), sem a central de apps e sem a bandeja:
é só o Relay.

Pacote próprio (fora do `package.json` do site): `package.json` e `package-lock.json` só com Electron e electron-builder.

```bash
cd products/relay/desktop
npm ci
npm run desktop                 # abre o app (RELAY_URL=http://localhost:3000 e ZRO_HUB_URL=… apontam para locais)
npm test                        # regras, aviso de versão, cópias do hub-desktop, ícones e nomes do Release
npm run smoke                   # tela "Sem conexão" e regras; escreve SMOKE OK (no Linux: xvfb-run -a … --no-sandbox)
npm run icones                  # build/ a partir de `products/relay/marca/relay-icone.svg` (no Linux sem tela: xvfb-run -a npm run icones)
npm run compartilhado           # copia de apps/hub-desktop o que é igual (o teste confere)
npx electron-builder --linux dir   # empacota para conferir (o .dmg e o .exe saem no GitHub Actions)
```

## Como é feito

Igual ao do Maestro (leia o [README dele](../../maestro/desktop/README.md)); aqui só o que muda:

- **Na janela:** o Relay (`relay.absolutezro.com`) e, para o login único, só as telas de entrar da Absolute ZRO
  (`/oauth/authorize`, `/entrar`, `/entrar/google`, `/criar-conta`, `/esqueci-a-senha`, `/redefinir-senha`,
  `/confirmar-email`, `/boas-vindas`, `/em-desenvolvimento`) e `accounts.google.com`. O resto da Absolute ZRO e qualquer outro
  site abrem no navegador, só se forem `https`; `mailto:` vai para o e-mail. `relay://rota` abre só rotas do Relay (nunca
  `/api`). Sem página do cliente, sem agenda `.ics`: o Relay não tem.
- **Login:** o fluxo normal do site (OIDC com PKCE, cliente `relay-web`), dentro da janela. Partição `persist:relay`.
  Agente de usuário sem "Electron" (o Google recusa navegador embutido).
- **Segurança:** `contextIsolation`, `sandbox`, sem `nodeIntegration`, sem `<webview>`, sem janelas novas; permissões negadas,
  menos copiar e tela cheia, e a pasta que a pessoa escolhe para salvar as conversões (`fileSystem`). Fusíveis do Electron como no Maestro. Uma instância só.
  `RELAY_URL`/`ZRO_HUB_URL` só fora do app instalado.
- **Visual:** fundo claro `#f5f5f7` desde o primeiro quadro (a cor do site); no Mac, `hiddenInset` com a barra própria (voltar,
  avançar, título com o ícone, recarregar, início). "Sem conexão" no mesmo tema, com o wordmark flat da Absolute ZRO no pé.
- **Ícone:** o oficial (`products/relay/marca/relay-icone.svg`, o trilho verde e o anel do O sobre grafite), sem redesenho: no Mac no grid da Apple (corpo de 824 px com sombra), no Windows ocupando o quadro, os
  dois com os cantos do app (a arte oficial é uma placa quadrada).
- **Abre em:** `/converter`.

## Versão nova e o gate de lançamento

O app pede `https://absolutezro.com/baixar/app/relay/versao.json` com os cookies do login; a rota confere o gate do produto
(canal `download`) e redireciona para o `versao.json` do Release. Build maior que o do app: "Nova versão do Relay" uma vez por
build, com **Atualizar** (baixa `…/baixar/app/relay/<arquivo do build>`, confere o SHA-256, fecha e abre já atualizado) ou
**Baixar** (`absolutezro.com/baixar#relay`). Os canais `desktop` e `download` abrem na migração `0042` do HUB
(`infra/migrations/0042_relay_carro_desktop.sql`): aplique depois do primeiro build verde.

## Publicar

`.github/workflows/relay-desktop.yml`: em pull request, só os testes e o teste de fumaça em Ubuntu. Mac e Windows rodam em push
na `main` que mexe em `products/relay/desktop/**` (ou nos arquivos compartilhados do hub-desktop e no ícone oficial), em tag
`relay-desktop-v*` e pelo botão "Run workflow"; cada um empacota, passa pelo `--smoke` do app empacotado e, na main, sobe o
instalador no Release de teste **"Relay · versão de teste"** (tag `relay-versao-de-teste`, prerelease). Depois dos dois, o
`versao.json` vai para o Release e os builds antigos saem (ficam os três últimos). Build = número da execução + 2000
(`RELAY_DESKTOP_BUILD_BASE`).

Arquivos: `Relay-<versão>-b<build>-mac-universal.dmg` e `Relay-<versão>-b<build>-windows-setup.exe`. A Absolute ZRO entrega por
`/baixar/app/relay/mac` e `/baixar/app/relay/windows` (o mais novo, com SHA-256), e o catálogo da central
(`/api/v1/desktop/apps`) lista o Relay para o Absolute ZRO para computador instalar e atualizar.

Sem assinatura da Apple e da Microsoft por enquanto: na primeira vez, no Mac, botão direito › Abrir › Abrir (ou
`xattr -cr "/Applications/Relay.app"`); no Windows, Mais informações › Executar assim mesmo.
