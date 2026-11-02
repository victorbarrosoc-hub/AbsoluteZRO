# ADR 0038 — Edição automática no AEON: modos por tipo de vídeo, na máquina da pessoa

**Status:** aceita (01/11/2026, pedido do titular)

## Contexto

O titular mostrou dois plugins de Premiere da PxlSafe: o MVX AI (clipe musical: sincroniza as tomadas pela música,
separa performance de B-roll, corta na batida com verso mais lento e refrão mais rápido, troca qualquer plano) e o
WeddX (casamento: organiza o dia, sincroniza câmeras e gravador, falas dos votos por cima da música, filme e teaser). Os
dois analisam o material na nuvem e cobram por hora de análise. O pedido: o AEON fazer isso e melhor, com
predefinições por tipo de vídeo (clipe, DVD e EP; casamento; conteúdo; aftermovie de festa; documentário), refinadas
para dificilmente errar uma boa edição, e encaixado no que cada plataforma do ecossistema já faz.

## Decisão

- **"Edição automática"** na Mídia abre os modos em cartões. Cada modo é um preset versionado em
  `products/ai-edit/presets/<modo>.v<N>.json` (critérios editoriais legíveis, nunca prompt; versão publicada não muda),
  conferido por `src/auto/modos.js`. **A tela só mostra o modo que funciona de verdade**: nesta entrega, Clipe,
  Aftermovie e Conteúdo (a análise de fala que já existia). Casamento e Documentário entram quando estiverem prontos.
- **Tudo na máquina** (custo zero, ADR 0020): a análise roda num worker do navegador, sem upload, sem hora de análise.
  É medida, não IA, e a tela diz isso:
  - sincronia pelo som (correlação dos ataques e do croma pela FFT, com o acerto fino ao milissegundo); a tomada sem a
    música no som vira B-roll, e a que casa em dois pontos (um refrão igual ao outro) sai marcada "Confira";
  - batida (andamento pela autocorrelação, batidas por programação dinâmica, primeiro tempo pela harmonia e pelo grave);
  - partes da música (intro, verso, pré-refrão, refrão, ponte, final) pela harmonia e pela energia de cada frase;
  - nota de cada momento do plano: nitidez, luz e firmeza, em miniaturas a 2 quadros por segundo.
- **Montagem** (`src/musica/montagem.js`, `src/auto/montar.js`): o corte cai sempre na batida e toda troca de parte é
  corte. A performance só entra onde cobre o trecho e fica em sincronia; a mesma tomada não entra duas vezes seguidas.
  O B-roll entra na proporção escolhida, nunca dois seguidos, e cada trecho dele uma vez só. As partes mais fortes
  escolhem o material primeiro. A semente decide tudo ("Outra versão" muda a semente). Montar troca a linha num passo só
  do Desfazer. A música vira a **trilha** do projeto (`src/trilha.js`, presa ao começo da linha), as câmeras calam
  (−60 dB, sobe no Inspector) e as partes viram marcadores, que a Entrega já transforma em peças e capítulos. O zoom na
  batida sai como proposta para aprovar no Revisar.
- **Revisão:** no Inspector, cada plano mostra as outras opções do mesmo trecho da música. A troca é em dois toques,
  mantém o tamanho e, se for performance, a sincronia.
- **Trilha em todo lugar:** na prévia, no vídeo final e nos exportadores. No Final Cut e no Resolve vai conectada ao
  primeiro clipe com a função "music"; no Premiere, no último par de faixas; no OTIO, na faixa "Música"; na EDL, como
  comentário.

## Ecossistema (cada plataforma no que já faz)

- **SOBEDESCE**: traz o bruto do Drive (o AEON já abre).
- **Synquei**: a sincronia de várias câmeras e gravadores para Casamento e DVD ao vivo, com uma cópia do motor dele no
  AEON conferida por teste (como o núcleo do Relay no SOBEDESCE). A música contra a tomada usa o motor do AEON.
- **Quasar Audio Lab**: voz limpa dos votos e da entrevista, voz e instrumental separados.
- **Revela**: cor (log para Rec.709 e look). O AEON não refaz: exporta para o Revela ou o Resolve.
- **Maestro**: aprovação do cliente com nota no segundo exato. As notas voltam como marcadores, que o AEON já importa.
- **Relay**: formatos de entrega.
- **Higgsfield** (ADR 0037): o B-roll que falta, só se a pessoa quiser e com os créditos dela.

## Consequências

- O projeto ganha `p.trilha` e `p.auto`, a análise com a sincronia e as notas, para trocar plano e remontar depois de
  reabrir sem analisar de novo. Projetos antigos abrem sem nada disso.
- Busca visual ("primeiro beijo") pede modelo de imagem local e fica para depois. Música composta por IA também, porque
  fere o custo zero.
- Testado com música sintética (`test/musica-sintetica.js`): ainda falta validar com clipes reais de artistas.
