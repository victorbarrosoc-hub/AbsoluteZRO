// Perfis ICC gerados por código: versão 4.3, classe monitor, matriz + curva paramétrica. É o que vai embutido em todo
// arquivo exportado, para a cor valer fora do app. Nenhum arquivo .icc entra no repositório: as primárias e as curvas
// são as de src/motor/cor/espacos.js, as mesmas que o motor usou para escrever os pixels.
//
// Especificação: ICC.1:2010 (perfil 4.3.0.0).
//   7.2      cabeçalho de 128 bytes            7.2.16  iluminante do PCS: D50 = (0,9642; 1; 0,8249)
//   7.2.18   identificador = MD5 do perfil com os campos de marcas, intenção e identificador zerados
//   7.3      tabela de tags (assinatura, posição, tamanho); os dados começam em múltiplo de 4
//   8.4.3    perfil de monitor de três componentes por matriz: desc, cprt, wtpt, r/g/bXYZ, r/g/bTRC (e chad)
//   9.2.34   wtpt de monitor é o branco adotado já adaptado ao PCS, ou seja, D50
//   9.2.12   chad: a matriz que levou o branco do aparelho ao D50 (aqui Bradford, a do anexo E)
//   10.13    mluc (texto em UTF-16BE)   10.16  para (curva paramétrica)   10.21  sf32   10.27  XYZ
//
// As colunas da matriz (rXYZ, gXYZ, bXYZ) são as primárias em XYZ adaptadas ao D50 do PCS por Bradford: somadas dão o
// próprio D50. A curva vai como função (para), não como tabela: quem lê refaz a conta em ponto flutuante.

import { matrizAdaptacao } from '../motor/cor/adaptacao.js'
import { CURVAS, ESPACOS, rgbParaXyz, xyParaXYZ } from '../motor/cor/espacos.js'
import { mulM } from '../motor/cor/matriz.js'

/** Iluminante do PCS (ICC.1:2010, 7.2.16). Não é o D50 de xy arredondado: é este trio, com quatro casas. */
export const D50_PCS = [0.9642, 1, 0.8249]

// Data de criação gravada no cabeçalho (7.2.8). Fixa, para o mesmo espaço dar sempre os mesmos bytes: é o dia em que
// este gerador foi escrito.
const CRIACAO = [2026, 11, 13, 0, 0, 0]

// O que aparece no seletor de perfil dos outros programas. "Adobe RGB (1998)" é marca da Adobe: perfil que não é o
// dela se apresenta como compatível.
const DESCRICAO = {
  srgb: 'sRGB',
  p3: 'Display P3',
  adobe: 'Adobe RGB (1998) compatible',
  rec2020: 'Rec.2020',
  prophoto: 'ProPhoto RGB',
}
// A tag de direitos é obrigatória. O perfil são só os números públicos dos padrões: não há o que reservar.
const DIREITOS = 'No copyright, use freely.'

/** Nome que vai na tag `desc` do perfil (e no campo de nome do iCCP do PNG). */
export function descricaoDoPerfil(espaco) {
  if (!ESPACOS[espaco]) throw new Error(`Espaço de cor desconhecido: ${espaco}`)
  return DESCRICAO[espaco] ?? ESPACOS[espaco].nome
}

// ─────────── a conta ───────────

/**
 * RGB linear do espaço → XYZ no PCS (D50 do ICC), linha a linha. O branco do espaço (D65 ou o D50 do ROMM) vai ao D50
 * do PCS por Bradford, então RGB (1, 1, 1) dá exatamente (0,9642; 1; 0,8249).
 */
export function matrizDoPerfil(espaco) {
  const e = ESPACOS[espaco]
  if (!e) throw new Error(`Espaço de cor desconhecido: ${espaco}`)
  return mulM(adaptacaoDoPerfil(espaco), rgbParaXyz(e))
}

/** A adaptação cromática do branco do espaço ao D50 do PCS (Bradford): é o que a tag `chad` guarda. */
export function adaptacaoDoPerfil(espaco) {
  const e = ESPACOS[espaco]
  if (!e) throw new Error(`Espaço de cor desconhecido: ${espaco}`)
  return matrizAdaptacao(xyParaXYZ(e.branco), D50_PCS, 'bradford')
}

