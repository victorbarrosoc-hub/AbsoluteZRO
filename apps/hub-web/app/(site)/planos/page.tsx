import type { Metadata } from 'next'
import Link from 'next/link'
import { Notice, ProductMark } from '@zro/ui'
import { publicCatalog } from '@/lib/data/catalog'
import { stripeConfig } from '@/lib/stripe'

export const metadata: Metadata = { title: 'Planos' }
export const dynamic = 'force-dynamic'

type Row = Record<string, unknown> & {
  code: string
  name: string
  kind: string
  price_cents: number | null
  currency: string | null
  billing_interval: string | null
  description: string
  ai_credits: number | null
  products: { product_id: string }[]
}

type Tier = {
  key: string
  name: string
  tagline: string
  month: number
  year: number | null
  /** Preços diferentes entre as ferramentas avulsas: o cartão mostra "a partir de". */
  from: boolean
  credits: number
  apps: string[]
  featured: boolean
  pickOne: boolean
}

/** Real sem centavos quando o valor é redondo (R$ 449, R$ 1.499), como numa etiqueta de preço. */
const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })

const EMAIL = 'mailto:zro.contato@gmail.com?subject='

/**
 * Planos sem truque: o preço que se paga, o total do ano, quanto o anual economiza de verdade e a soma dos avulsos
 * ao lado do Completo. Nada de "de R$", contagem regressiva ou selo inventado. Mensal/Anual é um par de rádios só
 * em CSS (globals.css, .pricing), então funciona sem JavaScript.
 */
