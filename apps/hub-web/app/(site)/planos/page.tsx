import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, Notice, Pill } from '@zro/ui'
import { priceLabel, publicCatalog } from '@/lib/data/catalog'

export const metadata: Metadata = { title: 'Planos' }
export const dynamic = 'force-dynamic'

export default async function Planos() {
  const { products, plans } = await publicCatalog()
  const name = Object.fromEntries(products.map((p) => [p.id as string, p.name as string]))
  return (
    <section className="section section--page" aria-labelledby="planos-title">
      <div className="section__head">
        <p className="zro-eyebrow">Planos</p>
        <h1 id="planos-title" className="display-2">
          Uma ferramenta ou o ciclo inteiro.
        </h1>
        <p>A conta é gratuita. Você contrata o que usa, e o mesmo login abre tudo o que foi contratado.</p>
      </div>
      <Notice tone="accent" title="Contratação online ainda fechada">
        Preços, teste grátis e forma de pagamento ainda não foram definidos. Por enquanto a liberação é feita pela equipe Absolute ZRO.
      </Notice>
      <div className="grid">
        {plans.map((p) => {
          const featured = p.code === 'ciclo-do-o'
          const included = (p.products as { product_id: string }[]).map((x) => name[x.product_id] ?? x.product_id)
          return (
            <Card key={p.id as string}>
              <div className={`plan-card${featured ? ' plan-card--featured' : ''}`}>
                <div className="row row--between">
                  <h2>{p.name as string}</h2>
                  {featured && <Pill tone="accent">Plano completo</Pill>}
                </div>
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
                {featured && <p className="zro-faint">AI Edit e Finishing entram no Ciclo do O só depois de lançados.</p>}
                <Link
                  className={`zro-btn ${featured ? 'zro-btn--primary' : 'zro-btn--ghost'}`}
                  href={p.kind === 'free' ? '/criar-conta' : 'mailto:zro.contato@gmail.com?subject=Absolute%20ZRO%20-%20' + encodeURIComponent(String(p.name))}
                >
                  {p.kind === 'free' ? 'Criar conta' : 'Falar com a equipe'}
                </Link>
              </div>
            </Card>
          )
        })}
      </div>
      <p className="zro-faint">Limites de armazenamento, processamento e assentos aparecem aqui quando forem definidos para cada plano.</p>
    </section>
  )
}
