'use client'
import { useState } from 'react'
import { Icon } from './icons'

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="copy-btn"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          window.setTimeout(() => setDone(false), 1600)
        } catch {
          setDone(false)
        }
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={15} />
      <span aria-live="polite">{done ? 'Copiado' : 'Copiar'}</span>
    </button>
  )
}
