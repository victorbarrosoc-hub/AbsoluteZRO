# CAMZRO (nome provisório) — a câmera do set

Câmera de vídeo profissional no navegador do celular (no computador, pela webcam ou placa de captura), da Absolute ZRO.
**Não lançada**: fechada no gate (migração HUB `0065`, só a administração da plataforma) e **sem deploy** (pedido do titular, 09/11/2026: nada na Vercel
por enquanto). Contrato com os outros apps: [docs/integration-contracts/camzro.md](../../docs/integration-contracts/camzro.md).
Decisão: [ADR 0044](../../docs/decisions/0044-camzro.md).

## O que faz

**Captura**

- Lente, tamanho (4K, 1440p, 1080p, 720p) e cadência (23,976 a 60, com o valor exato 24000/1001). Câmera externa (USB,
  placa de captura HDMI) aparece na lista.
- **Cadência constante**: o quadro é amostrado no relógio da cadência (o editor não sofre com VFR); quadro que o aparelho
  não deu conta de gravar vira aviso ("3 quadros perdidos") e vai na ficha.
- Codec (HEVC, H.264, AV1, VP9, o que o aparelho grava), qualidade Padrão/Alta/Máxima/Manual (bits por pixel: ~0,2 bpp em
  HEVC = o padrão do celular; Alta 2×; Máxima 3,5×), bitrate variável ou constante, quadro-chave (até intra), MOV para
  edição ou MP4.
- Áudio **PCM 24 bits** cru: sem cancelamento de eco, sem redução de ruído e sem ganho automático (o padrão do navegador
  é de chamada de vídeo e estraga o som de set).
- **À prova de queda**: grava em MP4 fragmentado direto no armazenamento (um fragmento por segundo, sem arquivo
  temporário). Telefone toca, app fecha, bateria acaba: na volta, o take é recuperado até o último segundo. Ao parar,
  reempacota em MOV comum sem recomprimir e confere a duração antes de apagar o fragmentado (testado no Chromium:
  `test/camera.e2e.test.js`).
- Espaço: minutos que cabem no bitrate de agora; aviso abaixo de 10 e 2 min; para sozinho e salva antes de acabar.

**Exposição** (só aparece o que a câmera do aparelho aceita; o resto diz por quê)

- ISO, obturador em **ângulo** (180° = desfoque do cinema) ou velocidade, Kelvin, foco manual, zoom, tocha, compensação.
- **Prioridade de obturador** (o ângulo fica, o ISO acompanha a luz) e **de ISO** (o ISO fica, o obturador acompanha):
  o celular não dá esse modo ao navegador, então o CAMZRO fecha o laço — mede a luma do quadro com peso no centro e
  corrige até 1/3 de stop por vez (`stops = 2,2 × log2(alvo/medido)`, alvo = cinza 18%).
- Gestos: tocar foca e expõe no ponto; **segurar trava AE/AF**; **arrastar para cima/baixo muda o EV**; pinça = zoom;
  dois toques = lupa.
- **Anti-flicker**: lista os ângulos sem flicker para a rede (50/60 Hz) e a cadência: `t = n / (2 × Hz) ≤ 1/fps`
  (24 fps em 50 Hz → 172,8°; em 60 Hz → 144° e 216°).
- **Calculadora do set**: o ND para 180° a partir do que o automático mediu (`stops = log2(t_desejado·ISO_desejado /
  t_medido·ISO_medido)`, ND mais perto e o ajuste de ISO que sobra), câmera lenta, tabela de ND.
- Balanço por conta-gotas: aponta para o cartão cinza e o CAMZRO diz a temperatura (McCamy, CIE 1931).

**Monitor** (num shader WebGL2, num passo só, medindo o sinal gravado, antes da LUT)

- Falsa cor: escala ARRI (preto cortado, quase preto, cinza 18%, pele +1 stop, quase estourado, estourado) ou Simples
  (as mesmas cores em faixas largas, para quem está começando), com legenda na tela.
- Zebra acima de um nível ou em faixa ±5 (pele em 70%).
- Focus peaking (Sobel na luma, cor e sensibilidade), lupa 4× no ponto tocado, preto e branco.
- Scopes: histograma (luma + RGB, % estourado), forma de onda, RGB parade e vectorscope (alvos a 75% e linha de pele).
- Guias: 2,39, 2:1, 1,85, 16:9, 4:3, 1:1, 4:5, 9:16; terços, proporção áurea, centro, área segura 90/80%; nível pelo
  acelerômetro.
- LUT de monitor `.cube` (1D/3D até 65³, trilinear na placa de vídeo): só na tela; o `.cube` vai ao lado do clipe.
- Desanamorfizar 1,33×–2×; espelhar.
- Medidor de áudio: pico com balística IEC (cai 20 dB em 1,7 s) e loudness momentânea (BS.1770, filtro K).

**Set**

- Timecode SMPTE (drop-frame em 29,97 e 59,94), **hora do dia pelo relógio do set**: cada aparelho acerta o relógio pelo
  servidor (algoritmo de Cristian, a melhor de 8 amostras) e mostra a incerteza; abaixo de meio quadro, câmeras A, B e
  C saem com o mesmo timecode.
