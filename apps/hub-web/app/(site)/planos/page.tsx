import type { Metadata } from 'next'
import Link from 'next/link'
import { Notice, Pill } from '@zro/ui'
import { priceLabel, publicCatalog } from '@/lib/data/catalog'

export const metadata: Metadata = { title: 'Planos' }
export const dynamic = 'force-dynamic'

export default async function Planos() {
  const { products, plans } = await publicCatalog()
  const name = Object.fromEntries(products.map((p) => [p.id as string, p.name as string]))
  return (
    <section className="section section--page section--center" aria-labelledby="planos-title">
      <div className="section__head section__head--wide">
        <p className="zro-eyebrow">Planos</p>
        <h1 id="planos-title" className="display-2 atitle">
          <span className="atitle__thin">Uma ferramenta</span>
          <span className="atitle__bold">ou o ciclo inteiro.</span>
        </h1>
        <p>A conta é gratuita. Você contrata o que usa, e o mesmo login abre tudo o que foi contratado.</p>
      </div>
      <div className="plans-note">
        <Notice tone="neutral" title="Contratação online ainda fechada">
          Preços, teste grátis e forma de pagamento ainda não foram definidos. Por enquanto a liberação é feita pela equipe Absolute ZRO.
        </Notice>
      </div>
      <div className="plans">
        {plans.map((p) => {
          const featured = p.code === 'ciclo-do-o'
          const included = (p.products as { product_id: string }[]).map((x) => name[x.product_id] ?? x.product_id)
          return (
            <article key={p.id as string} className={`plan-card${featured ? ' plan-card--featured' : ''}`}>
              {featured ? <Pill tone="accent">Plano completo</Pill> : null}
              <h2>{p.name as string}</h2>
              <p className="plan-price">{priceLabel(p as never)}</p>
              <p className="zro-mute">{p.description as string}</p>
              {included.length > 0 ? (
                <ul className="list-plain">
                  {included.map((n) => (
                    <li key={n}>✓ {n}</li>
                  ))}
                </ul>
              ) : (
                <p className="zro-faint">Conta, painel, organização e catálogo.</p>
              )}
              {featured && <p className="zro-faint">AI Edit e Revela entram no Ciclo do O só depois de lançados.</p>}
              <Link
                className={`zro-btn${featured ? ' zro-btn--primary' : ''}`}
                href={p.kind === 'free' ? '/criar-conta' : 'mailto:zro.contato@gmail.com?subject=Absolute%20ZRO%20-%20' + encodeURIComponent(String(p.name))}
              >
                {p.kind === 'free' ? 'Criar conta' : 'Falar com a equipe'}
              </Link>
            </article>
          )
        })}
      </div>
      <p className="zro-faint plans-foot">Limites de armazenamento, processamento e assentos aparecem aqui quando forem definidos para cada plano.</p>
    </section>
  )
}
