import type { Metadata } from 'next'
import Link from 'next/link'
import { motivoParaNaoAssinar, type AssinaturaPaga, type Nivel, type Preco } from '@zro/billing'
import { avatarVersion } from '@zro/core'
import { EmptyState, Notice, Pill } from '@zro/ui'
import { AccountFrame } from '@/components/account-frame'
import { ActionForm } from '@/components/action-form'
import { cancelPlanRequestAction, checkoutAction, planRequestAction, portalAction, recargaCheckoutAction } from '@/lib/actions/account'
import { ofertaPublica } from '@/lib/data/catalog'
import { planCenterData, planoDaPessoa } from '@/lib/data/hub'
import { brl, fmtDay, planoTexto } from '@/lib/labels'
import { db, requireOrgPage } from '@/lib/session'
import { stripeConfig } from '@/lib/stripe'

export const metadata: Metadata = { title: 'Plano' }

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'accent' }> = {
  active: { label: 'Ativo', tone: 'ok' },
  trialing: { label: 'Em teste', tone: 'accent' },
  past_due: { label: 'Pagamento pendente', tone: 'warn' },
}

const CICLOS = [
  ['mes', 'when-month'],
  ['ano', 'when-year'],
] as const

/** O preço do ciclo (o par de rádios da seção troca qual aparece). */
function PrecoCiclo({ mes, ano }: { mes: Preco | null; ano: Preco | null }) {
  return (
    <>
      <p className="plan-option__price when-month">{mes ? `${brl(mes.centavos)}/mês` : 'Só anual'}</p>
      <p className="plan-option__price when-year">{ano ? `${brl(ano.centavos)}/ano` : 'Só mensal'}</p>
    </>
  )
}

/**
 * Sua conta › Plano (ADR 0040): o plano de agora, mudar de plano (Órbita, Absoluto ou o Avulso de um app; mensal ou
 * anual) e as recargas da Z. Com as chaves do Stripe, "Assinar" leva ao checkout; sem elas, o pedido vai para a equipe.
 * O acesso só muda pelo webhook. Conta antiga (legado) segue com tudo liberado; as fases não aparecem.
 */