- Claquete: projeto, cena (12, 12A), plano, take (sobe sozinho), câmera A–H, rolo, bom take, notas. **Claquete na
  tela** (número grande, timecode, Bater com bip e flash).
- Nome de clipe de câmera de cinema: `A001C007_261109_K3F2`.
- Presets (Levar/Trazer como `.camzro.json`).

**Clipes**

- Por dia, com miniatura, cena-plano-take, duração e timecode; bom take; rever; mandar (rolo de fotos/outro app pelo
  compartilhar do sistema); vários de uma vez; apagar com dois toques.
- **Descarga conferida** numa pasta (SSD, HD): copia, relê o destino e confere o **xxh64** de cada vídeo (o mesmo do
  SOBEDESCE), com o relatório `.xxh64`, o **CSV do DaVinci**, o **ALE** e o **relatório de câmera** na pasta.

**Ecossistema Absolute ZRO**

- Conta única (login da Absolute ZRO) e o **Set** (presença e conversas da equipe).
- **Maestro**: o roteiro (`maestro.roteiro/1`) vira a decupagem da claquete — cenas e planos com sigla, ângulo,
  movimento e lente; "Próximo plano" anda pela lista; o clipe leva o elo de volta.
- **Synquei**: o bip de sincronia é o mesmo do TPeasy, que o Synquei já acha; o flash marca a imagem.
- **SOBEDESCE/DaVinci**: descarga em `<projeto>/<AAMMDD>/<rolo>/`, xxh64 no formato do xxhsum, metadados com os nomes
  de campo que o Synquei usa no Resolve.

## Pesquisa (REA) — o que os melhores fazem e onde o CAMZRO vai além

Fontes: páginas e notícias do Blackmagic Camera 2.0 (dpreview, PetaPixel, CineD, 2024–2025), o manual do FilmLab Pro
(urfilmlab.com/manual, v3.7.0) e a App Store. "—" = não confirmado nas fontes.

| Recurso                                        | Blackmagic Camera            | FilmLab Pro (urfilmlab)  | CAMZRO                            |
| ---------------------------------------------- | ---------------------------- | ------------------------ | --------------------------------- |
| Plataformas                                    | iPhone, iPad, Android        | só iPhone                | Android, iPhone e computador      |
| Grátis para gravar e salvar                    | sim                          | não (assinatura)         | sim                               |
| Prioridade de obturador/ISO                    | —                            | sim (cadeados)           | sim                               |
| Falsa cor, zebra, peaking                      | sim                          | sim                      | sim, com níveis ajustáveis        |
| Forma de onda, parade, vectorscope na câmera   | —                            | só no editor             | sim                               |
| Timecode da hora do dia entre aparelhos        | —                            | não                      | sim (relógio do set pela rede)    |
| Claquete, bom take                             | —                            | não                      | sim, com o roteiro do Maestro     |
| Metadados para DaVinci (CSV) e ALE             | nuvem Blackmagic → Resolve   | não                      | sim (arquivo, sem nuvem)          |
| Descarga conferida por hash                    | —                            | não                      | sim (xxh64)                       |
| Take salvo se o app cair                       | —                            | não                      | sim (testado)                     |
| Controle de várias câmeras (um aparelho manda) | sim (iPad comanda até 9)     | não                      | **ainda não** (próxima fase)      |
| Proxy e envio para a nuvem                     | sim (Blackmagic Cloud)       | não                      | **não** (descarga local)          |
| ProRes, Apple Log, 10 bits                     | sim                          | sim                      | **não** (o navegador não grava)   |

## Limites honestos

- **iPhone (Safari)**: o navegador não abre ISO, obturador, Kelvin nem foco manual. Ficam o automático, a trava, o zoom
  e todas as ferramentas de monitor, scopes, timecode, claquete e descarga. Controle manual completo pede app nativo
  (outra fase, decisão do titular: conta de desenvolvedor Apple).
- **Sem ProRes, Log e 10 bits**: o navegador grava H.264/HEVC/AV1 de 8 bits. O Relay converte depois, no aparelho.
- **Tela ligada**: no celular, o app grava com a tela acesa e na frente (o CAMZRO pede para a tela não apagar). Sair do
  app fecha o take com o que já foi gravado.
- Android: os controles manuais dependem do aparelho (Chrome expõe o que o fabricante libera). A folha "Câmera e
  microfone" mostra o que este aparelho deixa.
- O relógio do set depende da rede (Wi-Fi do set: poucos milissegundos). Sem rede, timecode do aparelho (a tela diz).

## Como funciona

- `app/nucleo/`: as contas, puras e testadas em Node (exposição, timecode, cor, LUT, áudio, armazenamento, claquete,
  metadados, relógio, controles, guias, roteiro).
- `app/motor/`: câmera (getUserMedia e restrições), monitor (WebGL2), scopes, som (AudioWorklet), gravador (Mediabunny +
  WebCodecs, ou MediaRecorder), armazém (OPFS) e o escritor num worker (`createSyncAccessHandle`).
