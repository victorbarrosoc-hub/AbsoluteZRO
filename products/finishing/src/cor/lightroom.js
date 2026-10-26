// Revela · preset para Lightroom (.xmp). O Lightroom não aplica LUT 3D em preset, então o look vira o que um preset
// guarda: curvas por canal (tom e tinta dos neutros) e o painel HSL (matiz, saturação e luz de cada uma das oito
// faixas). É uma aproximação do look; a LUT continua sendo a versão exata, para vídeo.
//
// Leitura do look:
//   - curvas: uma rampa de cinza passa pelo look; o que sai em cada canal é a curva daquele canal;
//   - HSL: para cada faixa do Lightroom, uma cor média daquela matiz passa pelo look e pelas curvas; a diferença que
//     sobra (matiz que girou, saturação que mudou, luz que mudou) vira o controle da faixa.

const FAIXAS = [
  ['Red', 0],
  ['Orange', 30],
  ['Yellow', 60],
  ['Green', 120],
  ['Aqua', 180],
  ['Blue', 240],
  ['Purple', 270],
  ['Magenta', 300],
]
// quanto do controle do Lightroom corresponde a cada unidade medida (aproximação do comportamento do painel HSL)
const GRAUS_POR_100 = 30
const LUZ_POR_100 = 0.3

const limitar = (v, a, b) => Math.min(b, Math.max(a, v))
const inteiro = (v) => Math.round(limitar(v, -100, 100))

function hsvParaRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return [f(5), f(3), f(1)]
}
function rgbParaHsl([r, g, b]) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d < 1e-6) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}
const giro = (a, b) => ((b - a + 540) % 360) - 180

/** Lê o look (`aplicar(r, g, b) → [r, g, b]` em código 0–1) como curvas por canal e HSL do Lightroom. */
export function lerParaLightroom(aplicar) {
  const PONTOS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
  const curvas = [[], [], []]
  for (const v of PONTOS) {
    const o = aplicar(v, v, v)
    for (let c = 0; c < 3; c++) curvas[c].push([Math.round(v * 255), Math.round(limitar(o[c], 0, 1) * 255)])
  }
  // curva de um canal, interpolada entre os pontos lidos
  const naCurva = (c, x) => {
    const p = curvas[c]
    const X = x * 255
    for (let i = 1; i < p.length; i++)
      if (X <= p[i][0]) {
        const t = (X - p[i - 1][0]) / (p[i][0] - p[i - 1][0])
        return (p[i - 1][1] + t * (p[i][1] - p[i - 1][1])) / 255
      }
    return p[p.length - 1][1] / 255
  }
  const hsl = {}
  for (const [nome, h] of FAIXAS) {
    const cor = hsvParaRgb(h, 0.6, 0.72)
    const previsto = rgbParaHsl(cor.map((v, c) => naCurva(c, v)))
    const alvo = rgbParaHsl(aplicar(...cor))
    hsl[nome] = {
      matiz: inteiro((giro(previsto[0], alvo[0]) / GRAUS_POR_100) * 100),
      saturacao: inteiro((alvo[1] / Math.max(previsto[1], 1e-3) - 1) * 100),
      luz: inteiro(((alvo[2] - previsto[2]) / LUZ_POR_100) * 100),
    }
  }
  return { curvas, hsl }
}

const xml = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c])
const uuid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`).replace(/-/g, '').toUpperCase()

/** Texto do preset .xmp (Lightroom Classic e Lightroom do celular/computador). */
export function presetLightroom(aplicar, nome = 'Revela') {
  const { curvas, hsl } = lerParaLightroom(aplicar)
  const seq = (pontos) => pontos.map(([x, y]) => `      <rdf:li>${x}, ${y}</rdf:li>`).join('\n')
  const atributos = FAIXAS.flatMap(([f]) => [
    `   crs:HueAdjustment${f}="${hsl[f].matiz}"`,
    `   crs:SaturationAdjustment${f}="${hsl[f].saturacao}"`,
    `   crs:LuminanceAdjustment${f}="${hsl[f].luz}"`,
  ]).join('\n')
  const curva = (tag, pontos) => `   <crs:${tag}>\n    <rdf:Seq>\n${seq(pontos)}\n    </rdf:Seq>\n   </crs:${tag}>`
  return `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Revela">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   crs:PresetType="Normal"
   crs:UUID="${uuid()}"
   crs:SupportsAmount="True"
   crs:SupportsAmount2="True"
   crs:SupportsColor="True"
   crs:SupportsMonochrome="False"
   crs:SupportsHighDynamicRange="True"
   crs:SupportsNormalDynamicRange="True"
   crs:SupportsSceneReferred="True"
   crs:SupportsOutputReferred="True"
   crs:Version="15.0"
   crs:ProcessVersion="11.0"
   crs:ToneCurveName2012="Custom"
${atributos}
   crs:HasSettings="True">
   <crs:Name>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${xml(nome)}</rdf:li>
    </rdf:Alt>
   </crs:Name>
   <crs:Group>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">Revela</rdf:li>
    </rdf:Alt>
   </crs:Group>
${curva('ToneCurvePV2012', [
  [0, 0],
  [255, 255],
])}
${curva('ToneCurvePV2012Red', curvas[0])}
${curva('ToneCurvePV2012Green', curvas[1])}
${curva('ToneCurvePV2012Blue', curvas[2])}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
`
}
