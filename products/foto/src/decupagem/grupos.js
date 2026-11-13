// Magnitude · grupos: juntar as fotos do mesmo momento. Repetidas (a rajada: quase o mesmo quadro em até 2 s) e
// sequências (a mesma cena em até 30 s). Dentro de cada grupo, a de maior nota vira a escolhida e as outras, reserva;
// quando a diferença cabe na margem de erro da nota, o grupo diz "equivalentes" e desempata por regra fixa.
//
//   agrupar(fotos) → [{ id, fotos: [id], tipo: 'repetidas' | 'sequencia', escolhida, reservas, equivalentes, desempate }]
//
// Foto de entrada (a do catálogo serve): { id, exif?: { data, subsegundo }, medidas?: { dhash, phash }, vetor?,
// magnitude? }. `vetor` é o vetor visual da foto (embedding), quando a camada existir; sem ele a cascata decide só
// com as impressões digitais, e fica mais conservadora. Grupo de uma foto só não existe: foto sozinha não entra.

import { hamming } from './medidas.js'

/**
 * Limiares da cascata. As distâncias vêm da prova (variações da mesma foto ficaram em até 7 bits andando 1% e até
 * 16 andando 3%; 190 pares de fotos diferentes não desceram de 21). As janelas de tempo são suposição de produto:
 * precisam de rajadas e ensaios reais para firmar.
 */
export const LIMIARES_GRUPO = Object.freeze({
  repetidaSegundos: 2,
  repetidaHamming: 10, // em dHash OU pHash
  cinzaHamming: 20, // de 11 a 20: zona cinza
  cinzaCosseno: 0.9, // zona cinza decidida pelo vetor
  sequenciaSegundos: 30,
  sequenciaCosseno: 0.86,
  janela: 400, // quantas fotos seguintes cada foto compara, no máximo (rajada longa não vira conta quadrática)
})

/**
 * Margem de erro da nota, em pontos. Quadros igualmente nítidos da mesma cena, andando 1% a 3% do quadro, medem q a
 * 0,02 um do outro no caso típico e até 0,04 no pior (test/decupagem-nota.test.js trava isso): na parte da régua
 * que não está saturada, 0,02 de q são uns 9 pontos de foco, perto de 5 pontos da nota. Abaixo disso a ordem entre
 * duas fotos não quer dizer nada, e o grupo diz "equivalentes".
 */
export const MARGEM_DE_ERRO = 5

/** A mesma variação, em q: diferença de nitidez menor que isto não desempata nem faz "a mais nítida". */
export const FOLGA_DE_NITIDEZ = 0.04

/**
 * Instante da captura em segundos (hora local da câmera, lida como se fosse UTC: só as diferenças importam).
 * Sem data, null.
 */
