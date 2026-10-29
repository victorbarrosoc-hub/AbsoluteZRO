import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { providerLabel } from '@zro/billing'
import { consoleOverview, PEOPLE_SEGMENTS, peopleSummary, requirePlatformAdmin, type PeopleSegment } from '@zro/core'
import { Pill, ProductMark } from '@zro/ui'
import { BILLING_EVENT_LABEL, BILLING_STATUS, Funnel } from '@/components/admin-people'
import { OnlineAgora } from '@/components/admin/online-agora'
import { Bars30, Fold, HBars, Kpi, SegmentBar } from '@/components/admin/parts'
import { fmtAgo, fmtBytes, fmtDate, RUN_LABEL } from '@/lib/labels'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Console', robots: { index: false, follow: false } }

const KIND_LABEL: Record<string, string> = { bundle: 'pacote', team: 'equipe', individual: 'avulso', free: 'grátis' }

export default async function Admin() {
  const auth = await getAuth()
  // Layout e página renderizam em paralelo no Next: a página confere por conta própria.
  if (!auth?.user.platformRole || !auth.user.emailVerified) notFound()
  requirePlatformAdmin(auth, ['admin', 'support'])
  const d = await db().asSystem('admin: visão geral', async (tx) => ({
    o: await consoleOverview(tx),
    funnel: (await peopleSummary(tx)).funnel,
    stuck:
      await tx`select r.id, r.handler, r.status, r.last_error, r.updated_at, o.name as org from zro.workflow_runs r join zro.organizations o on o.id = r.org_id where r.status in ('dead_letter', 'requires_review', 'failed') order by r.updated_at desc limit 20`,
    billing: await tx`select provider, provider_event_id, type, status, error, received_at from zro.billing_events order by received_at desc limit 20`,
  }))
  const { o } = d
  const attention = [
    o.attention.planRequests && {
      href: '/admin/planos#pedidos',
      text: `${o.attention.planRequests} ${o.attention.planRequests === 1 ? 'pedido' : 'pedidos'} de plano`,
    },
    o.attention.stuckRuns && { href: '#saude', text: `${o.attention.stuckRuns} ${o.attention.stuckRuns === 1 ? 'execução parada' : 'execuções paradas'}` },
    o.attention.billingFailed && {
      href: '#saude',
      text: `${o.attention.billingFailed} ${o.attention.billingFailed === 1 ? 'cobrança falhou' : 'cobranças falharam'}`,
    },
  ].filter(Boolean) as { href: string; text: string }[]
  const segments = (Object.keys(PEOPLE_SEGMENTS) as PeopleSegment[]).map((k) => ({
    key: k,
    label: PEOPLE_SEGMENTS[k].label,
    hint: PEOPLE_SEGMENTS[k].hint,
    n: o.segments[k],
    href: `/admin/pessoas?seg=${k}`,
  }))

  return (
    <div className="page adm-page">
      <header className="adm-head">
        <h1>Visão geral</h1>
        <p>Quem está aqui agora, de onde veio e o que usa.</p>
      </header>

      <div className="adm-hero">
        <OnlineAgora initial={o.online} />
        <div className="kpis">
          <Kpi i={0} label="Pessoas" value={o.accounts.toLocaleString('pt-BR')} hint={`+${o.new7} em 7 dias`} href="/admin/pessoas" />
          <Kpi i={1} label="Novas em 30 dias" value={o.new30.toLocaleString('pt-BR')} href="/admin/pessoas?o=recentes" />
          <Kpi i={2} label="Ativas em 7 dias" value={o.active7.toLocaleString('pt-BR')} hint="HUB ou apps" href="/admin/pessoas?o=acesso" />
          <Kpi
            i={3}
            label="Créditos de IA"
            value={o.ai.credits30.toLocaleString('pt-BR')}
            hint={o.ai.people30 ? `${o.ai.people30} ${o.ai.people30 === 1 ? 'pessoa' : 'pessoas'} · 30 dias` : 'nos últimos 30 dias'}
          />
        </div>
      </div>

      <div className={`adm-attention${attention.length ? '' : ' adm-attention--ok'}`} role="status">
        {attention.length ? (
          attention.map((a) => (
            <Link key={a.text} href={a.href} className="adm-chip adm-chip--warn">
              {a.text}
            </Link>
          ))
        ) : (
          <span className="adm-chip adm-chip--ok">Tudo em dia</span>
        )}
      </div>

      <section className="adm-card" aria-labelledby="segmentos">
        <h2 id="segmentos">Ecossistema ou avulso</h2>
        <SegmentBar segments={segments} />
      </section>

      <div className="adm-grid">
        <section className="adm-card" aria-labelledby="cadastros">
          <h2 id="cadastros">
            Cadastros <span className="adm-card__aside">30 dias</span>
          </h2>
          <Bars30 label="Cadastros" unit={['cadastro', 'cadastros']} series={o.series.map((s) => ({ day: s.day, n: s.signups }))} />
        </section>
        <section className="adm-card" aria-labelledby="ia">
          <h2 id="ia">
            Créditos de IA <span className="adm-card__aside">30 dias</span>
          </h2>
          <Bars30 label="Créditos de IA gastos" unit={['crédito', 'créditos']} series={o.series.map((s) => ({ day: s.day, n: s.aiCredits }))} />
        </section>
      </div>

      <div className="adm-grid">
        <section className="adm-card" aria-labelledby="por-plano">
          <h2 id="por-plano">Por plano</h2>
          <HBars
            items={o.plans.map((p) => ({
              key: `${p.name}-${p.kind}`,
              label: p.name,
              n: p.people,
              hint: `Plano ${KIND_LABEL[p.kind] ?? p.kind}`,
            }))}
            empty="Nenhuma assinatura viva."
          />
        </section>
        <section className="adm-card" aria-labelledby="por-app">
          <h2 id="por-app">
            Por app <span className="adm-card__aside">já entraram</span>
          </h2>
          <HBars
            items={o.products
              .filter((p) => p.people)
              .map((p) => ({
                key: p.id,
                label: p.name,
                n: p.people,
                href: `/admin/pessoas?produto=${p.id}`,
                icon: <ProductMark productId={p.id} name={p.name} size={22} />,
                hint: `${p.active7} nos últimos 7 dias`,
              }))}
            empty="Ninguém entrou num app pelo login único ainda."
          />
        </section>
      </div>

      <div className="kpis kpis--soft">
        <Kpi label="Arquivos nos projetos" value={o.files.count.toLocaleString('pt-BR')} hint={o.files.count ? fmtBytes(o.files.bytes) : 'nenhum ainda'} />
      </div>

      <Fold title="Do cadastro ao uso" meta="funil">
        <Funnel steps={d.funnel} />
      </Fold>

      <Fold
        id="saude"
        title="Saúde"
        meta={d.stuck.length ? <Pill tone="warn">{d.stuck.length} parada(s)</Pill> : <Pill tone="ok">Fila em dia</Pill>}
        open={d.stuck.length > 0}
      >
        <div className="adm-grid">
          <div>
            <h3 className="adm-sub">Execuções paradas</h3>
            {d.stuck.length ? (
              <ul className="adm-rows">
                {d.stuck.map((r) => (
                  <li key={r.id as string} title={(r.last_error as string) ?? undefined}>
                    <strong>{r.org as string}</strong>
                    <span className="zro-faint">
                      {RUN_LABEL[r.status as string]} · {fmtAgo(r.updated_at as Date)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adm-empty">Nada parado.</p>
            )}
          </div>
          <div>
            <h3 className="adm-sub">Cobrança</h3>
            {d.billing.length ? (
              <ul className="adm-rows">
                {d.billing.map((b) => (
                  <li key={`${b.provider}-${b.provider_event_id}`} title={b.error ? String(b.error) : undefined}>
                    <span>
                      {BILLING_EVENT_LABEL[b.type as string] ?? 'Evento de cobrança'} <span className="zro-faint">· {providerLabel(b.provider as string)}</span>
                    </span>
                    <span className="row">
                      <Pill tone={b.status === 'processed' ? 'ok' : b.status === 'failed' ? 'danger' : 'neutral'}>
                        {BILLING_STATUS[b.status as string] ?? (b.status as string)}
                      </Pill>
                      <span className="zro-faint" title={fmtDate(b.received_at as Date)}>
                        {fmtAgo(b.received_at as Date)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adm-empty">Nenhum evento recebido.</p>
            )}
          </div>
        </div>
      </Fold>
    </div>
  )
}
