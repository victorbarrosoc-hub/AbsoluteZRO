# O que já existia no ecossistema

Antes de escrever a plataforma de fotos, o estudo levantou o que o monorepo já tinha de cor, medidas de imagem, desempenho no navegador, testes numéricos e links públicos. Isto serviu de **referência**: o motor de fotos é novo, e nada daqui é importado em tempo de execução.

## Escopo e método

- **Fato verificado** = o arquivo foi lido ou o comando foi rodado em 13/11/2026, no commit `6d1fdcc`. **Suposição** vai marcada como tal.
- Rodados: 8 arquivos de teste de cor da Revela (**54/54 passam, 41,5 s**, Node 22.23.4) e `node scripts/qc-looks.mjs` (**25/25 looks OK, 36 s**). As medições de tempo da seção 3 são de uma prova rodada em 13/11/2026.
- Não foram lidos por inteiro: `app/revela.js`, `app/lab.js`, `app/converter.js`, `src/cor/dctl.js`, `src/cor/porclipe.js`, `src/entrega/*`, `src/conversao/plano.js`, `test/tela.test.js` (só trechos ou cabeçalho).
- Na seção 1, os caminhos são relativos a [`products/finishing/`](../../../finishing/README.md) (a Revela, não lançada).

---

## 1. Inventário da Revela (`products/finishing/src/cor`)

Tudo é ESM puro, sem dependência de runtime e sem build ([`package.json:1-21`](../../../finishing/package.json); só `mediabunny` e `playwright` em dev). A única exceção é `src/imagem/png.js`, que usa `node:zlib`.

### Espaços, transferências e matrizes

| Arquivo | O que faz | API | Qualidade e testes |
| --- | --- | --- | --- |
| [`src/cor/espacos.js`](../../../finishing/src/cor/espacos.js) (332 linhas) | 20 curvas código⇄linear (`:44-152`): gama 2.4/2.2/2.6, sRGB, linear, DaVinci Intermediate, ACEScct, S-Log3/2, LogC3 (EI 800)/LogC4, V-Log, Canon Log/2/3, BMD Film Gen 5, F-Log/F-Log2, N-Log, D-Log, Log3G10. 15 gamuts por primárias xy (`:159-175`). Matrizes derivadas das primárias (`rgbParaXyz :233`), Bradford quando o branco muda (`:247-263`), `matrizGamut :266`. CST com mapa de tom "joelho 0,6 + exponencial" na luminância (`deitarAltas :282`) e compressão de gamut por dessaturação (`:296-302`). | `CURVAS`, `GAMUTS`, `ENTRADAS` (17), `SAIDAS` (7), `inversa`, `rgbParaXyz`, `matrizGamut`, `deitarAltas`, `criarCst(de, para, {tom, gamut}) → {aplicar(r,g,b)}` | [`test/espacos.test.js`](../../../finishing/test/espacos.test.js) (7 testes): cinza 18% de 15 curvas contra o valor do fabricante (tol. 0,0015); ida e volta de todas (1e-4); matrizes Rec.709→XYZ, S-Gamut3.Cine→709 e AP1→709 contra referência (1e-4 / 1e-3); linhas somam 1. |
| [`src/cor/oklab.js`](../../../finishing/src/cor/oklab.js) (63) | Rec.709 gama 2,4 ⇄ linear ⇄ Oklab. `oklabParaCodigo` reduz croma por bisseção (24 passos) até caber no gamut (`:47-63`). | `codigoParaOklab`, `oklabParaCodigo`, `linearParaOklab`, `oklabParaLinear` | Display-referred: `decodificar` corta em 0–1 (`:10`). Coberto por referência/looks. |
| [`src/cor/cena.js`](../../../finishing/src/cor/cena.js) (220) | Espaço de trabalho DWG linear / DI. DRT: curva de tom do ACES 2.0 com inversa analítica (`curvaDeTom :51-86`; cinza 0,18 → 10 nits no SDR, pico perto de 128× a cena). Compressão de gamut tipo ACES RGC (limiar 0,8, limite 1,3, potência 1,2; `:90-114`). Norma de luminância com piso de 20% do maior canal (`:139`). Vai ao branco perto do pico (`:133`). Telas Rec.709 2.4, sRGB, P3-D65 PQ 1000 e Rec.2020 PQ 1000 (`:125-130`). `inverter` só no SDR (secante + bisseção, `:179-217`), com teto de 0,985 do pico (`:182`). | `TRABALHO`, `diParaLinear`, `linearParaDi`, `luminancia`, `paraTrabalho`, `deTrabalho`, `curvaDeTom(pico)`, `comprimirGamut`, `TELAS`, `criarTela(id) → {aplicar, inverter, curvaDeTom}` | [`test/motor.test.js:15-53`](../../../finishing/test/motor.test.js): cinza a 10 nits (1e-3) e 14,5 nits em 1000; inversa da curva com erro relativo < 1e-6; still 709 → cena → 709 com pior erro < 1e-4 em 3000 cores; rampa −10…+10 stops monótona e neutra (1e-9); cores fora do gamut sem canal negativo. |

### LUT, curvas e looks

