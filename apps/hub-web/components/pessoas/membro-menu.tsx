'use client'
/**
 * Equipe: as ações de cada pessoa num menu só (pedido do titular, 29/10/2026). O botão "•••" abre o papel (marcado o
 * atual) e "Remover da equipe…", que pede confirmação numa folha. Teclado: setas, Esc e Tab; foco volta ao botão.
 * Quem pode mudar o quê o servidor decide de novo (changeMemberRole/removeMember, RLS).
 */
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from 'react'
import type { FormState } from '../action-form'
import { Icon } from '../icons'

type Papel = { valor: string; nome: string }

export function MembroMenu({
  userId,
  nome,
  papel,
  papeis,
  mudarPapel,
  remover,
}: {
  userId: string
  nome: string
  papel: string
  papeis: Papel[]
  mudarPapel: (prev: FormState, fd: FormData) => Promise<FormState>
  remover: (prev: FormState, fd: FormData) => Promise<FormState>
}) {
  const [aberto, setAberto] = useState(false)
  const [msg, setMsg] = useState<FormState>(null)
  const [pendente, start] = useTransition()
  const raiz = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  const folha = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('pointerdown', fora)
    lista.current?.querySelector<HTMLElement>('[aria-checked="true"], [role^="menuitem"]')?.focus()
    return () => document.removeEventListener('pointerdown', fora)
  }, [aberto])

  function fechar() {
    setAberto(false)
    botao.current?.focus()
  }

  function teclas(e: KeyboardEvent) {
    const itens = [...(lista.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])]
    const i = itens.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      fechar()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = itens.length
      itens[(i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      itens[e.key === 'Home' ? 0 : itens.length - 1]?.focus()
    } else if (e.key === 'Tab') setAberto(false)
  }

  function escolher(valor: string) {
    fechar()
    if (valor === papel) return
    const fd = new FormData()
    fd.set('userId', userId)
    fd.set('role', valor)
    start(async () => setMsg(await mudarPapel(null, fd)))
  }

  function confirmarRemocao() {
    const fd = new FormData()
    fd.set('userId', userId)
    start(async () => {
      const r = await remover(null, fd)
      setMsg(r)
      folha.current?.close()
    })
  }

  return (
    <div className="pmenu" ref={raiz}>
      <button
        ref={botao}
        type="button"
        className="pmenu__botao"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? `${id}-menu` : undefined}
        aria-label={`Ações para ${nome}`}
        title="Ações"
        disabled={pendente}
        onClick={() => setAberto((a) => !a)}
      >
        <Icon name="more" size={20} strokeWidth={3} />
      </button>
      {aberto ? (
        <div ref={lista} id={`${id}-menu`} className="pmenu__lista" role="menu" aria-label={`Ações para ${nome}`} onKeyDown={teclas}>
          <p className="pmenu__titulo" role="presentation">
            Papel
          </p>
          {papeis.map((p) => (
            <button
              key={p.valor}
              type="button"
              role="menuitemradio"
              aria-checked={p.valor === papel}
              tabIndex={-1}
              className="pmenu__item"
              onClick={() => escolher(p.valor)}
            >
              <span className="pmenu__marca">{p.valor === papel ? <Icon name="check" size={16} /> : null}</span>
              {p.nome}
            </button>
          ))}
          <div className="pmenu__sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="pmenu__item pmenu__item--perigo"
            onClick={() => {
              setAberto(false)
              folha.current?.showModal()
            }}
          >
            <span className="pmenu__marca" />
            Remover da equipe…
          </button>
        </div>
      ) : null}
      <dialog ref={folha} className="pconfirma" aria-labelledby={`${id}-titulo`} onClose={() => botao.current?.focus()}>
        <h2 id={`${id}-titulo`}>Remover {nome}?</h2>
        <p>Sai da organização e perde o acesso aos projetos dela. Dá para convidar de novo depois.</p>
        <div className="pconfirma__acoes">
          <button type="button" className="zro-btn" onClick={() => folha.current?.close()} autoFocus>
            Cancelar
          </button>
          <button type="button" className="zro-btn pconfirma__remover" onClick={confirmarRemocao} disabled={pendente}>
            Remover
          </button>
        </div>
      </dialog>
      <span className="zro-sr-only" role="status" aria-live="polite">
        {msg?.ok ?? ''}
      </span>
      {msg?.error ? (
        <p className="zro-field__error pmenu__erro" role="alert">
          {msg.error}
        </p>
      ) : null}
    </div>
  )
}
