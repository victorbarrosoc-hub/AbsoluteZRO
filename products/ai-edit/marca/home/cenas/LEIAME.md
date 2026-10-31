# Cenas de verdade (footage)

Takes de câmera para as demonstrações da página inicial e para o teste de ponta a ponta do editor
(`scripts/montagem.mjs`). Todos do [Mixkit](https://mixkit.co), com a **Mixkit Stock Video Free License** (uso comercial
e pessoal, sem crédito obrigatório; conferido na página de cada take em 31/10/2026). Os da "Restricted License" ficaram
de fora. Aqui não vão como arquivo de banco de imagens: foram cortados, reduzidos para 1280×720 a 24 qps, sem som, e
fazem parte da página. Sem pessoas reconhecíveis e sem marca em destaque (regra do repositório público).

| Arquivo | Take no Mixkit | Trecho usado |
| --- | --- | --- |
| `onda.mp4` | [Turquoise ocean background with foaming waves (2091)](https://mixkit.co/free-stock-video/turquoise-ocean-background-with-foaming-waves-2091/) | 19,5–27,5 s |
| `carro.mp4` | [A red sports car traveling along a curvy asphalt road (52427)](https://mixkit.co/free-stock-video/a-red-sports-car-traveling-along-a-curvy-asphalt-road-52427/) | 0–7,3 s |
| `mar.mp4` | [Speedy aerial tour of a sunny beach (44378)](https://mixkit.co/free-stock-video/speedy-aerial-tour-of-a-sunny-beach-44378/) | 0–8 s |
| `cidade.mp4` | [Top view of the traffic around a roundabout at night (50998)](https://mixkit.co/free-stock-video/top-view-of-the-traffic-around-a-roundabout-at-night-50998/) | 0–6,5 s |
| `coqueiros.mp4` | [Sunny beach in a dynamic drone shot (44385)](https://mixkit.co/free-stock-video/sunny-beach-in-a-dynamic-drone-shot-44385/) | 5,5–13,5 s |

`montagem.mp4` é o **render do próprio AEON** (cinco takes aparados na linha do tempo, uma curva pronta de velocidade em
cada um), só recomprimido para a web com os mesmos quadros; `montagem.json` traz os clipes, as curvas e a velocidade de
cada quadro. Refaça com `node scripts/montagem.mjs` (o roteiro confere a duração do render contra os degraus da curva e
valida o pacote do Premiere e do Final Cut com xmllint). Os `.jpg` são o primeiro quadro (pôster) e `mini/` as miniaturas
do seletor de take.

Codificação: `ffmpeg -ss <ini> -to <fim> -i <take> -an -vf "scale=1280:720:flags=lanczos,fps=24,format=yuv420p"
-c:v libx264 -preset slow -crf 27 -profile:v high -g 24 -movflags +faststart -map_metadata -1 <nome>.mp4`.
