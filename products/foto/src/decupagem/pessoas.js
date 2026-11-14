// Magnitude · pessoas: agrupar os rostos do ensaio por pessoa, no aparelho, com as assinaturas do SFace (128 números
// por rosto, as mesmas da busca em evento: src/rosto/assinatura.js). Puro: Node e navegador. Nada aqui sabe quem é
// ninguém: são grupos ("Pessoa 3"), e só existem quando a pessoa liga, com o aviso da regra 5 de docs/ARQUITETURA.md.
// Os vetores e os grupos moram só no IndexedDB do trabalho (app/decupagem/pessoas.js), nunca no catálogo.
//
//   rostoParaAssinar(foto) → [{ i, caixa, pontos }]      os rostos da análise que valem uma assinatura
//   rostosDoEnsaio(fotos, assinaturas) → [rosto]          junta a leitura da análise com os vetores guardados
//   agruparPessoas(rostos, opcoes) → { pessoas, soltos }  centroide incremental + fusão no fim
//   manterIds(pessoas, anteriores) → pessoas              o mesmo id (e o nome) de uma rodada para a outra
//   protegerPessoas(magnitudes, pessoas) → Map            a única foto de uma pessoa-chave não vai para Fora sozinha
//   coberturaDe(pessoa, fotoDe) → { fotos, boas, protegida }
//
// Os números vêm da pesquisa (docs/estudo/visao-no-aparelho.md, seção 7, e rosto-em-evento.md, C.5 a C.9): o SFace
// separou a mesma pessoa (0,49 a 0,78) de pessoas diferentes (até 0,16) num conjunto de frente; em fotos reais, rostos
// de frente da mesma pessoa deram mediana 0,74 e de pessoas diferentes no máximo 0,19, mas perfil e rostos colados
// (beijo) passam de 0,3 e chegam a 0,86. Daí: só rosto de frente, grande, nítido, de olho visível e não colado entra
// no centroide; o resto só se junta a um grupo que já existe, com régua mais alta, e nunca cria pessoa.

import { cosseno as cosGrupo } from './grupos.js'
import { MOTIVOS } from './textos.js'

export const LIMIARES_PESSOA = Object.freeze({
  juntar: 0.4, // cosseno com o centroide para entrar no grupo (visão no aparelho, seção 7)
  juntarFraco: 0.45, // rosto que não entra no centroide (pequeno, de perfil, colado) precisa de mais para se juntar
  fundir: 0.45, // dois grupos com centroides assim parecidos viram um no fim
  larguraBoa: 60, // px na prévia de 1024: abaixo disto o rosto não entra no centroide
  larguraMinima: 24, // px na prévia: abaixo disto nem se assina (rosto-em-evento.md, C.6)
  guinada: 30, // graus: mais que isto é meio-perfil, que se parece demais com outros perfis
  nitidez: 0.6, // q do rosto (ou dos olhos): abaixo disto é borrado (LIMIARES.leve de medidas.js)
  invasao: 0.1, // fração da caixa coberta por outro rosto: acima disto é colado (beijo, rosto com rosto)
  porFoto: 12, // no máximo tantos rostos assinados por foto (os de maior peso)
})

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const OLHOS_VISIVEIS = new Set(['abertos', 'sorrindo', 'parcial'])

/** Fração da caixa `a` coberta pela caixa `b`. */
function invasao(a, b) {
  const x = Math.max(0, Math.min(a.x + a.largura, b.x + b.largura) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.altura, b.y + b.altura) - Math.max(a.y, b.y))
  return (x * y) / Math.max(1, a.largura * a.altura)
}

/** Uma impressão das caixas da foto: mudou a leitura dos rostos, a assinatura guardada não vale mais. */
export function chaveDosRostos(rostos) {
  return (Array.isArray(rostos) ? rostos : []).map((r) => (r?.caixa ? [r.caixa.x, r.caixa.y, r.caixa.largura].map((v) => Math.round(v)).join(',') : '-')).join(';')
}

/**
 * Os rostos da análise que valem uma assinatura: não recusados pela malha, com pelo menos 24 px de largura, no
 * máximo 12, os de maior peso. `i` é o índice em foto.rostos.
 */
export function rostoParaAssinar(foto) {
  const L = LIMIARES_PESSOA
  return (Array.isArray(foto?.rostos) ? foto.rostos : [])
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r?.caixa && !r.duvidoso && r.caixa.largura >= L.larguraMinima)
    .sort((a, b) => (b.r.peso ?? 0) - (a.r.peso ?? 0))
    .slice(0, L.porFoto)
    .map(({ r, i }) => ({ i, caixa: r.caixa, pontos: r.pontos ?? null }))
}

/** O rosto entra no centroide? (grande, nítido, olho visível, de frente, não colado) */
export function rostoBom(r, outros = []) {
  const L = LIMIARES_PESSOA
  if (!r?.caixa || r.duvidoso || r.caixa.largura < L.larguraBoa) return false
  const q = num(r.nitidezRosto) ?? num(r.nitidezOlhos)
  if (q == null || q < L.nitidez) return false
  if (!OLHOS_VISIVEIS.has(r.olhos)) return false
  if (num(r.guinada) != null && Math.abs(r.guinada) > L.guinada) return false
  return !outros.some((o) => o !== r && o?.caixa && invasao(r.caixa, o.caixa) > L.invasao)
}

