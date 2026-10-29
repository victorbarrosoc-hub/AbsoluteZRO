'use client'
/**
 * Pedaços com estado da tela /conexoes (ADR 0026): formulário que salva ao mudar (agendas e apps), sem botão quando
 * há JavaScript, e o "Desconectar" em dois toques. Sem JavaScript, os formulários postam com o botão de sempre.
 */
import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import type { FormState } from './action-form'

type Acao = (prev: FormState, data: FormData) => Promise<FormState>

export function FormAuto({ action, children, className, rotulo }: { action: Acao; children: ReactNode; className?: string; rotulo: string }) {
  const [state, formAction] = useActionState(action, null)
  const ref = useRef<HTMLFormElement>(null)
  const [js, setJs] = useState(false)
  useEffect(() => setJs(true), [])
  return (
    <form ref={ref} action={formAction} className={className} onChange={() => ref.current?.requestSubmit()} aria-label={rotulo}>
      {children}
      <Estado state={state} js={js} />
    </form>
  )
}

function Estado({ state, js }: { state: FormState; js: boolean }) {
  const { pending } = useFormStatus()
  return (
    <div className="conexao__estado-form" aria-live="polite">
      {!js && (
        <button type="submit" className="glass-btn">
          Salvar
        </button>
      )}
      {pending ? (
        <span className="zro-faint">Salvando…</span>
      ) : state?.error ? (
        <span className="zro-field__error" role="alert">
          {state.error}
        </span>
      ) : state?.ok ? (
        <span className="zro-faint">{state.ok}</span>
      ) : null}
    </div>
  )
}

export function Desconectar({ action, conta }: { action: Acao; conta: string }) {
  const [state, formAction] = useActionState(action, null)
  const [certeza, setCerteza] = useState(false)
  if (!certeza)
    return (
      <button type="button" className="glass-btn" onClick={() => setCerteza(true)}>
        Desconectar
      </button>
    )
  return (
    <form action={formAction} className="conexao__desconectar" aria-label="Confirmar desconexão">
      <span className="zro-mute" title={`Os apps deixam de ver a agenda de ${conta}. O acesso é revogado no Google.`}>
        Os apps deixam de ver sua agenda.
      </span>
      <span className="row">
        <button type="button" className="glass-btn" onClick={() => setCerteza(false)}>
          Cancelar
        </button>
        <BotaoDesconectar />
      </span>
      {state?.error && (
        <span className="zro-field__error" role="alert">
          {state.error}
        </span>
      )}
    </form>
  )
}

function BotaoDesconectar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="glass-btn glass-btn--ink" disabled={pending} aria-busy={pending}>
      {pending ? 'Desconectando…' : 'Desconectar'}
    </button>
  )
}
