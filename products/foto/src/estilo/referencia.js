// Extrair o estilo de uma foto de referência e devolver CONTROLES editáveis (não uma LUT opaca). Segue as etapas de
// docs/estudo/cliente-e-estilo.md, B4, com o nosso motor como modelo exato de "controle → pixel":
//
//   0. Normalizar   referências e alvo reduzidos a 512 px (média na luz linear); pixels estourados (um canal ≥ 254)
//                   ficam fora das medidas de cor. O alvo (a foto da pessoa) entra no motor pela inversa da tela
//                   (baseDeImagem) e é revelado no neutro: é a comparação justa.
//   1. Impressão digital do estilo, em Oklab:
//        tom     15 percentis de L (0,5 a 99,5%)
//        neutro  a cor média dos pixels quase neutros (peso exp(−(C/0,04)²)) em 7 faixas de luz (funções-chapéu entre
//                centros): é o eixo neutro, onde mora a tonalização — a medida que menos muda com o conteúdo
//        setores 12 setores de matiz de 30° (peso linear entre setores vizinhos), só pixels com cor (C > 0,03, rampa
//                até 0,05): a e b médios, croma e luz médias
//        croma   percentis 50, 75, 90 e 97 da croma
//      Várias referências (1 a 10): média das impressões, ponderada pela cobertura de cada medida.
//   2. Partida em forma fechada (tonalização pelo eixo neutro: o deslocamento constante vai para a zona geral e o que
//      muda com a luz, para sombras e altas; saturação pela razão das crocas medianas; desbotado pelo preto) e, se ela
//      não for melhor que não mexer, partida do zero. Depois cada grupo é refinado sozinho pelo motor (luz e curva;
//      tonalização; cor; misturador ou mistura do P&B).
//   3. Refino conjunto: Levenberg–Marquardt com diferenças finitas sobre todos os controles ativos (até 42); cada
//      avaliação revela 3072 pixels do alvo (amostra estratificada fixa) pelo NOSSO motor (`revelar`, sem vizinhança).
//      Limites por controle e penalidade que puxa para zero (todos os controles em 100 custariam `penalidade` do erro
//      inicial). Depois, "poda": cada controle mexido é zerado à prova e fica zerado se a perda for menor que 2% do que o
//      ajuste ganhou — o estilo sai com poucos controles, como o estudo pede. Nunca sai pior que não mexer.
//   4. Resíduo opcional: o que os controles não alcançaram vira uma LUT 17³ no código da tela (look com quantidade 50 ou
//      100, a que mais aproxima; nenhuma melhora = sem resíduo). O "teto não paramétrico" é a mesma LUT feita a partir da
//      revelação neutra: diz quanto um mapa livre chegaria perto.
//   5. Saída: os controles (só estilo: exposição, branco e geometria ficam neutros), a confiança por grupo, o erro antes
//      e depois, quanto do teto os controles alcançaram, e os avisos.
//
// TRÊS CASOS, do mais ao menos informativo:
//   pareado     a referência é a MESMA cena do alvo (a foto da pessoa tratada por alguém; o JPEG da câmera e o RAW):
//               mesma proporção e correlação de postos da luz ≥ 0,9. Entram também as diferenças ponto a ponto (1024
//               pares), todos os controles, a vizinhança (vinheta e grão por busca de seção áurea numa revelação
//               de 256 px, só quando a medida responde ao controle) e o resíduo sai dos pares (regressão de núcleo)
//   cena outra  só a impressão digital, que também muda com o conteúdo (tom e croma variam de uma foto para outra da
//               mesma sessão quase tanto quanto um estilo leve). Por isso: penalidade 15× maior, sem a curva de quatro
//               regiões (copiaria o histograma do conteúdo), do misturador só a saturação, setores só por croma e luz, e
//               confiança rebaixada um degrau
//   sem alvo    a referência é comparada com ela mesma sem o eixo neutro: só a tonalização (e o P&B) se separa do
//               conteúdo numa foto só. Contraste e saturação não saem, com aviso pedindo uma foto da pessoa
//
// ERRO. A distância entre duas impressões digitais é a raiz da média quadrática dos resíduos ponderados, em Oklab × 100
// (1 ≈ uma diferença de cor que se vê lado a lado). Pesos: tom 1, neutro 3, setores 2, croma 1,5 — dominante no cinza é
// o que mais se nota. No caso pareado, a aderência e o alcance usam o ΔE médio ponto a ponto (também × 100).
//
// LIMITES (estudo, B6): uma imagem não separa a luz da cena do tratamento; o que sai é o estilo mais simples que explica
// a referência, não o que o autor usou. Referência em preto e branco não diz nada de matiz (cor e misturador ficam
// zerados); faixa de cor com pouco pixel em qualquer das duas fica zerada; faixa de luz sem pixel quase neutro não
// entra na tonalização. Textura, clareza, neblina, nitidez e (pareado) vinheta saem de vizinhanca.js, só quando a
// medida responde e o valor passa da incerteza; sem par, na prática ficam de fora (o conteúdo pesa mais que o controle).

import { FAIXAS, neutro, normalizar } from '../motor/ajustes.js'
import { baseDeImagem } from '../motor/base.js'
import { curvaDe } from '../motor/cor/espacos.js'
import { criarOklab, matizDoCirculo } from '../motor/cor/oklab.js'
import { pesosDasFaixas } from '../motor/ponto.js'
import { revelar } from '../motor/revelar.js'
import { aplicarLut, compactar, criarLut } from './look.js'
import { estimarVizinhanca } from './vizinhanca.js'
import { criarPredefinicao, gruposMexidos } from './predefinicao.js'

export const REFERENCIA = {
  lado: 512,
  amostras: 3072,
  ladoLocal: 256,
  maxReferencias: 10,
  percentis: [0.5, 2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99.5],
  bandas: [0.22, 0.36, 0.48, 0.6, 0.72, 0.83, 0.93], // centros das 7 faixas de luz (Oklab L), peso triangular
  setores: 12,
  cromaNeutra: 0.04,
  cromaCor: [0.03, 0.05],
  percentisCroma: [50, 75, 90, 97],
  pesos: { tom: 1, neutro: 3, setor: 2, croma: 1.5 },
  coberturaFaixa: 0.01, // fração mínima da imagem numa faixa do misturador, nas duas, para a faixa entrar
  pb: 0.02, // croma (p95, depois de tirar o eixo neutro) abaixo disto = preto e branco (0,02 é o limite de cinza do qc)
  poda: 0.02,
  penalidade: 0.04, // pareado: todos os controles em 100 custam 4% do erro inicial (ver `ajustar`)
  penalidadeSemPar: 0.6, // cena diferente: o conteúdo também mexe na impressão, então mexer custa mais
  pareado: 0.9, // correlação de postos da luz acima disto = a referência é a mesma cena do alvo
  pares: 1024,
}

const R = REFERENCIA

// Gerador determinístico (mulberry32, domínio público): a mesma amostra em toda avaliação e em toda execução.
function sorteio(semente) {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const limitar = (v, a, b) => (v < a ? a : v > b ? b : v)
const DOIS_PI = 2 * Math.PI

export class ErroReferencia extends Error {
  constructor(codigo, mensagem) {
    super(mensagem)
    this.name = 'ErroReferencia'
    this.codigo = codigo
  }
}

// ─────────── 0. entrada ───────────

function conferirImagem(img, oQue) {
  if (!img || typeof img !== 'object') throw new ErroReferencia('imagem', `${oQue}: imagem ausente.`)
  const { largura, altura, dados } = img
  const canais = img.canais ?? 4
  if (!Number.isInteger(largura) || !Number.isInteger(altura) || largura < 8 || altura < 8)
    throw new ErroReferencia('imagem', `${oQue}: imagem pequena demais.`)
  if (!dados || dados.length < largura * altura * canais) throw new ErroReferencia('imagem', `${oQue}: os dados não batem com o tamanho.`)
  const espaco = img.espaco ?? 'srgb'
  if (espaco !== 'srgb' && espaco !== 'p3') throw new ErroReferencia('espaco', `${oQue}: espaço de cor não aceito (${espaco}).`)
  return { largura, altura, dados, canais, espaco, niveis: dados instanceof Uint16Array ? 65535 : 255 }
}

const tabelasLineares = new Map()
function tabelaLinear(niveis) {
  if (!tabelasLineares.has(niveis)) {
    const t = new Float32Array(niveis + 1)
    const curva = curvaDe('srgb')
    for (let i = 0; i <= niveis; i++) t[i] = curva.decodificar(i / niveis)
    tabelasLineares.set(niveis, t)
  }
  return tabelasLineares.get(niveis)
}

/**
 * Reduz para no máximo `lado` px no lado maior, pela média na luz linear (a abertura do pixel). Devolve { largura,
 * altura, lin: Float32Array RGB linear no espaço da imagem, cortado: Uint8Array (1 = algum pixel da origem tinha um canal
 * estourado), espaco }.
 */
function reduzir(img, lado) {
  const { largura, altura, dados, canais, niveis, espaco } = img
  const k = Math.max(1, Math.ceil(Math.max(largura, altura) / lado))
  const w = Math.max(1, Math.floor(largura / k))
  const h = Math.max(1, Math.floor(altura / k))
  const lin = new Float32Array(w * h * 3)
  const cortado = new Uint8Array(w * h)
  const t = tabelaLinear(niveis)
  const teto = Math.round(niveis * (254 / 255))
  const inv = 1 / (k * k)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      let c = 0
      for (let dy = 0; dy < k; dy++) {
        let i = ((y * k + dy) * largura + x * k) * canais
        for (let dx = 0; dx < k; dx++, i += canais) {
          r += t[dados[i]]
          g += t[dados[i + 1]]
          b += t[dados[i + 2]]
          if (dados[i] >= teto || dados[i + 1] >= teto || dados[i + 2] >= teto) c = 1
        }
      }
      const o = y * w + x
      lin[o * 3] = r * inv
      lin[o * 3 + 1] = g * inv
      lin[o * 3 + 2] = b * inv
      cortado[o] = c
    }
  }
  return { largura: w, altura: h, lin, cortado, espaco }
}

