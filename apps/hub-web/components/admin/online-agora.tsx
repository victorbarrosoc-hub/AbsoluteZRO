'use client'
/**
 * O número grande "online agora" da visão geral. Começa com o valor do servidor e pergunta de novo a cada 15 s
 * (só com a aba visível). A animação do ponto é CSS e some com "reduzir movimento".
 */
import { useEffect, useState } from 'react'

type Online = { total: number; hub: number; apps: number }

const EVERY_MS = 15_000

export function OnlineAgora({ initial }: { initial: Online }) {
  const [n, setN] = useState(initial)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    let alive = true
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const r = await fetch('/admin/online', { cache: 'no-store' })
        if (!r.ok) throw new Error(String(r.status))
        const j = (await r.json()) as Online
        if (alive) {
          setN({ total: j.total, hub: j.hub, apps: j.apps })
          setStale(false)
        }
      } catch {
        if (alive) setStale(true)
      }
    }
    const id = window.setInterval(tick, EVERY_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      alive = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  return (
    <section className="adm-online" aria-labelledby="online-title">
      <p className="adm-online__label" id="online-title">
        <span className={`adm-dot${n.total ? ' adm-dot--live' : ''}`} aria-hidden="true" />
        Online agora
      </p>
      <p className="adm-online__n" aria-live="polite" aria-atomic="true" key={n.total}>
        {n.total.toLocaleString('pt-BR')}
      </p>
      <p className="adm-online__sub" title="Movimento nos últimos 15 minutos: sessão do HUB em uso ou um app aberto renovando o acesso.">
        {n.hub.toLocaleString('pt-BR')} no HUB · {n.apps.toLocaleString('pt-BR')} nos apps{stale ? ' · sem atualizar agora' : ''}
      </p>
    </section>
  )
}
