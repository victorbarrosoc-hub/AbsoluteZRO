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
5. **Rosto é dado sensível.** Detectar rosto e olho fechado não identifica ninguém e roda local. Agrupar por pessoa
   (assinatura do rosto) não entra neste corte.
6. Repositório público: nenhuma foto de cliente, RAW privado, token ou `.env`. Amostras CC0 ficam em `.amostras/`
   (fora do git); os testes geram as próprias imagens.

## Pastas e donos

```
src/            núcleo sem DOM, ESM puro, roda igual em Node e no navegador (é o que os testes cobrem)
  raw/          ler o arquivo: negativo.js (contrato), libraw.js, dng.js, previa.js, exif.js, latitude.js
  motor/        Latitude: ajustes.js (contrato), base.js, ponto.js, local.js, tela.js, revelar.js, auto.js, cor/, gpu/
  decupagem/    Magnitude: medidas.js, rostos.js, cena.js, grupos.js, nota.js
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
    acimaDoCinza, abaixoDoCinza   // stops disponíveis em torno do cinza médio (0,18), já com a exposição base
  },
  cortado: { um, dois, tres }, // fração da área com 1, 2 ou 3 canais saturados (1 e 2 = recuperável; 3 = perdido)
  confianca: 'alta' | 'media' | 'baixa'
}
```

### Ajustes (`src/motor/ajustes.js`)

A lista única de controles (`CONTROLES`), `neutro()`, `normalizar()`, `misturar()`, `aplicarEstilo()`, `mexidos()`.
Os controles de luz valem em EV em torno do cinza médio, não pelo conteúdo: mesmo número, mesmo resultado em qualquer
foto. `DA_FOTO` (exposição, branco, geometria) é corrigido foto a foto e não viaja na predefinição por padrão.

### Imagem

`{ largura, altura, dados: Float32Array }`, RGB entrelaçado (3 por pixel), **linear, Rec.2020 D65, cena** (sem teto:
valores acima de 1 são altas luzes de verdade; negativos pequenos são ruído e ficam). Cinza médio = 0,18.

### Motor (`src/motor/`)

```
prepararBase(negativo, { demosaico: 'rapido' | 'qualidade', reduzir: 1 | 2 | 4 }) → Base
baseDeImagem({ largura, altura, dados: Uint8ClampedArray | Uint16Array, canais: 3 | 4, espaco: 'srgb' | 'p3' | 'adobe' }) → Base
revelar(base, ajustes, { tela: 'srgb' | 'p3' | 'rec2020', regiao? }) → Imagem de TELA (0..1, já com a curva da tela)
paraBytes(imagemDeTela, { bits: 8 | 16, pontilhado }) → Uint8ClampedArray RGBA | Uint16Array RGB
Base = { imagem: Imagem, latitude: Latitude | null, branco: { kelvin, tinta, neutroCamera? }, origem: 'raw' | 'imagem',
         exposicaoBase, orientacao, ruido? }
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
   Oklab → tonalização (sombras, meios, altas, global) → P&B → desbotar.
3. **Vizinhança** (`local.js`): textura, clareza, neblina, ruído (com o modelo de ruído medido no arquivo), nitidez,
   grão, vinheta. Tudo que precisa de pixel vizinho mora aqui e roda em resolução proporcional.
4. **Tela** (`tela.js`): mapa de tons em sigmoide log-logística com o cinza preso, **com as margens de cima e de baixo
   tiradas da Latitude do arquivo** (em `auto`) → preservação de matiz → compressão de gamut em Oklab → curva da tela.

Foto que já chega pronta (JPEG, PNG, TIFF) entra pela inversa exata do passo 4: com os ajustes neutros ela sai igual
(erro < 1/255), e os controles se comportam como no RAW.

`ponto.js` expõe `criarPonto(ajustes, contexto) → { aplicar(r, g, b, saida) }` e `uniformes(ajustes, contexto)`: os
mesmos números que a GPU recebe. `gpu/` (WebGL2) é espelho do JS; o teste trava a diferença em menos de 1/255.

### Decupagem (`src/decupagem/`)

Entrada: a prévia (JPEG embutido ou a foto reduzida a 1024 px no lado maior) como `{ largura, altura, rgba }`.

```
medir(previa) → Medidas { nitidez: { q, s0, s1, mapa }, borrao: { tipo: 'nenhum' | 'foco' | 'movimento', comprimento?, angulo? },
                         exposicao: { altas, altas3, baixas, p1, p50, p99 }, ruido, dhash, phash, horizonte? }
analisarRostos(deteccoes, luma) → [{ caixa, olhos: 'abertos' | 'parcial' | 'fechados' | 'sorrindo', ear, nitidezOlhos, peso }]
classificarCena({ rostos, objetos, rotulos, medidas }) → 'retrato' | 'grupo' | 'pessoas' | 'animal' | 'natureza' | 'paisagem' |
                                                         'comida' | 'arquitetura' | 'produto' | 'documento' | 'noturna' | 'outra'
agrupar(fotos) → [{ id, fotos: [id], tipo: 'repetidas' | 'sequencia' }]
avaliar(sinais, { rigor }) → Magnitude { total, estrelas, balde: 'fica' | 'talvez' | 'fora', motivos: [texto], componentes, confianca }
```

`sinais` junta medidas, rostos, cena, exif e, quando o RAW já foi lido, a `Latitude`: exposição estourada só reprova
quando o dado do sensor está perdido. Camadas de visão (rosto e olhos; objetos e animais; rótulos de cena) rodam em
`app/decupagem/visao-worker.js` com MediaPipe; sem elas a nota sai só com o que foi medido, e a tela diz isso.

### Catálogo (`src/biblioteca/catalogo.js`)

```
Foto { id, nome, caminho, tamanho, tipo: 'raw' | 'imagem', formato, exif, marca: 'escolhida' | 'rejeitada' | null,
       estrelas: 0..5, cor: null | 'vermelho' | 'amarelo' | 'verde' | 'azul' | 'roxo', magnitude?, medidas?, rostos?, cena?,
       grupo?, ajustes?, predefinicao?, cliente?: { escolhida, comentario } }
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

### Servidor

Rotas e formatos em [`API.md`](API.md). Galeria do cliente: token de 32 bytes (o banco guarda só o sha256), PIN
opcional, porta estreita por funções `security definer`, limites por link e por IP, imagem servida só por link vivo.
O armazenamento das prévias é um adaptador (`api/_arquivos.js`): pasta local em desenvolvimento e bucket privado
com endereço assinado em produção. **O bucket só existe depois de o titular autorizar.**

## Testes

- `node --test`, sem framework. Um arquivo por módulo: `test/<módulo>.test.js`. Cada agente roda só os seus.
- Imagens de teste são geradas (cena sintética com semente, DNG fabricado). Métrica de cor: ΔE em Oklab.
- Teste que precisa de amostra real (`.amostras/`) ou de modelo (`.modelos/`) pula com mensagem; com
  `FOTO_EXIGIR=1` (CI) a falta vira falha.
- Tela: Chromium com os cabeçalhos do `vercel.json`. Banco: Postgres temporário, RLS conferida por papel.

## Fora deste corte (está no roadmap)

Máscaras e ajustes locais, correção de lente por perfil, agrupar por pessoa, camada CLIP (cena por texto e estética),
HDR e panorama, tethering, app de computador, cobrança de fotos extras.