// RGB linear → código de 16 bits (para entrar no motor pela inversa exata da tela).
function paraCodigos(lin) {
  const curva = curvaDe('srgb')
  const saida = new Uint16Array(lin.length)
  for (let i = 0; i < lin.length; i++) saida[i] = Math.round(limitar(curva.codificar(limitar(lin[i], 0, 1)), 0, 1) * 65535)
  return saida
}

// ─────────── 1. impressão digital ───────────

/** Pixels → Oklab { L, A, B, C, H (rad), n, valido (Uint8Array) } a partir de RGB linear no espaço dado. */
function oklabDe(lin, espaco, cortado = null) {
  const n = lin.length / 3
  const ok = criarOklab(espaco)
  const L = new Float32Array(n)
  const A = new Float32Array(n)
  const B = new Float32Array(n)
  const lab = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    ok.paraOklab(Math.max(0, lin[i * 3]), Math.max(0, lin[i * 3 + 1]), Math.max(0, lin[i * 3 + 2]), lab)
    L[i] = lab[0]
    A[i] = lab[1]
    B[i] = lab[2]
  }
  return { L, A, B, n, valido: cortado ? cortado.map((c) => 1 - c) : new Uint8Array(n).fill(1) }
}

// código da tela (Float32 0..1, 3 por pixel) → linear do mesmo espaço. Por tabela de 4096 trechos com interpolação
// linear: a curva sRGB é suave e o erro fica abaixo de 3e-8 (f'' ≤ 3,4 · h²/8), muito menor que um passo de 16 bits.
const TAM_DECODIFICAR = 4096
let tabelaDecodificar = null
function linearDoCodigo(codigo) {
  if (!tabelaDecodificar) {
    const curva = curvaDe('srgb')
    tabelaDecodificar = Float64Array.from({ length: TAM_DECODIFICAR + 2 }, (_, i) => curva.decodificar(Math.min(1, i / TAM_DECODIFICAR)))
  }
  const t = tabelaDecodificar
  const lin = new Float32Array(codigo.length)
  for (let i = 0; i < codigo.length; i++) {
    const x = limitar(codigo[i], 0, 1) * TAM_DECODIFICAR
    const k = x | 0
    lin[i] = t[k] + (t[k + 1] - t[k]) * (x - k)
  }
  return lin
}

function cortadoDoCodigo(codigo) {
  const n = codigo.length / 3
  const c = new Uint8Array(n)
  const teto = 254 / 255
  for (let i = 0; i < n; i++) c[i] = codigo[i * 3] >= teto || codigo[i * 3 + 1] >= teto || codigo[i * 3 + 2] >= teto ? 1 : 0
  return c
}

function percentis(valores, ps) {
  const ordenados = Float32Array.from(valores).sort()
  const n = ordenados.length
  return ps.map((p) => {
    const x = (p / 100) * (n - 1)
    const i = Math.floor(x)
    const f = x - i
    return i + 1 < n ? ordenados[i] * (1 - f) + ordenados[i + 1] * f : ordenados[n - 1]
  })
}

// Peso de cada faixa de luz: funções-chapéu entre centros vizinhos (somam 1); antes do primeiro centro e depois do
// último, tudo vai para a ponta (o preto e o branco entram na primeira e na última faixa).
function bandasDe(L, saida) {
  const c = R.bandas
  const n = c.length
  if (L <= c[0]) {
    saida[0] = 0
    saida[1] = 1
    saida[2] = 0
    saida[3] = 0
    return saida
  }
  if (L >= c[n - 1]) {
    saida[0] = n - 1
    saida[1] = 1
    saida[2] = n - 1
    saida[3] = 0
    return saida
  }
  let k = 0
  while (c[k + 1] < L) k++
  const t = (L - c[k]) / (c[k + 1] - c[k])
  saida[0] = k
  saida[1] = 1 - t
  saida[2] = k + 1
  saida[3] = t
  return saida
}

const pesoBanda = (L, k) => {
  const b = bandasDe(L, [0, 0, 0, 0])
  return (b[0] === k ? b[1] : 0) + (b[2] === k ? b[3] : 0)
}

const rampa = (x, a, b) => limitar((x - a) / (b - a), 0, 1)

/**
 * A impressão digital de uma imagem já em Oklab. `semCor`: true quando a imagem não tem cor (não mede setores).
 */
function impressao(px, completa = true) {
  const { L, A, B, n, valido } = px
  const tom = percentis(L, R.percentis)
  const nb = R.bandas.length
  const nA = new Float64Array(nb)
  const nB = new Float64Array(nb)
  const nP = new Float64Array(nb)
  const nX = new Float64Array(nb)
  const S = R.setores
  const sP = new Float64Array(S)
  const sA = new Float64Array(S)
  const sB = new Float64Array(S)
  const sC = new Float64Array(S)
  const sL = new Float64Array(S)
  const C = new Float32Array(n)
  const bd = [0, 0, 0, 0]
  const k2 = 1 / (R.cromaNeutra * R.cromaNeutra)
  const [c0, c1] = R.cromaCor
  let validos = 0
  for (let i = 0; i < n; i++) {
    const a = A[i]
    const b = B[i]
    const c = Math.sqrt(a * a + b * b)
    C[i] = c
    if (!valido[i]) continue
    validos++
    const wn = Math.exp(-c * c * k2)
    bandasDe(L[i], bd)
    for (let j = 0; j < 4; j += 2) {
      const k = bd[j]
      const wb = bd[j + 1]
      if (!wb) continue
      const w = wb * wn
      nA[k] += w * a
      nB[k] += w * b
      nP[k] += w
      nX[k] += wb
    }
    if (c <= c0) continue
    const wc = c >= c1 ? 1 : (c - c0) / (c1 - c0)
    let h = Math.atan2(b, a)
    if (h < 0) h += DOIS_PI
    const x = (h / DOIS_PI) * S
    const fl = Math.floor(x)
    const s0 = fl % S
    const s1 = (s0 + 1) % S
    const f = x - fl
    const w0 = (1 - f) * wc
    const w1 = f * wc
    sP[s0] += w0
    sA[s0] += w0 * a
    sB[s0] += w0 * b
    sC[s0] += w0 * c
    sL[s0] += w0 * L[i]
    sP[s1] += w1
    sA[s1] += w1 * a
    sB[s1] += w1 * b
    sC[s1] += w1 * c
    sL[s1] += w1 * L[i]
  }
  const neutro = Array.from({ length: nb }, (_, k) => ({ a: nA[k], b: nB[k], peso: nP[k], pixels: nX[k] }))
  const setores = Array.from({ length: S }, (_, k) => ({ parcela: sP[k], a: sA[k], b: sB[k], C: sC[k], L: sL[k] }))
  const total = Math.max(1, validos)
  for (const nk of neutro) {
    if (nk.peso > 0) {
      nk.a /= nk.peso
      nk.b /= nk.peso
    }
    nk.cobertura = nk.peso / total
    nk.pixels /= total
  }
  for (const s of setores) {
    if (s.parcela > 0) {
      s.a /= s.parcela
      s.b /= s.parcela
      s.C /= s.parcela
      s.L /= s.parcela
    }
    s.parcela /= total
  }
  const croma = percentis(validos === n ? C : C.filter((_, i) => valido[i]), R.percentisCroma)
  if (!completa) return { tom, neutro, setores, croma }
  // croma que sobra depois de tirar o eixo neutro: é o que diz se a imagem tem cor de verdade (sépia não tem)
  const resto = []
  const eixo = (Li) => {
    let a = 0
    let b = 0
    let w = 0
    for (let k = 0; k < nb; k++) {
      const p = pesoBanda(Li, k) * (neutro[k].peso > 0 ? 1 : 0)
      a += p * neutro[k].a
      b += p * neutro[k].b
      w += p
    }
    return w ? [a / w, b / w] : [0, 0]
  }
  const passo = Math.max(1, Math.floor(n / 20000))
  for (let i = 0; i < n; i += passo) {
    if (!valido[i]) continue
    const [ea, eb] = eixo(L[i])
    resto.push(Math.hypot(A[i] - ea, B[i] - eb))
  }
  const cromaResidual = resto.length ? percentis(resto, [95])[0] : 0
  // cobertura das 8 faixas do misturador (pelos pesos do próprio motor)
  const faixas = new Array(8).fill(0)
  for (let i = 0; i < n; i += passo) {
    if (!valido[i] || C[i] < R.cromaCor[1]) continue
    const w = pesosDasFaixas(Math.atan2(B[i], A[i]))
    for (let k = 0; k < 8; k++) faixas[k] += w[k]
  }
  const amostrados = Math.max(1, Math.ceil(n / passo))
  for (let k = 0; k < 8; k++) faixas[k] /= amostrados
  return { tom, neutro, setores, croma, cromaResidual, faixas, pb: cromaResidual < R.pb, eixo }
}