/** Vetor (Int8Array do int8 ou qualquer lista) → Float32Array de norma 1. */
function unitario(v) {
  const o = Float32Array.from(v)
  let s = 0
  for (let k = 0; k < o.length; k++) s += o[k] * o[k]
  const n = Math.sqrt(s) || 1
  for (let k = 0; k < o.length; k++) o[k] /= n
  return o
}

/**
 * Junta o que a análise leu (foto.rostos) com os vetores guardados. `assinaturas` = Map ou objeto foto → { chave,
 * rostos: [{ i, v }] }; assinatura de outra leitura dos rostos (a chave não bate) não vale. Devolve
 * [{ foto, i, v: Float32Array unitário, largura, bom, chave, peso, caixa }].
 */
export function rostosDoEnsaio(fotos, assinaturas) {
  const ler = (id) => (assinaturas instanceof Map ? assinaturas.get(id) : assinaturas?.[id])
  const saida = []
  for (const f of Array.isArray(fotos) ? fotos : []) {
    const a = ler(f.id)
    if (!a || !Array.isArray(f.rostos) || a.chave !== chaveDosRostos(f.rostos)) continue
    for (const x of a.rostos ?? []) {
      const r = f.rostos[x.i]
      if (!r || !x.v || x.v.length !== 128) continue
      saida.push({ foto: f.id, i: x.i, v: unitario(x.v), largura: r.caixa.largura, bom: rostoBom(r, f.rostos), chave: !!r.chave, peso: r.peso ?? 0, caixa: r.caixa })
    }
  }
  return saida
}

const somar = (alvo, v) => {
  for (let k = 0; k < v.length; k++) alvo[k] += v[k]
}

/**
 * Agrupa por pessoa. `rostos` = o que rostosDoEnsaio devolveu (ou o mesmo formato com vetores fabricados).
 * 1. Os rostos bons, do maior para o menor: cada um vai para o grupo de centroide mais parecido (cosseno ≥ 0,40) que
 *    ainda não tem rosto da mesma foto (dois rostos da mesma foto são duas pessoas); senão abre um grupo. O centroide
 *    é a média dos vetores bons, renormalizada.
 * 2. Os outros (pequenos, de perfil, borrados, colados) só se juntam a um grupo que já existe, com cosseno ≥ 0,45,
 *    e não mexem no centroide. Sem grupo, ficam soltos.
 * 3. No fim, grupos com centroides ≥ 0,45 e sem foto em comum viram um.
 * Devolve { pessoas: [{ id, rostos: [{ foto, i }], fotos: [id], centroide, capa: { foto, i, caixa }, chave }], soltos }
 * com as pessoas da que mais aparece para a que menos aparece; ids provisórios ('p1', 'p2'…).
 */
export function agruparPessoas(rostos, opcoes = {}) {
  const L = { ...LIMIARES_PESSOA, ...opcoes }
  const lista = (Array.isArray(rostos) ? rostos : []).filter((r) => r?.v?.length).map((r, ordem) => ({ ...r, ordem }))
  const bons = lista.filter((r) => r.bom).sort((a, b) => b.largura - a.largura || a.ordem - b.ordem)
  const fracos = lista.filter((r) => !r.bom).sort((a, b) => b.largura - a.largura || a.ordem - b.ordem)
  const grupos = []
  const melhorGrupo = (r, limiar) => {
    let melhor = null
    let cos = limiar
    for (const g of grupos) {
      if (g.fotos.has(r.foto)) continue
      const c = cosGrupo(g.centroide, r.v)
      if (c != null && c >= cos) {
        cos = c
        melhor = g
      }
    }
    return melhor
  }
  const renovar = (g) => {
    g.centroide = unitario(g.soma)
  }
  for (const r of bons) {
    let g = melhorGrupo(r, L.juntar)
    if (!g) {
      g = { soma: new Float32Array(r.v.length), membros: [], fotos: new Set(), centroide: null }
      grupos.push(g)
    }
    somar(g.soma, r.v)
    g.membros.push(r)
    g.fotos.add(r.foto)
    renovar(g)
  }
  let soltos = 0
  for (const r of fracos) {
    const g = melhorGrupo(r, L.juntarFraco)
    if (!g) {
      soltos++
      continue
    }
    g.membros.push(r)
    g.fotos.add(r.foto)
  }
  // fundir: o par mais parecido primeiro, até não haver par acima da régua
  for (;;) {
    let par = null
    let cos = L.fundir
    for (let a = 0; a < grupos.length; a++) {
      for (let b = a + 1; b < grupos.length; b++) {
        const A = grupos[a]
        const B = grupos[b]
        if ([...B.fotos].some((f) => A.fotos.has(f))) continue
        const c = cosGrupo(A.centroide, B.centroide)
        if (c != null && c >= cos) {
          cos = c
          par = [a, b]
        }
      }
    }
    if (!par) break
    const [a, b] = par
    const A = grupos[a]
    const B = grupos[b]
    somar(A.soma, B.soma)
    A.membros.push(...B.membros)
    for (const f of B.fotos) A.fotos.add(f)
    renovar(A)
    grupos.splice(b, 1)
  }
  const pessoas = grupos
    .map((g) => {
      const capa = g.membros.filter((r) => r.bom).sort((a, b) => b.largura - a.largura || a.ordem - b.ordem)[0]
      const fotos = []
      for (const r of [...g.membros].sort((a, b) => a.ordem - b.ordem)) if (!fotos.includes(r.foto)) fotos.push(r.foto)
      return {
        rostos: g.membros.map((r) => ({ foto: r.foto, i: r.i })),
        fotos,
        centroide: g.centroide,
        capa: { foto: capa.foto, i: capa.i, caixa: capa.caixa ?? null },
        chave: g.membros.some((r) => r.chave),
        primeira: Math.min(...g.membros.map((r) => r.ordem)),
      }
    })
    .sort((a, b) => b.fotos.length - a.fotos.length || a.primeira - b.primeira)
    .map(({ primeira, ...p }, k) => ({ id: `p${k + 1}`, ...p }))
  return { pessoas, soltos }
}

