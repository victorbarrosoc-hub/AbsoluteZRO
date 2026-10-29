'use client'
/**
 * "Renova em 4 dias e 6 h", como no Claude e no Higgsfield: conta até a próxima renovação e se atualiza a cada 30 s
 * (só o texto; nada de re-render por quadro). A data exata, no horário de Brasília, fica na dica.
 */
import { useEffect, useState } from 'react'

const BR = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export function falta(ate: number, agora: number): string {
  const ms = ate - agora
  if (ms <= 0) return 'Renovando agora'
  const min = Math.floor(ms / 60_000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return `Renova em ${d} ${d === 1 ? 'dia' : 'dias'}${h ? ` e ${h} h` : ''}`
  if (h > 0) return `Renova em ${h} h${m ? ` e ${m} min` : ''}`
  return `Renova em ${Math.max(1, m)} min`
}

export function Contagem({ ate, className }: { ate: string; className?: string }) {
  const alvo = new Date(ate).getTime()
  const [agora, setAgora] = useState<number | null>(null)
  useEffect(() => {
    setAgora(Date.now())
    const t = setInterval(() => setAgora(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return (
    <time className={className} dateTime={ate} title={BR.format(alvo)}>
      {agora === null ? `Renova em ${BR.format(alvo)}` : falta(alvo, agora)}
    </time>
  )
}