/** Média de várias impressões digitais (referências): cada medida pesa pela cobertura que tem em cada imagem. */
function media(lista) {
  if (lista.length === 1) return lista[0]
  const m = structuredClone({ ...lista[0], eixo: null })
  const n = lista.length
  m.tom = lista[0].tom.map((_, k) => lista.reduce((s, f) => s + f.tom[k], 0) / n)
  m.croma = lista[0].croma.map((_, k) => lista.reduce((s, f) => s + f.croma[k], 0) / n)
  m.faixas = lista[0].faixas.map((_, k) => lista.reduce((s, f) => s + f.faixas[k], 0) / n)
  m.neutro = lista[0].neutro.map((_, k) => {
    const peso = lista.reduce((s, f) => s + f.neutro[k].peso, 0)
    const pixels = lista.reduce((s, f) => s + f.neutro[k].pixels, 0) / n
    const cobertura = lista.reduce((s, f) => s + f.neutro[k].cobertura, 0) / n
    if (!peso) return { a: 0, b: 0, peso: 0, pixels, cobertura }
    return {
      a: lista.reduce((s, f) => s + f.neutro[k].a * f.neutro[k].peso, 0) / peso,
      b: lista.reduce((s, f) => s + f.neutro[k].b * f.neutro[k].peso, 0) / peso,
      peso,
      pixels,
      cobertura,
    }
  })
  m.setores = lista[0].setores.map((_, k) => {
    const p = lista.reduce((s, f) => s + f.setores[k].parcela, 0)
    const saida = { parcela: p / n, a: 0, b: 0, C: 0, L: 0 }
    if (p > 0) for (const c of ['a', 'b', 'C', 'L']) saida[c] = lista.reduce((s, f) => s + f.setores[k][c] * f.setores[k].parcela, 0) / p
    return saida
  })
  m.cromaResidual = lista.reduce((s, f) => s + f.cromaResidual, 0) / n
  m.pb = lista.every((f) => f.pb)
  return m
}

// Pesos fixos durante o ajuste (senão o alvo da conta muda a cada passo): cobertura mínima entre a referência e o alvo.
function pesosDe(ref, alvo) {
  const neutro = ref.neutro.map((r, k) => Math.min(r.cobertura, alvo.neutro[k].cobertura))
  const somaN = neutro.reduce((s, v) => s + v, 0) || 1
  const setores = ref.setores.map((r, k) => Math.min(r.parcela, alvo.setores[k].parcela))
  const somaS = setores.reduce((s, v) => s + v, 0) || 1
  return { neutro: neutro.map((v) => v / somaN), setores: setores.map((v) => v / somaS), semCor: ref.pb || alvo.pb }
}

const GRUPOS_DO_ERRO = ['tom', 'neutro', 'setor', 'croma']

/** Os resíduos ponderados entre duas impressões, em blocos por grupo (para medir o erro de cada um). */
function residuos(f, ref, pesos, saida = null) {
  const r = saida ?? { tom: [], neutro: [], setor: [], croma: [] }
  for (const g of GRUPOS_DO_ERRO) r[g].length = 0
  const P = R.pesos
  for (let k = 0; k < f.tom.length; k++) r.tom.push(P.tom * (f.tom[k] - ref.tom[k]))
  for (let k = 0; k < f.neutro.length; k++) {
    const w = P.neutro * Math.sqrt(pesos.neutro[k] * f.neutro.length)
    r.neutro.push(w * (f.neutro[k].a - ref.neutro[k].a), w * (f.neutro[k].b - ref.neutro[k].b))
  }
  if (!pesos.semCor) {
    for (let k = 0; k < f.setores.length; k++) {
      const w = P.setor * Math.sqrt(pesos.setores[k] * f.setores.length)
      const a = f.setores[k]
      const b = ref.setores[k]
      // sem pares, o matiz médio de um setor muda com o conteúdo (outra roupa, outro céu): só croma e luz entram
      if (!pesos.soCroma) r.setor.push(w * (a.a - b.a), w * (a.b - b.b))
      r.setor.push(w * (a.C - b.C), 0.5 * w * (a.L - b.L))
    }
    for (let k = 0; k < f.croma.length; k++) r.croma.push(P.croma * (f.croma[k] - ref.croma[k]))
  }
  return r
}

const rms = (lista) => (lista.length ? Math.sqrt(lista.reduce((s, v) => s + v * v, 0) / lista.length) : 0)
function erroDe(r) {
  const todos = [...r.tom, ...r.neutro, ...r.setor, ...r.croma]
  const porGrupo = {}
  for (const g of GRUPOS_DO_ERRO) porGrupo[g] = rms(r[g]) * 100
  return { total: rms(todos) * 100, porGrupo }
}

// ─────────── os controles que o ajuste mexe ───────────

// [caminho, min, max, passo da diferença finita, grupo]. A tonalização entra em coordenadas cartesianas (x, y) =
// saturação · (cos, sin) do matiz, para o ajuste não ter a quina do matiz em 0/360.
const TOM = [
  ['luz.contraste', -100, 100, 4],
  ['luz.altas', -100, 100, 4],
  ['luz.sombras', -100, 100, 4],
  ['luz.brancos', -100, 100, 4],
  ['luz.pretos', -100, 100, 4],
  ['curva.sombras', -100, 100, 4],
  ['curva.escuros', -100, 100, 4],
  ['curva.claros', -100, 100, 4],
  ['curva.altas', -100, 100, 4],
  ['efeitos.desbotar', 0, 100, 3],
].map(([c, min, max, h]) => ({ caminho: c, min, max, h, grupo: 'tom' }))
const NEUTRO = ['sombras', 'altas', 'global'].flatMap((z) => [
  { caminho: `tonalizacao.${z}.x`, min: -100, max: 100, h: 3, grupo: 'neutro' },
  { caminho: `tonalizacao.${z}.y`, min: -100, max: 100, h: 3, grupo: 'neutro' },
])
const COR = [
  { caminho: 'cor.saturacao', min: -100, max: 100, h: 4, grupo: 'cor' },
  { caminho: 'cor.vibracao', min: -100, max: 100, h: 4, grupo: 'cor' },
]
const PB = FAIXAS.map((_, k) => ({ caminho: `pb.mistura.${k}`, min: -100, max: 100, h: 5, grupo: 'pb' }))
const misturadorDe = (k) => ['matiz', 'saturacao', 'luz'].map((p) => ({ caminho: `misturador.${p}.${k}`, min: -100, max: 100, h: 5, grupo: 'misturador' }))

// vetor de valores → ajustes do motor
function montar(params, valores, base = null) {
  const a = base ? structuredClone(base) : neutro()
  const zonas = {}
  params.forEach((p, i) => {
    const v = valores[i]
    const partes = p.caminho.split('.')
    if (partes[0] === 'tonalizacao') {
      zonas[partes[1]] ??= { x: 0, y: 0 }
      zonas[partes[1]][partes[2]] = v
    } else if (partes[0] === 'misturador') a.misturador[partes[1]][Number(partes[2])] = v
    else if (partes[0] === 'pb') a.pb.mistura[Number(partes[2])] = v
    else a[partes[0]][partes[1]] = v
  })
  for (const [z, { x, y }] of Object.entries(zonas)) {
    const sat = Math.min(100, Math.hypot(x, y))
    a.tonalizacao[z] = { matiz: sat ? ((((Math.atan2(y, x) * 180) / Math.PI) % 360) + 360) % 360 : 0, saturacao: sat, luz: 0 }
  }
  return a
}

// ─────────── o motor como modelo ───────────

function criarModelo(baseAlvo, idsAmostra, tela, pb) {
  const n = idsAmostra.length
  const dados = new Float32Array(n * 3)
  idsAmostra.forEach((p, i) => {
    dados[i * 3] = baseAlvo.dados[p * 3]
    dados[i * 3 + 1] = baseAlvo.dados[p * 3 + 1]
    dados[i * 3 + 2] = baseAlvo.dados[p * 3 + 2]
  })
  const base = { ...baseAlvo.base, imagem: { largura: n, altura: 1, dados }, orientacao: 1 }
  let renders = 0
  const revelarAmostra = (ajustes, look = null) => {
    renders++
    const a = normalizar(ajustes)
    if (pb) a.pb.ativo = true
    if (look) a.look.id = 'referencia'
    return revelar(base, a, { tela, semLocal: true, look }).dados
  }
  const pixels = (codigo) => oklabDe(linearDoCodigo(codigo), tela, cortadoDoCodigo(codigo))
  return {
    revelar: revelarAmostra,
    impressao: (ajustes, look = null) => impressao(pixels(revelarAmostra(ajustes, look)), false),
    pixels,
    get renders() {
      return renders
    },
  }
}

// ─────────── 2 e 3. ajuste ───────────

