import type { Metadata } from 'next'
import { Card, Field } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { createProjectAction } from '@/lib/actions/project'
import { requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Novo projeto' }

const TYPES = ['casamento', 'institucional', 'comercial', 'documentário', 'aftermovie', 'show', 'videoclipe', 'conteúdo', 'outro']

export default async function NovoProjeto() {
  await requireOrgPage()
  return (
    <div className="page">
      <div className="page-head__text">
        <h1>Novo projeto</h1>
        <p>As etapas podem ser feitas em qualquer ordem.</p>
      </div>
      <div className="grid">
        <Card title="Do zero">
          <ActionForm action={createProjectAction} submit="Criar projeto">
            <Field label="Nome" htmlFor="title">
              <input className="zro-input" id="title" name="title" required maxLength={160} />
            </Field>
            <Field label="Tipo de produção" htmlFor="type">
              <select className="zro-select" id="type" name="type" defaultValue="outro">
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cliente (opcional)" htmlFor="client">
              <input className="zro-input" id="client" name="client" maxLength={200} />
            </Field>
            <Field label="Quem vê" htmlFor="visibility" hint="Restrito: só dono, administração, gestão e quem você adicionar.">
              <select className="zro-select" id="visibility" name="visibility" defaultValue="organization">
                <option value="organization">Toda a organização</option>
                <option value="restricted">Restrito</option>
              </select>
            </Field>
          </ActionForm>
        </Card>
      </div>
    </div>
  )
}
