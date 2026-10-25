import type { Metadata } from 'next'
import Link from 'next/link'
import { Field } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { forgotAction } from '@/lib/actions/auth'

export const metadata: Metadata = { title: 'Esqueci a senha' }

export default function Esqueci() {
  return (
    <>
      <div className="stack">
        <h1>Nova senha</h1>
        <p className="zro-mute">Mandamos um link para o seu e-mail. Ele vale por uma hora.</p>
      </div>
      <ActionForm action={forgotAction} submit="Enviar link">
        <Field label="E-mail" htmlFor="email">
          <input className="zro-input" id="email" name="email" type="email" autoComplete="email" required />
        </Field>
      </ActionForm>
      <Link className="zro-faint" href="/entrar">
        Voltar para entrar
      </Link>
    </>
  )
}
