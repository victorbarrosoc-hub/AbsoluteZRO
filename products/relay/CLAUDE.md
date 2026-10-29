# Relay — regras para Claude Code

Leia antes o `CLAUDE.md` da raiz do monorepo (proibições, Padrão Apple, deploy só com autorização). Aqui, só o que é do
Relay. Decisão em [ADR 0030](../../docs/decisions/0030-relay-conversao.md); integração com as outras plataformas em
[docs/integration-contracts/relay.md](../../docs/integration-contracts/relay.md).

## O que é cada pasta

- `src/` o núcleo, puro e testado: `presets.js` (destinos, com fonte e data), `plano.js` (tamanho, cadência, bitrate,
  cor, áudio e a ficha técnica), `personalizado.js` (presets da pessoa), `ffmpeg.js` (linha de comando do computador).
- `app/` o site: `motor.js` (Mediabunny + WebCodecs), `escala.js` (Lanczos e YUV na placa), `converter.js`, `meus.js`,
  `home.js`. Sem build: o que está aqui é o que o navegador roda.
- `vendor/` Mediabunny e extensões (`npm run vendor`; `test/vendor.test.js` confere).
- `marca/` símbolo, ícone, PNGs (`node scripts/marca.mjs`) e o guia.
- `scripts/` servidor local (`npm run dev`), laboratório de qualidade (`npm run qualidade`), build do site.

## Regras

- **Qualidade só com medição.** Mexeu em bitrate, escala, cor ou codificador: rode `npm run qualidade` e atualize
  `docs/QUALIDADE.md`. O comparativo com outros conversores é interno: não vai para o site nem para texto de divulgação.
- **Preset novo nasce aqui**, com fonte e data (`fontes`); as plataformas que embutem o núcleo copiam
  (`test/copias.test.js` falha até copiar). Hoje: `products/sobedesce/src/relay/` (com `personalizado.js`, para o "Máxima qualidade") e
  `products/sobedesce/web/public/app/relay/`.
- **O arquivo da pessoa não sai do aparelho.** Nenhum upload; o site é estático.
- **Cor:** SDR sai marcado BT.709 (1-1-1). A cor de entrada vem do contêiner (o decodificador de ProRes erra a marca);
  10 bits vira 8 com arredondamento. HDR e gamut largo viram aviso, nunca silêncio.
- **Nunca fingir:** sem codificador, sem decodificador ou sem caber no tamanho, a tela diz o porquê.
- Testes: `npm test` (precisa de ffmpeg e do Chromium do Playwright).
