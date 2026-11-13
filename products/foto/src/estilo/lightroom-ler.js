// Importar do Adobe Lightroom / Camera Raw: predefinição .xmp, sidecar .xmp de uma foto, o XMP embutido num JPEG
// exportado (APP1) e o .lrtemplate antigo → a nossa predefinição + um relatório POR CHAVE:
//
//   'exato'       o valor diz a mesma coisa aqui (dado copiado, ou valor neutro)
//   'aproximado'  virou um controle nosso por uma fórmula; a razão diz qual é a diferença
//   'ignorado'    não entrou, e a razão diz por quê (é da foto, não há controle, o perfil não veio…)
//
// Chaves, faixas e serialização: docs/estudo/predefinicoes.md (seções 1, 2 e 8), tabela de tags `crs` do ExifTool e os
// arquivos reais do titular. O preset é PARCIAL: chave ausente = não mexe.
//
// POR QUE É APROXIMADO. A Adobe não publica a matemática do processo 2012+ (estudo, 6.1): Highlights, Shadows, Clarity
// e companhia se adaptam ao conteúdo da foto. Os nossos controles de luz são fixos em EV em torno do cinza médio
// (src/motor/ponto.js): o mesmo número dá o mesmo resultado em qualquer foto. A conversão é, então, slider a slider:
//
//   Exposure2012      → luz.exposicao     mesmo EV (é o que o darktable faz, lightroom.c:889-897). É da foto: só entra
//                                         em predefinição (com `levar`), não em sidecar de foto
//   Contrast2012      → luz.contraste     1:1. Os dois giram em torno do cinza médio; aqui +100 = inclinação ×1,5
//   Highlights2012    → luz.altas         1:1. Aqui −100 = −1,5 EV acima de +3 EV (lá, depende da foto)
//   Shadows2012       → luz.sombras       1:1. Aqui +100 = +2 EV abaixo de −4 EV
//   Whites2012        → luz.brancos       1:1. Aqui ±100 = ±1 EV acima de +4,5 EV (lá, move o ponto branco)
//   Blacks2012        → luz.pretos + luz.sombras   pela tabela BLACKS abaixo, CALIBRADA no nosso motor
//   Texture, Clarity2012, Dehaze → presenca.*      1:1 (filtros locais diferentes; mesma direção e mesma faixa)
//   Vibrance, Saturation → cor.*          1:1 (Saturation −100 = sem cor e +100 = dobro, como aqui; Oklab em vez do
//                                         espaço da Adobe)
//   HSL (24 chaves)   → misturador.*      as 8 faixas batem uma a uma (ver FAIXAS_LR); o matiz passa pela conta de
//                                         `matizDoMisturador`
//   Color Grading     → tonalizacao.*     matiz no mesmo círculo de cores; saturação e luz 1:1
//   Calibração        → calibracao.*      1:1 (o grupo existe no motor para receber estas chaves)
//   Detalhe, grão     → detalhe.*, efeitos.grao*   1:1 (mesmas faixas)
//   Vinheta           → efeitos.vinheta   pelo ganho de canto que o darktable publica (ver `vinhetaEmEv`)
//   Curvas            → curva.*           os pontos são copiados (x/255, y/255); a paramétrica vai 1:1 para as nossas
//                                         quatro regiões
//
// BLACKS. O único número publicado para o Blacks2012 é a tabela do darktable (lightroom.c:371-377): o slider vira um
// nível de preto subtraído na luz linear (−100 → +0,020; −50 → +0,005; +50 → −0,005; +100 → −0,010, com o branco em 1).
// O nosso `pretos` sozinho não imita isso (ele só age abaixo de −3 EV; subtrair preto escurece até perto do cinza).
// A tabela BLACKS saiu de um ajuste no nosso motor: para cada nível de preto, a rampa de cinza (−8 a +3,5 EV) foi
// revelada com o preto subtraído e, em busca exaustiva, achou-se o par (pretos, sombras) que dá a curva mais parecida.
// Os níveis de ±25 são o meio do caminho (±0,0025). Erro rms que sobrou, em códigos de 8 bits: 2,5 (−100), 0,6 (−50),
// 0,3 (−25), 0,4 (+25), 0,8 (+50), 2,9 (+100).
// O teste test/estilo-lightroom.test.js refaz a conta e trava a tabela.

import { FAIXAS, FAIXAS_MATIZ, normalizar } from '../motor/ajustes.js'
import { matizDoCirculo } from '../motor/cor/oklab.js'
import { LOCAL } from '../motor/local.js'
import { COR, criarCurvaDePontos } from '../motor/ponto.js'
import { criarPredefinicao } from './predefinicao.js'
import { lerLrtemplate, pareceLrtemplate } from './lrtemplate.js'

export const NS_CRS = 'http://ns.adobe.com/camera-raw-settings/1.0/'
const NS_RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const TAMANHO_MAX = 16 * 1024 * 1024
const PROFUNDIDADE_MAX = 64

/** As 8 faixas do HSL do Lightroom, na ordem das nossas `FAIXAS`: Aqua é o nosso ciano e Purple, o nosso roxo. */
export const FAIXAS_LR = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta']
// Centros que o estudo supõe para as faixas da Adobe (predefinicoes.md, seção 0): os nossos são [0, 30, 60, 120, 180,
// 240, 275, 315] — roxo e magenta ficam a 5° e 15° dos da Adobe, e é por isso que o HSL sai sempre como 'aproximado'.
export const CENTROS_LR = [0, 30, 60, 120, 180, 240, 270, 300]
// Suposição do estudo (finishing/src/cor/lightroom.js:21): ±100 de matiz no HSL = ±30° no círculo de cores.
export const GRAUS_POR_100 = 30

/** Blacks2012 → [pretos, sombras] nossos (ver o cabeçalho). Entre os pontos, interpolação linear. */
export const BLACKS = [
  [-100, -100, -91],
  [-50, -100, -18],
  [-25, -75, -8],
  [0, 0, 0],
  [25, 65, 8],
  [50, 100, 18],
  [100, 100, 36],
]

export class ErroLightroom extends Error {
  constructor(codigo, mensagem) {
    super(mensagem)
    this.name = 'ErroLightroom'
    this.codigo = codigo
  }
}

const erro = (codigo, mensagem) => new ErroLightroom(codigo, mensagem)
const limitar = (v, a, b) => (v < a ? a : v > b ? b : v)

// ─────────── XML (o subconjunto do XMP) ───────────

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function semEntidades(t) {
  if (!t.includes('&')) return t
  return t.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-z]+);/g, (tudo, e) => {
    if (e[0] === '#') {
      const codigo = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return codigo > 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : ''
    }
    return ENTIDADES[e] ?? tudo
  })
}

/**
 * Analisador do XML que o XMP usa: elementos, atributos, texto, comentários e instruções de processamento. Sem DTD,
 * sem entidade declarada no arquivo (é o que fecha a porta para entidade externa e bomba de entidades): `<!DOCTYPE`
 * ou `<!ENTITY` recusam o arquivo. Devolve a árvore { nome, atributos, filhos, texto }.
 */
