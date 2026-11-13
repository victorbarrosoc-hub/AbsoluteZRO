# Predefinições: formatos, mapeamento e limites

Como são por dentro os presets e perfis do mercado (`.xmp` do Lightroom, `.lrtemplate`, `.dcp`, `.costyle`, `.cube`), como cada chave vira um controle nosso, até onde a conversão é exata e o que a lei pede. Pesquisa e provas de 13/11/2026. O formato próprio (`.zropreset`) e o relatório de importação estão no contrato, em [ARQUITETURA.md](../ARQUITETURA.md).

## Legenda de confiança

- **[V]** verificado em 13/11/2026 (código, arquivo ou página lidos; a fonte vem citada).
- **[M]** de memória, não verificado.
- **[S]** suposição ou proposta do estudo (constantes a calibrar).

Faixas de slider: **[V]** só para Exposure (−5..+5), Contrast (−100..100), Sharpness (0..150), ColorNoiseReduction (0..100), Texture (−100..100), Saturation (−100..100) e SharpenEdgeMasking (0..100). Elas vêm do resumo de busca do guia Adobe "Apply edits" (https://developer.adobe.com/firefly-services/docs/lightroom/guides/apply-edits); a página deu 404 no fetch direto. As demais faixas são **[M]** (interface do Lightroom).

Os arquivos de amostra (o `lightroom.c` do darktable, o `XMP.pm` do ExifTool, o DNG SDK, amostras `.xmp`, `.lrtemplate`, `.costyle` e `.copreset`, e um perfil real com LUT) foram baixados fora do repositório, e o decodificador de `crs:RGBTable` foi uma prova rodada em 13/11/2026. Nenhum arquivo de terceiro entrou no git.

## 0. O que já existia no repositório

- **[V]** [`products/finishing/src/cor/lightroom.js:86-135`](../../../finishing/src/cor/lightroom.js) só **escreve** preset `.xmp` (curvas por canal + HSL). Não existia leitor de XMP, `.lrtemplate`, `.dcp` ou `.costyle`.
- **[V]** Centros das 8 faixas HSL assumidos em `lightroom.js:10-19`: Red 0°, Orange 30°, Yellow 60°, Green 120°, Aqua 180°, Blue 240°, Purple 270°, Magenta 300°. Constantes `GRAUS_POR_100 = 30` e `LUZ_POR_100 = 0.3` em `:21-22`. São aproximações do próprio repositório, não dados da Adobe.
- **[V]** O ajuste inverso (look → curvas + HSL) está em `lightroom.js:50-80`.
- **[V]** `.cube`: escrita em [`products/finishing/src/cor/cube.js:27`](../../../finishing/src/cor/cube.js), leitura `lerCube` em `:45`, trilinear `aplicar` em `:60`, tetraédrica `aplicarTetra` em `:92`. Reaproveitável para LUT como preset.
- **[V]** OKLab em [`products/finishing/src/cor/oklab.js:14-47`](../../../finishing/src/cor/oklab.js); look por referência (`criarLook`) em [`products/finishing/src/cor/referencia.js:309`](../../../finishing/src/cor/referencia.js).
- **[V]** `crs:SupportsAmount2` (`lightroom.js:102`) não está na tabela do ExifTool, mas aparece em presets reais (ex.: `Lr_Presets/colors-DarkHumid.xmp` do repositório citado em 1.2). O significado exato é **[M]**.

## 1. Lightroom / Camera Raw `.xmp` (namespace `crs`)

Namespace: `http://ns.adobe.com/camera-raw-settings/1.0/`. Lista de tags: ExifTool `%Image::ExifTool::XMP::crs` (https://github.com/exiftool/exiftool/blob/master/lib/Image/ExifTool/XMP.pm) **[V]**.

### 1.1 Serialização (observada em arquivos reais) **[V]**

- Envelope `x:xmpmeta > rdf:RDF > rdf:Description`. As chaves vêm como **atributos** `crs:Chave="valor"` ou como **elementos** filhos; o leitor precisa aceitar os dois. O darktable trata "Lr 7.0 CC (nodes)" e "Lr up to 6.0 (attributes)" em `src/develop/lightroom.c:1788-1792`.
- Números com sinal explícito (`"+40"`, `"-35"`, `"0.00"`, `"+1.0"`). Booleanos `"True"/"False"`; dentro de `crs:Look` aparecem em minúsculas. `LensProfileEnable` e `AutoLateralCA` usam `"1"/"0"`.
- Curvas: `rdf:Seq` de `rdf:li` com `"x, y"` em 0–255.
- `Name`, `Group`, `ShortName`, `SortName`, `Description` são `rdf:Alt` com `xml:lang="x-default"`. O arquivo de teste da Adobe também traz `crs:Name=""` como atributo.
- **Preset é parcial**: chave ausente significa "não mexer". O motor precisa de três estados (ausente / valor / valor neutro). **[M]** quanto à semântica; a ausência de chaves em presets reais é **[V]**.

### 1.2 Exemplo real (recorte literal)

Fonte: https://raw.githubusercontent.com/changyun233/Lumix-V-log-LUTs/HEAD/Lr_Presets/colors-Saudade.xmp **[V]**. É um recorte para documentar o formato; não é fixture de teste nem predefinição distribuída.

```xml
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        ">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   crs:PresetType="Normal" crs:Cluster="" crs:UUID="BB20593FF173411F93F2CA730101FED5"
   crs:SupportsAmount="True" crs:SupportsColor="True" crs:SupportsMonochrome="True"
   crs:SupportsHighDynamicRange="True" crs:SupportsNormalDynamicRange="True"
   crs:SupportsSceneReferred="True" crs:SupportsOutputReferred="True"
   crs:RequiresRGBTables="False" crs:CameraModelRestriction="" crs:Copyright="" crs:ContactInfo=""
   crs:Version="14.2" crs:ProcessVersion="11.0" crs:WhiteBalance="As Shot"
   crs:Exposure2012="0.00" crs:Contrast2012="+40" crs:Highlights2012="-35" crs:Shadows2012="+31"
   crs:Whites2012="-5" crs:Blacks2012="0" crs:Texture="-29" crs:Clarity2012="-20" crs:Dehaze="0"
   crs:Vibrance="+4" crs:Saturation="+5"
   crs:ParametricShadows="-58" crs:ParametricDarks="+32" crs:ParametricLights="+4" crs:ParametricHighlights="-74"
   crs:ParametricShadowSplit="10" crs:ParametricMidtoneSplit="46" crs:ParametricHighlightSplit="78"
   crs:Sharpness="25" crs:SharpenRadius="+1.0" crs:SharpenDetail="25" crs:SharpenEdgeMasking="0"
   crs:LuminanceSmoothing="0" crs:ColorNoiseReduction="25" crs:ColorNoiseReductionDetail="50" crs:ColorNoiseReductionSmoothness="50"
   crs:HueAdjustmentRed="+17" crs:HueAdjustmentOrange="-11" … crs:SaturationAdjustmentRed="+9" … crs:LuminanceAdjustmentGreen="-30" …
   crs:SplitToningShadowHue="0" crs:SplitToningShadowSaturation="0" crs:SplitToningHighlightHue="0"
   crs:SplitToningHighlightSaturation="0" crs:SplitToningBalance="0"
   crs:ColorGradeMidtoneHue="0" crs:ColorGradeMidtoneSat="0" crs:ColorGradeShadowLum="0" crs:ColorGradeMidtoneLum="0"
   crs:ColorGradeHighlightLum="0" crs:ColorGradeBlending="50" crs:ColorGradeGlobalHue="0" crs:ColorGradeGlobalSat="0" crs:ColorGradeGlobalLum="0"
   crs:AutoLateralCA="1" crs:LensProfileEnable="1" … crs:GrainAmount="30" crs:GrainSize="35" crs:GrainFrequency="50"
   crs:PostCropVignetteAmount="0" crs:ShadowTint="0" crs:RedHue="+17" crs:RedSaturation="+15" crs:GreenHue="0"
   crs:GreenSaturation="+10" crs:BlueHue="-10" crs:BlueSaturation="0" crs:OverrideLookVignette="False"
   crs:ToneCurveName2012="Custom" crs:LensProfileSetup="LensDefaults" crs:HasSettings="True" crs:CropConstrainToWarp="0">
   <crs:Name><rdf:Alt><rdf:li xml:lang="x-default">colors-saudade</rdf:li></rdf:Alt></crs:Name>
   <crs:Group><rdf:Alt><rdf:li xml:lang="x-default">ユーザープリセット</rdf:li></rdf:Alt></crs:Group>
   <crs:ToneCurvePV2012><rdf:Seq>
     <rdf:li>0, 14</rdf:li><rdf:li>67, 78</rdf:li><rdf:li>220, 209</rdf:li><rdf:li>255, 249</rdf:li>
   </rdf:Seq></crs:ToneCurvePV2012>
   <crs:ToneCurvePV2012Red><rdf:Seq><rdf:li>0, 0</rdf:li><rdf:li>39, 24</rdf:li> … <rdf:li>255, 255</rdf:li></rdf:Seq></crs:ToneCurvePV2012Red>
   <crs:Look>
    <rdf:Description crs:Name="Adobe Color" crs:Amount="1" crs:UUID="B952C231111CD8E0ECCF14B86BAA7077"
     crs:SupportsAmount="false" crs:SupportsMonochrome="false" crs:SupportsOutputReferred="false"
     crs:Copyright="© 2018 Adobe Systems, Inc." crs:Stubbed="true">
     <crs:Group><rdf:Alt><rdf:li xml:lang="x-default">Profiles</rdf:li></rdf:Alt></crs:Group>
    </rdf:Description>
   </crs:Look>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
```

Arquivo de teste da própria Adobe, com `IncrementalTemperature`, `CameraProfile="Embedded"` e `PostCropVignetteStyle="1"`: https://github.com/adobe/adobe-photoshop-api-sdk/blob/main/testfiles/input/vignette_b.xmp **[V]**

### 1.3 Chaves, faixa e significado

Padrões marcados **[V]** foram observados no arquivo da Adobe acima.

| Grupo | Chave(s) `crs:` | Faixa / valores | Significado |
| --- | --- | --- | --- |
| Identidade | `PresetType` | `Normal` (preset), `Look` (perfil) **[V]** | tipo do arquivo |
| | `UUID`, `Cluster`, `Name`, `ShortName`, `SortName`, `Group`, `Description` | texto; UUID com 32 hex **[V]** | identidade e organização na biblioteca |
| | `SupportsAmount`, `SupportsAmount2` | bool | aceita slider de intensidade (0–200% **[M]**) |
| | `SupportsColor`, `SupportsMonochrome`, `SupportsHighDynamicRange`, `SupportsNormalDynamicRange`, `SupportsSceneReferred`, `SupportsOutputReferred` | bool **[V]** | em que tipo de imagem se aplica (raw = scene-referred; JPEG = output-referred) |
| | `RequiresRGBTables`, `ShowInPresets`, `ShowInQuickActions` | bool, observados **[V]** | fora da tabela do ExifTool |
| | `CameraModelRestriction`, `Copyright`, `ContactInfo` | texto **[V]** | restrição por câmera e autoria |
| | `Version` | versão do ACR; observados `11.2.1`, `14.2`, `18.1.1` **[V]** | |
| | `ProcessVersion` | observados `"6.7"` (em `.lrtemplate`), `"11.0"`, `"15.4"` **[V]**; `"5.7"` = PV2010 e `"10.0"` = PV4 **[M]** | versão do processo |
| | `HasSettings` | `True` **[V]** | o bloco tem ajustes |
| Balanço de branco | `WhiteBalance` | `As Shot`, `Custom` **[V]**; `Auto`, `Daylight`, `Cloudy`, `Shade`, `Tungsten`, `Fluorescent`, `Flash` **[M]** | modo |
| | `Temperature`, `Tint` | 2000–50000 K; −150..+150 **[M]** | só para raw |
| | `IncrementalTemperature`, `IncrementalTint` | −100..+100 **[M]**; chave **[V]** | relativo, para JPEG/TIFF |
| Tom (PV2012+) | `Exposure2012` | −5.00..+5.00 EV | |
| | `Contrast2012`, `Highlights2012`, `Shadows2012`, `Whites2012`, `Blacks2012` | −100..+100 | |
| Presença | `Texture`, `Clarity2012`, `Dehaze` | −100..+100 | |
| | `Vibrance`, `Saturation` | −100..+100 | |
| Curva paramétrica | `ParametricShadows`, `ParametricDarks`, `ParametricLights`, `ParametricHighlights` | −100..+100 | 4 regiões |
| | `ParametricShadowSplit`, `ParametricMidtoneSplit`, `ParametricHighlightSplit` | 0–100; padrão 25/50/75 **[V]** | divisores |
| Curva de pontos | `ToneCurvePV2012`, `ToneCurvePV2012Red`, `ToneCurvePV2012Green`, `ToneCurvePV2012Blue` | `Seq` de `"x, y"` 0–255 **[V]** | |
| | `ToneCurveName2012` | `Linear`, `Custom` **[V]**; `Medium Contrast`, `Strong Contrast` **[M]** | rótulo |
| | `CurveRefineSaturation` | 0–100, observado **[V]** | fora do ExifTool; significado **[M]** |
| HSL | `HueAdjustment<Cor>`, `SaturationAdjustment<Cor>`, `LuminanceAdjustment<Cor>` | −100..+100 | Cor ∈ Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta **[V]** |
| P&B | `ConvertToGrayscale` (ou `Treatment`), `GrayMixer<Cor>` | bool; −100..+100 **[M]** | `Treatment` observado em arquivo de terceiros, fora do ExifTool |
| Color Grading | sombras `SplitToningShadowHue`, `SplitToningShadowSaturation`; altas `SplitToningHighlightHue`, `SplitToningHighlightSaturation` | matiz 0–360, sat 0–100 | Color Grading **reusa** as chaves SplitToning para sombras e altas **[V]** |
| | `ColorGradeMidtoneHue`, `ColorGradeMidtoneSat`, `ColorGradeGlobalHue`, `ColorGradeGlobalSat` | matiz 0–360, sat 0–100 | meios-tons e global **[V]** |
| | `ColorGradeShadowLum`, `ColorGradeMidtoneLum`, `ColorGradeHighlightLum`, `ColorGradeGlobalLum` | −100..+100 **[M]** | luminância |
| | `ColorGradeBlending`, `SplitToningBalance` | 0–100 (padrão 50 **[V]**); −100..+100 | mistura e balanço |
| Detalhe | `Sharpness`, `SharpenRadius`, `SharpenDetail`, `SharpenEdgeMasking` | 0–150; 0.5–3.0 **[M]**; 0–100; 0–100 | padrões 1.0/25/0 **[V]** |
| Ruído | `LuminanceSmoothing`, `LuminanceNoiseReductionDetail`, `LuminanceNoiseReductionContrast` | 0–100 | |
| | `ColorNoiseReduction`, `ColorNoiseReductionDetail`, `ColorNoiseReductionSmoothness` | 0–100; padrão 25/50/50 **[V]** | |
| Grão | `GrainAmount`, `GrainSize`, `GrainFrequency`, `GrainSeed` | 0–100 | Frequency é o "Roughness" da interface |
| Vinheta | `PostCropVignetteAmount`, `PostCropVignetteMidpoint`, `PostCropVignetteFeather`, `PostCropVignetteRoundness` | −100..100; 0–100 (50); 0–100 (50); −100..100 | |
| | `PostCropVignetteStyle`, `PostCropVignetteHighlightContrast` | 1/2/3; 0–100 | 1 = Highlight Priority, 2 = Color Priority, 3 = Paint Overlay **[M]** |
| Lente | `LensProfileEnable`, `LensProfileSetup`, `AutoLateralCA`, `VignetteAmount`, `VignetteMidpoint`, `Defringe*`, `LensManualDistortionAmount` | | correção óptica |
| Geometria | `Perspective*`, `Upright*`, `Crop*` | | preset comercial normalmente não traz corte |
| Calibração | `ShadowTint`, `RedHue`, `RedSaturation`, `GreenHue`, `GreenSaturation`, `BlueHue`, `BlueSaturation` | −100..+100 | desloca primárias |
| Perfil | `CameraProfile`, `CameraProfileDigest` | nome do DCP (`Adobe Standard`, `Embedded`, `Camera …`) | |
| Look | `crs:Look` | struct, ver abaixo | perfil criativo referenciado |
| Locais | `MaskGroupBasedCorrections`, `GradientBasedCorrections`, `PaintBasedCorrections`, `CircularGradientBasedCorrections` | structs com `LocalExposure2012`, `LocalContrast2012`, `LocalHighlights2012`, `LocalShadows2012`, `LocalWhites2012`, `LocalBlacks2012`, `LocalClarity2012`, `LocalDehaze`, `LocalTexture`, `LocalTemperature`, `LocalTint`, `LocalHue`, `LocalSaturation`, `LocalSharpness`, `LocalLuminanceNoise`, `LocalMoire`, `LocalDefringe`, `LocalToningHue/Saturation` **[V]** | máscaras; as de IA precisam ser recalculadas por foto |
| Novos | `PointColors`, `LensBlur`, `HDREditMode`, `SDR*`, `ColorVariance` **[V]** | | Point Color, desfoque de lente, HDR |
| Legado | `Exposure`, `Brightness`, `Contrast`, `Shadows`, `FillLight`, `HighlightRecovery`, `Clarity`, `ToneCurve`, `ToneCurveName` **[V]** | | PV2003/PV2010 |

Struct `crs:Look` **[V]** (ExifTool `XMP.pm`, bloco `Look`): `Name`, `Amount`, `Cluster`, `UUID`, `SupportsMonochrome`, `SupportsAmount`, `SupportsOutputReferred`, `Copyright`, `Group`, e `Parameters` com `Version`, `ProcessVersion`, `Clarity2012`, `ConvertToGrayscale`, `CameraProfile`, `LookTable`, `ToneCurvePV2012` (+Red/Green/Blue), `Highlights2012`, `Shadows2012`. `crs:Stubbed="true"` (observado) indica referência a um perfil instalado, sem dados embutidos.

Versões de processo (página Adobe https://helpx.adobe.com/camera-raw/desktop/get-started/overview-and-setup/process-versions.html; só o resumo da busca foi lido, o fetch deu 403): PV1 2003; PV2 2010 (Camera Raw 6); PV3 2012 (Camera Raw 7); PV4 (Camera Raw 10); PV5 (Camera Raw 11); PV6 (Camera Raw 15.4, junho/2023; reduz banding no Color Mixer e no B&W Mixer).

## 2. `.lrtemplate` (Lua, anterior ao XMP)

Estrutura observada em três arquivos reais **[V]**:

- https://github.com/xguox/Lightroom-Presets ("300 v1.lrtemplate")
- https://github.com/gorakhargosh/lightroom-presets ("BW Base.lrtemplate")
- https://github.com/fredrikaverpil/photography (um preset de filme para X100S)

```lua
s = {
	id = "4E28E856-…",            -- opcional
	internalName = "BW Base",
	title = "BW Base",
	type = "Develop",
	value = {
		settings = {
			ProcessVersion = "6.7",
			ConvertToGrayscale = true,
			EnableCalibration = true, EnableColorAdjustments = true, EnableDetail = true,
			EnableEffects = true, EnableGrayscaleMix = true, EnableSplitToning = true,
			Exposure = 0, Brightness = 50, Contrast = 15, Shadows = 20, FillLight = 0, HighlightRecovery = 0,
			GrayMixerRed = -14, …, RedHue = 22, ShadowTint = -39,
			ParametricShadowSplit = 25, …, Temperature = 3600, Tint = 66, WhiteBalance = "Custom",
			ToneCurve = { 0, 0, 32, 22, 64, 56, 136, 128, 192, 196, 255, 255 },
			ToneCurveName = "Custom", CameraProfile = "ACR 3.3",
			ToneCurvePV2012 = { … }, ToneCurvePV2012Red = { … },
			orientation = "AB",
		},
		uuid = "385EBB76-E687-11DB-B1FC-0014511CB470",
	},
	version = 0,
}
```

- Os nomes das chaves são os mesmos do `crs`, sem prefixo. As curvas são vetores **planos** que alternam x e y. Os interruptores `Enable*` ligam ou desligam painéis inteiros.
- `type` diferente de `"Develop"` deve ser recusado. Um tópico da comunidade Adobe relata que preset de ajuste local não carrega como preset de revelação: https://community.adobe.com/t5/lightroom-classic-discussions/how-to-convert-lrtemplate-to-xmp/m-p/11806744
- O Lightroom Classic 7.3 (abril/2018) passou a converter `.lrtemplate` em `.xmp` **[M]**.
- **Não executar Lua.** Escrever um analisador do subconjunto literal: tabela, string, número, booleano. **[S]**
- Chaves PV2003/PV2010 não têm conversão pública para PV2012. O importador deve marcá-las como "legado, aproximado". **[S]**

## 3. Perfis: `.dcp` e `.xmp` com LUT embutida

Fonte: espelho do DNG SDK da Adobe (https://github.com/emmcb/adobe-dng-sdk/tree/master/dng_sdk/source). Não é o repositório oficial; os arquivos trazem o cabeçalho de licença Adobe. Especificação oficial: https://helpx.adobe.com/camera-raw/digital-negative.html **[M]**.

### 3.1 `.dcp` **[V]**

- Contêiner TIFF com número mágico `0x4352` ('CR') em vez de 42 (`dng_tag_values.h:540-543`).
- Tags (`dng_tag_codes.h`):

| Tag | Código |
| --- | --- |
| UniqueCameraModel | 50708 |
| ColorMatrix1 / 2 / 3 | 50721 / 50722 / 52531 |
| ForwardMatrix1 / 2 / 3 | 50964 / 50965 / 52532 |
| CalibrationIlluminant1 / 2 / 3 | 50778 / 50779 / 52529 |
| ProfileName | 50936 |
| ProfileHueSatMapDims | 50937 |
| ProfileHueSatMapData1 / 2 / 3 | 50938 / 50939 / 52537 |
| ProfileToneCurve | 50940 |
| ProfileEmbedPolicy | 50941 |
| ProfileCopyright | 50942 |
| ProfileLookTableDims / Data | 50981 / 50982 |
| ProfileHueSatMapEncoding / ProfileLookTableEncoding | 51107 / 51108 |
| BaselineExposureOffset | 51109 |
| DefaultBlackRender | 51110 |
| ProfileGainTableMap (DNG 1.6) | 52525 |
| RGBTables (DNG 1.6) | 52543 |
| ProfileGainTableMap2 | 52544 |
| ProfileDynamicRange | 52551 |
| ProfileGroupName | 52552 |

- HueSatMap e LookTable: grade HSV; cada nó tem três float32: deslocamento de matiz, escala de saturação, escala de valor (`dng_big_table.cpp:1838-1870`). Codificação 0 = linear, 1 = sRGB (`dng_tag_values.h:387-396`).
- Aplicadas em HSV sobre ProPhoto linear; HueSatMap antes da exposição, LookTable depois, ToneCurve por último **[M]** (especificação DNG).
- `ProfileEmbedPolicy`: 0 permite cópia, 1 embutir se usado, 2 nunca embutir, 3 sem restrições (`dng_tag_values.h:355-371`).
- Rampa de exposição de referência (`dng_render.cpp:975-996`): `white = 1/2^max(0, exposure)`, `black = Shadows · ShadowScale · Stage3Gain · 0.001`.
- Exposição negativa de referência (`dng_render.cpp:107-150`): linear `x·2^e` até 0,25 e quadrática acima, com `a = 16/9·(1 − 2^e)`, `b = 2^e − a/2`, `c = 1 − a − b`, preservando o branco. É a única matemática de exposição que a Adobe publica; não é PV2012.

### 3.2 Perfil `.xmp` (`PresetType="Look"`)

Verificado por código e por um teste numérico da prova **[V]**. Exemplo real: https://github.com/TingfengLuo/Camera-Profile-for-Fujifilm-Film-Simulation ("Astia.xmp").

- `crs:RGBTable="<MD5>"` aponta para o atributo `crs:Table_<MD5>="…texto…"` (`dng_big_table.cpp:1377-1379`). Opcionais observados: `crs:RGBTableAmount`, `crs:ToneMapStrength`, `crs:ConvertToGrayscale`, `crs:CameraProfile`.
- Texto em base85 com alfabeto próprio (`dng_big_table.cpp:1262-1271`):
  ``0-9 a-z A-Z . - : + = ^ ! / * ? ` ' | ( ) [ ] { } @ % $ #``
  Cinco dígitos formam um uint32 little-endian, com o primeiro caractere menos significativo. Grupos parciais rendem 1 a 3 bytes. O texto pode trazer entidades XML (`&amp;` etc.), que precisam ser desfeitas antes.
- Bytes decodificados: 4 bytes little-endian com o tamanho descomprimido, seguidos de um fluxo zlib (`dng_big_table.cpp:842-859`).
- O MD5 do fluxo descomprimido é o identificador. No teste: `69D40E90F90741D0F7FE8393083FF176`, igual ao atributo.
- Fluxo RGBTable, little-endian (`dng_big_table.cpp:2139-2290`):
  1. `type = 1`, `version = 1`, `dimensions` (1 ou 3), `divisions` (1D 2..4096; 3D 2..32), todos u32.
  2. `divisions^dims` amostras de 3×u16. Laço R externo, depois G, depois B. Cada valor é um **delta** somado, com estouro de 16 bits, à rampa neutra `nop[i] = (i·0xFFFF + divisions/2)/(divisions−1)`.
  3. `primaries` u32: 0 sRGB, 1 Adobe, 2 ProPhoto, 3 P3, 4 Rec2020.
  4. `gamma` u32: 0 linear, 1 sRGB, 2 = 1.8, 3 = 2.2, 4 Rec2020.
  5. `gamut` u32: 0 clip, 1 extend.
  6. `minAmount`, `maxAmount` f64, com mínimo em [0,1] e máximo ≥ 1.
  7. `flags` u32 opcional.
- Resultado do teste no "Astia.xmp": 218.490 caracteres → 174.792 bytes → 196.652 bytes; tipo 1, versão 1, 3D, 32³; primárias 3 (P3), gama 1 (sRGB), gamut 0; mínimo = máximo = 1.0.
- Fluxo LookTable em XMP (`crs:LookTable`, `dng_big_table.cpp:1820-1906`): `type = 0`, `version` 1 ou 2, divisões de matiz, saturação e valor (máx. 360/256/256, total ≤ 36·32·16), três float32 por nó, `encoding` u32; na versão 2, `minAmount` e `maxAmount` f64; `flags` opcional.

Projetos abertos que fazem isso:

- `mini-film` (Rust): RGBTable → Hald PNG. https://docs.rs/crate/mini-film/8.1.2/source/src/rgb_table.rs **[V]**
- `XMPconverter` (C++): `.cube` ⇄ `.xmp`. https://github.com/michelerenzullo/XMPconverter **[V]**. Em `XMPconverter.cpp:199-203` ele amarra primárias e gama: sRGB → gama sRGB; Adobe → 2.2; ProPhoto → 1.8; P3 → sRGB; Rec2020 → Rec2020.
- Pedido para a Adobe documentar o formato, ainda sem resposta oficial: https://community.adobe.com/feature-requests-564/p-document-the-format-of-rgb-luts-in-enhanced-profiles-666490

## 4. Capture One `.costyle` / `.copreset`

Amostras reais **[V]**:

- https://github.com/lolochristen/CaptureOne_FilmStyles ("Ilford HP5.costyle", `Engine="900"`)
- https://github.com/g-wilson/captureone-fuji ("xtrans4-ShadowMinusTwo.copreset", `Engine="1300"`)

```xml
<?xml version="1.0"?>
<SL Engine="900">
	<E K="BwEnabled" V="1" /> <E K="BwRed" V="2.5" /> <E K="BwYellow" V="-2.5" /> …
	<E K="Clarity" V="0" /> <E K="ClarityMethod" V="2" /> <E K="ClarityStructure" V="0" />
	<E K="ColorBalanceShadow" V="0.875;0.875;0.875" /> <E K="ColorBalanceMidtone" V="1.111;1.111;1.111" />
	<E K="ColorCorrections" V="1,1,2,2.3656,-15.974,0,174,139,97,0,25,-42.126,25.625,25,0,0,0,0" />
	<E K="Contrast" V="0" /> <E K="FilmGrainAmount" V="45" /> <E K="FilmGrainType" V="1" />
	<E K="GradationCurve" V="0,0.0392;1,1" /> <E K="GradationCurveRed" V="0,0;1,1" />
	<E K="GradationCurveY" V="0,0;0.2,0.2;0.4,0.3975;0.6,0.5965;0.8,0.7965;1,1" />
	<E K="HighlightRecovery" V="2.5" /> <E K="ShadowRecovery" V="8" />
	<E K="Name" V="Ilford HP5" /> <E K="StyleSource" V="Styles" />
	<E K="UsmAmount" V="10" /> <E K="UsmRadius" V="1" /> <E K="UUID" V="33AA32FE-…" />
</SL>
```

- Raiz `SL` com `Engine`; filhos `E` com `K` (chave) e `V` (valor). Vetores separados por `;`. Curvas em `x,y;x,y` na faixa 0..1 (`GradationCurve`, `…Red`, `…Green`, `…Blue`, `…Y`).
- `.copreset` tem a mesma estrutura, com as chaves de uma única ferramenta; `StyleSource` nomeia a ferramenta (observado `"Curve"`).
- Chaves observadas: `Bw*` (Enabled, Red, Yellow, Green, Cyan, Blue, Magenta, DarkHue, DarkSaturation, LightHue, LightSaturation), `Clarity`, `ClarityMethod`, `ClarityStructure`, `ColorBalanceShadow`, `ColorBalanceMidtone`, `ColorBalanceHighlight`, `ColorCorrections`, `Contrast`, `FilmGrainAmount`, `FilmGrainDensity`, `FilmGrainGranularity`, `FilmGrainType`, `Highlight`, `Midtone`, `TargetHighlight` (níveis, 4 valores), `HighlightRecovery`, `ShadowRecovery`, `UsmAmount`, `UsmRadius`.
- Formato sem documentação pública:
  - `ColorBalance*` parece um trio de multiplicadores RGB (1;1;1 neutro) **[S]**. Há pergunta sem resposta oficial em https://support.captureone.com/hc/de/community/posts/19721425771677-ColorBalanceShadow-value-in-costyle-file
  - `ColorCorrections` (editor de cor avançado) é uma lista opaca.
  - `Exposure`, `Brightness`, `Saturation`, `FilmCurve`, `ICCProfile` existem **[M]**; não apareceram nas amostras.
- Recomendação **[S]**: fase 1 importa curvas, P&B, grão, nitidez, contraste, claridade e recuperação de altas e sombras. `ColorCorrections` e `ColorBalance` ficam como "não convertido", avisando a pessoa.
- Referência comercial: Picture Instruments Preset Converter (Lightroom → Capture One), com limites declarados: https://picture-instruments.com/products/17_preset_converter/Preset_Converter_Manual.pdf

## 5. LUT como "preset": `.cube`, `.3dl`, Hald CLUT

- **`.cube`** (Adobe/Iridas/Resolve): `TITLE`, `LUT_1D_SIZE N` ou `LUT_3D_SIZE N`, `DOMAIN_MIN`/`DOMAIN_MAX` (padrão 0 e 1), depois N ou N³ linhas `r g b` em ponto flutuante. O vermelho varia mais rápido **[V]** ([`products/finishing/src/cor/cube.js:1-21`](../../../finishing/src/cor/cube.js); colour-science https://colour.readthedocs.io/en/develop/_modules/colour/io/luts/iridas_cube.html). O Resolve ignora `DOMAIN_*` (ticket do FFmpeg https://fftrac-bg.ffmpeg.org/ticket/10431). O dialeto do Resolve usa `LUT_3D_INPUT_RANGE` **[M]**.
- **`.3dl`** (Autodesk/Lustre) **[M]**: a primeira linha útil traz os pontos da malha (ex.: `0 64 128 … 1023`); depois vêm triplas **inteiras** (10 ou 12 bits conforme o dialeto), com o **azul variando mais rápido**, ao contrário do `.cube`. O leitor precisa detectar a profundidade pelo valor máximo.
- **Hald CLUT** **[V]** (https://www.quelsolaar.com/technology/clut.html): PNG quadrado de lado N³ (nível N; nível 8 = 512×512; nível 16 = 4096×4096), com N² valores por canal. Vermelho na largura, verde na altura, azul na profundidade. Identidade: `valor = índice/(N²−1)`.
- O RawTherapee usa Hald CLUT em "Film Simulation", assumindo imagem em sRGB **[M]**; https://rawpedia.rawtherapee.com/Film_Simulation deu 404 no fetch.
- Diferença para o motor **[S]**:
  - LUT não é paramétrica e supõe uma codificação de entrada que **o arquivo não declara** (sRGB/Rec.709 em LUT de foto; log em LUT de vídeo). A importação tem de perguntar ou inferir, e guardar.
  - Entra como camada "look" depois do mapa de tons, na codificação declarada, com interpolação tetraédrica (`cube.js:92`) e intensidade `out = in + a·(LUT(in) − in)`.
  - Para virar ajuste editável: eixo neutro → curvas por canal; resíduo → HSL. `products/finishing/src/cor/lightroom.js:50-80` já faz isso; o resíduo fica como LUT de diferença.

## 6. Matemática do PV2012+ e projetos que leem XMP do Lightroom

### 6.1 O que a Adobe publica e o que não publica

- **Não há fórmula pública** de Exposure2012, Contrast2012, Highlights/Shadows2012, Whites/Blacks2012, Clarity, Texture, Dehaze, Vibrance ou HSL. As buscas só acharam descrições qualitativas.
- **Publicado [V]**: conversão Temperature/Tint ↔ xy no DNG SDK (`dng_temperature.cpp`): método de Robertson com 31 isotermas em CIE 1960 uv; `tint = distância perpendicular ao locus em uv × (−3000)` (`kTintScale`, linha 18); temperatura interpolada em mired. A ida (`Get_xy_coord`) e a volta estão no arquivo e podem ser portadas.
- Também publicado **[V]**: toda a matemática de DCP e das tabelas (seção 3) e a rampa de exposição de referência.
- Comportamento qualitativo do PV2012 (relatos de fórum, de segunda mão; o texto original de quem desenhou o processo na Adobe não foi encontrado):
  - Brightness foi removido e Exposure passou a se parecer com o Brightness do PV2010, com as altas "rolando" em vez de cortar.
  - Highlights e Shadows são adaptativos à imagem: a **faixa** depende do conteúdo.
  - Whites e Blacks correspondem a mover os pontos de corte da curva.
  - Fontes: https://community.adobe.com/t5/lightroom-classic-discussions/why-quot-0-quot-should-be-zero/m-p/4044145 , https://community.adobe.com/t5/lightroom-classic-discussions/tone-curve-vs-basic-panel-lr-4-2/m-p/4497468 , https://blog.kasson.com/z9/lightroom-highlight-recovery
- Filtro Laplaciano local (artigo do SIGGRAPH 2011; https://people.csail.mit.edu/sparis/publi/2011/siggraph): pelo resumo de busca, slides do artigo seguinte (2014) dizem que o método está no Lightroom/Photoshop, **sem dizer em quais controles**. Os PDFs não abriram (limite de tamanho). Tratar "Clarity/Highlights/Shadows usam Laplaciano local" como hipótese plausível, não como fato.
- Vibrance: medição empírica em https://www.photo-mark.com/notes/analyzing-photoshop-vibrance-and-saturation/ . Aumenta mais as cores pouco saturadas; azuis e verdes sobem mais que tons de pele. Sem fórmula.

### 6.2 darktable (`src/develop/lightroom.c`, master) **[V]**

Código: https://github.com/darktable-org/darktable/blob/master/src/develop/lightroom.c . Manual: https://docs.darktable.org/usermanual/stable/en/overview/sidecar-files/sidecar-import/

| Lightroom | darktable | Mapeamento |
| --- | --- | --- |
| `Exposure2012` | exposure | valor direto em EV (`:889-897`) |
| `Blacks2012` | nível de preto do exposure | tabela interpolada: −100→+0,020; −50→+0,005; 0→0; +50→−0,005; +100→−0,010 (`:371-377`) |
| `Clarity2012` | local contrast | ±100 → ±0,65 linear (`:434-439`) |
| `ToneCurvePV2012` | tone curve | pontos `x/255, y/255`, spline cúbica (`:1325-1341`, `:2003-2006`); as curvas por canal R/G/B **não** são lidas |
| `Parametric*` + splits | tone curve | modelo do RawTherapee (`DCT_Parametric`, `rtengine/diagonalcurves.cc`), código em `:442-494`; a curva de pontos vai **por cima** da paramétrica (`:2022-2036`) |
| HSL | color zones | saturação `0,5 + v/200`; matiz `0,5 + (3/9)·v/200`; luminância `0,5 + (4/9)·v/200` (`:849-850`, `:972-1114`); 8 nós igualmente espaçados em matiz |
| Split toning | split-toning | matiz `v/360`; saturação `0,7·v/100`; balanço `(0,5 − v/200)^1,5` (`:423-432`, `:1116-1144`) |
| Grão | grain | Amount {0→0, 25→20, 50→40, 100→80}; Frequency {0→100, 50→100, 75→400, 100→800}/53,3 (`:405-417`) |
| Vinheta pós-corte | vignetting | ganho: se a<0, `(1+a/100)^2,5 − 1`; senão `0,74·a/100`; queda {0→5, 50→75,5, 100→82}; centro {0→99,5, 50→92,2, 100→106,9} `+ 0,576·(midpoint−50) − queda/2` (`:382-403`, `:1932-1935`) |

- O darktable **ignora** Contrast2012, Highlights2012, Shadows2012, Whites2012, Texture, Dehaze, Vibrance, Saturation, Temperature/Tint, nitidez, ruído, ColorGrade\*, calibração e Look. Conclusão a partir da lista de chaves tratadas em `:854-1341`.
- O manual avisa que o resultado não bate com o Lightroom.

### 6.3 Outros projetos

- **RawTherapee**: não importa XMP do Lightroom **[M]**. Serve de referência para a curva paramétrica (citada pelo darktable), para a aplicação de DCP e para Hald CLUT.
- **"lr2dt"**: não existe projeto com esse nome. `lr2dt_*` é o prefixo das funções de conversão dentro do `lightroom.c` do darktable **[V]**.
- **XMP → LUT**: `XMPconverter` e `mini-film` (seção 3.2) extraem a LUT **embutida** em perfis. Não existe "assar" um preset de sliders em LUT sem o motor da Adobe; Highlights, Shadows e Clarity são locais e não cabem em LUT. **[S]**
- **rawpy / colour-science** **[M]**: rawpy (LibRaw) não lê presets. O colour-science tem leitura e escrita de LUT (`colour.read_LUT`: `.cube`, `.spi1d`, `.spi3d`, `.csp`) e conversões CCT↔uv (Robertson 1968, Ohno 2013), úteis como oráculo de teste.
- Fórum do darktable confirmando que conversão direta de preset não existe: https://discuss.pixls.us/t/how-do-i-change-the-xmp-standard-data-in-the-lightroom-to-the-style-standard-in-the-dark-table/32110

## 7. Aspectos legais (não é parecer jurídico; validar com advogado)

- **Formato**:
  - XMP é ISO 16684-1, com licença pública de patentes da Adobe; o XMP Toolkit SDK é BSD (resumo de busca; https://www.adobe.com/devnet/xmp.html).
  - A especificação DNG tem licença de patente para quem lê ou escreve DNG, revogável se o licenciado processar a Adobe (https://open.windriver.com/info/uni-license-list/licenses/adobe-dng-spec-patent.html). Algumas versões pedem o aviso "This product includes DNG technology under license by Adobe".
  - O DNG SDK tem licença própria: portar trechos exige ler a licença que acompanha o SDK. **[S]**: implementar a partir da especificação e do comportamento, sem copiar código.
- **Conteúdo do preset**:
  - A proteção autoral de "valores de slider" é discutida e tende a ser fraca; pacotes pagos vêm com EULA que costuma proibir redistribuição e revenda, não o uso pelo comprador (fontes fracas, só blogs e fóruns; https://digital-photography-school.com/a-new-type-of-theft-can-post-production-settings-be-owned/).
  - Perfis com LUT embutida são mais próximos de obra ou base de dados criativa. **[S]**
  - No Brasil **[M]**: Lei 9.610/98 art. 8º (métodos e sistemas não são protegidos) e Lei 9.609/98 art. 6º (semelhança funcional e integração).
- **Recomendações de produto [S]**:
  1. Preset importado fica **privado** à conta ou organização (RLS). Não entra em biblioteca pública, loja ou link de cliente como arquivo baixável. Compartilhar só o que a pessoa criou na plataforma.
  2. Preservar `crs:Copyright`, `crs:ContactInfo`, `Name`, `Group` e `ProfileCopyright`. Respeitar `ProfileEmbedPolicy` do DCP.
  3. Termo de uso: a pessoa declara ter direito de uso do arquivo. Ter canal de retirada.
  4. Nunca distribuir presets ou perfis da Adobe (Adobe Color, Camera Matching etc.; o exemplo real traz `crs:Copyright="© 2018 Adobe Systems, Inc."`). `Look` com `Stubbed="true"` vira o perfil base próprio, com aviso claro.
  5. Marca: as diretrizes da Adobe permitem "compatível com" ou "para uso com" se for verdade; proíbem marca Adobe no nome do produto e abreviar para "Lightroom" (https://www.adobe.com/legal/permissions/trademarks.html ; https://developer.adobe.com/lightroom/lightroom-api-docs/getting-started/branding-guidelines/). Texto sugerido: "Importa presets do Adobe Lightroom (.xmp, .lrtemplate)". Sem logo da Adobe.
  6. Não prometer resultado idêntico: mostrar relatório por chave (convertido / aproximado / ignorado). Bate com "Não fingir integração" do [CLAUDE.md](../../../../CLAUDE.md) da raiz.
  7. O repositório é público: **não versionar presets de terceiros como fixture**; gerar fixtures sintéticas. Um sidecar de foto (não preset) pode trazer GPS, número de série e regiões de rosto: descartar tudo que não seja `crs:` de revelação ao importar.
  8. Calibrar constantes comparando com renders do Lightroom licenciado é caixa-preta; a compatibilidade com os termos de uso da Adobe precisa de checagem jurídica.

## 8. Tabela: chave `crs` → nosso controle → fórmula sugerida

Os nomes de parâmetro abaixo são a proposta do estudo **[S]**; a lista que vale no produto é `CONTROLES`, em [`src/motor/ajustes.js`](../../src/motor/ajustes.js). Classes: **A** = dado exato; **B** = global aproximado (calibrar constante `k`); **C** = local ou adaptativo (aproximação).

Premissas **[S]**: motor em linear de cena, `p = 0,18` (cinza médio); as etapas perceptuais usam OKLCh ([`products/finishing/src/cor/oklab.js`](../../../finishing/src/cor/oklab.js)).

| Chave `crs` | Parâmetro | Fórmula sugerida | Classe |
| --- | --- | --- | --- |
| `WhiteBalance` | `wb.modo` | `As Shot` → neutro da câmera; `Auto` → AWB próprio; `Custom` → T/Tint | A |
| `Temperature`, `Tint` | `wb.temperatura_k`, `wb.tinta` | xy por Robertson (porta de `dng_temperature.cpp`, tint/−3000 em uv); ganhos = inverso do neutro da câmera para esse xy | A (fórmula **[V]**) |
| `IncrementalTemperature`, `IncrementalTint` | `wb.delta_t`, `wb.delta_tinta` | `mired' = mired_ref − k_T·v`; `tint' = tint_ref + k_t·v`, aplicados por adaptação cromática em imagem já renderizada | B |
| `Exposure2012` | `tom.exposicao_ev` | `L' = L·2^v` antes do ombro do mapa de tons (o darktable usa o valor direto) | B |
| `Contrast2012` | `tom.contraste` | em log: `L' = p·(L/p)^(1 + k_c·v/100)` para v>0; expoente `1/(1 + k_c·\|v\|/100)` para v<0 | B |
| `Highlights2012` | `tom.altas` | `B` = log2 L com filtro que preserva borda (raio ≈ 2–4% do lado maior); `w_h = smoothstep(log2 p − 0,5; log2 p + 3; B)`; `L' = L·2^(k_h·v/100·w_h)`; com v<0, reconstruir canais estourados usando a folga do RAW | C |
| `Shadows2012` | `tom.sombras` | `w_s = 1 − smoothstep(log2 p − 4; log2 p + 0,5; B)`; `L' = L·2^(k_s·v/100·w_s)` | C |
| `Whites2012` | `tom.brancos` | ponto branco: `L' = L·(1 + (2^(k_w·v/100) − 1)·smoothstep(p; 1; L))` | B |
| `Blacks2012` | `tom.pretos` | `b` = tabela do darktable (−100→+0,020 … +100→−0,010); `L' = (L − b)/(1 − b)` | B (ponto de partida **[V]**) |
| `Texture` | `presenca.textura` | banda de frequência média-alta (σ ≈ 2–8 px a 100%) com ganho `1 + k_t·v/100`, só luminância | C |
| `Clarity2012` | `presenca.claridade` | contraste local de raio grande (σ ≈ 1–2% do lado maior), ponderado nos meios-tons, só luminância; partida ±100 → ±0,65 | C |
| `Dehaze` | `presenca.neblina` | dark channel prior: `J = (I − A)/max(t^(k_d·v/100), t0) + A` | C |
| `Vibrance` | `cor.vibracao` | `C' = C·(1 + v/100·(1 − C/Cmax)^γ·w_pele(h))`, γ ≈ 1–2, `w_pele` < 1 na faixa laranja | B |
| `Saturation` | `cor.saturacao` | `C' = C·(1 + v/100)` (−100 = P&B; +100 = dobro **[M]**) | B |
| `Parametric*` + `Parametric*Split` | `curva.parametrica` | modelo do `lightroom.c:442-494` (regiões em 0..1, gamas que levam cada divisor a 0,5) | A (modelo de terceiros) |
| `ToneCurvePV2012` (+Red/Green/Blue) | `curva.pontos.{rgb,r,g,b}` | `[x/255, y/255]`, spline monotônica, no domínio com gama de exibição; paramétrica primeiro, pontos depois | A |
| `CurveRefineSaturation` | `curva.saturacao` | 100 = curva RGB pura; 0 = curva só na luminância; interpolar | B **[S]** |
| `Hue/Saturation/LuminanceAdjustment<Cor>` | `hsl.<faixa>.{matiz,saturacao,luz}` | pesos `w_i(h)` em cosseno levantado entre centros vizinhos (`lightroom.js:10-19`); `h' = h + Σ w_i·(v_i/100)·30°`; `C' = C·(1 + Σ w_i·s_i/100)`; `L' = L + Σ w_i·(l_i/100)·0,3·C/Cmax` | B |
| `ConvertToGrayscale` / `Treatment`, `GrayMixer<Cor>` | `pb.ativo`, `pb.mix.<faixa>` | `Y' = Y·2^(k_g·Σ w_i(h)·g_i/100·C/Cmax)`, depois C = 0 | B |
| `SplitToningShadowHue/Saturation`, `SplitToningHighlightHue/Saturation`, `ColorGradeMidtoneHue/Sat`, `ColorGradeGlobalHue/Sat` | `grade.{sombras,meios,altas,global}.{matiz,sat}` | máscaras por luminância perceptual `m_r(L; mistura, balanço)`; `ab' = ab + Σ m_r·k_s·(sat_r/100)·(cos h_r, sin h_r)`; partida do darktable: sat ×0,7 | B |
| `ColorGrade{Shadow,Midtone,Highlight,Global}Lum` | `grade.*.luz` | `L' = L·2^(k_l·Σ m_r·lum_r/100)` | B |
| `ColorGradeBlending`, `SplitToningBalance` | `grade.mistura`, `grade.balanco` | mistura = largura da sobreposição das máscaras (50 padrão); balanço desloca o cruzamento; partida `(0,5 − v/200)^1,5` | B |
| `Sharpness`, `SharpenRadius`, `SharpenDetail`, `SharpenEdgeMasking` | `nitidez.{quantidade,raio,detalhe,mascara}` | `Y' = Y + k_a·(S/150)·(Y − G_σ∗Y)·M`; σ = raio; detalhe mistura deconvolução e supressão de halo; `M` = limiar do gradiente proporcional à máscara | C |
| `LuminanceSmoothing`, `LuminanceNoiseReductionDetail`, `LuminanceNoiseReductionContrast`, `ColorNoiseReduction`, `ColorNoiseReductionDetail`, `ColorNoiseReductionSmoothness` | `ruido.{luz,detalhe,contraste,cor,cor_detalhe,cor_suavidade}` | força do redutor próprio = `v/100` por curva calibrada por ISO | C |
| `GrainAmount`, `GrainSize`, `GrainFrequency`, `GrainSeed` | `grao.{quantidade,tamanho,aspereza,semente}` | ruído filtrado em luminância; partida nas tabelas do darktable | B |
| `PostCropVignetteAmount`, `Midpoint`, `Feather`, `Roundness`, `Style`, `HighlightContrast` | `vinheta.*` | ganho radial; a<0: `(1+a/100)^2,5`; a>0: `1 + 0,74·a/100`; queda e centro pelas tabelas do darktable; Style 1 protege altas, 2 preserva matiz, 3 mistura com preto ou branco | B |
| `VignetteAmount`, `VignetteMidpoint`, `LensProfileEnable`, `AutoLateralCA`, `Defringe*` | `lente.*` | só sinalizadores; a correção vem do perfil de lente próprio | A |
| `ShadowTint`, `RedHue`, `RedSaturation`, `GreenHue`, `GreenSaturation`, `BlueHue`, `BlueSaturation` | `calibracao.*` | girar e escalar cada primária do espaço de trabalho em torno do branco (`Δh = k_h·v/100`, `s = 1 + k_s·v/100`) e refazer a matriz 3×3; `ShadowTint` = deslocamento verde–magenta nas sombras | B |
| `CameraProfile`, `CameraProfileDigest` | `perfil.base` | tabela nome → perfil próprio; desconhecido → perfil padrão + aviso | A (mapa) |
| `Look` (Name, UUID, Amount, Parameters, Stubbed) | `look.{id,quantidade}` + parâmetros aninhados | aplicar `Parameters` antes do preset; `Stubbed` → procurar na biblioteca da pessoa, senão usar o perfil base e avisar | A/B |
| `RGBTable` + `Table_<MD5>`, `RGBTableAmount` | `look.lut3d` | decodificar (seção 3.2); `out = in + a·(LUT(in) − in)` nas primárias e gama declaradas, tetraédrica | A |
| `LookTable` | `look.hsv` | deltas HSV (matiz em graus, escalas de saturação e valor) em ProPhoto linear, interpolação trilinear com matiz circular | A |
| `ToneMapStrength` | `look.mapa_tons` | 0/1/2 = normal/médio/alto (visto no `XMPconverter.cpp:520-521`) | B |
| `SupportsAmount` + intensidade | `meta.intensidade` | `param = neutro + a·(valor − neutro)`, a ∈ [0, 2]; curvas e LUT interpolam com a identidade | B **[M]** |
| `PresetType`, `Name`, `Group`, `Cluster`, `UUID`, `Copyright`, `ContactInfo`, `CameraModelRestriction`, `Supports*`, `Version`, `ProcessVersion`, `HasSettings` | `meta.*` | cópia; `Group` vira pasta da biblioteca; `ProcessVersion` < "6.7" liga o caminho legado | A |
| Legado `Exposure`, `Brightness`, `Contrast`, `Shadows`, `FillLight`, `HighlightRecovery`, `Clarity`, `ToneCurve` | os mesmos de cima | `altas ≈ −HighlightRecovery`; `sombras ≈ +FillLight`; `exposicao ≈ Exposure + k·(Brightness − 50)`; `pretos ≈ −k·(Shadows − 5)`; `contraste ≈ k·(Contrast − 25)` | B, marcado "legado" |
| Máscaras e correções locais | — | fase 1: não importar; registrar no relatório | — |

Como obter as constantes `k` **[S]**: renderizar no Lightroom (licença do titular) alvos sintéticos (rampa de cinza em EV, cartela de matiz × saturação, cena com alto contraste local) para cada slider em −100, −50, −25, +25, +50, +100; ajustar cada `k` por mínimos quadrados em ΔE (OKLab); versionar a tabela por `ProcessVersion`.

## 9. Casos de teste

**Leitura e robustez**

1. XMP com chaves como atributos e como elementos gera o mesmo resultado.
2. Valores com `+`, decimais, `True`/`true`, `"1"`/`"0"`; atributo vazio (`crs:Name=""`); `rdf:Alt` vazio.
3. Preset parcial (só HSL): os demais parâmetros ficam "ausente", não zero. Aplicado sobre uma foto já ajustada, não zera a exposição.
4. `PresetType="Look"` não entra como preset; `type ≠ "Develop"` em `.lrtemplate` é recusado com mensagem clara.
5. XML malicioso (DOCTYPE, entidade externa, bomba de entidades, arquivo > N MB, `Table_` com tamanho declarado gigante) é recusado sem estourar memória. O limite de descompressão segue o do SDK (3D ≤ 32³).
6. `.lrtemplate`: analisador não executa código; arquivo com `os.execute(...)` ou função é recusado; a curva plana `{0,0,32,22,…}` vira pares; `ToneCurvePV2012` ausente cai para `ToneCurve`.
7. Chaves desconhecidas vão para o relatório "ignorado"; UTF-8 em `Group` (ex.: `ユーザープリセット`) é preservado.

**Tabelas e LUT**

8. Decodificar a RGBTable de fixture sintética: tamanho declarado = descomprimido; MD5 = identificador; cabeçalho 1/1/3/N.
9. Ida e volta: tabela identidade codificada tem todos os deltas zero e decodifica para a rampa `nop`; os cantos (0,0,0) e (N−1,N−1,N−1) dão 0 e 1.
10. Ordem dos eixos: tabela que só altera o vermelho aparece no eixo R (laço R externo).
11. Base85: grupos parciais de 2, 3 e 4 caracteres; espaços e quebras de linha no meio; entidades XML no texto.
12. LookTable versões 1 e 2 (com e sem `min/maxAmount`); `encoding` inválido é rejeitado.
13. `.cube` 1D e 3D, com e sem `DOMAIN_*`, com comentários e `TITLE`; `.3dl` com azul rápido dá o mesmo resultado que o `.cube` equivalente; Hald nível 8 identidade → LUT identidade (erro < 1/65535).
14. `.dcp`: mágico `IIRC`; profile com 1, 2 e 3 iluminantes; `ProfileEmbedPolicy = 2` impede exportar o perfil.

**Matemática determinística**

15. Temperature/Tint → xy → Temperature/Tint com erro < 1 K e < 0,1 de tint em 2000–50000 K; conferir alguns pontos com o colour-science (Robertson).
16. Curva paramétrica: todos os valores em 0 → identidade; monotônica para qualquer combinação em ±100; contínua nos divisores; bate com os valores de referência do `lightroom.c` em 16 pontos.
17. Curva de pontos: `0,0 / 255,255` → identidade; `0,14 … 255,249` (exemplo real) não passa de [0,1]; nenhum sobressalto com pontos muito próximos.
18. HSL: os pesos somam 1 em qualquer matiz; cinza (C = 0) não muda com nenhum slider de HSL nem de vibração; `Saturation = −100` gera R = G = B.
19. Color Grading: tudo em zero → identidade; só sombras com sat > 0 não altera L ≥ limite alto (ΔE < 0,5); `Blending` 0 vs 100 muda a sobreposição.
20. Intensidade: `a = 0` → identidade; `a = 1` → preset; `a = 2` → o dobro do delta, com limites respeitados.
21. Exposição: `Exposure2012 = +1` dobra o valor linear abaixo do ombro; nenhum valor de saída acima do branco; rampa permanece monotônica com Highlights = −100 e Shadows = +100 ao mesmo tempo.
22. Blacks/Whites: pontos de corte nos valores da tabela; sem valores negativos depois do corte.

**Comparação visual (imagem de referência)**

23. Para cada controle classe B/C, render próprio vs. render do Lightroom do mesmo RAW/DNG sintético: ΔE2000 médio e percentil 95 dentro do limite definido por controle; o relatório registra o valor, não "igual".
24. Presets reais do titular (os que ele usa hoje): comparação lado a lado com nota de fidelidade por foto; regressão guardada por hash do render.
25. Preset com `Look` `Stubbed` e sem perfil na biblioteca: aplica com perfil base e mostra o aviso; com o perfil importado depois, o resultado muda e o aviso some.

**Produto e segurança**

26. Preset importado só aparece para a organização que importou (teste de isolamento RLS); o link do cliente não expõe o arquivo original.
27. Importar sidecar de foto com GPS, rosto e número de série: nada disso é gravado.
28. Exportar preset próprio como `.xmp` e reimportar: mesmos parâmetros (ida e volta do próprio formato).
29. Lote de 500 presets: tempo e memória dentro do limite; arquivos repetidos (mesmo `UUID` ou mesmo hash) viram uma entrada só.
