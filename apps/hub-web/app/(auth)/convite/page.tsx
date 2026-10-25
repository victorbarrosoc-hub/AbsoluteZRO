import type { Metadata } from 'next'
import Link from 'next/link'
import { Notice } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { acceptInviteAction } from '@/lib/actions/org'
import { getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Convite' }

export default async function Convite({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams
  const auth = await getAuth()
  const back = `/convite?token=${encodeURIComponent(token)}`
  return (
    <>
      <div className="stack">
        <h1>Convite para uma equipe</h1>
        <p className="zro-mute">Entre com o mesmo e-mail que recebeu o convite.</p>
      </div>
      {!auth ? (
        <div className="row">
          <Link className="zro-btn zro-btn--primary" href={`/entrar?next=${encodeURIComponent(back)}`}>
            Entrar
          </Link>
          <Link className="zro-btn zro-btn--ghost" href="/criar-conta">
            Criar conta
          </Link>
        </div>
      ) : !auth.user.emailVerified ? (
        <Notice tone="warn" title="Confirme seu e-mail primeiro">
          Por segurança, só contas com e-mail confirmado aceitam convites. Veja o link em Perfil e segurança.
        </Notice>
      ) : (
        <ActionForm action={acceptInviteAction} submit="Aceitar convite">
          <input type="hidden" name="token" value={token} />
          <p className="zro-faint">Entrando como {auth.user.email}.</p>
        </ActionForm>
      )}
    </>
  )
}
