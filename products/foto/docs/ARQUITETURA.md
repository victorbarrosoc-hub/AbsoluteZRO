# Arquitetura — plataforma de fotos (id `foto`)

Contrato entre os módulos. Mudou um contrato, mude aqui primeiro. Decisão em
[ADR 0044](../../../docs/decisions/0044-plataforma-de-fotos.md); estudo de mercado e de técnica em [`estudo/`](estudo/).

## Nomes

- **Produto:** LUXON (provisório; o titular decide). O id técnico `foto` é para sempre.
- **Motor de revelação:** Latitude. **Nota da decupagem:** Magnitude.
- O nome do produto mora em **um lugar só**: `app/nome.js` (`NOME`, `ASSINATURA`). Nenhum outro arquivo escreve o nome à mão.

## Regras que não se negociam

1. **A foto não sai do aparelho.** Ler, decupar, revelar e exportar rodam no navegador. A única coisa que sobe é a
   prévia reduzida com marca-d'água de uma galeria que a pessoa mandou publicar para o cliente.
2. **Nada é movido, renomeado nem apagado.** O app lê a pasta; grava só o que a pessoa pede (exportação, XMP ao lado).
3. **Não fingir.** Sinal que não foi medido não aparece. Camada de visão que não carregou aparece como indisponível.
   Importação aproximada diz o que ficou aproximado. Nota vem sempre com o motivo.
4. **Fechado** (regra da raiz): sem a claim `zro_release.foto`, só a página neutra. Nome, ícone, OG e app só pela função.
5. **Rosto é dado sensível** (LGPD, art. 5º II e art. 11). Detectar rosto e olho fechado não identifica ninguém.
   **Reconhecer** (achar as fotos de uma pessoa num evento) cria uma assinatura do rosto: só com aviso próprio e
   consentimento destacado, por evento, desligado por padrão. A selfie **nunca** sai do celular do visitante; o vetor
   da busca não é gravado nem vai para log. O fotógrafo escolhe o modo por evento (decisão do titular, 13/11/2026):
   - **Com consentimento** (padrão): só vai ao servidor a assinatura de quem pediu para ser achado; o computador do
     fotógrafo compara com as fotos e sobe só a ligação "foto ↔ pessoa". Nenhum vetor de quem não consentiu sai do
     aparelho do fotógrafo.
   - **Busca aberta** (só em evento com aviso prévio: inscrição ou cartaz gerado pelo app): o servidor guarda os
     vetores dos rostos das fotos daquele evento, com prazo curto, e apaga com o evento.
   Sobem só prévias reduzidas com marca-d'água; o original fica no aparelho. Sem banco de rostos entre eventos; nada
   disso vai para exportação ou XMP. Estudo e números em [`estudo/rosto-em-evento.md`](estudo/rosto-em-evento.md).
   Revisão jurídica antes de lançar.
6. Repositório público: nenhuma foto de cliente, RAW privado, token ou `.env`. Amostras CC0 ficam em `.amostras/`
   (fora do git); os testes geram as próprias imagens.

## Pastas e donos

```
src/            núcleo sem DOM, ESM puro, roda igual em Node e no navegador (é o que os testes cobrem)
  raw/          ler o arquivo: negativo.js (contrato), libraw.js, dng.js, previa.js, exif.js, latitude.js
  motor/        Latitude: ajustes.js (contrato), base.js, ponto.js, local.js, tela.js, revelar.js, auto.js, cor/, gpu/
  decupagem/    Magnitude: medidas.js, fft.js, rostos.js, cena.js, grupos.js, nota.js, textos.js
  estilo/       predefinicao.js, biblioteca.js, lightroom-ler.js, lightroom-escrever.js, lrtemplate.js, cube.js,
                look.js, referencia.js, por-foto.js, qc.js
  exportar/     jpeg.js, tiff.js, png.js, icc.js, xmp.js, nome.js, fila.js
  biblioteca/   catalogo.js (fotos, marcas, filtros, desfazer), sem armazenamento
app/            telas (Preact + htm, sem build), workers, CSS; só sai pelo gate
api/            funções Vercel: login único, gate, galerias do cliente, biblioteca na conta
db/migrations/  schema `foto` (papel `foto`, papel de app `foto_app`, RLS em tudo)
vendor/         bibliotecas de terceiros pequenas, versionadas, com licença (scripts/vendor.mjs)
test/           node --test; Chromium e Postgres de verdade
```

