# Revela — finalização e cor para o DaVinci Resolve

**Estado: protótipo com tela, ainda fora do ar.** Fase 5 do PRD (§8 NOSSOM → Finishing, §13). Nome escolhido pelo titular em
25/10/2026; o id técnico continua `finishing` (pasta, contratos de eventos e catálogo no banco). A identidade oficial da
Absolute ZRO vem do serviço de color grading e finalização da ZRO Filmes (zrofilmes.vercel.app/absolute).

## Primeiro recorte ([ADR 0015](../../docs/decisions/0015-finishing-resolve-powergrade-lut.md))

- **Só DaVinci Resolve** (Studio para a ponte de script).
- **Entrega de cor em PowerGrade (`.drx` + still) e LUT (`.cube`).**
- **Cor técnica gerada:** conversão LOG → Rec.709 por câmera, em `.cube` escrito pela própria plataforma.
- **Cor criativa entregue:** o colorista grada no Resolve, exporta o PowerGrade e a plataforma versiona, aprova e
  monta o pacote.
- **Cor por referência:** a pessoa dá um frame de referência e sai uma LUT criativa (protótipo abaixo). A
  plataforma não inventa look: replica o que a pessoa escolheu, com prévia.
- **PowerGrade só pelo Resolve:** o `.drx` não é documentado, então quem cria e lê é a API de script do Resolve,
  rodando numa ponte local ao lado do Resolve aberto.
- **Para usuários da plataforma** (editores e coloristas nos próprios projetos).

## Tela

`index.html` + `app/`: a pessoa escolhe (ou solta) a referência e o frame dela, compara antes e depois arrastando sobre
a imagem, ajusta intensidade, liga só contraste ou só cor, escolhe 33 ou 65 pontos e baixa o `.cube`. **Tudo roda no
navegador**: as imagens não são enviadas para lugar nenhum. Imagens lidas sem conversão de perfil de cor
(`colorSpaceConversion: 'none'`), como o Resolve exportou.

```sh
cd products/finishing
npm run dev   # http://localhost:8080
```

Publicar exige autorização do titular (projeto Vercel próprio com Root Directory `products/finishing`, site estático).

## Protótipo: referência → LUT criativa

A pessoa dá um frame de referência (o estilo que quer) e um frame do material dela; sai uma LUT `.cube` que leva o
material para o estilo. Algoritmo determinístico, sem IA (`src/cor/referencia.js`):

1. **Tom:** preto e teto dos altos da referência, o contraste de cada trecho dela e a exposição do material (uma
   referência noturna não escurece um dia de sol). Curva monótona, inclinação limitada.
2. **Cor:** em cada faixa de luz, o deslocamento que sobrepõe a nuvem de cores (a, b do Oklab) do material à da
   referência; as faixas viram uma reta (dominante geral + split-tone sombras → altos).
3. **Saturação:** comparada dentro do mesmo matiz, para "ter mais céu" não virar "mais saturação".
4. **Intensidade** 0–1, e dá para ligar só o tom ou só a cor.

```sh
cd products/finishing
node src/cli.js --referencia filme.png --material meu-frame.png --saida look.cube --tamanho 65 --previa previa.png
npm test
```

Os dois frames entram em Rec.709 (no Resolve: still exportado depois da conversão do LOG); a LUT sai Rec.709 →
Rec.709 e vai num nó depois dessa conversão. O protótipo lê PNG 8/16 bits; a versão web aceita qualquer imagem.

**O que os testes mostram** (cenas sintéticas, look conhecido): mesma cena chega a ~0,28 da distância original;
cenas diferentes sempre aproximam (média ~0,52), e a cor cai 60–80% quando as cenas têm conteúdo parecido.

**Limites, para dizer na interface:**

- Copia cor e contraste, não o filme: grão, halation, lente, luz e direção de arte não cabem numa LUT.
- Exposição fica a do material.
- Referência sem nada em comum com o material (só céu contra uma cena sem céu) erra a cor. Próximo passo: conta-gotas
  para a pessoa marcar um ponto neutro ou pele na referência e no material.
- A referência é privada: usada para calcular e apagada; a LUT guarda só medidas, não a imagem.

## Ordem de entrega

1. Cor no Resolve: referência → LUT (protótipo pronto), LUTs técnicas, ponte local (PowerGrade e LUT a partir do grade) e pacote de entrega versionado.
2. Depois: QC técnico, exportação por destino e media manager (relink por `asset_id`, normalização).
3. Outros editores só com novo ADR.

## Entradas

- Grade do colorista exportado do Resolve (`.drx` + still) ou câmera/perfil LOG para a conversão técnica.
- Mais adiante: timeline aprovada (`ZroTimelineRef`), mix aprovado (`audio.mix.ready`), mídia vinculada, perfis de
  destino, com validação de correspondência temporal antes de qualquer exportação.

## Saídas (contratos em `packages/media-contracts`)

- `delivery.ready` v1 — `{ source: 'finishing', package_ref }` (pacote de cor aprovado).
- `finishing.qc.completed` v1 — `{ source: 'finishing', qc_ref, passed }` (quando o QC existir).

## Perfis de destino

Configuráveis por canal, com aviso de que plataformas mudam requisitos. Nenhum perfil é dado como "oficial"
de terceiros sem fonte e data de verificação.
