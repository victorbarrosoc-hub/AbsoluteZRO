# 0015 — Revela (ex-Finishing) começa só com DaVinci Resolve, entregando cor em PowerGrade e LUT

**Contexto.** PRD §8 (NOSSOM → Finishing) e §13 (Fase 5) deixavam o editor-alvo em aberto (ADR 0006). Em 25/10/2026 o
titular decidiu o primeiro recorte da plataforma de finalização e gestão de cor, e depois o nome: **Revela** (id
técnico continua `finishing`; migration 0009 troca o nome no catálogo):

- só **DaVinci Resolve** no começo;
- a cor é entregue em **PowerGrade** (`.drx` + still) e **LUT** (`.cube`);
- a plataforma **gera as cores técnicas** (conversão LOG → Rec.709 por câmera) **e entrega as criativas** que o
  colorista faz no Resolve;
- quem usa são os **usuários da plataforma** (editores e coloristas, nos próprios projetos), não só a ZRO Filmes;
- o titular usa o **Resolve Studio**.

**Decisão.**

- **LUT (`.cube`) a plataforma escreve sozinha.** Formato aberto (Adobe/Resolve), 33³ e 65³. Ponto de partida: a
  conversão por câmera do SOBEDESCE (`products/sobedesce/docs/COR.md`, fórmulas públicas dos fabricantes), copiada para
  `products/finishing/` com teste que confere a cópia. A LUT do SOBEDESCE é de visualização; a do Finishing precisa
  declarar espaço de entrada e de saída e passar por conferência de valores conhecidos (cinza 18%, branco, preto).
- **PowerGrade (`.drx`) a plataforma não escreve à mão.** O formato não é documentado pela Blackmagic. Quem cria e lê
  `.drx` é o próprio Resolve, pela API de script (Resolve Studio, Python):
  - criar: aplicar LUT/CDL num clipe de referência (`Graph.SetLUT`, `TimelineItem.SetCDL`), `Timeline.GrabStill`,
    álbum de PowerGrade (`Gallery.GetGalleryPowerGradeAlbums` / `CreateGalleryPowerGradeAlbum`) e
    `GalleryStillAlbum.ExportStills(..., 'drx')`;
  - receber o grade do colorista: ele exporta o PowerGrade no Resolve e envia; a plataforma guarda e versiona sem
    alterar o arquivo, e a ponte gera as LUTs dele com `TimelineItem.ExportLUT` (17/33/65).
- **Ponte local.** Um script/app que roda na máquina do usuário, ao lado do Resolve Studio aberto. A plataforma na web
  nunca recebe o projeto do Resolve; recebe só o que o usuário escolhe enviar (`.drx`, still, `.cube`).
- **Pacote de entrega por projeto:** PowerGrade (`.drx` + still), LUTs (`.cube`), instruções curtas (espaço de cor de
  entrada, onde instalar a LUT, ordem dos nós) e checksum de cada arquivo. Versão e aprovação ficam no HUB; o evento
  `delivery.ready` sai quando o pacote é aprovado.
- **Sem look inventado.** A plataforma não cria look sozinha: converte (técnico), entrega (criativo do colorista) e
  replica a referência que a pessoa escolhe, sempre com prévia antes e depois e intensidade ajustável.
- **Referência → LUT criativa** (pedido do titular, 25/10/2026): a pessoa dá um frame de referência e um frame do
  material; sai `.cube`. Algoritmo determinístico, sem IA: tom (piso, teto e contraste da referência, exposição do
  material), cor por faixa de luz (alinhamento das nuvens de cor em Oklab, juntado numa reta de split-tone) e
  saturação comparada por matiz. Protótipo e testes em `products/finishing/src/cor/referencia.js`. Copia cor e
  contraste, não grão, lente ou luz; referência sem conteúdo em comum erra a cor, e para isso há o conta-gotas
  (até 3 pares "isto no meu frame é aquilo na referência"). Tudo roda no navegador: as imagens não são enviadas.