Identificadores, classes CSS e textos em português.

## Contratos

### Negativo (`src/raw/negativo.js`)

O que sai de um RAW antes de qualquer conta. Campos no cabeçalho do arquivo. `abrirRaw(bytes, { nome }) → Promise<Negativo>`
em `src/raw/libraw.js`; `lerDng(bytes) → Negativo` em `src/raw/dng.js` (leitor próprio: dois iluminantes, ForwardMatrix,
BaselineExposure, NoiseProfile, opcodes). `extrairPrevia(bytes) → { jpeg, largura?, altura? } | null` e
`lerExif(bytes) → exif` em `src/raw/previa.js` e `exif.js`, em JS puro, sem WASM: é o que a decupagem usa para ser
instantânea. `escreverDng(negativoSintetico) → Uint8Array` existe para os testes fabricarem um RAW conhecido.

A classe LibRaw é injetada (em Node vem de `node_modules`, no navegador de `/vendor`): `criarLeitor(LibRaw)` devolve
`{ ler(bytes, { nome }), revelarLinear(bytes, opcoes) }`, e `abrirRaw` usa o leitor de `usarLibRaw(LibRaw)` (ou
`{ leitor }`). Arquivo que não abre lança `ErroRaw` com `codigo` (`nao-e-raw`, `sem-suporte`, `corrompido`) e o motivo.
Leitura parcial: `extrairPrevia(começo, { total, lado? })` devolve `{ jpeg: null, precisa: { inicio, fim } }` quando a
prévia mora adiante; `extrairPreviaDe(ler, total)` faz as leituras sozinho. `opcodes.js` lê as OpcodeList do DNG e
aplica GainMap e FixVignetteRadial num mosaico Float32 (`aplicarOpcodes`); os demais saem listados como não aplicados.

**Arquivo já sem mosaico** (Sony "sem perdas" M e S em YCbCr, `src/raw/sony.js`; DNG LinearRaw: ProRAW em JPEG sem
perdas e o "DNG com perdas"): Negativo com `cfa: { tipo: 'linear' }` e `sensor: { largura, altura, amostras: 3, dados }`
(RGB de câmera entrelaçado, linear). `wb.aplicado: true` quando o dado já vem com o branco como fotografado (o YCbCr da
Sony): quem revela não multiplica de novo. `prepararBase` pula o demosaico (preto, saturação, corte, altas luzes em RGB,
matriz) e devolve `demosaico: null` (ou 'agrupado' com redução). sRAW da Canon e sNEF ainda são recusados com motivo.

### Abrir (`src/abrir.js`) — a porta única

```
abrirFoto(bytes, { nome, leitor, demosaico = 'rapido', reduzir = 1 })
  → Promise<{ base, latitude, exif, camera: { fabricante, modelo }, previa: { jpeg, largura, altura } | null, avisos: [texto], origem: 'raw' | 'imagem' }>
abrirImagem({ largura, altura, dados, canais, espaco, exif }) → o mesmo formato, com latitude null (foto já decodificada)
conferirBase(base) → { p01, p50, p999 } ou ErroRaw (imagem toda preta ou toda branca)
```

`leitor` = `criarLeitor(LibRaw)`; sem ele só DNG e JPEG abrem. Ordem: ler → opcodes de ganho no mosaico (e
MapPolynomial na imagem sem mosaico) → zero da exposição → Latitude → `prepararBase` com ela → DefaultCrop →
conferência. O **zero da exposição** (`exposicaoDaCamera` em `src/motor/base.js`) é gravado em `negativo.exposicaoBase`
antes da Latitude: BaselineExposure declarado + `EXPOSICAO_DE_REFERENCIA` (1 EV: o cinza que o fotômetro mediu fica em
~0,09 da saturação, pela ISO 12232 mais a folga da SOS/REI) + o número do fabricante quando o arquivo não é DNG
(`EXPOSICAO_POR_FABRICANTE`; hoje Sony +0,4). A base, as margens da tela e a Latitude partem do mesmo cinza; sem ele a
revelação neutra saía ~1 EV abaixo do JPEG da câmera. JPEG aberto com `reduzir` > 1 sai com `base.reduzir` igual ao
pedido (a vizinhança mede na escala da foto cheia). X-Trans em
'qualidade' passa pelo Markesteijn do LibRaw (`revelarLinear`) e segue como imagem sem mosaico. Câmera que o LibRaw não
conhece abre com matriz de reserva e aviso. JPEG sequencial abre pelo decodificador próprio, com o espaço do perfil ICC;
PNG, HEIC, WebP e JPEG progressivo lançam ErroRaw com `decodificarNaTela = true` (a tela decodifica e chama
`abrirImagem`).