export function analisarXml(texto) {
  if (texto.length > TAMANHO_MAX) throw erro('grande', 'Este arquivo é grande demais para um XMP.')
  if (/<!DOCTYPE|<!ENTITY/i.test(texto)) throw erro('xml-inseguro', 'O XMP traz declarações que não são aceitas (DOCTYPE ou ENTITY).')
  const raiz = { nome: '#raiz', atributos: {}, filhos: [], texto: '' }
  const pilha = [raiz]
  let i = 0
  const n = texto.length
  const atributo = /([^\s=/<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y
  while (i < n) {
    const abre = texto.indexOf('<', i)
    if (abre < 0) break
    if (abre > i) pilha[pilha.length - 1].texto += semEntidades(texto.slice(i, abre))
    if (texto.startsWith('<!--', abre)) {
      const fim = texto.indexOf('-->', abre + 4)
      if (fim < 0) throw erro('xml', 'O XMP está truncado (comentário sem fim).')
      i = fim + 3
    } else if (texto.startsWith('<?', abre)) {
      const fim = texto.indexOf('?>', abre + 2)
      if (fim < 0) throw erro('xml', 'O XMP está truncado.')
      i = fim + 2
    } else if (texto.startsWith('<![CDATA[', abre)) {
      const fim = texto.indexOf(']]>', abre + 9)
      if (fim < 0) throw erro('xml', 'O XMP está truncado.')
      pilha[pilha.length - 1].texto += texto.slice(abre + 9, fim)
      i = fim + 3
    } else if (texto[abre + 1] === '/') {
      const fim = texto.indexOf('>', abre)
      if (fim < 0) throw erro('xml', 'O XMP está truncado.')
      const nome = texto.slice(abre + 2, fim).trim()
      if (pilha.length < 2 || pilha[pilha.length - 1].nome !== nome) throw erro('xml', `O XMP está mal formado (fecha "${nome.slice(0, 40)}" fora de ordem).`)
      pilha.pop()
      i = fim + 1
    } else {
      const m = /^<([^\s/<>=]+)/.exec(texto.slice(abre, abre + 256))
      if (!m) throw erro('xml', 'O XMP está mal formado.')
      const el = { nome: m[1], atributos: {}, filhos: [], texto: '' }
      let p = abre + m[0].length
      for (;;) {
        while (p < n && /\s/.test(texto[p])) p++
        if (texto[p] === '>' || (texto[p] === '/' && texto[p + 1] === '>')) break
        atributo.lastIndex = p
        const a = atributo.exec(texto)
        if (!a) throw erro('xml', `O XMP está mal formado (atributo de "${el.nome.slice(0, 40)}").`)
        el.atributos[a[1]] = semEntidades(a[2] ?? a[3])
        p = atributo.lastIndex
      }
      pilha[pilha.length - 1].filhos.push(el)
      if (texto[p] === '/') i = p + 2
      else {
        if (pilha.length >= PROFUNDIDADE_MAX) throw erro('xml', 'O XMP tem níveis demais.')
        pilha.push(el)
        i = p + 1
      }
    }
  }
  if (pilha.length !== 1) throw erro('xml', 'O XMP está truncado (elemento sem fechar).')
  return raiz
}

function prefixos(raiz) {
  // prefixo → URI, de todas as declarações xmlns do documento (o XMP declara cada namespace uma vez)
  const mapa = {}
  const andar = (el) => {
    for (const [k, v] of Object.entries(el.atributos)) if (k.startsWith('xmlns:')) mapa[k.slice(6)] = v
    el.filhos.forEach(andar)
  }
  andar(raiz)
  const de = (uri, padrao) => Object.keys(mapa).find((p) => mapa[p] === uri) ?? padrao
  return { crs: de(NS_CRS, 'crs'), rdf: de(NS_RDF, 'rdf') }
}

/**
 * As chaves `crs:` de um pacote XMP (texto): atributos e elementos de todas as rdf:Description de primeiro nível.
 * Seq/Bag vira lista, Alt vira o texto padrão, estrutura (rdf:Description ou parseType="Resource") vira objeto.
 * Só o namespace crs é lido: GPS, número de série, rosto e o resto do sidecar são descartados aqui.
 */
export function chavesCrsDoXmp(xmp) {
  const raiz = analisarXml(xmp)
  const { crs, rdf } = prefixos(raiz)
  const pc = `${crs}:`
  const eRdf = (el, nome) => el.nome === `${rdf}:${nome}`
  const filhoRdf = (el, nome) => el.filhos.find((f) => eRdf(f, nome))

  function objeto(el) {
    const o = {}
    for (const [k, v] of Object.entries(el.atributos)) if (k.startsWith(pc)) o[k.slice(pc.length)] = v
    for (const f of el.filhos) if (f.nome.startsWith(pc)) o[f.nome.slice(pc.length)] = valor(f)
    return o
  }
  function valor(el) {
    const lista = filhoRdf(el, 'Seq') ?? filhoRdf(el, 'Bag')
    if (lista) return lista.filhos.filter((f) => eRdf(f, 'li')).map(valor)
    const alt = filhoRdf(el, 'Alt')
    if (alt) {
      const itens = alt.filhos.filter((f) => eRdf(f, 'li'))
      const padrao = itens.find((f) => f.atributos['xml:lang'] === 'x-default') ?? itens[0]
      return padrao ? padrao.texto.trim() : ''
    }
    const descricao = filhoRdf(el, 'Description')
    if (descricao) return objeto(descricao)
    if (el.atributos[`${rdf}:parseType`] === 'Resource' || Object.keys(el.atributos).some((k) => k.startsWith(pc))) return objeto(el)
    return el.texto.trim()
  }

  const chaves = {}
  const achar = (el) => {
    if (eRdf(el, 'RDF')) {
      for (const d of el.filhos) if (eRdf(d, 'Description')) Object.assign(chaves, objeto(d))
      return
    }
    el.filhos.forEach(achar)
  }
  achar(raiz)
  return chaves
}

// ─────────── JPEG: o XMP do APP1 ───────────

const CABECALHO_XMP = 'http://ns.adobe.com/xap/1.0/\0'
const CABECALHO_EXTENSAO = 'http://ns.adobe.com/xmp/extension/\0'

function comeca(bytes, em, texto) {
  if (em + texto.length > bytes.length) return false
  for (let k = 0; k < texto.length; k++) if (bytes[em + k] !== texto.charCodeAt(k)) return false
  return true
}

/**
 * O XMP embutido num JPEG: { principal, estendido } (textos; null quando não há). Segue a Adobe XMP Specification
 * parte 3, 1.1.3: o pacote mora num APP1 com o cabeçalho "http://ns.adobe.com/xap/1.0/\0"; o que não cabe em 64 KB
 * vai em APP1 de extensão (cabeçalho + GUID de 32 caracteres + tamanho total + deslocamento), que são remontados.
 */
export function xmpDoJpeg(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return { principal: null, estendido: null }
  const utf8 = new TextDecoder('utf-8')
  let principal = null
  let extensao = null
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break
    const marca = bytes[i + 1]
    if (marca === 0xff) {
      i++
      continue
    }
    // SOS: daqui em diante é imagem; EOI: fim
    if (marca === 0xda || marca === 0xd9) break
    if (marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) {
      i += 2
      continue
    }
    const tamanho = (bytes[i + 2] << 8) | bytes[i + 3]
    if (tamanho < 2 || i + 2 + tamanho > bytes.length) break
    const inicio = i + 4
    const fim = i + 2 + tamanho
    if (marca === 0xe1) {
      if (principal == null && comeca(bytes, inicio, CABECALHO_XMP)) principal = utf8.decode(bytes.subarray(inicio + CABECALHO_XMP.length, fim))
      else if (comeca(bytes, inicio, CABECALHO_EXTENSAO)) {
        const p = inicio + CABECALHO_EXTENSAO.length + 32
        if (p + 8 <= fim) {
          const total = ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0
          const onde = ((bytes[p + 4] << 24) | (bytes[p + 5] << 16) | (bytes[p + 6] << 8) | bytes[p + 7]) >>> 0
          if (total <= TAMANHO_MAX && onde + (fim - p - 8) <= total) {
            extensao ??= new Uint8Array(total)
            if (extensao.length === total) extensao.set(bytes.subarray(p + 8, fim), onde)
          }
        }
      }
    }
    i = fim
  }
  return { principal, estendido: extensao ? utf8.decode(extensao) : null }
}

// ─────────── valores ───────────

const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string' || !v.trim()) return null
  const n = Number(v.trim().replace(/^\+/, ''))
  return Number.isFinite(n) ? n : null
}
const bool = (v) => v === true || v === 1 || (typeof v === 'string' && /^(true|1)$/i.test(v.trim()))

