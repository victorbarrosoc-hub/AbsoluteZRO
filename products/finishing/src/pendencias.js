// Revela · o balão das abas (como o do SOBEDESCE e o do HUB): quantas coisas em cada ferramenta esperam a pessoa.
// Só estado real da tela, nada de número de fachada. LUT e Entrega não têm o que dependa da pessoa: a LUT baixa na
// hora, e os avisos da Entrega são do destino (fixos), não uma decisão pendente.
//
// CST:       câmera do relatório do Synquei sem log escolhido, que a pessoa ainda não conferiu (a própria tela pede
//            "Confira o log de cada câmera"). Escolher qualquer opção no seletor, até "Sem log", conta como decidido.
// Converter: vídeo lido e na fila esperando o botão Converter (fora de uma conversão em andamento), e vídeo
//            convertido na memória com o Baixar ainda não usado. Salvo direto na pasta não espera nada.

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
const juntar = (partes) => partes.filter(Boolean).join(' · ')

/** aparelhos: [{ entrada, decidido? }] da tela de CST. */
export function pendenciasCst(aparelhos = []) {
  const n = aparelhos.filter((a) => !a.entrada && !a.decidido).length
  return { n, dica: n ? `${plural(n, 'câmera', 'câmeras')} sem log escolhido` : '' }
}

/** fila: [{ estado, url?, baixado? }] do conversor; rodando: a conversão da fila está em andamento. */
export function pendenciasConverter(fila = [], { rodando = false } = {}) {
  const naFila = rodando ? 0 : fila.filter((i) => i.estado === 'pronto').length
  const paraBaixar = fila.filter((i) => i.estado === 'feito' && i.url && !i.baixado).length
  return {
    n: naFila + paraBaixar,
    dica: juntar([naFila && `${plural(naFila, 'vídeo', 'vídeos')} esperando Converter`, paraBaixar && `${plural(paraBaixar, 'vídeo pronto', 'vídeos prontos')} para baixar`]),
  }
}

/** O número do balão: até 99, depois "99+". */
export const rotuloBalao = (n) => (n > 99 ? '99+' : String(n))
