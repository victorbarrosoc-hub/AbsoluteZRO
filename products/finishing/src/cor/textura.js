// Revela · textura de filme: halation, difusão (bloom) e grão. São efeitos de espaço (dependem dos vizinhos do pixel) e
// nenhuma LUT carrega; aqui a conta é a mesma da prévia no navegador e da DCTL que vai para o Resolve
// (src/cor/dctl.js), na ordem em que acontecem no filme e na luz da cena (DWG linear), antes do look:
//   1. difusão: a luz forte se espalha na lente e no filtro difusor (todas as cores);
//   2. halation: a luz atravessa a emulsão, bate na base do filme e volta, expondo de novo a camada vermelha (e um pouco
//      a verde) em volta dos pontos fortes: o halo laranja do cinema;
//   3. grão: ruído de densidade no negativo, por camada, com o tamanho da bitola e a granularidade da película. A
//      granularidade cresce com a prata (√ da densidade) e a mesma variação de densidade vale mais luz onde a curva da
//      ficha é deitada (o pé): o grão pesa nas sombras; nas altas a cópia o comprime e ele fica fino.
// O grão é um campo gaussiano: ruído branco numa grade (passo k) convoluído com uma gaussiana de desvio `tamanho`,
// normalizado para variância 1 em todo ponto. Com k = 1 é ruído branco filtrado (o modelo clássico de granularidade,
// Selwyn); com grão grande a grade fica mais espaçada (k ≤ tamanho/1,5) e a conta continua leve, sem padrão de grade.

import { luminancia } from './cena.js'
import { criarNegativo } from './negativos.js'
import { criarCopia } from './copia.js'

// ─────────── ruído determinístico (o mesmo na DCTL) ───────────

/** Hash inteiro de 32 bits (Wang + xorshift), igual em JS e na DCTL. */
export function hash(x, y, c, semente) {
  let h = (x * 374761393 + y * 668265263 + c * 2246822519 + semente * 3266489917) >>> 0
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h
}
/** Ruído de média 0 e variância 1 (soma de 2 uniformes: triangular; a gaussiana do campo faz o resto). */
export function ruido(x, y, c, semente) {
  const s = hash(x, y, c * 2, semente) / 4294967296 + hash(x, y, c * 2 + 1, semente) / 4294967296
  return (s - 1) * Math.sqrt(6)
}

// ─────────── grão pela curva do negativo ───────────

const PESO_E0 = -10 // stops em relação ao cinza
const PESO_PASSO = 0.25
export const PESO_N = 73 // de -10 a +8 stops
export const GRAO_COPIA = 0.3 // no cinza, a parte da variância do grão que é da cópia
const tabelasDoGrao = new Map()
/**
 * Quanto o grão pesa em cada exposição, para o negativo da ficha (relativo ao cinza 18%). O grão nasce na densidade do
 * negativo e a granularidade cresce com a prata (√ da densidade acima da base); de volta à luz da cena, a mesma variação
 * de densidade vale 1 ÷ a inclinação da curva: no pé, onde a curva deita, o grão pesa. Soma-se o grão da cópia (2383),
 * que cresce com a densidade dela e pesa nas sombras da tela. O limite (0,5 a 4) segura o fundo do pé, onde as curvas
 * quase não sobem. Sem negativo da ficha (digital), vale a forma do Vision3 500T.
 */
export function tabelaDoGrao(negativo) {
  const id = negativo && negativo !== 'digital' ? negativo : '5219'
  if (tabelasDoGrao.has(id)) return tabelasDoGrao.get(id)
  const neg = criarNegativo(id)
  const dens = (e) => (neg.delta(0, e) + neg.delta(1, e) + neg.delta(2, e)) / 3
  const base = dens(-16)
  const inclinacao = (e) => (dens(e + 0.05) - dens(e - 0.05)) / 0.1
  const bruto = (e) => Math.sqrt(Math.max(0, dens(e) - base) + 0.05) / Math.max(1e-4, inclinacao(e))
  // o grão da cópia (2383): os corantes da cópia também formam nuvens, e a granularidade cresce com a densidade dela
  // (√ da densidade acima da base); visto da luz da cena, vale 1 ÷ a inclinação do sistema. É ele que pesa nas
  // sombras da tela, onde a cópia é densa; no branco da base quase não há corante e ele fica fino
  const copia = criarCopia('2383', { negativo: id })
  const Y = (e) => {
    const v = 0.18 * 2 ** e
    const t = copia.tela([v, v, v])
    return Math.max(1e-6, 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2])
  }
  const Yb = Y(12)
  const dc = (e) => Math.max(0, -Math.log10(Y(e) / Yb))
  const incl = (e) => (dc(e - 0.05) - dc(e + 0.05)) / 0.1
  const daCopia = (e) => Math.sqrt(dc(e) + 0.05) / Math.max(1e-3, incl(e))
  const ref = bruto(0)
  const refC = daCopia(0)
  const t = new Float64Array(PESO_N)
  for (let k = 0; k < PESO_N; k++) {
    const e = PESO_E0 + k * PESO_PASSO
    const neg = bruto(e) / ref
    const cop = daCopia(e) / refC
    // as duas granularidades se somam em variância; no cinza o negativo manda (GRAO_COPIA da variância do total)
    t[k] = Math.min(4, Math.max(0.5, Math.sqrt((1 - GRAO_COPIA) * neg * neg + GRAO_COPIA * cop * cop)))
  }
  tabelasDoGrao.set(id, t)
  return t
}
/** O peso do grão na exposição `e` (stops em relação ao cinza), interpolado na tabela. */
export function pesoDoGrao(t, e) {
  const u = Math.min(PESO_N - 1, Math.max(0, (e - PESO_E0) / PESO_PASSO))
  const k = Math.min(PESO_N - 2, Math.floor(u))
  return t[k] + (t[k + 1] - t[k]) * (u - k)
}

