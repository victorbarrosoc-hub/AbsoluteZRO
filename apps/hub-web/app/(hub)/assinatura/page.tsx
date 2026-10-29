import type { Metadata } from 'next'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { EmptyState, Pill, ProductMark } from '@zro/ui'
import { productColor } from '@/components/app-tile'
import { Anel, nivel } from '@/components/consumo/anel'
import { Contagem } from '@/components/consumo/contagem'
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
const SOURCE: Record<string, string> = { subscription: 'Assinatura', trial: 'Teste', admin_grant: 'Concessão da equipe' }

/** Nome humano de cada métrica medida (as chaves vêm dos limites dos planos). */
const METRICA: Record<string, { nome: string; unidade: string }> = {
  'zro.ai_credits': { nome: 'Créditos de IA e GPU', unidade: 'créditos' },
  'sobedesce.manifest_imports': { nome: 'Importações de descarga · SOBEDESCE', unidade: 'importações' },
  'synquei.organization_plans': { nome: 'Planos de organização · Synquei', unidade: 'planos' },
}
const nomeDe = (m: string) => METRICA[m]?.nome ?? m
const unidadeDe = (m: string) => METRICA[m]?.unidade ?? 'usos'
const DIA_UTC = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const QUANDO = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * Consumo como num app de assinatura bom de usar (Claude, Higgsfield): o que resta em destaque, um anel que enche, a
 * contagem até renovar o mês e o plano, o uso de cada dia num gráfico que se toca e as últimas operações. Tudo vem do
 * banco (cotas, limites dos planos e eventos de uso); nada é estimado. Não há limite por sessão: só o mês e o plano.
 */
