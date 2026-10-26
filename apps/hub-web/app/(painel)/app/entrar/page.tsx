import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Field, Notice, ZroWordmark } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { BrandSymbol } from '@/components/brand-symbol'
import { GoogleButton } from '@/components/google-button'
import { loginAction } from '@/lib/actions/auth'
import { getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Entrar no app' }

const ERROS: Record<string, string> = {
  google: 'Não deu para entrar com o Google. Tente de novo.',
  google_cancelado: 'Entrada com o Google cancelada.',
  google_email: 'Seu e-mail no Google ainda não está confirmado.',
  suspensa: 'Esta conta está suspensa. Fale com o suporte.',
}

/**
 * Login do app de computador: o símbolo se desenha à esquerda (a estrela aparece inteira e recolhe) e o cartão de
 * entrar sobe à direita. A mesma conta Absolute ZRO; depois de entrar, volta para o painel (/app).
 */
export default async function EntrarNoApp({ searchParams }: { searchParams: Promise<{ erro?: string; senha?: string }> }) {
  const sp = await searchParams
  if (await getAuth()) redirect('/app')
  return (
    <div className="plogin">
      <section className="plogin__marca" aria-hidden="true">
        <span className="plogin__halo" />
        <BrandSymbol className="plogin__simbolo" />
        <ZroWordmark className="plogin__nome" height={26} title="" />
        <p className="plogin__frase">O futuro começa do zero.</p>
      </section>
      <section className="plogin__cartao" aria-labelledby="entrar-titulo">
        <h1 id="entrar-titulo" className="plogin__titulo">
          <span>Bem-vindo</span> <strong>de volta.</strong>
        </h1>
        <p className="plogin__apoio">Uma conta para todas as ferramentas.</p>
        {sp.senha === 'nova' && <Notice tone="ok" title="Senha criada. Entre com ela." />}
        {sp.erro && <Notice tone="danger" title={ERROS[sp.erro] ?? ERROS.google!} />}
        <GoogleButton next="/app" />
        <ActionForm action={loginAction} submit="Entrar">
          <input type="hidden" name="next" value="/app" />
          <Field label="E-mail" htmlFor="email">
            <input className="zro-input" id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </Field>
          <Field label="Senha" htmlFor="password">
            <input className="zro-input" id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
        </ActionForm>
        <div className="plogin__links">
          <Link href="/esqueci-a-senha">Esqueci a senha</Link>
          <Link href="/criar-conta?next=%2Fapp">Criar conta</Link>
        </div>
      </section>
    </div>
  )
}
