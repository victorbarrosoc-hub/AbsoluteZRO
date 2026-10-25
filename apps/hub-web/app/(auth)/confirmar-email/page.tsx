import type { Metadata } from 'next'
import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { verifyEmailAction } from '@/lib/actions/auth'

export const metadata: Metadata = { title: 'Confirmar e-mail' }

/** A confirmação é um POST (botão), não um GET: pré-visualizadores de link não confirmam por engano. */
export default async function Confirmar({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams
  return (
    <>
      <div className="stack">
        <h1>Confirmar e-mail</h1>
        <p className="zro-mute">Um toque e pronto.</p>
      </div>
      <ActionForm action={verifyEmailAction} submit="Confirmar meu e-mail">
        <input type="hidden" name="token" value={token} />
      </ActionForm>
      <Link className="zro-faint" href="/inicio">
        Ir para o HUB
      </Link>
    </>
  )
}