// ─────────── predefinições ───────────

/** Bitolas: o tamanho do grão relativo a um quadro de 1920 de largura e quanto ele pesa. */
export const BITOLAS = [
  { id: '65', nome: '65 mm', tamanho: 0.55, peso: 0.7 },
  { id: '35', nome: '35 mm', tamanho: 1, peso: 1 },
  { id: '16', nome: '16 mm', tamanho: 2, peso: 1.6 },
  { id: '8', nome: 'Super 8', tamanho: 3.4, peso: 2.4 },
]
/** Granularidade de cada negativo (desvio do grão em stops no meio-tom, 35 mm, num quadro de 1920). */
export const GRANULARIDADE = {
  5219: 0.034,
  5213: 0.026,
  5207: 0.025,
  5203: 0.016,
  8573: 0.033,
  8583: 0.032,
  8553: 0.027,
  8563: 0.025,
  8543: 0.022,
  8592: 0.03,
  digital: 0.026,
}

export const TEXTURA_NEUTRA = {
  grao: 0, // 0–2 (1 = a granularidade da película)
  bitola: '35',
  tamanhoGrao: 1, // multiplica o tamanho da bitola
  corGrao: 0.35, // 0 = grão só de luz (monocromático), 1 = cada camada independente
  sombraGrao: 0, // 0–1: escolha criativa por cima da física, mais grão nas sombras (0 = só a física)
  semente: 0,
  halation: 0, // 0–2
  raioHalation: 1, // 0,3–3 (1 ≈ 0,6% da largura)
  corHalation: 1, // 0 = branco, 1 = laranja do filme, 2 = vermelho forte
  difusao: 0, // 0–1
  raioDifusao: 1,
}

export const PRESETS_TEXTURA = [
  { id: 'limpo', nome: 'Limpo', valores: {} },
  { id: '35', nome: '35 mm', valores: { grao: 1, bitola: '35', halation: 0.5 } },
  { id: '16', nome: '16 mm', valores: { grao: 1, bitola: '16', halation: 0.7, difusao: 0.15 } },
  { id: '8', nome: 'Super 8', valores: { grao: 1, bitola: '8', halation: 0.9, difusao: 0.3, corGrao: 0.5 } },
  { id: '65', nome: '65 mm', valores: { grao: 1, bitola: '65', halation: 0.35 } },
]

export const texturaAtiva = (t) => !!t && (t.grao > 0 || t.halation > 0 || t.difusao > 0)

/** Controles da textura no Lab (valor da barra × escala = valor da textura). */
export const AJUSTES_TEXTURA = [
  { id: 'grao', nome: 'Grão', min: 0, max: 200, escala: 0.01, dica: '100 = a granularidade da película escolhida' },
  { id: 'halation', nome: 'Halation', min: 0, max: 200, escala: 0.01, dica: 'O halo laranja em volta da luz forte' },
  { id: 'difusao', nome: 'Difusão', min: 0, max: 100, escala: 0.01, dica: 'O brilho de um filtro difusor nas altas' },
  { id: 'tamanhoGrao', nome: 'Tamanho do grão', min: 50, max: 200, escala: 0.01, fino: true, dica: 'Sobre o tamanho da bitola' },
  { id: 'corGrao', nome: 'Cor do grão', min: 0, max: 100, escala: 0.01, fino: true, dica: '0 = grão só de luz; 100 = cada camada com o seu' },
  {
    id: 'sombraGrao',
    nome: 'Grão nas sombras',
    min: 0,
    max: 100,
    escala: 0.01,
    fino: true,
    dica: 'Escolha criativa por cima da física: o grão pesa mais nas sombras (0 = só negativo e cópia)',
  },
  { id: 'raioHalation', nome: 'Raio da halation', min: 30, max: 300, escala: 0.01, fino: true, dica: 'O tamanho do halo' },
  { id: 'corHalation', nome: 'Cor da halation', min: 0, max: 200, escala: 0.01, fino: true, dica: '0 = branco, 100 = laranja do filme, 200 = vermelho' },
  { id: 'raioDifusao', nome: 'Raio da difusão', min: 30, max: 300, escala: 0.01, fino: true, dica: 'O tamanho do brilho' },
  { id: 'semente', nome: 'Semente do grão', min: 0, max: 1000, escala: 1, fino: true, dica: 'Outro desenho de grão (no Resolve, anime para o grão andar)' },
]

