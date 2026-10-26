import type { Metadata } from 'next'
import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { confirmEmailChangeAction } from '@/lib/actions/account'

export const metadata: Metadata = { title: 'Confirmar novo e-mail' }

/** Como em Confirmar e-mail: um POST, para pré-visualizadores de link não trocarem o e-mail por engano. */
export default async function TrocarEmail({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams
  return (
    <>
      <div className="stack">
        <h1>Novo e-mail</h1>
        <p className="zro-mute">Confirme para a conta passar a usar este endereço.</p>
      </div>
      <ActionForm action={confirmEmailChangeAction} submit="Usar este e-mail">
        <input type="hidden" name="token" value={token} />
      </ActionForm>
      <Link className="zro-faint" href="/perfil/seguranca">
        Ir para a conta
      </Link>
    </>
  )
}
