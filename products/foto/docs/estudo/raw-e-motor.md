# RAW e motor: bibliotecas, licenças e a matemática da revelação

Como ler um RAW no navegador, o que cada biblioteca entrega (com números medidos), o que as licenças permitem, a conta do motor e a medida de faixa dinâmica e margem. Provas rodadas em 13/11/2026; elas viraram os módulos de `src/raw` (contrato em [ARQUITETURA.md](../ARQUITETURA.md)).

**Legenda:** **[V]** verificado em 13/11/2026, com saída real · **[W]** fonte web · **(de memória)** não verificado.

## 1. Veredito

- **Biblioteca recomendada:** `@colorhythm/libraw-wasm@1.1.1` (LibRaw 0.22.1) como decodificador de sensor, em Worker no navegador e direto em Node.
- **Complementos:** `extract-raw-preview@1.1.0` para a prévia JPEG embutida (decupagem) e um leitor próprio de tags DNG (89 linhas, escrito e testado na prova).
- **Nenhum pacote npm entrega 100% sozinho.** Cada um deixa de fora algo que o motor precisa (matriz na seção 3).
- **Fallback provado:** decodificador DNG em JS puro deu mosaico bit a bit igual ao LibRaw em 4 de 4 DNGs CFA.
- **Matemática provada:** preto → WB → matriz câmera→sRGB própria bateu com `dcraw_process` do LibRaw com erro médio de 1,6e-5 (cerca de 1 LSB de 16 bits).

No produto, a prévia e o EXIF acabaram lidos em JS puro, sem WASM (`src/raw/previa.js` e `exif.js`), para a decupagem ser instantânea; ver o contrato do Negativo em [ARQUITETURA.md](../ARQUITETURA.md).

## 2. Pacotes npm

Saída real de `npm view <pacote> version license dist.unpackedSize repository` (condensada) e de `api.npmjs.org/downloads/point/last-month` (14/10 a 12/11/2026):

```
libraw-wasm            1.6.0             ISC            2073506  github.com/ybouane/LibRaw-Wasm            270876/mês
@colorhythm/libraw-wasm 1.1.1            MIT            1294596  github.com/colorhythm/libraw-wasm          15518/mês
libraw-wasm-nothread   1.6.0-nothread.1  ISC            1985382  github.com/garbarok/libraw-wasm-nothread    1098/mês
@wasmedia/wlibraw      0.3.0             LGPL-2.1-only  1644054  gitlab.com/wasmedia/wlibraw                  760/mês
raw-webgpu             0.2.0             MIT            2120163  github.com/roprgm/raw-webgpu                 549/mês
rawconvert-wasm        0.1.1             MIT            1194661  github.com/anthonygreco/rawconvert-wasm      421/mês
libraw-mini            0.1.9             MIT            1249892  github.com/xdadda/libraw-mini                310/mês
extract-raw-preview    1.1.0             MIT             183555  github.com/radenkovic/extract-raw-preview   2498/mês
dcraw-wasm             0.0.4             SEE LICENSE     573100  github.com/nhebling/dcraw-wasm
dcraw                  1.0.3             GPL-2.0        (2022)   github.com/zfedoran/dcraw.js                7591/mês
libraw.js              3.0.0             LGPL-2.1       6587823  (addon nativo, 2023)
raw-wasm, dcraw.js, rawloader-wasm, rawler-wasm, @rawloader/wasm, rawspeed-wasm  -> E404
```

- Não existe build WASM de rawloader, rawler ou RawSpeed no npm **[V]**.
- Addons nativos (`@julianberger/libraw.js` 11,9 MB, `lightdrift-libraw` 13,5 MB, `@janhapke/libraw` 12,8 MB) foram descartados: não rodam no navegador.
- `dcraw` é GPL-2.0, e `dcraw-wasm` compila o `dcraw.c` original e só extrai metadados e miniatura: descartados.
- LibRaw atual é 0.22.3, de 26/10/2026, só correções **[W]**. Os pacotes embutem 0.22.1; `wlibraw` embute 0.22.2; `raw-webgpu` embute 0.22.2 mais commits.