| Arquivo | O que faz | API | Qualidade e testes |
| --- | --- | --- | --- |
| [`src/cor/cube.js`](../../../finishing/src/cor/cube.js) (117) | `.cube` 3D em 17, 33 e 65 pontos (`:4`). Escreve com 6 casas e corta em 0–1 (`:42`). Lê só 3D e **ignora `DOMAIN_MIN/MAX`** (`:45-57`); 1D é recusada. Trilinear (`:60`) e tetraédrica (`:92`). | `TAMANHOS`, `assar(f, n)`, `escreverCube`, `lerCube`, `aplicar`, `aplicarTetra` | Identidade tetraédrica 1e-6; LUT 65 contra o motor 2e-3 (`motor.test.js:158-172`). Há um leitor mais completo em [`products/sobedesce/src/cor/grade.js:36`](../../../sobedesce/src/cor/grade.js) (aceita DOMAIN e TITLE, recusa shaper). |
| [`src/cor/looks.js`](../../../finishing/src/cor/looks.js) (196) | Motor antigo, display-referred em Oklab: curva de filme logística + 40% reta (`curvaDeFilme :126`), densidade, giros de matiz por janela cosseno (verde 142°, azul 255°, pele 60°), saturação por luz, split-tone em sombras/meios/altas. 5 looks. | `LOOKS`, `REVELA_LOOK`, `BASE_DE_LOOK`, `curvaDeFilme`, `criarRevelaLook({look, parametros, intensidade, tom, cor})` | [`test/looks.test.js`](../../../finishing/test/looks.test.js) (7): monotonia, intensidade 0 (2e-3), cinza neutro (croma < 1e-3), LUT 33 contra a função (0,01). |
| [`src/cor/pelicula.js`](../../../finishing/src/cor/pelicula.js) (703) | Motor profissional, scene-referred (LMT DWG→DWG). Ordem (`emCena :673-689`): primária (exposição 2^stops + WB Bradford, `:631`) → tom da cena (Altas/Sombras/Preto em log, sem mexer no cinza, `:640-650`) → negativo por densidade (`:531-537`) → cor em Oklab dentro do Rec.2020 (`:539-604`) → cópia opcional → luz do projetor → pele → bleach bypass → véu → intensidade em DI. Oklab com raiz cúbica linearizada perto do zero (`:68-72`). 25 perfis em 4 grupos (`:182-456`). | `NEUTRO`, `GRUPOS`, `perfilDe`, `matrizBranco(temp, tint, ganhosLms)`, `dwgParaOklab`, `oklabParaDwg`, `dwgParaCones`, `criarMotor(perfil, extra) → {emCena, emDi, partes}` | Perfil neutro é identidade (1e-6); 25 looks passam o QC (`motor.test.js:55-81`). |
| [`src/cor/lab.js`](../../../finishing/src/cor/lab.js) (251) | Receita → motor. `paraCena(entrada)` (still 709 pela inversa da tela, ou log de câmera). `analisarFrame` (`:85-124`): exposição pela mediana de Y (clareia 60% até +1,5; escurece 35% até −0,6; teto P90 a +0,75 stop) e WB pelos quase neutros em cones Bradford (ganhos^0,6, limitados a 0,85–1,15). 16 ajustes em −100…100 (`:56-74`). | `criarLab(receita) → {motor, emCena, emDi, aplicar}`, `analisarFrame`, `AJUSTES`, `escreverReceita`, `lerReceita`, `VERSAO_RECEITA = 4` | [`test/lab.test.js`](../../../finishing/test/lab.test.js) (8). |

**Limites do motor que pesam para foto (lidos no código):**

- WB só pelo lócus da luz do dia CIE (4000–25000 K, `pelicula.js:103-110`). O controle anda ±45 mired em torno de 6504 K (`:117`), ou seja, branco da cena entre ~5031 K e ~9195 K (calculado no estudo). Não cobre tungstênio.
- Altas/Sombras/Preto são curvas globais em log; não há operador local.

### Película, grão e halation

| Arquivo | O que faz | API | Qualidade e testes |
| --- | --- | --- | --- |
| [`src/cor/copia.js`](../../../finishing/src/cor/copia.js) (251) | Cópias 2383, 2393 e 3513: curvas de Richards por camada digitalizadas das fichas (`:51-85`), matriz de corantes ECP 3×3 (`:40-44`), LAD (cinza em D = 1,0 sobre a base), tabela de 4096 pontos com Hermite (`:190-210`), volta pela inversa exata da tela. Luz do projetor D55/D60/D65, Expandido (+8%). | `COPIAS`, `copiaDe`, `branco709`, `criarCopia(id, {gamaSistema, saturacaoSistema, negativo, revelacao, iluminante, expandido}) → {tela, emCena, gamaNegativo}` | Erro de ajuste declarado 0,02–0,09 D (comentário `:10`). `motor.test.js:83-103`: cinza 0,0985 (1e-6), gama 1,8 ± 0,03, motor = cópia na tela (2e-3). Não validado contra cópia projetada ([`docs/validation.md`](../../../../docs/validation.md), seção das cópias). |
| [`src/cor/negativos.js`](../../../finishing/src/cor/negativos.js) (132) | 10 negativos (Vision3 500T/250D/200T/50D; Eterna 500/400/250/250D/Vivid 160; Reala 500D). Curva analítica monótona por camada com softplus compostos (`:45-56, :72-79`). Separação espectral DWG→camadas para T e D (`:26-37`). Revelação forçada (+12% por stop). Scan sem cópia. | `NEGATIVOS`, `SEPARACAO`, `criarNegativo`, `exposicaoDasCamadas`, `criarScan` | `motor.test.js:105-135`: gama 0,38–0,63, monótona de −12 a +12 stops, Vision3 + 2383 com gama de sistema 1,6–1,85. A Fuji usa a separação da Kodak (comentário `:10-11`). |
| [`src/cor/textura.js`](../../../finishing/src/cor/textura.js) (266) | Na luz da cena, antes do look. Difusão (limiar 0,72, σ = 1,2% da largura). Halation em duas escalas (limiar 0,9, σ = 0,6% e ×3, cor [1; 0,32; 0,06]). Grão: campo gaussiano em grade com variância 1, aplicado como 2^(desvio·z) por camada, com parte comum e parte própria; granularidade por negativo (`:41`), bitolas 65/35/16/S8. Hash determinístico (`:18-29`). Desfoque por 3 caixas, O(n) (`:94-137`). | `aplicarTextura(img, w, h, t, {negativo, largura})`, `campoDeGrao`, `desfocar`, `hash`, `ruido`, `BITOLAS`, `GRANULARIDADE`, `PRESETS_TEXTURA`, `lerTextura` | [`test/textura.test.js`](../../../finishing/test/textura.test.js) (5): média e variância do campo (± 0,12), determinismo, igualdade pixel a pixel com a conta da DCTL (1e-4). |
| [`src/cor/dctl.js`](../../../finishing/src/cor/dctl.js) (135) | A mesma textura como DCTL para o Resolve. | `escreverDctlTextura` | Só teste de texto; nunca compilada num Resolve real (`docs/validation.md`, "Revela Film"). |

