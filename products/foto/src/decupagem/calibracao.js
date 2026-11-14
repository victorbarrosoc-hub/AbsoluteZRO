// Magnitude · calibração em 30 segundos (docs/estudo/decupagem.md, melhoria 9: "qual nota é nítida o bastante" é o
// pedido literal do fórum da Adobe). Em vez de um controle de 0 a 100 às cegas, a pessoa responde de 6 a 8 perguntas
// sobre fotos do próprio ensaio que estão perto dos cortes, e as respostas movem os três limiares da nota
// (`limiares` de src/decupagem/nota.js), cada um com limite. Os pares "qual das duas?" passam por ajustarPesos().
// Puro: Node e navegador. Quem guarda (por pessoa e tipo de ensaio, neste aparelho) é a tela.
//
//   perguntas(fotos, { limiares, referencia, grupos, n }) → [pergunta]
//     { tipo: 'serve', dimensao: 'nitidez' | 'olhos' | 'exposicao', id, valor, corte }
//     { tipo: 'qual', ids: [a, b] }
//   ajustarLimiares(limiares, respostas, { referencia, pesos }) → { limiares, pesos, mudou, contraditorias, explicacao }
//     resposta 'serve': { tipo: 'serve', dimensao, valor, serve: true | false }
//     resposta 'qual':  { tipo: 'qual', preferida: magnitude, preterida: magnitude }
//
// A medida de cada dimensão e o sentido do corte:
//   nitidez    q do foco (focoDaFoto) contra corteDeFoco(): abaixo do corte, teto de "fora de foco". Maior é melhor.
//   olhos      o EAR da pior pessoa-chave contra earFechado + limiar: abaixo, olho fechado. Maior é melhor.
//   exposicao  excessoDeExposicao() (vezes a tolerância de fábrica) contra o limiar k: acima, desconta. Menor é melhor.
// Uma resposta é um lado do corte: "serve" diz que o corte deve deixar aquela medida passar, "não serve" que deve
// barrar. Juntas, viram um intervalo; o limiar novo é o meio dele (ou um passo além da resposta, quando só há um
// lado). Intervalo vazio (a pessoa aceitou uma pior e recusou uma melhor) é contradição: o limiar não mexe.

import { ajustarPesos, corteDeFoco, excessoDeExposicao, focoDaFoto, limiaresPadrao, normalizarLimiares, olhosComLimiar, PARAMETROS } from './nota.js'
import { LIMIARES_ROSTO } from './rostos.js'
import { CALIBRACAO } from './textos.js'

export const DIMENSOES = Object.freeze(['nitidez', 'olhos', 'exposicao'])

export const AJUSTE = Object.freeze({
  // até onde do corte uma foto ainda é pergunta (na unidade da medida; exposição em razão: de k / 2,5 a k × 2,5)
  janela: Object.freeze({ nitidez: 0.06, olhos: 0.06, exposicao: 2.5 }),
  // um passo além da resposta, quando só um lado respondeu
  passo: Object.freeze({ nitidez: 0.01, olhos: 0.01, exposicao: 1.15 }),
  // quantas perguntas: duas por dimensão (uma de cada lado do corte) e até dois pares
  porDimensao: 2,
  pares: 2,
  minimo: 6,
  maximo: 8,
})

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const limitar = (v, [min, max]) => (v < min ? min : v > max ? max : v)

/** As pessoas-chave lidas (a mesma régua da nota: as marcadas como chave, senão a principal). */
function chaves(rostos) {
  const lista = (Array.isArray(rostos) ? rostos : []).filter((r) => r && !r.duvidoso)
  const marcadas = lista.filter((r) => r.chave)
  return marcadas.length ? marcadas : lista.filter((r) => r.principal)
}

/** O EAR da pior pessoa-chave (riso não conta: olho espremido de riso não é dúvida), ou null. */
export function earDaFoto(foto) {
  const ears = chaves(foto?.rostos)
    .filter((r) => r.olhos !== 'sorrindo' && num(r.ear) != null)
    .map((r) => r.ear)
  return ears.length ? Math.min(...ears) : null
}

/** O corte atual de cada dimensão, na unidade da medida. */
export function cortes(limiares, referencia) {
  const l = normalizarLimiares(limiares)
  return { nitidez: corteDeFoco(referencia, l), olhos: LIMIARES_ROSTO.earFechado + l.olhos, exposicao: l.exposicao }
}

/** A medida da foto numa dimensão (ou null). */
export function medidaDe(foto, dimensao) {
  if (dimensao === 'nitidez') return focoDaFoto(foto).q
  if (dimensao === 'olhos') return earDaFoto(foto)
  return excessoDeExposicao(foto)
}

