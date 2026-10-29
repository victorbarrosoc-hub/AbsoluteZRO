'use client'
/**
 * Número que sobe até o valor na entrada (como os números da apple.com). O HTML já chega com o valor final (sem
 * JavaScript e com "reduzir movimento", é só o número); a contagem mexe no texto do elemento direto, sem renderizar o
 * React a cada quadro.
 */
import { useEffect, useRef } from 'react'

const SIMBOLO = { USD: 'US$', BRL: 'R$' } as const

export function fmtInteiro(v: number, moeda: 'USD' | 'BRL') {
  return `${SIMBOLO[moeda]} ${Math.round(v).toLocaleString('pt-BR')}`
}

export function ContaAte({ valor, moeda, duracao = 1100 }: { valor: number; moeda: 'USD' | 'BRL'; duracao?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || valor <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const inicio = performance.now()
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / duracao)
      const suave = 1 - Math.pow(1 - t, 3)
      el.textContent = fmtInteiro(valor * suave, moeda)
      if (t < 1) raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => {
      cancelAnimationFrame(raf)
      el.textContent = fmtInteiro(valor, moeda)
    }
  }, [valor, moeda, duracao])
  return (
    <span ref={ref} className="cst-num">
      {fmtInteiro(valor, moeda)}
    </span>
  )
}
