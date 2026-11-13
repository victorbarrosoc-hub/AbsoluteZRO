// Exportar a nossa predefinição como .xmp que o Lightroom e o Camera Raw abrem (Predefinições > Importar).
//
// É a tabela de lightroom-ler.js ao contrário, controle a controle, e por isso é tão aproximada quanto a importação: os
// nossos controles de luz são fixos em EV em torno do cinza e os da Adobe se adaptam à foto (lightroom-ler.js, cabeçalho).
// O que é 1:1 lá também é 1:1 aqui; onde a ida passou por uma conta, a volta inverte a MESMA conta:
//
//   luz.pretos + luz.sombras → Blacks2012 + Shadows2012   pela tabela BLACKS invertida: acha o Blacks2012 cujo `pretos`
//                                                         é o nosso e põe em Shadows2012 o que sobrou das sombras
//   misturador.matiz         → HueAdjustment<Cor>        o inteiro de −100 a 100 cuja ida (`matizDoMisturador`) chega
//                                                         mais perto do nosso valor
//   efeitos.vinheta          → PostCropVignetteAmount    a inversa do ganho de canto (`vinhetaEmEv`)
//
// Exportar e importar de novo devolve os mesmos controles (o teste trava a ida e volta, test/estilo-lightroom.test.js).
//
// O que NÃO cabe num .xmp de predefinição sai em `deFora`, com a razão:
//   - o look (LUT 3D): no Lightroom LUT só entra como PERFIL com tabela binária própria; quem quer usar fora exporta a
//     .cube (look.js `assar` + cube.js)
//   - desbotar e a tela (contraste da tela, preservar matiz, margens): não há slider da Adobe que faça o mesmo
//   - a curva paramétrica sai com os divisores no padrão (25/50/75), que são os nossos
//
// Formato do arquivo (docs/estudo/predefinicoes.md, 1.1): x:xmpmeta > rdf:RDF > rdf:Description com as chaves `crs:` como
// atributos, números com sinal explícito, curvas em rdf:Seq de "x, y" (0–255) e o nome em rdf:Alt. ProcessVersion 11.0
// (processo 2012+, o que as chaves usadas pedem). Não escrevemos `crs:Version` (é a versão do Camera Raw que gravou; não
// fomos nós).

import { FAIXAS, normalizar } from '../motor/ajustes.js'
import { BLACKS, FAIXAS_LR, matizDoMisturador } from './lightroom-ler.js'
import { LOCAL } from '../motor/local.js'
import { TIPO, hashDe } from './predefinicao.js'

const limitar = (v, a, b) => (v < a ? a : v > b ? b : v)

function escaparXml(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
}

// Como a Adobe escreve: inteiro com sinal ("+18", "-34", "0"); decimal com casas fixas.
const comSinal = (v) => (v > 0 ? `+${v}` : `${v}`)
const inteiro = (v) => comSinal(Math.round(v))
const decimal = (v, casas) => {
  const t = v.toFixed(casas)
  return v > 0 ? `+${t}` : Number(t) === 0 ? (0).toFixed(casas) : t
}

function interpolarTabela(tabela, v) {
  const x = limitar(v, tabela[0][0], tabela[tabela.length - 1][0])
  for (let k = 1; k < tabela.length; k++) {
    if (x <= tabela[k][0]) {
      const t = (x - tabela[k - 1][0]) / (tabela[k][0] - tabela[k - 1][0])
      return tabela[k - 1].slice(1).map((a, j) => a + (tabela[k][j + 1] - a) * t)
    }
  }
  return tabela[tabela.length - 1].slice(1)
}

/**
 * A inversa da tabela BLACKS: (pretos, sombras) nossos → { blacks, shadows } da Adobe. Varre os inteiros de −100 a 100
 * e fica com o Blacks2012 cujo `pretos` é o mais perto do nosso; no empate (a tabela satura em ±100), o que deixa o
 * Shadows2012 menor. `resto` diz quanto das sombras não coube nos ±100 do Shadows2012.
 */
