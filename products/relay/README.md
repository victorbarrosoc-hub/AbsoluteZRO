# Relay — conversão e exportação de vídeo e áudio

**Estado (29/10/2026): pronto no repositório e fechado até o lançamento junto com o Maestro.** Projeto Vercel `relay`
(Root Directory `products/relay`) e domínio `relay.absolutezro.com` criados com a autorização do titular (sessão da
central, 29/10/2026). O build (`scripts/publicar-site.mjs`) publica só a página "Em breve" em todas as rotas; abrir é
`RELEASE=released` no projeto Vercel e um deploy novo (o mesmo modelo da Revela), junto com a abertura do gate no HUB. Decisão: [ADR 0030](../../docs/decisions/0030-relay-conversao.md).
Como as outras plataformas usam: [docs/integration-contracts/relay.md](../../docs/integration-contracts/relay.md).

Grátis e sem cadastro: solta o arquivo, escolhe para onde vai, sai a versão certa. Converte no próprio aparelho; o
arquivo não é enviado. É a porta de entrada do ecossistema Absolute ZRO.

## O que faz

- **16 destinos** com fonte e data (`src/presets.js`): YouTube 1080p, YouTube 1440p (o truque da nitidez), YouTube 4K,
  Shorts, Reels · No Compress, Instagram Feed 4:5, TikTok, WhatsApp, Vimeo, Apple HEVC, Proxy para edição, Discord
  (20 MB), E-mail (25 MB), Tamanho exato, MP3 320, AAC 256 e WAV 48 kHz.
- **Vários destinos de uma vez**, para vários arquivos, um por vez, com progresso no próprio relé.
- **Ficha técnica** de cada saída (contêiner, codec, tamanho, cadência, bitrate, quadro-chave, cor, áudio).
- **Meus presets**: a pessoa parte de um preset do Relay e muda codec, tamanho (proporção do arquivo ou tela fixa),
  cadência máxima, bitrate médio ou tamanho máximo, quadro-chave e áudio, com a ficha ao vivo. Fica no aparelho e
  vai para outro aparelho ou para a equipe como `.relay.json` (Levar / Trazer).
- **Arquivo grande**: grava direto numa pasta (Chrome e Edge no computador).

## Qualidade (o que foi medido)

Detalhes, números e como repetir: [docs/QUALIDADE.md](docs/QUALIDADE.md). Em resumo:

- **Computador** (`src/ffmpeg.js`, executado hoje pelo SOBEDESCE): o mesmo x264 do HandBrake, em `slow` e qualidade
  constante. No mesmo tamanho de arquivo, iguala ou passa o HandBrake.
- **Navegador** (`app/motor.js`): redução em Lanczos-3 na placa de vídeo, YUV BT.709 montado pelo próprio Relay, cor do
  ProRes corrigida e 10 bits arredondados para 8. O codificador é o do aparelho: no Chromium do Linux (OpenH264) fica
  abaixo do x264 no mesmo tamanho, e os bitrates dos presets têm folga para compensar.

## Pastas

| Pasta | O quê |
| --- | --- |
| `src/` | Núcleo puro e testado: presets, plano, ficha técnica, presets da pessoa, linha de comando do ffmpeg |
| `app/` | O site: motor do navegador, escala na placa, conversor, editor de presets, página inicial |
| `marca/` | Símbolo, ícone, PNGs, OG e o guia (`marca/index.html`) |
| `vendor/` | Mediabunny e extensões (ProRes, AAC, MP3) |
| `scripts/` | `servir.mjs` (dev e testes), `qualidade.mjs` (laboratório), `marca.mjs` (PNGs), `publicar-site.mjs` (build) |
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
