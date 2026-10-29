import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PASSWORD_MIN } from '@zro/auth'
import { ConversaConta } from '@/components/conversa-conta'
import { GoogleButton } from '@/components/google-button'
import { signupAction } from '@/lib/actions/auth'
import { respondendoAcao, safeNext } from '@/lib/actions/helpers'
import { getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Criar conta' }

/** Criar conta como conversa: e-mail, nome, senha, pronto (components/conversa-conta.tsx). */
export default async function CriarConta({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next)
  if ((await getAuth()) && !(await respondendoAcao())) redirect(next ?? '/inicio')
  return (
    <ConversaConta
      modo="criar"
      action={signupAction}
      next={next}
      senhaMin={PASSWORD_MIN}
      google={<GoogleButton next={next} variant="pilula" />}
      rodape={
        <>
          Já tem conta? <Link href={next ? `/entrar?next=${encodeURIComponent(next)}` : '/entrar'}>Entrar</Link>
        </>
      }
    />
  )
}
