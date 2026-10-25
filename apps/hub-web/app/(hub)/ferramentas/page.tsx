import type { Metadata } from 'next'
import Link from 'next/link'
import { productAccessFor, type ProductAccess } from '@zro/billing'
import { authorize } from '@zro/core'
import { adapterFor } from '@zro/integrations'
import { Card, Pill, ProductMark } from '@zro/ui'
import { fmtDay } from '@/lib/labels'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Ferramentas' }

function ProductCard({ p }: { p: ProductAccess }) {
  const a = adapterFor(p.productId)
  return (
    <Card>
      <div className="product-card">
        <ProductMark productId={p.productId} name={p.name} size={40} />
        <div className="product-card__body">
          <h3>
            {p.name}
            {p.provisionalName && <span className="zro-faint"> · nome provisório</span>}
          </h3>
          <p className="zro-mute">{p.roleInFlow}</p>
          {a && (
            <details className="disclosure">
              <summary>O que o HUB faz com {p.name}</summary>
              <ul className="list-plain">
                {a.hubCan.map((x) => (
                  <li key={x}>✓ {x}</li>
                ))}
                {a.notYet.map((x) => (
                  <li key={x} className="zro-faint">
                    ○ Ainda não: {x}
                  </li>
                ))}
              </ul>
              <p className="zro-faint">Estratégia: {a.strategy}</p>
            </details>
          )}
        </div>
        <div className="product-card__foot">
          {p.access === 'contracted' ? (
            <>
              <Pill tone="ok">Contratada{p.endsAt ? ` até ${fmtDay(p.endsAt)}` : ''}</Pill>
              {p.externalUrl && (
                <a className="zro-btn zro-btn--small" href={p.externalUrl} target="_blank" rel="noopener noreferrer">
                  Abrir (login próprio)
                </a>
              )}
            </>
          ) : p.access === 'available' ? (
            <>
              <Pill>{p.stage === 'beta' ? 'Beta · ' : ''}Disponível para contratar</Pill>
              <Link className="zro-btn zro-btn--small zro-btn--ghost" href="/planos">
                Ver planos
              </Link>
            </>
          ) : (
            <Pill tone="faint">Em desenvolvimento</Pill>
          )}
        </div>
      </div>
    </Card>
  )
}

export default async function Ferramentas() {
  const auth = await requireOrgPage()
  const actor = await authorize(db(), auth)
  const access = await db().asUser({ userId: actor.userId, orgId: actor.orgId }, (tx) => productAccessFor(tx, actor.orgId))
  const groups: [string, ProductAccess[]][] = [
    ['Contratadas', access.filter((a) => a.access === 'contracted')],
    ['Disponíveis para contratar', access.filter((a) => a.access === 'available')],
    ['Em desenvolvimento', access.filter((a) => a.access === 'coming_soon')],
  ]
  return (
    <div className="page">
      <div className="page-head__text">
        <h1>Ferramentas</h1>
        <p>As marcas continuam com o próprio app e login. O HUB liga os dados pelo projeto, sem expor nada do que não foi contratado.</p>
      </div>
      {groups.map(([title, items]) => (
        <section key={title} className="section" aria-label={title}>
          <h2>{title}</h2>
          {items.length ? (
            <div className="grid">
              {items.map((p) => (
                <ProductCard key={p.productId} p={p} />
              ))}
            </div>
          ) : (
            <p className="zro-faint">Nenhuma.</p>
          )}
        </section>
      ))}
    </div>
  )
}
