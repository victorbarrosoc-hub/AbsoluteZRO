# ADR 0018 — Central de apps (modelo Creative Cloud)

Data: 26/10/2026 · Decisão do titular

## Contexto

Cada ferramenta de computador (SOBEDESCE, Synquei, NOSSOM) tinha o próprio instalador, o próprio aviso de versão e o
próprio download. O titular quer um só ponto: baixar o Absolute ZRO e, dentro dele, instalar as ferramentas, como o
Creative Cloud. Os certificados da Apple e da Microsoft ficam para depois; tem de funcionar sem eles.

## Decisão

**Computador.** O app Absolute ZRO (`apps/hub-desktop`) vira a central:

- Catálogo no HUB, `GET /api/v1/desktop/apps`, montado a partir dos Releases de cada ferramenta no GitHub. Só entra
  arquivo com SHA-256 informado pelo GitHub (`digest`); o download passa por `/baixar/app/<id>/<arquivo>` (endereço
  assinado e temporário).
- A página Downloads do HUB, dentro do app, mostra Instalar, Abrir, Atualizar e Remover com progresso. A página só
  passa o id da ferramenta pela ponte (`window.zroDesktop.apps`); o processo principal lê o catálogo, baixa, confere o
  SHA-256 e instala (`desktop/central.cjs`).
- Sem senha de administrador: no Mac copia o `.app` para `/Applications` (ou `~/Applications`), no Windows roda o NSIS
  em silêncio para o usuário atual. O arquivo vem pelo próprio app, sem a marca de "baixado da internet", então não
  aparece o aviso de app não identificado; a garantia, enquanto não há certificado, é o SHA-256.
- Só instala o que a organização contratou; atualizar ou remover com a ferramenta aberta pede para fechar antes.
- Download direto continua como reserva: no navegador, com o Absolute ZRO no ar, ele fica recolhido em "Baixar só o
  …"; nos sites de cada ferramenta, o cartão "Instale pelo Absolute ZRO" vem primeiro e o download direto logo abaixo.

**Celular.** O iPhone não permite um app instalar outros. O Absolute ZRO é app da web (tela de início): no Android
instala com um toque; no iPhone, guia curto pelo Compartilhar. Dele, cada ferramenta abre já logada. Loja (App Store
ou Play) só quando uma ferramenta precisar de recurso nativo.

## Consequências

- Os apps deixam de precisar de atualizador próprio no computador quando instalados pela central (os avisos atuais
  continuam para quem instalou direto).
- Pendente: certificados (assinatura e atualização automática da própria central), Release `nossom-v…` no AbsoluteZRO
  ou `GITHUB_TOKEN` no projeto `absolutezro` para o NOSSOM entrar no catálogo, e `HUB_DESKTOP_PUBLICO=1` para abrir o
  download público.

## Adendo de 28/10/2026 — o instalador do ecossistema roda em segundo plano

Pedido do titular: "O instalador do ecossistema precisa existir, tem que ser um programa que roda que nem o SOBEDESCE,
que chegue as atualizações dos aplicativos por ele também." O Absolute ZRO para computador 1.3.0 vira esse programa:

- **Segundo plano.** Símbolo da marca na barra de menus do Mac (imagem _template_, monocromática) e na bandeja do
  Windows (branco na barra escura, grafite na clara). Menu curto: Abrir Absolute ZRO, os apps instalados (abrir cada
  um), Procurar atualizações, "Reiniciar e atualizar <app>" quando há atualização esperando, "Atualizar tudo" quando há
  mais de uma, Abrir com o computador e Sair. Fechar a janela não encerra; no Mac o ícone do Dock some com a janela.
- **Abre com o computador**, ligado na primeira execução do app instalado, começando escondido (Windows `--escondido`;
  Mac, aberto no login). Desliga na bandeja, no menu do app ou na tela de boas-vindas; se a pessoa desligar nos
  Ajustes do sistema, o app segue essa escolha e não liga de novo sozinho.
- **Atualização dos apps pela central** (`desktop/agenda.cjs`): confere o catálogo do HUB 20 s depois de abrir e a cada
  4 h. App instalado com versão nova: baixa e confere o SHA-256 em segundo plano; fechado, instala na hora e avisa
  ("SOBEDESCE atualizado"); aberto, fica "atualiza ao fechar" (uma notificação, item na bandeja e na página Downloads)
  e instala assim que ele fechar. "Reiniciar e atualizar" pede para o app sair do jeito educado (⌘Q / fechar janela;
  ele pode perguntar antes), instala e abre de novo. Nunca força o fechamento.
- **Gate de lançamento:** o catálogo é lido com os cookies do login (partição do HUB), então só entram os produtos com
  canal desktop liberado para a pessoa (ADR 0023). NOSSOM e outros fechados não aparecem para o público e nunca são
  atualizados.
- **Primeira abertura:** tela "Seus apps." com os apps disponíveis para este computador, todos desligados (opcionais), o
  interruptor "Abrir com o computador" e Instalar / Agora não. Só aparece quando há algo para instalar; sem catálogo,
  pergunta numa próxima abertura.
- O próprio Absolute ZRO continua se atualizando pelo `desktop/atualizador.cjs`; só na bandeja, o aviso vira notificação.

**Regra contra duas atualizações disputando o mesmo app.** A central grava em
`<dados do sistema>/Absolute ZRO/apps-gerenciados.json` (`{ versao: 1, visto, apps: { <id>: { desde } } }`) os apps
instalados que ela consegue trocar sozinha (Mac: pasta gravável, fora do disco de instalação; Windows: instalação do
usuário, HKCU) e renova `visto` a cada conferência. O SOBEDESCE (`src/gerenciado.js`) e o Synquei
(`desktop/gerenciado.cjs`) leem o arquivo a cada conferência: se estão na lista e `visto` tem menos de 14 dias, o
atualizador próprio fica quieto (não pergunta ao site, não baixa, não mostra aviso; "Atualizar" responde que o Absolute
ZRO cuida). Se o Absolute ZRO sair do computador ou parar de abrir, em 14 dias os apps voltam a se atualizar sozinhos.
Quem instalou direto (sem a central) segue como antes.
