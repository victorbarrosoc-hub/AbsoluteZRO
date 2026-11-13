// Rosto em evento · os 3 quadros da selfie (docs/estudo/rosto-em-evento.md, C.9 a C.11). Puro.
//
// A captura pede: de frente → vire um pouco o rosto → agora para o outro lado. Cada quadro só entra se passou nos
// portões de qualidade (qualidade.js) e se chegou até 6 s depois do anterior (senão recomeça). A guinada que troca de
// sinal entre o 2º e o 3º quadro e os vetores que concordam entre si (cos ≥ 0,6) barram foto impressa parada e
// imagem enviada; não barram vídeo na tela de outro aparelho nem câmera virtual (C.11: não é antifraude).
//
// No fim, `juntar` decide o que vai para a busca: os 3 vetores se todos concordam; os 2 que concordam se um destoa;
// nada se nenhum par concorda (a pessoa tenta de novo).

import { cosseno } from './assinatura.js'
import { PORTOES } from './qualidade.js'

export const CONCORDA = 0.6
export const INTERVALO_MS = 6000

/** A pose serve para a etapa? 0: de frente; 1: girado; 2: girado para o lado contrário ao da etapa 1. */
export function serveParaEtapa(etapa, pose, guinadaDoGiro = null) {
  const g = pose?.guinada
  if (!Number.isFinite(g)) return false
  const girado = Math.abs(g) >= PORTOES.giroMin && Math.abs(g) <= PORTOES.giroMax
  if (etapa === 0) return Math.abs(g) < PORTOES.frente
  if (etapa === 1) return girado
  if (etapa === 2) return girado && Number.isFinite(guinadaDoGiro) && Math.sign(g) !== Math.sign(guinadaDoGiro)
  return false
}

/**
 * Máquina da captura. `passo({ ok, dica, pose, vetor?, agora })` recebe a avaliação de um quadro (avaliarQuadro) e,
 * quando o quadro serve para a etapa atual, o vetor dele. Devolve { etapa: 0..3, dica, pegou, pronto, vetores }.
 * `pegou` = este quadro entrou. Etapas: 0 de frente, 1 girado, 2 girado para o outro lado, 3 pronto.
 */
export function criarCaptura() {
  let vetores = []
  let poses = []
  let ultimo = 0
  const etapa = () => vetores.length
  const dicaDaEtapa = () => (etapa() === 0 ? 'frente' : etapa() === 1 ? 'virar' : etapa() === 2 ? 'outro' : null)

  const serve = (p) => serveParaEtapa(etapa(), p, poses[1]?.guinada)

  return {
    etapa,
    /** A guinada do quadro girado (etapa 1), para o worker saber o que serve na etapa 2. */
    guinadaDoGiro: () => poses[1]?.guinada ?? null,
    /** Precisa do vetor deste quadro? (para o worker só assinar quando vale a pena) */
    quer(avaliacao) {
      return etapa() < 3 && avaliacao.ok && serve(avaliacao.pose)
    },
    passo({ ok, dica, pose, vetor = null, agora }) {
      if (etapa() > 0 && etapa() < 3 && agora - ultimo > INTERVALO_MS) {
        vetores = []
        poses = []
      }
      let pegou = false
      if (etapa() < 3 && ok && vetor && serve(pose)) {
        // o quadro novo tem de parecer a mesma pessoa dos anteriores (senão é outra pessoa entrando no quadro)
        const longe = vetores.some((v) => cosseno(v, vetor) < CONCORDA - 0.15)
        if (!longe) {
          vetores.push(vetor)
          poses.push(pose)
          ultimo = agora
          pegou = true
        }
      }
      return { etapa: etapa(), dica: ok ? dicaDaEtapa() : dica, pegou, pronto: etapa() === 3, vetores: [...vetores] }
    },
    recomecar() {
      vetores = []
      poses = []
      ultimo = 0
    },
  }
}

/**
 * Junta os quadros: { ok, vetores, concordancia } (concordancia = o menor cosseno entre os que ficaram).
 * 3 que concordam → os 3; um destoa → os 2 que concordam; nenhum par → ok false.
 */
export function juntar(vetores) {
  const n = vetores.length
  if (n === 0) return { ok: false, vetores: [], concordancia: null }
  if (n === 1) return { ok: true, vetores: [...vetores], concordancia: null }
  const pares = []
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pares.push({ i, j, c: cosseno(vetores[i], vetores[j]) })
  if (pares.every((p) => p.c >= CONCORDA)) return { ok: true, vetores: [...vetores], concordancia: Math.min(...pares.map((p) => p.c)) }
  const bons = pares.filter((p) => p.c >= CONCORDA).sort((a, b) => b.c - a.c)
  if (!bons.length) return { ok: false, vetores: [], concordancia: Math.max(...pares.map((p) => p.c)) }
  const melhor = bons[0]
  return { ok: true, vetores: [vetores[melhor.i], vetores[melhor.j]], concordancia: melhor.c }
}