function mostrar(v) {
  if (Array.isArray(v)) return `${v.length} itens`
  if (v && typeof v === 'object') return 'estrutura'
  return String(v).slice(0, 60)
}

// Lista de pontos de curva: ["0, 0", "255, 255"] (XMP) ou [[0, 0], [255, 255]] (.lrtemplate) → [[x, y]] em 0..1
function pontosDe(v) {
  if (!Array.isArray(v)) return null
  const pontos = []
  for (const item of v) {
    const par = Array.isArray(item) ? item : typeof item === 'string' ? item.split(',') : null
    if (!par || par.length < 2) return null
    const x = num(par[0])
    const y = num(par[1])
    if (x == null || y == null) return null
    pontos.push([limitar(x / 255, 0, 1), limitar(y / 255, 0, 1)])
  }
  return pontos.length >= 2 ? pontos : null
}

const eReta = (p) => p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 1 && p[1][1] === 1

// A curva do motor leva até 16 pontos: mais que isso é reamostrada em 16, na curva monótona que o motor usa.
function ate16(pontos) {
  if (pontos.length <= 16) return { pontos, reamostrada: false }
  const f = criarCurvaDePontos(pontos)
  const saida = []
  for (let k = 0; k < 16; k++) saida.push([k / 15, limitar(f(k / 15), 0, 1)])
  return { pontos: saida, reamostrada: true }
}

