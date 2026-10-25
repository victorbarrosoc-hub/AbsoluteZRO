import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Field, Notice } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { loginAction } from '@/lib/actions/auth'
import { getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Entrar' }

export default async function Entrar({ searchParams }: { searchParams: Promise<{ next?: string; senha?: string }> }) {
  if (await getAuth()) redirect('/inicio')
  const sp = await searchParams
  return (
    <>
      <div className="stack">
        <h1>Entrar</h1>
        <p className="zro-mute">Um login para todas as ferramentas que a sua organização contratou.</p>
      </div>
      {sp.senha === 'nova' && <Notice tone="ok" title="Senha criada. Entre com ela." />}
      <ActionForm action={loginAction} submit="Entrar">
        <input type="hidden" name="next" value={sp.next ?? ''} />
        <Field label="E-mail" htmlFor="email">
          <input className="zro-input" id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Senha" htmlFor="password">
          <input className="zro-input" id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
      </ActionForm>
      <div className="row row--between zro-faint">
        <Link href="/esqueci-a-senha">Esqueci a senha</Link>
        <Link href="/criar-conta">Criar conta</Link>
      </div>
      <p className="zro-faint">Os apps de cada marca (SOBEDESCE, Synquei, NOSSOM…) ainda têm login próprio. O login único vale para o HUB.</p>
    </>
  )
}