/**
 * A curva do espaço na forma do ICC (10.16, tabela 65), de código para luz:
 *   tipo 0   Y = X^g
 *   tipo 3   Y = (a·X + b)^g  para X ≥ d;   Y = c·X  para X < d            parâmetros na ordem g, a, b, c, d
 * Os números são os das normas citadas em espacos.js; o teste confere, ponto a ponto, que esta função é a
 * `decodificar` do motor.
 */
export function curvaDoPerfil(espaco) {
  const e = ESPACOS[espaco]
  if (!e) throw new Error(`Espaço de cor desconhecido: ${espaco}`)
  switch (e.curva) {
    case 'srgb': // IEC 61966-2-1
      return { tipo: 3, parametros: [2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045] }
    case 'gama22': // Adobe RGB (1998), 4.3.4.2: 563/256 cabe exato em s15Fixed16
      return { tipo: 0, parametros: [563 / 256] }
    case 'rec2020': {
      // BT.2020-2, tabela 4: V = α·L^0,45 − (α − 1) acima de β, 4,5·L abaixo. O α sai da curva do motor (não é
      // exportado de lá): de V(1/2) = α·0,5^0,45 − (α − 1). O β é onde os dois trechos têm a mesma inclinação.
      const alfa = (1 - CURVAS.rec2020.codificar(0.5)) / (1 - 0.5 ** 0.45)
      const beta = (alfa / 10) ** (1 / 0.55)
      return { tipo: 3, parametros: [1 / 0.45, 1 / alfa, (alfa - 1) / alfa, 1 / 4.5, 4.5 * beta] }
    }
    case 'prophoto': // ISO 22028-2: reta de inclinação 1/16 abaixo de 16/512
      return { tipo: 3, parametros: [1.8, 1, 0, 1 / 16, 16 / 512] }
    default:
      throw new Error(`Curva sem forma paramétrica: ${e.curva}`)
  }
}

/** Avalia uma curva paramétrica do ICC (tipos 0 a 4) num código de 0 a 1. */
export function avaliarCurva({ tipo, parametros }, x) {
  const [g, a = 1, b = 0, c = 0, d = 0, e = 0, f = 0] = parametros
  if (tipo === 0) return x ** g
  if (tipo === 1) return x >= -b / a ? (a * x + b) ** g : 0
  if (tipo === 2) return x >= -b / a ? (a * x + b) ** g + c : c
  if (tipo === 3) return x >= d ? (a * x + b) ** g : c * x
  if (tipo === 4) return x >= d ? (a * x + b) ** g + e : c * x + f
  throw new Error(`Curva paramétrica de tipo desconhecido: ${tipo}`)
}

// ─────────── bytes ───────────

/** Número → s15Fixed16 (ICC.1:2010, 4.6), arredondado ao mais próximo. */
export const paraFixo = (v) => Math.round(v * 65536) | 0
export const deFixo = (i) => i / 65536

const ascii4 = (s) => (s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3)

function elemento(tipo, corpo) {
  const bytes = new Uint8Array(8 + corpo)
  const vista = new DataView(bytes.buffer)
  vista.setUint32(0, ascii4(tipo))
  return { bytes, vista }
}

function elementoXyz(xyz) {
  const { bytes, vista } = elemento('XYZ ', 12)
  for (let i = 0; i < 3; i++) vista.setInt32(8 + i * 4, paraFixo(xyz[i]))
  return bytes
}

function elementoCurva({ tipo, parametros }) {
  const { bytes, vista } = elemento('para', 4 + parametros.length * 4)
  vista.setUint16(8, tipo)
  parametros.forEach((p, i) => vista.setInt32(12 + i * 4, paraFixo(p)))
  return bytes
}

function elementoMatriz(m) {
  const { bytes, vista } = elemento('sf32', 36)
  for (let i = 0; i < 9; i++) vista.setInt32(8 + i * 4, paraFixo(m[i]))
  return bytes
}

