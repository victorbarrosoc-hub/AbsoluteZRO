# Qualidade do Relay — medição interna

**Documento interno.** O comparativo com outros conversores não vai para o site nem para divulgação (decisão do
titular, 29/10/2026). O objetivo: qualidade no topo do mercado. Aqui está o que foi medido,
o que mudou por causa da medida e onde o Relay ainda perde. Refaça com `npm run qualidade -- <pasta>` sempre que mexer em
bitrate, escala, cor ou codificador (CLAUDE.md da pasta).

## Como foi medido (29/10/2026)

- **Masters** (ProRes 422 HQ, 10 bits, BT.709, gerados pelo ffmpeg a partir de fotos reais do repositório; não vão para
  o Git):
  - `foto`: 1080p, 8 s, panorâmica sobre foto de drone com **grão pesado** (ruído temporal) — o pior caso de um
    codificador;
  - `limpa`: 1080p, 6 s, panorâmica limpa com som;
  - `movimento`: 1080p, 6 s, zoom num fractal (detalhe fino em movimento) com som;
  - `uhd`: 4K, 5 s, foto ampliada com grão leve — testa a **redução 4K → 1080p**.
- **Referência x264**: três ajustes comuns de mercado com o x264 e a escala swscale (Lanczos com arredondamento
  preciso): rápida (x264 `fast`, RF 22), alta (`slow`, RF 20) e máxima (`veryslow`, RF 18).
- **A comparação justa: o mesmo tamanho de arquivo.** Para cada saída do Relay, a referência x264 no modo "bitrate médio,
  duas passadas" (x264 `fast`) com o bitrate exato do arquivo do Relay. Assim a pergunta é "no mesmo peso, quem guarda
  mais imagem?".
- **Métricas**: SSIM (todos os planos, nas tabelas) e PSNR do Y contra o master reduzido com Lanczos de arredondamento preciso.
  SSIM 1 = idêntico.
- **Relay no navegador**: Chromium do Playwright no Linux, sem placa de vídeo. O codificador H.264 ali é o **OpenH264**
  (software). Em Mac, iPhone e Windows o navegador usa o codificador do aparelho (VideoToolbox, Media Foundation),
  que não deu para medir neste ambiente.

## O que a medida mudou no código

| Achado | Antes | Correção |
| --- | --- | --- |
| O ffmpeg supõe BT.601 quando a escala recebe só a matriz de saída: o HD saía mais escuro | PSNR 40,6 dB no `uhd` | Matriz e faixa de entrada sempre explícitas (`src/plano.js` → `corDeEntrada`, `src/ffmpeg.js`) |
| O decodificador de ProRes do navegador marca os quadros como BT.601 | Luma média 51,60 contra 52,06 do master | Vale a cor do contêiner (`corDoArquivo` em `app/motor.js`) |
| O codificador do navegador **trunca** 10 bits para 8 (média −0,4 nível) | Mesmo desvio acima | 10/12 bits → 8 com arredondamento no próprio Relay (`para8bits`) |
| O canvas do navegador reduz com bilinear e converte RGB → YUV com a matriz que quiser (e marca sRGB) | `uhd` no navegador: PSNR 39,8 dB com 8,4 MB | Lanczos-3 em duas passadas na placa e o YUV 4:2:0 BT.709 montado pelo Relay (`app/escala.js`): **44,9 dB com 4,0 MB** |
| Quadro-chave a cada 0,5 s (a página do YouTube pede) gasta bits sem ganho: a plataforma recodifica tudo | — | GOP de 2 s nos presets de upload |
| O teto de bitrate (VBV) no CRF era o que fazia o Relay perder para a referência x264 no mesmo tamanho | `foto`: 0,9302 contra 0,9314 | CRF livre; teto só onde o tamanho importa (WhatsApp, proxy). Agora: **0,9474 contra 0,9444** |

## Resultado

No mesmo tamanho de arquivo (SSIM de todos os planos):

| Clipe | Relay no computador | Referência, mesmo tamanho | Relay no navegador (Linux) | Referência, mesmo tamanho |
| --- | --- | --- | --- | --- |
| Grão pesado | 0.9469 | 0.9468 | 0.9124 | 0.9198 |
| Imagem limpa | 0.9962 | 0.9966 | 0.9934 | 0.9976 |
| Movimento fino | 0.9927 | 0.9923 | 0.9853 | 0.9901 |
| 4K → 1080p | 0.9779 | 0.9798 | 0.9764 | 0.9799 |