/** Textura de uma receita: só valores conhecidos, no limite de cada controle. */
export function lerTextura(t) {
  const out = { ...TEXTURA_NEUTRA }
  if (!t || typeof t !== 'object') return out
  for (const a of AJUSTES_TEXTURA) {
    const v = Number(t[a.id])
    if (Number.isFinite(v)) out[a.id] = Math.min(a.max * a.escala, Math.max(a.min * a.escala, v))
  }
  if (BITOLAS.some((b) => b.id === t.bitola)) out.bitola = t.bitola
  return out
}

// ─────────── desfoque ───────────

/** Desfoque gaussiano separável (aproximado por três caixas, O(n)) de um canal. */
function caixas(sigma) {
  const n = 3
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1)
  let wl = Math.floor(wIdeal)
  if (wl % 2 === 0) wl--
  const wu = wl + 2
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4))
  return [0, 1, 2].map((i) => ((i < m ? wl : wu) - 1) / 2)
}
function caixaH(src, dst, w, h, r) {
  const k = 1 / (r + r + 1)
  for (let y = 0; y < h; y++) {
    const o = y * w
    let soma = src[o] * (r + 1)
    for (let i = 1; i <= r; i++) soma += src[o + Math.min(w - 1, i)]
    for (let x = 0; x < w; x++) {
      dst[o + x] = soma * k
      soma += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)]
    }
  }
}
function caixaV(src, dst, w, h, r) {
  const k = 1 / (r + r + 1)
  for (let x = 0; x < w; x++) {
    let soma = src[x] * (r + 1)
    for (let i = 1; i <= r; i++) soma += src[Math.min(h - 1, i) * w + x]
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = soma * k
      soma += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x]
    }
  }
}
/** Desfoque de um canal (Float32Array w×h), desvio `sigma` em pixels. */
export function desfocar(canal, w, h, sigma) {
  if (!(sigma > 0.3)) return Float32Array.from(canal)
  const a = Float32Array.from(canal)
  const b = new Float32Array(canal.length)
  for (const r of caixas(sigma)) {
    const ri = Math.max(0, Math.round(r))
    caixaH(a, b, w, h, ri)
    caixaV(b, a, w, h, ri)
  }
  return a
}

// ─────────── campo de grão ───────────

/**
 * Campo de grão de um canal (média 0, variância 1), w×h, com desvio `sigma` px. Ruído numa grade de passo k
 * convoluído com a gaussiana (separável) e normalizado ponto a ponto.
 */
const memoria = new Map()
export function campoDeGrao(w, h, sigma, canal, semente) {
  const chave = `${w}x${h}:${sigma.toFixed(4)}:${canal}:${semente}`
  if (memoria.has(chave)) return memoria.get(chave)
  const campo = gerarCampo(w, h, sigma, canal, semente)
  if (memoria.size > 12) memoria.delete(memoria.keys().next().value)
  memoria.set(chave, campo)
  return campo
}
function gerarCampo(w, h, sigma, canal, semente) {
  const s = Math.max(0.35, sigma)
  const k = Math.max(1, Math.floor(s / 1.5))
  const r = Math.ceil(3 * s)
  const gh = Math.ceil(h / k) + 2 * Math.ceil(r / k) + 2
  const o = Math.ceil(r / k) + 1 // margem da grade
  const g = (d) => Math.exp((-0.5 * d * d) / (s * s))
  // pesos de cada pixel para as células da grade vizinhas (iguais para todas as linhas: separável)
  const pesos = (n) => {
    const lista = []
    for (let p = 0; p < n; p++) {
      const ini = Math.floor((p - r) / k)
      const fim = Math.ceil((p + r) / k)
      const ws = []
      let q = 0
      for (let i = ini; i <= fim; i++) {
        const v = g(p - i * k)
        ws.push([i, v])
        q += v * v
      }
      lista.push({ ws, norma: Math.sqrt(q) })
    }
    return lista
  }
  const px = pesos(w)
  const py = pesos(h)
  // passo 1: na horizontal, para cada linha da grade
  const linhas = new Float32Array(gh * w)
  for (let j = 0; j < gh; j++)
    for (let x = 0; x < w; x++) {
      let v = 0
      for (const [i, p] of px[x].ws) v += ruido(i, j - o, canal, semente) * p
      linhas[j * w + x] = v / px[x].norma
    }
  // passo 2: na vertical
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0
      for (const [j, p] of py[y].ws) v += linhas[(j + o) * w + x] * p
      out[y * w + x] = v / py[y].norma
    }
  return out
}

