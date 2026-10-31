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
  (NOSSOM), cópia e backup (SOBEDESCE). O Relay **aplica** a cor da Revela na exportação (seção "Cor da Revela"), mas
  a conta é da Revela.

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
  `media-src 'self' blob:`, `frame-src https://sobedesce.absolutezro.com` (o "Escolher no Drive").
  `Cross-Origin-Opener-Policy: same-origin`; sem `Cross-Origin-Embedder-Policy` desde 30/10/2026: ele barraria o
  SOBEDESCE embutido e nada do conversor usa SharedArrayBuffer (o Mediabunny só confere o tipo).
- **Arquivo grande:** acima de 1,5 GB, salvar direto numa pasta (`showDirectoryPicker`); na memória, o celular não
  monta o arquivo.
- **Uma conversão por vez** por aba (o codificador de hardware é um só).

## Onde cada plataforma recebe o Relay

| Plataforma          | Onde aparece                                                                                                                                                              | Jeito              | O que a plataforma prepara                                                                                                                                                                                                                                                                                                                                                                           | Estado                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **SOBEDESCE**       | Botão direito num vídeo ou áudio do Drive (computador) e menu do arquivo no celular: "Converter com o Relay"                                                              | 1 (computador) e 3 | Feito: `src/relay/` e `web/public/app/relay/` são cópias conferidas por teste (`test/relay.test.js`; o Relay confere do lado dele em `test/copias.test.js`), com os destinos do Relay (hoje 23) menos "Tamanho exato". Falta: "Baixar como…" das Referências e o pedido da Z (`pedidos_proxy` tipo `formato`) passarem pelos presets do Relay. Proxy 720p e tira de quadros ficam no SOBEDESCE.      | Feito (Converter); Baixar como e Z a fazer                 |
| **Revela**          | A aba Converter sai; no lugar, "Exportar com o Relay" (jeito 2) depois do look aplicado. E o inverso: a receita de cor da Revela (CST + look) no preset do Relay, em lote | 2                  | Tirar `converter.html`, `app/converter.js` e `src/conversao/` do dock; o script do Deliver do Resolve lê os presets do Relay. Fica na Revela: LUT, PowerGrade, CST e looks (a cor de saída BT.709 continua decisão da Revela). Feito no Relay (30/10): a cor da Revela na exportação, desligada até a Revela abrir (seção "Cor da Revela"). Falta na Revela: os looks pela conta (`/api/zro/looks`). | Relay pronto (desligado); Revela a fazer                   |
| **AEON**            | Exportar o vídeo final da timeline (hoje `app/render.js`, só H.264 no tamanho do projeto)                                                                                 | 1 (navegador)      | Na tela de exportar, a grade de presets do Relay; o render passa a pedir tamanho, cadência e bitrate ao `planejar` do Relay. O AEON continua desenhando os quadros (cortes, zoom, legenda); o Relay decide como gravar.                                                                                                                                                                              | A fazer                                                    |
| **NOSSOM**          | Exportar o áudio tratado (hoje WAV PCM16 e MP3 320 em `lib/audio.ts`)                                                                                                     | 1 (navegador)      | Os formatos de saída pelos presets de áudio do Relay (MP3 320, AAC 256, WAV 48 kHz 24 bits). O NOSSOM mantém medição e loudness; o Relay só grava.                                                                                                                                                                                                                                                   | A fazer                                                    |
| **Synquei**         | Depois da sincronia: "Deixar pronto para editar" nos clipes de celular (cadência variável) e proxies                                                                      | 3 (ou 2)           | Marcar no relatório os clipes com cadência variável; pedir ao computador a versão de cadência constante e o proxy pelo preset `proxy`. As exportações de projeto (XML, OTIO, EDL) continuam no Synquei.                                                                                                                                                                                              | A fazer (depende de preset de cadência constante no Relay) |
| **Maestro**         | Versões de entrega do card: gerar as versões (YouTube, Reels, WhatsApp para o cliente) a partir do master aprovado                                                        | 3                  | Ver "Maestro → Relay" abaixo: ações `relay.converter`, `relay.pedido` e `relay.cancelar` pela ponte do HUB (destino `sobedesce`), cópia dos presets em `products/maestro/src/lib/relay/`.                                                                                                                                                                                                            | Feito (Maestro, HUB e SOBEDESCE)                           |
| **HUB e a Z**       | Catálogo (incluído em todos os planos), família no menu, e a Z: "me manda isso em MP4 720p"                                                                               | 3                  | Feito: produto `relay` no catálogo (migration `0031`, incluído em todo plano, sem limites, gate em `development`), ícone em `apps/hub-web/public/products/relay.svg`, `ProductId` com `relay`, o Relay no guia da Z. Na abertura: migration nova com `stage`, `external_url` e o gate.                                                                                                               | Feito (fechado até o deploy)                               |
| **TPeasy**          | Gravações do teleprompter: "Exportar com o Relay" para mandar a gravação no formato da rede                                                                               | 2                  | Link com o preset; nada de conversão própria.                                                                                                                                                                                                                                                                                                                                                        | Futuro                                                     |
| **Carro do Freela** | Portfólio e reel do freela: "Comprimir com o Relay" antes de subir                                                                                                        | 2                  | Link com o preset `tamanho` ou `vimeo`.                                                                                                                                                                                                                                                                                                                                                              | Futuro                                                     |