export function pretosParaAdobe(pretos, sombras) {
  let melhor = null
  for (let b = -100; b <= 100; b++) {
    const [p, s] = interpolarTabela(BLACKS, b)
    const sh = sombras - s
    const custo = (p - pretos) ** 2 + 1e-3 * Math.max(0, Math.abs(sh) - 100) ** 2 + 1e-6 * sh * sh + 1e-9 * b * b
    if (!melhor || custo < melhor.custo) melhor = { custo, blacks: b, shadows: sh }
  }
  const shadows = Math.round(limitar(melhor.shadows, -100, 100))
  return { blacks: melhor.blacks, shadows, resto: Math.round(melhor.shadows - shadows) }
}

/** A inversa de `matizDoMisturador`: o HueAdjustment (−100..100) que, importado, dá o nosso `misturador.matiz`. */
export function matizParaAdobe(indice, nosso) {
  if (!nosso) return 0
  let melhor = 0
  let erro = Infinity
  for (let v = -100; v <= 100; v++) {
    const e = Math.abs(matizDoMisturador(indice, v) - nosso)
    if (e < erro || (e === erro && Math.abs(v) < Math.abs(melhor))) {
      erro = e
      melhor = v
    }
  }
  return melhor
}

/** A inversa de `vinhetaEmEv`: o nosso `efeitos.vinheta` (±100 = ±2 EV no canto) → PostCropVignetteAmount. */
export function vinhetaParaAdobe(nossa) {
  const ev = (nossa / 100) * LOCAL.vinheta.ev
  if (ev < 0) return Math.round(limitar(100 * (2 ** (ev / 2.5) - 1), -100, 0))
  return Math.round(limitar((100 * (2 ** ev - 1)) / 0.74, 0, 100))
}

// UUID de 32 hex maiúsculos, como o Lightroom grava, tirado do id da predefinição: a mesma predefinição exporta sempre
// o mesmo UUID (o Lightroom reconhece como a mesma ao importar de novo).
const uuidDe = (id) => (hashDe(`a:${id}`) + hashDe(`b:${id}`)).toUpperCase()

/**
 * A predefinição (ou um objeto de ajustes) → { xmp (texto), chaves: { chave: valor }, relatorio: { itens: [{ caminho,
 * chave, classe, razao }], deFora: [{ caminho, razao }] } }.
 * `opcoes.nome` e `opcoes.grupo` trocam o nome e a pasta (Group) que aparecem no Lightroom.
 */
