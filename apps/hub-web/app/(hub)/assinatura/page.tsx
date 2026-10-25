import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, EmptyState, Notice, Pill } from '@zro/ui'
import { subscriptionData } from '@/lib/data/hub'
import { ACCESS_LABEL, fmtDay } from '@/lib/labels'
import { requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Assinatura e consumo' }

const SUB_STATUS: Record<string, string> = {
  incomplete: 'Incompleta',
  trialing: 'Em teste',
  active: 'Ativa',
  past_due: 'Pagamento pendente',
  canceled: 'Cancelada',
  expired: 'Expirada',
}
const SOURCE: Record<string, string> = { subscription: 'Assinatura', trial: 'Teste', admin_grant: 'Concessão da equipe Absolute ZRO' }

export default async function Assinatura() {
  const auth = await requireOrgPage()
  const d = await subscriptionData(auth)
  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Assinatura e consumo</h1>
          <p>O que a organização pode usar agora, até quando, e quanto já usou neste mês.</p>
        </div>
        <Link className="zro-btn zro-btn--primary" href="/planos">
          Ver planos
        </Link>
      </div>
      <Notice tone="accent" title="Contratação e upgrade">
        O provedor de pagamento ainda não foi escolhido. Para contratar ou mudar de plano, fale com a equipe Absolute ZRO. Acesso só é liberado por assinatura
        confirmada ou concessão registrada, nunca pela tela de pagamento.
      </Notice>

      <Card title="Ferramentas liberadas">
        {d.entitlements.length ? (
          <div className="zro-table-wrap">
            <table className="zro-table">
              <thead>
                <tr>
                  <th>Ferramenta</th>
                  <th>Origem</th>
                  <th>Até</th>
                  <th>Limites</th>
                </tr>
              </thead>
              <tbody>
                {d.entitlements.map((e) => (
                  <tr key={e.id as string}>
                    <td>
                      <strong>{e.name as string}</strong>
                      {e.features ? <div className="zro-faint">só: {(e.features as string[]).join(', ')}</div> : null}
                    </td>
                    <td>{SOURCE[e.source as string] ?? (e.source as string)}</td>
                    <td>{e.ends_at ? fmtDay(e.ends_at as Date) : 'sem data de término'}</td>
                    <td className="zro-mono zro-faint">{Object.keys(e.limits as object).length ? JSON.stringify(e.limits) : 'não configurados'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nenhuma ferramenta liberada">A conta e o HUB básico continuam disponíveis.</EmptyState>
        )}
        <ul className="list-plain">
          {d.access
            .filter((a) => a.access !== 'contracted')
            .map((a) => (
              <li key={a.productId} className="row row--between">
                <span>{a.name}</span>
                <Pill tone={a.access === 'coming_soon' ? 'faint' : 'neutral'}>{ACCESS_LABEL[a.access]}</Pill>
              </li>
            ))}
        </ul>
      </Card>

      <Card title="Consumo do mês" eyebrow={`${fmtDay(d.period.start)} a ${fmtDay(new Date(d.period.end.getTime() - 1))}`}>
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
          <p className="zro-faint">
            Nenhuma operação medida neste mês. Operações medidas sem limite configurado ficam bloqueadas até a equipe definir o limite.
          </p>
        )}
      </Card>

      {d.canSeeBilling ? (
        <Card title="Assinaturas">
          {d.subscriptions.length ? (
            <ul className="list-plain">
              {d.subscriptions.map((s) => (
                <li key={s.id as string} className="row row--between">
                  <span>
                    <strong>
                      {s.plan_name as string} v{String(s.version)}
                    </strong>{' '}
                    <span className="zro-faint">via {s.provider as string}</span>
                  </span>
                  <span className="row">
                    <Pill tone={s.status === 'active' ? 'ok' : s.status === 'past_due' ? 'warn' : 'neutral'}>{SUB_STATUS[s.status as string]}</Pill>
                    <span className="zro-faint">
                      {s.current_period_end ? `período até ${fmtDay(s.current_period_end as Date)}` : 'sem data de término'}
                      {s.cancel_at_period_end ? ' · cancela no fim do período' : ''}
                      {s.grace_until ? ` · carência até ${fmtDay(s.grace_until as Date)}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="zro-faint">Nenhuma assinatura. A organização usa a conta gratuita.</p>
          )}
        </Card>
      ) : (
        <p className="zro-faint">Detalhes de cobrança aparecem para dono, administração e financeiro.</p>
      )}
    </div>
  )
}