Todas as conversões (`resultado.json` do laboratório; o navegador do `uhd` também com o caminho antigo, para comparar):

| Clipe | Conversão | SSIM | PSNR (Y) | Tamanho |
| --- | --- | --- | --- | --- |
| Grão pesado | Referência x264 rápida (fast, RF 22) | 0.9148 | 38.1 dB | 7,7 MB |
| Grão pesado | Referência x264 alta (slow, RF 20) | 0.9172 | 38.2 dB | 18,0 MB |
| Grão pesado | Referência x264 máxima (veryslow, RF 18) | 0.9307 | 38.7 dB | 39,1 MB |
| Grão pesado | **Relay YouTube 1080p · computador** | 0.9469 | 40.0 dB | 61,3 MB |
| Grão pesado | Referência x264 no mesmo tamanho (Relay no computador) | 0.9468 | 40.0 dB | 59,2 MB |
| Grão pesado | **Relay YouTube 1080p · navegador** | 0.9124 | 38.0 dB | 15,7 MB |
| Grão pesado | Referência x264 no mesmo tamanho (Relay no navegador) | 0.9198 | 38.3 dB | 15,6 MB |
| Imagem limpa | Referência x264 rápida (fast, RF 22) | 0.9922 | 47.6 dB | 0,4 MB |
| Imagem limpa | Referência x264 alta (slow, RF 20) | 0.9943 | 49.4 dB | 0,6 MB |
| Imagem limpa | Referência x264 máxima (veryslow, RF 18) | 0.9955 | 50.7 dB | 0,6 MB |
| Imagem limpa | **Relay YouTube 1080p · computador** | 0.9962 | 51.5 dB | 1,5 MB |
| Imagem limpa | Referência x264 no mesmo tamanho (Relay no computador) | 0.9966 | 52.0 dB | 1,4 MB |
| Imagem limpa | **Relay YouTube 1080p · navegador** | 0.9934 | 49.4 dB | 5,4 MB |
| Imagem limpa | Referência x264 no mesmo tamanho (Relay no navegador) | 0.9976 | 54.1 dB | 5,3 MB |
| Movimento fino | Referência x264 rápida (fast, RF 22) | 0.9887 | 41.0 dB | 10,3 MB |
| Movimento fino | Referência x264 alta (slow, RF 20) | 0.9905 | 42.6 dB | 11,7 MB |
| Movimento fino | Referência x264 máxima (veryslow, RF 18) | 0.9919 | 44.0 dB | 13,8 MB |
| Movimento fino | **Relay YouTube 1080p · computador** | 0.9927 | 45.1 dB | 16,2 MB |
| Movimento fino | Referência x264 no mesmo tamanho (Relay no computador) | 0.9923 | 44.4 dB | 16,3 MB |
| Movimento fino | **Relay YouTube 1080p · navegador** | 0.9853 | 40.3 dB | 12,1 MB |
| Movimento fino | Referência x264 no mesmo tamanho (Relay no navegador) | 0.9901 | 42.1 dB | 12,1 MB |
| 4K → 1080p | Referência x264 rápida (fast, RF 22) | 0.9770 | 45.0 dB | 0,4 MB |
| 4K → 1080p | Referência x264 alta (slow, RF 20) | 0.9771 | 45.4 dB | 1,0 MB |
| 4K → 1080p | Referência x264 máxima (veryslow, RF 18) | 0.9787 | 45.9 dB | 1,3 MB |
| 4K → 1080p | **Relay YouTube 1080p · computador** | 0.9779 | 45.7 dB | 3,9 MB |
| 4K → 1080p | Referência x264 no mesmo tamanho (Relay no computador) | 0.9798 | 46.2 dB | 3,8 MB |
| 4K → 1080p | **Relay YouTube 1080p · navegador (caminho antigo: canvas do navegador)** | 0.9744 | 39.8 dB | 8,5 MB |
| 4K → 1080p | **Relay YouTube 1080p · navegador** | 0.9764 | 44.9 dB | 4,0 MB |
| 4K → 1080p | Referência x264 no mesmo tamanho (Relay no navegador) | 0.9799 | 46.2 dB | 4,0 MB |

## O que isso quer dizer

