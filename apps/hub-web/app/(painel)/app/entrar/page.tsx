import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ConversaConta } from '@/components/conversa-conta'
import { GoogleButton } from '@/components/google-button'
import { loginAction } from '@/lib/actions/auth'
import { respondendoAcao } from '@/lib/actions/helpers'
import { googleErro } from '@/lib/google'
import { getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Entrar no app' }

/**
 * Login do app de computador e do app da Tela de Início: a mesma conversa do /entrar (o O de pontos ouvindo, e-mail,
 * senha, pronto), em tela cheia. A mesma conta Absolute ZRO; depois de entrar, volta para o painel (/app).
 */
export default async function EntrarNoApp({ searchParams }: { searchParams: Promise<{ erro?: string; senha?: string }> }) {
  const sp = await searchParams
  if ((await getAuth()) && !(await respondendoAcao())) redirect('/app')
  return (
    <div className="plogin">
      <ConversaConta
        modo="entrar"
        action={loginAction}
        next="/app"
        autoFocus
        destinoNome="seu painel"
        aviso={sp.senha === 'nova' ? 'Senha criada. Entre com ela.' : undefined}
        erroInicial={googleErro(sp.erro)}
        google={<GoogleButton next="/app" variant="pilula" />}
        rodape={
          <>
            Ainda não tem conta? <Link href="/criar-conta?next=%2Fapp">Criar conta</Link>
          </>
        }
      />
    </div>
  )
}
