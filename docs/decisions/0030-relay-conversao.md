# ADR 0030 — Relay: conversão e exportação de mídia viram um setor próprio; a Revela fica só com a cor

**Status:** aceita (29/10/2026, pedido do titular). Nome: **Relay** (id técnico `relay`, domínio
`relay.absolutezro.com`; se o INPI pedir, vira "Relay Convert" sem mudar o id). Contrato de integração com cada
plataforma: [docs/integration-contracts/relay.md](../integration-contracts/relay.md).

## Contexto

A Absolute ZRO é um produto completo de pós-produção desmontado em setores: cada setor é um app que funciona e se
vende sozinho, e o conjunto se vende como integração (Ciclo do O, PRD §1 e §4.3). Até aqui a conversão de mídia (o
"Handbrake" do ecossistema) não tinha dono e estava espalhada:

| Onde                          | O que converte                                                                                                                                                                                                                                                                                                                                                                                           | Motor                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Revela (`products/finishing`) | Conversor do navegador (`app/converter.js`), plano (`src/conversao/plano.js`) e presets por destino (`src/entrega/destinos.js`)                                                                                                                                                                                                                                                                          | Mediabunny + WebCodecs                    |
| SOBEDESCE                     | "Converter com a Revela" (`src/media/revela.js`, com **cópia** do plano e dos presets em `src/revela/`), prévia 720p e tira de quadros (`src/media/previa*.js`, `quadros.js`), "Baixar como…" MP3/WAV/M4A/MP4/JPG (`src/referencias/formatos.js`), VP9/AV1 → H.264 para o iPhone (`src/referencias/celular.js`), fila de pedidos do celular e da Z (`pedidos_proxy`, tipos `proxy`, `frames`, `formato`) | ffmpeg do app com codificador de hardware |
| AEON (`products/ai-edit`)     | Render final da timeline (`app/render.js`)                                                                                                                                                                                                                                                                                                                                                               | WebCodecs                                 |
| NOSSOM                        | Exportação WAV/MP3 do tratamento (`lib/audio.ts`)                                                                                                                                                                                                                                                                                                                                                        | ffmpeg.wasm                               |

Em 29/10/2026 o titular decidiu que a Revela vira um **laboratório de cor** (looks, conversão de espaço de cor, LUT e
PowerGrade) e que codec, contêiner e formatos de vídeo e áudio passam a ser de uma **plataforma nova**, que as outras
chamam.

## Decisão

- **Revela = cor.** Looks, conversão de espaço de cor (LOG → Rec.709 e afins), clonar look por referência, LUT
  (`.cube`) e PowerGrade (`.drx`). Saem dela o conversor de vídeo e os presets de codec, contêiner e áudio por destino.
  Esta ADR substitui, na [0015](0015-finishing-resolve-powergrade-lut.md), os itens "Conversor no navegador",
  "Converter com a Revela no SOBEDESCE" e a parte de codec, contêiner e áudio da "Entrega por destino". O resto da 0015
  continua valendo.
- **Plataforma nova = conversão.** Dona única de codec, contêiner, resolução, bitrate e áudio de saída, dos presets
  por destino (com fonte e data de verificação, regra do PRD §8) e do plano de conversão (decisão pura e testada).
  Funciona sozinha: solta o arquivo, escolhe o destino, sai a versão nova. Pasta `products/relay/`, domínio
  `relay.absolutezro.com` (ADR 0025), schema e papel próprios (`relay`) no Supabase `AbsoluteZRO` (ADR 0013).
- **Grátis e aberto** (decisão do titular, 29/10/2026): o Relay é a porta de entrada do ecossistema. Converter no
  aparelho não pede conta e não consome quota (nenhum custo de servidor). A conta Absolute ZRO entra só no que toca a
  conta (Drive, o computador da pessoa, histórico). Grátis em todos os planos do catálogo.
- **Qualidade no nível do HandBrake, ou acima.** No computador, o mesmo x264 do HandBrake (CRF com o bitrate do
  destino como teto, duas passadas no tamanho exato); no navegador, Lanczos na placa, cor marcada BT.709 e bitrate com
  folga para os codificadores de hardware. Medido contra os presets do HandBrake em
  `products/relay/docs/QUALIDADE.md`, sem esconder onde o navegador perde.
