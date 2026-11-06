# Frames

Do vídeo final aos frames, takes e posts. Tela **Frames** no app do computador (`public/components/frames.js`),
motor em `src/frames/`, rotas em `src/server/frames.js`.

## Sobe e desce

- **Desce:** o vídeo pode vir do Drive. O computador baixa para um temporário (`baixarOriginal`, o mesmo download
  segmentado das prévias), faz tudo e apaga o temporário no fim.
- **No computador:** a pasta fica em `Downloads/Frames/` (ou onde a pessoa escolher), para postar em alta.
- **Sobe:** a pasta pronta entra na fila de envio, ao lado do vídeo original no Drive ou na pasta escolhida.
  Pode subir no fim do trabalho (automático) ou depois, pelo botão "Subir pro Drive".

## A pasta

```
<Vídeo> — Frames e Takes/
  Frames/Cena 01 — Claro, Quente, Calmo/<Base>_C01_F001_00-00-03-12.jpg
  Takes/<Base>_C01_T01_00-00-03-12_9x16.mp4
  Posts/<Base>_Post_Tríade 3_4x5.jpg
  indice.csv
```

- `<Base>`: o nome do vídeo sem espaços nem símbolos (`Filme Final v3.mov` → `Filme_Final_v3`).
- `C03`: cena. `F012` / `T02`: número do frame ou do take. `00-01-23-12`: timecode (h-m-s-quadro).
- A pasta da cena leva as etiquetas automáticas (luz, cor, movimento) ou o nome que a pessoa der (vira a pasta).
- `indice.csv`: tipo, arquivo, cena, etiquetas, segundos, timecode, formato e nota. Abre no Excel com acentos.
- O que é do app (miniaturas, candidatos, descartados) fica em `~/.sobedesce/frames/<id>/`, fora da pasta entregue.

## O bom senso da escolha (`escolha.js`)

Uma leitura pequena do filme (256 px, até 4 amostras/s): nitidez (variância do Laplaciano), exposição, contraste,
cor, uma impressão digital (dHash) e a diferença para a amostra anterior.

- **Cenas:** corte onde a imagem salta bem acima do normal do vídeo, ou onde a luz/cor muda de uma vez.
- **Fica de fora:** tela preta, branca, estourada ou fechada demais; tela chapada (fusão, letreiro em fundo liso);
  desfocado ou tremido (nitidez abaixo de 35% da referência da própria cena, que não desce de 1/4 da do filme);
  a 0,35 s de um corte; repetido (dHash a menos de 10 bits de um já escolhido).
- **Espalhado:** cada cena ganha frames pela raiz do tempo dela; dentro da cena, um por trecho.
- Se faltar, completa com os que sobraram e, por último, com os só um pouco diferentes (a mais de 1 s). Qualidade
  não cede: pode sair menos do que o pedido, e a tela conta o que ficou de fora.
- **Takes:** a janela com a melhor nota média de cada cena; se pedir mais, outros trechos das cenas longas, sem
  encostar nos escolhidos.

## Em alta (`extracao.js`)

- Frame no tempo exato, no tamanho do arquivo: JPEG na qualidade máxima com cor 4:4:4, PNG ou TIFF (LZW).
- Take: H.264 em alta (o codificador de hardware do computador, sem o teto da prévia) ou ProRes 422 HQ;
  original, 9:16, 4:5 ou 1:1 (recorte pelo centro), fade curto, com ou sem som.
- Logomarca (PNG, JPG ou WebP): canto ou centro, tamanho e opacidade; nos frames, nos takes e nos posts.

## Na tela

- Frames por cena: abrir em tela cheia, **outro frame** (troca por um bom e diferente da mesma cena),
  **descartar** e voltar, **mais um** da cena, **frame num ponto** exato, nome da cena.
- Takes: passar o cursor toca; "também em" 9:16, 4:5, 1:1, original, ProRes ou H.264.
- Posts (`public/lib/frames-posts.js`, canvas em 2160 px): Tríade (3, 4, 5), Grade (2×2, 3×3), Polaroid (1 a 3),
  Box, Cinema (2,39:1), Contato e Carrossel contínuo (2 ou 3 slides). 4:5, 1:1 ou 9:16; fundo preto, branco ou
  grafite; título, legenda e logomarca. Usa os frames escolhidos na aba Frames ou escolhe sozinho.