## Maestro → Relay: "Gerar versões com o Relay" (lançam juntos; decisão do titular, 29/10/2026)

O Maestro pede as versões de entrega de um master que está no Drive; o computador da conta converte e sobe na pasta
do projeto. Reaproveita a ponte que já existe (`maestro-sobedesce.md`): **o destino continua `sobedesce`** (é ele quem
tem a fila, o Drive e o ffmpeg), com três ações novas na lista fechada `PONTES` (`packages/core/src/pedidos-entre-apps.ts`).
Pedir conversão exige o **Relay no plano** da organização (incluído em todo plano pela `0031`) além do SOBEDESCE.

| Ação              | Rota (SOBEDESCE, `POST`)   | Corpo                                                                                                                                     | Resposta                                                                                      |
| ----------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `relay.converter` | `/api/zro/relay/converter` | `{ arquivoId, presets: string[] (1–8, ids de src/presets.js), pastaId?: id (sem ele, a pasta do original), ref: string (≤ 120), conta? }` | `202 { pedidos: [{ id, preset, ref, status }] }`                                              |
| `relay.pedido`    | `/api/zro/relay/pedido`    | `{ ids: string[] (0 a 50; vazio = só os computadores) }`                                                                                  | `{ pedidos: [Pedido], computador: { aberto_agora, usado_ha_pouco, relay?, desatualizado? } }` |
| `relay.cancelar`  | `/api/zro/relay/cancelar`  | `{ id }`                                                                                                                                  | `{ cancelado: true, ja_terminado }`                                                           |

Corpos e respostas em zod (`packages/media-contracts/src/ponte.ts`, `Relay*Schema`) e em JSON Schema
(`schemas/sobedesce.relay-*.v1.schema.json`, `npm run contracts:export`). No HUB, as três ações estão na `PONTES`
desde 30/10/2026 e pedem o SOBEDESCE (destino) **e** o Relay no plano (`PRODUTO_DA_ACAO`; o gate do Relay é o do
site, canal `web`, porque o Relay não tem API própria); sem o Relay, 403 `entitlement_required` com
`details.product = relay` e nada assinado. `relay.pedido` (o acompanhamento) tem limite próprio (300 em 10 min por
pessoa), para não gastar o do Drive. Nenhuma `relay.*` anda sem a pessoa (credencial do app).