// Resolve (M) x = v por eliminação de Gauss com pivô parcial (M é pequena: até 42 × 42).
function resolver(M, v) {
  const n = v.length
  const a = M.map((linha, i) => [...linha, v[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let i = c + 1; i < n; i++) if (Math.abs(a[i][c]) > Math.abs(a[p][c])) p = i
    if (Math.abs(a[p][c]) < 1e-18) continue
    ;[a[c], a[p]] = [a[p], a[c]]
    for (let i = 0; i < n; i++) {
      if (i === c) continue
      const f = a[i][c] / a[c][c]
      if (!f) continue
      for (let j = c; j <= n; j++) a[i][j] -= f * a[c][j]
    }
  }
  return a.map((linha, i) => (Math.abs(linha[i]) < 1e-18 ? 0 : linha[n] / linha[i]))
}

/**
 * Levenberg–Marquardt com diferenças finitas e caixa (Marquardt, 1963, "An algorithm for least-squares estimation of
 * nonlinear parameters", J. SIAM 11(2)). `custo(valores)` devolve o vetor de resíduos. Mexe em `valores` no lugar.
 */
function ajustar(params, valores, residuosDe, { iteracoes = 6, grupos = null, penalidade = 0 } = {}) {
  const ativos = params.map((p, i) => i).filter((i) => !grupos || grupos.includes(params[i].grupo))
  const vetor = (v) => {
    const r = residuosDe(v)
    for (const i of ativos) r.push((penalidade * v[i]) / 100)
    return r
  }
  let r0 = vetor(valores)
  let custo = r0.reduce((s, x) => s + x * x, 0)
  let mu = 1e-2
  for (let it = 0; it < iteracoes; it++) {
    const J = ativos.map((i) => {
      const p = params[i]
      const h = valores[i] + p.h <= p.max ? p.h : -p.h
      const v = valores.slice()
      v[i] += h
      const r = vetor(v)
      const col = new Float64Array(r.length)
      for (let k = 0; k < r.length; k++) col[k] = (r[k] - r0[k]) / h
      return col
    })
    const m = ativos.length
    const nr = r0.length
    const JtJ = Array.from({ length: m }, () => new Array(m).fill(0))
    for (let a = 0; a < m; a++) {
      const ja = J[a]
      for (let b = a; b < m; b++) {
        const jb = J[b]
        let soma = 0
        for (let k = 0; k < nr; k++) soma += ja[k] * jb[k]
        JtJ[a][b] = soma
        JtJ[b][a] = soma
      }
    }
    const Jtr = J.map((col) => {
      let soma = 0
      for (let k = 0; k < nr; k++) soma += col[k] * r0[k]
      return soma
    })
    let melhorou = false
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const M = JtJ.map((linha, a) => linha.map((v, b) => (a === b ? v * (1 + mu) + 1e-12 : v)))
      const passo = resolver(
        M,
        Jtr.map((x) => -x),
      )
      const novo = valores.slice()
      ativos.forEach((i, a) => {
        novo[i] = limitar(novo[i] + passo[a], params[i].min, params[i].max)
      })
      const r = vetor(novo)
      const c = r.reduce((s, x) => s + x * x, 0)
      if (c < custo) {
        for (const i of ativos) valores[i] = novo[i]
        r0 = r
        const ganho = (custo - c) / custo
        custo = c
        mu = Math.max(1e-4, mu / 3)
        melhorou = true
        if (ganho < 1e-3) it = iteracoes
        break
      }
      mu *= 8
    }
    if (!melhorou) break
  }
  return custo
}

// ─────────── forma fechada ───────────

// matiz Oklab (rad) → grau do círculo de cores (a escala da tonalização), pela inversa numérica de matizDoCirculo
const TABELA_MATIZ = Array.from({ length: 360 }, (_, g) => matizDoCirculo(g))
function grauDoCirculo(rad) {
  let melhor = 0
  let erro = Infinity
  for (let g = 0; g < 360; g++) {
    let d = Math.abs(TABELA_MATIZ[g] - rad) % DOIS_PI
    if (d > Math.PI) d = DOIS_PI - d
    if (d < erro) {
      erro = d
      melhor = g
    }
  }
  return melhor
}

// deslocamento (Oklab a, b) numa luz L → (x, y) da tonalização: 100 de saturação = 0,12·L de croma (ponto.js, COR)
function tonalizacaoDe(da, db, L) {
  const c = Math.hypot(da, db)
  if (c < 1e-4) return [0, 0]
  const sat = Math.min(100, (100 * c) / (0.12 * Math.max(L, 0.2)))
  const g = (grauDoCirculo(Math.atan2(db, da)) * Math.PI) / 180
  return [sat * Math.cos(g), sat * Math.sin(g)]
}

function partidaFechada(params, valores, ref, alvo, pesos) {
  const idx = (c) => params.findIndex((p) => p.caminho === c)
  // eixo neutro: diferença por faixa de luz
  const nb = R.bandas.length
  const dif = ref.neutro.map((r, k) => (pesos.neutro[k] > 0 ? [r.a - alvo.neutro[k].a, r.b - alvo.neutro[k].b] : null))
  const media3 = (ks) => {
    const v = ks.map((k) => dif[k]).filter(Boolean)
    if (!v.length) return null
    return [v.reduce((s, x) => s + x[0], 0) / v.length, v.reduce((s, x) => s + x[1], 0) / v.length]
  }
  const geral = media3([2, 3, 4]) ?? media3([...Array(nb).keys()]) ?? [0, 0]
  const sombras = media3([0, 1])
  const altas = media3([5, 6])
  const por = (zona, d, L) => {
    if (!d) return
    const [x, y] = tonalizacaoDe(d[0], d[1], L)
    const ix = idx(`tonalizacao.${zona}.x`)
    if (ix < 0) return
    valores[ix] = limitar(x, -100, 100)
    valores[ix + 1] = limitar(y, -100, 100)
  }
  por('global', geral, 0.6)
  if (sombras) por('sombras', [sombras[0] - geral[0], sombras[1] - geral[1]], 0.3)
  if (altas) por('altas', [altas[0] - geral[0], altas[1] - geral[1]], 0.88)
  // saturação pela razão das crocas medianas (+100 = dobro, −100 = sem cor)
  const is = idx('cor.saturacao')
  if (is >= 0 && alvo.croma[0] > 0.01 && !pesos.semCor) valores[is] = limitar(Math.round(100 * (ref.croma[0] / alvo.croma[0] - 1)), -60, 60)
  // desbotado: o preto da referência acima do do alvo
  const id = idx('efeitos.desbotar')
  if (id >= 0 && ref.tom[0] - alvo.tom[0] > 0.02) valores[id] = limitar(Math.round(((ref.tom[0] - alvo.tom[0]) / 0.25) * 100), 0, 60)
}

// ─────────── 4. o teto não paramétrico (e o resíduo em LUT) ───────────

function interpolar(xs, ys, x) {
  if (x <= xs[0]) return ys[0] + (x - xs[0]) * ((ys[1] - ys[0]) / (xs[1] - xs[0] || 1))
  const n = xs.length
  if (x >= xs[n - 1]) return ys[n - 1] + (x - xs[n - 1]) * ((ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2] || 1))
  let i = 1
  while (xs[i] < x) i++
  const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1)
  return ys[i - 1] + t * (ys[i] - ys[i - 1])
}

/** O mapa que leva a impressão `de` à impressão `para`, como função Oklab → Oklab. */
function mapaDeImpressao(de, para, pesos) {
  // L: pelos percentis, monótono
  const xs = []
  const ys = []
  de.tom.forEach((x, k) => {
    if (xs.length && x <= xs[xs.length - 1] + 1e-4) return
    xs.push(x)
    ys.push(Math.max(para.tom[k], ys.length ? ys[ys.length - 1] : -1))
  })
  if (xs.length < 2) {
    xs.push(0, 1)
    ys.push(0, 1)
  }
  const nb = R.bandas.length
  const desloca = de.neutro.map((d, k) => (pesos.neutro[k] > 0 ? [para.neutro[k].a - d.a, para.neutro[k].b - d.b] : null))
  const S = R.setores
  const giro = de.setores.map((d, k) => {
    if (!(pesos.setores[k] > 0) || !(d.C > 0)) return { dh: 0, k: 1 }
    const p = para.setores[k]
    let dh = Math.atan2(p.b, p.a) - Math.atan2(d.b, d.a)
    while (dh > Math.PI) dh -= DOIS_PI
    while (dh < -Math.PI) dh += DOIS_PI
    return { dh, k: limitar(p.C / d.C, 0.25, 4) }
  })
  return (L, a, b, saida) => {
    const L2 = limitar(interpolar(xs, ys, L), 0, 1)
    let da = 0
    let db = 0
    let w = 0
    for (let k = 0; k < nb; k++) {
      if (!desloca[k]) continue
      const p = pesoBanda(L2, k)
      da += p * desloca[k][0]
      db += p * desloca[k][1]
      w += p
    }
    if (w) {
      da /= w
      db /= w
    }
    let a2 = a
    let b2 = b
    if (!pesos.semCor) {
      const c = Math.hypot(a, b)
      const wc = rampa(c, R.cromaCor[0], R.cromaCor[1])
      if (wc) {
        let h = Math.atan2(b, a)
        if (h < 0) h += DOIS_PI
        const x = (h / DOIS_PI) * S
        const s0 = Math.floor(x) % S
        const f = x - Math.floor(x)
        const g = giro[s0]
        const g1 = giro[(s0 + 1) % S]
        const dh = wc * (g.dh * (1 - f) + g1.dh * f)
        const kc = 1 + wc * (g.k * (1 - f) + g1.k * f - 1)
        const h2 = h + dh
        a2 = c * kc * Math.cos(h2)
        b2 = c * kc * Math.sin(h2)
      }
    }
    saida[0] = L2
    saida[1] = a2 + da
    saida[2] = b2 + db
    return saida
  }
}