export default async function Assinatura() {
  const auth = await requireOrgPage()
  const d = await subscriptionData(auth)
  const credito = d.metricas.find((m) => m.metric === 'zro.ai_credits') ?? null
  const outras = d.metricas.filter((m) => m.metric !== 'zro.ai_credits')
  const fimDoMes = d.period.end.toISOString()
  const assinatura = d.subscriptions.find((s) => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due') ?? null

  // uso por dia do mês (soma de todas as métricas), para o gráfico
  const diasNoMes = Math.round((d.period.end.getTime() - d.period.start.getTime()) / 86_400_000)
  const porDia = new Array<number>(diasNoMes).fill(0)
  for (const r of d.diario) {
    const i = new Date(r.dia as string).getUTCDate() - 1
    if (i >= 0 && i < diasNoMes) porDia[i] = (porDia[i] ?? 0) + Number(r.total)
  }
  const maxDia = Math.max(1, ...porDia)
  const hoje = new Date().getUTCDate() - 1
  const totalMes = porDia.reduce((a, b) => a + b, 0)

  return (
    <div className="page uso">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Assinatura e consumo</h1>
          <p>Quanto resta, quando renova e o que já foi usado.</p>
        </div>
        <Link className="glass-btn" href="/planos">
          Ver planos
        </Link>
      </div>

      {/* o principal: créditos de IA e GPU */}
      <section
        className="uso-hero"
        aria-labelledby="uso-creditos"
        data-nivel={credito?.limit ? nivel(Math.min(100, (credito.used / credito.limit) * 100)) : undefined}
      >
        <Anel used={credito?.used ?? 0} limit={credito?.limit ?? null} rotulo="restantes" />
        <div className="uso-hero__texto">
          <p className="uso-hero__rotulo">Este mês</p>
          <h2 id="uso-creditos">Créditos de IA e GPU</h2>
          <p className="uso-hero__apoio" title="Usar as ferramentas no dia a dia é livre. Só o que roda IA ou processa em GPU gasta créditos.">
            {credito ? `${credito.used.toLocaleString('pt-BR')} usados` : 'Nenhum crédito no plano'} · uso comum é livre
          </p>
          <Contagem ate={fimDoMes} className="uso-renova" />
        </div>
      </section>

      <div className="uso-grade">
        {/* o plano */}
        <section className="uso-cartao uso-plano" aria-labelledby="uso-plano">
          <p className="uso-hero__rotulo">Plano</p>
          {d.canSeeBilling ? (
            assinatura ? (
              <>
                <h2 id="uso-plano">
                  {assinatura.plan_name as string}{' '}
                  <Pill tone={assinatura.status === 'active' ? 'ok' : assinatura.status === 'past_due' ? 'warn' : 'neutral'}>
                    {SUB_STATUS[assinatura.status as string]}
                  </Pill>
                </h2>
                {assinatura.current_period_end ? (
                  <>
                    <Contagem ate={(assinatura.current_period_end as Date).toISOString()} className="uso-renova" />
                    <p className="zro-faint">
                      {assinatura.cancel_at_period_end ? 'Termina' : 'Renova'} em {fmtDay(assinatura.current_period_end as Date)}
                      {assinatura.grace_until ? ` · carência até ${fmtDay(assinatura.grace_until as Date)}` : ''}
                    </p>
                  </>
                ) : (
                  <p className="uso-renova">Sem data de término</p>
                )}
              </>
            ) : (
              <>
                <h2 id="uso-plano">Conta gratuita</h2>
                <p className="zro-faint">Sem assinatura nesta organização.</p>
              </>
            )
          ) : (
            <>
              <h2 id="uso-plano">Da organização</h2>
              <p className="zro-faint">Quem cuida da cobrança vê o plano e as datas.</p>
            </>
          )}
        </section>

        {/* as outras cotas, cada uma numa barra */}
        <section className="uso-cartao" aria-labelledby="uso-cotas">
          <p className="uso-hero__rotulo">Cotas do mês</p>
          <h2 id="uso-cotas" className="zro-sr-only">
            Cotas do mês
          </h2>
          {outras.length ? (
            <ul className="uso-barras">
              {outras.map((m, i) => {
                const pct = m.limit ? Math.min(100, (m.used / m.limit) * 100) : 0
                return (
                  <li key={m.metric} style={{ '--i': i, '--pct': pct / 100 } as CSSProperties} data-nivel={nivel(pct)}>
                    <span className="uso-barras__nome">{nomeDe(m.metric)}</span>
                    <span className="uso-barras__valor">
                      {m.used.toLocaleString('pt-BR')}
                      {m.limit != null ? ` de ${m.limit.toLocaleString('pt-BR')}` : ' · sem limite configurado'}
                    </span>
                    <i aria-hidden="true" />
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="zro-faint">Nenhuma outra cota neste plano.</p>
          )}
        </section>
      </div>

      {/* uso por dia no mês: toque ou passe o mouse num dia */}
      <section className="uso-cartao" aria-labelledby="uso-dias">
        <div className="row row--between">
          <div>
            <p className="uso-hero__rotulo">Uso por dia</p>
            <h2 id="uso-dias" className="uso-total">
              {totalMes.toLocaleString('pt-BR')} <span>neste mês</span>
            </h2>
          </div>
          <span className="zro-faint">
            {DIA_UTC.format(d.period.start)} a {DIA_UTC.format(new Date(d.period.end.getTime() - 1))}
          </span>
        </div>
        <ol className="uso-dias" aria-label="Uso por dia">
          {porDia.map((v, i) => (
            <li
              key={i}
              tabIndex={0}
              data-hoje={i === hoje ? 'sim' : undefined}
              data-futuro={i > hoje ? 'sim' : undefined}
              data-valor={`Dia ${i + 1}: ${v.toLocaleString('pt-BR')}`}
              aria-label={`Dia ${i + 1}: ${v.toLocaleString('pt-BR')}`}
              style={{ '--h': v / maxDia, '--i': i } as CSSProperties}
            >
              <i />
            </li>
          ))}
        </ol>
      </section>

      <div className="uso-grade">
        {/* ferramentas liberadas */}
        <section className="uso-cartao" aria-labelledby="uso-apps">
          <p className="uso-hero__rotulo">Ferramentas liberadas</p>
          <h2 id="uso-apps" className="zro-sr-only">
            Ferramentas liberadas
          </h2>
          {d.entitlements.length ? (
            <ul className="uso-apps">
              {d.entitlements.map((e) => (
                <li key={e.id as string} style={productColor(e.product_id as string)}>
                  <ProductMark productId={e.product_id as string} name={e.name as string} size={36} />
                  <span>
                    <strong>{e.name as string}</strong>
                    <span className="zro-faint">
                      {SOURCE[e.source as string] ?? (e.source as string)} · {e.ends_at ? `até ${fmtDay(e.ends_at as Date)}` : 'sem término'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhuma ferramenta liberada">A conta e o HUB continuam disponíveis.</EmptyState>
          )}
          {d.access.some((a) => a.access !== 'contracted') && (
            <ul className="uso-fora">
              {d.access
                .filter((a) => a.access !== 'contracted')
                .map((a) => (
                  <li key={a.productId}>
                    <span>{a.name}</span>
                    <Pill tone="neutral">{ACCESS_LABEL[a.access]}</Pill>
                  </li>
                ))}
            </ul>
          )}
        </section>

        {/* últimas operações medidas */}
        <section className="uso-cartao" aria-labelledby="uso-recentes">
          <p className="uso-hero__rotulo">Últimos usos</p>
          <h2 id="uso-recentes" className="zro-sr-only">
            Últimos usos
          </h2>
          {d.recentes.length ? (
            <ul className="uso-recentes">
              {d.recentes.map((r, i) => (
                <li key={i}>
                  <span>
                    <strong>{nomeDe(r.metric as string)}</strong>
                    <span className="zro-faint">
                      {(r.display_name as string) || 'Alguém da equipe'} · {QUANDO.format(r.created_at as Date)}
                    </span>
                  </span>
                  <span className="uso-recentes__qtd">
                    −{Number(r.amount).toLocaleString('pt-BR')} <span>{unidadeDe(r.metric as string)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="zro-faint">Nada medido ainda. Quando uma ferramenta usar IA ou GPU, aparece aqui.</p>
          )}
        </section>
      </div>

      <p className="uso-nota zro-faint" title="O acesso só é liberado por assinatura confirmada ou concessão registrada.">
        Para contratar ou mudar de plano, fale com a equipe Absolute ZRO.
      </p>
    </div>
  )
}
