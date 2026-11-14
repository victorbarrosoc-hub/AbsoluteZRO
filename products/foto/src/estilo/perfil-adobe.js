// Perfis do Lightroom / Camera Raw: as tabelas embutidas em XMP (crs:RGBTable e crs:LookTable apontam para um atributo
// crs:Table_<MD5> com a tabela codificada) e uma aproximação NOSSA dos perfis padrão da Adobe pelo nome.
//
// O FORMATO (docs/estudo/predefinicoes.md, 3.2; não há documento público da Adobe, o pedido para documentar segue sem
// resposta oficial: community.adobe.com, "Document the format of RGB LUTs in enhanced profiles"). Lido da
// especificação de código do DNG SDK da Adobe (dng_big_table.cpp: ASCIItoBinary, DecodeFromBinary, GetStream;
// dng_reference.cpp: RefRGBtoRGBTable3D; licença própria da Adobe, permissiva) e conferido com o leitor do mini-film
// (Rust, rgb_table.rs). Nenhum código copiado: o que está aqui é a descrição do formato, escrita de novo.
//
//   texto   base85 com alfabeto próprio, 0-9 a-z A-Z . - : + = ^ ! / * ? ` ' | ( ) [ ] { } @ % $ #; cinco dígitos
//           formam um uint32 little-endian com o PRIMEIRO dígito menos significativo; grupo final de k dígitos (2 a
//           4) rende k − 1 bytes; caractere fora do alfabeto é ignorado
//   bytes   uint32 LE com o tamanho descompactado, depois um fluxo zlib (RFC 1950)
//   fluxo   o MD5 dele é o digest do nome do atributo (a prova de que a leitura está certa)
//   RGB     u32 tipo = 1, versão = 1, dimensões (1 ou 3), divisões (1D: 2..4096; 3D: 2..32); divisões^dim amostras de
//           3 × u16, cada uma um DELTA somado (com estouro de 16 bits) à rampa neutra nop[i] = (i·65535 + ⌊d/2⌋) ÷
//           (d − 1); no 3D o vermelho é o laço de fora e o azul o de dentro; depois u32 primárias (0 sRGB, 1 Adobe
//           RGB, 2 ProPhoto, 3 Display P3, 4 Rec.2020), u32 gama (0 linear, 1 sRGB, 2 = 1,8, 3 = 2,2, 4 Rec.709), u32
//           gamut (0 corta, 1 estende), f64 quantidade mínima e máxima, u32 flags opcional
//   HSV     (LookTable) u32 tipo = 0, versão 1 ou 2, divisões de matiz, saturação e valor, três float32 por nó
//           (desvio de matiz em graus, escala de saturação, escala de valor), u32 codificação; v2: f64 mín e máx
//
// ONDE A TABELA RGB AGE (dng_render.cpp): depois da curva de tom do perfil, na luz linear do ProPhoto: converte para as
// primárias da tabela, corta em 0..1 (no "estende", guarda o que passou e devolve no fim), aplica a gama, lê a tabela por
// interpolação tetraédrica, mistura pela quantidade, tira a gama e volta. É uma conta sobre cor já pronta para a tela:
// o nosso look (look.js) age no mesmo lugar, depois da tela. Por isso a tabela vira um look 33³ no código sRGB, com a
// conta acima feita em cada nó. A tabela HSV (LookTable) age ANTES da curva de tom, na luz de cena da Adobe: não cabe
// no look e não é aplicada (o relatório diz por quê).

import { CURVAS, matrizEntre } from '../motor/cor/espacos.js'
import { mulV } from '../motor/cor/matriz.js'
import { criarTela, MARGENS } from '../motor/tela.js'
import { criarLut } from './look.js'
import { inflar } from './inflar.js'

export class ErroPerfil extends Error {
  constructor(codigo, mensagem) {
    super(mensagem)
    this.name = 'ErroPerfil'
    this.codigo = codigo
  }
}
const erro = (codigo, mensagem) => new ErroPerfil(codigo, mensagem)

// ─────────── base85 da Adobe ───────────

