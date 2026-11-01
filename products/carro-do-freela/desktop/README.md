# Carro do Freela para computador

O Carro do Freela (https://carro.absolutezro.com) numa janela própria, no Mac e no Windows: o mesmo site do navegador, a agenda do audiovisual, sem nada nativo por enquanto. Abre pelo
Dock ou pela barra de tarefas, continua logado, entra pelo login único da Absolute ZRO dentro da janela, mostra uma tela "Sem
conexão" local quando falta internet e avisa quando sai versão nova. Mesma moldura do Maestro para computador
(`products/maestro/desktop`) e do Absolute ZRO para computador (`apps/hub-desktop`), sem a central de apps e sem a bandeja:
é só o Carro do Freela.

## Novidades da 0.2.1: atualizações pela Absolute ZRO

Quando sai versão nova, o Carro do Freela avisa (discreto, e uma notificação por versão) e a atualização é feita pela
central Absolute ZRO. O app não baixa mais instalador sozinho.

## O que o app faz a mais que o site (0.2.0)

Pedido do titular (31/10/2026): "um app no nível mais alto que o site, que instigue a baixar". Tudo pelas mesmas rotas do
site, chamadas de dentro da página do Carro (`desktop/pulso.cjs`, testado em `test/pulso.test.mjs`):

- **Proposta nova avisa na hora**: notificação do sistema (tocar abre Propostas) e o número no ícone (Dock e Linux).
- **A semana na barra do computador** (bandeja no Windows, barra de menus no Mac): hoje e os próximos seis dias, e marcar
  Livre, Negociando ou Fechado sem abrir a janela.
- **Atalho global** ⌥⌘C (Ctrl+Alt+C no Windows) chama o Carro de qualquer lugar.
- **Abrir ao ligar o computador**, se a pessoa quiser (na bandeja).

Sem login, a bandeja só oferece abrir o app. O app não guarda token nem senha: é a sessão do próprio site.

Pacote próprio (fora do `package.json` do site): `package.json` e `package-lock.json` só com Electron e electron-builder.

```bash
cd products/carro-do-freela/desktop
npm ci
npm run desktop                 # abre o app (CARRO_URL=http://localhost:3000 e ZRO_HUB_URL=… apontam para locais)
npm test                        # regras, aviso de versão, cópias do hub-desktop, ícones e nomes do Release
npm run smoke                   # tela "Sem conexão" e regras; escreve SMOKE OK (no Linux: xvfb-run -a … --no-sandbox)
npm run icones                  # build/ a partir de `products/carro-do-freela/public/icone-512.png` (no Linux sem tela: xvfb-run -a npm run icones)
npm run compartilhado           # copia de apps/hub-desktop o que é igual (o teste confere)
npx electron-builder --linux dir   # empacota para conferir (o .dmg e o .exe saem no GitHub Actions)
```

## Como é feito

Igual ao do Maestro (leia o [README dele](../../maestro/desktop/README.md)); aqui só o que muda:

- **Na janela:** o Carro do Freela (`carro.absolutezro.com`) e, para o login único, só as telas de entrar da Absolute ZRO
  (`/oauth/authorize`, `/entrar`, `/entrar/google`, `/criar-conta`, `/esqueci-a-senha`, `/redefinir-senha`,
  `/confirmar-email`, `/boas-vindas`, `/em-desenvolvimento`) e `accounts.google.com`. O resto da Absolute ZRO e qualquer outro
  site abrem no navegador, só se forem `https`; `mailto:` vai para o e-mail. `carrodofreela://rota` abre só rotas do Carro do Freela (nunca
  `/api`). Sem página do cliente, sem agenda `.ics`: o Carro do Freela não tem.
- **Login:** o fluxo normal do site (OIDC com PKCE, cliente `carro-web`), dentro da janela. Partição `persist:carro`.
  Agente de usuário sem "Electron" (o Google recusa navegador embutido).
- **Segurança:** `contextIsolation`, `sandbox`, sem `nodeIntegration`, sem `<webview>`, sem janelas novas; permissões negadas,
  menos copiar e tela cheia. Fusíveis do Electron como no Maestro. Uma instância só.
  `CARRO_URL`/`ZRO_HUB_URL` só fora do app instalado.
- **Visual:** fundo escuro `#0e0e10` desde o primeiro quadro (a cor do site); no Mac, `hiddenInset` com a barra própria (voltar,
  avançar, título com o ícone, recarregar, início). "Sem conexão" no mesmo tema, com o wordmark flat da Absolute ZRO no pé.
- **Ícone:** o oficial (`products/carro-do-freela/public/icone-512.png`, o anel, as três barras e o carrinho, o mesmo do site e da Tela de Início; a arte tem 512 px, então ampliada para 1024), sem redesenho: no Mac no grid da Apple (corpo de 824 px com sombra), no Windows ocupando o quadro, os
  dois com os cantos do app (a arte oficial é uma placa quadrada).
- **Abre em:** `/`.

## Versão nova: atualiza pela Absolute ZRO

Desde 01/11/2026 (pedido do titular) os apps de computador são instalados e atualizados **só pela central Absolute ZRO**
(`apps/hub-desktop`, como o Creative Cloud). O Carro do Freela não baixa nem instala nada sozinho: não há mais motor do
"Atualizar" aqui (`atualizador.cjs` e `gerenciado.cjs` saíram). Ele só confere, uns segundos depois de abrir e a cada 6 h,
`https://absolutezro.com/baixar/app/carro-do-freela/versao.json` com os cookies do login (a rota confere o gate do produto, canal
`download`, e redireciona para o `versao.json` do Release). Build maior que o do app (`desktop/versao.cjs`):

- aviso discreto: a pílula "Atualização disponível" na barra do Mac, o item "Atualização disponível · Atualizar na
  Absolute ZRO" no menu e, no Windows, o título da janela;
- notificação do sistema uma vez por build: "Atualização disponível · Atualizar na Absolute ZRO".

Os dois abrem `absolutezro://apps/carro-do-freela?acao=atualizar` (`desktop/central.cjs`); sem a central no computador (ninguém
atende o protocolo), abrem `https://absolutezro.com/baixar`. "Atualizações…" no menu diz "As atualizações chegam pela
Absolute ZRO", com o mesmo botão.

Os canais `desktop` e `download` abrem na migração `0042` do HUB
(`infra/migrations/0042_relay_carro_desktop.sql`): aplique depois do primeiro build verde.

## Publicar

`.github/workflows/carro-desktop.yml`: em pull request, só os testes e o teste de fumaça em Ubuntu. Mac e Windows rodam em push
na `main` que mexe em `products/carro-do-freela/desktop/**` (ou nos arquivos compartilhados do hub-desktop e no ícone oficial), em tag
`carro-desktop-v*` e pelo botão "Run workflow"; cada um empacota, passa pelo `--smoke` do app empacotado e, na main, sobe o
instalador no Release de teste **"Carro do Freela · versão de teste"** (tag `carro-versao-de-teste`, prerelease). Depois dos dois, o
`versao.json` vai para o Release e os builds antigos saem (ficam os três últimos). Build = número da execução + 3000
(`CARRO_DESKTOP_BUILD_BASE`).

Arquivos: `CarroDoFreela-<versão>-b<build>-mac-universal.dmg` e `CarroDoFreela-<versão>-b<build>-windows-setup.exe`. A Absolute ZRO entrega por
`/baixar/app/carro-do-freela/mac` e `/baixar/app/carro-do-freela/windows` (o mais novo, com SHA-256), e o catálogo da central
(`/api/v1/desktop/apps`) lista o Carro do Freela para o Absolute ZRO para computador instalar e atualizar.

Instalar: só pela central Absolute ZRO (`absolutezro.com/baixar`), que baixa, confere e instala o Carro do Freela.
