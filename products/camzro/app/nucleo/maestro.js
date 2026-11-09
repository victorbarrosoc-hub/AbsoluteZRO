// CAMZRO · o roteiro do Maestro na claquete. Conta pura.
//
// O Maestro exporta o roteiro salvo como `maestro.roteiro/1` (docs/integration-contracts/maestro-roteiro.md; schema em
// packages/media-contracts/src/roteiro.ts). O CAMZRO lê o arquivo que a pessoa escolhe (nada de rede) e monta a
// decupagem: cada cena com os blocos `plano` em ordem viram os planos A, B, C… com o tamanho (sigla), o ângulo, o
// movimento, a lente e a cadência pedidos. A claquete anda por essa lista; o clipe leva de volta o id do roteiro, a
// versão, a cena e o plano (sidecar camzro.clip/1, campo ecossistema.maestro).

import { proximoPlano, campo } from './claquete.js'

export const CONTRATO_ROTEIRO = 'maestro.roteiro/1'
export const MAX_BYTES_ROTEIRO = 2 * 1024 * 1024

export class ErroRoteiro extends Error {}

const texto = (v, max) => (typeof v === 'string' && v.trim() ? campo(v, max) : null)

/** Lê o JSON do Maestro e devolve { titulo, roteiroId, versao, formato, cenas: [{ id, numero, titulo, cabecalho, planos }] }. */
export function lerRoteiro(json) {
  let d = json
  if (typeof json === 'string') {
    if (json.length > MAX_BYTES_ROTEIRO) throw new ErroRoteiro('Arquivo grande demais para um roteiro.')
    try {
      d = JSON.parse(json)
    } catch {
      throw new ErroRoteiro('Não é um arquivo do Maestro.')
    }
  }
  if (!d || d.contract !== CONTRATO_ROTEIRO || d.origem?.app !== 'maestro' || !Array.isArray(d.cenas)) throw new ErroRoteiro('Não é um roteiro do Maestro (maestro.roteiro/1).')
  const cenas = d.cenas.slice(0, 300).map((c, i) => {
    let letra = 'A'
    const planos = []
    for (const b of Array.isArray(c?.blocos) ? c.blocos : []) {
      if (b?.tipo !== 'plano') continue
      const partes = [texto(b.sigla, 20), texto(b.angulo, 60), texto(b.movimento, 60)].filter(Boolean)
      planos.push({ id: texto(b.id, 60) || `p${planos.length + 1}`, letra, descricao: partes.join(' · ') || 'Plano', lente: texto(b.lente, 40), fps: Number.isFinite(b.fps) && b.fps > 0 && b.fps <= 1000 ? b.fps : null })
      letra = proximoPlano(letra)
      if (planos.length >= 200) break
    }
    const numero = Number.isInteger(c?.numero) && c.numero > 0 ? c.numero : i + 1
    return { id: texto(c?.id, 60) || `c${numero}`, numero, titulo: texto(c?.titulo, 80) || `Cena ${numero}`, cabecalho: texto(c?.cabecalho, 120), planos }
  })
  return {
    titulo: texto(d.origem.titulo, 80) || 'Roteiro',
    roteiroId: texto(d.origem.roteiro_id, 60),
    versao: Number.isInteger(d.origem.versao) ? d.origem.versao : null,
    formato: texto(d.formato, 10),
    cenas,
  }
}

/** Onde a claquete está no roteiro: { cena, plano } (null quando a cena/plano da claquete não estão no roteiro). */
export function posicao(roteiro, claquete) {
  const cena = roteiro?.cenas.find((c) => String(c.numero) === String(claquete.cena)) || null
  const plano = cena?.planos.find((p) => p.letra === String(claquete.plano).toUpperCase()) || null
  return { cena, plano }
}

/** O plano seguinte no roteiro (pula para a próxima cena no fim da lista). null no último plano. */
export function seguinte(roteiro, claquete) {
  const i = roteiro.cenas.findIndex((c) => String(c.numero) === String(claquete.cena))
  if (i < 0) return roteiro.cenas[0]?.planos[0] ? { cena: String(roteiro.cenas[0].numero), plano: roteiro.cenas[0].planos[0].letra } : null
  const cena = roteiro.cenas[i]
  const j = cena.planos.findIndex((p) => p.letra === String(claquete.plano).toUpperCase())
  if (j >= 0 && j + 1 < cena.planos.length) return { cena: String(cena.numero), plano: cena.planos[j + 1].letra }
  for (let k = i + 1; k < roteiro.cenas.length; k++) if (roteiro.cenas[k].planos.length) return { cena: String(roteiro.cenas[k].numero), plano: roteiro.cenas[k].planos[0].letra }
  return null
}

/** O que vai no sidecar: o elo de volta para o Maestro. */
export function eloDoClipe(roteiro, claquete) {
  if (!roteiro) return null
  const { cena, plano } = posicao(roteiro, claquete)
  return { contrato: CONTRATO_ROTEIRO, roteiro_id: roteiro.roteiroId, versao: roteiro.versao, cena_id: cena?.id || null, plano_id: plano?.id || null }
}
