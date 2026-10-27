import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Field, Notice } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { GoogleButton } from '@/components/google-button'
import { loginAction } from '@/lib/actions/auth'
import { safeNext } from '@/lib/actions/helpers'
import { getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Entrar' }

const GOOGLE_ERRORS: Record<string, string> = {
  google: 'Não deu para entrar com o Google. Tente de novo.',
  google_cancelado: 'Entrada com o Google cancelada.',
  google_email: 'Seu e-mail no Google ainda não está confirmado.',
  suspensa: 'Esta conta está suspensa. Fale com o suporte.',
}

export default async function Entrar({ searchParams }: { searchParams: Promise<{ next?: string; senha?: string; erro?: string }> }) {
  const sp = await searchParams
  const next = safeNext(sp.next)
  if (await getAuth()) redirect(next ?? '/inicio')
  return (
    <>
      <div className="stack">
        <h1>Entrar</h1>
        <p className="zro-mute">Uma conta para entrar no HUB e em todas as ferramentas liberadas para você.</p>
      </div>
      {sp.senha === 'nova' && <Notice tone="ok" title="Senha criada. Entre com ela." />}
      {sp.erro && <Notice tone="danger" title={GOOGLE_ERRORS[sp.erro] ?? GOOGLE_ERRORS.google!} />}
      <GoogleButton next={next} />
      <ActionForm action={loginAction} submit="Entrar">
        <input type="hidden" name="next" value={next ?? ''} />
        <Field label="E-mail" htmlFor="email">
          <input className="zro-input" id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Senha" htmlFor="password">
          <input className="zro-input" id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
      </ActionForm>
      <div className="row row--between zro-faint">
        <Link href="/esqueci-a-senha">Esqueci a senha</Link>
        <Link href={next ? `/criar-conta?next=${encodeURIComponent(next)}` : '/criar-conta'}>Criar conta</Link>
      </div>
      <p className="zro-faint">A mesma conta entra em todas as ferramentas da Absolute ZRO.</p>
    </>
  )
}