### QC, pacote e receita

| Arquivo | O que faz | API | Qualidade e testes |
| --- | --- | --- | --- |
| [`src/cor/qc.js`](../../../finishing/src/cor/qc.js) (222) | 7 verificações com limite (detalhe na seção 4) e ColorChecker de 24 cores em DWG (`:25-53`). | `avaliarLook(motor, opcoes) → {ok, verificacoes, cartela}`, `CARTELA`, `relatorioEmTexto` | `motor.test.js:73-81` e `:145-156` (um look quebrado é reprovado). |
| [`src/cor/pacote.js`](../../../finishing/src/cor/pacote.js) (269) | Pacote .zip: LMT DWG/DI 65 e 33 (.cube), CLF 65 (azul mais rápido, `:56-79`), ACEScct 65, LUT de monitor câmera→709 em 33, 709→709 em 33, ASC CDL só com offset (`:82-111`), DCTL, `.revela`, QC, LEIA-ME. | `montarPacote(receita, {camera, qc})`, `escreverClf`, `escreverCdl`, `offsetDaCorrecao`, `slugPack` | `motor.test.js:174-206`. |
| Receita `.revela` (`lab.js:193-251`) | JSON `{revela:'lab', versao:4, motor, nome, entrada, base, copia, negativo, luzCopia, expandido, revelacao, textura, intensidade, correcao:{exposicao, ganhos}, ajustes}`. A leitura limita cada valor ao seu intervalo, recusa lixo e versão futura, e migra v1 a v3. | `escreverReceita`, `lerReceita` | `lab.test.js` ("Receita .revela: ida e volta…"). Foi o formato de referência para a predefinição própria do app de fotos. |
| [`src/cor/meuslooks.js`](../../../finishing/src/cor/meuslooks.js) (57) | Look salvo como LUT 33³ em 16 bits, base64 (~290 KB), em `localStorage`, até 8. | `empacotar`, `desempacotar`, `lookSalvo` | 1 teste. |
| [`src/imagem/zip.js`](../../../finishing/src/imagem/zip.js) (68), [`src/imagem/png.js`](../../../finishing/src/imagem/png.js) (95) | ZIP "store" com CRC32, puro. PNG: lê 8/16 bits, grava só RGB 8 bits, só em Node. | `criarZip`, `crc32`, `lerPng`, `gravarPng` | — |

### Clonar LUT: algoritmo exato ([`src/cor/clonar.js:152-256`](../../../finishing/src/cor/clonar.js))

Opera em código Rec.709 de tela (0–1), não em linear.

1. **Amostras:** até 80.000 pares (`MAX_AMOSTRAS :18`), passo regular sobre todos os frames (`:160-170`). Pixel _i_ do "antes" casa com pixel _i_ do "depois"; o tamanho tem de ser igual (`:157`).
2. **Curva de tom** (`ajustarCurva :76-120`): x = (r+g+b)/3 do antes, y = idem do depois, em 32 faixas (`:69`); faixa com menos de 30 amostras sai (`:70`). Regressão isotônica: blocos vizinhos que descem fundem pela média ponderada (`:92-98`). Pontas extrapoladas em reta até 0 e 1 (`:104-111`), interpolação linear. A mesma curva vale nos 3 canais (`:172`).
3. **Matriz afim 3×4** por mínimos quadrados sobre os valores depois da curva (`ajustarAfim :40-65`): equações normais 4×4, Gauss com pivô (`:23-37`), ridge λ = 1e-3·n puxando para a identidade (`:54-63`).
4. **Resíduo** (depois − afim(curva(antes))) espalhado numa grade **17³** indexada pelo RGB do antes, com pesos trilineares (`:177-201`). Soma e peso passam 2 vezes por uma caixa separável [1,2,1] por eixo (`borrar :122-146`, `:205-208`). Nó = soma / (peso + **K = 0,6**) (`:19, :211`): onde falta amostra, volta para curva + matriz.
5. **Aplicar:** `limitar(afim(curva(rgb)) + resíduoTrilinear(rgb))`, misturado ao original pela intensidade (`:236-244`).
6. **Resumo:** amostras, frames, cobertura (nós com peso > 0 sobre 4913), erro médio absoluto em 1/7 das amostras, matriz (`:246-255`).
7. **Multi-frame:** `mesmoQuadro` = correlação de Pearson da luma em 48×48 > 0,85 (`:259-292`). `orientarPar` aplica a LUT existente nos dois sentidos e fica com o de menor erro (`:298-311`). Na tela: até 6 frames, principal a 1600 px, extras a 800 px ([`app/revela.js:20, 64-65`](../../../finishing/app/revela.js)).