- **Só quando funciona (lançamento, 30/10/2026):** o app de computador diz ao site o que sabe fazer em todo pedido
  (`x-sobedesce-capacidades: relay`, desde a 0.2.0; gravado em `sessoes.capacidades`, migração SOBEDESCE
  `0017_capacidades_do_computador`, na hora em que muda). `relay.pedido` devolve `computador.relay` (algum computador
  da conta converte) e `computador.desatualizado` (há computador, só com app antigo, e o instalador do `/baixar` já é 0.2.0+: ninguém é mandado atualizar para uma versão que ainda não saiu). O Maestro pergunta ao abrir o
  card (`ids: []`) e só mostra "Gerar versões" com `relay`; com `desatualizado`, no lugar do botão, "Atualize o
  SOBEDESCE no computador para gerar versões."; sem computador, sem SOBEDESCE ou sem o Relay no plano, nada. O site
  confere de novo: `relay.converter` sem computador que converta é `409 sem_computador_relay` e nada entra na fila.
  App antigo continua funcionando igual (sem o cabeçalho, nenhuma capacidade).
- **Idempotência:** `ref` é do Maestro (sugestão: id da versão). Cada item da fila tem a chave `ref:preset`; pedir de
  novo a mesma chave devolve o pedido que já existe (pendente, em andamento ou pronto), nunca um segundo arquivo.
- **`Pedido`** = `{ id, preset, ref, status: 'pendente' | 'convertendo' | 'pronto' | 'erro' | 'cancelado', frac?,
resultado?: { arquivoId, nome, tamanho, md5, pastaId }, erro?, criado_em, atualizado_em }`. "pronto" só com o MD5
  do Drive igual ao do arquivo convertido (regra do SOBEDESCE). O nome segue `nomeSaida`: `<original> (<preset>).<ext>`.
- **Quem executa:** a fila `pedidos_proxy` do SOBEDESCE ganha o tipo `relay` (ajustes `{ preset, pastaId, ref }`,
  `chave = ref:preset` com índice único parcial; migração SOBEDESCE `0016_pedidos_relay`); o app de computador da conta
  pega (409 se outro levou; `src/engine/pedidos-relay.js`), converte com `converterComRelay` (x264, qualidade
  constante, os presets e o plano de `src/relay/`, cópias conferidas de `products/relay`) e sobe em `pastaId`, sempre
  como arquivo novo (`<original> (<preset>).<ext>`, nome repetido ganha `… 2`, nunca por cima; o original não muda).
  O site confere a pasta (existe, é pasta, mesmo Drive do original) antes de pôr na fila. Sem computador aberto, o
  pedido espera; `computador` na resposta diz se há um aberto agora (notícia em 2 min) ou usado há pouco (15 min),
  para o Maestro dizer isso à pessoa sem prometer prazo. Preset com a cor da Revela (`cor`) não entra (o computador
  ainda não aplica a cor igual ao navegador). Até 100 versões esperando por pessoa (`429 fila_cheia`).
- **Andamento:** o Maestro consulta `relay.pedido` enquanto a ficha da versão está aberta (a cada 5 s, como as prévias
  do celular; 15 s quando tudo está na fila e o computador está fechado) e guarda o resultado no próprio banco. O
  estado só anda para a frente: "pronto" é final; "erro" e "cancelado" são finais para aquele pedido (pedir de novo
  cria outro); resposta repetida ou atrasada não desfaz nada.
- **Despacho ambíguo** (regra da raiz): `relay.converter` saiu e a resposta não voltou (rede, tempo, 5xx, 2xx sem
  pedido) → o Maestro marca o item **Conferir** (`revisar`, só do lado do Maestro) e nunca tenta de novo sozinho. A
  pessoa toca em "Conferir": o Maestro pede de novo a mesma chave `ref:preset` e a fila devolve o que já tem (ou cria,
  se o primeiro nunca chegou). Pedido que `relay.pedido` não devolve mais (sumiu da fila) também vai para Conferir.
  `relay.cancelar` sem resposta não muda o estado; o acompanhamento traz o de verdade. Recusa clara (4xx) não grava.