- Enquadramento por frame (`enquadres[i] = { x, y, zoom }`, zoom até 3×): tocar ou clicar no frame da prévia escolhe; arrastar move (até a borda do frame encostar na caixa); pinça, roda do mouse ou a barra aproximam; Centralizar volta ao meio. Vale em qualquer formato (fica guardado por frame) e sai igual no post em alta. `frameNoPonto` acha o frame tocado (na polaroid, desfaz o giro).

## Cor (pré-color)

O passo **Cor** diz como o frame sai (`src/cor/grade.js`, `public/components/frames.js` › `CorPasso`):

- **Original**: como está no arquivo.
- **Rec.709 da câmera**: a mesma conversão de monitor da prévia (`src/cor/lut.js`).
- **Sua LUT**: um `.cube` 3D do computador ou do Drive (desce uma vez). Fica em "Usadas antes" (até 20), em
  `~/.sobedesce/frames/luts/`. A LUT é conferida antes de aceitar: LUT 1D, shaper ou arquivo incompleto são recusados
  com o motivo.
  - **A LUT recebe**: o log da câmera (LUT de câmera, a que o colorista exporta para o log) ou o Rec.709 (LUT criativa: o app converte o
    LOG antes).
  - **Intensidade**: mistura o look com o Rec.709 neutro da câmera.
- **Câmera**: automático pelos metadados do arquivo (`src/cor/detectar.js`, os mesmos da prévia do Drive) ou escolhida.
  Arquivo que não diz a câmera fica em Rec.709 até a pessoa escolher.
- **Ajuste rápido**, antes da LUT, na luz do arquivo: exposição (±2 stops), temperatura, contraste (em volta do cinza
  18%), preto (abaixo de 0 assenta só a sombra funda; acima levanta o preto) e saturação.

Tudo vira **uma LUT só** (33³), gravada na pasta de dados do trabalho (`cor.cube`), e o ffmpeg aplica numa passada:
YUV → RGB de ponto flutuante com a matriz e a faixa explícitas, `lut3d` tetraédrico (`extracao.js` › `filtroCor`). Vale
nos frames, nos takes (marcados BT.709), em "outro frame", "frame num ponto" e "take em outro formato", e na leitura do
filme: a escolha mede a imagem já com a cor (LOG lavado não vira "P&B"). O arquivo original não muda e a pasta entregue
não ganha a LUT.

A **prévia** é um frame do vídeo do computador (a um terço), 960 px, pelo mesmo caminho, antes e depois. Vídeo do
Drive: a cor entra quando ele desce.

## Pasta ou cartão (os brutos)

A origem **Pasta ou cartão** (`src/frames/pasta.js`) faz **um frame por clipe**, para ver os brutos de uma diária já com
a cor:

- Lista os vídeos da pasta e das subpastas, na ordem do nome ("C0002" antes de "C0010"). Ficam de fora o proxy da câmera
  (`Proxy/`, a `SUB/` da Sony), miniaturas, pastas ocultas e o que o próprio app gerou. RAW (BRAW, R3D…) o conversor não
  lê: entra só a contagem, e a tela avisa.
- Cada clipe: 7 pontos entre 8% e 92% da duração (longe da claquete e da câmera parando), medidos em 256 px já com a cor,
  pelas mesmas regras do filme (`escolha.js` › `nota`). Fica o melhor; os outros são o "Outro frame" daquele clipe.
  Nenhum serve (tudo escuro, chapado)? Fica o de mais contraste, para o clipe não sumir.
- A cor é montada uma vez por câmera (automático: os metadados de cada clipe; `cor-<perfil>.cube` na pasta de dados).
- Sai `<Pasta> — Frames/Frames/<Clipe>_F001_<timecode>.jpg` e o `indice.csv`. Sem takes e sem "frame num ponto".
- **Frames do cartão** (Cartões › Backup Automático): com o "Cartão OK", o botão abre o Frames com a pasta do vídeo do
  cartão no primeiro destino (`pastaVideo` na descarga). A cor que aquele dono usou fica lembrada e volta no próximo
  cartão dele.
- **Pré-color automático**: com "Frames com cor ao terminar o cartão" ligado no projeto, o cartão OK já vira frames
  sozinho (`FramesService.precolorDoCartao`), com a cor que o dono usou por último (guardada no motor,
  `frames/cor-donos.json`; sem nenhuma, o Rec.709 da câmera). O trabalho se chama "Dono · Cartão NN". Rodando outro
  trabalho, o cartão espera a vez (uma fila); a cópia nunca espera a cor.

