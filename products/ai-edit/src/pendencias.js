// O balão do dock (como o do SOBEDESCE e o do HUB): quantas coisas em cada página esperam a pessoa. Só estado real
// do projeto aberto, nada de número de fachada:
//
// Mídia:   mídia do projeto sem o arquivo nesta sessão (projeto reaberto no navegador, ou o caminho não abriu no
//          computador). Só a pessoa resolve: escolhendo o arquivo de novo (adicionar() religa pelo nome).
// Revisar: proposta de corte ou zoom ainda pendente (nada entra na edição sem aprovar ou recusar).
// Edição e Entrega não têm o que dependa da pessoa: a exportação grava onde ela mandou, na hora.

import { resumo } from './propostas.js'

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

/**
 * projeto: o projeto aberto (ou null). temArquivo(id): a mídia tem o arquivo nesta sessão.
 * Devolve { midia, revisar, edicao, entrega }, cada um { n, dica } (n = 0 e dica vazia quando nada espera).
 */
export function pendencias(projeto, { temArquivo = () => true } = {}) {
  const nada = { n: 0, dica: '' }
  const out = { midia: nada, revisar: nada, edicao: nada, entrega: nada }
  if (!projeto) return out
  const sem = projeto.midias.filter((m) => !temArquivo(m.id)).length
  if (sem) out.midia = { n: sem, dica: `${plural(sem, 'mídia', 'mídias')} sem o arquivo: escolha de novo` }
  const r = resumo(projeto.propostas || [])
  if (r.pendentes) out.revisar = { n: r.pendentes, dica: `${plural(r.pendentes, 'proposta', 'propostas')} para aprovar ou recusar` }
  return out
}

/** O número do balão: até 99, depois "99+". */
export const rotuloBalao = (n) => (n > 99 ? '99+' : String(n))
