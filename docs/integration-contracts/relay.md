# Relay: conversão e exportação de mídia do ecossistema

Contrato de integração do **Relay** ([ADR 0030](../decisions/0030-relay-conversao.md)): o que ele é, como as outras
plataformas o usam e o que cada uma precisa preparar para ele chegar. Vale para quem cria ou mexe em qualquer
plataforma da família. Se o INPI pedir, o nome vira **Relay Convert**; o id técnico `relay` não muda.

**Estado (29/10/2026):** em construção em `products/relay/` (núcleo, motor do navegador e laboratório de qualidade).
Nada publicado: o projeto Vercel `relay` e o domínio `relay.absolutezro.com` pedem autorização do titular.

## O que é

O Relay é o setor da Absolute ZRO que **converte e exporta**: codec, contêiner, resolução, cadência, bitrate e áudio.
Ele recebe um arquivo e entrega a versão certa para um destino (YouTube 1080p, YouTube 4K, Reels · No Compress,
TikTok, WhatsApp, Vimeo, Apple HEVC, Proxy, Discord, E-mail, Tamanho exato, MP3, AAC, WAV).

- **Grátis**, para trazer gente nova ao ecossistema: converter no aparelho não pede conta. A conta Absolute ZRO só
  entra no que toca a conta (Drive, o computador da pessoa, histórico).
- **Qualidade no nível do HandBrake, ou acima:** no computador, o mesmo x264 do HandBrake (CRF com o teto do
  destino, duas passadas para tamanho exato); no navegador, redução em Lanczos na placa de vídeo, cor marcada BT.709
  e bitrate com folga para os codificadores de hardware. Medição em `products/relay/docs/QUALIDADE.md`.
- **Dono único dos presets de entrega.** Nenhuma outra plataforma mantém tabela própria de codec ou bitrate: copia
  do Relay, com teste que confere.
- **O que não é do Relay:** cor e look (Revela: LUT, PowerGrade, espaço de cor), edição (AEON), tratamento de som
  (NOSSOM), cópia e backup (SOBEDESCE).

## Os três jeitos de integrar

| Jeito                       | Quando usar                                                 | Como                                                                                                                                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Núcleo embutido**      | O app já tem o arquivo na mão e quer exportar sem sair dele | Copiar o núcleo do Relay para dentro do app, com teste que compara a cópia com `products/relay` (o padrão do `packages/drive-web`). Decisão: `src/presets.js` e `src/plano.js`. Execução: `app/motor.js` + `app/escala.js` (navegador) ou `src/ffmpeg.js` (computador, Node). |
| **2. Abrir no Relay**       | O app só quer mandar a pessoa converter                     | Link para `https://relay.absolutezro.com/converter?preset=<id>&de=<app>`. O Relay abre com o preset escolhido. Arquivo do Drive (`&drive=<fileId>`) só quando o Relay tiver a conexão do Drive pelo HUB (fase 2).                                                             |
| **3. Pedido ao computador** | O arquivo está no Drive e é pesado demais para o celular    | Pedido na fila (`pedidos_proxy` tipo `formato`, hoje no banco do SOBEDESCE; vai para o schema `relay`). O app de computador da conta (hoje o SOBEDESCE) pega, converte com o ffmpeg e sobe o resultado ao lado do original, com o MD5 conferido.                              |

Regras que valem para os três:

- **O original nunca muda.** A saída é um arquivo novo, ao lado do original, com o nome `<original> (<preset>).<ext>`
  (`nomeSaida` em `src/plano.js`).
- **Prévia antes:** o app mostra o que vai sair (tamanho, codec, peso estimado e os avisos do plano) antes de
  converter. Os avisos do plano aparecem como estão: HDR, cadência dividida, faixas, ampliação.
- **Nunca fingir:** sem codificador, sem ffmpeg ou arquivo que não abre, o botão diz o porquê. "Pronto" só depois do
  arquivo existir e, no Drive, do MD5 bater.
- **Marca:** o botão diz **"Exportar com o Relay"** (ou "Converter com o Relay") e usa o ícone do Relay
  (`products/relay/marca/`). O app mantém a própria marca no resto.
- **Mesmo preset, mesmo resultado:** quem embute não muda número de preset. Preset novo nasce no Relay.

## Requisitos técnicos para o núcleo no navegador (jeito 1)

- **Mediabunny 1.62.1** (MPL-2.0) em `vendor/`, com as extensões `@mediabunny/prores` (ler ProRes),
  `@mediabunny/aac-encoder` (AAC onde o navegador não tem, como o Chromium no Linux) e `@mediabunny/mp3-encoder` (MP3
  pelo LAME). O `scripts/vendor.mjs` do Relay copia e reescreve o import.
- **CSP:** `script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self' blob:`, `connect-src 'self' blob: data:`,
  `media-src 'self' blob:`. Com isolamento de origem (`Cross-Origin-Opener-Policy: same-origin` e
  `Cross-Origin-Embedder-Policy: require-corp`), como a Revela.
- **Arquivo grande:** acima de 1,5 GB, salvar direto numa pasta (`showDirectoryPicker`); na memória, o celular não
  monta o arquivo.
- **Uma conversão por vez** por aba (o codificador de hardware é um só).

## Onde cada plataforma recebe o Relay

