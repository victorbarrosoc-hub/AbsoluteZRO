// Revela Lab · a pessoa monta o próprio look sobre o motor profissional (src/cor/pelicula.js): uma base (os looks da
// Revela, películas e clássicos), a correção automática do frame e ajustes com nome de gente (Luz, Contraste, Cor,
// Temperatura…). O look vive na luz da cena (DaVinci Wide Gamut / Intermediate) e a tela é outra etapa
// (src/cor/cena.js): por isso o mesmo look sai como LMT log → log para o Resolve e o ACES, como LUT de câmera para o
// monitor do set e como LUT Rec.709 para quem edita direto no Premiere ou no CapCut.
//
// O frame pode ser um still já tratado (Rec.709: a tela faz o caminho de volta até a cena) ou um still em log de
// câmera (S-Log3, LogC4, V-Log…: a curva e o gamut da câmera levam até a cena, como um IDT).
//
// Os negativos e looks da Revela têm nomes genéricos e não imitam película de marca. As cópias de cinema (2383, 2393,
// 3513) saem das curvas publicadas nas fichas técnicas dos fabricantes (src/cor/copia.js); nada copia LUT de terceiros.

import { ENTRADAS } from './espacos.js'
import { criarTela, luminancia, paraTrabalho } from './cena.js'
import { GRUPOS, NEUTRO, VETORES_HSL, ZONAS_HDR, centrosDasZonas, criarMotor, dwgParaCones, dwgParaOklab, perfilDe } from './pelicula.js'

export { VETORES_HSL, ZONAS_HDR, centrosDasZonas }
import { COPIAS } from './copia.js'
import { NEGATIVOS } from './negativos.js'
import { lerTextura } from './textura.js'

export { GRUPOS }

/** Cópia de cinema do look: '' = a da base, 'nenhuma' ou o id de uma cópia (src/cor/copia.js). */
export const COPIAS_LAB = [{ id: '', nome: 'Cópia da base' }, { id: 'nenhuma', nome: 'Sem cópia' }, ...COPIAS.map((c) => ({ id: c.id, nome: c.nome }))]
/** Negativo do look: '' = o da base, 'digital' (a câmera, com o negativo ideal) ou um negativo das fichas. */
export const NEGATIVOS_LAB = [
  { id: '', nome: 'Negativo da base' },
  { id: 'digital', nome: 'Digital (sem negativo)' },
  ...NEGATIVOS.map((n) => ({ id: n.id, nome: `${n.nome} · ${n.numero}`, fabricante: n.fabricante })),
]
/** Luz do projetor da cópia: muda o branco (D65 neutro; D60 e D55 mais quentes). '' = a da base. */
export const LUZES_LAB = [
  { id: '', nome: 'Luz da base' },
  { id: 'D65', nome: 'D65 · neutra' },
  { id: 'D60', nome: 'D60 · morna' },
  { id: 'D55', nome: 'D55 · quente' },
]
/** Revelação do negativo, em stops (forçar sobe o contraste e o grão). */
export const REVELACOES = [-1, 0, 1, 2]
export const baseDoLab = perfilDe

const limitar = (v, a, b) => Math.min(b, Math.max(a, v))

/** De onde vem o frame: um still já tratado (Rec.709) ou o log de uma câmera (as mesmas do CST). */
export const ENTRADAS_LAB = [{ id: 'still', nome: 'Still já tratado (Rec.709)' }, ...ENTRADAS]
const telaSdr = criarTela('rec709')

/** Código do frame → luz da cena em DWG, conforme a entrada. */
export function paraCena(entrada = 'still') {
  if (entrada === 'still') return (r, g, b) => telaSdr.inverter(r, g, b)
  const e = ENTRADAS.find((x) => x.id === entrada)
  if (!e) throw new Error(`Entrada desconhecida: ${entrada}`)
  return paraTrabalho(e)
}