- **Computador fechado:** o pedido espera, a ficha diz "Começa quando o computador com o SOBEDESCE abrir" (nunca
  prazo) e oferece, por item, o Relay no navegador (jeito 2: `converter?preset=<id>&de=maestro`, todo preset que o
  Maestro oferece; a pessoa baixa o original do Drive e o arquivo não volta para o card sozinho). Sem evento na v1: `media.conversion.completed` (fonte `relay`,
  `{ projeto, origem, resultado, preset, md5 }`, projeto = id canônico de `zro.projects`) entra quando o HUB receber o
  resultado de alguém; até lá, nada de evento inventado.
- **Presets na tela do Maestro:** cópia de `products/relay/src/presets.js` e `src/plano.js` (o peso estimado é
  `planejar(origem, preset).tamanhoEstimado`, com `origem` do `ItemDrive.video`) em `products/maestro/src/lib/relay/`,
  conferida por teste do Maestro contra `products/relay`. Primeiro os de `ENTREGA_AO_CLIENTE` (YouTube 1080p e 4K,
  Reels · No Compress, Feed 4:5, TikTok, WhatsApp, Vimeo, E-mail); os outros em "Mais", nos grupos do Relay (Redes,
  Trabalho, TV, Tamanho, Áudio). "Tamanho exato" fica de fora (pede o MB na hora). O teste também confere que todo
  campo dos presets está tipado em `presets.d.ts` (preset novo com campo novo quebra o teste até tipar).
- **Quem pede no Maestro:** `podeEntregas` em `products/maestro/src/lib/acessos.ts` (administração, gestão e equipe
  pedem, conferem e cancelam; leitura acompanha o guardado e nunca pergunta ao SOBEDESCE), com as mesmas listas nas
  políticas de `maestro.entregaveis`. O acesso por cliente vale (card fora do alcance = nada).