| Plataforma          | Onde aparece                                                                                                                                         | Jeito              | O que a plataforma prepara                                                                                                                                                                                                                                                           | Estado                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **SOBEDESCE**       | Botão direito num vídeo do Drive e menu do vídeo no celular: "Converter com o Relay" (hoje "Converter com a Revela"); "Baixar como…" das Referências | 1 (computador) e 3 | Trocar `src/revela/` por `src/relay/` (cópia de `presets.js`, `plano.js` e `ffmpeg.js` com teste), os destinos pela lista do Relay e o texto do botão. Continua sendo o executor da fila (jeito 3). Proxy 720p e tira de quadros ficam no SOBEDESCE (são dele: fazem o Drive tocar). | Em andamento nesta etapa                                   |
| **Revela**          | A aba Converter sai; no lugar, "Exportar com o Relay" (jeito 2) depois do look aplicado                                                              | 2                  | Tirar `converter.html`, `app/converter.js` e `src/conversao/` do dock; o script do Deliver do Resolve lê os presets do Relay. Fica na Revela: LUT, PowerGrade, CST e looks (a cor de saída BT.709 continua decisão da Revela).                                                       | A fazer na conversa da Revela                              |
| **AEON**            | Exportar o vídeo final da timeline (hoje `app/render.js`, só H.264 no tamanho do projeto)                                                            | 1 (navegador)      | Na tela de exportar, a grade de presets do Relay; o render passa a pedir tamanho, cadência e bitrate ao `planejar` do Relay. O AEON continua desenhando os quadros (cortes, zoom, legenda); o Relay decide como gravar.                                                              | A fazer                                                    |
| **NOSSOM**          | Exportar o áudio tratado (hoje WAV PCM16 e MP3 320 em `lib/audio.ts`)                                                                                | 1 (navegador)      | Os formatos de saída pelos presets de áudio do Relay (MP3 320, AAC 256, WAV 48 kHz 24 bits). O NOSSOM mantém medição e loudness; o Relay só grava.                                                                                                                                   | A fazer                                                    |
| **Synquei**         | Depois da sincronia: "Deixar pronto para editar" nos clipes de celular (cadência variável) e proxies                                                 | 3 (ou 2)           | Marcar no relatório os clipes com cadência variável; pedir ao computador a versão de cadência constante e o proxy pelo preset `proxy`. As exportações de projeto (XML, OTIO, EDL) continuam no Synquei.                                                                              | A fazer (depende de preset de cadência constante no Relay) |
| **Maestro**         | Versões de entrega do card: gerar as versões (YouTube, Reels, WhatsApp para o cliente) a partir do master aprovado                                   | 3 (ou 2)           | Na ficha da versão, "Gerar versões com o Relay" com a lista de presets; os arquivos voltam para a pasta do Drive do projeto (ponte SOBEDESCE já existente).                                                                                                                          | A fazer                                                    |
| **HUB e a Z**       | Catálogo (grátis em todos os planos), família no menu, e a Z: "me manda isso em MP4 720p"                                                            | 3                  | Produto `relay` no catálogo (migration nova, grátis), o ícone em `apps/hub-web/public/brand`, o Relay no guia da Z (`apps/hub-web/lib/ia/plataformas.ts`). A Z já usa a fila do computador (`computador-da-z.ts` no SOBEDESCE): passa a citar o Relay.                               | Catálogo e Z nesta etapa                                   |
| **TPeasy**          | Gravações do teleprompter: "Exportar com o Relay" para mandar a gravação no formato da rede                                                          | 2                  | Link com o preset; nada de conversão própria.                                                                                                                                                                                                                                        | Futuro                                                     |
| **Carro do Freela** | Portfólio e reel do freela: "Comprimir com o Relay" antes de subir                                                                                   | 2                  | Link com o preset `tamanho` ou `vimeo`.                                                                                                                                                                                                                                              | Futuro                                                     |

## Eventos e conta

- **Evento** `media.conversion.completed` (fonte `relay`): só quando a primeira conversão passar pelo HUB (fila do
  computador ligada a um projeto). Payload mínimo: projeto, id do arquivo de origem e do resultado no Drive, preset,
  MD5. Rota em `packages/integrations/src/handlers.ts` e teste de ciclo (`findEventCycle`) passando. O pedido em si é
  uma chamada à API do Relay, não um evento.
- **Conta e acesso:** converter no aparelho não pede conta nem consome quota (nenhum custo de servidor). Fila do
  computador e Drive pedem a conta Absolute ZRO e passam por `authorize()` com o produto `relay`. Se um dia houver
  conversão em servidor, ela entra com `consumeQuota` (chave = id do pedido) e limite por plano.
- **Banco:** schema e papel próprios (`relay`) no Supabase `AbsoluteZRO`, nunca dentro de `zro` (ADR 0013).

## Presets (fonte: `products/relay/src/presets.js`)

Redes: YouTube 1080p, YouTube 1440p (o truque da nitidez), YouTube 4K, YouTube Shorts, Reels · No Compress, Instagram
Feed 4:5, TikTok, WhatsApp. Trabalho: Vimeo, Apple HEVC, Proxy para edição. Tamanho: Discord (20 MB), E-mail (25 MB),
Tamanho exato. Áudio: MP3 320, AAC 256, WAV 48 kHz.

Cada preset traz a fonte e a data da conferência (selo Oficial ou Mercado). No computador ainda virão ProRes, DNxHR e
HDR 10 bits; no navegador eles não existem (o WebCodecs não grava ProRes nem DNxHR).
