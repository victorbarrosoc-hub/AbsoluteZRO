# Visão no aparelho: pilha testada e plano B clássico

A decupagem roda no navegador de quem fotografa. Aqui está a pilha de visão computacional que foi testada, as armadilhas, os algoritmos clássicos com limiares medidos, e o que a LGPD pede. Provas rodadas em 13/11/2026; as fórmulas clássicas viraram os módulos de `src/decupagem` (contrato em [ARQUITETURA.md](../ARQUITETURA.md)).

Confiança: o que traz saída ou número foi medido na prova. O resto está marcado no próprio item como **(de memória)**, **suposição** ou **não medido**.

## 0. Decisão

- **Pilha recomendada**: `@mediapipe/tasks-vision@1.2.3` (rostos, malha de 478 pontos, 52 blendshapes, objetos/animais) + `onnxruntime-web@1.31.1` só WASM (CLIP ViT-B/32 q8 para cena, estética e sequência; SFace para agrupar pessoas) + algoritmos clássicos próprios. `@huggingface/transformers@4.3.2` só em tempo de build, para gerar os vetores de texto das cenas.
- **Tudo rodou** em Web Worker, com arquivos vendorizados, CSP estrita (`script-src 'self' 'wasm-unsafe-eval'`) e **0 pedidos para fora da origem**.
- **Tamanho**: 167,4 MB no total, em camadas opcionais (20,0 / +4,6 / +104,1 / +38,7 MB). O primeiro corte (plano B) usa 0 MB de modelo.
- **Descartados**: tfjs-models (modelos em tfhub.dev responderam 403 na prova; pacotes parados desde 2023–2024), face-api.js (parado), `@vladmandic/human` (quebra sob a CSP do ecossistema e separou pior as pessoas), modelos InsightFace e MobileCLIP (licença não comercial / pesquisa).
- **Três armadilhas reais do MediaPipe** (seção 3) custam resultado errado em silêncio se ignoradas.

O que entrou neste corte: as camadas de rosto e olhos, objetos e animais, e rótulos de cena, com MediaPipe. A camada CLIP e o agrupamento por pessoa ficaram fora (ver "Fora deste corte" em [ARQUITETURA.md](../ARQUITETURA.md)).

## 1. Como foi testado

- Máquina: Xeon 2,1 GHz, 4 vCPU, sem GPU. Navegador: HeadlessChrome 153 (Playwright do repositório, só leitura). Node 22.23.4.
- Servidor estático local com os cabeçalhos de [`products/ai-edit/vercel.json:18-26`](../../../ai-edit/vercel.json) (CSP + COOP `same-origin` + COEP `require-corp`).
- 32 fotos de teste (MediaPipe assets, face-api.js examples, human samples, Wikimedia Commons). Amostra pequena: os limiares abaixo são pontos de partida, não validação estatística.
- Borrões, ruído, exposição e "rajadas" são **sintéticos** (aplicados sobre fotos reais). Tremido real de mão e rajada real de câmera não foram testados.
- WebGPU e o delegate GPU do MediaPipe **não foram medidos** (sem GPU). Safari e Firefox não foram testados.

Precedentes no repositório que a pilha reaproveita:

