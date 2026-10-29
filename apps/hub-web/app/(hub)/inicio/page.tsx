import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { Card, EmptyState, Notice, Pill, ProductMark, Stat, ZroSymbol } from '@zro/ui'
import { AppTile, productColor } from '@/components/app-tile'
import { EsqueletoPaineis } from '@/components/esqueleto'
import { Icon, type IconName } from '@/components/icons'
import { MotionGate } from '@/components/motion-gate'
import { homePaineis, homeTopo } from '@/lib/data/hub'
import { fmtDate, PROJECT_STATUS_LABEL, RUN_LABEL, RUN_TONE, STEP_LABEL, STEP_TONE } from '@/lib/labels'
import { requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Início' }

function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(now))
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

const QUICK: { href: string; title: string; hint: string; icon: IconName; color: string }[] = [
  { href: '/projetos/novo', title: 'Novo projeto', hint: 'Comece do zero', icon: 'plus', color: 'var(--zro-blue)' },
  { href: '/projetos', title: 'Importar descarga', hint: 'Resumo do SOBEDESCE', icon: 'upload', color: 'var(--p-sobedesce)' },
  { href: '/ciclo', title: 'Ciclo do O', hint: 'Onde cada projeto está', icon: 'cycle', color: 'var(--p-synquei-2)' },
  { href: '/equipe', title: 'Convidar equipe', hint: 'Papéis por pessoa', icon: 'team', color: 'var(--p-carro-do-freela)' },
]

type Acesso = Awaited<ReturnType<typeof homeTopo>>['access']

