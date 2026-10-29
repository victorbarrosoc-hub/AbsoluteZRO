# Relay: conversão e exportação de mídia do ecossistema

Contrato de integração do **Relay** ([ADR 0030](../decisions/0030-relay-conversao.md)): o que ele é, como as outras
plataformas o usam e o que cada uma precisa preparar para ele chegar. Vale para quem cria ou mexe em qualquer
plataforma da família. Se o INPI pedir, o nome vira **Relay Convert**; o id técnico `relay` não muda.

**Estado (29/10/2026):** o Relay está pronto em `products/relay/` (site, conversor, presets da pessoa, laboratório de
qualidade) e já embutido no SOBEDESCE (computador e celular). Liberado aos usuários junto com o Maestro (29/10/2026, sem e-mail de lançamento):
`relay.absolutezro.com` com `RELEASE=released`; no HUB, a migration `0032` abre o produto e o gate (canal web).

## O que é

O Relay é o setor da Absolute ZRO que **converte e exporta**: codec, contêiner, resolução, cadência, bitrate e áudio.
Ele recebe um arquivo e entrega a versão certa para um destino (YouTube 1080p, YouTube 4K, Reels · No Compress,
TikTok, WhatsApp, Vimeo, Apple HEVC, Proxy, Discord, E-mail, Tamanho exato, MP3, AAC, WAV).

- **Aberto**, para trazer gente nova ao ecossistema: converter no aparelho não pede conta. A conta Absolute ZRO só
  entra no que toca a conta (Drive, o computador da pessoa, histórico).
- **Qualidade medida:** no computador, o x264 em `slow` e qualidade constante (duas passadas no tamanho exato); no
  navegador, redução em Lanczos na placa de vídeo, cor marcada BT.709 e bitrate com folga para os codificadores de
  hardware. Medição interna em `products/relay/docs/QUALIDADE.md`.
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

## "Máxima qualidade": do site do Relay para o app de computador

No Mac e no Windows, o conversor do Relay oferece **Máxima qualidade**: abre o app SOBEDESCE pelo link
`sobedesce://relay?presets=<ids>&meus=<base64url das fichas>` (`products/relay/src/link.js` monta, até 8 destinos e
8 KB; `products/sobedesce/desktop/links.js` lê e recusa o resto). O app mostra a folha "Máxima qualidade", a pessoa
escolhe os arquivos do computador e ele converte com o x264 (`POST /api/relay/local` no servidor local), salvando
`<original> (<destino>).<ext>` na mesma pasta, sem gravar por cima (`… 2`) e com `.sobedesce-parcial` até terminar.
Nenhum arquivo passa pelo site: o link leva só os destinos.

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

| Plataforma          | Onde aparece                                                                                                       | Jeito              | O que a plataforma prepara                                                                                                                                                                                                                                                                                                                                                                      | Estado                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **SOBEDESCE**       | Botão direito num vídeo ou áudio do Drive (computador) e menu do arquivo no celular: "Converter com o Relay"       | 1 (computador) e 3 | Feito: `src/relay/` e `web/public/app/relay/` são cópias conferidas por teste (`test/relay.test.js`; o Relay confere do lado dele em `test/copias.test.js`), com os destinos do Relay (hoje 23) menos "Tamanho exato". Falta: "Baixar como…" das Referências e o pedido da Z (`pedidos_proxy` tipo `formato`) passarem pelos presets do Relay. Proxy 720p e tira de quadros ficam no SOBEDESCE. | Feito (Converter); Baixar como e Z a fazer                 |
| **Revela**          | A aba Converter sai; no lugar, "Exportar com o Relay" (jeito 2) depois do look aplicado                            | 2                  | Tirar `converter.html`, `app/converter.js` e `src/conversao/` do dock; o script do Deliver do Resolve lê os presets do Relay. Fica na Revela: LUT, PowerGrade, CST e looks (a cor de saída BT.709 continua decisão da Revela).                                                                                                                                                                  | A fazer na conversa da Revela                              |
| **AEON**            | Exportar o vídeo final da timeline (hoje `app/render.js`, só H.264 no tamanho do projeto)                          | 1 (navegador)      | Na tela de exportar, a grade de presets do Relay; o render passa a pedir tamanho, cadência e bitrate ao `planejar` do Relay. O AEON continua desenhando os quadros (cortes, zoom, legenda); o Relay decide como gravar.                                                                                                                                                                         | A fazer                                                    |
| **NOSSOM**          | Exportar o áudio tratado (hoje WAV PCM16 e MP3 320 em `lib/audio.ts`)                                              | 1 (navegador)      | Os formatos de saída pelos presets de áudio do Relay (MP3 320, AAC 256, WAV 48 kHz 24 bits). O NOSSOM mantém medição e loudness; o Relay só grava.                                                                                                                                                                                                                                              | A fazer                                                    |
| **Synquei**         | Depois da sincronia: "Deixar pronto para editar" nos clipes de celular (cadência variável) e proxies               | 3 (ou 2)           | Marcar no relatório os clipes com cadência variável; pedir ao computador a versão de cadência constante e o proxy pelo preset `proxy`. As exportações de projeto (XML, OTIO, EDL) continuam no Synquei.                                                                                                                                                                                         | A fazer (depende de preset de cadência constante no Relay) |
| **Maestro**         | Versões de entrega do card: gerar as versões (YouTube, Reels, WhatsApp para o cliente) a partir do master aprovado | 3                  | Ver "Maestro → Relay" abaixo: ações `relay.converter`, `relay.pedido` e `relay.cancelar` pela ponte do HUB (destino `sobedesce`), cópia dos presets em `products/maestro/src/lib/relay/`.                                                                                                                                                                                                       | Contrato definido; lança junto com o Maestro               |
| **HUB e a Z**       | Catálogo (incluído em todos os planos), família no menu, e a Z: "me manda isso em MP4 720p"                        | 3                  | Feito: produto `relay` no catálogo (migration `0031`, incluído em todo plano, sem limites, gate em `development`), ícone em `apps/hub-web/public/products/relay.svg`, `ProductId` com `relay`, o Relay no guia da Z. Na abertura: migration nova com `stage`, `external_url` e o gate.                                                                                                          | Feito (fechado até o deploy)                               |
| **TPeasy**          | Gravações do teleprompter: "Exportar com o Relay" para mandar a gravação no formato da rede                        | 2                  | Link com o preset; nada de conversão própria.                                                                                                                                                                                                                                                                                                                                                   | Futuro                                                     |
| **Carro do Freela** | Portfólio e reel do freela: "Comprimir com o Relay" antes de subir                                                 | 2                  | Link com o preset `tamanho` ou `vimeo`.                                                                                                                                                                                                                                                                                                                                                         | Futuro                                                     |