// mluc com um registro só (enUS): 16 bytes de cabeçalho + 12 do registro + o texto em UTF-16BE
function elementoTexto(texto) {
  const { bytes, vista } = elemento('mluc', 8 + 12 + texto.length * 2)
  vista.setUint32(8, 1)
  vista.setUint32(12, 12)
  vista.setUint16(16, 0x656e) // 'en'
  vista.setUint16(18, 0x5553) // 'US'
  vista.setUint32(20, texto.length * 2)
  vista.setUint32(24, 28)
  for (let i = 0; i < texto.length; i++) vista.setUint16(28 + i * 2, texto.charCodeAt(i))
  return bytes
}

/**
 * MD5 (RFC 1321). Só para o identificador do perfil, que a especificação pede por este resumo; não protege nada.
 * As 64 constantes são floor(|sen(i + 1)|·2³²), como a RFC as define.
 */
export function md5(bytes) {
  const K = new Int32Array(64)
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
  const n = bytes.length
  const total = (((n + 8) >>> 6) + 1) << 6
  const cheio = new Uint8Array(total)
  cheio.set(bytes)
  cheio[n] = 0x80
  const vista = new DataView(cheio.buffer)
  vista.setUint32(total - 8, (n << 3) >>> 0, true)
  vista.setUint32(total - 4, Math.floor(n / 536870912), true)
  let a0 = 0x67452301
  let b0 = 0xefcdab89 | 0
  let c0 = 0x98badcfe | 0
  let d0 = 0x10325476
  const M = new Int32Array(16)
  for (let p = 0; p < total; p += 64) {
    for (let i = 0; i < 16; i++) M[i] = vista.getInt32(p + i * 4, true)
    let A = a0
    let B = b0
    let C = c0
    let D = d0
    for (let i = 0; i < 64; i++) {
      let F
      let g
      if (i < 16) {
        F = (B & C) | (~B & D)
        g = i
      } else if (i < 32) {
        F = (D & B) | (~D & C)
        g = (5 * i + 1) & 15
      } else if (i < 48) {
        F = B ^ C ^ D
        g = (3 * i + 5) & 15
      } else {
        F = C ^ (B | ~D)
        g = (7 * i) & 15
      }
      F = (F + A + K[i] + M[g]) | 0
      const s = S[((i >> 4) << 2) | (i & 3)]
      A = D
      D = C
      C = B
      B = (B + ((F << s) | (F >>> (32 - s)))) | 0
    }
    a0 = (a0 + A) | 0
    b0 = (b0 + B) | 0
    c0 = (c0 + C) | 0
    d0 = (d0 + D) | 0
  }
  const saida = new Uint8Array(16)
  const vs = new DataView(saida.buffer)
  vs.setInt32(0, a0, true)
  vs.setInt32(4, b0, true)
  vs.setInt32(8, c0, true)
  vs.setInt32(12, d0, true)
  return saida
}

const brancoEhD50 = (branco) => {
  const [x, y, z] = xyParaXYZ(branco)
  return Math.abs(x - D50_PCS[0]) < 1e-3 && Math.abs(y - D50_PCS[1]) < 1e-3 && Math.abs(z - D50_PCS[2]) < 1e-3
}

