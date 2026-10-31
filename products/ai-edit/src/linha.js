// Linha do tempo magnética (como a trilha principal do Final Cut): clipes um depois do outro, sem buracos. Cada clipe
// aponta para um trecho da mídia de origem em quadros [ini, fim). Toda operação devolve uma linha nova (a antiga fica
// intacta), o que deixa o desfazer trivial: o Historico guarda as versões.

import { limparPontos, origemNoClipe, reancorar, saidaDoClipe, saidaNoClipe } from './velocidade.js'

let seq = 0
const novoId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`

/** Linha com um clipe por mídia, na ordem dada. midias: [{ id, quadros }] */
export function linhaInicial(midias) {
  return { clipes: midias.filter((m) => m.quadros > 0).map((m) => ({ id: novoId(), midia: m.id, ini: 0, fim: m.quadros })) }
}

/** Quadros que o clipe ocupa na linha (com velocidade, o tamanho de saída da curva; sem, o trecho de origem). */
export const tamanho = (c) => (c.velocidade ? saidaDoClipe(c) : c.fim - c.ini)

/** O mesmo clipe num trecho de origem novo: a curva de velocidade acompanha a mídia (src/velocidade.js › reancorar). */
function retrecho(c, ini, fim, extra = {}) {
  const novo = { ...c, ...extra, ini, fim }
  if (c.velocidade) {
    const pontos = reancorar(c.velocidade.pontos, c.ini, c.fim, ini, fim)
    if (pontos) novo.velocidade = { pontos }
    else delete novo.velocidade
  }
  return novo
}
export const duracao = (linha) => linha.clipes.reduce((s, c) => s + tamanho(c), 0)

/** Onde cada clipe começa na linha: [{ clipe, indice, inicio }]. */
export function posicoes(linha) {
  let t = 0
  return linha.clipes.map((clipe, indice) => {
    const p = { clipe, indice, inicio: t }
    t += tamanho(clipe)
    return p
  })
}

/** O que toca no quadro q da linha: { clipe, indice, inicio, fonte } ou null depois do fim. */
export function localizar(linha, q) {
  let t = 0
  for (let i = 0; i < linha.clipes.length; i++) {
    const c = linha.clipes[i]
    const n = tamanho(c)
    if (q < t + n) return { clipe: c, indice: i, inicio: t, fonte: c.velocidade ? Math.min(c.fim - 1, Math.floor(origemNoClipe(c, Math.max(0, q - t)))) : c.ini + Math.max(0, q - t) }
    t += n
  }
  return null
}

/** Quadro de origem → quadro na linha (null se aquele trecho foi cortado). Primeira ocorrência. */
export function fonteParaLinha(linha, midia, qFonte) {
  let t = 0
  for (const c of linha.clipes) {
    if (c.midia === midia && qFonte >= c.ini && qFonte < c.fim) return t + (c.velocidade ? Math.floor(saidaNoClipe(c, qFonte)) : qFonte - c.ini)
    t += tamanho(c)
  }
  return null
}

/** Divide o clipe que passa pelo quadro q. Em cima de um corte, não muda nada. */
export function dividir(linha, q) {
  const l = localizar(linha, q)
  if (!l || q === l.inicio) return linha
  const { clipe: c, indice: i, fonte } = l
  // em câmera lenta vários quadros da linha mostram o mesmo quadro de origem: dividir ali não deixaria nada de um lado
  if (fonte <= c.ini || fonte >= c.fim) return linha
  const a = retrecho(c, c.ini, fonte)
  const b = retrecho(c, fonte, c.fim, { id: novoId() })
  return { ...linha, clipes: [...linha.clipes.slice(0, i), a, b, ...linha.clipes.slice(i + 1)] }
}

/** Remove clipes e fecha o buraco. */
export function remover(linha, ids) {
  const fora = new Set(Array.isArray(ids) ? ids : [ids])
  return { ...linha, clipes: linha.clipes.filter((c) => !fora.has(c.id)) }
}

/** Leva o clipe para a posição `para` (índice na lista final). */
export function mover(linha, id, para) {
  const i = linha.clipes.findIndex((c) => c.id === id)
  if (i < 0) return linha
  const resto = linha.clipes.filter((c) => c.id !== id)
  const j = Math.max(0, Math.min(resto.length, Math.round(para)))
  if (j === i) return linha
  return { ...linha, clipes: [...resto.slice(0, j), linha.clipes[i], ...resto.slice(j)] }
}

/**
 * Apara a entrada ('ini') ou a saída ('fim') do clipe em `delta` quadros (positivo = para a direita), sem passar do
 * começo ou do fim da mídia (`limite` = quadros da mídia) e deixando pelo menos 1 quadro.
 */
export function aparar(linha, id, lado, delta, limite = Infinity) {
  const i = linha.clipes.findIndex((c) => c.id === id)
  if (i < 0 || !delta) return linha
  const c = linha.clipes[i]
  let ini = c.ini
  let fim = c.fim
  if (lado === 'ini') ini = Math.max(0, Math.min(c.fim - 1, c.ini + Math.round(delta)))
  else fim = Math.min(limite, Math.max(c.ini + 1, c.fim + Math.round(delta)))
  if (ini === c.ini && fim === c.fim) return linha
  const clipes = linha.clipes.slice()
  clipes[i] = retrecho(c, ini, fim)
  return { ...linha, clipes }
}

/**
 * Tira da linha os trechos da mídia de origem (quadros [ini, fim)), dividindo os clipes que passam por eles. É assim
 * que os cortes aprovados (silêncio, respiro) entram na edição.
 */
export function removerTrechos(linha, midia, trechos) {
  const ts = trechos
    .filter((t) => t.fim > t.ini)
    .map((t) => ({ ini: Math.round(t.ini), fim: Math.round(t.fim) }))
    .sort((a, b) => a.ini - b.ini)
  if (!ts.length) return linha
  const clipes = []
  for (const c of linha.clipes) {
    if (c.midia !== midia) {
      clipes.push(c)
      continue
    }
    let pedacos = [{ ini: c.ini, fim: c.fim }]
    for (const t of ts) {
      if (t.fim <= c.ini || t.ini >= c.fim) continue
      const prox = []
      for (const p of pedacos) {
        if (t.fim <= p.ini || t.ini >= p.fim) prox.push(p)
        else {
          if (t.ini > p.ini) prox.push({ ini: p.ini, fim: t.ini })
          if (t.fim < p.fim) prox.push({ ini: t.fim, fim: p.fim })
        }
      }
      pedacos = prox
    }
    pedacos.forEach((p, k) => clipes.push(p.ini === c.ini && p.fim === c.fim ? c : retrecho(c, p.ini, p.fim, { id: k === 0 ? c.id : novoId() })))
  }
  return { ...linha, clipes }
}

/**
 * Cor e etiqueta de clipes ({ cor: id de src/cores.js ou null, etiqueta: texto ou '' }). Só o que vier no objeto muda.
 */
export function etiquetar(linha, ids, { cor, etiqueta } = {}) {
  const alvo = new Set(Array.isArray(ids) ? ids : [ids])
  let mudou = false
  const clipes = linha.clipes.map((c) => {
    if (!alvo.has(c.id)) return c
    const novo = { ...c }
    if (cor !== undefined) {
      if (cor) novo.cor = cor
      else delete novo.cor
    }
    if (etiqueta !== undefined) {
      const t = String(etiqueta).replace(/\s+/g, ' ').trim().slice(0, 40)
      if (t) novo.etiqueta = t
      else delete novo.etiqueta
    }
    if (novo.cor === c.cor && novo.etiqueta === c.etiqueta) return c
    mudou = true
    return novo
  })
  return mudou ? { ...linha, clipes } : linha
}

/** Ajustes de um clipe e os valores sem ajuste (Inspector). volume em dB; opacidade 0–1; escala 1 = cabe no quadro;
 * x e y em fração do quadro (0 = centro, 0,5 = meio quadro para a direita/baixo). */
export const AJUSTES_PADRAO = Object.freeze({ volume: 0, opacidade: 1, escala: 1, x: 0, y: 0 })
const LIMITES = { volume: [-60, 12], opacidade: [0, 1], escala: [0.1, 5], x: [-1, 1], y: [-1, 1] }
export const ajustesDe = (c) => ({ ...AJUSTES_PADRAO, ...(c.ajustes || {}) })

/** Muda os ajustes de clipes (só as chaves dadas; valor padrão some do clipe). */
export function ajustar(linha, ids, props) {
  const alvo = new Set(Array.isArray(ids) ? ids : [ids])
  let mudou = false
  const clipes = linha.clipes.map((c) => {
    if (!alvo.has(c.id)) return c
    const aj = { ...(c.ajustes || {}) }
    for (const [k, v] of Object.entries(props)) {
      if (!(k in AJUSTES_PADRAO) || typeof v !== 'number' || !Number.isFinite(v)) continue
      const [a, b] = LIMITES[k]
      const n = Math.round(Math.min(b, Math.max(a, v)) * 1000) / 1000
      if (n === AJUSTES_PADRAO[k]) delete aj[k]
      else aj[k] = n
    }
    const igual = JSON.stringify(aj) === JSON.stringify(c.ajustes || {})
    if (igual) return c
    mudou = true
    const novo = { ...c }
    if (Object.keys(aj).length) novo.ajustes = aj
    else delete novo.ajustes
    return novo
  })
  return mudou ? { ...linha, clipes } : linha
}

/**
 * Velocidade de clipes: pontos [x, v] da curva (src/velocidade.js) ou null para voltar a 100%. Cada clipe guarda a
 * curva no próprio trecho de origem.
 */
export function acelerar(linha, ids, pontos) {
  const alvo = new Set(Array.isArray(ids) ? ids : [ids])
  const limpos = limparPontos(pontos)
  let mudou = false
  const clipes = linha.clipes.map((c) => {
    if (!alvo.has(c.id)) return c
    if (JSON.stringify(c.velocidade?.pontos || null) === JSON.stringify(limpos)) return c
    mudou = true
    const novo = { ...c }
    if (limpos) novo.velocidade = { pontos: limpos }
    else delete novo.velocidade
    return novo
  })
  return mudou ? { ...linha, clipes } : linha
}

/** Junta clipes vizinhos que continuam a mesma mídia sem salto (depois de desfazer um corte, por exemplo). */
export function juntarContinuos(linha) {
  const clipes = []
  for (const c of linha.clipes) {
    const ant = clipes[clipes.length - 1]
    if (ant && !ant.velocidade && !c.velocidade && ant.midia === c.midia && ant.fim === c.ini && ant.cor === c.cor && ant.etiqueta === c.etiqueta && JSON.stringify(ant.ajustes || {}) === JSON.stringify(c.ajustes || {})) clipes[clipes.length - 1] = { ...ant, fim: c.fim }
    else clipes.push(c)
  }
  return clipes.length === linha.clipes.length ? linha : { ...linha, clipes }
}

/** Desfazer e refazer: guarda as versões da linha (e de qualquer estado imutável) com um rótulo. */
export class Historico {
  constructor(inicial, limite = 300) {
    this.atual = inicial
    this.passado = []
    this.futuro = []
    this.limite = limite
  }
  fazer(novo, rotulo = '') {
    if (novo === this.atual) return false
    this.passado.push({ estado: this.atual, rotulo })
    if (this.passado.length > this.limite) this.passado.shift()
    this.futuro = []
    this.atual = novo
    return true
  }
  get podeDesfazer() {
    return this.passado.length > 0
  }
  get podeRefazer() {
    return this.futuro.length > 0
  }
  /** rótulo da próxima ação desfeita ("Desfazer corte") */
  get proximoDesfazer() {
    return this.passado.at(-1)?.rotulo || ''
  }
  get proximoRefazer() {
    return this.futuro.at(-1)?.rotulo || ''
  }
  desfazer() {
    const p = this.passado.pop()
    if (!p) return null
    this.futuro.push({ estado: this.atual, rotulo: p.rotulo })
    this.atual = p.estado
    return p.rotulo
  }
  refazer() {
    const f = this.futuro.pop()
    if (!f) return null
    this.passado.push({ estado: this.atual, rotulo: f.rotulo })
    this.atual = f.estado
    return f.rotulo
  }
}