/** A foto está sem problema nas OUTRAS dimensões? (para a pergunta ser sobre uma coisa só) */
function limpaFora(foto, dimensao, corte, limiares) {
  const m = foto.medidas
  if (!m) return false
  if (m.borrao?.tipo === 'movimento') return false
  if (dimensao !== 'nitidez') {
    const q = focoDaFoto(foto).q
    if (q == null || q < corte.nitidez + 0.03) return false
  }
  if (dimensao !== 'olhos') {
    const fechados = chaves(foto.rostos).some((r) => ['fechados', 'parcial'].includes(olhosComLimiar(r, normalizarLimiares(limiares).olhos)))
    if (fechados) return false
  }
  if (dimensao !== 'exposicao') {
    const x = excessoDeExposicao(foto)
    if (x == null || x > corte.exposicao) return false
  }
  return true
}

/**
 * As perguntas do ensaio. `fotos` = as do catálogo (medidas, rostos, magnitude, latitude, tipo). Por dimensão, a foto
 * mais perto do corte de cada lado (a que passa e a que não passa), só entre as que não têm problema nas outras duas.
 * Pares: das cenas com escolha empatada, as duas de componentes mais diferentes. Com menos de 6 perguntas possíveis,
 * completa com mais uma de cada dimensão; ainda assim pode sair menos (ensaio pequeno), e a tela diz isso.
 */
export function perguntas(fotos, { limiares = limiaresPadrao(), referencia = null, grupos = null, n = AJUSTE.maximo } = {}) {
  const lista = (Array.isArray(fotos) ? fotos : []).filter((f) => f?.medidas)
  const corte = cortes(limiares, referencia)
  const janela = AJUSTE.janela
  const candidatas = {}
  for (const d of DIMENSOES) {
    const c = corte[d]
    const perto = []
    for (const f of lista) {
      const v = medidaDe(f, d)
      if (v == null) continue
      const dist = d === 'exposicao' ? Math.abs(Math.log(Math.max(v, 1e-3) / c)) : Math.abs(v - c)
      const dentro = d === 'exposicao' ? dist <= Math.log(janela.exposicao) : dist <= janela[d]
      if (!dentro || !limpaFora(f, d, corte, limiares)) continue
      // lado "passa": na nitidez e nos olhos, medida ≥ corte; na exposição, medida ≤ corte
      const passa = d === 'exposicao' ? v <= c : v >= c
      perto.push({ id: f.id, valor: v, dist, passa })
    }
    perto.sort((a, b) => a.dist - b.dist)
    candidatas[d] = perto
  }
  const usadas = new Set()
  const saida = []
  const tirar = (d, lado) => {
    const x = candidatas[d].find((c) => !usadas.has(c.id) && (lado == null || c.passa === lado))
    if (!x) return false
    usadas.add(x.id)
    saida.push({ tipo: 'serve', dimensao: d, id: x.id, valor: x.valor, corte: corte[d] })
    return true
  }
  for (const d of DIMENSOES) {
    tirar(d, true)
    tirar(d, false)
  }
  // pares das cenas empatadas: as duas que mais diferem no que pesa
  const porId = new Map(lista.map((f) => [f.id, f]))
  const pares = []
  for (const g of grupos ?? []) {
    const membros = (g.equivalentes?.length > 1 ? g.equivalentes : []).map((id) => porId.get(id)).filter((f) => f?.magnitude?.componentes)
    let melhor = null
    for (let a = 0; a < membros.length; a++) {
      for (let b = a + 1; b < membros.length; b++) {
        const ca = membros[a].magnitude.componentes
        const cb = membros[b].magnitude.componentes
        let dif = 0
        for (const k of ['foco', 'pessoas', 'exposicao', 'ruido']) if (num(ca[k]) != null && num(cb[k]) != null) dif += Math.abs(ca[k] - cb[k])
        if (!melhor || dif > melhor.dif) melhor = { ids: [membros[a].id, membros[b].id], dif }
      }
    }
    if (melhor && melhor.dif >= 10) pares.push(melhor)
  }
  pares.sort((a, b) => b.dif - a.dif)
  for (const p of pares) {
    if (saida.filter((x) => x.tipo === 'qual').length >= AJUSTE.pares) break
    if (p.ids.some((id) => usadas.has(id))) continue
    p.ids.forEach((id) => usadas.add(id))
    saida.push({ tipo: 'qual', ids: p.ids })
  }
  for (let volta = 0; saida.length < AJUSTE.minimo && volta < 3; volta++) {
    let tirou = false
    for (const d of DIMENSOES) if (saida.length < AJUSTE.minimo && tirar(d, null)) tirou = true
    if (!tirou) break
  }
  // as de "serve?" intercaladas por dimensão; os pares no fim
  const serve = saida.filter((x) => x.tipo === 'serve')
  const ordem = []
  for (let k = 0; serve.length; k = (k + 1) % DIMENSOES.length) {
    const i = serve.findIndex((x) => x.dimensao === DIMENSOES[k])
    if (i >= 0) ordem.push(...serve.splice(i, 1))
  }
  return [...ordem, ...saida.filter((x) => x.tipo === 'qual')].slice(0, n)
}

