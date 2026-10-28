import type { Metadata } from 'next'
import { PASSWORD_MIN } from '@zro/auth'
import { Field } from '@zro/ui'
import { CampoSenha } from '@zro/ui/senha'
import { ActionForm } from '@/components/action-form'
import { resetAction } from '@/lib/actions/auth'

export const metadata: Metadata = { title: 'Criar nova senha' }

export default async function Redefinir({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams
  return (
    <>
      <div className="stack">
        <h1>Criar nova senha</h1>
        <p className="zro-mute">Depois de salvar, todas as sessões abertas são encerradas.</p>
      </div>
      <ActionForm action={resetAction} submit="Salvar nova senha">
        <input type="hidden" name="token" value={token} />
        <Field label="Nova senha" htmlFor="password" hint={`Pelo menos ${PASSWORD_MIN} caracteres.`}>
          <CampoSenha className="zro-input" id="password" name="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
        </Field>
      </ActionForm>
    </>
  )
}
