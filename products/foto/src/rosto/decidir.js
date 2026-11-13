// Rosto em evento · decidir: "É você", "Talvez seja você" ou nada, com os limiares medidos na pesquisa
// (docs/estudo/rosto-em-evento.md, C.9 e D.3). Puro. O banco faz a mesma conta na busca aberta (foto.evento_achar,
// db/migrations/0003): test/eventos.test.js confere que os dois lados dão o mesmo resultado.
//
//   É você   ≥ 0,50 com uma selfie, ou ≥ 0,45 em 2 quadros (de 2 ou 3). Só rosto que vale: ≥ 24 px, nota do detector
//            ≥ 0,75, não colado em outro rosto e não de perfil.
//   Talvez   ≥ 0,40 e não é "É você" (inclui o rosto de 20–24 px, colado ou de perfil que passaria).
//   Abaixo de 0,40: nada. Remoção: ≥ 0,45, com confirmação de quem pediu.
//
// Rosto (da foto do evento): { foto, largura (px na prévia de 1616), nota (0..1), colado, perfil, v (Int8Array) }.

import { cosseno } from './assinatura.js'

export const LIMIARES = Object.freeze({
  eu: 0.5,
  euEmDois: 0.45,
  talvez: 0.4,
  remover: 0.45,
  larguraEu: 24,
  larguraMinima: 20,
  notaMinima: 0.75,
  perfil: 0.3,
  /** no máximo tantas fotos na resposta (B.5) */
  resultados: 200,
})

/** O rosto pode dar "É você"? */
export const rostoQueVale = (r) => r.largura >= LIMIARES.larguraEu && r.nota >= LIMIARES.notaMinima && !r.colado && !r.perfil

/** A faixa de um rosto contra 1 a 3 sondas (vetores da selfie): 'eu', 'talvez' ou null. */
export function faixa(cossenos, rosto) {
  if (!cossenos.length) return null
  const max = Math.max(...cossenos)
  const acima = cossenos.filter((c) => c >= LIMIARES.euEmDois).length
  const eu = cossenos.length === 1 ? max >= LIMIARES.eu : acima >= 2
  if (eu && rostoQueVale(rosto)) return 'eu'
  return max >= LIMIARES.talvez ? 'talvez' : null
}

/**
 * Procura as sondas em todos os rostos. Devolve { eu: [foto], talvez: [foto] } (cada foto uma vez, na faixa melhor;
 * ordenadas pela nota, a melhor primeiro; no máximo LIMIARES.resultados no total).
 */
export function procurar(sondas, rostos) {
  const melhor = new Map()
  for (const r of rostos) {
    if (r.naoBuscar) continue
    const cs = sondas.map((s) => cosseno(s, r.v))
    const f = faixa(cs, r)
    if (!f) continue
    const nota = Math.max(...cs)
    const atual = melhor.get(r.foto)
    if (!atual || (f === 'eu' && atual.f !== 'eu') || (f === atual.f && nota > atual.nota)) melhor.set(r.foto, { f, nota })
  }
  const lista = [...melhor.entries()].sort((a, b) => (a[1].f === b[1].f ? b[1].nota - a[1].nota : a[1].f === 'eu' ? -1 : 1)).slice(0, LIMIARES.resultados)
  return { eu: lista.filter(([, x]) => x.f === 'eu').map(([foto]) => foto), talvez: lista.filter(([, x]) => x.f === 'talvez').map(([foto]) => foto) }
}

/**
 * Modo com consentimento, no computador do fotógrafo: para cada pessoa que pediu (1 a 3 vetores), as ligações com as
 * fotos. Devolve [{ pessoa, foto, faixa }].
 */
export function ligar(pessoas, rostos) {
  const saida = []
  for (const p of pessoas) {
    const { eu, talvez } = procurar(p.vetores, rostos)
    for (const foto of eu) saida.push({ pessoa: p.id, foto, faixa: 'eu' })
    for (const foto of talvez) saida.push({ pessoa: p.id, foto, faixa: 'talvez' })
  }
  return saida
}

/** Os rostos que somem num pedido de remoção: cosseno ≥ 0,45 com qualquer sonda. */
export const paraRemover = (sondas, rostos) => rostos.filter((r) => sondas.some((s) => cosseno(s, r.v) >= LIMIARES.remover))