function compor(primeira, segunda) {
  const f = criarCurvaDePontos(primeira)
  const g = criarCurvaDePontos(segunda)
  const saida = []
  for (let k = 0; k < 16; k++) saida.push([k / 15, limitar(g(f(k / 15)), 0, 1)])
  return saida
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

const doisPi = 2 * Math.PI
const CENTROS_OKLAB = FAIXAS_MATIZ.map((g) => (matizDoCirculo(g) + doisPi) % doisPi)

/**
 * HueAdjustment da Adobe (±100) → o nosso `misturador.matiz` da mesma faixa. Lá, pela suposição do estudo, ±100 giram
 * a cor ±30° no círculo de cores; aqui, ±100 levam o centro da faixa até metade do caminho para a faixa vizinha, em
 * matiz Oklab. A conta passa o giro da Adobe para Oklab e divide pelo passo do nosso controle; o que não cabe fica
 * preso em ±100.
 */
export function matizDoMisturador(indice, v) {
  if (!v) return 0
  const de = matizDoCirculo(CENTROS_LR[indice])
  const para = matizDoCirculo(CENTROS_LR[indice] + (GRAUS_POR_100 * v) / 100)
  let giro = para - de
  while (giro > Math.PI) giro -= doisPi
  while (giro < -Math.PI) giro += doisPi
  let passo = v >= 0 ? CENTROS_OKLAB[(indice + 1) % 8] - CENTROS_OKLAB[indice] : CENTROS_OKLAB[indice] - CENTROS_OKLAB[(indice + 7) % 8]
  if (passo < 0) passo += doisPi
  return Math.round(limitar((100 * giro) / (COR.matiz * passo), -100, 100))
}

/**
 * PostCropVignetteAmount (±100) → EV no canto. Do darktable (lightroom.c:382-403): escurecer é um ganho de
 * (1 + a/100)^2,5 e clarear, de 1 + 0,74·a/100. O nosso controle é ±2 EV no canto em ±100.
 */
export function vinhetaEmEv(a) {
  if (a < 0) return 2.5 * Math.log2(Math.max(1 + a / 100, 1e-3))
  return Math.log2(1 + (0.74 * a) / 100)
}

// ─────────── a conversão ───────────

const R = {
  neutro: 'valor neutro',
  daFoto: (oQue) => `é da foto (${oQue}): corrige-se foto a foto, fica fora do estilo`,
  semControle: 'não há controle equivalente',
  desligado: 'painel desligado na predefinição',
  lente: 'correção de lente: não é estilo e ainda não é importada',
  geometria: 'recorte e perspectiva são da foto: não entram no estilo',
  mascara: 'ajuste local ou máscara: ainda não importado',
  meta: 'identificação do arquivo, sem efeito na imagem',
  legado: 'processo antigo (antes de 2012): conversão por suposição do estudo',
}

// Chaves que só identificam ou descrevem o arquivo.
const META = new Set(
  (
    'PresetType Cluster UUID Name ShortName SortName Group Description SupportsAmount SupportsAmount2 SupportsColor SupportsMonochrome ' +
    'SupportsHighDynamicRange SupportsNormalDynamicRange SupportsSceneReferred SupportsOutputReferred RequiresRGBTables ShowInPresets ' +
    'ShowInQuickActions CameraModelRestriction Copyright ContactInfo Version ProcessVersion HasSettings AlreadyApplied AutoToneDigest ' +
    'AutoToneDigestNoSat CameraProfileDigest LensProfileDigest ToneCurveName ToneCurveName2012 ToggleStyleDigest ToggleStyleAmount ' +
    'RawFileName Stubbed orientation AutoWhiteVersion DefaultAutoTone DefaultAutoGray DefaultsSpecificToSerial DefaultsSpecificToISO DNGIgnoreSidecars'
  ).split(' '),
)
const LENTE =
  /^(LensProfile|AutoLateralCA$|ChromaticAberration|Defringe|VignetteAmount$|VignetteMidpoint$|LensManualDistortionAmount$|EnableLensCorrections$|EnableProfileCorrections$)/
const GEOMETRIA = /^(Crop|HasCrop$|Perspective|Upright|EnableTransform$|EnableCrop$)/
const MASCARAS =
  /^(MaskGroupBasedCorrections|GradientBasedCorrections|PaintBasedCorrections|CircularGradientBasedCorrections|RetouchInfo|RetouchAreas|RedEyeInfo|Enable(GradientBasedCorrections|PaintBasedCorrections|CircularGradientBasedCorrections|MaskGroupBasedCorrections|Retouch|RedEye)|Local)/
const NOVOS = /^(PointColors|ColorVariance|LensBlur|HDREditMode|HDRMaxValue|SDR|DepthMap|DepthBasedCorrections)/
// painel do .lrtemplate → chaves que ele liga e desliga
const PAINEIS = {
  EnableCalibration: /^(ShadowTint|(Red|Green|Blue)(Hue|Saturation))$/,
  EnableColorAdjustments: /^(Hue|Saturation|Luminance)Adjustment/,
  EnableDetail: /^(Sharp|LuminanceSmoothing|LuminanceNoise|ColorNoise)/,
  EnableEffects: /^(Grain|PostCropVignette)/,
  EnableGrayscaleMix: /^GrayMixer/,
  EnableSplitToning: /^(SplitToning|ColorGrade)/,
  EnableToneCurve: /^(ToneCurve|Parametric)/,
}

/**
 * Converte o dicionário de chaves `crs` (de XMP ou de .lrtemplate) em ajustes do motor e no relatório por chave.
 * `tipo`: 'predefinicao' (exposição e branco, se vierem, entram com `levar`) ou 'foto' (sidecar e JPEG: exposição e
 * branco são daquela foto e ficam em `daFoto`).
 * Devolve { ajustes (parcial), levar, relatorio: { itens, resumo, avisos, desconhecidas, meta }, daFoto }.
 */
export function converterChaves(chaves, { tipo = 'predefinicao' } = {}) {
  const ajustes = {}
  const levar = []
  const itens = []
  const avisos = []
  const daFoto = {}
  const vistas = new Set()
  const por = (caminho, v) => {
    const partes = caminho.split('.')
    let o = ajustes
    for (let k = 0; k < partes.length - 1; k++) o = o[partes[k]] ??= {}
    o[partes[partes.length - 1]] = v
  }
  const ler = (caminho) => caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ajustes)
  const anotar = (chave, classe, para, razao, valor = chaves[chave]) => {
    vistas.add(chave)
    itens.push({ chave, valor: mostrar(valor), classe, para: para ?? null, razao })
  }
  const tem = (chave) => Object.prototype.hasOwnProperty.call(chaves, chave)
  const desligado = (chave) => Object.entries(PAINEIS).some(([painel, re]) => tem(painel) && !bool(chaves[painel]) && re.test(chave))

  // slider → controle, 1:1 (com escala e faixa). `razao` é a diferença dita em poucas palavras.
  const direto = (chave, caminho, razao, { min = -100, max = 100, neutro = 0, escala = 1, classe = 'aproximado', arredondar = true } = {}) => {
    if (!tem(chave)) return null
    const v = num(chaves[chave])
    if (v == null) return anotar(chave, 'ignorado', null, 'valor ilegível')
    if (desligado(chave)) return anotar(chave, 'ignorado', null, R.desligado)
    if (v === neutro) return anotar(chave, 'exato', caminho, R.neutro)
    const convertido = limitar(v * escala, min, max)
    por(caminho, arredondar ? Math.round(convertido) : convertido)
    const preso = convertido !== v * escala ? '; passou da nossa faixa e ficou no limite' : ''
    anotar(chave, classe, caminho, razao + preso)
    return v
  }

  const pv = num(chaves.ProcessVersion)
  const legado = pv != null && pv < 6.7
  const meta = {
    nome: typeof chaves.Name === 'string' ? chaves.Name : '',
    grupo: typeof chaves.Group === 'string' ? chaves.Group : '',
    uuid: typeof chaves.UUID === 'string' ? chaves.UUID : '',
    direitos: typeof chaves.Copyright === 'string' ? chaves.Copyright : '',
    contato: typeof chaves.ContactInfo === 'string' ? chaves.ContactInfo : '',
    processo: chaves.ProcessVersion != null ? String(chaves.ProcessVersion) : '',
    versao: chaves.Version != null ? String(chaves.Version) : '',
    perfil: '',
    tipo,
  }
  for (const chave of Object.keys(chaves)) if (META.has(chave)) anotar(chave, 'exato', 'meta', R.meta)
  for (const painel of [...Object.keys(PAINEIS), 'EnableLensCorrections', 'EnableTransform']) {
    if (tem(painel) && !vistas.has(painel))
      anotar(painel, 'exato', 'meta', bool(chaves[painel]) ? 'painel ligado' : 'painel desligado: as chaves dele não entram')
  }

  // ── exposição e branco: da foto ──
  const levaDaFoto = tipo === 'predefinicao'
  const chaveExposicao = legado ? 'Exposure' : 'Exposure2012'
  if (tem(chaveExposicao)) {
    const v = num(chaves[chaveExposicao])
    if (v == null) anotar(chaveExposicao, 'ignorado', null, 'valor ilegível')
    else if (v === 0) anotar(chaveExposicao, 'exato', 'luz.exposicao', R.neutro)
    else if (levaDaFoto) {
      por('luz.exposicao', limitar(v, -5, 5))
      levar.push('luz.exposicao')
      anotar(chaveExposicao, 'aproximado', 'luz.exposicao', 'mesmo EV; o ombro das altas luzes é o do nosso mapa de tons')
    } else {
      daFoto.exposicao = limitar(v, -5, 5)
      anotar(chaveExposicao, 'ignorado', null, R.daFoto('exposição'))
    }
  }
  if (tem('WhiteBalance')) {
    const modo = String(chaves.WhiteBalance)
    const T = num(chaves.Temperature)
    const tinta = num(chaves.Tint)
    if (modo === 'As Shot') anotar('WhiteBalance', 'exato', 'branco.modo', 'branco como fotografado')
    else if (modo === 'Auto') {
      if (levaDaFoto) {
        por('branco.modo', 'auto')
        if (!levar.includes('branco')) levar.push('branco')
        anotar('WhiteBalance', 'aproximado', 'branco.modo', 'branco automático: o nosso, que mede os tons neutros da foto')
      } else anotar('WhiteBalance', 'ignorado', null, R.daFoto('branco'))
    } else if (T != null) {
      if (levaDaFoto) {
        por('branco.modo', 'manual')
        if (!levar.includes('branco')) levar.push('branco')
        anotar('WhiteBalance', 'exato', 'branco.modo', 'branco manual, com a temperatura e a tinta do arquivo')
      } else anotar('WhiteBalance', 'ignorado', null, R.daFoto('branco'))
    } else anotar('WhiteBalance', 'ignorado', null, `branco "${modo.slice(0, 20)}" sem temperatura no arquivo: fica o da foto`)
    for (const [chave, caminho, v, min, max] of [
      ['Temperature', 'branco.temperatura', T, 2000, 50000],
      ['Tint', 'branco.tinta', tinta, -150, 150],
    ]) {
      if (!tem(chave)) continue
      if (v == null) anotar(chave, 'ignorado', null, 'valor ilegível')
      else if (modo === 'As Shot') anotar(chave, 'ignorado', null, 'o arquivo pede o branco como fotografado')
      else if (levaDaFoto && T != null) {
        por(caminho, limitar(v, min, max))
        // mesma construção da Adobe: kelvin no lugar de Planck e tinta = Duv × 3000 (src/motor/cor/branco.js)
        anotar(chave, 'exato', caminho, 'mesma escala (kelvin; tinta = Duv × 3000). Vale para RAW')
      } else {
        daFoto.branco ??= {}
        daFoto.branco[chave === 'Temperature' ? 'temperatura' : 'tinta'] = limitar(v, min, max)
        anotar(chave, 'ignorado', null, R.daFoto('branco'))
      }
    }
  } else {
    for (const chave of ['Temperature', 'Tint']) if (tem(chave)) anotar(chave, 'ignorado', null, R.daFoto('branco'))
  }
  for (const chave of ['IncrementalTemperature', 'IncrementalTint']) {
    if (!tem(chave)) continue
    if (num(chaves[chave]) === 0) anotar(chave, 'exato', null, R.neutro)
    else anotar(chave, 'ignorado', null, 'branco relativo (foto que não é RAW): a Adobe não publica a escala; acerte o branco na foto')
  }

  // ── luz ──
  if (legado) {
    // PV2003/PV2010 (estudo, seção 8, última linha): não há conversão publicada para o processo 2012
    avisos.push('Predefinição de processo antigo (antes de 2012): os controles de luz foram convertidos por aproximação.')
    direto('Contrast', 'luz.contraste', `${R.legado}; contraste = Contrast − 25`, { neutro: 25, escala: 1 })
    if (ler('luz.contraste') != null) por('luz.contraste', limitar(ler('luz.contraste') - 25, -100, 100))
    direto('HighlightRecovery', 'luz.altas', `${R.legado}; altas = −Recovery`, { escala: -1 })
    direto('FillLight', 'luz.sombras', `${R.legado}; sombras = +FillLight`)
    direto('Shadows', 'luz.pretos', `${R.legado}; pretos = −2·(Shadows − 5)`, { neutro: 5, escala: 1 })
    if (ler('luz.pretos') != null) por('luz.pretos', limitar(-2 * (ler('luz.pretos') - 5), -100, 100))
    if (tem('Brightness')) {
      const v = num(chaves.Brightness)
      if (v == null) anotar('Brightness', 'ignorado', null, 'valor ilegível')
      else if (v === 50) anotar('Brightness', 'exato', 'curva.claros', R.neutro)
      else {
        // o Brightness antigo clareia os meios-tons sem mexer nas pontas: é o papel das nossas regiões do meio da curva
        const c = limitar(Math.round(v - 50), -100, 100)
        por('curva.claros', c)
        por('curva.escuros', c)
        anotar('Brightness', 'aproximado', 'curva.claros', `${R.legado}; claros e escuros da curva = Brightness − 50`)
      }
    }
    direto('Clarity', 'presenca.clareza', `${R.legado}; contraste local com outro filtro`)
  } else {
    direto('Contrast2012', 'luz.contraste', 'gira em torno do cinza médio; aqui +100 = inclinação ×1,5')
    direto('Highlights2012', 'luz.altas', 'lá se adapta à foto; aqui é fixo: −100 = −1,5 EV acima de +3 EV')
    direto('Shadows2012', 'luz.sombras', 'lá se adapta à foto; aqui é fixo: +100 = +2 EV abaixo de −4 EV')
    direto('Whites2012', 'luz.brancos', 'lá move o ponto branco; aqui ±100 = ±1 EV acima de +4,5 EV')
    if (tem('Blacks2012')) {
      const v = num(chaves.Blacks2012)
      if (v == null) anotar('Blacks2012', 'ignorado', null, 'valor ilegível')
      else if (v === 0) anotar('Blacks2012', 'exato', 'luz.pretos', R.neutro)
      else {
        const [pretos, sombras] = interpolarTabela(BLACKS, v)
        por('luz.pretos', Math.round(pretos))
        por('luz.sombras', Math.round(limitar((ler('luz.sombras') ?? 0) + sombras, -100, 100)))
        anotar('Blacks2012', 'aproximado', 'luz.pretos', 'nível de preto da tabela publicada, ajustado no nosso motor: mexe em pretos e em sombras')
      }
    }
    direto('Clarity2012', 'presenca.clareza', 'contraste local com outro filtro; mesma direção e mesma faixa')
    for (const chave of ['Brightness', 'Contrast', 'Shadows', 'FillLight', 'HighlightRecovery', 'Exposure', 'Clarity']) {
      if (tem(chave) && !vistas.has(chave)) anotar(chave, 'ignorado', null, 'chave do processo antigo: o arquivo é do processo 2012 e usa as chaves novas')
    }
  }
  direto('Texture', 'presenca.textura', 'detalhe fino com outro filtro; mesma direção e mesma faixa')
  direto('Dehaze', 'presenca.neblina', 'outro modelo de neblina; mesma direção e mesma faixa')
  direto('Vibrance', 'cor.vibracao', 'ganho que poupa cor já saturada e pele, medido em Oklab')
  direto('Saturation', 'cor.saturacao', '−100 = sem cor e +100 = dobro, como lá; medido em Oklab')

  // ── curvas ──
  for (const [chave, caminho] of [
    ['ParametricShadows', 'curva.sombras'],
    ['ParametricDarks', 'curva.escuros'],
    ['ParametricLights', 'curva.claros'],
    ['ParametricHighlights', 'curva.altas'],
  ]) {
    direto(chave, caminho, 'região da curva paramétrica: mesma direção, largura e força das nossas')
  }
  for (const [chave, padrao] of [
    ['ParametricShadowSplit', 25],
    ['ParametricMidtoneSplit', 50],
    ['ParametricHighlightSplit', 75],
  ]) {
    if (!tem(chave)) continue
    if (num(chaves[chave]) === padrao) anotar(chave, 'exato', null, 'divisor no padrão')
    else anotar(chave, 'ignorado', null, 'divisor fora do padrão: as nossas regiões têm divisores fixos')
  }
  // a curva do perfil (crs:Look) vai primeiro; a da pessoa, por cima
  const look = chaves.Look && typeof chaves.Look === 'object' && !Array.isArray(chaves.Look) ? chaves.Look : null
  const parametros = look?.Parameters && typeof look.Parameters === 'object' ? look.Parameters : {}
  const curvaDoPerfil = pontosDe(parametros.ToneCurvePV2012)
  for (const [sufixo, canal] of [
    ['', 'luz'],
    ['Red', 'r'],
    ['Green', 'g'],
    ['Blue', 'b'],
  ]) {
    const nova = `ToneCurvePV2012${sufixo}`
    const antiga = `ToneCurve${sufixo}`
    const chave = tem(nova) ? nova : tem(antiga) ? antiga : null
    if (tem(nova) && tem(antiga)) anotar(antiga, 'ignorado', null, 'curva do processo antigo: vale a do processo 2012')
    const doPerfil = canal === 'luz' ? curvaDoPerfil : pontosDe(parametros[nova])
    let pontos = null
    if (chave) {
      const lidos = pontosDe(chaves[chave])
      if (!lidos) anotar(chave, 'ignorado', null, 'curva ilegível')
      else if (desligado(chave)) anotar(chave, 'ignorado', null, R.desligado)
      else if (eReta(lidos)) anotar(chave, 'exato', `curva.pontos.${canal}`, 'curva reta')
      else {
        const r = ate16(lidos)
        pontos = r.pontos
        if (r.reamostrada) anotar(chave, 'aproximado', `curva.pontos.${canal}`, `${lidos.length} pontos reamostrados em 16`)
        else anotar(chave, 'exato', `curva.pontos.${canal}`, 'pontos copiados; desenhada sobre o código da tela, como lá')
      }
    }
    if (doPerfil && !eReta(doPerfil)) {
      const nomeDaChave = `Look.Parameters.${nova}`
      if (pontos) {
        pontos = compor(ate16(doPerfil).pontos, pontos)
        anotar(nomeDaChave, 'aproximado', `curva.pontos.${canal}`, 'curva do perfil composta com a curva da predefinição (16 pontos)', doPerfil)
      } else {
        const r = ate16(doPerfil)
        pontos = r.pontos
        anotar(nomeDaChave, r.reamostrada ? 'aproximado' : 'exato', `curva.pontos.${canal}`, 'curva de pontos do perfil aplicada', doPerfil)
      }
    } else if (doPerfil) anotar(`Look.Parameters.${nova}`, 'exato', `curva.pontos.${canal}`, 'curva reta', doPerfil)
    if (pontos) por(`curva.pontos.${canal}`, pontos)
  }
  if (tem('CurveRefineSaturation')) {
    anotar(
      'CurveRefineSaturation',
      num(chaves.CurveRefineSaturation) === 100 ? 'exato' : 'ignorado',
      null,
      num(chaves.CurveRefineSaturation) === 100 ? R.neutro : R.semControle,
    )
  }

  // ── HSL ──
  const grupoHsl = [
    ['HueAdjustment', 'matiz'],
    ['SaturationAdjustment', 'saturacao'],
    ['LuminanceAdjustment', 'luz'],
  ]
  for (const [prefixo, parte] of grupoHsl) {
    const lista = new Array(8).fill(0)
    let mexeu = false
    FAIXAS_LR.forEach((cor, k) => {
      const chave = prefixo + cor
      if (!tem(chave)) return
      const v = num(chaves[chave])
      const caminho = `misturador.${parte}.${FAIXAS[k]}`
      if (v == null) return anotar(chave, 'ignorado', null, 'valor ilegível')
      if (desligado(chave)) return anotar(chave, 'ignorado', null, R.desligado)
      if (v === 0) return anotar(chave, 'exato', caminho, R.neutro)
      mexeu = true
      if (parte === 'matiz') {
        lista[k] = matizDoMisturador(k, limitar(v, -100, 100))
        anotar(
          chave,
          'aproximado',
          caminho,
          `±100 lá ≈ ±${GRAUS_POR_100}° (suposição); aqui o passo é metade do caminho até a faixa vizinha${Math.abs(lista[k]) === 100 ? '; ficou no limite' : ''}`,
        )
      } else {
        lista[k] = Math.round(limitar(v, -100, 100))
        anotar(
          chave,
          'aproximado',
          caminho,
          parte === 'saturacao' ? 'saturação da faixa: de 0 a 2×, em Oklab' : 'luz da faixa: ±1,5 EV, pesada pela saturação da cor',
        )
      }
    })
    if (mexeu) por(`misturador.${parte}`, lista)
  }

  // ── preto e branco ──
  const pb = bool(chaves.ConvertToGrayscale) || /black|b&w|mono/i.test(String(chaves.Treatment ?? '')) || bool(parametros.ConvertToGrayscale)
  if (tem('ConvertToGrayscale')) anotar('ConvertToGrayscale', 'exato', 'pb.ativo', pb ? 'preto e branco ligado' : 'em cores')
  if (tem('Treatment')) anotar('Treatment', 'exato', 'pb.ativo', pb ? 'preto e branco ligado' : 'em cores')
  if (pb) por('pb.ativo', true)
  {
    const lista = new Array(8).fill(0)
    let mexeu = false
    FAIXAS_LR.forEach((cor, k) => {
      const chave = `GrayMixer${cor}`
      if (!tem(chave)) return
      const v = num(chaves[chave])
      if (v == null) return anotar(chave, 'ignorado', null, 'valor ilegível')
      if (!pb) return anotar(chave, 'ignorado', null, 'a predefinição é em cores: a mistura do preto e branco não vale')
      if (desligado(chave)) return anotar(chave, 'ignorado', null, R.desligado)
      if (v === 0) return anotar(chave, 'exato', `pb.mistura.${FAIXAS[k]}`, R.neutro)
      mexeu = true
      lista[k] = Math.round(limitar(v, -100, 100))
      anotar(chave, 'aproximado', `pb.mistura.${FAIXAS[k]}`, 'luz da faixa no preto e branco: ±1,5 EV, pesada pela saturação da cor')
    })
    if (mexeu) por('pb.mistura', lista)
  }

  // ── tonalização (Color Grading; sombras e altas usam as chaves SplitToning) ──
  const zonas = [
    ['sombras', 'SplitToningShadowHue', 'SplitToningShadowSaturation', 'ColorGradeShadowLum'],
    ['altas', 'SplitToningHighlightHue', 'SplitToningHighlightSaturation', 'ColorGradeHighlightLum'],
    ['meios', 'ColorGradeMidtoneHue', 'ColorGradeMidtoneSat', 'ColorGradeMidtoneLum'],
    ['global', 'ColorGradeGlobalHue', 'ColorGradeGlobalSat', 'ColorGradeGlobalLum'],
  ]
  for (const [zona, cMatiz, cSat, cLuz] of zonas) {
    const matiz = num(chaves[cMatiz])
    const sat = num(chaves[cSat])
    const luz = num(chaves[cLuz])
    const off = [cMatiz, cSat, cLuz].some((c) => tem(c) && desligado(c))
    const z = { matiz: 0, saturacao: 0, luz: 0 }
    if (tem(cSat)) {
      if (off) anotar(cSat, 'ignorado', null, R.desligado)
      else if (!sat) anotar(cSat, 'exato', `tonalizacao.${zona}`, R.neutro)
      else {
        z.saturacao = Math.round(limitar(sat, 0, 100))
        anotar(cSat, 'aproximado', `tonalizacao.${zona}`, 'força da cor: aqui 100 = croma de 0,12·L em Oklab')
      }
    }
    if (tem(cMatiz)) {
      if (off) anotar(cMatiz, 'ignorado', null, R.desligado)
      else if (!z.saturacao) anotar(cMatiz, 'exato', `tonalizacao.${zona}`, 'sem saturação, o matiz não age')
      else {
        z.matiz = (((matiz ?? 0) % 360) + 360) % 360
        anotar(cMatiz, 'exato', `tonalizacao.${zona}`, 'mesmo círculo de cores (0° = vermelho)')
      }
    }
    if (tem(cLuz)) {
      if (off) anotar(cLuz, 'ignorado', null, R.desligado)
      else if (!luz) anotar(cLuz, 'exato', `tonalizacao.${zona}`, R.neutro)
      else {
        z.luz = Math.round(limitar(luz, -100, 100))
        anotar(cLuz, 'aproximado', `tonalizacao.${zona}`, 'luz da zona: aqui ±100 = ±1 EV')
      }
    }
    if (z.saturacao || z.luz) por(`tonalizacao.${zona}`, z)
  }
  direto('ColorGradeBlending', 'tonalizacao.mistura', 'sobreposição das zonas: mesma ideia, outra largura', { min: 0, max: 100, neutro: 50 })
  direto('SplitToningBalance', 'tonalizacao.equilibrio', 'equilíbrio entre sombras e altas: aqui ±100 = ±2 EV no ponto de troca')

  // ── calibração ──
  for (const [chave, caminho] of [
    ['ShadowTint', 'calibracao.sombrasTinta'],
    ['RedHue', 'calibracao.vermelhoMatiz'],
    ['RedSaturation', 'calibracao.vermelhoSaturacao'],
    ['GreenHue', 'calibracao.verdeMatiz'],
    ['GreenSaturation', 'calibracao.verdeSaturacao'],
    ['BlueHue', 'calibracao.azulMatiz'],
    ['BlueSaturation', 'calibracao.azulSaturacao'],
  ]) {
    direto(chave, caminho, 'gira e escala a primária em torno do branco: aqui ±100 = ±20° e de 0,5 a 1,5×')
  }

  // ── detalhe ──
  direto('Sharpness', 'detalhe.nitidez', 'máscara de nitidez no log da luz; mesma faixa (0 a 150)', { min: 0, max: 150 })
  direto('SharpenRadius', 'detalhe.raio', 'raio em pixels, como lá', { min: 0.5, max: 3, neutro: 1, arredondar: false })
  direto('SharpenDetail', 'detalhe.detalhe', 'aqui abre o limite do halo; mesma faixa', { min: 0, max: 100, neutro: 25 })
  direto('SharpenEdgeMasking', 'detalhe.mascara', 'nitidez só onde há borda; mesma faixa', { min: 0, max: 100 })
  direto('LuminanceSmoothing', 'detalhe.ruidoLuz', 'redutor próprio, guiado pelo ruído medido no arquivo', { min: 0, max: 100 })
  direto('ColorNoiseReduction', 'detalhe.ruidoCor', 'redutor próprio, guiado pelo ruído medido no arquivo', { min: 0, max: 100 })
  for (const [chave, padrao] of [
    ['LuminanceNoiseReductionDetail', 50],
    ['LuminanceNoiseReductionContrast', 0],
    ['ColorNoiseReductionDetail', 50],
    ['ColorNoiseReductionSmoothness', 50],
  ]) {
    if (tem(chave))
      anotar(
        chave,
        'ignorado',
        null,
        num(chaves[chave]) === padrao ? 'ajuste fino do redutor de ruído, no padrão' : `ajuste fino do redutor de ruído: ${R.semControle}`,
      )
  }

  // ── efeitos ──
  const grao = direto('GrainAmount', 'efeitos.grao', 'grão multiplicativo na luz da cena; mesma faixa', { min: 0, max: 100 })
  for (const [chave, caminho, neutro] of [
    ['GrainSize', 'efeitos.graoTamanho', 25],
    ['GrainFrequency', 'efeitos.graoAspereza', 50],
  ]) {
    if (!tem(chave)) continue
    if (!grao) anotar(chave, 'exato', caminho, 'sem grão, não age')
    else
      direto(chave, caminho, chave === 'GrainSize' ? 'tamanho do grão; mesma faixa' : 'a aspereza (Roughness) da interface; mesma faixa', {
        min: 0,
        max: 100,
        neutro,
      })
  }
  if (tem('GrainSeed')) anotar('GrainSeed', 'ignorado', null, 'a semente do grão aqui sai da própria foto')
  let vinheta = null
  if (tem('PostCropVignetteAmount')) {
    vinheta = num(chaves.PostCropVignetteAmount)
    if (vinheta == null) anotar('PostCropVignetteAmount', 'ignorado', null, 'valor ilegível')
    else if (desligado('PostCropVignetteAmount')) anotar('PostCropVignetteAmount', 'ignorado', null, R.desligado)
    else if (vinheta === 0) anotar('PostCropVignetteAmount', 'exato', 'efeitos.vinheta', R.neutro)
    else {
      por('efeitos.vinheta', Math.round(limitar((100 * vinhetaEmEv(limitar(vinheta, -100, 100))) / LOCAL.vinheta.ev, -100, 100)))
      anotar('PostCropVignetteAmount', 'aproximado', 'efeitos.vinheta', 'pelo ganho de canto publicado: (1 + a/100)^2,5 ao escurecer; aqui ±100 = ±2 EV')
    }
  }
  for (const [chave, caminho, neutro, razao] of [
    ['PostCropVignetteMidpoint', 'efeitos.vinhetaMeio', 50, 'onde a vinheta começa; mesma faixa'],
    ['PostCropVignetteFeather', 'efeitos.vinhetaSuavidade', 50, 'largura da transição; mesma faixa'],
  ]) {
    if (!tem(chave)) continue
    if (!vinheta) anotar(chave, 'exato', caminho, 'sem vinheta, não age')
    else direto(chave, caminho, razao, { min: 0, max: 100, neutro })
  }
  for (const [chave, padrao] of [
    ['PostCropVignetteRoundness', 0],
    ['PostCropVignetteStyle', 1],
    ['PostCropVignetteHighlightContrast', 0],
  ]) {
    if (!tem(chave)) continue
    const noPadrao = num(chaves[chave]) === padrao || !vinheta
    anotar(chave, noPadrao ? 'exato' : 'ignorado', null, noPadrao ? 'no padrão (ou sem vinheta)' : `forma e estilo da vinheta: ${R.semControle}`)
  }
  if (tem('OverrideLookVignette')) anotar('OverrideLookVignette', 'ignorado', null, 'vinheta do perfil: o perfil não é importado')

  // ── perfil ──
  if (tem('CameraProfile')) {
    meta.perfil = String(chaves.CameraProfile)
    anotar('CameraProfile', 'ignorado', null, `perfil de câmera "${meta.perfil.slice(0, 40)}": a cor de base é a do nosso motor`)
  }
  if (look) {
    const nome = typeof look.Name === 'string' ? look.Name : ''
    meta.look = nome
    const daAdobe = /adobe/i.test(String(look.Copyright ?? '')) || /^Adobe /.test(nome)
    vistas.add('Look')
    for (const chave of [
      'Name',
      'Amount',
      'Cluster',
      'UUID',
      'SupportsAmount',
      'SupportsMonochrome',
      'SupportsOutputReferred',
      'Copyright',
      'Group',
      'Stubbed',
    ]) {
      if (look[chave] != null) itens.push({ chave: `Look.${chave}`, valor: mostrar(look[chave]), classe: 'exato', para: 'meta', razao: R.meta })
    }
    const anotarLook = (chave, classe, razao) => itens.push({ chave: `Look.Parameters.${chave}`, valor: mostrar(parametros[chave]), classe, para: null, razao })
    for (const chave of Object.keys(parametros)) {
      if (/^ToneCurvePV2012/.test(chave)) continue // já tratadas com as curvas
      if (chave === 'LookTable' || chave === 'RGBTable') {
        const embutida = tem(`Table_${parametros[chave]}`)
        const tipoDaTabela = chave === 'LookTable' ? 'tabela de cor (matiz, saturação e valor)' : 'LUT 3D'
        anotarLook(
          chave,
          'ignorado',
          embutida
            ? `o perfil "${nome}" traz uma ${tipoDaTabela} embutida, que ainda não é lida`
            : `o perfil "${nome}" não veio no arquivo (só a referência à ${tipoDaTabela})`,
        )
        if (nome)
          avisos.push(
            `O perfil "${nome}" não foi importado${daAdobe ? ' (é da Adobe)' : ''}: a cor de base é a do nosso motor. A curva de tons dele foi aplicada.`,
          )
      } else if (chave === 'ConvertToGrayscale') anotarLook(chave, 'exato', bool(parametros[chave]) ? 'perfil em preto e branco: ligado' : 'em cores')
      else if (/^(Version|ProcessVersion|CameraProfile)$/.test(chave)) anotarLook(chave, 'exato', R.meta)
      else anotarLook(chave, 'ignorado', 'ajuste embutido no perfil, não importado')
    }
  }
  for (const chave of Object.keys(chaves)) {
    if (vistas.has(chave)) continue
    if (/^Table_[0-9A-Fa-f]{32}$/.test(chave)) anotar(chave, 'ignorado', null, 'dados de tabela de perfil: ainda não lidos', '(tabela)')
    else if (chave === 'RGBTable' || chave === 'LookTable' || chave === 'RGBTableAmount' || chave === 'ToneMapStrength') {
      anotar(chave, 'ignorado', null, 'tabela de perfil: ainda não lida')
    } else if (LENTE.test(chave)) {
      const ativo = /^(LensProfileEnable|AutoLateralCA)$/.test(chave) ? bool(chaves[chave]) : /Amount$/.test(chave) && num(chaves[chave])
      anotar(chave, 'ignorado', null, R.lente)
      if (ativo && !avisos.includes('A correção de lente do arquivo não foi importada.')) avisos.push('A correção de lente do arquivo não foi importada.')
    } else if (GEOMETRIA.test(chave)) {
      anotar(chave, 'ignorado', null, R.geometria)
      if (chave === 'HasCrop' && bool(chaves[chave])) avisos.push('O recorte do arquivo não foi importado.')
    } else if (MASCARAS.test(chave)) {
      anotar(chave, 'ignorado', null, R.mascara)
      const cheio = Array.isArray(chaves[chave]) ? chaves[chave].length > 0 : chaves[chave] && typeof chaves[chave] === 'object'
      if (cheio && !avisos.includes('O arquivo traz ajustes locais (máscaras, pincel ou retoque) que não foram importados.')) {
        avisos.push('O arquivo traz ajustes locais (máscaras, pincel ou retoque) que não foram importados.')
      }
    } else if (/^Auto(Brightness|Contrast|Exposure|Shadows|Tone|GrayscaleMix|WhiteVersion)$/.test(chave)) {
      anotar(chave, 'ignorado', null, 'automático do Lightroom: aqui o automático é o nosso, foto a foto')
    } else if (NOVOS.test(chave)) anotar(chave, 'ignorado', null, `recurso sem equivalente (${chave.replace(/s$/, '')}): ${R.semControle}`)
  }

  const desconhecidas = Object.keys(chaves).filter((c) => !vistas.has(c))
  for (const chave of desconhecidas) anotar(chave, 'ignorado', null, 'chave desconhecida')
  const resumo = { exato: 0, aproximado: 0, ignorado: 0 }
  for (const item of itens) resumo[item.classe]++
  return { ajustes, levar, relatorio: { itens, resumo, avisos, desconhecidas, meta }, daFoto }
}