### Latitude (`src/raw/latitude.js`)

`medirLatitude(negativo) → Latitude`: o que o **arquivo** tem, medido no dado do sensor.

```
{
  preto: [r, g, b],            // medido (pixels mascarados validados) ou declarado
  branco: [r, g, b],           // saturação efetiva = min(declarado, empilhamento detectado no histograma)
  ruido: { leitura, ganho, origem: 'mascarados' | 'ajuste' | 'perfil' | 'declarado' },   // em DN; var = ganho·S + leitura²
  faixa: { engenharia, fotografica },     // stops: SNR = 1 e SNR = 10
  margem: {
    altas: [r, g, b],          // stops entre o percentil 99,9 e a saturação, por canal
    sombras,                   // stops entre o percentil 0,1 e o piso de ruído (SNR = 1)
    acimaDoCinza, abaixoDoCinza   // stops disponíveis em torno do cinza médio (0,18), já com a exposição base (por abrirFoto, com o zero de referência)
  },
  cortado: { um, dois, tres }, // fração da área com 1, 2 ou 3 canais saturados (1 e 2 = recuperável; 3 = perdido)
  confianca: 'alta' | 'media' | 'baixa'
}
```

O que não deu para medir sai `null` (ruído, faixa, `sombras` e `abaixoDoCinza` de um quadro todo estourado), nunca um
número de enfeite: quem consome confere. O piso de ruído das margens é o ruído de leitura. `resumoLatitude(latitude)`
devolve as frases curtas da tela; `latitude.detalhe` diz de onde veio cada número.

### Ajustes (`src/motor/ajustes.js`)

A lista única de controles (`CONTROLES`), `neutro()`, `normalizar()`, `misturar()`, `aplicarEstilo()`, `mexidos()`.
Os controles de luz valem em EV em torno do cinza médio, não pelo conteúdo: mesmo número, mesmo resultado em qualquer
foto. `DA_FOTO` (exposição, branco, geometria) é corrigido foto a foto e não viaja na predefinição por padrão.

### Imagem

`{ largura, altura, dados: Float32Array }`, RGB entrelaçado (3 por pixel), **linear, Rec.2020 D65, cena** (sem teto:
valores acima de 1 são altas luzes de verdade; negativos pequenos são ruído e ficam). Cinza médio = 0,18.

### Motor (`src/motor/`)

```
prepararBase(negativo, { demosaico: 'rapido' | 'qualidade', reduzir: 1 | 2 | 4, latitude?: Latitude }) → Base
baseDeImagem({ largura, altura, dados: Uint8ClampedArray | Uint16Array, canais: 3 | 4, espaco: 'srgb' | 'p3' | 'adobe' }) → Base
exposicaoDaCamera(negativo, { dng }) → EV   // o zero da exposição: BaselineExposure + referência (+ fabricante fora do DNG)
revelar(base, ajustes, { tela: 'srgb' | 'p3' | 'rec2020', regiao? }) → Imagem de TELA (0..1, já com a curva da tela)
paraBytes(imagemDeTela, { bits: 8 | 16, pontilhado }) → Uint8ClampedArray RGBA | Uint16Array RGB
Base = { imagem: Imagem, latitude: Latitude | null, branco: { kelvin, tinta, neutroCamera? }, origem: 'raw' | 'imagem',
         exposicaoBase,                 // EV somados à cena: o do negativo (por abrirFoto, já com o zero de referência)
         orientacao, ruido?: { a, b, origem },   // var(Y) = a·Y + b na imagem de trabalho
         demosaico: 'rapido' | 'qualidade' | 'basica' | 'agrupado' | null, reduzir,
         cortado: { um, dois, tres }, folgaAltas }             // EV recuperados acima da saturação (entra na margem)
```