## 3. O que cada candidato entrega

Amostras: 12 arquivos CC0 de https://raw.pixls.us (CR2, CR3, NEF, ARW, RAF X-Trans, RW2 e seis DNG). Ficam fora do git, em `.amostras/`.

| Campo | `@colorhythm/libraw-wasm` 1.1.1 | `libraw-wasm` 1.6.0 e `-nothread` | `raw-webgpu` 0.2.0 (worker) |
| --- | --- | --- | --- |
| Mosaico cru Uint16 sem demosaico | sim, sensor inteiro com margens | sim, sensor inteiro | sim, só a área ativa |
| Preto por canal e padrão espacial | sim (`getCblack`, `getBlackLevel`) | **não**: só `black`; Fuji sai 0 em vez de 1022 | sim, `black[4]` |
| Branco | `maximum` e `linear_max[4]` | só `maximum` | só `maximum` |
| WB as shot | `cam_mul`, `pre_mul` | idem | ganhos, temperatura e tint |
| `cam_xyz`, `rgb_cam` | sim | sim | matriz câmera→Rec.2020 pronta |
| ColorMatrix1/2, ForwardMatrix, iluminantes, BaselineExposure | **não** | sim (`dng_color`, `dng_levels`) | embutido via Adobe DNG SDK |
| CFA | `filters`, `xtrans[6][6]`, `color(r,c)` | `filters`; **sem `xtrans`** | `cfa` 2×2 ou 6×6 |
| Dimensões, margens, orientação | sim; sem `raw_inset_crops` | sim, com `raw_inset_crops` | tamanho e `flip` |
| Miniatura JPEG | sim, sem largura/altura | sim, com dimensões | **não** |
| ISO, tempo, abertura, focal, lente | sim | sim | **não** |
| Codecs extras no wasm | sem libjpeg, zlib, JXL | libjpeg | libjpeg, zlib, libjxl, DNG SDK 1.7.1 |
| `libraw.wasm` (bruto / brotli) | 853 083 / 264 397 B | 1 385 126–1 417 725 / ~380 kB | 1 845 645 / 583 656 B |
| Formato de uso | API síncrona; nós criamos o Worker | só via Worker próprio | API pública exige `GPUDevice` |

Achados pontuais **[V]**:

- **`@colorhythm`:** `getMakernotes().canon.LeftOpticalBlack` devolve lixo (`{"t":19200,"l":-5367,...}`). Ler o `libraw_data_t` inteiro pelos tipos do pacote falha (`Offset is outside the bounds of the DataView`); os offsets gerados não têm padding.
- **`libraw-wasm`:** `color_data.black` muda conforme a ordem das chamadas. Canon R6: 0 antes de `rawImageData()`, 512 depois.
- **`libraw-wasm` upstream:** usa `WebAssembly.Memory({shared:true})` e workers `em-pthread`. Mesmo assim funcionou no Chrome 153 sem COOP/COEP para abrir, ler metadados, mosaico, miniatura e `imageData()`.
- **`raw-webgpu`:** Pixel 6 Pro caiu no caminho CPU (Float32 RGB, 6,5 s) por causa dos opcodes obrigatórios.
- **`@wasmedia/wlibraw` e `rawconvert-wasm`:** não expõem o mosaico, só a saída do `dcraw_process`.
- **DNG lossy da Adobe** (`adobe_5d3_lossy.dng`, LinearRaw RGB 8 bits): `@colorhythm` e `raw-webgpu` recusam. `libraw-wasm-nothread` abre e `imageData()` devolve 5760×3840 RGB 16 bits em 1,66 s.
- **`samsung_g973.dng`:** falhou em todos. O arquivo começa com `ff d8 ff e0` (JFIF), não é TIFF.

Saída real do `@colorhythm` em Node 22.23.4 (prova rodada em 13/11/2026, campos selecionados):

