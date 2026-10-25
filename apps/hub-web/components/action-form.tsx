'use client'
/**
 * Formulário ligado a uma Server Action, com estado de envio, mensagem de erro/sucesso e link de
 * desenvolvimento (quando não há provedor de e-mail). Funciona sem JavaScript: o form posta normalmente.
 */
import { useActionState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

export type FormState = { error?: string; ok?: string; devLink?: string; data?: unknown } | null

export function ActionForm({
  action,
  children,
  submit,
  className = 'zro-form',
  variant = 'primary',
  inlineSubmit = false,
  showData = false,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  children: ReactNode
  submit: string
  className?: string
  variant?: 'primary' | 'accent' | 'ghost' | 'danger'
  inlineSubmit?: boolean
  /** Mostra o retorno da ação: lista de avisos ({level, message}) ou JSON. */
  showData?: boolean
}) {
  const [state, formAction] = useActionState(action, null)
  return (
    <form action={formAction} className={className}>
      {children}
      <div className={inlineSubmit ? 'row' : 'stack'}>
        <Submit label={submit} variant={variant} />
        {state?.error && (
          <p className="zro-field__error" role="alert">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p role="status" className="zro-mute">
            {state.ok}
          </p>
        )}
        {state?.devLink && (
          <p className="zro-faint">
            Link de desenvolvimento (sem provedor de e-mail): <a href={state.devLink}>{state.devLink}</a>
          </p>
        )}
        {showData && state?.data != null && <DataView data={state.data} />}
      </div>
    </form>
  )
}

function Submit({ label, variant }: { label: string; variant: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={`zro-btn zro-btn--${variant}`} disabled={pending} aria-busy={pending}>
      {pending ? 'Enviando…' : label}
    </button>
  )
}

function DataView({ data }: { data: unknown }) {
  if (Array.isArray(data) && data.every((d) => d && typeof d === 'object' && 'message' in d)) {
    if (!data.length) return <p className="zro-faint">Nenhum aviso.</p>
    return (
      <ul className="list-plain">
        {(data as { level?: string; message: string }[]).map((d, i) => (
          <li key={i} className={d.level === 'error' ? 'zro-field__error' : 'zro-mute'}>
            {d.level === 'error' ? 'Erro: ' : 'Aviso: '}
            {d.message}
          </li>
        ))}
      </ul>
    )
  }
  return <pre className="json">{JSON.stringify(data, null, 2)}</pre>
}
