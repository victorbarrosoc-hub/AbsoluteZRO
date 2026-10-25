import type { Metadata } from 'next'
import Link from 'next/link'
import { getProject, listProjects } from '@zro/core'
import { productAccessFor } from '@zro/billing'
import { Card, EmptyState } from '@zro/ui'
import { CycleO } from '@/components/cycle-o'
import { ACCESS_LABEL } from '@/lib/labels'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Ciclo do O' }

export default async function Ciclo({ searchParams }: { searchParams: Promise<{ projeto?: string }> }) {
  const auth = await requireOrgPage()
  const sp = await searchParams
  const { projects, actor } = await listProjects(db(), auth)
  const selected = projects.find((p) => p.id === sp.projeto) ?? projects[0]
  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Ciclo do O</h1>
          <p>Cada segmento é uma etapa com estado real. Clique para abrir a etapa no projeto. Comece por onde fizer sentido.</p>
        </div>
        {projects.length > 1 && (
          <form className="row">
            <label className="zro-faint" htmlFor="sel-projeto">
              Projeto
            </label>
            <select className="zro-select" id="sel-projeto" name="projeto" defaultValue={selected?.id as string}>
              {projects.map((p) => (
                <option key={p.id as string} value={p.id as string}>
                  {p.title as string}
                </option>
              ))}
            </select>
            <button className="zro-btn zro-btn--small" type="submit">
              Ver
            </button>
          </form>
        )}
      </div>
      {selected ? <ProjectCycle id={selected.id as string} /> : <OrgCycle orgId={actor.orgId} />}
    </div>
  )

  async function ProjectCycle({ id }: { id: string }) {
    const { project, steps } = await getProject(db(), auth, id)
    const done = steps.filter((s) => s.displayState === 'done').length
    return (
      <Card tone="stage" title={project.title as string} actions={<Link href={`/projetos/${id}`}>Abrir projeto</Link>}>
        <CycleO
          labelledBy="ciclo-sel"
          title={project.title as string}
          subtitle={`${done} etapa(s) concluída(s)`}
          steps={steps.map((s) => ({ key: s.stepKey, name: s.name, role: s.roleInFlow, state: s.displayState, href: `/projetos/${id}#etapa-${s.stepKey}` }))}
        />
        <span id="ciclo-sel" className="zro-sr-only">
          Ciclo do O do projeto {project.title as string}
        </span>
      </Card>
    )
  }

  async function OrgCycle({ orgId }: { orgId: string }) {
    const access = await db().asUser({ userId: auth.user.id, orgId }, (tx) => productAccessFor(tx, orgId))
    return (
      <>
        <Card tone="stage" title="As ferramentas da sua organização">
          <CycleO
            labelledBy="ciclo-org"
            title="Ciclo do O"
            subtitle="Nenhum projeto ainda"
            steps={access.map((a) => ({
              key: a.productId,
              name: a.name,
              role: a.roleInFlow,
              state: a.access === 'contracted' ? 'ready' : a.access === 'available' ? 'blocked_subscription' : 'unavailable',
              label: ACCESS_LABEL[a.access],
              href: '/ferramentas',
            }))}
          />
          <span id="ciclo-org" className="zro-sr-only">
            Ferramentas por etapa
          </span>
        </Card>
        <EmptyState
          title="Crie um projeto para ver o estado de cada etapa"
          action={
            <Link className="zro-btn zro-btn--primary zro-btn--small" href="/projetos/novo">
              Novo projeto
            </Link>
          }
        />
      </>
    )
  }
}
