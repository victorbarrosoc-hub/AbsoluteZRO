'use client'
/**
 * Folha (sheet) do console: <dialog> nativo em modal. Esc e o fundo fecham; o foco fica preso dentro de graça. No
 * celular sobe de baixo; no computador aparece no centro. A entrada é CSS (@starting-style) e some com "reduzir
 * movimento".
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from '../../icons'

export function Folha({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className="cst-folha"
      aria-labelledby="cst-folha-titulo"
      onClose={onFechar}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
    >
      <div className="cst-folha__corpo">
        <header className="cst-folha__topo">
          <h2 id="cst-folha-titulo">{titulo}</h2>
          <button type="button" className="cst-folha__fechar" aria-label="Fechar" onClick={() => ref.current?.close()}>
            <Icon name="plus" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