export default async function Plano({ searchParams }: { searchParams: Promise<{ assinatura?: string; recarga?: string; ciclo?: string; app?: string }> }) {
  const auth = await requireOrgPage()
  const [avatar, d, sp, plano, { oferta }] = await Promise.all([
    avatarVersion(db(), auth),
    planCenterData(auth),
    searchParams,
    planoDaPessoa(auth),
    ofertaPublica(),
  ])
  const online = stripeConfig() !== null
  const paid = d.subscriptions.filter((s) => s.kind !== 'free')
  const pagas: AssinaturaPaga[] = d.subscriptions
    .filter((s) => s.provider === 'stripe')
    .map((s) => ({ code: s.code as string, kind: s.kind as string, nivel: (s.nivel as Nivel) ?? null, products: [] }))
  const asked = new Set(d.requests.map((r) => `${r.kind}:${(r.code as string | null) ?? ''}`))
  const pedido = (p: Preco | null) => !!p && asked.has(`upgrade:${p.code}`)
  const anual = sp.ciclo === 'ano'
  const avulsoMes = oferta.avulsos[0]?.mes ?? null
  const avulsoAno = oferta.avulsos[0]?.ano ?? null
  const temAbsolutoPago = pagas.some((s) => s.kind === 'bundle' && s.nivel === 'absoluto')

  return (
    <AccountFrame auth={auth} avatar={avatar} title="Plano">
      <p className="zro-mute account-lede">
        {d.org.name}
        {plano ? (
          <>
            {' '}
            · <strong className="plan-chip">{planoTexto(plano)}</strong>
          </>
        ) : null}{' '}
        ·{' '}
        <Link href="/assinatura" className="zro-mute">
          ver consumo e limites
        </Link>
      </p>
      {sp.assinatura === 'ok' && (
        <Notice tone="ok" title="Pagamento enviado">
          Assim que o Stripe confirmar, o plano aparece aqui. Leva alguns segundos.
        </Notice>
      )}
      {sp.recarga === 'ok' && (
        <Notice tone="ok" title="Recarga a caminho">
          As mensagens entram assim que o pagamento confirmar.
        </Notice>
      )}
      {!d.canManage ? (
        <Notice title="Quem cuida da cobrança decide">Dono, administração e financeiro desta organização veem e mudam o plano.</Notice>
      ) : (
        <>
          <div className="plan-now">
            {d.subscriptions.length ? (
              d.subscriptions.map((s) => {
                const st = STATUS[s.status as string] ?? { label: s.status as string, tone: 'accent' as const }
                return (
                  <article key={s.id as string} className="plan-now__card">
                    <div className="row row--between">
                      <h2>{s.name as string}</h2>
                      {s.legado ? <Pill tone="ok">Tudo liberado</Pill> : <Pill tone={st.tone}>{st.label}</Pill>}
                    </div>
                    <p className="zro-mute">
                      {s.current_period_end ? `Vale até ${fmtDay(s.current_period_end as Date)}` : 'Sem data de término'}
                      {s.cancel_at_period_end ? ' · termina no fim do período' : ''}
                      {s.grace_until ? ` · carência até ${fmtDay(s.grace_until as Date)}` : ''}
                    </p>
                  </article>
                )
              })
            ) : (
              <EmptyState title="Sem plano ativo">A conta e o HUB continuam abertos.</EmptyState>
            )}
          </div>

          {pagas.length > 0 && online && (
            <ActionForm action={portalAction} submit="Gerenciar assinatura" variant="ghost" inlineSubmit>
              <span className="zro-faint">Cartão, notas, troca de ciclo e cancelamento.</span>
            </ActionForm>
          )}

          {!online &&
            paid.length > 0 &&
            (asked.has('renew:') ? (
              <Pill tone="accent">Renovação pedida</Pill>
            ) : (
              <ActionForm action={planRequestAction} submit="Pedir renovação" variant="primary" inlineSubmit>
                <input type="hidden" name="kind" value="renew" />
              </ActionForm>
            ))}

          {(oferta.pacotes.length > 0 || avulsoMes) && (
            <section id="assinar" className="stack pricing plan-shop" aria-labelledby="upgrade-title">
              <div className="row row--between">
                <h2 id="upgrade-title" className="account__subtitle">
                  Mudar de plano
                </h2>
                <fieldset className="cobranca cobranca--small">
                  <legend className="zro-sr-only">Cobrança</legend>
                  <input className="zro-sr-only" type="radio" name="ciclo" id="ciclo-mensal" defaultChecked={!anual} />
                  <label htmlFor="ciclo-mensal">Mensal</label>
                  <input className="zro-sr-only" type="radio" name="ciclo" id="ciclo-anual" defaultChecked={anual} />
                  <label htmlFor="ciclo-anual">Anual</label>
                </fieldset>
              </div>
              <div className="plan-options">
                {oferta.pacotes.map((p) => {
                  const ref = p.mes ?? p.ano!
                  const motivo = motivoParaNaoAssinar(pagas, { code: ref.code, kind: 'bundle', nivel: p.plano, products: p.apps })
                  const destaque = p.plano === 'orbita'
                  return (
                    <article key={p.plano} className={`plan-option${destaque ? ' plan-option--featured' : ''}`}>
                      <h3>{p.nome}</h3>
                      <PrecoCiclo mes={p.mes} ano={p.ano} />
                      <p className="zro-faint" title="Cada mensagem da Z conta uma. Acabou o mês, a franquia renova.">
                        {p.apps.length} apps{p.z ? ` · ${p.z.toLocaleString('pt-BR')} mensagens da Z/mês` : ''}
                      </p>
                      {motivo ? (
                        <span title={motivo}>
                          <Pill tone="ok">Já está no seu plano</Pill>
                        </span>
                      ) : (
                        CICLOS.map(([ciclo, cls]) => {
                          const preco = ciclo === 'mes' ? p.mes : p.ano
                          if (!preco) return null
                          if (online)
                            return (
                              <ActionForm
                                key={ciclo}
                                action={checkoutAction}
                                submit="Assinar"
                                className={`zro-form ${cls}`}
                                submitClass={`glass-btn glass-btn--small${destaque ? ' glass-btn--ink' : ''}`}
                              >
                                <input type="hidden" name="plano" value={p.plano} />
                                <input type="hidden" name="ciclo" value={ciclo} />
                              </ActionForm>
                            )
                          return pedido(preco) ? (
                            <span key={ciclo} className={cls}>
                              <Pill tone="accent">Pedido enviado</Pill>
                            </span>
                          ) : (
                            <ActionForm
                              key={ciclo}
                              action={planRequestAction}
                              submit="Pedir este plano"
                              className={`zro-form ${cls}`}
                              submitClass={`glass-btn glass-btn--small${destaque ? ' glass-btn--ink' : ''}`}
                            >
                              <input type="hidden" name="kind" value="upgrade" />
                              <input type="hidden" name="planId" value={preco.id} />
                            </ActionForm>
                          )
                        })
                      )}
                    </article>
                  )
                })}

                {avulsoMes && (
                  <article className="plan-option">
                    <h3>Avulso</h3>
                    <PrecoCiclo mes={avulsoMes} ano={avulsoAno} />
                    <p className="zro-faint" title="O Absoluto no app escolhido.">
                      1 app{oferta.avulsos[0]?.z ? ` · ${oferta.avulsos[0].z.toLocaleString('pt-BR')} mensagens da Z/mês` : ''}
                    </p>
                    {temAbsolutoPago ? (
                      <span title="O Absoluto que você assina já inclui todos os apps.">
                        <Pill tone="ok">Já está no seu plano</Pill>
                      </span>
                    ) : (
                      CICLOS.map(([ciclo, cls]) => {
                        const opcoes = oferta.avulsos.filter((a) => (ciclo === 'mes' ? a.mes : a.ano))
                        if (!opcoes.length) return null
                        return (
                          <ActionForm
                            key={ciclo}
                            action={online ? checkoutAction : planRequestAction}
                            submit={online ? 'Assinar' : 'Pedir este plano'}
                            className={`zro-form ${cls}`}
                            submitClass="glass-btn glass-btn--small"
                          >
                            <label className="zro-sr-only" htmlFor={`avulso-${ciclo}`}>
                              App do avulso
                            </label>
                            {online ? (
                              <>
                                <input type="hidden" name="plano" value="avulso" />
                                <input type="hidden" name="ciclo" value={ciclo} />
                                <select id={`avulso-${ciclo}`} name="app" className="zro-select" defaultValue={sp.app ?? opcoes[0]!.app}>
                                  {opcoes.map((a) => (
                                    <option key={a.app} value={a.app}>
                                      {a.nome}
                                    </option>
                                  ))}
                                </select>
                              </>
                            ) : (
                              <>
                                <input type="hidden" name="kind" value="upgrade" />
                                <select
                                  id={`avulso-${ciclo}`}
                                  name="planId"
                                  className="zro-select"
                                  defaultValue={(opcoes.find((a) => a.app === sp.app) ?? opcoes[0])![ciclo]!.id}
                                >
                                  {opcoes.map((a) => (
                                    <option key={a.app} value={a[ciclo]!.id}>
                                      {a.nome}
                                    </option>
                                  ))}
                                </select>
                              </>
                            )}
                          </ActionForm>
                        )
                      })
                    )}
                  </article>
                )}
              </div>
              {online ? (
                <p className="zro-faint" title="Trocar de plano é uma assinatura nova; a anterior se cancela em Gerenciar assinatura.">
                  Pagamento seguro pelo Stripe. Cancele quando quiser.
                </p>
              ) : (
                <p className="zro-faint" title="O pedido vai para a equipe Absolute ZRO, que libera o plano. O acesso só muda depois.">
                  Pagamento online ainda fechado: a equipe libera o pedido.
                </p>
              )}
            </section>
          )}

          {online && oferta.recargas.length > 0 && (
            <section className="stack" aria-labelledby="recargas-title">
              <div className="row row--between">
                <h2 id="recargas-title" className="account__subtitle">
                  Recargas da Z
                </h2>
                {d.recarga > 0 && <span className="zro-faint">Saldo: {d.recarga.toLocaleString('pt-BR')} mensagens</span>}
              </div>
              <div className="plan-options plan-options--recargas">
                {oferta.recargas.map((r) => (
                  <article key={r.code} className="plan-option" title={`Valem ${r.validade_meses} meses. Só gastam depois da franquia do mês.`}>
                    <h3>+{r.mensagens.toLocaleString('pt-BR')} mensagens</h3>
                    <p className="plan-option__price">{brl(r.centavos)}</p>
                    <ActionForm action={recargaCheckoutAction} submit="Comprar" submitClass="glass-btn glass-btn--small">
                      <input type="hidden" name="pacote" value={r.code} />
                    </ActionForm>
                  </article>
                ))}
              </div>
            </section>
          )}

          {d.requests.length > 0 && (
            <section className="stack" aria-labelledby="pedidos-title">
              <h2 id="pedidos-title" className="account__subtitle">
                Pedidos abertos
              </h2>
              <ul className="list-rows">
                {d.requests.map((r) => (
                  <li key={r.id as string} className="list-rows__item">
                    <span className="list-rows__main">
                      {r.kind === 'renew' ? 'Renovar' : `Upgrade para ${r.plan as string}`}
                      <span className="zro-faint"> · {fmtDay(r.created_at as Date)}</span>
                    </span>
                    <form action={cancelPlanRequestAction}>
                      <input type="hidden" name="requestId" value={r.id as string} />
                      <button className="zro-btn zro-btn--ghost zro-btn--small" type="submit">
                        Desistir
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </AccountFrame>
  )
}
