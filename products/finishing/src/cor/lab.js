// Revela Lab · a pessoa monta o próprio look: uma base (os looks da Revela, películas e clássicos, todos feitos aqui com
// o motor de src/cor/looks.js), a correção automática do frame e ajustes com nome de gente (Luz, Contraste, Cor,
// Temperatura…). Sai uma função `aplicar(r, g, b)` em código Rec.709, como os outros looks, para virar .cube, e uma
// receita (.revela, JSON) para reabrir e continuar depois.
//
// Ordem, como numa sala de cor: 1. correção do frame (exposição e branco), 2. Luz, Temperatura e Tint da pessoa,
// 3. o look da base, 4. Contraste, Cor, Calor e Desbotar por cima, 5. Pele protegida puxa a pele de volta para a cor
// de antes do look (o look muda o resto, a pele fica natural).
//
// Nada aqui imita uma película de marca nem copia LUT de terceiros: as películas são o motor da Revela com outra curva,
// outra densidade e outra separação, com nomes genéricos.

import { BASE_DE_LOOK, LOOKS, criarRevelaLook } from './looks.js'
import { codigoParaOklab, decodificar, linearParaOklab, oklabParaCodigo } from './oklab.js'

const limitar = (v, a, b) => Math.min(b, Math.max(a, v))
const suave = (a, b, x) => {
  const t = limitar((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const GRAU = Math.PI / 180
const distancia = (h, centro) => ((((h - centro) % 360) + 540) % 360) - 180

/** Películas: o motor da Revela com o jeito de cada tipo de filme (nomes genéricos, nada de marca). */
export const PELICULAS = [
  {
    ...BASE_DE_LOOK,
    id: 'negativo-250d',
    nome: 'Negativo 250D',
    frases: ['Negativo de dia: contraste baixo, altas que deitam.', 'Meio-tom quente, verde oliva.'],
    gama: 1.08,
    contraste: 4.2,
    preto: 0.06,
    branco: 0.95,
    densidade: 0.2,
    verde: { ...BASE_DE_LOOK.verde, gira: -20, croma: 0.78 },
    sombras: [-0.004, -0.008],
    meios: [0.002, 0.018],
    altas: [0.004, 0.014],
    saturacao: 0.9,
  },
  {
    ...BASE_DE_LOOK,
    id: 'negativo-500t',
    nome: 'Negativo 500T',
    frases: ['Negativo de noite: sombras frias, pele quente.', 'Densidade alta, preto aberto.'],
    gama: 1.04,
    contraste: 4.8,
    preto: 0.07,
    branco: 0.94,
    densidade: 0.28,
    azul: { ...BASE_DE_LOOK.azul, gira: -18, croma: 0.95 },
    sombras: [-0.02, -0.03],
    meios: [0.004, 0.014],
    altas: [0.012, 0.024],
    saturacao: 0.92,
  },
  {
    ...BASE_DE_LOOK,
    id: 'positivo-50d',
    nome: 'Positivo 50D',
    frases: ['Cópia de projeção: preto fundo, contraste alto.', 'Cor cheia e limpa.'],
    contraste: 7.4,
    preto: 0.02,
    branco: 0.975,
    densidade: 0.22,
    saturacao: 1.12,
    sombras: [-0.006, -0.01],
    altas: [0.004, 0.012],
  },
  {
    ...BASE_DE_LOOK,
    id: 'reversivel',
    nome: 'Reversível',
    frases: ['Slide: cor saturada, céu fundo.', 'Contraste alto, branco limpo.'],
    contraste: 7.8,
    preto: 0.015,
    branco: 0.98,
    densidade: 0.12,
    azul: { ...BASE_DE_LOOK.azul, gira: 6, croma: 1.18 },
    verde: { ...BASE_DE_LOOK.verde, gira: -6, croma: 1.05 },
    saturacao: 1.22,
    sombras: [0.002, -0.012],
    altas: [-0.002, 0.004],
  },
  {
    ...BASE_DE_LOOK,
    id: 'sem-branqueamento',
    nome: 'Sem branqueamento',
    frases: ['Prata que fica no filme: cor lavada, contraste duro.', 'Metálico, frio.'],
    contraste: 8.2,
    preto: 0.03,
    branco: 0.96,
    densidade: 0.05,
    saturacao: 0.48,
    sombras: [-0.004, -0.01],
    altas: [0.002, 0.004],
  },
]

/** Clássicos: looks conhecidos de quem edita, feitos com o mesmo motor. */
export const CLASSICOS = [
  {
    ...BASE_DE_LOOK,
    id: 'laranja-petroleo',
    nome: 'Laranja e petróleo',
    frases: ['O clássico do cinema de ação: pele laranja, sombra petróleo.'],
    contraste: 6.2,
    pele: { ...BASE_DE_LOOK.pele, junta: 0.55 },
    azul: { ...BASE_DE_LOOK.azul, gira: -22, croma: 1.05 },
    verde: { ...BASE_DE_LOOK.verde, gira: 34, croma: 0.7 },
    sombras: [-0.03, -0.045],
    meios: [0.006, 0.02],
    altas: [0.02, 0.05],
    saturacao: 1.06,
  },
  {
    ...BASE_DE_LOOK,
    id: 'anos-70',
    nome: 'Anos 70',
    frases: ['Desbotado e quente, preto leitoso.'],
    contraste: 3.4,
    preto: 0.13,
    branco: 0.92,
    densidade: 0.1,
    verde: { ...BASE_DE_LOOK.verde, gira: -28, croma: 0.7 },
    sombras: [0.01, 0.02],
    meios: [0.006, 0.028],
    altas: [0.012, 0.04],
    saturacao: 0.82,
  },
  {
    ...BASE_DE_LOOK,
    id: 'nordico',
    nome: 'Nórdico',
    frases: ['Frio e contido, branco limpo.'],
    contraste: 5,
    preto: 0.05,
    branco: 0.96,
    densidade: 0.08,
    saturacao: 0.62,
    sombras: [-0.012, -0.022],
    altas: [-0.004, -0.008],
  },
]

/** Todas as bases do Lab, em grupos (a grade mostra nessa ordem). */
export const GRUPOS = [
  { id: 'revela', nome: 'Revela', looks: LOOKS },
  { id: 'pelicula', nome: 'Película', looks: PELICULAS },
  { id: 'classicos', nome: 'Clássicos', looks: CLASSICOS },
]
const TODAS = GRUPOS.flatMap((g) => g.looks)
export const baseDoLab = (id) => TODAS.find((l) => l.id === id)

/** Ajustes do Lab: -100 a 100, 0 é neutro (Pele e Desbotar vão de 0 a 100). */
export const AJUSTES = [
  { id: 'luz', nome: 'Luz', min: -100, max: 100, dica: 'Exposição: ±1 stop' },
  { id: 'contraste', nome: 'Contraste', min: -100, max: 100, dica: 'Curva em S em volta do meio-tom' },
  { id: 'cor', nome: 'Cor', min: -100, max: 100, dica: 'Saturação' },
  { id: 'temperatura', nome: 'Temperatura', min: -100, max: 100, dica: 'Frio ↔ quente' },
  { id: 'tint', nome: 'Tint', min: -100, max: 100, dica: 'Verde ↔ magenta' },
  { id: 'calor', nome: 'Calor', min: 0, max: 100, dica: 'Cor quente e intensa no meio-tom' },
  { id: 'desbotar', nome: 'Desbotar', min: 0, max: 100, dica: 'Preto leitoso, como cópia antiga' },
  { id: 'pele', nome: 'Pele protegida', min: 0, max: 100, dica: 'Mantém a pele natural enquanto o look muda o resto' },
]
export const AJUSTES_NEUTROS = Object.fromEntries(AJUSTES.map((a) => [a.id, 0]))

// ─────────── analisar e corrigir ───────────

const L_CINZA = 0.5647 // Oklab L do cinza 18% (luz linear 0,18)

/**
 * Lê o frame (`pixels`: Float32Array RGB em código Rec.709, 0–1) e devolve a correção: exposição em stops para o
 * meio-tom ir na direção do cinza 18% e o desvio de branco (a, b em Oklab) dos tons quase neutros. Limites: ±1,2 stop, e o
 * branco só corrige o que parece dominante, não a cor da cena.
 */
export function analisarFrame(pixels, passo = 7) {
  const Ls = []
  let soma = [0, 0]
  let n = 0
  for (let i = 0; i < pixels.length; i += 3 * passo) {
    const [L, a, b] = codigoParaOklab(pixels[i], pixels[i + 1], pixels[i + 2])
    if (L > 0.03 && L < 0.98) Ls.push(L)
    // neutros do meio: pouca cor, nem preto nem branco (o branco estourado não diz nada)
    if (L > 0.3 && L < 0.92 && Math.hypot(a, b) < 0.045) {
      soma[0] += a
      soma[1] += b
      n++
    }
  }
  if (Ls.length < 20) return { exposicao: 0, branco: [0, 0], leitura: 'Pouca informação no frame.' }
  Ls.sort((x, y) => x - y)
  const mediana = Ls[Ls.length >> 1]
  // Oklab L ~ luz^(1/3): a razão de luz é (alvo/mediana)^3
  // 0,6 e no máximo 1,2 stop: corrige o frame sem apagar a intenção (contraluz e noite continuam escuros)
  const exposicao = limitar(Math.log2((L_CINZA / mediana) ** 3) * 0.6, -1.2, 1.2)
  const branco = n > 40 ? [limitar(-soma[0] / n, -0.03, 0.03), limitar(-soma[1] / n, -0.03, 0.03)] : [0, 0]
  return { exposicao, branco, leitura: descreverCorrecao(exposicao, branco) }
}

export function descreverCorrecao(exposicao, [da, db]) {
  const partes = []
  if (Math.abs(exposicao) >= 0.1)
    partes.push(`${exposicao > 0 ? '+' : '−'}${Math.abs(exposicao).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${Math.abs(exposicao) >= 1.5 ? 'stops' : 'stop'}`)
  if (Math.abs(db) >= 0.004) partes.push(db > 0 ? 'branco mais quente' : 'branco mais frio')
  if (Math.abs(da) >= 0.004) partes.push(da > 0 ? 'menos verde' : 'menos magenta')
  return partes.length ? partes.join(' · ') : 'Frame já equilibrado.'
}

// ─────────── o look do Lab ───────────

/**
 * Receita → look. `receita`: { base, intensidade (0–1), correcao: { exposicao, branco } | null, ajustes }.
 * `baseExterna` (opcional): um look já pronto no lugar da base (Meus looks), com `aplicar(r, g, b, t)`.
 */
export function criarLab(receita = {}, baseExterna = null) {
  const aj = { ...AJUSTES_NEUTROS, ...(receita.ajustes ?? {}) }
  const intensidade = limitar(receita.intensidade ?? 1, 0, 1)
  const cor = receita.correcao ?? { exposicao: 0, branco: [0, 0] }
  const look = baseExterna ?? (baseDoLab(receita.base) ? criarRevelaLook({ look: receita.base }) : null)
  const p = baseDoLab(receita.base)
  const lookDoLab = !baseExterna && p && !LOOKS.includes(p) ? criarLookDeParametros(p) : null

  const ganho = 2 ** ((cor.exposicao ?? 0) + aj.luz / 100)
  const [wa, wb] = cor.branco ?? [0, 0]
  const temp = (aj.temperatura / 100) * 0.035
  const tint = (aj.tint / 100) * 0.03
  const kContraste = aj.contraste / 100
  const kCor = 1 + aj.cor / 100
  const kCalor = aj.calor / 100
  const kDesbotar = aj.desbotar / 100
  const kPele = aj.pele / 100

  function aplicar(r, g, b) {
    // 1–2. correção e ajustes de luz e branco, em luz linear e Oklab (antes do look, como na sala de cor)
    let [L, a, bb] = linearParaOklab(decodificar(r) * ganho, decodificar(g) * ganho, decodificar(b) * ganho)
    const peso = suave(0.05, 0.35, L) // temperatura e tint quase não mexem no preto
    a += wa + tint * peso
    bb += wb + temp * peso
    const antes = [L, a, bb]
    // 3. o look da base
    let o
    if (lookDoLab) o = lookDoLab(L, a, bb, intensidade)
    else if (look?.emOklab) o = look.emOklab(L, a, bb, intensidade)
    else if (look) o = codigoParaOklab(...look.aplicar(...oklabParaCodigo(L, a, bb), intensidade))
    else o = [L, a, bb]
    ;[L, a, bb] = o
    // 4. por cima: contraste (S em volta do meio), cor, calor, desbotar
    if (kContraste) {
      const s = 0.5 + 0.5 * Math.tanh((L - 0.5) * 3.2) / Math.tanh(1.6)
      L += (s - L) * kContraste * (kContraste > 0 ? 0.9 : 0.6)
    }
    let C = Math.hypot(a, bb)
    let h = Math.atan2(bb, a) / GRAU
    C *= Math.max(0, kCor)
    if (kCalor) {
      const meio = suave(0.15, 0.5, L) * (1 - suave(0.85, 1, L))
      h += kCalor * 8 * meio * Math.sign(distancia(60, h)) * Math.min(1, Math.abs(distancia(60, h)) / 30)
      C *= 1 + 0.25 * kCalor * meio
      L -= 0.03 * kCalor * C
      bb = C * Math.sin(h * GRAU) + 0.02 * kCalor * meio
      a = C * Math.cos(h * GRAU) + 0.008 * kCalor * meio
    } else {
      a = C * Math.cos(h * GRAU)
      bb = C * Math.sin(h * GRAU)
    }
    if (kDesbotar) {
      L = 0.11 * kDesbotar + L * (1 - 0.11 * kDesbotar)
      const sombra = 1 - suave(0.1, 0.45, L)
      a *= 1 - 0.35 * kDesbotar * sombra
      bb *= 1 - 0.35 * kDesbotar * sombra
    }
    // 5. pele protegida: a cor da pele volta para a de antes do look (a luz do look fica)
    if (kPele) {
      const Ca = Math.hypot(antes[1], antes[2])
      if (Ca > 0.02) {
        const ha = Math.atan2(antes[2], antes[1]) / GRAU
        const w = kPele * Math.max(0, 1 - Math.abs(distancia(ha, 55)) / 30) * suave(0.25, 0.45, antes[0])
        a += (antes[1] - a) * w
        bb += (antes[2] - bb) * w
      }
    }
    return oklabParaCodigo(L, a, bb)
  }

  return { aplicar, receita: { ...receita, ajustes: aj, intensidade }, nome: receita.nome || p?.nome || 'Meu look' }
}

/** Película e clássicos usam os mesmos parâmetros dos looks da Revela, num motor próprio (sem mexer na lista LOOKS). */
function criarLookDeParametros(p) {
  return criarRevelaLook({ parametros: p }).emOklab
}

// ─────────── receita (.revela) ───────────

export const VERSAO_RECEITA = 1

/** Receita → texto do arquivo .revela (JSON, legível, para reabrir no Lab). */
export function escreverReceita(receita) {
  const r = {
    revela: 'lab',
    versao: VERSAO_RECEITA,
    nome: String(receita.nome ?? 'Meu look').slice(0, 40),
    base: receita.base,
    intensidade: receita.intensidade ?? 1,
    correcao: receita.correcao ?? null,
    ajustes: { ...AJUSTES_NEUTROS, ...(receita.ajustes ?? {}) },
  }
  return JSON.stringify(r, null, 2) + '\n'
}

/** Texto .revela → receita. Recusa o que não for receita do Lab; valores fora do lugar voltam para o limite. */
export function lerReceita(texto) {
  let r
  try {
    r = JSON.parse(texto)
  } catch {
    throw new Error('Não é uma receita da Revela.')
  }
  if (r?.revela !== 'lab' || typeof r.versao !== 'number') throw new Error('Não é uma receita da Revela.')
  if (r.versao > VERSAO_RECEITA) throw new Error('Receita de uma versão mais nova da Revela.')
  const ajustes = {}
  for (const a of AJUSTES) ajustes[a.id] = limitar(Number(r.ajustes?.[a.id]) || 0, a.min, a.max)
  const c = r.correcao
  return {
    nome: typeof r.nome === 'string' ? r.nome.slice(0, 40) : 'Meu look',
    base: baseDoLab(r.base) ? r.base : 'revela',
    intensidade: limitar(Number(r.intensidade ?? 1), 0, 1),
    correcao:
      c && typeof c === 'object'
        ? { exposicao: limitar(Number(c.exposicao) || 0, -2, 2), branco: [0, 1].map((i) => limitar(Number(c.branco?.[i]) || 0, -0.03, 0.03)) }
        : null,
    ajustes,
  }
}