/**
 * O resíduo pareado: LUT 17³ no código da tela que leva a revelação (`codigo`, 3 por ponto da amostra) à referência nos
 * pares. Cada nó recebe a média dos deslocamentos dos pares perto dele, com peso gaussiano (σ = 1,5 nó) e encolhida
 * para zero onde há poucos pares (λ = 0,5 par): regressão de núcleo de Nadaraya–Watson com regularização, a mesma ideia
 * da grade regularizada de products/finishing/src/cor/clonar.js.
 */
function lutPareada(codigo, pares, tela, lado = 17) {
  const curva = curvaDe('srgb')
  const ok = criarOklab(tela)
  const lin = [0, 0, 0]
  const n = pares.indices.length
  const de = new Float32Array(n * 3)
  const para = new Float32Array(n * 3)
  for (let j = 0; j < n; j++) {
    const k = pares.indices[j]
    for (let c = 0; c < 3; c++) de[j * 3 + c] = codigo[k * 3 + c]
    ok.deOklab(pares.L[j], pares.A[j], pares.B[j], lin)
    for (let c = 0; c < 3; c++) para[j * 3 + c] = curva.codificar(limitar(lin[c], 0, 1))
  }
  const sigma = 1.5 / (lado - 1)
  const k2 = 1 / (2 * sigma * sigma)
  const raio2 = (3 * sigma) ** 2
  const lambda = 0.5
  return criarLut(lado, (r, g, b, saida) => {
    let w = 0
    let dr = 0
    let dg = 0
    let db = 0
    for (let j = 0; j < n; j++) {
      const x = de[j * 3] - r
      const y = de[j * 3 + 1] - g
      const z = de[j * 3 + 2] - b
      const d2 = x * x + y * y + z * z
      if (d2 > raio2) continue
      const p = Math.exp(-d2 * k2)
      w += p
      dr += p * (para[j * 3] - de[j * 3])
      dg += p * (para[j * 3 + 1] - de[j * 3 + 1])
      db += p * (para[j * 3 + 2] - de[j * 3 + 2])
    }
    const q = 1 / (w + lambda)
    saida[0] = limitar(r + dr * q, 0, 1)
    saida[1] = limitar(g + dg * q, 0, 1)
    saida[2] = limitar(b + db * q, 0, 1)
  })
}

/** O mapa como LUT 17³ no código da tela (o look do resíduo). */
function lutDoMapa(mapa, tela, lado = 17) {
  const ok = criarOklab(tela)
  const curva = curvaDe('srgb')
  const lab = [0, 0, 0]
  const lin = [0, 0, 0]
  return criarLut(lado, (r, g, b, saida) => {
    ok.paraOklab(curva.decodificar(r), curva.decodificar(g), curva.decodificar(b), lab)
    mapa(lab[0], lab[1], lab[2], lab)
    ok.deOklab(lab[0], lab[1], lab[2], lin)
    saida[0] = limitar(curva.codificar(limitar(lin[0], 0, 1)), 0, 1)
    saida[1] = limitar(curva.codificar(limitar(lin[1], 0, 1)), 0, 1)
    saida[2] = limitar(curva.codificar(limitar(lin[2], 0, 1)), 0, 1)
  })
}

function aplicarMapaEmPixels(px, mapa) {
  const L = new Float32Array(px.n)
  const A = new Float32Array(px.n)
  const B = new Float32Array(px.n)
  const o = [0, 0, 0]
  for (let i = 0; i < px.n; i++) {
    mapa(px.L[i], px.A[i], px.B[i], o)
    L[i] = o[0]
    A[i] = o[1]
    B[i] = o[2]
  }
  return { L, A, B, n: px.n, valido: px.valido }
}

// ─────────── vizinhança: vinheta e grão ───────────

function reduzirBase(base, lado) {
  const { largura, altura, dados } = base.imagem
  const k = Math.max(1, Math.ceil(Math.max(largura, altura) / lado))
  const w = Math.floor(largura / k)
  const h = Math.floor(altura / k)
  const saida = new Float32Array(w * h * 3)
  const inv = 1 / (k * k)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3
      for (let dy = 0; dy < k; dy++) {
        let i = ((y * k + dy) * largura + x * k) * 3
        for (let dx = 0; dx < k; dx++, i += 3) {
          saida[o] += dados[i] * inv
          saida[o + 1] += dados[i + 1] * inv
          saida[o + 2] += dados[i + 2] * inv
        }
      }
    }
  }
  return { ...base, imagem: { largura: w, altura: h, dados: saida }, orientacao: 1 }
}

// luz (Oklab L) de uma imagem de código de tela, reduzida para `lado`
function planoDeLuz(lin, w, h, espaco) {
  const ok = criarOklab(espaco)
  const L = new Float32Array(w * h)
  const lab = [0, 0, 0]
  for (let i = 0; i < w * h; i++) L[i] = ok.paraOklab(Math.max(0, lin[i * 3]), Math.max(0, lin[i * 3 + 1]), Math.max(0, lin[i * 3 + 2]), lab)[0]
  return L
}

function caixa1(L, w, h, r) {
  // média em caixa separável (duas passadas), borda replicada
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let d = -r; d <= r; d++) s += L[y * w + limitar(x + d, 0, w - 1)]
      tmp[y * w + x] = s / (2 * r + 1)
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let d = -r; d <= r; d++) s += tmp[limitar(y + d, 0, h - 1) * w + x]
      out[y * w + x] = s / (2 * r + 1)
    }
  }
  return out
}

/** As medidas de vizinhança de um plano de luz: vinheta (canto ÷ centro) e grão. */
function medidasLocais(L, w, h) {
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  const rmax = Math.hypot(cx, cy)
  let canto = 0
  let nCanto = 0
  let centro = 0
  let nCentro = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - cx, y - cy) / rmax
      if (r > 0.8) {
        canto += L[y * w + x]
        nCanto++
      } else if (r < 0.35) {
        centro += L[y * w + x]
        nCentro++
      }
    }
  }
  const raio = Math.max(2, Math.round(Math.max(w, h) * 0.02))
  const largo = caixa1(L, w, h, raio)
  const fino = caixa1(L, w, h, 1)
  const grao = []
  for (let i = 0; i < w * h; i++) {
    if (L[i] < 0.25 || L[i] > 0.85) continue
    // grão: o resíduo fino onde a vizinhança larga é lisa
    if (Math.abs(fino[i] - largo[i]) < 0.01) grao.push(Math.abs(L[i] - fino[i]))
  }
  return {
    vinheta: nCanto && nCentro ? canto / nCanto - centro / nCentro : 0,
    grao: grao.length > 50 ? percentis(grao, [50])[0] : null,
  }
}

// busca de seção áurea num intervalo (função unimodal); devolve o x do menor valor visto
function secaoAurea(f, a, b, passos = 7) {
  const phi = (Math.sqrt(5) - 1) / 2
  let x1 = b - phi * (b - a)
  let x2 = a + phi * (b - a)
  let f1 = f(x1)
  let f2 = f(x2)
  let melhor = f1 < f2 ? [x1, f1] : [x2, f2]
  for (let i = 0; i < passos; i++) {
    if (f1 < f2) {
      b = x2
      x2 = x1
      f2 = f1
      x1 = b - phi * (b - a)
      f1 = f(x1)
      if (f1 < melhor[1]) melhor = [x1, f1]
    } else {
      a = x1
      x1 = x2
      f1 = f2
      x2 = a + phi * (b - a)
      f2 = f(x2)
      if (f2 < melhor[1]) melhor = [x2, f2]
    }
  }
  return melhor[0]
}

// ─────────── a função ───────────

const nivel = (x, alta, media) => (x >= alta ? 'alta' : x >= media ? 'media' : 'baixa')
// sem pares, o que depende do conteúdo cai um degrau: a diferença pode ser da cena e não do tratamento
const rebaixar = (n, sim) => (!sim ? n : n === 'alta' ? 'media' : 'baixa')

/**
 * A referência e o alvo são a mesma cena (a foto da pessoa e a mesma foto tratada; o JPEG da câmera e o RAW)? Mesmo
 * enquadramento (proporção a 1,5%) e correlação de postos de Spearman da luz acima de `R.pareado` nos pontos da amostra.
 * Devolve { indices: [i da amostra], L, A, B (da referência nos mesmos pontos), correlacao } ou null.
 */
