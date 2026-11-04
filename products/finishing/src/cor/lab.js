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
import { GRUPOS, NEUTRO, criarMotor, dwgParaCones, dwgParaOklab, perfilDe } from './pelicula.js'
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
]
export const AJUSTES_NEUTROS = Object.fromEntries(AJUSTES.map((a) => [a.id, 0]))

// ─────────── analisar e corrigir (na luz da cena) ───────────

/**
 * Lê o frame (`pixels`: Float32Array RGB no código da entrada, 0–1) e devolve a correção: exposição em stops para o
 * meio-tom ir na direção do cinza 18% e ganhos de branco (nos cones, como a câmera faria) a partir dos tons quase
 * neutros. Clareia 60% (até 1,5 stop) e escurece só 35% (até 0,6): frame claro de propósito continua claro. Ao
 * clarear, as altas do frame (percentil 90) não passam de 0,75 stop acima do cinza.
 */
export function analisarFrame(pixels, { entrada = 'still', passo = 7 } = {}) {
  const cena = paraCena(entrada)
  const Ys = []
  const soma = [0, 0, 0]
  let n = 0
  for (let i = 0; i < pixels.length; i += 3 * passo) {
    const x = cena(pixels[i], pixels[i + 1], pixels[i + 2])
    const Y = luminancia(x)
    if (Y > 0.18 * 2 ** -6 && Y < 0.18 * 2 ** 4) Ys.push(Y)
    const [L, a, b] = dwgParaOklab(x)
    const Lr = L / Math.cbrt(0.18)
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
  let exposicao = desvio >= 0 ? Math.min(1.5, desvio * 0.6) : Math.max(-0.6, desvio * 0.35)
  // cena escura de propósito (low key): se as altas do frame (percentil 90, o assunto iluminado) já estão no cinza ou
  // acima, clarear não as leva além de 0,75 stop sobre o cinza. Interior com o assunto bem exposto continua interior
  if (exposicao > 0) {
    const alto = Ys[Math.min(Ys.length - 1, Math.floor(Ys.length * 0.9))]
    exposicao = Math.min(exposicao, Math.max(0, Math.log2((0.18 * 2 ** 0.75) / alto)))
  }
  let ganhos = null
  if (n > 40) {
    const media = (soma[0] + soma[1] + soma[2]) / 3
    ganhos = soma.map((v) => limitar((media / v) ** 0.6, 0.85, 1.15))
  }
  return { exposicao, ganhos, leitura: descreverCorrecao(exposicao, ganhos) }
}

export function descreverCorrecao(exposicao, ganhos) {
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
  return partes.length ? partes.join(' · ') : 'Frame já equilibrado.'
}

// ─────────── o look do Lab ───────────

/** O Boost da REVELAFILM vem ligado (titular, 04/11/2026); 0 deixa a película como a ficha manda. */
export const BOOST_PADRAO = 50

/**
 * Receita → look. `receita`: { entrada ('still' ou id de câmera), base, copia ('' = a da base, 'nenhuma' ou id),
 * negativo ('' = o da base, 'digital' ou id), luzCopia ('' ou D55/D60/D65), expandido e revelacao (null = os da base),
 * boost (0–100, o Boost da REVELAFILM por cima da película; ligado em BOOST_PADRAO quando não vem),
 * intensidade (0–1), correcao: { exposicao, ganhos } | null, ajustes }. Devolve o motor (luz da cena → luz da cena), `emDi` (código
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
  for (const a of AJUSTES) ajustes[a.id] = limitar(Number(r.ajustes?.[a.id]) || 0, a.min, a.max)
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
    correcao: c && typeof c === 'object' ? { exposicao: limitar(Number(c.exposicao) || 0, -2, 2), ganhos } : null,
    ajustes,
    ...(legado ? { legado } : {}),
  }
}