- **Entrega por destino (pedido do titular, 25/10/2026):** presets de codec, cor e áudio por destino, cada um com
  fonte e data de verificação (selo Oficial, Mercado ou parcial), e um script do Resolve Studio que configura o Deliver
  pela API de render (`GetRenderFormats`/`GetRenderCodecs`, `SetCurrentRenderFormatAndCodec`, `SetRenderSettings`,
  `SaveAsNewRenderPreset`) e relata o que não conseguiu aplicar. SDR sai marcado BT.709 (H.273 1-1-1); HDR só com
  timeline HDR. A Revela não renderiza nem mexe na mídia.

- **Conversor no navegador (pedido do titular, 25/10/2026):** um conversor de vídeo no celular e no computador. O Resolve
  renderiza um master em ProRes e a Revela gera as versões de entrega no aparelho da pessoa (Mediabunny +
  WebCodecs, decodificador ProRes em WASM), sem enviar o arquivo. Exceção consciente a "não renderiza": converte só o
  que a pessoa escolhe, gravando arquivo novo, sem tocar no master. Só SDR 8 bits (H.264/HEVC em MP4, marcado
  BT.709); HDR e conversão de cadência continuam no Resolve.

- **"Converter com a Revela" no SOBEDESCE (pedido do titular, 26/10/2026):** botão direito num vídeo do Drive (ou
  o menu do vídeo no celular) gera a versão de um destino e sobe ao lado do original. Um botão só: converte o aparelho
  que tocou. A Revela decide (presets e plano copiados para o SOBEDESCE, com teste que confere a cópia); no computador,
  o ffmpeg com o codificador de hardware, baixando do Drive quando o original não está na máquina, com MD5 conferido;
  no celular, o mesmo motor do conversor da Revela (Mediabunny/WebCodecs), lendo do Drive por pedaços. É a primeira
  ponte entre dois produtos da família sem passar pelo HUB: nenhum dado sai do Drive da pessoa.

**O que um pacote real mostrou (25/10/2026).** Pacote comercial de terceiros enviado pelo titular, estudado só fora do
repositório (nenhum arquivo dele entra aqui):

- O `.drx` é um XML (`Gallery::GyStill`, com `DbAppVer` da versão do Resolve) com o still ao lado (`.dpx`). O grade fica
  em `<Body>`: hex de um byte de cabeçalho seguido de um quadro **zstd**; dentro, binário com rótulos dos nós, Color
  Space Transform (OFX) com os parâmetros e as LUTs.
- **A LUT não vai dentro do `.drx`: só o caminho relativo à pasta de LUTs do Resolve** (`<Pacote>/<Pasta>/<LUT>.cube`).
  Então o pacote precisa levar as LUTs nessa mesma árvore, e a plataforma consegue conferir sem o Resolve se cada LUT
  citada existe no pacote.
- LUTs de look em 65³ e de monitoramento por câmera (LOG → look, para monitor/câmera) em 33³, todas `.cube`.
- O XML guarda `GalleryPath` com o caminho da máquina de quem exportou (nome de usuário): é dado pessoal, a plataforma
  não mostra e avisa antes de publicar.

**A conferir antes de prometer na interface.**

- Resolve gratuito: script externo é recurso do Studio; usuário do gratuito recebe as LUTs e importa o PowerGrade à
  mão até termos teste dizendo o contrário.
- Versões do Resolve suportadas (a API usada aparece no README de script da v20). Teste de ida e volta com projeto real
  do titular antes de liberar.

**Consequências.** O ADR 0006 ganha o editor-alvo (Resolve). A ordem da Fase 5 muda: a entrega de cor vem antes do QC
técnico e do media manager, que continuam no plano. Outros editores (Premiere, Final Cut) só depois, com novo ADR.

**Como reverter.** É só escopo: voltar à ordem do PRD §13 (QC/exportação primeiro) não exige migrar dados.
