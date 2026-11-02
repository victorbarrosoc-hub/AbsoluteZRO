# Rift Motion para computador

O Rift Motion (https://rift.absolutezro.com) numa janela própria, no Mac e no Windows: o mesmo site do navegador (painel,
estúdio, mídia no aparelho, gerar com IA e a Z). Abre pelo Dock ou pela barra de tarefas, continua logado, entra pelo
login único da Absolute ZRO dentro da janela, mostra "Sem conexão" quando falta internet e avisa quando sai versão nova.
Mesma moldura do Relay para computador (`products/relay/desktop`), que segue a do Maestro.

Pacote próprio (fora do site): `package.json` e `package-lock.json` só com Electron e electron-builder.

```bash
cd products/rift-motion/desktop
npm ci
npm run desktop                 # abre o app (RIFT_URL=http://localhost:4300 e ZRO_HUB_URL=… apontam para locais)
npm test                        # regras, comandos dos menus, aviso de versão, cópias, ícones e nomes do Release
npm run smoke                   # tela "Sem conexão" e regras; escreve SMOKE OK (no Linux: xvfb-run -a … --no-sandbox)
npm run icones                  # build/ a partir de products/rift-motion/marca/rift-icone.svg (Linux: xvfb-run -a npm run icones)
npm run compartilhado           # copia de apps/hub-desktop o que é igual (o teste confere)
```

## Feito para computador (não é o site numa janela)

- **Menus de programa:** Arquivo (Novo projeto ⌘N, Abrir projeto ⌘O, Importar imagem ou vídeo ⌘I, Exportar ⌘E),
  Editar (⌘Z desfaz a cena no estúdio e o texto num campo), Camada (Texto ⌘T, Forma ⇧⌘F, Objeto 3D ⇧⌘3, Duplicar ⌘D,
  frente e trás, Apagar ⌫), Reproduzir (Espaço, Home, ← →), IA (Gerar com IA ⌘G, Peça à Z ⌘K) e Ajuda › Atalhos (⌘/).
  O menu manda o comando para a página (`rift:comando`); teclas sozinhas aparecem no menu sem roubar a digitação.
  `test/comandos.test.mjs` confere que todo comando tem quem trate na página.
- **Arrastar do Finder ou do Explorer** para o estúdio: imagens e vídeos entram como camadas (vários de uma vez).
- **Geração com IA:** barra de progresso no ícone do Dock ou da barra de tarefas enquanto gera e notificação do sistema
  quando termina com a janela atrás ("Seu motion ficou pronto"); clicar traz o Rift para a frente.
- **Sem a página de apresentação:** o app começa no painel; o título da janela é o nome do projeto aberto.
- **Barra do Mac de programa:** título, Painel e o aviso de versão. Voltar, avançar e recarregar ficam no menu
  Visualizar.

## Como é feito

Igual ao do Relay ([README](../../relay/desktop/README.md)); aqui só o que muda:

- **Na janela:** o Rift Motion (`rift.absolutezro.com`), as telas de entrar da Absolute ZRO (`/oauth/authorize`,
  `/entrar`, `/criar-conta`…) e `accounts.google.com`. A Higgsfield é conectada uma vez na conta Absolute ZRO
  (`absolutezro.com/conexoes`, no navegador) e vale para todos os apps. O resto abre no navegador, só se for `https`.
  `rift://rota` abre só rotas do Rift (nunca `/api`).
- **Login:** o fluxo do site (cliente `rift-web`) dentro da janela. Partição `persist:rift`. Agente sem "Electron".
- **Segurança:** `contextIsolation`, `sandbox`, sem `nodeIntegration`, sem `<webview>`, sem janelas novas; permissões
  negadas, menos copiar, tela cheia e a pasta que a pessoa escolhe para salvar. Fusíveis do Electron. Uma instância só.
- **Ícone:** o oficial (`products/rift-motion/marca/rift-icone.svg`), sem redesenho.
- **Abre em:** `/#app` (o painel). Painel ⌘1, Estúdio ⌘2.

## Instalar e atualizar: só pela Absolute ZRO

Os apps de computador são instalados e atualizados **só pela central Absolute ZRO** (`apps/hub-desktop`, ADR 0036). Nada
de instalador no site do Rift e nada de atualização sozinha: `desktop/versao.cjs` confere
`https://absolutezro.com/baixar/app/rift-motion/versao.json` (com os cookies do login; a rota confere o gate) e só avisa
("Atualização disponível · Atualizar na Absolute ZRO", notificação uma vez por build), abrindo
`absolutezro://apps/rift-motion?acao=atualizar` (sem a central, `https://absolutezro.com/baixar`).

O catálogo da central já tem o Rift (`apps/hub-web/lib/desktop-apps.ts`, id `rift-motion`, arquivos
`RiftMotion-<versão>-b<build>-…`, app "Rift Motion"). Enquanto o Rift não for lançado (migração 0049), só o papel de
plataforma `admin` vê e instala.

## Release

`.github/workflows/rift-motion-desktop.yml`: em pull request, testes e fumaça no Ubuntu; na main (quando o app muda) gera
o `.dmg` (Mac universal) e o `.exe` (Windows x64 e arm64), confere a fumaça do app empacotado e publica no Release de
teste **"Rift Motion · versão de teste"** (tag `rift-motion-versao-de-teste`, prerelease), com o `versao.json` (SHA-256
de cada instalador) depois dos dois. Sem assinatura da Apple/Microsoft por enquanto: assinatura ad-hoc no Mac (na
primeira vez, "Abrir Mesmo Assim").