- `app/app.js`, `app/paineis.js`, `app/biblioteca.js`: a tela. `app/sw.js`: abre sem internet depois da primeira vez.
- `api/`: a página e os arquivos só pelo gate (`api/_sessao.js`: conta com `camzro` na claim `zro_release`, prévia do
  titular ou modo local), o login único (`api/zro/*`, cópia do RADION/Relay) e a hora do set.
- `app/vendor/`: Mediabunny (MPL-2.0) e xxhash-wasm (MIT), cópias exatas (`npm run vendor`, conferidas em teste).

## Página inicial

- Mora em `app/site.html`, `app/site.css` e `app/site.js`; as telas de verdade em `app/site/*.webp` e a imagem de
  compartilhar em `app/marca/og.png`. Não lançado: só sai pelas portas do gate, em **`/sobre`** (no app, Ajustes ›
  Sobre o CAMZRO); `/` continua sendo o app. Sem porta, a página neutra, e nenhum arquivo do site sai.
- No lançamento (com a migration que abre o gate), `CAMZRO_SITE_ABERTO=1` no projeto: `/` de quem não entrou vira a
  página inicial com "Entrar com a Absolute ZRO" (`/entrar`), os arquivos do site (`site.css`, `site.js`, `site/*`,
  `marca/*`, manifest) saem para todos, e o `publicar.mjs` põe `og.png` e o `apple-touch-icon` na raiz pública. O app e a
  API seguem fechados sem porta.
- As demonstrações (monitor, exposição, queda, timecode, ecossistema) são HTML animado por fases em `site.js`; com
  "reduzir movimento", cada uma fica num quadro parado. O tema (claro por padrão) é a mesma escolha do app.
- Refazer as telas: `node scripts/telas-do-site.mjs` (ffmpeg e o Chromium do Playwright). O app roda com a câmera falsa
  filmando um take do Coverr (`products/ai-edit/marca/home/cenas/onda.mp4`, só leitura), liga cada ferramenta de
  verdade (falsa cor, foco, scopes, claquete com o roteiro do Maestro, claquete na tela, take recuperado depois de uma
  queda, iPhone deitado) e grava os `.webp` (~70–240 KB) e a `og.png`.

## Testar

- `npm test`: núcleo (contas contra valores de norma), portas (gate, prévia, arquivos, `/sobre` e o site aberto), contrato e
  a câmera de ponta a ponta num Chromium com câmera e microfone falsos (grava, confere o arquivo, derruba o app no meio do take e recupera).
- `npm run dev` → http://localhost:8092 em modo local (sem login; só em localhost).

## Publicar numa conta Vercel grátis (passo a passo para o titular)

Nada aqui foi publicado. Para testar no celular, numa conta Vercel **Hobby (grátis)** à parte — no Hobby, quando um
limite acaba o projeto para até o mês virar; não há cobrança:

1. Crie a conta em vercel.com com outro e-mail (plano **Hobby**). Não cadastre cartão.
2. **Add New › Project › Import Git Repository**, escolha `victorbarrosoc-hub/AbsoluteZRO` (autorize o GitHub só para
   este repositório).
3. Em **Root Directory**, escolha `products/camzro`. Framework: **Other**. Os comandos vêm do `vercel.json` (não mude).
4. Em **Environment Variables**, crie `ZRO_CHAVE_PREVIA` (a mesma variável dos outros apps no ZROFREE; o antigo
   `CAMZRO_CHAVE_PREVIA` também vale) com uma frase longa e só sua (24+ caracteres, ex.: gerada
   por um gerenciador de senhas). Não crie `ZRO_CLIENT_ID` nem `ZRO_CLIENT_SECRET` (o login único fica para quando o
   domínio `camzro.absolutezro.com` for autorizado).
5. **Deploy**. Enquanto o CAMZRO não estiver na `main`, o primeiro deploy (da `main`) falha por não achar a pasta: em
   **Settings › Git › Production Branch**, ponha `claude/kind-cray-xja6bm` e faça **Redeploy** (ou faça o merge antes;
   aí a migração `0065` também roda no deploy do HUB e cadastra o CAMZRO fechado).
   Abra `https://<projeto>.vercel.app/previa?chave=<a frase>` uma vez no celular: o cookie fica 30 dias.
   Sem a chave, o endereço mostra só a página neutra (o app continua invisível para quem não tem a chave).
6. No celular: **Abrir a câmera** e permita câmera e microfone. No iPhone, Compartilhar › Adicionar à Tela de Início
   (abre em tela cheia). No Android, o Chrome oferece Instalar.
7. Para não gastar build à toa: **Settings › Git › Ignored Build Step** › "Only build if there are changes in a folder"
   com `products/camzro`. Terminado o teste, apague o projeto. Para trocar a chave, mude a variável e faça **Redeploy**.

Quando lançar (com o titular): domínio `camzro.absolutezro.com` (ADR 0025), cliente `camzro-web` no console da Absolute
ZRO (retorno `https://camzro.absolutezro.com/api/zro/callback`), `ZRO_CLIENT_ID=camzro-web` e `ZRO_CLIENT_SECRET` no
projeto, e a migration que abre o gate.