// ─────────── a textura ───────────

/**
 * Aplica a textura a uma imagem na luz da cena (DWG linear, Float32Array RGB, w×h). `t`: valores de TEXTURA_NEUTRA;
 * `negativo`: id do negativo (granularidade); `largura`: largura de referência (o quadro inteiro, para o tamanho do grão
 * e dos halos valer igual na prévia e no arquivo). Devolve uma nova Float32Array.
 */
export function aplicarTextura(img, w, h, t, { negativo = 'digital', largura = w } = {}) {
  const tt = { ...TEXTURA_NEUTRA, ...t }
  const out = Float32Array.from(img)
  const n = w * h
  const escala = largura / 1920 // tudo é medido num quadro de 1920 e escala com a imagem
  const canal = (c) => {
    const a = new Float32Array(n)
    for (let i = 0; i < n; i++) a[i] = out[i * 3 + c]
    return a
  }

  // 1. difusão: um halo branco suave dos pontos fortes (acima do cinza +2 stops)
  if (tt.difusao > 0) {
    const sigma = 0.012 * largura * tt.raioDifusao
    for (let c = 0; c < 3; c++) {
      const a = canal(c)
      const forte = a.map((v) => Math.max(0, v - 0.72))
      const b = desfocar(forte, w, h, sigma)
      for (let i = 0; i < n; i++) out[i * 3 + c] += 0.35 * tt.difusao * b[i]
    }
  }

  // 2. halation: a luz forte volta da base e expõe de novo a camada vermelha (e um pouco a verde)
  if (tt.halation > 0) {
    const Y = new Float32Array(n)
    for (let i = 0; i < n; i++) Y[i] = Math.max(0, luminancia([out[i * 3], out[i * 3 + 1], out[i * 3 + 2]]) - 0.9)
    const sigma = 0.006 * largura * tt.raioHalation
    // duas escalas: o halo perto da borda e o mais largo, como no filme sem remjet
    const perto = desfocar(Y, w, h, sigma)
    const longe = desfocar(Y, w, h, sigma * 3)
    const cor = [1, 0.32 * (1 - 0.4 * (tt.corHalation - 1)), 0.06]
    const branco = Math.max(0, 1 - tt.corHalation)
    for (let i = 0; i < n; i++) {
      const v = 0.6 * perto[i] + 0.4 * longe[i]
      for (let c = 0; c < 3; c++) out[i * 3 + c] += 0.22 * tt.halation * v * (cor[c] * (1 - branco) + branco)
    }
  }

  // 3. grão: densidade no negativo, em stops de exposição, por camada (parte comum às três e parte de cada uma)
  if (tt.grao > 0) {
    const bitola = BITOLAS.find((b) => b.id === tt.bitola) ?? BITOLAS[1]
    const sigma = Math.max(0.35, 0.55 * bitola.tamanho * tt.tamanhoGrao * escala)
    const desvio = tt.grao * bitola.peso * (GRANULARIDADE[negativo] ?? GRANULARIDADE.digital)
    const semente = Math.round(tt.semente) | 0
    const comum = campoDeGrao(w, h, sigma, 3, semente)
    const proprio = [0, 1, 2].map((c) => campoDeGrao(w, h, sigma * 0.85, c, semente))
    const mistura = Math.min(1, Math.max(0, tt.corGrao))
    const a = Math.sqrt(1 - mistura * mistura)
    const tabela = tabelaDoGrao(negativo)
    for (let i = 0; i < n; i++) {
      const Yi = Math.max(1e-6, luminancia([out[i * 3], out[i * 3 + 1], out[i * 3 + 2]]))
      // o peso pela curva do negativo: mais no pé (sombras), comprimido pela cópia nas altas
      const e = Math.log2(Yi / 0.18)
      // + a escolha criativa: mais grão nas sombras, entrando do cinza para baixo (até 2,5× a 4 stops abaixo)
      const peso = pesoDoGrao(tabela, e) * (1 + 1.5 * tt.sombraGrao * Math.min(1, Math.max(0, -e / 4)) ** 1.5)
      for (let c = 0; c < 3; c++) {
        const z = a * comum[i] + mistura * proprio[c][i]
        out[i * 3 + c] *= 2 ** (desvio * peso * z)
      }
    }
  }
  return out
}