function montar(espaco) {
  const e = ESPACOS[espaco]
  const m = matrizDoPerfil(espaco)
  const curva = elementoCurva(curvaDoPerfil(espaco))
  // Uma lista de elementos (os dados) e as tags que apontam para eles: as três curvas dividem o mesmo elemento (7.3.1).
  const elementos = [
    { tags: ['desc'], bytes: elementoTexto(descricaoDoPerfil(espaco)) },
    { tags: ['cprt'], bytes: elementoTexto(DIREITOS) },
    { tags: ['wtpt'], bytes: elementoXyz(D50_PCS) },
    { tags: ['rXYZ'], bytes: elementoXyz([m[0], m[3], m[6]]) },
    { tags: ['gXYZ'], bytes: elementoXyz([m[1], m[4], m[7]]) },
    { tags: ['bXYZ'], bytes: elementoXyz([m[2], m[5], m[8]]) },
    { tags: ['rTRC', 'gTRC', 'bTRC'], bytes: curva },
  ]
  // chad só quando o branco do espaço não é o do PCS (o ROMM já é D50)
  if (!brancoEhD50(e.branco)) elementos.push({ tags: ['chad'], bytes: elementoMatriz(adaptacaoDoPerfil(espaco)) })

  const quantas = elementos.reduce((s, el) => s + el.tags.length, 0)
  const alinhar = (n) => (n + 3) & ~3
  let pos = 128 + 4 + quantas * 12
  for (const el of elementos) {
    el.onde = pos
    pos += alinhar(el.bytes.length)
  }
  const perfil = new Uint8Array(pos)
  const v = new DataView(perfil.buffer)
  v.setUint32(0, pos)
  v.setUint32(8, 0x04300000) // versão 4.3.0.0
  v.setUint32(12, ascii4('mntr'))
  v.setUint32(16, ascii4('RGB '))
  v.setUint32(20, ascii4('XYZ '))
  CRIACAO.forEach((n, i) => v.setUint16(24 + i * 2, n))
  v.setUint32(36, ascii4('acsp'))
  // 40 plataforma, 44 marcas, 48 fabricante, 52 modelo, 56 atributos, 64 intenção (0 = perceptiva), 80 criador: zero
  for (let i = 0; i < 3; i++) v.setInt32(68 + i * 4, paraFixo(D50_PCS[i]))
  v.setUint32(128, quantas)
  let t = 132
  for (const el of elementos) {
    for (const tag of el.tags) {
      v.setUint32(t, ascii4(tag))
      v.setUint32(t + 4, el.onde)
      v.setUint32(t + 8, el.bytes.length)
      t += 12
    }
    perfil.set(el.bytes, el.onde)
  }
  // 7.2.18: o identificador é calculado com marcas (44), intenção (64) e ele mesmo (84) em zero; aqui já estão
  perfil.set(md5(perfil), 84)
  return perfil
}

const prontos = new Map()

/**
 * Perfil ICC do espaço ('srgb' | 'p3' | 'adobe' | 'rec2020' | 'prophoto'), pronto para embutir. Sempre os mesmos
 * bytes para o mesmo espaço; cada chamada devolve uma cópia.
 */
export function perfilIcc(espaco) {
  if (!ESPACOS[espaco]) throw new Error(`Espaço de cor desconhecido: ${espaco}`)
  if (!prontos.has(espaco)) prontos.set(espaco, montar(espaco))
  return prontos.get(espaco).slice()
}

// ─────────── leitura: para conferir o que foi escrito e reconhecer o perfil de um arquivo que chega ───────────

const texto4 = (v, p) => String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3))

function lerElemento(v, onde, tamanho) {
  const tipo = texto4(v, onde)
  if (tipo === 'XYZ ') return { tipo, xyz: [0, 1, 2].map((i) => deFixo(v.getInt32(onde + 8 + i * 4))) }
  if (tipo === 'para') {
    const funcao = v.getUint16(onde + 8)
    const n = [1, 3, 4, 5, 7][funcao]
    if (n === undefined) throw new Error(`ICC: curva paramétrica de tipo ${funcao}`)
    return { tipo, curva: { tipo: funcao, parametros: Array.from({ length: n }, (_, i) => deFixo(v.getInt32(onde + 12 + i * 4))) } }
  }
  if (tipo === 'sf32') return { tipo, valores: Array.from({ length: (tamanho - 8) >> 2 }, (_, i) => deFixo(v.getInt32(onde + 8 + i * 4))) }
  if (tipo === 'mluc') {
    const n = v.getUint32(onde + 8)
    const textos = {}
    for (let i = 0; i < n; i++) {
      const r = onde + 16 + i * 12
      const lingua = String.fromCharCode(v.getUint8(r), v.getUint8(r + 1), v.getUint8(r + 2), v.getUint8(r + 3))
      const bytes = v.getUint32(r + 4)
      const inicio = onde + v.getUint32(r + 8)
      let s = ''
      for (let k = 0; k < bytes; k += 2) s += String.fromCharCode(v.getUint16(inicio + k))
      textos[lingua] = s
    }
    return { tipo, textos, texto: textos.enUS ?? Object.values(textos)[0] ?? '' }
  }
  // perfis v2 de terceiros: descrição em ASCII (desc) e direitos (text)
  if (tipo === 'desc' || tipo === 'text') {
    const inicio = tipo === 'desc' ? onde + 12 : onde + 8
    const n = tipo === 'desc' ? v.getUint32(onde + 8) : tamanho - 8
    let s = ''
    for (let i = 0; i < n && v.getUint8(inicio + i) !== 0; i++) s += String.fromCharCode(v.getUint8(inicio + i))
    return { tipo, texto: s }
  }
  return { tipo }
}

