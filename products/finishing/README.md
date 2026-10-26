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

## Marca

Logo oficial do titular em `marca/revela-logo-original.png` (sem alterar) e `marca/revela-logo.png` (a mesma arte sem
o fundo preto, para o preto fosco). Guia em [`marca/index.html`](marca/index.html) ([ADR 0016](../../docs/decisions/0016-identidade-revela.md)): película
perfurada em amarelo filme, com o quadro revelado na diagonal em roxo → vermelho → laranja → amarelo; versões plana e
de uma cor, cores, regras de uso e as alternativas estudadas (`marca/alternativas`).

## Tela

`index.html` + `app/`: a pessoa escolhe (ou solta) a referência e o frame dela, compara antes e depois arrastando sobre
a imagem, ajusta intensidade, liga só contraste ou só cor, escolhe 33 ou 65 pontos e baixa o `.cube`. **Tudo roda no
navegador**: as imagens não são enviadas para lugar nenhum. Imagens lidas sem conversão de perfil de cor
(`colorSpaceConversion: 'none'`), como o Resolve exportou. **Fundo sempre preto fosco** (`#0E0E10` com grão neutro),
sem tema claro: em volta de imagem que se avalia cor, fundo claro engana o olho.

```sh
cd products/finishing
npm run dev   # http://localhost:8080
```

Publicação: projeto Vercel `revela` (autorizado pelo titular em 25/10/2026) em **revela-zro.vercel.app**
(`revela.vercel.app` é de outro app), Root Directory `products/finishing`, site estático sem build (`vercel.json`),
publica só quando a pasta muda. OG do link: `og.jpg` (1200×630), gerado de `marca/og.html` (cubo de cor isométrico
em `marca/og-cubo.svg`): abra no Chromium e capture 1200×630.

## Entrega por destino

`entrega.html` + `src/entrega/`: presets de exportação por destino (YouTube, YouTube HDR, Vimeo, Instagram Reels,
TikTok, TV aberta no Brasil, streaming/servicing e master de arquivo) com codec, contêiner, resolução, bitrate, cor
(tags H.273 e nomes do Deliver do Resolve) e áudio com loudness. **Cada preset mostra fonte e data de verificação**,
com selo Oficial (a plataforma publica), Mercado (não publica) ou parcial (TV aberta: só o loudness é lei).

O botão baixa um script Python para o Resolve Studio (Workspace › Scripts) que procura formato e codec pelo nome nas
listas do próprio Resolve, aplica cada ajuste do Deliver, escolhe o bitrate pela resolução da timeline, avisa o que o
Resolve recusar e salva o preset "Revela · <destino>". Loudness não tem chave na API: vai na lista do que conferir.
Os testes rodam o script num Resolve simulado.

## Converter (o "Handbrake" da Revela)

`converter.html` + `app/converter.js` + `src/conversao/`: o Resolve exporta **um master** (ProRes, preset "Master de
arquivo") e o conversor gera cada versão de entrega a partir dele, **no celular ou no computador, dentro do
navegador**. O arquivo não sai do aparelho.

- Lê ProRes (decodificador WASM, em várias linhas quando a página está isolada: COOP/COEP no `vercel.json`), H.264,
  HEVC, MOV e MP4, vários de uma vez.
- Destinos MP4 em 8 bits da Entrega (YouTube, Vimeo, Reels, TikTok): codec, bitrate pela altura e cadência, áudio
  e resolução saem do mesmo preset. Nunca amplia; vertical vai a 1080 no lado curto, sem cortar.
- Codificador do aparelho (WebCodecs, hardware quando o navegador permite). Saída marcada **BT.709 (1-1-1)**: o
  ProRes decodificado vem sem espaço de cor e o navegador assumiria BT.601, então cada quadro é remarcado.
- Áudio AAC; se o navegador não codifica AAC (Chromium no Linux), sai Opus e a tela avisa.
- No computador, "Salvar direto numa pasta" grava em pedaços no disco (File System Access). Sem isso, o arquivo é
  montado na memória: no celular, até ~1,5 GB de saída (a tela avisa acima disso).
- HDR, primárias diferentes de Rec.709 e mais de 60 fps geram aviso: essas versões saem do Resolve.

Bibliotecas em `vendor/` (copiadas por `npm run vendor`, teste confere a cópia): Mediabunny e
`@mediabunny/prores` 1.62.1, MPL-2.0 (mediabunny.dev), sem alteração além do caminho de import.

## No SOBEDESCE

"Converter com a Revela" (botão direito num vídeo do Drive, ou pelo celular) usa os mesmos destinos e o mesmo plano
daqui: `src/entrega/destinos.js` e `src/conversao/plano.js` são copiados para `products/sobedesce/src/revela/` e um
teste de lá confere a cópia. Mudou um destino aqui, copie para lá.

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
- Referência sem nada em comum com o material (só céu contra uma cena sem céu) erra a cor. Para isso existe o
  **conta-gotas**: a pessoa marca até 3 pares "isto no meu frame é aquilo na referência" (pele com pele, branco com
  branco). A reta da cor passa pelos pares; com dois ou mais, a saturação sai deles. Na dupla de teste que mais erra,
  dois pares levam o erro de cor de 0,026 (sem pares) para 0,0135, abaixo do original (0,0162).
- A referência é privada: usada para calcular e apagada; a LUT guarda só medidas, não a imagem.

## Ordem de entrega

1. Cor no Resolve: referência → LUT (protótipo pronto), LUTs técnicas, ponte local (PowerGrade e LUT a partir do grade) e pacote de entrega versionado.
2. Depois: QC técnico e media manager (exportação por destino e conversor já têm protótipo) (relink por `asset_id`, normalização).
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
