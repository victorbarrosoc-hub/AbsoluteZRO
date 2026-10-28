// "Preparar no Synquei" no lote de download (src/engine/preparo-synquei.js): o que a tela mostra a partir de
// batch.synquei. Sem interface (dá para testar no Node). Regra: "preparado" só com o recibo do Synquei.

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
export const SYNQUEI_ATUALIZAR = 'https://absolutezro.com/baixar'

/**
 * @param {object|null|undefined} sq batch.synquei
 * @param {{ terminado: boolean }} o o lote terminou (nada baixando, na fila ou conferindo)
 * @returns {null | { fase: string, texto: string|null, detalhe: string|null, tom: 'ok'|'warn'|'quiet', botao: boolean, atualizar?: boolean }}
 *   fase: pronto | aguardando | preparando | preparado | pendencias | erro | sem_resposta | sem_acesso
 */
export function estadoPreparo(sq, { terminado }) {
  // nunca com arquivo baixando, e só com o manifesto gravado pelo motor
  if (!terminado || !sq || !sq.op || sq.indisponivel) return null
  const conferencia = sq.semConferencia ? `${sq.conferidos} de ${sq.total} conferidos (MD5) · ${sq.semConferencia} sem conferência` : `${plural(sq.total, 'arquivo conferido', 'arquivos conferidos')} (MD5)`
  if (sq.acesso === 'sem_pasta' || sq.acesso === 'sem_permissao') {
    return { fase: 'sem_acesso', texto: 'Pasta inacessível', detalhe: sq.acesso === 'sem_permissao' ? 'Sem permissão para ler a pasta baixada.' : 'A pasta baixada sumiu, foi movida ou o disco foi desconectado.', tom: 'warn', botao: true }
  }
  if (!sq.pedidoEm) return { fase: 'pronto', texto: null, detalhe: conferencia, tom: 'quiet', botao: true }
  const pedido = Date.parse(sq.pedidoEm)
  const r = sq.recibo && Date.parse(sq.recibo.quando) >= pedido - 2000 ? sq.recibo : null
  if (r) {
    const res = r.resultado || {}
    if (r.estado === 'recebido' || r.estado === 'preparando') return { fase: 'preparando', texto: 'Preparando no Synquei', detalhe: null, tom: 'quiet', botao: false }
    if (r.estado === 'preparado') {
      const partes = [plural(res.organizados || 0, 'organizado', 'organizados')]
      if (res.sincronizados) partes.push(plural(res.sincronizados, 'sincronizado', 'sincronizados'))
      if (res.ignorados) partes.push(plural(res.ignorados, 'ignorado', 'ignorados'))
      return { fase: 'preparado', texto: 'Preparado no Synquei', detalhe: partes.join(' · '), tom: 'ok', botao: false }
    }
    if (r.estado === 'com_pendencias') {
      const ex = r.exemplos || {}
      const linhas = []
      if (res.ausentes) linhas.push(`${plural(res.ausentes, 'ausente', 'ausentes')}${ex.ausentes?.length ? `: ${ex.ausentes.slice(0, 3).join(', ')}` : ''}`)
      if (res.alterados) linhas.push(`${plural(res.alterados, 'alterado', 'alterados')}${ex.alterados?.length ? `: ${ex.alterados.slice(0, 3).join(', ')}` : ''}`)
      if (res.revisar) linhas.push(`${plural(res.revisar, 'sincronia para revisar', 'sincronias para revisar')} no Synquei`)
      const n = res.pendentes || res.ausentes + res.alterados + res.revisar || 0
      return { fase: 'pendencias', texto: `Preparado · ${plural(n, 'pendência', 'pendências')}`, detalhe: linhas.join(' · ') || null, tom: 'warn', botao: true }
    }
    if (r.estado === 'erro') return { fase: 'erro', texto: 'O Synquei não terminou', detalhe: r.erro || null, tom: 'warn', botao: true }
  }
  if (sq.semResposta) return { fase: 'sem_resposta', texto: 'O Synquei não confirmou', detalhe: 'Atualize o Synquei e tente de novo.', tom: 'warn', botao: true, atualizar: true }
  return { fase: 'aguardando', texto: 'Aguardando o Synquei', detalhe: null, tom: 'quiet', botao: false }
}