Medidas registradas em `docs/validation.md` ("estudo com stills reais", ΔE Oklab ×100, cena não vista):

- log→709: 1,52 → 0,69 com 3 frames; 2,61 → 1,17 com 1.
- log→look de película: 7,17 → 6,18 com 1; 5,07 com 3.
- Orientação automática acertou 24 de 24 pares.

### Referência → look sem par ([`src/cor/referencia.js`](../../../finishing/src/cor/referencia.js)): algoritmo exato

É o que mais se aproxima de "extrair o estilo de uma foto".

- **Entrada:** subamostra de até 80 mil pixels em Oklab (`analisar :39`).
- **Tom** (`curvaDeTom :94-142`): 15 percentis (`:21`). Piso e teto vêm dos percentis 0,5% e 99,5% da referência. A mediana do material anda só 25% em direção à da referência (`EXPOSICAO :26`). Cada trecho ganha o contraste relativo da referência, limitado a 0,5–2 (`:25`), com inclinação limitada a 0,25–4 (`:24`). Spline monótona Fritsch–Carlson (`curvaMonotona :67`); fora dos quantis, inclinação 1.
- **Cor:** 7 faixas de L com peso gaussiano σ = 0,11 (`:22-23`). Em cada faixa, histograma 2D de (a, b) com 120×120 casas de 0,004, borrado com σ = 1,5 casa (`:184-210`). Busca exaustiva do deslocamento em ±15 casas (±0,06) que maximiza a interseção dos histogramas, com penalidade de 1e-4·|d| e refino parabólico (`alinhar :217-253`). Os 7 deslocamentos viram uma reta ponderada pela confiança, por canal: dominante + inclinação sombras→altas (`:333-354`).
- **Saturação:** mediana ponderada das razões de croma mediano em 12 setores de matiz (croma mínimo 0,02; peso mínimo 0,5%), limitada a 0,6–1,5 (`razaoSaturacao :259-281`).
- **Conta-gotas:** até 3 pares com peso 50 na regressão (`:32-33, :349`); com 2 ou mais, a saturação sai deles (`:289-300`).
- **Saída:** `criarLook(ref, mat, opcoes) → {aplicar, emOklab, resumo:{tom:{preto, cinza, branco, pontos}, faixas:[{L, desloca, saturacao, confianca}], pares}}`. O `resumo` já é uma lista de parâmetros.
- **Testes** ([`test/referencia.test.js`](../../../finishing/test/referencia.test.js), 10): identidade < 1e-4; mesma cena chega a < 0,35 da distância; cenas diferentes com razão < 0,85 em cada dupla e < 0,65 na média; neutros não tingem (croma < 0,012); LUT suave (salto < 4/(n−1)).

### Lightroom ([`src/cor/lightroom.js`](../../../finishing/src/cor/lightroom.js)): só exporta

- `lerParaLightroom(aplicar)` (`:50-80`): rampa de cinza em 11 pontos vira `ToneCurvePV2012Red/Green/Blue`. Para as 8 faixas HSL, passa uma cor HSV (s = 0,6, v = 0,72) pelo look e converte o resíduo com as constantes `GRAUS_POR_100 = 30` e `LUZ_POR_100 = 0,3` (`:21-22`).
- `presetLightroom` gera XMP `crs:` com ProcessVersion 11.0 (`:86-135`).
- Teste de formato em [`test/clonar.test.js:34-56`](../../../finishing/test/clonar.test.js). Nunca aberto num Lightroom real ([`docs/roadmap.md:1040`](../../../../docs/roadmap.md)).
- **Não existia leitor de `.xmp` nem de `.lrtemplate` no repositório** (grep por `crs:|lrtemplate|camera-raw-settings` só achava este arquivo, a tela e testes).

---

## 2. O que dava para reaproveitar e o que faltava para fotografia

### Reaproveitável por cópia conferida

O padrão da casa é cópia byte a byte com teste: `products/relay/src/revela/{espacos,cube}.js` conferidos por [`products/relay/test/copias.test.js:31-38`](../../../relay/test/copias.test.js). Regra em [`products/relay/CLAUDE.md`](../../../relay/CLAUDE.md) ("A cor é da Revela").

| Uso no app de fotos | Módulos | Observação |
| --- | --- | --- |
| Espaço de trabalho, matrizes, tela SDR/HDR | `espacos.js`, `cena.js` | Faltam os gamuts Adobe RGB, ProPhoto e AP0 em `GAMUTS` (`espacos.js:159-175`). |
| Looks e presets criativos (25 perfis, película, cópia, negativo) | `pelicula.js`, `copia.js`, `negativos.js`, `lab.js` | Dependem só de `espacos`, `cena` e `textura`. |
| Grão, halation, difusão | `textura.js` | 1,7 s em 1280×720 no JS puro (medido); precisa de GPU ou worker. |
| Clonar com par antes/depois | `clonar.js` | Serve direto para "tenho a foto editada e a original". |
| Extrair estilo de foto de referência | `referencia.js` | Sai LUT mais `resumo` paramétrico. |
| Exportar preset Lightroom | `lightroom.js` | Aproximado; constantes não validadas. |
| Exportar/importar `.cube`, CLF, CDL, zip | `cube.js`, `pacote.js`, `zip.js` | `lerCube` precisa de DOMAIN e 1D, ou usar o de `sobedesce/src/cor/grade.js`. |
| Preset próprio (formato) | Receita `.revela` v4 | Versionada, com limites na leitura e migração. |
| QC numérico de presets | `qc.js` | Barra pronta para "preset só sai se passar". |
| Auto exposição e WB | `lab.js:85-124` | Conservador: ganhos de WB limitados a ±15%. |
| Biblioteca local de looks | `meuslooks.js`; [`products/relay/app/looks.js`](../../../relay/app/looks.js) (IndexedDB); [`products/relay/app/pasta-looks.js`](../../../relay/app/pasta-looks.js) (pasta via File System Access, sincroniza sem sobrescrever) | — |

