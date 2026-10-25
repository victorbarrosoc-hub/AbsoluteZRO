import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PASSWORD_MIN } from '@zro/auth'
import { Field } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { signupAction } from '@/lib/actions/auth'
import { safeNext } from '@/lib/actions/helpers'
import { getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Criar conta' }

export default async function CriarConta({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next)
  if (await getAuth()) redirect(next ?? '/inicio')
  return (
    <>
      <div className="stack">
        <h1>Criar conta</h1>
        <p className="zro-mute">A conta é gratuita. Ter conta não libera as ferramentas: cada uma depende do plano da organização.</p>
      </div>
      <ActionForm action={signupAction} submit="Criar conta">
        <input type="hidden" name="next" value={next ?? ''} />
        <Field label="Nome" htmlFor="name">
          <input className="zro-input" id="name" name="name" autoComplete="name" required maxLength={120} />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <input className="zro-input" id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Senha" htmlFor="password" hint={`Pelo menos ${PASSWORD_MIN} caracteres.`}>
          <input className="zro-input" id="password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
        </Field>
      </ActionForm>
      <p className="zro-faint">
        Já tem conta? <Link href="/entrar">Entrar</Link>
      </p>
    </>
  )
}
