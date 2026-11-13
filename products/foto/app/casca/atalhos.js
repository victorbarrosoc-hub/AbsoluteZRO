// Atalhos de teclado da tela ativa. A tecla só vale quando a pessoa não está digitando nem dentro de uma folha ou de
// um menu; espaço e Enter ficam com o botão que tem o foco.

import { useLayoutEffect, useRef } from '../preact.js'

const DIGITA = 'input:not([type="range"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable=""], [contenteditable="true"]'
const ATIVA = 'button, a[href], summary, input, select, textarea'

/** A tecla deve ser ignorada pelos atalhos da tela? */
export function teclaDeOutro(e) {
  if (e.defaultPrevented || e.isComposing) return true
  const alvo = e.target
  if (!(alvo instanceof Element)) return false
  if (alvo.closest(DIGITA) || alvo.closest('dialog[open]') || alvo.closest('[role="menu"]')) return true
  if ((e.key === ' ' || e.key === 'Enter') && alvo.closest(ATIVA)) return true
  return false
}

/**
 * Liga `tratar(evento)` ao teclado da janela enquanto `ativa`. `tratar` sempre vê o estado mais novo, e `ativa` vale
 * a partir do próprio desenho (não espera o efeito): quem digita rápido não perde tecla na troca de tela.
 */
export function usarAtalhos(ativa, tratar) {
  const ref = useRef(null)
  ref.current = ativa ? tratar : null
  // efeito de layout: o ouvinte entra junto com a tela, antes da próxima tecla
  useLayoutEffect(() => {
    const ouvir = (e) => ref.current && !teclaDeOutro(e) && ref.current(e)
    addEventListener('keydown', ouvir)
    return () => {
      ref.current = null
      removeEventListener('keydown', ouvir)
    }
  }, [])
}

/** Roda `f` uma vez, no primeiro gesto da pessoa (o que vem de fora não disputa a abertura do app). */
export function noPrimeiroGesto(f) {
  const tipos = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel']
  let feito = false
  const rodar = () => {
    if (feito) return
    feito = true
    for (const t of tipos) removeEventListener(t, rodar, true)
    f()
  }
  for (const t of tipos) addEventListener(t, rodar, { capture: true, passive: true })
  return rodar
}