### Reaproveitável para decupagem (fora da Revela, verificado)

- [`products/sobedesce/src/frames/medidas.js:10-84`](../../../sobedesce/src/frames/medidas.js): nitidez por variância do Laplaciano, % de escuros (< 12) e estourados (> 245), média e desvio de luma, calor (R−B), saturação, dHash de 64 bits; `distanciaHash` (`:86`). Há cópia idêntica para navegador em [`products/sobedesce/web/public/app/lib/frames/medidas.js`](../../../sobedesce/web/public/app/lib/frames/medidas.js).
- [`products/sobedesce/src/frames/escolha.js`](../../../sobedesce/src/frames/escolha.js): nota de 0 a 1 (`nota :29-39`: nitidez relativa 55%, exposição 25%, contraste 20%; corta com nitidez < 35% da referência). Repetidos por dHash < 10 bits (`:10`). Referência de nitidez por grupo, com piso de 1/4 da global (`refPorCena :17`). Etiquetas automáticas (`:176`).
- [`products/sobedesce/src/media/raw-jpeg.js`](../../../sobedesce/src/media/raw-jpeg.js): extrai o maior JPEG embutido de ARW/NEF/CR2/CR3/RAF/DNG/ORF/RW2 e outros (`RAW_EXTS :8`, `maiorJpeg :14`, lê até 48 MB do começo). Só Node (`Buffer`, `fs`).
- [`products/sobedesce/src/cenas/modelo.js`](../../../sobedesce/src/cenas/modelo.js): CLIP ViT-B/32 em ONNX mais texto multilíngue (DistilBERT), vetores de 512 dimensões, via `onnxruntime-node` (dependência opcional 1.30.0). Download de ~228 MB ([`docs/CENAS.md:13`](../../../sobedesce/docs/CENAS.md)). Roda no computador.
- [`products/ai-edit/app/transcricao-worker.js:5-20`](../../../ai-edit/app/transcricao-worker.js) e [`scripts/vendor.mjs`](../../../ai-edit/scripts/vendor.mjs): Transformers.js + ONNX Runtime Web num Worker, WebGPU com queda para WASM multi-thread.

**Suposição:** o CLIP serve para classificar animal/natureza/retrato por texto e para agrupar fotos parecidas; o padrão do AEON serve para rodar modelos de rosto no navegador. O que foi testado de fato está em [visao-no-aparelho.md](visao-no-aparelho.md).

### O que não existia em lugar nenhum do monorepo (verificado por grep)

- **Decodificação RAW e demosaico:** zero ocorrência de `libraw|dcraw|demosaic|bayer|CFA|x-trans|lensfun`. [`products/synquei/app/js/media/raw.js`](../../../synquei/app/js/media/raw.js) só lê cabeçalho TIFF/DNG para timecode. O `native/raw-frame` do SOBEDESCE é só Blackmagic RAW de vídeo (SDK proprietário, saída RGBA 8 bits). Nenhum `package.json` dependia de LibRaw, dcraw ou rawspeed; os únicos WASM eram `xxhash-wasm` ([`products/sobedesce/package.json:31`](../../../sobedesce/package.json)) e `@shiguredo/rnnoise-wasm` ([`products/nossom/package.json:25`](../../../nossom/package.json)).
- **Matriz de câmera** (ColorMatrix/ForwardMatrix do DNG, dois iluminantes), níveis de preto e branco, WB "as shot".
- **Recuperação de altas luzes** (canal estourado): só havia compressão de gamut e de tom.
- **WB de fotografia** (2000–50000 K, lócus de Planck).
- **Painel HSL como motor** (8 faixas × matiz/saturação/luz): só o mapeamento de exportação e janelas fixas de verde/azul/pele em `pelicula.js:552-556`.
- **Nitidez, redução de ruído, clareza/textura/dehaze, vinheta, correção de lente, geometria e recorte, máscaras e ajustes locais.**
- **Caminho de mais de 8 bits no navegador:** as prévias leem `ImageData` ÷ 255 (`app/revela.js:104-113`, [`app/lab.js:60-65`](../../../finishing/app/lab.js)).
- **Exportação de foto:** JPEG/TIFF/HEIF/AVIF, 16 bits, ICC embutido, EXIF/IPTC/XMP. O `png.js` grava só 8 bits e só em Node.
- **Importar preset do Lightroom** (leitor XMP/lrtemplate e controles PV2012).
- **Detecção de rosto, olho fechado, sorriso:** grep por `mediapipe|face-api|FaceDetector|blazeface|retinaface|landmark` não devolvia nada.
- **Looks na conta:** `/api/zro/looks` está ⬜ em `docs/roadmap.md:1794`.

