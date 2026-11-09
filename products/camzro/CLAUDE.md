# CAMZRO — regras para Claude Code

A câmera de vídeo do set (nome provisório; ADR 0044). As regras do `CLAUDE.md` da raiz valem aqui; este arquivo só
acrescenta.

- **Não lançado e sem deploy** (titular, 09/11/2026): fechado no gate (HUB `0065`); nada de projeto Vercel, domínio ou
  banco sem nova autorização. Para teste, o titular publica numa conta Vercel grátis à parte (team ZROFREE) com `ZRO_CHAVE_PREVIA`
  (passo a passo no README). A página, os scripts e a API só saem pelas portas de `api/_sessao.js`.
- **Imagem e som nunca saem do aparelho** sem a pessoa mandar (compartilhar, descarregar). Nada de upload, nada de
  amostra de vídeo ou áudio real no repositório (testes usam a câmera e o microfone falsos do Chromium).
- **Honestidade**: só aparece controle que a câmera aceita (`nucleo/controles.js`); limite vira texto curto na tela.
  Nada de prometer ProRes, Log, 10 bits ou controle manual no Safari.
- **Contas puras em `app/nucleo/`**, testadas em Node contra valores de norma (SMPTE, BS.1770, Rec.709, ARRI). Conta nova
  ou mudada = teste novo em `test/nucleo.test.js`.
- **O arquivo gravado não muda depois de fechado.** A ficha é outro arquivo (`camzro.clip/1`). Mudou campo da ficha:
  `docs/integration-contracts/camzro.md`, `node scripts/exemplos.mjs` e `test/contrato.test.js`.
- **Gravação**: o escritor do worker sempre copia o buffer antes de transferir (o Mediabunny reaproveita o dele); a fila
  do `WritableStream` é grande (64 MB) para o muxer nunca esperar contrapressão no meio de um fragmento.
- **Bip de sincronia** = assinatura do TPeasy (1 kHz, 160 ms, 0,25, queda exponencial), que o Synquei acha. Não mude
  sem mudar os dois.
- `app/vendor/` só por `npm run vendor` (Mediabunny e xxhash-wasm; conferido em teste).
- Interface: identidade Absolute ZRO (Figtree, Liquid Glass, texto grafite/branco e cinza, claro nas folhas); o visor é
  escuro. Pouco texto. A marca é o **Obturador 180°** (titular, 09/11/2026; `docs/marca/camzro.md`): geometria só em
  `scripts/marca.mjs`, que gera `app/marca/`.
- **Celular primeiro** (titular, 09/11/2026): o CAMZRO é app de celular, deitado. O computador só aparece como webcam
  ou placa de captura; nada de computador nas telas da página inicial.
- Antes de entregar: `npm test` nesta pasta (Chromium de verdade) e `node publicar.mjs`.
