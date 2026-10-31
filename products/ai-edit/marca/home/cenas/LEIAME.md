# Cenas de verdade (footage em 50 e 60 qps)

Takes de câmera para as demonstrações da página inicial e para os testes do editor (`scripts/montagem.mjs`,
`test/tela.test.js`). Todos do [Coverr](https://coverr.co), grátis (não premium), não gerados por IA, com a licença do
Coverr: uso comercial e pessoal sem custo e sem crédito obrigatório; não pode revender o vídeo nem oferecer como banco de
imagens, nem usar para treinar IA (conferida em https://coverr.co/license em 31/10/2026). Aqui não vão como arquivo de
banco de imagens: foram cortados, reduzidos para 1280×720, sem som, e fazem parte da página. Sem pessoas reconhecíveis
e sem marca em destaque (regra do repositório público).

**Alta taxa de verdade.** A câmera lenta só fica lisa se a fonte tem quadro novo de verdade: cada take foi conferido
quadro a quadro (nenhum quadro repetido no trecho usado). Gaivotas, cachoeira, roda de bicicleta e vales do Coverr
marcados como 50/60 qps repetem metade dos quadros (são 25/30 qps por dentro) e ficaram de fora.

| Arquivo | Take no Coverr | qps | Trecho usado |
| --- | --- | --- | --- |
| `onda.mp4` | [Ducks in the sea](https://coverr.co/videos/ducks-in-the-sea-cakpqymfd0) | 60 | 4–12 s |
| `cavalo.mp4` | [Horse rolling on the grass](https://coverr.co/videos/horse-rolling-on-the-grass-lxbf1tq9hj) | 50 | 0–7 s |
| `pelicano.mp4` | [Pelicans flying](https://coverr.co/videos/pelicans-flying-niuhsghinm) | 60 | 0,5–6,5 s |
| `mergulho.mp4` | [Pelicans diving](https://coverr.co/videos/pelicans-diving-9n097vz2ht) | 60 | 1–9 s |
| `flores.mp4` | [Flowers and bees](https://coverr.co/videos/flowers-and-bees-0szs5yqlax) | 59,94 | 1–9 s |

`montagem.mp4` é o **render do próprio AEON**: um projeto 16:9 em 24 qps com os cinco takes aparados na linha do tempo
e uma curva pronta de velocidade em cada um (Vale, Herói, Bala, Arrancada, Pulso duplo). A câmera lenta usa os quadros
reais da câmera e o fluxo óptico só onde a câmera não tem quadro (abaixo de 40–48%). O render sai em 1920×1080 e aqui
vai reduzido para 1280×720 e recomprimido para a web, com os mesmos quadros. `montagem.json` traz os clipes, as curvas, a
velocidade de cada quadro e quantos quadros saíram do fluxo óptico. Refaça com `node scripts/montagem.mjs` (confere a
duração do render contra os degraus da curva e valida o pacote do Premiere e do Final Cut com xmllint). Os `.jpg` são o
primeiro quadro (pôster) e `mini/` as miniaturas do seletor de take.

Codificação: `ffmpeg -ss <ini> -to <fim> -i <take> -an -vf "scale=1280:720:flags=lanczos,format=yuv420p" -c:v libx264
-preset slow -crf 27 -profile:v high -g 60 -movflags +faststart -map_metadata -1 <nome>.mp4` (o qps do take fica).