## Maestro → Relay: "Gerar versões com o Relay" (lançam juntos; decisão do titular, 29/10/2026)

O Maestro pede as versões de entrega de um master que está no Drive; o computador da conta converte e sobe na pasta
do projeto. Reaproveita a ponte que já existe (`maestro-sobedesce.md`): **o destino continua `sobedesce`** (é ele quem
tem a fila, o Drive e o ffmpeg), com três ações novas na lista fechada `PONTES` (`packages/core/src/pedidos-entre-apps.ts`).
Pedir conversão exige o **Relay no plano** da organização (incluído em todo plano pela `0031`) além do SOBEDESCE.

| Ação              | Rota (SOBEDESCE, `POST`)   | Corpo                                                                                                                                     | Resposta                                                              |
| ----------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `relay.converter` | `/api/zro/relay/converter` | `{ arquivoId, presets: string[] (1–8, ids de src/presets.js), pastaId?: id (sem ele, a pasta do original), ref: string (≤ 120), conta? }` | `202 { pedidos: [{ id, preset, ref, status }] }`                      |
| `relay.pedido`    | `/api/zro/relay/pedido`    | `{ ids: string[] (≤ 50) }`                                                                                                                | `{ pedidos: [Pedido], computador: { aberto_agora, usado_ha_pouco } }` |
| `relay.cancelar`  | `/api/zro/relay/cancelar`  | `{ id }`                                                                                                                                  | `{ cancelado: true, ja_terminado }`                                   |

- **Idempotência:** `ref` é do Maestro (sugestão: id da versão). Cada item da fila tem a chave `ref:preset`; pedir de
  novo a mesma chave devolve o pedido que já existe (pendente, em andamento ou pronto), nunca um segundo arquivo.
- **`Pedido`** = `{ id, preset, ref, status: 'pendente' | 'convertendo' | 'pronto' | 'erro' | 'cancelado', frac?,
resultado?: { arquivoId, nome, tamanho, md5, pastaId }, erro?, criado_em, atualizado_em }`. "pronto" só com o MD5
  do Drive igual ao do arquivo convertido (regra do SOBEDESCE). O nome segue `nomeSaida`: `<original> (<preset>).<ext>`.
- **Quem executa:** a fila `pedidos_proxy` do SOBEDESCE ganha o tipo `relay` (ajustes `{ preset, pastaId, ref }`); o
  app de computador da conta pega (409 se outro levou), converte com `converterComRelay` (x264, qualidade constante)
  e sobe em `pastaId`. Sem computador aberto, o pedido espera; `computador` na resposta diz se há um aberto agora ou
  usado há pouco, para o Maestro dizer isso à pessoa sem prometer prazo.
- **Andamento:** o Maestro consulta `relay.pedido` enquanto a ficha da versão está aberta (a cada 5 s, como as prévias
  do celular) e guarda o resultado no próprio banco. Sem evento na v1: `media.conversion.completed` (fonte `relay`,
  `{ projeto, origem, resultado, preset, md5 }`, projeto = id canônico de `zro.projects`) entra quando o HUB receber o
  resultado de alguém; até lá, nada de evento inventado.
- **Presets na tela do Maestro:** cópia de `products/relay/src/presets.js` e `src/plano.js` (o peso estimado é
  `planejar(origem, preset).tamanhoEstimado`, com `origem` do `ItemDrive.video`) em `products/maestro/src/lib/relay/`,
  conferida por teste do Maestro contra `products/relay`. Primeiro os de `ENTREGA_AO_CLIENTE` (YouTube 1080p e 4K,
  Reels · No Compress, Feed 4:5, TikTok, WhatsApp, Vimeo, E-mail); os outros em "Mais". "Tamanho exato" fica de fora
  (pede o MB na hora).
- **Quem constrói o quê:** Relay/SOBEDESCE (este lado): as três rotas, o tipo `relay` na fila, o executor no app de
  computador e as ações na `PONTES` com teste. Maestro: a ficha "Gerar versões", a cópia dos presets e o
  acompanhamento. Estado: contrato definido; implementação a seguir.

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