```
LibRaw version: 0.22.1-Release num: 5633 cameras: 1274
canon_30d.cr2   raw 3596x2360 active 3522x2348 margins top12 left74  cfa [[0,1],[3,2]] blackAdj [128,128,128,127] maximum 4095  cam_mul [2009,1024,1783,1024] unpack 303 ms  thumb JPEG 781358 B
canon_r6.cr3    raw 3584x2386 active 3407x2271 margins top108 left156 right21 bottom7 black 512 maximum 16383 linearMax 14008 lens "RF70-200mm F2.8 L IS USM" unpack 167 ms thumb 964061 B
fuji_xt30ii.raf raw 6384x4182 filters 0x9 xtrans 110112/112110/201021/112110/110112/021201 cblack [0,0,0,0,6,6,1022,...] maximum 16383 unpack 1639 ms thumb 3577036 B
nikon_d70s.nef  raw 3040x2014 cfa [[2,3],[1,0]] black 0 maximum 4095 linearMax 3827 unpack 325 ms
sony_a7s.arw    raw 2816x1872 black 512 maximum 16383 linearMax 15360 unpack 46 ms
pixel6pro.dng   cblack [0,0,0,0,2,2,1023,1023,1023,1023] maximum 16368 cam_xyz todo zero
samsung_g973.dng error "Unsupported file format or not RAW file" code -2
```

Chrome 153 headless (prova rodada em 13/11/2026), com e sem COOP/COEP:

```
@colorhythm/libraw-wasm  Canon EOS R6     wasmInit 19-21 ms, open 13-14, unpack 154-226, thumbExtract 11-14, createImageBitmap->512px 51-62
@colorhythm/libraw-wasm  Fujifilm X-T30 II wasmInit 16, open 23-24, unpack 1887-1972, thumbExtract 45-49, bitmap 108-149
libraw-wasm-nothread     R6: open 64-97, rawImageData 175-245, developHalfLinear16 255-365 ms | Fuji: rawImageData 2146-2352
libraw-wasm (pthread)    R6: open 65-108, rawImageData 213-293 | Fuji: rawImageData 2137-2478
```

Prévia para decupagem (`extract-raw-preview`, Node, prova rodada em 13/11/2026): 0,4 a 18 ms por arquivo.

- Lista todas as candidatas: CR3 com 3408×2272, 1620×1080 e 160×120; RAF com 4416×2944; NEF com 3008×2000; ARW com 1616×1080.
- Marca as SOF3 como não decodificáveis.
- Só `canon_5d3.dng` (Magic Lantern) não tem prévia.

Demosaico do próprio LibRaw em WASM, uma thread (prova rodada em 13/11/2026):

| Arquivo | Qualidade | Tempo |
| --- | --- | --- |
| R6, 7,7 MP | PPG | 400 ms |
| R6, 7,7 MP | AHD | 971 ms |
| R6, 7,7 MP | DCB | 1871 ms |
| R6, 7,7 MP | DHT | 1812 ms |
| R6, 7,7 MP | AAHD | 2637 ms |
| X-T30 II, 26 MP | q2 | 12 971 ms |
| X-T30 II, 26 MP | q3 | 20 815 ms |

X-Trans em WASM de uma thread é lento demais para uso interativo. Suposição: q2 e q3 são Markesteijn de 1 e 3 passes (de memória).

## 4. Licenças e vendorização em repositório público

