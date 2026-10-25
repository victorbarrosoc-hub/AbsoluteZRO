# 0015 — Finishing começa só com DaVinci Resolve, entregando cor em PowerGrade e LUT

**Contexto.** PRD §8 (NOSSOM → Finishing) e §13 (Fase 5) deixavam o editor-alvo em aberto (ADR 0006). Em 25/10/2026 o
titular decidiu o primeiro recorte da plataforma de finalização e gestão de cor (nome ainda provisório):

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
- **Sem grading criativo automático.** A plataforma não inventa look; só converte (técnico) e entrega (criativo).

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