function parear(alvo, refR, pxRef, juntos, pxAlvo) {
  if (Math.abs(alvo.largura / alvo.altura - refR.largura / refR.altura) > 0.015 * (alvo.largura / alvo.altura)) return null
  const passo = Math.max(1, Math.floor(juntos.length / R.pares))
  const indices = []
  const L = []
  const A = []
  const B = []
  for (let k = 0; k < juntos.length; k += passo) {
    const p = juntos[k]
    const x = p % alvo.largura
    const y = Math.floor(p / alvo.largura)
    const q =
      Math.min(refR.altura - 1, Math.round((y * refR.altura) / alvo.altura)) * refR.largura +
      Math.min(refR.largura - 1, Math.round((x * refR.largura) / alvo.largura))
    if (!pxRef.valido[q] || !pxAlvo.valido[k]) continue
    indices.push(k)
    L.push(pxRef.L[q])
    A.push(pxRef.A[q])
    B.push(pxRef.B[q])
  }
  if (indices.length < 64) return null
  const postos = (v) => {
    const ordem = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0])
    const r = new Float64Array(v.length)
    ordem.forEach(([, i], k) => (r[i] = k))
    return r
  }
  const ra = postos(indices.map((k) => pxAlvo.L[k]))
  const rb = postos(L)
  const n = indices.length
  const m = (n - 1) / 2
  let sab = 0
  let saa = 0
  let sbb = 0
  for (let i = 0; i < n; i++) {
    sab += (ra[i] - m) * (rb[i] - m)
    saa += (ra[i] - m) ** 2
    sbb += (rb[i] - m) ** 2
  }
  const correlacao = sab / Math.sqrt(saa * sbb)
  return correlacao >= R.pareado ? { indices, L, A, B, correlacao } : null
}

// diferenças ponto a ponto (Oklab) entre a revelação da amostra e a referência, com o mesmo peso de um resíduo de tom
function residuosPareados(px, pares, saida) {
  for (let j = 0; j < pares.indices.length; j++) {
    const k = pares.indices[j]
    saida.push(px.L[k] - pares.L[j], px.A[k] - pares.A[j], px.B[k] - pares.B[j])
  }
  return saida
}

/** ΔE Oklab médio (× 100) ponto a ponto, no modo pareado. */
function erroPareado(px, pares) {
  let s = 0
  for (let j = 0; j < pares.indices.length; j++) {
    const k = pares.indices[j]
    s += Math.hypot(px.L[k] - pares.L[j], px.A[k] - pares.A[j], px.B[k] - pares.B[j])
  }
  return (100 * s) / pares.indices.length
}

/**
 * Extrai o estilo de 1 a 10 referências. Entradas são imagens já decodificadas: { largura, altura, dados (RGBA de 8 ou
 * 16 bits; `canais: 3` para RGB), espaco: 'srgb' | 'p3' }.
 *
 * `opcoes`: alvo (a foto da pessoa, mesmo formato; recomendado), residuo (true: devolve também a LUT 17³ do que os
 * controles não alcançaram), vizinhanca (padrão true: vinheta e grão no caso pareado; textura, clareza, neblina e
 * nitidez com alvo, pareado ou não, ver vizinhanca.js), nome, agora.
 *
 * Devolve { ajustes, predefinicao, confianca: { tom, neutro, cor, misturador, vizinhanca }, erro: { antes, depois,
 * teto, comResiduo, aderencia, alcance, porGrupo: { antes, depois } }, grupos, pb, avisos, look (LUT | null),
 * tempo: { total, porReferencia } (ms), renders }.
 */
