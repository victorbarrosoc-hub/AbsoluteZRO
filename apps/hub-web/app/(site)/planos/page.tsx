import type { Metadata } from 'next'
import Link from 'next/link'
import { ProductMark } from '@zro/ui'
import { productColor } from '@/components/app-tile'
import { AvulsoSeletor } from '@/components/avulso-seletor'
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

/** Real sem centavos quando o valor é redondo (R$ 449, R$ 1.499), como numa etiqueta de preço. */
const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })

/**
 * Planos sem truque: o Avulso é uma janela só, em que a pessoa marca um ou mais apps e o valor vai somando; ao lado,
 * os pacotes. Enquanto as vendas não abrem (decisão do titular, 26/10/2026), tudo está liberado e os botões levam a
 * baixar; com as vendas, a assinar. Mensal/Anual é um par de rádios só em CSS (globals.css, .pricing).
 */
export default async function Planos() {
  const { products, plans, sales } = await publicCatalog()
  const all = plans as unknown as Row[]
  const vendas = stripeConfig() !== null && sales.launched
  const productName = Object.fromEntries(products.map((p) => [p.id as string, p.name as string]))
  const disponiveis = products.filter((p) => p.stage === 'active' || p.stage === 'beta').map((p) => p.id as string)
  const yearOf = (code: string) => all.find((p) => p.code === `${code}-anual` && p.price_cents != null)?.price_cents ?? null
  const monthly = all.filter((p) => p.price_cents != null && p.billing_interval === 'month')
  const singles = monthly.filter((p) => p.kind === 'individual')
  const singlePrice = Object.fromEntries(singles.flatMap((p) => p.products.map((x) => [x.product_id, p.price_cents as number])))
  const avulsoMes = singles.length ? Math.min(...singles.map((p) => p.price_cents as number)) : null
  const anos = singles.map((p) => yearOf(p.code)).filter((v): v is number => v != null)
  const avulsoAno = anos.length ? Math.min(...anos) : null
  const avulsoCreditos = Math.max(0, ...singles.map((p) => p.ai_credits ?? 0))
  const pacotes = monthly.filter((x) => x.kind === 'bundle').sort((a, b) => (a.price_cents as number) - (b.price_cents as number))
  const completo = pacotes.find((p) => p.code === 'ciclo-do-o') ?? null
  const economia = (mes: number, ano: number | null) => (ano ? Math.round(((mes * 12 - ano) / (mes * 12)) * 100) : 0)
  const melhor = Math.max(0, avulsoMes ? economia(avulsoMes, avulsoAno) : 0, ...pacotes.map((p) => economia(p.price_cents as number, yearOf(p.code))))
  const free = all.find((p) => p.kind === 'free')
  const nomeDe = (id: string) => productName[id] ?? id

  return (
    <section className="section section--page section--center pricing" aria-labelledby="planos-title">
      <div className="section__head section__head--wide">
        <p className="zro-eyebrow">Planos</p>
        <h1 id="planos-title" className="display-2 atitle">
          <span className="atitle__thin">Escolha seus apps.</span>
          <span className="atitle__bold">Ou leve todos.</span>
        </h1>
        <p>Uma conta abre tudo. Você paga só o que usa.</p>
      </div>
      {!vendas && (
        <p className="pricing__livre" role="note">
          <strong>Por enquanto, tudo liberado.</strong> Escolha e baixe.
        </p>
      )}

      {(avulsoMes || pacotes.length > 0) && (
        <>
          <fieldset className="cycle">
            <legend className="zro-sr-only">Cobrança</legend>
            <input className="zro-sr-only" type="radio" name="ciclo" id="ciclo-mensal" defaultChecked />
            <label htmlFor="ciclo-mensal">Mensal</label>
            <input className="zro-sr-only" type="radio" name="ciclo" id="ciclo-anual" />
            <label htmlFor="ciclo-anual">Anual{melhor > 0 && <span className="cycle__save">até −{melhor}%</span>}</label>
          </fieldset>

          <div className="tiers">
            {avulsoMes && (
              <article className="tier tier--avulso" aria-labelledby="tier-avulso">
                <header className="tier__head">
                  <h2 id="tier-avulso">Avulso</h2>
                  <p className="tier__tag">Só os apps que você escolher.</p>
                </header>
                <AvulsoSeletor
                  apps={disponiveis.map((id) => ({ id, name: nomeDe(id), color: productColor(id) }))}
                  mes={avulsoMes}
                  ano={avulsoAno}
                  completoMes={completo?.price_cents ?? null}
                  completoAno={completo ? yearOf(completo.code) : null}
                  creditos={avulsoCreditos}
                  vendas={vendas}
                />
              </article>
            )}

            {pacotes.map((p) => {
              const mes = p.price_cents as number
              const ano = yearOf(p.code)
              const apps = p.products.map((x) => x.product_id)
              const soma = apps.reduce((s, id) => s + (singlePrice[id] ?? avulsoMes ?? 0), 0)
              const destaque = p.code === 'ciclo-do-o'
              const nome = p.name.replace(/^Absolute ZRO\s+/, '')
              return (
                <article key={p.code} className={`tier${destaque ? ' tier--featured' : ''}`} aria-labelledby={`tier-${p.code}`}>
                  <header className="tier__head">
                    <h2 id={`tier-${p.code}`}>{nome}</h2>
                    <p className="tier__tag">{p.description}</p>
                  </header>

                  <div className="tier__price when-month">
                    <span className="tier__amount">{brl(mes)}</span>
                    <span className="tier__per">/mês</span>
                  </div>
                  <div className="tier__price when-year">
                    {ano ? (
                      <>
                        <span className="tier__amount">{brl(ano)}</span>
                        <span className="tier__per">/ano</span>
                      </>
                    ) : (
                      <span className="tier__per">Só mensal</span>
                    )}
                  </div>
                  <p className="tier__sub when-month">{ano ? `ou ${brl(ano)} por ano` : ' '}</p>
                  <p className="tier__sub when-year">
                    {ano ? (
                      <>
                        {brl(Math.round(ano / 12))}/mês · <strong>economize {brl(mes * 12 - ano)}</strong>
                      </>
                    ) : (
                      ' '
                    )}
                  </p>

                  {(p.ai_credits ?? 0) > 0 && (
                    <p className="tier__credits" title="Uso comum é livre. Só IA e processamento em GPU gastam créditos, que renovam todo mês.">
                      <strong>{(p.ai_credits ?? 0).toLocaleString('pt-BR')}</strong>
                      <span>créditos de IA e GPU por mês</span>
                    </p>
                  )}

                  <div className="tier__apps">
                    <p className="tier__label">{apps.length} ferramentas</p>
                    <ul aria-label="Ferramentas incluídas">
                      {apps.map((id) => (
                        <li key={id} title={nomeDe(id)}>
                          <ProductMark productId={id} name={nomeDe(id)} size={34} />
                          <span className="zro-sr-only">{nomeDe(id)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {apps.length > 1 && soma > mes && (
                    <p className="tier__note">
                      Os {apps.length} avulsos somariam {brl(soma)}/mês.
                    </p>
                  )}

                  <Link className={`glass-btn tier__cta${destaque ? ' glass-btn--ink' : ''}`} href={vendas ? '/perfil/plano' : '/baixar#absolute-zro'}>
                    {vendas ? 'Assinar' : 'Baixar tudo'}
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
          <Link className="glass-btn" href="/criar-conta">
            Criar conta
          </Link>
        </div>
      )}

      <details className="pricing__more">
        <summary>Como funcionam os créditos</summary>
        <p>
          Usar as ferramentas no dia a dia é livre. Só o que roda IA ou processa em GPU gasta créditos. Eles renovam todo mês, e cada plano mostra o quanto
          inclui.
        </p>
      </details>
    </section>
  )
}