/** Ajustes do Lab: -100 a 100, 0 é neutro (Calor, Desbotar e Pele vão de 0 a 100). */
export const AJUSTES = [
  { id: 'luz', nome: 'Luz', min: -100, max: 100, dica: 'Exposição na cena: ±2 stops' },
  { id: 'contraste', nome: 'Contraste', min: -100, max: 100, dica: 'Contraste em log, em volta do cinza 18%' },
  { id: 'cor', nome: 'Cor', min: -100, max: 100, dica: 'Saturação (no -100 vira preto e branco)' },
  { id: 'temperatura', nome: 'Temperatura', min: -100, max: 100, dica: 'Frio ↔ quente, por adaptação cromática' },
  { id: 'tint', nome: 'Tint', min: -100, max: 100, dica: 'Verde ↔ magenta' },
  // ajuste fino (recolhido na tela)
  { id: 'altas', nome: 'Altas', min: -100, max: 100, fino: true, dica: 'Abaixo de 0 segura o que é claro; acima abre' },
  { id: 'sombras', nome: 'Sombras', min: -100, max: 100, fino: true, dica: 'Acima de 0 abre a sombra; abaixo fecha' },
  { id: 'preto', nome: 'Preto', min: -100, max: 100, fino: true, dica: 'Só a sombra profunda: abaixo de 0 afunda, acima levanta' },
  { id: 'calor', nome: 'Calor', min: 0, max: 100, fino: true, dica: 'Meio-tom e pele mais quentes e ricos, sem amarelar o branco' },
  { id: 'separacao', nome: 'Separação', min: -100, max: 100, fino: true, dica: 'Sombra fria e alta quente da cópia: -100 tira, +100 dobra' },
  { id: 'era', nome: 'Era da cópia', min: -100, max: 100, fino: true, dica: 'Retrô (cinza quente, cor contida) ↔ moderno (cinza petróleo, verde teal, mais cor)' },
  { id: 'densidade', nome: 'Densidade da cor', min: -100, max: 100, fino: true, dica: 'Corante: abaixo de 0 a cor sai e clareia; acima, cor cheia e mais escura' },
  { id: 'pretoNeutro', nome: 'Preto neutro', min: -100, max: 100, fino: true, dica: 'Só o preto: acima de 0 tira a cor da sombra profunda' },
  { id: 'branqueamento', nome: 'Sem branqueamento', min: 0, max: 100, fino: true, dica: 'Bleach bypass: a prata fica, mais contraste e menos cor' },
  { id: 'peleMatiz', nome: 'Matiz da pele', min: -100, max: 100, fino: true, dica: 'Só a pele: vermelho ↔ amarelo' },
  { id: 'peleSat', nome: 'Saturação da pele', min: -100, max: 100, fino: true, dica: 'Só a pele: menos ↔ mais cor' },
  { id: 'pele', nome: 'Pele protegida', min: 0, max: 100, fino: true, dica: 'Mantém a pele natural enquanto o look muda o resto' },
  { id: 'desbotar', nome: 'Desbotar', min: 0, max: 100, fino: true, dica: 'Véu no preto, como cópia antiga' },
  // saturação subtrativa (Cor de película): a cor forte ganha croma e perde luz juntos, como o corante
  { id: 'subtrativa', nome: 'Saturação subtrativa', min: 0, max: 100, grupo: 'pelicula', dica: 'Cor forte mais cheia e mais escura, nunca neon. A luz prática e a pele ficam fora' },
  // densidade de película (como o Film Density do Paul Dore): força 0 a 2, pesos por canal 0 a 2, limitadores 0 a 1
  { id: 'densidadeFilme', nome: 'Densidade', min: 0, max: 200, escala: 100, grupo: 'pelicula', dica: 'Cor saturada mais densa (mais escura) com a mesma saturação, como o corante da película' },
  { id: 'pesoVermelho', nome: 'Vermelho', min: -100, max: 100, peso: true, grupo: 'pelicula', dica: 'Peso do vermelho na densidade: acima de 1, o vermelho fica mais denso' },
  { id: 'pesoVerde', nome: 'Verde', min: -100, max: 100, peso: true, grupo: 'pelicula', dica: 'Peso do verde na densidade' },
  { id: 'pesoAzul', nome: 'Azul', min: -100, max: 100, peso: true, grupo: 'pelicula', dica: 'Peso do azul na densidade' },
  { id: 'poupaFraca', nome: 'Poupa cor fraca', min: 0, max: 100, escala: 100, padrao: 20, grupo: 'pelicula', dica: 'A densidade não age na cor fraca (abaixo desta saturação)' },
  { id: 'poupaPreto', nome: 'Poupa o preto', min: 0, max: 100, escala: 100, padrao: 15, grupo: 'pelicula', dica: 'A densidade não age na sombra profunda' },
  { id: 'protegePele', nome: 'Protege a pele', min: 0, max: 100, padrao: 80, grupo: 'pelicula', dica: 'A pele fica fora da densidade' },
  // exposição HDR por zonas (como as rodas HDR do Resolve): ±100 = ±1,5 stop na zona, na luz da cena; as zonas se
  // posicionam na faixa do arquivo (centrosDasZonas)
  ...ZONAS_HDR.map((z) => ({
    id: `hdr${z.nome}`,
    nome: z.nome,
    min: -100,
    max: 100,
    grupo: 'hdr',
    dica: `Exposição só na zona ${z.nome.toLowerCase()} (±1,5 stop), na luz da cena`,
  })),
  // HSL de seis vetores: matiz em graus (±30), saturação e luz (±100)
  ...VETORES_HSL.flatMap((v) => [
    { id: `hsl${v.nome}Matiz`, nome: 'Matiz', min: -30, max: 30, grupo: 'hsl', vetor: v.id, canal: 0, dica: `${v.nome}: gira o matiz (graus)` },
    { id: `hsl${v.nome}Sat`, nome: 'Saturação', min: -100, max: 100, grupo: 'hsl', vetor: v.id, canal: 1, dica: `${v.nome}: menos ↔ mais cor` },
    { id: `hsl${v.nome}Luz`, nome: 'Luz', min: -100, max: 100, grupo: 'hsl', vetor: v.id, canal: 2, dica: `${v.nome}: mais escuro ↔ mais claro` },
  ]),
]
/** Ajustes no ponto de partida: 0 é neutro; os limitadores da densidade já nascem no padrão (só agem com ela ligada). */
export const AJUSTES_NEUTROS = Object.fromEntries(AJUSTES.map((a) => [a.id, a.padrao ?? 0]))
/** O valor que a tela mostra: a escala do ajuste (densidade 0–2, limitadores 0–1), o peso (0–2) ou o número. */
export function valorVisivel(a, v) {
  if (a.peso) return (1 + v / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (a.escala) return (v / a.escala).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (a.grupo === 'hsl' && a.canal === 0) return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}°`
  if (a.min >= 0) return String(v)
  return v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0'
}

// ─────────── analisar e corrigir (na luz da cena) ───────────

// Calibrado em 04/11/2026 com 19 takes reais (RED, ARRI, Sony, Canon, Blackmagic, Panasonic) e o grade do colorista
// de cada um: a correção chega mais perto da exposição que o colorista escolheu (erro médio 1,09 → 0,85 stop) e quase
// não mexe num frame que já saiu graduado (0,23 → 0,10 stop). O que pesou: cena escura de propósito (palco, arena,
// interior) não pode subir, e cena clara de propósito escurece menos.
const CLAREIA = 0.6 // fração do desvio do meio-tom até o cinza, ao clarear
const CLAREIA_MAX = 1.5 // stops
const ESCURECE = 0.25 // fração ao escurecer (era 0,35: escurecia o retrato claro e o estúdio)
const ESCURECE_MAX = 0.6 // stops
const TETO_ALTAS = 0.75 // ao clarear, as altas não passam disto acima do cinza (stops)
const PCT_ALTAS = 0.95 // as altas: percentil 95 (era 90: a luz prática e o rosto iluminado ficavam de fora)
// Níveis (04/11/2026, calibrados nos scopes dos mesmos 19 coloristas): o colorista assenta o preto (piso do waveform
// 3–6%), abre o branco e sobe a cor; a revelação fiel à cena deixava o preto em 12% e a cor 45% abaixo. Depois da
// exposição, a sombra profunda (p1) vai para PRETO_ALVO stops abaixo do cinza e a alta (p99) para BRANCO_ALVO acima,
// com um contraste para cada lado (em log, em volta do cinza); a cor sobe até COR_ALVO só quando o frame está lavado.
// Erro contra os coloristas (piso, meio, teto, saturação e cor por zona): 27,2 → 20,7.
const PRETO_ALVO = -4.8 // stops abaixo do cinza para o p1
const CONTRASTE_SOMBRA_MAX = 1.4
// força com que o preto assenta (05/11/2026): 60% do caminho até o alvo — o preto do cinema é denso mas tem ar
// (interior: p25 do waveform 12% → 13% contra 14% nos filmes); com 100% ficava forte demais
const PRETO_FORCA = 0.6
const BRANCO_ALVO = 3.5 // stops acima do cinza para o p99
const CONTRASTE_ALTA = [1, 1.4] // nunca achata o branco; abre até 1,4
const COR_ALVO = 0.09 // croma Oklab ÷ L no meio-tom
// cor automática desligada (04/11/2026): contra os filmes de referência, subir a cor do frame afastava do cinema (a
// cópia já dá a densidade de cor); fica a regra, para um look de comercial que queira ligar
const COR_MAX = 1
// cena escura de propósito (meio-tom abaixo disto, em stops, já com a exposição): como nos interiores e noites dos
// filmes de referência, menos contraste nas duas pontas — a sombra respira (o preto assenta no máximo 1,1) e as luzes
// práticas descem (as altas comprimem 0,9). Interior: p95 do waveform 83% → 70% (cinema 66%)
const ESCURA = -0.3
const ESCURA_SOMBRA_MAX = 1.1
const ESCURA_ALTA = 0.9
const SOMBRA_FRIA = 2 // o azul-petróleo que os coloristas põem na sombra (src/cor/pelicula.js)

// branco de referência nos cones: o cinza neutro em DWG não tem os três cones iguais (Bradford: 0,94 · 1,04 · 1,09),
// e comparar com a média dos cones esquentava e tirava verde de todo frame já neutro
const BRANCO_CONES = (() => {
  const c = dwgParaCones([1, 1, 1])
  const Y = luminancia([1, 1, 1])
  return c.map((v) => v / Y)
})()

/**
 * Lê o frame (`pixels`: Float32Array RGB no código da entrada, 0–1) e devolve a correção: exposição em stops para o
 * meio-tom ir na direção do cinza 18% e ganhos de branco (nos cones, como a câmera faria) que levam os tons quase
 * neutros ao branco D65. Clareia 60% (até 1,5 stop) e escurece só 25% (até 0,6): frame claro de propósito continua
 * claro. Ao clarear, as altas do frame (percentil 95) não passam de 0,75 stop acima do cinza.
 */
export function analisarFrame(pixels, { entrada = 'still', passo = 7 } = {}) {
  const cena = paraCena(entrada)
  const Ys = []
  const todos = [] // para os níveis: a sombra profunda e a alta estourada também contam
  const soma = [0, 0, 0]
  let n = 0
  let croma = 0
  let nCroma = 0
  for (let i = 0; i < pixels.length; i += 3 * passo) {
    const x = cena(pixels[i], pixels[i + 1], pixels[i + 2])
    const Y = luminancia(x)
    if (Y > 0.18 * 2 ** -6 && Y < 0.18 * 2 ** 4) Ys.push(Y)
    if (Y > 1e-5) todos.push(Y)
    const [L, a, b] = dwgParaOklab(x)
    const Lr = L / Math.cbrt(0.18)
    if (Lr > 0.4 && Lr < 1.8) {
      croma += Math.hypot(a, b) / L
      nCroma++
    }
    // neutros do meio: pouca cor, nem preto nem branco estourado
    if (Lr > 0.55 && Lr < 1.7 && Math.hypot(a, b) < 0.04 * Lr) {
      const c = dwgParaCones(x)
      soma[0] += c[0] / Y
      soma[1] += c[1] / Y
      soma[2] += c[2] / Y
      n++
    }
  }
  if (Ys.length < 20) return { exposicao: 0, ganhos: null, leitura: 'Pouca informação no frame.' }
  Ys.sort((x, y) => x - y)
  const mediana = Ys[Ys.length >> 1]
  // assimétrica, como um colorista: clareia o que ficou escuro (60%, até +1,5), mas escurece pouco o que é claro de
  // propósito (35%, até -0,6): vestido de noiva e cena clara não viram cinza médio
  const desvio = Math.log2(0.18 / mediana)
  let exposicao = desvio >= 0 ? Math.min(CLAREIA_MAX, desvio * CLAREIA) : Math.max(-ESCURECE_MAX, desvio * ESCURECE)
  // cena escura de propósito (low key): se as altas do frame (o assunto iluminado, a luz prática) já estão no cinza ou
  // acima, clarear não as leva além de TETO_ALTAS sobre o cinza. Palco, arena e interior continuam escuros
  if (exposicao > 0) {
    const alto = Ys[Math.min(Ys.length - 1, Math.floor(Ys.length * PCT_ALTAS))]
    exposicao = Math.min(exposicao, Math.max(0, Math.log2((0.18 * 2 ** TETO_ALTAS) / alto)))
  }
  let ganhos = null
  if (n > 40) {
    // quanto cada cone precisa andar para o neutro medido virar o branco D65; normalizado para não mexer na luz
    const k = soma.map((v, i) => BRANCO_CONES[i] / (v / n))
    const media = (k[0] + k[1] + k[2]) / 3
    ganhos = k.map((v) => limitar((v / media) ** 0.6, 0.85, 1.15))
  }
  // níveis, medidos já com a exposição corrigida
  todos.sort((x, y) => x - y)
  const stop = (p) => Math.log2((todos[Math.floor((todos.length - 1) * p)] * 2 ** exposicao) / 0.18)
  const e1 = stop(0.01)
  const e99 = stop(0.99)
  const escura = Math.log2((mediana * 2 ** exposicao) / 0.18) < ESCURA
  const contraste = [
    1 + PRETO_FORCA * (limitar(e1 < -0.5 ? PRETO_ALVO / e1 : 1, 1, escura ? ESCURA_SOMBRA_MAX : CONTRASTE_SOMBRA_MAX) - 1),
    escura ? ESCURA_ALTA : limitar(e99 > 0.5 ? BRANCO_ALVO / e99 : 1, CONTRASTE_ALTA[0], CONTRASTE_ALTA[1]),
  ]
  const saturacao = limitar((COR_ALVO / Math.max(1e-3, nCroma ? croma / nCroma : COR_ALVO)) ** 0.7, 1, COR_MAX)
  const c = { exposicao, ganhos, contraste, saturacao, sombraFria: SOMBRA_FRIA }
  // a faixa do arquivo (stops sobre o cinza, antes da exposição): onde a luz deste frame está, dentro do que a curva da
  // câmera consegue guardar. As zonas HDR se posicionam nela
  const camera = faixaDaEntrada(entrada)
  const bruto = (p) => Math.log2(todos[Math.floor((todos.length - 1) * p)] / 0.18)
  const faixa = todos.length > 20 ? [limitar(bruto(0.002), camera[0], -1.5), limitar(bruto(0.998), 1.5, camera[1])] : null
  return { ...c, leitura: descreverCorrecao(exposicao, ganhos, c), faixa, faixaCamera: camera }
}

/**
 * O que a curva da entrada guarda, em stops sobre o cinza 18%: o piso útil (primeiro código, em 10 bits, com luz acima
 * de 12 stops abaixo do cinza) e o teto (o código 1, a alta mais alta que a curva grava).
 */
export function faixaDaEntrada(entrada = 'still') {
  const cena = paraCena(entrada)
  const Y = (v) => luminancia(cena(v, v, v))
  const teto = Math.log2(Math.max(1e-9, Y(1)) / 0.18)
  let piso = -12
  for (let k = 0; k <= 1023; k++) {
    const y = Y(k / 1023)
    if (y > 0.18 * 2 ** -12) {
      piso = Math.log2(y / 0.18)
      break
    }
  }
  return [Math.max(-14, piso), teto]
}

export function descreverCorrecao(exposicao, ganhos, niveis = null) {
  const partes = []
  if (Math.abs(exposicao) >= 0.1)
    partes.push(`${exposicao > 0 ? '+' : '−'}${Math.abs(exposicao).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${Math.abs(exposicao) >= 1.5 ? 'stops' : 'stop'}`)
  if (ganhos) {
    const quente = ganhos[0] / ganhos[2] // cone longo (vermelho) × curto (azul)
    if (quente > 1.02) partes.push('branco mais quente')
    else if (quente < 0.98) partes.push('branco mais frio')
    const verde = ganhos[1] / Math.sqrt(ganhos[0] * ganhos[2])
    if (verde > 1.015) partes.push('menos magenta')
    else if (verde < 0.985) partes.push('menos verde')
  }
  if (niveis?.contraste) {
    if (niveis.contraste[0] > 1.05) partes.push('preto assentado')
    if (niveis.contraste[1] > 1.05) partes.push('branco aberto')
  }
  if (niveis?.saturacao > 1.05) partes.push('mais cor')
  return partes.length ? partes.join(' · ') : 'Frame já equilibrado.'
}

// ─────────── o look do Lab ───────────

/** O Boost da REVELAFILM vem ligado (titular, 04/11/2026); 0 deixa a película como a ficha manda. */
export const BOOST_PADRAO = 50

/**
 * Receita → look. `receita`: { entrada ('still' ou id de câmera), base, copia ('' = a da base, 'nenhuma' ou id),
 * negativo ('' = o da base, 'digital' ou id), luzCopia ('' ou D55/D60/D65), expandido e revelacao (null = os da base),
 * boost (0–100, o Boost da REVELAFILM por cima da película; ligado em BOOST_PADRAO quando não vem),
 * intensidade (0–1), correcao: { exposicao, ganhos, contraste: [sombra, alta], saturacao, sombraFria } | null, ajustes }. Devolve o motor (luz da cena → luz da cena), `emDi` (código
 * DaVinci Intermediate → DI, para a LUT log → log) e `aplicar(r, g, b)`: a prévia do código da entrada até a tela
 * Rec.709, o caminho inteiro.
 */
export function criarLab(receita = {}) {
  const aj = { ...AJUSTES_NEUTROS, ...(receita.ajustes ?? {}) }
  const intensidade = limitar(receita.intensidade ?? 1, 0, 1)
  const cor = receita.correcao ?? null
  // 'neutro': a revelação sem look (a referência do modo Simples age por cima dela)
  const perfil = receita.base === 'neutro' ? NEUTRO : (perfilDe(receita.base) ?? perfilDe('revela'))
  const motor = criarMotor(perfil, {
    exposicao: (cor?.exposicao ?? 0) + (aj.luz / 100) * 2,
    ganhosLms: cor?.ganhos ?? null,
    contrasteCena: cor?.contraste ?? 1,
    saturacaoCena: cor?.saturacao ?? 1,
    sombraFria: cor?.sombraFria ?? 0,
    temperatura: aj.temperatura / 100,
    tint: aj.tint / 100,
    contraste: 1 + (aj.contraste / 100) * 0.35,
    saturacao: Math.max(0, 1 + aj.cor / 100),
    calor: aj.calor / 100,
    veu: (aj.desbotar / 100) * 1.8,
    pele: aj.pele / 100,
    altas: aj.altas / 100,
    sombras: aj.sombras / 100,
    preto: aj.preto / 100,
    estilo: (receita.legado?.estilo ?? 0) / 100,
    separacao: aj.separacao / 100,
    era: aj.era / 100,
    pretoNeutro: aj.pretoNeutro / 100,
    acabamento: receita.legado ? 0 : 1,
    densidade: aj.densidade / 100,
    densidadeLegado: (receita.legado?.densidade ?? 0) / 100,
    branqueamento: aj.branqueamento / 100,
    peleMatiz: aj.peleMatiz / 100,
    peleSat: aj.peleSat / 100,
    zonas: ZONAS_HDR.map((z) => ((aj[`hdr${z.nome}`] ?? 0) / 100) * 1.5),
    // a faixa do arquivo foi medida antes da exposição; as zonas andam junto com a exposição aplicada
    faixaHdr: Array.isArray(receita.faixaHdr) ? receita.faixaHdr.map((v) => v + (cor?.exposicao ?? 0) + (aj.luz / 100) * 2) : null,
    // 100 no painel = 0,4 no motor (0,3 embutido no look já escurecia demais o verde e o preto, 05/11/2026)
    subtrativa: (aj.subtrativa / 100) * 0.4,
    densidadeFilme: aj.densidadeFilme
      ? {
          forca: aj.densidadeFilme / 100,
          pesos: [aj.pesoVermelho, aj.pesoVerde, aj.pesoAzul].map((v) => 1 + v / 100),
          poupaFraca: aj.poupaFraca / 100,
          poupaPreto: aj.poupaPreto / 100,
          protegePele: aj.protegePele / 100,
        }
      : null,
    hsl: VETORES_HSL.map((v) => [aj[`hsl${v.nome}Matiz`] ?? 0, (aj[`hsl${v.nome}Sat`] ?? 0) / 100, (aj[`hsl${v.nome}Luz`] ?? 0) / 100]),
    copia: receita.copia || undefined,
    negativo: receita.negativo || undefined,
    luzCopia: receita.luzCopia || undefined,
    expandido: receita.expandido ?? undefined,
    revelacao: receita.revelacao ?? undefined,
    boost: limitar(Number(receita.boost ?? BOOST_PADRAO), 0, 100),
    intensidade,
  })
  const entrada = receita.entrada ?? 'still'
  const cena = paraCena(entrada)
  return {
    motor,
    emCena: motor.emCena,
    emDi: motor.emDi,
    aplicar: (r, g, b) => telaSdr.aplicar(motor.emCena(cena(r, g, b))),
    receita: { ...receita, entrada, copia: receita.copia ?? '', negativo: receita.negativo ?? '', luzCopia: receita.luzCopia ?? '', boost: limitar(Number(receita.boost ?? BOOST_PADRAO), 0, 100), ajustes: aj, intensidade },
    nome: receita.nome || perfil.nome || 'Meu look',
    perfil,
  }
}

// ─────────── receita (.revela) ───────────

export const VERSAO_RECEITA = 6

/** Receita → texto do arquivo .revela (JSON, legível, para reabrir no Lab). */
export function escreverReceita(receita) {
  const r = {
    revela: 'lab',
    versao: VERSAO_RECEITA,
    motor: 'cena DWG/DI',
    nome: String(receita.nome ?? 'Meu look').slice(0, 40),
    entrada: receita.entrada ?? 'still',
    base: receita.base,
    copia: receita.copia ?? '',
    negativo: receita.negativo ?? '',
    luzCopia: receita.luzCopia ?? '',
    expandido: receita.expandido ?? null,
    revelacao: receita.revelacao ?? null,
    boost: limitar(Number(receita.boost ?? BOOST_PADRAO), 0, 100),
    textura: lerTextura(receita.textura),
    intensidade: receita.intensidade ?? 1,
    correcao: receita.correcao ?? null,
    faixaHdr: Array.isArray(receita.faixaHdr) ? receita.faixaHdr : null,
    ajustes: { ...AJUSTES_NEUTROS, ...(receita.ajustes ?? {}) },
    ...(receita.legado ? { legado: receita.legado } : {}),
  }
  return JSON.stringify(r, null, 2) + '\n'
}

/**
 * Texto .revela → receita. Recusa o que não for receita do Lab; valores fora do lugar voltam para o limite. A versão 1
 * (motor de tela) abre com a mesma base e os mesmos ajustes; a correção de branco antiga não vale no motor novo. A
 * versão 2 não tinha cópia e a 3 não tinha negativo, luz da cópia, Expandido nem revelação: abrem com os da base. Até a
 * 4 não havia Boost: abrem com ele em 0, para o look salvo continuar o mesmo. Até a 5 não havia o acabamento da cópia
 * (tom, polos, compressão de cor e separação): abrem sem ele (`legado`), com o Estilo e a Densidade antigos como
 * estavam (a Densidade nova age depois da cópia e vai para os dois lados).
 */
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
  // ajuste que a receita não traz (receita mais antiga que ele) abre no ponto de partida
  for (const a of AJUSTES) ajustes[a.id] = limitar(r.ajustes?.[a.id] == null ? (a.padrao ?? 0) : Number(r.ajustes[a.id]) || 0, a.min, a.max)
  const antiga = r.versao < 6 || r.legado
  const legado = antiga
    ? {
        estilo: limitar(Number(r.legado?.estilo ?? r.ajustes?.estilo) || 0, -100, 100),
        densidade: limitar(Number(r.legado?.densidade ?? (r.versao < 6 ? r.ajustes?.densidade : 0)) || 0, 0, 100),
      }
    : null
  if (r.versao < 6) ajustes.densidade = 0
  const c = r.correcao
  const ganhos = Array.isArray(c?.ganhos) && c.ganhos.length === 3 ? c.ganhos.map((v) => limitar(Number(v) || 1, 0.85, 1.15)) : null
  return {
    nome: typeof r.nome === 'string' ? r.nome.slice(0, 40) : 'Meu look',
    entrada: ENTRADAS_LAB.some((e) => e.id === r.entrada) ? r.entrada : 'still',
    base: perfilDe(r.base) || r.base === 'neutro' ? r.base : 'revela',
    copia: COPIAS_LAB.some((c) => c.id === r.copia) ? r.copia : '',
    negativo: NEGATIVOS_LAB.some((n) => n.id === r.negativo) ? r.negativo : '',
    luzCopia: LUZES_LAB.some((l) => l.id === r.luzCopia) ? r.luzCopia : '',
    expandido: typeof r.expandido === 'boolean' ? r.expandido : null,
    revelacao: REVELACOES.includes(r.revelacao) ? r.revelacao : null,
    boost: r.versao < 5 ? 0 : limitar(Number(r.boost ?? BOOST_PADRAO), 0, 100),
    textura: lerTextura(r.textura),
    intensidade: limitar(Number(r.intensidade ?? 1), 0, 1),
    correcao:
      c && typeof c === 'object'
        ? {
            exposicao: limitar(Number(c.exposicao) || 0, -2, 2),
            ganhos,
            // níveis (desde 04/11/2026): receita antiga não tem e abre como estava
            ...(Array.isArray(c.contraste) && c.contraste.length === 2
              ? { contraste: [limitar(Number(c.contraste[0]) || 1, 1, CONTRASTE_SOMBRA_MAX), limitar(Number(c.contraste[1]) || 1, ESCURA_ALTA, CONTRASTE_ALTA[1])] }
              : {}),
            ...(c.saturacao != null ? { saturacao: limitar(Number(c.saturacao) || 1, 1, Math.max(COR_MAX, 2.2)) } : {}),
            ...(c.sombraFria != null ? { sombraFria: limitar(Number(c.sombraFria) || 0, 0, 2) } : {}),
          }
        : null,
    faixaHdr:
      Array.isArray(r.faixaHdr) && r.faixaHdr.length === 2 && r.faixaHdr.every((v) => Number.isFinite(Number(v)))
        ? [limitar(Number(r.faixaHdr[0]), -16, 0), limitar(Number(r.faixaHdr[1]), 0, 14)]
        : null,
    ajustes,
    ...(legado ? { legado } : {}),
  }
}