A regra "O HUB não processa edição nem cor" ([CLAUDE.md](../../../../CLAUDE.md) da raiz) pôs o motor em `products/foto/`, não no HUB.

### Armadilhas ao copiar

- A Revela não está lançada (`CLAUDE.md` da raiz). Ao copiar, trocar os textos que dizem "Revela": título padrão do `.cube` (`cube.js:27`), `x:xmptk="Revela"` e `crs:Group` (`lightroom.js:95, 121`), nomes `REVELA_*` e o LEIA-ME (`pacote.js:120, 219-267`).
- Nomes de fabricante (Kodak, Fujifilm) aparecem só como referência de ficha, com aviso de não vínculo (`copia.js:21`, `negativos.js:13`).

---

## 3. Padrões de desempenho em uso

### Revela

- **Prévia sem GPU:** assa LUT 17³ durante o arrasto (um `requestAnimationFrame` por vez) e 33³ ao soltar; aplica trilinear em JS sobre `ImageData` de até 1280 px (`app/lab.js:19, 118-131, 197-212`). Miniaturas de 300–360 px com LUT 17.
- **Worker:** só o pacote ([`app/pacote-worker.js`](../../../finishing/app/pacote-worker.js), Worker de módulo, zip devolvido como transferable; criado em `app/lab.js:486`).
- **WebGL2 em `OffscreenCanvas`:**
  - [`app/lut-gpu.js`](../../../finishing/app/lut-gpu.js): LUT 65³ em textura 3D RGB16F com filtro linear do hardware, `readPixels` em RGBA8; desfaz a faixa de vídeo no shader.
  - [`app/escala-gpu.js`](../../../finishing/app/escala-gpu.js): redução por mipmaps; detecta renderizador de software (`SOFTWARE :37`) e desiste.
- **Vídeo:** Mediabunny + WebCodecs; decodificador ProRes em WASM, multi-thread quando a página é isolada (COOP/COEP em [`vercel.json`](../../../finishing/vercel.json); CSP com `'wasm-unsafe-eval'` e `worker-src 'self' blob:`).
- **Disco:** File System Access (`showDirectoryPicker` + `createWritable`, [`app/converter.js:304, 384`](../../../finishing/app/converter.js)); sem isso, memória (até ~1,5 GB no celular, README).
- **Imagem:** `createImageBitmap(..., {colorSpaceConversion: 'none'})` (`app/revela.js:78`).

### Relay

- [`app/escala.js`](../../../relay/app/escala.js) (525 linhas): Lanczos-3 separável em 2 passadas com intermediário em ponto flutuante; empacota I420 BT.709 na GPU.
- **A cor é conta no shader, não LUT 3D** (`FRAG_COR :127-166`): curva da câmera em textura 1D R16F de 2048 pontos + `mat3` + tom + compressão de gamut + `pow(1/2.4)`. Motivo medido ([`src/cor.js:13-17`](../../../relay/src/cor.js)): uma LUT 65³ erra até ~30/255 em cor saturada e ~6/255 no preto. O teste trava isso: [`test/cor.test.js:73-74`](../../../relay/test/cor.test.js) (LUT > 20/255; conta < 1/255) e `:66` (< 1,2/255 em todas as câmeras).
- Espelho em JS do shader (`aplicarEtapas`, `src/cor.js:116-138`) conferido contra a conta de referência.
- Sem Web Worker no app (grep). Sem COEP, porque barraria o iframe do SOBEDESCE (`CLAUDE.md` do Relay).
- IndexedDB para os `.cube` (65³ passa de 7 MB) e para o `FileSystemDirectoryHandle` (`app/looks.js`).
- Saída em streaming: `MB.StreamTarget(gravavel, {chunked: true})` ([`app/motor.js:432-433`](../../../relay/app/motor.js)). Codificadores AAC/MP3 em WASM sob demanda (`app/motor.js:121-135`).
- Leitura do Drive aos pedaços por `postMessage` + `MessagePort` com `ArrayBuffer` transferido; teto de 32 MB por pedido ([`src/drive.js`](../../../relay/src/drive.js)); `MB.StreamSource` ([`app/drive.js:98`](../../../relay/app/drive.js)).

### SOBEDESCE

- **Drive no navegador:** service worker [`packages/drive-web/src/sw.js`](../../../../packages/drive-web/src/sw.js) serve `/app/stream/<id>` repassando `Range`, com o token só em memória. Por ser mesma origem, o canvas pode ler os pixels ([`web/public/app/lib/frames/celular.js:1-4`](../../../sobedesce/web/public/app/lib/frames/celular.js)).
- **Frames no celular:** `<video>` escondido, amostras de 256 px, até 240 amostras (`frames/celular.js:8-11`); [`frames/codec.js`](../../../sobedesce/web/public/app/lib/frames/codec.js) lê só o `moov` por Range.
- **Workers:** MD5 (`md5-worker.js`) e PSD (`psd-worker.js`, buffer transferido).
- **Cor na prévia:** `cor-gl.js`, LUT 33³ em WebGL2.
- **Computador:** ffmpeg por pipe em `rawvideo` ([`src/frames/analise.js:43-74`](../../../sobedesce/src/frames/analise.js)), `worker_threads` para hash ([`src/engine/hasher.js:10-11, 222`](../../../sobedesce/src/engine/hasher.js)), ajudante nativo C++ para BRAW, `onnxruntime-node`.

### Ausências