// ─────────── entradas ───────────

function montar(chaves, opcoes, tipoDeArquivo, metaExtra = {}) {
  const tipo = opcoes.tipo ?? (chaves.PresetType != null || tipoDeArquivo === 'lrtemplate' ? 'predefinicao' : 'foto')
  if (String(chaves.PresetType ?? '') === 'Look') {
    throw erro('e-perfil', 'Este arquivo é um perfil do Lightroom (não uma predefinição). Perfis com tabela de cor ainda não são lidos.')
  }
  const { ajustes, levar, relatorio, daFoto } = converterChaves(chaves, { tipo })
  relatorio.meta.arquivo = tipoDeArquivo
  Object.assign(relatorio.meta, Object.fromEntries(Object.entries(metaExtra).filter(([, v]) => v)))
  const nome = opcoes.nome || relatorio.meta.nome || metaExtra.nome || 'Importada do Lightroom'
  const predefinicao = criarPredefinicao(
    {
      nome,
      familia: opcoes.familia ?? 'Importadas',
      descricao: opcoes.descricao ?? '',
      autor: relatorio.meta.direitos,
      ajustes: normalizar(ajustes),
      levar,
      origem: { tipo: 'lightroom', relatorio },
    },
    { agora: opcoes.agora ?? null },
  )
  return { predefinicao, relatorio, daFoto }
}