Com cor, cada frame tem também o **antes** (o mesmo quadro sem a cor, até 2160 px) na pasta de dados do trabalho
(`antes/F001.jpg`): a pasta entregue continua só com a cor.

## API

| Rota | O quê |
| --- | --- |
| `GET /api/frames` | trabalho atual e histórico |
| `POST /api/frames` | começa: `{ origem: { tipo: 'local', caminho } \| { tipo: 'pasta', caminho } \| { tipo: 'drive', accountId, fileId }, ajustes }` |
| `DELETE /api/frames/job/:jobId` | para |
| `GET /api/frames/:id` | o trabalho (cenas, frames, takes, posts) |
| `DELETE /api/frames/:id` | tira da lista (a pasta fica) |
| `POST /api/frames/:id/descartar` · `mais` · `no-ponto` · `cena` · `take` | edições |
| `POST /api/frames/:id/post?tipo=&proporcao=` | corpo = PNG/JPEG do post |
| `POST /api/frames/:id/post/apagar` | tira um post |
| `POST /api/frames/:id/subir` | `{ para: 'junto' \| { accountId, folderId, driveId, name } }` |
| `GET /api/frames/:id/arquivo?p=\|mini=\|alta=&k=` | arquivo do trabalho (chave da mídia), com Range |
| `GET /api/frames-logo?p=&k=` | prévia da logomarca |
| `POST /api/frames/pasta` | `{ caminho }` → `{ nome, clipes, primeiro, ignorados: { raw, demais } }` (antes de começar) |
| `GET /api/frames-cor/luts` | as LUTs usadas antes |
| `POST /api/frames-cor/lut` | guarda uma LUT: `{ tipo: 'local', caminho }` \| `{ tipo: 'drive', accountId, fileId }` → `{ lut }` |
| `POST /api/frames-cor/lut/esquecer` | `{ id }` tira da lista |
| `POST /api/frames-cor/previa` | `{ caminho, cor, t? }` → `{ previa, perfil, perfilNome, perfilOrigem, resumo }` |
| `GET /api/frames-cor/previa?id=&k=` | a imagem da prévia |

`ajustes.cor` (no `POST /api/frames`): `{ modo: 'original' \| '709' \| 'lut', perfil: 'auto' \| id, lut: { id }, espera:
'log' \| '709', intensidade: 0–1, ajustes: { exposicao, temperatura, contraste, preto, saturacao } }` (-100 a 100); null
= sem cor.

Progresso pelo SSE `frames`: `{ jobId, status, fase, frac, texto, video, manifestoId, erro }`.

## Celular (aba Criar)

- **Frames no celular** (`web/public/app/lib/frames/celular.js`, `components/criar.js`):
  - O vídeo vem direto do Drive, pelo stream do app (não baixa inteiro), ou da galeria.
  - Um `<video>` escondido pula entre 24 e 240 pontos do filme (2 por segundo) e mede cada um em 256 px.
  - Velocidade:
    - Vídeo do Drive até 150 MB desce inteiro uma vez (um download seguido) e a análise pula no próprio celular. Acima disso, lê pelo stream, com no máximo 120 pontos.
    - Três leitores (`<video>` no mesmo endereço; dois em 4K) leem trechos diferentes ao mesmo tempo.
    - Cada pulo espera o aviso de quadro novo (`requestVideoFrameCallback`, pedido antes do pulo). O vídeo fica com opacidade 0,01: com 0, o aviso nunca chega e cada pulo esperava o prazo inteiro (250 ms).
  - A escolha usa as **mesmas regras** do computador: `medidas.js`, `escolha.js` e `posts.js` são cópias idênticas, conferidas em `test/frames.test.js`.
  - Os frames saem no tamanho do vídeo, em JPEG 0,95 ou PNG.
  - Salvar no celular: pela folha de compartilhar (Salvar imagem ou Arquivos); sem ela, um download por arquivo.
  - Subir pro Drive: `<Vídeo> — Frames/Cena NN — …/` e `Posts/`, ao lado do vídeo (ou onde a pessoa escolher, se veio da galeria).
  - Na aba Drive, a seleção de um vídeo ganha "Frames".
  - **Codec antes de abrir** (`lib/frames/codec.js`): lê só a caixa `moov` do MP4/MOV (Range do Drive ou `File.slice`), mesmo quando ela vem no fim do arquivo. A tela mostra o codec ("H.264 10-bit 4:2:2").
    - H.264 de 10 bits ou 4:2:2/4:4:4 (XAVC S-I, Canon, Panasonic) e DNxHD: nenhum iPhone decodifica, então nem tenta o original e vai direto ao proxy do Drive ou ao computador. A mensagem diz o motivo ("Este MP4 é H.264 10-bit 4:2:2, o modo de alta qualidade da câmera").
    - HEVC 4:2:2 e ProRes dependem do aparelho: tenta e, se falhar, explica pelo codec.