export default async function Planos() {
  const { products, plans, sales } = await publicCatalog()
  const all = plans as unknown as Row[]
  const online = stripeConfig() !== null
  const productName = Object.fromEntries(products.map((p) => [p.id as string, p.name as string]))
  const yearOf = (code: string) => all.find((p) => p.code === `${code}-anual` && p.price_cents != null)?.price_cents ?? null
  const monthly = all.filter((p) => p.price_cents != null && p.billing_interval === 'month')
  const singles = monthly.filter((p) => p.kind === 'individual')
  const singlePrice = Object.fromEntries(singles.flatMap((p) => p.products.map((x) => [x.product_id, p.price_cents as number])))

  const tiers: Tier[] = []
  if (singles.length > 0) {
    const prices = singles.map((p) => p.price_cents as number)
    const years = singles.map((p) => yearOf(p.code)).filter((v): v is number => v != null)
    tiers.push({
      key: 'avulso',
      name: 'Avulso',
      tagline: 'Uma ferramenta, à sua escolha.',
      month: Math.min(...prices),
      year: years.length ? Math.min(...years) : null,
      from: new Set(prices).size > 1,
      credits: Math.max(0, ...singles.map((p) => p.ai_credits ?? 0)),
      apps: singles.flatMap((p) => p.products.map((x) => x.product_id)),
      featured: false,
      pickOne: true,
    })
  }
  for (const p of monthly.filter((x) => x.kind === 'bundle').sort((a, b) => (a.price_cents as number) - (b.price_cents as number))) {
    tiers.push({
      key: p.code,
      name: p.name.replace(/^Absolute ZRO\s+/, ''),
      tagline: p.description,
      month: p.price_cents as number,
      year: yearOf(p.code),
      from: false,
      credits: p.ai_credits ?? 0,
      apps: p.products.map((x) => x.product_id),
      featured: p.code === 'ciclo-do-o',
      pickOne: false,
    })
  }
  const bestYearly = Math.max(0, ...tiers.map((t) => (t.year ? Math.round(((t.month * 12 - t.year) / (t.month * 12)) * 100) : 0)))
  const free = all.find((p) => p.kind === 'free')

  return (
    <section className="section section--page section--center pricing" aria-labelledby="planos-title">
      <div className="section__head section__head--wide">
        <p className="zro-eyebrow">Planos</p>
        <h1 id="planos-title" className="display-2 atitle">
          <span className="atitle__thin">Uma ferramenta</span>
          <span className="atitle__bold">ou o ciclo inteiro.</span>
        </h1>
        <p>Uma conta abre tudo. Você paga só o que usa.</p>
      </div>
      {!online && (
        <div className="plans-note">
          <Notice tone="neutral" title="Contratação online ainda fechada">
            Por enquanto a liberação é feita pela equipe Absolute ZRO.
          </Notice>
        </div>
      )}
      {online && sales.launched && sales.trialDays > 0 && (
        <p className="zro-faint plans-foot">Conta nova ganha {sales.trialDays} dias do Completo, sem cartão.</p>
      )}

      {tiers.length > 0 && (
        <>
          <fieldset className="cycle">
            <legend className="zro-sr-only">Cobrança</legend>
            <input className="zro-sr-only" type="radio" name="ciclo" id="ciclo-mensal" defaultChecked />
            <label htmlFor="ciclo-mensal">Mensal</label>
            <input className="zro-sr-only" type="radio" name="ciclo" id="ciclo-anual" />
            <label htmlFor="ciclo-anual">Anual{bestYearly > 0 && <span className="cycle__save">até −{bestYearly}%</span>}</label>
          </fieldset>

          <div className="tiers">
            {tiers.map((t) => {
              const yearSave = t.year ? t.month * 12 - t.year : 0
              // Só faz sentido comparar com a soma dos avulsos quando ela passa do preço do plano.
              const sumSingles = t.pickOne ? 0 : t.apps.reduce((s, id) => s + (singlePrice[id] ?? 0), 0)
              const countSingles = t.pickOne ? 0 : t.apps.filter((id) => singlePrice[id]).length
              return (
                <article key={t.key} className={`tier${t.featured ? ' tier--featured' : ''}`} aria-labelledby={`tier-${t.key}`}>
                  <header className="tier__head">
                    <h2 id={`tier-${t.key}`}>{t.name}</h2>
                    <p className="tier__tag">{t.tagline}</p>
                  </header>

                  <div className="tier__price when-month">
                    {t.from && <span className="tier__from">a partir de</span>}
                    <span className="tier__amount">{brl(t.month)}</span>
                    <span className="tier__per">/mês</span>
                  </div>
                  {t.year ? (
                    <div className="tier__price when-year">
                      {t.from && <span className="tier__from">a partir de</span>}
                      <span className="tier__amount">{brl(t.year)}</span>
                      <span className="tier__per">/ano</span>
                    </div>
                  ) : (
                    <div className="tier__price when-year">
                      <span className="tier__per">Só mensal</span>
                    </div>
                  )}
                  <p className="tier__sub when-month">{t.year ? `ou ${brl(t.year)} por ano` : '\u00a0'}</p>
                  <p className="tier__sub when-year">
                    {t.year ? (
                      <>
                        {brl(Math.round(t.year / 12))}/mês · <strong>economize {brl(yearSave)}</strong>
                      </>
                    ) : (
                      '\u00a0'
                    )}
                  </p>

                  {t.credits > 0 && (
                    <p className="tier__credits" title="Uso comum é livre. Só IA e processamento em GPU gastam créditos, que renovam todo mês.">
                      <strong>{t.credits.toLocaleString('pt-BR')}</strong>
                      <span>créditos de IA e GPU por mês</span>
                    </p>
                  )}

                  <div className="tier__apps">
                    <p className="tier__label">{t.pickOne ? 'Escolha uma' : `${t.apps.length} ferramentas`}</p>
                    <ul aria-label={t.pickOne ? 'Ferramentas disponíveis' : 'Ferramentas incluídas'}>
                      {t.apps.map((id) => (
                        <li key={id} title={productName[id] ?? id}>
                          <ProductMark productId={id} name={productName[id] ?? id} size={34} />
                          <span className="zro-sr-only">{productName[id] ?? id}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {countSingles > 1 && sumSingles > t.month && (
                    <p className="tier__note">
                      Os {countSingles} avulsos somam {brl(sumSingles)}/mês.
                    </p>
                  )}
                  {t.featured && <p className="tier__note">AI Edit e Revela entram quando lançarem.</p>}

                  <Link
                    className={`zro-btn tier__cta${t.featured ? ' zro-btn--primary' : ''}`}
                    href={online ? '/perfil/plano' : EMAIL + encodeURIComponent(`Absolute ZRO - ${t.name}`)}
                  >
                    {online ? 'Assinar' : 'Falar com a equipe'}
                  </Link>
                </article>
              )
            })}
          </div>
        </>
      )}

      {free && (
        <div className="tier-free">
          <div>
            <h2>{free.name}</h2>
            <p className="zro-mute">{free.description}</p>
          </div>
          <Link className="zro-btn" href="/criar-conta">
            Criar conta
          </Link>
        </div>
      )}

      <details className="pricing__more">
        <summary>Como funcionam os créditos</summary>
        <p>
          Usar as ferramentas no dia a dia é livre. Só o que roda IA ou processa em GPU gasta créditos. Eles renovam todo mês, e cada plano mostra o quanto
          inclui. Limites de armazenamento e assentos aparecem aqui quando forem definidos.
        </p>
      </details>
    </section>
  )
}