export default async function Inicio() {
  const auth = await requireOrgPage()
  // As duas partes saem juntas; a página espera só o topo e os painéis chegam no próprio esqueleto (streaming).
  const paineis = homePaineis(auth)
  paineis.catch(() => {}) // o erro, se houver, aparece onde a parte é lida (Paineis), não como rejeição solta
  const d = await homeTopo(auth)
  const first = auth.user.displayName.split(' ')[0] || 'tudo bem'
  const latest = d.latest
  // Contratadas primeiro; fechadas pelo gate de lançamento (ADR 0023) por último, só com o selo, e fora da órbita.
  const peso = (a: (typeof d.access)[number]) => (a.access === 'contracted' ? 0 : a.access === 'closed' ? 2 : 1)
  const apps = [...d.access].sort((a, b) => peso(a) - peso(b) || a.stepOrder - b.stepOrder)
  const orbit = d.access.filter((a) => a.access !== 'closed').sort((a, b) => a.stepOrder - b.stepOrder)
  // "De um job" só quando o Carro do Freela está aberto para a pessoa (gate de lançamento); fechado, nada de prometer.
  const comJob = orbit.some((a) => a.productId === 'carro-do-freela')
  const atalhos = QUICK.map((q) => (q.href === '/projetos/novo' && comJob ? { ...q, hint: 'Do zero ou de um job' } : q))
  return (
    <div className="page">
      <header className="greet">
        <p className="zro-eyebrow">
          {greeting()} · {d.org?.name as string}
        </p>
        <h1>
          <span className="atitle__thin">Olá,</span> {first}.
        </h1>
        <p className="zro-mute">O que está em andamento e o que precisa de você.</p>
      </header>

      {!auth.user.emailVerified && (
        <Notice tone="warn" title="Confirme seu e-mail">
          Sem confirmar, você não aceita convites nem convida pessoas. <Link href="/perfil/seguranca">Reenviar link</Link>
        </Notice>
      )}

      <section className="zro-card zro-card--stage home-hero" aria-labelledby="hero-title">
        <MotionGate className="orbit" as="div">
          <div className="orbit__ring" aria-hidden="true" />
          <div className="orbit__core" aria-hidden="true">
            <ZroSymbol size={64} animated />
          </div>
          <ul className="orbit__items" aria-label="Ferramentas do Ciclo do O">
            {orbit.map((p, i) => (
              <li key={p.productId} style={{ ...productColor(p.productId), ['--i' as string]: i, ['--n' as string]: orbit.length }} title={p.name}>
                <ProductMark productId={p.productId} name={p.name} size={44} />
                <span className="zro-sr-only">{p.name}</span>
              </li>
            ))}
          </ul>
        </MotionGate>
        <div className="home-hero__text">
          {latest ? (
            <>
              <p className="zro-eyebrow">Continue de onde parou</p>
              <h2 id="hero-title" className="home-hero__title">
                {latest.title as string}
              </h2>
              <p className="zro-mute">
                {PROJECT_STATUS_LABEL[latest.status as string] ?? (latest.status as string)} · atualizado em {fmtDate(latest.updated_at as Date)}
              </p>
              <div className="row">
                <Link className="zro-btn zro-btn--primary" href={`/projetos/${latest.id}`}>
                  Abrir projeto
                  <Icon name="arrow" />
                </Link>
                <Link className="zro-btn" href="/projetos/novo">
                  <Icon name="plus" />
                  Novo projeto
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="zro-eyebrow">Primeiro passo</p>
              <h2 id="hero-title" className="home-hero__title">
                <span className="atitle__thin">Toda história</span> começa do zero.
              </h2>
              <p className="zro-mute">Crie um projeto e ligue roteiro, backup, organização, som e entrega no mesmo lugar.</p>
              <div className="row">
                <Link className="zro-btn zro-btn--primary" href="/projetos/novo">
                  <Icon name="plus" />
                  Criar o primeiro projeto
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      <nav className="quick" aria-label="Atalhos">
        {atalhos.map((q) => (
          <Link key={q.title} href={q.href} className="quick__tile" style={{ ['--c' as string]: q.color }}>
            <span className="quick__icon">
              <Icon name={q.icon} />
            </span>
            <span className="quick__text">
              <strong>{q.title}</strong>
              <span>{q.hint}</span>
            </span>
          </Link>
        ))}
      </nav>

      <Suspense fallback={<EsqueletoPaineis />}>
        <Paineis dados={paineis} apps={apps} comJob={comJob} />
      </Suspense>
    </div>
  )
}

/** Números, painéis e apps: a parte do Início que espera o banco (com o esqueleto da mesma forma enquanto isso). */
async function Paineis({ dados, apps, comJob }: { dados: ReturnType<typeof homePaineis>; apps: Acesso; comJob: boolean }) {
  const d = await dados
  return (
    <div className="inicio-paineis">
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
            <ul className="list-rows">
              {d.projects.map((p) => (
                <li key={p.id as string}>
                  <Link href={`/projetos/${p.id}`} className="list-rows__link">
                    <span className="list-rows__icon" aria-hidden="true">
                      <Icon name="projects" />
                    </span>
                    <span className="list-rows__main">{p.title as string}</span>
                    <span className="zro-faint">{fmtDate(p.updated_at as Date)}</span>
                  </Link>
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
              {comJob ? 'Crie do zero ou a partir de um job do Carro do Freela.' : 'Crie o primeiro e ligue as etapas.'}
            </EmptyState>
          )}
        </Card>

        <Card title="Próximos passos" tone={d.attention.length ? 'attention' : 'default'}>
          {d.attention.length ? (
            <ul className="list-rows">
              {d.attention.map((a) => (
                <li key={`${a.project_id}-${a.step_key}`}>
                  <Link href={`/projetos/${a.project_id}#etapa-${a.step_key}`} className="list-rows__link">
                    <ProductMark productId={a.step_key as string} name={a.step_name as string} size={28} />
                    <span className="list-rows__main">
                      {a.title as string} <span className="zro-faint">· {a.step_name as string}</span>
                    </span>
                    <Pill tone={STEP_TONE[a.state as string]}>{STEP_LABEL[a.state as string]}</Pill>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="zro-mute">Nada pedindo revisão agora.</p>
          )}
        </Card>

        <Card title="Atividade" actions={<Link href="/atividades">Ver tudo</Link>}>
          {d.runs.length ? (
            <ul className="list-rows">
              {d.runs.map((r) => (
                <li key={r.id as string} className="list-rows__item">
                  <span className="list-rows__icon" aria-hidden="true">
                    <Icon name="activity" />
                  </span>
                  <span className="list-rows__main zro-mute">
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
            <ul className="meters">
              {d.quotas.map((q) => {
                const used = Number(q.used)
                const limit = q.limit_value == null ? null : Number(q.limit_value)
                const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
                return (
                  <li key={q.metric as string}>
                    <div className="row row--between">
                      <code>{q.metric as string}</code>
                      <span>
                        {used} de {limit == null ? 'limite não configurado' : limit}
                      </span>
                    </div>
                    {limit != null && (
                      <div className="meter" role="img" aria-label={`${used} de ${limit} usados`}>
                        <span style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="zro-mute">Sem consumo registrado neste mês.</p>
          )}
        </Card>
      </div>

      <section className="section" aria-labelledby="apps-title">
        <div className="section-bar">
          <h2 id="apps-title">Seus apps</h2>
          <Link href="/ferramentas">Ver catálogo</Link>
        </div>
        <div className="app-grid">
          {apps.map((p) => (
            <AppTile key={p.productId} p={p} compact />
          ))}
        </div>
      </section>
    </div>
  )
}