Ordem (a mesma no JS e na GPU):

1. **No sensor** (`base.js`): linearizar → preto por sensel (sem cortar negativos) → saturação efetiva por canal →
   máscara de corte → branco em espaço de câmera → **reconstrução de altas luzes no mosaico** (um ou dois canais
   cortados: estimados pela razão local dos canais válidos; três: neutro, com transição suave) → demosaico
   (`rapido`: Malvar-He-Cutler 5×5; `qualidade`: direcional com escolha por homogeneidade; X-Trans: caminho próprio
   simples na prévia e LibRaw na exportação) → câmera → XYZ D50 (dois iluminantes interpolados por 1/T) → Rec.2020.
   Sem código GPL: só o que está em artigo ou é nosso.
2. **Na cena** (`ponto.js`, por pixel, linear): exposição (EV + exposição base) → branco por adaptação cromática
   (CAT16) → luz em EV em torno do cinza (contraste com pivô em 0,18; altas, sombras, brancos e pretos como curvas
   suaves em log) → curva paramétrica e de pontos → calibração → misturador de 8 faixas e vibração/saturação em
   Oklab → P&B → tonalização (sombras, meios, altas, global; depois do P&B, para existir o P&B tonalizado) → desbotar.
3. **Vizinhança** (`local.js`): textura, clareza, neblina, ruído (com o modelo de ruído medido no arquivo), nitidez,
   grão, vinheta. Tudo que precisa de pixel vizinho mora aqui e roda em resolução proporcional. O ruído roda na base,
   antes do passo 2 (é onde o modelo de ruído vale); o resto, depois: neblina → clareza e textura → nitidez → grão →
   vinheta.
   A transmissão da neblina e a base larga da clareza saem de um mapa calculado UMA vez por revelação, na foto
   inteira reduzida (lado ~512 px), e lido no tamanho cheio com a guia cheia (filtro guiado rápido, He e Sun 2015):
   os ladrilhos não precisam mais de centenas de pixels de margem. `revelar(…, { vizinhancaExata: true })` faz a conta
   bloco a bloco, só para medir. A cor do ar (neblina) é medida uma vez na foto inteira (reduzida a 256 px, depois da
   cena) e vale nos dois sentidos, tirar e pôr: o resultado não depende do ladrilho, no JS e na GPU.
4. **Tela** (`tela.js`): mapa de tons em sigmoide log-logística com o cinza preso, **com as margens de cima e de baixo
   tiradas da Latitude do arquivo** (em `auto`) → preservação de matiz → compressão de gamut em Oklab → curva da tela.

Foto que já chega pronta (JPEG, PNG, TIFF) entra pela inversa exata do passo 4: com os ajustes neutros ela sai igual
(erro < 1/255), e os controles se comportam como no RAW.

`ponto.js` expõe `criarPonto(ajustes, contexto) → { aplicar(r, g, b, saida) }` e `uniformes(ajustes, contexto)`: os
mesmos números que a GPU recebe. `gpu/` (WebGL2) é espelho do JS; o teste trava a diferença em menos de 1/255.

### Motor na placa (`src/motor/gpu/motor.js`) e sessão de revelação (`app/motor/`)

```
criarMotorGpu(gl, { precisao: 'auto' | 'alta' }) → { info: { renderizador, software, maxTextura },
  carregarBase(base, { janela?, referencia?, corte? }), desenhar(ajustes, { alvo: 'tela' | 'textura', regiao, zoom,
  comparar: { posicao, antes? }, avisos, tela, semLocal, semente, look }) → { largura, altura, ms, ignorados },
  ler({ tipo: 'float' | 'uint8', regiao }), histograma(ajustes) → Promise<{ tela, cena }>, mostrarImagem(fonte), liberar(), perdido() }
criarSessao({ canvas, motor: 'auto' | 'gpu' | 'js', aoMudar }) → { abrir(File | { bytes, nome }) → Promise<{ latitude, exif,
  camera, avisos, largura, altura, origem, motor }>, ajustar(ajustes), ver({ zoom: 'encaixar' | número, x, y, comparar,
  avisos, tela }), histograma(), auto(), exportarPixels(ajustes, { tela, bits, lado, aoProgredir, sinal }) → Promise<{
  largura, altura, dados, espaco, motor }>, lerTela(), estado(), fechar() }
```

