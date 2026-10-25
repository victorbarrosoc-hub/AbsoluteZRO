import type { Metadata } from 'next'
import Link from 'next/link'
import { listMyOrganizations } from '@zro/core'
import { Card, Field, Notice } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { resendVerifyAction } from '@/lib/actions/auth'
import { createOrgAction } from '@/lib/actions/org'
import { db, requirePageAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Boas-vindas' }
export const dynamic = 'force-dynamic'

export default async function BoasVindas() {
  const auth = await requirePageAuth()
  const orgs = await listMyOrganizations(db(), auth)
  return (
    <section className="section" aria-labelledby="bv-title">
      <div className="section__head">
        <p className="zro-eyebrow">Boas-vindas</p>
        <h1 id="bv-title">Olá, {auth.user.displayName.split(' ')[0] || 'tudo bem'}.</h1>
        <p>Projetos, equipe e plano ficam numa organização. Pode ser só você, uma equipe ou uma empresa.</p>
      </div>
      {!auth.user.emailVerified && (
        <Notice tone="warn" title="Confirme seu e-mail">
          <ActionForm action={resendVerifyAction} submit="Reenviar link" variant="ghost">
            <span className="zro-faint">Sem confirmar, não dá para aceitar convites nem convidar pessoas.</span>
          </ActionForm>
        </Notice>
      )}
      <Card title="Criar organização">
        <ActionForm action={createOrgAction} submit="Criar e continuar">
          <Field label="Nome" htmlFor="name" hint="Ex.: o nome da produtora ou o seu nome.">
            <input className="zro-input" id="name" name="name" required maxLength={120} />
          </Field>
          <Field label="Tipo" htmlFor="kind">
            <select className="zro-select" id="kind" name="kind" defaultValue="team">
              <option value="person">Só eu</option>
              <option value="team">Equipe</option>
              <option value="company">Empresa</option>
            </select>
          </Field>
        </ActionForm>
      </Card>
      {orgs.length > 0 && (
        <p className="zro-faint">
          Você já participa de {orgs.length} organização(ões). <Link href="/inicio">Ir para o HUB</Link>
        </p>
      )}
      <p className="zro-faint">Recebeu um convite? Abra o link do convite para entrar na equipe.</p>
    </section>
  )
}
