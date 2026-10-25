import type { Metadata } from 'next'
import { Card, Field } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { createProjectAction, importCarroJobAction } from '@/lib/actions/project'
import { requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Novo projeto' }

const TYPES = ['casamento', 'institucional', 'comercial', 'documentário', 'aftermovie', 'show', 'videoclipe', 'conteúdo', 'outro']

const EXAMPLE = JSON.stringify(
  {
    contract: 'carro-do-freela.job/1',
    job_id: 'job-123',
    title: 'Casamento Ana e Leo',
    production_type: 'casamento',
    briefing: 'Cerimônia e festa.',
    dates: [{ date: '2026-11-21' }],
    crew_roles: [{ role: 'Câmera', count: 2 }],
  },
  null,
  2,
)

export default async function NovoProjeto() {
  await requireOrgPage()
  return (
    <div className="page">
      <div className="page-head__text">
        <h1>Novo projeto</h1>
        <p>Comece do zero ou a partir de um job. As etapas podem ser feitas em qualquer ordem.</p>
      </div>
      <div className="grid grid--2">
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
        <Card title="A partir de um job do Carro do Freela" eyebrow="Contrato carro-do-freela.job/1">
          <p className="zro-mute">O Carro do Freela ainda não envia jobs sozinho. Cole o job no formato do contrato; o mesmo job nunca cria dois projetos.</p>
          <ActionForm action={importCarroJobAction} submit="Criar a partir do job" variant="ghost">
            <Field label="Job (JSON)" htmlFor="job">
              <textarea className="zro-textarea" id="job" name="job" required defaultValue={EXAMPLE} />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </div>
  )
}