export function escreverXmp(entrada, opcoes = {}) {
  const predefinicao = entrada?.zro === TIPO ? entrada : null
  const a = normalizar(predefinicao ? predefinicao.ajustes : entrada)
  const levar = predefinicao?.levar ?? opcoes.levar ?? []
  const nome = opcoes.nome ?? predefinicao?.nome ?? 'Predefinição'
  const grupo = opcoes.grupo ?? predefinicao?.familia ?? ''
  const chaves = {}
  const itens = []
  const deFora = []
  const por = (caminho, chave, valor, classe, razao) => {
    chaves[chave] = valor
    itens.push({ caminho, chave, classe, razao })
  }

  // ── da foto, só quando a predefinição leva ──
  if (levar.includes('luz.exposicao') && a.luz.exposicao) por('luz.exposicao', 'Exposure2012', decimal(a.luz.exposicao, 2), 'aproximado', 'mesmo EV')
  if (levar.includes('branco')) {
    if (a.branco.modo === 'auto') por('branco.modo', 'WhiteBalance', 'Auto', 'aproximado', 'o automático de lá, não o nosso')
    else if (a.branco.modo === 'manual') {
      por('branco.modo', 'WhiteBalance', 'Custom', 'exato', 'branco manual')
      por('branco.temperatura', 'Temperature', String(Math.round(a.branco.temperatura)), 'exato', 'kelvin; vale para RAW')
      por('branco.tinta', 'Tint', inteiro(a.branco.tinta), 'exato', 'tinta = Duv × 3000; vale para RAW')
    }
  }

  // ── luz ──
  const um = (caminho, chave, v, razao, classe = 'aproximado') => {
    if (v) por(caminho, chave, inteiro(v), classe, razao)
  }
  um('luz.contraste', 'Contrast2012', a.luz.contraste, 'mesmo número; lá se adapta à foto')
  um('luz.altas', 'Highlights2012', a.luz.altas, 'mesmo número; lá se adapta à foto')
  um('luz.brancos', 'Whites2012', a.luz.brancos, 'mesmo número; lá move o ponto branco')
  if (a.luz.pretos || a.luz.sombras) {
    const { blacks, shadows, resto } = pretosParaAdobe(a.luz.pretos, a.luz.sombras)
    if (blacks) por('luz.pretos', 'Blacks2012', inteiro(blacks), 'aproximado', 'pela tabela de preto invertida')
    if (shadows) por('luz.sombras', 'Shadows2012', inteiro(shadows), 'aproximado', 'o que sobrou das sombras depois do preto')
    if (resto) deFora.push({ caminho: 'luz.sombras', razao: `${resto > 0 ? '+' : ''}${resto} de sombras não couberam no Shadows2012` })
  }
  um('presenca.textura', 'Texture', a.presenca.textura, 'outro filtro, mesma direção')
  um('presenca.clareza', 'Clarity2012', a.presenca.clareza, 'outro filtro, mesma direção')
  um('presenca.neblina', 'Dehaze', a.presenca.neblina, 'outro modelo de neblina, mesma direção')
  um('cor.vibracao', 'Vibrance', a.cor.vibracao, 'medida em Oklab aqui')
  um('cor.saturacao', 'Saturation', a.cor.saturacao, 'medida em Oklab aqui')

  // ── curvas ──
  const parametrica = [
    ['curva.sombras', 'ParametricShadows'],
    ['curva.escuros', 'ParametricDarks'],
    ['curva.claros', 'ParametricLights'],
    ['curva.altas', 'ParametricHighlights'],
  ]
  let temParametrica = false
  for (const [caminho, chave] of parametrica) {
    const v = caminho.split('.').reduce((o, k) => o[k], a)
    if (v) {
      temParametrica = true
      por(caminho, chave, inteiro(v), 'aproximado', 'região da curva paramétrica')
    }
  }
  if (temParametrica) {
    chaves.ParametricShadowSplit = '25'
    chaves.ParametricMidtoneSplit = '50'
    chaves.ParametricHighlightSplit = '75'
  }
  const curvas = {}
  for (const [canal, sufixo] of [
    ['luz', ''],
    ['r', 'Red'],
    ['g', 'Green'],
    ['b', 'Blue'],
  ]) {
    const p = a.curva.pontos[canal]
    const reta = p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 1 && p[1][1] === 1
    if (reta) continue
    curvas[`ToneCurvePV2012${sufixo}`] = p.map(([x, y]) => `${Math.round(x * 255)}, ${Math.round(y * 255)}`)
    itens.push({ caminho: `curva.pontos.${canal}`, chave: `ToneCurvePV2012${sufixo}`, classe: 'exato', razao: 'pontos em 0–255 (arredondados)' })
  }
  if (Object.keys(curvas).length) chaves.ToneCurveName2012 = 'Custom'

  // ── HSL ──
  FAIXAS.forEach((faixa, k) => {
    const cor = FAIXAS_LR[k]
    const m = a.misturador.matiz[k]
    if (m) por(`misturador.matiz.${faixa}`, `HueAdjustment${cor}`, inteiro(matizParaAdobe(k, m)), 'aproximado', 'giro de matiz pela suposição de ±30° em ±100')
    if (a.misturador.saturacao[k])
      por(`misturador.saturacao.${faixa}`, `SaturationAdjustment${cor}`, inteiro(a.misturador.saturacao[k]), 'aproximado', 'mesmo número')
    if (a.misturador.luz[k]) por(`misturador.luz.${faixa}`, `LuminanceAdjustment${cor}`, inteiro(a.misturador.luz[k]), 'aproximado', 'mesmo número')
  })

  // ── preto e branco ──
  if (a.pb.ativo) {
    por('pb.ativo', 'ConvertToGrayscale', 'True', 'exato', 'preto e branco')
    FAIXAS.forEach((faixa, k) => {
      if (a.pb.mistura[k]) por(`pb.mistura.${faixa}`, `GrayMixer${FAIXAS_LR[k]}`, inteiro(a.pb.mistura[k]), 'aproximado', 'mesmo número')
    })
  }

  // ── tonalização ──
  const zonas = [
    ['sombras', 'SplitToningShadowHue', 'SplitToningShadowSaturation', 'ColorGradeShadowLum'],
    ['altas', 'SplitToningHighlightHue', 'SplitToningHighlightSaturation', 'ColorGradeHighlightLum'],
    ['meios', 'ColorGradeMidtoneHue', 'ColorGradeMidtoneSat', 'ColorGradeMidtoneLum'],
    ['global', 'ColorGradeGlobalHue', 'ColorGradeGlobalSat', 'ColorGradeGlobalLum'],
  ]
  let temTonalizacao = false
  for (const [zona, cMatiz, cSat, cLuz] of zonas) {
    const z = a.tonalizacao[zona]
    if (z.saturacao) {
      temTonalizacao = true
      por(`tonalizacao.${zona}`, cMatiz, String(Math.round(z.matiz) % 360), 'exato', 'mesmo círculo de cores')
      por(`tonalizacao.${zona}`, cSat, String(Math.round(z.saturacao)), 'aproximado', 'força da cor')
    }
    if (z.luz) {
      temTonalizacao = true
      por(`tonalizacao.${zona}`, cLuz, inteiro(z.luz), 'aproximado', 'luz da zona')
    }
  }
  if (temTonalizacao || a.tonalizacao.mistura !== 50)
    por('tonalizacao.mistura', 'ColorGradeBlending', String(Math.round(a.tonalizacao.mistura)), 'aproximado', 'sobreposição das zonas')
  um('tonalizacao.equilibrio', 'SplitToningBalance', a.tonalizacao.equilibrio, 'equilíbrio entre sombras e altas')

  // ── calibração ──
  for (const [campo, chave] of [
    ['sombrasTinta', 'ShadowTint'],
    ['vermelhoMatiz', 'RedHue'],
    ['vermelhoSaturacao', 'RedSaturation'],
    ['verdeMatiz', 'GreenHue'],
    ['verdeSaturacao', 'GreenSaturation'],
    ['azulMatiz', 'BlueHue'],
    ['azulSaturacao', 'BlueSaturation'],
  ]) {
    um(`calibracao.${campo}`, chave, a.calibracao[campo], 'gira e escala a primária em torno do branco')
  }

  // ── detalhe ──
  const d = a.detalhe
  if (d.nitidez) {
    por('detalhe.nitidez', 'Sharpness', String(Math.round(d.nitidez)), 'aproximado', 'mesma faixa (0 a 150)')
    por('detalhe.raio', 'SharpenRadius', decimal(d.raio, 1), 'exato', 'raio em pixels')
    por('detalhe.detalhe', 'SharpenDetail', String(Math.round(d.detalhe)), 'aproximado', 'mesma faixa')
    por('detalhe.mascara', 'SharpenEdgeMasking', String(Math.round(d.mascara)), 'aproximado', 'mesma faixa')
  }
  if (d.ruidoLuz) por('detalhe.ruidoLuz', 'LuminanceSmoothing', String(Math.round(d.ruidoLuz)), 'aproximado', 'outro redutor de ruído')
  if (d.ruidoCor) por('detalhe.ruidoCor', 'ColorNoiseReduction', String(Math.round(d.ruidoCor)), 'aproximado', 'outro redutor de ruído')

  // ── efeitos ──
  const e = a.efeitos
  if (e.grao) {
    por('efeitos.grao', 'GrainAmount', String(Math.round(e.grao)), 'aproximado', 'mesma faixa')
    por('efeitos.graoTamanho', 'GrainSize', String(Math.round(e.graoTamanho)), 'aproximado', 'mesma faixa')
    por('efeitos.graoAspereza', 'GrainFrequency', String(Math.round(e.graoAspereza)), 'aproximado', 'a aspereza de lá')
  }
  if (e.vinheta) {
    const v = vinhetaParaAdobe(e.vinheta)
    por('efeitos.vinheta', 'PostCropVignetteAmount', inteiro(v), 'aproximado', 'pelo ganho de canto publicado')
    por('efeitos.vinhetaMeio', 'PostCropVignetteMidpoint', String(Math.round(e.vinhetaMeio)), 'aproximado', 'mesma faixa')
    por('efeitos.vinhetaSuavidade', 'PostCropVignetteFeather', String(Math.round(e.vinhetaSuavidade)), 'aproximado', 'mesma faixa')
    chaves.PostCropVignetteStyle = '1'
    chaves.PostCropVignetteRoundness = '0'
  }
  if (e.desbotar) deFora.push({ caminho: 'efeitos.desbotar', razao: 'o Lightroom não tem desbotar: suba o ponto preto da curva para chegar perto' })

  // ── o que não tem para onde ir ──
  if (a.tela.contraste) deFora.push({ caminho: 'tela.contraste', razao: 'o contraste da tela é do nosso mapa de tons' })
  if (a.tela.preservarMatiz !== 100) deFora.push({ caminho: 'tela.preservarMatiz', razao: 'o mapa de tons de lá é outro' })
  if (a.tela.margemAltas !== 'auto' || a.tela.margemSombras !== 'auto')
    deFora.push({ caminho: 'tela.margens', razao: 'as margens da tela são do nosso mapa de tons' })
  if (predefinicao?.look) deFora.push({ caminho: 'look', razao: 'a LUT não cabe numa predefinição do Lightroom: exporte a .cube' })

  // ── o arquivo ──
  const atributos = {
    PresetType: 'Normal',
    Cluster: '',
    UUID: uuidDe(predefinicao?.id ?? JSON.stringify(a)),
    SupportsAmount: 'True',
    SupportsColor: a.pb.ativo ? 'False' : 'True',
    SupportsMonochrome: 'True',
    SupportsHighDynamicRange: 'True',
    SupportsNormalDynamicRange: 'True',
    SupportsSceneReferred: 'True',
    SupportsOutputReferred: 'True',
    ProcessVersion: '11.0',
    HasSettings: 'True',
    ...chaves,
  }
  const linhas = [
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '  <rdf:Description rdf:about=""',
    '    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"',
  ]
  for (const [k, v] of Object.entries(atributos)) linhas.push(`   crs:${k}="${escaparXml(v)}"`)
  linhas[linhas.length - 1] += '>'
  const alt = (k, v) => [`   <crs:${k}>`, '    <rdf:Alt>', `     <rdf:li xml:lang="x-default">${escaparXml(v)}</rdf:li>`, '    </rdf:Alt>', `   </crs:${k}>`]
  linhas.push(...alt('Name', nome))
  if (grupo) linhas.push(...alt('Group', grupo))
  if (predefinicao?.descricao) linhas.push(...alt('Description', predefinicao.descricao))
  for (const [k, pontos] of Object.entries(curvas)) {
    linhas.push(`   <crs:${k}>`, '    <rdf:Seq>', ...pontos.map((p) => `     <rdf:li>${p}</rdf:li>`), '    </rdf:Seq>', `   </crs:${k}>`)
  }
  linhas.push('  </rdf:Description>', ' </rdf:RDF>', '</x:xmpmeta>')
  return { xmp: `${linhas.join('\n')}\n`, chaves: { ...chaves, ...curvas }, relatorio: { itens, deFora } }
}

/** Nome de arquivo seguro para o .xmp exportado (o Lightroom usa o nome do arquivo quando o Name falta). */
export function nomeDoArquivoXmp(predefinicao) {
  const base = String(predefinicao?.nome ?? 'predefinicao')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${base || 'predefinicao'}.xmp`
}