- **No computador** (SOBEDESCE, e quem mais usar `src/ffmpeg.js`), o Relay é o x264 bem configurado:
  `slow` em vez de `fast`, qualidade constante, escala com arredondamento preciso e cor marcada. No mesmo tamanho,
  **empata**: ganha nos clipes difíceis (grão, movimento fino) e perde por milésimos nos fáceis (limpa: −0,0004;
  4K → 1080p: −0,002). Testamos quadro-chave mais espaçado e não muda o placar: é a diferença entre qualidade
  constante e duas passadas. Nos presets de upload, entrega arquivos maiores que a referência rápida porque guarda mais
  imagem (o que o YouTube e o Instagram precisam para recomprimir bem).
- **No navegador**, a escala, a cor e o arredondamento são do Relay e estão certos (o `uhd` mostra). O que sobra é o
  codificador de cada aparelho. No Chromium do Linux (OpenH264), no mesmo tamanho, a referência x264 guarda mais.
  Os presets compensam com bitrate generoso (16 Mbit/s no 1080p).
- **Ainda falta medir**: Mac (VideoToolbox), iPhone e Windows com placa: o laboratório de aparelhos
  (`/laboratorio`, só nas prévias da Vercel) faz isso no próprio aparelho.

## Cor da Revela (30/10/2026)

A receita (CST log → Rec.709 e look) medida contra a conta da própria Revela (`funcaoDaReceita`), com uma carta de 8
faixas em código de S-Log3 / S-Gamut3.Cine (`test/carta.js`):

| Onde | Como | Diferença máxima (0–255) |
| --- | --- | --- |
| Espelho do shader (`aplicarEtapas`) × Revela, todas as câmeras, com e sem tom | 3.000 pontos do cubo inteiro | < 1,2 |
| LUT 3D de 65 pontos × Revela (descartada na placa) | 20.000 pontos perto do cinza (±0,06) | p99 8, máx. ~33 (cor saturada, um canal no zero) |
| LUT 3D de 65 pontos × Revela, perto do preto (código 0,1) | ponto | ~6 |
| Placa (Chromium, quadro antes do codificador) × Revela sobre o RGB que o navegador decodificou | carta, medida em I420 de 8 bits | ≤ 4 (o próprio I420 de 8 bits da medida) |
| De ponta a ponta no navegador (H.264 do OpenH264) | carta | cinzas ≤ 2; cores ≤ 7 |
| De ponta a ponta no ffmpeg (LUT 65 tetraédrica, x264 RF 10) | carta | ≤ 3 |

O que pesa e não é da cor: o codificador H.264 do navegador já desvia ~3/255 no croma sem cor nenhuma, e o navegador
de teste (SwiftShader) converte o YUV de 10 bits do ProRes em RGB com ~2/255 de diferença do ffmpeg no vermelho. A CST
amplia isso nas cores saturadas (a curva de log é íngreme). Medir em Mac e Windows de verdade no laboratório.

## Transparência e fundo chroma (01/11/2026)

Medido em `test/transparencia.test.js`: um quadro 320×180 com a metade esquerda opaca (testsrc2) e a direita
transparente, em WebM VP9 com alfa e em ProRes 4444 (10 bits com alfa). Cor lida pelo ffmpeg no primeiro quadro (média
de 2×2 pixels).

| Onde | Preset | Metade opaca | Metade transparente |
| --- | --- | --- | --- |
| Navegador (Chromium, WebM e ProRes de entrada) | Transparente (WebM) | alfa 255 | alfa 0 |
| Navegador (Chromium, WebM e ProRes de entrada) | Fundo verde (H.264) | a imagem | verde ≈ (0, 176–177, 60–62); o alvo é (0, 177, 64) |
| Computador (ffmpeg) | ProRes 4444 | alfa 255 | alfa 0 (`yuva444p12le` lido de volta) |
| Computador (ffmpeg) | Transparente (WebM) | alfa 255 | alfa 0 |
| Computador (ffmpeg) | Fundo verde | a imagem | verde dentro de ±12 do alvo |

A primeira versão do chroma no ffmpeg saiu com o verde escuro (0, 152, 62): a mistura em YUV convertia com a matriz
BT.601. Agora a mistura é em RGB e a volta para YUV tem a matriz BT.709 explícita, como no resto do Relay. Ainda não
medido: SSIM das bordas e velocidade em Mac e Windows de verdade.