/**
 * O corte novo de uma dimensão pelas respostas, ou { contradicao } / null (nada a mudar).
 * `maiorMelhor`: nitidez e olhos (o corte barra o que fica abaixo); exposição ao contrário.
 */
function novoCorte(atual, respostas, { maiorMelhor, passo, razao }) {
  const servem = respostas.filter((r) => r.serve).map((r) => r.valor)
  const naoServem = respostas.filter((r) => !r.serve).map((r) => r.valor)
  if (!servem.length && !naoServem.length) return null
  // maior melhor: o corte fica em (maior das recusadas, menor das aceitas]; menor melhor: [maior das aceitas, menor das recusadas)
  const lo = maiorMelhor ? (naoServem.length ? Math.max(...naoServem) : null) : servem.length ? Math.max(...servem) : null
  const hi = maiorMelhor ? (servem.length ? Math.min(...servem) : null) : naoServem.length ? Math.min(...naoServem) : null
  if (lo != null && hi != null && lo >= hi) return { contradicao: true }
  const ok = maiorMelhor ? (lo == null || atual > lo) && (hi == null || atual <= hi) : (lo == null || atual >= lo) && (hi == null || atual < hi)
  if (ok) return null
  let novo
  if (lo != null && hi != null) novo = razao ? Math.sqrt(lo * hi) : (lo + hi) / 2
  else if (lo != null) novo = razao ? lo * passo : lo + passo
  else novo = razao ? hi / passo : hi - passo
  return { corte: novo }
}

/**
 * As respostas → os limiares novos. Cada dimensão só muda se as respostas dela concordam entre si e discordam do
 * corte de agora; o resultado respeita PARAMETROS.limiares. Os pares ajustam os pesos (ajustarPesos). Devolve
 * { limiares, pesos, mudou: [dimensão], contraditorias: [dimensão], explicacao: [frases] }.
 */
export function ajustarLimiares(limiares, respostas, { referencia = null, pesos = null } = {}) {
  const atual = normalizarLimiares(limiares)
  const novo = { ...atual }
  const corte = cortes(atual, referencia)
  const base = cortes(limiaresPadrao(), referencia)
  const lim = PARAMETROS.limiares
  const mudou = []
  const contraditorias = []
  const noLimite = []
  for (const d of DIMENSOES) {
    const minhas = (respostas ?? []).filter((r) => r?.tipo === 'serve' && r.dimensao === d && num(r.valor) != null && typeof r.serve === 'boolean')
    const r = novoCorte(corte[d], minhas, { maiorMelhor: d !== 'exposicao', passo: AJUSTE.passo[d], razao: d === 'exposicao' })
    if (!r) continue
    if (r.contradicao) {
      contraditorias.push(d)
      continue
    }
    const valor = d === 'exposicao' ? r.corte : r.corte - base[d]
    const preso = limitar(valor, lim[d])
    if (preso !== valor) noLimite.push(d)
    const arred = d === 'exposicao' ? Math.round(preso * 100) / 100 : Math.round(preso * 1000) / 1000
    if (arred !== atual[d]) {
      novo[d] = arred
      mudou.push(d)
    }
  }
  const trocas = (respostas ?? [])
    .filter((r) => r?.tipo === 'qual' && r.preferida?.componentes && r.preterida?.componentes)
    .map((r) => ({
      preferida: r.preferida.componentes,
      preterida: r.preterida.componentes,
      preferidaRosto: rostoDe(r.preferida),
      preteridaRosto: rostoDe(r.preterida),
    }))
  const aprendido = trocas.length ? ajustarPesos(pesos, trocas) : null
  const explicacao = []
  for (const d of DIMENSOES) {
    if (mudou.includes(d)) explicacao.push(CALIBRACAO.mudancas[d](novo[d]))
    if (contraditorias.includes(d)) explicacao.push(CALIBRACAO.contraditorio(d))
  }
  if (noLimite.length) explicacao.push(CALIBRACAO.limite)
  if (aprendido) for (const f of aprendido.explicacao) if (!explicacao.includes(f) && !/ainda não apontam/.test(f)) explicacao.push(f)
  if (!explicacao.length) explicacao.push(CALIBRACAO.igual)
  return { limiares: novo, pesos: aprendido?.pesos ?? pesos, mudou, contraditorias, explicacao }
}

const rostoDe = (m) => ({ olhos: m.detalhe?.olhos, nitidez: m.detalhe?.nitidezDoRosto, expressao: m.detalhe?.expressao })

/** Os limiares em palavras, em relação ao padrão (para a folha dizer o que está valendo). */
export function explicarLimiares(limiares) {
  const l = normalizarLimiares(limiares)
  const frases = []
  if (l.nitidez !== 0) frases.push(CALIBRACAO.mudancas.nitidez(l.nitidez))
  if (l.olhos !== 0) frases.push(CALIBRACAO.mudancas.olhos(l.olhos))
  if (l.exposicao !== 1) frases.push(CALIBRACAO.mudancas.exposicao(l.exposicao))
  return frases
}