- Vendorização de Transformers.js + ORT: [`products/ai-edit/scripts/vendor.mjs:23-24,48-51`](../../../ai-edit/scripts/vendor.mjs).
- ORT WASM em worker, modelo conferido por SHA-256 e guardado em cache: [`products/ai-edit/app/fluxo-worker.js:12-17,21-40`](../../../ai-edit/app/fluxo-worker.js).
- Aviso de erro do ORT na WebGPU (onnxruntime #32928): `products/ai-edit/app/fluxo-worker.js:5-7`.
- CLIP ViT-B/32 com commit e SHA-256 fixos: [`products/sobedesce/src/cenas/arquivos.js:7-15`](../../../sobedesce/src/cenas/arquivos.js). O `vision_model_quantized.onnx` baixado na prova tem o mesmo SHA-256 (`583fd111…9299`).
- Tempo e acerto do CLIP já medidos no desktop: [`products/sobedesce/docs/CENAS.md:40-44`](../../../sobedesce/docs/CENAS.md).

## 2. Pacotes (saída real de `npm view`)

```
@mediapipe/tasks-vision      1.2.3   Apache-2.0  unpacked 31398574  modified 2026-11-13
onnxruntime-web              1.31.1  MIT         unpacked 150622959 modified 2026-11-12
@huggingface/transformers    4.3.2   Apache-2.0  unpacked 9990867   modified 2026-10-30
   dependencies: onnxruntime-web '1.31.0-dev.20260914-8d85527a0', onnxruntime-node '1.30.0', sharp '^0.35.4'
@tensorflow/tfjs             4.22.0  Apache-2.0  modified 2025-01-08
@tensorflow-models/blazeface 0.1.0   Apache-2.0  modified 2023-10-17
@tensorflow-models/face-landmarks-detection 1.0.6 Apache-2.0 modified 2024-10-10 (peer: @mediapipe/face_mesh ~0.4.0, tfjs ^4.13)
@tensorflow-models/face-detection 1.0.3 Apache-2.0 modified 2024-10-10
@tensorflow-models/coco-ssd  2.2.3   Apache-2.0  modified 2023-11-10
@tensorflow-models/mobilenet 2.1.1   Apache-2.0  modified 2023-11-10
face-api.js                  0.22.2  MIT         modified 2022-05-02
@vladmandic/face-api         1.7.15  MIT         modified 2025-02-05
@vladmandic/human            3.3.6   MIT         modified 2025-08-26
```

| Pacote | Licença do modelo | Tamanho do modelo (bytes medidos) | Velocidade medida (WASM, 4 vCPU) | Offline vendorizado | Web Worker |
| --- | --- | --- | --- | --- | --- |
| tasks-vision · Face Detector | Apache-2.0 (model card do short-range lida) | short 229.746; full-range 1.083.786 | short 6–20 ms; full 17–31 ms | sim, testado | sim, testado |
| tasks-vision · Face Landmarker | Apache-2.0 (model card Blendshape V2 lida) | 3.758.596 | 30–42 ms por rosto | sim | sim |
| tasks-vision · Object Detector | Apache-2.0 (de memória) | EfficientDet-Lite0 int8 4.602.795; f16 7.254.339; Lite2 int8 7.515.971 | Lite0 int8 73–112 ms | sim | sim |
| tasks-vision · Image Classifier | Apache-2.0 (de memória) | EfficientNet-Lite0 int8 5.434.517; f32 18.582.189 | 26–45 ms | sim | sim |
| tasks-vision · Image Embedder | Apache-2.0 (de memória) | MobileNetV3-small 4.117.670; large 10.889.458 | 8–18 ms (1024 dimensões) | sim | sim |
| tasks-vision · Image Segmenter | Apache-2.0 (de memória) | selfie 249.537; multiclass 16.371.837 | 14–71 ms | sim | sim |
| onnxruntime-web | conforme o modelo | runtime WASM 14.848.852 | CLIP q8 100–105 ms; SFace 29,8 ms | sim | sim |
| transformers.js · CLIP ViT-B/32 | MIT (tag do `Xenova/clip-vit-base-patch32`) | visão q8 89.117.001; q4f16 53.267.374; texto q8 64.504.507 | igual ao ORT | sim (`env.allowRemoteModels=false`, `localModelPath`, `wasmPaths`) | sim (precedente: [`products/ai-edit/app/transcricao-worker.js:9-11`](../../../ai-edit/app/transcricao-worker.js)) |
| transformers.js · SigLIP base | Apache-2.0 | visão q8 99.499.129; q4f16 54.625.339 | não medido | sim | sim |
| transformers.js · MobileCLIP S0 | `apple-amlr` (pesquisa): **não usar** | visão q8 11.846.843 | não medido | — | — |
| tfjs coco-ssd | Apache-2.0 (de memória) | lite_mobilenet_v2 18.034.528; v1 27.264.356; v2 67.334.496 | não medido | difícil | sim (de memória) |
| tfjs blazeface / face-landmarks / mobilenet | Apache-2.0 (de memória) | não medido: tfhub.dev devolveu 403 | não medido | **não foi possível baixar** | sim (de memória) |
| @vladmandic/face-api | rede de reconhecimento equivalente à do dlib (README) | reconhecimento 6.444.032; SSD 5.616.957; tiny 193.321 | não medido | sim (modelos no pacote) | sim (de memória) |
| @vladmandic/human | "herdada da fonte original" (wiki) | faceres 6.978.814; facemesh 1.477.958; blazeface 538.928; iris 2.599.092 | 191,5 ms por imagem | sim | sim, **mas falha sob a CSP estrita** |

Referência do Google (Pixel 6, CPU/GPU): BlazeFace short 2,94 / 7,41 ms; EfficientDet-Lite0 int8 29,31 ms CPU.

Licenças que mudam a escolha:

- **InsightFace**: código MIT, mas os modelos são "available for non-commercial research purposes only". Isso atinge os `insightface-*` opcionais do Human.
- **CLIP da OpenAI**: a model card diz que reconhecimento facial está "always out-of-scope" e que uso em produção pede teste no domínio. Por isso o CLIP não toca identidade.
- **BlazeFace**: a model card diz "identity recognition is explicitly out of scope" e que o short-range é para rostos a menos de 2 m.

## 3. Achados no navegador

### 3.1 Três armadilhas do MediaPipe

1. **Worker de módulo só cria a primeira tarefa.** As seguintes falham com `ModuleFactory not set.`:

   ```
   erros: ["FaceDetector(full): ModuleFactory not set.","FaceLandmarker: ModuleFactory not set.", ...]
   ```

   Conserto testado: guardar `(await import('.../wasm/vision_wasm_module_internal.js')).default` e repor em `self.ModuleFactory` antes de cada `createFromOptions`. O worker clássico com `importScripts('vision_bundle.js')` não tem o problema.

2. **Mais de 4 tarefas no mesmo worker: as mais antigas passam a devolver zero, sem erro.** Com 7 tarefas, as três de rosto deram 0 rostos em todas as fotos. Com até 4 funcionou. Passar o mesmo `canvas: new OffscreenCanvas(1,1)` para todas resolveu. Causa provável: limite de contextos WebGL por worker (suposição; o navegador não avisou).

3. **O detector short-range perde rosto pequeno e confunde bicho com gente.** O Face Landmarker usa esse detector por dentro:

   ```
   group-1.jpg   1024x768  det 0r | full 9r | lm 0r
   bbt1.jpg      1024x576  det 0r | full 4r | lm 0r
   cat_and_dog   640x416   det 2r | full 0r
   ```

   Conserto testado: detector **full-range** na prévia → recorte 1,9× por rosto, girado pela linha dos olhos, tirado do arquivo cheio → Face Landmarker no recorte de 256 px (`numFaces: 1`). Sem rosto, repetir com `rotationDegrees` 90/−90/180. Resultado: 9/9 e 4/4 malhas nas fotos de grupo, e o rosto deitado de `wm_Nap.jpg` foi achado com giro −90.

### 3.2 Tempos (mediana de 5, prévia de 1024 px)

```
criar 7 tarefas: 1242 ms no total
portrait.jpg 820x1024  det 20.4ms | full 27ms | lm 30.5ms | obj 95.8ms ['person:0.98','tie:0.72'] | cls 44.3ms | emb 18.1ms | seg 67.3ms
bbt4.jpg     710x473   det 6r 9.9ms | full 6r 22.4ms | lm 6r 183.8ms | obj 106.6ms
cat_and_dog  640x416   obj 111.6ms ['dog:0.88','cat:0.80']
== CLIP clip_vision_quantized.onnx | 1a inferencia 338 ms | mediana 105 ms/imagem   (4 threads, isolado)
== CLIP clip_vision_q4f16.onnx     | 1a inferencia 447 ms | mediana 259 ms/imagem
== ROSTO sface.onnx      | dim 128 | mediana 29.8 ms/rosto
== ROSTO sface_int8.onnx | dim 128 | mediana 116.8 ms/rosto
sem COOP/COEP, 4 threads pedidas: CLIP 217 ms | SFace 60.1 ms
isolado, 1 thread:                CLIP 211 ms | SFace 66 ms
```

- COOP/COEP dobra a velocidade do ORT. Outros apps do ecossistema já usam esses cabeçalhos; a plataforma de fotos escolheu ficar **sem COEP** (WASM de uma thread), pelo motivo registrado no [CLAUDE.md](../../CLAUDE.md) do produto.
- Os modelos **int8 do SFace e q4f16 do CLIP são mais lentos** no WASM. Usar SFace fp32 e CLIP q8.
- Estimativa por foto com tudo ligado: cerca de 220 ms + 60 ms por rosto, ou seja, uns 4 fotos/s nesta CPU fraca. Só clássico + rostos: 60–100 ms (estimativa, não medida de ponta a ponta).

### 3.3 Human sob a CSP do ecossistema

```
### com CSP (script-src 'self' 'wasm-unsafe-eval')
Uncaught NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope': The script at 'blob:http://127.0.0.1:...' failed to load.
### sem CSP/COEP
human 3.3.6 | tfjs 4.22.0 | backend wasm | {"carregar":747,"medianaMs":191.5} | dim do vetor 1024
MESMA pessoa: n=9 min 0.30 media 0.50 max 0.65 | DIFERENTES: n=57 min 0.00 media 0.15 max 0.32
```

As faixas se sobrepõem (0,30 contra 0,32). O SFace não sobrepôs (seção 7).

## 4. Algoritmos clássicos (sem modelo)

Fórmulas validadas em numpy na prova rodada em 13/11/2026. Tudo sobre a luma Rec.709 da prévia com lado maior de 1024 px.

### 4.1 Nitidez em várias escalas

- Laplaciano: `L = I(x±1,y) + I(x,y±1) − 4·I(x,y)`; `VoL = var(L)`.
- Tenengrad: `T = média(Gx² + Gy²)` com Sobel 3×3.
- Por bloco de 32 px: `s = sqrt(T_bloco) / (média_bloco + 16)`. `S_k = percentil 90 de s` na escala k (k=0: 1024 px; k=1: metade).
- Medida principal: **`q = S0 / S1`**. Ela normaliza o conteúdo, porque compara o detalhe fino com o da escala seguinte.
- O percentil 90 responde "existe alguma região em foco", então fundo desfocado de propósito não derruba a foto.
- `VoL` cru não serve sozinho: o ruído põe um piso de `20·σ²` (soma dos quadrados do núcleo). Com σ=1,5 a prova mediu VoL0 ≈ 27–33 em fotos totalmente borradas. Subtrair `20·σ̂²`.

Medido em 11 fotos (mín / mediana / máx de `q`):

```
original       0.72  0.97  1.19
gauss s=1      0.57  0.68  0.77
gauss s=2      0.53  0.55  0.59
gauss s=4      0.50  0.52  0.54
disco r=4      0.53  0.56  0.59
mov L=17 45g   0.56  0.62  0.88
```

Limiares: `q ≥ 0,70` nítida; `0,60–0,70` leve; `< 0,60` borrada. Dentro de um ensaio, vale mais o **posto relativo** na sequência do que o limiar absoluto (suposição de produto).

### 4.2 Desfoque de foco contra tremido

- **Cepstro de potência** num recorte central de 512 px com janela de Hann: `C = IFFT2(log|FFT2(I)|)`.
- Tremido linear de L px deixa dois vales negativos opostos, a distância L do centro, na direção do movimento.
- Regra: `z ≤ −10` no vale e no ponto simétrico, `L ≥ 6`, e `anel > −2,5`.
- `anel` é a mediana de z no círculo de raio L. Desfoque de lente (disco) deixa um anel inteiro de vales; o tremido deixa só dois pontos.

O cepstro devolveu comprimento e ângulo certos:

```
portrait.jpg  mov L=9 0g      cep z -22.0  L  9.0  ang   0.0
portrait.jpg  mov L=17 45g    cep z -24.8  L 15.6  ang  45.0
portrait.jpg  mov L=17 90g    cep z -16.4  L 17.0  ang  90.0
portrait.jpg  mov L=31 120g   cep z -17.4  L 30.0  ang 120.0
```

Matriz em 16 fotos × 11 casos (linha = verdade):

```
          nitida    leve    foco     mov
nitida        16       0       0       0
leve           6       8       2       0
foco           0       0      64       0
mov            0       0       0      80
```

Ressalvas: os limiares foram ajustados nesse mesmo conjunto, e o tremido é linear e uniforme. Tremido real tem trajetória curva, e movimento só do sujeito pede a mesma análise **por bloco** (não testado).

A anisotropia do espectro por ângulo (banda 0,10–0,35 ciclos/px menos banda 0,015–0,06) **não separa sozinha**: originais chegam a 2,95 (prédio) e tremidos começam em 1,81. Fica como apoio.

### 4.3 Nitidez no rosto e nos olhos contra o fundo

Mesmo `S`, com blocos de 16 px no rosto e de 8 px na faixa dos olhos (largura = distância entre os olhos + 50% de cada lado).

```
portrait.jpg  original                      rosto 1.384 | olhos 1.845 | fundo 1.493 | rosto/fundo 0.93 | global q 0.75
portrait.jpg  so o FUNDO desfocado (s=4)    rosto 1.213 | olhos 1.845 | fundo 0.570 | rosto/fundo 2.13 | global q 0.54
portrait.jpg  so o ROSTO desfocado (s=2.5)  rosto 0.488 | olhos 0.702 | fundo 1.493 | rosto/fundo 0.33 | global q 0.74
```

- O `q` global **erra nos dois sentidos**: reprova o retrato com fundo desfocado (0,54) e aprova o de rosto desfocado (0,74).
- Com rosto, a nota de foco vem dos olhos. Olhos caíram de 1,46–1,85 para 0,48–0,70 quando o rosto desfocou, nas três fotos.
- Foco errado = `rosto/fundo < 0,6` com fundo nítido.
- Usuários reclamam que o "subject focus" do Lightroom tira a média da seleção inteira; o percentil 90 por região evita isso.

### 4.4 Olho fechado (EAR e blendshape)

- `EAR = (‖p2−p6‖ + ‖p3−p5‖) / (2·‖p1−p4‖)` em pixels.
- Índices na malha de 478: olho direito `[33,160,158,133,153,144]`, esquerdo `[362,385,387,263,373,380]`.
- O artigo que define o EAR (CVWW 2016, https://vision.fe.uni-lj.si/cvww2016/proceedings/papers/05.pdf) usa limiar 0,2 em vídeo.

Medido no recorte de 256 px:

```
FECHADOS
wm_Sleep.jpg          EAR 0.06/0.106   blink 0.64/0.67  lookDown 0.77/0.76
wm_Nap.jpg (deitado)  EAR 0.105/0.145  blink 0.36/0.47  lookDown 0.65/0.62
wm_Sleeping_baby.jpg  EAR 0.099/0.111  blink 0.51/0.59
wm_Sleeping_girl.jpg  EAR 0.086/0.19   blink 0.24/0.56
ABERTOS, SORRINDO (olhos apertados)
portrait.jpg          EAR 0.191/0.194  blink 0.27/0.29  squint 0.78/0.69  smile 0.94/0.92
wm_Laughing_woman.jpg EAR 0.173/0.21   blink 0.22/0.31  squint 0.65/0.58  smile 0.95/0.96
ABERTOS, NEUTROS (26 rostos): EAR 0.236–0.401, blink 0–0.18
```

- **O blendshape `eyeBlink` sozinho não basta em foto parada**: olho fechado de verdade deu 0,36–0,67, e o limiar usual de 0,5 perderia `wm_Nap`.
- Regra proposta, com médias dos dois olhos:
  - fechado: `EAR < 0,15`, ou `blink ≥ 0,5` com `EAR < 0,20`;
  - aberto: `EAR ≥ 0,22` e `blink < 0,35`;
  - no meio: se `mouthSmile ≥ 0,6` e `eyeSquint ≥ 0,5`, é "sorrindo" e fica aprovado; senão é "piscada parcial".
- A regra acerta os 4 fechados e os 3 sorrindo desta amostra. São só 4 fechados: recalibrar com fotos reais de evento.
- Rosto virado achata o EAR do olho de trás; ignorar esse olho acima de ~25° de giro (suposição).
- Malha exige rosto com cerca de 48 px ou mais na prévia (o menor que funcionou na prova).

### 4.5 Exposição

- Altas: % de pixels com o **maior** canal ≥ 253 (um canal estourado já perde cor); "3 canais" = menor canal ≥ 253 (branco sem volta).
- Baixas: maior canal ≤ 2. Percentis p1/p50/p99 da luma.

```
portrait.jpg  original  altas  0.7% (3 canais  0.0%) | baixas 0.4% | p1  1 p50  52 p99 235
portrait.jpg  +2 EV     altas 37.1% (3 canais 11.6%) | baixas 0.2% | p1  3 p50  99 p99 255
portrait.jpg  -3 EV     altas  0.0%                  | baixas 1.1% | p1  0 p50  20 p99  91
```

- Limiares: estourada se altas > 5% ou 3 canais > 1%; escura se p99 < 110; lavada se p1 > 60.
- Em RAW, medir o corte no dado do sensor (nível de branco por canal), não na prévia. Subexposição dentro da margem de dynamic range é recuperável e não deve reprovar (suposição de desenho, liga ao motor de revelação; a medida está em [raw-e-motor.md](raw-e-motor.md#58-faixa-dinâmica-utilizável-e-margem-de-exposição)).

### 4.6 Ruído

- Immerkær: `σ = sqrt(π/2) · média(|I * N|) / 6`, com `N = [[1,−2,1],[−2,4,−2],[1,−2,1]]`.
- Por blocos de 32 px, ficando com o percentil 10 (os blocos lisos).

```
portrait.jpg  somado 0 -> 0.31 | 2 -> 1.54 | 5 -> 3.59 | 10 -> 6.81 | 20 -> 12.46
wm_Beach.jpg  somado 0 -> 8.66 (areia: textura passa por ruido)
```

- É monotônico, mas subestima cerca de 30% e falha em foto toda texturizada. Serve como "limpa / média / ruidosa" (σ̂ < 2 / 2–6 / > 6), junto com o ISO do EXIF.

### 4.7 Horizonte torto

- O histograma de orientação das bordas errou até 3°. Não usar.
- Hough restrito funcionou: bordas fortes (p92) com gradiente quase vertical; para cada θ de −15° a +15° (passo 0,25°), projetar em `ρ = y·cosθ − x·sinθ` e ficar com a reta mais longa.

```
wm_Sea_horizon.jpg  +0.0 -> -0.25 | +1.5 -> +1.25 | +3.0 -> +2.75 | -5.0 -> -5.25 | +8.0 -> +7.75  (linha 1.6)
portrait.jpg        +0.0 -> +4.25 (linha 0.48)   <- reta que nao e horizonte
```

- Só avisar quando a força da linha for ≥ 1,0, a cena for paisagem ou arquitetura, e o ângulo estiver entre 0,7° e 10°. É dica, não desconta nota.

## 5. Duplicatas e sequências

- dHash 64 bits: miniatura 9×8, bit = vizinho da direita mais claro.
- pHash 64 bits: DCT 32×32, bloco 8×8 de baixas sem o DC, limiar na mediana.

```
mesma foto, jpeg q=60                  dHash max  2 | pHash max  2
mesma foto, +0,7 EV                    dHash max  2 | pHash max  6
mesma foto, rajada: anda 1%            dHash max  7 | pHash max  6
mesma foto, rajada: anda 3%            dHash max 16 | pHash max 14
mesma foto, rajada: anda 6% + zoom 5%  dHash max 23 | pHash max 18
fotos DIFERENTES (190 pares)           dHash min 21 | pHash min 22
```

Embedding do CLIP (cosseno):

```
mesma foto, anda1         min 0.962   anda3 min 0.939   anda6zoom min 0.909   anda14zoom15 min 0.860   ev07 min 0.891
fotos DIFERENTES (351 pares): mediana 0.429 | p95 0.611 | max 0.786 (bbt1 ~ bbt2, mesmo cenário)
```

Regra em cascata:

1. Ordenar por `DateTimeOriginal` + `SubSecTimeOriginal`.
2. **Duplicata**: Δt ≤ 2 s e Hamming ≤ 10 em dHash ou pHash.
3. **Zona cinza** (Hamming 11–20): decidir pelo CLIP com cosseno ≥ 0,90.
4. **Sequência** (mesma cena, outro instante): Δt ≤ 30 s e cosseno ≥ 0,86.
5. Agrupar por union-find. Em cada grupo, a melhor nota vira "escolhida" e as outras "reserva".

Sem CLIP, o Image Embedder do MediaPipe (4,1 MB) serve de substituto mais fraco; fotos diferentes deram 0,04–0,27, mas variações da mesma foto não foram medidas com ele. As janelas de tempo são suposição.

## 6. Cena

- Os vetores de texto das 11 cenas saem **uma vez no build** (transformers.js em Node). O arquivo tem 47.407 bytes; o navegador não baixa o modelo de texto (64 MB a menos).
- Classificação: `softmax(100 · cos(imagem, cena))`.

```
bbt4.jpg grupo:0.93 | burger.jpg comida:0.65 | cat_and_dog.jpg animal:0.82 | wm_Skyscraper.jpg arquitetura:0.93
wm_Sea_horizon.jpg paisagem:0.87 | wm_Peyto_Lake paisagem:0.76 | portrait.jpg retrato:0.46
ERROS: business-person.png produto:0.51 | person-*.jpg (amostra do Human) comida:0.82 | wm_Sleeping_baby.jpg animal:0.57 | ai-upper.jpg documento:0.60
```

- O CLIP sozinho erra fotos de gente com contexto forte (fundo branco vira "produto", mesa vira "comida", urso de pelúcia vira "animal"). Pela leitura do estudo, acertou cerca de 18 de 27.
- Regra híbrida, explicável:
  1. rostos do detector: 1 rosto com largura ≥ 15% do quadro = retrato; 3 ou mais = grupo; outros casos com rosto ou `person` = pessoas;
  2. EfficientDet com `dog/cat/bird/horse…` ≥ 0,5 e sem rosto = animal;
  3. o CLIP decide só entre natureza, paisagem, comida, arquitetura, produto, documento e noturna;
  4. noturna também por regra: p50 da luma < 40 com pontos de luz.
- A regra híbrida não foi medida como um todo.

## 7. Agrupar por pessoa

Fora deste corte (ver seção 10). Fica o que foi medido, para quando o titular decidir.

- Pontos do detector (olhos, nariz, meio da boca) → transformação de semelhança para o molde ArcFace de 112 px → SFace → vetor de 128 normalizado.

```
== ROSTO sface.onnx | 35 rostos
   pares da MESMA pessoa (cosseno): n=9 min 0.49 media 0.64 max 0.78
   pares de pessoas DIFERENTES:     n=57 min -0.13 media 0.04 max 0.16
   limiar 0.363: mesma aceita 9/9 | diferente aceita por engano 0/57
```

- Para dois rostos tirados de uma foto de grupo (107 px e 103 px), o recorte mais parecido de cada um teve cosseno 0,76 e 0,68.
- Agrupamento: centroide incremental com limiar de cosseno 0,40 (o SFace separou em 0,49 contra 0,16 na prova). Só rostos com 60 px ou mais, nítidos e de olhos visíveis entram no centroide. Fundir grupos com centroides ≥ 0,45 no fim.
- Amostra de 12 recortes rotulados de uma série de TV: não representa festa com 300 convidados, crianças ou gêmeos.
- SFace declara 0,9940 de acerto no LFW (README do opencv_zoo).

## 8. Nota estética

- **LAION aesthetic v1** para ViT-B/32: uma camada linear de 512 pesos + viés (`.pth` de 3.047 bytes, MIT). `nota = w · embedding + b`. Custo zero além do CLIP.
- Medido: 3,57 (areia) a 7,31. Mas `wm_Laughing_woman` (retrato forte) deu 4,9 e `ai-body` (imagem sintética) 6,11. **Sinal fraco**: peso baixo e rótulo "estimativa" na interface.
- Não testados: Improved Aesthetic Predictor (pede ViT-L/14, cerca de 300 MB só de visão) e NIMA (`idealo/image-quality-assessment`, Apache-2.0; pesos treinados no AVA, cujo uso comercial é incerto (de memória)).

## 9. Nota de 0 a 100 explicável, e estrelas

Componentes, cada um de 0 a 100 com o motivo guardado:

- **Foco (F)**: `100·clamp((q_reg − 0,52)/(0,75 − 0,52))`. `q_reg` vem dos olhos, senão do rosto, senão do sujeito, senão global.
- **Pessoas (P)**: por rosto, `0,6·olhos + 0,25·nitidez + 0,15·expressão`; olhos = 1 aberto, 0,5 parcial, 0 fechado. Média ponderada por `sqrt(área do rosto)`.
- **Exposição (E)**: `100 − 4·max(0, altas% − 1) − 20·max(0, altas3% − 0,5) − 3·max(0, baixas% − 2)`.
- **Ruído (R)**: `100·clamp(1 − (σ̂ − 2)/10)`.
- **Estética (A)**: `100·clamp((laion − 4,0)/3,5)`.

Pesos por cena:

| Cena | F | P | E | R | A |
| --- | --- | --- | --- | --- | --- |
| retrato / grupo / pessoas | 35 | 35 | 15 | 5 | 10 |
| demais | 45 | — | 25 | 10 | 20 |

Tetos, que explicam a reprovação em uma frase:

- tremida (`z ≤ −10`, `L ≥ 12` px): máximo 30, "Tremida, cerca de L px";
- sujeito fora de foco: máximo 35;
- rosto principal de olhos fechados: máximo 40. Não se aplica se todos os rostos do grupo de sequência estiverem fechados (beijo, oração);
- 3 canais estourados acima de 10%: máximo 50.

Estrelas: 5 ≥ 85; 4 de 70 a 84; 3 de 55 a 69; 2 de 40 a 54; 1 abaixo de 40. Teto acionado vira "rejeitada". Exportar em `xmp:Rating` (0–5; −1 para rejeitada, de memória). Atenção: o estudo de mercado recomenda **não** usar `Rating = -1` e gravar `xmpDM:pick`; ver [decupagem.md](decupagem.md#2-metadados-e-interoperabilidade).

Exemplo do que guardar por foto: `{ total: 78, estrelas: 4, motivos: ["Olhos abertos (6 de 6)", "Rosto nítido", "Altas luzes cortadas em 3%"], componentes: {F:82, P:91, E:88, R:95, A:41} }`.

Os pesos e os tetos são proposta do estudo, não medidos contra a escolha de fotógrafos. O Aftershoot fala em "30+ factors" e em 90% de acerto só depois de aprender com 3 ou 4 ensaios do próprio fotógrafo; vale prever ajuste dos pesos pelo que a pessoa aceita e recusa.

## 10. LGPD (precisa de revisão jurídica)

Texto conferido em https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html:

- Art. 5º II: dado "genético ou biométrico, quando vinculado a uma pessoa natural" é sensível.
- Art. 4º I: a lei não se aplica a pessoa natural "para fins exclusivamente particulares e não econômicos". Fotógrafo profissional **não entra** nessa exceção.
- Art. 11 I: sensível pede consentimento "de forma específica e destacada". As hipóteses do inciso II são estreitas.
- Art. 14 §1º: criança pede consentimento de um dos pais.
- Art. 46 §2º: segurança "desde a fase de concepção do produto".
- ANPD: Radar Tecnológico nº 2 (24/06/2024) trata o template biométrico como o dado crítico e não traz medidas práticas. Houve tomada de subsídios em 2025 e a regra de biometria é esperada para 2026.

O que muda se tudo roda no aparelho (leitura do estudo, não parecer):

- A Absolute ZRO não coleta, não acessa e não guarda rosto nem vetor, então não faz tratamento desses dados. O fotógrafo continua sendo o controlador.
- Detectar rosto, nitidez e olho fechado não identifica ninguém. **Agrupar por pessoa gera template biométrico**, mesmo local.

Requisitos de produto:

1. Agrupar por pessoa vem **desligado**; liga por projeto, com aviso próprio.
2. Vetores só em IndexedDB/OPFS do aparelho. Nunca em sync, link do cliente, exportação, XMP, telemetria ou log de erro.
3. Sem banco de pessoas entre projetos por padrão. Botão "Esquecer rostos" apaga vetores e grupos.
4. Modelos servidos do próprio domínio (`connect-src 'self'`), para o navegador não falar com Google ou Hugging Face.
5. O link de seleção do cliente não leva grupos de pessoas. As fotos enviadas para esse link já são tratamento pela ZRO como operadora, assunto separado.
6. Fotos de teste com rosto não entram no repositório, que é público.

Texto sugerido para o aviso: "As fotos são analisadas neste aparelho. Nada é enviado. Agrupar por pessoa cria uma assinatura do rosto de cada um, guardada só aqui e apagada com o projeto. Você responde pela autorização de quem aparece nas fotos; para crianças, dos pais."

## 11. Pilha final

| Camada | Arquivo | Origem (versão fixa) | Bytes | Licença |
| --- | --- | --- | --- | --- |
| 1 Rostos e olhos | `vision_bundle.mjs` + `wasm/vision_wasm_module_internal.{js,wasm}` | npm `@mediapipe/tasks-vision@1.2.3` | 15.158.390 (wasm sha256 `a269e84b…9e46`) | Apache-2.0 |
| 1 | `blaze_face_full_range.tflite` | `storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/` | 1.083.786 (`3698b18f…181b`) | Apache-2.0 (de memória) |
| 1 | `face_landmarker.task` | `…/face_landmarker/face_landmarker/float16/1/` | 3.758.596 (`64184e22…c9ff`) | Apache-2.0 |
| 2 Objetos e animais | `efficientdet_lite0.tflite` int8 | `…/object_detector/efficientdet_lite0/int8/1/` | 4.602.795 (`0720bf24…23bb`) | Apache-2.0 (de memória) |
| 3 Cena, estética, sequência | `ort.wasm.min.mjs` + `ort-wasm-simd-threaded.{mjs,wasm}` | npm `onnxruntime-web@1.31.1` | 14.927.315 (wasm `4b884c20…001d`) | MIT |
| 3 | `vision_model_quantized.onnx` | `huggingface.co/Xenova/clip-vit-base-patch32/resolve/6b7c523703ae26e39be4b03774966f8571c7f523/onnx/` | 89.117.001 (`583fd111…9299`) | MIT (tag do repositório) |
| 3 | `cenas.json` + cabeça LAION | build com `@huggingface/transformers@4.3.2`; `raw.githubusercontent.com/LAION-AI/aesthetic-predictor/main/sa_0_4_vit_b_32_linear.pth` | ~53.000 | Apache-2.0 / MIT |
| 4 Pessoas (opcional) | `face_recognition_sface_2021dec.onnx` | `huggingface.co/opencv/face_recognition_sface/resolve/3d7082438a6e4551e840c9b2bb60b71e8da4b524/` | 38.696.353 (`0ba9fbfa…4e79`) | Apache-2.0 |

- Camadas: **20,0 MB** / **+4,6** / **+104,1** / **+38,7** = **167,4 MB**. Os wasm caem para cerca de 4 MB cada com gzip; os modelos quase não comprimem (CLIP 89 → 70 MB).
- Baixar por camada no primeiro uso, conferir SHA-256 e guardar em Cache Storage/OPFS, como em `products/ai-edit/app/fluxo-worker.js:27-40`.
- Workers: um de visão MediaPipe (canvas único + conserto do `ModuleFactory`), um ORT (`numThreads = min(4, núcleos − 1)`), um ou mais clássicos.
- Usar o caminho `/1/` dos modelos do MediaPipe, não `/latest/`.
- Se a WebGPU entrar depois para o CLIP, trocar para `ort.webgpu.min.mjs` + wasm asyncify (28,7 MB) e validar contra a CPU, por causa do erro registrado em `products/ai-edit/app/fluxo-worker.js:5-7`.

## 12. Plano B: primeiro corte 100% clássico (0 MB de modelo)

1. Prévia de 1024 px (JPEG embutido do RAW ou decodificação própria) + EXIF.
2. Nitidez `q = S0/S1` com mapa de blocos (4.1); foco do sujeito aproximado pelo terço central.
3. Tremido contra desfoque pelo cepstro, com o teste do anel (4.2).
4. Exposição por corte de canal e percentis (4.5); ruído por Immerkær (4.6).
5. Duplicatas por dHash + pHash + tempo do EXIF (seção 5, sem a etapa do CLIP).
6. Horizonte por Hough restrito, só como dica (4.7).
7. Nota = F 55 + E 30 + R 15, com os tetos de tremida e de estouro; estrelas e "escolhida" por grupo.

O que o plano B **não** faz: rosto, olho fechado, pessoa, animal, cena, estética. Em retrato com fundo desfocado ele erra (4.3). A camada 1 (20 MB) é o primeiro acréscimo que vale a pena.

## 13. Não verificado

- Licença dita na model card de Face Mesh V2, BlazeFace full-range, EfficientDet-Lite0, EfficientNet-Lite0 e MobileNetV3 (só as de BlazeFace short-range e Blendshape V2 foram lidas).
- Licença dos pesos do dlib usados pelo face-api (CC0, de memória) e tamanhos dos modelos tfjs em tfhub.dev.
- WebGPU, delegate GPU, Safari, Firefox e celular.
- Memória por worker e tempo de ponta a ponta em 1.000 fotos.
- Extração da prévia embutida do RAW no navegador.
- Sensibilidade dos limiares à resolução da prévia, à compressão JPEG e ao ISO alto real.

## Fontes

- https://developers.google.com/edge/mediapipe/solutions/vision/face_detector
- https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
- https://developers.google.com/edge/mediapipe/solutions/vision/object_detector
- https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf
- https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf
- https://huggingface.co/Xenova/clip-vit-base-patch32
- https://huggingface.co/openai/clip-vit-base-patch32
- https://huggingface.co/opencv/face_recognition_sface
- https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_recognition_sface/README.md
- https://raw.githubusercontent.com/deepinsight/insightface/master/README.md
- https://raw.githubusercontent.com/wiki/vladmandic/human/Models.md
- https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/README.md
- https://raw.githubusercontent.com/LAION-AI/aesthetic-predictor/main/LICENSE
- https://huggingface.co/docs/transformers.js/custom_usage
- https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html
- https://vision.fe.uni-lj.si/cvww2016/proceedings/papers/05.pdf
- https://aftershoot.com/culling/
- https://helpx.adobe.com/lightroom-classic/help/assisted-culling.html
- https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html
- https://www.mayerbrown.com/pt/insights/publications/2024/07/biometrics-and-facial-recognition-anpd-releases-report
- https://www.mobiletime.com.br/noticias/02/06/2025/anpd-biometria-tomada/

## De onde vêm os números

As saídas acima são das provas rodadas em 13/11/2026: sete tarefas do MediaPipe em worker de módulo; detector full-range → recorte → malha, EAR e blendshapes; CLIP, cenas, estética e SFace no ORT; o teste do Human; um servidor com CSP, COOP e COEP; e as fórmulas clássicas em numpy (nitidez, regra de borrão, exposição, ruído, duplicatas, Hough). O que virou produto está em `src/decupagem` e no worker de visão do app.
