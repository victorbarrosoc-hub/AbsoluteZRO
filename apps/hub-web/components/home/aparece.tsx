'use client'
/**
 * Segura as animações CSS de dentro até o bloco aparecer na tela e então as solta, uma vez só. Sem JavaScript, elas
 * correm ao carregar (nada fica travado no meio). Usado no símbolo do fim da página inicial, que antes andava com a
 * rolagem e parava no meio quando a página acabava antes da animação.
 */
import { useEffect, useRef, type ReactNode } from 'react'

export function Aparece({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.setAttribute('data-espera', '')
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return
        el.removeAttribute('data-espera')
        io.disconnect()
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
