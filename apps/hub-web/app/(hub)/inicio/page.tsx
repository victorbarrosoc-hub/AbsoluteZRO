import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, EmptyState, Notice, Pill, ProductMark, Stat } from '@zro/ui'
import { homeData } from '@/lib/data/hub'
import { ACCESS_LABEL, fmtDate, RUN_LABEL, RUN_TONE, STEP_LABEL, STEP_TONE } from '@/lib/labels'
import { requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Início' }

export default async function Inicio() {
  const auth = await requireOrgPage()
  const d = await homeData(auth)
  const contracted = d.access.filter((a) => a.access === 'contracted')
  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head__text">
          <p className="zro-eyebrow">{d.org?.name as string}</p>
          <h1>Olá, {auth.user.displayName.split(' ')[0] || 'tudo bem'}.</h1>
          <p>O que está em andamento e o que precisa de você.</p>
        </div>
        <Link className="zro-btn zro-btn--primary" href="/projetos/novo">
          Novo projeto
        </Link>
      </div>

      {!auth.user.emailVerified && (
        <Notice tone="warn" title="Confirme seu e-mail">
          Sem confirmar, você não aceita convites nem convida pessoas. <Link href="/perfil">Reenviar link</Link>
        </Notice>
      )}

      <div className="stats">
        <Card>
          <Stat label="Projetos ativos" value={d.counts.projects} />
        </Card>
        <Card>
          <Stat label="Etapas pedindo atenção" value={d.counts.attention} hint="Revisão ou falha" />
        </Card>
        <Card>
          <Stat label="Execuções na fila" value={d.counts.running} />
        </Card>
        <Card>
          <Stat label="Execuções paradas" value={d.counts.stuck} hint="Falha, revisão ou bloqueio" />
        </Card>
      </div>

      <div className="grid grid--2">
        <Card title="Projetos recentes" actions={<Link href="/projetos">Ver todos</Link>}>
          {d.projects.length ? (
            <ul className="list-plain">
              {d.projects.map((p) => (
                <li key={p.id as string} className="row row--between">
                  <Link href={`/projetos/${p.id}`}>{p.title as string}</Link>
                  <span className="zro-faint">{fmtDate(p.updated_at as Date)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Nenhum projeto ainda"
              action={
                <Link className="zro-btn zro-btn--primary zro-btn--small" href="/projetos/novo">
                  Criar o primeiro
                </Link>
              }
            >
              Crie do zero ou a partir de um job do Carro do Freela.
            </EmptyState>
          )}
        </Card>

        <Card title="Próximos passos" tone={d.attention.length ? 'attention' : 'default'}>
          {d.attention.length ? (
            <ul className="list-plain">
              {d.attention.map((a) => (
                <li key={`${a.project_id}-${a.step_key}`} className="row row--between">
                  <span>
                    <Link href={`/projetos/${a.project_id}#etapa-${a.step_key}`}>{a.title as string}</Link>{' '}
                    <span className="zro-faint">· {a.step_name as string}</span>
                  </span>
                  <Pill tone={STEP_TONE[a.state as string]}>{STEP_LABEL[a.state as string]}</Pill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="zro-mute">Nada pedindo revisão agora.</p>
          )}
        </Card>

        <Card title="Atividade" actions={<Link href="/atividades">Ver tudo</Link>}>
          {d.runs.length ? (
            <ul className="list-plain">
              {d.runs.map((r) => (
                <li key={r.id as string} className="row row--between">
                  <span className="zro-mute">
                    {r.handler as string}
                    {r.project_title ? ` · ${r.project_title as string}` : ''}
                  </span>
                  <Pill tone={RUN_TONE[r.status as string]}>{RUN_LABEL[r.status as string]}</Pill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="zro-mute">Nenhuma execução ainda.</p>
          )}
        </Card>

        <Card title="Consumo do plano neste mês" actions={<Link href="/assinatura">Detalhes</Link>}>
          {d.quotas.length ? (
            <ul className="list-plain">
              {d.quotas.map((q) => (
                <li key={q.metric as string} className="row row--between">
                  <code>{q.metric as string}</code>
                  <span>
                    {String(q.used)} de {q.limit_value == null ? 'limite não configurado' : String(q.limit_value)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="zro-mute">Sem consumo registrado neste mês.</p>
          )}
        </Card>
      </div>

      <Card title="Suas ferramentas" actions={<Link href="/ferramentas">Catálogo</Link>}>
        {contracted.length ? (
          <div className="grid">
            {contracted.map((a) => (
              <div key={a.productId} className="row">
                <ProductMark productId={a.productId} name={a.name} />
                <span>
                  <strong>{a.name}</strong>
                  <br />
                  <span className="zro-faint">{ACCESS_LABEL[a.access]}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="zro-mute">
            Nenhuma ferramenta contratada nesta organização. Você pode criar projetos e usar o HUB básico. <Link href="/planos">Ver planos</Link>
          </p>
        )}
      </Card>
    </div>
  )
}