/** Importa um .xmp (predefinição ou sidecar de foto), em texto. Ver `importarLightroom`. */
export function importarXmp(xmp, opcoes = {}) {
  const chaves = chavesCrsDoXmp(xmp)
  if (!Object.keys(chaves).length) throw erro('sem-crs', 'Este arquivo não traz ajustes do Lightroom.')
  return montar(chaves, opcoes, opcoes.arquivo ?? 'xmp')
}

/** Importa o XMP embutido num JPEG exportado pelo Lightroom (bytes). Os ajustes embutidos são os daquela foto. */
export function importarJpeg(bytes, opcoes = {}) {
  const { principal, estendido } = xmpDoJpeg(bytes)
  if (!principal) throw erro('sem-xmp', 'Este JPEG não traz XMP embutido.')
  const chaves = chavesCrsDoXmp(principal)
  if (estendido) Object.assign(chaves, chavesCrsDoXmp(estendido))
  if (!Object.keys(chaves).length) throw erro('sem-crs', 'Este JPEG não traz os ajustes do Lightroom (foi exportado sem eles).')
  return montar(chaves, opcoes, 'jpeg')
}

/** Importa um .lrtemplate (texto ou bytes). */
export function importarLrtemplate(entrada, opcoes = {}) {
  const { chaves, meta } = lerLrtemplate(entrada)
  return montar(chaves, opcoes, 'lrtemplate', { nome: meta.nome, uuid: meta.uuid })
}

