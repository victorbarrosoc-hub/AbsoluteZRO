# ADR 0044 — CAMZRO: a câmera de vídeo do set, no navegador

**Status:** aceita (09/11/2026, pedido do titular). **Nome provisório: CAMZRO** (id técnico `camzro`). Nasce **fechada**
no gate (`zro.product_release`, migração HUB `0065`, ADR 0023) e **sem deploy**: o titular testa numa conta Vercel grátis
à parte, com chave de prévia, e só depois decide domínio (`camzro.absolutezro.com`, ADR 0025) e lançamento.

## Contexto

O titular pediu "um app de câmera completo, melhor que o da Blackmagic e esse [FilmLab Pro, urfilmlab.com]", integrado ao
ecossistema, minimalista, fácil e eficiente, com "as melhores matemáticas". Pesquisa (09/11/2026):

- **Blackmagic Camera** (iOS e Android, grátis): controles de cinema, timecode, claquete, falsa cor, zebra, nuvem da
  Blackmagic. Força: o nativo (ProRes, Apple Log, 10 bits). Fraco: sem prioridade de exposição, sem descarga conferida,
  sem roteiro.
- **FilmLab Pro** (só iPhone, assinatura para salvar): cadeados de exposição (prioridade de ISO/obturador), segurar para
  travar AE/AF, arrastar para EV, LUT que viaja com o clipe; editor e laboratório de cor. Fraco: sem timecode, claquete,
  metadados, forma de onda e vectorscope na câmera.
- Câmera no navegador (2026): Chrome no Android expõe ISO, tempo, Kelvin, foco, zoom e tocha quando o aparelho deixa;
  Safari no iPhone não expõe controle manual. WebCodecs grava H.264/HEVC/AV1 com bitrate e quadro-chave; nada de ProRes,
  Log ou 10 bits.

## Decisão

1. **App web (PWA) em `products/camzro/`**, sem build, como os outros apps: roda em Android, iPhone e computador
   (inclusive câmera USB e placa de captura), sem loja nem conta de desenvolvedor. App nativo para o iPhone (controle
   manual, ProRes, Log) fica para outra fase, decisão do titular.
2. **Gravação profissional no limite do navegador**: Mediabunny + WebCodecs com cadência constante, PCM 24 bits e áudio
   cru; MP4 fragmentado gravado no lugar (OPFS + `createSyncAccessHandle` num worker) para nunca perder o take, fechado
   em MOV sem recompressão. MediaRecorder só como reserva.
3. **As contas em módulos puros e testados** (`app/nucleo/`): 180°/anti-flicker/ND/EV, SMPTE DF, falsa cor ARRI, zebra,
   scopes, LUT trilinear, BS.1770, Cristian para o relógio do set, prioridade de exposição em malha fechada.
4. **Ecossistema por arquivo e pelo login único**, sem servidor de mídia: ficha `camzro.clip/1`
   ([contrato](../integration-contracts/camzro.md)), descarga conferida em xxh64 (formato do SOBEDESCE), CSV do DaVinci com
   os campos do Synquei, ALE, bip de sincronia igual ao do TPeasy (o Synquei já acha), roteiro do Maestro
   (`maestro.roteiro/1`) como decupagem, o Set e a conta única. O servidor só serve a página pelo gate e a hora.
5. **Gate e prévia**: três portas (`api/_sessao.js`) — conta com `camzro` na claim `zro_release`, prévia do titular
   (`ZRO_CHAVE_PREVIA`, a variável única do team grátis ZROFREE; cookie com HMAC da chave) e modo local (só localhost). Fora delas, a página neutra.

## Consequências

- Sem custo de servidor: a câmera roda no aparelho; a função só serve arquivos e a hora.
- No iPhone o CAMZRO é monitor, claquete, timecode e gravador de 8 bits com exposição automática ou travada; o manual
  completo é Android/computador (a tela diz o que o aparelho deixa).
- Lançar pede, com o titular: domínio, cliente OIDC `camzro-web` no console e a migration que abre o gate. A 0065 só
  cadastra o produto fechado (roda no deploy do HUB quando a `main` receber o ramo).