- **LibRaw:** dupla licença, à escolha, LGPL-2.1 ou CDDL-1.0. Inclui DCB/FBDD (BSD-3), X3F (BSD) e trechos do DNG SDK 1.4 (MIT), e declara não usar o código restrito do dcraw **[V]** (arquivo `LibRaw/COPYRIGHT` dentro do pacote `@colorhythm/libraw-wasm`; mesmo texto em https://raw.githubusercontent.com/LibRaw/LibRaw/master/COPYRIGHT).
- **Wrappers:** MIT (`@colorhythm`, `raw-webgpu`) e ISC (`libraw-wasm`). `libraw-wasm` e `-nothread` não trazem os textos de licença do LibRaw no tarball **[V]**; `@colorhythm` traz os três.
- **`raw-webgpu`:** elege CDDL-1.0 para o LibRaw e soma Adobe DNG SDK 1.7.1, libjxl, IJG e zlib **[V]** (`NOTICE`).
- **O que vendorizar exige** (interpretação do estudo, não é parecer jurídico):
  - manter `libraw.wasm` como arquivo separado e substituível;
  - copiar `COPYRIGHT`, `LICENSE.LGPL` e `LICENSE.CDDL`;
  - registrar a licença eleita, a versão exata, a URL do fonte e a receita de build;
  - não alterar o LibRaw, ou publicar o patch.
  - Isso não obriga a abrir o código do app.
- **Precedente no repositório:** [`products/finishing/vendor/README.md:1-6`](../../../finishing/vendor/README.md) (cópia de `node_modules` com licença ao lado e teste de igualdade); CSP com `'wasm-unsafe-eval'` e `worker-src 'self' blob:` em [`products/finishing/vercel.json:31`](../../../finishing/vercel.json); COOP/COEP em `:34-39`. A raiz não tem arquivo `LICENSE` **[V]**.
- **GPL, não portar código:**
  - AMaZE: cabeçalho de `amaze_demosaic_RT.cc` é GPL-3+ **[W]**.
  - RawTherapee é GPLv3 **[W]**.
  - darktable (de memória: GPL-3).
  - RCD: licença do repositório original não confirmada **[W]**.
- **Decodificadores alternativos:** rawloader LGPL-2.1, rawler LGPL-2.1 com arquivos MIT, RawSpeed LGPL v2 **[W]**.
- **Cadeia de suprimento:** os dois pacotes principais têm mantenedor único. Fixar versão e hash: tarball `sha512-OxqXLhDurX/sM4KL/rR71zjuH0VHBUWCOJ71tLiIxy3ATbIS2KM/8RixT0Gc3RygcsS1T8SXnzdipPqWYSjt9A==` (com proveniência SLSA); `libraw.wasm` sha256 `c4cb97a7e4372da41a1ff6ec6e1146f38deb125b733b8bbb2e9c52727953aba8`.

## 5. Matemática recomendada para o motor próprio

### 5.1 Linearização e preto

- Aplicar a curva ou `LinearizationTable` antes de tudo. O LibRaw já faz isso nos formatos de fabricante.
- Preto por pixel, convenção LibRaw **[V]**: `b(r,c) = black + cblack[cor] + cblack[6 + (r mod cblack[4])·cblack[5] + (c mod cblack[5])]`. Fuji usa 6×6 = 1022; Pixel usa 2×2 = 1023.
- Em DNG, somar `BlackLevelDeltaH/V`.
- Pixels mascarados precisam ser validados pelo dado, não pela margem. Na R6 a margem esquerda é 156, mas só as colunas 0 a ~140 são pretas (512,5 ± 0,6 DN); de 144 em diante há luz (1130 ± 390) **[V]**. Regra usada: andar pelas colunas enquanto a média ficar a 1% da mediana.
- Normalizar em float32: `x = (raw − b)/(w_c − b)`. Não cortar negativos; eles mantêm a média do ruído sem viés.

### 5.2 Saturação por canal

- `w_c = min(branco do metadado, linear_max_c, empilhamento detectado no histograma)`.
- O metadado erra. Canon 30D declara 4095, mas o sensor corta em **3398** (1,45% dos verdes empilhados nesse valor) **[V]**. A R6 declara 16383 e `linear_max` 14008.
- Detecção usada: o topo do histograma concentra mais de 0,01% do canal e mais de 10× a densidade da faixa 97–98,5%.
- Máscara de clip por sítio CFA em `raw ≥ 0,98·w_c`.

### 5.3 Altas luzes

- Modos do LibRaw: 0 corta, 1 não corta, 2 mistura, 3 ou mais reconstrói **[W]**.
- darktable **[W]**: "inpaint opposed" usa a média dos vizinhos não cortados; "segmentation based" trata cada área cortada como segmento e usa razões de cor da borda; "guided laplacians" é só Bayer e é pesado.
- Proposta própria, sem código GPL, feita no mosaico já com WB:
  1. um ou dois canais cortados: estimar o canal pela razão local dos canais válidos, medida no anel não cortado do segmento, em log;
  2. três canais cortados: neutro com transição suave guiada pelo gradiente da borda;
  3. guardar os valores acima de 1,0, sem cortar antes do mapa de tons.

### 5.4 WB em espaço de câmera

- `m_c = cam_mul_c / cam_mul_G`, aplicado antes do demosaico **[V]**.
- Temperatura e tint: xy do branco → neutro da câmera = `ColorMatrix(T)·XYZ_branco` → `m_c = 1/neutro_c`.
- O as shot em DNG sai por iteração: T → matriz(T) → xy → T′ **[W]** (DNG SDK, `dng_color_spec.cpp`).

### 5.5 Demosaico

| Algoritmo | Referência | Licença de implementação | Uso sugerido |
| --- | --- | --- | --- |
| Binning 2×2 | trivial | própria | prévia e zoom ≤ 50%; idêntico ao `half_size` do LibRaw **[V]** |
| Bilinear / Malvar-He-Cutler 5×5 | artigo de 2004 (de memória) | própria; `raw-webgpu` usa MHC em shader (MIT) | interativo na GPU |
| PPG | via dcraw (de memória) | LibRaw | rápido |
| AHD | artigo de 2005 (de memória) | LibRaw | padrão do LibRaw |
| DCB | código no LibRaw | BSD-3 no LibRaw **[V]** | boa qualidade |
| DHT / AAHD | código no LibRaw **[W]** | LibRaw | exportação |
| LMMSE | artigo de 2005 (de memória) | implementar do artigo | ISO alto **[W]** |
| RCD | sem artigo | não confirmada; padrão do darktable **[W]** | só descrever |
| AMaZE | sem artigo | GPL-3+ **[W]** | não usar |
| X-Trans Markesteijn 1 e 3 passes | via dcraw | LibRaw | exportação; 13–21 s em 26 MP **[V]** |

Recomendação: demosaico próprio em WebGPU para interação e os do LibRaw como referência de exportação, com AMaZE e RCD fora.

### 5.6 Câmera → XYZ D50, com dois iluminantes

- Peso por temperatura inversa **[W]**: `g = (1/T − 1/T2)/(1/T1 − 1/T2)`, limitado a [0,1]. `CM = g·CM1 + (1−g)·CM2`; o mesmo vale para ForwardMatrix e CameraCalibration.
- Sem ForwardMatrix: `XYZ→cam = AB·CC·CM`; inverter e adaptar o branco para D50 (Bradford, de memória).
- Com ForwardMatrix: `cam→XYZ_D50 = FM · diag(1/neutro_ref) · (AB·CC)⁻¹`, com `neutro_ref = (AB·CC)⁻¹·neutro_câmera` (de memória, especificação DNG).
- Não DNG: o `cam_xyz` do LibRaw é uma única matriz D65 (o `raw-webgpu` a registra como iluminante 21) **[V]**. A prova reproduziu `rgb_cam` com erro máximo de 6e-8 fazendo `cam_xyz · XYZ←sRGB`, normalizando as linhas para soma 1 e invertendo.
- Os DNGs testados trazem iluminantes 17 e 21. Só os dois da Canon trazem ForwardMatrix; Ricoh, iPhone e Pixel não **[V]**.

### 5.7 Espaço de trabalho e pipeline

- **Rec.2020 linear D65** em float32 na CPU/WASM e `rgba16float` na GPU. É o que o `raw-webgpu` usa.
- ACEScg (AP1) é quase equivalente (de memória). ProPhoto tem primárias imaginárias, o que atrapalha operações por canal (de memória).
- Ordem scene-referred:
  1. mosaico Uint16 exato;
  2. linearizar, preto, float;
  3. máscara de clip;
  4. pixels quentes e PDAF;
  5. WB;
  6. altas luzes;
  7. demosaico;
  8. opcodes e lente;
  9. matriz para Rec.2020;
  10. exposição e ajustes locais em linear;
  11. mapa de tons, gamut e OETF;
  12. nitidez de saída.
- Opcodes DNG não são aplicados pelo LibRaw sem o DNG SDK. O Pixel 6 Pro traz OpcodeList2 de 19 572 B e o iPhone XS traz vinheta radial (coeficientes 1.5123, 4.1917, −9.2382, 8.7176, −2.7503) **[V]**. É preciso implementar GainMap e FixVignetteRadial.

A ordem que o motor adotou está em [ARQUITETURA.md](../ARQUITETURA.md) (seção Motor).

### 5.8 Faixa dinâmica utilizável e margem de exposição

Método da prova rodada em 13/11/2026 (virou `medirLatitude` em `src/raw/latitude.js`):

- **Ruído de leitura:** desvio dos pixels mascarados, quando existem.
- **Modelo Poisson-Gauss** `var = a·S + b`: ajuste sobre a diferença entre verdes vizinhos (σ robusto por MAD/√2, por faixa de sinal). É o modelo do artigo de 2008 citado em https://arxiv.org/pdf/2512.15905 e da tag DNG NoiseProfile **[W]**.
- **DR de engenharia** = `log2((w−b)/σ_leitura)`. **DR fotográfico** usa o sinal em que SNR = 10.

| Arquivo | Preto e ruído medidos | Branco usado | Ganho (e⁻/DN) | DR SNR=1 | DR SNR=10 | Folga altas (P99,9) | Folga sombras (P0,1) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Canon 30D, ISO 100 | 128,07 ± 2,19 DN (mascarados) | 3398 (detectado) | 1,52 | 10,54 | 5,50 | 0,00 | 0,86 |
| Canon R6, ISO 100 | 512,58 ± 0,80 DN (mascarados) | 14008 | 1,73 | 14,04 | 7,84 | 1,08 | 5,62 |
| Sony A7S, ISO 400 | ajuste: 7,04 DN | 15360 | 1,56 | 11,04 | 7,08 | 0,43 | 2,94 |
| Fuji X-T30 II, ISO 160 | ajuste: 3,42 DN | 16383 | 1,62 | 12,13 | 7,64 | 0,00 (5,4% dos verdes cortados) | 5,13 |
| Pixel 6 Pro, ISO 44 | ajuste: 4,83 DN | 16368 | 9,29 | 11,63 | 8,15 | 0,35 | 3,86 |

- **Validação cruzada (Pixel 6 Pro, verde):** a NoiseProfile do arquivo é S = 7,703e-6 e O = 5,642e-8, ou a = 0,118 DN e σ = 3,64 DN, DR 12,04. O ajuste deu a = 0,108 e σ = 4,83, DR 11,63. A inclinação bate em 9%; o ruído de leitura do ajuste é um teto, conservador em ~0,4 stop.
- **Limitação:** sem pixels mascarados e com ajuste de `b` negativo (iPhone, D70s), usar NoiseProfile ou uma tabela por câmera e ISO.
- **Como mostrar a margem:**
  - Altas: `log2((w−b)/P99,9)` por canal, mais a porcentagem de área com 1, 2 ou 3 canais cortados. Um ou dois é recuperável; três é perdido.
  - Sombras: `log2(P0,1 / S_k)`, com `S_k = (k²a + √(k⁴a² + 4k²b))/2`.
  - Em torno do cinza: acima = `log2(1/0,18) + BaselineExposure` (2,47 stops; Pixel 3,19; Ricoh GR 2,27); abaixo = `log2(0,18·(w−b)/S_k)`.

### 5.9 Mapa de tons, matiz e gamut

- **Sigmoide log-logística** (o módulo sigmoid do darktable usa uma "generalized log-logistic" **[W]**): `y = y_max / (1 + k·x^(−c))`, com `k = (y_max/y_g − 1)·g^c` para fixar o cinza (derivação do estudo).
- **AgX:** matriz de inset → log2 na janela de −12,47 a +4,03 EV em torno do cinza → sigmoide → outset **[W]**. Licença do repositório original não confirmada.
- **Matiz:** aplicar a curva numa norma e escalar o RGB (`rgb·f(N)/N`), misturando com o modo por canal por um controle. É o "preserve hue" do darktable **[W]**. Atenuar a pureza das primárias antes da curva evita manchas com LED azul **[W]**.
- **Gamut:** compressão de croma em Oklab ou ACES RGC ao sair de Rec.2020 para sRGB ou P3 (de memória).

### 5.10 Nitidez e ruído

- **Nitidez de captura:** deconvolução em linear logo após o demosaico. O darktable faz isso dentro do módulo demosaic **[W]**; Richardson–Lucy com PSF gaussiana (de memória).
- **Ruído:** estabilizar a variância com os `a` e `b` medidos (Anscombe generalizada), depois wavelets ou NL-means, com croma mais forte que luma (de memória).

## 6. Recomendação final e código rodado

`@colorhythm/libraw-wasm@1.1.1`: MIT + LibRaw LGPL-2.1/CDDL-1.0; 1 294 596 B desempacotado; wasm de 853 083 B (264 kB em brotli); dependência `typed-cstruct@0.10.2` (MIT). Trecho da prova rodada em 13/11/2026:

```js
import { LibRaw } from "@colorhythm/libraw-wasm";
await LibRaw.initialize();                       // ou initialize(arrayBufferDoWasm)
const lr = new LibRaw(); await lr.waitUntilReady();
lr.open(arrayBuffer); lr.unpack();               // sem dcrawProcess: nada de demosaico
const mosaic = lr.getRawImage();                 // Uint16Array rawW*rawH, com pixels mascarados
const rawW = lr.getRawWidth(), top = lr.getTopMargin(), left = lr.getLeftMargin();
const black = [0,1,2,3].map(i => lr.getBlackLevel(i));           // preto ajustado por canal
const white = lr.getColorMaximum(), linMax = [0,1,2,3].map(i => lr.getLinearMax(i));
const wb = [0,1,2,3].map(i => lr.getCamMul(i));                  // as shot
const camXyz = [0,1,2].map(i => [0,1,2].map(j => lr.getCamXyz(i,j)));
const ip = lr.getIParams();                      // filters, xtrans[6][6], cdesc, make/model
const cfa = (r, c) => lr.color(r, c);            // 0=R 1=G 2=B 3=G2
const o = lr.getImgOther(), lens = lr.getLensInfo(), flip = lr.getFlip();
lr.unpackThumb(); const jpeg = lr.dcrawMakeMemThumb().data;      // JPEG embutido
lr.dispose();
```

O trecho está como foi rodado na prova; o código do produto segue o estilo da casa (sem ponto e vírgula, aspas simples).

Cobertura complementar:

- **Tags DNG** (ColorMatrix1/2, ForwardMatrix, CalibrationIlluminant, AsShotNeutral, BaselineExposure, NoiseProfile, DefaultCrop, opcodes): leitor próprio, prova rodada em 13/11/2026 (virou `src/raw/dng.js`).
- **DNG lossy LinearRaw:** `libraw-wasm-nothread@1.6.0-nothread.1`, via `imageData()`.
- **DNG com JPEG XL (ProRAW recente):** não testado; nenhuma amostra tinha JXL. O único candidato com libjxl e DNG SDK é o `raw-webgpu@0.2.0`, cujo worker rodou em Node sem GPU (prova rodada em 13/11/2026).
- **Médio prazo:** build próprio do LibRaw 0.22.3 com um shim C pequeno expondo exatamente os campos da tabela. `emcc` não estava instalado na máquina da prova; `docker` e `cargo` estavam. Não testado.

## 7. Fallback provado: DNG próprio com JPEG lossless

Leitor de 89 linhas, sem dependências (prova rodada em 13/11/2026): parser TIFF/IFD com SubIFDs e Exif, tags DNG, mosaico não comprimido de 8 a 16 bits e JPEG lossless SOF3 (preditores 1–7, tiles e strips, quadro reembrulhado).

Saída da prova, comparando com o mosaico do LibRaw:

```
canon_5d3.dng  1920x818  bps=14 strips=1  ljpeg=3840x409x1c p14 pred6  79 ms  sha=786415ab4fd024a1 :: LibRaw sha=786415ab4fd024a1 differing samples=0
ricoh_gr.dng   4960x3280 bps=12 strips=1  ljpeg=2480x3280x2c p12 pred1 776 ms  sha=31be2e15b7c5b5f9 :: LibRaw sha=31be2e15b7c5b5f9 differing samples=0
iphone_xs.dng  4032x3024 bps=16 tiles=64  ljpeg=252x378x2c p12 pred1   598 ms  sha=1657cd68947bbfd1 :: LibRaw sha=1657cd68947bbfd1 differing samples=0
pixel6pro.dng  4080x3072 bps=16 tiles=192 ljpeg=128x256x2c p16 pred1   540 ms  sha=19eb22b33793fa3a :: LibRaw sha=19eb22b33793fa3a differing samples=0
```

As matrizes lidas batem com o `dng_color` do LibRaw. Exemplo Ricoh GR: CM1 `[0.5533,-0.1912,0.0107,…]`, iluminantes 17 e 21, BaselineExposure −0,2.

Faltam no fallback: marcadores de restart, deflate e float, JPEG lossy (34892), JPEG XL (52546) e opcodes. Formatos de fabricante (CR3, RAF comprimido, ARW, NEF) continuam dependendo do LibRaw; o plano B para eles é pedir conversão para DNG.

Validação da matemática (prova rodada em 13/11/2026), JS próprio contra LibRaw em meia resolução, linear, 16 bits:

```
canon_r6.cr3   meanOurs [0.12045,0.0734,0.05852]  meanLibRaw [0.12044,0.07338,0.05851]  meanAbsDiff 1.6e-5  matriz: maxAbsDiff 3.73e-8
sony_a7s.arw   meanOurs [0.17937,0.17381,0.16681] meanLibRaw [0.17936,0.17379,0.16679]  meanAbsDiff 1.63e-5
pana_lx7.rw2   meanAbsDiff 1.63e-5 | nikon_d70s.nef meanAbsDiff 1.54e-5
```

## 8. Não verificado

- Safari, Firefox e navegadores móveis.
- Consumo de memória em arquivos de 45 a 60 MP. O heap do wasm chegou a 420 MB processando 26 MP **[V]**.
- Orientação diferente de 0: todas as amostras têm `flip = 0`.
- Sensores Foveon, pixel shift e sRAW.

## Fontes

- https://raw.pixls.us (amostras CC0, índice em `/json/getrepository.php?set=all`)
- https://www.libraw.org/docs/API-datastruct-eng.html · https://www.libraw.org/home · https://www.libraw.org/download · https://www.libraw.org/node/2861
- https://raw.githubusercontent.com/LibRaw/LibRaw/master/COPYRIGHT
- https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/demosaic/ · https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/highlight-reconstruction/ · https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/sigmoid/ · https://docs.darktable.org/usermanual/5.6/en/module-reference/processing-modules/agx/
- https://android.googlesource.com/platform/external/dng_sdk/+/e26fa7d/source/dng_color_spec.cpp · https://colour-hdri.readthedocs.io/en/latest/_modules/colour_hdri/models/dng.html
- https://awaresystems.be/imaging/tiff/tifftags/noiseprofile.html · https://arxiv.org/pdf/2512.15905
- https://grok.dragonflybsd.org/xref/dports/graphics/rawtherapee/rawtherapee-5.8/rtengine/amaze_demosaic_RT.cc?a=true · https://rawpedia.pixls.us/demosaicing/ · https://discuss.pixls.us/t/about-rcd-and-other-demosaicing-methods/22126
- https://licenses.dev/cargo/rawloader/0.37.2 · https://tracker.debian.org/media/packages/r/rust-rawler/copyright-0.7.2dfsg-1 · https://github.com/darktable-org/rawspeed
- https://gist.github.com/Sam-Izdat/c1f7ea42a778a10754f1aa167ebf7f35 · https://discuss.pixls.us/t/blender-agx-in-darktable-proof-of-concept/48697
- npm: https://www.npmjs.com/package/@colorhythm/libraw-wasm · https://www.npmjs.com/package/libraw-wasm · https://www.npmjs.com/package/libraw-wasm-nothread · https://www.npmjs.com/package/raw-webgpu · https://www.npmjs.com/package/extract-raw-preview
