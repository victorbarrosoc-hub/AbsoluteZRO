'use client'
/**
 * Inclinação e brilho que seguem o ponteiro (como os cartões da apple.com). Um ouvinte só no contêiner; escreve
 * variáveis CSS (--rx, --ry, --mx, --my) direto no elemento sob o ponteiro, no máximo uma vez por quadro, sem
 * estado no React. Só com mouse ou caneta; com "reduzir movimento" não faz nada.
 */
import { useEffect, useRef, type ReactNode } from 'react'

export function PointerTilt({
  children,
  className,
  selector,
  max = 6,
}: {
  children: ReactNode
  className?: string
  /** Elementos que inclinam; sem seletor, o próprio contêiner. */
  selector?: string
  /** Inclinação máxima em graus. */
  max?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let last: PointerEvent | null = null
    let active: HTMLElement | null = null
    const reset = (el: HTMLElement | null) => {
      if (!el) return
      el.style.removeProperty('--rx')
      el.style.removeProperty('--ry')
      el.removeAttribute('data-tilt')
    }
    const paint = () => {
      frame = 0
      const e = last
      if (!e) return
      const target = (selector ? (e.target as Element | null)?.closest<HTMLElement>(selector) : root) ?? null
      if (target !== active) {
        reset(active)
        active = target && root.contains(target) ? target : null
      }
      if (!active) return
      const r = active.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width
      const y = (e.clientY - r.top) / r.height
      active.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
      active.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
      active.style.setProperty('--ry', `${((x - 0.5) * 2 * max).toFixed(2)}deg`)
      active.style.setProperty('--rx', `${((0.5 - y) * 2 * max).toFixed(2)}deg`)
      active.setAttribute('data-tilt', 'on')
    }
    const move = (e: PointerEvent) => {
      if (!fine.matches || still.matches || e.pointerType === 'touch') return
      last = e
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const leave = () => {
      last = null
      reset(active)
      active = null
    }
    root.addEventListener('pointermove', move)
    root.addEventListener('pointerleave', leave)
    return () => {
      root.removeEventListener('pointermove', move)
      root.removeEventListener('pointerleave', leave)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [selector, max])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
