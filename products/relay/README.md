# Relay — conversão e exportação de vídeo e áudio

**Estado (29/10/2026): liberado aos usuários, junto com o Maestro, sem e-mail de lançamento (decisão do titular).**
Projeto Vercel `relay` (Root Directory `products/relay`) em `relay.absolutezro.com`, com `RELEASE=released` em
produção. No HUB, a migration `0032` abre o produto e o gate (canal web). Sem `RELEASE=released`,
`scripts/publicar-site.mjs` volta a publicar só "Em breve". Mudar só a variável não basta: o Ignored Build Step do projeto
cancela o deploy de um commit que já tem prévia; o deploy precisa de commit novo em `products/relay` (ou da checagem
desligada só naquele deploy). Decisão: [ADR 0030](../../docs/decisions/0030-relay-conversao.md).
Como as outras plataformas usam: [docs/integration-contracts/relay.md](../../docs/integration-contracts/relay.md).

Aberto e sem cadastro: solta o arquivo, escolhe para onde vai, sai a versão certa. Converte no próprio aparelho; o
arquivo não é enviado. É a porta de entrada do ecossistema Absolute ZRO.

## O que faz

- **23 destinos** com fonte e data (`src/presets.js`), em cinco grupos:
  - Redes: YouTube 1080p, YouTube 1440p (o truque da nitidez), YouTube 4K, Shorts, Reels · No Compress, Instagram
    Feed 4:5, TikTok, WhatsApp, LinkedIn e X.
  - Trabalho: Vimeo, Apple HEVC, Slides (PowerPoint, Keynote), Vídeo de fundo (site, sem som) e Proxy para edição.
  - TV: Smart TV (Full HD H.264 a 30 fps, que abre pelo pendrive) e Smart TV 4K (HEVC).
  - Tamanho: Discord (20 MB), E-mail (25 MB) e Tamanho exato. Áudio: MP3 320, AAC 256 e WAV 48 kHz.
  - Entrega para emissora (MXF/XDCAM, ProRes, loudness -23) não entra: o navegador não grava esses formatos, e o
    Relay não finge.
- **Vários destinos de uma vez**, para vários arquivos, um por vez, com progresso no próprio relé.
- **Ficha técnica** de cada saída (contêiner, codec, tamanho, cadência, bitrate, quadro-chave, cor, áudio).
- **Meus presets** (`src/personalizado.js`, editor em `app/meus.js`): a pessoa parte de um preset do Relay e muda,
  com a ficha ao vivo:
  - vídeo: codec, tamanho (proporção do arquivo ou tela fixa com faixas, preencher ou esticar), cadência até um teto
    ou exata (23,976, 29,97, 59,94…), bitrate médio, constante (CBR), qualidade constante (RF) ou tamanho máximo,
    quadro-chave;
  - recorte e giro (90°, 180°, 270°, espelho), trecho (início e fim);
  - áudio: codec, bitrate, taxa, canais e volume em dB;
  - no computador (Máxima qualidade): velocidade e ajuste do x264, perfil, desentrelaçar, reduzir ruído, nitidez e
    volume normalizado (LUFS). No navegador a ficha diz que ficaram de fora;
  - cor da Revela (desligada até a Revela abrir, `app/recursos.js`): log da câmera → Rec.709 e um look `.cube`.
  Fica no aparelho e vai para outro aparelho ou para a equipe como `.relay.json` (Levar / Trazer). Fichas antigas
  abrem iguais.
- **Painel** (`/painel`, com a conta Absolute ZRO; quem entra cai nele): o que foi convertido neste aparelho (nome,
  destino, tamanho, quando, "converter de novo"), três números (conversões, duração, o que ficou a menos no disco),
  **projetos** (nome e destinos de sempre: "Converter" abre o conversor com eles marcados e as saídas entram no
  projeto) e os presets da pessoa. Fica no aparelho e na conta (schema `relay`), em todo aparelho: o histórico de antes
  sobe uma vez, o que mudou sem rede sobe depois. Projetos e presets podem ser liberados para a equipe (mesma
  organização), que vê e usa sem mudar. No topo de todas as páginas, a foto da conta abre Painel, Sua conta Absolute
  ZRO e Sair.
