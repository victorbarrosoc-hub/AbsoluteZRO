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
