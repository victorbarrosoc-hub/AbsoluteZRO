'use client'
/**
 * Números do ecossistema: cada valor conta do zero quando aparece na tela, uma vez só. O texto é trocado direto no
 * elemento (sem re-renderizar o React por quadro). Sem JavaScript ou com "reduzir movimento", mostra o valor final.
 */
import { useEffect, useRef } from 'react'

export type Numero = { valor: number; rotulo: string; dica?: string }

const DURACAO = 1400

export function Numeros({ itens }: { itens: Numero[] }) {
  const ref = useRef<HTMLDListElement>(null)
  useEffect(() => {
    const lista = ref.current
    if (!lista || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const alvos = [...lista.querySelectorAll<HTMLElement>('[data-valor]')]
    for (const el of alvos) el.textContent = '0'
    let raf = 0
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return
        io.disconnect()
        const inicio = performance.now()
        const quadro = (agora: number) => {
          const t = Math.min(1, (agora - inicio) / DURACAO)
          const k = 1 - Math.pow(1 - t, 3)
          for (const el of alvos) el.textContent = String(Math.round(Number(el.dataset.valor) * k))
          if (t < 1) raf = requestAnimationFrame(quadro)
        }
        raf = requestAnimationFrame(quadro)
      },
      { rootMargin: '0px 0px -15% 0px' },
    )
    io.observe(lista)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
      for (const el of alvos) el.textContent = el.dataset.valor ?? ''
    }
  }, [])
  return (
    <dl ref={ref} className="pnum__lista">
      {itens.map((n) => (
        <div key={n.rotulo} className="pnum__item" title={n.dica}>
          <dt>{n.rotulo}</dt>
          <dd>
            <span data-valor={n.valor}>{n.valor}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}