export function instante(foto) {
  const data = foto?.exif?.data
  if (typeof data !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(data)
  if (!m) return null
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000
  const sub = foto.exif.subsegundo
  return Number.isFinite(t) ? t + (typeof sub === 'number' && sub >= 0 && sub < 1 ? sub : 0) : null
}

/** Cosseno entre dois vetores do mesmo tamanho; null se faltar um deles ou o tamanho não bater. */
export function cosseno(a, b) {
  if (!a || !b || !a.length || a.length !== b.length) return null
  let ab = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < a.length; i++) {
    ab += a[i] * b[i]
    aa += a[i] * a[i]
    bb += b[i] * b[i]
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : null
}

const impressao = (foto, nome) => foto?.medidas?.[nome] ?? foto?.[nome]

/**
 * A regra de um par: 'repetidas', 'sequencia' ou null. `dt` = segundos entre as duas (null se alguma não tem data).
 *   1. até 2 s e Hamming ≤ 10 em dHash ou pHash → repetidas
 *   2. até 2 s e Hamming de 11 a 20 (zona cinza) → repetidas se o vetor disser (cosseno ≥ 0,90)
 *   3. até 30 s → sequência se o vetor disser (cosseno ≥ 0,86)
 * Sem vetor, a sequência sai só das impressões: zona cinza nas DUAS impressões em até 2 s, ou Hamming ≤ 10 em até
 * 30 s (o mesmo enquadramento, outro instante). Sem data, só vale o quadro quase idêntico (Hamming ≤ 10).
 */
export function ligar(a, b, dt) {
  const L = LIMIARES_GRUPO
  const dd = hamming(impressao(a, 'dhash'), impressao(b, 'dhash'))
  const dp = hamming(impressao(a, 'phash'), impressao(b, 'phash'))
  const menor = Math.min(dd, dp)
  const maior = Math.max(dd, dp)
  if (dt == null) return menor <= L.repetidaHamming ? 'repetidas' : null
  if (dt > L.sequenciaSegundos) return null
  const cos = cosseno(a.vetor, b.vetor)
  if (dt <= L.repetidaSegundos) {
    if (menor <= L.repetidaHamming) return 'repetidas'
    if (menor <= L.cinzaHamming && cos != null && cos >= L.cinzaCosseno) return 'repetidas'
  }
  if (cos != null) return cos >= L.sequenciaCosseno ? 'sequencia' : null
  if (dt <= L.repetidaSegundos) return maior <= L.cinzaHamming ? 'sequencia' : null
  return menor <= L.repetidaHamming ? 'sequencia' : null
}

/**
 * Escolhe dentro de um grupo. `fotos` = as fotos do grupo, cada uma com `magnitude` (o que avaliar() devolveu).
 * A de maior nota é a escolhida. Se outras estão a menos de `margem` pontos dela, são "equivalentes": a nota não
 * sabe qual é melhor, e quem decide é a regra fixa, nesta ordem: olhos da pior pessoa-chave, expressão, nitidez e,
 * por fim, a ordem de captura. Devolve { escolhida, reservas, equivalentes, desempate }; sem nota em alguma foto,
 * escolhida = null (não se escolhe no escuro).
 */
export function escolherNoGrupo(fotos, { margem = MARGEM_DE_ERRO } = {}) {
  const ids = fotos.map((f) => f.id)
  if (!fotos.length || fotos.some((f) => typeof f.magnitude?.total !== 'number')) return { escolhida: null, reservas: ids, equivalentes: [], desempate: null }
  const maior = Math.max(...fotos.map((f) => f.magnitude.total))
  const empatadas = fotos.filter((f) => maior - f.magnitude.total < margem)
  let escolhida = empatadas[0]
  let desempate = null
  if (empatadas.length > 1) {
    // cada critério só decide quando a diferença é maior que o ruído dele; senão passa para o seguinte
    const criterios = [
      ['olhos', (f) => f.magnitude.detalhe?.olhos, 0.25],
      ['expressao', (f) => f.magnitude.detalhe?.expressao, 0.1],
      ['nitidez', (f) => f.magnitude.detalhe?.qFoco, FOLGA_DE_NITIDEZ],
    ]
    let candidatas = empatadas
    desempate = 'ordem'
    for (const [nome, ler, folga] of criterios) {
      const valores = candidatas.map(ler)
      if (valores.some((v) => typeof v !== 'number')) continue
      const topo = Math.max(...valores)
      const ficam = candidatas.filter((_, i) => topo - valores[i] < folga)
      if (ficam.length < candidatas.length) {
        candidatas = ficam
        if (ficam.length === 1) {
          desempate = nome
          break
        }
      }
    }
    escolhida = candidatas[0]
  }
  return {
    escolhida: escolhida.id,
    reservas: ids.filter((id) => id !== escolhida.id),
    equivalentes: empatadas.length > 1 ? empatadas.map((f) => f.id) : [],
    desempate,
  }
}

/**
 * Agrupa as fotos. Ordena por data e fração de segundo (as sem data vão para o fim, na ordem em que vieram), liga
 * os pares pela regra de `ligar` e junta por união de conjuntos (union-find): se A liga com B e B com C, as três
 * ficam no mesmo grupo. Grupo que se fecha só com ligações de repetidas é 'repetidas'; se precisou de alguma
 * ligação de sequência para juntar as fotos, é 'sequencia'.
 * O `id` do grupo é estável: vem da primeira foto dele.
 */
export function agrupar(fotos, { margem = MARGEM_DE_ERRO } = {}) {
  const lista = (Array.isArray(fotos) ? fotos : []).map((foto, ordem) => ({ foto, ordem, t: instante(foto) }))
  lista.sort((a, b) => (a.t == null ? (b.t == null ? a.ordem - b.ordem : 1) : b.t == null ? -1 : a.t - b.t || a.ordem - b.ordem))
  const n = lista.length
  // dois conjuntos: `todas` forma os grupos; `rajada` só junta pelas ligações de repetidas. Um grupo é 'repetidas'
  // quando dá para ir de qualquer foto a qualquer outra só por repetidas (uma ligação de sequência a mais, entre
  // dois quadros distantes da mesma rajada, não muda o que ele é).
  const criar = () => Int32Array.from({ length: n }, (_, i) => i)
  const todas = criar()
  const rajada = criar()
  const raiz = (pai, i) => {
    while (pai[i] !== i) {
      pai[i] = pai[pai[i]]
      i = pai[i]
    }
    return i
  }
  const juntar = (pai, i, j) => {
    const a = raiz(pai, i)
    const b = raiz(pai, j)
    // a raiz é sempre a foto mais antiga: é ela que dá o id do grupo
    if (a !== b) pai[Math.max(a, b)] = Math.min(a, b)
  }
  const unir = (i, j, tipo) => {
    juntar(todas, i, j)
    if (tipo === 'repetidas') juntar(rajada, i, j)
  }
  const L = LIMIARES_GRUPO
  for (let i = 0; i < n; i++) {
    const a = lista[i]
    if (a.t == null) {
      // sem data não há janela de tempo: só a vizinha imediata, e só se for quase o mesmo quadro
      const b = lista[i + 1]
      if (b && b.t == null && ligar(a.foto, b.foto, null)) unir(i, i + 1, 'repetidas')
      continue
    }
    for (let j = i + 1; j < n && j - i <= L.janela; j++) {
      const b = lista[j]
      if (b.t == null || b.t - a.t > L.sequenciaSegundos) break
      const tipo = ligar(a.foto, b.foto, b.t - a.t)
      if (tipo) unir(i, j, tipo)
    }
  }
  const membros = new Map()
  for (let i = 0; i < n; i++) {
    const r = raiz(todas, i)
    if (!membros.has(r)) membros.set(r, [])
    membros.get(r).push(i)
  }
  const grupos = []
  for (const [r, indices] of membros) {
    if (indices.length < 2) continue
    const doGrupo = indices.map((i) => lista[i].foto)
    const soRajada = indices.every((i) => raiz(rajada, i) === raiz(rajada, r))
    grupos.push({
      id: `grupo:${lista[r].foto.id}`,
      fotos: doGrupo.map((f) => f.id),
      tipo: soRajada ? 'repetidas' : 'sequencia',
      ...escolherNoGrupo(doGrupo, { margem }),
    })
  }
  return grupos
}