- **Do lado do SOBEDESCE, o estado só anda para a frente:** só o computador que pegou muda o pedido; o andamento
  (`frac`) só cresce; `pronto` exige o resultado com o MD5 (sem MD5 do Drive para conferir é `erro`, e a versão fica na
  pasta); `pronto`, `erro` e `cancelado` são finais. Computador que some no meio (30 min sem sinal) vira `erro` ("veja
  na pasta se a versão chegou"), nunca volta sozinho para a fila nem vai para outro computador: ele pode ter subido a
  versão antes de sumir. Cancelar marca `cancelado` na hora; o computador vê o 409 no sinal de vida (30 s) ou na
  conferência logo antes de subir e para sem subir nada (o que já tinha subido fica no Drive: o SOBEDESCE nunca apaga
  mídia). Fechar o app antes de subir devolve o pedido para a fila; no meio do envio, vira `erro`.
- **Quem constrói o quê:** SOBEDESCE: as três rotas, o tipo `relay` na fila e o executor no app de computador. HUB:
  as ações na `PONTES` com teste (feito). Maestro: a ficha "Gerar versões", a cópia dos presets e o acompanhamento
  (feito).
- **Estado (30/10/2026):** Maestro, HUB e SOBEDESCE prontos no código (sem deploy). SOBEDESCE: as rotas
  `/api/zro/relay/{converter,pedido,cancelar}` (`products/sobedesce/web/src/lib/zro/relay.ts`), o tipo `relay` na fila
  (migração `0016`, ainda não aplicada no banco de produção) e o executor no app de computador
  (`src/engine/pedidos-relay.js`). Testes: `products/sobedesce/web/tests/zro-relay.test.mts` (rotas, fila, isolamento
  entre pessoas), `tests/zro-relay-ciclo.test.mts` (o ciclo pedido → fila → executor → acompanhamento, cada corpo e
  resposta conferidos contra os JSON Schemas deste contrato) e `products/sobedesce/test/pedidos-relay.test.js` (o
  executor, com o ffmpeg de verdade e o Drive falso). Do lado do Maestro, o mesmo contrato contra o SOBEDESCE de
  mentira (`products/maestro/tests/ponte-falsa.mts`). **Para funcionar de verdade falta:** o deploy do site do
  SOBEDESCE com a `0016` aplicada e um app de computador SOBEDESCE com este executor instalado (build e release novos);
  até lá, o site atual responde 404 e a folha do Maestro diz que ele não conseguiu agora (nada gravado), e um app de
  computador antigo não pega o tipo `relay` (o pedido espera).

## Cor da Revela na exportação (no código desde 30/10/2026; aparece quando a Revela estiver no ar)

Pedido do titular: exportar já convertendo o espaço de cor, em lote. Ex.: vários arquivos em S-Log3 / S-Gamut3.Cine
saindo em Rec.709, com um look da pessoa, ou 709 + look, num preset só.

- **Receita** (no preset da pessoa, campo `cor`, e no `.relay.json`): `{ entrada: id de câmera da Revela | null,
entradaNome, tom: 'suave' | 'nenhum', look: { id, nome } | null }`. Saída sempre Rec.709 SDR, marcada 1-1-1. Sem
  `entrada`, o arquivo já é Rec.709 e só o look entra.
- **Quem faz a conta:** a Revela. `products/relay/src/revela/` é cópia de `products/finishing/src/cor/espacos.js` e
  `cube.js`, conferida por `products/relay/test/copias.test.js`: **mudou a cor na Revela, copie para o Relay no mesmo
  commit.** `products/relay/src/cor.js` monta a receita em cima dela.
- **Ordem:** CST (log → Rec.709 gama 2.4, com o mapa de tom e a compressão de gamut da Revela) e depois o look, sobre o
  Rec.709 de tela de 0 a 1 (o que o Resolve passa a um nó depois da CST). Convenção de nível da Revela na CST: código ÷
  1023 (o arquivo de faixa de vídeo é desesticado antes).
- **Look de log** (LUT de câmera, look feito para o log; o Lab da Revela marca com `# Entrada:` no .cube): sem CST, a
  receita leva `look.sobre: 'log'` e o look lê o código da câmera (mesma convenção da CST), não o Rec.709 esticado. O
  Relay detecta pelo comentário e a pessoa troca em "O look recebe" (Rec.709 ou o log da câmera). Confirmado pela
  Revela em 30/10: "Meus looks" e o still do Lab são Rec.709 → Rec.709 (depois da CST); a LUT de câmera do Lab entra
  direto no log.
- **No navegador:** a CST é a conta na placa de vídeo (curva da câmera, matriz, tom, gamut e curva 2.4, em ponto
  flutuante; espelho em JavaScript conferido com a Revela em todas as câmeras: abaixo de 1,2/255), do quadro
  decodificado (10 bits em meia precisão) até o I420; o look vai numa LUT 3D. Sem WebGL2, a conversão recusa com o
  motivo. Uma LUT 3D de 65 pontos para a CST foi descartada: erra até ~30/255 em cor saturada.
- **No computador (ffmpeg):** `lut3d` tetraédrico com a receita assada em 65 pontos (`assarParaFfmpeg`), com o limite
  acima. Por isso o "Máxima qualidade" ainda **não leva** preset com cor (fica no navegador, e a tela diz). A fazer:
  a mesma conta no computador e o SOBEDESCE assando a receita.
- **Looks:** hoje a pessoa carrega um `.cube` (fica no aparelho, IndexedDB, `app/looks.js`); o preset guarda só o id
  e o nome. Sem o look no aparelho, a conversão diz qual falta (nunca sai sem ele). **Quando a Revela estiver no ar:**
  os looks dela (`src/cor/meuslooks.js`, "Meus looks") entram nessa lista pela conta Absolute ZRO; a Revela expõe
  `GET /api/zro/looks` (lista: id, nome, pontos) e `GET /api/zro/looks/:id` (o `.cube`), com `authorize()` no produto
  `finishing`. O Relay chama com a sessão da conta e guarda no aparelho.
- **Looks no Drive pelo SOBEDESCE** (pedido do titular, 30/10/2026; os looks não vão para o banco do Relay): no
  painel, "Escolher a pasta" (Chrome e Edge no computador, `app/pasta-looks.js`) e o Relay leva para ela os `.cube` que
  só estão no aparelho e traz os que só estão nela; nunca grava por cima nem apaga (mesmo nome, conteúdo diferente: fica
  e avisa). "Drive pelo SOBEDESCE" abre `sobedesce://looks` (`?trocar=1` escolhe as pastas de novo): o app abre o
  Comparar com a pasta dos looks e a do Drive, escolhidas uma vez, e a pessoa sobe o que falta e baixa o que só está no
  Drive. O link não leva caminho nenhum (`products/sobedesce/desktop/links.js`). No outro computador, o SOBEDESCE baixa
  a pasta e o Relay traz os looks dela. Nenhum byte passa por servidor.
- **Ligar:** `products/relay/app/recursos.js` (`RECURSOS.revela`). Nas prévias da Vercel e no `npm run dev` já liga;
  na produção, `REVELA=released` no projeto Vercel `relay` + deploy novo (decisão do titular, quando a Revela abrir).
- **Em lote:** o conversor já leva vários arquivos para vários destinos; um preset com a receita converte todos.

## "Escolher no Drive" pelo SOBEDESCE embutido (pedido do titular, 30/10/2026)

O conversor abre o SOBEDESCE num quadro (`https://sobedesce.absolutezro.com/app/?no=relay&modo=escolher&tema=…`,
o embutido de `products/sobedesce/web/public/app/lib/embutido.js`, o mesmo do Carro e do Maestro). A pessoa escolhe o
vídeo no Drive dela; o Relay lê o arquivo aos pedaços pelo quadro (Mediabunny `StreamSource`) e converte no aparelho.
Pronto, "Para o Drive" devolve o resultado à mesma pasta, pela fila do SOBEDESCE (o Drive confirma o tamanho). O token do Google
nunca sai do SOBEDESCE; nenhum byte passa por servidor; o cookie do SOBEDESCE (SameSite=Lax) vale porque os dois são
`*.absolutezro.com`.

Protocolo (`products/relay/src/drive.js`), `postMessage` só entre as duas origens:

| De → para      | Mensagem                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------- |
| quadro → Relay | `{ fonte: 'sobedesce', tipo: 'pronto' }` (a cada carga do quadro)                               |
| Relay → quadro | `{ fonte: 'relay', tipo: 'canal' }` + `MessagePort` (transfer): os pedidos abaixo andam por ele |
| quadro → Relay | `{ fonte: 'sobedesce', tipo: 'escolhido', arquivos: [{ id, nome, tamanho, mime, pasta }] }`     |
| Relay → quadro | `{ fonte: 'relay', tipo: 'tema', tema: 'claro' \| 'escuro' }`                                   |
| canal          | `{ pedido, tipo: 'ler', id, de, ate }` → `{ pedido, ok: true, dados: ArrayBuffer }` (até 32 MB) |
| canal          | `{ pedido, tipo: 'enviar', nome, mime, dados: Blob, pasta }` → `{ pedido, ok: true, envio }`    |
| canal (quadro) | `{ tipo: 'envio', envio, estado: 'enviando' \| 'enviado' \| 'erro', erro? }`                    |
| canal          | erro: `{ pedido, ok: false, erro }`                                                             |

Lado do SOBEDESCE (30/10/2026): anfitrião `relay` em `web/public/app/lib/embutido.js` e `web/next.config.ts`
(`frame-ancestors https://relay.absolutezro.com`), `ESCOLHER` (`?no=relay&modo=escolher`: o toque no vídeo vira
`escolhido`, em `components/browser.js`) e `lib/embutido-relay.js` (atende `ler` com Range e o token de lá, e `enviar`
pela fila de envios; o estado final é `enviado`, o Drive confirma o tamanho, não o MD5). No Relay o botão aparece com
`RECURSOS.drive` (`DRIVE=released` no projeto `relay`; nas prévias e no `npm run dev`, já).

## Eventos e conta

- **Evento** `media.conversion.completed` (fonte `relay`): só quando a primeira conversão passar pelo HUB (fila do
  computador ligada a um projeto). Payload mínimo: projeto, id do arquivo de origem e do resultado no Drive, preset,
  MD5. Rota em `packages/integrations/src/handlers.ts` e teste de ciclo (`findEventCycle`) passando. O pedido em si é
  uma chamada à API do Relay, não um evento.
- **Conta e acesso:** converter no aparelho não pede conta nem consome quota (nenhum custo de servidor). Fila do
  computador e Drive pedem a conta Absolute ZRO e passam por `authorize()` com o produto `relay`. Se um dia houver
  conversão em servidor, ela entra com `consumeQuota` (chave = id do pedido) e limite por plano.
- **Painel da conta** (`/painel`, 30/10/2026): `GET/POST/PUT/DELETE /api/relay/painel` (sessão do Relay; schema
  `relay`, papel `relay_app` com RLS). Conversões (só nomes e números, até 500 por pessoa, id do aparelho evita
  repetir), projetos (nome, destinos, `equipe`) e presets (a ficha de `src/personalizado.js`, `equipe`). A equipe é a
  organização ativa no login: vê e usa o que foi liberado, nunca muda nem vê o histórico de outra pessoa. O app de
  computador do Relay e o SOBEDESCE gravam no mesmo formato (`origem`: `computador` ou `sobedesce`), com o token da
  conta, quando ganharem login (rota com Bearer a fazer). Os looks (`.cube`) ficam no aparelho e vão ao Drive pela
  pasta + SOBEDESCE (seção "Cor da Revela").
- **Banco:** schema e papel próprios (`relay`) no Supabase `AbsoluteZRO`, nunca dentro de `zro` (ADR 0013).

## Presets (fonte: `products/relay/src/presets.js`)

Redes: YouTube 1080p, YouTube 1440p (o truque da nitidez), YouTube 4K, YouTube Shorts, Reels · No Compress, Instagram
Feed 4:5, TikTok, WhatsApp, LinkedIn, X. Trabalho: Vimeo, Apple HEVC, Slides, Vídeo de fundo, Proxy para edição. TV:
Smart TV, Smart TV 4K. Tamanho: Discord (20 MB), E-mail (25 MB), Tamanho exato. Áudio: MP3 320, AAC 256, WAV 48 kHz.

**Presets da pessoa** (`src/personalizado.js`, ficha versão 2): codec; tamanho (lado menor ou tela fixa com faixas,
preencher ou esticar); recorte; giro e espelho; cadência até um teto (divide por inteiro) ou exata (23,976, 29,97,
59,94, 48, 120 e as inteiras; o ffmpeg recebe a fração NTSC); qualidade em bitrate médio, constante (CBR), qualidade
constante (RF do x264; no navegador, a tabela do preset de partida) ou tamanho máximo; quadro-chave; trecho; áudio
(codec, bitrate, taxa, canais, volume em dB); computador (velocidade e ajuste do x264, perfil, desentrelaçar, ruído,
nitidez, volume normalizado em LUFS: só no "Máxima qualidade", e o navegador diz que ficaram de fora); cor da Revela.
Fichas da versão 1 abrem iguais.

Cada preset traz a fonte e a data da conferência (selo Oficial ou Mercado). No computador ainda virão ProRes, DNxHR e
HDR 10 bits; no navegador eles não existem (o WebCodecs não grava ProRes nem DNxHR).