Ponto, tela, geometria e look na placa: a mesma conta do JS (< 1/255). Vizinhança: os mesmos filtros; o filtro guiado
de raio maior que 6 px roda reduzido por área e volta por bilinear (ΔE Oklab médio < 0,003). Redução de ruído só no JS.
Avisos: o alfa da cena leva os canais cortados no sensor (`base.corte` = matriz Rec.2020 → câmera e limiar por canal;
sem negativo, aproximado pelo neutro da câmera, `corteDaBase`) e a sombra abaixo do piso de ruído (`latitude.margem
.abaixoDoCinza`). `zoom` da sessão: 1 = um pixel da foto cheia por pixel do aparelho.

### Decupagem (`src/decupagem/`)

Entrada: a prévia (JPEG embutido ou a foto reduzida a 1024 px no lado maior) como `{ largura, altura, rgba }`.

```
medir(previa) → Medidas { largura, altura, nitidez: { q, s0, s1, qLocal, mapa: { colunas, linhas, bloco, valores } },
                         borrao: { tipo: 'nenhum' | 'foco' | 'movimento', grau: 'nenhum' | 'leve' | 'forte', comprimento?, angulo?, cepstro },
                         exposicao: { altas, altas3, baixas, p1, p50, p99, media }, ruido, dhash, phash, horizonte: { angulo, forca } | null }
analisarRostos(deteccoes, luma) → [{ caixa, olhos: 'abertos' | 'parcial' | 'fechados' | 'sorrindo' | null, ear, nitidezOlhos, nitidezRosto,
                                     razaoFundo, focoErrado, sorriso, peso, chave, principal, cortado }]
classificarCena({ rostos, objetos, rotulos, medidas }) → { cena: 'retrato' | 'grupo' | 'pessoas' | 'animal' | 'natureza' | 'paisagem' | 'comida' |
                                                           'arquitetura' | 'produto' | 'documento' | 'noturna' | 'outra', confianca, porque, noite }
agrupar(fotos) → [{ id, fotos: [id], tipo: 'repetidas' | 'sequencia', escolhida, reservas, equivalentes, desempate }]
avaliar(sinais, { rigor, ensaio, pesos, referencia }) → Magnitude { total, estrelas, balde: 'fica' | 'talvez' | 'fora', motivos: [texto],
                                                                    componentes: { foco, pessoas, exposicao, ruido }, confianca, incertezas, dicas, detalhe }
avaliarEnsaio(fotos, opcoes) → { magnitudes: Map(id → Magnitude), grupos, referencia }   // calibra, agrupa, avalia, escolhe e protege a cobertura
calibrar(fotos) → referencia · protegerCobertura(magnitudes, grupos) · meta(fotos, n, { grupos }) · ajustarPesos(pesos, trocas)
```

`sinais` junta medidas, rostos, cena, exif, `tipo` e, quando o RAW já foi lido, a `Latitude`: exposição estourada só
reprova quando o dado do sensor está perdido (três canais); canal recuperável vira aviso. `exposicao.altas`, `altas3` e
`baixas` são fração da área (0 a 1); `dhash` e `phash` são 16 dígitos hexadecimais. Quem decide a classe de nitidez é
`qLocal` (o q das partes mais nítidas); `q` é a medida de percentis. O que não deu para medir sai `null`. O `cena` do
catálogo é `classificarCena(...).cena`. Todos os textos (motivos, cenas, baldes) moram em `textos.js`.

