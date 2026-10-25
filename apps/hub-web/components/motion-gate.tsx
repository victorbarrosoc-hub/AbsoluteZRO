'use client'
/**
 * Pausa as animações CSS de um bloco quando ele sai da tela ou a aba fica oculta. Não anima nada por conta
 * própria e não re-renderiza por frame: só troca um atributo. "Reduzir movimento" é tratado no CSS.
 */
import { useEffect, useRef, type ReactNode } from 'react'

export function MotionGate({ children, className, as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let visible = true
    const apply = () => el.setAttribute('data-motion', visible && !document.hidden ? 'on' : 'off')
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting
      apply()
    })
    io.observe(el)
    document.addEventListener('visibilitychange', apply)
    apply()
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', apply)
    }
  }, [])
  return (
    <Tag ref={ref} className={className} data-motion="on">
      {children}
    </Tag>
  )
}