- **Dois motores, um plano.** Navegador (Mediabunny + WebCodecs, o arquivo não sai do aparelho) e computador (ffmpeg
  com o codificador do chip ou da placa). Os dois seguem o mesmo plano e os mesmos presets. No primeiro recorte, quem
  executa no computador continua sendo o app do SOBEDESCE, que já tem o ffmpeg, o Drive e a fila. Um app de computador
  próprio só vem se o titular pedir.
- **Divisão entre os setores.** O que um app precisa para cumprir a própria promessa continua nele, usando o mesmo
  motor:
  - o SOBEDESCE gera a prévia 720p e a tira de quadros, para tocar o que subiu;
  - o AEON renderiza a timeline que montou;
  - o NOSSOM exporta o áudio que tratou.

  Converter para entregar ou para levar a outro lugar é do Relay, onde quer que o botão apareça: "Converter com a
  Revela" (vira "Converter com o Relay"), "Baixar como…", a Z pedindo "MP4 720p", as versões de entrega de um master.
  Mesmo quando o app grava sozinho (AEON, NOSSOM), os formatos e números de saída vêm dos presets do Relay.

- **Integração, em três jeitos** (detalhes no contrato): núcleo embutido (o app copia `presets.js`, `plano.js` e o
  motor, com teste que confere a cópia), "Abrir no Relay" (link com o preset) e pedido ao computador (fila). O botão
  diz "Exportar com o Relay", com o ícone dele. Nunca converte escondido e nunca finge. Fila e Drive passam por
  `authorize()` com o produto `relay`; se um dia houver conversão em servidor, ela entra com `consumeQuota` (chave =
  id do pedido).
- **Fila.** Nasce do modelo de `pedidos_proxy` do SOBEDESCE: pedido → um computador da conta pega (409 se outro levou)
  → converte → sobe ao lado do original → confere o MD5 → pronto. Fica no schema da plataforma nova. Pedido ambíguo
  vai para revisão, nunca para nova tentativa sozinho. "Pronto" só depois da conferência.
- **Eventos no HUB.** Entram quando a primeira integração passar pelo HUB: `media.conversion.completed` (fonte: a
  plataforma nova), com rota em `packages/integrations/src/handlers.ts` e o teste de ciclo passando. O pedido em si é
  uma chamada à API da plataforma nova, não um evento.
- **Mídia.** O original nunca muda. A saída é sempre um arquivo novo ao lado dele, com prévia e confirmação.

## Ordem

1. **Relay de pé.** `products/relay/` com identidade, página inicial, conversor, presets e o laboratório de
   qualidade. A cópia do SOBEDESCE (`src/revela/`) vira `src/relay/`, conferida contra o Relay; o botão vira
   "Converter com o Relay". O catálogo do HUB e a Z passam a conhecer o Relay.
2. **Integrações.** A Revela tira a aba Converter e aponta para o Relay; AEON e NOSSOM exportam pelos presets do
   Relay; Synquei e Maestro pedem versões pela fila (contrato, tabela por plataforma).
3. **O que ninguém faz hoje:** fila em lote com vários destinos de uma vez, ProRes e DNxHR de saída (computador),
   HDR 10 bits, loudness normalizado na exportação, legenda queimada, corte de trecho e presets salvos pela pessoa.

## Consequências

- Os presets de entrega deixam de ter duas cópias com dono pouco claro: a plataforma nova é a fonte, e quem copia
  confere por teste.
- A Revela fica menor e focada. O script do Deliver do Resolve (ADR 0015) usa os presets da plataforma nova, mas as
  tags de cor (BT.709, `cor.resolve`) continuam sendo decisão da Revela.
- Um projeto Vercel novo, o domínio e a migration do schema pedem autorização do titular antes do deploy.
- Até a Revela apontar para o Relay, o conversor dela continua funcionando, sem mudança para quem usa.

## Como reverter

Antes do passo 1, basta apagar esta ADR. Depois dele, a Revela volta a ter o conversor, a cópia do
SOBEDESCE volta a conferir contra a Revela e o produto sai do catálogo com migration nova. A fila e as quotas da
plataforma nova ficam sem uso e saem do jeito de sempre: migration nova, nunca editando uma aplicada.