- **OPFS:** nenhum uso em código de produção. Aparece só em [`products/relay/test/painel.test.js:201, 219`](../../../relay/test/painel.test.js) e citado em [`products/sobedesce/docs/CELULAR.md:276`](../../../sobedesce/docs/CELULAR.md).
- **WebGPU:** só no AEON, pelo Transformers.js.
- Nenhum WASM próprio de processamento de imagem.

### Medições (prova rodada em 13/11/2026: Node 22, sandbox, JS puro, 1 thread)

| Operação | Tempo |
| --- | --- |
| `criarLab('revela').aplicar` × 100 mil px | 583 ms (~5,8 µs/px) |
| idem com cópia 2383 | 897 ms |
| `assar` 17 / 33 / 65 (base revela) | 29 / 186 / 1260 ms |
| LUT 33 trilinear × 1 MP | 86 ms |
| LUT 33 tetraédrica × 1 MP | 233 ms |
| `clonarLut` 1600×900 | 192 ms |
| `criarLook` (referência) 1600×900 | 300 ms |
| `aplicarTextura` 1280×720 (grão + halation + difusão) | 1724 ms |

**Extrapolação do estudo:** o motor por pixel em JS levaria ~140 s numa foto de 24 MP. Isso é inviável; o caminho para foto em resolução cheia é a conta em shader (padrão do Relay) ou LUT + GPU (padrão `lut-gpu.js`), com o JS servindo de referência de teste.

---

## 4. Como os testes validam numericamente

Runner `node --test`, sem framework. Métrica central: **ΔE em Oklab** (distância euclidiana em L, a, b); "≈ 0,02 já é visível lado a lado" ([`test/apoio.js:78`](../../../finishing/test/apoio.js)).

### Limites do QC (`src/cor/qc.js`)

| Verificação | Limite | Linha |
| --- | --- | --- |
| Croma do cinza de −4 a +4 stops | ≤ 0,035 (ou o `tingeMax` do perfil, 0,065) | `:87-97` |
| Monotonia da rampa de −10 a +10 stops, passo 1/16 | descida ≤ 1e-6 | `:100-108` |
| Suavidade: 2ª diferença em 7 rampas DI, `2·q1024 − q512` | ≤ 0,25 | `:113-151` |
| Matiz da pele (ColorChecker clara e escura) de −2 a +2 stops | espalhamento ≤ 7° (12° com cópia); matiz entre 35° e 80° | `:154-171` |
| Preto a −8 stops | ≤ 0,09 (0,16 com véu) | `:174-178` |
| Branco a +7 stops | ≥ 0,86 | `:174-178` |
| 3000 cores aleatórias em DI −0,05…1,05 | tudo finito e na faixa | `:181-192` |
| LUT 65 tetraédrica contra a conta exata, 2000 pontos | max ΔE Oklab ≤ 0,012 | `:195-205` |

Resultado medido em 13/11/2026 nos 25 looks: pior pele 11,28° (`200t-2383`, limite 12°); pior LUT 0,007; pior tinge 0,043 (`dourado`, limite 0,065).

### Outros limites

- **Curvas e matrizes:** valores de fabricante com tolerância de 1e-3 a 1,5e-3; ida e volta 1e-4 (`test/espacos.test.js`).
- **Clonar** (`test/clonar.test.js`): erro no próprio frame < 0,01; cena não vista < 25% da distância original (1 frame) e < 15% com a curva; 2 frames ≤ 1,02× o erro de 1.
- **Relay:** erro em unidades de 8 bits (< 1/255 para a conta da GPU; ≤ 3/255 no ffmpeg real em S-Log3, `test/cor.test.js:132`). Vídeo: SSIM do luma em janelas 8×8 ([`src/ssim.js`](../../../relay/src/ssim.js)) contra referência x264 ([`docs/QUALIDADE.md`](../../../relay/docs/QUALIDADE.md)).
- **Dados sintéticos determinísticos:** `test/apoio.js` (`cena(semente)` com 40 manchas de 7 cores, `lookConhecido`, `distanciaMedia`, PRNG mulberry32).
- **Tela:** [`test/tela.test.js`](../../../finishing/test/tela.test.js) (41 testes) em Chromium via Playwright, servindo com os cabeçalhos CSP/COOP/COEP de produção (`:20-24`).
- **Material real** (ARRI, DJI, stills do titular) foi usado fora do repositório; só os números estão em `docs/validation.md`.

---

## 5. Links públicos e tokens de compartilhamento

### Maestro (`products/maestro`): o padrão mais completo

**Link do cliente `/a/<token>`** ([`src/lib/revisao/link.ts`](../../../maestro/src/lib/revisao/link.ts), 372 linhas; página em `src/app/a/[token]/page.tsx`):

- Token de 32 bytes em base64url (regex de 43 caracteres, `:23`). O banco guarda só o sha256 mais uma cópia cifrada `token_enc` (`:6`).
- PIN opcional de 4 a 8 dígitos com scrypt (`:32-45`); cookie assinado por HMAC, válido 12 h (`:47-63`).
- "Porta estreita": a transação assume o papel do app sem organização e só as funções `security definer` respondem (`comoLink :73`): `maestro.link_vivo`, `link_pin`, `link_abrir`, `link_comentar`, `link_enviar` ([`drizzle/0005_revisao.sql:253-437`](../../../maestro/drizzle/0005_revisao.sql)).
- Limites em [`src/lib/auth/limite.ts:23-33`](../../../maestro/src/lib/auth/limite.ts): abrir 120/h por link e 300/h por IP; link morto 30/h por IP; PIN 5 a cada 15 min; comentar 60/h; enviar 20/h. O IP entra só como HMAC do dia (`link.ts:66`).
- Link desconhecido, revogado ou vencido dá a mesma resposta ("morto").
- O cliente comenta com posição x,y em % (`lerComentario :270-298`) e envia decisões `aprovado | ajuste` por peça, com nome, aceite e termo com hash (`lerEnvio :321`, `enviarDecisoes :342`).
- Rotas `POST /api/link/{pin,comentar,enviar}` com token no corpo e conferência de origem ([`src/lib/revisao/rotas.ts`](../../../maestro/src/lib/revisao/rotas.ts)).
- Marca da produtora no link: `marcaDoLink :361`.