/**
 * Os grupos de agora com os ids (e os nomes) de antes: um grupo novo herda o id do antigo com quem divide mais
 * rostos, se dividir pelo menos metade do menor dos dois. O resto ganha id novo, depois do maior que já existiu.
 * `anteriores` = [{ id, nome?, rostos: ['foto|i'] }]. Devolve as pessoas com { id, nome }.
 */
export function manterIds(pessoas, anteriores = []) {
  const antigos = (anteriores ?? []).map((p) => ({ id: p.id, nome: p.nome ?? null, rostos: new Set(p.rostos ?? []) }))
  let maior = 0
  for (const p of antigos) maior = Math.max(maior, Number(/^p(\d+)$/.exec(p.id)?.[1] ?? 0))
  const pares = []
  pessoas.forEach((p, k) => {
    const chaves = p.rostos.map((r) => `${r.foto}|${r.i}`)
    for (const a of antigos) {
      const comum = chaves.filter((c) => a.rostos.has(c)).length
      if (comum && comum >= 0.5 * Math.min(chaves.length, a.rostos.size)) pares.push({ k, a, comum })
    }
  })
  pares.sort((x, y) => y.comum - x.comum)
  const herdado = new Map()
  const usados = new Set()
  for (const { k, a } of pares) {
    if (herdado.has(k) || usados.has(a.id)) continue
    herdado.set(k, a)
    usados.add(a.id)
  }
  // os novos na ordem em que aparecem (a que mais aparece primeiro)
  return pessoas.map((p, k) => {
    const a = herdado.get(k)
    return a ? { ...p, id: a.id, nome: a.nome } : { ...p, id: `p${++maior}`, nome: null }
  })
}

/**
 * Cobertura por pessoa: a pessoa-chave cujas fotos caíram todas em Fora tem a melhor delas levada a Talvez, com o
 * motivo. As notas não mudam. `pessoas` = [{ id, fotos, chave }]. Devolve um Map novo (id → Magnitude).
 */
export function protegerPessoas(magnitudes, pessoas) {
  const saida = new Map(magnitudes instanceof Map ? magnitudes : Object.entries(magnitudes ?? {}))
  for (const p of pessoas ?? []) {
    if (!p?.chave) continue
    const membros = (p.fotos ?? []).filter((id) => saida.has(id))
    if (!membros.length || membros.some((id) => saida.get(id).balde !== 'fora')) continue
    const melhor = membros.reduce((a, id) => (saida.get(id).total > saida.get(a).total ? id : a))
    const mg = saida.get(melhor)
    const texto = MOTIVOS.unicaDaPessoa()
    saida.set(melhor, {
      ...mg,
      balde: 'talvez',
      motivos: [texto, ...mg.motivos.filter((t) => t !== texto)].slice(0, 3),
      detalhe: { ...mg.detalhe, protegida: true },
    })
  }
  return saida
}

/**
 * Quantas fotos a pessoa tem, quantas boas (fora de Fora, sem contar a que só subiu pela cobertura) e se ela depende
 * da cobertura (nenhuma boa; a melhor subiu para Talvez). `fotoDe(id)` → a foto do catálogo.
 */
export function coberturaDe(pessoa, fotoDe) {
  const fotos = (pessoa?.fotos ?? []).map(fotoDe).filter(Boolean)
  const boas = fotos.filter((f) => f.magnitude && f.magnitude.balde !== 'fora' && !f.magnitude.detalhe?.protegida).length
  // protegida: não tem foto boa, e a melhor dela só não está em Fora por causa da cobertura
  const protegida = boas === 0 && fotos.some((f) => f.magnitude?.detalhe?.protegida && f.magnitude.balde !== 'fora')
  return { fotos: fotos.length, boas, protegida }
}
