import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ConversaConta } from '@/components/conversa-conta'
import { GoogleButton } from '@/components/google-button'
import { loginAction } from '@/lib/actions/auth'
import { respondendoAcao, safeNext } from '@/lib/actions/helpers'
import { googleErro } from '@/lib/google'
import { getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Entrar', alternates: { canonical: '/entrar' } }

/**
 * Entrar como conversa: e-mail, senha, conferindo, pronto (components/conversa-conta.tsx). `outra=1`: um app pediu
 * prompt=login ("Usar outra conta"); mesmo com sessão aberta, o login aparece, e a sessão antiga sai ao entrar.
 */
export default async function Entrar({ searchParams }: { searchParams: Promise<{ next?: string; senha?: string; erro?: string; outra?: string }> }) {
  const sp = await searchParams
  const next = safeNext(sp.next)
  const outra = sp.outra === '1'
  if (!outra && (await getAuth()) && !(await respondendoAcao())) redirect(next ?? '/inicio')
  return (
    <ConversaConta
      modo="entrar"
      action={loginAction}
      next={next}
      aviso={sp.senha === 'nova' ? 'Senha criada. Entre com ela.' : outra ? 'Qual conta você quer usar?' : undefined}
      erroInicial={googleErro(sp.erro)}
      google={<GoogleButton next={next} variant="pilula" />}
      rodape={
        <>
          Ainda não tem conta? <Link href={next ? `/criar-conta?next=${encodeURIComponent(next)}` : '/criar-conta'}>Criar conta</Link>
        </>
      }
    />
  )
}
