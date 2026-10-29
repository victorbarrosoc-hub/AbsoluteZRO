// Aba de entrada do app do celular (decisão do titular, 28/10/2026): "a Z continua como aba, mas o app abre na tarefa
// quando há algo em andamento". Sem link no endereço o app abre na Z (lib/state.js → savedTab); se, logo ao abrir, o
// retrato dos computadores (lib/computador.js) mostrar uma transferência andando, vai para Início, onde o cartão do
// computador mostra o andamento. Só uma vez, só nos primeiros segundos e só se a pessoa ainda não mexeu: depois, a
// tela nunca pula sozinha. Link com # (#referencias, #drive/<id>, #computador...) é respeitado sempre.
// Sem dependências: o teste roda no Node (products/sobedesce/test/entrada-celular.test.js).

const ATIVOS = new Set(['enviando', 'baixando'])
/** Depois disso o retrato chegou tarde: a pessoa já está lendo a Z, não troca. */
export const JANELA_MS = 8000

/** Algum computador da conta está transferindo agora (ligado e enviando ou baixando)? */
export function computadorTransferindo(pc) {
  return (pc?.computadores ?? []).some((c) => c?.online && ATIVOS.has(c.snapshot?.estado))
}

/**
 * Vigia a entrada: chame logo depois de definir a aba inicial. Devolve a função que para de vigiar.
 * @param {{ getState: () => object, setState: (p: object) => void, subscribe: (fn: Function) => Function, agora?: () => number, janelaMs?: number }} o
 */
export function vigiarEntrada({ getState, setState, subscribe, agora = Date.now, janelaMs = JANELA_MS }) {
  const inicio = agora()
  if (getState().tab !== 'z') return () => {}
  let parar = () => {}
  let feito = false
  const ver = (s) => {
    if (feito) return
    // A pessoa trocou de aba, abriu uma folha ou o tempo passou: não mexe mais.
    if (s.tab !== 'z' || s.sheet || agora() - inicio > janelaMs) return encerrar()
    if (s.pc?.status !== 'ok') return
    if (computadorTransferindo(s.pc)) setState({ tab: 'send' })
    encerrar()
  }
  function encerrar() {
    feito = true
    parar()
  }
  parar = subscribe(ver)
  ver(getState())
  return encerrar
}