/**
 * Lê cabeçalho e tags de um perfil ICC. Lança se os bytes não forem um perfil.
 * → { tamanho, versao: '4.3', classe, espacoDeCor, pcs, criacao, intencao, iluminante, id, tags: { rXYZ: { tipo, xyz }, … } }
 */
export function lerIcc(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 132) throw new Error('ICC: perfil curto demais')
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (texto4(v, 36) !== 'acsp') throw new Error('ICC: falta a assinatura acsp')
  const tamanho = v.getUint32(0)
  if (tamanho > bytes.length) throw new Error('ICC: o perfil diz ser maior do que os bytes recebidos')
  const quantas = v.getUint32(128)
  if (132 + quantas * 12 > tamanho) throw new Error('ICC: tabela de tags fora do perfil')
  const tags = {}
  for (let i = 0; i < quantas; i++) {
    const t = 132 + i * 12
    const onde = v.getUint32(t + 4)
    const tam = v.getUint32(t + 8)
    if (onde + tam > tamanho || tam < 8) throw new Error('ICC: tag fora do perfil')
    tags[texto4(v, t)] = { ...lerElemento(v, onde, tam), onde, tamanho: tam }
  }
  return {
    tamanho,
    versao: `${v.getUint8(8)}.${v.getUint8(9) >> 4}`,
    classe: texto4(v, 12),
    espacoDeCor: texto4(v, 16),
    pcs: texto4(v, 20),
    criacao: [0, 1, 2, 3, 4, 5].map((i) => v.getUint16(24 + i * 2)),
    intencao: v.getUint32(64),
    iluminante: [0, 1, 2].map((i) => deFixo(v.getInt32(68 + i * 4))),
    id: bytes.slice(84, 100),
    tags,
  }
}

/**
 * Qual dos nossos espaços um perfil descreve, pelas primárias (tolerância de 0,002 em XYZ) e pela curva; null se
 * nenhum. Serve para a foto que chega com perfil embutido (o nome do perfil não é confiável; os números são).
 */
export function espacoDoPerfil(bytes) {
  let perfil
  try {
    perfil = lerIcc(bytes)
  } catch {
    return null
  }
  const { rXYZ, gXYZ, bXYZ, rTRC } = perfil.tags
  if (!rXYZ?.xyz || !gXYZ?.xyz || !bXYZ?.xyz) return null
  for (const espaco of Object.keys(ESPACOS)) {
    const m = matrizDoPerfil(espaco)
    const colunas = [rXYZ.xyz, gXYZ.xyz, bXYZ.xyz]
    let perto = true
    for (let c = 0; c < 3 && perto; c++) for (let l = 0; l < 3; l++) if (Math.abs(colunas[c][l] - m[l * 3 + c]) > 2e-3) perto = false
    if (!perto) continue
    // sRGB e Display P3 têm primárias diferentes; Adobe e sRGB dividem o vermelho e o azul mas não o verde. A curva só
    // desempata se o perfil a traz em forma paramétrica.
    if (rTRC?.curva) {
      const nossa = curvaDoPerfil(espaco)
      let igual = true
      for (const x of [0.02, 0.2, 0.5, 0.8]) if (Math.abs(avaliarCurva(rTRC.curva, x) - avaliarCurva(nossa, x)) > 2e-3) igual = false
      if (!igual) continue
    }
    return espaco
  }
  return null
}