- **Escolher no Drive** (com `RECURSOS.drive`): o SOBEDESCE embutido escolhe o vídeo no Drive; o Relay lê aos pedaços,
  converte no aparelho e "Para o Drive" devolve o resultado à mesma pasta (MD5 conferido pelo SOBEDESCE).
- **Arquivo grande**: grava direto numa pasta (Chrome e Edge no computador).
- **Máxima qualidade** (Mac e Windows): abre o app SOBEDESCE pelo link `sobedesce://relay` com os destinos escolhidos
  (inclusive os da pessoa); ele converte os arquivos do computador com o x264 e salva ao lado do original
  (`src/link.js` monta o link; `products/sobedesce/desktop/links.js` lê).
- **Leitura com plano B**: se o navegador recusa o H.264/HEVC como o arquivo descreve (gravação de tela do Mac, nível
  alto), o Relay tenta outras formas e só usa a que devolveu um quadro de verdade. Sem jeito, o erro mostra o codec,
  o tamanho e o navegador.
- **Cor da Revela na exportação** (`src/cor.js`, `src/revela/` = cópia de `products/finishing/src/cor/`): a CST da
  Revela (S-Log3, LogC, C-Log, V-Log, F-Log, N-Log, D-Log, BMD, RED…) como conta na placa de vídeo, em ponto
  flutuante, e o look numa LUT 3D, em lote. Contrato: [relay.md, "Cor da Revela"](../../docs/integration-contracts/relay.md).
- **Laboratório de aparelhos** (`/laboratorio`, interno: só nas prévias da Vercel e no `npm run dev`): mede o codificador
  do aparelho contra a referência x264 no mesmo bitrate, com cenas geradas no próprio aparelho.

## Qualidade (o que foi medido)

Detalhes, números e como repetir: [docs/QUALIDADE.md](docs/QUALIDADE.md). Em resumo:

- **Computador** (`src/ffmpeg.js`, executado hoje pelo SOBEDESCE): o x264 em `slow` e qualidade constante. No mesmo
  tamanho de arquivo, empata com a referência x264 de duas passadas.
- **Navegador** (`app/motor.js`): redução em Lanczos-3 na placa de vídeo, YUV BT.709 montado pelo próprio Relay, cor do
  ProRes corrigida e 10 bits arredondados para 8. O codificador é o do aparelho: no Chromium do Linux (OpenH264) fica
  abaixo do x264 no mesmo tamanho, e os bitrates dos presets têm folga para compensar.

## Pastas

| Pasta | O quê |
| --- | --- |
| `src/` | Núcleo puro e testado: presets, plano, ficha técnica, presets da pessoa, linha de comando do ffmpeg |
| `app/` | O site: motor do navegador, escala na placa, conversor, editor de presets, página inicial (telas de verdade em `app/inicio/`) |
| `marca/` | Símbolo, ícone, PNGs, OG e o guia (`marca/index.html`) |
| `vendor/` | Mediabunny e extensões (ProRes, AAC, MP3) |
| `scripts/` | `servir.mjs` (dev e testes), `qualidade.mjs` (laboratório), `marca.mjs` (PNGs), `publicar-site.mjs` (build), `telas-inicio.mjs` (telas da página inicial) |
| `test/` | Unidade, ffmpeg de verdade, Chromium de verdade, cópias nas outras plataformas |

## Rodar

```bash
npm ci && npm run dev
```

```bash
npm test
```

```bash
npm run qualidade -- <pasta com masters .mov>
```

## Marca

O relé: uma chave ligada. O trilho, o sinal que já passou (menta `#2FD9AE` → limão `#D8F76A`) e o anel do O da
Absolute ZRO no fim do curso. O irmão horizontal do SOBEDESCE (que sobe e desce). Guia em `marca/index.html`;
`node scripts/marca.mjs` refaz os PNGs a partir do SVG.