**Suposição:** o modelo "peças com decisão por peça e envio único com aceite" é quase o fluxo "cliente seleciona as fotos".

**Outros links do Maestro:**

- `/f/<token>` (Fluxo): validade de 7 a 30 dias, revogável, até 10 vivos, PIN, e imagens servidas só pelo token de um link vivo (`src/app/f/[token]/i/[id]/[arquivo]/route.ts`, [`drizzle/0032_fluxo_links.sql:1-30`](../../../maestro/drizzle/0032_fluxo_links.sql)). É o precedente para servir imagem a quem não tem conta.
- `/o/<token>` (orçamento com aceite), `/p/…` (pedido público), `/convite/<token>`.

### Ponte Maestro → SOBEDESCE → Drive

- `drive.compartilhar_revisao` liga "qualquer pessoa com o link" (leitor) no arquivo do Drive enquanto o link do cliente vale; `drive.recolher_revisao` remove só a permissão que o Maestro criou ([`products/sobedesce/web/src/app/api/zro/drive/revisao/compartilhar/route.ts`](../../../sobedesce/web/src/app/api/zro/drive/revisao/compartilhar/route.ts), [`src/lib/zro/drive-do-maestro.ts:1-17`](../../../sobedesce/web/src/lib/zro/drive-do-maestro.ts)).
- Lista fechada de ações em [`packages/core/src/pedidos-entre-apps.ts`](../../../../packages/core/src/pedidos-entre-apps.ts) (`ACOES_SOBEDESCE`): `drive.listar`, `drive.miniatura`, `drive.pasta.criar`, `drive.token` e as `relay.*`.
- O pedido é um JWT assinado pelo HUB (`zro-pedido+jwt`); o HUB só assina e audita.

### SOBEDESCE

- `/r/<token>`: coleção pública de referências em HTML, `.json` e `.md` (`web/src/app/r/[token]/route.ts`). Token de 43 caracteres guardado em claro em `publicaToken`, com ligar/desligar/trocar ([`web/src/lib/referencias/colecoes.ts:34-42, 414-445`](../../../sobedesce/web/src/lib/referencias/colecoes.ts)). `noindex`, `no-store`, CSP `default-src 'none'`.
- Não é galeria de cliente; não há link de entrega nem de seleção de fotos.
- "Entrega" no SOBEDESCE é o comprovante `sobedesce.entrega/1` (pasta conferida por MD5 → HUB).

### HUB (`apps/hub-web`)

- Nenhum link público nem token de compartilhamento para terceiros sem conta.
- O que existe:
  - `/api/v1/apps/entregas` (+ `destinatarios`, `recebidas`): caixa de entrada entre apps, servidor a servidor com bearer; hoje roteiro Maestro → TPeasy.
  - `/api/v1/apps/pedidos`: emissão do JWT de ponte.
  - `/api/v1/projects/[id]/sobedesce/deliveries`.
  - Convites de organização e de pessoas ([`lib/actions/org.ts:48`](../../../../apps/hub-web/lib/actions/org.ts): "compartilhe o link com a pessoa").

### `products/*/api` (funções Vercel dos apps sem build)

- `finishing/api` (14 arquivos) e `relay/api` (9): só SSO (`zro/entrar|callback|eu|sair`), repasse do Set e da Z, gate (`_release.js`, `app.js`) e painel do Relay ([`api/relay/painel.js`](../../../relay/api/relay/painel.js), schema `relay` com RLS via `comoPessoa`).
- Nenhum tinha token público. O grep por `compartilh|share|token_hash|link_publico` só acertava `app.js` do AEON e da Revela e `radio/api/pagina.js` (gate ou página), não compartilhamento.
- `sobedesce://relay` e `sobedesce://looks` ([`products/relay/src/link.js`](../../../relay/src/link.js), `app/pasta-looks.js:9-10`) são deep links para o app de computador, não links de cliente.

### Suposições que o estudo deixou para o app de fotos

- O link "cliente seleciona as fotos" pode nascer de uma cópia do desenho do Maestro: token com hash, PIN, porta estreita `security definer`, limites, e imagem servida só pelo token. Foi o que a [ARQUITETURA.md](../ARQUITETURA.md) adotou (seção Servidor).
- O `CLAUDE.md` da raiz exige schema e papel próprios por app, RLS e teste de isolamento em toda tabela nova.
- As prévias para o cliente teriam de ser JPEGs gerados pelo app: não há storage de mídia no HUB, e as regras do SOBEDESCE e do Relay dizem que nenhum byte de mídia passa por servidor. Onde guardar essas prévias (Drive da pessoa com permissão por link, como na revisão do Maestro, ou um storage novo) era decisão em aberto e pede autorização do titular se envolver serviço pago. As opções estão em [cliente-e-estilo.md](cliente-e-estilo.md#a5-privacidade-onde-ficam-as-fotos).