export function extrairEstilo(referencias, opcoes = {}) {
  const inicio = performance.now()
  const lista = Array.isArray(referencias) ? referencias : [referencias]
  if (!lista.length) throw new ErroReferencia('sem-referencia', 'Mande ao menos uma foto de referência.')
  if (lista.length > R.maxReferencias) throw new ErroReferencia('referencias-demais', `Use até ${R.maxReferencias} referências.`)
  const conferidas = lista.map((img, i) => conferirImagem(img, `Referência ${i + 1}`))
  const refs = conferidas.map((img) => reduzir(img, R.lado))
  const tela = refs.some((r) => r.espaco === 'p3') ? 'p3' : 'srgb'
  const avisos = []
  const pxRefs = refs.map((r) => oklabDe(r.lin, r.espaco, r.cortado))
  const impressoes = pxRefs.map((px) => impressao(px))
  const ref = media(impressoes)

  // ── o alvo (ou o "sem estilo" da própria referência) ──
  const temAlvo = !!opcoes.alvo
  let alvos
  const alvoConferido = temAlvo ? conferirImagem(opcoes.alvo, 'Alvo') : null
  if (temAlvo) {
    const a = reduzir(alvoConferido, R.lado)
    alvos = [{ ...a, base: baseDeImagem({ largura: a.largura, altura: a.altura, dados: paraCodigos(a.lin), canais: 3, espaco: a.espaco }) }]
  } else {
    alvos = refs.map((r, i) => semEstilo(r, pxRefs[i], impressoes[i]))
    avisos.push('Sem a sua foto para comparar, contraste e saturação da referência não se separam do conteúdo dela: mande também uma foto sua.')
  }
  // amostra do alvo: grade com sorteio fixo, a mesma em toda avaliação
  const porAlvo = Math.floor(R.amostras / alvos.length)
  const juntos = []
  let deslocamento = 0
  const dadosJuntos = []
  for (const a of alvos) {
    const n = a.largura * a.altura
    // grade 2D com um ponto sorteado em cada célula (amostragem estratificada): cobre a foto sem o padrão de uma
    // passada só por linha
    const colunas = Math.max(1, Math.round(Math.sqrt((porAlvo * a.largura) / a.altura)))
    const linhas = Math.max(1, Math.round(porAlvo / colunas))
    const acaso = sorteio(0x5eed)
    for (let gy = 0; gy < linhas; gy++) {
      for (let gx = 0; gx < colunas; gx++) {
        const x = Math.min(a.largura - 1, Math.floor(((gx + acaso()) * a.largura) / colunas))
        const y = Math.min(a.altura - 1, Math.floor(((gy + acaso()) * a.altura) / linhas))
        juntos.push(deslocamento + y * a.largura + x)
      }
    }
    dadosJuntos.push(a.base.imagem.dados)
    deslocamento += n
  }
  const todos = new Float32Array(deslocamento * 3)
  let o = 0
  for (const d of dadosJuntos) {
    todos.set(d, o)
    o += d.length
  }
  const pbRef = ref.pb
  let modelo = criarModelo({ base: alvos[0].base, dados: todos }, juntos, tela, pbRef)
  let rendersAnteriores = 0 // os dos modelos trocados pelo refino com a vizinhança
  let pxAlvo = modelo.pixels(modelo.revelar(neutro()))

  // ── mesma cena? (a referência é a própria foto da pessoa, tratada: dá para comparar pixel a pixel) ──
  const pares = temAlvo && refs.length === 1 ? parear(alvos[0], refs[0], pxRefs[0], juntos, pxAlvo) : null

  // ── refino conjunto com a vizinhança, 1ª volta ──
  // Clareza e neblina mexem no tom e na cor da foto inteira; ajustados depois do tom, o tom (sombras, curva, croma)
  // já teria engolido o efeito (medido: neblina 40 virava sombras −70 e neblina 0). Então: (1) a vizinhança é estimada
  // com o tom neutro (as medidas dela são razões de bandas e de regiões, que pouco ligam para o tom); (2) o tom é
  // ajustado sobre o alvo JÁ com essa clareza e neblina (partida e grupos); (3) a vizinhança é estimada de novo com
  // esse tom e, se mudou, o alvo do modelo é refeito com ela antes do refino conjunto do tom (abaixo).
  let locais = null
  if (temAlvo && opcoes.vizinhanca !== false) {
    const primeira = estimarVizinhanca(conferidas, alvoConferido, neutro(), { pareado: !!pares, tela, soLargas: true })
    const largos = { clareza: primeira.presenca.clareza ?? 0, neblina: primeira.presenca.neblina ?? 0, vinheta: primeira.efeitos.vinheta ?? 0 }
    if (largos.clareza || largos.neblina || largos.vinheta) {
      const base = comVizinhanca(alvos[0].base, largos, tela)
      rendersAnteriores += modelo.renders + 1
      modelo = criarModelo({ base, dados: base.imagem.dados }, juntos, tela, pbRef)
      pxAlvo = modelo.pixels(modelo.revelar(neutro()))
    }
    locais = { primeira }
  }
  const fAlvo = impressao(pxAlvo)
  if (pbRef) avisos.push('A referência é preto e branco: a cor não dá para copiar. Saiu um preto e branco com o tom dela.')
  else if (fAlvo.pb) avisos.push('A sua foto não tem cor: só a luz e o tom entram.')
  const pesos = pesosDe(ref, fAlvo)
  const bandasUteis = pesos.neutro.filter((v) => v > 0.02).length
  if (bandasUteis < 3) avisos.push('Há poucos tons quase neutros nas fotos: a tonalização não foi copiada.')

  // ── os controles ativos ──
  // Pareado (mesma cena): todos. Cena diferente: só os globais (sem a curva de pontos de quatro regiões, que copiaria o
  // histograma do conteúdo) e, do misturador, só a saturação por faixa. Sem alvo: só a tonalização (e o P&B).
  pesos.soCroma = !pares
  const params = temAlvo ? (pares ? [...TOM] : TOM.filter((p) => !p.caminho.startsWith('curva.'))) : []
  if (bandasUteis >= 3) params.push(...NEUTRO)
  const faixasAtivas = []
  if (!pesos.semCor && temAlvo) {
    params.push(...COR)
    FAIXAS.forEach((_, k) => {
      if (Math.min(ref.faixas[k], fAlvo.faixas[k]) >= R.coberturaFaixa) {
        faixasAtivas.push(k)
        params.push(...misturadorDe(k).filter((p) => pares || p.caminho.startsWith('misturador.saturacao')))
      }
    })
    if (faixasAtivas.length < 3) avisos.push('Cena com pouca variedade de cor: só as faixas de cor presentes nas duas fotos foram ajustadas.')
  } else if (pbRef && pares) params.push(...PB)
  const valores = params.map(() => 0)
  const vetorDe = (v) => {
    const px = modelo.pixels(modelo.revelar(montar(params, v)))
    const r = residuos(impressao(px, false), ref, pesos)
    const saida = [...r.tom, ...r.neutro, ...r.setor, ...r.croma]
    if (pares) residuosPareados(px, pares, saida)
    return saida
  }
  // o erro e o custo de não mexer (refeitos quando a vizinhança da 2ª volta troca o alvo do modelo)
  let antes
  let custoNeutro
  const medirNeutro = () => {
    const r0 = residuos(impressao(pxAlvo, false), ref, pesos)
    antes = erroDe(r0)
    const vetor0 = [...r0.tom, ...r0.neutro, ...r0.setor, ...r0.croma]
    if (pares) residuosPareados(pxAlvo, pares, vetor0)
    custoNeutro = vetor0.reduce((s, x) => s + x * x, 0)
  }
  medirNeutro()
  // penalidade: todos os controles em 100 custariam `R.penalidade` do erro inicial. Pareado, os dados decidem mais.
  const penalidade = Math.sqrt(((pares ? R.penalidade : R.penalidadeSemPar) * custoNeutro) / Math.max(1, params.length))

  // ── 2. partida fechada e grupo a grupo ──
  const custoDe = (v) => vetorDe(v).reduce((s, x) => s + x * x, 0)
  partidaFechada(params, valores, ref, fAlvo, pesos)
  // a partida fechada só fica se for melhor que não mexer
  if (custoDe(valores) > custoNeutro) valores.fill(0)
  const op = { penalidade }
  if (temAlvo) ajustar(params, valores, vetorDe, { ...op, iteracoes: 4, grupos: ['tom'] })
  if (bandasUteis >= 3) ajustar(params, valores, vetorDe, { ...op, iteracoes: 3, grupos: ['neutro'] })
  if (!pesos.semCor && temAlvo) {
    ajustar(params, valores, vetorDe, { ...op, iteracoes: 3, grupos: ['cor'] })
    if (faixasAtivas.length) ajustar(params, valores, vetorDe, { ...op, iteracoes: 2, grupos: ['misturador'] })
  } else if (pbRef && pares) ajustar(params, valores, vetorDe, { ...op, iteracoes: 3, grupos: ['pb'] })
  // ── refino conjunto com a vizinhança, 2ª volta: medida com o tom da partida; se a clareza ou a neblina mudaram, o
  // modelo passa a usar o alvo com as novas, e o refino conjunto do tom (abaixo) corre sobre ele ──
  if (locais) {
    const segunda = estimarVizinhanca(conferidas, alvoConferido, normalizar(montar(params, valores)), { pareado: !!pares, tela })
    const doBloco = (l) => ({ clareza: l.presenca.clareza ?? 0, neblina: l.presenca.neblina ?? 0, vinheta: l.efeitos.vinheta ?? 0 })
    const antigos = doBloco(locais.primeira)
    const largos = doBloco(segunda)
    if (Object.keys(largos).some((k) => largos[k] !== antigos[k])) {
      const base = comVizinhanca(alvos[0].base, largos, tela)
      rendersAnteriores += modelo.renders + 1
      modelo = criarModelo({ base, dados: base.imagem.dados }, juntos, tela, pbRef)
      pxAlvo = modelo.pixels(modelo.revelar(neutro()))
      medirNeutro()
    }
    locais = { ...segunda, renders: locais.primeira.renders + segunda.renders }
  }
  // ── 3. refino conjunto ──
  ajustar(params, valores, vetorDe, { ...op, iteracoes: 3 })

  // poda: zera à prova, do menor para o maior
  let custo = custoDe(valores)
  const ganho = Math.max(0, custoNeutro - custo)
  const unidades = []
  params.forEach((p, i) => {
    if (p.grupo === 'neutro') {
      if (p.caminho.endsWith('.x')) unidades.push([i, i + 1])
    } else unidades.push([i])
  })
  unidades.sort((a, b) => Math.hypot(...a.map((i) => valores[i])) - Math.hypot(...b.map((i) => valores[i])))
  for (const u of unidades) {
    if (u.every((i) => Math.abs(valores[i]) < 0.5)) continue
    const v = valores.slice()
    for (const i of u) v[i] = 0
    const c = custoDe(v)
    if (c - custo <= R.poda * ganho) {
      for (const i of u) valores[i] = 0
      custo = Math.min(custo, c)
    }
  }
  // arredonda para o passo dos controles; se no fim não ficou melhor que não mexer, não mexe
  for (let i = 0; i < valores.length; i++) valores[i] = Math.round(valores[i])
  if (params.length && custoDe(valores) >= custoNeutro) {
    valores.fill(0)
    avisos.push('Nenhum ajuste chegou mais perto da referência do que a foto como está.')
  }
  let ajustes = montar(params, valores)
  for (const z of ['sombras', 'altas', 'global']) {
    const t = ajustes.tonalizacao[z]
    ajustes.tonalizacao[z] = { matiz: Math.round(t.matiz), saturacao: Math.round(t.saturacao), luz: 0 }
  }
  if (pbRef) ajustes.pb.ativo = true
  ajustes = normalizar(ajustes)
  const pxDepois = modelo.pixels(modelo.revelar(ajustes))
  const fDepois = impressao(pxDepois)
  const depois = erroDe(residuos(fDepois, ref, pesos))
  const pixelAntes = pares ? erroPareado(pxAlvo, pares) : null
  const pixelDepois = pares ? erroPareado(pxDepois, pares) : null

  // ── vizinhança (só com alvo) ──
  // Vinheta e grão: só pareado (ajustarVizinhanca). Textura, clareza, neblina e nitidez: com alvo, pareado ou não
  // (vizinhanca.js), cada um só quando a medida responde e o valor passa da incerteza.
  let vizinhanca = null
  if (pares && opcoes.vizinhanca !== false) vizinhanca = ajustarVizinhanca(alvos[0], refs, ajustes, tela, !!locais)
  if (vizinhanca) Object.assign(ajustes.efeitos, vizinhanca.efeitos)
  if (locais) {
    Object.assign(ajustes.presenca, locais.presenca)
    Object.assign(ajustes.efeitos, locais.efeitos)
    Object.assign(ajustes.detalhe, locais.detalhe)
  }

  // ── 4. teto e resíduo ──
  // Pareado, o mapa não paramétrico sai dos pares de pixels (grade 17³ por regressão de núcleo); sem pares, da impressão.
  const pxNeutro = modelo.pixels(modelo.revelar(neutro()))
  let teto
  let tetoPareado = null
  if (pares) {
    const codNeutro = modelo.revelar(neutro())
    const lutTeto = lutPareada(codNeutro, pares, tela)
    const pxTeto = modelo.pixels(modelo.revelar(neutro(), aplicarLut(lutTeto)))
    teto = erroDe(residuos(impressao(pxTeto, false), ref, pesos))
    tetoPareado = erroPareado(pxTeto, pares)
  } else teto = erroDe(residuos(impressao(aplicarMapaEmPixels(pxNeutro, mapaDeImpressao(fAlvo, ref, pesos)), false), ref, pesos))
  let look = null
  let comResiduo = null
  let comResiduoPareado = null
  let quantidadeDoLook = 100
  if (opcoes.residuo) {
    const lut = pares ? lutPareada(modelo.revelar(ajustes), pares, tela) : lutDoMapa(mapaDeImpressao(fDepois, ref, pesos), tela)
    lut.titulo = 'Resíduo da referência'
    // a quantidade que mais aproxima (o mapa sem pares pode passar do ponto); nenhuma melhora = sem resíduo
    const medirCom = (q) => {
      const a = structuredClone(ajustes)
      a.look.quantidade = q
      const px = modelo.pixels(modelo.revelar(a, aplicarLut(lut)))
      return { q, total: erroDe(residuos(impressao(px, false), ref, pesos)).total, pixel: pares ? erroPareado(px, pares) : null }
    }
    const medida = (m) => (pares ? m.pixel : m.total)
    const melhor = [medirCom(100), medirCom(50)].sort((x, y) => medida(x) - medida(y))[0]
    if (medida(melhor) < (pares ? pixelDepois : depois.total)) {
      look = lut
      quantidadeDoLook = melhor.q
      comResiduo = melhor.total
      comResiduoPareado = melhor.pixel
    } else avisos.push('O resíduo em LUT não melhorou nada: ficou de fora.')
  }

  // ── 5. saída ──
  // pareado, a medida que vale é ponto a ponto; sem pares, a das impressões
  const [eA, eD, eT] = pares ? [pixelAntes, pixelDepois, tetoPareado] : [antes.total, depois.total, teto.total]
  const aderencia = eA > 1e-9 ? 1 - eD / eA : 1
  const alcance = eA - eT > 1e-6 ? limitar((eA - eD) / (eA - eT), 0, 1) : 1
  const melhora = (g) => (antes.porGrupo[g] > 0.05 ? 1 - depois.porGrupo[g] / antes.porGrupo[g] : 1)
  const confianca = {
    tom: !temAlvo ? 'baixa' : rebaixar(nivel(melhora('tom'), 0.6, 0.3), !pares),
    neutro: bandasUteis >= 5 ? nivel(melhora('neutro'), 0.6, 0.3) : bandasUteis >= 3 ? 'media' : 'baixa',
    cor: pesos.semCor || !temAlvo ? 'baixa' : rebaixar(nivel(melhora('croma'), 0.5, 0.25), !pares),
    misturador: pesos.semCor || !faixasAtivas.length ? 'baixa' : pares && faixasAtivas.length >= 4 ? nivel(melhora('setor'), 0.5, 0.25) : 'baixa',
    vizinhanca: confiancaLocal(vizinhanca, locais, refs.length),
  }
  const relatorio = {
    referencias: refs.length,
    comAlvo: temAlvo,
    pareado: !!pares,
    erro: { antes: arred(antes.total), depois: arred(depois.total), teto: arred(teto.total) },
    aderencia: arred(aderencia, 3),
    alcance: arred(alcance, 3),
    confianca,
    avisos,
  }
  if (locais) {
    // por controle de vizinhança: o valor, a incerteza (em unidades do controle) e por que saiu ou não
    relatorio.vizinhanca = Object.fromEntries(
      Object.entries(locais.controles).map(([k, c]) => [k, { valor: c.sai ? c.valor : 0, medido: c.valor, incerteza: c.incerteza, confianca: c.confianca, razao: c.razao }]),
    )
  }
  const campos = {
    nome: opcoes.nome ?? 'Da referência',
    familia: opcoes.familia ?? 'Minhas',
    descricao: 'Estilo extraído de uma foto de referência.',
    ajustes,
    origem: { tipo: 'referencia', relatorio },
  }
  if (look && opcoes.residuo) {
    campos.look = compactar(look, 'Resíduo da referência').look
    campos.ajustes = { ...ajustes, look: { id: null, quantidade: quantidadeDoLook } }
  }
  const predefinicao = criarPredefinicao(campos, { agora: opcoes.agora ?? null })
  const total = performance.now() - inicio
  return {
    ajustes,
    predefinicao,
    confianca,
    erro: {
      antes: antes.total,
      depois: depois.total,
      teto: teto.total,
      comResiduo,
      aderencia,
      alcance,
      porGrupo: { antes: antes.porGrupo, depois: depois.porGrupo },
      pareado: pares ? { antes: pixelAntes, depois: pixelDepois, teto: tetoPareado, comResiduo: comResiduoPareado, correlacao: pares.correlacao } : null,
    },
    pareado: !!pares,
    grupos: gruposMexidos(predefinicao),
    pb: pbRef,
    avisos,
    look,
    vizinhanca: vizinhanca || locais ? { ...(vizinhanca?.medidas ?? {}), controles: locais?.controles ?? null } : null,
    tempo: { total, porReferencia: total / refs.length },
    renders: rendersAnteriores + modelo.renders + (vizinhanca?.renders ?? 0) + (locais?.renders ?? 0),
  }
}

