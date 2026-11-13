// View Transitions com propósito: a aba troca só o painel (o topo e o dock ficam parados) e a miniatura cresce até o
// palco. Sem a API, ou com "reduzir movimento", a mudança acontece na hora. O CSS das trocas está em app/foto.css.

import { reduzirMovimento } from '../preact.js'

/** O Preact desenha num microtask: uma volta de relógio garante o DOM novo antes da foto de depois. */
const desenhou = () => new Promise((ok) => setTimeout(ok, 0))

/**
 * Roda `mudar()` dentro de uma View Transition. `sentido`: 'frente' | 'volta' (o painel desliza) ou 'fica' (só
 * esmaece, para abrir e fechar a foto grande). Devolve quando a animação terminou.
 */
export async function comTransicao(mudar, { sentido = 'frente' } = {}) {
  if (typeof document.startViewTransition !== 'function' || reduzirMovimento()) {
    await mudar()
    return
  }
  const raiz = document.documentElement
  raiz.dataset.sentido = sentido
  try {
    const vt = document.startViewTransition(async () => {
      await mudar()
      await desenhou()
    })
    // outra troca começou por cima desta: a animação é pulada (o DOM já mudou) e isso não é erro
    vt.ready.catch(() => {})
    await vt.finished
  } catch {
    // a troca foi pulada (outra começou, a aba ficou escondida): o DOM já está no estado novo
  } finally {
    if (raiz.dataset.sentido === sentido) delete raiz.dataset.sentido
  }
}

/**
 * Faz um elemento ser a "mesma coisa" antes e depois (a miniatura que vira a foto grande): dá o nome `foto` a ele
 * só durante a troca. Devolve a função que tira.
 */
export function nomearFoto(el) {
  if (!el) return () => {}
  el.style.viewTransitionName = 'foto'
  return () => (el.style.viewTransitionName = '')
}