- **Completo, no computador** (`src/engine/pedidos-frames.js`):
  - O celular pede na mesma fila dos pedidos de proxy, com `tipo: "frames"` e os ajustes: frames, takes (9:16, 4:5, original; H.264 ou ProRes) e formato.
  - Apps do computador antigos não veem esses pedidos, porque a lista sem `tipo` é só de proxy.
  - O computador da mesma conta pega um por vez, faz pelo Frames e sobe a pasta ao lado do vídeo.
  - Se a pessoa estiver usando o Frames na tela, ele espera a vez. Sem ffmpeg, não pega.
  - O celular mostra o andamento: esperando, fazendo, pronto (com o resumo) ou erro (com Tentar de novo).
- **Calculadora** também está na aba Criar, com a mesma conta do computador e do site.

## Montagens (Estúdio › Montagens)

Fotos e takes do computador em modelos prontos (`public/components/montagens.js`, geometria e desenho em
`public/lib/montagens.js`). Três tipos: o post (foto, ou vídeo quando tem take), o carrossel contínuo (2 a 10 slides) e a
grade do perfil (3 colunas, 1 a 5 linhas, 3:4 ou 1:1, numerada na ordem de postar: o 1 é o de baixo, à direita). Formatos
com o tamanho de cada rede: 9:16 1080×1920, 4:5 1080×1350, 3:4 1080×1440, 1:1 1080×1080, 16:9 1920×1080, 1.91:1
1200×628, 2:3 1000×1500, 21:9 2560×1080, 2.39:1 2560×1072 e personalizado (200 a 4096 px).

**Faixas** (o modelo do pré-color para os Stories): 2 a 6 frames um embaixo do outro, no formato do frame (16:9, 1,85,
2,39, 4:3 ou tela cheia, que divide a altura), centrados; quando não cabem na largura toda, ficam mais estreitos sem
mudar o formato. Num formato vertical, a **zona segura dos Stories** (ligada no padrão) deixa livres os 250 px de cima e
os 340 px de baixo (em 1080×1920), onde ficam o perfil e o "responder". No trabalho do Frames, **Montar story** abre a
Montagens com os frames (já com a cor) em Faixas 9:16 (`public/lib/montagens.js` › `modeloFaixas`).

- **Antes e depois**: as faixas vão em pares, o arquivo em cima e a cor embaixo, com o rótulo ANTES/DEPOIS (1 a 3 pares).
  No trabalho do Frames com cor, o botão **Antes e depois** abre a Montagens já em pares.
- **Todas em stories**: as fotos na ordem, em grupos do tamanho do modelo, um JPG para cada grupo ("Nome 01", "Nome
  02"…); o último sai só com as faixas que tem.

Motor (`src/server/montagens.js`), tudo com a chave da mídia: `GET /api/montagens/foto` (TIFF e HEIC viram JPEG de
cache), `GET /api/montagens/info` (duração, tamanho, som do take), `GET /api/montagens/quadro?t=&l=` (um quadro do take,
para a agulha e a prévia), `GET /api/montagens/video` (o take para tocar, com Range), `POST /api/montagens/salvar`
(JPEG/PNG, nome novo sempre) e, para vídeo, `POST /api/montagens/base` (a camada da tela em PNG, com buracos onde os
takes tocam) + `POST /api/montagens/video` (`src/montagens/video.js`: o ffmpeg põe cada trecho no quadro, cobre com a
camada e gera MP4 H.264 com o nome de "pela metade" até terminar).

## Ainda não

- Vídeo HDR (HLG/PQ) sai sem conversão de tom: o JPEG fica lavado. Por enquanto, use a versão SDR do filme.
- Takes feitos no próprio celular (o celular pede ao computador).
- "Outro frame" e "frame num ponto" de um vídeo que veio do Drive baixam o vídeo de novo (ele não fica no computador).