/**
 * Importa do Lightroom o que vier: .xmp de predefinição, sidecar .xmp, JPEG com XMP embutido ou .lrtemplate (texto
 * ou bytes; o tipo é reconhecido pelo conteúdo).
 *
 * `opcoes`: nome (o do arquivo, quando o XMP não traz), familia (padrão 'Importadas'), tipo ('predefinicao' | 'foto':
 * força como tratar exposição e branco), agora (ISO, para `criadaEm`).
 *
 * Devolve { predefinicao, relatorio: { itens: [{ chave, valor, classe, para, razao }], resumo: { exato, aproximado,
 * ignorado }, avisos, desconhecidas, meta }, daFoto: { exposicao?, branco? } }. O relatório também vai dentro de
 * `predefinicao.origem.relatorio`. Lança `ErroLightroom` (ou `ErroLrtemplate`) com a frase para a tela.
 */
export function importarLightroom(entrada, opcoes = {}) {
  let bytes = entrada instanceof ArrayBuffer ? new Uint8Array(entrada) : entrada
  if (bytes instanceof Uint8Array) {
    if (!bytes.length) throw erro('vazio', 'O arquivo está vazio.')
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return importarJpeg(bytes, opcoes)
    if (bytes.length > TAMANHO_MAX) throw erro('grande', 'Este arquivo é grande demais para uma predefinição.')
    bytes = new TextDecoder('utf-8').decode(bytes)
  }
  if (typeof bytes !== 'string' || !bytes.trim()) throw erro('vazio', 'O arquivo está vazio.')
  const texto = bytes.replace(/^\uFEFF/, '')
  if (pareceLrtemplate(texto)) return importarLrtemplate(texto, opcoes)
  if (!texto.includes('<')) throw erro('nao-reconhecido', 'Este arquivo não é uma predefinição do Lightroom (.xmp ou .lrtemplate).')
  return importarXmp(texto, opcoes)
}
