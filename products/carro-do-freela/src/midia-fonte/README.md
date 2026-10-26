# De onde vêm as mídias geradas (26/out)

Pedido do Victor: **a qualidade não pode cair, tem que subir**. Por isso nenhuma
mídia de `src/midia/` sai de arquivo já comprimido quando existe original. Os
scripts que faziam isso antes moravam no scratchpad da sessão e se perderam com
ele; agora moram aqui.

| peça | original | como sai |
|---|---|---|
| fotos de cabeçalho (8) e capas (6) | PNG 2688×1520 do GPT Image 2.5 | WebP q95 em 640, 1280, 1920, 2688 |
| brechó (9) | PNG 2048×1360 | WebP q95 em 640, 1280, 1920, 2048 |
| objetos 3D (21) | a ampliação a 4K não está mais no histórico | o `@hd` que estava no ar é o degrau de cima, **byte a byte**; 480/960/1440 saem dele |
| quadros parados (3) | o master sem perda do vídeo | WebP q95 em 1280 e 1912, com a nitidez do vídeo |
| carona da home e login | Kling 3.0 Pro, 1912×1080, ~30 Mb/s | master sem perda → 1280 e 1912, em AV1, HEVC e H.264 |

`fontes.json` diz qual job do Higgsfield é cada peça. **Baixar o original do
histórico não custa crédito; gerar ou ampliar de novo custa e precisa do aval do
Victor.**

## Refazer

```bash
# 1. originais: PNG de cada job em <png>/<8 primeiros do id>.png e os MP4 do
#    Kling em <kling>/<8 primeiros>.mp4 (histórico do Higgsfield, sem custo)
# 2. os masters sem perda dos vídeos, quadro a quadro pela receita
python3 render.py <kling> <masters>
# 3. as escadas de imagem e os vídeos
python3 imagens.py <png> <masters>
./videos.sh <masters>
```

## A receita dos vídeos (`receita.json`)

O script da montagem de 18/out se perdeu. A receita foi refeita **casando cada
quadro do vídeo que estava no ar com o original do Kling**: cada quadro é um
quadro do original (os trechos a 1,25× pulam quadros), a média de dois
quadros vizinhos (a rampa de 2× do mergulho) ou um flash (o quadro clareado
com branco a 50%, 90% e 45%). Conferido contra o arquivo antigo: ~40 dB por
quadro, nenhum fora do lugar. O tempo, os cortes e o ciclo são os mesmos de
antes; só a fonte melhorou.

## Os degraus e a escolha

`nome@<largura>.webp`, `nome@<largura>.mp4` (H.264), `.hevc.mp4`, `.av1.mp4`.
O build lista os degraus em `MIDIA_VAR` e a tela escolhe em `qual()`: o menor
degrau que cobre a largura da janela × a densidade, no melhor codec que o
navegador toca (AV1 → HEVC → H.264).