Detecção que o worker entrega por rosto: `{ caixa: { x, y, largura, altura } em px da prévia, confianca?, olhos?: [{ x, y },
{ x, y }] em px da prévia, malha?: 478 pontos em unidade isotrópica, blendshapes?: { nome: valor } }`. Objetos:
`[{ classe, confianca }]` (COCO). Rótulos: `[{ nome, confianca, indice? }]` (ImageNet). Camadas de visão (rosto e olhos;
objetos e animais; rótulos de cena) rodam em `app/decupagem/visao-worker.js` com MediaPipe; sem elas (`rostos` undefined)
a nota sai só com o que foi medido, a certeza cai, e a tela diz isso.

### Esteira da decupagem (`app/decupagem/`)

```
criarAnalise({ loja }) → { iniciar({ ids?, camadas: ['rostos', 'objetos', 'rotulos'], rigor, ensaio, pesos?, raw? }), pausar(), retomar(),
                          cancelar(), estado(), assinar(f), mostrar(ids), refazerNota({ rigor, ensaio, pesos }), meta(n),
                          revisarPeloRaw(ids?), grupos(), encerrar() }
estado() → { situacao: 'parada' | 'preparando' | 'rodando' | 'pausada' | 'fechando' | 'pronta' | 'cancelada', feitas, total, novas,
             puladas, porSegundo, restante?, camadas: { rostos, objetos, rotulos: 'pronta' | 'carregando' | 'indisponivel' | 'desligada' },
             motivos, raw: { feitas, total, lidas, falhas }, tempos (ms por etapa), erro }
```

Por foto: a prévia de 1024 px → `medir` num pool (`medir-worker.js`) → visão num worker só (`visao-worker.js`) →
`classificarCena` → `catalogo.atualizarVarias` em lotes. A cada 40 fotos e no fim, `avaliarEnsaio` dá a Magnitude e os
grupos (`catalogo.definirGrupos`). O que está na tela passa na frente (a análise escuta o mesmo `miniaturas.mostrar` da
grade). Recarregar não refaz nada: entra na fila só a foto sem `medidas` ou sem uma camada pedida e disponível.
`refazerNota` não relê pixel nenhum. A segunda passada (`raw: true` ou `revisarPeloRaw`) lê o RAW das fotos cuja prévia
mostrou estouro além da tolerância (`raw-worker.js`: LibRaw + `medirLatitude`) e reavalia. A lupa desenha com
`sobreposicao(foto)` (frações do quadro: rostos com o estado dos olhos, mapa de nitidez, direção do tremido) e escreve
com `resumoDaFoto(foto)` (frases de `textos.js`). O que cada foto ganha está no cabeçalho de `analisar.js`; rosto que a
malha recusou (nuca, cabelo) vem com `duvidoso: true` e não decide foco nem pessoa-chave.

### Catálogo (`src/biblioteca/catalogo.js`)

```
Foto { id, nome, caminho, tamanho, tipo: 'raw' | 'imagem', formato, exif, marca: 'escolhida' | 'rejeitada' | null,
       estrelas: 0..5, cor: null | 'vermelho' | 'amarelo' | 'verde' | 'azul' | 'roxo', magnitude?, medidas?, rostos?, cena?,
       grupo?, ajustes?, predefinicao?, cliente?: { escolhida, comentario },
       par?: { nome, tamanho, formato }, proporcao?, semPrevia?,
       latitude?, analise?: { versao, camadas, objetos, rotulos, cena: { confianca, porque, noite }, giro, raw? },
       escolha?: { tipo, tamanho, escolhida, equivalente, equivalentes, desempate } }
```

`id` = hash estável de nome + tamanho + data de captura. Estado em memória com `assinar()`; quem guarda é a tela
(IndexedDB e a pasta escolhida). Atalhos do Lightroom: P, X, U, 0–5, 6–9, setas, espaço, Z, G, E, N.

### Predefinição (`src/estilo/predefinicao.js`), arquivo `.zropreset`

```
{ "zro": "foto.predefinicao", "versao": 1, "id", "nome", "familia", "descricao", "autor", "criadaEm",
  "ajustes": { …só os grupos de estilo… }, "levar": [], "look": { "nome", "lado", "dados" } | null,
  "origem": { "tipo": "nossa" | "manual" | "lightroom" | "referencia", "relatorio"? } }
```

