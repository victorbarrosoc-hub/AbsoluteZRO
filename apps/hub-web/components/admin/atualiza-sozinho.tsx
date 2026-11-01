'use client'
/** Pede a página de novo ao servidor a cada `ms` (só com a aba visível), sem piscar: o Next troca só o que mudou. */
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function AtualizaSozinho({ ms = 15_000 }: { ms?: number }) {
  const router = useRouter()
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    const id = window.setInterval(tick, ms)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [router, ms])
  return null
}