const arred = (v, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas

// A confiança do grupo "vizinhança": a melhor entre a dos controles locais que saíram (vizinhanca.js) e a da vinheta e
// do grão (média com várias referências, baixa com uma).
function confiancaLocal(vinhetaEGrao, locais, referencias) {
  const ordem = ['baixa', 'media', 'alta']
  let n = vinhetaEGrao && (Object.keys(vinhetaEGrao.efeitos).length || 0) ? (referencias > 1 ? 1 : 0) : 0
  for (const c of Object.values(locais?.controles ?? {})) if (c.sai) n = Math.max(n, ordem.indexOf(c.confianca))
  return ordem[n]
}

// O alvo com clareza, neblina e vinheta já aplicadas, de volta à cena pela inversa da tela (baseDeImagem): é sobre ele que o
// tom é ajustado na 1ª volta do refino conjunto. A ordem fica trocada (vizinhança antes do tom; no motor é depois), o
// que só serve para o tom não engolir o efeito; a 2ª volta mede a vizinhança na ordem do motor.
function comVizinhanca(base, { clareza, neblina, vinheta }, tela) {
  const a = neutro()
  a.presenca.clareza = clareza
  a.presenca.neblina = neblina
  a.efeitos.vinheta = vinheta
  const img = revelar(base, a, { tela, semente: 7 })
  const codigos = new Uint16Array(img.dados.length)
  for (let i = 0; i < codigos.length; i++) codigos[i] = Math.round(limitar(img.dados[i], 0, 1) * 65535)
  return baseDeImagem({ largura: img.largura, altura: img.altura, dados: codigos, canais: 3, espaco: tela })
}

// O "sem estilo" de uma referência (quando não há alvo): a mesma foto com o eixo neutro zerado. É o único pedaço do
// estilo que se separa do conteúdo numa foto só (ver o cabeçalho).
function semEstilo(r, px, f) {
  const ok = criarOklab(r.espaco)
  const lin = new Float32Array(r.lin.length)
  const saida = [0, 0, 0]
  for (let i = 0; i < px.n; i++) {
    const [ea, eb] = f.eixo(px.L[i])
    ok.deOklab(px.L[i], px.A[i] - ea, px.B[i] - eb, saida)
    lin[i * 3] = saida[0]
    lin[i * 3 + 1] = saida[1]
    lin[i * 3 + 2] = saida[2]
  }
  return { ...r, lin, base: baseDeImagem({ largura: r.largura, altura: r.altura, dados: paraCodigos(lin), canais: 3, espaco: r.espaco }) }
}

// Vinheta e grão por busca de seção áurea, comparando as medidas locais da referência (média das referências) com as da
// revelação do alvo a 256 px (vinheta) e do miolo a 512 px (grão). A clareza saiu daqui: vizinhanca.js a mede na banda
// do próprio controle, junto com textura, neblina e nitidez.
function ajustarVizinhanca(alvo, refs, ajustes, tela, comLocais = false) {
  const L = R.ladoLocal
  const medidasRef = refs.map((r) => {
    const red = reduzir({ largura: r.largura, altura: r.altura, dados: paraCodigos(r.lin), canais: 3, espaco: r.espaco, niveis: 65535 }, L)
    return {
      local: medidasLocais(planoDeLuz(red.lin, red.largura, red.altura, r.espaco), red.largura, red.altura),
      grao: medidasLocais(planoDeLuz(r.lin, r.largura, r.altura, r.espaco), r.largura, r.altura).grao,
    }
  })
  const alvoRef = {
    vinheta: medidasRef.reduce((s, m) => s + m.local.vinheta, 0) / refs.length,
    grao: medidasRef.every((m) => m.grao != null) ? medidasRef.reduce((s, m) => s + m.grao, 0) / refs.length : null,
  }
  const pequena = reduzirBase(alvo.base, L)
  let renders = 0
  const medir = (a, base = pequena, regiao = null) => {
    renders++
    const img = revelar(base, a, { tela, regiao, semente: 7 })
    const lin = linearDoCodigo(img.dados)
    return medidasLocais(planoDeLuz(lin, img.largura, img.altura, tela), img.largura, img.altura)
  }
  const comControle = (caminho, v) => {
    const a = structuredClone(ajustes)
    const [g, c] = caminho.split('.')
    a[g][c] = v
    return a
  }
  const efeitos = {}
  const neutroLocal = medir(ajustes)
  // Vinheta: só quando a medida responde ao controle (de −50 a +50 a medida tem de andar mais que 3% do valor dela);
  // senão o controle não se separa do conteúdo e fica em zero.
  const buscar = (caminho, campo) => {
    const m = (v) => medir(comControle(caminho, v))[campo]
    const baixo = m(-50)
    const alto = m(50)
    if (Math.abs(alto - baixo) < 0.03 * Math.max(Math.abs(alto), Math.abs(baixo), 1e-3)) return 0
    const v = secaoAurea((x) => Math.abs(m(x) - alvoRef[campo]), -100, 100, 7)
    return Math.abs(v) >= 8 ? Math.round(v) : 0
  }
  // a vinheta, pareada, agora sai de vizinhanca.js junto com clareza e neblina (que mexem nos cantos também); aqui
  // ela só é buscada quando a vizinhança nova foi desligada
  if (!comLocais) {
    const vin = buscar('efeitos.vinheta', 'vinheta')
    if (vin) efeitos.vinheta = vin
  }
  // grão: no miolo do alvo a 512 px (onde o grão de uma referência de 512 px se mede)
  let grao = 0
  if (alvoRef.grao != null) {
    const base = alvo.base
    const lado = Math.min(160, base.imagem.largura, base.imagem.altura)
    const regiao = { x: Math.floor((base.imagem.largura - lado) / 2), y: Math.floor((base.imagem.altura - lado) / 2), largura: lado, altura: lado }
    const g = (v) => medir(comControle('efeitos.grao', v), base, regiao).grao ?? 0
    const semGrao = g(0)
    if (alvoRef.grao > semGrao * 1.15) {
      grao = secaoAurea((v) => Math.abs(g(v) - alvoRef.grao), 0, 100, 6)
      if (grao >= 6) efeitos.grao = Math.round(grao)
    }
  }
  return { efeitos, medidas: { referencia: alvoRef, alvo: neutroLocal }, renders }
}