export const ALFABETO_85 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?`'|()[]{}@%$#"
const DIGITO = new Int8Array(128).fill(-1)
for (let i = 0; i < 85; i++) DIGITO[ALFABETO_85.charCodeAt(i)] = i

/** Texto base85 da Adobe → bytes. */
export function deBase85(texto) {
  const digitos = []
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    const d = c < 128 ? DIGITO[c] : -1
    if (d >= 0) digitos.push(d)
  }
  const inteiros = Math.floor(digitos.length / 5)
  const sobra = digitos.length % 5
  if (sobra === 1) throw erro('tabela', 'A tabela do perfil está truncada (base85 com um dígito sobrando).')
  const bytes = new Uint8Array(inteiros * 4 + (sobra ? sobra - 1 : 0))
  let o = 0
  for (let g = 0; g * 5 < digitos.length; g++) {
    let v = 0
    let peso = 1
    const k = Math.min(5, digitos.length - g * 5)
    for (let j = 0; j < k; j++) {
      v += digitos[g * 5 + j] * peso
      peso *= 85
    }
    const quantos = k === 5 ? 4 : k - 1
    for (let j = 0; j < quantos; j++) bytes[o++] = Math.floor(v / 2 ** (8 * j)) & 255
  }
  return bytes
}

/** Bytes → texto base85 da Adobe (a volta de `deBase85`; serve para testes e para escrever perfis). */
export function paraBase85(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 4) {
    const k = Math.min(4, bytes.length - i)
    let v = 0
    for (let j = 0; j < k; j++) v += bytes[i + j] * 2 ** (8 * j)
    for (let j = 0; j < k + 1; j++) {
      s += ALFABETO_85[v % 85]
      v = Math.floor(v / 85)
    }
  }
  return s
}

// ─────────── MD5 (RFC 1321) ───────────

const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)

/** MD5 dos bytes, em hexadecimal maiúsculo (como o digest dos atributos crs:Table_). */
export function md5(bytes) {
  const n = bytes.length
  const total = (((n + 8) >> 6) + 1) * 64
  const m = new Uint8Array(total)
  m.set(bytes)
  m[n] = 0x80
  const bits = n * 8
  for (let j = 0; j < 8; j++) m[total - 8 + j] = Math.floor(bits / 2 ** (8 * j)) & 255
  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476
  const X = new Uint32Array(16)
  for (let off = 0; off < total; off += 64) {
    for (let j = 0; j < 16; j++) X[j] = m[off + j * 4] | (m[off + j * 4 + 1] << 8) | (m[off + j * 4 + 2] << 16) | (m[off + j * 4 + 3] << 24)
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
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        F = B ^ C ^ D
        g = (3 * i + 5) % 16
      } else {
        F = C ^ (B | ~D)
        g = (7 * i) % 16
      }
      const s = MD5_S[(i >> 4) * 4 + (i % 4)]
      const t = (A + F + MD5_K[i] + X[g]) >>> 0
      A = D
      D = C
      C = B
      B = (B + ((t << s) | (t >>> (32 - s)))) >>> 0
    }
    a0 = (a0 + A) >>> 0
    b0 = (b0 + B) >>> 0
    c0 = (c0 + C) >>> 0
    d0 = (d0 + D) >>> 0
  }
  let hex = ''
  for (const v of [a0, b0, c0, d0]) for (let j = 0; j < 4; j++) hex += ((v >>> (8 * j)) & 255).toString(16).padStart(2, '0')
  return hex.toUpperCase()
}

// ─────────── a tabela ───────────

const PRIMARIAS = ['srgb', 'adobe', 'prophoto', 'p3', 'rec2020']
const GAMAS = ['linear', 'srgb', '1,8', '2,2', 'rec709']

/**
 * O texto de um atributo crs:Table_<digest> → { tipo: 'rgb' | 'hsv', digest, confere (MD5 do fluxo = digest), …campos
 * da tabela }. RGB: { dimensoes, divisoes, amostras: Uint16Array (3 por nó, já somadas à rampa), primarias, gama,
 * gamut: 'corta' | 'estende', minimo, maximo, flags }. HSV: { versao, divisoes: [matiz, sat, valor], nos:
 * Float32Array, codificacao }. Lança ErroPerfil.
 */
export function lerTabela(texto, digest = null) {
  const bytes = deBase85(texto)
  if (bytes.length < 5) throw erro('tabela', 'A tabela do perfil está vazia.')
  const tamanho = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0
  if (tamanho > 64 * 1024 * 1024) throw erro('tabela', 'A tabela do perfil é grande demais.')
  let fluxo
  try {
    fluxo = inflar(bytes.subarray(4), tamanho)
  } catch (e) {
    throw erro('tabela', `A tabela do perfil não descompacta (${e.message}).`)
  }
  if (fluxo.length !== tamanho) throw erro('tabela', 'A tabela do perfil não tem o tamanho que declara.')
  const md = md5(fluxo)
  const v = new DataView(fluxo.buffer, fluxo.byteOffset, fluxo.byteLength)
  let p = 0
  const u32 = () => {
    if (p + 4 > fluxo.length) throw erro('tabela', 'A tabela do perfil está truncada.')
    const x = v.getUint32(p, true)
    p += 4
    return x
  }
  const f64 = () => {
    if (p + 8 > fluxo.length) throw erro('tabela', 'A tabela do perfil está truncada.')
    const x = v.getFloat64(p, true)
    p += 8
    return x
  }
  const base = { digest: md, confere: digest ? md === String(digest).toUpperCase() : null, bytes: fluxo.length }
  const tipo = u32()
  if (tipo === 1) {
    if (u32() !== 1) throw erro('tabela', 'Versão de tabela RGB desconhecida.')
    const dimensoes = u32()
    const divisoes = u32()
    if (dimensoes !== 1 && dimensoes !== 3) throw erro('tabela', 'A tabela RGB precisa ter 1 ou 3 dimensões.')
    if (divisoes < 2 || divisoes > (dimensoes === 1 ? 4096 : 32)) throw erro('tabela', 'Número de divisões fora do formato.')
    const nos = dimensoes === 1 ? divisoes : divisoes ** 3
    if (p + nos * 6 > fluxo.length) throw erro('tabela', 'A tabela do perfil está truncada.')
    const nop = Array.from({ length: divisoes }, (_, i) => Math.floor((i * 0xffff + (divisoes >> 1)) / (divisoes - 1)))
    const amostras = new Uint16Array(nos * 3)
    for (let k = 0; k < nos; k++) {
      // 3D: k = (r·d + g)·d + b; 1D: a rampa é a mesma nos três canais
      const r = dimensoes === 1 ? k : Math.floor(k / (divisoes * divisoes))
      const g = dimensoes === 1 ? k : Math.floor(k / divisoes) % divisoes
      const b = dimensoes === 1 ? k : k % divisoes
      amostras[k * 3] = (v.getUint16(p, true) + nop[r]) & 0xffff
      amostras[k * 3 + 1] = (v.getUint16(p + 2, true) + nop[g]) & 0xffff
      amostras[k * 3 + 2] = (v.getUint16(p + 4, true) + nop[b]) & 0xffff
      p += 6
    }
    const prim = u32()
    const gama = u32()
    const gamut = u32()
    if (prim >= PRIMARIAS.length || gama >= GAMAS.length || gamut > 1) throw erro('tabela', 'Primárias, gama ou gamut fora do formato.')
    const minimo = f64()
    const maximo = f64()
    if (!(minimo >= 0 && minimo <= 1 && maximo >= 1)) throw erro('tabela', 'Faixa de quantidade fora do formato.')
    const flags = p + 4 <= fluxo.length ? u32() : 0
    return { ...base, tipo: 'rgb', dimensoes, divisoes, amostras, primarias: PRIMARIAS[prim], gama: GAMAS[gama], gamut: gamut ? 'estende' : 'corta', minimo, maximo, flags }
  }
  if (tipo === 0) {
    const versao = u32()
    if (versao !== 1 && versao !== 2) throw erro('tabela', 'Versão de tabela HSV desconhecida.')
    const divisoes = [u32(), u32(), u32()]
    const nos = divisoes[0] * divisoes[1] * divisoes[2]
    if (!nos || divisoes[0] > 360 || divisoes[1] > 256 || divisoes[2] > 256 || p + nos * 12 > fluxo.length) throw erro('tabela', 'Tabela HSV fora do formato.')
    const valores = new Float32Array(nos * 3)
    for (let k = 0; k < nos * 3; k++, p += 4) valores[k] = v.getFloat32(p, true)
    const codificacao = u32()
    return { ...base, tipo: 'hsv', versao, divisoes, nos: valores, codificacao }
  }
  throw erro('tabela', `Tipo de tabela desconhecido (${tipo}).`)
}

// ─────────── a tabela RGB como look ───────────

// as gamas da tabela (dng_color_space.cpp): 1,8 e 2,2 têm um pé em spline cúbica de Hermite perto do zero, de (0, 0)
// com inclinação 32 até (x1, y1) com a inclinação da potência ali
function gamaComPe(gama) {
  const g = 1 / gama
  const x1 = (32 ** (1 / (g - 1))) * 2
  const y1 = x1 ** g
  const d1 = g * x1 ** (g - 1)
  const hermite = (x) => {
    const t = x / x1
    const t2 = t * t
    const t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * 0 + (t3 - 2 * t2 + t) * x1 * 32 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * x1 * d1
  }
  const codificar = (x) => (x <= 0 ? 0 : x <= x1 ? hermite(x) : x ** g)
  // a volta: potência acima do pé; no pé, bisseção (é monótona)
  const decodificar = (y) => {
    if (y <= 0) return 0
    if (y >= y1) return y ** gama
    let a = 0
    let b = x1
    for (let i = 0; i < 40; i++) {
      const m = (a + b) / 2
      if (hermite(m) < y) a = m
      else b = m
    }
    return (a + b) / 2
  }
  return { codificar, decodificar }
}
const REC709 = {
  codificar: (x) => (x <= 0 ? 0 : x < 0.018 ? 4.5 * x : 1.099 * x ** 0.45 - 0.099),
  decodificar: (y) => (y <= 0 ? 0 : y < 0.081 ? y / 4.5 : ((y + 0.099) / 1.099) ** (1 / 0.45)),
}
const LINEAR = { codificar: (x) => x, decodificar: (y) => y }
const curvaDaTabela = (gama) => (gama === 'linear' ? LINEAR : gama === 'srgb' ? CURVAS.srgb : gama === '1,8' ? gamaComPe(1.8) : gama === '2,2' ? gamaComPe(2.2) : REC709)

/** Lê a tabela RGB 3D (ou 1D) num ponto já codificado (0..1): interpolação tetraédrica, como o DNG SDK. */
function lerRgb(t, r, g, b, saida) {
  const d = t.divisoes
  const A = t.amostras
  if (t.dimensoes === 1) {
    for (let c = 0; c < 3; c++) {
      const x = [r, g, b][c] * (d - 1)
      const i = Math.min(Math.floor(x), d - 2)
      const f = x - i
      saida[c] = (A[i * 3 + c] * (1 - f) + A[(i + 1) * 3 + c] * f) / 65535
    }
    return saida
  }
  const escala = d - 1
  const xr = r * escala
  const xg = g * escala
  const xb = b * escala
  const ir = Math.min(Math.floor(xr), d - 2)
  const ig = Math.min(Math.floor(xg), d - 2)
  const ib = Math.min(Math.floor(xb), d - 2)
  const fr = xr - ir
  const fg = xg - ig
  const fb = xb - ib
  const p100 = d * d * 3
  const p010 = d * 3
  const p001 = 3
  const o = ir * p100 + ig * p010 + ib * p001
  // os seis tetraedros pela ordem das frações; f1 ≥ f2 ≥ f3, vértices 000 → o1 → o2 → 111
  let o1
  let o2
  let f1
  let f2
  let f3
  if (fg >= fr) {
    if (fb >= fg) [o1, o2, f1, f2, f3] = [p001, p001 + p010, fb, fg, fr]
    else if (fb >= fr) [o1, o2, f1, f2, f3] = [p010, p010 + p001, fg, fb, fr]
    else [o1, o2, f1, f2, f3] = [p010, p010 + p100, fg, fr, fb]
  } else if (fb >= fr) [o1, o2, f1, f2, f3] = [p001, p001 + p100, fb, fr, fg]
  else if (fb >= fg) [o1, o2, f1, f2, f3] = [p100, p100 + p001, fr, fb, fg]
  else [o1, o2, f1, f2, f3] = [p100, p100 + p010, fr, fg, fb]
  const p111 = p100 + p010 + p001
  const w0 = 1 - f1
  const w1 = f1 - f2
  const w2 = f2 - f3
  for (let c = 0; c < 3; c++) saida[c] = (w0 * A[o + c] + w1 * A[o + o1 + c] + w2 * A[o + o2 + c] + f3 * A[o + p111 + c]) / 65535
  return saida
}

/**
 * A tabela RGB como LUT do nosso look (look.js): `lado`³ nós no código sRGB da tela; em cada nó, a conta que a Adobe faz
 * (ver o cabeçalho). `quantidade` (1 = a tabela inteira) é a do arquivo (crs:RGBTableAmount), presa na faixa da tabela;
 * `baseLinear`: o perfil é feito sobre uma base sem curva de tom (ver acima).
 * Devolve { lut, foraDaFaixa } (nós cujo resultado passou de 0..1 e foi preso: o look guarda 0..1).
 */
export function tabelaParaLut(t, { lado = 33, quantidade = 1, baseLinear = false } = {}) {
  if (t.tipo !== 'rgb') throw erro('tabela', 'Só a tabela RGB vira look.')
  // base linear: a tabela foi feita para receber a luz SEM curva de tom (perfil sobre "Adobe Standard Linear"): ela
  // mesma faz o mapa de tons. O nosso look vem depois da nossa tela, então, em cada nó, a tela neutra é desfeita
  // (a inversa exata de tela.js, a mesma de baseDeImagem) e a tabela recebe a luz de cena
  const telaNeutra = baseLinear ? criarTela('srgb', { altas: MARGENS.altas.padrao, sombras: MARGENS.sombras.padrao }) : null
  const daCena = baseLinear ? matrizEntre('rec2020', t.primarias) : null
  const cena = [0, 0, 0]
  const ida = matrizEntre('srgb', t.primarias)
  const volta = matrizEntre(t.primarias, 'srgb')
  const curvaTela = CURVAS.srgb
  const curva = curvaDaTabela(t.gama)
  const q = Math.min(t.maximo, Math.max(t.minimo, quantidade))
  const lido = [0, 0, 0]
  let foraDaFaixa = 0
  const lut = criarLut(lado, (r, g, b, saida) => {
    const lin = [curvaTela.decodificar(r), curvaTela.decodificar(g), curvaTela.decodificar(b)]
    let nas
    if (baseLinear) {
      telaNeutra.inverterLinear(lin[0], lin[1], lin[2], cena)
      nas = mulV(daCena, cena)
    } else nas = mulV(ida, lin)
    const preso = nas.map((x) => Math.min(1, Math.max(0, x)))
    const delta = t.gamut === 'estende' ? nas.map((x, c) => x - preso[c]) : [0, 0, 0]
    const cod = preso.map((x) => curva.codificar(x))
    lerRgb(t, cod[0], cod[1], cod[2], lido)
    const mix = cod.map((x, c) => Math.min(1, Math.max(0, x + q * (lido[c] - x))))
    const linT = mix.map((x, c) => curva.decodificar(x) + delta[c])
    const fim = mulV(volta, linT)
    let fora = false
    for (let c = 0; c < 3; c++) {
      const y = curvaTela.codificar(Math.max(0, fim[c]))
      // fora de 0..1 por mais que meio degrau de 8 bits (o resto é arredondamento das matrizes)
      if (y > 1 + 0.002 || curvaTela.codificar(Math.max(0, -fim[c])) > 0.002) fora = true
      saida[c] = Math.min(1, Math.max(0, y))
    }
    if (fora) foraDaFaixa++
  })
  return { lut, foraDaFaixa }
}

// ─────────── os perfis padrão da Adobe, pelo nome ───────────

/**
 * Aproximação NOSSA dos perfis "Adobe Raw" quando o arquivo só traz o nome (a tabela deles não vem no XMP: fica na
 * instalação do Camera Raw e o formato aqui não a substitui). Não é a tabela da Adobe: é a direção que a própria Adobe
 * descreve (Julieanne Kost, Adobe, "Adobe Camera Raw v10.3 – Raw and Creative Profiles", 2018), em passos pequenos dos
 * nossos controles, e só a curva do Adobe Color é dado de verdade (a curva que vem no crs:Look dos 23 JPEG do ensaio do
 * titular e dos 203 registros do catálogo dele, sempre a mesma). Os valores são escolha nossa, para a importação não
 * ignorar o perfil em silêncio; o relatório diz "aproximado" e por quê.
 *
 *   Adobe Standard    a cor de base da Adobe ("Standard V2"): a nossa base, sem mexer
 *   Adobe Color       "ponto de partida para qualquer foto", "um pouco mais quente nos vermelhos, amarelos e laranjas":
 *                     a curva real; um passo de saturação nas três faixas quentes
 *   Adobe Vivid       "mais vibração e contraste, com a pele natural": contraste e vibração (que poupa a pele)
 *   Adobe Landscape   "um pouco mais de saturação em todas as cores, azuis e verdes mais vivos"
 *   Adobe Portrait    "curva um pouco mais suave, otimizado para a pele": menos contraste e menos saturação no laranja
 *   Adobe Neutral     "reduz saturação e contraste, mais plano"
 *   Adobe Monochrome  "ponto de partida para o preto e branco, clareia as cores quentes e escurece as frias"
 */
export const CURVA_ADOBE_COLOR = [
  [0, 0],
  [22, 16],
  [40, 35],
  [127, 127],
  [224, 230],
  [240, 246],
  [255, 255],
]
// o passo das nossas aproximações, escolha nossa e não medida: 10 (um décimo da faixa de ±100) para "mais" e 5 para
// "um pouco", nos termos que a descrição da Adobe usa
const PASSO = 10
export const PERFIS_ADOBE = {
  'Adobe Standard': { ajustes: {}, razao: 'a cor de base da Adobe: aqui fica a do nosso motor' },
  'Adobe Color': {
    ajustes: { 'curva.pontos.luz': CURVA_ADOBE_COLOR.map(([x, y]) => [x / 255, y / 255]), 'misturador.saturacao': [PASSO / 2, PASSO / 2, PASSO / 2, 0, 0, 0, 0, 0] },
    razao: 'a curva do perfil (dado real) e meio passo de saturação nas faixas quentes; a tabela de cor dele não vem no arquivo',
  },
  'Adobe Vivid': { ajustes: { 'luz.contraste': PASSO, 'cor.vibracao': PASSO }, razao: 'contraste e vibração, a direção que a Adobe descreve' },
  'Adobe Landscape': {
    ajustes: { 'cor.saturacao': PASSO / 2, 'misturador.saturacao': [0, 0, 0, PASSO, PASSO, PASSO, 0, 0] },
    razao: 'um pouco mais de saturação, mais nos verdes e azuis, a direção que a Adobe descreve',
  },
  'Adobe Portrait': {
    ajustes: { 'luz.contraste': -PASSO / 2, 'misturador.saturacao': [0, -PASSO / 2, 0, 0, 0, 0, 0, 0] },
    razao: 'curva mais suave e menos saturação no laranja (pele), a direção que a Adobe descreve',
  },
  'Adobe Neutral': { ajustes: { 'luz.contraste': -PASSO, 'cor.saturacao': -PASSO }, razao: 'menos contraste e menos saturação, a direção que a Adobe descreve' },
  'Adobe Monochrome': {
    ajustes: { 'pb.ativo': true, 'pb.mistura': [PASSO, PASSO, PASSO / 2, 0, -PASSO / 2, -PASSO, -PASSO / 2, 0] },
    razao: 'preto e branco que clareia as cores quentes e escurece as frias, a direção que a Adobe descreve',
  },
}

/** O nome de um perfil padrão da Adobe (aceita "Adobe Color" e variações de caixa e espaço) ou null. */
export function perfilAdobe(nome) {
  if (typeof nome !== 'string') return null
  const limpo = nome.trim().replace(/\s+/g, ' ').toLowerCase()
  return Object.keys(PERFIS_ADOBE).find((k) => k.toLowerCase() === limpo) ?? null
}
