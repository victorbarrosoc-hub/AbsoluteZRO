# Lightroom e reveladores: funções, reclamações, matemática e oportunidades

O que o Lightroom e os concorrentes de revelação fazem, do que os fotógrafos reclamam, o que darktable, RawTherapee e
Capture One resolvem melhor na conta, e as 15 oportunidades que saíram daí. Pesquisa de 13/11/2026.

**Legenda:** **[V]** = verificado em 13/11/2026 na URL citada · **(de memória)** = não verificado agora · **[S]** =
suposição ou recomendação do estudo.

**Limite da pesquisa:** `helpx.adobe.com` devolveu HTTP 403 em todas as tentativas. Por isso **todas as faixas numéricas
dos controles do Lightroom abaixo são de memória**; confirme no app antes de fixá-las em contrato. A única fonte oficial
de faixas que apareceu (namespace `crs` do XMP, https://developer.adobe.com/xmp/docs/XMPNamespaces/crs) documenta só as
chaves legadas (Exposure −4..+4, Sharpness 0..100) e não as chaves `*2012`, Texture ou Dehaze.

O que o repositório já tinha antes deste produto (motor de cor da Revela, sem decodificador RAW) está em
[o-que-ja-existia.md](o-que-ja-existia.md).

## 1. Inventário: Lightroom Classic (LrC) e Lightroom (nuvem)

### 1.1 Importação e biblioteca

- **Catálogo:** `.lrcat` (SQLite) + `.lrcat-data` (máscaras e edições de IA). [V] monousuário, não abre em volume de
  rede: https://community.adobe.com/feature-requests-676/p-allow-catalog-to-be-stored-on-a-networked-drive-666362/index54.html
- **Importar** (de memória): Copy as DNG / Copy / Move / Add; renomear por modelo; segunda cópia; preset de revelação e
  de metadados na importação; palavras-chave; detecção de duplicatas. [V] 16.0: barra de filtro na importação por tipo
  de arquivo, nota da câmera, etiqueta de cor e protegido:
  https://community.adobe.com/announcements-673/lightroom-classic-16-0-is-here-ai-blemish-removal-depth-maps-and-glow-effects-1653735
- **Prévias** (de memória): Minimal, Embedded & Sidecar, Standard, 1:1; **Smart Previews** (DNG com perdas, 2560 px no
  lado maior) para editar offline e sincronizar.
- **Organização** (de memória): pastas, coleções, coleções inteligentes (regras), conjuntos, Quick Collection,
  coleção-alvo; cópias virtuais; snapshots; histórico.
- **Marcação** (de memória): bandeiras Pick/Reject/sem bandeira (P/X/U); estrelas 0–5; 5 etiquetas de cor (teclas 6–9);
  palavras-chave hierárquicas com sinônimos e Painter; IPTC/EXIF; filtros Texto/Atributo/Metadados; People
  (reconhecimento facial); módulo Map.
- **Pilhas:** por tempo de captura (de memória). [V] 15.0: auto-stacking por intervalo ou similaridade visual com
  sliders, e filtro empilhadas/não empilhadas:
  https://community.adobe.com/announcements-673/from-max-2025-new-features-in-lightroom-classic-15-0-983824
- **Vistas** (de memória): Grid, Loupe, Compare, Survey; segundo monitor; Quick Develop.
- **Assisted Culling:** [V] estreou na 15.0 (out/2025) em early access; saiu do early access na 15.4 (jun/2026) com
  painel Info dividido em Foto e Rostos (mostra qual pessoa está de olho fechado ou fora de foco) e overlays na vista
  Detail: https://www.lightroomqueen.com/whats-new-in-lightroom-2026-06/
- **Duplicatas:** [V] vista Duplicates na 15.4, com indexação inicial que pode levar horas (mesma URL).
- **Outros [V]:** sincronização de palavras-chave pela nuvem (15.4); filtros e Smart Collections para "editado com IA"
  (15.4); Auto Focus Overlay com os pontos de AF de Canon/Nikon/Sony (16.0); History Step Cleanup manual ou agendado
  (16.0).

### 1.2 Revelação: painéis, controles e faixas

Todas as faixas são de memória, salvo marcação.

| Painel | Controles e faixas |
| --- | --- |
| **Perfil** | Adobe Color/Landscape/Portrait/Vivid/Standard/Monochrome, Adobe Adaptive, Camera Matching, perfis criativos com Amount 0–200; formatos DCP e XMP (com LUT). |
| **Básico** | WB presets + conta-gotas; Temp 2000–50000 K (RAW), Tint −150..+150; não-RAW −100..+100. **[V] 16.0 baixou os limites inferiores de Temp para 1500 (RAW) e −150 (não-RAW).** Exposure −5..+5 EV; Contrast, Highlights, Shadows, Whites, Blacks −100..+100; Texture, Clarity, Dehaze, Vibrance, Saturation −100..+100; Auto. |
| **Curva de tons** | Paramétrica: Highlights/Lights/Darks/Shadows −100..+100 com 3 divisores; curva de pontos RGB e por canal (0–255); Refine Saturation. |
| **Misturador de cores** | HSL em 8 faixas (Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta) × Hue/Sat/Lum −100..+100; **Point Color** (até 8 amostras; Hue/Sat/Lum Shift −100..+100; Range). [V] slider Variance desde a 15.0. |
| **Color Grading** | Rodas Shadows/Midtones/Highlights + Global: Hue 0–360, Sat 0–100, Luminance −100..+100; Blending 0–100; Balance −100..+100. [V] disponível dentro de máscaras desde a 16.0. |
| **Detalhe** | Sharpening: Amount 0–150, Radius 0.5–3.0, Detail 0–100, Masking 0–100. NR manual: Luminance 0–100 (+Detail, Contrast); Color 0–100 (+Detail, Smoothness). Denoise (IA): Amount 1–100. |
| **Correções de lente** | Perfil: remover aberração cromática, ativar correções, Distortion 0–200, Vignetting 0–200. Manual: Distortion −100..+100; Defringe roxo/verde Amount 0–20 + faixa de matiz; Vignetting Amount −100..+100, Midpoint 0–100. |
| **Transformar** | Upright (Off/Auto/Guided/Level/Vertical/Full); Vertical, Horizontal −100..+100; Rotate −10..+10; Aspect −100..+100; Scale 50–150; X/Y Offset −100..+100; Constrain Crop. [V] slider Projection nos modos Upright (16.0). |
| **Efeitos** | Vinheta pós-corte: estilo (Highlight Priority/Color Priority/Paint Overlay), Amount −100..+100, Midpoint 0–100, Roundness −100..+100, Feather 0–100, Highlights 0–100. Grão: Amount, Size, Roughness 0–100. [V] Glow: Bloom, Halation, Diffusion (16.0). |
| **Lens Blur** | Blur Amount 0–100; formas de bokeh (círculo, bolha, 5 lâminas, anel, olho de gato); Boost; faixa focal; visualizar profundidade. |
| **Calibração** | Process Version (atual: 6); Shadows Tint −100..+100; primárias R/G/B: Hue −100..+100, Saturation −100..+100. |
| **Ferramentas** | Crop (proporção, ângulo ±45°, overlays); Remove (Content-Aware, Heal, Clone, Generative); Red Eye; soft proofing. [V] vectorscope no painel Histogram (16.0). |

### 1.3 Máscaras

- **IA** (de memória): Subject, Sky, Background, Objects; People (pele do rosto e do corpo, sobrancelhas, esclera,
  íris/pupila, lábios, dentes, cabelo, roupas, barba); Landscape (céu, vegetação, água, montanhas, arquitetura, solo
  natural e artificial). [V] Snow no Landscape (15.0); novo modelo de Select Subject (15.4); **mapas de profundidade
  gerados por IA** para qualquer foto (16.0).
- **Manuais** (de memória): gradiente linear, radial, pincel (Size, Feather, Flow, Density, Auto Mask); Color Range,
  Luminance Range, Depth Range; Add/Subtract/Intersect/Invert.
- **Ajustes locais** (de memória): Exposure −4..+4, Contrast, Highlights, Shadows, Whites, Blacks, Temp, Tint, Hue ±180,
  Saturation, Texture, Clarity, Dehaze, curva, Point Color, Sharpness, Noise, Moiré, Defringe, Color, Grain; Amount
  global 0–200. [V] painel de máscara personalizável com Favoritos (16.0).

### 1.4 IA

- **Denoise**, **Raw Details** e **Super Resolution** (2× linear = 4× pixels) (de memória).
- **Lens Blur** e **Generative Remove** (Firefly) (de memória).
- **Distraction Removal:** reflexos e pessoas (de memória); [V] Dust (15.0); [V] melhorias em Reflection Removal (15.6);
  [V] remoção de sombras via Generative Remove (15.0).
- **[V] AI blemish removal** por rosto, com pincéis Remove/Restore (16.0).
- **Adaptive Presets** (presets com máscara de IA recalculada por foto) e **Auto** (de memória).
- [V] edições de IA rodam em segundo plano no lote e há Render to DNG (15.5, resumo de busca das release notes). [V]
  Denoise usa o Neural Engine em Apple Silicon (15.4).
- [V] Lightroom desktop não consumia créditos generativos em jan/2026
  (https://community.adobe.com/questions-680/does-lightroom-use-generative-ai-credits-1617304), mas Topaz AI Sharpen e
  Generate Video na nuvem consomem (15.4, URL da lightroomqueen).

### 1.5 HDR, mesclas e saída

- De memória: modo de edição HDR com histograma estendido e "Preview for SDR"; saída HDR em AVIF, JPEG XL, TIFF, PSD e
  JPEG com gain map; Photo Merge HDR, Panorama (esférica/cilíndrica/perspectiva, Boundary Warp, Fill Edges) e HDR
  Panorama.
- [V] 16 bits como formato HDR ao enviar para o Photoshop (15.4).

### 1.6 Sincronizar e copiar ajustes (de memória)

Copy/Paste Settings com lista de itens; Sync e Auto Sync; Previous; Match Total Exposures; Reference View; presets de
importação; defaults RAW por câmera/ISO.

### 1.7 Presets e perfis (de memória)

- Presets `.xmp` (antes `.lrtemplate`) em grupos, com Amount 0–200, favoritos, importação/exportação em `.zip`.
- Presets com ISO adaptativo; presets adaptativos (máscaras de IA).
- Perfis `.dcp` e `.xmp` com LUT (criados no Camera Raw).
- Recommended Presets e Premium Presets (nuvem).

Os formatos estão detalhados em [predefinicoes.md](predefinicoes.md).

### 1.8 Exportação (de memória)

- **Formatos:** JPEG, JPEG XL, AVIF, PNG, TIFF, PSD, DNG, Original; vídeo H.264/DPX.
- **Controles:** qualidade, limite de tamanho; espaço de cor (sRGB, Display P3, Adobe RGB, ProPhoto, Rec.2020 e
  variantes HDR); 8/16 bits; redimensionar por lado maior/menor, dimensões, megapixels ou %; resolução.
- **Nitidez de saída:** Screen / Matte Paper / Glossy Paper × Low / Standard / High.
- **Metadados:** tudo, só copyright, remover pessoa/local; Content Credentials.
- **Marca d'água:** texto ou gráfico, com opacidade, tamanho, âncora, inset.
- **Fluxo:** nomes por modelo; pós-processamento (abrir em app, ações); presets de export; multi-batch (vários presets
  de uma vez); Publish Services; Export as Catalog.

### 1.9 Tethering, impressão, livros

- **Tethering:** Canon, Nikon, Sony, Fujifilm (de memória). [V] Leica (15.0). [V] Canon reescrito em PTP (15.4).
- **Print** (de memória): Single Image/Contact Sheet, Picture Package, Custom Package; print sharpening; gerência de cor;
  Print to JPEG.
- **Book** (de memória): Blurb, PDF, JPEG. **Slideshow** e **Web** (galerias HTML).

### 1.10 Lightroom (nuvem): diferenças

- De memória: originais na nuvem; álbuns; busca por conteúdo; modo Local; Versions; compartilhamento web com comentários
  e curtidas; Community/Remix; Quick Actions no mobile.
- [V] 15.4/9.4: histograma interativo (arrastar ajusta Exposure, Highlights, Shadows, Whites, Blacks); 9 etiquetas de
  cor personalizáveis (não sincronizam com o Classic); Assisted Culling; Topaz AI Sharpen; Generate Video:
  https://www.lightroomqueen.com/whats-new-in-lightroom-2026-06/
- [V] lacunas citadas com frequência frente ao Classic: cópias virtuais, Smart Collections, módulos Print e Map, soft
  proofing detalhado (blogs; os percentuais são opinião):
  https://lightroomkillertips.com/im-surprised-at-how-much-lightroom-cloud-is-still-missing-after-all-this-time/

## 2. Concorrentes: o que acrescentam

- **Capture One**
  - [V] Sessions (pasta por projeto) × Catalogs (banco); camadas com máscara e opacidade; Styles que incluem camadas
    (resumos de busca).
  - [V] 16.3: AI Masking, ReTether, snap-to-eye no Focus Tool. 16.5: Match Look, People Masking. 16.7 (29/10/2025):
    Combine Masks, Retouch Teeth/Eyes, máscara de roupas, contact sheets, PSB; pontos seguintes: máscaras como canal alfa
    em PSD e Film Conversion Workspace:
    https://support.captureone.com/hc/en-us/articles/31141690629917-Capture-One-16-7-release-notes
  - [V] Live for Studio (colaboração) e fluxos automatizados no plano Studio:
    https://captureone.com/en/products/capture-one-pro/explore-features
  - (de memória) Color Editor Basic/Advanced/**Skin Tone** com sliders de uniformidade; Color Balance de 3 vias; curva
    **Luma** separada da RGB; Base Characteristics (perfil ICC + curva Auto / Film Standard / Film Extra Shadow / Film
    High Contrast / **Linear Response**); Clarity em 4 métodos + Structure; Speed Edit; Smart Adjustments; AI Crop; Next
    Capture Adjustments; Process Recipes simultâneas; anotações; overlay de layout; Capture Pilot.
- **darktable 5.6**
  - [V] workflow scene-referred, três mapeadores de tom (filmic rgb, sigmoid, AgX), color calibration, cinco métodos de
    reconstrução de realces.
  - (de memória) máscaras desenhadas e paramétricas em todo módulo; tone equalizer; diffuse or sharpen; color balance
    rgb; denoise profiled; pipeline em float 32 bits com Rec.2020 linear; OpenCL; gratuito.
- **RawTherapee 5.12**
  - [V] 10 demosaicos Bayer + 3 X-Trans; dual demosaic; Pixel Shift; capture sharpening; reconstrução de realces Blend /
    Color Propagation / Inpaint Opposed (5.10); Gamut Compression baseada em ACES e dehaze por black point (5.12); Film
    Negative: https://www.rawtherapee.com/downloads/5.12
  - (de memória) CIECAM02/CAM16; wavelets; Local Adjustments por ΔE; dark-frame e flat-field; sem catálogo.
- **DxO PhotoLab 9**
  - [V] AI Masks combináveis com U Point; DeepPRIME XD3 (X-Trans; Bayer na 9.6); denoise e Lens Sharpness aplicáveis
    localmente; Optics Modules medidos em laboratório; DeepPRIME e ClearView só na edição Elite:
    https://www.diyphotography.net/dxo-photolab-9-launches-ai-masks-local-noise-control-iphone-raw-support-and-more/ e
    https://fstoppers.com/post-production/dxo-adds-pureraw-6-features-photolab-9-900873
  - (de memória) espaço de trabalho DxO Wide Gamut; Smart Lighting; licença perpétua.
- **ON1 Photo RAW 2026**
  - [V] dois novos modelos de máscara; Resize AI integrado; Negative Mode; Restore AI (2026.4, só no MAX):
    https://petapixel.com/2025/09/03/on1-photo-raw-2026-has-major-ai-masking-improvements/
  - (de memória) NoNoise AI, Brilliance AI, Keyword AI, Sky Swap AI, Portrait AI, camadas, licença perpétua.

## 3. Reclamações recorrentes de fotógrafos

Quase tudo aqui é relato de fórum ou material de concorrente; trate como sinal, não como medição.

1. **Lentidão.** [V] catálogo de ~200 mil fotos "insuportável"; 15.0 mais lenta no Develop (usuário voltou para a
   14.5.1); Mac M3 "quase inutilizável":
   https://community.adobe.com/questions-675/tired-of-the-extreme-slowness-and-the-multiple-problems-my-lightroom-classic-has-983764
   e
   https://community.adobe.com/t5/lightroom-classic-discussions/updated-to-lr-classic-v15-0-and-program-is-now-extremely-slow/m-p/15587270/highlight/true
2. **Catálogo frágil e monousuário.** [V] `.lrcat-data` corrompido faz máscaras de IA sumirem ou pedirem atualização:
   https://community.adobe.com/t5/lightroom-classic-bugs/p-ai-masks-require-updating-and-or-disappear/idc-p/15618384.
   [V] a 15.4 foi **retirada em 20/06/2026 por bug de perda de dados** na vista Duplicates e ainda atualizou o formato
   do catálogo, dificultando o retorno: https://www.lightroomqueen.com/whats-new-in-lightroom-2026-06/. [V] sem rede e
   sem multiusuário: https://photographylife.com/sharing-lightroom-catalog-with-multiple-computers
3. **Assinatura e preço.** [V] plano Photography 20 GB mensal passou de US$ 9,99 para US$ 14,99 em 15/01/2025 e fechou
   para novos assinantes: https://helpx.adobe.com/creative-cloud/faq/ccpp-20gb.html (via resumo de busca),
   https://petapixel.com/2024/12/18/adobe-is-ditching-their-cheapest-photography-plan-for-new-customers-now-what,
   https://fstoppers.com/business/adobes-photography-plan-price-changes-what-need-know-687748
4. **Culling fraco.** [V, fontes são concorrentes] critérios centrados em retrato (Eyes Open, Eye Focus, Subject Focus);
   ~1,5 h para um casamento contra ~48 min no Aftershoot em teste do próprio Aftershoot; trava o app durante a análise;
   recepção "mista": https://filterpixel.com/lightroom-ai-vs-filterpixel e
   https://narrative.so/blog/best-aftershoot-alternatives-2026. Não apareceu review independente.
5. **Cor de pele e perfis.** [V] Sony A1 II com Adobe Color alterado na 14.2; pele vermelha nos perfis Camera Matching
   da A7R V; pele escura alaranja ao subir exposição/sombras:
   https://community.adobe.com/bug-reports-674/p-color-issue-with-raw-files-from-sony-a1-ii-and-lightroom-classic-14-2-and-photoshop-26-5-664486/index3.html
   e https://community.adobe.com/questions-680/lightroom-needs-a-cyan-filter-for-darker-skin-tones-927931. As
   comparações com Capture One apontam para os dois lados; a estatística "65% dos profissionais" dos blogs da Imagen
   não tem fonte.
6. **IA sem controle.** [V] não há chave para desligar todos os recursos de IA; dúvida sobre desclassificação em
   concurso:
   https://community.adobe.com/questions-675/what-lightroom-functionality-uses-generative-ai-causing-a-disqualification-in-an-int-photo-comp-1617709
7. **Sincronização.** [V] erros de sync em fotos com Generative Remove (set/2026):
   https://community.adobe.com/bug-reports-674/lightroom-classic-has-sync-errors-for-photos-that-have-generative-ai-remove-1643303
8. **Dois produtos, recursos desencontrados.** [V] nuvem ainda sem cópias virtuais, Smart Collections, Print (URL do item
   1.10).
9. **Histórico infla o catálogo.** [V, inferido do remédio] a 16.0 criou History Step Cleanup "para reduzir o tamanho do
   catálogo".
10. (de memória) seleção do cliente exige serviço à parte (Pic-Time, Pixieset); preset não se adapta à exposição nem ao
    WB de cada foto, daí a existência de Imagen e Aftershoot Edits; Denoise lento em GPU modesta.

## 4. O que darktable, RawTherapee e Capture One fazem melhor na matemática

### darktable

- [V] **Dados lineares e não limitados até o fim.** No display-referred o RAW é comprimido cedo em 0–1 com cinza médio
  fixo em 0,5 e curva irreversível; perde-se a relação entre luminosidade e saturação, o que gera o "look HDR". No
  scene-referred a compressão só acontece na saída:
  https://docs.darktable.org/usermanual/5.6/en/overview/workflow/process/
- [V] **Exposição separada do mapeamento de tom.** Exposure fixa o cinza médio; o mapeador recebe brancos e pretos **em
  EV relativos ao cinza**, com "dynamic range scaling" como margem de segurança. O filmic mapeia o cinza da cena para
  18% linear e cita ~12,3 EV de faixa de entrada típica:
  https://docs.darktable.org/usermanual/5.6/en/module-reference/processing-modules/filmic-rgb/. **Este é o modelo mais
  próximo do pedido de "margens de dynamic range nas exposições".**
- [V] **AgX.** Curva por canal em log2 dentro de um espaço de primárias próprio (atenuação + rotação antes, purity boost
  + reversão depois). Evita o colapso de cores saturadas nas 6 primárias/secundárias ("Notorious 6") e traz cores fora
  do gamut para dentro sem tocar as de dentro:
  https://docs.darktable.org/usermanual/5.6/en/module-reference/processing-modules/agx/
- [V] **Sigmoid.** Curva log-logística generalizada com Contrast e Skew; modo por canal (rolloff tipo filme) ou razão
  RGB (preserva cor espectral); "preserve hue" contínuo de 0 a 100%:
  https://docs.darktable.org/usermanual/5.6/en/module-reference/processing-modules/sigmoid/
- [V] **Color calibration.** Adaptação cromática em espaço CAT (CAT16 padrão, Bradford, XYZ) depois do perfil de
  entrada, em vez de multiplicadores RGB do WB; iluminante em xyY, com aviso quando o CCT é inválido; aceita máscaras
  (luz mista); calibração por ColorChecker com mínimos quadrados ponderados e relatório ΔE2000; compressão de gamut que
  mantém luminância e matiz:
  https://docs.darktable.org/usermanual/5.6/en/module-reference/processing-modules/color-calibration/
- [V] **Reconstrução de realces no RAW.** Inpaint opposed (padrão), segmentation based, guided laplacians (difusão de
  gradientes, só Bayer), clip, LCh:
  https://docs.darktable.org/usermanual/5.6/en/module-reference/processing-modules/highlight-reconstruction/
- [V] **Normas de preservação de crominância explícitas** (max RGB, luminância Y, norma de potência, euclidiana) e
  mapeamento de gamut que fixa a matiz medida na entrada (URL do filmic).

### RawTherapee

- [V] **Demosaico escolhido pelo conteúdo.** AMaZE (padrão, ISO baixo), RCD (bordas redondas), DCB (sensor sem filtro
  AA), LMMSE/IGV (ISO alto, evitam padrões de labirinto), VNG4 (crosstalk), Markesteijn 1 e 3 passes (X-Trans). **Dual
  demosaic** usa um algoritmo no detalhe e outro nas áreas lisas, com limiar de contraste automático:
  https://rawpedia.pixls.us/demosaicing/
- [V] **Pixel Shift.** Combina 4 quadros deslocados de 1 pixel e mascara movimento (mesma URL).
- [V] **Capture sharpening.** Aplicado logo após o demosaico, antes do WB e do perfil de trabalho; raio estimado
  automaticamente; limiar de contraste automático para não afiar ruído; reforço de raio nos cantos; iterações com limite
  automático: https://rawpedia.pixls.us/capture_sharpening/. A página não nomeia o algoritmo; "Richardson-Lucy" é (de
  memória).
- [V] **Float 32/64 bits não limitado** "sem perda de dados" e ordem de operações documentada (pré-processo RAW →
  demosaico → realces → WB → …): https://rawpedia.pixls.us/toolchain_pipeline/. A mesma página admite que a parte final
  em L\*a\*b\* é não linear; o RawTherapee não é estritamente scene-referred.

### Capture One

Tudo de memória, salvo indicação.

- Perfis ICC por câmera feitos pela fabricante, com curva de filme separada do perfil; a opção Linear Response remove a
  curva.
- Curva Luma independente da RGB (mexe em contraste sem alterar saturação).
- Color Editor Skin Tone com uniformidade de matiz/saturação/luminosidade.
- [V, parcial] a vantagem em pele não é consistente entre câmeras:
  https://petapixel.com/2015/10/10/is-capture-ones-default-color-profile-any-better-than-lightrooms-adobe-standard

### Onde o Lightroom fica atrás

De memória + [S].

- Highlights/Shadows/Whites/Blacks são operadores adaptativos à imagem e não documentados: o mesmo valor produz
  resultado diferente em cada foto, ruim para preset em lote.
- A curva de tom está embutida no perfil e é aplicada cedo.
- Um único demosaico, sem escolha.
- WB por multiplicadores Temp/Tint.
- Sem informar quantos EV de folga existem acima e abaixo em cada foto.
- [V, relato de fórum] puxar Whites para cima ou Blacks para baixo distorce a razão RGB:
  https://discuss.pixls.us/t/comparing-filmic-color-science-v5-v6/31646/205

## 5. As 15 oportunidades [S]

1. **Medidor de folga de exposição por foto.** Ler black level, white level e ruído do RAW e mostrar "+X EV até
   estourar, −Y EV até o ruído", por canal. Nenhum concorrente mostra isso como número; atende diretamente ao pedido de
   margens de dynamic range.
2. **Pipeline linear, não limitado, em float**, com mapeamento de tom único no final (família AgX/sigmoid) e white/black
   em EV relativos ao cinza. Preset passa a ser previsível entre fotos.
3. **Normalização antes do preset.** Estimar exposição e iluminante de cada foto, levar ao cinza médio e ao neutro, só
   então aplicar o estilo. Resolve "preset não funciona em toda foto" sem depender de IA treinada por usuário.
4. **Demosaico adaptativo automático** (ISO, presença de filtro AA, Bayer ou X-Trans; dual nas áreas lisas) e capture
   sharpening logo após o demosaico, ambos sem exigir escolha da pessoa.
5. **Reconstrução de realces no RAW, antes do WB**, com indicação visual do que é dado real e do que foi reconstruído (o
   app não finge informação; coerente com "Não fingir" do [CLAUDE.md](../../../../CLAUDE.md) da raiz).
6. **WB como adaptação cromática (CAT16) com iluminante explícito e máscara** para luz mista (festa, casamento), em vez
   de Temp/Tint global.
7. **Decupagem que não trava o app.** Análise em workers sobre a prévia embutida do RAW, com resultado progressivo.
   Critérios pedidos pelo titular: foco no olho, olho fechado, borrado de movimento × fora de foco, repetidas, e
   categoria (pessoa, animal, natureza), indo além do retrato.
8. **Nota explicada.** Cada foto mostra por que foi aprovada ou reprovada (por rosto, como o painel Info da 15.4) e a
   pessoa ajusta o rigor por critério; nada de nota opaca.
9. **Sem catálogo monolítico.** Estado por projeto em sidecar + banco (schema próprio no Supabase `AbsoluteZRO`,
   conforme o `CLAUDE.md` da raiz), histórico compacto, colaboração multiusuário nativa. Ataca corrupção, monousuário e
   inchaço do histórico.
10. **Link de seleção do cliente embutido.** Galeria com prévias, limite de fotos, favoritos e comentários; a escolha
    volta como bandeira/coleção e dispara o tratamento em lote. No Lightroom isso exige serviço externo.
11. **Importar preset do Lightroom com relatório de fidelidade.** Ler `.xmp`/`.lrtemplate`, mapear cada chave `crs:`
    para o motor e listar o que foi convertido exato, aproximado ou ignorado. Dá para reaproveitar o mapeamento inverso
    de [`products/finishing/src/cor/lightroom.js:50-86`](../../../finishing/src/cor/lightroom.js).
12. **Extrair estilo de uma foto de referência como ajustes editáveis** (curvas, HSL, grading, grão), não só LUT, com
    prévia antes/depois e erro medido em ΔE. Base existente:
    [`products/finishing/src/cor/referencia.js:309`](../../../finishing/src/cor/referencia.js) e
    [`oklab.js:14`](../../../finishing/src/cor/oklab.js).
13. **Biblioteca de predefinições como produto.** Coleções, favoritos, versão, intensidade 0–200, exportação em formato
    próprio + `.xmp` + `.cube`, e preset que carrega máscaras semânticas recalculadas por foto.
14. **Cor de pele como cidadã de primeira classe.** Vectorscope com linha de pele, uniformização de pele (como o Skin
    Tone do Capture One) e mapeador que não alaranja pele escura ao abrir sombras (preservação de matiz ajustável).
15. **Desempenho honesto e IA opcional.** GPU via WebGPU com fallback em WASM; edição imediata em proxy e render final no
    arquivo inteiro; processamento local por padrão; uma chave "sem IA generativa" com registro do que foi usado em cada
    foto (responde à reclamação 6).

**Risco técnico a validar antes de prometer [S]:** decodificar RAW no navegador exige portar LibRaw ou rawspeed para
WASM (cobertura de câmeras, RAWs comprimidos proprietários, arquivos de 50–100 MB em memória). O caminho desktop
(`apps/hub-desktop`) pode ser necessário para lotes grandes. A avaliação das bibliotecas, com números medidos, está em
[raw-e-motor.md](raw-e-motor.md).

O que entrou neste corte e o que ficou para depois está em [ARQUITETURA.md](../ARQUITETURA.md).