Importar do Lightroom (`.xmp`, `.lrtemplate`) devolve a predefinição e um relatório por chave: `exato`, `aproximado`
ou `ignorado`, com a razão. Extrair de uma referência devolve controles editáveis, a confiança por grupo e o erro medido.
Tratar em lote = corrigir cada foto (`por-foto.js`: exposição e branco) e depois aplicar o estilo.

Funções (`src/estilo/`; tudo puro, sem DOM; o estado da biblioteca é JSON e a tela guarda):

```
predefinicao.js  criarPredefinicao(campos, { agora }) · validar · ler(texto|bytes) · serializar · aplicar(p, daFoto, intensidade)
                 ajustesDe(p) · diferenca(a, b?) · oQueMexe(p) · gruposMexidos(p) · criarPacote · lerPacote → { predefinicoes, erros }
biblioteca.js    estilosDaCasa() · FAMILIAS · criarBiblioteca · porFamilia(estado, { busca, soFavoritos, criterio }) · buscar · ordenar
                 favoritar · usar · recentes · duplicar · renomear · moverDeFamilia · reordenar · acrescentar · remover · exportar · importar
qc.js            qc(p | ajustes) → { aprovado, tonalizado, pb, medidas, problemas: [{ codigo, texto, valor, limite }] }
lightroom-ler.js importarLightroom(texto | bytes, { nome, familia, tipo }) → { predefinicao, relatorio: { itens, resumo, avisos,
                 desconhecidas, meta }, daFoto }   (aceita .xmp, sidecar, JPEG com XMP no APP1 e .lrtemplate)
lightroom-escrever.js  escreverXmp(p) → { xmp, chaves, relatorio: { itens, deFora } } · nomeDoArquivoXmp(p)
cube.js          lerCube(texto | bytes) → { titulo, lado, dominio, dados, avisos } · escreverCube(lut)
look.js          aplicarLut(lut) → (r, g, b, saida) (o `opcoes.look` de revelar) · compactar(lut) → { look } · descompactar
                 lookDaPredefinicao(p) · assar(p, { lado, tela, intensidade }) → { lut, deFora }
referencia.js    extrairEstilo([imagem…], { alvo?, residuo?, vizinhanca? }) → { ajustes, predefinicao, confianca, erro: { antes,
                 depois, teto, aderencia, alcance, pareado? }, grupos, pb, avisos, look, tempo }   imagem = { largura, altura,
                 dados RGBA, espaco: 'srgb' | 'p3' } (a tela decodifica)
por-foto.js      tratarEmLote([{ id, base?, ajustes?, grupo? }], p, { modo: 'so-estilo' | 'corrigir-e-estilo' |
                 'manter-o-que-ja-mexi', intensidade, suavizar }) → [{ id, ajustes, explicacao, correcao }]
```

### Servidor

Rotas e formatos em [`API.md`](API.md). Galeria do cliente: token de 32 bytes (o banco guarda só o sha256), PIN
opcional, porta estreita por funções `security definer`, limites por link e por IP, imagem servida só por link vivo.
O armazenamento das prévias é um adaptador (`api/_arquivos.js`): pasta local em desenvolvimento e S3 compatível
(Supabase Storage, R2 ou S3) em produção. Os bytes passam **sempre** pelo servidor do app (a CSP só deixa `'self'`):
o fotógrafo envia cada prévia por `PUT`, o cliente recebe por link vivo. Sem armazenamento configurado, as rotas
respondem `503 sem_armazenamento`. **O bucket só existe depois de o titular autorizar.**

## Testes

- `node --test`, sem framework. Um arquivo por módulo: `test/<módulo>.test.js`. Cada agente roda só os seus.
- Imagens de teste são geradas (cena sintética com semente, DNG fabricado). Métrica de cor: ΔE em Oklab.
- Teste que precisa de amostra real (`.amostras/`) ou de modelo (`.modelos/`) pula com mensagem; com
  `FOTO_EXIGIR=1` (CI) a falta vira falha.
- Tela: Chromium com os cabeçalhos do `vercel.json`. Banco: Postgres temporário, RLS conferida por papel.

## Fora deste corte (está no roadmap)

Máscaras e ajustes locais, correção de lente por perfil, venda de fotos com pagamento, número de peito, camada CLIP (cena por texto e estética),
HDR e panorama, tethering, app de computador, cobrança de fotos extras.
